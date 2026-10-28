# 输入层（键位/DAS/鼠标三态/事件路由）

> 出处：复盘表 B1–B5。

## 1. 键位必须先实证（B3/B5）
- 模拟器键池：`studio/play/key-bindings.js` 的 craftCodes（1-based 数组）+ 14 个具名键（WASD/Space/X/F/E Q R T/双 Ctrl）。
- 实测事实：**字母 C 不在任何键池**（Hold 用 G=Key14）；方向键=CraftspersonKey36-39；`Space`=JumpKey、`X`=DropKey。
- 枚举名**逐字完整**：`KeyboardCraftspersonKey38Down`（拼成 `KeyboardJumpDown` 静默吞键，探针全静默却看似成功——判定法=日志查 `guide stage=1`）。

## 2. DAS（B1/B2）
- **语义**：单击=一格；按住 0.25s 后每 0.05s 连移。
- **三条防御**（缺一就会「按一下一直走」）：
  1. Up 回调**无条件清 dir**（且按玩家路由 `g=G[player]`，防双屏清错实例）；
  2. **时间上限**：ARR 连移累计 0.35s（≈全盘 4 格）强制停，`das stop reason=timeout`——不依赖平台 Up；
  3. AI/镜像盘**不走 DAS**（aiDrop 直锁），只玩家输入路径。
- 判据：runner 用例「Down 无 Up → 0.35s 后零 move」+ 真机日志 `move` 序列逐条核对。

## 3. 鼠标三态（B3/B4）
- 热区=cursor 模板实例 + `AddCursorEventListener`（只有 cursor/button 类有事件，image/textbox 静默失效→降级键盘）。
- **cursor 实例无 imageColor 字段**（实测 `cannot set imageColor, no such field`）→ 三态反馈转为**文案色/字号/贴片**：hover 提亮+放大一档（84ms 短音防连扫噪）、press 下沉+加深（151ms）、**Exit 静音**（防来回扫双倍噪声）。
- 所有「看起来像按钮」的文字都应是真热区：标题四模式/结算三键/帮助 H。

## 4. 事件路由（双屏）
- 事件回调先 `g = G[player]` 再执行动作（T0 铁律）。
- 跨实例交互（垃圾行）入口 save→切目标→操作→restore。
- 键盘监听按玩家键组分派（P1 任意键/P2 P2 键组；coop 同判不按模式二次过滤——27 用例抓过「coop 的 P2 键全算 p1ready」）。

## 5. 试玩页按键五重门（模拟器网页）
`keydown` 绑 canvas 非 document → 首个 view 快照已应用（u 门）→ epoch 未变（任何 device/view 切换 h++ 使排队键 no-op）→ 非合成键/非表单内 → 在 R1 映射表内。**headless 实验必须先满足才判转发链**，否则就是 artifact。
