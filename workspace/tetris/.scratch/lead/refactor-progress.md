# Tetris v6 重构 · 进度与交接（2026-10-31 18:1x）

> 读者：接手这轮重构的兄弟代理 / 用户复核。规范见 `docs/ARCH.md`，这里是**当前状态与断点**。

## 0. 一句话

架构骨架已落地并在**真实引擎**验证（基线 70/70 绿）；**六个纯逻辑域**已抽出并用「与生产对拍」证明等价（~1200 条 headless 断言，0.05s）；
`main.lua` 的接线正在进行（play 域），屏迁移从结算页开始。**坏域清单已量化到 30+ 条**（grep 级可复验）。

## 1. 已提交（commit 链）

| commit | 内容 |
|---|---|
| `207d01b7` | P0 骨架：`platform`(real/mock 双后端) / `view_layers`(语义层号) / `view_node`(描述+L1–L6 静态检查) / `render`(按层序创建+增量更新) / `view_board`(棋盘几何) |
| `c5dfbeea` | P0.5 棋盘接进真实引擎（删 63 行手写创建）；`scenes.lua` 场景栈（17 断言） |
| `d9e634f2` | `view_kit` 六件套控件工厂（胶囊/键帽/热区/三态；22 断言） |
| `d3995220` | 四路纯核心：`core_rng/pieces/board/state`(71 断言) + `core_ai`(179) + `core_skills`(275) + `input_map/view_pad`(85)；接线第一步（rand/refillBag/collides）+ 删假成功日志 |
| `69b35aec` | 输入单源 + `view_hud` 文案契约(18) + `gate.sh` 验证闸门 |
| `f2ffb17c` | `app.lua` 连接层（场景栈→render→platform + 输入分发，16 断言） |
| `36293bf0` | `core_progress`(193) / `core_roster`(221) / `core_takeover`(145) + ARCH 现状表 |
| `bcf273b2` | `view_settle` 结算页纯描述(46) + 图元通道（圆角胶囊 `setImage`） |

## 2. 关键读数（可复算）

| 项 | 值 | 命令 |
|---|---|---|
| headless 单测 | **16 文件 / ~1250 断言 / 0.05s** | `lua5.3 tests-lua/run_all.lua` |
| 模拟器全量 | **70/70 · 426.3s · exit 0** | `node qxqy/build.mjs && node qxqy/runner.mjs` |
| 验证闸门 | **GATE PASS**（L0+build+L1 子集） | `tests-lua/gate.sh` |
| 模块数 | `lua/tetris/` 30 个文件 | `ls lua/tetris/` |
| headless 用例驱动 | 0.08s/例（保真度未达标，只作定位） | `lua5.3 tests-lua/run_cases.lua 01` |
| main.lua | 6864 → **6703 行**（接线中） | `wc -l lua/main.lua` |

## 3. 在飞任务（每人独占写范围，禁止跨界）

| 谁 | 范围 | 状态 |
|---|---|---|
| core-play | **`lua/main.lua` 独占**：play 域接线（spawn→doLock→stepDown/move/rotate→newGame→hardDrop/tickGravity） | 进行中，已改到 6703 行；每步 build+runner 自验 |
| engine-shim | `tests-lua/engine_shim.lua` / `run_cases.lua` / `json.lua` | 进行中，能跑出精确差异，未达全绿 |
| input-map | 等 main.lua 交回后按 `.scratch/lead/input-wiring-plan.md` 收表（90 次注册→84，6 键重复归零） | 已备好计划；现做 `view_help` |
| core-ai | `core_ai` 的 opt-in 四消射击 + 回归测试 | 进行中 |
| core-skills | `core_effects`（技能 effect 的纯施加层，补 5 条机制断链） | 进行中 |
| view-settle | 结算三键圆角 + `style='pill'|'text'` 支路 + pad 复发守卫 | 进行中 |

## 4. 下一步（依赖序）

1. core-play 交回 main.lua → 跑**全量 70 例** + `shots-v5 --all` 出图（人眼）。
2. input-map 收表（Step 1 只改 6 行 mapped → 可单独提交验证）。
3. 场景栈接线：标题/说明页/结算/角色页/双屏/移动端逐屏搬 `scr_*`，每屏：`view_*` 纯描述 + lint 断言 → runner 子集 → 出图。
4. AI 接线（`core_ai` + `core_takeover`）与技能接线（`core_skills` + `core_effects`），**先补机制再补文案**（坏域清单见 ARCH.md §9 与各模块头注释）。
5. `main.lua` 瘦身成 boot+tick（目标 ≤300 行）。

## 5. 硬约束（踩过的，别再犯）

- 日志字面量是测试契约（154 条去重 `contains`）；改文案=改契约。
- **不 build 跑 runner = 假绿**（runner 读存档里的 Lua 副本）。
- 接线后**删掉兜底分支再看是否仍绿**——否则可能"名接实未接"（core-play 实际抓到过一次）。
- 层序=创建顺序；`SetAsLastSibling` 是空操作（已删掉靠它伪造成功的日志）。
- 服务端 textbox 永远在运行时实例之下；浮层懒创建、用完销毁（`SetVisible(false)` 真机不生效）。
- 双屏只产**一份**描述（render 的 key 是全局表，两份会撞 key）。
- 分工：`main.lua` 单写者制；新模块只新建文件。
