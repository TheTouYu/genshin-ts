# 步骤 2 · TDD 用例追踪表（2026-10-12）

依据 `docs/gdd.md`（locked）与 02-test-cases 参考。运行器 schema=`qxqy-autotest v1`
（studio/autotest/format.js 已核对：事件 kind=pointer/key/click/pause/resume/serverSet/serverSend/view；
断言 kind=log/control/var/signal/tree/lua；dt 缺省 1/30，本游戏 **dt=0.04**（25fps 契约））。

## 输入面（键位映射，来自 platform-feasibility.md 官方表）

| 操作 | 事件名（typeName） |
| --- | --- |
| 移动 W/A/S/D | KeyboardMoveForward/Backward/Left/RightKeyDown/Up |
| 方向键 ↑↓←→ | KeyboardCraftspersonKey36/37/38/39Down/Up |
| 射击 J（按住连发） | KeyboardCraftspersonKey19Down/Up |
| 放宝 K | KeyboardCraftspersonKey20Down/Up |
| 空格（备选） | KeyboardJumpDown |

真机键盘 PC 专属；手机走触屏（click/pointer）。网页试玩层只转发数字键 1-9，
自动化一律走 MCP `qxqy_studio_play key`（任意键名可注入）。

## 领域日志词汇表（步骤 5 Lua 必须打印的稳定事件）

`game_start` / `char_select <hongmao|lantu>` / `wave <i>` / `wave_clear <i>` /
`boss_spawn <name>` / `score <n>` / `pow <lv>` / `bomb <n>` / `bomb_clear <n>` /
`phoenix <lv>` / `bound <left|right|up|down>` / `life <n>` / `respawn` /
`level_clear` / `game_win` / `fail <reason>` / `restart`

## Debug 信号协议（serverSend 注入，步骤 5 实现，仅模拟器测试面）

| 信号 | params | 语义 |
| --- | --- | --- |
| DebugAutoPlay | [0\|1] | 自动移动+自动开火+免死（胜负流转专用） |
| DebugSkipToBoss | [] | 清当前波，直接刷关 1 Boss |
| DebugKillBoss | [] | 确定性击杀 Boss（走正常死亡/掉落/结算路径） |
| DebugDamage | [n] | 玩家受 n 点伤（走正常死亡循环） |
| DebugSetLife | [n] | 设命数 |
| DebugGrantPow | [n] | 设火力等级 |
| DebugGrantBomb | [n] | 设放宝数 |
| DebugNoop | [] | 空信号，锚定用例时间线（让 runner 步进到指定 t） |

Lua 侧暴露全局调试表 `HMLT = {wave=…, bullets=…}` 供 lua 断言读取。

## 追踪表（GDD CONTRACT → 用例 → oracle）

| # | 规则（GDD 出处） | 用例 | 玩家动作 | oracle |
| --- | --- | --- | --- | --- |
| 1 | boot→ready 状态机 | boot | 无 | log `game_start`；tree CharSelectPanel/ScoreText 存在 |
| 2 | 双角色选人（裁决①） | char-select | 点虹猫卡→重启→点蓝兔卡 | log `char_select hongmao`/`lantu`；蓝兔时 tree OptionControl（僚机）存在；control ScoreText text="0" |
| 3 | 移动钳制 x∈[25,415] y∈[34,220]（裁决③） | movement-bounds | 四方向各按住 3.5s | log `bound left/right/up/down` 各一次 |
| 4 | 波次门闩（白皮书§5） | wave-gate | 选人后 15s 零输入 | lua `HMLT.wave==1`（波 2 不开） |
| 5 | 放宝清屏 bomm<8（复刻栏） | bomb | GrantBomb[3]→等 2s 敌弹→按 K | log `bomb 2`+`bomb_clear` |
| 6 | 蓄力凤凰 ps=70（复刻栏） | phoenix | 按住 J 2.2s→松开 | log `phoenix 1` |
| 7 | pow 升级死亡降级（复刻栏） | pow-cycle | GrantPow[2]→Damage[9999] | log `pow 2`→死亡后 `pow 1`+`life 3`+`respawn` |
| 8 | 胜利流转 | first-success | 选虹猫→AutoPlay→SkipToBoss→KillBoss | log `boss_spawn`→`level_clear`+`game_win`；tree WinPanel 存在 |
| 9 | 失败流转 | first-fail | 选虹猫→SetLife[1]→Damage[9999] | log `life 0`→`fail lives`；tree GameOverPanel 存在 |
| 10 | 重开 | restart | 失败后点 RestartBtn | log `restart`+`game_start`；tree GameOverPanel exists=false |
| 11 | 手机冒烟（mobile-16-9 基准画布） | mobile-smoke | 点虹猫卡 | log `game_start`+`char_select hongmao`；tree ScoreText 存在 |

runCase args：全部用例默认画布 pc-16-9；`mobile-smoke.json` 运行时传
`args.canvasId="mobile-16-9"`（不与 PC 串联）。布局基准=mobile-16-9，PC 只放大/留边。

## 风险与 UNKNOWN（步骤 5 需探针闭合）

- control 断言字段名 `text`（ScoreText 文本框）——真机字段名待核，失败则改用 log `score 0`。
- `HMLT` 调试表与 lua 断言的沙箱可达性——fengari _G 共享，步骤 5 骨架首验。
- 78 发同屏弹的性能断言不在 P0 oracle（无帧预算断言 kind），列入 records/playtest 人工项。

## 完成条件

本步骤只做静态/schema 检查（normalizeCase 逐文件跑通），不启动模拟器、不 runCase。
有效 Red 等步骤 5 骨架运行后由目标行为缺失产生。

## v21 特性日志词汇表（步骤 5 Lua 移植时补用例）

- `trait_unlock <id>`：特性首次触发（暂停教学卡+localStorage 永久解锁）。id∈{yizhen,zhenman,guiqia,fengzhu,renjian,qiudao,beishui}。
- `trait <id>`：已解锁特性再次触发（飘字，4s 冷却）。
- `small_sword <n>`：人剑合一/险中求道追发小长虹剑（n=2/1）。
- 断言锚：CDP 实测值（critRate 数学/燃烧一跳 35/小剑 82×2/回填 每2收1/蓄速 45.5/末命 fireCd 0.5833）见 playtest 第二十一轮。

## 2026-10-13 v2 全功能对齐轮

- 新增用例：level-chain（六关通关链：每关 SkipToBoss→KillBoss(分相 boss 需 N 连杀)→等 winPending 6s→K 续关→…→game_win+restart）、cw-escape（DebugGotoLevel 5+无敌不还手看 cw 15.6s 逃脱）、insight-guanri（lv4 僚机 3 满蓄贯日→悟·满编贯日）。电池 **14/14**。
- 新增 Debug 信号：`DebugInvuln[n]`（默认 999，invuln<90 才衰减故常驻）、`DebugGotoLevel[n]`（playing 态直达关卡）；`DebugKillBoss` 扩展为同时击杀中 boss（isMid）。
- **教训**：v1 有用例靠 fengari 固定种子的随机运气过（开局 pow 漂向玩家）——确定性测试必须走 Debug 信号显式搭建前置，不吃随机红利。
- v1→v2 契约差异修正：ScoreText=纯分数（关卡并入 WaveText「第N关·波M」）、`bomb_clear`/`fail lives`/`restart`/`pow 1`（死亡降级）日志保留、wave 计数 1-based（spawnWave 先取 next_ 再赋值，杜绝「先自增后索引」越界）。
- 结构发现：光标事件只挂在 `button`/`cursor` 两类控件（scene.js KIND_METHODS）——容器 script.object 没有 AddCursorEventListener；客户端模板新增 **t5 cursor（1073742304）**，全屏 FieldArea 承接触屏拖动/点选/特性卡关闭。
