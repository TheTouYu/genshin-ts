# 3×3 完整魔方 — 架构设计

> 状态：规划中
> 适用范围：`examples/rubik-3x3/`，新建独立地图「魔方3x3」+ 全新节点图
> 关联：2×2 已验证表现机制（自旋+分段公转）、`docs/architecture/rubik-3x3-solver-preparation.md`

## 1. 目标

做一个**完整 3×3 魔方**，不是 demo：

- 26 个可见块（8 角 + 12 棱 + 6 心）全部为可动实体；
- 支持全部 WCA 基础操作：`R L U D F B` + 中层 `M E S` + 整体旋转 `x y z`；
- 支持打乱、自动复原接口、重置；
- 逻辑状态与表现完全解耦，为自动求解器留下 `queue + qLen` 统一播放接口；
- 性能与节点预算按 2×2 优化后的设计继承并升级（N 块统一定时器调度，避免分支爆炸）。

## 2. 载体与资源

- 新建独立地图「魔方3x3」（避免与 2×2 控制器/选项卡/图变量冲突）。
- 全新节点图（node graph ID 由 `assets:node-graphs create` 自动分配）。
- 元件复用仓库中已有的 26 个「星枢3x3块_*」（来源地图 1073741849，ID 1077936149..174），
  通过 `assets:static-assemblies export` 导出闭包配置后在新图重建，并为全部 26 个补 `basicMotion` 组件。

## 3. 状态模型（单一事实源）

```text
cornerPos[8]      // 角位 -> 角块编号 0..7
cornerOrient[8]   // 角位 -> 扭转 0..2
edgePos[12]       // 棱位 -> 棱块编号 0..11
edgeOrient[12]    // 棱位 -> 翻转 0..1
centerPos[6]      // 心位 -> 心块编号 0..5
```

合计 46 个 int。初始全为恒等/0。中心块只记录位置，不记录贴纸朝向（纯色 3×3 无图案）。

### 块编号顺序（与实体 `blocks` 列表一致）

```text
角块 0..7:  UBL UBR UFL UFR DBL DBR DFL DFR
棱块 8..19: UF UR UB UL DF DR DB DL FR FL BR BL
心块 20..25: U D F B R L
```

> 角块顺序沿用 2×2；棱/心顺序与外部 CubeLib `POS_NAMES`/面序对齐，便于交叉验证。

## 4. 操作编码（tabId / moveId）

| tabId | moveId | 操作 | 轴 |
|---|---|---|---|
| 1-6 | 1-6 | R L U D F B | 面层 |
| 7-9 | 7-9 | M E S | 中层 |
| 10-12 | 10-12 | x y z | 整体 |
| 13 | - | 打乱 | - |
| 14 | - | 自动复原 | - |
| 15 | - | 重置 | - |

方向约定与 2×2/CubeLib 一致：
- `R/L/U/D/F/B` 与 2×2 已验证表一致；
- `M` 跟随 `L`，`E` 跟随 `D`，`S` 跟随 `F`；
- `x/y/z` 分别跟随 `R/U/F`。

## 5. 复合节点归类（防止“复合多了不好找”）

统一前缀 + 目录分层：

| 目录/前缀 | 职责 | 示例 |
|---|---|---|
| `src/composites/math.ts` / `math_*` | 纯数学（向量旋转/轨道点） | `math_rotate_vec`, `math_orbit_point` |
| `src/composites/motion.ts` / `motion_*` | 表现原语（自旋/轨道段/速度存储） | `motion_spin_block`, `motion_orbit_segment` |
| `src/composites/logic.ts` / `logic_*` | 逻辑状态（apply/isSolved/reset） | `logic_apply_face`, `logic_apply_whole`, `logic_is_solved` |
| `src/composites/flow.ts` / `flow_*` | 流程/状态机（锁/队列/打乱/复原/重置） | `flow_do_move`, `flow_after_turn`, `flow_scramble` |
| `src/composites/view.ts` / `view_*` | 表现调度（turnblock/orbit 事件） | `view_turn_block`, `view_orbit_trigger` |
| `src/composites/solver.ts` / `solver_*` | 自动复原接口（占位/未来求解器） | `solver_solve` |

命名统一 `前缀_动词_名词`，一个复合只做一件事，每层打开 5~7 个节点。

## 6. 性能设计（继承 2×2 优化并升级）

### 6.1 逻辑状态应用：循环 + 表

- 面转/中层/整体转分别用 `finiteLoop` 按固定槽数应用：
  - 面：4 角 + 4 棱（心不位移）；
  - 中层：4 棱 + 4 心；
  - 整体：8 角 + 12 棱 + 6 心。
- 不按 12 个 move 展开；`moveId` 只作为查表索引。
- `tempP` 统一存**全局块索引**（角 0..7 / 棱 8..19 / 心 20..25），
  既是逻辑写回的来源，也是表现层 `blocks[i]` 的直接下标。

### 6.2 表现调度：N 块统一定时器，不再 per-block 分支

2×2 的 orbit2 曾用 `timerName='0'..'7'` + 8 个分支，3×3 到 26 块会膨胀。
升级方案：

```text
do_move 注册两个 start_timer：
  1. 'turnblock'  times = 每槽启动相位（面 8 / 中层 8 / 整体 26）
  2. 'orbit2'     times = 每槽相位 + segmentDuration
timerSequenceId 直接作为槽位索引：
  'turnblock' -> view_turn_block(slot)   // 查 tempP[slot]，自旋 + orbit1 + 存速度
  'orbit2'    -> view_orbit2(slot)       // 查 tempP[slot]，加 orbit2 线性运动器
```

这样无论 8 块还是 26 块，事件分支只有 `turnblock/orbit2/unlock` 三个 case，节点数不随块数增长。

### 6.3 解锁

最后一个 `turnblock` 触发后注册 `unlock` 定时器（相对最后一块实际启动时刻），
完成后 `lock=false` + `flow_after_turn`。

## 7. 自动复原接口

```text
solver_solve(target):
  产出 queue(dict<int,int>) + qLen -> 走 flow_play_queue（与打乱共用）
```

第一版 `solver_solve` 为占位（打印 + 直接胜利检查），但接口与 2×2 完全一致，
后续把宏库/微型 PDB 结果写入 `queue` 即可。

## 8. 节点预算目标

- 单图 `implTotal < 3000`（2026-08-19 实证上限）；
- 逻辑状态表采用生成 JSON + 图变量 `int_list`，避免运行时计算；
- 复合按“复用型 + 封装型”拆分，但复合 impl 计入宿主图，写码时随时用
  `assets:node-graphs nodes` 检查。

## 9. 验证计划

1. 离线表生成器 + CubeLib 交叉验证（角/棱/心，含 M/E/S/x/y/z）；
2. DSL 编译 + IR 节点断言 + 编译产物表验证；
3. 新图注入 + 回读（`check-gil-composite-refs` + `explain-gil-node-graph`）；
4. 用户游戏核验：26 块创建、6+3+3 操作、打乱/复原/重置；
5. 日志逐帧验证（`debug-log-investigator`）。

## 10. 里程碑

```text
M1 表生成 + 验证
M2 新图 + 26 元件迁移 + basicMotion
M3 控制器 + tabBar 15 项
M4 DSL 实现 + 编译预算
M5 注入回读 + 游戏核验
M6 文档/技能沉淀 + 提交
```
