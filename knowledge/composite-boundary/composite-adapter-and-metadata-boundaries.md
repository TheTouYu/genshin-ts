# Composite adapters and metadata boundaries

Sparse binding, pin-hole and special-arg remaps, root/impl parity, backend fallback, layout and graph metadata ownership.


<!-- CLAIM:START clm_01KYH4ZHNA0ZQSV882V3C2Z46H -->

### Root/impl parity shares ordinary remaps while Composite retains boundary and metadata ownership

Current Stage 3 uses shared ordinary resolution/materialization for the production shared backend and keeps explicit legacy fallback. Sparse declaration indexes, named pin-hole layouts, and signal/assembly/multiple-branches special arguments must use their shared IR→physical remaps in both root and impl; Composite-only code owns definition/call/capture/`compositePins` overlays and virtual impl layout, while graph container metadata remains an explicit scoped responsibility.

#### 适用边界与失效条件

Parity is an architectural/current-implementation contract, not proof that every node family or graph metadata field is game-verified. Intentional physical pin holes and high-risk signal/dynamic metadata remain scoped exceptions. Revalidate when shared adapters, backend defaults, ordinary coverage inventory, Composite layout, graphValues/affiliations, or root/impl parity tests change.

<!-- CLAIM:END clm_01KYH4ZHNA0ZQSV882V3C2Z46H -->

<!-- CLAIM:START clm_1C7FBF676F01E516F73C95093E -->

### Composite shared and legacy pin remaps preserve physical boundary metadata

当前 Stage 3 Composite 编码在 shared 与显式 legacy 路径中复用普通节点的 typed pin/remap 逻辑，同时由 Composite 专用层保留 root/impl 边界、pin-hole、special-arg 物理索引和 metadata overlay；本轮 focused resolved-node contract 与生成回归覆盖 enum alias 解析及相关边界。

#### 适用边界

这是提交 8e36c5a 的当前代码实现与自动回归契约，适用范围限于已覆盖的 Composite pin/metadata 和 enum alias 形态；不证明所有节点族、wire 字段、编辑器导入或游戏行为。shared/legacy 后端、pin adapter、node family 或 focused regression 改变时重新验证。

<!-- CLAIM:END clm_1C7FBF676F01E516F73C95093E -->
