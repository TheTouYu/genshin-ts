import type { Rule } from 'eslint'

import { getMemberName } from '../utils/ast.js'
import { inferListTypeFromExpression } from '../utils/list.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  supportedTypes?: string[]
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  supportedTypes: ['int', 'float', 'bool', 'str', 'vec3'],
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

// These methods must synthesize a value for an empty/no-match list. The compiler
// can currently create defaults only for the configured scalar/vector types.
const DEFAULT_VALUE_METHODS = new Set(['find', 'pop', 'shift'])

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          supportedTypes: { type: 'array', items: { type: 'string' } },
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
    const supported = new Set(options.supportedTypes)

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!node.callee || node.callee.type !== 'MemberExpression') return
        const method = getMemberName(node.callee)
        if (!method || !DEFAULT_VALUE_METHODS.has(method)) return
        const tsTarget = services.esTreeNodeToTSNodeMap.get(node.callee.object)
        if (!tsTarget) return
        const listType = inferListTypeFromExpression(checker, tsTarget)
        if (!listType) return
        if (supported.has(listType)) return
        context.report({
          node: node.callee.property,
          message: formatMessage(
            options.lang,
            `${method}() 仅支持列表类型: ${options.supportedTypes.join('/')}`,
            `${method}() only supports list types: ${options.supportedTypes.join('/')}`
          )
        })
      }
    }
  }
}

export default rule
