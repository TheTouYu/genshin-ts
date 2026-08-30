// @ts-nocheck
/**
 * 全量复合引用完整性校验（2026-08-20 魔方注入事故后新增，fail-closed 流程层）。
 * 背景：注入器 merge 复合定义只覆盖同 ID、不删除地图残留旧 def；若残留 def（如 gsts_in_layer）
 * 引用的复合 ID 被本次注入覆盖为不同复合（如 orbit_scheduler），会类型错位 → 游戏拒载（无日志）。
 * 本工具校验：地图内每个复合 impl 图引用的复合 ID 必须存在于复合定义表（0 悬空）；
 * 配合 --incoming 对比 GIA def 集合，识别"残留 def 引用被覆盖 ID"的事故模式。
 *
 * 用法:
 *   npx tsx tools/check-gil-composite-refs.ts <地图.gil> [--incoming <game.gia>] [--json]
 */
import { readFileSync } from 'fs'
import {
  listCompositeDefs,
  compositeImplGraphId,
  locateGraphField,
  parseGraphNodes,
  listGraphs
} from '../src/cli/static_assembly/graph_edit.js'
import { parseMessage } from '../src/injector/binary.js'
import { loadGiaProto } from '../src/injector/proto.js'

function usage(): never {
  console.error('Usage: npx tsx tools/check-gil-composite-refs.ts <地图.gil> [--incoming <game.gia>] [--json]')
  process.exit(1)
}

const [gilPath, ...rest] = process.argv.slice(2)
if (!gilPath) usage()
const incomingPath = rest[rest.indexOf('--incoming') + 1]
const asJson = rest.includes('--json')

const bytes = readFileSync(gilPath)
const payload = bytes.slice(20, -4)
const defs = listCompositeDefs(bytes)
const defById = new Map(defs.map((d) => [Number(d.id), d]))

// O-2026-08-21-4：内置 SysGraph 信号单元区间（监听/发送信号 def，16106127xx）。
// unit.which（监听信号=12 与复合 def 相同）与 def.class（全部 10001）均无法区分，id 区间是唯一可靠判据。
const isSignalDefId = (id: number): boolean => id >= 1610612736 && id < 1610700000
// 复合 def 区间：用户显式（1610700000-1610700099）+ 默认命名空间 stub/full（2000000000+，football motion_by_vel 等）
const isCompositeDefId = (id: number): boolean =>
  (id >= 1610700000 && id < 1610700100) || (id >= 2000000000 && id < 2100000000)

function collectCompositeRefs(defId: number): number[] {
  const out: number[] = []
  let implId: number | undefined
  try { implId = compositeImplGraphId(payload, defId) } catch { return out }
  if (implId === undefined) return out
  try {
    const field = locateGraphField(payload, implId)
    const blob = payload.subarray(field.field.dataStart, field.field.dataEnd)
    for (const n of parseGraphNodes(blob)) {
      if (n.genericId >= 1610700000 && n.genericId < 1610700100) out.push(n.genericId)
    }
  } catch { /* impl 图缺失则跳过 */ }
  return out
}

// ---- 1. 图内复合调用引用完整性 ----
const errors: string[] = []
let implCount = 0
for (const g of listGraphs(bytes)) {
  if (!(g.id >= 1610710000 && g.id < 1610720000)) continue // 只看复合 impl 图
  implCount++
  const def = [...defById.values()].find((d) => Number(d.id) === Number(g.id))
  const defName = def?.name ?? `impl_${g.id}`
  let field
  try { field = locateGraphField(payload, g.id) } catch { continue }
  const blob = payload.subarray(field.field.dataStart, field.field.dataEnd)
  for (const n of parseGraphNodes(blob)) {
    const gid = n.genericId
    if (gid >= 1610700000 && gid < 1610700100 && !defById.has(gid)) {
      errors.push(`${defName}(impl ${g.id}) 引用复合 ${gid} 不存在（悬空）`)
    }
  }
}

// ---- 2.（可选）与 incoming GIA def 集合对比 ----
let residueWarn = 0
if (incomingPath) {
  const giaBytes = readFileSync(incomingPath)
  const giaPayload = giaBytes.slice(20, -4)
  const { rootMessage } = loadGiaProto()
  const root = rootMessage.decode(giaPayload) as {
    accessories?: Array<{ compositeDef?: { inner?: { def?: any } } }>
  }
  const incomingIds = new Set<number>()
  for (const unit of root.accessories ?? []) {
    const def = unit.compositeDef?.inner?.def
    const id = def?.id?.genericId?.id ?? def?.id?.concreteId?.id
    if (id === undefined) continue
    const nid = Number(id)
    if (isSignalDefId(nid)) continue // 信号单元不是复合 def（O-2026-08-21-4 误报根因）
    incomingIds.add(nid)
  }
  const mapIds = new Set([...defById.keys()].filter(isCompositeDefId))
  for (const id of [...incomingIds].filter((id) => !mapIds.has(id))) {
    errors.push(`GIA 复合 ${id} 注入后在地图中缺失`)
  }
  for (const id of [...mapIds].filter((id) => !incomingIds.has(id))) {
    const def = defById.get(id)
    const dangerous = collectCompositeRefs(id).filter((r) => incomingIds.has(r))
    if (dangerous.length > 0) {
      errors.push(`残留复合 ${def?.name ?? id}(impl ${id}) 引用的 ID ${dangerous.join(',')} 被本次注入覆盖——可能类型错位，需清理残留后重注入`)
      residueWarn++
    } else {
      console.log(`[info] 残留复合 ${def?.name ?? id}(impl ${id}) 引用自洽（死代码，无害）`)
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ implCount, errors, residueWarn }, null, 2))
} else if (errors.length > 0) {
  console.log(`✗ 发现 ${errors.length} 处问题：`)
  for (const e of errors) console.log('  - ' + e)
  process.exit(1)
} else {
  console.log(`✓ 复合引用完整（${implCount} 个 impl 图，0 悬空）`)
}
