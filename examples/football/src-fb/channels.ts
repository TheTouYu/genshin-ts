// channels.ts —— 通道语义原语库（票 19 复用层 v1；API 文档见 .scratch/football-v2/issues/19-channel-api.md）
// @status: active
// 定位：客户端自持存储/读回/节拍/身份四类原语，零场景耦合（场景语义只在调用层）。
// 两套值域铁律：
//   ① handler 体内原生算术/数组/索引会被 Stage 1 自动改写为 IR 算子；
//   ② 库函数体内不会被改写——库内对 IR 值的一切运算必须显式 f.*。
// cfgId 铁律：调用点 cfgId 只能传 const 引用/字面量；偏移计算留给库内。
// 引擎约束速查：并发写同 cfg 丢步→一实例一 cfg；chanDispatch 末分支 else 空；
//   服务端定时器粒度 ~0.09s→intervalS ≥0.09；信号参数上限 10；chanGate 写实体变量需预注册。
// 导出函数（11）：chanWriteF/chanReadF/chanIncr/chanWriteF32Group/chanReadF32Group/
//   chanSendScalar/chanSendState6/chanPollStart/chanGate/chanSelfId/chanDispatch；约定条目见 19-channel-api.md。
// 与 19-channel-api.md 的偏差（chanWriteF32Group/chanDispatch 签名）以本文件实现为准。

// ———— ① 写原语（客户端自持存储——锁步破除核心） ————

// 单分量写：value 存入 cfgId 技能变量（跨施放保持 + 同拍读零延迟）。
// value 可为原生 number 或 IR float 值（setSkillVariable 内部 parseValue 兼收）；
// cfgId 必须是 const 引用/字面量（调用点算术会变 IR 值被 config_id 拒收）
export const chanWriteF = (f: any, cfgId: bigint, value: any): void => {
  f.setSkillVariable(cfgId, value)
}

// 单分量读：返回 float IR 值（同拍写读零延迟，14 票 776/776 实证）。
// 返回值参与运算走 f.* 算子（handler 体内自动改写；库内需显式）
export const chanReadF = (f: any, cfgId: bigint): any =>
  f.querySkillVariableValue(cfgId)

// 读改写递增：返回读回的 int IR 值（跨施放保持；一实例一 cfg——并发丢步）
export const chanIncr = (f: any, cfgId: bigint): any => {
  const q = f.querySkillVariableValue(cfgId)
  const n = f.addition(f.dataTypeConversion(q, 'int'), 1n)
  f.setSkillVariable(cfgId, f.dataTypeConversion(n, 'float'))
  return f.dataTypeConversion(f.querySkillVariableValue(cfgId), 'int')
}

// N 分量批量写：cfgBase+0..N-1 逐个写（N ≤ 10/实例——codec §1 分量上限）。
// values = 调用点数组字面量（Stage 1 自动转 assemblyList）；n = 元素数显式传
export const chanWriteF32Group = (f: any, cfgBase: bigint, n: number, values: any): void => {
  for (let i = 0; i < n; i++) {
    const v = f.getCorrespondingValueFromList(BigInt(i), values)
    f.setSkillVariable(cfgBase + BigInt(i), v)
  }
}

// N 分量批量读：返回 float 组的 list IR 值——调用点用 grp[i] 索引会被
// Stage 1 自动改写为 getCorrespondingValueFromList(i, grp)，直接可用
export const chanReadF32Group = (f: any, cfgBase: bigint, n: number): any => {
  const vals: any[] = []
  for (let i = 0; i < n; i++) {
    vals.push(f.querySkillVariableValue(cfgBase + BigInt(i)))
  }
  return f.assemblyList(vals)
}

// ———— ② 读回原语（数据到达服务端的路径） ————

// 标量信号回传：(str, int) 两参免 donor；tag 传原生 string 字面量（保持 literal）
export const chanSendScalar = (f: any, signalRef: any, tag: string, e: any): void => {
  f.sendSignalToServerNodeGraph(signalRef, tag, e)
}

// 六元组状态回传：6 参 vec3 形态（tag/tick/pos/vel/spin/state；上限 10 内）。
// pos/vel/spin 传 vec3 IR 值（f.create3dVector 产物或 vec3 局部量）
export const chanSendState6 = (
  f: any,
  signalRef: any,
  tag: string,
  tick: any,
  pos: any,
  vel: any,
  spin: any,
  state: any
): void => {
  f.sendSignalToServerNodeGraph(signalRef, tag, tick, pos, vel, spin, state)
}

// chanOnHpPulse —— 挂载约定条目（非函数）：HP 结算写脉冲的读回形态 =
//   读回图挂目标实体 + 图级 .on('whenHpIsRecovered')（出参含实际恢复量）；
//   满血钳制为 0 → 需配扣血循环维持恢复空间（53/s 实测口径）。
//   完整实现样板=现网 fb-svlisten.ts（票 18）。

// 轮询启动：服务端 repeating 定时器（intervalS ≥ 0.09；消费侧=图级名单制分支）。
// 序列参数须 assemblyList 包装（startTimer 内部 parseValue('float_list') 拒收
// 原生数组——库体内无 Stage 1 自动包装，须显式，编译实证）
export const chanPollStart = (
  f: any,
  target: any,
  timerName: string,
  intervalS: number
): void => {
  f.startTimer(target, timerName, true, f.assemblyList([intervalS]))
}

// ———— ③ 节拍原语 ————
// [约定] 28 模板瞬发配置：CD 0.01s + 忽略公共冷却（缺一被钉 ~1/s——五C 定论）
// [约定] 距离节流：施放触发 = 每造物独立 ~15/s 近距 / 4-5/s 远距（18 票实证）

// 任务开关：服务端写挂载实体自定义变量 0|1（客户端读需预注册）
export const chanGate = (f: any, taskVar: string, on: bigint): void => {
  f.setCustomVariable(f.getSelfEntity(), taskVar, on, false)
}

// ———— ④ 身份原语（多实例区分） ————

// 自实例 GUID（客户端图身份基础：queryGuidByEntity(getSelfEntity()) 包装）
export const chanSelfId = (f: any): any => f.queryGuidByEntity(f.getSelfEntity())

// 多实例分发：嵌套 doubleBranch + equal；idAt(i) 返回第 i 个实例的实体
// GUID **原生 bigint 常量**（equal(guid, 原生常量) 与模板先例同型——list
// 提取元素是 generic pin，与 guid 泛型不可统一，编译实证）；handlerAt(i)
// 返回第 i 个实例的执行闭包；末分支兜底 else 空（防陌生实例污染）。
// 两回调均为单箭头实参（免 Stage 1 数组包装），库内求值期构建嵌套分支，
// 产物图中无递归——纯静态展开
export const chanDispatch = (
  f: any,
  guid: any,
  n: number,
  idAt: (i: number) => bigint,
  handlerAt: (i: number) => () => void
): void => {
  const dispatchFrom = (i: number): void => {
    if (i === n - 1) {
      f.doubleBranch(f.equal(guid, idAt(i)), handlerAt(i), () => {})
      return
    }
    f.doubleBranch(f.equal(guid, idAt(i)), handlerAt(i), () => dispatchFrom(i + 1))
  }
  if (n > 0) dispatchFrom(0)
}
