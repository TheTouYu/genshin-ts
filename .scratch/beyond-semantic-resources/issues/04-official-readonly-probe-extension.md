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

**Round 3 · UI IPC 帧差分 × UI 规律语义融合（2026-09-05，收轮）：**
- 数据：`evidence/2026-09-05-ui-probe/`（map 1073741918 单样本）。UI 定义在 type1017 field17；
  IPC 定义体 = f17→f1→（f501..f505 记录字段族），成员列表 = f503 packed bytes。
- 闭环产物（全部可复现命令见 skill runbook §6）：
  - `diff_type1017_frames.py` v1.1：每条 change 携带**字段号链 chain**（[fieldA,fieldB,idx] 逐消息层），
    位置路径 + 真实字段号双轨；ADD/REMOVE/CHANGE 全覆盖。回归：资产 134/变更组 145 与 v1 一致。
  - `annotate_frame_diff.py` v2：默认模式与 v1 逐字节一致（基线 hash d9de9a99…）；
    语义层 = GIL 名称回填 + 布局/容器 f503 成员追加解码（链式签名 f17→f1→f503，
    仅 1825/1840/1845 角色资产，counter-example：1841 同链不同义→role 门控必要性）+ raw 统计。
  - 名称表修复：`build_ui_instance_name_table.py` 名称改走**严格 raw wire 切片**（parse_message
    宽松部分解析会把可伪解析 UTF-8 文本如 '图片' 误判为 msg 子树）→ 133 条记录命名 93→**124**，
    与 `tools/wire-inspect.ts --list --json` 归一化后 **0 差异**；无名仅 9 条
    （含 diff 涉及的 1841/1939——记录内确无名称组件/文本，非提取缺口）。
  - 规则账本：`resources/ui_ipc_diff_rules.json` + skill references
    `ui-ipc-diff-rules.md`（r-ui-mem-append OBSERVED / remove·replace·text·image needs-sample）。
- 量化（基线 ui_steps.baseline-v0.md vs 新 ui_steps.md）：
  - 位置路径 raw 叶子 **801 → 0**（回退行全部转字段号链面包屑 `链 f17→f1→f505#4…`）；
  - 无名资产标题 9 → 2（1841/1939，双源确无存储名）；
  - 成员追加语义化 0 → 32 行（35 个成员链叶子中 32 前缀追加可解码，3 条 fail-closed 留 raw）。
  - 全量叶子 3188（CHANGE 2540 / REMOVE 369 / ADD 279），71% 含“mix”错位步
    （两侧字段号不同 = 结构重排/前位插入）→ 位置路径不可靠的量化证据，后续规则必须链式化。
- open-items（fail-closed）：
  - 剩余 769 叶子按链签名归 376 类；字段级动作（名称/文本/几何/素材引用/显隐等）需逐链对照
    单操作差分样本后闭合；1841 的 f505 槽 ADD/REMOVE 大重排语义未解。
  - r-ui-mem-remove / -replace 无样本；模板-实例绑定（type3.f13/type4.f14）本 probe 无操作样本。
  - 1841/1939 等无存储名资产的显示名来源（若有）待查官方模板/TextMap 族。
- 下一轮候选：① 用“mix”占比高的事实驱动改进 diff（按字段号对齐后再 diff，消除 71% 噪音）；
  ② 对 1875/1877/1881 等控件做编辑器单操作差分（改名/改字/换图/几何）闭合字段级链签名；
  ③ 官方技能/预制体/蓝图类另抓 full field11（Round 2 遗留）。

**验收 checkbox（UI/控件类样本已闭合，跨类仍 OPEN；勾选带范围注明）：**
- [x] 至少 1 类新官方资产批量解析落盘 —— **UI 控件/布局/容器类**：type1017 field17 目录+定义
      （`ui_probe.generic.json`，134 定义）与 GIL root9 名称表（`resources/ui_instance_name_table.json`）
- [x] 产出该类“官方 ID/模板 → 内部结构/引用/参数”机器可读资源 —— UI 类：
      `resources/ui_instance_name_table.json` + `resources/ui_ipc_diff_rules.json`（r-ui-mem-*）
- [x] runbook 泛化到“不只官方状态”并被 SKILL.md 引用 —— `runbooks/capture-official-assets.md` §6
      UI 帧差分管线 + SKILL.md 速记/脚本清单
- [x] 脚本/runbook 无临时目录依赖 —— 全部输入输出在仓库 evidence/resources/skill 内
- （跨类 OPEN：官方预制体/技能/Duty/Stuff/复合节点蓝图的 field11 物化与批量解析未开始，
  见 Round 2 下一步 + Round 3 下一轮候选③）
