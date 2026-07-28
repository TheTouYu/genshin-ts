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
        templatePrefabId: TEMPLATE_PREFAB_ID,
        templateName: 'Confirmed template name',
        position: [0, 0, 0],
        items: [
          { resourceId: CONFIRMED_RESOURCE_ID, position: [-1, 0, 0], scale: [2, 0.5, 0.5] },
          { resourceId: CONFIRMED_RESOURCE_ID, position: [1, 0, 0], rotation: [0, 0, 45] }
        ],
        definitionAuxiliaryIds: [UNUSED_DEFINITION_ID_1, UNUSED_DEFINITION_ID_2],
        instanceAuxiliaryIds: [UNUSED_INSTANCE_ID_1, UNUSED_INSTANCE_ID_2]
      }
    ]
  }
} satisfies GstsConfig

export default config
```

The assembly Transform uses scene coordinates; item Transforms are local to its origin. `scale: [1, 1, 1]` means the resource's original size and does not guarantee a universal in-game 1×1×1 size. Unknown color/material fields currently inherit from template items; arbitrary colors are not exposed.

Replace every placeholder with a confirmed template, resource, and unused IDs from the target map. Never copy documentation IDs into a real write. This modifies `.gil` assets and is not GIA NodeGraph injection.
