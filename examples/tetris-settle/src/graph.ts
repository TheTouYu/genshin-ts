// 俄罗斯方块「真结算」服务端节点图（地图 hl 1073741834，图 id 1082130480）
//
// 入口：监听信号 tetris_settle（空参，已在信号管理器注册）
// 链路：monitor_signal → set_player_settlement_success_status(Victory) → settle_stage
//
// 顺序依据（不是随手写的）：官方文档 docs/ui-tutorial/official-guide-concepts.md:7666
//   「关卡结算状态需要在游玩过程中动态修改，在调用结算关卡节点后，会按各玩家当前的结算状态进行结算」
//   ⇒ 必须先设状态，再调结算关卡；反过来状态不会被读到。
// 玩家实体的取法与 examples/lantern/src/game.ts:88-93、examples/yunjie/src/game.ts:56-66 一致
//   （getListOfPlayerEntitiesOnTheField + getCorrespondingValueFromList，避开 PlayerEntity 品牌类型不可构造的问题）
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import { Signal } from './resources/signals.js'

const graph = g
  .server({ id: 1082130480 })
  .onSignal(Signal.tetris_settle, (_evt: any, f: any) => {
    // 入口打点：真机日志里看到这一行才说明图真的执行了
    f.printString('settle-recv')
    const players = f.getListOfPlayerEntitiesOnTheField()
    if (f.getListLength(players) > 0n) {
      f.setPlayerSettlementSuccessStatus(
        f.getCorrespondingValueFromList(players, 0n),
        SettlementStatus.Victory
      )
      f.printString('settle-victory')
    } else {
      f.printString('settle-noplayer')
    }
    f.settleStage()
    f.printString('settle-stage')
  })

export default graph
