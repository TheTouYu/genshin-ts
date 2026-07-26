# Static assembly closure and ID integrity

Navigation for main definition/instance, auxiliary records, packed lists, owner/backlink, registry, and collision constraints.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24E81AEA72Z0W72RVEHX1 -->

### 创建必须提供无冲突的完整 ID 闭包

当前创建模式要求显式提供新 `prefabId`、与 items 等长的定义侧和实例侧辅助 ID；工具不自动分配下一 ID。应用前必须确认模板主定义/实例唯一存在、模板名称可重写、模板具有可复制的顶层 `field 6` 登记，并扫描 `field 4/8/27` 拒绝已占用或包内重复 ID。生成结果必须同步主定义/实例名称、两侧 packed `field 501`、逐件辅助名称/资源/Transform、owner/backlink 和复制的登记记录；仅复制主记录或复用旧辅助闭包不是完整创建。

#### 适用边界

这是当前 `applyStaticAssembly()` 创建路径和 focused regression 的约束，不是正式 GIL schema 命名，也不证明 ID 必须连续。update/delete、自动 ID 分配以及其它地图的可用 ID 范围尚未实现或验证。

<!-- CLAIM:END clm_01KYF24E81AEA72Z0W72RVEHX1 -->
