# 真实足球 · 阶段 0 架构重构规划（多图 + 复合化）

> 状态：规划中（2026-08-22）
> 目标：把 221 节点"面条图"重构为多图 + 复合化架构，跑通阶段 0 完整流程（挂载 + 组件 + 注入）
> 参考：`examples/rubik-3x3/`（relay + game 多图模式、composites/ 目录分类、五层分离）

## 1. 现状问题

- 单图 `_GSTS_game`（1073741825）221 节点，9 个踢球分支 × 5 节点全平铺，违反"每层 5-7 节点"铁律
- 球实体（1077936135）**无 basicMotion（type 4）**——运动器节点执行但球不动
- **无 tabBar（type 17）**——`whenTabIsSelected` 写了但游戏里点不动
- 无操作台实体（tabBar 挂载目标）

## 2. 多图拆分（参考 rubik-3x3 relay + game）

| 图 | 文件 | 挂载实体 | 职责 |
|---|---|---|---|
| 输入图 | `src/input.ts` | 操作台实体（新建） | `whenTabIsSelected` → 解析 tabId → `sendSignal(football_kick, tabId)` |
| 物理图 | `src/game.ts` | 球实体 1077936135 | `onSignal(football_kick)` → 踢球参数 → 物理积分链；`whenBasicMotionDeviceStops` → 积分 → 判定 → 复位 |

- 信号：`football_kick`（参数 `tabId:int`），跨图传递踢球指令
- 图 ID：输入图 1073741826（新建占位图），物理图 1073741825（复用现有）

## 3. 复合化（composites/ 目录，参考 rubik-3x3）

| 文件 | 复合 | 形态 | 职责 |
|---|---|---|---|
| `composites/kick.ts` | `kick_params` | 纯数据 | tabId → 初速/初旋（9 种踢法参数表） |
| `composites/physics.ts` | `physics_integrate` | 纯数据 | 三力积分（重力+阻力+马格努斯）一步 |
| | `physics_collide` | 纯数据 | 地面/门柱碰撞修正 |
| | `physics_judge` | 纯数据 | 进球/出界/停球判定 |
| `composites/motion.ts` | `motion_activate` | exec | 定点运动器激活封装（匀速直线/瞬间） |

- 物理积分是纯数据复合（输入 pos/vel/spin → 输出新 pos/vel/spin），判定也是纯数据（输入 pos/vel → 输出 bool）
- 运动器激活是 exec 复合（registerExecNode + outflow done）
- 踢球参数是纯数据复合（tabId → vel/spin）

## 4. 元件/实体规划

| 对象 | ID | 操作 | 组件 |
|---|---|---|---|
| 操作台实体 | 新建（≥1077936129） | 空模型 + tabBar | tabBar（type 17，9 选项，sphere region） |
| 球实体 | 1077936135（现有） | 补组件 | basicMotion（type 4） |

- 操作台：空模型 10005018 缩成极小点（挂载点），tabBar 9 选项（6 射门 + 2 传球 + 1 复位）
- 球：补 basicMotion type 4（`080410017203c81f01`），运动器前置依赖

## 5. 信号

- `football_kick`（`tabId:int`）：输入图 → 物理图
- 注册：`gsts assets:signals register --name football_kick --param tabId:int --gil <map> --write`

## 6. 执行顺序（端到端注入纪律）

```text
1 信号注册（football_kick）
2 元件/实体：操作台（tabBar）+ 球 basicMotion
3 复合化重构 + 多图拆分（写 TS）
4 编译 + IR 断言（节点数、复合数）
5 挂载：输入图挂操作台、物理图挂球
6 注入 + 回读核验（读图自检 + 复合引用 + 变量 pin）
7 用户游戏核验
```

## 7. 关键约束（技能铁律）

- 复合 exec 链首必须普通节点；复合调用只作链中/链尾
- 声明 outflows 的 exec 复合必须显式 f.outflow
- 事件回调内禁止 `new vec3([...])`，用 `f.create3dVector`
- 多图注入：复合显式 id 保证 ID 稳定（参考 rubik-3x3 1610700016 起）
- 跨图复合不能引用目标图没有的图变量
- 编译用正式 CLI `node ./bin/gsts.mjs dev`（不用 tsx 直跑 src）
