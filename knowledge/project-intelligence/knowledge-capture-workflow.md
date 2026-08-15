# Knowledge capture and memory synchronization workflow

Committed-baseline intake, bounded retrieval, serial semantic planning, exact-hash Bundle approval, apply verification, and reusable error prevention.

<!-- CLAIM:START clm_F25959994F5CD6EEE49495F001 -->

### Knowledge capture should use one serial plan and an exact-hash apply gate

For recurring project knowledge capture, start from explicitly identified committed changes, use the canonical project entry python tools/pkc.py, perform one bounded retrieval, and mutate one knowledge-plan serially for Claims, Authority Refs, and only justified stale refreshes. After all mutations run one final delta check and finalize; display the immutable Bundle ID/content hash and require human confirmation of that exact hash before approve/apply. After apply, rebuild and validate the projection, inspect the tree, run git diff --check, and keep current Memory synchronized with the canonical workflow and error notes.

#### 适用边界

This governs the Genshin-TS PKC capture workflow only. Working-tree observations remain protected and cannot become Authority; automatic PKC validation proves knowledge/projection consistency, not compiler, GIA, editor, or game behavior. It does not authorize source changes, map operations, injection, or Git publication without separate task authorization.

<!-- CLAIM:END clm_F25959994F5CD6EEE49495F001 -->

<!-- CLAIM:START clm_6788051E40C22ACCD528325348 -->

### draft 生命周期健康度全景：intent 已 apply 而 orphan draft 残留，bundle-supersede 是正确回收工具

2026-08-16 真实维护实操（supersede 两笔 orphan draft）确认的 draft 生命周期健康度全景：一个 knowledge intent 可被一次 apply 完整覆盖（bnd_4f9e9121 已 apply 其 2 claims+4 refs 全注册），但此前 finalize 出的其他 draft（bnd_ffe4dbcac/bnd_e13c56cbe，同 intent、不同 content hash、无 superseded_by）会作为 orphan 残留，且 bundle-status 不自动提示'意图已覆盖'——需维护者手工 cross-check 已 apply bundle 的 claims/refs 与 draft 语义才识别；正确回收操作是 pkc bundle-supersede <draft> --by <覆盖bundle> --reason（仅写该 draft 的 .lifecycle.jsonl，不碰 authority/registry/知识 md，apply 后 claim 数不变），dry-run 可先验证；bundle-status 显示 superseded 状态与 superseded_by。剩余健康度缺口：draft 堆积仍无自动消重提示、approved 空 approval 文件仍需人工识别、生命周期无汇总入口（见 clm_C971C4E8 三条摩擦点）。

#### 适用边界

本 claim 证据层=真实工具使用（本轮 supersede 实操 + bundle-status 观察），是 PKC 工具本体维护经验，非编译器/GIA/游戏规则；仅描述工具现有行为与正确用法，不授权工具改动；supersede 语义与遗留 bundle 以当前 pkc 0.2.0rc5 为准

<!-- CLAIM:END clm_6788051E40C22ACCD528325348 -->
