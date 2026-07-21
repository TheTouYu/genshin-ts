import ts from 'typescript'

import { CLIENT_MATH_METHODS_BY_SUB_TYPE } from '../../definitions/client_math.js'
import { fail } from './errors.js'
import {
  inferListElementTypeFromExpression,
  inferListTypeFromExpression,
  isArrayLikeExpression,
  makeIife,
  makeLocalVarInit
} from './list_utils.js'
import { inferConcreteTypeFromString } from './lists.js'
import type { Env } from './types.js'
import { makeFCall, withSameRange } from './utils.js'

export type ExpressionTransformer = (
  env: Env,
  context: ts.TransformationContext,
  expr: ts.Expression
) => ts.Expression

type MathCallTransform = {
  context: ts.TransformationContext
  expr: ts.CallExpression
  transformExpression: ExpressionTransformer
}

type TypeConversionTarget = 'bool' | 'float' | 'int' | 'str'

const floatZero = () => ts.factory.createNumericLiteral(0)
const floatOne = () => ts.factory.createNumericLiteral(1)
const floatPi = () => ts.factory.createNumericLiteral('3.141592653589793')
const floatHalfPi = () => ts.factory.createNumericLiteral('1.5707963267948966')
const floatNegHalfPi = () =>
  ts.factory.createPrefixUnaryExpression(
    ts.SyntaxKind.MinusToken,
    ts.factory.createNumericLiteral('1.5707963267948966')
  )
const floatE = () => ts.factory.createNumericLiteral('2.718281828459045')
const floatOneThird = () => ts.factory.createNumericLiteral('0.3333333333333333')

function makeRoundingMode(env: Env, name: 'RoundDown' | 'RoundUp' | 'RoundToNearest' | 'Truncate') {
  const enumImport = env.enumImport
  if (enumImport?.kind === 'namespace') {
    if (enumImport.isTypeOnly) {
      env.needsEnumImportRef && (env.needsEnumImportRef.value = true)
    }
    return ts.factory.createPropertyAccessExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createIdentifier(enumImport.name),
        'RoundingMode'
      ),
      name
    )
  }

  if (!enumImport || (enumImport.kind === 'named' && !enumImport.hasRoundingMode)) {
    env.needsEnumImportRef && (env.needsEnumImportRef.value = true)
  } else if (enumImport.kind === 'named' && enumImport.isTypeOnly) {
    env.needsEnumImportRef && (env.needsEnumImportRef.value = true)
  }
  const identName = enumImport?.kind === 'named' ? enumImport.name : 'RoundingMode'
  return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier(identName), name)
}

type NumericKind = 'float' | 'int' | 'mixed' | 'unknown'

function getNumericKind(env: Env, t: ts.Type): NumericKind {
  const mergeKinds = (a: NumericKind, b: NumericKind): NumericKind => {
    if (a === 'unknown') return b
    if (b === 'unknown') return a
    if (a === b) return a
    return 'mixed'
  }

  if (t.flags & ts.TypeFlags.Union) {
    const u = t as ts.UnionType
    let kind: NumericKind = 'unknown'
    for (const tt of u.types) {
      kind = mergeKinds(kind, getNumericKind(env, tt))
      if (kind === 'mixed') return 'mixed'
    }
    return kind
  }
  if (t.flags & ts.TypeFlags.Intersection) {
    const it = t as ts.IntersectionType
    let kind: NumericKind = 'unknown'
    for (const tt of it.types) {
      kind = mergeKinds(kind, getNumericKind(env, tt))
      if (kind === 'mixed') return 'mixed'
    }
    return kind
  }

  if ((t.flags & ts.TypeFlags.BigIntLike) !== 0) return 'int'
  if ((t.flags & ts.TypeFlags.NumberLike) !== 0) return 'float'

  const s = env.checker.typeToString(t)
  if (s === 'IntValue') return 'int'
  if (s === 'FloatValue') return 'float'

  const base = inferConcreteTypeFromString(s)
  if (base === 'int') return 'int'
  if (base === 'float') return 'float'
  return 'unknown'
}

function inferNumericKind(env: Env, expr: ts.Expression): NumericKind {
  const t = env.checker.getTypeAtLocation(expr)
  return getNumericKind(env, t)
}

function makeTypeConversion(value: ts.Expression, type: TypeConversionTarget): ts.Expression {
  return ts.factory.createCallExpression(ts.factory.createIdentifier(type), undefined, [value])
}

function coerceFloatArg(env: Env, spec: MathCallTransform, arg: ts.Expression): ts.Expression {
  const kind = inferNumericKind(env, arg)
  if (kind === 'float') return spec.transformExpression(env, spec.context, arg)
  if (kind === 'int' || kind === 'mixed') {
    const valueExpr = spec.transformExpression(env, spec.context, arg)
    return makeTypeConversion(valueExpr, 'float')
  }
  const raw = env.checker.typeToString(env.checker.getTypeAtLocation(arg))
  fail(env, arg, `Math argument must be a number (${raw})`)
}

function coerceNumericArg(env: Env, spec: MathCallTransform, arg: ts.Expression): ts.Expression {
  const kind = inferNumericKind(env, arg)
  if (kind === 'int' || kind === 'float' || kind === 'mixed') {
    return spec.transformExpression(env, spec.context, arg)
  }
  const raw = env.checker.typeToString(env.checker.getTypeAtLocation(arg))
  fail(env, arg, `Math argument must be a number (${raw})`)
}

// js原函数仍需要在runtime模块中使用, 因此不作runtime覆盖, 仅作编译处理
function transformMathCall(env: Env, spec: MathCallTransform): ts.Expression {
  const callee = spec.expr.expression as ts.PropertyAccessExpression
  const method = callee.name.text
  const args = [...spec.expr.arguments]
  const tempId = env.tempCounter++

  if (env.graphDocumentType === 'client' && env.clientSubType) {
    const available = CLIENT_MATH_METHODS_BY_SUB_TYPE[env.clientSubType]
    if (!(available as readonly string[]).includes(method)) {
      const availableText = available.map((name) => `Math.${name}`).join(', ')
      fail(
        env,
        callee.name,
        `Math.${method} is not supported in client graph ${env.clientSubType}; available methods: ${availableText}`
      )
    }
  }

  const expectArgs = (count: number, label: string) => {
    if (args.length !== count) {
      fail(env, spec.expr, `${label} requires exactly ${count} argument(s)`)
    }
  }

  switch (method) {
    case 'abs': {
      expectArgs(1, 'Math.abs')
      const valueExpr = coerceNumericArg(env, spec, args[0])
      return makeFCall(env, 'absoluteValueOperation', [valueExpr])
    }
    case 'floor': {
      expectArgs(1, 'Math.floor')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      if (env.graphDocumentType === 'client') {
        const rounded = ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('Mathf'),
            'FloorToInt'
          ),
          undefined,
          [valueExpr]
        )
        return makeTypeConversion(rounded, 'float')
      }
      return makeFCall(env, 'roundToIntegerOperation', [
        valueExpr,
        makeRoundingMode(env, 'RoundDown')
      ])
    }
    case 'ceil': {
      expectArgs(1, 'Math.ceil')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      if (env.graphDocumentType === 'client') {
        const rounded = ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('Mathf'),
            'CeilToInt'
          ),
          undefined,
          [valueExpr]
        )
        return makeTypeConversion(rounded, 'float')
      }
      return makeFCall(env, 'roundToIntegerOperation', [
        valueExpr,
        makeRoundingMode(env, 'RoundUp')
      ])
    }
    case 'round': {
      expectArgs(1, 'Math.round')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      if (env.graphDocumentType === 'client') {
        const shifted = makeFCall(env, 'addition', [
          valueExpr,
          ts.factory.createNumericLiteral(0.5)
        ])
        const rounded = ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createIdentifier('Mathf'),
            'FloorToInt'
          ),
          undefined,
          [shifted]
        )
        return makeTypeConversion(rounded, 'float')
      }
      return makeFCall(env, 'roundToIntegerOperation', [
        valueExpr,
        makeRoundingMode(env, 'RoundToNearest')
      ])
    }
    case 'trunc': {
      expectArgs(1, 'Math.trunc')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      if (env.graphDocumentType === 'client') {
        return makeTypeConversion(makeTypeConversion(valueExpr, 'int'), 'float')
      }
      return makeFCall(env, 'roundToIntegerOperation', [
        valueExpr,
        makeRoundingMode(env, 'Truncate')
      ])
    }
    case 'pow': {
      expectArgs(2, 'Math.pow')
      const baseExpr = coerceNumericArg(env, spec, args[0])
      const expExpr = coerceNumericArg(env, spec, args[1])
      return makeFCall(env, 'exponentiation', [baseExpr, expExpr])
    }
    case 'sqrt': {
      expectArgs(1, 'Math.sqrt')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'arithmeticSquareRootOperation', [valueExpr])
    }
    case 'log': {
      expectArgs(1, 'Math.log')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'logarithmOperation', [valueExpr, floatE()])
    }
    case 'log10': {
      expectArgs(1, 'Math.log10')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'logarithmOperation', [valueExpr, ts.factory.createNumericLiteral(10)])
    }
    case 'log2': {
      expectArgs(1, 'Math.log2')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'logarithmOperation', [valueExpr, ts.factory.createNumericLiteral(2)])
    }
    case 'sin': {
      expectArgs(1, 'Math.sin')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'sineFunction', [valueExpr])
    }
    case 'cos': {
      expectArgs(1, 'Math.cos')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'cosineFunction', [valueExpr])
    }
    case 'tan': {
      expectArgs(1, 'Math.tan')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'tangentFunction', [valueExpr])
    }
    case 'asin': {
      expectArgs(1, 'Math.asin')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'arcsineFunction', [valueExpr])
    }
    case 'acos': {
      expectArgs(1, 'Math.acos')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'arccosineFunction', [valueExpr])
    }
    case 'atan': {
      expectArgs(1, 'Math.atan')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'arctangentFunction', [valueExpr])
    }
    case 'random': {
      if (args.length !== 0) {
        fail(env, spec.expr, 'Math.random does not accept arguments')
      }
      return makeFCall(
        env,
        env.graphDocumentType === 'client' ? 'getRandomNumber' : 'getRandomFloatingPointNumber',
        [floatZero(), floatOne()]
      )
    }
    case 'min':
    case 'max': {
      if (args.length === 0) {
        fail(env, spec.expr, `Math.${method} requires at least one argument`)
      }
      const mappedArgs = args.map((arg) => coerceNumericArg(env, spec, arg))
      const listExpr = makeFCall(env, 'assemblyList', [
        ts.factory.createArrayLiteralExpression(mappedArgs, false)
      ])
      return makeFCall(
        env,
        method === 'min' ? 'getMinimumValueFromList' : 'getMaximumValueFromList',
        [listExpr]
      )
    }
    case 'hypot': {
      if (args.length !== 2 && args.length !== 3) {
        fail(env, spec.expr, 'Math.hypot supports 2 or 3 arguments')
      }
      const xExpr = coerceFloatArg(env, spec, args[0])
      const yExpr = coerceFloatArg(env, spec, args[1])
      const zExpr = args[2] ? coerceFloatArg(env, spec, args[2]) : floatZero()
      const vecExpr = makeFCall(env, 'create3dVector', [xExpr, yExpr, zExpr])
      if (env.graphDocumentType === 'client') {
        return makeFCall(env, '_3dVectorModuloOperation', [vecExpr])
      }
      const zeroVec = makeFCall(env, '_3dVectorZeroVector', [])
      return makeFCall(env, 'distanceBetweenTwoCoordinatePoints', [vecExpr, zeroVec])
    }
    case 'sign': {
      expectArgs(1, 'Math.sign')
      const valueExpr = coerceNumericArg(env, spec, args[0])
      const outName = `__gsts_math_sign_${tempId}`
      const outId = ts.factory.createIdentifier(outName)
      const outDecl = makeLocalVarInit(env, outName, 'int', ts.factory.createBigIntLiteral('0n'))
      const setPos = makeFCall(env, 'setLocalVariable', [
        ts.factory.createPropertyAccessExpression(outId, 'localVariable'),
        ts.factory.createBigIntLiteral('1n')
      ])
      const setNeg = makeFCall(env, 'setLocalVariable', [
        ts.factory.createPropertyAccessExpression(outId, 'localVariable'),
        ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createBigIntLiteral('1n')
        )
      ])
      const gtZero = makeFCall(env, 'greaterThan', [valueExpr, floatZero()])
      const ltZero = makeFCall(env, 'lessThan', [valueExpr, floatZero()])
      const negBranch = makeFCall(env, 'doubleBranch', [
        ltZero,
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([ts.factory.createExpressionStatement(setNeg)], true)
        ),
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([], true)
        )
      ])
      const posBranch = makeFCall(env, 'doubleBranch', [
        gtZero,
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([ts.factory.createExpressionStatement(setPos)], true)
        ),
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([ts.factory.createExpressionStatement(negBranch)], true)
        )
      ])
      const stmts = [outDecl, ts.factory.createExpressionStatement(posBranch)]
      return makeIife(stmts, ts.factory.createPropertyAccessExpression(outId, 'value'))
    }
    case 'cbrt': {
      expectArgs(1, 'Math.cbrt')
      const valueExpr = coerceFloatArg(env, spec, args[0])
      return makeFCall(env, 'exponentiation', [valueExpr, floatOneThird()])
    }
    case 'atan2': {
      expectArgs(2, 'Math.atan2')
      const yExpr = coerceFloatArg(env, spec, args[0])
      const xExpr = coerceFloatArg(env, spec, args[1])
      const ratio = makeFCall(env, 'division', [yExpr, xExpr])
      const atanExpr = makeFCall(env, 'arctangentFunction', [ratio])
      const outName = `__gsts_math_atan2_${tempId}`
      const outId = ts.factory.createIdentifier(outName)
      const outDecl = makeLocalVarInit(env, outName, 'float', atanExpr)
      const setOut = (value: ts.Expression) =>
        makeFCall(env, 'setLocalVariable', [
          ts.factory.createPropertyAccessExpression(outId, 'localVariable'),
          value
        ])
      const gtX = makeFCall(env, 'greaterThan', [xExpr, floatZero()])
      const ltX = makeFCall(env, 'lessThan', [xExpr, floatZero()])
      const yGeZero = makeFCall(env, 'greaterThanOrEqualTo', [yExpr, floatZero()])
      const yGtZero = makeFCall(env, 'greaterThan', [yExpr, floatZero()])
      const yLtZero = makeFCall(env, 'lessThan', [yExpr, floatZero()])
      const addPi = makeFCall(env, 'addition', [atanExpr, floatPi()])
      const subPi = makeFCall(env, 'subtraction', [atanExpr, floatPi()])
      const xNegBranch = makeFCall(env, 'doubleBranch', [
        yGeZero,
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([ts.factory.createExpressionStatement(setOut(addPi))], true)
        ),
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([ts.factory.createExpressionStatement(setOut(subPi))], true)
        )
      ])
      const xZeroBranch = makeFCall(env, 'doubleBranch', [
        yGtZero,
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock(
            [ts.factory.createExpressionStatement(setOut(floatHalfPi()))],
            true
          )
        ),
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock(
            [
              ts.factory.createExpressionStatement(
                makeFCall(env, 'doubleBranch', [
                  yLtZero,
                  ts.factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    undefined,
                    ts.factory.createBlock(
                      [ts.factory.createExpressionStatement(setOut(floatNegHalfPi()))],
                      true
                    )
                  ),
                  ts.factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    undefined,
                    ts.factory.createBlock(
                      [ts.factory.createExpressionStatement(setOut(floatZero()))],
                      true
                    )
                  )
                ])
              )
            ],
            true
          )
        )
      ])
      const mainBranch = makeFCall(env, 'doubleBranch', [
        gtX,
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock([], true)
        ),
        ts.factory.createArrowFunction(
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          ts.factory.createBlock(
            [
              ts.factory.createExpressionStatement(
                makeFCall(env, 'doubleBranch', [
                  ltX,
                  ts.factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    undefined,
                    ts.factory.createBlock([ts.factory.createExpressionStatement(xNegBranch)], true)
                  ),
                  ts.factory.createArrowFunction(
                    undefined,
                    undefined,
                    [],
                    undefined,
                    undefined,
                    ts.factory.createBlock(
                      [ts.factory.createExpressionStatement(xZeroBranch)],
                      true
                    )
                  )
                ])
              )
            ],
            true
          )
        )
      ])
      const stmts = [outDecl, ts.factory.createExpressionStatement(mainBranch)]
      return makeIife(stmts, ts.factory.createPropertyAccessExpression(outId, 'value'))
    }
    default:
      fail(env, callee.name, `Unsupported Math method "${method}"`)
  }
}

export function tryTransformBuiltinPropertyAccess(
  env: Env,
  context: ts.TransformationContext,
  expr: ts.PropertyAccessExpression,
  transformExpression: ExpressionTransformer
): ts.Expression | null {
  const prop = expr.name.text
  if (prop === 'length') {
    const listType = inferListTypeFromExpression(env, expr.expression)
    if (listType) {
      const baseExpr = transformExpression(env, context, expr.expression)
      return withSameRange(makeFCall(env, 'getListLength', [baseExpr]), expr)
    }
    if (isArrayLikeExpression(env, expr.expression)) {
      fail(env, expr, 'cannot infer list element type for length, add type annotation')
    }
  }

  if (ts.isIdentifier(expr.expression) && expr.expression.text === 'JSON') {
    fail(env, expr, 'JSON is not supported in server scope')
  }

  if (inferListElementTypeFromExpression(env, expr.expression) === 'str') {
    fail(env, expr, 'String properties are not supported in server scope')
  }

  return null
}

// js原函数仍需要在runtime模块中使用, 因此不作runtime覆盖, 仅作编译处理
export function tryTransformBuiltinCall(
  env: Env,
  context: ts.TransformationContext,
  expr: ts.CallExpression,
  transformExpression: ExpressionTransformer
): ts.Expression | null {
  const callee = expr.expression

  if (ts.isPropertyAccessExpression(callee)) {
    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'console') {
      if (callee.name.text === 'log') {
        if (env.graphDocumentType === 'client') {
          fail(env, expr, `console.log is not available in client graph ${env.clientSubType}`)
        }
        // Compiler-only rewrite: keep runtime console/Number/String/Boolean intact for JS usage.
        if (expr.arguments.length !== 1) {
          fail(env, expr, 'console.log only supports a single argument')
        }
        const argExpr = transformExpression(env, context, expr.arguments[0])
        const strExpr = ts.factory.createCallExpression(
          ts.factory.createIdentifier('str'),
          undefined,
          [argExpr]
        )
        const printExpr = ts.factory.createCallExpression(
          ts.factory.createIdentifier('print'),
          undefined,
          [strExpr]
        )
        return withSameRange(printExpr, expr)
      }
    }

    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Math') {
      const mathExpr = transformMathCall(env, { context, expr, transformExpression })
      return withSameRange(mathExpr, expr)
    }

    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'JSON') {
      fail(env, expr, 'JSON is not supported in server scope')
    }

    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'String') {
      fail(env, expr, 'String operations are not supported in server scope')
    }

    if (inferListElementTypeFromExpression(env, callee.expression) === 'str') {
      fail(env, expr, 'String operations are not supported in server scope')
    }
  }

  if (ts.isIdentifier(callee)) {
    // Compiler-only rewrite: keep runtime console/Number/String/Boolean intact for JS usage.
    if (callee.text === 'Number') {
      if (expr.arguments.length !== 1) {
        fail(env, expr, 'Number() requires exactly one argument')
      }
      const argExpr = transformExpression(env, context, expr.arguments[0])
      return withSameRange(makeTypeConversion(argExpr, 'float'), expr)
    }
    if (callee.text === 'String') {
      if (expr.arguments.length !== 1) {
        fail(env, expr, 'String() requires exactly one argument')
      }
      const argExpr = transformExpression(env, context, expr.arguments[0])
      return withSameRange(makeTypeConversion(argExpr, 'str'), expr)
    }
    if (callee.text === 'Boolean') {
      if (expr.arguments.length !== 1) {
        fail(env, expr, 'Boolean() requires exactly one argument')
      }
      const argExpr = transformExpression(env, context, expr.arguments[0])
      return withSameRange(makeTypeConversion(argExpr, 'bool'), expr)
    }
  }

  return null
}
