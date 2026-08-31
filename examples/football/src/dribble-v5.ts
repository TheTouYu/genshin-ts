// 足球 v5 · 带球获得图（挂球实体 1077936135，图 1073741828）
//
// 职责收缩（2026-08-31 架构修正，四轮竞态补丁的终解）：
//   原设计：本图独立 0.5s 决策 loop 写 impVel 黑板队列，logic 图 drain 消费——
//   双 loop 相位竞态导致任何补丁（覆盖式/vel 物化/pos 物化）都失败（快照横跨
//   drain 拿未来值，impVel 恒 ±20、球一拍弹射 12m）。
//   修正：**感知-决策-积分收回 logic 图 CARRIED 分支同拍原子执行**
//   （ballPhysCarriedTick 调 ballDribbleDecideAtomic）；本图仅保留 IDLE 待机
//   心跳做获得判定（走近静止球 → ball_set_state 请求，守卫终审在 logic）。
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'
import { dribbleFieldGetRole } from './composites/dribble-field.js'
import { Signal } from './resources/signals.js'
import { BALL_CARRIED } from './composites/ball-state.js'

const IDLE_SCAN_T = 0.5 // IDLE 待机心跳（获得判定；二期可换命中检测事件驱动，零心跳）
const IDLE_SCAN = 'idle_scan'
const PULL_DIST2 = 2.25 // 获得距离门 = 牵引圈 1.5m（对齐，防 1.5~2m 死区死锁）
const PULL_FWD_MIN = -0.3 // 前向门

const graph = g
  .server({
    id: 1073741828,
    variables: {}
  })
  // 实体创建：启动 IDLE 待机心跳
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    f.startTimer(f.getSelfEntity(), IDLE_SCAN, true, f.assemblyList([IDLE_SCAN_T], 'float'))
  })
  // 状态广播：进 CARRIED 停心跳（决策在 logic 同拍跑）；进 IDLE 重启心跳；其他态全停
  .onSignal(Signal.state_changed, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const next = evt.params.next
    const toCarried = f.equal(next, new int(BALL_CARRIED))
    const toIdle = f.equal(next, new int(0))
    f.doubleBranch(
      toCarried,
      () => {
        f.stopTimer(ball, IDLE_SCAN)
      },
      () => {
        f.doubleBranch(
          toIdle,
          () => {
            f.stopTimer(ball, IDLE_SCAN)
            f.startTimer(ball, IDLE_SCAN, true, f.assemblyList([IDLE_SCAN_T], 'float'))
          },
          () => {
            f.stopTimer(ball, IDLE_SCAN)
          }
        )
      }
    )
  })
  // 待机心跳：获得判定（距离门对齐牵引圈 + 前向门 + 球速门）
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str(IDLE_SCAN)),
      () => {
        const ball = f.getSelfEntity()
        const roleC = f.callComposite(dribbleFieldGetRole, {})
        const role = roleC.role
        const d = f._3dVectorSubtraction(
          f.getCustomVariable(ball, new str('pos')).asType('vec3'),
          f.getEntityLocationAndRotation(role).location
        )
        const dist2 = f._3dVectorDotProduct(d, d)
        const near = f.lessThan(dist2, PULL_DIST2)
        const spd = f._3dVectorModuloOperation(f.getCustomVariable(ball, new str('vel')).asType('vec3'))
        const slow = f.lessThan(spd, 3.5)
        const Dn = f._3dVectorNormalization(d)
        const fwd = f._3dVectorDotProduct(f.getEntityForwardVector(role), Dn)
        const front = f.greaterThan(fwd, PULL_FWD_MIN)
        const canCarry = f.logicalAndOperation(f.logicalAndOperation(near, slow), front)
        f.doubleBranch(
          canCarry,
          () => {
            f.sendSignal(
              Signal.ball_set_state,
              new int(BALL_CARRIED),
              f.getCustomVariable(ball, new str('vel')).asType('vec3')
            )
          },
          () => {}
        )
      },
      () => {}
    )
  })

export default graph
