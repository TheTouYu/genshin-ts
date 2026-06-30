import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'

/**
 * 分析 GIA 文件主图中复合节点的调用拓扑。
 * 用法: npx tsx tools/topology.ts <file.gia>
 */
async function main() {
  const file = process.argv[2]
  if (!file) { console.error('用法: npx tsx tools/topology.ts <file.gia>'); process.exit(1) }

  const r = await decode_gia_file(file, undefined, false)
  const nodes = r.graph?.graph?.inner?.graph?.nodes ?? []
  const accs = r.accessories ?? []

  // 构建 CompositeDef 查找表
  const defs = new Map<number, { name: string; outflows: Array<{ name: string; pinIndex: number }> }>()
  for (const a of accs) {
    if (a.which === 12) {
      const id = a.id?.id
      const name = a.name ?? '(unnamed)'
      const def = a.compositeDef?.inner?.def
      const outflows = (def?.outflows ?? []).map((o: any) => ({ name: o.name ?? '', pinIndex: o.pinIndex }))
      defs.set(id, { name, outflows })
    }
  }

  // 统计其他 accessory 类型
  const otherWhiches = new Set<number>()
  for (const a of accs) {
    if (a.which !== 9 && a.which !== 12) otherWhiches.add(a.which)
  }
  if (otherWhiches.size > 0) {
    console.log(`(其他 accessory 类型: ${[...otherWhiches].sort().join(', ')})`)
  }

  // 构建主图节点名称
  const nodeName = (n: any): string => {
    const kind = n.genericId?.kind
    const nodeId = n.genericId?.nodeId
    if (kind === 22000 && nodeId === 71) return 'event'
    if (kind === 22001) {
      const d = defs.get(nodeId)
      return d ? `"${d.name}"` : `comp#${nodeId}`
    }
    if (kind === 22000) return `node#${nodeId}`
    return `kind=${kind}`
  }

  // 绘制 ASCII 拓扑
  console.log('=== 主图执行流拓扑 ===\n')

  // 找 event 节点
  const eventNode = nodes.find((n: any) => n.genericId?.kind === 22000 && n.genericId?.nodeId === 71)

  // 递归遍历执行流
  const visited = new Set<number>()
  const draw = (node: any, indent: number, label: string) => {
    if (visited.has(node.nodeIndex)) {
      // 绘制汇聚点（已经有连线到该节点）
      console.log(`${'  '.repeat(indent)}└─→ ${nodeName(node)} (汇聚)`)
      return
    }
    visited.add(node.nodeIndex)

    // 找出所有 OutFlow pins 的 connects
    const outflowPins = (node.pins ?? []).filter((p: any) => p.i1?.kind === 2)
    const allTargets: Array<{targetId: number; outflowIdx: number}> = []
    for (const pin of outflowPins) {
      for (const conn of (pin.connects ?? [])) {
        allTargets.push({ targetId: conn.id, outflowIdx: pin.i1.index })
      }
    }

    console.log(`${'  '.repeat(indent)}${label}${nodeName(node)}`)
    if (allTargets.length > 0) {
      // 按 outflow index 分组
      const byOutIdx = new Map<number, number[]>()
      for (const t of allTargets) {
        const arr = byOutIdx.get(t.outflowIdx) ?? []
        arr.push(t.targetId)
        byOutIdx.set(t.outflowIdx, arr)
      }

      const entries = [...byOutIdx.entries()]
      for (let i = 0; i < entries.length; i++) {
        const [outIdx, targets] = entries[i]
        const isLast = i === entries.length - 1
        const prefix = isLast ? '  └─' : '  ├─'

        if (outIdx >= 0 && node.genericId?.kind === 22001) {
          const d = defs.get(node.genericId.nodeId)
          const outflow = d?.outflows?.[outIdx]
          const outflowLabel = outflow ? `[${outIdx}:${outflow.name || outflow.pinIndex}]` : `[${outIdx}]`
          console.log(`${'  '.repeat(indent)}${prefix} OutFlow${outflowLabel}`)
        } else {
          console.log(`${'  '.repeat(indent)}${prefix} OutFlow[${outIdx}]`)
        }

        for (let j = 0; j < targets.length; j++) {
          const targetNode = nodes.find((n: any) => n.nodeIndex === targets[j])
          if (targetNode) {
            const isLastChild = j === targets.length - 1
            const connBranch = isLastChild ? '      └─→ ' : '      ├─→ '
            draw(targetNode, indent + 2, connBranch)
          }
        }
      }
    }
  }

  if (eventNode) {
    draw(eventNode, 0, '')
  } else {
    console.log('(无 event 节点 — 从无入边的根节点出发遍历)')

    // 找出所有有 inbound OutFlow 连接的节点
    const inboundTargets = new Set<number>()
    for (const n of nodes) {
      const outflowPins = (n.pins ?? []).filter((p: any) => p.i1?.kind === 2)
      for (const pin of outflowPins) {
        for (const conn of (pin.connects ?? [])) {
          inboundTargets.add(conn.id)
        }
      }
    }

    // 没有入边的节点是根节点（排除纯数据节点）
    const roots = nodes.filter((n: any) => {
      if (n.genericId?.kind !== 22001) return false // 只关心 SysGraph
      return !inboundTargets.has(n.nodeIndex)
    })

    if (roots.length > 0) {
      for (let i = 0; i < roots.length; i++) {
        const r = roots[i]
        const isLast = i === roots.length - 1
        draw(r, 0, isLast ? '└─ ' : '├─ ')
      }
    } else {
      // 如果所有节点都有入边（环形），遍历所有 SysGraph
      console.log('  (无明确根节点 — 尝试列出所有 SysGraph)')
      for (const n of nodes) {
        if (n.genericId?.kind === 22001) {
          console.log(`  - ${nodeName(n)} (index=${n.nodeIndex})`)
        }
      }
    }
  }

  // 数据连线摘要
  const dataConns: Array<{from: number; to: number; fromPin: number; toPin: number}> = []
  for (const n of nodes) {
    for (const pin of (n.pins ?? [])) {
      if (pin.i1?.kind === 3 && (pin.connects?.length ?? 0) > 0) {
        for (const conn of pin.connects) {
          dataConns.push({ from: conn.id, to: n.nodeIndex, fromPin: conn.connect?.index ?? 0, toPin: pin.i1.index })
        }
      }
    }
  }

  console.log(`\n=== 数据连线 (${dataConns.length} 条) ===`)
  for (const dc of dataConns) {
    const from = nodes.find((n: any) => n.nodeIndex === dc.from)
    const to = nodes.find((n: any) => n.nodeIndex === dc.to)
    if (from && to) {
      console.log(`  ${nodeName(from)}:OutParam[${dc.fromPin}] → ${nodeName(to)}:InParam[${dc.toPin}]`)
    }
  }
}

main()
