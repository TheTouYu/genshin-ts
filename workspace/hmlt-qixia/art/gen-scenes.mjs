// 批量生成素材 SceneDocument JSON（画布=游戏内使用比例×4 超采样）
// 图形六类与游戏图元同源：ellipse/rectangle/triangle/four_point_star/five_point_star/ring
// x/y=中心；rotation 度 CCW；zIndex 底→顶
import { writeFileSync, mkdirSync } from 'node:fs'

const E = (type, x, y, width, height, color, opacity = 1, rotation = 0, name = '') =>
  ({ type, x, y, width, height, color, opacity, rotation, name, zIndex: 0 })

// 每素材：[canvasW, canvasH, elements[]]（zIndex 自动=数组序）
const ART = {
  // 玩家子弹/剑气系（暖金）
  changhong: [136, 36, [
    E('ellipse', 68, 18, 128, 12, '#F28C28', 0.35, 0, '外焰晕'),
    E('ellipse', 70, 18, 122, 8, '#FFB13D', 0.85, 0, '金焰层'),
    E('rectangle', 66, 18, 116, 5, '#FFE9C4', 0.92, 0, '主刃'),
    E('rectangle', 60, 18, 92, 2, '#FFFFFF', 0.98, 0, '刃心白线'),
    E('triangle', 128, 18, 16, 10, '#FFE9C4', 0.95, 90, '右锋尖'),
  ]],
  guanri: [216, 80, [
    E('ellipse', 108, 40, 208, 40, '#FF8C1A', 0.30, 0, '贯日外晕'),
    E('ellipse', 110, 40, 200, 26, '#FFB13D', 0.75, 0, '金焰宽带'),
    E('rectangle', 104, 40, 190, 12, '#FFE9C4', 0.92, 0, '主刃'),
    E('rectangle', 96, 40, 150, 5, '#FFFFFF', 0.98, 0, '刃心'),
    E('four_point_star', 30, 40, 26, 26, '#FFF7E0', 0.95, 0, '左柄星辉'),
    E('triangle', 204, 40, 22, 18, '#FFFFFF', 0.95, 90, '右锋尖'),
    E('ring', 108, 40, 60, 60, '#FFD98A', 0.30, 0, '剑气场环'),
  ]],
  // 机体（虹猫金/蓝兔冰蓝）
  hongmao: [120, 120, [
    E('ring', 60, 60, 116, 116, '#FFE9A8', 0.35, 0, '金环外场'),
    E('four_point_star', 60, 60, 96, 96, '#FFB13D', 0.95, 0, '主四芒'),
    E('four_point_star', 60, 60, 56, 56, '#FFF7E0', 0.95, 45, '内四芒转45°'),
    E('ellipse', 60, 60, 18, 18, '#FFFFFF', 0.98, 0, '核心白'),
  ]],
  lantu: [120, 104, [
    E('ellipse', 60, 52, 112, 96, '#9FE8FF', 0.45, 0, '冰蓝体'),
    E('ring', 60, 52, 84, 72, '#DFF6FF', 0.60, 0, '内环'),
    E('ellipse', 60, 52, 40, 34, '#FFFFFF', 0.92, 0, '核心白'),
    E('four_point_star', 60, 52, 20, 20, '#B3F0FF', 0.95, 0, '寒光星'),
  ]],
  wingA: [72, 56, [
    E('triangle', 22, 28, 36, 26, '#FFD98A', 0.95, 120, '左翼'),
    E('triangle', 50, 28, 36, 26, '#FFD98A', 0.95, 240, '右翼'),
    E('four_point_star', 36, 28, 20, 20, '#FFF7E0', 0.98, 0, '翼核星'),
  ]],
  wingB: [64, 64, [
    E('ring', 32, 32, 60, 60, '#B3F0FF', 0.55, 0, '冰珠环'),
    E('ellipse', 32, 32, 30, 30, '#E8FAFF', 0.95, 0, '珠体'),
    E('four_point_star', 32, 32, 14, 14, '#FFFFFF', 0.98, 0, '闪光'),
  ]],
  // 大招/特效
  huofeng: [208, 160, [
    E('ellipse', 104, 80, 190, 70, '#FF6A1A', 0.55, -12, '凤身'),
    E('triangle', 66, 44, 84, 52, '#FF8C1A', 0.90, 155, '上翅'),
    E('triangle', 66, 116, 84, 52, '#FF8C1A', 0.90, 205, '下翅'),
    E('triangle', 178, 80, 60, 26, '#FFB13D', 0.95, 270, '头颈前冲'),
    E('ellipse', 198, 80, 18, 18, '#FFF7E0', 0.98, 0, '头部亮'),
    E('five_point_star', 30, 80, 44, 44, '#FFD98A', 0.90, 0, '尾焰星'),
    E('triangle', 12, 80, 30, 14, '#FF8C1A', 0.70, 270, '尾焰尖'),
  ]],
  bingpoj: [160, 56, [
    E('ellipse', 80, 28, 152, 18, '#5AB8FF', 0.40, 0, '冰雾晕'),
    E('rectangle', 76, 28, 144, 8, '#9FE8FF', 0.90, 0, '冰刃'),
    E('rectangle', 70, 28, 112, 3, '#FFFFFF', 0.98, 0, '刃心白'),
    E('triangle', 150, 28, 14, 12, '#DFF6FF', 0.95, 90, '锋尖'),
    E('four_point_star', 24, 28, 16, 16, '#B3F0FF', 0.90, 0, '柄星'),
  ]],
  yinzhen: [80, 20, [
    E('rectangle', 36, 10, 56, 3, '#EBFAFF', 0.98, 0, '针身'),
    E('triangle', 70, 10, 12, 4, '#FFFFFF', 0.98, 90, '针尖'),
    E('ellipse', 12, 10, 12, 6, '#9FE8FF', 0.80, 0, '针尾冰辉'),
  ]],
  // 敌弹/状态（高频）
  szd: [36, 36, [
    E('ellipse', 18, 18, 34, 34, '#FF3C3C', 0.55, 0, '红弹体'),
    E('ellipse', 18, 18, 20, 20, '#FF9A3D', 0.90, 0, '橙心'),
    E('ellipse', 18, 18, 9, 9, '#FFE9C4', 0.98, 0, '亮核'),
  ]],
  szd2: [36, 36, [
    E('ellipse', 18, 18, 34, 34, '#E65AFF', 0.55, 0, '紫弹体'),
    E('ellipse', 18, 18, 20, 20, '#FF9A6D', 0.90, 0, '桃心'),
    E('ellipse', 18, 18, 9, 9, '#FFF0F5', 0.98, 0, '亮核'),
  ]],
  bingjing: [36, 36, [
    E('four_point_star', 18, 18, 32, 32, '#9FE8FF', 0.85, 0, '冰晶'),
    E('four_point_star', 18, 18, 16, 16, '#F0FDFF', 0.98, 45, '内核'),
  ]],
  dianran: [48, 60, [
    E('ellipse', 24, 30, 44, 50, '#FF6A1A', 0.30, 0, '火晕'),
    E('triangle', 24, 34, 36, 44, '#FF9A3D', 0.90, 180, '外焰'),
    E('triangle', 24, 38, 18, 26, '#FFE9C4', 0.95, 180, '焰心'),
  ]],
}

mkdirSync('art', { recursive: true })
for (const [name, [w, h, elems]] of Object.entries(ART)) {
  const doc = {
    canvas: { width: w, height: h, background: '#00000000' },
    elements: elems.map((e, i) => ({ ...e, id: `${name}_${i}`, zIndex: i })),
  }
  writeFileSync(`art/${name}.scene.json`, JSON.stringify(doc, null, 1))
  console.log(`${name}: ${w}x${h} ${elems.length} elems`)
}
console.log(`total ${Object.keys(ART).length}`)
