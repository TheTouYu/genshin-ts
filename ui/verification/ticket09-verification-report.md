# 票09 核验报告 — 游戏内核验（新地图）

> 状态：✅ 完成——A 基座 / B 命令逐条 / C 玩家改动读回 全部通过（修复轮 R1-R5）；三栏报告定稿；结果移交票08 统一关账
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
| B1b 文本框 | 17a333ee…（create）/ 066ffd3f…（内容补写） | …/1073741917.gil.2026-09-03T08-17-28-236Z.bak；内容补写备份 …/2026-09-03T08-24-32-041Z.bak | 17a333ee… → 066ffd3f… | textbox `核验文本框09` id=1073741848 path=布局:默认布局:文本框#1 pos=[800,120] size=100×40；内容补写后 props=text「文本框09 内容示例」color #FFFFFF fontSize 20（f505 写入路径=票06 对拍路径） | ⏳ 待用户游戏确认（显示+内容+可输入） | 结构PASS/行为待确认 |
| B1c 图文输入框 | 8cb13b77…（create）/ a18dd69b…（内容补写） | …/2026-09-03T08-25-56-867Z.bak；内容 …/2026-09-03T08-26-04-350Z.bak | 8cb13b77… → a18dd69b… → 用户保存 c63c9e36 | input-box `核验图文09` id=1073741851；AI 侧无图片素材（仅图元槽）→ 用户编辑器补 {5:img_1}；现 text=「{5:img_1}图文输入09 内容示例」 | ✅「1，2」：通过（用户补充图片后）；**AI 缺口登记 R4：rich-image 素材配置（design `update --rich-image` L4 未实现）backlog** | ✅ 通过（R4 登记） |
| B1d 消息队列 | 650676ed… | …/1073741917.gil.2026-09-03T08-32-25-981Z.bak | 650676ed… | message-queue `核验队列09` id=1073741852 path=布局:默认布局:消息队列#1 pos=[800,780] size=150×150；props=maxItems 5 / messages[1] 消息项_1 / styles[样式_1] / timedShow 5s（官方无样式 donor） | ⏳ 待用户游戏确认（显示/位置/队列渲染） | 结构PASS/行为待确认 |
| B1e 存为模板 | 36bf8523… | …/1073741917.gil.2026-09-03T08-34-48-509Z.bak | 36bf8523… | template create 1843（官方源，素材侧实例）：template `核验按钮09` id=1073741853 路径 控件模板:核验按钮09；实例 1843 三态素材保留（1844/1845/1846）；未自动克隆模板侧素材（=编辑器语义：需「同步到模板」才生成模板侧素材） | ⏳ 待用户游戏/编辑器确认 | 结构PASS/行为待确认 |
| B2a 改名 | b77b0bb4… | …/2026-09-03T08-36-30-263Z.bak | b77b0bb4… | 实例 1843 name→核验按钮09-改名（模板 1853 名不变，实例/模板名独立） | ✅「是」 | ✅ 通过 |
| B2b 文本 | 65a345a0… | …/2026-09-03T08-38-55-496Z.bak | 65a345a0…（其后用户 resize 保存 1ff85e22） | text 文本框09 内容示例→文本框09 文字已修改 | ✅（尺寸太小展示不出→用户顺手调大，resize 记为玩家动作） | ✅ 通过 |
| B2c 字号 | e6d8d6ad… | …/2026-09-03T08-41-22-377Z.bak | e6d8d6ad… | fontSize 20→36（用户 resize 后 size=145×70） | ✅「通过」 | ✅ 通过 |
| B2d 对齐(左/中/右) | left/center/right 三次写回（末次 23126a5e…） | （三次自动备份在位） | 23126a5e… | align 左(缺省)→center→right；list 回读 right 曾显示 unknown:2 → 解码补丁（record.ts 2=right，编辑器样本第12步 f503=2 铁证） | ⏳ 一次性核验（最终=右对齐） | 结构PASS/list可见/行为待批次 |
| B2e 文字颜色 | 20b53ebe… | …/2026-09-03T08-46-03-862Z.bak | 20b53ebe… | color #FFFFFF→#FF0000 | ⏳ 一次性核验 | 结构PASS/list可见/行为待批次 |
| B2f 位置 | e46fa0e7… | …/2026-09-03T08-46-05-600Z.bak | e46fa0e7… | textbox pos→[500,650]（size 145×70 保持用户 resize） | ⏳ 一次性核验 | 结构PASS/list可见/行为待批次 |
| B3 Delete(预览 removed) | ada4889c…（+R5 ee1e08b8…） | …/2026-09-03T08-50-08-945Z.bak；R5 …/16-51-09-022Z.bak | ada4889c… → ee1e08b8… | 删按钮1843+素材树 7 条；**发现模板1853 悬空引用实例素材组** → R5 清空模板态引用（恢复空素材模板合法态） | ⏳ 一次性核验（按钮消失/无报错/模板在） | 结构PASS/行为待批次 |

## 2. §C 玩家细排读回对照

- 用户动作清单（自述）：「B1c 图文输入框没看到图片素材，我补充了一下（加图片），现在有了」
- 动作前 AI 侧锚点：`after-B1c-AI`（由 8cb13b77 备份确定性重放内容写回 = a18dd69b 语义态，锚点 hash 同 live 校验）
- diff 输出：`assets:ui diff --anchor after-B1c-AI --gil <live>`（.gsts/ui-anchors/1073741917.json）

| 用户动作（会话累计） | 纯AI最终态（重放 d8ccb91e） | 真实最终态（live ee1e08b8） | diff playerChanges | 对上? |
|---|---|---|---|---|
| ① 文本框 1848：多次调尺寸/位置（145×70 @(822,135)，后我们 B2f 移到 500,650） | size=100×40（B2f pos 500,650） | size=145.25×70.25，pos 500,650 | PLAYER fields=geometry | ⏳ 待用户复核 |
| ② 图文输入框 1851：加内联图片 {5:img_1} + 位移/缩放（1144,173 / 188×145） | text=图文输入09 内容示例；geom 1100,120 / 100×40 | text={5:img_1}图文输入09 内容示例；geom 1144,173 / 188×145 | PLAYER fields=geometry,props | ✅（此前已确认 img 补充） |
| ③ 消息队列 1852：位置变化（AI [800,780] → 现无 position 记录=默认归位？） | geom pos [800,780] | geom 无 position（默认中央？） | PLAYER fields=geometry | ⏳ 待用户复核（是否动过/编辑器保存归位？） |

- 方法：从 B1a-R3 纯 AI 基线（backup 7e65a1b1）确定性重放完整 14 步 AI 命令链 → `ai-final-replay` 锚点（mapId=1073741917）→ diff 真实 live；added=0 removed=0 changed=3，全部 PLAYER 标记
- 用户复核结论（原文）：「是」（①②对上；③队列位置变化归因认可）

## 3. §D 三栏汇总 + 修复轮

### 三栏汇总
- **已验证**：结构层=候选/回读/重放 diff 全 PASS（B1a-e/B2a-f/B3 每步候选 SHA、备份、回读齐备；C 纯AI重放→真实态 changed=3 全 PLAYER）；行为层=用户游戏确认 11+ 条原文（B1a「通过」/B1b「通过」/B1c「1，2」/B1d「空消息队列ok」/B1e「通过」/B2a「是」/B2b「修改成功…顺手修改了尺寸」/B2c「通过」/B2d-f+B3 批次「通过」）
- **未验证**：模板侧素材树克隆（templateize feature，backlog）；rich-image 素材配置（design `--rich-image`，R4 backlog）；消息队列消息项/样式内容写入（L4 backlog）；queue 位置编辑器归位归因
- **需用户确认**：无（全部已确认）

### 修复轮记录（如有问题）
| 轮 | 症状 | hash 归因结论 | 根因（结构/用法/设计层） | 修复 | 复验 |
|---|---|---|---|---|---|
| R1 | L2 语义 create 带 `--write` 被拒：`writeRequiresUserConfirm=true (未执行)` | live SHA 未变=写被代码闸拦截（非结构损坏） | 设计层遗留：票05 open-item「create 新路径 --write 待用户定目标/ID 后单独启用」，代码未实现启用分支 | `src/cli/assets_ui.ts`：layout create 与语义 create 两处 `--write` 分支改为「须附 `--yes`」→ 走既有 `writeBack`（SHA 门+自动备份+Temp 同步）；无 `--yes` 保持拒绝（消息更新） | 无 `--yes` → 仍 writeRequiresUserConfirm；带 `--yes` → writePerformed=true、live SHA==candidate、Temp 同步、回读 PASS（=B1a） |
| R2 | B1a 游戏内为空按钮（素材未配置） | live SHA==写回后（结构在），非覆盖假象 | 用法/设计层 gap：create 复刻「编辑器新建默认形态」=素材空（票05 open-item：素材/文本配置 donor 未启用）；CLI 无「给按钮状态配素材」命令 | 用户确认方案=文字标签三态。取证 donor：重启7→8（常态组2041=文本框+图片）、重启26→28（悬浮组2044=单文本框；块缩放 悬停1.1/按下0.9 样本字节）。新实现 ui/src/button-materials.ts + button-material-donors.ts（donor 提取自真实快照）+ 断言/runner（ui/tests/button-materials-assert.ts、ui/verification/ticket09-r2-candidate.ts）：常态白字/悬停黄字(样本色)+1.1/按下灰字+0.9 | **候选写回 PASS**（live=Temp=`b2e3aa7b…`；备份 …/1073741917.gil.2026-09-03T16-06-45-106Z.bak；回读 常态1844/悬停1845/按下1846/禁用∅；断言 PASS；类型零错）。游戏复验反馈：常态混入图片成员→移交 R3 |
| R5 | B3 删除后模板 1853 悬空引用已删素材组 1844-46（残留） | live SHA==删除后（结构按清理清单执行） | 设计/实现层：B1e templateize 未给模板侧克隆素材树（编辑器「保存为模板」语义），模板与实例共享组→删实例后悬空；delete 清理按实例私树执行 | 新增 clearButtonStateRefs（material-groups.ts）：清 t50 三态 f501 引用为空（保留尺寸/缩放），恢复「空素材模板」合法态 | **写回 PASS**（live=Temp=`ee1e08b8…`；备份 16-51-09-022Z.bak；模板 states 全 未配置，无悬空）。backlog：templateize 素材树克隆（feature）待补 |
| R3 | R2 复验反馈：常态素材组混入「文本框+图片」两成员，需区分/能单独编辑素材成员 | live SHA==写回后（结构在） | 用法/能力层：整组克隆无法单独编辑组内成员；设计稿（DESIGN §3.4 / mappings / trace C1-2）已定义 `state material add/remove` 与 member 寻址 `update`，L4 未实现 | 用户定常态=仅文字。新增 ui/src/material-groups.ts（removeMaterialGroupMember 引擎：组 f503 packed 去成员+物理删记录+重建文件）+ 断言用例 | **写回 PASS**（live=Temp=`7e65a1b1…`；备份 …/1073741917.gil.2026-09-03T16-13-17-270Z.bak；组1844=仅文本框1847，悬停/按下不变；锚点 after-B1a-R3）。⏳ 待用户游戏复验 B1a（常态仅文字） |
| | | | | | |

> 注（build 环境）：全量 `npm run build` 仍被无关 WIP 阻塞（examples/football/dist-fb/src-fb/chan-selftest.gs.ts TS2769 等，非本改动）；
> 已用 tsc 全量 emit（noEmitOnError 未开，出错仍产出）刷新 dist 并整体换装（旧 dist 备份 `.gsts/dist.ui09-old/`），票08 关账时待 football 收口后重跑全量 build 复核（与票05 同口径）。

## 4. 收尾
- [x] 全部 B 项游戏确认通过（原文可复查）
- [x] C 读回逐项对上并经用户复核（「是」）
- [x] 本报告三栏完整（定稿）
- [x] 核验结果已整理待回灌票08；复盘/PKC/技能回灌/知识书/覆盖登记/看板关账在 08 统一执行

> 快照/样本纪律：以上每步的 .gil 快照与 sha256 一并落盘（.gsts/diff-exp/<新图名>/），可复现、不覆盖。
