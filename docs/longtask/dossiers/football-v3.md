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
| 退役/只读 | 1825「真实足球」（票 24 终版，只读备件）；donor `3231`（只读行为基线，禁止写入） |
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
