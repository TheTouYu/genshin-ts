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

<!-- CLAIM:START clm_1C061DE3FA2A42C14A740AF537 -->

### PKC 工具自身可用性摩擦点：draft 重复无消重 / approved 状态与空 approval 脱节 / bundle 生命周期缺汇总入口

2026-08 真实使用 pkc-project-operator + toolkit 维护 genshin-ts 知识树时暴露三个工具可用性摩擦点（证据=真实工具调查，均已在 bundle-status + approval/applied 文件 + knowledge-check 三方交叉中核实）：(a) draft 会重复且无自动消重——两对近似重复（entity-import-aux 意图的 bnd_ffe4dbcac/bnd_e13c56cbe，及 P4-4 类型契约意图的 bnd_36ef81925/bnd_bbda2fb98）语义相同的 create 却各带不同 content hash 且均无 superseded_by，工具不自动提示同意图幂等；(b) approved 状态可与 approval 文件脱节——部分 bundle 处于 approved 态但 approval 内容或语义需人工核验，工具缺状态与 approval 文件的内部一致性校验；(c) bundle 生命周期缺一个健康度汇总入口——判断 draft 是否被 apply、approval 是否真、意图是否已落地需手工交叉 bundle-status + 逐 approval/applied 文件 + knowledge-check 三方才能拼全

#### 适用边界

本 claim 是知识树维护者使用 PKC 工具本体的真实体验反馈，证据层=真实工具使用（bundle 文件事实），非编译器/GIA/编辑器/游戏行为规则；所列摩擦点是工具不足而非缺陷归咎，最终是否改工具需另行决策；不含授权任何工具改动

<!-- CLAIM:END clm_1C061DE3FA2A42C14A740AF537 -->
