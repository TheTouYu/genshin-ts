// 票 23 演出假人（静态方块人：长方体身体 + 球头）——单定义，两场景实体（A/B）
// 用法（预览/候选/写回，走 static-gil-model-builder 安全门）：
//   node ./bin/gsts.mjs assets:static-assemblies --asset-config examples/football/gsts.fb-dummy.config.mjs \
//        --gil <map>                          # 预览
//   ... --output <candidate.gil>              # 候选
//   ... --write                               # 写回（hash-gated）
// 场景实体另走 assets:entities --entities examples/football/assets/plans/dummy-entities.json --gil <map> --write
export default {
  assets: {
    staticAssemblies: [
      {
        name: '演出假人',
        prefabId: 1077936131,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: [1073744122, 1073744123],
        instanceAuxiliaryIds: [1073744124, 1073744125],
        structureFile: './assets/plans/dummy.structure.json'
      }
    ]
  }
}
