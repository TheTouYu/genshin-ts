import type { Rule } from 'eslint'

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
    const message = formatMessage(
      options.lang,
      '节点图回调内部不支持函数/类声明，请移到顶层并使用匹配图类型的 gsts 函数名前缀',
      'Function/class declarations inside node graph callbacks are not supported; move them to top level and use a gsts function prefix matching the graph type'
    )

    const check = (node: any) => {
      if (!scopeIndex.isInServerScope(node, options)) return
      if (
        node.parent?.type === 'Program' ||
        node.parent?.type === 'ExportNamedDeclaration' ||
        node.parent?.type === 'ExportDefaultDeclaration'
      ) {
        return
      }
      context.report({ node, message })
    }

    return {
      FunctionDeclaration: check,
      ClassDeclaration: check
    }
  }
}

export default rule
