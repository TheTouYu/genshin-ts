import { readFileSync } from 'fs'
import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'
import type { GraphNode, Root } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const FILES = [
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/传球.gia',
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/弹球.gia',
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia',
]

function main(): void {
  for (const filePath of FILES) {
    console.log('='.repeat(70))
    console.log('FILE:', filePath.split('/').pop())

    const root = decode_gia_file(filePath) as any

    // === Top-level ===
    console.log('\n--- TOP LEVEL ---')
    console.log('Root keys:', Object.keys(root))
    console.log('graph.which:', root.graph?.which)
    console.log('modeFlag:', root.modeFlag)
    console.log('gameVersion:', root.gameVersion)
    console.log('filePath:', root.filePath)
    console.log('accessories count:', root.accessories?.length ?? 0)

    // === graph (main) ===
    const g = root.graph
    console.log('\n--- MAIN GRAPH ---')
    console.log('Main Graph Unit id:', JSON.stringify(g?.id, null, 2))
    console.log('Main Graph Unit name:', g?.name)
    console.log('Main Graph Unit relatedIds:', JSON.stringify(g?.relatedIds, null, 2))

    // Check graphType variants
    if (g?.graph) {
      console.log('Has graph type: NodeGraph')
      const innerGraph = g.graph?.inner?.graph
      if (innerGraph) {
        console.log('  NodeGraph id:', JSON.stringify(innerGraph?.id))
        console.log('  NodeGraph name:', innerGraph?.name)
        console.log('  NodeGraph entrySlotIndex:', innerGraph?.entrySlotIndex)
        console.log('  NodeGraph evaluationInterval:', innerGraph?.evaluationInterval)
        console.log('  NodeGraph nodes count:', innerGraph?.nodes?.length ?? 0)
        console.log('  NodeGraph compositePins count:', innerGraph?.compositePins?.length ?? 0)
        console.log('  NodeGraph graphValues count:', innerGraph?.graphValues?.length ?? 0)
        console.log('  NodeGraph affiliations count:', innerGraph?.affiliations?.length ?? 0)
        console.log('  NodeGraph comments count:', innerGraph?.comments?.length ?? 0)

        // Analyze nodes by kind
        const nodes = innerGraph.nodes ?? []
        const byKind: Record<number, number> = {}
        for (const n of nodes) {
          const k = n.concreteId?.kind ?? n.id?.kind ?? 0
          byKind[k] = (byKind[k] ?? 0) + 1
        }
        console.log('  Nodes by concreteId.kind:', JSON.stringify(byKind))

        // Event node
        const eventNode = nodes.find((n: any) => n.concreteId?.kind === 22000 && n.concreteId?.nodeId === 71)
        const eventNode2 = nodes.find((n: any) => n.id?.kind === 22000 && n.id?.nodeId === 71)
        if (eventNode || eventNode2) {
          const en = eventNode ?? eventNode2
          console.log('  Event node found: nodeId=71')
          // Look at the payload (kind=4) pin for event type
          const payloadPin = en.pins?.find((p: any) => p.i1?.kind === 4)
          if (payloadPin?.value?.bConcreteValue?.value?.bEnum) {
            console.log('  Event payload enum value:', payloadPin.value.bConcreteValue.value.bEnum.val)
          }
          // Print first few pins for debugging
          if (en.pins) {
            for (let i = 0; i < Math.min(en.pins.length, 5); i++) {
              console.log(`    Pin[${i}]:`, JSON.stringify({
                kind: en.pins[i].i1?.kind,
                valEnum: en.pins[i].value?.bConcreteValue?.value?.bEnum?.val,
                valInt: en.pins[i].value?.bConcreteValue?.value?.bInt?.val,
              }))
            }
          }
        } else {
          console.log('  No event node (kind=22000, nodeId=71)')
        }

        // Check for CompositeCall nodes (kind=21001)
        const compCallNodes = nodes.filter((n: any) => n.concreteId?.kind === 21001 || n.id?.kind === 21001)
        console.log(`  Composite call nodes (kind=21001): ${compCallNodes.length}`)
        for (const cn of compCallNodes) {
          console.log(`    Composite call: id=${cn.concreteId?.nodeId ?? cn.id?.nodeId}, pins=${cn.pins?.length}`)
        }

        // Data connections
        let dataConn = 0
        let clientExec = 0
        for (const n of nodes) {
          for (const p of n.pins ?? []) {
            if (p.i1?.kind === 3 && p.connects?.length > 0) {
              dataConn += p.connects.length
            }
            if (p.i1?.kind === 5) clientExec++
          }
        }
        console.log(`  Data connections in main graph: ${dataConn}`)
        console.log(`  ClientExec pins in main graph: ${clientExec}`)
      }
    }
    if (g?.compositeDef) {
      console.log('Has graph type: CompositeDef')
    }
    if (g?.structureDef) {
      console.log('Has graph type: StructureDef')
    }

    // === Accessories (CompositeDefs etc.) ===
    if (root.accessories?.length > 0) {
      console.log('\n--- ACCESSORIES ---')
      for (let i = 0; i < root.accessories.length; i++) {
        const acc = root.accessories[i]
        console.log(`Accessory[${i}]: which=${acc.which}, name=${acc.name}`)
        console.log(`  id:`, JSON.stringify(acc.id, null, 2))
        console.log(`  relatedIds:`, JSON.stringify(acc.relatedIds, null, 2))

        if (acc.compositeDef) {
          console.log(`  TYPE: CompositeDef`)
          const def = acc.compositeDef?.inner?.def
          console.log(`    id:`, JSON.stringify(def?.id))
          console.log(`    name: ${def?.name}`)
          console.log(`    description: ${def?.description}`)
          console.log(`    inflows: ${def?.inflows?.length ?? 0}`)
          console.log(`    outflows: ${def?.outflows?.length ?? 0}`)
          console.log(`    inputs: ${def?.inputs?.length ?? 0}`)
          console.log(`    outputs: ${def?.outputs?.length ?? 0}`)
          console.log(`    type:`, JSON.stringify(def?.type))
        }
        if (acc.graph) {
          console.log(`  TYPE: NodeGraph (accessory)`)
          const innerGraph = acc.graph?.inner?.graph
          if (innerGraph) {
            console.log(`    nodes: ${innerGraph.nodes?.length ?? 0}`)

            // Analyze nodes in this accessory graph
            const nodes = innerGraph.nodes ?? []
            const byKind: Record<number, number> = {}
            for (const n of nodes) {
              const k = n.concreteId?.kind ?? n.id?.kind ?? 0
              byKind[k] = (byKind[k] ?? 0) + 1
            }
            console.log(`    Nodes by kind:`, JSON.stringify(byKind))
          }
        }
        if (acc.structureDef) {
          console.log(`  TYPE: StructureDef`)
        }
      }
    } else {
      console.log('\nNo accessories found')
    }

    // === Node decomposition stats (aggregate over ALL graphs) ===
    console.log('\n--- AGGREGATE (all graphs) ---')
    const allNodes = collectAllNodes(root)
    const byKindAll: Record<number, number> = {}
    const byNodeId: Record<number, number> = {}
    for (const n of allNodes) {
      const k = n.concreteId?.kind ?? n.id?.kind ?? 0
      byKindAll[k] = (byKindAll[k] ?? 0) + 1
      const nid = n.concreteId?.nodeId ?? n.id?.nodeId ?? 0
      byNodeId[nid] = (byNodeId[nid] ?? 0) + 1
    }
    console.log('Total nodes:', allNodes.length)
    console.log('Nodes by kind:', JSON.stringify(byKindAll, null, 2))
    console.log('Top nodeIds:', Object.entries(byNodeId).sort((a,b) => b[1]-a[1]).slice(0, 15))

    // Aggregate data connections
    let totalDataConn = 0
    let totalClientExec = 0
    for (const n of allNodes) {
      for (const p of n.pins ?? []) {
        if (p.i1?.kind === 3 && p.connects?.length > 0) {
          totalDataConn += p.connects.length
        }
        if (p.i1?.kind === 5) totalClientExec++
      }
    }
    console.log('Total data connections:', totalDataConn)
    console.log('Total ClientExec pins:', totalClientExec)

    // File size
    const fileSize = readFileSync(filePath).length
    console.log('\nFile size:', fileSize, 'bytes')
    console.log()
  }
}

function collectAllNodes(obj: any, depth = 0): any[] {
  if (!obj || typeof obj !== 'object' || depth > 30) return []
  let nodes: any[] = []
  if (Array.isArray(obj.nodes)) nodes = nodes.concat(obj.nodes)
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object') nodes = nodes.concat(collectAllNodes(item, depth + 1))
      }
    } else if (val && typeof val === 'object') {
      nodes = nodes.concat(collectAllNodes(val, depth + 1))
    }
  }
  return nodes
}

main()
