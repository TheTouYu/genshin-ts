---
name: dsl-nodegraph-development
description: 用 Genshin-TS 的 TypeScript DSL（g.server / gstsServer*）编写服务端节点图逻辑的方法论：受限子集、编译器能力预验证、节点预算、四层交叉验证。当用户写新玩法逻辑、修改 g.server 图逻辑、修复 DSL 编译错误/生成图异常（节点超限、值类型错误、capture 失败）、或需要把玩法逻辑可靠变成游戏内行为时使用。配套：调试日志分析用 debug-log-investigator；游戏内验证用 verify-injection。
---

# 节点图 DSL 生产开发（dsl-nodegraph-development）

用 Genshin-TS 的 TypeScript DSL（`g.server` / `gstsServer*`）编写服务端节点图逻辑的方法论：
受限子集、编译器能力预验证、节点预算、四层交叉验证。适用于写新玩法、改图逻辑、修复生产 bug。

> 来源：2026-08-13/14 魔方 P4 转动逻辑五轮修复（v5→v5.5）全流程实证
> 验证层级：真实日志逐帧 + 用户游戏核验（位置+朝向全精确）
> 配套技能：调试日志分析用 `debug-log-investigator`；游戏内验证用 `verify-injection`/用户游戏核验

## 何时使用

- 编写/修改 `examples/*/src/*.ts` 中的 `g.server` 图逻辑（服务端事件、运动器、定时器、图变量）
- DSL 编译报错或生成图异常（节点数超限、值类型错误、capture 失败）
- 需要把"玩法逻辑"可靠地变成游戏内行为

## 核心流程（每轮一个可归因变量）

```text
设计（数据流思维）→ 能力预验证（最小编译实验）→ 实现 → 编译+IR 断言
→ 注入+回读 → 日志验证 → 用户游戏核验
```

1. **设计**：DSL 无可变状态，一切是节点连线。先画数据流（输入事件 → 计算 → 图变量/字典 → 定时器 → 运动器）。
2. **能力预验证**：要用不熟悉的能力（循环、循环内 setTimeout、capture 某类型、dict 操作）前，
   先写最小用例编译（10-30 行），确认编译器支持再写正式代码（P4 实证：循环方案先验证才敢用，避免返工）。
3. **实现**：按受限子集写；每轮只改一个可归因变量（五轮修复链 v5→v5.5 每轮一个根因）。
4. **编译 + IR 断言**：编译后检查 `dist/**/*.json` 节点统计（总数、关键节点族）；节点总数须 < 2000。
5. **注入 + 回读**：注入地图后用 `dump_gil_index.ts` 回读图节点数/结构，确认与 IR 一致。
6. **日志验证**：用户运行后解析 Beyond_Debug_Log，逐帧核对输入输出（见 debug-log-investigator）。
7. **游戏核验**：用户最终确认行为（编译/注入成功 ≠ 游戏行为正确——v5.1 注入成功但 layers 空实体不动）。

## DSL 受限子集速查

| 能力 | 状态 | 说明 |
|---|---|---|
| Promise/async/await/递归 | ❌ | 不可用 |
| 条件 | ✅ | 必须为 boolean（`f.equal`/`f.greaterThan`/`f.logicalAndOperation` 等） |
| 整数运算 | ⚠️ bigint | `0n`/`1n`；number 是 float（字典 key 等 int 参数传 number 会失败） |
| 循环 | ✅ | `for (let i = 0n; i < Nn; i++)` → finite_loop；**循环体只物化 1 次**（节点爆炸解法） |
| 循环内 setTimeout | ✅ | 回调可 capture 循环变量（int） |
| setTimeout/setInterval | ✅ | 回调 `(evt, f)`；evt 无 timerName 等字段（编译器类型缺口） |
| 图变量 | ✅ | bool/entity/vec3/list/dict（`dict([{k,v}])` 初始条目推断类型） |
| 数组字面量 | ✅ | `[c0, c1]` 作 entity_list 值（setNodeGraphVariable/setOrAdd value） |
| 字符串拼接 | ❓ | 未验证（用字面量/字典 key 替代） |
| helper 函数 | ⚠️ | **被每个调用点内联**——分支×调用次数=节点爆炸 |

## 节点预算与膨胀模式

- 单图节点上限约 **2000**（4000 跑不了，P4 实证）。
- **函数内联 × 分支**：helper 被 6 分支调用 → 6 份展开（2400 节点）。解法：合并分支为数据驱动、循环化。
- **循环体只物化 1 次**：finite_loop 循环体 1 份（2400→240 节点，P4 实证）。
- **capture 字典机制**：每个 setTimeout 回调的捕获变量 = set_or_add + get_corresponding 链（~6 节点/回调）；
  回调越多越贵。
- 节点统计脚本：`node -e "读 dist/**/*.json，统计 nodes 类型分布"`（IR 是数组格式，取 docs[0].nodes）。

## 值类型与 capture 限制

| 主题 | 结论 |
|---|---|
| 循环变量 | `let i = 0` → **float**（转 `float(i)`）；`let i = 0n` → **int**——int 参数必须 bigint 循环 |
| capture vec3 | ❌ DSL 方法返回的 vec3 捕获报 `any`（capture 只支持可推断类型）→ 用图变量/字典中转 |
| capture 支持 | str/int/bool/float/entity/vec3 等字面可推断类型；不支持 dict/复合结果 |
| 字典 key | 必须 int/str 等键类型；传 float 报 `Invalid value type: int` |
| 列表下标 | `getCorrespondingValueFromList` **0-based**（1..N 会越界返回空） |
| 返回字段名 | `getEntityLocationAndRotation` 返回 `{ location, rotate }`（**rotate** 不是 rotation） |
| 向量分量 | vec3 有 `.x/.y/.z` getter（生成 split3dVector 节点） |
| 三角函数 | `cosineFunction/sineFunction`（弧度输入；角度需乘 π/180） |

## 复合节点编写（2026-08-14 方法论，详见 game-from-scratch/references/composite-authoring.md）

- 调用：f.callComposite(handle, { 输入名: 值 })；多输出 res.输出名；嵌套/循环内可调用。
- 优先**纯数据复合**（inputs/outputs 类型声明，build 只算）；需要动作用 registerExecNode + outflows + f.outflow。
- 能力边界：setTimeout 不可用（#3）、dict 图变量读写不可用（#4）、startTimer 可用（float_list 输入）、字面量输入自动包装（#1 已修复）。
- 价值：复用型（多处调用）+ 封装型（单次但职责清晰）；通用型复合（比较/数学扩展）是跨项目资产。
## 四层交叉验证链

```text
源码 .ts → 转换产物 .gs.ts（看编译器做了什么）
→ IR .json（节点统计/结构断言）
→ GIA 注入地图 → dump_gil_index 回读（真实图结构）
→ 游戏日志 frames（真实执行值）→ 用户游戏反馈（最终真相）
```

- **每层证据独立**：编译成功 ≠ 注入成功 ≠ 游戏行为正确。
- 真实日志帧值是铁证：位置读取、字典查询返回值（空值 `13=0.0`）、运动器参数——逐帧核对不猜。
- 引擎语义（如运动器轴）可用**矩阵反推**验证：rotation 欧拉（YXZ 内旋 R=Ry·Rx·Rz）→ 矩阵 → 对比候选语义。

## 常见错误速查

| 错误 | 根因 | 修复 |
|---|---|---|
| TS2307 Cannot find module | import 路径错误（如 `genshin-ts/runtime/definitions/nodes` 不存在） | 查真实导出（`grep -rn "export" src/`），用正确路径 |
| Invalid value type: int | float 传给 int 参数（字典 key/循环变量） | bigint 循环 + 字面量 key；避免 number 运算 |
| unsupported timer capture type: any | capture 了 DSL 方法返回值（类型推断为 any） | 图变量/字典中转 |
| Generic parameter not matched | 表达式混型（如 `dot(x) * (1 - c)` 泛型推断失败） | 变形公式避免混合表达式（如罗德里格斯改 `u·dot + (v−u·dot)·c + (u×v)·s`） |
| 实体不动但节点执行 | 缺 basicMotion 组件（type 4）或作用空实体 | 组件差分检查 + 日志查运动器 IN0 实体 |
| 位置漂移/朝向错乱 | 公式压缩平行分量 / 轴语义（局部轴） | 见 game-engine-knowledge/motion-devices.md |

## 参考

- 引擎运行时行为（运动器轴语义/公式/层成员）：`docs/game-engine-knowledge/motion-devices.md`
- DSL 架构：`docs/architecture/runtime-dsl.md`；踩坑明细：`references/dsl-pitfalls.md`
- 玩法全流程：`game-from-scratch` 技能；组件/资产：`static-gil-model-builder`