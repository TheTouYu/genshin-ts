# src/cli/ — gsts CLI

## OVERVIEW
The `gsts` CLI binary. `bin/gsts.mjs` is a 3-line shim to `dist/src/cli/gsts.js` (postbuild artifact). Source is `src/cli/gsts.ts` — a 1,523 LoC commander-based monolith with 31 top-level functions.

## STRUCTURE (15 files)
| File | Role |
|------|------|
| `gsts.ts` | **1,523 LoC god-file** — `main()` at L1456 wires commander; 31 top-level fns; no exports (entry point) |
| `gil_paths.ts` | Windows-only: resolves `%LocalAppData%\..\LocalLow\miHoYo\原神\BeyondLocal\<playerId>\Beyond_Local_Save_Level\<mapId>.gil`; `detectGameRegion` (China vs Global) |
| `gil_resources.ts` | `extractCustomResourcesFromGil` → writes `src/resources/prefabs.ts` (header `// @gsts:resources`) |
| `gil_signals.ts` | `extractSignalsFromGil` → writes `src/resources/signals.ts` (header `// @gsts:signals`) |
| `gil_extract_utils.ts` | `decodeUtf8` / `readGilPayloadFields` / `writeGeneratedFile` (idempotent: skipped-existing if file is already stamped with the matching header) |
| `state.ts` | `CliState` (`lastBackupAtByMap`, `updateCheck`, `noticeCheck`) persisted in `state.json` |
| `data.ts` | `getDataDir` = `%APPDATA%\genshin-ts`; backs up to `backups/<playerId>/<mapId>/<timestamp>.gil`, capped at 200 per map |
| `checks.ts` | Remote-markdown update/notice check against `Changelog.md` / `Announcement.md` on `josStorer/genshin-ts` |
| `ui.ts` | Colored console helpers (no real TUI) |
| `markdown_render.ts` | 892 B — used by both `tools/preview_markdown.ts` and `cli/checks.ts` |
| `net.ts` | HTTP client (used by `checks.ts` + `update_changelog.ts`) |
| `pkg.ts` | Version/package metadata |
| `update_changelog.ts` | Lists `genshin-ts` releases from npm registry |
| `notice_frontmatter.ts` | Parses frontmatter for update notices |
| `windows_open.ts` | `openDir` / `openAndSelect` (xdg-open / explorer) |

## SUBCOMMAND DISPATCH (in `gsts.ts`)
| Subcommand | Anchor | Handler | Behavior |
|------------|--------|---------|----------|
| `gsts [file]` (default) | L1462-1482 | `runSingle(file)` L1369 else `runBatch(opts)` L484 | Compile + GIA + inject + extract |
| `gsts dev` | L1484-1490 | `runDev(opts)` L592 | chokidar watch, dep-graph, dev-mode inject |
| `gsts maps` | L1492-1498 | `runMaps(opts)` L1177 | List discovered playerId+mapId from Beyond_Local_Export |
| `gsts open [target]` | L1500-1507 | `runOpen(target, opts)` L1204 | target ∈ `{data, backup, map}` |
| `gsts help` | L1509-1514 | `program.help()` | — |

`runSingle` is smart about file extension: `.gia` → inject only; `.json` → GIA+inject; else compile→GS→IR→GIA→inject.

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add a new subcommand | `gsts.ts:main()` (L1456), add to commander program + handler |
| Change inject flow | `gsts.ts:runSingle` (L1369) → `compileTsToGs` → `emitIrJsonForEntries` → `writeGiaFromOutJson` → `maybeInjectGia` |
| Change watch-mode behavior | `gsts.ts:runDev` (L592), dep-graph at L290-484 |
| Add a GIL resource type | `gil_extract_utils.ts` + `gil_resources.ts` (or `gil_signals.ts` for signals) |
| Change Windows path resolution | `gil_paths.ts:resolveGilTarget` + `detectGameRegion` (China vs Global) |
| Change backup strategy | `data.ts` (200-per-map cap) + `gsts.ts:maybeBackupGil` |
| Add update check | `checks.ts` (remote markdown against Changelog.md / Announcement.md) |
| Add i18n string | `src/i18n/locales/{en-US,zh-CN}/main.json` + `t(key, options)` |

## CONVENTIONS
- All 31 top-level functions in `gsts.ts` are internal (no `export`); `main()` is the only export.
- File extensions auto-detect the entry: `.ts` → full pipeline; `.gs.ts` → IR+; `.json` → GIA+; `.gia` → inject only.
- `gsts.config.ts` is the default project config (`-c <file>` overrides); loaded via `tsx` child process by `src/compiler/config_loader.ts`.
- `cli/state.ts:CliState` is persisted in `state.json`; `loadState` / `saveState` are the read/write API.
- `cli/gil_extract_utils.ts:writeGeneratedFile` is idempotent — skipped-existing if the file is already stamped with the matching header (`// @gsts:resources` or `// @gsts:signals`).
- Auto-backup before inject: `gsts.ts:maybeBackupGil` (capped at 200 per map in `data.ts`).
- i18n: all user-facing strings use `t(key, options)` from `src/i18n/`; default lang is auto-detected via `detectLang` (env → OS locale → Intl).
- Env vars forwarded to child stages: `GSTS_OPT_TIMER_DISPATCH` (from `gsts.config.ts:options.optimize.timerDispatchAggregate`, L80-82).

## KEY EXPORTS (public)
- `main()` (`gsts.ts:1456`) — only export; wired via `bin/gsts.mjs` → `dist/src/cli/gsts.js`
- `injectGilBytes`, `injectGilFile`, `createInjector` — re-exported from `src/injector/` via `src/index.ts`

## ANTI-PATTERNS
- Do NOT add `Promise`/`async`/`await` in `gsts.ts` (it's host code, so it's allowed by lint, but avoid for consistency with the rest of the CLI helpers).
- Do NOT skip the inject safety check unless `skipSafeCheck: true` is passed in `gsts.config.ts:inject`.
- Do NOT commit a new feature without a corresponding `bin/gsts.mjs` shim update (it's the published entry point).
- Do NOT modify `data.ts` backup cap without checking existing backups in `~/.genshin-ts/backups/`.
- `update_changelog.ts` polls the npm registry — do NOT call it from `pretest` or any test path.

## NOTES
- `gsts.ts` is a self-contained god-file; natural split: `cli/commands/compile.ts`, `cli/commands/dev.ts`, `cli/commands/inject.ts`, `cli/dep_graph.ts` (lift the DepGraph code at L290-484).
- Windows path detection: `gil_paths.ts` reads `%LocalAppData%` and resolves the `BeyondLocal` parent dir. China: `原神\\BeyondLocal`; Global: `Genshin Impact\\BeyondLocal`.
- `tools/preview_markdown.ts` reuses `cli/markdown_render.ts` — keep them in sync.
- Auto-extract on inject: `extractResources` and `extractSignals` flags in `gsts.config.ts:inject` (default `src/resources/prefabs.ts` and `src/resources/signals.ts`).
- The `reinjectOnMapChange` flag (default true) auto-reinjects when the GIL file changes externally.
- `data.ts` and `state.ts` use Node's `appdir`-style path resolution; cross-platform is best-effort.
