# OnStart 段摸底（只读，不改代码）

> 工程 `/home/genshin-ts/workspace/tetris`，`lua/main.lua` **5716 行**（本轮 `DUAL_DECO` 退役后）。
> 读者＝决定"下一轮抽哪段"的人。**本文所有行号来自 `grep -n` 实测锚点**；行数是"锚点区间"的近似值（±几行），不作为精确断言。

## 一、范围与结构

`OnStart` 定义在 **4669 行**，文件尾 **5716**；其后还有 `OnUpdate`（5468 起）与 `OnDestroy`（5715）。**这一段共 1048 行**，占全文件 **18%**，是全仓最后一个"未被 v6 模块化"的大块。

内部函数边界（实测）：

| 行号 | 函数 | 说明 |
|---|---|---|
| 4669 | `OnStart()` | 主体入口 |
| 4876/4905/4910/4916 | `playerTouched / routePlayer / coopAllowed / act` | 输入路由小工具（闭包捕获大量 local） |
| 4961/4990/5003 | `doPlay / actLevel / actRestart` | 动作体 |
| 5064/5081/5089 | `SETTLE_ACT.restart / backHome / detail` | 结算三动作（挂表，避免局部变量） |
| 5124/5132 | `onHelpKey / actDebugFill` | 帮助键、调试填行 |
| 5151–5185 | `UI4.runAct/helpToggle/dispatch/menuMode/focusMove/focusConfirm` | 设备导航回调（挂到 UI4） |
| 5214–5291 | `skillKey / skillFrontName / actSkill1Down / actSkill1Up / actSkill2 / actSkillSwitch / actRoster / actDebugUnlock / anyKeyStart` | 技能与兜底键 |
| 5316 | `dispatch(action, keyName, phase)` | 输入单源派发表 |
| 5393 | `FN.tickInstance` | 每帧实例更新（棋盘/预览/HUD 写值） |
| 5452 | `FN.pollCanvasSize` | 画布尺寸轮询 |
| 5468 | `OnUpdate` | 主循环 |
| 5715 | `OnDestroy` | 空 |

## 二、按功能分段（行号 / 行数 / v6 状态）

| # | 段 | 行号 | 约行数 | 已被 v6 模块替代？ |
|---|---|---|---|---|
| S1 | **装配**：`PT/RENDER_M/VIEW_LAYERS_M/CFG` → `BR/PVW/SETTLEV/HLV/TITLEV` 五个独立 render 实例 + `ROSTER_ENV` 回填 | 4669–4717 | ~49 | **骨架已在模块里**，这里只剩"粘合 20 行"；日志锚 `v6 boot/preview/settle/help/title` |
| S2 | **文字样式基线 + 模板探测 + 背景池 + 棋盘首建**：`applyStyle` 基线、`probeSettleTextbox`、`BR.apply(VB.board{...})`、`cellCount=`、`layout()` 首跑 | 4718–4875 | ~158 | **棋盘已是模块**（`view_board`）；**样式基线/背景池/探针仍手写** |
| S3 | **输入路由工具**：`playerTouched/routePlayer/coopAllowed/act` | 4876–4960 | ~85 | 否（键位表已在 `input_map`，路由体仍在此） |
| S4 | **动作体**：`doPlay/actLevel/actRestart` | 4961–5002 | ~42 | 否 |
| S5 | **结算动作 ①**：`actSettleQ` + 结算明细开关 | 5003–5063 | ~61 | 部分（结算渲染已在 `view_settle`） |
| S6 | **结算动作 ②**：`SETTLE_ACT.restart/backHome/detail` | 5064–5140 | ~77 | 否（动作语义仍在此） |
| S7 | **设备适配 + 导航回调**：`UI4.runAct/helpToggle/dispatch/menuMode/focusMove/focusConfirm` | 5141–5195 | ~55 | 否 |
| S8 | **技能键 + 兜底键**：`skillKey…anyKeyStart` | 5196–5310 | ~115 | 否（技能规则在 `core_skills`，键映射在此） |
| S9 | **输入单源派发表**：`dispatch(action, keyName, phase)` | 5311–5392 | ~82 | **已收表**（表在 `input_map.lua`），这里只剩"动作 → 执行体" |
| S10 | **`FN.tickInstance`**：每帧把状态写进控件（棋盘格/预览/HUD 文字） | 5393–5451 | ~59 | 否（这是渲染驱动的**写值**侧） |
| S11 | **`FN.pollCanvasSize`**：画布尺寸轮询（v5.6 移动端背景溢出的根因修复） | 5452–5467 | ~16 | 否 |
| S12 | **`OnUpdate`**：主循环（计时器/动画/AI tick/浮层同步） | 5468–5714 | ~247 | 否 |
| S13 | `OnDestroy` | 5715–5716 | 2 | 否 |

## 三、最该先抽的三段（按"收益/风险"排序）

### ① S8 技能键 + 兜底键（5196–5310，~115 行）——**首选**
- **收益**：这是 `input_map` 收表后的最后一块"手写键位真源"。抽成"键 → 动作 id"的纯声明，能与 `input_map.ACTIONS` 合并成**一份**，`grep` 一处可查（现在 `actSkill1Down/actSkill2/actRoster/actDebugUnlock` 各自认一个键名）。
- **风险**：函数体依赖 `SK/SKILLS/FN.skillCast/skillKeyUpWatch/keyConsumedFrame` 等 **6 个 local**（`skillKey()` 里还做 `keyConsumedFrame = frameSeq` 的去重）。抽法必须是"声明表 + 注入执行体"（同 `input_map` 模式），不能搬函数体。
- **已踩过的坑**：`skillKey` 的按下/抬起各注册一次（`KeyboardCraftspersonKey{11,12,13,14,16,30}` 曾在 D762 里造成同键双回调），抽的时候要保留 up 语义。

### ② S2 的"样式基线 + 模板探测"（4718–4780 一带，~60 行）——**次选**
- **收益**：模板探测（`TPL_CELL/TPL_TEXT/TPL_HIT`）与样式基线是**每屏共用**的，现在只有 main 里做一次、结果靠 `local` 传递；抽成 `plat_boot.lua`（探测 + 基线 + 探测结果表）后，五个 `view_*` 就有统一的 `templates` 注入面。
- **风险**：**顺序敏感**——探测必须在任何 `R.apply` 之前；`TPL_*` 是 `local`，抽出去要改成"注入一个 templates 表"。另外 `applyStyle` 是**服务端 textbox** 的基线，与 v6 实例层无关，动它要重新出图核对 30 张。
- **判据**：抽完必须保持 `lua compile ok` 与 `main locals` 不增（探测结果从 3 个 local 变成 1 张表反而回收 2 个槽）。

### ③ S12 `OnUpdate`（5468–5714，~247 行）——**收益最大、风险也最大**
- **收益**：它是全文件最后一个"每帧大函数"（247 行），里面混了计时器、动画推进、AI tick、浮层同步、demo 循环；拆开后 `FN.tick*` 才能单独 headless 测。
- **风险**：**闭包捕获最多的 local（G/g/MODE/ACTIVE/MODE_OVER/helpOpen/ROSTER…）**；且它是**每帧都跑**的路径，任何顺序变化都会改变动画/AI 的时序 ⇒ 必须先用"逐帧快照对拍"（同 `core_ai` 的对拍法）证明等价，不能靠 72 个用例绿。
- **建议**：先只抽**纯计算的部分**（计时器递减 + demo 循环选段），不动渲染与输入。

## 四、明确"不能抽"的（依赖 local 作用域或层序）

| 位置 | 为什么不能抽 |
|---|---|
| `TPL_CELL / TPL_TEXT / TPL_HIT` 探测（~4740） | 探测结果存在 **OnStart 内的 local**，全文件有 N 处直接读；抽出去必须整体改成注入，否则出现"看着接线了、其实读到 nil"（D744 同族） |
| 背景池 + wash（~4790） | **层序=创建顺序**：wash 必须最先建，晚建就盖住 HUD；模块化的前提是层号化，这里仍是"先建后建定层序"的原始形态 |
| `act/routePlayer/coopAllowed`（4876–4960） | 三个闭包互相调用且共同捕获 `G/g/ACTIVE/COOP…`，抽出去要带 10+ 注入参数，收益 < 风险 |
| `SETTLE_ACT.*`（5064–5140） | 动作语义与 `settleDestroy/restartMatch/G[2]` 强耦合；`restartMatch` 本身又是 OnStart 内定义 |
| `UI4.*` 导航回调（5151–5185） | 挂到 `UI4` 表上是**输入派发的契约**（`input_map` 的 73 条映射键 finger 名要靠它），搬走会破契约 |
| `OnUpdate` 的渲染驱动部分 | 与 `FN.tickInstance`、层序、实例账本同帧耦合；拆开就失去"一帧内先后"的保证 |

## 五、给下一轮的最小起点（若采纳 ①）

1. 目标文件：新 `lua/tetris/input_keys.lua`（纯表：`{ key, phase, action }`），不新开 main 以外的东西；
2. 先把 S8 的 6 处具名键与 `skillKey` 的双注册**抄成表**（行为不变），跑 `runner 48 52 53 54 55` 证明等价；
3. 再把 `dispatch` 的键名分支改成查表；
4. 判据：`listen ok` 计数不变（用 `engine_shim` 秒级量，见 D757）、`main locals` 不增、全量 72/72。
