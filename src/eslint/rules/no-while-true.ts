import type { Rule } from 'eslint'

import { isBooleanLiteral } from '../utils/ast.js'
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
      WhileStatement(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!isBooleanLiteral(node.test, true)) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            '会被自动展开为有限循环, 需要有明确的退出条件. 可通过GstsConfig.options.loopMax配置循环上限, 你也可以选择禁用这条eslint规则',
            'Expanded to a finite loop, you need to provide a clear exit condition. You can configure `GstsConfig.options.loopMax` to limit the loop count. You can also disable this eslint rule'
          )
        })
      }
    }
  }
}

export default rule
