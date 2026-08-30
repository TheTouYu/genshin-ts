# 足球状态机重构 · R0 现状盘点与重构方案（待用户确认）

> 状态：**R0 完成，全部决策已确认（2026-08-30），待用户批准后进入 R1**（R0 交付物：状态所有权矩阵 / 状态机判定表 / 图间接口方案 / 文件改动清单）
> 证据分层：本文件所有"现状"结论均来自真实地图读回（.gil 解析/explain/IR 交叉验证）+ 当前源码，非推测；
> 标注【需验证】的为引擎语义未闭合项。
> 权威实现文档后续由 DESIGN.md 同步（见 §5）。

## 实施状态（2026-08-30 R1-R3 代码已完成，编译受并发编译器修复影响暂缓）

- **R1 定稿要点（已按此实现）**：
  1. **状态同步＝轮询检测**（不用 state_changed 信号）：带球图自持 `lastSeenState`，每 tick 对比自定义变量 state，检测到进入 CARRIED → 球速清零重算（轮询延迟 ≤0.12s，机制已在现地图实证）。
  2. **脱脚＝ball_dropped(vel) 信号**（带球图 → 状态机图）：信号在 dribble_field_tick 复合内直接发送（宿主不参与），状态机图写回 ballVel → 提交 ROLLING（速度交接，消灭双真相）。
  3. **单一提交**：状态机图所有迁移经 `state_commit` 复合（图变量 + 自定义变量一次写）或物理 tick 链尾同名提交对；行为图只读。
  4. **物理 tick 自提交**：fly/roll/slide 复合链尾"数据选择 nextState + 单一提交"，**消灭多 outflow 漏写**（R0 铁证 #1 根因）；宿主 whenBasicMotionDeviceStops 只做分发（0→清速 / 1→fly / 2→roll / 3→slide / 4/5→不动），无续链依赖。
  5. **SLIDE 入口补齐**：fly tick 落地按水平速度分派（>4.5 m/s 进 SLIDE）；slide integrate 加自旋向纯滚动收敛（物理定义）；slide tick 补停球/球门/计分/墙。
  6. **GOAL 闭环**：goalNew 数据选择计分 + 提交 GOAL + 复合内启动 goal_reset 2s 定时器（宿主 whenTimerIsTriggered 处理复位）；goalNew 物化到 tmpGoal（scored 写回后再读会重算出 false——重复求值家族防御）。
  7. **输入图删除**：tab 事件由状态机图直接收；football_kick/push/push_req 信号与 dribble.ts 一并删除（死图死链清零）。
  8. **心跳**：free_heartbeat 0.5s 常驻自重启，仅 state==FREE 时做控球判定（1.2m + 球速低 → CARRIED）。
- **已知编译器并发回归（同事在修）**：根图数组字面量参数被转换成 `gsts.f.assemblyList`，在 handler 内访问触发 `gsts.f is only available in server_* ctxType`——已用显式 `f.assemblyList([...], 'float')` 规避（复合内本就如此）；另 `registerExecNode` 参数字面量同样触发 → 根图全部改用 `setNodeGraphVariable`。旧代码在当前编译器同样失败（已实证），非本重构引入。
- **待办**：编译器稳定后重跑编译 → 解码 .gia 核验 → 注入（需用户确认）。

## 注入方案（编译通过后执行；破坏性操作，需用户确认）

### 目标与影响（一次注入两个图，均挂球实体 1077936135）

| 目标 | 动作 | 影响 |
|---|---|---|
| 节点图 1073741825 `_GSTS_game` | 注入 game.gia 覆盖 | 状态机图重写：唯一 state 仲裁 + CARRIED/GOAL + 心跳 + ball_dropped 落地 + 宿主分发（物理 tick 自提交）。注入后游戏需重载地图生效 |
| 节点图 1073741828 `_GSTS_dribble-field` | 注入 dribble-field.gia 覆盖 | 带球图 CARRIED 门控 + 进入复位 + 脱脚信号。原图 whenOnHitDetectionIsTriggered 入口移除（命中检测未开，无影响） |
| 1073741826 `_GSTS_input` / 1073741827 `_GSTS_dribble` | 不注入；尝试 def-clean 清理（若工具支持删图记录则删，否则保留惰性死图） | 未挂载不执行；football_kick/push/push_req 信号 def 被死图引用，一并按残留清理流程处理 |
| 旧复合残留（phys_tick 等被删/改名复合 + 旧 ID 段） | 注入后 diff def 集合 → def-clean --force 残留链 | 防 2026-08-30 拒载事故重演 |

### 命令流程（编译绿后执行）

```bash
# 1. 编译（纯检查）
node ./bin/gsts.mjs -c examples/football/gsts.config.ts --noinject
# 2. 备份 + 注入（写回前快照；skipSafeCheck 已配置）
node ./bin/gsts.mjs -c examples/football/gsts.config.ts
# 3. 注入后核验清单（2026-08-30 纪律，逐项勾对）
npx tsx tools/check-gil-composite-refs.ts <地图.gil> --incoming examples/football/dist/src/game.gia
npx tsx tools/check-gil-composite-refs.ts <地图.gil> --incoming examples/football/dist/src/dribble-field.gia
npx tsx tools/parse-gil-node-graph.ts <地图.gil> --list        # 复合目录 0 残留
npx tsx tools/scan-gil-var-pins.ts <地图.gil>                  # 变量 pin 全完整
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph 1073741825   # 状态机分发链读回
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph 1073741828   # 带球门控链读回
# 4. 残留清理（如有）：def-clean --force --output 候选 → 回读 → --write
# 5. Temp 同步 + SHA 记录
```

### 用户侧核验（注入后）

1. 重载地图：走近球（1.2m 内）→ 球进入 CARRIED 自动吸附（≤0.5s 心跳延迟）
2. 带球：贴地（y≈0.25）跟手、转向跟手、停球也停
3. 射门 9 选项（1-8 施力 / 9 复位）+ 飞行弧线 + 落地高速 → SLIDE 段（日志验证 state=3 出现）
4. 进球：计分 + GOAL 停球 2s 自动回罚球点
5. 脱脚：急停甩球 / 跑远 → 球脱离滚动（ball_dropped 信号 → ROLLING）
6. 提供 Beyond_Debug_Log（.gia）→ 帧值分析：state 时间线（FREE→CARRIED→FLYING→…→FREE 闭环）、球 y、dribble-field 无抢驱动、单 tick 负载

## 决策记录（2026-08-30 用户确认）

| # | 决策点 | 结论 |
|---|---|---|
| 1 | SLIDE 去留 | **保留**，按物理定义设计（滑-滚过渡模型，见 §2.3） |
| 2 | CARRIED 判定通道 | **范围查询为主**（状态机 FREE 心跳 0.5s，1.2m + 球速低）；命中检测后续打开兜底 |
| 3 | 输入图形态 | **B：删除输入图**（tab 事件由状态机图直接收，football_kick 信号/死图一并处置） |
| 4 | 第 9 选项语义 | **保留复位**（停球语义并入 CARRIED 脱脚） |
| 5 | GOAL 闭环 | **新增 GOAL 状态 + 2s 自动复位**（2026-08-30 补确认） |

## 0. 资产快照（2026-08-30 真实地图读回）

| 项 | 值 |
|---|---|
| 生产地图 | `Beyond_Local_Save_Level/1073741908.gil`（SHA-256 `75fddb74…dc13`，450641 B，08-30 07:38 导出） |
| 主图 | 1073741825 `_GSTS_game`（20 节点）· 1073741826 `_GSTS_input`（2 节点）· 1073741827 `_GSTS_dribble`（23 节点）· 1073741828 `_GSTS_dribble-field`（16 节点） |
| 挂载 | 球实体 1077936135 → `_GSTS_game` + `_GSTS_dribble-field`；**`_GSTS_input`、`_GSTS_dribble` 未挂载（死图）**；操作台实体 1077936137 已不存在 |
| 复合目录 | 21 个游戏复合（1610700000-20，缺 0007=已删 phys_roll_friction 的空位）+ 4 个旧段复用（2000000000 motion_by_vel / 2000000001 motion_spin / 2000000002 motion_instant / 2000000003 phys_integrate）+ 9 个信号 def（football_kick / football_push / football_push_req 各 3） |
| 信号实况 | football_kick 发送 1 / **监听 0**（死链路）；football_push 发送 2 / **监听 0**（game.ts 空 handler 被编译丢弃）；football_push_req 监听 1 / 发送 0 |
| 健康度 | scan-gil-var-pins：28 图 181 变量节点全部完整；check-gil-composite-refs：20 impl 图 0 悬空 |
| 预算 | implTotal = **641**（真实地图含旧段 impl）；主图 20/2/23/16；远低于红线（implTotal<3000、单图≤2000） |
| 编译基线 | `node ./bin/gsts.mjs -c examples/football/gsts.config.ts --noinject` ✅ 3 GIA 全出，无 E_；**3 条 warning：重复 outflow 名 done（phys_tick/phys_fly_tick/phys_roll_tick 多 outflow 只有 done[0] 被消费）** |

## 1. 现状盘点：状态所有权矩阵（state 同步全路径）

### 1.1 状态枚举与双存储

- **图变量 state**（`_GSTS_game` 内，物理权威）：0=FREE / 1=FLYING / 2=ROLLING / 3=SLIDE
- **球实体自定义变量 state**（跨图共享，带球图读）：由 `_GSTS_game` 4 处镜像写入
- 初始值：自定义变量 state = int 默认 0（f13 空载荷=默认值，envelope 里的 3 是类型码 int，不是值；注意 scan-gil-custom-variable-candidates 对 envelope 形态会误显 3，属工具判读注意项）

### 1.2 矩阵

| state | 图变量写者（game 图内） | 写时机 | 自定义变量镜像写者 | 镜像是否同步 | 读者 | 漏写风险 |
|---|---|---|---|---|---|---|
| FREE(0) | kickReset（tab9）；physFlyTick stop 分支；physRollTick stop 分支 | 事件链内 | game n=6（复位）；game n=21（physTick 后） | n=21 **只在 physTick outflow[0]（FREE 分支）执行** ✓ | dribble-field 门控（==0 才驱动）；game tab 分支（==0 才 launch）；physTick 分发 | 复位/自然停球时同步 OK |
| FLYING(1) | kickLaunch；kickApplyImpulse；physFlyTick 继续/反弹分支 | 事件链内 | game n=12（launch）、n=14（impulse） | ✓（tab 事件时直接写） | physTick 分发；game tab 分支（!=0 → impulse）；dribble-field 门控（停手） | 飞行中经 physTick 的状态再确认不镜像（值不变时无害） |
| ROLLING(2) | physFlyTick 落地；physSlideTick 降速；physRollTick 继续 | 事件链内 | **无直接镜像**（全指望 n=21） | **✗ 不同步** | physTick 分发 | **ROLL→FREE 停止时镜像不更新（核心断点，见 1.3）** |
| SLIDE(3) | physSlideTick 继续 | 事件链内 | 无 | ✗ | physTick 分发 | **无任何入口写 3（kickLaunch 恒写 1）→ 不可达死分支**；若进入则镜像永不更新 |
| CARRIED(4) | 不存在（未实现） | — | — | — | — | 缺失状态：带球=state0 的隐式软契约 |
| GOAL(5) | 不存在（计分内联在 physFlyTick/physRollTick） | — | — | — | — | 缺失状态：无进球→2s→复位闭环 |

### 1.3 铁证：状态同步漏写点 #1（软契约失效根因之一）

- IR（game.json）：phys_tick 复合 def 的 4 个 outflow 声明顺序 = FREE(0)/FLY(1)/SLIDE(2)/ROLL(3)（compositePins 外 pin0←set ballVel、pin1←fly_tick、pin2←slide_tick、pin3←roll_tick）；调用点 `next: [{node_id: 21, source_index: 0}]` 只消费 outflow[0]。
- 真实地图（parse --json）：复合调用节点 19 只有 OutFlow index 0（composite_pin_index 8）连到 n=21；另外 3 个 done pin（9/10/11）**悬空**。
- 引擎语义（项目 2026-08-27 实证，见 motion.ts 注释）：未接线的 outflow 分支下游丢失。
- **结论：每次物理 tick 只有"FREE 分支"会执行 n=20/21 的自定义变量镜像；FLY/ROLL/SLIDE tick 全部不镜像。** 实际后果链：
  1. 射门（tab）→ 自定义变量=1（n=12 直写）→ 飞行/滚动全程镜像停在 1 → dribble-field 持续停手（6b81f94 的"不抢驱动"在此阶段是好的）；
  2. 球滚停 → 图变量 state=0（physRollTick stop 分支）→ 但 outflow[3] 悬空 → **镜像仍=1**；
  3. **球静止后带球图永远不恢复驱动，直到按 tab9 复位**（踢球仍可用，因为 tab 分支读的是图变量）。
- 源码意图（game.ts 注释"物理 tick 后 state 可能变化，同步到球自定义变量"）与编译/注入产物**不一致**——这就是"编译通过 ≠ 注入正确"的又一实例，也是重构必须消灭的软契约形态。

### 1.4 其他现状证据（根因清单）

| # | 问题 | 证据 | 归属 |
|---|---|---|---|
| 2 | **速度双真相**：game 图变量 ballVel vs dribble 图自持 ballVx/ballVz 互相独立 | 源码 + 真实图（两图各有自己的图变量） | 带球↔物理切换时速度历史断裂；CARRIED→ROLLING 无速度交接 |
| 3 | **运动器跨图叠加**：dribbleCtrl(0.12s) 与 physics(0.2s) 在 0→1 转换窗口最多 0.12s 并发（不同名叠加是引擎行为） | kick.ts 注释（唯一名冲量叠加实证）+ 双图各自 startTimer/运动器 | 物理回归残留：踢球瞬间视觉跳变 |
| 4 | **死图**：_GSTS_input（football_kick 无监听）、_GSTS_dribble（未挂载，push 链断） | mounts list + scan-gil-signals | 清理或复用，减少"图里有人写没人读" |
| 5 | **死写**：dribble_field_tick 写自定义变量「速度」，全图无读者（参考版遗留） | explain dribble_field_tick n=9 | 移除或改用途 |
| 6 | **SLIDE 不可达**：SLIDE_ENTER_SPEED/SLIDE_DECEL 常量在，但 kickLaunch 恒写 state=1，physFlyTick 不可能产生 3 | 源码 + 真实图 | 判定表决策点（见 §2） |
| 7 | **GOAL 非状态**：goalCount/scored 内联在 physFlyTick/physRollTick，无 GOAL 状态、无 2s 复位 | 源码 + 真实图 | 任务目标 4（加状态易） |
| 8 | **命中检测未开**：球实体无命中检测组件配置，whenOnHitDetectionIsTriggered 兜底未生效 | 源码注释 + 地图无组件记录 | CARRIED 判定通道决策点 |
| 9 | **文档分叉**：DESIGN.md §12.5 状态枚举（0/1/2/3 含 CARRIED=3）与实现（0/1/2/3 无 CARRIED，3=SLIDE）不一致；DESIGN 说弹簧场、实现是速度场；DESIGN 第 9 选项=停球、实现=复位；PROGRESS.md 停在 08-23 未记录 08-28/08-30 | 文档 vs 源码 vs 真实图三方对照 | R5 同步 |

## 2. 状态机判定表草案（FREE / CARRIED / FLYING / ROLLING / [SLIDE] / GOAL）

### 2.1 建议状态枚举（v2）

`state: 0=FREE / 1=FLYING / 2=ROLLING / 4=CARRIED / 5=GOAL`（3 号位让给旧 SLIDE，避免历史值歧义；最终编号 R1 定稿）

### 2.2 转换判定表

| 当前 | 条件 | 目标 | 判定/触发方 | 备注 |
|---|---|---|---|---|
| FREE | 球静止（|v|<0.3）且 ∃角色 dist≤1.2m（范围查询） | CARRIED | 状态机图（FREE 心跳 0.5s 低频轮询，符合负载铁律） | 命中检测后续打开做兜底；判定频率与 dribble 0.12s tick 解耦 = 「双节拍协同」待验证项 |
| CARRIED | 收到 football_kick(tabId)（选项施力） | FLYING | 状态机图（唯一仲裁） | 初速/初旋表覆盖（现有 kickApplyForce 语义） |
| CARRIED | 脱脚：球距锚点>1.5m 或 球速>玩家速×1.5（持续 N tick） | ROLLING | 带球图发 ball_dropped(vel) 信号 → 状态机图落地 | 速度交接：vel 随信号 payload 传入，状态机图写入 ballVel（消灭双真相） |
| CARRIED | tab9 复位 | FREE | 状态机图 | 复位点 + 清速度/旋转 |
| FLYING | 贴地 且 |vy|<1.0 且 水平速度 ≤ SLIDE_ENTER_SPEED(4.5) | ROLLING | 状态机图 physFlyTick | 保留现有 ROLL_BOUNCE_VY 语义 |
| FLYING | 贴地 且 |vy|<1.0 且 水平速度 > SLIDE_ENTER_SPEED(4.5)（高速落地打滑） | SLIDE | 状态机图 physFlyTick | **新增入口**（物理定义：高速落地先滑后滚） |
| FLYING | |v|<0.3 且贴地 | FREE | 状态机图 physFlyTick | 保留 |
| SLIDE | 水平速度 < SLIDE_TO_ROLL_SPEED(2.5)（自旋收敛至纯滚动） | ROLLING | 状态机图 physSlideTick | 保留现有 |
| SLIDE | |v|<0.3 | FREE | 状态机图 physSlideTick | 新增 stop 判定（与飞/滚一致） |
| SLIDE | 收到 football_kick（运动中施力） | FLYING | 状态机图 | 保留 impulse 语义 |
| ROLLING | |v|<0.3 | FREE | 状态机图 physRollTick | 保留 |
| ROLLING/FLYING | 运动中施力（football_kick 且 state!=0/4） | FLYING | 状态机图 | 保留 impulse 语义（可选项，R1 确认是否保留） |
| FLYING/ROLLING | 门线判定（|x|>52.75 且 |z|<3.29 且 y<2.19） | GOAL | 状态机图 | 计分 + 进 GOAL 状态 |
| GOAL | 2s 定时器到 | FREE(复位点) | 状态机图 | 新实现（DESIGN 语义补全） |
| any | tab9 复位 | FREE | 状态机图 | 保留 |

### 2.3 SLIDE 保留 + 物理定义设计（2026-08-30 用户确认"按物理上的定义来设计"）

**物理定义（滑-滚过渡）**：球贴地运动时接触点存在滑移（滑移率高）即"滑动"：
- 滑动阶段：滑动摩擦力做负功 → 线速度强减速（SLIDE_DECEL=6.0）+ 摩擦力矩把自旋向"纯滚动"收敛（ROLL_SPIN_GAIN=0.5）；
- 纯滚动阶段：线速度与自旋满足 v = ω×R（滑移率≈0）→ 转 ROLLING（ROLL_DECEL=3.0 匀减速 + 自旋保持纯滚动关系）；
- 静止：动能耗尽 → FREE。

**引擎可实现判定（沿用现有常量，只补入口）**：
1. **入口**：FLYING 落地（贴地且 |vy|<1.0）时按水平速度分派——>4.5 m/s 进 SLIDE（高速落地必然打滑），否则 ROLLING；贴地状态受水平冲量（kickApplyImpulse 水平分量）致速度 >4.5 也可进 SLIDE（R1 定稿，避免过度复杂）。
2. **维持**：physSlideTick 现有逻辑（SLIDE_DECEL 强减速 + spin 衰减 + 转滚判定）。
3. **出口**：速度 <2.5 → ROLLING（现有）；|v|<0.3 → FREE（新增 stop 判定，与飞/滚一致）；受施力 → FLYING（现有 impulse）。
4. **状态同步**：SLIDE 迁移必须走状态机图单一 commit（§1.3 镜像漏写修复后自动覆盖，不再依赖 outflow 布线）。

**现状铁证（为什么现在是死分支）**：无任何入口写 state=3（kickLaunch 恒 1；physFlyTick 落地恒 2/0；仅 physSlideTick 自持 3）——常量早已为物理模型备好（SLIDE_ENTER_SPEED/SLIDE_DECEL/SLIDE_TO_ROLL_SPEED），只缺入口分派。

**【需验证】** 用户提供 Beyond_Debug_Log 后查 state 时间线确认落地速度实测值（14~24 m/s 射门落地时水平速度通常 >4.5，预期出现 SLIDE 段），再校准阈值。

## 3. 图间接口设计

### 3.1 三种通道对比（引擎能力，非猜测）

| 通道 | 作用域 | 语义 | 适合 | 不适合 |
|---|---|---|---|---|
| 图变量 get/set_node_graph_variable | **单图内** | 图内共享、即时 | 单图内的物理中间量（ballPos/ballVel 等） | **跨图**（dribble 图读不到 game 图变量——当前速度双真相的根源） |
| 自定义变量 get/set_custom_variable | **实体级，跨图共享** | 持续状态、可轮询 | 唯一事实源 state、carriedBy(entity)、可带速度镜像 | 事件通知（无"变化事件"语义，靠轮询） |
| 信号 sendSignal/onSignal | **全局，事件驱动** | 一次性携带 payload，异步送达 | 命令（football_kick(tabId)）、状态迁移通知（state_changed(prev,next)）、脱脚（ball_dropped(vel)） | 持续状态轮询（没有"当前值"概念） |

### 3.2 推荐方案（R1 定稿前先按此设计）

1. **state（唯一事实源）＝球实体自定义变量 int**：只允许状态机图（_GSTS_game）写入；所有行为图只读。写路径收敛为单一"commit state"节点（链尾统一 set_custom_variable），消灭多 outflow 漏写（1.3 根因）。
2. **状态迁移通知＝信号 `state_changed(prev:int, next:int)`**：状态机图每次 commit 后发送。带球图/未来接球图靠它做"进入 CARRIED 时快同步"（如从共享镜像初始化 ballVx/ballVz、清除节流计数），不用轮询猜迁移。
3. **速度交接**：CARRIED 期间带球图自持球速（图变量），**不写**共享 state；脱脚时经 `ball_dropped(vel:vec3)` 信号把速度交给状态机图写回 ballVel；射门初速由 kick 表全量覆盖。这样任意时刻球速只有一个真相。
4. **命令＝信号**：football_kick(tabId) 已是现成通道（输入图→状态机图），复用；football_push/push_req 死链随死图一并处置（删或复用为接球）。
5. **carriedBy（多人预留）＝球实体自定义变量 entity**：状态机图写、带球图读（DESIGN §12 已确认 entity 类型可用）。
6. **双节拍协同（状态机心跳 + 带球图 0.12s tick）语义【需验证】**：FREE 心跳 0.5s 判定进入 CARRIED、带球图 0.12s 持续驱动、信号事件异步送达——三者同帧/跨帧顺序尚无铁证。R1 先做最小实验（状态机图 0.5s 心跳写 state、带球图 0.12s tick 读 state + 日志帧值验证 state 变化时间线），闭合后再全量落地。

## 4. 文件改动清单（R2–R5，待确认后实施）

### 4.1 图 ID 与挂载方案（当前 4 图 → 目标 3~4 图）

| 图 | 现状态 | 目标职责 | 动作 |
|---|---|---|---|
| 1073741825 `_GSTS_game` | 状态机+物理+输入混合 | **状态机图（唯一 state 仲裁者）**：状态判定表 + physTick 分发 + kick 执行 + commit state + 信号收发 | 改（R2/R3） |
| 1073741826 `_GSTS_input` | 死图（未挂载） | **删除**（已确认 B）：tab 事件由状态机图直接收 | R3：源码 input.ts 早已不存在，仅清理地图内残留图 + football_kick 信号 def（def-clean） |
| 1073741827 `_GSTS_dribble` | 死图（未挂载，push 链断） | 释放复用：接球图（FLYING 命中→CARRIED）或删除 | 删源码+def 清理 或 改造（R3/R4） |
| 1073741828 `_GSTS_dribble-field` | 带球（state==0 驱动） | **带球图（只在 CARRIED 驱动）**：速度场算法不动（用户认可手感），门控改 state==CARRIED，加入口快同步/脱脚信号 | 改（R3） |

### 4.2 源码文件

| 文件 | 动作 |
|---|---|
| `examples/football/src/game.ts` | 改：状态机图瘦身（输入段视 4.1 决策移出/保留）；physTick 后镜像修复（单一 commit 节点）；接收 football_kick/ball_dropped；GOAL 状态 + 2s 复位；踢球只从 CARRIED/FREE 允许 |
| `examples/football/src/composites/physics.ts` | 改：phys_tick/phys_fly_tick/phys_roll_tick 收敛为**单 outflow**（消灭重复 done 警告与漏写）；**补 SLIDE 入口**（fly tick 落地按水平速度分派 SLIDE/ROLL；slide tick 加 stop 判定）；goal 判定提为状态迁移；移除未用 physRollFriction |
| `examples/football/src/composites/kick.ts` | 改：kickLaunch 首段积分保留；状态写入收敛（不再各自 set state，由状态机图 commit） |
| `examples/football/src/composites/dribble-field.ts` | 改：门控 state==CARRIED；进入 CARRIED 快同步（从共享镜像初始化 ballVx/ballVz）；脱脚检测 → 发 ball_dropped(vel)；删除死写「速度」或改为共享镜像 |
| `examples/football/src/dribble-field.ts` | 改：监听 state_changed / ball_dropped 相关入口 |
| `examples/football/src/input.ts` | 新建（若 4.1 选 A）：whenTabIsSelected → football_kick(tabId) |
| `examples/football/src/dribble.ts` | 删（若 1073741827 释放）或改造为接球图 |
| `examples/football/src/resources/signals.ts` | 改：新增 state_changed(prev,next) / ball_dropped(vel)；删除或保留 football_push 族 |
| `examples/football/gsts.config.ts` | 改：nodeGraphId 指向不变（1073741825）；如复活输入图无需改（1073741826 已存在）；skipSafeCheck 按图确认 |
| `examples/football/DESIGN.md` / `PROGRESS.md` | 改（R5）：状态枚举/判定表/接口/第 9 选项语义/速度场 vs 弹簧场二选一（**推荐速度场**：用户认可手感且已实现） |
| `docs/game-engine-knowledge/` | 按需：新增"状态机图唯一仲裁 + 双节拍协同"结论（R1 实验闭合后） |

### 4.3 注入与核验流程（每次注入后必跑，2026-08-30 纪律）

1. `node ./bin/gsts.mjs -c examples/football/gsts.config.ts --noinject` 编译（3 图全出，0 E_，0 重复 outflow 警告）
2. 注入（破坏性，先展示目标+影响，用户确认）
3. `check-gil-composite-refs --incoming <各.gia>` 0 悬空 + 无类型错位
4. `parse-gil-node-graph --list` 复合目录 0 残留（(1) 后缀/旧 def）；diff def 集合（旧版本残留 def-clean --force 整体删）
5. `scan-gil-var-pins` 全完整
6. `explain` 读回执行流（状态机分发链/commit 链/带车图门控链完整）
7. 预算：implTotal<3000、单图 gameNodeCount≤2000（当前 641，余量充足）
8. 用户游戏核验：带球贴地跟手 / 射门弧线 / 复位 / 停球脱脚 + Beyond_Debug_Log 帧值（state 时间线、球 y≈0.25、dribble-field 无激活运动器）

### 4.4 轮次安排（依确认结果微调）

- R1：接口/判定表定稿 + 双节拍最小实验（日志铁证）
- R2：状态机图落地（含 commit 修复、GOAL、SLIDE 处置）→ 编译/注入/读图核验
- R3：带球图 CARRIED 化 + 输入图形态 + 死图清理 → 编译/注入/读图核验
- R4：全链路回归（9 选项/复位/带球/进球 + 日志帧值）
- R5：DESIGN/PROGRESS/PKC 同步 + 复盘

## 5. 决策与后续

### 5.1 已确认（2026-08-30）

1. **SLIDE 保留**，按物理定义设计（§2.3）。
2. **CARRIED 判定**：范围查询为主（状态机 FREE 心跳 0.5s，1.2m + 球速低），命中检测后续打开兜底。
3. **输入图删除**（B）：tab 事件由状态机图直接收；1073741826 图 + football_kick 信号 def 清理。
4. **第 9 选项保留复位**；停球并入 CARRIED 脱脚语义。
5. **文档定调**：带球流派定为**速度场吸附**（用户认可手感），DESIGN.md §5.3 弹簧场段改为已废弃/历史记录。

### 5.2 已确认（补）

- **GOAL 闭环**：进球 → GOAL 状态 → 2s 自动回罚球点（新增，2026-08-30 用户确认）。

### 5.3 R1 起始任务（确认后）

1. 双节拍最小实验：状态机图 FREE 心跳 0.5s 写 state、带球图 0.12s tick 读 state + 日志帧值验证 state 变化时间线（闭合"状态机心跳 + 行为图事件驱动"协同语义）。
2. 状态机判定表定稿（含 SLIDE 阈值校准点、GOAL 确认）。
3. 接口定稿：state_changed/ball_dropped 信号 + 自定义变量读写清单（§3.2 细化到节点级）。
