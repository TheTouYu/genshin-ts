# GUI 世界状态服务 v0（A 形态原型）

> 状态：**当前实现**（原型，位于 `.scratch/gui-service/`，尚未成为共享工具）
> 实测日期：2026-10-18｜仓库：`/home/h/genshin-ts`｜作者：service 代理（task-2）
> 权威依据：`.scratch/gui-stack/AGI-BAR.md` §三/§四（用户裁决「A 形态」）、
> `docs/maintenance/design-2026-10-18-gui-agi-system.md` §9
> 证据：`.scratch/gui-service/bench.md`、`evidence/bench.json`、`evidence/inproc.json`、`evidence/selftest.json`
> 本文件只描述**当前代码**能做什么、怎么用、哪些没验证；性能数字以 `bench.md` 为准（可重算）。

## 1. 它是什么

A 形态 = **屏幕 → 常驻感知 → 单一世界状态 schema → 三个动词 → 编排层 → 真机验收台**。
本原型交付前三段的最小可运行版本，不碰共享工具、不注入、不抬窗：

```
tools/ys-state ─┐
tools/ys-screen ┼→ instruments.py → worldsvc.look() ──→ WorldState（schema.py 校验）
tools/ys-observe┘         │                                  │
                          └→ act(target) ──────────────→ 回执（解析/点击点/post 等待）
                             wait_until(predicate) ─────→ 三态 + 观测值
```

| 文件 | 职责 |
|---|---|
| `.scratch/gui-service/schema.py` | 世界状态 schema v0 + 结构校验 + bbox 归一化 + 状态名词表（读 ys-state，不复制） |
| `.scratch/gui-service/instruments.py` | 仪器适配层（ys-state / ys-screen / ys-observe / ys-atop / ys-do / ys-gui-slot） |
| `.scratch/gui-service/cache.py` | 帧级缓存：`frame_id`(sha256) + 仪器指纹 → 结果；memory + disk |
| `.scratch/gui-service/worldsvc.py` | 三动词 + CLI（look / act / wait） |
| `.scratch/gui-service/bench.py` | 延迟实测（三路径 × 冷/热/缓存；写 `bench.md`） |
| `.scratch/gui-service/inproc_probe.py` | 同进程仪器尖刺（daemon 地板 / 解码地板 / 复用补丁效果） |
| `.scratch/gui-service/selftest.py` | 契约自测（90 条，离线帧，0 注入） |

**为什么在 `.scratch/`**：AGI-BAR §五「融合不重做」——先证明形状可用，再决定是否升级为
`tools/` 下的共享服务。升级/改共享工具属于需要用户裁决的范畴（见 §9）。

## 2. 单一 schema（v0）

`schema.py:SCHEMA_ID = "gui-world-state/0"`。字段名对齐 AGI-BAR §四：

```jsonc
{
  "schema": "gui-world-state/0",
  "frame_id": "sha256:<64 hex>",        // 内容寻址；同帧复用/切片/证据共用
  "captured_at_ms": 1792312419576,      // 帧的时间（离线帧 = 文件 mtime，来源字段会自述）
  "state": {"name": "GAME_PAIMON", "confidence": 1.0, "ambiguous": false,
            "evidence": [...], "channel": "fast", "native": true},
  "objects": [{                         // 每个对象都必须有 evidence（校验强制）
    "id": "c3", "parent": null, "bbox": [382, 1046, 174, 156],   // 统一 xywh
    "kind": "tile", "text": ["祈愿"], "text_source": "fullframe",
    "glyphs": [{"bbox": [...], "role": "icon", ...}],
    "badges": [{"type": "alert", "color": "red", "bbox": [...], "corner": "tr"}],
    "state": {"selected": null, "focused": null, "disabled": null},
    "affordance": {"clickable": "unknown", "evidence": ["skin_siblings:17", ...]},
    "clipped": {"edges": [], "cut_by": null, "px": 0},
    "confidence": 0.92, "evidence": {"rule": "...", "frame_id": "sha256:..."}
  }],
  "groups": [], "slices": [],           // v0 恒空（L2/切片未实现，不编）
  "transitions": [{"from": "GAME_PAIMON", "to": "GAME_ACTIVITY", "ms": 120, "at_ms": ...}],
  "budget_ms": {"total": 50, "detect": 10, "ocr": 0},   // 契约预算（不是实际耗时）
  "degraded": [{"code": "BUDGET_EXCEEDED", "detail": "..."}],
  // ── v0 扩展字段（AGI-BAR 未列，act/wait/bench 需要）──
  "timing_ms": {"state": 1006.2, "objects": 328.2, "validate": 1.3, "total": 1339.5},
  "frame": {"path": "...", "source": "frame|live|latest|provider", "w": 2560, "h": 1440,
            "age_ms": 10833549, "stale": true, "captured_at_ms_source": "file_mtime"},
  "free_text": ["透雨", "..."],          // ys-screen 的 free_text（只有字符串，无坐标）
  "cache": {"hit": true, "layer": "memory|disk", "hit_ms": 0.5},
  "attribution": {                       // v0 扩展：live 帧的窗口归属（票 34；离线帧为 null）
    "checked": true, "src": "x11", "verdict": "OK|NOT_ATOP|NOT_FOUND|OTHER_DESKTOP|OCCLUDED",
    "window": {...}, "current_desktop": 0, "occluders": [...], "covered_ratio": 0.0
  }
}
```

**硬约定（校验器强制，违反即 `SchemaError`，fail-closed）**

- `frame_id` 必须是 `sha256:<64 hex>`；`captured_at_ms` 正整数；
- `state.evidence` 非空（不许无证据断言状态）；`state.channel ∈ {fast, full}`；
- `objects[].evidence` 非空 dict；`bbox` 4 个数字且宽高 > 0；
- `kind ∈ {tile, card, button, row, panel, chip, icon, avatar, unknown}`；
- `affordance.clickable ∈ {yes, no, unknown}`；`state.selected/focused/disabled ∈ {true, false, null}`
  （**判不出来就是 null**，不假装 false）；
- `groups[].role ∈ {section, row, grid, tabs}`；`slices[].object_id` 引用已存在对象；
- `degraded` 必须是 `{code, detail}` 列表，code 登记在 `schema.DEGRADED_CODES`。

**与 AGI-BAR v0 的已知差异（v0 不假装）**

| AGI-BAR | 本实现 | 原因 |
|---|---|---|
| `objects[].id` 整数 | 字符串（ys-screen 的 `"c3"`） | 不重编号 ⇒ evidence 可回溯；改 id 会让缓存/证据对不上 |
| `badges[].type` = red/scroll/crown/claimed/lastopen | `alert`（形状角色）+ `color` | L3 语义未实现；ys-screen 只报"红点形状" |
| `state` 三字段是 bool | `null`（未知） | L3 未实现；未知写 null 才算如实 |
| `groups[]` / `slices[]` | `[]` | L2/切片未实现；编造分组比留空更坏 |
| `clipped` 判据 | 直接透传 ys-screen | 已知 L5 单帧判据未闭合（AGI-BAR §七 已证伪路线） |

**bbox 单位陷阱（实测踩过，已修）**：ys-screen 的 container/glyph/badge bbox **都是 `[x0,y0,x1,y1]`**。
v0 第一版把 container bbox 当 `[x,y,w,h]` 算中心，点击点落到 `(660, 1647)`——帧高只有 1440。
现在所有 bbox 在 `schema.object_from_container()` 入口统一归一化成 **xywh**，`act` 另有一道
「点击点必须在帧内」断言（`CLICK_OUT_OF_FRAME`）。selftest 里有对应回归（`bbox 宽为 0 被拒` 等）。

## 3. 三个动词

### `look(frame=None, *, source=None)` → `WorldState`

| 帧来源 | 行为 | 失败语义 |
|---|---|---|
| `frame=PATH` | 离线帧（bench/回归默认） | 文件不存在 → `FRAME_NOT_FOUND` rc=8 |
| `live` | `ys-observe frame`（唯一取数入口，自带新鲜度证明）；**先查 `ys-atop`** | 窗口不在栈顶 → `LIVE_NOT_ATOP` rc=5，**绝不抬窗**（selftest 已锁这条 CLI 退出码） |
| `latest` | 复用上一次成功的帧，标 `STALE_FRAME`/age | 没有历史帧 → `NO_FRESH_FRAME` rc=8 |
| `auto`（默认） | 窗口在栈顶就 live，否则**拒绝**（不偷偷用旧帧冒充新读数） | 同上 |
| `frame_provider`（测试缝） | 每次 look 取下一帧（帧序列实验用） | — |

实现要点：

1. 先算/取 `frame_id`（同一文件按 `(mtime_ns,size)` 缓存 sha，一次 3.4MB ≈ 2.4–3.1ms）；
2. 查缓存（`frame_id + 仪器指纹`）；命中直接返回（**实测 1.1–1.9ms**）；
3. 未命中：`ys-state --json --frame … --fast` → 状态；`ys-screen … --json --containers` → 对象；
4. 映射进 schema → 校验 → 写缓存 → 返回回执（不返回像素）；
5. `degraded` 自述：`KIND_UNKNOWN` / `FREE_TEXT_UNOWNED` / `L2_NOT_IMPLEMENTED` /
   `L3_NOT_IMPLEMENTED` / `FRAME_PINNED` / `STALE_FRAME` / `BUDGET_EXCEEDED` / …

### `act(target, *, expect, action=None, post=None, inject=False, live=None)` → 回执 dict

目标寻址（2026-10-18 Lead 裁决）：

| 形态 | 语义 | 失败 |
|---|---|---|
| `{"text": "祈愿"}` | 在 **容器文本** 上做 NFKC + 去空白 + casefold **全等**匹配（不做模糊） | 0 命中 → `resolve_fail`；≥2 → `ambiguous`（列候选） |
| `{"object_id": "c3"}` | 直接用 look 的 `objects[].id` | 不存在 → `resolve_fail` |
| `{"intent": "playtest-start"}` | 读 `tools/ys-editor/actions/*.json` 的 pre/post/steps，返回 dry-run 交接；真执行委托 `ys-do`（带账本） | 未知意图 → `UNKNOWN_INTENT` |

回执关键字段：`status`（`ok|dry_run|resolve_fail|ambiguous|invalid|precondition_fail|timeout|violated|error`）、
`ok`（**契约是否成立**，不是界面是否到位）、`resolved`、`injected`、`reached`、`click_point`、
`evidence{frame_id,object_id,text,bbox,confidence,affordance}`、`post`、`transitions`、`degraded`、`elapsed_ms`。

注入契约（**本会话未执行**）：

1. `inject=True` 时 **必须** 有 `post` 判据，否则 `ACT_POST_REQUIRED`（不存在没有 post 的动作）；
2. 必须构造服务时 `allow_inject=True`（默认 False），否则 `INJECTION_BLOCKED`；
3. 注入前再查一次 `ys-atop`（不 atop → `LIVE_NOT_ATOP`）；
4. 注入走唯一硬通道 `ys-gui-slot <win> <secs> ys-pointer-click x y`；
5. 注入后 `wait_until(post)`，`reached` 才算 `ok=True`；`timeout/violated` 如实回 `ok=False`。

`act(intent=…)` 的真执行路径不默认走：`ys-do` 连 `--dry` 都会 `acquire_focus()`（抬窗）——
本会话硬约束禁止，回执 `precondition_fail / FOCUS_REQUIRED`。

### act 的语义期待 `expect`（2026-10-19 用户裁定）

**为什么加**：旧 `act` 只验证「画面变了没有」。2026-10-19 实测滚轮滚到别处（请求 (900,600)，
实际 (1350,900)），画面变化 85.7% ⇒ 按旧判据算成功，但变的是详情面板，**列表并没有滚动**。
用户原话「注意 agi 角度思考」——AGI 的门槛是知道自己要什么、并验证**变化对不对**：

> 有变化 ≠ 达成意图。

**接口（`expect` 对 act 必填；dry-run 也必填，只是不评估）**

```jsonc
{"target": {"text": "背包"},
 "action": {"type": "scroll", "dy": -3, "at": [900, 600]},   // click 可省略（缺省）
 "expect": {"type": "region_text_set_changed",
            "region": [300, 200, 1200, 800],                  // 全帧坐标 x,y,w,h（xywh）
            "min_jaccard_delta": 0.15}}
```

| expect.type | 判据（**单一源**） | 字段 | 成立条件 |
|---|---|---|---|
| `state_in` | `ys-state`（CLI，`--fast`） | `states: [...]` | 界面态 ∈ 集合 |
| `text_added` | `tools/ys-watch` 的 `text_added` 事件 | `region`, `texts: [...]` | 期待的串**全部**出现在增集（NFKC+去空白+casefold 全等） |
| `text_removed` | `ys-watch` 的 `text_removed` 事件 | `region`, `texts: [...]` | 期待的串**全部**出现在减集 |
| `region_text_set_changed` | `ys-watch` 的槽位（debug 输出）→ 集合 Jaccard | `region`, `min_jaccard_delta`（缺省 0.15） | `delta = 1 - |A∩B|/|A∪B| ≥ min_jaccard_delta`；两边都空 ⇒ delta=0（不成立） |
| `pixel_delta` | `ys-watch` 的 `color_delta`（`--no-ocr`） | `region`, `threshold_pct`（缺省 5.0）, `px_thr`（缺省 10） | 变化像素占比 ≥ threshold_pct |

`pixel_delta` 的 θ 标定依据（本机离线合成帧，可复跑）：把 f07 的网格区贴到 f06 上，
**网格区 [300,200,1200,800] 变化 24.51%，详情区 [1770,150,630,650] 变化 0.00%**；
`ys-watch` 自身的「有变化」事件阈值是 0.5%，这里取 **5%（约 10× 事件阈值、约 1/5 实测变化量）**，
用来区分「整块内容变了」与「局部闪烁/噪声」。真实背包滚动的 θ 待 live 读数补（见 §8 限制）。

**返回值**：`{ok, status, expected, observed, evidence, ...}`；
- 成立：`status=ok`，`ok=true`，`evidence.before/after/detail` 三张图 + `meta.json`；
- 不成立：`status=expect_failed`，`ok=false`，`error={code:"ACT_EXPECT_FAILED", detail:...}`，
  并在 detail 里点名「变化的不是我期待的区域」/「未达到集合变化阈值」；**CLI 退出码 9**。
- 证据目录默认 `.scratch/gui-service/evidence/act-<时间戳>-<pid>/`，可用 `--evidence-dir` 指定；
  抓帧与动作同源（live 走 `instruments.grab_frame()` → `ys-capture`（KWin 权威闸门）或
  `YS_CAPTURE_BACKEND=observe` 的 ys-observe；离线用给定帧）；`detail.png` 由 `tools/ys-detail`
  只裁 expect.region（或中心区）并带框内 OCR。

**动作类型**：`click`（缺省，点目标中心）/ `scroll`（`ys-scroll` 注入，`dy` 负数=向下滚；
缺省 `at` = 目标中心，可显式给 `at` 指定滚动落点；`--lease` 复用焦点租约）。

**CLI**：
```bash
# dry-run（默认；只校验与解析，输出 would_act）
worldsvc.py act --text 背包 --frame f06.png --expect '{"type":"state_in","states":["GAME_PAIMON"]}'
# 真动（--live = inject + 用户授权；动作 + 证据 + 语义期待）
worldsvc.py act --text 背包 --live   --action '{"type":"scroll","dy":-3,"at":[900,600]}'   --expect '{"type":"region_text_set_changed","region":[300,200,1200,800],"min_jaccard_delta":0.15}'
```

**退出码**：`0` 成功 / `2` 用法或 expect DSL 非法 / `3` 目标解析失败 / `4` 多义 /
`5` 前置不符（注入未授权、live 归属闸门不过）/ `9` **expect 不成立** / `6/7/8` 同 wait。

**测试**：`selftest.py` 90 项（含 expect DSL 校验 6 项、5 类判据正负例、离线注入正/负例、
证据三件套存在性、`expect_failed → rc=9`；全离线、0 注入）。
**注入结果的三态（2026-10-19 live 缺陷回归）**：`ys-scroll` 的退出码是
`0 if (ok_inject and release_ok) else 5`——**它的 5 有三种含义**：注入失败 / 焦点归还失败 / 两者。
所以 `_do_action` 不再把 rc 直接当结论，而是看它的 JSON：
- `release_ok=false`：动作**可能已注入**，只是归还失败 ⇒ 不判死，记 `LEASE_RESTORE_FAILED` 降级，
  **最终由 expect 判定**（成立 → `ok`；不成立 → `expect_failed`）。这正是「报告与事实一致」的要求：
  不许把「归还失败」报成「注入失败」。
- `result.ok=false` 且 `release_ok` 不为 false：真注入失败 ⇒ `INJECT_FAILED`、rc=8。
- `budget.over=true`（如 live 实测 1883ms/1393ms > 目标 500ms）只是 **stderr 警告 + 性能信号**，
  **不改变退出码**；把它误读成失败会得到「任务成功但 CLI 报错」的假红灯。

**`--intent` 是固定枚举，不是自由文本**（2026-10-19 澄清）：取值只能是
`paimon-to-activity` / `playtest-start` / `playtest-stop`（来自 `tools/ys-editor/actions/*.json` 的
pre/post 定义；`worldsvc.py intents` 可列出）。要执行自定义动作请用 `--text`/`--object-id` +
`--action`，不要往 `--intent` 里塞自然语言。

**「CLI 报 INJECT_FAILED、meta 却是 ok」的取证结论（2026-10-19）**：
- 已提交的 live 证据 `evidence/act-live-pos/meta.json`、`act-live-neg/meta.json` 里
  `inject.raw.rc = 0`、`result.ok = true`、`release_ok = true`，**并没有 INJECT_FAILED**；
  两例的 `budget.over` 都是 true（1883ms / 1393ms）。
- `tools/ys-editor/ys-scroll` 的 OVER BUDGET 只 `print(..., file=sys.stderr)`，**不参与退出码**；
  退出码只由 `0 if (ok_inject and release_ok) else 5` 决定。所以「OVER BUDGET ⇒ rc=5」不成立。
- rc=5 且滚轮**确实注入**的唯一组合是 `release_ok=false`（焦点归还失败）——这正是
  live 前那版「外层 ys-gui-slot 里嵌套 `--lease`」的形态（Lead 的修复 #2）；修复后 rc=0。
- 为让这类情况以后不再被误报，`_do_action` 已按三态区分（见上），并加了 4 条离线回归；
  若再出现 `release_ok=false`，回执会是 `ok` + degraded `LEASE_RESTORE_FAILED` 或
  `expect_failed`，**不会**是 `INJECT_FAILED`。



### `wait_until(predicate, *, timeout_ms=30000, poll_ms=300)` → 三态

判据 v0（声明式 JSON，`version: "wait/0"`，未知键直接拒绝）：

| 键 | 语义 | 备注 |
|---|---|---|
| `state_in: [..]` | 当前状态在集合内 | 状态名来自 ys-state |
| `text_present: [..]` | 所有文本都在（容器文本 ∪ free_text） | 全等口径 |
| `text_absent: [..]` | 所有文本都不在 | **单帧否定** ⇒ 自动降级 `ABSENCE_SINGLE_FRAME`（L6 未实现） |
| `object_count_ge: n` | 对象数 ≥ n | |
| `frame_changed: true` | `frame_id` 与 baseline 不同 | baseline = 上一次 look 的 frame_id |
| `forbid: {state_in, text_present}` | 任一命中 → **violated**，立即停 | 优先于其它判据评估 |

返回：`status ∈ {reached, timeout, violated, error}`（前三是判据结论；`error` 是仪器故障，fail-closed）、
`observed{checks[{check,ok,observed}], state, objects, frame_id}`、`polls`、`elapsed_ms`、`transitions`、`degraded`。

**等待纪律**：轮询间隔是「谓词轮询」（`poll_ms`），不是编排层的固定 sleep；`poll_ms=0` 允许
（帧序列/事件驱动的测试缝）。等待失败不会退化成 timeout——仪器错误单独是 `error`。

## 3.5 常驻世界状态仪器（`backend=daemon-world`，显式开启）

**动机**：cli 后端每个新帧要付「ys-state 子进程 + 本体 OCR ~700ms + ys-screen 解码 ~140ms」≈1.3s；
同一帧重复 look 虽缓存命中 1ms，但**换帧就要重付**。把感知下沉到常驻进程后，帧缓冲/OCR/容器层
三块缓存跨调用复用（2026-10-18 用户批准扩 `ys-lookd`；旧 CLI 行为不变）。

**协议**（`ys_lookd.py`，一行 JSON）：

```jsonc
// 请求
{"cmd": "world",                      // 显式开启：旧客户端从不发这个 cmd
 "frame": "/abs/f06.png",             // 离线帧；或 frame_bin+frame_shape；或都不给 = live
 "profile": "/abs/qianxing.json",     // 缺省用 ys-state 的 PROFILE_DEFAULT
 "ocr": true, "objects": true,        // 关掉可省 ~700ms / 对象层
 "cache": true}                       // 关掉可跳过结果缓存（测量/强制重算）
// 回执（schema=ys-lookd/world/0）
{"schema": "ys-lookd/world/0",
 "state": {"state": "GAME_PAIMON", "confidence": 1.0, "ambiguous": false, "native": true,
           "verdicts": {...}, "readings": {...}},   // ← 判据仍是 ys-state 的唯一一份
 "objects": {"containers": [...], "free_text": [...], "free_glyphs": [...],
             "degraded": false, "error": null},     // ← 容器层仍是 ys-screen 的唯一一份
 "frame": {"source": "frame|frame_bin|live", "sha256": "...", "w": 2560, "h": 1440},
 "timing": {"load_ms": 0.1, "ocr_ms": 1.9, "state_ms": 356.1, "judge_ms": 355.8,
            "objects_ms": 1.2, "total_ms": 359.2, "ocr_source": "cache|engine|skip",
            "cache_hit": false},
 "attribution": {...} | null,          // live 帧的归属校验（票 34）；不过就返回 error，不抓
 "degraded": [...]}
```

**四块缓存**（都在常驻进程里，不落 /tmp）：

1. **帧缓冲**：同一帧（`path+mtime_ns+size` 或帧内容 sha）只解码一次，GPU 张量只建一次；
2. **OCR 内容寻址缓存**：`<XDG_CACHE_HOME>/ys-lookd/ocr/ocr-<sha>-<引擎指纹>.json`
   （`YS_LOOKD_OCR_CACHE` 可覆盖）；同帧第二次 ≤3ms，不再付 ~690ms；
   ⚠️ 引擎约定是 **BGR**（与 `ys_ocr.py`/ys-screen 走图片路径一致）——RGB 直喂会读错字符（实测）。
3. **容器层**：复用 `ys-screen.containers_cached`（帧 sha + 文本盒签名 + `CONTAINER_RULESET`），
   半分辨率图必须用 **PIL LANCZOS**（与 `load_small` 同口径；换插值会让同帧对象数不同）；
4. **结果缓存**：同帧 + 同 profile + 同开关的第二次请求直接返回（LRU 4，≤5ms）。

**实测（2026-10-18，本机沙箱**无 CUDA**，私有 socket 上跑的 CPU 测试 daemon）**：

| 场景 | 读数 |
|---|---|
| world 冷（禁用结果缓存，帧缓冲/OCR/容器缓存热） | daemon 内部 **359ms**（load 0.1 + OCR 缓存 1.9 + **judge 355.8** + 容器 1.2）；客户端含进程导入 ≈998ms |
| world 结果缓存命中 | RPC **2.6–3.3ms**；服务层缓存命中 **1.0–1.2ms** |
| 对象层一致性 | 22 个容器 / 14 条 free_text，与 `ys-screen --containers` CLI **完全一致**（同帧 sha + 同 OCR 盒子） |
| 服务 cli 后端对照（host GPU daemon） | 冷 look 1.27–1.30s；缓存命中 0.9–1.4ms |

**host GPU 实测**（2026-10-18 20:1x，Lead 主会话，daemon 已重启；单位 ms）：

| 场景 | load | ocr | judge | objects | internal |
|---|---|---|---|---|---|
| 冷（重启后第一发，f06） | 158 | 27（cache） | 343（首启预热） | 54 | **582**（RPC 10045 是 daemon 首启，不计入预算） |
| 新帧 f07（daemon 热） | 164 | **3521** | 61 | 342 | **4089** |
| 新帧 f08（daemon 热） | 202 | **634** | 80 | 163 | **1080** |
| 同帧（服务层帧缓存关、daemon 结果缓存命中） | — | — | — | — | **1.1**（RPC 5–10） |

**结论**：**judge 在 GPU 上只要 61–80ms**（热；首启 343ms 是预热）——按 `state` RPC 推的 132–166ms 偏保守；
**当前瓶颈是 OCR（634–3521ms）与容器层（163–342ms）**，不是判据 ⇒ 落在**票 25（分块并行 OCR + 切片缓存）**。
同帧重复请求 1.1ms（结果缓存）；对象 22 容器与 `ys-screen --containers` 一致，GAME_PAIMON 判对。

**激活**（本会话无法执行：沙箱没有 systemd user bus、也没有 GPU/CUDA）：

```bash
systemctl --user restart ys-lookd     # 用户侧执行；旧 CLI 调用不受影响
python3 .scratch/gui-service/worldsvc.py look --frame <帧> --backend daemon-world --summary
```

**失败语义**：旧版常驻服务（没有 `world` 命令）→ 客户端 `DAEMON_ERROR/unknown cmd`（不静默回退）；
live 帧归属校验不过 → `ATTRIBUTION_OTHER_DESKTOP/OCCLUDED/NOT_FOUND`，**不返回像素**；
frame sha 非法 / 回执缺 state → `DAEMON_WORLD_BAD`。

**世界状态服务的开关**：`WorldService(backend="cli"|"daemon-world")`，CLI `--backend`；
默认仍是 `cli`——新路径必须显式选，避免让未知的常驻服务版本悄悄改变读数口径。

## 4. 缓存

- key = `frame_<sha16>` + `仪器指纹`（ys-state/ys-screen/profile 的 mtime+size + `LOGIC_VERSION`）。
  **任一判据文件变化 ⇒ 旧缓存自动失效**（避免拿旧判据的结论当新事实）。
- 分层：进程内 LRU(8) → 磁盘 `.scratch/gui-service/.cache/world-*.json`（原子写）。
- 命中路径还会重新跑 schema 校验（坏缓存 fail-closed），且 `cache`/`timing_ms`/`transitions`
  每次重算（不会把上次的耗时/转移当成本次）。
- 实测命中：**进程内 1.1–1.9ms**；新进程 +68–87ms（解释器启动占大头）。
- `worldsvc.py cache --invalidate` 可清空。

## 5. 性能与门禁（详见 bench.md）

| 门禁（AGI-BAR §一） | 目标 | 实测 | 判定 |
|---|---|---|---|
| 单次默认路径 look | ≤50ms | 新帧 1.27–1.30s（cli 后端）/ **世界仪器 GPU 新帧 1.08–4.09s（OCR 主导；judge 仅 61–80ms）** / 148–162ms（in-process 复用补丁，静默 5 次） | **未达成** |
| 缓存命中 | ≤5ms | 0.9–1.9ms（进程内） | **达成** |
| 对象检测单帧 | ≤10ms | 容器层同帧缓存 0–1ms；新帧 140ms+ | 部分（需票 24 学习型检测） |
| 分块 OCR / 切片 | <1/3 全帧 / ≤5ms | 未实现 | 未验证 |

**≤50ms 的差距归因（实测，不推断）**：PNG 解码 106–187ms（物理地板）、daemon 状态判据 132–166ms、
本体 OCR 669–733ms/次（daemon 侧无缓存）。编排层自己几乎不花钱：缓存命中后
`look`/`act`/`wait` 都是 **0 次子进程、~1–2ms**。要进 ≤50ms 必须换感知架构
（GPU 帧流 + 学习型检测 + 判据下沉），属于「扩常驻服务/改共享工具」范畴 —— 待用户裁决。
（本机共享负载下数字有波动，口径与原始读数以 `bench.md` 为准。）

## 6. 仪器单一源（本服务不重写任何判据）

| 事实 | 唯一来源 | 本服务怎么用 |
|---|---|---|
| 界面状态 13 态（含 2026-10-21 新增的 `GAME_FRIENDS` / `GAME_CHARACTER`） | `tools/ys-editor/ys-state` | CLI 调用；状态名词表直接读其 `STATES` 元组；同层冲突由 `PRECEDENCE`（面板 3 > 派蒙/活动 2 > 世界 1）消歧，并列仍 `AMBIGUOUS` |
| 对象/容器 | `tools/ys-screen --containers` | CLI 调用；只做 schema 映射 |
| 取帧新鲜度 | `tools/ys-editor/ys-observe frame` | CLI 调用；**先 ys-atop，不抬窗** |
| 栈顶判定 | `tools/ys-editor/ys-atop` | 退出码 0/1/2 |
| 意图 pre/post/账本 | `tools/ys-editor/ys-do` | 只读 actions/*.json；真执行需焦点授权 |
| 注入 | `tools/ys-editor/ys-gui-slot` | 默认禁用（allow_inject=False） |
| 抓帧守护健康 | `tools/ys-editor/ys-capture` | 只读 `status`（`daemon_alive` + `seq>0` + `last_err` 空）；机械防线 = `failure-ledger` 的 `capture-liveness` |

### 6.1 三条「仪表不许说没事」的硬约束（2026-10-21 事故回灌）

1. **单请求上界**：`ys_lookd` 是单线程串行服务，连接级 `recv` 有 `YS_LOOKD_RECV_TIMEOUT=10s`，
   handler 有 `SIGALRM` 看门狗 `YS_LOOKD_HANDLER_TIMEOUT=90s`；超时回 `RECV_TIMEOUT` /
   `HANDLER_TIMEOUT`（**不许静默挂住**）。客户端 `daemon_rpc` 默认 60s，超时单列 `DAEMON_TIMEOUT`
   并在消息里直接给出恢复命令。
2. **画面稳定信号**：`world` 回执带 `settled.same_as_prev`；动作前要求它变 `true`（本机实测
   菜单打开后要 8.8s 才稳定，期间照旧 bbox 点击会落到相邻格子）。
3. **动作要能回答「动没动」**：`ys-scroll` 回执带 `frame_diff` 与 `moved_confirmed` 三态
   （`None`=没验 / `False`=没动 / `True`=动了），没动时退出码 `6 NO_MOVEMENT`。

## 7. 失败语义（fail-closed 一览）

| 情况 | 回执/异常 | 退出码（CLI） |
|---|---|---|
| 目标不存在 | `resolve_fail` | 3 |
| 目标多义 | `ambiguous`（列候选） | 4 |
| 缺 post / 未授权注入 / 窗口不在栈顶 | `invalid` / `precondition_fail` | 5 |
| 判据超时（不是故障） | `timeout` | 6 |
| **语义期待不成立**（动作执行了，但变化不对） | `expect_failed` + `ACT_EXPECT_FAILED` | **9** |
| 动作已注入但焦点归还失败（**不判死**，由 expect 决定） | `ok` / `expect_failed` + degraded `LEASE_RESTORE_FAILED` | 0 / 9 |
| forbid 命中 | `violated` | 7 |
| 仪器/schema/帧错误 | `error` | 8 |
| 判据本身非法 | `error` + `BAD_PREDICATE` | 2 |

## 8. 已知限制（v0 不假装）

1. **L2/L3 未实现**：`groups=[]`、对象 `state` 三字段 null、`clickable` 恒 unknown（ys-screen 现状）；
2. **切片/分块 OCR 未实现**：`slices=[]`、`text_source=fullframe`；
3. **text 寻址只覆盖有容器归属的文本**：f06 的 `透雨` 在 `free_text`（无坐标）⇒ act 明确拒绝；
4. **纯图标对象无 text**：用 `object_id` 寻址（模型需先 look）；
5. **live 路径未验证**：本会话游戏窗口不在栈顶（`ys-atop` = NONE），所有 live 数字标"待验证"；
6. **注入路径未执行**：代码就位，受会话硬约束（不注入、不抬窗）阻断；
7. **真机文字身份通道不可用**（与 `tools/gui` 的已知缺口一致，见 2026-10-18 日记 D380）：
   Wine 下 `cu state 原神编辑器` 返回空 ⇒ 本服务的 text 通道走 **OCR 容器文本**，不依赖 AT-SPI；
8. **状态判据的 OCR 成本**：daemon OCR 无缓存（同帧两次仍 ~700ms）⇒ subprocess 形态 look 慢
   （`world` 模式自带 OCR 内容缓存，已缓解；见 §3.5）。
9. **`world` 模式已在 host GPU 激活**（2026-10-18 20:1x，Lead 重启后实测）：judge 61–80ms；但
   **OCR 634–3521ms、容器层 163–342ms 是新瓶颈**（票 25）。沙箱内仍用 CPU 测试 daemon 做功能验证。
10. **live 归属校验依赖 X11/EWMH**：XWayland 窗口正常；若某窗口没有 `_NET_WM_DESKTOP` 等属性，
    检查不可用（`checked=false`）——此时服务 fail-closed（live 拒绝取数），不退回"看标题猜"。
11. **票 34 的遮挡判据是几何并集**：≥99.5% 才算"完全遮挡"；半透明遮罩、部分遮挡仍会放行
    （如实标注 `covered_ratio`，不假装"完全可见"）。
12. **expect 的 live 验收尚未完成**（2026-10-19）：本机原神在 KWin 桌面 3、当前桌面 2；
    沙箱内 `ys-capture` 守护的 `/dev/shm` 是 per-sandbox、`ys-observe` 抓当前桌面 ⇒ 拿不到背包画面。
    离线 5 类判据 + 正负例 + 证据三件套已全绿（84/84）；**背包滚动正/负例待用户把原神切到前台
    且打开背包后补跑**（命令见本文件 expect 节）。`pixel_delta` 的 θ=5% 由离线合成帧标定
    （网格 24.51% vs 详情 0.00%），真实滚动的分布待补。

## 9. 下一跳（需裁决）

- 若把「内容寻址 OCR 缓存 + 帧缓冲复用」下沉进 `ys-lookd`（或新常驻服务）：
  同帧 look 从 1.2–1.7s → ~0.2s（本原型以 in-process 补丁验证过路径，未改共享工具）；
- 票 24（学习型检测）才能让「新帧对象层」进 ≤10ms；票 25/26/27/28 才能补齐 slices/groups/state/affordance；
- live 路径验证需要游戏窗口在栈顶（用户侧操作），且注入路径需要一次性授权。

## 10. 复现

```bash
cd /home/h/genshin-ts
python3 .scratch/gui-service/selftest.py        # 90 条契约自测（离线，0 注入；daemon-world 需新版服务）
bash tools/ys-editor/tests/win-attrib.selftest.sh   # 票 34 归属回归（25 项，0 抓屏）
python3 .scratch/gui-service/bench.py           # 延迟实测 → bench.md + evidence/bench.json
python3 .scratch/gui-service/inproc_probe.py    # 同进程仪器尖刺 → evidence/inproc.json

# 三动词 CLI（离线帧示例）
python3 .scratch/gui-service/worldsvc.py look --frame .scratch/gui-corpus/f06.png --summary
python3 .scratch/gui-service/worldsvc.py look --frame .scratch/gui-corpus/f06.png \
        --backend daemon-world --summary        # 需新版 ys-lookd（见 §3.5「激活」）
python3 .scratch/gui-service/worldsvc.py act --text 祈愿 --frame .scratch/gui-corpus/f06.png
python3 .scratch/gui-service/worldsvc.py wait --predicate '{"state_in":["GAME_PAIMON"]}' \
        --frame .scratch/gui-corpus/f06.png --timeout-ms 3000
```
