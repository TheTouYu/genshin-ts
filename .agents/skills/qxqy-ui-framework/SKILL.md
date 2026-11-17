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

**L4 要做两条路线**：描述层 `V.lint` 给估算；引擎层读 `ctl.textLayout`（mock 按同一公式实现）：
```lua
R.apply(nodes)
assert(R.get('charPanelS').textLayout.fits, ...)         -- 引擎会判定能放下
assert(R.get('charPanelS').textLayout.visibleLineCount > 0)
```
实测锚：18 号/宽 240/高 32 → 2 行、需 51.7、fits=false；16 号/宽 200/高 46 → 需 46.4、fits=false。
只做描述层会漏掉"估算放过、引擎判不画"的边界——这类"整条文字消失"的 bug 靠人眼极难定位。

### 4.1 这套判据的**覆盖边界**（2026-11-17 复盘，重要）

L1–L6 全部作用于 **`view_*` 描述层的节点表**。而 `ui.lua` 的 `U.plan`
（**对局屏 / 双盘屏的布局**）长期**零测试、零 lint**——四起真机事故里的
「双盘横幅位置」恰好就发生在这一层，当时一条判据都没有。

现已补 `tests-lua/ui_plan_test.lua`（对 4 种画布 × 单/双盘 × 3 屏逐一取 plan）：

| code | 判据 |
|---|---|
| P1 | 同屏控件名唯一（`GetChild` 按名寻址会歧义） |
| P2 | **两条文字不得占用同一矩形**（v6.18 实测 `ibotBanner` 与 `ihint` 同为 ty=-452，出图是一团花字） |
| P3 | 文字框高 ≥ `1.45×字号+4`（引擎判据；不足则**整条一个字都不画**） |
| P4 | 未停靠的矩形必须落在画布内 |
| P5 | 条目必须带完整数值（nil 会在 `center()` 里炸） |

**它一上线就抓到两个真缺陷**（都不是猜的）：
- `best` 在 1280×720 单盘上框高 32 < 需 33 ⇒ 「最高」整条不画；
- PC 双盘 `title` 480 宽居中在 `gutterX` ⇒ 1600 宽下左缘 -824 出画布 24px。

**L2 的判据边界**：它只判 `n.tpl` **字段在不在**，**不判键是否可解析**。实测
`tpl='definitely_missing_tpl'` 报 0 问题——旧文案却写「缺模板（实例化会失败）」，会让人
误以为防住了。键的可用性由 `tests-lua/tpl_contract_test.lua` **单点**负责，别在两处各写一份。

**方法论（本轮最值钱的）**：防线要按**事故分布**投，不要按层的"漂亮程度"投。
框架最容易给已经写得干净的那层加判据，而事故往往发生在没人看的那层。

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

- **"装载期注入"恒为 nil**（本轮实测两例）：模块表在 chunk 装载期构造，而 `platform` / `render` 实例在 `OnStart` 才创建。若在构造期写字面量 `platform = PT`，读到的是 nil ⇒ 模块静默走降级路径，**看起来接上了、其实没接**（另一例：`loadModule('core_rng')` 写在首次使用之后，同理）。修法是分两段：先建 `ENV = {}` 表，`OnStart` 里回填实例。判据：**降级日志是否还在打**（`roster v2 skip :: 需要 main 注入 …` 消失才算真接上）。
- **`R:apply(nodes)` 写成冒号**：closure 风格模块会把 `R` 自己当 list 传进去，不报错、只是什么都没建、断言全红而 reason 看不出根因 → 统一点号调用。
- **`local live` 遮蔽模块级计数器**：销毁路径算错，被 pcall 包住 ⇒ 表现为"静默不销毁"。
- **引擎数值模型**：lua5.3 是 64 位整数，Fengari/真机是 IEEE-754 double。手写 LCG 在两端序列不同（本项目 9/70 用例因此红，看起来像排版 bug）。修法是**显式走浮点**（`seed + 0.0` + `math.floor(s / K)` 取位），不是改期望值。
- **`pairs()` 遍历序**两宿主可能不同 → 依赖遍历序的逻辑要么排序、要么别依赖。
- **层序自检只看同一次 apply 内**：跨多次 apply 的倒序需求只能靠重建。
- **hotzone 的 y 与视觉同号**：取负 = 镜像到画布另一侧 = "看得见点不到"。
- **模拟器 pointer 坐标是左下原点**（y 向上）：逻辑 (x,y) → pointer (W/2+x, H/2+y)。
- **`control.imageColor` 有符号**：0xFF71B65E 要写 `-9324962`。
- **press 态断言必须夹在 down 与 up 之间**（CursorUp 会刷回 hover 色）。
- **「浏览器里字消失、离线出图正常」先查静态烘焙，别改 Lua**（2026-11-02 结算胶囊悬停丢字）：浏览器渲染器会把稳定 8 帧的兄弟节点烤成一张 proxy 贴图；文本一旦被烤进去，相邻胶囊因悬停改色被踢出 run 单独绘制时就会盖掉 glyphs。判据三步：①同一 scene 用 `host-png` 出图对照（正常 ⇒ 不是描述/层序/颜色）；②`__staticRuns` 里看 `layer.children` 是否含 `textbox`；③`__dissolveRun(run)` 一试——文字回来即坐实。修法在渲染器侧「文本永不进烘焙」（`studio/play/pixi-renderer.js`，回归 `web/test/static-cache-browser.test.mjs`），不是项目代码。重建：`node scripts/build.mjs web`——`web/public/play-renderer.js` 是 gitignore 的构建物，只改产物会被下次构建冲掉。

## 8. 快速开始

```bash
frameworks/qxqy-ui/bootstrap.sh /path/to/new-game
cd /path/to/new-game && lua5.3 tests/run_all.lua   # 期望 ALL GREEN
```
构建接入：多数项目按平铺 `*.lua` 扫描模块目录，需让构建脚本也扫 `lua/qxqy_ui`，或把文件平铺拷进去。

## 8.5 L0.5 台阶（假引擎跑真用例）也可以复用

若你的项目也用 `createStudio` + `build.mjs` 那条生产线（存档 `*.save.json` + 客户端模板 guid），可以直接复用参考实现里的三件套：

| 文件 | 作用 | 前置条件 |
|---|---|---|
| `workspace/tetris/tests-lua/engine_shim.lua` | 假引擎：`game/script/Enum/typeof/print/require` + 控件代理；服务端控件树与模板 guid 从存档读（不硬编码） | 存档里的控件树结构与你项目一致 |
| `workspace/tetris/tests-lua/run_cases.lua` | 用例驱动：`log/control/tree/lua` 断言 + 音效序列；支持 `--jobs=N`、`--source=repo|save` | 用例格式与模拟器 `autotest` 一致 |
| `workspace/tetris/tests-lua/json.lua` | 最小 JSON 解析（含 `\uXXXX`） | 无 |

**收益读数（本项目实测）**：同一批 71 个用例，模拟器 **425s** → 假引擎 **7.8s（jobs=8）**，通过 70/71；唯一的红是"必须留模拟器"的那条。这条通道把"改一行看效果"从分钟级拉到秒级，是整套重构能跑起来的前提。

**它证明不了什么（必须写在你的验收报告里）**：渲染/字体度量/裁剪、音频时长与白名单、容器排版与变换、Tween/动画/信号、真机差异、宿主数值语义（整数位宽 / `pairs` 序）。

## 8.6 模拟器侧要打的两个小补丁（让"引擎自己算的派生量"可断言）

`control` 断言原只能读**平铺标量**字段（`text`/`fontSize`/`sizeDeltaY`…），读不到引擎算出来的 `textLayout`。两处补丁（都在 `studio/` 下，各 3~6 行）：

1. `studio/autotest/assert.js` 的 `readField`：支持**点号路径**（`'textLayout.fits'`）。
2. `studio/play/session.js` 的 `controlSnapshot`：给文本类控件挂 `textLayout: textLayout(control, box.width, box.height)`，并**用 try/catch 兜住**（这条通道被全部用例共享，任何异常都不能让整份快照挂掉）。

补完即可写：
```json
{ "at": 1.2, "kind": "control", "name": "charPanelL1", "field": "textLayout.fits", "equals": true }
```
**判据顺序**：先确认 `playGet({inspect:true}).tree` 里那个节点真的有 `textLayout` 键（`Object.keys`），再写断言——否则读到的永远是 `null`，而 `null` 和"放不下"看起来一样。

## 8.7 两条血泪判据（2026-10-31，都来自真实事故）

**8.7.1 服务端 textbox 在真机上压在运行时实例之上。**
帧级实测：结算屏 `sk1name` 的 `z=42`，结算卡 `z=51–53`，而帧里 **z 小=在上** ⇒ 技能名压着结算卡。
后果：**遮罩（哪怕 alpha=255 的 scrim）盖不住它们**，唯一手段是"不让它有内容"。
所以：想让某段文字受语义层号管辖，就必须是运行时实例；留在服务端 textbox 里的文字，**永远要单独处理可见性**。

**8.7.2 "我清了却还在"——先怀疑清动作被闸门吞了。**
事故经过：4 次修复尝试全部无效（逐控件清空 / 让写入源早退 / 补判定 / 换 `findIn` 句柄）。
真因：`setText` 里**并列两条 guard**——①拦非空写入（对）②`if hidden then return end`（**把清空也拦了**）。
`syncStage` 每帧置 `textForce=true` 去清，第①条放行、第②条拦回 ⇒ **每帧清、每帧被吞**。
两条判据：
- **同一函数别并列两条同义 guard**：后加的"放行/例外"会被先加的那条吃掉；要放行就**合并成一条带例外位的判据**。
- **探针打在 guard 内部**，把 `hidden / force / value` 一起打出来——一条日志就能分清"没清"与"清了被拦"。
- 验收靠**帧级 A/B**：旧批次 5/5 命中、新批次 0 命中，比"我看了一眼没问题"可靠得多。

## 8.8 别再犯："有实现 + 有单测" ≠ "在跑"

2026-11-02 实测事故：`app` 加了 `setBase` / `baseStatic` / `frame` / `suspendBase` / `markBaseDirty` 五个 API，每个都有断言，**生产里一次都没被调用**（`grep -c "APP\.render" = 0`）。于是：
- 我以为"棋盘不丢"有机制证据（`baseStatic` 在保护），实际棋盘不丢是因为**覆盖屏用独立实例**；
- 整轮判断建立在空转代码上。

**判据（写进交付检查表）**：
1. 新增一个 API 给生产用，**同一轮**必须给出"生产在调用它"的读数（`grep -c` 或日志）；
2. 做不到就标 `EXPERIMENTAL` 并在文件头写清"谁在用、为什么没接"；
3. 单测证明的是"这段代码如果被调用会怎样"，**不证明它被调用**。

**顺带一条设计结论**：把"每帧渲染"归口到一个 `tick` 的前提是——渲染调用是**一段连续的 phase**。若渲染是"状态写入的即时观察者"（散在条件分支里、注释写明要立刻刷），硬搬只有两条路：把条件判断搬进 tick（tick 变游戏逻辑）或延后到帧末（丢语义）。**先确认结构，再定架构**——否则会做出一层没人用的框架。

## 8.9 真机与本地分叉的根因：同一事实两处表达（2026-11-16，代价三轮返工）

连续三轮真机「全是 bug、模拟器全绿」，病根是同一条：**同一个事实被两处各自表达，其中一处漂移了**。

| 事故 | 那个"事实" | A 处 | B 处 |
|---|---|---|---|
| 横幅位置 | 横幅该在哪 | `ui.lua` 的 plan | `main.lua` 的 layoutDual 硬编码坐标 |
| 文字模板判据 | 什么算文字模板 | 探测 `probeTextRaw`（能建就行） | `accept`（必须读得到 text） |
| 用哪个 guid | 拿什么建控件 | 探测结果 `TEMPLATES.cell` | 配置原始 `TPL_GUIDS.cell` |
| 候选表键名 | 文字模板表叫什么 | `templates.lua` 知道 `stext→settleText` | `platform.lua` 不知道 |

**为什么本地发现不了**：兜底/mock 把错误吸收了。
- mock 节点走 `__kind` 分支，永远不走真机的字段探测分支；
- 兜底扫描区间恰好包含模拟器的模板 guid，**错误被救场**（真机真实 guid 在区间外）。

### 五条判据（可直接执行）

1. **同一个事实只准有一个表达处**。看到两处都在算同一件事（坐标/判据/键名/guid），先合并再修 bug。
2. **兜底必须大声**。降级分支要有专用日志词（如 `scan ok`），并且有门禁盯着它不出现。
3. **"没打 reject" 是信息**。`候选表为空` 与 `候选被试完` 必须打**不同**的日志——
   否则会像我一样按错的层修一轮（第一轮改能力判据，方向完全错）。
4. **构建期能拦的绝不留给真机**。模板键契约（`tpl='xxx'` 必须在 config 里有同名候选表）
   是纯静态、毫秒级的检查，直接对应第四例。
5. **模拟器全绿 ≠ 真机能跑**。凡依赖"引擎给的 guid / 字段可读性 / 真实分辨率"的假设，
   都要问：模拟器在这一层真的等价吗？

### 真机日志的判据顺序（照着走，不要跳）

```bash
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <log.gia> lua \
  | grep -inE "platform fail|cands=0|scan ok|bg pool|bg cover"
```
1. 有 `tpl X reject` → **能力判据**问题（accept 依赖了真机读不到的字段）
2. 只有 `all candidates rejected`、**无** reject → **候选表没查到**（键名/扫描范围）
3. 出现 `scan ok` → 配置 guid 过期，被兜底救场，必须改配置

### 本项目已有的机械防线（别再徒手查）

| 层 | 防线 |
|---|---|
| 构建期 | `tests-lua/tpl_contract_test.lua`（模板键契约）· `qxqy/build.mjs` 的占位符残留闸门 |
| 运行期 | `qxqy/scan-runtime-errors.mjs` 的 `CONFIG-DRIFT` / `TPL-KEY-MISS` |
| 模拟器保真 | `playStart({ templateRenumber: N })` 模拟真机 guid 重编号（另一个仓库） |

完整方案见 `workspace/tetris/docs/v624-error-prevention.md`。

## 8.10 判据要"上移"：从项目测试变成框架能力

2026-11-17 复盘发现的系统性短板：**框架带得走的是代码，带不走的是判据。**
本框架 39 个模块里约 12 个是通用能力，而历次事故后补的闸门几乎全在项目层
（`tests-lua/*.lua`、`qxqy/*.mjs`、`main.lua`、`config.lua`）。换个游戏，能力跟着走、
闸门要重写 ⇒ 同一批坑重踩。

#### 大画布适配：设计空间缩放（2026-11-17 真机图六）

「空间更大反而更难用」的通用病根是**按画布边缘定位 + 内容尺寸固定**：`gutL=-(halfW-103)` 在
1280 宽恰好在棋盘外侧，2400 宽就被推到离盘 660px 的屏幕角。

固定解法（`S = clamp(min(W/W0, H/H0), 1, 2)`，W0/H0 = 设计基准 1280×720）：

| 件 | 用哪套坐标 |
|---|---|
| 导航键、贴边横幅 | **画布坐标**（用 W/H 现算，不吃 S） |
| 棋盘格、拇指簇、侧栏文字、技能卡 | **设计坐标 × S** |

三处必须同时乘 S，漏一处就露馅：① 内容尺寸（棋盘 `CELL/PITCH`，`PITCH=CELL+GAP` 要由缩放后两者相加）
② 锚定在内容上的位置（双盘盘心 `±236`）③ 渲染层实例的摆位常量（`halfW-230`、`250`…）。
判据要按**画布矩阵**跑（含用户真机分辨率），否则"看不见那张画布"就是假绿。

#### 三态/高亮：判据是"看得见"，不是"往白混"

见框架 README §11.1：`STATE_MIN_DELTA`（视觉差下限）比"派生方向"更重要；
胶囊三块（`B/L/R`）要**给全 keys**，只写基名是静默无效；
`imageColor` 读回是有符号 int32。

#### 两个静默陷阱（本轮踩到）

1. `rawget(_G, 'someFn')` 拿不到同文件里的 `local function` ⇒ `pcall` 静默跳过、无日志。
   凡"可选调用"，必须补一条**日志锚**证明它执行了（本轮靠 `newgame` 锚 + HUD 读数才发现）。
2. `playRunCase` 的日志窗口**不包含 OnStart**：`canvas WxH`、`view scale S=…` 这类开局日志
   不能写进用例断言，改写运行期锚（如 `phone layout w=… h=…`）。

#### 判据的三个入口别混（各自看一层事实）

| 入口 | 看什么 | 典型事故 |
|---|---|---|
| `V.lint` | 描述层节点表（view_*）| 字被裁、层序被盖、半透明隐形 |
| `V.lintPlan` | 布局表（U.plan 的 name→rect）| 双盘横幅位置写错、两条文字叠印 |
| `V.lintCover` | 背景构图数据（MODE_BG 的图元表）| 「背景两侧露白」而四道判据全绿 |

**判据里混进恒真项 = 整条判据报废**（比"两处表达漂移"更隐蔽）：Tetris 旧版把整屏 wash 的
外缘写进「四边 0 缺口」判据，wash 恒盖满 ⇒ 判据恒真，用户报露白时照样打印 ok。
正确分层：**wash 守"底色铺满"（拉伸锚点 `anchorMin/Max` + `sizeDelta=0`，与画布无关）、
构图守"有美术且画到边"（`lintCover` 守设计板不变量）**，两者不许合成一条判据。
写这条守卫时用 **stub 宿主直接跑一遍 apply**，断言"wash 在 + 构图空 ⇒ 必须报缺口"——
这是唯一能防复发的测法（见 `tests-lua/bg_cover_test.lua` 第四段）。

### 三层上移法（按性价比排序）

1. **把判据做成通用函数**（最高价值）
   几何/结构类判据不含游戏语义，应当长在框架模块里（`frameworks/qxqy-ui/lua/qxqy_ui/`）：
   - `V.lint(list, cfg)` —— view 节点表（L1–L6）
   - `V.lintPlan(plan, cfg)` —— 布局表（P1–P5：重名 / 叠印 / 框高 / 出画布 / 缺数值）
   - `V.lintCover(items, cfg)` —— **背景构图数据**（C1 图元并集 ⊇ 设计板 / C2 缺 x,y,w,h / C3 rot 非数）
     ＋ `V.rectAABB(x,y,w,h,rot)` 旋转矩形真外接盒（判据与运行时日志共用，别抄第二份数学）
   - `V.lint(list, { tplKeys = ... })` —— 追加 `L2t`：tpl 键必须在给定集合内
   新项目调一次就有，不用抄测试。**能力测试写在框架自己的 `tests/view_node_lint_test.lua`**，
   随框架复制走；项目侧只留"把真源接进来"的那一点接线。

2. **把"要不要跑"变成默认**
   判据散在多处时，人（模型）一定会漏。收成**一条命令** `qxqy/check-framework.sh`
   （6 项：tpl 契约 / UI 计划 lint / 设备适配 / headless 全量 / **框架本体自测** / 占位符静态检查），
   再接进 `qxqy/tetris-guard.sh --fast` 的 4b 闸门 ⇒ **删除防护才需要显式动作**。

### 框架副本的同步纪律（本仓特有，别绕过）

框架实体在 `frameworks/qxqy-ui/`，参考实现在 `workspace/tetris/lua/tetris/`。两边**必须逐字节一致**：

```bash
bash frameworks/qxqy-ui/sync-check.sh          # 查漂移（guard 的闸门 2 就是在跑它）
bash frameworks/qxqy-ui/sync-check.sh --sync   # 以 tetris 为准同步（tetris 先落地验证）
lua5.3 frameworks/qxqy-ui/tests/run_all.lua    # 框架自测（换 cwd 也要过：根变量统一 QxqyUiRoot）
```

⚠ 框架测试的根变量必须只用 `QxqyUiRoot`（`TETRIS_ROOT` 仅作兼容回退）。历史上 `app_test`
只认 `TETRIS_ROOT`，导致"在框架目录跑绿、从仓库根跑红"——同一个测试两个入口两种结论。

3. **把"单一来源"变成可检测规则**
   目前只防了已知的四个实例（tpl 键 / guid 来源 / 判据重复 / 布局坐标）。
   纯字面量重复检测噪声太大、暂不做；可做的是**声明式事实注册**：
   把"某事实只能出现在某文件"写成配置，由脚本核对。

### 判别一个判据该不该上移

问三句：
- 它**依赖这局游戏的语义**吗（方块形状、技能名、关卡数值）？依赖 ⇒ 留在项目层。
- 换一个游戏，这条判据**一个字都不用改**吗？是 ⇒ 应当进框架。
- 它现在是"测试里的一段循环"还是"可直接调用的函数"？前者 ⇒ 先抽成后者。

### 反面教材（本项目真实代价）

`ui_plan_test.lua` 的 P1–P5 是纯几何判据，却以"一次性测试"的形式存在了很久，
`ui.lua` 的 `U.plan`（对局/双盘布局）因此在 `tests-lua` 里**零引用**，
四起真机事故之一就发生在那层。抽成 `V.lintPlan` 后，任何项目一行调用即可覆盖。

## 9. 本框架**不**覆盖

字体真实折行（用保守估算）、音频时长/白名单、容器 Scroll/Grid 排版、Tween/动画/信号、真机差异（模板 guid 重编号、`SetVisible(false)` 对运行时实例无效、Enum 键位形态）。这些必须走 L1/L2。
