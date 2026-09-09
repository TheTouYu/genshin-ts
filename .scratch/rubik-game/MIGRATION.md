# MIGRATION — donor 1899 → 新图 1073741920 资产迁移映射（2026-09-09 CLI 实测盘点）

> 权威来源：`assets:resources list` / `list-gil-node-graphs` / `assets:mounts list` / `assets:signals inspect` 实测回读（本文件取代旧摘要里的 ID 表——旧表多处过时：块 ID 实为 v2 段 204..229 非 6149..174；图 ID 主玩法=1830 非 1825；漏了 solverPlan 1834 与 切换镜头 1839）。

## 迁移策略（定案）

**ID 原样保留**：新图 1920 root4/5/10 为空（仅 init 模板默认件），donor 自定义 ID 段无冲突。GIA 图内部引用 definitionId/entityId（createPrefab 等）——**换 ID 就得改图字节，保留 ID 则 donor GIA 直接可注入**。新图新增资产（UI/新图/美术）用全新 ID 段，从 1077936300 起预留。

## Prefab（root4 定义 + root8 页面模型，共 29 个自定义）

| donor ID | 名称 | 用途 | resource |
|---|---|---|---|
| 1077936200 | 魔方控制器3x3 | 控制器 A 定义 | 10009001 长方体 |
| 1077936202 | 魔方控制器3x3-B | 控制器 B / solver / 测试台共用定义 | 10009001 |
| 1077936204..1077936229 | 星枢3x3块_v2_UFL..DBR（26 个） | 魔方块 | 10009001 |
| 1077936230 | 元件组魔方摆放 | 块摆放页面模型组 | 10008001 |

（1086324737 默认模版 / 1090519041 角色编辑模版=编辑器默认，新图 init 已自带，不迁移）

## 实体（root5，共 6 个自定义）

| donor ID | 名称 | definitionId | 挂载图 |
|---|---|---|---|
| 1077936201 | 魔方控制器3x3（A） | 1077936200 | 1830 game + 1835 turn |
| 1077936203 | 魔方控制器3x3-B（B） | 1077936202 | 1831 relay + 1832 visual |
| 1077936230 | 魔方自动求解 | 1077936202 | 1833 solver + 1834 solverPlan + 1836 solverEPlan + 1838 solverLPlan |
| 1077936231 | 魔方测试台3x3 | 1077936202 | 1837 testPanel |
| 1077936260 | 空模型 | 10005018 | （无图；运行时锚点） |
| 1077936261 | 物件镜头 | 10005018 | 1839 切换镜头 |

## 节点图（root10，共 10 张）

| donor ID | 名称 | nodeCount | 迁移 |
|---|---|---|---|
| 1073741830 | _GSTS_game | 85 | ✅（主玩法） |
| 1073741831 | _GSTS_relay | 8 | ✅ |
| 1073741832 | _GSTS_visual | 30 | ✅ |
| 1073741833 | _GSTS_solver | 72 | ✅（票06 提示改造点） |
| 1073741834 | _GSTS_solverPlan | 262 | ✅ |
| 1073741835 | _GSTS_turn | 42 | ✅（零改动原则） |
| 1073741836 | _GSTS_solverEPlan | 152 | ✅ |
| 1073741837 | _GSTS_testPanel | 8 | ✅ |
| 1073741838 | _GSTS_solverLPlan | 298 | ✅ |
| 1073741839 | 切换镜头 | 8 | ✅（镜头功能，用户在用） |

## 信号（7 条，全迁移；新图信号注册后核验 v/defs 一致性）

rubik3x3_solve[op,val] / rubik3x3_solve_ack[] / rubik3x3_solve_done[ok] / rubik3x3_solve_move[moveId] / rubik3x3_solve_ready[] / rubik3x3_solve_req[] / rubik3x3_tab[tabId]

## 变量

- 关卡变量（root5 level）：**0 条**（实测空）
- 图变量：随 GIA 图走，无需单独迁移

## 不迁移项

- tabBar 组件配置（UI v3 退役；但实体定义里的组件槽结构保留原样——turn 图 tabBar 事件分支仍在，仅无 UI 入口，方案 B 手术时再定）
- 编辑器默认模版（1086324737/1090519041 段，init 模板自带）

## 迁移顺序（票03 执行清单）

1. donor root4+root8 复制（29 prefab：定义+页面模型+aux 装饰物）
2. 新图建 10 张占位图（node-graphs create，名字对齐 donor）
3. donor GIA 导出→注入新图对应占位图
4. 实体 import（6 个，root4 定义先行已就位；--definitions-gil 或已复制）
5. 信号注册×7（--write）+核验
6. 挂载还原（上表矩阵）
7. maps:resync + 用户重载编辑器保存 + 游戏核验（1899 等价行为）
