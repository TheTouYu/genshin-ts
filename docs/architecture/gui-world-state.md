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
| `.scratch/gui-service/selftest.py` | 契约自测（53 条，离线帧，0 注入） |

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
  "cache": {"hit": true, "layer": "memory|disk", "hit_ms": 0.5}
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

### `act(target, *, post=None, timeout_ms=30000, inject=False)` → 回执 dict

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
| 单次默认路径 look | ≤50ms | 新帧 1.27–1.30s（subprocess 现状，3 次；跨轮次曾见 1.35–3.2s）/ **148–162ms（in-process 复用补丁，静默 5 次）** | **未达成** |
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
| 界面状态 11 态 | `tools/ys-editor/ys-state` | CLI 调用；状态名词表直接读其 `STATES` 元组 |
| 对象/容器 | `tools/ys-screen --containers` | CLI 调用；只做 schema 映射 |
| 取帧新鲜度 | `tools/ys-editor/ys-observe frame` | CLI 调用；**先 ys-atop，不抬窗** |
| 栈顶判定 | `tools/ys-editor/ys-atop` | 退出码 0/1/2 |
| 意图 pre/post/账本 | `tools/ys-editor/ys-do` | 只读 actions/*.json；真执行需焦点授权 |
| 注入 | `tools/ys-editor/ys-gui-slot` | 默认禁用（allow_inject=False） |

## 7. 失败语义（fail-closed 一览）

| 情况 | 回执/异常 | 退出码（CLI） |
|---|---|---|
| 目标不存在 | `resolve_fail` | 3 |
| 目标多义 | `ambiguous`（列候选） | 4 |
| 缺 post / 未授权注入 / 窗口不在栈顶 | `invalid` / `precondition_fail` | 5 |
| 判据超时（不是故障） | `timeout` | 6 |
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
8. **状态判据的 OCR 成本**：daemon OCR 无缓存（同帧两次仍 ~700ms）⇒ subprocess 形态 look 慢。

## 9. 下一跳（需裁决）

- 若把「内容寻址 OCR 缓存 + 帧缓冲复用」下沉进 `ys-lookd`（或新常驻服务）：
  同帧 look 从 1.2–1.7s → ~0.2s（本原型以 in-process 补丁验证过路径，未改共享工具）；
- 票 24（学习型检测）才能让「新帧对象层」进 ≤10ms；票 25/26/27/28 才能补齐 slices/groups/state/affordance；
- live 路径验证需要游戏窗口在栈顶（用户侧操作），且注入路径需要一次性授权。

## 10. 复现

```bash
cd /home/h/genshin-ts
python3 .scratch/gui-service/selftest.py        # 53 条契约自测（离线，0 注入）
python3 .scratch/gui-service/bench.py           # 延迟实测 → bench.md + evidence/bench.json
python3 .scratch/gui-service/inproc_probe.py    # 同进程仪器尖刺 → evidence/inproc.json

# 三动词 CLI（离线帧示例）
python3 .scratch/gui-service/worldsvc.py look --frame .scratch/gui-corpus/f06.png --summary
python3 .scratch/gui-service/worldsvc.py act --text 祈愿 --frame .scratch/gui-corpus/f06.png
python3 .scratch/gui-service/worldsvc.py wait --predicate '{"state_in":["GAME_PAIMON"]}' \
        --frame .scratch/gui-corpus/f06.png --timeout-ms 3000
```
