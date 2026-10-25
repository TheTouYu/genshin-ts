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


---

# 九、2026-10-25 18:00-18:30：C 型（窗口定格）的三环链与两个新仪表

## 9.1 新仪表（都在跑，默认只读）

| 探针 | 位置 | 读数 |
|---|---|---|
| 按事件类型计数 `e=E/C/Fi/Fo/M/U/P/CM/K/B/D/R` | `winex11.so`（`X11DRV_ProcessEvents` 谓词） | 定格期 Expose≈0、PropertyNotify 上万、FocusIn/Out 25 次/秒 |
| `tid=` / `ew=` | 同上 | 哪个线程在处理事件、Expose 打到哪个窗口 |
| **paint 链** `expose/begin/end` | `win32u.so`（`expose_window_surface` / `NtUserBeginPaint/EndPaint`）→ `/tmp/wine32u-paint.log` | 定格期 **39 对 begin/end 仍在**（应用在画，画的是旧内容） |

## 9.2 三环链（本次定格实测）

1. **应用主线程被一个无限等待按住**：全进程 23 线程 0 running、14×`read` + 8×`futex`、8 个 futex 地址互不相同（不是单锁死锁）；主线程停在 Wine 的线程唤醒管道 `read`。
2. **WM（本会话实际是 mutter，`xlsclients` 里挂着 `mutter-x11-frames`）把这窗口判为"无响应"，停止转发输入**：
   - 用户点击「日志」窗口后，探针 **`K0/B0`**（没有任何 KeyPress/ButtonPress 进来）；
   - `XGetInputFocus` 与 `_NET_ACTIVE_WINDOW` 都指向 **0x600003**——一个 1×1、`override=1`、位于 (-100,-100)、无 `WM_NAME` 的隐藏窗口；
   - **没有 pointer/keyboard grab**（0 时长抓取查询返回 `GrabSuccess`）；堆叠顺序正常（日志窗在最顶）。
   - 早前那张「beyondeditor.exe 无响应 / 强制退出·等待」弹窗即 **mutter 的判定**，不是 Wine 的。
3. **结构性动作即解锁**：全屏 / 双击标题栏 → mutter 重新同步并恢复输入 → 用户看到"活了"。

## 9.3 仍然卡住的一步（明天的入口）

**"主线程在等哪个 object"还没拿到名字**，两条路都被挡：

- **ntdll 探针不可用（源码树问题）**：给 `dlls/ntdll/unix/sync.c` 的无限等待加记录后编译失败——
  `sync.c:914: 'get_inproc_alert_fd_reply' 没有名为 'fsync_shm_idx' 的成员`。
  即**这棵源树的 `server/protocol.def` 与该文件不匹配**（fsync 相关），与我们的补丁无关，是**既有不一致**。
  ⇒ 要用 ntdll 侧探针，得先修这个协议/源码不一致（或换一棵干净的 spritz 11.14 源树）。
  （runner 的 `ntdll.so` **未被替换**：无备份文件、大小/时间仍为出厂件，已验证。）
- **gdb 栈只能到 PE 边界**：帧落在匿名映射（非 PE 头），无法命名；`addr2line` 不适用。

## 9.4 明天的三条候选（按性价比）

1. **修源树 fsync 不一致 → 编 ntdll.so 带无限等待探针**（记录 handle 数组 + 返回值）——一步到位，风险可控（有备份/哈希/verify/一键回）；
2. 换干净的 `spritz-wine-11.14-1` 源树重编 ntdll（更慢但更稳）；
3. **绕过**：在 `win32u.so` 里给 `NtUserGetMessage/PeekMessage` 加计数（确认主线程确实不在消息循环），再从应用侧日志推断它自认为在等什么——**信息量低于 1/2，但不需要 ntdll**。

## 9.5 现场可用兜底（不依赖修好）

窗口定格时：**双击标题栏**（或全屏）即可恢复输入。这是 mutter 的"重新同步"，不是修 bug。

---

# 十、2026-10-25 19:20-19:40：收敛到 `win32u` 的消息等待/队列位（下一轮的起点）

## 10.1 已定位的层次（比 §9 更进一层）

主线程确实走 `NtUserMsgWaitForMultipleObjectsEx`（`win32u/message.c:3477`），探针 `msgwait-in/out` 两次复现出现**两种错法**：

| 复现 | 读数 | 判读 |
|---|---|---|
| A（pid 2191157） | `msgwait-in count=1 timeout=INFINITE mask=0x160 h=0x4ac` → `msgwait-out **a=1**`（队列索引），立刻重入 | **队列自旋**：QS 位在、但 `PeekMessage` 产不出消息 |
| B（pid 2207223） | `msgwait-in c(qbits)=**0x1000100** h=0x3a4` → `msgwait-out **a=0**`（句柄被 signal） | 句柄反复 signal + 队列位含内部位 `0x01000000` |

`mask=0x160` = `QS_PAINT|QS_SENDMESSAGE|QS_ALLPOSTMESSAGE`（**不含输入位 0x0007**）⇒ 点击不会唤醒该等待。

## 10.2 下一轮第一件事（照做即可）

在 `dlls/win32u/message.c` 给 **`set_queue_bits` / `clear_queue_bits` / `peek_message` 的 `QS_PAINT(0x20)` 与 `0x01000000` 内部位**加配对日志（谁置位/谁清位/`PeekMessage` 是否产出消息），与 `msgwait-out` 的返回值对读，定位「置了不清」或「signal 了但没消息」的那一行。

## 10.3 现场与工具（不变）

- 三件 `.so` 由 `tools/ys-editor/ys-fakedeath-fix`（`apply-all|verify|revert-all`）管理，工件 `/home/h/.local/share/ys-fakedeath/artifacts/`，每日 systemd 漂移检查；
- 探针文件：`/tmp/wine32u-msgwait.log`（本次关键）、`wine32u-paint.log`、`wine32u-cursor.log`、`wine-ntdll-{swait,wait,obj}.log`、`wine11-proc.log`；
- **关不掉的窗口由代理代杀**（用户明确要求）：`for p in $(pgrep -f 'BeyondEditor\.exe'); do kill -TERM "$p"; done`（实测干净退出，不碰游戏）；
- 现场兜底：**双击标题栏 / 全屏**可解锁输入。

---

# 十一、2026-10-25 19:40-19:55：队列位配对仪表落地（下一轮的第一件事已做完）

> 结论先行：§10.2 要求的「`set_queue_bits`/`clear_queue_bits`/`peek_message` 配对日志」**做了，但改变了做法**——
> 服务端那两行代码在 **wineserver 进程内**，探它要重启 wineserver，而 wineserver 与游戏共用（重启=杀游戏，用户令不动）。
> 所以仪表全部落在 **win32u 客户端侧**：记「共享内存里看到的位」+「peek 取值/产出/早返回」+「等待注册的掩码与返回值」，
> 三者配对即可区分「位被谁置了没清」与「signal 了却产不出消息」。

## 11.1 三处前提纠正（源码事实，覆盖 §10.1 的写法）

1. **`0x01000000` 不是内部位**。`msgwait-in` 的 `c=` 是 `NtUserGetQueueStatus(mask)` 的返回值
   = `MAKELONG(changed_bits & flags, **wake_bits & flags**)`（`win32u/input.c:929-951`）。
   故 `0x01000000` = **高半字**里的 `QS_ALLPOSTMESSAGE(0x100)`，即 `wake_bits` 含 0x100、`changed_bits` 为 0；
   `0x1000100` 才是两半都含 0x100。内部位是 `QS_DRIVER=0x80000000` / `QS_HARDWARE=0x40000000`（`message.c:81-83`）。
2. **`set_queue_bits`/`clear_queue_bits` 不在 win32u**，在 `server/queue.c`（wineserver）。win32u 只读写共享内存的
   `wake_bits/changed_bits/internal_bits/wake_mask/changed_mask` 并发 `set_queue_mask` / `get_message` 请求。
3. **信号判定在两侧是两套**（这轮新发现的缝，可能是根因所在）：
   - 客户端 `wait_message`→`process_driver_events`→`is_queue_signaled()` 用「共享 `wake_bits`/`changed_bits` & **本次 mask**」；
   - 服务端 `get_queue_status()`（`server/queue.c:683-689`）用「`wake_bits & queue_shm->**wake_mask**` | `changed_bits & changed_mask` | internal」，
     而 `wake_mask` 是**上一次 `set_queue_mask`/`get_message` 写回的值**；
   - `NtUserMsgWaitForMultipleObjectsEx` 在**没带 `MWMO_INPUTAVAILABLE`** 时给 `wait_objects` 传 `wake_mask = 0`
     （`message.c:3544`）⇒ 服务端只看 `changed_bits`，客户端却还在看 `wake_bits`。
   ⇒ 只要 `wake_bits` 留下一个 `changed_bits` 已消失的陈旧位（典型：`QS_ALLPOSTMESSAGE`），
   就会出现「客户端说有事 → 直接进 `NtWaitForMultipleObjects` → 服务端按 `wake_mask=0` 判无事 → 停住」。
   本轮已加探针把这一对判断逐次落盘（见 11.2 的 `wait-in` / `pd-out`）。

## 11.2 仪表 v2（都已编译、已安装、哈希一致）

补丁脚本（幂等、可重放）：`.scratch/fake-death/apply-qbtrace-2026-10-25.py`、
`.scratch/fake-death/apply-wait-trace-2026-10-25.py`。落盘日志 **`/tmp/wine32u-qbits.log`**（新）+ 旧四份不变。
行格式：`<ms 单调> <pid> <tid> <tag> a=.. b=.. …`（**全部十六进制**；`ms` 与 `NtGetTickCount` 同基准 = 开机毫秒）。

| tag | 含义 | 字段 |
|---|---|---|
| `peek-in` | `peek_message` 入口（只在关注位出现/共享位变化/本线程首次时记） | a=共享 wake_bits b=共享 changed_bits c=internal_bits d=本次掩码 e=last f=flags |
| `peek-in-hwnd` | 同上，跟一行 hwnd（否则少一字段） | a=hwnd |
| `peek-pend` | 没取到消息（返回 STATUS_PENDING） | a=**skip**(1=走共享内存早返回、没问服务端) b=wake_bits c=changed_bits d=signal_bits e=clear_bits f=filter->mask |
| `peek-got` | 取到消息 | a=消息类型 b=消息号 c=hwnd d=wake_bits e=changed_bits f=wparam |
| `post` | `NtUserPostMessage` 调用点 | a=hwnd b=msg c=wparam d=lparam |
| `qs-local` / `qs-srv` | `NtUserGetQueueStatus`：本地快路 / 走服务端（服务端据此**清 changed_bits**） | a=flags b=wake_bits c=changed_bits d=返回值 e=1/0 |
| `pd-out` | `process_driver_events` 出口：本次想要的掩码 vs 共享位 vs 客户端判定 | a=wanted wake_mask b=wanted changed_mask c=**is_queue_signaled** d=共享 wake_bits e=共享 changed_bits f=共享 wake_mask |
| `wait-in` / `wait-out` | `wait_message` 里 `NtWaitForMultipleObjects` 的进出 | in: a=count b=timeout c=wake_mask d=changed_mask e=共享 wake_bits f=共享 wake_mask；out: a=返回值 e=共享 changed_bits f=共享 changed_mask |

配套读数工具：**`tools/ys-editor/ys-qbits-report`** —— 直接回答四个问题（不用人肉翻日志）：
① 哪个 tid 的 `wait-in` 没配 `wait-out`（= 冻结瞬间它停在哪个等待里，含 count/timeout/mask）；
② `peek-pend` 里有多少次 wake 位命中 `0x20|0x100|0x40`（= 「位在却产不出消息」）；
③ `pd-out` 里有多少次「客户端说有事(c=1)但掩码与共享位不相交」（= 两侧判定打架）；
④ `post` 有多少条在 300ms 内没有对应的 `peek-got`。

**容量设计（对上一代的修正）**：所有探针改成**按字节轮转**（qbits/msgwait 32MB 截断重建；ntdll 三份同样），
并加**每秒行上限**（qbits 200、GetQueueStatus 40）。上一代的「每进程 400 行封顶」实测让三路 ntdll 探针在
编辑器启动 **19 秒**后全部失明（2207223 于 19:33:58 打满），这是本轮最关键的一条仪器教训。

## 11.3 安装/结构闸门（读数）

```
tools/ys-editor/ys-fakedeath-fix win32u-install   # rc=0，备份 win32u.so.bak-fakedeath-20261025
tools/ys-editor/ys-fakedeath-fix ntdll-install    # rc=0
（工件同步）artifacts/{win32u,ntdll}.so.patched 更新，SHA256SUMS 重算，旧工件存 artifacts/superseded-20261025-1945/
tools/ys-editor/ys-fakedeath-fix verify           # rc=0：✓ winex11 / ✓ win32u / ✓ ntdll 三件与工件一致
```
结构闸门（冷 prefix `prefix-gate15`，`cmd /c echo gate-ok`）：**rc=0，输出 gate-ok**，探针文件被创建
（qbits 出现 `qs-local a=0x1cff …`），`wine-ntdll-swait.log` 正常写入。
⚠️ **GUI 闸门这次跑不了**：代理 shell 没有 `DISPLAY`（`DISPLAY` 未设置，`X0` 存在但 `XAUTHORITY` 不可读，
`nodrv_CreateWindow`）。⇒ 「窗口能建、消息循环能跑」这一层由**用户从游戏里重开编辑器**来验（见 11.4 第 1 步）。

## 11.4 复现与读法（下一轮照做）

1. **重开编辑器**（本轮已代杀：`for p in $(pgrep -f 'BeyondEditor\.exe'); do kill -TERM "$p"; done`，游戏未动）；
2. 走一次会假死的路径（点「试玩」→ 试玩失败 → 编辑器无响应），或任何一次复现；
3. 卡住时**先别杀**，跑：
   ```bash
   tools/ys-editor/ys-qbits-report                 # 四问 + 原文尾巴
   tools/ys-editor/ys-qbits-report --tail 60
   tail -3 /tmp/wine32u-msgwait.log               # 看最后一次 in 有没有 out
   ```
4. 判读优先级：**§2 未配对等待**（冻结快照）→ **§4 判定打架** → **§3 位在产不出消息** → **§5 post 无对应 got**；
5. 定位到具体一行后再动补丁（`apply-qbtrace` / `apply-wait-trace` 两脚本可重放，改完 `make -j6 dlls/win32u/win32u.so` + `win32u-install`）。

## 11.5 冻结标本存档（2207223，19:33-19:37）

`.scratch/fake-death/frozen-2207223/`（msgwait / paint / ntdll 三份原样拷贝）。`ys-qbits-report` 对它的读数：

- `msgwait-in` 36 / `msgwait-out` 35，**最后一条 in 没有 out** ⇒ 主线程停在
  `MsgWaitForMultipleObjectsEx(count=1, timeout=INFINITE, mask=0x160, h0=0x4ac, qb=0x1000000)`；
- 此前 35 条 out 全是 **a=1**（`WAIT_OBJECT_0+1` = 队列句柄）且立刻重入 ⇒ §10.1 的「队列自旋」确证；
- 同文件里 2191157（更早的进程）同型：22 in / 21 out，`h0=0x4ac`、`mask=0x160`；2207102 则以 `qb=0x0` 停住。
  ⇒ **同一批进程都停在「mask=0x160 不含输入位」的等待上**，且 `0x4ac` 这个句柄跨进程复现。
- 旧探针只有 msgwait 一路有数据（ntdll 三份都已被 400 行上限打满）⇒ 这正是本轮重做仪表的直接动因。

## 11.6 两条现场旁证（本轮顺手取的，都是对象级读数）

1. **安装不会连坐在役游戏**：`install` 新建 inode（现役 `win32u.so` inode 5396656、14,062,032 B；
   游戏 2954009 的 `/proc/*/maps` 里仍是旧 inode 2558106/2558116，路径 `/tmp/sandbox/wine/…`）
   ⇒ 游戏跑的是它启动时映射的那一代，**磁盘上的新 .so 只影响新起的进程**。游戏存活读数：
   `ELAPSED 06:12:09 / %CPU 34.6 / STAT S<Lsl`。
2. **焦点仍被隐藏窗口占着**（与 §9 的「三环链」同型，杀编辑器后依旧）：
   `DISPLAY=:1`（游戏所在的 Xwayland，`XAUTHORITY=/run/user/1000/.mutter-Xwaylandauth.VXP8W3`，
   代理可从 `/proc/<game>/environ` 取到 ⇒ **代理现在能读这块 X**，此前「无 DISPLAY」的结论只对本会话 shell 生效）：
   - `_NET_ACTIVE_WINDOW` = `0x600003`，`xdotool getwindowfocus` = **6291459 = 0x600003**（同一个）；
   - `_NET_CLIENT_LIST` 只有 `0x400003`（原神主窗）；
   - `0x600003` 上 `WM_NAME/WM_CLASS/_NET_WM_WINDOW_TYPE` 全无、`getwindowpid` = **no pid**
     ⇒ 不是普通受管窗口（override-redirect 或 mutter/Xwayland 内部 1×1 窗口）。
   - 这台机器上 `xwininfo` **未安装**（`xdotool`/`xprop`/`wmctrl` 有）。要判它属谁，下一步用
     `xdotool getwindowgeometry` + `xprop -id 0x600003` 全量输出，或直接看 `xlsclients -l`。

## 11.7 代杀命令的自匹配坑（本轮实测踩到）

文档里沿用的 `for p in $(pgrep -f 'BeyondEditor\.exe'); do kill -TERM "$p"; done` **会把自己也杀掉**：
`pgrep -f` 匹配整条命令行，而执行这条命令的 `bash -c` 命令行里**就含** `BeyondEditor\.exe` 这个模式串
（本轮实测：第三条 PID 是当前 shell，SIGTERM 后工具调用被中断）。安全写法（两种任选）：

```bash
# ① 正则自避免：把模式写成字符类
for p in $(pgrep -f '[B]eyondEditor\.exe'); do kill -TERM "$p"; done
# ② 先解析再杀：排除自身与父进程
self=$$; for p in $(pgrep -f 'BeyondEditor\.exe'); do [ "$p" = "$self" ] || [ "$p" = "$PPID" ] || kill -TERM "$p"; done
```
同族前科：`dsh-game-mode` 的 `ExecCondition` 用 `pgrep -f "YuanShen|GenshinImpact"` 自匹配导致闸门恒假
（2026-10-18 修）。**凡是 `pgrep -f` 的模式串出现在执行它的命令行里，就一定自匹配。**
