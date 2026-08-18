# Typed IR server and client cross-stage contract

`IR.d.ts` producer/consumer contract, shared server/client shape, graph-specific differences, and change impact.


<!-- CLAIM:START clm_01KYH64V2V7AQ052RMREK81B8F -->

### IR.d.ts 是服务端与客户端图文档的类型化生产者-消费者接缝（IR.d.ts is the typed producer-consumer seam for server and client graph documents）

IRDocument 是服务端与客户端节点图文档的可辨识联合，共享版本、图模式、节点、参数与连接，同时保留图特定子类型与元数据。Runtime/Stage 2 产出该形状，Stage 3 消费它；任何形状变更都必须检查生产者、合并/序列化路径、服务端/客户端消费者与 focused 回归。

`IRDocument` is a discriminated union of server and client node-graph documents sharing version, graph mode, nodes, arguments, and connections while preserving graph-specific subtype and metadata. Runtime/Stage 2 produces this shape and Stage 3 consumes it; any shape change must check producers, merge/serialization paths, server/client consumers, and focused regressions.

#### 适用边界

共享类型契约不代表功能对等：当前客户端文档省略节点图变量且有子类型特定行为；复合定义/调用属于服务端文档。

The shared type contract does not imply feature parity: current client documents omit node-graph variables and have subtype-specific behavior, while Composite definitions/calls belong to server documents. Revalidate on `IR.d.ts`, `buildIRDocument`, merge logic, or server/client Stage 3 changes.

<!-- CLAIM:END clm_01KYH64V2V7AQ052RMREK81B8F -->
