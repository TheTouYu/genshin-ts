// 足球物理图（挂球实体 1077936135，图 1073741825）——主图，负责球状态机
// whenTabIsSelected → 施力（选项 tabId 1-8）+ 复位（tabId 9）
// onSignal(football_push) → 推球执行（弹球图发来推球目标点，暂禁用）
// whenBasicMotionDeviceStops → 物理 tick（状态机：空中/反弹/滚滑/静止）
// 状态机：0=静止 FREE / 1=空中 FLYING / 2=滚滑 ROLLING / 3=滑动 SLIDE
// 架构（2026-08-28 速度场带球切换）：
//   - 本图是「主图」，负责球状态机 + 射门/传球/复位（物理权威）；
//   - 带球（速度场吸附）已拆到独立图 dribble-field.ts（1073741828），
//     读球实体自定义变量 state（本图写，跨图共享），只在 state==0 时驱动；
//   - 本图每次状态变化后把 state 同步写到球实体自定义变量，供带球图读取。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str, vec3 } from 'genshin-ts/runtime/value'
import { kickApplyForce, kickApplyImpulse, kickLaunch, kickReset } from './composites/kick.js'
import { physTick } from './composites/physics.js'
import { Signal } from './resources/signals.js'

// 场地中间（复位点）
const CENTER_X = 0
const CENTER_Y = 0.25 // = BALL_R
const CENTER_Z = 0

const graph = g
  .server({
    id: 1073741825,
    variables: {
      // 球物理状态（单一事实源：积分链只维护变量，运动器只做视觉插值）
      ballPos: new vec3([CENTER_X, CENTER_Y, CENTER_Z]),
      ballVel: new vec3([0, 0, 0]),
      ballSpin: new vec3([0, 0, 0]),
      // 单 tick 内把积分结果物化成快照，避免下面 goal/ground 再次消费 interg.*
      // 时引擎按消费点重新求值（其输入来自图变量，消费前已被写回）
      tmpPos: new vec3([0, 0, 0]),
      tmpVel: new vec3([0, 0, 0]),
      tmpSpin: new vec3([0, 0, 0]),
      dbgTag: new str(''),
      dbgVal: new str(''),
      state: new int(0), // 0=静止 FREE / 1=空中 FLYING / 2=滚滑 ROLLING / 3=滑动 SLIDE
      impulseSeq: new int(0), // 运动中冲量运动器的唯一名自增序号
      scored: new bool(false), // 进球去重（复位时清零）
      goalCount: new int(0)
    }
  })
  // ================================================================
  // 输入：选项施力（tabBar 挂足球本体，5 米范围）
  // ================================================================
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const tabId = evt.tabId
    // 9 = 复位，1-8 = 施力
    f.doubleBranch(
      f.equal(tabId, 9n),
      () => {
        f.callComposite(kickReset, { e: ball })
        // 复位后 state=0，同步到球自定义变量（供带球图读取）
        f.setCustomVariable(ball, new str('state'), new int(0), false)
      },
      () => {
        const state = f.getNodeGraphVariable('state').asType('int')
        f.doubleBranch(
          f.equal(state, 0n),
          () => {
            // 静止：设定初速 + 启动主运动器
            const ka = f.callComposite(kickApplyForce, { tabId })
            const kl = f.callComposite(kickLaunch, { e: ball })
            f.connect(ka as never, 0, kl as never, 0)
            // 施力后 state=1（空中），同步到球自定义变量
            f.setCustomVariable(ball, new str('state'), new int(1), false)
          },
          () => {
            // 运动中：只叠加冲量 + 启动唯一名冲量运动器，不新建 physics
            const imp = f.callComposite(kickApplyImpulse, { e: ball, tabId })
            // 运动中施力后 state=1（空中），同步到球自定义变量
            f.setCustomVariable(ball, new str('state'), new int(1), false)
          }
        )
      }
    )
  })
  // ================================================================
  // 推球执行：弹球图（命中检测触发）发来 target，球被"踢"到前方目标点
  // 2026-08-27 纯 auto 测试：临时禁用命中踢球（用户已改命中范围但日志仍触发 20 次），
  // 只保留预测补偿自动触发路线，测完可恢复
  // ================================================================
  .onSignal(Signal.football_push, (evt, f) => {
    // 禁用：命中路线暂时关闭（纯 auto 测试）
  })
  // ================================================================
  // 物理：运动器停止事件链驱动（5Hz 状态机）
  // ================================================================
  .on('whenBasicMotionDeviceStops', (evt: any, f: any) => {
    const ball = evt.eventSourceEntity
    // 只响应 physics（直线运动器）停止，忽略 spin（旋转运动器）停止
    // 否则两个运动器各触发一次，physTick 每 tick 执行两次导致球状态错乱/越升越高
    f.doubleBranch(
      f.equal(evt.motionDeviceName, new str('physics')),
      () => {
        const pt = f.callComposite(physTick, { e: ball })
        // 物理 tick 后 state 可能变化，同步到球自定义变量（供带球图读取）
        const state = f.getNodeGraphVariable('state').asType('int')
        f.setCustomVariable(ball, new str('state'), state, false)
      },
      () => {}
    )
  })

export default graph
