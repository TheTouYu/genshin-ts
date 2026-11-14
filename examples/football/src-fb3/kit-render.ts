// @status: 渲染 v2（2026-10-31：与内核解耦，只做插值运动器，自己的时长参数 fb_dur）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828，挂球实体 1077936135）
//
// 职责边界（用户 2026-10-31 口径）：
//   · 物理全部在客户端内核（kit-loop）算完，本图**不做任何物理**；
//   · 本图有**自己的帧率/节奏参数**（球实体变量 fb_dur = 每段补间时长，默认 0.2s），
//     不读内核 dt、不读 Lua 帧时长；
//   · 每条 'B' 信号：目标 = 内核位 pos + 前瞻 vel·(dur−拍间隔)，段长 = fb_dur
//     （缺省 0.2 = 1.48×拍间隔）。前瞻只补段长覆盖差——整段前瞻（vel·dur）才会
//     稳定超前 P95 2.65m；覆盖差前瞻稳态滞后不变（一拍位移），丢拍冻结 −90%。
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

const GRAPH_ID = 1073741828
const BALL_R = 0.25 // 滚动约束用的球半径（只在世界轴→局部轴换算时不需要，保留作注释常量）
// 球心贴地高度：内核物理已保证 y >= 0.25，渲染层不再钳制（目标直接取内核位）
const GROUND_Y_MIN = 0.25
const VEL_CAP = 30.0 // 插值分支的位移速度上限（内核限速 22，留追赶余量）
// （FREEZE-TEST：RECOVER_SPEED/TELEPORT_DIST 随定点器分支一并移除，恢复见 git）
const SPIN_EPS = 0.05 // 低于此角速度不发旋转设备（rad/s）
const RAD2DEG = 57.29577951308232
const BALL_DUR_VAR = 'fb_dur' // 球实体上的渲染节奏参数（每段补间时长，秒）
// 段长缺省 = 1/拍频的 1.48×。S1/S2 定谳（2026-11-02 用户「关日志仍小卡顿」）：
//   · 定点器不能进插值分支——官方指南 §12-8 无「定点+旋转叠加」语义记载，
//     motion-devices.md §10（日志 2828/2829）：同链定点器+旋转 ⇒ 直线被秒停；
//     §10 给出的「到点+自旋」正确组合就是基础线性+基础旋转（= 现行方案，保持）。
//   · 卡顿根因=段长=拍间隔：内核一拍迟到 ⇒ 上一段已到期 ⇒ 球冻结一拍。
//     段长 0.2（1.48×）+ 前瞻 vel·(dur−拍间隔)：丢拍冻结 −90%（replay4 实测），
//     稳态滞后不变（仍一拍位移）；fb_dur 调回 0.135 自动退化为旧行为。
const BALL_DUR_DEFAULT = 0.2
const TICK_INTERVAL = 0.135 // 实测拍间隔（7.41 拍/秒）；前瞻公式 dur−拍间隔 用

g
  .server({
    id: GRAPH_ID,
    name: '_GSTS_kitRender',
    // 设备下发节流用的拍号（只用于诊断，不参与物理）
    // FREEZE-TEST（2026-11-14）双钟打点：
    // · fb_ts = 每拍 'B' 到达时的服务端 UTC 时间戳（queryTimestampUtc0，详情帧流留帧）
    //   ——f3 只有整秒，用它测亚秒到达间隔；精度若为秒级则此打点作废。
    // · fb_t_srv = 每拍读球实体全局计时器 fb_clk（root12 资产：assets:global-timers create
    //   --name fb_clk --positive + attach --entity 1077936163，会话内相对钟）；
    //   首拍读 ≤0.001 ⇒ startGlobalTimer 自启动（幂等：只在未启动时启，避免每拍归零）。
    variables: {
      fb_lin_tick: new int(0),
      fb_rot_tick: new int(0),
      fb_ts: new int(0),
      fb_t_srv: new float(0)
    }
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
        // FREEZE-TEST 打点：服务端 UTC 时间戳写入图变量，详情帧流每拍留帧（到达时刻）
        f.set('fb_ts', f.queryTimestampUtc0())
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
        const vel = evt.params.vel
        const spin = evt.params.spin
        const loc = f.getEntityLocationAndRotation(ball).location
        // ——— 目标 = 内核位 + 前瞻 vel·(dur−拍间隔) ———————————————————————————
        // S2（2026-11-02 用户「小卡顿」）：段长=拍间隔时，内核一拍迟到 ⇒ 上一段设备
        // 已到期 ⇒ 球冻结到下一条 'B'。段长放大到 1.48×（0.2 vs 0.135），前瞻只补
        // **覆盖差**（不是整段 vel·dur——那会稳定超前 p95 2.65m）。稳态滞后仍=一拍位移。
        // 离线丢拍仿真 replay4-droptick.mjs：每 8 拍丢 1 条 'B' 冻结拍 56→6（−90%），
        // 无丢拍代价 err p95 0.24m。fb_dur 调回 0.135 ⇒ 前瞻=0，自动退回旧行为。
        // 前瞻量 L = max(0, dur−0.02)。稳态可见滞后 = v·(dur−L)（3461 实测 5-8m/s 时
        // 滞后 0.9-1.1m=v·0.135 ⇒ 可见球=内核球−1m=玩家腿间 ⇒ 与步幅打击区叠加成连续碰撞）。
        // L→dur−0.02 把滞后压到 0.02v（7m/s 时 0.14m）；丢 1 拍时段恰好走完到目标，无冻结。
        const laTime = f.localVariable('float')
        f.doubleBranch(
          f.greaterThan(dur.value, 0.02),
          () => { laTime.set(f.subtraction(dur.value, 0.02)) },
          () => { laTime.set(0.0) }
        )
        const laRaw = f._3dVectorAddition(pos, f._3dVectorZoom(vel, laTime.value))
        // 前瞻 y 钳到地面之上（老教训③：下落段 vel.y·前瞻会把目标压到地下，球钻草皮）
        const laY = f.localVariable('float')
        f.doubleBranch(
          f.lessThan(f.split3dVector(laRaw).yComponent, GROUND_Y_MIN),
          () => { laY.set(GROUND_Y_MIN) },
          () => { laY.set(f.split3dVector(laRaw).yComponent) }
        )
        const target = f.create3dVector(
          f.split3dVector(laRaw).xComponent,
          laY.value,
          f.split3dVector(laRaw).zComponent
        )
        // ——— FREEZE-TEST（2026-11-14 用户令）：「大差距追赶」定点器分支临时移除 ——————————
        // 原逻辑：chase = |内核位 − 屏上位| > 5.0 时走 activateFixedPointMotionDevice
        // （匀速直线 / FixedSpeed 60 / lockRotation=true）回追。用户怀疑冻结拍与定点器
        // 切换有关（冻结检测：踢出盲窗 14 + 飞行 22% + 快滚 32% 拍冻结；63 次 TELE 全是
        // 静止球复位回走）。移除后所有拍（含大差距）一律走基础线性插值分支，速度上限
        // 由 VEL_CAP=30 兜底（60→30 的代价：20m 级重置回程从 0.33s 变 0.67s，观感偏慢）。
        // 恢复方法：git revert 本提交或对照 kit-render.ts@HEAD 的 chase doubleBranch 段。
        // 速度 = (目标 − 当前)/段长：目标含前瞻 ⇒ 覆盖差被前瞻吃掉，段被替换时无冻结
        const velRaw = f._3dVectorZoom(f._3dVectorSubtraction(target, loc), f.division(1.0, dur.value))
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
        // FREEZE-TEST（放末尾=防御序：即使计时器节点异常，运动指令已先行下发）：
        // 读球实体全局计时器 fb_clk（会话相对钟，秒）写图变量留帧；首拍读 ≤0.001 自启动一次
        const tSrv = f.getCurrentGlobalTimerTime(ball, 'fb_clk')
        f.set('fb_t_srv', tSrv)
        f.doubleBranch(
          f.lessThan(tSrv, 0.001),
          () => { f.startGlobalTimer(ball, 'fb_clk') },
          () => {}
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
