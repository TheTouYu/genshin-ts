// @status: 渲染 v3（2026-11-14：B 方案——渲染图自主节拍，信号驱动退役）
// fb3/kit-render.ts —— 20000 服务端渲染图（1073741828，挂球实体 1077936163）
//
// 定谳背景（2026-11-14 日志 3474 + fb_t_srv 打点）：'B' 信号到达节拍抖动
// 0.001~0.809s（成簇+空洞交替，冻结拍 82% 是 <0.10s 簇内拍，r=0.55）——
// 信号驱动渲染注定被到达抖动传染。用户裁决 B 方案（回到 v2 双图拆分架构）：
//   · 数据图（kit-listen）每拍 'B' 只做镜像落变量 + fb_rtick 倒计时续命；
//   · 本图 by fb_rtick（0.15s 倒计时）到期事件自主节拍，只读镜像变量：
//       target = pos + vel × clamp(now − tRecv, 0, 0.45)   ← 外推吃掉到达抖动
//     簇到达→倒计时不断被重置→渲染不触发（去抖）；0.15s 无新拍→到期→自主走拍。
//
// 休眠门：球静止（|vel|≤0.08 且 |loc−pos|≤0.25）⇒ 不续倒计时（渲染休眠，
// 零定时器零设备；数据图下一拍 'B' 的 startGlobalTimer 即唤醒）。
//
// 瞬移门（数据跳变判据，不是追赶滞后）：|pos − prevPos| > 5 m/拍 = 非物理跳变
// （重置/回中）⇒ InstantMovement 瞬到外推位。飞行空洞后的追赶滞后（≤13m）走
// 插值分支 30 m/s 兜底追，不误入瞬移。
//
// 打点保留：fb_ts（UTC 秒锚）/ fb_t_srv（fb_clk 亚秒）——渲染节拍均匀性直接可测。
// 三条硬教训（继承 v2，别改回去）：①平移只用基础线性运动器（定点器+旋转同链互秒停，
// motion-devices.md §10）；②线性与旋转同拍同 duration；③外推 y 钳地面之上。
import { g } from 'genshin-ts/runtime/core'
import { float, int } from 'genshin-ts/runtime/value'

import { fbDriveBall } from './fb-composites.js'
import { KitSignal } from './signals.js'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

const GRAPH_ID = 1073741828
const GROUND_Y_MIN = 0.25 // 内核物理已保证 y ≥ 0.25；外推下落段压低目标时钳回地面
const VEL_CAP = 45.0 // 插值分支位移速度上限（2026-11-17 30→45：内核限速 22+信号空洞追赶需
// (gap+前瞻)/0.12 可达 40+，被 30 钳住=高速球渲染追不上内核球，视觉滞后累积后跳变——票 27 #1）
const JUMP_DIST = 5.0 // 数据跳变门：单拍镜像位移超过此值 = 重置/回中（非物理）
const EXTRAP_MAX = 0.45 // 外推上限：信号空洞 >0.45s 后目标冻结在 0.45s 外推位
const ALIVE_VEL = 0.08 // 休眠门：镜像速度 ≤ 此值且已到位 ⇒ 渲染休眠
const ALIVE_OFF = 0.25 // 休眠门：|loc − pos| ≤ 此值 ⇒ 已到位
const SPIN_EPS = 0.05 // 低于此角速度不发旋转设备（rad/s）
const BALL_DUR_VAR = 'fb_rdur' // 球实体上的段长参数（秒，2026-11-17 用户口径）
const BALL_DUR_DEFAULT = 0.12 // 每段渲染持续时长：节拍 fb_rfreq=0.1 的 1.2× 覆盖差
//   （防定时器实际 0.12s 才触发下一次时球冻结——段长 ≥ 实际触发间隔即无空洞）
const FB_CLK = 'fb_clk' // 正计时秒表（接收时刻基准）
const FB_RTICK = 'fb_rtick' // 0.1s 倒计时（本图节拍源，= fb_rfreq 真值）

g
  .server({
    id: GRAPH_ID,
    name: '_GSTS_kitRender',
    // fb_ts/fb_t_srv=打点；fb_pp*=上一渲染拍的镜像 pos（数据跳变门用）
    variables: {
      fb_ts: new int(0),
      fb_t_srv: new float(0),
      fb_ppx: new float(0),
      fb_ppy: new float(0),
      fb_ppz: new float(0)
    }
  })
  // ———— 'G' 进球打点（唯一保留的信号处理；'B' 数据面已移交 kit-listen 镜像）————
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.params.tag, 'G'),
      () => { print('fb-goal') },
      () => {}
    )
  })
  // ———— 自主节拍：fb_rtick 倒计时到期驱动（B 方案核心）————
  // 事件名勘误（2026-11-17，日志 3480 定谳）：全局计时器（root12 资产 + startGlobalTimer）
  // 到期发的是 whenGlobalTimerIsTriggered；whenTimerIsTriggered 是【图内定时器】
  // （f.timers.setTimeout/setInterval 系）的事件——监听它 30 秒零触发（166 条全是
  // 'G' 空转）。payload: eventSourceEntity/eventSourceGuid/timerName。
  // 不做 timerName 过滤：球实体上唯一发事件的计时器就是 fb_rtick（fb_clk 正计时
  // 不发事件），且主体内已有双层 doubleBranch 嵌套，再包一层会踩 D625 三层嵌套坑。
  .on('whenGlobalTimerIsTriggered', (_evt: any, f: any) => {
    const ball = f.getSelfEntity()
    // —— 渲染目标实体可切换（2026-11-17 用户指令：球实体变量 fb_rball_guid 存
    //    「渲染用的足球模型 GUID」，0=用挂载实体自身）——物理球（镜像源）与
    //    渲染球解耦：222 图元的真球实体每拍被设备驱动有装饰物过重嫌疑，
    //    可切到简易模型对照（当前=1077936165）。——
    const RBALL_VAR = 'fb_rball_guid'
    const rGuid = f.getCustomVariable(ball, RBALL_VAR).asType('int')
    const rball = f.localVariable('entity')
    f.doubleBranch(
      f.greaterThan(rGuid, 0n),
      () => { rball.set(f.queryEntityByGuid(f.dataTypeConversion(rGuid, 'bigint'))) },
      () => { rball.set(ball) }
    )
    // —— 读镜像 + 时钟（多消费点全部物化）——
    const now = f.getCurrentGlobalTimerTime(ball, FB_CLK)
    f.set('fb_ts', f.queryTimestampUtc0())
    f.set('fb_t_srv', now)
    const px = f.localVariable('float')
    px.set(f.getCustomVariable(ball, 'fb_rpx').asType('float'))
    const py = f.localVariable('float')
    py.set(f.getCustomVariable(ball, 'fb_rpy').asType('float'))
    const pz = f.localVariable('float')
    pz.set(f.getCustomVariable(ball, 'fb_rpz').asType('float'))
    const vx = f.getCustomVariable(ball, 'fb_rvx').asType('float')
    const vy = f.getCustomVariable(ball, 'fb_rvy').asType('float')
    const vz = f.getCustomVariable(ball, 'fb_rvz').asType('float')
    const sx = f.getCustomVariable(ball, 'fb_rsx').asType('float')
    const sy = f.getCustomVariable(ball, 'fb_rsy').asType('float')
    const sz = f.getCustomVariable(ball, 'fb_rsz').asType('float')
    const tRecv = f.getCustomVariable(ball, 'fb_rtrecv').asType('float')
    const pos = f.create3dVector(px.value, py.value, pz.value)
    const vel = f.create3dVector(vx, vy, vz)
    const spin = f.create3dVector(sx, sy, sz)
    // —— 外推 dt = clamp(now − tRecv, 0, EXTRAP_MAX)：吃掉到达抖动 ——
    const dtRaw = f.subtraction(now, tRecv)
    const dt = f.localVariable('float')
    f.doubleBranch(
      f.greaterThan(dtRaw, EXTRAP_MAX),
      () => { dt.set(EXTRAP_MAX) },
      () => {
        f.doubleBranch(
          f.lessThan(dtRaw, 0.0),
          () => { dt.set(0.0) },
          () => { dt.set(dtRaw) }
        )
      }
    )
    const laRaw = f._3dVectorAddition(pos, f._3dVectorZoom(vel, dt.value))
    // 外推 y 钳地面之上（老教训③：下落段 vel.y·外推会把目标压到地下）
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
    // —— 段长：球实体 fb_rdur（0.04~0.6 之外视为未配置，缺省 0.12=节拍 1.2×）——
    const durRaw = f.getCustomVariable(ball, BALL_DUR_VAR).asType('float')
    const dur = f.localVariable('float')
    f.doubleBranch(
      f.logicalAndOperation(f.greaterThan(durRaw, 0.04), f.lessThan(durRaw, 0.6)),
      () => { dur.set(durRaw) },
      () => { dur.set(BALL_DUR_DEFAULT) }
    )
    const loc = f.getEntityLocationAndRotation(rball.value).location
    // —— 数据跳变门：|pos − prevPos| > JUMP_DIST ⇒ 重置/回中 ⇒ 瞬移到外推位 ——
    const prevPos = f.create3dVector(f.get('fb_ppx'), f.get('fb_ppy'), f.get('fb_ppz'))
    const jump = f._3dVectorModuloOperation(f._3dVectorSubtraction(pos, prevPos))
    f.doubleBranch(
      f.greaterThan(jump, JUMP_DIST),
      () => {
        // InstantMovement（v2 fbTeleport 同款）：lockRotation=true 保留朝向；
        // 本分支不发旋转设备，与 §10 定点器+旋转冲突无关。
        f.activateFixedPointMotionDevice(
          rball.value,
          'fb_movex',
          MovementMode.InstantMovement,
          0.0,
          target,
          f.create3dVector(0.0, 0.0, 0.0),
          true,
          FixedMotionParameterType.FixedSpeed,
          dur.value
        )
      },
      () => {
        // —— 常态：插值追赶 —— 速度=(目标−当前)/段长，VEL_CAP 兜底（飞行空洞后
        // 滞后大时以 30 m/s 追，2~3 拍内追上，平滑不瞬移）——
        const velRaw2 = f._3dVectorZoom(
          f._3dVectorSubtraction(target, loc),
          f.division(1.0, dur.value)
        )
        const velLen = f._3dVectorModuloOperation(velRaw2)
        const velScale = f.localVariable('float')
        f.doubleBranch(
          f.greaterThan(velLen, VEL_CAP),
          () => { velScale.set(f.division(VEL_CAP, velLen)) },
          () => { velScale.set(1.0) }
        )
        const velCmd = f._3dVectorZoom(velRaw2, velScale.value)
        f.callComposite(fbDriveBall, {
          ball: rball.value,
          dur: dur.value,
          vel: velCmd,
          spin,
          spinEps: new float(SPIN_EPS)
        })
      }
    )
    // —— 休眠门：球在动或没到位 ⇒ 续命 0.15s；静止 ⇒ 不续（渲染休眠，'B' 唤醒）——
    const velAbs = f._3dVectorModuloOperation(vel)
    const off = f._3dVectorModuloOperation(f._3dVectorSubtraction(pos, loc))
    f.doubleBranch(
      f.logicalOrOperation(f.greaterThan(velAbs, ALIVE_VEL), f.greaterThan(off, ALIVE_OFF)),
      () => { f.startGlobalTimer(ball, FB_RTICK) },
      () => {}
    )
    // —— prevPos 落盘（下拍数据跳变门）——
    f.set('fb_ppx', px.value)
    f.set('fb_ppy', py.value)
    f.set('fb_ppz', pz.value)
  })
  // ———— 选项卡选中：锁存「活的玩家角色实体」（内核算玩家速度/瞄准的精准通道）————
  // whenTabIsSelected 的 selectorEntity = 玩家当前操作的真角色（比 kit-listen 的
  // 解析链更准：多角色/换人时解析链的 [0] 可能不是当前角色）。
  .on('whenTabIsSelected', (evt: any, f: any) => {
    const carrier = f.queryEntityByGuid(1082130445n)
    f.setCustomVariable(carrier, 'fbc_e', evt.selectorEntity, false)
  })
