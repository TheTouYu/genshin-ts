// fb20d-calib.ts —— 单次施放内大循环节拍校准探针（type 20002 角色技能，2026-09-05）
//
// 目标：只释放一次技能，在这一次「节点图开始」里跑一个大 finiteLoop，
// 用服务端收到的 CAL_START / CAL_DONE 两次信号之间的真实墙钟跨度，估算
// 客户端每执行一次循环体（一个节拍）的大致时间。
// 背景铁证（E0 3191）：getCurrentClientTimeHighPrecision 在单次施放内**冻结**
// （203/1003 次读同一值）→ 图内时钟不能当本次循环的秒表；因此本探针不在循环体里
// 读时钟，只做 k++ 纯计数，由服务端跨信号计时。
//
// 用法（注入后）：
//   1. 游戏内点自定义按钮「跑一次」（fb20d-ui 服务端图收到界面控件组事件）
//   2. 服务端 add→create→cast 本配置 → 本图 start 执行一次
//   3. 期望服务端打印：fb20d:cast / fb20d:start <run> / fb20d:done <k>
//   4. 从日志 f3 秒差（或服务端记录序）估墙钟；k 就是循环体实际执行次数
//
// 真值（2026-09-05 CLI 候选分配，写回前勿改）：
//   图 ID      1082130440（assets:node-graphs create --type 20002 候选分配）
//   技能配置    1098907654 GSTS-fb20d-calib（template 6 + 瞬发，body-f5 绑本图）
//   信号        fb20d_echo(tag:str,e:int) send/monitor/server=1610612786/787/788
//   技能变量槽  1207959582（1908 段内空闲位，跨施放保持；仅用于 run id 去重/对照）
//
// 负载纪律：
//   · 大循环必须**详情日志关闭**（否则每圈一帧会把日志撑爆/超 3000 帧截断）；
//     本图只发 2 条信号，不 print。
//   · LOOP_ITERS 是保守起步值；若一轮太短/太长，改一个常量重注入即可。
import { g } from 'genshin-ts/runtime/core'

import { Fb20Signal } from './signals20.js'

const CFG_RUN = 1207959582n // 跨施放保持的 run id（角色侧 L0 技能变量，E0-Q4 已证）
const LOOP_ITERS = 20000n // 期望循环体执行次数
const LOOP_END = LOOP_ITERS - 1n // finiteLoop 含端点，start=0 end=N-1 ⇒ N 次

g.characterSkill({ id: 1082130440, name: '_GSTS_fb20dCalib' }).on('start', (_evt, f) => {
  // 每次点击取一个 run id（供服务端/判读区分 START/DONE 配对）
  const q = f.querySkillVariableValue(CFG_RUN)
  const run = f.dataTypeConversion(q, 'int') + 1n
  f.setSkillVariable(CFG_RUN, f.dataTypeConversion(run, 'float'))
  f.sendSignalToServerNodeGraph(Fb20Signal.fb20d_echo, 'CAL_START', run)

  // 大循环：体 = 纯 k++，不读时钟、不 print、不抽样
  const k = f.localVariable('int', 0n, { name: 'fb20d_k' })
  f.finiteLoop(0n, LOOP_END, (_i, _breakLoop) => {
    k.set(f.addition(k.value, 1n))
  })

  // 循环完成（finiteLoop 完成出口）后才发 DONE，e = 实际圈数
  f.sendSignalToServerNodeGraph(Fb20Signal.fb20d_echo, 'CAL_DONE', k.value)
})
