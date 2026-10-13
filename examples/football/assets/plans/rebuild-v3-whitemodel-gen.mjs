// ⚠️ 冻结（2026-10-13）：场景已由用户在编辑器手作（**实体层权威**），
// 禁止对地图 1073741827 重跑本生成器——会覆盖用户实体层编辑（root5 实体 aux）。
// 用户版快照：examples/football/assets/snapshots/1073741827-20261013-user-authored-scene-fcb563bb.gil
// 用户这轮手法（见日记 D223）：结构性部件留图元；自然物/器物替换为官方素材（逐个手挑品种+重校准比例）。
// 如需再改场景：先与用户确认改法（编辑器手摆 vs 先对齐 def 层再重写）。
// 票 25 场景批·白模 v2（2026-10-13 图片轮校准）：对照生图参考图逐项对齐
// 参照：Wikipedia Stadium（经典英式小球场：两端开放）+ Highbury 1936 双层看台 + Bramall Lane 角塔灯
// v2 变更（图片轮，A1-A9）：①下层 3 级→4 级（0.75m/级，级深 1.9）②看台 100→112m（超角旗）
// ③上层改 2 级台阶+背墙（端面出层次）④顶棚前缘厚边梁 + 柱移到前缘内侧 ⑤顶棚下阴影板（AO 感）
// ⑥灯塔 z ±52→±40（贴场角，原先跑到看台中间）⑦角弧 ×4 ⑧坐席更深 ⑨色温：冷蓝灰 → 中性微暖灰
// 色温依据（参考图量化采样）：受光面 #B8B4B2 / 中调 #8F8D8A / 暗面 #565854
// 全图元：10009001 长方体 + 10009008 圆柱，世界坐标单 def，实体置于原点
import { writeFileSync } from 'node:fs'

const BOX = 10009001, CYL = 10009008
const C = {
  // 中性微暖灰阶（R≥G>B），禁纯白/近白/高饱和；每级压暗制造层次
  step1: 0xb6b4b2, step2: 0xaeacaa, step3: 0xa6a4a2, step4: 0x9e9c9a,
  upper: 0xa2a0a0, back: 0x9a9896, roof: 0xc2c0be, roofUnder: 0x8e8c8a,
  col: 0xaaa8a6, seat: 0x33506c, wall: 0xaaa8a6, mast: 0x9c9a98,
  panel: 0xc2c0be, pole: 0xbab8b6, red: 0xa84838, line: 0xd0d0d0
}
const items = []
const box = (position, scale, rgb, rotation = [0, 0, 0]) =>
  items.push({ resourceId: BOX, position, rotation, scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })
const cyl = (position, scale, rgb) =>
  items.push({ resourceId: CYL, position, rotation: [0, 0, 0], scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })

// ── 侧看台 ×2（A1/A2/A3/A4/A5）──
// 下层：4 级台阶（累计高 0.75k，级深 1.9，长度 112），逐级压暗 + 每级蓝坐席贴条
// 上层：2 级台阶 + 背墙（端面出层次）+ 顶棚（前缘厚边梁 + 下阴影板）+ 7 细柱（前缘内侧）
const LOWER_L = 112, UPPER_L = 92
for (const s of [1, -1]) {
  for (let k = 1; k <= 4; k++) {
    const shade = k === 1 ? C.step1 : k === 2 ? C.step2 : k === 3 ? C.step3 : C.step4
    box([0, 0.375 * k, s * (36.55 + 1.9 * k)], [LOWER_L, 0.75 * k, 1.9], shade)     // 下层台阶（实心体量）
    box([0, 0.75 * k + 0.04, s * (37.1 + 1.9 * k)], [LOWER_L, 0.08, 0.9], C.seat)   // 蓝坐席贴条
  }
  box([0, 3.4, s * 46.05], [UPPER_L, 0.8, 1.9], C.step3)                            // 上层第 1 级
  box([0, 3.84, s * 46.6], [UPPER_L, 0.08, 0.9], C.seat)                            // 上层坐席 1
  box([0, 4.2, s * 47.95], [UPPER_L, 0.8, 1.9], C.step4)                            // 上层第 2 级
  box([0, 4.64, s * 48.5], [UPPER_L, 0.08, 0.9], C.seat)                            // 上层坐席 2
  box([0, 5.05, s * 49.65], [UPPER_L, 0.9, 1.5], C.back)                            // 背墙（收顶）
  box([0, 5.84, s * 47.9], [UPPER_L - 1, 0.08, 5.7], C.roofUnder)                   // 顶棚下阴影板（AO 感）
  box([0, 6.05, s * 47.9], [UPPER_L, 0.3, 6.0], C.roof)                             // 顶棚薄板（前挑至 44.9）
  box([0, 5.85, s * 44.95], [UPPER_L, 0.5, 0.6], C.roof)                            // 前缘厚边梁
  for (let x = -42; x <= 42; x += 14) cyl([x, 4.85, s * 46.2], [0.3, 2.1, 0.3], C.col) // 前缘内侧细柱 ×7
}

// ── 两端开放：1m 矮围挡环 ──
box([0, 0.5, 37], [110, 1, 0.4], C.wall)
box([0, 0.5, -37], [110, 1, 0.4], C.wall)
box([55, 0.5, 0], [0.4, 1, 73.2], C.wall)
box([-55, 0.5, 0], [0.4, 1, 73.2], C.wall)

// ── 角旗 ×4（细杆 + 红三角）──
for (const sx of [1, -1]) for (const sz of [1, -1]) {
  cyl([sx * 52.5, 0.75, sz * 34], [0.08, 1.5, 0.08], C.pole)
  box([sx * 52.5 + sx * 0.32, 1.32, sz * 34], [0.55, 0.32, 0.06], C.red)
}

// ── 角弧 ×4（A7：角旗处 r=1m 四分之一圆弧，4 段小条近似；圆心=场角）──
for (const sx of [1, -1]) for (const sz of [1, -1]) {
  for (const deg of [15, 37.5, 60, 82.5]) {
    const t = (deg * Math.PI) / 180
    box([sx * (52.5 - Math.sin(t)), 0.02, sz * (34 - Math.cos(t))],
      [0.55, 0.02, 0.1], C.line, [0, sx * sz * deg, 0])
  }
}

// ── 灯塔 ×4（A6：z ±40 贴场角，18m 细杆 + 灯板朝场心）──
for (const [x, z, yaw] of [[58, 40, 225], [58, -40, 135], [-58, 40, 315], [-58, -40, 45]]) {
  cyl([x, 9, z], [0.5, 18, 0.5], C.mast)
  box([x, 18.8, z], [3.6, 2.4, 0.4], C.panel, [0, yaw, 0])
}

// ── 替补席 ×2（技术区：矮台阶 + 背墙 + 小平顶棚 + 双柱）──
for (const sx of [1, -1]) {
  box([sx * 12, 0.25, 38.3], [6, 0.5, 1.6], C.step2)
  box([sx * 12, 0.8, 39.2], [6, 1.6, 0.25], C.upper)
  box([sx * 12, 2.0, 38.6], [6.6, 0.18, 2.4], C.roof)
  cyl([sx * 12 - 2.7, 1.0, 39.2], [0.12, 2, 0.12], C.col)
  cyl([sx * 12 + 2.7, 1.0, 39.2], [0.12, 2, 0.12], C.col)
}

writeFileSync(new URL('./whitemodel.structure.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, items }, null, 1))
writeFileSync(new URL('./whitemodel-entities.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, entities: [
    { name: '白模_球场设施', id: 1077936146, definitionId: 1077936142, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  ] }, null, 1))
console.log(`白模 v2 items: ${items.length}`)
