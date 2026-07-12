import type { Rule } from 'eslint'

import { isIdentifier } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
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

const WRAPPERS = new Set(['Number', 'String', 'Boolean'])

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
    const scopeIndex = buildServerScopeIndex(context)

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!isIdentifier(node.callee)) return
        if (!WRAPPERS.has(node.callee.name)) return
        if (node.arguments.length === 1) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            `${node.callee.name}() 仅支持一个参数`,
            `${node.callee.name}() requires exactly one argument`
          )
        })
      }
    }
  }
}

export default rule
