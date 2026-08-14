// Extract canonical builtin signal param layouts from real editor signals
// Usage: tsx tests/composite/extract-builtin-layouts.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWireMessage, printableWireText, emitWireMessage, type WireField } from '../../src/cli/static_assembly/wire.js'

const DIR = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level'
// source: 1849 全参数 (scalars), 1849 全参数-列表 (lists), 1888 verify_ping (fresh-map str)
const SOURCES = [
  { map: '1073741849.gil', signal: '信号测试全参数', mapLabel: '1849' },
  { map: '1073741849.gil', signal: '信号测试全参数-列表', mapLabel: '1849' },
  { map: '1073741888.gil', signal: 'verify_ping', mapLabel: '1888' }
]

function readTop(map: string): WireField[] {
  const bytes = new Uint8Array(readFileSync(DIR + '/' + map))
  const root = parseWireMessage(bytes.slice(20, -4))!
  const topField = root.find((f) => f.number === 10 && f.wire === 2)!
  return parseWireMessage(topField.value as Uint8Array)!
}
function nodeIdentity(data: Uint8Array): { class?: number; type?: number; kind?: number; id?: number } {
  const value = parseWireMessage(data)!
  const v = (n: number) => value.find((f) => f.number === n && f.wire === 0)?.value as number | undefined
  return { class: v(1), type: v(2), kind: v(3), id: v(5) }
}
function texts(data: Uint8Array): string[] {
  const out: string[] = []
  const visit = (b: Uint8Array) => {
    for (const f of parseWireMessage(b) ?? []) {
      if (f.wire !== 2) continue
      const t = printableWireText(f.value as Uint8Array)
      if (t !== undefined) out.push(t)
      else visit(f.value as Uint8Array)
    }
  }
  visit(data)
  return out
}
function definitionNodeId(wrapper: WireField): number | undefined {
  const ws = parseWireMessage(wrapper.value as Uint8Array)!
  const inner = ws.find((f) => f.number === 1 && f.wire === 2)
  if (!inner) return undefined
  const root = parseWireMessage(inner.value as Uint8Array)!
  const id = root.find((f) => f.number === 4 && f.wire === 2)
  if (!id) return undefined
  const generic = parseWireMessage(id.value as Uint8Array)!.find((f) => f.number === 1 && f.wire === 2)
  return generic ? nodeIdentity(generic.value as Uint8Array).id : undefined
}
const hex = (u: Uint8Array) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join(' ')

// find signal entries + defs per source
for (const src of SOURCES) {
  const top = readTop(src.map)
  const reg = top.find((f) => f.number === 5 && f.wire === 2)!
  const entries = parseWireMessage(reg.value as Uint8Array)!.filter((f) => f.number === 3 && f.wire === 2)
  const entry = entries.find((e) => {
    const name = parseWireMessage(e.value as Uint8Array)!.find((f) => f.number === 3 && f.wire === 2)
    return name && printableWireText(name.value as Uint8Array) === src.signal
  })
  if (!entry) throw new Error('signal not found: ' + src.signal)
  const eFields = parseWireMessage(entry.value as Uint8Array)!
  const sendId = nodeIdentity((eFields.find((f) => f.number === 1)!.value) as Uint8Array).id
  const monId = nodeIdentity((eFields.find((f) => f.number === 2)!.value) as Uint8Array).id
  const serId = nodeIdentity((eFields.find((f) => f.number === 7)!.value) as Uint8Array).id
  const params = eFields.filter((f) => f.number === 4 && f.wire === 2).map((f) => {
    const p = parseWireMessage(f.value as Uint8Array)!
    const name = p.find((s) => s.number === 1 && s.wire === 2)
    const type = p.find((s) => s.number === 2 && s.wire === 0)
    return { name: name ? printableWireText(name.value as Uint8Array) : '?', type: type?.value as number, field: f }
  })
  const defs = new Map<number, WireField>()
  for (const def of top.filter((f) => f.number === 2 && f.wire === 2)) {
    const id = definitionNodeId(def)
    if (id === sendId || id === monId || id === serId) defs.set(id, def)
  }
  const kindOf = (id: number) => (id === sendId ? 'send' : id === monId ? 'mon' : 'ser')
  // per param: extract entry + def entries
  const out: any[] = []
  for (const p of params) {
    const rec: any = { signal: src.signal, map: src.mapLabel, name: p.name, type: p.type, indexPins: {} }
    const pInner = parseWireMessage(p.field.value as Uint8Array)!
    rec.index = {
      n3: pInner.find((f) => f.number === 3)?.value,
      n4: pInner.find((f) => f.number === 4)?.value,
      n5: pInner.find((f) => f.number === 5)?.value,
      n6: pInner.find((f) => f.number === 6)?.value
    }
    for (const [id, def] of defs) {
      const ws = parseWireMessage(def.value as Uint8Array)!
      const inner = ws.find((f) => f.number === 1 && f.wire === 2)!
      const root = parseWireMessage(inner.value as Uint8Array)!
      const kind = kindOf(id)
      // field4 n5 + skeleton fields
      const f4 = root.find((f) => f.number === 4 && f.wire === 2)
      if (f4) rec[kind + '_f4n5'] = parseWireMessage(f4.value as Uint8Array)!.find((f) => f.number === 5)?.value
      const sub = root.find((f) => {
        if (f.wire !== 2) return false
        const inner2 = parseWireMessage(f.value as Uint8Array)
        const name = inner2?.find((s) => s.number === 1 && s.wire === 2)
        if (!name || printableWireText(name.value as Uint8Array) !== p.name) return false
        const kindNum = kind === 'mon' ? 103 : 102
        return f.number === kindNum
      })
      if (sub) {
        const subInner = parseWireMessage(sub.value as Uint8Array)!
        const n3 = subInner.find((f) => f.number === 3)
        const n4 = subInner.find((f) => f.number === 4)
        const n8 = subInner.find((f) => f.number === 8)
        rec[kind] = {
          n3: n3 && n3.wire === 2 ? hex(n3.value as Uint8Array) : n3 ? 'v' + n3.value : undefined,
          n4: n4 && n4.wire === 2 ? hex(n4.value as Uint8Array) : n4 ? 'v' + n4.value : undefined,
          n8: n8?.value
        }
      }
    }
    out.push(rec)
  }
  // namePin + fixed outputs + field4 structure for each kind
  const skeleton: any = { signal: src.signal, map: src.mapLabel, ids: { sendId, monId, serId }, namePin: {}, fixed: {} }
  for (const [id, def] of defs) {
    const ws = parseWireMessage(def.value as Uint8Array)!
    const inner = ws.find((f) => f.number === 1 && f.wire === 2)!
    const root = parseWireMessage(inner.value as Uint8Array)!
    const kind = kindOf(id)
    const f4 = root.find((f) => f.number === 4 && f.wire === 2)!
    const f4Inner = parseWireMessage(f4.value as Uint8Array)!
    skeleton[kind + '_f4'] = {
      n1: hex(f4Inner.find((f) => f.number === 1)?.value as Uint8Array),
      n2: hex(f4Inner.find((f) => f.number === 2)?.value as Uint8Array),
      n4: hex(f4Inner.find((f) => f.number === 4)?.value as Uint8Array),
      n5: f4Inner.find((f) => f.number === 5)?.value
    }
    for (const sub of root) {
      if (sub.wire !== 2) continue
      const subInner = parseWireMessage(sub.value as Uint8Array)
      const name = subInner?.find((f) => f.number === 1 && f.wire === 2)
      const nameStr = name ? printableWireText(name.value as Uint8Array) : undefined
      if (sub.number === 106 && nameStr === '信号名') {
        skeleton.namePin[kind] = {
          n1: '信号名',
          n2: subInner!.find((f) => f.number === 2)?.value,
          n3: subInner!.find((f) => f.number === 3 && f.wire === 2) ? hex((subInner!.find((f) => f.number === 3)!.value) as Uint8Array) : undefined,
          n4: hex(subInner!.find((f) => f.number === 4)!.value as Uint8Array),
          n5: hex(subInner!.find((f) => f.number === 5)!.value as Uint8Array),
          n8: subInner!.find((f) => f.number === 8)?.value
        }
      }
      if (sub.number === 103 && nameStr && ['事件源实体', '事件源GUID', '信号来源实体'].includes(nameStr)) {
        skeleton.fixed[kind + '_' + nameStr] = {
          n3: subInner!.find((f) => f.number === 3 && f.wire === 2) ? hex((subInner!.find((f) => f.number === 3)!.value) as Uint8Array) : undefined,
          n4: hex(subInner!.find((f) => f.number === 4)!.value as Uint8Array),
          n8: subInner!.find((f) => f.number === 8)?.value
        }
      }
    }
  }
  writeFileSync('/tmp/layout-' + src.signal + '.json', JSON.stringify({ params: out, skeleton }, null, 1))
  console.log(src.signal + ': ' + out.length + ' params, skeleton kinds: ' + Object.keys(skeleton.namePin).join(','))
}

