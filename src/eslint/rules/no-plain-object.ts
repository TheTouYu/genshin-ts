import type { Rule } from 'eslint'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  allowWhenPassedAsArg?: boolean
  allowWrappers?: string[]
  checkNonEmpty?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  allowWhenPassedAsArg: true,
  allowWrappers: ['dict', 'raw'],
  checkNonEmpty: false,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

function isPassedAsArg(node: any): boolean {
  return (
    (node.parent?.type === 'CallExpression' || node.parent?.type === 'NewExpression') &&
    node.parent.arguments?.includes(node)
  )
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          allowWhenPassedAsArg: { type: 'boolean' },
          allowWrappers: { type: 'array', items: { type: 'string' } },
          checkNonEmpty: { type: 'boolean' },
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
      ObjectExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!options.checkNonEmpty && node.properties.length > 0) return
        if (options.allowWhenPassedAsArg && isPassedAsArg(node)) return

        if (
          node.parent?.type === 'CallExpression' &&
          node.parent.callee?.type === 'Identifier' &&
          options.allowWrappers.includes(node.parent.callee.name)
        ) {
          return
        }

        const parent = node.parent
        const isDirectInit =
          (parent?.type === 'VariableDeclarator' && parent.init === node) ||
          (parent?.type === 'AssignmentExpression' && parent.right === node)
        if (!isDirectInit) return

        context.report({
          node,
          message: formatMessage(
            options.lang,
            '建议使用dict()包裹声明节点图字典, 或使用raw()声明js原生对象/表达式, 直接使用{}不会生成对应的节点图语义',
            'Prefer `dict()` for node-graph dictionaries or `raw()` for JS objects; bare `{}` does not produce node-graph semantics'
          )
        })
      }
    }
  }
}

export default rule
