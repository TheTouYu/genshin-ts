# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + architecture-redesign 计划
> 最近校验：2026-07-11
> 适用范围：`refactor/composite-stage3-architecture`；新会话以本文件为唯一进度入口

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：0 — 基线、证据与 Vendor 实验
当前工作包：P0-W0 — 建立可恢复执行协议和规划基线
最近完成提交：P0-W0 文档基线（当前包含本文件的提交；hash 以 `git log` 为准）
分支起点：c5dfdd6 feat: add governed documentation search
工作树预期：提交后应 clean
```

## 已确认事实

- Root ordinary nodes 主要走 `resolveGiaNodeId()`、vendor `Node/Pin` 和 `Graph.connect/flow`。
- Composite impl ordinary nodes 主要走 `resolveImplNodeId()`、`buildImplNodePins()` 和手写 `connects`。
- 真实 `物理运动.gia` 的 `更新v、w` float setter 使用 generic `323`、concrete `324` 和 concrete float input。
- 当前生成的对应 impl setter 只有 generic `323`，第二输入是裸 `bFloat.val=0`。
- 当前源码已经使用 `new floatValue(0)`；差异位于 Stage 3 impl lowering，而不是 DSL 表面值类型。
- 本分支当前只建立规划和执行文档，尚未修改生产实现。

## 尚未证明

- Vendor `new Node(324)` 是否逐字段匹配真实 setter。
- Vendor `Graph.connect()` 是否能直接生成适合 impl 的连接结构。
- 临时 vendor Graph 编码后提取 NodeGraph 是否会引入或丢失 impl metadata。
- Float 观察能否推广到 int/bool/str/vec3/entity/guid/config/prefab/list/dict。
- 修复后的生成 GIA 是否被游戏接受。

## 工作包状态

### Phase 0

- [x] P0-W0：建立架构审计、全局计划、执行协议、实时状态和文档索引。
- [ ] P0-W1：Vendor `Node(324)` float literal 实验。
- [ ] P0-W2：Vendor `Graph.connect()` float connection 实验。
- [ ] P0-W3：Vec setter connection 实验。
- [ ] P0-W4：Root/impl ordinary-node parity helper 和 fixture。
- [ ] P0-W5：锁定当前 root/impl 失败契约与 composite 边界基线。
- [ ] P0-W6：Phase 0 checkpoint、证据总结和 Phase 1 决策闸门。

后续 Phase 以各 phase 文档为计划，不在本状态文件提前展开。

## 当前工作包：P0-W0

目标：

- 建立独立分支；
- 产出新会话可直接执行的协议；
- 建立唯一实时状态入口；
- 建立阶段 checkpoint 规则；
- 建立用户可复制的新会话提示；
- 将已有架构规划和索引作为纯文档基线提交。

修改文件范围：

```text
docs/composite-ir/architecture-redesign/**
docs/composite-ir/index.md
docs/documentation-map.md
.agents/skills/composite-docs-navigator/references/knowledge-domain-map.md
```

验证：

```bash
本地 Markdown 相对链接检查
git diff --check
git status --short
```

明确非目标：

- 不修改 `src/`；
- 不运行或修改 GIA 编码；
- 不注入；
- 不开始 P0-W1 实验；
- 不提交，直到用户审核并明确指示。

完成条件：

- [x] 分支为 `refactor/composite-stage3-architecture`；
- [x] `EXECUTION.md` 存在；
- [x] `STATUS.md` 存在；
- [x] `NEW-SESSION-PROMPT.md` 存在；
- [x] `checkpoints/README.md` 存在；
- [x] 链接与 diff check 通过；
- [x] 用户审核；
- [x] 建立 P0-W0 纯文档提交（当前包含本文件的提交）；
- [x] 提交后工作树应 clean（由提交后命令核验）。

## 下一工作包：P0-W1

只有 P0-W0 提交并由用户确认后开始。

目标：直接构造 vendor `Node(324)`，比较构造态、`Node.encode()` 与临时 `Graph.encode()` 中 float literal
setter 的 identity 和 pins；与真实 `更新v、w` n[4] 建立逐字段观察。

预期修改：

```text
tests/composite/ 下的独立 experiment/test
STATUS.md
phase-0-baseline-and-evidence.md 的实测记录
必要时 checkpoints/ 下的证据草稿
```

明确不修改生产编码器。

## 待用户决策

当前无架构决策。P0-W0 文档完成后需要用户决定是否提交。

Phase 0 结束前预期决策：是否采用完整 vendor Graph materialization，或采用 node-level vendor lowering + 唯一 graph
adapter；必须基于 P0-W1～P0-W5 证据。

## 进行中或未提交变化

P0-W0 纯文档工作，预期包含：

```text
.agents/skills/composite-docs-navigator/references/knowledge-domain-map.md
docs/composite-ir/index.md
docs/documentation-map.md
docs/composite-ir/architecture-redesign/
```

除此之外的变化均不属于当前工作包，应停止核对。

## 新会话恢复

1. 读取 [EXECUTION.md](EXECUTION.md)；
2. 检查分支、status 和最近提交；
3. 若 P0-W0 已提交且工作树 clean，从 P0-W1 启动报告开始；
4. 若仍有上述未提交文档，先确认是否等待用户审核/提交，不开始 P0-W1；
5. 不覆盖无法解释的变化。
