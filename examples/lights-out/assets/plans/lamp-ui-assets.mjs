// 灯阵三关扩展资产（2026-08-16，管理台 + 引导牌）
// 目标地图：1073741890「灯阵-最小图」
// 管理台：玩家进入后交互 → 选项卡「开始游戏」→ 激活关卡 1
// 引导牌：实体上选项卡显示帮助文字（玩家靠近可见，无需铭牌/UI 控件）
// 资源语义：10009008 圆柱 scale=[直径,高,直径]；10009001 长方体 scale=[宽,高,长]；
//          10009002 球体 scale=[直径,直径,直径]；10009005 五棱柱 scale=[外接直径,高,外接直径]
export default {
  assets: {
    staticAssemblies: [
      {
        name: '管理台',
        prefabId: 1077936131,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.35, 0],
        scale: [0.3, 0.6, 0.3],
        color: { enabled: true, rgb: 0x5a5a5a, opacity: 100, overlay: 'overwrite' },
        components: [
          {
            type: 'tabBar',
            regionName: '灯阵',
            options: ['开始游戏'],
            regionType: 'sphere',
            regionRadius: 1.5,
            regionCenter: [0, 1.0, 0]
          },
          {
            type: 'basicMotion',
            preset: 'default'
          }
        ],
        items: [
          // 底座（贴地）
          {
            resourceId: 10009008,
            position: [0, -0.3, 0],
            rotation: [0, 0, 0],
            scale: [0.5, 0.1, 0.5],
            color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' }
          },
          // 顶部装饰球（金色）
          {
            resourceId: 10009002,
            position: [0, 0.42, 0],
            rotation: [0, 0, 0],
            scale: [0.14, 0.14, 0.14],
            color: { enabled: true, rgb: 0xd4af37, opacity: 100, overlay: 'overwrite' }
          }
        ],
        definitionAuxiliaryIds: [1073741913, 1073741914],
        instanceAuxiliaryIds: [1073741915, 1073741916]
      },
      {
        name: '引导牌',
        prefabId: 1077936132,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.35, 0],
        scale: [0.05, 0.5, 0.05],
        color: { enabled: true, rgb: 0x6a5a3a, opacity: 100, overlay: 'overwrite' },
        components: [
          {
            type: 'tabBar',
            regionName: '帮助',
            options: ['点击灯柱翻转明暗', '点亮全部灯过关', '通关解锁下一关'],
            regionType: 'sphere',
            regionRadius: 1.5,
            regionCenter: [0, 0.8, 0]
          },
          {
            type: 'basicMotion',
            preset: 'default'
          }
        ],
        items: [
          // 底座
          {
            resourceId: 10009008,
            position: [0, -0.32, 0],
            rotation: [0, 0, 0],
            scale: [0.3, 0.08, 0.3],
            color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' }
          },
          // 牌面（朝玩家的板子）
          {
            resourceId: 10009001,
            position: [0, 0.35, 0.03],
            rotation: [0, 0, 0],
            scale: [0.4, 0.45, 0.03],
            color: { enabled: true, rgb: 0xd8c9a3, opacity: 100, overlay: 'overwrite' }
          }
        ],
        definitionAuxiliaryIds: [1073741917, 1073741918],
        instanceAuxiliaryIds: [1073741919, 1073741920]
      }
    ]
  }
}
