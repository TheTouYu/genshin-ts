# 档案：真实足球 v3（线 `football` · L3）

> 状态：当前推荐（**并行线之一**，2026-10-24 用户指定为本会话推进线；线表见 [`../LINES.md`](../LINES.md)）
> 来源：会话 `session-a0a190c9`（10-23 17:14 → 10-24 11:41）全量用户消息 + 仓库落盘物 + 2026-10-24 盘上读数
> 最近校验：2026-10-24
> 读法：动手前读 §一（判据）、§三（现状读数）、§五（断点）；细节按 §七 指针跳，别通读

---

## 一、这条线要交付什么

上级：`01-charter.md` §一「三个完整 3D demo 游戏」之①——**真实足球**。

| 层 | 判据 | 当前 |
|---|---|---|
| 手感层 | ≥ 游戏内地图 **「足球_2」**（用户 2026-08-30：**"远远不及足球_2"即不通过**，`examples/football/AGENTS.md:55`） | ⬜ 未测 |
| 玩法层 | 自己玩通一局：有玩法、没 bug | ⬜ 未到 |
| 用户层 | 用户亲自试玩认可（唯一能说"验收通过"的层） | ⬜ |

**铁律**：能力层闭环（造物/技能/CLI 全绿）**不等于**手感或可玩性达标。本轮之前的所有"全通"都是能力层证据。

## 二、在哪张图 / 哪个仓

| 项 | 值 |
|---|---|
| 现役地图 | **`1073741827`「真实足球v3」**（v3 从零重构，赛道级减法路线） |
| 退役/只读 | 1825「真实足球」（票 24 终版，只读备件）；donor `3231`（只读行为基线，禁止写入）；**1908「真实足球」**（2026-10-30 自 Win11 侧 `/mnt/wingames/Users/touyu/…/Save_Level/1073741908/` 恢复，1,063,782 B sha `59b8b964…`，2026-09-25 版） |
| 源码 | `examples/football/`（`src-fb/` 保留器件只重装配；`src-zaowu/` 造物三图） |
| 必读 | `examples/football/AGENTS.md`（8 条不变量 + 写回纪律 + 白模配色铁律）、`REBUILD-HANDOFF.md`、`.scratch/football-v2/BOARD.md` |
| 环境 | 每条 shell 先 `export GSTS_LOCALLOW_DIR=<…>/AppData/LocalLow`；存档双址（`Save_Level` + `Temp`）写后必查同 sha |

## 三、现状读数（结构层，2026-10-24 复核）

| 项 | 读数 | 时间/证据 |
|---|---|---|
| 活文件 | `<…>/110170759/Beyond_Local_Save_Level/1073741827/1073741827.gil`，**SHA `56bab843…`，365,166 B**，Save_Level 与 Temp 同 sha | 2026-10-24 00:17（用户 00:18 试玩回写后的盘上态） |
| 场地 | 草地地基 def/inst `1077936160`/`1077936161`；实体 pos `[2.5,-5.5,2.5]`、scale `[3.3,1,3.3]` ⇒ **165×165**、y `-5.5…-4.5` | 10-23 17:5x |
| 场上实体 | 清理后仅 1 个造物：水史莱姆 `1082130442` @ `(-78,-4.5,2.5)`（站既有空模型西边缘） | 10-23 23:5x |
| 造物配置 | `assets:creations inspect --target 1082130442` → `decision=1082130435(20007) skills=1 publicCd=1 config=1191182337` | 2026-10-24 11:5x，exit 0 |
| 四张图 | `1082130433`(20009 状态) / `1082130434`(20008 技能) / `1082130435`(20007 决策) / `1073741825`(20000，挂关卡实体 `1094713345`) | 10-23 |
| 信号 | `zaowu_probe`：send `1610612741` / monitor `1610612742` / server `1610612743` | 10-23 |
| 行为层 | 日志 `2026-10-24_00-18-05_3324_110170759.gia`：`zaowu-listener-armed`×1、`creation-skill-fired`/`…/v1` **各 10 行成对**；实测 **≈0.8 次/秒 = 距离节流**，不是配错 | 10-24 00:2x，用户确认「没有报错，完整闭环」 |

## 四、造物能力层（已闭环，别再重做）

CLI `gsts assets:creations inspect / skill add·bind / decision bind` + `assets:entities delete` 已落地，
回归 `npm run test:creations`（6 断言，判据=与编辑器**逐字节相等**）。
细节与 wire 规则在 [`creation-skill-line.md`](creation-skill-line.md)（本文件不重复）。

## 五、断点（按建议顺序）

1. **近距测频**：把史莱姆挪进玩家活动范围，验证技能链真能到 15~16/s（现在 0.8/s 是距离节流值）。判据=日志间隔读数。
2. **真实行为**：三张图目前只做「切状态 / `executeSkill(1)` / 发信号」，**没有追玩家、没有攻击**。改图内容在 `examples/football/src-zaowu/`（先按 `dsl-nodegraph-development` + 节点预算）。
3. 三个小口子（可选、按需）：def/页面实例**同号跨段**无守卫；`entities delete` 缺字节级回归；槽 82（自主逻辑参数）语义未闭合（用户口径：不填=不巡逻）。

## 六、已否决 / 别再走

| 路线 | 为什么否决 |
|---|---|
| 给造物另造平台 | 用户明确要它**站在既有空模型上** |
| 编译配置写死 `inject.nodeGraphId` | 换图就失效 |
| 用字符串出现次数当事件数 | 必须数**成对**日志行（10 次 = 20 行） |
| "这轮没观测到" ⇒ 引擎没这能力 | 观测缺 ≠ 引擎缺，要按官方文档面查 |
| 看 `--help` 判断 `assets:*` 子命令 | 动作表在源码 `usage()`，无子命令=export 模式会静默成功 |
| 凭记忆推断手感 | 手感只认「足球_2」对照 + 用户试玩 |

## 七、指针

- 任务书/不变量：`examples/football/AGENTS.md`；重构交接：`examples/football/REBUILD-HANDOFF.md`
- 看板：`.scratch/football-v2/BOARD.md`（状态表停在 2026-10-17 04:00，刷新前只当历史读）
- 复盘：`../../game-engine-knowledge/retrospective-2026-10-24-creation-wire-and-cli.md`（10 错谱系 + 3 系统性根因）
- 造物线档案：[`creation-skill-line.md`](creation-skill-line.md)
- 技能：`dsl-nodegraph-development`、`gil-node-graph-reading`、`genshin-ts-asset-operations`、`device-playtest-loop`、`verify-injection`

### D5 结算权威（2026-10-24 双人实测闭合）

- **结论：单客户端权威**。两人同图 32s：服务端 `kitListen` 收 **508~790** 条票、**`kit-dup` = 0**
  （同 tick 重复票 0 条）⇒ **只有一个客户端在执行造物图**，不存在"每客户端各跑一份"。
- **哪个客户端跑不由主机决定**（主机 kitLoop 0 条而服务端票持续 ⇒ 伙伴客户端在跑）：
  服务端 tick 去重已足够；「谁在跑」不可控，掉线接管需分辨来源（低优先级，多人线见 11-17 节物理锁）。
- 稳态 ~12.5 票/秒（单机 14.8/s）；设计票 26 §106 V1 问题据此关闭（日志 2026-10-24_17-11-36）。

### 频率定标（2026-10-24 第二轮双人，CD 0.03）

- 技能配置 `1191182338` 现为 **cd=[0.03, 0.03]**（用户编辑器设置）+ `ignorePublicCd=true`。
- 复测（日志 2026-10-24_17-19-22，68s）：t=3..67 稳定 15 票/秒 ⇒ **15Hz 上限=AI 客户端拍**
  （与 CD/距离无关）；「开局 2 秒 119 票」未复现，判定会话启动期一次性刷新，非稳态。

### R3 可行性调研（2026-10-24，动手前）

调研=`examples/football/R3-FEASIBILITY.md`。结论**能承担**（判定全是几何）；最大未知=15Hz 隧穿（25m/s 每拍
1.67m）与单客户端权威健壮性。硬约束：`creation_skill` 无 `getPlayerMovementInput`（意图只能位置差分）、
无 `squareRootFunction`、拍频上限 15Hz=AI 客户端。

## 现状读数（2026-10-27 17:5x，本轮：物理内核 v2 + 丘丘人算力中心）

**地图 1073741827「真实足球v3」**：`save == temp == 78b50f7f…`，455,086 B，`gil-header-check` 0 问题；
本轮所有写入均有 `.gsts/backups`。提交 `feb2551a`（v2 内核）/ `eea2e0b8`（v1 + Lua 桥）。

### 架构（正统路线：客户端算 → 服务端施运动器）

```
Lua fb-input.lua（挂容器节点 1073741846，3 个基础键 + 心跳）
  → 信号 fb_input(key,state)（send=1610612747/monitor=748/server=749/clientScript=739）
  → 服务端 kitListen(1073741826, 36n) 挂丘丘人：key>0 才自增 fb_seq，并写 fb_key
  → 客户端 kitLoop(1082130436, 316n) 跑在打手丘丘人 1082130445 上：六态物理内核
      每拍发 kit_state(tag=B, tick, pos, vel, spin, state=mode)
  → 服务端 kitRender(1073741828, 28n) 挂真足球 1077936135：
      线性运动器补间（位移<5m）/ 瞬时定点（≥5m）+ 旋转运动器滚转（世界轴→局部轴 YXZ）
```

### 物理内核 v2 参数（dt 已改 1/15；带球"连续助力 v=0.45v+0.55vdes"已被 2026-11-03 触碰式取代）

六态：Airborne/Bouncing/Sliding/Rolling/Rest/DribbleControlled；重力 9.8、反弹 0.5、马格努斯 K=0.03、
限速 18。现行参数权威=`examples/football/src-fb3/kit-loop.ts` 常量区 + `design/PHYSICS-ENGINE-V3.md`。

### 已清理（用户令：移除多余造物/技能/节点图）

- 删图：kitProbe 1082130440、kitBall 1082130439、zaowu{Status,Skill,Decision} 1082130433/434/435、
  zaowuListen 1073741825、空图 kit_follow 1073741827（共 7 张，均有 delete-graph 备份）。
  现役图仅 5 张：kitLoop / kitStatus / kitDecision / kitListen / kitRender。
- 水史莱姆 1082130442：技能条目已删（skills=0）、实体挪到 (0,−60,0) 当备胎（CLI 无实体删除命令）。
- 遗留：3 个无人引用的技能配置（1191182338/339/340，**CLI 无删除命令**）；足球上旧 tabBar 组件(type17)仍在。

### 载体停放纪律（2026-10-27 用户两次纠偏）

- **距离节流是硬事实**（用户多次强调）⇒ 算力载体**必须跟随玩家**（x/z 跟随），这也是当初做「跟随瞬移」的原因；
  静止停远处会掉到 1~3/s。
- **y 用常量，不读玩家位置**（读回异常会浮到草地上）；常量必须落在某个实体的支撑范围内：
  草地地基 1077936161 pos y=−5.5 scale y=1 ⇒ 占 y∈[−5.5,−4.5]，取 **−5.1**（有支撑 + 被地形遮住 + 离玩家 ≤1m）。
- 反例：`(0,−12,0)` 下方无支撑会直接掉下去（用户当场打回）。

- 上述三条「真机确认」（丘丘人施放 / Lua 键链 / 运动器观感）已于 2026-10-29~30 全部拿到读数并闭环，结论见下文 10-30 节。

---

## 现状读数（2026-10-29 14:2x，本轮：HUD v1 界面骨架 + 核心机制设计 v0）

> 测量方式：`assets:ui list` / `assets:scripts list|mounts` / `assets:creations inspect` /
> `assets:skill-config list` / `sha256sum`（全部只读 CLI，活图 1073741827）。

### 结构层（已验证）

- **HUD 11 控件**（客户端容器节点 1073741863 下）：`hud_title`(1073741866, 800,862, 720×44)、
  `hud_score`(1073741873, 800,800, 420×78)、`hud_timer`(1073741874, 800,744, 260×40)、
  `hud_toast`(1073741875, 800,620, 1000×96)、`hud_state`(1073741876, 800,270, 700×44)、
  `hud_k1..k6`(1073741867..72, x=1380, y=636/588/540/492/444/396, 380×44)。
- **脚本**：registry 2 条（fb-input 1073741825 / fb-input2 1073741826），**mounts=1**（只 fb-input 挂在容器节点；
  本轮 unmount 了 fb-input2 —— 两条同源脚本同挂一个节点会让每次按键双发 `fb_input`）。
  external Lua 10848B（含 BOM）；Save_Level == Temp sha `7893105f…`。
- **技能配置链**（复读确认）：打手丘丘人 1082130445 skills=1 → config `1191182341`（instant）→ `graphId=1082130436`
  = `_GSTS_kitLoop`；decision=1082130438（20007）。真足球 1077936135 挂 kitRender 1073741828。
- **UI 控件能力边界**：client-textbox 的字号/颜色/对齐/文案 CLI 改不了（Lua 运行时赋值）；加控件只能
  `assets:ui clone`（`create --on container:` 不成立）。细节见 `examples/football/design/HUD-v1.md`。

### 行为层

- 2026-10-29 前：近 32 份日志无 `[fb-in]`（**那是读错字段**：Lua print 落 f23，`text` 子命令只解 f22；详见
  `debug-log-investigator`）。2026-10-30 起行为层读数齐备（见下方 10-30 节）。


## 2026-10-30 现状读数（行为层首次成形）

- **玩家角色位置正解**：玩家序号 → `getPlayerGuidByPlayerId` → `queryEntityByGuid` →
  `getAllCharacterEntitiesOfSpecifiedPlayer` → `[0]` → 位置（抄奇域资产中心复合节点「玩家，角色，关卡」，
  反解见 `docs/game-engine-knowledge/entity-acquisition.md`）。
- **四条死路**：控制器实体坐标恒 `(0,y,0)`；角色列表[0] 常是掉场实体；`int→guid` 不支持；20008 图无 `getCurrentCharacter`。
- **步长**：现 DT=1/15（15Hz 客户端拍）；`queryGameTimeElapsed` 是游戏时钟不能当墙钟，dt 走球实体变量 `fb_dt`。
- **运动器**：定点器 + 旋转设备同链叠加会让直线设备秒停（`motion-devices.md` §10）；平移改
  `add_uniform_basic_linear_motion_device`，时长取 `fb_dt`。
- **接触模型**：改为法向冲量 + 库仑上限 + 消滑移冲量（`I=2/5mR²`，v 与 ω 同步）。

图与挂载（地图 1073741827）：`kitLoop` 1082130436（物理）／`kitRender` 1073741828（渲染+`fbc_e`）／
`kitListen` 1073741826（输入中继）／`kitStatus`/`kitDecision` 1082130437/38（2 节点占位，仍被造物配置引用）。

**死资产清理（2026-10-30）**：删孤儿图 kitPpos、载体变量 14→8、脚本登记 2→1、kit-loop 删 6 常量；
新 CLI `custom-variables --delete` / `scripts remove` 落地。**仍存疑**：`1610710043/44` 两张无名图
（root10 外，delete 找不到，需另开客户端图路径）；kitStatus/kitDecision 占位图删前须先解绑。

**断点**：①等本轮试玩日志（`fbvx/fbvz` 是否随动、`tag=B` 球状态、`tag=Q*` 候选）②4v4 多玩家把玩家序号做成参数。

## 2026-11-17 现状读数（多人联机 M 线：规划 + 网页验证台，commit 9f860125）

- **规划**：`examples/football/design/MULTIPLAYER-PLAN.md`。三问题拍板：①谁算物理=维持
  单客户端权威+物理执行锁 `fb_phys_owner`（D5 是单人施放场景；双人各施放=双份物理打架，
  锁≈10 节点）；②输入身份=三候选（Lua 玩家 id / 信号来源引脚 / PlayerSelf 变量写入）待
  M0 两客户端实验；③球权仲裁=物理派（最近者+并列序号、滞回 0.3m 候选、显式抢断覆盖）。
- **网页验证台**：`examples/football/web/multi-verify.html`（S1 归属争夺/S2 抢断/S3 传接/S4
  延迟；AI 冒烟 ownSwitch≈251 次/200s ⇒ 滞回 0.3m 偏小待调参）。冒烟
  `web/smoke-test.cjs` 全绿 + 无头 chromium 渲染零 JS 错误；**真人试玩未做（等用户）**。
- **设计缺陷发现**：同键「1=推射/抢断」下防守者入 2.4m 资格圈后按键恒走推射，D1 抢断
  可达窗口仅剩 0.1m——网页已改「对方持球时同键优先抢断」，游戏图移植时同步。
- **带球模型换代替换**：2026-11-03 用户裁决**触碰式带球**（TOUCH_R=1.2 小踢+TV_K 1.3+冷却
  6 拍），连续助力已删——上文 10-27 节「v=0.45v+0.55vdes」描述已过时。

### 断点

1. 用户网页试玩调参（滞回/抑制/冷却回填 MULTIPLAYER-PLAN §五）。
2. M0 输入身份实验（两客户端 10 分钟，探针设计在规划 §Q2）。
3. 旧断点仍在：引擎 v3 四件事试玩（带球跟脚/擦柱弹/节奏/弹跳递减）。
