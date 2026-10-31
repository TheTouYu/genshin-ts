# 俄罗斯方块（tetris）回归契约表 —— tests/ 70 个用例全量归纳

> **用途**：屎山重构时的「不能破的断言」清单。每个用例一行；日志字面量、控件名、断言机制都按文件实测抽取，可直接 `grep` 回验。
> **生成方式**：只读。脚本扫 `tests/*.json` 求和各类断言（命令见附录 B），人工只做「屏归属 + 要点」两列。
> **没有跑** `qxqy/runner.mjs` / `qxqy/build.mjs`（前者会把存档重写、后者重写 `tetris.save.json` 与 `device-package/*.gia`）；本表不改变任何行为，只描述当前用例集。
> **配套**：结构/风险面见 `.scratch/lead/refactor-audit.md`（同一批审计）；本表是它的「回归网」那一半。

## 0. 基线读数（先看这 8 行）

| 项 | 读数 | 出处 |
| --- | --- | --- |
| 用例文件 | **70 个** `tests/*.json` | `ls tests/*.json \| wc -l` |
| 断言总数 | **339 条**（log 225 / control 72 / lua 30 / tree 12） | 脚本统计 |
| 事件总数 | 961 条（key=905 / pointer=51 / click=5） | 脚本统计 |
| 断言时刻步长 `dt` | **全部 70 个用例 = 1/60 s**（`0.0166666…`） | 逐文件读 `dt` |
| 画布分布 | pc-16-9 ×35、mobile-16-9 ×27、mobile-19.5-9 ×6、pc-21-9 ×1、mobile-4-3 ×1 | 逐文件读 `canvasId` |
| 断言 kind 只有 4 种在用 | log / control / lua / tree；schema 支持的 `var` / `signal` **零使用** | `format.js:6`（支持的 kind）+ 本表统计（实际使用的 kind） |
| log 断言的比较方式只有 1 种 | **只有 `contains`（225/225）**；没有 `equals`、没有 `regex`；`level` 字段零使用 | 脚本统计 + `assert.js:70-81` |
| 音效断言 | 7 个用例写 `audioExpect`/`audioExclude`；覆盖 9 个 id（表里 18 个） | 脚本统计 + `lua/tetris/audio.lua` |

**编号瑕疵（重构时不要按编号想事情，按文件名）**：

- `tests/` 里有两个 **40**：`40-ai-takeover-death.json` 与 `40-settle-hotzone.json`。
- **59 缺号**：`docs/characters-design.md:600` 把 `59-char-switch-cd.json` 写进了拟定的用例清单，但仓里没有这个文件（`git log --all --diff-filter=D -- 'tests/59*'` 也是空 ⇒ 从未提交过）。
- 两个文件的 `name` 字段编号与文件名不符（历史重编号没同步）：`14-bag-randomizer.json` 的 `name` 以 **「13 7-bag」** 开头；`40-settle-hotzone.json` 的 `name` 以 **「34 v2.8 ④」** 开头。

**行号时效（必读）**：本表采样于 **2026-10-31 17:4x**，当时工作树里有**并行重构在飞**（`git status`：`M lua/main.lua` / `M lua/tetris/render.lua` / `M lua/tetris/view_board.lua` / `M qxqy/build.mjs` / `M qxqy/shots-v5.mjs`，新增 `lua/tetris/scenes.lua`），且此后仍在继续（写完时已出现 `lua/tetris/core_ai.lua` / `core_board.lua` / `core_pieces.lua` / `core_rng.lua` / `core_state.lua`）⇒ `main.lua` 行号持续漂移（采样期内已漂过：棋盘创建已移到 `lua/tetris/view_board.lua`）。因此：

- `tests/*.json`、`qxqy/runner.mjs`、模拟器 `studio/autotest/*.js` 的行号是**准的**（这些文件没在改）；
- `lua/` 的引用一律给 **「文件 + 锚字符串」**（锚是唯一可 `grep` 的子串），行号只作当刻参考；
- 本表描述的是**用例契约**，不承诺当前未提交工作树仍 70/70 全绿（那是 runner 的活，不是本表结论）。

**覆盖屏归属口径**：取值限定在 标题页/模式选择/说明页/倒计时/玩法主循环/消行与计分/结算页/角色档案/双屏(AI对战/PVP/合作)/移动端操作/技能/音频/存档与构建/其他 这 14 个里；每个用例给 **1 个主归属**（§4 统计只数主归属），跨屏的写进「次」列。

---

## 1. 用例总表（70 行）

| # | 文件名 | 主归属 | 次归属 | 断言类型 | 断言要点 |
| --- | --- | --- | --- | --- | --- |
| 1 | `01-board-200.json` | 玩法主循环 | — | log×2 + control×10 + tree×3 | 棋盘 200 格实例在场：cell1/100/200 tree；cell1 visible=true、kind=image、sizeDeltaX=28、锚点(-135,285)；cell11 y=255、cell200 x=135；底色 -197121 与落块色 -679876；hud 初始文案「得分 0　消行 0　等级 1　已填 0」 |
| 2 | `02-gravity-fall.json` | 玩法主循环 | — | log×2 | 固定步长重力：fall y=2 → fall y=3 两拍 |
| 3 | `03-move-left-right.json` | 玩法主循环 | — | log×4 | 左右移动列号：move x=3 → x=2 → x=3，且出块日志 piece= 存在 |
| 4 | `04-line-clear-score.json` | 消行与计分 | — | log×2 + control×2 | 调试填两行 → 硬降消 2 行：clear n=2 score=332；hud「已填 20」→「得分 332 消行 2 已填 4」 |
| 5 | `05-rotate-harddrop.json` | 玩法主循环 | — | log×2 + control×4 | 旋转 L + 硬降落格：lock L cells=196,175,185,195；hud 得分 34；cell195/196 变块色 -679876、cell1 保持底色 |
| 6 | `06-gameover-restart.json` | 玩法主循环 | 结算页 | log×2 + control×1 | 16 次硬降堆满 → gameover score=；按 R 重开后 hud 归零 + 重新出块（piece=） |
| 7 | `07-guide-stages.json` | 玩法主循环 | — | log×3 + control×10 | 引导三拍控件文案：topBanner「俄罗斯方块」→清空、hint「键盘操作」→「堆满一行即消除」→「一次消 4 行 +800」、botBanner 两条、keyA「← → 移动　　↑ 旋转」；日志 guide stage=1 / lock-tip / clear-tip；hud 364 |
| 8 | `08-click-pad.json` | 移动端操作 | — | log×10 | 拇指键五连点全部打到 act 链：phone tap left/rot/hard/soft/hold + rotate / harddrop rows= / hold in=；phone build n=19、phone layout w=1280 h=720 |
| 9 | `09-sfx-actions.json` | 音频 | — | log×4 + audio(expect 3, exclude 1) | 四动作各一条音效（audioExpect 50884/50883/50872，audioExclude 50917 消行音）+ 对应动作日志 newgame/move x=/rotate/lock |
| 10 | `10-shake-clear.json` | 音频 | 消行与计分 | log×4 + audio(expect 1, exclude 1) | 消 2 行：shake rows=2 amp=10 dur=0.2 → shake end；消行音 40001 必须播、落地音 50872 必须不播 |
| 11 | `11-score-level-combo.json` | 消行与计分 | — | log×4 + control×1 | 连击+等级倍率四档：332 → 712 → 2152 → 3282（combo 1/2/5/6，b2b=0）；hud 等级 2、已填 4 |
| 12 | `12-softdrop-harddrop.json` | 消行与计分 | — | log×1 + control×1 | 软降 3 格 + 硬降 14 格 = 31 分（重力不计分）；harddrop rows=14 |
| 13 | `13-ai-demo-full-chain.json` | 标题页 | 消行与计分 | log×3 + control×1 + lua×2 + audio(expect 2, exclude 1) | AI 自演链路：demo clear n=1 aiScore=100 aiLines=1、shake rows=1 amp=7 dur=0.18、guide stage=1、best「最高 0」；lua 断言 AI 得分≥400/消行≥4、接管后玩家分归零 |
| 14 | `14-bag-randomizer.json` | 玩法主循环 | — | log×1 + lua×1 | 7-bag 出块：40+ 块分 3 袋、每袋七种各一、13 块窗口保 7 种、首袋前 14 块固定序列 L,S,T,J,I,O,Z,T,O,J,L,Z,I,S；末段 gameover score= |
| 15 | `15-next-preview.json` | 玩法主循环 | — | log×1 + control×14 + tree×2 | NEXT 双块：next5/next8 tree；next1 sizeDeltaX=18 / next5=14；三帧颜色与锚点推进（含 next4/next8）；bag=1 piece=T x=4 y=1 |
| 16 | `16-hold-swap.json` | 玩法主循环 | — | log×7 + control×6 + tree×2 + lua×1 + audio(expect 1) | Hold：hold1/hold4 tree、hold in=L out=-、hold swap in=T out=L cur_drop=1、holdswap=1、out_drop=1；颜色 -339810 → -2774792；lua 断言 hold 事件恰好 2 次且自然块序列 L,S,T |
| 17 | `17-lock-delay.json` | 玩法主循环 | — | log×3 + lua×1 | 锁定延迟：ldstart 之后 0.5s 才 lock S（lua 断言 LD 期无其它 lock）；消 2 行 score=335 |
| 18 | `18-das-arr.json` | 玩法主循环 | — | log×1 + lua×1 | DAS/ARR：按住 ← 连移 3~4 次，最后一次停在左墙 x=1（lua 三条断言） |
| 19 | `19-ld-resets.json` | 玩法主循环 | — | log×2 + lua×1 | LD 期 DAS 连移不越过锁定：moves≥3、lock S 之后不得再出现 move |
| 20 | `20-ai-hard-rho.json` | 其他 | — | log×1 + lua×1 | AI 默认档（hard）消除率：demo auto n=100 + lua 断言 rho≥0.30、pieces≥100 |
| 21 | `21-ai-easy-rho.json` | 其他 | — | log×1 + lua×1 | 档位切换：demo level=easy 生效；lua 断言自演 rho∈[0.10,0.18] 且每块 ≥2.2s |
| 22 | `22-tspin.json` | 消行与计分 | — | log×4 + lua×1 | T-spin 前置链路：hold in=L out=-、bag=1 piece=T、rotate T、lock T + lua 反向断言全程无 tspin 误报 |
| 23 | `23-casual-takeover.json` | 技能 | — | log×3 | 休闲停手不再自动接管：mode=casual + 6.0s/8.0s 两处 takeover off (skill only) |
| 24 | `24-ai-battle-independent.json` | 双屏(AI对战/PVP/合作) | — | log×6 + control×1 | AI 盘独立出块：p2 inst ai-battle、p2 bag 递增、guide keys ai-battle/guide start；botBanner 键位文案（pc 版长句） |
| 25 | `25-ai-battle-dual-layout.json` | 双屏(AI对战/PVP/合作) | — | log×4 + control×4 | 双屏布局：layout dual、p2 cellCount=200、p2cell1 x=101 与 cell1 x=-371、keyA「AI 盘」；R 回菜单后 p2 destroy n=205、mode menu、cell1 回 -135 |
| 26 | `26-pvp-split-keys.json` | 双屏(AI对战/PVP/合作) | — | log×8 | PVP 双 ready+键位分区：mode=pvp、p2 inst pvp、guide keys pvp、guide count 3、guide start、p2 act=left/hard |
| 27 | `27-coop-roles.json` | 双屏(AI对战/PVP/合作) | — | log×9 | coop 双 ready+分工：mode=coop、p2 inst coop、guide keys coop/count 3/start；coop act=rot/hold p=1、left/hard p=2 |
| 28 | `28-garbage-attack.json` | 双屏(AI对战/PVP/合作) | 音频 | log×3 + audio(expect 2) | 垃圾行：玩家 2 消送 AI 盘 1 行（garbage n=1）+ 送出/受击音（audioExpect 40017/20004） |
| 29 | `29-menu-cards.json` | 模式选择 | — | log×3 + control×1 | 标题屏冒烟：menu dim board → Digit1 选休闲（mode=casual）→ guide stage=1 + botBanner 键位文案 |
| 30 | `30-das-keyup-guard.json` | 玩法主循环 | — | log×1 + lua×1 | DAS 无 Up 自愈：das stop reason=timeout，且最后一条 move 在 stop 之前（lua 两条断言） |
| 31 | `31-keys-guide-countdown.json` | 倒计时 | 双屏(AI对战/PVP/合作) | log×8 + control×1 | 双 ready → 3-2-1：guide ready p1/p2、count 3/2/1、countBig 文本「3」、guide start、guide stage=1 |
| 32 | `32-help-layer.json` | 说明页 | — | log×5 + control×7 | 说明页（委托板 A 版）控件文案八条：helpTitle「旅行者手册」、helpKey1「移动」、helpCardN1/2/3「休闲/AI 对抗/双人对战」、helpChipT11「消 1 行 = 100 分」、helpChipT21「× 等级：每 10 行 +1，上限 12」；guide help on/closed stage=0/off、menu help zone=ok |
| 33 | `33-modeover-freeze.json` | 双屏(AI对战/PVP/合作) | — | log×1 + control×4 | coop 引导分列：keyA「P1：W 旋转 · G 暂存」x=-280、keyB「P2：← → 移动 · ↓ 软降 · X 直落」x=+280 |
| 34 | `34-garbage-topout-fix.json` | 双屏(AI对战/PVP/合作) | — | log×1 + lua×1 | 垃圾行顶推不判负：garbage n= ≥5 轮且全程零 gameover/mode over（lua 两条断言） |
| 35 | `35-help-real-key.json` | 说明页 | — | log×3 | H 真键：开页 guide help on n= → 关页 guide help off n= → 按 1 进局 guide stage=1 |
| 36 | `36-menu-back-v.json` | 结算页 | 标题页 | log×4 | 结算页 V 回主页：mode menu → demo plan → 再按 2 进 AI 对抗（mode=ai-battle、layout dual） |
| 37 | `37-settle-r-casual.json` | 结算页 | — | log×3 + control×4 | 结算页三选项文案 + R 重开：settle hotzones n=3 v=P、optT1「[R] 再来一局」、optT2「[V] 回主页」、optT3「[Q] 结算明细」；restart mode=casual 后 hud 归零 |
| 38 | `38-settle-r-dual.json` | 结算页 | 双屏(AI对战/PVP/合作) | log×3 | 结算页 R 重开（ai-battle）：battle lose → restart mode=ai-battle → 重建对家盘 guide keys ai-battle |
| 39 | `39-click-no-restart.json` | 移动端操作 | 结算页 | log×4 + tree×2 | PC 端不建手机按钮：phone build skip device=pc、pbtnlefthit/pbtnhardhit 必须不存在、点旧坐标不重开（settle hotzones n=3 仍在）、V 回主页（menu back V / mode menu） |
| 40 | `40-ai-takeover-death.json` | 结算页 | — | log×4 | 停手顶满照常结算：takeover off (skill only) → gameover score= → settle build ok → settle anim done |
| 41 | `40-settle-hotzone.json` | 结算页 | — | log×5 | 结算鼠标热区：settle hotzones n=3 + gameover → click hotSettleV → hot settle V → menu back V → mode menu |
| 42 | `41-menu-hover.json` | 模式选择 | 音频 | log×5 + audio(expect 1) | 模式卡 hover/press 三态：menu hover i=1/i=3、hover out i=3、press i=1 → 进休闲 mode=casual；hover 音 50870 |
| 43 | `42-mode-theme.json` | 其他 | 标题页 | log×4 | 四模式主题背景换肤：bg pool n=、mode theme=ai-battle bg=、mode theme=casual bg=（进局换肤/回标题复位各一条） |
| 44 | `43-help-click.json` | 说明页 | — | log×4 | 说明页鼠标路径：点顶栏导航开页 + H 关页，各两次（guide help on n= / closed stage=0 交替四条） |
| 45 | `44-phone-hold.json` | 移动端操作 | — | log×4 | 手机长按连发：phone tap left → phone rep start id=left → phone rep done id=left → 松手后不再连移（move x= 一条） |
| 46 | `45-phone-help.json` | 移动端操作 | 说明页 | log×5 | 手机帮助闭环：点说明卡（menu help card tap）开页 → 点「合上手册」（tap help close）关页 → 再开页 |
| 47 | `46-phone-pad-note.json` | 移动端操作 | 模式选择 | log×3 + tree×1 + lua×1 | 手机模式入口规则：3 号卡弹「请回 PC」（pad note open which=3 + padNoteBtnHit tree）→ 关（pad note close which=3）→ 2 号卡直接进局；lua 断言 pad note 只开 1 次且 mode=ai-battle≥1 |
| 48 | `47-bg-cover-wide.json` | 其他 | 移动端操作 | log×3 | 宽画布满幅：mobile-19.5-9（1560×720）phone layout w=1560 h=720、bg cover ok bs=1.22、mode theme=casual bg=14/14 |
| 49 | `48-pad-keys.json` | 其他 | — | log×11 | 手柄：pad bind n=24；五个 Controller 事件映射 act=right/rot/soft/hold/hard；pad focus i=2/i=1；局内动作同时出 rotate / harddrop rows= |
| 50 | `49-help-close-pc.json` | 说明页 | — | log×3 | PC 说明页可见关闭入口：H 开页 → 点右上「合上手册」（tap help close）→ closed stage=0 |
| 51 | `50-ai-tune.json` | 其他 | — | log×5 | AI 调参表：ai tune pMistake=0,0,0、hold=1,1,1、simple=true、ai pace tier=3 lv=1 pace=、ai hold why= |
| 52 | `51-ai-attack.json` | 双屏(AI对战/PVP/合作) | — | log×2 | AI attack 模式：mode=ai-battle 后玩家盘堆高 → ai attack=true oppH= |
| 53 | `52-skills-nahida.json` | 技能 | — | log×5 | 纳西妲 Z 接管：effect=ai-takeover、skill ai start tier=；CD 内再按 ok=false effect=/why=cd；7.6s skill ai end |
| 54 | `53-skills-unlock-switch.json` | 技能 | — | log×5 | 调试解锁+换人+施放：skill unlock role=keqing ok=true、debug unlock all party=4、skill switch ok=true、cast effect=blink、skill blink col= |
| 55 | `54-skills-ganyu-freeze.json` | 技能 | — | log×3 | 甘雨冰封：cast effect=freeze、skill freeze rows=3 sec=3、到点 skill freeze end |
| 56 | `55-skills-columbina-solo.json` | 技能 | — | log×2 | 少女单人降级：cast effect=gravity-clear、skill clear_bottom rows=1 |
| 57 | `56-copy-levelup.json` | 其他 | 消行与计分 | log×1 + lua×1 | 升级文案：copy levelup lv=2，lua 断言同一次升级恰好播 1 次 |
| 58 | `57-copy-garbage.json` | 双屏(AI对战/PVP/合作) | 其他 | log×2 | 受击文案：ai attack=true oppH= → copy garbage recv n= |
| 59 | `58-roster.json` | 角色档案 | — | log×2 + tree×2 + lua×1 | 角色档案：char codex open n=、charTitle/btnroster.row2T tree；lua 断言四页签有字、第一条天赋「所闻遍计」、第二条非空、中列含「技能」；roster close |
| 60 | `60-mobile-ai-battle-entry.json` | 移动端操作 | 双屏(AI对战/PVP/合作) | log×1 + lua×2 | 移动端点「AI 对抗」（click menuZone2）真进局：mode=ai-battle；lua 断言无 pad note open、有 ai pace（双盘进场） |
| 61 | `61-mobile-phone-buttons.json` | 移动端操作 | — | log×2 + lua×1 | 移动画布真建手机按钮：lua 解析 phone build n=≥9 且 pad≥9、无 device=pc；点 ◀ 中心出 phone tap left |
| 62 | `62-ai-battle-takeover.json` | 技能 | 双屏(AI对战/PVP/合作) | log×3 + lua×2 | AI 对抗下 Z 接管：cast effect=ai-takeover、skill ai start 行含 mode=ai-battle、cast 后 ≥3 条 demo act、13.2s skill ai end role=nahida |
| 63 | `63-skill-audio-copy.json` | 技能 | 音频 | log×1 + lua×2 + audio(expect 1) | 技能反馈四件套：skill fx kind=cast ... fx=on copy=on；lua 断言正文非键位提示且 ≥4 字、stext 名卡有字；audioExpect 40441 |
| 64 | `64-title-demo-pace.json` | 标题页 | — | lua×2 | 标题 demo 节奏：lua 断言 demo pace total 行 ≥2 条且每块 <4s、demo act ≥6 |
| 65 | `65-mobile-help-toggle.json` | 移动端操作 | 说明页 | log×2 + lua×1 | 移动画布帮助页开/关：guide help on n= + lua 断言 helpTitle.visible、guide help closed stage= |
| 66 | `66-bg-cover-pc-16-9.json` | 其他 | — | log×1 + lua×1 | pc-16-9 背景覆盖达标：lua 断言 bg cover ok 行 w=1600 h=900 |
| 67 | `67-bg-cover-pc-21-9.json` | 其他 | — | log×1 + lua×1 | pc-21-9 背景覆盖达标：lua 断言 bg cover ok 行 w=2100 h=900 |
| 68 | `68-bg-cover-mobile-16-9.json` | 其他 | — | log×1 + lua×1 | mobile-16-9 背景覆盖达标：lua 断言 bg cover ok 行 w=1280 h=720 |
| 69 | `69-bg-cover-mobile-19.5-9.json` | 其他 | — | log×1 + lua×1 | mobile-19.5-9 背景覆盖达标：lua 断言 bg cover ok 行 w=1560 h=720 |
| 70 | `70-bg-cover-mobile-4-3.json` | 其他 | — | log×1 + lua×1 | mobile-4-3 背景覆盖达标：lua 断言 bg cover ok 行 w=1280 h=960 |

> 「断言类型」列由脚本按 JSON 现算（`log×N` 等），可与文件逐字对账；`audio(...)` 表示该用例在 runner 层另有音效断言。

---

## 2. 日志字面量清单（**日志文案 = 契约**）

### 2.1 `kind:"log"` 的 `contains` 原文（去重后 **154 条**，覆盖全部 225 条断言）

读法：`contains` 是**子串匹配**（`String(row.text).includes(assert.contains)`，`assert.js:76`），所以表里给的是**最小可匹配原文**；改日志时这些子串必须仍是输出行的一部分。

| # | contains 原文 | 断言数 | 出现用例 |
| --- | --- | --- | --- |
| 1 | `cellCount=200` | 1 | `01-board-200.json` |
| 2 | `newgame` | 2 | `01-board-200.json`, `09-sfx-actions.json` |
| 3 | `fall y=2` | 1 | `02-gravity-fall.json` |
| 4 | `fall y=3` | 1 | `02-gravity-fall.json` |
| 5 | `move x=3` | 3 | `03-move-left-right.json`, `03-move-left-right.json`, `18-das-arr.json` |
| 6 | `move x=2` | 1 | `03-move-left-right.json` |
| 7 | `piece=` | 2 | `03-move-left-right.json`, `06-gameover-restart.json` |
| 8 | `debug-fill` | 2 | `04-line-clear-score.json`, `10-shake-clear.json` |
| 9 | `clear n=2 score=332` | 2 | `04-line-clear-score.json`, `10-shake-clear.json` |
| 10 | `rotate L` | 1 | `05-rotate-harddrop.json` |
| 11 | `lock L cells=196,175,185,195` | 1 | `05-rotate-harddrop.json` |
| 12 | `gameover score=` | 4 | `06-gameover-restart.json`, `14-bag-randomizer.json`, `37-settle-r-casual.json`, `40-ai-takeover-death.json` |
| 13 | `guide stage=1` | 6 | `07-guide-stages.json`, `13-ai-demo-full-chain.json`, `29-menu-cards.json`, `31-keys-guide-countdown.json`, `32-help-layer.json`, `35-help-real-key.json` |
| 14 | `guide lock-tip` | 1 | `07-guide-stages.json` |
| 15 | `guide clear-tip` | 1 | `07-guide-stages.json` |
| 16 | `phone build n=19` | 1 | `08-click-pad.json` |
| 17 | `phone layout w=1280 h=720` | 1 | `08-click-pad.json` |
| 18 | `phone tap left` | 3 | `08-click-pad.json`, `44-phone-hold.json`, `61-mobile-phone-buttons.json` |
| 19 | `phone tap rot` | 1 | `08-click-pad.json` |
| 20 | `rotate` | 2 | `08-click-pad.json`, `48-pad-keys.json` |
| 21 | `phone tap hard` | 1 | `08-click-pad.json` |
| 22 | `harddrop rows=` | 2 | `08-click-pad.json`, `48-pad-keys.json` |
| 23 | `phone tap soft` | 1 | `08-click-pad.json` |
| 24 | `phone tap hold` | 1 | `08-click-pad.json` |
| 25 | `hold in=` | 1 | `08-click-pad.json` |
| 26 | `move x=` | 3 | `09-sfx-actions.json`, `26-pvp-split-keys.json`, `44-phone-hold.json` |
| 27 | `rotate ` | 1 | `09-sfx-actions.json` |
| 28 | `lock ` | 1 | `09-sfx-actions.json` |
| 29 | `shake rows=2 amp=10 dur=0.2` | 1 | `10-shake-clear.json` |
| 30 | `shake end` | 1 | `10-shake-clear.json` |
| 31 | `clear n=2 score=332 lines=2 combo=1 b2b=0` | 1 | `11-score-level-combo.json` |
| 32 | `clear n=2 score=712 lines=4 combo=2 b2b=0` | 1 | `11-score-level-combo.json` |
| 33 | `clear n=2 score=2152 lines=10 combo=5 b2b=0` | 1 | `11-score-level-combo.json` |
| 34 | `clear n=2 score=3282 lines=12 combo=6 b2b=0` | 1 | `11-score-level-combo.json` |
| 35 | `harddrop rows=14` | 1 | `12-softdrop-harddrop.json` |
| 36 | `demo clear n=1 aiScore=100 aiLines=1 combo=1 b2b=0` | 1 | `13-ai-demo-full-chain.json` |
| 37 | `shake rows=1 amp=7 dur=0.18` | 1 | `13-ai-demo-full-chain.json` |
| 38 | `bag=1 piece=T x=4 y=1` | 3 | `15-next-preview.json`, `16-hold-swap.json`, `22-tspin.json` |
| 39 | `hold in=L out=-` | 2 | `16-hold-swap.json`, `22-tspin.json` |
| 40 | `bag=1 piece=S x=4 y=1` | 1 | `16-hold-swap.json` |
| 41 | `lock S cells=` | 3 | `16-hold-swap.json`, `17-lock-delay.json`, `19-ld-resets.json` |
| 42 | `hold swap in=T out=L cur_drop=1` | 1 | `16-hold-swap.json` |
| 43 | `holdswap=1` | 1 | `16-hold-swap.json` |
| 44 | `hold swap out_drop=1` | 1 | `16-hold-swap.json` |
| 45 | `ldstart` | 2 | `17-lock-delay.json`, `19-ld-resets.json` |
| 46 | `clear n=2 score=335 lines=2 combo=1 b2b=0` | 1 | `17-lock-delay.json` |
| 47 | `demo auto n=100` | 1 | `20-ai-hard-rho.json` |
| 48 | `demo level=easy` | 1 | `21-ai-easy-rho.json` |
| 49 | `rotate T` | 1 | `22-tspin.json` |
| 50 | `lock T cells=` | 1 | `22-tspin.json` |
| 51 | `mode=casual` | 4 | `23-casual-takeover.json`, `29-menu-cards.json`, `41-menu-hover.json`, `48-pad-keys.json` |
| 52 | `takeover off (skill only)` | 3 | `23-casual-takeover.json`, `23-casual-takeover.json`, `40-ai-takeover-death.json` |
| 53 | `mode=ai-battle` | 6 | `24-ai-battle-independent.json`, `28-garbage-attack.json`, `36-menu-back-v.json`, `46-phone-pad-note.json`, `51-ai-attack.json`, `60-mobile-ai-battle-entry.json` |
| 54 | `p2 inst ai-battle` | 1 | `24-ai-battle-independent.json` |
| 55 | `guide keys ai-battle` | 2 | `24-ai-battle-independent.json`, `38-settle-r-dual.json` |
| 56 | `guide start` | 5 | `24-ai-battle-independent.json`, `26-pvp-split-keys.json`, `27-coop-roles.json`, `28-garbage-attack.json`, `31-keys-guide-countdown.json` |
| 57 | `p2 bag=1 piece=` | 1 | `24-ai-battle-independent.json` |
| 58 | `p2 bag=` | 1 | `24-ai-battle-independent.json` |
| 59 | `layout dual` | 2 | `25-ai-battle-dual-layout.json`, `36-menu-back-v.json` |
| 60 | `p2 cellCount=200` | 1 | `25-ai-battle-dual-layout.json` |
| 61 | `p2 destroy n=205` | 1 | `25-ai-battle-dual-layout.json` |
| 62 | `mode menu` | 4 | `25-ai-battle-dual-layout.json`, `36-menu-back-v.json`, `39-click-no-restart.json`, `40-settle-hotzone.json` |
| 63 | `mode=pvp` | 1 | `26-pvp-split-keys.json` |
| 64 | `p2 inst pvp` | 1 | `26-pvp-split-keys.json` |
| 65 | `guide keys pvp` | 2 | `26-pvp-split-keys.json`, `31-keys-guide-countdown.json` |
| 66 | `guide count 3` | 3 | `26-pvp-split-keys.json`, `27-coop-roles.json`, `31-keys-guide-countdown.json` |
| 67 | `p2 act=left` | 1 | `26-pvp-split-keys.json` |
| 68 | `p2 act=hard` | 1 | `26-pvp-split-keys.json` |
| 69 | `mode=coop` | 1 | `27-coop-roles.json` |
| 70 | `p2 inst coop` | 1 | `27-coop-roles.json` |
| 71 | `guide keys coop` | 2 | `27-coop-roles.json`, `33-modeover-freeze.json` |
| 72 | `coop act=rot p=1` | 1 | `27-coop-roles.json` |
| 73 | `coop act=hold p=1` | 1 | `27-coop-roles.json` |
| 74 | `coop act=left p=2` | 1 | `27-coop-roles.json` |
| 75 | `coop act=hard p=2` | 1 | `27-coop-roles.json` |
| 76 | `garbage n=1` | 1 | `28-garbage-attack.json` |
| 77 | `menu dim board` | 1 | `29-menu-cards.json` |
| 78 | `das stop reason=timeout` | 1 | `30-das-keyup-guard.json` |
| 79 | `guide ready p1` | 1 | `31-keys-guide-countdown.json` |
| 80 | `guide ready p2` | 1 | `31-keys-guide-countdown.json` |
| 81 | `guide count 2` | 1 | `31-keys-guide-countdown.json` |
| 82 | `guide count 1` | 1 | `31-keys-guide-countdown.json` |
| 83 | `guide help on n=` | 8 | `32-help-layer.json`, `35-help-real-key.json`, `43-help-click.json`, `43-help-click.json`, `45-phone-help.json`, `45-phone-help.json`, `49-help-close-pc.json`, `65-mobile-help-toggle.json` |
| 84 | `guide help closed stage=0` | 5 | `32-help-layer.json`, `43-help-click.json`, `43-help-click.json`, `45-phone-help.json`, `49-help-close-pc.json` |
| 85 | `guide help off n=` | 2 | `32-help-layer.json`, `35-help-real-key.json` |
| 86 | `menu help zone=ok` | 1 | `32-help-layer.json` |
| 87 | `garbage n=` | 1 | `34-garbage-topout-fix.json` |
| 88 | `demo plan` | 1 | `36-menu-back-v.json` |
| 89 | `settle hotzones n=3 v=P` | 1 | `37-settle-r-casual.json` |
| 90 | `restart mode=casual` | 1 | `37-settle-r-casual.json` |
| 91 | `battle lose` | 1 | `38-settle-r-dual.json` |
| 92 | `restart mode=ai-battle` | 1 | `38-settle-r-dual.json` |
| 93 | `phone build skip device=pc` | 1 | `39-click-no-restart.json` |
| 94 | `settle hotzones n=3` | 2 | `39-click-no-restart.json`, `40-settle-hotzone.json` |
| 95 | `menu back V` | 2 | `39-click-no-restart.json`, `40-settle-hotzone.json` |
| 96 | `settle build ok` | 1 | `40-ai-takeover-death.json` |
| 97 | `settle anim done` | 1 | `40-ai-takeover-death.json` |
| 98 | `gameover` | 1 | `40-settle-hotzone.json` |
| 99 | `hot settle V` | 1 | `40-settle-hotzone.json` |
| 100 | `menu hover i=1` | 1 | `41-menu-hover.json` |
| 101 | `menu hover i=3` | 1 | `41-menu-hover.json` |
| 102 | `menu hover out i=3` | 1 | `41-menu-hover.json` |
| 103 | `menu press i=1` | 1 | `41-menu-hover.json` |
| 104 | `bg pool n=` | 1 | `42-mode-theme.json` |
| 105 | `mode theme=ai-battle bg=` | 1 | `42-mode-theme.json` |
| 106 | `mode theme=casual bg=` | 2 | `42-mode-theme.json`, `42-mode-theme.json` |
| 107 | `phone rep start id=left` | 1 | `44-phone-hold.json` |
| 108 | `phone rep done id=left` | 1 | `44-phone-hold.json` |
| 109 | `menu help card tap` | 1 | `45-phone-help.json` |
| 110 | `tap help close` | 2 | `45-phone-help.json`, `49-help-close-pc.json` |
| 111 | `pad note open which=3` | 1 | `46-phone-pad-note.json` |
| 112 | `pad note close which=3` | 1 | `46-phone-pad-note.json` |
| 113 | `phone layout w=1560 h=720` | 1 | `47-bg-cover-wide.json` |
| 114 | `bg cover ok bs=1.22` | 1 | `47-bg-cover-wide.json` |
| 115 | `mode theme=casual bg=14/14` | 1 | `47-bg-cover-wide.json` |
| 116 | `pad bind n=24` | 1 | `48-pad-keys.json` |
| 117 | `pad ev ControllerCraftspersonKey2Down act=right` | 1 | `48-pad-keys.json` |
| 118 | `pad focus i=2` | 1 | `48-pad-keys.json` |
| 119 | `pad focus i=1` | 1 | `48-pad-keys.json` |
| 120 | `pad ev ControllerJumpKeyDown act=rot` | 1 | `48-pad-keys.json` |
| 121 | `pad ev ControllerCharacterSkill1KeyDown act=soft` | 1 | `48-pad-keys.json` |
| 122 | `pad ev ControllerCharacterSkill2KeyDown act=hold` | 1 | `48-pad-keys.json` |
| 123 | `pad ev ControllerNormalAttackKeyDown act=hard` | 1 | `48-pad-keys.json` |
| 124 | `ai tune pMistake=0,0,0` | 1 | `50-ai-tune.json` |
| 125 | `hold=1,1,1` | 1 | `50-ai-tune.json` |
| 126 | `simple=true` | 1 | `50-ai-tune.json` |
| 127 | `ai pace tier=3 lv=1 pace=` | 1 | `50-ai-tune.json` |
| 128 | `ai hold why=` | 1 | `50-ai-tune.json` |
| 129 | `ai attack=true oppH=` | 2 | `51-ai-attack.json`, `57-copy-garbage.json` |
| 130 | `effect=ai-takeover` | 1 | `52-skills-nahida.json` |
| 131 | `skill ai start tier=` | 2 | `52-skills-nahida.json`, `62-ai-battle-takeover.json` |
| 132 | `ok=false effect=` | 1 | `52-skills-nahida.json` |
| 133 | `why=cd` | 1 | `52-skills-nahida.json` |
| 134 | `skill ai end` | 1 | `52-skills-nahida.json` |
| 135 | `skill unlock role=keqing ok=true` | 1 | `53-skills-unlock-switch.json` |
| 136 | `skill debug unlock all party=4` | 1 | `53-skills-unlock-switch.json` |
| 137 | `skill switch ok=true` | 1 | `53-skills-unlock-switch.json` |
| 138 | `skill cast slot=1 role=keqing ok=true effect=blink` | 1 | `53-skills-unlock-switch.json` |
| 139 | `skill blink col=` | 1 | `53-skills-unlock-switch.json` |
| 140 | `skill cast slot=1 role=ganyu ok=true effect=freeze` | 1 | `54-skills-ganyu-freeze.json` |
| 141 | `skill freeze rows=3 sec=3` | 1 | `54-skills-ganyu-freeze.json` |
| 142 | `skill freeze end` | 1 | `54-skills-ganyu-freeze.json` |
| 143 | `skill cast slot=1 role=columbina ok=true effect=gravity-clear` | 1 | `55-skills-columbina-solo.json` |
| 144 | `skill clear_bottom rows=1` | 1 | `55-skills-columbina-solo.json` |
| 145 | `copy levelup lv=2` | 1 | `56-copy-levelup.json` |
| 146 | `copy garbage recv n=` | 1 | `57-copy-garbage.json` |
| 147 | `char codex open n=` | 1 | `58-roster.json` |
| 148 | `roster close` | 1 | `58-roster.json` |
| 149 | `phone build n=` | 1 | `61-mobile-phone-buttons.json` |
| 150 | `skill cast slot=1 role=nahida ok=true effect=ai-takeover` | 1 | `62-ai-battle-takeover.json` |
| 151 | `skill ai end role=nahida` | 1 | `62-ai-battle-takeover.json` |
| 152 | `skill fx kind=cast role=nahida fx=on copy=on` | 1 | `63-skill-audio-copy.json` |
| 153 | `guide help closed stage=` | 1 | `65-mobile-help-toggle.json` |
| 154 | `bg cover ok bs=` | 5 | `66-bg-cover-pc-16-9.json`, `67-bg-cover-pc-21-9.json`, `68-bg-cover-mobile-16-9.json`, `69-bg-cover-mobile-19.5-9.json`, `70-bg-cover-mobile-4-3.json` |

### 2.1b 逐文件出现明细（225 条断言的完整视图）

- `01-board-200.json`（2 条）：`cellCount=200`、`newgame`
- `02-gravity-fall.json`（2 条）：`fall y=2`、`fall y=3`
- `03-move-left-right.json`（4 条）：`move x=3`、`move x=2`、`move x=3`、`piece=`
- `04-line-clear-score.json`（2 条）：`debug-fill`、`clear n=2 score=332`
- `05-rotate-harddrop.json`（2 条）：`rotate L`、`lock L cells=196,175,185,195`
- `06-gameover-restart.json`（2 条）：`gameover score=`、`piece=`
- `07-guide-stages.json`（3 条）：`guide stage=1`、`guide lock-tip`、`guide clear-tip`
- `08-click-pad.json`（10 条）：`phone build n=19`、`phone layout w=1280 h=720`、`phone tap left`、`phone tap rot`、`rotate`、`phone tap hard`、`harddrop rows=`、`phone tap soft`、`phone tap hold`、`hold in=`
- `09-sfx-actions.json`（4 条）：`newgame`、`move x=`、`rotate `、`lock `
- `10-shake-clear.json`（4 条）：`debug-fill`、`clear n=2 score=332`、`shake rows=2 amp=10 dur=0.2`、`shake end`
- `11-score-level-combo.json`（4 条）：`clear n=2 score=332 lines=2 combo=1 b2b=0`、`clear n=2 score=712 lines=4 combo=2 b2b=0`、`clear n=2 score=2152 lines=10 combo=5 b2b=0`、`clear n=2 score=3282 lines=12 combo=6 b2b=0`
- `12-softdrop-harddrop.json`（1 条）：`harddrop rows=14`
- `13-ai-demo-full-chain.json`（3 条）：`demo clear n=1 aiScore=100 aiLines=1 combo=1 b2b=0`、`shake rows=1 amp=7 dur=0.18`、`guide stage=1`
- `14-bag-randomizer.json`（1 条）：`gameover score=`
- `15-next-preview.json`（1 条）：`bag=1 piece=T x=4 y=1`
- `16-hold-swap.json`（7 条）：`hold in=L out=-`、`bag=1 piece=S x=4 y=1`、`lock S cells=`、`bag=1 piece=T x=4 y=1`、`hold swap in=T out=L cur_drop=1`、`holdswap=1`、`hold swap out_drop=1`
- `17-lock-delay.json`（3 条）：`ldstart`、`lock S cells=`、`clear n=2 score=335 lines=2 combo=1 b2b=0`
- `18-das-arr.json`（1 条）：`move x=3`
- `19-ld-resets.json`（2 条）：`ldstart`、`lock S cells=`
- `20-ai-hard-rho.json`（1 条）：`demo auto n=100`
- `21-ai-easy-rho.json`（1 条）：`demo level=easy`
- `22-tspin.json`（4 条）：`hold in=L out=-`、`bag=1 piece=T x=4 y=1`、`rotate T`、`lock T cells=`
- `23-casual-takeover.json`（3 条）：`mode=casual`、`takeover off (skill only)`、`takeover off (skill only)`
- `24-ai-battle-independent.json`（6 条）：`mode=ai-battle`、`p2 inst ai-battle`、`guide keys ai-battle`、`guide start`、`p2 bag=1 piece=`、`p2 bag=`
- `25-ai-battle-dual-layout.json`（4 条）：`layout dual`、`p2 cellCount=200`、`p2 destroy n=205`、`mode menu`
- `26-pvp-split-keys.json`（8 条）：`mode=pvp`、`p2 inst pvp`、`guide keys pvp`、`guide count 3`、`guide start`、`p2 act=left`、`p2 act=hard`、`move x=`
- `27-coop-roles.json`（9 条）：`mode=coop`、`p2 inst coop`、`guide keys coop`、`guide count 3`、`guide start`、`coop act=rot p=1`、`coop act=hold p=1`、`coop act=left p=2`、`coop act=hard p=2`
- `28-garbage-attack.json`（3 条）：`mode=ai-battle`、`guide start`、`garbage n=1`
- `29-menu-cards.json`（3 条）：`menu dim board`、`mode=casual`、`guide stage=1`
- `30-das-keyup-guard.json`（1 条）：`das stop reason=timeout`
- `31-keys-guide-countdown.json`（8 条）：`guide keys pvp`、`guide ready p1`、`guide ready p2`、`guide count 3`、`guide count 2`、`guide count 1`、`guide start`、`guide stage=1`
- `32-help-layer.json`（5 条）：`guide help on n=`、`guide help closed stage=0`、`guide help off n=`、`guide stage=1`、`menu help zone=ok`
- `33-modeover-freeze.json`（1 条）：`guide keys coop`
- `34-garbage-topout-fix.json`（1 条）：`garbage n=`
- `35-help-real-key.json`（3 条）：`guide help on n=`、`guide help off n=`、`guide stage=1`
- `36-menu-back-v.json`（4 条）：`mode menu`、`demo plan`、`mode=ai-battle`、`layout dual`
- `37-settle-r-casual.json`（3 条）：`gameover score=`、`settle hotzones n=3 v=P`、`restart mode=casual`
- `38-settle-r-dual.json`（3 条）：`battle lose`、`restart mode=ai-battle`、`guide keys ai-battle`
- `39-click-no-restart.json`（4 条）：`phone build skip device=pc`、`settle hotzones n=3`、`menu back V`、`mode menu`
- `40-ai-takeover-death.json`（4 条）：`takeover off (skill only)`、`gameover score=`、`settle build ok`、`settle anim done`
- `40-settle-hotzone.json`（5 条）：`settle hotzones n=3`、`gameover`、`hot settle V`、`menu back V`、`mode menu`
- `41-menu-hover.json`（5 条）：`menu hover i=1`、`menu hover i=3`、`menu hover out i=3`、`menu press i=1`、`mode=casual`
- `42-mode-theme.json`（4 条）：`bg pool n=`、`mode theme=ai-battle bg=`、`mode theme=casual bg=`、`mode theme=casual bg=`
- `43-help-click.json`（4 条）：`guide help on n=`、`guide help closed stage=0`、`guide help on n=`、`guide help closed stage=0`
- `44-phone-hold.json`（4 条）：`phone tap left`、`phone rep start id=left`、`phone rep done id=left`、`move x=`
- `45-phone-help.json`（5 条）：`menu help card tap`、`guide help on n=`、`tap help close`、`guide help closed stage=0`、`guide help on n=`
- `46-phone-pad-note.json`（3 条）：`pad note open which=3`、`pad note close which=3`、`mode=ai-battle`
- `47-bg-cover-wide.json`（3 条）：`phone layout w=1560 h=720`、`bg cover ok bs=1.22`、`mode theme=casual bg=14/14`
- `48-pad-keys.json`（11 条）：`pad bind n=24`、`pad ev ControllerCraftspersonKey2Down act=right`、`pad focus i=2`、`pad focus i=1`、`mode=casual`、`pad ev ControllerJumpKeyDown act=rot`、`rotate`、`pad ev ControllerCharacterSkill1KeyDown act=soft`、`pad ev ControllerCharacterSkill2KeyDown act=hold`、`pad ev ControllerNormalAttackKeyDown act=hard`、`harddrop rows=`
- `49-help-close-pc.json`（3 条）：`guide help on n=`、`tap help close`、`guide help closed stage=0`
- `50-ai-tune.json`（5 条）：`ai tune pMistake=0,0,0`、`hold=1,1,1`、`simple=true`、`ai pace tier=3 lv=1 pace=`、`ai hold why=`
- `51-ai-attack.json`（2 条）：`mode=ai-battle`、`ai attack=true oppH=`
- `52-skills-nahida.json`（5 条）：`effect=ai-takeover`、`skill ai start tier=`、`ok=false effect=`、`why=cd`、`skill ai end`
- `53-skills-unlock-switch.json`（5 条）：`skill unlock role=keqing ok=true`、`skill debug unlock all party=4`、`skill switch ok=true`、`skill cast slot=1 role=keqing ok=true effect=blink`、`skill blink col=`
- `54-skills-ganyu-freeze.json`（3 条）：`skill cast slot=1 role=ganyu ok=true effect=freeze`、`skill freeze rows=3 sec=3`、`skill freeze end`
- `55-skills-columbina-solo.json`（2 条）：`skill cast slot=1 role=columbina ok=true effect=gravity-clear`、`skill clear_bottom rows=1`
- `56-copy-levelup.json`（1 条）：`copy levelup lv=2`
- `57-copy-garbage.json`（2 条）：`ai attack=true oppH=`、`copy garbage recv n=`
- `58-roster.json`（2 条）：`char codex open n=`、`roster close`
- `60-mobile-ai-battle-entry.json`（1 条）：`mode=ai-battle`
- `61-mobile-phone-buttons.json`（2 条）：`phone build n=`、`phone tap left`
- `62-ai-battle-takeover.json`（3 条）：`skill cast slot=1 role=nahida ok=true effect=ai-takeover`、`skill ai start tier=`、`skill ai end role=nahida`
- `63-skill-audio-copy.json`（1 条）：`skill fx kind=cast role=nahida fx=on copy=on`
- `65-mobile-help-toggle.json`（2 条）：`guide help on n=`、`guide help closed stage=`
- `66-bg-cover-pc-16-9.json`（1 条）：`bg cover ok bs=`
- `67-bg-cover-pc-21-9.json`（1 条）：`bg cover ok bs=`
- `68-bg-cover-mobile-16-9.json`（1 条）：`bg cover ok bs=`
- `69-bg-cover-mobile-19.5-9.json`（1 条）：`bg cover ok bs=`
- `70-bg-cover-mobile-4-3.json`（1 条）：`bg cover ok bs=`

### 2.2 `kind:"lua"` 断言里内嵌的日志模式（同样是契约，改日志会先把这些打红）

这些断言不是 `contains`，而是 Lua 正则/前缀匹配（`line:match('...')` / `l:find('...',1,true)`）。**它们对格式的约束比 contains 更硬**——例如 `^move x=%d+$` 要求整行只有这个形态。

| # | 文件 | @at | 内嵌模式（原文） | 断言什么 |
| --- | --- | --- | --- | --- |
| 1 | `13-ai-demo-full-chain.json` | 45 | `得分%s*(%d+)` / `消行%s*(%d+)` / `等级` | hud 文本解析：score≥400、lines≥4、含「等级」 |
| 2 | `13-ai-demo-full-chain.json` | 46.6 | `得分%s*(%d+)` / `已填` | 接管后玩家 score==0 且仍含「已填」 |
| 3 | `14-bag-randomizer.json` | 15.4 | `^bag=(%d+) piece=(%u)` | bag 日志解析：≥40 块 / 3 段 / 每袋七种各一 / 13 窗口保 7 种 / 首 14 块固定序列 |
| 4 | `16-hold-swap.json` | 1.05 | `^hold in=` / `^hold swap in=` / `^hold forced` / `^bag=(%d+) piece=(%u) x=%d+ y=%d+$` | hold 事件恰好 2 次；自然块序列 == L,S,T（hold 不污染 bag） |
| 5 | `17-lock-delay.json` | 10.1 | `^ldstart` / `^lock S ` / `^lock ` | ldstart 之后才 lock S，且 LD 区间内无其它 lock |
| 6 | `18-das-arr.json` | 1.5 | `^move x=(%d+)$` | move 次数 3~4 且最后一次 x=1（撞左墙停） |
| 7 | `19-ld-resets.json` | 10.8 | `^move x=%d+$` / `^lock S ` / `^move x=%d+$` | moves≥3；lock S 之后不得再出现 move |
| 8 | `20-ai-hard-rho.json` | 235 | `rho=([%d%.]+) pieces=(%d+)` | rho≥0.30 且 pieces≥100 |
| 9 | `21-ai-easy-rho.json` | 235 | `rho=([%d%.]+) pieces=(%d+)` / `avg=([%d%.]+)s` | rho∈[0.10,0.18] 且 avg≥2.2s |
| 10 | `22-tspin.json` | 5.6 | `^tspin` | 反向断言：全程无 tspin 误报 |
| 11 | `30-das-keyup-guard.json` | 1.5 | `^move x=%d+$` / `^das stop reason=timeout` | 有 das stop reason=timeout，且最后一条 move 在 stop 之前 |
| 12 | `34-garbage-topout-fix.json` | 22 | `^garbage n=` / `gameover` / `mode over` | garbage 轮次≥5 且零 gameover/mode over |
| 13 | `46-phone-pad-note.json` | 4.0 | `pad note open` / `mode=ai-battle` | pad note open 恰好 1 次且 mode=ai-battle≥1 |
| 14 | `56-copy-levelup.json` | 3.0 | `^copy levelup lv=2` | copy levelup lv=2 恰好 1 次 |
| 15 | `58-roster.json` | 1.0 | `刻晴` / `所闻遍计` / `技能` | 四页签有字 + 天赋第一条「所闻遍计」+ 第二条非空 + 中列含「技能」 |
| 16 | `60-mobile-ai-battle-entry.json` | 1.6 | （不解析日志，只读控件/布尔） | 无 pad note open（未被移动端拦截） |
| 17 | `60-mobile-ai-battle-entry.json` | 4.6 | `ai pace` | 存在 ai pace 行（双盘已进场） |
| 18 | `61-mobile-phone-buttons.json` | 1.0 | `phone build n=` / `phone build n=(%d+)` / `pad=(%d+)` | phone build n≥9 且 pad≥9，且无 device=pc |
| 19 | `62-ai-battle-takeover.json` | 6.8 | `skill ai start` / `mode=ai-battle` | skill ai start 行内含 mode=ai-battle |
| 20 | `62-ai-battle-takeover.json` | 9.6 | `skill ai start` / `demo act` | cast 之后 demo act ≥3 条 |
| 21 | `63-skill-audio-copy.json` | 1.3 | `移动` / `旋转` | 正文非空、非键位提示、≥4 字（ibotBanner 或 botBanner） |
| 22 | `63-skill-audio-copy.json` | 1.3 | （不解析日志，只读控件/布尔） | stext 名卡有文字 |
| 23 | `64-title-demo-pace.json` | 9.0 | `demo pace.-total=(%d+%.?%d*)` | demo pace total 行 ≥2 条且每块 <4.0s |
| 24 | `64-title-demo-pace.json` | 9.0 | `demo act` | demo act ≥6 条 |
| 25 | `65-mobile-help-toggle.json` | 1.3 | （不解析日志，只读控件/布尔） | helpTitle 可见（visible 真值） |
| 26 | `66-bg-cover-pc-16-9.json` | 2.6 | `bg cover ok` / `w=(%d+)` / `h=(%d+)` | bg cover ok 行 w==1600 且 h==900 |
| 27 | `67-bg-cover-pc-21-9.json` | 2.6 | `bg cover ok` / `w=(%d+)` / `h=(%d+)` | bg cover ok 行 w==2100 且 h==900 |
| 28 | `68-bg-cover-mobile-16-9.json` | 2.6 | `bg cover ok` / `w=(%d+)` / `h=(%d+)` | bg cover ok 行 w==1280 且 h==720 |
| 29 | `69-bg-cover-mobile-19.5-9.json` | 2.6 | `bg cover ok` / `w=(%d+)` / `h=(%d+)` | bg cover ok 行 w==1560 且 h==720 |
| 30 | `70-bg-cover-mobile-4-3.json` | 2.6 | `bg cover ok` / `w=(%d+)` / `h=(%d+)` | bg cover ok 行 w==1280 且 h==960 |

### 2.3 音效契约（runner 层，不在 assert 数组里）

| 文件 | audioExpect（必须有） | audioExclude（必须没有） | 语义 |
| --- | --- | --- | --- |
| `09-sfx-actions.json` | [50884, 50883, 50872] | [50917] | 移动=20007 / 旋转=20008 / 落地=20004；本局先按 R 清盘 ⇒ 硬降不可能消行，所以落地音一定播、消行音一定不播 |
| `10-shake-clear.json` | [40001] | [50872] | 2 行消行音=20002；落地音被消行音顶掉（同一帧不叠两条），所以 20004 必须不出现 |
| `13-ai-demo-full-chain.json` | [50917, 50872] | [50929] | v2.5：默认档改 hard 且 stage0 自演恒 hard（aiTickCore 第三参强制，演示即最强）——首消提前到 7.7s，45s 内消 9 行、盘面已填 6（极净）；hold 音 50883 出现（hard hold 生效实证）。 |
| `16-hold-swap.json` | [50883] | — | （该用例没有 note 字段）hold 换块音 50883 必须出现 |
| `28-garbage-attack.json` | [40017, 20004] | — | （无 note 字段）垃圾送出 40017 + 受击 20004 都必须出现 |
| `41-menu-hover.json` | [50870] | — | （无 note 字段）标题卡悬停音 50870 必须出现 |
| `63-skill-audio-copy.json` | [40441] | — | 文案通道实证：人味正文写进 FX 实例 ibotBanner（本次实测「还在落，别急，我数着。」），名卡标题写进 FX 池的 stext 实例（「纳西妲」+「标准代打 · 6 秒」）；服务端布局层 topBanner/botBanner 在实战里可能为空，所以断言按「任一通道有字 + 排除还是键位提… |

> 音效 id 语义的唯一真源是 `lua/tetris/audio.lua:14` 的 `SFX` 表（move=50884 / rotate=50883 / lock=50872 / 消行按行数 4 档在 `SFX_CLEAR`）。

> ⚠ **`note` 字段里的 id 是旧编号，别当契约**：`09` 的 note 写「移动=20007 / 旋转=20008 / 落地=20004」，而同一文件的 `audioExpect` 是 `[50884, 50883, 50872]`、`audio.lua` 也是 50884/50883/50872；`10` 的 note 写「2 行消行音=20002」，实际 `audioExpect=[40001]`、`SFX_CLEAR[2]=40001`；`13` 的 note 说「hold 音 50883 出现」，但它的 `audioExpect` 只有 `[50917, 50872]`（50883 未被断言）。⇒ **以 `audioExpect` + `audio.lua` 为准，note 只读语义。**

---

## 3. 控件名清单（tree / control / lua 断言涉及的全部名字）

### 3.1 服务端 textbox 名（按 `name` 寻址，`GetChild` 路径）

`lua/main.lua` 文件头：「所有文字（logo/统计/键位卡/提示/上下横幅）都是**服务端 textbox**，按 name 寻址」；声明表锚 `title, hud, hudNext, best, hint, keyA, keyB, keyC, topBanner, botBanner =`（采样时 `main.lua:235`），样式表锚 `UI_STYLE = {`。**这些名字同时是断言读字面量的入口**（`control.text` 读的就是 textbox 那份）。

> ⚠ **同名双写隐患（重构必读）**：`setText` 会同时写服务端 textbox 与同名实例（锚 `local function setText(ctl, value)`，`main.lua` 与 `lua/tetris/widgets.lua` 各有一份同名实现；实例由锚 `HUD_INST.build = function()` 造），所以树里**同一个名字存在两份**。`findControl` 是深度优先取**第一个命中**（`assert.js:14-22`）⇒ 断言的期望值实际依赖「哪一份先被遍历到」。动层序/创建顺序会改变这份归属，症状是「文本值明明对，断言却读不到/读到空」。

| 控件名 | 断言字段 → 期望值（按用例） | 用例 |
| --- | --- | --- |
| `hud` | `text`: `得分 0　消行 0　等级 1　已填 0`(@01-board-200) / `得分 0　消行 0　等级 1　已填 20`(@04-line-clear-score) / `得分 332　消行 2　等级 1　已填 4`(@04-line-clear-score) / `得分 34　消行 0　等级 1　已填 4`(@05-rotate-harddrop) / `得分 0　消行 0　等级 1　已填 0`(@06-gameover-restart) / `得分 364　消行 2　等级 1　已填 4`(@07-guide-stages) / `得分 3282　消行 12　等级 2　已填 4`(@11-score-level-combo) / `得分 31　消行 0　等级 1　已填 4`(@12-softdrop-harddrop) / `得分 0　消行 0　等级 1　已填 0`(@37-settle-r-casual) | `01-board-200.json`, `04-line-clear-score.json`, `05-rotate-harddrop.json`, `06-gameover-restart.json`, `07-guide-stages.json`, `11-score-level-combo.json`, `12-softdrop-harddrop.json`, `37-settle-r-casual.json` |
| `best` | `text`: `最高 0`(@13-ai-demo-full-chain) | `13-ai-demo-full-chain.json` |
| `hint` | `text`: `键盘操作`(@07-guide-stages) / `堆满一行即消除`(@07-guide-stages) / `堆满一行即消除`(@07-guide-stages) / `一次消 4 行 +800`(@07-guide-stages) | `07-guide-stages.json` |
| `keyA` | `text`: `← → 移动　　↑ 旋转`(@07-guide-stages) / `AI 盘`(@25-ai-battle-dual-layout) / `P1：W 旋转 · G 暂存`(@33-modeover-freeze)；`anchoredPositionX`: `-280`(@33-modeover-freeze) | `07-guide-stages.json`, `25-ai-battle-dual-layout.json`, `33-modeover-freeze.json` |
| `keyB` | `text`: `P2：← → 移动 · ↓ 软降 · X 直落`(@33-modeover-freeze)；`anchoredPositionX`: `280`(@33-modeover-freeze) | `33-modeover-freeze.json` |
| `topBanner` | `text`: `俄罗斯方块`(@07-guide-stages) / `(空字符串)`(@07-guide-stages) | `07-guide-stages.json` |
| `botBanner` | `text`: `点卡片选模式 · 右上角：角色 · 说明`(@07-guide-stages) / `空格 直落到底`(@07-guide-stages) / `← → 移动 · ↑ 旋转 · ↓ 软降 · 空格 直落 · G 暂存 · H 说明`(@24-ai-battle-independent) / `← → 移动 · ↑ 旋转 · ↓ 软降 · 空格 直落 · G 暂存 · H 说明`(@29-menu-cards) | `07-guide-stages.json`, `24-ai-battle-independent.json`, `29-menu-cards.json` |

### 3.2 运行时实例名（`game.InstantiateClientUIControl` 造出来的）

| 控件名 | 创建点 | 断言字段 → 期望值 | 用例 |
| --- | --- | --- | --- |
| `cell1` | `lua/tetris/view_board.lua` 锚 `name = np .. 'cell' .. i` | `visible`: `true`(@01-board-200)；`kind`: `image`(@01-board-200)；`sizeDeltaX`: `28`(@01-board-200)；`anchoredPositionX`: `-135`(@01-board-200) / `-371`(@25-ai-battle-dual-layout) / `-135`(@25-ai-battle-dual-layout)；`anchoredPositionY`: `285`(@01-board-200)；`imageColor`: `-197121`(@05-rotate-harddrop) | `01-board-200.json`, `05-rotate-harddrop.json`, `25-ai-battle-dual-layout.json` |
| `cell11` | 同上 | `anchoredPositionY`: `255`(@01-board-200) | `01-board-200.json` |
| `cell200` | 同上 | `anchoredPositionX`: `135`(@01-board-200)；`imageColor`: `-197121`(@01-board-200) | `01-board-200.json` |
| `cell6` | 同上（`np` 为 p1 空前缀） | `imageColor`: `-679876`(@01-board-200) | `01-board-200.json` |
| `cell195` | 同上 | `imageColor`: `-679876`(@05-rotate-harddrop) | `05-rotate-harddrop.json` |
| `cell196` | 同上 | `imageColor`: `-679876`(@05-rotate-harddrop) | `05-rotate-harddrop.json` |
| `next1` | `lua/main.lua` 锚 `('next' .. i) or ('hold' .. i - 8)` | `sizeDeltaX`: `18`(@15-next-preview)；`imageColor`: `-10822546`(@15-next-preview) / `-5615376`(@15-next-preview) / `-12156176`(@15-next-preview)；`anchoredPositionX`: `400`(@15-next-preview)；`anchoredPositionY`: `180`(@15-next-preview) | `15-next-preview.json` |
| `next5` | 同上 | `sizeDeltaX`: `14`(@15-next-preview)；`imageColor`: `-3038729`(@15-next-preview) / `-6570761`(@15-next-preview) / `-6886153`(@15-next-preview)；`anchoredPositionY`: `99`(@15-next-preview)；`anchoredPositionX`: `389`(@15-next-preview) | `15-next-preview.json` |
| `next4` | 同上 | `imageColor`: `-5615376`(@15-next-preview) | `15-next-preview.json` |
| `next8` | 同上 | `imageColor`: `-6570761`(@15-next-preview) | `15-next-preview.json` |
| `hold1` | 同上 | `imageColor`: `-339810`(@16-hold-swap) / `-339810`(@16-hold-swap) / `-2774792`(@16-hold-swap)；`anchoredPositionX`: `-400`(@16-hold-swap)；`anchoredPositionY`: `180`(@16-hold-swap)；`sizeDeltaX`: `18`(@16-hold-swap) | `16-hold-swap.json` |
| `p2cell1` | `lua/main.lua` 锚 `c.name = 'p2cell' .. i` | `anchoredPositionX`: `101`(@25-ai-battle-dual-layout) | `25-ai-battle-dual-layout.json` |
| `countBig` | `lua/main.lua` 锚 `c.name = 'countBig'` | `text`: `3`(@31-keys-guide-countdown) | `31-keys-guide-countdown.json` |
| `helpTitle` | `lua/main.lua` 锚 `t('helpTitle'` + `local function t(name, str,`（实例化 TPL_TEXT 的工厂） | `text`: `旅行者手册`(@32-help-layer) | `32-help-layer.json` |
| `helpKey1` | 同上 | `text`: `移动`(@32-help-layer) | `32-help-layer.json` |
| `helpCardN2` | 同上 | `text`: `AI 对抗`(@32-help-layer) | `32-help-layer.json` |
| `helpCardN3` | 同上 | `text`: `双人对战`(@32-help-layer) | `32-help-layer.json` |
| `helpChipT11` | `lua/main.lua` 锚 `t('helpChipT' .. row .. col` | `text`: `消 1 行 = 100 分`(@32-help-layer) | `32-help-layer.json` |
| `helpChipT21` | 同上 | `text`: `× 等级：每 10 行 +1，上限 12`(@32-help-layer) | `32-help-layer.json` |
| `helpCardN1` | `lua/main.lua` 锚 `t('helpCardN' .. i` | `text`: `休闲`(@32-help-layer) | `32-help-layer.json` |
| `optT1` | `lua/main.lua` 锚 `tc.name = 'optT' .. i` | `text`: `[R] 再来一局`(@37-settle-r-casual) | `37-settle-r-casual.json` |
| `optT2` | 同上 | `text`: `[V] 回主页`(@37-settle-r-casual) | `37-settle-r-casual.json` |
| `optT3` | 同上 | `text`: `[Q] 结算明细`(@37-settle-r-casual) | `37-settle-r-casual.json` |

### 3.3 tree 断言（存在性）

| 控件名 | exists | 用例 | 说明 |
| --- | --- | --- | --- |
| `cell1` | true | `01-board-200.json` | 棋盘第一格实例 |
| `cell100` | true | `01-board-200.json` | 棋盘第 100 格 |
| `cell200` | true | `01-board-200.json` | 棋盘第 200 格 |
| `next5` | true | `15-next-preview.json` | NEXT 第 5 格（第二块第 1 格） |
| `next8` | true | `15-next-preview.json` | NEXT 第 8 格（第二块第 4 格） |
| `hold1` | true | `16-hold-swap.json` | HOLD 第 1 格 |
| `hold4` | true | `16-hold-swap.json` | HOLD 第 4 格 |
| `pbtnlefthit` | false | `39-click-no-restart.json` | **负断言**：PC 端不该存在（`grep -c pbtnlefthit lua/` = 0，名字已退役） |
| `pbtnhardhit` | false | `39-click-no-restart.json` | **负断言**：同上 |
| `padNoteBtnHit` | true | `46-phone-pad-note.json` | 手机「请回 PC」浮层的「知道了」热区（锚 `UI4.hit('padNoteBtnHit'`） |
| `charTitle` | true | `58-roster.json` | 角色档案标题（`roster.lua:219`） |
| `btnroster.row2T` | true | `58-roster.json` | 角色列表第 2 行按钮的文字子件 |

### 3.4 lua 断言里 `query.control(...)` 引用的名字（容易被漏掉的一半）

这些名字不出现在 `asserts[].name` 里，而是写在 Lua 源码里 ⇒ 改名时 `grep` 控件名会漏掉它们。

| lua 引用的名字 | 用例 |
| --- | --- |
| `hud` | `13-ai-demo-full-chain.json` |
| `btnroster.row2T` | `58-roster.json` |
| `charItemNm1` | `58-roster.json` |
| `charItemNm2` | `58-roster.json` |
| `charPanelF` | `58-roster.json` |
| `ibotBanner` | `63-skill-audio-copy.json` |
| `botBanner` | `63-skill-audio-copy.json` |
| `stext` | `63-skill-audio-copy.json` |
| `helpTitle` | `65-mobile-help-toggle.json` |

### 3.5 名字在哪里定义（改名时必改的位置）

| 名字族 | 定义点（文件 + 锚字符串） | 说明 |
| --- | --- | --- |
| `hud/best/hint/keyA/keyB/topBanner/botBanner` | `lua/main.lua` 锚 `title, hud, hudNext, best, hint` + 锚 `UI_STYLE = {` | 服务端 textbox；同名实例双写在 `HUD_INST`（锚 `HUD_INST.txt = function`） |
| `cell1..cell200` / `p2cell1..` | `lua/tetris/view_board.lua` 锚 `name = np .. 'cell' .. i` / `lua/main.lua` 锚 `c.name = 'p2cell' .. i` | 200 格实例；`p2` 前缀防与 G[1] 撞名。**采样期内这块正被重构**（`view_board.lua` 是新增视图层 + `main.lua` 里 `BR.ctl('cell' .. i)` 取回） |
| `next1..next8` / `hold1..hold4` | `lua/main.lua` 锚 `('next' .. i) or ('hold' .. i - 8)` | 预览/暂存格（一行构造出 12 个名字） |
| `optT1..optT3` | `lua/main.lua` 锚 `tc.name = 'optT' .. i` | 结算三选项文字（实例贴片） |
| `helpTitle/helpKey1/helpCardN*/helpChipT**` | `lua/main.lua` 锚 `t('helpTitle'` / `t('helpCardN' .. i` / `t('helpChipT' .. row .. col` + 工厂锚 `local function t(name, str,` | 说明页文字实例（A/B/C 三套版式各一份名字） |
| `countBig` | `lua/main.lua` 锚 `c.name = 'countBig'` | 倒计时大字 |
| `charTitle/charItemNm*/btnroster.*/charPanelF` | `lua/tetris/roster.lua` 锚 `TXT('charTitle'` / `TXT('charItemNm' .. idx` / `id = 'roster.row' .. i` / `id = 'roster.tab' .. i` + `lua/tetris/controls.lua` 锚 `local name = 'btn' .. spec.id` 与 `addText(id .. 'F'` | 角色档案；`charPanelF` 是 textPanel 的页脚技能行 |
| `padNoteBtnHit` / `menuZone2 / menuZone3` / `hotSettleV` | `lua/main.lua` 锚 `UI4.hit('padNoteBtnHit'` / `UI4.hit = function(name, w, h)` | 热区名（`click` 事件按名寻址；`menuZone*`/`hotSettleV` 是数据表里的 id，不是 `c.name =` 赋值） |
| `stext` / `cell` / `hit` | `lua/tetris/platform.lua` 锚 `DEFAULT_ACCEPTS = { cell = 'image', hit = 'cursor', stext = 'text' }` | 模板实例的通用前缀名；`stext` 在真实帧 dump 里可见（`docs/shots/v5-b1/pc-16-9/dual.frame.json:44`） |

---

## 4. 按屏统计

### 4.1 用例数（主归属，从多到少）

| 屏/子系统 | 用例数 | 占比 |
| --- | --- | --- |
| 玩法主循环 | 13 | 19% |
| 其他 | 12 | 17% |
| 双屏(AI对战/PVP/合作) | 9 | 13% |
| 移动端操作 | 8 | 11% |
| 技能 | 7 | 10% |
| 结算页 | 5 | 7% |
| 消行与计分 | 4 | 6% |
| 说明页 | 4 | 6% |
| 音频 | 2 | 3% |
| 标题页 | 2 | 3% |
| 模式选择 | 2 | 3% |
| 倒计时 | 1 | 1% |
| 角色档案 | 1 | 1% |
| **合计** | **70** | 100% |

### 4.2 屏 × 断言类型矩阵（按该屏所有用例累加）

| 屏/子系统 | 用例 | log | control | tree | lua | 带音效用例 | 有控件断言的用例 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 玩法主循环 | 13 | 31 | 45 | 7 | 6 | 1 | 6/13 |
| 其他 | 12 | 31 | 0 | 0 | 8 | 0 | 0/12 |
| 双屏(AI对战/PVP/合作) | 9 | 36 | 9 | 0 | 1 | 1 | 3/9 |
| 移动端操作 | 8 | 31 | 0 | 3 | 5 | 0 | 2/8 |
| 技能 | 7 | 22 | 0 | 0 | 4 | 1 | 0/7 |
| 结算页 | 5 | 19 | 4 | 0 | 0 | 0 | 1/5 |
| 消行与计分 | 4 | 11 | 4 | 0 | 1 | 0 | 3/4 |
| 说明页 | 4 | 15 | 7 | 0 | 0 | 0 | 1/4 |
| 音频 | 2 | 8 | 0 | 0 | 0 | 2 | 0/2 |
| 标题页 | 2 | 3 | 1 | 0 | 4 | 1 | 1/2 |
| 模式选择 | 2 | 8 | 1 | 0 | 0 | 1 | 1/2 |
| 倒计时 | 1 | 8 | 1 | 0 | 0 | 0 | 1/1 |
| 角色档案 | 1 | 2 | 0 | 2 | 1 | 0 | 1/1 |

**读法**：最后一列是这张网的密度（control/tree 断言数 / 该屏用例数）。最薄的四个屏：`其他 0/12`、`技能 0/7`、`音频 0/2`、`结算页 1/5`，这些屏基本只有日志在守：日志对了、控件没了或错位，测试照样绿。

### 4.3 断言类型的使用分布（少数派明确标出）

| 断言 kind | 断言条数 | 使用它的用例数（/70） | 备注 |
| --- | --- | --- | --- |
| log | 225 | 69 | 69/70 使用；唯一没有 log 断言的是 `64-title-demo-pace.json`（纯 lua） |
| control | 72 | 17 | **只有 17 个用例**读控件字段；50 个用例既无 control 也无 tree（其中 47 个纯日志，3 个靠 lua 读控件） |
| lua | 30 | 25 | 承担全部「多值/区间/不存在」判断（log kind 表达不了） |
| tree | 12 | 6 | **最少数派：6 个用例**；其中 2 条是负断言（`exists:false`） |
| var / signal | 0 | 0 | schema 支持、测试里从未使用 ⇒ 服务端变量与信号零回归（见 §5 G14） |

### 4.4 画布分布（同一功能在不同画布上的回归强度极不均匀）

| 画布 | 用例数 | 用例 |
| --- | --- | --- |
| pc-16-9 | 35 | `24-ai-battle-independent.json`, `25-ai-battle-dual-layout.json`, `26-pvp-split-keys.json`, `27-coop-roles.json`, `28-garbage-attack.json`, `29-menu-cards.json`, `31-keys-guide-countdown.json`, `32-help-layer.json`, `33-modeover-freeze.json`, `34-garbage-topout-fix.json`, `35-help-real-key.json`, `36-menu-back-v.json`, `37-settle-r-casual.json`, `38-settle-r-dual.json`, `39-click-no-restart.json`, `40-ai-takeover-death.json`, `40-settle-hotzone.json`, `41-menu-hover.json`, `42-mode-theme.json`, `43-help-click.json`, `48-pad-keys.json`, `49-help-close-pc.json`, `50-ai-tune.json`, `51-ai-attack.json`, `52-skills-nahida.json`, `53-skills-unlock-switch.json`, `54-skills-ganyu-freeze.json`, `55-skills-columbina-solo.json`, `56-copy-levelup.json`, `57-copy-garbage.json`, `58-roster.json`, `62-ai-battle-takeover.json`, `63-skill-audio-copy.json`, `64-title-demo-pace.json`, `66-bg-cover-pc-16-9.json` |
| mobile-16-9 | 27 | `01-board-200.json`, `02-gravity-fall.json`, `03-move-left-right.json`, `04-line-clear-score.json`, `05-rotate-harddrop.json`, `06-gameover-restart.json`, `07-guide-stages.json`, `08-click-pad.json`, `09-sfx-actions.json`, `10-shake-clear.json`, `11-score-level-combo.json`, `12-softdrop-harddrop.json`, `13-ai-demo-full-chain.json`, `14-bag-randomizer.json`, `15-next-preview.json`, `16-hold-swap.json`, `17-lock-delay.json`, `18-das-arr.json`, `19-ld-resets.json`, `20-ai-hard-rho.json`, `21-ai-easy-rho.json`, `22-tspin.json`, `23-casual-takeover.json`, `30-das-keyup-guard.json`, `44-phone-hold.json`, `45-phone-help.json`, `68-bg-cover-mobile-16-9.json` |
| mobile-19.5-9 | 6 | `46-phone-pad-note.json`, `47-bg-cover-wide.json`, `60-mobile-ai-battle-entry.json`, `61-mobile-phone-buttons.json`, `65-mobile-help-toggle.json`, `69-bg-cover-mobile-19.5-9.json` |
| pc-21-9 | 1 | `67-bg-cover-pc-21-9.json` |
| mobile-4-3 | 1 | `70-bg-cover-mobile-4-3.json` |

---

## 5. 覆盖缺口（重构时这些地方**没有回归网**）

每条都给了可复核的读数。判据是「有没有用例会因为这块坏了而变红」，不是「代码里有没有实现」。

### G1 「存档与构建」= 0 用例（14 类里唯一空类）

`tests/*.json` 全部跑在 `createStudio(tetris.save.json)` 之后（`qxqy/qxqy/runner.mjs:12,32`），**存档本身与 GIA 导出不在回归网内**：`qxqy/build.mjs`（写 `tetris.save.json` / `device-package/*.gia`）、`qxqy/check-gia.mjs`（导图结构检查）是独立工具链，`runner.mjs` 不调用它们。
> 重构风险：动 `main.lua` 的 `OnStart` 接线或模板 guid 候选表后，「70/70 绿」与「GIA 能导入真机」是两件事——必须另跑 build/check-gia。

### G2 71% 的用例零控件断言（50/70）

没有任何 `control`/`tree` 断言的 50 个用例：`02-gravity-fall.json`、`03-move-left-right.json`、`08-click-pad.json`、`09-sfx-actions.json`、`10-shake-clear.json`、`14-bag-randomizer.json`、`17-lock-delay.json`、`18-das-arr.json`、`19-ld-resets.json`、`20-ai-hard-rho.json`、`21-ai-easy-rho.json`、`22-tspin.json`、`23-casual-takeover.json`、`26-pvp-split-keys.json`、`27-coop-roles.json`、`28-garbage-attack.json`、`30-das-keyup-guard.json`、`34-garbage-topout-fix.json`、`35-help-real-key.json`、`36-menu-back-v.json`、`38-settle-r-dual.json`、`40-ai-takeover-death.json`、`40-settle-hotzone.json`、`41-menu-hover.json`、`42-mode-theme.json`、`43-help-click.json`、`44-phone-hold.json`、`45-phone-help.json`、`47-bg-cover-wide.json`、`48-pad-keys.json`、`49-help-close-pc.json`、`50-ai-tune.json`、`51-ai-attack.json`、`52-skills-nahida.json`、`53-skills-unlock-switch.json`、`54-skills-ganyu-freeze.json`、`55-skills-columbina-solo.json`、`56-copy-levelup.json`、`57-copy-garbage.json`、`60-mobile-ai-battle-entry.json`、`61-mobile-phone-buttons.json`、`62-ai-battle-takeover.json`、`63-skill-audio-copy.json`、`64-title-demo-pace.json`、`65-mobile-help-toggle.json`、`66-bg-cover-pc-16-9.json`、`67-bg-cover-pc-21-9.json`、`68-bg-cover-mobile-16-9.json`、`69-bg-cover-mobile-19.5-9.json`、`70-bg-cover-mobile-4-3.json`

其中 **2 个仍会读控件**，但走的是 `lua` 的 `query.control()`（`assert.js:51-60` 只给 9 个字段、**读不到颜色/坐标**）：`63-skill-audio-copy.json`、`65-mobile-help-toggle.json`。剩下 **48 个是纯日志**。

这些用例里，**控件不存在 / 位置错 / 层序被盖住 / 字被裁**都不会红（日志照打）。这类事故在本仓有明确血迹，且都是出图/真机才发现、不是测试拦下的——三处注释锚都在 `lua/main.lua`：'40+ 处'（全仓 40+ 处 setText 变成「写了但看不见」，采样行 305）、'双层文字叠印'（展台压手册，采样行 2498）、'22 号字尾部会被裁'（HUD 不加第 5 字段，采样行 1243）。

### G3 结算页：5 个用例，但**只测了三条路径中的两条 + 只有文本断言**

- 有：R 重开（`37`/`38`）、V 回主页（`36`/`39`/`40-settle-hotzone`）、热区点击（`40-settle-hotzone` 的 `click hotSettleV`）。
- **零用例**：Q「结算明细」（`optT3` 只断言了文案，没有任何用例按 Q 或点它）。
- 三选项只有 `optT1/2/3` 的 `text` 断言；**没有** `visible` / 坐标 / `tree` / 三态颜色断言（三态加深 13%/26% 只在设计里）。`settle hotzones n=3` 是日志，热区控件名 `hotSettleV` 从未被 tree 断言过。

### G4 说明页：只覆盖 A 版式，B/C 两套版式是死代码级零覆盖

`buildHelpLayer` 里三套版式：锚 `local function buildA` / `local function buildB` / `local function buildC`，入口按锚 `local v = (S.variant or 'A'):upper()` 选。用例 `32` 断言的 `helpTitle「旅行者手册」/helpKey1/helpCardN1..3/helpChipT11/T21` 全是 **A 版式**；`variant='B'|'C'` 没有任何用例 ⇒ 切版式后 8 条控件断言会全红，但**没人测过 B/C 是否还能跑**。

### G5 倒计时：3 个数字只断言了「3」

`31-keys-guide-countdown.json` 对 `countBig.text` 只断言 `"3"`（@2.2）；`count 2` / `count 1` 只有日志断言。倒计时控件的 2/1 文本、字号/位置零断言。

### G6 模式选择：卡片只有日志级回归

`29-menu-cards` 只锚 `menu dim board` + `botBanner`；`41-menu-hover` 只断言三条**日志字面量**（`menu hover i=1` / `menu hover i=3` / `menu press i=1`；源码是 `print('menu hover i=' .. i)` 拼接输出，可 grep 的代码锚是 `print('menu hover i='`）。**卡片控件名（`menuZone2/3` 等热区之外的卡片文字/图标）没有任何 control/tree 断言**，卡片文案、图标、三态颜色改了不会红（只有 hover/press 日志这条软链）。

### G7 角色档案：1 个用例，且只测「打开 → 四页签有字 → 关闭」

`58-roster` 覆盖：`char codex open n=`、`charTitle`/`btnroster.row2T` tree、四页签 `btnroster.tab1T..4T` 有字、第一条天赋「所闻遍计」、中列含「技能」、`roster close`。
**零覆盖**：点角色行选中（`roster.row` 的 `onClick`）、切页签后的内容、CD 显示、换人、`char switch`（`docs/characters-design.md:600` 拟定的 `59-char-switch-cd.json` 不存在）。

### G8 技能：Z 施放覆盖得不错，但键位与长按分支全空

- **键盘技能 1/2 零用例**：`KeyboardCharacterSkill1KeyDown`（锚 `listen('KeyboardCharacterSkill1KeyDown'`，H 帮助）、`KeyboardCharacterSkill2KeyDown`（锚 `listen('KeyboardCharacterSkill2KeyDown'`，Q 真结算）在 50 个事件 typeName 里 0 命中；用例走的是 `CraftspersonKey15` 这个真机键。
- **技能槽 2 零用例**：`KeyboardCraftspersonKey11Down`（锚 `listen('KeyboardCraftspersonKey11Down'`）从未被按下。
- **长按分支零断言**：`53` 的 note 自述「刻晴的 Z 改为松手施放（长按=跨地形），用例补 Key12Up」——长按跨地形没有断言。
- **解锁里程碑零用例**：升级解锁/300 行解锁（`docs/characters-design.md:600` 的 `60-char-unlock.json`）不存在；`53` 走的是调试键 `Key30` 全解锁。

### G9 双屏：9 个用例基本都在「按键分区 + 日志」层

`26`/`27`/`33` 断言的是 `p2 act=*` / `coop act=*` 日志与 `keyA/keyB` 文本；棋盘视觉只有 `p2cell1.anchoredPositionX=101`（`25`）一个坐标 + `p2 cellCount=200` 日志。**没有**：P2 盘 HUD 文本、垃圾行落盘后的棋盘颜色、胜负横幅、p2 棋盘上色。

### G10 移动端：按钮名被**故意**排除在断言外，命中区靠裸坐标

`61` 的 note 写明了这个决定：「不再逐名断言 `ph*`/`php*`：v5 期间名字已漂过三次（`pbtn*` → `ph*` → `php*`），逐名断言只会制造假红；命名漂移由 `audit-ui` 的 expect 检查负责报警」。后果：

- 按钮改名**不会**被 `tests/` 拦（靠 `qxqy/audit-ui.mjs`）；
- 按钮位置改动会让 8/39/44/45/49/61 这些**裸坐标** pointer 事件静默点空（点了但没命中，日志断言随即变红——算是软兜底，但报错信息是「没有 phone tap left」，不是「按钮移了」）。
- 手机技能卡 / 预览槽 / 浮层期收走按键（commit `63da0491`）零断言。

### G11 音频：18 个音效 id 里 9 个有 expect、3 个有 exclude，其余无网

`lua/tetris/audio.lua:14` 的 `SFX` 表 18 个 id；被 `audioExpect` 覆盖 9 个（50884/50883/50872/40001/50917/40017/20004/50870/40441），被 `audioExclude` 3 个（50917/50872/50929）。**其余 id 播错、播不播都不红**。另外音效断言只能在 runner 层做（`qxqy/runner.mjs:43-57`；`lua` kind 跑在新建沙箱里读不到 `rt.audioHistory`，`qxqy/runner.mjs:44-45` 注释明说）。

### G12 两个画布只有「背景满幅」一条用例，无玩法

`pc-21-9` 只有 `67`、`mobile-4-3` 只有 `70`，两者都只断言 `bg cover ok w/h`。这两个画布上棋盘/HUD/结算/说明页的布局**零回归**（画布自适应恰恰是历史上翻过车的地方：v2.6 的 scale 方案在 1600 双屏暴露双乘/漏乘，最后整体回退）。

### G13 事件面：注册了但没人按的键 / 没人碰的通道

`tests/` 里出现的 key typeName 共 50 种（含 6 种 Controller）；`lua/main.lua` 里注册/监听但**用例从未触发**的：

| 缺失的事件 | 代码位置 | 影响 |
| --- | --- | --- |
| `KeyboardMoveRightKeyDown`（D/→ 别名） | `lua/tetris/config.lua` 锚 `action = 'right'`；`main.lua` 锚 `right = 'KeyboardMoveRightKeyDown'` | 右移只测了 `CraftspersonKey39` 一条路径 |
| `KeyboardMoveBackwardKeyDown`（S/↓ 别名） | `lua/tetris/config.lua` 锚 `action = 'soft'`；`main.lua` 锚 `soft = 'KeyboardMoveBackwardKeyDown'` | 软降只测了 `Key37` |
| `KeyboardInteractKeyDown` | `main.lua` 锚 `KeyboardInteractKeyDown = true` 与 `listen('KeyboardInteractKeyDown'` | interact 键（角色页 hold）零覆盖 |
| `KeyboardCharacterSkill1KeyDown` / `...2KeyDown` | `main.lua` 锚 `listen('KeyboardCharacterSkill1KeyDown'` / `listen('KeyboardCharacterSkill2KeyDown'` | H 帮助、Q 真结算两条键位零覆盖 |
| `KeyboardCraftspersonKey11Down` | `main.lua` 锚 `listen('KeyboardCraftspersonKey11Down'` | 技能槽 2 零覆盖 |
| `ControllerLeftStickAxis` / `ControllerFocus` | `main.lua` 锚 `game.GetControllerLeftStickAxis()` / `game.SetControllerFocus(` | 手柄摇杆与焦点零覆盖（`48` 只覆盖 6 个 Controller 键） |
| 各键的 `*Up` | — | `Key13Up` / `Key30Up` 无用例；按键抬起路径整体只靠少数几个用例覆盖 |

### G14 断言类型缺口：服务端变量与信号零回归 + 无「负向日志」机制

- `var`（`assert.js:92-99`）与 `signal`（`assert.js:100-106`）两种断言 schema 支持、**70 个用例里 0 次使用** ⇒ 服务端变量与信号通道（`tetris_settle` 等）没有任何回归网。
- `log` 断言没有负向形态（只能断「有」）。想断「不该出现」只能写 `lua` + 手写 `not find`（现状：`22` 断 tspin 不误报、`34` 断零 gameover、`60` 断无 pad note、`61` 断无 device=pc，共 4 处）。
- `log` 的 `level` 字段（`assert.js:75` 支持）零使用 ⇒ 日志级别改动不会红。

### G15 时序脆弱点（不是「没覆盖」，是「覆盖得太依赖时序」）

大量断言的 `at` 直接钉在具体秒数上（如 `13` 的 34.5/46.6、`17` 的 9.8/10.8、`38` 的 8.6/9.2、`64` 的 9.0）。这些数字随 AI 节奏/掉帧一改就漂：`07` 的 note 记录了「AI 节奏变化后分数 366→364、非计分逻辑变更」，`12` 的 note 记录了「首块提前 1 帧触底 ⇒ 硬降行 15→14」。**重构时改时序相关的任何东西，先看这些 note，别把 note 里已解释过的漂移当回归。**

### G16 期望值依赖「哪一份同名控件」与「布局字面量」

两类隐式耦合，改结构时最容易静默失效：

- **同名双写**：`hud/best/hint/keyA/keyB/topBanner/botBanner` 在树里各两份（textbox + 实例，锚 `local function setText(ctl, value)` 与 `HUD_INST.build = function()`)，`findControl` 取深度优先第一个命中（`assert.js:14-22`）。层序/创建顺序一动，断言读到的可能是另一份。
- **布局字面量**：`anchoredPositionX/Y`、`sizeDeltaX`、`imageColor` 的具体数值直接写在期望值里（§3.2）——这类红是「布局契约变了」，不是测试脆。要改布局就同一次改动里更新期望值，并在 commit 里说明。

---

## 6. 断言机制速查

### 6.1 用例 JSON schema（顶层）

| 字段 | 类型 | 必需 | 说明与出处 |
| --- | --- | --- | --- |
| `format` | string | 是 | 恒 `"qxqy-autotest"`（`/home/h/miliastra-beyond-simulator/studio/autotest/format.js:1`） |
| `version` | number | 是 | 恒 `1`（`format.js:2`） |
| `name` | string | 是 | 用例标题；**不参与断言**，但 runner 失败时也不打印它（只有文件名） |
| `dt` | number | 是 | 逻辑步长；`format.js:159` 缺省 `1/30`（常量在 `format.js:3`），**本仓 70/70 显式写 1/60** |
| `canvasId` | string | 是 | `qxqy/runner.mjs:35` 传给 `playRunCase`；缺省 `mobile-16-9` |
| `events[]` | array | 是 | 见 6.2 |
| `asserts[]` | array | 是 | 见 6.3 |
| `audioExpect[]` | number[] | 否 | 必须出现的音效 id（`qxqy/runner.mjs:53-55`） |
| `audioExclude[]` | number[] | 否 | 必须**不**出现的音效 id（`qxqy/runner.mjs:54-56`） |
| `note` | string | 否 | 30/70 个用例有；**是人读的历史原因/基线变化记录，不参与断言**（重构时看它比看 git log 快） |

### 6.2 event 字段（`format.js:5` 的 `EVENT_KINDS` + `normalizeEvent` 18-61 + `runner.js:10-21`）

| kind | payload 字段 | 归一化/执行 |
| --- | --- | --- |
| `key` | `typeName`（必需） | `play.key(typeName)`（`runner.js:13`）；本仓 905 条 |
| `pointer` | `type`(move/down/up...)、`x`、`y`、可选 `deltaX/deltaY`(wheel) | `play.pointer(...)`（`runner.js:12`）；本仓 51 条 |
| `click` | `name`（必需，按控件名寻址） | `play.click(name)`（`runner.js:14`）；本仓 5 条：`hotSettleV`/`menuZone2`×2/`menuZone3`/`padNoteBtnHit` |
| `pause` / `resume` | — | `play.pause()/resume()`（`runner.js:15-16`）；本仓 0 条 |
| `serverSet` | `entityType`、`name`、`value` | `play.serverSet(...)`（`runner.js:17`）；本仓 0 条 |
| `serverSend` | `name`、`params[]`、`target` | `play.serverSend(...)`（`runner.js:18`）；本仓 0 条 |
| `view` | `playerIndex`(1-8) | `play.view(...)`（`runner.js:19`）；本仓 0 条 |

> 每种 event 都有共同的 `t`（秒）与可选 `source`（缺省 `"user"`，`format.js:76`）。事件按 `t` 排序后逐帧投放（`runner.js:37`）。

### 6.3 assert 字段与解释位置（**本仓实际在用的 4 种**）

| kind | 字段 | 判定逻辑 | 解释代码 | 本仓用法 |
| --- | --- | --- | --- | --- |
| `log` | `at`、`contains`、`source`(client\|server)、可选 `level` | 取 `source` 对应日志数组，`row.text.includes(contains)` 命中即过 | `assert.js:70-81` | 225 条 / 全部 `source:"client"` |
| `control` | `at`、`name` 或 `id`、`field`、`equals`（必需） | 在 `snap.tree` 里按 name/id 找控件 → `readField` → `JSON.stringify` 全等 | `assert.js:82-91`；`findControl` 14-22；`readField` 24-29；`same` 3-5 | 72 条 |
| `tree` | `at`、`name`、`exists`（缺省 true） | 控件是否存在 === `exists` | `assert.js:107-112` | 12 条（含 2 条 `exists:false`） |
| `lua` | `at`、`source`（Lua 源码） | 新建沙箱 `rt.evalQueryScript(src, makeQuery(snap))`，脚本抛错=红 | `assert.js:116-126`；`makeQuery` 31-67 | 30 条 |
| `var` | `entityType`、`name`、`equals` | 读 `snap.server.vars` | `assert.js:92-99` | **0 条** |
| `signal` | `direction`(inbound/outbound)、`name`、可选 `values` | 在 `snap.server.{in,out}bound` 找 | `assert.js:100-106` | **0 条** |

**`control` 能读哪些字段**：`readField` 先看控件顶层属性，没有再退到 `control.box`（`assert.js:24-29`）⇒ 本表出现的 `visible/kind/text/sizeDeltaX/anchoredPositionX/anchoredPositionY/imageColor` 都是**顶层字段**。注意 `lua` 的 `query.control()` 只暴露 9 个字段（`id/name/kind/active/visible/pressed/text/interactable`，`assert.js:51-60`）——**颜色/坐标只能在 `control` kind 里断言，Lua 断言读不到**。

### 6.4 执行时序（`studio/autotest/runner.js`）

| 环节 | 代码 | 语义 |
| --- | --- | --- |
| 归一化 + 排序 | `runner.js:36-39` | `normalizeCase` 后 events 按 `t` 升序 |
| 用例终点 | `runner.js:41-42` | `end = max(最后事件 t, 最后断言 at)` |
| 是否需要 tree | `runner.js:46-47` | **只有 control/tree/lua 断言存在时才 `snapshot({inspect:true})`** ⇒ 纯 log 用例的 tree 恒空 |
| 每帧顺序 | `runner.js:78-89` | t=0 先 `applyDueEvents` → `runDueAsserts`；之后每帧 `play.step(dt)` → `snapshot` → `applyDueEvents` → `runDueAsserts` |
| 事件先于断言 | `runner.js:49-55` vs `57-76` | 同一时刻的事件**先生效**、断言后判 ⇒ 旧经验：断言时刻与事件时刻至少隔 2 帧 |
| fail-fast | `runner.js:64-72` | **一条断言红就终止整个用例**，后续断言与事件都不执行 ⇒ 修一个红可能露出下一个红，别以为「只有一条失败」 |

### 6.5 `qxqy/runner.mjs` 的行号职责（它**不做**断言解释）

这是最容易误解的一点：**`runner.mjs` 只负责「音效 + 汇总」，log/control/tree/lua 四种断言全在模拟器侧解释**。

| 行为 | 行号 |
| --- | --- |
| 读存档 + 定位 tests 目录 | `12`、`15` |
| 用例筛选（子串过滤）+ 文件名排序 | `14`、`16-19` |
| 每个用例 **新建** `createStudio(save)`（隔离状态） | `32` |
| 调 `studio.playRunCase(testCase, {canvasId})` | `35`（`canvasId` 缺省 `mobile-16-9`） |
| 取客户端日志（仅用于失败时打印尾部） | `41`、`84-86` |
| **音效断言**：`playGet().audio.recent` → `audioExpect` 缺一即红、`audioExclude` 出现即红 | `43-57` |
| 通过判定 = `report.passed && audioOk` | `59` |
| 失败明细打印（`kind@at 期望= 实得= message`） | `64-78` |
| 汇总行 + 退出码（全绿 0，否则 1） | `81-87` |

### 6.6 写新用例时的 6 个坑（都有现存证据）

1. **断言时刻别贴着事件**：同帧事件先生效（`runner.js:49-55`、`82-89`）；现有用例普遍留 0.05~0.2s（例：`09` 事件 0.1/0.2/0.3/0.5，断言 0.15/0.25/0.35/0.55）。
2. **fail-fast**：一条红后面的断言不执行（`runner.js:64-72`）⇒ 新增断言放在已知绿的点前面会让新红点更难定位。
3. **纯 log 用例没有 tree**：`needsTree`（`runner.js:46`）决定 `inspect`；在只写 log 断言的用例里加 `tree` 断言会自动打开 inspect（没问题），但反过来——**别以为 tree 空就是控件没建**。
4. **Lua 断言读不到颜色/坐标**：`makeQuery` 的 `control()` 只给 9 个字段（`assert.js:51-60`）；要断颜色/坐标必须用 `control` kind。
5. **`control` 的 `equals` 是 JSON 全等**（`assert.js:3-5`），`28` 与 `"28"`、`true` 与 `1` 都不相等；`hud.text` 里的全角空格 `　`(U+3000) 也是契约的一部分（`01` 的期望值含 3 个全角空格）。
6. **音效只能写在顶层 `audioExpect/audioExclude`**：写成 `lua` 断言读不到 `rt.audioHistory`（`qxqy/runner.mjs:44-45` 注释）。

---

## 附录 A：本表的三条硬约束（给重构者的执行建议）

1. **日志文案与锚字符串 = ABI**：§2.1 + §2.2 的每个字面量都至少被一个用例断言。改 `print` 措辞 = 改契约；要改就同一次改动里同步改用例，并在 PR 里写明「契约变更」。
2. **控件名 = 寻址契约**：§3.1/3.2 的名字被 `control`/`tree` 直接引用，§3.4 的名字藏在 Lua 源码里（改名时最容易漏）。`pbtnlefthit`/`pbtnhardhit` 是**负断言**（必须不存在），别「修好」它们。
3. **数值 = 布局契约**：`anchoredPositionX/Y`、`sizeDeltaX`、`imageColor` 的具体数值是断言期望值（§3.2），动布局/配色就要预料到这些红——它们是**故意的**，不是脆弱测试。

## 附录 B：复现命令（全部只读）

```bash
cd /home/h/genshin-ts/workspace/tetris

# 1) 用例数 / 断言数 / 事件数 / 画布分布 / dt
python3 - <<'EOF'
import json,glob,collections
fs=sorted(glob.glob('tests/*.json')); print(len(fs))
k=collections.Counter(); ev=collections.Counter(); cv=collections.Counter()
for f in fs:
    d=json.load(open(f)); cv[d["canvasId"]]+=1
    for a in d["asserts"]: k[a["kind"]]+=1
    for e in d["events"]: ev[e["kind"]]+=1
print(sum(k.values()), dict(k), dict(ev), dict(cv))
EOF

# 2) 日志字面量（去重 + 每个字面量来自哪些文件）
grep -ho '"contains": "[^"]*"' tests/*.json | sort | uniq -c | sort -rn

# 3) 控件名 / 字段 / 期望值
grep -h 'kind": "control' -A4 tests/*.json | grep -E 'name|field|equals' | head

# 4) 断言解释位置（模拟器侧，不是 runner.mjs）
grep -n "assert.kind === \|readField\|findControl" /home/h/miliastra-beyond-simulator/studio/autotest/assert.js
grep -n "applyDueEvents\|runDueAsserts\|needsTree\|play.step" /home/h/miliastra-beyond-simulator/studio/autotest/runner.js

# 5) runner.mjs 的音效与退出码
grep -n "audioExpect\|audioExclude\|process.exit\|playRunCase" qxqy/runner.mjs

# 6) 编号/命名瑕疵
ls tests/*.json | python3 -c "import sys,re,collections;n=[int(re.match(r'.*?/(\d+)',x).group(1)) for x in sys.stdin];print(len(n),len(set(n)),[k for k,v in collections.Counter(n).items() if v>1],[i for i in range(1,71) if i not in n])"
grep -c 'pbtnlefthit\|pbtnhardhit' lua/main.lua   # 0 ⇒ 负断言的名字已退役
git log --all --oneline --diff-filter=D -- 'tests/59*'   # 空 ⇒ 从未提交
```

---

*本表由只读脚本生成；断言数量/类型/字面量/控件名均来自 `tests/*.json` 现算，屏归属与要点为人工判断。生成于 2026-10-31。*
