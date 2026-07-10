import { g } from 'genshin-ts/runtime/core'
import {
  bool as boolValue,
  float as floatValue,
  str as strValue,
  type value
} from 'genshin-ts/runtime/value'

import { PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'
import {
  calculateForces,
  calculateRollingAngularVelocity,
  sequentialExecution,
  updateAngularVelocity,
  updateVelocity
} from './update-vw-stubs.js'

export const updateVelocityAndAngularVelocity = g.defineComposite('更新v、w', {
  inputs: {
    接触地面: { type: 'bool', pinIndex: 1422 },
    更新间隔: { type: 'float', pinIndex: 543 }
  },
  outputs: {
    F_aero: { type: 'vec3', pinIndex: 1798 },
    F摩擦力: { type: 'vec3', pinIndex: 1799 }
  },
  inflows: [{ name: '', pinIndex: 1423 }],
  outflows: [{ name: '是', pinIndex: 485 }],
  build(args, f) {
    const angularVelocity = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.angularVelocity)
      .asType('vec3')
    const velocity = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.velocity).asType('vec3')
    const extraPressure = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.extraPressure)
      .asType('float')

    const forceParts = f.callComposite(calculateForces, {
      w: angularVelocity,
      v: velocity,
      额外受力: extraPressure
    })
    const rollingAngularVelocity = f.callComposite(calculateRollingAngularVelocity, {})
    const nextVelocity = f.callComposite(updateVelocity, {
      更新间隔: args.更新间隔
    })
    const nextAngularVelocity = f.callComposite(updateAngularVelocity, {
      更新间隔: args.更新间隔
    })

    const contactBranch = f.node('double_branch', [args.接触地面])
    const rollingBranch = f.node('double_branch', [forceParts.滚动 as value])

    const setRollingForce = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.force),
      forceParts['F-滚动'] as value,
      new boolValue(false)
    ])
    const setGroundForce = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.force),
      forceParts['F-地面'] as value,
      new boolValue(false)
    ])
    const setAirForce = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.force),
      forceParts['F-空中'] as value,
      new boolValue(false)
    ])
    const setGroundImpulse = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.impulse),
      forceParts['J-地面'] as value,
      new boolValue(false)
    ])
    const setAirImpulse = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.impulse),
      forceParts['J-空中'] as value,
      new boolValue(false)
    ])
    const setRollingAngularVelocity = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.angularVelocity),
      rollingAngularVelocity.w角速度 as value
    ])
    const setAngularVelocity = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.angularVelocity),
      nextAngularVelocity.结果 as value
    ])
    const setVelocity = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.velocity),
      nextVelocity.结果 as value
    ])
    const sequence = f.declareDetached(sequentialExecution, {})
    const clearExtraPressure = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.extraPressure),
      new floatValue(0),
      new boolValue(false)
    ])

    f.link(f.entry(), 0, contactBranch)
    f.link(contactBranch, 0, rollingBranch)
    f.link(contactBranch, 1, setAirForce)

    f.link(rollingBranch, 0, setRollingForce)
    f.link(rollingBranch, 1, setGroundForce)

    f.link(setRollingForce, 0, setVelocity)
    f.link(setRollingForce, 0, setRollingAngularVelocity)
    f.link(setRollingAngularVelocity, 0, sequence)

    f.link(setGroundForce, 0, setGroundImpulse)
    f.link(setGroundImpulse, 0, setAngularVelocity)

    f.link(setAirForce, 0, setAirImpulse)
    f.link(setAirImpulse, 0, setAngularVelocity)

    f.link(setAngularVelocity, 0, setVelocity)
    f.link(setVelocity, 0, sequence)

    f.link(sequence, 0, clearExtraPressure)
    f.outflow('是', sequence, 3)

    return {
      F_aero: forceParts.F_aero,
      F摩擦力: forceParts.F摩擦力
    }
  }
})
