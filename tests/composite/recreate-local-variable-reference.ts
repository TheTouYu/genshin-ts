import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_DIR = './tests/composite/output'
const GRAPH_ID = 1073741826

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const localVariableOperation = g.defineComposite('局部变量操作', {
  inflows: [{ name: '', pinIndex: 56 }],
  outflows: [{ name: '', pinIndex: 57 }],
  outputs: {
    值: { type: 'vec3', pinIndex: 58 },
    局部变量: { type: 'local_variable', pinIndex: 59 }
  },
  build(_args, f) {
    const local = f.getLocalVariable([2, 1, 8.8])
    const setter = f.node('set_local_variable', [local.localVariable, local.value])

    f.link(f.entry(), 0, setter)
    f.outflow('完成', setter)

    return { 值: local.value, 局部变量: local.localVariable }
  }
})

g.server({ mode: 'beyond', type: 'entity', id: GRAPH_ID, name: '新建节点图_1', prefix: false }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    const local = f.getLocalVariable([2, 1, 8.8])
    const setter = f.node('set_local_variable', [local.localVariable, local.value])
    const composite = f.declareDetached(localVariableOperation, {})

    f.link(f.entry(), 0, setter)
    f.link(f.entry(), 0, composite)
  }
)

const document = buildServerGraphRegistriesIRDocuments()[0]
const bytes = irToGia(document, {
  graphId: GRAPH_ID,
  name: '新建节点图_1',
  protoPath: PROTO_PATH
})
const giaPath = `${OUT_DIR}/recreate-local-variable-reference.gia`
const jsonPath = `${OUT_DIR}/recreate-local-variable-reference.decoded.json`
writeFileSync(giaPath, Buffer.from(bytes))

const decoded = decode_gia_file(giaPath, PROTO_PATH)
writeFileSync(jsonPath, `${JSON.stringify(decoded, null, 2)}\n`)

function summarizeRoute(label: string, nodes: any[]) {
  console.log(`\n${label}`)
  for (const node of nodes.filter((candidate) => [18, 19].includes(candidate.genericId?.nodeId))) {
    const pins = (node.pins ?? []).map((pin: any) => ({
      kind: pin.i1?.kind,
      index: pin.i1?.index,
      type: pin.type,
      concreteIndex: pin.value?.bConcreteValue?.indexOfConcrete,
      valueClass: pin.value?.bConcreteValue?.value?.class ?? pin.value?.class,
      connects: (pin.connects ?? []).map((connection: any) => ({
        node: connection.id,
        kind: connection.connect?.kind,
        index: connection.connect?.index
      }))
    }))
    console.log(JSON.stringify({
      nodeIndex: node.nodeIndex,
      genericId: node.genericId?.nodeId,
      concreteId: node.concreteId?.nodeId,
      pins
    }))
  }
}

const mainNodes = decoded.graph?.graph?.inner?.graph?.nodes ?? []
const implGraph = (decoded.accessories ?? []).find(
  (accessory: any) => accessory.which === 9 && accessory.graph?.inner?.graph?.nodes?.some(
    (node: any) => node.genericId?.nodeId === 18
  )
)?.graph?.inner?.graph

summarizeRoute('main graph', mainNodes)
summarizeRoute('composite impl', implGraph?.nodes ?? [])
console.log(`\nGIA: ${giaPath}`)
console.log(`JSON: ${jsonPath}`)
