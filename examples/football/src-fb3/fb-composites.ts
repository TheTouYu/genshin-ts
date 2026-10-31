// @status: active（服务端共享复合；只被 20000 图 import）
// fb3/fb-composites.ts —— 服务端复合节点：把两张 20000 图的"职责块"命名化。
//
// 纪律（踩过的坑，改前必读）：
//   · 含 exec 的复合**必须声明 outflows**，否则注入器按 def 接口裁边（.gia 有边 .gil 丢边，
//     "足球完全不动"一整轮，commit e348612）。
//   · def ID 段避开 v5 家族 1610700000..43（历史覆盖事故，见 src-fb/fb-shared.ts:30-34）。
//   · 复合被 N 个调用点用到就计 N 份展开（游戏预算公式口径）⇒ 复合**不减预算**，
//     只在"只被调用一次"时预算中性；收益是可读性与单点修改。
//   · 复合入参是 capture，在事件回调里会重新求值 ⇒ 回调里别拿它做匹配。
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

export const RAD2DEG = 57.29577951308232 // 180/π：旋转设备角速度单位

// ———— 复合 1：把球"开到"预测位（线性 + 旋转同拍、同一 duration）———————————————
// 三条硬教训（真机复现过）：①定点器与旋转设备同链会把直线设备秒停 ⇒ 只用基础线性运动器；
// ②线性与旋转必须同拍同 duration，否则"旋转与速度分离"；③旋转轴要世界→局部（YXZ 内旋）换算。
export const fbDriveBall = g.defineComposite('fb_drive_ball', {
  id: 1610700050,
  inputs: {
    ball: { type: 'entity' },
    dur: { type: 'float' },
    vel: { type: 'vec3' },
    spin: { type: 'vec3' },
    spinEps: { type: 'float' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ ball, dur, vel, spin, spinEps }, f) => {
    const lin = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      ball,
      new str('fb_movex'),
      dur,
      vel
    ])
    const spinAbs = f._3dVectorModuloOperation(spin)
    f.doubleBranch(
      f.greaterThan(spinAbs, spinEps),
      () => {
        const axis = f._3dVectorNormalization(spin)
        const angVel = f.multiplication(spinAbs, RAD2DEG)
        const r = f.split3dVector(f.getEntityLocationAndRotation(ball).rotate)
        const negX = f.multiplication(r.xComponent, -1.0)
        const negY = f.multiplication(r.yComponent, -1.0)
        const negZ = f.multiplication(r.zComponent, -1.0)
        const afterY = f._3dVectorRotation(f.create3dVector(0.0, negY, 0.0), axis)
        const afterX = f._3dVectorRotation(f.create3dVector(negX, 0.0, 0.0), afterY)
        const localAxis = f._3dVectorRotation(f.create3dVector(0.0, 0.0, negZ), afterX)
        const rot = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
          ball,
          new str('fb_spinx'),
          dur,
          angVel,
          localAxis
        ])
        f.connect(lin, 0, rot, 0)
        f.outflow('done', rot, 0)
      },
      () => {
        f.outflow('done', lin, 0)
      }
    )
    return {}
  }
})

// ———— 复合 2：把玩家角色坐标写进载体实体（kitListen 每拍调用）———————————————
// 客户端内核首选是直读 `fbc_e`（选项卡锁存的真角色句柄）；这里写的是**兜底通道**。
// 注：解析链可能给到恒在 (0,y,0) 的占位实体（无 GUID，D724）⇒ 会写 0；
//     内核用 `srvLen > 0.01` 拒收 0，所以写 0 无害。
export const fbWritePlayerPos = g.defineComposite('fb_write_player_pos', {
  id: 1610700051,
  inputs: {
    owner: { type: 'entity' },
    char: { type: 'entity' },
    tick: { type: 'int' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ owner, char, tick }, f) => {
    const lr = f.getEntityLocationAndRotation(char)
    const l = f.split3dVector(lr.location)
    const rot = f.split3dVector(lr.rotate)
    f.setCustomVariable(owner, 'fbvx', l.xComponent, false)
    f.setCustomVariable(owner, 'fbvz', l.zComponent, false)
    f.setCustomVariable(owner, 'fbvy', l.yComponent, false)
    // 角色朝向（yaw，度）：内核用它当**踢球基准方向**（角色面朝哪就往哪踢）
    f.setCustomVariable(owner, 'fb_yaw', rot.yComponent, false)
    // 最后一个写用 registerExecNode 拿句柄：f.setCustomVariable 不返回节点，outflow 需要句柄
    const last = f.registerExecNode('set_custom_variable', [
      owner,
      new str('fb_pos_tick'),
      tick,
      new bool(false)
    ])
    f.outflow('done', last, 0)
    return {}
  }
})
