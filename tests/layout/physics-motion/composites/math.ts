import { g } from 'genshin-ts/runtime/core'
import { asRuntimeValue } from 'genshin-ts/runtime/value'

export const mul3 = g.defineComposite('mul3', {
  inputs: {
    a: { type: 'float', pinIndex: 299 },
    b: { type: 'float', pinIndex: 300 },
    c: { type: 'float', pinIndex: 301 }
  },
  outputs: {
    result: { type: 'float', pinIndex: 302 }
  },
  build(args, f) {
    const ab = f.multiplication(args.a as unknown as number, args.b as unknown as number)
    const result = f.multiplication(ab, args.c as unknown as number)
    return { result: asRuntimeValue(result) }
  }
})

export const add3 = g.defineComposite('add3', {
  inputs: {
    a: { type: 'float', pinIndex: 507 },
    b: { type: 'float', pinIndex: 525 },
    c: { type: 'float', pinIndex: 527 }
  },
  outputs: {
    result: { type: 'float', pinIndex: 528 }
  },
  build(args, f) {
    const ab = f.addition(args.a as unknown as number, args.b as unknown as number)
    const result = f.addition(ab, args.c as unknown as number)
    return { result: asRuntimeValue(result) }
  }
})

export const vectorProduct = g.defineComposite('向量×', {
  inputs: {
    x: { type: 'float', pinIndex: 82 },
    x2: { type: 'float', pinIndex: 83 },
    y: { type: 'float', pinIndex: 94 },
    y2: { type: 'float', pinIndex: 95 },
    z: { type: 'float', pinIndex: 96 },
    z2: { type: 'float', pinIndex: 97 }
  },
  outputs: {
    三维向量: { type: 'vec3', pinIndex: 81 },
    x: { type: 'float', pinIndex: 437 },
    y: { type: 'float', pinIndex: 438 },
    z: { type: 'float', pinIndex: 442 },
    内积: { type: 'float', pinIndex: 882 }
  },
  build(args, f) {
    const x = f.multiplication(args.x as unknown as number, args.x2 as unknown as number)
    const y = f.multiplication(args.y as unknown as number, args.y2 as unknown as number)
    const z = f.multiplication(args.z as unknown as number, args.z2 as unknown as number)
    const dot = f.callComposite(add3, { a: x, b: y, c: z })

    return {
      三维向量: f.create3dVector(x, y, z),
      x: asRuntimeValue(x),
      y: asRuntimeValue(y),
      z: asRuntimeValue(z),
      内积: dot.result
    }
  }
})

export const vectorMultiply = g.defineComposite('向量乘法', {
  inputs: {
    三维向量: { type: 'vec3', pinIndex: 456 },
    x2: { type: 'float', pinIndex: 457 },
    y2: { type: 'float', pinIndex: 458 },
    z2: { type: 'float', pinIndex: 459 }
  },
  outputs: {
    三维向量: { type: 'vec3', pinIndex: 460 },
    X分量: { type: 'float', pinIndex: 462 },
    Y分量: { type: 'float', pinIndex: 463 },
    Z分量: { type: 'float', pinIndex: 464 },
    内积: { type: 'float', pinIndex: 883 }
  },
  build(args, f) {
    const parts = f.split3dVector(args.三维向量)
    const product = f.callComposite(vectorProduct, {
      x: parts.xComponent,
      x2: args.x2,
      y: parts.yComponent,
      y2: args.y2,
      z: parts.zComponent,
      z2: args.z2
    })
    const resultParts = f.split3dVector(product.三维向量)

    return {
      三维向量: product.三维向量,
      X分量: asRuntimeValue(resultParts.xComponent),
      Y分量: asRuntimeValue(resultParts.yComponent),
      Z分量: asRuntimeValue(resultParts.zComponent),
      内积: product.内积
    }
  }
})

export const componentwiseVectorMultiply = g.defineComposite('向量内积乘法', {
  inputs: {
    左三维向量: { type: 'vec3', pinIndex: 426 },
    右三维向量: { type: 'vec3', pinIndex: 427 }
  },
  outputs: {
    三维向量: { type: 'vec3', pinIndex: 497 },
    X分量: { type: 'float', pinIndex: 509 },
    Y分量: { type: 'float', pinIndex: 642 },
    Z分量: { type: 'float', pinIndex: 756 }
  },
  build(args, f) {
    const right = f.split3dVector(args.右三维向量)
    const product = f.callComposite(vectorMultiply, {
      三维向量: args.左三维向量,
      x2: right.xComponent,
      y2: right.yComponent,
      z2: right.zComponent
    })

    return {
      三维向量: product.三维向量,
      X分量: product.X分量,
      Y分量: product.Y分量,
      Z分量: product.Z分量
    }
  }
})
