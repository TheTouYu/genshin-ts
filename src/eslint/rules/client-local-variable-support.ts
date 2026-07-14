import type { Rule } from 'eslint'

import { clientSubTypeSupportsLocalVariables } from '../utils/client_capabilities.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'reject client syntax that requires unavailable local-variable nodes'
    },
    schema: [
      {
        type: 'object',
        properties: { lang: { enum: ['zh', 'en', 'both'] } },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const options = readBaseOptions((context.options[0] ?? {}) as Options, DEFAULTS)
    const services = getParserServices(context)
    if (!services) return {}
    const scopeIndex = buildNodeGraphScopeIndex(context)

    return {
      ConditionalExpression(node: any) {
        const info = scopeIndex.getEnclosingClientScope(node, { includeNestedFunctions: false })
        if (!info || clientSubTypeSupportsLocalVariables(info.subType)) return
        if (info.subType === 'bool_filter' || info.subType === 'int_filter') return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            `客户端 ${info.subType} 节点图不支持局部变量；三元表达式需要临时局部变量，请改写为 if 分支`,
            `Client ${info.subType} graphs do not support local variables; conditional expressions require a temporary local variable, so rewrite this as if branches`
          )
        })
      }
    }
  }
}

export default rule
