// 足球物理图（挂球实体 1077936135）
// whenTabIsSelected → 施力（选项 tabId 1-8）+ 复位（tabId 9）
// onSignal(football_push) → 推球执行（弹球图发来推球目标点）
// whenBasicMotionDeviceStops → 物理 tick（状态机：空中/反弹/滚滑/静止）
// 带球「推」模型：命中检测触发由弹球图（1073741827）处理并发信号；
// 球状态机不再有 CARRIED 弹簧场（取消"拉"，改"推"，球总在玩家正前方）
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str, vec3 } from 'genshin-ts/runtime/value'
import { kickApplyForce, kickApplyImpulse, kickLaunch, kickReset } from './composites/kick.js'
import { dbgPhysSnapshot, dbgTag } from './composites/debuglog.js'
import { autoCheckTick, physTick, pushCompute, kickApply } from './composites/physics.js'
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
      autoTimerOn: new bool(false), // auto_check 循环定时器是否已启动（whenEntityIsCreated 对已存在实体不触发）
      state: new int(0), // 0=静止 FREE / 1=空中 FLYING / 2=滚滑 ROLLING
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
      },
      () => {
        const state = f.getNodeGraphVariable('state').asType('int')
        f.doubleBranch(
          f.equal(state, 0n),
          () => {
            // 静止：设定初速 + 启动主运动器
            const lg = f.callComposite(dbgTag, { tag: new str('DBG_KICK'), val: f.dataTypeConversion(tabId, 'str') })
            const ka = f.callComposite(kickApplyForce, { tabId })
            const kl = f.callComposite(kickLaunch, { e: ball })
            f.connect(lg as never, 0, ka as never, 0)
            f.connect(ka as never, 0, kl as never, 0)
          },
          () => {
            // 运动中：只叠加冲量 + 启动唯一名冲量运动器，不新建 physics
            const lg = f.callComposite(dbgTag, { tag: new str('DBG_KICK'), val: f.dataTypeConversion(tabId, 'str') })
            const imp = f.callComposite(kickApplyImpulse, { e: ball, tabId })
            f.connect(lg as never, 0, imp as never, 0)
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
        const snap = f.callComposite(dbgPhysSnapshot, { e: ball })
        const pt = f.callComposite(physTick, { e: ball })
        f.connect(snap as never, 0, pt as never, 0)
      },
      () => {}
    )
  })
  // ================================================================
  // 自动补踢独立定时器（0.2s 循环）：球静止（FREE）也有滚滑 tick 外的检查源。
  // 实体创建时启动；whenTimerIsTriggered 里 auto_check → autoCheckTick。
  // ================================================================
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    f.setNodeGraphVariable('autoTimerOn', new bool(true), false)
    f.startTimer(f.getSelfEntity(), 'auto_check', true, [200])
  })
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    // 确保 auto_check 循环已启动（幂等）：whenEntityIsCreated 对地图已存在的球不触发，
    // 借任何定时器事件（如 push_lock）作为启动机会；启动后持续运行，不依赖后续事件
    const timerOn = f.getNodeGraphVariable('autoTimerOn').asType('bool')
    f.doubleBranch(
      timerOn,
      () => {
        f.doubleBranch(
          f.equal(evt.timerName, new str('auto_check')),
          () => {
            f.callComposite(autoCheckTick, { e: f.getSelfEntity() })
          },
          () => {}
        )
      },
      () => {
        f.setNodeGraphVariable('autoTimerOn', new bool(true), false)
        f.startTimer(f.getSelfEntity(), 'auto_check', true, [200])
        f.doubleBranch(
          f.equal(evt.timerName, new str('auto_check')),
          () => {
            f.callComposite(autoCheckTick, { e: f.getSelfEntity() })
          },
          () => {}
        )
      }
    )
  })

export default graph