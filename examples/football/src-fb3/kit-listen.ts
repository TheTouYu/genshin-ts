// @status: 新线（v3 客户端计算最小链路，2026-10-24）
// fb3/kit-listen.ts —— 服务端监听图（20000）：收 kit_state，离线判读用
//
// 职责最小：**只打印事件入口**（打印纪律：高频路径零 print，这里只留首条 + 每 60 拍一条）。
// 挂载：`gsts assets:mounts attach <graphId> --graph <本图> --entity --write`
// 判据（行为层）：日志里出现 `kit-listener-armed` 一次 + `kit-p1` 序列且 tick 递增
//   ⇒ 造物→20008→信号→服务端 整链通。
import { g } from 'genshin-ts/runtime/core'

import { KitSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741826, // 真值：assets:node-graphs create 分配（20000 服务端图）
    name: '_GSTS_kitListen'
  })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    const tick = evt.params.tick
    const isCommit = f.equal(evt.params.tag, 'P')
    f.doubleBranch(
      isCommit,
      () => {
        // 载体策略 v1：每收到一条合法票就把「场上玩家[0]」登记到造物实体变量 kit_carrier。
        // 为什么放在这里（而不是独立定时器图）：20000 图没有 start 事件，arm 定时器需要额外事件源；
        // 而票本来就每拍来一次（15/s），天然是刷新点。客户端下一拍读到的就是这个值。
        // v2（最近玩家 + 滞回）只需替换这里的 carrier 计算。
        // ⚠️ 服务端版参数序是 (list, index)，与客户端相反（fb-input.ts:34 口径）
        const owner = f.getSelfEntity()
        const carrier = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
        f.setCustomVariable(owner, 'kit_carrier', carrier, false)
        f.setCustomVariable(owner, 'kit_has_carrier', 1n, false)
        // 只打前 3 拍（15Hz 下别刷日志）；判定「整链通」看这 3 条即可
        f.doubleBranch(
          f.lessThanOrEqualTo(tick, 3n),
          () => {
            f.doubleBranch(
              f.equal(tick, 1n),
              () => {
                print('kit-listener-armed')
              },
              () => {
                print('kit-p1')
              }
            )
          },
          () => {}
        )
      },
      () => {}
    )
  })

export default graph
