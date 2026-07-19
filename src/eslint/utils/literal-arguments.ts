import ts from 'typescript'

import {
  isConstEvaluableExpression,
  isPureLiteralExpression
} from '../../compiler/ts_to_gs_transform/const_eval.js'

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

export function isLiteralArgument(
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
