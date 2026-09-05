// fb20c-loop.ts —— 票 20 · E0 轮探针图（type 20002 角色技能，2026-09-04）
//
// 目标（设计单 §7.1 五问，判据已预注册，实测前不改口径）：
//   Q1 6+瞬发+20002 能否被「定时触发技能」单位状态**自动**施放（本图零服务端 cast）
//   Q2 触发间隔下限（本轮状态配 0.1s，判读=RTAG1 秒桶到达率）
//   Q3 图内时钟真实行为（CTIME=getCurrentClientTimeHighPrecision().clientTimeMs）
//   Q4 **角色施放的技能变量隔离粒度**（19 票只测造物）——RTAG1 逐拍严格递增=跨施放保持；恒 1=新隔离实例
//   Q5 单次施放内 finiteLoop + 时钟预算做时间驱动子调度的代价（SUB_K 圈数 / SUB_DT 末圈耗时）
//
// 真值（2026-09-04 CLI 注册 + 回读，勿改）：
//   图 ID      1082130439（assets:node-graphs create --type 20002 系统分配）
//   技能配置    1098907653 GSTS-fb20c-timer（template 6 + 瞬发，body-f5 绑本图）
//   信号        fb20_echo(tag:str,e:int) send/monitor/server=1610612783/784/785
//   技能变量槽  1207959581（用户建的 100 变量段 1207959553..652 中的空闲位；
//              553~556=票18 / 558,563,565,566=chan-selftest / 569~580=票19 fb-phys2）
//
// 触发权归属：**本图不含任何定时器/施放节点**——引擎定时器语义在「定时触发技能」单位状态里
// （设计单 §7.2）。服务端只做装配 + 施加状态（fb20c-server.ts）。
//
// 负载纪律（AGENTS 铁律 + 设计单 §7.3）：
//   · finiteLoop 有**圈数上界 + 时钟预算双闸**（LOOP_CAP 与 BUDGET_MS 任一命中即 breakLoop）
//   · 全程零 print（判读走详情开窗帧流；2026-09-03 打印纪律）
//   · 观测信号事件门控：RTAG1/CTIME 每拍发（Q1 到达率与 Q3 跨拍间隔的定义即"每拍"）；
//     SUB_K/SUB_DT **按拍计数抽样**发（日志 3190 实证修正，2026-09-05）——
//     原先"按秒抽样门 = clientTimeMs 秒内余数 < 250ms"**设计错误**：getCurrentClientTimeHighPrecision()
//     的 clientTimeMs 实测是**秒内相位**（本会话 466..666ms，非均匀覆盖 0..999），且单次施放
//     内该时钟**不推进**（500 圈每圈读回同一 466）→ 门永不命中、SUB_K/SUB_DT 整轮零发射；
//     又因单次施放内时钟冻结，dt 恒 0、时钟预算永远不触发 → 每拍 finiteLoop 必跑满 LOOP_CAP，
//     单拍 5031 帧 ≈ **超 3000 帧/记录红线**（日志体积/截断风险）。
//     → 修正：① 抽样门改用 RTAG1 拍计数 n（`n−(n/4)·4==0` 每 4 拍一发，整除回乘求余无取模节点）；
//     ② 把 LOOP_CAP 从 500 降到 **100**（单拍 ~1000 帧，红线内）；
//     ③ SUB_DT 语义改为"本拍实际执行的圈数 K"仍保留，dt 因时钟冻结恒 0 不再回传（避免误导）。
//     （Q5 真正的结论待下一轮：若单拍时钟确实冻结 ⇒ 引擎不在一次技能执行内推进客户端时间，
//       时间驱动子调度只能以施放率为拍，不能在图内忙等计时——这是本轮行为层最有价值的未闭合发现）
import { g } from 'genshin-ts/runtime/core'

import { Fb20Signal } from './signals20.js'

// ———— 技能变量槽（Q1/Q4 共用；一实例一 cfg 纪律，角色载体只有一个实例） ————
const CFG_R = 1207959581n
// ———— Q5 子调度预算（圈数上界 / 单拍耗时上界 ms / 抽样间隔拍数） ————
const LOOP_CAP = 100n
const BUDGET_MS = 20n
const SUB_SAMPLE_EVERY = 4n
const SEC_MS = 1000n

g.characterSkill({ id: 1082130439, name: '_GSTS_fb20cLoop' }).on('start', (_evt, f) => {
  // ———— Q3 时钟起点（本拍 t0；同值兼作 CTIME 回传载荷） ————
  const t0 = f.getCurrentClientTimeHighPrecision().clientTimeMs
  f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'CTIME', t0)

  // ———— Q1 + Q4：读改写递增后立即回读（跨施放保持 = 逐拍递增；新隔离实例 = 恒 1） ————
  const q = f.querySkillVariableValue(CFG_R)
  const n = f.dataTypeConversion(q, 'int') + 1n
  f.setSkillVariable(CFG_R, f.dataTypeConversion(n, 'float'))
  const rb = f.dataTypeConversion(f.querySkillVariableValue(CFG_R), 'int')
  f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'RTAG1', rb)

  // ———— Q5：圈数上界有限子循环（时钟预算保留但预期不触发=单拍时钟冻结的测量载体） ————
  const k = f.localVariable('int', 0n, { name: 'fb20_k' })
  f.finiteLoop(0n, LOOP_CAP, (_loopValue, breakLoop) => {
    const tNow = f.getCurrentClientTimeHighPrecision().clientTimeMs
    const spent = f.subtraction(tNow, t0)
    k.set(f.addition(k.value, 1n))
    f.doubleBranch(f.greaterThanOrEqualTo(spent, BUDGET_MS), () => breakLoop(), () => {})
  })

  // ———— Q5 回传（按拍计数抽样：n−(n/4)·4==0 时发 SUB_K；SUB_DT 因时钟冻结恒 0 不再发） ————
  const nDiv = f.division(n, SUB_SAMPLE_EVERY)
  const nResidue = f.subtraction(n, f.multiplication(nDiv, SUB_SAMPLE_EVERY))
  f.doubleBranch(f.equal(nResidue, 0n), () => {
    f.sendSignalToServerNodeGraph(Fb20Signal.fb20_echo, 'SUB_K', k.value)
  }, () => {})
})
