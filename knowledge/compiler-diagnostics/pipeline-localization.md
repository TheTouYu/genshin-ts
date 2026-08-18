# Pipeline localization and reproducible baseline

Navigation for isolating a compiler failure and selecting a reproducible baseline.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F0F0F0F0F0F0F0F0F0 -->

### DTC 边界物理 pin 的红灯基线（Historical DTC red/green baseline）

复合边界物理 pin Alpha 的可复现修复前基线 = 父提交 c581001d00efbd010bba8f185d7cf4fd14a46706：用修复提交 95f3e629bbc8774dc66650d343c56bcd10360c11 跑 focused DTC fixture 在该父提交上失败，因为 compositePins 目标没有物理 InParam；同一 fixture 在当前 HEAD 通过。

For the Composite boundary physical-pin Alpha, the reproducible pre-fix baseline is parent commit `c581001d00efbd010bba8f185d7cf4fd14a46706`; running the focused DTC fixture from fix commit `95f3e629bbc8774dc66650d343c56bcd10360c11` against that parent fails because the `compositePins` target has no physical InParam. The same fixture passes at current HEAD.

#### 适用边界

这是 bool→DTC 案例的诊断基线，不是每个复合引脚不匹配都有同一根因；提交身份证明可复现的代码状态，当前行为仍需已注册的 focused 测试 authority。

This is a diagnostic baseline for the bool→DTC case, not proof that every Composite pin mismatch has the same root cause. Commit identity proves a reproducible code state; current behavior still requires the registered focused test authority.

<!-- CLAIM:END clm_01K13DM5F0F0F0F0F0F0F0F0F0 -->
