import { g } from 'genshin-ts/runtime/core'

// D2 对象式局部变量 API 游戏核验（2026-08-29，变量地图 1073741915）
//
// 观测方式：printString → 服务器日志（Beyond_Debug_Log f22 文本），用户跑游戏后导出日志。
// 图挂载到普通实体（1077936129 空模型），实体创建即启动 0.5s 循环定时器；
// 每 tick（whenTimerIsTriggered）重新执行局部变量链（S9：生命周期 = 单次图执行）。
//
// 每 tick 日志签名（顺序固定，值用 dataTypeConversion 转 str）：
//   d2lv|init|  → 42     常量 init 折叠进 Get：lv.value 首读 = init（每 tick 重建恒 42）
//   d2lv|set|   → 101    同身份多 Set（S7）：100 → +1（读 value 锚再更新）
//   d2lv|len|   → 3      列表字面量 [1,2,3] → 拼装节点值保留，长度 = 3
//   d2lv|elem0| → 1      下标 0 元素 = 1（0-based）
//   d2lv|dyn|   → N      动态 init（timerSequenceId）→ get(empty)+set(expr)，值 = tick 序号
g.server({ id: 1073741840, name: 'verify-d2-lv' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.startTimer(f.getSelfEntity(), 'd2lv_tick', true, [5])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    // ① 常量折叠 init（M2）：Get 直带 42
    const lv = f.localVariable('int', 42n)
    f.printString('d2lv|init|')
    f.printString(f.dataTypeConversion(lv.value, 'str'))
    // ② 同身份多 Set + value 锚读值链
    lv.set(100n)
    lv.set(f.addition(lv.value, 1n))
    f.printString('d2lv|set|')
    f.printString(f.dataTypeConversion(lv.value, 'str'))
    // ③ 列表字面量 → 拼装节点（值保留）
    const list = f.localVariable('int_list', [1n, 2n, 3n])
    f.printString('d2lv|len|')
    f.printString(f.dataTypeConversion(f.getListLength(list.value), 'str'))
    f.printString('d2lv|elem0|')
    f.printString(f.dataTypeConversion(f.getCorrespondingValueFromList(list.value, 0n), 'str'))
    // ④ 动态 init（get+set）：timerSequenceId = tick 序号（0,1,2,...）
    const dyn = f.localVariable('int', evt.timerSequenceId)
    f.printString('d2lv|dyn|')
    f.printString(f.dataTypeConversion(dyn.value, 'str'))
  })
