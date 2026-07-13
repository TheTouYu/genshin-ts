# 工作包选择与优先级协议

> 状态：当前推荐
> 来源：ADR-012（用户确认的框架优先推进策略）
> 最近校验：2026-07-13
> 适用范围：Composite Stage 3 Redesign 的 Phase 2–5 工作包排期；不改变自动/真实 GIA/游戏验证的证据等级

## 目标

每轮只选择一个能最直接减少 root/Composite impl 双 backend 风险的工作包。普通 API 不再按 406 个节点逐项
建立前置验证；共享 ordinary framework 被视为默认迁移路径，实际失败再归类并集中补洞。

这是一项工程推进与风险接受策略，不是“所有 ordinary API 已在 Composite 内验证可用”的声明。

## 固定优先级

按以下顺序选择唯一工作包；只有更高层完成、阻塞或需用户决策时，才考虑下一层。

1. **架构阻塞**：共享 resolver、ordinary factory、shared materializer、boundary isolation、legacy 删除等会消除
   一整类 root/impl 分叉的缺口。
2. **正确性阻塞**：破坏迁移不变量、已有 root/impl parity、nested/capture/sparse 或已确认 metadata 的回归。
3. **显式 fallback / vendor gap**：当前框架无法 materialize 的 API family；必须留下集中 adapter、诊断或例外记录，
   不得把补丁散回 root/impl。
4. **框架哨兵**：每个架构交付物只选择最少跨类别 fixture，验证普通 exec/query/calc、generic/concrete、
   literal/connection 等通路；它们用于发现框架洞，不是 API 覆盖率竞赛。
5. **验证债务**：真实 GIA、wire、用户编辑器或性能证据，仅在阶段退出、删除 legacy 或已出现实际问题时补齐。
6. **功能扩展**：comparison、单一 list/dict 或其他未采样 family，只有它能解除上述阻塞或用户明确指定时才成为工作包。

以下事项不能抢占框架优先级：为了增加“已支持 API 数量”而逐节点验收、无失败信号的样本扩大、布局润色或无行为收益的重命名。

## 每轮调度卡

`STATUS.md` 必须只给出一个可执行工作包，并用下面字段说明其为何优先：

```text
工作包：P?-W?
优先级类别：架构阻塞 / 正确性阻塞 / fallback-vendor gap / 框架哨兵 / 验证债务 / 功能扩展
解除的上层阻塞：
输入与修改范围：
最小观察或失败基线：
完成条件：
实际验证命令：
回滚边界：
明确非目标：
后续候选（非当前工作包）：
```

若无法填写这些字段，就不构成可执行工作包；新会话不得用源码、历史或聊天记录自行补全。

## 普通 API 的例外处理

ordinary API 默认进入 shared resolver → vendor ordinary factory → shared materializer。若失败，工作包必须先将其归类为：

- 类型/variant resolution；
- vendor schema 或 centralized normalization；
- ordinary data/flow materialization；
- Composite boundary overlay；
- signal/dynamic pin/payload 专属 lowerer；
- list/dict/特殊 ID 的 family adapter；
- 真实 GIA、wire 或用户编辑器证据不足。

一个例外工作包只修复一个分类中的一个可复现缺口；不得因此恢复独立 Composite ordinary backend。

## 阶段推进顺序

```text
P2：ordinary factory 泛化与例外出口
→ P3：shared ordinary Graph materializer
→ P4：capture/call/compositePins boundary isolation
→ P5：legacy ordinary backend 删除与硬化
```

进入下一阶段依赖前一阶段的架构退出条件，不依赖逐 API 完成表。signal/dynamic pin、payload、list/dict、特殊 ID
和真实 GIA/wire 仍按其风险在阶段退出或实际失败时处理。
