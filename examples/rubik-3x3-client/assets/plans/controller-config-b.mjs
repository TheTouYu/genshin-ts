// 3×3 魔方控制器 B（副控制器，7 项，通过信号转发给主图）
export default {
  assets: {
    staticAssemblies: [
      {
        name: '魔方控制器3x3-B',
        prefabId: 1077936202,
        templatePrefabId: 10009001,
        templateInstanceId: 10009001,
        templateName: '长方体',
        position: [2.0, 1.2, 4.0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: [1073742049],
        instanceAuxiliaryIds: [1073742050],
        components: [
          {
            type: 'tabBar',
            regionName: '魔方3x3-B',
            regionType: 'sphere',
            regionRadius: 3,
            regionCenter: [0, 0, 0],
            options: ['整体转X', '整体转Y', '整体转Z', '自动打乱', '自动还原', '重置', '反向旋转']
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
              rgb: 0xFF8A34,
              opacity: 100,
              overlay: 'overwrite'
            }
          }
        ]
      }
    ]
  }
}
