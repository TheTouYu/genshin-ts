# src/injector/ — GIA → GIL Binary Patcher

## OVERVIEW
Patches compiled `.gia` files into the game's `.gil` map binary. Reads GIL header tags (`0x0326` / `0x0679`), finds the target NodeGraph by ID, runs safety checks (name must start with `_GSTS` unless `skipNonEmptyCheck`), then `applyReplacement` to splice in the new graph.

## STRUCTURE (7 files, ~1.3k LoC)
| File | Lines | Role |
|------|-------|------|
| `index.ts` | 229 | `createInjector()`, `injectGilBytes()`, `injectGilFile()`; public API; validates header, finds target, applies replacement |
| `binary.ts` | 336 | Low-level: `readVarint`, `encodeVarint`, `parseMessage`, `buildFile`, `readFieldBytes`/`readFieldMessages`/`readFieldVarint` (custom protobuf field walker; **does not** rely on protobufjs for the GIL container) |
| `folder.ts` | 284 | Folder index, `DEFAULT_GRAPH_TYPE_VALUES` (entity=800, status=2300, class=2400, item=4300), `collectFolderIndexes`, `findFolderEntryField` |
| `signal_nodes.ts` | 223 | `patchSignalNodeIds` — replaces placeholder signal-node ids (300000=send, 300001=monitor) by scanning signal name strings |
| `node_graph.ts` | 174 | Fast signature-based ID extraction (no full protobuf decode for matching); `loadGiaGraph`, `setGraphId`, `setGraphType`, `buildGraphTypeMap`, `findNodeGraphTargets`, `extractGraphType` |
| `proto.ts` | 33 | `loadGiaProto` (protobufjs loader, memoized) |
| `types.ts` | 64 | `LenField`, `Patch`, `FolderEntry`/`FolderIndex`/`FolderMetaList`, `InjectGil*` input/result/options |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new safety check before injection | `index.ts:createInjector` (returns `{injectBytes, injectFile}`) |
| Change GIL header detection | `index.ts` (header tag `0x0326` / `0x0679` checks) |
| Add a new patch type | `binary.ts:applyReplacement` (splice-and-rebuild) |
| Change folder traversal | `folder.ts:collectFolderIndexes` + `findFolderEntryField` |
| Add a new graph type value | `folder.ts:DEFAULT_GRAPH_TYPE_VALUES` (entity=800, status=2300, class=2400, item=4300) + index.ts graph-type consistency check (entity=20000, status=20003, class=20004, item=20005) |
| Change signal-node id mapping | `signal_nodes.ts:patchSignalNodeIds` (300000→send, 300001→monitor) |
| Add a NodeGraph type tag | `node_graph.ts:extractGraphType` (reads field 2 of depth-3 p0=10 p1=1 p2=1) |
| Debug a wrong GIL patch | `tools/decode-gia.ts <file.gia>` (decodes GIA) + check pre/post `applyReplacement` byte diffs |

## CONVENTIONS
- GIL has a non-protobuf outer wrapper — `binary.ts` does NOT rely on protobufjs for the GIL container; only `proto.ts` uses protobufjs for the GIA wrapper.
- Folder traversal: depth-3 message nesting, p0=10 (length-delimited), p1=1 (id field), p2=1 (type field).
- Graph-type consistency is enforced at two levels: `folder.ts:DEFAULT_GRAPH_TYPE_VALUES` (GIA inner type 800/2300/2400/4300) and `index.ts` (graph-type 20000/20003/20004/20005).
- `_GSTS_*` graph name prefix is the safety gate: a target graph is rejected unless empty or its name starts with `_GSTS`, unless `skipNonEmptyCheck: true` in inject options.
- `applyReplacement` is the single splice primitive; takes `Patch[] = {fieldPath, content}[]` and rebuilds the file via `buildFile`.
- Signal-node id patching scans signal name strings, NOT protobuf structure — relies on string uniqueness.

## KEY EXPORTS (public)
- `createInjector(opts): { injectBytes, injectFile }` (`index.ts:63`)
- `injectGilBytes(input)` (`index.ts:220`)
- `injectGilFile(input)` (`index.ts:227`)
- `loadGiaProto(protoPath)` (`proto.ts`) — also used by Stage 3 (`compiler/ir_to_gia_transform/index.ts`)
- `DEFAULT_GIA_PROTO` constant (resolves to `src/thirdparty/.../gia.proto`)
- Types: `Injector`, `InjectGilFileOptions`, `InjectGilFileResult`, `InjectGilInput`, `InjectGilResult` (`types.ts`)

## ANTI-PATTERNS
- Do NOT modify protobuf structure assumptions in `binary.ts` without checking the game update — header tags (`0x0326` / `0x0679`) and folder nesting are reverse-engineered.
- Do NOT skip the `_GSTS_*` safety check unless `skipNonEmptyCheck: true` is explicitly passed — without it, you risk overwriting user-authored graphs.
- Do NOT patch signal-node ids based on protobuf structure — `signal_nodes.ts` scans strings, not fields, for a reason.
- Do NOT call `loadGiaProto` more than once per path — it is memoized.
- `proto.ts` uses protobufjs but `binary.ts` does NOT — do not consolidate, the GIL container is non-protobuf.

## NOTES
- `index.ts` enforces graph-type consistency: entity=20000, status=20003, class=20004, item=20005. Mismatch throws.
- `folder.ts:DEFAULT_GRAPH_TYPE_VALUES` maps GIA inner type tags: entity=800, status=2300, class=2400, item=4300. These are different from the outer graph-type tags above.
- `binary.ts:parseMessage` is a custom recursive LenField walker (not protobufjs).
- The injector is platform-dependent: Windows-specific paths via `cli/gil_paths.ts` (China vs Global regions).
- `node_graph.ts:findNodeGraphTargets` is a fast signature-based search — no full protobuf decode — used for `gsts.inject.nodeGraphId` matching.
- `signal_nodes.ts:patchSignalNodeIds` only handles `send` (300000) and `monitor` (300001); other placeholder ids are not yet supported.
- Auto-backup before inject is handled in `cli/gsts.ts:maybeBackupGil`, not here.
