# Phase 1：Resolved Node Contract 与共享 Variant Resolution

> 状态：待执行
> 来源：目标架构设计
> 最近校验：2026-07-12
> 适用范围：Stage 3 类型与节点 identity；本阶段不要求全面替换 pin 编码

## 目标

把“收集类型”“校验类型”“选择 generic/concrete node identity”从 root/impl 编码代码中抽出，建立
scope-aware 但决策共享的 contract。

## 前置条件

- Phase 0 完成；
- 已知 vendor Node 对 setter variant 的实际行为；
- 当前错误有失败契约测试。

## 设计任务

### 1.1 定义 `GraphCompileContext`

至少包含：

- scope kind/name；
- server/runtime mode；
- variables by name；
- connection output type index；
- composite defs；
- diagnostics sink。

### 1.2 定义 resolved type

替代散落字符串，但允许从 `IR.d.ts` 字符串无损转换。必须表示 scalar/list/dict/enum/local variable，不能把
未知类型静默映射成 0。

### 1.3 类型来源仲裁

实现并测试：

```text
variable declaration
connection output
literal runtime type
composite interface
node signature
```

对 setter 同时比较声明与赋值；对 getter 由声明决定 output。

### 1.4 抽共享 type suffix/variant lookup

将 `node_id.ts` 与 `composite.ts` 的 suffix 逻辑合并。先迁移 setter/getter family，不要求一轮覆盖所有 dict
special cases。

### 1.5 保持 root 输出

Root `resolveGiaNodeId()` 可暂时成为 adapter：先构建 context，再调用共享 resolver；其余未迁移 family 保留旧路径，
但 fallback 必须显式统计。

### 1.6 Impl 只采用 identity

本阶段可先让 impl 从共享 resolver 得到 generic/concrete ID，仍使用 legacy pin builder，以隔离 identity 与 lowering
变化。该中间态不能作为最终修复完成，因为 pin wrapper 可能仍错。

## API 草案

```ts
resolveArgumentTypes(node, context): ResolvedInput[]
resolveNodeIdentity(node, resolvedInputs, context): ResolvedNodeIdentity
assertVariableAssignment(variable, inputType, location): void
```

## P1-W1 实测结果

- 新增 `resolved_node.ts`，提供最小 `GraphCompileContext`、`ResolvedValueType`、`ResolvedInput` 和
  `ResolvedNodeIdentity` contract；
- float setter 解析为 generic `323` + concrete `324`；
- vec3 setter 解析为 generic `323` + concrete `334`；
- 声明 float 与 int 赋值冲突产生 `E_TYPED_INPUT_CONFLICT`；
- 当前仅为 L1 resolved contract 观察实现，尚未接入 root/impl production lowering；
- `npm run build` 与 `npx tsx tests/composite/test-stage3-resolved-node-contract.ts` PASS；
- 未进行 vendor encoding、完整 Graph materialization 或游戏内验证。

## Tests

- root/impl float setter identity parity；
- root/impl vec3 setter identity parity；
- setter literal 与 conn identity parity；
- declared float + assigned int 冲突；
- missing variable declaration 的明确策略；
- existing mode-specific root node 不回归；
- dict/list 旧 fallback 有计数，不静默变化。

## 退出条件

- [ ] setter float 在 root/impl 都解析 generic `323` + concrete `324`；
- [ ] vec3 setter 解析到 vendor Vec variant；
- [ ] getter/setter 对同一变量 resolved type 一致；
- [ ] 冲突产生结构化错误；
- [ ] root 当前 fixture 编码未因纯 refactor 改变；
- [ ] 未解析 family 有明确 fallback 和后续清单；
- [ ] `valueTypeSuffix` 等 impl 副本开始删除或仅作为 legacy adapter。

## 回滚条件

若共享 resolver 需要读取 encoded pin 才能判断类型，说明分层失败：返回 Phase 0/contract 设计，不把编码结果作为
语义类型来源。
