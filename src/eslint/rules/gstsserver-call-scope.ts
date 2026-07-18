import type { Rule } from 'eslint'
import ts from 'typescript'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import {
  DEFAULT_GSTS_SERVER_PREFIX,
  getGstsClientCallSubType,
  isGstsServerCall
} from '../utils/ts_matchers.js'

type Options = {
  prefixes?: string[]
  lang?: 'zh' | 'en' | 'both'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  prefixes: [DEFAULT_GSTS_SERVER_PREFIX],
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
          prefixes: { type: 'array', items: { type: 'string' } },
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
    const services = getParserServices(context)
    if (!services) return {}
    const checker = services.program.getTypeChecker()
    const scopeIndex = buildServerScopeIndex(context)

    return {
      CallExpression(node) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(node)
        if (!tsNode || !ts.isCallExpression(tsNode)) return
        if (isGstsServerCall(tsNode, checker, options.prefixes)) {
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
              'gstsServer 仅允许在 g.server().on/onSignal 或其他 gstsServer 内调用',
              'gstsServer calls are only allowed inside server scope'
            )
          })
          return
        }

        const targetSubType = getGstsClientCallSubType(tsNode, checker)
        if (!targetSubType) return
        const clientInfo = scopeIndex.getEnclosingClientScope(node, {
          includeNestedFunctions: options.includeNestedFunctions
        })
        if (clientInfo?.subType === targetSubType) return

        context.report({
          node,
          message: formatMessage(
            options.lang,
            `客户端 ${targetSubType} 节点图函数只能在同类型客户端图中调用`,
            `Client ${targetSubType} graph functions can only be called from the same client graph family`
          )
        })
      }
    }
  }
}

export default rule
