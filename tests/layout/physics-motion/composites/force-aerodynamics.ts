import { g } from 'genshin-ts/runtime/core'
import { float as floatValue } from 'genshin-ts/runtime/value'

import { PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'
import { mul3 } from './math.js'

export const aerodynamicForces = g.defineComposite('aerodynamic_forces', {
  inputs: {
    w: { type: 'vec3', pinIndex: 1191 },
    v: { type: 'vec3', pinIndex: 1299 }
  },
  outputs: {
    magnus: { type: 'vec3', pinIndex: 1319 },
    drag: { type: 'vec3', pinIndex: 1347 },
    F_aero: { type: 'vec3', pinIndex: 1349 }
  },
  build(args, f) {
    const stiffness = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.stiffness).asType('float')
    const damping = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.damping).asType('float')
    const magnus = f._3dVectorZoom(f._3dVectorCrossProduct(args.w, args.v), stiffness)
    const dragScale = f.callComposite(mul3, {
      a: f._3dVectorModuloOperation(args.v),
      b: new floatValue(-1),
      c: damping
    })
    const drag = f._3dVectorZoom(args.v, dragScale.result)

    return {
      magnus,
      drag,
      F_aero: f._3dVectorAddition(magnus, drag)
    }
  }
})
