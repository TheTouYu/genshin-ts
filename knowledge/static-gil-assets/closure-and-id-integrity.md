# Static assembly closure and ID integrity

Navigation for main definition/instance, auxiliary records, packed lists, owner/backlink, registry, and collision constraints.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24E81AEA72Z0W72RVEHX1 -->

### 创建必须提供无冲突的完整 ID 闭包

当前创建模式要求显式提供新 `prefabId`、与 items 等长的定义侧和实例侧辅助 ID；工具不自动分配下一 ID。应用前必须确认模板主定义/实例唯一存在、模板名称可重写、模板具有可复制的顶层 `field 6` 登记，并扫描 `field 4/8/27` 拒绝已占用或包内重复 ID。生成结果必须同步主定义/实例名称、两侧 packed `field 501`、逐件辅助名称/资源/Transform、owner/backlink 和复制的登记记录；仅复制主记录或复用旧辅助闭包不是完整创建。

#### 适用边界

这是当前 `applyStaticAssembly()` 创建路径和 focused regression 的约束，不是正式 GIL schema 命名，也不证明 ID 必须连续。update/delete、自动 ID 分配以及其它地图的可用 ID 范围尚未实现或验证。

<!-- CLAIM:END clm_01KYF24E81AEA72Z0W72RVEHX1 -->

<!-- CLAIM:START clm_C86C803AF4C0869C6B0936196D -->

### 模板定义 ID 与实例 ID 分离时的闭包同步

真实 GIL 不保证模板定义 ID 与模板实例 ID 相同，因此创建配置必须分别提供 templatePrefabId 和 templateInstanceId，不能从其中一个猜另一个。复制主实例时既要把记录自身 ID 替换为新 prefabId，也要把实例 field 2 中的定义引用替换为该新 prefabId。定义侧 packed 列表必须引用定义辅助 ID，实例侧 packed 列表必须引用实例辅助 ID；每对辅助记录还必须同步资源、Transform、owner、实例到定义的 backlink 和颜色快照。应用前继续拒绝 source 已占用或包内重复的所有主/辅助 ID。

#### 适用边界

该约束来自模板定义 1077936131 与模板实例 1077936129 不同的真实样本、focused red/green regression、候选与写后独立闭包回读及用户游戏通过。它不要求所有地图都使用异号 ID，也不证明 ID 必须连续；update/delete 和自动 ID 分配仍未实现或验证。

<!-- CLAIM:END clm_C86C803AF4C0869C6B0936196D -->
