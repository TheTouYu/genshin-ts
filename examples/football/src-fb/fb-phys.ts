// 足球客户端算力最小通路·fb-phys（20008 造物技能图，E1+E2，2026-09-02，地图 1073741908）
//
// 照抄 zt-lane 门控图（1915 已验证形态）缩比 8 载荷 + E2 图内计数器。
// 触发链：造物 AI 持续执行决策图→状态图 executeSkill→技能 1191182337 施放→本图 start。
// 每次施放 = 一次轮询（小体型模型 15~16 次/s）：
//   1. E2 计数器：局部变量 fb_tick 跨拍 +1（图变量跨技能施放保持 = R1 最高风险验证点；
//      若每拍复位为 1，物理降频 5Hz 兜底——REBUILD-V2-PLAN §2.7-A）
//   2. seqlock 门：读 fb_epoch/fb_ack（玩家实体寄存器），不等才读 8 载荷→求和比对 fb_sum
//      →二读 fb_epoch 防读取中被覆盖→全过才 sendSignal(fb_echo, 'ok', e, tick)
// 载荷公式 pe*1000+i（随 epoch 严格单调，撕裂必然改变总和——确定性检测）。
// 空转成本 = 2 读 + 1 比较；无 print（观测走信号，服务端 f22 留痕）。
import { g } from 'genshin-ts/runtime/core'

import { FbSignal } from './signals.js'

g.creationSkill({ id: 1082130433, name: '_GSTS_fbPhysSkill' }).on('start', (_evt, f) => {
  // E2 计数器：单名局部变量（Get=创建/Set=更新）；c 回传值跨拍递增 ⇒ 槽持久
  const tick = f.localVariable('int')
  tick.set(tick.value + 1n)

  // 客户端参数序 (iD, list)——与服务端 (list, iD) 相反
  const owner = f.getCorrespondingValueFromList(0n, f.getListOfPlayerEntitiesOnTheField())
  const ack = f.getCustomVariable(owner, 'fb_ack').asType('int')
  const e1 = f.getCustomVariable(owner, 'fb_epoch').asType('int')
  f.doubleBranch(f.equal(e1, ack), () => {
  }, () => {
    const v1 = f.getCustomVariable(owner, 'fb_t1').asType('int')
    const v2 = f.getCustomVariable(owner, 'fb_t2').asType('int')
    const v3 = f.getCustomVariable(owner, 'fb_t3').asType('int')
    const v4 = f.getCustomVariable(owner, 'fb_t4').asType('int')
    const v5 = f.getCustomVariable(owner, 'fb_t5').asType('int')
    const v6 = f.getCustomVariable(owner, 'fb_t6').asType('int')
    const v7 = f.getCustomVariable(owner, 'fb_t7').asType('int')
    const v8 = f.getCustomVariable(owner, 'fb_t8').asType('int')
    const sum = f.getCustomVariable(owner, 'fb_sum').asType('int')
    const e2 = f.getCustomVariable(owner, 'fb_epoch').asType('int')
    const h8 = v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8
    f.doubleBranch(f.equal(e2, e1), () => {
      f.doubleBranch(f.equal(h8, sum), () => {
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'ok', e1, tick.value)
      }, () => {
        f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'tearH', e1, tick.value)
      })
    }, () => {
      f.sendSignalToServerNodeGraph(FbSignal.fb_echo, 'tearE', e1, tick.value)
    })
  })
})
