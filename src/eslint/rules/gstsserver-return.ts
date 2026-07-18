import type { Rule } from 'eslint'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { DEFAULT_GSTS_FUNCTION_PREFIXES, isGstsServerName } from '../utils/ts_matchers.js'

type Options = {
  prefixes?: string[]
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = {
  prefixes: [...DEFAULT_GSTS_FUNCTION_PREFIXES],
  lang: 'both'
}

function lastNonEmptyStatement(body: any[]): any | null {
  for (let i = body.length - 1; i >= 0; i -= 1) {
    const stmt = body[i]
    if (!stmt) continue
    if (stmt.type === 'EmptyStatement') continue
    return stmt
  }
  return null
}

function checkReturnRules(context: Rule.RuleContext, fn: any, lang: Options['lang']) {
  if (!fn.body) return
  if (fn.body.type !== 'BlockStatement') return

  const lastStmt = lastNonEmptyStatement(fn.body.body)
  const returnNodes: any[] = []
  let invalidNested: any | null = null
  let invalidVoid: any | null = null

  const visit = (node: any, inNested: boolean) => {
    if (!node || invalidNested) return
    if (node.type === 'ReturnStatement') {
      returnNodes.push(node)
      if (inNested) invalidNested = node
      if (!node.argument) invalidVoid = node
      return
    }
    const nextNested =
      inNested ||
      node.type === 'IfStatement' ||
      node.type === 'SwitchStatement' ||
      node.type === 'ForStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement' ||
      node.type === 'WhileStatement' ||
      node.type === 'DoWhileStatement' ||
      node.type === 'TryStatement'
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue
      const value = (node as any)[key]
      if (Array.isArray(value)) {
        value.forEach((child) => child && visit(child, nextNested))
      } else if (value && typeof value.type === 'string') {
        visit(value, nextNested)
      }
    }
  }

  visit(fn.body, false)

  const msg = formatMessage(
    lang ?? 'both',
    '节点图函数的 return 必须是函数末尾唯一且带值的 return',
    'A graph function must use one value-returning return at the end of its body'
  )

  if (invalidNested) {
    context.report({ node: invalidNested, message: msg })
    return
  }
  if (invalidVoid) {
    context.report({ node: invalidVoid, message: msg })
    return
  }
  if (returnNodes.length === 0) return
  if (!lastStmt || lastStmt.type !== 'ReturnStatement') {
    context.report({ node: returnNodes[0], message: msg })
    return
  }
  if (returnNodes.length > 1) {
    context.report({ node: returnNodes[1], message: msg })
  }
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          prefixes: { type: 'array', items: { type: 'string' } },
          lang: { enum: ['zh', 'en', 'both'] }
        },
        additionalProperties: false
      }
    ]
  },
  create(context) {
    const raw = (context.options[0] ?? {}) as Options
    const options = readBaseOptions(raw, DEFAULTS)

    return {
      FunctionDeclaration(node) {
        if (!isGstsServerName(node.id?.name, options.prefixes)) return
        checkReturnRules(context, node, options.lang)
      },
      VariableDeclarator(node) {
        if (!node.id || node.id.type !== 'Identifier') return
        if (!isGstsServerName(node.id.name, options.prefixes)) return
        if (
          !node.init ||
          (node.init.type !== 'FunctionExpression' && node.init.type !== 'ArrowFunctionExpression')
        ) {
          return
        }
        checkReturnRules(context, node.init, options.lang)
      }
    }
  }
}

export default rule
