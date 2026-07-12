import type { Rule } from 'eslint'

import { getMemberName } from '../utils/ast.js'
import { CALLBACK_METHODS } from '../utils/list_methods.js'
import { inferListTypeFromExpression } from '../utils/list.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  enforceReturnShape?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  enforceReturnShape: true,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

function hasReturnStatement(node: any): boolean {
  let found = false
  const visit = (n: any) => {
    if (!n || found) return
    if (n.type === 'ReturnStatement') {
      found = true
      return
    }
    for (const key of Object.keys(n)) {
      if (key === 'parent') continue
      const value = (n as any)[key]
      if (Array.isArray(value)) {
        value.forEach((child) => child && visit(child))
      } else if (value && typeof value.type === 'string') {
        visit(value)
      }
    }
  }
  visit(node)
  return found
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          enforceReturnShape: { type: 'boolean' },
          lang: { enum: ['zh', 'en', 'both'] },
          scope: { enum: ['server', 'client', 'nodegraph', 'all'] },
          includeNestedFunctions: { type: 'boolean' }
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
    const scopeIndex = buildServerScopeIndex(context)

    const report = (node: any) => {
      context.report({
        node,
        message: formatMessage(
          options.lang,
          '列表回调返回值不符合要求',
          'Invalid list callback return shape'
        )
      })
    }

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!node.callee || node.callee.type !== 'MemberExpression') return
        const method = getMemberName(node.callee)
        if (!method || !CALLBACK_METHODS.has(method)) return
        const tsTarget = services.esTreeNodeToTSNodeMap.get(node.callee.object)
        if (!tsTarget) return
        const listType = inferListTypeFromExpression(checker, tsTarget)
        if (!listType) return
        const cb = node.arguments[0]
        if (!cb || (cb.type !== 'FunctionExpression' && cb.type !== 'ArrowFunctionExpression'))
          return

        if (method === 'forEach') {
          if (cb.body?.type === 'BlockStatement' && hasReturnStatement(cb.body)) {
            report(cb.body)
          }
          return
        }

        if (!options.enforceReturnShape) return
        if (cb.body?.type === 'BlockStatement') {
          const stmts = cb.body.body ?? []
          if (stmts.length !== 1 || stmts[0].type !== 'ReturnStatement' || !stmts[0].argument) {
            report(cb.body)
          }
          return
        }
      }
    }
  }
}

export default rule
