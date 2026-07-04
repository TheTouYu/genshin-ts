import type { Rule } from 'eslint'

import { CLIENT_GRAPH_SUB_TYPE_BY_METHOD } from '../../definitions/client_graph_modes.js'
import {
  CLIENT_BLOCKED_SERVER_HELPERS,
  CLIENT_SCOPED_GLOBAL_MEMBERS_BY_SUB_TYPE
} from '../../definitions/client_scoped_globals.js'

type ClientHandlerInfo = {
  subType: string
  mode: 'beyond' | 'classic'
}

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

function clientEntryHandlerInfo(node: any): { handler: any; info: ClientHandlerInfo } | undefined {
  // matches g.<clientMethod>(options?).on('start', handler)
  if (node.type !== 'CallExpression') return undefined
  const callee = node.callee
  if (callee?.type !== 'MemberExpression' || callee.computed) return undefined
  if (callee.property?.name !== 'on') return undefined
  const target = callee.object
  if (target?.type !== 'CallExpression') return undefined
  const targetCallee = target.callee
  if (targetCallee?.type !== 'MemberExpression' || targetCallee.computed) return undefined
  if (targetCallee.object?.type !== 'Identifier' || targetCallee.object.name !== 'g') {
    return undefined
  }
  const subType = (CLIENT_GRAPH_SUB_TYPE_BY_METHOD as Record<string, string>)[
    targetCallee.property?.name
  ]
  if (!subType) return undefined
  const handler = node.arguments[1]
  if (!handler || (handler.type !== 'ArrowFunctionExpression' && handler.type !== 'FunctionExpression')) {
    return undefined
  }
  let mode: ClientHandlerInfo['mode'] = 'beyond'
  const options = target.arguments[0]
  if (options?.type === 'ObjectExpression') {
    for (const prop of options.properties) {
      if (prop.type === 'Property' && !prop.computed && prop.key?.name === 'mode') {
        if (prop.value?.type === 'Literal' && prop.value.value === 'classic') mode = 'classic'
      }
    }
  }
  return { handler, info: { subType, mode } }
}

function enclosingClientHandler(
  node: any,
  handlers: Map<any, ClientHandlerInfo>
): ClientHandlerInfo | undefined {
  let cur = node.parent
  while (cur) {
    const info = handlers.get(cur)
    if (info) return info
    cur = cur.parent
  }
  return undefined
}

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
        'reject scoped helper globals that the current client graph family or mode cannot support'
    },
    schema: []
  },
  create(context) {
    const handlers = new Map<any, ClientHandlerInfo>()

    return {
      CallExpression(node) {
        const match = clientEntryHandlerInfo(node)
        if (match) handlers.set(match.handler, match.info)
      },
      'Identifier, JSXIdentifier'(node: any) {
        if (!GUARDED_HELPERS.has(node.name)) return
        if (!isReferencePosition(node)) return
        const info = enclosingClientHandler(node, handlers)
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
            message: `[client scoped globals] ${node.name} is not available in ${info.subType} ${info.mode} mode`
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
            message: `[client scoped globals] ${node.name}.${parent.property.name} is not available in ${info.subType} ${info.mode} mode`
          })
        }
      }
    }
  }
}

export default rule
