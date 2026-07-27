# Composite definition, call, and lifecycle

Navigation for the reusable Composite definition, call, and TS-to-IR lifecycle contract.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BJHQ6B1RNR5DY3QEJC0 -->

### Composite definitions are captured templates and calls are graph markers

`g.defineComposite` registers a reusable definition and typed handle; its `build` callback is captured against an isolated registry rather than executed as game behavior. `f.callComposite` records a `__composite_call__` marker and typed output proxies in the caller. A captured definition with no exec nodes is pure-data and does not participate in ordinary execution-flow continuation; an exec definition does.

#### 适用边界

This is the current gsts Runtime/IR contract. It does not assert editor-assigned IDs or pinIndex values, and JavaScript capture-time execution must not be interpreted as game runtime execution.

<!-- CLAIM:END clm_01KYH07BJHQ6B1RNR5DY3QEJC0 -->
