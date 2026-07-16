import fs from 'node:fs'

import ts from 'typescript'

import { CLIENT_ENTITY_HELPER_BINDINGS_BY_SUB_TYPE_AND_MODE } from '../src/definitions/client_entity_helpers.js'
import {
  CLIENT_NODE_METHODS_BY_SUB_TYPE,
  CLIENT_NODE_METHODS_BY_SUB_TYPE_AND_MODE,
  CLIENT_NODE_TYPES_BY_SUB_TYPE_AND_MODE
} from '../src/definitions/client_method_modes.js'
import { CLIENT_NODE_METADATA } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'

// keep leading underscores: `_3dVectorDotProduct` -> `_3d_vector_dot_product`
function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
}

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
const gaps: GapEntry[] = JSON.parse(
  fs.readFileSync('tests/client_generated/_generation_gaps.json', 'utf8')
)
const modeData = JSON.parse(fs.readFileSync('resources/client_node_modes.json', 'utf8')) as ModeData
const gapKeys = new Set(gaps.map((g) => `${g.subType}.${g.nodeType}`))

const metadataTypesBySubType = new Map<string, Set<string>>()
for (const item of CLIENT_NODE_METADATA) {
  const set = metadataTypesBySubType.get(item.subType) ?? new Set<string>()
  metadataTypesBySubType.set(item.subType, set)
  set.add(item.nodeType)
}

const errors: string[] = []
const expectedEntityHelperNames = new Set<string>()

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
    if (availableMethods.includes('getCustomVariable')) {
      if (bindings.get?.methodName !== 'getCustomVariable') {
        errors.push(`missing client entity get alias: ${subType}.${mode}`)
      }
      if (bindings.getCustomVariable?.methodName !== 'getCustomVariable') {
        errors.push(`missing client entity getCustomVariable helper: ${subType}.${mode}`)
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
    if (returnsValue && !hasReturnDoc) {
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
    const nodeType = camelToSnake(method)
    exposed.add(nodeType)
    if (!nodeTypes?.has(nodeType))
      errors.push(`missing metadata: ${subType}.${method} -> ${nodeType}`)
    if (/[\u3400-\u9fff]/.test(nodeType))
      errors.push(`chinese nodeType exposed: ${subType}.${method}`)
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
    `${metadataTypesBySubType.size} sub types, ${gapKeys.size} reported gaps)`
)
