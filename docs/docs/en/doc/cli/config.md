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

Replace every placeholder with a confirmed template, resource, and unused IDs from the target map. Never copy documentation IDs into a real write. This modifies `.gil` assets and is not GIA NodeGraph injection. Color encoding has real-GIL wire evidence, automatic regression coverage, and bounded game validation: sphere, cone, cylinder, wireframe cuboid, and wireframe cylinder passed with the tested 33/50/66/100% opacity, overwrite/multiply, and disabled-color configurations. Other resources, templates, maps, and material settings still require separate validation.
