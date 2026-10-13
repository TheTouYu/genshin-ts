// ⚠️ 冻结（2026-10-13）：场景已由用户在编辑器手作（**实体层权威**），
// 禁止对地图 1073741827 重跑本生成器——会覆盖用户实体层编辑（root5 实体 aux）。
// 用户版快照：examples/football/assets/snapshots/1073741827-20261013-user-authored-scene-fcb563bb.gil
// 用户这轮手法（见日记 D223）：结构性部件留图元；自然物/器物替换为官方素材（逐个手挑品种+重校准比例）。
// 如需再改场景：先与用户确认改法（编辑器手摆 vs 先对齐 def 层再重写）。
// 票 25 场景批·景观层（2026-10-13 图片轮新增，B 类）：低多边形树丛/绿篱/道路/远处体量建筑
// 依据：生图参考图——外围草地丛植低多边形树、沿路绿篱、浅灰道路、远处白色体量建筑
// 独立 def（1077936148）+ 实体（1077936149），与白模 def 6142 解耦：改景观不动白模
// 全图元：10009001 长方体 + 10009008 圆柱 + 10009002 球（树冠），实体原点、世界坐标
import { writeFileSync } from 'node:fs'

const BOX = 10009001, CYL = 10009008, SPH = 10009002
const C = {
  crown: 0x6e7862,   // 树冠：哑光橄榄灰绿（与引擎草地同族、更暗）
  trunk: 0x8a8478,   // 树干：暖灰褐
  hedge: 0x707a66,   // 绿篱
  road: 0xb0aeac,    // 道路：浅灰（中性）
  build: 0xc0bebc    // 远处建筑体量：微亮中性灰（禁近白）
}
const items = []
const box = (position, scale, rgb, rotation = [0, 0, 0]) =>
  items.push({ resourceId: BOX, position, rotation, scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })
const cyl = (position, scale, rgb) =>
  items.push({ resourceId: CYL, position, rotation: [0, 0, 0], scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })
const sph = (position, scale, rgb) =>
  items.push({ resourceId: SPH, position, rotation: [0, 0, 0], scale, color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' } })
const tree = (x, z, h, r) => {           // 干（圆柱）+ 冠（球，略纵向拉伸）
  cyl([x, h / 2, z], [0.35, h, 0.35], C.trunk)
  sph([x, h + r * 0.42, z], [r, r * 1.15, r], C.crown)
}

// ── 树 ×24：四区丛植/行植（避开看台 |z| 37..51 与场地 |x|<56、|z|<37）──
const NE = [[62, 56], [70, 62], [58, 64], [74, 52], [66, 48], [56, 52]]         // 东北丛 6
const NW = [[-64, 58], [-72, 52], [-58, 64], [-76, 62], [-68, 46]]              // 西北丛 5
const SW = [[-66, -56], [-74, -62], [-60, -66], [-70, -48], [-56, -58]]         // 西南丛 5
const SE_ROW = [[30, -66], [40, -64], [50, -66], [60, -63], [70, -66]]          // 东南行植 5
const EAST = [[78, 18], [80, 2], [76, -14]]                                     // 东侧散植 3
for (const [i, [x, z]] of [...NE, ...NW, ...SW, ...SE_ROW, ...EAST].entries()) {
  const r = 3.2 + ((i * 7) % 5) * 0.35                                          // 冠幅 3.2..4.6 伪随机
  tree(x, z, 1.8 + ((i * 3) % 4) * 0.4, r)
}

// ── 绿篱 ×6：外围四边 + 两段近景矮篱 ──
box([0, 0.45, 80], [110, 0.9, 1.2], C.hedge)
box([0, 0.45, -80], [110, 0.9, 1.2], C.hedge)
box([80, 0.45, 0], [1.2, 0.9, 110], C.hedge)
box([-80, 0.45, 0], [1.2, 0.9, 110], C.hedge)
box([52, 0.45, 62], [40, 0.9, 1.2], C.hedge)
box([-40, 0.45, -72], [50, 0.9, 1.2], C.hedge)

// ── 道路 ×2：东侧纵向 + 南侧横向（浅灰薄板贴地）──
box([88, 0.05, 10], [6, 0.1, 130], C.road)
box([-20, 0.05, -88], [130, 0.1, 6], C.road)

// ── 远处建筑体量 ×2（白色方块，白模语言）──
box([98, 5, 60], [18, 10, 14], C.build)
box([-92, 6, -52], [22, 12, 16], C.build)

writeFileSync(new URL('./scenery3.structure.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, items }, null, 1))
writeFileSync(new URL('./scenery3-entities.json', import.meta.url),
  JSON.stringify({ schemaVersion: 1, entities: [
    { name: '景观_外围', id: 1077936149, definitionId: 1077936148, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
  ] }, null, 1))
console.log(`景观 items: ${items.length}`)
