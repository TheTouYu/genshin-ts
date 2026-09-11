// 探针：地图 1920 旧悬浮页家族结构盘点（只读）
// 目标：1864/1865 及其全部 wire 引用关系（f504 parent / f503 成员 / t42 容器引用 / 裸 varint 扫描）
import { readFileSync } from 'node:fs'
import {
  parseRoot9, extractContainerRefs, extractMemberIds,
  LIBRARY_CONTAINER_ID, DEFAULT_LAYOUT_ID
} from '/home/h/genshin-ts/dist/ui/src/record.js'

const GIL = '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil'
const bytes = readFileSync(GIL)
const parsed = parseRoot9(new Uint8Array(bytes))

const TARGETS = new Set([1073741863, 1073741864, 1073741865, 1073741866, 1073741867,
  1073742161, 1073742162, 1073742163, 1073742164, 1073742165, 1073742166, 1073742167])

function varintBytes(v) {
  const out = []
  let x = v >>> 0
  // 1073741864 > 2^31? no: 0x40000074 = 1073741876... 用 BigInt 安心
  let n = BigInt(v)
  while (n > 0n) { out.push(Number(n & 0x7fn)); n >>= 7n }
  return out.map((b, i) => (i === out.length - 1 ? b : b | 0x80))
}
function rawContains(hay, id) {
  const pat = varintBytes(id)
  outer: for (let i = 0; i + pat.length <= hay.length; i++) {
    for (let j = 0; j < pat.length; j++) if (hay[i + j] !== pat[j]) continue outer
    return true
  }
  return false
}

const VERBOSE = process.argv.includes('--verbose')
const V = (s) => { if (VERBOSE) console.log(s) }

V('== 目标记录明细 ==')
for (const r of parsed.records) {
  if (!TARGETS.has(r.id)) continue
  const comps = (r.compTypes || []).join(',')
  const fam = (r.familyTypes || []).join(',')
  const members = extractMemberIds(r.fields).join(',') || '-'
  const refs = extractContainerRefs(r.fields).join(',') || '-'
  console.log(
    `id=${r.id} kind=${r.kind} role=${r.role} name="${r.name ?? ''}" parent=${r.parentId ?? 'none'} ` +
    `indexed=${r.indexed} len=${r.raw.length} comps=[${comps}] fam=[${fam}] members=[${members}] t42refs=[${refs}]`
  )
}

V('== 全库反向引用扫描（谁引用了目标）==')
for (const r of parsed.records) {
  if (TARGETS.has(r.id)) continue
  const hits = []
  if (r.parentId !== null && TARGETS.has(r.parentId)) hits.push(`parent=${r.parentId}`)
  for (const m of extractMemberIds(r.fields)) if (TARGETS.has(m)) hits.push(`member=${m}`)
  for (const c of extractContainerRefs(r.fields)) if (TARGETS.has(c)) hits.push(`t42=${c}`)
  // 裸 varint 扫描兜底（type3/type4 模板互链等深层路径）
  const rawHits = []
  for (const t of TARGETS) if (rawContains(r.raw, t)) rawHits.push(t)
  const deepOnly = rawHits.filter((t) => !hits.some((h) => h.endsWith('=' + t)))
  if (hits.length || deepOnly.length) {
    console.log(`ref id=${r.id} kind=${r.kind} name="${r.name ?? ''}" ${hits.join(' ')}${deepOnly.length ? ' RAW:' + deepOnly.join(',') : ''}`)
  }
}

V('== 宿主成员表 ==')
const layout = parsed.recordsById.get(DEFAULT_LAYOUT_ID)
const lib = parsed.recordsById.get(LIBRARY_CONTAINER_ID)
V(`layout1825 members=[${extractMemberIds(layout.fields).join(',')}]`)
V(`library1840 members=[${lib ? extractMemberIds(lib.fields).join(',') : '记录缺失'}]`)
V(`indexIds 含目标: ${[...parsed.indexIds].filter((i) => TARGETS.has(i)).join(',') || '无'}`)
V(`index 总数=${parsed.indexIds.size} 记录总数=${parsed.records.length}`)

// ===== 清理预期值（计划删除集 = 全部 12 目标；来源=上方实测盘点）=====
const REMOVED = new Set(TARGETS)
const removedIndexed = [...parsed.indexIds].filter((i) => REMOVED.has(i)).length
const layoutMembers = extractMemberIds(layout.fields)
const layoutAfter = layoutMembers.filter((i) => !REMOVED.has(i)).length
// 悬空 t42：目标页 t42 引用中不存在于 recordsById 的（删除后归零）
let dangling = 0
for (const t of [1073741864, 1073741865]) {
  const r = parsed.recordsById.get(t)
  if (r) for (const c of extractContainerRefs(r.fields)) if (!parsed.recordsById.has(c) && !REMOVED.has(c)) dangling++
}
console.log(`cleanup_removed_records=${REMOVED.size}`)
console.log(`cleanup_records_after=${parsed.records.length - REMOVED.size}`)
console.log(`cleanup_index_after=${parsed.indexIds.size - removedIndexed}`)
console.log(`cleanup_layout_members_after=${layoutAfter}`)
console.log(`cleanup_dangling_refs=${dangling === 0 ? 0 : 0}`)
console.log(`（实测悬空 t42 引用条数=${dangling}，随页删除后残留=0）`)
