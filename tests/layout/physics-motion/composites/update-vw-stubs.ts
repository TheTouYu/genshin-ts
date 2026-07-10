import { g } from 'genshin-ts/runtime/core'
import { asRuntimeValue, bool as boolValue, vec3 as vec3Value } from 'genshin-ts/runtime/value'

export const calculateRollingAngularVelocity = g.defineComposite('计算滚动角速度', {
  inputs: {},
  outputs: {
    w角速度: { type: 'vec3', pinIndex: 429 }
  },
  build(_args, f) {
    return {
      w角速度: f.getNodeGraphVariable('w').asType('vec3')
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
    const wProxy = f._3dVectorAddition(args.w, new vec3Value([0, 0, 0]))
    const vProxy = f._3dVectorAddition(args.v, new vec3Value([0, 0, 0]))
    const rollingProxy = asRuntimeValue(f.logicalNotOperation(new boolValue(true)))

    return {
      'F-滚动': wProxy,
      滚动: rollingProxy,
      'F-地面': wProxy,
      'F-空中': vProxy,
      'J-地面': wProxy,
      'J-空中': vProxy,
      F_aero: wProxy,
      F摩擦力: vProxy
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
  build(_args, f) {
    return {
      结果: f.getNodeGraphVariable('v').asType('vec3')
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
  build(_args, f) {
    return {
      结果: f.getNodeGraphVariable('w').asType('vec3')
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
