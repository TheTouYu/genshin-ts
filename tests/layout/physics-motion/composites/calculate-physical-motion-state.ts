import { g } from 'genshin-ts/runtime/core'
import { bool as boolValue, float as floatValue, vec3 } from 'genshin-ts/runtime/value'

import { PHYSICS_CUSTOM_VARIABLES, PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'

const and4 = g.defineComposite('与', {
  inputs: {
    输入1: { type: 'bool', pinIndex: 556 },
    输入1_2: { type: 'bool', pinIndex: 557 },
    输入2: { type: 'bool', pinIndex: 558 },
    输入1_3: { type: 'bool', pinIndex: 603 }
  },
  outputs: {
    结果: { type: 'bool', pinIndex: 606 }
  },
  build(args, f) {
    const first = f.logicalAndOperation(args.输入1, args.输入1_2)
    const second = f.logicalAndOperation(args.输入2, args.输入1_3)
    return { 结果: f.logicalAndOperation(first, second) }
  }
})

export const canFly = g.defineComposite('can fly', {
  inputs: {
    三维向量1: { type: 'vec3', pinIndex: 1233 }
  },
  outputs: {
    结果: { type: 'bool', pinIndex: 1267 },
    结果非: { type: 'bool', pinIndex: 1596 },
    vy: { type: 'float', pinIndex: 1321 }
  },
  build(args, f) {
    const verticalSpeed = f._3dVectorDotProduct(args.三维向量1, new vec3([0, 1, 0]))
    const result = f.greaterThan(
      verticalSpeed as unknown as number,
      f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.halfGravityDeltaSquared).asType('float')
    )

    return {
      结果: result,
      结果非: f.logicalNotOperation(result),
      vy: verticalSpeed
    }
  }
})

export const calculatePhysicalMotionState = g.defineComposite('计算物理运动状态', {
  inputs: {
    w: { type: 'vec3', pinIndex: 1428 },
    v: { type: 'vec3', pinIndex: 1432 }
  },
  outputs: {
    停止: { type: 'bool', pinIndex: 50 },
    v停止: { type: 'bool', pinIndex: 1801 },
    接触地面: { type: 'bool', pinIndex: 1427 },
    w停止: { type: 'bool', pinIndex: 1430 }
  },
  build(args, f) {
    const angularSpeed = f._3dVectorModuloOperation(args.w)
    const velocitySpeed = f._3dVectorModuloOperation(args.v)
    const w停止 = f.lessThan(angularSpeed as unknown as number, new floatValue(0.3))
    const v停止 = f.lessThan(velocitySpeed as unknown as number, new floatValue(0.1))
    const entity = f.getSelfEntity()
    const contactValue = f
      .getCustomVariable(entity, PHYSICS_CUSTOM_VARIABLES.contactGround)
      .asType('float')
    const contactFlag = f.greaterThanOrEqualTo(contactValue, new floatValue(1))
    const canFlyResult = f.callComposite(canFly, { 三维向量1: args.v })
    const nearGround = f.logicalAndOperation(canFlyResult.结果非, v停止)
    const vStopped = f.logicalAndOperation(contactFlag, nearGround)
    const stopped = f.callComposite(and4, {
      输入1: contactFlag,
      输入1_2: w停止,
      输入2: nearGround,
      输入1_3: new boolValue(true)
    })

    return {
      停止: stopped.结果,
      v停止: vStopped,
      接触地面: contactFlag,
      w停止
    }
  }
})
