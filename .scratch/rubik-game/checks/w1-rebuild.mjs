// W1 重建判据：node w1-rebuild.mjs [--gil <path>]
// 断言：两页注册入 1840 库序 0/1；固有容器成员序=rgInput item 序；24 组三状态素材；文本插值在位
import { readFileSync } from 'node:fs'
import {
  parseRoot9, extractMemberIds, extractContainerRefs, recordNameOf, LIBRARY_CONTAINER_ID
} from '/home/h/genshin-ts/dist/ui/src/record.js'

const argv = process.argv.slice(2)
const i = argv.indexOf('--gil')
const GIL = i >= 0 && argv[i + 1]
  ? argv[i + 1]
  : '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil'

const bytes = new Uint8Array(readFileSync(GIL))
const p = parseRoot9(bytes)
let fails = 0
const ok = (name, cond, detail = '') => {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`)
}
const nameOf = (id) => {
  const r = p.recordsById.get(id)
  return r ? (r.name || '') : '<missing>'
}

// 1) 库注册与库序
const lib = p.recordsById.get(LIBRARY_CONTAINER_ID)
const libMembers = extractMemberIds(lib.fields)
ok('library_order=[2161,2164]',
  libMembers.length === 2 && libMembers[0] === 1073742161 && libMembers[1] === 1073742164,
  `实际=[${libMembers.join(',')}]`)

// 2) 两页实体 t42 → 固有容器
const page0 = p.recordsById.get(1073742161)
const page1 = p.recordsById.get(1073742164)
const refs0 = extractContainerRefs(page0.fields)
const refs1 = extractContainerRefs(page1.fields)
ok('page0_container=2162', refs0.length === 1 && refs0[0] === 1073742162, `实际=[${refs0.join(',')}]`)
ok('page1_container=2165', refs1.length === 1 && refs1[0] === 1073742165, `实际=[${refs1.join(',')}]`)

// 3) 选关页成员序（item0..4 = rgInput btnId 100..103/200）
const m0 = extractMemberIds(p.recordsById.get(1073742162).fields)
const names0 = m0.map(nameOf)
ok('select_members_order',
  m0.length === 6 &&
    names0[1] === '3步·新手' && names0[2] === '5步·进阶' && names0[3] === '8步·挑战' &&
    names0[4] === '12步·大师' && names0[5] === '自由模式',
  `[${names0.join('|')}]`)

// 4) 结算页成员序（item0..2 = 21/23/22）
const m1 = extractMemberIds(p.recordsById.get(1073742165).fields)
const names1 = m1.map(nameOf)
ok('settle_members_order',
  m1.length === 5 && names1[1] === '重试' && names1[2] === '下一关' && names1[3] === '菜单' && names1[4] === '星级步数',
  `[${names1.join('|')}]`)

// 5) 24 组三状态素材（2167..2214 连续，各 1 成员，挂对按钮）
const BTN_STATE = [
  [1073742070, '3步·新手'], [1073742069, '5步·进阶'], [1073742068, '8步·挑战'],
  [1073742067, '12步·大师'], [1073742066, '自由模式'], [1073742065, '重试'],
  [1073742064, '下一关'], [1073742063, '菜单']
]
let groupsOk = true
const badGroups = []
BTN_STATE.forEach(([btnId, label], bi) => {
  ;['默认', '悬浮', '按下'].forEach((_, si) => {
    const gid = 1073742167 + bi * 6 + si * 2
    const g = p.recordsById.get(gid)
    if (!g) { groupsOk = false; badGroups.push(`${gid}缺失`); return }
    const members = extractMemberIds(g.fields)
    const children = p.records.filter((r) => r.parentId === gid).map((r) => r.id)
    const memberIds = members.length ? members : children
    const mem = p.recordsById.get(memberIds[0])
    const btn = p.recordsById.get(btnId)
    if (memberIds.length !== 1) { groupsOk = false; badGroups.push(`${gid}成员${memberIds.length}`); return }
    const raw = Buffer.from(btn.raw)
    const gidVarint = (() => { let n = BigInt(gid); const out = []; while (n > 0n) { out.push(Number(n & 0x7fn)); n >>= 7n } return Buffer.from(out.map((b, k) => (k === out.length - 1 ? b : b | 0x80))) })()
    if (!raw.includes(gidVarint)) { groupsOk = false; badGroups.push(`${btnId}未引用${gid}`) }
    const memRaw = Buffer.from(mem.raw).toString('utf8')
    if (!memRaw.includes(label)) { groupsOk = false; badGroups.push(`${gid}文本≠${label}`) }
  })
})
ok('state_groups_24', groupsOk, badGroups.slice(0, 4).join(' '))

// 6) 文本框插值
const tb = p.recordsById.get(1073742062)
const tbRaw = Buffer.from(tb.raw).toString('utf8')
ok('textbox_interpolation',
  tbRaw.includes('{1:ps.rg_stars}') && tbRaw.includes('{1:ps.rg_moves}') && tbRaw.includes('{1:ps.rg_par}'),
  '')

// 7) 记录/索引规模合理（122 + 新增：2页×3族=6 + 8按钮+1文本框=9 + 24组+24成员=48 → 185）
ok('records_total=185', p.records.length === 185, `实际=${p.records.length}`)

console.log(fails === 0 ? `ALL GREEN (${GIL})` : `FAILURES=${fails}`)
process.exit(fails === 0 ? 0 : 1)
