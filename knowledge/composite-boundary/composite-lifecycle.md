# Composite definition, call, and lifecycle

Navigation for the reusable Composite definition, call, and TS-to-IR lifecycle contract.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BJHQ6B1RNR5DY3QEJC0 -->

### 复合定义是捕获的模板，调用是图标记（Composite definitions are captured templates and calls are graph markers）

g.defineComposite 注册可复用定义与类型化句柄，其 build 回调在隔离注册表上被捕获而不是作为游戏行为执行；f.callComposite 在调用方记录 __composite_call__ 标记与类型化输出代理。无 exec 节点的被捕获定义为纯数据，不参与普通执行流延续；有 exec 定义则参与。

`g.defineComposite` registers a reusable definition and typed handle; its `build` callback is captured against an isolated registry rather than executed as game behavior. `f.callComposite` records a `__composite_call__` marker and typed output proxies in the caller. A captured definition with no exec nodes is pure-data and does not participate in ordinary execution-flow continuation; an exec definition does.

#### 适用边界

这是当前 gsts Runtime/IR 契约；不断言编辑器分配的 ID 或 pinIndex 值，JS 捕获期执行不得解释为游戏运行时执行。

This is the current gsts Runtime/IR contract. It does not assert editor-assigned IDs or pinIndex values, and JavaScript capture-time execution must not be interpreted as game runtime execution.

<!-- CLAIM:END clm_01KYH07BJHQ6B1RNR5DY3QEJC0 -->
