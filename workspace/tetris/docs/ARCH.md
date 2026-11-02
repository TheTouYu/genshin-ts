# Tetris 架构规范（v6 重构）

> 状态：2026-10-31 立，重构进行中。本文件是**模块契约与判据**的唯一来源；
> 具体屏的实现细节写在各自模块头注释里。历史架构见 `docs/README.md`（已过时，仅作考古）。

## 0. 为什么重构（要治的病，不是"不好看"）

用户判据原话：**「现在复现一个 bug 都要很大力气」**。这是架构病，不是勤快程度问题。五个机制：

| # | 机制 | 后果 |
|---|---|---|
| 1 | 规则逻辑长在 `OnStart` 闭包里，调一次引擎 API 才能跑 | 任何玩法 bug 只能靠模拟器整轮跑（387s/70 用例）+ 出图人眼 |
| 2 | 状态全是脚本全局 / main chunk 上值（30+ 个裸全局），`g` 重绑定即切盘 | 复现一个 bug 要先复原"30 个全局各是什么值" |
| 3 | 层序 = 创建顺序，而创建顺序散在 755 行 `layout()` 里 | 层序 bug 必须整屏重渲染 + 人眼才看得见 |
| 4 | 菜单层级靠 `helpOpen/helpFromStage/helpPage/MODE/pendingMode` 隐式编码 | 多层级菜单的状态组合不可枚举，bug 不可复现 |
| 5 | 模块经 12-30 个闭包隐式契约互写（roster.lua 反写 main 的 FN 表 9 项） | 改 A 崩 B，且崩在哪要读 13k 行 |

**重构目标（唯一验收）**：任意 bug 能写成 `lua5.3 tests-lua/xxx_test.lua` 里的一个用例，**秒级复现**；
模拟器只用于「真实引擎行为」与最终视觉确认。

## 1. 目标架构：单向数据流

```
        输入事件（键/触控/计时）
                 │
                 ▼
   core_* 纯逻辑（零引擎调用）────────────┐
   board / pieces / rng / score / state    │  纯函数，lua5.3 直接跑
   ai / skills-rules                       │
                 │ state（普通表）          │
                 ▼                        │
   view_* 纯视图（state → 节点描述）────────┤  纯函数，无引擎
                 │ list<node>             │
                 ▼                        │
   render  协调器（描述 ↔ 控件，唯一实例化点）│
                 │                        │
                 ▼                        │
   platform 引擎适配（唯一碰 game.* / ctl.*）│
                 ├── real 后端（模拟器/真机）
                 └── mock 后端（headless 断言）
```

三条硬规则：

1. **只有 `platform.lua` 能调用 `game.*` / `ctl.*`**。其它模块出现引擎 API = 违规。
2. **`core_*` 与 `view_*` 不调用引擎、不读写外部状态**（输入 state，输出 state / list）。
3. **层序由 `view_layers.lua` 的语义层号决定**，由 `render.lua` 按层号顺序创建；创建点不得依赖调用顺序。

## 2. 文件规约（为什么平铺 + 前缀）

`qxqy/build.mjs:171` 只扫 `lua/tetris/*.lua` 平铺目录并逐文件建脚本映射（require key = 映射路径去掉 `.lua`）。
改成递归子目录需要在真机侧验证脚本映射（**真机风险，暂不做**），因此用**前缀分层**：

| 前缀 | 含义 | 例 |
|---|---|---|
| `core_` | 纯逻辑，零引擎 | `core_board.lua`、`core_state.lua`、`core_ai.lua` |
| `view_` | 纯视图（state → 节点描述） | `view_board.lua`、`view_settle.lua`、`view_help.lua`、`view_note.lua` |
| `scr_` | 屏（声明 + 事件绑定 + 生命周期） | `scr_title.lua`、`scr_play.lua` |
| `ui_` | 通用控件/主题/度量 | `ui_theme.lua`、`ui_text.lua` |
| `plat_` | 平台/后端/输入 | `platform.lua`、`input_map.lua` |
| 无前缀（历史模块） | 逐步迁出，最终删除 | `ui.lua`、`widgets.lua`、`skills.lua` |

## 3. 模块契约（沿用已实证的约定）

- 模块文件**未挂载、只被 require**（`build.mjs` 只挂 `main.lua`）。
- chunk 在 OnInit 期间执行 ⇒ **顶层不得实例化控件、不得读写脚本全局**。
- 依赖注入：`M.new(spec)` 返回一张函数表；spec 里给协作者（`config` / `platform` / `layers` …）。
  **模块之间不 require 彼此**（loadModule 有 4 级候选目录，互相 require 会踩路径）。
- 纯数据模块（`config.lua` / `copy.lua`）可直接 `return M`。
- main chunk 的 200-local 上限只管 `main.lua`；**其他模块各有自己的上限** ⇒ 新代码优先放模块里。

## 4. 节点描述（渲染契约）

```lua
node = {
  key     = 'cell1',      -- 跨帧稳定键（diff 依据，必填且同树内唯一）
  layer   = 'board',      -- view_layers 的语义层名（必填）
  tpl     = 'cell',       -- 模板键（config.TPL_GUIDS 的键）
  name    = 'cell1',      -- 引擎内名字（GetChild 寻址；缺省=key）
  parentKey = nil,        -- 父节点 key；nil = 挂 root
  pos     = { x, y },     -- SetAnchoredPosition（相对父中心）
  size    = { w, h },     -- SetSizeDelta
  color   = 0xAARRGGBB,   -- imageColor（有符号 int32 由引擎读回）
  text, font, fcolor, bg, align, valign, visible,
  cursor  = { 'Click' },  -- 需要注册的光标事件
  on      = { Click = fn } -- 事件处理器
}
```

`render.apply(list)` 的语义：按层序创建新 key、增量更新变化字段、销毁消失的 key。
**引擎不能重排 z**（`SetAsLastSibling` 在模拟器不准）⇒ 需要"下沉"时只能 `rebuild`，`render` 会记 `R1` issue 把问题暴露出来。

## 5. 已实证的引擎约束（改动前必读）

- 层序 = 创建顺序（后建在上）；服务端 textbox **永远**在运行时实例之下。
- `SetVisible(false)` 在真机对运行时实例**不生效** ⇒ 浮层一律**懒创建 + 用完销毁**。
- 真机一处抛错会**中断整段 OnStart** ⇒ 所有控件读写过 `platform` 的 pcall 护栏。
- 对齐字段真机要枚举值；方法签名严格（尾 nil 也算实参）。
- 模板 guid 真机会重编号 ⇒ 候选表 + 能力探测 + 兜底扫描（`platform.inst` 已封装）。
- 模板容器整棵实例化在真机不支持 ⇒ 浮层用单控件模板逐个实例化。

## 6. 验证台阶（禁止跨级推断）

| 级 | 手段 | 命令 | 成本 | 能证明什么 |
|---|---|---|---|---|
| L0 | headless 单测（纯逻辑/几何/层序/lint） | `lua5.3 tests-lua/run_all.lua` | ~0.05s | 规则、几何、层序、文案、可读性缺陷 |
| L0.5 | **headless 用例重放**（假引擎跑同一批 `tests/*.json`） | `lua5.3 tests-lua/run_cases.lua`（`--jobs=1` 顺序；`--source=save` 跑存档内嵌源码做同源对照） | **69/70，7.6s**（`--jobs=8`；顺序 19s） | 断言面 339 条（log 225 / control 72 / lua 30 / tree 12）按 `studio/autotest/assert.js` 语义真实求值；能把回归定位到「哪条断言、期望 vs 实得」 |
| L1 | 模拟器用例 | `node qxqy/runner.mjs [子串]` | 387s/70 例 | 真实引擎字段值、交互链路 |
| L2 | 出图 + 人眼 | `node qxqy/shots-v5.mjs --all --out …` | 15s/30 张 | 用户实际看到的画面 |
| L3 | 真机 | `deploy.mjs --device`（破坏性，需确认） | 分钟级 | 真机差异（模板重编号/SetVisible/抛错中断） |

**L0 绿 ≠ L0.5 绿 ≠ L1 绿 ≠ L2 对 ≠ L3 通**。每级只证明本级。

### 6.1 L0.5 的不可信边界（headless 用例重放证明不了什么）

`tests-lua/{engine_shim,run_cases,json}.lua` 是**假引擎**：按 `client/lua-runtime/src/{scene,runtime,enums}.js`
的语义实现 `game` / `script` / `Enum` / `typeof` / `print` / `require`，服务端控件树与客户端模板从
`tetris.save.json` 读（guid 不硬编码）。下面 6 条**它证明不了**，对应断言必须留在 L1/L2：

1. **渲染/字体度量/裁剪**：textbox 框高判据（`h ≥ font×1.45+4`）、adaptive 缩字号、字被裁、层序被盖。
2. **音频时长/白名单/voice 抢占**：只记录 `PlayAudio2D` 的 id 序列；`audioExpect` 只证明「请求过这个 id」。
3. **容器 Scroll/Grid 排版**、`localScale`/旋转变换后的可视区域与命中（只做 anchor/pivot 矩形）。
4. **Tween/动画/服务端信号收发/自定义变量**：最小桩；`var`/`signal` 断言在 70 例里本来就是 0 条。
5. **真机差异**：模板 guid 重编号、`SetVisible(false)` 对运行时实例不生效、Enum 键位形态、Destroy 后写控件。
6. **宿主数值/遍历语义**（2026-10-31 唯一根因所在）：
   - **整数位宽**：真机 LuaJIT 与模拟器 Fengari 的数字都是 IEEE-754 double，**只有 lua5.3 是 64 位整数**。
     ✅ **已修复**（commit `61feb378`）：`core_rng.lua` 的 LCG 显式 `seed + 0.0` + `math.floor(s / LCG_SHIFT)`
     取位，让 lua5.3 也走 double；模拟器/真机侧是 no-op。headless 用例 61/70 → **69/70**。
     ⚠ **未修**：`main.lua` 的 `aiRand`（P2 洗袋/洞位/观察等待共用这条流）仍是整数算式。
   - **`pairs()` 遍历序**：Fengari 与 lua5.3 的字符串哈希不同 ⇒ 决策路径里用 `pairs()` 的 AI 会分叉。

**必须留模拟器（当前 69/70 的那 1 条）**：`tests/57-copy-garbage.json`。首个分叉是 `p2 bag=1 piece=`
（开局阶段 P2 桌面取到的块不同；此前 170 行日志逐字相同 ⇒ **不是引擎 API 缺口**）。把 `core_rng` 与
`aiRand` 两处 LCG **都**强制 double 后仍分叉，且 `demo auto` 的 pace 1.55 vs 1.67 s/块 ⇒ 归到 AI 随机流/
遍历序层级，**未定谳**（不当作通过）。另外**一切画面类**（字被裁/层序/配色）仍必须 L2 出图——
70 例里 50 例没有任何 control/tree 断言，它们对画面是盲的。

## 7. 迁移路线（strangler：老码逐步被替换，全程可运行）

| 阶段 | 内容 | 判据 |
|---|---|---|
| P0 ✅ | 骨架：`platform` / `view_layers` / `view_node` / `render` / `view_board` + headless mock | `render_board_test` 20/20；与 tests/01 逐值相等 |
| P0.5 ✅ | 棋盘接进**真实引擎**（runner 01-06 绿 + 30 图无回归）；`scenes` 场景栈；`app` 连接层；`view_kit` 六件套工厂；`view_hud` 文案契约；`view_layers/view_node` 静态检查；`gate.sh` 验证闸门 | `gate.sh` GATE PASS；headless 14/14 文件 |
| P1 🔄 | `core_*` 纯逻辑：rng/pieces/board/state/ai/skills(+catalog)/progress/roster/takeover | 已交付 headless 单测：play 71 / ai 179 / skills 275 / input 85 / 其他见文件；接线进行中（rng+collides 已接） |
| P2 | 场景机 `scenes.lua`（push/pop 显式栈，替代 helpOpen/MODE 隐式组合） | 任意屏可 headless 进入/退出 + lint 0 |
| P3 🔄 | 屏逐个搬到 `scr_*`：结算（进行中）→ 标题 → 说明页 → 角色档案 → 双屏 → 移动端 | 每屏：`view_*` 纯描述 + lint 断言 → runner 子集绿 → 出图对比 |
| P4 | `main.lua` 瘦身成 boot + tick（目标 ≤300 行） | `luac5.3 -l -l` locals 大幅下降；全量 70 例 + 30 图绿 |
| P5 | 删除旧模块与死代码 | 全仓无 `InstantiateClientUIControl`（platform 之外） |

## 8. 命名与文案

- 日志字面量是**测试契约**（如 `copy levelup lv=2`、`cellCount=200`）：可以包装，不可改原文。
- 文案真源 = `copy.lua`；角色名/角色元数据只准一份。
- 键位真源 = `input_map.lua`（P4 之前暂在 main.lua，但新增键位不许再散写）。

## 9. 现状读数（2026-10-31 晚）

| 项 | 读数 |
|---|---|
| 模块数 | `lua/tetris/` 30 个文件（含 core_* 9 个、view_* 5 个、input/app/scenes 各 1） |
| headless 单测 | 14 个文件、~750 条断言、**0.05s**（`lua5.3 tests-lua/run_all.lua`） |
| 模拟器用例 | 70 个；抽样 01/02/04/06/07/14 全绿；全量需 ~390s |
| headless 用例驱动器 | `tests-lua/run_cases.lua` —— **70 例 69/70 · 7.8s（jobs=8，模拟器 387s ⇒ 49×）**，仅 `57-copy-garbage` 留模拟器（见 §6.1）；`--jobs=1` 19.7s、`--source=save` 同源对照 |
| main.lua | ~6700 行 / locals 155；6 条玩法 reducer + 键位收表已接（90→84 次注册、0 重复），全量 70/70 · 376.6s（lead 复跑） |
| 屏幕描述 | 5/6 已纯描述化：board / help / settle / title / preview / roster（合计 ~2650 行、~350 条 headless 断言）|
| 已消灭的重复 | 键位真源 5→1（含发现的第 6 份 `P2_KEYS`）；模板实例化 35 处 → 棋盘部分走 render |
| 已发现的坏域（待修） | 技能 10 条（gravityMult 只读/mark-blink 只 print/SK.cost 0 写/36 句失败文案全死…）；AI 四消射击分支不可达；输入 6 键重复注册/2 条手柄死映射；层序假成功日志（已删） |

**下一步（按依赖排序）**：① core-play 把 play 逻辑接线完毕（stepDown/move/rotate → 重力/锁定 → doLock/clear → spawn/newGame）② core-ai 接 AI（含把不可达的射击分支修成 opt-in）③ input-map 按 `input-wiring-plan.md` 收表（90 次注册→84，6 键重复归零）④ core-skills 接技能并补机制缺口 ⑤ 屏迁移（结算→标题→说明页→角色页→双屏→移动端）⑥ `main.lua` 瘦身成 boot+tick。

## 10. 两条新架构约束（2026-10-31 晚，踩过才写下的）

**10.0 实例上限是全工程总量，不是单个 render 实例的量。**
引擎上限约 **430**（常驻约 240）。每个屏都有自己的 render 实例后，"每个实例都觉得自己才 200~280" —— 而常驻 240 + 说明页 277 = 517 早就越界。
判据落在 `platform`：`P.liveCount()` 记总账（所有实例化路径都收口在内部的 `register()`），`render` 的 R2 守卫拿**总量**判，报错文案写"全工程在场 N（本屏 M）"。
实测：两个 render 合计 400 时，**只建了 100 个的那个实例**也会报 R2。

**10.1 覆盖屏必须用独立 render 实例。**
基础层（棋盘/预览/HUD）是「每帧增量更新同一张 key 表」；覆盖屏（帮助/结算/档案页/标题）是「整屏一次性重建」。
共用一张表时，覆盖屏的 apply 会把基础层节点当成「不在列表里」全部销毁（表现是"开浮层时棋盘偶尔整片消失"，极难归因）。
`app.openOverlay(name, def, nodes)` 已内建两条纪律：**先 clear 再 apply**（说明页 271–289 节点 + 常驻 240 ⇒ 撞引擎上限 430）、**close 只清自己那份**。

**10.2 HUD 文本走服务端 textbox，不能纯描述化。**
`renderHud()` 实际是往 12 个服务端 textbox 里写字符串（`hud`/`hudNext`/`best`/`keyA-C`），而**服务端 textbox 在真机上恒在运行时实例之下**（`SERVER_TEXT_CEILING=0`）。
⇒ 想让 HUD 也吃 `view_layers` 的语义层号，必须先把它换成运行时实例（`view_hud.lua` 里的格式化函数就是为此准备的）；在那之前，HUD 保持现状、`view_hud` 只做文案契约。
**别在没有这个前提的情况下把 HUD 塞进 render.apply** —— 它会和棋盘抢同一张 key 表。

## 11. 键位（2026-10-31 收表结果）

- **一张动作表**：`input_map.lua` 的 22 动作 / 47 键（42 down + 5 up），`INPUT:bindAll(dispatch)` **一次注册**。
- 实测 `listen ok=84 fail=0`（原 90；差的 6 个是 `CraftspersonKey{11,12,13,14,16,30}` 被"技能真动作"与"43 键兜底循环"各注册一次）。兜底池现在由 `fallbackPool()` 从动作表派生（27 条），不再手抄。
- **未接**：触屏 dispatch 仍在 `UI4.dispatch → UI4.runAct`，因为 `act()/coopAllowed()` 用**键盘键名**判 P2 与 coop 越权——直接塞 `touch:left` 会被当越权吞掉。要接必须先改这两个函数的签名（接受"来源"与"键名"两个参数）。

## 12. 服务端 textbox 的层序事实（2026-10-31 帧级实测，纠正旧注释）

**服务端 textbox 在真机上压在运行时实例之上**，不是之下。
取证：结算屏帧 `sk1name` 的 `z=42`，结算卡 `z=51–53`，而 **frame 里 z 小=在上** ⇒ 技能名压着结算卡。
`qxqy/build.mjs:33` 的旧注释「服务端 textbox 永远在下面」只对**结算层那套 container+子 textbox 模板**成立（它们被实例化后是运行时实例），对 `n1` 下的裸 textbox 不成立。

**后果**：遮罩（哪怕是 alpha=255 的 scrim）**盖不住**这些控件，唯一手段是"不让它有内容"。

**踩坑清单（修这个 bug 花了 4 次尝试）**：
1. 逐控件清空（`findIn` / `GetChild`）→ 无效，因为清空动作本身被 `setText` 的 guard 吞了；
2. 写 `FN.skillHud` 早退 → 无效，问题不在写入源；
3. 判定补 `SETTLEV.live` → 必要但不充分（`hide` 本来就是每帧为真的）；
4. 真因 = `setText` 里**并列两条 guard**：①拦非空写入（对）②`if FN.textLayerHidden then return end`（把清空也拦了，错）。
   `syncStage` 每帧置 `textForce=true` 再清，第①条放行、第②条拦回 ⇒ **每帧清、每帧被吞**。

**判据**：同一函数里不要并列两条同义 guard——后加的"放行/例外"会被先加的那条吃掉。要放行就**合并成一条带例外位的判据**。
**定位手法**：探针打在 guard **内部**，把 `hidden / force / value` 一起打出来 —— 一条日志就能分清"没清"与"清了被拦"。

## 13. 文字的两套载体（本项目最重要的一条实现范式）

屏幕上每段文字都可能有两个载体，**职责必须分清楚**：

| 载体 | 谁建 | 层序 | 用途 |
|---|---|---|---|
| 服务端 textbox | `qxqy/build.mjs` 预建，`findIn(root,{name})` 取 | 永远压在运行时实例**之上** | **测试断言读它的 `text`**（`query.control` 只能读它） |
| 运行时实例 | `HUD_INST.build` 用 `stext` 模板实例化 | 受 `view_layers` 语义层号管辖 | **玩家真正看见的那一份** |

**范式**：`setText(ctl, v)` 双写两份 → **textbox 常年 `text=''` 隐藏**（对玩家不可见，但对断言可读）→ 可见性完全交给实例层。
覆盖屏打开时只需让实例层 `clear()`，文字自然消失；**不需要**去"清 textbox"（那正是上一轮 4 次无效修复的坑，见 §12）。

**反例（就是这个 bug 的成因）**：技能列 4 个控件（`sk1name/sk1state/sk2name/sk2state`）只有 textbox、没有实例镜像 ⇒ 它一直真实可见，且永远压在遮罩之上。

## 14. 名单必须单源（六处 → 一处的复盘点）

`main.lua` 里曾有 **6 处**各写一份"要隐藏/要清空/要上架的文字控件名单"：
建实例两段循环、隐藏循环、`layoutDual` 收口、`hideAll/hideStats/showStats` 三张表、`syncStage` 三段清空、进局复位。

**后果**：新增一个文字控件要改 6 个地方；漏一处 = 文字透出 或 双份叠字。这不是靠"仔细"能解决的，是结构问题。

**现在**：唯一名单 `HUD_TEXT`（14 条 × `{name, mirror, hideBox, stats, show}`），全部引用点都是**驱动同一张表的循环**。
判据：新增文字控件只应改 `HUD_TEXT` 一行；若发现自己要再写一份名单，立刻停下改成驱动 `HUD_TEXT`。

---

## 15. 重构目标对账（2026-11-02，39 轮后）

用户 2026-10-31 下达的目标原文：「把 6859 行 main.lua 的屎山重构为干净分层架构，使任意 bug 可在 lua5.3 上秒级复现，同时保持 PC 单人游玩不退化」。

| 目标 | 状态 | 可复算证据 |
|---|---|---|
| 干净分层架构 | ✅ | `core_*` 11 个（纯逻辑，与生产对拍 1400+ 断言）/ `view_*` 11 个（纯描述）/ `platform`（唯一碰引擎）/ `scenes`+`app`（场景栈） |
| 从 6859 行拆出来 | ✅ 部分 | `main.lua` **5700 行**（−1159）；`roster.lua` 581→332；locals 146→**142** |
| 任意 bug 秒级复现 | ✅ | **L0 headless 1523ms / L0.5 用例重放 5278ms**（vs 模拟器全量 ~300s） |
| 场景 lint | ✅ | `view_node.lint` L1–L6（重名/缺模板/低对比/文字放不下/被遮挡/层号过低） |
| PC 单人游玩不退化 | ✅ | 模拟器 **74/74** + 出图 30 张七条机检 + 覆盖屏透出 0 |

### 仍差什么（诚实清单）

1. **`main.lua` 还有 5700 行**：`OnStart` 骨架 1048 行（全文件 18%）没动。摸底报告 `onstart-map.md` 给了 13 段拆分与六条"不能抽"，但真正的重构没做。
2. **场景栈只覆盖 3/6 屏**：help/roster/settle 走 `app.openOverlay`；标题/棋盘/预览/pad 各自持独立实例（渲染驱动方式正确，只是没进记账）。
3. **真机只做了部署没做核验**：地图已写（sha `55a4ffc6`，双址一致），但 `SetImage` 圆角 / 悬停音效 / 层序在真机上**完全未知**。
4. **`app` 不是渲染中枢**：它只做覆盖屏记账（详见 §10 与 `app.lua` 文件头）。曾试图让它接管渲染，结论是**当前 OnUpdate 结构下不成立**。

### 给下一轮的判断依据

- **不要**再尝试"渲染归口到 tick"（已证伪，见 §6 表格与 `app.lua` 头注释）。
- **不要**再给 `app` 加 render/tick/frame（加过，全删了）。
- **要**做的第一件事：真机试玩核验（`.scratch/lead/device-check-ready.md` 有完整步骤与五条判据）。
- **要**做的第二件事：`OnStart` 骨架重构（风险最高，需先读 `onstart-map.md`）。
