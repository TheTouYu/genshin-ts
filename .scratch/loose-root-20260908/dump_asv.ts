import { readFileSync } from 'node:fs'
import { readGilPayloadFields } from './src/cli/gil_extract_utils.js'
import { parseMessage } from './src/injector/binary.js'
import { loadGiaProto } from './src/injector/proto.js'
const proto = loadGiaProto()
const [path, graphId] = process.argv.slice(2)
const { payload } = readGilPayloadFields(path)
const fields: any[] = []; const graphFields: any[] = []
parseMessage(payload, 0, payload.length, 0, 0, 0, 0, 0, 0, 0, fields, { nodeGraphBlobFields: graphFields })
for (const f of graphFields) {
  const g: any = proto.nodeGraphMessage.decode(payload.subarray(f.dataStart, f.dataEnd))
  if (Number(g.id?.id ?? 0) !== Number(graphId)) continue
  for (const node of g.nodes ?? []) {
    if (Number(node.genericId?.nodeId ?? 0) !== 3) continue
    for (const pin of node.pins ?? []) {
      if (pin.i1?.kind === 3 && pin.i1?.index === 1 && pin.value) {
        const v: any = pin.value
        const inner = v.bConcreteValue?.value ?? {}
        const entries = inner.bArray?.entries ?? []
        console.log(`node=${node.nodeIndex} outer.asv=${v.alreadySetVal} inner.asv=${inner.alreadySetVal} ioc=${v.bConcreteValue?.indexOfConcrete} entries=${entries.length}`)
        for (const e of entries) console.log('   entry asv=' + e.alreadySetVal + ' int=' + (e.bInt?.val ?? e.bString?.val))
      }
    }
  }
}