// @status: 渲染 v2（2026-10-31：与内核解耦，只做插值运动器，自己的时长参数 fb_dur）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828，挂球实体 1077936135）
//
// 职责边界（用户 2026-10-31 口径）：
//   · 物理全部在客户端内核（kit-loop）算完，本图**不做任何物理**；
//   · 本图有**自己的帧率/节奏参数**（球实体变量 fb_dur = 每段补间时长，默认 0.2s），
//     不读内核 dt、不读 Lua 帧时长；
//   · 每条 'B' 信号：朝**内核位 pos** 下发给运动器，段长 = fb_dur（缺省 1/拍频）
//     ⇒ 每拍正好走到内核位，零滞后零超前（不做 vel·dur 前瞻，那会稳定超前 P95 2.65m）。
//
// 两条硬教训（别改回去）：
//   ① 平移必须用**基础线性运动器**，不能与定点器混用同一链（motion-devices.md §10：定点器 + 旋转设备
//      同链 = 直线设备被秒停，日志 2828/2829、3412 两次复现）。
//   ② 线性设备与旋转设备**同拍下发、同一 duration**（2026-10-31 用户反馈「旋转与速度分离」）。
//   ③ 预测位 y 必须钳到地面之上（不钳制时实体最低 −1.99m，球钻地下）。
import { g } from 'genshin-ts/runtime/core'
import { float, int } from 'genshin-ts/runtime/value'

import { fbDriveBall } from './fb-composites.js'
import { KitSignal } from './signals.js'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

const GRAPH_ID = 1073741828
const TELEPORT_DIST = 5.0 // 单段位移超过此值 ⇒ 定点瞬移（防百米条纹）
const BALL_R = 0.25 // 滚动约束用的球半径（只在世界轴→局部轴换算时不需要，保留作注释常量）
// 球心贴地高度：内核物理已保证 y >= 0.25，渲染层不再钳制（目标直接取内核位）
const GROUND_Y_MIN = 0.25
const VEL_CAP = 30.0 // 位移速度上限（内核限速 18，留追赶余量）
const SPIN_EPS = 0.05 // 低于此角速度不发旋转设备（rad/s）
const RAD2DEG = 57.29577951308232
const BALL_DUR_VAR = 'fb_dur' // 球实体上的渲染节奏参数（每段补间时长，秒）
// 段长缺省 = 1/拍频（实测 7.41 拍/秒）。这个值**不是随便的**：段长 ≈ 拍间隔时
// 「目标=内核位」的插值器每拍正好走到位，稳态误差 0.00（离线回放 replay3.mjs）。
// 段长明显大于拍间隔（旧值 0.2）⇒ 每段中途被替换，球稳定滞后/超前半个身位。
const BALL_DUR_DEFAULT = 0.135

g
  .server({
    id: GRAPH_ID,
    name: '_GSTS_kitRender',
    // 设备下发节流用的拍号（只用于诊断，不参与物理）
    variables: { fb_lin_tick: new int(0), fb_rot_tick: new int(0) }
  })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    // 进球事件日志（离线判读用）
    f.doubleBranch(
      f.equal(evt.params.tag, 'G'),
      () => {
        print('fb-goal')
      },
      () => {}
    )
    // 只处理 'B'（每拍球状态）；'G'/'T' 不驱动渲染
    f.doubleBranch(
      f.equal(evt.params.tag, 'B'),
      () => {
        const ball = f.getSelfEntity()
        // ——— 渲染节奏：自己的参数，缺省 0.2s（0.04~0.6 之外视为未配置）———
        const durRaw = f.getCustomVariable(ball, BALL_DUR_VAR).asType('float')
        const dur = f.localVariable('float')
        f.doubleBranch(
          f.logicalAndOperation(f.greaterThan(durRaw, 0.04), f.lessThan(durRaw, 0.6)),
          () => { dur.set(durRaw) },
          () => { dur.set(BALL_DUR_DEFAULT) }
        )
        const pos = evt.params.pos
        const spin = evt.params.spin
        const loc = f.getEntityLocationAndRotation(ball).location
        // ——— 目标 = **内核当前位置**（不做 vel·dur 前瞻）———
        // 三条实测判据（离线回放日志 3457 的 459 个运动拍，脚本
        // `.scratch/football-phys-audit/replay3.mjs`）：
        //   ① 目标写成 pos + vel·dur 时，dur(0.2) 比拍间隔(0.135) 大 ⇒ 球被推到内核
        //      前面并稳定超前 p95 **2.65 m**（射门判定的视觉/逻辑会差半个身位）；
        //   ② 目标 = pos、dur ≈ 拍间隔 ⇒ 稳态每拍正好走到内核位，误差 p50/p95 都是 **0.00**；
        //   ③ 瞬移判据只能用 |pos − loc|。旧判据 |predicted − loc| 把前瞻距离算进去，
        //      19 m/s 时恒 6.2 > 5.0 ⇒ 高速段**每拍瞬移**、线性/旋转设备从不工作
        //      （实测 nframes=42 且帧里没有 fb_spinx，球在空中完全不转）。
        // 所以：delta = pos − loc，判据 = |delta|，速度 = delta/dur。
        const delta = f._3dVectorSubtraction(pos, loc)
        const chase = f._3dVectorModuloOperation(delta)
        f.doubleBranch(
          f.greaterThan(chase, TELEPORT_DIST),
          () => {
            // 真·大跳（球被重置/回中）：定点瞬移到内核位，本拍不发旋转设备
            f.activateFixedPointMotionDevice(
              ball,
              'fb_movex',
              MovementMode.InstantMovement,
              0.0,
              pos,
              f.create3dVector(0.0, 0.0, 0.0),
              false,
              FixedMotionParameterType.FixedSpeed,
              0.0
            )
          },
          () => {
            // 速度 = (目标 − 当前)/段长：段结束时精确到点，且相邻两段速度连续
            const velRaw = f._3dVectorZoom(delta, f.division(1.0, dur.value))
            const velLen = f._3dVectorModuloOperation(velRaw)
            const velScale = f.localVariable('float')
            f.doubleBranch(
              f.greaterThan(velLen, VEL_CAP),
              () => { velScale.set(f.division(VEL_CAP, velLen)) },
              () => { velScale.set(1.0) }
            )
            const velToTarget = f._3dVectorZoom(velRaw, velScale.value)
            f.set('fb_lin_tick', evt.params.tick)
            // 下发交给复合：线性 + 旋转同拍、同一段长（世界→局部轴换算在复合内）
            f.callComposite(fbDriveBall, {
              ball,
              dur: dur.value,
              vel: velToTarget,
              spin,
              spinEps: new float(SPIN_EPS)
            })
          }
        )
      },
      () => {}
    )
  })

  // ———— 选项卡选中：锁存「活的玩家角色实体」（内核算玩家速度/瞄准的兜底通道）————
  // 玩家控制器实体坐标恒 (0,y,0)；官方语义「角色实体动态初始化故无 GUID」；
  // 20008 图没有 getCurrentCharacter 等节点（编译期实测拒收）。
  // ⇒ 唯一可用的是 whenTabIsSelected 的 selectorEntity（D318 实测为真坐标）。
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const carrier = f.queryEntityByGuid(1082130445n)
    f.setCustomVariable(carrier, 'fbc_e', evt.selectorEntity, false)
  })
