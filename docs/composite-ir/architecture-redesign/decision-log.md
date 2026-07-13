# 架构决策日志

> 状态：当前推荐 / 持续更新
> 来源：当前代码审计 + 真实 GIA 对照 + Phase 0 vendor/parity 实验
> 最近校验：2026-07-12
> 适用范围：architecture-redesign 计划与实施决策

## 使用规则

每项标记为：

- **Accepted**：已有足够依据，可指导实现；
- **Provisional**：方向接受，细节需实验；
- **Open**：不得猜测；
- **Rejected**：已否决，并保留原因。

## Accepted

### ADR-001：普通节点只能有一个 backend

Root 与 composite impl 中的 system ordinary node 必须共享 type/variant resolution、vendor factory 和 ordinary
connection materialization。

依据：当前双实现已在 float setter 上产生 concrete identity/pin wrapper 漂移。

### ADR-002：Composite 特殊性限制在边界

Composite 专属职责是 definition、synthetic call、capture、`compositePins` 和 boundary layout；普通节点不属于
composite encoding domain。

### ADR-003：类型解析先于编码

Lowering 不得通过 encoded pin 反推语义类型。类型冲突在 resolved contract 阶段报告。

### ADR-004：Vendor 优先生成 ordinary pin schema

Vendor `Node.setConcrete`、`Pin.setType` 和 concrete map 是默认物化机制。项目补丁必须集中且有证据。

### ADR-005：迁移使用 vertical slices

从 setter family 开始，按节点族切换，不一次重写整个 composite backend。

### ADR-011：普通能力在 root 与 composite impl 中同源

状态：Accepted（用户确认，2026-07-13）

问题：复合节点内部是否应被当成仅支持少数已单独验证 node family 的受限执行环境。

决定：不应。主图可表达和执行的 ordinary system node、数据/控制流关系及 API 调用，目标上应同样可在
composite impl 中表达和执行。复合 impl 不是另一套能力模型；它只是普通图 materialization 之外再叠加
CompositeDef、synthetic call、capture、`compositePins`、inflow/outflow 和布局等 boundary 职责。信号等动态或特殊
family 也以同一能力目标处理；如 schema 或 boundary 有专属规则，应在共享 ordinary contract 下增加专用 lowerer/normalization，
而不是恢复独立 composite ordinary backend。

证据：用户明确确认该能力模型；ADR-001/002/006 的共享 ordinary backend 与 boundary isolation 架构与之相容。P2-W1~W17b
分别为 setter/getter/DTC/同型 scalar arithmetic 等局部 ordinary family 提供了自动与部分用户编辑器核验，但不构成所有 API、
signal payload/dynamic pin 或 wire 细节均已验证的证据。

影响：

- 后续工作包不再把“复合是否支持某普通 API/node”当成独立能力分叉；优先定位共享 resolution、lowering、materialization 或 boundary overlay 的缺口；
- 每个新增 family 仍需以可执行 root + composite impl fixture 验证控制流、数据流、typed schema 和相关 boundary；
- 持续用更多真实 GIA 与用户编辑器案例扩展覆盖；验证范围扩大不等于可跳过真实样本、wire 或游戏行为的证据分层；
- 只有 synthetic composite call、capture、`compositePins`、inflow/outflow 等 boundary 继续属于 composite 专属实现。

验证/退出条件：共享 materializer 覆盖 ordinary subgraph 后，按 family/动态规则/真实案例逐步补齐 root/impl executable parity；
在对应 coverage、真实/编辑器证据和 legacy removal gate 达标前，不默认开启 gate 或删除 handwritten backend。

### ADR-006：Impl 使用完整 vendor Graph materialization

状态：Accepted（用户 2026-07-12 选择方案 A）

问题：ordinary impl graph 应走完整 vendor Graph，还是节点级 lowering + adapter，或仅 schema 手写 materializer。

决定：以完整 vendor Graph materialization 作为 Phase 1–3 主路径。ordinary impl nodes/edges 目标形态为
`Graph.add_node` / `connect` / `flow` / `encode`，再嵌入 CompositeDef impl；不为近阶段默认采用节点级 adapter
（B）或手写 materializer（C）。

证据：

- Phase 0 已证明 vendor 节点级 `Node(concreteId)+setVal` 与 `Graph.connect` 对 float/vec setter 可匹配真实 ordinary schema；
- 用户明确选择 A 作为架构主路径，即使整图嵌入安全性仍待后续工作包证明。

影响：

- Phase 1 仍先做共享 resolved identity / contract，不跳过阶段顺序；
- Phase 2/3 以实现与验证完整 Graph materialization 为默认目标，不为 B 路径设计长期 adapter 层；
- 在 Graph 嵌入/metadata 实验证明前，不得删除 legacy impl pin/connect 路径；
- 若后续证据证伪 A 的嵌入可行性，必须回到决策闸门，不得静默退回 B/C。

验证/退出条件：

- 临时 Graph encode 提取/嵌入 impl NodeGraph 的 metadata 兼容实验通过；
- setter float/vec3 root/impl ordinary schema parity 最终由共享 Graph 路径转绿；
- composite boundary focused baselines 不回归。

## Provisional

### ADR-009：Synthetic composite call 不进入 vendor ordinary Graph

状态：Accepted（P2-W9 failure baseline + 当前源码/第三方只读审计 + focused 自动回归 + 用户编辑器核验，2026-07-13）

问题：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 是否应把 impl 中的 `__composite_call__` 与 ordinary nodes 一起交给
vendor `Graph` materialization。

当前结论：不应直接作为 vendor ordinary `Node` 物化。P2-W9 最小 fixture 在 gate 下失败：
`vendor impl graph gate missing __composite_call__ InParam[0]`。`__composite_call__` 必须 lower 为 child
CompositeDef ID 的 `SysGraph`，并持有 `relatedIds`、child pin `compositePinIndex`、capture/sparse input 和
ordinary↔synthetic edge 的 boundary 规则；这些不属于 ordinary node record/reflectMap schema。

第三方证据：vendor compat Graph 的 `Node` 从 ordinary node record/reflectMap 建 schema；第三方仓库 `dev`
（`a9174c9`）虽有 `NodeInterface` protobuf，但未提供 SysGraph/composite-call factory、registry 或 nested encoder。

影响：若继续 P2-W9，候选设计必须是“vendor materializes ordinary subgraph；composite backend materializes
synthetic call；明确 overlay 连接二者”，不能静默 fallback 或把 synthetic call 添加到 vendor node table。

验证结果：最小 synthetic-call isolation 已经由 nested OutFlow → ordinary node 的
post-materialization overlay fixture、focused regressions 和用户编辑器候选验证。nested data input、nested capture 和
sparse named input 仍须另拆工作包；本 ADR 不授权默认开启 gate 或删除 handwritten backend。

### ADR-007：Stage 3 内部新增 Resolved Graph IR

方向接受；具体类型结构、文件名和 list/dict 表示需在首个 fixture 实现中校正。

### ADR-008：Hidden pin remap 在 resolution 阶段完成

目标是只 remap 一次。需确认 signal、assembly、custom variable 等动态 pin family 是否适合统一 contract，或需要 family
specific resolver。

### ADR-010：Composite definition capture 与 optional call-site binding 分离

状态：Accepted（真实 `调用参数.gia` + 当前实现/自动回归 + 用户编辑器核验，2026-07-13）

问题：同一 CompositeDef 内部同时消费全部声明 inputs 时，是否要求每个 `callComposite` / `declareDetached` 都传入全部输入。

决定：不要求。definition capture 必须按完整 `def.inputs` 创建 typed placeholders；每个 call-site 独立决定实际
binding 的任意子集（包括空集），marker 仅物化实际绑定的 physical InParam，并以 declaration index 保持 sparse
位置。未绑定输入不得在 marker 上被补为 literal、ordinary edge 或 capture route。

证据：真实 `Beyond_Local_Export/user_edit/复合节点/调用参数.gia`（SHA-256
`599f3c06bdd3946cb93c3a498fb89237dd2fbc6e5f8661bfa80918f252bf3b1b`）的一个双 float 加法 definition 同时消费两个
inputs，四个 call marker 分别为 `[0]`、`[1]`、`[0,1]`、`[]`。`bba105b` 的 direct/nested focused regressions 及用户编辑器
四分支候选核验均通过。

影响：`runCompositeCall()` 与 `runDetachedCompositeCall()` 的 child build capture 不能使用该次 call 的 partial
inputs；必须使用 definition placeholders。该决定适用于所有 composite 的 definition/call-site 结构语义，不等同于各
类型 wrapper/wire/default 或未绑定输入运行时值的通用结论。

验证/退出条件：已覆盖 direct 与 nested vendor-gated literal binding 的四种 presence 组合。后续 connection/capture 型
optional binding、其他类型编码细节和未绑定输入的游戏运行时结果独立验证；不因此默认开启 vendor gate 或删除 handwritten backend。

## Open

### Q-001：Vendor `Node(324)` 是否逐字段匹配真实 setter？

**Phase 0 已回答（float literal）**：generic/concrete ID、`InParam[1]` wrapper、`indexOfConcrete`、bool metadata 与真实 `更新v、w` n[4] 匹配。见 P0-W1 checkpoint。

仍未推广到其他类型族。

### Q-002：Int setter 的 generic/concrete identity 如何断言？

ReflectMap 中 Int variant ID 与 generic record ID 都是 `323`；需要以 encoded presence/schema 而非仅数字判断。

### Q-003：Connection target pin 是否必须保留 literal default value？

Phase 0 观察：connected pin 保留 concrete wrapper；vendor 可能带 protobuf 默认 inner value，不能把 decoded default 当作 wire presence。

仍需按节点族验证；不能统一删除或统一保留。

### Q-004：Composite impl graphValues 的权威作用是什么？

当前变量被合并到 root graph，impl `graphValues` 为空。是否应改变是独立协议问题，不能随 setter 重构顺便决定。

### Q-005：Signals 是 ordinary family 还是独立 synthetic family？

它们使用 ClientExec payload 和动态 data pins，可能需要共享 resolver 下的专用 lowerer。

### Q-006：List/dict concrete map 是否完全可信？

必须按 family 与真实样本验证，不从 scalar 结果推广。

## Rejected

### ADR-R01：只给 `额外压力` 增加 float 特例

原因：隐藏 vec3 connection、custom/local variable 和 root/impl 分叉，不解决架构根因。

### ADR-R02：让 impl 直接调用整个 `irToGia()`

原因：root orchestration 混合布局、wrapper、signals、composite call 和 protobuf 后处理；共享边界错误。

### ADR-R03：把 nested composite 展开成普通节点

原因：违反真实 GIA 结构和已确认回归基线。

### ADR-R04：把 vendor 当作无需真实验证的规范

原因：当前已有 `Unk`、hidden pin、bool wire metadata 等兼容规则；vendor 是机制和数据源，不等于游戏输出证明。

### ADR-R05：在 Phase 0 前删除 legacy helpers

原因：会失去可比较基线和可回滚路径。

### ADR-R06：默认采用节点级 vendor lowering + adapter（方案 B）作为近阶段主路径

原因：用户在 Phase 0 决策闸门选择方案 A（完整 vendor Graph materialization）。B 可作为局部过渡手段仅在有明确
证据与回滚边界时使用，不得改写为默认架构目标。

### ADR-R07：默认采用仅 vendor schema + 项目手写 materializer（方案 C）

原因：与 ADR-004 vendor 优先冲突倾向最高，且最易再次产生 root/impl schema 漂移。

## 记录模板

```md
### ADR-NNN：标题

状态：Accepted / Provisional / Open / Rejected

问题：

决定：

证据：

影响：

验证/退出条件：
```
