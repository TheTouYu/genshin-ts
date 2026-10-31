---
name: qxqy-ui-framework
description: 千星沙箱 2D 界面游戏的声明式 UI 框架（纯逻辑/平台适配/声明式视图/场景栈四层分离）的使用与诊断方法。给出节点 schema、语义层号、render 增量协调、场景栈、覆盖屏隔离、L1–L6 静态检查，以及「把 bug 变成秒级可复现」的验证台阶与踩坑清单。当任务涉及：给 2D UI 游戏（俄罗斯方块/贪吃蛇/2048/扫雷这类整屏都是界面的玩法）搭架构、层序对不上/控件被盖住/字被裁/按钮隐形、需要在不启动模拟器的前提下复现 UI bug、要把一屏手写创建代码改成声明式描述、或者要判断「这屏到底该用 view_* 还是直接写控件」时使用。与 lua-2d-ui-game-build（阶段门与真机踩坑）、simulator-2d-route（生产线选型）分工：本技能只讲这套框架怎么用、为什么这么设计、以及它证明了什么/证明不了什么。
---

# qxqy-ui 声明式 UI 框架

> 代码资产：`frameworks/qxqy-ui/`（可独立 bootstrap、可独立自测）。
> 参考实现（真实游戏在跑）：`workspace/tetris`——6 个屏已纯描述化，~2650 行描述 + ~400 条 headless 断言。

## 0. 什么时候用这套框架（三问）

1. **界面上有"同一类东西重复很多个"**（棋盘格、列表行、卡片）→ 用。声明式 + diff 天然省掉几百行样板。
2. **界面有浮层/多屏切换**（帮助、结算、档案页）→ 用。`scenes` 栈 + 覆盖屏隔离能消掉"退出浮层后底层没回来"这一类 bug。
3. **只要几个静态控件、几乎不变** → 不必用，直接建控件更省事。

## 1. 四层与单向依赖（改代码前先定位自己在哪一层）

| 层 | 模块 | 只允许做的事 | 判据 |
|---|---|---|---|
| 平台 | `platform` | 碰 `game.*` / `ctl:*` / `Enum` | **除它以外任何模块出现 `game.`/`Enum.`/`ctl:` 都算违规** |
| 逻辑 | 项目自己的 `core_*` | 纯函数、无控件、无引擎 | 能 `lua5.3` 直接跑单测 |
| 视图 | `view_*` | `state → node 数组` | 不 print、不 require、零全局 |
| 协调 | `render` / `scenes` / `app` | 只做编排 | 不含业务判断 |

**排查顺序永远是：逻辑层→视图层→协调层→平台层。** 跨层推断（"代码看着对所以画面应该对"）是本项目最贵的错误来源。

## 2. 写一个屏的五步

```lua
-- 1) 模块骨架（注入依赖，不 require）
local M = {}
M.new = function(spec)
  local L, KIT = spec.layers, spec.kit
  local S = {}
  -- 2) 纯函数：state → node 数组
  function S.screen(opts)
    local nodes = {}
    nodes[#nodes+1] = { key='bg', layer='bg', tpl='cell', name='bg',
      pos={0,0}, size={opts.canvas[1]+60, opts.canvas[2]+60}, color=0xFFF7FAFF }
    -- 3) 形状/文字一律走 view_kit（胶囊=3 块，rrect=2 矩形+4 角圆）
    return nodes
  end
  return S
end
return M
```

4) **断言（headless，0.01s）**：
```lua
local issues = V.lint(nodes)            -- 期望 0
assert(#issues == 0, issues[1] and issues[1].msg)
-- 引擎侧：真跑 render + mock，读控件字段（不是读描述）
local R = RENDER.new{ platform = P } ; R.apply(nodes)
assert(R.get('hitR').imageId == 100002) -- 端点必须是圆
```
5) **接线**：`R.apply(V.screen{...})`；覆盖屏用独立 render 实例 + 先 clear。

## 3. 语义层号（层序不再靠"谁先建"）

```
wash 10 → bg 20 → plate 25 → board 30 → frame 35 → hud 40
        → panel 50 → card 60 → touch 70 → modal 80 → debug 99
```
`L.order('拼错的名字')` **抛错**（故意的：拼错层名等于随机层序）。

**引擎事实：没有可靠的 z 重排**（`SetAsLastSibling` 在模拟器是空操作）。已经建好的节点要"沉到别人下面"，唯一正确做法是重建整棵树；`render` 检测到这种需求会记 `R1` issue 而不是假装成功。

## 4. L1–L6 静态检查：这是本框架最值钱的部分

| code | 判据 | 对应真实事故 |
|---|---|---|
| L1 | 同一 parent 下控件名唯一 | `GetChild` 歧义 |
| L2 | 有 tpl、有尺寸 | 0 尺寸死节点 |
| L3 | 半透明/低对比不得压在浅底上（亮度差 ≥24） | 手机端结算三键**近白压近白**（对比度 1.4）⇒ 完全隐形 |
| L4 | 文字放得下：引擎 `requiredHeight = 1.2×字号×行数 + (0.25×字号+4)` | 移动端字号未缩放而框宽缩放了 ⇒ 折行 2 行 ⇒ `fits=false` ⇒ **整条一个字都不画** |
| L5 | 交互控件不被上层遮挡 | 结算卡压住触控胶囊 2870px² |
| L6 | 交互控件层号 ≥ panel | 面板挡住点击 |

**L4 的两个坑**：① 判据不能留 1px 余量（22.85 vs 22 的边界会漏）；② 报错文案里打浮点尺寸必须 `%.1f`，用 `%d` 会**在报缺陷那一刻抛异常**。

## 5. 三条硬约束

1. **覆盖屏必须用独立 render 实例。** 基础层每帧增量更新同一张 key 表；覆盖屏整屏重建。共用一张表 ⇒ 覆盖屏 apply 把基础层当"不在列表里"销毁 ⇒ 表现是"开浮层时棋盘偶尔整片消失"。
2. **open 覆盖屏先 `clear()` 再 `apply()`。** 引擎实例上限约 430、常驻约 240；说明页一类巨型浮层 271–289 节点。
3. **服务端 textbox 恒在运行时实例之下。** 想让文字吃语义层号必须换成运行时实例；在那之前别把它塞进 `render.apply`（会和棋盘抢 key 表）。

## 6. 验证台阶（缺一层就会"以为好了"）

| 台阶 | 命令 | 成本 | 证明什么 | 不证明什么 |
|---|---|---|---|---|
| L0 | `lua5.3 tests/run_all.lua` | 0.01s | 结构/层序/几何/lint | 引擎真实行为 |
| L0.5 | 假引擎跑真用例（`engine_shim` + `run_cases`） | 7.8s / 70 例 | 日志与控件断言按真实语义求值 | 渲染、字体、音频时长 |
| L1 | 真模拟器 runner | 分钟级 | 真实引擎行为 | 观感 |
| L2 | 出图人眼 | 秒级×屏数 | 字是否被裁、配色、圆角 | 交互（点击/悬停） |

**必知**：项目里往往有一半用例**没有任何控件断言**——它们全绿也不证明画面对。

## 7. 踩坑清单（每条都真实发生过）

- **`R:apply(nodes)` 写成冒号**：closure 风格模块会把 `R` 自己当 list 传进去，不报错、只是什么都没建、断言全红而 reason 看不出根因 → 统一点号调用。
- **`local live` 遮蔽模块级计数器**：销毁路径算错，被 pcall 包住 ⇒ 表现为"静默不销毁"。
- **引擎数值模型**：lua5.3 是 64 位整数，Fengari/真机是 IEEE-754 double。手写 LCG 在两端序列不同（本项目 9/70 用例因此红，看起来像排版 bug）。修法是**显式走浮点**（`seed + 0.0` + `math.floor(s / K)` 取位），不是改期望值。
- **`pairs()` 遍历序**两宿主可能不同 → 依赖遍历序的逻辑要么排序、要么别依赖。
- **层序自检只看同一次 apply 内**：跨多次 apply 的倒序需求只能靠重建。
- **hotzone 的 y 与视觉同号**：取负 = 镜像到画布另一侧 = "看得见点不到"。
- **模拟器 pointer 坐标是左下原点**（y 向上）：逻辑 (x,y) → pointer (W/2+x, H/2+y)。
- **`control.imageColor` 有符号**：0xFF71B65E 要写 `-9324962`。
- **press 态断言必须夹在 down 与 up 之间**（CursorUp 会刷回 hover 色）。

## 8. 快速开始

```bash
frameworks/qxqy-ui/bootstrap.sh /path/to/new-game
cd /path/to/new-game && lua5.3 tests/run_all.lua   # 期望 ALL GREEN
```
构建接入：多数项目按平铺 `*.lua` 扫描模块目录，需让构建脚本也扫 `lua/qxqy_ui`，或把文件平铺拷进去。

## 9. 本框架**不**覆盖

字体真实折行（用保守估算）、音频时长/白名单、容器 Scroll/Grid 排版、Tween/动画/信号、真机差异（模板 guid 重编号、`SetVisible(false)` 对运行时实例无效、Enum 键位形态）。这些必须走 L1/L2。
