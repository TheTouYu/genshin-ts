// @ts-nocheck
// 实验 2：复合内事件族抽查——whenNodeGraphVariableChanges（2026-08-14 规则闭合）
// 预期：按 Tab → 复合内事件节点监听 → 宿主 set flag → 事件触发 → print
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

const graph = g.server({ id: 1073741827, variables: { flag: false } }).on('whenTabIsSelected', (_e: any, f: any) => {
  f.callComposite(eventComp, {})
  f.setNodeGraphVariable('flag', true, false)
})
export default graph
