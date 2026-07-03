// @ts-nocheck
/**
 * dump-layout.js — 提取 GIA 文件中所有节点位置，分析布局规律
 * 用法：npx tsx tools/dump-layout.ts <file.gia>
 */
import { decode_gia_file } from '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO_PATH = new URL(
  '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

const filePath = process.argv[2]
if (!filePath) { console.error('用法: npx tsx tools/dump-layout.ts <file.gia>'); process.exit(1) }

const gen = decode_gia_file(filePath, PROTO_PATH)
const NODE_PIN_RECORDS: Record<number, string> = {
  1: 'Print String', 2: 'Double Branch', 71: 'When Entity Is Created',
  83: 'Set Node Graph Variable', 84: 'Get Node Graph Variable',
  180: 'Data Type Conversion', 200: 'Addition', 202: 'Subtraction'
}

function render(filePath, gen) {
  console.log(`\n===== ${filePath.replace(/.*\//, '')} =====`)

  // 主图
  const mainGraph = gen.graph?.graph?.inner?.graph
  if (mainGraph) {
    const nodeMap = new Map(mainGraph.nodes.map(n => [n.nodeIndex, n]))
    console.log(`\n--- 主图 (${mainGraph.nodes.length} 节点, ${mainGraph.compositePins?.length ?? 0} compositePins) ---`)
    for (const n of mainGraph.nodes) {
      const name = NODE_PIN_RECORDS[n.genericId?.nodeId] ?? `nid=${n.genericId?.nodeId}`
      console.log(`  node[${n.nodeIndex}] ${name} (${Math.round(n.x)}, ${Math.round(n.y)})`)
      // 显示 pin 连线
      for (const p of n.pins ?? []) {
        const kind = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}[p.i1?.kind] ?? '?'
        const conns = (p.connects ?? []).map(c => `→node${c.id}`).join(', ')
        if (conns) console.log(`    ${kind}[${p.i1?.index}] ${conns}`)
      }
    }
  }

  // accessories
  for (let i = 0; i < (gen.accessories?.length ?? 0); i++) {
    const a = gen.accessories[i]
    const inner = a.graph?.inner?.graph ?? a.compositeDef?.inner?.def
    if (!inner) continue
    const name = a.name || (a.compositeDef?.inner?.def?.name ?? '')
    console.log(`\n--- acc[${i}] "${name}" (${inner.nodes?.length ?? inner.implNodes?.length ?? '?'} 节点) ---`)
    for (const n of inner.nodes ?? []) {
      const name = NODE_PIN_RECORDS[n.genericId?.nodeId] ?? `nid=${n.genericId?.nodeId}`
      console.log(`  node[${n.nodeIndex}] ${name} (${Math.round(n.x)}, ${Math.round(n.y)})`)
      for (const p of n.pins ?? []) {
        const kind = {1:'InFlow',2:'OutFlow',3:'InParam',4:'OutParam'}[p.i1?.kind] ?? '?'
        const conns = (p.connects ?? []).map(c => `→node${c.id}`).join(', ')
        if (conns) console.log(`    ${kind}[${p.i1?.index}] ${conns}`)
      }
    }
  }
}

render(filePath, gen)
