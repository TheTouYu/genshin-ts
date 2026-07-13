# Phase 2：共享 Vendor Ordinary-Node Lowering

> 状态：P2-W1~P2-W12a、P2-W16 已完成；P2-W3~P2-W12a、P2-W16 已通过用户游戏编辑器核验
> 来源：目标架构设计 + 当前实现/自动回归 + 官方节点规则查询 + 真实 GIA 对照 + 用户游戏编辑器验证
> 最近校验：2026-07-13
> 适用范围：ordinary vendor subgraph 与已验证的 composite synthetic/boundary overlay；不代表默认 backend 或全部类型编码

## 目标

建立 root/impl 共用的 ordinary node factory，以 vendor `Node` 作为 pin schema 和 concrete wrapper 的主要物化器。

## 首个 vertical slice

`set_node_graph_variable`：

- float literal `额外压力=0`；
- vec3 connection `F/J/v/w`；
- bool trigger 参数；
- root 与 impl。

不得按物理变量名编码，节点族规则必须通用。

## P2-W1 当前结果：standalone vendor Graph metadata observation

状态：观察契约与首个 setter-family 生产切片已通过；完整 impl Graph embedding 仍待验证

新增观察测试：`tests/composite/test-stage3-vendor-graph-metadata.ts`

已验证：

- standalone `Graph.encode()` 能生成普通 setter NodeGraph；
- float setter 的 generic/concrete identity 和 `InParam[1]` concrete wrapper 与既有 vendor/真实 GIA 证据一致；
- standalone graph 的 `graphValues`、`compositePins`、`affiliations` 为空；
- 当前 CompositeDef impl wrapper 的 `graphValues`、`affiliations` 与 standalone vendor graph 的空字段一致；`compositePins` 是独立 boundary overlay，不应与 standalone 空列表直接比较；
- P2-W1 前当前 impl wrapper 的 ordinary pin 编码为 handwritten；P2-W1 后仅
  `set_node_graph_variable` float/vec3 family 使用 concrete vendor `Node` 物化 schema；其他 family 仍为 handwritten；
- `Node#setPos()` 的编码包含 vendor 像素缩放和随机 shaking，因此不能直接视为 impl layout 坐标契约；
- standalone Graph wrapper 使用 inner `NodeGraph.id.kind=21001`，并保留 Graph name；
- standalone `Graph.flow()` 将分支 flow 编码为 source node 的 kind=2 flow pins，并保留 source flow index、target node index 和 target flow index。

仍待验证：

- 当前 fixture 已覆盖多个 ordinary nodes、float data edge、nodeIndex remap、Graph wrapper id/name、standalone 分支 flow，以及 CompositeDef impl 内 3 条 execution-flow pin 的 remap；CompositeDef impl wrapper 观察到 `kind=21002` 且 name 为空，不能直接视为 standalone Graph wrapper 等价物；
- impl flow 观察确认 flow pin 使用 kind=2，连接 wire 使用 kind=1，目标 nodeIndex 已 remap；完整位置映射仍未覆盖；
- `compositePins` boundary overlay 已单独观察，不作为 ordinary vendor metadata 的一部分；
- 该结果仅授权已验证的 setter-family vertical slice；不能授权完整 Graph materialization 或删除 handwritten impl backend。

验证命令：

```bash
npm run build                                      # PASS
npx tsx tests/composite/experiment-vendor-graph-connect-float.ts # PASS
npx tsx tests/composite/test-stage3-vendor-graph-metadata.ts     # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts          # PASS; setter schema parity green
npx tsx tests/composite/test-stage3-p2-game-validation.ts        # PASS; game validation pending in script
git diff --check                                   # PASS
```

### P2-W1 游戏编辑器复刻审查：首次失败，修复后通过

2026-07-12 用户将 gsts 结构复刻文件放入游戏编辑器检查，结果不能作为成功复现：

- 参考文件：`Beyond_Local_Export/user_edit/复合节点/P2复合节点.gia`；
- 生成文件：`Beyond_Local_Export/P2复合节点-gsts-reproduction.gia`；
- 截图证据：`Beyond_Local_Export/布局/复合节点-重构-主图差异-连线异常.png`。

已确认失败：

1. 主图 composite calls 的事件 fan-out 大部分断开；
2. float connection 的固定 literal 被错误表达为 graph-variable getters；
3. float literal setter 未正确显示为 float setter variant；
4. execution-flow fixture 把参考的顺序分叉误实现成 true/false 条件二选一；
5. literal/connection pair 继承上述问题，且 connected setter 的 Addition producer 未出现。

随后按“作者语义 → IR → encoded topology”逐层比较，确认并修复：

1. 测试 DSL：主图改用 detached composite calls + 显式 fan-out；literal connection 不再伪造 graph-variable getters；
   顺序分叉统一连接参考的 `double_branch.OutFlow[1]`；
2. producer identity：float Addition 根据下游 `float` 类型解析为 generic `200` + concrete `201`；
3. setter schema：impl `set_node_graph_variable` 使用 concrete vendor `Node` 生成 literal/connection 共用的 pin schema。

最终用户游戏编辑器验证（2026-07-12）：**PASS**。

- 5-way main fan-out 正确；
- float literal 参数显示为浮点数；
- float/vec3 producer connections 正确；
- execution-flow 与 literal/connection pair 正确；
- 最终验证文件：`Beyond_Local_Export/P2复合节点-gsts-reproduction.gia`；
- SHA-256：`3e825367f5a5d9babce1200950b826f45ffc1d40da39b84b805cdf1dfcfbafc9`。

证据分层：自动回归证明结构契约；文件复制校验证明目标文件与候选一致；用户反馈证明游戏编辑器行为通过。

## 工作项

### 2.1 提取共享 value adapter

把 root 内部 `setArgValue`、`setLiteralArgValue`、enum handling 组合为可从 ordinary factory 调用的接口。错误信息保留
node id/type/pin/arg。

### 2.2 建立 ordinary factory

输入 resolved identity/inputs，输出 vendor `Node` + pending edges。对 literal 调 `Pin.setVal()`；对 connection 保留
vendor 创建的 pin，不创建新 pin。

### 2.3 集中 normalization

把 `filterUnkPins`、name pin、hidden pin 等按证据迁入统一 adapter。首个切片只迁移 setter 所需规则，不同时重构
signals/list/dict。

### 2.4 Impl feature gate

迁移期允许按 ordinary node family 切换：

```text
shared vendor lowering supported → 新路径
otherwise → legacy buildImplNodePins
```

Gate 必须可枚举，测试中断言 setter 已走新路径；禁止 catch 后静默 fallback。

### 2.5 编码后契约

对新路径输出执行 runtime assertion：

- resolved concrete ID 等于 encoded concrete ID；
- 每个 resolved physical input 找到 vendor pin；
- pin type 与 resolved type 兼容；
- ordinary pin 不携带 compositePinIndex。

## 实现文件草案

```text
src/compiler/ir_to_gia_transform/resolved_graph.ts
src/compiler/ir_to_gia_transform/ordinary_node.ts
src/compiler/ir_to_gia_transform/vendor_normalization.ts
```

先新增共享模块，不先移动整个 `composite.ts`。

## 验证

- Phase 0 parity test 从失败转成功；
- `额外压力` 与真实 n[4] 逐字段对比；
- vec3 setters 逐字段检查；
- root output fixture 不发生意外变化；
- bool、nested、capture、local/custom focused tests；
- 生成物理 GIA但不注入。

## 退出条件

- [x] setter family root/impl 共用 vendor Node schema mechanism（当前 impl 为受限 vertical slice）；
- [x] float setter encoded concrete `324`；
- [x] `InParam[1]` 与真实 concrete float 同构；
- [x] vec3 connection 保留 vendor target schema；
- [x] literal/connection parity 通过；
- [x] `buildImplNodePins()` 的 setter branch 不再手写 ordinary pins；
- [x] 已有 focused 迁移不变量通过；
- [x] 游戏目录替换经用户明确授权，且用户编辑器验证通过。

## P2-W2 当前结果：graph-variable getter vendor pin materialization

状态：实现与自动回归完成，待审核；无新增真实 GIA 或游戏内验证。

已验证：

- impl `get_node_graph_variable` 的 generic/concrete identity 由 shared `resolveNodeIdentity()` 提供，不再进入
  handwritten impl typed-identity adapter；
- float getter `a` 在 root/impl 均为 generic `337` + concrete `341`；
- vec3 getter `向量` 在 root/impl 均为 generic `337` + concrete `348`；
- getter 的变量名输入、concrete wrapper 和输出 pin schema 继续由 vendor `Node` 物化；
- root/impl getter ordinary-node contract parity 为零差异；
- P2-W1 setter parity 和 game-validation 结构契约未回归。

验证命令：

```bash
npm run build                                             # PASS
npx tsx tests/composite/test-stage3-resolved-node-contract.ts # PASS
npx tsx tests/composite/test-stage3-root-impl-parity.ts   # PASS
npx tsx tests/composite/test-stage3-p2-game-validation.ts # PASS; script仍明确标注游戏验证不能由自动测试替代
git diff --check                                          # PASS
```

证据边界：L1 shared identity/backend gate + L3 encoded root/impl parity；没有新增真实 GIA、wire、注入或用户游戏行为证据。

明确非目标：不迁移 custom/local variable family，不切换完整 impl Graph materialization，不删除 handwritten backend，
不推广 float/vec3 getter 结果到 list/dict/其他类型。

## P2-W3 当前结果：custom-variable getter/setter shared vendor lowering

状态：实现、自动回归与用户游戏编辑器核验完成。

已验证（自动证据）：

- root custom-variable float getter/setter 优先使用 shared `resolveNodeIdentity()`；未支持类型仍保留 legacy fallback；
- impl custom getter 不再进入 legacy typed-identity adapter；getter/setter concrete identity 都来自 shared resolver；
- impl custom getter/setter 使用 vendor `Node` 物化 pin schema；captured target entity 继续由 composite boundary overlay 路由；
- float literal setter、float connection setter、float getter 在排除 captured target physical pin 后 root/impl ordinary contract parity 为零差异；
- setter hidden trigger pin 使用 physical `InParam[4]`；connection value 保留 Addition producer 和 data edge；
- P2-W1/P2-W2 focused regressions未回归。

验证命令：

```bash
npm run build
npx tsx tests/composite/test-stage3-resolved-node-contract.ts
npx tsx tests/composite/test-custom-variable-impl-pins.ts
npx tsx tests/composite/test-stage3-root-impl-parity.ts
npx tsx tests/composite/test-stage3-p2-game-validation.ts
npx tsx tests/composite/test-stage3-p2w3-custom-variable-game-validation.ts
git diff --check
```

候选文件：

```text
/tmp/P2W3自定义变量-gsts-game-validation.gia
最终 SHA-256: cbb66a8f46fa16e348c81e1077dd12bdb724f58dd059974f1cb822956d22e8f5
归档：`Beyond_Local_Export/真-测试通过/复合节点/P2W3自定义变量-gsts-game-validation.gia`
```

游戏编辑器核验清单：

1. 主图能看到 float literal setter、Addition → connected setter、custom getter → Addition → string conversion/print；
2. composite `P2W3_CustomVariable_GSTS` 内存在同样的 literal setter、connected setter 和 getter；
3. 两个 setter 均显示为 float 变种，变量名分别为 `p2w3_literal_float` 和 `p2w3_connected_float`；
4. connected setter 的 value pin 来自 Addition，getter 输出也进入另一个 Addition；
5. composite target entity 通过复合输入连接，内部不应出现错误的独立 target literal；
6. execution flow 依次经过两个 setter 和 print，composite call 可从主图事件执行。

游戏编辑器证据（用户 2026-07-12）：主图与 composite impl 的 float literal setter、Addition connection setter、
float getter、target capture、hidden trigger pin、执行流和 composite call 均确认正常。首次候选的 Print String 参数异常
来自 fixture 缺少 float→string DTC；补入 `Data Type Conversion` 后用户复验通过。该结果只覆盖 float custom-variable
场景，不推广到其他类型族。

附加布局观察：同语义标准管线候选的视觉布局不理想；随后在当前分支重新生成最近五个 Round 15 布局基线，用户
确认全部通过。故记录为新场景布局覆盖缺口，不作为 shared custom-variable lowering 回归，也不在 P2-W3 修改布局。

明确非目标：不迁移 local variable、list/dict/其他 custom 类型族，不切换完整 impl Graph materialization，不删除
handwritten backend，不注入或覆盖游戏目录。

## P2-W4 当前结果：local-variable float getter/setter shared vendor lowering

状态：实现、自动回归与用户游戏编辑器核验完成；尚未提交。

已验证：

- root / impl local-variable float getter/setter 共享 `resolveNodeIdentity()`；impl 不再走 legacy typed-identity adapter；
- `Get Local Variable` 必须忽略 OutParam[0] 的 `local_variable` handle，使用实际 float value 的 OutParam[1] 下游类型；修复后 getter 为 generic/concrete `18/2659`；
- float setter 为 generic/concrete `19/2677`，literal 和 Addition connection 均保留 vendor concrete schema；
- 初次重构候选错误地 materialize 为 generic getter `18`，使 editor 中 initial float `10` / `20` 为空；用户反馈后已添加 focused assertion，锁定 getter concrete ID、InParam[0] 和 OutParam[1] wrapper；
- 修复后与用户导出的真实 reference 比较，`gia-diff.ts` 对 composite impl 报“完全一致”；用户再次在编辑器中确认 initial values、setter、connection、flow 与 composite call 正常。

真实证据：

```text
reference: Beyond_Local_Export/user_edit/复合节点/P2W4局部变量-float-参考候选.gia
reference SHA-256: 12f4dfb882b1dc7df3e6810f8ab5f3271aea4c33c822d5ee4e43b01518cf9604
passed archive: Beyond_Local_Export/真-测试通过/复合节点/P2W4局部变量-float-refactored-fixed.gia
passed SHA-256: cad6764f38a45260ea906f9ad8b4ca457e15fb5b824d3b31e8dd5a9fd0eef6e9
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

明确非目标：不迁移 vec3/int/bool/list/dict 等其他 local-variable 类型，不切换完整 vendor Graph materialization，不删除 handwritten backend，不改 composite boundary、capture 或布局。

## P2-W5 当前结果：composite impl vendor Graph embedding observation

状态：实现、自动回归和用户游戏编辑器核验完成；已提交为 `7e7d8d2`。

本工作包先用同一份 DSL 走 legacy 路径，由用户确认后导出为真实参考；随后仅在
`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 实验 gate 下，闭合的 ordinary impl graph 用 vendor
`Graph.add_node()`、`Graph.connect()`、`Graph.flow()` 编码，并提取 encoded nodes 放回现有
CompositeDef impl wrapper。默认路径仍为 handwritten backend。

已验证范围：两个 local-variable float 分支，覆盖 getter/setter、literal、Addition→setter 数据线、
getter downstream use、float→string DTC、Print 和两条 execution flow。用户确认 legacy baseline 和
refactored candidate 均在游戏编辑器中正常；候选 SHA-256 为
`86c2a1b9c8e9a771f68e5d5c0e7451169ea3f5dfceada75d7efd5e5e0a60d9d0`，参考路径为
`Beyond_Local_Export/user_edit/复合节点/P2W5-vendor-Graph-legacy-baseline.gia`。

边界：自动对比仍可见旧手写 pin 与 vendor schema 的 40 个字段差异，故本结果证明的是指定闭合
ordinary 图可在编辑器工作，而不是 raw/wire 全等；capture、nested composite call、`compositePins`、
`graphValues`、`affiliations`、其他节点族和默认切换仍待独立验证。

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

明确非目标：不删除 handwritten backend，不把 gate 设为默认，不迁移 boundary/capture/布局，不注入。

## P2-W6 当前结果：captured input vendor Graph embedding observation

状态：实现、自动回归和用户游戏编辑器核验完成；已提交为 `0b09bf2`。

在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 实验 gate 下，P2-W6 将一个 captured float composite input 与 P2-W5
同类 local-float ordinary impl 图组合。capture arg 不调用 vendor `Pin.setVal()`，保留 vendor 创建的
`get_local_variable.InParam[0]` schema pin，并继续只由 CompositeDef impl 的 `compositePins` overlay 路由；它不成为
ordinary literal 或 ordinary data edge。

用户在编辑器确认 candidate 的 captured initial float `10`、float setter `1.25`、Addition、DTC、Print、ordinary
flow 和 composite call 正常。候选位于
`Beyond_Local_Export/P2W6-capture-vendor-graph-refactored-candidate.gia`，SHA-256 为
`393437cfee93eb26fc1a232a4b0077bf85b2db965a07fda83249f321967063e1`。

自动验证：

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

证据边界：该结果证明一个 captured float → local-variable getter 的 boundary route 能与 vendor Graph-extracted
ordinary nodes 共存且在编辑器工作。它不证明多个 capture、captured connection、custom target、nested composite call、
synthetic call、`graphValues`、`affiliations` 或其他 ordinary family 的兼容性；不得据此默认开启 gate 或删除 handwritten
backend。

明确非目标：不迁移 DTC/nested composite call，不改变 capture 语义或 `compositePins` 结构，不改布局，不注入。

## P2-W7 当前结果：captured connection vendor Graph embedding observation

状态：实现、自动回归和用户游戏编辑器核验完成；已提交为 `23ca190`。

P2-W7 在 P2-W6 的 captured float → local-variable getter fixture 中，仅把外部值来源改为 root
`Addition(4, 6).OutParam[0]`。自动断言锁定两段不同的边：root Addition → synthetic composite call
`InParam[0]` 是 ordinary connection；impl 侧仍是 `compositePins` → `get_local_variable.InParam[0]` boundary
route，getter pin 不应出现 ordinary `connects`。在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 下用户确认该候选在编辑器
正常。

候选：`Beyond_Local_Export/P2W7-captured-connection-refactored-candidate.gia`；SHA-256：
`4ab45073f3084b37d1907c1c3fea1776b2c28f5b3f6b928508a3eab14ee17d1d`。

证据边界：该结果将 P2-W6 的 captured literal 范围扩展为一个 root float producer connection，不证明其他 producer
family、多个 capture、custom target、nested composite call、synthetic call、`graphValues`、`affiliations` 或其他
ordinary family。gate 仍不可默认开启，handwritten backend 不可删除。

明确非目标：不迁移 custom target/nested composite call/DTC，不改变 capture 或 `compositePins` 语义，不改布局或注入。

## P2-W8 当前结果：captured custom target vendor Graph embedding observation

状态：实现、自动回归和用户游戏编辑器核验完成；已提交为 `a8f814d`。

P2-W8 将 captured entity target 路由到两个 float custom setters 与一个 float custom getter。vendor Graph gate
过滤 custom getter/setter 的 captured `InParam[0]`，使 target 继续只由 `compositePins` overlay 表达；fixture 锁定三条
boundary route、setter/getter concrete IDs `26`/`54`、literal setter、Addition connection setter、getter downstream
use、DTC 和 Print。用户确认该 candidate 在编辑器工作。

首次 probe 发现 vendor custom setter value `InParam[2]` 的 `alreadySetVal=false` 与 legacy/root parity contract 的
`true` 不同。按用户选择的方案 A，P2-W8 保留 vendor 原生 schema、不添加未证实 patch；用户编辑器验证通过，故该字段
在此 float custom-target 样本中是可接受的 vendor-materialized schema 差异，不能据此推广到其他 type/family。

候选：`Beyond_Local_Export/P2W8-captured-custom-target-refactored-candidate.gia`；SHA-256：
`8b6717d6800a5dd08fe1120a34640ae703b7b75145a28ca36a3426a84bda85f9`。

证据边界：该结果只覆盖 captured entity target 到 custom float getter/setter；不证明多个 target、其他 custom type、
nested composite call、synthetic call、`graphValues`、`affiliations` 或默认 gate。handwritten backend 不可删除。

明确非目标：不迁移 nested composite call/DTC，不改变 capture 或 `compositePins` 语义，不改布局或注入。

## P2-W9 调查结果：nested synthetic call 不是 vendor ordinary node

状态：最小 synthetic-call isolation 已实现、通过自动回归与用户编辑器核验。

P2-W9 的 legacy nested-call fixture 通过；同一 fixture 在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 下失败：

```text
[error] vendor impl graph gate missing __composite_call__ InParam[0]
```

当前 gate 错误地把 `__composite_call__` 交给 vendor `Node`。该节点没有 ordinary record/reflectMap schema；当前
Stage 3 必须将其 lower 为 child CompositeDef ID 的 `SysGraph`，并由 composite backend 保留 child pin
`compositePinIndex`、impl `relatedIds`、capture/sparse-input 以及 ordinary↔synthetic edge 规则。第三方 vendor 的
`dev` 分支只读审计也未发现 SysGraph/composite-call factory 或 nested encoder；其 `NodeInterface` protobuf 定义不构成
可用支持。

因此 P2-W9 不能通过扩大 vendor node table 或静默 fallback 解决。用户已授权并完成最小切片：vendor
materializes ordinary subgraph，composite backend 保留 legacy synthetic call，并在 materialization 后只补写
synthetic ↔ ordinary 的 execution-flow overlay。复杂回归进一步锁定 fan-out DSL 顺序、captured ordinary input 过滤、
child OutFlow 的物理 pin 补齐和 nested 四独立 OutFlow；用户编辑器确认通过。P2-W10~W12a 随后分别补齐 nested
ordinary data input、nested capture 和 optional/sparse call binding；详见
[`checkpoints/phase-2-vendor-embedding-evidence.md`](checkpoints/phase-2-vendor-embedding-evidence.md)、ADR-009 和 ADR-010。

## P2-W10~W12a：nested boundary 与 optional call-input closure

- **P2-W10**（`70455ee`）：outer vendor float Addition → nested synthetic child non-capture input 的数据 edge 保留在
  child call physical InParam；用户编辑器核验通过。它不证明其他 producer/type 的 data encoding。
- **P2-W11**（`2f1e497`）：outer captured float → nested child 仅由 `compositePins` 路由；child call 不重复物化该
  input/ordinary edge；用户编辑器核验通过。它不证明多 capture 或其他 capture 类型。
- **P2-W12a**（`bba105b`）：definition capture 使用全部声明 typed placeholders，单次 call-site 仍仅物化实际绑定的
  physical inputs。真实 `调用参数.gia` 观察到同一 definition 的 `[0]`、`[1]`、`[0,1]`、`[]` 四种 call；direct/nested
  自动回归和用户编辑器四分支候选通过。该规则适用于 composite definition/call-site 的通用结构；各类型 wrapper/wire、
  optional connection/capture binding 与未绑定值的运行时结果仍待独立验证。

## P2-W16 当前结果：all mapped DTC shared identity + vendor Graph validation

状态：实现、focused 自动回归与用户游戏编辑器核验完成；待提交。

root 与 composite impl 的 `data_type_conversion_<out>` 现在都由 shared `resolveNodeIdentity()` 以输入/输出类型解析 generic `180` 与 concrete variant。focused fixture 覆盖当前映射的 11 个变种：`int→bool/float/str`、`entity/guid→str`、`bool→int/str`、`float→int/str`、`vec3/faction→str`。在 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 下，它断言每个变种的 vendor input/output pin schema、concrete wrapper、composite boundary route 和可见 Print 分支；默认 handwritten backend 与 gate policy 未改变。

faction→string 不能消费 capture placeholder：fixture 改用 impl node-graph variable getter 的 ordinary connection。legacy handwritten impl 对部分非 string DTC 的 OutParam schema 仍不完整，本包不增加手写修补；完整 schema 只作为 vendor-gated contract 断言。官方 `miliastra-knowledge` 查询的《基础概念》用于确定这 11 种候选范围；真实 `类型转化-full.gia` 只覆盖 7 个 `→str` 变种，故不能把官方查询或本候选写成全量 raw/wire 等价。用户编辑器确认 root adapter 接入前与接入后的两份 11 种变种候选均通过；归档文件分别为 `Beyond_Local_Export/真-测试通过/复合节点/P2W16-all-dtc-vendor-graph-pre-root-resolver.gia`（SHA-256 `27dd83efae860e18742bd15347f677d5f1e9bb72fd577300027ca9b5887810b2`）与 `Beyond_Local_Export/真-测试通过/复合节点/P2W16-all-dtc-vendor-graph-root-resolver.gia`（SHA-256 `d0f1c64b3b10b30da38aa7b12899aec418bf9dd5ba433618c7df2cb4b1c73abc`）；未注入。

明确边界：不默认开启 gate、不删除 handwritten backend、不迁移 arithmetic/comparison/list/dict；官方资料对 float→int 的取整存在客户端/版本表述差异，编辑器通过不推广为跨版本数值语义结论。

## 后续推广顺序

1. ~~graph variable getter~~（P2-W2 已提交）；
2. ~~custom variable getter/setter~~（P2-W3 自动回归与用户游戏编辑器核验通过）；
3. ~~local variable float getter/setter~~（P2-W4 自动回归与用户游戏编辑器核验通过）；
4. ~~DTC~~（P2-W16 全部当前映射变种已在 vendor gate 下核验）；
5. arithmetic/comparison；
6. list/dict 和特殊 ID 类型。

每族都重复“观察 fixture → vendor experiment → gate → parity → 删除 legacy branch”；optional call-input 的 Runtime
契约已闭合，但不得把其类型 wire/default 结论提前并入上述节点族。
