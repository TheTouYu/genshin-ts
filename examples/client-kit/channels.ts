// @status: 新抽离·编译已验证（selfcheck 走 gsts.kit.config.ts）
// client-kit/channels.ts —— 客户端计算通道**原语库**（零场景语义）
//
// 来源：examples/football/src-fb/channels.ts（足球 v5 票 19 复用层 v1，2026-09-03 实战场）。
// 抽离动作：去掉足球实体/段号等场景常量，只留「自持存储 / 读回 / 节拍 / 身份」四类原语。
// 场景代码只允许 import 本文件，**不要在场景里重写这些循环/分支**——重写会各写一份判据。
//
// 两套值域铁律（违反必炸，来源=足球轮次实证）：
//   ① handler 体内原生算术/数组/索引会被 Stage 1 自动改写为 IR 算子；
//   ② **库函数体内不会被改写**——库内对 IR 值的一切运算必须显式 `f.addition(...)` 等。
// cfgId 铁律：调用点 cfgId 只能传 const 引用/字面量；偏移计算留给库内。
//
// 引擎约束速查（全部实测）：
//   · 技能变量按"施放实例"隔离，同 cfg 并发写会丢步 → **一实例一 cfg**
//   · 跨施放保持 + 同拍写读零延迟（14 票 776/776）→ 客户端自持存储的地基
//   · 服务端定时器粒度 ~0.09s → intervalS ≥ 0.09
//   · 信号参数上限 10 → 六元组用 vec3 合并（见 protocol.ts）
//   · chanGate 写实体变量需资产预注册（客户端读未注册变量=EMPTY）

// ———— ① 自持存储（客户端自己的寄存器，锁步破除的核心） ————

// 单分量写：value 可为原生 number 或 IR float 值（setSkillVariable 内部 parseValue 兼收）
export const chanWriteF = (f: any, cfgId: bigint, value: any): void => {
  f.setSkillVariable(cfgId, value)
}

// 单分量读：返回 float IR 值（同拍写读零延迟）
export const chanReadF = (f: any, cfgId: bigint): any =>
  f.querySkillVariableValue(cfgId)

// 读改写递增：返回读回的 int IR 值（跨施放保持；一实例一 cfg）
export const chanIncr = (f: any, cfgId: bigint): any => {
  const q = f.querySkillVariableValue(cfgId)
  const n = f.addition(f.dataTypeConversion(q, 'int'), 1n)
  f.setSkillVariable(cfgId, f.dataTypeConversion(n, 'float'))
  return f.dataTypeConversion(f.querySkillVariableValue(cfgId), 'int')
}

// N 分量批量写：cfgBase+0..N-1 逐个写（N ≤ 10/实例——分量上限）
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

// ———— ② 读回（结果送到服务端的两条通道） ————

// 标量信号回传：(str, int) 两参免 donor（内置布局）
export const chanSendScalar = (f: any, signalRef: any, tag: string, e: any): void => {
  f.sendSignalToServerNodeGraph(signalRef, tag, e)
}

// 六元组状态回传：6 参 vec3 形态（tag/tick/pos/vel/spin/state，在上限 10 内）
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

// ———— ③ 节拍 ————
// [约定] 瞬发技能配置：CD 0.01s + 忽略公共冷却（缺一被钉 ~1/s）
// [约定] 施放频率 = 每造物独立，且**随施放者与玩家距离**调制：贴玩家 ~15/s、中距 ~4/s、超射程 ~1/s
//        （2026-09-04 用户实测修正——常驻高频必须让载体靠近玩家，见 kit README「射程维持」）

// 任务开关：写挂载实体自定义变量 0|1（客户端读需预注册）
export const chanGate = (f: any, taskVar: string, on: bigint): void => {
  f.setCustomVariable(f.getSelfEntity(), taskVar, on, false)
}

// 服务端轮询启动：repeating 定时器（intervalS ≥ 0.09；消费侧必须做名单制分支）
export const chanPollStart = (
  f: any,
  target: any,
  timerName: string,
  intervalS: number
): void => {
  f.startTimer(target, timerName, true, f.assemblyList([intervalS]))
}

// ———— ④ 身份（多实例区分） ————

// 自实例 GUID（客户端图身份基础）
export const chanSelfId = (f: any): any => f.queryGuidByEntity(f.getSelfEntity())

// 多实例分发：嵌套 doubleBranch + equal；idAt(i) 返回第 i 个实例 GUID 的**原生 bigint 常量**
// （IR 值作比较键与模板先例不同型，编译实证）；handlerAt(i) 返回第 i 个实例的执行闭包；
// **末分支兜底 else 必须为空**（防陌生实例污染数据——18 票 decode 断言逮住过）
// 两回调均为单箭头实参（免 Stage 1 数组包装）；库内求值期静态展开，产物图中无递归
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
