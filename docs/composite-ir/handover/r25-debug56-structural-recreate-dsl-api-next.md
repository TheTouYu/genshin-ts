# Session 交接：debug5/debug6 结构复刻已通过，下一轮实现 DSL API

> **当前分支：** `feat/fork-api-and-layout`
> **当前状态：** debug5/debug6 已从“可运行拓扑变体”推进到结构复刻版，用户已进游戏测试并标记通过。下一轮目标是把本轮手写 IR 里暴露出的能力沉淀成正式 DSL/API。
> **最新相关提交：**
>
> ```bash
> 938d982 test(composite): add debug56 structural recreations
> fc38acd test(composite): migrate phase2 outflow fixtures
> 5fc41e1 test(composite): migrate bool and phase1 outflow fixtures
> dcce975 feat(composite): add explicit outflow marker API
> ```

---

## 一、本轮最终结果

本轮已重写并提交两个复刻脚本：

```text
tests/composite/recreate-debug5.ts
tests/composite/recreate-debug6.ts
```

提交：

```bash
git show --stat --oneline 938d982
# 938d982 test(composite): add debug56 structural recreations
# A tests/composite/recreate-debug5.ts
# A tests/composite/recreate-debug6.ts
```

生成并复制过：

```text
tests/composite/output/recreate_debug5.gia
tests/composite/output/recreate_debug6.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug5.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug6.gia
```

用户反馈：

> 已进游戏测试，标记通过。

---

## 二、重要结论

### 2.1 debug5 已解决上一轮核心偏差

上一轮偏差：debug5 用 wrapper composite 包系统节点，参考文件是纯系统节点。

本轮改法：`recreate-debug5.ts` 不再使用 `g.defineComposite`，而是直接手写 `IRDocument`：

```ts
const doc: IRDocument = {
  ir_version: 1,
  ir_type: 'node_graph',
  graph: { type: 'server', mode: 'beyond', sub_type: 'entity', id: 1073741840, name: 'main' },
  variables: [],
  nodes: [
    { id: 1, type: 'when_custom_variable_changes', next: [2, 3, 5] },
    {
      id: 2,
      type: 'forwarding_event',
      args: [{ type: 'conn', value: { node_id: 1, index: 0, type: 'entity' } }],
      next: [4]
    },
    {
      id: 3,
      type: 'finite_loop',
      args: [],
      next: [
        { node_id: 4, source_index: 0 },
        { node_id: 2, source_index: 1 },
        { node_id: 5, source_index: 1 }
      ]
    },
    { id: 4, type: 'set_local_variable', args: [], next: [5] },
    { id: 5, type: 'print_string', args: [] }
  ]
}
```

验证结果：

```text
CompositeDefs = 0
主图节点 = 5
系统节点 nid = [36,190,5,19,1]
exec 边 = 8
data 边 = 1
```

输出大小最后一次记录：

```text
recreate_debug5.gia 1025 B
```

参考 `debug5.gia` 是 517 B，因此不是 byte-level 复刻；但结构目标和游戏测试已通过。

### 2.2 debug6 已解决“多入口合并”偏差

上一轮偏差：`复杂分支` 的多个外部 InFlow 被合并成一个 composite call 入口。

本轮改法：`recreate-debug6.ts` 直接手写 `CompositeDefIR` 和主图 IR：

- `CompositeDefs = 1`
- `复杂分支`：
  - 4 InFlow
  - 5 OutFlow
  - 0 InParam
  - 1 OutParam
- 主图 `n=11` 是 `__composite_call__`，不同边通过 `target_index` 连接到不同 InFlow。

关键主图边：

```ts
{id: 1, type: 'when_custom_variable_changes', next: [2, 3, 5, 11]}

{id: 2, type: 'forwarding_event', ..., next: [4, { node_id: 11, target_index: 2 }]}

{id: 3, type: 'finite_loop', args: [], next: [
  { node_id: 4, source_index: 0 },
  { node_id: 11, source_index: 0, target_index: 1 },
  { node_id: 2, source_index: 1 },
  { node_id: 5, source_index: 1 },
  { node_id: 11, source_index: 1, target_index: 1 }
]}

{id: 4, type: 'set_local_variable', args: [], next: [5, { node_id: 11, target_index: 2 }]}
```

验证结果：

```text
CompositeDefs = 1
复杂分支: 4 InFlows
复杂分支: 5 OutFlows
复杂分支: 0 InParam
复杂分支: 1 OutParam
主图节点 = 6
主图 nodeId = [36,190,5,19,1,1610612743]
n=11 入边使用多个 InFlow: [0,1,1,2,2]
exec 边 = 13
data 边 = 1
```

输出大小最后一次记录：

```text
recreate_debug6.gia 2317 B
```

参考 `debug6.gia` 是 1607 B，因此仍不是 byte-level 复刻；但结构目标和游戏测试已通过。

---

## 三、已跑验证命令

本轮最后完成前跑过：

```bash
npm run build
npx tsx tests/composite/recreate-debug5.ts
npx tsx tests/composite/recreate-debug6.ts
npx tsx tools/topology.ts tests/composite/output/recreate_debug5.gia
npx tsx tools/topology.ts tests/composite/output/recreate_debug6.gia
git diff --check
```

复制到游戏目录：

```bash
EXPORT_DIR="/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export"
cp tests/composite/output/recreate_debug5.gia "$EXPORT_DIR/recreate_debug5.gia"
cp tests/composite/output/recreate_debug6.gia "$EXPORT_DIR/recreate_debug6.gia"
ls -l "$EXPORT_DIR/recreate_debug5.gia" "$EXPORT_DIR/recreate_debug6.gia"
```

用户已确认游戏内测试通过。

---

## 四、当前工作区状态

交接时已知：

```bash
git status --short --untracked-files=no
# 无 tracked 文件改动
```

未跟踪文件仍可能存在：

```text
.pi-subagents/
docs/composite-ir/handover/r23-outflow-api-done-debug56-next.md
docs/composite-ir/handover/r24-debug56-recreate-draft-review.md
docs/composite-ir/handover/r25-debug56-structural-recreate-dsl-api-next.md  # 本文档，待提交
```

说明：

- `.pi-subagents/` 是 subagent 运行产物，不要提交。
- r23/r24 是前序 handover，是否提交由下一轮决定。
- 本文档应在下一轮开始时先纳入或单独提交（如果用户要保存交接）。

---

## 五、下一轮目标：实现 DSL API，而不是继续手写 IR

用户明确说：

> 下一轮我们来实现你刚刚说的 dsl api

本轮手写 IR 证明需要两个能力：

1. **主图级 raw 系统节点 marker API**
2. **多 InFlow composite 定义与 call-site API**

下一轮不要再停留在手写 IR；应把这些能力接入 runtime/compiler DSL。

---

## 六、API 设计建议

### 6.1 主图 raw 系统节点 marker API

现有能力：

- `f.registerExecNode(nodeType, args)` 可以注册系统 exec 节点，但会自动串联到当前 tail，且返回的是 `MetaCallRecordRef`。
- `f.linkTo(source, outIdx, target)` 现在要求 `source/target` 是 `{ __markerNodeId }`，主要给 composite call marker 用。
- `f.eventMarker()` 返回 event marker。
- `f.declareDetached(handle, inputs)` 只支持 composite call，不支持 raw 系统节点。

debug5 需要的是：

```ts
const n2 = f.declareDetachedExecNode('forwarding_event', [e.eventSourceEntity])
const n3 = f.declareDetachedExecNode('finite_loop', [])
const n4 = f.declareDetachedExecNode('set_local_variable', [])
const n5 = f.declareDetachedExecNode('print_string', [])

f.linkTo(f.eventMarker(), 0, n2)
f.linkTo(f.eventMarker(), 0, n3)
f.linkTo(f.eventMarker(), 0, n5)
f.linkTo(n2, 0, n4)
f.linkTo(n3, 0, n4)
f.linkTo(n3, 1, n2)
f.linkTo(n3, 1, n5)
f.linkTo(n4, 0, n5)
```

建议 API：

```ts
type ExecMarker = { readonly __markerNodeId: number }

f.declareDetachedExecNode(nodeType: string, args: value[]): ExecMarker
```

可选加强：如果要给 data/output pin 返回 typed value，可以设计：

```ts
const n3 = f.declareDetachedExecNode('finite_loop', [], {
  outputs: { 当前循环值: { type: 'int', pinIndex: 0 } }
})
// n3.当前循环值 可作为 data pin 使用
```

但 debug5 当前只需要 `forwarding_event` 的 InParam 数据连接，即 `args` 里支持 `e.eventSourceEntity` 即可。

涉及文件：

```text
src/runtime/core.ts
src/definitions/nodes.ts
src/runtime/ir_builder.ts  # 如果 marker shape/args 需要更通用，可能涉及
src/runtime/IR.d.ts        # 如果新增公开类型
```

实现思路：

- 在 `MetaCallRegistry` 增加 detached raw exec node 注册函数，类似 `runDetachedCompositeCall` 的“绕过 auto-chain”逻辑，但 nodeType 是普通系统节点。
- 插入 `current.execNodes.push(record)`。
- 不自动连接当前 tail。
- 是否推进 current tail 需要谨慎。对 `declareDetached` 现实现会设置 tail；但 debug5 的 detached raw 更合理的语义可能是“不改 tail”。如果为了和 `declareDetached` 保持兼容，也可推进 tail；但建议明确文档化。
- 返回 `{ __markerNodeId: record.id }`。如果支持 out param，则返回对象上挂 typed output values。

注意事项：

- `removeUnusedNodesFromFlow` 只保留从 event 可达的 exec 节点；detached raw 节点必须通过 `linkTo(eventMarker(), ...)` 接入，否则会被优化掉（或在 removeUnusedNodes=false 时保留）。
- `linkTo` 现在只支持 target InFlow[0]，下一节多 InFlow 需要扩展。

### 6.2 linkTo 支持 target InFlow index

当前签名：

```ts
f.linkTo(source, sourceOutflowIdx, target)
```

内部：

```ts
this.registry.linkOutflowToMarker(source.__markerNodeId, sourceOutflowIdx, target.__markerNodeId)
```

而 debug6 手写 IR 需要 `target_index`：

```ts
{ node_id: 11, source_index: 0, target_index: 1 }
{ node_id: 11, target_index: 2 }
```

建议改签名为兼容形式：

```ts
f.linkTo(source, sourceOutflowIdx, target, targetInflowIdx = 0): void
```

对应 registry：

```ts
linkOutflowToMarker(sourceMarkerId, sourceOutflowIdx, targetMarkerId, targetInflowIdx = 0) {
  this.addEdge(this.currentFlow, sourceMarkerId, targetMarkerId, sourceOutflowIdx, targetInflowIdx)
}
```

目前 `addEdge` 只支持 `sourceIndex`：

```ts
private addEdge(flow, fromNodeId, toNodeId, sourceIndex?)
```

需要改成支持 `target_index`：

```ts
private addEdge(flow, fromNodeId, toNodeId, sourceIndex?, targetIndex?) {
  if (sourceIndex === undefined && targetIndex === undefined) list.push(toNodeId)
  else list.push({ node_id: toNodeId, source_index: sourceIndex, target_index: targetIndex })
}
```

注意：如果 `sourceIndex` undefined 但 `targetIndex` 有值，要避免写出 `{ source_index: undefined }`。IR 里可只写存在字段。

涉及文件：

```text
src/runtime/core.ts
src/definitions/nodes.ts
src/runtime/IR.d.ts  # 已有 target_index 字段，无需新增
```

### 6.3 多 InFlow composite 定义 API

当前 `g.defineComposite` 只会生成单 InFlow：

```ts
inflows: hasExec ? [{ name: '', visible: true, index: 0, pinIndex: ... }] : []
```

且 compositePins 只支持 capture node 单入口：

```ts
outer InFlow[0] -> captureNodeId.InFlow[0]
```

但 debug6 需要：

```text
outer InFlow[0] -> inner finite_loop.InFlow[0]
outer InFlow[1] -> inner forwarding_event.InFlow[0]
outer InFlow[2] -> inner set_local_variable.InFlow[0]
outer InFlow[3] -> inner print_string.InFlow[0]
```

建议 API 形态之一：

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
  inputs: {},
  outputs: { 当前循环值: { type: 'int', pinIndex: 72 } },
  build(_args, f) {
    const forward = f.declareDetachedExecNode('forwarding_event', [])
    const loop = f.declareDetachedExecNode('finite_loop', [], {
      outputs: { 当前循环值: { type: 'int', pinIndex: 0 } }
    })
    const setLocal = f.declareDetachedExecNode('set_local_variable', [])
    const print = f.declareDetachedExecNode('print_string', [])

    f.inflow('有限循环', loop)
    f.inflow('开始转化事件', forward)
    f.inflow('开始设置局部变量', setLocal)
    f.inflow('开始打印字符串', print)

    f.linkTo(loop, 0, setLocal)
    f.linkTo(loop, 1, forward)
    f.linkTo(loop, 1, print)
    f.linkTo(forward, 0, setLocal)
    f.linkTo(setLocal, 0, print)

    f.outflow('循环体', loop, 0)
    f.outflow('循环完成', loop, 1)
    f.outflow('打印字符串', print, 0)
    f.outflow('设置局部变量', setLocal, 0)
    f.outflow('事件转发完成', forward, 0)

    return { 当前循环值: loop.当前循环值 }
  }
})
```

这个方案需要新增：

```ts
f.inflow(name: string, ref: ExecMarker | MetaCallRecordRef, inflowPinIndex = 0): void
```

和 capture 保存：

```ts
inflowMarks?: Array<{ name: string; innerNodeId: number; inflowPinIndex: number }>
```

`toCompositeDefIR()` 逻辑：

- 如果 `inflowMarks.length > 0`，用 marks 生成 `inflows` 和 InFlow compositePins。
- 否则保持旧行为：有 exec 则生成单入口 capture pin。
- `pinIndex` 支持用户指定；否则使用默认值。默认值可以沿用当前：
  - 单入口：1974
  - 多入口：建议类似多 outflow 用 `6 + i` 或新增常量；但真实编辑器 pinIndex 不固定，只要求 def pinIndex 与 call pin compositePinIndex 一致。

需要改的类型：

```text
src/runtime/composite_registry.ts
src/runtime/core.ts
src/definitions/nodes.ts
```

可能还要改：

```text
src/compiler/ir_to_gia_transform/index.ts
```

原因：主图 composite call 节点目前只给 InParam/OutParam 添加 pins；InFlow/OutFlow pins 主要由 `graph.flow()` 根据连线生成。对于多 InFlow，`graph.flow(from, to, fromIndex, targetIndex)` 已能写 target InFlow index。重点是 call node 的 `genericId.kind`/`nodeId` 和 `compositePinIndex` 是否需要对 InFlow pin 补设置。当前 post-encoding 只给 InParam/OutFlow 设置 compositePinIndex：

```ts
if (pin.i1?.kind === 3) { pin.compositePinIndex = cdef.inputs[inputIdx].pinIndex }
if (pin.i1?.kind === 2) { pin.compositePinIndex = cdef.outflows[outflowIdx].pinIndex }
```

参考 debug6 decode 中主图 n=11 的 pins 为空，但入边 connect 指向 `kind=1,index=0/1/2`。因此 call node 未必需要显式 InFlow pins。不过如果编码器在某些情况下生成 InFlow pin，则应补：

```ts
if (pin.i1?.kind === 1) pin.compositePinIndex = cdef.inflows[pin.i1.index].pinIndex
```

---

## 七、建议实现顺序

下一轮建议不要一次性大改。分三步：

### Step 1：扩展 linkTo targetInflowIdx

最小改动，直接覆盖 debug6 所需 `target_index`。

目标测试：新增/修改一个小 fixture，验证 IR/GIA 中 `from → target.InFlow[2]`。

可用 `recreate-debug6.ts` 的手写 IR 作为预期。

### Step 2：新增 detached raw exec node API

实现：

```ts
f.declareDetachedExecNode(nodeType, args)
```

先只返回 marker，不做 typed outputs。

用它重写 debug5：从手写 IR 改回 DSL：

```ts
g.server(...).on('whenCustomVariableChanges', (e, f) => {
  const n2 = f.declareDetachedExecNode('forwarding_event', [e.eventSourceEntity])
  const n3 = f.declareDetachedExecNode('finite_loop', [])
  const n4 = f.declareDetachedExecNode('set_local_variable', [])
  const n5 = f.declareDetachedExecNode('print_string', [])
  ... linkTo ...
})
```

验证：debug5 仍然 `CompositeDefs = 0`，主图 nid/边数不变，游戏测试可选。

### Step 3：多 InFlow composite API

实现 `f.inflow()` + `defineComposite` inflows 声明。

用它重写 debug6，去掉手写 `CompositeDefIR`。

验证：

```text
CompositeDefs = 1
复杂分支 InFlows = 4
主图 n=11 入边 targetInFlow = [0,1,1,2,2]
```

如果 Step 3 遇到 API 设计分歧，停下来问用户，不要硬改。

---

## 八、已知风险与取舍

1. **byte-level 复刻不是当前目标**
   - debug5 参考 517 B，本轮输出 1025 B。
   - debug6 参考 1607 B，本轮输出 2317 B。
   - 游戏测试已通过，结构复刻 OK。

2. **当前脚本手写 IR 是临时桥接**
   - 不是最终 DSL 体验。
   - 下一轮应尽量保留验证逻辑，但把构图改为新 DSL API。

3. **多 InFlow 的 pinIndex 设计要谨慎**
   - 真实编辑器 pinIndex 不固定。
   - 核心约束是 CompositeDef pinIndex 与 call-site/compositePins 一致。
   - 如果提供用户自定义 pinIndex，会更利于复刻真实文件。

4. **主图 raw 系统节点 API 可能被滥用**
   - 这属于低层逃生口。
   - 建议文档标为 advanced/internal-ish，但用户复刻与调试确实需要。

5. **`set_local_variable` / `finite_loop` / `print_string` args 为空也能编码并通过游戏测试**
   - 本轮为了更贴近参考，手写 IR 中这些节点用了 `args: []`，避免生成默认 InParam pins。
   - 新 DSL raw API 如果强制 `args` 必须完整，可能会重新引入多余 pins。

---

## 九、subagent 状态

本轮早先 scout subagent 曾因环境问题失败。用户后续说已经修复 subagent 问题：

> 你现在可以调用 subagent 来制定计划，探索代码，执行代码修复了。可以节省你的上下文了。

下一轮可以正常使用 subagent。建议开局：

1. `scout`：梳理 `core.ts` / `composite_registry.ts` / `nodes.ts` 中现有 low-level API。
2. `planner` 或 `oracle`：审 API 设计，特别是 `declareDetachedExecNode` 和 `f.inflow` 是否会破坏现有语义。
3. parent 作为唯一 writer，或用一个 `worker` 实现后 parent review。

注意仍要先 `subagent({ action: "list" })`。

---

## 十、下一轮第一句话建议

> 我会先把本轮手写 IR 暴露出的两个能力拆成 API：先做 `linkTo(..., targetInflowIdx)` 和 `declareDetachedExecNode()`，用它们把 debug5 从手写 IR 改回 DSL；再做 `defineComposite` 多 InFlow / `f.inflow()`，把 debug6 改回 DSL。如果多入口复合的 API 形态有歧义，我会先停下来给方案让你选。

---

## 十一、一句话总结

> debug5/debug6 结构复刻已提交并经用户游戏测试通过；当前脚本用手写 IR 表达了“主图 raw 系统节点”和“多 InFlow 复合调用”两个 DSL 缺口。下一轮应把这两个能力正式实现为 DSL API，并用 debug5/debug6 作为回归验证。
