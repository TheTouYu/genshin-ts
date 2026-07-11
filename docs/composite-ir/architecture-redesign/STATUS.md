# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + architecture-redesign 计划
> 最近校验：2026-07-12 (P0-W4 committed)
> 适用范围：`refactor/composite-stage3-architecture`；新会话以本文件为唯一进度入口

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：0 — 基线、证据与 Vendor 实验
当前工作包：P0-W5 — 锁定失败契约与 composite 边界基线（待启动）
最近完成提交：test(composite): P0-W4 root/impl ordinary-node parity helper（HEAD）
分支起点：c5dfdd6 feat: add governed documentation search
工作树预期：clean
```

## 已确认事实（含 P0-W1~W4）

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
- 本分支仍未修改生产实现；P0-W4 仅新增观察 helper 与失败契约 fixture。

## 尚未证明

- 临时 vendor Graph 编码后提取 NodeGraph 是否会引入或丢失 impl metadata。
- int/bool/str/entity/guid 等其他类型的 concrete variant 一致性。
- 修复后的生成 GIA 是否被游戏接受。
- 完整 Graph materialization 是否适用于所有 impl graph（非仅 setter family）。
- nested/capture/bool/local/custom focused 边界基线的完整命令结果清单（P0-W5）。

## 工作包状态

### Phase 0

- [x] P0-W0：建立架构审计、全局计划、执行协议、实时状态和文档索引。
- [x] P0-W1：Vendor `Node(324)` float literal 实验。
- [x] P0-W2：Vendor `Graph.connect()` float connection 实验。
- [x] P0-W3：Vec setter connection 实验。
- [x] P0-W4：Root/impl ordinary-node parity helper 和 fixture。
- [ ] P0-W5：锁定当前 root/impl 失败契约与 composite 边界基线。
- [ ] P0-W6：Phase 0 checkpoint、证据总结和 Phase 1 决策闸门。

后续 Phase 以各 phase 文档为计划，不在本状态文件提前展开。

## 最近完成工作包：P0-W4 — Root/impl ordinary-node parity helper 和 fixture

目标：

- 建立规范化 ordinary-node contract 比较（排除 nodeIndex/position）；
- 用同一 fixture 对照 root/impl float literal、float connection、vec connection setter；
- 锁定当前失败契约：parity helper 必须在现有缺陷上失败；root baseline 必须通过。

修改文件范围：

```text
tests/composite/helpers/ordinary-node-contract.ts
tests/composite/test-stage3-root-impl-parity.ts
STATUS.md
phase-0-baseline-and-evidence.md
```

验证：

```bash
npx tsx tests/composite/test-stage3-root-impl-parity.ts
git diff --check
```

明确非目标：

- 不修改 `src/` 生产编码器；
- 不开始 P0-W5（composite 边界 focused baseline 清单）；
- 不注入；
- 已提交（见 HEAD）。

完成条件：

- [x] helper 可提取 generic/concrete、InParam type/class、bConcreteValue/iOC、connection source pin；
- [x] fixture 覆盖 root/impl float literal + float conn + vec conn；
- [x] root baseline 断言通过；
- [x] root/impl parity 在 concreteId / hasConcreteWrapper / indexOfConcrete 上失败；
- [x] 纯 helper 单元检测 synthetic drift；
- [x] 生产编码器未修改。

## 下一工作包：P0-W5 — 锁定失败契约与 composite 边界基线

只有 P0-W4 完成并由用户确认后开始。

目标：汇总当前 root/impl 失败契约，并记录 nested/capture/bool/local/custom/vec3 等 focused baseline 的真实命令与结果；修正过时 pending 描述，不改实现。

预期修改：

```text
tests/composite/ 下如需补充的边界观察脚本（尽量复用已有）
STATUS.md
phase-0-baseline-and-evidence.md 的 0.6 / 退出条件
```

明确不修改生产编码器。

## 待用户决策

- Phase 0 结束前仍需决定 ADR-006（完整 vendor Graph materialization vs node-level vendor lowering + adapter），证据集需含 P0-W5。

## 进行中或未提交变化

无。工作树应 clean。

## 新会话恢复

1. 读取 [EXECUTION.md](EXECUTION.md)；
2. 检查分支、status 和最近提交；
3. 若 P0-W4 已提交且工作树 clean，从 P0-W5 启动报告开始；
4. 不覆盖无法解释的变化。
