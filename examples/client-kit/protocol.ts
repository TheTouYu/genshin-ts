// @status: 新抽离·编译已验证（selfcheck.ts 覆盖）
// client-kit/protocol.ts —— 客户端计算的**任务/回传协议**（seqlock 邮箱 + 定点编解码 + tag 约定）
//
// 来源：examples/football/src-fb/fb-phys2.ts 的"② E1 寄存器门 / ③ 任务物化"段 + fb-sink.ts 接收门
//（足球 E1 票 2026-09-02 收口：11/11 零丢失零撕裂；单通道 ~5 任务/秒、同秒往返）。
// 抽离动作：把"怎么保证不读到半截任务""怎么把 float 塞进 int 变量""回传 tag 怎么分"做成函数。
//
// ⚠️ 库函数体**不会被 Stage 1 改写**（技能两套值域铁律）——因此本文件：
//   ① 只做 `f.*` 算子调用，不做原生算术；
//   ② **不创建局部变量**（`localVariable().value` 在库体里拿到的是 pin 句柄，会撞
//      "Generic parameter not matched"，2026-10-24 实测）——需要"一个寄存器读一次、多处消费"
//      时，物化局部变量写在**场景 handler 体**里（那里 `.value` 会被 Stage 1 解成值）。
//
// 协议骨架（服务端→客户端）：
//   owner 实体上的变量：<epoch> <ack> <sum> <t1..t8>
//   服务端：先写 t1..t8 → 再写 sum=Σtᵢ → **最后** epoch=epoch+1（最后一步才是"提交"）
//   客户端每拍：读 ack/epoch；epoch==ack ⇒ 无新任务
//              epoch!=ack ⇒ 读 t1..t8 + sum + **二读** epoch：二读变过/求和不等 = 撕裂，不应用
//              全过 ⇒ 解出任务；**ack 延后到结果确认**（防丢任务）
//
// 回传约定（客户端→服务端）：6 参 vec3 形态（引擎参数上限 10）
//   tag='P' 提交本拍结果 / tag='T' 客户端自检不一致（服务端零应用）

import { chanSendScalar, chanSendState6 } from './channels.js'

export const TAG_COMMIT = 'P'
export const TAG_TEAR = 'T'

// ———— 定点编码（int 变量装 float）：载荷里 float 一律 ×1000 ————
export const FIX_K = 1000
export const fixDecode = (f: any, intVal: any): any =>
  f.division(f.dataTypeConversion(intVal, 'float'), FIX_K)

// ———— 邮箱变量名 ————
export interface MailNames {
  epoch: string
  ack: string
  sum: string
  /** t1..t8 的顺序即载荷槽位（最多 8 个） */
  t: string[]
}

// 读 ack/epoch：返回 { ack, epoch, eEq }（每个寄存器只读一次；需要多处消费时场景侧物化）
export const seqOpen = (f: any, owner: any, n: MailNames): any => {
  const ack = f.getCustomVariable(owner, n.ack).asType('int')
  const epoch = f.getCustomVariable(owner, n.epoch).asType('int')
  const eEq = f.equal(epoch, ack)
  return { ack, epoch, eEq }
}

// 读邮箱 + 二读 epoch + 求和校验：返回 { ok, t1..t8, sum, epoch2 }
// 调用点：`const m = seqReadMail(f, owner, names, g0.epoch)`；载荷 = `m.t1 .. m.t8`
// ⚠️ 载荷**按名字给**（t1..t8）而不是数组：场景文件里写 `mail.t[0]` 会被 Stage 1 改写成
//    "取 IR 列表第 i 项"，而我们给的是普通 JS 数组 → 编译期拿到 undefined（2026-10-24 实测）。
export const seqReadMail = (f: any, owner: any, n: MailNames, epoch1: any): any => {
  const t = n.t.map((name: string) => f.getCustomVariable(owner, name).asType('int'))
  const sum = f.getCustomVariable(owner, n.sum).asType('int')
  const epoch2 = f.getCustomVariable(owner, n.epoch).asType('int')
  // Σtᵢ（闭式求和：N 个加法节点替代逐任务手写；口径必须与服务端 mailPost 一致）
  let h: any = t[0]
  for (let i = 1; i < t.length; i++) h = f.addition(h, t[i])
  const ok = f.logicalAndOperation(f.equal(epoch2, epoch1), f.equal(h, sum))
  const out: any = { ok, sum, epoch2, t }
  for (let i = 0; i < t.length; i++) out['t' + (i + 1)] = t[i]
  return out
}

// ack 前进（只前进不回退；重复回声幂等吸收）
export const seqAck = (f: any, owner: any, n: MailNames, epoch: any): void => {
  const cur = f.getCustomVariable(owner, n.ack).asType('int')
  const next = f.greaterThan(epoch, cur)
  f.doubleBranch(
    next,
    () => {
      f.setCustomVariable(owner, n.ack, epoch, false)
    },
    () => {}
  )
}

// ———— 回传 ————
export const sendCommit = (
  f: any,
  sig: any,
  baseTick: any,
  pos: any,
  vel: any,
  spin: any,
  state: any
): void => {
  chanSendState6(f, sig, TAG_COMMIT, baseTick, pos, vel, spin, state)
}

export const sendTear = (
  f: any,
  sig: any,
  baseTick: any,
  pos: any,
  vel: any,
  spin: any,
  state: any
): void => {
  chanSendState6(f, sig, TAG_TEAR, baseTick, pos, vel, spin, state)
}

// 轻量回执（tag/e 两参信号）：ok / 未知类型 / 看门狗回声等观测面
export const sendEcho = (f: any, sig: any, tag: string, e: any): void => {
  chanSendScalar(f, sig, tag, e)
}
