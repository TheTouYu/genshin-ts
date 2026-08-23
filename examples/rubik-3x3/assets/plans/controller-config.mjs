// 3×3 魔方控制器（tabBar 15 项）
// 模板 = 官方长方体（可见主体），挂 tabBar 球体区域
export default {
  assets: {
    staticAssemblies: [
      {
        name: '魔方控制器3x3',
        prefabId: 1077936200,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [0, 1.2, 4.0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: [1073741938],
        instanceAuxiliaryIds: [1073741939],
        components: [
          {
            type: 'tabBar',
            regionName: '魔方3x3',
            regionType: 'sphere',
            regionRadius: 3,
            regionCenter: [0, 0, 0],
            options: [
              'R', 'L', 'U', 'D', 'F', 'B',
              'M', 'E', 'S',
              'x', 'y', 'z',
              '打乱', '自动复原', '重置'
            ]
          }
        ],
        items: [
          {
            resourceId: 10009001,
            position: [0, 0.51, 0],
            rotation: [0, 0, 0],
            scale: [0.8, 0.02, 0.8],
            color: {
              enabled: true,
              rgb: 0x35C96F,
              opacity: 100,
              overlay: 'overwrite'
            }
          }
        ]
      }
    ]
  }
}
