// 票 25-A v3 场地照搬配置（2026-10-12，新地图 1073741827「真实足球v3」）
// 范围=票 25 A 批：足球场 def 6129 + 足球门 def 6130（+aux/实例），不含球（B 批）、
// 假人/丘丘/UI（砍）、TickManager 宿主（C 批）。def 内容=复用票 24 rebuild-c4.mjs
// 已验证条目（structureFile 同目录），aux ID 段与 1825 保持一致便于文档对照。
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
      }
    ]
  }
}
