# 复合节点 API 手册

> 基于三个真实 GIA 参考文件（弹球/传球/物理运动，200+ accessories）验证的完整 API。

## 核心认知

**所有节点统一对待。** 不存在"系统节点"和"普通节点"的本质区分 —— 每个节点在 impl 图中的 pin 由它在该复合中的**角色**决定（入口/分叉源/中继/叶子/数据载体），不由节点类型决定。

**compositePins 是独立路由表。** outer pin 到 inner node pin 是多对多映射，游戏从 compositePins 解析路由，不要求 inner pin 在 impl 图中实际存在。

## build 内可用 API

| API | 作用 | 示例 |
|-----|------|------|
| `f.registerExecNode(type, args)` | 注册执行节点，自动串联到当前 tail | `f.registerExecNode('print_string', [new str('hello')])` |
| `f.leaf(outflowIdx)` | 标记当前 tail 节点为 OutFlow[outflowIdx] 出口 | `f.leaf(0)` |
| `f.branchExec(sourceIdx, record)` | 从当前 tail 分叉创建叶子，不推进 tail | `f.branchExec(0, { type: 'exec', nodeType: 'print_string', args: [new str('出口0')] })` |
| `f.createOutParamValue(type, ref, idx)` | 创建 OutParam 返回值绑定到节点 | `f.createOutParamValue('int', ref, 0)` |

### 完整节点一览

build 内可用的**所有节点类型**（与主图 `f.xxx()` 一致）：

| 类别 | 示例 | OutFlow | 说明 |
|------|------|---------|------|
| 分支 | `double_branch` | 2 | OutFlow[0]=条件为真(是), OutFlow[1]=条件为假(否)；无参时纯分叉 |
| 多分支 | `multiple_branches` | N | OutFlow[0]=默认分支, OutFlow[1..N-1]=各 case 分支 |
| 循环 | `finite_loop` | 2 | OutFlow[0]=循环体(每次迭代), OutFlow[1]=循环完成(结束后一次)；OutParam[0]=当前循环值(Int) |
| 列表循环 | `list_iteration_loop` | 2 | OutFlow[0]=循环体(每元素), OutFlow[1]=循环完成(遍历结束后一次) |
| 跳出 | `break_loop` | 0 | 无执行输出，终止当前路径（仅循环体内部可用） |
| 数据计算 | `addition`, `subtraction`, `multiplication`, `division`, `modulo_operation` 等 | -- | 算术（纯数据节点，无 OutFlow） |
| 比较 | `equal`, `greater_than`, `less_than`, `greater_than_or_equal_to`, `less_than_or_equal_to` | -- | 比较运算（纯数据节点） |
| 逻辑 | `logical_and_operation`, `logical_or_operation`, `logical_not_operation` | -- | 布尔逻辑（纯数据节点） |
| 向量 | `_3d_vector_addition`, `scalar_multiplication`, `cross_product`, `dot_product`, `vec3_length` | -- | 三维向量（纯数据节点） |
| 执行动作 | `print_string`, `set_variable`, `forwarding_event` | 1 | 打印/设变量/转发（单 OutFlow） |
| 查询 | `get_entity_by_tag`, `get_variable_by_name`, `get_self_entity` | -- | 获取数据（纯数据节点） |
| 类型转换 | `data_type_conversion_int`, `data_type_conversion_str` 等 | -- | 类型转换（纯数据节点） |
| 信号 | `send_signal`, `monitor_signal` | 1 | 信号系统（单 OutFlow） |
| 复合调用 | `f.callComposite(handle, inputs)` | 0~N | build 内调用另一个复合；OutFlow 数由被调用复合决定 |

### 多 OutFlow 节点语义速查

> 在 build() 中使用 `f.branchExec(sourceIndex, ...)` 或 `f.leaf(outflowIdx)` 时，必须正确理解每个 OutFlow 的含义。

| 节点类型 | nodeId | OutFlow 数量 | 各出口语义 |
|----------|--------|-------------|-----------|
| `double_branch` | 2 | 2 | OutFlow[0]=条件为真(是), OutFlow[1]=条件为假(否) |
| `multiple_branches` | 3 (Int) / 4 (Str) | N (1+N) | OutFlow[0]=默认分支(default), OutFlow[1..N-1]=各 case 分支(按声明顺序) |
| `finite_loop` | 5 | 2 | OutFlow[0]=循环体(每次迭代), OutFlow[1]=循环完成(结束后一次)；OutParam[0]=当前循环值(Int) |
| `list_iteration_loop` | 509-515, 570-571, 3280 | 2 | OutFlow[0]=循环体(每元素), OutFlow[1]=循环完成(遍历结束后一次) |
| `break_loop` | 6 | 0 | 无执行输出，终止当前路径（仅循环体内部可用） |

**行为细节**：

- **double_branch 无参用法**：`f.registerExecNode('double_branch', [])` 不带参数时条件默认为 false，**只走 OutFlow[1]（否）**，不会同时走两条路。如需走 OutFlow[0]（是），显式传入 `new bool(true)`。要实现"一次性分叉到 N 条路同时走"，将多个 `f.branchExec(同一个 sourceIndex, ...)` 连接到同一个 OutFlow pin 上。
- **finite_loop / list_iteration_loop return gate**：循环体内调用了 `return()` 时，OutFlow[1]（循环完成）后会插入 return gate，只有未触发 return 时才继续后续逻辑。
- **multiple_branches case 别名**：case 值可以是 `number`/`string` 常数（而非函数），表示重定向到另一个 case 或 default（类似 C 的 case fall-through），只支持一层间接。

## 主图使用 API

| API | 作用 |
|-----|------|
| `f.callComposite(handle, inputs)` | 调用复合节点，返回 outputs（含 `__markerNodeId`） |
| `f.connectOutFlow(result, outflowIdx, callback)` | 在指定 OutFlow 后连接下游；同一 outflowIdx 多次调用 = Fork |

## 模式完整写法

### 1. 条件分支（双分支）

一个 double_branch 节点同时是"是"和"否"两个出口。

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
const r = f.callComposite(comp, { '条件': new bool(true) })
f.connectOutFlow(r, 0, () => { f.printString('是分支') })
f.connectOutFlow(r, 1, () => { f.printString('否分支') })
```

### 2. 有限循环

一个节点，两个出口（循环体 + 循环完成），带 OutParam 返回循环值。

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
```

### 3. 顺序分叉（1 入口 N 出口）

入口 double_branch 分叉到 N 个叶子，每个叶子是独立出口。

```typescript
const comp = g.defineComposite('顺序执行4', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.registerExecNode('double_branch', [])  // 入口 + 分叉源
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(1, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(2, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(3, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    return {}
  }
})
```

### 4. 系统分叉 + 普通叶子（Phase 2 新增）

分叉源用 double_branch，叶子用普通节点（print_string 等）。

```typescript
const comp = g.defineComposite('分叉+打印叶子', {
  inputs: {}, outputs: {},
  build(_inputs, f) {
    f.registerExecNode('double_branch', [])
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('分支A')] })
    f.branchExec(1, { id: 0, type: 'exec', nodeType: 'print_string', args: [new str('分支B')] })
    return {}
  }
})
```

### 5. 纯数据复合（无执行流）

类似参考文件中的 `更新角速度`/`更新速度`。纯计算，0 InFlow，0 OutFlow。

```typescript
const comp = g.defineComposite('翻倍+加一', {
  inputs: { 输入值: { type: 'int' } },
  outputs: { 翻倍结果: { type: 'int' }, 加一结果: { type: 'int' } },
  build(inputs, f) {
    const doubled = f.addition(inputs['输入值'], inputs['输入值'])
    const incremented = f.addition(inputs['输入值'], new int(1n))
    return { 翻倍结果: doubled, 加一结果: incremented }
  }
})
```

### 6. 混合执行+数据（Phase 2 新增）

类似参考文件中的 `更新v、w`。同时有执行流分叉和数据输入输出。

```typescript
const comp = g.defineComposite('条件+数据', {
  inputs: { 条件: { type: 'bool' }, 数值: { type: 'int' } },
  outputs: { 结果: { type: 'int' } },
  build(inputs, f) {
    // 数据计算
    const doubled = f.addition(inputs['数值'], inputs['数值'])
    // 执行流分叉
    f.registerExecNode('double_branch', [inputs['条件']])
    f.leaf(0); f.leaf(1)
    return { 结果: doubled }
  }
})

// 主图调用
const r = f.callComposite(comp, { '条件': new bool(true), '数值': new int(5n) })
f.connectOutFlow(r, 0, () => { f.printString('条件为真') })
f.connectOutFlow(r, 1, () => { f.printString('条件为假') })
// 数据输出: r.结果
```

### 7. 同一输入多次消费

同一 InParam 可以路由到多个内部节点（参考文件常见模式）。

```typescript
const comp = g.defineComposite('同一输入两次使用', {
  inputs: { 输入值: { type: 'int' } },
  outputs: { 和: { type: 'int' }, 积: { type: 'int' } },
  build(inputs, f) {
    const sum = f.addition(inputs['输入值'], inputs['输入值'])      // 两次使用
    const product = f.multiplication(inputs['输入值'], inputs['输入值']) // 再次使用
    return { 和: sum, 积: product }
  }
})
```

### 8. 分支内使用普通执行节点

类似参考文件中的 `地面变为空中状态`。double_branch 分叉后每侧有普通节点链。

```typescript
const comp = g.defineComposite('条件+打印链', {
  inputs: { 条件: { type: 'bool' }, 消息真: { type: 'str' }, 消息假: { type: 'str' } },
  outputs: {},
  build(inputs, f) {
    f.registerExecNode('double_branch', [inputs['条件']])
    // leaf 标记的两个出口 —— 实际游戏中每侧可连不同的下游
    f.leaf(0)   // 条件为真时
    f.leaf(1)   // 条件为假时
    return {}
  }
})
```

## branchExec 的 record 格式

```typescript
{
  id: 0,                    // 必须为 0（系统自动分配）
  type: 'exec',             // 必须为 'exec'
  nodeType: 'print_string', // 任意节点类型（不仅限于控制流节点）
  args: [new str('文本')]   // 节点参数（value 类型）
}
```

## 关键实现细节

1. **compositePins 是独立路由表** — outer pin 到 inner node pin 是多对多映射，不要求 inner pin 在 impl 图中实际存在
2. **节点 pin 由角色决定** — 同一个 double_branch 在入口处有 OutFlow:0+1+InParam:0，在叶子处只有 0 pin
3. **OutFlow 索引不固定** — 可以是 0/1/2/3...，取决于 edge 的 source_index
4. **impl 节点 ID 自动从 1 重新编号**（捕获 event 节点占 ID 1）
5. **入口节点的 OutFlow pin 自动填充 connects**（按 source_index 拆分为多个 OutFlow pin）
6. **主图 OutFlow pin 由 `graph.flow()` 创建**，不要手动添加
7. **一个 outer InParam 可以 fanout 到多个 inner 节点**（同一输入多处消费）
8. **嵌套复合在 impl 图中为 kind=22001 节点**，执行型有 OutFlow pin，数据型 0 pin

## 测试与验证

```bash
# Phase 1 系统节点
npx tsx tests/composite/test-phase1-system-nodes.ts

# Phase 2 普通节点
npx tsx tests/composite/test-phase2-normal-nodes.ts

# GIA 检查工具
npx tsx tests/composite/gia-inspect.ts <file.gia> -l     # 列出所有 accessories
npx tsx tests/composite/gia-inspect.ts <file.gia> -g <N>  # 显示 impl graph
npx tsx tests/composite/gia-inspect.ts <file.gia> -f <id>  # 搜索指定 nodeId
npx tsx tests/composite/gia-inspect.ts <file.gia> -t      # 统计节点分布

# 对比工具
npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> -c
```

**经验**：验证不能只看表层（节点数/pin数一致），必须逐字段对比——connects、innerPinIndex、nodeIndex、compositePinIndex、OutFlow index 任何一项不对都会导致游戏无法正确执行。
