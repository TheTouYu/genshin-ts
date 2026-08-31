// 足球 v5 三层架构 · 带球决策图（挂球实体 1077936135，图 1073741828——接管 v4 dribble-field）
//
// 职责重定义（v4→v5 的本质变化）：高阶使用方，不再是控制器——
//   v4：感知+计算+挂设备一体（ballVx/Vz/spinW 自持记忆，直接驱动 dribbleCtrl/角度设备）
//   v5：感知+算冲量，输出写黑板 impVel（DEFERRED 队列）；速度/自旋/位置真相全在逻辑层
//        黑板，设备全在渲染层。零设备挂载、零状态机写入（获得请求走 ball_set_state 信号）
//
// 决策律（R4 手感数学等价）：每拍 Δv = newVel − vel，其中
//   引导拍 newVel = vel + (target−vel)·G（G=d/(d+C_eff)，C_eff=drive?2.0:4.0）
//   触球拍（进区上升沿）newVel = touch 向量（dir×max(3.0, 1.8×vFinal)）
//   ——即把 v4 速度收敛律逐拍差分成冲量序列；R4 参数（0.3/0.7、1.2、1.8/3.0、2.0/4.0）
//   全部封装在 dribbleFieldCompute 复合内原样复用，手感可保真。
//
// 循环生命周期（state_changed 遥控，空转治理）：
//   CARRIED → dribble_loop 0.12s（决策拍）+ drivePrev 复位；IDLE → idle_scan 0.5s（待机获得判定）；
//   其他态（FLY/ROLL/SLIDE/GOAL）→ 全停。
// 已知取舍：冲量走 DEFERRED 队列延迟 1 拍（0.12s）；触球拍如需零延迟，二期改发
// ball_impulse(mode=IMMEDIATE) 信号插队（API 已预留，勿新增通道）。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str, vec3 } from 'genshin-ts/runtime/value'
import { dribbleFieldGetRole, dribbleFieldCompute } from './composites/dribble-field.js'
import { Signal } from './resources/signals.js'
import { BALL_IDLE, BALL_CARRIED } from './composites/ball-state.js'

// 牵引区几何门（与 v4 dribbleFieldTick 同值；获得门=同圈对齐，见 idle_scan 内联判定）
const PULL_DIST2 = 2.25 // 1.5m 前半圆
const PULL_FWD_MIN = -0.3 // 身后门
const CONV_C = 2.0 // 驱动拍收敛常数
const COAST_C = 4.0 // 出区缓刹常数
const DRIBBLE_TICK = 0.5 // 决策拍距（2026-08-31 降载联动；原 0.12）
const IDLE_SCAN_T = 0.5 // IDLE 待机心跳（获得判定；二期可换命中检测事件驱动，零心跳）
const DRIBBLE_LOOP = 'dribble_loop'
const IDLE_SCAN = 'idle_scan'

// ================================================================
// 决策拍（文件内复合）：读玩家实时 + 黑板 → 算 Δv 冲量 → 写 impVel（+= 队列语义）
// ================================================================
const ballDribbleDecide = g.defineComposite('ball_dribble_decide', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  build: ({ e }, f) => {
    // 感知：玩家实时（直读实体——感知零延迟，只有决策输出走一拍队列）
    const roleC = f.callComposite(dribbleFieldGetRole, {  })
    const role = roleC.role
    const roleLoc = f.getEntityLocationAndRotation(role)
    const playerFwd = f.getEntityForwardVector(role)
    const playerSpd = f.queryCharacterSCurrentMovementSpd(role).currentSpeed
    // 黑板：球速/球位（逻辑层唯一发布）。vel 先物化到图变量快照——后续 Δv/conv
    // 全部消费快照（表达式引用在 set 帧会重求值，读到 drain 已更新的黑板 → 爆炸）
    const sVel = f.registerExecNode('set_node_graph_variable', [new str('tmpSnapVel'), f.getCustomVariable(e, new str('vel')).asType('vec3'), new bool(false)])
    const sPos = f.registerExecNode('set_node_graph_variable', [new str('tmpSnapPos'), f.getCustomVariable(e, new str('pos')).asType('vec3'), new bool(false)])
    f.connect(sVel, 0, sPos, 0)
    const boardVel = f.getNodeGraphVariable('tmpSnapVel').asType('vec3')
    const boardPos = f.getNodeGraphVariable('tmpSnapPos').asType('vec3')

    // 纯数据计算（v4 复合原样复用：dir 合成/k(fwd)/vTarget/touch 向量/几何量）
    const comp = f.callComposite(dribbleFieldCompute, { playerPos: roleLoc.location, playerFwd, playerSpd, ballPos: boardPos })

    // 几何门（每拍实时）
    const distOk = f.lessThan(comp.dist2, PULL_DIST2)
    const fwdOk = f.greaterThan(comp.fwd, PULL_FWD_MIN)
    const drive = f.logicalAndOperation(distOk, fwdOk)
    // 触球拍 = 进区上升沿（图变量 drivePrev）
    const drivePrev = f.getNodeGraphVariable('drivePrev').asType('bool')
    const edge = f.logicalAndOperation(drive, f.logicalNotOperation(drivePrev))
    const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
    const driveF = b2f(drive)

    // G 律冲量化：target = drive ? vFinal 向量 : 0；conv = vel + (target−vel)·G
    const targetX = f.multiplication(comp.newVelX, driveF)
    const targetZ = f.multiplication(comp.newVelZ, driveF)
    const bv = f.split3dVector(boardVel)
    const diffX = f.subtraction(targetX, bv.xComponent)
    const diffZ = f.subtraction(targetZ, bv.zComponent)
    const distDiff = f._3dVectorModuloOperation(f.create3dVector(diffX, 0, diffZ))
    const cEff = f.addition(
      f.multiplication(CONV_C, driveF),
      f.multiplication(COAST_C, f.subtraction(1, driveF))
    )
    const gNl = f.division(distDiff, f.addition(distDiff, cEff))
    const convX = f.addition(bv.xComponent, f.multiplication(diffX, gNl))
    const convZ = f.addition(bv.zComponent, f.multiplication(diffZ, gNl))
    // 触球拍全额替换（数据选择 conv·(1−eF) + touch·eF）
    const eF = b2f(edge)
    const keepF = f.subtraction(1, eF)
    const newVelX = f.addition(f.multiplication(convX, keepF), f.multiplication(comp.touchX, eF))
    const newVelZ = f.addition(f.multiplication(convZ, keepF), f.multiplication(comp.touchZ, eF))
    // 冲量 = 新速度 − 当前速度
    const dVx = f.subtraction(newVelX, bv.xComponent)
    const dVz = f.subtraction(newVelZ, bv.zComponent)

    // 写黑板 impVel（+= 队列语义，与其他使用方共存；逻辑层 drain 读后清零）
    // 覆盖式写（2026-08-31 队列竞态修复，日志 20-02-57 铁证）：两 0.5s loop 相位错开时
    // += 语义按旧 vel 连续多拍累积 → impVel 线性爆炸到 ±20 → drain 叠进 vel → 球一拍
    // 弹射 12 米。改 = 语义：每拍覆盖本拍 Δv，drain 消费一次、期间覆盖只丢拍不累积
    //（丢拍无害：下拍按最新黑板 vel 重算 Δv）。
    const nIv = f.create3dVector(dVx, 0, dVz)
    f.setCustomVariable(e, 'impVel', nIv, false)
    // drivePrev 写回（上升沿检测记忆——本图唯一记忆）
    f.setNodeGraphVariable('drivePrev', drive, false)
    return {}
  }
})

// ================================================================
// 带球决策根图
// ================================================================
const graph = g
  .server({
    id: 1073741828,
    variables: {
      // 进区上升沿检测（上一拍是否在牵引区；触球拍冲量用）
      drivePrev: new bool(false),
      // 黑板 vel 物化快照（2026-08-31 重求值陷阱修复，日志 20-09-26 铁证：Δv 的
      // Subtraction 帧 bv=0 算出 2.07，set 帧重求值时 825 drain 已更新黑板 vel=12.96
      // → 写入 -11.1 → 冲量反向爆炸。v4 tmpDribbleVel 物化纪律的 v5 继承）
      tmpSnapVel: new vec3([0, 0, 0]),
      // pos 物化快照（同族扩展：与 vel 同级风险——compute 多消费点 D/Dn/dist2，
      // 825 每拍更新 pos，重求值会致几何帧间不一致）
      tmpSnapPos: new vec3([0, 0.25, 0])
    }
  })
  // 实体创建：启动 IDLE 待机心跳（常驻自愈：state_changed 到来时会被启停修正）
  .on('whenEntityIsCreated', (evt: any, f: any) => {
    f.startTimer(f.getSelfEntity(), IDLE_SCAN, true, f.assemblyList([IDLE_SCAN_T], 'float'))
  })
  // ================================================================
  // 状态广播：决策循环遥控
  //   CARRIED → 决策 loop + drivePrev 复位（重新触球必为上升沿）
  //   IDLE → 待机心跳（获得判定）
  //   其他态 → 全停（零定时器）
  // ================================================================
  .onSignal(Signal.state_changed, (evt: any, f: any) => {
    const ball = f.getSelfEntity()
    const next = evt.params.next
    const toCarried = f.equal(next, new int(BALL_CARRIED))
    const toIdle = f.equal(next, new int(BALL_IDLE))
    f.doubleBranch(
      toCarried,
      () => {
        f.stopTimer(ball, IDLE_SCAN)
        f.setNodeGraphVariable('drivePrev', new bool(false), false)
        f.startTimer(ball, DRIBBLE_LOOP, true, f.assemblyList([DRIBBLE_TICK], 'float'))
        // 立即首拍决策（获得瞬间即响应，不等 0.12s）
        const dec = f.callComposite(ballDribbleDecide, { e: ball })
      },
      () => {
        f.doubleBranch(
          toIdle,
          () => {
            f.stopTimer(ball, DRIBBLE_LOOP)
            f.startTimer(ball, IDLE_SCAN, true, f.assemblyList([IDLE_SCAN_T], 'float'))
          },
          () => {
            // FLY/ROLL/SLIDE/GOAL：全停（决策图零负载）
            f.stopTimer(ball, DRIBBLE_LOOP)
            f.stopTimer(ball, IDLE_SCAN)
          }
        )
      }
    )
  })
  // ================================================================
  // 定时器：dribble_loop（决策拍）/ idle_scan（获得判定 → ball_set_state 请求）
  // ================================================================
  .on('whenTimerIsTriggered', (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.timerName, new str(DRIBBLE_LOOP)),
      () => {
        f.callComposite(ballDribbleDecide, { e: f.getSelfEntity() })
      },
      () => {
        f.doubleBranch(
          f.equal(evt.timerName, new str(IDLE_SCAN)),
          () => {
            // 获得判定（内联，2026-08-31 死区死锁修复）：距离门对齐牵引圈 PULL_DIST2=2.25(1.5m)
            // ——v4 statePossessCheck 的 2m 口径是"滚动球滑停接管"设计，v5 仅从静止球获得；
            // 2m 获得圈 + 1.5m 牵引圈会在环带内 CARRIED 死锁（实测 1.797m 球全链空转 20s）。
            // 门 = dist²<2.25 ∧ 球速<3.5 ∧ fwd>−0.3（前向门沿用）
            const ball = f.getSelfEntity()
            const roleC = f.callComposite(dribbleFieldGetRole, {  })
            const role = roleC.role
            const d = f._3dVectorSubtraction(f.getCustomVariable(ball, new str('pos')).asType('vec3'), f.getEntityLocationAndRotation(role).location)
            const dist2 = f._3dVectorDotProduct(d, d)
            const near = f.lessThan(dist2, PULL_DIST2)
            const spd = f._3dVectorModuloOperation(f.getCustomVariable(ball, new str('vel')).asType('vec3'))
            const slow = f.lessThan(spd, 3.5)
            const Dn = f._3dVectorNormalization(d)
            const fwd = f._3dVectorDotProduct(f.getEntityForwardVector(role), Dn)
            const front = f.greaterThan(fwd, PULL_FWD_MIN)
            const canCarry = f.logicalAndOperation(f.logicalAndOperation(near, slow), front)
            f.doubleBranch(
              canCarry,
              () => {
                // 请求获得：守卫终审在逻辑层 ballStateTransition（获得守卫仅地面态）
                f.sendSignal(
                  Signal.ball_set_state,
                  new int(BALL_CARRIED),
                  f.getCustomVariable(ball, new str('vel')).asType('vec3')
                )
              },
              () => {}
            )
          },
          () => {}
        )
      }
    )
  })

export default graph
