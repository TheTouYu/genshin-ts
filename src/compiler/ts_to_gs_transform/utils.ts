import ts from 'typescript'

import { CLIENT_F_GLOBAL_NAME_BY_SUB_TYPE } from '../../definitions/client_graph_modes.js'
import { CLIENT_NODE_METHODS_BY_SUB_TYPE } from '../../definitions/client_method_modes.js'
import { fail } from './errors.js'
import type { Env } from './types.js'

const CLIENT_METHOD_NAME_ALIASES: Readonly<Record<string, string>> = {
  enumerationsEqual: 'enumerationMatch'
}

const CLIENT_METHOD_SETS = Object.fromEntries(
  Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE).map(([subType, methods]) => [
    subType,
    new Set<string>(methods)
  ])
) as Record<keyof typeof CLIENT_NODE_METHODS_BY_SUB_TYPE, Set<string>>

export function isIdentifierText(expr: ts.Expression, text: string): boolean {
  return ts.isIdentifier(expr) && expr.text === text
}

export function getClientFMethodName(method: string): string {
  return CLIENT_METHOD_NAME_ALIASES[method] ?? method
}

export function isClientFMethodAvailable(env: Env, method: string): boolean {
  if (env.graphDocumentType !== 'client' || !env.clientSubType) return true
  const methods = CLIENT_METHOD_SETS[env.clientSubType]
  if (method === 'initLocalVariable' || method === '__gstsInitLocalVariable') {
    return methods.has('getLocalVariable') && methods.has('setLocalVariable')
  }
  if (method === 'emptyLocalVariableList') {
    return methods.has('getLocalVariable') && methods.has('setLocalVariable')
  }
  if (method === 'listIterationLoop') {
    return (
      methods.has('finiteLoop') &&
      methods.has('getListLength') &&
      methods.has('getCorrespondingValueFromList') &&
      methods.has('subtraction')
    )
  }
  if (method === 'continue') return methods.has('finiteLoop')
  if (method === 'emptyList' || method === 'copyList' || method === 'return') return true
  return methods.has(getClientFMethodName(method))
}

export function assertClientFMethodAvailable(env: Env, method: string, node?: ts.Node): void {
  if (isClientFMethodAvailable(env, method)) return
  const mapped = getClientFMethodName(method)
  const message = `client method "${mapped}" is not available in ${env.clientSubType}`
  if (node) fail(env, node, message)
  throw new Error(`[error] ${message}`)
}

export function makeFObjectExpression(env: Env): ts.Expression {
  if (env.graphDocumentType === 'client' && env.clientSubType) {
    if (env.fIdent) return ts.factory.createIdentifier(env.fIdent)
    return ts.factory.createPropertyAccessExpression(
      ts.factory.createIdentifier(env.gstsIdent),
      CLIENT_F_GLOBAL_NAME_BY_SUB_TYPE[env.clientSubType]
    )
  }
  return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(env.gstsIdent), 'f')
}

export function makeFCall(env: Env, method: string, args: ts.Expression[]) {
  assertClientFMethodAvailable(env, method)
  const targetMethod =
    env.graphDocumentType === 'client'
      ? method === 'initLocalVariable'
        ? '__gstsInitLocalVariable'
        : getClientFMethodName(method)
      : method
  // Transform 内部统一使用服务器节点的参数顺序；客户端同名节点把索引/目标值
  // 放在列表前面，在唯一的 f 调用出口集中适配，避免各 lowering 分支遗漏。
  const targetArgs =
    env.graphDocumentType === 'client' &&
    (targetMethod === 'getCorrespondingValueFromList' || targetMethod === 'listIncludesThisValue')
      ? [args[1], args[0]]
      : args
  return ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(makeFObjectExpression(env), targetMethod),
    undefined,
    targetArgs
  )
}

export function makeDiagnosticProvenance(
  env: Env,
  node: ts.Node,
  originKind = env.diagnosticOriginKind ?? 'user'
): ts.ObjectLiteralExpression {
  const sourceNode = node.pos >= 0 ? node : env.diagnosticNode
  if (!sourceNode) throw new Error('[error] diagnostic provenance requires a source node')
  if (node.pos >= 0 && originKind !== 'runtime-helper') originKind = 'user'
  const { line, character } = env.file.getLineAndCharacterOfPosition(sourceNode.getStart(env.file))
  const properties: ts.ObjectLiteralElementLike[] = [
    ts.factory.createPropertyAssignment(
      'entryFile',
      ts.factory.createStringLiteral(env.file.fileName)
    ),
    ts.factory.createPropertyAssignment(
      'location',
      ts.factory.createObjectLiteralExpression([
        ts.factory.createPropertyAssignment(
          'file',
          ts.factory.createStringLiteral(env.file.fileName)
        ),
        ts.factory.createPropertyAssignment('line', ts.factory.createNumericLiteral(line + 1)),
        ts.factory.createPropertyAssignment(
          'column',
          ts.factory.createNumericLiteral(character + 1)
        )
      ])
    ),
    ts.factory.createPropertyAssignment('originKind', ts.factory.createStringLiteral(originKind))
  ]
  const context = {
    ...(env.eventName ? { event: env.eventName, callback: 'event' } : {}),
    ...env.diagnosticContext
  }
  const contextProperties = Object.entries(context).map(([key, value]) =>
    ts.factory.createPropertyAssignment(key, ts.factory.createStringLiteral(value))
  )
  if (contextProperties.length > 0) {
    properties.push(
      ts.factory.createPropertyAssignment(
        'context',
        ts.factory.createObjectLiteralExpression(contextProperties)
      )
    )
  }
  return ts.factory.createObjectLiteralExpression(properties, true)
}

export function withDiagnosticProvenance(
  env: Env,
  node: ts.Node,
  expression: ts.Expression,
  originKind = env.diagnosticOriginKind ?? 'user'
): ts.CallExpression {
  return ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createPropertyAccessExpression(
          ts.factory.createIdentifier('globalThis'),
          env.gstsIdent
        ),
        'ctx'
      ),
      'withDiagnosticProvenance'
    ),
    undefined,
    [
      makeDiagnosticProvenance(env, node, originKind),
      ts.factory.createArrowFunction(
        undefined,
        undefined,
        [],
        undefined,
        ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        expression
      )
    ]
  )
}

export function withSameRange<T extends ts.Node>(newNode: T, oldNode: ts.Node): T {
  return ts.setTextRange(newNode, oldNode)
}

export function asBlock(stmt: ts.Statement): ts.Block {
  return ts.isBlock(stmt) ? stmt : ts.factory.createBlock([stmt], true)
}

export function isTrueLike(expr: ts.Expression): boolean {
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  return false
}
