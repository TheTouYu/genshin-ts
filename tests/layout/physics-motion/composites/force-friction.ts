import { g } from 'genshin-ts/runtime/core'
import { float as floatValue, int as intValue } from 'genshin-ts/runtime/value'

import { PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'
import { mul3 } from './math.js'

export const slipVelocity = g.defineComposite('slip_velocity', {
  inputs: {
    w: { type: 'vec3', pinIndex: 1350 },
    v: { type: 'vec3', pinIndex: 1356 }
  },
  outputs: {
    滚动: { type: 'bool', pinIndex: 1358 },
    值: { type: 'vec3', pinIndex: 1364 },
    滑动: { type: 'bool', pinIndex: 638 }
  },
  build(args, f) {
    const radius = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.radius).asType('float')
    const radiusVector = f.create3dVector(0, radius, 0)
    const contactVelocity = f._3dVectorAddition(
      args.v,
      f._3dVectorCrossProduct(radiusVector, args.w)
    )
    const contactParts = f.split3dVector(contactVelocity)
    const horizontalVelocity = f.create3dVector(contactParts.xComponent, 0, contactParts.zComponent)
    const horizontalLocal = f.getLocalVariable(horizontalVelocity).value
    const speed = f._3dVectorModuloOperation(horizontalLocal)

    return {
      滚动: f.lessThanOrEqualTo(speed, new floatValue(0.36)),
      值: horizontalLocal,
      滑动: f.greaterThan(speed, new floatValue(0.36))
    }
  }
})

export const frictionForce = g.defineComposite('friction_force', {
  inputs: {
    w: { type: 'vec3', pinIndex: 1359 },
    v: { type: 'vec3', pinIndex: 1360 },
    额外受力: { type: 'float', pinIndex: 1361 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 1362 },
    滚动: { type: 'bool', pinIndex: 1363 },
    滑动: { type: 'bool', pinIndex: 639 },
    '压力摩擦分力（一瞬间）': { type: 'vec3', pinIndex: 1094 }
  },
  build(args, f) {
    const slip = f.callComposite(slipVelocity, { w: args.w, v: args.v })
    const gravity = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.gravity).asType('float')
    const mass = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.mass).asType('float')
    const friction = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.friction).asType('float')
    const slidingInt = f.dataTypeConversion(slip.滑动, 'int')
    const slidingFloat = f.dataTypeConversion(slidingInt, 'float')
    const frictionScale = f.multiplication(friction, slidingFloat)
    const normalizedSlip = f._3dVectorNormalization(
      f._3dVectorZoom(slip.值, f.dataTypeConversion(new intValue(1), 'float'))
    )
    const normalizedSlipLocal = f.getLocalVariable(normalizedSlip).value
    const normalForce = f.addition(f.multiplication(gravity, mass), args.额外受力)
    const pressureScale = f.callComposite(mul3, {
      a: args.额外受力,
      b: frictionScale,
      c: new floatValue(-1)
    })
    const totalScale = f.callComposite(mul3, {
      a: normalForce,
      b: frictionScale,
      c: new floatValue(-1)
    })

    return {
      结果: f._3dVectorZoom(normalizedSlipLocal, totalScale.result),
      滚动: slip.滚动,
      滑动: slip.滑动,
      '压力摩擦分力（一瞬间）': f._3dVectorZoom(normalizedSlipLocal, pressureScale.result)
    }
  }
})
