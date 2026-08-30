// 足球状态机图（挂球实体 1077936135，图 1073741825）——唯一 state 仲裁者
// 状态机唯一仲裁：state 只有本图写入（stateCommit 复合 / 物理 tick 复合内的提交对），
//   行为图（dribble-field 1073741828）只读球实体自定义变量 state，仅在 CARRIED 驱动。
// 状态枚举：0=FREE 1=FLYING 2=ROLLING 3=SLIDE 4=CARRIED 5=GOAL
// 职责：
//   - 输入：whenTabIsSelected（tabBar 挂球本体，1-8 施力 / 9 复位）
//   - 物理：whenBasicMotionDeviceStops → 宿主分发 FLYING/ROLLING/SLIDE tick（各 tick 自提交状态）
//   - 控球：free_heartbeat 0.5s 常驻自重启，仅 state==FREE 时做范围判定 → CARRIED
//   - 脱脚：带球图发 ball_dropped(vel) 信号 → 本图写回 ballVel 后转 ROLLING
//   - 进球：物理 tick 内检测 goalNew → 计分 + 提交 GOAL + 启动 goal_reset 2s 定时器 → 复位
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str, vec3 } from 'genshin-ts/runtime/value'
import { kickApplyForce, kickApplyImpulse, kickLaunch, kickReset } from './composites/kick.js'
import { physFlyTick, physRollTick, physSlideTick } from './composites/physics.js'
import { stateCommit, statePossessCheck } from './composites/state.js'
import { dribbleFieldGetRole } from './composites/dribble-field.js'
import { Signal } from './resources/signals.js'

// 场地中间（复位点）
const CENTER_X = 0
const CENTER_Y = 0.25 // = BALL_R
const CENTER_Z = 0

// 状态常量（判定表，与 physics.ts 对齐）
const STATE_FREE = 0
const STATE_FLY = 1
const STATE_ROLL = 2
const STATE_SLIDE = 3
const STATE_CARRIED = 4
const STATE_GOAL = 5

const HEARTBEAT = 0.5 // FREE 控球判定心跳（s，低频轮询；常驻自重启，仅 FREE 时干活）
const GOAL_RESET_S = 2 // 进球后复位延时（s，与 physics.ts 常量一致）

const graph = g
  .server({
    id: 1073741825,
    variables: {
      // 球物理状态（单一事实源：积分链只维护变量，运动器只做视觉插值）
      ballPos: new vec3([CENTER_X, CENTER_Y, CENTER_Z]),
      ballVel: new vec3([0, 0, 0]),
      ballSpin: new vec3([0, 0, 0]),
      // 单 tick 内物化快照（防二次求值）
      tmpPos: new vec3([0, 0, 0]),
      tmpVel: new vec3([0, 0, 0]),
      tmpSpin: new vec3([0, 0, 0]),
      tmpGoal: new bool(false), // 进球判定物化快照（scored 写回后再读 goalNew 会重算出 false）
      state: new int(0), // 0=FREE 1=FLYING 2=ROLLING 3=SLIDE 4=CARRIED 5=GOAL
      impulseSeq: new int(0), // 运动中冲量运动器的唯一名自增序号
      scored: new bool(false), // 进球去重（复位时清零）
      goalCount: new int(0),
      _init: new bool(false) // 心跳只启动一次
    }
  })
  // ================================================================
  // 启动：FREE 心跳（whenEntityIsCreated，场景实体加载创建时触发）
  // ================================================================
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    const init = f.getNodeGraphVariable('_init').asType('bool')
    f.doubleBranch(
      init,
      () => {},
      () => {
        f.setNodeGraphVariable('_init', new bool(true), false)
        // 显式 assemblyList（规避编译器根图数组字面量 → gsts.f 的 ctx 回归）
        f.startTimer(f.getSelfEntity(), 'free_heartbeat', false, f.assemblyList([HEARTBEAT], 'float'))
      }
    )
  })
  // ================================================================
  // 输入：选项施力（tabBar 挂足球本体）——1-8 施力，9 复位
  // 状态机唯一仲裁：施力目标状态一律经 stateCommit 提交
  // ================================================================
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const tabId = evt.tabId
    f.doubleBranch(
      f.equal(tabId, 9n),
      () => {
        // 复位：任何状态 → FREE
        const kr = f.callComposite(kickReset, { e: ball })
        const sc = f.callComposite(stateCommit, { e: ball, next: new int(STATE_FREE) })
        f.connect(kr as never, 0, sc as never, 0)
      },
      () => {
        const state = f.getNodeGraphVariable('state').asType('int')
        // 静止/带球 → 完整施力；飞行/滚滑/滑动 → 冲量叠加；GOAL → 忽略施力
        f.doubleBranch(
          f.logicalOrOperation(f.equal(state, 0n), f.equal(state, 4n)),
          () => {
            const ka = f.callComposite(kickApplyForce, { tabId })
            const kl = f.callComposite(kickLaunch, { e: ball })
            f.connect(ka as never, 0, kl as never, 0)
            const sc = f.callComposite(stateCommit, { e: ball, next: new int(STATE_FLY) })
            f.connect(kl as never, 0, sc as never, 0)
          },
          () => {
            f.doubleBranch(
              f.equal(state, 5n),
              () => {},
              () => {
                const imp = f.callComposite(kickApplyImpulse, { e: ball, tabId })
                const sc = f.callComposite(stateCommit, { e: ball, next: new int(STATE_FLY) })
                f.connect(imp as never, 0, sc as never, 0)
              }
            )
          }
        )
      }
    )
  })
  // ================================================================
  // 物理：运动器停止事件链驱动（5Hz）——宿主分发，tick 复合自提交状态
  // 只响应 physics（直线运动器）停止，忽略 spin（旋转运动器）停止
  // ================================================================
  .on('whenBasicMotionDeviceStops', (evt: any, f: any) => {
    const ball = evt.eventSourceEntity
    const state = f.getNodeGraphVariable('state').asType('int')
    // 2026-08-30 日志 3005 实证：分发不能按设备名过滤（只响应 physics）——
    // kickApplyImpulse 用唯一名设备（"1"/"2"…），其停止事件被旧分发忽略 →
    // 飞行中再施力后物理链断裂、球冻结。改为按 state 分发：物理态
    // （FLY/ROLL/SLIDE/FREE）任何设备停止都恢复物理链；CARRIED/GOAL 忽略。
    f.doubleBranch(
      f.equal(state, 0n),
      () => {
        // 静止：清零速度，无运动器（链自然停）
        f.setNodeGraphVariable('ballVel', f.create3dVector(0, 0, 0), false)
      },
      () => {
        f.doubleBranch(
          f.equal(state, 1n),
          () => {
            f.callComposite(physFlyTick, { e: ball })
          },
          () => {
            f.doubleBranch(
              f.equal(state, 3n),
              () => {
                f.callComposite(physSlideTick, { e: ball })
              },
              () => {
                f.doubleBranch(
                  f.equal(state, 2n),
                  () => {
                    f.callComposite(physRollTick, { e: ball })
                  },
                  () => {
                    // CARRIED(4)/GOAL(5)：不驱动（带球图 / 复位定时器负责）
                  }
                )
              }
            )
          }
        )
      }
    )
  })
  // ================================================================
  // 定时器：goal_reset（进球复位）+ free_heartbeat（控球判定，常驻自重启）
  // ================================================================
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str('goal_reset')),
      () => {
        // 进球 2s 后复位（幂等：用户提前复位时再触发一次也无害）
        const ball = f.getSelfEntity()
        const kr = f.callComposite(kickReset, { e: ball })
        const sc = f.callComposite(stateCommit, { e: ball, next: new int(STATE_FREE) })
        f.connect(kr as never, 0, sc as never, 0)
      },
      () => {
        f.doubleBranch(
          f.equal(evt.timerName, new str('free_heartbeat')),
          () => {
            // 控球判定：仅 state==FREE 时干活（范围查询 1.2m + 球速低）
            const state = f.getNodeGraphVariable('state').asType('int')
            f.doubleBranch(
              f.equal(state, 0n),
              () => {
                const ball = f.getSelfEntity()
                const roleC = f.callComposite(dribbleFieldGetRole, {})
                const pc = f.callComposite(statePossessCheck, {
                  role: roleC.role,
                  ballPos: f.getNodeGraphVariable('ballPos').asType('vec3'),
                  ballVel: f.getNodeGraphVariable('ballVel').asType('vec3')
                })
                f.doubleBranch(
                  pc.canCarry,
                  () => {
                    // 进入 CARRIED（多人控球权 carriedBy 为后续扩展点，单人不写）
                    f.callComposite(stateCommit, { e: ball, next: new int(STATE_CARRIED) })
                  },
                  () => {}
                )
              },
              () => {}
            )
            // 常驻自重启（停止条件=干活门控在 state==FREE，负载 <1KB/tick）
            f.startTimer(f.getSelfEntity(), 'free_heartbeat', false, f.assemblyList([HEARTBEAT], 'float'))
          },
          () => {}
        )
      }
    )
  })
  // ================================================================
  // 脱脚请求：带球图检测到球脱离 → 携带当前球速转 ROLLING（唯一仲裁落地）
  // ================================================================
  .onSignal(Signal.ball_dropped, (evt, f) => {
    const ball = f.getSelfEntity()
    const state = f.getNodeGraphVariable('state').asType('int')
    f.doubleBranch(
      f.equal(state, 4n),
      () => {
        // 速度交接：带球图当前球速 → ballVel（滚动物理接管），消灭速度双真相
        f.setNodeGraphVariable('ballVel', evt.params.vel, false)
        f.callComposite(stateCommit, { e: ball, next: new int(STATE_ROLL) })
        // 2026-08-30 日志 3005 实证：脱脚瞬间球上最后的运动器是 dribbleCtrl，
        // 其停止事件被分发忽略（只处理 physics）→ 无 physics 设备停止事件 →
        // 物理链断裂，球冻结（位置不变）。必须立即执行第一次 roll tick
        // （激活 physics 设备 0.2s），之后物理链由 physics 停止事件自持续。
        f.callComposite(physRollTick, { e: ball })
      },
      () => {}
    )
  })

export default graph
