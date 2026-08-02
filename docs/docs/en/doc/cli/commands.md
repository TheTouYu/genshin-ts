# CLI Commands

- `gsts build`
- `gsts dev`
- `gsts inject`
- `gsts maps`
- `gsts open map` / `gsts open backup`
- `gsts assets:custom-variables`
- `gsts assets:static-assemblies`
- `gsts assets:signals`

## Map discovery and static prefab assembly

```bash
# Stable, privacy-safe map JSON; hashes are computed only when requested
gsts -c gsts.config.ts maps --format json --include-hash

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

Static prefab assembly writes `.gil` asset structures; GIA injection writes a NodeGraph; `createPrefab` spawns an existing prefab at runtime. They are separate steps. `assets:signals` registers a signal by cloning real parameter layouts; `--template-gil <donor.gil>` selects an independent donor. A parameter type may occur more than once, but the donor must provide a distinct layout for every occurrence; the command fails closed instead of calculating pin indexes. Omitting `--send-id/--monitor-id/--server-id` auto-assigns consecutive IDs after the current highest occupied one; `inspect` lists registered signals read-only, `--write` verifies the source SHA before writing and auto-backs up to sibling `.gsts/backups/`, and `--output` creates but never overwrites.

Cross-map injection rebinds GIA signal identities to the target map by signal name. The injector may create the fixed first server graph `1073741825` when its folder entry already exists with `typeValue=7000` but its NodeGraph blob is absent. Other missing graph IDs still fail closed; this exception is not a general graph-creation API.
