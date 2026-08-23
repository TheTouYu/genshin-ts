// 带装饰物的简单元件：基于官方球体 10009002 模板 + 1 个正方体装饰物(10009001)
// 坐标全部默认：元件/装饰物都在 [0,0,0]、缩放 [1,1,1]、零旋转
// 用途：与用户在编辑器里"球体 + 正方体装饰物"新建元件做字节一致性比对
export default {
  assets: {
    staticAssemblies: [
      {
        name: '球体测试',
        prefabId: 1077936131,
        templatePrefabId: 10009002,
        templateInstanceId: 10009002,
        templateName: '球体',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: Array.from({ length: 1 }, (_, i) => 1073741830 + i),
        instanceAuxiliaryIds: Array.from({ length: 1 }, (_, i) => 1073741900 + i),
        items: [
          {
            resourceId: 10009001,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          }
        ]
      }
    ]
  }
}