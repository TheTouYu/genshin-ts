/**
 * CompositeDef & SignalDef analysis for GIA files.
 * Run with:
 *   npx tsx tools/analyze-composite-gia.ts <file.gia>           # single-file mode (basic info + CPI)
 *   npx tsx tools/analyze-composite-gia.ts <file1.gia> <file2.gia> [...]  # cross-file comparison
 */
import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'
import type { Root, GraphUnit, CompositeDef, CompositeDef_ControlFlow, CompositeDef_ParameterFlow } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts'

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

const ARGS = process.argv.slice(2)
if (ARGS.includes('--help') || ARGS.includes('-h')) {
  console.log('用法: npx tsx tools/analyze-composite-gia.ts <file.gia> [file2.gia ...]')
  console.log('  单文件：输出 CompositeDef/SignalDef 概览和 CPI 检查')
  console.log('  多文件：额外输出跨文件复合对比')
  process.exit(0)
}
const FILES: string[] = ARGS.filter(arg => !arg.startsWith('-'))
if (FILES.length === 0) die('用法: npx tsx tools/analyze-composite-gia.ts <file.gia> [<file2.gia> ...]')

function shortName(p: string): string {
  const m = p.match(/\/([^/]+)\.gia$/)
  return m ? m[1] : p
}

function fmtT(t: { class?: number; type1?: number; type2?: number } | undefined): string {
  if (!t) return '?'
  let s = ''
  const tc = t.class ?? 0
  if (tc === 1) s += 'Id'
  else if (tc === 2) s += 'Int'
  else if (tc === 4) s += 'Float'
  else if (tc === 5) s += 'String'
  else if (tc === 6) s += 'Enum'
  else if (tc === 7) s += 'Vector'
  else if (tc === 10000) s += 'Concrete'
  else s += `Class${tc}`
  s += `/type1=${t.type1 ?? 0}`
  if (t.type2 !== undefined && t.type2 !== 0) s += `,type2=${t.type2}`
  return s
}

function formatInterface(cd: CompositeDef): string {
  const inflows = (cd.inflows ?? []).map((f: CompositeDef_ControlFlow) => f.name).join(',')
  const outflows = (cd.outflows ?? []).map((f: CompositeDef_ControlFlow) => f.name).join(',')
  const inputs = (cd.inputs ?? []).map((f: CompositeDef_ParameterFlow) => `${f.name}:${f.type?.type1 ?? '?'}`).join(',')
  const outputs = (cd.outputs ?? []).map((f: CompositeDef_ParameterFlow) => `${f.name}:${f.type?.type1 ?? '?'}`).join(',')
  return `I=[${inflows || ''}] O=[${outflows || ''}] In=[${inputs || ''}] Out=[${outputs || ''}]`
}

function main() {
  const decoded: { name: string; data: Root }[] = FILES.map(p => ({
    name: shortName(p),
    data: decode_gia_file(p, undefined, false),
  }))
  const fileNames = decoded.map(d => d.name)

  // Per-file composite def collection
  const perFile: Record<string, Map<number, { unit: GraphUnit; def: CompositeDef }>> = {}
  for (const { name, data } of decoded) {
    perFile[name] = new Map()
    const allUnits = [data.graph, ...(data.accessories ?? [])]
    for (const unit of allUnits) {
      if (unit && unit.which === 12 && unit.compositeDef?.inner?.def) {
        const def = unit.compositeDef.inner.def
        const id = def.id?.genericId?.id ?? def.id?.concreteId?.id ?? 0
        if (id) perFile[name].set(id, { unit, def })
      }
    }
  }

  // Per-file signal def collection: try which=14
  const perFileSignal: Record<string, Map<number, GraphUnit>> = {}
  for (const { name, data } of decoded) {
    perFileSignal[name] = new Map()
    const allUnits = [data.graph, ...(data.accessories ?? [])]
    for (const unit of allUnits) {
      if (unit && unit.which === 14) {
        const id = unit.id?.id ?? 0
        if (id) perFileSignal[name].set(id, unit)
      }
    }
  }

  if (FILES.length === 1) {
    showSingleFile(decoded[0], perFile[fileNames[0]], perFileSignal[fileNames[0]])
  } else {
    showCrossFileComparison(decoded, fileNames, perFile, perFileSignal)
  }
}

function showSingleFile(
  { name: fname, data }: { name: string; data: Root },
  composites: Map<number, { unit: GraphUnit; def: CompositeDef }>,
  signals: Map<number, GraphUnit>,
) {
  console.log('='.repeat(80))
  console.log(`  File: ${fname}`)
  console.log('='.repeat(80))

  // === Basic info ===
  const mainUnit = data.graph
  console.log(`\n  GraphUnit.which: ${mainUnit?.which ?? '?'}`)
  console.log(`  GraphUnit.id:   ${mainUnit?.id?.id ?? '?'}`)
  console.log(`  GameVersion:    ${data.gameVersion ?? '?'}`)
  console.log(`  Accessories:    ${(data.accessories ?? []).length}`)
  console.log(`  CompositeDefs:  ${composites.size}`)
  console.log(`  SignalDefs:     ${signals.size}`)

  // === Impl graph (if main graph has one) ===
  const mg = mainUnit?.graph?.inner?.graph
  if (mg) {
    console.log(`\n  Main graph: id=${mg.id?.id ?? '?'}, nodes=${mg.nodes?.length ?? 0}, edges=${mg.edges?.length ?? 0}`)
    const rootNodes = (mg.nodes ?? []).filter((n: any) => !n.hasOwnProperty('type') || n.type !== undefined)
    // count root-level event nodes or nodes with no incoming edges
    const incomingEdges = new Set<number>()
    for (const e of (mg.edges ?? [])) incomingEdges.add(e.to?.nodeIndex ?? -1)
    const entryNodes = (mg.nodes ?? []).filter((n: any) => n.type === 2 || n.nodeIndex === 0 || !incomingEdges.has(n.nodeIndex))
    console.log(`  Entry hints:  nodes not targeted by any edge = ${entryNodes.length}`)
  }

  // === CPI check ===
  let cpiFail = 0
  // CPI-1: every composite def has a name
  for (const [id, { def }] of composites) {
    if (!def.name && id !== 0) {
      console.log(`  CPI FAIL: composite ID ${id} has no name`)
      cpiFail++
    }
  }

  // CPI-2: every signal def has a non-empty signal list
  for (const [id, unit] of signals) {
    if (!unit.structureDef) {
      console.log(`  CPI note: SignalDef ID ${id} has no structureDef — proxy signal?`)
    }
  }

  if (cpiFail === 0) console.log(`  CPI: OK — ${composites.size} composites passed CPI check`)

  // === Composite list ===
  console.log(`\n  ── Composites (${composites.size}) ──`)
  const sorted = [...composites.entries()].sort(([a], [b]) => a - b)
  for (const [id, { def }] of sorted) {
    const iface = formatInterface(def)
    const hasImpl = findImplNodeCount(data, def)
    const impl = hasImpl > 0 ? ` (impl: ${hasImpl}n)` : ''
    const name = def.name ?? '(unnamed)'
    console.log(`    ${String(id).padEnd(12)} "${name}"${impl}`)
    const lines = iface.match(/.{1,72}/g) ?? [iface]
    for (const line of lines) console.log(`    ${' '.repeat(12)} ${line}`)
  }

  // === Signal list ===
  if (signals.size > 0) {
    console.log(`\n  ── Signals (${signals.size}) ──`)
    for (const [id, unit] of signals) {
      const sd = unit.structureDef?.def
      const vars = sd?.genericField?.vars?.length ?? 0
      const conns = sd?.connectField?.vars?.length ?? 0
      console.log(`    ID ${id}: "${unit.name ?? ''}"  structVars=${vars} conns=${conns}`)
    }
  }

  // === Which values ===
  const allWhich = new Set<number>()
  for (const unit of [data.graph, ...(data.accessories ?? [])]) {
    if (unit?.which !== undefined) allWhich.add(unit.which)
  }
  console.log(`\n  GraphUnit.which values: ${[...allWhich].sort((a, b) => a - b).join(', ')}`)

  // === which=14 details ===
  for (const unit of [data.graph, ...(data.accessories ?? [])]) {
    if (unit && unit.which === 14) {
      console.log(`\n  which=14 detail: id=${unit.id?.id} name="${unit.name ?? ''}"`)
      console.log(`    compositeDef=${!!unit.compositeDef}  graph=${!!unit.graph}  structureDef=${!!unit.structureDef}`)
    }
  }
}

function findImplNodeCount(data: Root, def: CompositeDef): number {
  const implUnit = (data.accessories ?? []).find(
    (a: GraphUnit) => a.graph?.inner?.graph?.id?.id === def.id?.graphId?.id
  )
  return implUnit?.graph?.inner?.graph?.nodes?.length ?? 0
}

function showCrossFileComparison(
  decoded: { name: string; data: Root }[],
  fileNames: string[],
  perFile: Record<string, Map<number, { unit: GraphUnit; def: CompositeDef }>>,
  perFileSignal: Record<string, Map<number, GraphUnit>>,
) {

  // Explore all which values
  const allWhichSeen = new Set<number>()
  for (const { name, data } of decoded) {
    const allUnits = [data.graph, ...(data.accessories ?? [])]
    for (const unit of allUnits) {
      if (unit?.which !== undefined) allWhichSeen.add(unit.which)
    }
  }
  console.log('All GraphUnit.which values seen:', [...allWhichSeen].sort((a: number, b: number) => a - b).join(', '))

  // Also check: which=14 accessories and their contents
  for (const { name, data } of decoded) {
    const allUnits = [data.graph, ...(data.accessories ?? [])]
    for (const unit of allUnits) {
      if (unit && unit.which === 14) {
        console.log(`\n[${name}] which=14 unit: id=${unit.id?.id}, name="${unit.name}"`)
        console.log(`  has compositeDef=${!!unit.compositeDef}, has graph=${!!unit.graph}, has structureDef=${!!unit.structureDef}`)
        if (unit.structureDef) {
          const sd = unit.structureDef.def
          console.log(`  structureDef: genericField.vars=${sd?.genericField?.vars?.length ?? 0}, connectField.vars=${sd?.connectField?.vars?.length ?? 0}, index=${sd?.index}`)
        }
      }
    }
  }

  // All composite IDs
  const allCompositeIds = new Set<number>()
  for (const name in perFile) {
    for (const id of perFile[name].keys()) allCompositeIds.add(id)
  }

  // 1. Shared composite defs
  console.log('\n' + '='.repeat(100))
  console.log('1. ALL SHARED CompositeDef IDs (appear in >=2 files)')
  console.log('='.repeat(100))
  const sharedIds: number[] = []
  for (const id of allCompositeIds) {
    const filesHaving = fileNames.filter(f => perFile[f].has(id))
    if (filesHaving.length >= 2) sharedIds.push(id)
  }
  sharedIds.sort((a, b) => a - b)

  for (const id of sharedIds) {
    const firstFile = fileNames.find(f => perFile[f].has(id))!
    const firstDef = perFile[firstFile].get(id)!.def
    console.log(`\n--- ID ${id} ---`)
    console.log(`  Name: "${firstDef.name}"`)

    const ifaces: Record<string, string> = {}
    for (const f of fileNames) {
      if (perFile[f].has(id)) {
        const { def, unit } = perFile[f].get(id)!
        ifaces[f] = formatInterface(def)
        // Get impl graph nodes count
        const implUnit = decoded.find(d => d.name === f)!.data.accessories?.find(
          (a: GraphUnit) => a.graph?.inner?.graph?.id?.id === def.id?.graphId?.id
        )
        const nodeCount = implUnit?.graph?.inner?.graph?.nodes?.length ?? 0
        console.log(`  [${f}]: ${ifaces[f]}`)
        console.log(`           Has impl: ${nodeCount > 0} (${nodeCount} nodes)`)
      }
    }
    const keys = Object.keys(ifaces)
    const identical = keys.length > 1 && keys.slice(1).every(k => ifaces[k] === ifaces[keys[0]])
    console.log(`  Interface identical across files: ${identical}`)
  }

  // 2. SignalDef
  console.log('\n' + '='.repeat(100))
  console.log('2. SignalDef (which=14 or other non-12 accessory GraphUnits)')
  console.log('='.repeat(100))

  // Check all accessories that are NOT which==12 (composite) and NOT the main graph
  for (const { name, data } of decoded) {
    const accs = data.accessories ?? []
    const nonComp = accs.filter((a: GraphUnit) => a?.which !== 12)
    if (nonComp.length > 0) {
      console.log(`\n  [${name}] — ${nonComp.length} non-composite accessories:`)
      for (const a of nonComp) {
        console.log(`    which=${a.which} id=${a.id?.id} name="${a.name}" hasGraph=${!!a.graph} hasStruct=${!!a.structureDef} hasCompDef=${!!a.compositeDef}`)
      }
    }
  }

  // Check for shared signal defs
  const allSignalIds = new Set<number>()
  for (const name in perFileSignal) {
    for (const id of perFileSignal[name].keys()) allSignalIds.add(id)
  }
  if (allSignalIds.size > 0) {
    console.log('\n  SignalDef IDs seen:')
    for (const id of allSignalIds) {
      const filesHaving = fileNames.filter(f => perFileSignal[f].has(id))
      console.log(`    ID ${id}: in [${filesHaving.join(', ')}]`)
    }
  } else {
    console.log('\n  No which=14 GraphUnits found across any file.')
  }

  // 3. Unique CompositeDefs
  console.log('\n' + '='.repeat(100))
  console.log('3. UNIQUE CompositeDefs (only in one file)')
  console.log('='.repeat(100))
  for (const f of fileNames) {
    const unique: number[] = []
    for (const id of perFile[f].keys()) {
      const filesHaving = fileNames.filter(n => perFile[n].has(id))
      if (filesHaving.length === 1) unique.push(id)
    }
    unique.sort((a, b) => a - b)
    console.log(`\n  ${f}: ${unique.length} unique`)
    for (const id of unique) {
      const { def } = perFile[f].get(id)!
      console.log(`    ID ${id}: "${def.name}" — ${formatInterface(def)}`)
    }
  }

  // 4. Totals and proportions
  console.log('\n' + '='.repeat(100))
  console.log('4. TOTALS & PROPORTIONS')
  console.log('='.repeat(100))
  for (const f of fileNames) {
    const total = perFile[f].size
    const shared = sharedIds.filter(id => perFile[f].has(id)).length
    const unique = total - shared
    const pct = total > 0 ? (shared / total * 100).toFixed(1) : 'N/A'
    console.log(`\n  ${f}: ${total} total, ${shared} shared with >=1 other file, ${unique} unique, ${pct}% shared`)
  }

  // 5. Shared ID file membership
  console.log('\n' + '='.repeat(100))
  console.log('5. SHARED ID MEMBERSHIP')
  console.log('='.repeat(100))
  for (const id of sharedIds) {
    const filesHaving = fileNames.filter(f => perFile[f].has(id))
    const firstDef = perFile[filesHaving[0]].get(id)!.def
    console.log(`  ID ${id} ("${firstDef.name}"): ${filesHaving.join(', ')}`)
  }
}

main()
