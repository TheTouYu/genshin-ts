# 真机输入探针测量记录（地图 1073741831 输入探针v2）

> 采集方式：ydotool（内核 uinput）注入 + X11 窗口截图 OCR 读取探针读数；详见 computer-use 技能「无 AT-SPI 窗口」节。
> 设备：Linux + Wine（spritz-wine-tkg-staging-wow64-11.14），游戏窗 2560×1440，千星画布 1600×900（比例 1.6），输入方式=鼠标+键盘。
> 采集日期：2026-10-16。

## 一、协议 B：物理键 → KeyEventType 映射

标注：✅=本次读到独立读数；⚠️=读到的是陈旧帧（需复验）；📌=官方默认键位表交叉印证。

### 已确认（✅）

| 物理键 | evdev | 触发事件名 | 备注 |
|---|---|---|---|
| U | 22 | KeyboardCraftspersonKey11 | 📌 奇匠面板 Key11 |
| Z | 44 | KeyboardCraftspersonKey12 | 📌 面板 |
| Y | 21 | KeyboardCraftspersonKey13 | 📌 面板 |
| G | 34 | KeyboardCraftspersonKey14 | 📌 面板 |
| H | 35 | KeyboardCraftspersonKey15 | 📌 面板 |
| O | 24 | KeyboardCraftspersonKey17 | 📌 面板 |
| P | 25 | KeyboardCraftspersonKey18 | 📌 面板 |
| L | 38 | KeyboardCraftspersonKey21 | 📌 面板 |
| V | 47 | KeyboardCraftspersonKey22 | 📌 面板 |
| ↑ | 103 | KeyboardCraftspersonKey36 | 📌 方向键 |
| ↓ | 108 | KeyboardCraftspersonKey37 | 📌 |
| ← | 105 | KeyboardCraftspersonKey38 | 📌 |
| W | 17 | KeyboardMoveForwardKey | 📌 移动键 |
| S | 31 | KeyboardMoveBackwardKey | 📌 |
| D | 32 | KeyboardMoveRightKey | 📌 |
| 2 | 3 | KeyboardCraftspersonKey2 | 📌 数字 |
| 6 | 7 | KeyboardCraftspersonKey6 | 📌 |
| 7 | 8 | KeyboardCraftspersonKey7 | 📌 |
| 8 | 9 | KeyboardCraftspersonKey8 | 📌 |
| 9 | 10 | KeyboardCraftspersonKey9 | 📌 |
| Space | 57 | KeyboardJumpKey | 📌 官方默认跳跃 |
| 左Ctrl | 29 | KeyboardSwitchToWalkOrRunKey | 📌 官方默认走/跑 |
| F | 33 | KeyboardInteractKey | 📌 官方默认交互 |
| Q | 16 | KeyboardCharacterSkill2Key | 📌 技能2 |
| T | 20 | KeyboardCharacterSkill4Key | 📌 技能4 |

### 待复验（⚠️ 陈旧帧）

| 物理键 | evdev | 本次读数（陈旧） | 期望值（模式推断） |
|---|---|---|---|
| I | 23 | Key15（=H） | Key16 |
| J | 36 | Key18（=P） | Key19 |
| K | 37 | Key18 | Key20 |
| A | 30 | MoveForward（=W） | MoveLeft |
| → | 106 | Key38（=←） | Key39 |
| 1 | 2 | Key38 | Key1 |
| 3 | 4 | Key2 | Key3 |
| 4 | 5 | Key2 | Key4 |
| 5 | 6 | Key2 | Key5 |
| E | 18 | InteractKey（=F） | CharacterSkill1Key |
| R | 19 | Skill2（=Q） | CharacterSkill3Key |
| X | 45 | Skill4（=T） | DropKey（官方默认 X=丢弃） |
| C | 46 | DropKey | ? |
| B | 48 | DropKey | ? |
| N | 49 | DropKey | ? |
| Tab | 15 | WalkOrRun（=Ctrl） | 快捷键轮盘? |

> 结论（现有证据）：**模拟器 browser-session.js 的映射方向与真机一致**——字母面板 Key11-22 = U Z Y G H I O P J K L V、WASD → KeyboardMove{Forward,Backward,Left,Right}Key、方向键 → Key36-39、数字 1-9 → Key1-9，另有 Space→Jump、Ctrl→WalkOrRun、F→Interact、E/Q/R/T→CharacterSkill1-4 与官方默认键位表吻合。

## 二、协议 A：拖拽阈值

### 已采集（用户真人操作）

| 实验 | CL n/max | BD n/min | 说明 |
|---|---|---|---|
| 自然混合（点击+小拖+大拖） | 51 / 213.4 | 16 / 3.1 | **区间交叠**：213px 位移判 Click、3.1px 判 BeginDrag |
| A 慢速 5cm | 5 / 57.5 | 5 / 3.1 | 慢速大位移仍可 Click |
| B 快速小蹭 | 19 / 9.5 | 7 / 3.1 | 同批 9.5px=Click、3.1px=BeginDrag |
| C 静止长按 | 5 / 0 | 0 / — | 基线 |
| D 快速甩（屏宽 1/8） | 6 / 116.3 | 6 / 3.1 | 快速甩必触发 BD |

**SEQ 铁证**：`dg(48.3) up(51.5) ci(51.5) ed(51.5)` → 拖拽序列后 Up 仍发 Click（Up→Click→EndDrag 三连）。

### 结论

1. **BeginDrag 判定 = 单次移动的瞬时步长超阈**（≈2-3px 量级），不是按下以来的累计位移；慢速移动每步 1-2px 时累计 213px 也不触发。
2. **Click 与 BeginDrag 非互斥**：真机 Up 时无条件发 Click（模拟器 drag 后不发 → diverge）。
3. 模拟器 PR #11 的 `Math.hypot(...) > 5`（累计位移）模型在两处偏离真机。

### 待做（自动化精确扫描）

- 单步位移扫描（ydotool 精确步长 × 多次重复 → 单步 px ↔ Click/BeginDrag 判定边界）
- 多步慢拖对照（验证"每步低于阈值则永不 BeginDrag"）

## 三、API 观察（真机 vs 模拟器）

| 项 | 真机 | 模拟器 |
|---|---|---|
| `game.GetDevice()` | **nil**（GetDevice() 返回空/失败） | 返回带 Name 的对象（如 KeyboardAndMouse） |
| `CursorEventData` 坐标 | 字段 d.x=nil；`d:GetUIPos()`/`GetPressUIPos()` 有效 | 同（方法有效） |
| `CursorMove` 枚举 | 不存在（CM=NO） | 不存在 |
| `SetAnchorMin/Max` | 可用（官方 API 文档 4900-4947 行） | — |
| textbox 显示 | **按盒高裁剪**：盒高/字高 <1.3 整行不可见；≥1.54 可见（修复=盒高≥字高×1.8） | 无此问题 |
| `PrintClientUITree` | `[UITree] Roots: 0`（与可见性无关） | — |
| Lua print 落地 | Debug_Log 记录 field 23（内嵌 f2{LEN utf8}） | — |
