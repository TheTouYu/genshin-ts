# Client Nodegraph Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build complete client nodegraph support through the same TypeScript -> IR -> GIA -> CLI pipeline used by server graphs, while allowing explicit first-pass gaps for poorly understood special nodes.

**Architecture:** Implement a server-parity client path with separate client metadata, capability, graph encoding, resolver, and builder modules. Keep the public API in `g` and `nodes.ts`, keep runtime IR readable, keep client GIA graph header encoding facts in thirdparty `node_data` beside generated client node metadata (mirroring server graph header encoding owned by thirdparty `gia_gen/basic.ts`), and touch thirdparty code only for generated node metadata/helpers or narrow schema-backed helpers. The compiler consumes encoding facts through `gia_vendor.ts` only.

**Tech Stack:** TypeScript 5.9, Node.js ESM, protobufjs-generated GIA schema, existing `tsx` scripts, existing `npm run build`, existing CLI pipeline.

**Execution Status (2026-07-04):** Phase 1 and Phase 2 are complete and committed on
branch `client-support` (`0771b78`, `c321cfc`, `17a5a3c`, `81e61de`; hashes may change on
rebase). Phase 3 has not started; the next work is Phase 3 Task 7 Step 0. This revision
also added Task 10 (minimal Phase 3 metadata + GIA smoke), Task 12 (literal value
encoding), and Task 13 (reflect variant resolution), renumbering later tasks to 14-25.
The generated `client_graph_encoding.ts` lives in thirdparty `node_data` (server-parity
with `gia_gen/basic.ts` owning server graph header encoding), not under
`src/compiler/ir_to_gia_transform/`.

**Execution Status (2026-07-05):** Phase 3 and Tasks 11-14 are complete and committed
(through `5a21b3c`). Task 15 was executed once as a server-intersection projection
(`12e04e9`) and is superseded: that approach missed every client-only node (27-57 per
family) and left client-only `nodeType` values as normalized Chinese display names,
because `resources/node_definitions.json` (official bilingual client node docs) was not
used as a source. Task 15 below is rewritten to generate full client method definitions
(real signatures, bilingual JSDoc, real `registerNode` bodies) from official docs plus
sample metadata, with server signatures demoted to a drift cross-check. Empirical note
for Step 0: the official zh-cn and en-us page node arrays are misordered relative to
each other (same pitfall documented in `docs/maintenance/routine-node-maintenance.md`),
so index-based zh/en alignment is forbidden; probing shows section-scoped parameter
fingerprints uniquely align ~58 of the 104 Chinese-typed names, the rest need
elimination plus a validated seed dictionary.

---

## File Structure

Create these files:

- `scripts/client-nodegraph/extract-client-node-metadata.ts`: decode client `.gia` samples and write raw generated source caches plus reports.
- `scripts/client-nodegraph/generate-client-nodegraph-modules.ts`: generate TypeScript modules from `resources/client_*.json`.
- `scripts/smoke-client-capability.mjs`: runtime/import smoke for generated capability data.
- `scripts/check-client-definitions-consistency.ts`: check definitions, capability, metadata, and method maps agree.
- `scripts/smoke-client-user-graphs.ts`: compile small in-memory client graph examples to IR and GIA.
- `scripts/smoke-client-cli-e2e.mjs`: CLI-level compile smoke for client graph entries.
- `scripts/smoke-client-import-validation.mjs`: package-style import validation for client modules.
- `src/definitions/client_graph_modes.ts`: generated client graph family, mode, event, handler, and capability maps.
- `src/definitions/client_method_modes.ts`: generated method-to-subtype/mode maps; created only after real client node metadata extraction can populate it.
- `src/definitions/client_nodes.ts`: generated full client execution-flow classes with real signatures, bilingual JSDoc from `resources/node_definitions.json`, and real `registerNode` bodies.
- `src/runtime/client_graph_support.ts`: runtime client graph validation, registry helpers, filter normalization, and stable errors.
- `src/shared/client_capability_errors.ts`: stable client error codes and helpers.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.ts`: generated client GIA graph header encoding data, consumed by the compiler through `gia_vendor.ts` only.
- `src/compiler/ir_to_gia_transform/client_graph.ts`: client IR -> GIA implementation.
- `src/compiler/ir_to_gia_transform/client_nodes.ts`: client node resolver and argument/connection mapping.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`: generated metadata table.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts`: client metadata lookup helpers.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts`: client graph/node/pin/value body helpers when server helpers cannot be reused cleanly.
- `tests/client_generated/.gitkeep`: keeps the report output directory present.
- `scripts/client-nodegraph/fixtures/basic_client_graphs.ts`: source fixture for runtime/IR smoke scripts.
- `scripts/client-nodegraph/fixtures/default_client_id.ts`: source fixture proving omitted client graph id defaults to `1082130433`.
- `scripts/client-nodegraph/fixtures/duplicate_server_client_id.ts`: source fixture proving server/client graph ids cannot overlap.

Modify these files:

- `package.json`: add client generation and smoke scripts.
- `src/runtime/IR.d.ts`: add client graph type, subtype, and mode definitions.
- `src/runtime/execution_flow_types.ts`: allow IR builder inputs to carry client subtype/mode.
- `src/runtime/ir_builder.ts`: emit client graph IR when given client subtype.
- `src/runtime/core.ts`: expose client graph APIs through `g` and delegate client-specific logic to `client_graph_support.ts`.
- `src/runtime/server_globals.ts`: expose scoped `gsts.f`, `gsts.fServer`, and client `gsts.f*` namespaces with user-facing JSDoc.
- `src/definitions/nodes.ts`: host client class integration points; full client classes live in generated `src/definitions/client_nodes.ts` (real methods, not server-projected shells).
- `src/compiler/gs_to_ir_json_transform/runner.ts`: emit all server and client registries.
- `src/compiler/ir_merge.ts`: enforce client merge compatibility.
- `src/compiler/ir_to_gia_transform/index.ts`: dispatch server and client IR to separate paths.
- `src/compiler/ir_to_gia_transform/types.ts`: share IR node type aliases used by client transform.
- `src/compiler/gia_vendor.ts`: export client metadata/helper types only when needed by compiler.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/graph.ts`: add narrow client extension points only if `client_basic.ts` cannot keep client construction separate.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.ts`: add client dictionary type mapping support for `ClientVarType.Dictionary_ = 24`.
- `src/i18n/locales/en-US/main.json`: add client merge/capability error messages used by CLI output.
- `src/i18n/locales/zh-CN/main.json`: add matching Chinese messages.

Do not modify these files unless a phase explicitly discovers a schema mismatch:

- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto`
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts`

---

## Phase 1: Generated Data Foundation

Stop for user review after this phase.

### Task 1: Add Client Metadata Types And Error Codes

**Files:**

- Create: `src/shared/client_capability_errors.ts`
- Create: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`
- Create: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts`
- Test: `scripts/smoke-client-capability.mjs`

- [ ] **Step 1: Create stable client error helpers**

Create `src/shared/client_capability_errors.ts`:

```ts
export const CLIENT_ERROR_CODES = {
  MODE_UNAVAILABLE: 'CLIENT_MODE_UNAVAILABLE',
  NODE_UNAVAILABLE: 'CLIENT_NODE_UNAVAILABLE',
  NODE_SYNTAX_UNAVAILABLE: 'CLIENT_NODE_SYNTAX_UNAVAILABLE',
  FILTER_RETURN_REQUIRED: 'CLIENT_FILTER_RETURN_REQUIRED',
  FILTER_RETURN_TYPE: 'CLIENT_FILTER_RETURN_TYPE',
  FILTER_RETURN_RANGE: 'CLIENT_FILTER_RETURN_RANGE',
  UNSUPPORTED_SPECIAL_NODE: 'CLIENT_UNSUPPORTED_SPECIAL_NODE'
} as const

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[keyof typeof CLIENT_ERROR_CODES]

export class ClientNodegraphError extends Error {
  readonly code: ClientErrorCode

  constructor(code: ClientErrorCode, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'ClientNodegraphError'
    this.code = code
  }
}

export function clientNodegraphError(code: ClientErrorCode, message: string): ClientNodegraphError {
  return new ClientNodegraphError(code, message)
}
```

- [ ] **Step 2: Create hand-written metadata type shell**

Create `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`:

```ts
export type ClientGraphSubType =
  | 'character_skill'
  | 'creation_skill'
  | 'creation_status'
  | 'creation_status_decision'
  | 'bool_filter'
  | 'int_filter'

export type ClientSpecialKind =
  | 'start'
  | 'signal'
  | 'structure'
  | 'structure_list'
  | 'local_variable'
  | 'dict'
  | 'reflect'
  | 'multiple_branches'
  | 'inline_var_type_hint'
  | 'structure_list_unknown_binding'

export type ClientPinMetadata = {
  index: number
  kind: 'input' | 'output' | 'in_flow' | 'out_flow' | 'client_exec' | 'client_signal'
  type: string
  reflective?: boolean
  indexOfConcrete?: number
  clientVarType?: number
}

export type ClientNodeMetadata = {
  subType: ClientGraphSubType
  nodeType: string
  displayName: string
  graphType: number
  genericId: number
  concreteId: number | string
  inputs: ClientPinMetadata[]
  outputs: ClientPinMetadata[]
  flows?: ClientPinMetadata[]
  reflectMap?: Array<{
    concreteId: number | string
    variantKey: string
    pins?: ClientPinMetadata[]
  }>
  pinFlags?: string[]
  specialKind?: ClientSpecialKind
  isStart?: boolean
  isSignal?: boolean
  isStructure?: boolean
  isLocalVariable?: boolean
  isDict?: boolean
  sampleFile: string
}

export const CLIENT_NODE_METADATA: readonly ClientNodeMetadata[] = []
```

- [ ] **Step 3: Create lookup helpers with no server fallback**

Create `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts`:

```ts
import {
  CLIENT_NODE_METADATA,
  type ClientGraphSubType,
  type ClientNodeMetadata
} from './client_node_metadata.js'

const bySubTypeAndNodeType = new Map<string, ClientNodeMetadata>()
const bySubTypeAndGenericId = new Map<string, ClientNodeMetadata>()
const bySubTypeAndConcreteId = new Map<string, ClientNodeMetadata>()

for (const item of CLIENT_NODE_METADATA) {
  bySubTypeAndNodeType.set(`${item.subType}:${item.nodeType}`, item)
  bySubTypeAndGenericId.set(`${item.subType}:${item.genericId}`, item)
  bySubTypeAndConcreteId.set(`${item.subType}:${String(item.concreteId)}`, item)
}

export function getClientNodeMetadata(
  subType: ClientGraphSubType,
  nodeType: string
): ClientNodeMetadata | undefined {
  return bySubTypeAndNodeType.get(`${subType}:${nodeType}`)
}

export function requireClientNodeMetadata(
  subType: ClientGraphSubType,
  nodeType: string
): ClientNodeMetadata {
  const found = getClientNodeMetadata(subType, nodeType)
  if (!found) {
    throw new Error(`[CLIENT_NODE_UNAVAILABLE] ${subType}.${nodeType}`)
  }
  return found
}

export function getClientNodeMetadataByGenericId(
  subType: ClientGraphSubType,
  genericId: number
): ClientNodeMetadata | undefined {
  return bySubTypeAndGenericId.get(`${subType}:${genericId}`)
}

export function getClientNodeMetadataByConcreteId(
  subType: ClientGraphSubType,
  concreteId: number | string
): ClientNodeMetadata | undefined {
  return bySubTypeAndConcreteId.get(`${subType}:${String(concreteId)}`)
}
```

- [ ] **Step 4: Add import smoke**

Create `scripts/smoke-client-capability.mjs`:

```js
import { CLIENT_NODE_METADATA } from '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'

if (!Array.isArray(CLIENT_NODE_METADATA)) {
  throw new Error('CLIENT_NODE_METADATA must be an array')
}

console.log(`[ok] client metadata imports (${CLIENT_NODE_METADATA.length} records)`)
```

- [ ] **Step 5: Run build and smoke**

Run:

```powershell
npm run build
node ./scripts/smoke-client-capability.mjs
```

Expected:

```text
[ok] client metadata imports (0 records)
```

- [ ] **Step 6: Commit**

```powershell
git add src/shared/client_capability_errors.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts scripts/smoke-client-capability.mjs
git commit -m "chore: add client nodegraph metadata foundations"
```

### Task 2: Extract Client Metadata From Samples

**Files:**

- Create: `scripts/client-nodegraph/extract-client-node-metadata.ts`
- Create: `tests/client_generated/.gitkeep`
- Output: `resources/client_node_metadata.json`
- Output: `resources/client_graph_capability.json`
- Output: `resources/client_execution_flow_metadata.json`
- Output: `tests/client_generated/_coverage_gaps.json`
- Output: `tests/client_generated/_report.json`

- [ ] **Step 1: Write extraction script**

Create `scripts/client-nodegraph/extract-client-node-metadata.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

type ClientGraphSubType =
  | 'character_skill'
  | 'creation_skill'
  | 'creation_status'
  | 'creation_status_decision'
  | 'bool_filter'
  | 'int_filter'

const DEFAULT_SAMPLE_ROOT = 'D:\\_S2\\mypy_test\\client_nodes'

const FAMILY_BY_DIR: Record<string, ClientGraphSubType> = {
  角色技能节点图: 'character_skill',
  造物技能节点图: 'creation_skill',
  造物状态节点图: 'creation_status',
  造物状态决策节点图: 'creation_status_decision',
  布尔过滤器节点: 'bool_filter',
  整数过滤器节点: 'int_filter'
}

function walkGiaFiles(dir: string): string[] {
  const out: string[] = []
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) out.push(...walkGiaFiles(full))
    if (item.isFile() && item.name.toLowerCase().endsWith('.gia')) out.push(full)
  }
  return out
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function writeJson(filePath: string, value: unknown) {
  ensureDir(filePath)
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function familyFromFile(sampleRoot: string, file: string): ClientGraphSubType | undefined {
  const rel = path.relative(sampleRoot, file)
  const first = rel.split(path.sep)[0]
  return FAMILY_BY_DIR[first]
}

function main() {
  const sampleRoot = path.resolve(process.argv[2] ?? DEFAULT_SAMPLE_ROOT)
  if (!fs.existsSync(sampleRoot)) {
    throw new Error(`[error] client sample root not found: ${sampleRoot}`)
  }

  const files = walkGiaFiles(sampleRoot).sort((a, b) => a.localeCompare(b))
  const familyCounts = new Map<ClientGraphSubType, number>()
  const unknownFamily: string[] = []

  for (const file of files) {
    const family = familyFromFile(sampleRoot, file)
    if (!family) {
      unknownFamily.push(path.relative(sampleRoot, file))
      continue
    }
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1)
  }

  const capability = Object.fromEntries(
    [...familyCounts.keys()].sort().map((subType) => [
      subType,
      {
        beyond: { status: 'available', reason: '' },
        classic: { status: 'unknown', reason: 'client classic mode requires sample confirmation' }
      }
    ])
  )

  const report = {
    sampleRoot,
    sampleCount: files.length,
    familyCounts: Object.fromEntries([...familyCounts.entries()].sort()),
    unknownFamily,
    explicitFirstPassGaps: [
      'inline_var_type_hint',
      'structure_list_unknown_binding if detected by extractor',
      'statusNodeExtension semantic naming only'
    ]
  }

  writeJson('resources/client_node_metadata.json', [])
  writeJson('resources/client_graph_capability.json', capability)
  writeJson('resources/client_execution_flow_metadata.json', [])
  writeJson('tests/client_generated/_coverage_gaps.json', {
    unsupportedSpecialKinds: ['inline_var_type_hint', 'structure_list_unknown_binding'],
    missingMetadata: []
  })
  writeJson('tests/client_generated/_report.json', report)

  console.log(`[ok] scanned ${files.length} client gia samples`)
}

main()
```

- [ ] **Step 2: Add keep file**

Create `tests/client_generated/.gitkeep` as an empty file.

- [ ] **Step 3: Run extractor**

Run:

```powershell
node --import tsx ./scripts/client-nodegraph/extract-client-node-metadata.ts
```

Expected:

```text
[ok] scanned 1288 client gia samples
```

If the count differs, record the actual count in `tests/client_generated/_report.json` and continue.

- [ ] **Step 4: Inspect generated report**

Run:

```powershell
Get-Content -Raw tests/client_generated/_report.json
```

Expected:

```json
{
  "sampleRoot": "D:\\_S2\\mypy_test\\client_nodes",
  "sampleCount": 1288,
  "familyCounts": {
    "bool_filter": 202,
    "character_skill": 265,
    "creation_skill": 246,
    "creation_status": 199,
    "creation_status_decision": 173,
    "int_filter": 203
  }
}
```

- [ ] **Step 5: Commit**

```powershell
git add scripts/client-nodegraph/extract-client-node-metadata.ts tests/client_generated/.gitkeep resources/client_node_metadata.json resources/client_graph_capability.json resources/client_execution_flow_metadata.json tests/client_generated/_coverage_gaps.json tests/client_generated/_report.json
git commit -m "chore: extract client nodegraph source caches"
```

### Task 3: Generate TypeScript Modules From Client Source Caches

**Files:**

- Create: `scripts/client-nodegraph/generate-client-nodegraph-modules.ts`
- Modify: `package.json`
- Output: `src/definitions/client_graph_modes.ts`
- Output: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.ts`
- Output: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`

- [ ] **Step 1: Write generator script**

Create `scripts/client-nodegraph/generate-client-nodegraph-modules.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function write(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body.endsWith('\n') ? body : body + '\n', 'utf8')
}

const capability = readJson<Record<string, unknown>>('resources/client_graph_capability.json')
const metadata = readJson<unknown[]>('resources/client_node_metadata.json')

const subTypes = [
  'character_skill',
  'creation_skill',
  'creation_status',
  'creation_status_decision',
  'bool_filter',
  'int_filter'
] as const

const graphEncoding = {
  bool_filter: { graphType: 20001, graphWhich: 10 },
  int_filter: { graphType: 20006, graphWhich: 47 },
  character_skill: { graphType: 20002, graphWhich: 11 },
  creation_skill: { graphType: 20008, graphWhich: 52 },
  creation_status_decision: { graphType: 20007, graphWhich: 51 },
  creation_status: { graphType: 20009, graphWhich: 53 }
}

write(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.ts',
  `import type { ClientGraphSubType } from './client_node_metadata.js'

export type ClientGraphEncoding = {
  graphType: number
  graphWhich: number
}

export const CLIENT_GRAPH_ENCODING_BY_SUB_TYPE: Record<ClientGraphSubType, ClientGraphEncoding> = ${JSON.stringify(
    graphEncoding,
    null,
    2
  )} as const

export function getClientGraphEncoding(subType: ClientGraphSubType): ClientGraphEncoding {
  return CLIENT_GRAPH_ENCODING_BY_SUB_TYPE[subType]
}
`
)

write(
  'src/definitions/client_graph_modes.ts',
  `import type { ClientGraphSubType } from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'

export const CLIENT_GRAPH_SUB_TYPES = ${JSON.stringify(subTypes, null, 2)} as const

export const CLIENT_GRAPH_METHOD_BY_SUB_TYPE: Record<ClientGraphSubType, string> = {
  character_skill: 'characterSkill',
  creation_skill: 'creationSkill',
  creation_status: 'creationStatus',
  creation_status_decision: 'creationStatusDecision',
  bool_filter: 'boolFilter',
  int_filter: 'intFilter'
}

export const CLIENT_GRAPH_SUB_TYPE_BY_METHOD = Object.fromEntries(
  Object.entries(CLIENT_GRAPH_METHOD_BY_SUB_TYPE).map(([subType, method]) => [method, subType])
) as Record<string, ClientGraphSubType>

export const CLIENT_GRAPH_CAPABILITY_BY_SUB_TYPE = ${JSON.stringify(capability, null, 2)} as const

export const CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE = {
  character_skill: { event: 'start', startNodeType: 'node_graph_begins', handler: { params: [], shape: 'start', returnType: 'void' } },
  creation_skill: { event: 'start', startNodeType: 'node_graph_begins', handler: { params: [], shape: 'start', returnType: 'void' } },
  creation_status: { event: 'start', startNodeType: 'node_graph_begins', handler: { params: [], shape: 'start', returnType: 'void' } },
  creation_status_decision: { event: 'start', startNodeType: 'node_graph_begins', handler: { params: [], shape: 'start', returnType: 'void' } },
  bool_filter: { event: 'start', startNodeType: 'node_graph_begins', handler: { params: [], shape: 'filter', returnType: 'bool' } },
  int_filter: { event: 'start', startNodeType: 'node_graph_begins', handler: { params: [], shape: 'filter', returnType: 'int' } }
} as const
`
)

const metadataBody = fs.readFileSync(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts',
  'utf8'
)
const nextMetadataBody = metadataBody.replace(
  /export const CLIENT_NODE_METADATA: readonly ClientNodeMetadata\\[] = \\[[\\s\\S]*?\\]\\n?$/,
  `export const CLIENT_NODE_METADATA: readonly ClientNodeMetadata[] = ${JSON.stringify(metadata, null, 2)} as const\n`
)
write(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts',
  nextMetadataBody
)

console.log('[ok] generated client nodegraph modules')
```

- [ ] **Step 2: Add npm scripts**

Modify `package.json` scripts:

```json
{
  "gen:client": "node --import tsx ./scripts/client-nodegraph/extract-client-node-metadata.ts && node --import tsx ./scripts/client-nodegraph/generate-client-nodegraph-modules.ts && prettier --write src/definitions/client_*.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_*.ts",
  "smoke:client": "npm run build && node ./scripts/smoke-client-capability.mjs"
}
```

- [ ] **Step 3: Run generation**

Run:

```powershell
npm run gen:client
```

Expected:

```text
[ok] scanned 1288 client gia samples
[ok] generated client nodegraph modules
```

- [ ] **Step 4: Assert definitions do not contain graph encoding**

Run:

```powershell
rg -n "graphType|graphWhich" src/definitions/client_graph_modes.ts src/definitions/nodes.ts
```

Expected: no matches.

- [ ] **Step 5: Run build and smoke**

Run:

```powershell
npm run smoke:client
```

Expected: build passes and `smoke-client-capability.mjs` prints an `[ok]` line.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/client-nodegraph/generate-client-nodegraph-modules.ts src/definitions/client_graph_modes.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts
git commit -m "chore: generate client nodegraph modules"
```

### Phase 1 Review Gate

- [ ] Present generated file list.
- [ ] Present sample count and family counts.
- [ ] Present explicit gap list.
- [ ] Present build and smoke results.
- [ ] Wait for user approval before Phase 2.

---

## Phase 2: Runtime And IR

Stop for user review after this phase.

### Task 4: Add Client IR Types

**Files:**

- Modify: `src/runtime/IR.d.ts`
- Modify: `src/runtime/execution_flow_types.ts`
- Modify: `src/runtime/ir_builder.ts`

- [ ] **Step 1: Extend IR graph types**

Modify `src/runtime/IR.d.ts` so the graph type section contains:

```ts
export type IRDocument = ServerIRDocument | ClientIRDocument

export type ClientIRDocument = SimplifyDeep<
  BaseIRDocument & {
    graph: ClientGraphInfo
    nodes?: ClientNode[]
  }
>

export type GraphMode = 'beyond' | 'classic'
export type ServerGraphMode = GraphMode
export type ClientGraphMode = GraphMode
export type ClientGraphSubType =
  | 'character_skill'
  | 'creation_skill'
  | 'creation_status'
  | 'creation_status_decision'
  | 'bool_filter'
  | 'int_filter'

export interface ClientGraphInfo {
  name?: string
  id?: number
  type: 'client'
  mode?: ClientGraphMode
  sub_type: ClientGraphSubType
}

export type ClientNode = SimplifyDeep<
  Node & {
    type: string
  }
>
```

- [ ] **Step 2: Extend IR builder input**

Modify `src/runtime/execution_flow_types.ts`:

```ts
import type {
  ClientGraphMode,
  ClientGraphSubType,
  NextConnection,
  ServerGraphMode,
  ServerGraphSubType,
  Variable
} from './IR.js'

export type IRBuildInput = {
  flows: ExecutionFlow[]
  variables: Variable[]
  serverSubType?: ServerGraphSubType
  serverMode?: ServerGraphMode
  clientSubType?: ClientGraphSubType
  clientMode?: ClientGraphMode
  graphId?: number
  graphName?: string
}
```

- [ ] **Step 3: Emit client IR**

Modify `src/runtime/ir_builder.ts` inside `buildIRDocument` before the server return:

```ts
if (input.clientSubType) {
  return {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'client',
      mode: input.clientMode,
      sub_type: input.clientSubType,
      id: input.graphId,
      name: input.graphName
    },
    variables: input.variables,
    nodes
  }
}
```

- [ ] **Step 4: Run build**

Run:

```powershell
npm run build
```

Expected: TypeScript build passes.

- [ ] **Step 5: Commit**

```powershell
git add src/runtime/IR.d.ts src/runtime/execution_flow_types.ts src/runtime/ir_builder.ts
git commit -m "feat: add client graph IR shape"
```

### Task 5: Add Runtime Client Graph Support Module

**Files:**

- Create: `src/runtime/client_graph_support.ts`
- Modify: `src/runtime/core.ts`
- Modify: `src/runtime/server_globals.ts`
- Modify: `src/definitions/nodes.ts`
- Modify: `src/compiler/gs_to_ir_json_transform/runner.ts`

- [ ] **Step 1: Create client graph support module**

Create `src/runtime/client_graph_support.ts`:

```ts
import { CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE } from '../definitions/client_graph_modes.js'
import {
  ClientBoolFilterExecutionFlowFunctions,
  ClientCharacterSkillExecutionFlowFunctions,
  ClientCreationSkillExecutionFlowFunctions,
  ClientCreationStatusDecisionExecutionFlowFunctions,
  ClientCreationStatusExecutionFlowFunctions,
  ClientIntFilterExecutionFlowFunctions
} from '../definitions/nodes.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../shared/client_capability_errors.js'
import type { ExecutionFlowRegistry } from './core.js'
import type { ClientGraphMode, ClientGraphSubType } from './IR.js'
import { bool, int } from './value.js'

export type ClientLang = 'en' | 'zh'

type ClientGraphOptionsBase = {
  /**
   * [ZH] 客户端节点图 ID（NodeGraph.id）。
   *
   * 对应要注入/替换的目标客户端 NodeGraph ID。客户端节点图默认值为 1082130433。
   *
   * [EN] Client node graph id (NodeGraph.id).
   *
   * The target client NodeGraph id to inject/replace. The client graph default value is 1082130433.
   */
  id?: number
  /**
   * [ZH] 客户端节点图显示名称（NodeGraph.name）。
   *
   * 若不指定：默认使用入口文件名（由 gsts runner 注入 defaultName）。
   *
   * [EN] Display name inside the client node editor (NodeGraph.name).
   *
   * If omitted: defaults to the entry file name (provided by the gsts runner as defaultName).
   */
  name?: string
  /**
   * [ZH] 是否自动加 `_GSTS` 前缀（默认 true）。
   * - true: 若 name/defaultName 不以 `_GSTS` 开头，则自动补 `_GSTS_` 前缀
   * - false: 不做任何前缀处理
   *
   * [EN] Whether to auto prefix with `_GSTS` (default true).
   */
  prefix?: boolean
  /**
   * [ZH] 语言偏好（仅影响类型提示与中文别名解析）。
   *
   * 设置为 `zh` 时，客户端节点图 API 使用中文事件名与中文 f 函数别名提示；
   * 默认 `en` 使用英文事件名与英文 f 函数名。
   *
   * [EN] Language hint (affects type hints and zh alias resolution only).
   *
   * Use `zh` for Chinese event names and Chinese f-function alias hints; the default `en` uses
   * English event names and English f-function names.
   */
  lang?: ClientLang
}

export type ClientGraphOptions<Mode extends ClientGraphMode = ClientGraphMode> =
  Mode extends 'classic'
    ? ClientGraphOptionsBase & {
        /**
         * [ZH] 客户端节点图模式（经典模式 Classic Mode）。
         *
         * 使用经典模式构建该客户端节点图；事件与 f 函数类型提示会匹配 classic 模式可用能力。
         *
         * [EN] Client graph mode (Classic Mode).
         *
         * Builds this client node graph in Classic Mode; event and f-function type hints match
         * classic-compatible capabilities.
         */
        mode: 'classic'
      }
    : ClientGraphOptionsBase & {
        /**
         * [ZH] 客户端节点图模式（默认超限模式 Beyond Mode）。
         *
         * 使用超限模式构建该客户端节点图；事件与 f 函数类型提示会匹配 beyond 模式可用能力。
         *
         * [EN] Client graph mode (default: Beyond Mode).
         *
         * Builds this client node graph in Beyond Mode; event and f-function type hints match
         * beyond-compatible capabilities.
         */
        mode?: 'beyond'
      }

export type ClientStartEvent = Record<string, never>
export type ClientStartGraphSubType = Exclude<ClientGraphSubType, 'bool_filter' | 'int_filter'>

export type ClientFlowFunctionClass<T extends ClientGraphSubType> = T extends 'character_skill'
  ? ClientCharacterSkillExecutionFlowFunctions
  : T extends 'creation_skill'
    ? ClientCreationSkillExecutionFlowFunctions
    : T extends 'creation_status'
      ? ClientCreationStatusExecutionFlowFunctions
      : T extends 'creation_status_decision'
        ? ClientCreationStatusDecisionExecutionFlowFunctions
        : T extends 'bool_filter'
          ? ClientBoolFilterExecutionFlowFunctions
          : ClientIntFilterExecutionFlowFunctions

export type ClientStartHandler<F> = (evt: ClientStartEvent, f: F) => void
export type ClientFilterHandler<F, R> = (evt: ClientStartEvent, f: F) => R

export type ClientStartEventName = 'start'
export type ClientStartGraphApi<
  F,
  Lang extends ClientLang = 'en',
  Mode extends ClientGraphMode = 'beyond'
> = {
  on(
    eventName: ClientStartEventName,
    handler: ClientStartHandler<F>
  ): ClientStartGraphApi<F, Lang, Mode>
}
export type ClientFilterGraphApi<
  F,
  R,
  Lang extends ClientLang = 'en',
  Mode extends ClientGraphMode = 'beyond'
> = {
  on(
    eventName: ClientStartEventName,
    handler: ClientFilterHandler<F, R>
  ): ClientFilterGraphApi<F, R, Lang, Mode>
}

export function assertClientGraphMode(mode?: ClientGraphMode): ClientGraphMode {
  const resolved = mode ?? 'beyond'
  if (resolved !== 'beyond' && resolved !== 'classic') {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.MODE_UNAVAILABLE,
      `invalid client mode: ${String(mode)}`
    )
  }
  return resolved
}

export function assertClientGraphSubType(subType: ClientGraphSubType): ClientGraphSubType {
  if (!(subType in CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE)) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.MODE_UNAVAILABLE,
      `invalid client graph subtype: ${String(subType)}`
    )
  }
  return subType
}

export function normalizeClientBoolFilterReturn(result: boolean | bool): bool {
  if (result instanceof bool) return result
  if (typeof result === 'boolean') return new bool(result)
  throw clientNodegraphError(
    CLIENT_ERROR_CODES.FILTER_RETURN_TYPE,
    'bool_filter handler must return boolean or bool'
  )
}

export function normalizeClientIntFilterReturn(result: bigint | number | int): int {
  if (result instanceof int) return result
  if (typeof result === 'bigint') return new int(result)
  if (typeof result === 'number') {
    if (!Number.isSafeInteger(result)) {
      throw clientNodegraphError(
        CLIENT_ERROR_CODES.FILTER_RETURN_RANGE,
        'int_filter number return must be a safe integer'
      )
    }
    return new int(result)
  }
  throw clientNodegraphError(
    CLIENT_ERROR_CODES.FILTER_RETURN_TYPE,
    'int_filter handler must return safe integer number, bigint, or int'
  )
}

export const CLIENT_FILTER_END_NODE_TYPES = {
  bool_filter: 'node_graph_end_boolean',
  int_filter: 'node_graph_end_integer'
} as const

export function createClientFlowFunctions<T extends ClientGraphSubType>(
  subType: T,
  registry: ExecutionFlowRegistry
): ClientFlowFunctionClass<T> {
  switch (subType) {
    case 'character_skill':
      return new ClientCharacterSkillExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'creation_skill':
      return new ClientCreationSkillExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'creation_status':
      return new ClientCreationStatusExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'creation_status_decision':
      return new ClientCreationStatusDecisionExecutionFlowFunctions(
        registry
      ) as ClientFlowFunctionClass<T>
    case 'bool_filter':
      return new ClientBoolFilterExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
    case 'int_filter':
      return new ClientIntFilterExecutionFlowFunctions(registry) as ClientFlowFunctionClass<T>
  }
}
```

- [ ] **Step 2: Add client execution-flow classes**

Modify the bottom of `src/definitions/nodes.ts`:

```ts
class ClientExecutionFlowFunctionsBase {
  constructor(protected registry: ExecutionFlowRegistry) {}
}

export class ClientCharacterSkillExecutionFlowFunctions extends ClientExecutionFlowFunctionsBase {}
export class ClientCreationSkillExecutionFlowFunctions extends ClientExecutionFlowFunctionsBase {}
export class ClientCreationStatusExecutionFlowFunctions extends ClientExecutionFlowFunctionsBase {}
export class ClientCreationStatusDecisionExecutionFlowFunctions extends ClientExecutionFlowFunctionsBase {}
export class ClientBoolFilterExecutionFlowFunctions extends ClientExecutionFlowFunctionsBase {}
export class ClientIntFilterExecutionFlowFunctions extends ClientExecutionFlowFunctionsBase {}

export type ClientExecutionFlowFunctionsBySubType = {
  character_skill: ClientCharacterSkillExecutionFlowFunctions
  creation_skill: ClientCreationSkillExecutionFlowFunctions
  creation_status: ClientCreationStatusExecutionFlowFunctions
  creation_status_decision: ClientCreationStatusDecisionExecutionFlowFunctions
  bool_filter: ClientBoolFilterExecutionFlowFunctions
  int_filter: ClientIntFilterExecutionFlowFunctions
}
```

Also replace the `MetaCallRegistry` constructor type imported by `ServerExecutionFlowFunctions` with an exported interface named `ExecutionFlowRegistry` from `src/runtime/core.ts`.

- [ ] **Step 3: Add client registries to core**

Modify `src/runtime/core.ts` so:

```ts
export interface ExecutionFlowRegistry {
  registerNode(record: MetaCallRecord): MetaCallRecordRef
  withExecBranch(
    fromNodeId: number,
    sourceIndex: number,
    fn: () => void
  ): {
    tailEndpoints: ExecTailEndpoint[]
    headNodeId?: number
    terminatedByReturn?: boolean
  }
  markLinkNextExecFrom(fromNodeId: number, sourceIndex: number): void
  setCurrentExecTailEndpoints(tailEndpoints: ExecTailEndpoint[]): void
  returnFromCurrentExecPath(opts?: { countReturn?: boolean }): void
  getOrCreateReturnGateLocalVariable(): { localVariable: localVariable; value: bool }
  withLoop(loopNodeId: number, fn: () => void): void
  getActiveLoopNodeIds(): number[]
  getReturnCallCounter(): number
  ensureVariable(variable: Variable, meta?: NodeGraphVariableMeta): void
  getVariableMeta(name: string): NodeGraphVariableMeta | undefined
  registerTimerCaptureDict(name: string, valueType: DictValueType): void
  connectExecBranchOutput(fromNodeId: number, sourceIndex: number, headNodeId: number): void
}
```

Then make `MetaCallRegistry implements ExecutionFlowRegistry`.

`runClientStartHandler(...)` should:

1. Register the internal client start node as the event node.
2. Run the handler under a subtype-specific client ctx type: `client_<subType>_handler`.
3. Bind the matching client flow-function class.
4. Bind the matching scoped global f namespace during the handler.
5. For filter graph families, normalize the handler return into the matching filter end execution node.
6. Restore the previous scoped global bindings after the handler exits.

Filter end nodes are intentionally modeled as execution nodes in runtime IR. They are the graph
exit point that carries the return value as an argument, and they let the existing unused-node
optimizer preserve the parameter/data dependency chain used by the returned value.

Extend `GstsCtxApi` with client ctx helpers:

```ts
isClientCtx(): boolean
assertClientCtx(): void
isClientGraphCtx(subType: ClientGraphSubType): boolean
assertClientGraphCtx(subType: ClientGraphSubType): void
```

Client scoped global getters must call `assertClientGraphCtx(subType)` before returning their
bound f namespace, so `gsts.fBoolFilter` is unavailable inside `g.characterSkill(...).on(...)`.

Client control-flow callbacks must keep the same subtype in their ctx names:

```ts
client_ < subType > _if
client_ < subType > _loop
client_ < subType > _switch
```

Future generated client control-flow methods must enter those ctx names when running callbacks.
Do not expose `doubleBranch`, `finiteLoop`, `listIterationLoop`, `multipleBranches`, or `breakLoop`
on every client family by default. They must be generated from client metadata/capability maps and
filtered by `SubType + Mode`; unsupported dynamic use must fail with stable client errors.

- [ ] **Step 4: Add client API entry points**

Modify `src/runtime/core.ts` to export `g` with:

```ts
export const g = {
  server,
  characterSkill,
  creationSkill,
  creationStatus,
  creationStatusDecision,
  boolFilter,
  intFilter
}
```

Implement a shared `createClientGraphApi(subType, options)` helper in `src/runtime/core.ts`, following the same shape as `server(options).on(eventName, handler)`. `characterSkill`, `creationSkill`, `creationStatus`, `creationStatusDecision`, `boolFilter`, and `intFilter` should be thin graph-selector wrappers around that helper.

Do not add positional handler overloads such as `g.characterSkill(options, handler)`.

Formal API shape:

```ts
g.characterSkill(options?).on('start', handler)
g.creationSkill(options?).on('start', handler)
g.creationStatus(options?).on('start', handler)
g.creationStatusDecision(options?).on('start', handler)
g.boolFilter(options?).on('start', handler)
g.intFilter(options?).on('start', handler)
```

Scoped global f access must also be supported:

```ts
gsts.f.printString('server shorthand') // equivalent to gsts.fServer.printString(...)
gsts.fServer.printString('explicit server')

gsts.fCharacterSkill.printString('character skill')
gsts.fCreationSkill.printString('creation skill')
gsts.fCreationStatus.printString('creation status')
gsts.fCreationStatusDecision.printString('creation status decision')
gsts.fBoolFilter.greaterThan(2, 1)
gsts.fIntFilter.add(1, 2)
```

Rules:

- `gsts.f` remains the existing server shorthand and is equivalent to `gsts.fServer`.
- `gsts.fServer` is the explicit server namespace.
- Each client graph family uses a dedicated top-level namespace:
  `gsts.fCharacterSkill`, `gsts.fCreationSkill`, `gsts.fCreationStatus`,
  `gsts.fCreationStatusDecision`, `gsts.fBoolFilter`, and `gsts.fIntFilter`.
- Client namespaces must not be nested under `gsts.f`.
- Accessing an unbound scoped namespace outside the matching handler should fail with a clear error.
- User-facing JSDoc for `gsts.f` must explain that it is the server shorthand and is equivalent to `gsts.fServer`.

The public event name is `start`. The internal client GIA start node remains `node_graph_begins`, read from `CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE[subType].startNodeType`.

`createClientGraphApi` should:

1. Resolve and validate `ClientGraphSubType` and `ClientGraphMode`.
2. Create a `MetaCallRegistry` with client subtype/mode/id/name metadata.
3. Return an object with `.on('start', handler)`.
4. Inside `.on`, register the internal start node from `CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE[subType].startNodeType`.
5. Bind the matching client flow-function class for the handler.
6. Bind and restore the matching `gsts.f*` scoped global namespace for the handler.
7. For filter graph families, normalize the handler return into the matching filter end execution node.

- [ ] **Step 5: Add all registry build function**

Modify `src/runtime/core.ts`:

```ts
export function buildAllGraphRegistriesIRDocuments(opts: IRBuildOptions = {}) {
  return [
    ...buildServerGraphRegistriesIRDocuments(opts),
    ...buildClientGraphRegistriesIRDocuments(opts)
  ]
}
```

Client graph IR generation must honor `getRuntimeOptions().optimize.removeUnusedNodes` in the same
way as server graph IR generation. The bool/int filter end execution node is the reachable anchor
that keeps the returned parameter/data dependency chain alive.

- [ ] **Step 6: Make runner emit all registries**

Modify `src/compiler/gs_to_ir_json_transform/runner.ts`:

```ts
import { buildAllGraphRegistriesIRDocuments } from '../../runtime/core.js'
```

and call:

```ts
buildAllGraphRegistriesIRDocuments({
  defaultName: defaultGraphNameFromEntryFile(entryFile)
})
```

- [ ] **Step 7: Add runtime smoke fixture**

Create `scripts/client-nodegraph/fixtures/basic_client_graphs.ts`:

```ts
import { g } from '../../src/runtime/core.js'

g.characterSkill({ id: 1082130433, name: 'ClientSkill' }).on('start', (_evt, f) => {
  f.printString('client skill')
})

g.boolFilter({ id: 1082130437, name: 'ClientBoolFilter' }).on('start', () => {
  return true
})

g.intFilter({ id: 1082130438, name: 'ClientIntFilter' }).on('start', () => {
  return 1n
})
```

- [ ] **Step 8: Run IR emission manually**

Run:

```powershell
npm run build
node --import tsx dist/src/compiler/gs_to_ir_json_transform/runner.js scripts/client-nodegraph/fixtures/basic_client_graphs.ts tests/client_generated/basic_client_graphs.ir.json
```

Expected: generated JSON contains three documents with `graph.type` equal to `client`.

- [ ] **Step 8a: Add client API type smoke**

Create `scripts/client-nodegraph/fixtures/client_api_types.ts` to compile-check that `mode` and
`lang` flow through the public client API type:

```ts
g.characterSkill({ mode: 'classic', lang: 'zh' })
g.intFilter({ lang: 'zh' })
g.boolFilter({ mode: 'classic' })
gsts.fServer
gsts.fCharacterSkill
gsts.fCreationSkill
gsts.fCreationStatus
gsts.fCreationStatusDecision
gsts.fBoolFilter
gsts.fIntFilter
```

Expected: `npm run build` type-checks `ClientStartGraphApi` / `ClientFilterGraphApi` with
`SubType + Lang + Mode` preserved, and the scoped global f namespaces are visible in the
published type surface.

- [ ] **Step 8b: Check default client graph id**

Create `scripts/client-nodegraph/fixtures/default_client_id.ts` with a client graph that omits `id`.

Run:

```powershell
node --import tsx dist/src/compiler/gs_to_ir_json_transform/runner.js scripts/client-nodegraph/fixtures/default_client_id.ts tests/client_generated/default_client_id.ir.json
```

Expected: generated JSON contains `graph.id` equal to `1082130433`.

- [ ] **Step 8c: Reject duplicate server/client graph ids**

Create `scripts/client-nodegraph/fixtures/duplicate_server_client_id.ts` with one server graph and one client graph sharing the same id.

Run:

```powershell
node --import tsx dist/src/compiler/gs_to_ir_json_transform/runner.js scripts/client-nodegraph/fixtures/duplicate_server_client_id.ts tests/client_generated/duplicate_server_client_id.ir.json
```

Expected: command fails with a clear `server/client graph id cannot be duplicated` error.

- [ ] **Step 9: Commit**

```powershell
git add src/runtime/client_graph_support.ts src/runtime/core.ts src/runtime/graph_defaults.ts src/definitions/nodes.ts src/compiler/gs_to_ir_json_transform/runner.ts scripts/client-nodegraph/fixtures/basic_client_graphs.ts scripts/client-nodegraph/fixtures/default_client_id.ts scripts/client-nodegraph/fixtures/duplicate_server_client_id.ts
git commit -m "feat: build client graph IR from runtime APIs"
```

### Task 6: Add Client IR Merge Compatibility

**Files:**

- Modify: `src/compiler/ir_merge.ts`
- Modify: `src/i18n/locales/en-US/main.json`
- Modify: `src/i18n/locales/zh-CN/main.json`

- [ ] **Step 1: Add merge errors**

Modify `src/i18n/locales/en-US/main.json`:

```json
"err_mergeClientSubTypeMismatch": "[error] cannot merge different client sub_type (id={{id}}): {{a}} vs {{b}}",
"err_mergeClientModeMismatch": "[error] cannot merge different client mode (id={{id}}): {{a}} vs {{b}}"
```

Modify `src/i18n/locales/zh-CN/main.json`:

```json
"err_mergeClientSubTypeMismatch": "[error] 无法合并不同 client sub_type（id={{id}}）：{{a}} vs {{b}}",
"err_mergeClientModeMismatch": "[error] 无法合并不同 client mode（id={{id}}）：{{a}} vs {{b}}"
```

- [ ] **Step 2: Enforce client merge compatibility**

Modify `normalizeGraphCompatibility` in `src/compiler/ir_merge.ts`:

```ts
if (a.type === 'client' && b.type === 'client') {
  const sa = a.sub_type
  const sb = b.sub_type
  if (sa !== sb) {
    throw new Error(
      t('err_mergeClientSubTypeMismatch', {
        id: String(a.id),
        a: String(sa),
        b: String(sb)
      })
    )
  }

  const ma = a.mode
  const mb = b.mode
  if (ma && mb && ma !== mb) {
    throw new Error(
      t('err_mergeClientModeMismatch', {
        id: String(a.id),
        a: String(ma),
        b: String(mb)
      })
    )
  }
  if (!ma && mb) a.mode = mb
  return
}
```

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: build passes.

- [ ] **Step 4: Commit**

```powershell
git add src/compiler/ir_merge.ts src/i18n/locales/en-US/main.json src/i18n/locales/zh-CN/main.json
git commit -m "feat: validate client IR merge compatibility"
```

### Phase 2 Review Gate

- [ ] Present client IR examples.
- [ ] Present runtime API surface.
- [ ] Present merge compatibility behavior.
- [ ] Present build result.
- [ ] Wait for user approval before Phase 3.

---

## Phase 3: Client Compiler And GIA Builder

Stop for user review after this phase.

### Task 7: Add Client Compiler Resolver

**Files:**

- Create: `src/compiler/ir_to_gia_transform/client_nodes.ts`
- Modify: `src/compiler/ir_to_gia_transform/types.ts`
- Modify: `src/compiler/ir_to_gia_transform/index.ts`

- [ ] **Step 0: Add client IR fail-fast guard**

Since Phase 2, the runner already emits client IR documents, but `irToGia` still routes
everything through the server path. Before any other Phase 3 work, add a fail-fast guard
at the start of `irToGia` in `src/compiler/ir_to_gia_transform/index.ts`:

```ts
if (ir.graph.type === 'client') {
  throw new Error(
    '[error] client IR to GIA compilation is not available yet; it lands later in this phase'
  )
}
```

This guard is replaced by the real client dispatch in Task 9. Client IR must never
silently enter the server transform path.

- [ ] **Step 1: Add client node resolver**

Create `src/compiler/ir_to_gia_transform/client_nodes.ts`:

```ts
import type { ClientGraphSubType } from '../../runtime/IR.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import {
  requireClientNodeMetadata,
  type ClientNodeMetadata
} from '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.js'
import type { IRNode } from './types.js'

const UNSUPPORTED_SPECIAL_KINDS = new Set([
  'inline_var_type_hint',
  'structure_list_unknown_binding'
])

export function resolveClientNodeMetadata(
  subType: ClientGraphSubType,
  node: IRNode
): ClientNodeMetadata {
  const metadata = requireClientNodeMetadata(subType, node.type)
  if (metadata.specialKind && UNSUPPORTED_SPECIAL_KINDS.has(metadata.specialKind)) {
    throw clientNodegraphError(
      CLIENT_ERROR_CODES.UNSUPPORTED_SPECIAL_NODE,
      `${subType}.${node.type} uses unsupported special kind ${metadata.specialKind}`
    )
  }
  return metadata
}
```

- [ ] **Step 2: Ensure type aliases compile**

Modify `src/compiler/ir_to_gia_transform/types.ts`:

```ts
import type { IRDocument } from '../../runtime/IR.js'

export type Position = [number, number]
export type NodeId = number
export type IRNode = NonNullable<IRDocument['nodes']>[number]
```

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: build passes.

- [ ] **Step 4: Commit**

```powershell
git add src/compiler/ir_to_gia_transform/client_nodes.ts src/compiler/ir_to_gia_transform/types.ts src/compiler/ir_to_gia_transform/index.ts
git commit -m "feat: resolve client nodes from client metadata"
```

### Task 8: Add Client GIA Body Helpers

**Files:**

- Create: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts`
- Modify: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.ts`

- [ ] **Step 1: Add client graph and node body helpers**

Create `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts`:

```ts
// @ts-nocheck thirdparty

import type { ClientNodeMetadata, ClientPinMetadata } from '../node_data/client_node_metadata.js'
import {
  GraphUnit_Id_Class,
  GraphUnit_Id_Type,
  NodeGraph_Id_Class,
  NodeGraph_Id_Kind,
  NodePin_Index_Kind,
  NodeProperty_Type,
  VarBase_Class,
  VarBase_ItemType_ClassBase,
  type GraphNode,
  type NodePin,
  type Root,
  type VarBase
} from '../protobuf/gia.proto.js'
import { graph_body, node_connect_from, node_connect_to } from './basic.js'

export function client_graph_body(body: {
  uid: number
  graph_id: number
  graph_name: string
  graphType: number
  graphWhich: number
  nodes: GraphNode[]
}): Root {
  const root = graph_body({
    uid: body.uid,
    graph_id: body.graph_id,
    graph_name: body.graph_name,
    nodes: body.nodes,
    mode: 'server'
  })
  root.graph.id = {
    class: GraphUnit_Id_Class.Basic,
    type: GraphUnit_Id_Type.ClientGraph,
    id: body.graph_id
  }
  root.graph.which = body.graphWhich
  root.graph.graph!.inner.graph.id = {
    class: NodeGraph_Id_Class.UserDefined,
    type: body.graphType,
    kind: NodeGraph_Id_Kind.NodeGraph,
    id: body.graph_id
  }
  return root
}

function emptyClientValue(pin: ClientPinMetadata): VarBase {
  return {
    class: VarBase_Class.ConcreteBase,
    alreadySetVal: false,
    itemType: {
      classBase: VarBase_ItemType_ClassBase.Client,
      type_client: {
        type: pin.clientVarType ?? 0
      }
    },
    bConcreteValue: {
      value: {}
    }
  } as VarBase
}

export function client_pin_body(pin: ClientPinMetadata): NodePin {
  const kind =
    pin.kind === 'input'
      ? NodePin_Index_Kind.InParam
      : pin.kind === 'output'
        ? NodePin_Index_Kind.OutParam
        : pin.kind === 'client_exec'
          ? NodePin_Index_Kind.ClientExecNode
          : pin.kind === 'client_signal'
            ? NodePin_Index_Kind.ClientSignal
            : pin.kind === 'in_flow'
              ? NodePin_Index_Kind.InFlow
              : NodePin_Index_Kind.OutFlow
  return {
    i1: { kind, index: pin.index },
    i2: { kind, index: pin.index },
    type: pin.clientVarType ?? 0,
    value: pin.kind === 'input' ? emptyClientValue(pin) : undefined,
    connects: []
  }
}

export function client_node_body(body: {
  metadata: ClientNodeMetadata
  unique_index: number
  x: number
  y: number
}): GraphNode {
  const pins = [
    ...body.metadata.inputs.map(client_pin_body),
    ...body.metadata.outputs.map(client_pin_body),
    ...(body.metadata.flows ?? []).map(client_pin_body)
  ]
  const node: GraphNode = {
    nodeIndex: body.unique_index,
    genericId: {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Client,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId: body.metadata.genericId
    },
    concreteId: {
      class: NodeGraph_Id_Class.SystemDefined,
      type: NodeProperty_Type.Client,
      kind: NodeGraph_Id_Kind.SysCall,
      nodeId: Number(body.metadata.concreteId)
    },
    pins,
    x: body.x * 300,
    y: body.y * 200,
    usingStruct: []
  }
  if (
    body.metadata.specialKind === 'start' &&
    body.metadata.subType.startsWith('creation_status')
  ) {
    node.statusNodeExtension = { type: 1, inner: { value: 1 } }
  }
  return node
}

export { node_connect_from, node_connect_to }
```

- [ ] **Step 2: Add client dictionary and faction-list mapping support**

Modify `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.ts` in `get_id_client`:

```ts
case 'd':
  return ClientVarType.Dictionary_
case 'l':
  if (node.i.t === 'b' && node.i.b === 'Fct') return 25
```

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: build passes.

- [ ] **Step 4: Commit**

```powershell
git add src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.ts
git commit -m "feat: add client GIA body helpers"
```

### Task 9: Add Client IR To GIA Transform

**Files:**

- Create: `src/compiler/ir_to_gia_transform/client_graph.ts`
- Modify: `src/compiler/ir_to_gia_transform/index.ts`
- Modify: `src/compiler/gia_vendor.ts`

- [ ] **Step 1: Export client helpers**

Modify `src/compiler/gia_vendor.ts`:

```ts
export {
  client_graph_body,
  client_node_body,
  node_connect_from as client_node_connect_from,
  node_connect_to as client_node_connect_to
} from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.js'

export {
  getClientGraphEncoding,
  CLIENT_GRAPH_ENCODING_BY_SUB_TYPE
} from '../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.js'
```

- [ ] **Step 2: Create client graph transform**

Create `src/compiler/ir_to_gia_transform/client_graph.ts`:

```ts
import { loadGiaProto } from '../../injector/proto.js'
import { resolveGraphIdForGraph } from '../../runtime/graph_defaults.js'
import type { ClientIRDocument } from '../../runtime/IR.js'
import {
  client_graph_body,
  client_node_body,
  client_node_connect_from,
  client_node_connect_to,
  getClientGraphEncoding,
  wrap_gia,
  type Root as GiaRoot
} from '../gia_vendor.js'
import { resolveClientNodeMetadata } from './client_nodes.js'
import type { IrToGiaOptions } from './index.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import type { NodeId } from './types.js'

export function clientIrToGia(ir: ClientIRDocument, opts: IrToGiaOptions): Uint8Array {
  const graphId = opts.graphId ?? resolveGraphIdForGraph(ir.graph)
  const name = opts.name ?? ir.graph.name ?? '_GSTS_Generated_Client_Graph'
  const uid = opts.uid ?? 100000001
  const nodes = ir.nodes ?? []
  if (!nodes.length) throw new Error('IR document must have at least one node')

  const graphInfo = buildExecutionGraph(nodes)
  const positions = layoutPositions(nodes, graphInfo)
  const builtById = new Map<NodeId, ReturnType<typeof client_node_body>>()

  for (const irNode of nodes) {
    const metadata = resolveClientNodeMetadata(ir.graph.sub_type, irNode)
    const pos = positions.get(irNode.id) ?? [0, 0]
    const node = client_node_body({
      metadata,
      unique_index: irNode.id,
      x: pos[0] / 300,
      y: pos[1] / 200
    })
    builtById.set(irNode.id, node)
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.flowConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client flow connection ${fromId}->${toId}`)
    from.pins.push({
      i1: { kind: 2, index: fromIndex },
      i2: { kind: 2, index: fromIndex },
      value: undefined,
      type: undefined,
      connects: [client_node_connect_to(to.nodeIndex, toIndex)]
    })
  }

  for (const { fromId, toId, fromIndex, toIndex } of graphInfo.dataConnections) {
    const from = builtById.get(fromId)
    const to = builtById.get(toId)
    if (!from || !to) throw new Error(`[error] bad client data connection ${fromId}->${toId}`)
    const pin = to.pins.find((p) => p.i1?.kind === 3 && p.i1.index === toIndex)
    if (!pin) throw new Error(`[error] missing client input pin ${toId}.${toIndex}`)
    pin.connects = [client_node_connect_from(from.nodeIndex, fromIndex)]
  }

  const encoding = getClientGraphEncoding(ir.graph.sub_type)
  const root: GiaRoot = client_graph_body({
    uid,
    graph_id: graphId,
    graph_name: name,
    graphType: encoding.graphType,
    graphWhich: encoding.graphWhich,
    nodes: [...builtById.values()]
  })

  const { rootMessage } = loadGiaProto(opts.protoPath)
  return new Uint8Array(wrap_gia(rootMessage, root))
}
```

- [ ] **Step 3: Export options type from server transform**

Modify `src/compiler/ir_to_gia_transform/index.ts`:

```ts
export interface IrToGiaOptions {
  graphId?: number
  uid?: number
  name?: string
  protoPath: string
  optimize?: IrToGiaOptimizeOptions
}
```

- [ ] **Step 4: Dispatch client IR**

Replace the Task 7 fail-fast guard at the start of `irToGia` in
`src/compiler/ir_to_gia_transform/index.ts` with the real dispatch:

```ts
if (ir.graph.type === 'client') {
  return clientIrToGia(ir, opts)
}
```

Import:

```ts
import { clientIrToGia } from './client_graph.js'
```

- [ ] **Step 5: Run build**

Run:

```powershell
npm run build
```

Expected: build passes.

- [ ] **Step 6: Commit**

```powershell
git add src/compiler/gia_vendor.ts src/compiler/ir_to_gia_transform/client_graph.ts src/compiler/ir_to_gia_transform/index.ts
git commit -m "feat: compile client IR to GIA"
```

### Task 10: Extract Minimal Start/End Metadata And Compile A Minimal Client GIA

Without this task, Phase 3 can only be reviewed structurally, because
`CLIENT_NODE_METADATA` is still empty and `resolveClientNodeMetadata` cannot resolve even
`node_graph_begins`. This task extracts just enough real metadata to prove the Phase 3
transform end to end.

**Files:**

- Modify: `scripts/client-nodegraph/extract-client-node-metadata.ts`
- Create: `scripts/client-nodegraph/smoke-minimal-client-gia.ts`
- Output: `resources/client_node_metadata.json`
- Output: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`
- Output: `tests/client_generated/minimal_*.gia`

- [ ] **Step 1: Extract minimal metadata records**

Extend the extractor with a minimal pass that decodes samples and emits metadata records
for exactly these nodes, per family where they exist:

- the graph start node (`node_graph_begins`) for all six families, including the observed
  `statusNodeExtension` payload for `creation_status` and `creation_status_decision`
- `node_graph_end_boolean` for `bool_filter`
- `node_graph_end_integer` for `int_filter`

Each record must carry real `genericId`, `concreteId`, `graphType`, pins, and
`sampleFile`, following the `ClientNodeMetadata` shape. Write them to
`resources/client_node_metadata.json`. Full extraction of all other nodes stays in
Phase 4.

- [ ] **Step 2: Regenerate modules**

Run:

```powershell
npm run gen:client
npm run build
```

Expected: `client_node_metadata.ts` now contains the minimal records (metadata count > 0).

- [ ] **Step 3: Add minimal GIA smoke with header round-trip**

Create `scripts/client-nodegraph/smoke-minimal-client-gia.ts` that:

1. Builds one hand-written start-node-only `ClientIRDocument` per family (six documents).
2. Compiles each through `irToGia`.
3. Decodes each produced `.gia` back with the proto and asserts the graph header matches
   the family encoding: `GraphUnit.id.type = ClientGraph`, `which`, and inner
   `NodeGraph.id.type` equal the values in `CLIENT_GRAPH_ENCODING_BY_SUB_TYPE`, and the
   start node `genericId`/`concreteId` match the metadata record.
4. Writes outputs to `tests/client_generated/minimal_<sub_type>.gia` and prints one `[ok]`
   line per family.

Run:

```powershell
node --import tsx ./scripts/client-nodegraph/smoke-minimal-client-gia.ts
```

Expected: six `[ok]` lines, no server-path imports involved.

- [ ] **Step 4: Commit**

```powershell
git add scripts/client-nodegraph/extract-client-node-metadata.ts scripts/client-nodegraph/smoke-minimal-client-gia.ts resources/client_node_metadata.json src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts tests/client_generated
git commit -m "feat: compile minimal client graphs from extracted start metadata"
```

### Phase 3 Review Gate

- [ ] Present client compiler branch diff.
- [ ] Present confirmation that client compiler does not import server `node_id.ts`.
- [ ] Present current unsupported special-node behavior.
- [ ] Present minimal client `.gia` smoke output and decoded header round-trip result.
- [ ] Present build result.
- [ ] Wait for user approval before Phase 4.

---

## Phase 4: Full Metadata Extraction And Runtime Definitions

Stop for user review after this phase.

### Task 11: Replace Placeholder Extraction With Real Node Metadata Extraction

**Files:**

- Modify: `scripts/client-nodegraph/extract-client-node-metadata.ts`
- Output: `resources/client_node_metadata.json`
- Output: `tests/client_generated/_coverage_gaps.json`
- Output: `tests/client_generated/_report.json`

- [ ] **Step 1: Decode GIA samples**

Extend the extractor to load `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto` through the existing proto loader:

```ts
import { loadGiaProto } from '../../src/injector/proto.js'

const { rootMessage } = loadGiaProto(
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'
)

function decodeGia(file: string): unknown {
  const bytes = fs.readFileSync(file)
  return rootMessage.decode(bytes)
}
```

- [ ] **Step 2: Extract node identity and pins**

For each decoded root, read:

```ts
const graphUnit = decoded.graph
const graph = graphUnit.graph?.inner?.graph
const nodes = graph?.nodes ?? []
```

For each node, extract:

```ts
{
  subType,
  nodeType: normalizedDisplayName,
  displayName,
  graphType: graph.id.type,
  genericId: node.genericId.nodeId,
  concreteId: node.concreteId.nodeId,
  inputs,
  outputs,
  flows,
  specialKind,
  sampleFile
}
```

Normalize names with:

```ts
function normalizeNodeType(name: string): string {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}
```

- [ ] **Step 3: Mark explicit gap kinds**

When decoded pins or values show unsupported forms, assign:

```ts
specialKind: 'inline_var_type_hint'
specialKind: 'structure_list_unknown_binding' // only when extractor cannot represent a concrete structure-list binding
```

Write those nodes to `tests/client_generated/_coverage_gaps.json`:

```json
{
  "unsupportedSpecialKinds": ["inline_var_type_hint", "structure_list_unknown_binding"],
  "nodes": []
}
```

- [ ] **Step 4: Run generator and build**

Run:

```powershell
npm run gen:client
npm run build
```

Expected: both pass; report includes non-zero metadata count.

- [ ] **Step 5: Commit**

```powershell
git add scripts/client-nodegraph/extract-client-node-metadata.ts resources/client_node_metadata.json tests/client_generated/_coverage_gaps.json tests/client_generated/_report.json src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts
git commit -m "feat: extract client node metadata from samples"
```

### Task 12: Add Client Literal Value Encoding With Round-Trip Verification

Typed literal input pins are first-pass supported behavior, but `client_basic.ts` only
writes empty values so far. This task makes literal `VarBase` encoding per
`ClientVarType` explicit, evidence-driven, and verified by decode round-trip.

**Files:**

- Modify: `scripts/client-nodegraph/extract-client-node-metadata.ts`
- Modify: `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts`
- Modify: `src/shared/client_capability_errors.ts`
- Create: `scripts/client-nodegraph/check-client-value-roundtrip.ts`
- Output: `tests/client_generated/_value_shapes.json`
- Output: `tests/client_generated/_value_roundtrip.json`

- [ ] **Step 1: Collect observed literal value shapes**

Extend the extractor to record, for every input pin with `alreadySetVal = true`, the
observed `VarBase` structure grouped by `clientVarType` (bool, int, float, string,
vector3, entity-like references, dictionary `24`, faction list `25`, and any others
found). Write the per-type shape census with sample references to
`tests/client_generated/_value_shapes.json`.

- [ ] **Step 2: Implement client literal value encoding**

Add `client_literal_value(pin, value)` to `client_basic.ts` covering exactly the
`ClientVarType` values whose shapes are proven by `_value_shapes.json`. Wire it into
`client_pin_body` for pins that carry literal arguments.

Add a stable error code `VALUE_TYPE_UNAVAILABLE: 'CLIENT_VALUE_TYPE_UNAVAILABLE'` to
`CLIENT_ERROR_CODES` and throw it for any `ClientVarType` without proven shape evidence.
Do not borrow server `VarBase` construction for unproven client types.

- [ ] **Step 3: Add round-trip check**

Create `scripts/client-nodegraph/check-client-value-roundtrip.ts` that, for each
supported `ClientVarType`, builds a literal pin via `client_pin_body` +
`client_literal_value`, encodes it with the proto, decodes it back, and compares the
structure field-by-field against the observed sample shape (ignoring the literal value
itself). Write results to `tests/client_generated/_value_roundtrip.json`; the script must
fail on any mismatch or on a supported type without a round-trip case.

Run:

```powershell
node --import tsx ./scripts/client-nodegraph/check-client-value-roundtrip.ts
```

Expected: one `[ok]` line per supported `ClientVarType`.

- [ ] **Step 4: Commit**

```powershell
git add scripts/client-nodegraph/extract-client-node-metadata.ts scripts/client-nodegraph/check-client-value-roundtrip.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts src/shared/client_capability_errors.ts tests/client_generated
git commit -m "feat: encode client literal pin values from sample evidence"
```

### Task 13: Define Reflect/Generic Variant Resolution Rules

Client nodes carry a `genericId`/`concreteId` pair, and reflective nodes have multiple
concrete variants per generic node. The resolver must pick variants deterministically
from metadata instead of guessing.

**Files:**

- Modify: `scripts/client-nodegraph/extract-client-node-metadata.ts`
- Modify: `src/compiler/ir_to_gia_transform/client_nodes.ts`
- Output: `tests/client_generated/_reflect_resolution.json`

- [ ] **Step 1: Derive variant records from samples**

Extend the extractor to group decoded nodes by `subType + genericId`. When one generic id
appears with multiple concrete ids, emit a `reflectMap` on the metadata record where each
entry carries the `concreteId`, a `variantKey` derived from the ordered pin
`clientVarType` vector (or the reflective pin's concrete type), and the variant pins.

- [ ] **Step 2: Implement deterministic resolution**

In `resolveClientNodeMetadata` (or a dedicated `resolveClientConcreteVariant` beside it),
apply these rules in order:

1. Exact `subType + nodeType` lookup; if the record has no `reflectMap`, use its
   `concreteId` directly.
2. If the record has a `reflectMap`, compute the variant key from the IR node's argument
   types and select the matching entry.
3. No match or multiple matches: throw a stable client error that includes the
   `genericId`, the computed key, and the candidate variant keys. Never fall back to
   server tables and never pick a "closest" variant.

- [ ] **Step 3: Report resolution coverage**

Write `tests/client_generated/_reflect_resolution.json` from the extractor: every
multi-variant generic id, its derivable variant keys, and any node marked
`needs_developer_confirmation` because a variant key cannot be derived mechanically from
samples. For those nodes, stop and ask the developer instead of guessing; the compiler
must reject them with a stable error until confirmed.

- [ ] **Step 4: Run build and targeted verification**

Run:

```powershell
npm run gen:client
npm run build
```

Expected: build passes; `_reflect_resolution.json` lists no silent unresolved variants.

- [ ] **Step 5: Commit**

```powershell
git add scripts/client-nodegraph/extract-client-node-metadata.ts src/compiler/ir_to_gia_transform/client_nodes.ts tests/client_generated
git commit -m "feat: resolve client reflect variants deterministically"
```

### Task 14: Derive Client Scoped Helper Global Capability

**Files:**

- Modify: `scripts/client-nodegraph/generate-client-nodegraph-modules.ts`
- Output: `resources/client_scoped_globals_capability.json`
- Output: `src/definitions/client_scoped_globals.ts`
- Create: `src/runtime/client_scoped_globals.ts`
- Modify: `src/runtime/core.ts`
- Create: `src/eslint/rules/client-scoped-globals.ts`
- Modify: `src/eslint/index.ts`
- Modify: `scripts/client-nodegraph/fixtures/client_api_types.ts`
- Modify: `scripts/client-nodegraph/fixtures/basic_client_graphs.ts`

- [ ] **Step 1: Generate helper capability from resource JSON**

After `resources/client_node_metadata.json` and
`resources/client_execution_flow_metadata.json` are populated, derive a dedicated
helper capability report:

```ts
type ClientScopedGlobalCapability = {
  helper:
    | 'send'
    | 'player'
    | 'self'
    | 'stage'
    | 'level'
    | 'Mathf'
    | 'Random'
    | 'Vector3'
    | 'GameObject'
  member?: string
  subTypes: ClientGraphSubType[]
  modes: ClientGraphMode[]
  backedBy: Array<{
    subType: ClientGraphSubType
    nodeType: string
    methodName: string
    sampleFile: string
  }>
  status: 'supported' | 'partial' | 'needs_developer_confirmation' | 'gap'
  note?: string
}
```

The generator must use generated resource JSON as evidence. File names, server
method names, and manual guesses may help investigation, but cannot be accepted
as implementation proof.

- [ ] **Step 2: Include all planned helper families**

The capability report must cover:

```text
send(...)
player(id)
self
stage / level
Mathf
Random
Vector3
GameObject
```

Partial support is allowed and expected. For example, `Mathf` and `Vector3` may
only expose members backed by actual client nodes, and `stage` / `level` may only
exist in client graph families where a compatible "get level/stage entity" node
is proven.

- [ ] **Step 3: Stop on uncertain semantic equivalence**

If a resource JSON entry has a similar name but the parameter list, return type,
or runtime meaning is not clearly equivalent to the proposed helper member, mark
it as `needs_developer_confirmation` and do not implement the member yet.

Examples that require explicit confirmation if metadata does not prove
equivalence:

- `player(id)` when client nodes return character/player-related entities but
  not the same entity concept as server `player(id)`.
- `GameObject.FindWithTag` when only a list-returning tag query is proven.
- Any timer-like or cooldown-like node that is not equivalent to JavaScript-style
  `setTimeout` / `setInterval`.

- [ ] **Step 4: Generate type-facing helper definitions**

Generate `src/definitions/client_scoped_globals.ts` from the capability report.
The generated types must expose helper members only for supported
`SubType + Mode` combinations. Unsupported helpers should be absent from the
type surface instead of present with unusable overloads.

- [ ] **Step 5: Install scoped client helper globals at runtime**

Implement `installScopedClientGlobals(subType, mode)` in
`src/runtime/client_scoped_globals.ts` and call it from the client handler path in
`src/runtime/core.ts`.

Runtime behavior:

- Install only helpers supported by the current `ClientGraphSubType + mode`.
- Restore previous globals after the handler exits, matching server scoped global
  restoration behavior.
- Reject dynamically reached unsupported helper/member calls with stable client
  errors that include helper name, current subType, and current mode.
- Do not install server-only timer helpers unless resource JSON proves a
  compatible client timer feature and the developer confirms the mapping.

- [ ] **Step 6: Add ESLint guards for unsupported helper patterns**

Add a client scoped globals ESLint rule for source patterns that TypeScript
cannot reliably prevent. The rule must reject helper use when the current client
graph family or mode cannot support it, including partial helper members such as
unsupported `Mathf.*`, `Vector3.*`, `Random.*`, or `GameObject.*` members.

The rule should produce actionable messages:

```text
[client scoped globals] Vector3.ClampMagnitude is not available in bool_filter classic mode
```

- [ ] **Step 7: Add type and runtime smokes**

Update client API fixtures so they cover:

- supported helpers in at least one compatible graph family
- partial helpers omitted in incompatible families
- dynamic runtime rejection for unsupported helpers
- no server timer globals in client handlers unless explicitly proven later

- [ ] **Step 8: Run generation and checks**

Run:

```powershell
npm run gen:client
npm run build
node --import tsx dist/src/compiler/gs_to_ir_json_transform/runner.js scripts/client-nodegraph/fixtures/basic_client_graphs.ts tests/client_generated/basic_client_graphs.ir.json
```

Do not run `npm test` in this phase unless the developer explicitly asks for it.

- [ ] **Step 9: Commit**

```powershell
git add scripts/client-nodegraph/generate-client-nodegraph-modules.ts resources/client_scoped_globals_capability.json src/definitions/client_scoped_globals.ts src/runtime/client_scoped_globals.ts src/runtime/core.ts src/eslint/rules/client-scoped-globals.ts src/eslint/index.ts scripts/client-nodegraph/fixtures/client_api_types.ts scripts/client-nodegraph/fixtures/basic_client_graphs.ts
git commit -m "feat: add client scoped helper globals capability"
```

### Task 15: Generate Full Client Method Definitions From Official Docs And Sample Metadata

Supersedes the original "server-intersection projection" Task 15 (`12e04e9`). Sources of
truth, in order:

1. `resources/client_node_metadata.json`: sample-proven pins, `clientVarType`, flows,
   `genericId`/`concreteId`, `reflectMap`. Owns everything the compiler needs.
2. `resources/node_definitions.json` `client_*` and `detail_*` categories: official
   bilingual names, descriptions, and parameter docs. Owns method naming (en-us) and
   user-facing JSDoc (both languages).
3. Server signatures in `src/definitions/nodes.ts`: drift cross-check only, never a
   generation source.

Rules inherited from `docs/maintenance/routine-node-maintenance.md` (server maintenance
learned these the hard way; the client generator must obey them from day one):

- Never align zh-cn and en-us doc arrays by index; the arrays are misordered.
- Official zh names verbatim; no re-translation.
- Pin names are wire identifiers, not user documentation; JSDoc text comes from doc
  `description`/`functions`, with type-aware manual wording only where docs are empty.
- Doc `Generic` params keep project value-type wrappers (`T[]`, `dict<K, V>`) derived
  from metadata evidence, not degraded to `generic` for the sake of matching docs.

**Files:**

- Modify: `scripts/client-nodegraph/extract-client-node-metadata.ts`
- Modify: `scripts/client-nodegraph/generate-client-nodegraph-modules.ts`
- Create: `src/definitions/client_nodes.ts` (generated full client classes)
- Modify: `src/definitions/nodes.ts` (remove empty client shells / `ClientMethodsOf`)
- Modify: `src/runtime/client_graph_support.ts` and other client class import sites
- Modify: `scripts/check-client-definitions-consistency.ts`
- Output: `resources/client_node_metadata.json` (regenerated with English nodeTypes)
- Output: `resources/client_execution_flow_metadata.json` (full whitelist, doc-backed)
- Output: `src/definitions/client_method_modes.ts` (regenerated)
- Output: `tests/client_generated/_doc_name_alignment.json`
- Output: `tests/client_generated/_server_drift.json`

- [ ] **Step 0: Build the official zh/en name alignment table**

For every `*_zh-cn` / `*_en-us` page pair in `client_*` and `detail_*` categories, align
nodes per section (never across sections, never by index):

1. Compute a parameter fingerprint per node (ordered `io + normalized data_type`,
   tolerant of doc typos like `Emtity`, `Paraneter`, `Enumerationd`).
2. Match nodes whose fingerprint is unique within the section; repeat by elimination
   until a fixpoint.
3. Aggregate matches globally across page pairs with majority vote; near-duplicate en
   spellings (curly quotes, casing) normalize to one canonical form.
4. Remaining groups with identical fingerprints (comparator/logic/trig clusters) may be
   resolved by a small seed dictionary committed in the script; every seed entry must be
   validated against the section's unmatched en pool and fail loudly when absent, so a
   wrong seed cannot silently mis-map.
5. Write `tests/client_generated/_doc_name_alignment.json` with the zh->en table, match
   provenance (fingerprint / elimination / seed), match rate, and an unresolved list.
   Unresolved names stay `needs_developer_confirmation`: keep their Chinese `nodeType`,
   generate no method, and let the compiler keep rejecting them.

- [ ] **Step 1: Regenerate metadata with English nodeTypes**

Wire the alignment table into the extractor's `englishNodeType` chain (official client
en name first, then existing server zh->en fallbacks). `nodeType` normalization keeps
the existing rules including the leading-underscore digit rule
(`3D Vector Subtraction` -> `_3d_vector_subtraction`). Regenerate
`resources/client_node_metadata.json` and rerun `npm run gen:client`; the missing
English-name report must shrink to exactly the unresolved list from Step 0.

- [ ] **Step 2: Generate the full execution-flow metadata**

Rewrite `deriveClientExecutionFlowMetadata` to walk metadata records (not server
signatures). For every record that is not `specialKind: start` and not an unsupported
special kind, emit:

```ts
type ClientExecutionFlowMetadata = {
  methodName: string // camelCase of the en nodeType
  nodeType: string
  subTypes: ClientGraphSubType[]
  modes: ClientGraphMode[] // still ['beyond'] until classic evidence exists
  kind: 'data' | 'exec' | 'control_flow'
  params: Array<{ name: string; irType: string; docZh: string; docEn: string }>
  returns: Array<{ name: string; irType: string; docZh: string; docEn: string }> | null
  docs: { en: string; zh: string } // from official doc name + functions/description
  reflect?: { variantKeys: string[] }
}
```

Param mapping: metadata input pins are the signature source (`clientVarType` -> IR value
type via the existing table); doc parameters contribute names and descriptions. Leading
selector `enum` pins that docs do not list are skipped from the public signature but
recorded. When pin count and doc param count cannot be reconciled mechanically, write
the record to the alignment gap report and mark it `needs_developer_confirmation`
instead of guessing.

- [ ] **Step 3: Generate full client classes**

Generate `src/definitions/client_nodes.ts` containing six family classes with real
methods, replacing the empty shells and the `ClientMethodsOf` server projection in
`nodes.ts` (update import sites such as `client_graph_support.ts`). Every method has:

- bilingual JSDoc from official docs (en text, zh text, `@param`/`@returns` both
  languages), server-JSDoc formatting conventions
- a real signature using project value types (`IntValue`, `FloatValue`, `Vec3Value`,
  entity/list/dict wrappers); reflect records emit typed overloads per proven
  `reflectMap` variant keys, mirroring server `addition`-style overloads
- a real body: `parseValue` per arg, `this.registry.registerNode({ id: 0, type,
  nodeType, args })`, `markPin` on the first output pin, matching server body style
- control-flow nodes (`double_branch`, `finite_loop`, `traverse_entity_list`,
  `multiple_branches`, `break_loop`) generated with callback params and
  `withExecBranch` + `client_<sub_type>_if` / `client_<sub_type>_loop` /
  `client_<sub_type>_switch` ctx names per the spec, not server ctx names

Methods whose params/returns need types without proven runtime wrappers stay ungenerated
and land in the gap report. `client_method_modes.ts` regenerates from the full
metadata so ESLint/runtime maps stay in sync.

- [ ] **Step 4: Server drift cross-check**

For every client method whose `nodeType` also exists as a server method, compare param
count, param IR types, and return IR type against the server signature. Write
`tests/client_generated/_server_drift.json` listing agreements and divergences with
sample/doc references. Divergences are informational (client docs + samples win), but
each one must be visible for review, not silently absorbed.

- [ ] **Step 5: Re-derive Task 14 scoped-globals capability**

Rerun the scoped-globals derivation on the regenerated metadata. Newly English-named
client-only nodes may flip `needs_developer_confirmation` entries (for example
`获取随机数` -> `get_random_number`) to evidence-backed; update
`resources/client_scoped_globals_capability.json` and generated definitions, and list
every status change in the review gate.

- [ ] **Step 6: Update consistency checks and verify**

Update `scripts/check-client-definitions-consistency.ts` to assert:

- every generated method maps to a metadata record per subType (existing check)
- every non-start, non-gap metadata record with an English nodeType has a generated
  method (new inverse check)
- no Chinese-typed record is exposed as a method

Run:

```powershell
npm run gen:client
npm run build
node --import tsx ./scripts/check-client-definitions-consistency.ts
node --import tsx ./scripts/client-nodegraph/smoke-minimal-client-gia.ts
```

Extend the smoke (or add a sibling) so each family compiles at least one graph calling a
doc-named client-only method (for example an attachment-point hitbox node) through
IR -> GIA -> decode with node identity assertions.

- [ ] **Step 7: Commit**

```powershell
git add scripts/client-nodegraph scripts/check-client-definitions-consistency.ts resources/client_node_metadata.json resources/client_execution_flow_metadata.json resources/client_scoped_globals_capability.json src/definitions/client_nodes.ts src/definitions/client_method_modes.ts src/definitions/client_scoped_globals.ts src/definitions/nodes.ts src/runtime/client_graph_support.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts tests/client_generated
git commit -m "feat: generate full client method definitions from official docs"
```

### Phase 4 Review Gate

- [ ] Present metadata count.
- [ ] Present method count per subtype.
- [ ] Present the doc name alignment report: match rate, provenance split
      (fingerprint/elimination/seed), and the unresolved `needs_developer_confirmation` list.
- [ ] Present the server drift report and each divergence.
- [ ] Present scoped-globals capability status changes caused by re-derivation.
- [ ] Present literal value shape census and round-trip check result per `ClientVarType`.
- [ ] Present reflect variant resolution report and any `needs_developer_confirmation` variants.
- [ ] Present client scoped helper globals capability report.
- [ ] Present helper gaps and any `needs_developer_confirmation` entries.
- [ ] Present gap report.
- [ ] Present consistency check result.
- [ ] Wait for user approval before Phase 5.

---

## Phase 5: Client TS Transform And Entry Detection

Stop for user review after this phase.

### Task 16: Add Client TS Transform And Entry Detection

**Files:**

- Modify: `src/compiler/ts_to_gs_transform/matcher.ts`
- Modify: `src/compiler/ts_to_gs_transform/index.ts`
- Modify: `src/compiler/ts_to_gs_pipeline.ts`
- Modify: `src/compiler/ts_to_gs_transform/types.ts`
- Modify shared transform files only where client handler support needs existing statement/expression lowering.
- Create: `scripts/client-nodegraph/fixtures/client_ts_transform.ts`

- [ ] **Step 1: Generalize graph entry detection**

Replace server-only entry detection with graph-entry detection that recognizes:

```ts
g.server(...).on(event, handler)
g.server(...).onSignal(signal, handler)
g.characterSkill(options?).on('start', handler)
g.creationSkill(options?).on('start', handler)
g.creationStatus(options?).on('start', handler)
g.creationStatusDecision(options?).on('start', handler)
g.boolFilter(options?).on('start', handler)
g.intFilter(options?).on('start', handler)
```

The public client shape must stay `.on('start', handler)`. If another shape looks
useful while implementing, stop and ask the developer to confirm before adding it.

- [ ] **Step 2: Transform supported TypeScript inside client handlers**

Route client handlers through the existing statement/expression transform so
supported `if`, `for`, `switch`, `break`, `continue`, `return`, list operations,
and local variable lowering work in client graph code.

The transform must carry client graph context:

```ts
graphDocumentType: 'client'
clientSubType: ClientGraphSubType
clientMode: ClientGraphMode
```

Use that context to reject unsupported client capabilities instead of silently
emitting server-only calls.

- [ ] **Step 3: Preserve server-only semantics**

Keep `gstsServer*` support server-only unless a separate client reusable-function
design is approved. If users call `gstsServer*` from client handlers, emit a
clear transform error.

Do not introduce a `gstsClient*` function family in this phase. If reusable
client functions are needed, pause and ask the developer to confirm syntax,
subtype/mode behavior, and review scope.

- [ ] **Step 4: Entry marker support**

Update `hasEntryMarker` producers by ensuring `.gs.ts` files containing only
client entries still receive `// @gsts:entry`. Mixed server/client files should
produce one entry-marked `.gs.ts` file and later emit all registered IR documents.

- [ ] **Step 5: Add transform fixture**

Create a fixture that uses client entry APIs with:

- an `if` lowered to the client `doubleBranch` path where supported
- a loop lowered only in client graph families that support loop nodes
- a bool filter return
- an int filter return
- a rejected server-only `gstsServer*` use from a client handler

For any uncertain supported control-flow form, leave the fixture pending and ask
the developer to confirm before implementing that form.

- [ ] **Step 6: Run targeted transform verification**

Run:

```powershell
npm run build
node ./bin/gsts.mjs scripts/client-nodegraph/fixtures/client_ts_transform.ts --noinject
```

Do not run `npm test` unless the developer explicitly asks for it.

- [ ] **Step 7: Commit**

```powershell
git add src/compiler/ts_to_gs_transform src/compiler/ts_to_gs_pipeline.ts scripts/client-nodegraph/fixtures/client_ts_transform.ts
git commit -m "feat: compile client graph handlers through ts transform"
```

### Phase 5 Review Gate

- [ ] Present TS transform fixture output.
- [ ] Present entry marker behavior for client-only and mixed server/client files.
- [ ] Present any unsupported client syntax still pending developer confirmation.
- [ ] Wait for user approval before Phase 6.

---

## Phase 6: Client CLI Batch And Dev Workflow

Stop for user review after this phase.

### Task 17: Add Client CLI Batch And Dev Integration

**Files:**

- Modify: `src/cli/gsts.ts`
- Modify: `src/compiler/gs_to_ir_json_transform/index.ts`
- Modify: `src/compiler/gs_to_ir_json_transform/runner.ts`
- Modify: `src/compiler/ir_merge.ts` only if mixed server/client batch behavior needs a discovered fix.
- Create: `scripts/client-nodegraph/fixtures/mixed_server_client_entries.ts`

- [ ] **Step 1: Verify batch mode with client-only entries**

Ensure `gsts -c ... --noinject` compiles client-only entries from TS source to
`.gs.ts`, `.json`, and `.gia` through the same batch path as server entries.

- [ ] **Step 2: Verify mixed server/client files**

Ensure a file containing both `g.server(...)` and client graph entries emits all
IR documents and that merge rules preserve:

- no duplicate server/client graph id
- no incompatible client subtype merge
- no incompatible client mode merge

- [ ] **Step 3: Verify dev watch dependency behavior**

Ensure dev watch tracks client entries and their local imports. A dependency
change should recompile and re-emit affected client GIA files the same way it
does for server entries.

- [ ] **Step 4: Keep no separate client workflow**

Do not add a separate `gsts client ...` command unless the developer explicitly
requests it. Client graph support should work through the existing compile,
build, dev, and injection flow.

- [ ] **Step 5: Add CLI fixtures and smoke**

Add a mixed server/client fixture and a focused smoke command. The smoke should
not require injection.

- [ ] **Step 6: Commit**

```powershell
git add src/cli/gsts.ts src/compiler/gs_to_ir_json_transform scripts/client-nodegraph/fixtures/mixed_server_client_entries.ts package.json
git commit -m "feat: support client graphs in cli batch flow"
```

### Phase 6 Review Gate

- [ ] Present client-only CLI batch smoke output.
- [ ] Present mixed server/client entry smoke output.
- [ ] Present dev watch dependency behavior evidence or the reason it needs manual follow-up.
- [ ] Wait for user approval before Phase 7.

---

## Phase 7: Client Injection And Signal Integration

Stop for user review after this phase.

### Task 18: Add Client Injector, Graph Type, And Signal Patch Support

**Files:**

- Modify: `src/injector/index.ts`
- Modify: `src/injector/folder.ts`
- Modify: `src/injector/signal_nodes.ts`
- Modify: `src/cli/gil_signals.ts`
- Modify: `src/i18n/locales/en-US/main.json`
- Modify: `src/i18n/locales/zh-CN/main.json`
- Create or update focused injector/signal smoke fixtures.

- [ ] **Step 1: Add client graph type names and safety checks**

Teach injector warnings and folder-category checks about client graph types:

```text
20001 bool_filter
20002 character_skill
20006 int_filter
20007 creation_status_decision
20008 creation_skill
20009 creation_status
```

If folder category values for these graph types are uncertain, stop and verify
from local map data or ask the developer to confirm before hard-coding them.

- [ ] **Step 2: Verify target graph replacement path**

Ensure client GIA injection can locate and replace a saved client graph by id
without tripping the server-only path expectation check.

- [ ] **Step 3: Verify client-to-server signal node id patching**

For client `send(...)` / "send to server node graph" support, prove the signal
node id patch path using resource JSON and map signal data. Do not assume server
`send_signal` or `monitor_signal` placeholders are valid for client send-server
nodes without evidence.

- [ ] **Step 4: Verify signal resource extraction**

Confirm `src/cli/gil_signals.ts` extracts signal definitions needed by client
send-server nodes and that `Signal.xxx` typing works for client helper usage.

If signal parameter encoding differs for client send-server nodes, mark it as a
gap and ask the developer to confirm expected behavior before implementation.

- [ ] **Step 5: Commit**

```powershell
git add src/injector src/cli/gil_signals.ts src/i18n/locales/en-US/main.json src/i18n/locales/zh-CN/main.json
git commit -m "feat: support client graph injection metadata"
```

### Phase 7 Review Gate

- [ ] Present client graph type/folder mapping evidence.
- [ ] Present target graph replacement result.
- [ ] Present signal patch and signal resource extraction result, or list cases needing developer confirmation.
- [ ] Wait for user approval before Phase 8.

---

## Phase 8: Published Types, Zh Aliases, And Client Scoped Globals

Stop for user review after this phase.

### Task 19: Add Client Published Types And Zh Aliases

**Files:**

- Modify: `src/runtime/server_globals.d.ts` only if shared declarations need wording updates.
- Create: `src/runtime/client_globals.d.ts`
- Modify: `scripts/postbuild.mjs`
- Modify: `types/gsts/index.d.ts`
- Modify: `scripts/generate-zh-aliases.mjs`
- Modify: `src/definitions/zh_aliases.ts`
- Modify: client generated definitions as needed.

- [ ] **Step 1: Add client global/helper declaration file**

Add a client-facing declaration file for:

- `gsts.fCharacterSkill`
- `gsts.fCreationSkill`
- `gsts.fCreationStatus`
- `gsts.fCreationStatusDecision`
- `gsts.fBoolFilter`
- `gsts.fIntFilter`
- client scoped helper globals proven by capability (`send`, `self`, `Mathf`, etc.)

Do not silently reuse server-only global declarations for client helper support.

- [ ] **Step 2: Update published type entry**

Update `postbuild.mjs` and `types/gsts/index.d.ts` so package consumers receive
client global declarations after build/pack.

- [ ] **Step 3: Generate client zh aliases**

Extend zh alias generation to include client method aliases and client start
event aliases. The zh name source is the official bilingual alignment table
(`tests/client_generated/_doc_name_alignment.json` backed by
`resources/node_definitions.json`), not sample file names and not index-based
zh/en array pairing. If a Chinese display name cannot be converted to a stable
identifier, write it to the alias report and ask the developer before choosing
a manual alias.

- [ ] **Step 4: Add import/type smoke**

Add a package-style type smoke proving client globals and aliases are visible to
consumers through `genshin-ts`.

- [ ] **Step 5: Commit**

```powershell
git add src/runtime/client_globals.d.ts scripts/postbuild.mjs types/gsts/index.d.ts scripts/generate-zh-aliases.mjs src/definitions/zh_aliases.ts
git commit -m "feat: publish client graph global types"
```

### Phase 8 Review Gate

- [ ] Present client global declaration paths and generated package type entry.
- [ ] Present client zh alias generation report.
- [ ] Present helper global runtime/type smoke output.
- [ ] Present any helper syntax, parameter, or semantic cases left pending developer confirmation.
- [ ] Wait for user approval before Phase 9.

---

## Phase 9: Client ESLint Parity

Stop for user review after this phase.

### Task 20: Add Client ESLint Parity Rules

**Files:**

- Create: `src/eslint/rules/client-graph-entry-shape.ts`
- Create: `src/eslint/rules/client-graph-scoped-f.ts`
- Create: `src/eslint/rules/client-graph-capability-usage.ts`
- Create: `src/eslint/rules/client-filter-return.ts`
- Modify: `src/eslint/index.ts`
- Create: `tests/eslint/client-graph-rules.test.ts` or the nearest existing ESLint test fixture file.

- [ ] **Step 1: Inventory server ESLint rules and classify reuse**

Review existing server/nodegraph rules and classify them as:

- reusable for both server and client without changes
- reusable after adding client graph detection
- server-only
- client-only

At minimum, evaluate:

```text
gstsserver-*
no-gsts-f-outside-server
timer-*
no-unsupported-statement
switch-restrictions
for-structure
require-boolean-condition
list-*
builtin-math-support
builtin-wrapper-arity
assignment-restrictions
```

- [ ] **Step 2: Add client graph entry shape rule**

Reject unsupported client entry forms. The accepted public shape is:

```ts
g.characterSkill(options?).on('start', handler)
g.creationSkill(options?).on('start', handler)
g.creationStatus(options?).on('start', handler)
g.creationStatusDecision(options?).on('start', handler)
g.boolFilter(options?).on('start', handler)
g.intFilter(options?).on('start', handler)
```

If implementation discovers an ambiguous alternate shape, stop and ask the
developer to confirm before adding lint support.

- [ ] **Step 3: Add scoped f namespace rule**

In client handlers, reject default server shorthand usage when it is not valid:

```ts
gsts.f.xxx // server shorthand; not a client f namespace
gsts.fServer.xxx // explicit server namespace; not a client f namespace
```

Require the matching client namespace instead:

```ts
gsts.fCharacterSkill
gsts.fCreationSkill
gsts.fCreationStatus
gsts.fCreationStatusDecision
gsts.fBoolFilter
gsts.fIntFilter
```

The rule should catch obvious subtype mismatches, for example
`g.characterSkill(...).on(... => gsts.fBoolFilter.xxx())`.

- [ ] **Step 4: Add capability usage rule**

Using generated metadata/capability resources, reject unsupported client graph
features by `ClientGraphSubType + mode`:

- unsupported execution-flow methods (`doubleBranch`, `finiteLoop`,
  `listIterationLoop`, `multipleBranches`, `breakLoop`)
- unsupported client scoped helper globals and helper members
- server-only timer helpers unless client resources prove compatible timer
  behavior and the developer has confirmed the mapping
- node graph variable APIs in client graphs, because client node graphs do not
  support node graph variables in the current plan

For any uncertain method name, parameter shape, callback shape, or semantic
equivalence, mark the rule case as pending and ask the developer to confirm
before implementing it.

- [ ] **Step 5: Add filter return rule**

For `g.boolFilter(...).on('start', handler)` and
`g.intFilter(...).on('start', handler)`, lint handler bodies so obvious invalid
returns are caught early:

- bool filter should return a boolean-compatible value.
- int filter should return an integer-compatible value.
- missing return in a block-bodied handler should be rejected.

If metadata later proves additional accepted return forms, add them only after
developer confirmation.

- [ ] **Step 6: Wire rules into the recommended config**

Register the new rules in `src/eslint/index.ts`. Recommended config should make
client graph entry shape, scoped f namespace, capability usage, and filter return
violations errors.

- [ ] **Step 7: Add ESLint fixtures**

Add passing/failing fixtures for:

- valid six client entry APIs
- old array-handler or direct callback shapes rejected
- `gsts.f` / `gsts.fServer` rejected in client handlers
- mismatched `gsts.f*` rejected by subtype
- unsupported control flow rejected by family/mode
- unsupported helper members rejected by family/mode
- node graph variable APIs rejected in client graphs
- invalid bool/int filter returns rejected

- [ ] **Step 8: Run targeted ESLint verification**

Run the existing ESLint test command if one exists. If no targeted test command
exists, add or run a focused script for the client ESLint fixtures. Do not run
`npm test` unless the developer explicitly asks for it.

- [ ] **Step 9: Commit**

```powershell
git add src/eslint/rules/client-graph-entry-shape.ts src/eslint/rules/client-graph-scoped-f.ts src/eslint/rules/client-graph-capability-usage.ts src/eslint/rules/client-filter-return.ts src/eslint/index.ts tests/eslint/client-graph-rules.test.ts
git commit -m "feat: add client graph eslint rules"
```

### Phase 9 Review Gate

- [ ] Present client ESLint rule inventory and any server rules intentionally reused or left server-only.
- [ ] Present ESLint guard behavior for entry shape, scoped f namespaces, control flow, helper usage, node graph variable usage, and filter returns.
- [ ] Present targeted ESLint verification output.
- [ ] Wait for user approval before Phase 10.

---

## Phase 10: Docs, Coverage, And End-To-End Smokes

Stop for user review after this phase.

### Task 21: Add Client Docs, Examples, And Coverage Checks

**Files:**

- Modify: `docs/docs/en/doc/events/_meta.json`
- Create: `docs/docs/en/doc/events/client-graphs.md`
- Modify: `docs/docs/zh/doc/events/_meta.json`
- Create: `docs/docs/zh/doc/events/client-graphs.md`
- Modify: `docs/docs/en/doc/globals/types.md`
- Modify: `docs/docs/zh/doc/globals/types.md`
- Create or modify client coverage/check scripts under `scripts/client-nodegraph`.
- Modify: `package.json`

- [ ] **Step 1: Add user docs**

Document:

- six client graph families and official entry APIs
- mode/lang behavior
- no client node graph variables in the current plan
- scoped `gsts.f*` namespaces
- partial helper globals and metadata-backed limitations
- injection requirements for saved client graphs
- known gaps and developer-confirmation cases

- [ ] **Step 2: Add client examples**

Add examples for:

- character skill
- creation skill
- creation status
- creation status decision
- bool filter
- int filter
- mixed server/client project file

- [ ] **Step 3: Add coverage checks**

Add checks that report:

- metadata sample count and family count
- method count by subtype/mode
- helper global capability count
- unsupported special kind count
- sample nodes not mapped to generated method definitions
- official doc coverage: every `client_*`/`detail_*` node in
  `resources/node_definitions.json` is either mapped to a generated client method or
  listed in a documented gap/`needs_developer_confirmation` report
- golden round-trip: decode self-produced client `.gia` outputs with the extractor
  decoding path and compare node identity, pin layout, and literal value structure
  against sample-derived metadata

The check must fail for silent regressions such as metadata count dropping to
zero, but it may allow documented explicit gaps.

- [ ] **Step 4: Commit**

```powershell
git add docs/docs scripts/client-nodegraph package.json
git commit -m "docs: add client graph user documentation"
```

### Task 22: Add User Graph Smoke

**Files:**

- Create: `scripts/smoke-client-user-graphs.ts`
- Modify: `package.json`

- [ ] **Step 1: Create smoke script**

Create `scripts/smoke-client-user-graphs.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

import { irToGia } from '../src/compiler/ir_to_gia_transform/index.js'
import type { ClientIRDocument } from '../src/runtime/IR.js'

const protoPath =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

const docs: ClientIRDocument[] = [
  {
    ir_version: 1,
    ir_type: 'node_graph',
    graph: {
      type: 'client',
      sub_type: 'character_skill',
      mode: 'beyond',
      id: 1082130433,
      name: '_GSTS_ClientSmoke'
    },
    variables: [],
    nodes: [{ id: 1, type: 'node_graph_begins', args: [], next: [] }]
  }
]

fs.mkdirSync('tests/client_generated', { recursive: true })

for (const doc of docs) {
  const bytes = irToGia(doc, { protoPath })
  const out = path.join('tests/client_generated', `${doc.graph.sub_type}.gia`)
  fs.writeFileSync(out, Buffer.from(bytes))
  console.log(`[ok] ${out} (${bytes.length} bytes)`)
}
```

- [ ] **Step 2: Add npm script**

Modify `package.json`:

```json
"smoke:client:user-graphs": "npm run build && node --import tsx ./scripts/smoke-client-user-graphs.ts"
```

- [ ] **Step 3: Run smoke**

Run:

```powershell
npm run smoke:client:user-graphs
```

Expected: a `.gia` file is written under `tests/client_generated`.

- [ ] **Step 4: Commit**

```powershell
git add scripts/smoke-client-user-graphs.ts package.json tests/client_generated
git commit -m "test: add client user graph smoke"
```

### Task 23: Add CLI And Import Validation Smokes

**Files:**

- Create: `scripts/smoke-client-cli-e2e.mjs`
- Create: `scripts/smoke-client-import-validation.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create CLI e2e smoke**

Create `scripts/smoke-client-cli-e2e.mjs`:

```js
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const fixture = 'scripts/client-nodegraph/fixtures/basic_client_graphs.ts'
if (!fs.existsSync(fixture)) {
  throw new Error(`missing fixture: ${fixture}`)
}

const result = spawnSync(process.execPath, ['./bin/gsts.mjs', fixture, '--noinject'], {
  stdio: 'inherit',
  shell: false
})

if (result.status !== 0) {
  throw new Error(`client CLI e2e failed with status ${result.status}`)
}

console.log('[ok] client CLI e2e')
```

- [ ] **Step 2: Create import validation smoke**

Create `scripts/smoke-client-import-validation.mjs`:

```js
const runtime = await import('../dist/src/runtime/core.js')
const modes = await import('../dist/src/definitions/client_graph_modes.js')
const encoding = await import(
  '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_graph_encoding.js'
)
const metadata = await import(
  '../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'
)

for (const key of [
  'characterSkill',
  'creationSkill',
  'creationStatus',
  'creationStatusDecision',
  'boolFilter',
  'intFilter'
]) {
  if (typeof runtime.g[key] !== 'function') throw new Error(`missing g.${key}`)
}

if (!modes.CLIENT_GRAPH_ENTRY_SPEC_BY_SUB_TYPE.character_skill)
  throw new Error('missing character_skill graph entry spec')
if (!encoding.CLIENT_GRAPH_ENCODING_BY_SUB_TYPE.character_skill)
  throw new Error('missing character_skill encoding')
if (!Array.isArray(metadata.CLIENT_NODE_METADATA)) throw new Error('missing metadata array')

console.log('[ok] client import validation')
```

- [ ] **Step 3: Add npm scripts**

Modify `package.json`:

```json
"smoke:client:cli": "npm run build && node ./scripts/smoke-client-cli-e2e.mjs",
"smoke:client:imports": "npm run build && node ./scripts/smoke-client-import-validation.mjs",
"smoke:client:all": "npm run smoke:client && node --import tsx ./scripts/check-client-definitions-consistency.ts && npm run smoke:client:user-graphs && npm run smoke:client:imports"
```

- [ ] **Step 4: Run import validation**

Run:

```powershell
npm run smoke:client:imports
```

Expected:

```text
[ok] client import validation
```

- [ ] **Step 5: Run all non-injection smokes**

Run:

```powershell
npm run smoke:client:all
```

Expected: all scripts pass.

- [ ] **Step 6: Commit**

```powershell
git add scripts/smoke-client-cli-e2e.mjs scripts/smoke-client-import-validation.mjs package.json
git commit -m "test: add client CLI and import smokes"
```

### Phase 10 Review Gate

- [ ] Present docs/examples paths and client coverage report.
- [ ] Present all end-to-end smoke outputs.
- [ ] Present generated client `.gia` file paths.
- [ ] Present unresolved special gaps.
- [ ] Wait for user approval before Phase 11.

---

## Phase 11: Cleanup And Hardening

Stop for final user review after this phase.

### Task 24: Enforce No Server Fallback In Client Path

**Files:**

- Modify: `scripts/check-client-definitions-consistency.ts`
- Modify: `src/compiler/ir_to_gia_transform/client_graph.ts`
- Modify: `src/compiler/ir_to_gia_transform/client_nodes.ts`

- [ ] **Step 1: Add source-level guard**

Extend `scripts/check-client-definitions-consistency.ts`:

```ts
import fs from 'node:fs'

const forbiddenImports = [
  '../node_data/node_id.js',
  '../node_data/node_pin_records.js',
  './node_id.js',
  './mappings.js'
]

for (const file of [
  'src/compiler/ir_to_gia_transform/client_graph.ts',
  'src/compiler/ir_to_gia_transform/client_nodes.ts',
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts'
]) {
  const text = fs.readFileSync(file, 'utf8')
  for (const forbidden of forbiddenImports) {
    if (text.includes(forbidden)) {
      throw new Error(`client path imports forbidden server dependency ${forbidden} in ${file}`)
    }
  }
}
```

- [ ] **Step 2: Run consistency**

Run:

```powershell
node --import tsx ./scripts/check-client-definitions-consistency.ts
```

Expected:

```text
[ok] client definitions consistency
```

- [ ] **Step 3: Commit**

```powershell
git add scripts/check-client-definitions-consistency.ts
git commit -m "test: guard client path against server fallback"
```

### Task 25: Final Verification

**Files:**

- Modify only files required by failures from this task.

- [ ] **Step 1: Run final build**

Run:

```powershell
npm run build
```

Expected: build passes.

- [ ] **Step 2: Run client generation**

Run:

```powershell
npm run gen:client
```

Expected:

```text
[ok] scanned 1288 client gia samples
[ok] generated client nodegraph modules
```

- [ ] **Step 3: Run client smokes**

Run:

```powershell
npm run smoke:client:all
```

Expected: all client smoke scripts pass.

- [ ] **Step 4: Decide whether to run the existing test suite**

Do not run `npm test` by default, because the current project test command may
trigger generation scripts and overwrite generated files. If runtime/compiler
shared code changed, first ask the developer whether this overwrite behavior is
acceptable. If approved, run the existing test suite and record any generated
file changes separately from implementation changes.

- [ ] **Step 5: Commit final fixes**

If final verification exposes small integration fixes, stage only the planned implementation files that were changed by the fix:

```powershell
git add scripts/client-nodegraph scripts/smoke-client-capability.mjs scripts/check-client-definitions-consistency.ts scripts/smoke-client-user-graphs.ts scripts/smoke-client-cli-e2e.mjs scripts/smoke-client-import-validation.mjs src/definitions/client_graph_modes.ts src/definitions/client_method_modes.ts src/definitions/nodes.ts src/runtime/IR.d.ts src/runtime/execution_flow_types.ts src/runtime/ir_builder.ts src/runtime/core.ts src/runtime/client_graph_support.ts src/runtime/graph_defaults.ts src/shared/client_capability_errors.ts src/compiler/gs_to_ir_json_transform/runner.ts src/compiler/ir_merge.ts src/compiler/ir_to_gia_transform src/compiler/gia_vendor.ts src/i18n/locales/en-US/main.json src/i18n/locales/zh-CN/main.json src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.ts tests/client_generated
git commit -m "fix: harden client nodegraph support"
```

### Phase 11 Review Gate

- [ ] Present final build output.
- [ ] Present client generation output.
- [ ] Present client smoke output.
- [ ] Present existing test output or explain why it was not run.
- [ ] Present final gap report.

---

## Self-Review

- Spec coverage: The plan covers public API, metadata generation, runtime IR, merge, compiler dispatch, client resolver, client builder, literal value encoding with round-trip verification, deterministic reflect variant resolution, smokes, and no-server-fallback checks.
- Phase 3 reviewability: Task 7 Step 0 guarantees client IR fails fast before the client transform exists, and Task 10 extracts minimal start/end metadata so Phase 3 ends with a decodable minimal client `.gia` instead of a build-only review.
- Explicit gaps: The plan preserves `inline_var_type_hint` as an observed first-pass unsupported detail and treats `structure_list_unknown_binding` as a conditional extractor finding, not a predeclared gap. `ClientVarType = 25` is treated as the observed faction-list type, not as a gap.
- Type consistency: The plan consistently uses `ClientGraphSubType`, `ClientGraphMode`, `ClientNodeMetadata`, `CLIENT_GRAPH_ENCODING_BY_SUB_TYPE`, and `CLIENT_NODE_METADATA`.
- Review model: Each phase ends with a user review gate before continuing.
