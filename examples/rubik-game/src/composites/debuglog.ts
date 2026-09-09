// rubik-3x3 求解器调试日志复合（无 print，只写图变量，日志帧可 grep 固定 tag 命中）
// 用法：f.callComposite(dbgTag, { tag: new str('DBG_XXX'), val: f.dataTypeConversion(value, 'str') })
// tag/val 分别写 dbgTag/dbgVal 两个图变量，日志里搜 DBG_XXX 即可定位。
// 显式 ID 1610700060，避免与本项目其他复合 ID 顺序漂移。
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

export const dbgTag = g.defineComposite('dbg_tag', {
  id: 1610700060,
  inputs: { tag: { type: 'str' }, val: { type: 'str' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tag, val }, f) => {
    const t = f.registerExecNode('set_node_graph_variable', [new str('dbgTag'), tag, new bool(false)])
    const v = f.registerExecNode('set_node_graph_variable', [new str('dbgVal'), val, new bool(false)])
    f.connect(t, 0, v, 0)
    f.outflow('done', v, 0)
    return {}
  }
})
