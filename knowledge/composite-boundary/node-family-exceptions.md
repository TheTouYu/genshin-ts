# Affected node families and legal exceptions

Affected families, legal physical-pin holes, and unverified scope.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F2F2F2F2F2F2F2F2F2 -->

### Physical-pin integrity is conditional

Missing physical pins can be legal for ordinary capture or sparse InParam holes, source-driven InFlow, terminal OutFlow, some pure-data passthrough OutParam, pin-hole/special-arg remaps, and nested capture routing. A `data_type_conversion_*` capture directly targeted by the current Composite boundary is a confirmed exception: it must retain a typed physical InParam and independently produce its OutParam.

#### 适用边界

The confirmed exception is the directly targeted DTC boundary case. Other node families require their own current-source and focused-regression check; working-tree observations cannot extend this claim.

<!-- CLAIM:END clm_01K13DM5F2F2F2F2F2F2F2F2F2 -->
