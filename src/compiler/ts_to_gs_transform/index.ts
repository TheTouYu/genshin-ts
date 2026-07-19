import ts from 'typescript'

import { fail } from './errors.js'
import { isServerOnCall } from './matcher.js'
import { isAssignmentLikeOperator } from './ops.js'
import { transformGstsServerFunction, transformHandler } from './stmt.js'
import { buildFeatureFlags, type EnumImportInfo, type Env, type TransformCtx } from './types.js'

function hasTopLevelDeclName(block: ts.Block, name: string): boolean {
  for (const s of block.statements) {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) return true
      }
      continue
    }
    if (ts.isFunctionDeclaration(s) && s.name?.text === name) return true
    if (ts.isClassDeclaration(s) && s.name?.text === name) return true
  }
  return false
}

const GSTS_SERVER_PREFIX = 'gstsServer'

function isGstsServerName(name: string | undefined): boolean {
  return !!name && name.startsWith(GSTS_SERVER_PREFIX)
}

function isFunctionInitializer(
  expr: ts.Expression | undefined
): expr is ts.FunctionExpression | ts.ArrowFunction {
  return !!expr && (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr))
}

function resolveAliasedSymbol(sym: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  if ((sym.flags & ts.SymbolFlags.Alias) !== 0) {
    return checker.getAliasedSymbol(sym)
  }
  return sym
}

function isGstsServerFunctionDecl(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) return true
  if (ts.isFunctionExpression(node)) return true
  if (ts.isVariableDeclaration(node)) return isFunctionInitializer(node.initializer)
  return false
}

function isGstsServerSymbol(sym: ts.Symbol, checker: ts.TypeChecker): boolean {
  const target = resolveAliasedSymbol(sym, checker)
  if (!isGstsServerName(target.getName())) return false
  const decls = target.getDeclarations() ?? []
  if (!decls.length) return true
  return decls.some((d) => isGstsServerFunctionDecl(d))
}

function getCallSymbol(call: ts.CallExpression, checker: ts.TypeChecker): ts.Symbol | null {
  const callee = call.expression
  if (ts.isIdentifier(callee)) return checker.getSymbolAtLocation(callee) ?? null
  if (ts.isPropertyAccessExpression(callee)) {
    return checker.getSymbolAtLocation(callee.name) ?? checker.getSymbolAtLocation(callee) ?? null
  }
  return checker.getSymbolAtLocation(callee) ?? null
}

function isGstsServerCall(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const sym = getCallSymbol(call, checker)
  if (!sym) return false
  return isGstsServerSymbol(sym, checker)
}

function isDefineCompositeCall(call: ts.CallExpression): boolean {
  const callee = call.expression
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'defineComposite'
}

function isTopLevelVarDeclaration(decl: ts.VariableDeclaration): boolean {
  const list = decl.parent
  if (!ts.isVariableDeclarationList(list)) return false
  const stmt = list.parent
  return ts.isVariableStatement(stmt) && ts.isSourceFile(stmt.parent)
}

const ENUM_MODULE_SPECS = new Set(['genshin-ts/definitions/enum', 'genshin-ts/definitions/enum.js'])

function findEnumImportInfo(sf: ts.SourceFile): EnumImportInfo | undefined {
  let fallbackNamed: EnumImportInfo | undefined
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!ENUM_MODULE_SPECS.has(stmt.moduleSpecifier.text)) continue
    const clause = stmt.importClause
    if (!clause?.namedBindings) continue
    const isTypeOnly = clause.isTypeOnly === true
    if (ts.isNamespaceImport(clause.namedBindings)) {
      return { kind: 'namespace', name: clause.namedBindings.name.text, isTypeOnly }
    }
    if (ts.isNamedImports(clause.namedBindings)) {
      let hasRoundingMode = false
      let localName = 'RoundingMode'
      for (const element of clause.namedBindings.elements) {
        const importName = element.propertyName?.text ?? element.name.text
        if (importName === 'RoundingMode') {
          hasRoundingMode = true
          localName = element.name.text
          break
        }
      }
      const info: EnumImportInfo = {
        kind: 'named',
        name: localName,
        hasRoundingMode,
        isTypeOnly
      }
      if (hasRoundingMode) return info
      if (!fallbackNamed) fallbackNamed = info
    }
  }
  return fallbackNamed
}

function makeRoundingModeImport(moduleSpec: string): ts.ImportDeclaration {
  return ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier('RoundingMode')
        )
      ])
    ),
    ts.factory.createStringLiteral(moduleSpec),
    undefined
  )
}

function ensureEnumImport(sf: ts.SourceFile): ts.SourceFile {
  const statements = [...sf.statements]
  for (let i = 0; i < statements.length; i += 1) {
    const stmt = statements[i]
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!ENUM_MODULE_SPECS.has(stmt.moduleSpecifier.text)) continue

    const clause = stmt.importClause
    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        if (clause.isTypeOnly) {
          const newClause = ts.factory.updateImportClause(
            clause,
            false,
            clause.name,
            clause.namedBindings
          )
          statements[i] = ts.factory.updateImportDeclaration(
            stmt,
            stmt.modifiers,
            newClause,
            stmt.moduleSpecifier,
            stmt.attributes
          )
        }
        return ts.factory.updateSourceFile(sf, statements)
      }

      if (ts.isNamedImports(clause.namedBindings)) {
        const elements = clause.namedBindings.elements
        const hasRoundingMode = elements.some(
          (element) => (element.propertyName?.text ?? element.name.text) === 'RoundingMode'
        )
        const newElements = hasRoundingMode
          ? elements
          : ts.factory.createNodeArray([
              ...elements,
              ts.factory.createImportSpecifier(
                false,
                undefined,
                ts.factory.createIdentifier('RoundingMode')
              )
            ])
        const newClause = ts.factory.updateImportClause(
          clause,
          false,
          clause.name,
          ts.factory.createNamedImports(newElements)
        )
        statements[i] = ts.factory.updateImportDeclaration(
          stmt,
          stmt.modifiers,
          newClause,
          stmt.moduleSpecifier,
          stmt.attributes
        )
        return ts.factory.updateSourceFile(sf, statements)
      }
    }

    if (clause?.name && !clause.namedBindings) {
      const newClause = ts.factory.updateImportClause(
        clause,
        false,
        clause.name,
        ts.factory.createNamedImports([
          ts.factory.createImportSpecifier(
            false,
            undefined,
            ts.factory.createIdentifier('RoundingMode')
          )
        ])
      )
      statements[i] = ts.factory.updateImportDeclaration(
        stmt,
        stmt.modifiers,
        newClause,
        stmt.moduleSpecifier,
        stmt.attributes
      )
      return ts.factory.updateSourceFile(sf, statements)
    }
  }

  const insertAt = (() => {
    let lastImport = -1
    for (let i = 0; i < statements.length; i += 1) {
      if (ts.isImportDeclaration(statements[i])) lastImport = i
    }
    return lastImport + 1
  })()
  statements.splice(insertAt, 0, makeRoundingModeImport('genshin-ts/definitions/enum'))
  return ts.factory.updateSourceFile(sf, statements)
}

export function transformToGs(sf: ts.SourceFile, ctx: TransformCtx): ts.SourceFile {
  const loopMax = ctx.config.options?.loopMax ?? 999
  const features = buildFeatureFlags(ctx.config)
  const enumImport = findEnumImportInfo(sf)
  const needsEnumImportRef = { value: false }
  const makeEnv = (gstsIdent: string, eventName?: string): Env => ({
    gstsIdent,
    config: ctx.config,
    file: sf,
    checker: ctx.checker,
    loopMax,
    tempCounter: 1,
    timerCounterRef: ctx.timerCounterRef,
    features,
    eventName,
    timerHandleMeta: new Map(),
    enumImport,
    needsEnumImportRef
  })

  const baseEnv = makeEnv('gsts')

  const topLevelGstsServerDecls = (() => {
    const out: {
      name: string
      symbol: ts.Symbol | null
      decl: ts.FunctionDeclaration | ts.VariableDeclaration
      fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction
    }[] = []
    const seen = new Set<string>()
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && isGstsServerName(stmt.name?.text)) {
        if (!stmt.name) continue
        if (!stmt.body) {
          fail(baseEnv, stmt, 'gstsServer function must have an implementation body')
        }
        const name = stmt.name.text
        if (seen.has(name)) {
          fail(baseEnv, stmt, `duplicate gstsServer function name: ${name}`)
        }
        seen.add(name)
        const symbol = ctx.checker.getSymbolAtLocation(stmt.name) ?? null
        out.push({ name, symbol, decl: stmt, fn: stmt })
        continue
      }
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue
          const name = decl.name.text
          if (!isGstsServerName(name)) continue
          if (!isFunctionInitializer(decl.initializer)) {
            fail(baseEnv, decl, 'gstsServer function must be declared with a function initializer')
          }
          if (seen.has(name)) {
            fail(baseEnv, decl, `duplicate gstsServer function name: ${name}`)
          }
          seen.add(name)
          const symbol = ctx.checker.getSymbolAtLocation(decl.name) ?? null
          out.push({
            name,
            symbol,
            decl,
            fn: decl.initializer
          })
        }
      }
    }
    return out
  })()

  const validateGstsServerUsage = () => {
    const visit = (node: ts.Node, inServerCtx: boolean) => {
      if (ts.isFunctionDeclaration(node) && isGstsServerName(node.name?.text)) {
        if (!ts.isSourceFile(node.parent)) {
          fail(baseEnv, node, 'gstsServer function must be declared at top-level')
        }
        ts.forEachChild(node, (c) => visit(c, true))
        return
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (isGstsServerName(node.name.text)) {
          if (!isTopLevelVarDeclaration(node)) {
            fail(baseEnv, node, 'gstsServer function must be declared at top-level')
          }
          if (isFunctionInitializer(node.initializer)) {
            visit(node.initializer, true)
            return
          }
        }
      }
      if (ts.isBinaryExpression(node) && isAssignmentLikeOperator(node.operatorToken.kind)) {
        if (ts.isIdentifier(node.left) && isGstsServerName(node.left.text)) {
          fail(
            baseEnv,
            node,
            'gstsServer assignment is not supported (declare a top-level function)'
          )
        }
      }
      if (ts.isCallExpression(node) && isGstsServerCall(node, ctx.checker)) {
        if (!inServerCtx) {
          fail(
            baseEnv,
            node,
            'gstsServer call is only allowed inside g.server().on/onSignal or another gstsServer* function'
          )
        }
      }
      if (
        ts.isCallExpression(node) &&
        isServerOnCall(node, ctx.checker) &&
        node.arguments.length >= 2
      ) {
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
      ts.forEachChild(node, (c) => visit(c, inServerCtx))
    }
    visit(sf, false)
  }

  const detectGstsServerRecursion = () => {
    const bySymbol = new Set<ts.Symbol>()
    for (const info of topLevelGstsServerDecls) {
      if (!info.symbol) continue
      bySymbol.add(info.symbol)
    }
    if (bySymbol.size === 0) return

    const edges = new Map<ts.Symbol, { target: ts.Symbol; call: ts.CallExpression }[]>()

    for (const info of topLevelGstsServerDecls) {
      if (!info.symbol) continue
      const calls: { target: ts.Symbol; call: ts.CallExpression }[] = []
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const sym = getCallSymbol(node, ctx.checker)
          if (sym) {
            const target = resolveAliasedSymbol(sym, ctx.checker)
            if (bySymbol.has(target)) {
              calls.push({ target, call: node })
            }
          }
        }
        ts.forEachChild(node, visit)
      }
      const body = info.fn.body
      if (body) visit(body)
      edges.set(info.symbol, calls)
    }

    const state = new Map<ts.Symbol, 0 | 1 | 2>()

    const dfs = (sym: ts.Symbol) => {
      state.set(sym, 1)
      const list = edges.get(sym) ?? []
      for (const edge of list) {
        const st = state.get(edge.target) ?? 0
        if (st === 1) {
          fail(baseEnv, edge.call, 'gstsServer recursion is not supported')
        }
        if (st === 0) dfs(edge.target)
      }
      state.set(sym, 2)
    }

    for (const sym of bySymbol.keys()) {
      const st = state.get(sym) ?? 0
      if (st === 0) dfs(sym)
    }
  }

  validateGstsServerUsage()
  detectGstsServerRecursion()

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit = (node: ts.Node): ts.Node => {
      if (ts.isCallExpression(node) && isDefineCompositeCall(node) && node.arguments.length >= 2) {
        const defArg = node.arguments[1]
        if (ts.isObjectLiteralExpression(defArg)) {
          const properties = defArg.properties.map((property) => {
            if (ts.isMethodDeclaration(property)) {
              if (!ts.isIdentifier(property.name) || property.name.text !== 'build') {
                return ts.visitNode(property, visit) as ts.ObjectLiteralElementLike
              }
              const build = ts.factory.createFunctionExpression(
                ts.canHaveModifiers(property) ? ts.getModifiers(property) : undefined,
                property.asteriskToken,
                property.name,
                property.typeParameters,
                property.parameters,
                property.type,
                property.body ?? ts.factory.createBlock([], true)
              )
              const gstsIdent = ts.isBlock(build.body) && hasTopLevelDeclName(build.body, 'gsts')
                ? '__gsts'
                : 'gsts'
              const env = makeEnv(gstsIdent)
              const transformed = transformGstsServerFunction(env, context, build)
              return ts.factory.updateMethodDeclaration(
                property,
                ts.canHaveModifiers(property) ? ts.getModifiers(property) : undefined,
                property.asteriskToken,
                property.name,
                property.questionToken,
                property.typeParameters,
                property.parameters,
                property.type,
                transformed.body as ts.Block
              )
            }
            if (
              !ts.isPropertyAssignment(property) ||
              !(ts.isIdentifier(property.name) && property.name.text === 'build')
            ) {
              return ts.visitNode(property, visit) as ts.ObjectLiteralElementLike
            }
            const build = property.initializer
            if (!ts.isArrowFunction(build) && !ts.isFunctionExpression(build)) return property
            const gstsIdent = ts.isBlock(build.body) && hasTopLevelDeclName(build.body, 'gsts')
              ? '__gsts'
              : 'gsts'
            const env = makeEnv(gstsIdent)
            return ts.factory.updatePropertyAssignment(
              property,
              property.name,
              transformHandler(env, context, build)
            )
          })
          const nextDefArg = ts.factory.updateObjectLiteralExpression(defArg, properties)
          const nextArgs = [...node.arguments]
          nextArgs[1] = nextDefArg
          return ts.factory.updateCallExpression(
            node,
            ts.visitNode(node.expression, visit) as ts.Expression,
            node.typeArguments,
            nextArgs
          )
        }
      }

      if (
        ts.isCallExpression(node) &&
        isServerOnCall(node, ctx.checker) &&
        node.arguments.length >= 2
      ) {
        const handler = node.arguments[1]
        if (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) {
          const gstsIdent =
            ts.isBlock(handler.body) && hasTopLevelDeclName(handler.body, 'gsts')
              ? '__gsts'
              : 'gsts'
          const eventArg = node.arguments[0]
          const eventName =
            ts.isStringLiteral(eventArg) || ts.isNoSubstitutionTemplateLiteral(eventArg)
              ? eventArg.text
              : undefined
          const env = makeEnv(gstsIdent, eventName)
          const newHandler = transformHandler(env, context, handler)
          const newArgs = [...node.arguments]
          newArgs[1] = newHandler
          const newCallee = ts.visitNode(node.expression, visit) as ts.Expression
          return ts.factory.updateCallExpression(node, newCallee, node.typeArguments, newArgs)
        }
      }
      if (ts.isFunctionDeclaration(node) && isGstsServerName(node.name?.text)) {
        if (!node.body) return node
        const gstsIdent =
          ts.isBlock(node.body) && hasTopLevelDeclName(node.body, 'gsts') ? '__gsts' : 'gsts'
        const env = makeEnv(gstsIdent)
        return transformGstsServerFunction(env, context, node)
      }
      if (ts.isVariableStatement(node) && ts.isSourceFile(node.parent)) {
        let changed = false
        const decls = node.declarationList.declarations.map((decl) => {
          if (!ts.isIdentifier(decl.name)) return decl
          if (!isGstsServerName(decl.name.text)) return decl
          const init = decl.initializer
          if (!isFunctionInitializer(init)) return decl
          const gstsIdent =
            ts.isBlock(init.body) && hasTopLevelDeclName(init.body, 'gsts') ? '__gsts' : 'gsts'
          const env = makeEnv(gstsIdent)
          const nextInit = transformGstsServerFunction(env, context, init)
          changed = true
          return ts.factory.updateVariableDeclaration(
            decl,
            decl.name,
            decl.exclamationToken,
            decl.type,
            nextInit
          )
        })
        if (changed) {
          return ts.factory.updateVariableStatement(
            node,
            node.modifiers,
            ts.factory.updateVariableDeclarationList(node.declarationList, decls)
          )
        }
      }
      return ts.visitEachChild(node, visit, context)
    }
    return (root) => ts.visitNode(root, visit) as ts.SourceFile
  }

  const res = ts.transform(sf, [transformer])
  const transformed = res.transformed[0]
  return needsEnumImportRef.value ? ensureEnumImport(transformed) : transformed
}

export function hasServerEntryCall(sf: ts.SourceFile, checker: ts.TypeChecker): boolean {
  let found = false
  const visit = (node: ts.Node) => {
    if (found) return
    if (ts.isCallExpression(node) && isServerOnCall(node, checker) && node.arguments.length >= 2) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}
