// rubik-game 提示图（G3，2026-09-09）
//
// 职责：金色提示按钮（btnId=20）→ PLAYING 门控（rg_stage==3）→ rg_hint_used=1（星级判定：用提示最高 2★）
//       → rg_hint_mode=1（solver 实体 6230 共享旗标，三张 plan 图 seq-ready 门读取）→ 发 op12
//       （donor 自动还原入口零改动起算；plan 门：solve_len 截断 1 + phase=0 + 旗标复位 →
//        solver 恰好执行一步正确转动，播完 op5 因 phase=0 不再续算）。
//       兜底：rgState op7 分支清 rg_hint_mode（旗标悬挂防护）。
// 挂载：实体 1077936260（与 rgState 同锚点；rg_* 自定义变量共享）。
// 前置：6230 需预注册自定义变量 rg_hint_mode:int=0（注入步 CLI 落地）。
import { g } from 'genshin-ts/runtime/core'
import { int, str } from 'genshin-ts/runtime/value'
import { RubikSignal, RgSignal } from './signals.js'

const graph = g
  .server({ id: 1073741836, variables: {} })
  .onSignal(RgSignal.rubikgame_input, (evt: any, f: any) => {
    const btn = evt.params.btnId
    f.doubleBranch(f.equal(btn, 20n), () => {
      const self = f.getSelfEntity()
      const stage = f.getCustomVariable(self, new str('rg_stage')).asType('int')
      f.doubleBranch(f.equal(stage, 3n), () => {
        f.setCustomVariable(self, new str('rg_hint_used'), new int(1), false)
        f.setCustomVariable(entity(1077936230n), new str('rg_hint_mode'), new int(1), false)
        f.sendSignal(RubikSignal.rubik3x3_solve, 12n, 0n)
      }, () => {})
    }, () => {})
  })

export default graph
