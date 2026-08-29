#!/usr/bin/env node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clearTimeout, setTimeout } from 'node:timers'

import chokidar from 'chokidar'
import { program } from 'commander'
import fg from 'fast-glob'
import ts from 'typescript'

import { existsFile, loadGstsConfig } from '../compiler/config_loader.js'
import {
  emitIrJsonForEntries,
  hasEntryMarker,
  resolveIrOutputPath
} from '../compiler/gs_to_ir_json_transform/index.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { mergeIrJsonFilesByGraphId } from '../compiler/ir_merge.js'
import { writeGiaFromIrJsonFile, writeGiaFromIrJsonFiles } from '../compiler/ir_to_gia_pipeline.js'
import {
  applyStage3ImplBackendEnv,
  formatStage3BackendDiagnostic,
  resolveStage3ImplBackend,
  type Stage3BackendDecision
} from '../compiler/ir_to_gia_transform/stage3_backend.js'
import { createSignalRegistry, type SignalRegistry } from '../compiler/signal_registry.js'
import { compileTsToGs } from '../compiler/ts_to_gs_pipeline.js'
import { readDiagnosticsDir } from '../diagnostics.js'
import { detectLang, initCliI18n, type Lang } from '../i18n/index.js'
import { injectGilFile } from '../injector/index.js'
import { resolveGraphIdForGraph } from '../runtime/graph_defaults.js'
import { runAssetsCustomVariables } from './assets_custom_variables.js'
import { runAssetsEntities } from './assets_entities.js'
import { runAssetsTerrain } from './assets_terrain.js'
import { runAssetsUi } from './assets_ui.js'
import { runAssetsLevelVariables } from './assets_level_variables.js'
import { runAssetsPrefabs } from './assets_prefabs.js'
import { runAssetsAux } from './assets_aux.js'
import { runAssetsGadgets } from './assets_gadgets.js'
import { runAssetsResources } from './assets_resources.js'
import { runAssetsMounts } from './gil_graph_mounts.js'
import { runAssetsNodeGraphs } from './assets_node_graphs.js'
import { runAssetsSkillConfig } from './assets_skill_config.js'
import { runAssetsSignals } from './assets_signals.js'
import { runVariablesVerify } from './variables_verify.js'
import { runImageEditor } from './image_editor.js'
import { runAssetsStaticAssemblies } from './assets_static_assemblies.js'
import { runLibraryInject } from './static_assembly/library_inject.js'
import { maybeCheckRemoteMarkdown } from './checks.js'
import { ensureDataDirs } from './data.js'
import { resolveGilFolder, resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { DEFAULT_RESOURCES_PATH, extractCustomResourcesFromGil } from './gil_resources.js'
import {
  DEFAULT_SIGNALS_PATH,
  extractSignalsFromGil,
  readRegisteredSignalsFromGil
} from './gil_signals.js'
import { listMaps, renameMap, createMap, resyncMap, initFromTemplate } from './maps.js'
import { getMapKey, loadState, saveState } from './state.js'
import { createUi } from './ui.js'
import { openAndSelect, openDir } from './windows_open.js'

type GlobalOptions = {
  config?: string
  noinject?: boolean
  lang?: string
  /** Opt-in Stage 3 shared vendor-impl Graph beta (does not flip production default). */
  stage3SharedImplBeta?: boolean
  strictWarnings?: boolean
  warningsJson?: string
}

const ui = createUi()

type MergeResult = { graphId: number; outJsonPath: string; sourceJsonPaths: string[] }

type RunBatchHooks = {
  onGiaPaths?: (paths: string[]) => void
  onBeforeInject?: () => void
  onAfterInject?: () => void
}

type CachedConfig = { mtimeMs: number; cfg: GstsConfig }
const configCache = new Map<string, CachedConfig>()

function getGraphIdFromIrDocLike(doc: unknown): number {
  const graph = (doc as { graph?: { id?: unknown; type?: unknown } } | undefined)?.graph
  return resolveGraphIdForGraph(graph)
}

function isMergedJsonFile(p: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
    const meta = (raw as { __gsts?: unknown } | undefined)?.__gsts
    return !!meta && typeof meta === 'object' && (meta as { merged?: unknown }).merged === true
  } catch {
    return false
  }
}

function readJsonAsList(absPath: string): unknown[] {
  const raw: unknown = JSON.parse(fs.readFileSync(absPath, 'utf8'))
  return Array.isArray(raw) ? raw : [raw]
}

function computeAllowedDocIndices(list: unknown[], allowGraphIds: Set<number>): number[] {
  return list
    .map((doc, idx) => (allowGraphIds.has(getGraphIdFromIrDocLike(doc)) ? idx : -1))
    .filter((i) => i >= 0)
}

function applyIrToGiaOptimizeEnv(cfg: GstsConfig | undefined) {
  if (!cfg) return
  const enabled = cfg.options?.optimize?.timerDispatchAggregate ?? true
  process.env.GSTS_OPT_TIMER_DISPATCH = enabled ? '1' : '0'
}

function resolveStage3BackendFromSurfaces(
  opts: GlobalOptions,
  cfg: GstsConfig | undefined
): Stage3BackendDecision {
  return resolveStage3ImplBackend({
    cli: opts.stage3SharedImplBeta === true ? true : undefined,
    config:
      cfg?.options?.stage3?.vendorImplGraphBeta === true
        ? true
        : cfg?.options?.stage3?.vendorImplGraphBeta === false
          ? false
          : undefined
  })
}

function applyStage3BackendSurfaces(
  opts: GlobalOptions,
  cfg: GstsConfig | undefined,
  t: ReturnType<typeof initCliI18n>['t']
): Stage3BackendDecision {
  const decision = resolveStage3BackendFromSurfaces(opts, cfg)
  applyStage3ImplBackendEnv(decision)
  if (decision.enabled) {
    ui.warn(t('warnStage3SharedImplBeta', { source: decision.source, backend: decision.backend }))
    for (const line of formatStage3BackendDiagnostic(decision).split('\n')) {
      ui.info(line)
    }
  }
  return decision
}

/**
 * If allowGraphIds is undefined: emit all docs from the json (single-file mode).
 * If allowGraphIds is a Set: only emit docs whose graphId is in the set (batch/dev mode).
 */
function writeGiaFromOutJson(
  outJson: string,
  allowGraphIds?: Set<number>,
  onWriteGia?: (x: { giaPath: string; graphId: number }) => void,
  signalRegistry?: SignalRegistry
): { giaPath: string; graphId: number }[] {
  const task = planGiaTaskFromOutJson(outJson, allowGraphIds)
  if (!task) return []
  return writeGiaFromIrJsonFile(
    task.irPath,
    task.outFile,
    { ...task.opts, signalRegistry },
    onWriteGia
  )
}

function planGiaTaskFromOutJson(
  outJson: string,
  allowGraphIds?: Set<number>
): {
  irPath: string
  outFile?: string
  opts?: { includeIndices?: number[]; preserveIndices?: boolean }
} | null {
  if (isMergedJsonFile(outJson)) return { irPath: outJson }

  // allowGraphIds absent => emit all docs (single-file mode)
  if (!allowGraphIds) return { irPath: outJson }

  const list = readJsonAsList(outJson)
  if (list.length <= 1) return { irPath: outJson }

  const idxs = computeAllowedDocIndices(list, allowGraphIds)
  if (!idxs.length) return null

  return { irPath: outJson, opts: { includeIndices: idxs, preserveIndices: true } }
}

function injectMany(params: {
  giaPaths: string[]
  opts: GlobalOptions
  gilCfg: GstsInjectConfig | undefined
  useConfiguredTargetId: boolean
  lang: string
  t: ReturnType<typeof initCliI18n>['t']
  onFail?: (err: unknown, giaPath: string) => void
}): { ok: number; fail: number; count: number } {
  if (params.opts.noinject || !params.gilCfg) {
    return { ok: 0, fail: 0, count: params.giaPaths.length }
  }
  let ok = 0
  let fail = 0
  for (const giaPath of params.giaPaths) {
    try {
      const did = maybeInjectGia(
        giaPath,
        params.opts,
        params.gilCfg,
        params.useConfiguredTargetId,
        params.lang
      )
      if (did) ok++
    } catch (e) {
      fail++
      if (params.onFail) params.onFail(e, giaPath)
      else {
        const raw = e instanceof Error ? e.message : String(e)
        const msg = raw.replace(/^\[error\]\s*/i, '').trim()
        ui.error(params.t('injectFail', { file: path.basename(giaPath), error: msg }))
      }
    }
  }
  return { ok, fail, count: params.giaPaths.length }
}

async function runCliChecks(lang: Lang) {
  try {
    await maybeCheckRemoteMarkdown('update', lang)
  } catch (e) {
    ui.warn(`update check failed: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    await maybeCheckRemoteMarkdown('notice', lang)
  } catch (e) {
    ui.warn(`notice check failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function tryGetMtimeMs(p: string): number | null {
  try {
    return fs.statSync(p).mtimeMs
  } catch {
    return null
  }
}

async function loadGstsConfigCached(
  cfgPath: string,
  profile: 'compile' | 'project' = 'compile'
): Promise<GstsConfig> {
  const key = `${profile}:${cfgPath}`
  const mtimeMs = tryGetMtimeMs(cfgPath)
  const cached = configCache.get(key)
  if (cached && mtimeMs != null && cached.mtimeMs === mtimeMs) return cached.cfg
  const cfg = await loadGstsConfig(cfgPath, { profile })
  if (mtimeMs != null) configCache.set(key, { mtimeMs, cfg })
  return cfg
}

function finalizeDiagnostics(opts: GlobalOptions, diagnosticsDir: string) {
  const diagnostics = readDiagnosticsDir(diagnosticsDir)
  if (opts.warningsJson) {
    const output = path.resolve(opts.warningsJson)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify(diagnostics, null, 2) + '\n', 'utf8')
    ui.ok(output)
  }
  if (opts.strictWarnings && diagnostics.some((diagnostic) => diagnostic.severity === 'warning')) {
    throw new Error(
      `[error] strict-warnings: ${diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length} warning(s) found`
    )
  }
}

function resolveConfigPath(opts: GlobalOptions): string {
  return path.resolve(process.cwd(), opts.config ?? 'gsts.config.ts')
}

const ROOT_SUBCOMMANDS = new Set([
  'dev',
  'maps',
  'assets:static-assemblies',
  'assets:library-inject',
  'assets:entities',
  'assets:custom-variables',
  'open',
  'help'
])

function preparseArgv(argv: string[]): { config?: string; lang?: string } {
  const out: { config?: string; lang?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (ROOT_SUBCOMMANDS.has(a)) break
    if (a === '-c' || a === '--config') out.config = argv[++i]
    else if (a.startsWith('--config=')) out.config = a.slice('--config='.length)
    else if (a === '--lang') out.lang = argv[++i]
    else if (a.startsWith('--lang=')) out.lang = a.slice('--lang='.length)
  }
  return out
}

type LoadedConfig = { cfgPath: string; cfgDir: string; cfg: GstsConfig }

async function loadConfigOrNull(
  opts: GlobalOptions,
  profile: 'compile' | 'project' = 'compile'
): Promise<LoadedConfig | null> {
  const cfgPath = resolveConfigPath(opts)
  if (!existsFile(cfgPath)) return null
  const cfgDir = path.dirname(cfgPath)
  const cfg = await loadGstsConfigCached(cfgPath, profile)
  return { cfgPath, cfgDir, cfg }
}

function isGiaPath(p: string): boolean {
  return /\.gia$/i.test(p)
}

function isJsonPath(p: string): boolean {
  return /\.json$/i.test(p)
}

function isEligibleInputTsFile(p: string): boolean {
  if (!p.endsWith('.ts')) return false
  if (p.endsWith('.d.ts')) return false
  if (p.endsWith('.gs.ts')) return false
  return true
}

async function findEntryOutFiles(outDirAbs: string, compileRoot: string): Promise<string[]> {
  const files = await fg('**/*.gs.ts', {
    cwd: outDirAbs,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: true,
    dot: true,
    ignore: ['**/node_modules/**']
  })
  const out: string[] = []
  for (const file of files) {
    try {
      const rel = path.relative(outDirAbs, file)
      const src = path.resolve(compileRoot, rel.replace(/\.gs\.ts$/i, '.ts'))
      if (!fs.existsSync(src)) continue
      const text = fs.readFileSync(file, 'utf8')
      if (hasEntryMarker(text)) out.push(file)
    } catch {
      // ignore
    }
  }
  return out
}

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function hasGlobMeta(p: string): boolean {
  return /[*?[\]{}]/.test(p)
}

function stripDotSlash(p: string): string {
  return p.startsWith('./') ? p.slice(2) : p
}

function normForMap(p: string): string {
  const abs = path.resolve(p).replace(/\\/g, '/')
  return ts.sys.useCaseSensitiveFileNames ? abs : abs.toLowerCase()
}

function loadTsCompilerOptions(cwd: string): ts.CompilerOptions {
  const configPath = path.resolve(cwd, 'tsconfig.json')
  if (!existsFile(configPath)) {
    return { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
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
  return parsed.options
}

function buildEntryPatterns(entries: string[], compileRoot: string): string[] {
  const out: string[] = []
  for (const rawEnt of entries) {
    const ent = toPosixPath(rawEnt)
    const neg = ent.startsWith('!')
    const entNoBang = stripDotSlash(neg ? ent.slice(1) : ent)
    const abs = path.resolve(compileRoot, entNoBang)

    if (!hasGlobMeta(entNoBang)) {
      try {
        if (fs.statSync(abs).isDirectory()) {
          out.push(`${neg ? '!' : ''}${toPosixPath(path.posix.join(entNoBang, '**/*.ts'))}`)
          continue
        }
      } catch {
        // ignore
      }
    }
    out.push(`${neg ? '!' : ''}${entNoBang}`)
  }
  return out
}

async function listAllSourceFiles(compileRoot: string, entries: string[]): Promise<string[]> {
  const patterns = buildEntryPatterns(entries, compileRoot)
  const matched = await fg(patterns, {
    cwd: compileRoot,
    absolute: true,
    onlyFiles: true,
    unique: true,
    followSymbolicLinks: true,
    dot: true,
    ignore: ['**/node_modules/**']
  })
  return matched.filter((abs) => isEligibleInputTsFile(abs)).sort((a, b) => a.localeCompare(b))
}

function collectModuleDeps(fileAbs: string, options: ts.CompilerOptions): Set<string> {
  const text = fs.readFileSync(fileAbs, 'utf8')
  const sf = ts.createSourceFile(fileAbs, text, ts.ScriptTarget.Latest, true)
  const specs: string[] = []

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      specs.push(stmt.moduleSpecifier.text)
      continue
    }
    if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
      if (ts.isStringLiteral(stmt.moduleSpecifier)) specs.push(stmt.moduleSpecifier.text)
    }
  }

  const out = new Set<string>()
  for (const spec of specs) {
    const resolved = ts.resolveModuleName(spec, fileAbs, options, ts.sys).resolvedModule
    if (!resolved || resolved.isExternalLibraryImport) continue
    const target = resolved.resolvedFileName
    if (!isEligibleInputTsFile(target)) continue
    out.add(path.resolve(target))
  }
  return out
}

type DepGraph = {
  depsByFile: Map<string, Set<string>>
  reverseByFile: Map<string, Set<string>>
  absByNorm: Map<string, string>
}

function updateDepsForFile(graph: DepGraph, fileAbs: string, options: ts.CompilerOptions) {
  const norm = normForMap(fileAbs)
  graph.absByNorm.set(norm, fileAbs)
  let deps: Set<string>
  try {
    deps = collectModuleDeps(fileAbs, options)
  } catch {
    deps = new Set()
  }

  const prev = graph.depsByFile.get(norm) ?? new Set<string>()
  for (const depAbs of prev) {
    const depNorm = normForMap(depAbs)
    const rev = graph.reverseByFile.get(depNorm)
    if (rev) {
      rev.delete(norm)
      if (rev.size === 0) graph.reverseByFile.delete(depNorm)
    }
  }

  const next = new Set<string>()
  for (const depAbs of deps) {
    const depNorm = normForMap(depAbs)
    graph.absByNorm.set(depNorm, depAbs)
    next.add(depAbs)
    const rev = graph.reverseByFile.get(depNorm) ?? new Set<string>()
    rev.add(norm)
    graph.reverseByFile.set(depNorm, rev)
  }

  graph.depsByFile.set(norm, next)
}

function removeFileFromDeps(graph: DepGraph, fileAbs: string) {
  const norm = normForMap(fileAbs)
  const prev = graph.depsByFile.get(norm)
  if (prev) {
    for (const depAbs of prev) {
      const depNorm = normForMap(depAbs)
      const rev = graph.reverseByFile.get(depNorm)
      if (rev) {
        rev.delete(norm)
        if (rev.size === 0) graph.reverseByFile.delete(depNorm)
      }
    }
  }
  graph.depsByFile.delete(norm)
  graph.reverseByFile.delete(norm)
  graph.absByNorm.delete(norm)
}

function collectDependents(graph: DepGraph, fileAbs: string): Set<string> {
  const start = normForMap(fileAbs)
  const out = new Set<string>()
  const queue: string[] = [start]
  while (queue.length) {
    const cur = queue.shift()!
    if (out.has(cur)) continue
    out.add(cur)
    const rev = graph.reverseByFile.get(cur)
    if (!rev) continue
    for (const next of rev) queue.push(next)
  }
  return out
}

function entrySourceFromOut(
  outFile: string,
  outDirAbs: string,
  compileRoot: string
): string | null {
  const rel = path.relative(outDirAbs, outFile)
  const src = path.resolve(compileRoot, rel.replace(/\.gs\.ts$/i, '.ts'))
  if (!fs.existsSync(src)) return null
  return src
}

function buildDevWatchGlobs(
  cfgDir: string,
  cfg: GstsConfig
): {
  cwd: string
  watch: string[]
  ignored: string[]
} {
  const compileRoot = path.resolve(cfgDir, cfg.compileRoot)

  const watch: string[] = []
  const ignored: string[] = []

  for (const raw of cfg.entries) {
    const ent = toPosixPath(raw)
    const neg = ent.startsWith('!')
    const entNoBang = stripDotSlash(neg ? ent.slice(1) : ent)

    const abs = path.resolve(compileRoot, entNoBang)
    let relPattern: string
    if (!hasGlobMeta(entNoBang)) {
      try {
        if (fs.statSync(abs).isDirectory()) {
          relPattern = toPosixPath(path.join(entNoBang, '**/*.ts'))
        } else {
          relPattern = toPosixPath(entNoBang)
        }
      } catch {
        relPattern = toPosixPath(entNoBang)
      }
    } else {
      relPattern = toPosixPath(entNoBang)
    }

    if (neg) ignored.push(relPattern)
    else watch.push(relPattern)
  }

  if (!watch.length) {
    watch.push('**/*.ts')
  }

  ignored.push('**/node_modules/**', '**/*.d.ts', '**/*.gs.ts')
  ignored.push(toPosixPath(path.posix.join(stripDotSlash(cfg.outDir), '**')))

  return { cwd: compileRoot, watch, ignored }
}

async function runBatch(opts: GlobalOptions, hooks?: RunBatchHooks) {
  const diagnosticsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-warnings-'))
  process.env.GSTS_WARNINGS_DIR = diagnosticsDir
  const loaded = await loadConfigOrNull(opts)
  if (!loaded) {
    throw new Error(
      `[error] config not found: ${resolveConfigPath(opts)} (use -c/--config or create gsts.config.ts)`
    )
  }

  const { cfgDir, cfg } = loaded
  const lang = detectLang(opts.lang ?? cfg.lang)
  const signalRegistry = cfg.inject
    ? createSignalRegistry(readRegisteredSignalsFromGil(resolveGilTarget(cfg.inject).gilPath))
    : undefined
  const { t } = initCliI18n(lang)
  await runCliChecks(lang)
  applyIrToGiaOptimizeEnv(cfg)
  applyStage3BackendSurfaces(opts, cfg, t)

  ui.info(t('startCompile'))
  const { entryOutFiles } = await compileTsToGs({
    cfgDir,
    cfg,
    onWriteGs: (outFile) => ui.ok(outFile)
  })

  let outDirAbs: string | undefined
  let lastMergeResults: MergeResult[] | undefined

  const giaAll: string[] = []

  if (entryOutFiles.length) {
    console.log('')
    ui.info(t('startGia'))
    await emitIrJsonForEntries(entryOutFiles, {
      cwd: cfgDir,
      runtimeOptions: {
        precompileExpression: cfg.options?.optimize?.precompileExpression ?? true,
        removeUnusedNodes: cfg.options?.optimize?.removeUnusedNodes ?? true
      }
    })
    outDirAbs = path.resolve(cfgDir, cfg.outDir)
    const irPaths = entryOutFiles.map((gsEntry) => resolveIrOutputPath(gsEntry))

    // 合并：同 graph.id 的 IR 输出合并成一个 JSON（用于更好的 DSL 拆分/工程化）
    const merged = mergeIrJsonFilesByGraphId({ outDirAbs, irJsonPaths: irPaths })
    lastMergeResults = merged.map((m) => ({
      graphId: m.graphId,
      outJsonPath: m.outJsonPath,
      sourceJsonPaths: m.sourceJsonPaths
    }))
    const uniqueJsonPaths = [...new Set(merged.map((m) => m.outJsonPath))]
    uniqueJsonPaths.forEach((p) => ui.ok(p))

    const outJsonToGraphIds = new Map<string, Set<number>>()
    for (const m of merged) {
      const s = outJsonToGraphIds.get(m.outJsonPath) ?? new Set<number>()
      s.add(m.graphId)
      outJsonToGraphIds.set(m.outJsonPath, s)
    }

    const tasks = uniqueJsonPaths
      .map((p) => planGiaTaskFromOutJson(p, outJsonToGraphIds.get(p) ?? new Set<number>()))
      .filter(
        (
          t
        ): t is {
          irPath: string
          outFile?: string
          opts?: { includeIndices?: number[]; preserveIndices?: boolean }
        } => Boolean(t)
      )
    const detailed = await writeGiaFromIrJsonFiles(tasks, {
      cwd: cfgDir,
      signalRegistry,
      onOkLine: (msg) => ui.ok(msg)
    })
    // GIA 输出由 runner 实时打印，这里避免重复输出
    giaAll.push(...detailed.map((x) => x.giaPath))

    ui.info(t('giaAllDone', { count: giaAll.length }))

    // 批量模式：忽略 config.inject.nodeGraphId，使用 GIA 内的 graph id 推断
    if (!opts.noinject && cfg.inject) {
      hooks?.onBeforeInject?.()
      const stat = injectMany({
        giaPaths: giaAll,
        opts,
        gilCfg: cfg.inject,
        useConfiguredTargetId: false,
        lang,
        t
      })
      hooks?.onAfterInject?.()
      ui.info(t('injectAllDone', { ok: stat.ok, fail: stat.fail, count: stat.count }))
    }
  }

  if (opts.noinject) {
    ui.warn(t('warnNoInject'))
  }

  finalizeDiagnostics(opts, diagnosticsDir)
  hooks?.onGiaPaths?.(giaAll)

  return {
    cfgDir,
    cfg,
    lang,
    outDirAbs,
    mergeResults: lastMergeResults,
    giaPaths: giaAll
  }
}

async function runDev(opts: GlobalOptions) {
  const loaded = await loadConfigOrNull(opts)
  if (!loaded) {
    throw new Error(
      `[error] config not found: ${resolveConfigPath(opts)} (use -c/--config or create gsts.config.ts)`
    )
  }
  const { cfgDir, cfg } = loaded
  const compileRoot = path.resolve(cfgDir, cfg.compileRoot)
  const outDirAbs = path.resolve(cfgDir, cfg.outDir)
  const lang = detectLang(opts.lang ?? cfg.lang)
  const { t } = initCliI18n(lang)
  applyIrToGiaOptimizeEnv(cfg)
  applyStage3BackendSurfaces(opts, cfg, t)

  const lastInjectedGiaPaths = new Set<string>()
  const normalizeGiaPath = (p: string) => path.resolve(p)
  const trackGiaPaths = (paths: string[], mode: 'add' | 'replace' = 'add') => {
    if (mode === 'replace') lastInjectedGiaPaths.clear()
    for (const p of paths) lastInjectedGiaPaths.add(normalizeGiaPath(p))
  }

  // 注入完成后的短暂冷却：用于屏蔽“迟到”的文件变更事件（杀软/IO 抖动等）
  let gilIgnoreUntil = 0
  const markGilIgnoreCooldown = () => {
    gilIgnoreUntil = Date.now() + 800
  }
  let injecting = false

  const injectCfg = cfg.inject
  const reinjectOnMapChange =
    !!injectCfg && !opts.noinject && injectCfg.reinjectOnMapChange !== false
  let gilPath: string | undefined
  if (reinjectOnMapChange) {
    try {
      gilPath = resolveGilTarget(injectCfg).gilPath
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      ui.warn(t('devMapWatchSkip', { error: msg.replace('[error]', '').trim() }))
    }
  }

  ui.ok(`watching ${compileRoot}`)

  const signalRegistry = gilPath
    ? createSignalRegistry(readRegisteredSignalsFromGil(gilPath))
    : undefined

  const graphIdToSources = new Map<number, string[]>()
  const graphIdToMergedJsonPath = new Map<number, string>()

  const updateMergeCache = (results: MergeResult[] | undefined) => {
    if (!results?.length) return
    for (const r of results) {
      graphIdToSources.set(r.graphId, r.sourceJsonPaths)
      graphIdToMergedJsonPath.set(r.graphId, r.outJsonPath)
    }
  }

  const safeRunBatch = async () => {
    try {
      const res = await runBatch(opts, {
        onGiaPaths: (paths) => trackGiaPaths(paths, 'replace'),
        onBeforeInject: () => {
          injecting = true
        },
        onAfterInject: () => {
          injecting = false
          markGilIgnoreCooldown()
        }
      })
      updateMergeCache(res?.mergeResults)
      return res
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      ui.error(msg.replace('[error]', '').trim())
      injecting = false
      return undefined
    }
  }

  let running = false
  let pendingCodeCompile = false
  let pendingReinject = false
  let codeChangeTimer: ReturnType<typeof setTimeout> | undefined
  let gilChangeTimer: ReturnType<typeof setTimeout> | undefined

  const triggerCodeChange = () => {
    if (codeChangeTimer) clearTimeout(codeChangeTimer)
    codeChangeTimer = setTimeout(() => {
      void (async () => {
        try {
          if (running) {
            pendingCodeCompile = true
            return
          }
          running = true
          await runChanged()
        } catch (e) {
          // 理论上 safeRunBatch 不会抛出；这里兜底避免未处理 rejection 让 dev 崩溃
          const msg = e instanceof Error ? e.message : String(e)
          ui.error(msg.replace('[error]', '').trim())
        } finally {
          running = false
          const hadPendingCodeCompile = pendingCodeCompile
          if (pendingCodeCompile) {
            pendingCodeCompile = false
            triggerCodeChange()
          }
          if (!hadPendingCodeCompile && pendingReinject) {
            pendingReinject = false
            triggerReinject()
          }
        }
      })()
    }, 150)
  }

  const triggerReinject = () => {
    if (!reinjectOnMapChange || !gilPath) return
    if (gilChangeTimer) clearTimeout(gilChangeTimer)
    gilChangeTimer = setTimeout(() => {
      void (async () => {
        try {
          if (running) {
            pendingReinject = true
            return
          }
          running = true
          await runReinject()
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          ui.error(msg.replace('[error]', '').trim())
        } finally {
          running = false
          const hadPendingCodeCompile = pendingCodeCompile
          if (pendingCodeCompile) {
            pendingCodeCompile = false
            triggerCodeChange()
          }
          if (!hadPendingCodeCompile && pendingReinject) {
            pendingReinject = false
            triggerReinject()
          }
        }
      })()
    }, 200)
  }

  const initial = await safeRunBatch()
  if (initial) {
    maybeExtractResources({
      cfgDir,
      injectCfg: initial.cfg.inject,
      opts,
      lang: initial.lang,
      gilPath
    })
  }

  const compilerOptions = loadTsCompilerOptions(cfgDir)
  const depGraph: DepGraph = {
    depsByFile: new Map(),
    reverseByFile: new Map(),
    absByNorm: new Map()
  }
  const allSources = await listAllSourceFiles(compileRoot, cfg.entries)
  allSources.forEach((abs) => updateDepsForFile(depGraph, abs, compilerOptions))

  const entryOutBySource = new Map<string, string>()
  const entrySources = new Set<string>()

  const updateEntryMapping = (entryOutFiles: string[]) => {
    for (const outFile of entryOutFiles) {
      const src = entrySourceFromOut(outFile, outDirAbs, compileRoot)
      if (!src) continue
      const norm = normForMap(src)
      entryOutBySource.set(norm, outFile)
      entrySources.add(norm)
      depGraph.absByNorm.set(norm, src)
    }
  }

  const refreshEntryMapping = async () => {
    const entryOutFiles = await findEntryOutFiles(outDirAbs, compileRoot)
    entryOutBySource.clear()
    entrySources.clear()
    updateEntryMapping(entryOutFiles)
  }

  await refreshEntryMapping()

  const { cwd, watch, ignored } = buildDevWatchGlobs(cfgDir, cfg)
  const changed = new Set<string>()
  const removed = new Set<string>()

  const sourceJsonToGraphIds = new Map<string, Set<number>>()

  const deleteIfExists = (p: string) => {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p)
        if (p.toLowerCase().endsWith('.gia')) {
          lastInjectedGiaPaths.delete(normalizeGiaPath(p))
        }
      }
    } catch {
      // ignore
    }
  }

  const runChanged = async () => {
    const queuedOutJson = new Map<string, Set<number>>()
    const queueOutJson = (outJson: string, gid: number) => {
      const s = queuedOutJson.get(outJson) ?? new Set<number>()
      s.add(gid)
      queuedOutJson.set(outJson, s)
    }
    const pendingEntryGs = new Set<string>()

    const processEntryOutputs = async (entryOutFiles: string[]) => {
      if (!entryOutFiles.length) return

      console.log('')
      ui.info(t('startGia'))
      await emitIrJsonForEntries(entryOutFiles, {
        cwd: cfgDir,
        runtimeOptions: {
          precompileExpression: cfg.options?.optimize?.precompileExpression ?? true,
          removeUnusedNodes: cfg.options?.optimize?.removeUnusedNodes ?? true
        }
      })

      const graphIds = new Set<number>()
      const sourceJsonPaths: string[] = []
      for (const gs of entryOutFiles) {
        const irPath = resolveIrOutputPath(gs)
        sourceJsonPaths.push(irPath)
        const list = readJsonAsList(irPath)
        for (const doc of list) graphIds.add(getGraphIdFromIrDocLike(doc))
      }
      for (const irPath of sourceJsonPaths) {
        sourceJsonToGraphIds.set(irPath, new Set(graphIds))
      }

      const unionSources = new Set<string>()
      for (const gid of graphIds) {
        const sources = graphIdToSources.get(gid) ?? []
        sources.forEach((p) => unionSources.add(p))
      }
      sourceJsonPaths.forEach((p) => unionSources.add(p))

      const merged = mergeIrJsonFilesByGraphId({ outDirAbs, irJsonPaths: [...unionSources] })
      updateMergeCache(
        merged.map((m) => ({
          graphId: m.graphId,
          outJsonPath: m.outJsonPath,
          sourceJsonPaths: m.sourceJsonPaths
        }))
      )
      for (const gid of graphIds) {
        const outJson =
          graphIdToMergedJsonPath.get(gid) ?? merged.find((m) => m.graphId === gid)?.outJsonPath
        if (!outJson) continue
        queueOutJson(outJson, gid)
      }
    }

    if (removed.size > 20 || changed.size > 20) {
      removed.clear()
      changed.clear()
      await safeRunBatch()
      return
    }

    const removedRels = [...removed]
    removed.clear()

    const rels = [...changed]
    changed.clear()

    for (const rel of removedRels) {
      const abs = path.resolve(compileRoot, rel)
      removeFileFromDeps(depGraph, abs)
      const norm = normForMap(abs)
      entrySources.delete(norm)
      entryOutBySource.delete(norm)
    }

    const changedAbs = rels.map((rel) => path.resolve(compileRoot, rel))
    for (const abs of changedAbs) {
      updateDepsForFile(depGraph, abs, compilerOptions)
    }

    const affectedGraphIdsByRemoval = new Set<number>()
    for (const rel of removedRels) {
      // outDir 下对应的 source IR json 路径（由 gs_to_ir_json_transform 产出）
      const gsOut = path.resolve(outDirAbs, rel.replace(/\.ts$/i, '.gs.ts'))
      const irPath = resolveIrOutputPath(gsOut)

      const graphIds =
        sourceJsonToGraphIds.get(irPath) ??
        new Set<number>(
          [...graphIdToSources.entries()]
            .filter(([, srcs]) => srcs.includes(irPath))
            .map(([gid]) => gid)
        )

      sourceJsonToGraphIds.delete(irPath)

      for (const gid of graphIds) {
        affectedGraphIdsByRemoval.add(gid)
        const prev = graphIdToSources.get(gid) ?? []
        const next = prev.filter((p) => p !== irPath)
        graphIdToSources.set(gid, next)
      }
    }

    // 对删除影响到的 graphId 做增量重建（merge/json/gia/注入）
    // 注意：不要“按 gid 单独 merge 并 update cache”，否则会用子集 sources 覆写其它 gid 的缓存。
    const removalPrevOutByGid = new Map<number, string | undefined>()
    const removalToRebuild = new Set<number>()
    const removalUnionSources = new Set<string>()
    for (const gid of affectedGraphIdsByRemoval) {
      const prevOut = graphIdToMergedJsonPath.get(gid)
      removalPrevOutByGid.set(gid, prevOut)

      const sources = (graphIdToSources.get(gid) ?? []).filter((p) => fs.existsSync(p))
      if (!sources.length) {
        if (prevOut && isMergedJsonFile(prevOut)) {
          deleteIfExists(prevOut)
          deleteIfExists(prevOut.replace(/\.json$/i, '.gia'))
        }
        graphIdToSources.delete(gid)
        graphIdToMergedJsonPath.delete(gid)
        continue
      }
      sources.forEach((p) => removalUnionSources.add(p))
      removalToRebuild.add(gid)
    }
    if (removalUnionSources.size) {
      const merged = mergeIrJsonFilesByGraphId({ outDirAbs, irJsonPaths: [...removalUnionSources] })
      updateMergeCache(
        merged.map((m) => ({
          graphId: m.graphId,
          outJsonPath: m.outJsonPath,
          sourceJsonPaths: m.sourceJsonPaths
        }))
      )
      for (const gid of removalToRebuild) {
        const prevOut = removalPrevOutByGid.get(gid)
        const outJson =
          graphIdToMergedJsonPath.get(gid) ?? merged.find((m) => m.graphId === gid)?.outJsonPath
        if (!outJson) continue

        // 若之前是合并文件，但这次变成“单源文件”，可以删除旧合并文件避免堆积
        if (prevOut && prevOut !== outJson && isMergedJsonFile(prevOut)) {
          deleteIfExists(prevOut)
          deleteIfExists(prevOut.replace(/\.json$/i, '.gia'))
        }

        queueOutJson(outJson, gid)
      }
    }

    const impactedEntryNorms = new Set<string>()
    for (const abs of changedAbs) {
      const dependents = collectDependents(depGraph, abs)
      for (const dep of dependents) {
        if (entrySources.has(dep)) impactedEntryNorms.add(dep)
      }
    }

    const changedRelSet = new Set(rels)
    const impactedEntryRels = [...impactedEntryNorms]
      .map((norm) => depGraph.absByNorm.get(norm))
      .filter((abs): abs is string => !!abs)
      .map((abs) => path.relative(compileRoot, abs).replace(/\\/g, '/'))
      .filter((rel) => rel && !changedRelSet.has(rel))

    if (rels.length) {
      ui.info(t('startCompile'))
      const { entryOutFiles } = await compileTsToGs({
        cfgDir,
        cfg,
        emitEntries: rels,
        programEntries: cfg.entries,
        onWriteGs: (p) => ui.ok(p)
      })
      updateEntryMapping(entryOutFiles)
      entryOutFiles.forEach((p) => pendingEntryGs.add(p))
    }

    if (impactedEntryRels.length) {
      ui.info(t('startCompile'))
      const { entryOutFiles } = await compileTsToGs({
        cfgDir,
        cfg,
        emitEntries: impactedEntryRels,
        programEntries: cfg.entries,
        onWriteGs: (p) => ui.ok(p)
      })
      updateEntryMapping(entryOutFiles)
      entryOutFiles.forEach((p) => pendingEntryGs.add(p))
    }

    await processEntryOutputs([...pendingEntryGs].filter((p) => fs.existsSync(p)))

    const entries = [...queuedOutJson.entries()]
    const tasks = entries
      .map(([outJson, gids]) => planGiaTaskFromOutJson(outJson, gids))
      .filter(
        (
          t
        ): t is {
          irPath: string
          outFile?: string
          opts?: { includeIndices?: number[]; preserveIndices?: boolean }
        } => Boolean(t)
      )

    let all: { irPath: string; giaPath: string; graphId: number }[] = []
    if (tasks.length) {
      try {
        all = await writeGiaFromIrJsonFiles(tasks, {
          cwd: cfgDir,
          signalRegistry,
          onOkLine: (msg) => ui.ok(msg)
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        ui.error(msg.replace('[error]', '').trim())
        all = []
      }
    }
    if (all.length) {
      trackGiaPaths(all.map((x) => x.giaPath))
    }

    const byIr = new Map<string, { giaPath: string; graphId: number }[]>()
    for (const r of all) {
      const key = path.resolve(r.irPath)
      const arr = byIr.get(key) ?? []
      arr.push(r)
      byIr.set(key, arr)
    }

    for (const [outJson] of entries) {
      const key = path.resolve(outJson)
      const detailed = byIr.get(key) ?? []

      ui.ok(outJson)
      // GIA 输出由 runner 实时打印，这里避免重复输出

      if (!detailed.length) continue
      if (!opts.noinject && cfg.inject) {
        injecting = true
        try {
          const stat = injectMany({
            giaPaths: detailed.map((x) => x.giaPath),
            opts,
            gilCfg: cfg.inject,
            useConfiguredTargetId: false,
            lang,
            t
          })
          ui.info(t('injectAllDone', { ok: stat.ok, fail: stat.fail, count: stat.count }))
        } finally {
          injecting = false
          markGilIgnoreCooldown()
        }
      }
    }
  }

  async function runReinject() {
    if (!reinjectOnMapChange || !gilPath || !cfg.inject) return

    const tracked = [...lastInjectedGiaPaths]
    if (!tracked.length) {
      ui.warn(t('devReinjectNoGia'))
      return
    }

    const missing = tracked.filter((p) => !fs.existsSync(p))
    if (missing.length) {
      ui.warn(t('devReinjectMissingGia', { count: missing.length }))
      const res = await safeRunBatch()
      if (res) {
        maybeExtractResources({
          cfgDir,
          injectCfg: res.cfg.inject,
          opts,
          lang: res.lang,
          gilPath,
          reason: 'map-change'
        })
      }
      return
    }

    if (!fs.existsSync(gilPath)) {
      ui.warn(t('devMapMissing', { path: gilPath }))
      return
    }

    ui.info(t('devMapChanged'))
    injecting = true
    try {
      const stat = injectMany({
        giaPaths: tracked,
        opts,
        gilCfg: cfg.inject,
        useConfiguredTargetId: false,
        lang,
        t
      })
      ui.info(t('injectAllDone', { ok: stat.ok, fail: stat.fail, count: stat.count }))
    } finally {
      injecting = false
      markGilIgnoreCooldown()
    }
    maybeExtractResources({
      cfgDir,
      injectCfg: cfg.inject,
      opts,
      lang,
      gilPath,
      reason: 'map-change'
    })
  }

  const onGilChange = () => {
    if (!reinjectOnMapChange || !gilPath) return
    if (injecting) return
    if (Date.now() < gilIgnoreUntil) return
    triggerReinject()
  }

  // eslint-disable-next-line
  chokidar
    // eslint-disable-next-line
    .watch(watch, {
      cwd,
      ignoreInitial: true,
      ignored
    })
    // eslint-disable-next-line
    .on('add', (p: string) => {
      changed.add(p)
      triggerCodeChange()
    })
    // eslint-disable-next-line
    .on('change', (p: string) => {
      changed.add(p)
      triggerCodeChange()
    })
    // eslint-disable-next-line
    .on('unlink', (p: string) => {
      removed.add(p)
      triggerCodeChange()
    })
    // eslint-disable-next-line
    .on('error', (err: unknown) => {
      ui.error(`watch error: ${err instanceof Error ? err.message : String(err)}`)
    })

  if (reinjectOnMapChange && gilPath) {
    // eslint-disable-next-line
    chokidar
      // eslint-disable-next-line
      .watch(gilPath, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 }
      })
      // eslint-disable-next-line
      .on('add', onGilChange)
      // eslint-disable-next-line
      .on('change', onGilChange)
      // eslint-disable-next-line
      .on('unlink', onGilChange)
      // eslint-disable-next-line
      .on('error', (err: unknown) => {
        ui.error(`map watch error: ${err instanceof Error ? err.message : String(err)}`)
      })
  }

  // keep alive
  await new Promise<void>(() => {})
}

async function runMaps(
  opts: GlobalOptions,
  commandOptions: { format?: string; includeHash?: boolean }
) {
  const loaded = await loadConfigOrNull(opts, 'project')
  const gil: GstsInjectConfig = loaded?.cfg.inject ?? {}
  const resolved = resolveGilFolder(gil)
  const result = listMaps(
    resolved.saveLevelDir,
    { includeHash: commandOptions.includeHash, includeName: true },
    { warn: (message) => console.error(`[warning] ${message}`) }
  )
  if (commandOptions.format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return
  }
  ui.ok(`maps: ${resolved.saveLevelDir}`)
  for (const map of result.maps) {
    const prefix = map.recent ? ui.highlight('[recent]') : '        '
    const name = map.name ?? '(no name)'
    console.log(`${prefix} ${map.mapId}  ${name}  ${new Date(map.modifiedAtMs).toLocaleString()}`)
  }
}

async function runMapsRename(
  opts: GlobalOptions,
  commandOptions: { mapId: string; name: string }
) {
  const loaded = await loadConfigOrNull(opts, 'project')
  const gil: GstsInjectConfig = loaded?.cfg.inject ?? {}
  const resolved = resolveGilFolder(gil)
  const mapId = Number(commandOptions.mapId)
  if (!Number.isSafeInteger(mapId) || mapId < 0) {
    throw new Error(`[error] invalid map id: ${commandOptions.mapId}`)
  }
  const result = renameMap(resolved.saveLevelDir, mapId, commandOptions.name, {
    warn: (message) => console.error(`[warning] ${message}`)
  })
  ui.ok(`renamed map ${result.mapId}: ${result.oldName ?? '(no name)'} -> ${result.newName}`)
  console.log(`backup=${result.backupPath}`)
  console.log(`written=${result.gilPath} size=${result.size} sha256=${result.sha256}`)
}

async function runMapsCreate(opts: GlobalOptions, commandOptions: { name: string; graphs?: string }) {
  const loaded = await loadConfigOrNull(opts, 'project')
  const gil: GstsInjectConfig = loaded?.cfg.inject ?? {}
  const resolved = resolveGilFolder(gil)
  const result = createMap(
    resolved.saveLevelDir,
    commandOptions.name,
    {
      warn: (message) => console.error(`[warning] ${message}`),
      graphs: commandOptions.graphs
        ? commandOptions.graphs.split(',').map((n) => n.trim()).filter(Boolean)
        : []
    }
  )
  ui.ok(`created map ${result.mapId}: ${result.name}`)
  console.log(`written=${result.gilPath} size=${result.size} sha256=${result.sha256}`)
  for (const graph of result.graphs) {
    console.log(`graph=${graph.graphId} name=${graph.name}`)
  }
}

async function runMapsResync(opts: GlobalOptions, commandOptions: { mapId: string }) {
  const loaded = await loadConfigOrNull(opts, 'project')
  const gil: GstsInjectConfig = loaded?.cfg.inject ?? {}
  const resolved = resolveGilFolder(gil)
  const mapId = Number(commandOptions.mapId)
  if (!Number.isSafeInteger(mapId) || mapId < 0) {
    throw new Error(`[error] invalid map id: ${commandOptions.mapId}`)
  }
  const result = resyncMap(resolved.saveLevelDir, mapId, {
    warn: (message) => console.error(`[warning] ${message}`)
  })
  ui.ok(`resynced map ${result.mapId}: ${result.name}`)
  console.log(`gil=${result.gilPath} size=${result.size}`)
  console.log(`temp=${result.tempPath ?? '(no Temp dir)'}`)
}

async function runMapsInit(
  opts: GlobalOptions,
  commandOptions: { mapId: string; template?: string; write?: boolean }
) {
  const loaded = await loadConfigOrNull(opts, 'project')
  const gil: GstsInjectConfig = loaded?.cfg.inject ?? {}
  const resolved = resolveGilFolder(gil)
  const mapId = Number(commandOptions.mapId)
  if (!Number.isSafeInteger(mapId) || mapId < 0) {
    throw new Error(`[error] invalid map id: ${commandOptions.mapId}`)
  }
  const gilPath = path.join(resolved.saveLevelDir, `${mapId}.gil`)
  if (!fs.existsSync(gilPath)) {
    throw new Error(`[error] map file not found: ${gilPath}`)
  }
  const templatePath = commandOptions.template
    ? path.resolve(commandOptions.template)
    : path.resolve('resources/first-save-template.gil')
  if (!fs.existsSync(templatePath)) {
    throw new Error(`[error] template not found: ${templatePath}`)
  }
  const source = fs.readFileSync(gilPath)
  const { bytes, replacedRoots } = initFromTemplate(gilPath, templatePath, {
    warn: (message) => console.error(`[warning] ${message}`)
  })
  const candidateSha = createHash('sha256').update(bytes).digest('hex')
  const sourceSha = createHash('sha256').update(source).digest('hex')
  if (commandOptions.write) {
    // 备份 + 原子写回
    const backups = path.join(resolved.saveLevelDir, '.gsts', 'backups')
    fs.mkdirSync(backups, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backups, `${mapId}.gil.${ts}.bak`)
    fs.writeFileSync(backup, source)
    const tmp = `${gilPath}.tmp-${process.pid}`
    fs.writeFileSync(tmp, bytes)
    fs.renameSync(tmp, gilPath)
    console.log(`sourceSha256=${sourceSha}`)
    console.log(`candidateSha256=${candidateSha}`)
    console.log(`backup=${backup}`)
    console.log(`replacedRoots=${replacedRoots.join(',')}`)
    console.log('writePerformed=true')
    const tempCopied = syncGilToTemp(resolved.saveLevelDir, `${mapId}.gil`)
    if (tempCopied) console.log(`temp=${tempCopied}`)
  } else {
    console.log(`sourceSha256=${sourceSha}`)
    console.log(`candidateSha256=${candidateSha}`)
    console.log(`replacedRoots=${replacedRoots.join(',')}`)
    console.log('writePerformed=false')
  }
}

async function runOpen(target: string | undefined, opts: GlobalOptions) {
  if (!target) throw new Error('[error] missing target (map|backup|data)')
  const { dataDir, backupsDir } = ensureDataDirs()
  if (target === 'data') {
    openDir(dataDir)
    ui.ok(`opened ${dataDir}`)
    return
  }
  if (target === 'backup') {
    openDir(backupsDir)
    ui.ok(`opened ${backupsDir}`)
    return
  }
  if (target === 'map') {
    const loaded = await loadConfigOrNull(opts)
    const inject = loaded?.cfg.inject
    if (!inject) throw new Error('[error] inject is not configured (set config.inject)')
    const resolved = resolveGilTarget(inject)
    openAndSelect(resolved.gilPath)
    ui.ok(`opened ${resolved.saveLevelDir}`)
    return
  }
  throw new Error('[error] invalid target (map|backup|data)')
}

function maybeBackupGil(playerId: number, mapId: number, gilPath: string) {
  const { backupsDir } = ensureDataDirs()
  const state = loadState()
  const key = getMapKey(playerId, mapId)
  const last = state.lastBackupAtByMap?.[key] ?? 0
  const now = Date.now()
  if (now - last <= 5 * 60 * 1000) return

  const stamp = String(now)
  const mapBackupDir = path.join(backupsDir, String(playerId), String(mapId))
  fs.mkdirSync(mapBackupDir, { recursive: true })
  const backupPath = path.join(mapBackupDir, `${stamp}.gil`)
  fs.copyFileSync(gilPath, backupPath)

  // 每个地图（key）最多保留 200 个备份：按时间从新到旧排序，保留前 200 个，删除第 201 个及更旧的
  const backups = fs
    .readdirSync(mapBackupDir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.gil'))
    .map((d) => {
      const full = path.join(mapBackupDir, d.name)
      const st = fs.statSync(full)
      return { full, mtimeMs: st.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  const toDelete = backups.slice(200)
  for (const b of toDelete) {
    try {
      fs.unlinkSync(b.full)
    } catch {
      // ignore
    }
  }

  const next = {
    ...state,
    lastBackupAtByMap: {
      ...(state.lastBackupAtByMap ?? {}),
      [key]: now
    }
  }
  saveState(next)
}

function resolveResourcesPath(cfgDir: string, injectCfg: GstsInjectConfig): string {
  const raw = injectCfg.resourcesPath ?? DEFAULT_RESOURCES_PATH
  return path.isAbsolute(raw) ? raw : path.resolve(cfgDir, raw)
}

function resolveSignalsPath(cfgDir: string, injectCfg: GstsInjectConfig): string {
  const raw = injectCfg.signalsPath ?? DEFAULT_SIGNALS_PATH
  return path.isAbsolute(raw) ? raw : path.resolve(cfgDir, raw)
}

function maybeExtractResources(params: {
  cfgDir: string
  injectCfg: GstsInjectConfig | undefined
  opts: GlobalOptions
  lang: string | undefined
  gilPath?: string
  reason?: 'map-change'
}) {
  const { injectCfg, opts, lang } = params
  if (!injectCfg || opts.noinject) return

  const shouldExtractResources = injectCfg.extractResources !== false
  const shouldExtractSignals = injectCfg.extractSignals !== false
  if (!shouldExtractResources && !shouldExtractSignals) return

  const { t } = initCliI18n(detectLang(lang ?? opts.lang))

  let gilPath = params.gilPath
  if (!gilPath) {
    try {
      gilPath = resolveGilTarget(injectCfg).gilPath
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const error = msg.replace('[error]', '').trim()
      if (shouldExtractResources) ui.warn(t('extractResourcesFail', { error }))
      if (shouldExtractSignals) ui.warn(t('extractSignalsFail', { error }))
      return
    }
  }

  if (params.reason === 'map-change') {
    ui.info(t('devResourcesReextract'))
  }

  if (shouldExtractResources) {
    const outPath = resolveResourcesPath(params.cfgDir, injectCfg)
    const result = extractCustomResourcesFromGil({ gilPath, outPath, lang })
    if (result.status === 'ok') {
      ui.ok(t('extractResourcesOk', { path: result.outPath, count: result.count }))
    } else if (result.status === 'skipped-existing') {
      ui.warn(t('extractResourcesSkipExisting', { path: result.outPath }))
    } else {
      ui.warn(t('extractResourcesFail', { error: result.error }))
    }
  }

  if (shouldExtractSignals) {
    const outPath = resolveSignalsPath(params.cfgDir, injectCfg)
    const result = extractSignalsFromGil({ gilPath, outPath })
    if (result.status === 'ok') {
      ui.ok(t('extractSignalsOk', { path: result.outPath, count: result.count }))
    } else if (result.status === 'skipped-existing') {
      ui.warn(t('extractSignalsSkipExisting', { path: result.outPath }))
    } else {
      ui.warn(t('extractSignalsFail', { error: result.error }))
    }
  }
}

function maybeInjectGia(
  giaPath: string,
  opts: GlobalOptions,
  gilCfg: GstsInjectConfig | undefined,
  useConfiguredTargetId: boolean,
  resolvedLang: string | undefined
) {
  if (opts.noinject) return
  if (!gilCfg) return

  const { t } = initCliI18n(detectLang(resolvedLang ?? opts.lang))
  const target = resolveGilTarget(gilCfg)
  maybeBackupGil(target.playerId, target.mapId, target.gilPath)

  const t0 = Date.now()
  const result = injectGilFile({
    gilPath: target.gilPath,
    giaPath,
    targetId: useConfiguredTargetId ? gilCfg.nodeGraphId : undefined,
    skipNonEmptyCheck: !!gilCfg.skipSafeCheck,
    lang: resolvedLang
  })
  const costMs = Date.now() - t0
  ui.ok(t('injectOkTime', { file: path.basename(giaPath), outPath: result.outPath, ms: costMs }))
  return true
}

async function runSingle(file: string, opts: GlobalOptions) {
  const diagnosticsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsts-warnings-'))
  process.env.GSTS_WARNINGS_DIR = diagnosticsDir
  const abs = path.resolve(process.cwd(), file)
  if (!existsFile(abs)) throw new Error(`[error] file not found: ${abs}`)

  const loadedForChecks = await loadConfigOrNull(opts)
  const lang = detectLang(opts.lang ?? loadedForChecks?.cfg.lang)
  const { t } = initCliI18n(lang)
  await runCliChecks(lang)
  applyIrToGiaOptimizeEnv(loadedForChecks?.cfg)
  applyStage3BackendSurfaces(opts, loadedForChecks?.cfg, t)
  const injectCfg = loadedForChecks?.cfg.inject

  if (isGiaPath(abs)) {
    // 单文件模式：允许使用 config.inject.nodeGraphId 覆盖目标 id
    maybeInjectGia(abs, opts, injectCfg, true, lang)
    return
  }

  if (isJsonPath(abs)) {
    ui.info(t('startGia'))
    const signalRegistry = injectCfg
      ? createSignalRegistry(readRegisteredSignalsFromGil(resolveGilTarget(injectCfg).gilPath))
      : undefined
    const out = writeGiaFromOutJson(
      abs,
      undefined,
      (x) => ui.ok(`${x.giaPath} (id=${x.graphId})`),
      signalRegistry
    )
    // 单文件模式：允许使用 config.inject.nodeGraphId 覆盖目标 id
    out.forEach((x) => maybeInjectGia(x.giaPath, opts, injectCfg, true, lang))
    return
  }

  const text = fs.readFileSync(abs, 'utf8')
  try {
    JSON.parse(text)
    ui.info(t('startGia'))
    const signalRegistry = injectCfg
      ? createSignalRegistry(readRegisteredSignalsFromGil(resolveGilTarget(injectCfg).gilPath))
      : undefined
    const out = writeGiaFromOutJson(
      abs,
      undefined,
      (x) => ui.ok(`${x.giaPath} (id=${x.graphId})`),
      signalRegistry
    )
    // 单文件模式：允许使用 config.inject.nodeGraphId 覆盖目标 id
    out.forEach((x) => maybeInjectGia(x.giaPath, opts, injectCfg, true, lang))
    return
  } catch {
    // not json
  }

  const loaded = loadedForChecks
  const cfgDir = loaded?.cfgDir ?? path.dirname(abs)
  const cfg = loaded?.cfg ?? {
    compileRoot: '.',
    entries: [path.basename(abs)],
    outDir: '.'
  }

  // 单文件：复用批量编译函数（通过 entries 仅匹配该文件路径）
  const singleCfg = (() => {
    if (!loaded) return cfg
    const compileRoot = path.resolve(cfgDir, cfg.compileRoot)
    const rel = path.relative(compileRoot, abs).replace(/\\/g, '/')
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(
        `[error] file is outside compileRoot: ${abs} (compileRoot=${compileRoot}) (try use -c or adjust compileRoot)`
      )
    }
    return { ...cfg, entries: [rel] }
  })()
  ui.info(t('startCompile'))
  const { entryOutFiles } = await compileTsToGs({
    cfgDir,
    cfg: singleCfg,
    onWriteGs: (p) => ui.ok(p)
  })

  const gsFile = entryOutFiles[0]
  if (!gsFile) {
    ui.warn(t('warnNotEntry'))
    return
  }

  console.log('')
  ui.info(t('startGia'))
  await emitIrJsonForEntries([gsFile], {
    cwd: cfgDir,
    runtimeOptions: {
      precompileExpression: singleCfg.options?.optimize?.precompileExpression ?? true,
      removeUnusedNodes: singleCfg.options?.optimize?.removeUnusedNodes ?? true
    }
  })
  const irPath = resolveIrOutputPath(gsFile)
  finalizeDiagnostics(opts, diagnosticsDir)
  const signalRegistry = injectCfg
    ? createSignalRegistry(readRegisteredSignalsFromGil(resolveGilTarget(injectCfg).gilPath))
    : undefined
  const giaOut = writeGiaFromOutJson(
    irPath,
    undefined,
    (x) => ui.ok(`${x.giaPath} (id=${x.graphId})`),
    signalRegistry
  )
  // 单文件模式：允许使用 config.inject.nodeGraphId 覆盖目标 id
  giaOut.forEach((x) => maybeInjectGia(x.giaPath, opts, injectCfg, true, lang))
}

async function main() {
  const pre = preparseArgv(process.argv.slice(2))
  const preLoaded = await loadConfigOrNull({ config: pre.config, lang: pre.lang }, 'project')
  const lang = detectLang(pre.lang ?? (preLoaded && !pre.lang ? preLoaded.cfg.lang : undefined))
  const { t } = initCliI18n(lang)

  program
    .name('gsts')
    .description(t('desc'))
    .option('-c, --config <file>', t('optConfig'))
    .option('--noinject', t('optNoInject'))
    .option('--stage3-shared-impl-beta', t('optStage3SharedImplBeta'))
    .option('--strict-warnings', 'fail the build when compiler warnings are emitted')
    .option('--warnings-json <file>', 'write compiler diagnostics as JSON')
    .option('--lang <lang>', t('optLang'))
    .argument('[file]', t('argFile'))
    .showHelpAfterError(t('helpAfterError'))
    .action(async (file: string | undefined) => {
      const opts = program.opts<GlobalOptions>()
      if (file) await runSingle(file, opts)
      else {
        const res = await runBatch(opts)
        maybeExtractResources({
          cfgDir: res.cfgDir,
          injectCfg: res.cfg.inject,
          opts,
          lang: res.lang
        })
      }
    })

  program
    .command('dev')
    .description(t('cmdDev'))
    .action(async () => {
      const opts = program.opts<GlobalOptions>()
      await runDev(opts)
    })

  program
    .command('maps')
    .description(t('cmdMaps'))
    .option('--format <format>', 'output format: text or json', 'text')
    .option('--include-hash', 'include SHA-256 for each map')
    .action(async (commandOptions: { format?: string; includeHash?: boolean }) => {
      if (commandOptions.format !== 'text' && commandOptions.format !== 'json') {
        throw new Error('[error] --format must be text or json')
      }
      const opts = program.opts<GlobalOptions>()
      await runMaps(opts, commandOptions)
    })

  program
    .command('maps:rename')
    .description(t('cmdMapsRename'))
    .requiredOption('--map-id <id>', t('mapsOptMapId'))
    .requiredOption('--name <name>', t('mapsOptName'))
    .action(async (commandOptions: { mapId: string; name: string }) => {
      const opts = program.opts<GlobalOptions>()
      await runMapsRename(opts, commandOptions)
    })

  program
    .command('maps:create')
    .description(t('cmdMapsCreate'))
    .requiredOption('--name <name>', t('mapsOptName'))
    .option('--graphs <names>', t('mapsOptGraphs'))
    .action(async (commandOptions: { name: string; graphs?: string }) => {
      const opts = program.opts<GlobalOptions>()
      await runMapsCreate(opts, commandOptions)
    })

  program
    .command('maps:init')
    .description('bootstrap a fresh map with engine skeleton fields (root 3-49) from template')
    .requiredOption('--map-id <id>', t('mapsOptMapId'))
    .option('--template <file>', 'first-save template GIL (default: resources/first-save-template.gil)')
    .option('--write', 'write source GIL after backup')
    .action(async (commandOptions: { mapId: string; template?: string; write?: boolean }) => {
      const opts = program.opts<GlobalOptions>()
      await runMapsInit(opts, commandOptions)
    })

  program
    .command('maps:resync')
    .description(t('cmdMapsResync'))
    .requiredOption('--map-id <id>', t('mapsOptMapId'))
    .action(async (commandOptions: { mapId: string }) => {
      const opts = program.opts<GlobalOptions>()
      await runMapsResync(opts, commandOptions)
    })

  program
    .command('assets:static-assemblies')
    .description(t('cmdAssetsStaticAssemblies'))
    .option('--asset-config <file>', t('staticAssembliesOptConfig'))
    .option('--config <file>', `${t('staticAssembliesOptConfig')} (deprecated alias)`)
    .option('--map-id <id>', t('staticAssembliesOptMapId'))
    .option('--gil <file>', t('staticAssembliesOptGil'))
    .option('--assembly <index>', t('staticAssembliesOptAssembly'))
    .option('--format <format>', 'output format: text or json')
    .option('--output <file>', t('staticAssembliesOptOutput'))
    .option('--write', t('staticAssembliesOptWrite'))
    .addHelpText(
      'after',
      `\n${t('staticAssembliesHelpModes')}\n${t('staticAssembliesHelpBoundary')}`
    )
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:static-assemblies')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      await runAssetsStaticAssemblies(args, { projectConfigPath })
    })

  program
    .command('assets:library-inject')
    .description(t('cmdAssetsLibraryInject'))
    .option('--gil <file>', 'source .gil (required)')
    .option('--list', 'list material library contents (read-only)')
    .option('--css <dir>', 'CSS asset directory (default assets/images)')
    .option('--names <a,b>', 'inject only named assets (comma separated)')
    .option('--group-name <s>', 'asset group name (default: 图片)')
    .option('--output <file>', 'write candidate file + independent read-back verify')
    .option('--write', 'write back to source .gil (auto backup + Temp sync)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:library-inject')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      await runLibraryInject(args)
    })

  program
    .command('assets:entities')
    .description('export or import scene entities (root 5) of a GIL map')
    .option('--entities <file>', 'entity import JSON (import only)')
    .option('--map-id <id>', 'target map ID (location only; requires project config)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--format <format>', 'output format: text or json')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup (import only)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:entities')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      await runAssetsEntities(args, { projectConfigPath })
    })

  program
    .command('assets:terrain')
    .description('read or set the terrain/grass tile grid (root 7 f4) of a GIL map')
    .option('--col-min <n>', 'minimum column index (inclusive)')
    .option('--col-max <n>', 'maximum column index (inclusive)')
    .option('--row-min <n>', 'minimum row index (inclusive)')
    .option('--row-max <n>', 'maximum row index (inclusive)')
    .option('--map-id <id>', 'target map ID (location only; requires project config)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--format <format>', 'output format: text or json')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:terrain')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      if (projectConfigPath) process.env.GSTS_CONFIG = projectConfigPath
      await runAssetsTerrain(args)
    })

  program
    .command('assets:ui')
    .description('list, clone (create) or update screen UI controls (root 9)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .option('--format <format>', 'output format: text or json')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:ui')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      const projectConfig = projectConfigPath
        ? await loadGstsConfig(projectConfigPath, { profile: 'project' })
        : undefined
      await runAssetsUi(args, projectConfig)
    })

  program
    .command('assets:level-variables')
    .description('list or create level variables (关卡变量, root5 level entity)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .option('--format <format>', 'output format: text or json')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:level-variables')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      const projectConfig = projectConfigPath
        ? await loadGstsConfig(projectConfigPath, { profile: 'project' })
        : undefined
      await runAssetsLevelVariables(args, projectConfig)
    })

  program
    .command('assets:prefabs')
    .description('create a new custom prefab (元件) copied from an official base prefab')
    .option('--gil <file>', 'explicit GIL source')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .option('--format <format>', 'output format: text or json')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:prefabs')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      const projectConfig = projectConfigPath
        ? await loadGstsConfig(projectConfigPath, { profile: 'project' })
        : undefined
      await runAssetsPrefabs(args, projectConfig)
    })

  program
    .command('assets:gadgets')
    .description('query official gadget/prefab entity data from the public Miliastra data API')
    .option('--format <format>', 'output format: text or json')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:gadgets')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      await runAssetsGadgets(args)
    })

  program
    .command('assets:resources')
    .description('list and parse user map resources: 元件资源 (root4 definitions + root8 official/static instances) and 摆放实体 (root5 scene entities)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--map-id <id>', 'target map ID (location only; requires project config)')
    .option('--format <format>', 'output format: text or json')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:resources')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      const projectConfig = projectConfigPath
        ? await loadGstsConfig(projectConfigPath, { profile: 'project' })
        : undefined
      await runAssetsResources(args, projectConfig)
    })

  program
    .command('assets:aux')
    .description('attach an auxiliary decoration (装饰物, root 27 aux) to an entity/prefab/model host')
    .option('--gil <file>', 'explicit GIL source')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .option('--format <format>', 'output format: text or json')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:aux')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      const projectConfig = projectConfigPath
        ? await loadGstsConfig(projectConfigPath, { profile: 'project' })
        : undefined
      await runAssetsAux(args, projectConfig)
    })

  program
    .command('assets:mounts')
    .description('mount or unmount a NodeGraph on a definition or scene entity (type 3 slot)')
    .option('--config <file>', 'project config (for --map-id resolution)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--map-id <id>', 'target map ID (location only; requires project config)')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:mounts')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      await runAssetsMounts(args, { projectConfigPath })
    })

  program
    .command('assets:node-graphs')
    .description(t('cmdAssetsNodeGraphs'))
    .option('--config <file>', 'project config (for --map-id resolution)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--map-id <id>', 'target map ID (location only; requires project config)')
    .option('--name <string>', 'new NodeGraph name (default: 新建节点图)')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:node-graphs')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      await runAssetsNodeGraphs(args, { projectConfigPath })
    })

  program
    .command('assets:skill-config')
    .description('create or list skill config assets in a map GIL')
    .option('--config <file>', 'project config (for --map-id resolution)')
    .option('--gil <file>', 'explicit GIL source')
    .option('--map-id <id>', 'target map ID (location only; requires project config)')
    .option('--output <file>', 'create output without overwriting')
    .option('--write', 'write source GIL after backup')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:skill-config')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      await runAssetsSkillConfig(args, { projectConfigPath })
    })

  program
    .command('assets:signals')
    .description('inspect or register signals in a map GIL')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('assets:signals')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      const opts = program.opts<GlobalOptions>()
      const projectConfigPath = opts.config ? path.resolve(opts.config) : undefined
      await runAssetsSignals(args, { projectConfigPath })
    })

  program
    .command('assets:custom-variables')
    .description('preview or write configured GIL custom variables')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const args = process.argv.slice(3).filter((arg) => arg !== '--')
      await runAssetsCustomVariables(args)
    })

  program
    .command('variables:verify')
    .description(
      'verify variable wire against the closed rules table (read-only; PASS/DIFF report)'
    )
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const commandIndex = process.argv.indexOf('variables:verify')
      const args = process.argv.slice(commandIndex + 1).filter((arg) => arg !== '--')
      await runVariablesVerify(args)
    })

  program
    .command('image:import')
    .description('parse CSS/JSON/SVG into a normalized Miliastra SceneDocument JSON')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const args = process.argv.slice(3).filter((arg) => arg !== '--')
      await runImageEditor(['import', ...args])
    })

  program
    .command('image:export')
    .description('render a SceneDocument JSON to CSS/SVG/JSON or GIA (image mode)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const args = process.argv.slice(3).filter((arg) => arg !== '--')
      await runImageEditor(['export', ...args])
    })

  program
    .command('image:serve')
    .description('start the local image editor web UI (preview/edit/export GIA/import to game)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const args = process.argv.slice(3).filter((arg) => arg !== '--')
      await runImageEditor(['serve', ...args])
    })

  program
    .command('image:games')
    .description('scan and list every detected game Beyond_Local_Export dir')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const args = process.argv.slice(3).filter((arg) => arg !== '--')
      await runImageEditor(['games', ...args])
    })

  program
    .command('image:inject')
    .description('convert asset file(s) to GIA and write them into a game Beyond_Local_Export')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .action(async () => {
      const args = process.argv.slice(3).filter((arg) => arg !== '--')
      await runImageEditor(['inject', ...args])
    })

  program
    .command('open')
    .description(t('openDesc'))
    .argument('[target]', t('openArg'))
    .action(async (target: string | undefined) => {
      const opts = program.opts<GlobalOptions>()
      await runOpen(target, opts)
    })

  program
    .command('help')
    .description(t('cmdHelp'))
    .action(() => {
      program.help()
    })

  await program.parseAsync()
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  ui.error(msg.replace('[error]', '').trim())
  process.exitCode = 1
})
