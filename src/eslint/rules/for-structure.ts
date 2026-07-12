import type { Rule } from 'eslint'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

function isIntOneLiteral(node: any): boolean {
  if (!node) return false
  if (node.type === 'Literal') {
    if (node.value === 1) return true
    if (typeof node.bigint === 'string') return node.bigint.replace(/_/g, '') === '1'
  }
  if (node.type === 'UnaryExpression' && node.operator === '+') {
    return isIntOneLiteral(node.argument)
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
    const scopeIndex = buildServerScopeIndex(context)
    const message = formatMessage(
      options.lang,
      '当前使用的 for 循环结构不被支持',
      'The for-loop structure you are using is not supported'
    )

    return {
      ForStatement(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        let loopVar: string | null = null
        if (node.init?.type === 'VariableDeclaration') {
          const decl = node.init.declarations[0]
          if (decl?.id?.type === 'Identifier') loopVar = decl.id.name
        } else if (
          node.init?.type === 'AssignmentExpression' &&
          node.init.left.type === 'Identifier'
        ) {
          loopVar = node.init.left.name
        }
        if (!loopVar) return

        if (node.update) {
          const inc = node.update
          const ok =
            (inc.type === 'UpdateExpression' &&
              inc.operator === '++' &&
              inc.argument.type === 'Identifier' &&
              inc.argument.name === loopVar) ||
            (inc.type === 'AssignmentExpression' &&
              inc.operator === '+=' &&
              inc.left.type === 'Identifier' &&
              inc.left.name === loopVar &&
              isIntOneLiteral(inc.right)) ||
            (inc.type === 'AssignmentExpression' &&
              inc.operator === '=' &&
              inc.left.type === 'Identifier' &&
              inc.left.name === loopVar &&
              inc.right.type === 'BinaryExpression' &&
              inc.right.operator === '+' &&
              ((inc.right.left.type === 'Identifier' &&
                inc.right.left.name === loopVar &&
                isIntOneLiteral(inc.right.right)) ||
                (inc.right.right.type === 'Identifier' &&
                  inc.right.right.name === loopVar &&
                  isIntOneLiteral(inc.right.left))))
          if (!ok) {
            context.report({ node: inc, message })
          }
        }

        if (node.test && node.test.type === 'BinaryExpression') {
          const op = node.test.operator
          if (op !== '<' && op !== '<=') {
            context.report({ node: node.test, message })
            return
          }
          if (node.test.left.type !== 'Identifier' || node.test.left.name !== loopVar) {
            context.report({ node: node.test, message })
          }
        } else if (node.test) {
          context.report({ node: node.test, message })
        }
      }
    }
  }
}

export default rule
