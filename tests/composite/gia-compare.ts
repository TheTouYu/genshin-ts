// @ts-nocheck
/**
 * GIA 多维度结构化语义对比工具
 *
 * 对两个 GIA 文件执行语义级别对比（按名称配对 accessory，按角色匹配节点），
 * 输出可读的差异报告。相比 gia-diff.ts 的逐路径 diff，本工具做语义匹配和维度聚合。
 *
 * 用法:
 *   npx tsx tests/composite/gia-compare.ts <ref.gia> <gen.gia>            完整对比
 *   npx tsx tests/composite/gia-compare.ts <ref.gia> <gen.gia> -q          安静模式：仅退出码
 *   npx tsx tests/composite/gia-compare.ts <ref.gia> <gen.gia> --verbose   详细模式
 *
 * 退出码: 0=完全一致, 1=有差异, 2=用法错误
 */
import { decode_gia_file } from '../../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { readFileSync } from 'fs'

const PROTO = '/home/h/genshin-ts/dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

// ── 命令行解析 ──
const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('-')))
const paths = args.filter(a => !a.startsWith('-'))
const refPath = paths[0]
const genPath = paths[1]
const quiet = flags.has('-q') || flags.has('--quiet')
const verbose = flags.has('--verbose')

if (!refPath || !genPath) {
  console.log([
    '用法: npx tsx tests/composite/gia-compare.ts <ref.gia> <gen.gia> [flags]',
    '',
    'Flags:',
    '  -q, --quiet  安静模式：仅输出退出码（0=一致, 1=有差异）',
    '  --verbose    详细模式：显示所有匹配信息',
  ].join('\n'))
  process.exit(2)
}

// ── 输出辅助：仅在非安静模式下打印 ──
const print = (...args: any[]) => { if (!quiet) console.log(...args) }

// ── 加载 ──
if (!quiet) {
  const refSize = readFileSync(refPath).length
  const genSize = readFileSync(genPath).length
  print(`REF: ${refPath} (${refSize}B)`)
  print(`GEN: ${genPath} (${genSize}B)`)
  print('')
}

const ref = decode_gia_file(refPath, PROTO)
const gen = decode_gia_file(genPath, PROTO)

// ═══════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════

const PIN_KIND: Record<number, string> = { 0: '?', 1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam' }
function kindName(k: number | undefined): string { return PIN_KIND[k ?? -1] ?? `?${k}` }

const NODE_NAMES: Record<number, string> = {
  1: 'print_string', 2: 'branch', 3: 'multi_branch',
  5: 'finite_loop', 6: 'break_loop', 7: 'create_3d_vector',
  9: 'vec3_length', 10: 'cross_product', 11: 'dot_product',
  12: 'scalar_mul', 14: 'equal', 15: 'not_equal',
  18: 'greater_than', 19: 'less_than', 22: 'set_variable',
  50: 'get_variable', 71: 'event',
  73: 'empty', 74: 'get_object_property', 75: 'get_self_entity',
  79: 'assembly_list', 83: 'assembly_dict',
  94: 'play_effect', 95: 'remove_effect',
  99: 'connector', 135: 'send_signal',
  169: 'assembly_struct', 180: 'data_type_conv',
  200: 'addition', 202: 'subtraction', 204: 'multiplication',
  211: 'division', 213: 'modulo', 216: 'absolute_value',
  220: 'sqrt', 225: 'create_vec3',
  259: 'get_component', 310: 'get_world_time',
  323: 'set_variable_str', 337: 'get_entity_by_tag',
  387: 'enum_comparison', 395: 'get_skill_cd',
  397: 'set_skill_cd', 399: 'reset_skill_cd',
  474: 'vec3_addition', 505: 'subtract_3d',
  506: 'multiply_3d', 739: 'set_attribute',
}

function nodeLabel(nodeId: number): string {
  const name = NODE_NAMES[nodeId] ?? ''
  return name ? `nodeId=${nodeId} (${name})` : `nodeId=${nodeId}`
}

// 记录所有差异的总数（每个维度内部维护自己的计数器）
let totalDiffs = 0

// ═══════════════════════════════════════════════════════
// 1. 辅助函数：提取 accessory 列表
// ═══════════════════════════════════════════════════════

function getAccessories(data: any): any[] {
  return data.accessories ?? []
}

function getCompositeDefName(acc: any): string | undefined {
  return acc?.compositeDef?.inner?.def?.name
}

function getImplGraph(acc: any): any | undefined {
  return acc?.graph?.inner?.graph
}

function getCompositeDef(acc: any): any | undefined {
  return acc?.compositeDef?.inner?.def
}

// ═══════════════════════════════════════════════════════
// 2. 语义匹配：accessory 配对
// ═══════════════════════════════════════════════════════

interface AccPair {
  refIdx: number
  genIdx: number
  label: string      // CompositeDef 名称
  refAcc: any
  genAcc: any
  refDef: any
  genDef: any
  refImpl: any
  genImpl: any
}

function matchByCompositeName(rAcc: any[], gAcc: any[]): AccPair[] {
  // 先收集所有 CompositeDef (which=12)
  const rDefIdx: number[] = []
  const gDefIdx: number[] = []
  const gUsed = new Set<number>()

  rAcc.forEach((a, i) => { if (a?.which === 12 && getCompositeDefName(a)) rDefIdx.push(i) })
  gAcc.forEach((a, i) => { if (a?.which === 12 && getCompositeDefName(a)) gDefIdx.push(i) })

  const pairs: AccPair[] = []

  // 按名称匹配 CompositeDef
  for (const ri of rDefIdx) {
    const rName = getCompositeDefName(rAcc[ri])!
    let bestJ = -1
    for (const gj of gDefIdx) {
      if (gUsed.has(gj)) continue
      const gName = getCompositeDefName(gAcc[gj])
      if (rName === gName) { bestJ = gj; break }
    }
    if (bestJ >= 0) {
      gUsed.add(bestJ)

      // 找紧随其后的 impl graph (which=9)
      const rImpl = rAcc[ri]      // CompositeDef
      const gImpl = gAcc[bestJ]   // CompositeDef

      let rImplIdx = -1, gImplIdx = -1
      for (let i = ri + 1; i < rAcc.length && i <= ri + 3; i++) {
        if (rAcc[i]?.which === 9 && rAcc[i]?.id?.id === rImpl?.compositeDef?.inner?.def?.id?.graphId?.id) {
          rImplIdx = i; break
        }
      }
      // fallback: 直接找紧随其后的 impl
      if (rImplIdx < 0 && ri + 1 < rAcc.length && rAcc[ri + 1]?.which === 9) rImplIdx = ri + 1

      for (let i = bestJ + 1; i < gAcc.length && i <= bestJ + 3; i++) {
        if (gAcc[i]?.which === 9 && gAcc[i]?.id?.id === gImpl?.compositeDef?.inner?.def?.id?.graphId?.id) {
          gImplIdx = i; break
        }
      }
      if (gImplIdx < 0 && bestJ + 1 < gAcc.length && gAcc[bestJ + 1]?.which === 9) gImplIdx = bestJ + 1

      pairs.push({
        refIdx: ri,
        genIdx: bestJ,
        label: rName,
        refAcc: rAcc[ri],
        genAcc: gAcc[bestJ],
        refDef: getCompositeDef(rAcc[ri]),
        genDef: getCompositeDef(gAcc[bestJ]),
        refImpl: rImplIdx >= 0 ? getImplGraph(rAcc[rImplIdx]) : undefined,
        genImpl: gImplIdx >= 0 ? getImplGraph(gAcc[gImplIdx]) : undefined,
      })
    }
  }

  if (verbose) {
    print(`语义匹配: REF ${rDefIdx.length} 个定义, GEN ${gDefIdx.length} 个定义 → ${pairs.length} 对匹配`)
    const unmatchedRef = rDefIdx.filter(ri => !pairs.some(p => p.refIdx === ri))
    const unmatchedGen = gDefIdx.filter(gi => !pairs.some(p => p.genIdx === gi))
    if (unmatchedRef.length) print(`  未匹配 REF: ${unmatchedRef.map(i => getCompositeDefName(rAcc[i])).join(', ')}`)
    if (unmatchedGen.length) print(`  未匹配 GEN: ${unmatchedGen.map(i => getCompositeDefName(gAcc[i])).join(', ')}`)
  }

  return pairs
}

// ═══════════════════════════════════════════════════════
// 3. 提取数据流连接（InParam → OutParam connects）
// ═══════════════════════════════════════════════════════

interface DataConnection {
  from: { nodeIndex: number; nodeId: number; pinKind: number; pinIndex: number }  // OutParam
  to: { nodeIndex: number; nodeId: number; pinKind: number; pinIndex: number }    // InParam (via connects)
}

/** 从 impl graph 提取所有 OutParam→InParam 数据连线 */
function extractDataConnections(graph: any): DataConnection[] {
  const conns: DataConnection[] = []
  const nodes = graph?.nodes ?? []
  const nodeMap = new Map<number, any>()
  for (const n of nodes) nodeMap.set(n.nodeIndex, n)

  for (const srcNode of nodes) {
    const srcNodeId = srcNode.genericId?.nodeId ?? srcNode.concreteId?.nodeId ?? 0
    const pins = srcNode.pins ?? []
    for (const pin of pins) {
      // 只看 OutParam (kind=4) 的 pin —— 它们有 connects 指向下游 InParam
      const kind = pin.i1?.kind
      if (kind === 4) { // OutParam
        const connects = pin.connects ?? []
        for (const c of connects) {
          const targetNode = nodeMap.get(c.id)
          const targetNodeId = targetNode ? (targetNode.genericId?.nodeId ?? targetNode.concreteId?.nodeId ?? 0) : 0
          conns.push({
            from: { nodeIndex: srcNode.nodeIndex, nodeId: srcNodeId, pinKind: kind, pinIndex: pin.i1?.index },
            to: { nodeIndex: c.id, nodeId: targetNodeId, pinKind: c.connect?.kind, pinIndex: c.connect?.index },
          })
        }
      }
    }
  }
  return conns
}

/** 格式化单条数据连接 */
function formatDataConnection(c: DataConnection): string {
  return `n[${c.from.nodeIndex}](nodeId=${c.from.nodeId}) OutParam:${c.from.pinIndex} → n[${c.to.nodeIndex}](nodeId=${c.to.nodeId}) InParam:${c.to.pinIndex}`
}

/** 数据连接的规范化key（用于去重和比较） */
function dataConnKey(c: DataConnection): string {
  return `${c.from.nodeId}:${c.from.pinIndex}→${c.to.nodeId}:${c.to.pinIndex}`
}

// ═══════════════════════════════════════════════════════
// 4. 提取执行流连接（OutFlow → InFlow connects + compositePins）
// ═══════════════════════════════════════════════════════

interface ExecConnection {
  from: { nodeIndex: number; nodeId: number; pinKind: number; pinIndex: number }
  to: { nodeIndex: number; nodeId: number; pinKind: number; pinIndex: number }
  isCompositePin: boolean  // 是否通过 compositePins 路由
}

/** 从 impl graph 提取执行流连线（OutFlow → InFlow） */
function extractExecConnections(graph: any): ExecConnection[] {
  const conns: ExecConnection[] = []
  const nodes = graph?.nodes ?? []
  const nodeMap = new Map<number, any>()
  for (const n of nodes) nodeMap.set(n.nodeIndex, n)

  for (const srcNode of nodes) {
    const srcNodeId = srcNode.genericId?.nodeId ?? srcNode.concreteId?.nodeId ?? 0
    const pins = srcNode.pins ?? []
    for (const pin of pins) {
      const kind = pin.i1?.kind
      if (kind === 2) { // OutFlow
        const connects = pin.connects ?? []
        for (const c of connects) {
          const targetNode = nodeMap.get(c.id) ?? { nodeIndex: c.id }
          const targetNodeId = targetNode ? (targetNode.genericId?.nodeId ?? targetNode.concreteId?.nodeId ?? 0) : 0
          conns.push({
            from: { nodeIndex: srcNode.nodeIndex, nodeId: srcNodeId, pinKind: 2, pinIndex: pin.i1?.index },
            to: { nodeIndex: c.id, nodeId: targetNodeId, pinKind: c.connect?.kind, pinIndex: c.connect?.index },
            isCompositePin: false,
          })
        }
      }
    }
  }

  // 通过 compositePins 路由的执行流：OutFlow compositePin → innnerNode
  const compositePins = graph?.compositePins ?? []
  for (const cp of compositePins) {
    if (cp.outerPin?.kind === 2) { // OutFlow 通过 compositePin 映射
      const innerNode = nodeMap.get(cp.innerNodeId)
      const innerNodeId = innerNode ? (innerNode.genericId?.nodeId ?? innerNode.concreteId?.nodeId ?? 0) : 0
      conns.push({
        from: { nodeIndex: -1, nodeId: 0, pinKind: 2, pinIndex: cp.outerPin?.index },      // 外部
        to: { nodeIndex: cp.innerNodeId, nodeId: innerNodeId, pinKind: cp.innerPin?.kind, pinIndex: cp.innerPin?.index },
        isCompositePin: true,
      })
    }
    if (cp.outerPin?.kind === 1) { // InFlow 通过 compositePin 映射
      const innerNode = nodeMap.get(cp.innerNodeId)
      const innerNodeId = innerNode ? (innerNode.genericId?.nodeId ?? innerNode.concreteId?.nodeId ?? 0) : 0
      conns.push({
        from: { nodeIndex: -1, nodeId: 0, pinKind: 1, pinIndex: cp.outerPin?.index },      // 外部
        to: { nodeIndex: cp.innerNodeId, nodeId: innerNodeId, pinKind: cp.innerPin?.kind, pinIndex: cp.innerPin?.index },
        isCompositePin: true,
      })
    }
  }

  return conns
}

function execConnKey(c: ExecConnection): string {
  return `${c.from.pinKind}:${c.from.pinIndex}→${c.to.nodeId}:${c.to.pinKind}:${c.to.pinIndex}`
}

// ═══════════════════════════════════════════════════════
// 5. 节点类型分布
// ═══════════════════════════════════════════════════════

function nodeTypeDistribution(graph: any): Map<number, number> {
  const dist = new Map<number, number>()
  const nodes = graph?.nodes ?? []
  for (const n of nodes) {
    const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
    dist.set(nid, (dist.get(nid) ?? 0) + 1)
  }
  return dist
}

// ═══════════════════════════════════════════════════════
// 6. 参数类型提取
// ═══════════════════════════════════════════════════════

interface ParamTypeInfo {
  kind: number      // 3=InParam, 4=OutParam
  index: number
  varClass: number  // VarBase.Class
  type1: number     // VarType (type field of ParameterFlow.Type)
  type2: number
}

function extractParamTypes(def: any): ParamTypeInfo[] {
  const result: ParamTypeInfo[] = []
  const inputs = def?.inputs ?? []
  const outputs = def?.outputs ?? []
  for (const inp of inputs) {
    result.push({
      kind: 3,
      index: inp.index?.index ?? 0,
      varClass: inp.type?.class ?? 0,
      type1: inp.type?.type1 ?? 0,
      type2: inp.type?.type2 ?? 0,
    })
  }
  for (const outp of outputs) {
    result.push({
      kind: 4,
      index: outp.index?.index ?? 0,
      varClass: outp.type?.class ?? 0,
      type1: outp.type?.type1 ?? 0,
      type2: outp.type?.type2 ?? 0,
    })
  }
  return result
}

// ═══════════════════════════════════════════════════════
// 差异报告器
// ═══════════════════════════════════════════════════════

function reportSection(title: string) {
  print(`\n${'═'.repeat(20)} ${title} ${'═'.repeat(20)}`)
}

// ═══════════════════════════════════════════════════════
// DIMENSION 1: 复合定义概要
// ═══════════════════════════════════════════════════════

function compareCompositeDefs(pairs: AccPair[]): number {
  let diffs = 0

  reportSection('复合定义对比')
  print('  名称           REF      GEN     状态')

  for (const pair of pairs) {
    const rd = pair.refDef
    const gd = pair.genDef
    if (!rd || !gd) {
      print(`  ${pair.label.padEnd(14)} —       —       ⚠️ 定义缺失`)
      diffs++
      continue
    }

    const rIn = rd.inflows?.length ?? 0
    const rOut = rd.outflows?.length ?? 0
    const rInP = rd.inputs?.length ?? 0
    const rOutP = rd.outputs?.length ?? 0
    const gIn = gd.inflows?.length ?? 0
    const gOut = gd.outflows?.length ?? 0
    const gInP = gd.inputs?.length ?? 0
    const gOutP = gd.outputs?.length ?? 0

    const rDesc = `${rIn}i/${rOutP}o`
    const gDesc = `${gIn}i/${gOutP}o`

    const flowMatch = rIn === gIn && rOut === gOut
    const paramMatch = rInP === gInP && rOutP === gOutP
    const ok = flowMatch && paramMatch

    const badFields: string[] = []
    if (rIn !== gIn) badFields.push(`inflow ${rIn}≠${gIn}`)
    if (rOut !== gOut) badFields.push(`outflow ${rOut}≠${gOut}`)
    if (rInP !== gInP) badFields.push(`input ${rInP}≠${gInP}`)
    if (rOutP !== gOutP) badFields.push(`output ${rOutP}≠${gOutP}`)

    const status = ok ? '✅' : `❌ ${badFields.join(', ')}`
    const fullRef = `${rIn}i/${rOut}o/${rInP}p/${rOutP}p`
    const fullGen = `${gIn}i/${gOut}o/${gInP}p/${gOutP}p`
    print(`  ${pair.label.padEnd(14)} ${fullRef.padEnd(12)} ${fullGen.padEnd(12)} ${status}`)

    if (!ok) diffs += badFields.length
  }

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 2: 节点类型分布
// ═══════════════════════════════════════════════════════

function compareNodeDistribution(pairs: AccPair[]): number {
  let diffs = 0

  // 合并所有 impl graph 的节点类型统计
  const refGlobal = new Map<number, number>()
  const genGlobal = new Map<number, number>()

  for (const pair of pairs) {
    for (const [nid, cnt] of nodeTypeDistribution(pair.refImpl)) {
      refGlobal.set(nid, (refGlobal.get(nid) ?? 0) + cnt)
    }
    for (const [nid, cnt] of nodeTypeDistribution(pair.genImpl)) {
      genGlobal.set(nid, (genGlobal.get(nid) ?? 0) + cnt)
    }
  }

  const allNodeIds = new Set([...refGlobal.keys(), ...genGlobal.keys()])
  const sorted = [...allNodeIds].sort((a, b) => a - b)

  reportSection('节点类型分布')
  print(`  nodeId       REF  GEN   Δ`)

  for (const nid of sorted) {
    const rc = refGlobal.get(nid) ?? 0
    const gc = genGlobal.get(nid) ?? 0
    const delta = gc - rc
    const marker = delta === 0 ? '' : delta > 0 ? `+${delta} ⚠️` : `${delta} ⚠️`
    const name = NODE_NAMES[nid] ? ` (${NODE_NAMES[nid]})` : ''
    if (verbose || delta !== 0) {
      print(`  nodeId=${nid}${name.padEnd(20)} ${String(rc).padEnd(4)} ${String(gc).padEnd(4)} ${marker}`)
    }
    if (delta !== 0) diffs++
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 3: 数据连线对比 (InParam → OutParam)
// ═══════════════════════════════════════════════════════

function compareDataConnections(pairs: AccPair[]): number {
  let diffs = 0
  reportSection('数据连线对比')

  for (const pair of pairs) {
    const refConns = pair.refImpl ? extractDataConnections(pair.refImpl) : []
    const genConns = pair.genImpl ? extractDataConnections(pair.genImpl) : []

    const refKeys = new Set(refConns.map(dataConnKey))
    const genKeys = new Set(genConns.map(dataConnKey))

    const missing = [...refKeys].filter(k => !genKeys.has(k))
    const extra = [...genKeys].filter(k => !refKeys.has(k))

    // 语义匹配：对 nodeId+pinIndex 相同但 nodeIndex 不同的连线做宽松比较
    // 这里我们用 key（格式: "nodeId:pinIndex→nodeId:pinIndex"）已经忽略了 nodeIndex，
    // 但 nodeId 可能因为编码差异而不同（REF 和 GEN 的 ID 分配策略不同）。
    // 所以我们先用严格匹配，如果不匹配则尝试纯 pinIndex 匹配

    if (missing.length === 0 && extra.length === 0) {
      if (verbose) print(`  ${pair.label}: ${refConns.length}条 ✅`)
    } else {
      diffs += Math.max(missing.length, extra.length)
      print(`  ${pair.label}: REF ${refConns.length}条 GEN ${genConns.length}条 ${missing.length > 0 || extra.length > 0 ? '❌' : '⚠️'}`)
      for (const m of missing) {
        const refConn = refConns.find(c => dataConnKey(c) === m)
        if (refConn) print(`    REF: ${formatDataConnection(refConn)}`)
      }
      if (missing.length > 0 && extra.length === 0) print(`    GEN: (缺失)`)
      for (const e of extra) {
        const genConn = genConns.find(c => dataConnKey(c) === e)
        if (genConn) print(`    GEN: ${formatDataConnection(genConn)}`)
      }
      if (extra.length > 0 && missing.length === 0) print(`    REF: (缺失)`)
    }
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 4: 执行连线对比 (OutFlow → InFlow)
// ═══════════════════════════════════════════════════════

function compareExecConnections(pairs: AccPair[]): number {
  let diffs = 0
  reportSection('执行连线对比')

  for (const pair of pairs) {
    const refConns = pair.refImpl ? extractExecConnections(pair.refImpl) : []
    const genConns = pair.genImpl ? extractExecConnections(pair.genImpl) : []

    const refKeys = new Set(refConns.map(execConnKey))
    const genKeys = new Set(genConns.map(execConnKey))

    const missing = [...refKeys].filter(k => !genKeys.has(k))
    const extra = [...genKeys].filter(k => !refKeys.has(k))

    // 只统计非 compositePin 的执行连线（节点之间的直接 exec 连线）
    const refDirect = refConns.filter(c => !c.isCompositePin)
    const genDirect = genConns.filter(c => !c.isCompositePin)

    if (missing.length === 0 && extra.length === 0) {
      if (verbose) print(`  ${pair.label}: 直接${refDirect.length}条, compositePin${refConns.length - refDirect.length}条 ✅`)
    } else {
      diffs += Math.max(missing.length, extra.length)
      print(`  ${pair.label}: REF ${refConns.length}条(直接${refDirect.length}) GEN ${genConns.length}条(直接${genDirect.length}) ❌`)
      for (const m of missing) {
        print(`    REF: ${m}`)
      }
      if (missing.length > 0 && extra.length === 0) print(`    GEN: (缺失)`)
      for (const e of extra) {
        print(`    GEN: ${e}`)
      }
      if (extra.length > 0 && missing.length === 0) print(`    REF: (缺失)`)
    }
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 4b: 每个节点的 exec 下游数量
// ═══════════════════════════════════════════════════════

function compareExecOutdegree(pairs: AccPair[]): number {
  let diffs = 0
  reportSection('执行下游数量')

  for (const pair of pairs) {
    if (!pair.refImpl || !pair.genImpl) continue

    const refNodes = pair.refImpl.nodes ?? []
    const genNodes = pair.genImpl.nodes ?? []

    // 建立节点匹配：按 nodeId 匹配（同一 nodeId 可能有多个实例，按索引序匹配）
    const refGroups = new Map<number, any[]>()
    const genGroups = new Map<number, any[]>()
    for (const n of refNodes) {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      if (!refGroups.has(nid)) refGroups.set(nid, [])
      refGroups.get(nid)!.push(n)
    }
    for (const n of genNodes) {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      if (!genGroups.has(nid)) genGroups.set(nid, [])
      genGroups.get(nid)!.push(n)
    }

    const allNodeIds = new Set([...refGroups.keys(), ...genGroups.keys()])

    for (const nid of allNodeIds) {
      const rGroup = refGroups.get(nid) ?? []
      const gGroup = genGroups.get(nid) ?? []

      // 计算每组节点的 OutFlow 下游数量
      function outDegree(node: any): number {
        let deg = 0
        const pins = node.pins ?? []
        for (const pin of pins) {
          if (pin.i1?.kind === 2) { // OutFlow
            deg += (pin.connects ?? []).length
          }
        }
        return deg
      }

      const rDegs = rGroup.map(outDegree)
      const gDegs = gGroup.map(outDegree)

      const rSum = rDegs.reduce((a, b) => a + b, 0)
      const gSum = gDegs.reduce((a, b) => a + b, 0)

      if (rSum !== gSum) {
        diffs++
        print(`  ${pair.label}: ${nodeLabel(nid)} REF=${rSum} GEN=${gSum} Δ=${gSum - rSum} ⚠️`)
      } else if (verbose) {
        print(`  ${pair.label}: ${nodeLabel(nid)} deg=${rSum} ✅`)
      }
    }
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 5: 参数类型对比
// ═══════════════════════════════════════════════════════

function compareParamTypes(pairs: AccPair[]): number {
  let diffs = 0
  reportSection('参数类型对比')

  for (const pair of pairs) {
    if (!pair.refDef || !pair.genDef) continue

    const refParams = extractParamTypes(pair.refDef)
    const genParams = extractParamTypes(pair.genDef)

    // 按 kind+index 匹配
    const refMap = new Map<string, ParamTypeInfo>()
    for (const p of refParams) refMap.set(`${p.kind}:${p.index}`, p)
    const genMap = new Map<string, ParamTypeInfo>()
    for (const p of genParams) genMap.set(`${p.kind}:${p.index}`, p)

    const allKeys = new Set([...refMap.keys(), ...genMap.keys()])
    let pairDiff = false

    for (const key of allKeys) {
      const rp = refMap.get(key)
      const gp = genMap.get(key)

      if (!rp && gp) {
        pairDiff = true
        diffs++
        print(`  ${pair.label}: ${kindName(gp.kind)}:${gp.index} GEN有, REF无 ⚠️`)
        continue
      }
      if (rp && !gp) {
        pairDiff = true
        diffs++
        print(`  ${pair.label}: ${kindName(rp.kind)}:${rp.index} REF有, GEN无 ⚠️`)
        continue
      }
      if (!rp || !gp) continue

      if (rp.varClass !== gp.varClass || rp.type1 !== gp.type1 || rp.type2 !== gp.type2) {
        pairDiff = true
        diffs++
        const rStr = `class=${rp.varClass} t1=${rp.type1} t2=${rp.type2}`
        const gStr = `class=${gp.varClass} t1=${gp.type1} t2=${gp.type2}`
        print(`  ${pair.label}: ${kindName(rp.kind)}:${rp.index} REF(${rStr}) GEN(${gStr}) ❌`)
      }
    }

    if (!pairDiff && verbose) print(`  ${pair.label}: ✅`)
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 6: 纯数据流类型统计
// ═══════════════════════════════════════════════════════

function compareDataNodeTypes(pairs: AccPair[]): number {
  let diffs = 0
  reportSection('纯数据节点类型统计')

  // 纯数据节点：nodeId 不是 2 (branch) 且没有 InFlow/OutFlow pin 的节点
  function isExecNode(node: any): boolean {
    const nid = node.genericId?.nodeId ?? node.concreteId?.nodeId ?? 0
    const pins = node.pins ?? []
    // nodeId=2 就是 exec 节点 (branch)
    if (nid === 2 || nid === 3 || nid === 5 || nid === 6) return true
    // 如果有 InFlow 或 OutFlow pin，就是 exec 节点
    return pins.some((p: any) => p.i1?.kind === 1 || p.i1?.kind === 2)
  }

  function isDataOnlyNode(node: any): boolean {
    return !isExecNode(node)
  }

  const refGlobal = new Map<number, number>()
  const genGlobal = new Map<number, number>()

  for (const pair of pairs) {
    const rNodes = (pair.refImpl?.nodes ?? []).filter(isDataOnlyNode)
    const gNodes = (pair.genImpl?.nodes ?? []).filter(isDataOnlyNode)
    for (const n of rNodes) {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      refGlobal.set(nid, (refGlobal.get(nid) ?? 0) + 1)
    }
    for (const n of gNodes) {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      genGlobal.set(nid, (genGlobal.get(nid) ?? 0) + 1)
    }
  }

  const allNodeIds = new Set([...refGlobal.keys(), ...genGlobal.keys()])
  const sorted = [...allNodeIds].sort((a, b) => a - b)

  print(`  nodeId       REF  GEN   Δ`)

  for (const nid of sorted) {
    const rc = refGlobal.get(nid) ?? 0
    const gc = genGlobal.get(nid) ?? 0
    const delta = gc - rc
    const marker = delta === 0 ? '' : delta > 0 ? `+${delta} ⚠️` : `${delta} ⚠️`
    const name = NODE_NAMES[nid] ? ` (${NODE_NAMES[nid]})` : ''
    if (verbose || delta !== 0) {
      print(`  nodeId=${nid}${name.padEnd(20)} ${String(rc).padEnd(4)} ${String(gc).padEnd(4)} ${marker}`)
    }
    if (delta !== 0) diffs++
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// DIMENSION 7: 纯数据流内容（逐连接对比各 impl graph）
// ═══════════════════════════════════════════════════════

function comparePureDataFlows(pairs: AccPair[]): number {
  let diffs = 0
  reportSection('纯数据流内容对比')

  function isDataOnlyNode(node: any): boolean {
    const nid = node.genericId?.nodeId ?? node.concreteId?.nodeId ?? 0
    if (nid === 2 || nid === 3 || nid === 5 || nid === 6) return false
    const pins = node.pins ?? []
    return !pins.some((p: any) => p.i1?.kind === 1 || p.i1?.kind === 2)
  }

  for (const pair of pairs) {
    const rNodes = (pair.refImpl?.nodes ?? []).filter(isDataOnlyNode)
    const gNodes = (pair.genImpl?.nodes ?? []).filter(isDataOnlyNode)

    if (rNodes.length === 0 && gNodes.length === 0) {
      if (verbose) print(`  ${pair.label}: 无纯数据节点`)
      continue
    }

    // 对每个纯数据节点，按 nodeId 分组匹配
    const rGroups = new Map<number, any[]>()
    for (const n of rNodes) {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      if (!rGroups.has(nid)) rGroups.set(nid, [])
      rGroups.get(nid)!.push(n)
    }
    const gGroups = new Map<number, any[]>()
    for (const n of gNodes) {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      if (!gGroups.has(nid)) gGroups.set(nid, [])
      gGroups.get(nid)!.push(n)
    }

    const allIds = new Set([...rGroups.keys(), ...gGroups.keys()])
    for (const nid of allIds) {
      const rGroup = rGroups.get(nid) ?? []
      const gGroup = gGroups.get(nid) ?? []
      if (rGroup.length !== gGroup.length) {
        diffs++
        print(`  ${pair.label}: ${nodeLabel(nid)} 数量 REF=${rGroup.length} GEN=${gGroup.length} ❌`)
      }
    }

    // 提取所有数据连线（纯数据节点之间的 InParam→OutParam）
    const refConns = extractDataConnections(pair.refImpl)
      .filter(c => isDataOnlyNodeType(c.from.nodeId) && isDataOnlyNodeType(c.to.nodeId))
    const genConns = extractDataConnections(pair.genImpl)
      .filter(c => isDataOnlyNodeType(c.from.nodeId) && isDataOnlyNodeType(c.to.nodeId))

    const refKeys = new Set(refConns.map(dataConnKey))
    const genKeys = new Set(genConns.map(dataConnKey))
    const missing = [...refKeys].filter(k => !genKeys.has(k))
    const extra = [...genKeys].filter(k => !refKeys.has(k))

    if (missing.length > 0 || extra.length > 0) {
      diffs += Math.max(missing.length, extra.length)
      print(`  ${pair.label}: 数据连线 REF ${refConns.length}条 GEN ${genConns.length}条 ❌`)
      for (const m of missing.slice(0, 5)) {
        const rc = refConns.find(c => dataConnKey(c) === m)
        if (rc) print(`    REF: ${formatDataConnection(rc)}`)
      }
      if (missing.length > 5) print(`    ... 还有 ${missing.length - 5} 条`)
      for (const e of extra.slice(0, 5)) {
        const gc = genConns.find(c => dataConnKey(c) === e)
        if (gc) print(`    GEN: ${formatDataConnection(gc)}`)
      }
      if (extra.length > 5) print(`    ... 还有 ${extra.length - 5} 条`)
    }
  }

  function isDataOnlyNodeType(nodeId: number): boolean {
    return ![2, 3, 5, 6].includes(nodeId)
  }

  if (diffs === 0 && !verbose) print('  (全部一致)')

  return diffs
}

// ═══════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════

const rAcc = getAccessories(ref)
const gAcc = getAccessories(gen)

if (verbose) {
  print(`REF accessories: ${rAcc.length}  GEN accessories: ${gAcc.length}`)
}

const pairs = matchByCompositeName(rAcc, gAcc)

if (pairs.length === 0) {
  print('\n⚠️  未能通过名称匹配任何复合定义对')
  process.exit(1)
}

// 执行各维度对比
totalDiffs += compareCompositeDefs(pairs)
totalDiffs += compareNodeDistribution(pairs)
totalDiffs += compareDataConnections(pairs)
totalDiffs += compareExecOutdegree(pairs)
totalDiffs += compareParamTypes(pairs)
totalDiffs += compareExecConnections(pairs)
totalDiffs += comparePureDataFlows(pairs)
totalDiffs += compareDataNodeTypes(pairs)

// ── 结果 ──
print('')
if (totalDiffs === 0) {
  print('🏆 完全一致 — 所有维度无差异')
  process.exit(0)
} else {
  print(`💥 ${totalDiffs} 处差异 (跨 8 个维度)`)
  process.exit(1)
}
