import { g } from 'genshin-ts/runtime/core'
import { bool, float } from 'genshin-ts/runtime/value'

import { calculatePhysicalMotionState } from './composites/calculate-physical-motion-state.js'
import { setPhysicsParams } from './composites/set-physics-params.js'
import { updateVelocityAndAngularVelocity } from './composites/update-vw.js'
import { PHYSICS_CUSTOM_VARIABLES } from './helpers/variables.js'

g.server({
  name: '物理运动-physics-R8-step3-exec-lanes60pct',
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
      const angularVelocity = f
        .getNodeGraphVariable('w')
        .asType('vec3')
      const velocity = f.getNodeGraphVariable('v').asType('vec3')
      const motionState = f.callComposite(calculatePhysicalMotionState, {
        w: angularVelocity,
        v: velocity
      })
      f.callComposite(updateVelocityAndAngularVelocity, {
        接触地面: motionState.接触地面,
        更新间隔: new float(0.02)
      })
    }
  )
})
