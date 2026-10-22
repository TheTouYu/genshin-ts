---
name: gui-state-machine
description: 给任意 GUI 任务定义「状态 + 条件 + 转移」并驱动它跑完——把状态判据写成可配置的 JSON 包（不改代码）、判当前在哪个状态、执行动作进入下一状态、判不准时出「整体+局部」图让模型自己看。当任务涉及：为某个界面定义开始态/目标态、写「到了 A 就点 B、到了 C 就等 D」的流程、按文字或区域条件判断界面、把一次成功的真机流程沉淀成可复现资产、或者要解释「我们能不能让模型自己判断现在该做什么」时使用。与 gui-world-state 的分工：那边管一次感知（状态/对象/文字），这里管**多次判断 + 动作 + 转移**的编排。
---

# GUI 状态机（编排层）

## 0. 一句话

**判据是数据（状态包），循环是协议（look → 判 → act → 再判），证据是资产（round.json + 帧）。**
模型只需要给两样东西：**用哪个包**、**目标是什么**。

| 问题 | 读哪里 | 答不上来时 |
|---|---|---|
| 现在在哪个状态 | `state_pack.py eval` 的 `state` + `support` | `null` / `ambiguous` —— **不猜** |
| 凭什么这么判 | 同一回执的 `evidence[].predicates[]` | 判据值不在回执里 = 这次判断不算数 |
| 判不准怎么办 | `degraded[]` / `state=UNKNOWN` / `novel=true` | 走 §4 降级看图，**不要硬猜** |
| 动完到没到 | `act` 的 `expect_result` + 再跑一次 `eval` | 只有"注入了"没有"到达了" = 没验证 |

## 1. 四件套（这就是要提供的能力）

| # | 能力 | 命令 | 现状 |
|---|---|---|---|
| 1 | **建/改状态包** | 写/改 `packs/*.json` + `state_pack.py validate` | ✅ 可用 |
| 2 | **判态** | `state_pack.py eval --pack … --look …` | ✅ 可用（离线/在线都行） |
| 3 | **走一步** | `worldsvc act … --expect …` + 再 `look` | ✅ 可用（真机需会话授权） |
| 4 | **出可复现资产** | `--evidence-dir` / 手工存 `s*.json` + `round.json` | 🟡 手工，未封装 |

## 2. 状态包：建 / 改 / 校验

位置：`.scratch/gui-service/packs/<pack>.json`；求值器 `.scratch/gui-service/state_pack.py`。

```bash
SP=.scratch/gui-service/state_pack.py; P=.scratch/gui-service/packs/gn-start-v1.json
python3 $SP list --dir .scratch/gui-service/packs          # 现有哪些包
python3 $SP validate --pack $P                             # 结构非法直接 rc=2（别带着错包跑）
python3 $SP eval --pack $P --look /tmp/look.json --expect-state START
bash .scratch/gui-service/state_pack.selftest.sh           # 7 例自检（正/负/期望不符/非法包 + 2 条 look 集成）
```

**在线判态用一条命令**（2026-10-22 起 `look --pack` 已接入，不用再 look+eval 两步）：

```bash
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world \
    --pack $P --summary --allow-background        # 后台帧；要动作则去掉 --allow-background 并走会话授权
# → {"state":{"name":"START","confidence":1.0},"pack":{"state":"START","eval_ms":0.1},"state_vocab":"UNKNOWN"}
```

**建一个包（3 步）**
1. 复制最近似的包，改 `pack` 名与 `states[].id`。
2. 每条判据必须有 `type` + `region`(xywh) + 参数；**至少一条 `text_absent`**（"必须没有什么"才是防误判的门）。
3. 填 `evidence.positive/negative`：这一条是从哪一帧、哪段文字量出来的——判据本身要可复算。

**改一个包（2 条铁律）**
- 改完**必须重跑正例 + 负例**：正例仍命中、负例仍不命中。只跑正例 = 把误判当成修好了。
- 谓词/区域的改动**记进包的 `notes`**（谁在什么时候因为什么改的），否则下一个人不知道为什么是这个区域。

**判据类型**：`text_present` / `text_absent`（region+texts+match: contains/equals/regex）、`object_count`、
`region_stat`（mean_luma·std_luma·dark_ratio·bright_ratio，需 `--frame`）、`pixel_at`（需 `--frame`）。
`rule: all|any|any2` + `precedence` 消歧；多态并列回 `ambiguous`，**不猜**。

## 3. 前置信息自检（**动手前逐条过，缺一条就停**）

> 这一节存在的理由：这些前置我们工具都有输出，但散在不同命令里，模型漏掉就会在真机第一步卡住
> （2026-10-22 实测：`focus` 抬窗 2s 自动交还 → `act` 报 `LIVE_NOT_ATOP`，白跑一轮）。

| 要确认什么 | 从哪读 | 不满足怎么办 |
|---|---|---|
| 游戏窗在哪个桌面 | `tools/ys-editor/ys-wins --attrib` 的 `ds=` / `cur=` | 不同桌面：`--allow-background` 只感知；要动作就 `ys-session begin` |
| 有没有屏幕授权 | `ys-screen-grant status` / `ys-session status` | `ys-session begin --seconds ≤300 --task <id> --reason … --user-said '<原话>'`（同 task 续期不打断） |
| 帧是哪一层 | `look` 回执 `frame.layer` = `background` / `visible` | background **只能看不能动**；要动作必须抬到前台 |
| 坐标空间 | 包的 `coord_space` | 与回执帧尺寸对不上就**先改包再判**，不要硬套 |
| `act` 的 `--expect` 给了吗 | 命令本身 | 漏了直接 rc=2、stdout 空——这是必填，不是可选 |
| 状态稳不稳 | 连读两次 `eval`，`state` 一致 | 不一致 = 过渡态，等下一帧；**不要用单帧下结论** |
| 判据准不准 | `degraded[]` / `state=UNKNOWN` / `novel=true` | 走 §4 |

## 4. 降级路径：OCR / 检测判不准时，流程照样能跑

**判据**（任一命中就走降级，不要硬猜）：
`degraded[]` 非空 · `state=UNKNOWN` · `novel=true` · `act` 解析失败（`rc=3`）或多义（`rc=4`）·
`resolve` 在 uncertainty 区域之外没命中。

**一条命令拿到"整体 + 标注 + 局部"**（不要让模型自己抓帧/裁剪/拼图）：

```bash
tools/ys-editor/ys-view --look /tmp/look.json --frame /tmp/f.png --out /tmp/view
# 产物：whole.png（整帧，宽≤1280）· annotated.png（对象框+id/kind）
#      tiles/t00..（2×2 原分辨率切片）· index.json（尺寸/切片 bbox/对象/状态/降级码）
```

**读法（顺序固定）**
1. `whole.png` 看整体版式（哪块是面板、哪块是列表、有没有弹窗/遮罩）。
2. `annotated.png` 把"看到的框"和 `index.json` 的 `objects[].id` 对上。
3. 细节看不清时才读 `tiles/` 对应切片（`index.json` 里每个切片的 bbox 就是答案）。

**报告纪律**：降级得到结论必须写明来源——
「这一条是模型看图判断（帧 `sha256:…`），不是模块判据」。**不许把它写成"模块判准了"。**

## 5. 走一步：今天的形态 vs 目标形态

**今天（4 条命令，模型自己串）**

```bash
① python3 $SP eval --pack $P --look /tmp/look.json          # 判当前
② python3 .scratch/gui-service/worldsvc.py act --text 点击进入 --live \
      --expect '{"type":"state_in","states":["GAME_WORLD"]}' --expect-timeout-ms 90000
③ python3 .scratch/gui-service/worldsvc.py look --summary    # 复核 + 拿 frame_id
④ 把 ①②③ 的回执存成 s0/s1/s2/s3.json
```

**目标（一条命令，未实现，登记在 `docs/longtask/05-open.md` O-22-14）**

```
worldsvc machine --pack $P --goal '{"state_in":["GAME_WORLD","HALL","EDITOR"]}' \
        --timeout-ms 90000 --evidence-dir <run>
→ {"verdict":"reached|timeout","state":…,"steps":N,"transitions":[…],"evidence_dir":…}
```

在 `machine` 落地之前，**§5 的四条命令就是标准形态**——别自创第六种顺序。

## 6. 测试通过 → 变成可复现资产

一次成功不算能力，**能重算才算**。跑完必须落一个目录：

```
<evidence>/<task>-<YYYYMMDD-HHMM>/
  pack.json          这次用的包（快照，别指向会被改的原文件）
  s0_look.json       每步的原始回执（look / eval / act）——不要只存结论
  s1_eval.json
  s2_act.json
  s3_look.json
  frames/ref.png     关键帧（结论对应的那张，按 frame_id 存名）
  round.json         {task, pack, steps[], verdict, elapsed_ms, frame_ids[], tool_versions}
```

**复跑判据**：只给这个目录，另一个人能在不重跑真机的情况下重算出同一结论；
要真跑时，`round.json` 里的命令原样执行即可复现。

## 7. 已知缺口（写清楚，别假装有）

| 缺口 | 影响 | 编号 |
|---|---|---|
| `act` 不自行借屏（focus 2s 后交还 → `LIVE_NOT_ATOP`） | 真机"看得见点不动" | O-22-10 |
| `wait` 无多帧稳定确认 | 过渡帧 → 假到达 | O-22-11 |
| 后台帧与前台是否同步未实测 | 后台观察可能读到旧帧 | O-22-12 |
| 千星奇域大厅无状态名 | 三终态断言缺一 | O-22-13 |
| `machine` 未实现 | 循环靠模型拼 | O-22-14 |
| `wait` 只能判终点状态，无「转移过程」语义 | 加载期抖动 → 假到达 | O-22-11 |

## 8. 交付前检查清单

- [ ] 包 `validate` 过 + `state_pack.selftest.sh` 绿
- [ ] 正例命中、负例不命中（两个都跑）
- [ ] §3 前置自检**逐条**过（尤其桌面/授权/层）
- [ ] 每一步都存了原始回执（不是只存我写的结论）
- [ ] 降级结论标注了"模型看图判断"
- [ ] 新增谓词类型/新状态名**同轮**写进本技能（否则下个会话等于不存在）
