# 主流游戏制作工作流程调查报告

> 调查日期：2026-10-13。范围：**主流商业游戏行业**的端到端制作工作流程（阶段/里程碑、方法论、组织、学科管线、质量验证、工具链、赛道差异、劳动现实）——按任务要求与千星奇域平台无关，纯行业口径。
> 方法：三路并行网络调查（A=阶段与里程碑、B=方法论与组织、C=学科管线与质量环），curl 直抓一手源（官方文档/PDF/新闻室/创始人信）+ Wikipedia 仅当索引用（页码级引用透传）。信源纪律与缺口见 §12 与三份底稿。
> 引用格式：[A n]/[B n]/[C n] = 底稿 `notes-A/B/C-*.md` 来源清单的编号；[B §n] = 底稿章节。

---

## 1. 端到端阶段骨架：一条时间轴

通行骨架（教科书口径，**无行业标准定义**——Bethke 明言里程碑语义随发行商/年份/项目而变 [A2]）：

```
concept/pitch → prototype(找 fun/技术验证) → pre-production(含 vertical slice)
→ production(全内容铺开) → alpha → beta → code freeze/RC → code release
→ certification(主机认证) → gold master → ship/launch → post-launch/live ops
```

| 阶段 | 判据（进入/出口） | 关键事实 |
|---|---|---|
| Concept/Pitch | 向发行商/平台提案 | 主机上架需**平台方概念批准**，可被拒 [A1] |
| Prototype | 可玩原型验证「好不好玩」+技术风险 | 原型先行是 jam 文化的方法论化（§3） |
| Pre-production | 详细设计/技术选型/排期预算；代表作级 **vertical slice** | XCOM 2009 切片评审「不好玩」→整块推翻重做，五年磨成 2012 成品 [A10]（切片慎引，见 §12） |
| Production | 全内容全功能制作 | 外部开发商按**里程碑交付+收款**推进 [A2] |
| **Alpha** | **feature complete**：核心玩法功能全部实现，资产尚可占位 | 仍可能改/砍功能 [A1][A2] |
| **Beta** | feature + **content complete**：此后只修 bug 不加内容，无 show-stopper | 两轮兼容性测试（beta 早段 + 临近 RC）[A4] |
| Code freeze/RC | 不写新代码只修缺陷（≈code release 前 3-4 月）；首个 RC 前 3-4 周 | Chandler 口径，单源 [A1] |
| Code release | 达到「可提交认证」状态，QA 已按 test plan 验证 [A1] | |
| Certification | 平台方测试（§6） | 通过→gold；驳回→修复重交、可能错过档期 [A5] |
| **Gold master** | 认证通过的最终版=生产母盘（光盘时代术语）[A1][A2] | |
| Post-launch | patch→免费更新→DLC→season/battle pass→赛季制运营 | CP2077 的 2.0+Phantom Liberty 使总投入达 ~$4.4 亿档；Stardew 独立作者长期免费更新线（1.6, 2024）；Fortnite=chapter+season+Battle Pass+商城轮换的赛季制标杆 [A11][A8][A7] |

三个 complete 辨析：**feature complete**（功能齐，≈alpha 出口）/ **content complete**（内容资产齐，与前者合并即 beta 入口）/ **code complete**（不再新增代码，≈code freeze）[A1][A2]。

**First playable**：代表性玩法+资产的第一个可玩版，约在 code release 前 12-18 个月，又称 pre-alpha [A1][A2]。

## 2. 里程碑的商务本质：流程即付款机器

- 里程碑（milestone）在主流 industry 的原义是**合同付款节点**：开发商按交付物领取预付版税（advance against royalty），一份合同 3-20 条，逐条验收合格才付款；**90% 完成常按「精神履约」付款** [A2][C5]。
- Greenlight 是双层的：①发行商绿灯链（pitch→concept approval→若干里程碑→production 全额立项），里程碑付款结构本身就是分期 go/no-go；②平台方门禁（概念批准+上架认证）[A1][A2]。
- 即：**阶段流程的骨架是从发行商-开发商的合同机器里长出来的**；敏捷方法（§3）是叠加在这副骨架上的执行层，不是替代。

## 3. 方法论谱系：合同骨架之上，先找 fun 再扩张

1. **瀑布/里程碑制**（主机时代主流，至今仍是商务骨架）[B1 转引 A]。
2. **敏捷/Scrum 进入游戏业**：Clinton Keith 在 High Moon Studios 引入 Scrum，成为游戏业首位认证 Scrum 培训师，著《Agile Game Development with Scrum》(2010)——标准书目；游戏变体惯例=两周 sprint、以**可玩构建**为迭代单元、燃尽图（一手过程叙述本轮未取到，标待补）[B1]。
3. **原型先行（find the fun）**：Valve Cabal（HL 首版平庸→推翻重来，1997-11 拖到 1998-11）[B2]；Double Fine Amnesia Fortnight（two-week jam，anyone can pitch，全体放下手头工作）[B6]；Hades 的 EA 迭代（2018 EA→2020 1.0，早期玩家当外部 playtest）[B 二手]；Cerny method 为口传同构 [B1]。
4. **看板/live-ops 形态**：live service 团队已成主流工作形态（GDC Insights 报告，含前 Nexon CEO 访谈）[B7]；运营侧=Remote Config 热调参 + A/B 测试的持续迭代环 [C14]。

## 4. 组织模式：五种活着的样本

| 工作室 | 模式 | 一手要点 |
|---|---|---|
| **Valve** | 无层级自组织（Flatland）+ Cabal | 「无管理者、无人向任何人汇报」，用脚（桌轮）投票选项目；Cabal=多学科临时小队（HL 期 6 人=3 工程+1 关卡+1 作家+1 动画，无专职设计师人人有交付件；每周 4 天×6 小时×5 月防倦怠；产出 200+ 页文档）；Handbook 反加班立场原文：「长期加班=计划或沟通的根本失败」[B1][B2] |
| **Supercell** | cell 制（公司内的公司） | 创始人信原话：cells="fully independent companies inside the larger company"；领导层「建最好的队，然后全信任、不指挥」；小团队=少流程、敢冒险、跑得快；2022 年自我修正：「fully independent+高野心+小团队+远程」伤害团队健康，自认 big mistake [B4] |
| **Double Fine** | jam 分化出的联邦小队 | 2011 起拆 ~15 人/队，每队可独立出小游戏，大作临时并队（Psychonauts 2）[B6+Wikipedia 二手] |
| **Supergiant** | 25 人全员多面手 | Hades II 制作期全公司仅 25 人（Game Informer 2024）[B 二手] |
| **Ubisoft** | 全球多工作室网络 | 1996 IPO 后两年连设 Annecy/Shanghai/Montreal/Milan；旗舰 IP=lead studio+协作工作室群；1000+ 人共用 Perforce 资产仓 [B5+Wikipedia 二手+C3]；2026 年 co-development 已成年度主流趋势（3A 人力超单工作室承载）[C2] |

**制作角色的演化样本（Naughty Dog）**：2011 年「无制作人、无管理、just us working as a team」→ 2022 年组建 **17 名制作人**，目的明确=对抗 crunch。小团队全才扁平的标杆厂也承认规模化后需要专职流程角色 [B 二手：IGN 2011 + Bloomberg/Schreier 2022]。Producer 的教科书职责=排程/依赖/风险/跨组沟通（owner of the schedule）[B7 转引 A]。

文化教训样本（Riot）：官方五条价值观（Player First 等）+ 2019 文化危机链（Kotaku 起底→walkout→至少 $1000 万和解）——**强价值观文化≠健康流程** [B5+B 二手]。

## 5. 学科管线：美术/设计/工程怎么流

**美术管线**（AAA 专科分工：concept/texture/3D/环境/动画/lighting 并列，TA 家族为桥且持续短缺）：
```
concept → blockout/graybox → 高模雕刻 → 烘焙(高模细节→低模法线) → PBR 贴图
→ rigging → 动画(2010s 起 mocap 主流) → VFX → 引擎集成 → LOD/优化
```
PBR 输出=albedo+metalness+roughness（能量守恒约束，Fresnel 由 shader 处理；metalness vs specular 两大工作流）[C12]。photogrammetry 扫描已成 3A 资产主流手段 [C6]。**初级美术岗大多在外包公司而非自研工作室**；音频/mocap 最适合外包，programming 外包程度低于 art/music [C6][C5]。

**设计管线**：GDD 的当代主流定义就是 **living document**（周度甚至日度修订、无行业标准格式、常作发行商协议附件）；与 playable prototype 并行演进 [C7][C5]。关卡：纸上原型（纸面+骰子常比数字原型更快更省）→ graybox（placeholder 几何验证 layout）→ art pass 替换成品美术；职业三分=level designer / level artist / scripter；程序员为设计师做编辑器+高层脚本语言，**设计师不碰游戏代码** [C8][C5]。

**工程实践**：版本控制 **Perforce 主导**（官方口径 19/20 顶级 AAA；Ubisoft 1000+ 人部署）——动因=海量大二进制资产+源码混合，集中式+**文件级独占锁**避免二进制合并地狱（Git LFS 是补丁方案）[C3][C4]。CI 形态=build farm+nightly/daily build（TeamCity 为常见集成；「测试自第一行代码开始、每日反馈新代码」）[C3][C10]。游戏业的 feature flag 对应物=**Remote Config**（不发版改难度/经济/活动参数）[C14]。

**工具链**：P4 全家桶（VCS+Code Review+DAM 资产库+Plan，后者原名 Hansoft——游戏业原生 PM 工具，长期独立于 Jira 生态）[C3]；HacknPlan=游戏专用 PM（**分学科看板**+GDD 与任务直接关联）[C13]。

## 6. 质量验证环：四条并行轴线

1. **Playtest（验证设计）≠ QA（找软件缺陷）**——定义级两条轴 [C9]。Playtest 谱系：open（公开招募+NDA）/closed（内部）/beta（上市前限量）；历史原点=Atari 1976 雇佣业界第一位 user research 员工，此前靠**投币机回收数据**评估游戏（遥测驱动验证的原点）[C9]。形态案例：Minecraft pre-alpha 即付费开放售卖（测试+融资+口碑三合一）；SC2:HotS 定向只放职业选手与媒体（受控暴露）；MMO 用 PTR 预演大改版 [C9][C5]。
2. **QA 程式**：test plan 写于 alpha 前；beta 期每日分工、lead tester 与制作人每日沟通；发行商 QA 与第一方 QA 在后期介入 [C10]。Bug 按 **A（阻断上市，如崩溃）/B（需处理）/C（细小）** 三级；生命周期=识别→上报（defect tracking，附复现步骤）→分析→验证回归；处置含 NAB（判为特性）与 waived（政策性豁免）[C10]。测试类型全家桶：functionality/**compliance**/compatibility/localization/**soak**（长挂机抓内存泄漏）/regression+halo/load/multiplayer [C10]。**Postmortem 最常见教训=「测试开始得太晚」**；早期 backend 代码缺 rigor 是常态，feature solidify 后才转入严格回归 [C5]。
3. **主机认证（第一方硬闸门）**：Sony **TRC** / Microsoft **XR** / Nintendo **Lotcheck**。Microsoft XR 全文公开（learn.microsoft.com，v16.4/v16.5）：XR-001 稳定性、**XR-003 提交须 fully functional and testable**（无崩溃/死机/不可玩帧率）；认证团队在 CERT sandbox 用零售机测试；公开「失败 TOP 10 测试项」与逐版变更史。Sony/Nintendo 文档在注册/登录墙内（2026-10-13 直查验证）。任一违规可整单驳回→修复重交→可能错过发售档期；内容分级（ESRB/PEGI）不达标同样重交 [A5][A6][C10]。
4. **遥测/数据分析（live 时代主轴）**：Remote Config（交付层）+ A/B 测试（选择性覆盖层）；目标指标=retention/revenue/engagement；第一用例=**FTUE 优化**；纪律=先暴露可调参数→小流量实验→读数→全量；禁止用于安全关键逻辑 [C14]。

## 7. 行业统计切片（GDC SOTI 2026，2300+ 从业者，一手新闻室）

| 指标 | 数值 |
|---|---|
| 主引擎 | **Unreal 42% > Unity 30%**；AA 59%/AAA 47% 用 Unreal；老牌 indie 54% 仍 Unity；新 indie 中 Godot 11% |
| 平台 | Steam Deck 为第 4 大开发平台（28%）；PC 居下一代意向首位（73% 高管列 top3） |
| GenAI | 36% 在用（工作室内仅 30%，发行/市场侧 58%）；**52% 认为对行业有害**（两年前 18%——逐年恶化）；认为正面仅 7% |
| 裁员 | 28% 过去两年被裁（美国 33%）；AAA 工作室 2/3 经历裁员、indie 1/3 |
| 工会 | 82% 美国受访者支持工会化；10% 已入会 |

2026 GDC Trends Report：co-development 成年度主流趋势；casual/hybrid-casual 转向**留存优先**、dual monetization（IAP+广告）普及 [C2]。

## 8. 三条赛道的不同世界观

| 维度 | AAA（买断/大厂） | Indie（独立） | 手游（live/免费） |
|---|---|---|---|
| 团队 | >100 人全职 [A1]，外包+co-dev 生态 [C2] | 可 1 人（Stardew solo 5 年）[A8] | 软启动期 35-40 人（Switchcraft 个案）[A12] |
| 周期 | 3-5 年（案例佐证：CP2077 2016-2020、XCOM 2007-2012）[A11][A10] | 数月-5 年不等 | 数月级（软启动节奏）[A3] |
| 验证哲学 | **封闭闸门**：里程碑收款→认证→gold，收敛于上市前 [A2] | early access/开放 playtest（付费+迭代+反馈并行）[C5][C9] | **发版后开环**：soft launch（加/澳/新西兰等小市场）→遥测迭代→global→live ops 全程 |
| 关键机制 | 里程碑付款、TRC/XR/lotcheck、build farm | paper prototype+graybox 低成本验证 | soft launch 六阶段（validation→technical SL→FTUE 重做→D30→dress rehearsal→global），**KPI=留存第一**（D1/D7/D30）[A12][C11] |
| 商业闭环 | 首发销量+DLC | 直接销售/EA | LTV 驱动、UA 买量、dual monetization [C2] |

Wooga《Switchcraft》软启动实录（游戏总监自述）：验证玩法循环→技术性软启动→发现留存不达标→**停 UA 重做 FTUE**→主攻 D30 数月→dress rehearsal 彩排→global；软启动期 UA 投入已超团队经常性开支 [A12]。

Jam 文化是第四条暗线：限时从零做游戏（GGJ 每年 100+ 国 800+ 站点），是 prototype-first 文化的制度化体现，部分 jam 作品长成商业游戏 [A13]。

## 9. 劳动现实：crunch、远程、工会

- **Crunch 发生率十年下降**（IGDA DSS，「工作涉及 crunch」）：2017 51% → 2019 41% → 2021 ≈1/3 → 2023 28%；**但卷者频率反升**（crunch 者过去两年 >2 次占比）：2019 ≈36% → 2021 58% → 2023 63%。2019 强度：crunch 周 50-59h=38%、60-69h=19%、>70h=13%；34% 零补偿。自由职业更糟（56% 认为客户把 crunch 当正常）[B3 一手]。
- **远程**：疫情前平均 28% 时间 WFH→疫情中 91%；区域分化极大（欧洲纯 WFH 95% vs 东亚仅 27%）[B3 COVID 专版]。
- **工会化加速**：82% 支持（§7）；Double Fine 2026-05 提交 CWA 申请；Riot 2019 walkout 后 ≥$1000 万和解 [C1][B6][B 二手]。
- **裁员潮**：28% 两年内被裁，AAA 2/3 中招 [C1]——与 GenAI 焦虑（52% 认为有害）同为本年度行业情绪底色。

## 10. 成本与时间量级（公开数字，名义美元）

| 年份 | 案例 | 数字 | 来源 |
|---|---|---|---|
| 1990 前 | 行业平均 | $1-5M | Kotaku 2014 [A3] |
| 2010 | 多平台平均 | $18-28M（大作常超 $40M） | develop-online 2010 [A3] |
| 2017 | 行业平均（250+ 样本） | ~$100M；**约每 5 年翻倍** | Raph Koster 2017 [A3] |
| 2020 | Cyberpunk 2077 | 开发 $174M + 营销 $142M | CDPR 官方 [A11] |
| 2023 | HFW / TLOU2 | 各 ~$200M（开发） | Sony 披露 [A11] |
| 2023 | Monopoly Go! | 总成本 ~$1000M（UA 为主） | [A11] |
| 2026 | GTA VI | ~$1B（**传闻，未证实**） | [A11] |

营销预算常与开发同量级 [A3]。live 时代「开发成本」与「持续运营成本」边界模糊（CP2077 后续投入使总额达 ~$4.4 亿档）[A11]。

## 11. 结论：主流工作流的十二条骨架

1. 阶段骨架（concept→prototype→pre-pro→production→alpha→beta→cert→gold→live）是**合同付款机器**的外化，无行业统一定义 [A2]。
2. 里程碑=收款节点，greenlight 分期 go/no-go；流程即治理 [A2]。
3. 方法论三叠层：合同骨架（瀑布/里程碑）+ 敏捷执行（sprint/可玩构建迭代）+ live-ops 开环（RC+A/B）。
4. **先找 fun 再扩张**是跨规模共识：原型/切片/灰盒/jam 都是低成本杀死坏想法的装置 [B2][B6][C8]。
5. vertical slice 是 pre-production 的 go/no-go 评审物，推翻成本真实存在（XCOM 整块重做）[A10]。
6. 组织从层级制走向小团队制（cell/联邦小队/无层级），但规模化后流程角色（producer）回归（ND 17 制作人）[B4][B6][B 二手]。
7. 学科管线以 placeholder→成品的两段式为核心（graybox→art pass、blockout→集成），设计师不碰代码靠编辑器+脚本层 [C8][C5]。
8. 工程底座=Perforce 集中式资产仓+文件锁、build farm+nightly、remote config [C3][C10][C14]。
9. 质量验证是**四轴并行**（playtest 设计验证 / QA 缺陷工程 / 第一方认证合规 / 遥测数据闭环），不是单一「测试」阶段 [C9][C10][A6][C14]。
10. 最常见的失败教训=验证开始太晚（postmortem 共识）[C5]。
11. 赛道决定验证哲学：买断制收敛于上市前封闭闸门，手游是发版后持续开环（soft launch→LTV）[A12][C11][C14]。
12. 劳动侧：crunch 发生率降但集中度升、裁员潮、工会化加速、GenAI 焦虑——工作流程问题同时也是劳资问题 [B3][C1]。

## 12. 信源与缺口

**底稿**（各带完整来源清单与缺口清单）：
- [notes-A-阶段与里程碑.md](notes-A-阶段与里程碑.md) — 13 源+8 缺口；commit ff9d6fb
- [notes-B-方法论与组织.md](notes-B-方法论与组织.md) — 信源四级标注（一手/二手/转引/待补）；commit c79d8a7
- [notes-C-管线工具质量.md](notes-C-管线工具质量.md) — 15 源+11 缺口

**主要缺口**（诚实边界）：Sony TRC/Nintendo lotcheck 原文在注册墙内（仅 Microsoft XR 全公开）；Chandler/Bethke 教科书页码引用经 Wikipedia 转引；vertical slice 游戏业一手定义未取得（慎引）；敏捷过程一手叙述、外包精确占比、Jira/ShotGrid 使用面、build farm 专文、后疫情远程比例均未闭合。调查环境：Bing 经代理出口中途被污染，三路均降级为「Wikipedia 当索引+官方域名直抓+Wayback（https）」预案完成。
