// @status: 新抽离·**compile-only 自证图，禁止注入**（占位 ID）
// client-kit/selfcheck.ts —— 用 toy kernel 实例化整套壳，证明 kit 能真编出图
//
// 为什么要有这个文件：抽离出来的库如果只被写明，没被真编译，就等于没抽出（"只写不接"）。
// 本图把 20008 骨架 + seqlock 邮箱 + 自持组 + 一拍积分全跑一遍（编译期），
// 断言见 scripts/check-client-kit.sh（node 数 / 关键节点在不在）。
//
// ⚠️ 本图**不发信号**（信号图编译期要读目标地图的注册表；自证图要保持"任意地图可编"）。
// 真实链路的回传段见 templates/loop-with-send.ts（需先在目标地图注册信号）。
//
// toy kernel = 自由落体：vel.y -= g*dt；pos += vel*dt；落地(y<=0.05) 时 Rest。不做碰撞。

import { g } from 'genshin-ts/runtime/core'

import { chanReadF, chanWriteF } from './channels.js'
import { loopTick } from './loop.js'
import { fixDecode } from './protocol.js'

// 占位：自持组段（真实地图必须先有技能变量才能用；此处仅编译自证）
const SLOT_BASE = 1207959569n
const DT = 0.0666
const GRAVITY = 9.81

g.creationSkill({ id: 1082130499, name: '_GSTS_kitSelfcheck' }).on('start', (_evt: any, f: any) => {
  loopTick(f, {
    mail: {
      epoch: 'kit_epoch',
      ack: 'kit_ack',
      sum: 'kit_sum',
      t: ['kit_t1', 'kit_t2', 'kit_t3', 'kit_t4', 'kit_t5', 'kit_t6', 'kit_t7', 'kit_t8']
    },
    slotBase: SLOT_BASE,
    slots: 8,
  // 任务拍：t1=type(1=SET_VEL), t2..t4=vel×1000
  onTask: (f: any, mail: any) => {
    const isSetVel = f.equal(mail.t1, 1n)
    f.doubleBranch(
      isSetVel,
      () => {
        chanWriteF(f, SLOT_BASE + 3n, fixDecode(f, mail.t2))
        chanWriteF(f, SLOT_BASE + 4n, fixDecode(f, mail.t3))
        chanWriteF(f, SLOT_BASE + 5n, fixDecode(f, mail.t4))
      },
      () => {}
    )
  },
    // 每拍：读自持组 → 积分 → 写回
    step: (f: any, tick: any) => {
    void tick
    const py = chanReadF(f, SLOT_BASE + 2n)
    const vy = chanReadF(f, SLOT_BASE + 5n)
    const vyNext = f.subtraction(vy, GRAVITY * DT)
    const pyNext = f.addition(py, f.multiplication(vy, DT))
    const grounded = f.lessThanOrEqualTo(pyNext, 0.05)
    chanWriteF(f, SLOT_BASE + 2n, pyNext)
    f.doubleBranch(
      grounded,
      () => {
        chanWriteF(f, SLOT_BASE + 5n, 0.0)
      },
      () => {
        chanWriteF(f, SLOT_BASE + 5n, vyNext)
      }
    )
  },
})
})
