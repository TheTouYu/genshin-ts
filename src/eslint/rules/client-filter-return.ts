import type { Rule } from 'eslint'
import ts from 'typescript'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'
import { isBooleanType } from '../utils/types.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

function statementListAlwaysReturns(statements: any[]): boolean {
  return statements.some(statementAlwaysReturns)
}

function statementAlwaysReturns(node: any): boolean {
  if (!node) return false
  if (node.type === 'ReturnStatement') return true
  if (node.type === 'BlockStatement') return statementListAlwaysReturns(node.body ?? [])
  if (node.type === 'IfStatement') {
    return (
      !!node.alternate &&
      statementAlwaysReturns(node.consequent) &&
      statementAlwaysReturns(node.alternate)
    )
  }
  if (node.type === 'SwitchStatement') {
    const cases = node.cases ?? []
    return (
      cases.some((item: any) => item.test === null) &&
      cases.every((item: any) => statementListAlwaysReturns(item.consequent ?? []))
    )
  }
  if (node.type === 'TryStatement') {
    if (node.finalizer && statementAlwaysReturns(node.finalizer)) return true
    return (
      statementAlwaysReturns(node.block) &&
      !!node.handler &&
      statementAlwaysReturns(node.handler.body)
    )
  }
  return false
}

function isIntFilterCompatible(checker: ts.TypeChecker, type: ts.Type): boolean {
  if ((type.flags & ts.TypeFlags.Union) !== 0) {
    return (type as ts.UnionType).types.every((item) => isIntFilterCompatible(checker, item))
  }
  if ((type.flags & ts.TypeFlags.Intersection) !== 0) {
    return (type as ts.IntersectionType).types.every((item) => isIntFilterCompatible(checker, item))
  }
  if ((type.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike)) !== 0) return true
  const name = checker.typeToString(type)
  return name === 'IntValue' || name === 'int' || name === 'FloatValue' || name === 'float'
}

function collectReturns(node: any, root: any, out: any[]) {
  if (!node) return
  if (
    node !== root &&
    /Function(?:Declaration|Expression)$|ArrowFunctionExpression/.test(node.type)
  ) {
    return
  }
  if (node.type === 'ReturnStatement') {
    out.push(node)
    return
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue
    const value = node[key]
    if (Array.isArray(value)) {
      value.forEach((child) => child?.type && collectReturns(child, root, out))
    } else if (value?.type) {
      collectReturns(value, root, out)
    }
  }
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require complete, subtype-compatible returns from client filter handlers'
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

    const reportType = (node: any, expected: 'bool' | 'int') => {
      context.report({
        node,
        message: formatMessage(
          options.lang,
          `客户端 ${expected} filter 必须返回 ${expected === 'bool' ? 'boolean/bool' : 'bigint/number/int'} 兼容值`,
          `Client ${expected} filter must return a ${expected === 'bool' ? 'boolean/bool' : 'bigint/number/int'} compatible value`
        )
      })
    }

    const check = (node: any) => {
      const info = scopeIndex.getClientScopeInfo(node)
      if (
        !info ||
        info.kind !== 'handler' ||
        (info.subType !== 'bool_filter' && info.subType !== 'int_filter')
      ) {
        return
      }
      const expected = info.subType === 'bool_filter' ? 'bool' : 'int'
      const body = node.body

      if (body.type !== 'BlockStatement') {
        const tsBody = services.esTreeNodeToTSNodeMap.get(body)
        if (!tsBody) return
        const type = checker.getTypeAtLocation(tsBody)
        const valid =
          expected === 'bool' ? isBooleanType(checker, type) : isIntFilterCompatible(checker, type)
        if (!valid) reportType(body, expected)
        return
      }

      if (!statementListAlwaysReturns(body.body ?? [])) {
        context.report({
          node: body,
          message: formatMessage(
            options.lang,
            `客户端 ${expected} filter 的所有执行路径都必须返回值`,
            `All execution paths in a client ${expected} filter must return a value`
          )
        })
      }

      const returns: any[] = []
      collectReturns(body, node, returns)
      for (const returnNode of returns) {
        if (!returnNode.argument) {
          reportType(returnNode, expected)
          continue
        }
        const tsArg = services.esTreeNodeToTSNodeMap.get(returnNode.argument)
        if (!tsArg) continue
        const type = checker.getTypeAtLocation(tsArg)
        const valid =
          expected === 'bool' ? isBooleanType(checker, type) : isIntFilterCompatible(checker, type)
        if (!valid) reportType(returnNode.argument, expected)
      }
    }

    return {
      ArrowFunctionExpression: check,
      FunctionExpression: check,
      FunctionDeclaration: check
    }
  }
}

export default rule
