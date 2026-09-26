import fs from 'node:fs'
import { parseWireMessage } from '../../src/cli/static_assembly/wire.js'
import { readRootFields, readStructDefs } from '../../src/cli/gil_structs.js'
import { buildStructComposites } from '../../src/cli/gil_struct_composites.js'
const bytes = new Uint8Array(fs.readFileSync(process.argv[2]))
const root = readRootFields(bytes)
const inner = parseWireMessage((root.find((f) => f.number === 10 && f.wire === 2)!.value) as Uint8Array)!
const defs = readStructDefs(bytes)

// 收集每个结构体实际的 9 条 def
const byStruct = new Map<number, { defId: number; bytes: Uint8Array }[]>()
for (const f of inner.filter((x) => x.number === 2 && x.wire === 2)) {
  const raw = f.value as Uint8Array
  const d = parseWireMessage(parseWireMessage(raw)!.find((x) => x.number === 1 && x.wire === 2)!.value as Uint8Array)!
  const idm = parseWireMessage(d.find((x) => x.number === 4 && x.wire === 2)!.value as Uint8Array)!
  const defId = parseWireMessage(idm.find((z) => z.number === 1 && z.wire === 2)!.value as Uint8Array)!.find((z) => z.number === 5 && z.wire === 0)!.value as number
  const bm = parseWireMessage(d.find((x) => x.number === 107 && x.wire === 2)!.value as Uint8Array)!
  const ref = bm.find((z) => [104, 105, 106].includes(z.number) && z.wire === 2)
  if (!ref) continue
  const sid = parseWireMessage(ref.value as Uint8Array)!.find((z) => z.number === 1 && z.wire === 0)!.value as number
  if (!byStruct.has(sid)) byStruct.set(sid, [])
  byStruct.get(sid)!.push({ defId, bytes: raw })
}

let total = 0, hit = 0
const names: Record<number, string> = { 1: 'entity', 2: 'guid', 3: 'int', 4: 'bool', 5: 'float', 6: 'str', 7: 'guid_list', 8: 'int_list', 9: 'bool_list', 10: 'float_list', 11: 'str_list', 12: 'vec3', 13: 'entity_list', 15: 'vec3_list', 17: 'faction', 20: 'config_id', 21: 'prefab_id', 25: 'struct', 26: 'struct_list' }
for (const d of defs) {
  const act = (byStruct.get(d.id) ?? []).sort((a, b) => a.defId - b.defId)
  if (!act.length) { console.log(`[${d.id}] "${d.name}" —— 无物化定义（0 条）`); continue }
  let basePin = Number.MAX_SAFE_INTEGER
  for (const a of act) {
    const dd = parseWireMessage(parseWireMessage(a.bytes)!.find((x) => x.number === 1 && x.wire === 2)!.value as Uint8Array)!
    for (const p of dd.filter((y) => [100, 101, 102, 103].includes(y.number) && y.wire === 2)) {
      const pm = parseWireMessage(p.value as Uint8Array)!
      const i = pm.find((z) => z.number === 8 && z.wire === 0)?.value as number | undefined
      if (i !== undefined && i < basePin) basePin = i
    }
  }
  const gen = buildStructComposites(d.name, d.members, d.id, act[0].defId, basePin)
  // 逐条比对，且**按内容而非顺序**判断（pinIndex 可能分散）
  let ok = 0
  const detail: string[] = []
  // 归一化：把引脚 f8（pinIndex）在**所有层级**抹成 X，再比
  // 用途：区分「我的编码错」与「样本被重物化过（pinIndex 被重分配）」
  const canon = (fs2: readonly any[], depth = 0): string =>
    fs2.map((f: any) => {
      if (f.wire === 0) return `v${f.number}${f.number === 8 ? 'X' : f.value}`
      const v = f.value as Uint8Array
      const sub = depth < 5 ? parseWireMessage(v) : undefined
      if (sub && sub.length) return `m${f.number}{${canon(sub, depth + 1)}}`
      return `b${f.number}${Buffer.from(v).toString('hex')}`
    }).join(',')
  const norm = (b: Uint8Array): string => {
    const d = parseWireMessage(parseWireMessage(b)!.find((x) => x.number === 1 && x.wire === 2)!.value as Uint8Array)!
    return canon(d)
  }
  for (let i = 0; i < act.length; i++) {
    const same = gen[i] && Buffer.compare(Buffer.from(act[i].bytes), Buffer.from(gen[i].bytes)) === 0
    if (same) ok++
    else {
      const eq = gen[i] && norm(act[i].bytes) === norm(gen[i].bytes)
      detail.push(eq ? `#${i}~` : `#${i}✗`)
    }
  }
  total += act.length; hit += ok
  const tags = [...new Set(d.members.map((m) => names[m.typeCode] ?? `#${m.typeCode}`))].join(',')
  console.log(`[${d.id}] "${d.name}" ${d.members.length}成员(${d.archived ? '存档 ' : ''}${tags})  ${ok}/${act.length}${detail.length ? '  差 ' + detail.join(' ') : ''}`)
}
console.log(`\n合计 ${hit}/${total} 条逐字节一致`)
