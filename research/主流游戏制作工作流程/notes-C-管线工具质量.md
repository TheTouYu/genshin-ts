# notes-C：主流商业游戏行业——学科管线、工具链与质量验证环

> 调查日期：2026-10-13。方法：curl 直抓一手源（GDC 官方新闻室、Perforce/HacknPlan/GameAnalytics/Marmoset 官方页面）+ Wikipedia API 条目（当索引用，其里程碑/QA 段带 Chandler 2009 / Bethke 2003 教科书页码级引用）。Bing 搜索在本次调查窗口内经代理出口被污染（返回与查询无关的罐头结果），故以直抓已知 URL 与 Wikipedia 索引为主通道——见 ⑨ 缺口清单。每条结论后 [n] 为 ⑧ 来源编号。

---

## ① 美术管线（Art Pipeline）

**分工结构**。AAA 美术是大团队专科分工：concept art / storyboard / texture / sprite / UI / 3D modeller / environment artist / animator / lighting 等岗位并列；技术美术（Technical Artist, TA）家族是程序与美术之间的桥梁，细分为 tech art director、shader/pipeline TA、rigger（绑定师）、VFX artist 等。TA 自 2019 年起持续短缺（2024 年仍缺），薪酬显著高于普通美术（英国中级 £60k+、高级 £100k+；美国 $205k–297k）[6]。**初级美术岗位大多只存在于外包公司而非自研工作室**——自研侧入门岗被挤压是行业结构事实 [6]。

**资产生产主线**（教科书与社区共识的顺序）：
1. Concept art 定视觉方向 → 2. **blockout/graybox**（关卡侧用 placeholder 几何验证 layout，美术后置）[8] → 3. 高模雕刻 → 4. **烘焙**（将高模细节烘到低模法线贴图）→ 5. **PBR 贴图** → 6. rigging → 7. 动画（mocap 2010 年代起成主流 [6]）→ 8. VFX → 9. 引擎内集成（材质/光照）→ 10. LOD/优化。
   - 步骤 2 的"placeholder 先行、美术后置"是 level design 条目的定义性描述：level designer 用原型素材保证布局一致性，required artwork 完成后才替换 [8][5]。
   - 步骤 3–5 的 PBR 流程有一手技术文献支撑（Marmoset Toolbag 官方理论指南）：贴图输出 = **albedo**（漫反射固有色，不含光照信息）+ **metalness**（金属度二分：导体反射率 60–90% 且无漫反射，绝缘体 0–20%）+ **roughness**（微表面粗糙度，决定高光扩散）；Fresnel 掠射角趋全反射由 shader 自动处理，能量守恒约束艺术家输入；两大工作流 = **metalness vs specular** 工作流，颜色空间分 sRGB/linear [12]。

**Photogrammetry 与 mocap** 在 2010 年代成为 3A 资产生产主流手段（扫描实物→ retopology →贴图链）[6]。

**外包（outsourcing）**。定性结论可靠、精确百分比未获一手数字：
- 音频/配音/mocap 等短期密集学科最适合外包，"大多数开发者外包部分工作"，外包计划在 pre-production 阶段制定；配音只有大发行商养 in-house；**programming 外包程度低于 art 与 music**，但近年增长 [5]。
- 外包公司承担了行业大部分初级美术岗（见上）[6]。
- 2026 年 GDC 趋势报告将 **co-development（工作室间联合开发）** 列为年度主流趋势——3A 项目所需人力超出单工作室承载，联合开发/外包生态持续扩大 [2]。

---

## ② 设计管线（Design Pipeline）

**GDD 的兴衰与 living document 转向**。GDD（game design document）当前主流定义就是 living document——随开发持续修订（维基定义级），且"随开发周度甚至日度修改"（VGD 条目，引 Novak 2008 教科书）[7][5]。GDD 无行业标准格式；常作为发行商-开发商协议的附件存在，构成交付约束的一部分 [7]。实践中 GDD 与 playable prototype 并行演进：pre-production 先产出 GDD 首版 + 局部功能原型，原型反过来决定设计文档最终收录哪些 feature [5]。

**纸上设计 → 灰盒 → 脚本 → 调优**：
- **Paper prototyping** 是 pre-production 的主流验证手段："手工原型（纸面、骰子）常比数字原型更快更省，避免在可能被砍掉的想法上浪费时间" [5]。
- **灰盒（graybox/placeholder）**：level designer 用 placeholder 几何与原型素材先保证 layout 一致性与清晰度，验证通过后才做 art pass（替换成品美术）[8][5]。关卡制作流程 = concept/sketch → 文档化 → 环境建模 → level editor 内摆放实体 [8]。
- **脚本（scripting）**：程序员为设计师生产 level editor 与设计工具，编辑器内含定制高层脚本语言（交互环境/AI），**设计师不需要触碰游戏代码** [5]。职业已细分：level designer / level artist / scripter 三分 [8]。工具面：定制插件版 3ds Max / Maya / Blender [8]。
- **调优（tuning）**：生产期"现有资产根据玩家反馈持续修改" [5]；live 游戏调优则转入 Remote Config 体系（见 ⑤）。

---

## ③ 工程实践（Engineering Practices）

**版本控制：Perforce 主导**。
- Perforce 官方口径：**19/20 顶级 AAA 工作室使用 P4**（营销页数字，但方向与社区共识一致）；Ubisoft 1000+ 人部署 [3]。
- 技术动因：游戏仓库 = 海量大二进制资产（贴图/模型/音频）+ 源码混合；P4 是**集中式**架构（中央数据库 + 主仓库，1995 年设计初衷就是"同时跟踪源码与二进制文件变更"），提供**文件级独占锁（checkout 锁）**避免二进制合并地狱——这是 Git 弱项（Git LFS 是补丁式方案）[4][3]。
- Git 使用面：未获本轮一手统计（缺口）；社区共识为 indie/中小团队与纯代码仓主流，3A 资产仓仍 P4 主导 [4]（单源+常识，标注）。

**代码评审**：Perforce 官方将 **P4 Code Review**（pre-commit/post-commit 评审）列为游戏开发标准全家桶组件 [3]。游戏业代码评审形态的一手深描缺失（缺口）。

**Build 系统与 CI**：
- 游戏业 CI 形态 = **build farm（构建农场）+ nightly/daily build** 的组合，Perforce 官方案例将 **JetBrains TeamCity** CI 列为 Gearbox 等工作室标准集成 [3]。
- "测试自 playable prototype 可用后进场、每日反馈新代码" [10] 隐含 daily build + daily test 循环为 QA 基线节奏。
- build farm 的独立一手深描（GDC 演讲/工作室博客专文）本轮未取得（缺口）。

**Feature flag**：商业游戏业的对应物 = **Remote Config（远程配置）**：不发版改游戏参数（难度/经济/活动/广告位），与 A/B 测试联动（见 ⑤ 遥测）[14]。传统买断制单机对 remote config 依赖低，live service/手游为重度用户 [14]。

---

## ④ 项目管理/协同工具（Toolchain）

- **Perforce 全家桶**：P4（VCS）+ **P4 Code Review**（评审）+ **P4 DAM**（数字资产管理：2D/3D 资产库、3D 预览、文件锁）+ **P4 Plan**（项目管理，原名 **Hansoft**——被 Perforce 收购的知名游戏业 PM 工具）[3]。Hansoft 血统说明 3A 项目管理工具长期独立于通用 Jira 生态。
- **HacknPlan**（官方页）：游戏专用 PM——**分学科看板**（programming/art/design/audio/production 各自看板但任务互联，带日期/依赖/归属）+ **GDD 知识库与任务直接关联**（block 式实时协作编辑器）+ 里程碑/迭代（sprint 板挂 milestone）+ velocity/burndown/Gantt 学科级视图 [13]。其产品定义本身印证了"游戏 PM = 通用敏捷 + 学科分板 + 设计文档中枢"的行业形态。
- **Jira/Confluence**：Atlassian 游戏行业方案页本轮抓取仅得 JS 渲染空壳（缺口）；间接证据 = P4 官方将自身定位为与 Jira 生态并存的专用层 [3]。Jira 在游戏业使用面广为社区常识但未取得一手统计（缺口）。
- **ShotGrid（现 Autodesk Flow Production Tracking）**：影视/游戏制作管理（资产管理+评审+pipeline 追踪）工具，官方页本轮被反爬挡下（428B），未能一手确认当前功能面（缺口）。
- **Miro**：未获一手使用面数据（缺口）。

---

## ⑤ 质量验证环（Quality Loop）

**Playtest（玩法测试）≠ QA**。定义级区分：playtest 是把开发中的游戏暴露给目标受众以**发现设计缺陷并收集反馈**（还承担商业可行性验证）；QA testing 是专业测试员**系统性找软件 bug** [9]。二者是并行的两条验证轴。

**Playtest 形态谱系** [9]：
- **open**（公开招募/任何人可参加，常需问卷筛选+NDA）/ **closed**（内部，不对外）/ **beta**（上市前最后阶段，semi-open 限量形态找 last-minute 问题）。
- 行业史：**Atari 1976 年雇 Carol Kantor 为业界第一位 user research 员工**——此前 Atari 靠投币机回收数据（coin-collection data）评估游戏，这是**遥测驱动验证的原点** [9]。
- 案例谱系：Minecraft pre-alpha 即付费开放售卖（开放测试+资金支持双目的）；Valve 一贯保守（保密传统）但 Dota 2 / CS:GO 走公开 beta；StarCraft II: HotS 只开放多人部分、且首波只选职业选手与媒体（定向受控暴露）[9]。MMO 类用 **PTR（public test realm）** 预演大改版 [5]。
- 内部节奏（daily/weekly playtest）与 usability lab 的专门一手源本轮未取得（缺口）；间接证据：Valve Handbook 的 cabal 多学科评审制与 playtest 组合见 notes-B。

**QA（专业测试）** [10]——本节为定义级一手材料（Game testing 条目，引 Schulz 2014 等教科书/论文）：
- **节奏与并行程式**：测试从第一行代码就开始、随进度加码；早期小团队对**每日新代码做 daily feedback**；**alpha 前写下 test plan**；beta 期每日有明确测试分工、lead tester 与制作人/部门头**每日沟通**、外部发行商 QA 与第一方（索尼/微软/任天堂）QA 介入；console 提交认证 build [10]。
- **Bug severity 分级**（多数公司按严重度估计分三级）：**A bug** = 阻断上市（如崩溃）；**B bug** = 需处理但不阻断（多个 B 等价一个 A）；**C bug** = 细小问题/接近改进建议 [10]。
- **Bug 生命周期**：Identification（识别）→ Reporting（经 defect tracking 系统上报，附复现步骤，可索要录像）→ Analysis（责任开发者核查）→ Verification（修复后回归验证）；处置含 **NAB**（not a bug，被判为特性）与 **waived**（制作人/设计/lead tester 按公司政策豁免）[10]。
- **测试方法论全家桶**：functionality（玩着找问题）/ **compliance**（第一方技术认证：Sony TRC、Microsoft XR、Nintendo Lotcheck——一条违规即可能拒审重测，错过发售窗口）/ compatibility（PC 硬件矩阵，beta 早期+RC 两轮）/ localization（母语者审校）/ **soak testing**（长时间挂机跑，抓内存泄漏）/ beta（公众海量找漏）/ **regression + halo testing**（修复验证+周边扫射找连带 bug）/ load（MMO 服务器上限）/ multiplayer（连通性）[10]。
- **测试硬件**：console 测试用 test kit（同规格+内存抓取/自动合规检查）与 dev kit（高配、程序员底层调试），非消费机 [10]。
- **QA 人力形态**：发行商养大 QA 池、开发商留小队 on-the-spot；临时工化明显（beta 招募旺季=夏末秋初，赶节日档 crunch）；美国 tester 时薪约 $10–12、平均年薪 $39k（3 年内 $25k / 3 年+ $43k / lead 6 年+ $71k）；**SDET/Technical Tester**（自动化测试工程师）在业内仍稀有，多为无此岗 [10]。
- **关键教训**（postmortem 共识）："已发表的游戏开发 postmortem 中最常见的问题 = 测试开始得太晚" [5]。游戏早期 backend 代码缺乏 rigor 是常态（玩法随时可能推翻实现），feature solidify 后才转入严格 regression 控制 [5]。

**里程碑即验证闸门** [5]（引 Chandler《Game Production Handbook》2009 p.244-245、Bethke 2003 p.192/293-295）：**无行业标准定义**，随发行商/年份/项目而变；典型两级开发周期：**first playable**（代表性玩法+资产，code release 前 12–18 月，又称 Pre-Alpha）→ **alpha**（feature complete：玩法功能齐、资产部分完成）→ **beta**（feature+asset complete，只修 bug 不改内容，code release 前 2–3 月）→ **code release**（bug 大体清完、送第一方审核，此前 3–4 周出首个 release candidate，QA 按 test plan 验收）。里程碑同时是**商务收款节点**（advance against royalty，3–20 条，写入合同；90% 完成常按"精神履约"付款）[5]。

**遥测/telemetry 与数据分析**：
- 历史原点 = Atari 投币机数据（1976 前）[9]；现代形态 = SDK 埋点 + 后台事件分析。
- **Remote Config + A/B 测试**（GameAnalytics 官方指南，手游遥测工具商一手）[14]：
  - Remote Config = 不发版改参数（季节内容/难度平衡/货币化 offer/广告位/分人群体验）；SDK 启动时拉取、代码按键读取+默认值兜底；**禁止用于安全关键逻辑**（授权/反作弊）；上线前 dev 环境验证、灰度切片再全量。
  - A/B 测试 = 变体分组对照，目标指标 = **retention / revenue / engagement**；典型用例 = **FTUE（首次用户体验）优化、货币化策略、live feature 验证**；实现上 A/B 变体值**覆盖** Remote Config 常规值（配置是交付层，实验是选择性覆盖层）。
  - 工作流顺序：先暴露可调参数 → 小流量实验 → 对目标指标读数 → 全量。

**Beta 与 demo 的验证目的**：closed beta 验证服务器负载/核心循环（NDA 约束）；open beta = 公开海量找漏+预热 [10][9]；early access 是"发行模型本身内建 bug 反馈环"的形态（付费+迭代+玩家反馈并行）[5]；手游 soft launch 见 ⑦。

---

## ⑥ 引擎与行业统计（GDC State of the Industry 2026）

一手源：GDC 官方新闻室 SOTI 2026 发布稿（**2300+ 名从业者**受访；调查按角色分组定制问卷）[1]：

| 指标 | 数值（2026 SOTI）[1] |
| --- | --- |
| 最流行主引擎 | **Unreal 42%**，Unity 30% |
| Unreal 采纳率（分层） | AA **59%** / AAA **47%** / 老牌 indie 用 Unity 54% |
| Godot | 新 indie 中 **11%**，成熟工作室很少 |
| Steam Deck | 第 4 大开发平台（**28%** 在做/优化；40% 有兴趣≈Switch 2 的 39%） |
| 下一代平台意向（高管） | PC 居首（73% 高管列 top3） |
| GenAI 使用 | 从业者 36% 在用（工作室内仅 30%；发行/市场/支持侧 58%）；最常用 LLM（ChatGPT 74%），用途=调研头脑风暴 81%、日常事务/代码辅助各 47%、原型 35% |
| GenAI 态度 | **52% 认为对行业有害**（2025=30%，2024=18%，逐年恶化）；认为正面仅 7%（2025=13%） |
| 裁员 | 28% 过去两年被裁（美国 33%）；AAA 工作室 2/3 经历裁员、indie 1/3；50% 现雇主过去 12 个月裁过员 |
| 工会 | 82% 美国受访者支持工会化；10% 已入行业工会（UVW-CWA 2025 年 GDC 成立） |

2026 GDC Trends Report（第二届，基于 GDC 会期+领袖访谈）[2]：**co-development 成主流趋势**（3A 人力需求超单工作室）；越南 hyper-casual 市场激增、casual/hybrid-casual 转向留存优先、**dual monetization（IAP+广告双货币化）普及**；GenAI 讨论焦点从"能否使用"转向"该不该用/如何用"；受访高管含 PlayStation Studios Head of Production John Doyle、Tencent Head of Technology Nathan Chen。

---

## ⑦ 赛道差异（AAA vs Indie vs 手游）

**AAA**：
- 管线 = 全科室内深分工 + 大量外包/联合开发（co-development 成 2026 年度趋势 [2]）；初级岗被外包层吸收 [6]。
- 工程 = Perforce 集中式资产仓 + build farm + TeamCity CI [3]。
- 验证 = 分层 playtest + 第一方认证（TRC/XR/Lotcheck）+ 里程碑收款闸门 [10][5]。
- 组织现实：2/3 经历裁员 [1]；crunch 常态化（QA 尤甚，Treyarch BO4 案例 [10]）。

**Indie**：
- 引擎分层明显：老牌 indie 54% Unity，新 indie 11% Godot [1]。
- 验证 = early access / 开放 playtest 直接变体：Minecraft pre-alpha 付费售卖（测试+融资+口碑三合一）[9][5]；paper prototype 与 graybox 在小团队仍是低成本验证主干 [5]。
- 资金侧：indie game fund 填补大厂融资收缩空缺 [2]。

**手游/live service**：
- **Soft launch（软发布）**：正式硬发布前在小市场限量上线验证——常选**加拿大/澳大利亚/新西兰**（英语、用户行为与美国近似、时区近），也用**菲律宾/瑞典/巴西/南非/印尼**做区域桥头堡；目的 = 分析真实 usage 与付费习惯、迭代打磨、避免美国媒体过早注意 [11]。
- 验证环 = 遥测驱动：Remote Config 热调参 + A/B 测试对 retention/revenue/engagement 读数（FTUE 优化为第一用例）[14]。
- 迭代逻辑 = **LTV 驱动**：casual/hybrid-casual 焦点从买量转向留存，dual monetization（IAP+广告）普及 [2]；live 游戏预期高频更新，"发售即维护开始" [5]。
- 与买断制验证哲学的根本差异：买断制验证收敛于 code release 前的封闭里程碑闸门 [5]；手游验证是**发版后持续开环**（soft launch→全球上线→live ops 全程遥测迭代）[11][14]。

---

## ⑧ 来源清单

1. **GDC 2026 State of the Game Industry**（官方新闻稿，2300+ 受访者）— https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/
2. **2026 GDC Trends Report: 5 Insights**（官方新闻稿）— https://gdconf.com/article/2026-gdc-trends-report-5-insights-on-the-future-of-game-development/
3. **Perforce: Game Development Solutions**（官方营销页，19/20 AAA 数字、P4 全家桶、TeamCity/Gearbox 案例）— https://www.perforce.com/solutions/game-development
4. **Wikipedia: Perforce**（1995 创立、集中式架构、源码+二进制统一管理）— https://en.wikipedia.org/wiki/Perforce
5. **Wikipedia: Video game development**（里程碑定义引 Chandler 2009 p.244-245 / Bethke 2003 p.192,293-295；QA 全景；外包定性；paper prototype；GDD living document；PTR；early access）— https://en.wikipedia.org/wiki/Video_game_development
6. **Wikipedia: Video game art design**（AAA 美术分工、TA 家族与短缺、初级岗在外包、photogrammetry/mocap）— https://en.wikipedia.org/wiki/Video_game_art_design
7. **Wikipedia: Game design document**（living document 定义、发行商协议附件、无标准格式）— https://en.wikipedia.org/wiki/Game_design_document
8. **Wikipedia: Level (video games)**（placeholder→art pass 流程、职业三分、工具面）— https://en.wikipedia.org/wiki/Level_(video_games)
9. **Wikipedia: Playtest**（open/closed/beta 定义、Carol Kantor 1976、playtest≠QA、Minecraft/Valve/SC2 案例）— https://en.wikipedia.org/wiki/Playtest
10. **Wikipedia: Game testing**（A/B/C bug 分级、bug 生命周期 NAB/waived、测试方法论、TRC/XR/Lotcheck、test/dev kit、QA 薪酬、SDET）— https://en.wikipedia.org/wiki/Game_testing
11. **Wikipedia: Soft launch**（手游软发布国家选择逻辑）— https://en.wikipedia.org/wiki/Soft_launch
12. **Marmoset: PBR Theory**（官方技术文献：albedo/metalness/roughness/Fresnel/能量守恒、metalness vs specular 工作流）— https://marmoset.co/library/basic-pbr-theory/
13. **HacknPlan**（官方产品页：分学科看板、GDD 关联任务、里程碑）— https://hacknplan.com/
14. **GameAnalytics: Live Ops — Remote Configs and A/B Testing**（官方指南：RC 交付层+A/B 覆盖、FTUE/留存/收入指标、安全默认值纪律）— https://gameanalytics.com/blog/live-ops-remote-configs-ab-testing-games
15. **Riot Games Technology Blog**（工程博客存在性确认，tech-blog 系列可见：CPU usage/Swarm/2XKO online play）— https://technology.riotgames.com/

---

## ⑨ 未能访问/缺口清单

1. **3A 美术外包精确占比**（%数字）：XDS（External Development Summit）/TIGA 统计未取得——Bing 被污染无法定位文章，Wayback CDX 间歇限流。现有结论仅定性（"多数开发者外包部分工作"[5]、初级岗在外包层[6]）。
2. **Nightly build/build farm 一手深描**：Noel Llopis 经典文章（gamesfromwithin.com）Wayback 仅存 4.6KB 壳；Riot tech blog 可达但本轮抓到的均为具体技术专题（CPU/Swarm/2XKO）而非 build 系统专文。仅有 Perforce 官方 TeamCity 集成案例 [3] 佐证。
3. **Jira/Confluence 游戏业使用面统计**：atlassian.com 游戏方案页为 JS 渲染空壳（157KB 无正文）。
4. **ShotGrid/Autodesk Flow**：官方页反爬（428 bytes）。Miro 同缺。
5. **Epic/Unity 官方生产指南**：dev.epicgames.com 文档为 SPA，curl 抓不到正文；docs.unity.com analytics 手册 URL 已 404（产品线迁移至 Unity Gaming Services）。
6. **SOTI 历年对比**（2024/2025 完整表）：gamedeveloper.com 2025 SOTI 文章在 Wayback 已 301 移除；仅从 SOTI 2026 稿内取得 GenAI 态度三年序列（52%/30%/18%）[1]。
7. **内部 playtest 节奏（daily/weekly）与 usability lab** 一手源：未取得专文；仅有条目级 open/closed/beta 形态谱系 [9]。
8. **代码评审/trunk-based 分支策略在游戏业** 的一手统计：仅 P4 Code Review 产品面证据 [3]；分支策略（trunk-based vs short-lived branch）无一手数字。
9. **Godot/自研引擎完整占比分布**：SOTI 新闻稿仅给 Unreal/Unity/Godot 关键数，完整分布需下载 PDF 报告全文（需注册，未取得）。
10. **polycount wiki**（社区美术管线一手 wiki）：域名本轮不可达。
11. **bug severity S1–S4 分级表**（区别于 A/B/C 三级）与 test plan 模板样例：未取得一手实例，仅教科书级 A/B/C 分级 [10]。
