# GIA object model and attachments

GraphUnit, GraphNode, NodePin, graph/accessory attachment, identity, and topology navigation.


<!-- CLAIM:START clm_01KYH4ZHS2RG0RJ01GW6EV1F7B -->

### GIA analysis navigates GraphUnit containers before GraphNode and NodePin details

In the current project schema and tools, a GIA root contains a main graph plus accessory `GraphUnit` records. A GraphUnit discriminant and identity select structures such as CompositeDef or an impl NodeGraph; GraphNodes carry node identity, index, pins and position; NodePins carry kind/index, value and connections; `relatedIds`, graph IDs and `compositePins` connect containers and boundaries. Analysis should resolve the containing GraphUnit and attachment relation before interpreting a node or pin.

#### 适用边界与失效条件

This is a navigation model for the registered schema/tool version, not proof that every vendor field is emitted by the editor or present on wire. Unknown accessory kinds and fields remain possible. Revalidate when `gia.proto`, decode tooling, GraphUnit discriminants, or attachment traversal changes.

<!-- CLAIM:END clm_01KYH4ZHS2RG0RJ01GW6EV1F7B -->
