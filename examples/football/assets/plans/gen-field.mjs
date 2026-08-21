// 足球场白线生成器（FIFA 标准 105×68m，1:1 不缩放；默认草地已有，只画线）
// 坐标：Y 向上、XZ 地面；线厚 0.02 半埋贴地（中心 y=0.01）
// 线宽 0.12m（FIFA 线宽 12cm）；颜色用已验收浅灰白 0xD0D0D0（防刺眼）
// 弧线段旋转（2026-08-21 用户修正闭合）：长方体局部 X 轴经 Ry(rotY) 后
// 应为圆弧切线方向。切线 = dP/dθ = (-sinθ, 0, cosθ)（逆时针圆），
// 由 (cos rotY, 0, -sin rotY) = (-sinθ, 0, cosθ) 得 rotY = atan2(-cosθ, -sinθ)。
// 旧公式「段中心角+90°」是切线的 z 镜像（绕 X 翻转），表现为“自旋不对”。
import { writeFileSync } from 'node:fs'

const LINE_W = 0.12 // 线宽（m）
const LINE_T = 0.02 // 线厚（m，半埋贴地）
const Y = 0.01 // 线中心高度（= 半厚，底面贴地）
const COLOR = { enabled: true, rgb: 0xd0d0d0, opacity: 100, overlay: 'overwrite' }

// 圆弧切线段：给定圆上两角 a0/a1（弧度），返回段中心位置与绕 Y 旋转角（度）
// 圆参数 P(θ) = (cx0 + R·cosθ, Y, cz0 + R·sinθ)，切线方向 = (-sinθ, 0, cosθ)
function arcSegment(cx0, cz0, R, a0, a1) {
  const cx = cx0 + (R * (Math.cos(a0) + Math.cos(a1))) / 2
  const cz = cz0 + (R * (Math.sin(a0) + Math.sin(a1))) / 2
  const len = Math.hypot(R * Math.cos(a1) - R * Math.cos(a0), R * Math.sin(a1) - R * Math.sin(a0))
  // 段中心角
  const th = (a0 + a1) / 2
  // rotY = atan2(-cosθ, -sinθ)：局部 X → 世界切线方向
  const rotY = (Math.atan2(-Math.cos(th), -Math.sin(th)) * 180) / Math.PI
  return { pos: [cx, Y, cz], rotY, len }
}

// 场地半长/半宽
const HALF_LEN = 52.5 // 长 105
const HALF_WID = 34 // 宽 68

// 禁区（罚球区）：深 16.5、宽 40.32（门柱两侧各 16.5）
const PA_DEPTH = 16.5
const PA_HALF_W = 20.16
// 球门区（小禁区）：深 5.5、宽 18.32（门柱两侧各 5.5）
const GA_DEPTH = 5.5
const GA_HALF_W = 9.16
// 罚球点距底线 11
const PEN_SPOT = 11
// 中圈/罚球弧半径 9.15
const R = 9.15

const items = []

// 长方体线：position/rotation/scale（长轴沿 X 或 Z，绕 Y 旋转）
function addBox(pos, rotY, scale) {
  items.push({ resourceId: 10009001, position: pos, rotation: [0, rotY, 0], scale, color: COLOR })
}

// 沿 X 的长线（scale=[长, 厚, 宽]）
const lineX = (x, z, len) => addBox([x, Y, z], 0, [len, LINE_T, LINE_W])
// 沿 Z 的长线（scale=[宽, 厚, 长]）
const lineZ = (x, z, len) => addBox([x, Y, z], 0, [LINE_W, LINE_T, len])

// ---- 外框：边线（长边）2 条 + 底线（短边）2 条 ----
lineX(0, -HALF_WID, 105)
lineX(0, HALF_WID, 105)
lineZ(-HALF_LEN, 0, 68)
lineZ(HALF_LEN, 0, 68)

// ---- 中线 ----
lineZ(0, 0, 68)

// ---- 中圈：N 段折线逼近圆 ----
const CIRCLE_SEGS = 32
for (let i = 0; i < CIRCLE_SEGS; i++) {
  const a0 = (i / CIRCLE_SEGS) * Math.PI * 2
  const a1 = ((i + 1) / CIRCLE_SEGS) * Math.PI * 2
  const seg = arcSegment(0, 0, R, a0, a1)
  addBox(seg.pos, seg.rotY, [seg.len, LINE_T, LINE_W])
}
// 中圈中心点（开球点）
addBox([0, Y, 0], 0, [0.3, LINE_T, 0.3])

// ---- 每侧：禁区（3 条线）+ 小禁区（3 条线）+ 罚球点 + 罚球弧 ----
for (const side of [-1, 1]) {
  const baseX = side * HALF_LEN
  // 禁区线（平行底线）
  lineZ(side * (HALF_LEN - PA_DEPTH), 0, PA_HALF_W * 2)
  // 禁区两侧线（垂直底线）
  lineX(side * (HALF_LEN - PA_DEPTH / 2), -PA_HALF_W, PA_DEPTH)
  lineX(side * (HALF_LEN - PA_DEPTH / 2), PA_HALF_W, PA_DEPTH)
  // 小禁区线（平行底线）
  lineZ(side * (HALF_LEN - GA_DEPTH), 0, GA_HALF_W * 2)
  // 小禁区两侧线
  lineX(side * (HALF_LEN - GA_DEPTH / 2), -GA_HALF_W, GA_DEPTH)
  lineX(side * (HALF_LEN - GA_DEPTH / 2), GA_HALF_W, GA_DEPTH)
  // 罚球点（距底线 11m，直径 0.3 方块）
  addBox([side * (HALF_LEN - PEN_SPOT), Y, 0], 0, [0.3, LINE_T, 0.3])
  // 罚球弧：以罚球点为圆心、半径 9.15，凸向场内，画到禁区横线交点为止（不是半圆！）
  // 几何（2026-08-21 用户反馈闭合）：
  //   罚球点 x = ±(52.5-11) = ±41.5，禁区横线 x = ±(52.5-16.5) = ±36
  //   交点：|41.5-36| = 5.5 → cosθ = 5.5/9.15 → θ_max = arccos(5.5/9.15) ≈ 53.06°
  //   注意 |PA_DEPTH - PEN_SPOT| = |16.5-11| = 5.5（必须取绝对值，否则 acos 得 126.94°）
  //   弧参数 P(θ) = (spotX - side·R·cosθ, 0, R·sinθ)，θ ∈ [-θ_max, +θ_max]
  //   端点恰落在禁区横线上，不穿过（组件端面与横线贴合，视觉美观）
  // 切线 = dP/dθ ∝ (side·sinθ, 0, cosθ)；由 (cos rotY, -sin rotY) = (side·sinθ, cosθ)
  // 得 rotY = atan2(-cosθ, side·sinθ)
  const spotX = side * (HALF_LEN - PEN_SPOT)
  const thetaMax = Math.acos(Math.abs(PEN_SPOT - PA_DEPTH) / R) // ≈ 53.06°（弧度）
  const ARC_SEGS = 16
  for (let i = 0; i < ARC_SEGS; i++) {
    const t0 = -thetaMax + (i / ARC_SEGS) * 2 * thetaMax
    const t1 = -thetaMax + ((i + 1) / ARC_SEGS) * 2 * thetaMax
    const tm = (t0 + t1) / 2
    const x0 = spotX - side * R * Math.cos(t0)
    const z0 = R * Math.sin(t0)
    const x1 = spotX - side * R * Math.cos(t1)
    const z1 = R * Math.sin(t1)
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const len = Math.hypot(x1 - x0, z1 - z0)
    const rotY = (Math.atan2(-Math.cos(tm), side * Math.sin(tm)) * 180) / Math.PI
    addBox([cx, Y, cz], rotY, [len, LINE_T, LINE_W])
  }
}

// 角球区小弧（四角，半径 1m 的四分之一圆）——先不做，第一版从简

const out = { schemaVersion: 1, items }
writeFileSync(new URL('./field.structure.json', import.meta.url), JSON.stringify(out, null, 1))
console.log('field items:', items.length)

// 自检
const xs = items.map((i) => i.position[0])
const zs = items.map((i) => i.position[2])
console.log('x range:', Math.min(...xs).toFixed(2), '..', Math.max(...xs).toFixed(2))
console.log('z range:', Math.min(...zs).toFixed(2), '..', Math.max(...zs).toFixed(2))
