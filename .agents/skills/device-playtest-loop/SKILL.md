---
name: device-playtest-loop
description: 千星真机（编辑器 + 沙箱客户端）试玩与取数的完整闭环。当任务需要**在真实游戏里验证玩法/资产/UI 行为**，或涉及：开试玩、退试玩、真机输入注入（键盘/鼠标/拖拽）、取节点图日志与负载、桌面 GUI 自动化点按钮、编辑器卡死自救、焦点占用与归还、截图判据、GPU 图像识别、试玩批次编排——必须使用本技能。它给出 `tools/ys-editor/` 工具链（ys-gui-slot / ys-playtest-start / ys-playtest-stop / ys-pointer-click / _ys-ui.sh / ys_look.py + ys-lookd 常驻服务 / 故障处置件）的用法、坐标与像素判据表、真机输入事件实测事实（43 键槽映射、拖拽阈值）、以及"一个试玩周期做完所有实验"的纪律。区别于 debug-log-investigator（只管日志格式与解析）与 qxqy-simulator（模拟器路线）：本技能负责**把真机实验跑起来、把数据取到手**。
---

# 真机试玩与取数闭环（device-playtest-loop）

> 最近校验：2026-10-17（技能族刷新 T01–T05：口径/命令面/权威指针/正向表述）

## 定位

把「人手工去游戏里点一遍、看一眼、记一下」变成**机器可执行的闭环**：

```text
准备（编辑器/沙箱就绪） → 试玩 ys-playtest-start → 注入实验批次（一次拿焦点跑完）
→ 退出 ys-playtest-stop（让 Debug_Log 落盘） → 离线解析 gia_log.py → 反馈 → 下一轮
```

本技能**只管"怎么把实验跑起来、把数据取到手"**；日志格式与语义解析归 `debug-log-investigator`，
玩法管线归 `game-from-scratch`，最小注入核验归 `verify-injection`。

**职责分离（与全局 `computer-use` 技能）**：

| 层 | 技能 | 内容 |
|---|---|---|
| 通用方法论 | **`computer-use`**（全局技能） | 桌面自动化的通用方法：成本链、优化四步、常驻服务通用式、`cu` 通道（AT-SPI 优先 / 截图 / OCR 兜底）、焦点协商通用规范 |
| **千星专属资产** | **本技能** | `tools/ys-editor/` 工具链、试玩流程与坐标判据表、真机输入事件事实、日志取数通道、编辑器故障处置件 |

**两者相互引用**：要做通用 GUI 自动化（非千星）→ 走 `computer-use`；要动千星编辑器/沙箱 → 走本技能，
方法层仍复用 `computer-use` 的成本链与优化四步。

## 何时用 / 不用于

| 用 | 不用于 |
|---|---|
| 真机验证玩法/资产/UI 行为、取输入事件、取节点图日志与负载 | 纯静态资产比对（走 `assets:*` 的 `--output` 候选回读） |
| 编辑器/沙箱窗口层故障（点不动、启动不了、焦点被抢） | 模拟器路线（走 `qxqy-simulator` 技能 / `gsts client:sim`） |
| 需要"点按钮→等画面→再点"的 GUI 编排 | 纯离线 GIA/GIL 分析（走 `tools/*.ts`） |

**先模拟器后真机**是默认顺序：能在模拟器验证的（UI 树/字段/试玩）先用 `qxqy-simulator` 或 `gsts client:sim`，
真机只留"模拟器证明不了的事"（真实输入、真实渲染、真实负载、真机 API 差异）。

## 铁律（违反 = 白烧十分钟以上）

> 完整条文见根 `AGENTS.md`「真机实验铁律」；这里给可执行版本。

0. **动手前先跑 `ys-preflight`**（2026-10-17 复盘产出）——它把「默认前提」做成一条命令：
   仪器是否走对通道、原神窗在不在栈顶、画面有没有停在结算页、编辑器在哪个态、**节点图挂载还在不在**。
   为什么是第 0 条：2026-10-17 那晚 15 个错误里最大一族是**默认前提未取读数就往下建**
   （用户原话「你又缺少探索就定目标」，出现两次），每条都白烧 ≥10 分钟。
   实测：首次跑就抓出「0 个宿主挂载 ⇒ 图不会执行」——那正是反复「日志里没有我的标记」的根因。
   退出码 1 = 有 FAIL，先修；2 = 有 WARN，读过再继续。
1. **注入必须在 `ys-gui-slot` 槽内**（2026-10-17 实证，**本技能最贵的一条**）：
   `ydotool` 只负责把事件送进内核，**事件进哪个窗口由当时的焦点决定**。
   实测：原神窗在堆叠序第 **[9]** 位、ACTIVE 是 **Firefox**，此时裸调 `ydotool key` 的键
   **全部送进 Firefox**——表现是「ESC 没反应」「按 W 玩家不动」「连按 6 次菜单都不开」，
   而真因是**根本没送到游戏**。正确写法：
   ```bash
   ys-gui-slot 0x01400001 90 bash -c 'ydotool key 17:1; sleep 3; ydotool key 17:0'
   ```
   槽内回读 `xdotool getactivewindow` 必须等于目标窗 id 才算数。
   ⚠️ `ys-kwin-raise` 的第一个参数是**标题子串**（如 `原神`）**不是窗口 id**；
   传 id 它会回报 `FAIL not-found`，读起来像"窗口不存在"，实际窗口好好的——**别信这条报错**。
2. **截图新鲜度判据**（2026-10-17 实证）：`import -window <id>` 在**窗口被别的东西压住**时
   返回**陈旧帧**——实测按空格前后两帧 **差异 0 像素（字节完全相同）**。
   ⇒ **「画面没变化」不能推出「输入没生效」**（本轮因此把一条待定结论误写成"玩家不能跳"）。
   判据：抓两帧必须**不相同**才算新鲜；否则用 `ys-peek`（**默认零打扰**：取 daemon 常驻帧、不抬窗；要抬窗得显式 `--allow-raise`）再抓。
3. **一个试玩周期内把所有实验跑完**——一次进出周期 ≥3 分钟（UI 抖动 5~25s + 加载 30~60s）。做法：先把键盘/鼠标/拖拽/UI 操作**整批注入完**，再退出取日志。
4. **一个批次只切一次焦点**——用 `ys-gui-slot` 完成「拿到 → 跑完 → 归还」，批次内部保持同一个焦点时段。
5. **取数走「爆发注入 + 退出落盘 + 离线解析」**——屏幕有 2s+ 延迟甚至整帧冻结；这条通道又快又准。
6. **等待用「轮询 + 判据」**——按判据轮询（实测弹窗约 7s 出现、暂停菜单 >8s，固定 `sleep` 会漏）。
7. **读界面用 `read_image`（原生视觉）**——中文界面可读且零额外依赖。
   **OCR 只是文本通道，不是"读界面"**：`名字旁边有没有图标 / 区域是否被叠加层遮住 / 两个控件是不是一行`
   这类信息 **只在图里**（2026-10-17 实证：ESC 菜单页存档名右侧的圆形铅笔按钮 (523,96) 在本地/云端 OCR
   里**完全不存在**，我因此绕去右键菜单瞎试 40 分钟才被用户点破）。⇒ **抓帧后先看一眼整图，再查 OCR**。
8. **动作前身份断言，动作后同对象读回**（2026-10-17 实证）：列表/卡片类界面**坐标不稳定**——
   同一个 (1681,387) 在去程指向「输入探针v2」、回程指向「未分类页签_存档_1」。
   正确形态：`OCR 断言目标名在列 → 点 → 读确认框原文（会点名目标）→ 提交 → 在同一对象上读回`。
9. **rc 与 stderr 不许吞**：`ys-pointer-click` 的 `rc=5` = **12 轮未命中**（stderr 带目标与当前坐标），
   `rc=4` = 步进过小。调用点写 `2>/dev/null 2>&1` 会让"点空了"看起来像"点到了"（本轮同族 4 处已修）。
10. **命令限时**（全局守则第 5 条）：预计 >5s 就先优化、单条 ≤20s、长任务放后台。

## 三条 2026-10-19 用户/实测回灌（GUI 工作里反复踩）

1. **找东西先看已知索引，再考虑全仓搜索**（用户原话：「别扫盘，教程目录很明显」）。
   我为找本地官方教程跑全仓 `grep -rl`，60s 超时转后台；而 `docs/ui-tutorial/README.md` 第一张表就是文件地图。
   ⇒ 顺序恒为 **`ls` 一层 → 该目录 README/文档地图 → 定向 grep → 全仓搜索（需理由）**。
2. **评测通道过了 ≠ 生产线过了**（★ 常驻进程改代码不重启 = 没改）。
   `ys_lookd` 是常驻服务，检测器实例按路径缓存在 `_DETS`：**改 `gui_det.py`/`ys_lookd.py` 后必须重启 lookd**，
   且任何模型/解码改动都要额外报一条**生产入口 `gui_det.Detector.detect()`** 的读数（不能只报评测台数字）。
   重启姿势（`pgrep -f` 会自匹配，必须精确解析）：
   ```bash
   PID=$(pgrep -f '^python3 ys_lookd.py$' | head -1)     # 只取精确 cmdline
   [ "$(tr '\0' ' ' < /proc/$PID/cmdline)" = "python3 ys_lookd.py " ] && kill "$PID"
   rm -f /run/user/1000/ys-lookd.sock
   cd tools/ys-editor && DISPLAY=:1 XAUTHORITY=/run/user/1000/xauth_oypYEi \
     setsid nohup python3 ys_lookd.py > /tmp/ys-lookd.log 2>&1 < /dev/null &
   ```
3. **"恒定值 / 空列表"先判它是读数还是没接上**。2026-10-19 一天踩了三次同形态：
   判据只写在两条路径之一（state 漂移）、结果算出来没透出去（detections 不暴露）、
   条件回退被单个假阳性短路（"容器为空才回退"，世界里 CV 吐 1 个假 panel ⇒ 57 个真框全丢）。

## 四条 2026-10-21 回灌（「仪表说没事、其实没做事」）

1. **服务活着 ≠ 在产帧**。`systemctl --user is-active ys-capture` 是 active、`latest` 却回
   `DAEMON_DOWN`：因为守护进程起来了但每帧 `XShmGetImage xerr=8`（窗口 id 写死旧值 / 发现逻辑挑到同
   class 的子窗），而失败**零日志**。判据：`ys-capture status` 看 `state.seq` 是否在涨、`last_err` 是否空；
   排查看守护自己的 stdout 有没有 `stage=grab` 行。现在它是 systemd 常驻（`ys-capture.service`），
   机械防线 = 失败账本 `capture-liveness` 闸门。
2. **滚动必须能回答「动没动」**。`ys-scroll` 画面逐像素一致时**旧版照样 rc=0**，我因此连吃 3 次空滚。
   现在回执有 `frame_diff` + `moved_confirmed`（`null`/`false`/`true`），没动即 **rc=6 NO_MOVEMENT**；
   `--no-verify` 只用于「只要注入、不要证据」的场合，它**不回答**动没动。
3. **动作前先等 `settled`**。`world` 回执的 `settled.same_as_prev` 必须是 `true` 再点击：
   派蒙菜单打开后布局还在漂移（实测 tile 网格 y 从 478/668/856/1046 变成 452/572/760/950，约 94px），
   照首读 bbox 点 (677,556) 会落到「角色」而不是「好友」；稳定要 **8.8s**。
4. **游戏内有对话框时 ESC 先关对话框，不开派蒙菜单**（2026-10-21 实测）：连发两次 ESC
   （`ys-esc` 与槽内 `ydotool key 1:1/1:0`）后 `world` 仍回 `GAME_WORLD`，且 free_text 出现
   「临时」「3」这类对话选项文本 ⇒ 不是注入坏了，是**当前界面在吃 ESC**。判据：先读 free_text，
   看到对话/选项文本就先结束对话，别连续空按 ESC。
5. **状态词表已经细分到面板级**：`GAME_FRIENDS`（「好友」标题 + `/200` 计数）、`GAME_CHARACTER`
   （「命之座」+「圣遗物」）。同层冲突由 `PRECEDENCE` 消歧（面板 3 > 派蒙/活动 2 > 世界 1），
   并列仍 `AMBIGUOUS`。**走到派蒙菜单里的二级页面时，别再用 `GAME_WORLD` 当判据**。

**屏幕占用契约（用户令 2026-10-21，已做成设计）**：这个桌面不是只有我们在用。**每次长时间占用前**：
① 先看**当前活动窗口**（KWin 权威，`ys-lease kwin-state` 的 `active`；`xdotool getactivewindow` 会给 1×1 幽灵窗）；
② 在对话里**申请时长**，拿到同意后再 `tools/ys-editor/ys-screen-grant grant --seconds N --reason '做什么'`；
③ 凭据到期即失效。没有有效凭据时 `ys-gui-slot` 会以 **rc=6 NO_GRANT** 拒绝执行（自测走 `YS_SLOT_TEST=1`）。
缺这一步的代价：用户同时在操作屏幕 ⇒ 焦点/画面被夺 ⇒ 出现"莫名其妙的 bug"（已记 F-20261021-50）。

## 🖐「交还屏幕」= 切回默认屏（firefox），不是"恢复到我拿之前的窗"

用户口径（2026-10-21 第 N 次强调，已两次投诉）：
- 判据两条同时成立：`activeWindow == firefox` **且** `stacking.index(firefox) > stacking.index(原神)`。
  只 activate 不 raise = 焦点回去了、画面没回去（D424）。
- **占用时目标已在焦点也要切回**：那是 noop 租约，但释放仍必须归 firefox。旧实现直接 `return`，
  用户仍盯着游戏而回执 ok:true（已记 F-20261021-49）。
- 失败、超时、看守放弃 —— **一律切回 firefox**，且**非零退出**（rc=9），不许给调用方"可忽略的失败"。
- 底层：`ys-lease _restore(None)` + `ys-gui-slot` 的 `ALREADY_FOCUSED` 分支；
  回归 `tools/ys-editor/tests/focus-default.selftest.sh`（闸门 `focus-default`）。
- **报"屏幕已还"之前必须先取一次 KWin 权威读数**——`xdotool getactivewindow` 在 KWin/Wayland 下
  返回 1×1 幽灵窗（`0x200000`），拿它当"焦点还在游戏"会得出完全相反的结论（D428）。

### 归还的三层机制（2026-10-23 修复后口径，F-20261023-04）

「谁负责把屏幕还给用户」按层分工，**凭据（许可）≠ 占用**：
- **空闲层（主力，10s 粒度）**：槽取得焦点 ⇒ `ys-session claim --prev-json <槽启动时真实前台窗>`
  自动建立 **auto-session**（无需 begin）；槽结束 ⇒ `hold-done`（holding=0、空闲从**槽结束时刻**起算）；
  空闲 `idle_ms`（10s）且画面还在游戏 ⇒ guard `SESSION_IDLE` 交还到 prev 记录的用户窗（prev 缺失/游戏类 ⇒ firefox 回退）。
  紧邻下一槽（<10s）claim 刷新 ⇒ 不闪切（实测：双槽间隔 4s，中途 0 交还、末槽后恰好 1 次）。
- **许可层（兜底，290s 粒度）**：凭据过期 ⇒ guard `GRANT_EXPIRED` 交还并删凭据。**不要依赖它做日常归还**——
  模型连续 grant 时凭据不断，屏幕会被钉死（.03/.04 事故实测 58 分钟零归还）。
- **槽自身 trap**：凭据**已失效**时的立即归还路径（`lease_hold_active`=false ⇒ restore + rc=9 失败硬报）。
真机读数：单槽结束 → **10.03s** 后 SESSION_IDLE 还 firefox（`hold_done.at→released_at` 精确可复算）。
⚠ guard 是常驻 python 进程：**改 `ys-focus-guard` 源码后必须 `systemctl --user restart ys-focus-guard`** 才加载新代码。
回归：`python3 tools/ys-editor/tests/session-claim.selftest.py`（T8–T16）。

## 桌面环境换了 = GUI 注入链可能整体静默失效（2026-10-26 实测，先查这条）

`tools/ys-editor/` 的焦点/注入层**原本强绑 KWin**（`gdbus org.kde.KWin /Scripting`）。
本机 2026-10-26 换成 **GNOME**（`gnome-shell` + `mutter-x11-frame`）后，`ys-lease` / `ys-gui-slot` /
`ys-wins` 全部报 `KWIN_UNAVAILABLE`（fail-closed），而 `dsh-guard` 的 **L1-FOCUS 规则又强制必须走它们**
⇒ **完全死锁**：裸调 `xdotool` 被守卫拦、走硬通道被 KWin 缺失拦。

**判据（30 秒）**：`ps -eo comm | grep -iE 'kwin|gnome-shell'` + `echo $XDG_CURRENT_DESKTOP`。
看到 gnome-shell 而没有 kwin ⇒ 命中本条。

**已修（commit `062ce36a`）**：`ys-lease` 新增 `_state_ewmh()` 回退，返回结构与 `kwin_state()` 一致
（`_verify`/`_pick`/`_resolve_target` 无需改动）。四条读数来源与**四个实测坑**：

| 项 | 用这个 | 别用 | 坑 |
|---|---|---|---|
| 堆叠序 | `xprop -root _NET_CLIENT_LIST_STACKING` | — | **输出是 `window id # 0x…`（冒号+#，没有等号）**，按 `=` 切分得到空列表 ⇒ 回退恒 None |
| 几何 | `xdotool getwindowgeometry <wid>` | `wmctrl -lGx` | **`wmctrl` 被 `ys-shim` 拦（rc=77）** |
| 类名 | `xprop -id <wid> WM_CLASS` | — | — |
| 标题 | `xprop -id <wid> _NET_WM_NAME` | — | **不抓 caption 会让 `ys-gui-slot` 报 `TARGET_UNRESOLVED`**（候选找到了但匹配不上） |
| 活动窗 | `xprop -root _NET_ACTIVE_WINDOW` | `xdotool getactivewindow` | Mutter 下两者都可能给**幽灵窗 `0x200003`**（不在堆叠表）⇒ 用栈顶作代理并在 state 标 `active_proxy` |

**两条环境事实**：
- **Wayland 原生窗口（如 firefox）不出现在 X11 的 `_NET_CLIENT_LIST_STACKING` 里** ⇒ 交还目标 `FALLBACK_CLASS=firefox`
  永远找不到。`GNOME Shell Eval` 在 **GNOME 41+ 默认禁用**（实测 `gdbus … org.gnome.Shell.Eval` → `(false, '')`），拿不到 Wayland 窗表。
  ⇒ 已改为**降级语义**：无回落窗时返回 `ok + noop + detail` 明示"未改动任何窗口"，**不保留租约**
  （保留会让屏幕被钉死、guard 回收不了）。
### 激活窗口：用 `wmctrl -i -a`（2026-10-26 实测，唯一在 Mutter 下有效的通道）

| 方法 | 结果 |
|---|---|
| **`/usr/bin/wmctrl -i -a <wid>`** | ✅ **有效**（`_NET_ACTIVE_WINDOW` 从幽灵窗 `0x200003` 变为目标窗，用户当场确认画面切过去） |
| `xdotool windowactivate` | ❌ 返回 0 但**无效**（active 仍是幽灵窗） |
| `xdotool windowfocus` | ⚠️ 只设 X 输入焦点，不改 EWMH active |
| `GNOME Shell Eval` | ❌ GNOME 41+ 默认禁用（`(false, '')`） |
| `org.gnome.Shell.Introspect.GetWindows` | ❌ `AccessDenied` |
| `xdotool windowraise` | ⚠️ 只在 X11 层抬升，Wayland 原生窗仍在它之上 |

**注意 shim**：`wmctrl` 会被 `tools/ys-editor/shims` 拦成 rc=77（**子进程也吃 PATH 里的 shim**）；
工具内部调用要用**绝对路径 `/usr/bin/wmctrl`**。已修进 `ys-lease._raise_once` 的 GNOME 回退（commit `bc9fa908`）。

### 输入注入在 Wayland 下**是有效的**——但要先确认"真的没有别的东西盖着"

**2026-10-26 更正**：我一度写下"输入注入完全不可用"，那是**错误结论**，已撤回。
事实是同一天我用 `ys-gui-slot` + `xdotool mousemove/click` **成功采集到了音效库数据**（环境/角色动作/物件三类）。
失败的几次全部发生在"窗口没真正在前台"时。

**唯一可靠的"我现在能点中目标吗"判据**（比 `_NET_ACTIVE_WINDOW` 可信）：

```bash
xdotool getmouselocation        # 看它报的 window: 字段
```

| 读数 | 含义 | 动作 |
|---|---|---|
| `window:` == 目标窗 id（如 `16777219` = 0x1000003） | ✅ 指针下的窗口就是目标，点击有效 | 直接点 |
| `window:` == **`0x1800003`**（匿名、2560×1440、**不在 `_NET_CLIENT_LIST_STACKING` 里**） | ⚠️ 这是 **Mutter 的全屏输入转发层**：有一个 **Wayland 原生窗（如 firefox）盖在最上面** | 请用户最小化那个窗，或切到别的工作区 |

**机制**：Wayland 会话里 Xwayland 窗的输入走 Mutter 的转发层（`0x1800003`）；
`_NET_CLIENT_LIST_STACKING` **只列 X11 窗**（本机只有 3 个 beyondeditor + 1 个 yuanshen），
**看不到 firefox**——所以"X11 层面 covered_ratio=0.0"完全不能证明"原神在最上面"。

**两条通道的分工（都实测有效）**：
- 激活/抬升窗口：`/usr/bin/wmctrl -i -a <wid>`（`xdotool windowactivate` 在 Mutter 下静默失败）
- 点击/按键：`ys-gui-slot` 槽内 `xdotool mousemove` + `xdotool click`（**前提**：上面的判据通过）

**方法论教训（这条比上面所有事实都重要）**：**"某个条件下失败"≠"环境不支持"**。
我连测四次失败就下了"能力缺口"结论并写进技能——而我自己的成功采集记录就在前面的对话里。
判据顺序应是：①我有没有成功过？成功那次的条件是什么？②失败那几次和成功那次的**差异**是什么？
③只有"条件对齐后仍失败"才够格谈环境限制。
