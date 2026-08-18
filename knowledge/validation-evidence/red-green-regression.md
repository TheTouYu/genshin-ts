# Red/green regression chain

Durable red/green chains retained for reproducible diagnosis.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F3F3F3F3F3F3F3F3F3 -->

### DTC fixture 是锁定的 Alpha 回归（The DTC fixture is the locked Alpha regression）

tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts 是锁定的 focused Alpha 回归：它通过公开的 irToGia() 路径检查解码后的复合 impl、类型化 ConcreteBase/EnumBase InParam、DTC OutParam 与 raw protobuf oneof presence。

`tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts` is the locked focused Alpha regression: it checks the decoded Composite impl, typed ConcreteBase/EnumBase InParam, DTC OutParam, and raw protobuf oneof presence through the public `irToGia()` path.

#### 适用边界

这证明被测试修订版上的断言自动结构；它本身不证明编辑器导入或游戏行为。

This proves the asserted automatic structure at the tested revision. It does not by itself prove editor import or game behavior.

<!-- CLAIM:END clm_01K13DM5F3F3F3F3F3F3F3F3F3 -->
