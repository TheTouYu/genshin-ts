import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

for (const name of ['弹球.gia', '物理运动.gia']) {
  const path = `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/${name}`
  const data = decode_gia_file(path)
  const mainGraph = data.graph?.graph?.inner?.graph
  if (!mainGraph) { console.log(`${name}: no main graph`); continue }

  const nodes = mainGraph.nodes
  // Count InParam connections (data flow)
  let inParamCount = 0
  let maxChainLength = 0
  const consumers = new Map<number, number>() // nodeIndex → how many consume from it

  for (const n of nodes) {
    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind !== 3) continue
      for (const conn of pin.connects ?? []) {
        inParamCount++
        consumers.set(conn.id, (consumers.get(conn.id) ?? 0) + 1)
      }
    }
  }

  // Count nodes with InParam (potential chain links)
  const withIn = nodes.filter(n => n.pins?.some((p: any) => p.i1?.kind === 3)).length

  // Find nodes that both consume data AND produce data for others
  const intermediate = new Set<number>()
  const dataProducers = new Set<number>()
  for (const n of nodes) {
    for (const pin of n.pins ?? []) {
      if (pin.i1?.kind !== 3) continue
      for (const conn of pin.connects ?? []) {
        dataProducers.add(conn.id)
      }
    }
  }
  for (const n of nodes) {
    const hasIn = n.pins?.some((p: any) => p.i1?.kind === 3 && p.connects?.length > 0)
    if (hasIn && dataProducers.has(n.nodeIndex)) {
      intermediate.add(n.nodeIndex)
    }
  }

  console.log(`${name}:`)
  console.log(`  总节点: ${nodes.length}`)
  console.log(`  数据连接(InParam): ${inParamCount}`)
  console.log(`  有 InParam 的节点: ${withIn}`)
  console.log(`  同时是消费者和生产者的节点(潜在链): ${[...intermediate].join(', ') || '无'}`)
  console.log()

  // Dump a few data connections to see patterns
  console.log('  前 10 条数据连接:')
  let shown = 0
  for (const n of nodes) {
    if (shown >= 10) break
    for (const pin of n.pins ?? []) {
      if (shown >= 10) break
      if (pin.i1?.kind !== 3) continue
      for (const conn of pin.connects ?? []) {
        if (shown < 10) {
          console.log(`    n=${n.nodeIndex} InParam[${pin.i1.index}] ← n=${conn.id}`)
          shown++
        }
      }
    }
  }
  console.log()
}
