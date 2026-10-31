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
| `view_` | 纯视图（state → 节点描述） | `view_board.lua`、`view_settle.lua` |
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
| L0 | headless 单测（纯逻辑/几何/层序/lint） | `lua5.3 tests-lua/run_all.lua` | ~0.03s | 规则、几何、层序、文案、可读性缺陷 |
| L1 | 模拟器用例 | `node qxqy/runner.mjs [子串]` | 387s/70 例 | 真实引擎字段值、交互链路 |
| L2 | 出图 + 人眼 | `node qxqy/shots-v5.mjs --all --out …` | 15s/30 张 | 用户实际看到的画面 |
| L3 | 真机 | `deploy.mjs --device`（破坏性，需确认） | 分钟级 | 真机差异（模板重编号/SetVisible/抛错中断） |

**L0 绿 ≠ L1 绿 ≠ L2 对 ≠ L3 通**。每级只证明本级。

## 7. 迁移路线（strangler：老码逐步被替换，全程可运行）

| 阶段 | 内容 | 判据 |
|---|---|---|
| P0 ✅ | 骨架：`platform` / `view_layers` / `view_node` / `render` / `view_board` + headless mock | `render_board_test` 20/20；与 tests/01 逐值相等 |
| P1 | `core_*` 抽出纯逻辑（rng/pieces/board/score/state/ai/skills-rules） | headless 单测覆盖 + runner 01-06 绿 |
| P2 | 场景机 `scenes.lua`（push/pop 显式栈，替代 helpOpen/MODE 隐式组合） | 任意屏可 headless 进入/退出 + lint 0 |
| P3 | 屏逐个搬到 `scr_*`：标题 → 结算 → 说明页 → 角色档案 → 双屏 → 移动端 | 每屏：runner 对应子集绿 + 出图对比 |
| P4 | `main.lua` 瘦身成 boot + tick（目标 ≤300 行） | `luac5.3 -l -l` locals 大幅下降；全量 70 例 + 30 图绿 |
| P5 | 删除旧模块与死代码 | 全仓无 `InstantiateClientUIControl`（platform 之外） |

## 8. 命名与文案

- 日志字面量是**测试契约**（如 `copy levelup lv=2`、`cellCount=200`）：可以包装，不可改原文。
- 文案真源 = `copy.lua`；角色名/角色元数据只准一份。
- 键位真源 = `input_map.lua`（P4 之前暂在 main.lua，但新增键位不许再散写）。
