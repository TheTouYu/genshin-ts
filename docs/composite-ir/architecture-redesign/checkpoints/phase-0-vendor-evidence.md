# Phase 0 Checkpoint：Vendor 证据与迁移基线

> 状态：已验证 / 决策已确认（Phase 0 完成；ADR-006 = 方案 A）
> 来源：当前代码实现 + 自动实验 + root/impl production encode 对照 + 真实 GIA 结构对照 + 用户决策
> 最近校验：2026-07-12
> 适用范围：`set_node_graph_variable` float/vec3 ordinary schema；composite boundary focused baseline；不证明游戏内行为

## Git 基线

- branch: `refactor/composite-stage3-architecture`
- start commit: `c5dfdd6 feat: add governed documentation search`
- end commit: `9d07e1a docs(composite): complete P0-W5 boundary baselines`（P0-W6 文档提交前基线）
- working tree at checkpoint authoring: clean

## 完成工作包

| ID | 内容 | 提交 |
|---|---|---|
| P0-W0 | 架构审计、全局计划、执行协议、STATUS、文档索引 | `c6b3b59` |
| P0-W1 | Vendor `Node(324)` float literal 实验 | `a157c6d` |
| P0-W2 | Vendor `Graph.connect()` float connection 实验 | `a157c6d` |
| P0-W3 | Vendor Vec setter connection 实验 | `a157c6d` |
| P0-W4 | Root/impl ordinary-node parity helper + red contract | `af20e5e` |
| P0-W5 | Composite boundary focused baseline 清单与失败契约复核 | `9d07e1a` |
| P0-W6 | 本 checkpoint、证据总结、Phase 1 决策闸门 | 待提交 |

## 命令与结果

```bash
# Vendor experiments（P0-W1~W3）
npx tsx tests/composite/experiment-vendor-set-node-graph-variable.ts
npx tsx tests/composite/experiment-vendor-graph-connect-float.ts
npx tsx tests/composite/experiment-vendor-graph-connect-vec3.ts

# Production encode red contract（P0-W4 / P0-W5 复核）
npx tsx tests/composite/test-stage3-root-impl-parity.ts
# PASS：root baseline 通过；root/impl parity 按预期在 concrete identity/wrapper 上失败

# Composite boundary focused baselines（P0-W5）
npx tsx tests/composite/test-nested-composite-capture-pins.ts   # PASS
npx tsx tests/composite/test-nested-composite-outflow.ts        # PASS
npx tsx tests/composite/test-composite-bool-input-gia.ts        # PASS
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts # PASS
npx tsx tests/composite/test-custom-variable-impl-pins.ts       # PASS
npx tsx tests/composite/test-composite-sparse-named-input.ts    # PASS
npx tsx tests/composite/test-composite-all.ts                   # PASS 78/78 active；2 @pending_ref

# 已记录但不纳入 Phase 0 通过条件
npx tsx tests/composite/test-composite-part2.ts  # FAIL: fixture/API 使用问题
npx tsx tests/composite/test-composite-part3.ts  # FAIL: fixture/API 使用问题
```

生产编码行为：全程未修改 `src/`。

## 观察

### 真实 GIA

- 文件：`复杂gia/物理运动.gia`
- composite：`更新v、w`
- node：impl `n[4]` float setter（`额外压力 = 0`）；connected vec setter 对照 cid=334
- fields：`genericId=323`、`concreteId=324/334`、`InParam[1].bConcreteValue`、`indexOfConcrete`、bool metadata、connection source kind/index

### Vendor

- `new Node(0, 'server', 324|334)` + `setVal()` 可生成与真实样本一致的 ordinary pin schema
- `Graph.connect(producer, setter, fromPin, 1)` 挂到 InParam[1]，保留 concrete wrapper
- encode→decode round-trip 保留 identity、wrapper、connection
- generic-only `Node(323)` 无 pins，不能 `setVal()`

### Production root vs impl（同一 IR fixture）

| case | root | impl（当前缺陷） |
|---|---|---|
| float literal | gid=323 cid=324，InParam[1] class=10000 + bConcreteValue iOC=1 | cid=323，裸 `bFloat`，无 wrapper |
| float connection | cid=324 + wrapper + conn source kind=4 index=0 | cid=323，无 wrapper；source pin 仍 kind=4/index=0 |
| vec connection | cid=334 + type=12 + iOC=11 + conn | cid=323，无 wrapper；source pin 仍 kind=4/index=0 |

根因：impl ordinary path 未走 concrete variant + 共享 vendor lowering。

### Composite boundary

nested capture physical pins、nested outflow、bool input metadata、local vec3 concrete、custom variable pins、sparse named input 均 PASS；broad suite active 断言 PASS。part2/part3 失败属既有 fixture/API，不推广为 boundary 回归。

## 已证明

1. Root/impl ordinary schema 漂移可被独立 fixture 稳定重现，且 parity helper 会在当前缺陷上失败。
2. Vendor concrete Node + setVal 对 float/vec setter 能复现真实 GIA ordinary pin schema。
3. Vendor Graph.connect 对 float/vec data edge 能保留 target wrapper 与 source pin semantics。
4. 差异不是 IR 表面类型写错，而是 impl 编码器路径分叉。
5. Phase 0 期间 composite 关键 boundary 基线保持；迁移不得无证据改动这些路径。
6. 生产行为未因 Phase 0 改变；观察/失败契约先于实现迁移。

## 未证明

1. 临时 vendor `Graph.encode()` 后提取/嵌入 impl `NodeGraph` 是否保留或污染 impl metadata。
2. int/bool/str/entity/guid/config/prefab/list/dict 等类型族的 concrete variant 一致性。
3. 修复后的生成 GIA 是否被游戏接受（无注入 / 无游戏内验证）。
4. 完整 Graph materialization 是否适用于全部 impl ordinary graph（非仅 setter family）。
5. Connection pin 上 literal default 的 wire presence 规则（Q-003）。
6. Signals、assembly、dynamic pin family 是否共用同一 resolution contract（ADR-008）。

## 与原计划的偏差

- 无架构阶段顺序变更。
- P0-W1~W3 合并提交为一次 experiment 提交（`a157c6d`），证据文件仍按工作包拆分。
- `test-composite-part2/part3` 未作为 Phase 0 退出阻塞项；单独记入后续清理。
- 设施图 2 个 `@pending_ref` 仍缺参考文件，证据范围受限但不改实现。

## 方案与影响（ADR-006 / Phase 2 物化路径）

Phase 0 决策闸门要求在进入共享 lowering 前选择 vendor 物化策略。可选：

### A. 完整 vendor Graph materialization（impl 直接 `Graph.add_node/connect/flow/encode`）

- 优点：与 root 路径最大对齐；connect/flow 复用 vendor 规则；长期目标与 Phase 3 一致。
- 风险：尚未证明临时 Graph 编码产物可安全嵌入 CompositeDef impl；可能引入 graph-level metadata / index 约定差异。
- 影响：若过早采用，失败面同时覆盖 identity、pin、connection 与 wrapper 嵌入。

### B. 节点级 vendor lowering + 项目 adapter（单节点 vendor Node/encode 或 schema 提取，再写入现有 impl GraphNode）

- 优点：可按节点族 vertical slice 切换；失败面小于整图替换；与 Phase 1（先 identity）/ Phase 2（再 pins）切分一致。
- 风险：adapter 可能重复部分 Graph 职责；若 adapter 手写 connects，Phase 3 前仍保留连接分叉。
- 影响：先修复 setter concrete wrapper，不要求一次替换全部 impl graph backend。

### C. 仅 vendor schema 数据 + 项目手写 materializer（不持有 vendor Node 实例）

- 优点：完全控制输出字段。
- 风险：重新实现 setConcrete/setVal/connect 语义，最易再次漂移；与 ADR-004（vendor 优先）冲突倾向最高。
- 影响：除非 A/B 被证伪，不推荐作为默认路径。

## 推荐与理由

文档起草时推荐过 B（节点级 adapter）以缩小失败面。**用户 2026-07-12 明确选择 A**。

## 用户决策记录

- **ADR-006 = 方案 A**：完整 vendor Graph materialization 作为 Phase 1–3 主路径。
- B 不作为默认近阶段架构；C 否决为默认。
- 已写入 `decision-log.md`（Accepted + Rejected ADR-R06/R07）。
- 残余风险不变：临时 Graph 编码后提取/嵌入 impl NodeGraph 的 metadata 兼容性仍需后续工作包证明；证明前不得删除 legacy impl 路径。

## 下一阶段输入

Phase 1（`phase-1-resolved-node-contract.md`）可在 P0-W6 提交后启动：

- 输入证据：本文件 + `p0w1`/`p0w2`/`p0w3` + `test-stage3-root-impl-parity.ts`
- 架构约束：目标 backend 为完整 vendor Graph materialization（ADR-006 A）；阶段顺序仍是
  identity → ordinary lowering → graph materialization
- 首要切片：`set_node_graph_variable` float/vec3 identity parity
- 明确不做：一次替换全部 impl backend、capture/boundary 改动、注入、删除 legacy
- 中间态允许：impl 先用共享 resolver 拿 generic/concrete ID，pins/connect 仍 legacy
  （identity 可先绿、wrapper/connect 可能仍红），但不得把 adapter 层固化为最终架构
- 回滚信号：resolver 需要读取 encoded pin 才能判断类型；或 Graph 嵌入实验证伪 A

## 相关文件

```text
docs/composite-ir/architecture-redesign/phase-0-baseline-and-evidence.md
docs/composite-ir/architecture-redesign/decision-log.md
docs/composite-ir/architecture-redesign/STATUS.md
docs/composite-ir/architecture-redesign/checkpoints/p0w1-vendor-float-setter-evidence.md
docs/composite-ir/architecture-redesign/checkpoints/p0w2-vendor-graph-connect-evidence.md
docs/composite-ir/architecture-redesign/checkpoints/p0w3-vendor-vec3-connect-evidence.md
tests/composite/experiment-vendor-set-node-graph-variable.ts
tests/composite/experiment-vendor-graph-connect-float.ts
tests/composite/experiment-vendor-graph-connect-vec3.ts
tests/composite/helpers/ordinary-node-contract.ts
tests/composite/test-stage3-root-impl-parity.ts
```
