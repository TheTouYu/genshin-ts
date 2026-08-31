# 足球 v5 三层架构设计（2026-09 定稿交付）

> 状态：代码已交付，编译验证至 Stage 2（IR）。Stage 3（GIA 生成）待资产前置完成后执行
> （见「资产前置清单」——涉及真实地图写回，需用户确认）。v4 全量保留可回滚。

## 一、架构总览

```
┌─ 使用层 ────────────────────────┐
│ tab 输入（logic.ts 内联）          │  低阶：ball_impulse(vel,spin,mode)
│ 带球决策图 dribble-v5.ts (828)    │  高阶：ball_kick / ball_reset / ball_set_state
│   · CARRIED: 0.12s 决策 loop      │  离散事件走信号；连续流写黑板 impVel（+=）
│   · IDLE: 0.5s 待机获得判定        │
└──────────┬───────────────────┘
           ▼ 信号/黑板
┌─ 逻辑层 logic.ts (825) ────────────┐    ┌─ 渲染层 render.ts (829 新图) ──┐
│ 唯一状态仲裁（ballStateTransition）  │    │ 读黑板 vel/spin → 挂设备         │
│ 唯一积分器（ballPhysTick 族）        │──▶ │ ballVis + ballSpinVis 0.15s 顶替 │
│ phys_loop 0.12s（状态遥控启停）      │黑板 │ render_loop 0.12s（state_changed │
│ 黑板发布：pos/vel/spin/state/goalCount│   │   遥控启停；静止零定时器）        │
└──────────────────────────────┘    └─ render_now 信号 = IMMEDIATE 插队帧 ─┘
```

### 职责边界（与 v4 的本质差异）

| 维度 | v4 | v5 |
|---|---|---|
| 带球图 | 感知+计算+挂设备一体（自持 ballVx/Vz/spinW） | 纯决策：算冲量写黑板，零设备零状态机写入 |
| 速度真相 | 双真相源（两图各自维护，ball_dropped 交接） | 单一真相：黑板（球实体自定义变量），逻辑层唯一写 |
| 谁挂设备 | custody 分治（场/物理链各挂各的） | 渲染层唯一（ballVis/ballSpinVis） |
| 物理 tick 驱动 | 设备停止事件链（5Hz，whenBasicMotionDeviceStops 分发） | phys_loop 0.12s 定时器（3012 双触发级联根除） |
| 空转 | free_heartbeat + 带球 loop 常驻 | 静止 = 全系统零定时器（transition/state_changed 遥控启停） |

## 二、文件清单

| 文件 | 角色 |
|---|---|
| `src/logic.ts`（图 1073741825） | 逻辑层根图（初始化 + ball_reset/ball_set_state 信号入口 + phys_loop/goal_reset 定时器） |
| `src/input.ts`（图 1073741826，**新图**） | 使用层输入图（tab 踢球直调链 + ball_impulse 信号入口；2026-08-31 预算分载拆出——ballApplyImmediate 复合展开 914/实例，多实例同图触发拒载线） |
| `src/render.ts`（图 1073741829，新图） | 渲染层根图（零图变量纯消费者） |
| `src/dribble-v5.ts`（图 1073741828） | 带球决策根图 + 决策拍复合 ballDribbleDecide |
| `src/composites/ball-state.ts` | ballStateTransition（唯一状态写者+循环编排） |
| `src/composites/ball-phys.ts` | 积分器族（分发器+FLY/ROLL/SLIDE/CARRIED 分支+墙碰撞黑板版+IMMEDIATE 路径+复位流程） |
| `src/composites/ball-render.ts` | ballRenderFrame / ballRenderHalt |
| `src/resources/signals.ts` | v5 信号协议（编译后由提取器从地图自动回写） |
| v4 复用（未改） | physics.ts 纯数据复合 / dribble-field.ts 的 getRole+compute / state.ts 的 possessCheck / motion.ts 的 instant |
| v4 退役（*.v4.ts） | game.v4.ts / dribble-field.v4.ts / kick.v4.ts（entries 排除编译，保留回滚） |

**预算分载实测（2026-08-31）**：全部入口挤 logic 单图 → 预测 7448（拒载）；tab+impulse 拆 input 图后
825 预测 622（mainExpanded 1035），四图全部 <2000 生产红线。ball_kick 信号 handler 首版裁撤
（tab 直调链为主路径，信号 def 已注册，外部图需要时加回）。

## 三、信号协议

| 信号 | 参数 | 语义 |
|---|---|---|
| `ball_impulse` | vel,spin:vec3, mode:int(0=DEFERRED/1=IMMEDIATE) | 低阶冲量；IDLE 收到自动升级 IMMEDIATE 唤醒 |
| `ball_kick` | vel,spin:vec3 | 高阶设定式起脚（GOAL 锁忽略） |
| `ball_reset` | — | 瞬移中心+清量+IDLE（幂等） |
| `ball_set_state` | next:int, vel:vec3 | 强制切换（获得请求/判罚）；守卫终审在 transition |
| `state_changed` | prev,next:int | 状态广播（变化才发）；使用方靠它启停循环 |
| `render_now` | — | 逻辑层→渲染层插队帧（IMMEDIATE 路径专用） |

## 四、黑板契约（球实体 1077936135 自定义变量）

| 变量 | 类型 | 写者 | 读者 |
|---|---|---|---|
| pos / vel / spin | vec3 | 仅逻辑层 | 渲染层、全部使用层（只读） |
| state | int | 仅逻辑层（transition 双写图变量+自定义） | 全体 |
| goalCount | int | 仅逻辑层 | UI/使用层 |
| impVel / impSpin | vec3 | 使用层 +=、逻辑层 drain 清零 | 仅逻辑层 |

## 五、状态机（ballStateTransition 守卫终审）

状态：IDLE(0)/FLY(1)/ROLL(2)/SLIDE(3)/CARRIED(4)/GOAL(5)（FREE 更名 IDLE，数值兼容）

守卫：同态跳过（零副作用含 vel）；GOAL 锁（仅放行 →IDLE）；获得守卫（→CARRIED 仅 from 地面态）。
副作用：进运动态=ensureLoop(phys_loop 0.12s 幂等)；进 IDLE/GOAL=停转+清 impVel/impSpin；
vel 交接（kick/脱手传新速，物理内迁移传当前值幂等）；信号先发后双写（防重复求值）。
首拍约定：IDLE 唤醒由调用方在 transition.done 后链 physTick+render_now（防 tick↔transition 递归）；
运动态间迁移不补拍（loop 在跑，渲染设备 0.15s 重叠吸收拍间隙）。

## 六、资产前置清单（⚠ 需用户确认后执行，游戏文件写回）

1. **信号注册**（`assets:signals`）：ball_impulse / ball_kick / ball_reset / ball_set_state / render_now
   五个 def 三件套写入地图 1073741908——**当前 Stage 3 即卡在此**（`signal is not registered: render_now`）。
2. **自定义变量创建**（`assets:custom-variables`）：球实体 1077936135 上 pos/vel/spin/impVel/impSpin
   （vec3×5；state 已存在）。
3. **渲染图挂载**：图 1073741829 创建并挂载到球实体（`assets:node-graphs` + `assets:mounts`）。
4. **注入配置**：gsts.config.ts 的 inject.nodeGraphId 当前为 1073741825（logic）——三图产物
   （logic/render/dribble-v5 三个 .gia）注入流程需按多图方式执行（v4 时代 825/828 两图先例）。

## 七、验证分层（如实）

| 层 | 状态 |
|---|---|
| TypeScript 类型（npm run build 全量） | ✅ 通过 |
| DSL Stage 1（TS→.gs.ts 全部文件） | ✅ 通过 |
| DSL Stage 2（IR .json 三根图） | ✅ 通过（根图入口节点：logic 70 / render 26 / dribble 35；复合展开总数待 Stage 3） |
| DSL Stage 3（GIA） | ⛔ blocked：新信号未注册目标地图（资产清单①） |
| 读图核验（decode-gia 回读执行流） | ⏳ 待 Stage 3 |
| 游戏内行为（手感复测/负载对比） | ⏳ 待注入核验（用户执行） |

## 八、已知取舍与复测项

1. **DEFERRED 一拍延迟**：带球冲量走黑板队列延迟 0.12s；触球拍如需零延迟，二期改发
   ball_impulse(IMMEDIATE)（API 已预留，勿新增通道）。
2. **CARRIED 浮空防御**：vel.y=0 直喂设备，无 grounded 拉回——获得守卫保证从地面态进入，
   残余偏差厘米级；实测浮空则逻辑层补 vy。
3. **获得判定 0.5s 心跳**：IDLE 期待机扫描（开放问题：二期可换命中检测事件零心跳）。
4. **R4 手感参数等价换算**：G 律逐拍差分为冲量（数学等价）；DT 0.2→0.12 与 KW_DECAY 0.99→0.994
   已换算，CARRY_SPIN_GAIN=0.4 折中取值——全部需游戏内复测标定。
5. **statement-order 依赖**：根图 handler 内 helper 连续调用依赖语句序（v4 game.ts 同模式，
   已验证）；ballApplyImmediate 内 sendSignal(render_now) 同样依赖——Stage 3 后 decode-gia 核验链序。

## 九、回滚步骤

1. `git revert` 本系列提交（或手动）：v4 文件改回 `game.ts`/`dribble-field.ts`/`composites/kick.ts`；
2. gsts.config.ts entries 恢复 `['./src']`；
3. signals.ts 恢复 v4 信号集（本仓 git 历史）；
4. 重新编译注入 v4（挂载关系 825/828 未动过，无需资产回滚）。
