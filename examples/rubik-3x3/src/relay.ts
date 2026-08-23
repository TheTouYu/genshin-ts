// 副控制器转发图：B 的 7 个选项（本地 tabId 1..7）映射到全局 10..16 后发信号给主图
import { g } from 'genshin-ts/runtime/core'
import { RubikSignal } from './signals.js'
import { flowDoMove } from './composites/flow.js'

const graph = g
  .server({ id: 1073741831 })
  .on('whenTabIsSelected', (evt: any, f: any) => {
    // 本地 1..6 → 全局 10..15；本地 7（手动检查）→ 全局 16
    f.doubleBranch(
      f.equal(evt.tabId, 7n),
      () => {
        f.sendSignal(RubikSignal.rubik3x3_tab, 16n)
      },
      () => {
        f.sendSignal(RubikSignal.rubik3x3_tab, f.addition(evt.tabId, 9n))
      }
    )
    // 保留 flow_do_move 的 full def 引用（永不执行），防止多图注入时被 stub 覆盖
    f.doubleBranch(f.equal(1n, 0n), () => {
      f.callComposite(flowDoMove, { moveId: 0n, target: evt.eventSourceEntity })
    }, () => {})
  })

export default graph
