// gen-asset-config.mjs — 从 donor 地图的 static-assemblies export 生成 3×3 元件 asset-config
//
// 用法：
//   node ./bin/gsts.mjs assets:static-assemblies export --map-id 1073741849 --format json > /tmp/3x3-donor-export.json
//   node examples/rubik-3x3/tools/gen-asset-config.mjs /tmp/3x3-donor-export.json
//
// 输出：examples/rubik-3x3/assets/plans/asset-config.mjs
// 只提取「星枢3x3块_*」26 个元件；组件替换为 basicMotion(default)，
// 并分配新的 definition/instance aux ID（从 1073741830 起，避开骨架占位 1073741828/1829）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const input = process.argv[2]
if (!input) {
  console.error('usage: node gen-asset-config.mjs <donor-export.json>')
  process.exit(1)
}
const donor = JSON.parse(readFileSync(input, 'utf8'))
const all = donor.assemblies || []
const cubies = all.filter((a) => /^星枢3x3块_/.test(a.name || ''))
if (cubies.length !== 26) {
  console.error(`expected 26 cubies, got ${cubies.length}`)
  process.exit(1)
}
// 按 prefabId 升序稳定输出
cubies.sort((a, b) => a.prefabId - b.prefabId)

// 2×2 风格：每个块主体 0.965（留缝 0.035），贴片 0.9/厚 0.025，外贴偏移 0.52
const BODY_SCALE = [0.965, 0.965, 0.965]
const STICKER_OFFSET = 0.52
const STICKER_SIZE = 0.9
const STICKER_THICKNESS = 0.025

function transformItem(item) {
  const pos = item.position || [0, 0, 0]
  let axis = 0
  let sign = 1
  for (let i = 0; i < 3; i++) {
    if (Math.abs(pos[i]) > 0.1) { axis = i; sign = Math.sign(pos[i]); break }
  }
  const p = [0, 0, 0]
  p[axis] = sign * STICKER_OFFSET
  const scale = [STICKER_SIZE, STICKER_SIZE, STICKER_SIZE]
  scale[axis] = STICKER_THICKNESS
  return {
    resourceId: item.resourceId,
    position: p,
    rotation: [0, 0, 0],
    scale,
    color: item.color
  }
}

let nextPrefabId = 1077936204
let nextAux = 1073741941
const assemblies = cubies.map((a) => {
  const count = a.items.length
  const definitionAuxiliaryIds = []
  const instanceAuxiliaryIds = []
  for (let i = 0; i < count; i++) definitionAuxiliaryIds.push(nextAux++)
  for (let i = 0; i < count; i++) instanceAuxiliaryIds.push(nextAux++)
  // donor 的 templatePrefabId 是它自己的自定义 prefab；重建到新图时统一改用官方
  // 10009001（长方体）作模板，items 按 2×2 风格重排。
  const TEMPLATE = { templatePrefabId: 10009001, templateInstanceId: 10009001, templateName: '长方体' }
  const newName = '星枢3x3块_v2_' + a.name.replace('星枢3x3块_', '')
  return {
    name: newName,
    prefabId: nextPrefabId++,
    ...TEMPLATE,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: BODY_SCALE,
    color: { enabled: true, rgb: 0x303030, opacity: 100, overlay: 'overwrite' },
    definitionAuxiliaryIds,
    instanceAuxiliaryIds,
    components: [{ type: 'basicMotion', preset: 'default' }],
    items: a.items.map(transformItem)
  }
})

const outDir = join(__dirname, '../assets/plans')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'asset-config.mjs')
const body = `// 3×3 魔方 26 个块元件（由 donor 1073741849 export 生成，组件已替换为 basicMotion）
// 生成：tools/gen-asset-config.mjs —— 勿手改
export default {
  assets: {
    staticAssemblies: ${JSON.stringify(assemblies, null, 2)}
  }
}
`
writeFileSync(outPath, body)
console.log('written', outPath, 'assemblies', assemblies.length, 'lastAux', nextAux - 1)
