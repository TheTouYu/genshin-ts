// 足球选项组件（tabBar）挂足球本体：5 米交互范围 + 9 选项
// 通过 staticPrefabUpdates 三层联动写 root4 定义 + root8 实例 + root5 实体（球 1077936135）
// 2026-08-22：选项从操作台移到足球本体，玩家靠近足球 5 米内可交互施力
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
    ]
  }
}