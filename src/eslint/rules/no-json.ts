import type { Rule } from 'eslint'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import { isInTypePosition } from '../utils/type_position.js'

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

function isPropertyKey(node: any): boolean {
  return node.parent?.type === 'Property' && node.parent.key === node && !node.parent.computed
}

function isImportName(node: any): boolean {
  return (
    node.parent?.type === 'ImportSpecifier' ||
    node.parent?.type === 'ImportDefaultSpecifier' ||
    node.parent?.type === 'ImportNamespaceSpecifier'
  )
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
    const scopeIndex = buildServerScopeIndex(context)

    return {
      Identifier(node) {
        if (node.name !== 'JSON') return
        if (isPropertyKey(node)) return
        if (isImportName(node)) return
        if (!scopeIndex.isInServerScope(node, options)) return
        const tsNode = services.esTreeNodeToTSNodeMap.get(node)
        if (tsNode && isInTypePosition(tsNode)) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            '编译器不支持处理, 除非你明确知道在做什么, 否则不要使用',
            'Compiler does not support this; avoid unless you know exactly what you’re doing'
          )
        })
      }
    }
  }
}

export default rule
