// 霜华纪「官方结算」服务端节点图（地图 1073741856 / 图 1073741825）
//
// 入口：监听信号 ganyu_settle(win:int)（客户端战斗结束时发送；1=胜利 0=失败）
// 链路：monitor_signal → set_player_settlement_success_status(Victory/Defeat) → settle_stage
//
// 顺序依据：官方文档 docs/ui-tutorial/official-guide-concepts.md:7666
//   「关卡结算状态需要在游玩过程中动态修改，在调用结算关卡节点后，会按各玩家当前的结算状态进行结算」
//   ⇒ 必须先设状态，再调 settlement。
// 玩家实体的取法与 examples/tetris-settle/src/graph.ts 一致。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import { Signal } from './resources/signals.js'

const graph = g
  .server({ id: 1073741825, variables: { graceArmed: false } })
  // 60 秒宽限：游玩超过 1 分钟后退出，按「胜利」结算（官方语义 = 逃跑合法性=是 + 结算状态=胜利）
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    if (f.get('graceArmed')) return
    f.set('graceArmed', true)
    f.printString('ganyu-grace-arm')
    setTimeout(() => {
      const ps = f.getListOfPlayerEntitiesOnTheField()
      if (f.getListLength(ps) > 0n) {
        const p = f.getCorrespondingValueFromList(ps, 0n)
        f.setPlayerEscapeValidity(p, true)
        f.setPlayerSettlementSuccessStatus(p, SettlementStatus.Victory)
        f.printString('ganyu-grace-victory')
      } else {
        f.printString('ganyu-grace-noplayer')
      }
    }, 60000)
  })
  .onSignal(Signal.ganyu_settle, (evt: any, f: any) => {
    f.printString('ganyu-settle-recv')
    const players = f.getListOfPlayerEntitiesOnTheField()
    if (f.getListLength(players) > 0n) {
      const player = f.getCorrespondingValueFromList(players, 0n)
      if (evt.params.win == 1n) {
        f.setPlayerSettlementSuccessStatus(player, SettlementStatus.Victory)
        f.printString('ganyu-settle-victory')
      } else {
        f.setPlayerSettlementSuccessStatus(player, SettlementStatus.Defeat)
        f.printString('ganyu-settle-defeat')
      }
    } else {
      f.printString('ganyu-settle-noplayer')
    }
    f.settleStage()
    f.printString('ganyu-settle-stage')
  })

export default graph
