# CLI Commands

- `gsts build`
- `gsts dev`
- `gsts inject`
- `gsts maps`
- `gsts maps:rename` / `gsts maps:create`
- `gsts open map` / `gsts open backup`
- `gsts assets:custom-variables`
- `gsts assets:static-assemblies`
- `gsts assets:signals`

## Map discovery and static prefab assembly

```bash
# Stable, privacy-safe map JSON; includes level map names (root 2); hashes only when requested
gsts -c gsts.config.ts maps --format json --include-hash

# Rename a level map: rewrites .gil root 2 and syncs the .gip registry name, backup to .gsts/backups
gsts -c gsts.config.ts maps:rename --map-id <id> --name <new name>

# Create a level map: writes a new-map skeleton .gil and registers it in .gip (ID = max existing + 1)
# --graphs <name1,name2,...>: also create placeholder NodeGraphs (IDs auto-allocated from 1073741825)
gsts -c gsts.config.ts maps:create --name <name> --graphs "mount-test,collision-module"

# Inspect an explicit GIL without a project config
gsts assets:static-assemblies inspect --gil source.gil --format json

# The project config locates the map; the asset config declares assemblies
gsts -c gsts.config.ts assets:static-assemblies plan \
  --asset-config assemblies.config.ts --map-id <id> --output plan.json

# The legacy preview/output/write entry remains compatible
npm run assets:static-assemblies -- --asset-config assemblies.config.ts --gil source.gil
```

Map JSON sorts by modification time descending and then map ID, and omits player directories and absolute paths by default. `recent` means only “within 30 minutes”; it is not selection or authorization. `inspect` reports definitions, instances, both auxiliary closures, Transforms, occupied IDs, template candidates, and the source hash. `plan` binds the source GIL, asset config, structure files, and normalized assembly semantics into a deterministic `planHash`; conflicts or incomplete closures produce `status=blocked` and a non-zero exit.

`inspect` and `plan` are always read-only, and `--output` creates but never overwrites. `closureStatus=complete` proves only the currently known structural checks; compatibility remains `unknown`, and automatic inspection is not editor/game validation. Subcommand `--config` remains a deprecated alias of `--asset-config`; root `-c/--config` means only the project config.

Static prefab assembly writes `.gil` asset structures; GIA injection writes a NodeGraph; `createPrefab` spawns an existing prefab at runtime. They are separate steps. `assets:signals` registers signals: omitting `--template-signal` uses **builtin parameter layouts** (bytes harvested verbatim from editor-created signals, covering str/int/float/bool/vec3/entity/guid/prefab_id/config_id and all list types; fresh-map pin bases match the editor — str=12/34/40, int=68/76/83, etc.; existing maps reuse per-type bases). Providing `--template-signal` (optionally with `--template-gil <donor.gil>` as an independent donor) clones layouts from that signal. A parameter type may occur more than once (str auto-increments send+4/mon+1/ser+1, editor-verified); repeated non-str types require a donor (no editor layout evidence; fails closed). Omitting `--send-id/--monitor-id/--server-id` auto-assigns consecutive IDs after the current highest occupied one; `inspect` lists registered signals read-only, `--write` verifies the source SHA before writing and auto-backs up to sibling `.gsts/backups/`, and `--output` creates but never overwrites.

Legacy tools may leave a registry entry whose three signal definitions are missing the signal-name layout. Normal compilation and `inspect` still reject this malformed structure. Use `assets:signals repair --target-signal <name> --template-gil <verified-donor.gil> --template-signal <name>` to replace only those three definitions from a complete donor. Use `--output` for a candidate first. Repair preserves the target name and IDs, requires an identical parameter schema, and fails when definitions are ambiguous or the donor is incomplete. `--write` retains source-SHA checking, backup, candidate read-back, and post-write strict read-back.

Cross-map injection rebinds GIA signal identities to the target map by signal name. The injector may create the fixed first server graph `1073741825` when its folder entry already exists with `typeValue=7000` but its NodeGraph blob is absent. Other missing graph IDs still fail closed; this exception is not a general graph-creation API.
