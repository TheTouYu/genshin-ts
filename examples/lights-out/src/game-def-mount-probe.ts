// 实验：def 挂载继承探测（2026-08-16）
// 挂载到灯柱 def 1077936129；若动态 createPrefab 实体继承 def 挂载，
// 该图会在灯柱（含静态 50 实体 + 动态新实体）创建时执行
import { g } from 'genshin-ts/runtime/core'
const graph = g.server({ id: 1073741829 })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.printString('DEF-MOUNT-FIRED')
  })
export default graph
