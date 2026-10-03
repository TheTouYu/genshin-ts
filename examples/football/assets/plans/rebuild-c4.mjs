// 票 24-C 重建配置（2026-10-03，新地图 1073741825）
// 复刻自 assets/plans 原始配置：field/goal=asset-config.mjs、ball=stage0-fix-config.mjs
// （def 6138 无底座 222 items）+ stage0-tabbar-config.mjs（basicMotion+tabBar 9 选项）、
// dummy=dummy.structure.json（def 1077936131 演出假人）。
// 注：asset-config.mjs 里的 gen-1 足球（prefabId 1077936131, 224 items 含底座）不重建——
// 6131 在终版地图上已让位给演出假人；操作台 6136 终版无实体，不重建。
export default {
  assets: {
    staticPrefabUpdates: [
      {
        prefabId: 1077936138,
        instanceId: 1077936138,
        expectedName: '足球_1',
        components: [
          { type: 'basicMotion', preset: 'default' },
          {
            type: 'tabBar',
            regionName: '足球操作',
            regionType: 'sphere',
            regionRadius: 5,
            regionCenter: [0, 0, 0],
            options: ['轻射', '重射', '高吊', '内旋弧', '外旋弧', '上旋低平', '下旋', '横传', '复位']
          }
        ]
      }
    ],
    staticAssemblies: [
      {
        name: '足球场',
        prefabId: 1077936129,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: 84 }, (_, i) => 1073741830 + i),
        instanceAuxiliaryIds: Array.from({ length: 84 }, (_, i) => 1073742000 + i),
        structureFile: './field.structure.json'
      },
      {
        name: '足球门',
        prefabId: 1077936130,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [-52.5, 0, 3.66],
        rotation: [0, 90, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: 142 }, (_, i) => 1073742200 + i),
        instanceAuxiliaryIds: Array.from({ length: 142 }, (_, i) => 1073742400 + i),
        structureFile: './goal.structure.json'
      },
      {
        name: '足球_1',
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
      },
      {
        name: '演出假人',
        prefabId: 1077936131,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: [1073744600, 1073744601],
        instanceAuxiliaryIds: [1073744700, 1073744701],
        structureFile: './dummy.structure.json'
      }
    ]
  }
}
