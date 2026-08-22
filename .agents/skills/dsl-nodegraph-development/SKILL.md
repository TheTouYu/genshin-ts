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

## 复合节点铁律（用户 5-7 节点标准，违反后果见 2026-08-22 足球事故）

> **「能做成复合节点的，一定往这个方向靠」——即使未被别处使用也不亏。**
> 用户标准：每层级打开一张图，看到 5~7 个节点；超过 7 个就复合化。
> 详细方法论见 `references/composite-authoring.md`（类型/接口/能力边界/4 种形态）
> 与 `docs/game-engine-knowledge/composite-usage-guide.md`。

**不要让逻辑超过 7 个节点还挤在根图。** 违反后果（2026-08-22 足球阶段 0 实证）：
- 9 个射门分支 × 每分支 5 节点 × 无复合 = 根图 221 节点像"一坨面条"；
- 排查 bug 时必须逐节点解码 221 节点 IR，无法快速定位；
- 游戏运行时帧率劣化、负载爬升。

**编写时即复合化（4 步骤）：**
1. 识别**复用型**块（真正多处调用）或**封装型**块（一件事一个复合）；
2. `g.defineComposite(name, { inputs/outputs/outflows, build })` 显式声明类型；
3. 宿主 `f.callComposite(Com, { … })` 调用；`setTimeout` 与 `f.on(...)` 事件注册留宿主，不进复合；
4. 编译后 `tools/check-gil-composite-refs.ts` 全量校验（删除/改名复合必须走此关）。

**案例对照**（rubik-2x2 v5→v5.5 节点预算战役）：主图 155→15 节点、22 个复合、每层 2-16 节点。

## 输入机制前置条件（实体侧必配，未配直接卡死）

DSL 写 `whenTabIsSelected` / `whenKeyIsPressed` / `whenEntityInteract` 等输入事件，**不等于游戏里能看到 / 触发**——必须先在 **事件源实体**上配好对应组件，事件才会被游戏引擎派发。常见踩坑（2026-08-22 足球阶段 0 实证）：

| 输入机制 | 实体侧必备组件 | 缺失表现 |
|---|---|---|
| **实体选项卡**（`whenTabIsSelected`） | `tabBar` 组件（regionName + options + regionType `box/sphere` + regionSize/regionRadius + regionCenter），通过 `gsts assets:static-assemblies tab-options <id> --name … --options … --region-type … --write` 写回 | 游戏中点不动 / 没选项显示 / 选不触发；节点图根本不会跑 |
| **基础运动**（运动器类节点） | `basicMotion` 组件（基础元件模板 `10005018` 自带 preset=default，其他模板要手动补） | 节点报错：未配置 basicMotion |
| **玩家化身交互** | 玩家实体挂载 `player` 组件 / 交互触发器实体 | `whenEntityInteract` 不触发 |

**强制 gate（编写事件 DSL 前先回答）：**
- 这个事件的事件源实体是哪个？该实体是否已经配置了对应组件？
- 没配置 → 先用 `assets:static-assemblies` 或 `assets:entities` 写回组件（参考 `genshin-ts-asset-operations` 技能 tabBar CLI 用法），再写 DSL。
- 写完 DSL → 注入 → **先用编辑器/游戏目视确认组件槽可见、选项可见、区域半径有效**（生效范围），再交用户测试。仅 `assets:mounts list` 显示 graph 挂上 ≠ 选项卡能用——前者只是图挂载，后者需要 tabBar 组件 + region 同时就绪。

> 完整流程标准：实体的 tabBar 组件配置 + 节点图挂载 + 节点图编译注入，是三件并列的事，缺一不可。rubik-2x2 控制器（2026-08-13 已闭合）是该标准的参考实现。

## 核心流程（每轮一个可归因变量）

```text
设计（数据流思维）→ 能力预验证（最小编译实验）→ 实现 → 编译+IR 断言
→ 注入+真实 GIL 读图核验（强制，用 gil-node-graph-reading）→ 日志验证 → 用户游戏核验
```

1. **设计**：DSL 无可变状态，一切是节点连线。先画数据流（输入事件 → 计算 → 图变量/字典 → 定时器 → 运动器）。
2. **能力预验证**：要用不熟悉的能力（循环、循环内 setTimeout、capture 某类型、dict 操作）前，
   先写最小用例编译（10-30 行），确认编译器支持再写正式代码（P4 实证：循环方案先验证才敢用，避免返工）。
3. **实现**：按受限子集写；每轮只改一个可归因变量（五轮修复链 v5→v5.5 每轮一个根因）。
4. **编译 + IR 断言**：用**正式 CLI** `node ./bin/gsts.mjs dev --config <cfg> --noinject`（或 `npm run dev`）编译，
   检查 `dist/**/*.json` 节点统计（总数、关键节点族）；节点总数须 < 2000。
   ⚠️ **不要用 `npx tsx src/cli/gsts.ts` 直接跑源码 CLI**——gs.ts 的包名 import
   （`'genshin-ts/runtime/core'`）经 Node self-reference 解析到 **dist 发布包实例**，而源码 CLI
   的 runner import **src 实例**，注册与读取分离 → `game.json = []` 且**无任何报错**
   （`All GIA generated (0)`，2026-08-22 足球阶段 0 实证）。正式 CLI（dist 编译产物）两者同实例。
5. **注入 + 真实 GIL 读图核验（强制，勿跳）**：注入地图并 `maps:resync` 后，**必须加载 `gil-node-graph-reading` 技能**，
   用 `parse-gil-node-graph.ts` / `explain-gil-node-graph.ts` 回读真实 `.gil`，逐条核对：
   - 复合定义/调用是否出现、是否挂到预期分支；
   - 执行流是否与源码意图一致：有没有**重复入边**（同一节点两条 InFlow）、**死循环**（分支尾回到入口）、**断链**（链尾节点无后续）；
   - 变量名 pin 完整（`scan-gil-var-pins.ts` 0 违规）；
   - 节点预算、复合引用（`check-gil-composite-refs.ts`）通过。
   不要只依赖 `dump_gil_index` 看节点数；它看不到执行边/重复边。
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
| vec3 字面量 | ⚠️ | **变量声明区** `new vec3([x,y,z])` ✅（`parseScalarLiteral` 支持 `instanceof vec3`）；**事件/分支回调内禁止 `new vec3([...])`**——TS→GS 转换器把它改写为 `new vec3(gsts.f.assemblyList([...]))` → 报 `gsts.f is only available in server_* ctxType`（2026-08-22 足球实证）；回调内一律 `f.create3dVector(x, y, z)`（数据节点，不依赖 gsts.f） |
| 数组字面量 | ✅ | `[c0, c1]` 作 entity_list 值（setNodeGraphVariable/setOrAdd value）；⚠️ **初始列表字面量最多 100 个元素**（2026-08-21 用户确认）——超过需拆成多个 ≤100 列表并用长列表复合（`long_list_get_vec3` for vec3_list / `long_list_get_int` for int_list，内部按 chunkSize 拆分/选择器相加） |
| 字符串拼接 | ❓ | 未验证（用字面量/字典 key 替代） |
| helper 函数 | ⚠️ | **被每个调用点内联**——分支×调用次数=节点爆炸 |

## 节点预算与膨胀模式

- **游戏节点限制 = 单个节点图 3000**（2026-08-19 实证：4043 > 3000 拒载；口径 = 所有复合 impl **递归展开**节点总数，
  复合实例计入其 impl 全部节点）。超限游戏启动失败，加载期错误不落日志。
- **预算检查命令（可复用）**：`gsts assets:node-graphs nodes --gil map.gil [--json]`
  ——输出所有 impl 展开之和、主图展开、最大贡献者排序、是否达标；`--json` 供脚本消费。
  （原语：`src/cli/static_assembly/graph_edit.ts` 的 `compositeNodeBudget`）
- **指标口径**：`implTotal` 是“**主图可达**的每个 impl 图递归展开之和”，会重复计算共享复合，往往大于实际物理节点；
  **未被调用的复合定义不计入**（2026-08-20 修复：旧版把所有 impl 全算，残留死定义会把预算虚高到 3810，实际仅 1664）；
  `--json` 里 `graphs[].direct` 求和才是唯一物理节点数。优化时两个都看：先保证 implTotal <3000，
  再关注 direct 总和（2026-08-20 魔方：direct 551→491，implTotal 3138→2909）。
- **膨胀模式 1：函数内联 × 分支**——helper 被 N 分支调用 → N 份展开（如 orbit_trigger 8 turnblock 分支 = 8×turn_one）。
- **膨胀模式 2：变量代替条件展开（2026-08-19 用户方法论）**——"循环/定时器能给 i，就别按条件展开复合"：
  - 有规律（如块索引 0-7）：直接传变量——定时器用 `evt.timerSequenceId` 当 `i` 单次调用（8 分支→1 调用，
    实测 orbit_trigger 1846→753 节点）；循环用循环变量。
  - 无规律：先拼装列表把数据传进去，再按执行次数取变量。
  - 反面：`multipleBranches(值, {0:.., 1:.., ...})` 每分支用不同常量调用同一复合 = 节点爆炸，优先变量化。
  - **具体落法（2026-08-21 3×3 视觉图重构实证）**：`multipleBranches`/`doubleBranch` 自带 join（
    `setCurrentExecTailEndpoints`），所以分支里**只 set 变量参数**，分支后**只调用一次**统一复合：
    ```ts
    // 根图：分支只构造变量，不调用复合
    f.multipleBranches(timerName, {
      'a': () => { f.setNodeGraphVariable('mode', 0n, false); f.setNodeGraphVariable('base', 0n, false) },
      'b': () => { f.setNodeGraphVariable('mode', 1n, false); f.setNodeGraphVariable('base', 7n, false) },
      default: () => {}
    })
    // join 后单次调用统一处理器（分支 N 份复合调用 → 1 份）
    f.callComposite(handleTimerEvent, { target, seq })
    ```
    复合内部再按 `mode` 分派到子复合。这样 10 个 timer 分支从“10×复合展开”降为“10×set 变量 + 1 次复合调用”。
- **循环体只物化 1 次**：finite_loop 循环体 1 份（2400→240 节点，P4 实证）。
- **capture 字典机制**：每个 setTimeout 回调的捕获变量 = set_or_add + get_corresponding 链（~6 节点/回调）；
  回调越多越贵。
- **常量/恒等表直接字面量/槽位，不要用变量读**（2026-08-20 魔方优化实证）：`wholeFrom` 恒为 identity、
  `targetPos/targetOrient` 恒为初始态，改成字面量比较/直接用 slot 后 implTotal 3138→2909（达标），
  并顺带移除诊断 print/事件监听。每次“表是常量”都先确认是否真的需要变量读。
- 节点统计脚本：`node -e "读 dist/**/*.json，统计 nodes 类型分布"`（IR 是数组格式，取 docs[0].nodes）。

## 值类型与 capture 限制

| 主题 | 结论 |
|---|---|
| 循环变量 | `let i = 0` → **float**（转 `float(i)`）；`let i = 0n` → **int**——int 参数必须 bigint 循环 |
| capture vec3 | ❌ DSL 方法返回的 vec3 捕获报 `any`（capture 只支持可推断类型）→ 用图变量/字典中转 |
| capture 支持 | str/int/bool/float/entity/vec3 等字面可推断类型；不支持 dict/复合结果 |
| 字典 key | 必须 int/str 等键类型；传 float 报 `Invalid value type: int` |
| 列表下标 | `getCorrespondingValueFromList` **0-based**（1..N 会越界返回空） |
| 全 0 int_list 图变量 | **引擎运行时只物化出很短长度**（日志 2765 实证：`cornerOrient` 声明 8 个 0 → 运行时 `[0,0]`；`edgeOrient` 声明 12 个 0 → 运行时 `[0,0,0]`），读取高下标会“列表索引越界”。且**写 0 到越界下标不扩容**（日志 2766：logicReset 写 0 后仍短）；必须先写非 0 哨兵撑满长度，再写真实 0 值（两阶段复位），或避免全 0 字面量。 |
| 返回字段名 | `getEntityLocationAndRotation` 返回 `{ location, rotate }`（**rotate** 不是 rotation） |
| 向量分量 | vec3 有 `.x/.y/.z` getter（生成 split3dVector 节点）；但 **`f.split3dVector(v)` 的返回值字段是 `xComponent/yComponent/zComponent`，不是 `.x/.y/.z`**（`.x` 是 vec3 的 getter，不是 split3dVector 返回对象的字段）——写 `s.x` 会得到 `undefined` → `create3dVector` 报 `Invalid value type: float`（2026-08-22 复刻矩阵转置实证） |
| 复合节点 enum 输入 | ❌ **复合节点 `inputs` 声明 `{ type: 'enumeration' }` 后，build 内 `f.enumerationsEqual(status, ...)` 报 `Invalid value type: enum`**——`createTypedValue` 缺 enum 分支，enum 输入落到 `new generic()`，不满足 `parseValue(..., 'enum')` 的 `instanceof enumeration` 检查（2026-08-22 复刻枚举转换实证，已登记 O-2026-08-22-1）。**枚举转换类复合节点暂无法用 DSL 复刻**，需等编译器修复 |
| 三角函数 | `cosineFunction/sineFunction`（弧度输入；角度需乘 π/180） |

## 复合节点编写（2026-08-14 方法论，详见 game-from-scratch/references/composite-authoring.md）

> ### 🔴 铁律：`finiteLoop` 循环体的“入口 exec 节点”必须是 `f.registerExecNode(...)` 或高层 flow API；`f.node()` 只能用于已被高层 flow 节点包裹后的子节点
>
> **2026-08-20 3×3 魔方日志 2763/2764 实证**：
> - 循环体内第一个节点用 `f.node('set_list_value')` → 循环控制帧有、`Set List Value` 帧 0、`tempP` 全 0；
> - 循环体外的 doneNode 用 `f.node('set_node_graph_variable')` → Loop Complete `OutFlow[1]` 不会自动续到它，
>   复合 `done` 永不触发，后续 `start_timer` 零帧。
>
> 根因：`f.node()` 是 detached 创建，不会成为循环体 `OutFlow[0]` 的入口；只有 `f.registerExecNode(...)`
> 或高层 flow API（如 `f.doubleBranch(...)`）才会被 `finiteLoop` 自动接进执行链。
>
> 🔴 **同族铁律：任何多出口执行流节点（`f.doubleBranch` / `f.multipleBranches` / `f.connectOutFlow` /
> `finiteLoop` 的 Branch）的回调体里，第一个 exec 节点也必须用 `f.registerExecNode(...)`，或用
> `f.link`/`f.connect` 从分支源显式接上；`f.node()` 是 detached，不会自动挂到分支出口。**
> （2026-08-20 3×3 日志 2765 实证：`logic_is_solved` 的 `f.doubleBranch` true 分支里用
> `f.node('set_node_graph_variable')` → 分支条件为 true 但 Set Node Graph Variable 帧为 0，
> `solvedFlag` 一直是 true → 转动一次立即结算胜利。读图可见 `Double Branch true → (无)`；
> 改用 `f.registerExecNode` 后 `true → Set Node Graph Variable`。）
>
> 正确写法（循环体入口用 registerExecNode）：
> ```ts
> f.finiteLoop(0n, 3n, (i) => {
>   f.registerExecNode('set_list_value', [tempP, i, piece])
>   f.registerExecNode('set_list_value', [tempT, i, twist])
> })
> const done = f.registerExecNode('set_node_graph_variable', [new str('turnLastSlot'), ..., new bool(false)])
> f.outflow('done', done, 0)
> ```
>
> 正确写法（循环体入口用高层 flow API，分支体内 exec 节点用 registerExecNode）：
> ```ts
> f.finiteLoop(0n, N - 1n, (i) => {
>   f.doubleBranch(cond, () => {
>     const setQ = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [...])
>     const setM = f.registerExecNode('set_node_graph_variable', [...])
>     f.connect(setQ, 0, setM, 0)
>   }, () => {})
> })
> ```
>
> 错误写法（循环体入口直接 f.node，日志里零执行/不触发 done）：
> ```ts
> f.finiteLoop(0n, 3n, (i) => {
>   f.node('set_list_value', [tempP, i, piece]) // ❌ 作为循环体入口，detached，不执行
> })
> const done = f.node('set_node_graph_variable', ...) // ❌ 不会自动接 Loop Complete
> f.outflow('done', done, 0)
> ```
>
> 读图验证：`explain --composite` 应看到 `Finite Loop Branch[0] → (registerExecNode/高层节点)` 和
> `Branch[1] → doneNode`；若只有 `Finite Loop` 控制帧、没有循环体写入帧/没有 done 链，就是这个坑。

- 调用：f.callComposite(handle, { 输入名: 值 })；多输出 res.输出名；嵌套/循环内可调用。
- **exec 链链接规则（2026-08-20 性能优化实证，勿踩）**：复合内部**入口链首必须是普通 exec 节点**
  （set_list_value / double_branch / destroy_entity 等），复合调用只作**链中/链尾目标**——
  exec 复合调用注册时会 auto-chain（runCompositeCall 单 outflow 尾部把 tail 推进到该 marker），
  **不要再对复合调用 `f.link(f.entry(), 0, 复合调用, 0)`**：显式 link 记对象边 + auto-chain 记裸边
  → compositePins 出现两条相同 InFlow 物理路由 → 编译报
  `GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: compositePins duplicate physical route`。
  正确写法：入口 → 普通节点（f.link 或分支回调），后续复合调用用 f.connect(前置, 0, 复合调用, 0) 显式链
  （connect 会去重裸边）；首个 exec 复合若直接跟在入口后，靠 auto-chain 即可，不要额外 link。
- **声明了 `outflows: ['done']` 的 exec 复合必须显式 `f.outflow('done', 链尾, 0)`**：否则被调用方把该复合当作链中一环时，done 永不触发，后续节点零帧（2026-08-20 魔方整体转/面转：turnblock 回调里 unlock 定时器永不注册，lock 卡 true、第二次操作无响应）。
- **公共 done/merge 节点不要用 `registerExecNode` 放在 `doubleBranch` 之前**（2026-08-20 魔方日志：游戏检测 execution flow loop）。`registerExecNode` 会被 auto-chain 成 doubleBranch 的入口，分支尾再连回它就形成 `分支尾 → 公共节点 → Double Branch → … → 分支尾` 死循环。正确写法：公共节点用 `f.node(...)` 创建 detached，分支尾 `f.connect(..., 0, doneNode, 0)` 连入，最后 `f.outflow('done', doneNode, 0)`；读图应看到 boundary `InFlow` 直连 Double Branch，且 done 节点没有回到分支入口的执行边。
- **`f.callComposite(...)` 后跟 `f.registerExecNode(...)` 会产生重复执行**（2026-08-20 魔方日志 2777：Start Timer 同一节点执行两次，定时器不触发、指令无反应）。`registerExecNode` 会从当前尾（通常是上一个复合调用）auto-chain 到它；如果你又显式把复合调用 done 连到一条 `f.node` 链再连到该节点，该节点会有两条入边、执行两次。需要把这类链尾的 `registerExecNode` 改成 `f.node` 并显式 `f.connect`，只保留一条入边。
- **`start_timer` 延迟列表不要用 0.0**：0s 定时器实测不触发（2026-08-20 3×3 魔方：execMove 用 0s 汇聚定时器，日志只有 Start Timer 帧、没有 When Timer Is Triggered，导致锁卡 true 无反应）；需要“立即/下一帧执行”时用 `[0.01]` 等小正数。
- **`finiteLoop` 循环体内不要用 `f.node()` 创建 exec 节点**（2026-08-20 3×3 魔方日志 2763 实证：循环控制帧有、`Set List Value` 帧 0，`tempP` 全 0）。`f.node()` 是 detached 创建，不会自动接进循环体执行链；循环体内 exec 节点必须用 `f.registerExecNode('set_list_value', [...])`（或高层 flow API），节点图读图会看到 `Finite Loop Branch[0] → Set List Value`。循环后的普通节点用 `f.node()` 仍可被 Loop Complete OutFlow[1] 自动续接（读图已确认）。
- **`finiteLoop` 的“完成流”不会自动续到循环后的节点**（2026-08-20 3×3 魔方日志 2762 实证：logic_apply_* 的 finiteLoop 全部执行，但循环后的 doneNode/start_timer 零帧）。需要循环后继续执行时，两种可靠写法：①把后续动作放进循环体最后一个迭代（`f.doubleBranch(f.equal(loopVar, N-1n), () => { ... }, () => {})`）；②在 build 里用 JS `for` 编译期展开并显式 chain。不要依赖 finiteLoop 之后的顺序语句自动续链。
- **🔴 `finiteLoop(start, end)` 是闭区间 `[start, end]`，迭代次数 = `end - start + 1`**（2026-08-20 日志实证：`finiteLoop(0n, 4n)` 实际执行 0..4 共 5 次）。要执行 N 次必须传 `end = start + N - 1n`，例如 4 次写 `finiteLoop(0n, 3n)`。写错会多读一个表项/多写一个越界下标，导致状态错乱。
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

### 推荐稳定 API / 待弃用 API（2026-08-20 实证）

当前最容易踩的两个 API 组合已经形成稳定替代写法，**新代码一律按“稳定写法”写**；旧代码逐步迁移。编译器后续应把不稳定 API 标为 deprecated 或提供更安全的封装（见 `docs/maintenance/open-items.md` O-2026-08-20-4）。

| 场景 | ❌ 不稳定写法 | ✅ 稳定写法 |
|---|---|---|
| 分支/循环后的**公共 merge/done 节点** | `f.registerExecNode(...)` 放在 `f.doubleBranch` 之前，再让分支尾连回它 | `f.node(...)` 创建 detached 公共节点；分支尾 `f.connect(..., 0, doneNode, 0)`；最后 `f.outflow('done', doneNode, 0)` |
| `f.callComposite(...)` 之后的**链尾 exec 节点**（如 start_timer） | `f.registerExecNode('start_timer', ...)`（会被 auto-chain 从复合调用 done 再拉一条入边，导致同一节点执行两次） | `f.node('start_timer', ...)` + 显式 `f.connect(前置, 0, t, 0)` |
| 循环体/分支回调的**第一个 exec 节点** | `f.node(...)`（detached，不会自动挂进执行链） | `f.registerExecNode(...)` 或高层 flow API（这是 `registerExecNode` 的正确使用场景） |
| `f.doubleBranch` 的 **false 分支**第一个 exec 节点（兜底/else 路径） | `f.node(...)`（detached，false 分支边丢失，兜底失效） | `f.registerExecNode(...)`。**注意**：true 分支常以 `f.callComposite` 开头（自动设 headNodeId，边正常），false 分支常是单节点兜底，最容易漏——写 else 兜底时先自查这一行 |

判断口诀：

- **需要“自动接进当前执行链”的第一个节点** → `f.registerExecNode`。
- **需要“显式连线、作为链中/链尾/公共 merge”的节点** → `f.node` + `f.connect`。
- 写完必须读图确认：同一节点只有一条 InFlow 入边；公共 done 不回到分支入口。

### 跨图拆分逻辑（2026-08-21 规划，依赖编译器复合 ID 稳定性）

当单图接近 3000 且职责边界清晰时，可拆到第二个节点图：

- **共享状态桥**：用控制器实体自定义变量（`setCustomVariable` / `getCustomVariable`）跨图共享
  `blocks/tempP/centerPos/curMove/定时参数` 等；视觉图在事件处理开始时 `setNodeGraphVariable`
  把自定义变量同步进本图图变量，现有复合可继续用 `getNodeGraphVariable` 不变。
- **职责划分**：主图保留输入/逻辑/`execMove`/`unlock`；视觉图处理 `turnblock`/`orbit2` 与运动。
- **🔴 跨图复合不能引用目标图没有的图变量（2026-08-21 实证）**：视觉图若调用主图复合（如
  `flow_after_turn`，内部读 `autoMode/qIdx/queue/lock` 等主图变量），GIA 编码会报
  `ordinary data edge pin type mismatch`。跨图调用前必须确认被调复合只依赖本图已声明的图变量，
  否则把该逻辑留在主图，视觉图只发信号/定时器过去。
- **🔴 跨图共享状态同步：每次操作首个事件同步一次，不要每 tick 同步（2026-08-21 性能实证）**：
  主图开定时器前已把共享状态写入视觉宿主自定义变量；视觉图若在每个 `turnblock`/`orbit2` 事件都
  `syncShared`，面转 16 次/整体转 52 次重复同步，单次转动负载飙到 ~5000-10000。正确做法：
  在 `base==0 && seq==0` 的首次 turnblock 事件里同步一次，后续事件直接用图变量。
- **前置条件**：必须先解决复合定义/调用/实现三要素的 ID 稳定性（O-2026-08-20-5），否则新增图会导致
  残留 def 引用被覆盖 ID（`check-gil-composite-refs` 报类型错位）。
- **流程**：建占位图 → 注入 → `assets:mounts attach` → 读图核验两个图的 MB/执行流 → 用户测试。

### 长定时器列表避免重复的稳定做法（2026-08-20 用户建议）

引擎定时器延迟精度为两位小数；**同一个 `start_timer` 的延迟列表内不能出现重复值**（不同定时器名字不同则互不影响）。
当需要很多个错开时间（如整体转 26 块）时，不要硬塞进一个长列表导致延迟被推到 0.7s，而是：

- 拆成多个不同名字的定时器（如 `turnblock0..3`、`orbit20..3`），每个定时器内部用少量两位小数唯一值（如 0.01..0.07）；
- 不同定时器之间可以复用相同时间序列，因为名字不同；
- 在 `whenTimerIsTriggered` 的 `multipleBranches` 里按 `timerName` 映射 `base` 偏移，`slot = base + timerSequenceId`；
- 最后一个 chunk 的最后一个 slot 再触发 unlock（`slot == turnLastSlot`）。

这样既满足“单个定时器内不重复”，又把总延迟控制在低范围。

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
| `gsts.f is only available in server_* ctxType (current: javascript)` | 事件/分支回调内写了 `new vec3([x,y,z])`——转换器改写为 `new vec3(gsts.f.assemblyList([...]))`，`gsts.f` 只能在 `server_*` ctx 访问 | 回调内用 `f.create3dVector(x, y, z)`；变量声明区 `new vec3([...])` 不受影响（2026-08-22 足球实证） |
| 编译全通过但 `game.json = []`（`All GIA generated (0)`，无报错） | `npx tsx src/cli/gsts.ts` 直跑源码 CLI：gs.ts 包名 import → dist 实例（self-reference），runner → src 实例，注册/读取分离 | 用正式 CLI `node ./bin/gsts.mjs dev`（或 `npm run dev`），两者同实例（2026-08-22 足球实证） |
| 实体不动但节点执行 | 缺 basicMotion 组件（type 4）或作用空实体 | 组件差分检查 + 日志查运动器 IN0 实体 |
| 一次调用计两次/计数翻倍 | 纯数据表达式被 ≥2 处消费，引擎每个消费点重新求值（消费间写入图变量 → 第二次读新值） | set 后**重新 get** 再比较；ESLint `gsts/server-repeated-evaluation` 会警告（详见 data-flow.md 缺陷 6 节） |
| 位置漂移/朝向错乱 | 公式压缩平行分量 / 轴语义（局部轴） | 见 game-engine-knowledge/motion-devices.md |
| 旋转"只转一半/不到 90°" | **旋转运动器第 4 参是角速度(°/s) 非总角**（0.3s 传 90 → 只转 27°；旧版 1s×90 巧合正确） | 总角 = 时长 × 角速度：0.3s 转 90° 需传 300°/s（2026-08-20 实证，motion-devices.md 已补两种旋转运动器） |
| 物理模拟用定点运动器 `activateFixedPointMotionDevice` 填 `move_speed=0`（球不动/行为异常） | 定点运动器是"移动到 target_position"（绝对位置），`move_speed` 是移动速度标量，填 0 语义错误；物理模拟应表达"以速度 v 移动 dt" | **物理模拟用匀速直线运动器 `addUniformBasicLinearMotionDevice`（velocity 速度向量 + duration）**，不用定点运动器；定点运动器只用于"瞬间移动/复位"（INSTANT 模式，move_speed 无意义）（2026-08-22 足球实证） |
| 球/刚体绕世界轴 ω 自旋，旋转运动器 axis 传错（自旋轴漂移） | 旋转运动器 `addUniformBasicRotationBasedMotionDevice` 的 axis 是**实体局部轴**；但绕世界轴 ω 自旋时，ω 是旋转轴，`R^T·ω = ω`（ω 是 R 的特征向量），所以**局部轴恒等于世界轴 ω** | 球绕世界轴 ω 自旋：axis 直接传 ω 方向（`_3dVectorNormalization(ω)`），angVel = `|ω|·180/π`（rad/s → °/s），无需每 tick 重算局部轴（2026-08-22 足球实证） |
| 黑面/朝向错乱但位置正确 | 生成“欧拉→朝向表/局部轴表”时用错约定：`rotate` 返回 **(x,y,z)**，矩阵 `R=Ry(y)·Rx(x)·Rz(z)`；曾误用 (y,x,z)+Rz·Rx·Ry | 先读 `motion-devices.md` §3；生成器参考 `examples/rubik-3x3/tools/gen-orient-tables.mjs`，并用已知样本断言（如 (x=90,y=270,z=0)→索引 17） |
| 转动后块位置与逻辑对不上（部分面错） | **视觉层轴方向与逻辑置换表方向不一致**——渲染跟随轴转、逻辑跟随表，方向反时两者脱节（2026-08-20 日志 2768 实证：L 轴用了 -X，DBL 实体应到 UBL 却到了 DFL）。这不是编译器 bug，也不是性能问题，而是**数据表/视觉层坐标契约没对齐** | **通用规则**：`axes` 不是通用常量，必须与当前项目的逻辑表 `ROT` 一一对应；每个项目独立做“取一个初始块，模拟绕当前轴转 90°（罗德里格斯）对比 `tblTo` 目标槽坐标”的几何验证，不一致就翻转对应轴。**具体值只在本项目有效**：3×3 按逻辑表 ROT 为 R=-X、L=+X、F=-Z、B=+Z（U/D 不动），不要直接照抄 2×2 axes 注释 |
| 动画"重叠/错开"手感反复 | 相位差（4 块启动间隔）过大=错开明显、过小=重叠 | 随机相位差分档收敛：总跨度 34ms 嫌多→13ms 好→8ms 重叠→回调 13ms；用 `getRandomFloatingPointNumber` + 物化到 float_list 变量（start_timer 读变量） |
| GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: compositePins duplicate physical route | 复合内部对**复合调用**节点 `f.link(f.entry(), 0, 复合调用, 0)`：显式 link 对象边 + exec 复合 auto-chain 裸边 → 同一 InFlow 物理路由两条 | 删掉该显式 f.link，靠 auto-chain 生成入口边（入口链首用普通节点，复合调用只作链中目标）；详见上文「exec 链链接规则」 |
| 读图看到 `Double Branch false → (无)` / 分支体零帧 / 兜底 done 永不触发 | **`f.doubleBranch` 的 false 分支回调里第一个 exec 节点用了 `f.node()`**（detached，不设 headNodeId → `withExecBranch` 弹出时不生成 false 分支边）。**尤其易漏**：true 分支常以 `f.callComposite` 开头（自动设 headNodeId，边正常），false 分支常是单节点兜底（如 `set_node_graph_variable`），一用 `f.node` 就断链 | false 分支回调第一个 exec 节点改用 `f.registerExecNode(...)`（或高层 flow API）；读图应看到 `false → <节点>`（2026-08-23 魔方打乱守卫实证：`f.node` 让非法 moveId 兜底失效，done 永不触发） |

## 通用复合节点模式库（2026-08-22 来自「常用复合节点大全 v1.7」资源包）

> 社区作者「左岸丶寒」整理的 87 个通用复合节点，按功能分 13 类资源包，已落盘到
> `docs/composite-library/`（README 是总览，各资源包文档含用途/节点清单/通用方法论/复用提示）。
> 写玩法前先查这里有没有现成模式可抄，别从零造轮子。下面是**跨资源包、真正通用**的提炼：

### 高频「三段式」骨架（直接套）

| 骨架 | 形态 | 适用 |
|---|---|---|
| 变量运算 | `Get 变量 → 运算 → Set 变量` | 计数/累加/状态自增（+1/-1/±N） |
| 列表遍历 | `查列表 → 遍历 → 取值` | 任何「对多个实体做同一件事」 |
| 随机取一 | `Get List Length → Get Random → 取值` | 从任意列表随机取一个 |
| 位置生成 | `算位置 → Create Prefab` | 生成类玩法（位置来源可配置） |
| 事件动作 | `监听事件 → 执行动作` | 隐藏/碰撞/UI 触发等简单响应 |

### 关键技巧（跨领域通用）

- **动态列表转静态**：遍历列表的同时销毁/删除/移动列表元素，会导致列表长度变化、索引错乱。
  先 `Set Local Variable` 复制成静态快照，再遍历快照操作。**任何「遍历时改列表」都要先转静态**。
- **哨兵值 + 自增**：用 `-1` 作「未开始」哨兵，+1 后正好是第一个元素（如顺序发言序号默认 -1）。
- **空模型当结构体**：节点图没有结构体类型，用「空实体 + 多个自定义变量」模拟多字段数据聚合，
  减少负载（作者明确「可替代结构体使用」）。
- **跨实体读写变量**：`Query Entity by GUID → Get/Set Custom Variable`，是跨图/跨实体数据共享的标准模板。
- **数值封顶**：累加时用 `Take Smaller Value` 限制上限。
- **枚举转值**：`Enumerations Equal` 逐项判断（one-hot）+ 加权求和（转整数）/ 查表（转字符串）/
  `Multiple Branches`（转执行分支）。枚举项多时查表法更省节点。

### 负载意识（节点图不是免费算力）

- **重操作拆帧/间隔**：批量销毁、矩阵运算等重操作要间隔执行（作者：批量销毁间隔 0.1s 防炸图；
  矩阵求逆单次 120ms，不要每帧调用）。
- **选对数据结构比优化算法更有效**：同一功能「向量形式」3 节点低负载 vs「列表形式」8 节点 300ms，
  差 100 倍（作者留作反例）。
- **轮询 vs 事件按频率选**：持续状态用轮询（全局计时器，间隔越短负载越高——1s 约 50ms、0.06s 约 800ms），
  离散事件用事件监听（`When Entity Is Removed` 等）。频率高选轮询，频率低选事件。
- **局部变量优先于节点图变量**：作用域小、无持久化开销，能省就省（作者排名节点 v2 用局部变量替代节点图变量）。

### 复用前置条件（复用前必查）

作者在每个复合节点注释里都写明了依赖，复用前先满足：
- 挂载位置（关卡实体 / 玩家实体 / 角色实体 / 任意实体）；
- 依赖变量（如「关卡实体挂全局计时器 Update + 图变量 time」「玩家实体挂排名依据变量」）；
- 定时器名不重复（多块并发用 `dataTypeConversion(i, 'str')` 生成唯一名）。

### 注释是资源包的核心价值

**没有注释的复合节点无法复用**。写复合节点时，注释要写清：用途 / 依赖（挂载哪、需要哪些变量）/
负载 / 注意事项。这是「可复用资源包」与「一次性代码」的分水岭。

## 参考

- 引擎运行时行为（运动器轴语义/公式/层成员）：`docs/game-engine-knowledge/motion-devices.md`
- DSL 架构：`docs/architecture/runtime-dsl.md`；踩坑明细：`references/dsl-pitfalls.md`
- 玩法全流程：`game-from-scratch` 技能；组件/资产：`static-gil-model-builder`
- 通用复合节点资源库（13 类，可直接抄）：`docs/composite-library/README.md`