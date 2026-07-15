# Stage 3 游戏回归 Manifest

> 状态：P5-W4 用户核验通过并归档；已完成 P3-W22 / P3.5 / P4-W1 / P2-W18 / P4-W2..P4-W7 / P5-W2 / P5-W4
> 来源：ADR-013（用户确认的证据治理） + 当前自动生成/哈希 + 用户编辑器/游戏确认
> 最近校验：2026-07-15
> 适用范围：Phase 3、Phase 4、Phase 5、opt-in beta、默认切换和 legacy 删除的代表性 GIA 候选；不包含注入

本文件是用户编辑器/游戏回归候选的唯一权威清单。候选二进制不提交到仓库，应保留在既有外部导出目录；本文件记录
哪个精确产物被确认过，不能把自动生成、文件复制或编辑器加载写成游戏行为已验证。

P3-W22 在 Phase 3 退出前建立首批 P3 条目。P2 历史候选只有在目的、命令、路径、SHA-256、观察点和用户结论完整时才可回填。

## 使用规则

- 每条记录必须覆盖一个最小、可命名的风险或跨类别哨兵，不以 API 数量作为覆盖率指标。
- SHA-256 改变后，旧游戏结论自动失效；只有可审计的无语义差异证明或用户重新核验才能建立新结论。
- 用户确认“通过”至少表示编辑器加载和候选定义的可观察执行均通过；其结论只适用于记录的候选、观察点和游戏状态。
- 任一代表性条目失败，阻塞阶段推进；保存候选和观察，按 ADR-013 的 0–6 层归因建立一个最小修复工作包。
- 注入默认不做。若日后发生注入，必须单列目标与结果，且不得与游戏行为结论混同。

## 条目模板

```md
### <稳定候选 ID>

- 工作包/阶段：
- 目的与覆盖风险：
- 自动证据：<命令 + 结果>
- 生成命令：
- backend/gate：
- 候选路径：
- SHA-256：
- 编辑器加载观察：
- 游戏内可观察执行观察：
- 用户结论与日期：
- 注入状态：未注入 / <独立记录链接>
- 适用范围与未证明事项：
```

## 当前条目

### 已通过：P5-W4

以下五份 P5-W4 候选于 2026-07-14 生成，自动 focused/inventory/sentinel 回归通过，均未注入。用户于
2026-07-15 确认编辑器加载和可观察执行通过，并归档到 `真-测试通过/复合节点`。它们验证删除空的 legacy
typed-identity adapter 后，vendor-gated boundary 哨兵仍可加载/执行。用户结论绑定下列核验时 SHA。

#### P5-W4-capture

- 工作包/阶段：P5-W4 / Phase 5 empty typed-identity adapter 删除。
- 目的与覆盖风险：adapter 删除后 capture-only 复合边界不退化。
- 自动证据：`test-stage3-p5w4-empty-typed-identity-adapter-removal.ts`、
  `test-stage3-p2w6-capture-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P5W4-capture-vendor.gia`
- SHA-256：`7d37a964fe98377be35ef97df1ea68029efe4627a55d84bca28d7f16b2e231db`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-15）。
- 游戏内可观察执行观察：用户确认通过（2026-07-15）。
- 用户结论与日期：通过，2026-07-15。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 adapter 删除后的 capture sentinel；不证明 wire 全等或 default gate 切换。

#### P5-W4-nested-capture

- 工作包/阶段：P5-W4 / Phase 5。
- 目的与覆盖风险：nested capture 路由在 adapter 删除后仍经 compositePins 进入 child call。
- 自动证据：P5-W4 contract、`test-stage3-p2w11-nested-capture-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P5W4-nested-capture-vendor.gia`
- SHA-256：`52416110d962b58df72f6eab1386e9ff62589d42433dfeb8cb6dcb17ffcda79d`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-15）。
- 游戏内可观察执行观察：用户确认通过（2026-07-15）。
- 用户结论与日期：通过，2026-07-15。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested capture sentinel。

#### P5-W4-nested-sparse

- 工作包/阶段：P5-W4 / Phase 5。
- 目的与覆盖风险：nested sparse/optional binding 在 adapter 删除后不退化。
- 自动证据：P5-W4 contract、`test-stage3-p2w12-nested-sparse-input-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P5W4-nested-sparse-vendor.gia`
- SHA-256：`12213296143e4cb7b083cb86b7de19586dfdffa59a6b74028a01c788f4fce0a0`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-15）。
- 游戏内可观察执行观察：用户确认通过（2026-07-15）。
- 用户结论与日期：通过，2026-07-15。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested sparse sentinel。

#### P5-W4-multi-inflow-outflow

- 工作包/阶段：P5-W4 / Phase 5。
- 目的与覆盖风险：multi InFlow/OutFlow 索引路由在 adapter 删除后不退化。
- 自动证据：P5-W4 contract、`test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P5W4-multi-inflow-outflow-vendor.gia`
- SHA-256：`0fafd5de8d5e345f66e1c0209a9829b5dcecc7969c434c825b2bbc3eec0b6a14`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-15）。
- 游戏内可观察执行观察：用户确认通过（2026-07-15）。
- 用户结论与日期：通过，2026-07-15。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 multi-flow sentinel。

#### P5-W4-nested-call

- 工作包/阶段：P5-W4 / Phase 5。
- 目的与覆盖风险：nested SysGraph call 与 ordinary vendor nodes 混排在 adapter 删除后不退化。
- 自动证据：P5-W4 contract、`test-stage3-p2w9-nested-call-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P5W4-nested-call-vendor.gia`
- SHA-256：`aaeb529e1206c1b0c2e7e999000f6bcbcc4b9cca8a6c87f95a60caeb464bbd00`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-15）。
- 游戏内可观察执行观察：用户确认通过（2026-07-15）。
- 用户结论与日期：通过，2026-07-15。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested call flow sentinel。

---

以下五份 P4-W7 候选于 2026-07-14 生成，自动 orchestration/boundary 回归通过，均未注入。用户于 2026-07-14
确认编辑器加载和可观察执行通过，并归档到 `真-测试通过/复合节点`。它们验证 `composite.ts` orchestration
收口后生产路径不退化（ordinary pin builder 不再嵌 capture/call 节点分支；call 仅 orchestration 层路由）。
连续重生字节 SHA 可能因既有非确定性变化，用户结论绑定下列核验时 SHA。

### P4-W7-capture

- 工作包/阶段：P4-W7 / Phase 4 orchestration 收口。
- 目的与覆盖风险：capture-only 复合在 ordinary pin builder 拒绝 boundary 节点后，capture 输入仍只走
  compositePins，可观察执行不退化。
- 自动证据：`test-stage3-p4w7-orchestration-contract.ts`、`test-stage3-p2w6-capture-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W7-capture-vendor.gia`
- SHA-256：`48b428233b4487ae7281d13788e51b6534d23441ff5cd1969fd70bcb10bad05d`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；观察 capture 输入 → local setter/print 链。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 orchestration 收口 + capture boundary；不证明坐标与真实编辑器像素全等。

### P4-W7-nested-capture

- 工作包/阶段：P4-W7 / Phase 4 orchestration 收口。
- 目的与覆盖风险：nested capture 路由在 ordinary/call 分支分离后仍经 compositePins 进入 child call。
- 自动证据：P4-W7 contract、`test-stage3-p2w11-nested-capture-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W7-nested-capture-vendor.gia`
- SHA-256：`805f45c51d1c017712e289b7d1ed6e9d9b277854c1e0b9539e95bd2dff8d93d7`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested capture + orchestration 收口。

### P4-W7-nested-sparse

- 工作包/阶段：P4-W7 / Phase 4 orchestration 收口。
- 目的与覆盖风险：sparse named binding 在 call lowerer 仅由 orchestration 路由后声明 index 不退化。
- 自动证据：P4-W7 contract、`test-stage3-p2w12-nested-sparse-input-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W7-nested-sparse-vendor.gia`
- SHA-256：`b67c1077a9f00b8dc6333930f9aa77ab51b589a74f357bb615b0974f60a6969d`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 sparse binding + orchestration 收口。

### P4-W7-multi-inflow-outflow

- 工作包/阶段：P4-W7 / Phase 4 orchestration 收口。
- 目的与覆盖风险：多 InFlow/OutFlow 在 boundary pipeline 收口后分支路由与可观察执行不退化。
- 自动证据：P4-W7 contract、`test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W7-multi-inflow-outflow-vendor.gia`
- SHA-256：`901baf90dbf6cd374b1498d9ad9e4cede4df2b866e54dd76516439049c746dd0`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；两路 InFlow / OutFlow Print 链。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 multi-flow + orchestration 收口。

### P4-W7-nested-call

- 工作包/阶段：P4-W7 / Phase 4 orchestration 收口。
- 目的与覆盖风险：nested SysGraph call 在 ordinary pin builder 禁止 call 节点后仍由 orchestration 编码。
- 自动证据：P4-W7 contract、`test-stage3-p2w9-nested-call-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W7-nested-call-vendor.gia`
- SHA-256：`d64611d80a435f333ae1c6255ef4cba559fcde15a61ff8fab79ee50e5eba0cde`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested call + orchestration 收口。

以下五份 P4-W6 候选于 2026-07-14 生成，自动 contract 与 boundary 回归通过，均未注入。用户于 2026-07-14
确认编辑器加载和可观察执行通过，并归档到 `真-测试通过/复合节点`。它们验证 layout isolation builder
接入后生产路径不退化（virtual anchors 仅用于布局、强制消费 capture-normalized boundaryPins）。
连续重生字节 SHA 可能因既有非确定性变化，用户结论绑定下列核验时 SHA。

### P4-W6-capture

- 工作包/阶段：P4-W6 / Phase 4 layout isolation。
- 目的与覆盖风险：capture-only 复合在 layout 强制消费 capture-normalized boundaryPins 后，InFlow 锚点
  指向 first child 而非 `__composite_capture__`，节点可观察执行不退化。
- 自动证据：`test-stage3-p4w6-layout-isolation-contract.ts`、`test-stage3-p2w6-capture-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W6-capture-vendor.gia`
- SHA-256：`338906e9ec90bde1976daa5c4a089ae51627ab08e52fb24dba51b316d85eecee`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；观察 capture 输入 → local setter/print 链。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 layout isolation + capture boundary；不证明坐标与真实编辑器像素全等。

### P4-W6-nested-capture

- 工作包/阶段：P4-W6 / Phase 4 layout isolation。
- 目的与覆盖风险：nested capture 路由在 layout isolation 后仍经 compositePins 进入 child call。
- 自动证据：P4-W6 contract、`test-stage3-p2w11-nested-capture-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W6-nested-capture-vendor.gia`
- SHA-256：`e87090229e6dc00a158e290116a570aa7149ad775c4715a949d7ba1aafbb1562`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested capture + layout isolation；不证明全部 nested 深度。

### P4-W6-nested-sparse

- 工作包/阶段：P4-W6 / Phase 4 layout isolation。
- 目的与覆盖风险：sparse named binding 在 layout isolation 后声明 index 与调用语义不退化。
- 自动证据：P4-W6 contract、`test-stage3-p2w12-nested-sparse-input-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W6-nested-sparse-vendor.gia`
- SHA-256：`72c04ad8e376eb38902853810e1c40b01f175408961d15a473ceeaca91aa22fe`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 sparse binding + layout isolation。

### P4-W6-multi-inflow-outflow

- 工作包/阶段：P4-W6 / Phase 4 layout isolation。
- 目的与覆盖风险：多 InFlow/OutFlow 在 layout 使用 boundaryPins 建 virtual input anchors 后，分支
  路由与可观察执行不退化。
- 自动证据：P4-W6 contract、`test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W6-multi-inflow-outflow-vendor.gia`
- SHA-256：`4a377264ee68c24797f6a302ebc31afc7799eac42237dae3c80af3704812abf2`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；观察左右分支 Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 multi flow + layout isolation；不证明任意数量 flow。

### P4-W6-nested-call

- 工作包/阶段：P4-W6 / Phase 4 layout isolation。
- 目的与覆盖风险：nested call flow sentinel 在 layout isolation 后 ordinary/synthetic 混合图可观察执行
  不退化。
- 自动证据：P4-W6 contract、`test-stage3-p2w9-nested-call-vendor-graph.ts`，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W6-nested-call-vendor.gia`
- SHA-256：`edb60eaa3bba903ff56daec2bb39983b16a2786308ac19fd6eb0995a80f8b3b4`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested call flow + layout isolation。

---

以下五份 P4-W5 候选于 2026-07-14 由用户确认通过并归档到 `真-测试通过/复合节点`。记录见 STATUS 的
P4-W5 完成节；本文件此前未同步条目，此处按 STATUS 用户核验 SHA 回填摘要，避免把已归档结论丢掉。

### P4-W5-capture

- 工作包/阶段：P4-W5 / Phase 4 compositePins overlay。
- 目的与覆盖风险：compositePins overlay 独立抽取后 capture-only 路由不退化。
- 自动证据：P4-W5 contract + capture fixtures，PASS。
- backend/gate：vendor-gated impl。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W5-capture-vendor.gia`
- SHA-256：`7deee3dde708f23026b48589932b3f3692ae18e6eb82c3f349e9a5dab24dcbfd`（用户核验时）
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。

### P4-W5-nested-capture / nested-sparse / multi-inflow-outflow / nested-call

- 工作包/阶段：P4-W5。
- 候选路径：
  - `.../P4W5-nested-capture-vendor.gia` SHA `0fc511100bd384956c40bbbdbb6f093a9a95530942339a5621e370a607c2c690`
  - `.../P4W5-nested-sparse-vendor.gia` SHA `3bf6efd4370c92cc3eef12daa2900ea83b7f635b4e06c83a45b5800e68289a92`
  - `.../P4W5-multi-inflow-outflow-vendor.gia` SHA `1f2f157190571e8f9aed0bb6a279d4315220385cf36f4e81e1a637879c890561`
  - `.../P4W5-nested-call-vendor.gia` SHA `eb72d853cb90a2f4865c4e1e56394060d3d6f59fe5bca507625cdad743ad75a7`
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。

---

以下五份 P4-W4 候选于 2026-07-14 生成，自动 contract 与 boundary 回归通过，均未注入。用户于 2026-07-14
确认编辑器加载和可观察执行通过，并归档到 `真-测试通过/复合节点`。它们验证 definition interface builder
抽取后生产路径不退化；连续重生字节 SHA 可能因既有非确定性变化，用户结论绑定下列核验时 SHA。

### P4-W4-bool-definition

- 工作包/阶段：P4-W4 / Phase 4 definition interface builder 独立抽取。
- 目的与覆盖风险：CompositeDef ParameterFlow 的 bool `enumId.val=1`、int 不带 enumId、pinIndex 与
  definition GraphUnit/impl graphId relation 在独立 builder 接入后不退化。
- 自动证据：`test-stage3-p4w4-definition-interface-contract.ts`、`test-composite-bool-input-gia.ts`，PASS。
- 生成命令：`npx tsx tests/composite/test-composite-bool-input-gia.ts`（产物复制为候选名）。
- backend/gate：default handwritten impl；本候选重点是 CompositeDef 接口编码，不依赖 vendor gate。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W4-bool-definition-vendor.gia`
- SHA-256：`fc56d8c9cdb8af62bfc83584a1e186bee3443ff9d4429ec77241000bd262a1fa`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；观察 bool 接口控件与类型显示，不要求该 fixture
  的 return-only 输出参数具备完整内部实现图。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 definition interface builder + bool/int ParameterFlow；不证明完整
  OutParam 内部路由实现或全部 enum 类型。

### P4-W4-multi-inflow-outflow

- 工作包/阶段：P4-W4 / Phase 4 definition interface builder 独立抽取。
- 目的与覆盖风险：多 InFlow/OutFlow 的 ControlFlow 接口与 pinIndex 在独立 builder 接入后不退化。
- 自动证据：P4-W4 contract、P4-W1 B4 legacy/vendor，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W4-multi-inflow-outflow-vendor.gia`
- SHA-256：`580e5f1ae0df4ac5abe2fee22c255e7800a088f1bea25e46689faf1e585f980f`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 multi flow interface + definition builder；不证明任意数量 flow。

### P4-W4-nested-sparse

- 工作包/阶段：P4-W4 / Phase 4 definition interface builder 独立抽取。
- 目的与覆盖风险：nested sparse binding 与 child definition pinIndex 在 definition builder 抽取后不退化。
- 自动证据：P4-W4 contract、P2-W12 legacy/vendor、sparse/optional contracts，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W4-nested-sparse-vendor.gia`
- SHA-256：`8314a4a4454b8503906a582762d29ad2befd683941436b8878a89592c17efeda`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested sparse presence 组合 + definition builder；不证明全部 optional 类型。

### P4-W4-nested-capture

- 工作包/阶段：P4-W4 / Phase 4 definition interface builder 独立抽取。
- 目的与覆盖风险：nested capture route 与 definition interface 共存时不退化。
- 自动证据：P4-W4 contract、P2-W11 legacy/vendor、nested capture pins，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W4-nested-capture-vendor.gia`
- SHA-256：`de770f551e69d6197b6d65d9cc8b58e9ccc0856f4d4335e284dfe4cf4ab15ff6`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested capture + definition builder；不证明全部 capture family。

### P4-W4-nested-call

- 工作包/阶段：P4-W4 / Phase 4 definition interface builder 独立抽取。
- 目的与覆盖风险：nested call flow sentinel 在 definition builder 抽取后不退化。
- 自动证据：P4-W4 contract、P2-W9 legacy/vendor、nested outflow，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W4-nested-call-vendor.gia`
- SHA-256：`75b9c29ab143684dae034a88f1ea3536598633543b463d49978f381898272ca1`（用户核验时）
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested call flow + definition builder；不证明 nested data 全族。

以下四份 P4-W3 候选于 2026-07-14 以 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 生成，自动契约与 B2/B3/B4/nested
call 回归通过，均未注入。用户于 2026-07-14 确认四份候选均通过编辑器加载和可观察执行，并归档到
`真-测试通过/复合节点`。它们验证 call lowerer 抽取后生产路径不退化；不得把旧 P4-W1 同名 SHA 的结论继承到
本轮新 SHA。

### P4-W3-B2-sparse-binding

- 工作包/阶段：P4-W3 / Phase 4 call lowerer 独立抽取。
- 目的与覆盖风险：call lowerer 接入后，nested first-only、second-only、both、empty call 仍保持 declared
  `compositeInputIndex`，不压缩 physical InParam，并保留 child definition pinIndex。
- 自动证据：`test-stage3-p4w3-call-lowerer-contract.ts`、P2-W12 legacy/vendor、optional-call-input contract，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W3-sparse-binding-vendor.gia`
  （通过后从根目录 `P4W3-sparse-binding-vendor.gia` 归档）
- SHA-256：`900391e99dd0e148f163833201d1084eee8c3649102d9178142d341ebf687d94`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖四个 nested call 分支到达各自 Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖两个 float input 的 presence 组合 + call lowerer 抽取；不证明所有 optional
  type/connection/capture 组合或 wire 全等。

### P4-W3-B3-nested-data

- 工作包/阶段：P4-W3 / Phase 4 call lowerer 独立抽取。
- 目的与覆盖风险：call lowerer 接入后，vendor-materialized outer Addition → synthetic child call InParam →
  child `compositePins` → child DTC → child Print，以及 child OutFlow → outer ordinary Print 不退化。
- 自动证据：`test-stage3-p4w3-call-lowerer-contract.ts`、P2-W10 legacy/vendor，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w10-nested-data-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W3-nested-data-vendor.gia`
  （通过后从根目录 `P4W3-nested-data-vendor.gia` 归档）
- SHA-256：`d7817e84477624e394b1ae55829a3f7bc53f20800107042b7682a1c118cc1cfe`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 child input 经 DTC 到 child Print，随后 child OutFlow 到 outer Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 float ordinary producer → nested call + call lowerer 抽取；不证明 child
  OutParam data return 或全部 synthetic routes。

### P4-W3-B4-multi-inflow-outflow

- 工作包/阶段：P4-W3 / Phase 4 call lowerer 独立抽取。
- 目的与覆盖风险：call lowerer 接入后，两个 indexed InFlow 的 root → synthetic call overlay、两个 physical
  OutFlow 与各自不同 ordinary Print consumer、impl `compositePins` 的 InFlow/OutFlow route 不退化。
- 自动证据：`test-stage3-p4w3-call-lowerer-contract.ts`、P4-W1 B4 legacy/vendor、nested outflow contract，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W3-multi-inflow-outflow-vendor.gia`
  （通过后从根目录 `P4W3-multi-inflow-outflow-vendor.gia` 归档）
- SHA-256：`ba267e2ab0bec629c34be8d47bb9c1ca3d4905ade480cace8beb1a4ea7bea397`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖左/右 InFlow 分别进入对应 child Print，并由对应 OutFlow 到不同 root Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖两个 indexed flow + call lowerer 抽取；不证明多 source fan-in 或任意数量
  inflow/outflow。

### P4-W3-nested-call-flow

- 工作包/阶段：P4-W3 / Phase 4 call lowerer 独立抽取。
- 目的与覆盖风险：call lowerer 接入后，nested SysGraph call 的 OutFlow → outer ordinary Print overlay 与
  SysGraph identity 不退化。
- 自动证据：`test-stage3-p4w3-call-lowerer-contract.ts`、P2-W9 legacy/vendor，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w9-nested-call-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P4W3-nested-call-vendor.gia`
  （通过后从根目录 `P4W3-nested-call-vendor.gia` 归档）
- SHA-256：`37a2665fb0a4c523e0026173464c572313fcd72dd84a06c3ff6007eda1d96edd`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 nested call OutFlow 到达 outer Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested call flow sentinel + call lowerer 抽取；不证明 nested data/capture 全族。

### P2-W18-scalar-comparison

- 工作包/阶段：P2-W18 / ordinary family 哨兵（用户指定插入，非 P4 boundary 包）。
- 目的与覆盖风险：同型 int/float 的 `equal` / `less_than` / `less_than_or_equal_to` / `greater_than` /
  `greater_than_or_equal_to` 走 shared identity；root 与 composite impl 均可达 comparison → bool→str DTC →
  Print 控制流；literal 与 ordinary producer connection 输入均覆盖。
- 自动证据：`npm run build`、`test-stage3-resolved-node-contract.ts`、P2-W18 legacy/vendor fixture、P2-W17b
  legacy/vendor 回归，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w18-scalar-comparison-observation.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/真-测试通过/复合节点/P2W18-scalar-comparison-vendor-shared-resolution.gia`
  （通过后从根目录 `P2W18-scalar-comparison-vendor.gia` 归档）
- SHA-256：`0b1e414dd836b62dadb7a0e4dff47642fcb2c96e126298bbb73ace6b57033f62`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 root 与复合 `P2W18_ScalarComparisonFlow_GSTS`
  的 comparison → bool→str DTC → Print 链。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖同型 int/float 五类比较；不证明异型 comparison、bool/str/entity/vec equal、
  logical ops、legacy handwritten OutParam bool schema 修正或 wire 全等。

以下四份 P4-W1 候选于 2026-07-14 以 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 生成到
`Beyond_Local_Export` 根目录，自动契约和 legacy/vendor 回归通过，均未注入。它们分别覆盖独立 boundary
子切片；用户已确认 B1、B2、B4 通过。B3 初版定义未实际消费输入，旧候选结论已作废；用户已确认修正版通过。任何一份失败只阻塞其对应子切片。

### P4-W1-B1-capture-only

- 工作包/阶段：P4-W1 B1 / Phase 4 boundary regression batch。
- 目的与覆盖风险：captured composite input 不生成 impl ordinary edge；capture route 仅经 `compositePins` 到 getter
  InParam，同时 getter value OutParam[1] 仍能连接 ordinary Addition consumer。
- 自动证据：P2-W6 legacy/vendor fixture、P2-W7 captured-connection vendor fixture、nested capture contract，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P4W1-b1-capture-only-vendor.gia`
- SHA-256：`4e3af41168f1baa1c5b05225781cbdef46616968cc50545c17b4e42ec70d5043`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 captured float 经 getter value → Addition → DTC → Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 local-variable capture-only route；不证明所有 capture family 或 wire 全等。

### P4-W1-B2-sparse-optional-binding

- 工作包/阶段：P4-W1 B2 / Phase 4 boundary regression batch。
- 目的与覆盖风险：nested first-only、second-only、both、empty call 保持 declared `compositeInputIndex`，不压缩
  physical InParam，并保留 child definition 的完整 input routes。
- 自动证据：P2-W12 legacy/vendor fixture、optional-call-input runtime contract，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w12-nested-sparse-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P4W1-b2-sparse-binding-vendor.gia`
- SHA-256：`017f775dfaec4a852b2b228ae9f9a57ea193df758a8a21f32fbe8efe78b9456e`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖四个 nested call 分支到达各自 Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖两个 float input 的 presence 组合；不证明所有 optional type/connection/capture 组合。

### P4-W1-B3-nested-call-data

- 工作包/阶段：P4-W1 B3 / Phase 4 boundary regression batch。
- 目的与覆盖风险：vendor-materialized outer Addition ordinary producer → synthetic child call InParam → child
  `compositePins` → child DTC → child Print，及 child OutFlow → outer ordinary Print。初版 child definition 未
  消费输入，用户指出其逻辑无效；旧 SHA 的游戏结论不用于 B3。
- 自动证据：收紧后的 P2-W10 legacy/vendor fixture、P3 complex-flow legacy/vendor parity，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w10-nested-data-input-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P4W1-b3-nested-data-vendor.gia`
- SHA-256：`912613244991b76030c15012f31ba1b7f89e5b1f5e6b33ed060bef91c8b9455c`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 child input 经 DTC 到 child Print，随后 child OutFlow 到 outer Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 float ordinary producer → nested call；不证明 child OutParam data return 或所有 synthetic routes。

### P4-W1-B4-multi-inflow-outflow

- 工作包/阶段：P4-W1 B4 / Phase 4 boundary regression batch。
- 目的与覆盖风险：两个 indexed InFlow 的 root → synthetic call overlay、两个 physical OutFlow 与各自不同 ordinary
  Print consumer、impl `compositePins` 的 InFlow/OutFlow route。
- 自动证据：`test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts` legacy/vendor、nested outflow contract，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p4w1-multi-inflow-outflow-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P4W1-b4-multi-inflow-outflow-vendor.gia`
- SHA-256：`f24a6f7acfd2dc19d03680685bb6cff74739f6e4d57c654dd4b5370b5a4e4508`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖左/右 InFlow 分别进入对应 child Print，并由对应 OutFlow 到不同 root Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖两个 indexed flow；不证明多 source fan-in、循环或任意数量的 inflow/outflow。

### P4-W2-capture-normalization

- 工作包/阶段：P4-W2 / Phase 4 capture normalization 模块化。
- 目的与覆盖风险：`normalizeCompositeCaptures` 接入生产路径后，B1 capture-only 行为不退化：captured float 不生成 ordinary InParam edge，仅经 `compositePins` 到 getter InParam[0]，getter value OutParam[1] 仍连接 ordinary Addition → DTC → Print。
- 自动证据：`test-stage3-p4w2-capture-normalization-contract.ts`、`test-nested-composite-capture-pins.ts`、P2-W6 legacy/vendor、P2-W7 legacy/vendor，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w6-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P4W2-capture-normalization-vendor.gia`
- SHA-256：`671d93b20afb2bb34cbbe09b0abd63911479e5fc38a7a0ef8fbe42c98d103b11`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 capture → getter value → Addition → DTC → Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 local-variable capture-only + normalization 接入；不证明 wire 全等。同一 fixture 连续重生的字节 SHA 存在既有非确定性，自动证据以 structural contract 为准。

### P4-W2-nested-capture

- 工作包/阶段：P4-W2 / Phase 4 capture normalization 模块化。
- 目的与覆盖风险：outer captured float 经 parent `compositePins` 进入 nested SysGraph call；normalization 不破坏 nested capture route。
- 自动证据：`test-stage3-p4w2-capture-normalization-contract.ts`、`test-nested-composite-capture-pins.ts`、P2-W11 legacy/vendor，PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w11-nested-capture-vendor-graph.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P4W2-nested-capture-vendor.gia`
- SHA-256：`44e3340f17c630cb12796ff6b873d76ba60ab251409c7adeba036c8653c919d9`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 outer capture 进入 nested SysGraph call。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 nested capture route + normalization 接入；不证明全部 nested family 或 wire 全等。

### P3.5-local-variable-getter-output

- 工作包/阶段：P3.5 exception / 在 P4-W1 B1 发现后恢复 P4。
- 目的与覆盖风险：vendor-gated root/impl `get_local_variable` 同时保留 OutParam[0] local-variable
  handle 与 OutParam[1] typed value；前者供 setter，后者供 ordinary consumer。P3-W21 endpoint contract 曾揭示旧路径
  静默删掉两者之一会产生悬空 edge。
- 自动证据：`npm run build`、`test-local-variable-impl-concrete-type.ts`、P2-W5 legacy/vendor、P2-W6/P2-W7
  vendor、P2-W12/P2-W10 vendor、nested capture/outflow、P3-W21 direct contract，均 PASS。
- 生成命令：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w5-vendor-graph-baseline.ts <候选路径>`。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P35-local-variable-getter-output-vendor.gia`
- SHA-256：`b32b810dc88c9318b0842ccc76c7f63b5a995d469150e6bf2e03316507b7ada2`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖两个 local-variable branch 的 setter、getter value →
  Addition → DTC → Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只修复 local-variable getter 的两个输出 pin；不证明其他 variable family、wire
  全等或 P4 boundary batch。

以下四份 P3-W22 候选在 2026-07-14 以 `GSTS_STAGE3_VENDOR_IMPL_GRAPH=1` 重新生成到
`Beyond_Local_Export` 根目录，自动断言通过并已回读 SHA-256。用户于 2026-07-14 确认四份候选均通过编辑器
加载和可观察执行；未注入。旧 P3-W20 同名文件的 SHA 与下列 SHA 不同，因此旧游戏结论不继承，而由本次
精确 SHA 的新结论取代。

### P3-W22-complex-flow-boundary-fan-out

- 工作包/阶段：P3-W22 / Phase 3 exit audit
- 目的与覆盖风险：ordinary flow fan-out、ordinary addition → DTC/Print data edge，以及两个 indexed nested
  synthetic OutFlow overlay。
- 自动证据：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p3w20-complex-flow-parity.ts <候选路径>`，PASS。
- 生成命令：同上。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P3W20-complex-flow-vendor.gia`
- SHA-256：`43187cd06412a10b734e078613059d30cfa1392a05198983834b984978979559`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 nested composite 两个 OutFlow 分别到达外层两个 Print 链。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：覆盖 P3 ordinary/synthetic overlay 交界的 fan-out 哨兵；不证明 capture、全部 dynamic
  pin 或真实 GIA/wire 全等。

### P3-W22-all-dtc-variants

- 工作包/阶段：P3-W22 / Phase 3 exit audit
- 目的与覆盖风险：当前映射的 11 个 DTC variant、typed vendor pin schema、composite input route 与可见 Print。
- 自动证据：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w16-all-dtc-vendor-graph.ts <候选路径>`，PASS。
- 生成命令：同上。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P3W20-dtc-vendor.gia`
- SHA-256：`9e4e41dfe129eab89ac4d1e70532ddd7e404525922c6715b46f89f5a2729cae3`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖各 DTC 分支到达对应 Print。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖脚本当前 11 个 DTC mapping；不证明未映射转换、跨版本数值语义或 wire 全等。

### P3-W22-captured-custom-target

- 工作包/阶段：P3-W22 / Phase 3 exit audit
- 目的与覆盖风险：captured entity custom target 的 `compositePins` route、literal/ordinary connection value
  与 custom getter/setter。
- 自动证据：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w8-captured-custom-target-vendor-graph.ts <候选路径>`，PASS。
- 生成命令：同上。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P3W20-custom-target-vendor.gia`
- SHA-256：`8f55ff08263349a1d08efffbe7b95be7022116cbffc8eadf257f91be76d0f155`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 captured target 上 literal/connected custom value 的
  setter/getter 和 Print 数据链。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖 entity target 与 float custom variable；不证明其他 custom type、多 target 或 wire 全等。

### P3-W22-scalar-arithmetic

- 工作包/阶段：P3-W22 / Phase 3 exit audit
- 目的与覆盖风险：同型 int/float 四则运算的 literal/connection 输入、ordinary data edge 和 root/impl
  可达 Print 控制流。
- 自动证据：`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1 npx tsx tests/composite/test-stage3-p2w17a-scalar-arithmetic-observation.ts <候选路径>`，PASS。
- 生成命令：同上。
- backend/gate：vendor-gated impl，`GSTS_STAGE3_VENDOR_IMPL_GRAPH=1`。
- 候选路径：`Beyond_Local_Export/P3W20-scalar-vendor.gia`
- SHA-256：`1c76527b38c4a33f81aab4f7c17fe893937627dae92dd671a10a99756cdda71d`
- 编辑器加载观察：用户确认通过（2026-07-14）。
- 游戏内可观察执行观察：用户确认通过（2026-07-14）；覆盖 root 与 composite 的每个 arithmetic → DTC → Print 链均可达。
- 用户结论与日期：通过，2026-07-14。
- 注入状态：未注入。
- 适用范围与未证明事项：只覆盖同型 int/float 四则运算；不证明异型 arithmetic、comparison、vec3、list/dict 或 wire 全等。
