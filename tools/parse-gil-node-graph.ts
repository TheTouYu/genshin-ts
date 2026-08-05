// @ts-nocheck
/**
 * 只读解析游戏内 GIL 节点图。
 *
 * 默认解析 _GSTS_main 并输出紧凑节点索引；控制流和数据流分别使用 trace-gil-exec-flow.ts / trace-gil-dataflow.ts。
 * --full 或 --json 才输出低层综合结构，适合调试，不作为生产分析入口。
 *
 * 用法:
 *   npx tsx tools/parse-gil-node-graph.ts <map.gil>
 *   npx tsx tools/parse-gil-node-graph.ts <map.gil> --graph auto
 *   npx tsx tools/parse-gil-node-graph.ts <map.gil> --composite 中心旋转
 *   npx tsx tools/parse-gil-node-graph.ts <map.gil> --list
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { readGilPayloadFields } from 'genshin-ts/cli/gil_extract_utils.js'
import { NODE_ID } from 'genshin-ts/compiler/gia_vendor.js'
import { parseMessage, readFieldBytes, readFieldMessages } from 'genshin-ts/injector/binary.js'
import { loadGiaProto } from 'genshin-ts/injector/proto.js'
import { NODE_PIN_RECORDS } from 'genshin-ts/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

const COMPOSITE_KIND = 22001
const SYSTEM_KIND = 22000
const DEFAULT_GRAPH_NAME = '_GSTS_main'
const DEFAULT_DEPTH = 0
const DEFAULT_MAX_ITEMS = 16
const DEFAULT_MAX_PRINT_PINS = 16

const PIN_KIND_NAMES = {
  1: 'InFlow',
  2: 'OutFlow',
  3: 'InParam',
  4: 'OutParam',
  5: 'ClientExecNode',
  6: 'ClientSignal'
}

const VAR_TYPE_NAMES = {
  0: 'Unknown',
  1: 'Entity',
  2: 'GUID',
  3: 'Integer',
  4: 'Boolean',
  5: 'Float',
  6: 'String',
  7: 'GUIDList',
  8: 'IntegerList',
  9: 'BooleanList',
  10: 'FloatList',
  11: 'StringList',
  12: 'Vector',
  13: 'EntityList',
  14: 'EnumItem',
  15: 'VectorList',
  16: 'LocalVariable',
  17: 'Faction',
  20: 'Configuration',
  21: 'Prefab',
  22: 'ConfigurationList',
  23: 'PrefabList',
  24: 'FactionList',
  25: 'Struct',
  26: 'StructList',
  27: 'Dictionary',
  28: 'VariableSnapshot'
}

const CLASS_NAMES = {
  0: 'Unknown',
  1: 'IdBase',
  2: 'IntBase',
  4: 'FloatBase',
  5: 'StringBase',
  6: 'EnumBase',
  7: 'VectorBase',
  10000: 'ConcreteBase',
  10001: 'StructBase',
  10002: 'ArrayBase',
  10003: 'MapBase',
  10007: 'MapPair'
}

const nodeRecords = new Map()
for (const record of NODE_PIN_RECORDS) nodeRecords.set(record.id, record)

const nodeNames = new Map()
for (const record of NODE_PIN_RECORDS) {
  if (record.name) nodeNames.set(record.id, record.name)
}
for (const [name, id] of Object.entries(NODE_ID)) {
  if (typeof id === 'number' && !nodeNames.has(id)) {
    nodeNames.set(id, name.replace(/__Generic$/, '').replace(/_/g, ' '))
  }
}

function asNumber(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'object') {
    if (typeof value.toNumber === 'function') return value.toNumber()
    if (typeof value.low === 'number') return value.low
  }
  const result = Number(value)
  return Number.isFinite(result) ? result : undefined
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function pinKind(kind) {
  return PIN_KIND_NAMES[kind] ?? `PinKind(${kind ?? '?'})`
}

function varType(type) {
  const id = asNumber(type)
  return id === undefined ? undefined : (VAR_TYPE_NAMES[id] ?? `VarType(${id})`)
}

function className(value) {
  const id = asNumber(value)
  return id === undefined ? undefined : (CLASS_NAMES[id] ?? `Class(${id})`)
}

function pinRef(ref) {
  if (!ref) return undefined
  return {
    kind: asNumber(ref.kind),
    index: asNumber(ref.index)
  }
}

function valueItemType(value) {
  const serverType = asNumber(value?.itemType?.type_server?.type)
  if (serverType !== undefined) return varType(serverType)
  const clientType = asNumber(value?.itemType?.type_client?.type)
  if (clientType !== undefined) return `Client${varType(clientType) ?? clientType}`
  return undefined
}

function decodeValue(value, maxItems = DEFAULT_MAX_ITEMS, depth = 0) {
  if (!value) return undefined
  if (depth > 8) return { truncated: true, reason: 'value-depth' }

  if (value.bString && value.bString.val !== undefined) return value.bString.val
  if (value.bInt && value.bInt.val !== undefined) return asNumber(value.bInt.val)
  if (value.bFloat && value.bFloat.val !== undefined) return asNumber(value.bFloat.val)
  if (value.bEnum) {
    return { enum: asNumber(value.bEnum.val) ?? null }
  }
  if (value.bId && value.bId.val !== undefined) {
    return { id: asNumber(value.bId.val) }
  }
  if (value.bVector?.val) {
    return {
      x: asNumber(value.bVector.val.x) ?? null,
      y: asNumber(value.bVector.val.y) ?? null,
      z: asNumber(value.bVector.val.z) ?? null
    }
  }
  if (value.bConcreteValue) {
    return {
      concrete: asNumber(value.bConcreteValue.indexOfConcrete) ?? null,
      value: decodeValue(value.bConcreteValue.value, maxItems, depth + 1)
    }
  }
  if (value.bArray?.entries) {
    const entries = value.bArray.entries
    const decoded = entries
      .slice(0, maxItems)
      .map((entry) => decodeValue(entry, maxItems, depth + 1))
    if (entries.length > maxItems) {
      // ponytail: large literal arrays keep a bounded head; --max-items raises the ceiling.
      return { array: decoded, length: entries.length, truncated: true }
    }
    return decoded
  }
  if (value.bStruct?.items) {
    return {
      struct: value.bStruct.items
        .slice(0, maxItems)
        .map((entry) => decodeValue(entry, maxItems, depth + 1)),
      length: value.bStruct.items.length
    }
  }
  if (value.bMapPair) {
    return {
      key: decodeValue(value.bMapPair.key, maxItems, depth + 1),
      value: decodeValue(value.bMapPair.value, maxItems, depth + 1)
    }
  }
  if (value.bMap?.mapPairs) {
    return {
      map: value.bMap.mapPairs
        .slice(0, maxItems)
        .map((entry) => decodeValue(entry, maxItems, depth + 1)),
      length: value.bMap.mapPairs.length
    }
  }

  const type = valueItemType(value)
  const cls = className(value.class)
  if (type || cls) return { class: cls, type, empty: true }
  return undefined
}

function valueText(value) {
  if (value === undefined) return '未设置'
  if (typeof value === 'string') return JSON.stringify(value)
  return JSON.stringify(value)
}

function compositeId(def) {
  return asNumber(def?.id?.genericId?.id) ?? asNumber(def?.id?.concreteId?.id)
}

function compositeGraphId(def) {
  return asNumber(def?.id?.graphId?.id)
}

function interfacePin(pin, kind) {
  const index = asNumber(pin?.index?.index)
  return {
    index,
    name: pin?.name || `${pinKind(kind)}[${index ?? '?'}]`,
    type: varType(pin?.type?.type1),
    pinIndex: asNumber(pin?.pinIndex),
    visible: pin?.visible
  }
}

function interfaceSummary(def) {
  if (!def) return undefined
  return {
    inflows: (def.inflows ?? []).map((pin) => interfacePin(pin, 1)),
    outflows: (def.outflows ?? []).map((pin) => interfacePin(pin, 2)),
    inputs: (def.inputs ?? []).map((pin) => interfacePin(pin, 3)),
    outputs: (def.outputs ?? []).map((pin) => interfacePin(pin, 4))
  }
}

function loadDocument(filePath) {
  const bytes = readFileSync(filePath)
  const { payload } = readGilPayloadFields(filePath)
  const fields = []
  const graphFields = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, {
    nodeGraphBlobFields: graphFields
  })

  const proto = loadGiaProto()
  const graphsById = new Map()
  for (const field of graphFields) {
    const graph = proto.nodeGraphMessage.decode(payload.subarray(field.dataStart, field.dataEnd))
    const id = asNumber(graph.id?.id)
    if (id !== undefined) graphsById.set(id, graph)
  }

  const compositeDefMessage = proto.root.lookupType('CompositeDef')
  const defsById = new Map()
  const defsByGraphId = new Map()
  const implGraphsById = new Map()
  for (const top10 of readFieldMessages(payload, 10)) {
    for (const wrapper of readFieldMessages(top10, 2)) {
      const encoded = readFieldBytes(wrapper, 1)
      if (!encoded) continue
      const def = compositeDefMessage.decode(encoded)
      const id = compositeId(def)
      if (id !== undefined) defsById.set(id, def)
      const graphId = compositeGraphId(def)
      if (graphId !== undefined && graphId !== 0) defsByGraphId.set(graphId, def)
    }
    for (const wrapper of readFieldMessages(top10, 4)) {
      const encoded = readFieldBytes(wrapper, 1)
      if (!encoded) continue
      const graph = proto.nodeGraphMessage.decode(encoded)
      const id = asNumber(graph.id?.id)
      if (id !== undefined) implGraphsById.set(id, graph)
    }
  }

  return {
    filePath,
    bytes: bytes.length,
    sha256: sha256(bytes),
    graphsById,
    defsById,
    defsByGraphId,
    implGraphsById
  }
}

function describeNode(doc, node) {
  const genericId = asNumber(node.genericId?.nodeId)
  const concreteId = asNumber(node.concreteId?.nodeId)
  const kind = asNumber(node.genericId?.kind)
  if (kind === COMPOSITE_KIND) {
    const def = doc.defsById.get(genericId)
    const graphId = compositeGraphId(def)
    return {
      genericId,
      concreteId,
      kind,
      kindName: 'SysGraph',
      api: def?.name ? `复合:${def.name}` : `复合#${genericId ?? '?'}`,
      name: def?.name ?? `复合#${genericId ?? '?'}`,
      composite: true,
      definitionId: genericId,
      graphId: graphId === 0 ? undefined : graphId,
      definition: def
    }
  }

  const record = nodeRecords.get(genericId) ?? nodeRecords.get(concreteId)
  const variant = record?.reflectMap?.find(([id]) => asNumber(id) === concreteId)
  const name = record?.name ?? nodeNames.get(genericId) ?? nodeNames.get(concreteId)
  return {
    genericId,
    concreteId,
    kind,
    kindName: kind === SYSTEM_KIND ? 'SysCall' : `Kind(${kind ?? '?'})`,
    api: name ?? `API#${genericId ?? concreteId ?? '?'}`,
    name: name ?? `API#${genericId ?? concreteId ?? '?'}`,
    composite: false,
    variant: variant?.[1],
    record
  }
}

function findInterfacePin(def, kind, index) {
  if (!def) return undefined
  const list =
    kind === 1
      ? def.inflows
      : kind === 2
        ? def.outflows
        : kind === 3
          ? def.inputs
          : kind === 4
            ? def.outputs
            : []
  return (list ?? []).find((pin) => asNumber(pin.index?.index) === index)
}

function pinMeta(nodeInfo, kind, index) {
  const def = nodeInfo.definition
  const interfaceValue = findInterfacePin(def, kind, index)
  if (interfaceValue) return interfacePin(interfaceValue, kind)

  const record = nodeInfo.record
  if (kind === 3 && record?.inputs?.[index] !== undefined) {
    return { index, name: record.inputs[index], type: record.inputs[index] }
  }
  if (kind === 4 && record?.outputs?.[index] !== undefined) {
    return { index, name: record.outputs[index], type: record.outputs[index] }
  }
  return { index, name: `${pinKind(kind)}[${index}]` }
}

function declaredPinMeta(nodeInfo, kind) {
  const def = nodeInfo.definition
  if (def) {
    const list =
      kind === 1
        ? def.inflows
        : kind === 2
          ? def.outflows
          : kind === 3
            ? def.inputs
            : kind === 4
              ? def.outputs
              : []
    return (list ?? [])
      .map((pin) => interfacePin(pin, kind))
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  }
  const record = nodeInfo.record
  if (kind === 3) {
    return (record?.inputs ?? []).map((type, index) => ({ index, name: type, type }))
  }
  if (kind === 4) {
    return (record?.outputs ?? []).map((type, index) => ({ index, name: type, type }))
  }
  return []
}

function connectionWire(connection) {
  return {
    id: asNumber(connection.id),
    connect: pinRef(connection.connect),
    connect2: pinRef(connection.connect2)
  }
}

function nodeLabel(nodeInfoMap, nodeIndex) {
  const info = nodeInfoMap.get(nodeIndex)
  return info ? `n=${nodeIndex} ${info.api}` : `n=${nodeIndex} (不存在)`
}

function sourceReference(connection, nodeInfoMap) {
  const sourceNode = asNumber(connection.id)
  const sourceInfo = nodeInfoMap.get(sourceNode)
  const sourcePin = connection.connect ?? connection.connect2
  const sourceIndex = asNumber(sourcePin?.index)
  const sourceMeta = sourceInfo
    ? pinMeta(sourceInfo, asNumber(sourcePin?.kind) ?? 4, sourceIndex ?? 0)
    : undefined
  return {
    node: sourceNode,
    api: sourceInfo?.api,
    pin: pinRef(sourcePin),
    pin_name: sourceMeta?.name,
    wire: connectionWire(connection)
  }
}

function actualPins(node, kind) {
  return (node.pins ?? [])
    .filter((pin) => asNumber(pin.i1?.kind) === kind)
    .sort((a, b) => (asNumber(a.i1?.index) ?? 0) - (asNumber(b.i1?.index) ?? 0))
}

function normalizeActualPin(pin, nodeInfo, nodeInfoMap, maxItems) {
  const kind = asNumber(pin.i1?.kind)
  const index = asNumber(pin.i1?.index) ?? 0
  const meta = pinMeta(nodeInfo, kind, index)
  const result = {
    kind: pinKind(kind),
    index,
    name: meta.name,
    type: meta.type,
    composite_pin_index: asNumber(pin.compositePinIndex),
    value: decodeValue(pin.value, maxItems),
    connections: (pin.connects ?? []).map((connection) => {
      if (kind === 3) return sourceReference(connection, nodeInfoMap)
      return connectionWire(connection)
    })
  }
  if (result.composite_pin_index === undefined) delete result.composite_pin_index
  if (result.value === undefined) delete result.value
  if (result.connections.length === 0) delete result.connections
  return result
}

function normalizeDeclaredPins(nodeInfo, node, kind, nodeInfoMap, maxItems) {
  const actual = actualPins(node, kind)
  const actualByIndex = new Map(actual.map((pin) => [asNumber(pin.i1?.index) ?? 0, pin]))
  const declared = declaredPinMeta(nodeInfo, kind)
  const indices = new Set(declared.map((pin) => pin.index))
  for (const pin of actual) indices.add(asNumber(pin.i1?.index) ?? 0)

  return [...indices]
    .sort((a, b) => (a ?? 0) - (b ?? 0))
    .map((index) => {
      const pin = actualByIndex.get(index)
      const meta = pinMeta(nodeInfo, kind, index)
      const result = {
        kind: pinKind(kind),
        index,
        name: meta.name,
        type: meta.type,
        present: !!pin
      }
      if (pin) {
        const value = decodeValue(pin.value, maxItems)
        const sources = (pin.connects ?? []).map((connection) =>
          sourceReference(connection, nodeInfoMap)
        )
        if (value !== undefined) result.value = value
        if (sources.length > 0) result.sources = sources
      }
      return result
    })
}

function branchName(nodeInfo, node, index) {
  const meta = pinMeta(nodeInfo, 2, index)
  if (meta.name && !meta.name.startsWith('OutFlow[')) return meta.name
  if (nodeInfo.genericId === 2) return index === 0 ? 'true' : 'false'
  if (nodeInfo.genericId === 3) {
    if (index === 0) return 'default'
    const casesPin = actualPins(node, 3).find((pin) => (asNumber(pin.i1?.index) ?? 0) === 1)
    const cases = decodeValue(casesPin?.value)
    const values = Array.isArray(cases) ? cases : cases?.value
    if (Array.isArray(values)) {
      const caseValue = values[index - 1]
      if (caseValue !== undefined) return String(caseValue)
    }
  }
  return `Branch[${index}]`
}

function normalizeBoundary(doc, graph, nodeInfoMap) {
  return (graph.compositePins ?? []).map((pin) => {
    const outer = pinRef(pin.outerPin)
    const inner = pinRef(pin.innerPin)
    const innerNodeId = asNumber(pin.innerNodeId)
    const innerInfo = nodeInfoMap.get(innerNodeId)
    const innerMeta =
      innerInfo && inner ? pinMeta(innerInfo, inner.kind, inner.index ?? 0) : undefined
    return {
      outer,
      outer_name: outer
        ? pinMeta(
            { definition: doc.defsByGraphId.get(asNumber(graph.id?.id)) },
            outer.kind,
            outer.index ?? 0
          ).name
        : undefined,
      inner_node: innerNodeId,
      inner_node_api: innerInfo?.api,
      inner,
      inner_name: innerMeta?.name,
      inner_pin2: pinRef(pin.innerPin2)
    }
  })
}

function parseGraph(doc, graph, meta, depth, activeGraphIds, maxItems) {
  const rawNodes = [...(graph.nodes ?? [])].sort(
    (a, b) => (asNumber(a.nodeIndex) ?? 0) - (asNumber(b.nodeIndex) ?? 0)
  )
  const nodeInfoMap = new Map()
  const nodeMap = new Map()
  for (const node of rawNodes) {
    const index = asNumber(node.nodeIndex)
    if (index === undefined) continue
    nodeMap.set(index, node)
    nodeInfoMap.set(index, describeNode(doc, node))
  }

  const nodes = rawNodes.map((node) => {
    const index = asNumber(node.nodeIndex)
    const info = nodeInfoMap.get(index)
    const result = {
      index,
      api: info.api,
      generic_id: info.genericId,
      concrete_id: info.concreteId,
      kind: info.kindName,
      variant: info.variant,
      position: {
        x: asNumber(node.x),
        y: asNumber(node.y)
      },
      signal_version: asNumber(node.signalVersion),
      inputs: normalizeDeclaredPins(info, node, 3, nodeInfoMap, maxItems),
      outputs: normalizeDeclaredPins(info, node, 4, nodeInfoMap, maxItems),
      pins: (node.pins ?? []).map((pin) => normalizeActualPin(pin, info, nodeInfoMap, maxItems))
    }
    if (result.variant === undefined) delete result.variant
    if (result.signal_version === undefined) delete result.signal_version
    if (info.composite) {
      const def = info.definition
      result.composite = {
        definition_id: info.definitionId,
        name: info.name,
        graph_id: info.graphId,
        interface: interfaceSummary(def),
        child_key: `composite:${info.definitionId ?? info.genericId}`
      }
    }
    return result
  })

  const dataflow = []
  const flow = []
  for (const node of rawNodes) {
    const toNode = asNumber(node.nodeIndex)
    const toInfo = nodeInfoMap.get(toNode)
    for (const pin of node.pins ?? []) {
      const kind = asNumber(pin.i1?.kind)
      const pinIndex = asNumber(pin.i1?.index) ?? 0
      if (kind === 3) {
        for (const connection of pin.connects ?? []) {
          const fromNode = asNumber(connection.id)
          const sourcePin = connection.connect ?? connection.connect2
          const sourceKind = asNumber(sourcePin?.kind) ?? 4
          const sourceIndex = asNumber(sourcePin?.index) ?? 0
          const fromInfo = nodeInfoMap.get(fromNode)
          const sourceMeta = fromInfo ? pinMeta(fromInfo, sourceKind, sourceIndex) : undefined
          const targetMeta = pinMeta(toInfo, 3, pinIndex)
          dataflow.push({
            from: {
              node: fromNode,
              api: fromInfo?.api,
              pin: pinRef(sourcePin),
              pin_name: sourceMeta?.name
            },
            to: {
              node: toNode,
              api: toInfo?.api,
              pin: { kind: 3, index: pinIndex },
              pin_name: targetMeta.name
            },
            wire: connectionWire(connection)
          })
        }
      } else if (kind === 2) {
        for (const connection of pin.connects ?? []) {
          const targetNode = asNumber(connection.id)
          const targetPin = connection.connect ?? connection.connect2
          const targetIndex = asNumber(targetPin?.index) ?? 0
          const targetInfo = nodeInfoMap.get(targetNode)
          const targetMeta = targetInfo ? pinMeta(targetInfo, 1, targetIndex) : undefined
          flow.push({
            from: {
              node: toNode,
              api: toInfo?.api,
              pin: { kind: 2, index: pinIndex },
              pin_name: branchName(toInfo, node, pinIndex)
            },
            to: {
              node: targetNode,
              api: targetInfo?.api,
              pin: { kind: 1, index: targetIndex },
              pin_name: targetMeta?.name ?? `InFlow[${targetIndex}]`
            },
            wire: connectionWire(connection)
          })
        }
      }
    }
  }

  const variables = (graph.graphValues ?? []).map((variable) => ({
    name: variable.name,
    type: varType(variable.type),
    exposed: variable.exposed,
    struct_id: asNumber(variable.structId),
    value: decodeValue(variable.values, maxItems)
  }))

  const result = {
    id: asNumber(graph.id?.id),
    type: asNumber(graph.id?.type),
    name: graph.name,
    scope: meta.scope,
    node_count: rawNodes.length,
    variables,
    boundary: normalizeBoundary(doc, graph, nodeInfoMap),
    nodes,
    dataflow,
    flow,
    children: []
  }

  if (meta.parent) result.parent = meta.parent
  if (meta.scope === 'composite') {
    result.interface = interfaceSummary(meta.definition)
  }

  if (depth <= 0) return result

  const childrenByKey = new Map()
  for (const node of rawNodes) {
    const info = nodeInfoMap.get(asNumber(node.nodeIndex))
    if (!info?.composite) continue
    const key = `composite:${info.definitionId ?? info.genericId}`
    let child = childrenByKey.get(key)
    if (!child) {
      const implementation =
        info.graphId === undefined ? undefined : doc.implGraphsById.get(info.graphId)
      child = {
        key,
        definition_id: info.definitionId,
        name: info.name,
        graph_id: info.graphId,
        interface: interfaceSummary(info.definition),
        call_sites: [],
        graph: undefined
      }
      if (!implementation) {
        child.status = 'no-implementation-graph'
      } else if (activeGraphIds.has(info.graphId)) {
        child.status = 'cycle'
      } else {
        const nextActive = new Set(activeGraphIds)
        nextActive.add(info.graphId)
        child.graph = parseGraph(
          doc,
          implementation,
          {
            scope: 'composite',
            definition: info.definition,
            parent: {
              definition_id: info.definitionId,
              name: info.name,
              graph_id: info.graphId
            }
          },
          depth - 1,
          nextActive,
          maxItems
        )
        child.status = 'parsed'
      }
      childrenByKey.set(key, child)
    }
    child.call_sites.push(asNumber(node.nodeIndex))
  }
  result.children = [...childrenByKey.values()]
  return result
}

function selectBySelector(entries, selector, label) {
  if (!selector) return undefined
  const numeric = /^\d+$/.test(selector) ? Number(selector) : undefined
  if (numeric !== undefined)
    return entries.find((entry) => entry.id === numeric || entry.graph_id === numeric)
  const exact = entries.filter((entry) => entry.name === selector)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) throw new Error(`${label}名称不唯一: ${selector}`)
  const fuzzy = entries.filter((entry) =>
    entry.name?.toLowerCase().includes(selector.toLowerCase())
  )
  if (fuzzy.length === 1) return fuzzy[0]
  if (fuzzy.length > 1) {
    throw new Error(
      `${label}匹配多个: ${fuzzy.map((entry) => `${entry.name}(${entry.id})`).join(', ')}`
    )
  }
  return undefined
}

function graphEntry(graph) {
  return {
    id: asNumber(graph.id?.id),
    graph_id: asNumber(graph.id?.id),
    name: graph.name,
    type: asNumber(graph.id?.type),
    node_count: graph.nodes?.length ?? 0,
    graph
  }
}

function getGraphEntries(doc) {
  return [...doc.graphsById.values()].map(graphEntry)
}

function graphChoice(entry) {
  return {
    id: entry.id,
    type: entry.type,
    name: entry.name,
    node_count: entry.node_count
  }
}

function isAutoGraphCandidate(entry) {
  return (
    entry.node_count > 0 &&
    Boolean(entry.name) &&
    entry.name !== DEFAULT_GRAPH_NAME &&
    !entry.name.startsWith('_GSTS_')
  )
}

function autoGraphCandidates(entries) {
  return entries.filter(isAutoGraphCandidate)
}

function graphChoiceText(entry) {
  return `${entry.name ?? '(无名)'}(${entry.id}, nodes=${entry.node_count})`
}

function selectAutoGraph(entries) {
  const candidates = autoGraphCandidates(entries)
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    throw new Error(
      `--auto 找到多个非空用户节点图，请改用 --graph <id|名称>：${candidates
        .map(graphChoiceText)
        .join(', ')}`
    )
  }
  return (
    selectBySelector(entries, DEFAULT_GRAPH_NAME, '节点图') ??
    entries.find((entry) => entry.node_count > 0) ??
    entries[0]
  )
}

function buildReport(doc, options) {
  const entries = getGraphEntries(doc)

  if (options.composite) {
    const compositeEntries = [...doc.defsById.entries()].map(([id, def]) => ({
      id,
      graph_id: compositeGraphId(def),
      name: def.name,
      def
    }))
    const selected = selectBySelector(compositeEntries, options.composite, '复合节点')
    if (!selected) throw new Error(`未找到复合节点: ${options.composite}`)
    const graph = selected.graph_id ? doc.implGraphsById.get(selected.graph_id) : undefined
    const target = {
      kind: 'composite',
      definition_id: selected.id,
      name: selected.name,
      graph_id: selected.graph_id,
      interface: interfaceSummary(selected.def)
    }
    return {
      input: { path: doc.filePath, bytes: doc.bytes, sha256: doc.sha256 },
      target,
      definition: target.interface,
      graph: graph
        ? parseGraph(
            doc,
            graph,
            { scope: 'composite', definition: selected.def, parent: target },
            options.depth,
            new Set([selected.graph_id]),
            options.maxItems
          )
        : null,
      status: graph ? 'parsed' : 'no-implementation-graph'
    }
  }

  const selected = options.auto
    ? selectAutoGraph(entries)
    : (selectBySelector(entries, options.graph ?? DEFAULT_GRAPH_NAME, '节点图') ??
      (options.graph ? undefined : entries[0]))
  if (!selected) {
    const available = entries.map(graphChoiceText).join(', ')
    throw new Error(`未找到节点图: ${options.graph ?? DEFAULT_GRAPH_NAME}; 可用: ${available}`)
  }
  const graph = selected.graph
  const graphId = asNumber(graph.id?.id)
  return {
    input: { path: doc.filePath, bytes: doc.bytes, sha256: doc.sha256 },
    target: {
      kind: 'main',
      id: graphId,
      name: graph.name,
      type: asNumber(graph.id?.type),
      selection: options.auto ? 'auto' : options.graph ? 'explicit' : 'default-main'
    },
    graph: parseGraph(
      doc,
      graph,
      { scope: 'main' },
      options.depth,
      new Set(graphId === undefined ? [] : [graphId]),
      options.maxItems
    ),
    status: 'parsed',
    discovery: {
      auto_candidates: autoGraphCandidates(entries).map(graphChoice)
    }
  }
}

function printList(doc, json) {
  const entries = getGraphEntries(doc)
  const candidates = autoGraphCandidates(entries)
  const result = {
    input: { path: doc.filePath, bytes: doc.bytes, sha256: doc.sha256 },
    graphs: entries.map(graphChoice),
    auto_candidates: candidates.map(graphChoice),
    composites: [...doc.defsById.entries()].map(([id, def]) => ({
      id,
      name: def.name,
      graph_id: compositeGraphId(def),
      has_implementation: !!(
        compositeGraphId(def) && doc.implGraphsById.has(compositeGraphId(def))
      ),
      inputs: def.inputs?.length ?? 0,
      outputs: def.outputs?.length ?? 0,
      inflows: def.inflows?.length ?? 0,
      outflows: def.outflows?.length ?? 0
    }))
  }
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(`文件: ${doc.filePath}`)
  console.log(`SHA-256: ${doc.sha256}`)
  console.log('\n节点图:')
  for (const graph of result.graphs) {
    console.log(`  ${graph.id}  ${graph.name}  nodes=${graph.node_count}  type=${graph.type}`)
  }
  console.log('\n自动候选用户图:')
  if (candidates.length === 0) console.log('  无；--auto 将回退到 _GSTS_main 或第一个非空图')
  else for (const graph of candidates) console.log(`  ${graphChoiceText(graph)}`)
  console.log('\n复合节点:')
  for (const composite of result.composites) {
    const body = composite.has_implementation ? `impl=${composite.graph_id}` : '无impl图'
    console.log(`  ${composite.id}  ${composite.name}  ${body}`)
  }
}

function renderPinSource(source) {
  return `n=${source.node} ${source.api ?? '(不存在)'}.${source.pin_name ?? `OutParam[${source.pin?.index ?? '?'}]`}`
}

function printGraph(graph, indent = '', maxPins = DEFAULT_MAX_PRINT_PINS) {
  const children = graph.children ?? []
  const nodeMap = new Map(graph.nodes.map((node) => [node.index, node]))
  console.log(
    `${indent}图 ${graph.name} (id=${graph.id}, nodes=${graph.node_count}, scope=${graph.scope})`
  )
  console.log(
    `${indent}统计: variables=${graph.variables.length} dataflow=${graph.dataflow.length} ` +
      `flow=${graph.flow.length} children=${children.length}`
  )
  if (graph.parent) {
    console.log(`${indent}父复合: ${graph.parent.name} (definition=${graph.parent.definition_id})`)
  }
  if (graph.interface) {
    const inputs = graph.interface.inputs.map((pin) => `${pin.name}:${pin.type ?? '?'}`).join(', ')
    const outputs = graph.interface.outputs
      .map((pin) => `${pin.name}:${pin.type ?? '?'}`)
      .join(', ')
    console.log(`${indent}接口: inputs=[${inputs}] outputs=[${outputs}]`)
  }
  if (graph.variables.length > 0) {
    console.log(
      `${indent}图变量: ${graph.variables.map((v) => `${v.name}:${v.type ?? '?'}`).join(', ')}`
    )
  }

  console.log(`${indent}API 调用:`)
  for (const node of graph.nodes) {
    const suffix = [
      node.variant ? `variant=${node.variant}` : '',
      node.composite
        ? `-> 子复合 ${node.composite.name} (graph=${node.composite.graph_id ?? '无'})`
        : ''
    ]
      .filter(Boolean)
      .join('  ')
    console.log(
      `${indent}  n=${node.index} ${node.api} [${node.kind}, generic=${node.generic_id ?? '?'}]${suffix ? `  ${suffix}` : ''}`
    )
    const presentInputs = node.inputs.filter((pin) => pin.present)
    const connectedInputs = presentInputs.filter((pin) => pin.sources?.length > 0)
    const literalInputs = presentInputs.filter((pin) => !pin.sources?.length)
    const literalLimit =
      maxPins === 0 ? literalInputs.length : Math.max(0, maxPins - connectedInputs.length)
    const visibleInputs = [...connectedInputs, ...literalInputs.slice(0, literalLimit)]
    for (const input of visibleInputs) {
      const source = input.sources?.map(renderPinSource).join(', ')
      const value = input.value !== undefined ? ` = ${valueText(input.value)}` : ''
      console.log(
        `${indent}    ${input.name} [${input.kind}[${input.index}]]${source ? ` <- ${source}` : value || ' (未连接)'}`
      )
    }
    const omittedInputs = presentInputs.length - visibleInputs.length
    if (omittedInputs > 0) {
      console.log(`${indent}    已设置输入省略: ${omittedInputs} 个（使用 --max-pins 0 查看全部）`)
    }
    const unconnectedInputs = node.inputs.filter((pin) => !pin.present)
    const visibleUnconnected =
      maxPins === 0 ? unconnectedInputs : unconnectedInputs.slice(0, maxPins)
    if (visibleUnconnected.length > 0) {
      console.log(
        `${indent}    未连接输入: ${visibleUnconnected
          .map((pin) => `${pin.name}[${pin.index}]`)
          .join(', ')}${
          unconnectedInputs.length > visibleUnconnected.length
            ? `（省略 ${unconnectedInputs.length - visibleUnconnected.length} 个）`
            : ''
        }`
      )
    }
  }

  if (graph.dataflow.length > 0) {
    console.log(`${indent}数据流:`)
    for (const edge of graph.dataflow) {
      console.log(
        `${indent}  ${nodeLabel(nodeMap, edge.from.node)}.` +
          `${edge.from.pin_name ?? `OutParam[${edge.from.pin?.index ?? '?'}]`} -> ` +
          `${nodeLabel(nodeMap, edge.to.node)}.` +
          `${edge.to.pin_name ?? `InParam[${edge.to.pin?.index ?? '?'}]`}`
      )
    }
  } else console.log(`${indent}数据流: 0 条`)
  if (graph.flow.length > 0) {
    console.log(`${indent}执行流:`)
    for (const edge of graph.flow) {
      console.log(
        `${indent}  n=${edge.from.node}.${edge.from.pin_name} -> n=${edge.to.node}.${edge.to.pin_name}`
      )
    }
  } else console.log(`${indent}执行流: 0 条`)
  if (graph.boundary.length > 0) {
    console.log(`${indent}复合边界:`)
    for (const boundary of graph.boundary) {
      console.log(
        `${indent}  外部 ${boundary.outer_name ?? `${pinKind(boundary.outer?.kind)}[${boundary.outer?.index ?? '?'}]`} ` +
          `-> 内部 n=${boundary.inner_node} ${boundary.inner_node_api ?? ''}.` +
          `${boundary.inner_name ?? `${pinKind(boundary.inner?.kind)}[${boundary.inner?.index ?? '?'}]`}`
      )
    }
  }
  if (children.length === 0) console.log(`${indent}复合子图: 0 个`)
  else {
    for (const child of children) {
      console.log(
        `${indent}子节点 ${child.name} (calls=${child.call_sites.join(',')}, status=${child.status})`
      )
      if (child.graph) printGraph(child.graph, `${indent}  `, maxPins)
    }
  }
}

function printGraphIndex(graph) {
  console.log(`图 ${graph.name} (id=${graph.id}, nodes=${graph.node_count}, scope=${graph.scope})`)
  console.log(
    `统计: variables=${graph.variables.length} dataflow=${graph.dataflow.length} ` +
      `flow=${graph.flow.length} children=${graph.children.length}`
  )
  if (graph.interface) {
    const inputs = graph.interface.inputs.map((pin) => `${pin.name}:${pin.type ?? '?'}`).join(', ')
    const outputs = graph.interface.outputs
      .map((pin) => `${pin.name}:${pin.type ?? '?'}`)
      .join(', ')
    console.log(`接口: inputs=[${inputs}] outputs=[${outputs}]`)
  }
  if (graph.children.length > 0)
    console.log(
      `提示: 含 ${graph.children.length} 个复合子图，--depth 展开仅在 --full/--json 模式可见`
    )
  console.log('节点索引:')
  for (const node of graph.nodes) {
    const composite = node.composite
      ? ` 复合=${node.composite.name} graph=${node.composite.graph_id ?? '无'}`
      : ''
    console.log(`  n=${node.index} ${node.api} [${node.kind}]${composite}`)
  }
}

function usage(exitCode = 0) {
  const text = [
    '用法: npx tsx tools/parse-gil-node-graph.ts <map.gil> [选项]',
    '',
    '默认:',
    '  解析名称为 _GSTS_main 的主图；找不到时使用文件中的第一个节点图。',
    '',
    '选项:',
    '  --graph <id|name|auto>   解析指定主图；auto 选择唯一非空用户图',
    '  --auto                   等价于 --graph auto；多个候选时拒绝猜测',
    '  --composite <id|name>   单独解析指定复合节点',
    `  --depth <n>             复合子图展开层数（默认 ${DEFAULT_DEPTH}，0=不展开；仅 --full/--json 可见）`,
    '  --full                  显示低层综合文本（可能很大，生产分析请用 trace 工具）',
    '  --max-items <n>         单个字面量数组最多展开项数（默认 16）',
    `  --max-pins <n>          文本每个节点最多显示 n 个字面量/未连接引脚（默认 ${DEFAULT_MAX_PRINT_PINS}，0=全部）`,
    '  --all-pins              等价于 --max-pins 0',
    '  --no-expand             等价于 --depth 0',
    '  --list                  只列出主图、自动候选图和复合节点目录',
    '  --json                  输出结构化 JSON',
    '  -h, --help              显示帮助'
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](text)
  process.exit(exitCode)
}

function parseArgs(args) {
  if (args.includes('-h') || args.includes('--help')) usage(0)
  const filePath = args[0]
  if (!filePath || filePath.startsWith('-')) usage(1)
  const options = {
    graph: undefined,
    composite: undefined,
    auto: false,
    depth: DEFAULT_DEPTH,
    maxItems: DEFAULT_MAX_ITEMS,
    maxPins: DEFAULT_MAX_PRINT_PINS,
    full: args.includes('--full'),
    json: args.includes('--json'),
    list: args.includes('--list')
  }
  const requiredValue = (index, option) => {
    const value = args[index + 1]
    if (!value || value.startsWith('-')) throw new Error(`${option} 需要一个值`)
    return value
  }
  const setGraphSelector = (value) => {
    if (value === 'auto') options.auto = true
    else options.graph = value
  }
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--graph') setGraphSelector(requiredValue(i++, arg))
    else if (arg.startsWith('--graph=')) setGraphSelector(arg.slice('--graph='.length))
    else if (arg === '--auto') options.auto = true
    else if (arg === '--composite') options.composite = requiredValue(i++, arg)
    else if (arg.startsWith('--composite=')) options.composite = arg.slice('--composite='.length)
    else if (arg === '--depth') options.depth = Number(requiredValue(i++, arg))
    else if (arg.startsWith('--depth=')) options.depth = Number(arg.slice('--depth='.length))
    else if (arg === '--max-items') options.maxItems = Number(requiredValue(i++, arg))
    else if (arg.startsWith('--max-items='))
      options.maxItems = Number(arg.slice('--max-items='.length))
    else if (arg === '--max-pins') options.maxPins = Number(requiredValue(i++, arg))
    else if (arg.startsWith('--max-pins='))
      options.maxPins = Number(arg.slice('--max-pins='.length))
    else if (arg === '--all-pins') options.maxPins = 0
    else if (arg === '--full') options.full = true
    else if (arg === '--no-expand' || arg === '--json' || arg === '--list') {
      if (arg === '--no-expand') options.depth = 0
    } else usage(1)
  }
  if (options.graph && options.composite) throw new Error('--graph 与 --composite 不能同时使用')
  if (options.auto && options.graph) throw new Error('--auto 与 --graph <id|name> 不能同时使用')
  if (options.auto && options.composite)
    throw new Error('--auto 只能用于主图，不能与 --composite 同时使用')
  if (!Number.isInteger(options.depth) || options.depth < 0)
    throw new Error('--depth 必须是非负整数')
  if (!Number.isInteger(options.maxItems) || options.maxItems < 1)
    throw new Error('--max-items 必须是正整数')
  if (!Number.isInteger(options.maxPins) || options.maxPins < 0)
    throw new Error('--max-pins 必须是非负整数')
  return { filePath, options }
}

async function main() {
  const { filePath, options } = parseArgs(process.argv.slice(2))
  const doc = loadDocument(filePath)
  if (options.list) {
    printList(doc, options.json)
    return
  }
  const report = buildReport(doc, options)
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else if (options.full) {
    console.log(`文件: ${report.input.path}`)
    console.log(`SHA-256: ${report.input.sha256}`)
    if (report.graph) printGraph(report.graph, '', options.maxPins)
    else console.log(`状态: ${report.status}`)
  } else {
    console.log(`文件: ${report.input.path}`)
    console.log(`SHA-256: ${report.input.sha256}`)
    const selection = report.target.selection ? ` selection=${report.target.selection}` : ''
    console.log(`目标: ${report.target.kind} ${report.target.name}${selection}`)
    const candidates = report.discovery?.auto_candidates ?? []
    if (candidates.length > 0 && report.target.selection !== 'auto') {
      console.log(
        `自动候选: ${candidates.map(graphChoiceText).join(', ')}（使用 --auto 可直接解析）`
      )
    }
    if (report.graph) printGraphIndex(report.graph)
    else console.log(`状态: ${report.status}`)
  }
}

export { buildReport, loadDocument }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') process.exit(0)
    throw error
  })
  main().catch((error) => {
    console.error(`解析失败: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
