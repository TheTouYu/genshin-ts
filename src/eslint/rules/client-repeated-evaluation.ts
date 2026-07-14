import type { Rule } from 'eslint'
import ts from 'typescript'

import {
  isConstEvaluableExpression,
  isPureLiteralExpression
} from '../../compiler/ts_to_gs_transform/const_eval.js'
import { inferConcreteTypeFromType, type ListType } from '../../shared/ts_list_utils.js'
import { clientSubTypeSupportsLocalVariables } from '../utils/client_capabilities.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices, getSourceCode } from '../utils/parser.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

function inferBasicType(
  checker: ts.TypeChecker,
  type: ts.Type,
  location: ts.Node
): ListType | null {
  if (type.flags & ts.TypeFlags.Union) {
    let result: ListType | null = null
    for (const item of (type as ts.UnionType).types) {
      const next = inferBasicType(checker, item, location)
      if (!next || (result && result !== next)) return null
      result = next
    }
    return result
  }
  if (type.flags & ts.TypeFlags.Intersection) {
    let result: ListType | null = null
    for (const item of (type as ts.IntersectionType).types) {
      const next = inferBasicType(checker, item, location)
      if (!next || (result && result !== next)) return null
      result = next
    }
    return result
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) return null
  const text = checker.typeToString(type)
  if (/\b(?:Record|Map)<.+>$/.test(text)) return null
  return inferConcreteTypeFromType(checker, checker.getBaseTypeOfLiteralType(type), location)
}

function isFunctionNode(node: any): boolean {
  return (
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  )
}

function isDirectHandlerReference(identifier: any, handler: any): boolean {
  let current = identifier.parent
  while (current && current !== handler) {
    if (isFunctionNode(current)) return false
    current = current.parent
  }
  return current === handler
}

// Mirrors buildVarPlan's inLoop handling: for-loop initializers and for-of inputs run once,
// while loop bodies, conditions, and updates can read the same node result repeatedly.
function runsInRepeatedLoopPosition(node: any, handler: any): boolean {
  let current = node
  while (current && current !== handler) {
    const parent = current.parent
    if (!parent) return false
    if (parent.type === 'WhileStatement' || parent.type === 'DoWhileStatement') return true
    if (parent.type === 'ForStatement' && current !== parent.init) return true
    if (parent.type === 'ForOfStatement' && current === parent.body) return true
    current = parent
  }
  return false
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'warn when repeated client node values require a local-variable snapshot that the graph cannot provide'
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
    const sourceCode = getSourceCode(context)
    const scopeIndex = buildNodeGraphScopeIndex(context)

    return {
      VariableDeclarator(node: any) {
        if (node.parent?.kind !== 'const' || node.id?.type !== 'Identifier' || !node.init) return
        const info = scopeIndex.getEnclosingClientScope(node, { includeNestedFunctions: false })
        if (!info || clientSubTypeSupportsLocalVariables(info.subType)) return

        const tsName = services.esTreeNodeToTSNodeMap.get(node.id)
        const tsInit = services.esTreeNodeToTSNodeMap.get(node.init)
        if (!tsName || !tsInit || !ts.isIdentifier(tsName) || !ts.isExpression(tsInit)) return
        const type = checker.getTypeAtLocation(tsName)
        if (!inferBasicType(checker, type, tsName)) return
        if (isPureLiteralExpression(tsInit) || isConstEvaluableExpression({ checker }, tsInit)) {
          return
        }

        let handler: any = node
        while (handler && !scopeIndex.isClientScopeFunction(handler)) handler = handler.parent
        if (!handler) return
        const variable = sourceCode
          .getDeclaredVariables(node.parent)
          .find((item: any) => item.name === node.id.name)
        if (!variable) return
        const references = variable.references.filter(
          (reference: any) =>
            reference.isRead() && isDirectHandlerReference(reference.identifier, handler)
        )
        const readCount = references.length
        const readInLoop = references.some((reference: any) =>
          runsInRepeatedLoopPosition(reference.identifier, handler)
        )
        const declaredInLoop = runsInRepeatedLoopPosition(node, handler)
        if (readCount <= 1 && (!readInLoop || declaredInLoop)) return

        const zhUsage =
          readCount > 1 ? `有 ${readCount} 个读取点` : '在声明所在循环之外的循环中读取'
        const enUsage =
          readCount > 1
            ? `has ${readCount} read sites`
            : 'is read inside a loop outside its declaration loop'
        context.report({
          node: node.id,
          message: formatMessage(
            options.lang,
            `非纯 const “${node.id.name}”${zhUsage}；节点图连线在每个使用点都会重新求值，随机数、查询结果或其他时变节点可能得到不同结果。编译器为保持 JavaScript const 初始化只求值一次的语义，会将它提升为局部变量快照，但客户端 ${info.subType} 节点图不支持局部变量`,
            `Non-pure const "${node.id.name}" ${enUsage}; node-graph connections are reevaluated at every use, so random, query, or other time-varying nodes may produce different results. To preserve JavaScript's once-only const initializer semantics, the compiler promotes it to a local-variable snapshot, but client ${info.subType} graphs do not support local variables`
          )
        })
      }
    }
  }
}

export default rule
