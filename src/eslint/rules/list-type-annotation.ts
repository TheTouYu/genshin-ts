import type { Rule } from 'eslint'

import { getMemberName } from '../utils/ast.js'
import { SUPPORTED_LIST_METHODS } from '../utils/list_methods.js'
import { inferListTypeFromExpression, isArrayLikeType } from '../utils/list.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
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

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!node.callee || node.callee.type !== 'MemberExpression') return
        const method = getMemberName(node.callee)
        if (!method || !SUPPORTED_LIST_METHODS.has(method)) return
        const tsTarget = services.esTreeNodeToTSNodeMap.get(node.callee.object)
        if (!tsTarget) return
        const type = checker.getTypeAtLocation(tsTarget)
        if (!isArrayLikeType(checker, type)) return
        const listType = inferListTypeFromExpression(checker, tsTarget)
        if (listType) return
        context.report({
          node: node.callee.property,
          message: formatMessage(
            options.lang,
            `无法推断列表元素类型, 请补充类型注解`,
            'Cannot infer list element type; add a type annotation'
          )
        })
      }
    }
  }
}

export default rule
