// 足球 v5 三层架构 · 使用层输入图（挂球实体 1077936135，图 1073741826——启用清空后的
// 残留空图，原名 _GSTS_input 复用）
//
// 职责：tab 输入（玩家手感主路径，直调零延迟——不走信号，信号投递时序未验证）：
//   tab 9 → 发 ball_reset 信号（复位不敏感延迟，logic 图统一处理）
//   tab 1-8 → GOAL 检查 → inputTabKick 参数表（纯数据，outputs 返回新速度）→ IMMEDIATE
// 从 logic.ts 拆出的原因（2026-08-31 节点预算实测）：ballApplyImmediate 复合展开
// 914/实例，tab 链与 ball_impulse handler 双实例挤一张图 → 825 根图展开超拒载线；
// 按职责拆新图后各图独立计费（AGENTS.md 生产红线：单图 >2000 拆图）。
// 参数表复合在本图重定义（logic 版写图变量，跨图不共享；本版纯数据 outputs 返回）。
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'
import { ballApplyImmediate } from './composites/ball-phys.js'
import { BALL_GOAL, BALL_IDLE } from './composites/ball-state.js'
import { Signal } from './resources/signals.js'

// —— tab 参数表（与 v4 kickApplyForce 同值；缩放：IDLE=1.0 全量设定 / 运动态=0.35 冲量叠加）——
const tabVelTable: Record<number, [number, number, number]> = {
  1: [-14, 4, 6],
  2: [-24, 5, 0],
  3: [-15, 14, 0],
  4: [-16, 6, 12],
  5: [-16, 6, -12],
  6: [18, 4, 12],
  7: [-14, 5, 8],
  8: [4, 6, 18]
}
const tabSpinTable: Record<number, [number, number, number]> = {
  1: [0, -6, 0],
  2: [0, -8, 0],
  3: [0, 0, 6],
  4: [0, -9, 0],
  5: [0, 9, 0],
  6: [0, 0, 10],
  7: [0, 0, -8],
  8: [6, 0, 0]
}

// ================================================================
// tab 踢球参数表（纯数据复合）：tabId + 黑板 vel/spin → 新 vel/spin（outputs）
// nv = 当前球速 + 表值×scaleF（IDLE=1.0 / 运动=0.35）；clamp 由 ballApplyImmediate 统一做
// ================================================================
const inputTabKick = g.defineComposite('input_tab_kick', {
  inputs: { e: { type: 'entity' }, tabId: { type: 'int' } },
  outputs: { vel: { type: 'vec3' }, spin: { type: 'vec3' } },
  build: ({ e, tabId }, f) => {
    const state = f.getCustomVariable(e, new str('state')).asType('int')
    const isIdle = f.equal(state, new int(0))
    const idleF = f.dataTypeConversion(f.dataTypeConversion(isIdle, 'int'), 'float')
    const scaleF = f.addition(idleF, f.multiplication(f.subtraction(1, idleF), 0.35))
    const boardVel = f.getCustomVariable(e, new str('vel')).asType('vec3')
    const boardSpin = f.getCustomVariable(e, new str('spin')).asType('vec3')
    // 数据选择各分支向量（v4 multipleBranches 写图变量模式改为 outputs 直返：
    // 分支互斥，向量加法组合 vel_i·hit_i 求和——恒等且无图变量）
    let velAcc: any = boardVel
    let spinAcc: any = boardSpin
    for (let i = 1; i <= 8; i++) {
      const hit = f.equal(tabId, new int(i))
      const hitF = f.dataTypeConversion(f.dataTypeConversion(hit, 'int'), 'float')
      const dv = f._3dVectorZoom(f.create3dVector(...tabVelTable[i]), f.multiplication(scaleF, hitF))
      velAcc = f._3dVectorAddition(velAcc, dv)
      const dw = f._3dVectorZoom(f.create3dVector(...tabSpinTable[i]), f.multiplication(scaleF, hitF))
      spinAcc = f._3dVectorAddition(spinAcc, dw)
    }
    return { vel: velAcc, spin: spinAcc }
  }
})

// ================================================================
// 使用层输入根图
// ================================================================
const graph = g
  .server({
    id: 1073741826,
    variables: {}
  })
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const tabId = evt.tabId
    f.doubleBranch(
      f.equal(tabId, 9n),
      () => {
        f.sendSignal(Signal.ball_reset)
      },
      () => {
        // GOAL 态忽略施力（transition 守卫也会拦，前置判断省整条链执行）
        const state = f.getCustomVariable(ball, new str('state')).asType('int')
        f.doubleBranch(
          f.equal(state, new int(BALL_GOAL)),
          () => {},
          () => {
            const kick = f.callComposite(inputTabKick, { e: ball, tabId })
            const ap = f.callComposite(ballApplyImmediate, { e: ball, vel: kick.vel, spin: kick.spin })
            f.connect(kick as never, 0, ap as never, 0)
          }
        )
      }
    )
  })
  // ball_impulse 信号（低阶核心，vel:vec3 + mode:int；spin 冲量走黑板 impSpin）：
  //   有效模式 = IMMEDIATE 或 IDLE（IDLE 无 loop 消费队列，DEFERRED 自动升级 IMMEDIATE 唤醒）
  //   IMMEDIATE：读当前速度+Δ → 统一路径（当拍积分+当帧渲染；spin 不变）
  //   DEFERRED（运动态）：黑板队列 +=（多使用方累积语义；drain 读后清零）
  // ================================================================
  .onSignal(Signal.ball_impulse, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const state = f.getCustomVariable(ball, new str('state')).asType('int')
    const isIdle = f.equal(state, new int(BALL_IDLE))
    const isGoal = f.equal(state, new int(BALL_GOAL))
    const modeImm = f.equal(evt.params.mode, 1n)
    const notGoal = f.logicalNotOperation(isGoal)
    // 有效 IMMEDIATE = (mode==1 ∨ IDLE) ∧ ¬GOAL
    const imm = f.logicalAndOperation(
      f.logicalOrOperation(modeImm, isIdle),
      notGoal
    )
    const deferred = f.logicalAndOperation(notGoal, f.logicalNotOperation(imm))
    f.doubleBranch(
      imm,
      () => {
        const boardVel = f.getCustomVariable(ball, new str('vel')).asType('vec3')
        const nv = f._3dVectorAddition(boardVel, evt.params.vel)
        const boardSpin = f.getCustomVariable(ball, new str('spin')).asType('vec3')
        f.callComposite(ballApplyImmediate, { e: ball, vel: nv, spin: boardSpin })
      },
      () => {
        f.doubleBranch(
          deferred,
          () => {
            const curIv = f.getCustomVariable(ball, new str('impVel')).asType('vec3')
            const nIv = f._3dVectorAddition(curIv, evt.params.vel)
            f.setCustomVariable(ball, 'impVel', nIv, false)
          },
          () => {}
        )
      }
    )
  })

export default graph
