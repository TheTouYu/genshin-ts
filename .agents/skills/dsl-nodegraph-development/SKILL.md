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
| 批量创建/遍历 | ✅ `f.listIterationLoop` / `.forEach` | `f.listIterationLoop(f.assemblyList([...], '类型'), (v, _breakLoop) => …)` 或 `list('类型', [...]).forEach(cb)`（Stage1 转换；prefabId/位置可动态算，50 个手写 createPrefab → 3 节点）；编译环境须能解析全局 `list` 类型声明 |
| 循环内 setTimeout | ✅ | 回调可 capture 循环变量（int） |
| setTimeout/setInterval | ✅ | 回调 `(evt, f)`；evt 无 timerName 等字段（编译器类型缺口） |
| 图变量 | ✅ | bool/entity/vec3/list/dict（`dict([{k,v}])` 初始条目推断类型） |
| 数组字面量 | ✅ | `[c0, c1]` 作 entity_list 值（setNodeGraphVariable/setOrAdd value） |
| 字符串拼接 | ❓ | 未验证（用字面量/字典 key 替代） |
| helper 函数 | ⚠️ | **被每个调用点内联**——分支×调用次数=节点爆炸 |

## 节点预算与膨胀模式

- **游戏节点限制 = 单个节点图 3000**（2026-08-19 实证：4043 > 3000 拒载；口径 = 所有复合 impl **递归展开**节点总数，
  复合实例计入其 impl 全部节点）。超限游戏启动失败，加载期错误不落日志。
- **预算检查命令（可复用）**：`gsts assets:node-graphs nodes --gil map.gil [--json]`
  ——输出所有 impl 展开之和、主图展开、最大贡献者排序、是否达标；`--json` 供脚本消费。
  （原语：`src/cli/static_assembly/graph_edit.ts` 的 `compositeNodeBudget`）
- **膨胀模式 1：函数内联 × 分支**——helper 被 N 分支调用 → N 份展开（如 orbit_trigger 8 turnblock 分支 = 8×turn_one）。
- **膨胀模式 2：变量代替条件展开（2026-08-19 用户方法论）**——"循环/定时器能给 i，就别按条件展开复合"：
  - 有规律（如块索引 0-7）：直接传变量——定时器用 `evt.timerSequenceId` 当 `i` 单次调用（8 分支→1 调用，
    实测 orbit_trigger 1846→753 节点）；循环用循环变量。
  - 无规律：先拼装列表把数据传进去，再按执行次数取变量。
  - 反面：`multipleBranches(值, {0:.., 1:.., ...})` 每分支用不同常量调用同一复合 = 节点爆炸，优先变量化。
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
- **exec 链链接规则（2026-08-20 性能优化实证，勿踩）**：复合内部**入口链首必须是普通 exec 节点**
  （set_list_value / double_branch / destroy_entity 等），复合调用只作**链中/链尾目标**——
  exec 复合调用注册时会 auto-chain（runCompositeCall 单 outflow 尾部把 tail 推进到该 marker），
  **不要再对复合调用 `f.link(f.entry(), 0, 复合调用, 0)`**：显式 link 记对象边 + auto-chain 记裸边
  → compositePins 出现两条相同 InFlow 物理路由 → 编译报
  `GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: compositePins duplicate physical route`。
  正确写法：入口 → 普通节点（f.link 或分支回调），后续复合调用用 f.connect(前置, 0, 复合调用, 0) 显式链
  （connect 会去重裸边）；首个 exec 复合若直接跟在入口后，靠 auto-chain 即可，不要额外 link。
- 优先**纯数据复合**（inputs/outputs 类型声明，build 只算）；需要动作用 registerExecNode + outflows + f.outflow。
- 能力边界：setTimeout 不可用（#3）、dict 图变量读写不可用（#4）、startTimer 可用（float_list 输入）、字面量输入自动包装（#1 已修复）。
- 价值：复用型（多处调用）+ 封装型（单次但职责清晰）；通用型复合（比较/数学扩展）是跨项目资产。
- **复合生命周期管理（2026-08-20 注入事故教训）**：
  - **改名 / 改内部实现 = 安全**：defineComposite 按定义顺序分配 ID，只要不改定义顺序、不删除定义，
    ID 就稳定；注入器 merge 同 ID 覆盖（`tests/injector/composite-reinjection.test.ts` 回归保护：
    name 旧→新、impl 节点数 9→13 均覆盖且不重复追加）。
  - **删除定义 = 危险**：删除 → 后续复合 ID 整体前移 → 注入器 merge 不清理地图残留旧 def →
    残留复合（如 gsts_in_layer）引用被覆盖的 ID（现为另一复合）→ 类型错位 → 游戏拒载（加载期无日志）。
    确实不想要的复合 → **改名保留定义**（如加 `_deprecated` 后缀），不要删除源码定义；
    删除需先完成 open-items O5 治本（注入器残留清理/类型校验，或编译器保留全部定义保 ID）。
  - **任何改变复合集合形状的操作（删/增定义）后注入，必须全量校验**：
    `npx tsx tools/check-gil-composite-refs.ts <地图.gil> --incoming <本次.gia>`（0 悬空 + 残留引用被覆盖检测）。
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
| 一次调用计两次/计数翻倍 | 纯数据表达式被 ≥2 处消费，引擎每个消费点重新求值（消费间写入图变量 → 第二次读新值） | set 后**重新 get** 再比较；ESLint `gsts/server-repeated-evaluation` 会警告（详见 data-flow.md 缺陷 6 节） |
| 位置漂移/朝向错乱 | 公式压缩平行分量 / 轴语义（局部轴） | 见 game-engine-knowledge/motion-devices.md |
| 旋转"只转一半/不到 90°" | **旋转运动器第 4 参是角速度(°/s) 非总角**（0.3s 传 90 → 只转 27°；旧版 1s×90 巧合正确） | 总角 = 时长 × 角速度：0.3s 转 90° 需传 300°/s（2026-08-20 实证，motion-devices.md 已补两种旋转运动器） |
| 转动后块位置与逻辑对不上（部分面错） | **层轴方向与置换表不符**（如 R 用了 -X 应为 +X）——渲染跟随轴转、逻辑跟随表，方向反时两者脱节 | **轴方向几何验证**：对每面取一个初始块，模拟"绕当前轴转 90°"（罗德里格斯）对比 `tblTo[m*4+0]` 目标槽坐标；不一致即轴反（2026-08-20 实证 R/L/F/B 四面反） |
| 动画"重叠/错开"手感反复 | 相位差（4 块启动间隔）过大=错开明显、过小=重叠 | 随机相位差分档收敛：总跨度 34ms 嫌多→13ms 好→8ms 重叠→回调 13ms；用 `getRandomFloatingPointNumber` + 物化到 float_list 变量（start_timer 读变量） |
| GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: compositePins duplicate physical route | 复合内部对**复合调用**节点 `f.link(f.entry(), 0, 复合调用, 0)`：显式 link 对象边 + exec 复合 auto-chain 裸边 → 同一 InFlow 物理路由两条 | 删掉该显式 f.link，靠 auto-chain 生成入口边（入口链首用普通节点，复合调用只作链中目标）；详见上文「exec 链链接规则」 |

## 参考

- 引擎运行时行为（运动器轴语义/公式/层成员）：`docs/game-engine-knowledge/motion-devices.md`
- DSL 架构：`docs/architecture/runtime-dsl.md`；踩坑明细：`references/dsl-pitfalls.md`
- 玩法全流程：`game-from-scratch` 技能；组件/资产：`static-gil-model-builder`