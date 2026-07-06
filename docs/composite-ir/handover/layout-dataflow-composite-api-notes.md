# 布局数据流复合测试中的 API 阻碍记录

> 状态：待验证 / 待处理
> 来源：当前代码实现 + R6-B3 测试编写过程
> 最近校验：2026-07-06
> 适用范围：gsts 当前 composite API、布局测试样本编写、后续纯数据复合布局设计

## 背景

在按布局场景 B 编写 `tests/layout-r6-b3-data-composite.ts` 时，为了验证“长数据链应折叠成数据流复合节点”，遇到几个 API/实现层面的阻碍。它们不应被忽略，后续需要单独讨论和处理。

## 已遇到的问题

### 1. composite build 中不能直接用 TS 运算符处理输入占位值

最初写法：

```ts
const plusA = args.score + 999n
const plusB = plusA + 123n
const times = plusB * 2n
```

阶段二执行时报错：

```text
TypeError: Cannot mix BigInt and other types, use explicit conversions
```

原因：`args.score` 在 `g.defineComposite(...).build()` 中是 composite input 占位 value，不是普通 bigint；这里不会经过用户 DSL 的 Stage 1 表达式改写。

当前可用写法：

```ts
const plusA = f.addition(args.score, 999n)
const plusB = f.addition(plusA, 123n)
const times = f.multiplication(plusB, 2n)
```

待讨论：

- 是否应支持 composite build 中的 TS 运算符语法糖？
- 或者文档明确要求 build 内使用 `f.addition` / `f.multiplication` 等显式 API？

### 2. 纯数据 composite 放在执行链中会导致主图控制流断开

最初定义的是纯数据复合：有 inputs/outputs，没有 outflows。

2026-07-06 追加定位：这更像当前实现问题/语义缺口，不是测试 TS 业务代码本身写错。`MetaCallRegistry.runCompositeCall()` 在主图 handler 运行时用：

```ts
const isPureData = def?.captured?.isPureData ?? false
```

决定 marker 是 `data` 还是 `exec`。但 `def.captured` 是后面 `buildServerGraphRegistriesIRDocuments()` 收集 composite defs 时才捕获的。也就是说，第一次在主图里调用该 composite 时，`def.captured` 仍为 `null`，`isPureData` 回退为 `false`，于是纯数据 composite call marker 被注册成了 exec 节点。后续 compositeDef 又按纯数据定义生成：`inflows: []`、`outflows: []`。主图 marker 在 IR 里有 `next`，但 GIA 编码时没有合法 OutFlow pin，最终表现为控制流断开。

主图写法：

```ts
f.printString('start')
const { result } = f.callComposite(calc, { score: f.get('score') })
f.printString(str(result))
f.printString('end')
```

生成后主图中 composite 节点存在，但它没有 OutFlow，后续 `Print String` 没有接到它后面，控制流断开：

```text
Print String -> 复合:R6数据流复合节点
Print String -> Print String   // 这一段变成独立链
```

待讨论：

- 纯数据复合是否应该被允许出现在执行链中？
- 如果一个 `callComposite` 只有数据输出、没有 outflow，Stage 1/2 是否不应推进 exec tail？
- 当纯数据复合结果传给后续 exec 节点时，执行链应该绕过它还是自动生成 passthrough？

### 3. `f.outflow()` 需要 raw node ref，高层 `f.printString()` 返回值不能直接作为 outflow source

尝试写法：

```ts
const marker = f.printString('R6数据流复合内部完成')
f.outflow('完成', marker, 0)
```

阶段二执行时报错：

```text
TypeError: Cannot read properties of undefined (reading 'id')
```

原因：高层 `f.printString()` 不是 raw node ref，不能作为 `f.outflow(name, source, idx)` 的 source。

当前可用写法：

```ts
const marker = f.node('print_string', [new strValue('R6数据流复合内部完成')])
f.outflow('完成', marker, 0)
```

待讨论：

- 文档是否需要更明确地区分高层 f.* 调用返回值和 raw node ref？
- 是否需要提供更友好的 API，例如 `f.outflowFromCurrentTail('完成')`？

### 4. `f.node()` 参数必须是 runtime value，不能传裸 JS primitive

尝试写法：

```ts
const marker = f.node('print_string', ['R6数据流复合内部完成'])
```

阶段二执行时报错：

```text
TypeError: a.getMetadata is not a function
```

原因：raw node args 需要 runtime value 对象，而不是裸字符串。

当前可用写法：

```ts
import { str as strValue } from 'genshin-ts/runtime/value'

const marker = f.node('print_string', [new strValue('R6数据流复合内部完成')])
```

待讨论：

- raw DSL 是否应该自动 `parseValue` 裸 primitive？
- 或者文档中明确 raw node args 必须传 runtime value？

### 5. 生成失败后可能误复制旧 `.gia`

一次生成失败后，旧的 `dist/tests/layout-r6-b3-data-composite.gia` 仍然存在；如果脚本继续 `cp`，会把旧文件复制到游戏目录，造成误测。

已采用的临时规避：

```bash
rm -f dist/tests/$file.gia dist/tests/$file.json
npx tsx bin/gsts.mjs -c gsts.test.config.ts tests/$file.ts || true
test -f dist/tests/$file.gia
```

待讨论：

- 测试/复制脚本应在编译前删除目标 `.gia`。
- 编译失败时不应继续复制。
- 可以写一个专用 `scripts/build-layout-case.mjs` 或 shell helper。

## 当前 B3 临时方案

为了让 `R6-B3数据复合` 主图控制流连续，当前样本采用：

- 数据计算折叠进 composite。
- composite 声明 `outflows: [{ name: '完成' }]`。
- composite 内部添加一个 raw `print_string` 作为 outflow marker。

这只是验证“长数据链折叠后主图是否更清楚”的临时样本，不代表最终纯数据复合设计。

## 后续建议

1. 先等用户验证 B3 的主图布局方向。
2. 单独讨论纯数据 composite 在 exec 链中的语义。
3. 明确 composite build 内表达式语法支持范围。
4. 改进 raw DSL 文档或 API ergonomics。
5. 增加安全的布局测试生成/复制脚本，避免失败后复制旧 `.gia`。
