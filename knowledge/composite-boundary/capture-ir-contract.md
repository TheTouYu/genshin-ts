# Composite capture and IR boundary contract

Navigation for isolated capture, CompositeDefIR, flow marks, sparse binding, and boundary routing.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BP1SH10F593HCMZDD12 -->

### 定义捕获与调用点绑定是两个分离的契约（Definition capture and call-site binding are separate contracts）

定义捕获（Definition capture）为每个声明输入创建类型化占位符，并在 CompositeDefIR 中记录内部节点、控制边、输出元数据、显式 InFlow/OutFlow 标记与边界路由；每个调用点只记录实际绑定处，稀疏绑定仍保留声明索引。compositePins 把外部接口引脚映射到内部逻辑引脚位置，物理内引脚的物化是 Stage 3 的独立职责。

Definition capture creates typed placeholders for every declared input and records internal nodes, control edges, output metadata, explicit InFlow/OutFlow marks, and boundary routes in `CompositeDefIR`. Each call site records only the inputs actually bound there, preserving declaration indices for sparse bindings. `compositePins` maps outer interface pins to inner logical pin positions; physical inner-pin materialization remains a separate Stage 3 responsibility.

#### 适用边界

完整定义/稀疏调用的区分是当前通用行为；具体包装、wire 字段 presence、合法物理引脚空洞与省略值的运行时默认仍按类型与节点族各自需要 focused 证据。

The complete-definition/sparse-call distinction is general current behavior. Concrete wrappers, wire-field presence, legal physical pin holes, and runtime defaults for an omitted value remain type- and node-family-specific and require focused evidence.

<!-- CLAIM:END clm_01KYH07BP1SH10F593HCMZDD12 -->
