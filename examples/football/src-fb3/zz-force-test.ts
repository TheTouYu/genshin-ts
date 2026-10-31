// @status: 施力测试图（独立于生产链，验证完可删）
// zz-force-test.ts —— 服务端图：把 Lua 按键翻译成**一次性**的施力脉冲。
//
// 链路：Lua 键 → fb_input 信号 → 本图 → 写载体 fb_fx/fb_fy/fb_fz（单位质量力 m/s²）
//      → 内核 kitLoop 每拍读并作为加速度叠加（kit-loop.ts:272-274 / 506）
//
// ⚠️ 2026-10-31 真机教训：上一版**只写不清**，力会永久留在载体上——日志 3454 实测
//    sec10 按了一次「−x 8」之后，球在 sec 10~27 一直以 **−8 m/s² 持续加速**（vx 从 −3.6
//    线性涨到 −17.76，滚动状态还在加速 = 物理上不可能），肉眼就是"球自己往左飘"。
//    修法：写完立刻起一个 0.35 s 的一次性定时器，到点清零 ⇒ 力变成"脉冲"。
//
// 按键（脉冲幅度 40 m/s²，约 3 拍）：1=+x  2=−x  3=+z  4=−z  5=+y  6=立刻清零
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const CARRIER = 1082130445n
const PULSE = 40.0

function writeForce(f: any, fx: number, fy: number, fz: number): void {
  const c = f.queryEntityByGuid(CARRIER)
  f.setCustomVariable(c, 'fb_fx', fx, false)
  f.setCustomVariable(c, 'fb_fy', fy, false)
  f.setCustomVariable(c, 'fb_fz', fz, false)
}

// 脉冲：写力 + **自增序号**（内核靠序号变化开一个 3 拍窗口；序号不变就一直不施加）
function pulse(f: any, fx: number, fy: number, fz: number): void {
  const c = f.queryEntityByGuid(CARRIER)
  writeForce(f, fx, fy, fz)
  const seq = f.getCustomVariable(c, 'fb_f_seq').asType('int')
  f.setCustomVariable(c, 'fb_f_seq', f.addition(seq, 1n), false)
}



g.server({ id: 1073741832, name: '_GSTS_forceTest' })
  .onSignal(KitSignal.fb_input, (evt: any, f: any) => {
    const k = evt.params.key
    // 多分支（官方 multipleBranches，int 控制表达式）：一张表看全所有键位
    // ⚠️ 只用 7/8/9：1-6 是内核的踢球键，两图同吃一条 fb_input 信号 ⇒ 若也绑 1-6，
    //    每次踢球都会额外叠一个 ±40 的 3 拍力脉冲（实测 tick424「按2抽射」被 −x 脉冲污染）。
    f.multipleBranches(k, {
      7: () => { pulse(f, PULSE, 0.0, 0.0) },
      8: () => { pulse(f, 0.0, PULSE, 0.0) },
      9: () => { writeForce(f, 0.0, 0.0, 0.0) },
      default: () => {}
    })
  })
