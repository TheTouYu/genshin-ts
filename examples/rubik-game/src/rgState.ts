// rubik-game 对局状态机（G3，2026-09-09）
//
// 职责：档位开局（100..103=3/5/8/12）→ op11 打乱（turn 副本外部序列）→ PLAYING 计步 →
//       op7 完成判定 → 星级结算（3★ moves≤par 且未用提示 / 2★ moves≤par+3 / 1★ 完成）；
//       自由模式（200）无 par；重开（21）/菜单（22）；关卡变量 rg_* 同步供 HUD 插值。
// 零轮询：全部事件驱动（rubikgame_input / rubikgame_state[2] / rubik3x3_solve[op7]）。
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'
import { RubikSignal, RgSignal } from './signals.js'

const graph = g
  .server({
    id: 1073741835,
    variables: {
      // —— 对局状态（G3-PLAN 变量表）——
      stage: new int(0), // 0 IDLE / 1 SELECTING / 2 SCRAMBLING / 3 PLAYING / 4 SETTLED
      level: new int(0), // 3/5/8/12；0=自由模式
      par: new int(0),
      moves: new int(0),
      hintUsed: new int(0),
      stars: new int(0),
      started: false // whenEntityIsCreated 去重门（重复触发实证）
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.doubleBranch(f.logicalNotOperation(f.getNodeGraphVariable('started').asType('bool')), () => {
      f.setNodeGraphVariable('started', true, false)
      const self = f.getSelfEntity()
      f.setCustomVariable(self, new str('rg_stage'), new int(0), false)
      f.setCustomVariable(self, new str('rg_level'), new int(0), false)
      f.setCustomVariable(self, new str('rg_par'), new int(0), false)
      f.setCustomVariable(self, new str('rg_moves'), new int(0), false)
      f.setCustomVariable(self, new str('rg_hint_used'), new int(0), false)
    }, () => {})
  })
  .onSignal(RgSignal.rubikgame_input, (evt: any, f: any) => {
    const btn = evt.params.btnId
    const self = f.getSelfEntity()
    // 开局档位 100..103 → level = 3/5/8/12，发 op11 打乱
    const isLevel = f.logicalAndOperation(
      f.greaterThan(btn, 99n),
      f.logicalNotOperation(f.greaterThan(btn, 103n))
    )
    f.doubleBranch(isLevel, () => {
      const lvl = f.subtraction(btn, 97n)
      f.setNodeGraphVariable('level', lvl, false)
      f.setNodeGraphVariable('par', lvl, false)
      f.setNodeGraphVariable('moves', new int(0), false)
      f.setNodeGraphVariable('hintUsed', new int(0), false)
      f.setNodeGraphVariable('stage', new int(2), false)
      f.setCustomVariable(self, new str('rg_level'), lvl, false)
      f.setCustomVariable(self, new str('rg_par'), lvl, false)
      f.setCustomVariable(self, new str('rg_moves'), new int(0), false)
      f.setCustomVariable(self, new str('rg_hint_used'), new int(0), false)
      f.setCustomVariable(self, new str('rg_stage'), new int(2), false)
      f.sendSignal(RgSignal.rubikgame_state, 1n, 2n)
      f.sendSignal(RubikSignal.rubik3x3_solve, 11n, lvl)
    }, () => {
      // 自由模式 200：不打乱，直接 PLAYING（par=0 无星级）
      f.doubleBranch(f.equal(btn, 200n), () => {
        f.setNodeGraphVariable('level', new int(0), false)
        f.setNodeGraphVariable('par', new int(0), false)
        f.setNodeGraphVariable('moves', new int(0), false)
        f.setNodeGraphVariable('hintUsed', new int(0), false)
        f.setNodeGraphVariable('stage', new int(3), false)
        f.setCustomVariable(self, new str('rg_level'), new int(0), false)
        f.setCustomVariable(self, new str('rg_par'), new int(0), false)
        f.setCustomVariable(self, new str('rg_moves'), new int(0), false)
        f.setCustomVariable(self, new str('rg_stage'), new int(3), false)
        f.sendSignal(RgSignal.rubikgame_state, 1n, 3n)
      }, () => {
        // 手动转动 1..12：仅 PLAYING 放行（SCRAMBLING 期间门控）
        f.doubleBranch(f.equal(f.getNodeGraphVariable('stage').asType('int'), 3n), () => {
          const isMove = f.logicalAndOperation(
            f.greaterThan(btn, 0n),
            f.logicalNotOperation(f.greaterThan(btn, 12n))
          )
          f.doubleBranch(isMove, () => {
            f.sendSignal(RubikSignal.rubik3x3_solve, 3n, btn)
            const mv = f.addition(f.getNodeGraphVariable('moves').asType('int'), 1n)
            f.setNodeGraphVariable('moves', mv, false)
            f.setCustomVariable(self, new str('rg_moves'), mv, false)
            f.sendSignal(RgSignal.rubikgame_state, 3n, mv)
          }, () => {
            // 重开 21：有档位则重打乱
            f.doubleBranch(f.equal(btn, 21n), () => {
              f.doubleBranch(f.greaterThan(f.getNodeGraphVariable('level').asType('int'), 0n), () => {
                f.setNodeGraphVariable('moves', new int(0), false)
                f.setNodeGraphVariable('hintUsed', new int(0), false)
                f.setNodeGraphVariable('stage', new int(2), false)
                f.setCustomVariable(self, new str('rg_moves'), new int(0), false)
                f.setCustomVariable(self, new str('rg_stage'), new int(2), false)
                f.sendSignal(RgSignal.rubikgame_state, 1n, 2n)
                f.sendSignal(RubikSignal.rubik3x3_solve, 11n, f.getNodeGraphVariable('level').asType('int'))
              }, () => {})
            }, () => {
              // 菜单 22：回选关
              f.doubleBranch(f.equal(btn, 22n), () => {
                f.setNodeGraphVariable('stage', new int(1), false)
                f.setCustomVariable(self, new str('rg_stage'), new int(1), false)
                f.sendSignal(RgSignal.rubikgame_state, 1n, 1n)
              }, () => {})
            })
          })
        }, () => {})
      })
    })
  })
  .onSignal(RgSignal.rubikgame_state, (evt: any, f: any) => {
    // 打乱完成（flowAfterTurn 的 rg_scr_notify 门广播 ev=2）→ PLAYING
    f.doubleBranch(f.equal(evt.params.ev, 2n), () => {
      f.doubleBranch(f.equal(f.getNodeGraphVariable('stage').asType('int'), 2n), () => {
        f.setNodeGraphVariable('stage', new int(3), false)
        f.setCustomVariable(f.getSelfEntity(), new str('rg_stage'), new int(3), false)
        f.sendSignal(RgSignal.rubikgame_state, 1n, 3n)
      }, () => {})
    }, () => {})
  })
  .onSignal(RubikSignal.rubik3x3_solve, (evt: any, f: any) => {
    // op7=最终完成（solver 语义）→ 星级结算
    f.doubleBranch(f.equal(evt.params.op, 7n), () => {
      f.doubleBranch(f.equal(f.getNodeGraphVariable('stage').asType('int'), 3n), () => {
        const mv = f.getNodeGraphVariable('moves').asType('int')
        const par = f.getNodeGraphVariable('par').asType('int')
        const par3 = f.addition(par, 3n)
        const withinPar = f.logicalNotOperation(f.greaterThan(mv, par))
        const noHint = f.equal(f.getNodeGraphVariable('hintUsed').asType('int'), 0n)
        const three = f.logicalAndOperation(withinPar, noHint)
        const self = f.getSelfEntity()
        f.doubleBranch(three, () => {
          f.setNodeGraphVariable('stars', new int(3), false)
          f.setNodeGraphVariable('stage', new int(4), false)
          f.setCustomVariable(self, new str('rg_stage'), new int(4), false)
          f.sendSignal(RgSignal.rubikgame_state, 4n, 3n)
        }, () => {
          const two = f.logicalNotOperation(f.greaterThan(mv, par3))
          f.doubleBranch(two, () => {
            f.setNodeGraphVariable('stars', new int(2), false)
            f.setNodeGraphVariable('stage', new int(4), false)
            f.setCustomVariable(self, new str('rg_stage'), new int(4), false)
            f.sendSignal(RgSignal.rubikgame_state, 4n, 2n)
          }, () => {
            f.setNodeGraphVariable('stars', new int(1), false)
            f.setNodeGraphVariable('stage', new int(4), false)
            f.setCustomVariable(self, new str('rg_stage'), new int(4), false)
            f.sendSignal(RgSignal.rubikgame_state, 4n, 1n)
          })
        })
      }, () => {})
    }, () => {})
  })

export default graph
