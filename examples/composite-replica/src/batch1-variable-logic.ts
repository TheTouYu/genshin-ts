// 复刻「常用复合节点大全 v1.7」资源包 —— 第一批：变量运算包 + 逻辑运算包
//
// 目的：用 Genshin-TS DSL 复刻社区作者的通用复合节点，编译生成 GIA 后与原版比对，
// 验证 ①DSL 复刻逻辑是否合法 ②编译器是否有 bug。
//
// 原版复合节点 ID 对照（用于比对）：
//   变量运算包（8 个，调用流复合：Get(data) → 运算(data) → Set(exec)）：
//     1073741832 节点图变量+浮点 / 1073741857 节点图变量-浮点
//     1073741844 节点图变量+整数 / 1073741863 节点图变量-整数
//     1073741841 自定义变量+浮点 / 1073741859 自定义变量-浮点
//     1073741836 自定义变量+整数 / 1073741847 自定义变量-整数
//   逻辑运算包（7 个，纯数据流复合）：
//     1073741864 区间判定(含边界) / 1073741865 区间判定(变体) / 1073741869 区间判定(开区间)
//     1073741871 多路或(4输入平衡树) / 1073741868 多路与(4输入) / 1073741870 异或
//
// 关键复刻要点（从原版逆向得出）：
//   - 变量运算复合是「调用流」：Set 是 exec 节点，需要 inflows/outflows
//   - 原版变量运算有 4 个输入：变量名(连 Get+Set)、增量、是否触发事件
//   - 多路或/与是 4 输入平衡树 (A op B) op (C op D)，不是 3 输入链式
import { g } from 'genshin-ts/runtime/core'
import { bool, float, int, str } from 'genshin-ts/runtime/value'

// ================================================================
// 变量运算包（调用流复合）
// 原版接口：inflow×1, outflow×1, 输入×4（变量名连 Get+Set、增量、是否触发事件）
// ================================================================

// 1073741832 节点图变量 +浮点
const varAddFloat = g.defineComposite('var_add_float', {
  inputs: {
    varName: { type: 'str' },
    delta: { type: 'float' },
    triggerEvent: { type: 'bool' }
  },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ varName, delta, triggerEvent }, f) => {
    const cur = f.getNodeGraphVariable(varName).asType('float')
    const next = f.addition(cur, delta)
    const set = f.registerExecNode('set_node_graph_variable', [varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741857 节点图变量 -浮点
const varSubFloat = g.defineComposite('var_sub_float', {
  inputs: { varName: { type: 'str' }, delta: { type: 'float' }, triggerEvent: { type: 'bool' } },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ varName, delta, triggerEvent }, f) => {
    const cur = f.getNodeGraphVariable(varName).asType('float')
    const next = f.subtraction(cur, delta)
    const set = f.registerExecNode('set_node_graph_variable', [varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741844 节点图变量 +整数
const varAddInt = g.defineComposite('var_add_int', {
  inputs: { varName: { type: 'str' }, delta: { type: 'int' }, triggerEvent: { type: 'bool' } },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ varName, delta, triggerEvent }, f) => {
    const cur = f.getNodeGraphVariable(varName).asType('int')
    const next = f.addition(cur, delta)
    const set = f.registerExecNode('set_node_graph_variable', [varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741863 节点图变量 -整数
const varSubInt = g.defineComposite('var_sub_int', {
  inputs: { varName: { type: 'str' }, delta: { type: 'int' }, triggerEvent: { type: 'bool' } },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ varName, delta, triggerEvent }, f) => {
    const cur = f.getNodeGraphVariable(varName).asType('int')
    const next = f.subtraction(cur, delta)
    const set = f.registerExecNode('set_node_graph_variable', [varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741841 自定义变量 +浮点
const customAddFloat = g.defineComposite('custom_add_float', {
  inputs: {
    target: { type: 'entity' },
    varName: { type: 'str' },
    delta: { type: 'float' },
    triggerEvent: { type: 'bool' }
  },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ target, varName, delta, triggerEvent }, f) => {
    const cur = f.getCustomVariable(target, varName).asType('float')
    const next = f.addition(cur, delta)
    const set = f.registerExecNode('set_custom_variable', [target, varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741859 自定义变量 -浮点
const customSubFloat = g.defineComposite('custom_sub_float', {
  inputs: {
    target: { type: 'entity' },
    varName: { type: 'str' },
    delta: { type: 'float' },
    triggerEvent: { type: 'bool' }
  },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ target, varName, delta, triggerEvent }, f) => {
    const cur = f.getCustomVariable(target, varName).asType('float')
    const next = f.subtraction(cur, delta)
    const set = f.registerExecNode('set_custom_variable', [target, varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741836 自定义变量 +整数
const customAddInt = g.defineComposite('custom_add_int', {
  inputs: {
    target: { type: 'entity' },
    varName: { type: 'str' },
    delta: { type: 'int' },
    triggerEvent: { type: 'bool' }
  },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ target, varName, delta, triggerEvent }, f) => {
    const cur = f.getCustomVariable(target, varName).asType('int')
    const next = f.addition(cur, delta)
    const set = f.registerExecNode('set_custom_variable', [target, varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// 1073741847 自定义变量 -整数
const customSubInt = g.defineComposite('custom_sub_int', {
  inputs: {
    target: { type: 'entity' },
    varName: { type: 'str' },
    delta: { type: 'int' },
    triggerEvent: { type: 'bool' }
  },
  outputs: {},
  inflows: ['in'],
  outflows: ['done'],
  forceFull: true,
  build: ({ target, varName, delta, triggerEvent }, f) => {
    const cur = f.getCustomVariable(target, varName).asType('int')
    const next = f.subtraction(cur, delta)
    const set = f.registerExecNode('set_custom_variable', [target, varName, next, triggerEvent])
    f.outflow('done', set, 0)
    return {}
  }
})

// ================================================================
// 逻辑运算包（纯数据流复合）
// ================================================================

// 1073741864 区间判定（含边界）：值 >= 下限 AND 值 <= 上限
const inRangeInclusive = g.defineComposite('in_range_inclusive', {
  inputs: { value: { type: 'float' }, lower: { type: 'float' }, upper: { type: 'float' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ value, lower, upper }, f) => ({
    result: f.logicalAndOperation(
      f.greaterThanOrEqualTo(value, lower),
      f.lessThanOrEqualTo(value, upper)
    )
  })
})

// 1073741865 区间判定（变体）：值 > 下限 AND 值 < 上限
const inRangeVariant = g.defineComposite('in_range_variant', {
  inputs: { value: { type: 'float' }, lower: { type: 'float' }, upper: { type: 'float' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ value, lower, upper }, f) => ({
    result: f.logicalAndOperation(f.greaterThan(value, lower), f.lessThan(value, upper))
  })
})

// 1073741869 区间判定（开区间）：值 > 下限 AND 值 < 上限
const inRangeOpen = g.defineComposite('in_range_open', {
  inputs: { value: { type: 'float' }, lower: { type: 'float' }, upper: { type: 'float' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ value, lower, upper }, f) => ({
    result: f.logicalAndOperation(f.greaterThan(value, lower), f.lessThan(value, upper))
  })
})

// 1073741871 多路或（4 输入平衡树）：(A OR B) OR (C OR D)
const or4 = g.defineComposite('or4', {
  inputs: { a: { type: 'bool' }, b: { type: 'bool' }, c: { type: 'bool' }, d: { type: 'bool' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ a, b, c, d }, f) => ({
    result: f.logicalOrOperation(
      f.logicalOrOperation(a, b),
      f.logicalOrOperation(c, d)
    )
  })
})

// 1073741868 多路与（4 输入平衡树）：(A AND B) AND (C AND D)
const and4 = g.defineComposite('and4', {
  inputs: { a: { type: 'bool' }, b: { type: 'bool' }, c: { type: 'bool' }, d: { type: 'bool' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ a, b, c, d }, f) => ({
    result: f.logicalAndOperation(
      f.logicalAndOperation(a, b),
      f.logicalAndOperation(c, d)
    )
  })
})

// 1073741870 异或（两输入相同=1）：(A AND NOT B) OR (NOT A AND B)
const xor2 = g.defineComposite('xor2', {
  inputs: { a: { type: 'bool' }, b: { type: 'bool' } },
  outputs: { result: { type: 'bool' } },
  forceFull: true,
  build: ({ a, b }, f) => ({
    result: f.logicalOrOperation(
      f.logicalAndOperation(a, f.logicalNotOperation(b)),
      f.logicalAndOperation(f.logicalNotOperation(a), b)
    )
  })
})

// ================================================================
// 宿主图：最小入口（forceFull 已保证所有复合进 GIA，宿主只需一个合法入口）
// ================================================================

const graph = g
  .server({
    id: 1073741825,
    variables: {
      counter: new int(0),
      score: new float(0)
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.callComposite(varAddInt, { varName: new str('counter'), delta: 1n, triggerEvent: new bool(false) })
  })

export default graph
