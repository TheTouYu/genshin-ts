import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'
import ts from 'typescript'

import { existsDir, existsFile, loadGstsConfig } from './config_loader.js'
import type { GstsConfig } from './gsts_config.js'
import { hasNodeGraphEntryCall, transformToGs } from './ts_to_gs_transform/index.js'
import { isServerOnCall } from './ts_to_gs_transform/matcher.js'

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function hasGlobMeta(p: string): boolean {
  return /[*?[\]{}]/.test(p)
}

function isEligibleInputTsFile(p: string): boolean {
  if (!p.endsWith('.ts')) return false
  if (p.endsWith('.d.ts')) return false
  if (p.endsWith('.gs.ts')) return false
  return true
}

function normForMap(p: string): string {
  const abs = path.resolve(p).replace(/\\/g, '/')
  return ts.sys.useCaseSensitiveFileNames ? abs : abs.toLowerCase()
}

function isGstsServerName(name: string | undefined): boolean {
  return !!name && name.startsWith('gstsServer')
}

function isFunctionInitializer(
  expr: ts.Expression | undefined
): expr is ts.FunctionExpression | ts.ArrowFunction {
  return !!expr && (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr))
}

function isTimerCall(expr: ts.CallExpression): boolean {
  const callee = expr.expression
  if (ts.isIdentifier(callee)) {
    return callee.text === 'setTimeout' || callee.text === 'setInterval'
  }
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'globalThis'
  ) {
    return callee.name.text === 'setTimeout' || callee.name.text === 'setInterval'
  }
  return false
}

function countTimersInSourceFile(sf: ts.SourceFile, checker: ts.TypeChecker): number {
  let count = 0
  const visit = (node: ts.Node, inServerCtx: boolean) => {
    if (ts.isCallExpression(node)) {
      if (inServerCtx && isTimerCall(node)) count += 1
      if (isServerOnCall(node, checker) && node.arguments.length >= 2) {
        const handler = node.arguments[1]
        visit(node.expression, inServerCtx)
        node.arguments.forEach((arg, idx) => {
          if (idx === 1 && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
            visit(arg, true)
          } else {
            visit(arg, inServerCtx)
          }
        })
        return
      }
    }

    if (ts.isFunctionDeclaration(node) && isGstsServerName(node.name?.text)) {
      if (node.body) visit(node.body, true)
      return
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (isGstsServerName(node.name.text) && isFunctionInitializer(node.initializer)) {
        visit(node.initializer, true)
        return
      }
    }

    if (ts.isFunctionLike(node) && !inServerCtx) return

    ts.forEachChild(node, (c) => visit(c, inServerCtx))
  }

  visit(sf, false)
  return count
}

function rewriteRelativeModuleSpecifiers(
  sf: ts.SourceFile,
  ctx: {
    inFile: string
    outFile: string
    options: ts.CompilerOptions
    inToOutFiles: Map<string, string>
  }
): ts.SourceFile {
  const fromDir = path.dirname(ctx.inFile)
  const toDir = path.dirname(ctx.outFile)

  const rewriteOne = (rawSpec: string): string | null => {
    // 统一用 TS 模块解析：既支持 ./../，也支持 tsconfig paths 等“非点号开头”的本地别名导入。
    // 仅当解析结果命中 filtered（且不是外部库导入）时才改写到目标输出路径。
    const resolved = ts.resolveModuleName(rawSpec, ctx.inFile, ctx.options, ts.sys).resolvedModule
    const resolvedFile = resolved?.resolvedFileName
    if (resolvedFile && !resolved.isExternalLibraryImport) {
      const outTarget = ctx.inToOutFiles.get(normForMap(resolvedFile))
      if (outTarget) {
        let rel = path.relative(toDir, outTarget).replace(/\\/g, '/')
        if (!rel.startsWith('.')) rel = `./${rel}`
        // 命中 filtered：尽量保持用户写的扩展名形态
        // - ../xx.js  -> ../xx.gs.js
        // - ../xx.ts  -> ../xx.gs.ts
        // - ../xx     -> ../xx.gs
        if (rawSpec.endsWith('.js')) rel = rel.replace(/\.gs\.ts$/i, '.gs.js')
        else if (rawSpec.endsWith('.mjs')) rel = rel.replace(/\.gs\.ts$/i, '.gs.mjs')
        else if (rawSpec.endsWith('.cjs')) rel = rel.replace(/\.gs\.ts$/i, '.gs.cjs')
        else if (!rawSpec.endsWith('.ts')) rel = rel.replace(/\.gs\.ts$/i, '.gs')
        return rel
      }
    }

    if (rawSpec.startsWith('.')) {
      // 非 filtered：保持“相对源路径”的语义（尽量不改变用户写的目录/扩展名形态）
      const abs = path.resolve(fromDir, rawSpec)
      let rel = path.relative(toDir, abs).replace(/\\/g, '/')
      if (!rel.startsWith('.')) rel = `./${rel}`
      return rel
    }

    // 非点号开头且不命中 filtered：保持原样（比如 npm 包名 / 外部依赖 / 未被编译的文件）
    return null
  }

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit = (node: ts.Node): ts.Node => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text
        const next = rewriteOne(spec)
        if (next) {
          return ts.factory.updateImportDeclaration(
            node,
            node.modifiers,
            node.importClause,
            ts.factory.createStringLiteral(next),
            node.attributes
          )
        }
      }
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text
        const next = rewriteOne(spec)
        if (next) {
          return ts.factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            ts.factory.createStringLiteral(next),
            node.attributes
          )
        }
      }
      return ts.visitEachChild(node, visit, context)
    }
    return (root) => ts.visitNode(root, visit) as ts.SourceFile
  }
  const res = ts.transform(sf, [transformer])
  return res.transformed[0]
}

function loadTsConfig(cwd: string): { options: ts.CompilerOptions; extraRoots: string[] } {
  const configPath = path.resolve(cwd, 'tsconfig.json')
  if (!existsFile(configPath)) {
    return {
      options: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      extraRoots: []
    }
  }
  const raw = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p))
  if (raw.error) {
    const msg = ts.flattenDiagnosticMessageText(raw.error.messageText, '\n')
    throw new Error(`[error] tsconfig parse failed: ${msg}`)
  }
  const parsed = ts.parseJsonConfigFileContent(raw.config, ts.sys, cwd)
  if (parsed.errors?.length) {
    const msg = parsed.errors
      .map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n'))
      .join('\n')
    throw new Error(`[error] tsconfig invalid: ${msg}`)
  }
  const extraRoots = parsed.fileNames.filter((f) => f.endsWith('.d.ts'))
  return { options: parsed.options, extraRoots }
}

export type TsToGsCompileParams = {
  cfgDir: string
  cfg: GstsConfig
  /**
   * Optional entries used only for .gs.ts emission (dev incremental).
   */
  emitEntries?: string[]
  /**
   * Optional entries used only for TS program/type-checking (dev incremental).
   */
  programEntries?: string[]
  /**
   * Called immediately after each `.gs.ts` file is written.
   */
  onWriteGs?: (outFile: string, isEntry: boolean) => void
}

export type TsToGsCompileResult = {
  compileRoot: string
  outDir: string
  outFiles: string[]
  entryOutFiles: string[]
}

export async function compileTsToGs(params: TsToGsCompileParams): Promise<TsToGsCompileResult> {
  const compileRoot = path.resolve(params.cfgDir, params.cfg.compileRoot)
  const outDir = path.resolve(params.cfgDir, params.cfg.outDir)
  if (!existsDir(compileRoot)) throw new Error(`[error] compileRoot not found: ${compileRoot}`)
  fs.mkdirSync(outDir, { recursive: true })

  const buildEntryPatterns = (entries: string[]): string[] => {
    const entryPatterns: string[] = []
    for (const rawEnt of entries) {
      const ent = toPosixPath(rawEnt)
      const neg = ent.startsWith('!')
      const entNoBang = neg ? ent.slice(1) : ent
      const abs = path.resolve(compileRoot, entNoBang)

      if (!hasGlobMeta(entNoBang) && existsDir(abs)) {
        entryPatterns.push(`${neg ? '!' : ''}${toPosixPath(path.posix.join(entNoBang, '**/*.ts'))}`)
      } else {
        entryPatterns.push(ent)
      }
    }
    return entryPatterns
  }

  const emitPatterns = buildEntryPatterns(params.emitEntries ?? params.cfg.entries)
  const programPatterns = buildEntryPatterns(params.programEntries ?? params.cfg.entries)

  const [emitMatched, programMatched] = await Promise.all([
    fg(emitPatterns, {
      cwd: compileRoot,
      absolute: true,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: true,
      dot: true,
      ignore: ['**/node_modules/**']
    }),
    fg(programPatterns, {
      cwd: compileRoot,
      absolute: true,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: true,
      dot: true,
      ignore: ['**/node_modules/**']
    })
  ])

  const emitFiles = emitMatched
    .filter((abs) => isEligibleInputTsFile(abs))
    .sort((a, b) => a.localeCompare(b))

  const programFiles = programMatched
    .filter((abs) => isEligibleInputTsFile(abs))
    .sort((a, b) => a.localeCompare(b))

  const inToOutFiles = new Map<string, string>()
  for (const inFile of programFiles) {
    const rel = path.relative(compileRoot, inFile)
    const outRel = rel.replace(/\.ts$/i, '.gs.ts')
    const outFile = path.resolve(outDir, outRel)
    inToOutFiles.set(normForMap(inFile), outFile)
  }

  const { options, extraRoots } = loadTsConfig(path.resolve(params.cfgDir))
  const rootNames: string[] = [...programFiles]
  const seen = new Set<string>(rootNames.map(normForMap))
  for (const emitFile of emitFiles) {
    const key = normForMap(emitFile)
    if (seen.has(key)) continue
    seen.add(key)
    rootNames.push(emitFile)
  }
  for (const extra of extraRoots) {
    const key = normForMap(extra)
    if (seen.has(key)) continue
    seen.add(key)
    rootNames.push(extra)
  }
  const prg = ts.createProgram({ rootNames, options })
  const checker = prg.getTypeChecker()
  const timerCounterRef = { value: 0 }
  const timerFiles = prg
    .getSourceFiles()
    .map((sf) => sf.fileName)
    .filter((abs) => isEligibleInputTsFile(abs))
    .sort((a, b) => a.localeCompare(b))
  const timerOffsets = new Map<string, number>()
  if (timerFiles.length > 0) {
    let offset = 0
    for (const file of timerFiles) {
      const norm = normForMap(file)
      timerOffsets.set(norm, offset)
      const sf = prg.getSourceFile(file)
      if (sf) {
        offset += countTimersInSourceFile(sf, checker)
      }
    }
  }

  const outFiles: string[] = []
  const entryOutFiles: string[] = []

  for (const inFile of emitFiles) {
    const sf = prg.getSourceFile(inFile)
    if (!sf) throw new Error(`[error] failed to load source file: ${inFile}`)
    const base = timerOffsets.get(normForMap(inFile))
    if (base !== undefined) timerCounterRef.value = base

    const rel = path.relative(compileRoot, inFile)
    const outRel = rel.replace(/\.ts$/i, '.gs.ts')
    const outFile = path.resolve(outDir, outRel)
    fs.mkdirSync(path.dirname(outFile), { recursive: true })

    const hasEntry = hasNodeGraphEntryCall(sf, checker)
    const out = transformToGs(sf, { checker, config: params.cfg, timerCounterRef })
    const rewritten = rewriteRelativeModuleSpecifiers(out, {
      inFile,
      outFile,
      options,
      inToOutFiles: inToOutFiles
    })
    const printed = ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false })
      .printFile(rewritten)

    const tagged = hasEntry ? `// @gsts:entry\n${printed}` : printed
    fs.writeFileSync(outFile, tagged, 'utf8')
    params.onWriteGs?.(outFile, hasEntry)
    outFiles.push(outFile)
    if (hasEntry) entryOutFiles.push(outFile)
  }

  return { compileRoot, outDir, outFiles, entryOutFiles }
}

export async function compileTsToGsFromConfig(configPath: string) {
  const cfgAbsPath = path.resolve(process.cwd(), configPath)
  if (!existsFile(cfgAbsPath)) throw new Error(`[error] config not found: ${cfgAbsPath}`)
  const cfgDir = path.dirname(cfgAbsPath)
  const cfg = await loadGstsConfig(cfgAbsPath)
  const result = await compileTsToGs({ cfgDir, cfg })
  return { cfgAbsPath, cfgDir, cfg, ...result }
}
