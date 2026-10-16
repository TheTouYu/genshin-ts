---
name: device-playtest-loop
description: 千星真机（编辑器 + 沙箱客户端）试玩与取数的完整闭环。当任务需要**在真实游戏里验证玩法/资产/UI 行为**，或涉及：开试玩、退试玩、真机输入注入（键盘/鼠标/拖拽）、取节点图日志与负载、桌面 GUI 自动化点按钮、编辑器卡死自救、焦点占用与归还、截图判据、GPU 图像识别、试玩批次编排——必须使用本技能。它给出 `tools/ys-editor/` 工具链（ys-gui-slot / ys-playtest-start / ys-playtest-stop / ys-pointer-click / _ys-ui.sh / ys_look.py + ys-lookd 常驻服务 / 故障处置件）的用法、坐标与像素判据表、真机输入事件实测事实（43 键槽映射、拖拽阈值）、以及"一个试玩周期做完所有实验"的纪律。区别于 debug-log-investigator（只管日志格式与解析）与 qxqy-simulator（模拟器路线）：本技能负责**把真机实验跑起来、把数据取到手**。
---

# 真机试玩与取数闭环（device-playtest-loop）

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

1. **一个试玩周期内把所有实验跑完**——一次进出周期 ≥3 分钟（UI 抖动 5~25s + 加载 30~60s）。做法：先把键盘/鼠标/拖拽/UI 操作**整批注入完**，再退出取日志。
2. **一个批次只切一次焦点**——用 `ys-gui-slot` 完成「拿到 → 跑完 → 归还」，批次内部保持同一个焦点时段。
3. **取数走「爆发注入 + 退出落盘 + 离线解析」**——屏幕有 2s+ 延迟甚至整帧冻结；这条通道又快又准。
4. **等待用「轮询 + 判据」**——按判据轮询（实测弹窗约 7s 出现、暂停菜单 >8s，固定 `sleep` 会漏）。
5. **读界面用 `read_image`（原生视觉）**——中文界面可读且零额外依赖。
6. **命令限时**（全局守则第 5 条）：预计 >5s 就先优化、单条 ≤20s、长任务放后台。

## 工具地图

| 工具 | 用途 | 关键点 |
|---|---|---|
| `ys-gui-slot <win> <秒> <命令…>` | **焦点占用包装器** | 记原焦点 → 激活并核验 → 硬时限 → `trap EXIT` 严格归还（前焦不可用时回落 firefox/DSH 页）。**一批次只调一次** |
| `ys-playtest-start [win]` | 开始试玩 | 判页面（磁贴可见就直接点）→ 点「试玩」→**轮询**弹窗→「直接上传」→「开始游戏」；实测 ~8.3s |
| `ys-playtest-stop [win]` | 退出试玩 | ESC →「中断挑战」→「离开」；**已改轮询式**（去 11.5s 固定 sleep）；暂停菜单可能 >8s 才出现，判据超时要给足 |
| `ys-pointer-click <x> <y> [tol] [ratio]` | 闭环定位 + 点击 | 本机**无绝对指针定位**（`ydotool -a` 无效、XTEST 在 Xwayland 死）⇒ `xdotool getmouselocation` 读回 + 相对步进，第 N 轮命中 |
| `_ys-ui.sh` | **判据库** | `judge/is_light/is_dark/wait_light/wait_dark`；**只截 40×40**（84ms vs 全窗 5893ms） |
| `ys_look.py` | 模板匹配 | CPU=积分图+FFT 精确 NCC（小图）／GPU=torch FFT+cumsum（大区）；**按成本链自适应** |
| `ys-lookd.py` + `ys-lookd.service` | **GPU 常驻服务** | 摊掉 `import torch` 2~3s + CUDA ~1s；客户端自动优先走服务、连不上回退本地；实测全窗 **4.4s → 1.0s** |
| `tools/ys-editor/README.md` | 完整 playbook | 坐标表、判据表、注入/取数实测事实 |
| 故障处置 | `ys-unstick`（程序化 1px 往返）／`ys-unstick2`（最小化→恢复，Wine 59965）／`ys-editor-rescue.sh`（取消置顶/最小化全部窗口）／`ys-orphans`（清 CEF 孤儿）／`ys-stuck-report`（点不动瞬间取证）／`ys-editor-guard`（试玩归来僵尸自愈）／`ys-selfconnect-vaccine`（内核层自环疫苗，需 root） | 先查 `tools/ys-editor/README.md` 版本与已知 bug，再白盒 |

## 标准流程（单周期）

```bash
export DISPLAY=:1 YDOTOOL_SOCKET=/run/user/1000/.ydotool_socket
# ① 开始（轮询式，UI 抖动 5~25s）
tools/ys-editor/ys-playtest-start
# ② 一个焦点时段内跑完所有注入批次（示例：键盘 + 拖拽）
tools/ys-editor/ys-gui-slot 0x01400001 150 bash -c '/tmp/exp-keys.sh; sleep 1; /tmp/exp-drag.sh'
# ③ 退出 → Debug_Log 落盘
tools/ys-editor/ys-playtest-stop
# ④ 离线解析（不碰桌面）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <最新会话>.gia records | grep -oP "'lua': '\K\[[a-z]+\][^']*"
```

## 坐标与像素判据（窗口 0x01400001 / 2560×1440；游戏内 UI 与窗口 1:1）

| 目标 | 坐标 | 判据 |
|---|---|---|
| 首页图标（房子） | (60, 20) | 被 DXVK 覆盖层遮挡，肉眼不可见 |
| 「试玩」磁贴 | (185, 336) | 首页成立：(185,320) 亮白 R>200；摆放页同点 = srgb(45,71,138) 或 (79,128,255) |
| 「烘焙网格体」弹窗 | (1000, 600) | 深色(~49,53,67)=弹窗在；绿色草地(G≫B)=无 |
| 「直接上传」 | (1444, 811) | 同弹窗判据；**可能需点两次**（真机点击偶发丢失） |
| 「试玩选项」弹窗 | (900, 400) | 深色(~42,46,61) |
| 「开始游戏」 | (1282, 1051) | |
| ESC 菜单「中断挑战」 | (1280, 880) | 浅色药丸（R>200,G>190） |
| 结算页「离开」 | (1833, 1365) | 浅色 |

## 取数通道（按成本排序，能用便宜的就不用贵的）

```text
程序自身日志（离线解析） > 窗口属性/进程状态 > 小区域像素判据 > 全屏截图 > OCR
```

- **首选**：让被测方自己打印。Lua `print` 落 `Beyond_Debug_Log/*.gia` 的 **field 23**（内嵌 `f2{utf8}`）⇒ `gia_log.py records` 直接取。
- 节点图日志：`gia_log.py records/frames/text/perf/ops`；事件线用 `gia_log_flow.py`（详见 `debug-log-investigator`）。
- **负载**：`gia_log.py perf`（每秒负载）。官方"负载记录"报告（峰值截图）**尚未取证**，见下节。
- 屏幕读数只在**无法自打印**时用，且走**小区域 + 判据**（40×40 裁切，84ms/次）。

## 真机实测事实（输入事件，行为层铁证）

**键盘**：43 个奇匠槽全映射（`KeyEventType` 共 164 项）

| 槽位 | 物理键 | 槽位 | 物理键 |
|---|---|---|---|
| Key1–Key9 / Key10 | 数字 1–9 / 0 | Key29–Key35 | `` ` `` `-` `=` `[` `]` `\` `,` |
| **Key11–Key22** | **U Z Y G H I O P J K L V** | Key36–Key39 | ↑ ↓ ← → |
| Key23–Key28 | F5–F10 | Key40–Key43 | 右Ctrl 右Shift Backspace CapsLock |

具名键：WASD → `KeyboardMove*`，Space → `JumpKey`，左Ctrl → `WalkOrRunKey`，F → `InteractKey`，
E/Q/R/T → `KeyboardCharacterSkill1–4`，X → `DropKey`，Tab → `OpenShortcutWheelKey`；
鼠标左 → `KeyboardNormalAttackKey`，右 → `KeyboardSprintKey`。
**C / B / N / `.` / `/` / 鼠标滚轮：零事件**（不在 43 槽面板内）。

**鼠标/拖拽**：判据 = **从按下点起的累计位移超阈**，阈值 ∈ **(2.5, 3.1] 游戏px = (4.0, 4.96] 屏幕px**
（画布 1600×900 / 窗口 2560×1440，比例 1.6）；与速度无关。
事件序列 `Dn → En → Bd → Dg×n → Up → Cl → Ed`——**`Enter` 先于 `BeginDrag`**；**每次 `Up` 都发 `Click`（含拖拽后）**。

**注入通道**：`ydotool`（内核 uinput，sock=`/run/user/1000/.ydotool_socket`）：`key <evdev>:1 <码>:0`、
`click 0xC0`（左键完整）/`0x40`/`0x80`、`mousemove -x dx -y dy`（相对）。

**探针侧硬坑**：真机上 `CursorEventData` 只有 `dragging`/`touchId`——读 `d.x/d.y/d.pressX/d.pressY`
**返回 nil 且不报错**，坐标必须走 `GetUIPos()` / `GetPressUIPos()` / `GetUIPosDelta()` **方法**。

## 成本链与性能读数（优化时的判据）

**进程启动 > I/O 面积 > 计算**：

| 项 | 实测 |
|---|---|
| 全窗 `import -window` 2560×1440 | **5893ms**（PNG 编码占大头） |
| 同窗口 40×40 裁切 | **84ms**（70×） |
| `import torch` | 2~3s（+ CUDA 初始化 ~1s）⇒ 做成常驻服务 |
| 全窗模板匹配（GPU，常驻） | **1.0s**（服务前 4.4s） |
| 试玩双流程（优化后） | start 8.3s + stop 8.2s = **16.5s**（用户手工宽松基准 43s） |

## 待覆盖（登记；用到这些能力时**先补工具，再依赖**）

| 缺口 | 官方出处 | 现状 |
|---|---|---|
| **日志窗口筛选勾选**（客户端节点图上限 99 / 服务器 10，有"勾选该类型全部"） | `docs/ui-tutorial/official-guide-auxiliary-appendix.md:1472`（窗口→日志）、`:1529`（筛选面板） | ❌ 纯手工；无坐标/判据/工具；**它直接决定日志里有没有内容** |
| **负载记录**（试玩时监控每位玩家负载、峰值截图、结束出报告） | 同上 `:51` | ❌ 从未找过该报告产物 |
| **编辑器重载/保存的可靠流程** | — | ❌ 手工；是"编辑器旧内存覆盖磁盘写回"的事故源 |
| **沙箱就绪判据**（冷启动 → 可试玩） | — | ❌ 现状从"能点到试玩磁贴"开始，隐含假设地图已加载 |

## 与其它技能的分工

- `debug-log-investigator`：日志格式、f23、解析脚本、负载语义 ← **本技能只负责把日志弄到手**
- `game-from-scratch` 阶段 7：本技能是它的真机执行器（把"提醒用户去玩一次"升级为"机器跑 + 用户终裁"）
- `verify-injection`：最小核验注入通道（编译/注入/回读）；真机行为验证接本技能
- `qxqy-simulator` / `gsts client:sim`：模拟器路线（更快、更早）
- `computer-use`（全局技能）：通用桌面自动化方法（成本链、优化四步、常驻服务通用式、`cu` 通道）——**方法层向上引用，资产层留在本技能**

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-17 | 首版：从 `tools/ys-editor/` 工具链 + 真机实测事实收拢（T02，skill-refresh 票板） |
