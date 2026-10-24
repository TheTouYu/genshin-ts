// @status: 新抽离·编译已验证（selfcheck.ts 以 toy kernel 实例化它）
// client-kit/loop.ts —— 客户端常驻计算的**骨架工厂**（20008 造物技能图载体）
//
// 来源：examples/football/src-fb/fb-phys2.ts 的第一段（①计数器 / ②E1 寄存器门 / ③任务物化）
// + chanDispatch 身份分发（src-fb/channels.ts）。抽离动作：把"协议壳"与"物理内核"切开——
// 前者在这里，后者由场景通过 onTask/step 注入（足球的六态积分、魔方的角块解算都走同一壳）。
//
// 载体选择（见技能 §〇 选型表）：常驻高频循环 = 20008 造物技能图（15~16/s 近距上限）。
// 单次触发/角色载体用 20002（examples/football/src-fb/fb20c-loop.ts 形态），不在本工厂范围。
//
// 用法（最小）——**图声明留在场景文件**（DSL 的图注册必须写在被编译的入口文件顶层；
// 库里的 g.creationSkill 不会被 Stage 1 展开，2026-10-24 实测）：
//   g.creationSkill({ id: 1082130437, name: '_GSTS_myLoop' }).on('start', (_e, f) => {
//     loopTick(f, {
//       ...
//       mail: { epoch: 'my_epoch', ack: 'my_ack', sum: 'my_sum', t: ['my_t1', 'my_t8'] },
//       slotBase: 1207959569n,     // 自持组 11 槽起点（float）
//       slots: 8,
//       onTask: (f, o) => { ... }, // 可选：把 o.t 里的载荷解进自持组
//       step: (f, k) => { ... }    // 必填：一拍计算（读自持组 → 算 → 写自持组）
//     })
//   })
//
// 载体前提（缺一必在运行期静默降频/零帧，全部实测）：
//   · 瞬发技能配置：CD 0.01s + **忽略公共冷却**（缺一被钉 ~1/s）
//   · 造物用**小体型**模型（15~16/s；遗迹守卫 7.5/s）
//   · 客户端要读的实体自定义变量必须**资产预注册**（未注册读回 EMPTY）
//   · 造物离玩家远 → 引擎节流（~4/s 中距、~1/s 超射程）→ 常驻高频需"射程维持"段

import { chanIncr } from './channels.js'
import { seqOpen, seqReadMail } from './protocol.js'
import type { MailNames } from './protocol.js'

export interface LoopSpec {
  /** owner（玩家实体）上的邮箱变量名 */
  mail: MailNames
  /** 自持组起点（技能变量段，一实例一 cfg；段内空闲位才能用） */
  slotBase: bigint
  /** 自持组分量数（≤10/实例；11 分量需拆两段或用 ≤10 的设计） */
  slots: number
  /** 任务拍：载荷已通过 seqlock 校验，可安全消费（写出解析进自持组/局部量） */
  onTask?: (f: any, mail: any, epoch: any) => void
  /** 每拍计算（无任务拍也会调；契约：读自持组→算→写自持组，不碰服务端变量） */
  step: (f: any, tick: any) => void
}

export const loopTick = (f: any, spec: LoopSpec): void => {
    // 拍号（自持，跨施放保持；E2 定论：图内局部变量不跨施放，故不能当计数器）
    const tick = chanIncr(f, spec.slotBase)
    // owner = 场上玩家[0]（客户端参数序 (iD, list)，与服务端相反）
    const owner = f.getCorrespondingValueFromList(0n, f.getListOfPlayerEntitiesOnTheField())
    const g0 = seqOpen(f, owner, spec.mail)

    // —— 任务拍：只有 seqlock 全过才消费（半截任务=不应用，交给看门狗重提交） ——
    f.doubleBranch(
      f.logicalNotOperation(g0.eEq),
      () => {
        const mail = seqReadMail(f, owner, spec.mail, g0.epoch)
        f.doubleBranch(
          mail.ok,
          () => {
            if (spec.onTask) spec.onTask(f, mail, g0.epoch)
          },
          () => {}
        )
      },
      () => {}
    )

    // —— 每拍计算（协议壳与内核的分界线：这里往下全是场景语义） ——
    spec.step(f, tick)
}
