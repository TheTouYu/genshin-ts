// 足球带球「速度场吸附」图（挂球实体 1077936135，图 1073741828）
// 职责：带球（速度场吸附）——0.12s 循环定时器驱动，把球速重算为
//       「玩家速度分量 + 朝向吸附分量」的合成，球被持续牵引到玩家脚前。
// 与主图（game.ts 1073741825，状态机）分工：
//   - 主图负责球状态机（0=静止/1=空中/2=滚滑/3=滑动）+ 射门/传球/复位；
//   - 本图负责带球（速度场吸附），读球实体自定义变量 state（主图写，跨图共享），
//     只在 state==0（静止 FREE）时驱动，射门/传球飞行中停手，不与主图抢驱动。
// 命中检测兜底（预留）：whenOnHitDetectionIsTriggered 后续打开，作为自动触发的兜底。
// 参考：docs/game-engine-knowledge/football-dribble-velocity-field.md
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import { dribbleFieldTick } from './composites/dribble-field.js'

const TICK = 0.12 // 定时器间隔（秒），参考版 0.12s

const graph = g
  .server({
    id: 1073741828,
    variables: {
      // 球速（水平分量，速度场每 tick 重算）
      ballVx: new float(0),
      ballVz: new float(0),
      // 单 tick 内物化快照（防二次求值）
      tmpDribbleVel: new vec3([0, 0, 0]),
      // 节流计数（tickCount 自增 + lastKickTick 记录上次踢球 tick）
      tickCount: new int(0),
      lastKickTick: new int(0),
      // 初始化标记（When Entity Is Created 只启动一次定时器）
      _init: new bool(false)
    }
  })
  // ================================================================
  // 实体创建：首次启动 0.12s 循环定时器（_init 防重复启动）
  // ================================================================
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    const init = f.getNodeGraphVariable('_init').asType('bool')
    f.doubleBranch(
      init,
      () => {},
      () => {
        f.setNodeGraphVariable('_init', new bool(true), false)
        f.startTimer(f.getSelfEntity(), 'dribble_field', false, [TICK])
      }
    )
  })
  // ================================================================
  // 定时器触发：速度场 tick（自重启在复合内部）
  // ================================================================
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str('dribble_field')),
      () => {
        f.callComposite(dribbleFieldTick, { e: f.getSelfEntity() })
      },
      () => {}
    )
  })
  // ================================================================
  // 命中检测兜底（预留）：球碰玩家受击盒 → 立即触发一次速度场 tick
  // 后续打开命中检测组件后，作为自动触发的兜底（自动触发 + 命中检测双保险）
  // ================================================================
  .on('whenOnHitDetectionIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      evt.onHitHurtbox,
      () => {
        // 兜底：命中时立即执行一次速度场 tick（把球拉回脚前）
        f.callComposite(dribbleFieldTick, { e: f.getSelfEntity() })
      },
      () => {}
    )
  })

export default graph
