# src/definitions/ — AUTO-GENERATED Definitions

## OVERVIEW
**AUTO-GENERATED** from `resources/node_definitions.json`. Each top file has a `// AUTO-GENERATED` banner. **DO NOT HAND-EDIT.** Regenerate via `npm run gen` after updating resources. Most files re-export `prettier --write` after generation.

## STRUCTURE
| File | Lines | Role | Generation |
|------|-------|------|------------|
| `nodes.ts` | **16,567** | **GOD-FILE** (auto-gen): `class ServerExecutionFlowFunctions` (f.* API surface, 96% of file) + `DataTypeConversionMap` + `parseValue` | `generate-definitions.ts` |
| `entity_helpers.ts` | **6,535** | **GOD-FILE** (auto-gen): `PlayerEntity`, `CharacterEntity`, `StageEntity`, `ObjectEntity`, `CreationEntity` + `EntityHelperAll<K>` + `installEntityHelpers()` | `generate-definitions.ts` |
| `prefabs.ts` | **3,279** | 8 pure-data ID maps: `DynamicPrefabZh/En`, `StaticPrefabZh/En`, `CreationPrefabZh/En`, `CharacterPrefabZh/En` | `generate-definitions.ts` |
| `enum.ts` | **2,417** | 46+ `class X extends enumeration` declarations; each constructor throws `new Error('you should not create an enum instance')` | `generate-definitions.ts` |
| `events-payload.ts` | **1,856** | `ServerEventPayloads` — full type signature of every server event's parameters (EN/CN JSDoc) | `generate-definitions.ts` |
| `zh_aliases.ts` | **964** | `SERVER_EVENT_ZH_TO_EN` + `SERVER_F_ZH_TO_EN` Chinese alias maps | `generate-zh-aliases.mjs` |
| `events.ts` | 497 | `ServerEventMetadata`, `ServerEventName`, `ServerEventMetadataType` | `generate-definitions.ts` |
| `node_modes.ts` | 74 | `NODE_TYPE_BY_METHOD` map (server-flow method name → `'beyond' \| 'classic'`) | `generate-definitions.ts` |
| `events-payload-mode.ts` | 7 | `ServerEventPayloadsByMode` = `ReplaceEntityByMode` adaptation for classic vs beyond | `generate-definitions.ts` |
| `server_on_overloads.d.ts` | 717 | Type-only declaration of `.on(...)` overloads (per `Vars, Mode, Lang`) | `generate-definitions.ts` |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new node method (f.*) | Update `resources/node_definitions.json` → `npm run gen` → `nodes.ts` regenerates |
| Add a new event | Update `resources/node_definitions.json` → `npm run gen` → `events.ts` + `events-payload.ts` regenerate |
| Add a new enum | Update `resources/node_definitions.json` → `npm run gen` → `enum.ts` regenerates |
| Add a new entity helper | Update `resources/node_definitions.json` → `npm run gen` → `entity_helpers.ts` regenerates |
| Add a new prefab ID | Update `resources/node_definitions.json` → `npm run gen` → `prefabs.ts` regenerates |
| Add a new Chinese alias | Update alias source → `npm run gen` (or `scripts/generate-zh-aliases.mjs`) |
| Add a new graph mode | Update `node_modes.ts` (hand-edited) or add to generator; affects `ServerGraphMode` in IR.d.ts |
| Find which methods are classic-only vs beyond-only | `node_modes.ts:NODE_TYPE_BY_METHOD` |
| Find which methods exist | `nodes.ts:ServerExecutionFlowFunctions` (use IDE "go to definition") |
| Find event parameter types | `events-payload.ts:ServerEventPayloads` (use IDE hover) |
| Find what `f.<method>(...)` does | `nodes.ts:ServerExecutionFlowFunctions.<method>` + see corresponding node in `docs/architecture/` |

## CONVENTIONS
- All 10 files have `// AUTO-GENERATED` headers. Do not hand-edit.
- `class ServerExecutionFlowFunctions` (`nodes.ts:700`) is the runtime `f.*` API. Every method registers a `MetaCallRecord` on `this.registry`.
- `ServerExecutionFlowFunctionsByMode<M extends ServerGraphMode>` (`nodes.ts:16562`) is a `Pick`-style mapped type that filters methods by mode (classic/beyond).
- `NodeGraphVarApi<Vars>` (from `runtime/variables.ts`) augments `ServerExecutionFlowFunctions` with `f.get(name)` / `f.set(name, value)` for typed variable access.
- `zh_aliases.ts:SERVER_F_ZH_TO_EN` is applied at runtime via `Object.defineProperty` in `core.ts:applyZhAliases` when `g.server({ lang: 'zh' })`.
- The 46+ `class X extends enumeration` in `enum.ts` all throw `new Error('you should not create an enum instance')` in their constructors — `new <EnumCls>()` is runtime-asserted forbidden.
- `entity_helpers.ts:installEntityHelpers()` (line 6451) installs entity prototype methods/getters; called by `runtime/server_globals.ts:installServerGlobals`.

## KEY EXPORTS (public)
- `class ServerExecutionFlowFunctions` (`nodes.ts:700`) — the f.* API class
- `type ServerExecutionFlowFunctionsByMode<M>` (`nodes.ts:16562`)
- `type ServerExecutionFlowFunctionsZh` (`zh_aliases.ts`)
- `const SERVER_F_ZH_TO_EN`, `const SERVER_EVENT_ZH_TO_EN` (`zh_aliases.ts`)
- `class ServerEventMetadata`, `type ServerEventName` (`events.ts`)
- `type ServerEventPayloads` (`events-payload.ts`)
- `type ServerEventPayloadsByMode<Mode>` (`events-payload-mode.ts`)
- `class EnumerationType`, `type EnumerationTypeMap` (`enum.ts`)
- `class PlayerEntity` / `CharacterEntity` / `StageEntity` / `ObjectEntity` / `CreationEntity` (`entity_helpers.ts`)
- `type EntityHelperAll`, `type EntityHelperFor<K>` (`entity_helpers.ts`)
- `installEntityHelpers()` (`entity_helpers.ts:6451`)
- `const DynamicPrefab`, `StaticPrefab`, `CreationPrefab`, `CharacterPrefab` (En/Zh variants) (`prefabs.ts`)
- `type NodeTypeByMethod`, `type MethodAllowedByMode` (`nodes.ts:16555`)
- `const NODE_TYPE_BY_METHOD` (`node_modes.ts`)
- `.on(...)` overloads (`server_on_overloads.d.ts`)
- `parseValue(v, type)` (`nodes.ts:1`)
- `type DataTypeConversionMap` (`nodes.ts:690`)

## ANTI-PATTERNS
- **DO NOT HAND-EDIT** any file in this directory — regenerate via `npm run gen`.
- Do NOT call `new <EnumCls>()` at runtime — 30+ enum constructors throw `you should not create an enum instance`.
- Do NOT use `f.<method>` outside `g.server().on(...)` / `gstsServer*` body — `gsts/no-gsts-f-outside-server` rule (disabled in root config, on in templates).
- Do NOT use `nodes.ts` imports in user code (the file is auto-generated and changes shape every regen); use the `runtime` or `compiler` exports instead.
- Do NOT add a node to `nodes.ts` directly — add to `resources/node_definitions.json` then `npm run gen`.
- Do NOT modify `zh_aliases.ts` directly — use `scripts/generate-zh-aliases.mjs`.

## NOTES
- The two biggest files (`nodes.ts` 16,567 + `entity_helpers.ts` 6,535) are auto-generated and ship with the tool. They total 22.5K lines of method/type overloads.
- `nodes.ts:700` is where `class ServerExecutionFlowFunctions` starts — it spans 15,853 lines (96% of the file).
- `nodes.ts` is imported by 5 directories: `runtime/core.ts`, `runtime/server_globals.ts`, `runtime/server_globals.d.ts`, `definitions/entity_helpers.ts`, `definitions/zh_aliases.ts`.
- `entity_helpers.ts` is imported by 3: `runtime/server_globals.ts`, `runtime/server_globals.d.ts`, `runtime/value.ts`.
- `enum.ts` is imported by 7: `runtime/core.ts`, `runtime/server_globals.ts`, `runtime/value.ts`, `definitions/entity_helpers.ts`, `definitions/events-payload.ts`, several `scripts/generate-*.ts`, `scripts/testgen/emit.ts`.
- `zh_aliases.ts` is imported by 2: `runtime/core.ts`, `definitions/server_on_overloads.d.ts`.
- After `npm run gen`, prettier auto-formats; do not bypass that step.
- The `data`/`prefabId`/`configId`/`faction` helper `installEntityHelpers` is called at module init, so adding helpers to `entity_helpers.ts` requires the user code to NOT have a custom `entity` shadowing.
