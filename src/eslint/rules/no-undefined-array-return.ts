import type { Rule } from 'eslint'
import ts from 'typescript'

import { getMemberName } from '../utils/ast.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import { isAnyOrUnknown, isPossiblyUndefined } from '../utils/types.js'

type Options = {
  methods?: string[]
  allowNonNullAssertion?: boolean
  allowGuardedUse?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  methods: ['pop', 'shift', 'find', 'findLast', 'at'],
  allowNonNullAssertion: true,
  allowGuardedUse: false,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

function isGuardedUse(node: any): boolean {
  const parent = node.parent
  if (!parent) return false
  if (
    (parent.type === 'IfStatement' ||
      parent.type === 'WhileStatement' ||
      parent.type === 'DoWhileStatement') &&
    parent.test === node
  ) {
    return true
  }
  if (parent.type === 'ConditionalExpression' && parent.test === node) return true
  return false
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          methods: { type: 'array', items: { type: 'string' } },
          allowNonNullAssertion: { type: 'boolean' },
          allowGuardedUse: { type: 'boolean' },
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
    const methods = new Set(options.methods)

    return {
      CallExpression(node) {
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!node.callee || node.callee.type !== 'MemberExpression') return
        const method = getMemberName(node.callee)
        if (!method || !methods.has(method)) return

        if (options.allowNonNullAssertion && (node.parent as any)?.type === 'TSNonNullExpression')
          return
        if (options.allowGuardedUse && isGuardedUse(node)) return

        const tsNode = services.esTreeNodeToTSNodeMap.get(node)
        if (!tsNode || !ts.isCallExpression(tsNode)) return
        const type = checker.getTypeAtLocation(tsNode)
        if (isAnyOrUnknown(type)) return
        if (!isPossiblyUndefined(type)) return

        context.report({
          node,
          message: formatMessage(
            options.lang,
            '节点图环境下不存在undefined, 请使用!强制非空处理',
            'Undefined does not exist in node-graph scope; use `!` to assert non-null'
          )
        })
      }
    }
  }
}

export default rule
