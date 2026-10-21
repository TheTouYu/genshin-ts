# perception 夹具（GUI 世界状态 · 感知层 AGI 化语料）

**这是感知层所有对照的唯一依据。** 没有这张帧 + 本 README + `baseline.json`，后续所有「改好了」都无法验证。

## 纪律（技能 `gui-world-state` §11）

- **夹具不许放 `.scratch/gui-service/evidence/**`**：那是真机跑会覆盖的生产目录，门禁会随机变红，且分不清「夹具没了」还是「逻辑坏了」。本目录是稳定副本。
- 夹具缺失必须显式报 `FIXTURE_MISSING` + 非零退出，禁止静默 FAIL。
- 本目录的帧**只增不改**：任何改动都要在下方「变更记录」写清原因。

## 两张帧（2560×1440 RGB，本机物理分辨率）

| 文件 | 来源 | 抓取时间 | 字节 | sha256（前 16） |
|---|---|---|---|---|
| `foreign-ui-2560x1440.png` | `/tmp/screen_ff.png`（spectacle 整屏：Firefox 我方 GUI 页面 + 终端） | 2026-10-21 22:15 | 694750 | `0e456095d410106f` |
| `game-paimon-2560x1440.png` | `.scratch/gui-service/evidence/act-20261021-154841-1571995/before.png`（真机 act 回执的**动作前帧**，同目录 `meta.json` 可溯源） | 2026-10-21 15:48:41（`meta.json` 里 frame seq=75698） | 11059254 | `e8f648d034452fe0` |

> **命名**：本帧原名 `game-login-*`（任务书命名），但实测状态是 **`GAME_PAIMON`（派蒙菜单）**，不是登录/启动界面 ⇒ 2026-10-21 按 Lead 裁决改名为 `game-paimon-*`（**命名不能说谎**）。同目录 `after.png` 点「好友」后实测 `GAME_FRIENDS`，前后两张互为真值对照。
> **已知缺口（有价值，别删）**：22:11 那张真正的**游戏启动界面**只走了 `--live` 取帧，**从未落盘**（唯一留痕 `/tmp/look_full.json`：`UNKNOWN 0.25 / free_text 13 / objects 14 / uncertainty 30`），按纪律不重抓、不造帧，故**没有**启动界面的离线夹具。将来若要有，必须由真人真机跑一次并显式落盘。

## 改造前读数（`baseline.json` 的语义，抓取时间 2026-10-21 22:43）

仪器：`python3 .scratch/gui-service/worldsvc.py look --backend daemon-world --frame <png> --no-cache`
代码状态：HEAD `844d9a02`，`worldsvc.py / schema.py / selftest.py / ys-state / ys-screen / ys_lookd.py` **全部未修改**（改造前快照有效）。

| 读数 | `foreign-ui` | `game-paimon` |
|---|---|---|
| `state.name` | **`PLAYTEST`（判错）** | `GAME_PAIMON`（判对） |
| `state.confidence` | **0.5** | 1.0 |
| `state.native` | false | true |
| `state.evidence[0]` | `{readings_n:22, native:null, attribution:null}` —— **读数被丢，只剩计数** | `{readings_n:35, native:true}` —— 同样只剩计数 |
| `objects_n` | `{containers:1, detections:92, used:92}` | `{containers:18, detections:103, used:103}` |
| `free_text` | **5**（OCR 实际见 100 条） | 22 |
| `uncertainty` | **0 条** | 7 条（全 `possible_miss`） |
| `degraded` | `FREE_TEXT_UNOWNED / L2_NOT_IMPLEMENTED / L3_NOT_IMPLEMENTED / FRAME_PINNED / BUDGET_EXCEEDED` | 同上 5 条 |
| `timing_ms.total` | 372.0 | 446.2 |

### 三条必须被门禁拦住的事实

1. **判错会洗白自检**：`worldsvc.py:531-548` 的 `STATE_UNKNOWN` 只在 `state_name == "UNKNOWN"` 时进入 `degraded` ⇒ Firefox 帧被判成 `PLAYTEST` 后，诚实告警反而消失（`degraded` 里没有 `STATE_UNKNOWN`）。**误判越自信，防护越少。**
2. **证据被丢**：`worldsvc.py:461-467` daemon 分支硬编码 `evidence` 只有 `{readings_n}`，`resp["state"]["readings"]` 被丢弃（cli 分支 `worldsvc.py:624-636` 才带全）。
3. **降级项随调用历史翻脸**：同一帧连续两次 `look --no-cache`，第 1 次 `total=493.4ms` ⇒ `degraded` 含 `BUDGET_EXCEEDED`；第 2 次 `total=8.7ms`（daemon `_WORLD_CACHE` 命中）⇒ `degraded` 里**没有**。耗时是性能读数，却被当成这一帧的观测缺陷。

### 不确定性对比（`game-paimon` 7 条 vs `foreign-ui` 0 条）

`game-paimon` 给出 7 条 `possible_miss`（游戏图标/头像等小图形块），`foreign-ui` 在 OCR 见到 100 条文本、92 个检测框的**富 UI** 画面下却是 **0 条**。
这说明「富 UI 界面零不确定」**不是普遍规律**，而是 `tools/ys-screen:1450` `hud_like = _regular < 4` + `:1519` `if hud_like and d > 200` 的**规则门控**：规则带"画面类型"前提，富 UI 下整条规则永不触发、静默返回 0。⇒ 改造后必须能区分「**不适用**（waived）」与「**没有**（0 条）」，见 S4。

## 契约 v1 字段（2026-10-21 Lead 锁定，门禁按这份判）

```text
world 回执顶层：
  state.name / state.confidence / state.novel(bool) / state.candidates(list)
  state.match = { candidate, ratio, has_critical, critical_ok, ratio_pass,   # 本次被评估的态 + 证据成不成立
                  accept_support, accepted,                                   # 阈值本身 + 最终采没采纳
                  novel, novel_reason, low_support, level,
                  support, support_ratio, support_source, criteria_n }
      ※ **没有排序键**（best/second/margin 已于 2026-10-21 撤回）：`support` 表有每态 passed/total/ratio/rule，
        要排名下游自己算——两处各排一次就是第二个真相源。
      ※ 不含 `state`（与 state.name 重复会漂移）
      ※ `candidates` **只表示「同时成立的多个态」**（AMBIGUOUS/消歧场景）；novel 路径下必须是**显式空列表 `[]`**，
        被拒的态记在 `match.candidate`（单数）。
  state.evidence[0] ⊇ { readings[{name,passed,value}], verdicts, support, criteria, margin, candidates }
  timing_ms.budget = { total_ms, budget_ms, exceeded }   # BUDGET_EXCEEDED 已从 degraded 移除
  uncertainty_meta = { applicable[], waived[{rule,reason}], scene, source }
  uncertainty_source ∈ {containers, detections}          # 与 objects_source 不一致 ⇒ waived 里出现 UNCERTAINTY_SOURCE_MISMATCH
```

## 门禁期望判定（`tools/ys-editor/tests/perception-contract.selftest.py`）

| 编号 | 判据 | 改造前 | 期望 |
|---|---|---|---|
| S1 | 预算不是观测缺陷：`degraded` 无 `BUDGET_EXCEEDED`，`timing_ms.budget` 三键齐全且 `exceeded ⇔ total_ms > budget_ms`（**告警不删，只搬家**） | 红 | 绿 |
| S2 | `state.evidence[0]` 含非空 `readings`（逐条 `{name,passed,value}`）/`verdicts`/`support`/`criteria` | 红 | 绿 |
| S3 | `foreign-ui`：`state.name=UNKNOWN` + `novel is True` + `novel_reason="no_critical_evidence"` + `candidates == []` + `match.candidate="PLAYTEST"` + `match.accepted is False` + `match.critical_ok is False`；`degraded` 的 `STATE_UNKNOWN`/`STATE_LOW_SUPPORT` 与 `novel`/`low_support` 一致 | 红（判成 PLAYTEST 0.5，告警反被洗白） | 绿 |
| S4 | `uncertainty_meta{applicable,waived,scene,source}` + `uncertainty_source∈{containers,detections}`；`foreign-ui` 的 `waived` 非空 | 红（0 条、无 meta） | 绿 |
| S5 | `fixtures/screen/` 既有 4 张帧的状态与 `baseline.json.legacy_fixtures` 一致（**期望值从基线读，不硬编码**） | 绿 | 保持绿 |
| S6 | 冷跑/热跑 `sorted(degraded)` 相同；离线帧与 live 帧的差异**只允许** `FRAME_PINNED`/`STALE_FRAME` | 红（`BUDGET_EXCEEDED` 冷热不对称） | 绿 |

S6 的 live 半边需要 `--live-json PATH`（吃别人已落盘的回执），**默认 SKIP**——本门禁绝不抓帧。

## 既有 4 张 fixture 帧（S5 的「老画面」，期望值来自 `baseline.json`）

| 帧 | state | confidence | objects_n(detections) | free_text |
|---|---|---|---|---|
| `menu-esc-云阶.png` | `MENU` | 1.0 | 93 | 35 |
| `menu-esc-pre-rename.png` | `MENU` | 1.0 | 94 | 36 |
| `editor-dxvk-occluded.png` | `EDITOR` | 1.0 | 70 | 36 |
| `savelist-orderB.png` | `SAVELIST` | 1.0 | 65 | 46 |

## 复跑

```bash
# 单帧读数（改造前/后同一条命令，便于 diff）
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world \
  --frame tools/ys-editor/tests/fixtures/perception/foreign-ui-2560x1440.png --no-cache

# 契约门禁（机读行 PERCEPTION-CONTRACT-RESULT）
python3 tools/ys-editor/tests/perception-contract.selftest.py
```

## `baseline.json` 结构

- `frames.<文件名>.receipt_cold` —— **完整冷跑回执**（`--no-cache`），回归 diff 以它为准。
- `frames.<文件名>.readings` / `warm_readings` —— 关键字段摘要（state/objects_n/free_text_n/uncertainty_n/degraded_codes/timing）。
- `legacy_fixtures.<文件名>.readings` —— 4 张老帧的改造前读数（S5 的期望值来源）。
- 耗时（`timing_ms`、`daemon_timing`）与 `FRAME_PINNED.detail` 里的 `age≈…ms` 随机器负载/文件 mtime 变，**不作回归判据**。

## 变更记录

- 2026-10-21 首建：两张帧 + `baseline.json`（改造前快照）+ 本 README。
- 2026-10-21 按 Lead 裁决改名 `game-login-*` → `game-paimon-*`（实测状态 GAME_PAIMON，原名会说谎）；补「不确定性对比」「契约 v1 字段」「已知缺口」。作者 verify-docs。
