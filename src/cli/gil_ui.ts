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

// 内置图片控件模板（官方预制「图片」控件，真实编辑器样本，2026-08-22 提取自 1073741954）
// 结构：f501=控件ID + f502[type5]自标识 + f504=布局ID + f505[type15 name=图片]
//       + f505[type23] + f505[type12]载体(transform) + f505[type38]图片源(引用素材)
const BUILTIN_IMAGE_CONTROL_TEMPLATE =
  'a81f8281808004b21f0f5a07a81f8281808004a81f01b01f05c01f8180808004ca1f116209aa1f06e59bbee78987a81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a10011808208281808004ca1fa7035a056200a81f02a81f01b01f0cba1f96036afd0262f702aa1f57b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000a042b51f0000a042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f01b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000a042b51f0000a042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f02b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000a042b51f0000a042d21f0cad1f0000003fb51f0000003fe21f00aa1f5aa81f03b21f54aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f00ca1f0cad1f0000a042b51f0000a042d21f0cad1f0000003fb51f0000003fe21f00b01f09c01f01a81f02a81f04b01f0cb81f01c21f0a10011808208281808004ca1f47fa0100a81f15b01f26ba1f3bfa01221a0ca81fffffffffffffffffff0120ffffffff0f320a1001180820c5808080045200a81f16b01f26b81f01c21f0a10011808208281808004'

/** 图片控件模板里的 ID 常量（提取自真实样本 1073741954） */
const IMAGE_TEMPLATE_SELF_ID = 1073741954
const IMAGE_TEMPLATE_LAYOUT_ID = 1073741825
const IMAGE_TEMPLATE_ASSET_ID = 1073741893

/**
 * 递归替换消息树里所有等于 from 的 varint 值为 to。
 * 用于图片控件模板的 ID 重映射（自身 ID / 布局 ID / 素材 ID 都按值替换）。
 */
function replaceAllVarints(fields: WireField[], from: number, to: number): void {
  for (const f of fields) {
    if (f.wire === 0 && f.value === from) {
      f.value = to
    } else if (f.wire === 2) {
      const sub = parseWireMessage(f.value as Uint8Array)
      if (sub) {
        replaceAllVarints(sub, from, to)
        f.value = emitWireMessage(sub)
      }
    }
  }
}

/** 把控件 ID 追加进指定布局记录（按 ID 定位）的 f503 packed 列表。 */
function appendToLayoutById(top: WireField[], layoutId: number, controlId: number): void {
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root 9 not found')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] invalid root 9 section')
  const layoutField = section.find((f) => {
    if (f.number !== 502 || f.wire !== 2) return false
    const m = parseWireMessage(f.value as Uint8Array)
    return m?.find((x) => x.number === 501 && x.wire === 0)?.value === layoutId
  })
  if (!layoutField) throw new Error(`[error] 布局记录 ${layoutId} 不存在`)
  const layoutFields = parseWireMessage(layoutField.value as Uint8Array)
  if (!layoutFields) throw new Error('[error] invalid layout record')
  const f503 = layoutFields.find((f) => f.number === 503 && f.wire === 2)
  if (!f503) throw new Error('[error] layout control ID list (f503) not found')
  const ids = parsePackedVarints(f503.value as Uint8Array)
  if (!ids.includes(controlId)) ids.push(controlId)
  f503.value = encodePackedVarints(ids)
  layoutField.value = emitWireMessage(layoutFields)
  root9.value = emitWireMessage(section)
}

export type UiImageControlOptions = UiCloneOptions & {
  /** 素材索引 ID（= 素材库容器 ID，0x40000000+ 段） */
  assetId: number
  /** 目标布局 ID（默认 1073741825 默认布局） */
  layoutId?: number
}

/**
 * 创建官方预制「图片控件」，引用指定素材（素材索引 ID = 素材库容器 ID）。
 * 单条记录（f502[type5]），直接注册进目标布局的 f503 packed 列表。
 * 图片源引用素材路径：f505[f502=38].f503.f31.f6.f4 = 素材 ID。
 */
export function createUiImageControl(
  bytes: Uint8Array,
  options: UiImageControlOptions
): { bytes: Uint8Array; id: number } {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')

  const layoutId = options.layoutId ?? IMAGE_TEMPLATE_LAYOUT_ID
  let record = Buffer.from(BUILTIN_IMAGE_CONTROL_TEMPLATE, 'hex')
  const fields = parseWireMessage(record)
  if (!fields) throw new Error('[error] invalid image control template')

  // ID 重映射：自身 ID → 新 ID；布局 ID → 目标布局；素材 ID → 目标素材
  replaceAllVarints(fields, IMAGE_TEMPLATE_SELF_ID, options.id)
  replaceAllVarints(fields, IMAGE_TEMPLATE_LAYOUT_ID, layoutId)
  replaceAllVarints(fields, IMAGE_TEMPLATE_ASSET_ID, options.assetId)
  record = Buffer.from(emitWireMessage(fields))

  // 名字 / 位置 / 尺寸（复用现有 setter）
  if (options.name !== undefined) record = Buffer.from(setUiName(record, options.name))
  if (options.position !== undefined || options.size !== undefined) {
    record = Buffer.from(setUiTransform(record, { position: options.position, size: options.size }))
  }

  // 注册进 root9 + 布局 f503 packed 列表
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 缺失（地图无 UI 段）')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 段解析失败')
  section.push({ number: 502, wire: 2, value: record })
  root9.value = emitWireMessage(section)

  // 追加进目标布局的 f503 packed 列表
  appendToLayoutById(top, layoutId, options.id)

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

// ============ UI 三层资源管理（素材 / 控件模板 / 布局控件）============
// 分类依据：root9 502 记录 f502 子记录的 type 码（真实差分闭合 2026-08-23）
//   布局 type7 | 素材容器 type55 | 素材组 type5+6 | 模板 type4 | 实例 type3 | 官方预制 type5 单条

export type UiRecordKind =
  | 'layout'
  | 'asset'
  | 'asset-group'
  | 'template'
  | 'instance'
  | 'official'
  | 'unknown'

export interface UiRecordInfo {
  id: number
  name: string
  kind: UiRecordKind
  parentId: number | undefined
}

/** 提取记录 f502 子记录里的 type 码集合 */
function f502TypeCodes(m: readonly WireField[]): number[] {
  const types: number[] = []
  for (const x of m) {
    if (x.number !== 502 || x.wire !== 2) continue
    const xm = parseWireMessage(x.value as Uint8Array)
    if (!xm) continue
    const t = xm.find((y) => y.number === 502 && y.wire === 0)?.value
    if (typeof t === 'number') types.push(t)
  }
  return types
}

export function classifyUiRecord(m: readonly WireField[]): UiRecordKind {
  const types = f502TypeCodes(m)
  if (types.includes(7)) return 'layout'
  if (types.includes(55)) return 'asset'
  if (types.includes(3)) return 'instance'
  if (types.includes(4)) return 'template'
  if (types.includes(6)) return 'asset-group'
  if (types.includes(5)) return 'official'
  return 'unknown'
}

/** 提取记录名字（f505 里 12→501 字符串） */
function recordNameOf(m: readonly WireField[]): string {
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    if (!sub) continue
    const t12 = sub.find((x) => x.number === 12 && x.wire === 2)
    if (!t12) continue
    const t12m = parseWireMessage(t12.value as Uint8Array)
    const s = t12m?.find((x) => x.number === 501 && x.wire === 2)
    if (s) return textOf(s.value as Uint8Array)
  }
  return ''
}

/** 列出 root9 全部 502 记录并按三层分类 */
export function listUiRecords(bytes: Uint8Array): UiRecordInfo[] {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const out: UiRecordInfo[] = []
  for (const f of root9Records(top)) {
    const rec = f.value as Uint8Array
    const m = parseWireMessage(rec)
    if (!m) continue
    const id = m.find((x) => x.number === 501 && x.wire === 0)?.value
    if (typeof id !== 'number') continue
    const parentId = m.find((x) => x.number === 504 && x.wire === 0)?.value as number | undefined
    out.push({ id, name: recordNameOf(m), kind: classifyUiRecord(m), parentId })
  }
  return out
}

/** 按 ID 找记录字段（root9 502 field） */
function findRecordField(top: readonly WireField[], id: number): WireField | undefined {
  return root9Records(top).find((f) => recordIdOf(f.value as Uint8Array) === id)
}

/** 从某记录的 f503 packed 列表移除一个 ID（就地改 value） */
function removeFromPackedList(owner: WireField[], listFieldNumber: number, targetId: number): boolean {
  const list = owner.find((x) => x.number === listFieldNumber && x.wire === 2)
  if (!list) return false
  const ids = parsePackedVarints(list.value as Uint8Array)
  const next = ids.filter((id) => id !== targetId)
  if (next.length === ids.length) return false
  list.value = encodePackedVarints(next)
  return true
}

/** 从 root9 section 按 ID 删除一条 502 记录 */
function removeRecordFromSection(section: WireField[], id: number): boolean {
  const before = section.length
  const next = section.filter((f) => {
    if (f.number !== 502 || f.wire !== 2) return true
    return recordIdOf(f.value as Uint8Array) !== id
  })
  section.length = 0
  section.push(...next)
  return next.length < before
}

// ============ 三层删除 ============

/** 读容器记录 502{13/14} 链接的配对 ID（13=分类副本→顶层，14=顶层→分类副本） */
function containerPairLink(m: readonly WireField[], linkNumber: 13 | 14): number | undefined {
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = parseWireMessage(f.value as Uint8Array)
    if (!im) continue
    for (const link of im) {
      if (link.number !== linkNumber || link.wire !== 2) continue
      const lm = parseWireMessage(link.value as Uint8Array)
      if (!lm) continue
      const inner = lm.find((x) => x.number === 501)
      if (inner?.wire === 2) {
        const r = readVarint(inner.value as Uint8Array, 0)
        if (r) return r.value
      } else if (inner?.wire === 0) {
        return inner.value as number
      }
    }
  }
  return undefined
}

/** 读模板记录 f502[type4].f14.f501 的 packed 实例 ID 列表 */
function templateInstanceIds(m: readonly WireField[]): number[] {
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = parseWireMessage(f.value as Uint8Array)
    if (!im) continue
    const t = im.find((x) => x.number === 502 && x.wire === 0)?.value
    if (t !== 4) continue
    const f14 = im.find((x) => x.number === 14 && x.wire === 2)
    if (!f14) continue
    const f14m = parseWireMessage(f14.value as Uint8Array)
    const f501 = f14m?.find((x) => x.number === 501 && x.wire === 2)
    if (!f501) continue
    return decodePackedIds(f501.value as Uint8Array)
  }
  return []
}

/** 解码 packed varint 列表 */
function decodePackedIds(data: Uint8Array): number[] {
  const ids: number[] = []
  let off = 0
  while (off < data.length) {
    const r = readVarint(data, off)
    if (!r) break
    ids.push(r.value)
    off = r.next
  }
  return ids
}

/** 从模板 f502[type4].f14.f501 移除一个实例 ID（就地改） */
function removeTemplateInstanceLink(m: WireField[], instanceId: number): boolean {
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = parseWireMessage(f.value as Uint8Array)
    if (!im) continue
    const t = im.find((x) => x.number === 502 && x.wire === 0)?.value
    if (t !== 4) continue
    const f14 = im.find((x) => x.number === 14 && x.wire === 2)
    if (!f14) continue
    const f14m = parseWireMessage(f14.value as Uint8Array)
    if (!f14m) continue
    const f501 = f14m.find((x) => x.number === 501 && x.wire === 2)
    if (!f501) continue
    const ids = decodePackedIds(f501.value as Uint8Array)
    const next = ids.filter((id) => id !== instanceId)
    if (next.length === ids.length) continue
    f501.value = Buffer.concat(next.map((id) => Buffer.from(encodeVarint(id))))
    f14.value = emitWireMessage(f14m)
    f.value = emitWireMessage(im)
    return true
  }
  return false
}

/** 从 root9 num501 注册表移除容器 ID */
function removeFromNum501(section: WireField[], id: number): boolean {
  const num501 = section.find((f) => f.number === 501 && f.wire === 2)
  if (!num501) return false
  const ids = decodePackedIds(num501.value as Uint8Array)
  const next = ids.filter((x) => x !== id)
  if (next.length === ids.length) return false
  num501.value = Buffer.concat(next.map((x) => Buffer.from(encodeVarint(x))))
  return true
}

export interface DeleteUiResult {
  bytes: Uint8Array
  removedIds: number[]
  kind: UiRecordKind
}

const ROOT_CATEGORY_ID = 1073741841

/**
 * 删除一条 root9 502 记录（自动分类并按对应层级维护引用）。
 * 返回新 bytes 和被删除的 ID 集合。
 */
export function deleteUiRecord(bytes: Uint8Array, id: number): DeleteUiResult {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 缺失')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 段解析失败')

  // 定位目标记录
  const targetField = section.find(
    (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === id,
  )
  if (!targetField) throw new Error(`[error] 记录 ${id} 不存在`)

  const targetM = parseWireMessage(targetField.value as Uint8Array)!
  const kind = classifyUiRecord(targetM)
  const removedIds: number[] = []

  // 把 section 的 502 记录收集到数组，方便按 ID 查/删
  const records = section.filter((f) => f.number === 502 && f.wire === 2)

  if (kind === 'official' || kind === 'instance') {
    // 布局控件 / 模板实例：从父容器 f503 移除 + 删记录 + 实例还需从模板 f14 移除
    const parentId = targetM.find((x) => x.number === 504 && x.wire === 0)?.value as number | undefined
    if (parentId !== undefined) {
      const parent = section.find(
        (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === parentId,
      )
      if (parent) {
        const pm = parseWireMessage(parent.value as Uint8Array)!
        removeFromPackedList(pm, 503, id)
        parent.value = emitWireMessage(pm)
      }
    }
    if (kind === 'instance') {
      // 实例 f502[type3].f13 → 模板 ID
      for (const f of targetM) {
        if (f.number !== 502 || f.wire !== 2) continue
        const im = parseWireMessage(f.value as Uint8Array)
        if (!im) continue
        const t = im.find((x) => x.number === 502 && x.wire === 0)?.value
        if (t !== 3) continue
        const f13 = im.find((x) => x.number === 13 && x.wire === 2)
        if (!f13) continue
        const f13m = parseWireMessage(f13.value as Uint8Array)
        const templateId = f13m?.find((x) => x.number === 501 && x.wire === 0)?.value as number
        if (typeof templateId === 'number') {
          const tmplField = section.find(
            (ff) => ff.number === 502 && ff.wire === 2 && recordIdOf(ff.value as Uint8Array) === templateId,
          )
          if (tmplField) {
            const tm = parseWireMessage(tmplField.value as Uint8Array)!
            removeTemplateInstanceLink(tm, id)
            tmplField.value = emitWireMessage(tm)
          }
        }
      }
    }
    removedIds.push(id)
  } else if (kind === 'template') {
    // 控件模板：删所有引用它的实例 + 删模板
    const instanceIds = templateInstanceIds(targetM)
    for (const instId of instanceIds) {
      // 从实例的父容器 f503 移除 + 删实例
      const instField = section.find(
        (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === instId,
      )
      if (instField) {
        const im = parseWireMessage(instField.value as Uint8Array)!
        const parentId = im.find((x) => x.number === 504 && x.wire === 0)?.value as number | undefined
        if (parentId !== undefined) {
          const parent = section.find(
            (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === parentId,
          )
          if (parent) {
            const pm = parseWireMessage(parent.value as Uint8Array)!
            removeFromPackedList(pm, 503, instId)
            parent.value = emitWireMessage(pm)
          }
        }
      }
      removedIds.push(instId)
    }
    removedIds.push(id)
  } else if (kind === 'asset') {
    // 素材：确定顶层容器，删容器 + 组 + 分类副本 + 分类副本组 + num501 + 1841 分类树
    let topId = id
    let copyId = containerPairLink(targetM, 14)
    if (copyId === undefined) {
      // 传入的是分类副本，反查顶层
      const backLink = containerPairLink(targetM, 13)
      if (backLink !== undefined) {
        topId = backLink
        const topField = section.find(
          (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === topId,
        )
        if (topField) {
          copyId = containerPairLink(parseWireMessage(topField.value as Uint8Array)!, 14)
        }
      }
    }
    // 收集要删的组：f504 == topId 或 copyId 的 asset-group
    const groupIds: number[] = []
    for (const f of records) {
      const m = parseWireMessage(f.value as Uint8Array)!
      if (classifyUiRecord(m) !== 'asset-group') continue
      const parentId = m.find((x) => x.number === 504 && x.wire === 0)?.value as number
      if (parentId === topId || parentId === copyId) {
        groupIds.push(recordIdOf(f.value as Uint8Array)!)
      }
    }
    removedIds.push(topId) // 容器
    if (copyId !== undefined) removedIds.push(copyId) // 分类副本
    removedIds.push(...groupIds) // 组
    removeFromNum501(section, topId) // num501 注册表
    // 1841 分类树 f503 移除 copyId
    const rootCat = section.find(
      (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === ROOT_CATEGORY_ID,
    )
    if (rootCat && copyId !== undefined) {
      const rm = parseWireMessage(rootCat.value as Uint8Array)!
      removeFromPackedList(rm, 503, copyId)
      rootCat.value = emitWireMessage(rm)
    }
  } else {
    throw new Error(`[error] 记录 ${id} 是 ${kind}，不支持删除（只能删素材/模板/布局控件）`)
  }

  // 从 section 删除 removedIds 里的 502 记录
  const removeSet = new Set(removedIds)
  const next = section.filter((f) => {
    if (f.number !== 502 || f.wire !== 2) return true
    return !removeSet.has(recordIdOf(f.value as Uint8Array)!)
  })
  section.length = 0
  section.push(...next)
  root9.value = emitWireMessage(section)

  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4),
    }),
    removedIds,
    kind,
  }
}


// ============ 控件模板创建（模板 type4 + 实例 type3，引用素材）============

/** 图片控件「模板」样本（真实编辑器 1073741948，type4，f14=实例列表） */
const BUILTIN_IMAGE_TEMPLATE_RECORD =
  'a81ffc80808004b21f0f5a07a81ffc80808004a81f01b01f05b21f0b6203a81f16a81f02b01f06b21f15720daa1f0afb808080048181808004a81f04b01f04ca1f116209aa1f06e59bbee78987a81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a1001180820fc80808004ca1fd7035a056200a81f02a81f01b01f0cba1fc6036aad0362a703aa1f63b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f01b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f02b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f03b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00b01f09c01f01a81f02a81f04b01f0cb81f01c21f0a1001180820fc80808004ca1f47fa0100a81f15b01f26ba1f3bfa01221a0ca81fffffffffffffffffff0120ffffffff0f320a1001180820e7808080045200a81f16b01f26b81f01c21f0a1001180820fc80808004'

/** 图片控件「实例」样本（真实编辑器 1073741947，type3，f504=控件组容器） */
const BUILTIN_IMAGE_INSTANCE_RECORD =
  'a81ffb80808004b21f0f5a07a81ffb80808004a81f01b01f05b21f0b6203a81f16a81f02b01f06b21f0f6a07a81ffc80808004a81f03b01f03c01f9080808004ca1f116209aa1f06e59bbee78987a81f02b01f0fca1f2d72057a00a81f05a81f04b01f17ba1f1d72057a00a81f05a81f05b01f17b81f01c21f0a1001180820fb80808004ca1fd7035a056200a81f02a81f01b01f0cba1fc6036aad0362a703aa1f63b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f01b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f02b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00aa1f66a81f03b21f60aa1f0f0d0000803f150000803f1d0000803fb21f0cad1f0000003fb51f0000003fba1f0cad1f0000003fb51f0000003fc21f0cad1ffeff24c4b51ffdff79c3ca1f0cad1f0000a042b51ff4ff9f42d21f0cad1f0000003fb51f0000003fe21f00b01f09c01f01a81f02a81f04b01f0cb81f01c21f0a1001180820fb80808004ca1f47fa0100a81f15b01f26ba1f3bfa01221a0ca81fffffffffffffffffff0120ffffffff0f320a1001180820e7808080045200a81f16b01f26b81f01c21f0a1001180820fb80808004'

/** 模板/实例样本里的 ID 常量 */
const TPL_SELF_ID = 1073741948
const INST_SELF_ID = 1073741947
const TPL_LINK_ID = 1073741948 // 实例里 f13 指向的模板
const INST_CONTAINER_ID = 1073741840 // 实例 f504 控件组容器
const TPL_ASSET_ID = 1073741927 // guide-tap

/** 设置模板 f502[type4].f14.f501 的实例列表 */
function setTemplateInstanceListField(m: WireField[], instanceIds: number[]): void {
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = parseWireMessage(f.value as Uint8Array)
    if (!im) continue
    const t = im.find((x) => x.number === 502 && x.wire === 0)?.value
    if (t !== 4) continue
    const f14 = im.find((x) => x.number === 14 && x.wire === 2)
    if (!f14) continue
    const f14m = parseWireMessage(f14.value as Uint8Array)
    if (!f14m) continue
    const f501 = f14m.find((x) => x.number === 501 && x.wire === 2)
    if (!f501) continue
    f501.value = Buffer.concat(instanceIds.map((id) => Buffer.from(encodeVarint(id))))
    f14.value = emitWireMessage(f14m)
    f.value = emitWireMessage(im)
    return
  }
}

export interface UiTemplateCreateOptions {
  id: number
  name?: string
  /** 素材索引 ID（= 素材库容器 ID） */
  assetId: number
  position?: readonly [number, number]
  size?: readonly [number, number]
}

/**
 * 创建「控件模板」（模板 type4 + 实例 type3 两条记录），引用指定素材。
 * 实例挂在控件组容器 1073741840（不进布局，与布局/素材解耦）。
 * 返回模板 ID、实例 ID 与新 bytes。
 */
export function createUiTemplate(
  bytes: Uint8Array,
  options: UiTemplateCreateOptions
): { bytes: Uint8Array; templateId: number; instanceId: number } {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const instanceId = options.id + 1

  // 模板记录
  let tmpl = Buffer.from(BUILTIN_IMAGE_TEMPLATE_RECORD, 'hex')
  const tmplFields = parseWireMessage(tmpl)
  if (!tmplFields) throw new Error('[error] invalid template record')
  replaceAllVarints(tmplFields, TPL_SELF_ID, options.id)
  replaceAllVarints(tmplFields, TPL_ASSET_ID, options.assetId)
  setTemplateInstanceListField(tmplFields, [instanceId])
  tmpl = Buffer.from(emitWireMessage(tmplFields))

  // 实例记录
  let inst = Buffer.from(BUILTIN_IMAGE_INSTANCE_RECORD, 'hex')
  const instFields = parseWireMessage(inst)
  if (!instFields) throw new Error('[error] invalid instance record')
  replaceAllVarints(instFields, INST_SELF_ID, instanceId)
  replaceAllVarints(instFields, TPL_ASSET_ID, options.assetId)
  replaceAllVarints(instFields, TPL_LINK_ID, options.id)
  inst = Buffer.from(emitWireMessage(instFields))

  // 名字 / 位置 / 尺寸（模板和实例都设，保持一致）
  if (options.name !== undefined) {
    tmpl = Buffer.from(setUiName(tmpl, options.name))
    inst = Buffer.from(setUiName(inst, options.name))
  }
  if (options.position !== undefined || options.size !== undefined) {
    const trans = { position: options.position, size: options.size }
    tmpl = Buffer.from(setUiTransform(tmpl, trans))
    inst = Buffer.from(setUiTransform(inst, trans))
  }

  // 注册进 root9 + 控件组容器 f503
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 缺失')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 段解析失败')
  section.push({ number: 502, wire: 2, value: tmpl })
  section.push({ number: 502, wire: 2, value: inst })
  root9.value = emitWireMessage(section)
  appendToLayoutById(top, INST_CONTAINER_ID, instanceId)

  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4),
    }),
    templateId: options.id,
    instanceId,
  }
}


// ============ 改素材引用（编辑：模板/控件换素材）============

/** 改记录 f505[f502=38].f503.f31.f6.f4 的素材索引 ID */
function setAssetReference(m: WireField[], assetId: number): boolean {
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)
    if (!sub) continue
    const type = sub.find((x) => x.number === 502 && x.wire === 0)?.value
    if (type !== 38) continue
    const f503 = sub.find((x) => x.number === 503 && x.wire === 2)
    if (!f503) continue
    const f503m = parseWireMessage(f503.value as Uint8Array)
    if (!f503m) continue
    const f31 = f503m.find((x) => x.number === 31 && x.wire === 2)
    if (!f31) continue
    const f31m = parseWireMessage(f31.value as Uint8Array)
    if (!f31m) continue
    const f6 = f31m.find((x) => x.number === 6 && x.wire === 2)
    if (!f6) continue
    const f6m = parseWireMessage(f6.value as Uint8Array)
    if (!f6m) continue
    const f4 = f6m.find((x) => x.number === 4 && x.wire === 0)
    if (!f4) continue
    f4.value = assetId
    f6.value = emitWireMessage(f6m)
    f31.value = emitWireMessage(f31m)
    f503.value = emitWireMessage(f503m)
    sub[sub.indexOf(f503)] = f503
    f.value = emitWireMessage(sub)
    return true
  }
  return false
}

/**
 * 改一条控件/模板引用素材的素材索引 ID。
 * 若目标是模板，同时改它所有实例的素材引用（保持一致）。
 */
export function updateUiAssetReference(
  bytes: Uint8Array,
  id: number,
  assetId: number
): { bytes: Uint8Array; changedIds: number[] } {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 缺失')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 段解析失败')

  const targetField = section.find(
    (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === id,
  )
  if (!targetField) throw new Error(`[error] 记录 ${id} 不存在`)
  const targetM = parseWireMessage(targetField.value as Uint8Array)!
  const kind = classifyUiRecord(targetM)

  if (kind !== 'template' && kind !== 'instance' && kind !== 'official') {
    throw new Error(`[error] 记录 ${id} 是 ${kind}，无素材引用可改`)
  }

  const idsToChange: number[] = [id]
  if (kind === 'template') {
    idsToChange.push(...templateInstanceIds(targetM))
  }

  const changedIds: number[] = []
  for (const rid of idsToChange) {
    const recField = section.find(
      (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === rid,
    )
    if (!recField) continue
    const recM = parseWireMessage(recField.value as Uint8Array)!
    if (setAssetReference(recM, assetId)) {
      recField.value = emitWireMessage(recM)
      changedIds.push(rid)
    }
  }
  if (changedIds.length === 0) throw new Error(`[error] 记录 ${id} 无图片源引用可改`)
  root9.value = emitWireMessage(section)

  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4),
    }),
    changedIds,
  }
}


// ============ 素材颜色编辑（改素材容器所有组的图元颜色）============

/** 改组图元颜色 f505.f503.f31.f4 = ARGB int32 */
function setGroupColor(m: WireField[], colorArgb: number): boolean {
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sm = parseWireMessage(f.value as Uint8Array)
    if (!sm) continue
    const g503 = sm.find((x) => x.number === 503 && x.wire === 2)
    if (!g503) continue
    const g503m = parseWireMessage(g503.value as Uint8Array)
    if (!g503m) continue
    const g31 = g503m.find((x) => x.number === 31 && x.wire === 2)
    if (!g31) continue
    const g31m = parseWireMessage(g31.value as Uint8Array)
    if (!g31m) continue
    const f4 = g31m.find((x) => x.number === 4 && x.wire === 0)
    if (!f4) continue
    f4.value = colorArgb
    g31.value = emitWireMessage(g31m)
    g503.value = emitWireMessage(g503m)
    f.value = emitWireMessage(sm)
    return true
  }
  return false
}

/**
 * 改一个素材容器（含分类副本）所有图元组的颜色。
 * colorArgb 为 int32 ARGB（0xAARRGGBB，用 cssColorToArgb 转换）。
 */
export function setAssetColor(
  bytes: Uint8Array,
  containerId: number,
  colorArgb: number
): { bytes: Uint8Array; changedIds: number[] } {
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[error] root9 缺失')
  const section = parseWireMessage(root9.value as Uint8Array)
  if (!section) throw new Error('[error] root9 段解析失败')

  // 定位容器 + 分类副本
  const containerField = section.find(
    (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === containerId,
  )
  if (!containerField) throw new Error(`[error] 素材容器 ${containerId} 不存在`)
  const containerM = parseWireMessage(containerField.value as Uint8Array)!
  if (classifyUiRecord(containerM) !== 'asset') {
    throw new Error(`[error] 记录 ${containerId} 不是素材容器`)
  }

  let topId = containerId
  let copyId = containerPairLink(containerM, 14)
  if (copyId === undefined) {
    const backLink = containerPairLink(containerM, 13)
    if (backLink !== undefined) {
      topId = backLink
      const topField = section.find(
        (f) => f.number === 502 && f.wire === 2 && recordIdOf(f.value as Uint8Array) === topId,
      )
      if (topField) copyId = containerPairLink(parseWireMessage(topField.value as Uint8Array)!, 14)
    }
  }

  // 改所有组（f504 = topId 或 copyId 的 asset-group）
  const changedIds: number[] = []
  for (const f of section) {
    if (f.number !== 502 || f.wire !== 2) continue
    const m = parseWireMessage(f.value as Uint8Array)
    if (!m) continue
    if (classifyUiRecord(m) !== 'asset-group') continue
    const parentId = m.find((x) => x.number === 504 && x.wire === 0)?.value as number
    if (parentId !== topId && parentId !== copyId) continue
    if (setGroupColor(m, colorArgb)) {
      const gid = recordIdOf(f.value as Uint8Array)!
      f.value = emitWireMessage(m)
      changedIds.push(gid)
    }
  }
  if (changedIds.length === 0) throw new Error(`[error] 素材 ${containerId} 无图元组`)

  root9.value = emitWireMessage(section)
  return {
    bytes: buildFile(emitWireMessage(top), {
      schema: readUint32BE(bytes, 4),
      headTag: readUint32BE(bytes, 8),
      fileType: readUint32BE(bytes, 12),
      tailTag: readUint32BE(bytes, bytes.length - 4),
    }),
    changedIds,
  }
}
