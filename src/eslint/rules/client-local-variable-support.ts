import type { Rule } from 'eslint'
import ts from 'typescript'

import {
  isConstEvaluableExpression,
  isPureLiteralExpression
} from '../../compiler/ts_to_gs_transform/const_eval.js'
import { CLIENT_NODE_METHODS_BY_SUB_TYPE } from '../../definitions/client_method_modes.js'
import { inferConcreteTypeFromType, type ListType } from '../../shared/ts_list_utils.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices, getSourceCode } from '../utils/parser.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

const CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES = new Set(
  Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE)
    .filter(([, methods]) => {
      const names: readonly string[] = methods
      return names.includes('getLocalVariable') && names.includes('setLocalVariable')
    })
    .map(([subType]) => subType)
)

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

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'reject client syntax that requires unavailable local-variable nodes'
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
      ConditionalExpression(node: any) {
        const info = scopeIndex.getEnclosingClientScope(node, { includeNestedFunctions: false })
        if (!info || CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES.has(info.subType)) return
        if (info.subType === 'bool_filter' || info.subType === 'int_filter') return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            `客户端 ${info.subType} 节点图不支持局部变量；三元表达式需要临时局部变量，请改写为 if 分支`,
            `Client ${info.subType} graphs do not support local variables; conditional expressions require a temporary local variable, so rewrite this as if branches`
          )
        })
      },
      VariableDeclarator(node: any) {
        if (node.parent?.kind !== 'const' || node.id?.type !== 'Identifier' || !node.init) return
        const info = scopeIndex.getEnclosingClientScope(node, { includeNestedFunctions: false })
        if (!info || CLIENT_SUB_TYPES_WITH_LOCAL_VARIABLES.has(info.subType)) return

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
        const readCount = variable.references.filter(
          (reference: any) =>
            reference.isRead() && isDirectHandlerReference(reference.identifier, handler)
        ).length
        if (readCount <= 1) return

        context.report({
          node: node.id,
          message: formatMessage(
            options.lang,
            `客户端 ${info.subType} 节点图不支持局部变量；非纯 const “${node.id.name}” 被读取 ${readCount} 次，编译器会将它提升为局部变量快照`,
            `Client ${info.subType} graphs do not support local variables; non-pure const "${node.id.name}" is read ${readCount} times, so the compiler would promote it to a local-variable snapshot`
          )
        })
      }
    }
  }
}

export default rule
