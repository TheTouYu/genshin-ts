# notes-A — 商业游戏行业的开发阶段划分与里程碑体系

> 网络调查笔记（2026-10-13）。术语保留英文，正文中文。标注约定：[n]=文末来源编号；「单源」=仅一处来源；「通行」=多来源交叉或教科书/平台方口径；「个案」=某工作室/某游戏的具体做法。
> 姊妹篇：`notes-B-方法论与组织.md`（Valve/Supercell/IGDA crunch 时间序列）、`notes-C-管线工具质量.md`（引擎/工具链/GDC SOTI 2026）。

---

## ① 每阶段定义与判据

**总流程（通行骨架）**：concept/pitch → prototype/proof of concept → pre-production（含 vertical slice）→ production → alpha → beta → code freeze / release candidate → code release → certification 提交 → gold master → 上市（ship/launch）→ post-launch/live ops。

**前提警告（教科书口径）**：Bethke 明确「业界**没有**定义里程碑的行业标准，随发行商、年份、项目而变」[2]。以下定义是教科书与平台方文档给出的通行语义，具体合同以个案为准。

| 阶段 | 定义与进入/退出判据 | 来源 |
|---|---|---|
| Concept / Pitch | 一切始于 idea/concept（Bates 2004 p.3、Bethke 2003 p.75、Adams & Rollings 2006 pp.29-30）；向发行商或平台方提案。主机平台上架还需**平台方概念批准**（"game concept must be approved by the manufacturer, who may refuse"——Chandler 2009 p.90）| [1][2] |
| Prototype / Proof of concept | 做可玩原型验证「好不好玩/技术风险」；文档阶段术语 proof of concept（Bates 2004 p.204），又称 technical review（Moore & Novak 2010 p.70）| [1][3] |
| Pre-production（预生产） | 产出详细设计文档、技术选型、排期与预算；代表作级 vertical slice（见②）验证美术质量与玩法纵深 | [1][3] |
| Production（生产） | 全内容全功能铺开制作；对外部开发商而言按**里程碑交付+收款**推进（3-20 条里程碑清单，见②）| [2] |
| **Alpha** | 关键玩法功能全部实现（key gameplay functionality implemented）＝ **feature complete**；美术/音频资产尚部分占位；游戏以全部主要特性可玩；仍可能修改或砍功能（Bethke 2003 p.192、Chandler 2009 p.245）| [1][2] |
| **Beta** | **feature complete + asset（content）complete**——功能与内容资产齐备，此后**只修 bug 不加内容**，无阻碍上市的问题（no show-stoppers）（Bethke p.294、Chandler p.245）；beta 内做两轮兼容性测试（beta 早段+临近 release candidate，PC 尤甚）| [1][2][4] |
| Code freeze / **Code complete** | 不再写新代码，只做缺陷修复；约在 code release 前 3-4 个月（Chandler p.245）。「code complete」业界常与 code freeze 混用指同一闸门 | [1]（单源：Chandler） |
| Release candidate (RC) | 候选发布版；首个 RC 约在 code release 前 3-4 周，供 QA 按测试计划验证 | [1]（单源：Chandler） |
| **Code release** | 版本达到「可上市/可提交主机厂认证评审」状态，并已按 QA 测试计划完成验证（Chandler p.245）——即认证提交的入口 | [1] |
| Certification（认证） | 见③。提交→平台方测试→通过/驳回 | [5][6] |
| **Gold master** | 认证通过的最终版作为「生产母盘」，用于复制分发（final build used as the master for production，Bethke p.295）；源自光盘压制时代术语 | [1][2] |
| Ship / Launch | 上市；live-service 则进入持续运营 | — |
| Post-launch / Live ops | 见④ | [7][8] |

**feature complete / content complete / code complete 三者辨析（通行语义）**：feature complete＝所有**功能**做齐但资产可未齐（≈alpha 出口）；content complete＝所有**内容资产**（关卡/剧情/美术/音频）做齐，与 feature complete 合并即 beta 入口；code complete＝代码不再新增、只修缺陷（≈code freeze）。注意各家合同定义有出入（Bethke「无行业标准」）[1][2]。

---

## ② 里程碑词汇表

- **First playable（首个可玩版）**：具有代表性玩法与资产的第一个版本，主要玩法元素首次以可玩形式运转；约在 code release 前 12-18 个月出现；也被称作 **pre-alpha**（Chandler 2009 p.244-245；Bethke 2003 p.293）[1][2]。
- **Proof of concept（概念验证）**：早期文档/原型阶段术语，验证概念成立（Bates 2004 p.204；Moore & Novak 2010 p.70 称 technical review）[1][3]。
- **Vertical slice（垂直切片）**：
  - 软件工程通用义：纵向贯穿所有架构层（数据层/逻辑层/UI 层）把**一个功能**完整做通的工作切片，Scrum 用语；该词条自述「可能起源于游戏业」（单源、软件语境）[9]。
  - 游戏业用法（以实证案例呈现）：小段**接近成品质量**的完整玩法样本，用来验证美术规格、玩法手感与制作成本估算，常作为 pre-production 出口/发行商 go-no-go 门禁的评审物。**个案**：Firaxis 的 XCOM 重启项目 2009-08-23 完成 vertical slice，评审发现「核心粉丝向、过度复杂、不好玩」，Jake Solomon 团队**整块丢弃从头再做**，五年磨成《XCOM: Enemy Unknown》(2012)——vertical slice 的 go/no-go 作用与「推翻成本」俱见于此[10]。
  - 缺口：未取得游戏业 vertical slice 的一手定义文章（见⑧），此词条定义部分依赖软件义+案例反推，慎引。
- **Milestone（里程碑，商务机制）**：发行商与开发商合同里的**付款节点**——开发商按里程碑交付物领取预付版税（advance against royalty）；里程碑清单 3-20 条，双方协商拟定、可替换调整，写进法律合同；**无行业标准定义**（Bethke 2003 p.192，教科书口径）[1][2]。
- **Greenlight / go-no-go 门禁**：两层。①发行商绿灯：pitch→concept approval→（若干里程碑后）production 全额立项；里程碑付款结构本身就是分期 go/no-go（每里程碑验收合格才付款）[1][2]。②平台方门禁：主机概念批准（Chandler p.90）[1]；上架前认证（③）。当代 PC/数字分发（Steam 等）无强制平台门禁，商店上架门槛低（通行认知，未单独取证）。

---

## ③ 主机认证（Certification）

- **三元组（通行术语）**：Sony **TRC**（Technical Requirements Checklist）、Microsoft **XR**（Xbox Requirements，早期称 Technical Requirements Checklist/Xbox Requirements）、Nintendo **Lotcheck**（官方称 guidelines）[5]。
- **XR 是什么（平台方一手文档，已公开）**：Microsoft 将 XR 定义为 policies+technical+product component requirements——所有 Xbox 开发者/发行商必须遵从的要求集合，覆盖 Xbox One、Series X|S、xCloud 与 PC；当前版本 v16.4（2026-09-08）[6]。哪些 XR 会被认证测试带星号标注并有**公开测试用例清单**，公开「认证失败 TOP 10 测试项」与逐版变更历史[6]。
- **认证流程（一手）**：Certification 团队在 **CERT sandbox 用零售机**对 Final submission 做测试（可选提交在 CERT.DEBUG/开发机）[6]。
- **代表性 XR 条款（一手）**：XR-001 Title Stability（须 promptly 启动、保持响应、优雅退出、处理异常）；**XR-003 Title Quality for Submission**——提交认证时游戏必须 fully functional **and testable**（含全部客户端代码与 DLC），附干净的 Submission Validator 运行日志，无崩溃/死机/不可玩的帧率/卡进度的 bug；XR-013/014/015 账户/PII/通信；XR-018 UGC；XR-055/057 成就与 Gamerscore；XR-117 Game Preview/beta 须明示[6]。
- **何时介入**：code release 后、gold master 前（RC→提交认证→通过→压盘/上线）[1][5]。
- **失败后果**：任一违规可整单驳回→修复→重测重交，产生额外成本并可能错过发售档期，损失更大（Wikipedia Game testing 综述，教科书语境）[5]。认证测试之外还有 **ESRB/PEGI 分级合规**：内容不达标须改内容重测重交[5]。
- **文档公开性（2026-10-13 直查验证）**：Microsoft XR 全文公开于 learn.microsoft.com（上列一手）；**Sony** partners.playstation.net 为 Okta 登录壳、TRC 文档仅注册开发者可见；**Nintendo** developer.nintendo.com 为 JS SPA，lotcheck 材料在注册登录墙内。即：三家中只有 Microsoft 全公开[5][6]。

---

## ④ 上市后节奏（Post-launch / Live ops）

- **通行形态**：patch（修复/平衡）→ 免费内容更新 → 付费 DLC/扩展 → 季票/战斗通行证（season pass/battle pass）→ live-service 赛季制持续运营。
- **个案（有据）**：
  - *Cyberpunk 2077*（CDPR，官方口径）：2020 上市后持续投入，Update 2.0 升级+DLC《Phantom Liberty》(2023) 使总投入升至 ~4.4 亿美元档（原作开发 $174M+营销 $142M，CDPR 官方投资材料）[11]。
  - *Stardew Valley*（独立）：上市后长期**免费**内容更新线（2024 年仍推 1.6，先 PC 后同年 11 月主机/移动），从单人开发过渡到小团队持续维护[8]。
  - *Fortnite Battle Royale*（live-service 赛季制标杆）：以**章节(chapter)+赛季(season)**组织「活的背景叙事」——每赛季更迭岛屿、玩法与外观内容；季票=Battle Pass（V-Bucks 购买，按 XP 升 tier 解锁外观）；商城外观轮换（rotating Item Shop）；上线后不断引入新常驻模式（Zero Build 等）；其开发史本身就记录了向 games-as-a-service 的转向[7]。
  - 手游 live-ops 的前置形态是 **soft launch**（见⑤）：全球上线本身即 live-ops 起点，运营 KPI（留存/变现/UA）在软启动期就已在管理[12]。
- 持续投入的量级：Star Citizen 自 2013 年持续开发至今无最终发售日（ongoing 成本）[11]；《Horizon Forbidden West》与《The Last of Us Part II》开发成本各约 **$200M**（2023 年 Sony 官方幻灯片意外披露，GamesRadar 报道）[11]——live-service/大作时代「开发成本」与「持续运营成本」边界模糊。

---

## ⑤ 规模差异（AAA / 独立 / 手游 / Jam）

- **AAA**：百人以上全职团队做单项目（"a team of over a hundred people can be employed full-time for a single project"，Chandler 教科书口径）[1]；发行商出资、里程碑付款、平台认证全流程适用；典型周期 3-5 年（Wikipedia 该句挂 citation-needed，以案例佐证：Cyberpunk 2077 全面制作约 2016-2020[11]、XCOM 重启 2007-2012[10]）。
- **独立（indie）**：个人或小团队、**无大规模开发商/发行商从属关系**，依赖互联网数字分发（Xbox Live Arcade、Steam，今加 itch.io 等），常以 mods 起家；早期成功案例 Braid/World of Goo/Minecraft（McGuire & Jenkins 2009 p.27、Moore & Novak 2010 p.272、Bates 2004 p.252，教科书口径）[3]。个案：*Stardew Valley* 由 Eric Barone(ConcernedApe) **一人**（程序+像素美术+音乐音效全包）开发 **5 年**（2012 公布-2016 上市，Gamasutra 专访），且刻意不进 Steam Early Access[8]。1980 年代单程序员约 6 周可出一款游戏（历史对照）[3]。
- **手游（soft launch 机制，一手访谈）**：全球上线前在小市场限量发布测数据。Google Play 官方提供的软启动形态：**closed testing / open testing / pre-registration**，外加商店素材实验（icon/截图/视频/描述 A/B）与同品类基准（peer benchmarking）[12]。**Wooga《Switchcraft》完整软启动阶段模型（个案，游戏总监 Annelie Biernat 自述）**：validation release（验证玩法循环/主题假设）→ production → technical soft launch → 发现留存不达标→**停 UA 重做 FTUE**（首次用户体验流）→ 主攻 D30 留存数月 → 达标后进入 **dress rehearsal**（上线彩排）→ global launch；软启动期核心 KPI：**留存第一**（D1/D7/D30），其余核心 KPI（变现/UA 可扩性）后置；软启动期团队 35-40 人，UA/营销投入已超团队与经常性开支[12]。手游开发周期数月级 vs 主机 3-5 年（2012 年欧盟 Mobile Game Arch 研究口径，年代较早）[3]。
- **Game jam / prototype-first 文化**：game jam＝限时从零做游戏，常见 24/48/72 小时、1-2 周或一个月；**Global Game Jam** 每年 1 月末举办、100+ 国家 800+ 线下站点；Ludum Dare 为线上虚拟 jam；部分 jam 作品成长为正式商业游戏[13]。jam 是 prototype-first 文化的制度化体现（通行认知+词条口径）。

---

## ⑥ 实际时间与成本量级（公开数字，均带来源与年份）

**开发预算（美元，名义值）**：

| 年份 | 案例 | 数字 | 来源 |
|---|---|---|---|
| 1990 前 | 行业平均 | $1-5M | Kotaku 2014 [3] |
| 1997 | FF7 开发 | $40-45M（含营销 $80-145M） | Washington Post 2020 / Eurogamer 2013 [3] |
| 1999 | 莎木 | $47-70M | Guardian 2015 [3] |
| 2010 | 多平台平均 | $18-28M；大作常超 $40M | develop-online 2010 研究 [3] |
| 2014 | Destiny 总成本 | $140M | [11] |
| 2017 | 行业平均（250+ 样本） | ~$100M；预算约每 5 年翻倍 | Raph Koster 2017 分析 [3] |
| 2020 | Cyberpunk 2077 | 开发 $174M+营销 $142M | CDPR 官方 [11] |
| 2023 | HFW / TLOU2 | 各 ~$200M（开发） | Sony 幻灯片，GamesRadar 2023 [11] |
| 2023 | Monopoly Go! | 总成本 ~$1,000M（UA 为主） | [11] |
| 2026 | GTA VI（传闻） | ~$1B（rumored，未官方证实） | Hollywood Reporter 等 [11] |

- 营销预算常与开发预算同量级（Keogh 2019，Creative Industries Journal）[3]；2020s 初平均预算 $200M+（Koster 2017 外推）[3]。
- **时间**：主机/PC 现代大作 3-5 年（Wikipedia 挂 CN，佐证案例见⑤）；手游数月（2012 欧盟研究）[3]；独立：solo 5 年（Stardew，个案）[8]；1980s 单人 6 周[3]。
- **团队规模**：AAA >100 全职[1]；手游软启动期 35-40 人（Switchcraft 个案）[12]；独立可 1 人[8]。

---

## ⑦ 来源清单

1. Chandler, Heather Maxwell. *Game Production Handbook*（2009 版；p.90/p.244-245/p.xxi）——经 Wikipedia「Video game development」Milestones 节**页码级转引**，原书未直接查阅（见⑧）。
2. Bethke, Erik. *Game Development and Production*（2003；p.75/p.192/p.293-295）——同上，页码级转引。
3. Wikipedia「Video game development」（作索引用；其引用含：Kotaku 2014-01-15、Washington Post 2020-04-04、Eurogamer 2013-06-02、Guardian 2015-05-02、Raph Koster 2017 预算分析、develop-online.net 2010-01-11 研究〈Study: Average dev costs as high as $28m〉、Mobile-Game-Arch D3.1 2012、Keogh 2019、McGuire&Jenkins 2009/Moore&Novak 2010/Bates 2004 教科书页码）. https://en.wikipedia.org/wiki/Video_game_development
4. Wikipedia「Game testing」Compliance testing 节（TRC/XR/lotcheck 术语与驳回后果；部分句挂 citation-needed）. https://en.wikipedia.org/wiki/Game_testing
5. 直查验证（2026-10-13）：partners.playstation.net（Okta 登录壳）；developer.nintendo.com（注册墙）。
6. Microsoft GDK 官方文档（平台方一手）：Xbox Requirements v16.4（2026-09-08）: https://learn.microsoft.com/en-us/gaming/gdk/docs/store/policies/console/certification-requirements ；认证测试 v16.5（2026-10-13）: https://learn.microsoft.com/en-us/gaming/gdk/docs/store/policies/console/console-certification-requirements-and-tests
7. Wikipedia「Fortnite Battle Royale」（作索引；含 Epic 开发史与赛季/商城结构引用）. https://en.wikipedia.org/wiki/Fortnite_Battle_Royale
8. Wikipedia「Stardew Valley」Development/Post-release 节（转引 Gamasutra 专访、GamesRadar 2024）. https://en.wikipedia.org/wiki/Stardew_Valley
9. Wikipedia「Vertical slice」（软件工程语境，单源）. https://en.wikipedia.org/wiki/Vertical_slice
10. Wikipedia「Jake Solomon」（XCOM vertical slice 2009-08-23 完成后推翻重做，转引开发者访谈）. https://en.wikipedia.org/wiki/Jake_Solomon
11. Wikipedia「List of most expensive video games to develop」（转引：CDPR 官方投资材料、GamesRadar 2023-06-28、Hollywood Reporter 等）. https://en.wikipedia.org/wiki/List_of_most_expensive_video_games_to_develop
12. Katkoff, Michail. "How Wooga's Switchcraft Aced the Soft Launch!" Deconstructor of Fun，2022-03-27（Wooga 游戏总监 Annelie Biernat 与 Google Play BD Aaron Hiscox 访谈，行业一手自述）. https://www.deconstructoroffun.com/blog/2022/3/27/how-woogas-switchcraft-aced-the-soft-launch
13. Wikipedia「Game jam」（转引 Global Game Jam 官方数据）. https://en.wikipedia.org/wiki/Game_jam

---

## ⑧ 未能访问 / 缺口清单

1. **搜索引擎全部不可用（本会话）**：Bing HTML 经代理出口返回罐头结果（与查询无关，`site:`/`mkt=`/RSS/换 UA 均无效）；Mojeek 拦截页；Ecosia 需 JS；DDG 按任务禁用。→ 改为直攻一手域名+Wikipedia API 当索引。
2. **GDCVault 匿名搜索失效**：`search.php?q=` 忽略查询参数（多查询返回同一固定列表）；GDC 官方新闻室 `gdconf.com/news-insights/` 可直抓但未见 vertical slice 专文。GDC 演讲作为里程碑信源缺口。
3. **Sony TRC / Nintendo lotcheck 原文不可得**：均为注册/登录墙内文档（2026-10-13 直查验证）；相关结论只有 Wikipedia「Game testing」二手综述（其保密性陈述挂 citation-needed，与我直查的墙体验互证）。Microsoft XR 是三家中唯一全公开的，Sony/Nintendo 认证细节属**未证实区**。
4. **Chandler/Bethke 教科书原文未直接查阅**：页码级引用来自 Wikipedia 转引（页码与措辞可信度中等）；出版方目录页（Routledge 等）本轮未抓取。
5. **Vertical slice 游戏业定义缺一手文章**：Game Developer（gamedeveloper.com）直连 403，Wayback CDX 按 slug 检索未命中目标文章（http/https 与通配符坑已排除）；现以软件义+XCOM 实证案例支撑，定义引用请谨慎。
6. 未取证项：Steam/当代数字商店上架门禁；Xbox 现行 concept approval 政策（历史 GA/CAP 已废）；Fortnite 赛季精确时长（避免无源数字）；Genshin 六周版本节奏（抓取材料中无可靠句，弃用）；GTA V 团队规模/周期细节。
7. Wayback availability API 429 限流（快照可用性查询受阻）；CDX 需 `https://` 且通配符仅支持结尾 `*`。
