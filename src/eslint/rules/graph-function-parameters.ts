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

function reportInvalid(context: Rule.RuleContext, node: any, lang: Options['lang']) {
  context.report({
    node,
    message: formatMessage(
      lang ?? 'both',
      '节点图函数参数必须为标识符且唯一，不支持解构、默认值或 rest',
      'Graph-function parameters must be unique identifiers; no destructuring, defaults, or rest'
    )
  })
}

function checkParams(context: Rule.RuleContext, fn: any, lang: Options['lang']) {
  const seen = new Set<string>()
  for (const param of fn.params ?? []) {
    if (param.type === 'RestElement' || param.type === 'AssignmentPattern') {
      reportInvalid(context, param, lang)
      continue
    }
    if (param.type !== 'Identifier') {
      reportInvalid(context, param, lang)
      continue
    }
    if (seen.has(param.name)) {
      reportInvalid(context, param, lang)
      continue
    }
    seen.add(param.name)
  }
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

    return {
      FunctionDeclaration(node) {
        if (!isGraphFunctionName(node.id?.name, options.prefixes)) return
        checkParams(context, node, options.lang)
      },
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== 'Identifier') return
        if (!isGraphFunctionName(node.id.name, options.prefixes)) return
        if (
          !node.init ||
          (node.init.type !== 'FunctionExpression' && node.init.type !== 'ArrowFunctionExpression')
        ) {
          return
        }
        checkParams(context, node.init, options.lang)
      }
    }
  }
}

export default rule
