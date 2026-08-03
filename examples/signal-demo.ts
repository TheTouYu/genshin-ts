// 最小信号演示：发送信号 test_cube_turn + 监听信号 test_cube_turn
// 信号定义与 1073741850.gil 注册表一致（face:str / direction:str）
import { defineSignal, g } from 'genshin-ts/runtime/core'

const Signal = {
  test_cube_turn: defineSignal('test_cube_turn', [
    ['face', 'str'],
    ['direction', 'str']
  ])
} as const

const graph = g
  .server({ id: 1073741825 })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.sendSignal(Signal.test_cube_turn, '上', '前')
  })
  .onSignal(Signal.test_cube_turn, (evt, f) => {
    const face = evt.params.face
    const direction = evt.params.direction
    f.printString(face)
    f.printString(direction)
  })

export default graph
