// 灯阵最小图资产（2026-08-16，建模 v2.1 精美版 + 坐标修正）
// 目标地图：1073741890「灯阵-最小图」（空图，本轮重建写回）
// 设计：灯柱 = 古典路灯（底座圆柱+台阶+柱身+装饰环+五棱柱半透明灯罩+顶球）
//       灯头 = 发光核心（暖金球+内芯高光+挂环+顶珠），308 显隐控制明暗
// 资源语义（calibration-and-geometry.md 已闭合）：
//   10009001 长方体 scale=[宽,高,长] 边长米
//   10009008 圆柱   scale=[截面直径,轴向长度,截面直径] 零旋转轴向 Y
//   10009005 五棱柱 scale=[外接直径,高,外接直径] 高度轴 Y
//   10009002 球体   scale=[直径,直径,直径]
// items 坐标为相对 template 中心（assembly position）的局部坐标
// v2.1 坐标修正（2026-08-16 用户反馈）：实体 y=0 是装配原点，items 相对模板中心；
//   原底座局部 y=-0.55 → 世界 y=0（中心在地面、半陷地）→ 全部 item y +0.06，
//   底座底部贴地（世界 0~0.12）；tabBar 半径 1.5→1.0（间距 2.5 互不重叠）；
//   regionName「灯操作」→「切换」
export default {
  assets: {
    staticAssemblies: [
      {
        name: '灯柱',
        prefabId: 1077936129,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 0.55, 0],
        scale: [0.1, 1.0, 0.1],
        color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' },
        components: [
          {
            type: 'tabBar',
            regionName: '切换',
            options: ['切换'],
            regionType: 'sphere',
            regionRadius: 1.0,
            regionCenter: [0, 1.3, 0]
          },
          {
            type: 'basicMotion',
            preset: 'default'
          }
        ],
        items: [
          // 底座（世界 y 0~0.12，贴地）
          {
            resourceId: 10009008,
            position: [0, -0.49, 0],
            rotation: [0, 0, 0],
            scale: [0.5, 0.12, 0.5],
            color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' }
          },
          // 底座台阶（世界 0.125~0.175）
          {
            resourceId: 10009008,
            position: [0, -0.4, 0],
            rotation: [0, 0, 0],
            scale: [0.32, 0.05, 0.32],
            color: { enabled: true, rgb: 0x4a4a4a, opacity: 100, overlay: 'overwrite' }
          },
          // 柱身装饰环 1（世界中心 0.41）
          {
            resourceId: 10009008,
            position: [0, -0.14, 0],
            rotation: [0, 0, 0],
            scale: [0.18, 0.05, 0.18],
            color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' }
          },
          // 柱身装饰环 2（世界中心 0.76）
          {
            resourceId: 10009008,
            position: [0, 0.21, 0],
            rotation: [0, 0, 0],
            scale: [0.18, 0.05, 0.18],
            color: { enabled: true, rgb: 0xc8a24a, opacity: 100, overlay: 'overwrite' }
          },
          // 灯罩座（世界中心 1.08）
          {
            resourceId: 10009008,
            position: [0, 0.53, 0],
            rotation: [0, 0, 0],
            scale: [0.3, 0.06, 0.3],
            color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' }
          },
          // 灯罩（五棱柱半透明暖黄，世界 y 1.14~1.54，中心 1.34）
          {
            resourceId: 10009005,
            position: [0, 0.79, 0],
            rotation: [0, 0, 0],
            scale: [0.42, 0.4, 0.42],
            color: { enabled: true, rgb: 0xffd27a, opacity: 45, overlay: 'overwrite' }
          },
          // 顶饰球（世界中心 1.56）
          {
            resourceId: 10009002,
            position: [0, 1.01, 0],
            rotation: [0, 0, 0],
            scale: [0.1, 0.1, 0.1],
            color: { enabled: true, rgb: 0xd4af37, opacity: 100, overlay: 'overwrite' }
          }
        ],
        definitionAuxiliaryIds: [1073741830, 1073741831, 1073741832, 1073741833, 1073741834, 1073741835, 1073741836],
        instanceAuxiliaryIds: [1073741837, 1073741838, 1073741839, 1073741840, 1073741841, 1073741842, 1073741843]
      },
      {
        name: '灯头',
        prefabId: 1077936130,
        templatePrefabId: 10009002,
        templateInstanceId: 10009002,
        templateName: '球体',
        position: [0, 0, 0],
        scale: [0.3, 0.3, 0.3],
        color: { enabled: true, rgb: 0xffcc44, opacity: 100, overlay: 'overwrite' },
        components: [
          {
            type: 'basicMotion',
            preset: 'default'
          }
        ],
        items: [
          // 内芯高光
          {
            resourceId: 10009002,
            position: [0, 0.02, 0],
            rotation: [0, 0, 0],
            scale: [0.13, 0.13, 0.13],
            color: { enabled: true, rgb: 0xfff3d0, opacity: 100, overlay: 'overwrite' }
          },
          // 底部挂环
          {
            resourceId: 10009008,
            position: [0, -0.19, 0],
            rotation: [0, 0, 0],
            scale: [0.16, 0.06, 0.16],
            color: { enabled: true, rgb: 0x3a3a3a, opacity: 100, overlay: 'overwrite' }
          },
          // 顶珠
          {
            resourceId: 10009002,
            position: [0, 0.17, 0],
            rotation: [0, 0, 0],
            scale: [0.06, 0.06, 0.06],
            color: { enabled: true, rgb: 0xffe9a0, opacity: 100, overlay: 'overwrite' }
          }
        ],
        definitionAuxiliaryIds: [1073741844, 1073741845, 1073741846],
        instanceAuxiliaryIds: [1073741847, 1073741848, 1073741849]
      }
    ]
  }
}
