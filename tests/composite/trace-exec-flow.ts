/**
 * trace-exec-flow.ts — GIA 执行流分析：事件源识别、执行链树渲染、复合节点穿透展开
 *
 * 事件起点的定义:
 *   1. 有 Branch 输出（执行流出口, kind=2）
 *   2. 没有 OutFlow pin（控制流入, kind=1）— 不是设计为被上游调用
 *   3. 没有被任何其他节点的 Branch 连接过来（独立触发）
 *   4. 如果是复合节点，其 compiled body 的 compositePins 也没有映射 OutFlow 输入
 */

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../../dist/src/compiler/gia_vendor.js'
import { SERVER_EVENT_ZH_TO_EN } from '../../dist/src/definitions/zh_aliases.js'

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

/** 获取系统节点的所有输出参数名（供事件起点信息行显示） */
function getNodeOutputNames(nid: number | null): string[] | null {
  if (nid == null) return null
  const rec = NODE_PIN_RECORDS.find(r => r.id === nid)
  return rec?.outputs?.length ? rec.outputs : null
}

/** camelCase → Title Case with spaces: "monitorSignal" → "Monitor Signal" */
function camelToDisplay(name: string): string {
  return name.replace(/^[a-z]/, c => c.toUpperCase()).replace(/([A-Z])/g, ' $1').trim()
}

/** 从中文复合名查对应的英文系统节点显示名 */
function getSystemNodeDisplayName(zhName: string): string | null {
  const enKey = (SERVER_EVENT_ZH_TO_EN as Record<string, string>)[zhName]
  if (!enKey) return null
  return camelToDisplay(enKey)
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

/** 检测 pin 值是否有 itemType 缺少 type_server 的异常 */
function hasItemTypeAnomaly(v: any): boolean {
  if (!v?.itemType) return false
  return v.itemType.type_server == null
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

/** 按 srcBranchIdx 分组 edges */
function groupEdgesByBranch(edges: FlowEdge[]): { branchIdx: number; branchName: string; edges: FlowEdge[] }[] {
  const groups = new Map<number, { branchIdx: number; branchName: string; edges: FlowEdge[] }>()
  for (const e of edges) {
    if (!groups.has(e.srcBranchIdx)) {
      groups.set(e.srcBranchIdx, { branchIdx: e.srcBranchIdx, branchName: e.srcBranchName, edges: [] })
    }
    groups.get(e.srcBranchIdx)!.edges.push(e)
  }
  return Array.from(groups.values())
}

// ============================================================
// 树形结构构建 + 渲染
// ============================================================

interface TreeNode {
  edge: FlowEdge
  name: string
  kind: number | null
  outflowStr: string
  anomaly: string  // 异常标记（如 itemType 缺少 type_server）
  children: TreeNode[]
}

function buildTree(
  edge: FlowEdge,
  nodeMap: Map<number, any>,
  downstreamOf: Map<number, FlowEdge[]>,
  compNames: Map<number, string>,
  compOutflows: Map<number, Map<number, string>>,
  visited: Set<number>,
): TreeNode {
  const n = nodeMap.get(edge.tgtIdx)
  const name = n ? resolveName(n, compNames) : '?'
  const kind = n?.genericId?.kind ?? null
  const nid = n?.genericId?.nodeId ?? null
  const outflowStr = (kind === 22001 && nid != null && compOutflows.has(nid))
    ? ' [' + Array.from(compOutflows.get(nid)!.values()).join(', ') + ']'
    : ''
  // 检测 InParam pin 的 itemType 异常（缺少 type_server）
  let anomaly = ''
  if (n?.pins) {
    const hasAnomaly = n.pins.some((p: any) => p.i1?.kind === 3 && hasItemTypeAnomaly(p.value))
    if (hasAnomaly) anomaly = ' ⚠ itemType异常'
  }
  const children: TreeNode[] = []

  if (!visited.has(edge.tgtIdx)) {
    const newVisited = new Set(visited)
    newVisited.add(edge.tgtIdx)
    const outEdges = downstreamOf.get(edge.tgtIdx) ?? []
    for (const oe of outEdges) {
      children.push(buildTree(oe, nodeMap, downstreamOf, compNames, compOutflows, newVisited))
    }
  }

  return { edge, name, kind, outflowStr, anomaly, children }
}

function printTree(
  node: TreeNode,
  prefix: string,
  isLast: boolean,
) {
  const e = node.edge
  const connector = isLast ? '└─ ' : '├─ '
  const childPrefix = prefix + (isLast ? '   ' : '│  ')

  // 终端节点（复合节点不标记为终端——它有内部执行流）
  if (node.children.length === 0) {
    const isComposite = node.kind === 22001
    const terminalMark = isComposite ? '' : ' → (终端)'
    console.log(`${prefix}${connector}${e.srcBranchName} → n=${e.tgtIdx} ${node.name} (${e.tgtOutFlowName})${node.outflowStr}${node.anomaly}${terminalMark}`)
    return
  }

  // 按 unique branch index 分组子节点
  const childGroups = groupEdgesByBranch(node.children.map(c => c.edge))
  const uniqueBranchCount = childGroups.length
  const totalEdgeCount = node.children.length

  // 单直链 (1 branch, 1 target)
  if (uniqueBranchCount === 1 && totalEdgeCount === 1) {
    console.log(`${prefix}${connector}${e.srcBranchName} → n=${e.tgtIdx} ${node.name} (${e.tgtOutFlowName})${node.outflowStr}${node.anomaly}`)
    printTree(node.children[0], childPrefix, true)
    return
  }

  // 多分支 / 扇出
  const summary = uniqueBranchCount > 1 ? `— ×${uniqueBranchCount} 分支` : `— ×${totalEdgeCount} 目标`
  console.log(`${prefix}${connector}${e.srcBranchName} → n=${e.tgtIdx} ${node.name} (${e.tgtOutFlowName})${node.outflowStr}${node.anomaly} ${summary}`)

  // 按分支分组展示子节点
  let childIdx = 0
  for (const group of childGroups) {
    for (const child of node.children) {
      if (child.edge.srcBranchIdx !== group.branchIdx) continue
      const isLastChild = childIdx === node.children.length - 1
      printTree(child, childPrefix, isLastChild)
      childIdx++
    }
  }
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
  const defToCompiled = new Map<number, number>()     // defId → compiledId（从 def.relatedIds[0] 建立，需验证 which=9）
  const compInflows = new Map<number, Map<number, string>>()   // defId → { outFlowIdx → name }
  const compOutflows = new Map<number, Map<number, string>>()  // defId → { branchIdx → name }
  const compInputs = new Map<number, string[]>()               // defId → [inputName0, inputName1, ...]
  const compOutputs = new Map<number, string[]>()              // defId → [outputName0, outputName1, ...]
  const caseValues = new Map<number, string[]>()  // nodeIndex → Branch case labels (Multiple Branches)

  // 预扫 which=9 的编译体集合
  const compiledBodyIds = new Set<number>()
  for (const a of data.accessories ?? []) {
    if (a.which === 9 && a.id?.id != null) compiledBodyIds.add(a.id.id)
  }

  for (const a of data.accessories ?? []) {
    const def = a.compositeDef?.inner?.def
    if (!def || a.id?.id == null) continue
    const id = a.id.id
    compNames.set(id, def.name)

    // 从 def.relatedIds[0] 找编译体，需验证目标确实是 which=9
    const maybeCompiledId = a.relatedIds?.[0]?.id
    if (maybeCompiledId != null && compiledBodyIds.has(maybeCompiledId)) {
      defToCompiled.set(id, maybeCompiledId)
    }

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

    // 数据输入引脚名（InParam/kind=3）
    const inputNames: string[] = []
    for (const f of (def.inputs ?? [])) {
      if (f.index?.kind === 3 && f.name) inputNames.push(f.name)
    }
    if (inputNames.length > 0) compInputs.set(id, inputNames)

    // 数据输出引脚名（OutParam/kind=4）
    const outputNames: string[] = []
    for (const f of (def.outputs ?? [])) {
      if (f.index?.kind === 4 && f.name) outputNames.push(f.name)
    }
    if (outputNames.length > 0) compOutputs.set(id, outputNames)
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
      //   4. 系统节点/其他: 数字 1, 2, 3...（NODE_PIN_RECORDS.outputs[] 是数据输出名，不对应 Branch 索引）
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
        srcBranchName = String(srcBranchIdx + 1)
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

    // 系统节点从 NODE_PIN_RECORDS 获取输出参数名，复合节点从 compInputs 获取输入参数名
    const outputNames = kind === 22000 ? getNodeOutputNames(nid) : null
    const inputNames = (kind === 22001 && nid != null) ? compInputs.get(nid) ?? null : null

    allNodes.push({
      idx: n.nodeIndex, name, nid, kind,
      pinCount: pins.length,
      hasOutflowPin, branchCount,
      compositeDefHasFlowInput,
      inParamTotal, inParamConnected, isCalled,
      isEvent, outputNames, inputNames,
    })
  }

  // ===== 输出 =====
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  const ioMode = args.includes('--io')
  const listNodes = args.includes('--list-nodes') || args.includes('-l')
  const detailIdxArg = args.find(a => a.startsWith('--detail='))
  const detailIdx = detailIdxArg ? parseInt(detailIdxArg.split('=')[1], 10) : null
  const depthArg = args.find(a => a.startsWith('--depth='))
  const jsonDepth = depthArg !== undefined ? Math.max(parseInt(depthArg.split('=')[1], 10), 0) : -1  // -1 = unlimited
  const expandArg = args.find(a => a.startsWith('--expand='))
  const expandValue = expandArg ? expandArg.split('=', 2)[1] : null
  let expandIdx: number | null = null
  let expandName: string | null = null
  if (expandValue != null) {
    const parsed = parseInt(expandValue, 10)
    expandIdx = !isNaN(parsed) && String(parsed) === expandValue ? parsed : null
    expandName = expandIdx == null ? expandValue : null
  }

  // --expand 模式下跳过主图输出，直接显示展开内容
  if ((expandIdx != null || expandName != null) && !jsonMode) {
    const idx = resolveExpandTarget(expandIdx, expandName, allNodes)
    if (idx == null) return
    showExpand(idx, allNodes, data, defToCompiled, compNames, compOutflows, compInputs, compOutputs)
    return
  }

  function buildControlIoSummary(): any[] {
    return allNodes.map((node: any) => {
      const incoming = upstreamOf.get(node.idx) ?? []
      const outgoing = downstreamOf.get(node.idx) ?? []
      const inflows = new Map<number, { index: number; name: string; sources: any[] }>()
      const outflows = new Map<number, { index: number; name: string; targets: any[] }>()

      for (const edge of incoming) {
        if (!inflows.has(edge.tgtOutFlowIdx)) {
          inflows.set(edge.tgtOutFlowIdx, {
            index: edge.tgtOutFlowIdx,
            name: edge.tgtOutFlowName,
            sources: []
          })
        }
        const srcNode = nodeMap.get(edge.srcIdx)
        inflows.get(edge.tgtOutFlowIdx)!.sources.push({
          idx: edge.srcIdx,
          name: srcNode ? resolveName(srcNode, compNames) : '?',
          outflow_index: edge.srcBranchIdx,
          outflow_name: edge.srcBranchName
        })
      }

      for (const edge of outgoing) {
        if (!outflows.has(edge.srcBranchIdx)) {
          outflows.set(edge.srcBranchIdx, {
            index: edge.srcBranchIdx,
            name: edge.srcBranchName,
            targets: []
          })
        }
        const tgtNode = nodeMap.get(edge.tgtIdx)
        outflows.get(edge.srcBranchIdx)!.targets.push({
          idx: edge.tgtIdx,
          name: tgtNode ? resolveName(tgtNode, compNames) : '?',
          inflow_index: edge.tgtOutFlowIdx,
          inflow_name: edge.tgtOutFlowName
        })
      }

      return {
        idx: node.idx,
        name: node.name,
        nid: node.nid,
        kind: node.kind,
        inflows: Array.from(inflows.values()).sort((a, b) => a.index - b.index),
        outflows: Array.from(outflows.values()).sort((a, b) => a.index - b.index)
      }
    })
  }

  function printControlIoSummary() {
    console.log('='.repeat(60))
    console.log(`文件: ${filePath}`)
    console.log(`总节点: ${mainGraph.nodes.length}`)
    console.log('='.repeat(60))
    console.log('\n🔌 控制流 I/O')
    console.log('-'.repeat(60))

    for (const node of buildControlIoSummary()) {
      console.log(`n=${String(node.idx).padStart(2)} ${node.name}`)
      if (node.inflows.length === 0) {
        console.log('  InFlow:  (无上游)')
      } else {
        for (const inflow of node.inflows) {
          const sources = inflow.sources
            .map((s: any) => `n=${s.idx}.OutFlow[${s.outflow_index}] ${s.outflow_name}`)
            .join(', ')
          console.log(`  InFlow[${inflow.index}] ${inflow.name} <- ${sources}`)
        }
      }
      if (node.outflows.length === 0) {
        console.log('  OutFlow: (无下游)')
      } else {
        for (const outflow of node.outflows) {
          const targets = outflow.targets
            .map((t: any) => `n=${t.idx}.InFlow[${t.inflow_index}] ${t.inflow_name}`)
            .join(', ')
          console.log(`  OutFlow[${outflow.index}] ${outflow.name} -> ${targets}`)
        }
      }
      console.log()
    }
  }

  function printNodeList() {
    if (jsonMode) {
      const nodeList = [...allNodes]
        .sort((a: any, b: any) => a.idx - b.idx)
        .map((node: any) => ({
          index: node.idx,
          name: node.name,
          nid: node.nid,
          kind: node.kind,
          pins: node.pinCount,
          event_source: node.isEvent,
          has_outflow_pin: node.hasOutflowPin,
          branch_count: node.branchCount,
          called: node.isCalled,
        }))
      console.log(JSON.stringify(nodeList, null, 2))
      return
    }

    console.log(`📋 主图节点列表:`)
    const sorted = [...allNodes].sort((a: any, b: any) => a.idx - b.idx)
    for (const node of sorted) {
      const marks: string[] = []
      if (node.isEvent) marks.push('event')
      if (!node.isCalled && node.hasOutflowPin && node.branchCount === 0) marks.push('orphan')
      const markSuffix = marks.length > 0 ? `  ${marks.join(', ')}` : ''
      console.log(
        `${String(node.idx).padStart(3)}  ${String(node.name).padEnd(36)}  ` +
        `nid=${String(node.nid ?? '?').padEnd(12)}  kind=${String(node.kind ?? '?').padEnd(7)}  ` +
        `pins=${String(node.pinCount).padEnd(3)}  branch=${String(node.branchCount).padEnd(2)}  ` +
        `outflow=${node.hasOutflowPin ? 'Y' : 'N'}${markSuffix}`
      )
    }
  }

  if (listNodes) {
    printNodeList()
    return
  }

  if (jsonMode) {
    /** 递归构建下游 JSON 树 */
    function buildJsonDownstream(idx: number, remainingDepth: number, visited: Set<number>): any[] {
      if (remainingDepth <= 0) return []
      const outEdges = downstreamOf.get(idx) ?? []
      const newVisited = new Set(visited)
      if (newVisited.has(idx)) return [{ cycle: true }]  // 安全兜底
      newVisited.add(idx)
      return outEdges.map((e: FlowEdge) => {
        const tn = nodeMap.get(e.tgtIdx)
        const name = tn ? resolveName(tn, compNames) : '?'
        return {
          idx: e.tgtIdx, name,
          branch: e.srcBranchName, inflow: e.tgtOutFlowName,
          downstream: buildJsonDownstream(e.tgtIdx, remainingDepth - 1, newVisited),
        }
      })
    }

    const result: any = {
      file: filePath,
      total_nodes: mainGraph.nodes.length,
      event_sources: allNodes.filter((n: any) => n.isEvent).map((n: any) => ({
        idx: n.idx, name: n.name, nid: n.nid, kind: n.kind,
        branch_count: n.branchCount,
        in_params: { total: n.inParamTotal, connected: n.inParamConnected },
        ...(n.outputNames ? { output_names: n.outputNames } : {}),
        ...(n.inputNames ? { input_names: n.inputNames } : {}),
        downstream: buildJsonDownstream(n.idx, jsonDepth >= 0 ? jsonDepth : Infinity, new Set()),
      })),
      orphan_nodes: allNodes.filter((n: any) => !n.isCalled && !(n.branchCount > 0) && n.hasOutflowPin).map((n: any) => ({
        idx: n.idx, name: n.name,
      })),
      ...(ioMode ? { control_io: buildControlIoSummary() } : {}),
    }
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (ioMode) {
    printControlIoSummary()
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
    const outSuffix = e.outputNames ? `  (${e.outputNames.join(', ')})` : ''
    const inSuffix = e.inputNames ? `  [${e.inputNames.join(', ')}]` : ''
    console.log(`n=${String(e.idx).padStart(2)} [${kindLabel}] ${e.name}`)
    console.log(`   Branch×${e.branchCount}${inInfo}${outSuffix}${inSuffix}`)

    const outEdges = downstreamOf.get(e.idx) ?? []
    if (outEdges.length === 0) {
      console.log(`   → (无下游)`)
    } else {
      for (let ei = 0; ei < outEdges.length; ei++) {
        const root = buildTree(outEdges[ei], nodeMap, downstreamOf, compNames, compOutflows, new Set())
        printTree(root, '', ei === outEdges.length - 1)
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

  // ===== --expand=N: 展开复合节点内部 =====
  if (expandIdx != null || expandName != null) {
    const idx = resolveExpandTarget(expandIdx, expandName, allNodes)
    if (idx != null) showExpand(idx, allNodes, data, defToCompiled, compNames, compOutflows, compInputs, compOutputs)
  }
}

// ============================================================
// --expand=N 入口
// ============================================================

/** 解析 --expand 参数：数字索引 or 复合名称 */
function resolveExpandTarget(
  expandIdx: number | null,
  expandName: string | null,
  allNodes: any[],
): number | null {
  if (expandIdx != null) return expandIdx

  const name = expandName!
  // 精确匹配
  let target = allNodes.find(n => n.kind === 22001 && (n.name === name || n.name === `复合:${name}`))
  // 部分匹配（子串）
  if (!target) {
    target = allNodes.find(n => n.kind === 22001 && n.name.includes(name))
  }
  if (!target) {
    console.log(`⚠ 未找到名为 "${name}" 的复合节点`)
    return null
  }
  return target.idx
}

function showExpand(
  expandIdx: number,
  allNodes: any[],
  data: any,
  defToCompiled: Map<number, number>,
  compNames: Map<number, string>,
  compOutflows: Map<number, Map<number, string>>,
  compInputs: Map<number, string[]>,
  compOutputs: Map<number, string[]>,
) {
  const expandTarget = allNodes.find((n: any) => n.idx === expandIdx)
  if (!expandTarget) { console.log(`⚠ 未找到节点 n=${expandIdx}`); return }
  if (expandTarget.kind !== 22001) { console.log(`⚠ n=${expandIdx} 不是复合节点（kind=${expandTarget.kind}）`); return }
  const nid = expandTarget.nid
  const compiledId = defToCompiled.get(nid)
  if (compiledId == null) { console.log(`⚠ ${expandTarget.name}（n=${expandIdx}）没有编译体（可能是信号驱动复合）`); return }
  // 查找 compiled body 的 accessories (which=9)
  let compiledGraph: any = null
  let compiledPins: any[] = []
  for (const acc of data.accessories ?? []) {
    if (acc.which === 9 && acc.id?.id === compiledId) {
      compiledGraph = acc.graph?.inner?.graph
      compiledPins = acc.graph?.inner?.graph?.compositePins ?? []
      break
    }
  }
  if (!compiledGraph) { console.log(`⚠ 未找到编译体 compiledId=${compiledId}`); return }
  expandSubGraph(
    compiledGraph,
    expandTarget.name,
    compiledPins,
    compNames,
    compOutflows,
    compInputs,
    compOutputs,
    defToCompiled
  )
}

// ============================================================
// --expand=N: 子图事件源分析
// ============================================================

function expandSubGraph(
  graph: any,
  compositeName: string,
  compositePins: any[],
  compNames: Map<number, string>,
  compOutflows: Map<number, Map<number, string>>,
  compInputs: Map<number, string[]>,
  compOutputs: Map<number, string[]>,
  defToCompiled: Map<number, number>,
) {
  const nodeMap = new Map<number, any>()
  for (const n of graph.nodes) nodeMap.set(n.nodeIndex, n)

  // 子图内判断是否为真复合（有编译体）还是系统伪复合
  const _hasCompiledBody = (nid: number | null) => nid != null && defToCompiled.has(nid)

  // 哪些内部 Branch pin 映射到复合的外部 outflow？
  const outflowMappedBranches = new Set<string>()
  // 哪些内部 OutFlow pin 来自复合的外部 inflow？
  const inflowMappedOutflows = new Set<string>()
  for (const cp of (compositePins ?? [])) {
    if (cp.innerPin?.kind === 2) outflowMappedBranches.add(`${cp.innerNodeId}:${cp.innerPin.index}`)
    if (cp.innerPin?.kind === 1) inflowMappedOutflows.add(`${cp.innerNodeId}:${cp.innerPin.index}`)
  }

  // 构建子图执行流连接
  const upstreamOf = new Map<number, FlowEdge[]>()
  const downstreamOf = new Map<number, FlowEdge[]>()

  for (const n of graph.nodes) {
    for (const p of (n.pins ?? [])) {
      if (p.i1?.kind !== 2) continue
      const srcBranchIdx = p.i1.index
      // 子图内仅用数字命名 Branch（无复合 outflows/case 值上下文）
      let srcBranchName: string
      if (n.genericId?.nodeId === 2) {
        srcBranchName = srcBranchIdx === 0 ? '是' : '否'
      } else {
        srcBranchName = String(srcBranchIdx + 1)
      }
      for (const c of (p.connects ?? [])) {
        const tgtIdx = c.id
        const tgtOutFlowIdx = c.connect2?.index ?? c.connect?.index ?? 0
        const edge: FlowEdge = {
          srcIdx: n.nodeIndex, srcBranchIdx, srcBranchName,
          tgtIdx, tgtOutFlowIdx, tgtOutFlowName: `InFlow[${tgtOutFlowIdx}]`,
        }
        if (!upstreamOf.has(tgtIdx)) upstreamOf.set(tgtIdx, [])
        upstreamOf.get(tgtIdx)!.push(edge)
        if (!downstreamOf.has(n.nodeIndex)) downstreamOf.set(n.nodeIndex, [])
        downstreamOf.get(n.nodeIndex)!.push(edge)
      }
    }
  }

  // 扫描子图事件起点
  interface SubNodeInfo {
    idx: number; name: string; kind: number; nid: number | null
    branchCount: number
    isCalled: boolean; inflowFromOutside: boolean
    isEvent: boolean
  }
  const subNodes: SubNodeInfo[] = []

  for (const n of graph.nodes) {
    const nid = n.genericId?.nodeId
    const kind = n.genericId?.kind
    const name = resolveName(n, compNames)
    const pins = n.pins ?? []

    let branchCount = 0
    let hasOutflowPin = false
    for (const p of pins) {
      const pk = p.i1?.kind
      if (pk === 1) hasOutflowPin = true
      if (pk === 2) branchCount++
    }
    const idx = n.nodeIndex
    const isCalled = (upstreamOf.get(idx)?.length ?? 0) > 0

    // 有未映射到外部 outflow 的 Branch pin？
    const hasInternalBranch = pins.some(p =>
      p.i1?.kind === 2 && !outflowMappedBranches.has(`${idx}:${p.i1.index}`)
    )

    // 有来自外部 inflow 的 OutFlow pin？
    const inflowFromOutside = pins.some(p =>
      p.i1?.kind === 1 && inflowMappedOutflows.has(`${idx}:${p.i1.index}`)
    )

    // 事件起点条件：有内部 Branch + 未被内部调用 + 不从外部 inflow 触发
    const isEvent = hasInternalBranch && !isCalled && !inflowFromOutside

    subNodes.push({ idx, name, kind, nid, branchCount, isCalled, inflowFromOutside, isEvent })
  }

  const events = subNodes.filter(s => s.isEvent)
  console.log(`\n📡 ${compositeName} — 内部事件起点 (${events.length} 个)`)
  console.log('-'.repeat(60))

  for (const e of events) {
    const isPseudo = e.kind === 22001 && !_hasCompiledBody(e.nid)
    // 输出参数：系统节点用 NODE_PIN_RECORDS，伪复合用 def.outputs
    const outNames = e.kind === 22000 ? getNodeOutputNames(e.nid) :
                     isPseudo && e.nid != null ? compOutputs.get(e.nid) ?? null : null
    // 输入参数：真复合用 def.inputs（伪复合无 inputs）
    const inNames = (e.kind === 22001 && e.nid != null && !isPseudo) ? compInputs.get(e.nid) ?? null : null
    const outSuffix = outNames ? `  (${outNames.join(', ')})` : ''
    const inSuffix = inNames ? `  [${inNames.join(', ')}]` : ''
    // 伪复合标 system，真复合标 复合
    const kindLabel = isPseudo ? '系统' : (e.kind === 22001 ? '复合' : '系统')
    // 对伪复合，尝试查英文系统名，中英文一起显示
    let effectiveName = e.name
    let extraSuffix = ''
    if (isPseudo && e.nid != null) {
      const mapName = nameMap.get(e.nid)
      const sysName = mapName ?? getSystemNodeDisplayName(e.name.replace(/^复合:/, ''))
      if (sysName) {
        const zhName = e.name.replace(/^复合:/, '')
        effectiveName = zhName !== sysName ? `${sysName} (${zhName})` : sysName
      } else {
        effectiveName = e.name.replace(/^复合:/, '')
      }
      // 从 kind=5 的 pin 提取信号名
      const n = nodeMap.get(e.idx)
      if (n) {
        const sigPins = (n.pins ?? []).filter(p => p.i1?.kind === 5 && p.value?.bString?.val)
        if (sigPins.length > 0) {
          extraSuffix = `  "${sigPins.map(p => p.value.bString.val).join(', ')}"`
        }
      }
    }
    console.log(`n=${String(e.idx).padStart(2)} [${kindLabel}] ${effectiveName}${extraSuffix}`)
    console.log(`   Branch×${e.branchCount}${outSuffix}${inSuffix}`)
    const outEdges = downstreamOf.get(e.idx) ?? []
    if (outEdges.length === 0) {
      console.log(`   → (无下游)`)
    } else {
      // 使用 buildTree + printTree 渲染子图树（单独 visited，不混入主图）
      for (let ei = 0; ei < outEdges.length; ei++) {
        const root = buildTree(outEdges[ei], nodeMap, downstreamOf, compNames, compOutflows, new Set())
        printTree(root, '', ei === outEdges.length - 1)
      }
    }
    console.log()
  }
}

function printUsage(useError = false): void {
  const out = useError ? console.error : console.log
  out('用法: npx tsx tests/composite/trace-exec-flow.ts <文件.gia> [--json] [--io] [--detail=N] [--depth=N] [--expand=N|名称] [--list-nodes|-l]')
  out('  默认: 输出人类可读的事件起点分析（含执行流引脚名）')
  out('  --json: 输出 JSON 结果（配合 --depth=N 控制下游递归层数，默认全部展开）')
  out('  --io: 输出所有节点的控制流 InFlow/OutFlow 汇总')
  out('  --detail=N: 显示节点 N 的完整引脚信息')
  out('  --depth=N: 配合 --json 使用，递归展开 N 层下游（0=不展开下游）')
  out('  --expand=N 或 --expand=<名称>: 展开复合节点的内部执行流事件源')
  out('  --list-nodes/-l: 列出主图所有节点（可配合 --json）')
}

// ===== CLI =====
const cliArgs = process.argv.slice(2)
const filePath = cliArgs[0]
if (!filePath || filePath.startsWith('--')) {
  printUsage(true)
  process.exit(1)
}

try {
  analyze(filePath)
} catch (e: any) {
  console.error(`❌ 分析失败: ${e.message}`)
  process.exit(1)
}
