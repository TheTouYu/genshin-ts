# gsts.config.ts

Common fields:

- `compileRoot`
- `entries`
- `outDir`
- `inject`
- `assets`
- `options.optimize`

All optimize options are enabled by default.

## Static prefab assembly

Root `-c/--config` is the project config and provides language, region, player, and map-location context. Static assembly commands load a separate asset config through `--asset-config`. An asset config needs only a default object export and at least one non-empty `assets.staticAssemblies` or `assets.staticPrefabUpdates` array; it does not need non-empty compiler `entries`, while normal compilation keeps strict validation. Subcommand `--config` remains a deprecated alias and cannot disagree with `--asset-config`.

`assets.staticAssemblies` builds new static custom prefabs from an existing template closure in the target map and confirmed official base-model resources:

```ts
import type { GstsConfig } from 'genshin-ts'

const config = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  assets: {
    staticAssemblies: [
      {
        name: 'Example assembly',
        prefabId: NEW_PREFAB_ID,
        templatePrefabId: TEMPLATE_DEFINITION_ID,
        templateInstanceId: TEMPLATE_INSTANCE_ID,
        templateName: 'Confirmed template name',
        position: [0, 0, 0],
        color: { enabled: true, rgb: 0xff0000, opacity: 100, overlay: 'overwrite' },
        components: [{ type: 'followMotion', preset: 'fullFollow' }],
        items: [
          {
            resourceId: CONFIRMED_RESOURCE_ID,
            position: [-1, 0, 0],
            scale: [2, 0.5, 0.5],
            color: { enabled: true, rgb: 0x00ffff, opacity: 66, overlay: 'multiply' }
          },
          {
            resourceId: CONFIRMED_RESOURCE_ID,
            position: [1, 0, 0],
            rotation: [0, 0, 45],
            color: { enabled: false }
          }
        ],
        definitionAuxiliaryIds: [UNUSED_DEFINITION_ID_1, UNUSED_DEFINITION_ID_2],
        instanceAuxiliaryIds: [UNUSED_INSTANCE_ID_1, UNUSED_INSTANCE_ID_2]
      }
    ]
  }
} satisfies GstsConfig

export default config
```

The assembly Transform uses scene coordinates; item Transforms are local to its origin. `scale: [1, 1, 1]` means the resource's original size and does not guarantee a universal in-game 1×1×1 size. Template definition and instance IDs are not guaranteed to match and must be confirmed separately. Colors use `0xRRGGBB`, an opacity from 0–100, and an `overwrite` or `multiply` overlay; `enabled: false` disables custom color. Omitting `color` inherits the template snapshot while preserving other unknown fields such as material settings.

`components` currently supports two conservative snapshots. `{ type: 'followMotion', preset: 'fullFollow' }` adds Follow Motion—Full Follow to both the definition and instance, following target position and orientation. `{ type: 'basicMotion', preset: 'default' }` adds the default Basic Motion snapshot observed on a real empty-model prefab. Omitting `components` adds nothing and preserves all template components. Follow Motion and Basic Motion both have real-GIL, regression, bounded-writeback, and user-confirmed game evidence. Basic Motion was also rescanned after the editor saved the map, confirming both component snapshots. Neither snapshot exposes unverified fine-grained meanings for its internal numeric fields.

Prefab categories support both updating existing tabs and creating new tabs. Set `create: true` to create one; when `id` is omitted, the tool reads the largest category ID under `root` and adds one. The display name is written to category `field 1`, and the category ID to `field 3`. For example:

```ts
assets: {
  staticPrefabCategories: [
    { name: 'Learning', prefabIds: [COLOR_REFERENCE_ID, BASIC_MOTION_REFERENCE_ID] },
    { name: 'Cube', prefabIds: [CUBE_PART_ID_1, CUBE_PART_ID_2] },
    { name: 'Base Prefabs', prefabIds: [SPHERE_ID, CUBOID_ID] },
    { name: 'Motion Devices', create: true, prefabIds: [BASIC_MOTION_ID] }
  ]
}
```

Update mode requires an existing category name. Create mode requires a new name and may take an explicit `id`; otherwise the current root maximum plus one is used. Every prefab ID must be a current definition, and an ID cannot appear in multiple custom categories. After custom assignment, `kind=100` definition members are removed from the default Unclassified tab; other system and scene index entries remain. The tool does not infer categories from names or fabricate IDs for system-resource references or scene instances without custom definition records. Category creation and exclusive migration have automatic regression, real-map writeback and post-editor-save reread evidence, plus user-confirmed game validation.

Use `assets.staticPrefabUpdates` to modify existing prefabs in place instead of creating new ones:

```ts
assets: {
  staticPrefabUpdates: [
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: 'Current confirmed name',
      components: [{ type: 'basicMotion', preset: 'default' }]
    },
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: 'Current confirmed name',
      scale: [0.01, 0.01, 0.01]
    }
  ]
}
```

The operation fails closed unless the IDs, names, and instance-to-definition reference match. `components` updates both the definition and selected instance, replacing an existing slot of the same component type instead of duplicating it. `position` changes only the selected scene instance while preserving its rotation, scale, and prefab definition; `scale` changes only the selected scene instance while preserving its position, rotation, and prefab definition. No prefab or auxiliary IDs are created. Preview remains the default; `--output` writes an offline candidate and `--write` backs up before writeback. In-place updates have automatic regression and offline real-map candidate validation, but each writeback and game result still requires separate confirmation.

For a complex model, move the main color and `items` into a strict JSON structure file while keeping map-specific names, templates, IDs, and scene Transform in the config:

```ts
{
  name: 'File assembly',
  prefabId: NEW_PREFAB_ID,
  templatePrefabId: TEMPLATE_DEFINITION_ID,
  templateInstanceId: TEMPLATE_INSTANCE_ID,
  templateName: 'Confirmed template name',
  position: [0, 0, 0],
  structureFile: './assemblies/model.json',
  definitionAuxiliaryIds: [UNUSED_DEFINITION_ID_1],
  instanceAuxiliaryIds: [UNUSED_INSTANCE_ID_1]
}
```

```json
{
  "$schema": "../node_modules/genshin-ts/schemas/static-assembly.schema.json",
  "schemaVersion": 1,
  "color": { "enabled": true, "rgb": 16711680, "opacity": 100, "overlay": "overwrite" },
  "components": [{ "type": "followMotion", "preset": "fullFollow" }],
  "items": [{ "resourceId": 10009001, "position": [0, 0, 0] }]
}
```

`structureFile` is resolved relative to `gsts.config.ts` and is mutually exclusive with config-level `items`, `color`, and `components`. The loader rejects unknown versions and fields, duplicate or unknown components, empty items, invalid colors, and non-finite Transforms. This feature reads declarative JSON only; it does not extract structures from `.gil` files.

Replace every placeholder with a confirmed template, resource, and unused IDs from the target map. Never copy documentation IDs into a real write. This modifies `.gil` assets and is not GIA NodeGraph injection. Structure loading and packaged consumption have automatic regression coverage, but this new file path has no additional game validation. Color encoding has real-GIL wire evidence, automatic regression coverage, and bounded game validation: sphere, cone, cylinder, wireframe cuboid, and wireframe cylinder passed with the tested 33/50/66/100% opacity, overwrite/multiply, and disabled-color configurations. Other resources, templates, maps, and material settings still require separate validation.
