# Safe GIL candidate and map writeback

Navigation for target selection, immutable source copies, candidate validation, explicit confirmation, backup, writeback, reread, and game verification.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24EAAQCSF0JG23TFYA52B -->

### 真实地图写回必须经过候选、确认和分层验证

静态 GIL 资产写回不同于 `.gia` NodeGraph 注入：它修改选定 `.gil` 的资产记录，不需要 `nodeGraphId`，但仍不得猜测 map、region、player、路径、当前哈希或 ID。安全生产顺序是：只读确认真实目标及哈希 → 固定输入副本 → 用 `--output` 生成不存在的候选文件 → focused regression 与独立 raw-wire/闭包回读 → 展示目标、ID、Transform、候选哈希、修改范围和回滚 → 获得本次明确确认 → 从未变化的真实目标用 `--write` 重新生成 → CLI 在同级 `.gsts/backups/` 建立备份 → 写后独立回读 → 用户编辑器/游戏核验。目标哈希变化时停止并重新扫描，不能沿用旧候选或旧 ID 结论。

#### 适用边界

`--write` 与 `--output` 互斥，`--output` 拒绝覆盖已有输出；这些是当前 CLI 行为。自动候选验证、写回成功、写后回读和游戏验证是不同证据层，前一层不能冒充后一层。任何具体真实地图操作仍需要任务级明确授权；本 Claim 本身不构成授权。

<!-- CLAIM:END clm_01KYF24EAAQCSF0JG23TFYA52B -->

<!-- CLAIM:START clm_2A480D90B2B98CEECDAB1C9E0C -->

### 写回后'变更消失'假象：旧编辑器内存保存覆盖磁盘，排查前先核对 hash（v19 教训，2026-08-14 确立、08-16 复发两次）

CLI 写回真实地图后，用户若未重新加载编辑器，旧编辑器内存里的地图会在下次保存时覆盖磁盘写回结果——表现为'改动消失了'（灯柱实体两次消失、信号 v4 出错版均因此，2026-08-14 v19 战役确立、2026-08-16 复发两次）。排查纪律：①任何'变更消失'先核对当前地图 hash 是否等于写回后 hash，相等则请用户重新加载编辑器再观察，不要重做注入；②每次写回（register/inject/import/attach）后必须提醒用户重新加载编辑器再保存；③排查前先确认 hash 基线，hash 漂移时旧结论全部作废需重取快照。

#### 适用边界

证据=v19 战役灯柱实体消失（2026-08-14 复盘 retrospective-2026-08-14.md）+ 2026-08-16 复发两次（灯柱实体、信号 v4 出错版，retrospective-2026-08-16-signal-param-default.md 流程纪律 1）；属工作流纪律非引擎规则；适用于 CLI 写回场景

<!-- CLAIM:END clm_2A480D90B2B98CEECDAB1C9E0C -->
