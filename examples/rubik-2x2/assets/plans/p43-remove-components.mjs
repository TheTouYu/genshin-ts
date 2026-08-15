// P4-3 工作②：移除角块_UFL（1077936135）上用户手动添加的组件
// type 12=命中检测 / type 13=物件镜头（仅用于规则确认，须命令行移除）
// 探针确认（2026-08-16）：仅 1077936135 的 definition(f8)/instance(f7) 各多出
// 12/13 两个槽（共 9 槽），其余 7 个角块为标准 7 槽（18/1/3/19/6/14/4）。
// 移除后应与其他角块完全同构。
export default {
  assets: {
    staticPrefabUpdates: [
      {
        prefabId: 1077936135,
        instanceId: 1077936135,
        expectedName: '角块_UFL',
        removeComponents: [12, 13]
      }
    ]
  }
}
