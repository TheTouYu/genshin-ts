// @ts-nocheck
/**
 * trace-dataflow.ts — 数据流链追溯工具
 *
 * 用法:
 *   主图追溯: npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引> <InParam索引>
 *   impl图追溯: npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引> <InParam索引> --composite <名称>
 * 例子:
 *   trace n=9 InParam[2] → npx tsx tests/composite/trace-dataflow.ts 传球.gia 9 2
 *   在"计算分力"复合中追溯: npx tsx tests/composite/trace-dataflow.ts 物理运动.gia 5 0 --composite 计算分力
 *       首次运行自动查文件位置
 */

import { decode_gia_file } from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { NODE_PIN_RECORDS } from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'
import { NODE_ID } from '../compiler/gia_vendor.js'

// ============================================================
// 名称解析
// ============================================================

const nameMap = new Map<number, string>()
for (const rec of NODE_PIN_RECORDS) if (rec.name) nameMap.set(rec.id, rec.name)
for (const [key, id] of Object.entries(NODE_ID)) {
  if (typeof id !== 'number') continue
  if (!nameMap.has(id)) nameMap.set(id, key.replace(/__Generic$/, '').replace(/_/g, ' '))
}

/** 已知系统节点参数名的覆盖（NODE_PIN_RECORDS 仅有类型占位符时使用） */
const PIN_NAME_OVERRIDES: Record<number, string[]> = {
  18: ['初始值'],      // Get_Local_Variable: 默认值
  19: ['变量范围', '值'], // Set_Local_Variable: scope, value (猜测)
  337: ['变量名'],      // Get_Node_Graph_Variable: variable name
  50: ['变量名', '默认值'], // Get_Custom_Variable (nid=50)
}

// ============================================================
// 复合索引
// ============================================================

interface CompIdx {
  compNames: Map<number, string>
  compDefs: Map<number, any>
}

function buildCompIdx(data: any): CompIdx {
  const compNames = new Map<number, string>()
  const compDefs = new Map<number, any>()
  for (const a of data.accessories ?? []) {
    const id = a.id?.id
    const def = a.compositeDef?.inner?.def
    if (def && id != null) { compNames.set(id, def.name); compDefs.set(id, def) }
  }
  return { compNames, compDefs }
}

function resolveName(n: any, ci: CompIdx): string {
  if (!n) return '?'
  const nid = n.genericId?.nodeId
  const kind = n.genericId?.kind
  if (nid == null) return `kind=${n.genericId?.kind}`
  if (kind === 22001) return `复合:${ci.compNames.get(nid) ?? '?'}`
  return nameMap.get(nid) ?? `nid=${nid}`
}

function getInputTypes(nid: number): string[] {
  for (const r of NODE_PIN_RECORDS) if (r.id === nid) return r.inputs ?? []
  return []
}

function extractLiteral(v: any): string {
  if (!v) return '?'
  if (v.bFloat?.val != null) return String(v.bFloat.val)
  if (v.bInt?.val != null) return String(v.bInt.val)
  if (v.bString?.val != null) return `"${v.bString.val}"`
  if (v.bBool?.val != null) return String(v.bBool.val)
  if (v.bEnum?.val != null) return `enum=${v.bEnum.val}`
  if (v.bConcreteValue) {
    const cv = v.bConcreteValue
    if (cv.value?.bFloat?.val != null) return String(cv.value.bFloat.val)
    if (cv.value?.bString?.val != null) return `"${cv.value.bString.val}"`
    if (cv.value?.bInt?.val != null) return String(cv.value.bInt.val)
    if (cv.value?.bArray?.entries) {
      const entries = cv.value.bArray.entries
      if (entries.length > 5) {
        // 折叠大数组：检测是否全是同一值
        const folded = foldUniformArray(entries)
        if (folded) return folded
        return `[${entries.length} items]`
      }
      return `[${entries.map((e: any) => extractLiteral(e)).join(', ')}]`
    }
    return '(预设值)'
  }
  return '(预设值)'
}

/** 检测大数组是否全为同一常量，如果是则返回折叠显示 */
function foldUniformArray(entries: any[]): string | null {
  if (entries.length <= 5) return null
  const first = extractLiteral(entries[0])
  for (let i = 1; i < Math.min(entries.length, 10); i++) {
    if (extractLiteral(entries[i]) !== first) return null
  }
  // 前10个全相同 → 假设全数组一致
  return `${first} 重复 ×${entries.length}`
}

// ============================================================
// 树结构
// ============================================================

interface DataSource {
  nodeIndex: number         // 源节点索引
  nodeName: string          // 源节点名
  nid: number | null
  outParamIndex: number | null
  outParamName: string | null
  literalValue: string | null  // 字面值（终端节点）
  note: string | null          // 功能描述
  isTerminal: boolean
  isComposite: boolean
  compositeId: number | null
  crossGraphEntry?: CrossGraphEntry    // 跨图追溯：复合 OutParam 进入编译体后的追踪
}

interface ParentInputRef {
  compositeName: string  // 父复合名，如 "计算分力"
  inputName: string      // 输入参数名，如 "w"
  inputIndex: number     // 输入索引
}

interface InParamBranch {
  inParamIndex: number
  inParamName: string
  inParamType: string
  literalValue: string | null       // 如果未连接
  source: DataSource | null         // 数据来源节点
  parentInputRef: ParentInputRef | null  // 来自父复合输入参数（编译体直通）
  subBranches: InParamBranch[]      // 来源节点的输入参数（继续追溯）
  truncated: boolean                // 是否因深度限制被截断
  _foldedCount?: number             // 折叠数组时连续重复计数（仅用于显示）
}

/** 跨图追溯：复合 OutParam 进入编译体后，内部节点的追溯信息 */
interface CrossGraphEntry {
  compositeName: string              // 复合名，如 "计算物理运动状态"
  innerNodeIndex: number             // 编译体内内部节点索引 n=27
  innerNodeName: string              // 编译体内内部节点名
  innerOutParamIndex: number | null  // 内部 OutParam 索引
  innerOutParamName: string | null   // 内部 OutParam 名
  branches: InParamBranch[]          // 内部节点的 InParam 追溯
}

/** 跨图追溯上下文（全局构建一次，递归传递） */
interface CrossGraphContext {
  defToCompiled: Map<number, number>   // defId → compiledId
  compiledBodies: Map<number, any>     // compiledId → which=9 accessory
  signalSources: Map<number, string>   // defId → 信号通道名（无编译体的 which=14 信号复合）
}

/** 父复合输入索引 */
interface ParentInputMap {
  nameToIdx: Map<string, { index: number; pinIndex: number }>          // name → info
  idxToName: Map<number, string>                                       // index → name
  parentName: string
}

/**
 * compositePins 索引：内节点 → 外接口映射。
 * 编译体（which=9）的 graph.compositePins[] 记录了父接口与内部节点的对应关系。
 */
type CompositePinsIndex = Map<number, Map<string, { outerKind: number; outerIndex: number }>>

function buildCompositePinsIndex(graph: any): CompositePinsIndex {
  const idx: CompositePinsIndex = new Map()
  for (const cp of graph.compositePins ?? []) {
    const innerNodeId = cp.innerNodeId
    const innerKey = `${cp.innerPin?.kind}:${cp.innerPin?.index}`
    if (!idx.has(innerNodeId)) idx.set(innerNodeId, new Map())
    idx.get(innerNodeId)!.set(innerKey, { outerKind: cp.outerPin?.kind, outerIndex: cp.outerPin?.index })
  }
  return idx
}

/** 构建跨图追溯上下文 */
function buildCrossGraphContext(data: any): CrossGraphContext {
  const defToCompiled = new Map<number, number>()
  const compiledBodies = new Map<number, any>()
  const signalSources = new Map<number, string>()

  // 预扫描所有 which=9 编译体
  for (const a of data.accessories ?? []) {
    if (a.which === 9 && a.id?.id != null) {
      compiledBodies.set(a.id.id, a)
    }
  }

  // 从定义体（有 compositeDef）的 relatedIds[0] 建立 def → compiled 映射
  for (const a of data.accessories ?? []) {
    const def = a.compositeDef?.inner?.def
    if (!def || a.id?.id == null) continue
    const maybeCompiledId = a.relatedIds?.[0]?.id
    if (maybeCompiledId != null && compiledBodies.has(maybeCompiledId)) {
      defToCompiled.set(a.id.id, maybeCompiledId)
    }
  }

  // 建立 which=14 信号 accessory 的 id → 名称映射
  const which14Names = new Map<number, string>()
  for (const a of data.accessories ?? []) {
    if (a.which === 14 && a.id?.id != null && a.compositeDef?.inner?.def?.name) {
      which14Names.set(a.id.id, a.compositeDef.inner.def.name)
    }
  }

  // 对没有编译体的复合定义，检查 relatedIds 是否指向 which=14 信号
  for (const a of data.accessories ?? []) {
    const def = a.compositeDef?.inner?.def
    if (!def || a.id?.id == null) continue
    // 跳过已有编译体的
    if (defToCompiled.has(a.id.id)) continue
    // 遍历 relatedIds 找 which=14 信号名称
    for (const rid of (a.relatedIds ?? [])) {
      const signalName = which14Names.get(rid.id)
      if (signalName) {
        signalSources.set(a.id.id, signalName)
        break
      }
    }
  }

  return { defToCompiled, compiledBodies, signalSources }
}

/** 从复合定义构建 ParentInputMap */
function buildParentInputs(def: any, parentName: string): ParentInputMap {
  const nameToIdx = new Map<string, { index: number; pinIndex: number }>()
  const idxToName = new Map<number, string>()
  for (let i = 0; i < (def.inputs ?? []).length; i++) {
    const inp = def.inputs[i]
    if (inp?.name) {
      nameToIdx.set(inp.name, { index: i, pinIndex: inp.pinIndex })
      idxToName.set(i, inp.name)
    }
  }
  return { nameToIdx, idxToName, parentName }
}

// ============================================================
// 追溯逻辑
// ============================================================

function isTerminalNode(n: any): { yes: boolean; note: string | null } {
  const nid = n.genericId?.nodeId
  if (nid === 71 || nid === 72 || nid === 83 || nid === 385) return { yes: true, note: '事件上下文' }
  if (nid === 73) return { yes: true, note: '获取自身实体' }
  if (nid === 337) return { yes: true, note: '读取图变量' }
  if (nid === 50) return { yes: true, note: '读取自定义变量' }
  if (nid === 310) return { yes: true, note: '游戏当前时间' }
  if (nid === 75) return { yes: true, note: '查询实体' }
  // Check if has any InParam with connects
  const hasConnectedIn = (n.pins ?? []).some((p: any) => p.i1?.kind === 3 && (p.connects ?? []).length > 0)
  if (!hasConnectedIn) return { yes: true, note: null }
  return { yes: false, note: null }
}

function getOutParamName(n: any, outIdx: number, ci: CompIdx): string | null {
  if (n.genericId?.kind !== 22001) return null
  const def = ci.compDefs.get(n.genericId.nodeId)
  if (!def) return null
  const out = (def.outputs ?? [])[outIdx]
  return out?.name ?? null
}

function formatCompositeValueType(type: any): string | null {
  if (!type) return null
  const typeId = type.type1 ?? type.type2
  switch (typeId) {
    case 1: return 'Entity'
    case 3: return 'Int'
    case 4: return 'Bol'
    case 5: return 'R<T>'
    case 6: return 'String'
    case 8: return 'Array'
    case 12: return 'Vector'
    case 16: return 'PrefabId'
    default: return typeId != null ? `type=${typeId}` : null
  }
}

function getCompositeInput(node: any, idx: number, ci: CompIdx): any | null {
  const nid = node.genericId?.nodeId
  if (nid == null || node.genericId?.kind !== 22001) return null
  const def = ci.compDefs.get(nid)
  return (def?.inputs ?? [])[idx] ?? null
}

function getInParamName(node: any, idx: number, ci: CompIdx): string {
  const nid = node.genericId?.nodeId
  if (!nid) return `InParam[${idx}]`
  const compositeInput = getCompositeInput(node, idx, ci)
  if (compositeInput?.name) return compositeInput.name
  // Check for known overrides first
  const overrides = PIN_NAME_OVERRIDES[nid]
  if (overrides && overrides[idx] != null) return overrides[idx]
  const types = getInputTypes(nid)
  const t = types[idx] ?? '?'
  return t
}

function getInParamType(node: any, idx: number, ci: CompIdx): string {
  const compositeType = formatCompositeValueType(getCompositeInput(node, idx, ci)?.type)
  if (compositeType) return compositeType
  const nid = node.genericId?.nodeId
  const types = nid != null ? getInputTypes(nid) : []
  return types[idx] ?? '?'
}

function traceInParam(
  node: any,
  inParamIdx: number,
  allNodes: Map<number, any>,
  ci: CompIdx,
  depth: number,
  maxDepth: number,
  parentInputs?: ParentInputMap,
  compositePinsIdx?: CompositePinsIndex,
  crossGraphCtx?: CrossGraphContext,
): InParamBranch {
  const nid = node.genericId?.nodeId
  const inType = getInParamType(node, inParamIdx, ci)
  const inName = getInParamName(node, inParamIdx, ci)

  // Helper: check compositePins for parent-input mapping
  function checkCompositePins(): ParentInputRef | null {
    if (!compositePinsIdx || !parentInputs) return null
    const nodePins = compositePinsIdx.get(node.nodeIndex)
    if (!nodePins) return null
    const key = `3:${inParamIdx}`
    const outer = nodePins.get(key)
    if (!outer || outer.outerKind !== 3) return null
    const inputName = parentInputs.idxToName.get(outer.outerIndex) ?? `inputs[${outer.outerIndex}]`
    return {
      compositeName: parentInputs.parentName,
      inputName,
      inputIndex: outer.outerIndex,
    }
  }

  // Find the InParam pin
  const pin = (node.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === inParamIdx)

  // No pin at all — check compositePins for parent-input passthrough
  if (!pin) {
    const pRef = checkCompositePins()
    if (pRef) return { inParamIndex: inParamIdx, inParamName: inName, inParamType: inType, literalValue: null, source: null, parentInputRef: pRef, subBranches: [], truncated: false }
    // Fallback: name-based passthrough detection
    if (parentInputs && node.genericId?.kind === 22001) {
      const subDef = ci.compDefs.get(nid)
      if (subDef) {
        const subInput = (subDef.inputs ?? [])[inParamIdx]
        if (subInput?.name) {
          const parentMatch = parentInputs.nameToIdx.get(subInput.name)
          if (parentMatch) {
            return {
              inParamIndex: inParamIdx,
              inParamName: inName,
              inParamType: inType,
              literalValue: null,
              source: null,
              parentInputRef: { compositeName: parentInputs.parentName, inputName: subInput.name, inputIndex: parentMatch.index },
              subBranches: [],
              truncated: false,
            }
          }
        }
      }
    }
    return { inParamIndex: inParamIdx, inParamName: inName, inParamType: inType, literalValue: null, source: null, parentInputRef: null, subBranches: [], truncated: false }
  }

  // Pin exists but no connects — check compositePins first, then literal value
  if (!pin.connects?.length) {
    const pRef = checkCompositePins()
    if (pRef) return { inParamIndex: inParamIdx, inParamName: inName, inParamType: inType, literalValue: null, source: null, parentInputRef: pRef, subBranches: [], truncated: false }
    const lit = pin.value ? extractLiteral(pin.value) : null
    return { inParamIndex: inParamIdx, inParamName: inName, inParamType: inType, literalValue: lit, source: null, parentInputRef: null, subBranches: [], truncated: false }
  }

  // Connected — get the source node
  const conn = pin.connects[0]
  const src = allNodes.get(conn.id)
  if (!src) {
    return { inParamIndex: inParamIdx, inParamName: inName, inParamType: inType, literalValue: null,
      source: { nodeIndex: conn.id, nodeName: '(not found)', nid: null, outParamIndex: null, outParamName: null, literalValue: null, note: 'ERROR', isTerminal: true, isComposite: false, compositeId: null },
      parentInputRef: null, subBranches: [], truncated: false }
  }

  const srcOutIdx = conn.connect2?.index ?? conn.connect?.index ?? 0
  const outName = getOutParamName(src, srcOutIdx, ci)
  const srcName = resolveName(src, ci)
  const srcNid = src.genericId?.nodeId ?? null
  const isComp = src.genericId?.kind === 22001
  const term = isTerminalNode(src)

  const dataSource: DataSource = {
    nodeIndex: conn.id,
    nodeName: srcName,
    nid: srcNid,
    outParamIndex: srcOutIdx,
    outParamName: outName,
    literalValue: null,
    note: term.note,
    isTerminal: term.yes,
    isComposite: isComp,
    compositeId: isComp ? srcNid : null,
  }

  // If depth < maxDepth and source is not terminal, trace its InParams
  let subBranches: InParamBranch[] = []
  let truncated = false

  // 跨图追溯：若来源是复合 OutParam 且 depth 未达限制，自动进入 compiled body
  if (depth < maxDepth && isComp && crossGraphCtx && srcNid != null && srcOutIdx != null && srcOutIdx >= 0) {
    const compiledId = crossGraphCtx.defToCompiled.get(srcNid)
    if (compiledId != null) {
      const compiledAcc = crossGraphCtx.compiledBodies.get(compiledId)
      if (compiledAcc) {
        const implGraph = compiledAcc.graph?.inner?.graph
        if (implGraph) {
          // 在 compositePins 中搜索 outerPin.kind=4 (OutParam) 匹配当前出口
          let innerNodeId: number | null = null
          let innerPinIndex: number | null = null
          for (const cp of implGraph.compositePins ?? []) {
            if (cp.outerPin?.kind === 4 && cp.outerPin?.index === srcOutIdx) {
              innerNodeId = cp.innerNodeId
              innerPinIndex = cp.innerPin?.index ?? null
              break
            }
          }

          if (innerNodeId != null) {
            // 建立编译体节点空间
            const innerNodeMap = new Map<number, any>()
            for (const n of implGraph.nodes) innerNodeMap.set(n.nodeIndex, n)

            const innerNode = innerNodeMap.get(innerNodeId)
            if (innerNode) {
              // 为编译体建立 parentInputs（供内部借 InParam 直通检测用）
              const compName = ci.compNames.get(srcNid) ?? '?'
              const def = ci.compDefs.get(srcNid)
              const innerParentInputs = def ? buildParentInputs(def, compName) : undefined
              const innerCompositePinsIdx = buildCompositePinsIndex(implGraph)

              // 收集内部节点的 InParam 索引
              const innerInParams = new Set<number>()
              for (const p of innerNode.pins ?? []) {
                if (p.i1?.kind === 3) innerInParams.add(p.i1.index)
              }

              const innerBranches: InParamBranch[] = []
              for (const innerIdx of [...innerInParams].sort()) {
                const sub = traceInParam(
                  innerNode, innerIdx, innerNodeMap, ci,
                  depth + 1, maxDepth, innerParentInputs, innerCompositePinsIdx, crossGraphCtx,
                )
                innerBranches.push(sub)
              }

              const innerOutParamName = getOutParamName(innerNode, innerPinIndex ?? 0, ci)
              dataSource.crossGraphEntry = {
                compositeName: compName,
                innerNodeIndex: innerNodeId,
                innerNodeName: resolveName(innerNode, ci),
                innerOutParamIndex: innerPinIndex,
                innerOutParamName,
                branches: innerBranches,
              }
            }
          }
        }
      }
    } else if (isComp && term.yes && dataSource.note == null) {
      // 信号驱动复合：有 OutParam 但没有编译体，数据来自游戏信号系统
      const sigName = crossGraphCtx?.signalSources?.get(srcNid!)
      dataSource.note = sigName ? `信号源: ${sigName}` : '信号源'
    }
  }

  if (depth < maxDepth && !term.yes) {
    // Collect existing pins
    const existing = new Set<number>()
    const srcInParams: number[] = []
    for (const p of src.pins ?? []) {
      if (p.i1?.kind === 3) {
        const idx = p.i1.index
        if (!existing.has(idx)) { existing.add(idx); srcInParams.push(idx) }
      }
    }
    srcInParams.sort()

    // Also check for missing parent-input passthroughs on composite nodes
    const missingPassthrough: number[] = []
    if (parentInputs && src.genericId?.kind === 22001) {
      const srcDef = ci.compDefs.get(src.genericId.nodeId)
      if (srcDef) {
        for (let i = 0; i < (srcDef.inputs ?? []).length; i++) {
          if (!existing.has(i)) {
            const inp = srcDef.inputs[i]
            if (inp?.name && parentInputs.nameToIdx.has(inp.name)) {
              missingPassthrough.push(i)
            }
          }
        }
      }
    }

    const seen = new Set<number>()
    for (const idx of [...srcInParams, ...missingPassthrough]) {
      if (seen.has(idx)) continue
      seen.add(idx)
      const sub = traceInParam(src, idx, allNodes, ci, depth + 1, maxDepth, parentInputs, compositePinsIdx, crossGraphCtx)
      subBranches.push(sub)
    }
  } else if (!term.yes) {
    // depth >= maxDepth 且来源非终端 → 被截断
    truncated = true
  }

  return { inParamIndex: inParamIdx, inParamName: inName, inParamType: inType, literalValue: null, source: dataSource, parentInputRef: null, subBranches, truncated }
}

// ============================================================
// 渲染 — 统一格式
// ============================================================

function renderBranch(b: InParamBranch, indent: string, depth: number): string[] {
  const lines: string[] = []
  const foldSuffix = b._foldedCount ? `  ×${b._foldedCount}` : ''
  const label = `InParam[${b.inParamIndex}] "${b.inParamName}" (${b.inParamType})${foldSuffix}`

  // 来自父复合输入参数（编译体直通）
  if (b.parentInputRef) {
    lines.push(`${indent}${label}`)
    lines.push(`${indent}  ← 父输入 "${b.parentInputRef.compositeName}"."${b.parentInputRef.inputName}"`)
    return lines
  }

  // 字面值终点
  if (b.literalValue != null) {
    lines.push(`${indent}${label}`)
    lines.push(`${indent}  = ${b.literalValue}`)
    return lines
  }

  // 未连接
  if (!b.source) {
    lines.push(`${indent}${label}  (未连接)`)
    return lines
  }

  // 有数据来源
  const s = b.source
  const srcLabel = s.isComposite
    ? `n=${s.nodeIndex}  复合:${s.nodeName.replace('复合:', '')}`
    : `n=${s.nodeIndex}  ${s.nodeName}`
  const outRef = s.outParamIndex != null
    ? `OutParam[${s.outParamIndex}]` + (s.outParamName ? ` "${s.outParamName}"` : '')
    : ''
  const noteStr = s.note ? `  (${s.note})` : ''

  lines.push(`${indent}${label}`)
  lines.push(`${indent}  <- ${srcLabel}  ${outRef}${noteStr}`)

  // 来源节点的输入参数（继续追溯）
  const childIndent = indent + '    '
  for (let i = 0; i < b.subBranches.length; i++) {
    const sub = b.subBranches[i]
    const subLines = renderBranch(sub, childIndent, depth + 1)
    for (const l of subLines) lines.push(l)
  }

  // 跨图追溯分支（进入编译体内部）
  if (s.crossGraphEntry) {
    const xg = s.crossGraphEntry
    const innerLabel = xg.innerOutParamIndex != null
      ? `内部节点 n=${xg.innerNodeIndex}  ${xg.innerNodeName}  OutParam[${xg.innerOutParamIndex}]`
      : `内部节点 n=${xg.innerNodeIndex}  ${xg.innerNodeName}`
    lines.push(`${indent}    ── ⤷ 进入 ${xg.compositeName} 编译体  ${innerLabel} ──`)
    const xgChildIndent = indent + '      '
    for (const sub of xg.branches) {
      const subLines = renderBranch(sub, xgChildIndent, depth + 1)
      for (const l of subLines) lines.push(l)
    }
  }

  // 截断标记
  if (b.truncated) {
    lines.push(`${indent}  ... (达到追溯深度限制 ${depth + 1}, 使用 --max-depth N 继续)`)
  }

  return lines
}

// ============================================================
// 嵌套 JSON 渲染（深度由结构表达）
// ============================================================

function branchToJson(b: InParamBranch): any {
  const obj: any = {
    index: b.inParamIndex,
    name: b.inParamName,
    type: b.inParamType,
  }
  if (b._foldedCount) obj.folded_count = b._foldedCount

  // 父输入直通
  if (b.parentInputRef) {
    obj.source_type = 'parent_input'
    obj.parent_composite = b.parentInputRef.compositeName
    obj.parent_input = b.parentInputRef.inputName
    return obj
  }

  // 字面值
  if (b.literalValue != null) {
    obj.source_type = 'literal'
    obj.value = b.literalValue
    return obj
  }

  // 未连接
  if (!b.source) {
    obj.source_type = 'unconnected'
    return obj
  }

  // 有数据来源
  const s = b.source
  obj.source_type = 'node'
  obj.source = {
    node: s.nodeIndex,
    name: s.nodeName,
    out_index: s.outParamIndex,
    out_name: s.outParamName,
  }
  if (s.note) obj.source.note = s.note
  if (s.isTerminal) obj.source.terminal = true

  // 来源节点的子分支
  if (b.subBranches.length > 0) {
    obj.source.inputs = b.subBranches.map(sub => branchToJson(sub))
  }

  // 跨图追溯信息（进入编译体内部）
  if (s.crossGraphEntry) {
    const xg = s.crossGraphEntry
    obj.source.cross_graph = {
      composite: xg.compositeName,
      inner_node: xg.innerNodeIndex,
      inner_node_name: xg.innerNodeName,
      inner_out_index: xg.innerOutParamIndex,
      inner_out_name: xg.innerOutParamName,
      inputs: xg.branches.map(sub => branchToJson(sub)),
    }
  }

  // 截断标记
  if (b.truncated) {
    obj.truncated = true
  }

  return obj
}

interface CallSite {
  graphLabel: string   // "主图" or "复合:xxx"
  nodeIndex: number
  nodeName: string
}

/** 在 main graph 和所有编译体 impl graph 中搜索某复合的调用点 */
function findCallSites(
  data: any,
  ci: CompIdx,
  defId: number,
  compiledId: number,
): CallSite[] {
  const sites: CallSite[] = []
  const ids = new Set([defId, compiledId])

  // 搜索主图
  const mainGraph = data.graph?.graph?.inner?.graph
  for (const n of mainGraph?.nodes ?? []) {
    if (n.genericId?.kind === 22001 && ids.has(n.genericId.nodeId)) {
      sites.push({ graphLabel: '主图', nodeIndex: n.nodeIndex, nodeName: resolveName(n, ci) })
    }
  }

  // 搜索所有编译体 impl 图
  for (const acc of data.accessories ?? []) {
    if (acc.which !== 9) continue
    const g = acc.graph?.inner?.graph
    if (!g) continue
    // 找这个编译体的名称（偶数下标是定义体）
    const defAcc = data.accessories?.find((a: any) =>
      a.compositeDef?.inner?.def && a.relatedIds?.[0]?.id === acc.id?.id
    )
    const graphName = defAcc?.compositeDef?.inner?.def?.name ?? `?`

    for (const n of g.nodes ?? []) {
      if (n.genericId?.kind === 22001 && ids.has(n.genericId.nodeId)) {
        sites.push({ graphLabel: `复合:${graphName}`, nodeIndex: n.nodeIndex, nodeName: resolveName(n, ci) })
      }
    }
  }

  return sites
}

function findNodeByIndexOrName(
  spec: string,
  nodeMap: Map<number, any>,
  ci: CompIdx,
): { node: any; index: number } | null {
  // If numeric, use direct index lookup
  if (/^\d+$/.test(spec)) {
    const idx = parseInt(spec, 10)
    const node = nodeMap.get(idx)
    return node ? { node, index: idx } : null
  }
  // Otherwise search by name (case-insensitive exact match)
  const searchName = spec.toLowerCase()
  for (const [idx, n] of nodeMap) {
    const resolved = resolveName(n, ci).toLowerCase()
    // Compare against the full resolved name or without "复合:" prefix
    if (resolved === searchName) return { node: n, index: idx }
    const stripped = resolved.replace(/^复合:/, '')
    if (stripped === searchName) return { node: n, index: idx }
  }
  return null
}

const DEFAULT_MAX_PARAMS = 3  // 省略参数索引时默认追溯前N个

interface GraphMatch {
  label: string     // 显示名，如 "主图" 或 "复合:计算分力"
  compositeName: string | null  // -c 参数值（null = 主图）
  node: any
  nodeIndex: number
}

function searchAllGraphs(
  data: any, spec: string, ci: CompIdx,
): GraphMatch[] {
  const results: GraphMatch[] = []

  // 主图
  const mainGraph = data.graph?.graph?.inner?.graph
  if (mainGraph) {
    results.push(...searchGraph(mainGraph.nodes, '主图', null, spec, ci))
  }

  // 所有编译体 impl 图
  for (const acc of data.accessories ?? []) {
    if (acc.which !== 9) continue
    const g = acc.graph?.inner?.graph
    if (!g) continue
    const defAcc = data.accessories?.find((a: any) =>
      a.compositeDef?.inner?.def && a.relatedIds?.[0]?.id === acc.id?.id
    )
    const name = defAcc?.compositeDef?.inner?.def?.name ?? '?'
    results.push(...searchGraph(g.nodes, `复合:${name}`, name, spec, ci))
  }

  return results
}

function searchGraph(
  nodes: any[], label: string, compositeName: string | null,
  spec: string, ci: CompIdx,
): GraphMatch[] {
  const nodeMap = new Map<number, any>()
  for (const n of nodes) nodeMap.set(n.nodeIndex, n)

  // 数字索引 → 精确查找
  if (/^\d+$/.test(spec)) {
    const idx = parseInt(spec, 10)
    const node = nodeMap.get(idx)
    if (node) return [{ label, compositeName, node, nodeIndex: idx }]
    return []
  }

  // 字符串名字 → 模糊匹配
  const searchName = spec.toLowerCase()
  const found: GraphMatch[] = []
  for (const [idx, n] of nodeMap) {
    const resolved = resolveName(n, ci).toLowerCase()
    if (resolved === searchName || resolved.replace(/^复合:/, '') === searchName) {
      found.push({ label, compositeName, node: n, nodeIndex: idx })
    }
  }
  return found
}

function main(): void {
  const args = process.argv.slice(2)
  const wantsHelp = args.includes('--help') || args.includes('-h')

  function printUsage(useError = false): void {
    const out = useError ? console.error : console.log
    out('用法: npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引|节点名> [参数索引...] [--composite <复合名>] [--json] [--max-depth N] [--all-params] [--list-nodes] [--quiet]')
    out('  省略 -c:        自动在所有图中按名称唯一匹配')
    out('  省略参数索引:   默认追溯前 N 个输入参数')
    out('  --json:         输出嵌套 JSON（适用于模型消费）')
    out('  --max-depth N   设置最大追溯深度（默认 5，0=无限制）')
    out('  --all-params    追溯目标节点所有输入参数')
    out('  --list-nodes/-l:列出当前图所有节点（无需节点参数）')
    out('  --help/-h:      显示帮助')
    out('  索引说明: 主图使用 main-node-index；--composite 使用 impl-node-index；两者不可混用')
    out('  提示: 用 NODE_OPTIONS=\'--no-deprecation\' 屏蔽 tsx 的 deprecation warning')
    out('  例子:')
    out('    npx tsx .../物理运动.gia --list-nodes          (列出节点)')
    out('    npx tsx .../物理运动.gia 计算合力              (全局自动匹配)')
    out('    npx tsx .../物理运动.gia 计算合力 --json      (嵌套 JSON)')
    out('    npx tsx .../物理运动.gia 5 0 1                (指定参数)')
    out('    npx tsx .../物理运动.gia 3 -c slip_velocity --max-depth 10')
  }

  if (wantsHelp) {
    printUsage()
    process.exit(0)
  }

  // Early scan for --list-nodes (无需节点参数)
  const hasListNodes = args.includes('--list-nodes') || args.includes('-l')

  if (args.length < 1) {
    printUsage(true)
    process.exit(1)
  }

  const filePath = args[0]
  const targetNodeSpec = args[1]

  // Collect numeric inParam indices and flags from remaining args
  let compositeName: string | null = null
  let paramIdxs: number[] = []
  let jsonMode = false
  let maxDepth = 5
  let allParams = false
  let listNodes = false

  // 确定标志参数的起始索引。
  // args[0] = 文件路径
  // args[1] 可能是节点规约（数字/名称）或标志（以 - 开头）
  // args[2..N] = 其余标志和参数索引
  let flagStart = 2
  if (args.length > 1 && (hasListNodes || args[1].startsWith('-'))) {
    flagStart = 1  // args[1] 是标志不是节点规约
  }
  for (let i = flagStart; i < args.length; i++) {
    if (args[i] === '--composite' || args[i] === '-c') {
      compositeName = args[i + 1] ?? null
      if (compositeName == null || compositeName.startsWith('-')) {
        console.error('❌ --composite / -c 需要指定复合名称'); process.exit(1)
      }
      i++  // skip the value
    } else if (args[i].startsWith('--composite=')) {
      compositeName = args[i].slice('--composite='.length)
    } else if (args[i].startsWith('-c=')) {
      compositeName = args[i].slice('-c='.length)
    } else if (args[i] === '--json') {
      jsonMode = true
    } else if (args[i] === '--max-depth' || args[i] === '-d') {
      const n = parseInt(args[i + 1], 10)
      if (isNaN(n) || n < 0) { console.error('❌ --max-depth 需要非负整数'); process.exit(1) }
      maxDepth = n
      i++
    } else if (args[i].startsWith('--max-depth=')) {
      const n = parseInt(args[i].slice('--max-depth='.length), 10)
      if (isNaN(n) || n < 0) { console.error('❌ --max-depth 需要非负整数'); process.exit(1) }
      maxDepth = n
    } else if (args[i] === '--all-params') {
      allParams = true
    } else if (args[i] === '--list-nodes' || args[i] === '-l') {
      listNodes = true
    } else if (/^\d+$/.test(args[i])) {
      paramIdxs.push(parseInt(args[i], 10))
    }
  }
  // maxDepth=0 表示无限制
  if (maxDepth === 0) maxDepth = Infinity

  if (!(hasListNodes || listNodes) && (targetNodeSpec == null || targetNodeSpec.startsWith('-'))) {
    console.error('❌ 缺少目标节点（节点索引或节点名）')
    printUsage(true)
    process.exit(1)
  }

  let data: any
  try { data = decode_gia_file(filePath) } catch (e: any) { console.error(`❌ 解码失败: ${e.message}`); process.exit(1) }

  const ci = buildCompIdx(data)
  const crossGraphCtx = buildCrossGraphContext(data)

  // ── --list-nodes: 列出节点 ──
  if (hasListNodes || listNodes) {
    let graphNodes: any[]
    let graphLabel: string

    if (compositeName) {
      // 找到复合定义
      let defAcc: any = null
      for (const a of data.accessories ?? []) {
        const d = a.compositeDef?.inner?.def
        if (d?.name === compositeName) defAcc = a
      }
      if (!defAcc) { console.error(`❌ 未找到复合定义 "${compositeName}"`); process.exit(1) }
      const compiledId = defAcc.relatedIds?.[0]?.id
      if (compiledId == null) { console.error(`❌ 复合 "${compositeName}" 没有关联编译体`); process.exit(1) }
      let compiledAcc: any = null
      for (const a of data.accessories ?? []) { if (a.id?.id === compiledId) compiledAcc = a }
      if (!compiledAcc) { console.error(`❌ 未找到编译体 id=${compiledId}`); process.exit(1) }
      const implGraph = compiledAcc.graph?.inner?.graph
      if (!implGraph) { console.error(`❌ 编译体 "${compositeName}" 没有 impl 图`); process.exit(1) }
      graphNodes = implGraph.nodes
      graphLabel = `复合:${compositeName}`
    } else {
      graphNodes = data.graph?.graph?.inner?.graph?.nodes
      if (!graphNodes) { console.error('❌ 未找到主图'); process.exit(1) }
      graphLabel = '主图'
    }

    console.log(`📋 ${graphLabel} 节点列表:`)
    if (jsonMode) {
      const nodeList = graphNodes.map((n: any) => {
        const term = isTerminalNode(n)
        return {
          index: n.nodeIndex,
          name: resolveName(n, ci),
          nid: n.genericId?.nodeId ?? null,
          kind: n.genericId?.kind ?? null,
          pins: (n.pins ?? []).length,
          terminal: term.yes,
          note: term.note,
        }
      })
      console.log(JSON.stringify(nodeList, null, 2))
    } else {
      const sorted = [...graphNodes].sort((a: any, b: any) => a.nodeIndex - b.nodeIndex)
      for (const n of sorted) {
        const name = resolveName(n, ci)
        const nid = n.genericId?.nodeId
        const kind = n.genericId?.kind
        const pins = (n.pins ?? []).length
        const term = isTerminalNode(n)
        const termMark = term.yes ? term.note ? `  term(${term.note})` : '  term' : ''
        console.log(`${String(n.nodeIndex).padStart(3)}  ${String(name).padEnd(36)}  nid=${String(nid ?? '?').padEnd(12)}  kind=${String(kind ?? '?').padEnd(7)}  pins=${pins}${termMark}`)
      }
    }
    process.exit(0)
  }

  // Determine which graph to use: main graph or composite impl graph
  let nodeMap: Map<number, any>
  let targetNode: any
  let parentInputs: ParentInputMap | undefined = undefined
  let compositePinsIdx: CompositePinsIndex | undefined = undefined
  let defAcc: any = null       // composite definition (for parent-input tracking)
  let defId: number | null = null
  let compiledId: number | null = null
  let targetName: string
  let targetNodeIdx: number | null = null   // resolved index

  if (compositeName) {
    // ── -c 指定模式（精确图）──
    let compiledAcc: any = null
    for (const a of data.accessories ?? []) {
      const d = a.compositeDef?.inner?.def
      if (d?.name === compositeName) defAcc = a
    }
    if (!defAcc) { console.error(`❌ 未找到复合定义 "${compositeName}"`); process.exit(1) }
    defId = defAcc.id?.id ?? null

    compiledId = defAcc.relatedIds?.[0]?.id
    if (compiledId == null) { console.error(`❌ 复合 "${compositeName}" 没有关联编译体`); process.exit(1) }
    for (const a of data.accessories ?? []) {
      if (a.id?.id === compiledId) compiledAcc = a
    }
    if (!compiledAcc) { console.error(`❌ 未找到编译体 id=${compiledId}`); process.exit(1) }

    const implGraph = compiledAcc.graph?.inner?.graph
    if (!implGraph) { console.error(`❌ 编译体 "${compositeName}" 没有 impl 图`); process.exit(1) }

    nodeMap = new Map<number, any>()
    for (const n of implGraph.nodes) nodeMap.set(n.nodeIndex, n)

    // Look up by index or name
    const found = findNodeByIndexOrName(targetNodeSpec, nodeMap, ci)
    if (!found) {
      console.error(`❌ 在 "${compositeName}" impl 图中未找到 "${targetNodeSpec}"`)
      console.error('提示: --composite 模式要求使用该复合 --list-nodes 输出中的 impl-node-index；主图节点索引不能直接使用')
      console.error('可用节点:')
      for (const [idx, n] of nodeMap) {
        if (n.genericId?.kind === 22001) console.error(`  ${idx}: ${resolveName(n, ci)}`)
      }
      process.exit(1)
    }
    targetNode = found.node
    targetNodeIdx = found.index

    // Build parentInputs: name→idx and idx→name for parent-input passthrough detection
    const def = defAcc.compositeDef.inner.def
    const nameToIdx = new Map<string, { index: number; pinIndex: number }>()
    const idxToName = new Map<number, string>()
    for (let i = 0; i < (def.inputs ?? []).length; i++) {
      const inp = def.inputs[i]
      if (inp?.name) {
        nameToIdx.set(inp.name, { index: i, pinIndex: inp.pinIndex })
        idxToName.set(i, inp.name)
      }
    }
    parentInputs = { nameToIdx, idxToName, parentName: compositeName }

    // Build compositePins index for accurate parent-input mapping
    compositePinsIdx = buildCompositePinsIndex(implGraph)

    targetName = resolveName(targetNode, ci)
    console.log(`\n数据流追溯: 复合 "${compositeName}" impl 图 · n=${targetNodeIdx}  ${targetName}`)

  } else if (/^\d+$/.test(targetNodeSpec)) {
    // ── 数字索引模式 → 主图 ──
    const mainGraph = data.graph?.graph?.inner?.graph
    if (!mainGraph) { console.error('❌ 未找到主图'); process.exit(1) }

    nodeMap = new Map<number, any>()
    for (const n of mainGraph.nodes) nodeMap.set(n.nodeIndex, n)

    targetNode = nodeMap.get(parseInt(targetNodeSpec, 10))
    if (!targetNode) { console.error(`❌ 主图中未找到节点 n=${targetNodeSpec}`); process.exit(1) }

    targetNodeIdx = parseInt(targetNodeSpec, 10)
    targetName = resolveName(targetNode, ci)
    console.log(`\n数据流追溯: n=${targetNodeIdx}  ${targetName}`)

  } else {
    // ── 名字模式 → 全局搜索 ──
    const matches = searchAllGraphs(data, targetNodeSpec, ci)

    if (matches.length === 0) {
      console.error(`❌ 在所有图中都未找到 "${targetNodeSpec}"`)
      process.exit(1)
    }

    if (matches.length === 1) {
      // 唯一匹配 → 自动使用
      const m = matches[0]
      if (m.compositeName) {
        // 在 impl 图中：自动进入复合模式
        compositeName = m.compositeName
        console.log(`✓ 在 ${m.label} 中唯一匹配，自动进入复合模式`)

        // 重新完成复合模式的初始化
        for (const a of data.accessories ?? []) {
          const d = a.compositeDef?.inner?.def
          if (d?.name === compositeName) defAcc = a
        }
        if (!defAcc) { console.error(`❌ 内部错误：未找到复合 "${compositeName}"`); process.exit(1) }
        defId = defAcc.id?.id ?? null

        compiledId = defAcc.relatedIds?.[0]?.id
        if (compiledId == null) { console.error(`❌ 复合 "${compositeName}" 没有关联编译体`); process.exit(1) }
        let compiledAcc: any = null
        for (const a of data.accessories ?? []) {
          if (a.id?.id === compiledId) compiledAcc = a
        }
        if (!compiledAcc) { console.error(`❌ 未找到编译体 id=${compiledId}`); process.exit(1) }

        const implGraph = compiledAcc.graph?.inner?.graph
        if (!implGraph) { console.error(`❌ 编译体 "${compositeName}" 没有 impl 图`); process.exit(1) }

        nodeMap = new Map<number, any>()
        for (const n of implGraph.nodes) nodeMap.set(n.nodeIndex, n)

        targetNode = m.node
        targetNodeIdx = m.nodeIndex

        const def = defAcc.compositeDef.inner.def
        const nameToIdx = new Map<string, { index: number; pinIndex: number }>()
        const idxToName = new Map<number, string>()
        for (let i = 0; i < (def.inputs ?? []).length; i++) {
          const inp = def.inputs[i]
          if (inp?.name) { nameToIdx.set(inp.name, { index: i, pinIndex: inp.pinIndex }); idxToName.set(i, inp.name) }
        }
        parentInputs = { nameToIdx, idxToName, parentName: compositeName }
        compositePinsIdx = buildCompositePinsIndex(implGraph)

        targetName = resolveName(targetNode, ci)
        console.log(`\n数据流追溯: 复合 "${compositeName}" impl 图 · n=${targetNodeIdx}  ${targetName}`)
      } else {
        // 主图
        nodeMap = new Map()
        for (const n of data.graph?.graph?.inner?.graph.nodes) nodeMap.set(n.nodeIndex, n)
        targetNode = m.node
        targetNodeIdx = m.nodeIndex
        targetName = resolveName(targetNode, ci)
        console.log(`\n数据流追溯: n=${targetNodeIdx}  ${targetName}`)
      }
    }

    if (matches.length > 1) {
      console.error(`❌ "${targetNodeSpec}" 在多个图中匹配，请用 -c 指定：`)
      for (const m of matches) {
        const hint = m.compositeName ? `-c "${m.compositeName}"` : '(主图，直接使用索引)'
        console.error(`  ${m.label} n=${m.nodeIndex}  ${resolveName(m.node, ci)}  →  ${hint}`)
      }
      process.exit(1)
    }
  }

  // Auto-detect params if not specified
  if (allParams) {
    // 追溯所有输入参数
    if (targetNode.genericId?.kind === 22001) {
      const subDef = ci.compDefs.get(targetNode.genericId.nodeId)
      if (subDef?.inputs) {
        paramIdxs = subDef.inputs.map((_: any, i: number) => i)
      }
    } else {
      const nid = targetNode.genericId?.nodeId
      const types = nid != null ? getInputTypes(nid) : []
      paramIdxs = types.map((_: any, i: number) => i)
    }
    // 退回基于 pins 的检测
    if (paramIdxs.length === 0) {
      paramIdxs = (targetNode.pins ?? [])
        .filter((p: any) => p.i1?.kind === 3)
        .map((p: any) => p.i1.index)
    }
  } else if (paramIdxs.length === 0) {
    if (targetNode.genericId?.kind === 22001) {
      const subDef = ci.compDefs.get(targetNode.genericId.nodeId)
      if (subDef?.inputs) {
        for (let i = 0; i < Math.min(subDef.inputs.length, DEFAULT_MAX_PARAMS); i++) paramIdxs.push(i)
      }
    }
    if (paramIdxs.length === 0) {
      const nid = targetNode.genericId?.nodeId
      const types = nid != null ? getInputTypes(nid) : []
      for (let i = 0; i < Math.min(types.length, DEFAULT_MAX_PARAMS); i++) paramIdxs.push(i)
    }
    if (paramIdxs.length === 0) paramIdxs = [0, 1, 2]
  }

  // Trace each requested param
  let foundPassthrough = false
  const paramBranches: { idx: number; branch: InParamBranch }[] = []

  for (const inParamIdx of paramIdxs) {
    if (!compositeName) {
      const hasPin = (targetNode.pins ?? []).some((p: any) => p.i1?.kind === 3 && p.i1?.index === inParamIdx)
      if (!hasPin) { continue }
    }

    const branch = traceInParam(targetNode, inParamIdx, nodeMap, ci, 0, maxDepth, parentInputs, compositePinsIdx, crossGraphCtx)
    paramBranches.push({ idx: inParamIdx, branch })
    if (branch.parentInputRef) foundPassthrough = true
  }

  // 折叠连续相同的字面值参数（如 Assembly List 的 99 个 0）
  const FOLD_THRESHOLD = 5
  function isLiteralEqual(a: InParamBranch, b: InParamBranch): boolean {
    return a.literalValue != null && b.literalValue != null && a.literalValue === b.literalValue
  }
  const foldedBranches: { idx: number; branch: InParamBranch }[] = []
  let i = 0
  while (i < paramBranches.length) {
    let j = i + 1
    while (j < paramBranches.length && isLiteralEqual(paramBranches[i].branch, paramBranches[j].branch)) j++
    if (j - i >= FOLD_THRESHOLD) {
      // 折叠
      const rep = paramBranches[i]
      const count = j - i
      // 创建一个合成分支代表整个折叠
      const folded: InParamBranch = {
        inParamIndex: rep.branch.inParamIndex,
        inParamName: `${rep.branch.inParamName}[${count}]`,
        inParamType: rep.branch.inParamType,
        literalValue: rep.branch.literalValue,
        source: null,
        parentInputRef: null,
        subBranches: [],
        truncated: false,
        _foldedCount: count,
      }
      foldedBranches.push({ idx: rep.idx, branch: folded })
      i = j
    } else {
      foldedBranches.push(paramBranches[i])
      i++
    }
  }

  // Build graph label for JSON output
  const graphLabel = compositeName ? `复合:${compositeName}` : '主图'

  // Render folded results
  const paramResults: any[] = []
  for (const { idx, branch } of foldedBranches) {
    if (jsonMode) {
      paramResults.push(branchToJson(branch))
    } else {
      console.log()
      const lines = renderBranch(branch, '', 0)
      for (const l of lines) console.log(l)
    }
  }

  // --json: 输出完整嵌套 JSON
  if (jsonMode) {
    const output: any = {
      graph: graphLabel,
      node: targetNodeIdx,
      node_name: targetName,
      params: paramResults,
    }
    // 如果有上层调用，追加
    const sites = foundPassthrough && defAcc && defId != null && compiledId != null
      ? findCallSites(data, ci, defId, compiledId)
      : []
    if (sites.length > 0) {
      output.call_sites = sites.map(s => ({
        graph: s.graphLabel,
        node: s.nodeIndex,
        node_name: s.nodeName,
      }))
    }
    // 无参节点提示（避免误判为"工具不兼容"）
    if (paramResults.length === 0) {
      output._info = '该节点没有输入参数（InParam），通常是终端节点（事件上下文、图变量读取、纯执行流节点）。使用 --list-nodes 查看节点列表。'
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  // 树模式：显示上层调用信息
  if (foundPassthrough && defAcc && defId != null && compiledId != null) {
    const sites = findCallSites(data, ci, defId, compiledId)
    if (sites.length > 0) {
      console.log()
      console.log(`[上层调用] "${compositeName}" 被调用于：`)
      for (const s of sites) {
        const label = s.graphLabel.replace('复合:', '')
        console.log(`  ${label} n=${s.nodeIndex}  ${s.nodeName}`)
      }
      const parentGraph = sites[0].graphLabel.replace('复合:', '')
      if (parentGraph !== '主图') {
        console.log(`→ 使用 --composite "${parentGraph}" 向上一级追溯`)
      }
    }
  }
  console.log()
}

main()
