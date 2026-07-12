# Phase 2：共享 Vendor Ordinary-Node Lowering

> 状态：P2-W1 setter 切片已完成并通过用户游戏编辑器验证；P2-W2 getter 切片已完成自动回归，待审核
> 来源：目标架构设计 + 当前实现/自动回归 + 用户游戏编辑器验证
> 最近校验：2026-07-12
> 适用范围：普通系统节点；不包含 composite synthetic call/capture

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

## 后续推广顺序

1. ~~graph variable getter~~（P2-W2 完成自动回归，待审核）；
2. custom variable getter/setter；
3. local variable getter/setter；
4. DTC；
5. arithmetic/comparison；
6. list/dict 和特殊 ID 类型。

每族都重复“观察 fixture → vendor experiment → gate → parity → 删除 legacy branch”。
