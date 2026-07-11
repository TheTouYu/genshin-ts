# CLI and configuration route

Use this module for `gsts` commands, config loading, build orchestration, dev mode, maps, backups, or generated resource extraction.

## Authoritative documents and source

- `README_ZH.md`
- `docs/architecture/injector-system.md` for injection-related CLI behavior
- `src/cli/gsts.ts`: command dispatch and compile/inject orchestration
- `src/compiler/gsts_config.ts`: bilingual config contract
- `src/compiler/config_loader.ts`: tsx child-process config loading
- `src/cli/gil_paths.ts`: region/player/map path resolution
- `src/cli/data.ts`, `state.ts`: backups and CLI state
- `src/cli/gil_resources.ts`, `gil_signals.ts`: extraction side effects

## Commands

```text
gsts <file>       compile and/or inject based on file extension
gsts dev         watch and reinject according to config
gsts maps        list map .gil files and recent timestamps
gsts open map    locate the configured map
gsts --noinject   compile without file injection
```

Use the actual repository entry point (`node bin/gsts.mjs` or installed `gsts`), not an assumed npm script.

## Safety and side effects

- `gsts maps` is discovery only; `[recent]` does not authorize target selection.
- Confirm region, player, map, graph, and operation before injection or cleanup.
- Injection normally creates backups; do not bypass safety checks casually.
- Resource/signal extraction can modify tracked files; inspect and revert unrelated generated changes.
- Batch and single-file injection may resolve `nodeGraphId` differently; use `game-map-injection.md` for map operations.
