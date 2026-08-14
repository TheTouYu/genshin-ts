// @ts-nocheck
// 实验 2：复合内自定义变量变化事件（2026-08-14 规则闭合 v4）
// 规则（轮 12f 实证 + 2695 独立复现）：复合内 whenNodeGraphVariableChanges 不触发；
// 仅 whenCustomVariableChanges（触发事件=是）触发。混合复合模式（参考 tab_lock）。
// 宿主：whenEntityIsCreated → 调用复合（实例化事件节点）→ setCustomVariable(触发=是) → 事件触发
// 判定：日志出现 evt-init（调用流）+ evt-var-change（事件触发）
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'

const eventComp = g.defineComposite('verify_event_comp', {
  inputs: {},
  outputs: {},
  inflows: ['init'],
  outflows: ['done'],
  build: (_a, f) => {
    // 事件节点独立监听（实体自定义变量变化，触发事件=是）
    f.on('whenCustomVariableChanges', (_evt: any, ef: any) => {
      ef.registerExecNode('print_string', [new str('evt-var-change')])
    })
    // 调用流：entry → print(init) → done（实例化入口）
    const gate = f.node('print_string', [new str('evt-init')])
    f.link(f.entry(), 0, gate, 0)
    f.outflow('done', gate, 0)
    return {}
  }
})

const graph = g.server({ id: 1073741826 }).on('whenEntityIsCreated', (_e: any, f: any) => {
  f.callComposite(eventComp, {})
  f.setCustomVariable(f.getSelfEntity(), new str('verify_flag'), new int(1), true)
})
export default graph
