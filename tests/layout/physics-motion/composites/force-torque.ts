import { g } from 'genshin-ts/runtime/core'
import { float as floatValue } from 'genshin-ts/runtime/value'

import { PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'

export const frictionTorque = g.defineComposite('摩擦力矩', {
  inputs: {
    f: { type: 'vec3', pinIndex: 1346 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 1337 }
  },
  build(args, f) {
    const radius = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.radius).asType('float')
    return {
      结果: f._3dVectorCrossProduct(args.f, f.create3dVector(0, radius, 0))
    }
  }
})

export const angularVelocityDampingTorque = g.defineComposite('w衰减力矩', {
  inputs: {
    w: { type: 'vec3', pinIndex: 1370 },
    地面衰减系数: { type: 'float', pinIndex: 1065 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 1371 }
  },
  build(args, f) {
    const angularFriction = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.angularFriction)
      .asType('float')
    const fixedDamping = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.fixedAngularDamping)
      .asType('vec3')
    const dampingScale = f.addition(angularFriction, args.地面衰减系数)
    const scaled = f._3dVectorZoom(args.w, dampingScale)

    // These nodes exist in the real composite even though its returned pin bypasses them.
    const isSlow = f.lessThanOrEqualTo(f._3dVectorModuloOperation(args.w), 10)
    f.dataTypeConversion(f.dataTypeConversion(isSlow, 'int'), 'float')
    f._3dVectorAddition(scaled, fixedDamping)

    return { 结果: f._3dVectorZoom(scaled, new floatValue(-1)) }
  }
})

export const torque = g.defineComposite('力矩', {
  inputs: {
    w: { type: 'vec3', pinIndex: 1393 },
    f: { type: 'vec3', pinIndex: 1394 },
    '压力（一瞬间）': { type: 'vec3', pinIndex: 1095 }
  },
  outputs: {
    'J-空中': { type: 'vec3', pinIndex: 1102 },
    'J-地面': { type: 'vec3', pinIndex: 1401 }
  },
  build(args, f) {
    const pressureTorque = f.callComposite(frictionTorque, { f: args['压力（一瞬间）'] })
    const friction = f.callComposite(frictionTorque, { f: args.f })
    const airDamping = f.callComposite(angularVelocityDampingTorque, {
      w: args.w,
      地面衰减系数: new floatValue(0)
    })
    const groundDamping = f.callComposite(angularVelocityDampingTorque, {
      w: args.w,
      地面衰减系数: new floatValue(0.2)
    })

    return {
      'J-空中': f._3dVectorAddition(airDamping.结果, pressureTorque.结果),
      'J-地面': f._3dVectorAddition(groundDamping.结果, friction.结果)
    }
  }
})
