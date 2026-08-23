// 安全注入：足球场 + 足球门元件增量写入安全地图 1073741902
// 以用户当前保存版为源，用新 ID 区间，不触碰已有任何记录
export default {
  assets: {
    staticAssemblies: [
      {
        name: '足球场',
        prefabId: 1077936133,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: 84 }, (_, i) => 1073742600 + i),
        instanceAuxiliaryIds: Array.from({ length: 84 }, (_, i) => 1073742900 + i),
        structureFile: '/home/h/genshin-ts/examples/football/assets/plans/field.structure.json'
      },
      {
        name: '足球门',
        prefabId: 1077936134,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [-52.5, 0, 3.66],
        rotation: [0, 90, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: 142 }, (_, i) => 1073743200 + i),
        instanceAuxiliaryIds: Array.from({ length: 142 }, (_, i) => 1073743500 + i),
        structureFile: '/home/h/genshin-ts/examples/football/assets/plans/goal.structure.json'
      }
    ]
  }
}