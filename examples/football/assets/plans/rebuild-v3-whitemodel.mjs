// 票 25 场景批·白模配置（2026-10-12 定稿）：单 def 1077936142 + 单实体 1077936146
// aux 段：现图占用至 2909（A 批 def/inst/实体层），白模 def 2924-2983 / inst 3024-3083，实体层由 import 自动接续
import { readFileSync } from 'node:fs'

const count = JSON.parse(readFileSync(new URL('./whitemodel.structure.json', import.meta.url), 'utf8')).items.length

export default {
  assets: {
    staticAssemblies: [
      {
        name: '白模_球场设施',
        prefabId: 1077936142,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: count }, (_, i) => 1073742924 + i),
        instanceAuxiliaryIds: Array.from({ length: count }, (_, i) => 1073743024 + i),
        structureFile: './whitemodel.structure.json'
      }
    ]
  }
}
