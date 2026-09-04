// 只读盘点：地图 root15 中的**单位状态**资产 —— E0 轮 STATUS_CFG 真值探测
// 用法：npx tsx .scratch/football-v2/analysis/20-e0-list-unit-status.ts <map.gil> [效果ID=2110001]
//
// 输出每个单位状态的 配置ID / 名称 / 效果列表，并展开「定时触发技能」(2110001) 的参数槽：
//   槽 3  = 技能槽位（f4 = 槽位号+20；段 21..35 = 自定义技能槽 1..15）
//   槽 11 = 触发间隔（f13.2 = f32；**默认 0.0 时整个 f13 省略不上 wire** → 显式标 0.0 未配置）
//   槽 10 = 技能引用（f12 = {f1:1, f2:技能配置ID}；空 = **未指定技能配置**）
// 语义来源：docs/game-engine-knowledge/unit-status.md（2026-09-04 v21 编辑器差分，1918 快照）。
//
// 解析与 src/cli/assets_skill_config.ts:listSkillConfigs 同构（复用 parseWireMessage）。
// ⚠️ 首版踩坑（2026-09-04 入账）：readGilPayloadFields 返回的是 **Uint8Array**（不是字段数组），
// 对它直接 .find() 得到的是字节下标 0..99 的假象输出——必须先 parseWireMessage 再遍历。
import { readGilPayloadFields } from '../../../src/cli/gil_extract_utils.js'
import { parseWireMessage, type WireField } from '../../../src/cli/static_assembly/wire.js'

const [gilPath, wantEffect] = process.argv.slice(2)
if (!gilPath) {
  console.error('Usage: npx tsx 20-e0-list-unit-status.ts <map.gil> [效果ID(默认 2110001)]')
  process.exit(1)
}
const EFFECT_ID = Number(wantEffect ?? 2110001)
const TYPECODE_UNIT_STATUS = 1

const fs = (b?: Uint8Array): WireField[] => (b ? parseWireMessage(b) ?? [] : [])
const vi = (f: WireField[], n: number) => f.find((g) => g.number === n && g.wire === 0)?.value as
  | number
  | undefined
const bs = (f: WireField[], n: number) => f.find((g) => g.number === n && g.wire === 2)?.value as
  | Uint8Array
  | undefined
const f32 = (b: Uint8Array) => new DataView(new Uint8Array(b).buffer).getFloat32(0, true)
const str = (b?: Uint8Array) => (b ? new TextDecoder('utf-8', { fatal: false }).decode(b) : '')

const { payload } = readGilPayloadFields(gilPath)
const root = parseWireMessage(payload as unknown as Uint8Array)
if (!root) {
  console.error('[error] root 解析失败')
  process.exit(1)
}
const root15 = root.find((f) => f.number === 15 && f.wire === 2)
if (!root15) {
  console.log('root15 不存在（该地图无资产容器）')
  process.exit(0)
}
const r15 = fs(root15.value as Uint8Array)

// 效果条目 = {1:效果ID, 2[*]:参数条目{1:槽序号, 4:整型, 12/13:复合值槽}}
const describeEffect = (eff: WireField[]): string[] => {
  const out: string[] = []
  for (const p of eff.filter((g) => g.number === 2 && g.wire === 2)) {
    const pf = fs(p.value as Uint8Array)
    const slot = vi(pf, 1)
    const f4 = vi(pf, 4)
    const f12 = bs(pf, 12)
    const f13 = bs(pf, 13)
    if (slot === 3) {
      out.push(`    · 槽3 技能槽位 = ${f4 === undefined ? '未设' : `${f4} → 自定义技能槽 ${f4 - 20}`}`)
    } else if (slot === 11) {
      const inner = f13 && f13.length ? fs(f13) : []
      const v = inner.find((g) => g.number === 2 && g.wire === 5)
      out.push(
        v
          ? `    · 槽11 触发间隔 = ${f32(v.value as Uint8Array)}s`
          : '    · 槽11 触发间隔 = **0.0（f13 省略=未配置）**'
      )
    } else if (slot === 10) {
      out.push(
        f12 && f12.length
          ? `    · 槽10 技能引用 = 配置ID ${vi(fs(f12), 2)}`
          : '    · 槽10 技能引用 = **空（未指定技能配置）**'
      )
    } else {
      out.push(`    · 槽${slot}: f4=${f4} f12len=${f12?.length ?? 0} f13len=${f13?.length ?? 0}`)
    }
  }
  return out
}

let statuses = 0
let hits = 0
for (const rec of r15) {
  if (rec.wire !== 2 || rec.number !== 1) continue
  const inner = fs(rec.value as Uint8Array)
  if (vi(inner, 2) !== TYPECODE_UNIT_STATUS) continue
  statuses++
  const id = vi(inner, 1)
  const secs = inner.filter((s) => s.number === 4 && s.wire === 2)
  let name = ''
  const effectIds: number[] = []
  const lines: string[] = []
  for (const sec of secs) {
    const si = fs(sec.value as Uint8Array)
    const kind = vi(si, 1)
    if (kind === 1) name = str(bs(fs(bs(si, 11) ?? new Uint8Array()), 1))
    if (kind !== 6) continue // 6 = 通用配置块
    // 层级：4[1].21（块）→ .1（通用配置 104B）→ .3（效果列表容器）→ .1[*]（效果条目）
    const c21 = fs(bs(si, 21) ?? new Uint8Array)
    const cfg = fs(bs(c21, 1) ?? new Uint8Array)
    const effsContainer = fs(bs(cfg, 3) ?? new Uint8Array)
    for (const e of effsContainer.filter((g) => g.number === 1 && g.wire === 2)) {
      const ef = fs(e.value as Uint8Array)
      const eid = vi(ef, 1)
      if (eid === undefined) continue
      effectIds.push(eid)
      if (eid === EFFECT_ID) {
        hits++
        lines.push(...describeEffect(ef))
      }
    }
  }
  console.log(`单位状态 id=${id} (0x${(id ?? 0).toString(16)}) name="${name}" 效果=[${effectIds.join(', ')}]`)
  lines.forEach((l) => console.log(l))
}
console.log(`\n合计：单位状态 ${statuses} 个，含效果 ${EFFECT_ID}（定时触发技能）的 ${hits} 个`)
if (!statuses) console.log('→ 该地图无任何单位状态：STATUS_CFG 待用户在编辑器新建后回填')
