// W1 清理判据：node w1-cleanup.mjs [--gil <path>] [--baseline <path>]
// 断言：坏页家族 12 条全除、结构计数、零残留引用、零悬空 t42、root9 外不变（baseline 给定时）
import { readFileSync } from 'node:fs'
import {
  parseRoot9, extractContainerRefs, extractMemberIds, DEFAULT_LAYOUT_ID
} from '/home/h/genshin-ts/dist/ui/src/record.js'

const argv = process.argv.slice(2)
const get = (k, d) => {
  const i = argv.indexOf(k)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const GIL = get('--gil', '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil')
const BASELINE = get('--baseline', undefined)

const REMOVED = new Set([
  1073741863, 1073741864, 1073741865, 1073741866, 1073741867,
  1073742161, 1073742162, 1073742163, 1073742164, 1073742165, 1073742166, 1073742167
])

function varintBytes(v) {
  const out = []
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

const bytes = new Uint8Array(readFileSync(GIL))
const parsed = parseRoot9(bytes)
let fails = 0
const ok = (name, cond, detail = '') => {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`)
}

// 1) 记录数
ok('records_after=122', parsed.records.length === 122, `实际=${parsed.records.length}`)
// 2) 索引数
ok('index_after=46', parsed.indexIds.size === 46, `实际=${parsed.indexIds.size}`)
// 3) 布局成员数
const layout = parsed.recordsById.get(DEFAULT_LAYOUT_ID)
const members = extractMemberIds(layout.fields)
ok('layout_members_after=31', members.length === 31, `实际=${members.length}`)
// 4) removed 全部不存在
const stillThere = [...REMOVED].filter((id) => parsed.recordsById.has(id))
ok('removed_12_absent', stillThere.length === 0, stillThat(stillThere))
function stillThat(x) { return x.length ? `残留=${x.join(',')}` : '' }
// 5) 零残留引用（任意记录字节含 removed id 的 varint）
const refHits = []
for (const r of parsed.records) {
  for (const id of REMOVED) if (rawContains(r.raw, id)) { refHits.push(`${r.id}→${id}`); break }
}
ok('zero_dangling_refs_to_removed', refHits.length === 0, refHits.slice(0, 5).join(' '))
// 6) 全库 t42 悬空引用=0（所有记录的容器引用都存在）
const danglings = []
for (const r of parsed.records) {
  for (const c of extractContainerRefs(r.fields)) {
    if (!parsed.recordsById.has(c)) danglings.push(`${r.id}→${c}`)
  }
}
ok('zero_dangling_t42', danglings.length === 0, danglings.slice(0, 5).join(' '))
// 7) 每条记录 parent 存在（无孤儿断裂）
const brokenParents = []
for (const r of parsed.records) {
  if (r.parentId !== null && !parsed.recordsById.has(r.parentId)) brokenParents.push(`${r.id}→${r.parentId}`)
}
ok('parents_resolve', brokenParents.length === 0, brokenParents.slice(0, 5).join(' '))

// 8) baseline 给定时：root9 之外仅 root46 审计可变
if (BASELINE) {
  const bBytes = new Uint8Array(readFileSync(BASELINE))
  const bTop = parseRoot9(bBytes).top
  const aTop = parsed.top
  const nums = new Set([...bTop.map((f) => f.number), ...aTop.map((f) => f.number)])
  const diffs = []
  for (const n of nums) {
    const bf = bTop.find((f) => f.number === n)
    const af = aTop.find((f) => f.number === n)
    let same
    if (bf === undefined || af === undefined) same = false
    else if (bf.wire === 2 && af.wire === 2) {
      same = Buffer.compare(
        Buffer.from(bf.value instanceof Uint8Array ? bf.value : new Uint8Array()),
        Buffer.from(af.value instanceof Uint8Array ? af.value : new Uint8Array())
      ) === 0
    } else same = bf.value === af.value && bf.wire === af.wire
    if (!same) diffs.push(n)
  }
  const illegal = diffs.filter((n) => n !== 9 && n !== 46)
  ok('roots_only_9_46_changed', illegal.length === 0, `变化 roots=[${diffs.join(',')}]`)
}

console.log(fails === 0 ? `ALL GREEN (${GIL})` : `FAILURES=${fails}`)
process.exit(fails === 0 ? 0 : 1)
