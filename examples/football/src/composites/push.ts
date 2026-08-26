// 足球弹球执行复合（exec）：推球 = 球被"踢"到前方目标点（0.2s 精确滑行 + 到位停）
// 真实带球手感：命中触发（球碰玩家）→ 推球到前方 1.8m → 球停 → 玩家追上再碰 → 再推
import { g } from 'genshin-ts/runtime/core'
import { bool, int, str } from 'genshin-ts/runtime/value'
import { motionToPoint } from './motion.js'

// ================================================================
// 推球执行：图变量 ballPos=target + 运动器 0.2s 滑到 target + 球速清零 + 状态归静止
// 到位后 stop 事件 → physTick(state=0) 链自然停；下一次命中事件再推，不需要心跳
// ================================================================
export const pushApply = g.defineComposite('push_apply', {
  inputs: { e: { type: 'entity' }, target: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, target }, f) => {
    const setPos = f.registerExecNode('set_node_graph_variable', [new str('ballPos'), target, new bool(false)])
    const mv = f.callComposite(motionToPoint, { e, target })
    f.connect(setPos, 0, mv as never, 0)
    const setVel = f.registerExecNode('set_node_graph_variable', [
      new str('ballVel'),
      f.create3dVector(0, 0, 0),
      new bool(false)
    ])
    f.connect(mv as never, 0, setVel, 0)
    const setState = f.registerExecNode('set_node_graph_variable', [new str('state'), new int(0), new bool(false)])
    f.connect(setVel, 0, setState, 0)
    f.outflow('done', setState, 0)
    return {}
  }
})