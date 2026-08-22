// 足球阶段 0 资产配置（独立于 asset-config.mjs，不覆盖既有三元件装配）
// 1. 球元件 1077936131 补 basicMotion（type 4）：运动器前置依赖
// 2. 操作台实体 1077936136：空模型 + tabBar（9 选项，tabBar 在 console.structure.json 里）
export default {
  assets: {
    staticPrefabUpdates: [
      {
        prefabId: 1077936131,
        instanceId: 1077936131,
        expectedName: '足球',
        components: [{ type: 'basicMotion', preset: 'default' }]
      }
    ],
    staticAssemblies: [
      {
        name: '足球操作台',
        prefabId: 1077936136,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [-35, 0.5, 0],
        scale: [0.01, 0.01, 0.01],
        definitionAuxiliaryIds: [1073743800],
        instanceAuxiliaryIds: [1073743801],
        structureFile: './console.structure.json'
      }
    ]
  }
}
