// @ts-nocheck
/**
 * P5-W9: pin-hole named adapter full family shared.
 *
 * All 9 ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES use pin_hole_adapter.ts for:
 * - IR argIndex → physical pinIndex remap
 * - null-hole literal apply (root applySpecialArgs)
 * - composite vendor/legacy inputPinIndex / data edge remap
 *
 * Default gate stays false. special-arg / typed-identity out of scope.
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-stage3-p5w9-pin-hole-shared-adapter.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COMPOSITE_ORCHESTRATION_CONTRACT,
  PIN_HOLE_ADAPTER_CONTRACT,
  PIN_HOLE_SPECS,
  ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT,
  ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES,
  SHARED_PIN_HOLE_ADAPTER_NODE_TYPES,
  classifyStaticCoverageStatuses,
  isSharedPinHoleAdapterNodeType,
  listStaticOrdinaryCoverageRows,
  remapPinHoleInputIndex,
  summarizeOrdinaryCoverage,
  assertCoverageMatrixInvariants
} from '../../dist/src/compiler/ir_to_gia_transform/composite.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { STAGE3_BACKEND_CONTRACT } from '../../dist/src/compiler/ir_to_gia_transform/stage3_backend.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { RemovalMethod } from '../../dist/src/definitions/enum.js'
import { bool, float, str, vec3 } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { findImplGraphByCompositeName } from './helpers/ordinary-node-contract.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const transformDir = join(root, 'src/compiler/ir_to_gia_transform')
const adapterSource = readFileSync(join(transformDir, 'pin_hole_adapter.ts'), 'utf8')
const indexSource = readFileSync(join(transformDir, 'index.ts'), 'utf8')
const compositeSource = readFileSync(join(transformDir, 'composite.ts'), 'utf8')

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/P5W9-pin-hole-shared-adapter.gia'
const GRAPH_ID = 1073742490
const COMPOSITE_NAME = 'P5W9_PinHole_SharedAdapter'

// --- Contract ---
assert.equal(PIN_HOLE_ADAPTER_CONTRACT.workPackage, 'P5-W9')
assert.equal(PIN_HOLE_ADAPTER_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(PIN_HOLE_ADAPTER_CONTRACT.changesProductionEncoding, true)
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.workPackage, 'P5-W9')
assert.equal(ROOT_IMPL_ORDINARY_COVERAGE_CONTRACT.phase, 'P5-W9')
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.pinHoleAdapter, PIN_HOLE_ADAPTER_CONTRACT)
assert.equal(STAGE3_BACKEND_CONTRACT.defaultVendorImplGraphGate, false)
assert.equal(COMPOSITE_ORCHESTRATION_CONTRACT.defaultVendorImplGraphGate, false)

assert.deepEqual(
  [...SHARED_PIN_HOLE_ADAPTER_NODE_TYPES],
  [...ROOT_NAMED_PIN_HOLE_ADAPTER_NODE_TYPES]
)
assert.equal(SHARED_PIN_HOLE_ADAPTER_NODE_TYPES.length, 9)

// --- Remap table freezes historical root holes ---
const expectedHoles: Record<string, number> = {
  create_prefab: 4,
  create_prefab_group: 4,
  activate_disable_follow_motion_device: 1,
  activate_disable_collision_trigger_source: 1,
  activate_disable_character_disruptor_device: 1,
  activate_disable_pathfinding_obstacle_feature: 1,
  activate_disable_pathfinding_obstacle: 0,
  remove_unit_status: 3,
  set_custom_variable: 3
}
for (const [nodeType, hole] of Object.entries(expectedHoles)) {
  assert.equal(isSharedPinHoleAdapterNodeType(nodeType), true, nodeType)
  assert.equal(PIN_HOLE_SPECS[nodeType]?.holeIndex, hole, nodeType)
  // IR index at/after hole shifts +1; indices before hole stay.
  if (hole > 0) {
    assert.equal(remapPinHoleInputIndex(nodeType, hole - 1), hole - 1)
  }
  assert.equal(remapPinHoleInputIndex(nodeType, hole), hole + 1)
  assert.equal(remapPinHoleInputIndex(nodeType, hole + 1), hole + 2)
}
assert.equal(remapPinHoleInputIndex('print_string', 2), 2)
assert.equal(isSharedPinHoleAdapterNodeType('send_signal'), false)

// --- Source guards: no private per-node hole tables left in root/composite ---
assert.match(adapterSource, /PIN_HOLE_SPECS/)
assert.match(indexSource, /applyPinHoleLiteralArgs/)
assert.match(indexSource, /remapPinHoleInputIndex/)
assert.match(compositeSource, /pinHoleInputPinIndex/)
assert.match(compositeSource, /remapPinHoleInputIndex/)
assert.doesNotMatch(
  indexSource,
  /applyArgsWithNullHole/,
  'root must not keep private applyArgsWithNullHole helper'
)
assert.doesNotMatch(
  compositeSource,
  /set_custom_variable' && argIndex === 3 \? 4/,
  'composite must not hard-code set_custom_variable hole'
)

// --- Matrix: all pin-hole rows green ---
const staticRows = listStaticOrdinaryCoverageRows()
assertCoverageMatrixInvariants(staticRows)
const classified = classifyStaticCoverageStatuses(staticRows)
const summary = summarizeOrdinaryCoverage(classified)
for (const nodeType of SHARED_PIN_HOLE_ADAPTER_NODE_TYPES) {
  const row = classified.find((r) => r.id === `pin-hole-${nodeType}`)
  assert.ok(row, `missing pin-hole row ${nodeType}`)
  assert.equal(row.family, 'pin-hole')
  assert.equal(row.sharedIdentity, true)
  assert.equal(row.status, 'green', `${nodeType}: ${row.reason}`)
  assert.equal(row.compositeLegacyRisk, false)
}

// --- Executable fixture under shared beta (root + composite) ---
setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const pinHoleComposite = g.defineComposite(COMPOSITE_NAME, {
  inflows: [{ name: '执行' }],
  outflows: ['完成'],
  inputs: { target: { type: 'entity' } },
  outputs: {},
  build(inputs: any, f: any) {
    const self = inputs.target
    f.setCustomVariable(self, 'p5w9_cv', new float(1.5), false)
    f.activateDisableFollowMotionDevice(self, true)
    f.activateDisableCollisionTriggerSource(self, false)
    // No typed helper: must use registerExecNode (auto-chain), not detached f.node().
    f.registerExecNode('activate_disable_character_disruptor_device', [
      self,
      new bool(true)
    ])
    f.activateDisablePathfindingObstacleFeature(self, true)
    f.activateDisablePathfindingObstacle(self, 7n, false)
    f.removeUnitStatus(
      self,
      1001n,
      RemovalMethod.AllCoexistingStatusesWithTheSameName,
      self
    )
    // Prefab unit-tag list: literal element must land on assembly pin1 (count on pin0).
    const tags = f.assemblyList([1n], 'int')
    f.createPrefab(
      1n,
      new vec3([0, 0, 0]),
      new vec3([0, 0, 0]),
      self,
      true,
      0n,
      tags
    )
    f.createPrefabGroup(
      2n,
      new vec3([0, 0, 0]),
      new vec3([0, 0, 0]),
      self,
      1n,
      tags,
      false
    )
    // printString returns void; mark last exec tail as composite OutFlow so root call→print wires cleanly.
    const done = f.registerExecNode('print_string', [new str('p5w9-pin-hole-ok')])
    f.outflow('完成', done, 0)
    return {}
  }
})

g.server({ name: 'P5W9-PinHole-Shared', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_event: any, f: any) => {
    const self = f.getSelfEntity()
    f.setCustomVariable(self, 'p5w9_cv_root', new float(2.5), true)
    f.activateDisableFollowMotionDevice(self, false)
    f.activateDisablePathfindingObstacleFeature(self, false)
    f.activateDisablePathfindingObstacle(self, 9n, true)
    f.removeUnitStatus(
      self,
      2002n,
      RemovalMethod.StatusWithFastestStackLoss,
      self
    )
    f.createPrefab(
      3n,
      new vec3([1, 0, 0]),
      new vec3([0, 0, 0]),
      self,
      false,
      0n,
      f.assemblyList([1n], 'int')
    )
    f.callComposite(pinHoleComposite, { target: self })
    f.printString(new str('p5w9-root-ok'))
  }
)

const previous = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = '1'
let bytes: Uint8Array
try {
  const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'P5W9-PinHole-Shared' })
  bytes = irToGia(docs.at(-1), {
    graphId: GRAPH_ID,
    name: 'P5W9-PinHole-Shared',
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

// set_custom_variable: triggerEvent must land on physical pin 4 (hole at 3)
function findSetterByName(graph: any, name: string): any {
  return (graph.nodes ?? []).find((node: any) => {
    const pins = node.pins ?? []
    const namePin = pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
    return namePin?.value?.bString?.val === name
  })
}

function inParamIndexes(node: any): number[] {
  return (node.pins ?? [])
    .filter((p: any) => p.i1?.kind === 3)
    .map((p: any) => p.i1.index)
    .sort((a: number, b: number) => a - b)
}

const rootSetter = findSetterByName(rootGraph, 'p5w9_cv_root')
const implSetter = findSetterByName(implGraph, 'p5w9_cv')
assert.ok(rootSetter, 'root set_custom_variable missing')
assert.ok(implSetter, 'impl set_custom_variable missing')

// Physical pin 3 should not hold triggerEvent bool; pin 4 should exist for triggerEvent.
const rootSetterPins = inParamIndexes(rootSetter)
const implSetterPins = inParamIndexes(implSetter)
assert.ok(rootSetterPins.includes(4), `root setter pins ${rootSetterPins}`)
assert.ok(implSetterPins.includes(4), `impl setter pins ${implSetterPins}`)

// Disruptor must be on the exec chain (registerExecNode), not detached.
const disruptor = (implGraph.nodes ?? []).find((n: any) => n.genericId?.nodeId === 366)
assert.ok(disruptor, 'impl activate_disable_character_disruptor_device missing')
const disruptorOut = (disruptor.pins ?? []).some((p: any) => p.i1?.kind === 2)
assert.ok(disruptorOut, 'disruptor must have OutFlow (joined exec chain)')
const hasPredToDisruptor = (implGraph.nodes ?? []).some((n: any) =>
  (n.pins ?? []).some(
    (p: any) =>
      p.i1?.kind === 2 &&
      (p.connects ?? []).some((c: any) => c.id === disruptor.nodeIndex)
  )
)
assert.ok(hasPredToDisruptor, 'disruptor must have inbound exec flow')

// Pathfinding obstacle (g=790): hole at physical pin0 → captured entity must route to pin1
// via compositePins (not missing target entity).
const pathObstacle = (implGraph.nodes ?? []).find((n: any) => n.genericId?.nodeId === 790)
assert.ok(pathObstacle, 'impl activate_disable_pathfinding_obstacle missing')
const pathObstaclePins = inParamIndexes(pathObstacle)
assert.equal(
  pathObstaclePins.includes(0),
  false,
  `path obstacle must not keep physical hole pin0 after capture filter: ${pathObstaclePins}`
)
assert.ok(
  !pathObstaclePins.includes(1),
  `path obstacle entity pin1 is capture-routed (absent physically): ${pathObstaclePins}`
)
const implUnit = decoded.accessories?.[1]?.graph?.inner?.graph
const compositePins = implUnit?.compositePins ?? []
const pathObstacleEntityRoutes = compositePins.filter(
  (cp: any) =>
    cp.innerNodeId === pathObstacle.nodeIndex &&
    cp.innerPin?.kind === 3 &&
    cp.innerPin?.index === 1
)
assert.ok(
  pathObstacleEntityRoutes.length >= 1,
  'compositePins must map outer entity input to path obstacle physical pin1'
)
// Feature (g=789) hole at pin1: captured entity stays IR/physical pin0
const pathFeature = (implGraph.nodes ?? []).find((n: any) => n.genericId?.nodeId === 789)
assert.ok(pathFeature, 'impl pathfinding feature missing')
const featureEntityRoutes = compositePins.filter(
  (cp: any) =>
    cp.innerNodeId === pathFeature.nodeIndex &&
    cp.innerPin?.kind === 3 &&
    cp.innerPin?.index === 0
)
assert.ok(
  featureEntityRoutes.length >= 1,
  'compositePins must map outer entity to path feature physical pin0'
)

// assembly_list under vendor composite: pin0=count, pin1=element value (not empty default)
const assemblies = (implGraph.nodes ?? []).filter((n: any) => n.genericId?.nodeId === 169)
assert.ok(assemblies.length >= 1, 'impl assembly_list missing')
for (const assembly of assemblies) {
  const countPin = (assembly.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
  const elemPin = (assembly.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
  assert.equal(countPin?.value?.bInt?.val, 1, 'assembly count pin0 must be 1')
  const elemVal =
    elemPin?.value?.bConcreteValue?.value?.bInt?.val ?? elemPin?.value?.bInt?.val
  assert.equal(elemVal, 1, 'assembly element pin1 must hold literal 1')
  assert.equal(
    elemPin?.value?.bConcreteValue?.value?.alreadySetVal ?? true,
    true,
    'assembly element must be alreadySetVal'
  )
}

// Root print must remain on exec chain after composite call.
const rootPrint = (rootGraph.nodes ?? []).find(
  (n: any) => n.genericId?.nodeId === 1 && n.pins?.some((p: any) => p.value?.bString?.val === 'p5w9-root-ok')
)
assert.ok(rootPrint, 'root print p5w9-root-ok missing')
const hasPredToRootPrint = (rootGraph.nodes ?? []).some((n: any) =>
  (n.pins ?? []).some(
    (p: any) =>
      p.i1?.kind === 2 &&
      (p.connects ?? []).some((c: any) => c.id === rootPrint.nodeIndex)
  )
)
assert.ok(hasPredToRootPrint, 'root print must have inbound exec flow')

// activate_disable_pathfinding_obstacle: hole at 0 → IR args shift +1
function nodesWithInParamCountAtLeast(graph: any, min: number): any[] {
  return (graph.nodes ?? []).filter((node: any) => {
    const idxs = inParamIndexes(node)
    return idxs.length >= min
  })
}
assert.ok(nodesWithInParamCountAtLeast(rootGraph, 2).length > 0)
assert.ok(nodesWithInParamCountAtLeast(implGraph, 2).length > 0)

console.log(
  [
    'P5-W9 pin-hole shared adapter OK',
    `family=${SHARED_PIN_HOLE_ADAPTER_NODE_TYPES.length}`,
    `static green=${summary.green} unknown=${summary.unknown}`,
    `output=${OUTPUT_PATH}`,
    `bytes=${bytes.length}`,
    'defaultVendorImplGraphGate=false'
  ].join('\n')
)
