import { g } from 'genshin-ts/runtime/core'
import { bool as boolValue, float as floatValue } from 'genshin-ts/runtime/value'

import { PHYSICS_NODE_GRAPH_VARIABLES } from '../helpers/variables.js'

export const angularVelocityDirectionConversion = g.defineComposite('w角速度-a朝向转化', {
  inputs: {
    w角速度: { type: 'vec3', pinIndex: 314 },
    a朝向: { type: 'vec3', pinIndex: 315 }
  },
  outputs: {
    a朝向: { type: 'vec3', pinIndex: 313 },
    w角速度: { type: 'vec3', pinIndex: 316 }
  },
  build(args, f) {
    const directionParts = f.split3dVector(args.a朝向)
    const angularVelocity = f.create3dVector(
      directionParts.zComponent,
      directionParts.yComponent,
      f.multiplication(directionParts.xComponent, new floatValue(-1))
    )

    if (!args.w角速度) {
      return {
        a朝向: args.a朝向,
        w角速度: angularVelocity
      }
    }

    const angularParts = f.split3dVector(args.w角速度)
    const direction = f.create3dVector(
      f.multiplication(angularParts.zComponent, new floatValue(-1)),
      angularParts.yComponent,
      angularParts.xComponent
    )

    return {
      a朝向: direction,
      w角速度: angularVelocity
    }
  }
})

export const vectorScaleDivision = g.defineComposite('向量缩放除法', {
  inputs: {
    三维向量: { type: 'vec3', pinIndex: 379 },
    '': { type: 'float', pinIndex: 383 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 396 }
  },
  build(args, f) {
    return {
      结果: f._3dVectorZoom(args.三维向量, f.division(new floatValue(1), args['']))
    }
  }
})

export const calculateRollingAngularVelocity = g.defineComposite('计算滚动角速度', {
  inputs: {},
  outputs: {
    w角速度: { type: 'vec3', pinIndex: 429 }
  },
  build(_args, f) {
    const angularVelocity = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.angularVelocity)
      .asType('vec3')
    const velocity = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.velocity).asType('vec3')
    const radius = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.radius).asType('float')
    const scaledDirection = f.callComposite(vectorScaleDivision, {
      三维向量: velocity,
      '': radius
    })
    const directionParts = f.split3dVector(scaledDirection.结果)
    const direction = f.create3dVector(
      directionParts.xComponent,
      f._3dVectorDotProduct(angularVelocity, f.create3dVector(0, 0.9, 0)),
      directionParts.zComponent
    )
    const converted = f.callComposite(angularVelocityDirectionConversion, {
      a朝向: direction
    })

    return {
      w角速度: converted.w角速度
    }
  }
})

export const updateVelocity = g.defineComposite('更新速度', {
  inputs: {
    更新间隔: { type: 'float', pinIndex: 439 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 430 }
  },
  build(args, f) {
    const velocity = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.velocity).asType('vec3')
    const force = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.force).asType('vec3')
    const mass = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.mass).asType('float')
    const reciprocalMass = f.division(new floatValue(1), mass)
    const scale = f.multiplication(args.更新间隔, reciprocalMass)
    const deltaVelocity = f._3dVectorZoom(force, scale)

    return {
      结果: f._3dVectorAddition(velocity, deltaVelocity)
    }
  }
})

export const updateAngularVelocity = g.defineComposite('更新角速度', {
  inputs: {
    更新间隔: { type: 'float', pinIndex: 467 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 465 }
  },
  build(args, f) {
    const angularVelocity = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.angularVelocity)
      .asType('vec3')
    const impulse = f.getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.impulse).asType('vec3')
    const inverseInertia = f
      .getNodeGraphVariable(PHYSICS_NODE_GRAPH_VARIABLES.inverseInertia)
      .asType('float')
    const scale = f.multiplication(args.更新间隔, inverseInertia)

    return {
      结果: f._3dVectorAddition(angularVelocity, f._3dVectorZoom(impulse, scale))
    }
  }
})

export const sequentialExecution = g.defineComposite('顺序执行', {
  inputs: {},
  outputs: {},
  inflows: [{ name: '', pinIndex: 513 }],
  outflows: [
    { name: '是', pinIndex: 514 },
    { name: '是', pinIndex: 515 },
    { name: '是', pinIndex: 516 },
    { name: '是', pinIndex: 517 }
  ],
  build(_args, f) {
    const entry = f.node('double_branch', [new boolValue(true)])
    const exits = [
      f.node('double_branch', [new boolValue(true)]),
      f.node('double_branch', [new boolValue(true)]),
      f.node('double_branch', [new boolValue(true)]),
      f.node('double_branch', [new boolValue(true)])
    ]

    f.link(f.entry(), 0, entry)
    exits.forEach((exit) => {
      f.link(entry, 0, exit)
      f.outflow('是', exit, 0)
    })

    return {}
  }
})
