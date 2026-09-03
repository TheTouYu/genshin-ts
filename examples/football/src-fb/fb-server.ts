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
//   · R3（票 06）：操作台踢球入口 whenTabIsSelected（tabBar 挂球实体自身）→ 邮箱直投
//     KICK/RESET（轻链不经 1s 轮询；九选项表=旧 kick 表移植）+ 自动锚点复测序列
//     （fb_test_mode 门控：种子落体 Rest 后快踢→斜射→侧旋→8m/s 滚停逐段自动下发）：
//   · 会话种子（whenEntityIsCreated 只留 armed + 5s 一次性 fb_seed 定时器；种子逻辑
//     在 fb_seed 回调：5 丘丘人写球引用 + 初始 RESET 任务进邮箱（2m 落体锚点
//     pos=(0,2.25,0) vel=0 state=Airborne）——05 复测修正，躲进图实体风暴期）
//   · fb_dsp 1s 轮询（E1 保留，观测面）：寄存器空闲则发测试载荷（t1=pe*1000+1 恒为未知
//     类型，03 票 fb-phys 按未知类型跳过应用但仍走 seqlock/ack——E1 观测面不断链）
//   · fb_wd 4s 看门狗保持退役（票 10 定案）：R1 删 sum/epoch 重提交（3104 rec8931 铁证）；
//     R2 删 gate 复位——3107 双日志实证 wdgate 采样到的是正常开合，复位制造/加重单拍丢拍。
//     fb:repub / fb:wdgate 打点均不再存在（口径见票 10）。
//   · fb_beat 拍门（T3；间隔=球变量 fb_p_dt，默认 0.2s，任务 ack 时按当前值启动）：
//     置 fb_ball_gate=1。R2 的「每拍镜像速度续命」已回退——3108 帧值实证反弹点
//     H(旧速度向上) 与 D(位置修正向下) 交替打架产生震荡；改走参数化调参线（票 10 R3）
//   · onSignal(fb_echo)（E1 first-wins 保留 + 任务应用唤醒）：ack 前进 + 读邮箱 t1，
//     type∈{KICK,RESET} 才 startTimer(fb_beat)（垃圾测试载荷不唤醒，REST 期≈0）；
//     RESET 应用置瞬移门 fb_tp_pending + 清 fb_scored
//   · onSignal(fb_ball_state 6 参 vec3 形态，引擎参数上限 10——09-03 用户知识修正)：
//     tag='P' 且 tick>镜像 tick（5.2d 快照语义：接受更新的 tick——客户端各实例
//     自持模拟器 tick 连续、流间可交替续接；不再要求 base==cur 连续 +1）→ 镜像
//     11 写（tick=客户端 tick，不再服务端重编号）+ gate=0 + 进球判定简版；
//     Rest 进入拍（prev≠Rest）stopTimer(fb_beat)+R3 自动锚点弹下一任务；
//     dup（同代重复回传）零打点；tag='T' 撕裂拍不应用
//   · fb_render 渲染定时器（5.2d，用户模型：接收只写变量、渲染独立调频）：
//     服务端定时器粒度 ~0.09s → 请求 0.05 实际 ~11/s；镜像 tick 变化才驱动可见球
//     （fb_tp_pending→fbTeleport 瞬移 / 常态 fbDrive 预测插值），无新 tick 零动作
//     ——接收路径不再逐条驱动（per-apply fb_drive 30 帧移出热路径）
// 视觉驱动两形态（5.2d 起由 fb_render 定时器调用；防"百米条纹"）：常态拍预测插值
//   fbDrive（速度=(新位−实体当前位)/fb_p_dt，设备时长=fb_p_drive 仅当保险丝：正常
//   被同名顶替，丢拍时按最后指令速度续滑；state=Rest 停球拍改除 fb_p_drive 精确到点
//   停）；RESET 应用首拍 fbTeleport（INSTANT 瞬移——防残留位与镜像差几十米拉条纹）。
//   瞬移门时序：RESET 的 ack 到达时置位（非投递时——投递与应用间还有普通拍，提前置位
//   会误瞬移），fb_render 消费（首个新 tick 渲染拍）并复位。
// 定时器名单制：本图只认 fb_dsp/fb_beat（+一次性 fb_seed），else 一律空分支（球实体上另有旧四图
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
// T3 节拍参数化（票 10 R3 用户模型定，2026-09-02）：
//   拍距 = 球实体变量 fb_p_dt（默认 0.2；客户端物理步长同源，两处必须一致才不变速）；
//   运动器时长 = 球实体变量 fb_p_drive（默认 0.5）= 纯保险丝：正常每拍被顶替不参与速度，
//   丢拍时旧设备按最后指令速度续滑；停球拍(Rest)用 1/fb_p_drive 精确收尾（见 fbDrive）。
//   两个变量均可编辑器热调：fb_p_dt 自下一任务 ack 起生效；fb_p_drive 每应用拍即时生效。
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

// ———— R3 踢球入口（票 06，2026-09-03）：球实体自带 tabBar「足球操作」9 选项（r=5m）————
// 分流定案（REBUILD-V2-PLAN §2.7-C 意图 + v6 现实推导，详见票 06 执行备注）：踢球=手感敏感，
// 不经 dispatcher 1s 轮询——whenTabIsSelected 内直投邮箱 KICK 任务（fbMailPost，与种子/进球
// 复位同形态，03 票 fb-phys KICK 解码应用链已在位）；20002 角色图路径不建（客户端图无
// setCustomVariable/无运动器节点=路径 (b) 判死，球物理唯一执行点=fb-phys，cast 不能缩短
// S→C 状态复制瓶颈）。tab 1..8=施力预设 / 9=复位（RESET 中圈 Rest）。
// 九选项施力表 = 旧 kick 表移植（vel m/s、spin rad/s 世界轴；图内常量=玩法标定不参数化，
// PORTING-MAP §1.6；上界核对 |v|max=24.51≤maxSpeed=50、|ω|max=10≤maxAngSpeed=70 无超限）
// 逐项字面量写在 whenTabIsSelected 分支内（DSL 闭包禁数组索引，勿提回模块表）
// 自动锚点序列（R3 复测载荷；球实体变量 fb_test_mode=1 时会话种子后排队，用户按任意选项终止）：
// 队列 1..7：1=快踢(24.5,2,0) 2=RESET 3=斜射 25m/s@15°(24148,6471,0) 4=RESET
// 5=侧旋 25@15°+8rev/s(0,50265,0)——+ŷ 自旋沿 +X 预期朝 −Z 弯（ω×v，20m 处 |偏移|≈3.7m 入带）
// 6=RESET 7=滚停 8m/s(8000,0,0)。RESET 段=中圈 Rest（HOME 常量，与进球复位同参）
const AUTO_FIXK = 1000

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
// 位置：普通拍速度=(新位−实体当前位)/fb_p_dt（跟拍距走，设备时长不参与正常速度）；
//   同名 'fb_phys' 顶替，时长=fb_p_drive 仅当保险丝——正常每拍被顶替，丢拍时旧设备按最后
//   指令速度续滑（用户模型 2026-09-02 定）；state=Rest 停球拍 st=4 时改除 fb_p_drive，
//   保证最后一台设备到点精确停下（恒速设备否则会冲过停点）。
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
    spin: { type: 'vec3' },
    st: { type: 'int' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ ball, pos, spin, st }, f) => {
    const dur = f.getCustomVariable(ball, 'fb_p_drive').asType('float')
    const pdt = f.getCustomVariable(ball, 'fb_p_dt').asType('float')
    // 分母选择：停球拍(Rest)=dur（精确到点停）；普通拍=pdt（跟拍距，时长只当保险丝）
    const bRest = f.dataTypeConversion(f.dataTypeConversion(f.equal(st, ST_REST), 'int'), 'float')
    const denom = f.addition(
      f.multiplication(dur, bRest),
      f.multiplication(pdt, f.subtraction(1, bRest))
    )
    const gain = f.division(1, denom)
    const loc = f.getEntityLocationAndRotation(ball).location
    const vel = f._3dVectorZoom(f._3dVectorSubtraction(pos, loc), gain)
    const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      ball,
      new str('fb_phys'),
      dur,
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
      dur,
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
      // 瞬移门：RESET 应用 ack 置位 → fb_render 首个新 tick 渲染拍消费（瞬移）并复位
      fb_tp_pending: new bool(false),
      // R3 自动锚点队列指针：0=off；1..7=下一任务（球 Rest 进入拍弹下一任务；用户按任意选项即清零）
      fb_auto: new int(0),
      // 5.2d：fb_render 上次已驱动镜像 tick（无新 tick 零动作）；fb_prev_st=上次应用状态
      // （Rest 进入拍判定：连续 Rest 拍不重复触发 stopTimer/自动队列——旧链静止停发
      // 天然只进一次，新链 Rest 连续回传需显式去重）
      fb_last_drv: new int(0),
      fb_prev_st: new int(0)
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
  // 定时器名单制分发：fb_dsp（1s 轮询）/ fb_beat（拍门，间隔=fb_p_dt）/ fb_seed（一次性）
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
      f.doubleBranch(f.equal(evt.timerName, 'fb_beat'), () => {
        const ballB = f.getSelfEntity()
        f.setCustomVariable(ballB, 'fb_ball_gate', 1n, false)
      }, () => {
        f.doubleBranch(f.equal(evt.timerName, 'fb_render'), () => {
          // —— 渲染定时器（5.2d）：镜像有新 tick 才驱动可见球；无新 tick 零动作 ——
          const ballR = f.getSelfEntity()
          const mt = f.getCustomVariable(ballR, 'fb_ball_tick').asType('int')
          const ld = f.getNodeGraphVariable('fb_last_drv').asType('int')
          f.doubleBranch(f.logicalNotOperation(f.equal(mt, ld)), () => {
            f.setNodeGraphVariable('fb_last_drv', mt, false)
            const mPos = f.create3dVector(
              f.getCustomVariable(ballR, 'fb_ball_px').asType('float'),
              f.getCustomVariable(ballR, 'fb_ball_py').asType('float'),
              f.getCustomVariable(ballR, 'fb_ball_pz').asType('float')
            )
            const mSpin = f.create3dVector(
              f.getCustomVariable(ballR, 'fb_ball_sx').asType('float'),
              f.getCustomVariable(ballR, 'fb_ball_sy').asType('float'),
              f.getCustomVariable(ballR, 'fb_ball_sz').asType('float')
            )
            const mSt = f.getCustomVariable(ballR, 'fb_ball_state').asType('int')
            // 瞬移门：RESET ack 置位 → 本拍瞬移（INSTANT）并复位；常态=预测插值驱动
            const tp = f.getNodeGraphVariable('fb_tp_pending').asType('bool')
            f.doubleBranch(tp, () => {
              f.setNodeGraphVariable('fb_tp_pending', new bool(false), false)
              f.callComposite(fbTeleport, { ball: ballR, pos: mPos })
            }, () => {
              f.callComposite(fbDrive, { ball: ballR, pos: mPos, spin: mSpin, st: mSt })
            })
          }, () => {
          })
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
            // 5.2d 渲染定时器（常驻；5.2e 请求 0.09s——实测粒度 ~0.045-0.09 抖动，
            // 0.05 请求实测可飙到 ~20/s 加重负载；0.09 封顶 ~10/s）
            f.startTimer(ball, 'fb_render', true, [0.09])
            // fb_wd 已退役（票 10 R2）：丢拍由 fb_beat 续命兜底，见文件头
            // R3 自动锚点序列武装（fb_test_mode=1；2m 落体种子 Rest 后自动开跑）
            const tm = f.getCustomVariable(ball, 'fb_test_mode').asType('int')
            f.doubleBranch(f.equal(tm, 1n), () => {
              f.setNodeGraphVariable('fb_auto', new int(1), false)
              f.printString('fb:autoarm')
            }, () => {
              f.setNodeGraphVariable('fb_auto', new int(0), false)
            })
          }, () => {
          })
          }) // —— fb_render 分支闭（render else 内含 fb_seed） ——
        })
    })
  })
  // ================================================================
  // R3 操作台踢球入口（票 06）：whenTabIsSelected（tabBar 挂球实体自身，同实体 826
  // 旧输入图已摘挂载防双踢）→ 直投邮箱（轻链，不经 1s dispatcher 轮询）：
  //   tab 1..8：KICK 任务（t2..t4=vel×1000 / t5..t7=spin×1000，九选项表数据选择求和）
  //   tab 9：RESET 任务（中圈 Rest，同进球复位）
  // 用户接管即终止自动锚点序列（fb_auto=0）；打印 fb:tab + tabId（按次，关键状态入口）
  // ================================================================
  .on('whenTabIsSelected', (evt, f) => {
    f.setNodeGraphVariable('fb_auto', new int(0), false)
    f.printString('fb:tab')
    f.printString(f.dataTypeConversion(evt.tabId, 'str'))
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, 'fb_epoch').asType('int')
    const peT = cur + 1n // 算术在分支 ctx 外预计算（多分支闭包内元对象 +1n 会字符串化）
    f.doubleBranch(f.equal(evt.tabId, 9n), () => {
      f.callComposite(fbMailPost, {
        owner,
        pe: peT,
        t1: new int(TT_RESET),
        t2: new int(HOME_X),
        t3: new int(HOME_Y),
        t4: new int(HOME_X),
        t5: new int(0),
        t6: new int(0),
        t7: new int(0),
        t8: new int(HOME_ST)
      })
    }, () => {
      // 九选项标定（与 TAB 注释表一一对应）：vel m/s / spin rad/s，世界轴 v4 旧表移植。
      // 数据选择求和（hit_i∈{0,1} 互斥，input_tab_kick 同构）；字面量展开（数组索引在
      // DSL 闭包内会变成运行时列表取值——02 编译坑，勿回退成循环/索引）
      const b2f = (b: any) => f.dataTypeConversion(f.dataTypeConversion(b, 'int'), 'float')
      const h1 = b2f(f.equal(evt.tabId, new int(1)))
      const h2 = b2f(f.equal(evt.tabId, new int(2)))
      const h3 = b2f(f.equal(evt.tabId, new int(3)))
      const h4 = b2f(f.equal(evt.tabId, new int(4)))
      const h5 = b2f(f.equal(evt.tabId, new int(5)))
      const h6 = b2f(f.equal(evt.tabId, new int(6)))
      const h7 = b2f(f.equal(evt.tabId, new int(7)))
      const h8 = b2f(f.equal(evt.tabId, new int(8)))
      // 1 轻射(-14,4,6, 内旋0,-6,0) 2 重射(-24,5,0, 0,-8,0) 3 高吊(-15,14,0, 上旋0,0,6)
      // 4 内旋弧(-16,6,12, 0,-9,0) 5 外旋弧(-16,6,-12, 0,9,0) 6 上旋低平(18,4,12, 0,0,10)
      // 7 下旋(-14,5,8, 0,0,-8) 8 横传(4,6,18, 6,0,0)（注释顺序=选项卡位 1..8，9=复位）
      let velAcc: any = f.create3dVector(0, 0, 0)
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-14, 4, 6), h1))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-24, 5, 0), h2))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-15, 14, 0), h3))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-16, 6, 12), h4))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-16, 6, -12), h5))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(18, 4, 12), h6))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(-14, 5, 8), h7))
      velAcc = f._3dVectorAddition(velAcc, f._3dVectorZoom(f.create3dVector(4, 6, 18), h8))
      let spinAcc: any = f.create3dVector(0, 0, 0)
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, -6, 0), h1))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, -8, 0), h2))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 0, 6), h3))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, -9, 0), h4))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 9, 0), h5))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 0, 10), h6))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(0, 0, -8), h7))
      spinAcc = f._3dVectorAddition(spinAcc, f._3dVectorZoom(f.create3dVector(6, 0, 0), h8))
      const v = f.split3dVector(velAcc)
      const s = f.split3dVector(spinAcc)
      const toInt = (x: any) =>
        f.dataTypeConversion(f.multiplication(x, new float(AUTO_FIXK)), 'int')
      f.callComposite(fbMailPost, {
        owner,
        pe: peT,
        t1: new int(TT_KICK),
        t2: toInt(v.xComponent),
        t3: toInt(v.yComponent),
        t4: toInt(v.zComponent),
        t5: toInt(s.xComponent),
        t6: toInt(s.yComponent),
        t7: toInt(s.zComponent),
        t8: new int(0)
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
          // 打印纪律（用户 2026-09-03 定则）：dup=多造物回声常态，零打印——
          // 常规排查靠详情日志（逐节点分毫不差），print 只留关键状态入口
        }, () => {
          f.setCustomVariable(owner, 'fb_ack', evt.params.e, false)
          // 任务应用唤醒：读邮箱 t1（同 handler 内无并发写者），真实任务类型才开拍门；
          // fb:ack 只在真实任务唤醒时打（关键状态入口；测试载荷回执静默）
          const ball = f.getSelfEntity()
          const t1 = f.getCustomVariable(owner, 'fb_t1').asType('int')
          // 拍门间隔参数化：任务 ack 时按球变量 fb_p_dt 当前值启动 fb_beat
          // （与客户端物理步长同源；改后下一轮任务生效）
          const beatDt = f.getCustomVariable(ball, 'fb_p_dt').asType('float')
          f.doubleBranch(f.equal(t1, TT_RESET), () => {
            f.printString('fb:ack')
            f.printString(f.dataTypeConversion(evt.params.e, 'str'))
            f.setNodeGraphVariable('fb_tp_pending', new bool(true), false)
            f.setNodeGraphVariable('fb_scored', new bool(false), false)
            f.startTimer(ball, 'fb_beat', true, f.assemblyList([beatDt], 'float'))
          }, () => {
            f.doubleBranch(f.equal(t1, TT_KICK), () => {
              f.printString('fb:ack')
              f.printString(f.dataTypeConversion(evt.params.e, 'str'))
              f.startTimer(ball, 'fb_beat', true, f.assemblyList([beatDt], 'float'))
            }, () => {
            })
          })
        })
      })
    }, () => {
      // 非 'ok' 回声：E5 观测（tag='e5'，任务拍限频）与真实撕裂分开口径，防日志误读
      f.doubleBranch(f.equal(evt.params.tag, 'e5'), () => {
        f.printString('fb:e5')
        f.printString(f.dataTypeConversion(evt.params.e, 'str'))
      }, () => {
        f.printString('fb:tear')
        f.printString(f.dataTypeConversion(evt.params.e, 'str'))
      })
    })
  })
  // ================================================================
  // onSignal(fb_ball_state)：first-wins 提交真相镜像 + 挂球运动器 + 进球判定简版
  // ================================================================
  .onSignal(FbSignal.fb_ball_state, (evt, f) => {
    const ball = f.getSelfEntity()
    const cur = f.getCustomVariable(ball, 'fb_ball_tick').asType('int')
    const isP = f.equal(evt.params.tag, 'P')
    // 5.2d 快照门：只接受比镜像更新的 tick（客户端各实例自持 tick 连续、
    // 同确定性轨迹——任意流的下一个连续 tick 均可续接镜像，流间自动交替）
    // 5.2e 减载：cur 读与 vec3 拆分全部移进门内（被拒重复流只付 isP+门成本 ~6f，
    // 不再付 3×split ~14f——多造物重复流是到达主体，4.6× 去重实测）
    f.doubleBranch(isP, () => {
      const cur = f.getCustomVariable(ball, 'fb_ball_tick').asType('int')
      const fresh = f.greaterThan(evt.params.tick, cur)
      f.doubleBranch(fresh, () => {
      // vec3 参数拆分量（信号 6 参形态：tag,tick,pos,vel,spin,state——引擎参数上限 10，
      // 09-03 用户知识修正；Split 节点输出为普通数据 pin，多点消费稳定无重求值陷阱）
      const posS = f.split3dVector(evt.params.pos)
      const velS = f.split3dVector(evt.params.vel)
      const spinS = f.split3dVector(evt.params.spin)
      // —— 5.2d 快照应用：镜像 11 写（tick=客户端 tick，快照语义不重编号）+ gate=0 ——
      const nt = evt.params.tick
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
      // —— Rest 进入拍（prev≠Rest）→ 停拍 + R3 自动锚点队列弹下一任务 ——
      // （新链 Rest 连续回传，需按进入拍去重——旧链 Rest 停发天然只进一次；
      //  内联条件形态——bisect：const 物化形态曾触发编译器 withExecBranch 报错）
      f.doubleBranch(
        f.logicalAndOperation(
          f.equal(evt.params.state, ST_REST),
          f.logicalNotOperation(
            f.equal(f.getNodeGraphVariable('fb_prev_st').asType('int'), ST_REST)
          )
        ),
        () => {
        f.stopTimer(ball, 'fb_beat')
        const auto = f.getNodeGraphVariable('fb_auto').asType('int')
        const ow = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
        // 算术（epoch+1）在分支 ctx 外预计算：多分支 case 闭包内元对象 +1n 会字符串化
        const peN = f.getCustomVariable(ow, 'fb_epoch').asType('int') + 1n
        // 执行序：先置下一指针再投递（本 handler 原子，防同事件重复弹）
        f.multipleBranches(auto, {
          1: () => {
            f.printString('fb:auto1')
            f.setNodeGraphVariable('fb_auto', new int(2), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_KICK),
              t2: new int(24500),
              t3: new int(2000),
              t4: new int(0),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(0)
            })
          },
          2: () => {
            f.setNodeGraphVariable('fb_auto', new int(3), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_RESET),
              t2: new int(HOME_X),
              t3: new int(HOME_Y),
              t4: new int(HOME_X),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(HOME_ST)
            })
          },
          3: () => {
            f.printString('fb:auto3')
            f.setNodeGraphVariable('fb_auto', new int(4), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_KICK),
              t2: new int(24148),
              t3: new int(6471),
              t4: new int(0),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(0)
            })
          },
          4: () => {
            f.setNodeGraphVariable('fb_auto', new int(5), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_RESET),
              t2: new int(HOME_X),
              t3: new int(HOME_Y),
              t4: new int(HOME_X),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(HOME_ST)
            })
          },
          5: () => {
            f.printString('fb:auto5')
            f.setNodeGraphVariable('fb_auto', new int(6), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_KICK),
              t2: new int(24148),
              t3: new int(6471),
              t4: new int(0),
              t5: new int(0),
              t6: new int(50265),
              t7: new int(0),
              t8: new int(0)
            })
          },
          6: () => {
            f.setNodeGraphVariable('fb_auto', new int(7), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_RESET),
              t2: new int(HOME_X),
              t3: new int(HOME_Y),
              t4: new int(HOME_X),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(HOME_ST)
            })
          },
          7: () => {
            f.printString('fb:auto7')
            f.setNodeGraphVariable('fb_auto', new int(0), false)
            f.callComposite(fbMailPost, {
              owner: ow,
              pe: peN,
              t1: new int(TT_KICK),
              t2: new int(8000),
              t3: new int(0),
              t4: new int(0),
              t5: new int(0),
              t6: new int(0),
              t7: new int(0),
              t8: new int(0)
            })
          },
          default: () => {}
        })
      }, () => {
      })
      // —— prev 状态更新（每应用拍；restEnter 条件已在上方消费旧值） ——
      f.setNodeGraphVariable('fb_prev_st', evt.params.state, false)
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
        // —— fresh 门未过：同代/过期重复回传（多造物常态）零打印（打印纪律）——
      })
    }, () => {
      // —— 非 P 拍（tag='T' 撕裂哨兵）：零应用；打点保留（罕见）——
      f.printString('fb:tear')
    })
  })

export default graph
