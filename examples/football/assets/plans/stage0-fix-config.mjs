// 足球元件重建（无底座）：新 prefabId 1077936138，用 football.structure.json（已删底座 222 items）
// 2026-08-22：V4 足球含展示底座（立柱+底盘），运动时底座跟随球，需换无底座版本
export default {
  assets: {
    staticAssemblies: [
      {
        name: '足球',
        prefabId: 1077936138,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0.247, 0],
        rotation: [0, 0, 0],
        scale: [0.25, 0.25, 0.25],
        definitionAuxiliaryIds: Array.from({ length: 222 }, (_, i) => 1073743900 + i),
        instanceAuxiliaryIds: Array.from({ length: 222 }, (_, i) => 1073744200 + i),
        structureFile: './football.structure.json'
      }
    ]
  }
}
