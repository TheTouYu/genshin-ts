# 阶段一：TS → .gs.ts — TypeScript 到图脚本变换

> 本文档描述编译管线第一阶段：如何将 TypeScript 源代码转换为"图脚本"（.gs.ts）形式——一种以节点函数调用为基本单位的中间代码。

---

## 1. 概述

**目标**：将 `g.server(name).on(event, handler)` 链式调用、`gstsServer*` 函数等高阶 DSL 语法，转换为平整的节点函数调用序列。

**位置**：`src/compiler/ts_to_gs_pipeline.ts` + `src/compiler/ts_to_gs_transform/`

**输入**：TypeScript 源文件（`.ts`）

**输出**：图脚本文件（`.gs.ts`），在入口文件顶部添加 `// @gsts:entry` 标记

**核心机制**：使用 TypeScript Compiler API 的 `ts.createProgram` + `ts.transform` 进行 AST 级别的代码变换。

---

## 2. 数据结构：TransformCtx 与 Env

变换在**两个上下文对象**的协作下完成：

### 2.1 TransformCtx (编译上下文)

```typescript
interface TransformCtx {
  checker: ts.TypeChecker          // TS 类型检查器（用于类型推断）
  config: GstsConfig               // 编译配置
  timerCounterRef: { value: number } // 全局 timer 计数器（跨文件共享）
}
```

创建于 `ts_to_gs_pipeline.ts`，使用 `ts.createProgram` + `prg.getTypeChecker()`。

### 2.2 Env (变换环境)

每个 `g.server().on()` handler / `gstsServer` 函数都会创建一个独立的 Env，携带该作用域的状态：

```typescript
interface Env {
  gstsIdent: string         // 'gsts' 或 '__gsts'（用于命名空间隔离）
  config: GstsConfig
  file: ts.SourceFile
  checker: ts.TypeChecker
  loopMax: number           // 循环展开上限
  tempCounter: number       // 临时变量计数器
  timerCounterRef
  features: FeatureFlags
  eventName?: string
  timerHandleMeta: Map<string, Meta>
  enumImport?: EnumImportInfo
  needsEnumImportRef: Ref<boolean>
  
  // 以下是在变换过程中设置的作用域信息
  fIdent?: string           // 'f' 参数名
  evtIdent?: string         // 'evt' 参数名
  serverCtx?: boolean       // 是否在服务器上下文中
  returnMode?: 'handler' | 'value'
  returnDepth?: number
  breakName?: string        // 循环 break 函数名
  continueInfo?: object     // 循环 continue 信息
  varPlan?: VarPlan         // 变量规划
  localNames?: Set<string>
  localVarNames?: Set<string>
}
```

---

## 3. 变换入口：transformToGs

`src/compiler/ts_to_gs_transform/index.ts` 中的 `transformToGs` 函数是阶段 1 的主入口。

### 执行流程

```
transformToGs(sf, ctx)
  │
  ├─ 1. 构建 Env（makeEnv）
  │
  ├─ 2. 提取顶层 gstsServer* 声明
  │     → 扫描顶层的函数声明和变量声明，收集所有 gstsServer* 定义
  │     → 检查重复名称
  │
  ├─ 3. 验证 gstsServer 用法
  │     → 不允许在 server 上下文之外调用 gstsServer
  │     → 不允许递归（DFS 检测环）
  │     → 不允许赋值（只允许声明）
  │
  ├─ 4. 创建 TS AST 变换器 (transformer)
  │
  ├─ 5. 遍历 AST，匹配特定模式
  │     → g.server().on() / g.server().onSignal() 链
  │     → gstsServer* 函数定义
  │     → 对匹配的 handler 递归调用 transformHandler
  │     → 对匹配的函数定义递归调用 transformGstsServerFunction
  │
  └─ 6. 返回变换后的 SourceFile
```

### 5.1 g.server().on() handler 变换

```typescript
// 输入
g.server({ name: 'MyGraph' }).on('timeScaleChange', (evt, f) => {
  let x = 1
  if (x > 0) {
    f.log(str('hello'))
  }
})

// 概念输出 (.gs.ts)
const gsts = globalThis.gsts
var x = gsts.f.initLocalVariable('int')
gsts.f.setLocalVariable(x.localVariable, 1)
gsts.f.doubleBranch(
  gsts.f.greaterThan(x.value, 0),
  () => { gsts.f.log(str('hello')) },
  () => {}
)
```

变换器通过 `ts.isCallExpression(node) && isServerOnCall(node, checker)` 识别 `g.server().on()` 调用，然后进入 `transformHandler`。

### 5.2 gstsServer 函数变换

```typescript
// 输入
function gstsServerAdd(a: number, b: number) {
  return a + b
}

// 概念输出 (.gs.ts)
const gsts = globalThis.gsts
function gstsServerAdd(a, b) {
  return gsts.f.addition(a, b)
}
```

---

## 4. 核心变换子模块

### 4.1 stmt.ts — 语句变换

`src/compiler/ts_to_gs_transform/stmt.ts` 包含所有语句级别的变换逻辑。

**关键函数**：

- `transformHandler(env, context, fn)` — 变换事件处理函数体
- `transformGstsServerFunction(env, context, fn)` — 变换 gstsServer 函数
- `transformBlockStatements(env, context, stmts)` — 变换块内所有语句
- `buildVarPlan(env, body)` — 变量使用规划分析

**支持的语句变换**：

| 源语句 | 目标节点 |
|--------|----------|
| `if (cond) { … } else { … }` | `doubleBranch(cond, thenFn, elseFn)` |
| `switch(expr) { case … }` | `multipleBranches(expr, { key: fn, … })` |
| `for (;;) { … }` | `forLoop` 相关节点 |
| `while (cond) { … }` | `doubleBranch` 循环模式 |
| `do { … } while (cond)` | `doubleBranch` 循环模式 |
| `for (x of xs) { … }` | `listIterationLoop` 节点 |
| `break` | 调用循环的 break 函数 |
| `continue` | `continue` 调用 + 条件判断（do-while 特殊处理） |
| `return` | `return` 调用（gstsServer 中带值 return 特例处理） |
| `let/const x = expr` | 变量声明变换 |
| `x = expr` | 赋值变换（集合类型做快照处理） |

**switch 变换细节**：

一个 switch 语句会被变换为：

```typescript
f.multipleBranches(controlExpr, {
  'key1': () => { /* body1 */ },
  'key2': () => { /* body2 */ },
  default: () => { /* default body */ }
})
```

- case 穿透（fallthrough）**不被支持**（除非是空 case 转发到下个有体的 case）
- switch 控制表达式必须是 `int` 或 `str` 类型

### 4.2 expr.ts — 表达式变换

`src/compiler/ts_to_gs_transform/expr.ts` 处理所有表达式的变换。

关键变换：

| 源表达式 | 目标节点调用 |
|----------|--------------|
| `a + b`, `a - b` | `f.addition(a, b)`, `f.subtraction(a, b)` |
| `a > b`, `a === b` | `f.greaterThan(a, b)`, `f.equal(a, b)` |
| `a && b`, `a || b` | `f.logicalAndOperation(a, b)` |
| `!a` | `f.logicalNotOperation(a)` |
| `arr[idx]` | `f.getCorrespondingValueFromList(arr, idx)` |
| `arr[idx] = val` | `f.modifyListElements(arr, idx, val)` |
| `obj.prop` | `f.getProperty(obj, 'prop')` |
| `console.log(x)` | `print(str(x))` |
| `setTimeout(fn, ms)` | TMR 节点（timer 分配） |
| `f.method(args)` | `f.method(args)` 直接映射 |

表达式变换还负责：

- **timer handle 元数据提取**：识别 `setTimeout` 和 `setInterval`，分配 timer ID 池
- **常量折叠**（`const_eval.ts`）：纯字面量表达式在编译期预计算
- **集合引用快照**（`tryTransformCollectionRebindSnapshot`）：对 `xs = list(…)` 这种集合绑定，插入 `initLocalVariable` + `setLocalVariable` 的快照
- **timer 中复合输出类型保真**（`inferCompositeOutputType`）：当 timer callback 中的 `f.callComposite(...).output` 因回调参数类型不可见而无法由 TypeScript checker 推断时，从 `CompositeHandle.__outputs` 或同一 `defineComposite` 声明回退读取输出类型，避免生成错误的 `entity` 局部变量。

### 4.3 ops.ts — 运算符映射

`src/compiler/ts_to_gs_transform/ops.ts` 将 TypeScript 运算符映射到节点图方法：

```
+, -, *, /, %  →  addition, subtraction, multiplication, division, moduloOperation
++, --         →  +1/-1（拆解为加/减）
<<, >>, &, |, ^  →  按位运算符
===, ==, !==, !=  →  equal
<, >, <=, >=    →  对应的比较方法
&&, ||          →  logicalAndOperation / logicalOrOperation
!               →  logicalNotOperation
```

### 4.4 loops.ts — 循环变换

`src/compiler/ts_to_gs_transform/loops.ts` 处理四种循环：

- **`for (init; cond; inc) { body }`** → `forLoop(condFns, [initFn])` 或递归结构
- **`while (cond) { body }`** → 类似 if + goto 模式，使用 `doubleBranch`
- **`do { body } while (cond)`** → 先 body 后判断，使用 `doubleBranch`
- **`for (x of xs) { body }`** → `listIterationLoop(xs, loopBodyFn)`

循环变换需要额外处理：

- **break/continue**：生成对应的跳出/继续函数调用，维护 `breakName` / `continueInfo`
- **嵌套循环**：每层循环创建独立的 break/continue 标识符

### 4.5 builtins.ts — 内建函数

将 TS 的内建操作（如 `Array.push`, `Array.pop`, `Object.keys` 等）映射到节点图方法。

---

## 5. 变量使用规划（VarPlan）

在变换执行前，gsts 会扫描整个 handler 体来**分析变量使用模式**（`buildVarPlan` 函数）。

### 分析维度

| 属性 | 含义 |
|------|------|
| `isCollection` | 是否为列表/字典等集合类型 |
| `isBasic` | 是否为基础值类型（int/float/str/bool 等） |
| `hasWrite` | 是否有写入操作 |
| `hasBindingWrite` | 是否有绑定级别的"x = …"写入 |
| `wroteInExec` | 是否在 exec 主体（非初始化）中写入 |
| `hasRandomWrite` | 写入中是否包含随机值 |
| `readCount` | 被读取次数 |
| `readInLoop` | 是否在循环体内被读取 |
| `collectionSourceKind` | 集合来源：liveRef/copy/temporary/unknown |

### 决策逻辑

- **基础类型变量**（int/float/str/bool）：
  - `let` 或在 exec 中被写入 → 需要 `LocalVariable`
  - `const` 且多次读取且非纯字面量 → 提升为 LocalVariable
  
- **集合类型变量**（list/dict）：
  - copy 来源（如 `list(…)`）→ 有修改或多次读取时需要 LocalVariable
  - liveRef 来源（如 `f.get(…)`）→ 仅当在控制流中被重绑定时需要 LocalVariable
  - temporary 来源（如 `assemblyList`）→ 有修改时需 LocalVariable

---

## 6. 模块引用重写

`ts_to_gs_pipeline.ts` 中的 `rewriteRelativeModuleSpecifiers` 函数会在编译时将模块引用路径从 `.ts` 改写为 `.gs.ts`：

```
// 输入 TS 文件中
import { helper } from './helper'

// 输出 .gs.ts 文件中
import { helper } from './helper.gs'
```

这确保链式导入也能被正确编译。

---

## 7. 错误处理

变换器使用 `src/compiler/ts_to_gs_transform/errors.ts` 中的 `fail(env, node, message)` 函数抛出编译错误。以下是被明确禁止的语法：

| 不被支持 | 原因 |
|----------|------|
| `try/catch/finally` | 节点图无异常语义 |
| `throw` | 节点图无异常语义 |
| `for…in` | 语义不匹配 |
| `block` 语句（裸 `{}`） | 作用域不明确 |
| `labeled` 语句 | 不支持标签跳转 |
| `with` | 性能/语义问题 |
| 函数/类声明在回调内 | 只能用 gstsServer* 声明在顶层 |
| gstsServer 递归 | 会导致无限图展开 |
| 解构参数 | 节点图参数需为简单标识符 |
| 回调内 return `<expr>` | 节点图 return 只支持终止分支 |
| switch fallthrough 带体 | 匹配节点图多分支语义 |
