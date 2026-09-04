# 04 — 物化探针推广到其他只读官方资产 + 工作流优化

**What to build:**
复用“官方状态复制为自定义 → type1017 抓实体化定义”的工作流，推广到其他只读官方资产
（官方预制体 / 官方技能 / 官方职业(Duty) / 官方道具(Stuff) / 官方复合节点 / PCG 模板等），
并泛化脚本、runbook、SKILL 引用，沉淀机器可读的“官方 ID/模板 → 内部结构/引用/参数”资源。

**候选矩阵（Round 0 盘点）：**
- 官方预制体：本地 `Beyond/Official/OfficialPrefab/*.mihoyobin` 2484 个；
  编辑器线索 `RESOURCE_MANAGER_OFFICIAL_TAB/CUSTOM_TAB`、`CUSTOM_PREFAB`、`CUSTOM_MONSTER`。
- 官方技能：`BeyondOfficalAssetData` SKILL 210001..210021（21 个）；
  编辑器线索 `CLIENT_BLUEPRINT_AVATAR_SKILL/MONSTER_SKILL` + `BLUEPRINT_SAVE_AS`。
- 官方职业/道具蓝图：`BLUEPRINT_MANAGER_DUTY_BP/STUFF_BP`，未发现本地 Json 族。
- 官方复合节点：`Beyond/Official/Blueprint/OfficialCompoundNode/*.mihoyobin` 656 个；
  线索 `NODE_DUPLICATE`、`COMPOSITE_SAVE_NODE`。
- PCG 模板：`BeyondOfficalAssetData` PCG_TEMPLATE 4 个 + `beyondPCGInstanceService`。
- 标签/UI/Struct：优先级低，暂无独立官方资产模板入口证据。

**Round 0 已完成：**
- 基线复现成功：`parse_official_copy_pcap.py /mnt/c/temp/official_copy.pcap`
  得到 7 个 type1017，`1077936132 官方超级跳 -> [510001,2110001]`（对应官方 10100005）。
- 新增通用探针 `summarize_hablp_pcap.py`，在该 pcap 上输出类型直方图
  （0/1016/1017/1001/1022/1025/1011），用于新资产抓包后先判断消息类型。
- runbook 已去除 `/mnt/c/temp`，改为 `C:\beyond-ipc` 稳定抓包目录；SKILL.md 已登记新脚本。

**Round 1 结构分析（2026-09-05）：**
- 用户未按“复制官方预制体”提示操作，实际 pcap 为通用 type1017 资源目录/定义快照。
- 确认 type1017 承载资源目录：2497 个 available ID + 21 个定义；已提取 `assetId -> names -> sourceEntityId`。
- 官方实体映射：`30007001`=打手丘丘人，`30005001`=遗迹守卫（对照 `BeyondOfficialEntityExcelConfigData` + TextMapCHS）。
- 完整定义在 `field11`，含 field6/7/8 组件序列化，componentTypeId schema 未闭合。
- 新增 `parse_type1017_generic.py`，产物见
  `.scratch/.../ipc/type1017_generic_catalog.json` + `PROGRESS-TYPE1017-GENERIC.md`。

**Round 2 多类型捕获（2026-09-05）：**
- pcap：`/mnt/c/beyond-ipc/multi_type_ipc.pcap`，68 帧 type1017，76 个摘要定义。
- 已产出 `resources/official_entity_ipc_mapping.json`（68 个官方实体映射）。
- 确认 kindCode 对应 entityType：1402=Gadget、1403=Player、1404=Avatar、1405=Monster。
- 本轮全部为摘要定义，未含 full field11；内部组件 schema 仍需完整物化样本。

**下一步（根据结构分析决定）：**
- 解 field11 组件类型（对照 BeyondEditor 反编译/组件表）后，评估是否可从现有 pcap 提炼
  “官方实体 → 组件/引用/参数”半自动资源。
- 若需要内部结构，再做真正的最小操作：打开/编辑一个具体官方实体/自定义实体 → 抓 full field11。
- 若预制体无“复制为自定义”入口，改用官方技能蓝图或 Duty/Stuff 蓝图。

**验收 checkbox：**
- [ ] 至少 1 类新官方资产批量解析落盘
- [ ] 产出该类“官方 ID/模板 → 内部结构/引用/参数”机器可读资源
- [ ] runbook 泛化到“不只官方状态”并被 SKILL.md 引用
- [ ] 脚本/runbook 无临时目录依赖
