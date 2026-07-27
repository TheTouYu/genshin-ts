# Composite capture and IR boundary contract

Navigation for isolated capture, CompositeDefIR, flow marks, sparse binding, and boundary routing.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BP1SH10F593HCMZDD12 -->

### Definition capture and call-site binding are separate contracts

Definition capture creates typed placeholders for every declared input and records internal nodes, control edges, output metadata, explicit InFlow/OutFlow marks, and boundary routes in `CompositeDefIR`. Each call site records only the inputs actually bound there, preserving declaration indices for sparse bindings. `compositePins` maps outer interface pins to inner logical pin positions; physical inner-pin materialization remains a separate Stage 3 responsibility.

#### 适用边界

The complete-definition/sparse-call distinction is general current behavior. Concrete wrappers, wire-field presence, legal physical pin holes, and runtime defaults for an omitted value remain type- and node-family-specific and require focused evidence.

<!-- CLAIM:END clm_01KYH07BP1SH10F593HCMZDD12 -->
