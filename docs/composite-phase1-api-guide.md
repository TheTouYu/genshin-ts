# 复合节点 Phase 1: 系统节点包装 API 手册

## build 内可用 API

| API | 作用 | 示例 |
|-----|------|------|
| `f.registerExecNode(type, args)` | 注册任意系统节点，自动串联到当前 tail | `const ref = f.registerExecNode('double_branch', [condition])` |
| `f.leaf(outflowIdx)` | 标记当前节点为 OutFlow[outflowIdx] 出口 | `f.leaf(0)` |
| `f.branchExec(idx, record)` | 从当前 tail 分叉创建叶子分支（不推进 tail） | `f.branchExec(0, leafRecord)` |
| `f.createOutParamValue(type, ref, idx)` | 创建 OutParam 返回值并绑定到节点 | `f.createOutParamValue('int', ref, 0)` |

## 主图使用 API

| API | 作用 |
|-----|------|
| `f.callComposite(handle, inputs)` | 调用复合节点，返回 `{ __markerNodeId, ...outputs }` |
| `f.connectOutFlow(result, outflowIdx, callback)` | 在指定 OutFlow 后连接下游节点，多次调用同一 outflowIdx = Fork |

## 可用的系统节点类型

| 类型 | GIA nodeId | 用途 |
|------|-----------|------|
| `double_branch` | 2 | 条件分支 / 顺序分叉（无参数时） |
| `finite_loop` | 5 | 有限循环 |
| `multiple_branches` | 3 | 多路 switch 分支 |
| `print_string` | 1 | 打印字符串 |

## 三种模式完整写法

### 1. 条件分支（双分支）

一个节点同时是"是"和"否"两个出口。

```typescript
const comp = g.defineComposite('双分支', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build(inputs, f) {
    f.registerExecNode('double_branch', [inputs['条件']])
    f.leaf(0)   // OutFlow[0] = "是"
    f.leaf(1)   // OutFlow[1] = "否"
    return {}
  }
})

// 主图调用
g.server({ name: 'main', graphId: 1073741911 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r = f.callComposite(comp, { '条件': new bool(true) })
    f.connectOutFlow(r, 0, () => { f.printString('是分支') })
    f.connectOutFlow(r, 1, () => { f.printString('否分支') })
  })
```

### 2. 有限循环

一个节点，两个出口（循环体 + 循环完成），带 OutParam 返回当前循环值。

```typescript
const comp = g.defineComposite('有限循环', {
  inputs: { 循环起始值: { type: 'int' }, 循环终止值: { type: 'int' } },
  outputs: { 当前循环值: { type: 'int' } },
  build(inputs, f) {
    const ref = f.registerExecNode('finite_loop', [
      inputs['循环起始值'],
      inputs['循环终止值']
    ])
    const loopValue = f.createOutParamValue('int', ref, 0)
    f.leaf(0)   // OutFlow[0] = 循环体
    f.leaf(1)   // OutFlow[1] = 循环完成
    return { 当前循环值: loopValue }
  }
})

// 主图调用
const r = f.callComposite(comp, { '循环起始值': new int(1n), '循环终止值': new int(10n) })
f.connectOutFlow(r, 0, () => { f.printString('每次迭代') })
f.connectOutFlow(r, 1, () => { f.printString('循环结束') })
```

### 3. 顺序执行（1 入口 N 出口）

入口节点分叉到 N 个叶子节点，每个叶子是一个出口。

```typescript
const comp = g.defineComposite('顺序执行4', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.registerExecNode('double_branch', [])     // 入口 + 分叉源

    // 创建 4 个叶子分支
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(1, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(2, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(3, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })

    return {}
  }
})

// 主图调用
const r = f.callComposite(comp, {})
f.connectOutFlow(r, 0, () => { f.printString('出口0') })
f.connectOutFlow(r, 1, () => { f.printString('出口1') })
f.connectOutFlow(r, 2, () => { f.printString('出口2') })
f.connectOutFlow(r, 3, () => { f.printString('出口3') })
```

## branchExec 的 record 格式

```typescript
{
  id: 0,              // 必须为 0（系统自动分配）
  type: 'exec',       // 必须为 'exec'
  nodeType: 'double_branch',  // 系统节点类型
  args: []             // 节点参数数组（value 类型）
}
```

## 关键实现细节（经历过 3 次迭代验证）

1. **`leaf()` 标记后，相同节点的多个出口会自动分配递增的 innerPinIndex**（OutFlow[0]→pin2:0, OutFlow[1]→pin2:1）
2. **系统节点在 impl 图中无 InParam/OutParam pin**，只有分叉源节点有 OutFlow pin
3. **impl 节点 ID 自动从 1 重新编号**（捕获时 event 节点占 ID 1）
4. **入口节点的 OutFlow pin 自动填充 connects**（指向所有叶子节点的 nodeIndex）
5. **主图 OutFlow pin 由 `graph.flow()` 创建**，不要手动添加

## 测试与验证

```bash
# 运行测试
npx tsx tests/composite/test-phase1-system-nodes.ts

# 对比生成的 GIA 与参考文件
npx tsx tests/composite/gia-diff.ts <ref.gia> phase1_system_nodes.gia -c
```

**经验**：验证不能只看表层（节点数/pin数一致），必须逐字段对比——connects、innerPinIndex、nodeIndex 任何一项不对都会导致游戏无法正确执行。
