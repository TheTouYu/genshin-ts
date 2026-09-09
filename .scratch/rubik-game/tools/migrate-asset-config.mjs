// migrate-asset-config.mjs — donor 1899 assemblies → 1920 asset-config（ID 保留变换）
// 用法：node migrate-asset-config.mjs
// 输入：.scratch/rubik-game/assets/donor-assemblies.json（assets:static-assemblies export 产物）
// 输出：.scratch/rubik-game/assets/migration-asset-config.mjs
// 规则：
//   - prefabId 原样保留（donor 62xx 段；GIA createPrefab 与实体 definitionId 引用此段）
//   - 模板统一官方 10009001 长方体（donor export 的 templatePrefabId 是自定义件自引用，新图无此件）
//   - body/items/components 全量取 donor 现状（用户已核验态，不重推导；export 无 body color 字段，
//     按 v2 已知观感补 0x303030 深色主体）
//   - aux id 从 1073741941 起顺序分配（沿用 donor 谱系惯例：避开控制器 1938/1939 段
//     与图占位 1825..1834 段；donor 自身即 graphs 1830..1840 + aux 1941+ 共存布局）
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const input = join(__dirname, '../assets/donor-assemblies.json')
const outPath = join(__dirname, '../assets/migration-asset-config.mjs')
const donor = JSON.parse(readFileSync(input, 'utf8'))
const all = donor.assemblies || []
if (all.length !== 27) {
  console.error(`expected 27 assemblies, got ${all.length}`)
  process.exit(1)
}
let nextAux = 1073741941
const assemblies = all.map((a) => {
  const count = a.items.length
  const definitionAuxiliaryIds = []
  const instanceAuxiliaryIds = []
  for (let i = 0; i < count; i++) definitionAuxiliaryIds.push(nextAux++)
  for (let i = 0; i < count; i++) instanceAuxiliaryIds.push(nextAux++)
  return {
    name: a.name,
    prefabId: a.prefabId,
    templatePrefabId: 10009001,
    templateInstanceId: 10009001,
    templateName: '长方体',
    position: a.position,
    rotation: a.rotation,
    scale: a.scale,
    color: { enabled: true, rgb: 0x303030, opacity: 100, overlay: 'overwrite' },
    definitionAuxiliaryIds,
    instanceAuxiliaryIds,
    components: a.components,
    items: a.items,
  }
})
const body = `// rubik-game 迁移 asset-config（donor 1899 export → ID 保留变换；生成：tools/migrate-asset-config.mjs 勿手改）
export default {
  assets: {
    staticAssemblies: ${JSON.stringify(assemblies, null, 2)}
  }
}
`
writeFileSync(outPath, body)
console.log('written', outPath, 'assemblies', assemblies.length, 'lastAux', nextAux - 1)
