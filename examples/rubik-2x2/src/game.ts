// P4 最小实验：选项卡选中 → 事件链路 + tabId 值域 + 旋转配方
// 核验点：
//   ① whenTabIsSelected 是否在控制器实体挂载的图上触发（事件链路）
//   ② tabId 值域（0-5 还是 1-6）——日志打印
//   ③ addUniformBasicRotationBasedMotionDevice 配方：axis=[1,0,0]、90°/s、1s
//      ——控制器是否绕 X 轴转 90°；再点一次看是局部轴还是世界轴
import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({ id: 1073741825 })
  .on('whenTabIsSelected', (evt, f) => {
    f.printString(f.dataTypeConversion(evt.tabId, 'str'))
    f.addUniformBasicRotationBasedMotionDevice(
      evt.eventSourceEntity,
      'turn-test',
      1,
      90,
      f.create3dVector(1, 0, 0)
    )
  })

export default graph
