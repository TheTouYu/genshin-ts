// 组件槽级差分工具：定位两个 GIL 之间静态装配/元件组件槽的变化
// 用法: npx tsx scripts/component-diff.ts <before.gil> <after.gil> [--id <prefabId>] [--json]
// 输出: 记录级差异 + 组件槽级差异（新增/移除/修改，type + hex + 内嵌中文名）
// 背景: 组件调查 2026-08-13 同一模式三次重复后提炼（基础运动器/命中检测/物件镜头三轮差分）。
//       用户编辑器单变化后，用 before/after 相邻快照精确报告哪个 definition/instance
//       的哪个组件槽变化，并把未知 hex 与已知快照表对照。
// 约定: root4 definition 组件槽 = 记录 f8；root8 instance 组件槽 = 记录 f7。
//       组件槽结构: f1=类型码, f2=1, f{type+10}=配置（空=0B）；部分组件 f{type+11} 配置。
import { readFileSync } from 'node:fs'
import { parseWireMessage, wireRecordId, wireRecords } from '../../../../src/cli/static_assembly/wire.js'

const args = process.argv.slice(2)
const gilPaths = args.filter(a => !a.startsWith('--'))
const flags = args.filter(a => a.startsWith('--'))
const idFilter = flags.includes('--id') ? Number(args[args.indexOf('--id') + 1]) : null
const asJson = flags.includes('--json')

// 已知组件类型 → 名称（来源 docs/game-engine-knowledge/components.md + 用户手动添加差分确认）
const KNOWN_TYPES: Record<number, string> = {
  1: '自定义变量', 3: '单位状态', 4: '基础运动器', 6: '特效播放',
  12: '命中检测', 13: '物件镜头', 16: '全局计时器', 17: '选项卡',
  18: '模板自带(UI不可见,含受击/被击倒特效子块)', 19: 'UI不可见(待确认)',
  14: 'UI不可见(待确认)', 27: '铭牌', 28: '文本气泡', 29: '音效播放器'
}

function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex')
}

function parseComp(comp: Uint8Array): { type: number; fields: { number: number; wire: number; value: unknown }[] } | null {
  const fields = parseWireMessage(comp)
  if (!fields) return null
  const t = fields.find(x => x.number === 1 && x.wire === 0)
  if (!t) return null
  return { type: t.value as number, fields }
}

function innerStrings(fields: { number: number; wire: number; value: unknown }[], depth = 0): string[] {
  const out: string[] = []
  if (depth > 5) return out
  for (const f of fields) {
    if (f.wire !== 2) continue
    const raw = f.value as Uint8Array
    const inner = parseWireMessage(raw)
    if (inner) out.push(...innerStrings(inner, depth + 1))
    else {
      const s = Buffer.from(raw).toString('utf8')
      if (/[\u4e00-\u9fffA-Za-z]/.test(s) && s.length < 40 && !/^[\x00-\x1f]*$/.test(s)) out.push(s)
    }
  }
  return out
}

function compsOf(gilBytes: Uint8Array, id: number, section: number): { type: number; hex: string; strs: string[] }[] {
  const top = parseWireMessage(gilBytes.slice(20, -4))
  if (!top) return []
  const rec = wireRecords(top, section, 1).find(v => wireRecordId(v) === id)
  if (!rec) return []
  const fields = parseWireMessage(rec)
  if (!fields) return []
  const fieldNumber = section === 4 ? 8 : section === 8 ? 7 : null
  if (fieldNumber === null) return []
  return fields.filter(f => f.number === fieldNumber && f.wire === 2).map(f => {
    const comp = f.value as Uint8Array
    const parsed = parseComp(comp)
    return {
      type: parsed?.type ?? -1,
      hex: hex(comp),
      strs: parsed ? innerStrings(parsed.fields) : []
    }
  })
}

if (gilPaths.length < 2) {
  console.error('usage: npx tsx scripts/component-diff.ts <before.gil> <after.gil> [--id <prefabId>] [--json]')
  process.exit(1)
}

const before = readFileSync(gilPaths[0])
const after = readFileSync(gilPaths[1])

const sections = [4, 8] as const
const report: any[] = []

for (const section of sections) {
  const bTop = parseWireMessage(before.slice(20, -4))
  const aTop = parseWireMessage(after.slice(20, -4))
  if (!bTop || !aTop) continue
  const bRecs = wireRecords(bTop, section, 1)
  const aRecs = wireRecords(aTop, section, 1)
  for (const bRec of bRecs) {
    const id = wireRecordId(bRec)
    if (idFilter && id !== idFilter) continue
    const aRec = aRecs.find(v => wireRecordId(v) === id)
    if (aRec && Buffer.from(bRec).equals(Buffer.from(aRec))) continue
    const bComps = compsOf(before, id, section)
    const aComps = compsOf(after, id, section)
    if (!bComps.length && !aComps.length) continue
    const bTypes = bComps.map(c => c.type)
    const aTypes = aComps.map(c => c.type)
    const added = aComps.filter(c => !bComps.some(bc => bc.type === c.type))
    const removed = bComps.filter(c => !aComps.some(ac => ac.type === c.type))
    const modified = aComps.filter(ac => {
      const bc = bComps.find(x => x.type === ac.type)
      return bc && bc.hex !== ac.hex
    }).map(ac => ({ type: ac.type, before: bComps.find(x => x.type === ac.type)!.hex, after: ac.hex }))
    const entry = {
      section: section === 4 ? 'definition' : 'instance',
      id,
      types: { before: bTypes.join(','), after: aTypes.join(',') },
      added: added.map(c => ({ type: c.type, name: KNOWN_TYPES[c.type] ?? '?', hex: c.hex, strs: c.strs })),
      removed: removed.map(c => ({ type: c.type, name: KNOWN_TYPES[c.type] ?? '?' })),
      modified
    }
    if (added.length || removed.length || modified.length) report.push(entry)
  }
  // after 新增的记录
  for (const aRec of aRecs) {
    const id = wireRecordId(aRec)
    if (idFilter && id !== idFilter) continue
    if (bRecs.some(v => wireRecordId(v) === id)) continue
    const aComps = compsOf(after, id, section)
    if (aComps.length) report.push({ section: section === 4 ? 'definition' : 'instance', id, note: 'after 新增记录', types: aComps.map(c => c.type).join(',') })
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  if (!report.length) console.log('无组件级差异')
  for (const e of report) {
    console.log('===', e.section, e.id, '===')
    console.log('  types:', e.types.before, '->', e.types.after)
    for (const a of e.added) console.log('  + 新增 type', a.type, a.name, 'hex:', a.hex, a.strs.length ? '[' + a.strs.join('|') + ']' : '')
    for (const r of e.removed) console.log('  - 移除 type', r.type, r.name)
    for (const m of e.modified) console.log('  ~ 修改 type', m.type, ':', m.before.slice(0, 40), '->', m.after.slice(0, 40))
    if (e.note) console.log('  note:', e.note)
  }
}
