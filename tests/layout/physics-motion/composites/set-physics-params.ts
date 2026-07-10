import { g } from 'genshin-ts/runtime/core'
import {
  bool as boolValue,
  entity as entityValue,
  float as floatValue,
  type value,
  str as strValue
} from 'genshin-ts/runtime/value'

import { mul3 } from './math.js'
import {
  PHYSICS_CUSTOM_VARIABLES,
  PHYSICS_NODE_GRAPH_VARIABLES
} from '../helpers/variables.js'

export const setPhysicsParams = g.defineComposite('设置物理参数', {
  inputs: {
    目标实体: { type: 'entity', pinIndex: 1365 }
  },
  outputs: {},
  inflows: [{ name: '', pinIndex: 370 }],
  build(args, f) {
    const targetEntity = args.目标实体 as entityValue

    const gravity = f.getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.gravity).asType('float') as unknown as value
    const stiffness = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.stiffness)
      .asType('float') as unknown as value
    const inverseInertia = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.inverseInertia)
      .asType('float') as unknown as value
    const damping = f.getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.damping).asType('float') as unknown as value
    const radius = f.getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.radius).asType('float') as unknown as value
    const friction = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.friction)
      .asType('float') as unknown as value
    const mass = f.getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.mass).asType('float') as unknown as value
    const motionEntityGuid = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.motionEntityGuid)
      .asType('guid')
    const visualEntityGuid = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.visualEntityGuid)
      .asType('guid')
    const angularFriction = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.angularFriction)
      .asType('float') as unknown as value
    const gravityForce = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.gravityForce)
      .asType('float') as unknown as value
    const updateInterval = f
      .getCustomVariable(targetEntity, PHYSICS_CUSTOM_VARIABLES.updateInterval)
      .asType('int')

    const motionEntity = f.queryEntityByGuid(motionEntityGuid)
    const visualEntity = f.queryEntityByGuid(visualEntityGuid)
    const updateIntervalFloat = f.dataTypeConversion(updateInterval, 'float')
    const deltaSeconds = f.division(updateIntervalFloat, 1000) as unknown as value

    const setGravityForce = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.gravityForce),
      gravityForce,
      new boolValue(false)
    ])
    const setMotionEntity = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.motionEntity),
      motionEntity,
      new boolValue(false)
    ])
    const setGravity = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.gravity),
      gravity,
      new boolValue(false)
    ])
    const setInverseInertia = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.inverseInertia),
      inverseInertia,
      new boolValue(false)
    ])
    const setRadius = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.radius),
      radius,
      new boolValue(false)
    ])
    const setFriction = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.friction),
      friction,
      new boolValue(false)
    ])
    const setAngularFriction = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.angularFriction),
      angularFriction,
      new boolValue(false)
    ])
    const setMass = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.mass),
      mass,
      new boolValue(false)
    ])
    const setDeltaSeconds = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.deltaSeconds),
      deltaSeconds,
      new boolValue(false)
    ])
    const setVisualEntity = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.visualEntity),
      visualEntity,
      new boolValue(false)
    ])

    const halfGravityDeltaSquared = f.callComposite(mul3, {
      a: gravity,
      b: deltaSeconds,
      c: new floatValue(0.5)
    })
    const setHalfGravityDeltaSquared = f.node('set_node_graph_variable', [
      new strValue(PHYSICS_NODE_GRAPH_VARIABLES.halfGravityDeltaSquared),
      halfGravityDeltaSquared.result as value,
      new boolValue(false)
    ])

    const entry = f.entry()
    f.link(entry, 0, setGravityForce)
    f.link(entry, 0, setMotionEntity)
    f.link(entry, 0, setGravity)
    f.link(entry, 0, setInverseInertia)
    f.link(entry, 0, setRadius)
    f.link(entry, 0, setFriction)
    f.link(entry, 0, setAngularFriction)
    f.link(entry, 0, setMass)
    f.link(entry, 0, setDeltaSeconds)
    f.link(entry, 0, setVisualEntity)
    f.link(entry, 0, setHalfGravityDeltaSquared)

    return {}
  }
})
