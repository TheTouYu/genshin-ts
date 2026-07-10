import { g } from 'genshin-ts/runtime/core'
import { float as floatValue, vec3 as vec3Value } from 'genshin-ts/runtime/value'

import { PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'
import { aerodynamicForces } from './force-aerodynamics.js'
import { frictionForce } from './force-friction.js'
import { torque } from './force-torque.js'
import { componentwiseVectorMultiply, mul3 } from './math.js'

export const resultantForce = g.defineComposite('计算合力', {
  inputs: {
    air: { type: 'vec3', pinIndex: 1446 },
    f: { type: 'vec3', pinIndex: 1447 }
  },
  outputs: {
    'F-地面': { type: 'vec3', pinIndex: 1451 },
    'F-空中': { type: 'vec3', pinIndex: 1395 }
  },
  build(args, f) {
    const gravity = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.gravity).asType('float')
    const mass = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.mass).asType('float')
    const gravityVector = f.create3dVector(0, f.multiplication(gravity, mass), 0)

    f.callComposite(componentwiseVectorMultiply, {
      左三维向量: args.air,
      右三维向量: new vec3Value([1, 0, 1])
    })

    return {
      'F-地面': f._3dVectorAddition(args.air, args.f),
      'F-空中': f._3dVectorSubtraction(args.air, gravityVector)
    }
  }
})

export const rollingFrictionForce = g.defineComposite('计算滚动摩擦力', {
  inputs: {
    v: { type: 'vec3', pinIndex: 374 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 375 }
  },
  build(args, f) {
    const gravityForce = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.gravityForce)
      .asType('float')
    const mass = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.mass).asType('float')
    const scale = f.callComposite(mul3, {
      a: gravityForce,
      b: mass,
      c: new floatValue(-1)
    })
    return {
      结果: f._3dVectorZoom(f._3dVectorNormalization(args.v), scale.result)
    }
  }
})

export const calculateForces = g.defineComposite('计算分力', {
  inputs: {
    w: { type: 'vec3', pinIndex: 502 },
    v: { type: 'vec3', pinIndex: 522 },
    额外受力: { type: 'float', pinIndex: 541 }
  },
  outputs: {
    'F-滚动': { type: 'vec3', pinIndex: 500 },
    滚动: { type: 'bool', pinIndex: 501 },
    'F-地面': { type: 'vec3', pinIndex: 472 },
    'F-空中': { type: 'vec3', pinIndex: 532 },
    'J-地面': { type: 'vec3', pinIndex: 471 },
    'J-空中': { type: 'vec3', pinIndex: 1103 },
    F_aero: { type: 'vec3', pinIndex: 1796 },
    F摩擦力: { type: 'vec3', pinIndex: 1797 }
  },
  build(args, f) {
    const aerodynamic = f.callComposite(aerodynamicForces, { w: args.w, v: args.v })
    const pressure = f.addition(f.split3dVector(aerodynamic.magnus).yComponent, args.额外受力)
    const friction = f.callComposite(frictionForce, {
      w: args.w,
      v: args.v,
      额外受力: pressure
    })
    const frictionLocal = f.getLocalVariable(friction.结果).value
    const resultant = f.callComposite(resultantForce, {
      air: aerodynamic.F_aero,
      f: frictionLocal
    })
    const impulses = f.callComposite(torque, {
      w: args.w,
      f: frictionLocal,
      '压力（一瞬间）': friction['压力摩擦分力（一瞬间）']
    })
    const rollingFriction = f.callComposite(rollingFrictionForce, { v: args.v })

    return {
      'F-滚动': f._3dVectorAddition(rollingFriction.结果, resultant['F-地面']),
      滚动: friction.滚动,
      'F-地面': resultant['F-地面'],
      'F-空中': resultant['F-空中'],
      'J-地面': impulses['J-地面'],
      'J-空中': impulses['J-空中'],
      F_aero: aerodynamic.F_aero,
      F摩擦力: frictionLocal
    }
  }
})
