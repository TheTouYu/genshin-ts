# 假死根治 —— 交接与下一刀设计（2026-10-25）

## 一、确定的机制（都是测量读数，不是推理）

| 读数 | 值 | 工具 |
|---|---|---|
| 卡死态主线程 | 72% CPU，`syscall=running`（纯用户态） | `/proc/<tid>/stat`、`/proc/<tid>/syscall` |
| perf 热点 | **`XCheckIfEvent` 56.35%**、`filter_event+0x0` 6.98%、`filter_event+0x14` 4.84%、`XFlush` | `perf record -e cpu_core/cycles/u -F 199 -p <pid>` |
| 调用者（另一会话 D237 的读数） | WPF Dispatcher 的 `NtUserGetQueueStatus`（`dlls/win32u/input.c:938`）高频调用 `X11DRV_ProcessEvents` | 符号 + 反汇编 |
| 队列积压来源 | 焦点风暴：某实例 `focusin.log` **170,104 行**，两窗交替 `set_foreground` 各 4.2 万次 | 驱动埋点 |
| 触发 | 焦点切到**另一个 Wine 进程**再回来 → 必死；切同进程窗 / Wayland 窗 → 不死 | 像素探针 `ys-clickable` |
| 死法 A | 主线程仍在转，只是输入状态陈旧 → **一次窗口重配可解**（解卡前一击 0px，解卡后一击 592px/30.5ms） | `ys-unstick-win` + `ys-clickable` |
| 死法 B | 主线程陷在事件循环（72% CPU）或阻塞在进程内 pipe（0% CPU）→ **重配/最大化/WM_CANCELMODE 全无效** | 同上 + `/proc/<tid>/syscall` |

**因果链**：焦点风暴 → X 事件队列积压 → `X11DRV_ProcessEvents(mask)` 每次 `XCheckIfEvent` 都要**线性扫整个队列**，
且被 WPF 每轮调用 → O(N²) 空转 → Windows 消息泵被饿死 → 鼠标键盘全丢（渲染线程独立所以画面正常）。

## 二、已试且**无效**的补丁（别再重复）

1. `focus_out()` 跳过 `WM_CANCELMODE`（含“持捕获时才跳”）——风暴次数降了，假死照旧；
2. `X11DRV_FocusIn` 里自动复位（`NtUserSetWindowPos` 改 1px 再还原，500ms 限速）——跑了 3 次，无效；
3. 事件循环加“每批最多 500 个”上限——**perf 剖面逐项不变**（自旋不在单次循环里）；
4. 入口按“队列长度未变就跳过”快速返回——**有害**（启动即无响应，`QueuedAfterReading` 在启动期长度来回变）。

runner 现为**出厂原件**（`ys-fakedeath-fix revert`，与备份 cmp 一致）。

## 三、下一刀的两个设计（按推荐度）

### A. 让 `X11DRV_ProcessEvents` 不再“只取匹配 mask 的事件”（推荐）
`dlls/winex11.drv/event.c:373` 起：现在只用 `filter_event(mask)` 取出**匹配**的事件，不匹配的留在队列里反复被扫。
改法：改成 `while (XCheckIfEvent(display,&event,always_true,...))` 把队列**排空**并逐条分发，
同时记下“有没有匹配原 mask 的事件”用于返回 QS 状态。
- 代价：可能改变 `NtUserGetQueueStatus` 的语义（事件被提前处理）；需回归：输入、焦点、拖拽、菜单。
- 验证：perf 看 `XCheckIfEvent` 是否降到 <5%；`ys-clickable` 是否恢复 CHANGED；`focusin.log` 是否还有风暴。

### B. 按 mask 分桶排队（结构性、更安全但工作量大）
在 `x11drv_thread_data` 里为每类事件建待处理队列，`ProcessEvents` 只做 O(1) 出队；需要改 `filter_event`/`get_event_data`/分发三处。

## 四、验证协议（每次改驱动必跑）
1. 编：`make -j6 dlls/winex11.drv/winex11.so`（配方见 `docs/fake-death-2026-10-20.md` §R1：wine 11.14@1012f3d9 + staging 3e0623e0 + 63 个补丁 + 本补丁；`config.h` 补 `HAVE_LINUX_FUTEX_H`；ntdll/win32u 用 runner 自带 .so 当链接输入）；
2. 装：`SRC=<产物> tools/ys-editor/ys-fakedeath-fix install`（自动备份原件）；
3. 重启编辑器 → 用 `wmctrl` 确认窗口 → **`perf record -e cpu_core/cycles/u -F 199 -p <pid>`** 看热点；
4. `ys-clickable --win <主窗> --roi 400,110,1500,320 --click 150,215 --click 150,255` 判 CHANGED；
5. 触发回归：切到原神再回来，再测一次 4；
6. 回滚：`ys-fakedeath-fix revert`。

## 五、当前环境注意
- 用户已切到 **Hyprland / Mutter 会话**（XDG 变量每次变），所有工具靠 `ys-env.sh` 自动发现 X 环境；
- `perf` 已装（`pkexec pacman -S perf` 装过一次）；采样要指定 `-e cpu_core/cycles/u`（默认事件会选到不可用的 atom PMU）。
