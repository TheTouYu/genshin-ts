/**
 * find-event-sources.ts — 查找 GIA 文件的事件起点（独立执行流触发源）
 *
 * 事件起点的定义:
 *   1. 有 Branch 输出（执行流出口, kind=2）
 *   2. 没有 OutFlow pin（控制流入, kind=1）— 不是设计为被上游调用
 *   3. 没有被任何其他节点的 Branch 连接过来（独立触发）
 *   4. 如果是复合节点，其 compiled body 的 compositePins 也没有映射 OutFlow 输入
 */

import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'

// ============================================================
// 名称工具
// ============================================================

const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) if (rec.name) nameMap.set(rec.id, rec.name)
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

function resolveName(n: any, compNames: Map<number, string>): string {
  if (!n) return '?'
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (kind === 22001) return `复合:${compNames.get(nid) ?? '?'}`
  if (nid == null) return `kind=${kind}`
  return nameMap.get(nid) ?? `nid=${nid}`
}

/** 获取系统节点的 Branch 输出名（从 NODE_PIN_RECORKS.outputs） */
function getSystemBranchName(nid: number | null, branchIdx: number): string | null {
  if (nid == null) return null
  const rec = NODE_PIN_RECORDS.find(r => r.id === nid)
  if (!rec?.outputs) return null
  return rec.outputs[branchIdx] ?? null
}

/** 提取字面值 */
function extractLiteral(v: any): string | null {
  if (!v) return null
  if (v.bFloat?.val != null) return String(v.bFloat.val)
  if (v.bInt?.val != null) return String(v.bInt.val)
  if (v.bString?.val != null) return `"${v.bString.val}"`
  if (v.bBool?.val != null) return String(v.bBool.val)
  if (v.bEnum?.val != null) return `enum=${v.bEnum.val}`
  if (v.bConcreteValue) {
    const cv = v.bConcreteValue
    if (cv.value?.bFloat?.val != null) return String(cv.value.bFloat.val)
    if (cv.value?.bInt?.val != null) return String(cv.value.bInt.val)
    if (cv.value?.bString?.val != null) return `"${cv.value.bString.val}"`
    if (cv.value?.bBool?.val != null) return String(cv.value.bBool.val)
    if (cv.value?.bArray?.entries) {
      return cv.value.bArray.entries.map((e: any) => extractLiteral(e) ?? '?').join(', ')
    }
  }
  return null
}

// ============================================================
// 执行流连接记录
// ============================================================

interface FlowEdge {
  srcIdx: number
  srcBranchIdx: number       // source 的 Branch pin 索引
  srcBranchName: string     // source 的 Branch 输出名
  tgtIdx: number
  tgtOutFlowIdx: number     // target 的 OutFlow pin 索引
  tgtOutFlowName: string    // target 的 OutFlow 输入名
}

// ============================================================
// 主逻辑
// ============================================================

function analyze(filePath: string) {
  const data = decode_gia_file(filePath)
  const mainGraph = data.graph?.graph?.inner?.graph
  if (!mainGraph) { console.error('❌ 未找到主图'); process.exit(1) }

  const nodeMap = new Map<number, any>()
  for (const n of mainGraph.nodes) nodeMap.set(n.nodeIndex, n)

  // ===== 复合定义索引 =====
  // which=12 是定义体，which=9 是编译体
  const compNames = new Map<number, string>()
  const defToCompiled = new Map<number, number>()
  const compInflows = new Map<number, Map<number, string>>()   // defId → { outFlowIdx → name }
  const compOutflows = new Map<number, Map<number, string>>()  // defId → { branchIdx → name }
  const caseValues = new Map<number, string[]>()  // nodeIndex → Branch case labels (Multiple Branches)

  for (const a of data.accessories ?? []) {
    const def = a.compositeDef?.inner?.def
    if (!def || a.id?.id == null) continue
    const id = a.id.id
    compNames.set(id, def.name)

    const compiledId = a.relatedIds?.[0]?.id
    if (compiledId != null) defToCompiled.set(id, compiledId)

    // 执行流输入引脚名（OutFlow/kind=1）
    const inflowMap = new Map<number, string>()
    for (const f of (def.inflows ?? [])) {
      if (f.index?.kind === 1 && f.name) inflowMap.set(f.index.index, f.name)
    }
    if (inflowMap.size > 0) compInflows.set(id, inflowMap)

    // 执行流输出引脚名（Branch/kind=2）
    const outflowMap = new Map<number, string>()
    for (const f of (def.outflows ?? [])) {
      if (f.index?.kind === 2 && f.name) outflowMap.set(f.index.index, f.name)
    }
    if (outflowMap.size > 0) compOutflows.set(id, outflowMap)
  }

  // ===== 复合节点是否定义执行流输入（通过 compositePins） =====
  const compiledHasFlowInput = new Map<number, boolean>()
  for (const acc of data.accessories ?? []) {
    if (acc.which !== 9) continue
    const g = acc.graph?.inner?.graph
    if (!g) continue
    const cid = acc.id?.id ?? 0
    let has = false
    for (const cp of (g.compositePins ?? [])) {
      if (cp.outerPin?.kind === 1) { has = true; break }
    }
    compiledHasFlowInput.set(cid, has)
  }

  // ===== Multiple Branches 的 case 值提取 =====
  // Branch[n] = caseValues 列表的第 n-1 项
  for (const n of mainGraph.nodes) {
    if (n.genericId?.nodeId !== 3) continue  // Multiple Branches
    const inParam1 = (n.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
    if (!inParam1?.value) continue
    const raw = extractLiteral(inParam1.value)
    if (raw) {
      const cases = raw.split(', ').map(s => s.replace(/^"(.*)"$/, '$1'))
      caseValues.set(n.nodeIndex, cases)
    }
  }

  // ===== 构建执行流连接图（带引脚详情） =====
  const edges: FlowEdge[] = []
  const upstreamOf = new Map<number, FlowEdge[]>()
  const downstreamOf = new Map<number, FlowEdge[]>()

  for (const n of mainGraph.nodes) {
    const nid = n.genericId?.nodeId
    const kind = n.genericId?.kind

    for (const p of (n.pins ?? [])) {
      if (p.i1?.kind !== 2) continue     // 只看 Branch 输出
      const srcBranchIdx = p.i1.index

      // 获取 Branch 输出名 —— 优先级：
      //   1. 复合节点: def.outflows[] 中的 name
      //   2. Multiple Branches: InParam[1] 中的 case 值 (Branch[n] = case[n-1])
      //   3. Double Branch: 约定 Branch[0]=是/True, Branch[1]=否/False
      //   4. 其他系统节点: NODE_PIN_RECORDS.outputs[]
      //   5. 都没有: 数字 [0], [1], [2]...
      let srcBranchName: string

      if (kind === 22001 && nid != null) {
        const map = compOutflows.get(nid)
        srcBranchName = (map?.get(srcBranchIdx)) ?? String(srcBranchIdx + 1)
      } else if (nid === 3 && caseValues.has(n.nodeIndex)) {
        const cases = caseValues.get(n.nodeIndex)!
        const caseIdx = srcBranchIdx - 1  // Branch[1]=case[0], Branch[2]=case[1], ...
        srcBranchName = (caseIdx >= 0 && caseIdx < cases.length) ? cases[caseIdx] : String(srcBranchIdx + 1)
      } else if (nid === 2) {
        srcBranchName = srcBranchIdx === 0 ? '是' : '否'
      } else {
        const sysName = getSystemBranchName(nid, srcBranchIdx)
        srcBranchName = sysName ?? String(srcBranchIdx + 1)
      }

      for (const c of (p.connects ?? [])) {
        const tgtIdx = c.id
        const tgtOutFlowIdx = c.connect2?.index ?? c.connect?.index ?? 0

        // 获取目标 OutFlow 输入名
        let tgtOutFlowName = `InFlow[${tgtOutFlowIdx}]`
        const tgtNode = nodeMap.get(tgtIdx)
        if (tgtNode) {
          const tgtNid = tgtNode.genericId?.nodeId
          const tgtKind = tgtNode.genericId?.kind
          if (tgtKind === 22001 && tgtNid != null && compInflows.has(tgtNid)) {
            const map = compInflows.get(tgtNid)!
            if (map.has(tgtOutFlowIdx)) tgtOutFlowName = map.get(tgtOutFlowIdx)!
          }
        }

        const edge: FlowEdge = {
          srcIdx: n.nodeIndex,
          srcBranchIdx,
          srcBranchName,
          tgtIdx,
          tgtOutFlowIdx,
          tgtOutFlowName,
        }
        edges.push(edge)

        if (!upstreamOf.has(tgtIdx)) upstreamOf.set(tgtIdx, [])
        upstreamOf.get(tgtIdx)!.push(edge)
        if (!downstreamOf.has(n.nodeIndex)) downstreamOf.set(n.nodeIndex, [])
        downstreamOf.get(n.nodeIndex)!.push(edge)
      }
    }
  }

  // ===== 扫描节点 → 识别事件起点 =====
  const allNodes: any[] = []

  for (const n of mainGraph.nodes) {
    const pins = n.pins ?? []
    const nid = n.genericId?.nodeId
    const kind = n.genericId?.kind
    const name = resolveName(n, compNames)

    let hasOutflowPin = false
    let branchCount = 0
    let inParamTotal = 0
    let inParamConnected = 0

    for (const p of pins) {
      const pk = p.i1?.kind
      if (pk === 1) hasOutflowPin = true
      if (pk === 2) branchCount++
      if (pk === 3) {
        inParamTotal++
        if ((p.connects ?? []).length > 0 || p.value) inParamConnected++
      }
    }

    const isCalled = (upstreamOf.get(n.nodeIndex)?.length ?? 0) > 0
    const hasBranchOutput = branchCount > 0

    let compositeDefHasFlowInput = false
    if (kind === 22001 && nid != null) {
      const compiledId = defToCompiled.get(nid)
      if (compiledId != null && compiledHasFlowInput.get(compiledId)) {
        compositeDefHasFlowInput = true
      }
    }

    const isEvent = !isCalled && hasBranchOutput && !hasOutflowPin && !compositeDefHasFlowInput

    allNodes.push({
      idx: n.nodeIndex, name, nid, kind,
      hasOutflowPin, branchCount,
      compositeDefHasFlowInput,
      inParamTotal, inParamConnected, isCalled,
      isEvent,
    })
  }

  // ===== 输出 =====
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const detailIdxArg = args.find(a => a.startsWith('--detail='))
  const detailIdx = detailIdxArg ? parseInt(detailIdxArg.split('=')[1], 10) : null

  if (jsonMode) {
    const result: any = {
      file: filePath,
      total_nodes: mainGraph.nodes.length,
      event_sources: allNodes.filter((n: any) => n.isEvent).map((n: any) => ({
        idx: n.idx, name: n.name, nid: n.nid, kind: n.kind,
        branch_count: n.branchCount,
        in_params: { total: n.inParamTotal, connected: n.inParamConnected },
        downstream: (downstreamOf.get(n.idx) ?? []).map((e: FlowEdge) => {
          const tn = nodeMap.get(e.tgtIdx)
          return { idx: e.tgtIdx, name: tn ? resolveName(tn, compNames) : '?', branch: e.srcBranchName, inflow: e.tgtOutFlowName }
        }),
      })),
      orphan_nodes: allNodes.filter((n: any) => !n.isCalled && !(n.branchCount > 0) && n.hasOutflowPin).map((n: any) => ({
        idx: n.idx, name: n.name,
      })),
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (detailIdx != null) {
    const n = nodeMap.get(detailIdx)
    if (!n) { console.error(`❌ 未找到节点 n=${detailIdx}`); process.exit(1) }
    const info = allNodes.find((a: any) => a.idx === detailIdx)
    if (info) {
      console.log(`\n=== n=${detailIdx} ${info.name} ===`)
      console.log(`  nid=${info.nid}  kind=${info.kind}`)
      console.log(`  执行流: 上游=${info.isCalled}  OutFlow=${info.hasOutflowPin}  Branch=${info.branchCount}  事件起点=${info.isEvent}`)
      console.log(`  数据输入: ${info.inParamConnected}/${info.inParamTotal}`)
    }
    // 显示引脚详情
    console.log('\n  引脚:')
    for (const p of (n.pins ?? [])) {
      const pk = p.i1?.kind
      const pi = p.i1?.index
      const kindName = ['?','OutFlow','Branch','InParam','OutParam'][pk] ?? `?`
      for (const c of (p.connects ?? [])) {
        const targetPin = c.connect2?.index ?? c.connect?.index ?? 0
        console.log(`    [${kindName}][${pi}] → n=${c.id}[${targetPin}]`)
      }
      if (!(p.connects ?? []).length) {
        const val = p.value ? ` =${JSON.stringify(p.value).slice(0, 60)}` : ''
        console.log(`    [${kindName}][${pi}] 未连接${val}`)
      }
    }
    return
  }

  // ----- 人类可读输出 -----
  console.log('='.repeat(60))
  console.log(`文件: ${filePath}`)
  console.log(`总节点: ${mainGraph.nodes.length}`)
  console.log('='.repeat(60))

  const events = allNodes.filter((n: any) => n.isEvent)
  console.log(`\n📡 事件起点 (${events.length} 个)`)
  console.log('-'.repeat(60))

  for (const e of events) {
    const kindLabel = e.kind === 22000 ? '系统' : '复合'
    const inInfo = e.inParamTotal > 0 ? ` 数据输入:${e.inParamConnected}/${e.inParamTotal}` : ' 纯执行流触发'
    console.log(`n=${String(e.idx).padStart(2)} [${kindLabel}] ${e.name}`)
    console.log(`   Branch×${e.branchCount}${inInfo}`)

    const outEdges = downstreamOf.get(e.idx) ?? []
    if (outEdges.length === 0) {
      console.log(`   → (无下游)`)
    } else {
      for (const edge of outEdges) {
        showChain(edge, nodeMap, downstreamOf, compNames, '')
      }
    }
    console.log()
  }

  // 孤悬节点
  const orphans = allNodes.filter((n: any) => !n.isCalled && !(n.branchCount > 0) && n.hasOutflowPin)
  if (orphans.length > 0) {
    console.log(`⚠  孤悬节点 (${orphans.length} 个 — 有 OutFlow 但未被调用)`)
    console.log('-'.repeat(60))
    for (const o of orphans) {
      console.log(`  n=${String(o.idx).padStart(2)} ${o.name}`)
    }
    console.log()
  }
}

// ============================================================
// 执行流链展示
// ============================================================

function showChain(
  edge: FlowEdge,
  nodeMap: Map<number, any>,
  downstreamOf: Map<number, FlowEdge[]>,
  compNames: Map<number, string>,
  indent: string,
  visited = new Set<number>(),
) {
  const n = nodeMap.get(edge.tgtIdx)
  const name = n ? resolveName(n, compNames) : '?'

  if (visited.has(edge.tgtIdx)) {
    console.log(`${indent}↳ ${edge.srcBranchName} → n=${edge.tgtIdx} ${name} (循环)`)
    return
  }
  visited.add(edge.tgtIdx)

  const outEdges = downstreamOf.get(edge.tgtIdx) ?? []

  if (outEdges.length === 0) {
    console.log(`${indent}↳ ${edge.srcBranchName} → n=${edge.tgtIdx} ${name} (${edge.tgtOutFlowName}) → (终端)`)
  } else if (outEdges.length === 1) {
    console.log(`${indent}↳ ${edge.srcBranchName} → n=${edge.tgtIdx} ${name} (${edge.tgtOutFlowName})`)
    showChain(outEdges[0], nodeMap, downstreamOf, compNames, indent + '  ', new Set(visited))
  } else {
    // 多分支：先输出当前节点
    console.log(`${indent}↳ ${edge.srcBranchName} → n=${edge.tgtIdx} ${name}`)
    for (const subEdge of outEdges) {
      const tgtName2 = nodeMap.get(subEdge.tgtIdx)
        ? resolveName(nodeMap.get(subEdge.tgtIdx)!, compNames) : '?'
      const sub2 = downstreamOf.get(subEdge.tgtIdx) ?? []
      if (sub2.length === 0) {
        console.log(`${indent}   ${subEdge.srcBranchName} → n=${subEdge.tgtIdx} ${tgtName2} (${subEdge.tgtOutFlowName}) → (终端)`)
      } else if (sub2.length === 1) {
        console.log(`${indent}   ${subEdge.srcBranchName} → n=${subEdge.tgtIdx} ${tgtName2} (${subEdge.tgtOutFlowName})`)
        showChain(sub2[0], nodeMap, downstreamOf, compNames, indent + '   ', new Set(visited))
      } else {
        console.log(`${indent}   ${subEdge.srcBranchName} → n=${subEdge.tgtIdx} ${tgtName2} → ×${sub2.length} 下游`)
        for (const st of sub2) {
          const stName = nodeMap.get(st.tgtIdx)
            ? resolveName(nodeMap.get(st.tgtIdx)!, compNames) : '?'
          console.log(`${indent}      ${st.srcBranchName} → n=${st.tgtIdx} ${stName} (${st.tgtOutFlowName})`)
        }
      }
    }
  }
}

// ===== CLI =====
const cliArgs = process.argv.slice(2)
const filePath = cliArgs[0]
if (!filePath || filePath.startsWith('--')) {
  console.error(`用法: npx tsx tests/composite/find-event-sources.ts <文件.gia> [--json] [--detail=N]`)
  console.error(`  默认: 输出人类可读的事件起点分析（含执行流引脚名）`)
  console.error(`  --json: JSON 格式`)
  console.error(`  --detail=N: 显示节点 N 的完整引脚信息`)
  process.exit(1)
}

try {
  analyze(filePath)
} catch (e: any) {
  console.error(`❌ 分析失败: ${e.message}`)
  process.exit(1)
}
