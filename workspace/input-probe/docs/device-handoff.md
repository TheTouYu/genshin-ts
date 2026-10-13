# input-probe 真机交付手册

> 探针已模拟器全绿（KEYS 164/164 挂载、DISP 精确、事件序列完整）。本手册 = 真机导入 + 测量操作协议 + 记录方式。
> 产出目标：①真机 CursorClick→CursorBeginDrag 临界位移（校准模拟器 PR #11 `session.js` 的 `> 5` 常数）②物理键→KeyEventType 映射（校准 PR #12）。

## 一、导入（推荐整合包单文件）

1. 千星编辑器 → 资产导入入口，导入 `device-package/input-probe · 整合包.gia`（保留模板边界、脚本映射与控件挂载关系）。
2. 放进 UI 空间 → 试玩。屏幕上半=读出行，下半=拖拽测试区，左下角 SIM/RST 按钮。
3. 若整合包导入异常，退路：分别导入「服务器控件模板.gia」「客户端控件模板.gia」「脚本.gia」，导入后**手工把脚本挂到服务端控件「探针层」(n1)**（脚本挂载关系不进分件 GIA，见导出 warning）。

## 二、屏幕读出行说明（全部 ASCII）

| 行 | 内容 | 说明 |
| --- | --- | --- |
| title | `INPUT-PROBE v1  CANVAS WxH DEV=...` | 画布尺寸 + game.GetDevice() |
| line1 | `PRESS(x,y) UP(x,y) DISP=d` | 按下点 / 抬起点坐标 / 抬起位移（1 位小数） |
| line2 | `SEQ ...` | 最近 10 条事件序列：Dn=Down Up=Up Cl=Click Bd=BeginDrag Ed=EndDrag Dg=Drag(连续折叠) En/Ex=Enter/Exit Mv=Move |
| line3 | `CL n=.. max=.. \| BD n=.. min=.. \| T [a,b]` | **核心**：Click 最大抬距 / BeginDrag 最小触距 / 阈值区间（T 满足 max≤T≤min） |
| line4 | `KEYS ok/total \| 最近键名` | 键监听挂载健康度 + 最近 2 个触发事件名 |
| line5 | `CUR x,y \| CM=.. \| d.x=..` | GetCursorUIPos 10Hz / CursorMove 枚举探测（NO=枚举不存在，YES=有=模拟器缺口）/ d.x 字段探测（nil=无字段，num=有=模拟器缺口） |
| hint | 操作提示 | |

按钮：`SIM`=调 `area:SimulateCursorClick()`（看真机是否发 Click、坐标是多少）；`RST`=清零统计。

## 三、测量协议 A：拖拽阈值（主目标）

自动统计已吸收操作误差，人工只需制造「大、小、临界」三类样本。

1. **纯点击 20 次**：下半屏快速点按。每项记录 line3 的 `CL n` 与 `max=`（clickMaxD 会自动爬升，取最终值）。
2. **逐档缓移**：按住后缓慢移动，从「几乎不动」到 15px，每档（约 1、2、3、5、8、12、15px，看 line1 的 DISP）停留后抬起，重复 3 次。关注每档触发的是 `Cl` 还是 `Bd`（看 line2 SEQ）。
   - 临界带判定：`max(clickMaxD)` 与 `min(dragMinD)` 之间就是真机阈值区间。
3. **快速短拖 5 次**：快速拖 3-8px 松手，作对照（真人手抖场景=PR #11 的动机）。
4. 全程记录 line1/line2/line3 的关键值（拍照或抄录），附 `T [a,b]` 最终区间。

**每轮换输入方式重复**：手指 / 鼠标（若有）；记录设备型号、画布档位（title 行 CANVAS）。

## 四、测量协议 B：键盘映射（顺带）

真机依次按以下键，每按一个看 line4 最近键名并记录（Down/Up 都记）：

- 字母面板：U Z Y G H I O P J K L V（预期=Key11-22 Down/Up，即 PR #12 的 CRAFT_LETTER_CODES）
- 移动：W A S D（预期=KeyboardMove*KeyDown/Up）
- 方向键 ↑↓←→（预期=Key36-39）
- 数字 1-9（预期=Key1-9）
- 其余随意：Shift（切换步行）、空格（跳）、F（交互）、E（普攻？）等——记录实际事件名
- 有手柄则试手柄键（预期=ControllerCraftspersonKey1-14 / Controller 具名）

## 五、记录与回传

- 原始记录写 `records/measurement.md`（模板见 `records/measurement-template.md`）。
- 结论同步：`/home/h/miliastra-beyond-simulator/probes/`（该仓库惯例：真机证据调查放根 probes/，需新建目录）。
- 数字去向：模拟器 `studio/play/session.js` 拖拽判定 `Math.hypot(...) > 5` 的 5 → 改为真机测得阈值；回复 PR #11 上游作者。

## 六、风险与注意

- 坐标系：千星 Y 向上（原点左下）。DISP 是距离，不受坐标轴方向影响。
- textbox 若文本被裁剪（模拟器 D226 有先例），看 title 行 CANVAS 值换画布档再测一轮。
- 真机若无 CursorEnter/Exit 触发，SEQ 里就没有 En/Ex——本身就是数据点。
- 真机 d.x 与 CM 的探测结果直接决定模拟器是否需要补 Lua 桥字段/CursorMove 枚举——记录这两个值。
