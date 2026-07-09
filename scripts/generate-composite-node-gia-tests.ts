import path from 'node:path'

import { NODE_TYPE_BY_METHOD } from '../src/definitions/node_modes.js'
import { assignTypeParamsFromCase, emitArgFromNodesTypeText } from './testgen/args_from_nodes.js'
import { writeText, type GeneratedCall } from './testgen/emit.js'
import { buildGenericsMap, loadNodeGenerics } from './testgen/generics_data.js'
import { extractServerFMethods, type MethodInfo } from './testgen/methods.js'
import { loadEnumPicks } from './testgen/picks.js'
import { emitCallWithOutputConsumers } from './testgen/return_consumers.js'
import { emitProducers, type Ctx, type Mode } from './testgen/values.js'
import { canResolveNodeType, readVendorNodeIdKeysLower } from './testgen/vendor_ids.js'

type CompositeGeneratedCall = GeneratedCall & {
  methodName: string
  mode: Mode
}

type SkipRow = { name: string; nodeType?: string; why: string }

const PROFILE_METHODS = {
  core: new Set([
    // Numeric/list generic group 1: high-value data node coverage.
    'addition',
    'subtraction',
    'multiplication',
    'division',
    'exponentiation',
    'takeLargerValue',
    'takeSmallerValue',
    'absoluteValueOperation',
    'signOperation',
    'rangeLimitingOperation',
    'lessThan',
    'lessThanOrEqualTo',
    'greaterThan',
    'greaterThanOrEqualTo',
    'getMaximumValueFromList',
    'getMinimumValueFromList',

    // Cross-type basics.
    'equal',
    'dataTypeConversion',
    'assemblyList',
    'getListLength',
    'listIterationLoop',

    // Exec/control basics.
    'printString',
    'finiteLoop',
    'doubleBranch',
    'multipleBranches'
  ]),
  collections: new Set([
    // Remaining list APIs from generated group 2.
    'concatenateList',
    'clearList',
    'listIncludesThisValue',
    'searchListAndReturnValueId',
    'getCorrespondingValueFromList',
    'insertValueIntoList',
    'removeValueFromList',
    'modifyValueInList',

    // Dictionary APIs from generated groups 4/5/11/12.
    'assemblyDictionary',
    'setOrAddKeyValuePairsToDictionary',
    'queryDictionaryValueByKey',
    'removeKeyValuePairsFromDictionaryByKey',
    'queryIfDictionaryContainsSpecificKey',
    'getListOfKeysFromDictionary',
    'queryDictionarySLength',
    'clearDictionary',
    'createDictionary',
    'queryIfDictionaryContainsSpecificValue',
    'getListOfValuesFromDictionary',
    'sortDictionaryByKey',
    'sortDictionaryByValue',

    // Local variables: small but important capture/runtime coverage.
    'getLocalVariable',
    'setLocalVariable'
  ])
}

type ProfileName = keyof typeof PROFILE_METHODS

function isProfileName(name: string): name is ProfileName {
  return Object.prototype.hasOwnProperty.call(PROFILE_METHODS, name)
}

const COMPOSITE_UNSAFE_METHODS = new Set([
  'defineComposite',
  'callComposite',
  'declareDetached',
  'connectOutFlow',
  'entry',
  'eventMarker',
  'node',
  'rawExecNode',
  'registerExecNode',
  'link',
  'linkTo',
  'connect',
  'inflow',
  'outflow',
  'leaf',
  'branchExec',
  'createOutParamValue',
  'fork',
  'return',
  'continue',
  'breakLoop',
  'modifyStructure'
])

const MAX_CASES_PER_METHOD = 4
const PROFILE_BASE_GRAPH_ID: Record<string, number> = {
  core: 1073741924,
  collections: 1073741926
}

function sanitizeIdentifierPart(raw: string): string {
  const s = raw.replace(/[^a-zA-Z0-9_$]+/g, '_').replace(/^([0-9])/, '_$1')
  return s || 'case'
}

function sanitizeComment(raw: string): string {
  return raw.replace(/\*\//g, '* /')
}

function shouldSkipCompositeMethod(m: MethodInfo, vendorKeysLower: Set<string>): string | null {
  if (COMPOSITE_UNSAFE_METHODS.has(m.name) || m.name.startsWith('__gsts')) {
    return 'composite generator skip: internal/control/composite-specific method'
  }
  if (m.nodeType && !canResolveNodeType(m.nodeType, vendorKeysLower)) {
    return 'missing in vendor NODE_ID'
  }
  if (
    m.params.some((p) =>
      /\bCustomVariableSnapshotValue\b|\bcustomVariableSnapshot\b/.test(p.typeText)
    )
  ) {
    return 'no stable CustomVariableSnapshotValue producer'
  }
  if (NODE_TYPE_BY_METHOD[m.name as keyof typeof NODE_TYPE_BY_METHOD] === 'classic') {
    return 'classic-only method not generated in v2 beyond composite smoke set'
  }
  return null
}

function buildOne(
  mode: Mode,
  m: MethodInfo,
  typeCase: string | undefined,
  ctx: Ctx,
  enumPick: ReturnType<typeof loadEnumPicks>
): CompositeGeneratedCall {
  const assign = typeCase ? assignTypeParamsFromCase(m, typeCase) : new Map()
  const args: string[] = []
  for (let i = 0; i < m.params.length; i++) {
    const p = m.params[i]!

    if (p.rest) {
      const baseTypeText = p.typeText.trim().replace(/\[\]$/, '').trim()
      args.push(
        emitArgFromNodesTypeText(mode, m, i, baseTypeText, ctx, enumPick, assign),
        emitArgFromNodesTypeText(mode, m, i, baseTypeText, ctx, enumPick, assign),
        emitArgFromNodesTypeText(mode, m, i, baseTypeText, ctx, enumPick, assign)
      )
      continue
    }

    args.push(emitArgFromNodesTypeText(mode, m, i, p.typeText, ctx, enumPick, assign))
  }

  const callExpr = `f.${m.name}(${args.join(', ')})`
  const code = emitCallWithOutputConsumers(m, callExpr, assign, enumPick, ctx)
  return { fn: m.name, methodName: m.name, typeCase, code, mode }
}

function emitCompositeFile(mode: Mode, title: string, graphId: number, calls: CompositeGeneratedCall[]) {
  const lines: string[] = []
  lines.push(`import { g } from 'genshin-ts/runtime/core'`)
  lines.push(`import { configId, faction, guid, prefabId, str as strValue } from 'genshin-ts/runtime/value'`)
  lines.push(`import * as E from 'genshin-ts/definitions/enum'`)
  lines.push(``)
  lines.push(`// AUTO-GENERATED: composite node coverage ${title} (${mode})`)
  lines.push(`// Run: npx tsx scripts/generate-composite-node-gia-tests.ts`)
  lines.push(`//`)
  lines.push(`// Each composite wraps one ordinary f.* API call inside defineComposite().`)
  lines.push(`// This complements tests/generated/* by checking that ordinary node functionality can be captured into composite impl graphs.`)
  lines.push(``)

  calls.forEach((c, index) => {
    const casePart = c.typeCase ? `_${sanitizeIdentifierPart(c.typeCase)}` : ''
    const varName = `comp_${sanitizeIdentifierPart(c.methodName)}_${index + 1}${casePart}`
    const display = `自动复合-${title}-${index + 1}-${c.methodName}${c.typeCase ? `-${c.typeCase}` : ''}`
    lines.push(`const ${varName} = g.defineComposite(${JSON.stringify(display)}, {`)
    lines.push(`  inputs: {},`)
    lines.push(`  outputs: {},`)
    lines.push(`  outflows: [{ name: '完成' }],`)
    lines.push(`  build(_args, f) {`)
    if (mode === 'wire') {
      for (const line of emitProducers().split('\n')) lines.push(`    ${line}`)
    }
    if (c.typeCase) lines.push(`    // ${c.methodName} :: ${sanitizeComment(c.typeCase)}`)
    for (const line of c.code.split('\n')) lines.push(`    ${line}`)
    lines.push(
      `    f.outflow('完成', f.registerExecNode('print_string', [new strValue(${JSON.stringify(`done ${c.methodName}`)})]), 0)`
    )
    lines.push(`    return {}`)
    lines.push(`  }`)
    lines.push(`})`)
    lines.push(``)
  })

  lines.push(`const graph = g.server({`)
  lines.push(`  mode: 'beyond',`)
  lines.push(`  type: 'entity',`)
  lines.push(`  name: ${JSON.stringify(`V2-全类型自动复合-${title}-${mode}-step1`)},`)
  lines.push(`  id: ${graphId}`)
  lines.push(`})`)
  lines.push(``)
  lines.push(`graph.on('whenEntityIsCreated', (_e, f) => {`)
  calls.forEach((c, index) => {
    const casePart = c.typeCase ? `_${sanitizeIdentifierPart(c.typeCase)}` : ''
    const varName = `comp_${sanitizeIdentifierPart(c.methodName)}_${index + 1}${casePart}`
    lines.push(`  f.callComposite(${varName}, {})`)
  })
  lines.push(`})`)
  lines.push(``)
  return lines.join('\n')
}

function main() {
  const repoRoot = process.cwd()
  const nodesTsPath = path.join(repoRoot, 'src/definitions/nodes.ts')
  const enumTsPath = path.join(repoRoot, 'src/definitions/enum.ts')
  const outDir = path.join(repoRoot, 'tests/composite/v2/all-types/generated')
  const selectedProfiles = process.argv.slice(2)
  const profileNames = selectedProfiles.length
    ? selectedProfiles.map((name) => {
        if (!isProfileName(name)) {
          throw new Error(`unknown composite test profile: ${name}`)
        }
        return name
      })
    : (Object.keys(PROFILE_METHODS) as ProfileName[])

  const vendorKeysLower = readVendorNodeIdKeysLower(repoRoot)
  const enumPick = loadEnumPicks(enumTsPath)
  const methods = extractServerFMethods(nodesTsPath)
  const genericsMap = buildGenericsMap(loadNodeGenerics(repoRoot))
  const methodByName = new Map(methods.map((m) => [m.name, m]))

  const report: Record<
    string,
    {
      includedMethods: number
      includedCases: number
      included: Record<string, { cases: number }>
      skipped: SkipRow[]
      files: string[]
    }
  > = {}

  for (const profileName of profileNames) {
    const methodsForProfile = PROFILE_METHODS[profileName]!
    const skipped: SkipRow[] = []
    const included: Record<string, { cases: number }> = {}
    const literalCalls: CompositeGeneratedCall[] = []
    const wireCalls: CompositeGeneratedCall[] = []
    const ctxLit: Ctx = { n: 0 }
    const ctxWire: Ctx = { n: 0 }

    for (const methodName of methodsForProfile) {
      const m = methodByName.get(methodName)
      if (!m) {
        skipped.push({ name: methodName, why: 'method not found' })
        continue
      }
      const skip = shouldSkipCompositeMethod(m, vendorKeysLower)
      if (skip) {
        skipped.push({ name: m.name, nodeType: m.nodeType, why: skip })
        continue
      }

      const ginfo = genericsMap.get(m.name)
      if (ginfo) {
        let count = 0
        for (const typeCase of ginfo.availableTypes) {
          if (count >= MAX_CASES_PER_METHOD) break
          if (m.name === 'dataTypeConversion' && /^dict<\s*faction\s*,/i.test(typeCase)) continue
          literalCalls.push(buildOne('literal', m, typeCase, ctxLit, enumPick))
          wireCalls.push(buildOne('wire', m, typeCase, ctxWire, enumPick))
          included[m.name] = { cases: (included[m.name]?.cases ?? 0) + 1 }
          count++
        }
        continue
      }

      literalCalls.push(buildOne('literal', m, undefined, ctxLit, enumPick))
      wireCalls.push(buildOne('wire', m, undefined, ctxWire, enumPick))
      included[m.name] = { cases: (included[m.name]?.cases ?? 0) + 1 }
    }

    const baseGraphId = PROFILE_BASE_GRAPH_ID[profileName] ?? 1073741950
    const literalFile = `${profileName}.literal.ts`
    const wireFile = `${profileName}.wire.ts`
    writeText(
      path.join(outDir, literalFile),
      emitCompositeFile('literal', profileName, baseGraphId, literalCalls)
    )
    writeText(
      path.join(outDir, wireFile),
      emitCompositeFile('wire', profileName, baseGraphId + 1, wireCalls)
    )

    report[profileName] = {
      includedMethods: Object.keys(included).length,
      includedCases: literalCalls.length,
      included,
      skipped,
      files: [literalFile, wireFile]
    }
    console.log(
      `[ok] profile ${profileName}: included methods=${Object.keys(included).length}, cases=${literalCalls.length}`
    )
    if (skipped.length) console.log(`[warn] profile ${profileName}: skipped=${skipped.length}`)
  }

  writeText(
    path.join(outDir, '_report.json'),
    JSON.stringify(
      {
        strategy: 'wrap ordinary f.* generated calls in one defineComposite per method/type case',
        profiles: report,
        notes: {
          maxCasesPerMethod: MAX_CASES_PER_METHOD,
          source: 'scripts/testgen helpers + PROFILE_METHODS allowlists'
        }
      },
      null,
      2
    ) + '\n'
  )

  console.log(`[ok] generated composite node tests: ${outDir}`)
}

main()
