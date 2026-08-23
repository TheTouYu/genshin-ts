// 安全注入测试：以用户当前保存的地图为源，纯增量添加一个官方球体实体
export default {
  assets: {
    staticAssemblies: [
      {
        name: '安全测试球',
        prefabId: 1077936129,
        templatePrefabId: 10009002,
        templateInstanceId: 10009002,
        templateName: '球体',
        position: [2, 0.5, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        definitionAuxiliaryIds: [],
        instanceAuxiliaryIds: [],
        items: []
      }
    ]
  }
}
