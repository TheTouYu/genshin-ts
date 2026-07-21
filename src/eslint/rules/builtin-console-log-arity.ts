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
        const callee = node.callee
        if (!callee || callee.type !== 'MemberExpression') return
        if (!isIdentifier(callee.object, 'console')) return
        if (callee.computed) return
        if (!isIdentifier(callee.property, 'log')) return
        if (node.arguments.length === 1) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            'console.log 仅支持一个参数',
            'console.log supports exactly one argument'
          )
        })
      }
    }
  }
}

export default rule
