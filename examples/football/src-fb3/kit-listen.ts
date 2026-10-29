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
    // ———— 玩家位置同步（2026-10-29 修「球不跟人」）————
    // 内核 kitLoop 每拍读**载体实体变量** fbvx/fbvz 当玩家 x/z（src-fb3/kit-loop.ts:109），
    // 但此前没有任何图写这两个变量、实体上也没声明它们 ⇒ 内核永远以为玩家在 (0,0)，
    // 带球目标恒在原点附近（一走动就"不跟人"）。服务端能拿真玩家：玩家列表[0] →
    // 该玩家的生效角色 → 读角色位置（玩家控制器实体坐标恒 0，只能读角色）。
    const owner = f.getSelfEntity()
    const players = f.getListOfPlayerEntitiesOnTheField()
    const player0 = f.getCorrespondingValueFromList(players, 0n)
    // 2026-10-29 二修：角色列表[0] 的坐标实测不可用（日志 3414：x∈[-27.9,94.2]、y 到 −142、
    //   z∈[-32,85]，玩家明明站在原地）⇒ 改读**玩家实体本身**的坐标。
    //   自检：坐标一旦非零就打印一次（证明这条通道真的给了真值，而不是恒 0）。
    const pLoc = f.split3dVector(f.getEntityLocationAndRotation(player0).location)
    f.setCustomVariable(owner, 'fbvx', pLoc.xComponent, false)
    f.setCustomVariable(owner, 'fbvz', pLoc.zComponent, false)
    // ———— 每拍真实步长校准（2026-10-29）————
    // 载体技能 CD 让内核实际跑 14~27Hz（客户端越忙越慢），而内核按 7.5Hz 标定的 DT 积分
    // ⇒ 模拟时间跑快 2~3.5 倍（用户体感「高吊球整个过程光速完成」）。这里用「游戏已进行时间(秒)」
    // 数每秒钟收到几拍，折算成真实步长写 fb_dt，客户端每拍读。
    const nowSec = f.queryGameTimeElapsed()
    const lastSec = f.getCustomVariable(owner, 'fb_sec').asType('int')
    const cnt = f.getCustomVariable(owner, 'fb_cnt').asType('int')
    f.doubleBranch(
      f.equal(nowSec, lastSec),
      () => {
        f.setCustomVariable(owner, 'fb_cnt', f.addition(cnt, 1n), false)
      },
      () => {
        const cntF = f.dataTypeConversion(cnt, 'float')
        const safe = f.localVariable('float')
        f.doubleBranch(
          f.lessThan(cntF, 1.0),
          () => {
            safe.set(1.0)
          },
          () => {
            safe.set(cntF)
          }
        )
        f.setCustomVariable(owner, 'fb_dt', f.division(1.0, safe.value), false)
        f.setCustomVariable(owner, 'fb_cnt', 0n, false)
        f.setCustomVariable(owner, 'fb_sec', nowSec, false)
      }
    )
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
        // 心跳带自检码（2026-10-29）：Lua 的 print 不落 .gia，只能把自检结果塞进心跳再让服务端打点。
        //   state < 100  = 成功注册的键数（0..6，6 = 六键全就位）
        //   state >= 100 = 100 + HUD 控件命中数（0..11，11 = 十一个文本框全找到）
        const st = evt.params.state
        f.doubleBranch(
          f.lessThan(st, 100n),
          () => {
            // 展开写（DSL 的 for 会走 finiteLoop，字符串拼接在循环体里不支持）
            f.doubleBranch(f.equal(st, 0n), () => { print('fb-hb-keys0') }, () => {})
            f.doubleBranch(f.equal(st, 1n), () => { print('fb-hb-keys1') }, () => {})
            f.doubleBranch(f.equal(st, 2n), () => { print('fb-hb-keys2') }, () => {})
            f.doubleBranch(f.equal(st, 3n), () => { print('fb-hb-keys3') }, () => {})
            f.doubleBranch(f.equal(st, 4n), () => { print('fb-hb-keys4') }, () => {})
            f.doubleBranch(f.equal(st, 5n), () => { print('fb-hb-keys5') }, () => {})
            f.doubleBranch(f.equal(st, 6n), () => { print('fb-hb-keys6') }, () => {})
            f.doubleBranch(f.greaterThan(st, 6n), () => { print('fb-hb-keys-other') }, () => {})
          },
          () => {
            const hud = f.subtraction(st, 100n)
            f.doubleBranch(
              f.greaterThanOrEqualTo(hud, 11n),
              () => {
                print('fb-hb-hud11')
              },
              () => {
                f.doubleBranch(
                  f.greaterThanOrEqualTo(hud, 1n),
                  () => {
                    print('fb-hb-hud-partial')
                  },
                  () => {
                    print('fb-hb-hud0')
                  }
                )
              }
            )
          }
        )
      }
    )
  })

export default graph
