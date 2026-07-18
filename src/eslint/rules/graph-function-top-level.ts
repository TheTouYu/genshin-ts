import type { Rule } from 'eslint'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { DEFAULT_GRAPH_FUNCTION_PREFIXES, isGraphFunctionName } from '../utils/ts_matchers.js'

type Options = {
  prefixes?: string[]
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = {
  prefixes: [...DEFAULT_GRAPH_FUNCTION_PREFIXES],
  lang: 'both'
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          prefixes: { type: 'array', items: { type: 'string' } },
          lang: { enum: ['zh', 'en', 'both'] }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const raw = (context.options[0] ?? {}) as Options
    const options = readBaseOptions(raw, DEFAULTS)
    const report = (node: any, message: string) => {
      context.report({ node, message })
    }
    const msg = formatMessage(
      options.lang,
      '节点图函数必须在顶层声明',
      'Graph functions must be declared at top level'
    )
    const msgInit = formatMessage(
      options.lang,
      '节点图函数必须使用函数初始化',
      'Graph functions must be declared with a function initializer'
    )
    const msgAssign = formatMessage(
      options.lang,
      '节点图函数不支持赋值，请声明顶层函数',
      'Graph-function assignment is not supported; declare a top-level function'
    )

    return {
      FunctionDeclaration(node) {
        if (!isGraphFunctionName(node.id?.name, options.prefixes)) return
        if (
          node.parent?.type !== 'Program' &&
          node.parent?.type !== 'ExportNamedDeclaration' &&
          node.parent?.type !== 'ExportDefaultDeclaration'
        )
          report(node, msg)
      },
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== 'Identifier') return
        if (!isGraphFunctionName(node.id.name, options.prefixes)) return
        const decl = node.parent
        const parent = decl?.parent
        if (
          parent?.type !== 'Program' &&
          parent?.type !== 'ExportNamedDeclaration' &&
          parent?.type !== 'ExportDefaultDeclaration'
        ) {
          report(node, msg)
        }
        if (
          !node.init ||
          (node.init.type !== 'FunctionExpression' && node.init.type !== 'ArrowFunctionExpression')
        ) {
          report(node, msgInit)
        }
      },
      AssignmentExpression(node) {
        if (node.left?.type !== 'Identifier') return
        if (!isGraphFunctionName(node.left.name, options.prefixes)) return
        report(node, msgAssign)
      }
    }
  }
}

export default rule
