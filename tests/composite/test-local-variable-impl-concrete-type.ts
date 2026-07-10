import assert from 'node:assert/strict'

import { buildCompositeAccessories } from '../../src/compiler/ir_to_gia_transform/composite.js'
import type { CompositeDefIR } from '../../src/runtime/IR.js'

const def: CompositeDefIR = {
  name: '局部变量操作',
  id: 1610612745,
  type: 'composite',
  inflows: [{ name: '', visible: true, index: 0, pinIndex: 56 }],
  outflows: [{ name: '', visible: true, index: 0, pinIndex: 57 }],
  inputs: [],
  outputs: [
    { name: '值', visible: true, index: 0, type: 'vec3', pinIndex: 58 },
    { name: '局部变量', visible: true, index: 1, type: 'local_variable', pinIndex: 59 }
  ],
  implNodes: [
    {
      id: 1,
      type: 'get_local_variable',
      args: [{ type: 'vec3', value: [2, 1, 8.8] }]
    },
    {
      id: 2,
      type: 'set_local_variable',
      args: [
        { type: 'conn', value: { node_id: 1, index: 0, type: 'local_variable' } },
        { type: 'conn', value: { node_id: 1, index: 1, type: 'vec3' } }
      ]
    }
  ],
  implEdges: {},
  compositePins: [
    {
      outerPinKind: 1,
      outerPinIndex: 0,
      innerNodeId: 2,
      innerPinKind: 1,
      innerPinIndex: 0
    },
    {
      outerPinKind: 2,
      outerPinIndex: 0,
      innerNodeId: 2,
      innerPinKind: 2,
      innerPinIndex: 0
    },
    {
      outerPinKind: 4,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: 4,
      innerPinIndex: 1
    },
    {
      outerPinKind: 4,
      outerPinIndex: 1,
      innerNodeId: 1,
      innerPinKind: 4,
      innerPinIndex: 0
    }
  ]
}

const accessories = buildCompositeAccessories(def)
const compositeDef = accessories.find((unit) => unit.which === 12)?.compositeDef?.inner?.def
const implGraph = accessories.find((unit) => unit.which === 9)?.graph?.inner?.graph
assert.ok(compositeDef)
assert.ok(implGraph)

assert.equal(compositeDef.outputs[0].type?.type1, 12)
assert.equal(compositeDef.outputs[1].type?.type1, 16)

const getter = implGraph.nodes.find((node) => node.genericId?.nodeId === 18)
const setter = implGraph.nodes.find((node) => node.genericId?.nodeId === 19)
assert.ok(getter)
assert.ok(setter)
assert.equal(getter.concreteId?.nodeId, 2660)
assert.equal(setter.concreteId?.nodeId, 2678)

const getterInput = getter.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
const getterValue = getter.pins.find((pin) => pin.i1?.kind === 4 && pin.i1?.index === 1)
assert.ok(getterInput)
assert.ok(getterValue)
assert.equal(getter.pins.some((pin) => pin.i1?.kind === 4 && pin.i1?.index === 0), false)
assert.equal(getterInput.type, 12)
assert.equal(getterInput.value?.bConcreteValue?.indexOfConcrete, 6)
assert.equal(getterInput.value?.bConcreteValue?.value?.class, 7)
assert.deepEqual(getterInput.value?.bConcreteValue?.value?.bVector?.val, { x: 2, y: 1, z: 8.8 })
assert.equal(getterValue.type, 12)
assert.equal(getterValue.value?.bConcreteValue?.indexOfConcrete, 6)
assert.equal(getterValue.value?.bConcreteValue?.value?.class, 7)

const setterHandle = setter.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0)
const setterValue = setter.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 1)
assert.ok(setterHandle)
assert.ok(setterValue)
assert.equal(setterHandle.type, 16)
assert.equal(setterHandle.value?.bConcreteValue, undefined)
assert.deepEqual(Object.keys(setterHandle.value ?? {}), [])
assert.equal(setterValue.type, 12)
assert.equal(setterValue.value?.bConcreteValue?.indexOfConcrete, 6)
assert.equal(setterValue.value?.bConcreteValue?.value?.class, 7)
assert.deepEqual(setterHandle.connects, [
  {
    id: getter.nodeIndex,
    connect: { kind: 4, index: 0 },
    connect2: { kind: 4, index: 0 }
  }
])
assert.deepEqual(setterValue.connects, [
  {
    id: getter.nodeIndex,
    connect: { kind: 4, index: 1 },
    connect2: { kind: 4, index: 1 }
  }
])

console.log('PASS composite impl vec3 local variable matches real GIA pin encoding')
