# Wine 11.14 X11 鼠标点击链与「编辑器假死」机制分析

> 纯离线源码分析。所有结论附 `文件:行号` 或命令读数；无法证实的一律标 **未证实**。
> 分析对象：Wine 11.14 官方 tarball（tag `wine-11.14` = commit `1012f3d99507b80d4869eabf0853567660a7ecbb`，2026-07-24 22:42:32 +0200）。
> 运行件：`/home/h/.local/share/anime-game-launcher/runners/spritz-wine-tkg-staging-wow64-11.14-1/`，`wine --version` = `wine-11.14-1-g181a18421c4 (Staging)`。
> 取证机器：Arch Linux，gcc 16.2.1，X11/GL/gnutls/vulkan 开发包齐全（见 §5.1）。

---

## 0. TL;DR（结论先行）

**点击链本身在 11.14 里是健壮的**：X 事件 → `X11DRV_ProcessEvents` → `send_mouse_input` → wineserver 入队 → `process_mouse_message` → 窗口过程，这条链上有 17 个「静默丢弃/改道」点（§3），但它们大多只在**窗口被禁用、跨线程、有 hook、菜单模式、X grab 泄漏**这类明确条件下触发。

**与「渲染正常 + 可移动 + 可获焦 + X 层看到点击 + 应用无反应 + 焦点切换后复发 + 一次 完整按下/移动/松开 手势即恢复」这一组现象最匹配的，不是丢事件，而是应用内部鼠标状态被 `WM_CANCELMODE` 打崩：**

> `dlls/winex11.drv/event.c:748-750`
> ```c
>     if (hwnd != NtUserGetForegroundWindow()) return;
>     if (!(NtUserGetWindowLongW( hwnd, GWL_STYLE ) & WS_MINIMIZE))
>         send_message( hwnd, WM_CANCELMODE, 0, 0 );
> ```
>
> `focus_out()` 在**每一次 X FocusOut**（包括 Alt+Tab、点另一个窗口、KWin 抓指针导致的焦点变化）都无条件给前台窗口发 `WM_CANCELMODE`，**不检查应用当前是否持有鼠标捕获（正在拖拽）**。这正是上游 Bugzilla **59653 / 59965** 报的问题，标题就是「UI elements become unclickable after switching windows」；两位报告人给出的 workaround（最小化再还原 / 跳过 WM_CANCELMODE）与我们的「Meta+右键+相对移动+松开」属于同一类「硬重置应用输入状态机」的动作。
>
> 上游现状：**截至 master（2026-10-20，`840a939ee`）仍未修**（master 的 `dlls/winex11.drv/event.c:746-756` 与 11.14 逐字相同），两个 bug 都是 `UNCONFIRMED`。

排序（§4 有完整判别实验）：

| 序 | 候选 | 一句话 | 强度 |
|---|---|---|---|
| C1 | **WM_CANCELMODE on FocusOut**（不论是否有 capture） | 应用内部拖拽/捕获状态被打断后不会自愈，后续点击「送到了但没人处理」 | ★★★★★ |
| C2 | 服务端 stale capture（`input_shm->capture` 未复位） | 所有点击被改道到旧的 capture 窗口 | ★★★ |
| C3 | X 层 pointer grab 泄漏（clip window / movesize / 别的进程） | 事件根本没进 Wine 客户端 | ★★（与「X 层看到事件」读数冲突，需复核该读数） |
| C4 | `menu_owner` 卡死 | `SetCapture` 静默失败 + 点击被菜单吞掉 | ★★ |
| C5 | 窗口 `WS_DISABLED`（HTERROR 丢弃） | 有隐藏模态框/`EnableWindow(FALSE)` 未恢复 | ★★ |
| C6 | 坐标经 stale `clip_rect` 映射 | 只影响 ClipCursor 场景，编辑器不会用 | ★ |
| C7 | XI2 在 root 上选了 `XI_ButtonPress` 却无人处理 | 只吞「落在 root/桌面」的点击 | ★ |
| C8 | 跨线程窗口 drop（`message.c:2632`） | 会稳定复现，不符合「偶发」 | ★ |

---

## 1. 基线与取证物

| 项 | 值 | 读数来源 |
|---|---|---|
| 源码 | `/tmp/wine-11.14`（tarball 46575228 B，解压 410 MB） | `curl` + `tar -xJf`，exit 0 |
| tag | `wine-11.14` = `1012f3d9…` "Release 11.14." 2026-07-24 | `git log -1 1012f3d9` |
| git 镜像 | `/tmp/wine-git`（blobless shallow，`--since=2025-12-01 --branch wine-11.14`） | `git clone` exit 0 |
| runner 版本 | `wine-11.14-1-g181a18421c4 (Staging)` | `bin/wine --version` |
| runner commit | `181a18421c4` **不在 wine-mirror 上游**（GitHub API 返回 `No commit found for SHA`）→ tkg staging 合并提交 | `api.github.com/repos/wine-mirror/wine/commits/181a18421c4` |
| 实际要替换的产物 | `lib/wine/x86_64-unix/winex11.so`（470816 B，真正的代码）<br>`lib/wine/x86_64-windows/winex11.drv`（7168 B，只有 `DllMain` 转 `__wine_init_unix_call()`） | `ls -l`；`dlls/winex11.drv/dllmain.c:24-30` |
| 32 位 | `lib/wine/i386-windows/winex11.drv` 存在，`i386-unix/` 不存在（WoW64：32 位 PE 共用 64 位 unix 库） | `ls` |
| 编译依赖 | x11 1.8.13 / xext 1.3.7 / xrender 0.9.12 / xfixes 6.0.2 / xi 1.8.3 / xcursor 1.2.3 / xcomposite 0.4.7 / xrandr 1.5.5 / xinerama 1.1.6 / xkbcommon 1.13.2 / freetype2 26.7.20 / fontconfig 2.18.3 / gnutls 3.8.13 / vulkan 1.4.363 全部存在 | `pkg-config --modversion` |
| 工具链 | `/usr/sbin/x86_64-w64-mingw32-gcc` (GCC 16.2.0)、`/usr/sbin/i686-w64-mingw32-gcc`、`gcc -m32` 可用、`bison/flex/make/git` 齐全 | `which` / 编译测试 `/tmp/t32` |

---

## 2. 鼠标点击在 Wine 内部的处理链（逐段，带行号）

### 2.1 段 A：X 事件 → winex11.drv 的事件分发

| 步骤 | 位置 | 说明 |
|---|---|---|
| A1 窗口选事件 | `dlls/winex11.drv/window.c:532-533` | 非 `WS_EX_TRANSPARENT` 的窗口选 `PointerMotionMask \| ButtonPressMask \| ButtonReleaseMask \| EnterWindowMask`（**没有 LeaveWindowMask**） |
| A2 泵事件 | `dlls/win32u/message.c:3342-3346` → `user_driver->pProcessEvents(events_mask)` | 由 `PeekMessage`/`GetMessage` 的过滤范围驱动；`QS_DRIVER` 内部位有效时才调 driver |
| A3 driver 主循环 | `dlls/winex11.drv/event.c:367-392` | `XCheckIfEvent(display,&event,filter_event,mask)`（377）逐个取；`XFilterEvent`（379，XIM 可吞）；`host_window_filter_event`（379）；`call_event_handler`（381）；循环结束后 `XFlush(gdi_display)` 并 `NtUserSendHardwareInput(NULL, SEND_HWMSG_RAWINPUT, &move_nocoalesce, 0)` **冲刷累积的移动**（387-388） |
| A4 事件掩码过滤 | `dlls/winex11.drv/event.c:281-321` | 把 `QS_KEY/QS_MOUSEBUTTON/QS_MOUSEMOVE/QS_PAINT/QS_POSTMESSAGE` 映射到 X 事件类型。**不匹配的事件留在 X 队列**（不是丢，是延后） |
| A5 找 HWND | `dlls/winex11.drv/event.c:327-355` | 无 handler → `TRACE("… ignoring")` 且 `return FALSE`（334-338）；`XFindContext` 找不到 → `hwnd = 0`（343-344）；`event->xany.window == root_window` → 桌面窗口（345） |
| A6 按键 | `dlls/winex11.drv/mouse.c:1484-1505` | `button >= NB_BUTTONS → FALSE`（1491）；`map_event_coords`（1502）；`send_mouse_input(hwnd, pt, MOUSEEVENTF_ABSOLUTE\|flags, data, time, NULL)`（1503） |
| A7 松键 | `dlls/winex11.drv/mouse.c:1511-1523` | `!(flags = button_up_flags[button]) → FALSE`（1517） |
| A8 移动 | `dlls/winex11.drv/mouse.c:1530-1548` | `is_old_motion_event(serial)` 丢弃（1539-1543） |
| A9 进入 | `dlls/winex11.drv/mouse.c:1554-1575` | **`hwnd == 根祖先(get_capture_window())` 时直接丢**（1564） |
| A10 坐标映射 | `dlls/winex11.drv/mouse.c:481-517` | clip window 的特殊分支：`hwnd==0 && window==thread_data->clip_window` 时 `dst += clip_rect.left/top`（492-499）；`clip_rect` 是 **进程级 static**（`mouse.c:124`） |
| A11 发出 | `dlls/winex11.drv/mouse.c:519-533` | `NtUserSendHardwareInput(hwnd, SEND_HWMSG_RAWINPUT, &input, raw)` |

> LeaveNotify：全树无 `X11DRV_LeaveNotify`（`grep -n "LeaveNotify" dlls/winex11.drv/*.c` 只命中 `event.c:299` 的 mask 与 `mouse.c` 注释），`handlers[LeaveNotify] == NULL`（`event.c:106`）→ A5 的 334-338 直接 TRACE 忽略。**Wine 不靠 X 的 Leave 事件维护「鼠标离开窗口」状态**，它永远用「消息时刻的坐标」反查窗口（§2.4），这是理解后续所有判据的关键。

### 2.2 段 B：driver → win32u → wineserver 入队

| 步骤 | 位置 | 说明 |
|---|---|---|
| B1 发送硬件输入 | `dlls/win32u/input.c:718`（`send_hardware_input`）→ `input.c:732`（`NtUserSendInput`） | 驱动侧走 `NtUserSendHardwareInput` |
| B2 server 造消息 | `server/queue.c:2175-2307`（`queue_mouse_message`） | `messages[]` 表把 `MOUSEEVENTF_*` 映射到 `WM_MOUSEMOVE/WM_LBUTTONDOWN/…`（2191-2206）；`wparam` 由 **desktop 共享内存里的 keystate** 拼 MK_* 位（1876-1882） |
| B3 选线程输入 | `server/queue.c:1888-1893` | `msg->win` 的线程 → 该线程的 `input`；否则 `desktop->foreground_input` |
| B4 **选窗口（capture 优先）** | `server/queue.c:1773-1810`（`find_hardware_message_window`） | `QS_MOUSEBUTTON/QS_MOUSEMOVE`：**`input_shm->capture` 非空 → `win = capture`，完全无视坐标**（1798）；否则 `is_window_visible(msg->win) && !is_window_transparent` → 用它（1800），否则 `shallow_window_from_point(desktop,x,y)`（1801），并用 `window_thread_from_point` 精确到子窗口线程（1802） |
| B5 无人接收则丢 | `server/queue.c:1901-1907` | `if (!win || !thread || (flags & RIDEV_NOLEGACY)) { … free_message(msg); return; }` |
| B6 入队 | `server/queue.c:1910-1916` | 合并（`merge_message`）或 `list_add_tail(&input->msg_list,…)` + `set_queue_bits(thread->queue, msg_bit)` |

### 2.3 段 C：取消息与派发（`process_mouse_message`）

| 步骤 | 位置 | 说明 |
|---|---|---|
| C1 取队列前重算窗口 | `server/queue.c:2737-2745` | `win = find_hardware_message_window(...)`；**`!win \|\| !win_thread` → 删消息 + 更新键盘状态 + 丢**（2738-2745） |
| C2 跨线程输入 | `server/queue.c:2746-2761` | `win_thread != thread` 且属于**同一 thread input** → 唤醒对方（2748-2752）；属于**另一个 thread input** → `update_thread_input_key_state` + 删除 + 丢（2754-2760） |
| C3 进入 win32u | `dlls/win32u/message.c:2873-2910`（`process_hardware_message`） | 坐标先 `map_rect_raw_to_virt`（2889-2891）→ `process_mouse_message` |
| C4 **capture 优先** | `dlls/win32u/message.c:2610-2616` | `NtUserGetGUIThreadInfo(GetCurrentThreadId(),&info)`；`info.hwndCapture` 非空 → `hittest = HTCLIENT; msg->hwnd = info.hwndCapture;` |
| C5 命中测试 | `dlls/win32u/message.c:2621` → `dlls/win32u/window.c:2765-2806` | `window_from_point`；`WS_DISABLED` → `HTERROR` 并停（2786-2790）；`WM_NCHITTEST` 返回 `HTTRANSPARENT` → 继续找下一层（2794-2798） |
| C6 **跨线程静默丢** | `dlls/win32u/message.c:2632-2636` | `if (!msg->hwnd \|\| !is_current_thread_window(msg->hwnd)) { accept_hardware_message(hw_id); return FALSE; }` — 消息被 **accept（消费掉）**，别的线程也不会再拿到 |
| C7 菜单模式特判 | `dlls/win32u/message.c:2730-2733` | `info.flags & GUI_INMENUMODE` 时不把屏幕坐标转客户区 |
| C8 hook 吞 | `dlls/win32u/message.c:2786-2796` | `WH_MOUSE` 返回非 0 → accept + `HCBT_CLICKSKIPPED` + `return FALSE` |
| C9 命中失败吞 | `dlls/win32u/message.c:2798-2803` | `hittest==HTERROR \|\| HTNOWHERE` → 发 `WM_SETCURSOR`、accept、`return FALSE` |
| C10 激活失败吞 | `dlls/win32u/message.c:2826-2855` | `WM_MOUSEACTIVATE` 返回 `MA_NOACTIVATEANDEAT` / `MA_ACTIVATEANDEAT` → `eat_msg=TRUE`（2838-2845）；`set_foreground_window` 失败也 `eat_msg=TRUE`（2848） |
| C11 交付 | `dlls/win32u/message.c:2807-2811` | `if (!remove \|\| info.hwndCapture) { msg->message = message; return TRUE; }` → 交给 `GetMessage`/`DispatchMessage` |

### 2.4 捕获（capture）状态机

| 步骤 | 位置 | 说明 |
|---|---|---|
| D1 `SetCapture` | `dlls/win32u/input.c:2027-2033` | 只调 `set_capture_window(hwnd, 0, &previous)`，**返回值是 previous，失败被静默吞掉** |
| D2 `ReleaseCapture` | `dlls/win32u/input.c:2038-2043` | 同上，`gui_flags = 0` |
| D3 真正设置 | `dlls/win32u/input.c:1985-2022` | 组 `CAPTURE_MENU`/`CAPTURE_MOVESIZE`（1991-1992）→ server 请求（1994-2004）→ **`pSetCapture(根祖先(hwnd), gui_flags, 根祖先(previous))`**（2008）→ 发 `EVENT_SYSTEM_CAPTURESTART/END` 与 `WM_CAPTURECHANGED`（2010-2017） |
| D4 server 侧规则 | `server/queue.c:3886-3911` | **`if (input_shm->menu_owner && !(req->flags & CAPTURE_MENU)) { set_error(STATUS_ACCESS_DENIED); return; }`**（3897-3901）→ 菜单模式下所有 capture 变更**失败**；成功则 `shared->capture = handle; menu_owner/move_size = …`（3904-3908） |
| D5 复位条件 | `server/queue.c:1348-1364`（`thread_input_cleanup_window`） | **只有窗口被销毁**时才把 `capture/menu_owner/active/focus/move_size` 清 0（1355-1359）。**焦点变化、Hide、失活都不清 capture** |
| D6 winex11 侧 | `dlls/winex11.drv/window.c:3111-3135`（`X11DRV_SetCapture`） | **`if (!(flags & (GUI_INMOVESIZE \| GUI_INMENUMODE))) return;`（3117）** — 普通应用 `SetCapture` 在 X 层**什么也不做**；只有菜单/移动尺寸才 `XGrabPointer(whole_window, owner_events=False, Motion\|ButtonPress\|ButtonRelease, …)`（3122-3127） |
| D7 释放 | `dlls/winex11.drv/window.c:3129-3135` | 释放分支同样要求 flags 命中，且 `if (!(data = get_win_data(previous))) return;` → **previous 窗口已销毁时 `XUngrabPointer` 不会被调用（X grab 泄漏点）** |
| D8 当前 capture 查询 | `dlls/winex11.drv/x11drv.h:992-998`（`get_capture_window()`） | `NtUserGetGUIThreadInfo(GetCurrentThreadId(),&info) ? info.hwndCapture : 0` — 替代了旧字段 `grab_hwnd`（见 §6） |

### 2.5 `clip_cursor` / clipping window 的 `XGrabPointer`

| 步骤 | 位置 | 说明 |
|---|---|---|
| E1 入口 | `dlls/winex11.drv/mouse.c:1400-1405`（`X11DRV_ClipCursor`） | `if (reset \|\| !clip \|\| !grab_clipping_window(clip)) ungrab_clipping_window();` |
| E2 建窗 | `dlls/winex11.drv/window.c:2772-2780` | 桌面窗口创建时建 **1×1 `InputOnly` override-redirect 子窗口**，`event_mask = StructureNotifyMask \| FocusChangeMask`，句柄存进桌面窗口的 property |
| E3 拿 clip window | `dlls/winex11.drv/window.c:1242-1252`（`init_clip_window`） | 每线程取同一个 property，`XSelectInput(StructureNotifyMask)` |
| E4 抓指针 | `dlls/winex11.drv/mouse.c:368-433`（`grab_clipping_window`） | 提前返回 TRUE（=「当没做也没关系」）的条件：桌面线程（377）、**X 输入焦点在别的进程窗口**（379）、无 thread data（381）、无 clip window（382）；**`keyboard_grabbed` → 拒绝并 WARN**（384-388）；无 XI2 → `NtUserClipCursor(NULL)` 拒绝（389-394）；然后 `XUnmapWindow`（398）→ `XMoveResizeWindow` + `XMapWindow`（400-402）→ `XGrabPointer(clip_window, False, Motion\|ButtonPress\|ButtonRelease, Async, Async, clip_window, None, CurrentTime)`（409-411）→ 成功才 `clipping_cursor = TRUE`（412） |
| E5 释放 | `dlls/winex11.drv/mouse.c:440-452`（`ungrab_clipping_window`） | `XUnmapWindow`（448）；**`if (clipping_cursor) XUngrabPointer(...)`（449）** —— 全局 `clipping_cursor`（`window.c:92`）是唯一闸门；随后清两个 flag（450-451） |
| E6 复位点 | `dlls/winex11.drv/event.c:779-789` | FocusOut `detail==NotifyPointer` 且 `hwnd==0` 且 `event->window == thread_data->clip_window` → `NtUserClipCursor(NULL)` + `XUnmapWindow`（783-786）；注释自认「foreground window 可能不响应」 |
| E7 复位点 | `dlls/winex11.drv/event.c:808-810` | 虚拟桌面 或 `keyboard_grabbed` → `ungrab_clipping_window()` |
| E8 重放 | `dlls/winex11.drv/event.c:713-716` | FocusIn 时若键盘 grab 刚被释放 → `reapply_cursor_clipping()`（`mouse.c:457-463`，重新 `NtUserClipCursor(current rect)`） |
| E9 win32u 侧 | `dlls/win32u/input.c:2839-2873`（`process_wine_clipcursor`） | 处理 `WM_WINE_CLIPCURSOR`；`reset` → `pClipCursor(NULL,TRUE)`；否则算 clip rect → `pClipCursor(&rect,FALSE)` 并维护引用计数 `clipping_cursor` |
| E10 `NtUserClipCursor` | `dlls/win32u/input.c:2886-2918` | 只改 server 的 cursor clip 状态并投递 `WM_WINE_CLIPCURSOR`（真正的 X grab 在 driver 的 `pClipCursor` 回调里） |

### 2.6 焦点 / Enter / WM_CANCELMODE

| 步骤 | 位置 | 说明 |
|---|---|---|
| F1 FocusIn | `dlls/winex11.drv/event.c:688-735` | pending `WM_STATE` → 忽略（697-702）；桌面窗口 → `reapply_cursor_clipping()` 后返回（707-709）；`keyboard_grabbed = (mode==NotifyGrab\|\|NotifyWhileGrabbed)`，若刚释放则 `reapply_cursor_clipping()`（713-716）；**`mode == NotifyGrab/NotifyUngrab` → 直接 return**（718）；`x11drv_xinput2_enable(display, root)`（720） |
| F2 FocusOut | `dlls/winex11.drv/event.c:774-817` | `NotifyPointer`+clip_window 分支（779-789）；pending WM_STATE / reparent 中 → 忽略（792-803）；`keyboard_grabbed` 更新、虚拟桌面或键盘被抓 → `ungrab_clipping_window()`（809-810）；`NotifyGrab/Ungrab` → return（812）；`x11drv_xinput2_disable(display, root)`（814）；`focus_out()`（815） |
| F3 **WM_CANCELMODE** | `dlls/winex11.drv/event.c:740-767`（`focus_out`） | **`if (xim_in_compose_mode()) return;`（742）** → **输入法正在组字时连 WM_CANCELMODE 都不发**；`is_virtual_desktop()` → return（747）；`hwnd != 前台窗口` → return（748）；非最小化 → **`send_message(hwnd, WM_CANCELMODE, 0, 0)`（750）** |
| F4 谁处理 | `dlls/win32u/defwnd.c:2618-2622` | `WM_CANCELMODE: menu_sys_key = 0; end_menu(hwnd); if (get_capture() == hwnd) NtUserReleaseCapture();` |
| F5 其它发送点 | `dlls/win32u/window.c:1073` | `NtUserEnableWindow(hwnd, FALSE)` 时发 `WM_CANCELMODE` |
| F6 其它发送点 | `dlls/win32u/menu.c:4693` | 取消菜单时给 top_popup 投 `WM_CANCELMODE` |
| F7 菜单收尾 | `dlls/win32u/menu.c:698`、`4343`、`3784`、`4135` | `set_capture_window(0, GUI_INMENUMODE, NULL)` 释放 capture（**只有这条路径会把 `menu_owner` 清掉**） |
| F8 销毁 | `dlls/win32u/window.c:5417`、`5608` | `if (hwnd == get_capture()) user_driver->pSetCapture(NULL, 0, toplevel)` — 注意 **flags=0**，命中 `window.c:3117` 的提前返回 → **X 层 grab 不会在这里被释放** |
| F9 菜单/移动循环 | `dlls/win32u/defwnd.c:787-900` | `SC_MOVE/SC_SIZE` 的模态循环：`set_capture_window(hwnd, GUI_INMOVESIZE)`（781）→ `NtUserGetMessage(&msg,0,0,0)`（788）循环，只在 `WM_LBUTTONUP` / 回车 / Esc / `VK_LBUTTON` 已抬起时退出（791-807）；退出时 `set_capture_window(0, GUI_INMOVESIZE)`（896） |

---

## 3. 「静默丢弃 / 改道」清单（全量）

> 判据：消息被消费或改道且**没有任何用户可见反馈**。按链路顺序编号，§4 的候选引用这些编号。

| # | 位置 | 触发条件 | 什么动作能复位 | 与「右键+修饰键+移动」手势相符？ |
|---|---|---|---|---|
| G1 | `event.c:334-338` | 该 X 事件类型没有注册 handler（**LeaveNotify 就是**） | 无（设计如此；Wine 用坐标反查代替） | 否 |
| G2 | `event.c:343-345` | 事件窗口没有 `winContext`（非 Wine 窗口，如 clip window） → `hwnd=0` | 后续 `window_from_point` 会重新命中 | 否（只影响坐标来源） |
| G3 | `event.c:379` `XFilterEvent` | XIM（fcitx5）认为该事件归它处理 | 结束输入法组字 | 未证实（XIM 通常只吞键盘） |
| G4 | `event.c:281-321` + `367-377` | `PeekMessage` 的 mask 不含该类事件 → **事件留在 X 队列** | 下一次全量 `PeekMessage`/`MsgWait` | 否（会自愈） |
| G5 | `mouse.c:1539-1543` | `serial < warp_serial` 的移动（`mouse.c:469-477`） | 新的一次移动到达 | 否（只丢移动） |
| G6 | `mouse.c:1564` | EnterNotify 的 hwnd 是 capture 窗口的根祖先 → 丢 | capture 改变 | **部分相符**（capture 相关） |
| G7 | `mouse.c:1491`/`1517` | 按键号 ≥ `NB_BUTTONS`，或该键无 up-flag（如侧键映射缺失） | 无 | 否 |
| G8 | `server/queue.c:1901-1907` | 入队时找不到窗口/线程 | 窗口出现后再点 | 否 |
| G9 | `server/queue.c:2738-2745` | 取消息时窗口已消失（**入队与取出之间**） | 下一次点击 | 否（偶发丢单次） |
| G10 | `server/queue.c:2754-2760` | 目标窗口属于**另一个 thread input** | — | 否（会稳定发生） |
| G11 | `server/queue.c:1798` + `message.c:2611-2616` | **服务端 `capture` 非空** → 消息被改道到 capture 窗口，坐标被当 HTCLIENT | `ReleaseCapture` / 窗口销毁（`queue.c:1356`）/ `WM_CANCELMODE`（`defwnd.c:2621`） | **强相符**（C2） |
| G12 | `server/queue.c:3897-3901` | `menu_owner` 非空时任何 `SetCapture` **静默失败** | 只有 `set_capture_window(0, GUI_INMENUMODE)`（menu.c:698/4343）或窗口销毁 | **强相符**（C4） |
| G13 | `win32u/message.c:2632-2636` | 命中窗口属于别的线程 → accept + drop | — | 否 |
| G14 | `win32u/message.c:2798-2803` | `HTERROR`（窗口 `WS_DISABLED`）或 `HTNOWHERE` | `EnableWindow(TRUE)` / 窗口出现 | **可能相符**（C5） |
| G15 | `win32u/message.c:2786-2796` | 全局 `WH_MOUSE` hook 返回非 0 | 卸载 hook | 否（Qt/编辑器不装 hook） |
| G16 | `win32u/message.c:2838-2845` | `WM_MOUSEACTIVATE` 返回 `MA_*ANDEAT`，或 `set_foreground_window` 失败（2848） | 应用改返回值 | 可能（但需要应用配合） |
| G17 | `win32u/message.c:2730-2733` | 菜单模式下坐标不转客户区 → 点击落在错误位置 | 退出菜单模式 | 部分（与 C4 同源） |
| G18 | `mouse.c:273` + `mouse.c:1759-1780` | root 窗口选了 `XI_ButtonPress`（XI2），但 `X11DRV_GenericEvent` **没有 `XI_ButtonPress` 分支** → `TRACE("Unhandled event")` | — | 否（只吞落在 root/桌面的点击） |
| G19 | `event.c:748-750` | **每次 FocusOut 都发 `WM_CANCELMODE`**，不管应用是否在拖拽 | 应用自己重置 / 最小化还原 / 一次完整 press-release | **最强相符**（C1） |

---

## 4. 候选排序与判别实验

### C1（★★★★★）`WM_CANCELMODE` 在 FocusOut 时打断应用鼠标状态 —— 上游 59965/59653

**机制**：`event.c:748-750`。应用正在拖拽（持有 `SetCapture`）时窗口失焦 → Wine 发 `WM_CANCELMODE` → 应用（Qt/WinForms/WPF 都如此）释放捕获、取消拖拽；但**物理按键还按着**，且应用内部「按下/拖拽中」的状态机与真实的 Win32 状态分叉。此后：
- Wine 侧一切正常（消息照发，X 层也能看到事件）→ 符合「X 层看点击送到窗口」；
- 应用侧把每次新按下当作「拖拽中的又一次事件」或直接丢弃 → 符合「点不动、日志零新增、主线程仍有 CPU」；
- 只有**一次完整的 press → move → release** 才能让状态机走到终止态 → 符合「Meta+右键+移动+松开立刻恢复」，且**不要求** Meta、不要求真的移动（净位移 0 也行）。

**上游证据（外部数据，非指令）**：
- [Bug 59653](https://bugs.winehq.org/show_bug.cgi?id=59653)（2026-04-14，component `winex11.drv`，Version 11.6，**UNCONFIRMED**）：标题「FocusOut sends WM_CANCELMODE during active mouse grab, breaking drag operations」；报告人明确指出「On native Windows, an active mouse capture survives keyboard focus changes. WM_CANCELMODE should not be sent in this state.」
- [Bug 59965](https://bugs.winehq.org/show_bug.cgi?id=59965)（2026-07-07，Version 11.12，**UNCONFIRMED**）：标题「x11drv UI elements become unclickable after switching windows due to unexpected WM_CANCELMODE during mouse grab」；现象与本案逐字对应（UI unclickable、进程未冻结、workaround 是最小化再还原）。
- 两个 bug 的 CC 是 `julliard`、`rbernon`，**无维护者回复**。

**判别实验（三选一）**：
- **E1 分层**：用 `WINEDEBUG=+event,+message` 启动编辑器复现假死，然后点一下。看日志落在哪一层：
  - `event.c:347` 的 `serial <n> ButtonPress for hwnd/window …` 出现 → 事件进了 driver；
  - `+message` 出现 `WM_LBUTTONDOWN` 派发到编辑器 hwnd → **Wine 交付成功，问题在应用侧 ⇒ C1**；
  - 只有前者没有后者 → 落在 §3（G8-G16）；
  - 两者都没有 → 落在 X 层（C3）或 driver 过滤（G3/G4）。
  - 附加关键行：假死发生时日志里应能看到 `FocusOut … ` 紧跟 `WM_CANCELMODE` 的发送记录（`+message` 会记录 `send_message`）。
- **E2 状态探针**（不改 Wine）：写一个极小 Win32 程序（`x86_64-w64-mingw32-gcc` 已装），运行时 `OpenThread`/`AttachThreadInput` 或直接对目标窗口线程调 `NtUserGetGUIThreadInfo`，打印 `hwndCapture / hwndMenuOwner / flags / GetAsyncKeyState(VK_LBUTTON)`。假死时：
  - `capture == 0 && 按钮全抬起 && flags == 0` → **C1**（Wine 侧干净，是应用自己的状态）；
  - `capture != 0` → C2；`flags & GUI_INMENUMODE` → C4；窗口 `IsWindowEnabled == FALSE` → C5。
- **E3 反证（最强）**：打 §5.3 的补丁（有 capture 时不发 `WM_CANCELMODE`），用同样的「互切焦点」操作序列复现 N 次。假死消失 ⇒ C1 成立；若仍复现 ⇒ C1 不是唯一原因，回到 E1/E2。
- **E4 最小手势**（主会话已在做）：只做「右键按下+松开」（不按 Meta、不移动）。若也恢复 ⇒ 应用内部状态机被一次完整按钮序列复位（C1）；若必须 KWin 真的抓一次指针才恢复 ⇒ 更像 C2/C3。

### C2（★★★）服务端 `capture` 卡死 → 点击被改道

`queue.c:1798` 让 capture 优先于坐标；`message.c:2611-2616` 把 hittest 强制成 `HTCLIENT`。若某次 `SetCapture` 后 `ReleaseCapture` 丢失（例如 release 事件被 G3/G4 吞掉，或窗口在移动尺寸循环里被打断），之后**所有**点击都送到那个旧窗口的客户区。
- 复位：`ReleaseCapture`、窗口销毁（`queue.c:1356`）、`WM_CANCELMODE`（`defwnd.c:2621`）。
- 判别：E2 探针看 `hwndCapture`；`+message` 看 `WM_LBUTTONDOWN` 的目标 hwnd 是否等于点击位置下的窗口。
- 与手势相符度：部分——`WM_CANCELMODE` 本身能清 capture，但我们的手势里没有 WM_CANCELMODE。

### C3（★★）X 层 pointer grab 泄漏

三个泄漏点：
1. `window.c:3129-3135`：菜单/移动尺寸结束时 `get_win_data(previous)` 失败 → `XUngrabPointer` 不执行；
2. `window.c:5417`/`5608`：窗口销毁时 `pSetCapture(NULL, 0, …)` 的 **flags=0** 命中 `window.c:3117` 提前返回 → 同样不 ungrab（**未证实** X server 是否会因 grab 窗口销毁而自动释放，标准说法是 grab 窗口被销毁时 grab 会终止，需实测）；
3. `mouse.c:440-452`：`ungrab_clipping_window` 只看**进程全局** `clipping_cursor`，若另一线程已把它清了，这里就不再 `XUngrabPointer`。
另外**跨进程**：游戏进程若在 `ClipCursor` 状态下异常（崩溃/被挂起），它的 X grab 会一直挡在所有人的鼠标事件前面（X grab 是 per-client 且会饿死其他 client）。
- 判别（**不改任何进程**）：
  - 假死时另开一个 client：`xev -root -event button`。**有事件 = 没有外部 grab**；
  - 同时 `xinput test-xi2 --root`：XI2 raw 事件**绕过 grab**。若 xev 无事件而 xi2 raw 有 → **存在 grab**；
  - 再用一个 20 行的 `XGrabPointer(root)/XUngrabPointer` 小程序点一下：若立刻恢复 ⇒ 证实 grab 泄漏且「任何客户端的 grab 会终止旧 grab」就是手势恢复机制。
- 与现象冲突点：报告里「X 层看点击事件也送到了窗口」若是在假死期间用 `xev -id <编辑器窗口>` 得到的，则 **C3 直接被否**（grab 期间别的 client 收不到事件）。**这条读数必须复核**：是 `xev` 真收到了 ButtonPress，还是只看到 `xdotool`/`xinput` 的 root 级读数。

### C4（★★）`menu_owner` 卡死

`queue.c:3897-3901` 让菜单模式下的 `SetCapture` **静默失败**；`queue.c:1798` 又把点击全送进菜单 owner；`message.c:2730-2733` 还不转坐标。典型成因：`TrackPopupMenu` 的模态循环线程被卡住/窗口销毁（`menu.c:4693` 的 `WM_CANCELMODE` 没送到）。复位只有 `set_capture_window(0, GUI_INMENUMODE)`（`menu.c:698`/`4343`）或窗口销毁。
- 判别：E2 的 `flags & GUI_INMENUMODE` / `hwndMenuOwner`；`+message` 里是否长期停在 `WM_ENTERMENULOOP` 之后。

### C5（★★）窗口被禁用（`HTERROR`）

`window_from_point` 见 `WS_DISABLED` 直接 `HTERROR`（`dlls/win32u/window.c:2786-2790`），`message.c:2798-2803` 丢弃并只发 `WM_SETCURSOR`。成因：某个模态对话框把主窗 `EnableWindow(FALSE)` 后对话框被藏起来/跨桌面。
- 判别：E2 里 `IsWindowEnabled(编辑器主窗)`；或 `xwininfo -tree` 看有没有隐藏的 owned window。

### C6-C8（★，低）

- C6：`mouse.c:492-499` 用进程级 `clip_rect` 补坐标；只在 ClipCursor 生效（游戏）时才有 stale 风险，且**编辑器进程与游戏进程各自有独立的 `clip_rect`**，不会串。
- C7：`mouse.c:273` 在 root 上选 `XI_ButtonPress`，但 `mouse.c:1759-1780` 没有对应分支 → 落在 root/桌面的点击被 `TRACE("Unhandled event")` 吞掉（G18）。这能解释「点桌面没反应」，不能解释「点编辑器窗口内没反应」。
- C8：`message.c:2632` 的跨线程 drop 需要「入队时的窗口线程 ≠ 取出时的窗口线程」，正常交互下不会稳定发生。

---

## 5. 补丁可行性

### 5.1 这台机器能不能构建：**能**（实测 configure）

```
mkdir -p /tmp/wine-build && cd /tmp/wine-build
/tmp/wine-11.14/configure --enable-archs=x86_64 --disable-tests
```
- **实测 exit 0**，耗时 < 1 分钟（08:34:5x → `configure.log` 08:35:53），末行 `configure: Finished.  Do 'make' to compile Wine.`
- 只有两条无关警告：`OSS … too old`、`libcapi20 64-bit development files not found, ISDN won't be supported`。
- 依赖判据（全部满足）：X11 系列（x11/xext/xrender/xfixes/xi/xcursor/xcomposite/xrandr/xinerama/xpresent/xkbcommon-x11）、freetype2、fontconfig、gnutls、vulkan、libpulse、libpipewire、libudev、dbus-1 均有 `pkg-config` 版本；`x86_64-w64-mingw32-gcc`（GCC 16.2.0）与 `i686-w64-mingw32-gcc` 均在 `/usr/sbin`；`gcc -m32` 可编译通过（`/tmp/t32` 存在）。
- **未跑 `make`**（按任务要求只做到 configure 级；且主会话正在做 GUI 计时实验，避免 16 路编译干扰时序）。

### 5.2 只构建这一个模块的命令序列

```
cd /tmp/wine-build
make -j$(nproc) dlls/winex11.drv/all
```
- 目标是 `dlls/winex11.drv/all`（模块目录里的 stub Makefile：`all clean version.res winex11.so x86_64-windows/dllmain.o x86_64-windows/winex11.drv …`）。
- `make -n dlls/winex11.drv/all` 展开 **1456 条命令**（不是全量构建）：会先编译 host 工具（`tools/widl`、`tools/winegcc`、`tools/wrc` …）再编译 `ntdll/kernel32/ucrtbase/winecrt0/compiler-rt` 的 import lib，最后链接模块。16 核实测估 2–5 分钟（**未实测**）。
- 产物两个：
  - `/tmp/wine-build/dlls/winex11.drv/winex11.so` ← **event.c/mouse.c/window.c 全在这里**（`event.c` 只编译一次，`-DWINE_UNIX_LIB`，见 dry-run 第 219 行）
  - `/tmp/wine-build/dlls/winex11.drv/x86_64-windows/winex11.drv` ← 仅 `dllmain.o + version.res`，补丁不碰它就不用换

> 关键结论：**改 `event.c`/`mouse.c`/`window.c` 只需要换 `winex11.so` 一个文件**（PE 侧是 7 KB 的壳，`dllmain.c:24-30` 只做 `__wine_init_unix_call()`）。

### 5.3 候选补丁（C1，6 行；已按 11.14 适配）

上游报告的补丁用的是 `x11drv_thread_data()->grab_hwnd`，**该字段在 11.14 已被删除**（commit `2b3512e7` "winex11: Get rid of now unnecessary x11drv_thread_data()->grab_hwnd."，Rémi Bernon，2026-06-17），替代品是 `x11drv.h:992-998` 的 `get_capture_window()`。因此补丁写成：

```c
/* dlls/winex11.drv/event.c, focus_out() */
     if (is_virtual_desktop()) return;
     if (hwnd != NtUserGetForegroundWindow()) return;
     if (!(NtUserGetWindowLongW( hwnd, GWL_STYLE ) & WS_MINIMIZE))
-        send_message( hwnd, WM_CANCELMODE, 0, 0 );
+    {
+        HWND capture = get_capture_window();
+        if (capture)
+            WARN( "skipping WM_CANCELMODE, %p has capture %p\n", hwnd, capture );
+        else
+            send_message( hwnd, WM_CANCELMODE, 0, 0 );
+    }
```

**已成品**：同目录 `WINE-CANCELMODE-PATCH.diff`（带完整 diff 与环境变量闸门 `WINEX11_KEEP_CAPTURE_ON_FOCUS_OUT`）。**实测**：在 11.14 源码上 `patch -p1 --dry-run` 与真 apply 均通过（`DRYRUN_OK` / `APPLY_OK`，落点 `event.c:755-761`）。

风险：所有 Wine 应用的行为都会变（菜单/拖拽在失焦时不再被取消）。因此补丁默认**惰性**（不设环境变量 = 原行为），只在本机实验时开启，验证通过再决定是否常开。备选更保守的闸门：只在 `capture` 的根祖先 == 正在失焦的窗口时不发（语义更接近「不打断自己的拖拽」，不改变跨窗口/菜单取消行为）。

### 5.4 安装 / 回滚（runner 是只读参考，此处只列命令，不执行）

```
R=/home/h/.local/share/anime-game-launcher/runners/spritz-wine-tkg-staging-wow64-11.14-1
cp -a "$R/lib/wine/x86_64-unix/winex11.so" "$R/lib/wine/x86_64-unix/winex11.so.bak-$(date +%F)"
install -m644 /tmp/wine-build/dlls/winex11.drv/winex11.so "$R/lib/wine/x86_64-unix/winex11.so"
# 回滚
cp -a "$R/lib/wine/x86_64-unix/winex11.so.bak-<date>" "$R/lib/wine/x86_64-unix/winex11.so"
```
- 验收判据（行为读数，非文件 mtime）：`wine notepad` 能起窗口；`WINEDEBUG=+event` 有 `X11DRV` 事件日志；再跑编辑器复现流程。
- **ABI 风险（必须知道）**：runner 是 `11.14-1-g181a18421c4`（tkg staging 合并），我们编的是 **vanilla 11.14**。`winex11.so` 通过 `-lwin32u`（`dlls/winex11.drv/Makefile.in:4`）与 runner 的 `win32u.so` 动态链接，若 staging 改动过 win32u 导出符号，会在**加载期**报 `undefined symbol` / `failed to load winex11.drv`（不静默）。所以：先备份、先用 `notepad` 试、失败即回滚。
- 若编辑器是 32 位：configure 用 `--enable-archs=i386,x86_64`，并同时替换 `lib/wine/i386-windows/winex11.drv` 与 32 位 unix 库（本 runner 的 WoW64 布局里 32 位 PE 共用 `x86_64-unix`；以实际 `ls` 为准）。

---

## 6. 上游状态

| 项 | 读数 |
|---|---|
| 源码里 `59965` | `grep -rn 59965 --include=*.c --include=*.h --include=*.md .` → **0 命中**（无 TODO/注释） |
| Bug 59653 | UNCONFIRMED，component `winex11.drv`，Version 11.6，2026-04-14 报，2026-07-07 最后修改；CC julliard/rbernon；无维护者回复 |
| Bug 59965 | UNCONFIRMED，Version 11.12，2026-07-07 报；`see also` 59653；无评论 |
| master 是否修了 | **没有**。master（`840a939ee`，2026-10-20 抓取）`dlls/winex11.drv/event.c:746-756` 的 `focus_out()` 与 11.14 逐字相同，仍然无条件 `send_message(hwnd, WM_CANCELMODE, 0, 0)` |
| master 是否有相关改动 | 有，但在**同一区域**：FocusIn/FocusOut 里 `x11drv_xinput2_enable/disable` 被移到所有 early-return **之前**（11.14 在 `event.c:720`/`814`，master 在函数开头），并新增 `WARN("Ignoring destroyed window …")`。说明这块正在被人动，但不是针对 WM_CANCELMODE |
| `grab_hwnd` | 已被 commit `2b3512e7`（2026-06-17，Rémi Bernon）删除，改用 `NtUserGetAncestor(get_capture_window(), GA_ROOT)`；上游两个 bug 的补丁因此在 ≥11.13 上**不能直接 apply** |
| 近期 x11drv 输入相关提交（11.14 之前，`git log`） | `08f7b746` winex11: Send raw mouse motion frames from XI2 RawEvents；`a2ceea3e` winex11: Enable XI2 raw events when window is focused；`f26c699d` winex11: Get rid of now unnecessary event merging logic；`21f24279` win32u: Accumulate mouse motion in NtUserSendHardwareInput；`9329917d` win32u: Ignore empty mouse input in NtUserSendHardwareInput；`6a851988` winex11: Pass / return a POINT to / from map_event_coords |

---

## 7. 未证实项与下一步（按优先级）

1. **未证实**：「X 层看到点击事件送到窗口」这条读数的采集方法。它决定 C3 是否直接出局。→ 复核：假死时 `xev -id <编辑器窗口>` 是否真打印 `ButtonPress`；同时抓 `xinput test-xi2 --root`。
2. **未证实**：编辑器是 Qt / WinForms / WPF（NLog 暗示 .NET）。不同框架对 `WM_CANCELMODE` 的复位语义不同，但「拖拽被取消后状态机分叉」这一层是共通的。
3. **未证实**：11.14 的 `winex11.so` 与 runner 的 staging `win32u.so` 的符号级兼容（只能靠加载测试）。
4. **未证实**：X server 在 grab 窗口被销毁时是否自动终止 grab（影响 C3-2 的定性）。
5. 下一步（不在本任务范围）：E1 `WINEDEBUG=+event,+message` 分层；E2 探针读 `hwndCapture/menu_owner/窗口 enabled/按钮状态`；E4 最小手势（只右键按下+松开）。

---

### 附：可复用命令

```
# 代码定位
grep -n "WM_CANCELMODE" dlls/winex11.drv/event.c dlls/win32u/defwnd.c
grep -n "capture" server/queue.c | head
grep -n "XGrabPointer\|XUngrabPointer" -r dlls/

# 分层日志（需要重启应用，不是注入）
WINEDEBUG=+event,+message wine BeyondEditor.exe 2>&1 | tee /tmp/editor-trace.log
grep -nE "ButtonPress|button [0-9]|WM_[LRM]BUTTON|WM_CANCELMODE|FocusOut" /tmp/editor-trace.log | tail -50
```
