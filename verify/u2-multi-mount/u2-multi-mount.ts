// @ts-nocheck
// U2 差分实验（2026-08-16，S4 测评未知清单 U2）：同一节点图挂载到多个实体——各实例是否都执行
// 背景：灯阵第二 demo 架构选项——"1 图 × 9 挂载"（图变量实例隔离未验证）vs "9 份同源图"。
//       本实验只测多挂载执行性（图变量隔离属次要问题，可后续单独差分）。
// 挂载计划（需用户授权）：1077936151「验证选项卡-场景」（现有 5 图 + 本图）+
//   1086324737「默认模版」（编辑器自动补占位实体，position 2000 高处——与位置无关，实体加载即创建）
// 触发：whenEntityIsCreated（每挂载实体创建时触发；signal-family 同图版本已验证此事件）
// 动作：printString('u2-fire')
// 判定（Beyond_Debug_Log）：
//   u2-fire 出现 N 次（N=挂载实体数）= 同图多挂载各实例独立执行 → 灯阵可用 1 图 × 9 挂载
//   1 次 = 仅首个实体执行（后续挂载被忽略/覆盖）
//   0 次 = 未执行（挂载/事件问题）
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({ id: 1073741834 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.printString('u2-fire')
  })

export default graph
