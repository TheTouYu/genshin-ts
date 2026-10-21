# uncertainty 夹具（ys-screen `compute_uncertainty` 的录制回执语料）

**这个目录是「不确定性层没被改坏」的唯一依据。** 三份 JSON 都是**录制数据**（不是整帧、不碰屏幕），
喂给 `tools/ys-screen` 的纯函数 `compute_uncertainty()`，用来证明：
①老画面（游戏 HUD/菜单）的 `uncertainty[]` **逐条不变**；②富 UI 画面上「不适用」是**显式带原因**的，不再和「没有」共用空数组。

## 纪律

- 夹具**不进** `.scratch/gui-service/evidence/**`（真机跑会覆盖，门禁会随机变红，且分不清「夹具没了」还是「逻辑坏了」）。
- 缺失必须显式报 `FIXTURE_MISSING` + 非零退出，禁止静默 FAIL。
- 期望值（`expected_uncertainty`）是**改造前**的实测输出：**只许 `--bless` 才改**。
  `--regen` 只刷新输入（容器/图形/图标），期望值原样保留。

## 三联表（2026-10-21 改造后实测；仪器 = `compute_uncertainty()`，daemon 调用链 `ys_lookd._world_containers`）

| | ① 启动界面（回执复算） | ② 派蒙菜单 `game-paimon-2560x1440.png` | ③ Firefox 整屏 `foreign-ui-2560x1440.png` |
|---|---|---|---|
| 夹具 | `hud-startup-receipt-20261021.json` | `game-login.json` | `foreign-ui.json` |
| `scene` | **hud** | **ui** | **ui**（新判据命中：文本块 88 ≥60） |
| `uncertainty` | **30 条** | **8 条** | **0 条** |
| kind 分布 | **27 `possible_false_positive` + 3 `possible_miss`** | **8 `possible_miss`** | —（无条目） |
| vs 改造前 | **逐条 region/kind/score/reasons 全等**（27/27 fp 的 score 由「中心到画面边距离」精确重算，0 误差） | **逐条全等（含 hint）** | 全等（0 条） |
| `applicable` | `[possible_miss, possible_false_positive, ambiguous_kind]` | `[possible_miss, ambiguous_kind]` | `[possible_miss, ambiguous_kind]` |
| `waived` | `[]` | `[{rule: possible_false_positive, reason: scene_ui, suppressed_hits: 15, suppressed_regions: [...]}]` | `[{rule: possible_false_positive, reason: scene_ui, suppressed_hits: 0}]` |
| `hits` | 3 / 27 / 0 | 8 / 0 | 0 / 0 |
| daemon 的 `coverage` | `covered=false` + degraded `UNCERTAINTY_SOURCE_MISMATCH`（0 CV 容器 / 14 检测框） | `covered=true, detections_covered=false` | `covered=true, detections_covered=false` |

读法：
- `applicable` 非空 ⇔ 至少一个对象来源真被评估过（自测把这条钉成不变量）。**`uncertainty=[]` 只有在 `applicable` 非空时才能读成「没有可疑处」**；若某规则在 `waived`，说明它没跑或场景不成立，原因在 `reason`/`detail`。
- `waived[].suppressed_hits` = 这条规则**本会命中**多少条（区域逐条列在 `suppressed_regions`）。富 UI 上不冒充命中，但一条信息都不丢。
- `coverage.detections_covered` 恒 `false`：本层 uncertainty 由 CV 容器/图形算出，**从不评估检测框**。`code=UNCERTAINTY_SOURCE_MISMATCH` 只在「有检测框且 CV 对象 0 个」（两套来源完全不重叠）时出现。

## 三份夹具怎么来的

| 文件 | 输入 | 期望 | 备注 |
|---|---|---|---|
| `hud-startup-receipt-20261021.json` | **由录制回执反向构造**：`/tmp/look_full.json`（2026-10-21 22:11，`worldsvc look --backend daemon-world`，state=UNKNOWN conf=0.25）里 27 条 fp 的 `region` 就是被判 `glyph_icons` 的 bbox；3 条 miss 的 `contrast` 由 score 反解（反解后重算 score 逐条相等）；`dets` = 回执 `objects`（14 条，xywh→xyxy）；`text_n=13`（containers=0 ⇒ 13 条文本全未被容器吸收）；`W/H=2560x1440` | 回执那 30 条 | ⚠️ **原帧从未落盘**（只走过 `--live` 取帧），**不可重抓**。不许伪造一张帧来充数。 |
| `game-login.json` | 改造前 `ys-screen.analyze(containers_only=True, use_cache=False)` 的直出（containers/free_glyphs/glyph_icons），`text_n=39` | 改造前 8 条 `possible_miss` | 帧已由 verify-docs 改名为 `fixtures/perception/game-paimon-2560x1440.png`（内容/哈希不变，`sha256 e8f648d0…`）。名字曾叫 `game-login` 是说谎——实测状态是 `GAME_PAIMON`。 |
| `foreign-ui.json` | 同上，`text_n=88` | 改造前 0 条 | 帧 `fixtures/perception/foreign-ui-2560x1440.png`（`sha256 0e456095…`，Firefox 我方 GUI 页面整屏）。 |

## 复跑

```bash
# 只跑断言（快，不读帧、不用 OCR、不碰屏幕）
python3 tools/ys-editor/tests/uncertainty.selftest.py
# 机读行：UNCERTAINTY-RESULT checks=33 pass=33 fail=0 verdict=PASS

# 重新录制两张落盘帧的**输入**（期望值不动；只刷新 containers/free_glyphs/glyph_icons）
python3 tools/ys-editor/tests/uncertainty.selftest.py --regen
# 连期望值一起重录 = 重新 bless（慎用；等于承认旧读数作废）
python3 tools/ys-editor/tests/uncertainty.selftest.py --regen --bless
```

## 已知口径（改代码前先读）

1. **`glyph_icons` 的提升档仍用旧判据**（`_regular = rect≥0.8 的容器数 < 4`）。新加的文本密度信号**只**用于 uncertainty 的场景判档（`scene_of`），不连带改检测通道输出 —— 这是「翻档不许改老画面」的保险。
2. `possible_false_positive` 的 `hint` 在 2026-10-21 修正过：旧文写死 `>340`，实际阈值是 `UNCERTAIN_BG_EDGE_FULL = 200`。**这是文案纠错，不改变任何条目的 region/kind/score/reasons**（自测 `HUD.h` 断言 `>340` 不再出现）。
3. 场景阈值 `UNCERTAIN_SCENE_TEXT_N = 60`（OCR 文本块数）来自实测分布：世界 HUD 2 / 启动界面 13 / 菜单 33–35 / 编辑器 33 / 存档列表 48 / 派蒙菜单 39 / **Firefox 88**。改它之前先跑本目录的自测并比对三联表。
4. `containers`/`free_glyphs`/`glyph_icons` 传 `None` 表示**该通道这次没跑**（检测后端），传 `[]` 表示**跑了没找到**——两者在 `meta.sources` 里可区分。

## 变更记录

- 2026-10-21 首建（作者 perception-internals）：三份 JSON + 本 README；配套自测 `tools/ys-editor/tests/uncertainty.selftest.py`（33 断言）。启动界面夹具的 `derived_from` = `/tmp/look_full.json`，原帧已不存在。
