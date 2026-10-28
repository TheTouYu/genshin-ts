# 状态机 / 浮层 / 真结算（阶段 3-5）

> 本文件从 SKILL.md 拆出（2026-10-28 模块化，防单文件过长被截断）。
> 主入口 `../SKILL.md` 有索引与「动手前自查清单」；本文件是细节全文。

## 6. 阶段 3：状态机与输入

**状态机（判据式）**
- 状态要有**入口条件 + 退出动作**，且「入场键既开始也执行该动作」（不吞键，手感依赖它）。
- tetris 实测形态：stage0 等开始（玩家方块暂停，脚本 AI 自演）→ stage1 游戏中 → stage2 按 H 看键位表（暂停）→ 失败进结算层。

**帧循环**
- 固定步长：`acc += dt; while acc >= 1/60 do tick(); acc -= 1/60 end`，单帧最多 8 拍（防追帧雪崩）。
- `script:EnableUpdate(true)` **必须显式调用**，否则 `OnUpdate` 根本不派发（`README.md` §4）。
- 暂停 = 停重力/停推进，渲染与输入监听保持。

**键位**
- 官方具名键优先（`KeyboardCraftspersonKey36–39` = ←→↑↓、`KeyboardJumpKey`、`KeyboardCharacterSkill3Key`），比 CraftspersonKeyN 可读。
- 模拟器 `playKey(typeName)` 要**完整枚举名**（`KeyboardCraftspersonKey38Down`）。拼成 `...38DownDown` 时**不报错、不 warn、谁的监听都不命中** ⇒ 整份探针跑出「全静默」的假结论（D589）。
- `playStart()` 之后**先 step ≥ 1 帧**再注入按键；0 帧注入的键会丢（D589）。

**护栏**
- 真机一处抛错**整段死**（后续逻辑全不执行）：所有平台 API 调用包 `pcall`（`main.lua` 里 42 处）。
- 护栏必须**带名日志**：`noteFail('PlayAudio2D', err)`，静默 pcall 等于把故障埋进黑箱（`main.lua:213-214`）。
- 探测 API 存在性时**每种形态都试并逐条打日志**（如 `ServerSignal` 双形态，`main.lua:383-396`）；只试一种会把「形态不对」误判成「没有这个 API」。

**阶段门**：每个键位一条用例 + 状态迁移日志（`guide stage=N`）可读；改一处抛错能靠日志定位到函数名。

## 6.5 真机 Lua 上线三步门（2026-10-27 事故固化，血的教训）

**事故**：给足球线做「Lua 按键 → 服务端信号 → 客户端物理」的技术验证，CLI 侧 `assets:scripts register`
回显成功、挂载条目指向容器节点、`mounts list` 也正确，于是把「按键+物理+HUD」打包压给用户一次试玩。
结果日志里物理图跑了 389 条、**Lua 的 print 一条都没有**——脚本根本没执行，用户看到的是「一个按钮都看不到」。
**技能里早就写着「复制到磁盘 ≠ 真机已加载新代码」，但没有任何一条门要求我先证明脚本活着。**

**三步门（每步都要有可见读数，缺一步不许进玩法层）**：

| # | 门 | 判据 | 不过怎么办 |
|---|---|---|---|
| 1 | 结构在位 | `assets:scripts list` 有 `external=<字节数>`（非 MISSING）+ `mounts` 指向**容器节点** + 宿主控件在**活动布局**的 root9 树里可见 | 查登记表/挂载点/布局归属，别改 Lua |
| 2 | **脚本活着（最小可见证据）** | `OnStart` 第一件事：①写一条 HUD 文案（`c.text=`，官方无 SetText）②`print('[tag] onstart')`；**单独跑一轮**，看到字或日志才算活 | 按嫌疑排序：容器控件未 active/未可见 → 宿主挂载点层级 → 编辑器是否真的重载（f50 盘外写入必须重开地图） |
| 3 | 叠加玩法 | 前两步绿了才加键位/信号/物理；每加一层跑一轮 | 失败层可定位 |

**反向判据（最值钱的一条）**：一轮试玩里**没有** `onstart` 打印 ⇒ **停止推进玩法**，先修宿主。
否则你后面所有失败都分不清「脚本没跑」还是「逻辑错」——这正是本轮的浪费源（用户替我们跑了测试）。

**为什么 UI 文案比 print 更优先**：print 要去翻日志，文案是**用户一眼能看见**的存活信号；
两者都放（文案给人、print 给离线判读），成本几乎为零。

## 7. 阶段 4：运行时浮层（真机差异最大的一节）

浮层 = 运行时 `InstantiateClientUIControl` 出来的结算页/引导页。真机与模拟器在这一节分歧最大，判据按真机事实写。

| # | 事实（真机实测） | 做法 | 出处 |
|---|---|---|---|
| F1 | 开局就建浮层 + 靠隐藏 = 白屏风险 | **懒创建**：第一次需要时才 `pcall(build)`，建完立刻按当前画布摆位 | D581 |
| F2 | `DestroyClientUIControl` 真机**生效** | 用完即销毁；销毁函数**幂等**，重开/退出两个入口都调 | D581/D582 |
| F3 | `SetVisible(false)` 对**运行时实例**真机**不生效**（模拟器生效） | 不用「常驻 + 隐藏」，直接销毁 | D581 |
| F4 | 容器模板：**编辑器新建的**能实例化（拿到子控件）；**GIA 导入产出的**「客户端控件容器」实测 nil | 用编辑器新建的容器当 donor；探测失败退化 | D582（更正 D578） |
| F5 | 运行时实例追加到 children 末尾 = 画得更上面 | 造完立即 `SetAsFirstSibling`；最终顺序 scrim→border→card→文字 | `main.lua:537-541` |
| F6 | 子控件名在模拟器/真机不同 | 用候选名列表 `findIn(node, names)` 取 | `main.lua:348` |
| F7 | 模板探测/取子控件都可能失败 | 兜底：退化成布局横幅结算，永远留一条能用的路 | `README.md` §10.10 |
| F8 | `imageColor` 的 A 通道真机是否被忽略未验证 | 「渐暗」只做在 textbox `fontColor` alpha；image 一次性给终值 | D581 |

**为什么结算要单独一层**：布局内的服务端 textbox 层级**低于**运行时实例，200 个格子永远压在文字上面 ⇒ 文字落进棋盘区就被吃掉。遮罩/面板用 image 实例（父=这一层）才压得住棋盘。

**日志形状（一次试玩就能定位环节）**

```
settle try tpl=<guid> -> nil|ok kids=N title=true   ← 探测
settle build ok n=9 via=container|textbox           ← gameOver 只出现一次
settle destroy n=10                                 ← 按 R 后必须出现
```

判据：开局**不该有**任何 `settle` 行；R 后**必须有** `settle destroy`；若 destroy 打了面板还在 ⇒ 真机连销毁也不生效，下一步改「移出屏幕 + `SetActive(false)`」。

**阶段门**：出图脚本自断言「入场残留 0 / 重开残留 0」；日志三行齐全（D581 的出图验收即此判据）。

## 8. 阶段 5：真结算（信号四份定义，缺一不可）

| # | 定义 | 写法 | 漏了会怎样 |
|---|---|---|---|
| 1 | 信号定义 | `// @gsts:signals` + `defineSignal('tetris_settle', [])` | 编译不到信号，服务端图无法监听 |
| 2 | 服务端图 | `g.server({id}).onSignal(Signal.tetris_settle, …)` → `setPlayerSettlementSuccessStatus(player, Victory)` → `settleStage()` | 结算页不弹 |
| 3 | 图挂载 | 挂到 `kind=entity`（关卡实体） | `--def` 层写了也**不执行**，试玩零日志（D588） |
| 4 | 客户端发信号 | `game.ServerSignal('名'):SendSignal()` | 真机报 `attempt to index a function value`（D585/D588） |

**关键顺序**：**先设状态、后结算关卡**。官方口径「关卡结算状态需要在游玩过程中动态修改，在调用结算关卡节点后，会按各玩家当前的结算状态进行结算」⇒ 反过来状态读不到，等于白设（`docs/ui-tutorial/official-guide-concepts.md` §结算）。

**信号形态双探测**（跨宿主必须）：
- 模拟器：工厂形态 `game.ServerSignal('名'):SendSignal()` 成功；`game.ServerSignal.send('名')` 失败。
- 真机：`ServerSignal` 是**函数**，表形态 `attempt to index a function value`。
- 做法：两条 `pcall` 都试，逐条打日志，都失败才回落旧行为（`main.lua:389-396`）。

**玩家实体从哪来**：`monitor_signal` 事件载荷里**没有玩家字段**（只有 `eventSourceEntity/eventSourceGuid/signalSourceEntity`）⇒ 用 `f.getListOfPlayerEntitiesOnTheField()` → `getListLength > 0n` → `f.getCorrespondingValueFromList(players, 0n)`（两个 demo 已验证的取法，D585）。

**阶段门（写回前必过）**：`tools/explain-gil-node-graph.ts <候选.gil> --graph <id>` 逐行核对三样——① 监听信号名正确 ② `SettlementStatus_Victory(4101)` 字面量在 ③ 玩家参数来源是 `Get Corresponding Value From List`。缺任一条不写回真图（D585）。

**反例**：「挂载成功 graphs=…」的回显看不出挂在哪一层；用 `--def` 挂角色编辑实体，wire 逐字节正确、试玩零日志（D588 的 wire 两面都对，问题在层）。
