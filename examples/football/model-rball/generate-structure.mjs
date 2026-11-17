// 渲染足球 v3 轻量模型结构生成（2026-11-18，票 27 装饰物减重路线）
// 形态：1 个球体主体（10009002）+ 12 个小球体点缀（10009002）贴在
// 二十面体 12 顶点方向（= 截角二十面体 12 个五边形中心位，真足球 pentagon 感）。
// 尺寸口径：item 空间球 R=1.0（主体 scale 2 = 直径 2），场景实体 scale 0.25
// → 最终球 R=0.25m（直径 0.5m，与 GROUND_Y_MIN=0.25 球心静止高度一致）。
// 配色铁律（examples/AGENTS.md 三节）：无纯白/近白/纯饱和——
//   主体 0xB8C0C8（v2 已验收米灰白），点缀 0x3A5F8A（降饱和藏青）。
// 宿主 10005018（1×1×1 不可见立方体）× 场景 0.25 = 0.25m，半对角 0.216 < 球 R 0.25，
// 不与表面点缀重叠（闪烁规避，见 calibration-and-geometry.md 资源表）。
import { writeFileSync } from 'node:fs'

const PHI = (1 + Math.sqrt(5)) / 2
// 二十面体 12 顶点（未归一化）
const raw = [
  [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
  [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]
]
const dir = raw.map(([x, y, z]) => {
  const len = Math.sqrt(x * x + y * y + z * z)
  return [x / len, y / len, z / len]
})

const PATCH_CENTER_DIST = 0.85 // item 空间点缀球心距（R=1.0 表面内嵌 0.15）
const PATCH_SCALE = 0.7        // item 空间点缀球直径 0.7（R=0.35→最终 R=0.0875m，Ø17.5cm/50cm 球）
const BODY_SCALE = 2.0         // 主体直径 2（item 空间）

const BODY_RGB = 0xb8c0c8 // 12107976 米灰白（v2 用户验收值）
const PATCH_RGB = 0x3a5f8a // 3825546 降饱和藏青

const items = [
  {
    resourceId: 10009002,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [BODY_SCALE, BODY_SCALE, BODY_SCALE],
    color: { enabled: true, rgb: BODY_RGB, opacity: 100, overlay: 'overwrite' }
  },
  ...dir.map(([x, y, z]) => ({
    resourceId: 10009002,
    position: [x * PATCH_CENTER_DIST, y * PATCH_CENTER_DIST, z * PATCH_CENTER_DIST],
    rotation: [0, 0, 0],
    scale: [PATCH_SCALE, PATCH_SCALE, PATCH_SCALE],
    color: { enabled: true, rgb: PATCH_RGB, opacity: 100, overlay: 'overwrite' }
  }))
]

writeFileSync(
  new URL('./rball.structure.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, items }, null, 1)
)
console.log(`items=${items.length} (1 body + ${dir.length} patches)`)
