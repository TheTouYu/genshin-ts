// 足球 v5 三层架构 · 状态机公共复合（唯一 state 写者 + 循环生命周期编排）
// 命名前缀：ball_state_*（区别于 v4 的 state_commit：本复合新增定时器启停/速度交接）
//
// 转移表（触发源负责判定"该不该转"，本复合只做合法性终审 + 副作用编排）：
//   触发源                        转移                              vel 参数约定
//   ─────────────────────────────────────────────────────────────────────────────
//   ball_kick 信号（IDLE 起脚）    IDLE → FLY                        新初速（交速+转移一步完成）
//   ball_kick 信号（运动中再踢）    运动态 → FLY                      先 setVel 再转移（同态被跳过无害）
//   ball_impulse 信号（IDLE 唤醒）  IDLE → FLY/ROLL/SLIDE（按速度分流）  冲量叠加后的新速度
//   phys_tick FLY 分支落地         FLY → SLIDE(hSpd>4.5)/ROLL/IDLE   当前 ballVel（幂等回写）
//   phys_tick SLIDE 分支           SLIDE → ROLL(hSpd<2.5)/IDLE       当前 ballVel
//   phys_tick ROLL 分支停          ROLL → IDLE                       零向量
//   phys_tick CARRIED 分支脱手     CARRIED → ROLL                    交接速度
//   phys_tick 各分支进球           非GOAL → GOAL                     当前 ballVel
//   goal_reset 定时器（2s）        GOAL → IDLE                       零向量（复位瞬移由 reset 件负责）
//   ball_reset 信号                ANY → IDLE                        零向量
//   获得判定（驱动方式待定）        IDLE/ROLL/SLIDE → CARRIED          当前球速
//
// 合法性终审（仅两条拒绝路径，其余全放行——物理判定只会在对应分支产生请求）：
//   ① GOAL 锁：from=GOAL 仅放行 to=IDLE（进球期间忽略踢球/冲量，等复位）
//   ② 获得守卫：to=CARRIED 仅放行 from∈{IDLE,ROLL,SLIDE}（空中球不可获得）
//
// 副作用编排（空转治理核心）：
//   同态/非法 → 零副作用（含 vel 不写——运动中改速须走 setVel/冲量，勿依赖本复合）
//   进运动态(FLY/ROLL/SLIDE/CARRIED) → ensureLoop：start_timer('phys_loop', loop, 0.12s)
//     （同名替换幂等：已在跑则刷新、不在跑则启动——静止唤醒的定时器保障）
//   进 IDLE/GOAL → stopLoop + 清冲量队列(impVel/impSpin)：静止=全系统零定时器、日志静默
//   速度交接：黑板 vel := vel（球实体自定义变量，kick/脱手传新速度；物理内迁移传当前值幂等）
//
// 黑板契约（球实体自定义变量，跨图单一事实源）：
//   发布组（仅逻辑层写）：pos/vel/spin/state/goalCount/scored
//   提交组（使用层写、逻辑层 drain 清零）：impVel/impSpin（累积冲量）
//   变量创建清单见 docs/architecture-v5.md（需 assets:custom-variables 落地）
//
// 首拍约定（调用方职责，不在本复合内——根除 tick↔transition 相互调用的递归）：
//   IDLE 唤醒路径（kick/impulse）在 transition.done 后链 physTick + render_now；
//   运动态间迁移不补拍——loop 已在跑，渲染层 0.15s 设备重叠自然吸收 0.12s 拍间隙。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { Signal } from '../resources/signals.js'

// —— 状态枚举（v5 定名：FREE 更名 IDLE——静止=无循环；数值与 v4 兼容，跨图自定义变量共用）——
export const BALL_IDLE = 0
export const BALL_FLY = 1
export const BALL_ROLL = 2
export const BALL_SLIDE = 3
export const BALL_CARRIED = 4
export const BALL_GOAL = 5

const LOOP_NAME = 'phys_loop' // 逻辑层 0.12s 循环定时器（渲染层 loop 自管，不经此）
const LOOP_TICK = 0.5 // 2026-08-31 用户定调降载：0.12->0.5（日志洪泛被踢；恢复手感时同步改回并联动 DT/KW_DECAY/DEVICE_T/RENDER_TICK/DRIBBLE_TICK）

export const ballStateTransition = g.defineComposite('ball_state_transition', {
  inputs: { e: { type: 'entity' }, next: { type: 'int' }, vel: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, next, vel }, f) => {
    const prev = f.getNodeGraphVariable('state').asType('int')

    // —— 守卫（纯数据）——
    // 同态：跳过（不写不发，杜绝重复风暴）
    const same = f.equal(prev, next)
    // GOAL 锁：进球期间仅复位可通行
    const goalLocked = f.logicalAndOperation(
      f.equal(prev, new int(BALL_GOAL)),
      f.logicalNotOperation(f.equal(next, new int(BALL_IDLE)))
    )
    // 获得守卫：空中球（FLY）不可获得
    const toCarried = f.equal(next, new int(BALL_CARRIED))
    const fromGround = f.logicalOrOperation(
      f.logicalOrOperation(f.equal(prev, new int(BALL_IDLE)), f.equal(prev, new int(BALL_ROLL))),
      f.equal(prev, new int(BALL_SLIDE))
    )
    const acquireOk = f.logicalOrOperation(f.logicalNotOperation(toCarried), fromGround)
    const go = f.logicalAndOperation(
      f.logicalNotOperation(same),
      f.logicalAndOperation(f.logicalNotOperation(goalLocked), acquireOk)
    )

    f.doubleBranch(
      go,
      () => {
        // ① 信号先发（prev 在 send 求值时读旧值——放在双写之前，重复求值陷阱防线）
        f.sendSignal(Signal.state_changed, prev, next)
        // ② 速度交接：黑板 vel := vel（实体自定义变量，跨图事实源）
        const sv = f.registerExecNode('set_custom_variable', [e, new str('vel'), vel, new bool(false)])
        // ③ 循环启停（进运动态=ensureLoop 幂等；进 IDLE/GOAL=停转+清冲量队列）
        const toMotion = f.logicalOrOperation(
          f.logicalOrOperation(
            f.equal(next, new int(BALL_FLY)),
            f.equal(next, new int(BALL_ROLL))
          ),
          f.logicalOrOperation(
            f.equal(next, new int(BALL_SLIDE)),
            f.equal(next, new int(BALL_CARRIED))
          )
        )
        f.doubleBranch(
          toMotion,
          () => {
            f.registerExecNode('start_timer', [e, new str(LOOP_NAME), new bool(true), f.assemblyList([LOOP_TICK], 'float')])
          },
          () => {
            const stop = f.registerExecNode('stop_timer', [e, new str(LOOP_NAME)])
            const c1 = f.registerExecNode('set_custom_variable', [e, new str('impVel'), f.create3dVector(0, 0, 0), new bool(false)])
            f.connect(stop, 0, c1, 0)
            const c2 = f.registerExecNode('set_custom_variable', [e, new str('impSpin'), f.create3dVector(0, 0, 0), new bool(false)])
            f.connect(c1, 0, c2, 0)
          }
        )
        // ④ 双写 state（图变量 + 球实体自定义变量——跨图单一事实源）
        const s1 = f.registerExecNode('set_node_graph_variable', [new str('state'), next, new bool(false)])
        const s2 = f.registerExecNode('set_custom_variable', [e, new str('state'), next, new bool(false)])
        f.connect(s1, 0, s2, 0)
        f.outflow('done', s2, 0)
      },
      () => {
        // 同态/非法：零副作用，链自然结束（依赖 done 续链的调用方须感知此语义）
      }
    )
    return {}
  }
})
