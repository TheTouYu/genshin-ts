// 灯阵 管理台 tabBar 四选项更新（2026-08-23，v7 交互扩展）
// 目标：更新既有 prefab 1077936131「管理台」的 tabBar 组件，
//   从旧「灯阵/开始游戏」单选项 → 四选项，与 game-manager.ts 的 whenTabIsSelected
//   分支一一对应（tabId 从 1 开始）：
//     tabId 1 = 开始游戏   → 创建关卡 1，随后 activateDisableTab(self,1,false) 禁用
//     tabId 2 = 重开本关   → 清空全关灯柱 → 0.5s 后重建第一关
//     tabId 3 = 返回上一关 → 同 2（简化：直接回第一关）
//     tabId 4 = 提示       → 随机点亮一盏本关灯柱（0.6s 闪烁）
//
// 走 staticPrefabUpdates（更新既有元件，三层联动 root4 定义 f8 + root8 实例 f7 + root5 实体 f7）。
// regionType/radius/center 与旧 lamp-ui-assets.mjs 管理台保持一致（sphere r1.5 中心 y1.0）。
//
// 注：2026-08-16 缺陷 ② 曾记「CLI 无法更新既有实体 tabBar options」，2026-08-22
// staticPrefabUpdates[].components 编码器已含 tabBar(17) 支持（72dd60f），本计划走该入口；
// 若 dry-run 发现 tabBar 快照不被接受，回退到编辑器手动改（需用户配合）。
export default {
  assets: {
    staticPrefabUpdates: [
      {
        prefabId: 1077936131,
        instanceId: 1077936131,
        expectedName: '管理台',
        components: [
          {
            type: 'tabBar',
            regionName: '灯阵',
            options: ['开始游戏', '重开本关', '返回上一关', '提示'],
            regionType: 'sphere',
            regionRadius: 1.5,
            regionCenter: [0, 1.0, 0]
          }
        ]
      }
    ]
  }
}