// @ts-nocheck
// 实验 2：复合内 whenNodeGraphVariableChanges 事件（2026-08-14 规则闭合 v4）
// 混合复合模式（参考 tab_lock）：调用流 = entry → print(init) → outflow done（实例化事件节点）；
// 事件节点独立监听 whenNodeGraphVariableChanges → print(evt-var-change)。
// 宿主：whenEntityIsCreated → 调用复合（实例化）→ set flag（触发事件）。
// 判定：日志出现 evt-init（调用流通）+ evt-var-change（事件触发）
import { g } from 'genshin-ts/runtime/core'
import { str } from 'genshin-ts/runtime/value'

const eventComp = g.defineComposite('verify_event_comp', {
  inputs: {},
  outputs: {},
  inflows: ['init'],
  outflows: ['done'],
  build: (_a, f) => {
    // 事件节点独立监听（不参与调用流）
    f.on('whenNodeGraphVariableChanges', (_evt: any, ef: any) => {
      ef.registerExecNode('print_string', [new str('evt-var-change')])
    })
    // 调用流：entry → print(init) → done（实例化入口）
    const gate = f.node('print_string', [new str('evt-init')])
    f.link(f.entry(), 0, gate, 0)
    f.outflow('done', gate, 0)
    return {}
  }
})

const graph = g.server({ id: 1073741826, variables: { flag: false } }).on('whenEntityIsCreated', (_e: any, f: any) => {
  f.callComposite(eventComp, {})
  f.setNodeGraphVariable('flag', true, false)
})
export default graph
