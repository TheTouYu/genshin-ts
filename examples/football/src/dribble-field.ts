// 足球带球「速度场吸附」图（挂球实体 1077936135，图 1073741828）
// 职责：带球（速度场吸附）——0.12s 循环定时器驱动，只在 CARRIED 状态驱动球。
// 与状态机图（game.ts 1073741825）分工（状态机唯一仲裁）：
//   - 状态机图唯一写 state（球实体自定义变量，跨图共享）；本图只读；
//   - 本图仅在 state==4（CARRIED）时激活运动器，其他状态完全停手；
//   - 进入 CARRIED（轮询迁移检测）→ 球速清零重算；
//   - 脱脚（球脱离牵引区 3 tick）→ dribble_field_tick 复合内直接发 ball_dropped(vel) 信号，
//     状态机图写回 ballVel 后转 ROLLING（速度交接）。
// 命中检测兜底：后续打开命中检测组件时再接 whenOnHitDetectionIsTriggered（预留，本期不挂）。
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
      tmpBallPos: new vec3([0, 0, 0]),
      // 状态迁移轮询检测（上一次看到的 state；进入 CARRIED 时触发球速复位）
      lastSeenState: new int(0),
      // 脱脚计数（float 便于数据选择；≥3 tick 请求脱脚）
      lostTicks: new float(0),
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
        // 显式 assemblyList（规避编译器根图数组字面量 → gsts.f 的 ctx 回归）
        f.startTimer(f.getSelfEntity(), 'dribble_field', false, f.assemblyList([TICK], 'float'))
      }
    )
  })
  // ================================================================
  // 定时器触发：速度场 tick（自重启在复合内部；脱脚信号也在复合内直接发送）
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

export default graph
