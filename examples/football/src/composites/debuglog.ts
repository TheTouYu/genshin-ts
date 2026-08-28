// 足球调试日志复合（无 print，只写图变量，日志帧可被 grep 固定 tag 命中）
// 用法：f.callComposite(dbgTag, { tag: new str('DBG_XXX'), val: f.dataTypeConversion(value, 'str') })
// tag/val 分别写 dbgTag/dbgVal 两个图变量，日志里搜 DBG_XXX 即可定位
import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

// 低层：写一对 tag/value
export const dbgTag = g.defineComposite('dbg_tag', {
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

// 高层：一次拍下当前物理状态和实体位姿（排查运动器/旋转方向用）
