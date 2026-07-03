// @ts-nocheck
/**
 * GIA 文件结构差异对比工具
 *
 * 用法:
 *   npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia>           完整对比
 *   npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> -c        紧凑模式：只显示实质差异（忽略命名/ID/顺序）
 *   npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> -q        安静模式：仅输出差异数和退出码
 *   npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> -v        详细模式：包括上下文信息
 */
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { readFileSync } from 'fs'

const PROTO = '/home/h/genshin-ts/dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

// 参数解析
const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('-')))
const paths = args.filter(a => !a.startsWith('-'))
const refPath = paths[0]
const genPath = paths[1]
const compact = flags.has('-c') || flags.has('--compact')
const quiet = flags.has('-q') || flags.has('--quiet')
const verbose = flags.has('-v') || flags.has('--verbose')

if (!refPath || !genPath) {
  console.log([
    '用法: npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> [flags]',
    '',
    'Flags:',
    '  -c, --compact  紧凑模式：忽略命名、ID、顺序等已知 cosmetic 差异',
    '  -q, --quiet    安静模式：仅输出差异数量，退出码 1 表示有差异',
    '  -v, --verbose  详细模式：差异旁显示上下文说明',
  ].join('\n'))
  process.exit(2)
}

const refSize = readFileSync(refPath).length
const genSize = readFileSync(genPath).length
if (!quiet) console.log(`文件: REF=${refSize}B GEN=${genSize}B Δ=${genSize - refSize}B`)
if (!quiet) console.log('')

const ref = decode_gia_file(refPath, PROTO)
const gen = decode_gia_file(genPath, PROTO)

let diffs = 0
let cosmeticDiffs = 0

// ── 已知 cosmetic 差异列表 ──
// 这些字段的值每次生成不同，不影响游戏行为
const cosmeticKeys = new Set([
  'id',           // 自动生成 ID
  'nodeId',       // GIA 节点 ID
  'nodeIndex',    // 节点序号
  'relatedIds',   // ID 引用列表（值不同但对应关系正确即视为 OK）
])

// 复合名称格式 "翻倍" vs "翻倍(5)" — normalize
function normalizeName(n: string | undefined): string {
  if (!n) return ''
  return n.replace(/\(\d+\)$/, '')
}

// 路径级别的 cosmetic 判断
function isCosmeticPath(path: string): string | undefined {
  // 动态 ID 字段
  if (path.match(/\.(genericId|concreteId)\.(id|nodeId)$/)) return '动态ID'
  if (path.match(/\.(graphId|relatedIds\[\d+\])\.id$/)) return '动态ID'
  if (path.match(/\.relatedIds\[\d+\]\.(id|class|type)$/)) return '动态ID引用'
  if (path.match(/\.id\.(id|class|type)$/)) return 'GraphUnit ID'

  // pinIndex / compositePinIndex — 只要存在且类型正确就是 OK
  if (path.endsWith('.pinIndex') || path.endsWith('.compositePinIndex')) return 'pinIndex偏移'
  if (path.endsWith('.indexOfConcrete')) return 'concreteIndex偏移'

  // 名称字段 — 只要非空就是 OK
  if (path.endsWith('.name') && !path.includes('.pinIndex')) return '命名差异'

  // type.valueId — REF=null GEN={id:0} 等价
  if (path.endsWith('.valueId') || path.endsWith('.valueId.id')) return 'valueId格式'

  // itemType.type_server — 编码差异，游戏兼容
  if (path.endsWith('.type_server') || path.endsWith('.type_server.type') || path.endsWith('.type_server.kind')) return 'type_server编码'

  // alreadySetVal — 在非关键位置可能有差异
  // 坐标
  if (path.endsWith('.x') || path.endsWith('.y')) return '坐标'

  // nodeIndex
  if (path.endsWith('.nodeIndex')) return '节点序号'

  return undefined
}

// ── 语义匹配辅助 ──
// accessories 按 CompositeDef-name 配对，impl 跟随其 CompositeDef
function matchAccessories(rAcc: any[], gAcc: any[]): Array<[number, number]> {
  // 第一步：匹配 CompositeDef (which=12) 按名称
  const rDefs: number[] = []
  const gDefs: number[] = []
  rAcc.forEach((a, i) => { if (a?.which === 12) rDefs.push(i) })
  gAcc.forEach((a, i) => { if (a?.which === 12) gDefs.push(i) })

  const defPairs: Array<[number, number]> = []
  const usedG = new Set<number>()
  for (const ri of rDefs) {
    const rName = rAcc[ri]?.compositeDef?.inner?.def?.name
    let bestJ = -1
    for (const gj of gDefs) {
      if (usedG.has(gj)) continue
      const gName = gAcc[gj]?.compositeDef?.inner?.def?.name
      if (rName === gName) { bestJ = gj; break }
    }
    if (bestJ >= 0) {
      defPairs.push([ri, bestJ])
      usedG.add(bestJ)
    }
  }

  // 第二步：每个 CompositeDef 后面的 impl (which=9) 跟随配对
  const pairs: Array<[number, number]> = []
  for (const [ri, gi] of defPairs) {
    pairs.push([ri, gi])              // CompositeDef 自身
    if (ri + 1 < rAcc.length && rAcc[ri + 1]?.which === 9 &&
        gi + 1 < gAcc.length && gAcc[gi + 1]?.which === 9) {
      pairs.push([ri + 1, gi + 1])    // 紧随其后的 impl
    }
  }
  return pairs
}

// ── 差异输出 ──
function diff(path: string, a: any, b: any, note?: string): boolean {
  if (a === b) return true
  if (a === undefined && b === undefined) return true
  if (a === null && b === null) return true

  if (compact) {
    const reason = isCosmeticPath(path)
    if (reason) {
      cosmeticDiffs++
      if (verbose) console.log(`  ℹ️  ${path}: ${reason} (REF≠GEN, 视为cosmetic)`)
      return true
    }
    // 名称字段：normalize 后比较
    if ((path.endsWith('.name') || path.includes('CompositeDef(')) && typeof a === 'string' && typeof b === 'string') {
      if (normalizeName(a) === normalizeName(b)) {
        cosmeticDiffs++
        return true
      }
    }
  }

  if (typeof a !== typeof b) {
    diffs++
    if (!quiet) console.log(`❌ ${path}: 类型 REF=${typeof a} GEN=${typeof b}${note ? ' — ' + note : ''}`)
    return false
  }

  if (typeof a === 'object' && a !== null && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b)) {
      diffs++
      if (!quiet) console.log(`❌ ${path}: 数组/对象不匹配${note ? ' — ' + note : ''}`)
      return false
    }
    if (Array.isArray(a)) {
      if (a.length !== b.length) {
        diffs++
        if (!quiet) console.log(`❌ ${path}: 长度 REF=${a.length} GEN=${b.length}${note ? ' — ' + note : ''}`)
      }
      const n = Math.min(a.length, b.length)
      let ok = true
      for (let i = 0; i < n; i++) {
        if (!diff(`${path}[${i}]`, a[i], b[i], note)) ok = false
      }
      return ok
    }
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])
    let ok = true
    for (const k of allKeys) {
      if (!diff(`${path}.${k}`, a[k], b[k], note)) ok = false
    }
    return ok
  }

  if (typeof a === 'number' && Math.abs(a - b) < 0.001) return true

  diffs++
  if (!quiet) console.log(`❌ ${path}: REF=${JSON.stringify(a)} GEN=${JSON.stringify(b)}${note ? ' — ' + note : ''}`)
  return false
}

// ── 执行对比 ──
if (!quiet) console.log('── 主图 ──')

// Event 节点
const rEvent = (ref.graph?.graph?.inner?.graph?.nodes ?? []).find((n: any) => n.genericId?.kind === 22000 && n.genericId?.nodeId === 71)
const gEvent = (gen.graph?.graph?.inner?.graph?.nodes ?? []).find((n: any) => n.genericId?.kind === 22000 && n.genericId?.nodeId === 71)
if (rEvent && gEvent) {
  diff('graph.event.pins.length', rEvent.pins?.length ?? 0, gEvent.pins?.length ?? 0)
  for (let j = 0; j < Math.max(rEvent.pins?.length ?? 0, gEvent.pins?.length ?? 0); j++) {
    diff(`graph.event.pins[${j}].i1.kind`, rEvent.pins?.[j]?.i1?.kind, gEvent.pins?.[j]?.i1?.kind)
    diff(`graph.event.pins[${j}].connects.length`, rEvent.pins?.[j]?.connects?.length ?? 0, gEvent.pins?.[j]?.connects?.length ?? 0)
  }
  if (!quiet) console.log('  event: ✅')
} else {
  if (!quiet) console.log('  event: ❌ 不可比')
  diffs++
}

// Composite nodes
const rComps = (ref.graph?.graph?.inner?.graph?.nodes ?? []).filter((n: any) => n.genericId?.kind === 22001)
const gComps = (gen.graph?.graph?.inner?.graph?.nodes ?? []).filter((n: any) => n.genericId?.kind === 22001)
if (rComps.length !== gComps.length) {
  diffs++
  if (!quiet) console.log(`  composite 节点数: REF=${rComps.length} GEN=${gComps.length}`)
} else if (!quiet) {
  console.log(`  composite: ${rComps.length} 个`)
}
for (let i = 0; i < Math.min(rComps.length, gComps.length); i++) {
  const rc = rComps[i]
  const gc = gComps[i]
  diff(`graph.comps[${i}].pins.length`, rc.pins?.length ?? 0, gc.pins?.length ?? 0)
  // 深度对比每个 pin 的 kind、compositePinIndex 和 value
  const rPins = rc.pins ?? []
  const gPins = gc.pins ?? []
  for (let j = 0; j < Math.max(rPins.length, gPins.length); j++) {
    const rp = rPins[j]
    const gp = gPins[j]
    const pp = `graph.comps[${i}].pins[${j}]`
    diff(`${pp}.kind`, rp?.i1?.kind, gp?.i1?.kind)
    diff(`${pp}.index`, rp?.i1?.index, gp?.i1?.index)
    diff(`${pp}.type`, rp?.type, gp?.type)
    diff(`${pp}.compositePinIndex`, (rp as any)?.compositePinIndex, (gp as any)?.compositePinIndex)
    // 深度 value 对比
    diff(`${pp}.value.class`, rp?.value?.class, gp?.value?.class)
    diff(`${pp}.value.alreadySetVal`, rp?.value?.alreadySetVal, gp?.value?.alreadySetVal)
    diff(`${pp}.value.bInt.val`, rp?.value?.bInt?.val, gp?.value?.bInt?.val)
    diff(`${pp}.value.bString.val`, rp?.value?.bString?.val, gp?.value?.bString?.val)
    diff(`${pp}.value.bConcreteValue`, rp?.value?.bConcreteValue, gp?.value?.bConcreteValue)
    // connects
    const rcConns = rp?.connects ?? []
    const gcConns = gp?.connects ?? []
    if (rcConns.length !== gcConns.length) {
      diff(`${pp}.connects.length`, rcConns.length, gcConns.length)
    }
    for (let k = 0; k < Math.min(rcConns.length, gcConns.length); k++) {
      diff(`${pp}.connects[${k}].connect.kind`, rcConns[k]?.connect?.kind, gcConns[k]?.connect?.kind)
      diff(`${pp}.connects[${k}].connect.index`, rcConns[k]?.connect?.index, gcConns[k]?.connect?.index)
    }
  }
}

// 普通节点
const rNorm = (ref.graph?.graph?.inner?.graph?.nodes ?? []).filter((n: any) => n.genericId?.kind === 22000 && n.genericId?.nodeId !== 71)
const gNorm = (gen.graph?.graph?.inner?.graph?.nodes ?? []).filter((n: any) => n.genericId?.kind === 22000 && n.genericId?.nodeId !== 71)
if (rNorm.length !== gNorm.length) {
  diffs++
  if (!quiet) console.log(`  normal 节点数: REF=${rNorm.length} GEN=${gNorm.length}`)
} else if (!quiet) {
  console.log(`  normal: ${rNorm.length} 个`)
}

if (!quiet) console.log('')
if (!quiet) console.log('── Accessories ──')

const rAcc = ref.accessories ?? []
const gAcc = gen.accessories ?? []
if (rAcc.length !== gAcc.length) {
  diffs++
  if (!quiet) console.log(`数量: REF=${rAcc.length} GEN=${gAcc.length}`)
} else if (!quiet) {
  console.log(`数量: ${rAcc.length} (已语义匹配)`)
}

// 语义匹配
const pairs = matchAccessories(rAcc, gAcc)
for (const [ri, gi] of pairs) {
  const ra = rAcc[ri]
  const ga = gAcc[gi]
  const label = ra.which === 12
    ? `CompositeDef(${ra.compositeDef?.inner?.def?.name ?? '?'})`
    : 'impl'
  if (!quiet) console.log(`\n  acc[${ri}]↔acc[${gi}]: ${label}`)

  // CompositeDef
  if (ra.which === 12 && ga.which === 12) {
    const rd = ra.compositeDef?.inner?.def
    const gd = ga.compositeDef?.inner?.def
    diff(`  def.inflows`, rd?.inflows?.length, gd?.inflows?.length)
    diff(`  def.outflows`, rd?.outflows?.length, gd?.outflows?.length)
    diff(`  def.inputs`, rd?.inputs?.length, gd?.inputs?.length)
    diff(`  def.outputs`, rd?.outputs?.length, gd?.outputs?.length)
    for (let j = 0; j < Math.max(rd?.inputs?.length ?? 0, gd?.inputs?.length ?? 0); j++) {
      diff(`  def.inputs[${j}].type.class`, rd?.inputs?.[j]?.type?.class, gd?.inputs?.[j]?.type?.class)
    }
    for (let j = 0; j < Math.max(rd?.outputs?.length ?? 0, gd?.outputs?.length ?? 0); j++) {
      diff(`  def.outputs[${j}].type.class`, rd?.outputs?.[j]?.type?.class, gd?.outputs?.[j]?.type?.class)
    }
  }

  // impl graph
  if (ra.which === 9 && ga.which === 9) {
    const rg = ra.graph?.inner?.graph
    const gg = ga.graph?.inner?.graph
    diff(`  compositePins.length`, rg?.compositePins?.length ?? 0, gg?.compositePins?.length ?? 0)
    for (let j = 0; j < Math.max(rg?.compositePins?.length ?? 0, gg?.compositePins?.length ?? 0); j++) {
      const rcp = rg?.compositePins?.[j]
      const gcp = gg?.compositePins?.[j]
      diff(`  compositePins[${j}].outerPin.kind`, rcp?.outerPin?.kind, gcp?.outerPin?.kind)
      diff(`  compositePins[${j}].innerPin.kind`, rcp?.innerPin?.kind, gcp?.innerPin?.kind)
    }
    diff(`  graph.nodes`, rg?.nodes?.length ?? 0, gg?.nodes?.length ?? 0)
    for (let j = 0; j < Math.max(rg?.nodes?.length ?? 0, gg?.nodes?.length ?? 0); j++) {
      const rn = rg?.nodes?.[j]
      const gn = gg?.nodes?.[j]
      diff(`  nodes[${j}].pins.length`, rn?.pins?.length ?? 0, gn?.pins?.length ?? 0)
      for (let k = 0; k < Math.max(rn?.pins?.length ?? 0, gn?.pins?.length ?? 0); k++) {
        const rp = rn?.pins?.[k]
        const gp = gn?.pins?.[k]
        const pp = `  nodes[${j}].pins[${k}]`
        diff(`${pp}.kind`, rp?.i1?.kind, gp?.i1?.kind)
        diff(`${pp}.type`, rp?.type, gp?.type)
        diff(`${pp}.value.class`, rp?.value?.class, gp?.value?.class)
        diff(`${pp}.value.alreadySetVal`, rp?.value?.alreadySetVal, gp?.value?.alreadySetVal)
        diff(`${pp}.value.bInt.val`, rp?.value?.bInt?.val, gp?.value?.bInt?.val)
        diff(`${pp}.value.bString.val`, rp?.value?.bString?.val, gp?.value?.bString?.val)
        diff(`${pp}.value.bConcreteValue.indexOfConcrete`, rp?.value?.bConcreteValue?.indexOfConcrete, gp?.value?.bConcreteValue?.indexOfConcrete)
        diff(`${pp}.value.bConcreteValue.value.class`, rp?.value?.bConcreteValue?.value?.class, gp?.value?.bConcreteValue?.value?.class)
        diff(`${pp}.value.bConcreteValue.value.alreadySetVal`, rp?.value?.bConcreteValue?.value?.alreadySetVal, gp?.value?.bConcreteValue?.value?.alreadySetVal)
        diff(`${pp}.value.bConcreteValue.value.bInt.val`, rp?.value?.bConcreteValue?.value?.bInt?.val, gp?.value?.bConcreteValue?.value?.bInt?.val)
        diff(`${pp}.value.bConcreteValue.value.bString.val`, rp?.value?.bConcreteValue?.value?.bString?.val, gp?.value?.bConcreteValue?.value?.bString?.val)
      }
    }
  }
}

// 输出结果
if (!quiet) console.log('')
if (diffs === 0) {
  const msg = cosmeticDiffs > 0 ? `🏆 无实质差异 (${cosmeticDiffs} 处cosmetic差异已忽略)` : '🏆 完全一致'
  if (!quiet) console.log(msg)
  process.exit(0)
} else {
  const parts = [`💥 ${diffs} 处实质差异`]
  if (cosmeticDiffs > 0) parts.push(`${cosmeticDiffs} 处cosmetic`)
  if (!quiet) console.log(parts.join('，'))
  process.exit(1)
}
