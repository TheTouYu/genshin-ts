import type { Rule } from 'eslint'
import ts from 'typescript'

import { formatMessage } from '../utils/messages.js'
import { readBaseOptions } from '../utils/options.js'
import { getParserServices } from '../utils/parser.js'
import { buildNodeGraphScopeIndex } from '../utils/scope.js'

type Options = {
  lang?: 'zh' | 'en' | 'both'
}

const DEFAULTS: Required<Options> = { lang: 'both' }

/**
 * 纯数据节点白名单（与编译器 readOnlyFAllArgs 的 data 段同源）：对相同输入恒产出
 * 相同结果。引擎会在每个消费点重新求值这类节点（data 节点不是引用）——若输入来自
 * 图变量且两次消费之间发生写入（缺陷 6：`const next = f.addition(count, 1)` 同时传给
 * set 与 equal，equal 在 set 之后重新求值 Addition，读到新 count），一次逻辑会被
 * 重复计算（灯阵日志 2723 rec643：7→8→9 直接 win）。
 */
const PURE_DATA_METHODS = new Set([
  'equal',
  'logicalNotOperation',
  'logicalAndOperation',
  'logicalOrOperation',
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'moduloOperation',
  'exponentiation',
  'lessThan',
  'lessThanOrEqualTo',
  'greaterThan',
  'greaterThanOrEqualTo',
  'arithmeticSquareRootOperation',
  'absoluteValueOperation',
  'takeSmallerValue',
  'takeLargerValue',
  'leftShiftOperation',
  'rightShiftOperation',
  'bitwiseAnd',
  'bitwiseOr',
  'xorExclusiveOr',
  'bitwiseComplement'
])

type Candidate = {
  idNode: any
  name: string
  init: any
}

function isFlowReceiver(checker: ts.TypeChecker, node: any): boolean {
  const tsNode = node
  if (!tsNode || !ts.isExpression(tsNode)) return false
  const receiverType = checker.getTypeAtLocation(tsNode)
  return Boolean(checker.getPropertyOfType(receiverType, '__gstsEnsureVariable'))
}

function unwrapExpression(node: any): any {
  let current = node
  while (current?.type === 'ParenthesizedExpression') current = current.expression
  return current
}

function methodNameOf(node: any): string | undefined {
  if (node?.type !== 'CallExpression') return undefined
  const callee = node.callee
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return undefined
  return callee.property?.name
}

/** 从标识符向上找最近一个把它作为实参的 f.* 调用（返回调用节点）。 */
function enclosingFCall(services: any, checker: ts.TypeChecker, identifier: any): any | null {
  let current: any = identifier.parent
  while (current) {
    if (current.type === 'CallExpression') {
      const callee = current.callee
      if (
        callee &&
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property?.name &&
        current.arguments.includes(identifier) &&
        isFlowReceiver(checker, services.esTreeNodeToTSNodeMap.get(callee.object))
      ) {
        return current
      }
      return null
    }
    current = current.parent
  }
  return null
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'warn when a pure-data server expression is consumed by multiple calls (node-graph connections re-evaluate at every use)'
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
    const services = getParserServices(context)
    if (!services) return {}
    const checker = services.program.getTypeChecker()
    const sourceCode = context.sourceCode
    const scopeIndex = buildNodeGraphScopeIndex(context)
    const candidates: Candidate[] = []

    return {
      VariableDeclarator(node: any) {
        if (node.parent?.kind !== 'const' || node.id?.type !== 'Identifier' || !node.init) return
        if (!scopeIndex.isInServerScope(node, { scope: 'server', includeNestedFunctions: true })) {
          return
        }
        const init = unwrapExpression(node.init)
        const method = methodNameOf(init)
        if (!method || !PURE_DATA_METHODS.has(method)) return
        const calleeObject = init.callee?.object
        if (!isFlowReceiver(checker, services.esTreeNodeToTSNodeMap.get(calleeObject))) return
        candidates.push({ idNode: node.id, name: node.id.name, init })
      },
      'Program:exit'() {
        for (const candidate of candidates) {
          const declaration = candidate.idNode.parent?.parent
          const variable = sourceCode
            .getDeclaredVariables(declaration)
            .find((item: any) => item.name === candidate.name)
          if (!variable) continue
          const consumptionCalls = new Set<any>()
          for (const reference of variable.references) {
            if (!reference.isRead()) continue
            const enclosing = enclosingFCall(services, checker, reference.identifier)
            if (enclosing) consumptionCalls.add(enclosing)
          }
          if (consumptionCalls.size < 2) continue
          context.report({
            node: candidate.idNode,
            message: formatMessage(
              options.lang,
              `服务端 const “${candidate.name}” 被 ${consumptionCalls.size} 个 f.* 调用消费。` +
                `节点图连线会在每个使用点重新求值（data 节点不是值快照）：若其输入来自图变量且消费之间发生 ` +
                `写入（缺陷 6：set 后 equal 重新求值 Addition），一次逻辑会被重复计算。请把结果先写回图变量再重新 get，` +
                `或保证该表达式只被消费一次。`,
              `Server const "${candidate.name}" is consumed by ${consumptionCalls.size} f.* calls. ` +
                `Node-graph connections re-evaluate at every use (data nodes are not value snapshots): if an input ` +
                `comes from a graph variable and a write happens between consumptions (defect 6: engine re-evaluates ` +
                `Addition for equal after set), one logical execution is counted multiple times. Store the value to a ` +
                `graph variable first and re-get it, or guarantee the expression is consumed exactly once.`
            )
          })
        }
      }
    }
  }
}

export default rule
