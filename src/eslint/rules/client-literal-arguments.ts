import type { Rule } from 'eslint'
import ts from 'typescript'

import {
  CLIENT_ENTITY_HELPER_BINDINGS_BY_SUB_TYPE_AND_MODE,
  type ClientEntityHelperBinding
} from '../../definitions/client_entity_helpers.js'
import { CLIENT_GRAPH_SUB_TYPE_BY_F_GLOBAL_NAME } from '../../definitions/client_graph_modes.js'
import { CLIENT_LITERAL_ARGUMENT_INDEXES_BY_SUB_TYPE } from '../../definitions/client_method_modes.js'
import { getClientFMethodNameFromAlias } from '../../definitions/client_zh_aliases.js'
import { isLiteralArgument } from '../utils/literal-arguments.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildNodeGraphScopeIndex, type ClientScopeInfo } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

function namespaceSubType(expression: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) return undefined
  const name = expression.name.text
  const subType = (CLIENT_GRAPH_SUB_TYPE_BY_F_GLOBAL_NAME as Record<string, string>)[name]
  if (!subType) return undefined

  const root = expression.expression
  if (ts.isIdentifier(root) && root.text === 'gsts') return subType
  if (
    ts.isPropertyAccessExpression(root) &&
    ts.isIdentifier(root.expression) &&
    root.expression.text === 'globalThis' &&
    root.name.text === 'gsts'
  ) {
    return subType
  }
  return undefined
}

function getClientMethodName(call: ts.CallExpression, info: ClientScopeInfo): string | undefined {
  if (ts.isIdentifier(call.expression) && call.expression.text === 'send') {
    return 'sendSignalToServerNodeGraph'
  }
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined
  const receiver = call.expression.expression
  const directF =
    info.fName !== undefined && ts.isIdentifier(receiver) && receiver.text === info.fName
  const namespace = namespaceSubType(receiver)
  if (!directF && namespace !== info.subType) return undefined
  return getClientFMethodNameFromAlias(info.subType, call.expression.name.text)
}

function getEntityHelperLiteralIndexes(
  call: ts.CallExpression,
  info: ClientScopeInfo,
  checker: ts.TypeChecker
): { helperName: string; indexes: number[] } | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined
  if (
    !checker.getPropertyOfType(
      checker.getTypeAtLocation(call.expression.expression),
      '__entityRuntimeBrand'
    )
  ) {
    return undefined
  }

  const helperName = call.expression.name.text
  const bindingsByMode = (
    CLIENT_ENTITY_HELPER_BINDINGS_BY_SUB_TYPE_AND_MODE as Record<
      string,
      Record<string, Record<string, ClientEntityHelperBinding>>
    >
  )[info.subType]
  if (!bindingsByMode) return undefined

  const indexes = new Set<number>()
  for (const bindings of Object.values(bindingsByMode)) {
    const binding = bindings[helperName]
    if (!binding || binding.kind !== 'method') continue
    const methodIndexes = (
      CLIENT_LITERAL_ARGUMENT_INDEXES_BY_SUB_TYPE as Record<
        string,
        Record<string, readonly number[]>
      >
    )[info.subType]?.[binding.methodName]
    if (!methodIndexes) continue

    for (const methodIndex of methodIndexes) {
      if (binding.insertIndex === methodIndex) continue
      indexes.add(
        binding.insertIndex === null || methodIndex < binding.insertIndex
          ? methodIndex
          : methodIndex - 1
      )
    }
  }

  return indexes.size > 0 ? { helperName, indexes: [...indexes].sort((a, b) => a - b) } : undefined
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require source literals for client node inputs without connection sockets'
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
    const checker = services.program.getTypeChecker()
    const scopeIndex = buildNodeGraphScopeIndex(context)

    return {
      CallExpression(node: any) {
        const info = scopeIndex.getEnclosingClientScope(node)
        if (!info) return
        const tsNode = services.esTreeNodeToTSNodeMap.get(node)
        if (!tsNode || !ts.isCallExpression(tsNode)) return
        const methodName = getClientMethodName(tsNode, info)
        const entityHelper = methodName
          ? undefined
          : getEntityHelperLiteralIndexes(tsNode, info, checker)
        const indexes = methodName
          ? (
              CLIENT_LITERAL_ARGUMENT_INDEXES_BY_SUB_TYPE as Record<
                string,
                Record<string, readonly number[]>
              >
            )[info.subType]?.[methodName]
          : entityHelper?.indexes
        const displayName = methodName ?? entityHelper?.helperName
        if (!indexes || !displayName) return

        for (const index of indexes) {
          const argument = tsNode.arguments[index]
          if (!argument || isLiteralArgument(argument, checker)) continue
          context.report({
            node: node.arguments[index] ?? node,
            message: formatMessage(
              options.lang,
              `客户端方法 ${displayName} 的第 ${index + 1} 个参数仅支持字面量；编辑器没有对应的连接引脚`,
              `Argument ${index + 1} of client method ${displayName} must be a source literal because the editor exposes no connection socket`
            )
          })
        }
      }
    }
  }
}

export default rule
