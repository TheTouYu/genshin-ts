import assert from 'node:assert/strict'

import { buildCompositeAccessories } from '../../src/compiler/ir_to_gia_transform/composite.js'
import type { CompositeDefIR } from '../../src/runtime/IR.js'

const def: CompositeDefIR = {
  name: 'vec3-local-variable-impl',
  id: 1610700997,
  type: 'composite',
  inflows: [],
  outflows: [],
  inputs: [],
  outputs: [
    {
      name: 'value',
      visible: true,
      index: 0,
      type: 'vec3',
      pinIndex: 200
    }
  ],
  implNodes: [
    {
      id: 1,
      type: 'get_local_variable',
      args: [{ type: 'vec3', value: [0, 0, 0] }]
    }
  ],
  implEdges: {},
  compositePins: [
    {
      outerPinKind: 4,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: 4,
      innerPinIndex: 1
    }
  ]
}

const accessories = buildCompositeAccessories(def)
const implGraph = accessories.find((unit) => unit.which === 9)?.graph?.inner?.graph
assert.ok(implGraph)

const localVariableNode = implGraph.nodes.find((node) => node.genericId?.nodeId === 18)
assert.ok(localVariableNode)
assert.equal(localVariableNode.concreteId?.nodeId, 2660)

const inputPin = localVariableNode.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
assert.ok(inputPin)
assert.equal(inputPin.type, 12)

const valuePin = localVariableNode.pins.find((pin) => pin.i1?.kind === 4 && pin.i1?.index === 1)
assert.ok(valuePin)
assert.equal(valuePin.type, 12)

console.log('PASS composite impl vec3 local variable concrete type')
