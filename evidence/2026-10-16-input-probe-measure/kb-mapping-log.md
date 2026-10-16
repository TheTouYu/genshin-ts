# 真机键盘映射表（日志实证，2026-10-17 00:06 会话 3291）

> **证据层级：行为层铁证**——探针 Lua `print('[key] ' .. name)` 写入 Debug_Log，一次爆发注入 40 键后离线解析，
> 74 条 key 事件精确对齐 37 个物理键（无 OCR、无渲染延迟、无脑补）。
> 注入通道：`ydotool key <evdev>:1 <evdev>:0`；设备：Linux + Wine，游戏窗 2560×1440，画布 1600×900。

## 映射表（全部实测确认）

| 物理键 | evdev | KeyEventType 事件名 | 与官方默认表 |
|---|---|---|---|
| U | 22 | `KeyboardCraftspersonKey11` | ✅ 一致 |
| Z | 44 | `KeyboardCraftspersonKey12` | ✅ |
| Y | 21 | `KeyboardCraftspersonKey13` | ✅ |
| G | 34 | `KeyboardCraftspersonKey14` | ✅ |
| H | 35 | `KeyboardCraftspersonKey15` | ✅ |
| I | 23 | `KeyboardCraftspersonKey16` | ✅ |
| O | 24 | `KeyboardCraftspersonKey17` | ✅ |
| P | 25 | `KeyboardCraftspersonKey18` | ✅ |
| J | 36 | `KeyboardCraftspersonKey19` | ✅ |
| K | 37 | `KeyboardCraftspersonKey20` | ✅ |
| L | 38 | `KeyboardCraftspersonKey21` | ✅ |
| V | 47 | `KeyboardCraftspersonKey22` | ✅ |
| W | 17 | `KeyboardMoveForwardKey` | ✅ |
| A | 30 | `KeyboardMoveLeftKey` | ✅ |
| S | 31 | `KeyboardMoveBackwardKey` | ✅ |
| D | 32 | `KeyboardMoveRightKey` | ✅ |
| ↑ | 103 | `KeyboardCraftspersonKey36` | ✅ |
| ↓ | 108 | `KeyboardCraftspersonKey37` | ✅ |
| ← | 105 | `KeyboardCraftspersonKey38` | ✅ |
| → | 106 | `KeyboardCraftspersonKey39` | ✅ |
| 1–9 | 2–10 | `KeyboardCraftspersonKey1`…`Key9` | ✅ |
| Space | 57 | `KeyboardJumpKey` | ✅ |
| 左Ctrl | 29 | `KeyboardSwitchToWalkOrRunKey` | ✅ |
| F | 33 | `KeyboardInteractKey` | ✅ |
| E | 18 | `KeyboardCharacterSkill1Key` | ✅ |
| Q | 16 | `KeyboardCharacterSkill2Key` | ✅ |
| R | 19 | `KeyboardCharacterSkill3Key` | ✅ |
| T | 20 | `KeyboardCharacterSkill4Key` | ✅ |
| X | 45 | `KeyboardDropKey` | ✅ |

## 无事件（未映射）

| 物理键 | evdev | 观测 |
|---|---|---|
| C | 46 | 注入后日志**零事件**（同一爆发内，前后键 X/N 均有事件） |
| B | 48 | 同上 |
| N | 49 | 同上 |

→ 与官方键位表吻合：奇匠槽 Key23-43 = F5-F10 / `` ` `` `-` `=` `[` `]` `\` `,` `.` `/` / 右Ctrl / 右Shift / Backspace / CapsLock，
**字母 C/B/N 不在 43 键面板内**，故按下不产生 `KeyEventType`。

## 对模拟器 PR #12 的意义

模拟器 `studio/play/browser-session.js` 的映射（Key11-22 = U Z Y G H I O P J K L V、WASD→Move四键、方向键→Key36-39、数字→Key1-9）
**与真机逐条一致**——这份日志是该映射的**真机实证**（此前只有代码注释自证）。

## 复现方法

```bash
# 1) 开始试玩（工具化）：tools/ys-editor/ys-playtest-start
# 2) 爆发注入（一次 8 秒，40 键）：
tools/ys-editor/ys-gui-slot 0x01400001 25 bash -c \
  'for c in 22 44 21 34 35 23 24 25 36 37 38 47 17 30 31 32 103 108 105 106 \
          2 3 4 5 6 7 8 9 10 57 29 33 18 16 19 20 45 46 48 49; do ydotool key $c:1 $c:0; sleep 0.12; done'
# 3) 退出试玩（工具化）：tools/ys-editor/ys-playtest-stop  ← 会话结束时 Debug_Log 落盘
# 4) 离线解析：
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py \
  <Beyond_Debug_Log>/<最新会话>.gia records | grep -oP "'lua': '\\K\\[key\\][^']*"
```
