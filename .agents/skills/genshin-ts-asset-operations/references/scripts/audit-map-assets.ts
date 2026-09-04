// audit-map-assets.ts —— 地图**既有同类资产**只读盘点（写回/引用前第一步，免占用户轮次）
//
// 用法：
//   npx tsx <本文件> <map.gil> [--skill-var-base 1207959553 --skill-var-count 200]
//                                [--status-effect 2110001]
// 输出两块：
//   A) 技能变量配置 ID 段：哪些真实存在、哪些只声明未用（空闲）、哪些已被图引用（占用）
//   B) 单位状态资产：配置 ID / 名称 / 效果 ID / 关键参数是否已配置
//
// 为什么要这个脚本（票 20 E0 轮实证，2026-09-04）：
//   ① **技能变量 ID 段按地图而异**——1914 实测 100 个（553..652）、1908 实测只有 50 个
//     （553..602）。跨图套用旧段号 = 引用不存在的变量（客户端读回 EMPTY，静默丢数据）。
//     直读字节 `raw.count(varint(base+i))` 即可判定：**命中 1 次=仅注册表声明=空闲位可用；
//     ≥3 次=已有图在引用（勿复用）**。比问用户"你建到哪了"快且不打断他。
//   ② **编辑器资产可能已经存在**——E0 原计划请用户新建「定时触发技能」状态，盘点后发现
//     地图里**已有**该状态（id=1077936132）且它指向**槽位 12**（不是常规槽 1）：
//     既省掉用户一次新建，又暴露了"装配错槽=定时触发找不到技能=静默判负"的错配。
//     → 任何"要用户去编辑器新建 X"的计划，先跑本盘点，可能只是**配参数**而非新建。
//
// 解析与仓库 CLI 同构（复用 parseWireMessage，不自写 protobuf 解码器）。
// ⚠️ 常见坑：readGilPayloadFields() 返回的 payload 是 **Uint8Array**（不是字段数组），
// 直接 .find() 得到的是字节下标假象——必须先 parseWireMessage。
import { readGilPayloadFields } from '../../../../../src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '../../../../../src/cli/static_assembly/wire.js'

const args = process.argv.slice(2)
if (!args.length || args[0] === '-h' || args[0] === '--help') {
  console.log(
    'Usage: npx tsx audit-map-assets.ts <map.gil> [--skill-var-base N] [--skill-var-count N] [--status-effect N]'
  )
  process.exit(1)
}
const gilPath = args[0]
const opt = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : dflt
}
const SKILL_VAR_BASE = opt('skill-var-base', 1207959553) // 系统菜单批量创建固定起始 ID
const SKILL_VAR_COUNT = opt('skill-var-count', 200)
const STATUS_EFFECT = opt('status-effect', 2110001) // 2110001 = 定时触发技能

const fs = (b?: Uint8Array): WireField[] => (b ? parseWireMessage(b) ?? [] : [])
const vi = (f: WireField[], n: number) =>
  f.find((g) => g.number === n && g.wire === 0)?.value as number | undefined
const bs = (f: WireField[], n: number) =>
  f.find((g) => g.number === n && g.wire === 2)?.value as Uint8Array | undefined
const f32 = (b: Uint8Array) => new DataView(new Uint8Array(b).buffer).getFloat32(0, true)
const str = (b?: Uint8Array) => (b ? new TextDecoder('utf-8', { fatal: false }).decode(b) : '')
const varint = (v: number) => {
  const out: number[] = []
  for (;;) {
    const b = v & 0x7f
    v = Math.floor(v / 128)
    if (v) out.push(b | 0x80)
    else { out.push(b); break }
  }
  return Buffer.from(out)
}
const countBytes = (hay: Buffer, needle: Buffer) => {
  let c = 0
  let i = hay.indexOf(needle)
  while (i >= 0) { c++; i = hay.indexOf(needle, i + 1) }
  return c
}

const raw = Buffer.from(readGilPayloadFields(gilPath).payload as unknown as Uint8Array)

// ———— A) 技能变量配置 ID 段 ————
console.log(`\n=== A) 技能变量配置 ID（基址 ${SKILL_VAR_BASE}，扫描 ${SKILL_VAR_COUNT} 个号）===`)
const present: { id: number; hits: number }[] = []
for (let i = 0; i < SKILL_VAR_COUNT; i++) {
  const id = SKILL_VAR_BASE + i
  const hits = countBytes(raw, varint(id))
  if (hits) present.push({ id, hits })
}
if (!present.length) {
  console.log('  该段零命中 → 本地图**没有任何技能变量**（须请用户在系统菜单【技能变量管理】创建）')
} else {
  const lo = present[0].id
  const hi = present[present.length - 1].id
  console.log(`  在位段 = ${lo}..${hi}（共 ${present.length} 个号；连续=${present.length === hi - lo + 1}）`)
  const free = present.filter((p) => p.hits === 1)
  const used = present.filter((p) => p.hits > 1)
  console.log(`  空闲（命中 1 次=仅声明零引用）${free.length} 个：${free.map((f) => f.id).join(', ') || '（无）'}`)
  console.log(`  已占用（命中 ≥2 次=有图引用）${used.length} 个：`)
  used.forEach((u) => console.log(`    ${u.id}  ×${u.hits}`))
  console.log('  ⚠️ 段外编号（> 上面 hi）引用 = 命中不存在变量 → 客户端读回 EMPTY（跨图套用旧段号的典型事故）')
}

// ———— B) 单位状态资产 ————
console.log(`\n=== B) 单位状态资产（root15 记录 f2 类型码=1；展开效果 ${STATUS_EFFECT} 的参数）===`)
const root = parseWireMessage(raw) ?? []
const root15 = root.find((f) => f.number === 15 && f.wire === 2)
if (!root15) {
  console.log('  root15 不存在 → 本地图无资产容器')
  process.exit(0)
}
// 效果参数槽语义按效果 ID 二维维护（unit-status.md v21），本表只覆盖已采样项
const SLOT_DESC: Record<number, string> = { 3: '技能槽位', 11: '触发间隔', 10: '技能引用', 5: '保留/未定名' }
let statuses = 0
let matched = 0
for (const rec of fs(root15.value as Uint8Array)) {
  if (rec.wire !== 2 || rec.number !== 1) continue
  const inner = fs(rec.value as Uint8Array)
  if (vi(inner, 2) !== 1) continue // 1 = 单位状态
  statuses++
  const id = vi(inner, 1)
  let name = ''
  const effectIds: number[] = []
  const detail: string[] = []
  for (const sec of inner.filter((s) => s.number === 4 && s.wire === 2)) {
    const si = fs(sec.value as Uint8Array)
    const kind = vi(si, 1)
    if (kind === 1) name = str(bs(fs(bs(si, 11) ?? new Uint8Array()), 1))
    if (kind !== 6) continue // 6 = 通用配置块
    // 层级：4[1].21 → .1（通用配置）→ .3（效果列表容器）→ .1[*]（效果条目）
    const c21 = fs(bs(si, 21) ?? new Uint8Array)
    const cfg = fs(bs(c21, 1) ?? new Uint8Array)
    const effs = fs(bs(cfg, 3) ?? new Uint8Array)
    for (const e of effs.filter((g) => g.number === 1 && g.wire === 2)) {
      const ef = fs(e.value as Uint8Array)
      const eid = vi(ef, 1)
      if (eid === undefined) continue
      effectIds.push(eid)
      if (eid !== STATUS_EFFECT) continue
      matched++
      for (const p of ef.filter((g) => g.number === 2 && g.wire === 2)) {
        const pf = fs(p.value as Uint8Array)
        const slot = vi(pf, 1)
        const f4 = vi(pf, 4)
        const f12 = bs(pf, 12)
        const f13 = bs(pf, 13)
        const label = SLOT_DESC[slot as number] ?? `槽 ${slot}`
        if (slot === 3)
          detail.push(
            f4 === undefined
              ? `  · ${label} 未设`
              : `  · ${label} = ${f4} → 自定义技能槽 ${f4 - 20}（f4=槽位号+20）`
          )
        else if (slot === 11) {
          const inner13 = fs(f13)
          const v = inner13.find((g) => g.number === 2 && g.wire === 5)
          detail.push(
            v
              ? `  · ${label} = ${f32(v.value as Uint8Array)}s`
              : `  · ${label} = **0.0 未配置**（f13 ${f13 ? '存在但空' : '缺失'}）`
          )
        } else if (slot === 10)
          detail.push(
            f12 && f12.length
              ? `  · ${label} = 技能配置ID ${vi(fs(f12), 2)}`
              : `  · ${label} = **空（未指定技能配置）**`
          )
        else detail.push(`  · ${label}: f4=${f4} f12len=${f12?.length ?? 0} f13len=${f13?.length ?? 0}`)
      }
    }
  }
  console.log(`  状态 id=${id} (0x${(id ?? 0).toString(16)}) 名="${name}" 效果=[${effectIds.join(', ')}]`)
  detail.forEach((d) => console.log(d))
}
if (!statuses) console.log('  本地图无任何单位状态')
console.log(
  `  合计：单位状态 ${statuses} 个，含效果 ${STATUS_EFFECT} 的 ${matched} 个` +
    (matched ? '' : `（→ 若需该效果，请用户在编辑器配置或新建；先据 A 段确认无需新建的假设）`)
)
console.log('\n提示：本盘点为**只读**；未验证游戏运行时语义（如间隔 0.0 是否永不触发＝需帧值实测）。')
