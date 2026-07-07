// @ts-nocheck

import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { float, str, vec3 } from '../../dist/src/runtime/value.js'

g.server({
  mode: 'beyond',
  type: 'entity',
  id: 1073741897,
  name: 'R6-C参考复刻',
  prefix: false,
  variables: {
    locationOffset: new vec3([1, 2, 3]),
    rotationOffset: new vec3([2, 3, 4]),
    overwriteAbilityUnitConfig: false
  }
}).on('whenEntityIsCreated', (e, f) => {
  const entry = f.entry()
  const n2 = f.node('print_string', [new str('基础场景')])
  const n3 = f.node('print_string', [new str('基础场景')])
  const n6 = f.get('locationOffset')
  const n7 = f.get('rotationOffset')
  const n8 = f.dataTypeConversion(e.eventSourceGuid, 'str')
  const n10 = f.get('overwriteAbilityUnitConfig')
  const n5 = f.node('initiate_attack', [
    e.eventSourceEntity,
    new float(999),
    new float(1.2),
    n6,
    n7,
    n8,
    n10,
    e.eventSourceEntity
  ])
  const n11 = f.node('print_string', [new str('上面一个节点图有比较多的参数，所以距离下移')])
  const n12 = f.node('print_string', [new str('上面一条线的节点图已经占位了，所以距离继续下移')])
  const n13 = f.node('print_string', [
    new str('这条线已经下移了，虽然上面有空间，也保持这条线，继续平移')
  ])
  f.link(entry, 0, n2)
  f.link(entry, 0, n3)
  f.link(n2, 0, n5)
  f.link(n2, 0, n11)
  f.link(n3, 0, n12)
  f.link(n12, 0, n13)
})

console.log(JSON.stringify(buildServerGraphRegistriesIRDocuments()[0], null, 2))
