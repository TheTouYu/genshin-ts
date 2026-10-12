// 票 25-A+ 场景批配置（嘉年华风格 A，2026-10-12，地图 1073741827）
// 4 个新 def（6142-6145）+ 6 个实体（6146-6151，见 rebuild-v3-scenery-entities.json）。
// aux 段基于现图实测（enum-aux-ids.ts）：A 批 def/inst 占 1830-2541，实体层自动物化占 2542-2909
// （84+142+142=368 条，root27 共 820 对账吻合）。场景批从 2924 起留空隙：
// 内圈 def 2924/inst 3024，侧看台 3104/3137，端看台 3170/3184，景观 3198/3276；
// 实体层 aux（80+33×2+14×2+78=252 条）由 import 自动接在 max 之后（≤3353+252 仍在空闲带）。
import { readFileSync } from 'node:fs'

const read = (file) => JSON.parse(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))
const count = (file) => read(file).items.length
const entitiesJson = read('rebuild-v3-scenery-entities.json').entities
// def 预览位（root8）取各 def 首个实体的摆位：内圈/景观=原点，看台类=北侧/东侧形态
const previewOf = { 1077936142: 0, 1077936143: 1, 1077936144: 3, 1077936145: 5 }

const defs = [
  { name: '嘉年华_内圈围挡', prefabId: 1077936142, file: 'scenery-inner.structure.json', def: 1073742924, inst: 1073743024 },
  { name: '嘉年华_侧看台', prefabId: 1077936143, file: 'scenery-stand-side.structure.json', def: 1073743104, inst: 1073743137 },
  { name: '嘉年华_端看台', prefabId: 1077936144, file: 'scenery-stand-end.structure.json', def: 1073743170, inst: 1073743184 },
  { name: '嘉年华_景观带', prefabId: 1077936145, file: 'scenery-landscape.structure.json', def: 1073743198, inst: 1073743276 }
]

export default {
  assets: {
    staticAssemblies: defs.map((d) => {
      const e = entitiesJson[previewOf[d.prefabId]]
      return {
        name: d.name,
        prefabId: d.prefabId,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: e.position,
        rotation: e.rotation,
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: count(d.file) }, (_, i) => d.def + i),
        instanceAuxiliaryIds: Array.from({ length: count(d.file) }, (_, i) => d.inst + i),
        structureFile: `./${d.file}`
      }
    })
  }
}
