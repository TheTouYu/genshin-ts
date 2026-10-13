# input-probe 真机测量记录（模板）

> 测量人：________　日期：________
> 设备型号：________（手机/PC/掌机）
> 输入方式：☐手指 ☐鼠标 ☐触控笔　画布档位：title 行 `CANVAS ____x____`
> 导入方式：☐整合包单文件 ☐三件分导

## 0. 启动自检（进入地图即抄）

| 项 | 屏上值 |
| --- | --- |
| CANVAS | |
| DEV= | |
| KEYS ok/total | /（模拟器 164/164） |
| CM= | （模拟器 NO） |
| d.x= | （模拟器 nil） |
| CUR（无操作时） | |

## 1. 协议 A：拖拽阈值

### 1.1 纯点击 ×20

| 轮 | CL n | max（clickMaxD 终值） |
| --- | --- | --- |
| 1 | | |
| 2 | | |

### 1.2 逐档缓移（每档看 line1 DISP 与 line2 SEQ 判 Cl/Bd）

| 目标位移 | 次1 DISP→事件 | 次2 | 次3 | 备注 |
| --- | --- | --- | --- | --- |
| ~1px | | | | |
| ~2px | | | | |
| ~3px | | | | |
| ~5px | | | | |
| ~8px | | | | |
| ~12px | | | | |
| ~15px | | | | |

### 1.3 快速短拖 ×5（对照）

| 次 | DISP | 事件（Cl/Bd） |
| --- | --- | --- |
| 1 | | |
| … | | |

### 1.4 结论

- `T [clickMaxD, dragMinD]` = **[ ____ , ____ ]**
- 真机阈值判读：Click 恒出现于 DISP≤____；BeginDrag 恒出现于 DISP≥____
- 模拟器 5px 常数裁决：☐ 保留 5 ☐ 改为 ____（理由：________）

## 2. 协议 B：键盘映射（物理键 → KeyEventType 事件名）

| 物理键 | Down 事件名 | Up 事件名 | 备注 |
| --- | --- | --- | --- |
| U | | | 预期 Key11 |
| Z | | | 预期 Key12 |
| Y | | | 预期 Key13 |
| G | | | 预期 Key14 |
| H | | | 预期 Key15 |
| I | | | 预期 Key16 |
| O | | | 预期 Key17 |
| P | | | 预期 Key18 |
| J | | | 预期 Key19 |
| K | | | 预期 Key20 |
| L | | | 预期 Key21 |
| V | | | 预期 Key22 |
| W | | | 预期 KeyboardMoveForwardKey |
| A | | | 预期 KeyboardMoveLeftKey |
| S | | | 预期 KeyboardMoveBackwardKey |
| D | | | 预期 KeyboardMoveRightKey |
| ↑ | | | 预期 Key36 |
| ↓ | | | 预期 Key37 |
| ← | | | 预期 Key38 |
| → | | | 预期 Key39 |
| 1-9 | | | 预期 Key1-9（合并记录） |
| （其他） | | | |

## 3. 顺带观察

| 项 | 结果 |
| --- | --- |
| SIM 按下后 SEQ | （模拟器：SIM + Dn/Up/Cl@(0,0)） |
| CursorEnter/Exit 是否出现在 SEQ | |
| 快速连点是否丢事件 | |
| 真机 Click 事件坐标 vs line1 坐标一致性 | |

## 4. 回传清单

- [ ] 本表填毕 → `records/measurement.md`
- [ ] 结论同步 `/home/h/miliastra-beyond-simulator/probes/`（含 T 区间、键盘映射差异、d.x/CM 探测值）
- [ ] 模拟器 `studio/play/session.js` 常数更新（若裁决≠5）
- [ ] 回复 PR #11 上游作者
