import type { Rule } from 'eslint'
import ts from 'typescript'

import {
  isConstEvaluableExpression,
  isPureLiteralExpression
} from '../../compiler/ts_to_gs_transform/const_eval.js'
import {
  CLIENT_ENTITY_HELPER_BINDINGS_BY_SUB_TYPE_AND_MODE,
  type ClientEntityHelperBinding
} from '../../definitions/client_entity_helpers.js'
import { CLIENT_GRAPH_SUB_TYPE_BY_F_GLOBAL_NAME } from '../../definitions/client_graph_modes.js'
import { CLIENT_LITERAL_ARGUMENT_INDEXES_BY_SUB_TYPE } from '../../definitions/client_method_modes.js'
import { getClientFMethodNameFromAlias } from '../../definitions/client_zh_aliases.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildNodeGraphScopeIndex, type ClientScopeInfo } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }
const LITERAL_WRAPPERS = new Set([
  'Boolean',
  'Number',
  'String',
  'bool',
  'configId',
  'defineSignal',
  'faction',
  'float',
  'guid',
  'int',
  'prefabId',
  'raw',
  'str',
  'vec3'
])

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function resolveSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol
}

function isConstVariableDeclaration(declaration: ts.VariableDeclaration): boolean {
  return (
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0
  )
}

function isLiteralArgument(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seen = new Set<ts.Symbol>()
): boolean {
  const current = unwrapExpression(expression)
  if (isPureLiteralExpression(current) || isConstEvaluableExpression({ checker }, current)) {
    return true
  }

  if (ts.isArrayLiteralExpression(current)) {
    return current.elements.every((element) =>
      ts.isSpreadElement(element)
        ? isLiteralArgument(element.expression, checker, new Set(seen))
        : isLiteralArgument(element, checker, new Set(seen))
    )
  }

  if (ts.isTemplateExpression(current)) {
    return current.templateSpans.every((span) =>
      isLiteralArgument(span.expression, checker, new Set(seen))
    )
  }

  if (ts.isCallExpression(current)) {
    return (
      ts.isIdentifier(current.expression) &&
      LITERAL_WRAPPERS.has(current.expression.text) &&
      current.arguments.every((argument) => isLiteralArgument(argument, checker, new Set(seen)))
    )
  }

  if (ts.isIdentifier(current)) {
    const symbol = checker.getSymbolAtLocation(current)
    if (!symbol) return false
    const resolved = resolveSymbol(symbol, checker)
    if (seen.has(resolved)) return false
    seen.add(resolved)
    for (const declaration of resolved.declarations ?? []) {
      if (
        ts.isVariableDeclaration(declaration) &&
        isConstVariableDeclaration(declaration) &&
        declaration.initializer &&
        isLiteralArgument(declaration.initializer, checker, seen)
      ) {
        return true
      }
    }
    return false
  }

  if (ts.isPropertyAccessExpression(current)) {
    const symbol = checker.getSymbolAtLocation(current.name)
    if (!symbol) return false
    const resolved = resolveSymbol(symbol, checker)
    if (seen.has(resolved)) return false
    seen.add(resolved)
    for (const declaration of resolved.declarations ?? []) {
      if (ts.isEnumMember(declaration)) return true
      if (
        ts.isPropertyDeclaration(declaration) &&
        declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) &&
        declaration.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)
      ) {
        return true
      }
      if (
        ts.isPropertyAssignment(declaration) &&
        isLiteralArgument(declaration.initializer, checker, seen)
      ) {
        return true
      }
    }
  }

  return false
}

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
