# Affected node families and legal exceptions

Affected families, legal physical-pin holes, and unverified scope.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F2F2F2F2F2F2F2F2F2 -->

### 物理引脚完整性是有条件的（节点族例外）（Physical-pin integrity is conditional）

缺失物理引脚在以下情形合法：普通 capture、稀疏 InParam 空洞、源驱动 InFlow、末端 OutFlow、部分纯数据透传 OutParam、pin-hole/特殊参数重映射、嵌套 capture 路由。被当前复合边界直接命中的 data_type_conversion_* capture 是已确认例外：必须保留带类型的物理 InParam 并独立产出 OutParam。

Missing physical pins can be legal for ordinary capture or sparse InParam holes, source-driven InFlow, terminal OutFlow, some pure-data passthrough OutParam, pin-hole/special-arg remaps, and nested capture routing. A `data_type_conversion_*` capture directly targeted by the current Composite boundary is a confirmed exception: it must retain a typed physical InParam and independently produce its OutParam.

#### 适用边界

已确认例外仅限被直接命中的 DTC 边界情形；其它节点族需各自用当前源码与 focused regression 核查，工作树观察不能扩展本 claim。

The confirmed exception is the directly targeted DTC boundary case. Other node families require their own current-source and focused-regression check; working-tree observations cannot extend this claim.

<!-- CLAIM:END clm_01K13DM5F2F2F2F2F2F2F2F2F2 -->
