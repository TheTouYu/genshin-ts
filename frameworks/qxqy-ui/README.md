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
| `view_node` | 节点 schema 校验 + 静态检查 | `V.lint(list)` → `{code='L1..L6'}`；`V.textNeed(text,font,w)` |
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
