# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + architecture-redesign 计划
> 最近校验：2026-07-12 (P0-W3 completed)
> 适用范围：`refactor/composite-stage3-architecture`；新会话以本文件为唯一进度入口

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：0 — 基线、证据与 Vendor 实验
当前工作包：P0-W3 — Vec setter connection 实验
最近完成提交：P0-W0 文档基线（c6b3b59 docs(composite): establish stage3 redesign execution plan）
分支起点：c5dfdd6 feat: add governed documentation search
工作树预期：提交后应 clean
```

## 已确认事实（含 P0-W1~W3）

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
- 当前生成的对应 impl setter 只有 generic `323`（无 concrete ID），第二输入是裸 `bFloat.val=0`（无 bConcreteValue 包裹）。
- 差异根因：impl 编码器未使用 concrete variant ID + `setConcrete()`。
- 本分支当前只建立实验和文档变更，尚未修改生产实现。

## 尚未证明

- 临时 vendor Graph 编码后提取 NodeGraph 是否会引入或丢失 impl metadata。
- int/bool/str/entity/guid 等其他类型的 concrete variant 一致性。
- 修复后的生成 GIA 是否被游戏接受。
- 完整 Graph materialization 是否适用于所有 impl graph（非仅 setter family）。

## 工作包状态

### Phase 0

- [x] P0-W0：建立架构审计、全局计划、执行协议、实时状态和文档索引。
- [x] P0-W1：Vendor `Node(324)` float literal 实验。
- [x] P0-W2：Vendor `Graph.connect()` float connection 实验。
- [x] P0-W3：Vec setter connection 实验。
- [ ] P0-W3：Vec setter connection 实验。
- [ ] P0-W4：Root/impl ordinary-node parity helper 和 fixture。
- [ ] P0-W5：锁定当前 root/impl 失败契约与 composite 边界基线。
- [ ] P0-W6：Phase 0 checkpoint、证据总结和 Phase 1 决策闸门。

后续 Phase 以各 phase 文档为计划，不在本状态文件提前展开。

## 当前工作包：P0-W3 — Vec setter connection 实验（刚刚完成）

目标：

- 使用 Vec3 producer（3D Vector Addition）连接到 set_node_graph_variable 的 Vec variant（cid=334），验证 indexOfConcrete、bConcreteValue 包裹、连接 schema。

修改文件范围：

```text
tests/composite/experiment-vendor-graph-connect-vec3.ts
checkpoints/p0w3-vendor-vec3-connect-evidence.md
STATUS.md
phase-0-baseline-and-evidence.md（可选）
```

验证：

```bash
npx tsx tests/composite/experiment-vendor-graph-connect-vec3.ts
```

明确非目标：

- 不修改 `src/` 生产编码器；
- 不开始 P0-W4（root/impl parity helper 和 fixture）；
- 不注入；
- 不提交。

完成条件：

- [x] Vendor 334 setter pin schema：iOC=11, type=Vec, bConcreteValue；
- [x] Graph.connect(vecAdd, setter, 0, 1) 正确连接至 InParam[1]；
- [x] Round-trip 保留 Vec connection；
- [x] 与真实 GIA cid=334 setters 逐字段对照（cid=334, bcIdx=11, type=12, hasBC）；
- [x] 证据写入 checkpoint；
- [x] 生产编码器未修改。

## 下一工作包：P0-W4 — Root/impl ordinary-node parity helper 和 fixture

只有 P0-W3 完成并由用户确认后开始。

目标：建立规范化比较函数，排除 nodeIndex/position/wrapper，锁定 ordinary schema。
将 P0-W1~W3 的发现转化为可重用的 root/impl parity fixture。

预期修改：

```text
tests/composite/ 下的 parity helper 和 fixture
STATUS.md
phase-0-baseline-and-evidence.md 的实测记录
```

明确不修改生产编码器。

## 待用户决策

- **P0-W1~W3 实验证据充分**：Vendor Node/Graph API 可直接生成与真实 GIA 一致的结构。
- **差异根因已定位**：impl 编码器（`buildImplNodePins`/`resolveImplNodeId`）未使用 concrete variant ID，导致缺少 concrete ID 和 bConcreteValue 包裹。
- **架构方向证据支持**：vendor 优先策略（ADR-004）成立。
- 需要用户审核当前工作包完成情况，决定是否继续 P0-W4。

Phase 0 结束前预期决策：是否采用完整 vendor Graph materialization（ADR-006），或采用 node-level vendor lowering + 唯一 graph adapter；必须基于 P0-W1～P0-W5 完整证据集。

## 进行中或未提交变化

P0-W1~W3 工作包含：

```text
tests/composite/experiment-vendor-set-node-graph-variable.ts
tests/composite/experiment-vendor-graph-connect-float.ts
tests/composite/experiment-vendor-graph-connect-vec3.ts
checkpoints/p0w1-vendor-float-setter-evidence.md
checkpoints/p0w2-vendor-graph-connect-evidence.md
checkpoints/p0w3-vendor-vec3-connect-evidence.md
STATUS.md
phase-0-baseline-and-evidence.md
```

除此之外的变化均不属于当前工作包，应停止核对。

## 新会话恢复

1. 读取 [EXECUTION.md](EXECUTION.md)；
2. 检查分支、status 和最近提交；
3. 若 P0-W0 已提交且工作树 clean，从 P0-W1 启动报告开始；
4. 若仍有上述未提交文档，先确认是否等待用户审核/提交，不开始 P0-W1；
5. 不覆盖无法解释的变化。
