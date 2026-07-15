import type { Rule } from 'eslint'

import {
  CLIENT_BLOCKED_SERVER_HELPERS,
  CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE
} from '../../definitions/client_scoped_globals.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'

/** helpers that exist in server handlers and are guarded per client capability */
const GUARDED_HELPERS = new Set([
  'send',
  'player',
  'self',
  'stage',
  'level',
  'Mathf',
  'Random',
  'Vector3',
  'GameObject',
  ...CLIENT_BLOCKED_SERVER_HELPERS
])

function isReferencePosition(node: any): boolean {
  const parent = node.parent
  if (!parent) return false
  // skip property keys, member property names, declaration ids, labels
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
    return false
  }
  if (parent.type === 'Property' && parent.key === node && !parent.computed) return false
  if (parent.type === 'VariableDeclarator' && parent.id === node) return false
  if (
    (parent.type === 'FunctionDeclaration' ||
      parent.type === 'FunctionExpression' ||
      parent.type === 'ArrowFunctionExpression') &&
    (parent.id === node || parent.params.includes(node))
  ) {
    return false
  }
  return true
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'reject scoped helper globals that the current client graph family cannot support'
    },
    schema: []
  },
  create(context) {
    const scopeIndex = buildNodeGraphScopeIndex(context)

    return {
      'Identifier, JSXIdentifier'(node: any) {
        if (!GUARDED_HELPERS.has(node.name)) return
        if (!isReferencePosition(node)) return
        const info = scopeIndex.getEnclosingClientScope(node)
        if (!info) return

        const supported = (
          CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE as Record<
            string,
            Record<string, readonly string[]>
          >
        )[info.subType]
        const members = supported?.[node.name]

        if (!members) {
          context.report({
            node,
            message: `[client scoped globals] ${node.name} is not available in ${info.subType}`
          })
          return
        }

        const parent = node.parent
        if (
          members.length > 0 &&
          parent?.type === 'MemberExpression' &&
          parent.object === node &&
          !parent.computed &&
          parent.property?.type === 'Identifier' &&
          !members.includes(parent.property.name)
        ) {
          context.report({
            node: parent,
            message: `[client scoped globals] ${node.name}.${parent.property.name} is not available in ${info.subType}`
          })
        }
      }
    }
  }
}

export default rule
