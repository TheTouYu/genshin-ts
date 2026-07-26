# Pipeline localization and reproducible baseline

Navigation for isolating a compiler failure and selecting a reproducible baseline.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F0F0F0F0F0F0F0F0F0 -->

### Historical DTC red/green baseline

For the Composite boundary physical-pin Alpha, the reproducible pre-fix baseline is parent commit `c581001d00efbd010bba8f185d7cf4fd14a46706`; running the focused DTC fixture from fix commit `95f3e629bbc8774dc66650d343c56bcd10360c11` against that parent fails because the `compositePins` target has no physical InParam. The same fixture passes at current HEAD.

#### 适用边界

This is a diagnostic baseline for the bool→DTC case, not proof that every Composite pin mismatch has the same root cause. Commit identity proves a reproducible code state; current behavior still requires the registered focused test authority.

<!-- CLAIM:END clm_01K13DM5F0F0F0F0F0F0F0F0F0 -->
