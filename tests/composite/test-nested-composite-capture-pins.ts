// @ts-nocheck

import assert from 'node:assert/strict'

import { buildCompositeAccessories } from '../../src/compiler/ir_to_gia_transform/composite.js'
import type { CompositeDefIR } from '../../src/runtime/IR.js'

const childId = 1610700998
const parentInputPinIndex = 543
const childCaptureInputPinIndex = 439
const childLiteralInputPinIndex = 440

const child: CompositeDefIR = {
  name: 'nested-capture-child',
  id: childId,
  type: 'composite',
  inflows: [],
  outflows: [],
  inputs: [
    {
      name: 'capturedInterval',
      visible: true,
      index: 0,
      type: 'float',
      pinIndex: childCaptureInputPinIndex
    },
    {
      name: 'literalInterval',
      visible: true,
      index: 1,
      type: 'float',
      pinIndex: childLiteralInputPinIndex
    }
  ],
  outputs: [],
  implNodes: [],
  implEdges: {},
  compositePins: []
}

const parent: CompositeDefIR = {
  name: 'nested-capture-parent',
  id: 1610700999,
  type: 'composite',
  inflows: [],
  outflows: [],
  inputs: [
    {
      name: 'interval',
      visible: true,
      index: 0,
      type: 'float',
      pinIndex: parentInputPinIndex
    }
  ],
  outputs: [],
  implNodes: [
    {
      id: 1,
      type: '__composite_call__',
      args: [
        { type: 'int', value: childId },
        { type: 'float', value: 0, capture: true }
      ]
    },
    {
      id: 2,
      type: '__composite_call__',
      args: [
        { type: 'int', value: childId },
        { type: 'float', value: 0, capture: true },
        { type: 'float', value: 1 }
      ]
    }
  ],
  implEdges: {},
  compositePins: [
    {
      outerPinKind: 3,
      outerPinIndex: 0,
      innerNodeId: 1,
      innerPinKind: 3,
      innerPinIndex: 0
    },
    {
      outerPinKind: 3,
      outerPinIndex: 0,
      innerNodeId: 2,
      innerPinKind: 3,
      innerPinIndex: 0
    }
  ]
}

const childById = new Map([[child.id, child]])
const accessories = buildCompositeAccessories(parent, childById)
const implGraph = accessories.find((unit) => unit.which === 9)?.graph?.inner?.graph
assert.ok(implGraph)

const nestedCalls = implGraph.nodes.filter(
  (node) => node.genericId?.kind === 22001 && node.genericId?.nodeId === child.id
)
assert.equal(nestedCalls.length, 2)

const capturedOnlyCall = nestedCalls.find((node) => node.pins.length === 0)
assert.ok(capturedOnlyCall, 'captured nested input must not emit a physical InParam pin')

const mixedCall = nestedCalls.find((node) => node.pins.length > 0)
assert.ok(mixedCall)
assert.equal(
  mixedCall.pins.some((pin) => pin.i1?.kind === 3 && pin.i1?.index === 0),
  false,
  'captured nested input must preserve its physical pin index hole'
)
const literalPin = mixedCall.pins.find((pin) => pin.i1?.kind === 3 && pin.i1?.index === 1)
assert.ok(literalPin, 'non-capture input after a captured input must remain at InParam[1]')
assert.equal(literalPin.compositePinIndex, childLiteralInputPinIndex)

const captureRoutes = implGraph.compositePins.filter(
  (pin) => pin.outerPin?.kind === 3 && pin.outerPin?.index === 0
)
assert.equal(captureRoutes.length, 2)
for (const nestedCall of nestedCalls) {
  const captureRoute = captureRoutes.find((pin) => pin.innerNodeId === nestedCall.nodeIndex)
  assert.ok(captureRoute, 'captured nested input must remain routed through compositePins')
  assert.equal(captureRoute.innerPin?.kind, 3)
  assert.equal(captureRoute.innerPin?.index, 0)
}

console.log('PASS nested composite capture input pins')
