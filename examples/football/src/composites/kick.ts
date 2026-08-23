// 足球施力复合（exec）：选项施力 + 复位
// 命名前缀：kick_*
// 8 个施力选项（tabId 1-8，每选项给球施加不同方向/力度/旋转的力）+ 复位（tabId 9）
// 球持续运动直到动能耗尽（速度足够小）才进入静止状态
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { motionInstant } from './motion.js'
import { physApplyMotion } from './physics.js'

// 场地中间（复位点）
const CENTER_X = 0
const CENTER_Y = 0.25 // = BALL_R
const CENTER_Z = 0

// ================================================================
// 施力参数表：tabId → ballVel/ballSpin（exec 复合，内部 multipleBranches 分派）
// 覆盖：重力（高吊）、空气阻力（重射高速）、马格努斯（内/外旋弧线）、
//       弹力（落地反弹）、摩擦（滚滑）、旋转（上旋/下旋/内旋）
// ================================================================
export const kickApplyForce = g.defineComposite('kick_apply_force', {
  inputs: { tabId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tabId }, f) => {
    // 默认值节点（entry 链首，multipleBranches 之前），分支覆盖
    const done = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
    f.multipleBranches(tabId, {
      1: () => {
        // 轻射：-X 小力 + 内旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-14, 2, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -6, 0), new bool(false)])
      },
      2: () => {
        // 重射：-X 大力 + 内旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-24, 3, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -8, 0), new bool(false)])
      },
      3: () => {
        // 高吊：斜上大力 + 上旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-15, 9, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 6), new bool(false)])
      },
      4: () => {
        // 内旋弧（香蕉球）：-X + 内旋强 + z 正偏
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-16, 2, 2), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -9, 0), new bool(false)])
      },
      5: () => {
        // 外旋弧：-X + 外旋强 + z 负偏
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-16, 2, -2), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 9, 0), new bool(false)])
      },
      6: () => {
        // 上旋低平：快速落地前滚（测试滚滑摩擦）
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-18, 0.5, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 10), new bool(false)])
      },
      7: () => {
        // 下旋（回旋）：落地回弹减速
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-14, 2, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, -8), new bool(false)])
      },
      8: () => {
        // 横传：向 +Z 方向 + 上旋
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(2, 3, 12), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 6), new bool(false)])
      },
      default: () => {}
    })
    f.outflow('done', done, 0)
    return {}
  }
})

// ================================================================
// 施力启动：set state=空中 + scored=false + 激活运动器（exec 复合）
// ================================================================
export const kickLaunch = g.defineComposite('kick_launch', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    // 同步逻辑位置到球实体视觉位置（球从实际所在位置施力）
    const loc = f.getEntityLocationAndRotation(e).location
    const vel = f.getNodeGraphVariable('ballVel').asType('vec3')
    const spin = f.getNodeGraphVariable('ballSpin').asType('vec3')
    // 第一个目标点：当前位置 + 初速·0.2（预计算第一步，定点移动精确到达）
    const target0 = f._3dVectorAddition(loc, f._3dVectorZoom(vel, 0.2))
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), loc, new bool(false)])
    const setState = f.registerExecNode('set_node_graph_variable', [
      new str('state'), new int(1), new bool(false)
    ])
    f.connect(setPos, 0, setState, 0)
    const setScored = f.registerExecNode('set_node_graph_variable', [
      new str('scored'), new bool(false), new bool(false)
    ])
    f.connect(setState, 0, setScored, 0)
    const ap = f.callComposite(physApplyMotion, { e, pos: target0, spin })
    f.connect(setScored, 0, ap as never, 0)
    f.outflow('done', ap as never, 0)
    return {}
  }
})

// ================================================================
// 复位：瞬移回场地中间 + 清零状态（exec 复合）
// ================================================================
export const kickReset = g.defineComposite('kick_reset', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const spawn = f.create3dVector(CENTER_X, CENTER_Y, CENTER_Z)
    const move = f.callComposite(motionInstant, { e, location: spawn })
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), spawn, new bool(false)])
    f.connect(move as never, 0, setPos, 0)
    const setVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(setPos, 0, setVel, 0)
    const setSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(setVel, 0, setSpin, 0)
    const setState = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(0), new bool(false)])
    f.connect(setSpin, 0, setState, 0)
    const setScored = f.registerExecNode('set_node_graph_variable', [new str('scored'), new bool(false), new bool(false)])
    f.connect(setState, 0, setScored, 0)
    f.outflow('done', setScored, 0)
    return {}
  }
})