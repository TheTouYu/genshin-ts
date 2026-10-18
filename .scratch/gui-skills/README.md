# gui-skills — 票 32：5 条实测任务 → gui-skill 编排技能 + 失败自愈三招

> 建：2026-10-18 ｜ 作者：orchestrator（票 32）｜ 上游：`.scratch/gui-stack/issues/32-orchestration-skills.md`
> 设计依据：`tools/gui` 执行器契约（四类假成功判据 + 动作身份三件套 + 单步硬上界 10s）；
> 资产速查见 `.scratch/gui-stack/BOARD.md §①`。
> 改动面：**新增** `.scratch/gui-skills/` 全套 + **`tools/gui` 加三件能力**（Lead 2026-10-18 授权，默认行为不变）。

---

## 0. 一句话现状

| 指标 | 读数 |
|---|---|
| 5 条真机任务落成 JSON plan | **5/5**（`skills/*.json`，`tools/gui lint` 全绿） |
| 离线可执行（判据链齐全、跑绿、留证据） | **5/5**（`run --all` 退出码 0；2026-10-18 19:49 一轮 5 条全绿） |
| 真机已验证 | **0/5**（没动过焦点、没注入；阻塞=**等票 34** + Lead 放行，见 §5） |
| 含 pending 步（能力缺口） | **3 步**（load-save 1 / find-qianxing 1 / fetch-log 1） |
| 四类假成功判据（注入失败） | A1–A5 全按契约停住（退出码 3/4/3/4/4，整条进程 ≤10s） |
| 三件新能力的负样本 | N1 窗口不符 F4 / N2 滚动边界 NO-MORE / N3 按住不足 HOLD-TOO-SHORT **全绿** |
| 自愈三招 | ①命中 2 / 未命中 2；②推翻 0 / 确认 1 / 帧外 1 / ①已恢复 2；③记账 4 条 |
| 离线回归 | `selftest/run-selftest` → **66 通过 / 0 失败**（退出码 0） |
| 共享执行器回归 | 门槛② `fake-success.selftest.sh` → **✓ 全绿（53 项）**；门槛⑤ `ys-gates --only 5` → **PASS** |

**技能化率口径**（写清分母，别让人误会）：
- 「可执行」= 判据链齐全 + 用**真实帧**跑绿 + 证据可重算（`ledger.jsonl` + `evidence/`）⇒ **5/5**（任务书目标 ≥3/5）。
- 「真机可执行」= 真在编辑器/游戏里点过并留行为读数 ⇒ **0/5**。原因不再是我方缺能力（三件已补齐），
  而是**取帧链路 fail-open（票 34）**：`ys-observe` 报 `atop:true window=0x01400001` 时像素可能是别的窗口
  ⇒ 对着错误画面执行比不执行更糟。**等 34 修好再做单条冒烟（load-save）**。

---

## 1. 目录

```
.scratch/gui-skills/
├── README.md               ← 本文件
├── incidents.md            ← 能力缺口/仪器事故（EC-F001..F008，实测读数 + 最小下一步 + 提升命令）
├── run                     ← 编排执行器：复用 tools/gui + 自愈三招 + 账本 + 计数
├── ledger.jsonl            ← 运行账本（append-only；每次尝试一行，含①/②/③读数）
├── skills/                 ← 5 条技能（tools/gui plan + 离线段 + on_device + pending + real_machine）
├── fixtures/               ← 文字通道夹具（编辑器 UI 树 / 派蒙首屏与滚一屏 / 日志产物夹具）
├── bin/log-list            ← 产物清单（Beyond_Debug_Log 基线差分 → 文字通道）
├── selftest/run-selftest   ← 四类假成功注入（A1–A5）+ 三件能力负样本（N1–N3）+ 自愈三招（B1–B4）
└── evidence/               ← 每次运行的 run-*.json / stdout / summary.json / selftest.log
```

---

## 2. 5 条技能

| # | 技能 id | 真机任务 | 判据链（态/文本） | 离线帧（真实帧） | 最新证据目录 |
|---|---|---|---|---|---|
| 1 | `editor.playtest-start` | 进入试玩 | EDITOR → **ESC** → MENU → 试玩磁贴 → 直接上传 → 开始游戏(**按住 1.2s**) → PLAYTEST | `editor-grass-shadow / menu / playtest / playtest` | `evidence/20261018-195144-editor.playtest-start` |
| 2 | `editor.load-save` | 加载指定存档 `未分类页签_存档_1` | EDITOR → **ESC** → MENU → 存档管理 → SAVELIST → 【编辑】→ 确认框点名目标 → 确认 → EDITOR | `editor-grass-shadow / menu / savelist / editor-grass-shadow ×2` | `evidence/20261018-195142-editor.load-save` |
| 3 | `game.paimon-find-qianxing-entry` | 打开派蒙菜单并滚动找千星入口 | GAME_PAIMON → 「冒险等阶」→ **scroll(有界 until)** → 「千星奇域」 | `gui-corpus/f06.png`（首屏；滚动后夹具=f07） | `evidence/20261018-195146-game.paimon-find-qianxing-entry` |
| 4 | `editor.playtest-stop` | 退出试玩 | PLAYTEST → **ESC** → PAUSE → 中断挑战 → SETTLE → 离开 → EDITOR | `playtest / pause / settle / editor-grass-shadow ×2` | `evidence/20261018-195144-editor.playtest-stop` |
| 5 | `game.fetch-log` | 取一轮 Beyond_Debug_Log 并断言新文件出现 | 目录可读 → 基线已取 → **LOG-NEW**（名字不在基线 + 时间戳命名 + 字节数） | 无（产物通道，`bin/log-list` 生成清单） | `evidence/20261018-195146-game.fetch-log` |

每条技能自带四段（缺一段就是没写完）：
- `pre` / `post`：前置态/文本 + 后置效果断言（post 恒假 ⇒ F3 NO-EFFECT）；
- 写动作**身份三件套**：`target.desc` + `target.must_assert`（**`{"window":"0x01400001"}`** —— Wine 无 AT-SPI，
  文字身份在真机恒空）+ `evidence.fresh=true`；点击还带 `xy` + `hold_ms`（开始游戏 `min_hold_ms:1100`）；
- `on_device`：真机实测坐标/长按时长/陷阱（与离线夹具分开，互不冒充）；
- `pending` + `real_machine`：表达不了的步、需要什么、EC 编号 —— **显式列出，不静默跳过**。

真机坐标与判据全部来自实测记录：D317 试玩坐标表（试玩磁贴 **(183,389)**、直接上传 (1444,811)、
开始游戏 (1280,1052) 长按 ≥1.2s、中断挑战 (1280,877)、离开 (1818,1356)）；
`docs/maintenance/gui-catalog/measurements.tsv` EC-M001（存档管理 (39,176)、【编辑】 (1681,387)、
确认框原文「是否退出，并加载未分类页签_存档_1？」、确认 (1442,813)）。

---

## 3. 怎么跑

```bash
cd /home/h/genshin-ts

# ① 校验 plan（缺 pre/post/steps、写动作缺身份三件套、timeout>10s、按住要求缺坐标 都会被拒）
for f in .scratch/gui-skills/skills/*.json; do tools/gui lint "$f"; done

# ② 离线跑 5 条（真实帧 + 桩点击；窗口身份走测试桩；不碰桌面）
.scratch/gui-skills/run --all --json .scratch/gui-skills/evidence/summary.json

# ③ 全套回归：四类假成功 A1–A5 + 三件能力负样本 N1–N3 + 滚动正向 P1 + 自愈 B1–B4（66 断言）
.scratch/gui-skills/selftest/run-selftest [-v]

# ④ 汇总（技能化率 / 三招命中未命中 / pending 步 / 真机状态）
.scratch/gui-skills/run --summary
```

**「没碰桌面」的硬证据**（每份 `run.json` 自带，可机器复核）：`budget.frames=0`（活体取帧 0）、
`budget.focus=0`（抢焦点 0）、`budget.sleeps=0`（固定 sleep 0）、`frames_meta` 每帧带
`sha256 + captured_at`；执行器进程以 `DISPLAY=` 起（真抓屏会当场失败）；窗口身份读数 `reader=override`
（测试桩，执行器会打印「不是真实焦点」）。

---

## 4. 失败自愈三招（定义 / 实现 / 计数 / 证据）

按序升级：**①换通道重试 → ②重新取帧反证 → ③停下报告并记账**。**只有①能让失败算「恢复」**；
②只产出诊断（推翻≠通过），防止把失败洗成绿——这条是自测抓出来的（`incidents.md` EC-F008）。

| 招 | 实现 | 命中判据 | 计数（每个技能最新一次） | 证据字段 |
|---|---|---|---|---|
| ①a 判据通道 | `ys-state(fast)` ↔ `vision(legacy GPU)`；**先探备用通道单帧延迟**，>2000ms 直接判「未命中：备用通道太慢」 | 换通道后整条技能跑绿 | judge-channel **1 命中 / 3 未命中**（未命中全是「太慢」：9414/9889/10560ms） | `healing.m1.axes[].probe{state,ms}` |
| ①b 输入通道 | 指针 `click` ↔ 键盘 `key`（步内 `alt_input` 声明等价键；换通道后**身份三件套照旧**） | 换输入通道后跑绿 | input-channel **1 命中 / 3 未命中**（无已验证键盘等价路径） | `healing.m1.axes[]` |
| ② 重新取帧反证 | a) 同一帧文件**新进程重判** + 校 `sha256`（变了=证据陈旧）；b) 有第二张真实帧时用第二帧复现同一读数（不复现=判据脆）。绝不复用上一轮判据结果 | 反证**推翻**原观测 | **推翻 0 / 确认观测可信 1 / 失败非帧判据 1 / ①已恢复未做 2** | `healing.m2{verdict,a_same_frame{sha_then,sha_now,rejudge},b_second_frame}` |
| ③ 停下记账 | 打印「哪条断言为假 + 期望 + 观测值 + EC-Fxxx」；写 `ledger.jsonl`；退出码沿用 tools/gui（3/4），**绝不 0** | 每次停机一条 | **4 条**（编号每次运行自增（最新一轮 EC-F126..F129）；编号域说明见 §7） | `healing.m3{ec,line,expected,observed}` |

② 的真机分支（本票未跑）：`ys-observe` 重新抓一帧（自带新鲜度证明，`NOT_ATOP` 拒绝）——
但当前 `ys-observe` 的 atop 判定 fail-open（票 34），所以**真机分支要等 34**。

---

## 5. `tools/gui` 新增三件能力（Lead 授权；默认行为不变）

| 能力 | 用法 | 负样本自测（Lead 要求的三条都在） |
|---|---|---|
| **窗口身份通道** | `"must_assert": {"window": "0x01400001"}`；读数 = `xdotool getactivewindow`（回退 `getwindowfocus`，与 `ys-gui-slot` 同源），证据带 sha+captured_at + `reader` | **N1**：override=0x00deadbe ⇒ `OBJECT-MISMATCH step#1 … 时点=动作前`，退出码 4，**动作未执行** |
| **滚动动作** | `"act":"scroll","direction":"down","amount":3,"until":{"text":"千星奇域"},"max_tries":5` | **N2**：首屏树 + max_tries=3 ⇒ `NO-MORE step#2 max_tries=3 … 已到边界/该容器不可滚`，`tries=3`（有界不空转）；**P1** 正向第 1 轮命中 |
| **按住时长** | `"target":{..., "xy":[1280,1052], "hold_ms":1200, "min_hold_ms":1100}`；无坐标要 hold ⇒ `HOLD-NO-XY` | **N3**：hold_ms=130 < min_hold_ms=1100 ⇒ `HOLD-TOO-SHORT step#6`，**动作未执行** |

兼容性：默认行为不变——不写 `window` 走老文字/判据通道、不写 `scroll` 就没有新 act、不给 `hold_ms`
就还是原来的 `cu click`。共享回归：**门槛② `fake-success.selftest.sh` ✓ 全绿（53 项）**、**门槛⑤ PASS**。

---

## 6. 四类假成功判据：注入即停（复用 tools/gui，不另写判据）

A 段**直接打 `tools/gui`**（不经自愈），用**我的技能**当被测对象：

| 用例 | 注入 | 实测失败行 | 退出码 | 耗时 |
|---|---|---|---|---|
| A1 F1 断言为假 | 帧序列里没有 MENU | `ASSERT-FALSE step#2 expected=state=MENU observed=PLAYTEST` | 3 | 8573ms |
| A2 F2 目标解析失败 | 去掉 xy（身份过）但树里没有按钮「试玩」 | `RESOLVE-FAIL step#3 … 候选=0` | 4 | 670ms |
| A3 F3 动作无效果 | 步骤全绿、post 期望帧序列里没有的 SETTLE | `NO-EFFECT step#7 post=state=SETTLE observed序列=[…]` | 3 | 5778ms |
| A4 F4 对象不符（文字） | 身份断言指向不存在的存档卡 | `OBJECT-MISMATCH step#5 … 实测对象「<未命中>」 时点=动作前` | 4 | 1824ms |
| A5 F4 对象不符（判据） | 点击前后态不同（MENU → PLAYTEST） | `OBJECT-MISMATCH step#3 … 实测对象「PLAYTEST」 时点=动作后` | 4 | 1927ms |

全部满足契约：**固定失败行 + 期望/观测值 + 退出码非 0 + 整条 ≤10s + run.json 合规（frames=0 focus=0）**。

---

## 7. 已知偏差 / 待裁决（读报告前先看这段）

1. **真机 0/5 且原因明确**：不是我方缺能力（三件已补），是**取帧链路 fail-open（票 34）**：
   Lead 19:42 实测 `ys-observe` 报 `atop:true window=0x01400001` 而像素是浏览器 ⇒ 身份层本身不可信。
   **34 修好 + Lead 放行**后才做单条冒烟（建议先 `editor.load-save`）。
2. **② 的离线口径与真机不同**：离线=同帧新进程重判 + sha 校验 + 第二帧复现；真机=新抓一帧（等票 34）。
3. **`fixtures/*.txt` 是文字通道夹具**：文案取自实测记录（D317 / measurements.tsv EC-M001 / `gui-corpus/README.md` f07），
   但**不是** AT-SPI 实录（Wine 根本没有树）；只服务离线回归，真机判据缺口见 EC-F004。
4. **窗口身份测试桩**：离线必须 `GUI_TEST_HOOKS=1 + GUI_ACTIVE_WINDOW_OVERRIDE=0x01400001`（`run` 自动带上），
   执行器会打印「不是真实焦点」，`reader=override` 落进 run.json —— 证据里能一眼看出是桩。
5. **编号**：`EC-F001..F008` = failure-ledger 事件（`incidents.md`）；`EC-M###` 保留给 `gui-catalog` 操作目录条目。
   **未提升进 `docs/maintenance/failure-ledger.tsv`**（跨 scope + 需要先登记 gate，见 `incidents.md` 文末）。
6. **未跑**：`ys-gates` 全六门槛（只跑了门槛② 的 fake-success 套件与门槛⑤）；`resolve-click` / `screen-digest` /
   `domain-selftest` / `daemon-resilience` 四个套件未跑 —— 它们不覆盖本次改动面，但**要过门槛② 的完整判据仍需 Lead 跑一次全量**。

---

## 8. 与票 32 验收项对照

- [x] 5 条实测任务落成 `gui-skill`（pre / steps（身份三件套）/ post + on_device + pending）
- [x] 技能化率：**离线 5/5**（目标 ≥3/5）；真机 0/5 且原因=票 34 + Lead 放行；pending 步 3 个、blocked 0
- [x] 沿用 `tools/gui` 四类假成功判据（§6，A1–A5 全绿）
- [x] 失败自愈三招落地并计数（§4：①2/2、②0 推翻/1 确认/1 帧外/2 未做、③4 条）
- [x] 失败时输出「哪条断言为假 + 观测值」且 ≤10s 停止（§6 表）
- [x] 三件新能力各带负样本自测（N1/N2/N3），默认行为不变（门槛② 53 项仍全绿、门槛⑤ PASS）
- [x] EC-F 编号 + 提升命令（`incidents.md`，8 条里 3 条已补、5 条仍 open）
- [ ] 收轮三件套（勾票 + 看板 + commit）——由 Lead 执行（本票不 commit）
