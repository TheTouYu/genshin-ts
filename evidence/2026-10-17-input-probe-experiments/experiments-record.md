# 真机输入实验完整记录（2026-10-17 会话 3291/3292）

> 证据层级：**行为层铁证**（探针 Lua `print` → Debug_Log f23 → 离线解析，无 OCR/无渲染延迟）。
> 通道：ydotool 注入（键盘/鼠标）+ 探针全屏光标区监听；退出试玩后日志落盘再解析。
> 会话 3291（13964B，纯键盘爆发）｜会话 3292（57124B，键盘全键面 + 鼠标 + 拖拽扫描）。

## 一、键盘全键面映射（43 槽 + 具名键，全部实测）

| 槽位 | 物理键 | evdev | 备注 |
|---|---|---|---|
| Key1–Key9 | 数字 1–9 | 2–10 | |
| Key10 | 数字 0 | 11 | |
| Key11–Key22 | U Z Y G H I O P J K L V | 22,44,21,34,35,23,24,25,36,37,38,47 | |
| Key23–Key28 | F5 F6 F7 F8 F9 F10 | 63–68 | |
| Key29–Key35 | `` ` `` `-` `=` `[` `]` `\` `,` | 41,12,13,26,27,43,51 | |
| Key36–Key39 | ↑ ↓ ← → | 103,108,105,106 | |
| Key40–Key43 | 右Ctrl 右Shift Backspace CapsLock | 97,54,14,58 | |

**具名键**：W→`MoveForwardKey`、A→`MoveLeftKey`、S→`MoveBackwardKey`、D→`MoveRightKey`、Space→`JumpKey`、
左Ctrl→`SwitchToWalkOrRunKey`、F→`InteractKey`、E/Q/R/T→`CharacterSkill1/2/3/4Key`、X→`DropKey`、
Tab→`OpenShortcutWheelKey`、**鼠标左键→`NormalAttackKey`**、**鼠标右键→`SprintKey`**。

**无事件（未映射）**：字母 C(46) B(48) N(49)、句点 .(52)、斜杠 /(53)、**鼠标滚轮上下**。

> 与官方键位表（D139 记录）逐条一致；本体是模拟器 PR#12 映射的真机实证。

## 二、鼠标拖拽判定（42 手势，会话 3292）

### 结论（三条）

1. **每次 Up 都发 Click**——42 次按下（Dn）↔ 42 次 Cl，一一对应，**拖拽后同样发 Click**。
2. **BeginDrag 判据 = 按下点起的累计位移超阈**：纯 Click 手势最大位移 **2.5 游戏px**；含 Bd 手势最小位移 **3.8 游戏px**。
   → **阈值 ∈ (2.5, 3.8] 游戏像素 ≈ 3 px = 4.8 屏幕像素**（窗口／画布比例 1.6）。
3. **与速度无关**：单步大位移（8~40 单位）与多步慢拖（10 步 × 1 单位，60ms 间隔）触发阈值一致；用户真人「最慢速度拖 5cm」的 5 次手势也全部触发 BeginDrag（BD n=5）。

### 事件序列模式（实测统计）

| 序列 | 次数 | 含义 |
|---|---|---|
| `Dn → Up → Cl` | 18 | 纯点击 |
| `Dn → Bd → Dg → Up → Cl → Ed` | 15 | 拖拽（单次移动） |
| `Dn → Bd → Dg×n → Up → Cl → Ed` | 9 | 拖拽（多次移动，n=2~4） |

**关键次序：`Up → Cl → Ed`**——抬起后先发 Click 再结束拖拽；`Bd` 在首次超阈的移动时发出，其后每次位移变化发 `Dg`。

### 事件数据样例（原样）

```
Dn x=1132.5 y=433.7 pr=1132.5,433.7 d=0.0
Up x=1133.1 y=433.7 pr=1132.5,433.7 d=0.6      ← 纯点击（0.6px）
Cl x=1133.1 y=433.7 pr=1132.5,433.7 d=0.6

Dn x=…  Bd x=…  d=3.8                           ← 拖拽（累计 3.8px 超阈）
Dg x=…  d=3.8
Up x=…  d=3.8
Cl x=…  d=3.8                                   ← 拖拽后仍发 Click
Ed x=…  d=3.8
```

## 三、对模拟器（miliastra-beyond-simulator）的意义

| 项 | 真机（本记录） | 模拟器现状 | 结论 |
|---|---|---|---|
| BeginDrag 判据 | 累计位移 > ~3 游戏px（≈4.8 屏幕px） | `Math.hypot(...) > 5`（累计，屏幕px） | **基本一致**（阈值在测量误差内），模型正确 |
| 拖拽后是否发 Click | **发**（Up→Cl→Ed） | 不发（互斥） | **需对齐**（真实差异） |
| 事件次序 | Dn→[Bd→Dg×n]→Up→Cl→[Ed] | Dn→[Bd→Dg×n]→Up→Ed | 需在 Up 后补 Click |

## 四、复现命令

```bash
tools/ys-editor/ys-playtest-start                                  # 开始试玩（轮询式，含弹窗处理）
tools/ys-editor/ys-gui-slot 0x01400001 150 bash -c \
  '/tmp/ys-exp-keys.sh; sleep 1; /tmp/ys-exp-drag.sh'              # 一次拿焦点跑完整实验批次
tools/ys-editor/ys-playtest-stop                                   # 退出（日志落盘）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <最新会话>.gia records \
  | grep -oP "'lua': '\K\[(key|cur)\][^']*"
```
