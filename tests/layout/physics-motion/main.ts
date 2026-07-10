import { g } from 'genshin-ts/runtime/core'

import { setPhysicsParams } from './composites/set-physics-params.js'
import { PHYSICS_CUSTOM_VARIABLES } from './helpers/variables.js'

g.server({
  name: '物理运动',
  id: 1073741904,
  variables: {}
}).on('whenEntityIsCreated', (e, f) => {
  f.fork(
    () => {
      const prefabIdFromCustomVariable = f
        .getCustomVariable(e.eventSourceEntity, PHYSICS_CUSTOM_VARIABLES.physicsPrefabId)
        .asType('prefab_id')
      const createPrefab = f.node('create_prefab', [prefabIdFromCustomVariable])
      f.link(f.entry(), 0, createPrefab)
    },
    () => {
      f.callComposite(setPhysicsParams, {
        目标实体: e.eventSourceEntity
      })
    }
  )
})
