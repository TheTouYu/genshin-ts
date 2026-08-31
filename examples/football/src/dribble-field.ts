// 足球带球「连续速度控制器」图（挂球实体 1077936135，图 1073741828）
// 设计不变量（2026-08-31 重设计 + 四点合一改造）：
//   ① 设备永不断供——运动器是实体唯一运动来源，场监管期间每拍无条件写设备；
//   ② 速度=带记忆的状态——非线性收敛 v←v+(target−v)·G（G=d/(d+C)，恒<1 不超调），
//      触球拍（进区上升沿）全额设定，出区 target=0 同式刹车；
//   ③ 反馈=每拍实时几何（dist/fwd 对实体真实位置），无状态机延时。
// custody 分工：FREE(0)/CARRIED(4)=场独占驱动；FLY/ROLL/SLIDE/GOAL=物理链独占（场零设备）。
// 状态传播（信号化）：state_changed(prev,next) 由 stateCommit 发（真实变化才发），
//   本图监听——进入场监护态（FREE/CARRIED）做记忆复位（速度/旋转/计数清零），
//   替代旧 lastSeenState 轮询检测链（每状态独立逻辑，无叠加、负载有界）。
// CARRIED 仅踢球语义标志（状态机图心跳 0.12s 设置）；脱脚=>2m 持续 3 tick → ball_dropped(vel)。
// 命中检测兜底：后续打开命中检测组件时再接 whenOnHitDetectionIsTriggered（预留，本期不挂）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str, vec3 } from 'genshin-ts/runtime/value'
import { dribbleFieldTick } from './composites/dribble-field.js'
import { Signal } from './resources/signals.js'

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
      // 脱脚计数（float 便于数据选择；>2m 持续 3 tick 请求脱脚）
      lostTicks: new float(0),
      // 旋转状态量 spinW（rad/s）：摩擦每拍拉向纯滚 v/R，触球/复 custody 时为慢值=滑动。
      // 喂设备前 ×180/π（度/秒），量纲陷阱见 composites/dribble-field.ts 注释
      spinW: new float(0),
      // 进区上升沿检测（上一拍是否在牵引区；触球拍 v 全额设定用）
      drivePrev: new bool(false)
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
  // 定时器触发：速度场 tick（脱脚信号在复合内直接发送）
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
  // 状态切换信号（2026-08-31 四点合一）：stateCommit 在 state 真实变化时发送。
  // 进入场监护态（next∈{FREE,CARRIED}）→ custody 记忆复位：
  //   物理链期间球速真相在 ballVel（game 图），不从旧记忆续算；
  //   spinW:=0 —— 重新接近必有滑动（触球冲量 → v 跳上去、ω 还是慢的，摩擦再拉纯滚）。
  // 其余目标态（FLY/ROLL/SLIDE/GOAL）不响应：场停手，记忆由 tick 出区分支自然衰减。
  // ================================================================
  .onSignal(Signal.state_changed, (evt, f) => {
    const next = evt.params.next
    const toField = f.logicalOrOperation(f.equal(next, 0n), f.equal(next, 4n))
    f.doubleBranch(
      toField,
      () => {
        f.setNodeGraphVariable('ballVx', new float(0), false)
        f.setNodeGraphVariable('ballVz', new float(0), false)
        f.setNodeGraphVariable('spinW', new float(0), false)
        f.setNodeGraphVariable('lostTicks', new float(0), false)
        f.setNodeGraphVariable('drivePrev', new bool(false), false)
      },
      () => {}
    )
  })

export default graph
