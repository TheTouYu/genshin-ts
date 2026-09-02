// 足球 R2·fb-server（服务端图 1073741830，T3 握手节拍服务端半边，票 02，2026-09-03，地图 1073741908）
//
// 挂载：球实体 1077936135（票 02 从关卡实体 1094713345 挪挂——getSelfEntity=球，
//   v4 挂球成熟先例；球实体=唯一状态容器（票 01 用户 09-03 裁决），gate/镜像 11 直写零寻址）。
// 接口事实（票 01 终态，优先于 R2-DESIGN §4 旧文"挂玩家实体"——已被推翻）：
//   · 球实体 1077936135：fb_ball_gate:int + 镜像 11（fb_ball_tick/state:int + px..sz:float×9）+ fb_p_* 19
//   · fb_ball_entity:entity 挂丘丘人 def 1082130433 + 5 实体 1082130437..441（def=模板副本，
//     运行时不可寻址不写；5 实例由本图会话种子逐个写球引用；fb-phys 读链 getSelfEntity→读引用→读球变量）
//   · E1 寄存器 fb_epoch/fb_ack/fb_sum/fb_t1..t8 挂玩家实体 1086324737 副本（owner 链照旧）
// 状态枚举（sim/src/state.ts 单一事实源，03 票 fb-phys 必须同枚举）：
//   0=Airborne 1=Bouncing 2=Sliding 3=Rolling 4=Rest 5=DribbleControlled
// 任务载荷 fb_t1..t8（R2-DESIGN §4 编码）：t1=type（1=KICK / 2=RESET / 3=PARAM 预留 / 9=PROBE）；
//   RESET：t2..t4=pos 定点×1000，t5..t7=vel 定点×1000，t8=state。
//
// 职责（服务端唯一常驻 = 1s 轮询 + 4s 看门狗 + 0.2s 拍门（仅球活动期）：
//   · 会话种子（whenEntityIsCreated 只留 armed + 5s 一次性 fb_seed 定时器；种子逻辑
//     在 fb_seed 回调：5 丘丘人写球引用 + 初始 RESET 任务进邮箱（2m 落体锚点
//     pos=(0,2.25,0) vel=0 state=Airborne）——05 复测修正，躲进图实体风暴期）
//   · fb_dsp 1s 轮询（E1 保留，观测面）：寄存器空闲则发测试载荷（t1=pe*1000+1 恒为未知
//     类型，03 票 fb-phys 按未知类型跳过应用但仍走 seqlock/ack——E1 观测面不断链）
//   · fb_wd 4s 看门狗（E1 重提交 + gate 死锁重开）：在途超时重提交 (sum+epoch) 对（单写者
//     不变量：载荷已原子写全，重发只需门值）；gate=1 → 置 0 重开下一拍（4s 粒度实现
//     "0.8s 阈值"设计口径，幂等最多丢 1 拍——beat 每 0.2s 重开门，回传丢失天然重试）
//   · fb_beat 0.2s loop（T3 拍门，仅球活动期）：置 fb_ball_gate=1
//   · onSignal(fb_echo)（E1 first-wins 保留 + 任务应用唤醒）：ack 前进 + 读邮箱 t1，
//     type∈{KICK,RESET} 才 startTimer(fb_beat)（垃圾测试载荷不唤醒，REST 期≈0）；
//     RESET 应用置瞬移门 fb_tp_pending + 清 fb_scored
//   · onSignal(fb_ball_state 6 参 vec3 形态，引擎参数上限 10——09-03 用户知识修正)：
//     tag='P' 且 base_tick==镜像 tick（first-wins）→ 镜像 11 写
//     （tick+1）+ gate=0 + 视觉驱动 + state==Rest→stopTimer + 进球判定简版；
//     dup（同代重复回传）打点；tag='T' 撕裂拍不应用（gate 保持开，下一拍重算）
// 视觉驱动两形态（防"百米条纹"）：常态拍预测插值 fbDrive（速度=(新位−实体当前位)/0.25s，
//   同名 'fb_phys' 顶替，时长 0.25s 略大于拍距 0.2s 防断档）；RESET 应用后的首拍 fbTeleport
//   （INSTANT 瞬移——否则实体残留位与镜像差几十米，预测插值会以百米每秒速度拉条纹）。
//   瞬移门时序：RESET 的 ack 到达时置位（非投递时——投递与应用间还有普通拍，提前置位会
//   误瞬移），首个 first-wins 应用拍消费并复位。
// 定时器名单制：本图只认 fb_dsp/fb_wd/fb_beat，else 一律空分支（球实体上另有旧四图
//   825/826/828/829 的定时器广播不吃进；反向已核对四图分发 else 均空，互不串扰）。
// 运动器名 'fb_phys' 与旧图 'physics'/'spin' 不同名（避免同名顶替级联，2026-08-31 教训）。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

import { FbSignal } from './signals.js'

// ———— 常量（票 01/02 接口事实 + R2-DESIGN 定稿） ————
const ST_REST = 4n // 六态枚举见文件头（sim/state.ts）
// 任务类型（§4）：KICK=1 RESET=2（PARAM=3 预留 / PROBE=9，不唤醒拍门）
const TT_KICK = 1n
const TT_RESET = 2n
// 丘丘人球引用持有者实例（票 01 终态；def 1082130433 为模板不运行时写）。
// entity() 必须接字面量（数组索引会被 TS→GS 改写成运行时列表取值，编译实证 09-03）：
// 1082130437 / 1082130438 / 1082130439 / 1082130440 / 1082130441
// T3 节拍：拍距 0.2s；运动器同名顶替时长 0.25s（略大于拍距）；速度换算 1/0.25=4
const BEAT_S = 0.2
const DRIVE_S = 0.25
const DRIVE_GAIN = 4
const RAD2DEG = 57.29577951308232 // 180/π，rad/s → °/s（旋转设备角速度单位）
const SEED_DELAY_S = 5 // 种子后移秒数（进图实体风暴期规避，05 复测修正）
// 球门线几何（FIFA 105×68：门线 x=±52.5；门宽 7.32→|z|<3.66；横梁高 2.5）
const GOAL_LINE_X = 52.5
const GOAL_MOUTH_Z = 3.66
const GOAL_BAR_Y = 2.5
// 会话种子 RESET（定点 ×1000）：2m 落体校准锚点 pos=(0,2.25,0) vel=0 state=Airborne(0)
const SEED_POS_X = 0
const SEED_POS_Y = 2250
const SEED_ST = 0
// 进球复位（定点 ×1000）：中圈 (0,0.25,0) 静止 state=Rest(4)
const HOME_X = 0
const HOME_Y = 250
const HOME_ST = 4

// ———— 复合：邮箱投递（t1..t8 + 闭式 sum + epoch；三调用点=种子/进球复位/R3 踢球入口） ————
// sum=Σtᵢ 在投递时点求值（载荷随任务不同而不同；撕裂检测由 fb-phys 端同式求和比对，
// 同任务重复投递幂等；节点预算纪律：7 个加法节点替代逐任务手写闭式）。
// 复合 def ID 显式分配 1610700040..43（04 票注入预检发现：默认顺序分配 1610700000..03
// 会覆盖地图上旧 v5 家族 def（dribble_field_get_role/ball_render_frame/ball_render_halt），
// 旧图 825/828/829 仍挂载在引用它们 → 类型错位=拒载。目录现占用 1610700000..32，
// 40..43 空闲（impl 图 1610710040..43 同空闲），零行为变化仅 ID 锚定）
const fbMailPost = g.defineComposite('fb_mail_post', {
  id: 1610700040,
  inputs: {
    owner: { type: 'entity' },
    pe: { type: 'int' },
    t1: { type: 'int' },
    t2: { type: 'int' },
    t3: { type: 'int' },
    t4: { type: 'int' },
    t5: { type: 'int' },
    t6: { type: 'int' },
    t7: { type: 'int' },
    t8: { type: 'int' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ owner, pe, t1, t2, t3, t4, t5, t6, t7, t8 }, f) => {
    const sum = f.addition(
      f.addition(
        f.addition(
          f.addition(f.addition(f.addition(f.addition(t1, t2), t3), t4), t5),
          t6
        ),
        t7
      ),
      t8
    )
    const m1 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t1'), t1, new bool(false)])
    const m2 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t2'), t2, new bool(false)])
    const m3 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t3'), t3, new bool(false)])
    const m4 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t4'), t4, new bool(false)])
    const m5 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t5'), t5, new bool(false)])
    const m6 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t6'), t6, new bool(false)])
    const m7 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t7'), t7, new bool(false)])
    const m8 = f.registerExecNode('set_custom_variable', [owner, new str('fb_t8'), t8, new bool(false)])
    const m9 = f.registerExecNode('set_custom_variable', [owner, new str('fb_sum'), sum, new bool(false)])
    const m10 = f.registerExecNode('set_custom_variable', [owner, new str('fb_epoch'), pe, new bool(false)])
    f.connect(m1, 0, m2, 0)
    f.connect(m2, 0, m3, 0)
    f.connect(m3, 0, m4, 0)
    f.connect(m4, 0, m5, 0)
    f.connect(m5, 0, m6, 0)
    f.connect(m6, 0, m7, 0)
    f.connect(m7, 0, m8, 0)
    f.connect(m8, 0, m9, 0)
    f.connect(m9, 0, m10, 0)
    f.outflow('done', m10, 0)
    return {}
  }
})

// ———— 复合：镜像提交（first-wins 应用拍；镜像 11 写 + gate 关门，12 连写一条链） ————
const fbMirrorApply = g.defineComposite('fb_mirror_apply', {
  id: 1610700041,
  inputs: {
    ball: { type: 'entity' },
    nt: { type: 'int' },
    px: { type: 'float' },
    py: { type: 'float' },
    pz: { type: 'float' },
    vx: { type: 'float' },
    vy: { type: 'float' },
    vz: { type: 'float' },
    sx: { type: 'float' },
    sy: { type: 'float' },
    sz: { type: 'float' },
    st: { type: 'int' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ ball, nt, px, py, pz, vx, vy, vz, sx, sy, sz, st }, f) => {
    const a1 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_tick'), nt, new bool(false)])
    const a2 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_px'), px, new bool(false)])
    const a3 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_py'), py, new bool(false)])
    const a4 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_pz'), pz, new bool(false)])
    const a5 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_vx'), vx, new bool(false)])
    const a6 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_vy'), vy, new bool(false)])
    const a7 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_vz'), vz, new bool(false)])
    const a8 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_sx'), sx, new bool(false)])
    const a9 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_sy'), sy, new bool(false)])
    const a10 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_sz'), sz, new bool(false)])
    const a11 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_state'), st, new bool(false)])
    const a12 = f.registerExecNode('set_custom_variable', [ball, new str('fb_ball_gate'), new int(0), new bool(false)])
    f.connect(a1, 0, a2, 0)
    f.connect(a2, 0, a3, 0)
    f.connect(a3, 0, a4, 0)
    f.connect(a4, 0, a5, 0)
    f.connect(a5, 0, a6, 0)
    f.connect(a6, 0, a7, 0)
    f.connect(a7, 0, a8, 0)
    f.connect(a8, 0, a9, 0)
    f.connect(a9, 0, a10, 0)
    f.connect(a10, 0, a11, 0)
    f.connect(a11, 0, a12, 0)
    f.outflow('done', a12, 0)
    return {}
  }
})

// ———— 复合：预测插值驱动（常态拍；位置+旋转双设备，04 轮用户指正补齐旋转） ————
// 位置：速度=(新位−实体当前位)/0.25s，同名 'fb_phys' 顶替（实体当前位=引擎权威视觉位，
// R2-DESIGN §1 主案；区别于 2026-08-27 反例——彼处逻辑速度才是真相故禁反推，此处镜像即真相）。
// 旋转：'fb_spin' 匀速旋转设备（axis+°/s）——与线性设备可叠加（v4 实证：定点 INSTANT 与
// 旋转同链互断，匀速直线性设备不互断）；世界自旋轴必须经实体当前朝向转回局部轴
// （v4 2832 日志教训：local = Rz(−rz)·Rx(−rx)·Ry(−ry)·worldAxis，YXZ 内旋，否则横传/
// 曲线球旋转方向错）。spin≈0 时 axis=normalize(0)=零速设备=自然停转（v4 同形态）。
// 'fb_phys'/'fb_spin' 与旧图 'physics'/'spin' 均不同名（避免同名顶替级联）。
const fbDrive = g.defineComposite('fb_drive', {
  id: 1610700042,
  inputs: {
    ball: { type: 'entity' },
    pos: { type: 'vec3' },
    spin: { type: 'vec3' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ ball, pos, spin }, f) => {
    const loc = f.getEntityLocationAndRotation(ball).location
    const vel = f._3dVectorZoom(f._3dVectorSubtraction(pos, loc), DRIVE_GAIN)
    const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      ball,
      new str('fb_phys'),
      new float(DRIVE_S),
      vel
    ])
    const axis = f._3dVectorNormalization(spin)
    const angVel = f.multiplication(f._3dVectorModuloOperation(spin), RAD2DEG)
    const rot = f.getEntityLocationAndRotation(ball).rotate
    const r = f.split3dVector(rot)
    const negX = f.multiplication(r.xComponent, -1)
    const negY = f.multiplication(r.yComponent, -1)
    const negZ = f.multiplication(r.zComponent, -1)
    const afterY = f._3dVectorRotation(f.create3dVector(0, negY, 0), axis)
    const afterX = f._3dVectorRotation(f.create3dVector(negX, 0, 0), afterY)
    const localAxis = f._3dVectorRotation(f.create3dVector(0, 0, negZ), afterX)
    const rotDev = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      ball,
      new str('fb_spin'),
      new float(DRIVE_S),
      angVel,
      localAxis
    ])
    f.connect(lin, 0, rotDev, 0)
    f.outflow('done', rotDev, 0)
    return {}
  }
})

// ———— 复合：瞬移（RESET 应用后首拍；INSTANT 定点运动器，防百米条纹） ————
const fbTeleport = g.defineComposite('fb_teleport', {
  id: 1610700043,
  inputs: {
    ball: { type: 'entity' },
    pos: { type: 'vec3' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ ball, pos }, f) => {
    const tail = f.registerExecNode('activate_fixed_point_motion_device', [
      ball,
      new str('fb_phys'),
      MovementMode.InstantMovement,
      new float(0),
      pos,
      f.create3dVector(0, 0, 0),
      new bool(false),
      FixedMotionParameterType.FixedSpeed,
      new float(0)
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741830,
    name: '_GSTS_fbServer',
    variables: {
      // 进球去重（复位应用时清零；防止球在网内多拍连续触发）
      fb_scored: new bool(false),
      // 瞬移门：RESET 应用 ack 置位 → 首个应用拍消费（瞬移）并复位
      fb_tp_pending: new bool(false)
    }
  })
  // ================================================================
  // 会话种子：丘丘人球引用 + 初始 RESET 任务（2m 落体校准锚点）+ 常驻定时器
  // 05 复测修正（用户指正）：whenEntityIsCreated 落在进图实体风暴期——跨实体变量写
  // （5 丘丘人）与邮箱投递太早有丢失/时序风险。创建事件只留轻打点+5s 一次性
  // fb_seed 定时器，种子逻辑整体后移（定时器回调时全部实体已就绪）。
  // ================================================================
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('fb:armed')
    const ball = f.getSelfEntity()
    f.startTimer(ball, 'fb_seed', false, [SEED_DELAY_S])
  })
  // ================================================================
  // 定时器名单制分发：fb_dsp（1s 轮询）/ fb_wd（4s 看门狗）/ fb_beat（0.2s 拍门）
  // ================================================================
  .on('whenTimerIsTriggered', (evt, f) => {
    f.doubleBranch(f.equal(evt.timerName, 'fb_dsp'), () => {
      // E1 观测面保留：空闲则发测试载荷（t1=pe*1000+1 恒为未知类型，不唤醒拍门）
      const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
      const e = f.getCustomVariable(owner, 'fb_epoch').asType('int')
      const a = f.getCustomVariable(owner, 'fb_ack').asType('int')
      f.doubleBranch(f.equal(e, a), () => {
        const pe = e + 1n
        f.setCustomVariable(owner, 'fb_t1', pe * 1000n + 1n, false)
        f.setCustomVariable(owner, 'fb_t2', pe * 1000n + 2n, false)
        f.setCustomVariable(owner, 'fb_t3', pe * 1000n + 3n, false)
        f.setCustomVariable(owner, 'fb_t4', pe * 1000n + 4n, false)
        f.setCustomVariable(owner, 'fb_t5', pe * 1000n + 5n, false)
        f.setCustomVariable(owner, 'fb_t6', pe * 1000n + 6n, false)
        f.setCustomVariable(owner, 'fb_t7', pe * 1000n + 7n, false)
        f.setCustomVariable(owner, 'fb_t8', pe * 1000n + 8n, false)
        f.setCustomVariable(owner, 'fb_sum', pe * 8000n + 36n, false)
        f.setCustomVariable(owner, 'fb_epoch', pe, false)
        f.printString('fb:dsp')
      }, () => {
      })
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'fb_wd'), () => {
        const owner2 = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
        const e2 = f.getCustomVariable(owner2, 'fb_epoch').asType('int')
        const a2 = f.getCustomVariable(owner2, 'fb_ack').asType('int')
        f.doubleBranch(f.equal(e2, a2), () => {
        }, () => {
          f.setCustomVariable(owner2, 'fb_sum', e2 * 8000n + 36n, false)
          f.setCustomVariable(owner2, 'fb_epoch', e2, false)
          f.printString('fb:repub')
        })
        // gate 死锁看门狗（独立检查，不与重提交互斥）：gate=1 → 置 0 重开下一拍
        const ballW = f.getSelfEntity()
        const gate = f.getCustomVariable(ballW, 'fb_ball_gate').asType('int')
        f.doubleBranch(f.equal(gate, 1n), () => {
          f.setCustomVariable(ballW, 'fb_ball_gate', 0n, false)
          f.printString('fb:wdgate')
        }, () => {
        })
      }, () => {
        f.doubleBranch(f.equal(evt.timerName, 'fb_beat'), () => {
          const ballB = f.getSelfEntity()
          f.setCustomVariable(ballB, 'fb_ball_gate', 1n, false)
        }, () => {
          // fb_seed（一次性 5s）：种子逻辑后移落位（实体风暴规避，见文件头）
          f.doubleBranch(f.equal(evt.timerName, 'fb_seed'), () => {
            const ball = f.getSelfEntity()
            // 球引用种子：5 丘丘人实例逐个写（fb-phys 读链 getSelfEntity→fb_ball_entity→球变量）
            f.setCustomVariable(entity(1082130437n), 'fb_ball_entity', ball, false)
            f.setCustomVariable(entity(1082130438n), 'fb_ball_entity', ball, false)
            f.setCustomVariable(entity(1082130439n), 'fb_ball_entity', ball, false)
            f.setCustomVariable(entity(1082130440n), 'fb_ball_entity', ball, false)
            f.setCustomVariable(entity(1082130441n), 'fb_ball_entity', ball, false)
            // 初始 RESET 任务进邮箱（seqlock 单槽；应用后由 ack 分支唤醒拍门+置瞬移门）
            const owner = f.getCorrespondingValueFromList(
              f.getListOfPlayerEntitiesOnTheField(),
              0n
            )
            const pe = f.getCustomVariable(owner, 'fb_epoch').asType('int') + 1n
            f.callComposite(fbMailPost, {
              owner,
              pe,
              t1: new int(TT_RESET),
              t2: new int(SEED_POS_X),
              t3: new int(SEED_POS_Y),
              t4: new int(SEED_POS_X),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(SEED_ST)
            })
            f.printString('fb:seed')
            f.startTimer(ball, 'fb_dsp', true, [1])
            f.startTimer(ball, 'fb_wd', true, [4])
          }, () => {
          })
        })
      })
    })
  })
  // ================================================================
  // onSignal(fb_echo)：E1 first-wins（stale/dup/ack/tear）+ 任务应用唤醒
  // ================================================================
  .onSignal(FbSignal.fb_echo, (evt, f) => {
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, 'fb_ack').asType('int')
    f.doubleBranch(f.equal(evt.params.tag, 'ok'), () => {
      f.doubleBranch(f.lessThan(evt.params.e, cur), () => {
        f.printString('fb:stale')
      }, () => {
        f.doubleBranch(f.equal(evt.params.e, cur), () => {
          // 05 复测修正：高频路径打点瘦身——dup/ack 去值行（多造物回声×每任务≈打点洪泛）
          f.printString('fb:dup')
        }, () => {
          f.setCustomVariable(owner, 'fb_ack', evt.params.e, false)
          f.printString('fb:ack')
          f.printString(f.dataTypeConversion(evt.params.e, 'str'))
          // 任务应用唤醒：读邮箱 t1（同 handler 内无并发写者），真实任务类型才开拍门
          const ball = f.getSelfEntity()
          const t1 = f.getCustomVariable(owner, 'fb_t1').asType('int')
          f.doubleBranch(f.equal(t1, TT_RESET), () => {
            f.setNodeGraphVariable('fb_tp_pending', new bool(true), false)
            f.setNodeGraphVariable('fb_scored', new bool(false), false)
            f.startTimer(ball, 'fb_beat', true, f.assemblyList([BEAT_S], 'float'))
          }, () => {
            f.doubleBranch(f.equal(t1, TT_KICK), () => {
              f.startTimer(ball, 'fb_beat', true, f.assemblyList([BEAT_S], 'float'))
            }, () => {
            })
          })
        })
      })
    }, () => {
      f.printString('fb:tear')
      f.printString(f.dataTypeConversion(evt.params.e, 'str'))
    })
  })
  // ================================================================
  // onSignal(fb_ball_state)：first-wins 提交真相镜像 + 挂球运动器 + 进球判定简版
  // ================================================================
  .onSignal(FbSignal.fb_ball_state, (evt, f) => {
    const ball = f.getSelfEntity()
    const cur = f.getCustomVariable(ball, 'fb_ball_tick').asType('int')
    const isP = f.equal(evt.params.tag, 'P')
    const base = f.equal(evt.params.tick, cur)
    // vec3 参数拆分量（信号 6 参形态：tag,tick,pos,vel,spin,state——引擎参数上限 10，
    // 09-03 用户知识修正；Split 节点输出为普通数据 pin，多点消费稳定无重求值陷阱）
    const posS = f.split3dVector(evt.params.pos)
    const velS = f.split3dVector(evt.params.vel)
    const spinS = f.split3dVector(evt.params.spin)
    f.doubleBranch(f.logicalAndOperation(isP, base), () => {
      // —— first-wins 应用：镜像 11 写（tick+1）+ gate=0 ——
      const nt = cur + 1n
      f.callComposite(fbMirrorApply, {
        ball,
        nt,
        px: posS.xComponent,
        py: posS.yComponent,
        pz: posS.zComponent,
        vx: velS.xComponent,
        vy: velS.yComponent,
        vz: velS.zComponent,
        sx: spinS.xComponent,
        sy: spinS.yComponent,
        sz: spinS.zComponent,
        st: evt.params.state
      })
      // —— 视觉驱动：瞬移门分支（RESET 首拍 INSTANT，常态拍预测插值）——
      const tp = f.getNodeGraphVariable('fb_tp_pending').asType('bool')
      f.doubleBranch(tp, () => {
        f.setNodeGraphVariable('fb_tp_pending', new bool(false), false)
        f.callComposite(fbTeleport, { ball, pos: evt.params.pos })
      }, () => {
        f.callComposite(fbDrive, { ball, pos: evt.params.pos, spin: evt.params.spin })
      })
      // —— Rest → 停拍（静止零定时器基线） ——
      f.doubleBranch(f.equal(evt.params.state, ST_REST), () => {
        f.stopTimer(ball, 'fb_beat')
      }, () => {
      })
      // —— 进球判定简版：镜像 pos 过门线（去重）→ 打点帧值 + RESET 任务回中圈 ——
      const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
      const scored = f.getNodeGraphVariable('fb_scored').asType('bool')
      const xOk = f.greaterThan(f.absoluteValueOperation(posS.xComponent), new float(GOAL_LINE_X))
      const zOk = f.lessThan(f.absoluteValueOperation(posS.zComponent), new float(GOAL_MOUTH_Z))
      const yOk = f.lessThan(posS.yComponent, new float(GOAL_BAR_Y))
      const inMouth = f.logicalAndOperation(f.logicalAndOperation(xOk, zOk), yOk)
      const go = f.logicalAndOperation(inMouth, f.logicalNotOperation(scored))
      f.doubleBranch(go, () => {
        f.printString('fb:goal')
        f.printString(f.dataTypeConversion(posS.xComponent, 'str'))
        f.printString(f.dataTypeConversion(posS.zComponent, 'str'))
        f.printString(f.dataTypeConversion(posS.yComponent, 'str'))
        const pe = f.getCustomVariable(owner, 'fb_epoch').asType('int') + 1n
        f.callComposite(fbMailPost, {
          owner,
          pe,
          t1: new int(TT_RESET),
          t2: new int(HOME_X),
          t3: new int(HOME_Y),
          t4: new int(HOME_X),
          t5: new int(0),
          t6: new int(0),
          t7: new int(0),
          t8: new int(HOME_ST)
        })
        f.setNodeGraphVariable('fb_scored', new bool(true), false)
      }, () => {
      })
    }, () => {
      // —— 非应用拍：dup（同代重复回传，多造物并发统计）/ tear（撕裂拍不应用） ——
      // 05 复测修正：运动期 5Hz×多造物 dup 打点去值行（打点洪泛拖卡）
      f.doubleBranch(isP, () => {
        f.printString('fb:dup')
      }, () => {
        f.printString('fb:tear')
      })
    })
  })

export default graph
