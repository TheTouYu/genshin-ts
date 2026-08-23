// 安全注入测试：仅足球元件（不含场景实体）增量写入安全地图 1073741902
// 以用户当前保存版为源，用新 ID 区间，不触碰已有任何记录（球体元件 129/131、aux 1826/27、场景球体 129/130）
export default {
  assets: {
    staticAssemblies: [
      {
        name: '足球',
        prefabId: 1077936132,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0.247, 0],
        rotation: [0, 0, 0],
        scale: [0.25, 0.25, 0.25],
        definitionAuxiliaryIds: Array.from({ length: 224 }, (_, i) => 1073741830 + i),
        instanceAuxiliaryIds: Array.from({ length: 224 }, (_, i) => 1073742200 + i),
        structureFile: '/home/h/genshin-ts/examples/football/assets/plans/football.structure.json'
      }
    ]
  }
}