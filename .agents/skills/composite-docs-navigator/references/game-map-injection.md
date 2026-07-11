# Game-map and injection route

Use this module for `.gil` maps, `mapId`, `nodeGraphId`, `gsts maps`, injection, reinjection, or in-game validation.

## Read first

- `docs/architecture/injector-system.md`
- `docs/composite-ir/handover/layout-working-rules.md`
- `src/compiler/gsts_config.ts`
- `src/cli/gsts.ts`
- `src/cli/gil_paths.ts`
- the relevant physical-motion handover, when applicable

## Target discovery

Run the project command with the actual config:

```bash
node bin/gsts.mjs maps -c <config>
```

If WSL reports multiple LocalLow folders, use the explicit confirmed directory:

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/<user>/AppData/LocalLow \
  node bin/gsts.mjs maps -c <config>
```

Treat `[recent]` as a candidate list, not automatic authorization to choose or overwrite a map. Confirm the intended target with the user when more than one candidate exists or the map is newly created.

## ID distinction

- `mapId`: the `.gil` file under `Beyond_Local_Save_Level/<mapId>.gil`.
- `nodeGraphId`: the NodeGraph inside that map to replace.
- Observed new maps commonly assign `1073741825` to the first NodeGraph and increment later graphs. This is empirical, not a universal guarantee; use actual scan or user confirmation.

Do not infer one ID from the other.

## Physical-motion compilation

For multi-file physical-motion projects:

1. Generate the GIA first.
2. Do not assume batch injection honors `config.inject.nodeGraphId`; current batch mode may use the GIA graph ID instead.
3. Inject the generated file through single-file mode so the configured target ID is used:

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts \
  dist/tests/layout/physics-motion/main.gia
```

Set `GSTS_LOCALLOW_DIR` when required by the environment.

## Confirmation boundary

Before injection, overwriting, copying, deleting, cleaning, or enabling reinjection:

1. Show player ID, region, map ID, NodeGraph ID, target `.gil`, source `.gia`, and command.
2. Obtain explicit user confirmation.
3. Rely on the injector’s backup/safety flow; do not bypass safety checks casually.

Afterward report:

```text
injection result:
actual target file:
actual target NodeGraph ID:
source GIA:
game behavior: not yet verified / user confirmed
```

Successful injection is not game verification. Wait for the user’s in-game result before claiming the recreation works.
