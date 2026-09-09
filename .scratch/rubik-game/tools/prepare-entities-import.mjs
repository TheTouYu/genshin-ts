// prepare-entities-import.mjs — donor 实体导出 → 可导入 JSON（rubik-game 迁移用）
// 用法：node prepare-entities-import.mjs
// 输入：../assets/donor-entities.json（assets:entities export 产物，含 17 实体）
// 输出：../assets/entities-import.json（仅 6 个自定义实体；color 对象形→删除，绕过
//       导入侧 '#RRGGBB' 字符串校验的不对称；CLI 往返不对称 bug 另行记档）
// 保留：6201/6203/6230/6231/6260/6261（62xx 自定义段；模版实体 10863/10905/10947 段滤除，
//       新图 init 模板已自带，重复导入会冲突）
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const input = join(__dirname, '../assets/donor-entities.json')
const outPath = join(__dirname, '../assets/entities-import.json')
const donor = JSON.parse(readFileSync(input, 'utf8'))
const keep = donor.entities.filter((e) => e.id >= 1077936129 && e.id < 1077936300)
if (keep.length !== 6) {
  console.error(`expected 6 custom entities, got ${keep.length}`)
  process.exit(1)
}
for (const e of keep) {
  if (e.color && e.color.enabled === false) delete e.color
  if (e.color && typeof e.color !== 'string') {
    console.error(`entity ${e.id} has enabled color object — needs manual conversion`)
    process.exit(1)
  }
}
writeFileSync(outPath, JSON.stringify({ entities: keep, schemaVersion: 1 }, null, 2))
console.log('written', outPath, 'entities', keep.length)
