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

**下一步（等用户抓包数据）：**
- 首选抓官方预制体“复制/另存为自定义”单样本；确认消息类型后决定是否批量。
- 若预制体无“复制为自定义”入口，改用官方技能蓝图或 Duty/Stuff 蓝图。

**验收 checkbox：**
- [ ] 至少 1 类新官方资产批量解析落盘
- [ ] 产出该类“官方 ID/模板 → 内部结构/引用/参数”机器可读资源
- [ ] runbook 泛化到“不只官方状态”并被 SKILL.md 引用
- [ ] 脚本/runbook 无临时目录依赖
