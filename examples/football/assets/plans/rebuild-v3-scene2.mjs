// ⚠️ 冻结（2026-10-13）：场景已由用户在编辑器手作（**实体层权威**），
// 禁止对地图 1073741827 重跑本生成器——会覆盖用户实体层编辑（root5 实体 aux）。
// 用户版快照：examples/football/assets/snapshots/1073741827-20261013-user-authored-scene-fcb563bb.gil
// 用户这轮手法（见日记 D223）：结构性部件留图元；自然物/器物替换为官方素材（逐个手挑品种+重校准比例）。
// 如需再改场景：先与用户确认改法（编辑器手摆 vs 先对齐 def 层再重写）。
// 票 25 场景批 v2 配置（2026-10-13 图片轮）：白模 def 1077936142（v2，92 图元）+ 景观 def 1077936148（58 图元）
// aux 段：现图占用至 2909（A 批 def/inst/实体层）→
//   白模 def 2924-3015 / inst 3024-3115；景观 def 3140-3197 / inst 3220-3277
// 实体层（6146 白模 / 6149 景观）由 assets:entities import 接续
import { readFileSync } from 'node:fs'

const wmCount = JSON.parse(readFileSync(new URL('./whitemodel.structure.json', import.meta.url), 'utf8')).items.length
const scCount = JSON.parse(readFileSync(new URL('./scenery3.structure.json', import.meta.url), 'utf8')).items.length

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
        definitionAuxiliaryIds: Array.from({ length: wmCount }, (_, i) => 1073742924 + i),
        instanceAuxiliaryIds: Array.from({ length: wmCount }, (_, i) => 1073743024 + i),
        structureFile: './whitemodel.structure.json'
      },
      {
        name: '景观_外围',
        prefabId: 1077936148,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: scCount }, (_, i) => 1073743140 + i),
        instanceAuxiliaryIds: Array.from({ length: scCount }, (_, i) => 1073743220 + i),
        structureFile: './scenery3.structure.json'
      }
    ]
  }
}
