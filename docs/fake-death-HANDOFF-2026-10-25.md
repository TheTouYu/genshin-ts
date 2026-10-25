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
   **安全阀：单次调用最多**取出** 256 条，撞限 `NtYieldExecution()` 后返回 FALSE** —— 三重理由：
   ① 事件处理器自己会造新事件（focus_in/out → `XSetInputFocus`），排空循环可能自我维持；
   ② `count` 只数「分发」、被 `XFilterEvent`/`host_window_filter_event` 吞掉的不计 ⇒ 用 `count` 封顶在
   「取出→被吞→再投回」闭环里会失效（独立评审抓出的会坏级缺陷，已改成独立的 `iter` 取出计数）；
   ③ 撞限返 FALSE 会保持 `QS_DRIVER`，而 win32u 的 `wait_message` 是 `do{NtWaitForMultipleObjects}while(…&&!process_driver_events)`，
   队列 handle 在 QS_DRIVER 置位期间恒 signaled ⇒ **不 yield 就是紧循环**（评审 §4）。
4. 编译：`cd .scratch/fake-death/wine-build && make -j6 dlls/winex11.drv/winex11.so`（增量 1.8s；无新增 error）。

## 6.3 安装与结构闸门（读数）

- 装：`tools/ys-editor/ys-fakedeath-fix install` → runner `winex11.so` 470816B → **3427192B**；
  备份 `winex11.so.bak-fakedeath-20261020`（470816B，`cmp` 与原件字节相同）。
- 闸门（scratch prefix，不碰游戏前缀）：`wine notepad`、`wine winecfg` 各一次 →
  - 窗口正常出现（`记事本`、`Wine 设置`）；
  - `/proc/<pid>/maps` 里 `winex11.so` 的 inode == runner 当前 inode（证明是这份 .so 在跑）；
  - `/tmp/wine11-proc.log` 出现 `drain=1` 行 ⇒ 修法 A 的代码路径**确实执行，且不破坏窗口创建与消息分发**。
- **驱动 ABI 未变**：`nm -D --defined-only` 对比原件与补丁 .so，**导出符号集逐行相同**（diff 0 行）——
  本次只加了 static 函数，`WINE_GDI_DRIVER_VERSION`/驱动函数表不动，所以不存在 10-20 那个「驱动接口 110 vs 111」的墙。
- **仪表字段**：`t= pid= calls= scans= events= matched= idle= max= itermax= mask= drain=`。
  注意计数是**进程级 static**（多线程共写），判据按整进程读，别当主线程指标（评审 §7 的可测性提醒）。
- 顺手读数（修法 A 的前提在小规模上就成立）：
  `calls=7 scans=119 events=118 matched=30 idle=4 max=75 mask=0x1cff drain=1`
  —— 118 条被排空的事件里只有 30 条匹配当时的 mask；原件路径下那 88 条会**留在队列里被后续每次调用重扫**。

### 6.3.1 试过但**不可用**的验证通道（别重复）

- **桌面注入全被挡**：`xdotool windowsize` / `wmctrl -i -r` 被 `ys-shim` 拦（共用桌面必须有焦点租约）；
  `ys-gui-slot` 在本机会话直接 `rc=3`（KWin 权威通道不可用 —— 已迁 Hyprland）。
  ⇒ 要事件就**冷 prefix 启 Wine 应用**（`winecfg` 冷启动能出 3~4 行探针），不要试图注入桌面。
- **`XSendEvent` 合成按键不被 Wine 采纳**：`/home/h/genshin-ts/.scratch/fake-death/xsendkey.c`（只向指定窗口
  post KeyPress/KeyRelease，不动焦点指针）编译可用、也把事件推进了驱动（探针有 `events`），但记事本标题
  始终不出 `*`（未修改标记）⇒ **输入通道回归只能靠真机编辑器**（§四 4/5 步），不能拿合成事件当替代。

## 6.4 A/B 协议（工具已就位，不用人肉盯）

`tools/ys-editor/ys-fakedeath-ab [--timeout 7200] [--cpu 0.45] [--sustain 10] [--after 30] [--no-flip] [--no-perf]`

- 只认 **inode == runner 当前** 的编辑器进程（旧构建自动跳过并记一行）；
- 只判 **wine 主线程**（tid==pid）的 CPU ≥45% 且 `syscall=running` 连续 10s（渲染线程高 CPU 不算——那正是正常使用）；
- 判定自旋后：dump 前 6 个线程状态 → `perf record -e cpu_core/cycles/u -F 199 -p <pid>`（报前 28 行）
  → `touch /tmp/.winex11-drain` → 观察 30s（CPU 曲线 + 探针尾部）→ 再抓一次 perf → **还原 marker**；
- 结果：`.scratch/fake-death/ab/ab-<ts>.log` + `perf-{before,after}-<ts>.{data,txt}`；
  文件格式与判读法见 `.scratch/fake-death/ab/README.md`。
  **默认会翻转**（30s 后自动还原 marker）；纯观察加 `--no-flip`。
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

## 6.5.1 独立静态评审（另一模型，只读，2026-10-25 15:56）

**结论：返回语义安全、嵌套安全、XPutBackEvent 不会死循环、XFlush 次序自洽**；抓出两处必修：

1. **（会坏级，已修）封顶用 `count` 会失效**：`count` 只在分发后自增，被 `XFilterEvent`/`host_window_filter_event`
   吞掉的走 `continue` 不计 ⇒ 「取出→被吞→再投回」闭环里封顶形同虚设。已改 `iter` 取出计数 + cap 256 + 撞限 `NtYieldExecution()`。
2. **（A/B 矩阵级，已满足）drain 必须与两个 focus 开关分开测**：MapNotify 清 `data->reparenting`、
   UnmapNotify「意外 unmapped」置 `reparenting=1`，而 `focus_out()` 有 `window_is_reparenting()` 抑制守卫
   （`event.c` 的 FocusOut 段）⇒ 记账被提前处理会**反向改焦点语义**，与 `suppress-cancelmode`/`fg-reset` 叠加则不可归因。
   本构建三个 marker 默认全 off，drain 单独可测 ✔。

**评审给出的更小替代**（本轮未走，理由记录在案）：win32u 一行 `message.c:3346` 改 `pProcessEvents(QS_ALLINPUT)` ——
`filter_event` 对 QS_ALLINPUT 恒真，原件循环自动全排空，零新代码、一行回滚；但**要重编 `win32u.so`**，
而 10-20 已实测过驱动接口 110 vs 111 的墙（vanilla 树强改常量 → 窗口一个都建不出来）。本轮只动 `winex11.so`（ABI 已验证相同），
所以不走这条路；若将来要做得更小，先解决 win32u 的同源构建。

**仍未闭合（评审标注未核实）**：
- `XFilterEvent` 的 XIM 回调是否可能在 `current_event==NULL` 期间回调进 win32u 再触发 `ProcessEvents`（递归 drain 风险）→ 需读 `xim.c`；
- `keyboard.c`/`mouse.c` 处理链里是否有同步 `SendMessage` 到窗口过程 —— 若有，则「一次 `GetQueueStatus(QS_PAINT)` 里分发 KeyPress」
  等于在画图中途重入窗口过程（WPF/CEF 最易崩的形状）。这两条决定「输入/焦点/拖拽/菜单回归」要通过到什么程度。

## 6.6 下一步

1. **重开编辑器**（必须：15:35 那个实例是坏构建）→ 让 `ys-fakedeath-ab` 抓到假死 → 读 before/after 的 perf 与 CPU 曲线；
2. 若修法 A 成立 → 默认改成「排空开」（marker 反过来当关闭开关），重编 + 回归 §四 4/5；
3. 若不成立 → §三 设计 B（按 mask 分桶），或按新的 perf 剖面重新定位。


---

# 七、2026-10-25 16:10–16:35：找到真正的死因（SIGSEGV 风暴）并打了 win32u 补丁

## 7.1 先把 handoff 的方案 A **证伪**（别再在事件队列上下刀）

编辑器用上新驱动后**真死**一次，读数为证：

| 判据 | 读数 | 结论 |
|---|---|---|
| 驱动探针（`/tmp/wine11-proc.log`） | 死时 `calls=2~5`/250ms、`scans=4~18`、`max` 个位数 | **队列没有积压**，`XCheckIfEvent` 不在热点 |
| 修法 A 开关 A/B（等长窗口 CPU ticks） | `drain=off` **+61** / `drain=on` **+63** | **排空对本例无效** |
| 主线程 | 100% 单核、`syscall=running`、`utime:stime ≈ 1:1` | 不是纯用户态自旋，信号投递占一半 |
| `strace -c` | **`rt_sigreturn` 5.9 万次/秒** | 每秒约 6 万次信号 |
| `strace -e trace=signal` | 2 秒 **200,518 次 SIGSEGV**，**全部 `SEGV_ACCERR`、`si_addr` 恒为 `0x40000000d`** | 同一地址的违例风暴 |
| gdb 抓首次违例 | `mov 0x8(%r14),%rax`，**r14 ≡ `0x400000005`**；指令在 `win32u.so` | 坏指针解引用 |
| 该 15 字节自旋锁序列在 win32u 41 个 `.o` 里搜索 | **唯一命中 `winstation.o` 的 `get_shared_desktop`**（`dlls/win32u/winstation.c:202`） | 位置钉死 |
| 地址所属映射 | `18b401000-4140060000 ---p`（255 GB PROT_NONE 保留区） | 指针指向**未映射**的共享会话区 |

⇒ 死法是**活锁**：`get_shared_desktop()` 拿线程级缓存 `data->shared_desktop` 里的坏指针去读 seqlock →
每次违例 → 调用侧 `while (get_shared_desktop(...) == STATUS_PENDING)` 无上限重试 → 十万次/秒。
`data->shared_desktop` 在**整个 win32u 里只有两处赋值、没有任何失效点**。

## 7.2 修复（`dlls/win32u/winstation.c`，diff 见 `wine-src-notes/WIN32U-SHARED-FIX-2026-10-25.diff`）

1. 新增 `shared_object_is_mapped()`：判断对象指针是否落在**已映射的 session 块**区间内；
2. `get_shared_desktop()` / `get_shared_queue()`：缓存指针不在块内 ⇒ `ERR` + **清缓存重取**；
3. 重取后仍不在块内 ⇒ 返回 `STATUS_INVALID_HANDLE`（宁可报「没有共享桌面」，也不进无限解引用）；
4. **落盘探针**（stderr 不可见，见 7.4）：命中时追加一行到 `/tmp/wine32u-shared-fix.log`（最多 32 行）。

## 7.3 安装 / 回滚（已一并进 `ys-fakedeath-fix`）

```bash
tools/ys-editor/ys-fakedeath-fix win32u-install   # 装（备份 win32u.so.bak-fakedeath-20261025，2328576B）
tools/ys-editor/ys-fakedeath-fix win32u-status    # 看补丁/探针/备份
tools/ys-editor/ys-fakedeath-fix win32u-revert    # 回原件（字节比对）
```

**已验证**：导出符号集与原件**逐行相同（diff 0）**；scratch prefix 里
`wine notepad`/`wine winecfg` 窗口正常出现、驱动版本无 `nodrv` 报错、驱动探针照常出数。
**待验证**：编辑器真机复现（判据见 7.5）。

## 7.4 顺带查到的独立问题（未修，先记账）

- 启动器日志里 **76,940 条** `err:msg:process_hardware_message unknown message type 1/2/3`
  （`dlls/win32u/message.c:2906`，**全部来自同一线程 `00d0`**）。机制：`INPUT_HARDWARE` 走
  `req->input.hw.msg = input->hi.uMsg` 原样入队；`get_hardware_msg_bit()` 对未知消息**默认返回 QS_MOUSEBUTTON**，
  而 `process_hardware_message()` 认不出就把消息丢掉。**能喂出 msg=1/2/3 的调用方未定位**（`NtUserSendInput` 本身拒绝
  `INPUT_HARDWARE`；驱动侧四条 `NtUserSendHardwareInput` 都只发 keyboard/mouse）——下一步需要驱动侧探针。
- **编辑器 stderr 落盘缺口**：它是 `pipe:[41693466]`（与游戏共用），launcher 的 `game.log` mtime 停在 14:46
  ⇒ 编辑器自己的 `err/fixme`（含上面的 unknown message type）**一条都看不到**。为绕开这条缺口，本补丁自带文件探针。

## 7.5 真机复现的判据（下次假死/正常使用时读）

| 现象 | 读数 | 判定 |
|---|---|---|
| 修复生效 | `/tmp/wine32u-shared-fix.log` 出现 `desktop-cache-invalid` 行 | **根因坐实**（缓存指针失效），且活锁被切断 |
| 只出现 `desktop-fresh-unmapped` | 重取后仍不在块内 | 块从未映射（另一条路径），需要看 server 侧 session section |
| 完全没探针行但照样死 | `strace -e trace=signal -c` 仍见万级 SIGSEGV | 自旋不在 `get_shared_desktop`，回到 perf 定位 |
| 正常使用 | 探针文件不出现、CPU 正常 | 补丁无副作用（默认路径只多一次 O(块数) 地址比较） |


---

# 八、保证工作流：补丁的「落盘 + 防漂移」（2026-10-25 17:54）

补丁的价值在于**长期在役**。runner 是 launcher 管的，随时可能被更新/重装覆盖，所以做了三层：

## 8.1 工件落盘（不依赖 .scratch 与 build tree）

```
/home/h/.local/share/ys-fakedeath/artifacts/
  winex11.so.patched   3,428,400B   5a9270a3…   (仪表 + 可选 drain；默认不出手)
  win32u.so.patched   14,035,056B   fc081f0d…   (共享会话指针校验；默认路径逐条等价)
  winex11.so.pristine    470,816B   d5e12837…   (出厂原件)
  win32u.so.pristine   2,328,576B   cde26ecc…   (出厂原件)
  SHA256SUMS / MANIFEST.txt（含构建源树、补丁源码路径、安装/校验/回滚命令）
```

补丁**源码**在 git 里（`wine-src-notes/PROTO-2026-10-25.diff`、`WINE-SHARED-FIX-2026-10-25.diff`），
所以即使工件丢了也能从 build tree 重建（`wine-build/` 下 `make dlls/{winex11.drv,win32u}/…`）。

## 8.2 一条命令装/验/回

```bash
tools/ys-editor/ys-fakedeath-fix apply-all    # 装两件 + 立即校验
tools/ys-editor/ys-fakedeath-fix verify       # 只读比对哈希：rc=0 在役 / rc=1 漂移（附修复命令）
tools/ys-editor/ys-fakedeath-fix revert-all   # 两件回出厂原件（字节比对）
tools/ys-editor/ys-fakedeath-fix status | win32u-status
```

`verify` **负向测试已过**：把工件换成假文件 → `✗ win32u.so 漂移 (…)` + `rc=1` + 打印修复命令；
换回真工件 → `rc=0`。

## 8.3 自动漂移检查（不会静默失效）

```bash
systemctl --user status ys-fakedeath-verify.timer     # 开机 5 分钟后 + 此后每天一次
```

命中漂移时走 `dsh-notify -u critical -t 8000` 弹一条（带 stack-tag 防叠摞），文案里直接给修复命令。
unit：`~/.config/systemd/user/ys-fakedeath-verify.{service,timer}`；实测 `Result=success / ExecMainStatus=0`，
`NEXT` 已排到次日。

**什么时候会漂移**（提前知道就不会慌）：launcher 更新/重装 runner、手动替换 runner 目录、换机重装。
发现漂移 → 一条 `apply-all`；如果 runner 的 wine 版本变了（不是 11.14 spritz），**不要**直接 apply——
先用 `MANIFEST.txt` 里的源树重建，否则驱动接口版本会打架（10-20 就踩过 110/111 的墙）。
