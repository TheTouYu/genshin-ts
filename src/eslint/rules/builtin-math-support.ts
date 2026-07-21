import type { Rule } from 'eslint'

import { CLIENT_MATH_METHODS_BY_SUB_TYPE } from '../../definitions/client_math.js'
import { isIdentifier } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import { getNumericKind, isAnyOrUnknown } from '../utils/types.js'

type Options = {
  allowMethods?: string[]
  enforceArgType?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  allowMethods: [],
  enforceArgType: true,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

const METHOD_RULES: Record<string, { exact?: number; min?: number; max?: number }> = {
  abs: { exact: 1 },
  floor: { exact: 1 },
  ceil: { exact: 1 },
  round: { exact: 1 },
  trunc: { exact: 1 },
  pow: { exact: 2 },
  sqrt: { exact: 1 },
  log: { exact: 1 },
  log10: { exact: 1 },
  log2: { exact: 1 },
  sin: { exact: 1 },
  cos: { exact: 1 },
  tan: { exact: 1 },
  asin: { exact: 1 },
  acos: { exact: 1 },
  atan: { exact: 1 },
  random: { exact: 0 },
  min: { min: 1 },
  max: { min: 1 },
  hypot: { min: 2, max: 3 },
  sign: { exact: 1 },
  cbrt: { exact: 1 },
  atan2: { exact: 2 }
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          allowMethods: { type: 'array', items: { type: 'string' } },
          enforceArgType: { type: 'boolean' },
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

    const report = (node: any, message: string) => {
      context.report({ node, message })
    }

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!node.callee || node.callee.type !== 'MemberExpression') return
        if (!isIdentifier(node.callee.object, 'Math')) return
        if (node.callee.computed) return
        const method =
          node.callee.property?.type === 'Identifier' ? node.callee.property.name : null
        if (!method) return
        if (allowMethods.has(method)) return
        const clientInfo = scopeIndex.getEnclosingClientScope(node, {
          includeNestedFunctions: options.includeNestedFunctions
        })
        if (clientInfo) {
          const available = CLIENT_MATH_METHODS_BY_SUB_TYPE[clientInfo.subType]
          if (!(available as readonly string[]).includes(method)) {
            const availableText = available.map((name) => `Math.${name}`).join(', ')
            report(
              node.callee.property,
              formatMessage(
                options.lang,
                `客户端图 ${clientInfo.subType} 不支持 Math.${method}；可用方法：${availableText}`,
                `Math.${method} is not supported in client graph ${clientInfo.subType}; available methods: ${availableText}`
              )
            )
            return
          }
        }
        const rule = METHOD_RULES[method]
        if (!rule) {
          report(
            node.callee.property,
            formatMessage(
              options.lang,
              `不支持的Math方法 "${method}"`,
              `Unsupported Math method "${method}"`
            )
          )
          return
        }
        const argsLen = node.arguments.length
        if (rule.exact !== undefined && argsLen !== rule.exact) {
          report(
            node,
            formatMessage(
              options.lang,
              `Math.${method} 参数数量不正确`,
              `Math.${method} has invalid argument count`
            )
          )
          return
        }
        if (rule.min !== undefined && argsLen < rule.min) {
          report(
            node,
            formatMessage(
              options.lang,
              `Math.${method} 参数数量不正确`,
              `Math.${method} has invalid argument count`
            )
          )
          return
        }
        if (rule.max !== undefined && argsLen > rule.max) {
          report(
            node,
            formatMessage(
              options.lang,
              `Math.${method} 参数数量不正确`,
              `Math.${method} has invalid argument count`
            )
          )
          return
        }
        if (!options.enforceArgType) return
        for (const arg of node.arguments) {
          const tsArg = services.esTreeNodeToTSNodeMap.get(arg)
          if (!tsArg) continue
          const type = checker.getTypeAtLocation(tsArg)
          if (isAnyOrUnknown(type)) continue
          const kind = getNumericKind(checker, type)
          if (kind === 'unknown') {
            report(
              arg,
              formatMessage(
                options.lang,
                'Math 参数必须为数字类型',
                'Math argument must be a number'
              )
            )
            return
          }
        }
      }
    }
  }
}

export default rule
