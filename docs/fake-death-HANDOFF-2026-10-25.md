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
> **状态（2026-10-25 15:55）**：已实现并装进 runner，结构闸门已过；编辑器上的 A/B 待跑。见 §六。
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


---

# 六、2026-10-25 15:40–15:55：原型构建（原件默认 + 仪表 + 可选修法 A）已装、结构闸门已过

## 6.1 开工前必须知道的树状态（别重复踩）

- 15:35 的构建里 `X11DRV_ProcessEvents` 带着 §二.4 那个「队列长度 + mask 不变就早返回」的**有害守卫**；
  15:36 已 `ys-fakedeath-fix revert`（runner 回原件），但**源码树里还留着**。
  15:35:26 启动的那个编辑器实例加载的正是这个构建（`/proc/<pid>/maps` 里 `winex11.so (deleted)`，inode 落在
  构建产物 `wine-build/dlls/winex11.drv/winex11.so` 那一代），主线程 94.7% CPU 自旋 = **启动即无响应**。
  ⇒ 那个标本与本轮修法无关，**不要当证据**；重开编辑器是必须的。
- `wine-src/dlls/winex11.drv/event.c` 里另有两处默认生效的行为改动（10-20 的「失焦不发 WM_CANCELMODE」、
  10-20 的「失焦前台复位」）。本轮全部改成 **opt-in marker**，让「不带 marker ≈ 上游 11.14 原件」成为可检验基线。
- `maybe_reset_input_state`（10-24 自动复位）调用点早已注释停用，只剩函数定义 → 编译报 `-Wunused-function`（无害）。

## 6.2 本轮构建做了什么

源树 `.scratch/fake-death/wine-src`；应用器 `.scratch/fake-death/apply-proto-2026-10-25.py`（幂等，锚点不对就报错退出，
配方 = 10-20 构建链 + `tools/ys-editor/fake-death-winex11.patch` + 本脚本）：

1. **删掉有害守卫**（§二.4）；
2. **中性仪表（默认开）**：把 `XCheckIfEvent` 的谓词换成计数包装，每 250ms 窗口写一行
   `/tmp/wine11-proc.log`：`t= pid= calls= scans= events= matched= idle= max= mask=0xNNN drain=0|1`。
   - `scans/calls` = 平均每次调用扫过多少 X 事件 —— **O(N²) 的直接读数**（不看 perf 也能判）；
   - `idle` = 扫了但一条都没匹配上的调用数（病态签名）；`max` = 单次最大扫描长度；
   - `matched` vs `events` = 「按原 mask 本不该处理、但被排空处理掉」的事件数。
3. **修法 A（默认关，`/tmp/.winex11-drain` 存在即生效）**：排空整条队列逐条分发，同时用 `filter_event`
   另行记账「有没有匹配原 mask 的事件」；排空后返回 TRUE（让 win32u 清 `QS_DRIVER` 并重新武装 fd 轮询）。
   **安全阀：单次调用最多分发 2000 条** —— 事件处理器自己会造新事件（focus_in/out → `XSetInputFocus`），
   排空循环可能自我维持；封顶保证每次调用有界返回、把 CPU 还给应用消息循环。
4. 编译：`cd .scratch/fake-death/wine-build && make -j6 dlls/winex11.drv/winex11.so`（增量 1.8s；无新增 error）。

## 6.3 安装与结构闸门（读数）

- 装：`tools/ys-editor/ys-fakedeath-fix install` → runner `winex11.so` 470816B → **3427192B**；
  备份 `winex11.so.bak-fakedeath-20261020`（470816B，`cmp` 与原件字节相同）。
- 闸门（scratch prefix，不碰游戏前缀）：`wine notepad`、`wine winecfg` 各一次 →
  - 窗口正常出现（`记事本`、`Wine 设置`）；
  - `/proc/<pid>/maps` 里 `winex11.so` 的 inode == runner 当前 inode（证明是这份 .so 在跑）；
  - `/tmp/wine11-proc.log` 出现 `drain=1` 行 ⇒ 修法 A 的代码路径**确实执行，且不破坏窗口创建与消息分发**。
- 顺手读数（修法 A 的前提在小规模上就成立）：
  `calls=7 scans=119 events=118 matched=30 idle=4 max=75 mask=0x1cff drain=1`
  —— 118 条被排空的事件里只有 30 条匹配当时的 mask；原件路径下那 88 条会**留在队列里被后续每次调用重扫**。

## 6.4 A/B 协议（工具已就位，不用人肉盯）

`tools/ys-editor/ys-fakedeath-ab [--timeout 7200] [--cpu 0.45] [--sustain 10] [--after 30] [--no-flip] [--no-perf]`

- 只认 **inode == runner 当前** 的编辑器进程（旧构建自动跳过并记一行）；
- 只判 **wine 主线程**（tid==pid）的 CPU ≥45% 且 `syscall=running` 连续 10s（渲染线程高 CPU 不算——那正是正常使用）；
- 判定自旋后：dump 前 6 个线程状态 → `perf record -e cpu_core/cycles/u -F 199 -p <pid>`（报前 28 行）
  → `touch /tmp/.winex11-drain` → 观察 30s（CPU 曲线 + 探针尾部）→ 再抓一次 perf → **还原 marker**；
- 结果：`.scratch/fake-death/ab/ab-<ts>.log` + `perf-{before,after}-<ts>.{data,txt}`。
- **成立判据**：翻转后主线程 CPU 落到 <15%，且 `drain=1` 行的 `scans/calls` 从「每次几十~几百」掉到「0~几条」、
  `events` 不再堆积。**不成立**：CPU 不降 ⇒ 自旋不在 `XCheckIfEvent`（或在事件处理器内部），回去重定位。
- `ys-fakedeath-fix` 新增：`drain-on|drain-off`、`suppress`、`ratelimit`、`original`、`fg-reset-on|off`、
  `default`（清全部 marker）、`probe [N]`、`log-clear`。

## 6.5 风险（写在前面，别当已解决）

1. **返回语义变了**：原件只在 `mask == QS_ALLINPUT` 时返回 TRUE；修法 A 排空后无条件报「已排空」。
   已核对 server 侧（`server/queue.c` 的 `set_queue_mask`：`poll_events` → `clear_queue_bits(QS_DRIVER)` +
   `set_fd_events(POLLIN)`），事件不丢、新事件靠 fd 可读重新置位；但**输入/焦点/拖拽/菜单**仍需回归（§四 4/5 步）。
2. **排空循环可能自我维持**（见 6.2 安全阀）：2000 条封顶只保证有界，不保证风暴停止。
3. **未在编辑器上验证**：本轮只跑过 notepad/winecfg；真正的判据在 6.4。
4. 游戏 `YuanShen.exe` 也走这只 runner：不带 marker 时行为 = 原件（只有每秒一行日志的开销）；
   `tools/ys-editor/ys-fakedeath-fix revert` 一条命令回原件。

## 6.6 下一步

1. **重开编辑器**（必须：15:35 那个实例是坏构建）→ 让 `ys-fakedeath-ab` 抓到假死 → 读 before/after 的 perf 与 CPU 曲线；
2. 若修法 A 成立 → 默认改成「排空开」（marker 反过来当关闭开关），重编 + 回归 §四 4/5；
3. 若不成立 → §三 设计 B（按 mask 分桶），或按新的 perf 剖面重新定位。
