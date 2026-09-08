// 临时差分工具：dump 多分支节点 cases pin 的 VarBase 规范化字节（编辑器 .gil vs 编译器 .gia）
import { readFileSync } from 'node:fs'
import { readGilPayloadFields } from './src/cli/gil_extract_utils.js'
import { parseMessage } from './src/injector/binary.js'
import { loadGiaProto } from './src/injector/proto.js'
import { decode_gia_file } from './src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

const proto = loadGiaProto()
const VarBase = proto.root.lookupType('VarBase')

function graphsFromGil(path) {
  const { payload } = readGilPayloadFields(path)
  const fields: any[] = []
  const graphFields: any[] = []
  parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, { nodeGraphBlobFields: graphFields })
  const out = new Map()
  for (const f of graphFields) {
    const g = proto.nodeGraphMessage.decode(payload.subarray(f.dataStart, f.dataEnd))
    const id = Number(g.id?.id ?? 0)
    if (id) out.set(id, g)
  }
  return out
}

function graphsFromGia(path) {
  const d: any = decode_gia_file(readFileSync(path))
  const out = new Map()
  const inner = d.graph?.graph?.inner?.graph
  if (inner?.id) out.set(Number(inner.id.id ?? 0), { nodes: inner.nodes, id: inner.id })
  return out
}

function hex(b: Uint8Array) { return Buffer.from(b).toString('hex') }

function dumpMultiBranch(label: string, graphs: Map<number, any>, graphId: number) {
  const g = graphs.get(graphId)
  if (!g) { console.log(label, 'graph', graphId, 'NOT FOUND'); return }
  for (const node of g.nodes ?? []) {
    const gid = Number(node.genericId?.nodeId ?? 0)
    if (gid !== 3) continue
    const idx = Number(node.nodeIndex ?? 0)
    for (const pin of node.pins ?? []) {
      const k = pin.i1?.kind, i = pin.i1?.index
      if (k === 3 && i === 1 && pin.value) {
        const buf = VarBase.encode(VarBase.fromObject(pin.value)).finish()
        console.log(`${label} graph=${graphId} node=${idx} InParam[1] len=${buf.length}`)
        console.log('  hex:', hex(buf))
        const v: any = pin.value
        console.log('  alreadySetVal:', v.alreadySetVal, 'class:', v.class)
        if (v.bConcreteValue) {
          console.log('  ioc:', v.bConcreteValue.indexOfConcrete, 'inner.asv:', (v.bConcreteValue.value||{}).alreadySetVal)
          const entries = (v.bConcreteValue.value||{}).bArray?.entries ?? []
          console.log('  entries:', entries.map((e:any)=>({asv:e.alreadySetVal, int:e.bInt?.val, str:e.bString?.val})))
        }
      }
    }
  }
}

const [gilPath, giaTurn, giaTp] = process.argv.slice(2)
const gil = graphsFromGil(gilPath)
console.log('===== 编辑器 .gil 实样 =====')
dumpMultiBranch('EDITOR', gil, 1073741835)
dumpMultiBranch('EDITOR', gil, 1073741837)
console.log('===== 编译器 .gia 产物 =====')
dumpMultiBranch('GIA', graphsFromGia(giaTurn), 1073741835)
dumpMultiBranch('GIA', graphsFromGia(giaTp), 1073741837)