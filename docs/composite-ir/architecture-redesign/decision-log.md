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

### ADR-013：主图能力域、证据治理与 backend 提升闸门

状态：Accepted（用户完整计划审查确认，2026-07-14）

问题：如何把“主图可实现的操作应可封装到复合节点”落实为可执行的能力边界、缺口处理、证据分层、阶段退出、beta/default
切换与 legacy 删除规则，而不退化为逐 API 游戏验收或让 Composite 重获独立 ordinary backend。

决定：

1. 本次硬承诺仅覆盖当前 gsts root compiler 已能编译为 ordinary node 的能力；编辑器可用但 root 尚不支持的能力是独立功能扩展。对前者，root 与 Composite impl 必须共用 resolver、vendor node factory 与 ordinary graph materializer；差异只能经显式 scope/context adapter 表达。
2. Composite 的增量边界仅包括 definition/call、参数与返回绑定、capture/重定向、`compositePins`、nested 封装及跨调用边界附加路由。inflow/outflow 与布局本身是共享图能力；普通 node/data/flow 不得在 boundary 重写。
3. “root 已支持而 Composite 不支持”是实现或知识缺口，不是可接受的产品边界。先用最小失败样本按 DSL/IR、共享决策、共享 materialization、boundary、vendor/schema、编辑器/游戏六层归因；若 vendor 本身缺失，在 editor-pack compat 分支以测试补丁，再按有来源 commit 同步。只允许有诊断、测试、TODO 与删除条件的短期**共享**兼容层；禁止 Composite 专属补丁、静默回退或复制 vendor 数据。
4. 真实语义证据优先级为：用户游戏确认、同版本真实 GIA/可复现实测、迁移不变量与 manifest、当前 root 输出/自动测试、vendor、历史/推测。未验证差异保持显式假设和最小自动契约；仅在阶段退出、beta/default 切换、legacy 删除或代表性游戏回归失败时升级为真实证据阻塞项。
5. shared backend 先维持实验 gate；P3/P4 完成后另立 opt-in beta 配置/CLI 工作包，环境变量保留内部兼容。默认切换、legacy 删除均为用户明确批准的独立工作包；默认切换后仍保留可回退 legacy 的稳定使用窗口。

证据：用户在完整计划审查中逐项确认。`76478b9` 已提供 vendor compat 补丁 `497d9ec` 同步的先例；它不构成任何未采样节点族或真实游戏行为的证据。

影响：

- P3 退出前建立受控游戏回归 manifest；记录候选目的、命令、gate、路径、SHA-256、观察点、用户结论和注入状态。候选 SHA 改变不得自动继承游戏结论。
- 代表性游戏回归失败阻塞阶段推进，先建立一个最小修复工作包并重新核验。
- P5 在删除前审计 root ordinary 能力清单：共享路径、具名共享 adapter/vendor 补丁、boundary、root 未支持能力必须分类；这不是“全部 API 已游戏验证”的声明。
- 输出差异允许限于可机械证明无语义影响的顺序、布局和容器 index 数值；pin schema、edge、capture/call、`compositePins` 等差异无法解释时阻塞。真实语义或无法机械证明的差异由用户决定。
- 已满足最小复现、0–6 层最早偏差定位且阻塞 manifest、beta/default 切换或真实用户关键使用的失败，可用一个最小例外修复包抢占阶段顺序；不得扩范围或恢复 Composite 专属 ordinary backend。关键使用仅指无法编译、编辑器拒绝加载、关键运行逻辑错误、数据/控制流错误，或无法以 legacy 回退规避的场景。未复现异常、图的美观或性能猜测只记录为候选。
- 若真实证据证明 root compiler 本身错误，修复 root 与共享 ordinary 管线，Composite 经共享路径跟随；不得在 Composite 复制或遮掩 root bug。legacy 可保留为比较基线，不得固化已证伪行为。
- 当前 root 最终可生成并执行的每项能力均属于 Composite 的硬承诺，不能以 root 特例排除。ordinary node/pin/data/flow 必须走共享管线；图容器、事件包装、signal payload、`graphValues`、布局后处理等跨 scope 机制必须提升为共享或显式命名 adapter，不能成为 Composite 专属 ordinary 编码。进入 opt-in beta 前必须完成 root 特例显式化审计，逐项记录能力、归属、root/impl 调用点、自动/游戏证据、临时 adapter 的 vendor 关联与删除条件。
- signal、dynamic pin/payload、`graphValues`、`affiliations` 等高风险能力可作为已命名、待验证项进入 beta，但必须在特例审计中列明，不得有 Composite 专属 fallback，不得影响 manifest 哨兵；beta 配置/诊断须说明验证状态或限制。任何 manifest 或真实用户失败仍按阻塞规则优先修复。beta 默认允许这些能力生成，但必须给出醒目、可操作的诊断：实际 backend、能力分类、待验证状态、legacy 回退方式与问题报告所需信息；不得静默。默认每次编译汇总一次 backend、触发的高风险分类、共享 adapter/fallback 标识与回退提示；逐节点细节仅在错误或 verbose 调试模式输出。

验证/退出条件：P3/P4 的自动哨兵与 manifest 候选达到编辑器加载和用户确认的可观察执行；beta/default/legacy 的具体闸门见对应 Phase 文档和迁移不变量。

### ADR-012：框架优先、问题驱动的 ordinary API 迁移

状态：Accepted（用户确认，2026-07-13）

问题：若要求主图普通 API 的每一个 node family 在迁移前都完成独立 root/impl、真实 GIA 或用户编辑器验证，
Phase 2 将退化为逐项覆盖，无法在目标周期内完成双 backend 的架构收束。

决定：ordinary system node/API 的迁移采用“共享框架默认覆盖、实际问题驱动补洞”策略。只要 shared resolution、
vendor ordinary factory、shared graph materializer 和 Composite boundary 的职责边界正确，ordinary API 默认应通过这条
统一路径在 impl 中表达；不再以逐 API 的预先验证作为进入 P3/P4 的前置条件。发现失败时，按 resolution、vendor
normalization、ordinary materialization、boundary overlay、dynamic family 或证据不足分类，建立最小例外工作包并集中修复。

证据：用户明确接受该工程风险，以保障重构交付节奏；ADR-001/002/006/011 的单一 ordinary backend、boundary
isolation 和完整 vendor Graph 目标与此一致。P2-W1~W17b 已证明变量、DTC、标量四则运算等切片可走共享机制，
但不是该策略的全 API 验证依据。

影响：

- 后续排期优先完成 ordinary factory、shared materializer、boundary isolation 与 legacy removal，不以 comparison
  或其他单一 family 的覆盖数量决定优先级；
- 每阶段仅保留最少跨类别哨兵与已确认不变量回归，用于发现框架洞；
- signal/dynamic pin/payload、list/dict、特殊 ID、真实 GIA/wire 与 Composite boundary 仍保留专属 adapter 或验证
  义务，不能被“默认覆盖”静默跳过；
- 文档继续把工程目标、自动回归、真实 GIA、编辑器验证和游戏内验证分层；不得将此决策表述为“406 个 API 已验证”。

验证/退出条件：按 [工作包选择协议](work-package-selection.md) 由 `STATUS.md` 每轮给出唯一的最高优先级工作包；
P2 完成 ordinary factory 泛化与显式例外出口后进入 P3，P3/P4/P5 依次按各自架构退出条件推进。

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
