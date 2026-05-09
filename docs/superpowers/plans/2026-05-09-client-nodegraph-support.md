# Client Nodegraph Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build complete client nodegraph support through the same TypeScript -> IR -> GIA -> CLI pipeline used by server graphs, while allowing explicit first-pass gaps for poorly understood special nodes.

**Architecture:** Implement a server-parity client path with separate client metadata, capability, graph encoding, resolver, and builder modules. Keep the public API in `g` and `nodes.ts`, keep runtime IR readable, and branch in compiler/thirdparty only where client GIA encoding differs from server GIA encoding.

**Tech Stack:** TypeScript 5.9, Node.js ESM, protobufjs-generated GIA schema, existing `tsx` scripts, existing `npm run build`, existing CLI pipeline.

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
- `src/definitions/client_method_modes.ts`: generated method-to-subtype/mode maps.
- `src/runtime/client_graph_support.ts`: runtime client graph validation, registry helpers, filter normalization, and stable errors.
- `src/shared/client_capability_errors.ts`: stable client error codes and helpers.
- `src/compiler/client_graph_encoding.ts`: generated compiler-only graph header encoding.
- `src/compiler/ir_to_gia_transform/client_graph.ts`: client IR -> GIA implementation.
- `src/compiler/ir_to_gia_transform/client_nodes.ts`: client node resolver and argument/connection mapping.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts`: generated metadata table.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts`: client metadata lookup helpers.
- `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts`: client graph/node/pin/value body helpers when server helpers cannot be reused cleanly.
- `tests/client_generated/.gitkeep`: keeps the report output directory present.
- `tests/client_smoke/basic_client_graphs.ts`: source fixtures for smoke scripts.

Modify these files:

- `package.json`: add client generation and smoke scripts.
- `src/runtime/IR.d.ts`: add client graph type, subtype, and mode definitions.
- `src/runtime/execution_flow_types.ts`: allow IR builder inputs to carry client subtype/mode.
- `src/runtime/ir_builder.ts`: emit client graph IR when given client subtype.
- `src/runtime/core.ts`: expose client graph APIs through `g` and delegate client-specific logic to `client_graph_support.ts`.
- `src/definitions/nodes.ts`: add client execution-flow classes and generated method map types.
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
  reflectMap?: Array<{ concreteId: number | string; variantKey: string; pins?: ClientPinMetadata[] }>
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
  '角色技能节点图': 'character_skill',
  '造物技能节点图': 'creation_skill',
  '造物状态节点图': 'creation_status',
  '造物状态决策节点图': 'creation_status_decision',
  '布尔过滤器节点': 'bool_filter',
  '整数过滤器节点': 'int_filter'
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
        beyond: { status: 'available', reason: '', syntax: [] },
        classic: { status: 'unknown', reason: 'client classic mode requires sample confirmation', syntax: [] }
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
    unsupportedSpecialKinds: [
      'inline_var_type_hint',
      'structure_list_unknown_binding'
    ],
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
- Output: `src/definitions/client_method_modes.ts`
- Output: `src/compiler/client_graph_encoding.ts`
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
  'src/compiler/client_graph_encoding.ts',
  `import type { ClientGraphSubType } from '../runtime/IR.js'

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
  `import type { ClientGraphSubType } from '../runtime/IR.js'

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

export const CLIENT_GRAPH_SPEC_BY_SUB_TYPE = {
  character_skill: { event: 'node_graph_begins', handler: { params: [], shape: 'start', maxArrayHandlers: 64, returnType: 'void' } },
  creation_skill: { event: 'node_graph_begins', handler: { params: [], shape: 'start', maxArrayHandlers: 64, returnType: 'void' } },
  creation_status: { event: 'node_graph_begins', handler: { params: [], shape: 'start', maxArrayHandlers: 64, returnType: 'void' } },
  creation_status_decision: { event: 'node_graph_begins', handler: { params: [], shape: 'start', maxArrayHandlers: 64, returnType: 'void' } },
  bool_filter: { event: 'node_graph_begins', handler: { params: [], shape: 'filter', maxArrayHandlers: 64, returnType: 'bool' } },
  int_filter: { event: 'node_graph_begins', handler: { params: [], shape: 'filter', maxArrayHandlers: 64, returnType: 'int' } }
} as const
`
)

write(
  'src/definitions/client_method_modes.ts',
  `export const CLIENT_NODE_METHODS_BY_SUB_TYPE = {
  character_skill: [],
  creation_skill: [],
  creation_status: [],
  creation_status_decision: [],
  bool_filter: [],
  int_filter: []
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
  "gen:client": "node --import tsx ./scripts/client-nodegraph/extract-client-node-metadata.ts && node --import tsx ./scripts/client-nodegraph/generate-client-nodegraph-modules.ts && prettier --write src/definitions/client_*.ts src/compiler/client_graph_encoding.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_*.ts",
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
rg -n "graphType|graphWhich" src/definitions/client_graph_modes.ts src/definitions/client_method_modes.ts src/definitions/nodes.ts
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
git add package.json scripts/client-nodegraph/generate-client-nodegraph-modules.ts src/definitions/client_graph_modes.ts src/definitions/client_method_modes.ts src/compiler/client_graph_encoding.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts
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
- Modify: `src/definitions/nodes.ts`
- Modify: `src/compiler/gs_to_ir_json_transform/runner.ts`

- [ ] **Step 1: Create client graph support module**

Create `src/runtime/client_graph_support.ts`:

```ts
import {
  ClientBoolFilterExecutionFlowFunctions,
  ClientCharacterSkillExecutionFlowFunctions,
  ClientCreationSkillExecutionFlowFunctions,
  ClientCreationStatusDecisionExecutionFlowFunctions,
  ClientCreationStatusExecutionFlowFunctions,
  ClientIntFilterExecutionFlowFunctions
} from '../definitions/nodes.js'
import { CLIENT_GRAPH_SPEC_BY_SUB_TYPE } from '../definitions/client_graph_modes.js'
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../shared/client_capability_errors.js'
import type { ExecTailEndpoint, ExecutionFlow } from './execution_flow_types.js'
import type { ClientGraphMode, ClientGraphSubType, Variable } from './IR.js'
import type { MetaCallRecord, MetaCallRecordRef } from './meta_call_types.js'
import { bool, int, localVariable, type value } from './value.js'

export type ClientGraphOptions = {
  id?: number
  name?: string
  prefix?: boolean
  mode?: ClientGraphMode
}

export type ClientStartEvent = Record<string, never>
export type ClientStartGraphSubType = Exclude<ClientGraphSubType, 'bool_filter' | 'int_filter'>

export type ClientExecutionFlowRegistry = {
  registerNode(record: MetaCallRecord): MetaCallRecordRef
  withExecBranch(fromNodeId: number, sourceIndex: number, fn: () => void): {
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
  ensureVariable(variable: Variable): void
  connectExecBranchOutput(fromNodeId: number, sourceIndex: number, headNodeId: number): void
}

export type ClientFlowFunctionClass<T extends ClientGraphSubType> =
  T extends 'character_skill'
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
export type ClientHandlerArray<T> = T | T[]

export function assertClientGraphMode(mode?: ClientGraphMode): ClientGraphMode {
  const resolved = mode ?? 'beyond'
  if (resolved !== 'beyond' && resolved !== 'classic') {
    throw clientNodegraphError(CLIENT_ERROR_CODES.MODE_UNAVAILABLE, `invalid client mode: ${String(mode)}`)
  }
  return resolved
}

export function assertClientGraphSubType(subType: ClientGraphSubType): ClientGraphSubType {
  if (!(subType in CLIENT_GRAPH_SPEC_BY_SUB_TYPE)) {
    throw clientNodegraphError(CLIENT_ERROR_CODES.MODE_UNAVAILABLE, `invalid client graph subtype: ${String(subType)}`)
  }
  return subType
}

export function normalizeClientBoolFilterReturn(result: boolean | bool): bool {
  if (result instanceof bool) return result
  if (typeof result === 'boolean') return new bool(result)
  throw clientNodegraphError(CLIENT_ERROR_CODES.FILTER_RETURN_TYPE, 'bool_filter handler must return boolean or bool')
}

export function normalizeClientIntFilterReturn(result: bigint | number | int): int {
  if (result instanceof int) return result
  if (typeof result === 'bigint') return new int(result)
  if (typeof result === 'number') {
    if (!Number.isSafeInteger(result)) {
      throw clientNodegraphError(CLIENT_ERROR_CODES.FILTER_RETURN_RANGE, 'int_filter number return must be a safe integer')
    }
    return new int(result)
  }
  throw clientNodegraphError(CLIENT_ERROR_CODES.FILTER_RETURN_TYPE, 'int_filter handler must return safe integer number, bigint, or int')
}

export const CLIENT_FILTER_END_NODE_TYPES = {
  bool_filter: 'node_graph_end_boolean',
  int_filter: 'node_graph_end_integer'
} as const
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
  withExecBranch(fromNodeId: number, sourceIndex: number, fn: () => void): {
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

Implement `characterSkill`, `creationSkill`, `creationStatus`, `creationStatusDecision`, `boolFilter`, and `intFilter` by delegating handler normalization and filter return conversion to `src/runtime/client_graph_support.ts`.

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

Create `tests/client_smoke/basic_client_graphs.ts`:

```ts
import { g } from '../../src/runtime/core.js'

g.characterSkill({ id: 1073741825, name: 'ClientSkill' }, (_evt, f) => {
  f.printString('client skill')
})

g.boolFilter({ id: 1073741826, name: 'ClientBoolFilter' }, () => {
  return true
})

g.intFilter({ id: 1073741827, name: 'ClientIntFilter' }, () => {
  return 1n
})
```

- [ ] **Step 8: Run IR emission manually**

Run:

```powershell
npm run build
node dist/src/compiler/gs_to_ir_json_transform/runner.js tests/client_smoke/basic_client_graphs.ts
```

Expected: generated JSON contains three documents with `graph.type` equal to `client`.

- [ ] **Step 9: Commit**

```powershell
git add src/runtime/client_graph_support.ts src/runtime/core.ts src/definitions/nodes.ts src/compiler/gs_to_ir_json_transform/runner.ts tests/client_smoke/basic_client_graphs.ts
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

- [ ] **Step 1: Add client node resolver**

Create `src/compiler/ir_to_gia_transform/client_nodes.ts`:

```ts
import { CLIENT_ERROR_CODES, clientNodegraphError } from '../../shared/client_capability_errors.js'
import type { ClientGraphSubType } from '../../runtime/IR.js'
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
git add src/compiler/ir_to_gia_transform/client_nodes.ts src/compiler/ir_to_gia_transform/types.ts
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
import type { ClientNodeMetadata, ClientPinMetadata } from '../node_data/client_node_metadata.js'
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
  if (body.metadata.specialKind === 'start' && body.metadata.subType.startsWith('creation_status')) {
    node.statusNodeExtension = { type: 1, inner: { value: 1 } }
  }
  return node
}

export { node_connect_from, node_connect_to }
```

- [ ] **Step 2: Add client dictionary mapping support**
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
```

- [ ] **Step 2: Create client graph transform**

Create `src/compiler/ir_to_gia_transform/client_graph.ts`:

```ts
import { loadGiaProto } from '../../injector/proto.js'
import type { ClientIRDocument } from '../../runtime/IR.js'
import {
  client_graph_body,
  client_node_body,
  client_node_connect_from,
  client_node_connect_to,
  wrap_gia,
  type Root as GiaRoot
} from '../gia_vendor.js'
import { getClientGraphEncoding } from '../client_graph_encoding.js'
import { buildExecutionGraph, layoutPositions } from './layout.js'
import { resolveClientNodeMetadata } from './client_nodes.js'
import type { IrToGiaOptions } from './index.js'
import type { NodeId } from './types.js'

export function clientIrToGia(ir: ClientIRDocument, opts: IrToGiaOptions): Uint8Array {
  const graphId = opts.graphId ?? ir.graph.id ?? 1073741825
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

Modify the start of `irToGia` in `src/compiler/ir_to_gia_transform/index.ts`:

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

### Phase 3 Review Gate

- [ ] Present client compiler branch diff.
- [ ] Present confirmation that client compiler does not import server `node_id.ts`.
- [ ] Present current unsupported special-node behavior.
- [ ] Present build result.
- [ ] Wait for user approval before Phase 4.

---

## Phase 4: Full Metadata Extraction And Runtime Definitions

Stop for user review after this phase.

### Task 10: Replace Placeholder Extraction With Real Node Metadata Extraction

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
  "unsupportedSpecialKinds": [
    "inline_var_type_hint",
    "structure_list_unknown_binding"
  ],
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

### Task 11: Generate Client Method Modes And Definitions

**Files:**
- Modify: `scripts/client-nodegraph/generate-client-nodegraph-modules.ts`
- Modify: `src/definitions/nodes.ts`
- Output: `resources/client_execution_flow_metadata.json`
- Output: `src/definitions/client_method_modes.ts`

- [ ] **Step 1: Generate execution-flow metadata**

Extend generator to derive method metadata from `src/definitions/nodes.ts` server signatures and client capability:

```ts
type ClientExecutionFlowMetadata = {
  methodName: string
  nodeType: string
  subTypes: string[]
  modes: string[]
  params: string[]
  returnType: string
  typeParams: string[]
  docs: string
  requiresLocalVariableSpecialization: boolean
}
```

- [ ] **Step 2: Generate method maps**

Generate `src/definitions/client_method_modes.ts`:

```ts
export const CLIENT_NODE_METHODS_BY_SUB_TYPE = {
  character_skill: ['printString'],
  creation_skill: ['printString'],
  creation_status: ['printString'],
  creation_status_decision: ['printString'],
  bool_filter: [],
  int_filter: []
} as const

export type ClientNodeMethodBySubType = typeof CLIENT_NODE_METHODS_BY_SUB_TYPE
```

Replace the literal arrays with generated values from metadata.

- [ ] **Step 3: Connect client classes to method maps**

Modify `src/definitions/nodes.ts` so client classes remain empty runtime shells but expose type maps:

```ts
export type ClientExecutionFlowFunctionsBySubTypeMode<
  T extends ClientGraphSubType
> = ClientExecutionFlowFunctionsBySubType[T]
```

- [ ] **Step 4: Add consistency check script**

Create `scripts/check-client-definitions-consistency.ts`:

```ts
import { CLIENT_NODE_METHODS_BY_SUB_TYPE } from '../src/definitions/client_method_modes.js'
import { CLIENT_NODE_METADATA } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js'

const metadataTypes = new Set(CLIENT_NODE_METADATA.map((item) => item.nodeType))
const missing: string[] = []

for (const [subType, methods] of Object.entries(CLIENT_NODE_METHODS_BY_SUB_TYPE)) {
  for (const method of methods as readonly string[]) {
    const nodeType = method.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
    if (!metadataTypes.has(nodeType)) missing.push(`${subType}.${method} -> ${nodeType}`)
  }
}

if (missing.length) {
  throw new Error(`client definitions missing metadata:\n${missing.join('\n')}`)
}

console.log('[ok] client definitions consistency')
```

- [ ] **Step 5: Run generation and consistency**

Run:

```powershell
npm run gen:client
npm run build
node --import tsx ./scripts/check-client-definitions-consistency.ts
```

Expected:

```text
[ok] client definitions consistency
```

- [ ] **Step 6: Commit**

```powershell
git add scripts/client-nodegraph/generate-client-nodegraph-modules.ts scripts/check-client-definitions-consistency.ts resources/client_execution_flow_metadata.json src/definitions/client_method_modes.ts src/definitions/nodes.ts
git commit -m "feat: generate client method availability"
```

### Phase 4 Review Gate

- [ ] Present metadata count.
- [ ] Present method count per subtype.
- [ ] Present gap report.
- [ ] Present consistency check result.
- [ ] Wait for user approval before Phase 5.

---

## Phase 5: End-To-End Smokes

Stop for user review after this phase.

### Task 12: Add User Graph Smoke

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
    graph: { type: 'client', sub_type: 'character_skill', mode: 'beyond', id: 1073741825, name: '_GSTS_ClientSmoke' },
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

### Task 13: Add CLI And Import Validation Smokes

**Files:**
- Create: `scripts/smoke-client-cli-e2e.mjs`
- Create: `scripts/smoke-client-import-validation.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create CLI e2e smoke**

Create `scripts/smoke-client-cli-e2e.mjs`:

```js
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const fixture = 'tests/client_smoke/basic_client_graphs.ts'
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
const encoding = await import('../dist/src/compiler/client_graph_encoding.js')
const metadata = await import('../dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.js')

for (const key of ['characterSkill', 'creationSkill', 'creationStatus', 'creationStatusDecision', 'boolFilter', 'intFilter']) {
  if (typeof runtime.g[key] !== 'function') throw new Error(`missing g.${key}`)
}

if (!modes.CLIENT_GRAPH_SPEC_BY_SUB_TYPE.character_skill) throw new Error('missing character_skill graph spec')
if (!encoding.CLIENT_GRAPH_ENCODING_BY_SUB_TYPE.character_skill) throw new Error('missing character_skill encoding')
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

### Phase 5 Review Gate

- [ ] Present all smoke outputs.
- [ ] Present generated `.gia` file paths.
- [ ] Present unresolved special gaps.
- [ ] Wait for user approval before Phase 6.

---

## Phase 6: Cleanup And Hardening

Stop for final user review after this phase.

### Task 14: Enforce No Server Fallback In Client Path

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

### Task 15: Final Verification

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

- [ ] **Step 4: Run existing test suite if runtime/compiler shared code changed**

Run:

```powershell
npm test
```

Expected: existing server graph tests pass.

- [ ] **Step 5: Commit final fixes**

If final verification exposes small integration fixes, stage only the planned implementation files that were changed by the fix:

```powershell
git add scripts/client-nodegraph scripts/smoke-client-capability.mjs scripts/check-client-definitions-consistency.ts scripts/smoke-client-user-graphs.ts scripts/smoke-client-cli-e2e.mjs scripts/smoke-client-import-validation.mjs src/definitions/client_graph_modes.ts src/definitions/client_method_modes.ts src/definitions/nodes.ts src/runtime/IR.d.ts src/runtime/execution_flow_types.ts src/runtime/ir_builder.ts src/runtime/core.ts src/runtime/client_graph_support.ts src/shared/client_capability_errors.ts src/compiler/client_graph_encoding.ts src/compiler/gs_to_ir_json_transform/runner.ts src/compiler/ir_merge.ts src/compiler/ir_to_gia_transform src/compiler/gia_vendor.ts src/i18n/locales/en-US/main.json src/i18n/locales/zh-CN/main.json src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_helpers.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.ts src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/nodes.ts tests/client_generated tests/client_smoke
git commit -m "fix: harden client nodegraph support"
```

### Phase 6 Review Gate

- [ ] Present final build output.
- [ ] Present client generation output.
- [ ] Present client smoke output.
- [ ] Present existing test output or explain why it was not run.
- [ ] Present final gap report.

---

## Self-Review

- Spec coverage: The plan covers public API, metadata generation, runtime IR, merge, compiler dispatch, client resolver, client builder, smokes, and no-server-fallback checks.
- Explicit gaps: The plan preserves `inline_var_type_hint` as an observed first-pass unsupported detail and treats `structure_list_unknown_binding` as a conditional extractor finding, not a predeclared gap. `ClientVarType = 25` is treated as the observed faction-list type, not as a gap.
- Type consistency: The plan consistently uses `ClientGraphSubType`, `ClientGraphMode`, `ClientNodeMetadata`, `CLIENT_GRAPH_ENCODING_BY_SUB_TYPE`, and `CLIENT_NODE_METADATA`.
- Review model: Each phase ends with a user review gate before continuing.
