// @ts-nocheck
// U2b 差分实验（2026-08-16）：同图多实体挂载下，图变量是否 per-instance 隔离
// 背景：U2 已验证多挂载各实例独立执行，但图变量隔离未验证——灯阵 9 灯柱共享一张图，
//       lit/灯头引用存图变量还是实体自定义变量取决于本实验。
// 设计：whenEntityIsCreated → set 图变量 X = getSelfEntity() → print(X)
// 判定（日志）：挂载 N 个实体 → X 打印值 = 触发实例的实体 ID（per-instance 隔离）
//       = 最后写入值被所有实例读到（共享，需规避：改用实体自定义变量）
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({
    id: 1073741837,
    variables: {
      probe: { type: 'entity' }
    }
  })
  .on('whenEntityIsCreated', (_e: any, f: any) => {
    f.set('probe', f.getSelfEntity())
    f.printString('u2b-set')
    f.printString(f.get('probe'))
  })

export default graph
