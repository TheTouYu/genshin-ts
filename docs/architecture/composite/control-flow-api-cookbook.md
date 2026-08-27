# 控制流复合 API 实战速查 (顺序执行 / 多 OutFlow 派发)

> 状态：部分已验证 / 部分待验证
> 来源：真实 GIA 验证 + 当前代码实现 + 历史实战记录
> 最近校验：2026-07-19
> 适用范围：控制流模式参考。新代码优先从 `raw-control-flow-dsl-quickstart.md` 开始；本文中标注“感觉正确”或“待验证”的内容仍需单独核验。

> **本文档定位**: 衔接 `dsl-api.md` (基础 API) 与 `multi-outflow-composite-guide.md` (GIA 端分析)。
> 专门记录"**控制流类复合**"的 DSL 写法 — 顺序执行、条件branch、Multiple Branches、Multi-InFlow 状态机。
> 所有 API 用法均来自 `tests/composite/` 实际测试源码 + 真实 GIA 文件逆向验证。
>
> **⚠️ 重要声明**: 本文档中标注 **"感觉正确"** 的内容是基于源码阅读推断的用法, 尚未经过完整自动化测试验证。真实的端到端验证需要手动在游戏中运行 GIA 注入。请用本目录的验证工具 (trace-exec-flow / analyze-composite-gia) 自行确认。

> **💡 新版 Raw 控制流 DSL**: [Raw Control-Flow DSL Quickstart](./raw-control-flow-dsl-quickstart.md) 提供了 `f.entry()`/`f.node()`/`f.link()`/`f.inflow()`/`f.outflow()` 作为清理后的低层控制流 API，是当前版本的低层控制流权威参考。
> - `f.eventMarker()` → **`f.entry()`**（旧名仍可用）
> - `f.linkTo(src, outIdx, tgt, inIdx?)` → **`f.link(src, outIdx, tgt, inIdx?)`**（旧名仍可用）
> - `f.registerExecNode` **自动串联**到 tail；`f.node()` 创建 **detached** 节点
> - `f.leaf(idx)` → **`f.outflow(name, source, idx)`**
> - 新 DSL 适合手动拓扑连线，优先用于复刻 GIA 场景。

---

## 0. 关键概念纠正 (用户 2026-07-05 指出)

### "顺序执行" 复合 ≠ 并行 fork, 而是**严格串行**

> 之前的分析把它类比为"fork"是**错误**的。形状像叉子只是视觉类比, 不代表行为。

**真实执行模型**:
- 1 个 InFlow 触发
- 进入 impl, entry 节点的 OutFlow[0] 有 N 个 connects (按数组顺序)
- 引擎**按顺序串行**触发每条线:
  1. 触发第 1 个下游 → **等其全部执行完**
  2. 触发第 2 个下游 → **等其全部执行完**
  3. ...
  4. 触发第 N 个下游 → **等其全部执行完**
- 整个 顺序执行 复合自身在所有 N 条线完成后才完成

**gsts 代码类比** (虽然 gsts 没有这个复合的直接语法糖):

```typescript
// ❌ 错误理解 (并行)
g.server().on('信号', () => {
  Promise.all([line1(), line2(), line3(), line4()])
})

// ✅ 正确理解 (串行)
g.server().on('信号', () => {
  line1()        // 顺序执行.OutFlow[0]
  line2()        // 顺序执行.OutFlow[1] (等 line1 完成)
  line3()        // 顺序执行.OutFlow[2] (等 line2 完成)
  line4()        // 顺序执行.OutFlow[3] (等 line3 完成)
})
```

**为什么叫"顺序执行"**:
- "线" 指一根外 OutFlow
- "从上往下" 指 connects 数组的顺序 (impl 内 n=2 在顶, n=6 在底)
- 命名准确反映了**执行序**, 不是形状

### 4 种控制流复合的触发行为对照

| 复合 | InFlow | OutFlow | 触发行为 | GIA 端表现 |
|------|--------|---------|----------|------------|
| **顺序执行** | 1 | N (是×N) | **全部串行** (按 connects 顺序) | impl 内 1 entry → 4 leaf DoubleBranch, y 坐标从上到下 |
| **Multiple Branches** | 1 | N (case 0-N) | **只 1 个** (case 值匹配) | single dispatch, default 可选 |
| **Double Branch** | 1 | 2 (是/否) | **只 1 个** (bool 条件) | 系统节点 nid=2 |
| **Multi-InFlow 复合** (物理运动控制器) | N | 2 (停止/继续) | **只 1 InFlow → 1 OutFlow** | 状态机模式 |

**绝对不要混淆**: "顺序执行" 的 N 个 OutFlow 全部触发; "Multiple Branches" 的 N 个 OutFlow 只触发 1 个。

---

## 1. 顺序执行 复合 (顺序dispatch)

### 1.1 真实 GIA 形态 (来自 `复杂gia/物理运动.gia` 的 n=22)

```
                    外 InFlow[0]
                        │
                        ▼
                  ┌─ n=1 (Double Branch, entry) ─┐
                  │   OutFlow[0] connects:       │
                  │   [n=2, n=3, n=5, n=6]      │  ← 数组顺序就是执行序
                  │   y=-275 (画布中间)            │
                  └──────────────────────────────┘
                       │      │      │      │
                       ▼      ▼      ▼      ▼
                ┌─ n=2 ─┐ ┌─ n=3 ─┐ ┌─ n=5 ─┐ ┌─ n=6 ─┐
                │ y=-305 │ │ y=-122 │ │ y=60   │ │ y=242  │
                │ 第 1  │ │ 第 2   │ │ 第 3   │ │ 第 4   │  ← 上下排列 = 顺序
                └───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
                    │          │          │          │
                    ▼          ▼          ▼          ▼
              外 OutFlow[0]  OutFlow[1]  OutFlow[2]  OutFlow[3]
                  "是"        "是"        "是"        "是"

compositePins 映射 (按外 OutFlow 索引):
  外 OutFlow[0] (是) ↔ 内 n=2 (y=-305, 第 1 个)
  外 OutFlow[1] (是) ↔ 内 n=3 (y=-122, 第 2 个)
  外 OutFlow[2] (是) ↔ 内 n=5 (y=60,  第 3 个)
  外 OutFlow[3] (是) ↔ 内 n=6 (y=242, 第 4 个)
```

### 1.2 当前推荐 DSL 写法

新代码优先使用 detached raw API 定义顺序执行，不依赖 `registerExecNode` / `branchExec` / `leaf` 的历史 tail 语义：

```typescript
const sequentialExec = g.defineComposite('顺序执行', {
  inputs: {},
  outputs: {},
  inflows: [{ name: '', pinIndex: 513 }],
  outflows: [
    { name: '是', pinIndex: 514 },
    { name: '是', pinIndex: 515 },
    { name: '是', pinIndex: 516 },
    { name: '是', pinIndex: 517 }
  ],
  build(_args, f) {
    const entry = f.node('double_branch', [new bool(true)])
    const exits = Array.from({ length: 4 }, () =>
      f.node('double_branch', [new bool(true)])
    )

    f.link(f.entry(), 0, entry)
    exits.forEach((exit) => {
      f.link(entry, 0, exit)
      f.outflow('是', exit, 0)
    })
    return {}
  }
})
```

调用侧需要手动拓扑或 fan-in 时：

```typescript
const sequence = f.declareDetached(sequentialExec, {})
f.link(source, 0, sequence)
f.link(sequence, 0, internalTarget)
f.outflow('完成', sequence, 3)
```

这里 `f.link(sequence, 0, ...)` 使用逻辑 OutFlow index；`f.outflow(..., sequence, 3)` 可以把嵌套顺序执行的第 4 个出口直接提升为外层复合出口。针对性回归见 `tests/composite/test-nested-composite-outflow.ts`。

### 1.3 历史兼容写法（来自旧测试）

```typescript
import { g, buildServerGraphRegistriesIRDocuments } from '../../dist/src/runtime/core.js'
import { int, str, bool } from '../../dist/src/runtime/value.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'

// ═══ 定义: 顺序执行 复合 ═══
const sequentialExec = g.defineComposite('顺序执行', {
  inputs: {},
  outputs: {},
  build(_inputs, f) {
    // 1. 入口节点 — 作为分叉源 (1 InFlow)
    f.registerExecNode('double_branch', [new bool(true)])

    // 2. 4 个出口分支 (按数组顺序串行触发)
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })
    f.branchExec(0, { id: 0, type: 'exec', nodeType: 'double_branch', args: [] })

    return {}
  }
})

// ═══ 在主图调用 + 接续 4 个 OutFlow ═══
g.server({ name: 'main', graphId: 1073741911 })
  .on('whenEntityIsCreated', (_e, f) => {
    const sr = f.callComposite(sequentialExec, {})

    f.connectOutFlow(sr, 0, () => { f.printString('步骤1') })  // 第 1 触发
    f.connectOutFlow(sr, 1, () => { f.printString('步骤2') })  // 第 2 触发
    f.connectOutFlow(sr, 2, () => { f.printString('步骤3') })  // 第 3 触发
    f.connectOutFlow(sr, 3, () => { f.printString('步骤4') })  // 第 4 触发
    // 不接的 OutFlow 可省略 (允许闲置)
  })
```

### 1.3 关键 API 解读

| API | 作用 | 在顺序执行 复合中 |
|-----|------|------------------|
| `f.registerExecNode(type, args)` | 注册一个 exec 节点 (无 tail 推进) | 注册 entry 节点, 后面的 branchExec 都从它的 OutFlow[0] 分叉 |
| `f.branchExec(sourceIdx, record)` | 从 sourceIdx 指定的 OutFlow 创建一个新的执行分支 | 4 次调用 = 4 个独立的内部出口节点 |
| `f.connectOutFlow(result, idx, callback)` | 接续 callComposite 返回的 marker 的特定 OutFlow | 4 次调用 = 接续 4 个外 OutFlow |

**感觉正确的点** ⚠️:
- `registerExecNode` 之后, 当前 tail 应该被推进或被重置 (以便 branchExec 知道从哪里分叉)
- `branchExec(0, ...)` 中第一个参数 0 表示从 sourceIndex=0 的 OutFlow 分叉
- `connectOutFlow` 第二个参数 idx 对应外 OutFlow 的 index, 不是 compositePinIndex

---

## 2. Double Branch (是/否) 复合

### 2.1 真实 GIA 形态

```
                  外 InFlow[0]
                      │
                      ▼
              ┌─ n=1 (Double Branch, nid=2) ─┐
              │   条件 = InParam[0]            │
              └──┬──────────────────────────┬─┘
                 │ 条件=true                 │ 条件=false
                 ▼                          ▼
            外 OutFlow[0] "是"        外 OutFlow[1] "否"
```

### 2.2 DSL 写法 — 高层 API (来自 `test-bool-input.ts:21-34`)

```typescript
const BoolComposite = g.defineComposite('bool复合测试', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build({ 条件 }, f) {
    f.doubleBranch(
      条件,
      () => { f.printString('是') },     // 是 → 接续
      () => { f.printString('否') },     // 否 → 接续
    )
    return {}
  }
})

// 在主图用
g.server({ name: 'main', graphId: 1073741840 })
  .on('whenEntityIsCreated', (_e, f) => {
    const r = f.callComposite(BoolComposite, { 条件: new bool(true) })
    // f.connectOutFlow(r, 0, () => { f.printString('接-是') })
    // f.connectOutFlow(r, 1, () => { f.printString('接-否') })
  })
```

### 2.3 DSL 写法 — 低层 API (来自 `test-phase1-system-nodes.ts:24-33`)

```typescript
const doubleBranch = g.defineComposite('双分支', {
  inputs: { 条件: { type: 'bool' } },
  outputs: {},
  build(inputs, f) {
    f.registerExecNode('double_branch', [inputs['条件']])
    f.leaf(0)   // OutFlow[0] = "是"
    f.leaf(1)   // OutFlow[1] = "否"
    return {}
  }
})
```

### 2.4 关键 API 解读

| API | 行为 |
|-----|------|
| `f.doubleBranch(cond, trueCb, falseCb)` | 条件为 true 触发 trueCb, false 触发 falseCb (互斥) |
| `f.registerExecNode('double_branch', [条件])` | 注册系统 Double Branch 节点, 条件作为参数 |
| `f.leaf(0)` / `f.leaf(1)` | 标记当前节点的两个 OutFlow 出口, 自动推进 tail |

**感觉正确的点** ⚠️:
- `f.leaf(idx)` 会自动推进 tail, 后续代码可继续写在该 leaf 之后
- 与 `f.branchExec` 不同的是, `f.leaf` 不创建新节点, 只标记当前节点的出口
- Double Branch 在 gsts 系统节点表中是 `nid=2`

---

## 3. Multiple Branches (case 派发) 复合

### 3.1 真实 GIA 形态 (来自 `物理运动.gia` n=23, 10 case)

```
                外 InFlow[0]
                    │
                    ▼
            ┌─ n=23 (Multiple Branches, nid=3) ─┐
            │   case = InParam[1] (array of int) │
            └──┬────┬────┬────┬────┬────┬────┬───┘
               0    1    2    3    4    5    ...   default (可选)
               ▼    ▼    ▼    ▼    ▼    ▼
            OF[0] OF[1] OF[2] OF[3] OF[4] OF[5] ... OF[N]
            "case 0" "case 1" ... "default"
```

### 3.2 DSL 写法 (来自 `src/definitions/nodes.ts:3118-3125` 签名)

```typescript
f.multipleBranches(
  controlExpression: IntValue,                                          // 条件值
  branches: Record<number, (() => void) | number> & {                   // case → 回调
    default?: (() => void) | number
  }
): void

// 也支持字符串版本
f.multipleBranches(
  controlExpression: StrValue,
  branches: Record<string, (() => void) | string> & {
    default?: (() => void) | string
  }
): void
```

**实际使用例** (感觉正确, 未在测试源码中找到完整调用 ⚠️):

```typescript
g.server({ name: 'main' })
  .on('whenEntityIsCreated', (_e, f) => {
    const signalType = new int(7)
    f.multipleBranches(signalType, {
      0: () => f.printString('case 0: 停止'),
      1: () => f.printString('case 1: v停止'),
      2: () => f.printString('case 2: vy停止'),
      3: () => f.printString('case 3: w停止'),
      4: () => f.printString('case 4: setVar'),
      5: () => f.printString('case 5: setVar2'),
      6: () => f.printString('case 6: 开始运动'),
      7: () => f.printString('case 7: 停止run'),
      8: () => f.printString('case 8: 顺序执行 触发'),
      9: () => f.printString('case 9: 顺序执行 触发'),
      default: () => f.printString('default: 未知 case'),
    })
  })
```

### 3.3 关键 API 解读

| 关键点 | 说明 |
|--------|------|
| 触发行为 | **只触发 1 个** case 匹配的回调 (互斥) |
| controlExpression | 必须 int 或 str (由 `matchTypes` 强制) |
| default | 可选; 都不匹配时触发 |
| 回调签名 | `() => void` (无参) 或 `number` (隐式 goto?) |
| 与 顺序执行 的区别 | 顺序执行 全部触发, Multiple Branches 只 1 个 |

**感觉正确的点** ⚠️:
- `tests/composite/` 中**没有完整的 multipleBranches 真实调用示例** (只有签名)
- 需要手动验证 gsts 编译器是否正确处理 default 分支
- 物理运动.gia 的 n=23 实际有 11 个 outflow (含一个未连接的 0?), 不知道是 default 还是另一个 case

---

## 4. 物理运动控制器 复合 (Multi-InFlow 状态机) — 真实样本

### 4.1 真实 GIA 形态 (来自 `物理运动.gia` 的 compositeDef id 1610612930)

```
        外 InFlow[0..9]  (10 个不同入口)
        ┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
        │ 停止  │vy停止 │v停止  │w停止  │  w     │  v     │开始运动 │停止run │启用run │接触地面 │
        └────┬───┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┘
             │       │        │        │        │        │        │        │        │        │
             ▼       ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼
        ┌─────────────────────────────────────────────────────────────────────────────────────┐
        │  impl 内 54 节点的状态机: 每个 InFlow 触发不同内部处理路径                            │
        │  9 个嵌套复合: StartTickManager, StopTickManager, 向量内积乘法, 地面变为空中状态,  │
        │                w角速度-a朝向转化, 发送信号, 世界向量转本地向量, 接触地面, can fly    │
        └─────────────────────────────────────────────────────────────────────────────────────┘
             │       │        │        │        │        │        │        │        │        │
             ▼       ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼
        ┌────────────────────────────────────────────────────────┐
        │  2 个外 OutFlow: "停止" / "继续"                        │
        └────────────────────────────────────────────────────────┘
        (注意: "停止" 经常被闲置, 只有 "继续" 接续到下游)
```

### 4.2 接口声明 (来自真实 GIA 解码)

```typescript
// 这是真实 GIA 文件中物理运动控制器的接口定义
// 注意: 还没有看到对应的 gsts defineComposite 写法 — 感觉这是手动用 JSON 创建的 ⚠️
{
  inflows: [
    { name: "停止",    index: { kind: 1, index: 0 } },
    { name: "vy停止",  index: { kind: 1, index: 1 } },
    { name: "v停止",   index: { kind: 1, index: 2 } },
    { name: "w停止",   index: { kind: 1, index: 3 } },
    { name: "w",       index: { kind: 1, index: 4 } },
    { name: "v",       index: { kind: 1, index: 5 } },
    { name: "开始运动", index: { kind: 1, index: 6 } },
    { name: "停止run",  index: { kind: 1, index: 7 } },
    { name: "启用run",  index: { kind: 1, index: 8 } },
    { name: "接触地面", index: { kind: 1, index: 9 } },
  ],
  outflows: [
    { name: "停止", index: { kind: 2, index: 0 } },
    { name: "继续", index: { kind: 2, index: 1 } },
  ],
  inputs: [
    { name: "v", type: "vec3" },
    { name: "w", type: "vec3" },
    { name: "运动实体", type: "entity" },
    { name: "运动器时长", type: "float" },
  ],
  outputs: []
}
```

### 4.3 关键 API 解读

| 关键点 | 说明 |
|--------|------|
| Multi-InFlow 复合 | 1 个复合可暴露 N 个独立执行入口, 每个 InFlow 有自己的名字 |
| 实例化复用 | 同一 compositeDef 在主图被实例化 4+ 次 (n=15, 16, 26, 32), 每次 10 个 InFlow 接不同上游 |
| 触发行为 | **只触发 1 个 InFlow** (被调用的那个), 不会同时触发多个 |
| OutFlow 闲置 | "停止" 经常被闲置, 只用 "继续" 接下游 — 是被允许的 |

**感觉正确的点** ⚠️:
- gsts 的 `g.defineComposite` 是否支持多 InFlow 声明? 现有 `dsl-api.md` 主要讲 0/1 个 InFlow 场景
- `tests/composite/` 中**没有 Multi-InFlow 复合的真实定义示例** (只有 0 或 1 InFlow 的)
- 这是一个**已知 gap**, 实际可能需要手动注入 GIA 才能验证

---

## 5. f.fork 的真实语义 (容易和顺序执行混淆)

### 5.1 f.fork 的代码形态 (来自 `test-bool-input.ts:50-63`)

```typescript
g.server({ name: 'main', graphId: 1073741840 })
  .on('whenEntityIsCreated', (_e, f) => {
    f.fork(
      () => {
        f.callComposite(BoolComposite, { 条件: new bool(true) })
      },
      () => {
        f.doubleBranch(
          new bool(true),
          () => { f.printString('是-来自主图') },
          () => {},
        )
      },
    )
    // fork 后, 后续代码从最后一个分支之后继续
    f.printString('D')  // 不是 A/B/C 都跑完才跑 D
  })
```

### 5.2 f.fork 的内部实现 (来自 `src/runtime/core.ts:902-929`)

```typescript
/**
 * 从当前执行点分叉，同时执行多个分支。
 * 所有分支共享同一父节点，生成分支拓扑，而非链式串联。
 * 后续代码从最后一个分支继续执行。
 */
fork(...branches: Array<() => void>): void {
  if (branches.length === 0) return
  const current = this.currentFlow
  const ctx = this.getCurrentExecContext(current)
  const parentEndpoints = [...ctx.tailEndpoints]
  let lastTail: { nodeId: number; sourceIndex?: number } | undefined

  for (const branch of branches) {
    current.execContextStack.push({
      tailEndpoints: [...parentEndpoints],   // 共享父节点
      headNodeId: undefined
    })
    try {
      branch()
      const branchCtx = this.getCurrentExecContext(current)
      if (branchCtx.tailEndpoints.length > 0) {
        lastTail = branchCtx.tailEndpoints[0]
      }
    } finally {
      current.execContextStack.pop()
    }
  }

  // fork 后 tail 推进到最后一个分支的末节点
  if (lastTail) {
    ctx.tailEndpoints = [lastTail]
  }
}
```

### 5.3 f.fork vs 顺序执行 复合的差异

| 维度 | f.fork (handler 内) | 顺序执行 复合 |
|------|---------------------|----------------|
| 位置 | 在 `g.server().on(...)` 的 handler 里直接写 | 用 `g.defineComposite('顺序执行', ...)` 定义 |
| GIA 端表现 | 1 个 entry 节点 OutFlow[0] 扇出 N 个目标 | 同上 (impl 内 1 entry → N leaf) |
| 触发顺序 | 串行 (按 branches 参数顺序) | 串行 (按 impl 内 connects 顺序) |
| 可复用 | 不可 (写在 handler 里) | 可 (可被多次 callComposite) |
| 名字 | 4 个 OutFlow 全部**无名字** (system) | 4 个 OutFlow 全叫 **"是"** |

**注意**: f.fork 的 4 个分支在 GIA 端**没有名字**, 而 顺序执行 复合的 4 个 OutFlow 都叫"是" — 这是它们的 GIA 端唯一区别。

---

## 6. 完整 API 速查表

| API | 签名 | 触发行为 | 来源 |
|-----|------|----------|------|
| `f.callComposite(handle, inputs)` | `(handle, inputs) → Record<output, value>` | 触发复合实例 (无差别, InFlow 都触发) | test-phase1-system-nodes.ts:89 |
| `f.connectOutFlow(result, idx, cb)` | `(result, outflowIdx, callback)` | 接续复合 marker 的指定 OutFlow | test-phase1-system-nodes.ts:90 |
| `f.fork(...branches)` | `(...Array<() => void>)` | **全部串行** (按 branches 顺序) | test-bool-input.ts:50 |
| `f.doubleBranch(cond, t, f)` | `(BoolValue, () => void, () => void)` | **只 1 个** (bool 条件) | test-bool-input.ts:27 |
| `f.multipleBranches(expr, cases)` | `(IntValue\|StrValue, Record)` | **只 1 个** (case 匹配) | nodes.ts:3118 |
| `f.finiteLoop(start, end)` | → ref(loopValue) | 循环 N 次, 然后触发 "循环完成" | test-phase1-system-nodes.ts:40 |
| `f.registerExecNode(type, args)` | → ref | 注册 exec 节点 (无 tail 推进) | test-phase1-system-nodes.ts:28 |
| `f.branchExec(srcIdx, record)` | → ref | 从源 OutFlow 创建分支 (不推进 tail) | test-phase1-system-nodes.ts:65 |
| `f.leaf(outflowIdx)` | → void | 标记当前节点的 OutFlow 出口 (推进 tail) | test-phase1-system-nodes.ts:29 |
| `f.createOutParamValue(type, ref, pinIdx)` | → value | 从 ref 节点的 pin 创建 OutParam 引用 | nodes.ts:730 |

---

## 7. 真实 GIA 文件的触发模式对照

### 7.1 物理运动.gia 的 n=22 (顺序执行)

**GIA 端** (4 OutFlow 都接了):
- n=22.OutFlow[0] (cpi=514) → n=23 (Multiple Branches, 10 case)
- n=22.OutFlow[1] (cpi=515) → n=62 (设置额外碰撞重力)
- n=22.OutFlow[2] (cpi=516) → n=56 (Multiple Branches, 5 case)
- n=22.OutFlow[3] (cpi=517) → n=58 (log.运动)

**API 写法** (感觉正确 ⚠️):
```typescript
const sr = f.callComposite(顺序执行, {})
f.connectOutFlow(sr, 0, () => {
  // 调 Multiple Branches, 10 case 派发
  f.multipleBranches(signalType, { 0: ..., 1: ..., ... 9: ..., default: ... })
})
f.connectOutFlow(sr, 1, () => {
  // 调 设置额外碰撞重力 复合
  f.callComposite(设置额外碰撞重力, { 变量值: ..., 定时器时间: ... })
})
f.connectOutFlow(sr, 2, () => {
  f.multipleBranches(signalType2, { 10: ..., 11: ..., ... })
})
f.connectOutFlow(sr, 3, () => {
  f.callComposite(log.运动, { run: ..., v: ..., w: ... })
})
```

### 7.2 物理运动.gia 的 n=74 (顺序执行 闲置 1 个 OutFlow)

**GIA 端**:
- n=74.OutFlow[0] (cpi=514) → n=61 (更新v、w)
- n=74.OutFlow[1] (cpi=515) → **未接** (闲置)
- n=74.OutFlow[2] (cpi=516) → n=75 (条件branch)
- n=74.OutFlow[3] (cpi=517) → n=34 (Set Custom Variable)

**API 写法** (感觉正确 ⚠️):
```typescript
const sr = f.callComposite(顺序执行, {})
f.connectOutFlow(sr, 0, () => { /* n=61 更新v、w */ })
// OutFlow[1] 闲置 — 不写 connectOutFlow 即可
f.connectOutFlow(sr, 2, () => { /* n=75 条件branch */ })
f.connectOutFlow(sr, 3, () => { /* n=34 Set Custom Variable */ })
```

**重要**: 闲置的 OutFlow 在 gsts 编译器中**应该如何处理**? 是直接忽略, 还是生成空节点? 没有找到测试源码验证 ⚠️。

### 7.3 物理运动.gia 的 n=60 (Double Branch 扇出到 2 目标)

**GIA 端**:
- n=60.OutFlow[0] (是) → n=16 (物理运动控制器 v) 1 个目标
- n=60.OutFlow[1] (否) → n=16 (物理运动控制器 w) **AND** n=16 (物理运动控制器 v) **2 个目标**

**关键**: 1 个 OutFlow 可以扇出到**多个下游** (kind=2, index=1 的 connects 有 2 个 entry)

**API 写法** (感觉正确 ⚠️):
```typescript
// f.doubleBranch 接 OutFlow[0] 和 [1] 各一个 callback
const r = f.callComposite(物理运动控制器, { v, w, 运动实体, 运动器时长 })
f.connectOutFlow(r, 0, () => { /* 停止 */ })   // OutFlow[0]"停止"
// OutFlow[1]"继续" 接 Double Branch
f.doubleBranch(condition, () => {
  f.callComposite(物理运动控制器, { ... /* v 实例 */ })
}, () => {
  // 否分支 1 个 callback 内做 2 件事
  f.callComposite(物理运动控制器, { ... /* w 实例 */ })
  f.callComposite(物理运动控制器, { ... /* v 实例 */ })
})
```

**注意**: 否分支的 callback 里有 2 个 `callComposite` — 它们的执行顺序**由 callback 内的书写顺序决定** (不是 GIA 端的"扇出")。

---

## 8. ⚠️ "感觉正确" — 未验证的部分

以下 API 行为是基于源码阅读推断的, **没有经过完整自动化测试**, 需要手动在游戏中验证:

### 8.1 已知未验证的 API 行为

| API | 推断的行为 | 验证状态 |
|-----|-----------|----------|
| `f.multipleBranches` 的 default 分支 | 不匹配任何 case 时触发 default | ❌ 需手动验证 |
| `f.multipleBranches` 的 case 数上限 | ✅ **10 个命名 case + 1 个 default（11 outflow）**；>10 命名 case 时，超出的分支（第 11、12…个）被引擎丢弃，表现为孤立执行链，事件落入 default 分支（rubik-3x3 2927 整转回归实锤；真实 GIL explain + 日志帧双证） | ✅ 2026-08-27 真实 GIL/日志闭合 |
| 顺序执行 复合的"等待"语义 | 是等下游**完全终止**, 还是等下游**触发到第一个 terminal**? | ❌ 需手动验证 |
| 顺序执行 复合的 OutFlow 闲置 | 闲置时, 引擎是"跳过"还是"等不存在的完成"? | ❌ 需手动验证 |
| Multi-InFlow 复合 (10 个 InFlow) | gsts 的 `g.defineComposite` 是否支持? | ❌ 需验证 gap |
| `f.connectOutFlow` 的 `outflowIdx` 范围 | 是否允许超过 `outflows.length`? 会抛错还是 silently ignore? | ❌ 需手动验证 |
| `f.fork` 嵌套 | `f.fork` 内能否再 `f.fork`? | ❌ 需手动验证 |
| `f.branchExec` 后的 tail 状态 | 调用后 tail 是被推进还是被冻结? 决定后续代码接在哪里 | ❌ 需手动验证 |

### 8.2 当前实现状态更新

`multi-outflow-composite-guide.md` 早期曾记录“当前复合节点实现仅支持 0 或 1 个 OutFlow”。这已经是历史状态。

**当前状态**:
- 多 OutFlow 已由 `f.outflow(name, source, idx?)` / `outflowMarks` 支持。
- 多 InFlow 已由 `f.inflow(name, target, idx?)` / `inflowMarks` 支持。
- 新建低层控制流复合优先使用 [`raw-control-flow-dsl-quickstart.md`](./raw-control-flow-dsl-quickstart.md) 的 `f.entry()` / `f.node()` / `f.link()` / `f.inflow()` / `f.outflow()`。
- 仍标为“待验证”的项目只表示游戏运行时语义或特定 API 边界未完全确认，不再表示编译器缺少多 OutFlow / 多 InFlow 基础能力。

### 8.3 验证工具

可以用本目录的 trace 工具验证编译结果:

```bash
# 1. 编译测试源码生成 GIA
npx tsx tests/composite/test-phase1-system-nodes.ts

# 2. 用 trace-exec-flow 看执行骨架
npx tsx tests/composite/trace-exec-flow.ts tests/composite/output/phase1_system_nodes.gia

# 3. 用 analyze-composite-gia 看复合清单
npx tsx tools/analyze-composite-gia.ts tests/composite/output/phase1_system_nodes.gia

# 4. 用 _dump_all_connections 看实际连接
npx tsx tests/composite/_dump_all_connections.ts tests/composite/output/phase1_system_nodes.gia
```

但这些**只能验证编译结果是否正确**, **不能验证游戏运行时行为**。后者必须手动在游戏中运行 GIA 注入。

---

## 8.4 ✅ 实战验证 (2026-07-05 debug3.gia 复刻)

**实战过程**: 用 f.* API 复刻 `user_edit/分支/debug3.gia` (1442 字节) — 6 节点, 2 复合 (Double Branch + Logical NOT) 的"静态断头台"。

**结果**: 12/12 验证通过, 输出 `tests/composite/output/recreate_debug3.gia` (1976 字节)。

**复刻源码**: `tests/composite/recreate-debug3.ts`

### 8.4.1 验证通过的 API 行为 ✅

| API | 验证结论 | 证据 |
|-----|---------|------|
| `g.defineComposite` 多 OutFlow | ✅ **完全支持** (2 OutFlows 命名"是"/"否"都正确生成) | recreate-debug3.ts:33-39 |
| `f.registerExecNode` + `f.leaf` | ✅ **正确生成 impl 节点 + compositePins 映射** | recreate-debug3.ts:33-39 |
| `f.callComposite` 多个实例同图 | ✅ **6 个 composite call 全部生成** | trace-exec-flow 输出 7 节点 |
| `f.connectOutFlow(result, idx, cb)` | ✅ **正确接续指定 OutFlow** | n=4 是/否 → n=3/n=7 |
| `r.输出名` 读取 OutParam | ✅ **自动连到下一个 callComposite 的 InParam** (n=2→n=3) | `_dump_all_connections` 显示 InParam[0] ← n=2 |
| `f.createOutParamValue(type, ref, pinIdx)` | ✅ **Logical NOT 复合的 OutParam 正确生成** | analyze-composite-gia 显示 Out=[结果:4] |

### 8.4.2 实战发现的 gsts 边界 (新增)

| 边界 | 行为 | 影响 |
|------|------|------|
| **空 handler 编译失败** | 完全空的 `g.server().on('whenEntityIsCreated', () => {})` → IR 0 节点 → irToGia 抛 `'IR document must have at least one node'` | debug3.gia 的 0-event 主图**必须加 1 个 event**才能在 gsts 编译 |
| **gsts 隐式 InFlow** | `defineComposite({ inputs: { 输入: bool }, outputs: { 结果: bool }, build: (i, f) => f.registerExecNode(...) })` 生成的 CompositeDef 有 **I=1 而非 I=0** (因为 registerExecNode 隐式加 InFlow) | Logical NOT 复刻的接口多 1 个 InFlow, 与原 debug3.gia 不完全一致 |
| **gsts bug: `arg.getMetadata()` 崩溃** | `src/runtime/core.ts:1471:24` 在 `collectDataDeps` 直接调 `arg.getMetadata()`, 但 raw `false`/`true` 没这个方法 | **必须用 `new bool(value)` 包装**, 不能直接传 raw boolean |
| **0-pin 复合调用不可达** | gsts 至少发 1 个 InParam pin, 即使完全不给 inputs 也不 connectOutFlow | 原 debug3.gia n=6 的 0-pin 孤儿**无法用 gsts 复刻** (会发 1 pin) |
| **复合 ID 不可匹配** | gsts 从 1610700000+ 递增, 不可能匹配 game 编辑器的 1610612756/7 | 不可调整, 接受 |
| **节点位置由算法生成** | gsts 用 layout.ts 算法, 不可匹配手动坐标 | 不可调整, 接受 |

### 8.4.3 实战前后, 8.1 表更新

| API | 验证状态 (实战前) | 验证状态 (实战后) |
|-----|------------------|------------------|
| `f.multipleBranches` 的 default 分支 | ❌ | ❌ 仍待验证 |
| `f.multipleBranches` 的 case 数上限 | ❌ | ❌ 仍待验证 |
| 顺序执行 复合的"等待"语义 | ❌ | ❌ 仍待验证 |
| 顺序执行 复合的 OutFlow 闲置 | ❌ | ❌ 仍待验证 (但 §7.2 实战证明闲置不报错) |
| Multi-InFlow 复合 (10 个 InFlow) | ❌ | ❌ 仍待验证 (但 NOT 隐式 InFlow 提示内部有 InFlow 概念) |
| `f.connectOutFlow` 的 `outflowIdx` 范围 | ❌ | ✅ **已验证**: idx=0, 1 都正确, 索引外会失败 |
| `f.fork` 嵌套 | ❌ | ❌ 仍待验证 (实战用 connectOutFlow 替代) |
| `f.branchExec` 后的 tail 状态 | ❌ | ⚠️ **间接验证**: 实战用 `f.leaf` (等价 low-level API) 工作正常 |

### 8.4.4 实战复刻差异汇总

| 维度 | 原 debug3.gia | 复刻 | 差异 | 原因 |
|------|--------------|------|------|------|
| 文件大小 | 1442 B | 1976 B | +37% | 多 1 event 节点 + 1 数据线 metadata |
| 节点数 | 6 | 7 | +1 | gsts 强制要求至少 1 event |
| 复合数 | 2 | 2 | 0 | ✅ |
| Double Branch 接口 | I=1 O=2 In=1 Out=0 | I=1 O=2 In=1 Out=0 | ✅ 完全一致 | |
| Logical NOT 接口 | I=0 O=0 In=1 Out=1 | **I=1** O=0 In=1 Out=1 | +1 InFlow | gsts 隐式加 |
| exec 边数 | 4 | 6 | +2 | n=3→n=5/n=6 扇出各计 1 边 |
| data 边数 | 1 (n=10→n=4) | 1 (n=2→n=3) | 0 | ✅ |
| 复合 ID | 1610612756/7 | 1610700000/1 | auto-assigned | gsts 限制 |
| 节点位置 | 手动 (-957, -90) 等 | 算法生成 | 必然不同 | gsts 限制 |

---

## 8.5 ✅ Fan-in 实战验证 + 新增 API (2026-07-05)

**问题**: 用 `f.fork` + `f.connectOutFlow` 复刻 `debug4.gia` 时, n=5/n=6 被多源共享 (fan-in) 无法表达 — gsts 每次 callback 都创建新节点.

**解决**: gsts 新增 3 个 API (在 `src/runtime/core.ts` + `src/definitions/nodes.ts`):

### 8.5.1 新 API 签名

```ts
// 1. declareDetached: 创建 marker 但不自动串联到当前 tail
f.declareDetached(handle: CompositeHandle, inputs: Record<string, any>): Record<string, any>

// 2. linkTo: 在 2 个已存在的 marker 之间加一条 OutFlow→InFlow 边
f.linkTo(
  source: { __markerNodeId: number },
  sourceOutflowIdx: number,
  target: { __markerNodeId: number }
): void

// 3. eventMarker: 拿 event 节点的 marker (供 linkTo 作为源)
f.eventMarker(): { __markerNodeId: number }
```

### 8.5.2 复刻 debug4.gia v2 (用新 API)

```ts
g.server().on('whenEntityIsCreated', (_e, f) => {
  const r10 = f.callComposite(notComp, { 输入: new bool(true) })

  // Detached 创建所有 marker (不自动串联)
  const r4 = f.declareDetached(doubleBranch, { 条件: r10.结果 })
  const r3 = f.declareDetached(doubleBranch, { 条件: new bool(true) })
  const r7 = f.declareDetached(doubleBranch, { 条件: new bool(false) })
  const r5 = f.declareDetached(doubleBranch, { 条件: new bool(true) })
  const r6 = f.declareDetached(doubleBranch, { 条件: new bool(false) })

  const ev = f.eventMarker()

  // 显式 fan-in / fan-out 连边
  f.linkTo(ev, 0, r4)
  f.linkTo(ev, 0, r6)
  f.linkTo(r4, 0, r3)
  f.linkTo(r4, 1, r7)
  f.linkTo(r3, 0, r5)
  f.linkTo(r3, 0, r6)
  f.linkTo(r7, 0, r5)
  f.linkTo(r7, 1, r6)
})
```

### 8.5.3 复刻结果 (完美匹配原 debug4.gia)

| 维度 | 原 debug4.gia | recreate_debug4_v2.gia | 差异 |
|------|---------------|------------------------|------|
| 文件大小 | 1571 B | 1961 B | +25% (因为复合 def 包含声明更完整) |
| **节点数** | **6** | **6** | ✅ **完全匹配** |
| **exec 边数** | **8** | **8** | ✅ **完全匹配** |
| **data 边数** | **1** | **1** | ✅ **完全匹配** |
| 复合接口 | DB I=1 O=2, NOT I=0 O=0 | 完全一致 | ✅ |
| 拓扑 | event→{r4,r6}, r4→{r3,r7}, r3→{r5,r6}, r7→{r5,r6} | 完全一致 | ✅ |
| **n=5 fan-in** | r3.是 + r7.是 | ✅ (1 节点 2 inflow) | |
| **n=6 fan-in** | event + r3.是 + r7.否 | ✅ (1 节点 3 inflow) | |
| v1 (f.fork) 节点数 | — | 9 (n=5/n=6 各被复制) | |

### 8.5.4 关键设计决策

| 决策 | 原因 |
|------|------|
| **不修改 `registerNode`** | registerNode 是核心, 改了 risk 太大. 复制其 exec 处理逻辑到 `runDetachedCompositeCall` |
| **新方法 `linkOutflowToMarker` 直接调 `addEdge`** | 不需要新 exec context, 不修改 tailEndpoints, 纯加边 |
| **`eventMarker` 返回 fake marker** | event 本身不是 callComposite, 但需要 `__markerNodeId` 才能被 linkTo 用 |
| **Detached 仍设置 `tailEndpoints`** | 后续 declareDetached 才能链上, 即便我们不连接 |

### 8.5.5 Regression 测试 (重要!)

我新加的 3 个方法**没有引入任何新 regression**:

| 测试 | 原始 (我加之前) | 加新 API 后 | 我的改动影响? |
|------|----------------|------------|---------------|
| test-phase1-system-nodes | ❌ 1 fail (P2-S2) | ❌ 1 fail (P2-S2) | ❌ 无关 |
| test-mixed-composite-normal | ❌ 2 fail (outflows!=1) | ❌ 2 fail (outflows!=1) | ❌ 无关 |
| exec-with-data | ❌ fail | ❌ fail | ❌ 无关 |
| test-bool-input | ✅ pass | ✅ pass | ✅ |
| test-composite-all (78 项) | ✅ pass | ✅ pass | ✅ |
| nested-compare-test | ✅ pass | ✅ pass | ✅ |
| nested-layout-test | ✅ pass | ✅ pass | ✅ |
| test-all-types-composites | ✅ pass | ✅ pass | ✅ |
| **recreate-debug3** | ✅ pass | ✅ pass | ✅ |
| **recreate-debug4 v2** | n/a (新) | ✅ pass | ✅ (新) |

3 个 fail 都是 **pre-existing** 跟 fan-in 无关, 是 gsts 既有 bug (phase2 P2-S2 那个 f.branchExec regression 等).

### 8.5.6 复刻源码 + 输出

- 测试源码: `tests/composite/recreate-debug4-v2.ts`
- 复刻 GIA: `tests/composite/output/recreate_debug4_v2.gia` (1961 B)
- 已复制到游戏: `Beyond_Local_Export/recreate_debug4_v2.gia`

---

## 9. 速查 — 6 种"我想做" → API 对照

> **大模型易错提示**：Composite `build()` 内调用单出口执行 Composite 后，如果只是普通顺序继续，直接使用
> `f.callComposite(child, {})` 即可。当前 capture 会把后续节点接到 child 的 `OutFlow[0]`。
> 条件/派发型多出口节点或 Composite 后的普通顺序 continuation 也只默认接 `OutFlow[0]`，并输出
> `GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION` warning；应把各分支逻辑写入对应 callback，或用
> `f.node()/f.link()`、`f.connectOutFlow()` 显式处理。`finiteLoop` / `listIterationLoop` 的高层 API
> 已明确把普通后续接到 Loop Complete `OutFlow[1]`，不要把该循环例外误归入条件分支默认规则。
>
> ⚠️ **2026-08-20 实证（3×3 魔方）**：`finiteLoop` 循环体的**入口 exec 节点**必须用 `f.registerExecNode(...)` 或高层 flow API（如 `f.doubleBranch`），不要直接放 `f.node()`。`f.node()` 是 detached 创建：作为循环体入口不会自动接进 `OutFlow[0]`（日志：循环控制帧有、写入帧 0）；循环体外的 doneNode 用 `f.node()` 也不会被 Loop Complete `OutFlow[1]` 自动续接（日志：复合 done 不触发、后续 start_timer 零帧）。
>
> ⚠️ **同族规则（2026-08-20 日志 2765 实证）**：`f.doubleBranch` / `f.multipleBranches` / `f.connectOutFlow` 等**多出口执行流节点的回调体里，第一个 exec 节点同样不能用 `f.node()`**——`f.node()` 是 detached，不会自动挂到分支出口；必须用 `f.registerExecNode(...)`，或从分支源显式 `f.link`/`f.connect`。日志证据：`logic_is_solved` 的 `f.doubleBranch` true 分支用 `f.node('set_node_graph_variable')` 时分支条件为 true 但 Set 帧为 0，`solvedFlag` 恒 true → 转动一次立即结算胜利；读图显示 `Double Branch true → (无)`。
>
> ⚠️ **`finiteLoop(start, end)` 是闭区间 `[start, end]`**（`docs/architecture/ir-control-data-flow.md` 已记录；2026-08-20 日志 2766 再次实证）。要执行 N 次必须传 `end = start + N - 1n`：4 次=`(0n,3n)`、8 次=`(0n,7n)`、12 次=`(0n,11n)`、26 次=`(0n,25n)`。传 `(0n,Nn)` 会多执行一次并越界读写。

| 你想做什么 | 写法 | 关键 API |
|------------|------|----------|
| **单链** A → B → C | `f.A(); f.B(); f.C()` | 直接调用 |
| **扇出到 2 目标** A → {B, C} | `f.fork(() => f.B(), () => f.C())` | f.fork |
| **顺序执行 N 步** | 先定义 `g.defineComposite('顺序执行', ...)`, 再 `f.callComposite(...)` + 多个 `f.connectOutFlow` | 顺序执行 复合 + f.connectOutFlow |
| **是/否 2 分支** | `f.doubleBranch(cond, () => {}, () => {})` | f.doubleBranch |
| **case 派发** (10 case) | `f.multipleBranches(ctrlExpr, { 0: cb, 1: cb, ..., default: cb })` | f.multipleBranches |
| **循环** | `f.finiteLoop(start, end)` / `f.listIterationLoop(list)`；循环体是 OutFlow[0]，普通后续是 Loop Complete OutFlow[1] | f.finiteLoop / f.listIterationLoop |
| **调用复合** | `f.callComposite(handle, inputs)` | f.callComposite |
| **接复合的 OutFlow** | `f.connectOutFlow(result, idx, callback)` | f.connectOutFlow |
| **fan-in 共享节点** (1 节点被多源触发) | `f.declareDetached(h, i)` 创建 + `f.linkTo(src, idx, dst)` 连边 | **f.declareDetached + f.linkTo** ✨ |
| **从 event 显式连边** | `f.linkTo(f.eventMarker(), 0, target)` | **f.eventMarker + f.linkTo** ✨ |
| **不串联的 detached 复合** | `f.declareDetached(handle, inputs)` | f.declareDetached ✨ |
| **低层注册 exec 节点** | `f.registerExecNode('double_branch', [args])` | f.registerExecNode |
| **低层创建分支** | `f.branchExec(0, { type: 'exec', nodeType: '...', args: [] })` | f.branchExec |
| **低层标记出口** | `f.leaf(0)` / `f.leaf(1)` | f.leaf |
| **创建 OutParam 引用** | `f.createOutParamValue(type, ref, pinIndex)` | f.createOutParamValue |

> ✨ 标记的 3 个 API (declareDetached / linkTo / eventMarker) 是 2026-07-05 新增, 用于支持 fan-in. 之前 gsts 不支持, 现在已修复.
>
> **💡 新版替代**: 上表最后 4 项（registerExecNode / branchExec / leaf / createOutParamValue）是更低层 API，新建代码优先考虑 [Raw Control-Flow DSL](./raw-control-flow-dsl-quickstart.md) 的 `f.node()`（detached 创建）和 `f.outflow(name, source, idx)`（替代 `f.leaf`）。

---

## 10. 参考

### 10.1 真实 GIA 样本

| 文件 | 路径 | 关键模式 |
|------|------|----------|
| 物理运动.gia | `复杂gia/物理运动.gia` (118KB) | 顺序执行 ×2, 条件branch ×1, Multiple Branches ×2, 物理运动控制器 ×4 实例, 10 InFlow, 9 嵌套复合 |
| 弹球.gia | `复杂gia/弹球.gia` (56KB) | 7 ClientExec, 33 CompositeDef, 信号驱动架构 |
| 传球.gia | `复杂gia/传球.gia` (21KB) | 14 CompositeDef, 事件驱动, 11 个内建共享复合 |
| 纯复合节点-顺序执行.gia | `user_edit/纯复合节点-顺序执行.gia` | 纯定义文件 (which=12), 4 OutFlow 都叫"是" |
| 顺序执行.gia / 顺序执行2.gia / 顺序执行3.gia | `user_edit/顺序执行*.gia` | 顺序执行 复合使用, 1→N 扇出 |

### 10.2 测试源码

| 文件 | 关键内容 |
|------|----------|
| `tests/composite/test-phase1-system-nodes.ts` | **完整定义 顺序执行 复合 + f.connectOutFlow 接续** |
| `tests/composite/test-bool-input.ts` | **f.fork + f.doubleBranch + f.callComposite** |
| `tests/composite/test-mixed-composite-normal.ts` | 混合复合 + 普通节点链 |
| `tests/composite/test-multi-outflow-default-continuation-warning.ts` | 普通 doubleBranch、4 路 multipleBranches、两类 loop、多出口 Composite、nested Composite 和显式 wiring |
| `tests/timer_multi_outflow_node_families.ts` | Timer/主图生成路径中的普通多出口节点族 |
| `tests/timer_multi_outflow_default_continuation_warning.ts` | Timer/Composite 多出口默认 continuation 与 warning |
| `tests/composite/test-composite-game-demo.ts` | 4 个复合, 嵌套调用 |
| `tests/composite/simple-double.ts` | 纯数据复合 + 嵌套调用 |
| `tests/composite/exec-with-data.ts` | exec + data 混合 |

### 10.3 现有文档

| 文档 | 覆盖 |
|------|------|
| `dsl-api.md` | 基础 API: `g.defineComposite` / `f.callComposite` / `f.connectOutFlow` 基础 |
| `multi-outflow-composite-guide.md` | GIA 端多 OutFlow 分析, 编译器实现 gap |
| `composite-outflow-impl-guide.md` | 单 OutFlow 实现细节, 真实 GIA 例子 |
| `composite-connection-boundary-matrix.md` | 连接类型边界 (InFlow/OutFlow/InParam/OutParam 关系) |
| `ir-representation.md` | IR JSON 表示 |

### 10.4 关键代码位置
|------|------|
| `f.fork` 实现 | `src/runtime/core.ts:902-929` |
| `f.branchExec` 实现 | `src/runtime/core.ts:837-862` |
| `f.connectOutFlow` 实现 | `src/definitions/nodes.ts:742-752` |
| `f.connectOutFlowBranch` 实现 | `src/runtime/core.ts:931-943` |
| `f.callComposite` 实现 | `src/definitions/nodes.ts:16547-16552` |
| **`f.linkTo` 实现** ✨ | `src/definitions/nodes.ts:16553-16566` |
| **`f.declareDetached` 实现** ✨ | `src/definitions/nodes.ts:16547` (via `runDetachedCompositeCall`) |
| **`f.eventMarker` 实现** ✨ | `src/definitions/nodes.ts:16567-16571` |
| **`MetaCallRegistry.linkOutflowToMarker` 实现** ✨ | `src/runtime/core.ts:1190-1198` |
| **`MetaCallRegistry.runDetachedCompositeCall` 实现** ✨ | `src/runtime/core.ts:1206-1300` |
| **`MetaCallRegistry.getEventMarkerId` 实现** ✨ | `src/runtime/core.ts:1200-1204` |
| `f.multipleBranches` 签名 | `src/definitions/nodes.ts:3118-3131` |
| `f.doubleBranch` 签名 | `src/definitions/nodes.ts:3308-3350` |
| `f.finiteLoop` 签名 | `src/definitions/nodes.ts:2931` |
| `ServerExecutionFlowFunctions` 类起点 | `src/definitions/nodes.ts:700` |

---

### 10.5 不稳定/待弃用 API（状态：已验证 / 当前推荐，2026-08-20 真实日志 2763/2765/2777 实证，新代码勿用）

以下组合已被真实日志证明会产生死循环或重复执行，**新代码一律改用稳定写法**，旧代码逐步迁移；编译器后续会提供更自然的封装（见 `docs/maintenance/open-items.md` O-2026-08-20-4）。

| 场景 | ❌ 不稳定写法 | ✅ 稳定写法 |
|---|---|---|
| 分支/循环后的公共 merge/done | `f.registerExecNode` 放在 `f.doubleBranch` 之前，分支尾再连回它 → 执行流死循环 | `f.node` 创建 detached 公共节点；分支尾 `f.connect(..., 0, doneNode, 0)`；`f.outflow('done', doneNode, 0)` |
| `f.callComposite` 后的链尾 exec | `f.registerExecNode('start_timer', ...)` → auto-chain 多拉一条入边，同一节点执行两次 | `f.node('start_timer', ...)` + 显式 `f.connect(前置, 0, t, 0)` |
| 分支/循环体第一个 exec | `f.node(...)` → detached 不执行 | `f.registerExecNode(...)` 或高层 flow API（这是它唯一推荐场景） |

## 11. 文档维护

- **作者**: 自动分析 + 用户 2026-07-05 校正
- **最后更新**: 2026-07-05
- **核心来源**:
  - 真实 GIA: `复杂gia/物理运动.gia` (118KB, 50 CompositeDefs)
  - 测试源码: `tests/composite/test-phase1-system-nodes.ts` 等
  - 关键校正: 用户指出"顺序执行 ≠ 并行, 而是串行"
- **未完成项**: §8 列出的 8 项需要手动验证的 API 行为
