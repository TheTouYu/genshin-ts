# 全局规划：统一普通图编译器，隔离复合边界

> 状态：当前推荐 / 规划中
> 来源：当前代码实现 + 真实 GIA 对照 + 架构推导
> 最近校验：2026-07-11
> 适用范围：Stage 3 IR → GIA 重构计划；尚未实施

## 1. 问题陈述

当前 Stage 3 实际有两个普通节点 backend：

| 范围 | ID 解析 | pin/value | 连接 | 编码 |
|---|---|---|---|---|
| root | `resolveGiaNodeId()` | vendor `Node`/`Pin.setVal()` + 主图补丁 | `Graph.connect/flow` | `Graph.encode()` |
| composite impl | `resolveImplNodeId()` 等 | 大量手写 `NodePin`、concrete index 与 wrapper | 手写 `connects` | 手工 `GraphNode` |

它们共享 IR 名称，却不共享类型决策和节点物化。结果是同一节点放进不同 scope 后可能得到不同
concrete ID、pin schema、hidden-pin remap 和 metadata。

## 2. 目标

建立一个 scope-aware、vendor-backed 的普通图编译核心，使下列不变量成立：

```text
相同普通 IR 节点 + 相同已解析类型
⇒ root 与 impl 的 generic/concrete identity 相同
⇒ ordinary InParam/OutParam schema 相同
⇒ literal 与 connection 使用同一目标 pin schema
```

Composite backend 最终只负责：

- `CompositeDef`/impl `NodeGraph` 包装；
- composite call synthetic node；
- capture normalization 与边界路由；
- `compositePins`、外部参数、inflow/outflow；
- composite 专属布局锚点。

## 3. 非目标

- 不以“减少代码行数”为首要目标。
- 不要求 root 和 impl 使用相同布局坐标或节点索引。
- 不把 composite synthetic node 塞进 vendor 系统节点表。
- 不在没有真实证据时统一所有列表、字典、entity/guid/prefab 规则。
- 不把 `resolveGiaNodeId()` 原样塞入 `composite.ts`；它需要先被拆为共享决策与 scope adapter。

## 4. 阶段路线

| Phase | 交付物 | 实现闸门 | 退出条件 |
|---|---|---|---|
| 0 | 基线、差异清单、vendor experiments | 不改生产行为 | 可稳定重现 root/impl 差异，已锁定不可回归结构 |
| 1 | `ResolvedNode`/类型诊断与共享 variant resolution | 不大改 pin 编码 | setter float/vec3 在两 scope 得到相同 identity；冲突可诊断 |
| 2 | 共享 vendor ordinary-node lowering | impl 可按节点族切换 | 首个 vertical slice 的 pins 与真实 GIA/主图契约一致 |
| 3 | 共享 graph materializer | vendor connect/flow 实验证明可嵌入 | 普通边不再手写 `connects`；root/impl parity 通过 |
| 4 | composite boundary isolation | Phase 2/3 稳定 | capture/call/compositePins 代码与普通节点 lowering 分离 |
| 5 | 删除 legacy 类型/pin 模拟器并硬化 | 覆盖矩阵达标 | 无普通节点走手写 concrete wrapper；文档与测试同步 |

阶段不可倒置：Phase 3 不能在没有 Phase 0 vendor graph 实验时直接替换连接；Phase 5 不能在
类型族和边界场景未覆盖前删除 fallback。

## 5. 推荐实施切片

### Slice A：`set_node_graph_variable`

覆盖：

- float literal：`额外压力 = 0`；
- vec3 connection：`F/J/v/w`；
- bool 第三参数；
- 变量声明类型与赋值类型核对；
- root/impl parity；
- vendor concrete variant 与 `bConcrete`。

这是架构切片，不是物理运动特例。生产代码不得匹配变量名 `额外压力`。

### Slice B：变量节点族

- `get_node_graph_variable`；
- `set_custom_variable` / `get_custom_variable`；
- `set_local_variable` / `get_local_variable`。

目标是删除当前 impl 内按节点特设的临时 `Graph+Node` 分支，改用共享工厂。

### Slice C：通用 reflective/data nodes

- data type conversion；
- arithmetic/comparison；
- list/dict typed variants；
- entity/guid/config/prefab/faction。

只有获得最小真实样本或 vendor/root parity 证据后逐族推广。

### Slice D：composite boundary

- nested call；
- literal/connection/capture inputs；
- sparse named input；
- inflow/outflow；
- pure-data outputs；
- `compositePins`。

## 6. 工作包与提交边界

每个切片建议拆为：

1. `test:` 添加观察或失败契约，不改行为；
2. `refactor:` 抽共享 contract/resolver，输出保持不变；
3. `feat/fix:` 切换一个节点族到 vendor lowering；
4. `test:` 添加真实 GIA/round-trip/parity 验收；
5. `docs:` 更新阶段结果和 decision log。

禁止在同一提交同时：

- 改 capture normalization；
- 替换普通节点 pin 编码；
- 替换所有 connection materialization；
- 重排 composite layout。

## 7. 全局完成定义

必须同时满足：

- 普通系统节点的 ID resolution 只有一个共享决策核心；
- 普通系统节点由 vendor `Node` 建立 schema，不由 composite 模块手写 `NodePin`；
- ordinary data/flow edges 由共享 materializer 生成；
- root/impl parity 测试覆盖核心基础类型与关键连接形态；
- composite synthetic pins 有明确独立模块和 schema；
- capture 在普通 lowering 前完成 normalization；
- `composite.ts` 不再拥有普通节点的 VarType/concrete-index 模拟表；
- 当前物理运动已验证基线保持；
- 自动生成通过后仍明确标注“未游戏内验证”，直到用户测试。

## 8. 风险控制

### Vendor 不完整

处理：集中 `normalizeVendorNode()` 兼容层；每条补丁附节点、pin、证据与测试。禁止把补丁散回
root/impl 两侧。

### 类型信息不完整

处理：Phase 1 阶段报结构化 diagnostic；不得静默回退到 int 或 generic。兼容 fallback 必须可计数、
可测试并带移除条件。

### 临时 Graph 编码改变 impl metadata

处理：Phase 0 比较直接 `Node.encode()`、临时 `Graph.encode()` 和真实 impl GraphNode；未确认前不整图切换。

### Composite 边界被 vendor 重写

处理：synthetic call/capture 不进入 ordinary factory；boundary overlay 在 vendor ordinary graph 编码之后应用，
并由独立契约测试锁定。

## 9. 计划维护

每阶段完成后更新：

- 对应 phase 文档的 checklist 和实测结果；
- `decision-log.md`；
- `validation-matrix.md` 的证据等级；
- 若当前权威实现发生变化，再更新 `docs/architecture/stage3-ir-to-gia.md` 与
  `docs/architecture/composite/gia-encoding.md`，不要提前把规划写成现状。
