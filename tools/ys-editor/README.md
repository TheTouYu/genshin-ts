# ys-editor — 千星编辑器（Wine）故障排查与解卡工具箱

> 沉淀自 2026-10-16「试玩归来再试玩」双病排查。复盘全文见
> `docs/bug-reports/retrospective-2026-10-16-editor-trial-relaunch.md`。
> **排查顺序铁律：先做「版本 + 运行配置」与上游 bug 库比对，再做白盒取证**（本轮为此多花约 3 小时）。

## 两个已定性的病（别再重新发明）

| 病 | 症状 | 根因 | 处置 |
|---|---|---|---|
| **真死** | 试玩归来再点试玩 → 「编辑器没有启动」 | 编辑器风暴式重连撞上 Linux TCP **自连接**（源端口==目标端口 → 内核直接判 ESTAB，双方空转） | `ys-selfconnect-vaccine`（把用过的端口并入 `ip_local_reserved_ports`）——已常驻 |
| **假死** | 沙箱窗/资源管理器/日志**全部点不动**，但渲染正常、可移动、可获焦 | **⚠️ 2026-10-20 旧结论已证伪**：运行中 KWin **6.8.0** + `focusStealingPreventionLevel=0`，假死**仍复发** ⇒ 不是 KDE Bug 525590。现假设 = **Wine x11drv 输入状态 desync**（Wine Bug 59965 同族，上游状态 UNCONFIRMED、无修复版本、无 regression 提交） | 用户手动解卡 = **Win+右键拖动**（仍是唯一有效手段）；根治路径 = 用 `ys-gui-slot`+`ydotool` 复现该手势 → 二分出**最小有效动作** → 找系统级等价物。旧的两条程序化解卡（`ys-unstick*`）保留为反例 |

## 工具

| 文件 | 用途 |
|---|---|
| `ys-gui-slot` | **共享桌面「申请制窗口占用」包装器**（2026-10-16 用户令：约定要做成设计，自动保证用完就还）。`ys-gui-slot <win> <max-seconds> <cmd...>`：记下当前焦点 → 激活目标窗并核验 → 硬时限运行命令 → **trap EXIT 无论成败都把焦点还回去**并打印占用秒数。所有注入类操作必须经它，禁止裸调 wmctrl/ydotool |
| `ys-pointer-click` | **闭环指针定位+点击**（本机无绝对定位能力：KWin `cursorPos` 只读、ydotool `-a` 无效、XTEST 在 Xwayland 下无效）。`ys-pointer-click <x> <y> [tol] [ratio]`：读回指针→按比例步进→逼近容差内→点击 |
| `ys-playtest-stop` | **退出千星试玩**（实测两段点击：ESC→中断挑战→离开）。坐标按窗口几何自动换算；流程与验证信号见 `evidence/2026-10-16-input-probe-measure/playtest-exit-flow.md` |
| `ys-selfconnect-vaccine` | 自环疫苗（show/once/daemon）。`ip_local_reserved_ports` 维护 + 日志 |
| `accept-meter.py` | **构建无关验收器**：试玩循环 PASS/FAIL。`PASS`=重连成功且 30s 内有 `level state changed`；`FAIL(zombie)`=连上后 30s 零推进（故障代签名）；`FAIL(storm)`=90s 没连上 |
| `ys-stuck-report` | 一键取证：进程/活动窗/指针窗/连接/自环/保留表/NLog 尾部 |
| `ys-gesture-cure` | **假死解卡的唯一有效仪器（2026-10-20 实测，用户当场确认「恢复了」）**：复现用户的「Win+右键拖动」= Meta↓ + 右键↓ + 相对移动（净位移 0，不挪窗口）+ 松开，**必须经 `ys-gui-slot` 调用**，2–3 秒完成、焦点自动还原。六个变体 `full/metric/rclick/rdrag1px/rdrag/mdrag` 供二分机制；`--dry` 只打印不注入 |
| `ys-unstick` / `ys-unstick2` | 两条解卡尝试（程序化激活+移动 / 最小化→恢复）——**本机实测均无效**，保留为反例 |
| `ys-editor-guard` | 风暴/断连判僵尸 → 杀编辑器双进程的自愈守护。**未启用**（用户否决「强杀+重启」治标路线） |
| `ys-orphans` / `ys-editor-rescue.sh` | 清 CEF 孤儿进程 / 窗口解卡（旧工具） |
| `ys-grabq.c` → `ys-grabq` | 查 X 指针/键盘抓取是否被占（`gcc -O2 -o ys-grabq ys-grabq.c -lX11`）；0=没人抓 |
| `ys-shape.c` → `ys-shape` | 查窗口的外形/可点区域（SHAPE 扩展，`-lX11 -lXext`） |
| `ys-selfconnect-vaccine.service` | 疫苗的 system 单元（enabled，开机自启） |
| （无文件）观测单元 | 均为 `systemd-run --user` 起的**瞬态**单元，无单元文件。重建示例：`systemd-run --user --unit=ys-accept --collect python3 <此目录>/accept-meter.py watch`；`ys-grabwatch`/`ys-sockwatch`/`ys-watch`/`ys-winwatch` 同法指向对应采样脚本 |

## 本机环境硬坑（踩过的）

- **`xwininfo` / `xwd` 没装** —— 用 `xdotool getwindowgeometry` + `xprop` + `import -window <id>` 代替。
- **`import -window root` 必失败**（整屏抓取用 `spectacle -b -n -f -o <file>` 或 `grim`）。
- **XTEST 指针注入在 Xwayland 下无效**（指针纹丝不动）；键盘注入未验证送达 ⇒ 输入类实验只能由用户真人做。
- **`/proc/<pid>/fd` 的 mtime ≠ socket 存活证据**（本轮据此下过错误结论，被抓包推翻）——用包/事件行为读数。
- **取证脚本必须自证拿到读数**：工具存在 + 退出码 + 产物非空；吞 stderr = 盲脚本（本轮因此跑出三次空实验）。

---

# 真机试玩实验 playbook（2026-10-17；一次周期做完所有实验）

> 铁律见根 `AGENTS.md`「真机实验铁律」。**试玩一个进出周期 ≥3 分钟**，所以下面这套流程的全部意义是：**一个周期内把该做的实验全做完**。

## 四件套

| 工具 | 用途 |
|---|---|
| `ys-gui-slot <win> <max秒> <命令...>` | 焦点管理：记下原焦点 → 激活并**核验** → 硬时限执行 → `trap EXIT` 严格还原（前焦不可用时回落 firefox/DSH 页）。**一个批次只调一次**，批次内部别再切窗 |
| `ys-pointer-click <x> <y> [tol] [ratio]` | 闭环定位+点击（本机无绝对定位：KWin `cursorPos` 只读 / `ydotool -a` 无效 / XTEST 在 Xwayland 失效） |
| `ys-playtest-start [win]` | 开始试玩：判页面（磁贴可见就直接点，不切页面）→ 点「试玩」→ **轮询**弹窗 →「直接上传」→「开始游戏」 |
| `ys-playtest-stop [win]` | 退出试玩：ESC →「中断挑战」→「离开」 |

## 标准流程（单周期）

```bash
# ① 开始（轮询式，UI 抖动 5~25s）
tools/ys-editor/ys-playtest-start
# ② 一个焦点时段内跑完所有注入批次（示例：键盘 + 鼠标 + 拖拽）
tools/ys-editor/ys-gui-slot 0x01400001 150 bash -c '/tmp/exp-keys.sh; sleep 1; /tmp/exp-drag.sh'
# ③ 退出 → Debug_Log 落盘
tools/ys-editor/ys-playtest-stop
# ④ 离线解析（不碰桌面）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <最新会话>.gia records \
  | grep -oP "'lua': '\K\[(key|cur)\][^']*"
```

## 坐标与像素判据（窗口 0x01400001 / 2560×1440，游戏内 UI 与窗口 1:1）

| 目标 | 坐标 | 判据（像素采样） |
|---|---|---|
| 首页图标（房子，**被 DXVK 覆盖层遮挡**） | (60, 20) | — |
| 「试玩」磁贴 | (185, 336) | 首页成立：采样 (185,320) 亮白 RGB>200；摆放页同点 = srgb(45,71,138) 或 (79,128,255) |
| 「烘焙网格体」弹窗 | 面板区 (1000, 600) | 深色(~49,53,67)=弹窗在；绿色草地(G≫B)=无 |
| 「直接上传」按钮 | (1444, 811) | 同弹窗判据（**可能需点两次**——真机点击偶发丢失） |
| 「试玩选项」弹窗 | 面板区 (900, 400) | 深色(~42,46,61)=弹窗在 |
| 「开始游戏」按钮 | (1282, 1051) | |
| 试玩内 ESC 菜单「中断挑战」 | (1280, 880) | 试玩中 |
| 结算页「离开」 | (1833, 1365) | 试玩结算页 |

## 输入/取数事实（实测）

- **注入通道**：`ydotool`（`YDOTOOL_SOCKET=/run/user/1000/.ydotool_socket`）：`key <evdev>:1 <码>:0`、`click 0xC0/0x41/0x81`（左/右按下抬起）、`mousemove -x dx -y dy`。**XTEST（xdotool）指针注入在 Xwayland 下无效**。
- **相对移动传递比不稳**（1.5~2.6 屏幕px/单位，随速度变）⇒ 用 `xdotool getmouselocation` 读回做闭环。
- **屏幕渲染有 2s+ 延迟，空闲时甚至整帧冻结** ⇒ **取数一律走"爆发注入 + 退出试玩让 Debug_Log 落盘 + 离线解析"**，不要逐键截图 OCR。
- **探针 Lua `print` 落在日志 field 23**（gia_log.py 已支持）；`[cur]` 行含 事件类型/UI坐标/按下点/位移，`[key]` 行含 KeyEventType 名。
- 实测数据（键盘 43 槽全映射 + 拖拽阈值 ~3 游戏px）：`evidence/2026-10-17-input-probe-experiments/experiments-record.md`。

---

## 🛡 机械兜底：注入类命令的 shim（2026-10-17 上线）

**背景**：协议要求所有注入经 `ys-gui-slot`，但"写进技能"拦不住模型（2026-10-17 事故：裸调连续抢桌面十几轮、零结果、干扰用户）。**改为机制拦截**：

```
~/.local/bin/{ydotool,wmctrl,xdotool}   →   软链到 tools/ys-editor/shims/（仓内版本化）
```
（`~/.local/bin` 在 PATH **第 1 位**，因此屏蔽 `/usr/sbin/` 的同名命令。）

| 命令 | 行为 |
|---|---|
| `ydotool` | **整条拦**（纯注入）→ 退出码 77 + 提示 |
| `wmctrl` | 只读放行（`-l/-d/-m/-p/-x/-G`）；`-a/-r/-b/-e/-c` **拦** |
| `xdotool` | 只读放行（`getmouselocation`/`getwindowname`/`search`…）；`key/click/windowactivate`… **拦** |

**放行条件**：`YS_SLOT_ACTIVE=1`（槽内，由 `ys-gui-slot` 设置）或 `YS_ALLOW_RAW=1`（逃生口，**用前须向用户说明并取得同意**）。

**拦截提示**（`shims/ys-shim-msg`）刻意写成"能救回一个倔强模型"的形态：为什么拦你 / 正确命令（可照抄）/ 用户在场怎么办 / **连续失败 2 次就停** / 逃生口。

**工具侧配合**：注入类工具（`ys-pointer-click` / `ys-playtest-start` / `ys-kwin-move`）**自带自包装**——直接调用会自己进槽（参数校验在包装之前，参数错不抢桌面）；修复类工具（`ys-unstick` / `ys-unstick2` / `ys-editor-rescue.sh`）内部声明 `YS_ALLOW_RAW=1`（它们本来就是要改窗口状态）。

**新工具 `ys-shot`**：`ys-shot <winid> <out.png>` / `-t <标题> <out.png>` / `-r x y w h <out.png>`——**先校验窗口存在再截图**，不存在退 3，绝不进 `import` 的"等用户点窗口"交互态（2026-10-17 那条 60s+ 挂死命令的根因）。
