// @status: 服务端中继 v2（2026-10-31：每拍写玩家位置 / 清掉 tag='T' 与 Lua 时间同步死链）
// fb3/kit-listen.ts —— 20000 服务端图（1073741826，挂算力载体实体 1082130445）
//
// 职责只有两件（服务端在这里**不做任何物理**）：
//   ① kit_state('B') → 把「当前玩家角色位置」写进载体实体变量 fbvx/fbvz/fbvy + fb_pos_tick，
//      供客户端内核下一拍读（客户端的节点白名单里没有「玩家实体」通道，这是唯一可靠的玩家位置来源）。
//      **必须每拍写**：内核用「位置差分 / dt」算玩家速度，隔拍写会让差分在 2v 与 0 之间跳（旧实现
//      因此把 2v>8 当瞬移清零 ⇒ 玩家 ≥4m/s 时带球永不触发，这是「跑起来球不跟脚」的根因）。
//   ② 信号 fb_input（Lua 输入桥）→ 自增 fb_seq + 保真 fb_key；key=0 心跳只打点，不自增序号。
//
// 已删除的历史死链（2026-10-31）：
//   · tag='T' → fb_test_id（内核早已不发 'T'，HUD 测试名永远显示不到）
//   · tag='P' → kit_carrier/kit_has_carrier/kit_votes/kit_dup（无生产者）
//   · key<0 Lua 时间同步 → fb_dt（内核时间改为固定 1/15 s + 球实体 fb_dt，不再读 Lua 帧长）
import { g } from 'genshin-ts/runtime/core'

import { fbWritePlayerPos } from './fb-composites.js'
import { KitSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741826, // 真值：assets:node-graphs create 分配（20000 服务端图）
    name: '_GSTS_kitListen'
  })
  // ———— 实体创建时登记角色实体（用户 2026-10-31 提议：创建时把角色实体写入变量）————
  // 官方语义（events-payload.ts:220-238）：whenEntityIsCreated「所有类型实体均可触发；关卡实体、
  // 角色实体和玩家实体会在**进入关卡时**触发」⇒ 角色一进关就登记，不必等第一拍 'B'。
  // 注：服务端图挂在常驻实体（载体）上；角色是运行时生成的、挂不上图，但事件本身覆盖角色实体。
  .on('whenEntityIsCreated', (_evt: any, f: any) => {
    const owner = f.getSelfEntity()
    const playerGuid = f.getPlayerGuidByPlayerId(1n)
    const playerE = f.queryEntityByGuid(playerGuid)
    const chars = f.getAllCharacterEntitiesOfSpecifiedPlayer(playerE)
    f.doubleBranch(
      f.greaterThan(f.getListLength(chars), 0n),
      () => {
        const c = f.getCorrespondingValueFromList(chars, 0n)
        f.setCustomVariable(owner, 'fb_char_e', c, false)
        f.setCustomVariable(owner, 'fbc_e', c, false)
      },
      () => {}
    )
  })
  .onSignal(KitSignal.kit_state, (evt: any, f: any) => {
    f.doubleBranch(
      f.equal(evt.params.tag, 'B'),
      () => {
        const owner = f.getSelfEntity()
        // ———— 玩家角色实体：开局解析一次，之后缓存（一局内不会变）————
        // 解析链（抄奇域资产中心复合节点「玩家，角色，关卡」）：
        //   getPlayerGuidByPlayerId(1) → queryEntityByGuid → getAllCharacterEntitiesOfSpecifiedPlayer → [0]
        // 失效判据 = queryGuidByEntity(缓存) == 0（角色倒下销毁/换人时自动重解析）
        const cached = f.getCustomVariable(owner, 'fb_char_e').asType('entity')
        f.doubleBranch(
          f.equal(f.queryGuidByEntity(cached), 0n),
          () => {
            const playerGuid = f.getPlayerGuidByPlayerId(1n)
            const playerE = f.queryEntityByGuid(playerGuid)
            const chars = f.getAllCharacterEntitiesOfSpecifiedPlayer(playerE)
            f.doubleBranch(
              f.greaterThan(f.getListLength(chars), 0n),
              () => {
                const c = f.getCorrespondingValueFromList(chars, 0n)
                f.setCustomVariable(owner, 'fb_char_e', c, false)
                // 同步写 fbc_e：内核 §3 首选读它做 0 延时位置查询 ⇒ 不再依赖"点过球的选项卡"
                f.setCustomVariable(owner, 'fbc_e', c, false)
              },
              () => {}
            )
          },
          () => {}
        )
        // ———— 每拍写玩家位置（内核下一拍差分算速度）————
        // 位置写回交给复合（名字即契约）：读角色实体位置 → 写 fbvx/fbvz/fbvy/fb_pos_tick
        f.callComposite(fbWritePlayerPos, { owner, char: cached, tick: evt.params.tick })
        // 整链通判据：日志里出现一次 kit-listener-armed + 至少一条 kit-p1
        f.doubleBranch(
          f.equal(evt.params.tick, 1n),
          () => { print('kit-listener-armed') },
          () => {
            f.doubleBranch(
              f.equal(evt.params.tick, 3n),
              () => { print('kit-p1') },
              () => {}
            )
          }
        )
      },
      () => {}
    )
  })
  // ——— Lua 输入桥（fb-input.lua → fb_input(key, state)）———
  //   key>0：真按键 ⇒ fb_seq 自增 + fb_key 保真（客户端比较序号判新输入，天然去重）
  //   key=0：心跳 ⇒ 只打点（**不得**自增 fb_seq，否则会被当成一次真按键）
  //   key<0：历史时间同步 ⇒ 已废弃，收到也不做任何事
  .onSignal(KitSignal.fb_input, (evt: any, f: any) => {
    const owner = f.getSelfEntity()
    const key = evt.params.key
    f.doubleBranch(
      f.greaterThan(key, 0n),
      () => {
        const seq = f.addition(f.getCustomVariable(owner, 'fb_seq').asType('int'), 1n)
        f.setCustomVariable(owner, 'fb_seq', seq, false)
        f.setCustomVariable(owner, 'fb_key', key, false)
        // 按键打点带键号（print 只打字符串，按 1~6 分支），便于与服务端帧对时
        f.doubleBranch(f.equal(key, 1n), () => { print('fb-k1') }, () => {})
        f.doubleBranch(f.equal(key, 2n), () => { print('fb-k2') }, () => {})
        f.doubleBranch(f.equal(key, 3n), () => { print('fb-k3') }, () => {})
        f.doubleBranch(f.equal(key, 4n), () => { print('fb-k4') }, () => {})
        f.doubleBranch(f.equal(key, 5n), () => { print('fb-k5') }, () => {})
        f.doubleBranch(f.equal(key, 6n), () => { print('fb-k6') }, () => {})
      },
      () => {
        f.doubleBranch(
          f.equal(key, 0n),
          () => {
            // 心跳自检码：state<100 = 成功注册的键数；state>=100 = 100+HUD 控件命中数
            const st = evt.params.state
            f.doubleBranch(
              f.lessThan(st, 100n),
              () => {
                f.doubleBranch(f.greaterThanOrEqualTo(st, 6n), () => { print('fb-hb-keys6') }, () => {
                  f.doubleBranch(f.greaterThanOrEqualTo(st, 1n), () => { print('fb-hb-keys-partial') }, () => { print('fb-hb-keys0') })
                })
              },
              () => {
                const hud = f.subtraction(st, 100n)
                f.doubleBranch(
                  f.greaterThanOrEqualTo(hud, 11n),
                  () => { print('fb-hb-hud11') },
                  () => {
                    f.doubleBranch(
                      f.greaterThanOrEqualTo(hud, 1n),
                      () => { print('fb-hb-hud-partial') },
                      () => { print('fb-hb-hud0') }
                    )
                  }
                )
              }
            )
          },
          () => {}
        )
      }
    )
  })

export default graph
