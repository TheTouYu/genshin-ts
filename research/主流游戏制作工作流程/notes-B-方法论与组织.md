# notes-B：主流游戏开发方法论与组织模式（行业调查B）

> 调查问题：主流游戏工作室用什么方法论与组织模式开发游戏？无管理/cell 制/多工作室网络各自如何运作？
> 方法：已知域名直抓一手源（官方 PDF/官网/Wayback 取回的历史原文）+ Wikipedia 当索引转引带出处的二手源。
> 信源等级：**[一手]** 官方原文/本人署名；**[二手]** 媒体报道/访谈（注明出处）；**[转引]** 兄弟调查线笔记转引；**[待补]** 未取到。
> 抓取环境：代理 127.0.0.1:7890；Bing 已死（罐头结果）；Wayback CDX 必须 https。暂存目录 `research/主流游戏制作工作流程/.tmp/`。

---

## 1. 方法论谱系：瀑布/里程碑 → 敏捷/看板 → live-ops

**瀑布与里程碑（主机时代主流，至今仍是发行商商务骨架）**[转引，经调查A笔记]
- 行业教科书 Bethke《Game Development and Production》(2003, p.192)：「无行业标准里程碑定义，随发行商/年份/项目而变」；里程碑是开发商收款节点（advance against royalty，一份合同 3–20 条不等）。
- Chandler《Game Production Handbook》(2009, p.244-245)：first playable / alpha / beta / code freeze / code release / gold master 各有定义。
- 立项→垂直切片→alpha→beta→gold 的阶段骨架即从这套合同机器里长出来；主机认证（如 Microsoft XR 表）是外部的硬关卡（调查A线已取 GDK 认证文档）。

**敏捷进入游戏业**[待补一手，书目事实]
- Clinton Keith 在 High Moon Studios 引入 Scrum，后成为游戏业首位认证 Scrum 培训师，著《Agile Game Development with Scrum》(Addison-Wesley, 2010)——游戏敏捷的标准书目。其博客 clintonkeith.com 本轮 403，未能取一手过程叙述。
- 游戏业的敏捷变体惯例（两周 sprint、以"可玩构建"为迭代单元、燃尽图）在各大厂 GDC talk 中反复出现，但本轮未取到单一权威一手文本，标[待补]。

**看板与 live-ops**[一手-报告宣传页]
- GDC Insights 报告《Redefining Live Service: From Monetization to Community》（gdconf.com/article/navigating-live-service-...，免费下载）汇集 SOTI 数据+专家访谈（含前 Nexon CEO Owen Mahoney）；报告确认 live service 团队已成行业主流工作形态之一。具体看板实践细节[待补]。
- Supercell 长线运营团队用小团队+数据迭代（见 §3）。

**原型先行（Cerny 式）**[口传方法论，无本轮一手]
- 业界口传的 "Cerny method"（先做可玩原型验证核心乐趣再立项、尽早砍功能）与下述 Cabal（§2）同构：先找 fun 再扩张。标注为方法论谱系位置参考，不当数据引用。

---

## 2. Valve：无层级自组织（Flatland + Cabal）[一手]

来源：Valve Handbook for New Employees（官方 PDF，`https://cdn.fastly.steamstatic.com/apps/valve/Valve_Handbook_LowRes.pdf`）；Ken Birdwell《The Cabal》(Gamasutra 1999-12-10，Wayback 全文取回)。

**组织结构**
- "Flatland"：无管理者、无人向任何人汇报；员工"vote with projects with their feet (or desk wheels)"（用脚/桌轮投票选项目）。
- Cabal：多学科临时项目团队，自组织形成，贯穿公司史。
- "Team lead"不是管理者，是 "clearinghouse of information"（信息清算所）。
- Handbook Hours 节反加班立场原文："working overtime for extended periods indicates a fundamental failure in planning or communication"。

**Cabal 过程（HL 开发史，方法论化石）**
- HL 原定 1997-11 发售，首版平庸推翻重来，实际 1998-11 发售。
- 找不到"神级游戏设计师"→ 组建 Cabal：初始 6 人=3 工程师+1 关卡设计师+1 作家+1 动画师，**无专职设计师、人人有交付件**。
- 节奏：每周 4 天 × 6 小时 × 5 个月（刻意不搞长会日）；至少 5–6 人防讨论停滞；每月轮换成员防倦怠。
- 产出 200+ 页设计文档；playtest 纪律=外部志愿者玩 2 小时、观察者禁言。
- 理论遗产：experiential density（体验密度）、player acknowledgment（玩家被承认感）。

---

## 3. Supercell：cell 制（公司内的公司）[一手]

来源：Ilkka Paananen 2022 年度信《Best Days Ahead?》（supercell.com/en/news/best-days/）。

- 核心制度引文："fully independent game teams (or cells as we sometimes call them)"；团队独立性 "sacred in Supercell's culture – that's the number one reason we founded the company in the first place"。
- 领导层职责定义："the role of leadership is to put together the best teams, but then fully trust them and not to tell them what to do"；cells = "fully independent companies inside the larger company"。
- 小团队论证："Small teams innovate, take bigger risks, and move faster as there are less cooks in the kitchen and less process"——并归功于 5 款 hit 游戏。
- 2022 年自我修正（罕见的一手反思）：fully independent + 高野心 + 小团队 + 疫情远程 → 团队健康问题；章节标题自认 "DOING MORE VS SMALL TEAMS – AND MY BIG MISTAKE"。
- 命名反转：公司名 Supercell=「超级细胞」，组织即细胞集合；决策权在 cell 不在中心（"倒金字塔"叙事的原始出处之一）。

---

## 4. 小团队样本：Double Fine / Supergiant / Naughty Dog

**Double Fine： jams 分化出的联邦制小队**[一手官网 + 二手 Wikipedia 引 GDC Vault]
- 官网 about（Wayback 取回）：Amnesia Fortnight = "a two-week long period resembling a game jam where anyone can pitch a game and the studio works on the most popular submissions"，期间 "the team spends two weeks leaving all other work behind"。
- 起源（Wikipedia 综述）：Psychonauts 与 Brütal Legend 商业不及预期后，靠 AF 原型扩成的小品救了公司；此后 AF 以玩家投票机制复办。
- 结构：2011 年起公司拆成约 15 人/队的多支团队，**每队可独立完成小游戏**；大作（如 Psychonauts 2）临时合并两支以上团队。GDC talk《Creative Panic: How Agility Turned...》(gdcvault.com/play/1015662)。
- 工会化：2026-05-07 向 CWA 提交工会申请（Aftermath 报道，Microsoft 体系工会潮的一部分）[二手]。

**Supergiant Games：25 人做出 GOTY 级**[二手，引 Game Informer 2024-05《One More Run: The Making and Mythology of Hades II》p.38-49]
- 2009 年 Amir Rao 与 Gavin Simon 创立于旧金山；2024 年仅 25 人（Hades II 制作期）。
- 方法论特征：全员多面手 + 迭代式 EA（Hades 2018 EA→2020 1.0，用早期玩家反馈当外部 playtest）。crunch 立场无一手文本，[待补]。

**Naughty Dog：从"无制作人"到制作人团队**[二手，出处明确]
- 2011 年 IGN 报道标题即立场：《Naughty Dog: no producers, no management, 'just us working as a team'》——全才型扁平组织，一度无设计文档传统（同报道口径）。
- 转折：约 2021 年开始组建制作人团队，**2022 年达 17 名制作人**，目的明确=对抗 crunch（Bloomberg/Schreier 2022-07-22《Sony's Naughty Dog Studio Finally Has a Team of Producers》）。
- 意义：小团队全才扁平的标杆厂也承认规模化后需要专职流程角色——与 §7 crunch 数据互证。

---

## 5. Ubisoft：全球多工作室网络[二手-维基引官方口径]

- 发行商总部 Saint-Mandé（巴黎都会区），"development studios across the world"；1996 年 IPO 后两年内连设 Annecy(1996)/Shanghai(1996)/Montreal(1997)/Milan(1998)。
- 结构特征：旗舰 IP（Assassin's Creed 等）由 3A 工作室群合作开发（lead studio + 协作工作室制），Montreal 为最大节点；1000+ 人用 Perforce 管理资产（Perforce 官方案例页，转引调查C）。
- 本轮未取到 Ubisoft 官方的 co-dev 流程自述（news.ubisoft.com 已 React 化，wp-json 不可用），标[待补]；工作室清单与年份以 Wikipedia Ubisoft 条目及其引注为准。

---

## 6. Riot Games：价值观文化与 2019 危机[一手+二手]

- 官方价值观页 who-we-are（riotgames.com/en/who-we-are，直抓）：五条=Player First / Serious About Games / Dream and Deliver / In for the long term / One Riot；"Everything we do is in service of players"；规模口径："over 4,500 Rioters across more than 20 offices"。
- 2019 危机链（Wikipedia 条目引注）：Kotaku 起底性别歧视文化 → 2019-04 员工 walkout（Vice/Waypoint 2019-04-29 报道，官方以 town hall 回应）→ 2019-08 和解方案 → 2019-12 落定至少 1000 万美元赔偿（LA Times 2019-12-02）。
- 教训样本：强价值观文化不等于健康流程；"no crunch" 声明与实际加班文化的落差是行业通病（与 §7 数据互证）。Riot 工程文化旧文（technology.riotgames.com）Wayback CDX 前 150 条 URL 无 culture/agile/process 文，[待补]。

---

## 7. Crunch 与制作人角色：IGDA DSS 时间序列[一手]

来源：IGDA Developer Satisfaction Survey 2017(引注)/2019/2021/2023 + 2021 COVID 专版（igda.org/dss/，S3 直链 PDF）。

**发生率（"job involves crunch time"）逐年降：**
| 年 | 卷 | 另有长时加班不自称 crunch |
|---|---|---|
| 2017 | 51% | 44% |
| 2019 | 41% | 35% |
| 2021 | ≈1/3 | 22% |
| 2023 | 28% | 25% |

**但卷者频率反向升**（crunch 者"过去两年 >2 次"占比）：2019≈36% → 2021=58%（雇员）→ 2023=63%（雇员；自由职业 64%、自雇 75%）。2021 报告明说疫情期间"近期 crunch 人数近翻倍"，归因 WFH 低效+心理健康。

**强度与补偿（2019）**：crunch 周工时 50-59h=38%、60-69h=19%、>70h=13%、45-49h=17%；34% 零补偿，仅 8% 带薪加班（其余以餐食 33%/调休 25% 等形式）。2023：crunch/长时中 30% 周工时>60h。

**自由职业更糟（2019）**：34% crunch、56% 认为"客户期待 crunch 是正常"、20% crunch 周工时 ≥70h。

**制作人角色**：IGDA 各年 DSS 均按职能统计 producers 占比；组织侧最锋利的一手证据是 ND 案例（§4）：无制作人→17 名制作人抗 crunch。行业口径：producer=排程/依赖/风险/跨组沟通，owner of the schedule（Chandler 教科书口径，转引调查A）。

---

## 8. 远程办公趋势[一手：IGDA DSS 2021 COVID 专版]

来源：IGDA-DSS-2021-COVID-Report（2021-02-15~04-12 问卷；igda.org S3 直链）。报告自称与 GDC SOTI 2020: Working from Home Edition（2020-08 调查）互补。

- 疫情前：平均 28% 时间 WFH，31% 从不 WFH。
- 疫情中：平均 91% 时间 WFH，69% 全程 WFH。
- 区域分化：欧洲 95% 纯 WFH / 加拿大+美国+拉美 77% / 大洋洲 71% / 亚洲分化大（西亚 43%、东南亚 57%、南亚 67%、东亚仅 27%）。
- 后疫情 hybrid/远程比例的当前数字[待补]：SOTI 2026 文章正文 JS 渲染、DSS 2023 无远程题。GDC 2026 Trends Report（gdconf.com/article/2026-gdc-trends-report-...）是下一个候选源。

---

## 9. 工会化与劳动趋势（跨线汇总）

- GDC SOTI 2026（一手，经调查C线）：**82% 美国受访者支持工会化**；28% 过去两年被裁。
- Double Fine 2026-05 提交 CWA 工会申请（§4）；Riot 2019 walkout+1000 万美元和解（§6）；ZeniMax/Raven 等 Microsoft 体系先例（背景知识，未本轮取证）。
- 与 crunch 数据（§7）合读：加班发生率降但卷者更卷+裁员潮，是工会化的直接土壤。

---

## 10. 信源清单（全部本轮实测可达，除标注外）

**一手：**
1. Valve Handbook LowRes PDF — cdn.fastly.steamstatic.com/apps/valve/Valve_Handbook_LowRes.pdf（publications 页列出）
2. Ken Birdwell《The Cabal》Gamasutra 1999-12-10 — Wayback 全文（.tmp/cabal-wayback.html）
3. IGDA DSS 2019/2021/2023 + COVID 专版 PDF — igda.org/dss/ 页列 S3 直链（.tmp/dss20*.txt）
4. Ilkka Paananen 2022 年度信 — supercell.com/en/news/best-days/（.tmp/ilkka-bestdays.html）
5. Riot who-we-are 官方价值观页 — riotgames.com/en/who-we-are（.tmp/riot-who.html）
6. Double Fine about（Amnesia Fortnight 官方定义）— Wayback 取回（.tmp/df-about.html）
7. GDC 新闻室 live-service 报告宣传页 — gdconf.com/article/navigating-live-service-expert-interviews-and-industry-data-in-gdcs-latest-report/

**二手（出处明确）：**
- Wikipedia: Naughty_Dog（引 IGN 2011《no producers, no management》+ Bloomberg 2022-07-22 Schreier）、Double_Fine（引 GDC Vault play/1015662 + Aftermath 2026-05-08）、Supergiant_Games（引 Game Informer 2024-05）、Ubisoft、Riot_Games（引 Vice 2019-04-29 + LA Times 2019-12-02）——Wikipedia API action=parse wikitext 取回（.tmp/wiki-*.json）
- 调查A笔记：Bethke 2003 / Chandler 2009 页码级定义；调查C笔记：SOTI 2026 数字、Perforce Ubisoft 案例

**缺口（后续轮次候选）：**
- 敏捷游戏开发的一手过程叙述（Clinton Keith 博客 403；可试 Wayback）
- 看板/live-ops 运营细节（GDC Insights 报告 PDF 正文待下载）
- Ubisoft 官方 co-dev 流程自述（React 站，需浏览器或 Wayback）
- Supergiant crunch 立场一手；Riot 工程文化旧文；后疫情远程比例

---

## 11. 对本项目的启示（千星 2D+Lua 小游戏开发）

1. **Cabal 式小团队**与我们的 AI+用户协作同构：多学科小队（策划/实现/测试）、人人有交付件、定期轮换防固化——单 agent 长任务应显式分阶段轮换视角。
2. **先原型找 fun 再扩张**（HL 一个月单关原型 / AF 两周 jam / EA 迭代）：与我们"HTML 效果展示先行"七步法一致，坚定执行。
3. **playtest 纪律**（观察者禁言、固定时长、外部志愿者）：模拟器试玩可复用——先收集行为再问感受。
4. **里程碑=商务机器**：个人项目可借用骨架（first playable/alpha/beta/gold）但别让合同式里程碑替代"fun 验证"。
5. **反加班不是道德口号是工程信号**（Valve：长期加班=计划或沟通失败）：AI 长任务同理——反复出现"赶工"式修复轮，说明排期/范围管理有病，该砍范围而不是加轮次。
