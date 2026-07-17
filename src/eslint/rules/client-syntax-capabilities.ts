import type { Rule } from 'eslint'
import ts from 'typescript'

import { extractSimpleEqualityMatch } from '../../compiler/ts_to_gs_transform/list_utils.js'
import { getMemberName } from '../utils/ast.js'
import { getMissingClientMethods } from '../utils/client_capabilities.js'
import { inferListElementTypeFromExpression, inferListTypeFromExpression } from '../utils/list.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'
import { getNumericKind } from '../utils/types.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

const LIST_METHOD_REQUIREMENTS: Record<string, readonly string[]> = {
  forEach: ['listIterationLoop'],
  includes: ['listIncludesThisValue'],
  indexOf: ['initLocalVariable', 'listIterationLoop', 'doubleBranch', 'equal', 'addition'],
  concat: ['concatenateList'],
  map: ['initLocalVariable', 'insertValueIntoList', 'getListLength', 'listIterationLoop'],
  filter: [
    'initLocalVariable',
    'insertValueIntoList',
    'getListLength',
    'doubleBranch',
    'listIterationLoop'
  ],
  reduce: ['initLocalVariable', 'listIterationLoop'],
  some: ['initLocalVariable', 'doubleBranch', 'listIterationLoop'],
  every: ['initLocalVariable', 'doubleBranch', 'listIterationLoop'],
  find: ['initLocalVariable', 'doubleBranch', 'listIterationLoop'],
  findIndex: ['initLocalVariable', 'doubleBranch', 'listIterationLoop', 'addition'],
  push: ['initLocalVariable', 'getListLength', 'insertValueIntoList', 'addition'],
  unshift: ['initLocalVariable', 'getListLength', 'insertValueIntoList', 'addition'],
  pop: [
    'initLocalVariable',
    'getListLength',
    'greaterThan',
    'subtraction',
    'getCorrespondingValueFromList',
    'removeValueFromList',
    'doubleBranch'
  ],
  shift: [
    'initLocalVariable',
    'getListLength',
    'greaterThan',
    'getCorrespondingValueFromList',
    'removeValueFromList',
    'doubleBranch'
  ],
  splice: [
    'initLocalVariable',
    'greaterThan',
    'subtraction',
    'logicalAndOperation',
    'greaterThanOrEqualTo',
    'lessThan',
    'getListLength',
    'getCorrespondingValueFromList',
    'insertValueIntoList',
    'removeValueFromList',
    'doubleBranch',
    'finiteLoop'
  ],
  slice: [
    'initLocalVariable',
    'getListLength',
    'doubleBranch',
    'lessThan',
    'greaterThan',
    'logicalAndOperation',
    'subtraction',
    'finiteLoop',
    'getCorrespondingValueFromList',
    'insertValueIntoList',
    'greaterThanOrEqualTo'
  ]
}

function readCallbackExpression(
  fn: ts.Expression
): { expression: ts.Expression; parameter: string } | null {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null
  if (fn.parameters.length !== 1 || !ts.isIdentifier(fn.parameters[0].name)) return null
  if (!ts.isBlock(fn.body)) {
    return { expression: fn.body, parameter: fn.parameters[0].name.text }
  }
  if (
    fn.body.statements.length !== 1 ||
    !ts.isReturnStatement(fn.body.statements[0]) ||
    !fn.body.statements[0].expression
  ) {
    return null
  }
  return {
    expression: fn.body.statements[0].expression,
    parameter: fn.parameters[0].name.text
  }
}

function getSimpleEqualityMatch(
  call: ts.CallExpression,
  checker: ts.TypeChecker,
  listType: string
): ts.Expression | null {
  const callback = call.arguments[0]
  if (!callback) return null
  const body = readCallbackExpression(callback)
  if (!body) return null
  const match = extractSimpleEqualityMatch(body.expression, body.parameter)
  return match && inferListElementTypeFromExpression(checker, match) === listType ? match : null
}

function enclosingLoopBeforeFunction(node: any): any | null {
  let current = node.parent
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return null
    }
    if (
      current.type === 'ForStatement' ||
      current.type === 'ForOfStatement' ||
      current.type === 'WhileStatement' ||
      current.type === 'DoWhileStatement'
    ) {
      return current
    }
    current = current.parent
  }
  return null
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'reject client syntax whose lowering requires unavailable graph methods'
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

    const reportMissing = (
      node: any,
      label: string,
      subType: string,
      requirements: readonly string[]
    ) => {
      const missing = getMissingClientMethods(subType, requirements)
      if (!missing.length) return
      context.report({
        node,
        message: formatMessage(
          options.lang,
          `客户端 ${subType} 节点图不支持 ${label}；缺少方法：${missing.join(', ')}`,
          `Client ${subType} graphs do not support ${label}; missing methods: ${missing.join(', ')}`
        )
      })
    }

    const checkLoop = (node: any, requirements: readonly string[]) => {
      const info = scopeIndex.getEnclosingClientScope(node, { includeNestedFunctions: true })
      if (!info) return
      reportMissing(node, 'this loop', info.subType, requirements)
    }

    const checkModulo = (node: any) => {
      const info = scopeIndex.getEnclosingClientScope(node, { includeNestedFunctions: true })
      if (!info) return
      const tsNode = services.esTreeNodeToTSNodeMap.get(node)
      if (!tsNode || !ts.isBinaryExpression(tsNode)) return
      const leftKind = getNumericKind(checker, checker.getTypeAtLocation(tsNode.left))
      const rightKind = getNumericKind(checker, checker.getTypeAtLocation(tsNode.right))
      if ((leftKind !== 'int' && leftKind !== 'float') || leftKind !== rightKind) {
        context.report({
          node,
          message: formatMessage(
            options.lang,
            '客户端 % 要求两个操作数具有相同的 int 或 float 类型',
            'Client % requires both operands to have the same int or float type'
          )
        })
        return
      }
      reportMissing(
        node,
        '%',
        info.subType,
        leftKind === 'float'
          ? ['division', 'dataTypeConversion', 'multiplication', 'subtraction']
          : ['division', 'multiplication', 'subtraction']
      )
    }

    return {
      CallExpression(node: any) {
        const info = scopeIndex.getEnclosingClientScope(node, {
          includeNestedFunctions: true
        })
        if (!info || node.callee?.type !== 'MemberExpression') return
        const method = getMemberName(node.callee)
        if (!method || !LIST_METHOD_REQUIREMENTS[method]) return
        const tsTarget = services.esTreeNodeToTSNodeMap.get(node.callee.object)
        const tsCall = services.esTreeNodeToTSNodeMap.get(node)
        if (!tsTarget || !tsCall || !ts.isCallExpression(tsCall)) return
        const listType = inferListTypeFromExpression(checker, tsTarget)
        if (!listType) return

        const simpleEquality =
          method === 'some' || method === 'find'
            ? getSimpleEqualityMatch(tsCall, checker, listType)
            : null
        const requirements = simpleEquality
          ? method === 'some'
            ? ['listIncludesThisValue']
            : ['initLocalVariable', 'listIncludesThisValue', 'doubleBranch']
          : LIST_METHOD_REQUIREMENTS[method]
        reportMissing(node.callee.property, `${method}()`, info.subType, requirements)
      },
      ForStatement(node: any) {
        checkLoop(node, ['finiteLoop'])
      },
      WhileStatement(node: any) {
        checkLoop(
          node,
          node.test?.type === 'Literal' && node.test.value === true
            ? ['finiteLoop']
            : ['finiteLoop', 'doubleBranch']
        )
      },
      DoWhileStatement(node: any) {
        checkLoop(node, ['finiteLoop', 'doubleBranch'])
      },
      ForOfStatement(node: any) {
        checkLoop(node, ['listIterationLoop'])
      },
      ReturnStatement(node: any) {
        if (node.argument || !enclosingLoopBeforeFunction(node)) return
        const info = scopeIndex.getEnclosingClientScope(node, {
          includeNestedFunctions: false
        })
        if (!info || info.subType === 'bool_filter' || info.subType === 'int_filter') return
        reportMissing(node, 'return inside a loop', info.subType, [
          'initLocalVariable',
          'breakLoop'
        ])
      },
      BinaryExpression(node: any) {
        if (node.operator === '%') checkModulo(node)
      },
      AssignmentExpression(node: any) {
        if (node.operator === '%=') checkModulo(node)
      }
    }
  }
}

export default rule
