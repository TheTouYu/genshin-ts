# GIA object model and attachments

GraphUnit, GraphNode, NodePin, graph/accessory attachment, identity, and topology navigation.


<!-- CLAIM:START clm_01KYH4ZHS2RG0RJ01GW6EV1F7B -->

### GIA analysis navigates GraphUnit containers before GraphNode and NodePin details

In the current project schema and tools, a GIA root contains a main graph plus accessory `GraphUnit` records. A GraphUnit discriminant and identity select structures such as CompositeDef or an impl NodeGraph; GraphNodes carry node identity, index, pins and position; NodePins carry kind/index, value and connections; `relatedIds`, graph IDs and `compositePins` connect containers and boundaries. Analysis should resolve the containing GraphUnit and attachment relation before interpreting a node or pin.

#### 适用边界与失效条件

This is a navigation model for the registered schema/tool version, not proof that every vendor field is emitted by the editor or present on wire. Unknown accessory kinds and fields remain possible. Revalidate when `gia.proto`, decode tooling, GraphUnit discriminants, or attachment traversal changes.

<!-- CLAIM:END clm_01KYH4ZHS2RG0RJ01GW6EV1F7B -->

<!-- CLAIM:START clm_D855DC6B45CDA71076665B0BFA -->

### GIL payload 根不能按同号字段解释为 GIA Root

真实锁定 GIL 快照的 payload 根不是 gia.proto 定义的 GIA Root；GIL 根出现 Root schema 之外的字段，且同号字段存在 wire type 冲突，因此 GIL 根与 GIA Root 必须作为不同容器层解析。

#### 适用边界

适用于 2026-08-01 锁定快照及当前 GIL/GIA 解析边界；不宣称完整、跨版本 GIL schema，也不证明编辑器或游戏行为。

<!-- CLAIM:END clm_D855DC6B45CDA71076665B0BFA -->
