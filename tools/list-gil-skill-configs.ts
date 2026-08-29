// 只读工具：列出地图 GIL 中的技能配置资产（root15 记录，f2 ∈ {36,6,28}）
// 用法：npx tsx tools/list-gil-skill-configs.ts <map.gil>
// 独立回读入口（与 gsts assets:skill-config list 同解析逻辑，便于候选验证）
import { readGilPayloadFields } from '../src/cli/gil_extract_utils.js'
import { listSkillConfigs } from '../src/cli/assets_skill_config.js'

const [gilPath] = process.argv.slice(2)
if (!gilPath) {
  console.error('Usage: npx tsx tools/list-gil-skill-configs.ts <map.gil>')
  process.exit(1)
}

const { payload } = readGilPayloadFields(gilPath)
const configs = listSkillConfigs(payload)
console.log(JSON.stringify({ gilPath, skillConfigs: configs }, null, 2))
