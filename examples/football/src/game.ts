// 足球物理图（挂球实体 1077936135）
// onSignal(football_kick) → 踢球参数 + 启动 tick 链
// whenBasicMotionDeviceStops → 物理 tick（积分/判定/碰撞/停球）
import { g } from 'genshin-ts/runtime/core'
import { bool, int, vec3 } from 'genshin-ts/runtime/value'
import { FootballSignal } from './signals.js'
import { kickSetParams, kickLaunch, kickReset } from './composites/kick.js'
import { physTick } from './composites/physics.js'

// 发球点（罚球点）
const SPAWN_X = -41.5
const SPAWN_Y = 0.247
const SPAWN_Z = 0

const graph = g
  .server({
    id: 1073741825,
    variables: {
      // 球物理状态（单一事实源：积分链只维护变量，运动器只做视觉插值）
      ballPos: new vec3([SPAWN_X, SPAWN_Y, SPAWN_Z]),
      ballVel: new vec3([0, 0, 0]),
      ballSpin: new vec3([0, 0, 0]),
      flying: new bool(false),
      shotCount: new int(0),
      goalCount: new int(0)
    }
  })
  // ================================================================
  // 输入：踢球指令（来自输入图信号）
  // ================================================================
  .onSignal(FootballSignal.football_kick, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const tabId = evt.params.tabId
    // 飞行中忽略新输入（输入锁）
    f.doubleBranch(
      f.get('flying'),
      () => {},
      () => {
        // 9 = 复位，1-8 = 踢球
        f.doubleBranch(
          f.equal(tabId, 9n),
          () => {
            f.callComposite(kickReset, { e: ball })
          },
          () => {
            f.callComposite(kickSetParams, { tabId })
            f.callComposite(kickLaunch, { e: ball })
          }
        )
      }
    )
  })
  // ================================================================
  // 物理：运动器停止事件链驱动（5Hz 积分）
  // ================================================================
  .on('whenBasicMotionDeviceStops', (evt: any, f: any) => {
    const ball = evt.eventSourceEntity
    f.doubleBranch(
      f.get('flying'),
      () => {
        f.callComposite(physTick, { e: ball })
      },
      () => {}
    )
  })

export default graph
