// Real-GIA layout reproduction: 物理运动.gia Step 0.
// Reference block:
//   n38 When Entity Is Created @ (-4191, 1991)
//     -> n29 Create Prefab       @ (-3355, 1812)
//     -> n12 设置物理参数        @ (-3899, 2315)
// Purpose: establish the first real-file fan-out baseline before adding the larger
// physics-controller blocks. This step keeps the reference control/data shape:
// event.OutFlow -> create_prefab and 设置物理参数, and event data feeds both branches.

import { g } from 'genshin-ts/runtime/core'

const setPhysicsParams = g.defineComposite('设置物理参数-step0', {
  inputs: {
    targetEntity: { type: 'entity' }
  },
  outputs: {},
  build(args, f) {
    f.printString('设置物理参数-step0')
    f.printString(str(args.targetEntity))
    return {}
  }
})

g.server({
  name: '物理运动-step0-init',
  id: 1073741904,
  variables: {}
}).on('whenEntityIsCreated', (e, f) => {
  f.fork(
    () => {
      const prefabIdFromCustomVariable = f
        .getCustomVariable(e.eventSourceEntity, '物理计算元件id')
        .asType('prefab_id')
      const createPrefab = f.node('create_prefab', [prefabIdFromCustomVariable])
      f.link(f.entry(), 0, createPrefab)
    },
    () => {
      f.callComposite(setPhysicsParams, {
        targetEntity: e.eventSourceEntity
      })
    }
  )
})
