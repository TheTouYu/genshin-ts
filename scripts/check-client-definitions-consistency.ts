import fs from 'node:fs'

import ts from 'typescript'

import { CLIENT_ENTITY_HELPER_BINDINGS_BY_SUB_TYPE_AND_MODE } from '../src/definitions/client_entity_helpers.js'
import {
  CLIENT_NODE_METHODS_BY_SUB_TYPE,
  CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE,
  CLIENT_NODE_TYPES_BY_SUB_TYPE_AND_MODE
} from '../src/definitions/client_method_modes.js'
import { CLIENT_F_ZH_TO_EN_BY_SUB_TYPE } from '../src/definitions/client_zh_aliases.js'
import { CLIENT_NODE_METADATA } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
import { snakeToCamel } from './client-nodegraph/client_nodes_codegen.js'

/** graph entry/exit nodes handled by the runtime, never exposed as methods */
const RUNTIME_INTERNAL_NODE_TYPES = new Set([
  'node_graph_begins',
  'node_graph_end_boolean',
  'node_graph_end_integer'
])

type GapEntry = { subType: string; nodeType: string; reason: string }
type ModeData = {
  graphs: Record<
    string,
    Record<'beyond' | 'classic', { status: string; genericIds: number[] }> & {
      entryGenericId: number
    }
  >
}
type FlowMetadata = {
  subTypes: string[]
  returns: Array<{ name: string }> | null
}
const gaps: GapEntry[] = JSON.parse(
  fs.readFileSync('tests/client_generated/_generation_gaps.json', 'utf8')
)
const modeData = JSON.parse(fs.readFileSync('resources/client_node_modes.json', 'utf8')) as ModeData
const flowMetadata = JSON.parse(
  fs.readFileSync('resources/client_execution_flow_metadata.json', 'utf8')
) as FlowMetadata[]
const gapKeys = new Set(gaps.map((g) => `${g.subType}.${g.nodeType}`))
const methodNodeTypeBySubType = new Map<string, string>()
const methodNameBySubTypeAndNodeType = new Map<string, string>()
for (const item of CLIENT_NODE_METADATA) {
  const methodName = snakeToCamel(item.nodeType)
  methodNodeTypeBySubType.set(`${item.subType}.${methodName}`, item.nodeType)
  methodNameBySubTypeAndNodeType.set(`${item.subType}.${item.nodeType}`, methodName)
}

const metadataTypesBySubType = new Map<string, Set<string>>()
for (const item of CLIENT_NODE_METADATA) {
  const set = metadataTypesBySubType.get(item.subType) ?? new Set<string>()
  metadataTypesBySubType.set(item.subType, set)
  set.add(item.nodeType)
}

const errors: string[] = []
const expectedEntityHelperNames = new Set<string>()

const expectedZhAliases = {
  character_skill: {
    恢复生命值: 'recoverCharacterSHp',
    角色恢复生命值: 'recoverCharacterSHp'
  },
  creation_skill: {
    获取复杂造物当前释放的技能: 'getTheComplexCreationSCurrentUsingSkill',
    获取复杂造物当前施放的技能: 'getTheComplexCreationSCurrentUsingSkill'
  },
  creation_status: {
    查询字典中值组成的列表: 'getListOfValuesFromDictionary',
    获取字典中值组成的列表: 'getListOfValuesFromDictionary',
    查询字典中键组成的列表: 'getListOfKeysFromDictionary',
    获取字典中键组成的列表: 'getListOfKeysFromDictionary'
  },
  creation_status_decision: {
    查询字典中值组成的列表: 'getListOfValuesFromDictionary',
    获取字典中值组成的列表: 'getListOfValuesFromDictionary',
    查询字典中键组成的列表: 'getListOfKeysFromDictionary',
    获取字典中键组成的列表: 'getListOfKeysFromDictionary'
  }
} as const
for (const [subType, aliases] of Object.entries(expectedZhAliases)) {
  const generated = CLIENT_F_ZH_TO_EN_BY_SUB_TYPE[
    subType as keyof typeof CLIENT_F_ZH_TO_EN_BY_SUB_TYPE
  ] as Readonly<Record<string, string>>
  for (const [alias, method] of Object.entries(aliases)) {
    if (generated[alias] !== method) {
      errors.push(`missing client zh compatibility alias: ${subType}.${alias} -> ${method}`)
    }
  }
}

for (const [subType, bindingsByMode] of Object.entries(
  CLIENT_ENTITY_HELPER_BINDINGS_BY_SUB_TYPE_AND_MODE
)) {
  for (const mode of ['beyond', 'classic'] as const) {
    const availableMethods = CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE[
      subType as keyof typeof CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE
    ][mode] as readonly string[]
    const bindings = bindingsByMode[mode] as Record<
      string,
      { kind: 'method' | 'getter'; methodName: string; insertIndex: number | null }
    >
    for (const [helperName, binding] of Object.entries(bindings)) {
      expectedEntityHelperNames.add(helperName)
      if (!availableMethods.includes(binding.methodName)) {
        errors.push(
          `entity helper mode mismatch: ${subType}.${mode}.${helperName} -> ${binding.methodName}`
        )
      }
      if (helperName === 'set') {
        errors.push(`unsupported client entity set helper exposed: ${subType}.${mode}`)
      }
    }
    const customVariableUsesEntityReceiver =
      subType !== 'creation_status' && subType !== 'creation_status_decision'
    if (availableMethods.includes('getCustomVariable') && customVariableUsesEntityReceiver) {
      if (bindings.get?.methodName !== 'getCustomVariable') {
        errors.push(`missing client entity get alias: ${subType}.${mode}`)
      }
      if (bindings.getCustomVariable?.methodName !== 'getCustomVariable') {
        errors.push(`missing client entity getCustomVariable helper: ${subType}.${mode}`)
      }
    } else if (!customVariableUsesEntityReceiver) {
      if ('get' in bindings || 'getCustomVariable' in bindings) {
        errors.push(
          `TargetEntity custom variable must not become entity helper: ${subType}.${mode}`
        )
      }
    }
  }
}

const clientNodesSourceText = fs.readFileSync('src/definitions/client_nodes.ts', 'utf8')
const clientNodesSource = ts.createSourceFile(
  'client_nodes.ts',
  clientNodesSourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS
)

let tacticalContextMethodCount = 0
let tacticGroundPursuitMethodCount = 0
function checkTacticalContextDocs(node: ts.Node): void {
  if (
    ts.isMethodDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'tacticGroundPursuit'
  ) {
    tacticGroundPursuitMethodCount += 1
    const actual = node.parameters.map((parameter) => parameter.name.getText(clientNodesSource))
    const expected = [
      'input1',
      'input2',
      'input3',
      'input4',
      'input5',
      'input6',
      'input7',
      'input8',
      'input9',
      'input10',
      'input11'
    ]
    if (actual.join(',') !== expected.join(',')) {
      errors.push(
        `tacticGroundPursuit parameter names mismatch: actual=${actual.join(',')} expected=${expected.join(',')}`
      )
    }
  }

  if (
    (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) &&
    ((ts.isIdentifier(node.name) && node.name.text === 'tacticGroundPursuit') ||
      node.parameters.some(
        (parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === 'tacticalContext'
      ))
  ) {
    tacticalContextMethodCount += 1
    const source = node.getFullText(clientNodesSource)
    if (
      !source.includes('GSTS Note: Tactical Context is only text used as an identifier') ||
      !source.includes('GSTS 注: 【战术上下文】只是一段用于标识并随战术传递的数据文本') ||
      !source.includes('可以留空') ||
      !source.includes('When Execute is false, this tactic is treated as failed') ||
      !source.includes('当【是否执行】为 false 时，该战术等同于执行失败')
    ) {
      errors.push(`tacticalContext JSDoc incomplete: ${node.name.getText(clientNodesSource)}`)
    }
  }
  ts.forEachChild(node, checkTacticalContextDocs)
}
checkTacticalContextDocs(clientNodesSource)
if (tacticalContextMethodCount === 0) {
  errors.push('no generated tacticalContext parameters found')
}
if (tacticGroundPursuitMethodCount !== 1) {
  errors.push(`expected one tacticGroundPursuit method, got ${tacticGroundPursuitMethodCount}`)
}

function checkMultiReturnFieldDocs(
  member: ts.MethodDeclaration | ts.MethodSignature,
  source: ts.SourceFile,
  label: string
): number {
  if (!member.type || !ts.isTypeLiteralNode(member.type)) return 0
  const fields = member.type.members.filter(ts.isPropertySignature)
  if (fields.length < 2) return 0
  for (const field of fields) {
    const name = field.name?.getText(source) ?? '<unknown>'
    const jsDoc = ts
      .getJSDocCommentsAndTags(field)
      .find((node): node is ts.JSDoc => node.kind === ts.SyntaxKind.JSDocComment)
    if (!jsDoc) {
      errors.push(`client multi-return field missing JSDoc: ${label}.${name}`)
      continue
    }
    if (!/[\u3400-\u9fff]/u.test(jsDoc.getFullText(source))) {
      errors.push(`client multi-return field missing Chinese JSDoc: ${label}.${name}`)
    }
  }
  const methodJsDoc = ts
    .getJSDocCommentsAndTags(member)
    .find((node): node is ts.JSDoc => node.kind === ts.SyntaxKind.JSDocComment)
  const returnTag = methodJsDoc?.tags?.find(
    (tag): tag is ts.JSDocReturnTag => tag.kind === ts.SyntaxKind.JSDocReturnTag
  )
  const returnComment =
    typeof returnTag?.comment === 'string' ? returnTag.comment.trim() : undefined
  const firstFieldName = fields[0]?.name?.getText(source)
  if (returnComment && firstFieldName && returnComment.startsWith(firstFieldName)) {
    errors.push(`client multi-return method has a redundant field-list @returns: ${label}`)
  }
  return fields.length
}

const publicClientMethodNames = new Set(
  Object.values(CLIENT_NODE_METHODS_BY_SUB_TYPE).flatMap((methods) => methods as readonly string[])
)
let generatedMultiReturnMethodCount = 0
let generatedMultiReturnFieldCount = 0
for (const statement of clientNodesSource.statements) {
  if (!ts.isClassDeclaration(statement) || !statement.name) continue
  for (const member of statement.members) {
    if (
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      publicClientMethodNames.has(member.name.text)
    ) {
      const fieldCount = checkMultiReturnFieldDocs(
        member,
        clientNodesSource,
        `${statement.name.text}.${member.name.text}`
      )
      if (member.body && fieldCount) {
        generatedMultiReturnMethodCount += 1
        generatedMultiReturnFieldCount += fieldCount
      }
    }
  }
}
const expectedMultiReturnMethodCount = flowMetadata
  .filter((entry) => (entry.returns?.length ?? 0) > 1)
  .reduce((count, entry) => count + entry.subTypes.length, 0)
if (generatedMultiReturnMethodCount !== expectedMultiReturnMethodCount) {
  errors.push(
    `client multi-return method coverage mismatch: actual=${generatedMultiReturnMethodCount} ` +
      `expected=${expectedMultiReturnMethodCount}`
  )
}

const statusClassNames = {
  creation_status: 'ClientCreationStatusExecutionFlowFunctions',
  creation_status_decision: 'ClientCreationStatusDecisionExecutionFlowFunctions'
} as const
for (const [subType, className] of Object.entries(statusClassNames)) {
  const classDeclaration = clientNodesSource.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === className
  )
  if (!classDeclaration) {
    errors.push(`missing generated status class: ${className}`)
    continue
  }

  for (const item of CLIENT_NODE_METADATA) {
    if (item.subType !== subType) continue
    const outFlowCount = item.flows?.filter((pin) => pin.kind === 'out_flow').length ?? 0
    const requiresFailureNote = outFlowCount === 1
    const requiresTerminalNote = item.nodeType === 'continue_executing_previous_frame_behavior'
    if (!requiresFailureNote && !requiresTerminalNote) continue

    const methodName = methodNameBySubTypeAndNodeType.get(`${subType}.${item.nodeType}`)
    if (!methodName) {
      errors.push(`missing generated status method mapping: ${subType}.${item.nodeType}`)
      continue
    }
    const member = classDeclaration.members.find(
      (candidate) =>
        ts.isMethodDeclaration(candidate) &&
        ts.isIdentifier(candidate.name) &&
        candidate.name.text === methodName
    )
    if (!member) {
      errors.push(`missing generated status method for JSDoc check: ${subType}.${methodName}`)
      continue
    }
    const source = member.getFullText(clientNodesSource)
    if (
      requiresFailureNote &&
      (!source.includes('GSTS Note: This is intentionally different') ||
        !source.includes('GSTS 注: 这是一个容易误解的特殊行为') ||
        !source.includes('只有前面的行为执行失败，才会执行后面的语句'))
    ) {
      errors.push(`status failure-flow JSDoc incomplete: ${subType}.${methodName}`)
    }
    if (
      requiresTerminalNote &&
      (!source.includes('GSTS Note: This node has no successor execution output') ||
        !source.includes('If used, it must be the final statement') ||
        !source.includes('若使用本节点，它必须作为当前执行分支的最后一条语句'))
    ) {
      errors.push(`status terminal-flow JSDoc incomplete: ${subType}.${methodName}`)
    }
    if (
      item.nodeType === 'switch_to_self_execution_status' &&
      (!source.includes('Autonomous Logic Parameter ID is used only') ||
        !source.includes('Creation Properties panel') ||
        !source.includes('connect conditions to the [Execute] inputs') ||
        !source.includes('select different Status Node Graph Configuration IDs') ||
        !source.includes('仅用于切换造物属性面板中配置的自主逻辑') ||
        !source.includes('将不同条件连接到各行为节点的') ||
        !source.includes('选择不同的【状态节点图配置ID】'))
    ) {
      errors.push(`status-switch autonomous-logic JSDoc incomplete: ${subType}.${methodName}`)
    }
  }
}

const entityHelperInterface = clientNodesSource.statements.find(
  (statement): statement is ts.InterfaceDeclaration =>
    ts.isInterfaceDeclaration(statement) && statement.name.text === 'ClientEntityHelperMethods'
)
if (!entityHelperInterface) {
  errors.push('missing ClientEntityHelperMethods interface')
} else {
  const documentedNames = new Set<string>()
  for (const member of entityHelperInterface.members) {
    if (!member.name || !ts.isIdentifier(member.name)) {
      errors.push('client entity helper has an unsupported member name')
      continue
    }
    const helperName = member.name.text
    documentedNames.add(helperName)
    const jsDoc = ts
      .getJSDocCommentsAndTags(member)
      .find((node): node is ts.JSDoc => node.kind === ts.SyntaxKind.JSDocComment)
    if (!jsDoc) {
      errors.push(`client entity helper missing JSDoc: ${helperName}`)
      continue
    }
    if (ts.isMethodSignature(member)) {
      checkMultiReturnFieldDocs(
        member,
        clientNodesSource,
        `ClientEntityHelperMethods.${helperName}`
      )
      const actualParams = member.parameters.map((parameter) =>
        parameter.name.getText(clientNodesSource)
      )
      const documentedParams: string[] = []
      for (const tag of jsDoc.tags ?? []) {
        if (tag.kind === ts.SyntaxKind.JSDocParameterTag) {
          documentedParams.push((tag as ts.JSDocParameterTag).name.getText(clientNodesSource))
        }
      }
      if (actualParams.join('|') !== documentedParams.join('|')) {
        errors.push(
          `client entity helper JSDoc params mismatch: ${helperName} ` +
            `(${documentedParams.join(', ') || 'none'} vs ${actualParams.join(', ') || 'none'})`
        )
      }
    }
    const returnsValue =
      ts.isPropertySignature(member) ||
      (ts.isMethodSignature(member) && member.type?.kind !== ts.SyntaxKind.VoidKeyword)
    const hasReturnDoc = (jsDoc.tags ?? []).some((tag) => tag.kind === ts.SyntaxKind.JSDocReturnTag)
    const hasDocumentedReturnFields =
      ts.isMethodSignature(member) &&
      member.type !== undefined &&
      ts.isTypeLiteralNode(member.type) &&
      member.type.members.filter(ts.isPropertySignature).length > 1
    if (returnsValue && !hasReturnDoc && !hasDocumentedReturnFields) {
      errors.push(`client entity helper missing @returns JSDoc: ${helperName}`)
    }
  }
  for (const helperName of expectedEntityHelperNames) {
    if (!documentedNames.has(helperName)) {
      errors.push(`client entity helper missing documented signature: ${helperName}`)
    }
  }
  for (const helperName of documentedNames) {
    if (!expectedEntityHelperNames.has(helperName)) {
      errors.push(`client entity helper documented but not bound: ${helperName}`)
    }
  }
}

let methodCount = 0

for (const item of CLIENT_NODE_METADATA) {
  const graph = modeData.graphs[item.subType]
  for (const mode of ['beyond', 'classic'] as const) {
    const expected =
      graph[mode].status === 'available' &&
      (item.genericId === graph.entryGenericId || graph[mode].genericIds.includes(item.genericId))
    const actual = (
      CLIENT_NODE_TYPES_BY_SUB_TYPE_AND_MODE[item.subType][mode] as readonly string[]
    ).includes(item.nodeType)
    if (actual !== expected) {
      errors.push(
        `node mode mismatch: ${item.subType}.${item.nodeType} (${item.genericId}) ${mode}`
      )
    }
  }
}

// 1. every generated method maps to a metadata record within its subType, and
// 3. no Chinese-typed record is exposed as a method
const methodNodeTypesBySubType = new Map<string, Set<string>>()
for (const [subType, methods] of Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE)) {
  const nodeTypes = metadataTypesBySubType.get(subType)
  const exposed = new Set<string>()
  methodNodeTypesBySubType.set(subType, exposed)
  for (const method of methods as readonly string[]) {
    methodCount += 1
    const nodeType = methodNodeTypeBySubType.get(`${subType}.${method}`)
    if (!nodeType) {
      errors.push(`missing stable method mapping: ${subType}.${method}`)
      continue
    }
    exposed.add(nodeType)
    if (!nodeTypes?.has(nodeType))
      errors.push(`missing metadata: ${subType}.${method} -> ${nodeType}`)
    if (/[\u3400-\u9fff]/.test(nodeType))
      errors.push(`chinese nodeType exposed: ${subType}.${method}`)
    const expectedMethod = snakeToCamel(nodeType)
    if (method !== expectedMethod) {
      errors.push(
        `client method does not retain stable nodeType name: ${subType}.${method} != ${expectedMethod}`
      )
    }
    for (const mode of ['beyond', 'classic'] as const) {
      const methodAvailable = (
        CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE[
          subType as keyof typeof CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE
        ][mode] as readonly string[]
      ).includes(method)
      const nodeAvailable = (
        CLIENT_NODE_TYPES_BY_SUB_TYPE_AND_MODE[
          subType as keyof typeof CLIENT_NODE_TYPES_BY_SUB_TYPE_AND_MODE
        ][mode] as readonly string[]
      ).includes(nodeType)
      if (methodAvailable !== nodeAvailable) {
        errors.push(`method mode mismatch: ${subType}.${method} ${mode}`)
      }
    }
  }
}

// 2. every non-start, non-internal metadata record is either generated or a reported gap
for (const item of CLIENT_NODE_METADATA) {
  if (item.isStart || RUNTIME_INTERNAL_NODE_TYPES.has(item.nodeType)) continue
  if (/[\u3400-\u9fff]/.test(item.nodeType)) continue // unresolved zh names never generate
  if (methodNodeTypesBySubType.get(item.subType)?.has(item.nodeType)) continue
  if (gapKeys.has(`${item.subType}.${item.nodeType}`)) continue
  errors.push(`record neither generated nor gap-reported: ${item.subType}.${item.nodeType}`)
}

if (errors.length) {
  throw new Error(`client definitions inconsistent:\n${errors.join('\n')}`)
}

console.log(
  `[ok] client definitions consistency (${methodCount} method entries across ` +
    `${metadataTypesBySubType.size} sub types, ${generatedMultiReturnMethodCount} multi-return ` +
    `methods / ${generatedMultiReturnFieldCount} documented fields, ${gapKeys.size} reported gaps)`
)
