import type { Rule } from 'eslint'

import { CLIENT_GSTS_FUNCTION_PREFIXES } from '../../definitions/client_graph_modes.js'
import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

type IdentifierNode = Rule.Node & { type: 'Identifier'; name: string }
type FunctionNode = Rule.Node & { id?: IdentifierNode | null }
type VariableDeclaratorNode = Rule.Node & {
  id: Rule.Node
  init?: Rule.Node | null
}

const DEFAULTS: Required<Options> = { lang: 'both' }
const SERVER_PREFIX = 'gstsServer'
const AVAILABLE_PREFIXES = [SERVER_PREFIX, ...CLIENT_GSTS_FUNCTION_PREFIXES]

function isIdentifier(node: Rule.Node | null | undefined): node is IdentifierNode {
  return node?.type === 'Identifier'
}

function isFunctionInitializer(node: Rule.Node | null | undefined): boolean {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression'
}

function hasValidPrefix(name: string): boolean {
  return AVAILABLE_PREFIXES.some((prefix) => name.startsWith(prefix))
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require gsts-prefixed functions to use a supported graph-family prefix'
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
    const available = AVAILABLE_PREFIXES.join(', ')

    const check = (identifier: IdentifierNode | null | undefined) => {
      if (!identifier || !identifier.name.startsWith('gsts') || hasValidPrefix(identifier.name)) {
        return
      }
      context.report({
        node: identifier,
        message: formatMessage(
          options.lang,
          `函数名 "${identifier.name}" 使用了未知的 gsts 前缀；可用前缀：${available}`,
          `Function name "${identifier.name}" uses an unknown gsts prefix; available prefixes: ${available}`
        )
      })
    }

    return {
      FunctionDeclaration(node) {
        check((node as FunctionNode).id)
      },
      VariableDeclarator(node) {
        const declaration = node as VariableDeclaratorNode
        if (!isIdentifier(declaration.id) || !isFunctionInitializer(declaration.init)) return
        check(declaration.id)
      }
    }
  }
}

export default rule
