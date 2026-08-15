// 灯阵元件资产（2026-08-16，阶段 2 建模 v1）
// 每灯 2 实体（ADR-0004）：灯柱（常显，承载 tabBar 输入 + 挂图）+ 灯头（明暗主体，308 显隐）
// 场景实体不预置——游戏时 createPrefab 动态创建（继承元件闭包组件）
export default {
  assets: {
    staticAssemblies: [
      {
        name: '灯柱',
        prefabId: 1077936129,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.4, 0],
        scale: [0.1, 0.8, 0.1],
        color: { enabled: true, rgb: 0x303030, opacity: 100, overlay: 'overwrite' },
        components: [
          {
            type: 'tabBar',
            regionName: '灯操作',
            options: ['切换'],
            regionType: 'sphere',
            regionRadius: 0.6,
            regionCenter: [0, 0, 0]
          }
        ],
        items: [
          {
            resourceId: 10009001,
            position: [0, -0.385, 0],
            scale: [0.25, 0.03, 0.25],
            color: { enabled: true, rgb: 0x303030, opacity: 100, overlay: 'overwrite' }
          }
        ],
        definitionAuxiliaryIds: [1073741825],
        instanceAuxiliaryIds: [1073741826]
      },
      {
        name: '灯头',
        prefabId: 1077936130,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.95, 0],
        scale: [0.3, 0.2, 0.3],
        color: { enabled: true, rgb: 0xffd700, opacity: 100, overlay: 'overwrite' },
        items: [
          {
            resourceId: 10009001,
            position: [0, 0.125, 0],
            scale: [0.15, 0.05, 0.15],
            color: { enabled: true, rgb: 0xfff5e0, opacity: 100, overlay: 'overwrite' }
          }
        ],
        definitionAuxiliaryIds: [1073741827],
        // 1073741828 撞 src/cli/official_prefabs.ts 的 SKELETON_AUX_ID 占位符（递归替换 bug，见 O-2026-08-16-11）
        instanceAuxiliaryIds: [1073741830]
      }
    ]
  }
}
