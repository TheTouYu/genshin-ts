# Phase 4：隔离 Composite Boundary

> 状态：待执行
> 来源：当前 composite/capture 实现 + 目标架构设计
> 最近校验：2026-07-11
> 适用范围：CompositeDef、synthetic call、capture 与 compositePins

## 目标

在普通节点和普通边已经共享后，把 `composite.ts` 剩余职责拆为明确 boundary pipeline，避免 boundary metadata
重新侵入 ordinary lowering。

## 目标流水线

```text
CompositeDefIR
  ↓ normalize capture/sparse inputs
NormalizedCompositeIR
  ↓ resolve ordinary graph + synthetic calls
ResolvedCompositeGraph
  ↓ shared materializer (ordinary subgraph)
Materialized NodeGraph
  ↓ boundary overlay
CompositeDef + compositePins + GraphUnit pair
```

## 工作项

### 4.1 Capture normalization 模块化

输入原始 capture nodes/marks，输出：

- filtered ordinary nodes；
- redirected ordinary edges；
- boundary bindings；
- deterministic node index mapping requirements。

禁止 ordinary lowerer看到 `capture: true`。

### 4.2 Composite call lowerer

专门负责：

- `SysGraph` identity；
- child definition inputs/outputs/inflows/outflows；
- sparse `compositeInputIndex`；
- physical pins；
- `compositePinIndex`；
- literal/connection/capture 来源分类。

它可调用共享 value codec，但不是 ordinary vendor node。

### 4.3 Definition interface builder

集中构建：

- ParameterFlow；
- bool/enum metadata；
- external pin indices；
- inflow/outflow interface；
- impl graph relation。

### 4.4 CompositePins overlay

从已编码 node mapping 建立路由，添加完整性断言：

- outer pin 存在；
- inner node/pin 存在；
- kind/index/type 对齐；
- capture route 不产生重复 physical pin；
- nested call route 指向正确 child pin。

### 4.5 Layout isolation

保留 composite virtual anchors 与 impl layout 配置，但布局只消费 normalized graph，不改变节点/pin semantics。

## Tests

- pure data composite；
- single/multiple inflow/outflow；
- nested data + exec call；
- nested capture；
- sparse named literal/connection；
- bool metadata raw wire；
- physical-motion `与` / `can fly` 保持嵌套；
- node-index remap 与 compositePins integrity。

## 退出条件

- [ ] ordinary lowering 模块无 composite capture/call 分支；
- [ ] capture normalization 有独立输入输出 contract；
- [ ] call synthetic pins 有单一 builder；
- [ ] compositePins 在 materialization 后统一应用；
- [ ] nested/capture/sparse/bool 回归通过；
- [ ] `composite.ts` 只做 orchestration 或已拆成边界模块。

## 禁止事项

- 不为简化边界而展开 nested composite；
- 不把 capture 编码成游戏普通节点；
- 不根据当前物理布局猜 outer/inner pin route；
- 不把真实编辑器 ID 规律无证据推广到 gsts ID 分配策略。
