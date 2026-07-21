import type { Rule } from 'eslint'
import ts from 'typescript'

import { getMemberName, isIdentifier } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import { isAnyOrUnknown, isStringType } from '../utils/types.js'

type Options = {
  allowStringConstructor?: boolean
  allowMethods?: string[]
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  allowStringConstructor: true,
  allowMethods: [],
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          allowStringConstructor: { type: 'boolean' },
          allowMethods: { type: 'array', items: { type: 'string' } },
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
    const allowMethods = new Set(options.allowMethods)

    const report = (node: any) => {
      context.report({
        node,
        message: formatMessage(
          options.lang,
          '节点图不支持字符串操作',
          'String operations are not supported in node graphs'
        )
      })
    }

    const isStringExpr = (node: any): boolean => {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node)
      if (!tsNode) return false
      const type = checker.getTypeAtLocation(tsNode)
      if (isAnyOrUnknown(type)) return false
      return isStringType(checker, type)
    }

    return {
      TemplateLiteral(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        report(node)
      },
      BinaryExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (node.operator !== '+') return
        if (isStringExpr(node.left) || isStringExpr(node.right)) report(node)
      },
      AssignmentExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (node.operator !== '+=') return
        if (isStringExpr(node.left) || isStringExpr(node.right)) report(node)
      },
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        const callee = node.callee
        if (!callee) return
        if (
          callee.type === 'Identifier' &&
          callee.name === 'String' &&
          options.allowStringConstructor
        ) {
          return
        }
        if (callee.type !== 'MemberExpression') return
        const name = getMemberName(callee)
        if (name && allowMethods.has(name)) return
        if (isIdentifier(callee.object, 'String')) {
          report(node)
          return
        }
        if (isStringExpr(callee.object)) report(node)
      },
      MemberExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (node.parent?.type === 'CallExpression' && node.parent.callee === node) return
        const name = getMemberName(node)
        if (name && allowMethods.has(name)) return
        if (isIdentifier(node.object, 'String')) {
          report(node)
          return
        }
        if (isStringExpr(node.object)) report(node)
      }
    }
  }
}

export default rule
