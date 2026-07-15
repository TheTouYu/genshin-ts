import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { mergeIrJsonFilesByGraphId } from '../../src/compiler/ir_merge.js'
import { irToGia } from '../../src/compiler/ir_to_gia_transform/index.js'
import { compileTsToGs } from '../../src/compiler/ts_to_gs_pipeline.js'
import { loadGiaProto } from '../../src/injector/proto.js'
import type { IRDocument } from '../../src/runtime/IR.js'
import type { Root as GiaRoot } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.js'

const root = process.cwd()
const tempRoot = path.join(root, 'tests', '.client-ts-transform-tmp')
const outDir = path.join(tempRoot, 'out')
const fixture = 'scripts/client-nodegraph/fixtures/client_ts_transform.ts'
const helperFixture = 'scripts/client-nodegraph/fixtures/client_ts_transform_helpers.ts'

function relative(file: string) {
  return path.relative(root, file).replace(/\\/g, '/')
}

async function compile(entries: string[]) {
  return compileTsToGs({
    cfgDir: root,
    cfg: {
      compileRoot: '.',
      entries,
      outDir: relative(outDir),
      options: { optimize: { precompileExpression: false, removeUnusedNodes: false } }
    }
  })
}

async function expectCompileError(name: string, source: string, pattern: RegExp) {
  const file = path.join(tempRoot, `${name}.ts`)
  fs.writeFileSync(file, source, 'utf8')
  let error: unknown
  try {
    await compile([relative(file)])
  } catch (caught) {
    error = caught
  }
  assert.ok(error, `${name}: expected compilation to fail`)
  assert.match(String(error), pattern, `${name}: unexpected compilation error`)
}

async function expectRuntimeError(
  name: string,
  source: string,
  pattern: RegExp,
  buildDocuments = false
) {
  const file = path.join(tempRoot, `${name}.ts`)
  fs.writeFileSync(file, source, 'utf8')
  const result = await compile([relative(file)])
  let error: unknown
  try {
    await import(`${pathToFileURL(result.entryOutFiles[0]).href}?test=${Date.now()}`)
    if (buildDocuments) {
      const { buildAllGraphRegistriesIRDocuments } = await import('genshin-ts/runtime/core')
      buildAllGraphRegistriesIRDocuments()
    }
  } catch (caught) {
    error = caught
  }
  assert.ok(error, `${name}: expected graph construction to fail`)
  assert.match(String(error), pattern, `${name}: unexpected graph construction error`)
}

fs.rmSync(tempRoot, { recursive: true, force: true })
fs.mkdirSync(tempRoot, { recursive: true })

try {
  const result = await compile([fixture, helperFixture])
  assert.strictEqual(result.entryOutFiles.length, 1, 'pure client file must be an entry')
  const output = fs.readFileSync(result.entryOutFiles[0], 'utf8')
  assert.match(output, /^\/\/ @gsts:entry\n/)
  assert.match(output, /\.doubleBranch\(/)
  assert.match(output, /\.__gstsInitLocalVariable\(/)
  assert.match(output, /\.finiteLoop\(/)
  assert.match(output, /\.multipleBranches\(/)
  assert.match(output, /\.dataTypeConversion\(/)
  assert.match(output, /gsts\.fCreationStatus\.doubleBranch\(/)
  assert.doesNotMatch(output, /gsts\.f\.(?:doubleBranch|finiteLoop|addition)/)

  await import(`${pathToFileURL(result.entryOutFiles[0]).href}?test=${Date.now()}`)
  const { buildClientGraphRegistriesIRDocuments } = await import('genshin-ts/runtime/core')
  assert.strictEqual(int(123), 123n)
  assert.strictEqual(float(1), 1)
  assert.strictEqual(bool(true), true)
  assert.strictEqual(str('value'), 'value')
  assert.strictEqual(
    gsts.ctx.withCtx('client_creation_status_decision_handler', () =>
      gsts.ctx.isClientGraphCtx('creation_status')
    ),
    false,
    'creation_status_decision context must not match creation_status'
  )
  const documents = buildClientGraphRegistriesIRDocuments()
  assert.strictEqual(documents.length, 7, 'fixture must build all seven client graph families')
  const subTypes = documents.map((document) => {
    assert.strictEqual(document.graph.type, 'client')
    if (document.graph.type !== 'client') throw new Error('expected client graph document')
    return document.graph.sub_type
  })
  assert.deepStrictEqual(
    new Set(subTypes),
    new Set([
      'character_skill',
      'character_control_skill',
      'creation_skill',
      'creation_status',
      'creation_status_decision',
      'bool_filter',
      'int_filter'
    ])
  )
  const intervalBySubType = new Map(
    documents.flatMap((document) =>
      document.graph.type === 'client'
        ? [[document.graph.sub_type, document.graph.evaluation_interval] as const]
        : []
    )
  )
  assert.strictEqual(intervalBySubType.get('bool_filter'), 0.3)
  assert.strictEqual(intervalBySubType.get('int_filter'), 0.75)
  for (const subType of subTypes) {
    if (subType === 'bool_filter' || subType === 'int_filter') continue
    assert.strictEqual(intervalBySubType.get(subType), undefined)
  }

  const duplicateClientPath = path.join(outDir, 'duplicate-client.json')
  fs.writeFileSync(duplicateClientPath, JSON.stringify([documents[0], documents[0]]), 'utf8')
  assert.throws(
    () => mergeIrJsonFilesByGraphId({ outDirAbs: outDir, irJsonPaths: [duplicateClientPath] }),
    /client graph id may only be declared once|客户端节点图 id 只能声明一次/
  )

  const serverGraphId = 1082130699
  const duplicateServerPath = path.join(outDir, 'duplicate-server.json')
  const serverDocuments: IRDocument[] = [
    {
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { type: 'server', id: serverGraphId, mode: 'beyond' },
      nodes: [{ id: 1, type: 'first_server_event' }]
    },
    {
      ir_version: 1,
      ir_type: 'node_graph',
      graph: { type: 'server', id: serverGraphId, mode: 'beyond' },
      nodes: [{ id: 1, type: 'second_server_event' }]
    }
  ]
  fs.writeFileSync(duplicateServerPath, JSON.stringify(serverDocuments), 'utf8')
  const [mergedServer] = mergeIrJsonFilesByGraphId({
    outDirAbs: outDir,
    irJsonPaths: [duplicateServerPath]
  })
  assert.strictEqual(mergedServer.merged.nodes?.length, 2)
  assert.deepStrictEqual(
    mergedServer.merged.nodes?.map((node) => node.id),
    [1, 2],
    'duplicate server graph ids must keep the existing multi-event merge behavior'
  )

  const ir = JSON.stringify(documents)
  for (const nodeType of [
    'double_branch',
    'finite_loop',
    'multiple_branches',
    'get_local_variable',
    'set_local_variable',
    'sine_function',
    'data_type_conversion_float',
    'data_type_conversion_int',
    'data_type_conversion_str',
    'data_type_conversion_bool'
  ]) {
    assert.ok(ir.includes(`"type":"${nodeType}"`), `missing transformed node ${nodeType}`)
  }

  const protoPath = path.join(
    root,
    'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
  )
  const { rootMessage } = loadGiaProto(protoPath)
  documents.forEach((document, index) => {
    const bytes = irToGia(document, { protoPath })
    assert.ok(bytes.length > 0, `${subTypes[index]}: empty GIA output`)
    const message = rootMessage.decode(bytes.slice(20, -4))
    const decoded = rootMessage.toObject(message, {
      defaults: true,
      longs: Number
    }) as GiaRoot
    const clientGraph = decoded.graph?.graph?.inner.graph
    assert.ok(clientGraph, `${subTypes[index]}: missing decoded client graph`)
    const expectedInterval = intervalBySubType.get(subTypes[index])
    if (expectedInterval === undefined) {
      assert.strictEqual(clientGraph.evaluationInterval, undefined)
    } else {
      assert.ok(
        Math.abs((clientGraph.evaluationInterval ?? Number.NaN) - expectedInterval) < 1e-6,
        `${subTypes[index]}: unexpected GIA evaluationInterval ${String(clientGraph.evaluationInterval)}`
      )
    }
  })

  const importG = `import { g } from 'genshin-ts/runtime/core'`
  const wrapperConversionGraphIds = {
    characterSkill: 1082130690,
    creationStatusDecision: 1082130691
  }
  const wrapperConversionPath = path.join(tempRoot, 'client-wrapper-conversions.ts')
  fs.writeFileSync(
    wrapperConversionPath,
    `${importG}
function gstsCharacterSkillConvertFloat(value: bigint) { return float(value) }
g.characterSkill({ id: ${wrapperConversionGraphIds.characterSkill} }).on('start', (_evt, f) => {
  const sameInt = int(f.addition(1n, 2n))
  const literalInt = int(123)
  const convertedFloat = gstsCharacterSkillConvertFloat(f.addition(3n, 4n))
  const nativeFloat = Number(f.addition(5n, 6n))
  const nativeString = String(f.addition(7n, 8n))
  const nativeBool = Boolean(f.addition(9n, 10n))
  const nativeMath = Math.sin(f.addition(11n, 12n))
  f.finiteLoop(sameInt, literalInt, () => {})
  f.setAttackWeight(convertedFloat, true)
  f.setAttackWeight(nativeFloat, nativeBool)
  f.setAttackWeight(nativeMath, true)
  f.notifyServerNodeGraph(nativeString, '', '')
})
g.creationStatusDecision({ id: ${wrapperConversionGraphIds.creationStatusDecision} }).on('start', (_evt, f) => {
  f.doubleBranch(true, () => {
    const wiredInt = f.absoluteValueOperation(-1n)
    f.doubleBranch(f.greaterThan(float(wiredInt), 0), () => {}, () => {})
  }, () => {})
})`,
    'utf8'
  )
  const wrapperConversionResult = await compile([relative(wrapperConversionPath)])
  const wrapperConversionOutput = fs.readFileSync(wrapperConversionResult.entryOutFiles[0], 'utf8')
  assert.match(wrapperConversionOutput, /const sameInt = int\(f\.addition\(1n, 2n\)\)/)
  assert.match(wrapperConversionOutput, /const literalInt = int\(123\)/)
  assert.match(wrapperConversionOutput, /return float\(value\)/)
  assert.match(
    wrapperConversionOutput,
    /const convertedFloat = gstsCharacterSkillConvertFloat\(f\.addition\(3n, 4n\)\)/
  )
  assert.match(wrapperConversionOutput, /const nativeFloat = float\(f\.addition\(5n, 6n\)\)/)
  assert.match(wrapperConversionOutput, /const nativeString = str\(f\.addition\(7n, 8n\)\)/)
  assert.match(wrapperConversionOutput, /const nativeBool = bool\(f\.addition\(9n, 10n\)\)/)
  assert.match(
    wrapperConversionOutput,
    /const nativeMath = f\.sineFunction\(float\(f\.addition\(11n, 12n\)\)\)/
  )
  assert.match(wrapperConversionOutput, /f\.greaterThan\(float\(wiredInt\), 0\)/)
  await import(`${pathToFileURL(wrapperConversionResult.entryOutFiles[0]).href}?test=${Date.now()}`)
  const wrapperConversionDocuments = buildClientGraphRegistriesIRDocuments().filter(
    (document) =>
      typeof document.graph.id === 'number' &&
      Object.values(wrapperConversionGraphIds).includes(document.graph.id)
  )
  assert.strictEqual(wrapperConversionDocuments.length, 2)
  const characterWrapperDocument = wrapperConversionDocuments.find(
    (item) => item.graph.id === wrapperConversionGraphIds.characterSkill
  )
  assert.ok(characterWrapperDocument, 'missing character skill wrapper conversion graph')
  const characterConversionTypes =
    characterWrapperDocument.nodes
      ?.map((node) => node.type)
      .filter((type) => type.startsWith('data_type_conversion_')) ?? []
  assert.strictEqual(
    characterConversionTypes.filter((type) => type === 'data_type_conversion_float').length,
    3
  )
  assert.strictEqual(
    characterConversionTypes.filter((type) => type === 'data_type_conversion_str').length,
    1
  )
  assert.strictEqual(
    characterConversionTypes.filter((type) => type === 'data_type_conversion_bool').length,
    1
  )
  assert.doesNotMatch(
    JSON.stringify(characterConversionTypes),
    /data_type_conversion_int/,
    'same-type int wrappers and int(123) must not create conversion nodes'
  )
  const decisionWrapperDocument = wrapperConversionDocuments.find(
    (item) => item.graph.id === wrapperConversionGraphIds.creationStatusDecision
  )
  assert.ok(decisionWrapperDocument, 'missing creation status decision wrapper conversion graph')
  assert.deepStrictEqual(
    decisionWrapperDocument.nodes
      ?.map((node) => node.type)
      .filter((type) => type.startsWith('data_type_conversion_')),
    ['data_type_conversion_float'],
    'creation status decision must use its own client conversion functions'
  )

  const shadowedWrapperGraphId = 1082130692
  const shadowedWrapperPath = path.join(tempRoot, 'shadowed-client-wrapper.ts')
  fs.writeFileSync(
    shadowedWrapperPath,
    `${importG}
function float<T>(value: T): T { return value }
g.characterSkill({ id: ${shadowedWrapperGraphId} }).on('start', (_evt, f) => {
  const wiredInt = f.addition(1n, 2n)
  f.absoluteValueOperation(float(wiredInt))
})`,
    'utf8'
  )
  const shadowedWrapperResult = await compile([relative(shadowedWrapperPath)])
  const shadowedWrapperOutput = fs.readFileSync(shadowedWrapperResult.entryOutFiles[0], 'utf8')
  assert.match(shadowedWrapperOutput, /f\.absoluteValueOperation\(float\(wiredInt\)\)/)
  assert.doesNotMatch(shadowedWrapperOutput, /\.dataTypeConversion\(/)
  await import(`${pathToFileURL(shadowedWrapperResult.entryOutFiles[0]).href}?test=${Date.now()}`)
  const shadowedWrapperDocument = buildClientGraphRegistriesIRDocuments().find(
    (document) => document.graph.id === shadowedWrapperGraphId
  )
  assert.ok(shadowedWrapperDocument, 'missing shadowed wrapper graph')
  assert.doesNotMatch(JSON.stringify(shadowedWrapperDocument), /data_type_conversion_/)

  await expectCompileError(
    'mutable-outer-capture',
    `${importG}
let counter = 0n
g.characterSkill().on('start', () => { counter = counter + 1n })`,
    /cannot capture mutable outer variable "counter"/
  )
  fs.writeFileSync(
    path.join(tempRoot, 'mutable-outer-state.ts'),
    'export let sharedCounter = 0n\n',
    'utf8'
  )
  await expectCompileError(
    'imported-mutable-outer-capture',
    `${importG}
import { sharedCounter } from './mutable-outer-state.js'
g.characterSkill().on('start', (_evt, f) => { f.addition(sharedCounter, 1n) })`,
    /cannot capture mutable outer variable "sharedCounter"/
  )
  await expectCompileError(
    'cross-family-call',
    `${importG}
function gstsCharacterSkillShared(value: bigint) { return value + 1n }
g.creationSkill().on('start', () => { gstsCharacterSkillShared(0n) })`,
    /can only be called from the same client graph family/
  )
  await expectCompileError(
    'mismatched-f-namespace',
    `${importG}
g.characterSkill().on('start', () => { gsts.fCreationSkill.addition(1n, 2n) })`,
    /gsts\.fCreationSkill is only available in matching creation_skill/
  )
  await expectCompileError(
    'unsupported-math',
    `${importG}
g.characterSkill().on('start', () => { Math.sqrt(4) })`,
    /Math\.sqrt is not supported in client graph character_skill; available methods: Math\.abs/
  )
  await expectCompileError(
    'unavailable-local-variable',
    `${importG}
g.creationStatus().on('start', () => { let value = 0n; value += 1n })`,
    /client method "initLocalVariable" is not available in creation_status beyond mode/
  )
  await expectCompileError(
    'unavailable-ternary-local-variable',
    `${importG}
g.creationStatusDecision().on('start', (_evt, f) => {
  const result = f.equal(1n, 1n) ? 1n : 0n
  f.absoluteValueOperation(result)
})`,
    /client method "initLocalVariable" is not available in creation_status_decision beyond mode/
  )
  const repeatedConstGraphIds = {
    creationStatus: 1082130680,
    creationStatusDecision: 1082130681,
    boolFilter: 1082130682,
    intFilter: 1082130683
  }
  const repeatedConstPath = path.join(tempRoot, 'repeated-const-direct-evaluation.ts')
  fs.writeFileSync(
    repeatedConstPath,
    `${importG}
g.creationStatus({ id: ${repeatedConstGraphIds.creationStatus} }).on('start', (_evt, f) => {
  const ready = f.equal(1n, 1n)
  if (ready) f.absoluteValueOperation(-1n)
  if (ready) f.absoluteValueOperation(-2n)
})
g.creationStatusDecision({ id: ${repeatedConstGraphIds.creationStatusDecision} }).on('start', (_evt, f) => {
  const ready = f.equal(1n, 1n)
  if (ready) f.absoluteValueOperation(-1n)
  if (ready) f.absoluteValueOperation(-2n)
})
g.boolFilter({ id: ${repeatedConstGraphIds.boolFilter} }).on('start', (_evt, f) => {
  const ready = f.equal(1n, 1n)
  return f.logicalAndOperation(ready, ready)
})
g.intFilter({ id: ${repeatedConstGraphIds.intFilter} }).on('start', (_evt, f) => {
  const roll = f.getRandomNumber(0n, 10n)
  return f.addition(roll, roll)
})`,
    'utf8'
  )
  const repeatedConstResult = await compile([relative(repeatedConstPath)])
  const repeatedConstOutput = fs.readFileSync(repeatedConstResult.entryOutFiles[0], 'utf8')
  assert.doesNotMatch(repeatedConstOutput, /\.__gstsInitLocalVariable\(/)
  await import(`${pathToFileURL(repeatedConstResult.entryOutFiles[0]).href}?test=${Date.now()}`)
  const repeatedConstGraphIdSet = new Set(Object.values(repeatedConstGraphIds))
  const repeatedConstDocuments = buildClientGraphRegistriesIRDocuments().filter(
    (document) =>
      typeof document.graph.id === 'number' && repeatedConstGraphIdSet.has(document.graph.id)
  )
  assert.strictEqual(
    repeatedConstDocuments.length,
    repeatedConstGraphIdSet.size,
    'all reused const graphs must compile and register'
  )
  const repeatedConstIr = JSON.stringify(repeatedConstDocuments)
  assert.match(repeatedConstIr, /"type":"equal"/)
  assert.match(repeatedConstIr, /"type":"get_random_number"/)
  assert.doesNotMatch(repeatedConstIr, /"type":"(?:get|set)_local_variable"/)
  await expectRuntimeError(
    'duplicate-client-handler',
    `${importG}
const graph = g.creationStatus({ id: 1082130688 })
graph.on('start', () => {})
graph.on('start', () => {})`,
    /client creation_status graph may only register one start handler/
  )
  await expectRuntimeError(
    'duplicate-client-id',
    `${importG}
g.creationStatus({ id: 1082130689 }).on('start', () => {})
g.creationStatus({ id: 1082130689 }).on('start', () => {})`,
    /client graph id may only be declared once: id=1082130689/,
    true
  )
  await expectCompileError(
    'client-recursion',
    `${importG}
function gstsCharacterSkillA(value: bigint): bigint { return gstsCharacterSkillB(value) }
function gstsCharacterSkillB(value: bigint): bigint { return gstsCharacterSkillA(value) }
g.characterSkill().on('start', () => { gstsCharacterSkillA(0n) })`,
    /client gsts function recursion is not supported/
  )

  console.log('[ok] client TS transform entry, lowering, aliases, GIA, and errors verified')
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
