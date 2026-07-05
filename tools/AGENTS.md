# tools/ — Interactive GIA Analysis

## OVERVIEW
TS scripts for hand-inspecting GIA samples. **NOT in any npm script** — invoke via `npx tsx tools/<x>.ts <file.gia>`. Distinct from `scripts/` (CI/release work — see `scripts/AGENTS.md`).

## STRUCTURE (8 files)
| File | Lines | Role |
|------|-------|------|
| `decode-gia.ts` | 31 | `decode_gia_file` → JSON; designed for `jq` pipelines. Usage: `npx tsx tools/decode-gia.ts <file.gia> \| jq` |
| `analyze-gia-arch.ts` | 209 | 3 hard-coded sample GIAs; prints top-level keys, graph structure, node kind distribution |
| `analyze-composite-gia.ts` | 332 | Single/multi-file CompositeDef & SignalDef analyzer; `formatInterface` (I/O/In/Out) and per-file lookup table |
| `topology.ts` | 172 | ASCII topology printer of main-graph exec flow with composite-call resolution |
| `gap-scan.ts` | 226 | Heuristic-based *unknown pattern* detection: large impl graphs, nesting density, pin fan-out, relatedIds non-empty |
| `coverage.ts` | 243 | *Known pattern* classifier; reports documented vs undocumented CompositeDef patterns (PATTERNS[] e.g. 纯数据复合/基本执行型/终端下沉型) |
| `dump-layout.ts` | 62 | `@ts-nocheck`; extract node X/Y + pin connections from `dist/.../gia.proto`; uses inline `NODE_PIN_RECORDS` lookup |
| `preview_markdown.ts` | 38 | Wraps `src/cli/markdown_render.ts` for CLI preview |

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Decode a GIA file to JSON | `npx tsx tools/decode-gia.ts <file.gia> \| jq` |
| Get a structural overview of a GIA | `npx tsx tools/analyze-gia-arch.ts <file.gia>` |
| Inspect composite definitions | `npx tsx tools/analyze-composite-gia.ts <file.gia>` |
| Print the topology tree | `npx tsx tools/topology.ts <file.gia>` |
| Find unknown patterns (heuristic) | `npx tsx tools/gap-scan.ts <file.gia>` |
| Check known pattern coverage | `npx tsx tools/coverage.ts <file.gia>` |
| Dump editor layout positions | `npx tsx tools/dump-layout.ts <file.gia>` |
| Preview markdown in CLI | `npx tsx tools/preview_markdown.ts <file.md>` |

## CONVENTIONS
- **All 8 tools are run via `npx tsx tools/<x>.ts <file.gia>`** (not in `package.json` scripts).
- `decode-gia.ts` is the ground-truth GIA decoder — pairs with `jq` for ad-hoc queries.
- `analyze-gia-arch.ts` has **3 hard-coded sample GIA files** baked in (not configurable via argv in default invocation).
- `gap-scan.ts` and `coverage.ts` are complementary: `gap-scan` finds UNKNOWN patterns, `coverage` classifies KNOWN patterns.
- `topology.ts` is the only ASCII visualization tool — output is meant to be read by eye.
- `dump-layout.ts` uses `@ts-nocheck` because it reaches into the protobuf schema directly.
- `preview_markdown.ts` is the only non-GIA tool — wraps `src/cli/markdown_render.ts` for CLI preview.

## KEY EXPORTS (each tool is a standalone script)
- `decode-gia.ts` → calls `decode_gia_file(filePath)` (from `src/thirdparty/.../protobuf/decode.ts`)
- `analyze-gia-arch.ts` → uses hard-coded samples, prints structure
- `analyze-composite-gia.ts` → `formatInterface(compositeDef)` returns string with I/O/In/Out pins
- `topology.ts` → ASCII tree printer with composite-call resolution
- `gap-scan.ts` → heuristic thresholds (large impl / nesting density / pin fanout / relatedIds)
- `coverage.ts` → `PATTERNS[]` classifier (纯数据复合/基本执行型/终端下沉型, etc.)
- `dump-layout.ts` → reads `dist/.../gia.proto` + inline `NODE_PIN_RECORDS`
- `preview_markdown.ts` → calls `markdown_render(md)` from `src/cli/markdown_render.ts`

## ANTI-PATTERNS
- Do NOT add a tool that depends on `dist/` being built (except `dump-layout.ts` which already does) — these are dev-time analysis scripts.
- Do NOT add a tool to `tools/` that is part of the CI/release flow — use `scripts/` instead.
- Do NOT hard-code sample GIA paths in a new tool without making them configurable via argv.
- Do NOT add a tool that mutates a GIA file — these are read-only analyzers.
- Do NOT remove `@ts-nocheck` from `dump-layout.ts` — the inline schema access requires it.

## NOTES
- `复杂gia/` (in repo root) is a WSL symlink to Windows-side GIA samples — used by these tools. Update with: `ln -s /mnt/c/.../复杂gia 复杂gia`.
- The 3 hard-coded samples in `analyze-gia-arch.ts` are good starting points for first-time GIA inspection.
- `gap-scan.ts` and `coverage.ts` are part of a feedback loop: scan finds unknown patterns → reverse engineer → add to `coverage.ts:PATTERNS[]`.
- `topology.ts` output is the most-used visualization for debugging graph flow.
- These tools are **NOT** invoked by `npm test` or any CI workflow — they are 100% developer-driven.
- For bulk-comparison (e.g. test-composite output vs reference), use `tests/composite/gia-compare.ts` + `diff_gia.py` (in `tests/composite/`), not these tools.
