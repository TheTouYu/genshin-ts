import ts from 'typescript'

import { fail } from './errors.js'
import {
  classifyExpressionSemantics,
  isStorableLocalValueType,
  localValueTypeOf,
  type ExpressionSemantics,
  type StorableLocalValueType
} from './expression_semantics.js'
import type { Env } from './types.js'
import { makeFCall } from './utils.js'

export function assertLocalVariableStorable(
  env: Env,
  node: ts.Node,
  semantics: ExpressionSemantics,
  operation: string
): StorableLocalValueType {
  const valueType = localValueTypeOf(semantics)
  if (valueType) return valueType
  if (semantics.kind === 'composite-result') {
    fail(
      env,
      node,
      'cannot store a complete composite result in LocalVariable; select a named output such as result.x'
    )
  }
  const typeText = semantics.kind === 'unsupported' ? semantics.typeText : semantics.kind
  fail(env, node, `cannot store value of type ${typeText} in LocalVariable (${operation})`)
}

export function makeCheckedLocalVariableInit(
  env: Env,
  node: ts.Node,
  valueType: StorableLocalValueType,
  init?: { source: ts.Expression; transformed: ts.Expression }
): ts.CallExpression {
  if (!isStorableLocalValueType(valueType)) {
    fail(env, node, `cannot initialize LocalVariable with unsupported type ${valueType}`)
  }
  if (init) {
    const actual = assertLocalVariableStorable(
      env,
      init.source,
      classifyExpressionSemantics(env, init.source),
      'initialization'
    )
    if (actual !== valueType) {
      fail(env, init.source, `LocalVariable type mismatch: declared ${valueType}, assigned ${actual}`)
    }
  }
  return makeFCall(env, 'initLocalVariable', [
    ts.factory.createStringLiteral(valueType),
    ...(init ? [init.transformed] : [])
  ])
}

export function makeCheckedLocalVariableSet(
  env: Env,
  source: ts.Expression,
  localVariable: ts.Expression,
  transformedValue: ts.Expression,
  declaredType: StorableLocalValueType
): ts.CallExpression {
  const actual = assertLocalVariableStorable(
    env,
    source,
    classifyExpressionSemantics(env, source),
    'assignment'
  )
  if (actual !== declaredType) {
    fail(env, source, `LocalVariable type mismatch: declared ${declaredType}, assigned ${actual}`)
  }
  return makeFCall(env, 'setLocalVariable', [localVariable, transformedValue])
}

export function makeKnownLocalVariableInit(
  env: Env,
  node: ts.Node,
  valueType: StorableLocalValueType,
  transformedInit?: ts.Expression
): ts.CallExpression {
  if (!isStorableLocalValueType(valueType)) {
    fail(env, node, `cannot initialize LocalVariable with unsupported type ${valueType}`)
  }
  return makeFCall(env, 'initLocalVariable', [
    ts.factory.createStringLiteral(valueType),
    ...(transformedInit ? [transformedInit] : [])
  ])
}

export function makeKnownLocalVariableSet(
  env: Env,
  node: ts.Node,
  localVariable: ts.Expression,
  transformedValue: ts.Expression,
  declaredType: StorableLocalValueType,
  actualType: StorableLocalValueType
): ts.CallExpression {
  if (declaredType !== actualType) {
    fail(env, node, `LocalVariable type mismatch: declared ${declaredType}, assigned ${actualType}`)
  }
  return makeFCall(env, 'setLocalVariable', [localVariable, transformedValue])
}
