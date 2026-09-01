# R5 规则与裁判（Rules & Referee）

> 调研日期 2026-09-01。覆盖：FC24/FC25（官方 Deep Dive 裁判系统/操作表指令）+ FIFA23 官方（定位球系统重做/AI 越位意识）+ eFootball（点球机制深度教学）+ 真实世界规则（IFAB/FIFA 2026 新规、Law 11）。
> **域定位说明**：笼式规则（CONTEXT.md）明文豁免越位/犯规/界外球/角球/球门球——本域调研目的不是还原，而是①记录豁免的代价与合理性边界②为未来可选模式（点球大战/犯规判罚）留参照。
> 来源质量分布：官方 5 条 / 真实规则机构 3 / 深度教学 1 / 社区 2。

## 机制条目

### R5.M1 越位判定（判定时刻=传球瞬间）

- **机制描述**：真实规则 Law 11：越位判定以**传球触球瞬间**进攻方队员位置为准（非接球瞬间）；游戏内同口径实现。FIFA23 官方新增 AI 越位意识（Better Offside Awareness）：AI 前锋更少越位、**临近越位线时会压住跑动（hold runs）、单刀时保持在持球者身后**；FC25 TU8 官方进一步：AI 队友在越位线附近更好压线、回撤更快。
- **关键数值**：越位判定延迟（传球瞬间快照→判罚）：未查到公开数据。
- **来源**：[The FA Law 11](https://www.thefa.com/football-rules-governance/lawsandrules/laws/football-11-11/law-11---offside)（真实规则机构）+ EA 官方 FIFA23 Deep Dive（官方）+ [EA TU8 补丁内容](https://www.psu.com/news/ea-sports-fc-25-title-update-8-brings-major-gameplay-refresh-with-changes-to-ai-goalkeeping-shooting-more/)（官方转载）。
- **引擎映射**：**【可还原】**（若未来加越位）——kick 信号时刻对全部 8 槽位做位置快照（图变量），比较"接球方向前 X 米内是否有己方队员先于倒数第二名防守者"，规则图一条判定链；AI 压线行为不可还原（无 AI 跑位）。**当前设计豁免**（笼式无越位）——豁免合理性：4v4 小场+围栏反弹下越位收益已极低（真实系室内 5 人制足球同样无越位，官方规则如此）。
- **差异提示**：无需动作；五人制先例支持豁免决策。

### R5.M2 半自动越位技术（SAOT）

- **机制描述**：真实世界杯 2022 起用半自动越位（球内传感器+肢体跟踪，自动生成 3D 判罚动画）；FC25 社区报道 EA 可能引入英超同款技术表现。
- **来源**：[realsport101 FC25 半自动越位传闻](https://realsport101.com/article/fc-25-premier-league-offside-technology)（泛媒体，未证实）+ [Yahoo 世界杯越位规则解析](https://sports.yahoo.com/soccer/article/world-cup-2026-how-does-soccers-offsides-rule-work-165617440.html)（真实数据机构）。
- **引擎映射**：**【不可还原】**（判罚动画/肢体跟踪）/**【可还原】**（判定本身，见 M1）；缺的是 3D 回放表现层。
- **差异提示**：与 M1 同归"未来可选"。

### R5.M3 裁判严格度分级与犯规判定系统（FC24 官方重做）

- **机制描述**：FC24 官方规则系统重做：**裁判严格度等级产生更明显的判罚差异**（不同严格度对越位、拉拽及其他违规判罚不同）；新物理系统改善铲球判定的准确度；越位逻辑与"最后一名防守者（last man）"情境决策改进。
- **来源**：[EA 官方 FC24 Gameplay Deep Dive（瑞典语版对应段落）](https://www.ea.com/sv-se/games/ea-sports-fc/news/fc-24-gameplay-deepdive)（官方）。
- **引擎映射**：**【不适用】**（笼式无裁判/犯规）——但"严格度=参数化判罚倾向"的设计思想可借鉴：对抗类参数（抢断概率/铲球成功率/压迫强度）打包成"对抗强度"表，房间级可选（休闲/竞技两档），实现成本≈0。
- **差异提示**：可选的房间模式差异（对抗强度档位）值得讨论。

### R5.M4 有利原则（Advantage）

- **机制描述**：犯规后裁判可手势示意"有利"让进攻继续（若进攻无果不再回吹）；FC25 操作表存在官方指令 **Cancel Foul Advantage**（玩家可主动放弃有利要求判罚）。
- **来源**：[fifauteam FC25 操作表](https://fifauteam.com/fc-25-controls/)（官方指令名）。
- **引擎映射**：**【不适用】**——无犯规即无有利原则；围栏反弹连续比赛本身就是"永不吹停"的极致形态（笼式的天然优势：节奏不中断）。
- **差异提示**：无。

### R5.M5 红黄牌与惩罚体系

- **机制描述**：黄牌（警告）→ 两黄变红 → 红牌罚下（少人作战）；大赛另有累积黄牌停赛规则。
- **来源**：[USA Today 2026 世界杯红黄牌规则](https://ftw.usatoday.com/story/sports/soccer/worldcup/2026/06/23/world-cup-red-card-yellow-rules-suspension-explained/90657349007/) + [Britannica 红黄牌词条](https://www.britannica.com./sports/What-Are-Yellow-and-Red-Cards-in-Football)（真实规则机构）。
- **引擎映射**：**【不可还原】**（规则豁免：无犯规无牌）——若需要"恶意铲球惩罚"的等价物，草稿 D6 的失败硬直（−70% 移速 1.2s）已承担"高风险代价"语义；更重的"累计惩罚"（如连续失败铲球 CD 翻倍）可讨论但非必需。
- **差异提示**：保持豁免。

### R5.M6 点球（含扑救心理博弈）

- **机制描述**（eFootball，深度教学）：主罚三步=摇杆定方向（四角或中路）→**按住蓄力（推荐 1/2~3/4 格，打下角可比打上角蓄更多力）**→松手出球，弹道固定由方向+力度决定；Panenka（L1+轻力度）勺子点球弹道飘忽难扑；门将侧：罚球前可**沿门线横移做心理战**、扑救时机按预判球速选择（快球=助跑时早扑、慢球=出脚瞬间才扑）、方向须推满且推对角区（推"左"不够，须"左下"）；关键能力：Set Piece Taking（点球精度）/Kicking Power/Penalty Specialist 技能卡。
- **关键数值**：推荐力度 50%~75%（社区教学口径）。
- **来源**：[PES Mastery eFootball 点球教学](https://pesmastery.com/efootball-penalty-kick-tutorial/)（深度教学）。
- **引擎映射**：**【可还原】**（作为可选模式）——点球=KICKOFF 状态变体：球定点罚球点、主罚者蓄力踢（V/θ 由力度）、GK 扑救（真人横移+扑救技能 / AI 猜方向概率）；全部复用现有技能与判定通道，规则图加一个 PENALTY 相位即可。END 平局点球大战是最自然的挂载点（4v4 轮流主罚）。
- **差异提示**：当前规则"5 分钟平局即平"——点球大战是低成本高戏剧性的可选扩展，建议列入 v2 讨论。

### R5.M7 任意球（直接/间接 + 人墙 + 四型踢法）

- **机制描述**：FIFA23 官方重做定位球系统：左摇杆转镜头选方向，**右摇杆控制球后准星=弧度+高度+踢法类型**，前几米弹道预览线；FC25 任意球四型：Curve（弧线）/Loop（落叶）/Outside（外脚背）/Knuckle（无旋转飘球），按球员能力调整力度刻度；人墙自动排布（可微调）。
- **关键数值**：FC25 curve 型经验力度 3~3.5 格（社区）。
- **来源**：EA 官方 FIFA23 Deep Dive（官方）+ [anythinginterest FC25 任意球](https://anythinginterest.com/fc-freekick)（社区）。
- **引擎映射**：**【不适用】**（笼式无任意球）——若未来加"违规→任意球"模式：瞄准系统可简化为"朝向=方向、蓄力=力度、技能=四型踢法参数行"，与现有踢球表同构；人墙=站位判定半径集合。
- **差异提示**：不建议引入（破坏"永不出界连续比赛"核心体验）。

### R5.M8 角球

- **机制描述**：FIFA23 官方：角球与任意球共享重做的瞄准系统；FC25 TU8：角球被解围发起反击时，AI 防守改为更重视人盯人。
- **来源**：EA 官方（FIFA23 Deep Dive / TU8）。
- **引擎映射**：**【不适用】**——围栏反弹替代了出界→角球循环（球永远在场内活球）。
- **差异提示**：无；围栏设计正是对"死球循环"的系统性豁免。

### R5.M9 界外球（掷球）

- **机制描述**：正式系统：出界后手掷重启；FC24 PlayStyles 有 Long Throw 专长（掷球更远）；eFootball v5.4.0 官方修复过"跳起停球出边线"的边界问题。
- **来源**：[EA 官方 FC24 Deep Dive PlayStyles 章节](https://www.frostbite.com/en-gb/games/ea-sports-fc/pitch-notes/news/fc-24-gameplay-deepdive)（官方）+ Konami v5.4.0（官方）。
- **引擎映射**：**【不适用】**——围栏反弹无出界；"手抛重启"语义由 GK 手抛开球（Drop）部分承担。
- **差异提示**：无。

### R5.M10 球门球

- **机制描述**：门球=门将从手上或地面开球重启；FIFA23 官方改进 GK 出球族（手抛提速/地滚快发 Driven Roll）即球门球与活球出球共用。
- **来源**：EA 官方 FIFA23 Deep Dive（官方）。
- **引擎映射**：**【不适用】**（无球门球死球场景）——GK 大脚开球/手抛技能已覆盖"门将发起进攻"语义；进球后 KICKOFF 中点开球替代重启。
- **差异提示**：无。

### R5.M11 计时与补时（真实规则趋势）

- **机制描述**：真实世界 2025/26 起 IFAB/FIFA 推行加速比赛的新规（如门将持球 8 秒判间接任意球、仅队长可与裁判沟通），目标是压缩浪费时间；游戏内比赛时长=真实时长缩放（6 分钟半场等），补时按死球时间累积。
- **来源**：[OneFootball：FIFA 批准重大规则修改](https://onefootball.com/fr/news/la-fifa-approuve-des-changements-majeurs-de-reglement-pour-accelerer-les-matchs-et-reduire-les-polemiques-42488641) + [Yahoo 同题](https://sports.yahoo.com/articles/fifa-approve-major-rule-changes-191500905.html)（真实规则报道）。
- **引擎映射**：**【可还原】**——笼式 5 分钟纯净计时（PLAY 才累计、GOAL_PAUSE 停表）已是该趋势的极致形态（零死球时间）；规则图 1s 定时器门控（草稿 §8）即实现。
- **差异提示**：当前"PLAY 才计时"口径与真实系"死球也走表+补时"相反，但符合笼式快节奏定位；保持。

## 未查到清单

- 游戏内越位判定的具体实现细节（帧级）
- 人墙排布/移动的数值规则
- 补时计算公式（游戏内）

## 来源质量分布统计

官方 5（EA FC24 Deep Dive ×2 镜像 / FIFA23 / TU8 / Konami v5.4.0）/ 真实规则机构 3（The FA / USA Today / Britannica+Yahoo）/ 深度教学 1（PES Mastery）/ 社区 2（anythinginterest、realsort101 传闻）；条目 11。
