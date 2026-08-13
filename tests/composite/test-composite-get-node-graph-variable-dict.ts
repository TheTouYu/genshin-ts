// @ts-nocheck
/**
 * 生产发现 #4 修复回归：复合内 get_node_graph_variable 的 dict 类型推断。
 *
 * 背景（2026-08-14 差分闭合，见 docs/game-engine-knowledge/composite-nodes.md
 * 「复合内部图变量节点」）：复合内读图变量与宿主图完全同构——concreteId 按变量类型
 * 选变体（Dict_Int_Vec=3046），OutParam type=27 + ConcreteBase(indexOfConcrete=20)
 * + MapBase{itemType{type:27, kind:Pair, items{key,value}}, bMap}。
 *
 * 根因：buildImplGraphNodes 的 variablesByName 只来自 def.implVariables（复合定义
 * 显式声明 variables 选项才有的可选字段），复合内读的是图变量（IR 顶层 variables），
 * 导致 resolveNodeIdentity 找不到变量 → gvConcreteNid 为空 → concreteId 回退默认 +
 * OutParam 类型 Ety（错误 "ordinary data edge pin type mismatch ... source Ety"）。
 *
 * 修复：buildCompositeAccessories 接收 graphVariables（IR 顶层 variables），与
 * def.implVariables 合并后传给 buildImplGraphNodes 的 variablesByName。
 *
 * 官方 golden（编辑器 .gil orbit_calc 内部 nodeIndex 1）：
 *   genericId 337 + concreteId 3046 + InParam StringBase "vels1" +
 *   OutParam type=27 value=ConcreteBase{indexOfConcrete:20, value:MapBase{...}}
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-composite-get-node-graph-variable-dict.ts
 */
import assert from 'node:assert/strict'

import { buildCompositeAccessories } from '../../src/compiler/ir_to_gia_transform/composite.js'
import type { CompositeDefIR, Variable } from '../../src/runtime/IR.js'

const def: CompositeDefIR = {
  name: '图变量读取',
  id: 1610612750,
  type: 'composite',
  inflows: [],
  outflows: [],
  inputs: [],
  outputs: [],
  implNodes: [
    {
      id: 1,
      type: 'get_node_graph_variable',
      args: [{ type: 'str', value: 'vels1' }]
    }
  ],
  implEdges: {},
  compositePins: []
}

const graphVariables: Variable[] = [
  { name: 'vels1', type: 'dict', dict: { k: 'int', v: 'vec3' } }
]

const accessories = buildCompositeAccessories(def, undefined, graphVariables)
const implGraph = accessories.find((unit) => unit.which === 9)?.graph?.inner?.graph
assert.ok(implGraph, 'impl graph accessory must exist')

const getter = implGraph.nodes.find((node) => node.genericId?.nodeId === 337)
assert.ok(getter, 'get_node_graph_variable node (genericId 337) must exist in impl graph')

// concreteId 必须按变量类型选 dict(int,vec3) 变体（官方 3046）
assert.equal(getter.concreteId?.nodeId, 3046, 'concreteId must be Dict_Int_Vec=3046')

// InParam[0]：变量名字面量
const namePin = getter.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.ok(namePin, 'InParam[0] (variable name) must exist')
assert.equal(namePin.type, 6, 'name pin type must be String=6')
assert.equal(namePin.value?.bString?.val, 'vels1')

// OutParam[0]：dict 完整编码（官方 golden 逐字段）
const outPin = getter.pins.find((pin) => pin.i1?.kind === 4 && pin.i1?.index === 0)
assert.ok(outPin, 'OutParam[0] must exist')
assert.equal(outPin.type, 27, 'OutParam type must be Dictionary=27')
const concrete = outPin.value?.bConcreteValue
assert.ok(concrete, 'OutParam value must be ConcreteBase-wrapped')
assert.equal(concrete.indexOfConcrete, 20, 'indexOfConcrete must be 20 (Dict<Int,Vec>)')
const inner = concrete.value
assert.equal(inner?.class, 10003, 'inner class must be MapBase=10003')
assert.equal(inner?.itemType?.type_server?.type, 27)
assert.equal(inner?.itemType?.type_server?.kind, 2, 'kind must be Pair=2')
assert.equal(inner?.itemType?.type_server?.items?.key, 3, 'key must be Integer=3')
assert.equal(inner?.itemType?.type_server?.items?.value, 12, 'value must be Vector=12')
assert.ok(inner?.bMap, 'bMap must exist')

console.log('composite get_node_graph_variable dict type inference: PASS')
console.log(
  `  concreteId=${getter.concreteId?.nodeId} outType=${outPin.type} indexOfConcrete=${concrete.indexOfConcrete}`
)
