// 灯阵 L4/L5/L6 灯柱 prefab 资产计划（2026-08-22，v6 七级阶梯）
// 目标地图：1073741993「灯阵-最小图」
// 设计：复用灯柱L3 的古典路灯造型（7 装饰物），仅灯罩颜色区分关卡：
//   L4（3×3 经典）= 暖黄 0xffd27a（与 L1-L3 一致，经典延续）
//   L5（4×4）      = 青绿 0x7ad2c8（进阶）
//   L6（5×5）      = 淡紫 0xc8a2e8（大师）
// 组件：tabBar（「切换」半径 1.0 球心 y1.3）+ basicMotion（default）
// 资源语义同 lamp-minimal-assets.mjs（calibration-and-geometry.md 已闭合）
// 注意：本计划仅定义 prefab（root4 定义 + root8 页面模型），
//   def 挂载玩法图（1830/1831/1832）在注入阶段用 assets:mounts attach 完成。
export default {
  assets: {
    staticAssemblies: [
      {
        name: '灯柱L4',
        prefabId: 1077936200,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.55, 0],
        scale: [0.1, 1.0, 0.1],
        color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' },
        components: [
          { type: 'tabBar', regionName: '切换', options: ['切换'], regionType: 'sphere', regionRadius: 1.0, regionCenter: [0, 1.3, 0] },
          { type: 'basicMotion', preset: 'default' }
        ],
        items: [
          { resourceId: 10009008, position: [0, -0.49, 0], rotation: [0, 0, 0], scale: [0.5, 0.12, 0.5], color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, -0.4, 0], rotation: [0, 0, 0], scale: [0.32, 0.05, 0.32], color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, -0.14, 0], rotation: [0, 0, 0], scale: [0.18, 0.05, 0.18], color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, 0.21, 0], rotation: [0, 0, 0], scale: [0.18, 0.05, 0.18], color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, 0.53, 0], rotation: [0, 0, 0], scale: [0.3, 0.06, 0.3], color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009005, position: [0, 0.79, 0], rotation: [0, 0, 0], scale: [0.42, 0.4, 0.42], color: { enabled: true, rgb: 0xffd27a, opacity: 45, overlay: 'overwrite' } },
          { resourceId: 10009002, position: [0, 1.01, 0], rotation: [0, 0, 0], scale: [0.1, 0.1, 0.1], color: { enabled: true, rgb: 0xd4af37, opacity: 100, overlay: 'overwrite' } }
        ],
        definitionAuxiliaryIds: [1073741953, 1073741954, 1073741955, 1073741956, 1073741957, 1073741958, 1073741959],
        instanceAuxiliaryIds: [1073741960, 1073741961, 1073741962, 1073741963, 1073741964, 1073741965, 1073741966]
      },
      {
        name: '灯柱L5',
        prefabId: 1077936201,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.55, 0],
        scale: [0.1, 1.0, 0.1],
        color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' },
        components: [
          { type: 'tabBar', regionName: '切换', options: ['切换'], regionType: 'sphere', regionRadius: 1.0, regionCenter: [0, 1.3, 0] },
          { type: 'basicMotion', preset: 'default' }
        ],
        items: [
          { resourceId: 10009008, position: [0, -0.49, 0], rotation: [0, 0, 0], scale: [0.5, 0.12, 0.5], color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, -0.4, 0], rotation: [0, 0, 0], scale: [0.32, 0.05, 0.32], color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, -0.14, 0], rotation: [0, 0, 0], scale: [0.18, 0.05, 0.18], color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, 0.21, 0], rotation: [0, 0, 0], scale: [0.18, 0.05, 0.18], color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, 0.53, 0], rotation: [0, 0, 0], scale: [0.3, 0.06, 0.3], color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009005, position: [0, 0.79, 0], rotation: [0, 0, 0], scale: [0.42, 0.4, 0.42], color: { enabled: true, rgb: 0x7ad2c8, opacity: 45, overlay: 'overwrite' } },
          { resourceId: 10009002, position: [0, 1.01, 0], rotation: [0, 0, 0], scale: [0.1, 0.1, 0.1], color: { enabled: true, rgb: 0xd4af37, opacity: 100, overlay: 'overwrite' } }
        ],
        definitionAuxiliaryIds: [1073741967, 1073741968, 1073741969, 1073741970, 1073741971, 1073741972, 1073741973],
        instanceAuxiliaryIds: [1073741974, 1073741975, 1073741976, 1073741977, 1073741978, 1073741979, 1073741980]
      },
      {
        name: '灯柱L6',
        prefabId: 1077936202,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.55, 0],
        scale: [0.1, 1.0, 0.1],
        color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' },
        components: [
          { type: 'tabBar', regionName: '切换', options: ['切换'], regionType: 'sphere', regionRadius: 1.0, regionCenter: [0, 1.3, 0] },
          { type: 'basicMotion', preset: 'default' }
        ],
        items: [
          { resourceId: 10009008, position: [0, -0.49, 0], rotation: [0, 0, 0], scale: [0.5, 0.12, 0.5], color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, -0.4, 0], rotation: [0, 0, 0], scale: [0.32, 0.05, 0.32], color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, -0.14, 0], rotation: [0, 0, 0], scale: [0.18, 0.05, 0.18], color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, 0.21, 0], rotation: [0, 0, 0], scale: [0.18, 0.05, 0.18], color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009008, position: [0, 0.53, 0], rotation: [0, 0, 0], scale: [0.3, 0.06, 0.3], color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' } },
          { resourceId: 10009005, position: [0, 0.79, 0], rotation: [0, 0, 0], scale: [0.42, 0.4, 0.42], color: { enabled: true, rgb: 0xc8a2e8, opacity: 45, overlay: 'overwrite' } },
          { resourceId: 10009002, position: [0, 1.01, 0], rotation: [0, 0, 0], scale: [0.1, 0.1, 0.1], color: { enabled: true, rgb: 0xd4af37, opacity: 100, overlay: 'overwrite' } }
        ],
        definitionAuxiliaryIds: [1073741981, 1073741982, 1073741983, 1073741984, 1073741985, 1073741986, 1073741987],
        instanceAuxiliaryIds: [1073741988, 1073741989, 1073741990, 1073741991, 1073741992, 1073741993, 1073741994]
      }
    ]
  }
}
