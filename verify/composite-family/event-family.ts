// @ts-nocheck
// 实验 2：复合内 whenNodeGraphVariableChanges 事件（2026-08-14 规则闭合 v2）
// 触发时机：实体创建时（whenEntityIsCreated）设置图变量 flag → 复合内事件触发 → print
// 判定：日志出现 evt-var-change
import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const eventComp = g.defineComposite('verify_event_comp', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenNodeGraphVariableChanges', (_evt: any, ef: any) => {
      ef.registerExecNode('print_string', [new str('evt-var-change')])
    })
    return {}
  }
})

const graph = g.server({ id: 1073741826, variables: { flag: false } }).on('whenEntityIsCreated', (_e: any, f: any) => {
  f.callComposite(eventComp, {})
  f.setNodeGraphVariable('flag', true, false)
})
export default graph
