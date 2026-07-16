// @ts-nocheck
/**
 * P5-W10: special-arg named adapter full family shared.
 *
 * All 5 ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES use special_arg_adapter.ts for:
 * - assembly_list / assembly_dictionary: count@0 + elements@1+
 * - send_signal / monitor_signal: ClientExec name + data pin shift
 * - multiple_branches: control@0 + case list@1
 * - root applySpecialArgs + composite vendor/legacy inputPinIndex / data edge remap
 *
 * Default gate stays false. typed-identity out of scope.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES,
  SPECIAL_ARG_ADAPTER_CONTRACT,
  classifyStaticCoverageStatuses,
  isAssemblySpecialArgNodeType,
  isSharedSpecialArgAdapterNodeType,
  listStaticOrdinaryCoverageRows,
  remapSpecialArgInputIndex,
  summarizeOrdinaryCoverage,
  assertCoverageMatrixInvariants
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { STAGE3_BACKEND_CONTRACT } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'
import {
  buildServerGraphRegistriesIRDocuments,
  defineSignal,
  g
} from '../../dist/src/runtime/core.js'
import { bool, float, int, prefabId, str, vec3 } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { findImplGraphByCompositeName } from './helpers/ordinary-node-contract.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const adapterSource = readFileSync(join(transformDir, 'special_arg_adapter.ts'), 'utf8')
const indexSource = readFileSync(join(transformDir, 'index.ts'), 'utf8')
const compositeSource = readFileSync(join(transformDir, 'composite.ts'), 'utf8')
const factorySource = readFileSync(join(transformDir, 'ordinary_node_factory.ts'), 'utf8')

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P5W10-special-arg-shared-adapter.gia'
const GRAPH_ID = 1073742491
const COMPOSITE_NAME = 'P5W10_SpecialArg_SharedAdapter'

// --- Contract ---
assert.equal(SPECIAL_ARG_ADAPTER_CONTRACT.workPackage, 'P5-W10')
assert.equal(SPECIAL_ARG_ADAPTER_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(SPECIAL_ARG_ADAPTER_CONTRACT.changesProductionEncoding, true)
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.workPackage, 'P5-W10')
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.phase, 'P5-W10')
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.specialArgAdapter, SPECIAL_ARG_ADAPTER_CONTRACT)
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)

assert.deepEqual(
  [...SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES],
  [...ROOT_NAMED_SPECIAL_ARG_ADAPTER_NODE_TYPES]
)
assert.equal(SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES.length, 5)

// --- Remap table freezes historical root layouts ---
assert.equal(isSharedSpecialArgAdapterNodeType('assembly_list'), true)
assert.equal(isAssemblySpecialArgNodeType('assembly_list'), true)
assert.equal(remapSpecialArgInputIndex('assembly_list', 0), 1)
assert.equal(remapSpecialArgInputIndex('assembly_list', 2), 3)
assert.equal(remapSpecialArgInputIndex('assembly_dictionary', 1), 2)
assert.equal(remapSpecialArgInputIndex('send_signal', 0), 0)
assert.equal(remapSpecialArgInputIndex('send_signal', 1), 0)
assert.equal(remapSpecialArgInputIndex('send_signal', 2), 1)
assert.equal(remapSpecialArgInputIndex('monitor_signal', 1), 1)
assert.equal(remapSpecialArgInputIndex('multiple_branches', 0), 0)
assert.equal(remapSpecialArgInputIndex('print_string', 2), 2)
assert.equal(isSharedSpecialArgAdapterNodeType('set_custom_variable'), false)

// --- Source guards: no private special-arg tables left in root/composite ---
assert.match(adapterSource, /applySpecialArgLiteralArgs/)
assert.match(adapterSource, /remapSpecialArgInputIndex/)
assert.match(adapterSource, /applyAssemblySpecialArgs/)
assert.match(adapterSource, /applySignalSpecialArgs/)
assert.match(adapterSource, /applyMultipleBranchesSpecialArgs/)
assert.match(indexSource, /applySpecialArgLiteralArgs/)
assert.match(indexSource, /remapSpecialArgInputIndex/)
assert.match(factorySource, /applySpecialArgLiteralArgs/)
assert.match(compositeSource, /specialArgInputPinIndex|remapSpecialArgInputIndex/)
assert.match(compositeSource, /SPECIAL_ARG_ADAPTER_CONTRACT/)
// Root must not keep private assembly/signal/multiple_branches literal bodies.
assert.doesNotMatch(
  indexSource,
  /nodeType === 'assembly_list' \|\| nodeType === 'assembly_dictionary'[\s\S]{0,80}setVal\(0/,
  'root must not keep private assembly count setVal body'
)
assert.doesNotMatch(
  indexSource,
  /caseValues\.length > 0 && caseValueType/,
  'root must not keep private multiple_branches case packing body'
)
assert.doesNotMatch(
  indexSource,
  /does not accept wired signal name/,
  'root must not keep private signal name validation body (lives in shared adapter)'
)

// --- Matrix: all special-arg rows green ---
const staticRows = listStaticOrdinaryCoverageRows()
assertCoverageMatrixInvariants(staticRows)
const classified = classifyStaticCoverageStatuses(staticRows)
const summary = summarizeOrdinaryCoverage(classified)
for (const nodeType of SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES) {
  const row = classified.find((r) => r.id === `special-arg-${nodeType}`)
  assert.ok(row, `missing special-arg row ${nodeType}`)
  assert.equal(row.family, 'special-arg')
  assert.equal(row.sharedIdentity, true)
  assert.equal(row.status, 'green', `${nodeType}: ${row.reason}`)
  assert.equal(row.compositeLegacyRisk, false)
}

// --- Executable fixture under shared beta (root + composite) ---
// Full scalar + list signal schema. Real GIA evidence for ParameterFlow tags:
// - entity class=0 (Unknown) / type1=1
// - every *_list class=10002 / type1=type2=11 (StringList container tag)
// Enum signal params remain root-unsupported (not in this fixture).
// Root and composite both send the same param family; monitor consumes every param.
const SIGNAL_PARAM_TYPES = [
  'int',
  'float',
  'vec3',
  'bool',
  'prefab_id',
  'str',
  'entity',
  'int_list',
  'str_list',
  'vec3_list',
  'entity_list'
] as const
const SIGNAL_PARAM_COUNT = SIGNAL_PARAM_TYPES.length
const SignalP5W10 = defineSignal(
  '信号_1',
  SIGNAL_PARAM_TYPES.map((type, i) => [`参数_${i + 1}`, type] as const)
)

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

function sendFullSignal(f: any, self: any, label: string, intVal: bigint) {
  // List params must be real assembly_list results (wired), not orphan assemble nodes.
  const intList = f.assemblyList([intVal, intVal + 1n], 'int')
  const strList = f.assemblyList([new str(`${label}-a`), new str(`${label}-b`)], 'str')
  const vecList = f.assemblyList([new vec3([1, 2, 3]), new vec3([4, 5, 6])], 'vec3')
  const entityList = f.assemblyList([self], 'entity')
  f.sendSignal(
    SignalP5W10,
    new int(intVal),
    new float(1.5),
    new vec3([1, 2, 3]),
    new bool(true),
    new prefabId(1001n),
    new str(label),
    self,
    intList,
    strList,
    vecList,
    entityList
  )
}

const specialArgComposite = g.defineComposite(COMPOSITE_NAME, {
  inflows: [{ name: '执行' }],
  outflows: ['完成'],
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    // assembly_list (int tags) consumed as createPrefab unit-tag list.
    const tags = f.assemblyList([1n, 2n], 'int')
    f.createPrefab(
      1n,
      new vec3([0, 0, 0]),
      new vec3([0, 0, 0]),
      inputs.target,
      true,
      0n,
      tags
    )

    // assembly_dictionary consumed via length query (downstream arg).
    const dict = f.assemblyDictionary([
      { k: 1n, v: 11n },
      { k: 2n, v: 22n }
    ])
    f.printString(f.dataTypeConversion(f.queryDictionarySLength(dict), 'str'))

    // multiple_branches: control + case list
    f.multipleBranches(1n, {
      default: () => {
        f.printString(new str('p5w10-default'))
      },
      1: () => {
        f.printString(new str('p5w10-case1'))
      }
    })

    // Full-parameter send_signal (scalar + list family, shared with root)
    sendFullSignal(f, inputs.target, 'impl', 7n)

    const done = f.registerExecNode('print_string', [new str('p5w10-special-arg-ok')])
    f.outflow('完成', done, 0)
    return {}
  }
})

g.server({ name: 'P5W10-SpecialArg-Shared', id: GRAPH_ID })
  .on('whenEntityIsCreated', (_event: any, f: any) => {
    const self = f.getSelfEntity()

    // Root assembly_list consumed as createPrefab tags.
    const rootTags = f.assemblyList([3n, 4n], 'int')
    f.createPrefab(
      2n,
      new vec3([1, 0, 0]),
      new vec3([0, 0, 0]),
      self,
      false,
      0n,
      rootTags
    )

    // Root assembly_dictionary consumed by length query.
    const rootDict = f.assemblyDictionary([
      { k: 9n, v: 99n },
      { k: 8n, v: 88n }
    ])
    f.printString(f.dataTypeConversion(f.queryDictionarySLength(rootDict), 'str'))

    f.multipleBranches(2n, {
      default: () => {
        f.printString(new str('root-default'))
      },
      2: () => {
        f.printString(new str('root-case2'))
      }
    })

    sendFullSignal(f, self, 'root', 42n)
    f.callComposite(specialArgComposite, { target: self })
    f.printString(new str('p5w10-root-ok'))
  })
  .onSignal(SignalP5W10, (evt: any, f: any) => {
    // Consume every signal param so monitor OutParams stay live in GIA.
    f.printString(f.dataTypeConversion(evt.params.参数_1, 'str'))
    f.printString(f.dataTypeConversion(evt.params.参数_2, 'str'))
    // 参数_3 vec3 + 参数_7 entity → createPrefab typed consumers
    f.createPrefab(
      9n,
      evt.params.参数_3,
      evt.params.参数_3,
      evt.params.参数_7,
      false,
      0n,
      f.assemblyList([1n], 'int')
    )
    f.printString(f.dataTypeConversion(evt.params.参数_4, 'str'))
    f.createPrefab(
      evt.params.参数_5,
      new vec3([0, 0, 0]),
      new vec3([0, 0, 0]),
      evt.params.参数_7,
      true,
      0n,
      f.assemblyList([2n], 'int')
    )
    f.printString(evt.params.参数_6)
    // List params: iterate on root (not vendor composite)
    f.listIterationLoop(evt.params.参数_8, (item: any) => {
      f.printString(f.dataTypeConversion(item, 'str'))
    })
    f.listIterationLoop(evt.params.参数_9, (item: any) => {
      f.printString(item)
    })
    f.listIterationLoop(evt.params.参数_10, (item: any) => {
      f.createPrefab(
        10n,
        item,
        item,
        evt.params.参数_7,
        false,
        0n,
        f.assemblyList([3n], 'int')
      )
    })
    f.listIterationLoop(evt.params.参数_11, (item: any) => {
      f.createPrefab(
        11n,
        new vec3([0, 0, 0]),
        new vec3([0, 0, 0]),
        item,
        false,
        0n,
        f.assemblyList([4n], 'int')
      )
    })
  })

const previous = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = '1'
let bytes: Uint8Array
try {
  const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P5W10-SpecialArg-Shared' })
  bytes = irToGia(docs.at(-1), {
    graphId: GRAPH_ID,
    name: 'P5W10-SpecialArg-Shared',
    protoPath: PROTO_PATH,
    stage3: { vendorImplGraphBeta: true }
  })
} finally {
  if (previous === undefined) delete process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
  else process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = previous
}

await writeFile(OUTPUT_PATH, Buffer.from(bytes))
const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)
const rootGraph = decoded.graph?.graph?.inner?.graph
const implGraph = findImplGraphByCompositeName(decoded, COMPOSITE_NAME)
assert.ok(rootGraph, 'root graph missing')
assert.ok(implGraph, 'impl graph missing')
assert.ok((rootGraph.nodes ?? []).length > 0, 'root has nodes')
assert.ok((implGraph.nodes ?? []).length > 0, 'impl has nodes')

function inParamIndexes(node: any): number[] {
  return (node.pins ?? [])
    .filter((p: any) => p.i1?.kind === 3)
    .map((p: any) => p.i1.index)
    .sort((a: number, b: number) => a - b)
}

function findByGeneric(graph: any, genericId: number): any[] {
  return (graph.nodes ?? []).filter((n: any) => n.genericId?.nodeId === genericId)
}

// assembly_list generic is typically 169; assembly_dictionary uses typed concrete (e.g. 1788).
function isAssemblyLike(node: any, expectedCount: number): boolean {
  const countPin = (node.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
  return countPin?.value?.bInt?.val === expectedCount
}
const rootAssemblies = findByGeneric(rootGraph, 169)
const implAssemblies = findByGeneric(implGraph, 169)
assert.ok(rootAssemblies.length >= 1, 'root assembly_list missing')
assert.ok(implAssemblies.length >= 1, 'impl assembly_list missing')
for (const assembly of [...rootAssemblies, ...implAssemblies]) {
  const countPin = (assembly.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
  assert.ok(countPin, 'assembly missing count pin0')
  const countVal = countPin?.value?.bInt?.val
  assert.ok(typeof countVal === 'number' && countVal >= 1, `assembly count pin0 invalid: ${countVal}`)
  // Element pin1 is present for non-captured assemblies. Composite entity_list may
  // capture-route the only entity element off physical pin1 onto compositePins.
  const elemPin = (assembly.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
  const isImplAssembly = implAssemblies.includes(assembly)
  if (!isImplAssembly) {
    assert.ok(elemPin, 'root assembly missing element pin1')
  } else if (!elemPin) {
    // Capture-only assembly still keeps count@0; boundary route is checked later.
    assert.equal(countVal, 1, 'capture-only assembly should still declare count=1')
  }
}
// root/impl: 2 pairs each → count 4 (k/v slots)
const rootDicts = (rootGraph.nodes ?? []).filter(
  (n: any) => n.genericId?.nodeId !== 169 && isAssemblyLike(n, 4)
)
const implDicts = (implGraph.nodes ?? []).filter(
  (n: any) => n.genericId?.nodeId !== 169 && isAssemblyLike(n, 4)
)
assert.ok(rootDicts.length >= 1, 'root assembly_dictionary missing')
assert.ok(implDicts.length >= 1, 'impl assembly_dictionary missing')
for (const dict of [...rootDicts, ...implDicts]) {
  const countPin = (dict.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
  assert.ok(countPin, 'dict missing count pin0')
  const countVal = countPin?.value?.bInt?.val
  assert.ok(typeof countVal === 'number' && countVal >= 1, `dict count pin0 invalid: ${countVal}`)
  const firstKv = (dict.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
  assert.ok(firstKv, 'dict missing first kv pin1')
}

// assembly results must be wired into consumers (not orphan assemble).
// Vendor Graph records data edges on the consumer InParam.connects side.
function hasConsumerOf(graph: any, sourceNodeIndex: number): boolean {
  return (graph.nodes ?? []).some((n: any) =>
    (n.pins ?? []).some(
      (p: any) =>
        p.i1?.kind === 3 &&
        (p.connects ?? []).some((c: any) => c.id === sourceNodeIndex)
    )
  )
}
for (const assembly of rootAssemblies) {
  assert.ok(
    hasConsumerOf(rootGraph, assembly.nodeIndex),
    `root assembly_list ${assembly.nodeIndex} must be consumed as a parameter`
  )
}
for (const assembly of implAssemblies) {
  assert.ok(
    hasConsumerOf(implGraph, assembly.nodeIndex),
    `impl assembly_list ${assembly.nodeIndex} must be consumed as a parameter`
  )
}
for (const dict of rootDicts) {
  assert.ok(
    hasConsumerOf(rootGraph, dict.nodeIndex),
    `root assembly_dictionary ${dict.nodeIndex} must be consumed as a parameter`
  )
}
for (const dict of implDicts) {
  assert.ok(
    hasConsumerOf(implGraph, dict.nodeIndex),
    `impl assembly_dictionary ${dict.nodeIndex} must be consumed as a parameter`
  )
}

// multiple_branches generic is typically 3
const rootBranches = findByGeneric(rootGraph, 3)
const implBranches = findByGeneric(implGraph, 3)
assert.ok(rootBranches.length >= 1, 'root multiple_branches missing')
assert.ok(implBranches.length >= 1, 'impl multiple_branches missing')
for (const branch of [...rootBranches, ...implBranches]) {
  const control = (branch.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
  assert.ok(control, 'multiple_branches missing control pin0')
  const caseList = (branch.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
  assert.ok(caseList, 'multiple_branches missing case list pin1')
}

// send_signal: placeholder 300000 is rewritten to builtin SysGraph 1610612738 (P5-W10).
const BUILTIN_SEND = 1610612738
const BUILTIN_MONITOR = 1610612739
function isSendSignalNode(n: any): boolean {
  const id = n.genericId?.nodeId ?? n.concreteId?.nodeId
  return id === BUILTIN_SEND || id === 300000
}
function isMonitorSignalNode(n: any): boolean {
  const id = n.genericId?.nodeId ?? n.concreteId?.nodeId
  return id === BUILTIN_MONITOR || id === 300001
}
const rootSignals = (rootGraph.nodes ?? []).filter(isSendSignalNode)
const implSignals = (implGraph.nodes ?? []).filter(isSendSignalNode)
assert.ok(rootSignals.length >= 1, 'root send_signal missing')
assert.ok(implSignals.length >= 1, 'impl send_signal missing')
for (const signal of [...rootSignals, ...implSignals]) {
  // Builtin SysGraph identity (editor-visible signal node)
  assert.equal(signal.genericId?.nodeId, BUILTIN_SEND, 'send must use builtin SysGraph id')
  assert.equal(signal.genericId?.kind, 22001, 'send must be SysGraph kind')
  assert.equal(signal.signalVersion, 2, 'send signalVersion=2')
  // ClientExec name pin kind=5 — must be 信号_1 with cpi=7
  const namePin = (signal.pins ?? []).find((p: any) => p.i1?.kind === 5 && p.i1?.index === 0)
  assert.ok(namePin, 'send_signal missing ClientExec name pin')
  const nameVal =
    typeof namePin?.value === 'string' ? namePin.value : namePin?.value?.bString?.val
  assert.equal(nameVal, '信号_1', `send_signal name expected 信号_1, got ${nameVal}`)
  assert.equal(namePin.compositePinIndex, 7, 'send ClientExec cpi must be 7')
  // Data params: physical InParam 0.. with cpi 12..
  // Root keeps all params. Composite capture-routes composite-input entity (参数_7)
  // off the physical send pin; remaining scalar/list params stay physical.
  const dataPins = (signal.pins ?? [])
    .filter((p: any) => p.i1?.kind === 3)
    .sort((a: any, b: any) => a.i1.index - b.i1.index)
  const isImpl = implSignals.includes(signal)
  const entityParamIndex = SIGNAL_PARAM_TYPES.indexOf('entity')
  const expectedCount = isImpl ? SIGNAL_PARAM_COUNT - 1 : SIGNAL_PARAM_COUNT
  assert.equal(
    dataPins.length,
    expectedCount,
    `send_signal ${signal.nodeIndex} should expose ${expectedCount} data params (got ${dataPins.length})`
  )
  if (!isImpl) {
    for (let i = 0; i < dataPins.length; i++) {
      assert.equal(dataPins[i].i1.index, i, `send data pin physical index ${i}`)
      assert.equal(
        dataPins[i].compositePinIndex,
        12 + i,
        `send param ${i} cpi should be ${12 + i}`
      )
    }
    // Root entity param must be wired (conn), not a dead literal.
    const entityPin = dataPins[entityParamIndex]
    assert.ok(entityPin, 'root send missing entity data pin')
    assert.equal(entityPin.type, 1, 'root entity pin VarType.Entity')
    assert.ok(
      (entityPin.connects ?? []).length > 0,
      'root entity pin must connect from getSelfEntity / upstream'
    )
    // List pins must keep element-aware physical types and be wired from assembly_list.
    for (const listType of ['int_list', 'str_list', 'vec3_list', 'entity_list'] as const) {
      const idx = SIGNAL_PARAM_TYPES.indexOf(listType)
      const pin = dataPins[idx]
      assert.ok(pin, `root send missing ${listType} pin`)
      assert.ok((pin.connects ?? []).length > 0, `root ${listType} must be wired`)
      // Physical list pin uses concrete list VarType (not ParameterFlow container 11).
      const expectedPhysicalType =
        listType === 'int_list'
          ? 8
          : listType === 'str_list'
            ? 11
            : listType === 'vec3_list'
              ? 15
              : 13
      assert.equal(
        pin.type,
        expectedPhysicalType,
        `root ${listType} physical type expected ${expectedPhysicalType}, got ${pin.type}`
      )
    }
  } else {
    // Impl: capture removes composite-input entity physical pin (参数_7 → pin 6).
    // Remaining pins keep their absolute physical indexes + SignalDef cpi.
    const physicalIndexes = dataPins.map((p: any) => p.i1.index).sort((a: number, b: number) => a - b)
    assert.ok(
      !physicalIndexes.includes(entityParamIndex),
      `impl send must capture-route entity pin ${entityParamIndex}, not keep physical pin`
    )
    for (const pin of dataPins) {
      assert.equal(
        typeof pin.compositePinIndex,
        'number',
        'impl send data pin must keep SignalDef cpi'
      )
      assert.equal(
        pin.compositePinIndex,
        12 + pin.i1.index,
        `impl send pin ${pin.i1.index} cpi should be ${12 + pin.i1.index}`
      )
    }
    // Non-captured list params still physical + wired.
    for (const listType of ['int_list', 'str_list', 'vec3_list', 'entity_list'] as const) {
      const idx = SIGNAL_PARAM_TYPES.indexOf(listType)
      const pin = dataPins.find((p: any) => p.i1.index === idx)
      assert.ok(pin, `impl send missing physical ${listType} pin ${idx}`)
      assert.ok((pin.connects ?? []).length > 0, `impl ${listType} must be wired`)
    }
  }
}

// monitor_signal on root (onSignal handler) → builtin 1610612739 + OutParams 3..10
const rootMonitors = (rootGraph.nodes ?? []).filter(isMonitorSignalNode)
assert.ok(rootMonitors.length >= 1, 'root monitor_signal missing')
for (const mon of rootMonitors) {
  assert.equal(mon.genericId?.nodeId, BUILTIN_MONITOR)
  assert.equal(mon.genericId?.kind, 22001)
  assert.equal(mon.signalVersion, 2)
  const namePin = (mon.pins ?? []).find((p: any) => p.i1?.kind === 5)
  assert.ok(namePin, 'monitor missing ClientExec')
  const nameVal =
    typeof namePin?.value === 'string' ? namePin.value : namePin?.value?.bString?.val
  assert.equal(nameVal, '信号_1')
  const paramOuts = (mon.pins ?? [])
    .filter((p: any) => p.i1?.kind === 4 && (p.i1?.index ?? 0) >= 3)
    .sort((a: any, b: any) => a.i1.index - b.i1.index)
  assert.equal(
    paramOuts.length,
    SIGNAL_PARAM_COUNT,
    `monitor should expose ${SIGNAL_PARAM_COUNT} param OutParams (index>=3), got ${paramOuts.length}`
  )
  for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
    assert.equal(paramOuts[i].i1.index, 3 + i, `monitor param out physical index`)
    assert.equal(
      paramOuts[i].compositePinIndex,
      15 + 3 + i,
      `monitor param ${i} cpi (firstFixedOutput=15 + index)`
    )
  }
}

// SignalDef accessories (which=14) + 监听信号 CompositeDef (which=12)
const accessories = decoded.accessories ?? []
const signalDefs = accessories.filter((a: any) => a.which === 14)
const sendDef = signalDefs.find((a: any) => a.name === '发送信号' && a.id?.id === BUILTIN_SEND)
assert.ok(sendDef, 'missing SignalDef which=14 发送信号')
const sendInputs = sendDef.compositeDef?.inner?.def?.inputs ?? []
assert.equal(
  sendInputs.length,
  SIGNAL_PARAM_COUNT,
  `发送信号 SignalDef should declare ${SIGNAL_PARAM_COUNT} inputs, got ${sendInputs.length}`
)
// Real GIA ParameterFlow tags (signal-only; not ordinary CompositeDef):
// entity → class=0 type1=1; every *_list → class=10002 type1=type2=11.
function assertSignalParamType(label: string, typeName: string, encoded: any) {
  assert.ok(encoded, `${label} missing type for ${typeName}`)
  if (typeName === 'entity') {
    assert.equal(encoded.class, 0, `${label} entity class must be Unknown(0)`)
    assert.equal(encoded.type1, 1, `${label} entity type1 must be Entity(1)`)
    assert.equal(encoded.type2, 1, `${label} entity type2 must be Entity(1)`)
    return
  }
  if (typeName.endsWith('_list')) {
    assert.equal(encoded.class, 10002, `${label} ${typeName} class must be ArrayBase`)
    assert.equal(encoded.type1, 11, `${label} ${typeName} type1 must be StringList(11)`)
    assert.equal(encoded.type2, 11, `${label} ${typeName} type2 must be StringList(11)`)
    return
  }
  // Non-entity scalars keep ordinary CompositeDef classes.
  assert.notEqual(encoded.class, undefined, `${label} ${typeName} class present`)
}
for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
  assertSignalParamType(
    '发送信号',
    SIGNAL_PARAM_TYPES[i],
    sendInputs[i]?.type
  )
}
const monitorDef = accessories.find(
  (a: any) => a.which === 12 && a.name === '监听信号' && a.id?.id === BUILTIN_MONITOR
)
assert.ok(monitorDef, 'missing 监听信号 CompositeDef')
const monOutputs = monitorDef.compositeDef?.inner?.def?.outputs ?? []
assert.equal(
  monOutputs.length,
  3 + SIGNAL_PARAM_COUNT,
  `监听信号 should have fixed 3 outs + ${SIGNAL_PARAM_COUNT} params, got ${monOutputs.length}`
)
// Fixed outs 0/2 are entity with class=0; params 3.. match SIGNAL_PARAM_TYPES.
assertSignalParamType('监听信号 fixed', 'entity', monOutputs[0]?.type)
assertSignalParamType('监听信号 fixed', 'entity', monOutputs[2]?.type)
for (let i = 0; i < SIGNAL_PARAM_COUNT; i++) {
  assertSignalParamType(
    '监听信号 param',
    SIGNAL_PARAM_TYPES[i],
    monOutputs[3 + i]?.type
  )
}

// Composite boundary: capture-routed entity send arg must appear in compositePins
// (outer InParam → send physical entity pin index), not only as a missing physical pin.
const implAccessory = accessories.find(
  (a: any) =>
    a.which === 9 &&
    (a.graph?.inner?.graph?.nodes ?? []).some(
      (n: any) => (n.genericId?.nodeId ?? n.concreteId?.nodeId) === BUILTIN_SEND
    )
)
assert.ok(implAccessory, 'impl graph accessory with send_signal missing')
const compositePins = implAccessory.graph?.inner?.graph?.compositePins ?? []
const entitySendPinIndex = SIGNAL_PARAM_TYPES.indexOf('entity') // IR arg 1+index → physical pin
const captureEntityRoute = compositePins.find(
  (cp: any) =>
    cp.outerPin?.kind === 3 &&
    cp.innerPin?.kind === 3 &&
    cp.innerPin?.index === entitySendPinIndex
)
assert.ok(
  captureEntityRoute,
  `compositePins must route composite entity input to send physical pin ${entitySendPinIndex}`
)

// Root print remains on exec chain after composite call.
const rootPrint = (rootGraph.nodes ?? []).find(
  (n: any) =>
    n.genericId?.nodeId === 1 &&
    n.pins?.some((p: any) => p.value?.bString?.val === 'p5w10-root-ok')
)
assert.ok(rootPrint, 'root print p5w10-root-ok missing')
const hasPredToRootPrint = (rootGraph.nodes ?? []).some((n: any) =>
  (n.pins ?? []).some(
    (p: any) =>
      p.i1?.kind === 2 &&
      (p.connects ?? []).some((c: any) => c.id === rootPrint.nodeIndex)
  )
)
assert.ok(hasPredToRootPrint, 'root print must have inbound exec flow')

// Sanity: special-arg nodes present with expected physical pin shapes
assert.ok(inParamIndexes(rootAssemblies[0]).includes(0))
assert.ok(inParamIndexes(implAssemblies[0]).includes(1))

console.log(
  [
    'P5-W10 special-arg shared adapter OK',
    `family=${SHARED_SPECIAL_ARG_ADAPTER_NODE_TYPES.length}`,
    `static green=${summary.green} unknown=${summary.unknown}`,
    `output=${OUTPUT_PATH}`,
    `bytes=${bytes.length}`,
    'defaultVendorImplGraphGate=false'
  ].join('\n')
)
