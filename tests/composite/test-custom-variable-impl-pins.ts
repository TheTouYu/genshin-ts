// @ts-nocheck
// 2026-08-14 更新：断言从「captured InParam 不编码」改为「已配置 Variant capture 落盘」——
// 差分轮 9b 终裁（编辑器 equal cid=370 提升落盘）；未配置 Variant 不落盘见轮 9。

import assert from 'node:assert/strict'

import { buildCompositeAccessories } from '../../src/compiler/ir_to_gia_transform/composite.js'
import type { CompositeDefIR } from '../../src/runtime/IR.js'

const def: CompositeDefIR = {
  name: 'custom-variable-pin-types',
  id: 1610700999,
  type: 'composite',
  inflows: [],
  outflows: [],
  inputs: [{ name: 'target', visible: true, index: 0, type: 'entity', pinIndex: 100 }],
  outputs: [],
  implNodes: [
    {
      id: 1,
      type: 'get_custom_variable',
      args: [
        { type: 'entity', value: null, capture: true },
        { type: 'str', value: 'float-value' }
      ]
    },
    {
      id: 2,
      type: 'get_custom_variable',
      args: [
        { type: 'entity', value: null, capture: true },
        { type: 'str', value: 'guid-value' }
      ]
    },
    {
      id: 3,
      type: 'get_custom_variable',
      args: [
        { type: 'entity', value: null, capture: true },
        { type: 'str', value: 'int-value' }
      ]
    },
    {
      id: 4,
      type: 'addition',
      args: [
        { type: 'conn', value: { node_id: 1, index: 0, type: 'float' } },
        { type: 'float', value: 1 }
      ]
    },
    {
      id: 5,
      type: 'query_entity_by_guid',
      args: [{ type: 'conn', value: { node_id: 2, index: 0, type: 'guid' } }]
    },
    {
      id: 6,
      type: 'data_type_conversion_float',
      args: [{ type: 'conn', value: { node_id: 3, index: 0, type: 'int' } }]
    }
  ],
  implEdges: {},
  compositePins: [
    { outerPinKind: 3, outerPinIndex: 0, innerNodeId: 1, innerPinKind: 3, innerPinIndex: 0 },
    { outerPinKind: 3, outerPinIndex: 0, innerNodeId: 2, innerPinKind: 3, innerPinIndex: 0 },
    { outerPinKind: 3, outerPinIndex: 0, innerNodeId: 3, innerPinKind: 3, innerPinIndex: 0 }
  ]
}

const accessories = buildCompositeAccessories(def)
const implGraph = accessories.find((unit) => unit.which === 9)?.graph?.inner?.graph
assert.ok(implGraph)

const getVariableNodes = implGraph.nodes.filter((node) => node.genericId?.nodeId === 50)
assert.equal(getVariableNodes.length, 3)

const nodeByName = new Map(
  getVariableNodes.map((node) => [
    node.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 1)?.value?.bString?.val,
    node
  ])
)

const expected = {
  'float-value': { concreteNodeId: 54, type: 5, concreteIndex: 4, innerClass: 4 },
  'guid-value': { concreteNodeId: 53, type: 2, concreteIndex: 3, innerClass: 1 },
  'int-value': { concreteNodeId: 50, type: 3, concreteIndex: 0, innerClass: 2 }
}

for (const [name, expectedPin] of Object.entries(expected)) {
  const node = nodeByName.get(name)
  assert.ok(node, `missing ${name} at InParam[1]`)
  // 2026-08-14 轮 9b 差分终裁：已配置 Variant 的 capture 提升落物理 pin（默认值形态）——
  // 编辑器 equal（cid 370）提升输入落盘（ioc=5）；未配置 Variant 不落盘（轮 9 get_custom_variable）
  const capturedPin = node.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
  assert.ok(capturedPin, `${name} must encode captured InParam[0] (configured Variant)`)
  assert.equal(capturedPin.type, 1, 'captured InParam[0] type must be entity')
  assert.equal(node.concreteId?.nodeId, expectedPin.concreteNodeId)

  const output = node.pins.find((pin) => pin.i1?.kind === 4 && pin.i1?.index === 0)
  assert.equal(output?.type, expectedPin.type)
  assert.equal(output?.value?.class, 10000)
  assert.equal(output?.value?.bConcreteValue?.indexOfConcrete ?? 0, expectedPin.concreteIndex)
  assert.equal(output?.value?.bConcreteValue?.value?.class, expectedPin.innerClass)
}

console.log('PASS custom-variable impl pin indices and concrete output types')
