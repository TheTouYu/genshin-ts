# 票 32 · 能力缺口与仪器事故登记（EC-F 编号）

> 编号域（Lead 2026-10-18 裁决）：**`EC-F###` = failure-ledger 事件**（F=failure）；
> `EC-M###` 保留给 `docs/maintenance/gui-catalog` 的**操作目录条目**（切存档/重命名/退出存档/活动领奖/参与预测）。
> 本文件 8 条：`EC-F001..F003` 已在本票把执行器补上（**待真机验证**），`EC-F004..F008` 仍是真债。
> 提升命令写在每条末尾（`status=open` 不需要 gate；要标 `prevented` 得先在
> `tools/failure-ledger.gates.tsv` 登记 gate —— 本票不给自动防线镀金，只给可跑命令）。

---

## EC-F001 — 真机「文字身份通道」不可用：原神是 Wine 窗，零 AT-SPI 树 → **已实现窗口身份通道**

- **类别**：遗漏（读数早就能取，流程没用上，于是按"能点"设计 plan）
- **症状（原始）**：写动作的身份协议只支持 `must_assert:{text|state}`。真机上 `live_tree()` →
  `cu state 原神编辑器` **返回空文本** ⇒ 身份读回 `<未命中>` ⇒ 写动作**动作前**就 F4 `OBJECT-MISMATCH`；
  文字定位 click 则 F2 `RESOLVE-FAIL 候选=0`。
- **读数**（2026-10-18 19:32，只读）：`xdotool search --name 原神` → `20971521`（窗口在）；
  `cu apps` 9 项（kaccess/xembedsniproxy/gmenudbusmenuproxy/xdg-desktop-portal-gtk/blueman-applet/
  blueman-tray/clash-verge/blueman-manager/netease-cloud-music-gtk4）**无「原神编辑器」**；
  `cu state 原神编辑器` → 空输出 rc=0 **2860ms**。
- **本票处置（已实现）**：`tools/gui` 增加**窗口身份通道** `"must_assert": {"window": "0x01400001"}`
  —— 读数 = `xdotool getactivewindow`（回退 `getwindowfocus`，与 `tools/ys-editor/ys-gui-slot` 的
  activeWindow 回读同源），证据带 sha256+captured_at（`artifact_text`），`identity.reader` 记录读数来源。
  默认行为不变（不写 `window` 就走老通道）；离线用 `GUI_TEST_HOOKS=1 + GUI_ACTIVE_WINDOW_OVERRIDE`
  桩，执行器会**大声打印**「不是真实焦点」，`reader=override` 落在 run.json 里。
- **负样本自测**：`selftest/run-selftest` 的 **N1**（override=0x00deadbe）→
  `OBJECT-MISMATCH step#1 … must_assert=window=0x01400001 … 时点=动作前`，退出码 4，**按键动作未执行**。
- **真机验证：待**（等票 34：`ys-observe` 的窗口身份 fail-open 未修，真机取帧可能对着错误画面）。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 遗漏 \
    --symptom "写动作的文字身份通道在原神(Wine)上恒为空：cu state 原神编辑器 返回空文本 ⇒ 真机每个 click/key 都先 F4" \
    --evidence "2026-10-18: cu apps 9 项无该应用；cu state 原神编辑器 空输出 rc=0 2860ms；xdotool search --name 原神=20971521" \
    --prevention "已实现 window 身份通道（xdotool getactivewindow，与 ys-gui-slot 同源）；负样本 N1 见 .scratch/gui-skills/selftest" \
    --status open
  ```

## EC-F002 — 执行器没有 scroll（滚动）动作 → **已实现有界 scroll**

- **类别**：遗漏（动作面缺口）
- **症状（原始）**：只有 `click/key/assert/wait`；「千星奇域入口在首屏之下」（`.scratch/gui-corpus/README.md` f07），
  滚动这一步无可表达，只能借未实测的 `key Next`。
- **本票处置（已实现）**：`"act": "scroll"`（写动作，需身份三件套）：`direction` down/up + `amount`（滚轮齿数）；
  带 `until:{text|state}` 时**有界重试** `max_tries`（缺省 6）：每轮滚一次再判，成立即成功；
  轮数用尽 → **`NO-MORE step#N 滚动 … max_tries=N 仍未出现 expected=…（已到边界/该容器不可滚）`**，退出码 3。
  真机注入 = `xdotool click 5/4`（滚轮），与既有 anchor 点击同族；**真机需在 `ys-gui-slot` 槽内调用**（沿用现有硬通道）。
- **负样本自测**：**N2**（首屏夹具树 + max_tries=3）→ `NO-MORE step#2 max_tries=3`，`evidence.tries=3`
  （有界、不空转）；**P1**（滚动后树）→ 第 1 轮出现，退出码 0。
- **真机待验**：`xdotool click 5` vs `key Next` 两条通道各测一次再定缺省（真机上「派蒙菜单能不能被滚轮滚」尚未实测）。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 遗漏 \
    --symptom "执行器无 scroll 动作，派蒙菜单「千星奇域」入口在首屏之下无法表达" \
    --evidence "tools/gui 原只接受 click/key/assert/wait；gui-corpus f06 无入口、f07 滚一屏后出现" \
    --prevention "已实现 act=scroll + until 有界重试 + NO-MORE 边界报告；负样本 N2、正向 P1 见 selftest" \
    --status open
  ```

## EC-F003 — 指针点击没有 hold_ms（「开始游戏」需长按 ≥1.2s）→ **已实现 hold_ms/min_hold_ms**

- **类别**：遗漏（动作参数缺口）
- **症状（原始）**：`开始游戏` 0.13s 按放会被整帧吞掉（实测需 `YS_CLICK_HOLD=1.2`）；只有 vision 锚点分支支持
  `hold_ms`，`cu click` 分支没有；而 profile 的 32 个锚点全是**状态**锚点、无按钮锚点 ⇒ 锚点分支不可用。
- **本票处置（已实现）**：`target.hold_ms`（实际按下时长）+ `target.min_hold_ms`（该控件最低要求）：
  - 有 `xy` + `hold_ms` → `xdotool mousemove → mousedown → sleep(hold) → mouseup`（动作时长，不是同步等待）；
  - `hold_ms < min_hold_ms` → **`HOLD-TOO-SHORT`**（退出码 3，**动作不执行**）；
  - 要求 hold 但目标只有名字（无 xy/anchor）→ **`HOLD-NO-XY`**（按名字点击无法控制按住时长）。
- **负样本自测**：**N3**（hold_ms=130 < min_hold_ms=1100）→ `HOLD-TOO-SHORT step#6 …`，
  `observed` 里**没有 click**（动作未执行）；正向：`cap-hold-ok`（hold=1200）→ `[stub] click xy=[1280,1052] hold=1200ms`。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 遗漏 \
    --symptom "指针点击没有 hold_ms：开始游戏需长按≥1.2s，0.13s 按放被整帧吞掉；只有 vision 锚点分支支持 hold，而 profile 无按钮锚点" \
    --evidence "tools/gui _do_action 锚点分支 hold=tgt.get('hold_ms',120)；cu click 分支无 hold；qianxing.json 32 anchors 全为状态锚点" \
    --prevention "已实现 hold_ms/min_hold_ms（不足即 HOLD-TOO-SHORT、无坐标即 HOLD-NO-XY）；负样本 N3 见 selftest" \
    --status open
  ```

## EC-F004 — 真机没有「文字/模板判据通道」：对话框原文、存档卡名、千星标题在 Wine 上判不了

- **类别**：遗漏（判据面缺口；与 EC-F001 同族但影响的是**判据**不是**身份**）
- **症状**：技能里三处判据是文字通道（`直接上传` 弹窗、`是否退出，并加载未分类页签_存档_1？` 确认框、
  `千星奇域` 标题）。真机上没有 AT-SPI 树（EC-F001 读数），也没有这些控件的模板 ⇒ **只有界面态判据可用**，
  这三步真机执行会 `ASSERT-FALSE`。
- **现状**：`skills/*.json` 的三步已标 `on_device.note`；`editor.load-save` 与
  `game.paimon-find-qianxing-entry` 的 pending 数组引用本条。
- **最小下一步**：为三处 ROI 做模板（`tools/ys-editor/templates/` + `ys-state` 探针），或用
  `tools/ys-screen` 的 OCR 结果当判据（注意：OCR 单帧 ~0.5s GPU / ~3s CPU，见 EC-F007）。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 遗漏 \
    --symptom "真机无文字/模板判据通道：弹窗、确认框原文、千星标题三步在 Wine 上判不了" \
    --evidence "cu state 原神编辑器 空输出；skills 里 3 处 assert text 只能离线（夹具树）通过" \
    --prevention "为三处 ROI 建模板/探针，或接 ys-screen OCR 作判据" \
    --status open
  ```

## EC-F005 — 没有负向文本断言（`must_not_contain`）

- **类别**：遗漏
- **症状**：「千星奇域入口**不在首屏**」这类结论需要负向断言，`assert_text` 只有包含判断。
- **本票的替代表达**：`selftest` 的**期望失败**用例（B4 / N2）：期望 `ASSERT-FALSE` / `NO-MORE`，
  证据落在失败行的观测值里（首屏夹具树的失败观测**不含**入口名）。
- **最小下一步**：`assert` 支持 `must_not_contain` / `absent:true`，失败行沿用 `ASSERT-FALSE` 口径。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 遗漏 \
    --symptom "没有负向文本断言：「入口不在首屏」只能用期望失败的派生检查表达" \
    --evidence "tools/gui assert_text 只做包含判断（want in text）" \
    --prevention "assert 支持 must_not_contain/absent，复用 ASSERT-FALSE 失败行" \
    --status open
  ```

## EC-F006 — 没有产物（文件）断言通道

- **类别**：遗漏
- **症状**：票 04 的 M4 是「产物判据完全不经过屏幕」，但 `tools/gui` 的判据只有界面态与文字树。
  `game.fetch-log` 只能把「日志目录清单」当文字通道喂进去（`bin/log-list`）。
- **最小下一步**：执行器加 `post.artifact`（新文件/大小/sha），或把 `bin/log-list` 提成 `tools/ys-artifact`。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 遗漏 \
    --symptom "没有产物断言通道：日志/文件类判据只能把目录清单伪装成文字树喂给执行器" \
    --evidence "tools/gui pre/post 只支持 state|text；judge_state 三后端均不涉及文件" \
    --prevention "加 post.artifact（新文件/大小/sha），或把 .scratch/gui-skills/bin/log-list 提成 tools/ys-artifact" \
    --status open
  ```

## EC-F007 — 备用判据通道延迟超预算：legacy vision 52ms → 9.4s → >60s；ys-state full 8.7~13.2s/帧

- **类别**：判据（通道本身不能当"换通道重试"的备用通道）
- **读数**（2026-10-18 19:30~19:46）：`ys-state --fast --frame` 六态全对 **280~346ms/帧**；
  `ys-state --frame`（full）同样全对但 **8.7~13.2s/帧**；`tools/gui run --state-backend vision`
  首测 348ms（三步 234+52+60），随后单次 **9409ms**、`settle.png` **>60s**；
  自愈①的探针在 selftest 里实测 **9414 / 9889 / 10560 / 10574 / 10729ms**。
- **本票处置**：自愈①**先探单帧延迟**，`>2000ms` 直接判「未命中：备用通道太慢」，不发注定超时的重试
  （`run` 里常量 `CHANNEL_PROBE_BUDGET_MS`）。
- **最小下一步**：票 33（热路径 ms 级）；或给备用通道加 ROI 裁剪版判据。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 判据 \
    --symptom "备用判据通道延迟超预算：legacy vision 52ms→9.4s→>60s；ys-state full 8.7~13.2s/帧，均无法在 10s 单步预算内当备用通道" \
    --evidence "2026-10-18: fast 280~346ms/帧；full 8.7~13.2s/帧；vision 单次 9409ms、settle >60s；自愈探针 9414~10729ms" \
    --prevention "换通道前先探单帧延迟（>2000ms 判未命中）；热路径提速见票 33" \
    --status open
  ```

## EC-F008 — 预算边界上把「没预算了」记成 `observed=TIMEOUT`（观测值失真）

- **类别**：判据
- **症状**：`assert_state` 的轮询在剩余预算不足时仍发一次 `probe(remaining)`；`probe_ys_state(timeout_s=remaining)`
  在 remaining 小于 ys-state 单次耗时（~300ms）时抛 `TimeoutExpired` ⇒ `state=TIMEOUT` ⇒ 失败记录写成
  `observed=TIMEOUT`，而**最后一次真实读数**只留在 `evidence.sequence` 里。
- **读数**（2026-10-18 19:44，`ledger.jsonl` 的 `selftest.h-m2-confirm` 首次尝试）：
  `failure={"class":"ASSERT-FALSE","step":2,"expected":"state=MENU","observed":"TIMEOUT",
  "evidence":{"sequence":"[PLAYTEST, EDITOR, EDITOR, PLAYTEST, PLAYTEST, TIMEOUT]","polls":16,
  "stop":"DEADLINE","channel":"timeout"}}`
- **本票处置**：`run` 的自愈②把 `observed ∈ {TIMEOUT,ERROR,NO-OBSERVATION}` 判为**观测无效（仪器问题）**，
  不当成被测对象读数、不做"同帧重判复现"对比、也**绝不让它把失败洗成通过**（这条曾被自测抓出一次假绿）。
- **最小下一步**：`assert_state` 的 `observed` 用**最后一次有效读数**，超时写进 `evidence.stop`；
  `_poll_loop` 在 `remaining < last_cost` 时直接停。
- 提升命令：
  ```bash
  tools/failure-ledger add --class 判据 \
    --symptom "轮询预算不足时仍发一次 probe(remaining)，超时被记成 observed=TIMEOUT，最后一次真实读数只剩在 evidence.sequence 里" \
    --evidence "2026-10-18 ledger selftest.h-m2-confirm: expected=state=MENU observed=TIMEOUT sequence=[PLAYTEST, EDITOR, …, TIMEOUT] polls=16 stop=DEADLINE" \
    --prevention "assert_state 的 observed 用最后一次有效读数；超时进 evidence.stop；remaining<last_cost 时直接停" \
    --status open
  ```

---

## 附：把本票自测登记成 failure-ledger 的 gate（Lead 执行；本票不代改共享数据）

```bash
# tools/failure-ledger.gates.tsv 追加一行（TAB 分隔）：
# gui-skills<TAB>bash .scratch/gui-skills/selftest/run-selftest<TAB>gui-skill 编排：四类假成功 + 自愈三招 + 窗口身份/滚动/按住 三个负样本
# 之后 EC-F001..F003 可改 status=prevented 并带 --gate gui-skills
```
