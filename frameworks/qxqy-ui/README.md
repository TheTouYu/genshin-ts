# qxqy-ui —— 千星沙箱 2D 界面游戏的声明式 UI 框架

一套「**纯逻辑 / 平台适配 / 声明式视图 / 场景栈**」四层分离的最小框架，产自俄罗斯方块（`workspace/tetris`）的 v6 重构。
目标不是"好看"，而是：**任何 bug 能在 lua5.3 上秒级复现，且层序/对比度/文字放不下这类"只能靠人眼"的缺陷变成可断言的静态检查。**

来源工程为参考实现（`workspace/tetris`），本目录是可独立复制、独立自测的框架本体。

## 1. 为什么需要它（真实代价）

| 没有框架时 | 有框架时 |
|---|---|
| 复现一个 UI bug = 开模拟器跑一遍（本项目实测 **387s/轮**） | 纯逻辑单测 **0.01s**，用例重放 **7.8s** |
| "字被裁 / 按钮被盖 / 隐形"只能靠人眼看截图 | `view_node.lint()` 静态报 L1–L6 |
| 层序靠"创建顺序"这种隐式约定 | 语义层号 `wash < bg < plate < board < frame < hud < panel < card < touch < modal` |
| 每个屏手写几百行创建代码 | 一份 node 数组 + `render.apply()` |
| 切屏后旧控件残留 | `render` 的"不在列表即销毁" |

## 2. 四层与依赖方向（严格单向）

```
  业务状态（纯 Lua 表）
        │  只有数据，没有控件
        ▼
  view_*   纯描述：state → node 数组      ← 可 headless 断言
        │
        ▼
  render   按语义层号创建 + 增量更新 + 销毁  ← 唯一把 node 变成控件的地方
        │
        ▼
  platform 唯一碰 game.*/ctl.*/Enum 的地方（real + mock 双后端）
```
`scenes`（场景栈）与 `app`（连接层）横跨这四层，只做编排。

**规则：除 `platform` 外任何模块都不许出现 `game.` / `Enum.` / `ctl:`。**

## 3. 七个模块

| 模块 | 职责 | 关键契约 |
|---|---|---|
| `platform` | 引擎访问唯一通道；`mock=true` 时用假控件 | `P.inst/set/call/onCursor/destroy/find/bindKey/setImage/setRotation` |
| `view_layers` | 语义层号 | `L.order('card')`；未知层名**抛错**（防拼错） |
| `view_node` | 节点 schema 校验 + 静态检查 | `V.lint(list)` → `L1..L6`；`V.lintPlan(plan)` → `P1..P5`；`V.lintCover(items)` → `C1..C3`；`V.rectAABB(x,y,w,h,rot)`；`V.textNeed(text,font,w)` |
| `render` | 描述→控件：按层号创建、值变才写、不在列表即销毁 | `R.apply(list)` / `R.write(k,f,v)` / `R.writePos(k,x,y)` / `R.clear()` / `R.live()` |
| `scenes` | 场景栈：push/pop/replace、opaque 截断、输入按栈分发 | `S.push(name)` / `S.view()` / `S.onAction(action)` |
| `app` | 连接层：tick=update+view+apply；覆盖屏 | `A.start/tick/render/dispatch/openOverlay/closeOverlay` |
| `view_kit` | 控件工厂：胶囊 / 键帽 / 热区 / 三态 | `K.pill{...}` / `K.button{...}` |

## 4. 节点 schema（view → render 的唯一契约）

```lua
{ key = 'cell1',              -- 全局唯一（render 用它做 diff 的主键）
  layer = 'board',            -- view_layers 里的语义层名
  tpl = 'cell',               -- 客户端模板名（项目提供）
  name = 'cell1',             -- 引擎控件名（GetChild 按名寻址；同一 parent 下必须唯一）
  pos = { x, y }, size = { w, h },
  color = 0xFF1A1D26,         -- imageColor（有符号 int32 读回）
  image = { s = 'circle' },   -- 图元：rect/circle/triangle/fourstar/fivestar/ring
  rot = 15,                   -- 可选：SetLocalRotation(z)
  text = '得分 0', font = 20, fcolor = ..., align = 'Middle',
  visible = true,
  cursor = { 'Click' }, on = { Click = fn } }
```

## 5. 静态检查 L1–L6（把"只能靠人眼"的缺陷变成断言）

| code | 查什么 | 真实事故 |
|---|---|---|
| L1 | 同一 parent 下控件名重复 | `GetChild` 寻址歧义 |
| L2 | 缺 tpl / 既无 size 又无 text | 建出来是 0 尺寸死节点 |
| L3 | 半透明或低对比压在浅底上 | 手机端结算三键**近白压近白**（对比度 1.4）⇒ 隐形 |
| L4 | 文字放不下（引擎 `requiredHeight = 1.2f×行数 + (0.25f+4)`） | 移动端字号未缩放、框宽缩放了 ⇒ 折行被裁 ⇒ `fits=false` ⇒ **整条不画** |

**L4 有两条断言路线，都要用**：
1. **描述层**：`V.lint(nodes)` 报 L4/L4w（便宜，但只是估算）。
2. **引擎层**：mock 后端实现了同一个公式，建完控件后读 `ctl.textLayout` → `{ fits, requiredHeight, lines, visibleLineCount }`。
   实测锚点：18 号/宽 240/高 32 → 2 行、需 **51.7**、`fits=false`；16 号/宽 200/高 46 → 需 **46.4**、`fits=false`；高 47 → `fits=true`。
   这一层能抓住"估算放过了、引擎却判不画"的边界（我们真踩过：估算留 1px 余量，22.85 vs 22 就漏了）。
| L5 | 交互控件被上层覆盖 | 结算卡压住触控胶囊 2870px² |
| L6 | 交互控件层号低于 panel | 面板挡住点击 |

## 5.5 另外两个入口：布局表与背景构图

`V.lint` 只看**描述层节点表**。项目里还有两类几何事实住在别处，各自有过一次用户可见事故：

| 入口 | 查什么 | 事故 |
|---|---|---|
| `V.lintPlan(plan, cfg)` | P1 控件名重复 / P2 同矩形叠印 / P3 文字框高 ≥1.45f+4 / P4 出画布 / P5 缺数值 | 双盘横幅坐标写错、两条文字叠印 |
| `V.lintCover(items, cfg)` | C1 图元并集 ⊇ **设计板** / C2 缺 x,y,w,h / C3 rot 非数值 | 「背景两侧露白」而四道判据全绿 |

**C1 为什么查"设计板覆盖"而不是"画布覆盖"**：实现用 cover 缩放 `bs=max(W/baseW,H/baseH)`，
于是 像素外缘 ≥ (baseW/2)·bs ≥ W/2 且 ≥ (baseH/2)·bs ≥ H/2 ⇒ **任意画布**四边 0 缺口。
所以设计板盖满就够，不必每张画布各验一次；反过来画布上量到缺口，说明数据本身没盖满。

**⚠ 判据别把恒真项算进去**：Tetris 旧版把整屏 wash（纯色底）也计入背景外缘，
wash 恒盖满 ⇒ 「四边 0 缺口」判据恒真，用户报露白时它照样打印 ok。
正确分层是：**wash 守"底色铺满"（用拉伸锚点，与画布无关），构图守"有美术且画到边"（lintCover 守数据）**。

## 6. 三条硬约束（踩过才写下的）

1. **覆盖屏必须用独立 render 实例。** 基础层是"每帧增量更新同一张 key 表"，覆盖屏是"整屏一次性重建"；共用一张表时覆盖屏的 apply 会把基础层当"不在列表里"全部销毁（表现：开浮层时棋盘偶尔整片消失）。
2. **open 覆盖屏必须先 `clear()` 再 `apply()`。** 引擎实例上限约 **430**、常驻约 240；说明页 271–289 节点，不清屏必撞。
3. **服务端 textbox 恒在运行时实例之下**（`SERVER_TEXT_CEILING=0`）。想让某段文字吃语义层号，必须换成运行时实例——在那之前别把它塞进 `render.apply`。

## 7. 验证台阶

| 台阶 | 命令 | 成本 | 能证明 |
|---|---|---|---|
| L0 纯逻辑单测 | `lua5.3 tests/run_all.lua` | 0.01s | 描述结构、层序、几何、lint |
| L1 模拟器用例 | 项目自带 runner | 分钟级 | 真实引擎行为、日志契约 |
| L2 出图 | 项目自带截图工具 | 秒级 × 屏数 | 观感（文字裁切、配色、圆角） |

**L0 绿 ≠ L1 绿 ≠ L2 对**。本框架只保证 L0；L1/L2 必须真跑。特别注意：**70 个用例里往往有一半没有控件断言**，它们对"字被裁 / 层序被盖"是盲的。

## 8. 快速开始

```bash
# 复制到新工程
frameworks/qxqy-ui/bootstrap.sh /path/to/new-game     # 得到 lua/qxqy_ui/*.lua + tests/*.lua

# 自测（不需要模拟器）
cd /path/to/new-game && lua5.3 tests/run_all.lua
```

在一个新游戏里最小可用形态：

```lua
local P  = PLATFORM.new{ mock = true }               -- 真机传 mock=false
local L  = VIEW_LAYERS
local R  = RENDER.new{ platform = P, layers = L }
local S  = SCENES.new{}
local A  = APP.new{ platform = P, render = R, scenes = S, layers = L }

A.register{ name = 'play', view = function()
  return { { key='bg', layer='bg', tpl='cell', size={1280,720}, color=0xFFF7FAFF },
           { key='box', layer='card', tpl='cell', pos={0,0}, size={400,200}, color=0xFF7FCF6A } }
end }
A.start('play')
A.tick(1/60)
```

## 9. 已知未覆盖（别把它当全能）

- 字体度量的真实折行（框架用保守估算；引擎是 `1.2f×行数+0.25f+4`，估算按全角保守）
- 音频时长/白名单（只校验调用序列）
- 容器 Scroll/Grid 排版、Tween/动画、信号收发
- 真机与模拟器差异（模板 guid 重编号、`SetVisible` 对运行时实例不生效、Enum 键位形态）
- 宿主数值语义：**lua5.3 是 64 位整数，Fengari/真机是 IEEE-754 double**——任何依赖溢出行为的算式（手写 LCG 等）在两端序列不同，必须显式走浮点（`+ 0.0`）

## 10. 相关技能

- `.agents/skills/qxqy-ui-framework`：本框架的使用方法与踩坑清单（触发词："声明式 UI / 层序 / 字被裁 / 控件隐形 / headless 复现"）
- `.agents/skills/lua-2d-ui-game-build`：从 0 做 2D UI 游戏的阶段门与真机踩坑
- `.agents/skills/simulator-2d-route`：模拟器生产线的选型与工具细节

## 11. 三态按钮（hover / pressed）

用户报过「导航胶囊没有悬浮高亮」。当时每个项目各写一套，于是有的屏有、有的屏没有，配色也不一致。
v6.28 起这一层收到框架里：**颜色派生 + 状态机都在框架，项目侧只提供"怎么重涂"**。

```lua
-- A. 按钮自带三态（最省事）：胶囊 + 文字 + 热区，Enter/Exit/Down/Up 自动接管
local nodes = K.button {
  key = 'navHelp', x = 560, y = 300, w = 180, h = 56, label = '说明', preset = 'gold',
  states = { onChange = K.repainter(R) },        -- 一行接上：把新色写进引擎（R 需要 write(key, field, value)）
  on = { CursorClick = function() openHelp() end },   -- 点击回调不受影响
}
-- nodes.state 是状态机：nodes.state:current() -> 'normal' | 'hover' | 'pressed'

-- B. 画面由别处画、只要热区带三态：给出要重涂的控件键
local hit = K.hit {
  key = 'navHelpHit', x = 560, y = 300, w = 220, h = 80,
  states = { keys = { 'navHelpB', 'navHelpL', 'navHelpR' }, base = 0xFFF0D696,
             onChange = K.repainter(R) },
}

-- C. 纯函数（不建控件，headless 直接断言）
local c = K.stateColors { base = 0xFFF0D696 }    -- { normal=, hover=, pressed= }
K.stateColor(base, 'hover')                       -- (color, ok, why)；未知状态名 ⇒ 回落 normal + ok=false
```

**判据（`tests/view_kit_test.lua` 的 J 段，25 条）**

| # | 判据 |
|---|---|
| J1–J3 | 三态色两两不同；hover 亮于 normal；pressed 暗于 normal（用 `K.lum` 判，不是看字符串） |
| J4–J6 | 缺省派生确定性；`kitM.new{ stateMix = … }` 覆盖生效；显式 hover/press 覆盖派生 |
| J7 | 非法状态名回落 normal **并回报**（不抛错、不静默） |
| J8–J10 | enter ⇒ hover、leave ⇒ normal（收敛）；重复 enter 不重复回调（鼠标扫一排按钮不会闪） |
| J11–J15 | down ⇒ pressed；按住移出仍是 pressed；区间外松手回 normal；区内松手回 hover；click 不改外观 |
| J16–J21 | 带三态的按钮**节点数不变**（不新开渲染通道）；热区五事件齐；点击仍走用户回调；`state:apply(writeFn)` 一行重涂 |
| J22–J23 | `K.hit + states` 同样可用（纯热区入口） |
| J28–J29 | `K.repainter(R)` 一行接线；没给 R 时安全空转（headless 可用） |
| J24 | 派生比例置 0 ⇒ 三态同色（**证明 J1–J3 真的依赖比例，改常量必红**） |
| J25 | 不给 `states` ⇒ 完全旧行为（零回归） |

**两条设计口径**（改之前先读）

1. **往白/往黑混，不乘亮度系数**：乘系数在深色底上会把 RGB 压到 0（三态撞车）；混色对任意底色都单调可分，且与 `K.over` 同一口径，alpha 保留原值。比例在模块顶部 `M.STATE_MIX`（默认 hover 0.12 / press 0.20）。
2. **状态机持有两个布尔位（inside / held），状态是派生值**：`down → leave` 不应丢按下态（按住拖出按钮再拖回，视觉不能跳）；`click` 不改外观（点击是动作，不是样式）。同一状态重复事件不触发回调——否则鼠标扫过一排按钮会连闪。

**未覆盖**：`CursorLeave` 这个事件名本引擎不存在（真机/模拟器都是 `CursorExit`）；触屏没有 hover，`K.states` 在 `down` 之后自动回 `normal`，观感等价于"按下变深、抬起复原"。

### 11.1 判据是"看得见"，不是"往白混"（2026-11-17 真机教训）

用户报「导航胶囊没有悬浮高亮」时，胶囊**本来就接了** `CursorEnter → 改色`；看不见的真因是
调色板增量只有 `btnBg(255,250,243) → btnHover(255,253,248)` ≈ **+2%**，近白卡片上不可辨。

固定"往白混"在近白底上永远救不回来（最多 +10 就到顶）。因此：

```lua
M.STATE_MIX       = { hover = 0.12, press = 0.20 }   -- 派生强度
M.STATE_MIN_DELTA = 12                                -- 与 normal 的**最小感知亮度差**
-- hover：先往白混；若 |ΔL| < MIN_DELTA ⇒ 翻向压暗并把差值顶到 MIN_DELTA
-- pressed：恒往黑混（"按下变深"是硬语义，不翻转）
```

- 浅底（如真机卡片 `0xFFF5F0F1`）hover = **压暗**；深底 hover = **提亮**。
- 判据（`tests/view_kit_test.lua` J2a/J2b/J2c）：|ΔL| ≥ MIN_DELTA、近白底压暗、深底提亮。
- 想调观感只改 `STATE_MIN_DELTA` / `STATE_MIX` 两个框架常量，**不要回头改项目调色板**。

⚠ 两个静默坑：
1. 胶囊在渲染层是**三块**（`key..'B'/'L'/'R'`）。给状态机的 `keys` 只写基名 ⇒ `R.write` 什么也没写、**不报错**。
2. `readField` 读回的 `imageColor` 是**有符号 int32**（如 `-657679`），比较前先 `+2^32`。
