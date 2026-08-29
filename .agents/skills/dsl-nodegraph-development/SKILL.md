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

**定时器/事件与图挂载对齐（2026-08-24 rubik-3x3 “面转无反应”实证）**：写 `f.node('start_timer', [target, 'turnblock', ...])` 这类跨图定时器时，先回答“定时器发到哪个实体、监听它的图挂在哪”：
- 反向 name 定位：`gsts assets:mounts list --gil <map>` 查每张图挂到哪个实体；`target` 实体的 choice 与 visualHost 常量要一致。
- 典型事故：`flow_do_move` 把 `turnblock/orbit2` 发到 `visualHost=1077936203`，但视觉图挂在主控制器 `1077936201` → 图永远收不到槽位定时器，只有跨实体发错时漏进来的一发事件，表现为“只看到一个块动/完全没反应”。
- 判断字段：日志里 `When Timer Is Triggered` 事件的 `OUT0/OUT1(entity/guid)` = 定时器 target 实体；对比 `assets:mounts list` 中监听的图挂载实体。

**定时器延迟单位：f.startTimer 用秒、setTimeout 用毫秒（2026-08-27 足球实证，必守）**：
`f.startTimer(e, name, loop, [延迟])` 的延迟参数单位是**秒**（日志 IN3 实证：push_lock `[0.25]`=250ms）；
**setTimeout 的 delayMs 单位是毫秒**（DSL 内部转秒）。事故：`[200]` 以为是 200ms 实为 **200 秒**，
日志 57 秒内定时器从未触发。自查：对照同族已验证调用（如 dribble 的 `[LOCK_MS]`，注释写明"秒"）。

**官方节点依赖 buff 的降级方案（2026-08-28 足球带球实证）**：
`queryCharacterSCurrentMovementSpd` 等官方节点**仅当角色挂对应单位状态效果（buff）时才能查询**，
buff 是编辑器手动挂载、易丢失、不可代码校验。日志里 `OUT0:Float=空`/`OUT1:Vector=(0,0,0)` = buff 未挂。
**降级方案**：位置差分测速——`roleVel = (当前实体位置 − 上一 tick 位置) × (1/DT)`，存图变量 lastPos，
不依赖任何编辑器前置。凡"官方节点需挂 buff"都要评估降级方案。

**排查"球/实体不动"三层核对法（2026-08-28 足球实证）**：
逻辑值 ≠ 渲染值。排查"不动/跟不上"必须同时核对三层，缺一层就误判：
1. 逻辑位置（ballPos 图变量）
2. 实体实际位置（getEntityLocationAndRotation 的 OUT0）
3. 运动器参数（Add Uniform 的 IN3 速度 + 旋转运动器 IN3 角速度）
三层一致才说明渲染正确。只盯逻辑值会误判"球在滚"（实际渲染没动）。

**定时器链路排查顺序（不甩锅引擎）**：
1. 数复合调用次数（如 auto_check_tick 帧数）确认定时器是否真的触发——别只看结果埋点（埋点可能只在条件分支里）
2. 对比同族定时器（同图/同实体/同参数）的日志 IN3 延迟值与触发次数
3. 核对 startTimer 实体参数 vs 图挂载实体（`assets:mounts list` + When Timer Is Triggered 的 OUT0/OUT1）
4. 实体创建太早（whenEntityIsCreated time 0~1）时定时器可能注册失败——setTimeout 延迟几秒再启动
5. **最后才怀疑引擎**——引擎稳定，先怀疑参数/实体/时序

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
5. **注入 + 真实 GIL 读图核验（强制，勿跳）**：
   - 🔴 **注入命令的输出必须整段核对，禁止 `grep | tail` 只看尾巴**（2026-08-26 rubik 2906 事故：`[error] gs_to_ir_json failed: turn.gs.ts` 被 tail -2 截断，修复“看似注入”实则游戏一直跑旧图，用户两次复测同一症状才发现）：
     ① grep `error`（必须 0 行） ② 确认 `All injections done (ok 6, fail 0)` 整行、ok 数=图数 ③ 任何图失败都要先修。
   - 🔴 **读图核验要核到「条件节点的数据流来源」**，不能只看执行流结构（同 2906 事故：分支结构正确，但 LessThan 的输入仍是旧 Addition 而非新 Get——结构对 ≠ 数据流对）；关键条件节点（DoubleBranch/MultipleBranches 的控制输入）必须核其上游一路到源。
   - 注入地图并 `maps:resync` 后，**必须加载 `gil-node-graph-reading` 技能**，
   用 `parse-gil-node-graph.ts` / `explain-gil-node-graph.ts` 回读真实 `.gil`，逐条核对：
   - 复合定义/调用是否出现、是否挂到预期分支；
   - 执行流是否与源码意图一致：有没有**重复入边**（同一节点两条 InFlow）、**死循环**（分支尾回到入口）、**断链**（链尾节点无后续）；
   - 变量名 pin 完整（`scan-gil-var-pins.ts` 0 违规）；
   - 节点预算、复合引用（`check-gil-composite-refs.ts`）通过。
   不要只依赖 `dump_gil_index` 看节点数；它看不到执行边/重复边。
6. **日志验证**：用户运行后解析 Beyond_Debug_Log，逐帧核对输入输出（见 debug-log-investigator）。
7. **游戏核验**：用户最终确认行为（编译/注入成功 ≠ 游戏行为正确——v5.1 注入成功但 layers 空实体不动）。

### 修复交付前验证清单（C1，六项一次性过；2026-08-29 二轮复盘 R2 聚合）

> 六项散落在本技能各处（第 5 步、复合引脚禁令、期望日志签名），此处聚合为单点清单——
> 任何"修复/交付"在报告"已修复/待测试"前按序过一遍（R5 验证链盲区族 8+ 次命中的系统性防线）：

1. **注入输出整行核对**：grep error 必须 0 行 + All injections done (ok N, fail 0) 整行 + **退出码**
   （禁止 | tail /管道判退——08-29 quicktest 误读"成功"再犯）。
2. **读图核验含数据流**：关键条件节点（DoubleBranch/MultipleBranches 控制输入）核其上游一路到源，
   不只核执行流结构（2906 事故）。
3. **回读无悬空引脚**：复合调用点 call node 的 inputs/outputs 无悬空（2956 黑块回归：outputs 悬空
   next:Integer）；check-gil-composite-refs 通过。
4. **离线验证标注"不含"清单**：任何离线/本地验证（算法脚本、编译产物、静态读图）必须显式写清
   **不含**哪些运行时语义（越界读 2964 / 握手漏发 2976 / 事件链），需要时补日志/游戏核验。
5. **改动执行链提醒看渲染**：动了执行/运动链，明确提醒用户游戏内重点看渲染结果（逻辑值对 ≠ 渲染对，
   08-28 带球）。
6. **回归先 diff 自己最近一轮改动**：出现回归先 git diff 自己最近一轮改动，而不是从零排查
   （2956 黑块回归由 37584a8 引入）。

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
| 局部变量列表字面量 | ⚠️ **server 静默丢值** | `f.initLocalVariable('int_list', [1,2,3])` / setLocalVariable 的列表字面量在 **server 图编译成功但值被丢弃**（只写空类型锚，`tests/assembly_dictionary_cases.ts` "List values have no literal form"）——server 列表值必须来自数据流（`f.assemblyList` 拼装列表节点）；**client 图支持列表字面量**（完整写入 bArray.entries，形态无编辑器样本未 verified）——server/client 不对称（2026-08-29 复盘实证，O-29-07） |
| 字符串拼接 | ❓ | 未验证（用字面量/字典 key 替代） |
| helper 函数 | ⚠️ | **被每个调用点内联**——分支×调用次数=节点爆炸 |

## 节点预算与膨胀模式

- **游戏节点限制 = 单个节点图 2000**（2026-08-27 用户更正：不是 3000；引擎在 3000+ 拒载——4043/3270 实证——但生产红线是单图 ≤2000。
  口径 = 所有复合 impl **递归展开**节点总数，复合实例计入其 impl 全部节点）。超限游戏启动失败，加载期错误不落日志。
- **预算检查命令（可复用）**：`gsts assets:node-graphs nodes --gil map.gil [--json]`
  ——输出所有 impl 展开之和、主图展开、最大贡献者排序、是否达标；`--json` 供脚本消费。
  （原语：`src/cli/static_assembly/graph_edit.ts` 的 `compositeNodeBudget`）
- **指标口径**：`implTotal` 是“**主图可达**的每个 impl 图递归展开之和”，会重复计算共享复合，往往大于实际物理节点；
  **未被调用的复合定义不计入**（2026-08-20 修复：旧版把所有 impl 全算，残留死定义会把预算虚高到 3810，实际仅 1664）；
  `--json` 里 `graphs[].direct` 求和才是唯一物理节点数。优化时两个都看：先保证 implTotal <3000，
  再关注 direct 总和（2026-08-20 魔方：direct 551→491，implTotal 3138→2909）。
- **游戏内真值优先 + 删图差分定位（2026-08-23 3×3 求解器实证）**：本地 `engineExpanded`/回归公式**偏小**，游戏内"节点图数量"才是 gate；
  出现"3054 超标"且不确定是哪张图时，先让用户**删除某张主图看能否进图**做差分，精准定位超限图再动刀
  （本轮先误判 solver 图、拆分后仍 3054，实为 game 主图；删主图实验才定位）。
- **根图事件回调 ≠ 复合 build（2026-08-23 实证，两次复现）**：在 `g.server().on(...)` 的事件回调里，
  `f.registerExecNode('set_node_graph_variable', [混合字面量数组])` 会被改写为 `gsts.f.assemblyList(...)`
  导致 `Generic parameter not matched`；根图事件回调改变量一律用高层 `f.setNodeGraphVariable(name, value, override)`，
  循环体/分支回调内才用 `registerExecNode`。同样的坑也出现在根图里直接 `start_timer` + `assemblyList`——计时器注册要挪进复合。
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
- **Multiple Branches 命名 case 硬上限 = 10（2026-08-27 3×3 整转回归实锤）**：引擎该节点只支持
  **10 个命名 case + 1 个 default（共 11 outflow）**；超过 10 命名 case 时，第 11/12…个 case 的
  分支体被引擎丢弃成**孤立执行链**（事件落入 default），无任何编译/注入报错——静默丢分支。
  编译器 src/compiler/ir_to_gia_transform/optimize_timer_dispatch.ts 有 MAX_TIMER_DISPATCH_CASES=10，
  但该 chunking 优化只对**无 default 分支**的 dispatch 生效；有 default 分支（如“未命中时置 handlerMode=2”）
  时 >10 case 原样进 GIA 被引擎截断（日志 2927：orbit22/orbit23 事件 → default 空操作，整转后 12 块缺二段运动）。
  写图规则：**数清一张根图 multipleBranches 的命名 case ≤10**；超限时合并分支（如整转 orbit 批量 4→2）
  或拆成多个 MB/复合，不能硬加 case。docs/architecture/composite/control-flow-api-cookbook.md 已闭合该上限。
- **重置计数型缓冲必须清空数组（2026-08-27 3×3 solveBuf 残留实锤）**：「预分配数组 + 长度计数 + set_list_value 覆盖追加」
  模式重置时**只改长度计数不够**——新序列展开步数少于旧序列时，数组尾部残留旧元素，发布时被读成长度内
  的有效步 → 执行错误步骤。症状：求解 mask 在 2↔3 振荡不收敛、同一序列反复执行（日志 2931）。
  修复模板：新增清空复合（finiteLoop 0..N-1 set_list_value 0），在**所有**重置入口（op5/op12/阶段切换）
  的 solveLen=0 后调用。教训：`set_list_value` 是覆盖写，但不是清空；长度计数与数组内容两套状态必须同步。
- **循环体只物化 1 次**：finite_loop 循环体 1 份（2400→240 节点，P4 实证）。
- **capture 字典机制**：每个 setTimeout 回调的捕获变量 = set_or_add + get_corresponding 链（~6 节点/回调）；
  回调越多越贵。
- **常量/恒等表直接字面量/槽位，不要用变量读**（2026-08-20 魔方优化实证）：`wholeFrom` 恒为 identity、
  `targetPos/targetOrient` 恒为初始态，改成字面量比较/直接用 slot 后 implTotal 3138→2909（达标），
  并顺带移除诊断 print/事件监听。每次“表是常量”都先确认是否真的需要变量读。
- **build 期展开 vs 运行时循环的节点/帧权衡**（2026-08-22 3×3 整体转 26 块实证，详见
  `docs/composite-library/loop-node-budget.md`）：JS `for` 是**编译期展开**（节点多、帧少，无控制帧）；
  `f.finiteLoop` 是**运行时循环**（节点少、帧多，每次迭代有控制帧）。迭代体小/次数少 → 展开；
  迭代体大/次数多 → 循环；折中：temp 段展开、写回段循环。**两个硬限都要算**：节点 <3000（拒载）、
  单记录帧 <3000（截断），不要凭直觉全展开或全循环。
- **循环不变量提升**（2026-08-22 3×3 实证）：循环内不变的减法/乘法提到循环外只建 1 次节点
  （如 `m10 = subtract(moveId, 10n)` 提到 6 个 finiteLoop 之外），循环体内只用轻量加法。
  节点图是静态的，循环体内引用的外层表达式也各建 1 次节点，能提就提。
- **两阶段读写（置换类操作）**：多对多映射（如魔方转动）不能原地改列表（A→B、B→A 会互相覆盖），
  要先「读入 temp 列表 → 再从 temp 写回」。复位置换见 loop-node-budget.md 技巧 3。
- 节点统计脚本：`node -e "读 dist/**/*.json，统计 nodes 类型分布"`（IR 是数组格式，取 docs[0].nodes）。

## 值类型与 capture 限制

| 主题 | 结论 |
|---|---|
| 循环变量 | `let i = 0` → **float**（转 `float(i)`）；`let i = 0n` → **int**——int 参数必须 bigint 循环 |
| capture vec3 | ❌ DSL 方法返回的 vec3 捕获报 `any`（capture 只支持可推断类型）→ 用图变量/字典中转 |
| capture 支持 | str/int/bool/float/entity/vec3 等字面可推断类型；不支持 dict/复合结果 |
| 字典 key | 必须 int/str 等键类型；传 float 报 `Invalid value type: int` |
| 列表下标 | `getCorrespondingValueFromList` **0-based**（1..N 会越界返回空） |
| 全 0 int_list 图变量 | **引擎运行时只物化出很短长度**（日志 2765 实证：`cornerOrient` 声明 8 个 0 → 运行时 `[0,0]`；`edgeOrient` 声明 12 个 0 → 运行时 `[0,0,0]`；日志 2944：`solveBuf` 声明 100 个 0 → 运行时 `[0×25]`——**长度随声明/上下文变化，2/3/25 各异**），读取高下标会“列表索引越界”。且**写 0 到越界下标不扩容**（日志 2766：logicReset 写 0 后仍短；日志 2944：clear_buf 写 0..99 后仍 25 项）；必须先写非 0 哨兵撑满长度，再写真实 0 值（两阶段复位），或避免全 0 字面量。 |
| **列表初始化 ≤100 项（启动拒载红线，2026-08-27）** | 字面量声明列表**最多 100 个元素**，超限地图直接拒载：「列表初始化，最多100个元素，现在有101个」（solveBuf 哨兵 101 项实证）。（日志 2765/2944 ③条列表规则：全 0 短物化 / 写 0 不扩容 / **init ≤100**）。长列表走 `longListGet*` 分块资产，不用长字面量。 |
| **长列表乘法选择器越界读（2026-08-28 顶层死循环实证）** | `longListGetInt4/6/9` 的乘法选择器里**所有块都读同一个 offset**（`getCorrespondingValueFromList(c_k, offset)`），即使 `sel(k)=0` 也执行读——**最后一块长度 < chunkSize 时，offset 越界读返回空，污染乘法累加结果**（日志 2964：CF_OLL_ALG_c8 只有 3 项，offset=73 越界 → longListGetInt9 返回空 → 追加空 code → 朝向不变 → 死循环）。**修复：生成器把所有表补齐到整块**（最后一块用 18/-1 填充到 chunkSize），保证所有块长度 = chunkSize，offset 永不越界。写长列表查询复合时，先确认每块都满 chunkSize。 |
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
- **🔴 推进索引/游标：先写回，再显式读回判断；不要复用读图变量表达式同时做 set 和后续分支**（2026-08-25 rubik-3x3 日志 2887 rec148 实证）：`const nxt = f.addition(idx, 1n)` 被编译器二次物化，续播分支 `f.lessThan(nxt, len)` 的第二个物化是在 `set solveIdx` 之后重新读 `solveIdx`——把 `idx+1` 算成 `idx+2`，导致自动播放每个多步宏都丢最后一步（计划 B3U1B1 只播 B3U1）。正确范式（`rubik-2x2/gsts_after_turn` 已验证）：`setNodeGraphVariable(X, X+1)` → `const after = f.getNodeGraphVariable(X).asType('int')` → 用 `after` 判断；或分支直接读写后的 `getNodeGraphVariable(X)`。修复后读图判据：续播分支数据流 = Get(X) < Get(L)，不再经过第二个 Addition。
  **2026-08-26 复发（negPhase，日志 2899）**：turn 图 negDone 状态机 `ph=get(negPhase)+1; set(negPhase,ph)` 后分支复用 `lessThan(ph,3)`——二次物化把判据变成 `(ph+1)+1`，负向面转只做 2 次逻辑应用、少 90°（negDone 记录 25/22 帧交替暴露跳步）。修复为分支直接读 `get(negPhase)`。**该坑在我自己明知铁律的代码里重犯——写「计数器状态机」时按下面 checklist 逐条自查，不要凭感觉跳过**：
  - ① 推进计数器：`set(X, get(X)+1)` 之后的一切判断/使用，一律重新 `get(X)`，绝不复用之前的加法表达式变量；
  - ② 状态机/分支的空分支（`() => {}`）禁止留空——写 `registerExecNode` noop（空分支不生成执行边，会破坏 join）；
  - ③ 新状态机注入前先写下「期望日志签名」（如负向 = 3×逻辑-only 记录(25 帧级) + 1×视觉记录），拿到日志逐项对照帧数模式，跳步会暴露为帧数交替；
- **🔴 规划-执行握手协议（2026-08-28 solverLPlan 漏发 op6 死循环实证，日志 2976）**：写「规划→执行」两图协作的状态机时，**所有「追加完成」分支必须做三件套：发布 solve_seq/solve_len → phase=2 → 发 op6（序列就绪）**，然后 pStep=0 停 tick 等 op5 回来重算。漏发 op6 的后果链：solver 从不执行 moves → 魔方状态不变 → 重新读状态签名不变 → 又查表得到同一 action → 又追加同一序列 → 游标（bufPos）持续累积直到越界（日志 2976：bufPos=485 > solveBuf 100 项）。**与「长列表越界读」是同症状（索引越界/死循环）不同根因**——修复时先对比新旧日志症状差异（2964 code 空 vs 2976 bufPos 累积）区分。跨图复用的握手协议抽成共享复合（llPublishSeq），新规划图的 checklist 显式包含「完成分支发布+发 op6」。
- **🔴 跨复合/跨 tick 共享推进状态的第三变体：写序竞态（2026-08-28 rubik 日志 2954 实证）**：solverAppendCode 内 `sl = get(solveLen)` + 尾部 `set(solveLen, sl+steps)`，与 op5 重算入口的 `set(solveLen, 0)` 在相邻 tick 交错 → solve_seq 追加起点错位 → 序列重复（日志实测 -1×6 连发，而离线枚举角块宏最长负连发=3，出现"不可能序列"）→ 宏残缺 → 十字永久破坏卡循环（偶发=纯时序窗口）。**修复范式：游标/位图推进用显式入参（pos）+ 返回 next 的纯函数复合，所有者链用独立图变量（bufPos）推进，把状态所有权收敛到单一链，复合内零图变量读写**。判别法：先做部署面 vs 源面逐字节对照（排除表错），再抽日志全部实际发出 op 值去比"离线可能序列"，出现不可能序列 = 管线竞态实锤。前两变体：275 行二次物化丢步、O-2026-08-27-05 sl 表达式。
- **🔴 禁止给带 doubleBranch 的复合新增数据输出引脚，且输出值在分支内赋值（2026-08-28 日志 2956 黑块回归实证）**：solverAppendCode 曾把 pos 入参 + next 出参设计成复合引脚、nextOut 在两个分支内各自赋值——GIL 数据边在分支 join 时错乱：调用方 append 节点 outputs 出现悬空 `next:Integer` 引脚，被相邻节点（发送信号）的参数污染、无关图变量（stage）读空、视觉 blockOrient 整体错乱（黑块+位置乱）。**修复范式：跨 tick 游标状态用复合内读写独立图变量（bufPos）闭环**，调用方零引脚变化；先读 GIL `--composite` 接口签名核对 call node inputs/outputs 无悬空引脚再注入。
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
- **🔴 复用复合前逐名核对图变量依赖（2026-08-27 日志 2944 实证）**：把通用复合搬进**新图**时，
  即使编译/注入全绿，运行时也会因缺图变量而挂——solverEPlan 复用 solverAppendCode，漏声明其
  内部 `getNodeGraphVariable('CF_MOVE_CODE_FACE/DIR/STEPS')` → 引擎报「变量名字对不上」→ 追加
  静默失败 → solveLen=0 → solver 空序列 → 无限循环。**做法**：新图引用任何现成复合前，
  `grep -n getNodeGraphVariable <复合文件>` 列出全部变量名，逐一对照目标图 variables 声明；
  同时检查复合依赖的表变量（如 CF_MOVE_CODE_*）也要一并声明。
- **🔴 跨图共享状态同步：每次操作首个事件同步一次，不要每 tick 同步（2026-08-21 性能实证）**：
  主图开定时器前已把共享状态写入视觉宿主自定义变量；视觉图若在每个 `turnblock`/`orbit2` 事件都
  `syncShared`，面转 16 次/整体转 52 次重复同步，单次转动负载飙到 ~5000-10000。正确做法：
  在 `base==0 && seq==0` 的首次 turnblock 事件里同步一次，后续事件直接用图变量。
- **前置条件**：必须先解决复合定义/调用/实现三要素的 ID 稳定性（O-2026-08-20-5），否则新增图会导致
  残留 def 引用被覆盖 ID（`check-gil-composite-refs` 报类型错位）。
- **流程**：建占位图 → 注入 → `assets:mounts attach` → 读图核验两个图的 MB/执行流 → 用户测试。

### 多相位动画的定时器通道拆分（2026-08-26 rubik 2909 实证）

每个块的动画常是多相位耦合契约（如 turnblock 起转 + orbit2 二段，固定 +0.15s 偏移）。
**拆分定时器通道加速动画时，必须同步拆分全部相位、并保持每块相位偏移不变**：
只拆第一相位（turnblock A/B），第二相位（orbit2）仍按旧时序全员串行 → B 块 0.01s 起转、
orbit2 0.21s 才到 → 同块两段漂移 0.2s → 动画结束最终位置错乱（2909）。
修复 = orbit2 同步拆 B 通道（0.16..0.19，与 B 通道起转保持 +0.15s）。
同族自检：同一动画的所有 start_timer 通道（turnblock/orbit2/…）要么都拆、要么都不拆；拆后逐块核对相位差。

### 改事件分发前先确认「活跃分发路径」（2026-08-26 实证）

定时器/事件在**根图的 whenTimerIsTriggered** 与**复合内部 f.on** 可能并存，且后者可能是死路径。
改分支前先读根图确认活跃路径（rubik-3x3 视觉：根图 visual.ts 用「分支设变量+join 单次调用」，
viewOrbitTrigger 复合内的 f.on 是非活跃残留——误改浪费一轮注入）。

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

**交付前验证清单（2026-08-29 元复盘聚合一周 8 次验证链盲区事故，每项必须过）**：

1. 注入输出整行核对：`ok N, fail 0` 与错误行一起看，禁止 tail 截断；CLI 失败无退出码（O-2026-08-26-5），以输出文本为准。
2. 读图核验必须含**条件节点的数据流来源**（LessThan/Equal 输入直连 Get 还是经 Addition）——只核分支结构会漏「修复从未生效」（2899/2906 事故）。
3. 回读调用方 call node 的 inputs/outputs 签名，确认无悬空数据引脚（2956 黑块回归）；「发送信号吃到 String=bufPos」= 数据边错乱强信号。
4. 离线验证先声明**不含哪些运行时语义**（越界读 2964 / 跨图握手 2976 / 事件链时序），对应补日志或读图核验，不许以离线全绿代替。
5. 改动执行链/动画调度后，提醒用户重点看**渲染**（视觉回归 2956 教训）。
6. 出现回归先 diff 自己最近一轮改动，不从零排查（2956 绕路教训）。
7. **注入后必跑 `check-gil-composite-refs --incoming <本次.gia>`（2026-08-30 足球拒载事故后强制）**：
   只看"✓ 0 悬空"就交付 → 漏掉旧版残留 def 链类型错位 → 游戏拒载无日志（实测：足球 1073741908
   残留 auto_check_tick→dribble_decide 链，--incoming 回测可抓 3 条"类型错位"，当时漏跑）；
   再 `parse --list` 确认复合目录无多版本残留（(1) 后缀/旧 def）；报「16106127xx 缺失」是信号误报。

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
| 物理模拟用定点运动器 + 旋转运动器**同一 exec 链**激活：设备帧都在但实体位置纹丝不动、只有微旋 | 定点运动器被随后激活的旋转设备秒停；日志判据 = `Get Entity Location` 连续多 tick 不变而逻辑 ballPos 正常推进（2026-08-23 足球日志 2828/2829 实证；只补 move_speed 无效） | **移动+自旋组合用 `addUniformBasicLinearMotionDevice` + `addUniformBasicRotationBasedMotionDevice`**，直线 velocity 显式算 `(target-loc)/duration` 兼顾精确到点；定点器只保留 INSTANT 复位（2026-08-23 足球修复 6fdcfa3） |
| 运动器首段视觉目标与物理积分不同步：球冲一下再反向回拉（“虚拟天花板/卡一下”） | 启动段用 `loc + v0·dt` 当视觉目标，而物理 tick 用积分后的 `v1·dt`，两者错开一个 acceleration·dt（2026-08-23 足球日志 2830 实证） | **用同一个积分函数先算第一步，再把结果同时喂视觉目标与物理状态**：kickLaunch 调 `physIntegrate({pos:loc, vel, spin})`，按 `integ.npos/nvel/nspin` 写图变量并以 `integ.npos` 为首段目标（修复 e23b817） |
| 一个纯数据复合多消费、且其输入来自图变量：先写回输入变量再消费结果，会被引擎重复求值拿去二次积分（足球轻射往草里扎） | 消费顺序错误：kickLaunch 先写 ballVel 再消费 integ.*；日志中同一个 physIntegrate 第二次输入已变成积分后的速度 | **所有消费 integ.* 的 exec 节点排在写回其输入图变量之前**：setPos → physApplyMotion → setVel/setSpin（修复 9b0d261） |
| 启动段视觉目标没做碰撞 clamp：上旋/低平首步积分可能已越过地面，球第一段嵌入草地 | launch 首段也走完整物理预计算时，目标必须与后继 tick 一样过碰撞约束；DBG_POS 可直接看到 y 越界 | kickLaunch 把 integ.npos 的 y 用 `max(integY, 0.25)` 贴地 clamp，速度仍用 integ.nvel（修复 60308a7） |
| 内层 `doubleBranch` 前放 exec 复合调用（如 dbgTag），会让两个分支都执行——静止踢与运动冲量同时触发，球瞬间停/异常 | 复合调用从当前尾 auto-chain 到内层 DoubleBranch，破坏分支边（2026-08-23 足球日志 2841） | **内层 `doubleBranch` 前不放复合调用**；公共动作（日志/计算）复制进每个分支或移到外层分支前（修复 4e8c55a） |
| 一组 `registerExecNode` + 显式 `f.connect` 在分支里把节点连成双向边，真实 GIL 出现 `n7↔n8` 环 → 游戏加载失败 | 先在旧尾后某处插了新节点又用 connect 连向后面的节点，auto-chain 与显式 connect 叠加（2026-08-23 kickApplyImpulse 启动失败） | **分支内 exec 节点只保留一条单向链**：按最终执行顺序 register 并逐个 connect；插入新节点时重排整条链，不要从旧尾再连回后面节点（修复 341815c） |
| 球/刚体绕世界轴 ω 自旋，旋转运动器 axis 传错（自旋轴漂移） | 旋转运动器 `addUniformBasicRotationBasedMotionDevice` 的 axis 是**实体局部轴**；但绕世界轴 ω 自旋时，ω 是旋转轴，`R^T·ω = ω`（ω 是 R 的特征向量），所以**局部轴恒等于世界轴 ω** | 球绕世界轴 ω 自旋：axis 直接传 ω 方向（`_3dVectorNormalization(ω)`），angVel = `|ω|·180/π`（rad/s → °/s），无需每 tick 重算局部轴（2026-08-22 足球实证） |
| 黑面/朝向错乱但位置正确 | 生成“欧拉→朝向表/局部轴表”时用错约定：`rotate` 返回 **(x,y,z)**，矩阵 `R=Ry(y)·Rx(x)·Rz(z)`；曾误用 (y,x,z)+Rz·Rx·Ry | 先读 `motion-devices.md` §3；生成器参考 `examples/rubik-3x3/tools/gen-orient-tables.mjs`，并用已知样本断言（如 (x=90,y=270,z=0)→索引 17） |
| 转动后块位置与逻辑对不上（部分面错） | **视觉层轴方向与逻辑置换表方向不一致**——渲染跟随轴转、逻辑跟随表，方向反时两者脱节（2026-08-20 日志 2768 实证：L 轴用了 -X，DBL 实体应到 UBL 却到了 DFL）。这不是编译器 bug，也不是性能问题，而是**数据表/视觉层坐标契约没对齐** | **通用规则**：`axes` 不是通用常量，必须与当前项目的逻辑表 `ROT` 一一对应；每个项目独立做“取一个初始块，模拟绕当前轴转 90°（罗德里格斯）对比 `tblTo` 目标槽坐标”的几何验证，不一致就翻转对应轴。**具体值只在本项目有效**：3×3 按逻辑表 ROT 为 R=-X、L=+X、F=-Z、B=+Z（U/D 不动），不要直接照抄 2×2 axes 注释 |
| 动画"重叠/错开"手感反复 | 相位差（4 块启动间隔）过大=错开明显、过小=重叠 | 随机相位差分档收敛：总跨度 34ms 嫌多→13ms 好→8ms 重叠→回调 13ms；用 `getRandomFloatingPointNumber` + 物化到 float_list 变量（start_timer 读变量） |
| GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: compositePins duplicate physical route | 复合内部对**复合调用**节点 `f.link(f.entry(), 0, 复合调用, 0)`：显式 link 对象边 + exec 复合 auto-chain 裸边 → 同一 InFlow 物理路由两条 | 删掉该显式 f.link，靠 auto-chain 生成入口边（入口链首用普通节点，复合调用只作链中目标）；详见上文「exec 链链接规则」 |
| 读图看到 `Double Branch false → (无)` / 分支体零帧 / 兜底 done 永不触发 | **`f.doubleBranch` 的 false 分支回调里第一个 exec 节点用了 `f.node()`**（detached，不设 headNodeId → `withExecBranch` 弹出时不生成 false 分支边）。**尤其易漏**：true 分支常以 `f.callComposite` 开头（自动设 headNodeId，边正常），false 分支常是单节点兜底（如 `set_node_graph_variable`），一用 `f.node` 就断链 | false 分支回调第一个 exec 节点改用 `f.registerExecNode(...)`（或高层 flow API）；读图应看到 `false → <节点>`（2026-08-23 魔方打乱守卫实证：`f.node` 让非法 moveId 兜底失效，done 永不触发） |
| `TypeError: f.player is not a function` | 把全局函数 `player()` 当成了 handler 方法 `f.player()` 调用 | 用**全局** `player(1n)`（玩家序号从 1 开始，返回 PlayerEntity），不是 `f.player`（2026-08-23 UI 交互测试实证） |
| 负 moveId「折叠」（U3→U' 一条链连做 3 次逻辑应用）→ 后续指令全部无响应、求解器无限重算同一宏 | 单记录帧超 3000 硬上限：rubik-3x3 实测正 move 记录 1387 帧，`finiteLoop` 3 连 `logic_apply_face` 记录 3027 帧，在第 2 次应用中途被截断 → turnLastSlot/publishShared/turnblock/unlock 整条链不再执行 → `lock` 永久 true → flowTabLock 挡住一切后续 op3（日志 2894：27 次手动发送只 1 步执行 0 次 unlock；2895：第 4 步 -5 后 50s 内 72 次 planTick 全部 mask=0） | **把重逻辑折叠进一条执行链之前，先算「单次应用帧数 × 次数 + 链尾开销 < 3000」**；不满足就把多次应用拆成多条独立事件链（每条一个记录），或做逆表一步应用。本轮回退为正 moveId 展开（每步一条 1387 帧记录，锁/发布链可靠） |
| `E_UNKNOWN_NODE_VARIANT: missing data type conversion variant for bool→float` | 引擎无 `bool→float` 直转变体（2026-08-28 足球速度场带球实证）；项目内 `dataTypeConversion(bool, 'int')` 合法、`(int, 'float')` 合法，但 `(bool, 'float')` 不合法 | **bool→float 必须两段**：`f.dataTypeConversion(f.dataTypeConversion(x, 'int'), 'float')`（项目既有模式见 physics.ts 的 sI→sF 两段） |
| 怀疑 `set_custom_variable` / `get_custom_variable` 节点"被 GIA 丢弃"（decode 搜字符串找不到） | **GIA 里节点类型是数字 nodeId 不是字符串**：Set Custom Variable = nodeId 22、Get Custom Variable = nodeId 308（node_pin_records.ts 可查）；搜 `set_custom_variable` 字符串必然 0 命中，是排查方法错不是节点丢（2026-08-28 足球实证） | 按 **nodeId** 核对：`decode-gia.py | python3 -c "找 genericId.nodeId==22"`；`setCustomVariable` 高层 API 4 参（entity,name,value,triggerEvent）合法，`Unk` pin 由编码器省略 |

## 通用复合节点模式库（2026-08-22 来自「常用复合节点大全 v1.7」资源包 + rubik 项目抽象）

> 社区作者「左岸丶寒」整理的 87 个通用复合节点 + rubik-2x2/3x3 项目抽象，按功能分 19 类资源包，已落盘到
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

### 运动器传导链：逻辑速度 = 运动器参数（2026-08-27 足球实证，必守）

`add_uniform_basic_linear_motion_device` 的参数 IN3 = 速度向量。**它必须等于逻辑球速**，
否则视觉/逻辑分裂。

**禁止用 `(target−实体位置)/0.2` 反推运动器速度**——因为实体位置可能因运动器被打断/替换
而滞后 ballPos（日志实证：滞后 4 米 → delta 5 米 → 速度 25 m/s → 引擎不驱动 → 恶性循环）。
**运动器应该直接取逻辑球速（物化 tmpVel）作为参数**。

**铁证**（足球带球，2026-08-27_17-43-53 日志）：
- 逻辑球速 3.45（平滑衰减）
- 运动器速度 20~35（中位数 20，TOP 35）——因为实体位置比 ballPos 滞后 4 米
- 运动器速度 25 时引擎不驱动实体 → 实体更滞后 → 恶性循环
- 修复：`motionByVel` 直接取 Y, 物化 tmpVel，运动器速度恒在 3~4 m/s 正常范围

**自查**：日志里 `grep "Add Uniform" | grep -oE "IN3:Vector=\([^)]*\)"` 算模长分布，
中位数/TOP 应该 ≈ 逻辑球速。差异 >2 倍 = 传导链 bug。

**用户追问信号**："速度等于这么多之后，添加给运动参数是怎么变化的？"——立即查传导链。

### 复合输出二次求值防翻倍（2026-08-27 足球传导链铁证，必守）

`f.callComposite(纯数据复合)` 的输出（如 `integ.npos`）在 exec 链中**被消费 ≥2 次**时，
如果两次消费之间夹了 `set_node_graph_variable` 写回了复合的**图变量输入**（如 ballPos），
引擎会**按消费点重新求值复合**——第二次求值时输入已被写回，结果翻倍（如 npos 多算一个 tick 位移）。

**铁证**（足球带球）：`kickApply` 里 `integ.npos` 被 `setPos`（写 ballPos）+ `motionToPoint` 消费两次，
中间 `setPos` 更新了 ballPos → 运动器速度 = 逻辑球速 × 2 → 球"瞬移"。日志：运动器 9.9 vs 球速 4.86。

**标准姿势：物化快照**——复合输出先 `set` 到临时图变量（`tmpPos/tmpVel/tmpSpin`），
所有消费点（set 图变量 / motionToPoint / 状态判断）都读临时变量，杜绝二次求值：
```
const integ = f.callComposite(physRollIntegrate, { pos, vel, spin })
const sTmpPos = set tmpPos = integ.npos     // ① 物化（此时图变量未变，求值正确）
const sTmpVel = set tmpVel = integ.nvel
const sTmpSpin = set tmpSpin = integ.nspin
const setPos = set ballPos = get(tmpPos)    // ② 之后全部读物化值
const ap = motionToPoint(e, target=get(tmpPos))
```
- **自查**：新建/修改 exec 复合时，`grep "integ\."` 确认每个输出消费 ≤1 次（除非已物化）。
- **用户追问信号**：参数怎么调都不对（固定→比例→增量来回震荡）→ 停止调参，查传导链
  （上游逻辑值 vs 下游运动器参数是否一致，日志成对读）。

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

> **发布 int_list 自定义变量也要防“全 0 短列表”（2026-08-25 rubik-3x3 自动求解绕圈实证）**：
> `set_custom_variable(host, name, <某 12 维 int_list>)` 时，如果该列表可能全 0，引擎可能只物化出
> `[0,0,0]`，消费者按 12 维读会错乱。通用做法：发布时**尾部追加一个调用方约定忽略的哨兵 1**，
> 消费者只读前 N 维。rubik 的 `flowAfterTurn` 因此把 `solver_eo` 发布为 13 维，`solverPlan` 只读 0..11。
>
> **自动播放序列 vs 玩家手动手感解耦（2026-08-25 rubik-3x3 动画负载实证）**：
> 自动求解/自动播放的 `emitTick`（步间休息）与 `doneTick`（播完休息）只改 executor/timer，
> 不碰玩家手动转动的 0.3s 动画参数；这样开日志也能跑，手动手感不变。

> **2026-08-24 用户制定的五条铁律（每次写图前逐条自检）**：
> 1. 单个节点图数量很容易暴涨 → 每次改图先跑 `assets:node-graphs nodes --graph <id>`，看 `engineExpanded` 与增量。
> 2. 很容易写出高负载代码 → 写完先按帧预算估算 `tick 帧数 × 触发频率`，再看单记录帧是否 <3000。
> 3. 不擅长用复合节点拆分逻辑 → 重计算逻辑必须拆成小复合（读状态 / 算一步 / 应用一步 / 收尾），每个复合单独算预算。
> 4. 不擅长用多个图拆分职责均摊负载 → 规划图 / 执行图 / 视觉图分实体挂载，单图预算与单帧负载都更稳。
> 5. 不要把重工作塞进循环 → 优先**事件驱动**（某动作完成事件 → 算下一小步），其次低频定时器
>    （0.7~1s 级）每次只推进一小步；**0.06s/触发的频率本身就是高负载，禁止长期运行**；
>    定时器必须有明确停止条件（如 phase=done 不再续 timer）。
> 常识口径：0.06s/触发属于高负载（2026-08-24 用户定义）；单 tick 内也不允许把多个有限循环往死里叠。

- **重操作拆帧/间隔**：批量销毁、矩阵运算等重操作要间隔执行（作者：批量销毁间隔 0.1s 防炸图；
  矩阵求逆单次 120ms，不要每帧调用）。
- **build 期展开会显著增加图规模，先算增量再下手（2026-08-24 rubik-3x3 开局负载被踢实证）**：
  把运行时 `finiteLoop` 改成 build 期 JS `for` 确实省循环控制帧，但每个迭代的 exec 节点会全部实体化，
  直接拉开联合体 impl 节点数。实战：`solver_apply_face` 4 个小循环展开后直接节点 55→145、
  solverPlan `engineExpanded` 2510→2885，帧数优化还没验证，游戏开局就负载过高被踢。
  约束：**展开前先估节点增量**（每迭代 exec 节点数 × 迭代数 - 循环头）并跑
  `assets:node-graphs nodes --graph <id>` 看 `engineExpanded`；进入前必须确认节点增量和图规模合理；
  开局负载敏感期（实体创建/登录即执行）尤其不要把大复合完全展开。替代方案：**合并多个小循环为
  一个大循环**（体 4 set/迭代代替 2 set），帧数约减半、节点数不增（rubik `solver_apply_face` 4→2 循环，
  51 节点、engineExpanded 2133）。
- **分片 tick 间隔用「安全操作锚点」标定，不拍值（2026-08-24 rubik-3x3 求解负载限流实证）**：
  给重计算循环（求解/矩阵等）定 `start_timer` 间隔时，先找用户确认一个已知安全操作及其极限间隔
  （如“转动一个面，间隔 0.3s 就是极限”），再按五步算：
  1. `assets:node-graphs nodes --graph <id>` 读该安全操作主路径的展开节点（面转 `flow_do_move`=553）；
  2. 可接受节点/s = 操作展开节点 / 间隔（553/0.3≈1843）；
  3. 读重计算单 tick 的展开节点（`solver_cross_step` 完整 736 + 外层判定 `solver_cross_mask` 359 ≈ 1095）；
  4. 安全间隔 ≥ 单 tick 展开 / 可接受节点/s（1095/1843≈0.59s）；
  5. 留 10%~20% 余量取整（最终 0.7s），并写进代码注释含公式。
  注意：这是展开口径的粗估；真实被踢指标是 Beyond_Debug_Log 的每秒负载，注入后必须用
  `scripts/gia_log.py <日志.gia> perf` 的每秒负载表复核（见 debug-log-investigator 技能）。
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
- 通用复合节点资源库（19 类，可直接抄/套模式）：`docs/composite-library/README.md`
- 变量 tag 日志复合（不 print，靠固定标识搜索帧）：`examples/football/src/composites/debuglog.ts`（`dbgTag`/`dbgPhysSnapshot`）；模式 = 图变量 `dbgTag`/`dbgVal` + `f.dataTypeConversion(value,'str')`