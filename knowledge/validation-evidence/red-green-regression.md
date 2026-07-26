# Red/green regression chain

Durable red/green chains retained for reproducible diagnosis.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F3F3F3F3F3F3F3F3F3 -->

### The DTC fixture is the locked Alpha regression

`tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts` is the locked focused Alpha regression: it checks the decoded Composite impl, typed ConcreteBase/EnumBase InParam, DTC OutParam, and raw protobuf oneof presence through the public `irToGia()` path.

#### 适用边界

This proves the asserted automatic structure at the tested revision. It does not by itself prove editor import or game behavior.

<!-- CLAIM:END clm_01K13DM5F3F3F3F3F3F3F3F3F3 -->
