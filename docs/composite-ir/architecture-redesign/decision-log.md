# 架构决策日志

> 状态：当前推荐 / 持续更新
> 来源：当前代码审计 + 真实 GIA 对照 + 待执行实验
> 最近校验：2026-07-11
> 适用范围：architecture-redesign 计划与实施决策

## 使用规则

每项标记为：

- **Accepted**：已有足够依据，可指导实现；
- **Provisional**：方向接受，细节需实验；
- **Open**：不得猜测；
- **Rejected**：已否决，并保留原因。

## Accepted

### ADR-001：普通节点只能有一个 backend

Root 与 composite impl 中的 system ordinary node 必须共享 type/variant resolution、vendor factory 和 ordinary
connection materialization。

依据：当前双实现已在 float setter 上产生 concrete identity/pin wrapper 漂移。

### ADR-002：Composite 特殊性限制在边界

Composite 专属职责是 definition、synthetic call、capture、`compositePins` 和 boundary layout；普通节点不属于
composite encoding domain。

### ADR-003：类型解析先于编码

Lowering 不得通过 encoded pin 反推语义类型。类型冲突在 resolved contract 阶段报告。

### ADR-004：Vendor 优先生成 ordinary pin schema

Vendor `Node.setConcrete`、`Pin.setType` 和 concrete map 是默认物化机制。项目补丁必须集中且有证据。

### ADR-005：迁移使用 vertical slices

从 setter family 开始，按节点族切换，不一次重写整个 composite backend。

## Provisional

### ADR-006：Impl 使用完整 vendor Graph materialization

方向：ordinary impl graph 应使用 `Graph.add_node/connect/flow/encode`。

待确认：临时 Graph 编码是否保留真实 impl 所需字段，是否引入不应嵌入的 graph metadata。

验证：Phase 0 connection/encode experiments。

### ADR-007：Stage 3 内部新增 Resolved Graph IR

方向接受；具体类型结构、文件名和 list/dict 表示需在首个 fixture 实现中校正。

### ADR-008：Hidden pin remap 在 resolution 阶段完成

目标是只 remap 一次。需确认 signal、assembly、custom variable 等动态 pin family 是否适合统一 contract，或需要 family
specific resolver。

## Open

### Q-001：Vendor `Node(324)` 是否逐字段匹配真实 setter？

需比较 generic/concrete ID、`InParam[1]` wrapper、`indexOfConcrete`、bool metadata。

### Q-002：Int setter 的 generic/concrete identity 如何断言？

ReflectMap 中 Int variant ID 与 generic record ID 都是 `323`；需要以 encoded presence/schema 而非仅数字判断。

### Q-003：Connection target pin 是否必须保留 literal default value？

真实 GIA 可能在连接 pin 上仍携带 default；按节点族验证，不能统一删除。

### Q-004：Composite impl graphValues 的权威作用是什么？

当前变量被合并到 root graph，impl `graphValues` 为空。是否应改变是独立协议问题，不能随 setter 重构顺便决定。

### Q-005：Signals 是 ordinary family 还是独立 synthetic family？

它们使用 ClientExec payload 和动态 data pins，可能需要共享 resolver 下的专用 lowerer。

### Q-006：List/dict concrete map 是否完全可信？

必须按 family 与真实样本验证，不从 scalar 结果推广。

## Rejected

### ADR-R01：只给 `额外压力` 增加 float 特例

原因：隐藏 vec3 connection、custom/local variable 和 root/impl 分叉，不解决架构根因。

### ADR-R02：让 impl 直接调用整个 `irToGia()`

原因：root orchestration 混合布局、wrapper、signals、composite call 和 protobuf 后处理；共享边界错误。

### ADR-R03：把 nested composite 展开成普通节点

原因：违反真实 GIA 结构和已确认回归基线。

### ADR-R04：把 vendor 当作无需真实验证的规范

原因：当前已有 `Unk`、hidden pin、bool wire metadata 等兼容规则；vendor 是机制和数据源，不等于游戏输出证明。

### ADR-R05：在 Phase 0 前删除 legacy helpers

原因：会失去可比较基线和可回滚路径。

## 记录模板

```md
### ADR-NNN：标题

状态：Accepted / Provisional / Open / Rejected

问题：

决定：

证据：

影响：

验证/退出条件：
```
