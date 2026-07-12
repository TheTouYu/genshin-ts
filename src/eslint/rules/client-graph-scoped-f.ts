import type { Rule } from 'eslint'

import { CLIENT_GRAPH_SUB_TYPE_BY_F_GLOBAL_NAME } from '../../definitions/client_graph_modes.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

function getGstsMemberName(node: any): string | undefined {
  if (node.type !== 'MemberExpression' || node.computed) return undefined
  if (node.property?.type !== 'Identifier') return undefined
  if (node.object?.type === 'Identifier' && node.object.name === 'gsts') {
    return node.property.name
  }
  const object = node.object
  if (
    object?.type === 'MemberExpression' &&
    !object.computed &&
    object.object?.type === 'Identifier' &&
    object.object.name === 'globalThis' &&
    object.property?.type === 'Identifier' &&
    object.property.name === 'gsts'
  ) {
    return node.property.name
  }
  return undefined
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'enforce subtype-specific gsts.f namespaces for client graph handlers'
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
    const scopeIndex = buildNodeGraphScopeIndex(context)

    return {
      MemberExpression(node: any) {
        const name = getGstsMemberName(node)
        if (!name) return
        const clientInfo = scopeIndex.getEnclosingClientScope(node)

        if (name === 'f' || name === 'fServer') {
          if (!clientInfo) return
          context.report({
            node,
            message: formatMessage(
              options.lang,
              `${name === 'f' ? 'gsts.f' : 'gsts.fServer'} 是服务器节点命名空间，不能在客户端图 ${clientInfo.subType} 中使用`,
              `${name === 'f' ? 'gsts.f' : 'gsts.fServer'} is a server namespace and cannot be used in client graph ${clientInfo.subType}`
            )
          })
          return
        }

        const expectedSubType = (CLIENT_GRAPH_SUB_TYPE_BY_F_GLOBAL_NAME as Record<string, string>)[
          name
        ]
        if (!expectedSubType) return
        if (!clientInfo) {
          context.report({
            node,
            message: formatMessage(
              options.lang,
              `gsts.${name} 只能在匹配的 ${expectedSubType} 客户端图 handler 内使用`,
              `gsts.${name} is only available inside a matching ${expectedSubType} client graph handler`
            )
          })
          return
        }
        if (clientInfo.subType !== expectedSubType) {
          context.report({
            node,
            message: formatMessage(
              options.lang,
              `gsts.${name} 属于 ${expectedSubType}，不能在 ${clientInfo.subType} 客户端图中使用`,
              `gsts.${name} belongs to ${expectedSubType} and cannot be used in client graph ${clientInfo.subType}`
            )
          })
        }
      }
    }
  }
}

export default rule
