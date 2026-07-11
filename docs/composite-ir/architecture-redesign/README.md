# 复合节点 Stage 3 架构重审

> 状态：当前推荐 / 规划中
> 来源：当前代码实现 + 真实 GIA 对照 + 待执行实验
> 最近校验：2026-07-11
> 适用范围：gsts Stage 3 主图与 CompositeDef impl 图；不表示游戏内行为已经验证

本目录是复合节点 GIA backend 重构的执行入口。它从 `更新v、w` 中 `额外压力`
setter 的 concrete float 差异出发，但目标不是增加一个节点特例，而是消除普通系统节点在
主图和 composite impl 中由两套编码器生成的架构分叉。

## 已确认的触发证据

真实样本：`复杂gia/物理运动.gia`，复合 `更新v、w` impl `n[4]`。

当前输出：`dist/tests/layout/physics-motion/main.gia`，同复合 impl `n[13]`。

观察：

- 真实节点是 generic `323`、concrete `324`（Float），`InParam[1]` 为 `bConcrete`。
- 当前节点只有 generic `323`，`InParam[1]` 为裸 `bFloat.val=0`。
- IR 源码已经使用 `new floatValue(0)`，类型没有在 DSL 表面写错。
- 主图 `resolveGiaNodeId()` 已按赋值类型选择 setter concrete variant；impl
  `resolveImplNodeId()` 没有复用该规则。

上述结论只证明结构差异与当前代码路径，不证明修复后的游戏行为。

## 每次新会话

只需把 [NEW-SESSION-PROMPT.md](NEW-SESSION-PROMPT.md) 中的提示发送给模型。模型必须先按
[EXECUTION.md](EXECUTION.md) 恢复，并以 [STATUS.md](STATUS.md) 为唯一实时进度入口；阶段证据保存在
[checkpoints/](checkpoints/)。

## 阅读顺序

1. [EXECUTION.md](EXECUTION.md)：固定操作、核验、文档和提交协议。
2. [STATUS.md](STATUS.md)：当前 Phase、唯一工作包和未提交变化。
3. [global-plan.md](global-plan.md)：全局目标、工作流、阶段依赖和完成定义。
4. [current-architecture-audit.md](current-architecture-audit.md)：当前两套 backend 的逐层审计。
5. [target-architecture.md](target-architecture.md)：目标分层、接口与职责边界。
6. [migration-invariants.md](migration-invariants.md)：迁移期间不可破坏的行为。
7. [validation-matrix.md](validation-matrix.md)：证据、测试维度和验收字段。
8. 按阶段执行：
   - [phase-0-baseline-and-evidence.md](phase-0-baseline-and-evidence.md)
   - [phase-1-resolved-node-contract.md](phase-1-resolved-node-contract.md)
   - [phase-2-shared-vendor-node-lowering.md](phase-2-shared-vendor-node-lowering.md)
   - [phase-3-unified-graph-materialization.md](phase-3-unified-graph-materialization.md)
   - [phase-4-composite-boundary-isolation.md](phase-4-composite-boundary-isolation.md)
   - [phase-5-legacy-removal-and-hardening.md](phase-5-legacy-removal-and-hardening.md)
9. [decision-log.md](decision-log.md)：已决定、待实验和禁止提前决定的事项。

## 核心命题

正确架构不是“让 impl 直接调用主图大函数”，而是：

```text
root graph IR ─────────┐
                       ├─ scope-aware resolution
composite impl IR ─────┘          │
                                  ▼
                         Resolved Graph IR
                                  │
                         shared ordinary-node
                         vendor-backed lowering
                                  │
                         shared graph materializer
                         ┌────────┴────────┐
                         │                 │
                    root wrapper    composite boundary
                                    + CompositeDef
                                    + compositePins
```

复合模块只拥有定义、调用、capture 和 `compositePins` 边界；普通系统节点的 typed
variant、vendor pin schema、literal 与普通连接编码只能有一个实现。

## 本规划的边界

包含：

- Stage 3 普通节点 ID/type resolution；
- vendor `Node`/`Pin`/`Graph` 的统一使用；
- root 与 impl 的 graph scope；
- composite call、capture、sparse pin、`compositePins` 的隔离；
- root/impl 跨 scope 契约测试。

暂不包含：

- 改变用户侧 `g.defineComposite` / `f.callComposite` API；
- 改写 Stage 1/2，除非 Phase 0 证明类型在进入 Stage 3 前已经丢失；
- 修改 `src/thirdparty/` 或手改 `src/definitions/`；
- 注入游戏目录；
- 把真实嵌套复合展开为普通节点。

## 执行规则

- 每阶段先补观察测试，再迁移实现。
- 每阶段可独立回滚，不把行为迁移和大规模文件整理放进同一提交。
- 真实 GIA、当前输出、自动回归、注入和游戏内验证分别记录。
- Vendor 是编码机制，不是未经验证的真理；真实 GIA 是结构证据，但单一样本不自动推广到全部类型。
- 任何阶段出现 capture、nested composite、sparse named input 或已验证 metadata 回归，立即停止推广并回到该阶段入口。
