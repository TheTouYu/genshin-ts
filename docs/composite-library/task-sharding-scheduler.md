# 负载均衡分片调度器（task-sharding-scheduler）

> 状态：当前推荐（2026-08-25；基于 rubik-3x3 求解器真实日志核验）
> 覆盖：把「一个长任务」拆成多个低负载 tick，由调度器定时推进；每个 tick 只做一小步，设显式停止条件。
> 伴侣文档：[timer-scheduling.md](timer-scheduling.md)（multi-entity 错峰）、[loop-node-budget.md](loop-node-budget.md)（节点/帧双硬限）、[debug-log-tag.md](debug-log-tag.md)（每 tick 打点）

## 一句话

> 大任务 = `pStep` 状态机 + `shardStartTick` 定时器 + 每个 tick 只做一类小工作；做完不再续 timer。

## 为什么需要它

游戏对节点图有两条硬限（详见 loop-node-budget）：
- 单图节点量超 3000 拒载（仓库内部安全线已经更严：engineExpanded ≤ 2000）；
- 单记录帧数约 3000 截断，后续帧不再执行。

把「读状态→算 mask→查策略→apply 一堆循环」塞在一条链里，单 record 会超过 3000 帧被静默终止，表现就是“任务跑到一半没反应/原地绕圈”。分片调度器就是用来避免这两类问题。

## 核心资产

源文件：`examples/rubik-3x3/src/composites/shardScheduler.ts`

```ts
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
```

调用模板：

```ts
f.callComposite(shardStartTick, {
  target: f.getSelfEntity(),
  tick: new str('taskTick'),
  interval: new float(0.5)
})
```

## 宿主图接入模板

```ts
.on('whenTimerIsTriggered', (evt, f) => {
  f.multipleBranches(evt.timerName as never, {
    'taskTick': () => {
      f.multipleBranches(f.getNodeGraphVariable('pStep').asType('int'), {
        // Step 1：只读数据，写中间变量（最便宜）
        1: () => {
          /* 只查不写业务状态 */
          f.setNodeGraphVariable('pStep', new int(2), false)
          f.callComposite(shardStartTick, { target: f.getSelfEntity(), tick: new str('taskTick'), interval: new float(0.5) })
        },
        // Step 2：计算索引/mask，写中间变量
        2: () => {
          /* 纯数据计算 */
          f.setNodeGraphVariable('pStep', new int(3), false)
          f.callComposite(shardStartTick, { target: f.getSelfEntity(), tick: new str('taskTick'), interval: new float(0.5) })
        },
        // Step 3：查表，决定动作
        3: () => {
          f.setNodeGraphVariable('pStep', new int(4), false)
          f.callComposite(shardStartTick, { target: f.getSelfEntity(), tick: new str('taskTick'), interval: new float(0.5) })
        },
        // Step 4：每次只应用一小步（例如写一个列表项 / 发一个 move）
        4: () => {
          /* 应用一个原子动作 */
          f.setNodeGraphVariable('pStep', new int(5), false)
          f.callComposite(shardStartTick, { target: f.getSelfEntity(), tick: new str('taskTick'), interval: new float(0.5) })
        },
        // 完成：只收尾，绝不续 timer
        5: () => {
          f.setNodeGraphVariable('pStep', new int(0), false)
          f.sendSignal(MySignal.taskDone, 1n)
        },
        default: () => {}
      })
    },
    default: () => {}
  })
})
```

## 使用纪律（每 tick 自检）

1. **每个 tick 只做一类小工作**：读 / 算 / 查表 / 应用，不要混在一条链里。
2. **读和写分开**：先只读发布到临时变量；写回只在最后一个 Step。这避免长链头重脚轻。
3. **停止条件是显式状态**：完成后设置 `pStep=0`，不再调用 `shardStartTick`。
4. **间隔默认 0.5s**：让开日志时还能跑完。0.06s 级连续高负载禁止（2026-08-24 用户定义）。
5. **来大任务前，先算两笔账**：
   - `assets:node-graphs nodes --graph <id>` 看 engineExpanded ≤ 2000（当前安全线）；
   - `perf` 预期单 record 帧数 < 3000（留日志余量）。
6. **每 tick 打一个日志标签**：写 `dbgTag/dbgVal`（见 debug-log-tag），后续排查一眼看出走到第几步。

## 什么时候需要继续拆

- 如果某个 Step 单 tick 帧数还接近 3000，把该 Step 再拆成两个 tick；
- 如果总 tick 间隔太长影响体验，优先压缩 Step 的数量，而不是调低 interval；
- 如果任务有自然完成事件（如“转动完成”），优先直接用事件驱动（timer-scheduling）而不是本分片调度。

## 宿主必背字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `pStep` | int | 当前分片步骤（0=空闲） |
| `step_*` 中间变量 | 任意 | 步骤之间传递的只读结果（mask/索引/策略） |

## 真实案例

`examples/rubik-3x3/src/solverPlan.ts` 的事件驱动求解器就是本资产的前身：
- step1 读状态写 `sep/seo`
- step2 只算 `crossMask`
- step3 策略查表写 `mLen/mC0/mC1/mC2`
- step4 每次只追加一个 move code
- 完成时发 op6 或 op7，不续 timer
- 当前 `planTick` 0.5s，单 record 帧数已从 3382 降到几百；`engineExpanded` 1177。

## 回归记录

- 2026-08-25：rubik-3x3 日志 2871 复盘后建立；与调度器配合的交互（计划 tick 4小步）游戏未再因单记录截断被终止。
