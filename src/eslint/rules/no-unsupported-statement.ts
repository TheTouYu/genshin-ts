import type { Rule } from 'eslint'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { buildServerScopeIndex } from '../utils/scope.js'

type Options = {
  banTry?: boolean
  banThrow?: boolean
  banForIn?: boolean
  banWith?: boolean
  banLabeled?: boolean
  banBlock?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  banTry: true,
  banThrow: true,
  banForIn: true,
  banWith: true,
  banLabeled: true,
  banBlock: true,
  lang: 'both',
  scope: 'nodegraph',
  includeNestedFunctions: true
}

function isStandaloneBlock(node: any): boolean {
  const parent = node.parent
  if (!parent) return false
  if (parent.type === 'Program' || parent.type === 'BlockStatement') {
    return Array.isArray(parent.body) && parent.body.includes(node)
  }
  if (parent.type === 'SwitchCase') {
    return Array.isArray(parent.consequent) && parent.consequent.includes(node)
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
          banTry: { type: 'boolean' },
          banThrow: { type: 'boolean' },
          banForIn: { type: 'boolean' },
          banWith: { type: 'boolean' },
          banLabeled: { type: 'boolean' },
          banBlock: { type: 'boolean' },
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

    const report = (node: any) => {
      context.report({
        node,
        message: formatMessage(
          options.lang,
          '该语句在节点图中不被支持',
          'This statement is not supported in node graphs'
        )
      })
    }

    return {
      TryStatement(node) {
        if (!options.banTry) return
        if (!scopeIndex.isInServerScope(node, options)) return
        report(node)
      },
      ThrowStatement(node) {
        if (!options.banThrow) return
        if (!scopeIndex.isInServerScope(node, options)) return
        report(node)
      },
      ForInStatement(node) {
        if (!options.banForIn) return
        if (!scopeIndex.isInServerScope(node, options)) return
        report(node)
      },
      WithStatement(node) {
        if (!options.banWith) return
        if (!scopeIndex.isInServerScope(node, options)) return
        report(node)
      },
      LabeledStatement(node) {
        if (!options.banLabeled) return
        if (!scopeIndex.isInServerScope(node, options)) return
        report(node)
      },
      BlockStatement(node) {
        if (!options.banBlock) return
        if (!scopeIndex.isInServerScope(node, options)) return
        if (!isStandaloneBlock(node)) return
        report(node)
      }
    }
  }
}

export default rule
