# CLI Commands

- `gsts build`
- `gsts dev`
- `gsts inject`
- `gsts maps`
- `gsts open map` / `gsts open backup`
- `gsts assets:custom-variables`
- `gsts assets:static-assemblies`

## Static prefab assembly

```bash
# Preview only; does not modify the map
npm run assets:static-assemblies -- --map-id <id>

# Save an offline candidate without overwriting an existing file
npm run assets:static-assemblies -- --gil <source.gil> --output <candidate.gil>

# Explicitly back up and write
npm run assets:static-assemblies -- --map-id <id> --write
```

Preview prints source/candidate SHA-256 hashes, the prefab ID, both auxiliary ID lists, resources, item count, and touched top-level fields. A successful `--write` proves only that backup and writeback completed—not editor loading or game behavior.

Static prefab assembly writes `.gil` asset structures; GIA injection replaces a NodeGraph; `createPrefab` spawns an existing prefab at runtime. They are separate steps.
