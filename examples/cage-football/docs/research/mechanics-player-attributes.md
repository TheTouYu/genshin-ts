# R6 球员属性（Player Attributes）

> 调研日期 2026-09-01。覆盖：FC25（fifauteam 属性全表（EA 口径）+ 官方 FC IQ 深析）+ FC24（官方 PlayStyles/化学重做后的完整规则）+ eFootball 2025~2026（GameMarket 深度解析 + Konami 官方属性-行为联动补丁）。来源质量分布：官方 4 条 / 数据站 1 站 / 深度解析 1 篇 / 社区 1。
> 术语对齐 CONTEXT.md（位置职业）。映射依据 = DESIGN.md §3 证据表 + engine-rules.md。

## 机制条目

### R6.M1 属性体系总览（两系同构：~35-40 项细分 + 位置加权 OVR）

- **机制描述**：FIFA/FC 系约 35 项属性分六维（Pace/Shooting/Passing/Dribbling/Defending/Physical）+ 门将专属组（Diving/Handling/Kicking/Reflexes/Speed/Positioning），全部 0-99；eFootball 约 40 项属性（40-99）分技术/身体/意识三族，**OVR 按注册位置加权合成**（同属性分布在不同位置 OVR 不同）。两系都把"精确的细分属性"作为球员个性的底层表达。
- **关键数值**：属性权重示例（fifauteam/EA 口径）：Acceleration 45% Pace / Sprint Speed 55% Pace；Standing Tackle 30% Defending / Sliding Tackle 10% / Defensive Awareness 30% / Interceptions 20%；Ball Control 35% Dribbling / Agility 10% / Balance 5%。
- **来源**：[fifauteam FC25 Attributes](https://fifauteam.com/fc-25-attributes/)（数据站，EA 口径）+ [GameMarket eFootball 属性解析](https://gamemarket.gg/news/efootball/efootball-player-stats-explained-ratings-playing-styles-skills)（深度解析）。
- **引擎映射**：**【可还原】**（数值层）——职业差异=参数表（草稿 §4.2 数值表正是"位置加权"的最小实现）；引擎无数值系统，属性全部落为节点图参数/概率/半径/速度修正。
- **差异提示**：草稿四职业已有"移速/半径/概率/技能"四类差异；可讨论是否给每职业补 2~3 个"细分属性型"参数（如 FW 蓄力上限、DF 抢断概率、MF 传球弹道稳定、GK 扑接阈值——现有表已隐含大半）。

### R6.M2 加速/极速双轨属性

- **机制描述**：FIFA：Acceleration（到极速时间）与 Sprint Speed（极速）分离；eFootball：瞬発力（Acceleration）与速度（Speed）分离——深度解析口径："**Acceleration 决定前两码谁赢，Speed 决定之后二十码谁赢**"；FIFA23 官方另有 AcceleRATE 原型（Explosive 短距爆发/Lengthy 长距提速/Controlled 均一）第三层个性化。
- **来源**：fifauteam（数据站）+ GameMarket（深度解析）+ EA 官方 FIFA23 Deep Dive（官方）。
- **引擎映射**：**【可简化】**（同 R1.M1）——职业基础移速+冲刺技能幅度/时长可近似两维；AcceleRATE 第三层无通道（无加速曲线）。
- **差异提示**：见 R1.M1；AcceleRATE 的"Explosive vs Lengthy"人设思路可转化为"FW 冲刺幅度大但短 / DF 冲刺幅度小但久"的参数分化。

### R6.M3 意识类属性（Offensive / Defensive Awareness）

- **机制描述**：eFootball 深度解析："高进攻意识的前锋**在你按直塞键之前就启动跑位**"——意识属性作用于决策时机而非能力上限；Konami v5.2 官方补丁：**盯人时的加速力受「防守意识（ディフェンスセンス）」影响**（属性→行为加速的官方联动）；FIFA 侧 Defensive Awareness 决定 Jockey 全套速度参数（R4.M4）。
- **来源**：GameMarket（深度解析）+ [Konami 官方 v5.2](http://kryk55.com/efootball/info/update_5_2.html)（官方补丁，kryk55 转述）+ EA 官方 FIFA23（官方）。
- **引擎映射**：**【不可还原】**（球员意识=AI 行为，笼式全真人无此层）；GK 侧例外：GK Awareness/预判可映射为 AI GK 的反应延迟/预判外推参数（草稿 D9"预判无延迟"即该参数的极值设定）。
- **差异提示**：AI GK 是唯一"属性化意识"的落点；可讨论把 D9"预判无延迟"改为"预判延迟 0.2s"作为平衡旋钮。

### R6.M4 弱脚（Weak Foot）

- **机制描述**：FIFA：弱脚星级 1~5，量化为**弱脚侧动作只使用主脚属性的 20%/40%/60%/80%/100%**（星级=弱脚等效强度）；eFootball 拆两维：**Weak Foot Usage（用不用）**与 **Weak Foot Accuracy（用得好不好）**——低 Usage 球员会被防守者预判"永远内切到主脚"。
- **关键数值**：星级→属性折算 20%×N（fifauteam 口径，FIFA19 时代明文，后续沿用该语义）。
- **来源**：[fifauteam FIFA19 Weak Foot](https://fifauteam.com/fifa-19-weak-foot-upgrades/)（数据站）+ GameMarket（深度解析，eFootball 侧）。
- **引擎映射**：**【可简化】**——无左右脚模型；近似通道=踢球方向偏置：按玩家朝向与"主脚侧"（固定左/右）反向出球时，V/ω 打折（如 ×0.7）+出射角随机偏转加大——参数一行，还原"逆足打门更飘"的技巧语义。
- **差异提示**：可选机制；若加，建议只在射门/长传生效（短传豁免），避免惩罚过重。

### R6.M5 花式星级（Skill Moves Stars）

- **机制描述**：1~5 星门槛限制可用招式集（与弱脚并列为卡片两大星级属性）；高星解锁高阶招式（R1.M8 详述）。
- **来源**：fifauteam 属性/招式表（数据站）+ EA 官方 FC25 Deep Dive（官方，新招式星级标注）。
- **引擎映射**：**【不可还原】**（依赖招式动画系统）。
- **差异提示**：同 R1.M8——不还原，技巧空间由物理手感承担。

### R6.M6 PlayStyles 特长系统（FC24 引入）

- **机制描述**：FC24 起每名球员带特长标签（PlayStyle / 强化版 PlayStyle+ 两档），作用于**持球行为**：如 Dead Ball（定位球球速/弧度/精度↑+预览线更长）、Chip Shot（吊射更快更准）、Finesse Shot、Long Throw（界外球更远）、GK 侧 Far Throw/Rush Out/Far Reach 等；官方分类学：**PlayStyles=持球技巧层**（与 OVR=体能心理、Roles=无球能力并列）。
- **来源**：[EA 官方 FC24 Deep Dive PlayStyles 章节](https://www.frostbite.com/en-gb/games/ea-sports-fc/pitch-notes/news/fc-24-gameplay-deepdive)（官方）。
- **引擎映射**：**【可还原】**——特长=局部参数强化项：草稿已有同构先例（MF 被动"传球旋转衰减减半"=Finesse Passer 型特长）；扩展方向=每职业 1~2 个特长参数（FW 蓄力上限+10%、DF 铲球扇形+0.3m、GK 扑接阈值+1m/s），全部是查表值。
- **差异提示**：PlayStyles 是真实系"球员个性数值化"的最新官方范式，与笼式"职业被动"完全同构，值得在设计中对齐命名（职业被动≡PlayStyle）。

### R6.M7 球员角色与熟悉度（FC IQ Roles & Familiarity）

- **机制描述**（FC25 官方）：31 个角色 × 焦点 = **52 种组合**，每个位置多角色可选；角色决定**无球时的思考/行为/移动**；角色熟悉度（+/++分级，真实数据 AI 模型分配）影响适配度——低熟悉度可踢但表现打折；位置不适配则化学归零。
- **来源**：[EA 官方 FC IQ 深析（繁中）](https://www.ea.com/zh-hant/games/ea-sports-fc/fc-25/news/pitch-notes-fc-25-fc-iq-deep-dive)（官方）。
- **引擎映射**：**【不可还原】**（无球 AI 行为系统）/ **【可还原】**（位置限制语义）——笼式"选位置职业+比赛中不可换位"（草稿 §4.1）即位置适配规则的收窄版；角色多样性与熟悉度分级无通道（全真人，无 AI 队友跑位）。
- **差异提示**：无需扩展；位置职业的"锁定"设计已被 FC IQ 的位置前提规则佐证（错位=化学归零 ≈ 不许错位）。

### R6.M8 化学系统（FUT Chemistry）

- **机制描述**（FC24 重做后沿用 FC25）：每人 0~3 化学点（蓝钻石）；**位置正确是化学前提**（错位=0 点且不计入队友阈值）；同俱乐部/联赛/国家队计数达阈值加点（2 同俱乐部或同国籍 +1；3 同联赛 +1；4 同俱乐部 +2；5 同国籍或同联赛 +2；7 同俱乐部 +3；8 同国籍或联赛 +3）；化学点给属性小/中/满加成；**0 化学无负面**（仅无加成）。
- **关键数值**：阈值表如上（fifauteam 口径）。
- **来源**：[fifauteam FC25 Chemistry](https://fifauteam.com/fc-25-chemistry/)（数据站，EA 规则口径）。
- **引擎映射**：**【可简化】**——FUT 卡组语义（俱乐部/联赛）不适用；可借用的内核="协作加成"：同队槽位协作值（如共同比赛场数/连场同队）→ 传球吸附锥角+5°、抢断概率+5% 等微加成（图变量累计即可）；也可不做（4v4 固定队无组卡乐趣）。
- **差异提示**：低优先级可选项；若做，建议只做"位置正确才有职业被动"这一条（与化学位置前提同构，成本≈0）。

### R6.M9 门将属性组

- **机制描述**：FIFA：Diving（受身高直接影响）/Handling（接住 vs 拍出频率）/Kicking（开球距离精度）/Reflexes（对射门反应速度）/Speed（出击速度）/Positioning（站位选择）；eFootball：GK Awareness/Catching/**Parrying（拍出方向质量）**/Reflexes/**Reach（扑救触及范围）**；中文侧 FO4 官方站强调身高体重对门将显著重要。
- **来源**：fifauteam（数据站）+ GameMarket（深度解析）+ [FO4 官方站](https://fco.qq.com/webplat/info/news_version3/33965/34617/34618/34622/m20101/201808/746821.shtml)（官方授权站）。
- **引擎映射**：**【可还原】**（详见 R4.M10）——补充映射：GK Reach=扑救扩大半径（草稿 1.2m 可参数化）、Parrying=挡弹出射角偏移量、Kicking=大脚开球 V 值。
- **差异提示**：AI GK（D9 同参数）与真人 GK 共用一张参数表即可，天然统一。

### R6.M10 体力/耐力属性（Stamina）

- **机制描述**：FIFA Stamina（25% Physical 权重）决定疲劳速率；eFootball 深度解析："70 分钟状态崩塌的中场，恰好在比赛决胜时刻不再前插到位"——体力作用于**到位率**而非直接速度。
- **来源**：fifauteam（数据站）+ GameMarket（深度解析）。
- **引擎映射**：**【可简化】**（同 R1.M3）——5 分钟短局下建议不做全属性，保留冲刺冷却即可；若做，体力效果挂"冲刺可用性"而非基础移速。
- **差异提示**：同 R1.M3。

### R6.M11 OVR 的位置加权原则

- **机制描述**：两系 OVR 均按位置对属性加权（同属性分布，前锋与后卫 OVR 不同）——保证"位置感"内建于数值系统。
- **来源**：GameMarket（深度解析）+ fifauteam 各属性权重列（数据站）。
- **引擎映射**：**【可还原】**——职业数值表（草稿 §4.2）即该原则的实现；无需 OVR 总分（无选人系统，LOBBY 直接选位置）。
- **差异提示**：笼式无卡组/转会，OVR 层无意义；保留"同数值不同职业表现不同"的加权思想即可。

## 未查到清单

- 各属性对具体行为（射门精度/传球速度）的量化换算公式（两系均未公开）
- 化学加成的具体属性点数（小/中/满各加多少）
- AcceleRATE 三原型的加速曲线参数
- eFootball 属性→行为联动的完整映射表（仅有补丁说明的局部证据）

## 来源质量分布统计

官方 4（EA FC IQ 深析 / EA FC24 PlayStyles / EA FIFA23 AcceleRATE / Konami v5.2）/ 数据站 1 站（fifauteam：属性+弱脚+化学三页）/ 深度解析 1（GameMarket）/ 官方授权站 1（FO4）；条目 11。
