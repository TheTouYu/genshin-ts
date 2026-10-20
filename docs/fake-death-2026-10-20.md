# 千星编辑器「假死」取证报告（2026-10-20）

> 一句话结论：**点击确实进了应用，破坏发生在应用内部、且是「每个窗口各一份」的状态；该状态只能被
> 一次「窗口重新 configure（改几何）」清掉**。Wine 侧最可疑的落点是 `focus_out()` 无条件发
> `WM_CANCELMODE`，但**本机 runner 是 Spritz-Wine-TkG 下游版（驱动接口 111，vanilla 11.14 是 110），
> 补丁版 `.so` 目前装不上**——这是唯一挡在「根治」前面的硬障碍。

---

## 1. 现象与判据

假死时：窗口渲染正常、可移动、可获焦；**所有点击都不响应**（左树、页签、按钮），应用自己的 NLog 零新增；
进程活着、主线程有 CPU。

本轮把它变成**可判定的读数**（新仪器 `ys-clickable`）：

| 状态 | 探针动作 | 读数 |
|---|---|---|
| 健康 | 点击右上「网格/列表」视图切换 | `changed_px=3174`，`latency=43–47ms`，4 连击全中 |
| 健康 | 点击左树「职业节点图」行 | `changed_px=27620`，`latency=24.3ms` |
| 假死 | 同上 | `changed_px=0`（连点 3 次仍 0） |
| 静止噪声 | 连抓 6 帧 | `changed_px=0`（XShm 精确像素，严格为 0） |

判据：`changed_px ≥ 300` 才算「点得动」；**注入失败一律报 ERROR，不报 STUCK**（见 §5 的仪器坑）。

## 2. X 协议级铁证：点击**进了**应用

新仪器 `ys-xrec`（RECORD 扩展，零新依赖：`libX11`+`libXtst`，源码 `tools/ys-editor/ys-xrec.c`）同时记录
①服务器收到的请求 ②投递给指定客户端的事件。假死态下 3 次点击：

```
base=0x04000000 cat=0 EV:ButtonPress   btn=1 time=41904343 root=0x000004e9 win=0x04000008
                       rootx=120 rooty=267 x=120 y=267 state=0x0000 same_screen=1
base=0x04000000 cat=0 EV:ButtonRelease btn=1 time=41904874 win=0x04000008 rootx=120 rooty=267 state=0x0100 same_screen=1
```

- **事件确实投递给了编辑器客户端**（`win=0x04000008` 就是那个窗），坐标正确，press→release 成对；
- 22 秒全服务器记录里 **GrabPointer/UngrabPointer/ChangeActivePointerGrab/GrabButton/SetInputFocus/
  WarpPointer 请求数 = 0**，只有 2 条 `ChangeWindowAttributes mask=0x4000`（=CWCursor，换光标）。
  ⇒ **不是 X 抓取、不是焦点操作**，输入止于 Wine/应用内部。
- 注：core X **没有**「查询当前活动 grab」的请求，所以「查一下有没有 grab」这种取证在原理上不可得
  （历史 `ys-grabq` 的 174/174「0/0」不能当「无 grab」的证据）；行为读数才是判据。

## 3. 二分：什么会**致死**，什么能**解卡**

### 3.1 触发（每步先解卡→探针确认健康→施加触发→探针）

| 触发 | 结果 |
|---|---|
| 什么都不做（等 5s） | CLICKABLE |
| 只切焦点（激活编辑器 + 还焦点，`ys-gui-slot`） | CLICKABLE |
| 只把指针移到树上（hover） | CLICKABLE |
| 右键点一下 | CLICKABLE |
| **在左树行上左键点一次** | **STUCK**（连点两次同样 STUCK） |

### 3.2 解卡（同一活体标本，逐变体：手势 → 探针）

| 变体 | 内容 | 结果 |
|---|---|---|
| none / metric | 不动 / 只按 Meta | STUCK |
| rclick / rdrag1px / rdrag | 右键点 / 右键+2px / 右键+60px（无 Meta） | STUCK |
| mdrag | **Meta+左键拖动**（KDE 的 *move*） | STUCK |
| **full** | **Meta+右键拖动**（KDE 的 *resize*） | **CLICKABLE**（3174px，42–50ms） |

### 3.3 决定性一步：**纯几何重配**就够，不需要 KWin 手势

用 `xdotool windowsize` 给窗口发一次「高度 +1px 再还原」（**不发焦点、不动位置、不经过 KWin 交互**）：

- 主窗（千星沙箱）→ **用户确认：可以点了**；
- 但**另一个窗（资源管理器）仍然点不动** → 再对它做同样的重配 → **用户确认：也能点了**。

⇒ 两条新的硬结论：
1. **假死状态是「每个窗口各一份」**，不是进程级；
2. **清掉它的最小动作 = 该窗口收到一次 ConfigureWindow（几何变化）**。
   用户手势之所以有效，是因为 KWin 的 resize 会向客户端连发 ConfigureWindow——手势不是必需的。

### 3.4 机制候选（按与证据的吻合度排序）

| # | 候选 | 与证据的关系 |
|---|---|---|
| A | 应用（CEF 系）**每窗**的鼠标捕获/拖拽状态机卡住：一次「按下→（丢失/错误路由的）抬起」使其停在“按住”态；收到 resize 时取消拖拽 | **吻合 §3.3 全部读数**（per-window + reconfigure 复位） |
| B | Wine 侧 **stale capture**（`SetCapture` 指向的 HWND 没释放，点击被改道） | 能解释「点击到达但不响应」；但 capture 是**线程级**，与「per-window」不完全吻合 |
| C | Wine `focus_out()` **无条件** `WM_CANCELMODE`（`dlls/winex11.drv/event.c:747-750`，自 2022 `f3eebcfa4d` 未变） | 能解释「点击 + 失焦」组合致死；但解释不了 per-window |
| D | KWin/X 抓取泄漏 | **已证伪**（§2 零 grab 请求；KWin 在 Wayland 会话不调 XGrabPointer） |
| E | MIT-SHM/资源耗尽 | 与本症状无关（见 §5 的真实泄漏，已修） |

## 4. 上游与社区（详见 `.scratch/fake-death/research/UPSTREAM.md`）

- WineHQ **59653 / 59965**：症状与本案几乎逐字相同（「切窗之后 UI 元素点不动」），**均 UNCONFIRMED、
  零维护者回复、无上游修复**；59965 自带的补丁引用已删除的 `grab_hwnd`（commit `2b3512e7`），
  在它自称的 11.12 上就编译不过 ⇒ 不能当「上游方案」。
- KWin（Wayland）**不调用 XGrabPointer**；`Meta+拖动` 命中 `MouseActivateRaiseAndMove` 分支，
  先 `raiseWindow()+requestFocus()` 再起交互。
- KDE 525590（Wine 焦点回归）已修于 6.7.6，本机 kwin 6.8.0；518616（XWayland 不向原生 Wayland
  surface 发 FocusOut）仍 CONFIRMED。
- `HKCU\Software\Wine\X11 Driver` 里**真正影响输入/焦点**的只有 `UseTakeFocus`；
  `GrabPointer`/`GrabKeyboard`/`ClipCursor` 这些键在源码里**不存在**，`GrabFullscreen` 是死配置。

## 5. 本轮顺手修掉的真 bug（与主线相邻，已实测收敛）

### 5.1 `ys-capture` 抓帧尺寸写死 → 一帧都抓不到
千星窗是 2560×1371，脚本默认 2560×1440 ⇒ `XShmGetImage` 每帧 BadMatch，`state.tsv` 永不出现
（历史「守护不产帧」的真因）。修：`XGetGeometry` 取实际几何并裁剪，`size/w/h` 全用裁剪值。

### 5.2 `ys_capture.py` **漏 SysV 共享内存段，2 段/秒**
`close()` 只 `shmdt` 不 `shmctl(IPC_RMID)`，而抓帧失败 0.5s 重建 grabber ⇒ 每 0.5s 永久吃掉
1 个 14,745,600B 段 + 1 个内核 `shmmni` 槽。实测 **2520 段 / 2519 个 nattch=0 孤儿 / shmmni=4096（61%）**，
20 分钟涨到 2520 ⇒ 再涨 13 分钟全机 MIT-SHM 客户端（Xwayland/Wine/CEF）`shmget` 就会 ENOSPC。
修：补 `IPC_RMID` + init 半成品自毁 + 失败退避 0.5→5s；回收 2517 个孤儿段（只删 `nattch=0 ∧ uid=1000
∧ 尺寸∈{2560×1440×4, 2560×1371×4, 2561×1440×4}`）：**段数 2520 → 3，空槽 1576 → 4093**。

## 6. 根治件（已写、已构建、**未装**）

补丁：`focus_out()` 里当应用**持有鼠标捕获**时跳过 `WM_CANCELMODE`（原生 Windows 的捕获不因键盘焦点
变化被取消），带**运行时开关**（`/tmp/.winex11-keep-capture` 存在才生效，不设=原始行为）。
源码 diff：`.scratch/fake-death/wine-src-notes/WINE-CANCELMODE-PATCH.diff`；构建产物：
`.scratch/fake-death/wine-build/dlls/winex11.drv/winex11.so`。

**装不上的原因（实测，别再踩）**：本机 runner 是
`Spritz-Wine-TkG (staging) 11.14`（来源 `github.com/NelloKudo/Wine-Builds`），它的
`win32u.so` 要求驱动接口 **version 111**，而 vanilla wine-11.14 是 **110**：

```
err:driver:__wine_set_user_driver version mismatch, driver wants 110 but win32u has 111
→ nodrv_CreateWindow（编辑器直接起不来）
```

把常量强改成 111 后：**版本检查过、但窗口一个都建不出来**（notepad 在一次性前缀里 40s 无窗、
日志零报错）⇒ 接口确实有实质变化，**不能靠改常量蒙过去**。
⇒ 要落地这个补丁，必须用**同源的 Spritz/TkG 源码**构建（或把 111 的接口差异移植过来）。

## 7. 交付的工具（都在 `tools/ys-editor/`）

| 工具 | 作用 | 自证 |
|---|---|---|
| `ys-clickable` | 「点得动/点不动」仪器化判定（抓帧复用 ys_capture XShm、点击走 ys-pointer-click、ROI 像素差 + 双向切换正对照 + 指针可动性自证 + 窗口原点换算） | 健康 3174px/43ms；假死 0px；注入失败报 ERROR |
| `ys-xrec` + `.c` | X 协议记录仪（服务器请求 + 指定客户端收到的投递事件） | 点击投递逐字节可读 |
| `ys-unstick-win` | **单窗口解卡**：纯 `XResizeWindow` ±1px 再还原，几何逐字段自检 | 用户两次确认「能点了」；几何还原 rc=0 |
| `ys-fakedeath-fix` | 补丁 `.so` 的 install/revert/on/off/status | revert 后与备份 `cmp` 字节相同 |
| `ys_capture.py` | 修 §5 两个 bug | 2560×1371 抓帧成功；段数不再增长 |

## 8. 未解决风险

1. **根治未落地**：补丁方向未验证（§6 的 ABI 墙）；`UseTakeFocus=N` 的注册表 A/B 也做不了——
   游戏跑在 bwrap 私有 user namespace 里，我在外面起 wine 会撞 `Win32Exception(5) 访问被拒绝`，
   **没有别的路径能写进那个正在使用的 prefix 注册表**。
2. **触发条件还差一格**：矩阵显示「左键点一下」+「随后失焦」组合致死，但**点击后不失焦**是否也致死
   未单独测（用户在场的干扰 + 注入通道不稳，见 §9）。
3. **per-window 的机制在哪一层未定谳**：A（应用侧）与 B（Wine stale capture）都能解释，缺的是
   Wine 侧消息级日志（需要以游戏的 user namespace 身份起 wine + `WINEDEBUG`，本会话拿不到）。
4. **`ys-unstick-win` 只是解卡仪器，不是修复**——它每次都要人/脚本去捅一下，符合「治标」的定义。
5. 我的 resize 手势（`full` 变体）会让窗口宽度每次漂 1–16px（相对移动不精确），本轮把用户的编辑器
   从 2560 宽改成了 2176 宽（布局因此变成「资源管理器独立成窗」）。**再跑手势前必须先闭环定位**。

## 9. 仪器坑（血泪，后来者直接抄）

- **不信指针读回，信投递事件**：用户在场时鼠标一直在动，`XQueryPointer` 的读回会被污染；判据必须
  用「服务器是否把 ButtonPress 投递到目标窗的预期坐标」（`ys-xrec`）。
- **注入通道会静默失效**：X server 可能停在 `mask=0x8`（右键按住）把指针冻住；此时
  `ydotool`/`XTest` 全部 rc=0 但指针不动 ⇒ 必须做**指针可动性自证**，失败报 ERROR 而不是 STUCK。
- **窗口被压住时点击会落到别的窗口**：XShm 抓到的仍是编辑器自己的像素，于是「点了没反应」是假阴性。
  对编辑器注入前必须经 `ys-gui-slot` 激活，并在**同一槽位内**完成点击+判读。
- **窗口布局会变**：编辑器有「单窗（树在主窗内）」与「双窗（资源管理器独立成窗）」两种布局，
  坐标必须每次从抓帧重新锚定（本轮已把 origin 换算做进 `ys-clickable`）。
