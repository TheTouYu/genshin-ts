# 测试体系：复合节点的验证策略

> 状态：当前实现
> 来源：当前代码实现
> 最近校验：2026-07-18
> 适用范围：gsts 当前复合节点测试脚本和验证流程；复合 GIA bug 的完整分析、修复和验收流程

> 本文档描述复合节点功能的测试架构——从 GIA 比对测试到单元行为验证，以及已知的限制和注意事项。
> 参见：[DSL API](./dsl-api.md) | [捕获机制](./capture-mechanism.md) | [管线追踪](./pipeline-flow.md)

## 0. 复合节点 Bug 的完整分析与修复流程

涉及真实 `.gia`、复合节点输入/输出、`compositePins`、impl GraphNode、物理 pin 或游戏验证时，按下面顺序执行。不要直接根据某个节点的源码或一次生成结果猜测根因。

### 0.1 先建立同构复现和证据基线

1. **读取并保留真实参考文件**：记录路径、文件大小、SHA-256；只读 `user_edit/`，不修改参考样本。
2. **解码真实 GIA**：先看 `CompositeDef.inputs/outputs`，再看 impl 节点 ID、concrete ID、物理 `InParam/OutParam`、`compositePins` 和数据连线。
3. **编写最小同构复现**：复现文件放在 `tests/composite/`，输出放在 `tests/composite/output/`。复合名称、参数顺序、参数类型、内部节点族和边界映射应尽量对应参考文件。
4. **先运行复现，不先修改生产代码**：确认当前输出确实重现用户观察到的结构错误。接口类型正确但物理 pin 缺失、`compositePins` 指向不存在 pin 等，必须分别记录。
5. **保留 raw/wire 证据**：当语义 JSON 不能区分字段缺失与默认值时，补充 raw protobuf presence 或 round-trip 检查；decoded JSON 默认值不能单独证明 wire 字段存在。

参考命令：

```bash
sha256sum <reference.gia>
npx tsx tools/decode-gia.ts <reference.gia>
NODE_OPTIONS='--no-deprecation' npx tsx tests/composite/<repro.ts>
```

### 0.2 扩大影响范围，不要把问题归因到第一个节点

最小复现确认后，使用独立测试按节点族扩大范围，至少覆盖适用的几类：

- 标量算术：加、减、乘、除、模、幂；
- 比较和逻辑：等于、小于、大于、逻辑与/或/异或；
- 向量：加、减、缩放、点乘、角度等；
- 类型转换、嵌套复合、稀疏输入和已知特殊节点作为对照。

每个样例都记录：接口声明类型、generic/concrete ID、边界 `compositePins`、物理输入/输出 pin 及类型。结果要区分：

- **公共复合边界问题**：多个普通节点族都出现同一结构错误；
- **节点族问题**：只有同一 vendor 节点族出现错误；
- **特殊规则/合法例外**：例如 `data_type_conversion_*` 使用独立 concrete pin 规则；
- **尚待验证**：只有 vendor 模板差异但没有真实 GIA 或游戏证据的现象。

### 0.3 用主图做对照

使用同一批普通节点、同样的值类型和连接类型，在 `g.server` 主图中直接生成对照 GIA。比较主图和复合 impl 图：

```text
主图普通节点：物理 InParam/OutParam 是否存在？
复合 impl：同一节点是否因 capture/compositePins 处理而变化？
```

主图正常而复合 impl 异常时，优先检查 capture normalization、边界 pin 过滤、impl materializer 和 `compositePins` overlay，不要修改普通节点定义或 vendor schema。

### 0.4 先写红灯回归，再做最小修复

将最小复现改成能断言用户症状的 focused regression，例如：

```text
每条 InParam compositePin 都有对应的物理 GraphNode InParam；
物理 pin 的类型与复合接口/连接类型一致；
OutParam 和数据连线仍然存在；
非边界 capture 的 pin-hole 行为不被改变。
```

先运行并确认它在旧实现上失败，再只修改负责该边界的最小函数。复合 Stage 3 同时存在 legacy-handwritten 和 shared-vendor-impl-graph 两条后端时，两条路径都要覆盖；注意 shared vendor 当前由 `stage3_backend.ts` 规定为 opt-in，默认未启用，不能把“显式开启共享路径通过”误报成“默认路径已切换”。

### 0.5 分层验证和记录

修复后按窄到宽执行：

1. 最小红灯回归转绿；
2. 受影响节点族调查；
3. 主图对照；
4. DTC、nested capture、sparse input、root/impl parity 等相邻回归；
5. legacy 和显式启用 shared vendor 路径；
6. 生产 TypeScript 改动后运行 `npm run build`，最后运行 `git diff --check`。

报告必须分开写：

- `当前代码实现`：源文件、函数和当前后端选择；
- `真实 GIA 观察`：样本路径、命令、字段和适用范围；
- `自动回归`：实际运行的命令和结果；
- `GIA 文件复制/注入`：实际输出路径和目标，不能等同游戏正确；
- `游戏内验证`：仅在用户或游戏记录确认后标记；
- `待验证`：未有足够真实 GIA 或游戏证据的推测。

测试构造错误也必须单独记录。例如无 metadata 的 `new float()` 不能直接作为 IR 节点参数；这类失败是 fixture 错误，不是生产编码失败。生成成功、自动回归通过、文件复制成功、注入成功和游戏内行为通过是不同证据等级，不能合并表述。

### 0.6 修复后的文档与规则反馈

如果修复改变了复合编码不变量，更新本文件或对应的 `gia-encoding.md`，写明当前实现、回归命令、真实 GIA 证据和游戏验证范围。每轮结束检查 `AGENTS.md` 与实际证据是否一致：高频、可复用、已证实的规则才进入 `AGENTS.md`；单个样本路径、临时实验和待验证现象留在测试或权威技术文档中。

---

## 入门示例

对于想理解复合节点管线的开发者，推荐从 `tests/composite/demo_addsub2.ts` 开始：

```
npx tsx tests/composite/demo_addsub2.ts
```

该脚本完整展示了 TS 定义 → 运行时捕获 → IR JSON → GIA 编码的全流程，对应 `ts_g_define_加减运算2.gia` 参考文件的结构。参见：[dsl-api.md](./dsl-api.md) | [捕获机制](./capture-mechanism.md)

## 1. 客户端 TS→GIA 验证分层

客户端生产路径现在有独立的最小回归入口：

```text
tests/runtime/test-client-full-signal-ir-to-gia.ts
```

验证必须分开报告：

1. **TS→IR→GIA 自动回归**：确认 TS 语义、Client IR、节点 identity、参数数量、列表 count/元素值和数据/控制流物化；
2. **真实 GIA 对照**：使用 `Beyond_Local_Export/user_edit/客户端/信号-参数-完整.gia` 和
   `信号-参数-完整-列表.gia`，确认 ClientVarType、typed assembly、entity/GUID 拓扑和 wire round-trip；
3. **编辑器导入/回导**：确认编辑器能读取并保留预期结构；
4. **游戏行为**：由用户在实际游戏目录导入后确认，不能由自动生成或注入成功替代。

客户端测试代码应使用 TS API 表达用户意图；手工 materializer 只用于固定真实 GIA 规律和底层编码回归，不能作为 TS→GIA 生产路径的替代证据。列表测试至少覆盖 literal/connection 语义、entity/GUID 数据边和多元素 bool/vec3；未覆盖的空列表、动态列表和超过上限场景必须标记为待验证。

客户端布局验证还必须检查最终解码 GIA 的 raw `x/y`，不能只检查布局函数返回值或“坐标不相等”。
客户端通过 `src/compiler/client_layout.ts` 复用服务器 `buildExecutionGraph()` 与 `layoutPositions()`；服务器
路径的 `GiaNode.setPos()` 使用归一化坐标并由 `node_body()` 乘回 `300/200`，客户端
`clientLegacyNode()` 直接生成 protobuf `GraphNode`，因此必须原样写入共享布局坐标。完整回归
`tests/runtime/test-client-full-signal-ir-to-gia.ts` 应断言生成 signal/data 节点坐标处于 raw 布局量级，
并在用户游戏中确认节点没有重叠。坐标修复前后必须分别记录自动回归和游戏验证，不能用旧产物的游戏结果替代新产物。

## 2. 测试文件位置

所有复合测试文件位于 `tests/composite/`：

```
tests/composite/
├── test-composite-part1.ts         # Part 1: GIA 比对测试（48 项）
├── test-composite-part2.ts         # Part 2: 设施图定义+调用（20 项 + 4 pending）
├── test-composite-part3.ts         # Part 3: 单元行为验证（42 项）
├── test-composite-runner.sh        # 运行器
├── test-composite-all.ts           # 合并运行入口
│
├── test-simple-basic-call.ts       # 基础 exec-only 复合
├── test-two-composites.ts          # pure data + exec 复合串联
├── test-basic-call-param.ts        # 带参数复合
├── test-two-exec.ts                # 两个 exec 复合串联
├── test-type-conversion.ts         # 类型转换复合
├── test-mixed-composite-normal.ts  # 复合与普通节点混合
├── test-composite-game-demo.ts     # 游戏场景示例
│
├── analyze-nested-composites.ts    # 嵌套复合调研
│
├── gia-compare.ts                  # GIA 对比工具
├── gia-diff.ts                     # GIA diff 工具
├── gia-inspect.ts                  # GIA 检查工具
├── verify-composite-gia.ts         # GIA 验证工具
│
├── test-phase1-system-nodes.ts     # 阶段 1 系统节点
├── test-phase2-normal-nodes.ts     # 阶段 2 普通节点
├── test-phase2-reference-patterns.ts # 阶段 2 参考模式
├── test-replicate-mul3.ts          # 验证用例：mul3 复制
└── test-simple-ref-compare.ts      # 简单参考对比
```

## 2. 测试类型

### Part 1: GIA 比对测试（48/48 通过）

将复合节点定义编译为 GIA 二进制文件，与预先存储的参考 `.gia` 文件进行逐字节比对。验证编码正确性和稳定性。

```bash
# 运行
npx tsx tests/composite/test-composite-part1.ts
```

验证方式：

- 为每个测试用例生成 `.gia` 输出
- 与 `tests/composite/ref/` 下的参考文件逐一对比
- 使用 `gia-compare.ts` 进行结构化比较而非简单字节比较

### Part 2: 设施图定义+调用（20/20 通过，4 pending）

在设施图（Facility Graph）场景中测试复合节点的定义和调用——即生成包含复合节点调用的完整 `.gia`。

```bash
npx tsx tests/composite/test-composite-part2.ts
```

20 项测试全部通过，但以下场景缺少参考 GIA 文件（标记为 `@pending_ref`）：

1. **返回值连线精确对比** — `getMetadata()` 返回的 pin 索引在跨复合边界的精确性
2. **多次调用同一复合** — 同一复合定义在同一主图中被多次调用的 GIA 结构
3. **空复合** — 无 inputs/outputs 且 build 为空的复合节点
4. **嵌套复合** — 复合 build 内部调用另一个 `f.callComposite`

### Part 3: 单元行为验证（42/42 通过）

对捕获结果和 IR 结构的精细化验证，不依赖完整管线：

```bash
npx tsx tests/composite/test-composite-part3.ts
```

测试覆盖：

- `CompositeCapture` 的 `isPureData` 判定
- `compositePins` 的映射正确性（InParam 扫描、OutParam 元数据）
- `toCompositeDefIR()` 的 `implNodes` 和 `implEdges` 结构
- 多 OutFlow 的 `outflowMarks` / `f.outflow()` 优先级（旧文档中的 `leafMarks` 属于历史实现）
- 单 OutFlow 的默认行为

---

## 3. 主要测试用例

| 测试文件                           | 验证重点                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `test-simple-basic-call.ts`        | 最简单 exec-only 复合：定义 → 调用 → 编译                                                            |
| `test-two-composites.ts`           | pure data + exec 复合的串联和 compositeDataEdges                                                     |
| `test-basic-call-param.ts`         | 带输入/输出参数的复合，参数传递正确性                                                                |
| `test-two-exec.ts`                 | 两个 exec 复合在一条执行链上的顺序执行                                                               |
| `test-type-conversion.ts`          | 内部节点含 `data_type_conversion_*` 的复合                                                           |
| `test-mixed-composite-normal.ts`   | 复合调用与普通 `f.method()` 交叉排列                                                                 |
| `test-composite-game-demo.ts`      | 模拟真实游戏逻辑的复合（条件、变量、多个复合）                                                       |
| `test-composite-bool-input-gia.ts` | bool input/output 的 `enumId=1` wire 元数据；非 bool 参数不得携带 `enumId`；同时锁定调用 pin literal |
| `test-stage3-p4w3-call-lowerer-contract.ts` | 复合调用边界；含“下游仍有执行流但定义未声明/绑定 OutFlow”的 `GSTS-COMPOSITE-MISSING-OUTFLOW` 负向诊断 |
| `analyze-nested-composites.ts`     | 嵌套复合的历史可行性调查；当前行为以 nested focused tests 为准                                       |

---

## 4. 跨 NodeGraph Composite ID 冲突回归

> 状态：当前实现
> 来源：当前代码实现 + 自动回归
> 最近校验：2026-07-19
> 适用范围：gsts IR 合并路径；未进行注入或游戏内验证

多个 entry 独立编译时可能各自从相同的 Composite ID 起点分配 ID。CLI 处理所有待输出的
IR 文档前，`src/compiler/ir_merge.ts` 会跨文档比较 `compositeDefs` 的定义内容：
相同定义复用原 ID，不同定义分配新的 ID，并同步重写主图调用、impl 图中的嵌套调用和
`compositeCalls` 元数据。合并结果保留全部 Composite 定义。

最小回归：

```bash
npm run build
npx tsx tests/ir_merge_composite_id_collision_test.ts
```

该测试先在旧实现上确认 `compositeDefs` 被覆盖而失败，再验证修复后的两个定义拥有
不同 ID，主图调用和嵌套调用都指向重映射后的定义。它证明的是 IR 合并结构，不等同于
GIA 注入成功或游戏行为正确。

## 5. 运行方式

### 独立脚本模式

复合测试是独立脚本，**不属于** `npm test` 自动执行流程。`gsts.test.config.ts` 也会排除
`tests/composite/_dump*.ts` 和 `recreate-local-variable-reference.ts`：这些脚本直接保存
`f.node()` 返回的 flow marker 或自行读取/写入 GIA，只能通过下述 focused harness 单独运行，不能作为
普通用户 DSL 入口参与 Stage 1 的 LocalVariable lowering。

```bash
# 运行完整测试集
bash tests/composite/test-composite-runner.sh

# 或单独运行各部分
npx tsx tests/composite/test-composite-part1.ts
npx tsx tests/composite/test-composite-part3.ts
```

### 独立进程

每个测试脚本在**独立 Node.js 进程**中运行。这是因为：

1. `compositeRegistry` 是模块级全局单例
2. 测试间的 `g.defineComposite` 调用会污染注册表
3. 同一进程中的多次 `buildServerGraphRegistriesIRDocuments` 调用会产生重复定义

### 回归测试

嵌套执行 Composite 的普通单链回归：

```bash
npm run build
NODE_OPTIONS='--no-deprecation' npx tsx tests/composite/test-nested-composite-call-continuation.ts
node ./bin/gsts.mjs -c gsts.timer-nested-exec-composite-repro.config.ts --noinject
```

该回归锁定：Composite `build()` 内单出口 child 经 `f.callComposite()` 后，后续节点使用显式
`source_index=0` 连接；同时保留 `declareDetached()` + `f.link()` 的显式路径和主图调用路径。
自动 GIA 生成不等同于编辑器或游戏内验证。

多出口普通顺序 continuation 的 focused 回归：

```bash
npm run build
NODE_OPTIONS='--no-deprecation' npx tsx tests/composite/test-multi-outflow-default-continuation-warning.ts
```

该回归锁定普通 `doubleBranch` 和多出口 Composite 的自然顺序 continuation 都只连接
`OutFlow[0]`，输出稳定诊断 `GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION`，并断言 warning 给出
“将逻辑移入对应 branch callback”及 `f.node()/f.link()` / `connectOutFlow()` 的修复建议。
普通节点的通用分支元数据由运行时捕获，不按 `double_branch` 节点名特判。当前完成自动 IR 和 Timer GIA 生成验证，覆盖 `doubleBranch`、4 路 `multipleBranches`、
`finiteLoop`、`listIterationLoop`、多出口 Composite、nested Composite 和显式 wiring；尚未进行
编辑器导入或游戏内验证。

```bash
npm run quicktest
```

不受复合测试直接影响（复合测试不在 quicktest 中），但复合功能的正确性可以通过编译包含复合调用的测试 `.ts` 文件来验证——56 个 GIA 文件全部生成成功。

默认生产后端（legacy handwritten）专项回归：

```bash
npm run build
npx tsx tests/composite/test-impl-prefab-literal-and-multiple-branches.ts
```

覆盖：impl 内 `prefab_id` 字面量 `bId` + `alreadySetVal`；impl 内 `multiple_branches` 的 capture 控制脚 / case list / 默认 OutFlow 0。证据层级为自动 GIA 结构回归；2026-07-16 的该夹具已由用户导入编辑器核验两项表现，但仍不替代运行时游戏行为核验。

### Timer callback 中的复合输出类型回归

> 状态：已验证
> 来源：当前代码实现 + 自动 GIA 生成 + 用户编辑器与游戏内验证
> 最近校验：2026-07-16
> 适用范围：gsts 当前输出与游戏编辑器导入/运行

基础回归文件：

```text
tests/timer_composite_output_types_test.ts
gsts.timer-composite-output-types.config.ts
```

覆盖 timer callback 中的 `float` / `vec3` 复合输出、多输出 pin，以及输出继续连接比较节点和 `split3dVector`。独立生成命令：

```bash
npm run build
node ./bin/gsts.mjs -c gsts.timer-composite-output-types.config.ts --noinject
```

生成的 GIA：

```text
dist-timer-composite-output-types/tests/timer_composite_output_types_test.gia
```

该基础 GIA 已复制到 Windows 游戏导出目录：

```text
C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\timer_composite_output_types_test.gia
```

用户已将基础文件导入游戏并完成独立节点测试，结果通过。因此基础夹具的最终验收层级为：自动生成通过、GIA 导入通过、用户游戏内验证通过。

复杂多输出回归文件：

```text
tests/timer_nested_composite_multi_output_test.ts
gsts.timer-nested-composite-multi-output.config.ts
```

它覆盖两条曾失败的路径：外层多输出来自嵌套复合调用，以及外层多输出来自
`split3dVector`。调用方先把完整 `callComposite(...)` 结果保存为 `const`，再多次读取命名输出。
Stage 1 必须保留这个结果对象，不能把它提升为 `entity` LocalVariable 并将整个 `{ x, y }`
传给 `setLocalVariable`。

```bash
npm run build
node ./bin/gsts.mjs -c gsts.timer-nested-composite-multi-output.config.ts --noinject
```

P0 实施前的窄修复产物 SHA-256 为
`5d4106875f4f35552c44c6481a486ca943e3488087b860dd5b87708e57f19205`；该版本曾复制到
`Beyond_Local_Export` 并逐字节核对一致。用户于 2026-07-16 确认该历史版本成功导入编辑器，
两个复合节点的 `x/y` 引脚及连线正常，实际运行时 timer、变量写入、比较逻辑，以及嵌套复合与
`split3dVector` 的多输出消费均通过。

统一 `ExpressionSemantics` / checked LocalVariable P0 实施后的当前产物 SHA-256 为
`fd7abd9c5cacc933645077e409984c298db34d4edf58e4a15e4bda2990394ce5`，已复制到同名导出文件并
逐字节核对一致。用户于 2026-07-16 确认本轮当前产物编辑器导入与游戏内核验通过。

核验时观察到 fixture 中空 `doubleBranch(..., () => {}, () => {})` 的“是/否”出口都会汇合到后续
`set x/y`。这准确对应源码语义：后续写入无条件执行，双分支可删除；它不是控制流编码错误，也不影响
P0 的 Composite 输出分类和 LocalVariable 安全验收。若 fixture 后续要表达“仅条件满足时写入”，应将
写入语句移入“是”回调，不能依赖分支后的 continuation。

### `dataTypeConversion` 合法变体边界

> 状态：当前实现
> 来源：当前生成定义 + 当前 Stage 3 映射 + 自动 GIA 回归
> 最近校验：2026-07-16
> 适用范围：gsts 当前公开 API 与 GIA 生成

当前公开 `DataTypeConversionMap` 和 P2-W16 回归覆盖 11 个合法变体：
`int→bool/float/str`、`entity/guid→str`、`bool→int/str`、`float→int/str`、
`vec3/faction→str`。`bool→float` 不在公开 API 或已知 GIA concrete variant 中。由于 TypeScript
泛型推断可能把输入拓宽，Stage 1 还会按同一合法变体表显式校验；非法组合会在 TS→GS 阶段报：

```text
unsupported dataTypeConversion bool→float; supported targets for bool: int, str
```

负向回归为 `tests/data_type_conversion_invalid_test.ts` 和
`gsts.data-type-conversion-invalid.config.ts`。它必须编译失败并包含上述诊断，不能为通过测试而虚构
GIA 节点 ID。需要浮点值时使用已支持的 `bool→int→float`，或按业务语义使用分支产生浮点常量。

### Stage 1 语义值与 LocalVariable 安全回归

> 状态：当前实现
> 来源：当前 Stage 1 代码 + 自动回归
> 最近校验：2026-07-16
> 适用范围：TS → `.gs.ts` 变量规划、timer capture、conditional 与 LocalVariable lowering

focused 测试：

```bash
npx tsx tests/stage1_expression_semantics_test.ts
```

该测试直接调用真实 `transformToGs()` 入口，并同时覆盖纯 `ExpressionSemantics` 分类 seam。它锁定：
完整 Composite 结果不提升、命名输出保持声明类型、timer/普通对象分类，以及 Composite 完整结果、
普通对象和类型冲突的 Stage 1 定位诊断。

通用 LocalVariable init/set 已由 checked builder 保护。`list_methods.ts` / `builtins.ts` 中剩余直接
`setLocalVariable` 是显式 typed 内部算法写入；其初始化入口已收窄为
`StorableLocalValueType`，未在本轮逐项迁移表达式分类。

本轮自动生成的代表性 GIA 与历史已验证文件不是同一哈希，因此没有沿用历史证据；两份当前哈希文件均
已复制到 `Beyond_Local_Export`，并由用户于 2026-07-16 确认编辑器导入和游戏内核验通过。

---

### Timer 元数据在控制流回调中的回归

> 状态：当前实现
> 来源：当前代码实现 + 自动 GIA 生成 + 用户测试确认
> 最近校验：2026-07-19
> 适用范围：gsts 当前 Stage 1/2/3 输出；用户已确认本需求测试通过

回归入口：

```text
tests/timer_metadata_control_flow_callbacks_test.ts
gsts.timer-metadata-control-flow-callbacks.config.ts
tests/timer_metadata_control_flow_callbacks_assert.ts
```

覆盖四个最小场景：事件处理器直接注册 Timer、`doubleBranch` 回调内注册
`setTimeout`、`setInterval` 回调内继续编排控制流，以及分支内注册 Timer 后继续分支尾部逻辑。
Stage 1 必须为控制流回调中的 Timer 保留与直接事件层级相同的 metadata；生成的每张 GIA
必须同时包含唯一的 `start_timer`、`when_timer_is_triggered` 和 Timer 回调下游执行流。

独立验证：

```bash
node ./bin/gsts.mjs -c gsts.timer-metadata-control-flow-callbacks.config.ts --noinject
npx tsx tests/timer_metadata_control_flow_callbacks_assert.ts
for f in dist-timer-metadata-control-flow-callbacks/tests/*.gia; do
  NODE_OPTIONS='--no-deprecation' npx tsx tests/composite/trace-exec-flow.ts "$f" --io
done
```

自动生成和 trace 只证明编译产物的结构与可追踪性；候选文件导入、注入和游戏行为仍须分开验证。

### Composite build / nested-call Timer 边界回归

> 状态：已验证
> 来源：当前代码实现 + 自动 GIA 生成 + 用户编辑器/游戏验证
> 最近校验：2026-07-19
> 适用范围：gsts 当前 Stage 1/2/3 输出；本轮 E–H 候选 GIA 已由用户确认测试通过

回归入口：

```text
tests/timer_composite_control_flow_callbacks_test.ts
gsts.timer-composite-control-flow-callbacks.config.ts
tests/timer_composite_control_flow_callbacks_assert.ts
```

该回归专门覆盖上一节主图回调之外的 Composite 边界：

- Composite `build()` 内部的 `doubleBranch` 回调注册 `setTimeout`；
- 外层 Composite 分支中调用内层 Composite，Timer 位于内层 Composite impl；
- Composite 分支注册 Timer 后继续普通 OutFlow 尾逻辑；
- 主图 `setInterval` callback → 控制流分支 → Composite → 内部 Timer 的嵌套路径。

断言同时检查主图和 `compositeDefs.implNodes`：Timer 注册节点、Timer 事件节点、复合调用节点、
分支节点和 impl 执行边必须存在；并对每张候选 GIA 运行 `trace-exec-flow --io`。Composite
capture 的 Timer 事件属于 impl 图内部结构，不应被提升为主图重复 Timer，也不能丢失为孤立节点。

```bash
node ./bin/gsts.mjs -c gsts.timer-composite-control-flow-callbacks.config.ts --noinject
npx tsx tests/timer_composite_control_flow_callbacks_assert.ts
for f in dist-timer-composite-control-flow-callbacks/tests/*.gia; do
  NODE_OPTIONS='--no-deprecation' npx tsx tests/composite/trace-exec-flow.ts "$f" --io
done
```

当前实现要点：Stage 1 会转换 `g.defineComposite(...).build` 方法；capture registry 会保留
Composite capture flow，并合并 Timer 事件 flow 的 impl 节点与边；嵌套 Composite 继续通过
`__composite_call__` 和 accessories 递归展开。自动回归证明生成结构；用户已确认 E–H 候选 GIA
在编辑器/游戏中测试通过。候选文件曾复制到游戏导出根目录，未执行地图注入。

## 5. 测试注意事项

### `// @ts-nocheck`

所有测试文件顶部包含 `// @ts-nocheck`，因为测试代码直接操作 IR 结构、CompositeCapture 等内部类型，不需要严格的 TS 类型检查。

### 注册表污染

测试脚本须独立运行。若在同一进程中运行多个测试：

```typescript
// 问题：第二次 defineComposite('X', ...) 会抛错
// "[error] composite "X" already defined"

// 解决方案：每个测试文件独立进程，或在 beforeEach 中清空注册表
compositeRegistry['definitions'].clear() // hack: 不推荐
```

### Protobuf round-trip 与字段 presence

`decode_gia_file()` 使用 protobuf defaults，未知字段会在 decode/encode 时丢失，普通 JSON diff 不一定能发现协议缺口。复合参数类型回归必须同时检查：

1. defaults JSON 中的语义值；
2. raw protobuf message 中字段实际存在；
3. 必要时对真实文件执行无修改 round-trip，并比较 payload 长度或哈希。

2026-07-11 的 bool 参数修复即由 round-trip 定位：旧 schema 丢失
`CompositeDef.ParameterFlow.Type.field 101` 的 5 bytes（`aa06020801`）。

### 对比参考文件

Part 1 的 `.gia` 参考文件需要手动维护。新增测试用例时：

1. 先运行一次生成 `.gia`（--save 模式）
2. 人工验证 `.gia` 结构正确
3. 作为参考文件提交

---

## 6. 已知限制

| 限制               | 影响                                    | 状态                                                   |
| ------------------ | --------------------------------------- | ------------------------------------------------------ |
| 返回值连线精确对比 | 部分场景中 OutParam pin 索引偏移        | `@pending_ref`                                         |
| 多次调用同一复合   | 同一复合在两处被调用时 accessories 处理 | `@pending_ref`                                         |
| 空复合             | build 函数为空时的 IR 和 GIA 表示       | `@pending_ref`                                         |
| 嵌套复合           | 缺少 Part 2 精确参考 GIA 对比            | 编译与 focused GIA 回归已覆盖；精确参考仍 `@pending_ref` |
| 跨复合类型参数     | 复合输出作为另一复合输入时的类型推导     | timer/nested 标量路径已自动验证；更多类型组合仍需扩展    |

> 详情参见 [composite_node_testing.md](composite_node_testing.md) 的历史测试记录。
