import type { Rule } from 'eslint'

import { getMemberName, isIdentifier } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  allow?: string[]
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  allow: [],
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
          allow: { type: 'array', items: { type: 'string' } },
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
    const allow = new Set(options.allow)

    return {
      MemberExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!isIdentifier(node.object, 'Object')) return
        const name = getMemberName(node)
        if (name && allow.has(name)) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            'Object.函数不会被编译器处理, 除非你明确知道在做什么, 否则不要使用',
            'Object.* is not handled by the compiler; avoid unless you know exactly what you’re doing'
          )
        })
      }
    }
  }
}

export default rule
