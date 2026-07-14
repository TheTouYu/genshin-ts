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
  return methods.has(getClientFMethodName(method))
}

export function assertClientFMethodAvailable(env: Env, method: string, node?: ts.Node): void {
  if (isClientFMethodAvailable(env, method)) return
  const mapped = getClientFMethodName(method)
  const message = `client method "${mapped}" is not available in ${env.clientSubType} ${env.clientMode ?? 'beyond'} mode`
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
  return ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(makeFObjectExpression(env), targetMethod),
    undefined,
    args
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
