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

<!-- CLAIM:START clm_84CED09838A595E9E91D911F67 -->

### 写回/引用前先盘点地图既有同类资产：技能变量段按地图而异，编辑器资产可能已存在且参数未配

真实写回前应对目标地图做只读同类资产盘点，再决定是否请用户去编辑器新建：① 技能变量配置 ID 段起始固定（1207959553）但**数量按地图而异**（地图 1073741908 实测 50 个=553..602，而 1073741914 是 100 个=553..652），引用段外编号=命中不存在的变量、客户端读回 EMPTY 且结构层零报错；判定法为直读地图字节 raw.count(varint(base+i))——命中 1 次=仅注册表声明即空闲可用、≥2 次=已有图引用勿复用、0 次=段外不存在。② 计划“让用户新建”的编辑器资产可能**早已存在**（E0 实例：单位状态 id=1077936132 名“定时触发技能”含效果 2110001 已在图内，只是触发间隔/技能引用未配），用户动作因此从“新建+配置”降为“配 3 项参数”。③ 该既有资产指向的技能槽位可能与常规默认不同（实测指向槽 12），不盘点就按惯例装配会造成静默失效。

#### 适用边界

适用于任何要在真实 .gil 中引用/新建资产（技能变量、单位状态、技能配置等）的任务；盘点工具为只读，不验证运行时语义（如间隔 0.0 是否永不触发仍需帧级实测）；单样本跨图观察，不据此推广各地图变量段大小。

<!-- CLAIM:END clm_84CED09838A595E9E91D911F67 -->
