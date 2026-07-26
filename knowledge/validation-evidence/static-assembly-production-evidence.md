# Static assembly production evidence

Navigation for the exact automatic, writeback, reread, and user-confirmed game scope of static assembly production runs.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24ECFTCZ3RCR6QCRFKAE8 -->

### 第一轮正式 CLI 生产闭环的验证范围

第一轮以来源 SHA-256 `0540f6f4...ba2a8`、大小 `50400 bytes` 的已确认地图状态为固定输入，使用 `静态拼装H1` 模板和长方体资源 `10009001` 创建四件组件 `静态拼装工具验证1`。候选/写后 SHA-256 为 `067edfb3...8f3315`、大小 `52704 bytes`。focused regression 与独立 raw-wire 校验覆盖输入不变、ID 空闲/冲突拒绝、主定义/实例、两侧 packed 列表、4+4 辅助名称/资源/owner/backlink、定义/实例 Transform、三条 `field 6` 登记，以及只有顶层 `field 4/6/8/27` 改变、`field 9` 原始 bytes 不变。CLI 自动备份和写回成功，写后真实目标再次通过独立回读；用户确认元件和场景可见、三档相对高度、第四件 45° 旋转且与已有 H/W 分离。

#### 适用边界

该外部结论只覆盖上述地图状态、H1 模板、资源 `10009001` 和本次四件配置。它不证明其它地图、模板、资源、item 数量、update/delete 或自动 ID 分配可用；focused regression 本身也不能替代这次用户游戏确认。生产验证 Source/Evidence 将在独立 Bundle 中登记，避免把提交文档重复计为多个现实来源。

<!-- CLAIM:END clm_01KYF24ECFTCZ3RCR6QCRFKAE8 -->
