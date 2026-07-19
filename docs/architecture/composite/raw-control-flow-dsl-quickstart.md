# Raw Control-Flow DSL Quickstart

> 状态：当前推荐
> 来源：当前代码实现 + recreate-debug5/6 验证
> 最近校验：2026-07-06
> 适用范围：gsts 当前低层手动控制流 DSL

这份文档介绍新版低层控制流 DSL。它适合两类场景：

- 你想复刻游戏编辑器里抓出来的 GIA 拓扑。
- 普通 `f.xxx()` 高层 API 暂时表达不了某种连线，例如一个节点同时连到多个目标，或者复合节点有多个 InFlow。

如果只是写普通玩法逻辑，优先使用已有的高层 API。这里的 API 更像“手动搭节点图”的工具。

## 控制流回调中的 Timer

`setTimeout` / `setInterval` 可以出现在 DSL 控制流回调中，包括 `doubleBranch`、`fork`、有限循环和列表迭代的 body，以及 Timer callback 内继续编排控制流。编译器会让这些回调继承当前 handler 的执行流标识和事件标识，因此 Timer callback 仍可使用完整的 `(timerEvt, timerF)` 参数形式。

```ts
g.server({ id: 1073742402 }).on('whenEntityIsCreated', (_evt, f) => {
  f.doubleBranch(new bool(true), () => {
    setTimeout((_timerEvt, timerF) => {
      timerF.printString(new str('branch timer'))
    }, 1000)
  }, () => {})
})
```

在 `setInterval` callback 中继续使用控制流时，使用 callback 参数 `timerF` 编排节点，不要混用外层 handler 的 `f`：

```ts
setInterval((_timerEvt, timerF) => {
  timerF.doubleBranch(new bool(true), () => {
    timerF.printString(new str('interval branch'))
  }, () => {})
}, 180)
```

Timer 注册的语义仍是“编译期把 Timer 注册节点放入当前图，并按当前控制流位置连接”；是否每次运行时由条件分支选择注册，取决于生成的控制流连接，不能把 JavaScript 闭包层级当作运行时语义。Timer 名称池、capture 和去重 metadata 由 Stage 1 自动生成，业务侧不应手写第三个 metadata 参数。

最小回归入口：`tests/timer_metadata_control_flow_callbacks_test.ts`，配置为
`gsts.timer-metadata-control-flow-callbacks.config.ts`。Composite `build()` 和嵌套 Composite
边界使用 `tests/timer_composite_control_flow_callbacks_test.ts`，配置为
`gsts.timer-composite-control-flow-callbacks.config.ts`。完整验证见
[`composite/testing.md`](./testing.md#timer-元数据在控制流回调中的回归) 和
[`composite/testing.md`](./testing.md#composite-build--nested-call-timer-边界回归)。

在 Composite `build()` 中，单出口执行子 Composite 后的普通顺序调用可直接使用
`f.callComposite(child, {})`，再写后续执行节点；当前 capture 实现会自动从 child 的
`OutFlow[0]` continuation。所有多出口执行节点（普通节点和 Composite）遇到普通顺序后续时，
同样只从 `OutFlow[0]` 继续，并输出 `GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION` warning。
warning 会建议把各分支逻辑移入对应 callback；需要精确处理其它出口时，使用
`declareDetached()` + `f.link()` 或 `connectOutFlow()` 显式连线。

## 核心概念

节点图里有两种控制流 pin：

- **InFlow**：执行流输入，表示“从这里进入这个节点”。
- **OutFlow**：执行流输出，表示“这个节点执行完后从哪条分支出去”。

新版 DSL 主要做三件事：

```ts
const entry = f.entry()              // 当前事件入口
const node = f.node('finite_loop')   // 创建一个不自动连线的系统节点
f.link(entry, 0, node)               // 手动连 entry.OutFlow[0] -> node.InFlow[0]
```

`f.node()` 创建的是 detached 节点：它不会自动接到当前执行链上。创建后必须用 `f.link()`、`f.inflow()` 或其他方式接入，否则在移除未使用节点时可能被删掉。

## 最小例子：从事件入口连到打印节点

```ts
g.server({ mode: 'beyond', type: 'entity', id: 1073741840, name: 'main' }).on(
  'whenCustomVariableChanges',
  (_e, f) => {
    const entry = f.entry()
    const print = f.node('print_string')

    f.link(entry, 0, print)
  }
)
```

含义：

```text
事件节点.OutFlow[0] -> Print String.InFlow[0]
```

## API 速查

### `f.entry()`

返回当前 server event 的入口 marker。

```ts
const entry = f.entry()
```

它通常作为手动连线的起点。

旧名字仍可用：

```ts
f.eventMarker()
```

### `f.node(type, args?, options?)`

创建一个 detached 系统执行节点。

```ts
const loop = f.node('finite_loop')
const forward = f.node('forwarding_event', [e.eventSourceEntity])
```

参数：

- `type`：系统节点类型，使用 snake_case，例如 `finite_loop`、`print_string`。
- `args`：节点输入参数，必须是 runtime `value`。事件参数、`guid`、`entity` 等对象型 DSL value 可以直接传入；`asType('float')`、`division()` 等静态显示为 `number` / `bigint` / `boolean` / `string` 的节点输出，使用 `asRuntimeValue(...)` 适配后传入。
- `options.outParams`：可选，把某个系统节点的输出参数暴露成可返回的 DSL value。

```ts
import { asRuntimeValue, bool, str } from 'genshin-ts/runtime/value'

const gravity = asRuntimeValue(f.getCustomVariable(entity, 'G').asType('float'))
const setGravity = f.node('set_node_graph_variable', [new str('G'), gravity, new bool(false)])
```

`asRuntimeValue()` 不包装普通 JavaScript literal；它会验证输入确实是 Stage 2 的 DSL `value` 对象。raw node 的 literal 参数仍应显式构造，例如 `new float(0.5)`、`new str('G')`。

别名：

```ts
f.rawExecNode(type, args?, options?)
```

### `f.link(source, outIdx, target, inIdx?)`

手动连接控制流。

```ts
f.link(a, 0, b)     // a.OutFlow[0] -> b.InFlow[0]
f.link(a, 1, b, 2)  // a.OutFlow[1] -> b.InFlow[2]
```

第四个参数 `inIdx` 默认是 `0`。

旧名字仍可用：

```ts
f.linkTo(source, outIdx, target, inIdx?)
```

## 例子：复刻 debug5 的主图结构

目标结构：

```text
When Custom Variable Changes -> Forwarding Event
When Custom Variable Changes -> Finite Loop
When Custom Variable Changes -> Print String
Forwarding Event -> Set Local Variable
Finite Loop.OutFlow[0] -> Set Local Variable
Finite Loop.OutFlow[1] -> Forwarding Event
Finite Loop.OutFlow[1] -> Print String
Set Local Variable -> Print String
```

DSL 写法：

```ts
g.server({ mode: 'beyond', type: 'entity', id: 1073741840, name: 'main' }).on(
  'whenCustomVariableChanges',
  (e, f) => {
    const entry = f.entry()
    const forward = f.node('forwarding_event', [e.eventSourceEntity])
    const loop = f.node('finite_loop')
    const setLocal = f.node('set_local_variable')
    const print = f.node('print_string')

    f.link(entry, 0, forward)
    f.link(entry, 0, loop)
    f.link(entry, 0, print)
    f.link(forward, 0, setLocal)
    f.link(loop, 0, setLocal)
    f.link(loop, 1, forward)
    f.link(loop, 1, print)
    f.link(setLocal, 0, print)
  }
)
```

注意 `forwarding_event` 使用了事件的 `e.eventSourceEntity`，所以会生成一条数据连线。

## 多 InFlow 复合节点

有些复合节点不只有一个入口。比如“复杂分支”有 4 个 InFlow：

```text
InFlow[0] 有限循环
InFlow[1] 开始转化事件
InFlow[2] 开始设置局部变量
InFlow[3] 开始打印字符串
```

定义时先声明外部接口：

```ts
const complexBranch = g.defineComposite('复杂分支', {
  inflows: [
    { name: '有限循环', pinIndex: 67 },
    { name: '开始转化事件', pinIndex: 76 },
    { name: '开始设置局部变量', pinIndex: 77 },
    { name: '开始打印字符串', pinIndex: 78 }
  ],
  outflows: [
    { name: '循环体', pinIndex: 68 },
    { name: '循环完成', pinIndex: 69 },
    { name: '打印字符串', pinIndex: 73 },
    { name: '设置局部变量', pinIndex: 74 },
    { name: '事件转发完成', pinIndex: 75 }
  ],
  outputs: {
    当前循环值: { type: 'int', pinIndex: 72 }
  },
  build(_args, f) {
    const forward = f.node('forwarding_event')
    const loop = f.node('finite_loop', [], {
      outParams: {
        当前循环值: { type: 'int', index: 0 }
      }
    })
    const setLocal = f.node('set_local_variable')
    const print = f.node('print_string')

    f.inflow('有限循环', loop)
    f.inflow('开始转化事件', forward)
    f.inflow('开始设置局部变量', setLocal)
    f.inflow('开始打印字符串', print)

    f.link(loop, 0, setLocal)
    f.link(loop, 1, forward)
    f.link(loop, 1, print)
    f.link(forward, 0, setLocal)
    f.link(setLocal, 0, print)

    f.outflow('循环体', loop, 0)
    f.outflow('循环完成', loop, 1)
    f.outflow('打印字符串', print, 0)
    f.outflow('设置局部变量', setLocal, 0)
    f.outflow('事件转发完成', forward, 0)

    return { 当前循环值: loop.当前循环值 }
  }
})
```

### `f.inflow(name, target, targetInflowIdx?)`

把复合节点的外部 InFlow 绑定到内部节点。

```ts
f.inflow('开始转化事件', forward)
```

含义：

```text
复杂分支.InFlow[开始转化事件] -> forward.InFlow[0]
```

如果内部节点不是进 `InFlow[0]`，可以传第三个参数：

```ts
f.inflow('某入口', node, 1)
```

### `f.outflow(name, source, sourceOutflowIdx?)`

把内部节点的 OutFlow 暴露成复合节点的外部 OutFlow。

```ts
f.outflow('循环完成', loop, 1)
```

含义：

```text
loop.OutFlow[1] -> 复杂分支.OutFlow[循环完成]
```

## 在主图中调用多 InFlow 复合

如果你需要手动把多条边连到复合节点的不同入口，用 detached composite call：

```ts
const branch = f.declareDetached(complexBranch, {})

f.link(entry, 0, branch, 0)   // 进入「有限循环」
f.link(loop, 0, branch, 1)    // 进入「开始转化事件」
f.link(forward, 0, branch, 2) // 进入「开始设置局部变量」
```

第四个参数就是目标 InFlow index。

## raw node 输出参数

有些系统节点有数据输出。如果要把它作为复合节点 output 返回，可以用 `outParams` 声明：

```ts
const loop = f.node('finite_loop', [], {
  outParams: {
    当前循环值: { type: 'int', index: 0 }
  }
})

return {
  当前循环值: loop.当前循环值
}
```

这里的 `index: 0` 指的是系统节点自己的 OutParam index，不是复合节点的 `pinIndex`。

复合节点外部 output 的 `pinIndex` 在 `outputs` 里声明：

```ts
outputs: {
  当前循环值: { type: 'int', pinIndex: 72 }
}
```

## pinIndex 什么时候要写

普通使用可以不写 `pinIndex`，编译器会分配默认值。

复刻抓包文件时建议写，因为参考 GIA 里的 pinIndex 可能是编辑器分配的：

```ts
inflows: [{ name: '有限循环', pinIndex: 67 }]
outflows: [{ name: '循环体', pinIndex: 68 }]
outputs: { 当前循环值: { type: 'int', pinIndex: 72 } }
```

核心原则：同一个复合定义里，外部接口的 pinIndex 要和调用节点上的 composite pin index 对得上。

## 常见坑

### 1. `f.node()` 不会自动连线

下面代码只创建节点，不会执行：

```ts
const print = f.node('print_string')
```

需要显式连接：

```ts
f.link(f.entry(), 0, print)
```

### 2. 没接入事件流的节点可能被移除

如果开启了移除未使用节点，detached raw node 必须从事件入口可达。

### 3. `f.link()` 的第四个参数是目标 InFlow

```ts
f.link(loop, 1, branch, 2)
```

含义是：

```text
loop.OutFlow[1] -> branch.InFlow[2]
```

不是连接到 branch 的 OutFlow[2]。

### 4. `outParams.index` 不是 `pinIndex`

```ts
outParams: { x: { type: 'int', index: 0 } }
```

这里 `index` 是内部系统节点的数据输出 pin index。

```ts
outputs: { x: { type: 'int', pinIndex: 72 } }
```

这里 `pinIndex` 是复合节点外部接口的 pinIndex。

### 5. 原生表面类型输出传给 `f.node()` 时使用 `asRuntimeValue()`

部分高层 DSL 输出为方便普通表达式使用，TypeScript 静态类型显示为 `number`、`bigint`、`boolean` 或 `string`，但 Stage 2 运行时实际是携带 pin metadata 的 `value` 对象。不要使用 `as unknown as value`；在进入 raw API 边界时显式适配：

```ts
const deltaSeconds = asRuntimeValue(f.division(updateIntervalFloat, 1000))
const setDelta = f.node('set_node_graph_variable', [new str('t'), deltaSeconds, new bool(false)])
```

如果误传普通 literal（例如 `asRuntimeValue(1000)`），适配器会立即报错。

## 验证工具

生成 GIA 后，可以用 trace 工具看控制流输入输出：

```bash
npx tsx tests/composite/trace-exec-flow.ts tests/composite/output/recreate_debug6.gia --io
```

输出示例：

```text
n= 6 复合:复杂分支
  InFlow[0] 有限循环 <- n=1.OutFlow[0] 1
  InFlow[1] 开始转化事件 <- n=3.OutFlow[0] 1, n=3.OutFlow[1] 2
  InFlow[2] 开始设置局部变量 <- n=2.OutFlow[0] 1, n=4.OutFlow[0] 1
  OutFlow: (无下游)
```

如果要看 JSON：

```bash
npx tsx tests/composite/trace-exec-flow.ts tests/composite/output/recreate_debug6.gia --json --io --depth=1
```

## 完整示例文件

可以直接参考这两个测试脚本：

- `tests/composite/recreate-debug5.ts`：主图 raw 系统节点 + 手动连线。
- `tests/composite/recreate-debug6.ts`：多 InFlow 复合节点 + 主图 target InFlow 连线。
