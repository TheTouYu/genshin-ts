# 票09 核验报告 — 游戏内核验（新地图）

> 状态：⏳ 进行中——§A 完成；B1a 已写回（结构层 PASS），**待用户游戏确认**
> 生成/维护：ui/verification/ticket09-runbook.md（执行配方）；本文件只记**已发生证据**。
> 行为层证据 = 用户游戏确认原文；结构层证据 = SHA/回读/diff 摘要；分层列出，不混称。

## 0. 基线（§A 结果）

- 地图：mapId=`1073741917` / 编辑器显示名=`UI核验09` / live 路径=`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741917.gil`
- 创建命令输出：`temp-sync=/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Temp/1073741917.gil`（双写确认）
- maps:init：已执行（root 3-49 补齐含 root9；source 35cfc373… → candidate 2602c2ce…）；backup=.gsts/backups/1073741917.gil.2026-09-03T05-32-12-830Z.bak
- UI 承载：默认布局 1073741825 `有`（14 官方预制）；控件组库容器 1073741840 `有`
- 基线快照：`.gsts/diff-exp/UI核验09/1073741917.baseline-2602c2ce.gil`
- 基线 SHA-256：`2602c2cedf6b63de78dea2b90d9836656704706024c53e808463bbd0b18c3cb1`（= init 后即 B1a 前状态）
- **当前 live SHA（B1a 写回后）：`7128e03b041c591497033f0cb1ba4ee2355085f15bde00a39cf2be078224ef64`**（=Temp 同步一致）

### §A 自检勾选
- [x] mapId/名称/路径已记录；[x] temp= 已确认；[x] root7 处理完成（init 补齐）；[x] 1825/1840 就位；[x] 基线快照+SHA 已锁

## 1. §B 命令逐条记录

每行固定格式（B1a 模板，其余同构）：

```
项：B1a Create 按钮 (custom-button)
候选：<路径>（SHA <hash8>，只读产物）
备份：<备份路径>（写回前自动生成，源 SHA <hash8>）
写回后 SHA：<hash8>  回读：只增目标记录+布局 f503 成员（PASS/FAIL 摘要）
用户游戏确认（原文）：✅ 按钮显示了，位置大致对，点了有反馈没报错
三栏：已验证[结构=候选回读PASS/行为=用户原文] / 未验证[按钮事件→角色图逻辑（本票范围外）] / 需用户确认[无]
```

| 项 | 候选 SHA | 备份路径 | 写回后 SHA | 回读摘要 | 用户游戏确认原文 | 结论 |
|---|---|---|---|---|---|---|
| B1a 按钮 | 7128e03b… | …/Save_Level/.gsts/backups/1073741917.gil.2026-09-03T05-40-57-833Z.bak | 7128e03b… | 布局成员 14→15；custom-button `核验按钮09` id=1073741843 path=布局:默认布局:自定义按钮#1 pos=[250,120] size=180×52 槽4；Temp 同步一致 | ❌「只有空按钮。三种状态的素材没配置，空按钮不能算核验通过。」 | **不通过**（行为层）；R2 修复中 |
| B1b 文本框 | | | | | | |
| B1c 图文输入框 | | | | | | |
| B1d 消息队列 | | | | | | |
| B1e 存为模板 | | | | | | |
| B2a 改名 | | | | | | |
| B2b 文本 | | | | | | |
| B2c 字号 | | | | | | |
| B2d 对齐(左/中/右) | | | | | | |
| B2e 文字颜色 | | | | | | |
| B2f 位置 | | | | | | |
| B3 Delete(预览 removed) | | | | | | |

## 2. §C 玩家细排读回对照

- 用户动作清单（原文/自述）：动作1=`待填`；动作2=`待填`；…（≥2 类）
- 动作前锚点：`assets:ui anchor save` 路径/标签=`待填`
- diff 输出：`.gsts/ui-anchors/<mapId>.json` + diff 摘要=`待填`

| 用户动作 | list --flat 读回 | diff playerChanges | 对上? |
|---|---|---|---|
| 动作1 | | | 待填 |
| 动作2 | | | 待填 |
| … | | | 待填 |

- 用户复核结论（原文）：`待填`

## 3. §D 三栏汇总 + 修复轮

### 三栏汇总
- **已验证**：结构层=候选/回读/diff 全 PASS（明细见上表）；行为层=用户游戏确认 N 条（见上表原文）
- **未验证**：`待填`（如实列，不虚构）
- **需用户确认**：`待填`

### 修复轮记录（如有问题）
| 轮 | 症状 | hash 归因结论 | 根因（结构/用法/设计层） | 修复 | 复验 |
|---|---|---|---|---|---|
| R1 | L2 语义 create 带 `--write` 被拒：`writeRequiresUserConfirm=true (未执行)` | live SHA 未变=写被代码闸拦截（非结构损坏） | 设计层遗留：票05 open-item「create 新路径 --write 待用户定目标/ID 后单独启用」，代码未实现启用分支 | `src/cli/assets_ui.ts`：layout create 与语义 create 两处 `--write` 分支改为「须附 `--yes`」→ 走既有 `writeBack`（SHA 门+自动备份+Temp 同步）；无 `--yes` 保持拒绝（消息更新） | 无 `--yes` → 仍 writeRequiresUserConfirm；带 `--yes` → writePerformed=true、live SHA==candidate、Temp 同步、回读 PASS（=B1a） |
| R2 | B1a 游戏内为空按钮（素材未配置） | live SHA==写回后（结构在），非覆盖假象 | 用法/设计层 gap：create 复刻「编辑器新建默认形态」=素材空（票05 open-item：素材/文本配置 donor 未启用）；CLI 无「给按钮状态配素材」命令 | 用户确认方案=文字标签三态。取证 donor：重启7→8（常态组2041=文本框+图片）、重启26→28（悬浮组2044=单文本框；块缩放 悬停1.1/按下0.9 样本字节）。新实现 ui/src/button-materials.ts + button-material-donors.ts（donor 提取自真实快照）+ 断言/runner（ui/tests/button-materials-assert.ts、ui/verification/ticket09-r2-candidate.ts）：常态白字/悬停黄字(样本色)+1.1/按下灰字+0.9 | **候选写回 PASS**（live=Temp=`b2e3aa7b…`；备份 …/1073741917.gil.2026-09-03T16-06-45-106Z.bak；回读 常态1844/悬停1845/按下1846/禁用∅；断言 PASS；类型零错）。⏳ 待用户游戏复验 B1a |
| | | | | | |

> 注（build 环境）：全量 `npm run build` 仍被无关 WIP 阻塞（examples/football/dist-fb/src-fb/chan-selftest.gs.ts TS2769 等，非本改动）；
> 已用 tsc 全量 emit（noEmitOnError 未开，出错仍产出）刷新 dist 并整体换装（旧 dist 备份 `.gsts/dist.ui09-old/`），票08 关账时待 football 收口后重跑全量 build 复核（与票05 同口径）。

## 4. 收尾
- [ ] 全部 B 项游戏确认通过（原文可复查）
- [ ] C 读回逐项对上并经用户复核
- [ ] 本报告三栏完整
- [ ] 结果回灌票08 关账（复盘/PKC/技能回灌/知识书/覆盖登记/看板划掉/commit —— 08 统一执行）

> 快照/样本纪律：以上每步的 .gil 快照与 sha256 一并落盘（.gsts/diff-exp/<新图名>/），可复现、不覆盖。
