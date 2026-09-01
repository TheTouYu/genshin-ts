# R7 AI 与战术（AI & Tactics）

> 调研日期 2026-09-01。覆盖：FC25（难度等级数值表/FC IQ 战术与角色/官方 TU8 AI 行为调整）+ 经典战术板（系列沿用滑条）+ eFootball（难度档间差距官方调平/Auto Player/AI 作弊社区实证）。来源质量分布：官方 5 条 / 数据站 1 / 深度解析 1 / 社区 3。
> **域定位说明**：笼式足球 D1 裁决=全真人（AI 仅 GK 兜底）——本域大部分"AI 球员行为"机制天然不可还原；调研价值集中在①AI GK 难度参数化范式②真人队友场景下战术系统的替代形态③"AI 透明度"方法论。
> 映射依据 = DESIGN.md §3 证据表 + engine-rules.md。

## 机制条目

### R7.M1 难度等级表（四维 AI 数值 10%→100%）

- **机制描述**：FC25 对 CPU AI 共 7 档难度（Beginner/Amateur/Semi-Pro/Professional/World Class/Legendary/Ultimate），每档按**四个维度数值化**：进攻智能 / 防守智能 / 反应速度 / 盯人与空间，从 10%~100% 线性抬升（Legendary 90/90/90/90，Ultimate 100/90/100/100 仅 Squad Battles）。
- **关键数值**：完整数值表见来源页（示例：Semi-Pro 40/40/50/50、World Class 75/75/80/80）。
- **来源**：[fifauteam FC25 Difficulty Levels](https://fifauteam.com/fifa-25-difficulty-levels-explained/)（数据站，EA 口径数值表）。
- **引擎映射**：**【可还原】**（AI GK 范围内）——笼式唯一 AI=守门员；难度分档=GK 参数表档位（横移速度/扑救反应延迟/预判外推精度/扑救半径四维，恰与真实系四维同构）；房间级可选（休闲=挡球 0.7m 反应 0.4s / 标准=现设计 / 竞技=无延迟）。
- **差异提示**：草稿 D9"AI GK 同真人参数"只有一档；把四维参数表化后难度分档是零结构成本的扩展（改查表值）。

### R7.M2 Competitor Mode（高阶 AI 行为包）

- **机制描述**（2020 起）：Legendary/Ultimate 上可开启——CPU 掌握技能招式/盘带/空间利用，**落后时会变阵改变心态**，模拟顶级真人玩家打法。
- **来源**：fifauteam（数据站，EA 口径）。
- **引擎映射**：**【不可还原】**——无 AI 球员（D1）；无 AI 战术决策层。
- **差异提示**：无需动作。

### R7.M3 Player Based Difficulty（按球员分级）

- **机制描述**（2021 起）：CPU 队内按个人能力分级——明星球员按上一档难度表现、最弱球员按下一档，打破全队统一难度。
- **来源**：fifauteam（数据站，EA 口径）。
- **引擎映射**：**【不可还原】**——无 AI 球员；AI GK 若做双门将（红蓝各一）可按队伍分档（语义近似），但收益低。
- **差异提示**：无需动作。

### R7.M4 AI 作弊争议与透明度教训

- **机制描述**：eFootball 社区实证（传奇难度）："电脑 AI 预判极强（禁区附近身后球）""可以同时后撤或同时前插""速度 95 的人跑不过速度 80 的"——高难度 AI 被感知为属性作弊；FIFA 系 momentum/scripting 争议走到诉讼级，后原告在 EA 提供"详细技术信息与工程师访谈"后撤诉（争议未完全平息但无实锤暗改证据）。
- **来源**：[A9VG eFootball 难度讨论](https://bbs.a9vg.com/archiver/?tid-8881496.html)（社区实证，2022）+ [Eurogamer：FIFA scripting 诉讼撤诉报道](https://www.eurogamer.net/fifa-scripting-lawsuit-withdrawn-after-ea-provides-plaintiffs-with-detailed-technical-information-and-access-to-speak-with-our-engineers)（深度媒体报道）。
- **引擎映射**：**【可还原】**（方法论条目）——启示：AI GK 全部参数应**公开在设计文档**（草稿已做到：0.8m/4m/s/8m/s 明文），不搞隐藏 buff；玩家输了能归因，赢了有成就感。
- **差异提示**：保持参数透明；若做难度分档（M1），把表直接写在 UI/说明卡里。

### R7.M5 eFootball 难度档与档间差距调平

- **机制描述**：eFootball 档位（顶尖球员/超级球星/传奇）；v6.0.0 官方补丁明文："**Top Player 与 Superstar 难度差距过大，调整 Top Player 略变难**"——官方承认并修复档间体验断层；社区感知 2.3.0 版本整体拉难、档间差缩小。
- **来源**：[Konami 官方 v6.0.0](https://www.konami.com/efootball/en-us/topic/news/5652)（官方）+ A9VG（社区）。
- **引擎映射**：**【可还原】**（方法论）——档位设计要点：相邻档差异要均匀可感（真实系官方都在补这个课）。
- **差异提示**：若做三档难度，先内测确认"标准→竞技"的体感增量与"休闲→标准"相当。

### R7.M6 战术板系统（Custom Tactics 滑条 → FC IQ 战术预设）

- **机制描述**：经典战术板（系列沿用）：Build Up（Speed/Passing/Positioning 自由或组织）、Chance Creation（Passing 风险/Crossing 占比/Shooting 胆量/Positioning）、Defence（Pressure 压上/Aggression 围抢/Team Width 收缩/Defender Line 造越位）——社区详解强调"滑条主要影响 AI 队友行为，人对人时弱"；FC25 FC IQ 将其现代化：**战术预设一键模拟名帅风格**（高位压迫/防守反击等）。
- **关键数值**：滑条 0-100；社区经验：Passing 风险 80 时短传键会自动变成塞直线。
- **来源**：[A9VG 经典战术板详解](https://bbs.a9vg.com/archiver/?tid-1301935.html)（社区，2009，系列沿用口径）+ [EA 官方 FC IQ 深析](https://www.ea.com/zh-hant/games/ea-sports-fc/fc-25/news/pitch-notes-fc-25-fc-iq-deep-dive)（官方）。
- **引擎映射**：**【不可还原】**（核心语义=指挥 AI 队友跑位/压迫强度，全真人无此层）/ **【可还原】**（站位表形态）——KICKOFF 站位表（草稿 §8）已承担"阵型"语义；可选扩展=LOBBY 房主选站位预设（防守型/均衡型/压上型三张站位表，纯查表切换）。
- **差异提示**：战术深度的真人替代=语音沟通+站位预设；不建议做更多。

### R7.M7 球员角色系统（无球行为 AI）

- **机制描述**（FC25 官方）：31 角色×焦点=52 组合；角色决定无球思考/行为/移动，每个角色有正/负特性（如突进前锋"支援"焦点：进攻+/压迫+/体能消耗−）；角色熟悉度 +/++ 分级。
- **来源**：EA 官方 FC IQ 深析（官方）。
- **引擎映射**：**【不可还原】**（同 R6.M7）——无球 AI 行为是本域最大的引擎缺口（无 AI 球员跑位系统，节点预算也不容）。
- **差异提示**：D1 全真人裁决已豁免；角色系统的"正负特性"设计法可借鉴到职业被动（每职业被动带一个代价项，如 DF 触球半径大但移速−3%——草稿已隐含此结构）。

### R7.M8 队友跑位 AI（前插/接应/拉开）

- **机制描述**：FIFA23 官方：Separation Runs（Positioning 85+ 的被盯球员可变向甩开防守）、Pin Down Defenders（强力中锋背身钉住后卫）、边中场"要球"指令；FC25 TU8 官方：AI 前插质量↑、越位线附近压线↑、熟悉角色时支援速度↑。
- **来源**：EA 官方 FIFA23 Deep Dive / TU8（官方）。
- **引擎映射**：**【不可还原】**（无 AI 队友）；**【可还原】**（辅助形态）——队友跑位由真人完成，可给"接应提示 UI"（屏幕文本框显示队友相对方位箭头）辅助配合，属可选表现增强。
- **差异提示**：4v4 真人配合上限高于 AI 跑位；不做。

### R7.M9 AI 防守强度按模式区分

- **机制描述**：FC25 TU8 官方：**竞技规则比赛（FUT 竞技/在线赛季）中 AI 防守者盯人放松、更少封堵禁区前沿射门线路、AI 拦截成功率进一步降低**——官方按"休闲/竞技"模式显式区分 AI 强度（竞技=更靠玩家本人防守）。
- **来源**：[PSU 转载 TU8 官方补丁](https://www.psu.com/news/ea-sports-fc-25-title-update-8-brings-major-gameplay-refresh-with-changes-to-ai-goalkeeping-shooting-more/)（官方）。
- **引擎映射**：**【可还原】**（方法论+AI GK）——竞技=AI GK 不再救场（参数档最低）恰是真实系思路的镜像；与 R7.M1 难度档共用参数表。
- **差异提示**：若笼式做排位/积分模式，可联动 GK 档位（休闲 AI 强 GK / 竞技弱 GK）。

### R7.M10 Auto Player 与教练向功能（eFootball v5.2 新增）

- **机制描述**：eFootball v5.2 新增三功能：**Auto Player（AI 操作与手动操作无缝切换）**、Advice（赛中赛后建议）、Analysis（表现分析+玩家对比）；AI 战可从头重开。
- **来源**：[kryk55 v5.2 解析](http://kryk55.com/efootball/info/update_5_2.html)（深度解析，转官方补丁）。
- **引擎映射**：**【可简化】**——Auto Player 语义≈AI GK 兜底（人不在→AI 接管该槽位，草稿 D1 已同构：无人选 GK 才生成 AI）；Analysis/Advice 无数据采集层（调试日志仅开发侧），不做。
- **差异提示**：GK 槽 AI 兜底已是该思想的正确收窄；可讨论"掉线玩家槽位临时 AI GK 化"（当前是释放球权+槽位保留，更简单）。

### R7.M11 智慧战术（Smart Tactics 实时建议）

- **机制描述**（FC25 官方）：实时战术建议+方向键快捷执行+生效时的转播化呈现（镜头/字幕展示战术变化）。
- **来源**：EA 官方 FC IQ 深析（官方）。
- **引擎映射**：**【不可还原】**（AI 战术建议层）；转播化呈现思想可借鉴（阶段切换的屏幕播报已有，草稿 §5.5）。
- **差异提示**：无。

## 未查到清单

- AI 四维数值表之外的内部参数（决策频率/容错等）
- Competitor Mode 的行为参数
- FIFA momentum/scripting 的最终技术结论（诉讼撤诉，未公开全部细节）
- 战术板滑条→AI 行为的量化映射

## 来源质量分布统计

官方 5（EA FC IQ / FIFA23 / TU8 / Konami v6.0.0 / kryk55 转官方 v5.2）/ 数据站 1（fifauteam 难度数值表）/ 深度媒体 1（Eurogamer）/ 社区 3（A9VG×2 等）；条目 11。
