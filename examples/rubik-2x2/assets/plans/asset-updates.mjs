// 角块 basicMotion 组件补配（2026-08-13）
// 背景：实体组件必须显式配置（模板从不自带）。角块由 createPrefab 动态创建，
// 实例组件来自 prefab definition/instance 闭包；此前装配体未配 basicMotion，
// 节点图运行时添加运动器不生效（用户第二次指出该盲区，P4 最小实验控制器同理）。
// 本配置原地更新既有闭包：definition 槽 8 + instance 槽 7 双写 basicMotion（type 18 默认快照）。
export default {
  assets: {
    staticPrefabUpdates: [
      { prefabId: 1077936129, instanceId: 1077936129, expectedName: '角块_DBL', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936130, instanceId: 1077936130, expectedName: '角块_DBR', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936131, instanceId: 1077936131, expectedName: '角块_DFL', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936132, instanceId: 1077936132, expectedName: '角块_DFR', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936133, instanceId: 1077936133, expectedName: '角块_UBL', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936134, instanceId: 1077936134, expectedName: '角块_UBR', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936135, instanceId: 1077936135, expectedName: '角块_UFL', components: [{ type: 'basicMotion', preset: 'default' }] },
      { prefabId: 1077936136, instanceId: 1077936136, expectedName: '角块_UFR', components: [{ type: 'basicMotion', preset: 'default' }] }
    ]
  }
}
