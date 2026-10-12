// 票 25 场景批·白模（2026-10-12 定稿）：经典英式小球场型制
// 参照：Wikipedia Stadium（小场两端无看台=经典型制；Highbury 1936 双层看台；Bramall Lane 1878 角塔泛光灯）
// 全图元（10009001 长方体 + 10009008 圆柱），世界坐标单 def，实体置于原点
import { writeFileSync } from 'node:fs'

const BOX = 10009001, CYL = 10009008
const C = {
  // 配色锚定 donor 已过审值（球门 0xb8c0c8/0xa8beb4，场线 0xD0D0D0）——带色偏中灰，
  // 禁纯白/近白（魔方轮教训：0xE8E8E8 即刺眼）；点缀降饱和
  step1: 0xb0b8c0, step2: 0xaab2ba, step3: 0xa4acb4,  // 下层台阶逐级压暗（深度层次）
  upper: 0x9aa4ac, roof: 0xc4ccd2, col: 0xa8b0b8, seat: 0x3a5f8a,
  wall: 0xa8b0b6, mast: 0x9aa2aa, panel: 0xc0c8ce, pole: 0xb8b8b8, red: 0xa84838
}
const items = []
const box = (position, scale, rgb, rotation = [0, 0, 0]) =>
  items.push({ resourceId: BOX, position, rotation, scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })
const cyl = (position, scale, rgb) =>
  items.push({ resourceId: CYL, position, rotation: [0, 0, 0], scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })

// ── 侧看台 ×2（Highbury 双层：下层 3 级台阶 + 上层收窄 + 薄板顶棚悬挑）──
for (const s of [1, -1]) {
  for (let k = 1; k <= 3; k++) {
    box([0, k / 2, s * (38.75 + 2.5 * k)], [100, k, 2.5], k === 1 ? C.step1 : k === 2 ? C.step2 : C.step3)          // 下层台阶（实心体量）
    box([0, k + 0.04, s * (39.5 + 2.5 * k)], [100, 0.08, 0.9], C.seat)    // 蓝坐席贴条
  }
  box([0, 4.25, s * 48.75], [80, 2.5, 2.5], C.upper)                       // 上层
  box([0, 5.54, s * 48.2], [80, 0.08, 0.9], C.seat)                        // 上层坐席
  box([0, 6.05, s * 48.25], [80, 0.3, 5.5], C.roof)                        // 顶棚薄板（前挑）
  for (let x = -40; x <= 40; x += 16) cyl([x, 3.03, s * 50.75], [0.35, 6.05, 0.35], C.col) // 顶棚柱×6
}

// ── 两端开放：1m 矮围挡环（灰白一体化）──
box([0, 0.5, 37], [110, 1, 0.4], C.wall)
box([0, 0.5, -37], [110, 1, 0.4], C.wall)
box([55, 0.5, 0], [0.4, 1, 73.2], C.wall)
box([-55, 0.5, 0], [0.4, 1, 73.2], C.wall)

// ── 角旗 ×4（细杆+红三角，图元拼装同球门做法）──
for (const sx of [1, -1]) for (const sz of [1, -1]) {
  cyl([sx * 52.5, 0.75, sz * 34], [0.08, 1.5, 0.08], C.pole)
  box([sx * 52.5 + sx * 0.32, 1.32, sz * 34], [0.55, 0.32, 0.06], C.red)
}

// ── 灯塔 ×4（Bramall Lane 角塔式：18m 细杆+灯板朝场心）──
for (const [x, z, yaw] of [[58, 52, 225], [58, -52, 135], [-58, 52, 315], [-58, -52, 45]]) {
  cyl([x, 9, z], [0.5, 18, 0.5], C.mast)
  box([x, 18.8, z], [3.6, 2.4, 0.4], C.panel, [0, yaw, 0])
}

// ── 替补席 ×2（技术区：矮台阶+背墙+小平顶棚+双柱）──
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
console.log(`白模 items: ${items.length}`)
