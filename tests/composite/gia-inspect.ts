// @ts-nocheck
/**
 * GIA 文件模块化检查工具
 *
 * 用法:
 *   npx tsx tests/composite/gia-inspect.ts <file.gia>                          列出所有 accessories
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -l                       同上
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -s <N>                   显示第 N 个 accessory 详情
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -n "<name>"              按名称匹配 accessory
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -p                       只显示 compositePins
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -g <N>                   只显示第 N 个 accessory 的 impl graph
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -f <nodeId>              过滤: 只显示含特定 nodeId 的 impl graph
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -s <N> -c                显示第 N 个 accessory 的 compositePins
 *   npx tsx tests/composite/gia-inspect.ts <file.gia> -t                       统计: 节点类型分布
 */
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { readFileSync } from 'fs'

const PROTO = '/home/h/genshin-ts/dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log('用法: npx tsx tests/composite/gia-inspect.ts <file.gia> [options]')
  console.log('  -l            列出所有 accessories (默认)')
  console.log('  -s <N>        显示第 N 个 accessory 详情')
  console.log('  -n "<name>"   按名称模糊匹配 accessory')
  console.log('  -p            仅显示 accessories 的 compositePins')
  console.log('  -g <N>        仅显示第 N 个 accessory 的 impl graph 节点')
  console.log('  -c            配合 -s 使用，仅显示 compositePins')
  console.log('  -f <nodeId>   过滤 impl graph 节点')
  console.log('  -t            统计节点类型分布')
  process.exit(0)
}
const flags = new Set(args.filter(a => a.startsWith('-')))
const vals = args.filter(a => !a.startsWith('-'))
const filePath = vals[0]

if (!filePath) {
  console.log('用法: npx tsx tests/composite/gia-inspect.ts <file.gia> [options]')
  console.log('  -l            列出所有 accessories (默认)')
  console.log('  -s <N>        显示第 N 个 accessory 详情')
  console.log('  -n "<name>"   按名称模糊匹配 accessory')
  console.log('  -p            仅显示 accessories 的 compositePins')
  console.log('  -g <N>        仅显示第 N 个 accessory 的 impl graph 节点')
  console.log('  -c            配合 -s 使用，仅显示 compositePins')
  console.log('  -f <nodeId>   过滤: 只显示含特定 nodeId 的 impl graph')
  console.log('  -t            统计: 节点类型(nodeId)分布')
  process.exit(2)
}

const data = decode_gia_file(filePath, PROTO)
const PIN_KIND: Record<number, string> = { 0: 'Node', 1: 'InFlow', 2: 'OutFlow', 3: 'InParam', 4: 'OutParam' }

function kindName(k: number | undefined): string {
  return PIN_KIND[k ?? -1] ?? `?${k}`
}

function describePin(p: any): string {
  const k1 = kindName(p.i1?.kind)
  const i1 = p.i1?.index
  const k2 = kindName(p.i2?.kind)
  const i2 = p.i2?.index

  let val = ''
  if (p.value?.bInt) val = ` bInt.val=${p.value.bInt.val}`
  else if (p.value?.bString) val = ` bStr="${p.value.bString.val}"`
  else if (p.value?.bFloat) val = ` bFloat.val=${p.value.bFloat.val}`
  else if (p.value?.bBool) val = ` bBool.val=${p.value.bBool.val}`
  else if (p.value?.bConcreteValue) val = ` bConcrete`
  else if (p.value?.type !== undefined) val = ` type=${p.value.type}`

  let conn = ''
  if (p.connects?.length) {
    conn = ' →[' + p.connects.map((c: any) => `${c.id}:${kindName(c.connect?.kind)}:${c.connect?.index}`).join(',') + ']'
  }
  return `${k1}:${i1} ${k2}:${i2}${val}${conn}`
}

// ── List mode ──
if (flags.has('-l') || (flags.size === 0 && vals.length === 1)) {
  console.log(`文件: ${filePath}`)
  console.log(`accessories: ${data.accessories?.length ?? 0}`)
  console.log('')

  if (data.graph) {
    const g = data.graph.inner?.graph || data.graph
    console.log('── 主图 ──')
    console.log(`  name: "${g.name}"  which: ${data.which}`)
    console.log(`  nodes: ${g.nodes?.length ?? 0}`)
    if (g.nodes) {
      g.nodes.forEach((n: any, i: number) => {
        const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
        const kind = n.genericId?.kind ?? n.concreteId?.kind ?? '?'
        console.log(`  [${i}] ni=${n.nodeIndex} kind=${kind} nodeId=${nid} pins=${n.pins?.length ?? 0}`)
      })
    }
    console.log('')
  }

  console.log('── Accessories ──')
  data.accessories?.forEach((acc: any, i: number) => {
    const def = acc.compositeDef?.inner?.def
    const g = acc.graph?.inner?.graph
    const name = def?.name ?? acc.name ?? '(unnamed)'
    const which = acc.which
    const whichLabel = { 9: 'ImplGraph', 12: 'CompositeDef', 14: 'SignalDef' }[which] ?? `which=${which}`

    let info = ''
    if (def) {
      info = ` in:${def.inflows?.length ?? 0} out:${def.outflows?.length ?? 0} inp:${def.inputs?.length ?? 0} outp:${def.outputs?.length ?? 0}`
    }
    if (g) {
      info += ` nodes:${g.nodes?.length ?? 0} cPins:${g.compositePins?.length ?? 0}`
    }

    console.log(`  [${i}] ${whichLabel} id=${acc.id?.id} "${name}"${info}`)
  })
}

// ── Show accessory detail ──
if (flags.has('-s')) {
  const sIdx = args.indexOf('-s')
  const idx = parseInt((sIdx >= 0 ? args[sIdx + 1] : '') ?? '')
  if (isNaN(idx) || idx < 0 || idx >= (data.accessories?.length ?? 0)) {
    console.error(`无效索引: ${idx}, 有效范围 0-${(data.accessories?.length ?? 1) - 1}`)
    process.exit(1)
  }
  const acc = data.accessories[idx]
  const def = acc.compositeDef?.inner?.def
  const g = acc.graph?.inner?.graph
  const showPinsOnly = flags.has('-c')

  console.log(`=== Accessory [${idx}] which=${acc.which} id=${acc.id?.id} name="${acc.name}" ===`)

  if (def && !showPinsOnly) {
    console.log(`  CompositeDef: "${def.name}"`)
    console.log(`    inflows (${def.inflows?.length ?? 0}):`)
    def.inflows?.forEach((f: any) => console.log(`      pinIndex=${f.pinIndex}`))
    console.log(`    outflows (${def.outflows?.length ?? 0}):`)
    def.outflows?.forEach((f: any) => console.log(`      name="${f.name}" pinIndex=${f.pinIndex} index=${f.index?.index}`))
    console.log(`    inputs (${def.inputs?.length ?? 0}):`)
    def.inputs?.forEach((f: any) => console.log(`      name="${f.name}" class=${f.type?.class} type1=${f.type?.type1} pinIndex=${f.pinIndex}`))
    console.log(`    outputs (${def.outputs?.length ?? 0}):`)
    def.outputs?.forEach((f: any) => console.log(`      name="${f.name}" class=${f.type?.class} type1=${f.type?.type1} pinIndex=${f.pinIndex}`))
    console.log(`    id: genericId.kind=${def.id?.genericId?.kind} id=${def.id?.genericId?.id}`)
    console.log(`       graphId.kind=${def.id?.graphId?.kind} id=${def.id?.graphId?.id}`)
  }

  if (g) {
    if (!showPinsOnly) {
      console.log(`  Impl Graph (${g.nodes?.length ?? 0} nodes):`)
      g.nodes?.forEach((n: any) => {
        const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
        const kind = n.genericId?.kind ?? n.concreteId?.kind ?? '?'
        console.log(`    n[${n.nodeIndex}] kind=${kind} nodeId=${nid}`)
        n.pins?.forEach((p: any, pi: number) => {
          console.log(`      pin[${pi}] ${describePin(p)}`)
        })
      })
    }

    if (g.compositePins?.length) {
      console.log(`  compositePins (${g.compositePins.length}):`)
      g.compositePins.forEach((cp: any, i: number) => {
        console.log(`    [${i}] outer:${kindName(cp.outerPin?.kind)}:${cp.outerPin?.index} → n[${cp.innerNodeId}] inner:${kindName(cp.innerPin?.kind)}:${cp.innerPin?.index}`)
      })
    }
  }
}

// ── Name match ──
if (flags.has('-n')) {
  const nIdx = args.indexOf('-n')
  const query = (nIdx >= 0 ? args[nIdx + 1] : '')?.toLowerCase() ?? ''
  console.log(`搜索: "${query}"`)
  data.accessories?.forEach((acc: any, i: number) => {
    const def = acc.compositeDef?.inner?.def
    const name = (def?.name ?? acc.name ?? '').toLowerCase()
    if (name.includes(query)) {
      console.log(`  [${i}] which=${acc.which} id=${acc.id?.id} "${def?.name ?? acc.name}"`)
    }
  })
}

// ── Show all compositePins ──
if (flags.has('-p')) {
  console.log('── 所有 compositePins ──')
  data.accessories?.forEach((acc: any, i: number) => {
    const g = acc.graph?.inner?.graph
    const def = acc.compositeDef?.inner?.def
    if (!g?.compositePins?.length) return
    console.log(`\n[${i}] "${def?.name ?? acc.name}" (${g.compositePins.length} pins):`)
    g.compositePins.forEach((cp: any, j: number) => {
      console.log(`  [${j}] outer:${kindName(cp.outerPin?.kind)}:${cp.outerPin?.index} → n[${cp.innerNodeId}] inner:${kindName(cp.innerPin?.kind)}:${cp.innerPin?.index}`)
    })
  })
}

// ── Show specific impl graph ──
if (flags.has('-g')) {
  const gIdx = args.indexOf('-g')
  const idx = parseInt((gIdx >= 0 ? args[gIdx + 1] : '') ?? '')
  const acc = data.accessories?.[idx]
  const g = acc?.graph?.inner?.graph
  if (!g) { console.error('无效索引或无 impl graph'); process.exit(1) }
  const def = acc.compositeDef?.inner?.def
  console.log(`=== Impl Graph [${idx}] "${def?.name ?? acc.name}" ===`)
  g.nodes?.forEach((n: any) => {
    const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
    console.log(`  n[${n.nodeIndex}] nodeId=${nid} pins(${n.pins?.length ?? 0})`)
    n.pins?.forEach((p: any, pi: number) => console.log(`    [${pi}] ${describePin(p)}`))
  })
  if (g.compositePins?.length) {
    console.log(`  compositePins (${g.compositePins.length}):`)
    g.compositePins.forEach((cp: any, j: number) => {
      console.log(`    [${j}] ${kindName(cp.outerPin?.kind)}:${cp.outerPin?.index} → n[${cp.innerNodeId}] ${kindName(cp.innerPin?.kind)}:${cp.innerPin?.index}`)
    })
  }
}

// ── Filter by nodeId ──
if (flags.has('-f')) {
  const fIdx = args.indexOf('-f')
  const filterId = parseInt((fIdx >= 0 ? args[fIdx + 1] : '') ?? '')
  console.log(`── 搜索含 nodeId=${filterId} 的 impl graph ──`)
  data.accessories?.forEach((acc: any, i: number) => {
    const g = acc.graph?.inner?.graph
    if (!g?.nodes) return
    const match = g.nodes.some((n: any) => {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId
      return nid === filterId
    })
    if (match) {
      const def = acc.compositeDef?.inner?.def
      console.log(`\n[${i}] "${def?.name ?? acc.name}"`)
      g.nodes.forEach((n: any) => {
        const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? '?'
        const marker = nid === filterId ? ' ★' : ''
        console.log(`  n[${n.nodeIndex}] nodeId=${nid}${marker} pins(${n.pins?.length ?? 0})`)
        n.pins?.forEach((p: any, pi: number) => console.log(`    [${pi}] ${describePin(p)}`))
      })
      if (g.compositePins?.length) {
        console.log(`  compositePins:`)
        g.compositePins.forEach((cp: any, j: number) => {
          console.log(`    [${j}] ${kindName(cp.outerPin?.kind)}:${cp.outerPin?.index} → n[${cp.innerNodeId}] ${kindName(cp.innerPin?.kind)}:${cp.innerPin?.index}`)
        })
      }
    }
  })
}

// ── Stats: node type distribution ──
if (flags.has('-t')) {
  console.log('── 节点类型分布 ──')
  const dist = new Map<number, { count: number; examples: string[] }>()
  data.accessories?.forEach((acc: any) => {
    const g = acc.graph?.inner?.graph
    g?.nodes?.forEach((n: any) => {
      const nid = n.genericId?.nodeId ?? n.concreteId?.nodeId ?? 0
      const entry = dist.get(nid) ?? { count: 0, examples: [] }
      entry.count++
      if (entry.examples.length < 3) {
        const def = acc.compositeDef?.inner?.def
        // 记录 pins 数量
        const pinCount = n.pins?.length ?? 0
        entry.examples.push(`pins=${pinCount} in "${def?.name ?? acc.name}"`)
      }
      dist.set(nid, entry)
    })
  })

  // 已知节点名
  const KNOWN: Record<number, string> = {
    1: 'print_string', 2: 'double_branch', 3: 'multiple_branches',
    5: 'finite_loop', 6: 'break_loop', 7: 'create_3d_vector',
    9: 'vec3_length', 10: 'cross_product', 11: 'dot_product',
    12: 'scalar_multiplication', 14: 'equal', 15: 'not_equal',
    18: 'greater_than', 19: 'less_than', 22: 'set_variable',
    50: 'get_variable_by_name', 73: 'event/empty',
    74: 'get_object_property', 75: 'get_self_entity',
    79: 'assembly_list', 83: 'assembly_dictionary',
    94: 'play_effect', 95: 'remove_effect',
    99: 'empty/connector', 135: 'send_signal',
    169: 'assembly_structure', 180: 'data_type_conversion',
    200: 'addition', 202: 'subtraction', 204: 'multiplication',
    211: 'division', 213: 'modulo', 216: 'absolute_value',
    220: 'sqrt', 225: 'create_3d_vector_from_values',
    259: 'get_component', 310: 'get_world_time',
    323: 'set_variable_str', 337: 'get_entity_by_tag',
    387: 'enum_comparison', 395: 'get_skill_cd',
    397: 'set_skill_cd', 399: 'reset_skill_cd',
    474: 'vec3_addition', 505: 'subtract_3d',
    506: 'multiply_3d', 739: 'set_attribute',
    22000: '(normal node)', 22001: '(composite call)',
  }

  const sorted = [...dist.entries()].sort((a, b) => b[1].count - a[1].count)
  for (const [nid, info] of sorted) {
    const label = KNOWN[nid] ?? ''
    console.log(`  nodeId=${nid} (${label}): ${info.count} 次`)
    for (const ex of info.examples) {
      console.log(`    - ${ex}`)
    }
  }

  // 特殊统计
  console.log('')
  console.log('── 复合节点统计 ──')
  let defs = 0, impls = 0, signals = 0
  const outflowDist = new Map<number, number>()
  data.accessories?.forEach((acc: any) => {
    if (acc.which === 12) defs++
    else if (acc.which === 9) impls++
    else if (acc.which === 14) signals++
    const def = acc.compositeDef?.inner?.def
    if (def?.outflows) {
      const cnt = def.outflows.length
      outflowDist.set(cnt, (outflowDist.get(cnt) ?? 0) + 1)
    }
  })
  console.log(`  CompositeDef (which=12): ${defs}`)
  console.log(`  ImplGraph (which=9): ${impls}`)
  console.log(`  SignalDef (which=14): ${signals}`)
  console.log('  OutFlow 数分布:')
  for (const [cnt, num] of [...outflowDist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${cnt} OutFlow: ${num} 个复合定义`)
  }
}
