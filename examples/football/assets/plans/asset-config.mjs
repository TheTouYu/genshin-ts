// 真实足球 — 资产装配配置（examples/football）
// 三个自定义元件：足球场白线 / 足球门（FIFA 7.32×2.44，142 items）/ 足球（升级4全开，224 items）
// 四个场景实体：球场线 / 左门 / 右门 / 足球（中心 y=半径贴地）
export default {
  assets: {
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
        name: '足球',
        prefabId: 1077936131,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0.247, 0],
        rotation: [0, 0, 0],
        scale: [0.25, 0.25, 0.25],
        definitionAuxiliaryIds: Array.from({ length: 224 }, (_, i) => 1073742600 + i),
        instanceAuxiliaryIds: Array.from({ length: 224 }, (_, i) => 1073742900 + i),
        structureFile: './football.structure.json'
      }
    ]
  }
}
