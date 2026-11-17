// 渲染足球 v3 轻量模型资产配置（地图 1073741827「真实足球v3」）
// 用法见 static-gil-model-builder 技能 production-workflow：
//   plan → candidate(--output) → 回读核验 → apply-candidate(hash-gated)
export default {
  assets: {
    staticAssemblies: [
      {
        name: '渲染足球R',
        prefabId: 1077936166, // 2026-11-18 盘点空闲（实体表最高 1077936165；6164 有缺但留作编辑器分配）
        templatePrefabId: 10005018, // 空模型宿主
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0.3035277724266052, 0.25, -1.760223627090454], // 对齐 6165 落点；y=球心静止高度
        scale: [0.25, 0.25, 0.25], // item 空间球 R=1.0 → 最终 R=0.25m
        definitionAuxiliaryIds: Array.from({ length: 13 }, (_, i) => 1073745800 + i),
        instanceAuxiliaryIds: Array.from({ length: 13 }, (_, i) => 1073745820 + i),
        structureFile: './rball.structure.json'
      }
    ]
  }
}
