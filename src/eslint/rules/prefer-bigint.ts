import type { Rule } from 'eslint'
import ts from 'typescript'

import { isIdentifier } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import { getNumericKind } from '../utils/types.js'

type Options = {
  operators?: string[]
  allowFloatWrapper?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  operators: ['%', '<<', '>>', '>>>', '&', '|', '^'],
  allowFloatWrapper: true,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

function isWrappedByFloat(node: any): boolean {
  let cur = node.parent
  while (cur) {
    if (cur.type === 'CallExpression' && isIdentifier(cur.callee, 'float')) {
      return cur.arguments?.includes(node) ?? false
    }
    if (
      cur.type === 'FunctionDeclaration' ||
      cur.type === 'FunctionExpression' ||
      cur.type === 'ArrowFunctionExpression'
    ) {
      return false
    }
    cur = cur.parent
  }
  return false
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          operators: { type: 'array', items: { type: 'string' } },
          allowFloatWrapper: { type: 'boolean' },
          lang: { enum: ['zh', 'en', 'both'] },
          scope: { enum: ['server', 'client', 'nodegraph', 'all'] },
          includeNestedFunctions: { type: 'boolean' }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const raw = (context.options[0] ?? {}) as Options
    const options = readBaseOptions(raw, DEFAULTS)
    const services = getParserServices(context)
    if (!services) return {}
    const checker = services.program.getTypeChecker()
    const scopeIndex = buildServerScopeIndex(context)
    const operators = new Set(options.operators)
    const assignmentOps = new Set(options.operators.map((op) => `${op}=`))

    const shouldWarn = (left: any, right: any): boolean => {
      const tsLeft = services.esTreeNodeToTSNodeMap.get(left)
      const tsRight = services.esTreeNodeToTSNodeMap.get(right)
      if (!tsLeft || !tsRight) return false
      const leftKind = getNumericKind(checker, checker.getTypeAtLocation(tsLeft))
      const rightKind = getNumericKind(checker, checker.getTypeAtLocation(tsRight))
      if (leftKind === 'float' || rightKind === 'float') return true
      if (leftKind === 'mixed' || rightKind === 'mixed') return true
      return false
    }

    return {
      BinaryExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!operators.has(node.operator)) return
        if (options.allowFloatWrapper && isWrappedByFloat(node)) return
        if (!shouldWarn(node.left, node.right)) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            '节点图不支持浮点数进行此计算操作, 请改用bigint, 或者在外加一层float()函数包裹',
            'Float numbers are not supported for this integer operation; use `bigint` or wrap with `float()`'
          )
        })
      },
      AssignmentExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!assignmentOps.has(node.operator)) return
        if (options.allowFloatWrapper && isWrappedByFloat(node)) return
        if (!shouldWarn(node.left, node.right)) return
        context.report({
          node,
          message: formatMessage(
            options.lang,
            '节点图不支持浮点数进行此计算操作, 请改用bigint, 或者在外加一层float()函数包裹',
            'Float numbers are not supported for this integer operation; use `bigint` or wrap with `float()`'
          )
        })
      }
    }
  }
}

export default rule
