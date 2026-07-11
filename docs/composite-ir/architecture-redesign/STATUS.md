# Composite Stage 3 Redesign 当前状态

> 状态：当前推荐 / 实时状态
> 来源：当前 Git 工作树 + architecture-redesign 计划
> 最近校验：2026-07-12 (P1-W3 completed; ADR-006=A accepted; Phase 0 exited)
> 适用范围：`refactor/composite-stage3-architecture`；新会话以本文件为唯一进度入口

## 当前定位

```text
当前分支：refactor/composite-stage3-architecture
当前 Phase：0 已退出 → 下一阶段 Phase 1 — Resolved Node Contract
当前工作包：P1-W3 已完成；等待用户审核
最近完成工作包：P1-W3 — getter identity 与 fallback accounting contract
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

## 尚未证明

- 临时 vendor Graph 编码后提取 NodeGraph 是否会引入或丢失 impl metadata（A 的关键残余风险）。
- int/bool/str/entity/guid 等其他类型的 concrete variant 一致性。
- 修复后的生成 GIA 是否被游戏接受。
- 完整 Graph materialization 是否适用于所有 impl graph（非仅 setter family）。
- Connection pin literal default 的 wire presence（Q-003）。
- Signals/dynamic pin family 是否共用同一 resolution contract（ADR-008）。

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

## 工作包状态

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

## 待用户决策

无阻塞决策。P1-W3 等待审核；下一工作包须先由用户选择/确认，建议是将 shared resolver 以保持 root
输出不变的 adapter 形式接入 root getter/setter，并以 fallback accounting 建立观察基线。


残余风险提醒（非阻塞启动 Phase 1 identity，但阻塞删除 legacy / 宣称 Graph 嵌入完成）：

- 临时 vendor Graph 嵌入 impl 的 metadata 兼容性仍未证明。

## 进行中或未提交变化

无。工作树应 clean。

## 新会话恢复

1. 读取 [EXECUTION.md](EXECUTION.md)；
2. 检查分支、status 和最近提交；
3. 从 Phase 1 首个工作包启动报告开始；
4. 架构约束：ADR-006 = 完整 vendor Graph materialization；阶段顺序仍不可跳过；
5. 不覆盖无法解释的变化。
