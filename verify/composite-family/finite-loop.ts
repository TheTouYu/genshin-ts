// @ts-nocheck
// 实验 1：复合内 finite_loop 执行验证（2026-08-14 规则闭合）
// 预期：按 Tab → 复合内 0..7 循环执行 8 次 → 日志 8 个 print
// 判定：日志出现 loop-i=0..7 共 8 条
import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const loopComp = g.defineComposite('verify_loop_comp', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    f.finiteLoop(0, 7, (i, _brk) => {
      f.registerExecNode('print_string', [new str('loop-i=' + i.toString()) as never])
    })
    return {}
  }
})

const graph = g.server({ id: 1073741826 }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(loopComp, {})
})
export default graph
