# Safe GIL candidate and map writeback

Navigation for target selection, immutable source copies, candidate validation, explicit confirmation, backup, writeback, reread, and game verification.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24EAAQCSF0JG23TFYA52B -->

### 真实地图写回必须经过候选、确认和分层验证

静态 GIL 资产写回不同于 `.gia` NodeGraph 注入：它修改选定 `.gil` 的资产记录，不需要 `nodeGraphId`，但仍不得猜测 map、region、player、路径、当前哈希或 ID。安全生产顺序是：只读确认真实目标及哈希 → 固定输入副本 → 用 `--output` 生成不存在的候选文件 → focused regression 与独立 raw-wire/闭包回读 → 展示目标、ID、Transform、候选哈希、修改范围和回滚 → 获得本次明确确认 → 从未变化的真实目标用 `--write` 重新生成 → CLI 在同级 `.gsts/backups/` 建立备份 → 写后独立回读 → 用户编辑器/游戏核验。目标哈希变化时停止并重新扫描，不能沿用旧候选或旧 ID 结论。

#### 适用边界

`--write` 与 `--output` 互斥，`--output` 拒绝覆盖已有输出；这些是当前 CLI 行为。自动候选验证、写回成功、写后回读和游戏验证是不同证据层，前一层不能冒充后一层。任何具体真实地图操作仍需要任务级明确授权；本 Claim 本身不构成授权。

<!-- CLAIM:END clm_01KYF24EAAQCSF0JG23TFYA52B -->
