import ts from 'typescript'

import { inferConcreteTypeFromType, inferListTypeFromType } from '../../shared/ts_list_utils.js'
import { inferConcreteTypeFromString, inferListTypeFromTypeString } from './lists.js'
import { isFMethodCall } from './matcher.js'
import type { Env } from './types.js'

export type LocalListElementType =
  | 'bool'
  | 'int'
  | 'float'
  | 'str'
  | 'vec3'
  | 'guid'
  | 'entity'
  | 'prefab_id'
  | 'config_id'
  | 'faction'

export type StorableLocalValueType =
  | LocalListElementType
  | `${LocalListElementType}_list`

export type ExpressionSemantics =
  | { kind: 'runtime-value'; valueType: StorableLocalValueType }
  | {
      kind: 'composite-result'
      outputs: ReadonlyMap<string, StorableLocalValueType>
    }
  | {
      kind: 'collection-reference'
      valueType: StorableLocalValueType
      source: 'live' | 'copy' | 'temporary' | 'unknown'
    }
  | { kind: 'timer-handle' }
  | { kind: 'flow-marker' }
  | { kind: 'unsupported'; typeText: string; reason: string }

export function isStorableLocalValueType(value: string): value is StorableLocalValueType {
  const base = value.endsWith('_list') ? value.slice(0, -5) : value
  return (
    base === 'bool' ||
    base === 'int' ||
    base === 'float' ||
    base === 'str' ||
    base === 'vec3' ||
    base === 'guid' ||
    base === 'entity' ||
    base === 'prefab_id' ||
    base === 'config_id' ||
    base === 'faction'
  )
}

export function localValueTypeOf(
  semantics: ExpressionSemantics
): StorableLocalValueType | null {
  if (semantics.kind === 'runtime-value' || semantics.kind === 'collection-reference') {
    return semantics.valueType
  }
  return null
}

function unwrapExpression(expr: ts.Expression): ts.Expression {
  let current = expr
  while (true) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression
      continue
    }
    return current
  }
}

function isCompositeCallExpression(expr: ts.Expression): expr is ts.CallExpression {
  const current = unwrapExpression(expr)
  return (
    ts.isCallExpression(current) &&
    ts.isPropertyAccessExpression(current.expression) &&
    current.expression.name.text === 'callComposite' &&
    current.arguments.length > 0
  )
}

function propertyType(
  env: Env,
  type: ts.Type,
  name: string,
  location: ts.Node
): ts.Type | null {
  const property = env.checker.getPropertyOfType(type, name)
  return property ? env.checker.getTypeOfSymbolAtLocation(property, location) : null
}

function literalOutputType(
  env: Env,
  outputType: ts.Type,
  location: ts.Node
): StorableLocalValueType | null {
  const typeProperty = propertyType(env, outputType, 'type', location)
  const value = typeProperty?.isStringLiteral() ? typeProperty.value : null
  return value && isStorableLocalValueType(value) ? value : null
}

function outputTypesFromDefinition(
  env: Env,
  expr: ts.Expression
): ReadonlyMap<string, StorableLocalValueType> | null {
  if (!ts.isIdentifier(expr)) return null
  const declaration = env.checker.getSymbolAtLocation(expr)?.valueDeclaration
  if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer) return null
  const initializer = unwrapExpression(declaration.initializer)
  if (!ts.isCallExpression(initializer) || initializer.arguments.length < 2) return null
  const definition = unwrapExpression(initializer.arguments[1])
  if (!ts.isObjectLiteralExpression(definition)) return null
  const outputsProperty = definition.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === 'outputs') ||
        (ts.isStringLiteral(property.name) && property.name.text === 'outputs'))
  )
  const outputs = outputsProperty ? unwrapExpression(outputsProperty.initializer) : null
  if (!outputs || !ts.isObjectLiteralExpression(outputs)) return null

  const result = new Map<string, StorableLocalValueType>()
  for (const property of outputs.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : null
    const definition = unwrapExpression(property.initializer)
    if (!name || !ts.isObjectLiteralExpression(definition)) continue
    const typeProperty = definition.properties.find(
      (entry): entry is ts.PropertyAssignment =>
        ts.isPropertyAssignment(entry) &&
        ((ts.isIdentifier(entry.name) && entry.name.text === 'type') ||
          (ts.isStringLiteral(entry.name) && entry.name.text === 'type'))
    )
    const value = typeProperty ? unwrapExpression(typeProperty.initializer) : null
    if (value && ts.isStringLiteral(value) && isStorableLocalValueType(value.text)) {
      result.set(name, value.text)
    }
  }
  return result.size > 0 ? result : null
}

function compositeOutputs(
  env: Env,
  call: ts.CallExpression
): ReadonlyMap<string, StorableLocalValueType> | null {
  const handle = call.arguments[0]
  const handleType = env.checker.getTypeAtLocation(handle)
  const outputsType = propertyType(env, handleType, '__outputs', handle)
  if (outputsType) {
    const outputs = new Map<string, StorableLocalValueType>()
    for (const property of env.checker.getPropertiesOfType(outputsType)) {
      const outputType = env.checker.getTypeOfSymbolAtLocation(property, handle)
      const valueType = literalOutputType(env, outputType, handle)
      if (valueType) outputs.set(property.getName(), valueType)
    }
    if (outputs.size > 0) return outputs
  }
  return outputTypesFromDefinition(env, handle)
}

function classifyType(env: Env, type: ts.Type, location: ts.Node): ExpressionSemantics {
  if (type.flags & ts.TypeFlags.Union || type.flags & ts.TypeFlags.Intersection) {
    const parts = (type as ts.UnionOrIntersectionType).types.map((part) =>
      classifyType(env, part, location)
    )
    const first = parts[0]
    if (
      first &&
      parts.every(
        (part) =>
          part.kind === first.kind &&
          localValueTypeOf(part) === localValueTypeOf(first)
      )
    ) {
      return first
    }
    return {
      kind: 'unsupported',
      typeText: env.checker.typeToString(type),
      reason: 'union/intersection branches have incompatible semantics'
    }
  }

  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return {
      kind: 'unsupported',
      typeText: env.checker.typeToString(type),
      reason: 'unknown values are not storable'
    }
  }
  if ((type.flags & ts.TypeFlags.BigIntLike) !== 0) {
    return { kind: 'runtime-value', valueType: 'int' }
  }
  if ((type.flags & ts.TypeFlags.NumberLike) !== 0) {
    return { kind: 'runtime-value', valueType: 'float' }
  }
  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return { kind: 'runtime-value', valueType: 'bool' }
  }
  if ((type.flags & ts.TypeFlags.StringLike) !== 0) {
    return { kind: 'runtime-value', valueType: 'str' }
  }

  const typeText = env.checker.typeToString(type)
  if (typeText === 'Timeout' || typeText === 'NodeJS.Timeout') return { kind: 'timer-handle' }
  if (/\b(FlowMarkerRef|MetaCallRecordRef)\b/.test(typeText)) return { kind: 'flow-marker' }

  const listType =
    inferListTypeFromType(env.checker, type, env.file) ?? inferListTypeFromTypeString(typeText)
  if (listType) {
    return { kind: 'runtime-value', valueType: `${listType}_list` }
  }
  const scalar =
    inferConcreteTypeFromType(env.checker, type, env.file) ??
    inferConcreteTypeFromString(typeText)
  if (scalar && isStorableLocalValueType(scalar)) {
    return { kind: 'runtime-value', valueType: scalar }
  }
  return { kind: 'unsupported', typeText, reason: 'type has no LocalVariable representation' }
}

function collectionSource(
  env: Env,
  expr: ts.Expression
): 'live' | 'copy' | 'temporary' | 'unknown' {
  const current = unwrapExpression(expr)
  if (isFMethodCall(env, current, ['get', 'getNodeGraphVariable', 'getCustomVariable'])) {
    return 'live'
  }
  if (isFMethodCall(env, current, ['copyList'])) return 'copy'
  if (isFMethodCall(env, current, ['assemblyList', 'createDictionary', 'assemblyDictionary'])) {
    return 'temporary'
  }
  if (ts.isArrayLiteralExpression(current) || ts.isObjectLiteralExpression(current)) {
    return 'temporary'
  }
  if (
    ts.isCallExpression(current) &&
    ts.isIdentifier(current.expression) &&
    current.expression.text === 'list'
  ) {
    return 'temporary'
  }
  return 'unknown'
}

export function classifyExpressionSemantics(env: Env, expr: ts.Expression): ExpressionSemantics {
  const current = unwrapExpression(expr)

  if (isCompositeCallExpression(current)) {
    const outputs = compositeOutputs(env, current)
    return outputs
      ? { kind: 'composite-result', outputs }
      : {
          kind: 'unsupported',
          typeText: env.checker.typeToString(env.checker.getTypeAtLocation(current)),
          reason: 'cannot infer composite output declarations'
        }
  }

  if (ts.isPropertyAccessExpression(current)) {
    if (
      current.name.text === 'length' &&
      inferListTypeFromType(
        env.checker,
        env.checker.getTypeAtLocation(current.expression),
        current.expression
      )
    ) {
      return { kind: 'runtime-value', valueType: 'int' }
    }
    if (isCompositeCallExpression(current.expression)) {
      const outputs = compositeOutputs(env, unwrapExpression(current.expression) as ts.CallExpression)
      const valueType = outputs?.get(current.name.text)
      if (valueType) return { kind: 'runtime-value', valueType }
    }
  }

  if (ts.isIdentifier(current)) {
    const symbol = env.checker.getSymbolAtLocation(current)
    const declaration = symbol?.valueDeclaration
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      const declared = classifyExpressionSemantics(env, declaration.initializer)
      if (
        declared.kind === 'composite-result' ||
        declared.kind === 'timer-handle' ||
        declared.kind === 'flow-marker'
      ) {
        return declared
      }
    }
    const plan = symbol ? env.varPlan?.get(symbol) : undefined
    if (plan) return plan.semantics
  }

  if (
    ts.isCallExpression(current) &&
    ((ts.isIdentifier(current.expression) &&
      (current.expression.text === 'setTimeout' || current.expression.text === 'setInterval')) ||
      (ts.isPropertyAccessExpression(current.expression) &&
        ts.isIdentifier(current.expression.expression) &&
        current.expression.expression.text === 'globalThis' &&
        (current.expression.name.text === 'setTimeout' ||
          current.expression.name.text === 'setInterval')))
  ) {
    return { kind: 'timer-handle' }
  }

  const semantics = classifyType(env, env.checker.getTypeAtLocation(current), current)
  const valueType = localValueTypeOf(semantics)
  if (valueType?.endsWith('_list')) {
    return {
      kind: 'collection-reference',
      valueType,
      source: collectionSource(env, current)
    }
  }
  return semantics
}
