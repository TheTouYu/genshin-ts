# Stage 3 游戏回归 Manifest

> 状态：已完成 P3-W22 / P3.5 用户核验
> 来源：ADR-013（用户确认的证据治理） + 当前自动生成/哈希 + 用户编辑器/游戏确认
> 最近校验：2026-07-14
> 适用范围：Phase 3、Phase 4、opt-in beta、默认切换和 legacy 删除的代表性 GIA 候选；不包含注入

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
