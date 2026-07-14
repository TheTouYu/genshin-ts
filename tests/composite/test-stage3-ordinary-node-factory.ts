// @ts-nocheck
import assert from 'node:assert/strict'
import { Node } from '../../dist/src/compiler/gia_vendor.js'
import {
  createOrdinaryVendorNode,
  normalizeOrdinaryVendorPins
} from '../../dist/src/compiler/ir_to_gia_transform/ordinary_node_factory.js'

const input = {
  nodeId: 1,
  nodeType: 'addition',
  args: [{ type: 'float', value: 1.5 }, { type: 'float', value: 2.5 }],
  nodeIndex: 1,
  mode: 'server',
  concreteNodeId: 201,
  genericNodeId: 200
}
const fromFactory = createOrdinaryVendorNode(input)
const direct = new Node(1, 'server', 201, 200)
direct.pins.find((pin) => pin.kind === 3 && pin.index === 0)?.setVal(1.5)
direct.pins.find((pin) => pin.kind === 3 && pin.index === 1)?.setVal(2.5)
normalizeOrdinaryVendorPins(direct)

assert.deepEqual(fromFactory.pins, direct.pins)
assert.ok(fromFactory.pins.every((pin) => pin.type?.b !== 'Unk'))

console.log('PASS P2-W19 ordinary vendor node factory matches direct vendor literal/schema path')
