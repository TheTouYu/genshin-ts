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
        // ——— D5 探针（2026-10-24，判「每个客户端各跑一份」还是「单客户端权威」）———
        // 服务端按 tick 单调去重：同一 tick 再来一条 = 另一个客户端也在算（重复票）
        const votes = f.addition(f.getCustomVariable(owner, 'kit_votes').asType('int'), 1n)
        f.setCustomVariable(owner, 'kit_votes', votes, false)
        const lastTick = f.getCustomVariable(owner, 'kit_last_tick').asType('int')
        f.doubleBranch(
          f.equal(tick, lastTick),
          () => {
            const dup = f.addition(f.getCustomVariable(owner, 'kit_dup').asType('int'), 1n)
            f.setCustomVariable(owner, 'kit_dup', dup, false)
            // 每次重复票打一行（计数在日志里数行=重复票数；运行时变量退出即回落，靠日志判读）
            print('kit-dup')
          },
          () => {
            f.setCustomVariable(owner, 'kit_last_tick', tick, false)
          }
        )
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
  // ——— Lua 输入桥（2026-10-27）：客户端 Lua 脚本 fb-input.lua → fb_input(key,state) ———
  // 职责只有一件：把「真按键」变成客户端 20008 图能读到的**实体自定义变量**（服务端写、客户端读）。
  //   fb_seq 自增（客户端比较序号判新输入，天然去重、不怕丢中间票）
  //   fb_key / fb_state 保真最后一条票的内容
  // ⚠ 心跳票（key=0，脚本 OnStart 发一次证明整链通）**不得**自增 fb_seq，否则客户端会当成一次真按键（假踢球）。
  .onSignal(KitSignal.fb_input, (evt: any, f: any) => {
    const owner = f.getSelfEntity()
    const key = evt.params.key
    f.doubleBranch(
      f.greaterThan(key, 0n),
      () => {
        const seq = f.addition(f.getCustomVariable(owner, 'fb_seq').asType('int'), 1n)
        f.setCustomVariable(owner, 'fb_seq', seq, false)
        f.setCustomVariable(owner, 'fb_key', key, false)
        f.setCustomVariable(owner, 'fb_state', evt.params.state, false)
        print('fb-key')
      },
      () => {
        print('fb-heartbeat')
      }
    )
  })

export default graph
