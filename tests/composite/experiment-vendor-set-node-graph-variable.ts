// @ts-nocheck
/**
 * P0-W1: Vendor Node(324) float literal 实验
 *
 * 目标：直接构造 vendor Node(324)，比较构造态、Node.encode() 后
 * 与 Graph.encode() 中 float literal setter 的 identity 和 pins。
 * 与真实 更新v、w impl n[4] 建立逐字段对照。
 */

import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Graph, Node, Pin, EncodeOptions } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/graph.js'
import {
  float_pin_body,
  float_value,
  wrapped_pin_value,
  pin_body
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/basic.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import { wrap_gia } from '../../src/compiler/gia_vendor.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const ENCODE_OPTS = new EncodeOptions(false)

console.log('=== REAL GIA REFERENCE (更新v、w impl n=4) ===')
console.log('gid=323 cid=324')
console.log('InParam[0] type=6 rawStr=额外压力')
console.log('InParam[1] type=5 bConcreteIdx=1 bFloat.val=0')
console.log('InParam[2] type=4 bEnum=0')
console.log('')

// ====== 1. Vendor Node(324) standalone ======
console.log('=== 1. Vendor Node(324) standalone ===')
const concreteNode = new Node(0, 'server', 324)
concreteNode.setPos(1, 1)
// setVal in vendor expects AnyType (number|string|boolean)
concreteNode.setVal(0, '额外压力')
concreteNode.setVal(1, 0)
concreteNode.setVal(2, false)

console.log('After construction:')
console.log('  ConcreteId:', concreteNode.ConcreteId)
console.log('  GenericId:', concreteNode.GenericId)
console.log('  NodeIndex:', concreteNode.NodeIndex)
console.log('  Pins:')
for (let i = 0; i < concreteNode.pins.length; i++) {
  const p = concreteNode.pins[i]
  console.log('    [' + i + '] kind=' + p.kind + ' index=' + p.index +
    ' type=' + (p.type ? JSON.stringify(p.type) : 'null') +
    ' indexOfConcrete=' + p.indexOfConcrete +
    ' value=' + JSON.stringify(p.value))
}

const encodedNode = concreteNode.encode(ENCODE_OPTS)
console.log('\nAfter Node.encode():')
console.log('  generic_id:', encodedNode.genericId?.nodeId)
console.log('  concrete_id:', encodedNode.concreteId?.nodeId)
for (const pin of encodedNode.pins) {
  if (pin.i1?.kind === 3) {
    const v = pin.value
    const idx = pin.i1?.index
    const type = pin.type
    console.log('  InParam[' + idx + '] type=' + type +
      ' alreadySetVal=' + v?.alreadySetVal +
      ' class=' + v?.class +
      (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
        ' bFloat.val=' + JSON.stringify(v.bConcreteValue?.value?.bFloat?.val) +
        ' bString.val=' + JSON.stringify(v.bConcreteValue?.value?.bString?.val)
        : '') +
      (v?.bFloat && !v?.bConcreteValue ? ' rawFloat=' + v.bFloat.val : '') +
      (v?.bString && !v?.bConcreteValue ? ' rawStr=' + v.bString.val : '') +
      (v?.bEnum ? ' bEnum=' + v.bEnum.val : '')
    )
  }
}

// ====== 2. Compare: Node(323) generic ======
// Note: generic-only Node(323) cannot use setVal because pins are not
// initialized without setConcrete. We set pins directly instead.
console.log('\n=== 2. Vendor Node(323) generic ===')
const genericNode = new Node(1, 'server', undefined, 323)
genericNode.setPos(2, 2)
// Generic node has no pins yet (setConcrete was not called), so we
// must add them manually to probe the pin schema
console.log('Pins after construction (length=' + genericNode.pins.length + '):')
console.log('  (generic-only constructor does NOT call setConcrete, so pins array is empty)')

// Show what the internal record defines
console.log('\nGeneric 323 record inputs count:', genericNode['record']?.inputs?.length)
console.log('Generic 323 record reflectMap:', genericNode['record']?.reflectMap?.length)

// Manually set pins to match what setConcrete would do
const r = genericNode['record']
if (r) {
  console.log('\nInputs from generic record:')
  for (let i = 0; i < (r.inputs?.length ?? 0); i++) {
    const inp = r.inputs[i]
    console.log('  [' + i + '] type={"t":"' + inp.type + '","b":"' + inp.name + '"}')
  }
  console.log('Outputs from generic record:')
  for (let i = 0; i < (r.outputs?.length ?? 0); i++) {
    const out = r.outputs[i]
    console.log('  [' + i + '] type={"t":"' + out.type + '","b":"' + out.name + '"}')
  }
  if (r.reflectMap) {
    console.log('reflectMap entries:')
    for (const entry of r.reflectMap) {
      console.log('  ' + entry[0] + ' -> S<T:' + entry[1] + '>')
    }
  }
}

// ====== 3. Node(324) inside Graph ======
console.log('\n=== 3. Node(324) inside Graph.encode() ===')
const graph = new Graph('server', 1000, 'experiment-graph', 1000)
const graphNode = graph.add_node(324)
graphNode.setPos(1, 1)
graphNode.setVal(0, '额外压力')
graphNode.setVal(1, 0)
graphNode.setVal(2, false)

const encodedGraph = graph.encode(ENCODE_OPTS) as any
const graphNodes = encodedGraph.graph?.graph?.inner?.graph?.nodes
if (graphNodes && graphNodes.length > 0) {
  const egn = graphNodes[0]
  console.log('  generic_id:', egn.genericId?.nodeId)
  console.log('  concrete_id:', egn.concreteId?.nodeId)
  console.log('  nodeIndex:', egn.nodeIndex)
  for (const pin of egn.pins) {
    if (pin.i1?.kind === 3) {
      const v = pin.value
      const idx = pin.i1?.index
      const type = pin.type
      console.log('  InParam[' + idx + '] type=' + type +
        ' alreadySetVal=' + v?.alreadySetVal +
        ' class=' + v?.class +
        (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
          ' bFloat.val=' + JSON.stringify(v.bConcreteValue?.value?.bFloat?.val)
          : '') +
        (v?.bFloat && !v?.bConcreteValue ? ' rawFloat=' + v.bFloat.val : '') +
        (v?.bString && !v?.bConcreteValue ? ' rawStr=' + v.bString.val : '') +
        (v?.bEnum ? ' bEnum=' + v.bEnum.val : '')
      )
    }
  }
}

// ====== 4. Key comparisons ======
console.log('\n=== 4. Key comparisons ===')
console.log('Concrete(324) concreteId:', concreteNode.ConcreteId)
console.log('GraphNode(324) concreteId:', graphNode.ConcreteId)

const cIn1 = concreteNode.pins.find(p => p.kind === 3 && p.index === 1)
console.log('\nconcrete(324) InParam[1] indexOfConcrete:', cIn1?.indexOfConcrete)

// ====== 5. Encode to GIA and decode back ======
console.log('\n=== 5. Round-trip: encode->decode ===')
const testGraph = new Graph('server', 2000, 'experiment-graph-2', 1000)
const n1 = testGraph.add_node(324)
n1.setPos(1, 1)
n1.setVal(0, '额外压力')
n1.setVal(1, 0)
n1.setVal(2, false)

const n2 = testGraph.add_node(323)
n2.setPos(2, 2)
n2.setVal(0, '额外压力')
n2.setVal(1, 0)
n2.setVal(2, false)

const encodedRoot = testGraph.encode(ENCODE_OPTS) as any
const { rootMessage } = loadGiaProto(PROTO_PATH)
const buffer = wrap_gia(rootMessage, encodedRoot)
const outputPath = join(tmpdir(), 'p0w1-vendor-float-setter.gia')
writeFileSync(outputPath, Buffer.from(buffer))
console.log('Written to:', outputPath)

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const graph2 = decoded.graph?.graph?.inner?.graph
if (graph2?.nodes) {
  for (const node of graph2.nodes) {
    const gid = node.genericId?.nodeId
    const cid = node.concreteId?.nodeId ?? 'N/A'
    console.log('\nNode nodeIndex=' + node.nodeIndex + ' genericId=' + gid + ' concreteId=' + cid)
    for (const pin of node.pins) {
      if (pin.i1?.kind === 3) {
        const v = pin.value
        const idx = pin.i1?.index
        const type = pin.type
        console.log('  InParam[' + idx + '] type=' + type +
          ' alreadySetVal=' + v?.alreadySetVal +
          ' class=' + v?.class +
          (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
            ' bFloat.val=' + JSON.stringify(v.bConcreteValue?.value?.bFloat?.val)
            : '') +
          (v?.bFloat && !v?.bConcreteValue ? ' rawFloat=' + v.bFloat.val : '') +
          (v?.bString && !v?.bConcreteValue ? ' rawStr=' + v.bString.val : '') +
          (v?.bEnum ? ' bEnum=' + v.bEnum.val : '')
        )
      }
    }
  }
}

// ====== SUMMARY ======
console.log('\n========== SUMMARY ==========')
console.log('')
console.log('Real GIA 更新v、w impl n[4]:')
console.log('  gid=323 cid=324')
console.log('  InParam[0] type=6 rawStr=额外压力')
console.log('  InParam[1] type=5 bConcreteIdx=1 bFloat.val=0')
console.log('  InParam[2] type=4 bEnum=0')
console.log('')

const encCid = encodedNode.concreteId?.nodeId
const encGid = encodedNode.genericId?.nodeId
const encPin1 = encodedNode.pins.find(p => p.i1?.kind === 3 && p.i1?.index === 1)
const encV1 = encPin1?.value
const hasBC = encV1?.bConcreteValue != null
const bcIdx = hasBC ? encV1.bConcreteValue.indexOfConcrete : null

console.log('Vendor Node(324) encode():')
console.log('  gid=' + encGid + ' cid=' + encCid)
console.log('  InParam[1] bConcreteValue=' + hasBC + ' indexOfConcrete=' + bcIdx)
console.log('  Matches real GIA: cid=' + (encCid === 324) + ' bConcrete=' + hasBC + ' idx=' + (bcIdx === 1))
console.log('')

console.log('')
console.log('CONCLUSION:')
if (encCid === 324 && hasBC && bcIdx === 1) {
  console.log('Vendor Node(324) PRODUCES the correct concrete ID, bConcreteValue,')
  console.log('and indexOfConcrete matching the real GIA.')
  console.log('Node(323) alone does NOT produce concrete ID or bConcreteValue.')
} else {
  console.log('MISMATCH: See details above.')
}
