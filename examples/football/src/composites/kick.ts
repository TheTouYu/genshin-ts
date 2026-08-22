// 足球踢球复合（exec）：踢球参数表 + 启动 tick 链 + 复位
// 命名前缀：kick_*
// 9 种踢法（DESIGN §5.4）：6 射门 + 2 传球 + 1 复位
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { motionLinearTick, motionInstant } from './motion.js'

// 发球点（罚球点）
const SPAWN_X = -41.5
const SPAWN_Y = 0.247
const SPAWN_Z = 0

// 踢球参数表：tabId → ballVel/ballSpin（exec 复合，内部 multipleBranches 分派 set 图变量）
export const kickSetParams = g.defineComposite('kick_set_params', {
  inputs: { tabId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tabId }, f) => {
    // 9 分支：每分支只 set ballVel/ballSpin 图变量（参数表）
    const done = f.registerExecNode('set_node_graph_variable', [
      new str('ballVel'),
      f.create3dVector(0, 0, 0),
      new bool(false)
    ])
    f.multipleBranches(tabId, {
      1: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-14, 0, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -3, 0), new bool(false)])
      },
      2: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-22, 0, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -5, 0), new bool(false)])
      },
      3: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-14, 0, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -5, 0), new bool(false)])
      },
      4: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-22, 0, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -3, 0), new bool(false)])
      },
      5: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-17, 0.5, 2.5), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, -4, 0), new bool(false)])
      },
      6: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-11, 4.5, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 4), new bool(false)])
      },
      7: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-15, 0, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 2), new bool(false)])
      },
      8: () => {
        f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(-12.5, 4.5, 0), new bool(false)])
        f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 2), new bool(false)])
      },
      default: () => {}
    })
    f.outflow('done', done, 0)
    return {}
  }
})

// 启动 tick 链：set flying + shotCount + 匀速直线 0.2s（exec 复合）
export const kickLaunch = g.defineComposite('kick_launch', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const setFlying = f.registerExecNode('set_node_graph_variable', [
      new str('flying'), new bool(true), new bool(false)
    ])
    const setShot = f.registerExecNode('set_node_graph_variable', [
      new str('shotCount'),
      f.addition(f.getNodeGraphVariable('shotCount').asType('int'), new int(1)),
      new bool(false)
    ])
    f.connect(setFlying, 0, setShot, 0)
    const tick = f.callComposite(motionLinearTick, { e, location: f.getNodeGraphVariable('ballPos').asType('vec3') })
    f.connect(setShot, 0, tick as never, 0)
    f.outflow('done', tick as never, 0)
    return {}
  }
})

// 复位：瞬间移动回发球点 + 清零状态（exec 复合）
export const kickReset = g.defineComposite('kick_reset', {
  inputs: { e: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e }, f) => {
    const spawn = f.create3dVector(SPAWN_X, SPAWN_Y, SPAWN_Z)
    const move = f.callComposite(motionInstant, { e, location: spawn })
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), spawn, new bool(false)])
    f.connect(move as never, 0, setPos, 0)
    const setVel = f.registerExecNode('set_node_graph_variable', [new str('ballVel'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(setPos, 0, setVel, 0)
    const setSpin = f.registerExecNode('set_node_graph_variable', [new str('ballSpin'), f.create3dVector(0, 0, 0), new bool(false)])
    f.connect(setVel, 0, setSpin, 0)
    const setFlying = f.registerExecNode('set_node_graph_variable', [new str('flying'), new bool(false), new bool(false)])
    f.connect(setSpin, 0, setFlying, 0)
    f.outflow('done', setFlying, 0)
    return {}
  }
})
