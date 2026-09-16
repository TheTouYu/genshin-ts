// T12 迷宫复现 · 静态资产配置（隐藏收集物）
//
// 为什么这 4 个走「元件」而不是场景实体：
//   `EntityImport`（src/cli/gil_entities.ts:42-54）的 schema **没有 components 字段**
//   → `assets:entities import` 能批量建场景实体但加不上组件。
//   而隐藏物必须有 `tabBar`（类型码 17）才能被点击触发 `whenTabIsSelected`。
//   组件通道在元件侧：`staticAssemblies[].components`（同一 `componentSnapshot` 编码器）。
//
// 墙体/造景（146 个）走 `assets:entities import`：它们是关卡环境而非可移动模型，
//   各自需要碰撞体、且无「整体移动/缩放」需求 —— 与技能「复杂模型做成单一元件」的
//   适用场景（魔方/足球等整体操控对象）不同，故此处按关卡布局拆实体是合理取舍。
//
// 坐标为 docs/knowledge-graph/reproduction/maze-entities.json 中 4 个「隐藏_N」的死路尽头位置。

const GOLD = { enabled: true, rgb: 0xffd700, opacity: 100, overlay: 'overwrite' }

/** 4 个隐藏收集物的死路尽头坐标（与 maze-entities.json 一致） */
const HIDDEN = [
  { name: '隐藏_1', position: [13, 1, 1] },
  { name: '隐藏_2', position: [11, 1, 5] },
  { name: '隐藏_3', position: [9, 1, 9] },
  { name: '隐藏_4', position: [3, 1, 11] }
]

// ID 计划（依据 inspect + entities export 双查：本图 prefabs 占用 1086324737/1090519041，
// aux 两侧均 0 个，实体 id 1086324737..1094713345）
//   prefabId 从 1077936129（0x40400001）起 —— 自定义元件 ID 必须 ≥ 1077936129，
//   0x4000xxxx 区间的元件会被编辑器整体丢弃（地图打开为空）。
//   aux ID 从 1073742000 起 —— 避开 1073741828/1073741829（骨架占位值，会被回链替换误改写）。
const PREFAB_BASE = 1077936129
const DEF_AUX_BASE = 1073742000
const INST_AUX_BASE = 1073742004

export default {
  assets: {
    staticAssemblies: HIDDEN.map((h, i) => ({
      name: `T12_${h.name}`,
      prefabId: PREFAB_BASE + i,
      templatePrefabId: 10005018,
      templateInstanceId: 10005018,
      templateName: '空模型',
      position: h.position,
      definitionAuxiliaryIds: [DEF_AUX_BASE + i],
      instanceAuxiliaryIds: [INST_AUX_BASE + i],
      components: [
        {
          type: 'tabBar',
          regionName: '隐藏收集物',
          // 选项短名按声明顺序编号；节点图的 whenTabIsSelected.tabId 即此序号
          options: ['拾取']
          // regionType 默认 box、regionSize 默认 [1,1,1]、regionCenter 必须全 0
          // （box + 非零 regionCenter 无真实样本，代码显式 fail closed）
        }
      ],
      items: [
        {
          resourceId: 10009002, // 球体
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [0.4, 0.4, 0.4],
          color: GOLD
        }
      ]
    }))
  }
}
