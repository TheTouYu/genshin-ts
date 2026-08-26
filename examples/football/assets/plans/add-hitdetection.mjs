// 给球元件（定义+实例+场景实体三层）加命中检测组件（type 12，exp6 默认槽）
// 用途：whenOnHitDetectionIsTriggered 控球判定主通道（玩家走近球→命中事件→CARRIED）
// 三层联动：root4 定义 f8 + root8 实例 f7 + root5 场景实体 f7（staticPrefabUpdates 通道）
export default {
  assets: {
    staticPrefabUpdates: [
      {
        prefabId: 1077936138, // 足球_1 定义（球实体 1077936135 引用）
        instanceId: 1077936138, // 足球_1 实例
        expectedName: '足球_1',
        components: [{ type: 'hitDetection', preset: 'default' }]
      }
    ]
  }
}
