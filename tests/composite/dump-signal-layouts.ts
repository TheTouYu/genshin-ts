// Dump signal param layouts — machine lines added
import { readFileSync } from 'node:fs'
import { parseWireMessage, printableWireText, type WireField } from '../../src/cli/static_assembly/wire.js'

const [gilPath, filter] = process.argv.slice(2)
if (!gilPath) throw new Error('Usage: tsx tests/composite/dump-signal-layouts.ts <map.gil> [filter]')

const bytes = new Uint8Array(readFileSync(gilPath))
const root = parseWireMessage(bytes.slice(20, -4))!
const top = parseWireMessage(root.find((f) => f.number === 10 && f.wire === 2)!.value as Uint8Array)!
const hex = (u: Uint8Array) => Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join(' ')

function nodeIdentity(data: Uint8Array): { id?: number } {
  const value = parseWireMessage(data)!
  return { id: value.find((f) => f.number === 5 && f.wire === 0)?.value as number | undefined }
}

const reg = top.find((f) => f.number === 5 && f.wire === 2)
if (!reg) { console.log('NO SIGNAL REGISTRY'); process.exit(0) }
const entries = parseWireMessage(reg.value as Uint8Array)!.filter((f) => f.number === 3 && f.wire === 2)

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

for (const e of entries) {
  const fields = parseWireMessage(e.value as Uint8Array)!
  const name = fields.find((f) => f.number === 3 && f.wire === 2)
  const sName = name ? printableWireText(name.value as Uint8Array) : undefined
  if (!sName || (filter && sName !== filter)) continue
  // index entry machine line
  for (const f of fields) {
    if (f.number !== 4 || f.wire !== 2) continue
    const sub = parseWireMessage(f.value as Uint8Array)!
    const pname = sub.find((s) => s.number === 1 && s.wire === 2)
    const ptype = sub.find((s) => s.number === 2 && s.wire === 0)
    const n4 = sub.find((s) => s.number === 4)?.value
    const n5 = sub.find((s) => s.number === 5)?.value
    const n6 = sub.find((s) => s.number === 6)?.value
    console.log(`IDX ${sName} | ${pname ? printableWireText(pname.value as Uint8Array) : '?'} | type=${ptype?.value} | pins=${n4}/${n5}/${n6}`)
  }
}

for (const def of top.filter((f) => f.number === 2 && f.wire === 2)) {
  const ts = texts(def.value as Uint8Array)
  const owner = !filter ? undefined : ts.includes(filter) ? filter : undefined
  if (filter && !owner) continue
  const ws = parseWireMessage(def.value as Uint8Array)!
  const inner = ws.find((f) => f.number === 1 && f.wire === 2)!
  const rootDef = parseWireMessage(inner.value as Uint8Array)!
  const defId = definitionNodeId(def)
  for (const sub of rootDef) {
    if (sub.wire !== 2) continue
    const subInner = parseWireMessage(sub.value as Uint8Array)
    const pname = subInner?.find((f) => f.number === 1 && f.wire === 2)
    if (!pname) continue
    const pnameStr = printableWireText(pname.value as Uint8Array)!
    const n3 = subInner!.find((s) => s.number === 3)
    const n4 = subInner!.find((s) => s.number === 4)
    const n8 = subInner!.find((s) => s.number === 8)
    const n3s = n3 && n3.wire === 2 ? hex(n3.value as Uint8Array) : n3 ? `v${n3.value}` : '-'
    const n4s = n4 && n4.wire === 2 ? hex(n4.value as Uint8Array) : n4 ? `v${n4.value}` : '-'
    console.log(`DEF ${defId} | field${sub.number} | ${pnameStr} | n3=${n3s} | n4=${n4s} | n8=${n8?.value ?? '-'}`)
  }
}

