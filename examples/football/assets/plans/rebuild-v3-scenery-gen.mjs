// 票 25-A+ 场景批（嘉年华风格 A）生成器（2026-10-12，地图 1073741827「真实足球v3」）
// 产出 4 个 structure JSON（内圈/侧看台/端看台/景观带）+ 实体 JSON。
// 约定：官方装饰件 color.enabled=false（保原生贴图）；图元围挡（10009001）上色。
// pivot 假设：所有件按包围盒中心（与 A 批图元一致）——首轮目视=校准轮，错则整体 y 平移重生成。
import { writeFileSync } from 'node:fs'

const OFF = { enabled: false }  // schema: disabled 时仅此一个键（static_assembly_structure.ts color()）
const WHITE = 0xf5f5f5, BLUE = 0x3d7bff, RED = 0xe04040
const box = (position, scale, rgb) => ({
  resourceId: 10009001, position, rotation: [0, 0, 0], scale,
  color: { enabled: true, rgb, opacity: 100, overlay: 'overwrite' }
})
const gad = (resourceId, position, rotation = [0, 0, 0]) => ({
  resourceId, position, rotation, scale: [1, 1, 1], color: OFF
})

// ── 1 内圈围挡（世界坐标，80 aux）：角旗4 + 广告围挡70 + 替补席6 ──
const inner = []
for (const [x, z] of [[-52.5, -34], [52.5, -34], [-52.5, 34], [52.5, 34]])
  inner.push(gad(1000159, [x, 1.25, z]))                       // 角旗 0.5×2.5
for (let k = 0; k < 22; k++) {
  const x = -52.5 + k * 5
  inner.push(box([x, 0.45, 36.5], [4.4, 0.9, 0.15], k % 2 ? WHITE : BLUE))
  inner.push(box([x, 0.45, -36.5], [4.4, 0.9, 0.15], k % 2 ? WHITE : BLUE))
}
for (let k = 0; k < 13; k++) {
  const z = -30 + k * 5
  inner.push(box([55, 0.45, z], [0.15, 0.9, 4.4], k % 2 ? WHITE : BLUE))
  inner.push(box([-55, 0.45, z], [0.15, 0.9, 4.4], k % 2 ? WHITE : BLUE))
}
for (const s of [-1, 1]) {
  inner.push(gad(1000770, [s * 10, 0.5, 38]))                  // 替补长椅
  inner.push(gad(1000770, [s * 14, 0.5, 38]))
  inner.push(gad(1000695, [s * 12, 2.5, 41]))                  // 替补帐篷 6.5×5×7
}

// ── 2 侧看台（def 局部坐标，33 aux）：平台8 + 长椅16 + 台阶2 + 帐篷3 + 高旗4 ──
// 实体北 (0,0,45) rot0 / 南 (0,0,-45) rot180；局部 +z = 远离球场
const side = []
for (let k = 0; k < 8; k++) {
  const x = -43.75 + k * 12.5
  side.push(gad(1000027, [x, 1, 2]))                           // 矩形平台 12.5×2×4
  side.push(gad(1000770, [x, 2.5, 1.5]))
  side.push(gad(1000770, [x, 2.5, 3.0]))
}
side.push(gad(1000025, [-50, 0.75, 2.5]))                      // 木台阶 2.5×1.5×5
side.push(gad(1000025, [50, 0.75, 2.5]))
for (const x of [-30, 0, 30]) side.push(gad(1000646, [x, 2, 7.5]))  // 帐篷组件 8×4×7
for (const x of [-47, -20, 20, 47]) side.push(gad(1000140, [x, 3.75, 6.5]))  // 高旗 7.5

// ── 3 端看台（def 局部坐标，14 aux）：平台5 + 长椅5 + 台阶2 + 高旗2 ──
// 实体东 (58.5,0,0) rot90 / 西 (-58.5,0,0) rot-90
const end = []
for (let k = 0; k < 5; k++) {
  const x = -31.25 + k * 12.5
  end.push(gad(1000027, [x, 1, 2]))
  end.push(gad(1000770, [x, 2.5, 2]))
}
end.push(gad(1000025, [-34.5, 0.75, 2.5]))
end.push(gad(1000025, [34.5, 0.75, 2.5]))
end.push(gad(1000140, [-34.5, 3.75, 6.5]))
end.push(gad(1000140, [34.5, 3.75, 6.5]))

// ── 4 景观带（世界坐标，78 aux）：树32 + 灌木12 + 花丛8 + 草丛4 + 岩石4 + 拱门2 + 圆平台2 + 高旗4 + 指示牌2 + 路灯8 ──
const land = []
for (let k = 0; k < 9; k++) {
  land.push(gad(1001539, [-64 + k * 16, 8.25, 64]))            // 树木枝杈 12.5×16.5×10
  land.push(gad(1001539, [-64 + k * 16, 8.25, -64]))
}
for (let k = 0; k < 7; k++) {
  land.push(gad(1001539, [64, 8.25, -48 + k * 16]))
  land.push(gad(1001539, [-64, 8.25, -48 + k * 16]))
}
for (const [x, z] of [[-20, 54], [20, 54], [-40, 54], [40, 54], [-10, 58], [10, 58], [-30, 58], [30, 58],
  [60, 20], [60, -20], [-60, 20], [-60, -20]])
  land.push(gad(1000186, [x, 0.75, z]))                        // 灌木 2.5×1.5×2
for (const [x, z] of [[50, 50], [70, 66], [-50, -50], [-70, -66], [30, 52], [-30, 52], [30, -52], [-30, -52]])
  land.push(gad(1000183, [x, 0.75, z]))                        // 花丛 3.5×1.5×6
for (const [x, z] of [[64, 24], [64, -24], [-64, 24], [-64, -24]])
  land.push(gad(1001505, [x, 2.5, z]))                         // 草丛 5.5×5×1.5
for (const [x, z] of [[70, 70], [70, -70], [-70, 70], [-70, -70]])
  land.push(gad(1000037, [x, 3.25, z]))                        // 岩石平台 5×6.5×5
land.push(gad(1000221, [60, 5.75, 58], [0, 45, 0]))            // 石质栅栏门拱门
land.push(gad(1000221, [-60, 5.75, -58], [0, 225, 0]))
land.push(gad(1000026, [60, 0.75, 58], [0, 45, 0]))            // 圆形平台 17×1.5×17
land.push(gad(1000026, [-60, 0.75, -58], [0, 45, 0]))
for (const [x, z] of [[53, 51], [67, 65], [-53, -51], [-67, -65]])
  land.push(gad(1000140, [x, 3.75, z]))                        // 高旗 7.5
land.push(gad(1000687, [50, 1.75, 48], [0, -45, 0]))           // 木质指示牌
land.push(gad(1000687, [-50, 1.75, -48], [0, 135, 0]))
for (const [x, z] of [[44, 56], [-44, 56], [44, -56], [-44, -56], [70, 46], [70, -46], [-70, 46], [-70, -46]])
  land.push(gad(1000015, [x, 1.5, z]))                         // 石质路灯 1×3×1

// ── 5 实体 ──
const entities = { schemaVersion: 1, entities: [
  { name: '嘉年华_内圈围挡', id: 1077936146, definitionId: 1077936142, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { name: '侧看台_北', id: 1077936147, definitionId: 1077936143, position: [0, 0, 45], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { name: '侧看台_南', id: 1077936148, definitionId: 1077936143, position: [0, 0, -45], rotation: [0, 180, 0], scale: [1, 1, 1] },
  { name: '端看台_东', id: 1077936149, definitionId: 1077936144, position: [58.5, 0, 0], rotation: [0, 90, 0], scale: [1, 1, 1] },
  { name: '端看台_西', id: 1077936150, definitionId: 1077936144, position: [-58.5, 0, 0], rotation: [0, -90, 0], scale: [1, 1, 1] },
  { name: '嘉年华_景观带', id: 1077936151, definitionId: 1077936145, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
] }

const dump = (name, items) => {
  writeFileSync(new URL(`./scenery-${name}.structure.json`, import.meta.url),
    JSON.stringify({ schemaVersion: 1, items }, null, 1))
  console.log(`scenery-${name}: ${items.length} items`)
}
dump('inner', inner); dump('stand-side', side); dump('stand-end', end); dump('landscape', land)
writeFileSync(new URL('./rebuild-v3-scenery-entities.json', import.meta.url),
  JSON.stringify(entities, null, 1))
console.log(`entities: ${entities.entities.length}`)
