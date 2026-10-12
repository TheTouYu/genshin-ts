// 票 25 场景批 v2（2026-10-12）：装饰件全部改为独立实体直引（f2={f1:引擎ID,f2:1}）
// 依据：用户探针 33 个实证（引擎 ID 表 + y=0 底部 pivot + 渲染通过）
// 产出：rebuild-v3-scenery2-entities.json（新增装饰，id 省略自动分配）+ 探针停机坪（显式 id 更新，埋到 y=-50 远角）
import { writeFileSync, readFileSync } from 'node:fs'

// 引擎 ID 表（用户探针 2026-10-12 18:47 差分提取，编辑器亲写）
const R = {
  platform: 20001027,      // 矩形石质平台 12.5×2×4（API 1000027，名字精确匹配）
  platform2: 20003074,     // 石质平台（广场用，变体待目视定谳；另一候选 20002751）
  bench: 20001699,         // 木质长椅 2.5×1×0.5
  stair: 20002590,         // 木质阶梯 5×4×6
  shed: 20003386,          // 木质棚屋（替补席棚/看台背景，尺寸变体待目视）
  gate: 20003086,          // 石质门框 1.5×10×10（入口拱门）
  flag: 20001160,          // 旗帜（杆高待目视：7.5 高杆 or 2.5 小旗）
  tree: 20001200,          // 乔木 10×7.5×6.5（尺寸浮点实证=API 1000001）
  shrub: 20001004,         // 灌木
  flower: 20001185,        // 花丛
  berry: 20001005,         // 野果（小丛点缀）
  bed: 20001159,           // 木质花圃（=docs 实证锚点 20001159 ✓）
  lamp: 20001015,          // 石质路灯 1×3×1
  lantern: 20001174,       // 灯笼挂饰（嘉年华）
  sign: 20001167           // 木质招牌
}
const E = []
const add = (name, definitionId, position, rotation = [0, 0, 0]) =>
  E.push({ name, definitionId, position, rotation })

// ── 侧看台 ×2（北 z+45 / 南 z-45）──
for (const s of [1, -1]) {
  const side = s === 1 ? '北' : '南'
  for (let k = 0; k < 8; k++) {
    const x = -43.75 + k * 12.5
    add(`看台平台_${side}`, R.platform, [x, 0, s * 47])
    add(`看台长椅_${side}a`, R.bench, [x, 2, s * 46.5], s === 1 ? [0, 0, 0] : [0, 180, 0])
    add(`看台长椅_${side}b`, R.bench, [x, 2, s * 48.2], s === 1 ? [0, 0, 0] : [0, 180, 0])
  }
  add(`看台阶梯_${side}1`, R.stair, [-50, 0, s * 47])
  add(`看台阶梯_${side}2`, R.stair, [50, 0, s * 47])
  for (const x of [-30, 0, 30]) add(`看台棚屋_${side}`, R.shed, [x, 0, s * 53])
  for (const x of [-47, -20, 20, 47]) add(`看台旗_${side}`, R.flag, [x, 0, s * 51])
}

// ── 端看台 ×2（东 x+58.5 / 西 x-58.5，长轴转 90°）──
for (const s of [1, -1]) {
  const side = s === 1 ? '东' : '西'
  for (let k = 0; k < 5; k++) {
    const z = -31.25 + k * 12.5
    add(`端台平台_${side}`, R.platform, [s * 60.5, 0, z], [0, 90, 0])
    add(`端台长椅_${side}`, R.bench, [s * 60.5, 2, z], [0, 90, 0])
  }
  add(`端台阶梯_${side}1`, R.stair, [s * 60.5, 0, -36], [0, 90, 0])
  add(`端台阶梯_${side}2`, R.stair, [s * 60.5, 0, 36], [0, 90, 0])
  add(`端台旗_${side}1`, R.flag, [s * 61, 0, -37])
  add(`端台旗_${side}2`, R.flag, [s * 61, 0, 37])
}

// ── 替补席（z+38 侧，技术区）──
for (const sx of [-1, 1]) {
  add('替补席长椅1', R.bench, [sx * 10, 0, 38], [0, 180, 0])
  add('替补席长椅2', R.bench, [sx * 14, 0, 38], [0, 180, 0])
  add('替补席棚', R.shed, [sx * 12, 0, 41.5], [0, 180, 0])
}

// ── 景观带：树环 32 + 灌木/花 + 入口广场×2 + 路灯/灯笼 ──
for (let k = 0; k < 9; k++) {
  add('乔木', R.tree, [-64 + k * 16, 0, 64])
  add('乔木', R.tree, [-64 + k * 16, 0, -64])
}
for (let k = 0; k < 7; k++) {
  add('乔木', R.tree, [64, 0, -48 + k * 16])
  add('乔木', R.tree, [-64, 0, -48 + k * 16])
}
for (const [x, z] of [[-20, 54], [20, 54], [-40, 54], [40, 54], [-30, 58], [30, 58],
  [60, 20], [60, -20], [-60, 20], [-60, -20]])
  add('灌木', R.shrub, [x, 0, z])
for (const [x, z] of [[50, 50], [70, 66], [-50, -50], [-70, -66], [30, 52], [-30, 52], [30, -52], [-30, -52]])
  add('花丛', R.flower, [x, 0, z])
for (const [x, z] of [[56, 56], [-56, 56], [56, -56], [-56, -56]]) add('野果', R.berry, [x, 0, z])
for (const [x, z] of [[47, 47], [-47, 47], [47, -47], [-47, -47]]) add('花圃', R.bed, [x, 0, z])
for (const [x, z] of [[44, 57], [-44, 57], [44, -57], [-44, -57]]) add('路灯', R.lamp, [x, 0, z])
for (const s of [1, -1]) {
  add('广场平台', R.platform2, [s * 60, 0, s * 58], [0, 45, 0])
  add('入口拱门', R.gate, [s * 60, 0, s * 67], [0, s === 1 ? 225 : 45, 0])
  add('入口招牌', R.sign, [s * 52, 0, s * 50], [0, s === 1 ? -45 : 135, 0])
  add('灯笼挂饰', R.lantern, [s * 54, 0, s * 53])
  add('灯笼挂饰', R.lantern, [s * 66, 0, s * 63])
  add('广场旗', R.flag, [s * 53, 0, s * 64])
  add('广场旗', R.flag, [s * 67, 0, s * 52])
}

writeFileSync(new URL('./rebuild-v3-scenery2-entities.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, entities: E }, null, 1))
console.log(`装饰实体: ${E.length}`)

// ── 探针停机坪：33 探针 + 被拖走的 6152 宿主 → 远角地下 (200,-50,200) ──
const probe = JSON.parse(readFileSync(new URL('../static-resource-probe.json', import.meta.url), 'utf8'))
const parked = probe.entities.map((e) => ({
  name: `探针_${e.name}`, id: e.entityId, definitionId: e.engineId,
  position: [200, -50, 200], rotation: [0, 0, 0], scale: [1, 1, 1]
}))
parked.push({ name: '嘉年华_景观带', id: 1077936152, definitionId: 1077936145,
  position: [200, -50, 200], rotation: [0, 0, 0], scale: [1, 1, 1] })
writeFileSync(new URL('./rebuild-v3-probe-park.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, entities: parked }, null, 1))
console.log(`探针停放: ${parked.length}`)
