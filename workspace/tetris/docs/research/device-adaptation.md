# 设备适配研究：移动端 / 手柄 / 多分辨率（v4.0，2026-10-29）

> 状态：当前实现（代码已落地并在模拟器验证；真机差异项见 §5）
> 读者：改 UI 布局、加控件、加输入方式的人。**改之前先看 §2 的四条规则**（每条都能被巡检脚本判死）。
> 出处：官方 UI 教程正文 `docs/ui-tutorial/official-ui-tutorial.md:2960-3110`（多设备适配/界面死区/字号）
> 与 `:3698-3720`（课程讲义：界面控件——手柄适配引导，含四设备能力对照表）；模拟器运行时源码
> `/home/h/miliastra-beyond-simulator/client/lua-runtime/src/{runtime,enums,scene}.js`。

## 1. 官方口径（Lua 侧能用到的部分）

| 主题 | 官方原文要点 | 我们怎么落 |
| --- | --- | --- |
| 设备 | 编辑器顶部栏可切 **PC端 / 移动端 / 主机端 / 移动端手柄**，控件的**位置、大小、锚点按设备分别设置** | Lua 侧用 `game.GetDevice()` 分类：`KeyboardAndMouse / Mobile / Controller / MobileController`（`enums.js:15`）。我们没有编辑器那四套布局数据，**等价做法 = 全部由 `GetUICanvasSize()` 现算** |
| 锚点 | 分辨率变化时控件按锚点继承相对位置；扩展类型有「拉伸锚点」「跟随固有控件」 | **v6.27 起分层用**：① **全屏层**（整屏底色 wash）走**拉伸锚点** `anchorMin(-0.01,-0.01)+anchorMax(1.01,1.01)+sizeDelta(0,0)`（`widgets.fill`，与画布尺寸无关）；② 布局坐标仍从 W/H 现算（等价"九宫格锚点"的算法版）；③ 背景构图按 design-board cover（§3.1） |
| 界面死区 | **移动端界面最小，要以移动端 16:9 为基准**，保证可点控件落在红框区内 | 五张画布全部跑同一套布局公式；按钮簇贴屏幕下角、`MARGIN=16`，在任何比例下都留在可视区 |
| 字号 | 大标题 36-32 / 小标题·按钮 24 / 正文 20 / 辅助 18 / 最小 16；框高必须 ≥ `fontSize×1.45+4` 否则整行静默不画 | 移动端按钮文字 24、说明键 22；帮助页 fit 缩放后仍 ≥16（见 §3.3） |
| 手柄 | **焦点导航 + 快捷键**；触屏=可直接点任意控件、无悬停、无快捷键；手柄指针模式可用但不推荐 | 局内走"按键映射 + 左摇杆"；菜单走**焦点导航**（`SetControllerFocus` + 高亮 + `MenuConfirmKey` 确认），与官方交互模型一致 |
| 手柄按键 | 编辑器里「按键映射-手柄」决定映射；Lua 拿不到映射表 | 我们的对策见 §4：**先登记 24 条 Controller 事件做探针**（日志 `pad ev <name>`），真机按一遍就能读出实际键名，再改 `NUM.PAD.KEYS` 换绑（表驱动，不改逻辑） |

## 2. 我们定的四条规则（可被 `qxqy/audit-controls.mjs` 判死）

1. **控件坐标一律从画布现算**：写死数字（如 `x=±410`）在 1280 上正确、在 1560 上就离屏幕边 350px——v4.0 之前的移动按钮正是这样"看起来有、实际够不到"。
2. **可点控件必须登记**：`UI4.regAdd(名字, 控件, w, h)`，建屏时 `UI4.dump(<屏名>)` 打印画布坐标；巡检脚本按这份清单逐个点，**点完必须出现该控件自己的日志锚**（不是"有任意新日志"——自演的 `fall y=` 会造成假绿）。
3. **移动端每一屏都要有"回去"的入口**：帮助页有 `合上手册` 胶囊（`tap help close`）、引导浮层有 `知道了` + 全屏点任意处关闭、结算页三个选项都能点。
4. **静默吞点击算 bug**：移动端点多人模式必须给出引导浮层（`pad note open`），不能 `return` 了事。

## 3. 关键实现（`lua/main.lua` 的 `UI4` 段 + `lua/tetris/config.lua` 的数据表）

### 3.1 背景满幅（两层：wash 拉伸锚点 + 构图 cover）

**v6.27 重写（用户「pc 3440×1440 / 手机 2400×1080 背景两侧有缝隙」的最终解）**

- **① wash（整屏底色）= 拉伸锚点**：`SetAnchorMin(-0.01,-0.01)` + `SetAnchorMax(1.01,1.01)` + `SetSizeDelta(0,0)`
  + `SetAnchoredPosition(0,0)`（`widgets.fill`）。语义 `width=(aMax-aMin)*parent+sizeDelta` ⇒ **与 `GetUICanvasSize()` 无关**。
  旧写法 `SetSizeDelta(W+20,H+20)` 把尺寸写死在我们猜的画布上（真机 3440×1440 屏幕报 canvas **2030×900**，
  宽被单独截短 192px/侧），猜的数一旦不等于父容器就露缝。宿主不认锚点时回落像素尺寸并打 `wash=px`（不静默）。
- **② 构图（`cfg.MODE_BG`）= design-board cover**：`bs=max(W/1280,H/720)`，图元 x/y/w/h 全乘 bs。
  数据不变量由框架 **`view_node.lintCover`** 看住：图元并集 ⊇ 设计板 [-640,640]×[-360,360]
  ⇒ 可证任意画布 cover 后四边 0 缺口（证明见 `frameworks/qxqy-ui/README.md` §5.5）。
- **③ 判据分层（旧的错）**：旧版把 wash 也计入"四边 0 缺口"的外缘 ⇒ wash 恒盖满 ⇒ **判据恒真（假绿）**，
  "构图没画到边"永远测不出来。现在 wash 只报 `wash=stretch|px|none`，缺口判据**只看构图**，
  headless 侧 `tests-lua/bg_cover_test.lua` 用 stub 宿主断言「wash 在 + 构图空 ⇒ 必须 GAP」。

**历史（v5.0 的 cover 实现与旧判据，保留供对照）**

- 病根：`MODE_BG` 构图按 **1280×720 设计板**摆位（母题在 x≈±500~±600），换 1560×720 / 2100×900 画布后两侧只剩整屏底色 ⇒ 用户看到的"手机两边背景缺失"。
- 修法：`bs = max(W/1280, H/720)`（CSS `background-size: cover` 同义），每个图元的 `x/y/w/h` 全乘 `bs`，16:9 时 `bs=1` 构图不变，更宽的画布放大后溢出裁掉。
- 判据：构图外缘（含旋转外接圆）必须覆盖画布边沿的 **92%**；日志 `bg cover ok bs=…` 或 `bg cover GAP …`。实测：1560×720 → `bs=1.22`；1280×960 → `bs=1.33`；1600×900/1280×720 → `bs=1.00`。

### 3.2 移动端操作控件（客户端实例三件套）

- 用户口径（2026-10-29 原话）：「左边移动+旋转方向，右边锁定+缓慢下落+暂存」⇒ **左簇 ◀ ▶ + 旋转，右簇 锁定 + 缓降 + 暂存**，另加右上角 **说明**（移动端没有 H 键，帮助页必须能自己开/自己关）。
- 为什么用实例而不是服务端 textbox：旧实现 6 个服务端 textbox 当按钮底 + cursor 热区，① 坐标写死 ② 真机上服务端控件名一变整排消失（v2.7 已踩过）。实例层在真机已验证可见（标题卡/结算页都是实例）。
- 一个按钮 = 底图(`cell` 模板) + 文字(`text` 模板) + 热区(`cursor` 模板)；三态 = 底图色（常态 `btnBg` / 悬停 `card` / 按下 `gold`）+ 按下下沉 3px。
- 连发：`HOLD_DELAY=0.26s` 后每 `HOLD_RATE=0.075s` 一次，松开/移出即停（触屏版 DAS，日志 `phone rep start/done`）。
- 动作派发**复用键盘同一条链**（`act(key, fn)` + `doPlay`）⇒ "帮助页开着先关页""入场态按键既开局也执行动作""MODE_OVER 冻结输入""接管中按键交还"这些语义自动一致。

### 3.3 帮助页 fit 缩放（巡检抓出来的真 bug）

- 旧实现 `s = W/1600` 只按宽度缩放 ⇒ 21:9 画布上 1548×848 的设计板被放大 1.31 倍 = 2032×1113，**比画布高 213px**，页脚与右上角「合上手册」整个掉到屏幕外。
- 修法：`s = min(W/1600, H/900)`（fit）。判据：`help.close` 在五张画布上都能被点到（巡检 69 控件 0 死）。

### 3.4 移动端「双人玩法请回 PC」浮层

- 触发：移动端点第 2/3/4 张模式卡（旧实现静默 `return`）。浮层 = 全屏暗底 + 卡片 + 标题/三行正文 + 「知道了」+ 全屏 block 热区（点任意处也关）。
- 文案在 `NUM.PAD_NOTE`（原神风；候选 5 版见 `docs/copy-v4.md` §4）。
- 层序：**创建顺序 = 绘制顺序**（运行时实例"后建在上"）；`SetAsFirstSibling` 在模拟器不分层，在真机 Unity 语义里反而=沉底 ⇒ 一律不用它"置顶"。

### 3.5 手柄

- 键映射表 `NUM.PAD.KEYS`（动作 → 候选 Controller 事件名）：`left/right/rot/soft/hard/hold/help/ok`。
- **探针**：启动时登记 24 条 `Controller*KeyDown`（14 个 Craftsperson + 10 个具名），每条都打 `pad ev <name>`；映射命中的再打 `act=<动作>` 并派发。
- 左摇杆：`GetControllerLeftStickAxis()` 每帧读，死区 0.55，左右移动带连发（0.30s 后 0.10s/次），向下=缓降。日志 `pad stick x=… y=… dir=…` / `pad stick down y=…`。
- 菜单焦点导航：标题屏 `SetControllerFocus(MS.zones[i])` + `MS.hoverCard(i)` 高亮，确认键 = `menuSelectMode(i)`；日志 `pad focus i=` / `pad confirm i=`。
- ⚠ 真机键名以 `pad ev` 实测为准（我们无法从 Lua 侧读编辑器的「按键映射-手柄」）。

## 4. 验证

| 层 | 命令 | 读数 |
| --- | --- | --- |
| 结构层 | `lua5.3 -e 'assert(loadfile("lua/main.lua"))'` + `node qxqy/build.mjs` | 语法门 + 存档内嵌 Lua 重建 |
| 行为层（用例） | `node qxqy/runner.mjs` | **51/51 PASS**（含 08 移动端 6 键、44 长按连发、45 移动端帮助闭环、46 引导浮层、47 宽画布背景满幅、48 手柄键与焦点、49 帮助关闭胶囊） |
| **全控件巡检** | `node qxqy/audit-controls.mjs` | **69 个控件 / 0 死**（5 张画布 × menu/play/help/settle/note 五屏） |
| 出图 | `node /tmp/shotdev.mjs mobile-19.5-9 wide` | `docs/v4-phone-wide.png` / `v4-phone-tab.png`（背景满幅 + 按钮簇贴角） |

## 5. 真机未验证（每条都给了判定方法）

| 项 | 判定方法 |
| --- | --- |
| 手柄实际键名与 `NUM.PAD.KEYS` 是否一致 | 真机按一遍手柄，日志读 `pad ev ControllerXxxKeyDown`；不一致就改表 |
| `GetControllerLeftStickAxis` 的 y 轴正负 | 日志 `pad stick down y=` 是否在你向下推时出现；不出现就翻 `DEADZONE` 判据的符号 |
| `SetControllerFocus` 在真机的焦点高亮 | 目视（标题屏推摇杆，卡片是否高亮）+ 日志 `pad focus i=` |
| cursor 实例在真机上的三态事件 | 手指按住按钮，日志 `phone tap <id>` 与 `phone rep start <id>` 是否出现 |
| 移动端安全区（刘海/圆角） | 按钮簇 `MARGIN=16` 是否被遮挡；必要时按设备分层加 margin |
