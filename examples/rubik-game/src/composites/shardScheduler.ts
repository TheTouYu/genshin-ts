// shardScheduler.ts —— 负载均衡分片调度器资产（docs/composite-library/task-sharding-scheduler.md）
// 只做一件事：按固定间隔启动下一个任务 tick。业务逻辑放宿主图的 pStep 状态机里。
// 用法：
//   f.callComposite(shardStartTick, {
//     target: f.getSelfEntity(),
//     tick: new str('taskTick'),
//     interval: new float(0.5)
//   })
import { g } from 'genshin-ts/runtime/core'
import { bool, float, str } from 'genshin-ts/runtime/value'

export const shardStartTick = g.defineComposite('shard_start_tick', {
  id: 1610700066,
  inputs: { target: { type: 'entity' }, tick: { type: 'str' }, interval: { type: 'float' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target, tick, interval }, f) => {
    const t = f.registerExecNode('start_timer', [target, tick, new bool(false), f.assemblyList([interval], 'float')])
    f.outflow('done', t, 0)
    return {}
  }
})
