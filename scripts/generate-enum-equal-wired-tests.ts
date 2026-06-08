import fs from 'node:fs'
import path from 'node:path'

import { ServerEventMetadata } from '../src/definitions/events.js'
import { enumeration } from '../src/runtime/value.js'

import {
  assignTypeParamsFromCase,
  emitArgFromNodesTypeText,
  type TypeParamAssignment
} from './testgen/args_from_nodes.js'
import { buildGenericsMap, loadNodeGenerics } from './testgen/generics_data.js'
import { extractServerFMethods } from './testgen/methods.js'
import { loadEnumPicks } from './testgen/picks.js'
import { canResolveNodeType, readVendorNodeIdKeysLower } from './testgen/vendor_ids.js'

type Ctx = { n: number }

function emitArgs(
  mode: 'literal',
  method: ReturnType<typeof extractServerFMethods>[number],
  enumPick: Map<string, string>,
  assign: TypeParamAssignment
): string[] {
  const ctx: Ctx = { n: 0 }
  const args: string[] = []
  for (let i = 0; i < method.params.length; i++) {
    const p = method.params[i]!
    if (p.rest) {
      const baseTypeText = p.typeText.trim().replace(/\[\]$/, '').trim()
      args.push(
        emitArgFromNodesTypeText(mode, method, i, baseTypeText, ctx, enumPick, assign),
        emitArgFromNodesTypeText(mode, method, i, baseTypeText, ctx, enumPick, assign),
        emitArgFromNodesTypeText(mode, method, i, baseTypeText, ctx, enumPick, assign)
      )
      continue
    }
    args.push(emitArgFromNodesTypeText(mode, method, i, p.typeText, ctx, enumPick, assign))
  }
  return args
}

function main() {
  const repoRoot = process.cwd()
  const nodesTsPath = path.join(repoRoot, 'src/definitions/nodes.ts')
  const enumTsPath = path.join(repoRoot, 'src/definitions/enum.ts')
  const outPath = path.join(repoRoot, 'tests/enum_cases/enum_enumerationsEqual_wired.ts')

  const enumPick = loadEnumPicks(enumTsPath)
  const enumTypes = new Set(enumPick.keys())
  const vendorKeysLower = readVendorNodeIdKeysLower(repoRoot)
  const methods = extractServerFMethods(nodesTsPath)
  const genericsMap = buildGenericsMap(loadNodeGenerics(repoRoot))

  const lines: string[] = []
  lines.push(`import { g } from 'genshin-ts/runtime/core'`)
  lines.push(`import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'`)
  lines.push(`import * as E from 'genshin-ts/definitions/enum'`)
  lines.push(``)
  lines.push(`// AUTO-GENERATED: enumerationsEqual wired enum returns/events`)
  lines.push(`// Run: npx tsx scripts/generate-enum-equal-wired-tests.ts`)
  lines.push(``)
  lines.push(`g.server({ id: 1073741853 }).on('whenEntityIsCreated', (_evt, f) => {`)

  let functionCount = 0
  for (const m of methods) {
    const returnType = m.returnText.trim()
    if (!enumTypes.has(returnType)) continue
    if (m.nodeType && !canResolveNodeType(m.nodeType, vendorKeysLower)) continue
    if (
      m.params.some((p) =>
        /\bCustomVariableSnapshotValue\b|\bcustomVariableSnapshot\b/.test(p.typeText)
      )
    ) {
      continue
    }
    if (m.name === 'modifyStructure') continue

    const ginfo = genericsMap.get(m.name)
    const typeCase = ginfo?.availableTypes?.[0]
    const assign = typeCase ? assignTypeParamsFromCase(m, typeCase) : new Map()
    const args = emitArgs('literal', m, enumPick, assign)
    const retName = `ret${functionCount}`

    lines.push(`  // ${m.name} :: ${returnType}${typeCase ? ` :: ${typeCase}` : ''}`)
    lines.push(`  const ${retName} = f.${m.name}(${args.join(', ')})`)
    lines.push(`  f.enumerationsEqual(${retName}, ${retName})`)
    functionCount += 1
  }
  lines.push(`})`)

  lines.push(``)
  lines.push(`// event enum outputs -> enumerationsEqual`)
  let eventCount = 0
  for (const [eventName, params] of Object.entries(ServerEventMetadata)) {
    const enumParams = params.filter((p) => p.typeBase === enumeration)
    if (!enumParams.length) continue
    lines.push(`g.server({ id: 1073741854 }).on(${JSON.stringify(eventName)}, (evt, f) => {`)
    for (const p of enumParams) {
      lines.push(`  // ${eventName}.${p.name} :: ${p.typeName}`)
      lines.push(`  f.enumerationsEqual(evt.${p.name}, evt.${p.name})`)
    }
    lines.push(`})`)
    lines.push(``)
    eventCount += 1
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')

  console.log(`[ok] generated: ${outPath}`)
  console.log(`[ok] enum-return functions: ${functionCount}`)
  console.log(`[ok] enum events: ${eventCount}`)
}

main()
