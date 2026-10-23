// 草地地基（2026-10-23 用户方案）：空模型模板 + 一个 50×1×50 装饰物，
// 本体（场景实体）再缩放覆盖整个足球场。
//
// 为什么不用单个大元件直接给 140×140：编辑器缩放上限是 50（用户 2026-10-23 提供），
// 上一轮 1077936157/1077936158（实体 scale 140×1×140）被编辑器拒收即栽在这条上。
// 本方案 = 装饰物 50 → 实体 scale 3 = 150×150 覆盖（球场 105×68，看台 118×102）。
//
// 地图 1073741827「真实足球v3」；ID 段见 plans/ 内既有配置：
//   def/inst 1077936160（未占用）、场景实体 1077936161（未占用）
//   aux：def 1073744800 / inst 1073744801——def 与 inst 共用同一个占位空间（plan 会拒重复），
//        当前最大已用 1073744743（inst 侧），故取 4800/4801
export default {
  assets: {
    staticAssemblies: [
      {
        name: '草地地基',
        prefabId: 1077936160,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        // 本体 scale 留给场景实体（[3,1,3]），此处保持 1×1×1，便于实体层再调
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: [1073744800],
        instanceAuxiliaryIds: [1073744801],
        structureFile: './ground.structure.json'
      }
    ]
  }
}
