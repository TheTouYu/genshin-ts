// @ts-nocheck
/**
 * Production default (legacy handwritten) regressions for composite impl GIA:
 * 1. prefab_id (IdBase) literals keep bId + alreadySetVal=true
 * 2. multiple_branches keeps control@0 + case list@1 when control is a capture input
 * 3. empty default branch still emits OutFlow 0
 *
 * Evidence sources:
 * - docs/BUG_GSTS_COMPOSITE_PREFAB_LITERAL_ZH.md (play project)
 * - docs/BUG_GSTS_COMPOSITE_MULTIPLE_BRANCHES_ZH.md (play project)
 *
 * Run:
 *   npm run build
 *   npx tsx tests/composite/test-impl-prefab-literal-and-multiple-branches.ts [output.gia]
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import {
  buildServerGraphRegistriesIRDocuments,
  g
} from '../../dist/src/runtime/core.js'
import { float, int, prefabId, str, vec3 } from '../../dist/src/runtime/value.js'
import { setRuntimeOptions } from '../../dist/src/runtime/runtime_config.js'
import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { findImplGraphByCompositeName } from './helpers/ordinary-node-contract.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUTPUT_PATH = process.argv[2] ?? '/tmp/impl-prefab-mbranch-regression.gia'
const GRAPH_ID = 1073743011
const MOVE_NAME = 'Impl_PrefabLiteral_Move'
const DISPATCH_NAME = 'Impl_MultipleBranches_Dispatch'
const PREFAB_LITERAL = 1077936129n
const CASE_W = 1073741847
const CASE_A = 1073741846

setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })

const moveMotionActors = g.defineComposite(MOVE_NAME, {
  inputs: {
    deviceKey: { type: 'str' },
    duration: { type: 'float' },
    velocity: { type: 'vec3' }
  },
  outputs: {},
  build(args: any, f: any) {
    // Bug 1 fixture: prefab_id literal inside composite impl
    const actors = f.getEntitiesWithSpecifiedPrefabOnTheField(new prefabId(PREFAB_LITERAL))
    f.listIterationLoop(actors, (actor: any) => {
      f.addUniformBasicLinearMotionDevice(actor, args.deviceKey, args.duration, args.velocity)
    })
    return {}
  }
})

const dispatchMoveByUiControl = g.defineComposite(DISPATCH_NAME, {
  inputs: {
    uiControlIndex: { type: 'int' },
    motionPrefab: { type: 'prefab_id' }
  },
  outputs: {},
  build(args: any, f: any) {
    // Bug 2 fixture: capture control + case list + empty default
    f.multipleBranches(args.uiControlIndex, {
      default: () => {},
      [CASE_W]: () => {
        f.callComposite(moveMotionActors, {
          deviceKey: new str('w'),
          duration: new float(0.1),
          velocity: new vec3([0, 0, 1])
        })
      },
      [CASE_A]: () => {
        f.callComposite(moveMotionActors, {
          deviceKey: new str('a'),
          duration: new float(0.1),
          velocity: new vec3([-1, 0, 0])
        })
      }
    })
    return {}
  }
})

g.server({ name: 'ImplPrefabMBranchRegression', id: GRAPH_ID }).on(
  'whenEntityIsCreated',
  (_evt: any, f: any) => {
    f.callComposite(dispatchMoveByUiControl, {
      uiControlIndex: new int(1n),
      motionPrefab: new prefabId(PREFAB_LITERAL)
    })
  }
)

// Force production default (legacy). Do not enable vendor beta for this regression.
const previous = process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
delete process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH

let bytes: Uint8Array
try {
  const docs = buildServerGraphRegistriesIRDocuments({
    defaultName: 'ImplPrefabMBranchRegression'
  })
  const doc = docs.find((d: any) => d.id === GRAPH_ID) ?? docs.at(-1)
  bytes = irToGia(doc, {
    graphId: GRAPH_ID,
    name: 'ImplPrefabMBranchRegression',
    protoPath: PROTO_PATH
  })
} finally {
  if (previous === undefined) delete process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH
  else process.env.GSTS_STAGE3_VENDOR_IMPL_GRAPH = previous
}

await writeFile(OUTPUT_PATH, Buffer.from(bytes))
const decoded = await decode_gia_file(OUTPUT_PATH, PROTO_PATH)

function pinKind(p: any): number | undefined {
  return p?.i1?.kind ?? p?.kind
}
function pinIndex(p: any): number | undefined {
  return p?.i1?.index ?? p?.index
}
function inParams(node: any): any[] {
  return (node?.pins ?? []).filter((p: any) => pinKind(p) === 3)
}
function outFlows(node: any): any[] {
  return (node?.pins ?? []).filter((p: any) => pinKind(p) === 2)
}
function idLiteral(pin: any): number | undefined {
  const v = pin?.value
  if (!v) return undefined
  if (v.bId?.val != null) return Number(v.bId.val)
  if (v.bConcreteValue?.value?.bId?.val != null) {
    return Number(v.bConcreteValue.value.bId.val)
  }
  return undefined
}
function alreadySet(pin: any): boolean | undefined {
  return pin?.value?.alreadySetVal
}
function caseListEntries(pin: any): number[] {
  const entries =
    pin?.value?.bArray?.entries ??
    pin?.value?.bConcreteValue?.value?.bArray?.entries ??
    []
  return entries
    .map((e: any) => e?.bInt?.val)
    .filter((v: unknown) => typeof v === 'number')
    .map((v: number) => Number(v))
}

// --- Bug 1: prefab_id literal in move composite impl ---
const moveGraph = findImplGraphByCompositeName(decoded, MOVE_NAME)
assert.ok(moveGraph, `impl graph missing for ${MOVE_NAME}`)

// get_entities_with_specified_prefab_on_the_field is generic ~320
const prefabQueryNodes = (moveGraph.nodes ?? []).filter(
  (n: any) => n.genericId?.nodeId === 320 || n.concreteId?.nodeId === 320
)
assert.ok(prefabQueryNodes.length >= 1, 'prefab query node missing in move impl')
for (const node of prefabQueryNodes) {
  const prefabPin = inParams(node).find((p: any) => pinIndex(p) === 0)
  assert.ok(prefabPin, 'prefab InParam[0] missing')
  assert.equal(
    alreadySet(prefabPin),
    true,
    `prefab pin alreadySetVal expected true, got ${alreadySet(prefabPin)}`
  )
  assert.equal(
    idLiteral(prefabPin),
    Number(PREFAB_LITERAL),
    `prefab bId.val expected ${PREFAB_LITERAL}, got ${idLiteral(prefabPin)}`
  )
}

// --- Bug 2: multiple_branches capture control + case list + default OutFlow ---
const dispatchGraph = findImplGraphByCompositeName(decoded, DISPATCH_NAME)
assert.ok(dispatchGraph, `impl graph missing for ${DISPATCH_NAME}`)

const branchNodes = (dispatchGraph.nodes ?? []).filter((n: any) => n.genericId?.nodeId === 3)
assert.ok(branchNodes.length >= 1, 'multiple_branches node missing in dispatch impl')

for (const branch of branchNodes) {
  const control = inParams(branch).find((p: any) => pinIndex(p) === 0)
  const caseList = inParams(branch).find((p: any) => pinIndex(p) === 1)
  assert.ok(control, 'multiple_branches missing control InParam[0]')
  assert.ok(caseList, 'multiple_branches missing case list InParam[1]')

  // Capture control: typed pin exists; compositePins routes the real value.
  assert.equal(control.type, 3, `control pin type expected Integer(3), got ${control.type}`)
  // Case list must pack both case values (order follows object key enumeration).
  const cases = caseListEntries(caseList)
  assert.ok(cases.includes(CASE_W), `case list missing ${CASE_W}: ${JSON.stringify(cases)}`)
  assert.ok(cases.includes(CASE_A), `case list missing ${CASE_A}: ${JSON.stringify(cases)}`)
  assert.equal(caseList.type, 8, `case list type expected IntegerList(8), got ${caseList.type}`)

  const flows = outFlows(branch)
    .map((p: any) => pinIndex(p))
    .sort((a: number, b: number) => a - b)
  assert.ok(flows.includes(0), `default OutFlow 0 missing: ${JSON.stringify(flows)}`)
  assert.ok(flows.includes(1), `case OutFlow 1 missing: ${JSON.stringify(flows)}`)
  assert.ok(flows.includes(2), `case OutFlow 2 missing: ${JSON.stringify(flows)}`)
}

console.log(
  'OK impl prefab_id literal + multiple_branches capture control (legacy default)',
  OUTPUT_PATH
)
