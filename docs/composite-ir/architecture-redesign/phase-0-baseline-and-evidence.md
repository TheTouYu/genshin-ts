# Phase 0：基线、证据与 Vendor 实验

> 状态：进行中（P0-W0~W5 完成）
> 来源：当前实现 + 已知真实 GIA 差异 + vendor 实验 + root/impl parity fixture
> 最近校验：2026-07-12
> 适用范围：只建立证据，不改变生产编码行为

## 目标

在重构前回答“vendor 到底能替我们做什么”，并把现有 root/impl 差异及不可回归边界自动化。

## 非目标

- 不修复 `额外压力`；
- 不改 `resolveImplNodeId()`；
- 不替换 `buildImplNodePins()`；
- 不注入游戏目录。

## 工作项

### 0.1 建立最小 typed setter fixture

新增独立测试，生成：

- root float literal setter；
- one-level impl float literal setter；
- root/impl vec3 connection setter；
- 可选 int/bool/str 观察样本。

Fixture 不使用物理变量名作为编译逻辑，但可以额外读取物理输出作真实对照。

### 0.2 Vendor Node 实验

直接构造：

```ts
new Node(0, 'server', 324)
```

设置：

```text
pin0 = "额外压力"
pin1 = 0
pin2 = false
```

记录构造后、`Node.encode()` 后和临时 `Graph.encode()` 后的完整字段。

### 0.3 Vendor connection 实验

使用真实 float producer 与 Vec producer，调用：

```ts
Graph.connect(from, setter, fromPin, 1)
```

检查连接是否挂在 target InParam、是否保留 concrete wrapper、source index 是否需要 hidden-pin remap。

### 0.4 真实节点逐字段提取

输入：

```text
复杂gia/物理运动.gia：更新v、w impl n[4]
dist/tests/layout/physics-motion/main.gia：更新v、w impl n[13]
```

输出机器可读 JSON，只保留 identity、pins、value 和 connects；不要只保存 trace 文本。

### 0.5 Root/impl parity helper

建立规范化比较函数，排除 nodeIndex/position/wrapper，锁定 ordinary schema。

### 0.6 基线回归清单

确认并运行 nested/capture/bool/local/custom/vec3 focused tests；记录真实存在的脚本、命令和结果，修正文档中过时 pending 描述但不顺便改实现。

## P0-W5 实测结果

日期：2026-07-12。以下命令均在当前分支、生产实现未修改的工作树上执行。

### Root/impl 失败契约

```text
npx tsx tests/composite/test-stage3-root-impl-parity.ts  PASS（预期 red contract）
```

Root float literal/connection 与 vec3 connection baseline 通过；impl 与 root 的 parity 仍按预期在 concreteId、valueClass、concrete wrapper、indexOfConcrete（connection 另含 alreadySetVal）上失败。该失败是 P0-W4 锁定的迁移前契约，不是本轮回归失败。

### Composite boundary focused baseline

| 场景 | 命令 | 结果 | 证据范围 |
|---|---|---|---|
| nested capture physical pins | `npx tsx tests/composite/test-nested-composite-capture-pins.ts` | PASS | captured-only input 不生成 physical pin；保留 sparse physical index；capture 仍经 `compositePins` 路由 |
| nested outflow marker | `npx tsx tests/composite/test-nested-composite-outflow.ts` | PASS | nested call 的 OutFlow 与外层 composite pin 映射及 downstream connect 保持 |
| bool composite input GIA | `npx tsx tests/composite/test-composite-bool-input-gia.ts` | PASS | bool enum metadata、type、pin index、literal value 保持 |
| local variable concrete type | `npx tsx tests/composite/test-local-variable-impl-concrete-type.ts` | PASS | impl vec3 local getter/setter concrete wrapper 与真实 pin 结构观察一致 |
| custom variable impl pins | `npx tsx tests/composite/test-custom-variable-impl-pins.ts` | PASS | captured input 不编码为 physical InParam，声明 pin index 与 concrete output type 保持 |
| sparse named input | `npx tsx tests/composite/test-composite-sparse-named-input.ts` | PASS | `compositeInputIndex` 与 declared input hole 保持 |
| broad composite suite | `npx tsx tests/composite/test-composite-all.ts` | PASS（78/78 active） | 80 total：78 active pass，2 个设施图参考文件对比仍为 pending |

### 已发现但未修复的基线问题

以下命令不是本轮 production boundary 迁移的验收通过项，结果保留用于后续清理，未顺手修改：

```text
npx tsx tests/composite/test-composite-part3.ts  FAIL
  captured output 使用 raw primitive，触发 outputValue.getMetadata is not a function

npx tsx tests/composite/test-composite-part2.ts  FAIL
  callComposite fixture 使用 { type: 'int', value: null }，触发 Value has no metadata
```

这两项属于既有测试 fixture/API 使用问题，失败位置分别是
`src/runtime/composite_registry.ts:228` 和 `src/runtime/ir_builder.ts:121`，不应被记录为 nested/capture 结构已回归。修复它们需要单独工作包；本轮不改变实现或测试语义。

### 0.6 结论

- nested/capture/bool/local/custom/sparse/vec3 重点边界均有实际命令记录；通过项保持现有迁移不变量。
- root/impl ordinary schema drift 的 red contract 仍稳定存在。
- `test-composite-all.ts` 的两个 `@pending_ref` 是缺少设施图参考文件的证据范围限制，不是实现失败。
- `test-composite-part2.ts` 与 `test-composite-part3.ts` 的失败已单独标为待处理 fixture 问题，不推广为 composite boundary 结论。
- 本轮没有生产编码行为修改。

## 建议文件

```text
tests/composite/experiment-vendor-set-node-graph-variable.ts
tests/composite/test-stage3-root-impl-parity.ts
tests/composite/helpers/ordinary-node-contract.ts
```

最终命名可按现有测试约定调整。

## 必须记录的数据

- vendor concrete ID 到 generic ID 的反射结果；
- pin kind/index/type；
- `indexOfConcrete`；
- `alreadySetVal`；
- wrapper 与 inner value；
- literal/connection 差异；
- `Node.encode` 与 `Graph.encode` 差异；
- 是否需要 project normalization。

## P0-W1 实测结果

实验文件：`tests/composite/experiment-vendor-set-node-graph-variable.ts`

### Vendor Node(324) 与真实 GIA 逐字段对照

| 字段 | 真实 更新v、w n[4] | Vendor Node(324) | 匹配 |
|---|---|---|---|
| generic_id | 323 | 323 | ✓ |
| concrete_id | 324 | 324 | ✓ |
| InParam[0] type | 6 (Str) | 6 (Str) | ✓ |
| InParam[0] value | rawStr=额外压力 | rawStr=额外压力 | ✓ |
| InParam[1] type | 5 (R\<T\>) | 5 (R\<T\>) | ✓ |
| InParam[1] bConcreteValue | 存在 | 存在 | ✓ |
| InParam[1] indexOfConcrete | 1 | 1 | ✓ |
| InParam[1] bFloat.val | 0 | 0 | ✓ |
| InParam[2] type | 4 (Bool) | 4 (Bool) | ✓ |
| InParam[2] bEnum.val | 0 | 0 | ✓ |

结论：Vendor `new Node(0, 'server', 324)` + `setVal(...)` 可直接生成与真实 GIA 逐字段一致的 setter 节点。

### Vendor Node(323) (generic only)

- Generic-only 构造不调用 setConcrete，pins 数组为空，无法 setVal。
- ReflectMap 包含 160 个 concrete variant 映射（323→全部支持类型的 R\<T\> 变体）。

## P0-W4 实测结果

文件：

```text
tests/composite/helpers/ordinary-node-contract.ts
tests/composite/test-stage3-root-impl-parity.ts
```

命令：

```bash
npx tsx tests/composite/test-stage3-root-impl-parity.ts
```

### Root production baseline（当前正确）

| case | generic | concrete | InParam[1] type | bConcreteValue | iOC | connection source |
|---|---|---|---|---|---|---|
| float literal | 323 | 324 | 5 | yes | 1 | none |
| float connection | 323 | 324 | 5 | yes | 1 | kind=4 index=0 |
| vec connection | 323 | 334 | 12 | yes | 11 | kind=4 index=0 |

### Impl production current defect（失败契约）

| case | generic | concrete | InParam[1] | bConcreteValue | notes |
|---|---|---|---|---|---|
| float literal | 323 | 323 | type=5 class=4 raw bFloat | no | 与 root 漂移 |
| float connection | 323 | 323 | type=5 class=4 | no | conn source 仍 kind=4/index=0 |
| vec connection | 323 | 323 | type=12 class=7 | no | conn source 仍 kind=4/index=0 |

### Parity helper 行为

- 规范化字段：`genericId` / `concreteId` / pin kind·index·type / `valueClass` / `alreadySetVal` /
  `hasConcreteWrapper` / `indexOfConcrete` / payload kind·literal summary / connection source pin。
- 排除：`nodeIndex`、position、绝对上游 node id。
- 当前 root→impl 比较失败类别：`concreteId`、`valueClass`、`hasConcreteWrapper`、`indexOfConcrete`
  （connection cases 另见 `alreadySetVal` 漂移）。
- 纯 synthetic unit 也能检出 concrete wrapper 漂移。

结论：P0-W1~W3 vendor 证据已落到可重复 production encode 失败契约；后续迁移应以该 fixture 由红转绿为验收，而不是只看 vendor 单测。

## 退出条件

- [x] float literal 差异可由独立 fixture 稳定重现；
- [x] vec3 connection 至少有 root/impl 观察结果；
- [x] vendor `Node(324)` 实验有逐字段结果；
- [x] vendor `Graph.connect()` 实验有逐字段结果；
- [x] parity helper 能在当前错误上失败；
- [x] composite 边界 focused baseline 全部记录；
- [x] 没有生产行为修改。

## 决策闸门

实验后再决定 Phase 2 使用：

- 直接保留 vendor `Node` 到整图 encode；或
- 单节点 vendor encode 后提取 GraphNode；或
- vendor schema + 项目 adapter。

未完成实验前不得把“临时 Graph 一定可嵌入 impl”写成结论。
