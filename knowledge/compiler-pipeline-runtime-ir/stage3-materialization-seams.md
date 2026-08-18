# Stage 3 ordinary, synthetic, and boundary materialization seams

IR-to-GIA preprocessing and responsibility seams among ordinary nodes, synthetic lowering, boundaries, layout, and encoding.


<!-- CLAIM:START clm_01KYH64V6AG9Q1EFEVHBJJC93P -->

### Stage 3 通过普通/合成/边界三条接缝消费 typed IR（Stage 3 consumes typed IR through distinct ordinary, synthetic, and boundary seams）

irToGia() 分派客户端文档，对服务端文档在解析图元数据/节点/布局/引脚/变量/连接/复合定义与调用/protobuf 输出前预处理 IR。普通 vendor 节点、编译器合成节点与边界叠加各有独立物化职责，不得从最终 GIA 反向猜测修补。

`irToGia()` dispatches client documents separately and, for server documents, preprocesses IR before resolving graph metadata, nodes, layout, pins, variables, connections, Composite definitions/calls, and protobuf output. Ordinary vendor nodes, compiler-synthetic nodes, and boundary overlays have distinct materialization responsibilities and must not be repaired by guessing backward from final GIA.

#### 适用边界

这是当前 gsts 架构，不证明编辑器 wire 等价或游戏行为；复合 root/impl 细节见 Composite Node，客户端编码走独立路径。

This is current gsts architecture, not proof of editor wire equivalence or game behavior. Composite root/impl details remain in the Composite Node, and client encoding has its own path. Revalidate when `irToGia`, preprocess/materializers, synthetic lowering, boundary adapters, client dispatch, or the Stage 3 contract changes.

<!-- CLAIM:END clm_01KYH64V6AG9Q1EFEVHBJJC93P -->
