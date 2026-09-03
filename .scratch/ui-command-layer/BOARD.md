# UI 命令层 · 推进看板（ui-command-layer）

> **工程推进唯一入口**：新会话先读本板 → 找「当前前沿」→ 读 `issues/` 对应票文件干活。
> 规则：一票一文件；完成 = 勾 checkbox + 票移入已完成划掉区 + 记轮次 + 精确 commit；禁止板外另立进度。
> 目标（2026-09-03 用户定调，中期任务）：两步走，最终都要核验——
> ① **学习规则**：差分学习按钮、常见组件、悬浮页内加按钮的全部规律（学习是高效块：一轮可学 10 个差分/10 条小规则，轮次记在票内，**不拆子票**）；
> ② **命令层**：让 AI 像引擎分层设计一样操控 UI——列出玩家加了哪些按钮、编辑属性、创建、删除；
> 流程：多次差分 → 规则 + 差分数据 → 先出设计 → 再写脚本 → **字节级同步核验**（用差异对比验证手写脚本）→ 游戏内核验 → 完成。

## 资产速查

- 实验地图 **1073741909「ui学习」**；live 文件：
  `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741909.gil`
  （2026-08-27 23:04 暂停点之后无改动；重启 before 已锁，见下）
- 重启基线（票外已完成）：`.gsts/diff-exp/ui学习/1073741909.before-重启1-60a8692d.gil`
  SHA `60a8692df60a8724de22ef9d5fa0cb3c145c23fc045e553b13bfc8370ec41c7e`（41223B）
  manifest：`.gsts/diff-exp/ui学习/restart-manifest.md`（每轮更新 LOCKED 两行并回读核对）
- 规则速查：`.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md`
  （08-17~08-27 已闭合 wire：图片控件/布局三步联动/坐标换算/悬浮页 8 轮/自定义按钮三态+同步到模板；
  未闭合：第 4 状态块=禁用态 wire、t13、判别字段、按钮新结构 t50 等——见票 01/02）
- 知识书：`docs/game-engine-knowledge/ui-controls.md`；覆盖登记：`docs/game-engine-knowledge/ui-coverage-exploration-log.md`
- CLI 通道：`node ./bin/gsts.mjs maps`（地图列/路径）；`assets:ui` 现状=List 较全 / 基础 Create / 部分 Edit
  （文本框/交互按钮/自定义按钮/图片、悬浮页骨架 create、states|variables 只读）；推进顺序 **List→Create→Edit**（用户 2026-08-27 定）
- 差分工具（技能 scripts/）：`capture-evidence.py` / `capture-experiment.py`（快照封装）/
  `compare-gil-root-wire.py`（root 级 raw 对比）；定点 UI 结构速查见模块 reference
- 已知常量（跨地图通用，图内 ID 一律从快照读、不硬猜）：默认布局 **1073741825**、控件组库容器 **1073741840**；
  素材索引段 `0x40000000+`；悬浮页 kind 330001/330002、按钮默认样式 50888、subtype 6=自定义按钮

## 当前前沿

**→ 票08 关账（待统一执行）**：09 游戏内核验已通过并回灌（2026-09-03）。剩：复盘（task-retrospective）、
规则入 PKC、差分技能 UI 模块与资产操作技能回灌、知识书与覆盖登记更新、看板全部划掉、精确 commit。
前置：09 完成 = A 基座/B 命令/C 玩家读回全过，修复轮 R1-R5 闭环。
后续票：**票10 高级控件命令面**（悬浮交互页富版/页签/素材成员 add-update/rich-image/templateize 素材克隆/
队列消息样式/sync——issues/10-advanced-controls-command-surface.md，用户 2026-09-03 定走本票）

> 注（2026-09-03）：分级计划树因 L1 大类 4 标题空串被污染且无法解锁（界面无审核弹窗），经用户确认
> **以本 BOARD + issues/ 为唯一推进记录**（板外不另立进度），计划树暂停使用。

学习基线：重启轮66 快照 .gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil，SHA 7468eadd…。

## 已完成（划掉区）

- ~~**09 · 游戏内核验（新地图）**~~（2026-09-03：1073741917「UI核验09」A/B/C 全过；Create 5/Edit 6/Delete 1
  游戏确认；修复轮 R1（--yes 写回启用）/R2（三态文字素材）/R3（素材组成员删除）/R4（rich-image backlog 登记）/
  R5（模板悬空引用清理）；报告 ui/verification/ticket09-verification-report.md；结果回灌票08）
- ~~**00 · 会话启动（票外）**~~（2026-09-03：上下文恢复——知识书/技能 UI 模块/覆盖登记/08-27 复盘确认暂停点；
  `gsts maps` 定位地图；重启 before 物理快照 + SHA-256 复核；manifest 落盘）
- ~~**04 · CLI：语义化 List + 玩家改动识别 v1**~~（2026-09-03：ui/src 独立模块落地；list 树/平面/JSON schema、
  anchor save/list、diff --anchor（字段级+playerChanges+重锚）；真实样本断言 9/9 PASS；构建/CLI 冒烟通过）
- ~~**05 · CLI：Create + 模板化（代码层）**~~（2026-09-03：多 kind create + 模板化矩阵 6/6 root9 全等
  （按钮/输入框/官方无样式队列/实例源×2）；CLI 语义路由；写回与游戏核验并入票08 攒批）
