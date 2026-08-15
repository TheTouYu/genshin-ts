// @ts-nocheck
// 验证 B（2026-08-15）：复合内事件节点游戏层触发（事件族游戏层第一证）
// 复合内 whenEntityIsCreated（实验组）+ whenCustomVariableChanges（对照组，机制已证）
// 宿主 whenEntityIsCreated → callComposite（实例化复合内事件节点）+ setCustomVariable(触发=是)
// 判定：evt-var2 必须出现（对照，证明复合内事件机制在本次注入后工作）；
//       evt-created 出现 = 复合内事件捕获实体创建（游戏层证据）；不出现则记录"未捕获待另法"
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'

const evtComp = g.defineComposite('verify_evt_internal', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenEntityIsCreated', (_evt: any, ef: any) => {
      ef.registerExecNode('print_string', [new str('evt-created')])
    })
    f.on('whenCustomVariableChanges', (_evt: any, ef: any) => {
      ef.registerExecNode('print_string', [new str('evt-var2')])
    })
    return {}
  }
})

const graph = g
  .server({ id: 1073741831 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(evtComp, {})
    f.setCustomVariable(f.getSelfEntity(), new str('evt_flag2'), new int(1), true)
  })
export default graph

