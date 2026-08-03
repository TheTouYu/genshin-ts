import fs from 'node:fs'
import path from 'node:path'

import { detectLang, initCliI18n } from '../i18n/index.js'
import {
  applyReplacement,
  buildFile,
  encodeVarint,
  parseMessage,
  readFieldBytes,
  readFieldMessages,
  readUint32BE
} from './binary.js'
import {
  collectFolderIndexes,
  findFolderEntryField,
  resolveGraphTypeForTypeValue
} from './folder.js'
import {
  buildGraphTypeMap,
  extractGraphType,
  findNodeGraphTargets,
  getGraphId,
  isClientGraphType,
  isNodeGraphEmptyForInjection,
  loadGiaGraph,
  setGraphId,
  setGraphType
} from './node_graph.js'
import { loadGiaProto } from './proto.js'
import { patchSignalNodeIds, type SignalNodeKind } from './signal_nodes.js'
import type {
  InjectGilFileOptions,
  InjectGilFileResult,
  InjectGilInput,
  InjectGilResult,
  LenField
} from './types.js'

export type Injector = {
  injectBytes: (input: InjectGilInput) => InjectGilResult
  injectFile: (options: InjectGilFileOptions) => InjectGilFileResult
}

export type { InjectGilFileOptions, InjectGilFileResult, InjectGilInput, InjectGilResult }

function fmtGraphType(
  type: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (typeof type !== 'number') return t('graphType_unknown')
  let name: string
  switch (type) {
    case 20000:
      name = t('graphType_entity')
      break
    case 20003:
      name = t('graphType_status')
      break
    case 20004:
      name = t('graphType_class')
      break
    case 20005:
      name = t('graphType_item')
      break
    default:
      name = t('graphType_unknown')
      break
  }
  return `${name}(${type})`
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'bigint') return Number(value)
  if (value && typeof value === 'object') {
    const maybeLong = value as { toNumber?: () => number }
    if (typeof maybeLong.toNumber === 'function') {
      const n = maybeLong.toNumber()
      return Number.isFinite(n) ? n : undefined
    }
  }
  return undefined
}

function encodeMessageField(field: number, data: Uint8Array): Uint8Array {
  return Buffer.concat([
    Buffer.from(encodeVarint((field << 3) | 2)),
    Buffer.from(encodeVarint(data.length)),
    Buffer.from(data)
  ])
}

function findTopLevelMessageField(fields: LenField[], field: number): LenField | undefined {
  return fields.find((f) => f.depth === 1 && f.p0 === field)
}

function mergeWrappedFieldMessages(
  existingWrappers: Uint8Array[],
  incomingInnerMessages: Uint8Array[],
  getId: (bytes: Uint8Array) => number | undefined,
  overwriteExisting = false
): Uint8Array[] {
  const ordered: Uint8Array[] = []
  const indexById = new Map<number, number>()
  const anonymous: Uint8Array[] = []

  for (const wrapper of existingWrappers) {
    const inner = readFieldBytes(wrapper, 1)
    const id = inner ? getId(inner) : undefined
    if (typeof id !== 'number') {
      anonymous.push(wrapper)
      continue
    }
    indexById.set(id, ordered.length)
    ordered.push(wrapper)
  }

  for (const inner of incomingInnerMessages) {
    const id = getId(inner)
    if (typeof id !== 'number') continue
    const existingIndex = indexById.get(id)
    if (existingIndex === undefined) {
      const wrapper = encodeMessageField(1, inner)
      indexById.set(id, ordered.length)
      ordered.push(wrapper)
    } else if (overwriteExisting) {
      // Replace the GIL-side definition in place: composite implementations must
      // be updatable across builds (same id, new internals). Callers pass only
      // non-signal accessories (filtered via isSignalDefinitionAccessory), so
      // game-managed signal registrations are never touched here.
      ordered[existingIndex] = encodeMessageField(1, inner)
    }
  }

  return [...ordered, ...anonymous]
}

export function createInjector(options?: { protoPath?: string; lang?: string }): Injector {
  const proto = loadGiaProto(options?.protoPath)
  const compositeDefMessage = proto.root.lookupType('CompositeDef')

  function injectBytes(input: InjectGilInput): InjectGilResult {
    const { t } = initCliI18n(detectLang(input.lang ?? options?.lang))
    const giaPayload = input.giaBytes.slice(20, -4)
    const giaRoot = proto.rootMessage.decode(giaPayload) as {
      graph?: { graph?: { inner?: { graph?: Record<string, unknown> } } }
      accessories?: Array<{
        compositeDef?: { inner?: { def?: Record<string, unknown> } }
        graph?: { inner?: { graph?: Record<string, unknown> } }
      }>
    }
    const newGraph = loadGiaGraph(
      input.giaBytes,
      proto.rootMessage,
      proto.nodeGraphMessage,
      input.targetId
    )
    const isSignalDefinitionAccessory = (unit: NonNullable<typeof giaRoot.accessories>[number]) => {
      const def = unit.compositeDef?.inner?.def as
        | { name?: unknown; type?: { kind?: unknown } }
        | undefined
      return (
        (def?.name === '发送信号' ||
          def?.name === '监听信号' ||
          def?.name === '向服务器节点图发送信号') &&
        typeof def.type?.kind === 'number' &&
        def.type.kind >= 1001
      )
    }
    const sourceSignalKindsById = new Map<number, SignalNodeKind>()
    for (const unit of giaRoot.accessories ?? []) {
      const def = unit.compositeDef?.inner?.def as
        | { name?: unknown; id?: { genericId?: { id?: unknown } } }
        | undefined
      const id = toFiniteNumber(def?.id?.genericId?.id)
      const kind =
        def?.name === '发送信号'
          ? 'send'
          : def?.name === '监听信号'
            ? 'monitor'
            : def?.name === '向服务器节点图发送信号'
              ? 'sendServer'
              : undefined
      if (id !== undefined && kind) sourceSignalKindsById.set(id, kind)
    }
    const incomingCompositeDefBytes = (giaRoot.accessories ?? [])
      .filter((unit) => !isSignalDefinitionAccessory(unit))
      .map((unit) => unit.compositeDef?.inner?.def)
      .filter((def): def is Record<string, unknown> => !!def)
      .map((def) => compositeDefMessage.encode(def as never).finish())
    const incomingImplGraphBytes = (giaRoot.accessories ?? [])
      .filter((unit) => !isSignalDefinitionAccessory(unit))
      .map((unit) => unit.graph?.inner?.graph)
      .filter((graph): graph is Record<string, unknown> => !!graph)
      .map((graph) => proto.nodeGraphMessage.encode(graph as never).finish())
    const inferredId = getGraphId(newGraph)
    const targetId = input.targetId ?? inferredId
    if (typeof targetId !== 'number' || !Number.isFinite(targetId)) {
      throw new Error('[error] target id is required (missing in both options and GIA)')
    }

    const header = {
      leftSize: readUint32BE(input.gilBytes, 0),
      schema: readUint32BE(input.gilBytes, 4),
      headTag: readUint32BE(input.gilBytes, 8),
      fileType: readUint32BE(input.gilBytes, 12),
      protoSize: readUint32BE(input.gilBytes, 16),
      tailTag: readUint32BE(input.gilBytes, input.gilBytes.length - 4)
    }

    if (header.headTag !== 0x0326 || header.tailTag !== 0x0679) {
      throw new Error('[error] invalid gil header tags')
    }

    const payload = input.gilBytes.slice(20, -4)
    const fields: LenField[] = []
    const nodeGraphBlobFields: LenField[] = []
    parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, { nodeGraphBlobFields })
    patchSignalNodeIds(newGraph, input.gilBytes, { payload, fields }, t, sourceSignalKindsById)
    const matches = findNodeGraphTargets(
      payload,
      nodeGraphBlobFields.length ? nodeGraphBlobFields : fields,
      proto.nodeGraphMessage,
      targetId
    )

    if (matches.length === 1) {
      const target = matches[0]
      if (
        targetId >= 1000000000 &&
        !(
          target.field.depth >= 3 &&
          target.field.p0 === 10 &&
          target.field.p1 === 1 &&
          target.field.p2 === 1
        )
      ) {
        throw new Error('[error] target NodeGraph path is unexpected')
      }

      const existingType = extractGraphType(target.obj)
      let graphType = existingType
      if (graphType === undefined) {
        const folderIndexesBefore = collectFolderIndexes(payload, fields)
        const idToTypeBefore = buildGraphTypeMap(
          payload,
          nodeGraphBlobFields.length ? nodeGraphBlobFields : fields,
          proto.nodeGraphMessage
        )
        const entryFieldBefore = findFolderEntryField(payload, fields, targetId)
        if (!entryFieldBefore) {
          throw new Error('[error] target id not found in folder index')
        }
        graphType = resolveGraphTypeForTypeValue(
          entryFieldBefore.entry.typeValue,
          folderIndexesBefore,
          idToTypeBefore
        )
      }
      const incomingType = extractGraphType(newGraph)
      const hasClientGraphType = isClientGraphType(graphType) || isClientGraphType(incomingType)
      if (hasClientGraphType && incomingType !== graphType) {
        throw new Error(
          t('injector_clientTypeMismatch', {
            id: targetId,
            current: incomingType ?? t('graphType_unknown'),
            expected: graphType
          })
        )
      }
      if (!hasClientGraphType && incomingType !== undefined && incomingType !== graphType) {
        console.warn(
          t('injector_incomingTypeMismatch', {
            id: targetId,
            current: fmtGraphType(incomingType, t),
            expected: fmtGraphType(graphType, t)
          })
        )
      }

      if (!input.skipNonEmptyCheck && !isNodeGraphEmptyForInjection(target.obj)) {
        const targetName = (target.obj as { name?: unknown }).name
        if (typeof targetName !== 'string' || !targetName.startsWith('_GSTS')) {
          throw new Error(
            `[error] target NodeGraph not empty and name not _GSTS*: ${String(targetName)}`
          )
        }
      }

      const name = (newGraph as { name?: unknown }).name
      if (typeof name === 'string' && name.length) {
        ;(target.obj as { name?: string }).name = name
      }
      setGraphId(newGraph, targetId)
      setGraphType(newGraph, graphType)

      const verified = proto.nodeGraphMessage.verify(newGraph as unknown as Record<string, unknown>)
      if (verified) {
        throw new Error(`[error] updated NodeGraph invalid: ${verified}`)
      }

      // 性能：newGraph 多数情况下已经是 protobufjs Message（来自 decode），直接 encode 避免 fromObject 的大开销
      const newGraphBytes = proto.nodeGraphMessage.encode(newGraph as never).finish()
      const top10Field = findTopLevelMessageField(fields, 10)
      if (!top10Field) {
        throw new Error('[error] composite container not found in gil payload')
      }

      const top10Bytes = payload.subarray(top10Field.dataStart, top10Field.dataEnd)
      const existingGraphWrappers = readFieldMessages(top10Bytes, 1)
      let replacedTargetGraph = false
      const nextGraphWrappers = existingGraphWrappers.map((wrapper) => {
        const inner = readFieldBytes(wrapper, 1)
        if (!inner) return wrapper
        const graph = proto.nodeGraphMessage.decode(inner) as { id?: { id?: unknown } }
        if (toFiniteNumber(graph.id?.id) !== targetId) return wrapper
        replacedTargetGraph = true
        return encodeMessageField(1, newGraphBytes)
      })
      if (!replacedTargetGraph) {
        throw new Error('[error] target NodeGraph wrapper not found in composite container')
      }

      const nextCompositeDefWrappers = mergeWrappedFieldMessages(
        readFieldMessages(top10Bytes, 2),
        incomingCompositeDefBytes,
        (bytes) => {
          const def = compositeDefMessage.decode(bytes) as {
            id?: { genericId?: { id?: unknown }; concreteId?: { id?: unknown } }
          }
          return toFiniteNumber(def.id?.genericId?.id) ?? toFiniteNumber(def.id?.concreteId?.id)
        },
        // incoming 已过滤信号定义 accessories，普通复合实现需支持同 id 覆盖
        true
      )
      const nextImplGraphWrappers = mergeWrappedFieldMessages(
        readFieldMessages(top10Bytes, 4),
        incomingImplGraphBytes,
        (bytes) => {
          const graph = proto.nodeGraphMessage.decode(bytes) as { id?: { id?: unknown } }
          return toFiniteNumber(graph.id?.id)
        },
        true
      )

      const rebuiltTop10Parts: Uint8Array[] = []
      for (const wrapper of nextGraphWrappers)
        rebuiltTop10Parts.push(encodeMessageField(1, wrapper))
      for (const wrapper of nextCompositeDefWrappers)
        rebuiltTop10Parts.push(encodeMessageField(2, wrapper))
      for (const msg of readFieldMessages(top10Bytes, 3))
        rebuiltTop10Parts.push(encodeMessageField(3, msg))
      for (const wrapper of nextImplGraphWrappers)
        rebuiltTop10Parts.push(encodeMessageField(4, wrapper))
      for (const msg of readFieldMessages(top10Bytes, 5))
        rebuiltTop10Parts.push(encodeMessageField(5, msg))
      const rebuiltTop10Bytes = Buffer.concat(rebuiltTop10Parts.map((part) => Buffer.from(part)))

      const newPayload = applyReplacement(payload, fields, top10Field, rebuiltTop10Bytes)
      const newFile = buildFile(newPayload, {
        schema: header.schema,
        headTag: header.headTag,
        fileType: header.fileType,
        tailTag: header.tailTag
      })

      return { bytes: newFile, mode: 'replace' }
    }

    if (matches.length > 1) {
      throw new Error('[error] multiple NodeGraph targets found; aborting to avoid corruption')
    }

    const folderEntry = findFolderEntryField(payload, fields, targetId)
    if (!folderEntry) throw new Error(`[error] target NodeGraph not found: ${targetId}`)
    const top10Field = findTopLevelMessageField(fields, 10)
    if (!top10Field) throw new Error('[error] composite container not found in gil payload')
    const incomingType = extractGraphType(newGraph)
    const graphType =
      targetId === 1073741825 && folderEntry.entry.typeValue === 7000 && incomingType === 20000
        ? 20000
        : resolveGraphTypeForTypeValue(
            folderEntry.entry.typeValue,
            collectFolderIndexes(payload, fields),
            buildGraphTypeMap(
              payload,
              nodeGraphBlobFields.length ? nodeGraphBlobFields : fields,
              proto.nodeGraphMessage
            )
          )
    if (
      graphType === undefined ||
      isClientGraphType(graphType) ||
      isClientGraphType(incomingType)
    ) {
      throw new Error(`[error] target NodeGraph not found: ${targetId}`)
    }
    setGraphId(newGraph, targetId)
    setGraphType(newGraph, graphType)
    const verified = proto.nodeGraphMessage.verify(newGraph as unknown as Record<string, unknown>)
    if (verified) throw new Error(`[error] updated NodeGraph invalid: ${verified}`)

    const top10Bytes = payload.subarray(top10Field.dataStart, top10Field.dataEnd)
    const newGraphWrapper = encodeMessageField(
      1,
      proto.nodeGraphMessage.encode(newGraph as never).finish()
    )
    const rebuiltTop10Bytes = Buffer.concat([
      ...readFieldMessages(top10Bytes, 1).map((wrapper) =>
        Buffer.from(encodeMessageField(1, wrapper))
      ),
      Buffer.from(encodeMessageField(1, newGraphWrapper)),
      ...[2, 3, 4, 5].flatMap((field) =>
        readFieldMessages(top10Bytes, field).map((message) =>
          Buffer.from(encodeMessageField(field, message))
        )
      )
    ])
    const newPayload = applyReplacement(payload, fields, top10Field, rebuiltTop10Bytes)
    return {
      bytes: buildFile(newPayload, {
        schema: header.schema,
        headTag: header.headTag,
        fileType: header.fileType,
        tailTag: header.tailTag
      }),
      mode: 'replace'
    }
  }

  function injectFile(options: InjectGilFileOptions): InjectGilFileResult {
    const gilBytes = new Uint8Array(fs.readFileSync(options.gilPath))
    const giaBytes = new Uint8Array(fs.readFileSync(options.giaPath))
    const result = injectBytes({
      gilBytes,
      giaBytes,
      targetId: options.targetId,
      skipNonEmptyCheck: options.skipNonEmptyCheck,
      lang: options.lang
    })
    const outPath = options.outPath ?? options.gilPath
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    // 性能：result.bytes 可能已经是 Buffer（Buffer 也是 Uint8Array），直接写避免二次拷贝
    fs.writeFileSync(outPath, result.bytes)
    return { ...result, outPath }
  }

  return { injectBytes, injectFile }
}

export function injectGilBytes(
  input: InjectGilInput,
  options?: { protoPath?: string }
): InjectGilResult {
  return createInjector(options).injectBytes(input)
}

export function injectGilFile(options: InjectGilFileOptions): InjectGilFileResult {
  return createInjector({ protoPath: options.protoPath }).injectFile(options)
}
