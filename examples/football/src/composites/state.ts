// 状态机图辅助复合：状态提交（唯一写路径）+ 控球判定（FREE→CARRIED）
// 命名前缀：state_*
// 单一写者铁律：state 只有状态机图（game.ts 及其复合）写入；行为图（dribble-field）只读。
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'

const CARRY_DIST2 = 1.44 // 1.2m²（控球判定半径）
const CARRY_SPEED = 0.5 // 球速低于该值才可被控球（静止/刚停）

// 状态提交（exec）：图变量 state 与球实体自定义变量 state 一次性写入。
// 所有状态迁移必须经此复合（或物理 tick 复合内的同名提交对），行为图只读。
export const stateCommit = g.defineComposite('state_commit', {
  inputs: { e: { type: 'entity' }, next: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, next }, f) => {
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
