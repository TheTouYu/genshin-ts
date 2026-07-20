import { g } from 'genshin-ts/runtime/core'
import { guid } from 'genshin-ts/runtime/value'

// undefined修正
// gsts.f._3dVectorAddition([1, 2, 3], [4, 5, 6])

g.server({
  id: 1073741912
}).on('whenEntityIsCreated', (evt, f) => {
  gsts.f._3dVectorAddition([1, 2, 3], [4, 5, 6])
  if (evt.eventSourceGuid === new guid(455)) {
    if (evt.eventSourceGuid === new guid(123)) {
      f.printString('entity 123 created')
    } else if (evt.eventSourceGuid === new guid(456)) {
      f.printString('entity 456 created')
    } else {
      f.printString('entity created')
    }
  }
})
