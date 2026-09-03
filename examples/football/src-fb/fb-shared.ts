// fb-shared.ts —— 服务端复合与公共常量（票 19 三图拆分：数据图/渲染图/输入图共享，
// 2026-09-03）。defineComposite 被 import 的图各自执行声明 → 各 .gia 自带同 ID def，
// 注入按 ID 覆盖幂等（历史注入器 merge 语义），任意单图注入后 def 目录自足。
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'
import { MovementMode, FixedMotionParameterType } from 'genshin-ts/definitions/enum'

// ———— 公共常量（六态/任务枚举/几何） ————
export const ST_REST = 4n // 六态枚举（sim/src/state.ts 单一事实源）
export const TT_KICK = 1n
export const TT_RESET = 2n
export const RAD2DEG = 57.29577951308232 // 180/π（旋转设备角速度单位）
// 球门线几何（FIFA 105×68：门线 x=±52.5；门宽 7.32→|z|<3.66；横梁高 2.5）
export const GOAL_LINE_X = 52.5
export const GOAL_MOUTH_Z = 3.66
export const GOAL_BAR_Y = 2.5
// 会话种子 RESET（定点 ×1000）：2m 落体校准锚点 pos=(0,2.25,0) vel=0 state=Airborne(0)
export const SEED_POS_X = 0
export const SEED_POS_Y = 2250
export const SEED_ST = 0
export const SEED_DELAY_S = 5 // 种子后移秒数（进图实体风暴期规避，05 复测修正）
// 进球复位（定点 ×1000）：中圈 (0,0.25,0) 静止 state=Rest(4)
export const HOME_X = 0
export const HOME_Y = 250
export const HOME_ST = 4

// ———— 复合：邮箱投递（t1..t8 + 闭式 sum + epoch；调用点=种子/进球复位/R3 踢球入口） ————
// sum=Σtᵢ 在投递时点求值（载荷随任务不同而不同；撕裂检测由 fb-phys 端同式求和比对，
// 同任务重复投递幂等；节点预算纪律：7 个加法节点替代逐任务手写闭式）。
// 复合 def ID 显式分配 1610700040..43（04 票注入预检发现：默认顺序分配 1610700000..03
// 会覆盖地图上旧 v5 家族 def（dribble_field_get_role/ball_render_frame/ball_render_halt），
// 旧图 825/828/829 仍挂载在引用它们 → 类型错位=拒载。目录现占用 1610700000..32，
// 40..43 空闲（impl 图 1610710040..43 同空闲），零行为变化仅 ID 锚定）
export const fbMailPost = g.defineComposite('fb_mail_post', {
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

// ———— 复合：镜像提交（快照应用拍；镜像 11 写 + gate 关门，12 连写一条链） ————
export const fbMirrorApply = g.defineComposite('fb_mirror_apply', {
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

// ———— 复合：预测插值驱动（渲染定时器调用；位置+旋转双设备，04 轮用户指正补齐旋转） ————
// 位置：速度=(新位−实体当前位)/fb_p_drive —— 5.3e 修正：分母恒=设备时长（渲染节拍同源），
//   每根设备匀速恰好在节拍内到位，零过冲零振荡（旧实现分母=fb_p_dt 物理步长：设备按
//   "1/dt 速度"跑 dur 时长 → 冲过 dur/dt 倍 → 节拍驱动下来回振荡——实测复现）。
//   语义链：fb_render 节拍=fb_p_drive（5.3b 参数化）→ 每节拍一根设备匀速到点 → 丢拍=
//   设备自然到点停（原"续滑保险丝"设计退役，更稳）。st 参数保留（到位跳过判定在调用侧）。
// 旋转：'fb_spin' 匀速旋转设备（axis+°/s）——与线性设备可叠加；世界自旋轴必须经实体
// 当前朝向转回局部轴（local = Rz(−rz)·Rx(−rx)·Ry(−ry)·worldAxis，YXZ 内旋）。
// 'fb_phys'/'fb_spin' 与旧图 'physics'/'spin' 均不同名（避免同名顶替级联）。
export const fbDrive = g.defineComposite('fb_drive', {
  id: 1610700042,
  inputs: {
    ball: { type: 'entity' },
    pos: { type: 'vec3' },
    spin: { type: 'vec3' },
    st: { type: 'int' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ ball, pos, spin }, f) => {
    const dur = f.getCustomVariable(ball, 'fb_p_drive').asType('float')
    // 5.3e：分母恒=dur（设备时长=渲染节拍）——到点精确停，无过冲
    const denom = dur
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

// ———— 复合：瞬移（RESET/大跳变；INSTANT 定点运动器，防百米条纹） ————
export const fbTeleport = g.defineComposite('fb_teleport', {
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
