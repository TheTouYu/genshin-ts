import { buildFile, encodeVarint, readUint32BE, readVarint } from '../injector/binary.js'
import {
  emitWireMessage,
  parseWireMessage,
  type WireField
} from './static_assembly/wire.js'

export type UiControlInfo = {
  id: number
  name: string
  layoutId: number
}

export type UiTransform = {
  position?: readonly [number, number]
  size?: readonly [number, number]
}

export type UiUpdateOptions = UiTransform & {
  name?: string
  content?: string
}

export type UiCloneOptions = UiUpdateOptions & {
  id: number
}

const TEXT = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function parseMessageFields(data: Uint8Array): WireField[] | undefined {
  return parseWireMessage(data)
}

function firstVarint(fields: readonly WireField[] | undefined, number: number): number | undefined {
  const field = fields?.find((item) => item.number === number && item.wire === 0)
  return typeof field?.value === 'number' ? field.value : undefined
}

function textOf(value: Uint8Array): string {
  try {
    return TEXT_DECODER.decode(value)
  } catch {
    return ''
  }
}

function utf8(value: string): Uint8Array {
  return TEXT.encode(value)
}

function parsePackedVarints(data: Uint8Array): number[] {
  const result: number[] = []
  let offset = 0
  while (offset < data.length) {
    const item = readVarint(data, offset)
    if (!item) break
    result.push(item.value >>> 0)
    offset = item.next
  }
  return result
}

function encodePackedVarints(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values.flatMap((value) => Array.from(encodeVarint(value))))
}

function recordIdOf(record: Uint8Array): number | undefined {
  return firstVarint(parseMessageFields(record), 501)
}

function root9Records(top: readonly WireField[]): WireField[] {
  const root9 = top.find((field) => field.number === 9 && field.wire === 2)
  if (!root9) return []
  const section = parseMessageFields(root9.value as Uint8Array)
  return (section ?? []).filter((field) => field.number === 502 && field.wire === 2)
}

function findRecord(top: readonly WireField[], id: number): WireField | undefined {
  return root9Records(top).find((field) => recordIdOf(field.value as Uint8Array) === id)
}

function setUiControlId(record: Uint8Array, newId: number): Uint8Array {
  const fields = parseMessageFields(record)
  if (!fields) throw new Error('[error] invalid UI control record')
  return emitWireMessage(
    fields.map((field) =>
      field.number === 501 && field.wire === 0 ? { ...field, value: newId } : field
    )
  )
}

function setUiName(record: Uint8Array, name: string): Uint8Array {
  const fields = parseMessageFields(record)
  if (!fields) throw new Error('[error] invalid UI control record')
  return emitWireMessage(
    fields.map((field) => {
      if (field.number !== 505 || field.wire !== 2) return field
      const sub = parseMessageFields(field.value as Uint8Array)
      if (!sub) return field
      // 505[0] contains the control name string (field 12 -> 501)
      const nameField = sub.find((child) => child.number === 12 && child.wire === 2)
      if (!nameField) return field
      const nameMsg = parseMessageFields(nameField.value as Uint8Array)
      if (!nameMsg) return field
      const textField = nameMsg.find((child) => child.number === 501 && child.wire === 2)
      if (!textField) return field
      nameField.value = emitWireMessage(
        nameMsg.map((child) =>
          child === textField ? { ...child, value: utf8(name) } : child
        )
      )
      return { ...field, value: emitWireMessage(sub) }
    })
  )
}

function setUiContent(record: Uint8Array, content: string): Uint8Array {
  // 文本框内容路径：9.502.505[n].503.19.505.501
  // 按钮内容路径：9.502.505[n].503.43.502.502.505.501
  // 遍历所有 505 子记录，按上述两条路径替换第一个命中的文本。
  const fields = parseMessageFields(record)
  if (!fields) throw new Error('[error] invalid UI control record')
  let changed = false
  const out = fields.map((field) => {
    if (field.number !== 505 || field.wire !== 2 || changed) return field
    const sub = parseMessageFields(field.value as Uint8Array)
    if (!sub) return field
    const f503 = sub.find((child) => child.number === 503 && child.wire === 2)
    if (!f503) return field
    const f503msg = parseMessageFields(f503.value as Uint8Array)
    if (!f503msg) return field
    // 文本框路径
    const f19 = f503msg.find((child) => child.number === 19 && child.wire === 2)
    if (f19) {
      const f19msg = parseMessageFields(f19.value as Uint8Array)
      const f505 = f19msg?.find((child) => child.number === 505 && child.wire === 2)
      const f505msg = f505 ? parseMessageFields(f505.value as Uint8Array) : undefined
      const textField = f505msg?.find((child) => child.number === 501 && child.wire === 2)
      if (textField) {
        f505!.value = emitWireMessage(
          f505msg!.map((child) => (child === textField ? { ...child, value: utf8(content) } : child))
        )
        f19.value = emitWireMessage(f19msg!)
        f503.value = emitWireMessage(f503msg)
        changed = true
        return { ...field, value: emitWireMessage(sub) }
      }
    }
    // 按钮路径
    const f43 = f503msg.find((child) => child.number === 43 && child.wire === 2)
    if (f43) {
      const f43msg = parseMessageFields(f43.value as Uint8Array)
      const f502a = f43msg?.find((child) => child.number === 502 && child.wire === 2)
      const f502amsg = f502a ? parseMessageFields(f502a.value as Uint8Array) : undefined
      const f502b = f502amsg?.find((child) => child.number === 502 && child.wire === 2)
      const f502bmsg = f502b ? parseMessageFields(f502b.value as Uint8Array) : undefined
      const f505 = f502bmsg?.find((child) => child.number === 505 && child.wire === 2)
      const f505msg = f505 ? parseMessageFields(f505.value as Uint8Array) : undefined
      const textField = f505msg?.find((child) => child.number === 501 && child.wire === 2)
      if (textField) {
        f505!.value = emitWireMessage(
          f505msg!.map((child) => (child === textField ? { ...child, value: utf8(content) } : child))
        )
        f502b!.value = emitWireMessage(f502bmsg!)
        f502a!.value = emitWireMessage(f502amsg!)
        f43.value = emitWireMessage(f43msg!)
        f503.value = emitWireMessage(f503msg)
        changed = true
        return { ...field, value: emitWireMessage(sub) }
      }
    }
    return field
  })
  if (!changed) throw new Error('[error] UI control content path not found')
  return emitWireMessage(out)
}

function setUiTransform(record: Uint8Array, transform: UiTransform): Uint8Array {
  if (transform.position === undefined && transform.size === undefined) return record
  const fields = parseMessageFields(record)
  if (!fields) throw new Error('[error] invalid UI control record')
  const out = fields.map((field) => {
    if (field.number !== 505 || field.wire !== 2) return field
    const sub = parseMessageFields(field.value as Uint8Array)
    if (!sub) return field
    const f503 = sub.find((child) => child.number === 503 && child.wire === 2)
    if (!f503) return field
    const f503msg = parseMessageFields(f503.value as Uint8Array)
    if (!f503msg) return field
    const f13 = f503msg.find((child) => child.number === 13 && child.wire === 2)
    if (!f13) return field
    const f13msg = parseMessageFields(f13.value as Uint8Array)
    if (!f13msg) return field
    const f12 = f13msg.find((child) => child.number === 12 && child.wire === 2)
    if (!f12) return field
    const f12msg = parseMessageFields(f12.value as Uint8Array)
    if (!f12msg) return field
    const f501s = f12msg.filter((child) => child.number === 501 && child.wire === 2)
    if (!f501s.length) return field
    f12.value = emitWireMessage(
      f12msg.map((child) => {
        if (child.number !== 501 || child.wire !== 2) return child
        const entry = parseMessageFields(child.value as Uint8Array)
        if (!entry) return child
        const f502 = entry.find((x) => x.number === 502 && x.wire === 2)
        if (!f502) return child
        const f502msg = parseMessageFields(f502.value as Uint8Array)
        if (!f502msg) return child
        f502.value = emitWireMessage(
          f502msg.map((x) => {
            if (transform.position !== undefined && x.number === 504 && x.wire === 2) {
              // UI 位置在 wire 里是屏幕中心相对偏移；CLI 参数按编辑器绝对坐标（1600×900 设计分辨率）。
              x.value = emitVector2([
                transform.position[0] - 800,
                transform.position[1] - 450
              ])
            }
            if (transform.size !== undefined && x.number === 505 && x.wire === 2) {
              x.value = emitVector2(transform.size)
            }
            return x
          })
        )
        return { ...child, value: emitWireMessage(entry) }
      })
    )
    f13.value = emitWireMessage(f13msg)
    f503.value = emitWireMessage(f503msg)
    return { ...field, value: emitWireMessage(sub) }
  })
  return emitWireMessage(out)
}

function emitVector2(value: readonly [number, number]): Uint8Array {
  const f32 = (v: number): Uint8Array => {
    const buf = Buffer.alloc(4)
    buf.writeFloatLE(v)
    return buf
  }
  return emitWireMessage([
    { number: 501, wire: 5, value: f32(value[0]) },
    { number: 502, wire: 5, value: f32(value[1]) }
  ])
}

function appendLayoutControlId(top: readonly WireField[], controlId: number): void {
  const root9 = top.find((field) => field.number === 9 && field.wire === 2)
  if (!root9) throw new Error('[error] root 9 not found')
  const section = parseMessageFields(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  const index = section.findIndex(
    (field) =>
      field.number === 502 &&
      field.wire === 2 &&
      Buffer.from(field.value as Uint8Array).includes(Buffer.from('默认布局', 'utf8'))
  )
  if (index < 0) throw new Error('[error] default layout record not found')
  const layoutField = section[index]
  const layoutFields = parseMessageFields(layoutField.value as Uint8Array)
  if (!layoutFields) throw new Error('[error] invalid layout record')
  const f503 = layoutFields.find((field) => field.number === 503 && field.wire === 2)
  if (!f503) throw new Error('[error] layout control ID list not found')
  const ids = parsePackedVarints(f503.value as Uint8Array)
  if (!ids.includes(controlId)) ids.push(controlId)
  f503.value = encodePackedVarints(ids)
  layoutField.value = emitWireMessage(layoutFields)
  section[index] = layoutField
  root9.value = emitWireMessage(section)
}

export function listUiControls(bytes: Uint8Array): UiControlInfo[] {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const result: UiControlInfo[] = []
  for (const record of root9Records(top)) {
    const rec = record.value as Uint8Array
    const id = recordIdOf(rec)
    if (id === undefined) continue
    const fields = parseMessageFields(rec)
    const name = fields
      ?.filter((f) => f.number === 505 && f.wire === 2)
      .map((f) => {
        const sub = parseMessageFields(f.value as Uint8Array)
        const nameField = sub?.find((x) => x.number === 12 && x.wire === 2)
        const nameMsg = nameField ? parseMessageFields(nameField.value as Uint8Array) : undefined
        const textField = nameMsg?.find((x) => x.number === 501 && x.wire === 2)
        return textField ? textOf(textField.value as Uint8Array) : ''
      })
      .find((s) => s.length > 0) ?? ''
    const layoutId = firstVarint(fields, 504) ?? 0
    result.push({ id, name, layoutId })
  }
  return result
}

export function cloneUiControl(
  bytes: Uint8Array,
  sourceId: number,
  options: UiCloneOptions,
  donorBytes?: Uint8Array
): { bytes: Uint8Array; id: number } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const donorTop = donorBytes
    ? parseMessageFields(donorBytes.slice(20, -4))
    : top
  if (!donorTop) throw new Error('[error] malformed donor GIL payload')
  const source = findRecord(donorTop, sourceId)
  if (!source) throw new Error(`[error] source UI control not found: ${sourceId}`)
  let record = source.value as Uint8Array
  record = setUiControlId(record, options.id)
  if (options.name !== undefined) record = setUiName(record, options.name)
  if (options.content !== undefined) record = setUiContent(record, options.content)
  if (options.position !== undefined || options.size !== undefined) {
    record = setUiTransform(record, { position: options.position, size: options.size })
  }
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)!
  const section = parseMessageFields(root9.value as Uint8Array)!
  section.push({ number: 502, wire: 2, value: record })
  root9.value = emitWireMessage(section)
  appendLayoutControlId(top, options.id)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    id: options.id
  }
}

export function updateUiControl(
  bytes: Uint8Array,
  id: number,
  options: UiUpdateOptions
): { bytes: Uint8Array; changed: string[] } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const target = findRecord(top, id)
  if (!target) throw new Error(`[error] UI control not found: ${id}`)
  let record = target.value as Uint8Array
  const changed: string[] = []
  if (options.name !== undefined) {
    record = setUiName(record, options.name)
    changed.push('name')
  }
  if (options.content !== undefined) {
    record = setUiContent(record, options.content)
    changed.push('content')
  }
  if (options.position !== undefined || options.size !== undefined) {
    record = setUiTransform(record, { position: options.position, size: options.size })
    changed.push('transform')
  }
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)!
  const section = parseMessageFields(root9.value as Uint8Array)!
  const index = section.findIndex(
    (field) =>
      field.number === 502 &&
      field.wire === 2 &&
      Buffer.from(field.value as Uint8Array).equals(Buffer.from(target.value as Uint8Array))
  )
  if (index < 0) throw new Error(`[error] UI control record not found: ${id}`)
  section[index] = { ...section[index], value: record }
  root9.value = emitWireMessage(section)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4)
    }),
    changed
  }
}
