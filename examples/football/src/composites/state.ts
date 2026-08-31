// 状态机图辅助复合：状态提交（唯一写路径）+ 控球判定（FREE→CARRIED）
// 命名前缀：state_*
// 单一写者铁律：state 只有状态机图（game.ts 及其复合）写入；行为图（dribble-field）只读。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { Signal } from '../resources/signals.js'

const CARRY_DIST2 = 4.0 // 2.0m²（控球判定半径）——2026-08-31 日志 3031：玩家追到 2.4m、球滑到 0.3m/s 仍不接管，尴尬期 ~10s。放宽到 2m：球滑行减速后玩家 2m 内即可重新接管
const CARRY_SPEED = 3.5 // 球速低于该值才可被控球——3031 实证 2.0 仍太严（球 0.3m/s 时人已贴上）；3.5 允许接管仍在滚动的球

// 状态提交（exec）：图变量 state 与球实体自定义变量 state 一次性写入，
// 并在 state 真实变化（prev ≠ next）时发送 state_changed(prev, next) 信号。
// 所有状态迁移必须经此复合（物理 tick 链尾提交对也统一改走本复合），行为图只读。
// 顺序要点：信号发送在双写之前执行——prev 的读发生在 send 节点求值时（写之前），
// 读到的是旧值；若放在写后，prev 会重求值读到新值（重复求值陷阱，同 tmpGoal 前科）。
export const stateCommit = g.defineComposite('state_commit', {
  inputs: { e: { type: 'entity' }, next: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, next }, f) => {
    const prev = f.getNodeGraphVariable('state').asType('int')
    const changed = f.logicalNotOperation(f.equal(prev, next))
    f.doubleBranch(
      changed,
      () => {
        f.sendSignal(Signal.state_changed, prev, next)
      },
      () => {}
    )
    const s1 = f.registerExecNode('set_node_graph_variable', [new str('state'), next, new bool(false)])
    const s2 = f.registerExecNode('set_custom_variable', [e, new str('state'), next, new bool(false)])
    f.connect(s1, 0, s2, 0)
    f.outflow('done', s2, 0)
    return {}
  }
})

// 控球判定（纯数据）：角色 1.2m 内 且 球速低 → 可进入 CARRIED
export const statePossessCheck = g.defineComposite('state_possess_check', {
  inputs: { role: { type: 'entity' }, ballPos: { type: 'vec3' }, ballVel: { type: 'vec3' } },
  outputs: { canCarry: { type: 'bool' } },
  build: ({ role, ballPos, ballVel }, f) => {
    const roleLoc = f.getEntityLocationAndRotation(role).location
    const d = f._3dVectorSubtraction(ballPos, roleLoc)
    const dist2 = f._3dVectorDotProduct(d, d)
    const near = f.lessThan(dist2, CARRY_DIST2)
    const spd = f._3dVectorModuloOperation(ballVel)
    const slow = f.lessThan(spd, CARRY_SPEED)
    return { canCarry: f.logicalAndOperation(near, slow) }
  }
})
