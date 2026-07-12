import type { Rule } from 'eslint'
import ts from 'typescript'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildServerScopeIndex } from '../utils/scope.js'
import { isAnyOrUnknown, isBooleanType } from '../utils/types.js'

type Options = {
  checkTernaryTest?: boolean
  checkNotOperand?: boolean
  allowAny?: boolean
  lang?: 'zh' | 'en' | 'both'
  scope?: 'server' | 'client' | 'nodegraph' | 'all'
  includeNestedFunctions?: boolean
}

const DEFAULTS: Required<Options> = {
  checkTernaryTest: true,
  checkNotOperand: true,
  allowAny: true,
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
          checkTernaryTest: { type: 'boolean' },
          checkNotOperand: { type: 'boolean' },
          allowAny: { type: 'boolean' },
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

    const report = (node: any) => {
      context.report({
        node,
        message: formatMessage(
          options.lang,
          '表达式或操作对象非布尔类型, 可能无法生成正确的节点图',
          'Condition/operand is not boolean; node-graph output may be incorrect'
        )
      })
    }

    const checkType = (node: any) => {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node)
      if (!tsNode) return
      const type = checker.getTypeAtLocation(tsNode)
      if (options.allowAny && isAnyOrUnknown(type)) return
      if (!isBooleanType(checker, type)) report(node)
    }

    return {
      ConditionalExpression(node) {
        if (!options.checkTernaryTest) return
        if (!scopeIndex.isInServerScope(node, options)) return
        checkType(node.test)
      },
      UnaryExpression(node) {
        if (!options.checkNotOperand) return
        if (!scopeIndex.isInServerScope(node, options)) return
        if (node.operator !== '!') return
        checkType(node.argument)
      }
    }
  }
}

export default rule
