# UPSTREAM.md — Wine/X11/XWayland 输入假死：上游与社区证据

> 任务：只做**联网查证**（未动桌面/游戏/编辑器进程）。所有结论带 URL。
> 查证时间：2026-10-20（Asia/Shanghai）。证据分三档：
> **【上游已确认】** = 上游 bug 状态/源码/合并记录可直接验证；
> **【社区传闻】** = 论坛/issue 的个人断言或 workaround，未上游确认；
> **【我的推断】** = 我从上述材料推出、可被下面「判别实验」证伪的判断。
>
> **本机读数（只读命令，作为比对基线）**：
> `wine --version` → `wine-11.19`（pacman `wine 11.19-1`，**未见 wine-staging 包**，`/opt/wine*`、
> `~/.local/share/lutris/runners/wine/*` 均无其他 wine）；`kwin_wayland --version` → `kwin 6.8.0`；
> `pacman -Q plasma-workspace xorg-xwayland` → `6.8.0-1` / `24.1.14-1`；
> `~/.config/kwinrc` → `FocusStealingPreventionLevel=0`，**无 `[MouseBindings]` 段**（即全用默认绑定）。
> ⚠️ 任务书说「Wine 11.14 staging」，与本机实测 11.19 不符——本文件所有「当前源码」结论按 **master/11.19**
> 给，另在 §1 给出 **11.12 标签**的对照读数（因为该 bug 报在 11.12）。

---

## 1. WineHQ Bugzilla 59965（任务点名的那条）

- **URL**: https://bugs.winehq.org/show_bug.cgi?id=59965
- **标题（逐字）**: `x11drv UI elements become unclickable after switching windows due to unexpected WM_CANCELMODE during mouse grab`
- **状态（逐字）**: `UNCONFIRMED`；Product `Wine`；Component `-unknown`；Version `11.12`；
  Hardware `x86-64 Linux`；Importance `P2 normal`；Reported `2026-07-07 02:49 UTC by T_Im`；
  Modified `2026-07-07 11:55 UTC`；CC List: `julliard`, `rbernon`；**Attachments: 无**；
  **Fixed by SHA1: 空**；Keywords 空；See Also: **59653**。
- **评论数: 0**（页面只有 Description，无任何 comment；`/rest/bug/59965/comment` 同样只有 c0）。
  → **没有人复现、没有人确认、没有人标 dupe、没有 MR 引用它**。

**原文症状（逐字摘录，Description c0）**：

> "When switching focus between applications via Alt+Tab, the application's buttons and UI elements
> sometimes become completely unresponsive to mouse clicks."
>
> "Actual Results: The UI ignores mouse clicks. The application is not frozen (it might still respond to
> keyboard input), but the internal mouse capture/UI state is broken."
>
> "Workaround: The only way to restore mouse functionality is to minimize the affected window, switch to
> another app, and then restore the window. Minimizing forces a hard state reset and ReleaseCapture, while
> restoring forces a full WM_PAINT. This fixes the unclickable UI."

**它自己的机制断言（逐字）**：

> "The issue occurs because winex11.drv sends a WM_CANCELMODE message to the foreground window when it
> loses focus, even if the application currently holds an X11 mouse grab
> (x11drv_thread_data()->grab_hwnd)."
>
> "Skipping WM_CANCELMODE when a mouse grab is active completely resolves the issue."

**它给的补丁（逐字，hunk 头 + 新增体）**：

```
diff --git a/dlls/winex11.drv/event.c b/dlls/winex11.drv/event.c
--- a/dlls/winex11.drv/event.c
+++ b/dlls/winex11.drv/event.c
@@ -888,5 +888,12 @@
     if (hwnd != NtUserGetForegroundWindow()) return;
     if (!(NtUserGetWindowLongW( hwnd, GWL_STYLE ) & WS_MINIMIZE))
-        send_message( hwnd, WM_CANCELMODE, 0, 0 );
+    {
+        if (x11drv_thread_data()->grab_hwnd)
...
```

### 我的核对（可复跑，全部是只读源码读数）

| 核对项 | 读数 | 来源 |
|---|---|---|
| `focus_out()` 是否**无条件**发 `WM_CANCELMODE` | 是。master `event.c:746-765`：`if (hwnd != NtUserGetForegroundWindow()) return; if (!(... & WS_MINIMIZE)) send_message( hwnd, WM_CANCELMODE, 0, 0 );` **没有任何 capture/grab 判断** | `https://gitlab.winehq.org/wine/wine/-/raw/master/dlls/winex11.drv/event.c` |
| 这行是新回归吗 | **不是**。git blame：该两行是 `f3eebcfa4d`（2022-09-14, Alexandre Julliard）；函数体 `focus_out` 的框架可追到 1998/2013 | `https://gitlab.winehq.org/api/v4/projects/wine%2Fwine/repository/files/dlls%2Fwinex11.drv%2Fevent.c/blame?ref=master&range%5Bstart%5D=744&range%5Bend%5D=766` |
| `x11drv_thread_data()->grab_hwnd` 现在还在吗 | **不在了**。MR **!11245**「winex11: Get rid of x11drv_thread_data()->grab_hwnd.」author Rémi Bernon，`created_at 2026-06-24T07:28:11Z`，`merged_at 2026-06-24T21:47:26Z`，head `2b3512e7ba31480e646a061a05baad18c1ea3910`；diff 把 `grab_hwnd` 换成 `NtUserGetAncestor( get_capture_window(), GA_ROOT )`，并新增 `get_capture_window()`（= `NtUserGetGUIThreadInfo().hwndCapture`） | MR: https://gitlab.winehq.org/wine/wine/-/merge_requests/11245 ; diff API: `.../repository/commits/2b3512e7.../diff` |
| 报 bug 的 11.12 树里有没有 `grab_hwnd` | **0 次出现**（`grep -c grab_hwnd` = 0）；且 11.12 的 `focus_out` 在 **880 行**，`send_message` 在 **890 行**（与 hunk 头 `@@ -888,5 +888,12 @@` 大致对得上，说明作者看的是 11.12） | `https://gitlab.winehq.org/wine/wine/-/raw/wine-11.12/dlls/winex11.drv/event.c` |
| 有没有 MR 讨论 WM_CANCELMODE | GitLab MR 搜索 `search=WM_CANCELMODE&state=all` → **0 条**；`search=focus_out` → 0；`search=GrabPointer` → 0；`search=grab_hwnd` → **1 条（就是 !11245）** | `https://gitlab.winehq.org/api/v4/projects/wine%2Fwine/merge_requests?search=WM_CANCELMODE&state=all` |

**判定（三档）**
- 【上游已确认】59965 至今 `UNCONFIRMED`、零评论、零附件、未标 dupe、无 fix、无 MR。
- 【上游已确认】`focus_out()` **确实**在失焦时无条件发 `WM_CANCELMODE`（11.0 / 11.12 / master 三处一致）。
- 【我的推断，强】**59965 里那段补丁在 11.12 就已经编译不过**：它引用的 `x11drv_thread_data()->grab_hwnd`
  在 11.12 标签里已不存在。→ 这条 bug 的「proposed fix」是**无效补丁**，不能当作「上游有修复方案」的证据；
  能等价改写为 `get_capture_window()`，但**没有任何 Wine 开发者做过这一步**。
- 【我的推断】**它的机制断言只对了一半**：Wine 的确发 `WM_CANCELMODE`，但 59965 把它归因为「grab 时不该发」，
  而 Wine 的 `focus_out` 是「失焦就取消模态状态」的 Win32 语义实现；是否该在 capture 时跳过，是**设计争议**，
  不是已定位的 bug。上游 0 回应 = 尚无人认可这个机制。

### 判别实验（做一次就能证伪/证实它）
1. **补丁可编译性**：把 59965 的 diff 套到 11.19 源码上 `git apply` → 必然因 `grab_hwnd` 不存在失败；
   把 `grab_hwnd` 换成 `get_capture_window()` 后再编译，可得到「真正能跑的 A/B」。
2. **Wine 侧事件读数**：`WINEDEBUG=+win,+x11drv` 启动应用，复现假死，然后在假死窗口上点一下，
   再按 Meta+右键拖动。日志里看三件事：①假死时点击有没有产生 `WM_LBUTTONDOWN`/`WM_NCHITTEST`；
   ②拖动前后有没有 `WM_CANCELMODE`（`+win` 会打 `send_message` 目标）与 `FocusOut/FocusIn`；
   ③有没有 `lost focus, setting fg to desktop`（`event.c` 的 TRACE）。
   ——若「点击完全不进消息队列」且「拖动后才出现 FocusIn」，机制在**焦点/激活**而非 capture。

---

## 2. Bugzilla 同类普查（检索式 + 命中清单）

检索方式：Bugzilla **REST**（比 HTML 省流、可复跑）：
`https://bugs.winehq.org/rest/bug?quicksearch=<词>&include_fields=id,summary,status,resolution,version,component`
用过的词（原样）：`clicks not working`、`unresponsive after alt-tab`、`mouse input lost`、`SetCapture`、
`clip cursor`、`XGrabPointer`、`input freeze`、`window stops responding to clicks`、`UseTakeFocus`、
`GrabFullscreen`、`WM_TAKE_FOCUS`、`unclickable`、`popup menu stuck`、`click not working after switching`。

**同族清单（按相关度）**

| id | 标题（截断） | 状态/版本 | 组件 | 与本题关系 |
|---|---|---|---|---|
| [59965](https://bugs.winehq.org/show_bug.cgi?id=59965) | x11drv UI elements become unclickable after switching windows… | UNCONFIRMED / 11.12 | -unknown | **点名那条**，见 §1 |
| [59653](https://bugs.winehq.org/show_bug.cgi?id=59653) | winex11.drv: FocusOut sends WM_CANCELMODE during active mouse grab, breaking drag operations | UNCONFIRMED / 11.6 | winex11.drv | 同一作者 T_Im 的**前作**；同一机制断言；同样零修复。作者自述「I'm not a C dev and don't plan to submit a formal patch」 |
| [59610](https://bugs.winehq.org/show_bug.cgi?id=59610) | X11 pointer grab breaks on XWayland after closing a dropdown in a dialog over a fullscreen window | **RESOLVED NOTOURBUG** / 11.5 | -unknown | 全屏 + combobox 关闭后点击全失效；**声称** `GrabFullscreen=N`+`GrabPointer=N` 可修（见 §8：这两个键一个已死、一个不存在） |
| [57585](https://bugs.winehq.org/show_bug.cgi?id=57585) | Many games focus poorly when alt-tabbing back into them, without UseTakeFocus=N | **CLOSED FIXED** / 2024-12 报，**11.3 修** | winex11.drv | **最重要的已修同族**：症状=「alt-tab 回来后键鼠全不响应」；Rémi Bernon: "Things have changed a lot in Wine focus / active window support and it should be much improved now"；Julliard 2026-02-20 关单「Closing bugs fixed in 11.3.」 |
| [48121](https://bugs.winehq.org/show_bug.cgi?id=48121) | Unity games do not fire OnApplicationFocus/OnApplicationPause events on focus regain | **CLOSED FIXED**（2025-04-20） | user32 | 由 **MR !7763** 修：`winex11: Avoid sending WM_MOUSEACTIVATE on WM_TAKE_FOCUS.`（"It confuses Unity and breaks input after alt-tab."）——**Wine 侧激活状态机的已合并修复** |
| [30583](https://bugs.winehq.org/show_bug.cgi?id=30583) | keyboard input does not work after focus-out and focus-in | UNCONFIRMED / unspecified | winex11.drv | 焦点进出后输入失效，未修 |
| [27502](https://bugs.winehq.org/show_bug.cgi?id=27502) | app freezes when WM_KILLFOCUS creates modal dialog | NEW / 1.3.22 | winex11.drv | 失焦 → 模态 → 卡死，未修 |
| [59345](https://bugs.winehq.org/show_bug.cgi?id=59345) | Popup menus in audio plugins break for the whole session | UNCONFIRMED / 11.1 | winex11.drv | 弹出菜单后整会话点不动（X11 抓取族） |
| [59822](https://bugs.winehq.org/show_bug.cgi?id=59822) | Mouse clicks not received in VST plugin UIs (child windows) since Wine 9.22 — virtual desktop workaround… | UNCONFIRMED / 11.0 | -unknown | 子窗口点不动、虚拟桌面可绕过 |
| [60208](https://bugs.winehq.org/show_bug.cgi?id=60208) | BonziBuddy: Microsoft Agent context menu is never dismissed on a Wayland session (Xwayland) | UNCONFIRMED / 11.15 | winex11.drv | Xwayland 下菜单抓取不释放（最新一例） |
| [59740](https://bugs.winehq.org/show_bug.cgi?id=59740) | Programs running under Wayland do not notice when they lose focus | UNCONFIRMED | winewayland | 反向参照：原生 Wayland 驱动的焦点通知缺陷 |
| [28933](https://bugs.winehq.org/show_bug.cgi?id=28933) | Screamer Radio 0.4.4 no interaction with main menu possible (popup menus/items bound to parent window/menu…) | NEW / 1.3.31 | user32 | 菜单绑定父窗口 → 点不动 |
| [55543](https://bugs.winehq.org/show_bug.cgi?id=55543) / [48772](https://bugs.winehq.org/show_bug.cgi?id=48772) | 光标裁剪不能被应用关闭 / 持续 clip 导致事件错误 | UNCONFIRMED | -unknown / winex11.drv | **ClipCursor 族**，与 `XGrabPointer` 同一机制面（本机若是「拖动后恢复」要看是不是 clip window 残留） |

**判定**
- 【上游已确认】「alt-tab 回来输入不响应」这一族在 Wine 有**已闭合的修复**（57585→11.3；48121→MR!7763），
  但两者修的都是**激活/焦点消息**（WM_TAKE_FOCUS / WM_MOUSEACTIVATE），**不是** 59965 说的 capture 跳过。
- 【上游已确认】59965/59653/59610 三条**同作者**（T_Im）、2026 年新增、**全部 UNCONFIRMED 或 NOTOURBUG、零修复**。
- 【我的推断】同族 bug 的**主流修复路径是「让 WM 正确给焦点」**，而不是「grab 时不发 WM_CANCELMODE」。

---

## 3. Wine 源码 / Patchwork / MR（2024–2026 与 x11drv 输入·焦点·抓取相关）

- **Patchwork 已退役**（逐字）：`https://source.winehq.org/patches/?q=WM_CANCELMODE` →
  > "The Wine patch tracker is retired — Patches are no longer accepted by email. You should submit merge requests."
  所以「Patchwork 上有没有补丁」这类问题现在**只能查 GitLab MR**；`source.winehq.org/patches/data/<n>` 是历史遗留物。

**已合并（与本题直接相关）**

| MR | 标题 | 状态 | commit | 作用 |
|---|---|---|---|---|
| [!7763](https://gitlab.winehq.org/wine/wine/-/merge_requests/7763) | `winex11: Avoid sending WM_MOUSEACTIVATE on WM_TAKE_FOCUS.` | **merged 2025-04-09** | `3c5c6b1cc7fa96ef1c2ef7cd215e63770552f80a`（x11 部分）+ `b568eaac4aeb307d289ae6992457411adce6068e`（winemac） | 描述逐字：**"It confuses Unity and breaks input after alt-tab."** Wine-Bug: 48121。**这是「alt-tab 后输入坏掉」在 Wine 侧的一次真实、已合并修复** |
| [!11245](https://gitlab.winehq.org/wine/wine/-/merge_requests/11245) | `winex11: Get rid of x11drv_thread_data()->grab_hwnd.` | **merged 2026-06-24** | `2b3512e7ba31480e646a061a05baad18c1ea3910` | 用 `get_capture_window()`（GUI 线程 `hwndCapture`）取代 drv 私有 `grab_hwnd`；`X11DRV_SetCapture()` 也因此不再维护私有字段。**使 59965/59653 的补丁失效** |

**在评审/未合并**：MR 搜索 `WM_CANCELMODE` / `focus_out` / `GrabPointer` 均 **0 条**；
近期 `x11drv` MR 列表（2026）里没有「输入捕获/焦点」类在审 MR（多为渲染、键盘布局、ConfigureRequest）。

**判定**
- 【上游已确认】2024–2026 与「alt-tab 输入失效」相关的**已合并**修复只有 !7763（激活消息）与 !11245（capture 记账重构）。
- 【上游已确认】**没有任何**「grab 时跳过 WM_CANCELMODE」的 MR，无论合并或在审。

---

## 4. wine-staging 补丁集：有没有相关补丁？

枚举方式：GitLab API `.../projects/wine%2Fwine-staging/repository/tree?path=patches&recursive=true`（3 页 = 300 条路径），
再按 `x11|winex11|win32u|xinput|input|capture|cursor|focus|ntsync|rawinput|mouse|keyboard|wayland` 过滤。

命中的 `winex11-*` 补丁**只有三个**，均与输入捕获无关：

| 补丁 | definition 逐字 | 作用 |
|---|---|---|
| `patches/winex11-Fixed-scancodes` | `Fixes: [30984] Improve key translation.` / `Fixes: [45605] Letter keys doesn't work in DirectX aplications` / `Disabled: True` | 键盘扫描码翻译（**已 disabled**） |
| `patches/winex11-WM_WINDOWPOSCHANGING` | `Fixes: [34594] Fix handling of WM_WINDOWPOS{CHANGING,CHANGED} for deactivated topmost window` + 注释 `# The rebase isn't exactly clear here. This needs reinvestigation.` / `Disabled: true` | 顶层窗口位置消息（**已 disabled**） |
| `patches/winex11-Window_Style` | `Fixes: [37876] Fix handling of window attributes for WS_EX_LAYERED \| WS_EX_COMPOSITED` | 分层窗口样式 |

其余输入类命名命中：`user32-Mouse_Message_Hwnd`、`user32-rawinput-keyboard`、`dinput-scancode`、`dinput-joy-mappings`、
`comctl32-rebar-capture`（**这是控件重绘的 capture，不是 X 抓取**）、`loader-KeyboardLayouts`、`win32u-NtGdiExtTextOutW-rotation`（字体，无关）。
`ntsync` 不在 `patches/`（它是独立组件/上游已并入），与输入无关。

**判定**
- 【上游已确认】wine-staging **没有** x11-drv 输入捕获/焦点类补丁；`-staging` 与纯 upstream 在本题上**无差异**。
- 【我的推断】所以「用户装的是 staging 而不是 upstream」**不能**解释这个假死。

---

## 5. ArchWiki（逐字 + 段落标题）

抓取方式：MediaWiki API `action=parse&prop=wikitext`（原样 wikitext，逐字引用，含 `{{ic|…}}` 标记）。

### 5.1 `Wine` → 段落「Keyboard input not working」
URL: https://wiki.archlinux.org/title/Wine#Keyboard_input_not_working
> "This could be caused by the window manager not switching focus. In the ''Graphics'' tab of ''winecfg'', disable the 'Allow the window manager...' options, or set windowed mode with 'Emulate a virtual desktop'.
> *Some suggest to toggle all the ''Window settings'', click ''Apply'', then change them back. If that does not work, try the above."
>
> "If the keyboard does not work after unfocusing the application, try editing the registry:
> * Under `HKEY_CURRENT_USER\Software\Wine\X11 Driver`, add a string value `UseTakeFocus` and set it to `N`.
> * Alternatively, you can use winetricks to set the value: `$ winetricks usetakefocus=n` or use wine reg `$ wine reg add 'HKEY_CURRENT_USER\Software\Wine\X11 Driver' /t REG_SZ /v UseTakeFocus /d N /f`"

**判定**：ArchWiki 明确把「unfocus 后输入不工作」归到 **WM 焦点切换 + Wine 的 `UseTakeFocus`**，
并给了**注册表/winetricks 两条等价开关**。这是本题**唯一被 Wiki 背书的输入类注册表开关**。

### 5.2 `Wine` → 段落「Xwayland problems」
URL: https://wiki.archlinux.org/title/Wine#Xwayland_problems
> "If you use Wine under [[Xwayland]], you can activate the option for "Emulating a virtual desktop" in the Graphics Tab in winecfg, to avoid problems with:
> * flickering;
> * wrong window location;
> * **wrong mouse cursor location and clicks**;
> * keyboard detection."
>
> "If disabling the Virtual Desktop left you unable to interact with the winecfg window with mouse & keyboard anymore, you can explicitly start winecfg on a Virtual Desktop anyway and reenable it with:
> `$ wine explorer /desktop=name,800x600 winecfg`"

**判定**：Wiki 把「clicks 错位/失效」列进 **Xwayland 已知问题**，给出的规避是**虚拟桌面**（改变窗口管理路径），
不是注册表抓取开关。→ 与 §8 的 `Managed=N` 同一条思路（绕开 WM 管理）。

### 5.3 `Wayland` → 段落「Input grabbing in games, remote desktop and virtual machine windows」
URL: https://wiki.archlinux.org/title/Wayland#Input_grabbing_in_games,_remote_desktop_and_virtual_machine_windows
> "In contrast to Xorg, Wayland does not allow exclusive input device grabbing, also known as active or explicit grab (e.g. keyboard, mouse), instead, it depends on the Wayland compositor to pass keyboard shortcuts and confine the pointer device to the application window."
>
> "This change in input grabbing breaks current applications' behavior, meaning:
> * Hotkey combinations and modifiers will be caught by the compositor and will not be sent to remote desktop and virtual machine windows.
> * The mouse pointer will not be restricted to the application's window which might cause a parallax effect…"
>
> "Wayland solves this by adding protocol extensions for Wayland and Xwayland. Support for these extensions is needed to be added to the Wayland compositors."

**判定**：**结构性事实**：Wayland 下**没有真正的 X 级独占抓取**，Xwayland 的 `XGrabPointer` 是「协商仿真」。
→ 这为「抓取状态在 Xwayland/KWin 一侧错位」提供了机制土壤（但**不等于**已证实本题就是这个）。

### 5.4 `KDE` → 段落「X11 shortcuts conflict on Wayland」
URL: https://wiki.archlinux.org/title/KDE#X11_shortcuts_conflict_on_Wayland
> "Some X11 software like {{Pkg|freerdp}} can grab keyboard input since KDE 5.27. Others like [[VMware]] cannot grab correctly."
> "It is inappropriate to force grab in Xserver or in compositors. You can solve it in an elegant way as follows:
> * Right click the window titlebar (e.g. VMware or Citrix);
> * ''More Actions > Configure Special Window Settings...''
> * Click ''Add Property...'' and select ''Ignore global shortcuts''.
> * Select ''force'' and ''yes''. Apply it."

**判定**：KDE 侧文档承认 **X11 客户端抓取在 Wayland 下不可靠**，官方推荐的修法是**KWin 窗口规则**（`Ignore global shortcuts`），
不是改 Wine。这是**唯一可用的 KWin 侧无代码开关**（对「键盘被 KWin 吃掉」有效，对鼠标 grab 未必）。

### 5.5 `Gaming` → 段落「Keyboard grabbing」
URL: https://wiki.archlinux.org/title/Gaming#Keyboard_grabbing
> "Many games grab the keyboard, noticeably preventing you from switching windows (also known as alt-tabbing)."
> "Some SDL games (e.g. Guacamelee) let you disable grabbing by pressing `Ctrl-g`."
> "{{Note|SDL is known to sometimes not be able to grab the input system. In such a case, it may succeed in grabbing it after a few seconds of waiting.}}"

**判定**：只覆盖「游戏抓键盘导致切不出去」，与「切回来点不动」方向相反，仅作背景。

### 5.6 `Xwayland` 页
`https://wiki.archlinux.org/title/Xwayland` 是重定向（wikitext 全文 = `#REDIRECT [[Wayland#Xwayland]]`），无独立内容。

---

## 6. KDE / KWin 侧：「Meta + 拖动 = 移动窗口」到底做了什么

源码：`invent.kde.org/plasma/kwin` master（抓取日 2026-10-20；本机 kwin 6.8.0）。
抓取文件：`src/window.cpp`、`src/x11window.cpp`、`src/options.cpp`、`src/pointer_input.cpp`、`src/input.cpp`。

### 6.1 Meta+拖动的代码路径（逐字）
`src/window.cpp` `Window::performMouseCommand()`（约 2166 行起）：
```cpp
    case Options::MouseActivateRaiseAndMove:
    case Options::MouseActivateRaiseAndUnrestrictedMove:
        workspace()->raiseWindow(this);
        workspace()->requestFocus(this);
        workspace()->setActiveOutput(globalPos);
        [[fallthrough]];
    case Options::MouseMove:
    case Options::MouseUnrestrictedMove: {
        ...
        setInteractiveMoveResizePointerButtonDown(true);
        setInteractiveMoveResizeAnchor(globalPos);
        ...
        if (!startInteractiveMoveResize()) ...
```
→ **关键差别**：`MouseActivateRaiseAndMove`（「激活、提升并移动」）在开始交互移动**之前**先
`raiseWindow()` + **`requestFocus(this)`**；plain `MouseMove` **不**请求焦点。
`Options::mouseCommand()`（`src/options.cpp:800+`）把配置字符串映射到命令：
`"activate, raise and move"` → `MouseActivateRaiseAndMove`；`"move"` → `MouseMove`。

### 6.2 焦点实现（逐字）
`src/x11window.cpp:1637` `X11Window::takeFocus()`：
```cpp
    if (effectiveAcceptFocus) {
        const xcb_void_cookie_t cookie = xcb_set_input_focus(kwinApp()->x11Connection(),
            XCB_INPUT_FOCUS_POINTER_ROOT, m_client, XCB_TIME_CURRENT_TIME);
        workspace()->setX11FocusSerial(cookie.sequence);
    }
    if (effectiveTakeFocus) {
        sendClientMessage(window(), atoms->wm_protocols, atoms->wm_take_focus, kwinApp()->x11Time());
    }
```
→ KWin 对 X11 客户端**同时**支持两条路：`XSetInputFocus`（`accept focus`）与 `WM_TAKE_FOCUS` 客户端消息
（取决于 `WM_HINTS.input` 与 `WM_PROTOCOLS` 是否含 `WM_TAKE_FOCUS`）。**Wine 默认两条都声明**（`UseTakeFocus=Y`），
这正是 §8 里那个开关能改变行为的原因。

### 6.3 KWin 有没有 `XGrabPointer` / 松手有没有 `XUngrabPointer`？
- 在 `src/x11window.cpp`、`src/window.cpp`、`src/pointer_input.cpp`、`src/input.cpp` 四文件中
  `grep -nE "XGrabPointer|XUngrabPointer|xcb_grab_pointer|grabPointer"` → **0 命中**。
- 存在的只有 **X server grab（不是 pointer grab）**：`x11window.cpp:212-234` 的 `grabXServer()`/`ungrabXServer()`
  （注释逐字：`// Grab X during the release to make removing of properties, setting to withdrawn state`），
  以及 `x11window.cpp:294` 的 `XServerGrabber xserverGrabber;`。
- 交互移动结束时走 `Window::finishInteractiveMoveResize()`（`window.cpp:1061`）→ `moveResize(...)` →
  `X11Window::doSetGeometry` → 发 `ConfigureNotify`（X11 客户端几何变更的标准路径）。

**判定**
- 【上游已确认】在 **Wayland 会话**里，KWin 是合成器、自己就拿全部指针事件，**移动窗口不需要也不可能**
  用 `XGrabPointer` 去抢 X 客户端；所以「Meta+拖动 = KWin 用 XGrabPointer 抢走抓取」这个说法**不成立**。
- 【上游已确认】Meta+拖动的一条命令变体**确实会重新 requestFocus**（`MouseActivateRaiseAndMove`）。
  → 「拖一下就恢复」最像是**焦点被重新请求**带来的副作用，而不是 X 抓取被释放。
- 【我的推断】但若用户实际触发的是 `MouseMove`（纯移动、不请求焦点），那恢复就**不能**用焦点解释，
  只能落到「移动/ConfigureNotify 让 Wine 的 X11 事件循环把积压事件消费掉」。**这一条必须用实验区分**（见 §9）。

### 6.4 KDE bug tracker 同族报告

| id | 标题 | 状态 | 版本 | 要点（逐字/摘要） |
|---|---|---|---|---|
| [525590](https://bugs.kde.org/show_bug.cgi?id=525590) | kwin 6.7.5 introduces focus regression with wine applications | **RESOLVED FIXED** | 6.7.5 → 修在 **6.7.6** | 逐字："After upgrading to kwin 6.7.5, wine windows using Xwayland no longer get keyboard focus after clicking them. Clicking will raise the window but will not give it keyboard focus."；报告者给出两个 workaround：**`Focus stealing prevention = None`** 与 **`UseTakeFocus = N`**；根因是提交 `da716de0`（"Handle 'Globally Active' input model more gracefully"），最终 **revert**：`ef6fa835`（Plasma/6.7）、`c32592ab`（Plasma/6.8）、`6e2b6020`（master）。duplicates：525493 / 525542 / 526000 |
| [456056](https://bugs.kde.org/show_bug.cgi?id=456056) | **Clicks are not passed to inactive wine windows on wayland** | **RESOLVED FIXED**（2024-09-25，Xaver Hugl："I don't see this happening on Plasma 6.1, so I assume this is fixed."） | 5.25.1 | 逐字："The window acts as if the setting … were instead just set to 'Activate and raise'. I.e. the click/scroll doesn't get passed to the wine-window." —— **与本题症状最接近的 KDE 侧已修 bug**（但那是「首个点击不穿透」，不是「持续点不动」） |
| [518616](https://bugs.kde.org/show_bug.cgi?id=518616) | XWayland does not send FocusOut when focus moves to a native Wayland surface | CONFIRMED | 6.6.3 | Xwayland 焦点语义**确实**有已知缺口（FocusOut 丢失）→ Wine 的 `focus_out` 可能**根本不触发**，或被延迟 |
| [504587](https://bugs.kde.org/show_bug.cgi?id=504587) | Prevent unmanaged X11 windows from grabbing the cursor | CONFIRMED | 6.3.5 | KWin 侧承认「未管理 X11 窗口会抓光标」，需防护 |
| [483982](https://bugs.kde.org/show_bug.cgi?id=483982) | Since KDE6, a pressed Ctrl key state is forgotten in a Wine application after loosing and regaining keyboard focus | UNCONFIRMED | 6.0.2 | KWin↔Wine 焦点状态失同步的另一个面 |
| [526831](https://bugs.kde.org/show_bug.cgi?id=526831) | Tablet pen: no up event when pen leaves window while touching screen. XWayland apps get stuck with button pressed | UNCONFIRMED | 6.7.5 | 「Xwayland 应用卡在按键按下状态」——与「抓取未释放」同族 |
| [518139](https://bugs.kde.org/show_bug.cgi?id=518139) | Weird Wine/Proton+XWayland fullscreen window behavior in Plasma 6.6.3 | UNCONFIRMED | 6.6.3 | Wine/Proton 全屏在 Xwayland 下的窗口状态异常 |

**判定**
- 【上游已确认】KWin 侧**有**「wine 窗口点击/焦点」的已修 bug（525590 修在 6.7.6；456056 在 6.1 前后修）。
  `c32592ab` 于 2026-09-17 推入 **Plasma/6.8** 分支，本机 `kwin 6.8.0` 按分支时间**应已含**该 revert（构建日期待核实）→ 若假死在 6.8.0 仍复现，**不能**归因到 525590。
- 【上游已确认】Xwayland 的 FocusOut 有已知缺口（518616）→ 「Wine 没收到失焦」是**可能**的上游机制之一（KWin/X 侧）。
- 【我的推断】「Meta+拖动后恢复」在代码上最自然的解释是 `MouseActivateRaiseAndMove` 的 **`requestFocus()`**（KWin 侧焦点再请求），
  即**KWin/X 侧**而非 Wine 的 capture 状态机；但这取决于用户实际绑定的是 `Move` 还是 `Activate, raise and move`。

---

## 7. 同族第三方报告 + 已知 workaround

| 来源 | 内容（逐字摘录） | 判定 |
|---|---|---|
| [Arch BBS：`[SOLVED] Steam wine: controls stop working when i press alt+tab`](https://bbs.archlinux.org/viewtopic.php?id=304920)（2025-04-13，wine 10.5，**openbox/X11，非 Wayland**） | "when i press alt+tab during the game … then when i return to the game the controls don't work anymore, neither the joypad nor the keyboard nor the mouse." → "SOLVED: … Create a new entry named **UseTakeFocus** with value **N**" + `wine reg add 'HKEY_CURRENT_USER\Software\Wine\X11 Driver' /t REG_SZ /v UseTakeFocus /d N /f` | 【社区传闻】但**同症状、同修法、非 KWin 环境也复现** → 说明这是 **Wine 的 X11 焦点模型**问题，不是 KWin 独有 |
| [ValveSoftware/wine commit `d30ce49`](https://github.com/ValveSoftware/wine/commit/d30ce49ed8b40b9c29b5cc374987cacef6619a51)（2018-06-27，**Proton 的 wine fork**） | 标题 `HACK: winex11.drv: Let the WM focus our windows by default.`；diff：`-BOOL use_take_focus = TRUE; +BOOL use_take_focus = FALSE;`；正文逐字："Wine uses the 'globally active' focus model by default. This means that the window manager won't focus our windows unless we respond in the affirmative to a WM_TAKE_FOCUS event. Since the GUI thread isn't processing messages, this doesn't happen." | 【上游已确认（Proton 分支）】**Proton 长期把 `UseTakeFocus` 默认改成 N 来绕开「焦点/输入不进应用」**——这是「Wine 侧焦点模型」最硬的旁证 |
| [Wine bug 57585](https://bugs.winehq.org/show_bug.cgi?id=57585) 引用的社区链接 | askubuntu 299286、bugs 47929 / 48121 / 37393 / 56073 —— 同一「alt-tab 回来没输入」家族的历史报告 | 【社区传闻】成串同族，均指向 `UseTakeFocus=N` |
| [Proton issue #8869](https://github.com/ValveSoftware/Proton/issues/8869)（open，2025-06-29，GNOME/Ubuntu） | "In some games that use first person with the mouse cursor captured… The mouse will break free of the window and start clicking on the other monitor." | 【社区传闻】**指针捕获丢失**的另一形态（多显示器），非本症状，但同属 capture 面 |
| [KDE 456056](https://bugs.kde.org/show_bug.cgi?id=456056) | 见 §6.4：点击不穿透到 inactive wine 窗口；Plasma 6.1 起视为已修 | 【上游已确认】KWin 侧历史上确有此类 bug |
| [unix.stackexchange 相关回答（搜索命中，未取全文）](https://unix.stackexchange.com/revisions/49e53e9d-e28b-478e-868e-2af3790cfada/view-source) | 只有 revision 链接，**未逐字取到**，不作为证据 | 【未验证】 |

**workaround 清单（谁说的 + 我的可信度评估）**

| workaround | 出处 | 评估 |
|---|---|---|
| `HKCU\Software\Wine\X11 Driver\UseTakeFocus = "N"`（或 `winetricks usetakefocus=n`） | ArchWiki §5.1；Arch BBS 已解决帖；bug 57585；KDE 525590；Proton fork 默认值 | **唯一有多源交叉、且能改变 Wine 焦点模型的开关**。代价：改变 `WM_HINTS.input` 与 `WM_PROTOCOLS`（见 §8），可能影响模态对话框 |
| `GrabFullscreen = "N"` + `GrabPointer = "N"` | 只有 bug 59610（同一作者 T_Im） | **高度可疑**：`GrabPointer` 键在 winex11.drv **不存在**；`GrabFullscreen` 变量**从未被读**（§8）→ 很可能是安慰剂 |
| 虚拟桌面（`Emulate a virtual desktop` / `wine explorer /desktop=…`） | ArchWiki §5.2；bug 59822 标题里也提到 virtual desktop workaround | 改变窗口管理路径（KWin 不再管理该窗口），**机制上说得通**，但等于放弃窗口集成 |
| KWin 规则 `Ignore global shortcuts = force/yes` | ArchWiki §5.4 | 只解决**键盘**被合成器吃掉；对鼠标 grab 无直接作用 |
| `Focus stealing prevention = None` | KDE 525590（报告者自述） | 本机 `FocusStealingPreventionLevel=0`（=None）**已经是这个状态** → 若仍复现，说明不是它 |
| `WINEDLLOVERRIDES` / `xinput` 设置 | —— | **未找到任何可靠来源**把这两者与本题症状联系起来；`WINEDLLOVERRIDES` 与输入路径无关 |

**判定**
- 【我的推断】社区层面**真正被反复验证的只有 `UseTakeFocus=N`**；`GrabPointer`/`GrabFullscreen` 那条
  是**单来源、且与源码矛盾**的传闻，不该当实验主线。

---

## 8. `HKCU\Software\Wine\X11 Driver` 配置项全表（以源码为准）

**源码位置（重要）**：`dlls/winex11.drv/settings.c` **已于 2022 年不存在**——commit `5cc3808a`
「winex11.drv: Merge settings.c into display.c.」（2022-06-30）。当前所有 `X11 Driver` 键都在
`dlls/winex11.drv/x11drv_main.c` 的 `X11DRV_Settings`（`get_config_key(...)`，master 第 453–504 行）读取。
→ 任务书里「以 `dlls/winex11.drv/settings.c` 为准」这个前提**已过期**，照它去找会 404。

**逐字（master `x11drv_main.c` 全局默认值，第 62–82 行）**：
```c
BOOL usexvidmode = TRUE;
BOOL usexrandr = TRUE;
BOOL usexcomposite = TRUE;
BOOL use_egl = TRUE;
BOOL use_take_focus = TRUE;
BOOL use_primary_selection = FALSE;
BOOL use_system_cursors = TRUE;
BOOL grab_fullscreen = FALSE;
BOOL managed_mode = TRUE;
BOOL private_color_map = FALSE;
int primary_monitor = 0;
BOOL client_side_graphics = TRUE;
BOOL client_side_with_render = TRUE;
BOOL shape_layered_windows = TRUE;
int copy_default_colors = 128;
int alloc_system_colors = 256;
```

| 键（源码里的名字） | 默认 | 代码位置 / 作用 | 会不会改变输入/抓取 |
|---|---|---|---|
| `UseTakeFocus` | **`Y`**（`use_take_focus = TRUE`） | `x11drv_main.c:465`；用于 `window.c:1137`（`wm_hints->input = !use_take_focus && !(style & WS_DISABLED)`）与 `window.c:1170`（`if (use_take_focus) protocols[i++] = xatom(WM_TAKE_FOCUS)`）；`event.c:729`（`if (use_take_focus) return TRUE;` 即**不在 FocusIn 里自己抢焦点**，等 WM 发 `WM_TAKE_FOCUS`） | **会，且是核心**：决定 Wine 走「globally active」还是「locally active」焦点模型 |
| `GrabFullscreen` | `N`（`grab_fullscreen = FALSE`） | `x11drv_main.c:474`；**⚠️ 变量除声明/赋值外全库无读取点**（**27 个文件全量** grep：wine-11.0 与 master 都只有 3 处 —— 声明、`get_config_key` 赋值、`x11drv.h` 的 `extern`，**无任何读取点**） | **不会**——当前是**死配置**；winecfg 仍写它（`programs/winecfg/x11drvdlg.c:141,225`），形成 UI↔驱动不一致 |
| `Managed` | `Y`（`managed_mode = TRUE`） | `x11drv_main.c:453`；`window.c:442` `if (!managed_mode) return FALSE;`（不做 WM 管理路径）；`desktop.c:58` 虚拟桌面下强制 `FALSE` | **会**：`N` 让 Wine 自己当 WM（≈「不依赖 WM」，与虚拟桌面同族） |
| `Decorated` | `Y`（winecfg 侧默认） | `programs/winecfg/x11drvdlg.c:155,216` 读写；**winex11.drv 全库 grep `Decorated` = 0 命中（master 与 wine-11.0 均 0）** | **不会**（对输入无影响）；且当前驱动不读，疑似同样死配置 |
| `UseXIM` | `Y` | `x11drv_main.c:486` | 间接（输入法），不改鼠标抓取 |
| `ClientSideGraphics` / `ClientSideWithRender` | `Y` / `Y` | `x11drv_main.c:480,483` | 否（渲染） |
| `ShapeLayeredWindows` | `Y` | `x11drv_main.c:489` | 否 |
| `PrivateColorMap` | `N` | `x11drv_main.c:492` | 否 |
| `PrimaryMonitor` / `ScreenDepth` / `CopyDefaultColors` / `AllocSystemColors` | `0` / 默认视觉深度 / `128` / `256` | `x11drv_main.c:495,477,498,501` | 否 |
| `UseEGL` / `UseXVidMode` / `UseXRandR` / `UseSystemCursors` / `UsePrimarySelection` / `InputStyle` | `Y` / `Y` / `Y` / `Y` / `N` / 空 | `x11drv_main.c:456-504` | 否（`InputStyle` 影响 XIM 预编辑样式） |
| **`GrabPointer`** | —— | **不存在**：master/11.0 全 `dlls/winex11.drv` grep 无任何 `get_config_key(... "GrabPointer" ...)`；只有 C 函数 `XGrabPointer()` 调用（`mouse.c:490,1442`、`window.c:3135` 的 `X11DRV_SetCapture`） | **不会**——写这个键**没有代码读取它** |
| **`GrabKeyboard`** | —— | 同上，**不存在**该注册表键 | 不会 |
| **`ClipCursor` / `ClipPointer`** | —— | 同上，**不存在**该注册表键（`NtUserClipCursor` 是 API，不是配置） | 不会 |

**`XGrabPointer` 在 Wine 里到底何时被调用（master 逐字定位）**
- `window.c:3135`（`X11DRV_SetCapture`）：`XGrabPointer( data->display, data->whole_window, False, …, PointerMotionMask|ButtonPressMask|ButtonReleaseMask, GrabModeAsync, GrabModeAsync, None, None, CurrentTime )` —— **`SetCapture` 对应物**。
- `mouse.c:490`（`ungrab_clipping_window` / clip 相关）：`XGrabPointer( data->display, clip_window, False, … )` —— **光标裁剪窗口**。
- `mouse.c:1442`：`XGrabPointer( data->display, root_window, False, … )` —— 全屏/前台时的根窗口抓取。
- 这三处**没有任何注册表开关**；唯一的间接开关是 `grab_fullscreen`（已死）。

**判定**
- 【上游已确认】`UseTakeFocus` 是**唯一**能改变「Wine 焦点/输入接收」的现存注册表开关；`Managed` 改变 WM 路径；
  其余输入相关键**要么不存在，要么已死**。
- 【我的推断】bug 59610 的「`GrabFullscreen=N` + `GrabPointer=N` 完全修好」**大概率是安慰剂/误归因**
  （前者变量无人读、后者键不存在），任何据此设计的实验都会得到「无效」而误判机制。

---

## 9. 判别实验（每个都能一刀切开「Wine 侧状态机」 vs 「KWin/X 侧抓取」）

> 目标：把「假死时输入卡在哪一层」变成**一次测量**。

**E1. 抓取是否存在（X 侧）**——假死后**不要碰该窗口**，直接点另一个**别的**应用窗口：
- 别的窗口也点不动 / 点击被吞 → **有全局 pointer grab 未释放**（X 侧/KWin 侧问题，落到 §6.3 的 `XGrabPointer` 或 KWin）；
- 别的窗口正常响应 → **没有全局 grab**，输入是「到了窗口但没进应用」（Wine 侧状态机 / 焦点模型）。
  判据强度：**最高**（一次点击即可）。

**E2. 焦点-only 恢复**——假死后用**不涉及指针抓取**的方式换焦点再换回（`wmctrl -a <win>` 或点任务栏），
再点窗口：
- 恢复 → 机制在**焦点/激活**（Wine 的 `WM_TAKE_FOCUS` 模型 或 KWin 焦点），**不是** capture；
- 不恢复 → 机制在 **capture/抓取**（59965 的方向才对）。

**E3. Wine 侧事件读数**——`WINEDEBUG=+win,+x11drv wine BeyondEditor.exe`（或加到启动脚本），复现后：
- 假死期间点击 → 日志里**有没有** `WM_LBUTTONDOWN`/`WM_NCHITTEST`（`+win` 会打消息）；
- Meta+拖动前后 → 有没有 `WM_CANCELMODE`、`FocusOut`、`FocusIn`、`lost focus, setting fg to desktop`。
  ——「有 FocusOut/无 FocusIn」= Wine 侧焦点状态机没接上；「点击根本没消息」= 事件在 X 层就被吞。

**E4. `UseTakeFocus=N` A/B**（唯一有源码支撑的开关）：
```
wine reg add 'HKEY_CURRENT_USER\Software\Wine\X11 Driver' /t REG_SZ /v UseTakeFocus /d N /f
xprop -id <win> WM_HINTS WM_PROTOCOLS   # 期望：Client accepts input or input focus: True，且 WM_PROTOCOLS 无 WM_TAKE_FOCUS
```
（`xprop` 期望值取自 KDE 525590 c0 的逐字对照。）恢复 → 焦点模型；无变化 → 排除。

**E5. 排除 KWin 6.7.5 回归**：本机 `kwin 6.8.0` 已含 revert `c32592ab`；且 `FocusStealingPreventionLevel=0`。
若假死在 6.8.0 仍复现 → **525590 不是原因**（这条是纯版本比对，零成本）。

**E6. 绑定判别（切 §6.3 的两种解释）**：读 `kwinrc [MouseBindings]` 的
`CommandActiveMouseWindow` / `CommandInactiveMouseWindow`（本机**无该段** = 默认值）。
若生效命令是 `activate, raise and move`（含 `requestFocus`）→ 恢复可由焦点解释；
若是 `move`（不含 focus 请求）→ 恢复只能由「移动引发的 ConfigureNotify/事件重排」解释。

**E7. 59965 补丁有效性**：`git apply` 其 diff → 在 11.12/11.19 都因 `grab_hwnd` 不存在而失败；
改写为 `get_capture_window()` 后编译并 A/B，才是对「跳过 WM_CANCELMODE」假说的真正检验。

---

## 10. 未找到 / 无法验证（如实登记）

- **Bugzilla 里没有**任何「59965 的 dupe / 合并 / patch 被接受」记录（已用 REST 查 bug 本身、comment、See Also、MR 搜索）。
- **Patchwork 已退役**，无法检索历史邮件补丁；`source.winehq.org/patches/data/<n>` 只是残留页面。
- **wine-staging 没有**任何 x11 输入捕获/焦点补丁（已全量枚举 300 条路径 + 3 个 winex11 补丁的 definition）。
- **Wine wiki「Useful Registry Keys」页抓取失败**（GitLab wiki 是 JS 渲染，`web_fetch` 只拿到标题；
  `wiki.winehq.org` 302 到 GitLab 且跨域不跟随）→ §8 的默认值全部改用**源码 + winecfg 源码**为准，比 wiki 更硬。
- **本机没有 Wine 11.14 staging**（实测 11.19）；「11.14 staging」这个前提本身需要主会话核实（
  是否有独立 runner/容器/Flatpak 里的 wine）。
- **Reddit 一手帖未取到**（`site:reddit.com` 两次搜索只回 KDE/Wine 官方票）→ 第三方证据以 Arch BBS、
  Valve wine fork、KDE/Wine bug 为主，**没有**引用未读过的 Reddit 帖。
