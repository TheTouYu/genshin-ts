# Static assembly production evidence

Navigation for the exact automatic, writeback, reread, and user-confirmed game scope of static assembly production runs.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24ECFTCZ3RCR6QCRFKAE8 -->

### 第一轮正式 CLI 生产闭环的验证范围

第一轮以来源 SHA-256 `0540f6f4...ba2a8`、大小 `50400 bytes` 的已确认地图状态为固定输入，使用 `静态拼装H1` 模板和长方体资源 `10009001` 创建四件组件 `静态拼装工具验证1`。候选/写后 SHA-256 为 `067edfb3...8f3315`、大小 `52704 bytes`。focused regression 与独立 raw-wire 校验覆盖输入不变、ID 空闲/冲突拒绝、主定义/实例、两侧 packed 列表、4+4 辅助名称/资源/owner/backlink、定义/实例 Transform、三条 `field 6` 登记，以及只有顶层 `field 4/6/8/27` 改变、`field 9` 原始 bytes 不变。CLI 自动备份和写回成功，写后真实目标再次通过独立回读；用户确认元件和场景可见、三档相对高度、第四件 45° 旋转且与已有 H/W 分离。

#### 适用边界

该外部结论只覆盖上述地图状态、H1 模板、资源 `10009001` 和本次四件配置。它不证明其它地图、模板、资源、item 数量、update/delete 或自动 ID 分配可用；focused regression 本身也不能替代这次用户游戏确认。生产验证 Source/Evidence 将在独立 Bundle 中登记，避免把提交文档重复计为多个现实来源。

<!-- CLAIM:END clm_01KYF24ECFTCZ3RCR6QCRFKAE8 -->

<!-- CLAIM:START clm_05549A29D25E2495E46D7E8E73 -->

### 第二轮静态拼装颜色生产闭环的验证范围

第二轮以来源 SHA-256 0225e4b2...fd2992、大小 29293 bytes 的已确认地图状态为固定输入，使用定义 ID 1077936131、实例 ID 1077936129 的长方体模板创建六件组件“彩色拼装验证”，新 prefab ID 为 1077936140。候选与写后 SHA-256 均为 47ff681b...db9ecd、大小 32263 bytes，自动备份哈希与来源一致，写后真实目标闭包和 raw-wire 独立回读通过，NodeGraph 仍为 0。focused regression 与回读覆盖红色主体、洋红球体 100% 覆盖、青色圆锥 66% 正片叠底、橙色圆柱 33% 覆盖、黄色线框长方体 100% 正片叠底、蓝色线框圆柱 50% 覆盖及关闭自定义颜色的默认球体；用户随后明确反馈编辑器/游戏测试“完美通过”。

#### 适用边界

外部结论只覆盖该地图状态、该模板，以及球体 10009002、圆锥 10009009、圆柱 10009008、线框长方体 10009010、线框圆柱 10009011 的本次配置。它不证明其它资源、模板、地图、材质、update/delete 或自动 ID 分配；用户反馈也不单独证明 field 9=6710 的语义。自动回归、写回成功、写后回读和用户游戏确认是不同证据层。

<!-- CLAIM:END clm_05549A29D25E2495E46D7E8E73 -->

<!-- CLAIM:START clm_2CFB8DF7716132B41A820E8001 -->

### 第三轮跟随运动器完全跟随组件生产闭环的验证范围

第三轮以 `mapId=1073741849` 写前 SHA-256 `1aa7f769447cd9734998569b545a223071e15d7866f4f62e6822763dfb035500` 为固定输入，经用户两阶段确认，对 `1077936149..1077936174` 的 26 对“星枢3x3块”定义/实例补齐跟随运动器“完全跟随”组件。候选与写后 SHA-256 均为 `1dc42752c47a585db493a2a01157c3a62f5190e7229470300aa988d56bf63a92`，备份哈希与写前来源一致；逐字节候选对照和写后独立 raw-wire 回读确认 26 对记录均恰好包含一个类型码 9 槽、定义/实例快照一致且无重复槽。当前提交实现仅公开 `{ type: 'followMotion', preset: 'fullFollow' }`，focused 回归覆盖省略不新增、双侧真实样本 raw bytes、已有同类替换和重复类型拒绝。用户随后明确反馈本次游戏内测试通过，证明上述 26 个元件在该地图状态下可加载并按预期使用“跟随运动器—完全跟随”，即同时跟随目标位置和朝向。

#### 适用边界

该结论只覆盖 `mapId=1073741849` 的上述写前/写后状态、26 个“星枢3x3块”元件及当前 `fullFollow` 预设；不推广到其它地图、模板、资源、组件类型、跟随类型、追踪方式、初始生效、目标、挂接点、偏移、运动参数、update/delete 或自动 ID 分配。自动回归、候选验证、写回成功、写后回读和用户游戏确认是不同证据层；内部数值不得推断为未验证的公开参数。

<!-- CLAIM:END clm_2CFB8DF7716132B41A820E8001 -->
