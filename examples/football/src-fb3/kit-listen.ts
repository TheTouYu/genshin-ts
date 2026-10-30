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
    // ———— 玩家角色位置（2026-10-30 定谳：抄奇域资产中心复合节点「玩家，角色，关卡」）————
    // 那份复合节点的内部链（反解自 .gia）正是四步：
    //   ① Get_Player_GUID_by_Player_ID（玩家序号 → 玩家 GUID）  ← 我一直漏掉的就是这一步
    //   ② Query_Entity_by_GUID（GUID → 玩家实体）
    //   ③ Get_All_Character_Entities_of_Specified_Player（玩家实体 → 角色列表）
    //   ④ Get_Corresponding_Value_From_List（列表 + 序号 → 角色实体）→ 读位置
    // 之前失败的原因：用「在场玩家实体列表[0]」当玩家（那是控制器，坐标恒 0，日志 3416 实证），
    // 又试过 int→guid 的类型转换（平台不支持），却没用这个专门的「按玩家序号取 GUID」节点。
    const playerGuid = f.getPlayerGuidByPlayerId(1n)
    const playerE = f.queryEntityByGuid(playerGuid)
    const chars = f.getAllCharacterEntitiesOfSpecifiedPlayer(playerE)
    f.doubleBranch(
      f.greaterThan(f.getListLength(chars), 0n),
      () => {
        const l = f.split3dVector(
          f.getEntityLocationAndRotation(f.getCorrespondingValueFromList(chars, 0n)).location
        )
        f.setCustomVariable(owner, 'fbvx', l.xComponent, false)
        f.setCustomVariable(owner, 'fbvz', l.zComponent, false)
        f.setCustomVariable(owner, 'fbvy', l.yComponent, false)
      },
      () => {}
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
    // 时间同步用（key<0 时才是真值；其它票这些读数无副作用）
    // Lua 每帧把它 OnUpdate(dt) 的真实毫秒发上来（key<0），这里直接折算成步长。
    // 不用 queryGameTimeElapsed：它每秒只数到 2~9 拍（游戏时钟 ≠ 真实秒，日志 3416 实证）。
    const dtCalc = f.division(f.dataTypeConversion(evt.params.state, 'float'), 1000.0)
    f.doubleBranch(
      f.greaterThan(key, 0n),
      () => {
        const seq = f.addition(f.getCustomVariable(owner, 'fb_seq').asType('int'), 1n)
        f.setCustomVariable(owner, 'fb_seq', seq, false)
        f.setCustomVariable(owner, 'fb_key', key, false)
        f.setCustomVariable(owner, 'fb_state', evt.params.state, false)
        // 按键打点带键号（print 只能打字符串，所以按 1~6 分支打不同标记）
        // ⑥ 也会走这里：之前无法把按键与服务端帧对时，只能靠猜
        for (let i = 1; i <= 6; i += 1) {
          f.doubleBranch(
            f.equal(key, BigInt(i)),
            () => {
              print(`fb-k${i}`)
            },
            () => {}
          )
        }
      },
      () => {
      // key < 0 = Lua 时间同步（OnUpdate 累计的真实毫秒）；用它和内核 tick 差算真实步长。
      // queryGameTimeElapsed 不可用：它每秒只数到 2~9 拍（游戏时钟与真实秒不同步，日志 3416 实证）。
      f.doubleBranch(
        f.lessThan(key, 0n),
        () => {
          f.doubleBranch(
            f.logicalAndOperation(f.greaterThan(dtCalc, 0.004), f.lessThan(dtCalc, 0.25)),
            () => {
              f.setCustomVariable(owner, 'fb_dt', dtCalc, false)
            },
            () => {}
          )
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
      }
    )
  })

export default graph
