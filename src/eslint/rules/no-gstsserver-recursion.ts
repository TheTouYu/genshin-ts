import type { Rule } from 'eslint'
import ts from 'typescript'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices, getSourceCode } from '../utils/parser.js'
import {
  DEFAULT_GSTS_FUNCTION_PREFIXES,
  getCallSymbol,
  isFunctionInitializer,
  isGstsServerName,
  resolveAliasedSymbol
} from '../utils/ts_matchers.js'

type Options = {
  prefixes?: string[]
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = {
  prefixes: [...DEFAULT_GSTS_FUNCTION_PREFIXES],
  lang: 'both'
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          prefixes: { type: 'array', items: { type: 'string' } },
          lang: { enum: ['zh', 'en', 'both'] }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const raw = (context.options[0] ?? {}) as Options
    const options = readBaseOptions(raw, DEFAULTS)
    const services = getParserServices(context)
    if (!services) return {}
    const checker = services.program.getTypeChecker()
    const sourceCode = getSourceCode(context)
    const tsRoot = services.esTreeNodeToTSNodeMap.get(sourceCode.ast) as ts.SourceFile

    return {
      'Program:exit'() {
        const decls: {
          symbol: ts.Symbol
          fn: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction
        }[] = []
        const seen = new Set<ts.Symbol>()

        for (const stmt of tsRoot.statements) {
          if (
            ts.isFunctionDeclaration(stmt) &&
            isGstsServerName(stmt.name?.text, options.prefixes)
          ) {
            const sym = stmt.name ? checker.getSymbolAtLocation(stmt.name) : null
            if (sym && !seen.has(sym)) {
              seen.add(sym)
              decls.push({ symbol: sym, fn: stmt })
            }
            continue
          }
          if (ts.isVariableStatement(stmt)) {
            for (const decl of stmt.declarationList.declarations) {
              if (!ts.isIdentifier(decl.name)) continue
              if (!isGstsServerName(decl.name.text, options.prefixes)) continue
              if (!isFunctionInitializer(decl.initializer)) continue
              const sym = checker.getSymbolAtLocation(decl.name)
              if (sym && !seen.has(sym)) {
                seen.add(sym)
                decls.push({ symbol: sym, fn: decl.initializer })
              }
            }
          }
        }

        if (!decls.length) return

        const edges = new Map<ts.Symbol, { target: ts.Symbol; call: ts.CallExpression }[]>()

        const bySymbol = new Set<ts.Symbol>()
        for (const info of decls) {
          bySymbol.add(info.symbol)
        }

        for (const info of decls) {
          const calls: { target: ts.Symbol; call: ts.CallExpression }[] = []
          const visit = (node: ts.Node) => {
            if (ts.isCallExpression(node)) {
              const sym = getCallSymbol(node, checker)
              if (sym) {
                const target = resolveAliasedSymbol(sym, checker)
                if (bySymbol.has(target)) calls.push({ target, call: node })
              }
            }
            ts.forEachChild(node, visit)
          }
          if (info.fn.body) visit(info.fn.body)
          edges.set(info.symbol, calls)
        }

        const state = new Map<ts.Symbol, 0 | 1 | 2>()

        const dfs = (sym: ts.Symbol) => {
          state.set(sym, 1)
          const list = edges.get(sym) ?? []
          for (const edge of list) {
            const st = state.get(edge.target) ?? 0
            if (st === 1) {
              const esNode = services.tsNodeToESTreeNodeMap.get(edge.call) as any
              if (esNode) {
                context.report({
                  node: esNode,
                  message: formatMessage(
                    options.lang,
                    '节点图函数禁止递归',
                    'Node-graph functions must not be recursive'
                  )
                })
              }
              continue
            }
            if (st === 0) dfs(edge.target)
          }
          state.set(sym, 2)
        }

        for (const info of decls) {
          const st = state.get(info.symbol) ?? 0
          if (st === 0) dfs(info.symbol)
        }
      }
    }
  }
}

export default rule
