# 票03：资产迁移+视觉等价（G2 后半）

**Status**: ⬜ Open
**Blocked by**: 02

## What

从 donor 1899 复制魔方资产到新地图（RG-DESIGN §5 迁移清单）：

- [ ] 26 块 prefab（1077936149..174）+ 控制器 prefab 1077936200
- [ ] 实体 A/B/测试台/solver（ID 映射表落档，新实体 ID ≥1077936129 且不与 donor 冲突）
- [ ] 图×9（1825/1826/1827/1830/1833/1835/1836/1837/1838）GIA 注入到新地图（turn 图零改动）
- [ ] 挂载关系还原：game+turn / relay+visual / solver+solverPlan(E/L)
- [ ] 变量+信号全套迁移；tabBar 组件不迁移（UI v3 退役）
- [ ] maps:resync 同步

## 验收

- [ ] 结构层：assets:node-graphs list + mounts list 回读=预期挂载矩阵
- [ ] 行为层：用户进游戏核验——魔方显示正常、自动还原四阶段可跑通（1899 等价行为）
- [ ] gameNodeCount 各图 ≤2000（迁移不加量）
