import type { Rule } from 'eslint'

import { getMemberName } from '../utils/ast.js'
import { SUPPORTED_LIST_METHODS } from '../utils/list_methods.js'
import { inferListTypeFromExpression } from '../utils/list.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  allowMethods?: string[]
  enforceArity?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  allowMethods: [],
  enforceArity: true,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

const ARITY_RULES: Record<string, { min?: number; max?: number; exact?: number }> = {
  forEach: { exact: 1 },
  includes: { exact: 1 },
  indexOf: { exact: 1 },
  map: { exact: 1 },
  filter: { exact: 1 },
  reduce: { exact: 2 },
  some: { exact: 1 },
  every: { exact: 1 },
  find: { exact: 1 },
  findIndex: { exact: 1 },
  push: { exact: 1 },
  unshift: { exact: 1 },
  pop: { exact: 0 },
  shift: { exact: 0 },
  splice: { exact: 2 },
  slice: { max: 2 }
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          allowMethods: { type: 'array', items: { type: 'string' } },
          enforceArity: { type: 'boolean' },
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
    const allowMethods = new Set(options.allowMethods)

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!node.callee || node.callee.type !== 'MemberExpression') return
        const method = getMemberName(node.callee)
        if (!method) return
        if (allowMethods.has(method)) return
        const tsTarget = services.esTreeNodeToTSNodeMap.get(node.callee.object)
        if (!tsTarget) return
        const listType = inferListTypeFromExpression(checker, tsTarget)
        if (!listType) return

        if (!SUPPORTED_LIST_METHODS.has(method)) {
          context.report({
            node: node.callee.property,
            message: formatMessage(
              options.lang,
              `不支持的列表方法 "${method}"`,
              `Unsupported list method "${method}"`
            )
          })
          return
        }

        if (!options.enforceArity) return
        const argsLen = node.arguments.length
        const rule = ARITY_RULES[method]
        if (!rule) return
        if (rule.exact !== undefined && argsLen !== rule.exact) {
          context.report({
            node,
            message: formatMessage(
              options.lang,
              `${method}() 参数数量不正确`,
              `${method}() has invalid argument count`
            )
          })
          return
        }
        if (rule.min !== undefined && argsLen < rule.min) {
          context.report({
            node,
            message: formatMessage(
              options.lang,
              `${method}() 参数数量不正确`,
              `${method}() has invalid argument count`
            )
          })
          return
        }
        if (rule.max !== undefined && argsLen > rule.max) {
          context.report({
            node,
            message: formatMessage(
              options.lang,
              `${method}() 参数数量不正确`,
              `${method}() has invalid argument count`
            )
          })
        }
      }
    }
  }
}

export default rule
