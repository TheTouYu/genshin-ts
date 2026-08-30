// 足球带球「连续速度控制器」图（挂球实体 1077936135，图 1073741828）
// 设计不变量（2026-08-31 重设计，教训见 PORTING-MAP C1 节）：
//   ① 设备永不断供——运动器是实体唯一运动来源，场监管期间每拍无条件写设备；
//   ② 速度=带记忆的状态——区内 v←0.95v+脉冲，区外 v←0.95v 滑行（无"断电死停"）；
//   ③ 反馈=每拍实时几何（dist/fwd 对实体真实位置），无状态机延时。
// custody 分工：FREE(0)/CARRIED(4)=场独占驱动；FLY/ROLL/SLIDE/GOAL=物理链独占（场零设备）。
// CARRIED 仅踢球语义标志（状态机图心跳设置）；脱脚=持续出区 3 tick → ball_dropped(vel)。
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
      // 脱脚计数（float 便于数据选择；≥3 tick 请求脱脚）
      lostTicks: new float(0)
    }
  })
  // ================================================================
  // 实体创建：启动 0.12s loop 循环定时器（引擎级恒定周期；自重启链周期=
  // 0.12+链执行时长，抖动=延时感——2026-08-31 连续控制器重设计。重复启动为
  // 同名替换无害；_init 标志跨会话持久化不可靠，弃用）
  // ================================================================
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    f.startTimer(f.getSelfEntity(), 'dribble_field', true, f.assemblyList([TICK], 'float'))
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
