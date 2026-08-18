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
  /** 控件分类：template / textbox / interactive-button / custom-button / floating-page / close-button / container / control 等 */
  category: string
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

function classifyUiControl(name: string, isTemplate: boolean): string {
  if (isTemplate) return name ? 'template' : 'container'
  if (name.includes('文本框')) return 'textbox'
  if (name.includes('交互按钮')) return 'interactive-button'
  if (name.includes('自定义按钮')) return 'custom-button'
  if (name.includes('自定义开关')) return 'custom-switch'
  if (name.includes('悬浮交互页')) return 'floating-page'
  if (name.includes('交互页关闭按钮')) return 'close-button'
  if (name.includes('小地图')) return 'minimap'
  if (name.includes('技能区')) return 'skill-area'
  if (name.includes('队伍信息')) return 'team-info'
  if (name === '') return 'container'
  return 'control'
}

export function listUiControls(bytes: Uint8Array): UiControlInfo[] {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const templateIds = new Set(root9Field501Ids(top))
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
    result.push({ id, name, layoutId, category: classifyUiControl(name, templateIds.has(id)) })
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

function root9Field501Ids(top: readonly WireField[]): number[] {
  const root9 = top.find((field) => field.number === 9 && field.wire === 2)
  if (!root9) return []
  const section = parseMessageFields(root9.value as Uint8Array)
  const f501 = section?.find((field) => field.number === 501 && field.wire === 2)
  if (!f501) return []
  return parsePackedVarints(f501.value as Uint8Array)
}

export function listTemplates(bytes: Uint8Array): UiControlInfo[] {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const templateIds = new Set(root9Field501Ids(top))
  return root9Records(top)
    .map((field) => {
      const rec = field.value as Uint8Array
      const id = recordIdOf(rec)
      if (id === undefined || !templateIds.has(id)) return undefined
      const fields = parseMessageFields(rec)
      const name =
        fields
          ?.filter((f) => f.number === 505 && f.wire === 2)
          .map((f) => {
            const sub = parseMessageFields(f.value as Uint8Array)
            const nameField = sub?.find((x) => x.number === 12 && x.wire === 2)
            const nameMsg = nameField ? parseMessageFields(nameField.value as Uint8Array) : undefined
            const textField = nameMsg?.find((x) => x.number === 501 && x.wire === 2)
            return textField ? textOf(textField.value as Uint8Array) : ''
          })
          .find((s) => s.length > 0) ?? ''
      return { id, name, layoutId: firstVarint(fields, 504) ?? 0, category: 'template' }
    })
    .filter((x): x is UiControlInfo => x !== undefined && x.name !== '')
}

export function cloneTemplate(
  bytes: Uint8Array,
  sourceId: number,
  options: UiCloneOptions,
  donorBytes?: Uint8Array
): { bytes: Uint8Array; id: number } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const donorTop = donorBytes ? parseMessageFields(donorBytes.slice(20, -4)) : top
  if (!donorTop) throw new Error('[error] malformed donor GIL payload')
  const source = findRecord(donorTop, sourceId)
  if (!source) throw new Error(`[error] source template not found: ${sourceId}`)
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
  // prepend to field501 packed template list
  const f501 = section.find((field) => field.number === 501 && field.wire === 2)
  if (!f501) throw new Error('[error] template list (root9 field 501) not found')
  const ids = parsePackedVarints(f501.value as Uint8Array)
  if (!ids.includes(options.id)) ids.unshift(options.id)
  f501.value = encodePackedVarints(ids)
  root9.value = emitWireMessage(section)
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

// 内置 UI 控件模板（真实编辑器样本，2026-08-17/18 提取自 1073741893）
const BUILTIN_TEXTBOX_TEMPLATE =
  'a81f9380808004b21f0f5a07a81f9380808004a81f01b01f05c01f8180808004ca1f14620caa1f09e69687e69cace6a186a81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a10011808209380808004ca1fa7035a056200a81f02a81f01b01f0cba1f96036afd0262f702aa1f57b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000c842b51f00002042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f01b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000c842b51f00002042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f02b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000c842b51f00002042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f03b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000c842b51f00002042d21f0cad1f0000003fb51f0000003fe21f00b01f03c01f01a81f02a81f04b01f0cb81f01c21f0a10011808209380808004ca1f509a0100a81f09b01f19ba1f449a012bb01f14ca1f09aa1f06e4bda0e5a5bdd81f0cf01fffffffff0ff81fffffff078020e6f10f9820b3e6cc9903a81f0ab01f19b81f01c21f0a10011808209380808004'
const BUILTIN_INTERACTIVE_BUTTON_TEMPLATE =
  'a81f9480808004b21f0f5a07a81f9480808004a81f01b01f05c01f8180808004ca1f17620faa1f0ce4baa4e4ba92e68c89e992aea81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a10011808209480808004ca1fa7035a056200a81f02a81f01b01f0cba1f96036afd0262f702aa1f57b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f00008042b51f00008042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f01b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000c842b51f0000c842d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f02b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f00008042b51f00008042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f03b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f00008042b51f00008042d21f0cad1f0000003fb51f0000003fe21f00b01f01c01f01a81f02a81f04b01f0cb81f01c21f0a10011808209480808004ca1f598a0100a81f07b01f16ba1f4d820134a81f01b01f01b81f02c01f914eea1f0ca81fffffffffffffffffff01f81f0182200ca81fffffffffffffffffff0188201b902001a81f07b01f16b81f01c21f0a10011808209480808004'
const BUILTIN_CUSTOM_BUTTON_TEMPLATE =
  'a81f9580808004b21f0f5a07a81f9580808004a81f01b01f05c01f8180808004ca1f1a6212aa1f0fe887aae5ae9ae4b989e68c89e992aea81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a10011808209580808004ca1fd7035a056200a81f02a81f01b01f0cba1fc6036aad0362a703aa1f63b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1f01002f44b51f0000d4c3ca1f0cad1f04008c43b51f00005042d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f01b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1f01002f44b51f0000d4c3ca1f0cad1f04008c43b51f00005042d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f02b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1f01002f44b51f0000d4c3ca1f0cad1f04008c43b51f00005042d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f03b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1f01002f44b51f0000d4c3ca1f0cad1f04008c43b51f00005042d21f0cad1f0000003fb51f0000003fe21f00b01f0cc01f01a81f02a81f04b01f0cb81f01c21f0a10011808209580808004ca1f5ae20200a81f23b01f34ba1f4ee20235a81f1fb01f01b81fc88d03c01f02da1f0ca81fffffffffffffffffff01e21f06b51f0000d0c1ea1f06b51f0000d0c1f01f3cf81f01a81f24b01f34b81f01c21f0a10011808209580808004ca1f31ea0200a81f25b01f36ba1f25ea020ca81f01b01f01c21f00ca1f00a81f26b01f36b81f01c21f0a10011808209580808004ca1f9302da0200a81f21b01f32ba1f8602da02ec01b21f38aa1f12a81f01b01f899506b81fffffffff0fc01f01b21f1ba81f01b01f14ca1f0faa1f0ce69687e69cace58685e5aeb9d01f01b81fe1a712ba1fa801aa1f27aa1f00b21f00ba1f0cad1f0000c842b51f0000c842c21f0cad1f0000803fb51f0000803fca1f00b21f27aa1f00b21f00ba1f0cad1f0000c842b51f0000c842c21f0cad1f0000803fb51f0000803fca1f00ba1f27aa1f00b21f00ba1f0cad1f0000c842b51f0000c842c21f0cad1f0000803fb51f0000803fca1f00c21f27aa1f00b21f00ba1f0cad1f0000c842b51f0000c842c21f0cad1f0000803fb51f0000803fca1f00c01fe6f10fa81f22b01f32b81f01c21f0a10011808209580808004'
const BUILTIN_LAYOUT_TEMPLATE =
  'a81f8180808004b21f247a00a81f05b01f07ba1f198a0100a81f08b01f07b81f01c21f0a10011808208180808004b21f0f5a07a81f8180808004a81f01b01f05ba1f55828080800483808080048480808004858080800486808080048780808004888080800489808080048a808080048b808080048c808080048d808080048e808080048f80808004938080800494808080049580808004ca1f17620faa1f0ce9bb98e8aea4e5b883e5b180a81f02b01f0fca1f2d5a055a00a81f01a81f01b01f0bba1f1d6a055a00a81f01a81f04b01f0bb81f01c21f0a10011808208180808004'

export type UiCreateType = 'textbox' | 'interactive-button' | 'custom-button'

export type UiCreateOptions = UiCloneOptions & {
  type: UiCreateType
}

function builtinTemplate(type: UiCreateType): Uint8Array {
  if (type === 'textbox') return Buffer.from(BUILTIN_TEXTBOX_TEMPLATE, 'hex')
  if (type === 'interactive-button') return Buffer.from(BUILTIN_INTERACTIVE_BUTTON_TEMPLATE, 'hex')
  return Buffer.from(BUILTIN_CUSTOM_BUTTON_TEMPLATE, 'hex')
}

function bootstrapRoot9WithLayout(top: WireField[], controlId: number): WireField[] {
  const layoutTemplate = Buffer.from(BUILTIN_LAYOUT_TEMPLATE, 'hex')
  const layoutFields = parseMessageFields(layoutTemplate)
  if (!layoutFields) throw new Error('[error] invalid layout template')
  const f503 = layoutFields.find((f) => f.number === 503 && f.wire === 2)
  if (!f503) throw new Error('[error] layout template missing 503')
  f503.value = encodePackedVarints([controlId])
  const layout = emitWireMessage(layoutFields)
  const section = emitWireMessage([
    { number: 501, wire: 2, value: encodePackedVarints([1073741825]) },
    { number: 502, wire: 2, value: layout }
  ])
  top.push({ number: 9, wire: 2, value: section })
  return top
}

export function createUiControl(
  bytes: Uint8Array,
  options: UiCreateOptions
): { bytes: Uint8Array; id: number } {
  const top = parseMessageFields(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  let record = builtinTemplate(options.type)
  record = setUiControlId(record, options.id)
  if (options.name !== undefined) record = setUiName(record, options.name)
  if (options.content !== undefined) record = setUiContent(record, options.content)
  if (options.position !== undefined || options.size !== undefined) {
    record = setUiTransform(record, { position: options.position, size: options.size })
  }
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) {
    bootstrapRoot9WithLayout(top, options.id)
  }
  const root9Field = top.find((f) => f.number === 9 && f.wire === 2)!
  const section = parseMessageFields(root9Field.value as Uint8Array)!
  section.push({ number: 502, wire: 2, value: record })
  root9Field.value = emitWireMessage(section)
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
