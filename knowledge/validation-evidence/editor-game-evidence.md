# Real GIA, editor, and game evidence boundaries

Evidence layers and the exact scope of external validation.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F4F4F4F4F4F4F4F4F4 -->

### 外部证据限定于 bool→DTC 边界（External evidence is scoped to bool→DTC）

本 Alpha 的真实 GIA/编辑器/游戏证据只覆盖 bool 复合输入经 DTC 链（DTC handoff 记录）的场景；后续 common-scalar 边界 fixture 只扩展自动回归覆盖，不得作为标量族的真实 GIA/编辑器/游戏证据。

Real-GIA/editor/game evidence for this Alpha covers the bool Composite input routed through the DTC chain documented in the DTC handoff. The later common-scalar boundary fixture expands automatic regression coverage only; it must not be cited as real-GIA, editor, or game proof for the scalar family.

#### 适用边界

用户确认的游戏结果只适用于记录的 bool→int→float→string 候选；后续构建、其它节点族与合法 pin-hole 情形需各自单独验证。

The user-confirmed game result applies only to the recorded bool→int→float→string candidate. Future builds, other node families, and legal pin-hole cases remain separately verifiable.

<!-- CLAIM:END clm_01K13DM5F4F4F4F4F4F4F4F4F4 -->

<!-- CLAIM:START clm_8CCF0CFB09C9DE0C6809B93C76 -->

### 节点 835 modifyModelColorAndMaterial 为无效节点 ID（游戏核验）

2026-08-16 U4 差分（2701 日志，SHA a600656d…）游戏核验：modifyModelColorAndMaterial(835) 节点完整执行且参数全部正确（fillColor=16711680、opacity=100.0、事件源实体正确、printString 触发）但游戏内无颜色变化；三重重证据——编辑器官方 data.json 无 835、server 静态元数据无 835、游戏执行无效果——835 为旧快照错误遗产，DSL 支持不可用。

#### 适用边界

单节点单场景核验；不排除参数编码另有要求的理论可能，但三重重证据下按无效处理；灯阵变色改用 308 显隐。

<!-- CLAIM:END clm_8CCF0CFB09C9DE0C6809B93C76 -->

<!-- CLAIM:START clm_16E4577B31D6C1E471BF693FA8 -->

### 节点 308 activateDisableModelDisplay 显隐游戏内生效（灯阵明暗方案）

2026-08-16 U4b 差分（2702 日志，SHA 04c35747…）游戏核验：activateDisableModelDisplay(308，官方 Set_Model_Visible) 生效——点击选项卡 R 实体隐藏（u4b-hide-fire ×1）、点 L 重现（u4b-show-fire ×5）；DSL activateDisableModelDisplay(targetEntity, activate) 双分支均验证。灯阵'点亮/熄灭'方案确定：亮=显示/暗=隐藏。

#### 适用边界

单地图单实体核验；显隐不影响实体逻辑（事件仍触发）；材质/颜色类视觉仍需其他节点。

<!-- CLAIM:END clm_16E4577B31D6C1E471BF693FA8 -->
