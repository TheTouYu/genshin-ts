// 票 24 §7 三层组件槽字节对齐（2026-10-12，tab 点击零事件修复）
//
// 根因：1825 重建+引擎回写后，组件槽三层（root4 def f8 / root8 实例 f7 / root5 实体 f7）
// 全部缺失非白名单槽——球 6138/6135 缺 type12 命中检测（def 71B/实体 76B 定制版，
// CLI hitDetection 快照是 81B 默认版 f3=2101 ≠ donor 定制 f3=2103，字节不等价），
// basicMotion 槽被引擎规范化为 11B（donor=9B）。tabBar(17) 三层都在但点击事件
// 零触发（D149 铁证：whenTabIsSelected 零帧）——命中检测槽是事件链组件。
//
// 方法：官方 WireField 模式（同 setTabBarOptions@src/cli/gil_entities.ts:551）——
// parse 得到可变字段数组，槽字段（f7/f8）整序列替换为 donor 原字节 value，
// 逐层 emit 回填 + buildFile（schema/headTag/fileType/tailTag 保当前文件值）。
// 先做 round-trip 自检（emit(parse(x)) 逐字节一致）确认无损基线。
//
// 用法：npx tsx examples/football/assets/plans/transplant-component-slots.ts [--write]
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildFile, readUint32BE } from '../../../../src/injector/binary.js'
import {
  parseWireMessage as parse,
  emitWireMessage as emit
} from '../../../../src/cli/static_assembly/wire.js'

const GIL_CUR = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741825/1073741825.gil'
const GIL_DONOR = join(import.meta.dirname ?? '.', '../../../../.scratch/_archive/football-v2/evidence/ab-22/map-2026-09-07_14-37-43_3231_110170759.gil')
const WRITE = process.argv.includes('--write')

// def（root4 f8）与实例（root8 f7）目标：球元件 6138（root8 实例 id 与 def 同 id）
// 实体（root5 f7）目标：tmp-all-f7.ts 全量对比得出的 10 个差异实体
const DEF_TARGETS = [1077936138]
const ENTITY_TARGETS = [1077936135, 1077936139, 1082130437, 1082130438, 1082130439,
  1082130440, 1082130441, 1082130444, 1082130445, 1090519041]

function recordId(record: Uint8Array): number | undefined {
  const first = parse(record)?.[0]
  return first?.number === 1 && first.wire === 0 ? (first.value as number) : undefined
}

function loadTop(bytes: Uint8Array) {
  const payload = bytes.slice(20, -4)
  const top = parse(payload)
  if (!top) throw new Error('malformed payload')
  return { payload, top }
}

// 容器内 field1 记录列表（可变 WireField 数组视图）
function sectionOf(top: ReturnType<typeof parse>!, fieldNo: number) {
  const container = top!.find(f => f.number === fieldNo && f.wire === 2)
  if (!container) throw new Error(`root${fieldNo} 容器缺失`)
  let section = parse(container.value as Uint8Array)
  if (!section) throw new Error(`root${fieldNo} 容器 malformed`)
  return { container, section }
}

const cur = readFileSync(GIL_CUR)
const don = readFileSync(GIL_DONOR)
const curT = loadTop(cur)
const donT = loadTop(don)

// ── round-trip 自检：emit(parse(payload)) 必须逐字节一致（无损基线）──
const rt = emit(curT.top)
const roundTripOk = rt.length === curT.payload.length && rt.every((b, i) => b === curT.payload[i])
console.log(`round-trip 自检（当前文件整 payload）：${roundTripOk ? '逐字节一致 ✓' : '!!! 不一致，中止'}`)
if (!roundTripOk) {
  let first = -1
  for (let i = 0; i < Math.min(rt.length, curT.payload.length); i++)
    if (rt[i] !== curT.payload[i]) { first = i; break }
  console.log(`  首个差异 @${first}（len ${rt.length} vs ${curT.payload.length}）`)
  process.exit(1)
}

const log: string[] = []

// ── 通用槽替换：目标容器里 id 匹配的记录，槽字段序列替换为 donor 版 ──
function transplantSlots(
  curTop: NonNullable<ReturnType<typeof parse>>,
  donTop: NonNullable<ReturnType<typeof parse>>,
  fieldNo: number,       // 容器层：4=def / 8=实例 / 5=实体
  slotField: number,     // 槽字段：def=8 / 实例与实体=7
  ids: number[]
) {
  const curS = sectionOf(curTop, fieldNo)
  const donS = sectionOf(donTop, fieldNo)
  for (const id of ids) {
    const curRec = curS.section.find(f => f.number === 1 && f.wire === 2 && recordId(f.value as Uint8Array) === id)
    const donRec = donS.section.find(f => f.number === 1 && f.wire === 2 && recordId(f.value as Uint8Array) === id)
    if (!curRec || !donRec) { log.push(`${fieldNo}/${id}: 缺记录 cur=${!!curRec} donor=${!!donor(donRec)}，跳过`); continue }
    const curFields = parse(curRec.value as Uint8Array)!
    const donFields = parse(donRec.value as Uint8Array)!
    const curSlots = curFields.filter(f => f.number === slotField && f.wire === 2)
    const donSlots = donFields.filter(f => f.number === slotField && f.wire === 2)
    // 记录内重排：去掉旧槽，在原首槽位置插入 donor 槽序列（保持字段序稳定）
    const firstIdx = curFields.findIndex(f => f.number === slotField && f.wire === 2)
    const rest = curFields.filter(f => !(f.number === slotField && f.wire === 2))
    const newFields = firstIdx >= 0
      ? [...rest.slice(0, firstIdx), ...donSlots, ...rest.slice(firstIdx)]
      : [...rest, ...donSlots]
    curRec.value = emit(newFields)
    log.push(`root${fieldNo}/${id}: 槽 ${curSlots.length}→${donSlots.length} 个（${donSlots.map(s => (s.value as Uint8Array).length + 'B').join(',')}）`)
  }
  curS.container.value = emit(curS.section)
}
const donor = <T,>(x: T) => x

transplantSlots(curT.top, donT.top, 4, 8, DEF_TARGETS)   // root4 def 6138 f8
transplantSlots(curT.top, donT.top, 8, 7, DEF_TARGETS)   // root8 实例 6138 f7
transplantSlots(curT.top, donT.top, 5, 7, ENTITY_TARGETS) // root5 实体 f7

for (const line of log) console.log(line)

// ── 重建文件（头尾标记保当前文件值）──
const newPayload = emit(curT.top)
const newFile = buildFile(newPayload, {
  schema: readUint32BE(cur, 4),
  headTag: readUint32BE(cur, 8),
  fileType: readUint32BE(cur, 12),
  tailTag: readUint32BE(cur, cur.length - 4)
})
console.log(`\n文件：${cur.length}B → ${newFile.length}B`)

// ── 回读自验证：三层槽签名（type:size 序列）=donor ──
function slotSignature(top: NonNullable<ReturnType<typeof parse>>, fieldNo: number, slotField: number, id: number): string {
  const s = sectionOf(top, fieldNo)
  const rec = s.section.find(f => f.number === 1 && f.wire === 2 && recordId(f.value as Uint8Array) === id)
  if (!rec) return '(记录缺失)'
  return parse(rec.value as Uint8Array)!.filter(f => f.number === slotField && f.wire === 2).map(f => {
    const slot = parse(f.value as Uint8Array)!
    const t = slot.find(x => x.number === 1 && x.wire === 0)
    return `${t?.value}:${(f.value as Uint8Array).length}`
  }).join(' ')
}
const newT = parse(newFile.slice(20, -4))!
let ok = 0, total = 0
for (const [label, fieldNo, slotField, ids] of [
  ['def', 4, 8, DEF_TARGETS],
  ['root8', 8, 7, DEF_TARGETS],
  ['实体', 5, 7, ENTITY_TARGETS]
] as const) {
  for (const id of ids) {
    total++
    const a = slotSignature(newT, fieldNo, slotField, id)
    const b = slotSignature(donT.top!, fieldNo, slotField, id)
    if (a === b) { ok++; console.log(`✓ ${label}/${id} 槽签名=donor：${a}`) }
    else console.log(`✗ ${label}/${id}\n  新:${a}\n  donor:${b}`)
  }
}
console.log(`\n验证 ${ok}/${total}`)

if (!WRITE) {
  writeFileSync(join(import.meta.dirname ?? '.', 'transplant-component-slots.candidate.gil'), newFile)
  console.log('dry-run：候选写 plans/transplant-component-slots.candidate.gil（未写回）')
} else {
  const bakDir = join(import.meta.dirname ?? '.', 'backups')
  if (!existsSync(bakDir)) mkdirSync(bakDir)
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17)
  const bak = join(bakDir, `1073741825-pre-slots-${stamp}.gil`)
  copyFileSync(GIL_CUR, bak)
  writeFileSync(GIL_CUR, newFile)
  const tempDst = '/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Temp/1073741825.gil'
  copyFileSync(GIL_CUR, tempDst)
  console.log(`已写回（备份 ${bak}；Temp 已同步）`)
}
