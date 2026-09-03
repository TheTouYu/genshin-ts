// gen-rbv-vars.mjs —— 生成票 06 渲染单元资产注册的 --vars 参数 + 烘焙表 JSON（2026-09-05）
// 用法：npx tsx tools/gen-rbv-vars.mjs host|player|json
//   host   → 宿主 1077936201：任务寄存器 + 静态烘焙表（slots/off/axes/localAxis 分块）
//   player → 玩家实体：rbv_epoch/rbv_ack（rb_host 沿用 rbx 链注册）
//   json   → 写 tools/rbv-render-tables.json（供 rbv-math-kernel.mjs 与写回轮对账）
// 表源：tools/3x3-logic-tables.json（逻辑表）+ src/orientTables.ts（localAxis，机械抽取）
//       + turn.ts/visual.ts 常量（axes/视觉顺序/面心下标，见下，长度自检）
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = join(__dirname, '..', 'src')

// ---------------------------------------------------------------- 源数据
const T = JSON.parse(readFileSync(join(__dirname, '3x3-logic-tables.json'), 'utf8'))

const FACE_VISUAL_ORDER = [
  0, 4, 1, 6, 3, 5, 2, 7,
  0, 4, 1, 6, 3, 5, 2, 7,
  0, 7, 2, 4, 3, 5, 1, 6,
  0, 7, 2, 4, 3, 5, 1, 6,
  0, 4, 1, 5, 3, 6, 2, 7,
  0, 4, 1, 5, 3, 6, 2, 7
]
const MIDDLE_VISUAL_ORDER = [4, 0, 6, 2, 5, 3, 7, 1]
const WHOLE_VISUAL_ORDER = [
  0, 8, 20, 18, 1, 9, 21, 19,
  2, 10, 22, 16, 3, 11, 23, 17,
  4, 12, 24, 5, 13, 25, 6, 14,
  7, 15
]
const FACE_CENTER_INDEX = [0, 4, 5, 0, 1, 2, 3]
const AXES = [
  [0, 0, 0], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1],
  [1, 0, 0], [0, 1, 0], [0, 0, -1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]
]
const CORNER_OFF = [
  [-1, 1, -1], [1, 1, -1], [-1, 1, 1], [1, 1, 1],
  [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, 1]
]
const EDGE_OFF = [
  [0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0],
  [0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1]
]
const CENTER_OFF = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]

function rowFrom(m, r) {
  if (m <= 6) return r < 4 ? T.faceCornerFrom[(m - 1) * 4 + r] : T.faceEdgeFrom[(m - 1) * 4 + (r - 4)]
  if (m <= 9) return r < 4 ? T.middleEdgeFrom[(m - 7) * 4 + r] : T.middleCenterFrom[(m - 7) * 4 + (r - 4)]
  return r < 8 ? T.wholeCornerFrom[(m - 10) * 8 + r]
    : r < 20 ? T.wholeEdgeFrom[(m - 10) * 12 + (r - 8)]
      : T.wholeCenterFrom[(m - 10) * 6 + (r - 20)]
}
function rowSpot(m, r) {
  const p = rowFrom(m, r)
  if (m <= 6) return r < 4 ? p : p + 8
  if (m <= 9) return r < 4 ? p + 8 : p + 20
  return r < 8 ? p : r < 20 ? p + 8 : p + 20
}
function spotOffset(spot) {
  if (spot < 8) return CORNER_OFF[spot]
  if (spot < 20) return EDGE_OFF[spot - 8]
  return CENTER_OFF[spot - 20]
}

// localAxis 抽取（src/orientTables.ts 生成文件；100 元素分块×3，实测 100/100/100=300 含 padding）
function extractLocalAxis() {
  const text = readFileSync(join(SRC, 'orientTables.ts'), 'utf8')
  const per = {}
  const blockRe = /export const (localAxisTable\d) = \[([\s\S]*?)\n\]/g
  let bm
  while ((bm = blockRe.exec(text)) !== null) {
    const re = /vec3\(\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\)/g
    const triples = []
    let m
    while ((m = re.exec(bm[2])) !== null) triples.push([Number(m[1]), Number(m[2]), Number(m[3])])
    per[bm[1]] = triples
  }
  for (const k of ['localAxisTable0', 'localAxisTable1', 'localAxisTable2']) {
    if (per[k]?.length !== 100) throw new Error(`orientTables ${k} = ${per[k]?.length} 项 ≠ 100（分块边界与 rbRenderSkill 不符，需核对生成器）`)
  }
  return [...per.localAxisTable0, ...per.localAxisTable1, ...per.localAxisTable2]
}
const LOCAL_AXIS = extractLocalAxis()

// ---------------------------------------------------------------- 槽位→格点表（视觉顺序布局）
const slotsF = []
for (let m = 1; m <= 6; m++) {
  slotsF.push(20 + FACE_CENTER_INDEX[m]) // slot0 = 面心格点
  for (let i = 0; i < 8; i++) slotsF.push(rowSpot(m, FACE_VISUAL_ORDER[(m - 1) * 8 + i]))
}
const slotsM = []
for (let m = 7; m <= 9; m++) {
  for (let i = 0; i < 8; i++) slotsM.push(rowSpot(m, MIDDLE_VISUAL_ORDER[i]))
}
const slotsW = []
for (let m = 10; m <= 12; m++) {
  for (let i = 0; i < 26; i++) slotsW.push(rowSpot(m, WHOLE_VISUAL_ORDER[i]))
}
// 长度/范围自检
if (slotsF.length !== 54 || slotsM.length !== 24 || slotsW.length !== 78) throw new Error('slots 表长度异常')
const off = []
for (let s = 0; s < 26; s++) off.push(spotOffset(s))
const allSpots = [...slotsF, ...slotsM, ...slotsW]
if (allSpots.some((s) => s < 0 || s > 25)) throw new Error('slots 表含越界格点')

// ---------------------------------------------------------------- 输出
const vec3 = (v) => v.join(',')
const vec3List = (arr) => arr.map(vec3).join('|')
const intList = (arr) => '[' + arr.join(',') + ']'
const which = process.argv[2]
const jsonPath = join(__dirname, 'rbv-render-tables.json')
if (which === 'json') {
  writeFileSync(jsonPath, JSON.stringify({
    note: '票 06 渲染单元烘焙表（gen-rbv-vars.mjs 输出；slotsF/M/W=槽位→全局格点、off=格点相对中心偏移、axes=轨道轴(0..12)、localAxis=288 自旋轴表）',
    slotsF, slotsM, slotsW, off, axes: AXES, localAxis: LOCAL_AXIS
  }, null, 0) + '\n')
  console.log('written', jsonPath)
} else if (which === 'host') {
  const zeros26 = intList(new Array(26).fill(0))
  const vars = [
    'rbv_move:int=0',
    'rbv_orient:int_list=' + zeros26,
    'rbv_slotsF:int_list=' + intList(slotsF),
    'rbv_slotsM:int_list=' + intList(slotsM),
    'rbv_slotsW:int_list=' + intList(slotsW),
    'rbv_off:vec3_list=' + vec3List(off),
    'rbv_axes:vec3_list=' + vec3List(AXES),
    'rbv_ax0:vec3_list=' + vec3List(LOCAL_AXIS.slice(0, 100)),
    'rbv_ax1:vec3_list=' + vec3List(LOCAL_AXIS.slice(100, 200)),
    'rbv_ax2:vec3_list=' + vec3List(LOCAL_AXIS.slice(200, 300))
  ]
  console.log(vars.join(';'))
} else if (which === 'player') {
  console.log('rbv_epoch:int=0;rbv_ack:int=0;rbv_host:entity=0;rbv_c:int=0')
} else {
  console.error('usage: npx tsx tools/gen-rbv-vars.mjs host|player|json')
  process.exit(1)
}
