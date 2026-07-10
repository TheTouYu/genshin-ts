import { g } from 'genshin-ts/runtime/core'
import { bool, float } from 'genshin-ts/runtime/value'

import { setPhysicsParams } from './composites/set-physics-params.js'
import { updateVelocityAndAngularVelocity } from './composites/update-vw.js'
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
    },
    () => {
      f.callComposite(updateVelocityAndAngularVelocity, {
        接触地面: new bool(false),
        更新间隔: new float(0.02)
      })
    }
  )
})
