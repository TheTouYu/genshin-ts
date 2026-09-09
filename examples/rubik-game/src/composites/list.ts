// 长列表资产：把多个 ≤100 元素的官方列表拼成一个“逻辑长列表”
// 命名前缀：long_list_*
// 2026-08-21 编译器/编辑器限制：初始列表字面量最多 100 个元素。
// 本资产对外像官方 Get Corresponding Value From List 一样使用，内部自动拆封。

import { g } from 'genshin-ts/runtime/core'

// 纯数据读取：从 3 段 vec3_list 拼接的逻辑长列表中按下标取 vec3
// 通过向量缩放做数据选择器（sel=0/1 缩放后相加），无需 exec 分支
export const longListGetVec3 = g.defineComposite('long_list_get_vec3', {
  id: 1610700045,
  inputs: {
    i: { type: 'int' },
    chunkSize: { type: 'int' },
    c0: { type: 'vec3_list' },
    c1: { type: 'vec3_list' },
    c2: { type: 'vec3_list' }
  },
  outputs: { out: { type: 'vec3' } },
  build: ({ i, chunkSize, c0, c1, c2 }, f) => {
    const chunk = f.division(i, chunkSize)
    const offset = f.subtraction(i, f.multiplication(chunk, chunkSize))
    const sel0 = f.dataTypeConversion(f.equal(chunk, 0n), 'int')
    const sel1 = f.dataTypeConversion(f.equal(chunk, 1n), 'int')
    const sel2 = f.dataTypeConversion(f.equal(chunk, 2n), 'int')
    const v0 = f._3dVectorZoom(f.getCorrespondingValueFromList(c0 as any, offset) as any, f.dataTypeConversion(sel0, 'float'))
    const v1 = f._3dVectorZoom(f.getCorrespondingValueFromList(c1 as any, offset) as any, f.dataTypeConversion(sel1, 'float'))
    const v2 = f._3dVectorZoom(f.getCorrespondingValueFromList(c2 as any, offset) as any, f.dataTypeConversion(sel2, 'float'))
    const out = f._3dVectorAddition(v0, f._3dVectorAddition(v1, v2))
    return { out }
  }
})

// 纯数据读取：从 4 段 int_list 拼接的逻辑长列表中按下标取 int（乘法选择器）
export const longListGetInt4 = g.defineComposite('long_list_get_int_4', {
  id: 1610700047,
  inputs: {
    i: { type: 'int' },
    chunkSize: { type: 'int' },
    c0: { type: 'int_list' },
    c1: { type: 'int_list' },
    c2: { type: 'int_list' },
    c3: { type: 'int_list' }
  },
  outputs: { out: { type: 'int' } },
  build: ({ i, chunkSize, c0, c1, c2, c3 }, f) => {
    const chunk = f.division(i, chunkSize)
    const offset = f.subtraction(i, f.multiplication(chunk, chunkSize))
    const s0 = f.dataTypeConversion(f.equal(chunk, 0n), 'int')
    const s1 = f.dataTypeConversion(f.equal(chunk, 1n), 'int')
    const s2 = f.dataTypeConversion(f.equal(chunk, 2n), 'int')
    const s3 = f.dataTypeConversion(f.equal(chunk, 3n), 'int')
    const v0 = f.multiplication(f.getCorrespondingValueFromList(c0 as any, offset) as any, s0)
    const v1 = f.multiplication(f.getCorrespondingValueFromList(c1 as any, offset) as any, s1)
    const v2 = f.multiplication(f.getCorrespondingValueFromList(c2 as any, offset) as any, s2)
    const v3 = f.multiplication(f.getCorrespondingValueFromList(c3 as any, offset) as any, s3)
    const out = f.addition(v0, f.addition(v1, f.addition(v2, v3)))
    return { out }
  }
})

// 纯数据读取：从 3 段 int_list 拼接的逻辑长列表中按下标取 int
// 用乘法选择器（sel=0/1）+ 加法合并，无需 exec 分支
export const longListGetInt = g.defineComposite('long_list_get_int', {
  id: 1610700046,
  inputs: {
    i: { type: 'int' },
    chunkSize: { type: 'int' },
    c0: { type: 'int_list' },
    c1: { type: 'int_list' },
    c2: { type: 'int_list' }
  },
  outputs: { out: { type: 'int' } },
  build: ({ i, chunkSize, c0, c1, c2 }, f) => {
    const chunk = f.division(i, chunkSize)
    const offset = f.subtraction(i, f.multiplication(chunk, chunkSize))
    const sel0 = f.dataTypeConversion(f.equal(chunk, 0n), 'int')
    const sel1 = f.dataTypeConversion(f.equal(chunk, 1n), 'int')
    const sel2 = f.dataTypeConversion(f.equal(chunk, 2n), 'int')
    const v0 = f.multiplication(f.getCorrespondingValueFromList(c0 as any, offset) as any, sel0)
    const v1 = f.multiplication(f.getCorrespondingValueFromList(c1 as any, offset) as any, sel1)
    const v2 = f.multiplication(f.getCorrespondingValueFromList(c2 as any, offset) as any, sel2)
    const out = f.addition(v0, f.addition(v1, v2))
    return { out }
  }
})

// 纯数据读取：从 6 段 int_list 拼接的逻辑长列表中按下标取 int（乘法选择器）
// 用于 576 项 PLL 紧凑表（chunkSize 100）
export const longListGetInt6 = g.defineComposite('long_list_get_int_6', {
  id: 1610700083,
  inputs: {
    i: { type: 'int' },
    chunkSize: { type: 'int' },
    c0: { type: 'int_list' },
    c1: { type: 'int_list' },
    c2: { type: 'int_list' },
    c3: { type: 'int_list' },
    c4: { type: 'int_list' },
    c5: { type: 'int_list' }
  },
  outputs: { out: { type: 'int' } },
  build: ({ i, chunkSize, c0, c1, c2, c3, c4, c5 }, f) => {
    const chunk = f.division(i, chunkSize)
    const offset = f.subtraction(i, f.multiplication(chunk, chunkSize))
    const sel = (k: number) => f.dataTypeConversion(f.equal(chunk, BigInt(k)), 'int')
    const v0 = f.multiplication(f.getCorrespondingValueFromList(c0 as any, offset) as any, sel(0))
    const v1 = f.multiplication(f.getCorrespondingValueFromList(c1 as any, offset) as any, sel(1))
    const v2 = f.multiplication(f.getCorrespondingValueFromList(c2 as any, offset) as any, sel(2))
    const v3 = f.multiplication(f.getCorrespondingValueFromList(c3 as any, offset) as any, sel(3))
    const v4 = f.multiplication(f.getCorrespondingValueFromList(c4 as any, offset) as any, sel(4))
    const v5 = f.multiplication(f.getCorrespondingValueFromList(c5 as any, offset) as any, sel(5))
    const out = f.addition(v0, f.addition(v1, f.addition(v2, f.addition(v3, f.addition(v4, v5)))))
    return { out }
  }
})

// 纯数据读取：从 9 段 int_list 拼接的逻辑长列表中按下标取 int（乘法选择器）
// 用于 803 项 OLL 逆公式表（chunkSize 100）
export const longListGetInt9 = g.defineComposite('long_list_get_int_9', {
  id: 1610700084,
  inputs: {
    i: { type: 'int' },
    chunkSize: { type: 'int' },
    c0: { type: 'int_list' },
    c1: { type: 'int_list' },
    c2: { type: 'int_list' },
    c3: { type: 'int_list' },
    c4: { type: 'int_list' },
    c5: { type: 'int_list' },
    c6: { type: 'int_list' },
    c7: { type: 'int_list' },
    c8: { type: 'int_list' }
  },
  outputs: { out: { type: 'int' } },
  build: ({ i, chunkSize, c0, c1, c2, c3, c4, c5, c6, c7, c8 }, f) => {
    const chunk = f.division(i, chunkSize)
    const offset = f.subtraction(i, f.multiplication(chunk, chunkSize))
    const sel = (k: number) => f.dataTypeConversion(f.equal(chunk, BigInt(k)), 'int')
    const v0 = f.multiplication(f.getCorrespondingValueFromList(c0 as any, offset) as any, sel(0))
    const v1 = f.multiplication(f.getCorrespondingValueFromList(c1 as any, offset) as any, sel(1))
    const v2 = f.multiplication(f.getCorrespondingValueFromList(c2 as any, offset) as any, sel(2))
    const v3 = f.multiplication(f.getCorrespondingValueFromList(c3 as any, offset) as any, sel(3))
    const v4 = f.multiplication(f.getCorrespondingValueFromList(c4 as any, offset) as any, sel(4))
    const v5 = f.multiplication(f.getCorrespondingValueFromList(c5 as any, offset) as any, sel(5))
    const v6 = f.multiplication(f.getCorrespondingValueFromList(c6 as any, offset) as any, sel(6))
    const v7 = f.multiplication(f.getCorrespondingValueFromList(c7 as any, offset) as any, sel(7))
    const v8 = f.multiplication(f.getCorrespondingValueFromList(c8 as any, offset) as any, sel(8))
    const out = f.addition(v0, f.addition(v1, f.addition(v2, f.addition(v3, f.addition(v4, f.addition(v5, f.addition(v6, f.addition(v7, v8))))))))
    return { out }
  }
})
