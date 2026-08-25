# 资源包 18：定时器序列调度包（timer-scheduling）

> 长任务拆 tick 的现成模板见 [task-sharding-scheduler.md](task-sharding-scheduler.md)。

> 状态：当前推荐
> 来源：从 rubik-2x2 / rubik-3x3 项目抽象（2026-08-22）
> 最近校验：2026-08-22
> 适用范围：千星沙箱服务端节点图；多实体错峰启动、分段动画、队列播放

## 用途

把「多个实体按时间错峰执行」抽象成定时器序列调度：定时器序列 + 触发分派 + 解锁。

## 核心模式：scheduler + trigger 分离

定时器调度拆成两个复合（这是 2x2 的 `gstsOrbitScheduler` + `gstsOrbitTrigger` 确立的模式）：

| 角色 | 职责 | 形态 |
|---|---|---|
| **scheduler**（设置端） | 创建定时器，写入定时器序列 | 调用流复合（exec） |
| **trigger**（触发端） | 监听 `whenTimerIsTriggered`，按 timerName 分派 | 纯事件流复合 |

**为什么分离**：定时器是「设置一次、触发多次」的异步机制——设置端跑一次（调用流），触发端跑多次（事件流）。两者分开，接口语义清晰（与 composite-usage-guide「调用流与事件流分开」原则一致）。

## 三种调度实现（按复杂度递进）

### 实现 1：每块一个定时器（2x2 旧版）

```ts
// scheduler：tname = dataTypeConversion(i, 'str')，块索引转定时器名
const tname = f.dataTypeConversion(i, 'str')
f.registerExecNode('start_timer', [target, tname, false, [0.2, 0.4, 0.6, 0.8]])

// trigger：multipleBranches(timerName, {'0'~'7': 每块一个分支})
f.multipleBranches(evt.timerName, {
  '0': () => { /* 设 curBlock=0，调 dispatch */ },
  '1': () => { /* 设 curBlock=1，调 dispatch */ },
  // ... 8 个分支
  'turnblock': () => { /* ... */ },
  'unlock': () => { /* 解锁 */ }
})
```

**问题**：N 个块 = N 个 timerName 分支，分支里「设变量 + 调复合」会**节点爆炸**（每个分支都展开一次复合调用）。

### 实现 2：handlerMode 变量化（3x3 新版，2026-08-21 重构）

```ts
// trigger：不用 N 个 timerName 分支，用 handlerMode/handlerBase 两个图变量 + 单次分派
f.multipleBranches(mode, {
  0: () => f.callComposite(viewHandleTurnCore, { target, base, seq }),
  1: () => f.callComposite(viewHandleOrbitCore, { target, base, seq })
})
```

**核心演进**：把「按 timerName 分派到 N 个分支」改成「按 handlerMode（取值 0/1/2）分派到 2-3 个分支」，
`handlerBase`/`seq`（timerSequenceId）作为数据传入。**N 个 timerName 分支 → 2 个 mode 分支**，节点数大幅下降。

### 实现 3：chunk 链式（长序列分块）

当定时器序列超过两位数精度限制（同一 start_timer 延迟列表不能有重复值）时，拆成多个 chunk
（`turnblock0`/`turnblock1`/...），每个 chunk 内部用少量唯一值，chunk 之间用「chunk 结束 → 下一 chunk」
链式衔接（见 3x3 `viewOrbitTrigger` 的 `shouldChain` 逻辑）。

## 通用方法论（提炼）

1. **定时器名是唯一标识，不能重复**：多块并发用 `dataTypeConversion(i, 'str')` 生成唯一名（int→str）。
2. **timerSequenceId 是序列内序号**：`evt.timerSequenceId` 是定时器序列里的第几个触发（0-based），
   配合 `base = chunk * chunkSize` 算出全局 slot。
3. **事件回调里用事件载荷字段，不用 capture**：`evt.timerName` / `evt.timerSequenceId` /
   `evt.eventSourceEntity` 是事件自带字段，直接读；不要 capture 外部变量（惰性引用陷阱）。
4. **解锁用独立 unlock 定时器**：最后一个块启动时注册一个 unlock 定时器（延迟 = turnCompletionDelay），
   从「最后块实际启动时刻」计完整时长，负载抖动不会提前解锁。
5. **「分支只设变量，join 后单次调用」是节点爆炸的通用解法**：`multipleBranches` 自带 join，
   分支里只 set 变量，join 后统一调一次处理器复合。

## 复用提示

- 这是**多实体错峰执行的通用模式**（B 类）：任何「N 个物体依次动/依次生成/依次销毁」都能用。
- 优先用「实现 2（handlerMode 变量化）」，它比「实现 1（N 分支）」省大量节点。
- 定时器延迟列表「同一 start_timer 内不能重复值」的坑（见 dsl-nodegraph-development 技能）要记住。