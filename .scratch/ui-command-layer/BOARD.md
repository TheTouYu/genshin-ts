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
**→ 02/03 学习进行中**：页面容器可承载复制内容——页签副本 2108（基础记录 1217B 无 subtype 槽）挂容器 2107；
容器内容链路开合。
after 快照即下一轮 before：.gsts/diff-exp/ui学习/1073741909.after-重启34-页签复制到容器-e951a371.gil，SHA e951a371…。
下一步：开工票03 设计稿 or 用户继续补轮。

## 票据清单

| # | 票 | Blocked by | 状态 |
|---|---|---|---|
| 01 | 按钮族规则学习（布局创建/属性/删除 + 悬浮页加按钮 + 判别 + 细排特征） | — | ✅ 09-03 |
| 02 | 常见组件族规则学习（文本框/图片/自定义开关等 2~4 个） | —（与 01 同图串行，可换序） | ☐ |
| 03 | UI 命令层设计稿（学习收口 → 命令面定案，用户裁决） | 01, 02 | ☐ |
| 04 | CLI：语义化 List + 玩家改动识别 v1 | 03 | ☐ |
| 05 | CLI：Create（布局按钮 + 悬浮页按钮，字节级核验） | 04 | ☐ |
| 06 | CLI：Edit（属性编辑，字节级核验） | 05 | ☐ |
| 07 | CLI：Delete（引用链清理，字节级核验） | 06 | ☐ |
| 08 | 游戏内总验收 + 关账沉淀 | 04, 05, 06, 07 | ☐ |

- ~~**01 · 按钮族规则学习**~~（2026-09-03 重启轮1-17 收口：布局/库模板按钮族全链路 wire 闭合——创建三分支/三步联动/按钮判别 t50-52-54/三态素材/文本颜色/实例编辑+同步整树克隆广播/玩家细排实例独立/删除五类清理；16+ 轮证据全部落盘 references/ui-controls.md；边界遗留见票内收口说明；commit 见 git log ui-diff）

## 已完成（划掉区）

- ~~**00 · 会话启动（票外）**~~（2026-09-03：上下文恢复——知识书/技能 UI 模块/覆盖登记/08-27 复盘确认暂停点；
  `gsts maps` 定位地图；重启 before 物理快照 + SHA-256 复核；manifest 落盘）
