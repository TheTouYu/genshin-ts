import type { Rule } from 'eslint'

import { isIdentifier } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  lang: 'both',
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
      MemberExpression(node) {
        if (!isIdentifier(node.object, 'gsts')) return
        if (node.computed) return
        if (!isIdentifier(node.property, 'f')) return
        if (scopeIndex.getEnclosingClientScope(node)) return
        if (
          scopeIndex.isInServerScope(node, {
            scope: 'server',
            includeNestedFunctions: options.includeNestedFunctions
          })
        ) {
          return
        }
        context.report({
          node,
          message: formatMessage(
            options.lang,
            'gsts.f 仅允许在 g.server().on/onSignal 作用域内使用',
            'gsts.f is only available inside server handlers'
          )
        })
      }
    }
  }
}

export default rule
