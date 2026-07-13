# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + architecture-redesign 计划
> 最近校验：2026-07-12 (P2-W5~W8 checkpointed; P2-W9 synthetic-call failure baseline and vendor dev audit recorded)
> 适用范围：`refactor/composite-stage3-architecture`；新会话以本文件为唯一进度入口

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：0、1 已退出 → 当前阶段 Phase 2 — Shared Vendor Ordinary-Node Lowering
当前工作包：P2-W9 — nested synthetic-call vendor Graph embedding isolation（实现、自动回归与用户编辑器核验完成，待提交前审核）
最近完成工作包：P2-W8 — captured custom target vendor Graph embedding observation + 用户编辑器核验
分支起点：c5dfdd6 feat: add governed documentation search
工作树预期：clean
ADR-006：Accepted = 方案 A（完整 vendor Graph materialization）
```

## 已确认事实（含 P0-W1~W6）

- Root ordinary nodes 主要走 `resolveGiaNodeId()`、vendor `Node/Pin` 和 `Graph.connect/flow`。
- Composite impl ordinary nodes 主要走 `resolveImplNodeId()`、`buildImplNodePins()` 和手写 `connects`。
- Vendor 实验确认：
  - `new Node(id, 'server', concreteId)` + `setVal()` 可正确生成 concrete type：
    - **P0-W1**: cid=324 (Float) → iOC=1, bConcreteValue 包裹 bFloat.val=0 ✓
    - **P0-W3**: cid=334 (Vec) → iOC=11, bConcreteValue 包裹 ✓
  - `Graph.connect(producer, setter, fromPin, 1)` 正确连接至 InParam[1]（value pin）
    - **P0-W2**: Float connection ✓
    - **P0-W3**: Vec connection ✓
  - Round-trip encode→decode 保留所有结构 ✓
  - 与真实 `更新v、w` impl 的 setters 逐字段匹配 ✓
  - Generic-only `Node(323)`（无 concrete ID）无法调用 `setVal()`，pins 数组为空
- **P0-W4 root/impl production encode 对照（同一 IR 语义 fixture）**：
  - Root float literal：gid=323 cid=324，InParam[1] class=10000 + bConcreteValue iOC=1
  - Root float connection：cid=324，InParam[1] bConcreteValue + conn source kind=4 index=0
  - Root vec connection：cid=334，InParam[1] type=12 + bConcreteValue iOC=11 + conn source kind=4 index=0
  - Impl 对应三者：cid=323（generic-only），无 bConcreteValue，float literal 为裸 `bFloat.val=0`
  - connection 的 source pin kind/index 在 root/impl 一致；差异集中在 concrete identity 与 wrapper schema
- 差异根因：impl 编码器未使用 concrete variant ID + `setConcrete()` / 共享 vendor lowering。
- **P0-W5 composite boundary focused baselines**：nested capture/outflow、bool、local vec3、custom variable、sparse named input 均 PASS；broad suite 78/78 active PASS；2 `@pending_ref` 缺设施图；part2/part3 既有 fixture 失败已记录未修。
- **P0-W6**：Phase 0 汇总 checkpoint 已写入 `checkpoints/phase-0-vendor-evidence.md`。
- **ADR-006（用户 2026-07-12）**：Accepted = 方案 A，完整 vendor Graph materialization 作为 Phase 1–3 主路径；B/C 不作为默认。
- 本分支已接入 P1-W2 identity resolution，但尚未切换 pin lowering 或 Graph materialization。
- **P1-W3**：shared resolver 对声明 float 的 getter 得到 generic `337` + concrete `341`；missing declaration 和
  unsupported resolved type 均保持 generic fallback，并可通过 context `fallbacks` sink 记录原因。生产路径尚未消费
  该 sink，故不改变现有编码或 diagnostics。
- **P1-W4**：root `resolveGiaNodeId()` 的 node-graph variable getter/setter scalar/list variant 先委托 shared
  resolver；没有 concrete identity 时仍走 legacy root branch，未迁移 dict/其他 family 的现有结果保持不变。
- **P1-W5**：root adapter 接受可选 fallback sink；dict setter 的 shared resolver fallback 被记录后仍由
  legacy root branch 输出既有 concrete ID `2902`。sink 未接入 production encoding 或 diagnostics。
- **P1-W6**：custom setter 从 `args[2]` value、custom getter 从 downstream output connection type 解析
  shared identity；不再把 target entity/name string 当作类型来源。root custom legacy path 未切换。
- **P2-W1**：composite impl 的 `set_node_graph_variable` float/vec3 setter 已使用 concrete vendor `Node`
  物化 pin schema；float literal、float connection、vec3 connection 的 root/impl contract parity 已转绿。
- **P2-W1**：ordinary concrete-wrapped producer 根据实际下游输出类型解析 concrete identity；float Addition
  从 generic/concrete `200/200` 修正为 `200/201`。
- **P2-W2**：impl graph-variable getter 不再进入 legacy typed-identity adapter；shared resolver 提供 concrete
  identity，vendor `Node` 物化 getter pin schema。float getter root/impl 为 `337/341`，vec3 getter为 `337/348`，
  ordinary-node contract parity 均为零差异。
- **P2-W4 用户游戏编辑器验证（2026-07-12）**：local-variable float 的重构后候选已通过。复合 impl 内两个 `Get Local Variable` 的 initial float `10`/`20`、setter、Addition connection、执行流和 composite call 均正常；归档文件 SHA-256：`cad6764f38a45260ea906f9ad8b4ca457e15fb5b824d3b31e8dd5a9fd0eef6e9`，路径为 `Beyond_Local_Export/真-测试通过/复合节点/P2W4局部变量-float-refactored-fixed.gia`。首次重构候选因 getter 被错误 materialize 为 generic `18` 而显示空参数；已作为 P2-W4 focused regression 修复。
- **用户游戏内验证（2026-07-12）**：`P2复合节点-gsts-reproduction.gia` 的 5 个复合均在编辑器中通过：
  主图 5-way fan-out、float literal setter 类型、float/vec3 producer connection、顺序分叉和 literal/connection
  pair 均确认正确。最终验证文件 SHA-256：
  `3e825367f5a5d9babce1200950b826f45ffc1d40da39b84b805cdf1dfcfbafc9`。
- **P2-W6 用户游戏编辑器验证（2026-07-12）**：在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 下，带一个
  captured float composite input 的 ordinary impl 图已通过。capture 未被写成 ordinary literal/edge，仍由
  `compositePins` 路由到 local-variable getter 的 `InParam[0]`；getter initial `10`、float setter `1.25`、
  Addition、DTC、Print、执行流和 composite call 均获用户确认。游戏目录候选 SHA-256：
  `393437cfee93eb26fc1a232a4b0077bf85b2db965a07fda83249f321967063e1`。
- **P2-W7 用户游戏编辑器验证（2026-07-12）**：在同一 gate 下，主图 float Addition `4 + 6` 的 output
  connection 作为 captured composite input 已通过。主图 Addition → composite call input 的普通 edge，与 impl
  `compositePins` → local-variable getter `InParam[0]` 的 boundary route 均获用户确认；内部 setter、Addition、
  DTC、Print、flow 和 composite call 正常。游戏目录候选 SHA-256：
  `4ab45073f3084b37d1907c1c3fea1776b2c28f5b3f6b928508a3eab14ee17d1d`。
- **P2-W8 用户游戏编辑器验证（2026-07-12）**：在同一 gate 下，captured entity target 可经
  `compositePins` 同时路由到两个 custom setters 与一个 custom getter，且 vendor-materialized custom nodes
  正常。用户确认 literal float setter、Addition connection setter、getter → Addition → DTC → Print、flow 和
  composite call 均正常。vendor custom setter value pin 的原生 `alreadySetVal` 状态无需 normalization；游戏目录
  候选 SHA-256：`8b6717d6800a5dd08fe1120a34640ae703b7b75145a28ca36a3426a84bda85f9`。

## 尚未证明

- P2-W5/P2-W6/P2-W7/P2-W8 只证明 local-float closed ordinary impl 图、单一 captured float literal 或 root
  Addition connection → local-variable getter，以及 captured entity target → custom getter/setter 的 boundary
  overlay，可由临时 vendor Graph 提取并经编辑器核验；`graphValues`、`affiliations`、多个/其他类型 capture、nested
  composite call、synthetic composite call 和其他 ordinary family 的嵌入兼容性仍未证明。
- int/bool/str/entity/guid 等其他类型的 concrete variant 一致性。
- P2-W1 已覆盖的 float/vec3 setter fixture 已被用户在游戏编辑器中接受；其他普通节点族仍未证明。
- 完整 Graph materialization 是否适用于所有 impl graph（非仅 setter family）。
- Connection pin literal default 的 wire presence（Q-003）。
- Signals/dynamic pin family 是否共用同一 resolution contract（ADR-008）。

## 最近完成工作包：P1-W7 — impl typed-identity legacy adapter boundary

目标：

- 将 `valueTypeSuffix` / `resolveTypedImplNodeId` 明确重命名、分类为 handwritten impl backend 的 legacy adapter；
- 使 node-graph/custom family 已迁移 identity 与 local-variable / getter compatibility fallback 的边界可观察；
- 保持全部现有 pin lowering、Graph materialization、capture/boundary、布局、diagnostics 和编码结果不变。

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
tests/composite/test-stage3-resolved-node-contract.ts
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-1-resolved-node-contract.md
```

验证：

```bash
npm run build                                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts       # PASS (保留 11 项 legacy pin schema drift)
npx tsx tests/composite/test-custom-variable-impl-pins.ts     # PASS
git diff --check                                               # PASS
```

证据等级：L1 legacy adapter classification + L3 existing composite output/pin regressions；无新的真实 GIA、wire、注入或游戏行为证据。

明确非目标：不删除 helper、不切换 pin lowering 或完整 Graph materialization、不改变 root/impl 编码结果、不改
capture/boundary/布局/diagnostics，也不将 adapter fallback 作为 shared resolver 的新类型来源。

完成条件：

- [x] typed-identity adapter 的允许 node family 显式可查询；
- [x] 已迁移的 `set_node_graph_variable` / `set_custom_variable` 不被 adapter 接受；
- [x] `get_node_graph_variable` / `get_custom_variable` / local-variable compatibility family 保持 adapter 边界；
- [x] existing root/impl parity 继续保留 concrete wrapper/schema drift failure contract。

## 最近完成工作包：P1-W6 — custom-variable identity contract

目标：

- 为 `set_custom_variable` / `get_custom_variable` 建立独立于 node-graph declaration 的 shared type-source
  contract；
- 覆盖 custom float setter/getter identity，并保持已有 composite custom getter pin regression；
- 不接入 root custom legacy path、不切换 pin lowering/Graph materialization 或删除 legacy helper。

修改文件：

```text
src/compiler/ir_to_gia_transform/resolved_node.ts
tests/composite/test-stage3-resolved-node-contract.ts
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-1-resolved-node-contract.md
```

验证：

```bash
npm run build                                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-custom-variable-impl-pins.ts     # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts       # PASS
git diff --check                                               # PASS
```

证据等级：L1 shared type-source contract + L3 focused composite output/pin regression；无新的真实 GIA、wire、注入或
游戏行为证据。

明确非目标：不接入 root `set/get_custom_variable` production resolver、不改变 legacy root output、不切换
ordinary pin lowering/Graph materialization、不改 capture/boundary/布局或 diagnostics、不删除 legacy helper。

完成条件：

- [x] custom setter identity 从 `args[2]` value type 得到 float concrete `26`；
- [x] custom getter identity 从 downstream output type 得到 float concrete `54`；
- [x] existing custom getter composite pin/output regression 保持通过；
- [x] root/impl ordinary setter parity 保持既有 pin schema failure contract。

## 最近完成工作包：P1-W5 — root adapter fallback accounting

目标：

- 将 root node-graph variable adapter 的 shared resolver fallback 接入可选观察 sink；
- 对 legacy fallback 的结果建立回归，不改变输出、production diagnostics 或 fallback policy；
- 不切换 pin lowering、Graph materialization 或删除 legacy helper。

修改文件：

```text
src/compiler/ir_to_gia_transform/node_id.ts
tests/composite/test-stage3-resolved-node-contract.ts
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-1-resolved-node-contract.md
```

验证：

```bash
npm run build                                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts       # PASS
git diff --check                                               # PASS
```

证据等级：L1 fallback observation contract + L3 existing encoded root/impl parity regression；无新的真实 GIA、wire、
注入或游戏行为证据。

明确非目标：不将 sink 传入 `irToGia()`、不改变 production diagnostics、不改变 dict legacy concrete
resolution、不切换 ordinary pin lowering/Graph materialization、不改 capture/boundary/布局、不删除 legacy helper。

完成条件：

- [x] root adapter 可选接收并转发 shared resolver fallback sink；
- [x] dict setter 的 fallback 记录可观察；
- [x] 同一 dict setter 继续经 legacy branch 输出既有 `2902`；
- [x] existing root/impl encoded parity fixture 保持既有 pin schema failure contract。

## 最近完成工作包：P1-W4 — root variable identity adapter

目标：

- 将 root node-graph variable getter/setter 的 scalar/list identity 决策接入 shared resolver；
- 保持 root legacy fallback 处理 dict 和未迁移 family；
- 不切换 pin lowering、Graph materialization、production diagnostics 或删除 legacy helper。

修改文件：

```text
src/compiler/ir_to_gia_transform/node_id.ts
tests/composite/test-stage3-resolved-node-contract.ts
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-1-resolved-node-contract.md
```

验证：

```bash
npm run build                                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts       # PASS
git diff --check                                               # PASS
```

证据等级：L1 shared root/impl identity adapter + L3 existing encoded root/impl parity regression；无新的真实
GIA、wire、注入或游戏行为证据。

明确非目标：不切换 ordinary pin lowering、不尝试完整 Graph materialization、不改变 dict/list legacy fallback
之外的 family、不改变 capture/boundary/布局或 diagnostics、不删除 legacy helper。

完成条件：

- [x] root float setter 通过 shared resolver 得到 concrete `324`；
- [x] root vec3 setter 通过 shared resolver 得到 concrete `334`；
- [x] root float getter 通过 shared resolver 得到 concrete `341`；
- [x] no-concrete 路径继续落入 legacy root fallback；
- [x] existing root/impl encoded parity fixture 保持既有 pin schema failure contract。

## 最近完成工作包：P1-W3 — getter identity 与 fallback accounting contract

目标：

- 为声明变量的 getter 增加 shared identity regression；
- 明确 missing declaration 和当前 suffix 不支持类型的 resolver fallback，提供可计数 sink；
- 不改变 root/impl production lowering、legacy fallback 行为或 diagnostics。

修改文件：

```text
src/compiler/ir_to_gia_transform/resolved_node.ts
tests/composite/test-stage3-resolved-node-contract.ts
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-1-resolved-node-contract.md
```

验证：

```bash
npm run build                                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts       # PASS
git diff --check                                               # PASS
```

证据等级：L1 resolver contract + L3 existing root/impl parity regression；无新的真实 GIA、wire、注入或游戏行为证据。

明确非目标：不接入 root production resolver、不改 impl legacy pin lowering、不切换 Graph materialization、不改变
missing declaration 的 generic fallback、不删除 legacy helper。

完成条件：

- [x] getter declaration identity 覆盖 float generic `337` + concrete `341`；
- [x] missing declaration 的 generic fallback 和原因可被测试观察；
- [x] unsupported resolved type 的 generic fallback 和原因可被测试观察；
- [x] existing identity parity fixture 继续通过且保留 pin schema failure contract。

## 最近完成工作包：P1-W2 — root/impl identity adapter 接入

目标：

- 将 setter/getter family 的 generic/concrete identity 接入共享 resolver；
- root 保持现有输出路径，impl 仅切换 identity，继续使用 legacy pin builder；
- 保留 pin wrapper/schema 差异作为 Phase 2/3 的失败契约。

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
src/compiler/ir_to_gia_transform/resolved_node.ts
 tests/composite/test-stage3-root-impl-parity.ts
```

验证：

```bash
npm run build                                  # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts  # PASS
 git diff --check                               # PASS
```

证据等级：L1 identity contract + L3 encoded parity；ordinary pin wrapper 仍未一致。

明确非目标：不切换 pin lowering、Graph materialization、capture、布局或 legacy 删除。

完成条件：

- [x] root/impl float setter identity 均为 generic `323` + concrete `324`；
- [x] root/impl vec3 setter identity 均为 generic `323` + concrete `334`；
- [x] parity helper 不再报告 concreteId mismatch；
- [x] legacy pin wrapper/index mismatch 保留并明确记录。

## 最近完成工作包：P1-W1 — Resolved Node Contract 观察实现

目标：

- 建立 Stage 3 内部 resolved value type、compile context 和 node identity contract 的最小实现；
- 覆盖 float/vec3 setter variant identity；
- 对声明类型与赋值类型冲突产生结构化 diagnostic；
- 不切换现有 root/impl production lowering。

修改文件：

```text
src/compiler/ir_to_gia_transform/resolved_node.ts
 tests/composite/test-stage3-resolved-node-contract.ts
```

验证：

```bash
npm run build                                  # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts  # PASS
git diff --check                               # PASS
```

证据等级：L1 Resolved contract；未证明 vendor encoding、Graph materialization 或游戏行为。

明确非目标：

- 不修改现有 `resolveGiaNodeId()` 或 `resolveImplNodeId()` 调用路径；
- 不切换 ordinary pin lowering 或 connection materialization；
- 不删除 legacy helper；
- 不注入。

完成条件：

- [x] resolved scalar/list/dict/enum/local-variable contract 有最小表示；
- [x] float setter 解析 generic `323` + concrete `324`；
- [x] vec3 setter 解析 generic `323` + concrete `334`；
- [x] 声明 float + assigned int 产生 `E_TYPED_INPUT_CONFLICT`；
- [x] root/impl 生产输出保持未切换。

## 已完成工作包：P2-W2 — graph-variable getter shared identity + vendor pin materialization

状态：实现与自动回归完成；已提交为 `d9aad11`

目标：

- graph-variable getter 的 impl concrete identity 只使用 shared resolver；
- 保留 vendor `Node` getter pin materialization，并建立 float/vec3 root/impl encoded parity；
- 不迁移 custom/local variable、不切换完整 Graph materialization 或删除 handwritten backend。

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
tests/composite/test-stage3-resolved-node-contract.ts
tests/composite/test-stage3-root-impl-parity.ts
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-2-shared-vendor-node-lowering.md
```

验证：

```bash
npm run build                                             # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts   # PASS
npx tsx tests/composite/test-stage3-p2-game-validation.ts # PASS; 自动结构检查，不替代游戏验证
git diff --check                                          # PASS
```

证据等级：L1 shared identity/backend gate + L3 encoded root/impl parity；无新增真实 GIA、wire、注入或游戏行为证据。

完成条件：

- [x] `get_node_graph_variable` 不再由 legacy impl typed-identity adapter 接受；
- [x] float getter root/impl generic/concrete identity 为 `337/341`；
- [x] vec3 getter root/impl generic/concrete identity 为 `337/348`；
- [x] getter vendor pin schema root/impl parity 为零差异；
- [x] P2-W1 focused regressions 未回归。

## 已完成工作包：P2-W1 — setter vendor pin materialization + game validation

状态：实现、自动回归与用户游戏编辑器验证均完成；已提交为 `c8c78fe`

目标：

- 记录 standalone vendor `Graph` 对 `set_node_graph_variable` float setter 的 NodeGraph metadata、节点 identity、位置编码和空 accessories-like 字段行为；
- 为后续 impl Graph 嵌入实验提供可重复的 baseline；
- 保留 handwritten impl pin/connect backend，不改变生产编码路径。

新增文件：

```text
tests/composite/test-stage3-vendor-graph-metadata.ts
```

验证：

```bash
npm run build                                      # PASS
npx tsx tests/composite/experiment-vendor-graph-connect-float.ts # PASS
npx tsx tests/composite/test-stage3-vendor-graph-metadata.ts     # PASS
git diff --check                                   # PASS
```

当前观察（L2 vendor node / L3 standalone encoded graph）：

- vendor `Graph.encode()` 可生成包含 float setter 的 inner graph；节点为 generic `323`、concrete `324`；`InParam[1]` 为 `type=5`、`bConcreteValue.indexOfConcrete=1`、float value `0`；
- standalone graph 的 `graphValues`、`compositePins`、`affiliations` 均为空；
- vendor `Node#setPos(0, 0)` 经编码后使用 `x/y` 像素缩放并带随机 shaking，不能直接作为 impl layout metadata 的等价物；
- 当前 CompositeDef impl wrapper 的 `graphValues`、`affiliations` 仍与 standalone vendor graph 的空字段一致，但 `compositePins` 是独立 boundary overlay（本 fixture 为 1 条），不能与 standalone 空列表直接比较；
- 当前 impl wrapper 保留 ordinary node 的 generic/concrete identity，但 ordinary pin 编码仍是 handwritten，尚未切换为 vendor Graph materialization。

未确认与下一步：

- P2-W1 的 metadata 对照已覆盖 graphValues、compositePins boundary overlay、affiliations、node identity、节点存在性、Graph wrapper id/name 和 standalone 分支 flow wire；
- 当前 fixture 已覆盖多个 ordinary nodes、float data edge、nodeIndex remap、Graph wrapper id/name、standalone 分支 flow，以及 CompositeDef impl 内 3 条 execution-flow pin 的 remap；当前 CompositeDef impl wrapper 的 name 为空、kind 为 `21002`，与 standalone vendor Graph 的 kind `21001` / name 不同；
- impl flow 观察确认 flow pin 使用 kind=2，连接 wire 使用 kind=1，目标 nodeIndex 已 remap；完整位置映射仍未覆盖；
- 当前结果仍不足以切换 `buildImplGraphNodes()` 到完整 vendor Graph materialization，也不得删除 `buildImplNodePins()`。

用户游戏编辑器审查（2026-07-12，`P2复合节点-gsts-reproduction.gia`）：**FAIL，停止本轮继续修复**。

证据：

- 真实参考：`Beyond_Local_Export/user_edit/复合节点/P2复合节点.gia`；
- gsts 复刻：`Beyond_Local_Export/P2复合节点-gsts-reproduction.gia`；
- 截图：`Beyond_Local_Export/布局/复合节点-重构-主图差异-连线异常.png`；
- 用户在游戏编辑器中确认：
  1. 主图 5 个 composite call 本应由事件节点按叉状 fan-out 全部连接；复刻文件大部分控制流断开；
  2. `P2_FloatConnection_GSTS` 错把两个固定 float literal 生成为节点图变量读取；
  3. `P2_FloatLiteral_GSTS` 的 setter 未正确物化为 float 类型；
  4. `P2_ExecutionFlow_GSTS` 错用了 true/false 条件分支，参考语义是顺序分叉，先 true 后 false；
  5. `P2_LiteralConnectionPair_GSTS` 同时存在错误顺序语义、literal setter 类型错误，以及 connected setter 的 Addition producer 未显示。

分类：首次用户审查确认失败。随后按 reference-vs-generated 最小对照修正 DSL fixture，并定位两项生产缺口：
ordinary float Addition concrete identity 未解析，以及 impl setter 仍使用 handwritten pin schema。

最终结果（用户 2026-07-12 复验）：**PASS**。

- 主图 event 直接 fan-out 到 5 个 composite calls；
- float literal setter 显示为 concrete float；
- float/vec3 Addition producer 与 setter connection 正确显示；
- execution-flow 和 pair 使用参考中的同一顺序分叉出口；
- 最终游戏目录文件与候选逐字节一致，SHA-256 为
  `3e825367f5a5d9babce1200950b826f45ffc1d40da39b84b805cdf1dfcfbafc9`。

新增/修改验证：

```bash
npm run build                                             # PASS
npx tsx tests/composite/test-stage3-p2-game-validation.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts   # PASS; setter parity green
npx tsx tests/composite/test-stage3-vendor-graph-metadata.ts # PASS
git diff --check                                          # PASS
```

明确非目标：未切换完整 impl Graph materialization，未删除 handwritten backend，未推广到其他 ordinary family。

### Phase 0

- [x] P0-W0：建立架构审计、全局计划、执行协议、实时状态和文档索引。
- [x] P0-W1：Vendor `Node(324)` float literal 实验。
- [x] P0-W2：Vendor `Graph.connect()` float connection 实验。
- [x] P0-W3：Vec setter connection 实验。
- [x] P0-W4：Root/impl ordinary-node parity helper 和 fixture。
- [x] P0-W5：锁定当前 root/impl 失败契约与 composite 边界基线。
- [x] P0-W6：Phase 0 checkpoint、证据总结和 Phase 1 决策闸门（含 ADR-006=A）。

Phase 0 已退出。后续 Phase 以各 phase 文档为计划。

## 最近完成工作包：P0-W6 — Phase 0 checkpoint 与决策闸门

目标：

- 汇总 P0-W0~W5 证据为可复用 checkpoint；
- 明确已证明 / 未证明边界；
- 关闭 ADR-006 决策闸门（用户选 A）；
- 准备 Phase 1 输入，但不开始实现。

修改文件：

```text
docs/composite-ir/architecture-redesign/checkpoints/phase-0-vendor-evidence.md
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-0-baseline-and-evidence.md
docs/composite-ir/architecture-redesign/decision-log.md
```

验证：

```bash
git diff --check
# 可选复核（本轮未强制重跑全部 baseline）
# npx tsx tests/composite/test-stage3-root-impl-parity.ts
```

明确非目标：

- 不修改 `src/` 生产编码器；
- 不开始 Phase 1 代码；
- 不注入。

完成条件：

- [x] Phase 0 汇总 checkpoint 存在且含 git 基线、命令、已证明/未证明、方案对比与用户决策；
- [x] STATUS / phase-0 反映 P0-W6 完成与 Phase 0 退出；
- [x] decision-log：ADR-006 Accepted=A；B/C 默认路径 Rejected；
- [x] 生产编码器未修改。

## 当前工作包：P2-W3 — custom-variable getter/setter shared vendor lowering + 用户编辑器核验

状态：实现、自动回归与用户游戏编辑器核验完成；用户已批准提交

目标：

- custom-variable getter/setter 的 root/impl concrete identity 使用 shared resolver；
- impl getter/setter 使用 vendor `Node` 物化 pin schema，并建立 focused root/impl parity；
- 生成独立、可人工识别的 `.gia` 候选，由用户放入游戏编辑器核验后再判定工作包完成；
- 保留 handwritten backend 和完整 Graph materialization 后续路径。

用户参与闸门：

1. 先完成自动回归并生成候选文件，不注入、不覆盖游戏目录；
2. 报告候选路径、SHA-256、预期节点与人工核验清单；
3. 用户自行放入游戏编辑器并反馈结果；
4. 游戏验证失败则保留证据并在本工作包内做 focused 修复；通过后才更新为完成。

拟修改范围：

```text
src/compiler/ir_to_gia_transform/node_id.ts
src/compiler/ir_to_gia_transform/composite.ts
tests/composite/test-stage3-resolved-node-contract.ts
tests/composite/test-stage3-root-impl-parity.ts
tests/composite/test-stage3-p2-game-validation.ts（或独立 P2-W3 生成/验证 fixture）
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/phase-2-shared-vendor-node-lowering.md
```

完成条件：

- [x] root custom getter/setter scalar identity 接入 shared resolver，legacy fallback 保留；
- [x] impl custom getter 不再进入 legacy typed-identity adapter；
- [x] custom float getter/setter vendor schema root/impl parity 为零差异（排除 captured target boundary pin）；
- [x] capture target、literal value、connection value 和 execution flow focused regression 通过；
- [x] 生成候选 `.gia`：`/tmp/P2W3自定义变量-gsts-game-validation.gia`；
- [x] 最终候选 SHA-256：`cbb66a8f46fa16e348c81e1077dd12bdb724f58dd059974f1cb822956d22e8f5`；
- [x] 用户在游戏编辑器中确认节点类型、参数、连线、执行流和 composite call 行为；
- [x] 通过文件已归档到 `Beyond_Local_Export/真-测试通过/复合节点/`；
- [x] build、focused tests、`git diff --check` 通过。

明确非目标：不迁移 local variable、list/dict/其他 custom 类型族，不切换完整 impl Graph materialization，不删除
handwritten backend，不注入或覆盖游戏目录。

## 已完成工作包：P2-W4 — local-variable float shared vendor lowering + 用户编辑器核验

状态：实现、自动回归与用户游戏编辑器核验完成；尚未提交。

目标：

- root / impl 的 local-variable float getter/setter 共享 `resolveNodeIdentity()`；
- impl 使用 vendor `Node` 物化 float getter/setter pin schema；
- 覆盖 literal setter、Addition→setter connection、getter downstream use 和 root/impl fan-out；
- 用用户确认的 editor reference 和重构后候选分别验证，不把传统路径基线误作重构验证。

关键事实：

- `Get Local Variable` 的 OutParam[0] 是 `local_variable` handle，OutParam[1] 才是实际 value；resolver 必须跳过 handle，继续从下游使用的 OutParam[1] 解析 float。
- 首次重构候选错误回退到 generic getter `18`，导致 impl 内 initial float `10` / `20` 在编辑器显示为空。用户反馈后，focused regression 锁定 concrete `2659`、InParam[0] 与 OutParam[1] 的 float concrete wrapper。
- 修复后 getter 为 generic/concrete `18/2659`，setter 为 `19/2677`；真实参考与修复候选的 raw `gia-diff.ts` 为“完全一致”。

真实 GIA / 游戏编辑器证据：

```text
参考：Beyond_Local_Export/user_edit/复合节点/P2W4局部变量-float-参考候选.gia
参考 SHA-256：12f4dfb882b1dc7df3e6810f8ab5f3271aea4c33c822d5ee4e43b01518cf9604
通过归档：Beyond_Local_Export/真-测试通过/复合节点/P2W4局部变量-float-refactored-fixed.gia
通过 SHA-256：cad6764f38a45260ea906f9ad8b4ca457e15fb5b824d3b31e8dd5a9fd0eef6e9
用户确认：复合 impl 的 10/20 initial float、setter、连接、flow 和 call 正常。
```

验证：

```bash
npm run build                                                     # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts    # PASS
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts # PASS
npx tsx tests/composite/test-stage3-p2w4-local-variable-reference-candidate.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts          # PASS
npx tsx tests/composite/test-custom-variable-impl-pins.ts        # PASS
npx tsx tests/composite/test-stage3-p2w3-custom-variable-game-validation.ts # PASS
git diff --check                                                 # PASS
```

协作文件规则（用户 2026-07-12 明确授权）：

- 候选直接复制到 Windows `/mnt/c/.../Beyond_Local_Export/` 根目录；同一工作包重试直接覆盖上一份失败候选，不逐次累积文件。
- 用户编辑器确认通过后，自动将根目录中的通过候选移动到 `Beyond_Local_Export/真-测试通过/复合节点/`；根目录不保留该通过候选。
- 不覆盖 `user_edit/` 真实参考、地图/注入目录或其他工作包文件；Windows 路径一律经 `/mnt/c` 操作。
- 报告实际路径和 SHA-256；候选覆盖和通过后归档移动不需要逐次确认，其他破坏性游戏文件操作仍须确认。

明确非目标：不迁移其他 local-variable 类型，不切换完整 vendor Graph materialization，不删除 handwritten backend，不改 capture/boundary/布局，不注入。

## 已完成工作包：P2-W5 — composite impl vendor Graph embedding observation

状态：实现、自动回归和用户游戏编辑器核验完成；尚未提交。

目标：

- 先用同一份原始 DSL 生成 legacy baseline，由用户编辑器确认后导出为本轮真实参考；
- 只在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` gate 下，让 closed ordinary composite impl graph 用 vendor `Graph.add_node()`、`connect()`、`flow()` 编码，再提取 nodes 套回既有 composite wrapper；
- 保持 composite boundary、capture、nested composite call、布局和 handwritten backend 默认路径不变。

已确认：

- 用户确认 legacy baseline `P2W5-vendor-graph-legacy-baseline.gia` 正常，并导出真实参考：`Beyond_Local_Export/user_edit/复合节点/P2W5-vendor-Graph-legacy-baseline.gia`；
- refactored candidate 只将复合 impl 内两个 local-variable float 分支（literal setter、Addition→setter、getter downstream use、DTC、Print、两条 flow）切换至 vendor Graph；主图仍是现有 root path；
- 用户在游戏编辑器中确认 refactored candidate 正常；这证明该封闭 ordinary 图的节点、data edge、flow、nodeIndex 与现有 wrapper 的组合可用；
- 自动 `gia-diff.ts` 对用户导出参考和候选仍报告 40 个 impl pin 字段差异；它们来自旧手写 pin 与 vendor pin schema 的不同，不能据此宣称 raw/wire 全等。编辑器通过证明本样本行为可用，不推广为所有类型或 boundary 的 wire 等价。

真实 GIA / 游戏编辑器证据：

```text
legacy candidate (used only before editor export; removed from export root after completion): Beyond_Local_Export/P2W5-vendor-graph-legacy-baseline.gia
legacy candidate SHA-256: 19db5302bb85b1a935a155ffee68bf8a9d0daac5481f15d6e4a7b34420bcd87b
editor-exported reference: Beyond_Local_Export/user_edit/复合节点/P2W5-vendor-Graph-legacy-baseline.gia
editor-exported reference SHA-256: 91416d44384f4ae954c4e69ed0d40917c468306ca07e92114a89855a15ea53bc
passed archive: Beyond_Local_Export/真-测试通过/复合节点/P2W5-vendor-graph-refactored-candidate.gia
passed archive SHA-256: 86c2a1b9c8e9a771f68e5d5c0e7451169ea3f5dfceada75d7efd5e5e0a60d9d0
user confirmation: legacy baseline and refactored candidate both passed editor review.
```

验证：

```bash
npm run build                                                                 # PASS
npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts            # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts /tmp/P2W5-vendor-graph-refactored-candidate.gia # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts                       # PASS
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts             # PASS
npx tsx tests/composite/test-nested-composite-capture-pins.ts                 # PASS
npx tsx tests/composite/test-nested-composite-outflow.ts                      # PASS
git diff --check                                                              # PASS
```

明确非目标：不将 gate 设为默认，不删除手写 impl backend，不迁移 capture、nested composite call、compositePins、graphValues、affiliations 或布局，不注入，不改 vendor/generated 文件。

## 待用户决策

P2-W8 已通过用户编辑器核验。P2-W9 的 synthetic-call isolation 已获用户授权并完成最小实现：vendor 仅 materialize
ordinary subgraph，legacy composite backend 保留 `__composite_call__`，post-materialization overlay 只补写 nested
OutFlow → ordinary Print execution flow。首次编辑器反馈确认 outer 内的打印节点连线断开；根因是 fixture 内层复合未声明
OutFlow，nested call 因而没有可用的完成出口。已修复 fixture：inner Print 显式连到 entry 并标记 `完成` OutFlow；同时避免
对 legacy synthetic → ordinary edge 二次 overlay。修复候选已按用户授权覆盖到 `Beyond_Local_Export` 根目录，待用户复验。
用户另授权：后续 Stage 3 名称明确的候选 `.gia` 可直接复制/覆盖该根目录，无需逐次确认；该授权不包含真实参考、归档、
地图/注入目录、删除/清理或注入。ADR-006=A 保持不变，P2-W9 不授权删除 handwritten backend 或默认开启 gate。

## 当前完成工作包：P2-W7 — captured connection vendor Graph embedding observation

状态：实现、自动回归、候选复制和用户游戏编辑器核验完成；尚未提交。

目标：

- 只在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` gate 下观察 root ordinary producer connection 能否作为 captured
  float composite input 与 vendor-materialized ordinary impl graph 共存；
- 分别锁定 root Addition → composite call input ordinary edge，以及 impl `compositePins` → getter input
  boundary route；
- 不改变默认 backend、capture 语义、nested composite call、布局、`graphValues` 或 `affiliations`。

已验证：

- root float Addition `4 + 6` 的 `OutParam[0]` 正确连接至 composite call `InParam[0]`；
- impl capture 不成为 ordinary edge，仍仅通过 `compositePins` 路由到 `get_local_variable.InParam[0]`；
- 用户确认 root connection、capture route、getter/setter、ordinary data/flow、DTC、Print 与 call 均正常。

真实 GIA / 游戏编辑器证据：

```text
candidate: Beyond_Local_Export/P2W7-captured-connection-refactored-candidate.gia
candidate SHA-256: 4ab45073f3084b37d1907c1c3fea1776b2c28f5b3f6b928508a3eab14ee17d1d
user confirmation: root Addition connection, captured boundary route and impl behavior passed editor review.
```

验证：

```bash
npm run build                                                                 # PASS
npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts /tmp/P2W7-captured-connection-legacy-baseline.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts /tmp/P2W7-captured-connection-refactored-candidate.gia # PASS
npx tsx tests/composite/test-nested-composite-capture-pins.ts                # PASS
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P2W6-capture-vendor-graph-regression.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P2W6-capture-vendor-graph-vendor-regression.gia # PASS
npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts /tmp/P2W5-vendor-graph-regression.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts /tmp/P2W5-vendor-graph-vendor-regression.gia # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts                      # PASS
git diff --check                                                              # PASS
```

明确非目标：不将 gate 设为默认，不删除 handwritten backend，不迁移 custom target/nested composite call/DTC，不改
capture 语义、`compositePins` 结构、布局、`graphValues` 或 `affiliations`，不注入，不改 vendor/generated 文件。

## 当前完成工作包：P2-W6 — captured input vendor Graph embedding observation

状态：实现、自动回归、候选复制和用户游戏编辑器核验完成；尚未提交。

目标：

- 只在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` gate 下观察一个 captured float composite input 能否与 vendor-materialized ordinary impl graph 共存；
- 保持 capture 为 `compositePins` boundary overlay，不把它写成 ordinary literal 或 ordinary data edge；
- 保持默认 handwritten backend、nested composite call、布局、`graphValues`、`affiliations` 和 synthetic call 不变。

已验证：

- gate 对 capture arg 不再拒绝；它跳过 `Pin.setVal()`，保留 vendor-created physical schema pin；
- fixture 中 captured input 经 `compositePins` 路由到 `get_local_variable.InParam[0]`，该 pin 无 ordinary `connects`；
- vendor candidate 保留 getter concrete `2659`、setter concrete `2677`、Addition、DTC、Print 和 ordinary execution flow；
- 用户在游戏编辑器确认 captured initial float `10`、setter `1.25`、连线、执行流与 composite call 正常。

真实 GIA / 游戏编辑器证据：

```text
candidate: Beyond_Local_Export/P2W6-capture-vendor-graph-refactored-candidate.gia
candidate SHA-256: 393437cfee93eb26fc1a232a4b0077bf85b2db965a07fda83249f321967063e1
user confirmation: capture routing, local initial value, setter, ordinary data/flow and composite call passed editor review.
```

验证：

```bash
npm run build                                                                 # PASS
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P2W6-capture-vendor-graph-legacy-baseline.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P2W6-capture-vendor-graph-refactored-candidate.gia # PASS
npx tsx tests/composite/test-nested-composite-capture-pins.ts                # PASS
npx tsx tests/composite/test-nested-composite-outflow.ts                     # PASS
npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts /tmp/P2W5-vendor-graph-legacy-regression.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts /tmp/P2W5-vendor-graph-vendor-regression.gia # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts                      # PASS
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts            # PASS
npx tsx tests/composite/test-custom-variable-impl-pins.ts                    # PASS
git diff --check                                                              # PASS
```

明确非目标：不将 gate 设为默认，不删除 handwritten backend，不迁移 nested composite call、DTC、其他 capture
形态、`graphValues`、`affiliations` 或布局，不注入，不改 vendor/generated 文件。

## 当前完成工作包：P2-W8 — captured custom target vendor Graph embedding observation

状态：实现、自动回归、候选复制和用户游戏编辑器核验完成；尚未提交。

目标：

- 只在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` gate 下观察 captured entity target 是否能与
  vendor-materialized custom getter/setter impl 图共存；
- captured target 仅经 `compositePins` overlay 路由，不物化为 custom nodes 的 ordinary target pin；
- 先保留 vendor 原生 custom setter value-pin `alreadySetVal`，由编辑器结果决定是否需要 normalization。

已验证：

- custom getter/setter 的 captured target `InParam[0]` 不再物化为 ordinary pin；`compositePins` 对两个 setters
  与一个 getter 各保留一条 target route；
- float custom setter concrete ID 为 `26`、getter concrete ID 为 `54`；literal setter、Addition connection setter、
  getter downstream use、DTC、Print 和 ordinary edges 均被 fixture 锁定；
- 用户确认 editor 中上述节点、target capture、执行流和 composite call 正常；vendor custom setter value pin 的
  原生 `alreadySetVal` 状态在该样本中可用，因此没有增加手工 normalization。

真实 GIA / 游戏编辑器证据：

```text
candidate: Beyond_Local_Export/P2W8-captured-custom-target-refactored-candidate.gia
candidate SHA-256: 8b6717d6800a5dd08fe1120a34640ae703b7b75145a28ca36a3426a84bda85f9
user confirmation: captured custom target, literal/connected setter, getter, data/flow and composite call passed editor review.
```

验证：

```bash
npm run build                                                                 # PASS
npx tsx tests/composite/test-stage3-p2w8-captured-custom-target-vendor-graph.ts /tmp/P2W8-captured-custom-target-legacy-baseline.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w8-captured-custom-target-vendor-graph.ts /tmp/P2W8-captured-custom-target-refactored-candidate.gia # PASS
npx tsx tests/composite/test-custom-variable-impl-pins.ts                    # PASS
npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P2W6-capture-vendor-graph-regression.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts /tmp/P2W6-capture-vendor-graph-vendor-regression.gia # PASS
npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts /tmp/P2W7-captured-connection-regression.gia # PASS
GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w7-captured-connection-vendor-graph.ts /tmp/P2W7-captured-connection-vendor-regression.gia # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts                      # PASS
git diff --check                                                              # PASS
```

明确非目标：不将 gate 设为默认，不删除 handwritten backend，不迁移 nested composite call/DTC，不改 capture
或 `compositePins` 语义、布局、`graphValues` 或 `affiliations`，不注入，不改 vendor/generated 文件。

## 进行中或未提交变化

P2-W9 isolation 实现、自动回归与文档更新完成、未提交。当前变化：
`src/compiler/ir_to_gia_transform/composite.ts`、
`docs/composite-ir/architecture-redesign/{STATUS.md,phase-2-shared-vendor-node-lowering.md,decision-log.md,checkpoints/phase-2-vendor-embedding-evidence.md}`；原 P2-W9 fixture 已在 HEAD。

首次 probe 保留失败证据：legacy baseline PASS；原 vendor-gated candidate FAIL，错误为
`[error] vendor impl graph gate missing __composite_call__ InParam[0]`。用户随后选择方案 A。实现把
`__composite_call__` 从 vendor ordinary Graph 分离，使用既有 composite lowerer 生成 SysGraph/pins/`relatedIds`，并在
vendor 编码 ordinary nodes 后仅 overlay synthetic ↔ ordinary 的 execution-flow edges。ordinary node 消费 synthetic
数据源时明确报错，不静默 fallback；反向数据边不属于本工作包的验证范围。

复杂控制流回归曾暴露两项问题并已修复：（1）vendor Graph 对同一 OutFlow 的 fan-out 未按 DSL 插入顺序编码，`路径1/2/3/4`
显示为 `1/4/3/2`；adapter 现在显式传入每个 source OutFlow 的插入位置。（2）vendor Graph 保留被 `compositePins`
capture 接管的 `double_branch.InParam[0]`；除 P2-W6 已验证的 `get_local_variable` capture handle 外，captured ordinary
input 一律过滤 vendor physical InParam。另修复 nested synthetic call：物理 OutFlow 同时覆盖 ordinary downstream 边和
外层 `compositePins` 所引用的 child OutFlow；`嵌套出口测试-顺序执行` DSL 改为四个独立 fork 分支，分别映射一/二/三/四。

用户编辑器核验（2026-07-13）：全部通过。已核验 `P2W9-complex-multi-inflow-outflow.gia`（4 InFlow / 5 OutFlow / 13 主图
执行边）、`P2W9-nested-multi-outflow.gia`（nested 四独立 OutFlow）、`P2W9-reference-flow-patterns.gia`（多复合、多
OutFlow 与数据）和 `P2W9-nested-call-vendor-graph-candidate.gia`。未注入。当前验证：`npm run build`、P2-W9
legacy/vendor fixture、nested outflow/capture regression、P2-W5 legacy/vendor regression 与 `git diff --check` 均 PASS。
详见 `checkpoints/phase-2-vendor-embedding-evidence.md` 和 ADR-009。

## 新会话恢复

1. 读取 [EXECUTION.md](EXECUTION.md)、[COLLABORATION-PLAYBOOK.md](COLLABORATION-PLAYBOOK.md)；结束涉及真实 GIA/用户编辑器协作的工作包时，再读 [COLLABORATION-PLAYBOOK-MAINTENANCE.md](COLLABORATION-PLAYBOOK-MAINTENANCE.md) 决定是否做最小经验更新；
2. 检查分支、status 和最近提交；
3. P2-W5~W8 已完成并已提交；P2-W9 isolation 已通过用户编辑器核验、待提交前审核，先读取
   `checkpoints/phase-2-vendor-embedding-evidence.md`、ADR-009 和本文件“进行中或未提交变化”；
4. 架构约束：ADR-006 = 完整 vendor Graph materialization，但 vendor 仅覆盖 ordinary subgraph；P2-W9 已获用户授权
   isolation，仍不得默认开启 gate、删除 handwritten backend，或将 nested data/capture/sparse input 混入当前工作包；
5. 不覆盖无法解释的变化。
