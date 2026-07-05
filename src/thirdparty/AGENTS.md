# src/thirdparty/ — Vendored MIT Data

## OVERVIEW
A single subdirectory `Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/` (Wu-Yijun's MIT-licensed reverse-engineered data). **Fork-merged into this repo as a subdir** (not a git submodule) so `npm install` brings it in without an extra network call.

## STRUCTURE
```
src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/
├── protobuf/
│   ├── gia.proto            # 14 KB — protobuf schema for .gia wrapper
│   ├── gia.proto.ts         # 18 KB — auto-generated protobufjs bindings
│   └── decode.ts            # 5 KB — `decode_gia_file` (used by tools/decode-gia.ts)
├── gia_gen/                 # TypeScript code-gen of node types
│   ├── nodes.ts             # 30 KB
│   ├── graph.ts             # 23 KB
│   ├── basic.ts             # 29 KB
│   ├── utils.ts             # 6 KB
│   ├── extract.ts
│   └── index.ts
└── node_data/               # Vendor node metadata
    ├── node_id.ts           # 210 KB — vendor `NODE_ID` map
    ├── node_pin_records.ts  # 168 KB — pin records per node
    ├── enum_id.ts           # 15 KB — enum id mapping
    ├── concrete_map.ts
    ├── types_list.ts
    ├── helpers.ts
    └── index.ts
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new protobuf field | `protobuf/gia.proto` (regenerate `.proto.ts` if needed) + `compiler/ir_to_gia_transform/index.ts` |
| Find a node ID | `node_data/node_id.ts` (vendor map; lowercase keys) |
| Find pin records for a node | `node_data/node_pin_records.ts` (168 KB) |
| Find an enum ID | `node_data/enum_id.ts` |
| Change the GIA wrapper shape | `protobuf/gia.proto` + `src/injector/proto.ts:loadGiaProto` |
| Decode a GIA binary | `protobuf/decode.ts:decode_gia_file` (used by `tools/decode-gia.ts`) |
| Find the Graph/Node/Pin API | `gia_gen/index.ts` (re-exported via `src/compiler/gia_vendor.ts`) |

## CONVENTIONS
- **Vendored at the subdir level** — no git submodule, no npm dep. Easier for `npm install` but harder to update.
- Most files at the boundary are `// @ts-nocheck thirdparty` annotated to skip type-checking (since the vendor code may not match our strict TS settings).
- Re-exported through `src/compiler/gia_vendor.ts` (the only public-facing entry point for the vendor API).
- `protobuf/gia.proto` is loaded by `src/injector/proto.ts:loadGiaProto` (memoized per path).
- `node_data/node_pin_records.ts` is **mirrored** in `scripts/testgen/vendor_ids.ts:SPECIAL_NODE_MAPPINGS` for the test generator.
- The vendor `NODE_ID` map is keyed by lowercase node names; case-sensitive lookups must `.toLowerCase()` first.

## KEY EXPORTS (re-exported via `src/compiler/gia_vendor.ts`)
- `Graph`, `Node`, `Pin` (`gia_gen/`)
- `wrap_gia` (`gia_gen/index.ts`)
- `NODE_ID` (`node_data/node_id.ts`)
- `NodePinRecords` (`node_data/node_pin_records.ts`)
- `EnumId` (`node_data/enum_id.ts`)
- `decode_gia_file` (`protobuf/decode.ts`)

## ANTI-PATTERNS
- **DO NOT HAND-EDIT** anything in `src/thirdparty/`. It is vendored MIT data; update by bumping the fork.
- Do NOT add `any` workarounds outside the existing `// @ts-nocheck thirdparty` annotations — extend the annotation, don't bypass TS elsewhere.
- Do NOT import directly from `src/thirdparty/...` in user code — go through `src/compiler/gia_vendor.ts` (which re-exports the public API).
- Do NOT change the `gia.proto` schema without coordinating with the vendor's updates — divergence breaks the GIA format.
- Do NOT modify `node_id.ts` / `node_pin_records.ts` to add custom entries — instead, add an override in `compiler/ir_to_gia_transform/mappings.ts:SPECIAL_NODE_MAPPINGS` or `node_id.ts:resolveGiaNodeId` (project-controlled).

## NOTES
- The vendor's approach was "more complete" than the project's own reverse-engineering (per `README.md:Special Thanks`); the project integrates it and merges some of its own data.
- `node_data/node_id.ts` (210 KB) is the **single largest** file in the repo outside of `src/definitions/nodes.ts`.
- `audit-vendor-gia-files.ts` (in `scripts/`) checks for missing node records; runs as part of consistency CI.
- Update workflow: bump the upstream fork, re-vendor, re-run `npm run gen` + `audit-vendor-gia-files.ts`.
- The vendor fork is MIT-licensed; original work by Wu-Yijun at https://github.com/Wu-Yijun/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack.
- The 168 KB `node_pin_records.ts` is consumed directly by `compiler/ir_to_gia_transform/mappings.ts` (488 LoC) and mirrored in `scripts/testgen/vendor_ids.ts`.
