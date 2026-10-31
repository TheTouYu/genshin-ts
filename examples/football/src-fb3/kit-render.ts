// @status: 复刻 src-fb/fb-render.ts（2026-10-27：原版全通、每选项卡可用，直接抄调用链）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828，挂球实体 1077936135）
// 只做两件事：|delta| 太大 → INSTANT 瞬移；否则挂「线性(+可选旋转)」运动设备。
// 关键：**用复合 fbDriveDirect**（老代码原样），线性设备与旋转设备由复合内部串好 exec 边。
import { g } from 'genshin-ts/runtime/core'
import { float, int } from 'genshin-ts/runtime/value'

import { KitSignal } from './signals.js'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

const GRAPH_ID = 1073741828
const TELEPORT_DIST = 5.0
// 运动器时长 = 一拍（内核 7.5Hz ⇒ 0.1333s；取 0.14 略长一点，保证下一拍到来前已走完，无空档）
// 2026-10-29 修：原来 0.25s + FixedSpeed，运动器比拍长一倍 ⇒ 每拍都在"重启"未完成的运动，
//   实测（日志 3412）tick 61 之后球实体一直停在 (0,0,1.5) 不动，而内核目标已走到 3m 外。
// 运动器时长 = 一拍。内核实际步长随客户端负载在 0.037~0.07s 之间变（14~27Hz），
// 固定 0.14s 会让球永远慢半拍 ⇒ 每拍从载体变量 fb_dt 读真实步长（读不到用 0.14 兜底）。
const DRIVE_DUR = 0.14
const GROUND_Y_MIN = 0.25 // 球心贴地高度（= 球半径），预测位不得低于它
// 线性运动器的**前瞻时长**（2026-10-30 平滑性二修）：
//   内核只 15Hz，若每段只覆盖一拍（0.066s），球速每秒被硬切 15 次 ⇒ 60fps 下就是"一顿一顿"。
//   改成每段朝「0.2s 后的预测位」走：段更长、速度更连续，视觉平滑由引擎内部补间完成。
// 2026-10-30 数据定谳（PHYSICS-DATA-REPORT 第一节）：
//   运动器下发间隔 0.16s（隔 4 拍），而 duration 曾设 0.35s ⇒ 每个补间只走完 46% 就被重启，
//   观感就是"动一下停一下"（实体当拍位移 0.0000m，下一窗跳 3~4.5m）。
//   ⇒ duration **等于下发间隔**，让每个窗口走完再被替换。
// ⚠️ 2026-10-31 定谳（日志 3443：运动器每 4 拍下发一次=261/269 次间隔恰为 4 拍，
//   而 duration 恒 0.16s < 4 拍实际 0.27s ⇒ 每次只动 0.16s、停 0.11s ⇒ "跑一下停一下"）。
//   修法：时长由**下发间隔 × 真实步长**决定，不再写死常量。
//   LIN_EVERY = 下发的拍间隔；MARGIN = 重叠系数（>1 保证下一段在上一段结束前开始）。
const LIN_EVERY = 4n
const MARGIN = 1.25
/** 球实体上的可调时长变量名（默认 0.18s，学习旧版足球做法：参数放球上，服务端只读） */
const BALL_DUR_VAR = 'fb_dur'
const BALL_DUR_DEFAULT = 0.18
/** 旧常量：仅在拿不到 fb_dt 时兜底 */
const LOOKAHEAD_FALLBACK = 0.28
const VEL_CAP = 25.0 // 速度上限，防预测位把球吹飞（内核限速 18，留余量）
const VIS_SPIN_CAP = 540.0 // 视觉自旋上限（度/秒）
const DUR_MIN = 0.033 // 补间时长下限：太短会让运动器每拍重开、观感发顿
const DUR_MAX = 0.08 // 上限：帧率掉到 10Hz 时不要把一拍拉成 0.1s

g
  .server({
    id: GRAPH_ID,
    name: '_GSTS_kitRender',
    // 2026-10-30 设备 churn 降频：记录上一次下发设备的 tick 号。
    // 线性/旋转设备各 0.2s 前瞻，隔 2~3 拍才重发一次即可连续覆盖，
    // 而原来**每拍**都重发（15/s 线性 + 15/s 旋转 = 30 次设备创建/秒）是引擎负载大户之一。
    variables: { fb_lin_tick: new int(0), fb_rot_tick: new int(0) }
  })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    // 进球事件日志（保留）
    f.doubleBranch(
      f.equal(evt.params.tag, 'G'),
      () => {
        print('fb-goal')
      },
      () => {}
    )
    // ———— 早退闸（2026-10-30 负载优化）————
    // 服务端每条信号都要付「派发 + 变量读 + 一堆计算」。设备只需每 4 个 tick 下发一次，
    // 于是把「是否到点」提到**所有计算之前**：不到点的信号只走 3~4 个节点就结束，
    // 避免每条信号都白跑预测位/轴换算/分支。
    const tickEarly = evt.params.tick
    const durProbe = f.getCustomVariable(f.getSelfEntity(), BALL_DUR_VAR).asType('float')
    const dtProbe = f.getCustomVariable(f.queryEntityByGuid(1082130445n), 'fb_dt').asType('float')
    const everyEarly = f.localVariable('int')
    const calcEarly = f.division(durProbe, dtProbe)
    const calcEarlyI = f.dataTypeConversion(calcEarly, 'int')
    f.doubleBranch(
      f.lessThan(calcEarlyI, 1n),
      () => {
        everyEarly.set(1n)
      },
      () => {
        everyEarly.set(calcEarlyI)
      }
    )
    // ⚠️ 2026-10-31 实测：按「段时长 / Lua 帧时长」折算会把间隔算成 6 拍（≈0.4~0.55s），
    //   远大于 0.18s 的段时长 ⇒ 空档更大。段时长 0.18s 足以覆盖任意拍率（实测 0.09s/拍），
    //   因此下发间隔**固定 1 拍**（每条 B 信号都重新下发一次），重叠由 duration 提供。
    const dueEarly = f.greaterThanOrEqualTo(
      f.subtraction(tickEarly, f.get('fb_lin_tick')),
      1n
    )
    f.doubleBranch(
      f.logicalAndOperation(f.equal(evt.params.tag, 'B'), dueEarly),
      () => {
        const ball = f.getSelfEntity()
        // 真实步长（kitListen 每秒校准写入载体变量）
    const dtRaw = f
      .getCustomVariable(f.queryEntityByGuid(1082130445n), 'fb_dt')
      .asType('float')
    const driveDur = f.localVariable('float')
    f.doubleBranch(
      f.logicalAndOperation(f.greaterThan(dtRaw, 0.004), f.lessThan(dtRaw, 0.25)),
      () => {
        f.doubleBranch(
          f.lessThan(dtRaw, DUR_MIN),
          () => {
            driveDur.set(DUR_MIN)
          },
          () => {
            f.doubleBranch(
              f.greaterThan(dtRaw, DUR_MAX),
              () => {
                driveDur.set(DUR_MAX)
              },
              () => {
                driveDur.set(dtRaw)
              }
            )
          }
        )
      },
      () => {
        driveDur.set(DRIVE_DUR)
      }
    )
    // ———— 段时长由**球实体上的变量 fb_dur**决定（学习旧版足球：参数放球上，服务端只读）————
    // 段时长 = 0.18s（默认）；下发间隔 = ceil(段时长/真实步长) 拍，保证下一段在上一段结束前开始。
    const ballNow = f.getSelfEntity()
    const durVar = f.getCustomVariable(ballNow, BALL_DUR_VAR).asType('float')
    const durVarLen = f._3dVectorModuloOperation(f.create3dVector(durVar, 0.0, 0.0))
    const lookahead = f.localVariable('float')
    f.doubleBranch(
      f.greaterThan(durVarLen, 0.01),
      () => {
        lookahead.set(durVar)
      },
      () => {
        lookahead.set(BALL_DUR_DEFAULT)
      }
    )
    // 下发间隔（拍）= max(1, floor(段时长 / 每拍秒数))；用整数除法直接截断
    const everyTicks = f.localVariable('int')
    const calcTicks = f.dataTypeConversion(
      f.division(lookahead.value, driveDur.value),
      'int'
    )
    f.doubleBranch(
      f.lessThan(calcTicks, 1n),
      () => {
        everyTicks.set(1n)
      },
      () => {
        everyTicks.set(calcTicks)
      }
    )
    const pos = evt.params.pos
    const vel = evt.params.vel
    const spin = evt.params.spin
        const loc = f.getEntityLocationAndRotation(ball).location
        // ———— 预测目标（2026-10-30 平滑性修复）————
        // 旧做法直接把「内核上一拍的 pos」当目标：内核只 15Hz，目标天然落后一拍，
        // 于是每拍算出的 (target−cur) 忽大忽小 ⇒ 运动器每拍被换成速度不一致的一段
        // ⇒ 60fps 下看就是一顿一顿。改成朝 **pos + vel×dt**（预测位）走，
        // 相邻两段的衔接才连续。
        const predictedRaw = f._3dVectorAddition(pos, f._3dVectorZoom(vel, lookahead.value))
        // 预测位必须钳制在地面之上（数据实证：不钳制时实体 y 最低 −1.99m，球钻到地下）
        const predY = f.localVariable('float')
        f.doubleBranch(
          f.lessThan(f.split3dVector(predictedRaw).yComponent, GROUND_Y_MIN),
          () => {
            predY.set(GROUND_Y_MIN)
          },
          () => {
            predY.set(f.split3dVector(predictedRaw).yComponent)
          }
        )
        const predicted = f.create3dVector(
          f.split3dVector(predictedRaw).xComponent,
          predY.value,
          f.split3dVector(predictedRaw).zComponent
        )
        const delta = f._3dVectorSubtraction(predicted, loc)
        const dist = f._3dVectorModuloOperation(delta)
        // 位移速度 = (目标点 − 实体当前位置)/时长（docs/game-engine-knowledge/motion-devices.md §10 已验证配方：
        //   「直线设备的 velocity 显式算成 (target-current)/duration，可同时拿到精确到点与不漂移」）
        const velRaw = f._3dVectorZoom(delta, f.division(1.0, lookahead.value))
        // 速度夹紧
        const velLen = f._3dVectorModuloOperation(velRaw)
        const velScale = f.localVariable('float')
        f.doubleBranch(
          f.greaterThan(velLen, VEL_CAP),
          () => {
            velScale.set(f.division(VEL_CAP, velLen))
          },
          () => {
            velScale.set(1.0)
          }
        )
        const velToTarget = f._3dVectorZoom(velRaw, velScale.value)
        // 大跳用定点器瞬移（§10：定点器仍可用于 INSTANT_MOVEMENT，别全盘禁用）
        // 位移极小（球基本静止）时不重发设备，减少每拍设备 churn
        const tickNow = evt.params.tick
        const linDue = f.greaterThanOrEqualTo(
          f.subtraction(tickNow, f.get('fb_lin_tick')),
          1n
        )
        f.doubleBranch(
          f.logicalAndOperation(f.lessThan(dist, 0.012), f.logicalNotOperation(linDue)),
          () => {},
          () => {
        f.doubleBranch(
          f.greaterThan(dist, new float(TELEPORT_DIST)),
          () => {
            f.activateFixedPointMotionDevice(
              ball, 'fb_movex', MovementMode.InstantMovement, 0.0, pos,
              f.create3dVector(0.0, 0.0, 0.0), false, FixedMotionParameterType.FixedSpeed, 0.0
            )
          },
          () => {
            // ⚠️ 平移**必须用基础运动器**，不能与旋转设备一起混用定点器：
            //   motion-devices.md §10（2026-08-23 足球实证，日志 2828/2829）——同一 exec 链里
            //   「定点器匀速直线 + 旋转设备」= 直线设备被秒停、实体位置纹丝不动、只剩微量自旋。
            //   本轮真机日志 3412 复现同形态：参数照发、实体停在 (0,0.25,1.5)。
            // 参数：add_uniform_basic_linear_motion_device(实体, 设备名, 时长(秒), 速度向量(m/s))
            f.set('fb_lin_tick', tickNow)
            f.addUniformBasicLinearMotionDevice(ball, 'fb_movex', lookahead.value, velToTarget)
          }
        )
        // 旋转：世界轴 → 局部轴（YXZ 内旋），设备名 fb_spin
        // 用户指正（2026-10-27）：同时加多个运动器是可以的，**同名才会替换前者**。
        // ⇒ 位移设备与旋转设备名字必须不同且固定：fb_movex / fb_spinx（旧名 fb_phys 可能被历史设备占用）。
        const spd = f._3dVectorModuloOperation(spin)
        const rotDue = f.greaterThanOrEqualTo(
          f.subtraction(tickNow, f.get('fb_rot_tick')),
          4n
        )
        f.doubleBranch(
          f.logicalAndOperation(f.greaterThan(spd, new float(0.001)), rotDue),
          () => {
            const axis = f._3dVectorNormalization(spin)
            // 视觉自旋夹紧（2026-10-30）：真实滚动 ω=v/R ⇒ 10m/s 时 40rad/s=2292°/s，
            // 14Hz 渲染下每拍要转 164° ⇒ 观感是乱转。夹到 540°/s 内，保留方向感又不糊。
            // 物理侧的内核 ω 不受影响。
            // 不做视觉夹紧（用户口径：服务端不加额外限制，真实角速度直接下发）
            const angVel = f.multiplication(spd, 57.29578)
            const r = f.split3dVector(f.getEntityLocationAndRotation(ball).rotate)
            const negX = f.multiplication(r.xComponent, -1)
            const negY = f.multiplication(r.yComponent, -1)
            const negZ = f.multiplication(r.zComponent, -1)
            const afterY = f._3dVectorRotation(f.create3dVector(0.0, negY, 0.0), axis)
            const afterX = f._3dVectorRotation(f.create3dVector(negX, 0.0, 0.0), afterY)
            const localAxis = f._3dVectorRotation(f.create3dVector(0.0, 0.0, negZ), afterX)
            f.set('fb_rot_tick', tickNow)
            f.addUniformBasicRotationBasedMotionDevice(ball, 'fb_spinx', lookahead.value, angVel, localAxis)
          },
          () => {}
        )
          },
          () => {}
        )
      },
      () => {}
    )
  })

  // ———— 选项卡选中：锁存「活的玩家角色实体」————
  // 2026-10-29 三条通道实测后定谳：
  //   ① 玩家控制器实体坐标恒 (0, y, 0)（日志 3416：IN0:Vector=(0.0,0.472,0.0)）；
  //   ② 官方语义「角色实体根据模板动态初始化故无 GUID」⇒ queryEntityByGuid 拿不到活角色；
  //   ③ 20008 创造物技能图在 beyond 模式没有 getCurrentCharacter / getCharacterEntityOfSpecifiedPlayer /
  //      getActiveCharacterOfSpecifiedPlayer（编译期实测拒收，报错原文见 design/HUD-v1.md 附注）。
  // 官方 query nodes 里唯一输出「触发选项卡的角色实体」的是 whenTabIsSelected 的 selectorEntity（D318 实测为真坐标）。
  // 球上本来就挂「足球操作」选项卡（半径 5m、9 个选项），玩家选一次即锁存，之后内核按 GUID 每拍读位置。
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const carrier = f.queryEntityByGuid(1082130445n)
    f.setCustomVariable(carrier, 'fbc_e', evt.selectorEntity, false)
  })
