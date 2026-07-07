// Round 9/10 layout calibration repro for the real reference file `布局c.gia`.
// Shape:
// - event forks to two base lanes;
// - upper lane forks to a data-heavy node and a lower sibling print;
// - lower lane continues horizontally after its own downward placement.
//
// Reference analysis:
//   npx tsx tests/composite/analyze-exec-lanes.ts \
//     /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c.gia

import { g } from 'genshin-ts/runtime/core'

g.server({
  name: 'R6-C参考复刻-step2e',
  id: 1073741897,
  variables: {
    locationOffset: vec3([1, 2, 3]),
    rotationOffset: vec3([2, 3, 4]),
    overwriteAbilityUnitConfig: false
  }
}).on('whenEntityIsCreated', (e, f) => {
  f.fork(
    () => {
      f.printString('基础场景')

      f.fork(
        () => {
          const abilityUnit = f.dataTypeConversion(e.eventSourceGuid, 'str')
          f.initiateAttack(
            e.eventSourceEntity,
            999,
            1.2,
            f.get('locationOffset'),
            f.get('rotationOffset'),
            abilityUnit,
            f.get('overwriteAbilityUnitConfig'),
            e.eventSourceEntity
          )
        },
        () => {
          f.printString('上面一个节点图有比较多的参数，所以距离下移')
        }
      )
    },
    () => {
      f.printString('基础场景')
      f.printString('上面一条线的节点图已经占位了，所以距离继续下移')
      f.printString('这条线已经下移了，虽然上面有空间，也保持这条线，继续平移')
    }
  )
})
