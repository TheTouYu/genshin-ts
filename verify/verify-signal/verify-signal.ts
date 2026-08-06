// 核验点：自定义信号 verify_signal（face:str / direction:str）全链路
// 背景：新地图 1073741853.gil「gsts-verify」由 assets:signals register 自动初始化
// 注册表（field 10.5 缺失时自动建空注册表，donor=1073741848 cube_turn 模板），
// verify_signal send=1610612741 monitor=1610612742 server=1610612743。
// 正确行为：实体创建时发送 verify_signal('上','前')，监听器打印 face 和 direction
// 各一次（"上"、"前"）；不报错、不重复。
// 错误行为：注册表结构损坏 → 注入/加载报错；信号 ID 冲突 → 行为串线。
import { defineSignal, g } from 'genshin-ts/runtime/core'

const Signal = {
  verify_signal: defineSignal('verify_signal', [
    ['face', 'str'],
    ['direction', 'str']
  ])
} as const

// 注意：与 inflow-index 分支共存于 ./verify，DSL id 必须互不相同（merge 按图 id 合并）；
// 单文件注入会改写为 config.inject.nodeGraphId，故 DSL id 不影响注入目标。
const graph = g
  .server({ id: 1073741826 })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('verify-signal-before')
    f.sendSignal(Signal.verify_signal, '上', '前')
    f.printString('verify-signal-after')
  })
  .onSignal(Signal.verify_signal, (evt, f) => {
    f.printString(evt.params.face)
    f.printString(evt.params.direction)
  })

export default graph
