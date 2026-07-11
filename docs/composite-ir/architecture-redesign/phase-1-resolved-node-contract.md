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

## P1-W2 实测结果

- impl setter/getter family 已接入共享 identity resolver；
- root 保持原 `resolveGiaNodeId()` 路径，确保 root 输出未改变；
- impl float setter identity 已变为 generic `323` + concrete `324`；
- impl vec3 setter identity 已变为 generic `323` + concrete `334`；
- legacy impl pin builder 仍产生 wrapper/index schema 差异，作为后续 lowering 失败契约保留；
- `npm run build` 与 `npx tsx tests/composite/test-stage3-root-impl-parity.ts` PASS；
- 未进行完整 Graph materialization 或游戏内验证。

## P1-W3 实测结果

- getter 从同一变量声明解析 identity：`get_node_graph_variable(floatValue)` 为 generic `337` + concrete `341`；
- 缺少变量声明保持既有 generic fallback，不改变编码策略；shared resolver 现在通过 `fallbacks` sink 记录
  `missing-variable-declaration`；
- 无法转换为当前 scalar/list suffix 的 resolved 类型保持 generic fallback，并记录
  `unsupported-resolved-type`；
- 这些 fallback 记录仅是当前 resolver 的观察/计数 contract，尚未接入 root/impl production diagnostics 或改变
  dict/list legacy lowering；
- `npm run build`、`npx tsx tests/composite/test-stage3-resolved-node-contract.ts` 与
  `npx tsx tests/composite/test-stage3-root-impl-parity.ts` PASS；未进行完整 Graph materialization、真实 GIA
  或游戏内验证。

## P1-W4 实测结果

- root `resolveGiaNodeId()` 的 `get_node_graph_variable` / `set_node_graph_variable` scalar/list variant
  决策现在先委托 shared `resolveNodeIdentity()`；
- shared resolver 无 concrete identity 时继续走 root legacy 分支，因此 dict 和其他未迁移 family 的既有
  resolution 不在本工作包中改变；
- root float setter、vec3 setter 和 float getter adapter contract 分别得到 `324`、`334`、`341`；
- root/impl parity fixture 的 root ordinary setter baseline 保持通过，impl legacy pin wrapper/schema drift
  仍作为失败契约存在；
- `npm run build`、`npx tsx tests/composite/test-stage3-resolved-node-contract.ts`、
  `npx tsx tests/composite/test-stage3-root-impl-parity.ts` 与 `git diff --check` PASS；
- 未进行完整 Graph materialization、真实 GIA、wire 或游戏内验证。

## P1-W5 实测结果

- `resolveGiaNodeId()` 新增可选 `resolutionFallbacks` sink，并原样传给 root adapter 所调用的
  `resolveNodeIdentity()`；未提供 sink 时行为不变；
- dict setter 先记录 `missing-variable-declaration` 与 `unsupported-resolved-type`，随后仍由 legacy
  root branch 解析到既有 concrete ID `2902`；因此观察到 shared adapter fallback，但没有改变 legacy
  compatibility result；
- sink 未接入 `irToGia()`、production diagnostics 或输出文件，故本工作包不改变常规生产编码路径；
- `npm run build`、`npx tsx tests/composite/test-stage3-resolved-node-contract.ts`、
  `npx tsx tests/composite/test-stage3-root-impl-parity.ts` 与 `git diff --check` PASS；
- 未进行完整 Graph materialization、真实 GIA、wire 或游戏内验证。

## P1-W6 实测结果

- shared resolver 将 custom-variable family 与 node-graph-variable declaration contract 分离：
  - `set_custom_variable` 从 value `args[2]` 解析类型；
  - `get_custom_variable` 从该节点的 downstream connection output type 解析类型；
- custom float setter / getter contract 分别得到 generic/concrete `22/26` 与 `50/54`；不再把 target entity
  或 variable-name string 误当作 value type；
- 现有 composite custom-variable focused regression 继续验证 getter 的 concrete output/pin schema（float/guid/int）；
- 本工作包仅校正 shared identity contract，未将 custom-variable root legacy path 接入 resolver，未切换 pin
  lowering 或完整 Graph materialization；
- `npm run build`、`npx tsx tests/composite/test-stage3-resolved-node-contract.ts`、
  `npx tsx tests/composite/test-custom-variable-impl-pins.ts`、
  `npx tsx tests/composite/test-stage3-root-impl-parity.ts` 与 `git diff --check` PASS；
- 未进行真实 GIA、wire、注入或游戏内验证。

## Tests

- root/impl float setter identity parity；
- root/impl vec3 setter identity parity；
- setter literal 与 conn identity parity；
- declared float + assigned int 冲突；
- missing variable declaration 的明确 generic fallback 与计数；
- getter/setter 对声明变量的 identity 一致性；
- existing mode-specific root node 不回归；
- dict/list 旧 fallback 有计数，不静默变化；
- custom setter 使用 value `args[2]`，custom getter 使用 downstream output type。

## 退出条件

- [x] setter float 在 root/impl 都解析 generic `323` + concrete `324`；
- [x] vec3 setter 解析到 vendor Vec variant；
- [x] getter/setter 对同一变量 resolved type 一致（float declaration fixture）；
- [x] 冲突产生结构化错误；
- [x] root 当前 fixture 编码未因纯 refactor 改变；
- [x] shared resolver 对 missing declaration / unsupported type 有显式 fallback 记录；root adapter 的可选
  observation sink 已接通，生产路径接入仍留待后续工作包。
- [ ] `valueTypeSuffix` 等 impl 副本开始删除或仅作为 legacy adapter。

## 回滚条件

若共享 resolver 需要读取 encoded pin 才能判断类型，说明分层失败：返回 Phase 0/contract 设计，不把编码结果作为
语义类型来源。
