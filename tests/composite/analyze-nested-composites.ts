#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * 嵌套复合节点编码规则分析工具
 *
 * 用法:
 *   npx tsx tests/composite/analyze-nested-composites.ts <file.gia>
 *
 * 对 GIA 文件中所有复合定义的 impl 图的嵌套复合节点进行深度分析。
 */
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const PROTO = '/home/h/genshin-ts/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

const PinKindNames: Record<number, string> = {
  0: 'Unknown', 1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam',
  5: 'ClientExecNode', 6: 'ClientSignal'
}

interface CompositeAcc {
  idx: number
  def: any
  implIdx: number
  impl: any
  name: string
}

function findComposites(accessories: any[]): CompositeAcc[] {
  const result: CompositeAcc[] = []
  for (let i = 0; i < accessories.length; i++) {
    const a = accessories[i]
    if (a?.which === 12 && a?.compositeDef?.inner?.def) {
      // Found a CompositeDef, look for the next impl (which===9)
      let implIdx = -1
      // Check if next accessory is the impl graph
      if (i + 1 < accessories.length && accessories[i + 1]?.which === 9) {
        implIdx = i + 1
      }
      result.push({
        idx: i,
        def: a.compositeDef.inner.def,
        implIdx: implIdx,
        impl: implIdx >= 0 ? accessories[implIdx] : null,
        name: a.compositeDef.inner.def.name || a.name || '?'
      })
    }
  }
  return result
}

function analyzeFile(filePath: string) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`分析文件: ${filePath}`)
  console.log('='.repeat(80))

  const root = decode_gia_file(filePath, PROTO)
  const accessories = root.accessories ?? []
  const rootGraph = root.graph

  console.log(`accessories 总数: ${accessories.length}`)
  console.log(`主图 which: ${rootGraph?.which} (${rootGraph?.which === 12 ? 'CompositeGraph' : 'other'})`)

  // ── 主图分析 ──
  if (rootGraph?.which === 9) {
    const mainNodes = rootGraph.graph?.inner?.graph?.nodes ?? []
    const mainPins = rootGraph.graph?.inner?.graph?.compositePins ?? []
    console.log(`主图节点数: ${mainNodes.length}, compositePins: ${mainPins.length}`)

    // 找主图中的嵌套复合节点 (kind=22001)
    const nestedInMain = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
    console.log(`主图中嵌套复合节点: ${nestedInMain.length}`)
    for (const n of nestedInMain) {
      console.log(`  n[${n.nodeIndex}] genericId.nodeId=${n.genericId?.nodeId} pins=${n.pins?.length}`)
      for (const p of (n.pins ?? [])) {
        const kind = p.i1?.kind ?? 0
        const idx = p.i1?.index ?? 0
        const valCls = p.value?.class
        const cpi = p.compositePinIndex
        const bConcreteIdx = p.value?.bConcreteValue?.indexOfConcrete
        const parts = [`kind=${kind}(${PinKindNames[kind] || '?'})`, `index=${idx}`]
        if (valCls) parts.push(`valClass=${valCls}`)
        if (cpi !== undefined) parts.push(`compositePinIdx=${cpi}`)
        if (bConcreteIdx !== undefined) parts.push(`bConcreteIdx=${bConcreteIdx}`)
        console.log(`    pin[${(p as any).__idx ?? '?'}]: ${parts.join(', ')}`)
      }
      // 显示关联的 compositePins
      const relatedPins = mainPins.filter((cp: any) => cp.innerNodeId === n.nodeIndex)
      if (relatedPins.length > 0) {
        console.log(`    compositePins (innerNodeId=${n.nodeIndex}):`)
        for (const cp of relatedPins) {
          console.log(`      outerPin.kind=${cp.outerPin?.kind}(${PinKindNames[cp.outerPin?.kind] || '?'}) outerPin.index=${cp.outerPin?.index}`)
          console.log(`      innerPin.kind=${cp.innerPin?.kind}(${PinKindNames[cp.innerPin?.kind] || '?'}) innerPin.index=${cp.innerPin?.index}`)
        }
      }
    }
  } else if (rootGraph?.which === 12) {
    // 主图是 CompositeDef（嵌套.gia 可能是这种格式）
    console.log(`主图是 CompositeDef，name=${rootGraph.compositeDef?.inner?.def?.name}`)
    const def = rootGraph.compositeDef?.inner?.def
    if (def) {
      console.log(`  inflows: ${def.inflows?.length ?? 0}, outflows: ${def.outflows?.length ?? 0}`)
      console.log(`  inputs: ${def.inputs?.length ?? 0}, outputs: ${def.outputs?.length ?? 0}`)
    }
  } else {
    console.log(`主图类型: which=${rootGraph?.which}`)
  }

  // ── accessories 分析 ──
  const composites = findComposites(accessories)
  console.log(`\naccessories 中的复合定义: ${composites.length} 个`)

  for (const comp of composites) {
    console.log(`\n${'-'.repeat(60)}`)
    console.log(`复合: acc[${comp.idx}] "${comp.name}"`)
    console.log(`  inflows=${comp.def.inflows?.length ?? 0}, outflows=${comp.def.outflows?.length ?? 0}`)
    console.log(`  inputs=${comp.def.inputs?.length ?? 0}, outputs=${comp.def.outputs?.length ?? 0}`)

    if (comp.impl) {
      const nodes = comp.impl.graph?.inner?.graph?.nodes ?? []
      const compositePins = comp.impl.graph?.inner?.graph?.compositePins ?? []
      console.log(`  impl 节点数: ${nodes.length}, compositePins: ${compositePins.length}`)

      // 标记每个 pin 的数组索引
      for (const n of nodes) {
        for (let j = 0; j < (n.pins ?? []).length; j++) {
          n.pins[j].__idx = j
        }
      }

      // 找嵌套复合节点 (kind=22001 即 SysGraph)
      const nestedNodes = nodes.filter((n: any) => n.genericId?.kind === 22001)
      console.log(`  impl 中嵌套复合节点: ${nestedNodes.length}`)

      for (const n of nestedNodes) {
        const nid = n.genericId?.nodeId
        console.log(`\n  📦 n[${n.nodeIndex}] genericId.class=${n.genericId?.class} kind=${n.genericId?.kind} nodeId=${nid} pins=${n.pins?.length}`)

        for (const p of (n.pins ?? [])) {
          const kind = p.i1?.kind ?? 0
          const idx = p.i1?.index ?? 0
          const valCls = p.value?.class
          const cpi = p.compositePinIndex
          const bConcreteIdx = p.value?.bConcreteValue?.indexOfConcrete
          const bConcreteValCls = p.value?.bConcreteValue?.value?.class
          const connects = p.connects?.length ?? 0

          const parts = [`kind=${kind}(${PinKindNames[kind] || '?'})`, `index=${idx}`]
          if (valCls) parts.push(`valClass=${valCls}`)
          if (cpi !== undefined) parts.push(`compositePinIdx=${cpi}`)
          if (bConcreteIdx !== undefined) parts.push(`bConcreteIdx=${bConcreteIdx}`)
          if (bConcreteValCls) parts.push(`bConcreteValClass=${bConcreteValCls}`)
          if (connects > 0) parts.push(`connects=${connects}`)

          // 显示连接目标
          for (const conn of (p.connects ?? [])) {
            parts.push(`  -> n[${conn.id}] kind=${conn.connect?.kind}(${PinKindNames[conn.connect?.kind] || '?'}) idx=${conn.connect?.index}`)
          }

          console.log(`    pin[${p.__idx}]: ${parts.join(', ')}`)
        }

        // 显示关联的 compositePins
        const relatedPins = compositePins.filter((cp: any) => cp.innerNodeId === n.nodeIndex)
        if (relatedPins.length > 0) {
          console.log(`    compositePins (innerNodeId=${n.nodeIndex}):`)
          for (const cp of relatedPins) {
            console.log(`      outerPin.kind=${cp.outerPin?.kind}(${PinKindNames[cp.outerPin?.kind] || '?'}) outerPin.index=${cp.outerPin?.index}`)
            console.log(`      innerPin.kind=${cp.innerPin?.kind}(${PinKindNames[cp.innerPin?.kind] || '?'}) innerPin.index=${cp.innerPin?.index}`)
            if (cp.innerPin2?.kind !== cp.innerPin?.kind || cp.innerPin2?.index !== cp.innerPin?.index) {
              console.log(`      innerPin2.kind=${cp.innerPin2?.kind}(${PinKindNames[cp.innerPin2?.kind] || '?'}) innerPin2.index=${cp.innerPin2?.index}`)
            }
          }
        }
      }

      // 检查所有 compositePins 的 outerPin.kind 分布
      if (compositePins.length > 0) {
        console.log(`\n  compositePins outerPin 种类分布:`)
        const kindCount: Record<string, number> = {}
        for (const cp of compositePins) {
          const k = `${cp.outerPin?.kind}(${PinKindNames[cp.outerPin?.kind] || '?'})`
          kindCount[k] = (kindCount[k] ?? 0) + 1
        }
        for (const [k, v] of Object.entries(kindCount)) {
          console.log(`    ${k}: ${v}`)
        }
      }
    } else {
      console.log(`  ⚠️  没有 impl (可能是引用外部复合)`)
    }
  }

  // ── 全局统计 ──
  console.log(`\n${'─'.repeat(60)}`)
  console.log('全局统计:')

  // 统计所有 impl 图中的嵌套复合节点
  let totalNested = 0
  const nestedByComposite: Record<string, Array<{nodeIndex: number, nodeId: number, pins: any[]}>> = {}

  for (const comp of composites) {
    if (!comp.impl) continue
    const nodes = comp.impl.graph?.inner?.graph?.nodes ?? []
    const nested = nodes.filter((n: any) => n.genericId?.kind === 22001)
    if (nested.length > 0) {
      totalNested += nested.length
      nestedByComposite[comp.name] = nested.map(n => ({
        nodeIndex: n.nodeIndex,
        nodeId: n.genericId?.nodeId,
        pins: (n.pins ?? []).map((p: any) => ({
          kind: p.i1?.kind ?? 0,
          index: p.i1?.index ?? 0,
          valClass: p.value?.class,
          compositePinIdx: p.compositePinIndex,
          bConcreteIdx: p.value?.bConcreteValue?.indexOfConcrete,
          connects: (p.connects ?? []).map((c: any) => ({ to: c.id, kind: c.connect?.kind }))
        }))
      }))
    }
  }

  console.log(`总嵌套复合节点数: ${totalNested}`)
  for (const [name, nodes] of Object.entries(nestedByComposite)) {
    console.log(`  "${name}": ${nodes.length} 个嵌套`)
  }

  // 统计 InFlow 在 compositePins outerPin 的出现
  let outerInFlowCount = 0
  for (const comp of composites) {
    if (!comp.impl) continue
    const compositePins = comp.impl.graph?.inner?.graph?.compositePins ?? []
    outerInFlowCount += compositePins.filter((cp: any) => cp.outerPin?.kind === 1).length
  }
  console.log(`\ncompositePins 中 outerPin.kind=InFlow(1) 的总数: ${outerInFlowCount}`)

  // 自引用检测
  console.log(`\n自引用检测:`)
  for (const comp of composites) {
    if (!comp.impl) continue
    const nodes = comp.impl.graph?.inner?.graph?.nodes ?? []
    const selfRef = nodes.filter((n: any) =>
      n.genericId?.kind === 22001 && n.genericId?.nodeId === comp.def.id?.genericId?.id
    )
    if (selfRef.length > 0) {
      console.log(`  🔄 "${comp.name}" 自引用! genericId.nodeId=${comp.def.id?.genericId?.id}`)
      for (const n of selfRef) {
        console.log(`    n[${n.nodeIndex}] pins=${n.pins?.length}`)
      }
    }
  }
}

// ── main ──
const filePath = process.argv[2]
if (!filePath) {
  console.error('用法: npx tsx tests/composite/analyze-nested-composites.ts <file.gia>')
  process.exit(1)
}

analyzeFile(filePath)
