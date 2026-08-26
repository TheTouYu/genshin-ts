// 足球弹球图（挂球实体 1077936135，图 1073741827）
// 职责：带球「推」逻辑 + 推球锁（防重入）
// 两个输入渠道共用同一套推球链（各自入口，同一"锁判定+推球+定时器解锁"模式）：
//   ① 命中检测触发（球碰玩家受击盒）——主通道：按【角色朝向】计算推球目标点
//   ② 接收信号 football_push_req（自动触发渠道）——目标点由外部图算好
// 推球锁：pushLock=1 时忽略新请求；上锁后 0.4s 定时器解锁（单人防连触/多人防抢发）
// 输出：sendSignal(football_push, target) 给物理图执行（运动器+状态，物理权威留在物理图）
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str, vec3 } from 'genshin-ts/runtime/value'
import { Signal } from './resources/signals.js'

const PUSH_DIST = 1.8 // 推球距离（米）：球被踢到持球者正前方该距离处
const BALL_R = 0.25 // 球半径（目标点 y 贴地）
const DEG2RAD = 0.0174533 // 度→弧度（实体旋转是欧拉角度）
const LOCK_MS = 0.4 // 推球锁时长（秒）

const graph = g
  .server({
    id: 1073741827,
    variables: {
      dbgTag: new str(''),
      dbgVal: new str(''),
      pushLock: new int(0) // 0=空闲 1=锁定（0.4s 内只允许一次推球）
    }
  })
  // ================================================================
  // 入口① 命中检测触发：球碰到玩家（受击盒）→ 按角色朝向算目标点 → 锁判定 → 推球
  // 目标点 = 角色位置 + 角色朝向 × 1.8m（y 贴地）：球无论从哪个角度接触玩家，
  // 都被踢到持球者正前方——"人带球走"的朝向手感，不会迎面向后踢
  // ================================================================
  .on('whenOnHitDetectionIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      evt.onHitHurtbox,
      () => {
        const lock = f.getNodeGraphVariable('pushLock').asType('int')
        f.doubleBranch(
          f.equal(lock, 0n),
          () => {
            const role = evt.onHitEntity
            const t = f.getEntityLocationAndRotation(role)
            const p = f.split3dVector(t.location)
            const r = f.split3dVector(t.rotate)
            const sinY = f.sineFunction(f.multiplication(r.yComponent, DEG2RAD))
            const cosY = f.cosineFunction(f.multiplication(r.yComponent, DEG2RAD))
            const target = f.create3dVector(
              f.addition(p.xComponent, f.multiplication(sinY, PUSH_DIST)),
              BALL_R,
              f.addition(p.zComponent, f.multiplication(cosY, PUSH_DIST))
            )
            f.setNodeGraphVariable('dbgTag', new str('DBG_PUSH'), false)
            f.setNodeGraphVariable('dbgVal', new str('HIT_PUSH'), false)
            f.setNodeGraphVariable('pushLock', 1n, false)
            f.startTimer(f.getSelfEntity(), 'push_lock', false, [LOCK_MS])
            f.sendSignal(Signal.football_push, target)
          },
          () => {}
        )
      },
      () => {}
    )
  })
  // ================================================================
  // 入口② 接收信号（自动触发渠道）：目标点已算好，走同一套锁判定 + 推球
  // ================================================================
  .onSignal(Signal.football_push_req, (evt, f) => {
    const lock = f.getNodeGraphVariable('pushLock').asType('int')
    f.doubleBranch(
      f.equal(lock, 0n),
      () => {
        f.setNodeGraphVariable('dbgTag', new str('DBG_PUSH_REQ'), false)
        f.setNodeGraphVariable('dbgVal', new str('REQ_PUSH'), false)
        f.setNodeGraphVariable('pushLock', 1n, false)
        f.startTimer(f.getSelfEntity(), 'push_lock', false, [LOCK_MS])
        f.sendSignal(Signal.football_push, evt.params.target)
      },
      () => {}
    )
  })
  // ================================================================
  // 推球锁解锁：0.4s 定时器触发 → 解锁，允许下一次推球
  // ================================================================
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str('push_lock')),
      () => {
        f.setNodeGraphVariable('pushLock', 0n, false)
      },
      () => {}
    )
  })

export default graph