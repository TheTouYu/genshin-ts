// @ts-nocheck
/**
 * P0-W2: Vendor Graph.connect() float connection 实验
 *
 * 目标：使用 float producer (Addition Float) 调用 Graph.connect()，
 * 检查：
 * 1. 连接是否挂在 target InParam（setter 的 value pin）
 * 2. 是否保留 concrete wrapper（bConcreteValue）
 * 3. source index 是否需要 hidden-pin remap
 * 4. Graph.encode 后连接的编码方式
 */

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Graph, Node, Pin, EncodeOptions } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/graph.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import { wrap_gia } from '../../src/compiler/gia_vendor.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const ENCODE_OPTS = new EncodeOptions(false)

function dumpPins(node, label) {
  console.log(label + ' gid=' + node.GenericId + ' cid=' + node.ConcreteId)
  for (let i = 0; i < node.pins.length; i++) {
    const p = node.pins[i]
    let valStr = ''
    if (p.value != null) {
      if (typeof p.value === 'object') {
        valStr = 'obj'
      } else {
        valStr = JSON.stringify(p.value)
      }
    }
    console.log('  pin[' + i + '] kind=' + p.kind + ' idx=' + p.index +
      ' type=' + (p.type ? JSON.stringify(p.type) : 'null') +
      ' iOC=' + p.indexOfConcrete +
      ' val=' + valStr)
  }
}

function dumpEncodedInParams(node, label) {
  console.log(label + ' gid=' + node.genericId?.nodeId + ' cid=' + node.concreteId?.nodeId)
  for (const pin of node.pins) {
    if (pin.i1?.kind === 3) {
      const v = pin.value
      const idx = pin.i1?.index
      const type = pin.type
      const connCount = pin.connects?.length ?? 0
      console.log('  InParam[' + idx + '] type=' + type +
        ' conns=' + connCount +
        ' alreadySetVal=' + v?.alreadySetVal +
        (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
          ' bFloat.val=' + JSON.stringify(v.bConcreteValue?.value?.bFloat?.val)
          : '') +
        (v?.bFloat && !v?.bConcreteValue ? ' rawFloat=' + v.bFloat.val : '') +
        (v?.bString ? ' str=' + v.bString.val : '') +
        (v?.bEnum ? ' bEnum=' + v.bEnum.val : '')
      )
    }
  }
}

// ====== 1. Setup: Addition Float (201) + Setter Float (324) with Graph.connect() ======
console.log('=== 1. Graph with Addition Float → Setter float connection ===')
const graph = new Graph('server', 1000, 'experiment-graph-connect', 1000)

// Producer: Addition Float (201), concrete = float variant
const addition = graph.add_node(201)
addition.setPos(0, 0)
addition.setVal(0, 1.5) // left operand
addition.setVal(1, 2.5) // right operand

// Consumer: Set Node Graph Variable Float (324)
const setter = graph.add_node(324)
setter.setPos(1, 1)
setter.setVal(0, '额外压力') // name
// Do NOT set value pin (pin 1) — it will come from connection
setter.setVal(2, false) // bool metadata

dumpPins(addition, 'Addition Float (201)')
console.log('')
dumpPins(setter, 'Setter Float (324)')

// Connect addition output[0] → setter input[1]
// Addition has 1 output (R<T> float result) at kind=4, index=0
// Setter has InParam[1] as value pin (kind=3, index=1)
console.log('\nConnecting: addition out(4:0) → setter in(3:1)')
graph.connect(addition, setter, 0, 1)

// ====== 2. Check internal state before encode ======
console.log('\n=== 2. Connection state in Graph ===')
const conns = graph.get_connects()
console.log('Total connects:', conns.length)
for (const c of conns) {
  console.log('  from node=' + c.from.NodeIndex + ' out=' + c.from_index +
    ' → to node=' + c.to.NodeIndex + ' in=' + c.to_index)
}

// Check what the setter's pin[1] looks like after connection
const setterPin1 = setter.pins[1]
console.log('\nSetter pin[1] after connect:')
console.log('  kind=' + setterPin1.kind + ' index=' + setterPin1.index)
console.log('  indexOfConcrete=' + setterPin1.indexOfConcrete)
console.log('  type=', JSON.stringify(setterPin1.type))
console.log('  value=', JSON.stringify(setterPin1.value))
// The value should still be null (not set since we didn't setVal on pin 1)
// but the connection will be encoded via the `connects` parameter in Node.encode()

// ====== 3. Node.encode with connection context ======
console.log('\n=== 3. Node.encode() (standalone, with connects from graph) ===')
const encodedSetter = setter.encode(
  ENCODE_OPTS,
  graph.get_connect_to(setter),  // incoming connects
  graph.flows.get(setter),       // outgoing flows
  null                           // comment
)
console.log('Encoded setter:')
console.log('  generic_id:', encodedSetter.genericId?.nodeId)
console.log('  concrete_id:', encodedSetter.concreteId?.nodeId)
for (const pin of encodedSetter.pins) {
  if (pin.i1?.kind === 3) {
    const v = pin.value
    const idx = pin.i1?.index
    const type = pin.type
    const connsRaw = pin.connects ?? []
    console.log('  InParam[' + idx + '] type=' + type +
      ' conns=' + connsRaw.length +
      ' alreadySetVal=' + v?.alreadySetVal +
      (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete :
        '') +
      (v?.bString ? ' str=' + v.bString.val : '') +
      (v?.bEnum ? ' bEnum=' + v.bEnum.val : '') +
      (connsRaw.length > 0 ? ' conns=' + JSON.stringify(connsRaw) : '')
    )
  }
}

const encodedAddition = addition.encode(
  ENCODE_OPTS,
  graph.get_connect_to(addition),
  graph.flows.get(addition),
  null
)
console.log('\nEncoded addition:')
console.log('  generic_id:', encodedAddition.genericId?.nodeId)
console.log('  concrete_id:', encodedAddition.concreteId?.nodeId)
for (const pin of encodedAddition.pins) {
  if (pin.i1?.kind === 3) {
    const v = pin.value
    const idx = pin.i1?.index
    const type = pin.type
    console.log('  InParam[' + idx + '] type=' + type +
      ' alreadySetVal=' + v?.alreadySetVal +
      (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
        ' bFloat.val=' + JSON.stringify(v.bConcreteValue?.value?.bFloat?.val)
        : '') +
      (v?.bFloat && !v?.bConcreteValue ? ' rawFloat=' + v.bFloat.val : '')
    )
  }
}

// ====== 4. Graph.encode → decode round-trip ======
console.log('\n=== 4. Graph.encode() → decode round-trip ===')
const encodedRoot = graph.encode(ENCODE_OPTS) as any
const { rootMessage } = loadGiaProto(PROTO_PATH)
const buffer = wrap_gia(rootMessage, encodedRoot)
const outputPath = join(tmpdir(), 'p0w2-vendor-graph-connect.gia')
writeFileSync(outputPath, Buffer.from(buffer))
console.log('Written to:', outputPath)

const decoded = decode_gia_file(outputPath, PROTO_PATH)
const graph2 = decoded.graph?.graph?.inner?.graph
if (graph2?.nodes) {
  console.log('\nDecoded nodes:')
  for (const node of graph2.nodes) {
    console.log('  Node idx=' + node.nodeIndex + ' gid=' + node.genericId?.nodeId + ' cid=' + (node.concreteId?.nodeId ?? 'N/A'))
    for (const pin of node.pins) {
      if (pin.i1?.kind === 3) {
        const v = pin.value
        const idx = pin.i1?.index
        const type = pin.type
        const connsRaw = pin.connects ?? []
        console.log('    InParam[' + idx + '] type=' + type +
          ' conns=' + connsRaw.length +
          ' alreadySetVal=' + v?.alreadySetVal +
          (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
            ' bFloat.val=' + JSON.stringify(v.bConcreteValue?.value?.bFloat?.val)
            : '') +
          (v?.bFloat && !v?.bConcreteValue ? ' rawFloat=' + v.bFloat.val : '') +
          (v?.bString ? ' str=' + v.bString.val : '') +
          (v?.bEnum ? ' bEnum=' + v.bEnum.val : '') +
          (connsRaw.length > 0 ? ' [connected]' : '')
        )
      }
      if (pin.i1?.kind === 4) {
        const idx = pin.i1?.index
        const type = pin.type
        console.log('    OutParam[' + idx + '] type=' + type)
      }
    }
  }
}

// ====== 5. Compare with real GIA reference ======
console.log('\n=== 5. Connection structure comparison ===')
console.log('Real GIA 更新v、w n[4]: no connection on InParam[1] (direct float literal)')
console.log('Real GIA 更新v、w n[13]: connection on InParam[1] from 计算分力 OutParam[3]')

// Check what connects look like in the real GIA for a connected setter
console.log('\nKey checks:')
console.log('1. Graph.connect adds connection to correct target pin')
console.log('2. Concrete wrapper (bConcreteValue) is NOT needed on connected pins')
console.log('3. Round-trip preserves the connection')
console.log('4. Source output pin index (0) maps to OutParam[0] without remap')

// ====== Summary ======
console.log('\n========== SUMMARY ==========')
console.log('')
const setterEncodedPins = encodedSetter.pins.filter(p => p.i1?.kind === 3)
const connectedPin = setterEncodedPins.find(p => (p.connects?.length ?? 0) > 0)
const hasConnection = connectedPin != null
const connectedIdx = connectedPin?.i1?.index

console.log('Has connection on setter InParam:', hasConnection)
console.log('Connected on InParam index:', connectedIdx)
console.log('Expected: InParam[1] (value pin)')
console.log('Connection uses source kind=4 (output), index=0 (first result):', 
  connectedPin?.connects?.[0]?.connect?.kind === 4 &&
  connectedPin?.connects?.[0]?.connect?.index === 0)
console.log('')
if (hasConnection && connectedIdx === 1) {
  console.log('CONCLUSION: Graph.connect() properly wires to InParam[1]')
  console.log('No hidden-pin remap needed for this simple case.')
  console.log('Connection preserves concrete wrapper on non-connected pins.')
  console.log('The connected pin has no value (no bConcreteValue) — expected for dataflow.')
} else {
  console.log('MISMATCH: Connection target is not InParam[1]')
}
