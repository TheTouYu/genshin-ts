// capture-set 编译器 bug 复现（2026-08-19）
//
// 复现点：复合内用「复合输入 capture」直接设图变量。
//   gsts_do_move 曾 `f.setNodeGraphVariable('curMove', moveId, false)`（moveId=复合输入 capture）
//   → 编译产物 value 引脚 connects:[] + val:bInt 0 占位（仅 compositePins 路由）
//   → 游戏/编辑器判定类型不匹配（curMove 事故）。
// 本复合复现同一模式：输入 i(int) → set_node_graph_variable('cap', i)。
// 供编辑器保存 + 多次变更差分，学习正确 wire 后修编译器。
import { g } from 'genshin-ts/runtime/core'
import { bool, entity, int, str } from 'genshin-ts/runtime/value'

const capSetRepro = g.defineComposite('cap_set_repro', {
  inputs: { i: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i }, f) => {
    // capture 设图变量：i 是复合输入 capture
    const s = f.node('set_node_graph_variable', [new str('cap'), i, new bool(false)])
    f.link(f.entry(), 0, s, 0)
    f.outflow('done', s, 0)
    return {}
  }
})

// 同族风险复现：set_custom_variable / set_local_variable 的 capture value

// 同族：set_custom_variable 的 value 用 capture（int 输入），entity 用复合输入
// 修复 2026-08-19：复合内 set_custom_variable 的 value 引脚（index 2）是 capture 时，
// 也须 ConcreteBase 包裹（isSetCustomValueCapture，与 set_node_graph_variable 同族）。
// 本复合复现：输入 v(int) → set_custom_variable('cv_int', v)。
const cvSetRepro = g.defineComposite('cv_set_repro', {
  inputs: { v: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ v }, f) => {
    const s = f.registerExecNode('set_custom_variable', [
      new entity(),
      new str('cv_int'),
      v,
      new bool(false)
    ])
    f.outflow('done', s, 0)
    return {}
  }
})

// 第三形态：set_local_variable 的 value 用 capture（int 输入）
// 修复 2026-08-19（lv_set_repro 差分闭合）：value 引脚 = ConcreteBase + vendor ioc（int→1）
// + 内层 IntBase；handle 引脚连 Get Local Variable 引用（E<1016> 身份线）。
const lvSetRepro = g.defineComposite('lv_set_repro', {
  inputs: { v: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ v }, f) => {
    const lv = f.getLocalVariable(0n)
    const s = f.registerExecNode('set_local_variable', [lv.localVariable, v])
    f.outflow('done', s, 0)
    return {}
  }
})

// float/bool 变体（2026-08-19 全类型扩展）：三个 setter 的 ioc 均走 vendor map
// （cv: float→4/bool→6；gv: float→1/bool→2；lv: float→5/bool→0），内层按类型生成。
const mkRepro = (
  name: string,
  nodeType: 'set_custom_variable' | 'set_node_graph_variable' | 'set_local_variable',
  input: 'float' | 'bool'
) =>
  g.defineComposite(name, {
    inputs: { v: { type: input } },
    outputs: {},
    outflows: ['done'],
    build: ({ v }, f) => {
      const s =
        nodeType === 'set_local_variable'
          ? f.registerExecNode('set_local_variable', [
              (input === 'bool' ? f.getLocalVariable(false) : f.getLocalVariable(0)).localVariable,
              v
            ])
          : nodeType === 'set_custom_variable'
            ? f.registerExecNode('set_custom_variable', [new entity(), new str('cv_' + input), v, new bool(false)])
            : f.registerExecNode('set_node_graph_variable', [new str('cap_' + input), v, new bool(false)])
      f.outflow('done', s, 0)
      return {}
    }
  })

const cvFloatRepro = mkRepro('cv_float_repro', 'set_custom_variable', 'float')
const cvBoolRepro = mkRepro('cv_bool_repro', 'set_custom_variable', 'bool')
const gvFloatRepro = mkRepro('gv_float_repro', 'set_node_graph_variable', 'float')
const gvBoolRepro = mkRepro('gv_bool_repro', 'set_node_graph_variable', 'bool')
const lvFloatRepro = mkRepro('lv_float_repro', 'set_local_variable', 'float')
const lvBoolRepro = mkRepro('lv_bool_repro', 'set_local_variable', 'bool')

const graph = g
  .server({ id: 1073741825, variables: { cap: new int(0) } })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.callComposite(capSetRepro, { i: new int(7) })
    f.callComposite(cvSetRepro, { v: new int(7) })
    f.callComposite(lvSetRepro, { v: new int(7) })
    f.callComposite(cvFloatRepro, { v: 1.5 })
    f.callComposite(cvBoolRepro, { v: true })
    f.callComposite(gvFloatRepro, { v: 1.5 })
    f.callComposite(gvBoolRepro, { v: true })
    f.callComposite(lvFloatRepro, { v: 1.5 })
    f.callComposite(lvBoolRepro, { v: true })
    // 注：直连实体调 setCustomVariable(_e, ...) 已移除——独立 DSL bug：
    // setCustomVariable 的 targetEntity 参数 parseValue 拒绝事件实体
    // （Invalid value type: entity, nodes.ts:1803→443），与 capture-value 修复无关，
    // 先移除以让本图可达；entity 参数解析问题另行登记修复。
  })

export default graph
