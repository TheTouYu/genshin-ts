// @ts-nocheck
/**
 * P0-W3: Vec setter connection 实验
 *
 * 目标：
 * 1. Vec3 producer → Set Node Graph Variable Vec variant (cid=334) 的连接
 * 2. 与真实 GIA 更新v、w impl 中 cid=334 setters 对照
 * 3. indexOfConcrete 值和 bVector/bConcreteValue 包裹方式
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

function dumpNodeSchema(node, label) {
  console.log(label + ' gid=' + node.GenericId + ' cid=' + node.ConcreteId)
  for (let i = 0; i < node.pins.length; i++) {
    const p = node.pins[i]
    const kindStr = p.kind === 3 ? 'In' : p.kind === 4 ? 'Out' : p.kind === 1 ? 'FlowIn' : p.kind === 2 ? 'FlowOut' : '?'
    let valStr = ''
    if (p.value != null) {
      if (typeof p.value === 'object') valStr = 'obj'
      else valStr = JSON.stringify(p.value)
    }
    console.log('  pin[' + i + '] ' + kindStr + '[' + p.index + ']' +
      ' iOC=' + p.indexOfConcrete +
      ' type=' + (p.type ? JSON.stringify(p.type) : 'null') +
      ' val=' + valStr)
  }
}

function dumpEncodedPins(encodedNode, label) {
  console.log(label + ' gid=' + encodedNode.genericId?.nodeId + ' cid=' + encodedNode.concreteId?.nodeId)
  for (const pin of encodedNode.pins) {
    const kind = pin.i1?.kind
    const idx = pin.i1?.index
    const type = pin.type
    const v = pin.value
    const conns = pin.connects ?? []

    if (kind === 3) {
      console.log('  InParam[' + idx + '] type=' + type +
        ' conns=' + conns.length +
        ' alreadySetVal=' + v?.alreadySetVal +
        (v?.bConcreteValue ? ' bConcreteIdx=' + v.bConcreteValue.indexOfConcrete +
          (v.bConcreteValue?.value?.bVector
            ? ' bVector=' + JSON.stringify(v.bConcreteValue.value.bVector.val)
            : v.bConcreteValue?.value?.bFloat
              ? ' bFloat=' + v.bConcreteValue.value.bFloat.val
              : v.bConcreteValue?.value?.bString
                ? ' bString=' + v.bConcreteValue.value.bString.val
                : ' {}')
          : '') +
        (v?.bString && !v?.bConcreteValue ? ' rawStr=' + v.bString.val : '') +
        (v?.bEnum ? ' bEnum=' + v.bEnum.val : '') +
        (conns.length > 0 ? ' [connected]' : '')
      )
    } else if (kind === 4) {
      console.log('  OutParam[' + idx + '] type=' + type)
    }
  }
}

// ====== 1. Vendor pin schema check ======
console.log('=== 1. Vendor pin schemas ===')
const vadd = new Node(0, 'server', 10)  // 3D Vector Addition (pure Vec)
dumpNodeSchema(vadd, '3D Vector Addition (10)')

const setterVec = new Node(1, 'server', 334)  // Set Node Graph Variable Vec
dumpNodeSchema(setterVec, 'Set Node Graph Variable Vec (334)')

// Also check int variant for comparison
const setterInt = new Node(2, 'server', 323)
dumpNodeSchema(setterInt, 'Set Node Graph Variable Int (323)')

// ====== 2. (Skip Vec3 literal — setVal only accepts number|string|boolean) =====

// ====== 3. (skip section number since we removed section 2) ======

// ====== 3. Graph with Vec connection ======
console.log('\n=== 3. Graph.connect: 3D Vec Addition → Setter Vec ===')
const graph = new Graph('server', 1000, 'experiment-vec3-connect', 1000)

// Producer: 3D Vector Addition (10, pure Vec)
const vecAdd = graph.add_node(10)
vecAdd.setPos(0, 0)

// Consumer: Set Node Graph Variable Vec (334)
const vecSetter = graph.add_node(334)
vecSetter.setPos(1, 1)
vecSetter.setVal(0, '额外压力')
vecSetter.setVal(2, false)

console.log('Pins before connect:')
dumpNodeSchema(vecAdd, '  VecAdd')
dumpNodeSchema(vecSetter, '  SetterVec')

// Connect: vecAdd OutParam[0] (Vec result) → setter InParam[1] (value)
console.log('\nConnecting: vecAdd out(4:0) → setter in(3:1)')
graph.connect(vecAdd, vecSetter, 0, 1)

// ====== 4. Encode with connections ======
console.log('\n=== 4. Node.encode() with connection context ===')
const encodedVecSetter = vecSetter.encode(
  ENCODE_OPTS,
  graph.get_connect_to(vecSetter),
  graph.flows.get(vecSetter),
  null
)
dumpEncodedPins(encodedVecSetter, 'Vec setter with connection')

const encodedVecAdd = vecAdd.encode(
  ENCODE_OPTS,
  graph.get_connect_to(vecAdd),
  graph.flows.get(vecAdd),
  null
)
dumpEncodedPins(encodedVecAdd, 'Vec add')

// ====== 5. Round-trip ======
console.log('\n=== 5. Graph.encode() → decode round-trip ===')
const encodedRoot = graph.encode(ENCODE_OPTS) as any
const { rootMessage } = loadGiaProto(PROTO_PATH)
const buffer = wrap_gia(rootMessage, encodedRoot)
const outputPath = join(tmpdir(), 'p0w3-vendor-vec3-connect.gia')
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
            (v.bConcreteValue?.value?.bVector
              ? ' bVector=' + JSON.stringify(v.bConcreteValue.value.bVector.val)
              : v.bConcreteValue?.value?.bFloat
                ? ' bFloat=' + v.bConcreteValue.value.bFloat.val
                : ' {}')
            : '') +
          (v?.bString ? ' rawStr=' + v.bString.val : '') +
          (v?.bEnum ? ' bEnum=' + v.bEnum.val : '') +
          (connsRaw.length > 0 ? ' [connected]' : '')
        )
      }
    }
  }
}

// ====== 6. Compare with real GIA ======
console.log('\n=== 6. Real GIA reference for Vec connected setters ===')
console.log('Real 更新v、w connected setters (n=10,11,12,13,14,21,32,33):')
console.log('  cid=334 (Vec variant), bcIdx=11')
console.log('  InParam[1] hasBC=Y bcIdx=11 (Vec), empty inner value')
console.log('  alreadySetVal=true')
console.log('')

// ====== Summary ======
console.log('=== SUMMARY ===')
console.log('')
console.log('Vendor Vec setter (334) schema:')
console.log('  inputs: Str, R<T> (Vec variant), Bol')
console.log('  OutParam: none')
console.log('  indexOfConcrete on InParam[1]:', setterVec.pins[1]?.indexOfConcrete)
console.log('')
console.log('Vendor Vec connection round-trip:')
const hasConn = decoded?.graph?.graph?.inner?.graph?.nodes?.[1]?.pins?.some(
  p => p.i1?.kind === 3 && (p.connects?.length ?? 0) > 0
)
console.log('  Connection preserved:', hasConn)
const bcIdx = setterVec.pins[1]?.indexOfConcrete
console.log('  bcIdx:', bcIdx, '(expected: 1 for set_node_graph_variable float variant)')
console.log('  (The real GIA uses bcIdx=11 for Vec variant, our vendor schema shows indexOfConcrete=' + bcIdx + ')')
console.log('')
if (bcIdx === 1) {
  console.log('NOTE: bcIdx=1 for vendor 334 differs from real GIA bcIdx=11')
  console.log('This is because the concrete index in the reflectMap is offset-based.')
  console.log('For node 323 reflectMap:')
  console.log('  position 0 = 323→Int, position 1 = 324→Flt, ..., position 11 = 334→Vec')
  console.log('The vendor setConcrete computes indexOfConcrete from the reflectMap position.')
  console.log('Need to verify: is bcIdx=1 (position in reflectMap) or bcIdx=11 (absolute index) correct?')
}
