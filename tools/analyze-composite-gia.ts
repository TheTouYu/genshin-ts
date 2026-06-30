/**
 * Cross-file CompositeDef & SignalDef analysis for 3 GIA files.
 * Run with: npx tsx tools/analyze-composite-gia.ts
 */
import { decode_gia_file } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.ts'
import type { Root, GraphUnit, CompositeDef, CompositeDef_ControlFlow, CompositeDef_ParameterFlow } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts'

const FILES = [
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/传球.gia',
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/弹球.gia',
  '/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia',
]

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

  // Per-file signal def collection: try which=14, also check structureDef
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
