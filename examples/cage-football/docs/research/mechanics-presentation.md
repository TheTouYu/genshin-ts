# R8 呈现与反馈（Presentation & Feedback）

> 调研日期 2026-09-01。覆盖：FC25（官方 Highlighter/fifauteam 镜头全表与解说系统/Rush 镜头新变体）+ 系列经典 HUD 口径 + eFootball（体育场自定义）。来源质量分布：官方 2 条 / 数据站 2 站 / 社区 2 / 经典教学 1。
> 术语对齐 CONTEXT.md。映射依据 = DESIGN.md §3 证据表 + engine-rules.md（含官方镜头模板切换、UI 文本框 lv/pN 变量、特效/音效组件能力）。

## 机制条目

### R8.M1 镜头系统总览（12 类型 + 自定义参数）

- **机制描述**：FC25 共 12 种镜头（+Rush 4 变体）：Legacy/Tactical/Tactical Focus（**冲刺/花式时动态变焦**）/EA Sports GameCam（默认）/Tele Broadcast（中距转播）/Tele（短距）/Co-Op（**长距类等轴测，同屏看更多队友——传球流首选**）/Classic/Dynamic（强跟随球，盘带流）/End to End（场端俯视跟球）/Pro（跟随自创球员）/Broadcast（中场固定机位只转视角）；自定义参数：Height 0~10 / Zoom 0~10 / Far Side Focus / **Ball Tracking Speed** / Penalty Area Zoom / Pro Camera Speed/Swing / **Power Shot Zoom（强射时变焦开关）**。
- **关键数值**：社区推荐——休闲：Co-Op（Height 20/Zoom 0）；竞技：Tele Broadcast（Height 10~17/Zoom<5）。
- **来源**：[fifauteam FC25 Camera Guide](https://fifauteam.com/fc-25-camera/)（数据站）。
- **引擎映射**：**【可简化】**——镜头官方模板按玩家切换（DESIGN §7 已规划"按玩家切镜头模板"）；无逐参数自定义（Height/Zoom 连续调节无通道），预设档选择≈模板选择；动态变焦（Tactical Focus/Power Shot Zoom）**【不可还原】**（无运行时镜头参数控制）。
- **差异提示**：笼式默认=跟随角色模板（草稿）；可给 LOBBY 每人镜头偏好选择（跟随/远距 2~3 档模板），对齐真实系"按模式设镜头"。

### R8.M2 镜头按模式绑定（含 Be a Keeper）

- **机制描述**：镜头设置按场景独立保存：单机/多人/锁定球员/Clubs/**Be a Keeper（门将专属镜头）**各自可选；Pro 镜头跟随门将视角。
- **来源**：fifauteam Camera Guide（数据站）。
- **引擎映射**：**【可还原】**——真人 GK 可单独选更远距镜头模板（门线视角需要广视野）；玩家模板图挂不同镜头配置即可。
- **差异提示**：选 GK 的玩家建议默认远距镜头（站位需要全场视野），LOBBY 选位时联动。

### R8.M3 雷达小地图（2D Radar）

- **机制描述**：HUD 底部 2D 俯视雷达：两队各用队色点+球位置，实时反映全场站位（传球/找空档的核心信息源）；社区长期存在"雷达可见性"反馈（系列标配，跨版本）。
- **关键数值**：雷达的具体绘制规则（点大小/刷新率）：未查到官方公开文档。
- **来源**：[EA Answers：雷达可见性问题帖（FIFA 系列）](https://answers.ea.com/t5/forums/forumtopicprintpage/board-id/FIFA-13-FR/message-id/64729/print-single-message/false/page/1)（社区，存在性实证）。
- **引擎映射**：**【可简化】**——无原生小地图控件；近似通道=屏幕 UI 文本框定时刷新字符网格（●=红队 ○=蓝队 ◎=球，按 8+1 槽位坐标映射到字符阵），0.5~1s 刷新与雷达语义等价（低频定时器符合负载铁律）；精度受文本网格限制。
- **差异提示**：第三人称跟随镜头下"看全场"是刚需（真实系雷达的存在理由），笼式多摄像机位不可调，**雷达文本近似值得列入 v2 表现清单**（约 30~50 节点+1 个低频定时器）。

### R8.M4 力度条与图标反馈（蓄力/时机 UI）

- **机制描述**：力度条=按住增长（视觉量化力度）；Timed Finishing 二次按键在球员头顶出**绿/红/黄/灰四色图标**反馈时机质量；Precision Shooting 蓄力时显示白色瞄准线。
- **来源**：[memorypc](https://www.memorypc.eu/blog/gaming-knowledge/ea-fc-25-in-time-finish-or-precision-shoot-which-technician-is-the-better-choice/) / [EarlyGame](https://earlygame.com/de/guides/fifa/ea-fc-25-timed-finish-oder-precision-shooting-was-ist-besser)（社区解析，见 R3.M2/M3）。
- **引擎映射**：**【可还原】**——力度条=文本条变量驱动（`█████░░░` 草稿降级方案已规划）；时机反馈=出球瞬间显示 ●绿/●红 字符图标（判定结果进 UI 文本框），颜色分层可用不同字符/颜色文本近似。
- **差异提示**：草稿已有力度条；补一个"时机判定结果图标"反馈即可完整（若做二按时机机制）。

### R8.M5 解说系统（Commentary）

- **机制描述**：FC25 解说覆盖 **14 种语言 40+ 解说员**（英语 Derek Rae/Stewart Robson 等，中文 Liu Yang/Su Dong/Wang Tao）；解说区域锁定（英/法/西语全球通用）；**解说与场馆氛围音量独立设置**。
- **来源**：[fifauteam FC25 Commentators](https://fifauteam.com/fc-25-commentators/)（数据站）。
- **引擎映射**：**【不可还原】**——无语音解说层（无 TTS/解说音频资产）；近似=关键事件播报**文本**（草稿"红队进球！{lastKicker 名}"屏幕播报已是该思想的文本版）+事件音效。
- **差异提示**：无缺口；播报文本+音效已达引擎上限。

### R8.M6 场馆氛围与音效反馈

- **机制描述**：观众声浪随比赛事件动态起伏（进球欢呼/射门惊呼）；解说/氛围/音效音量分层设置；eFootball v5.0.0 新增体育场自定义（球场视觉个性化）。
- **来源**：fifauteam Commentators（音量分层口径）+ [VGC eFootball v5.0.0 报道](https://www.videogameschronicle.com/news/efootballs-major-version-5-0-0-update-is-here-adding-stadium-customisation-and-80-gameplay-tweaks/)（泛媒体标题级）。
- **引擎映射**：**【可还原】**——音效播放器组件（服务端触发全员可听）：踢球/围栏/门柱/进球欢呼/扑救（草稿 §7 表现资产清单已全覆盖）；声浪"动态起伏"近似=按事件切换不同强度欢呼音频（进球强欢呼 vs 射门短惊呼），离散档而非连续。
- **差异提示**：表现资产清单与真实系事件集合高度一致；缺"声浪连续随比分时间变化"（离散近似足够）。

### R8.M7 回放系统（EA SPORTS HIGHLIGHTER，FC25 官方）

- **机制描述**（官方，2024-08）：新回放中枢=即时回放+最佳时刻+比赛集锦同屏；**离线随时可看/在线仅赛后**；转播预设（HyperMotion/360/**Drone 无人机**视角）；高级剪辑工具（时间线编辑/滤镜/特效）；主机原生保存。
- **来源**：[EA 官方 HIGHLIGHTER 公告](https://www.ea.com/pt-br/games/ea-sports-fc/fc-25/news/fc-25-highlighter)（官方）。
- **引擎映射**：**【不可还原】**——无回放录制层（服务端无录像/自由镜头/时间回溯通道）；近似=进球瞬间 GOAL_PAUSE 2s 定格表现（草稿已有）+ 按玩家切镜头模板做"进球回放镜头"（草稿 v2 已列）。
- **差异提示**：保持 v2"进球回放镜头"可选项即可；录制/剪辑明确超出引擎能力。

### R8.M8 进球庆祝与事件表现

- **机制描述**：进球=庆祝动画+解说高潮+观众沸腾+镜头切入庆祝（系列标配表现包）。
- **来源**：系列通用（EA 官方 Highlighter/Deep Dive 语境）；无单独深文档。
- **引擎映射**：**【可简化】**——无庆祝动画控制；近似=门内烟花特效+全场欢呼+计分板跳动+播报文本（草稿 §5.5 进球动作序列已规划全部四件套）。
- **差异提示**：无缺口。

### R8.M9 计分板与比赛 HUD

- **机制描述**：比分+比赛时间常显 HUD（左上角转播风计分板），事件更新（进球/半场）即时刷新。
- **来源**：系列通用（fifauteam/Dexerto 镜头与设置语境）。
- **引擎映射**：**【可还原】**——UI 文本框 lv 变量（`{1:score}` 类引用）实时刷新；草稿计分板/倒计时/播报三件套已规划。
- **差异提示**：注意 UI 文本框 pN 前缀变量做每玩家本地显示（草稿 LOBBY 选位按钮组已用该口径）。

### R8.M10 Rush 模式的呈现取舍（小场先例）

- **机制描述**（FC25 官方新 5v5 街机模式）：FC25 为 Rush 新增 4 种镜头变体：**Rush Pro（第三人称沉浸，快节奏）/Rush End to End（全场视野+对门聚焦）/Rush Tactical（更宽水平角）/Rush Broadcast（更近水平视角）**——小场模式下官方同时提供"沉浸"与"全局"两端。
- **来源**：fifauteam Camera Guide（数据站，转官方新特性）。
- **引擎映射**：**【可还原】**（方法论+模板选择）——笼式与 Rush 同为小场快节奏：镜头二元取舍（沉浸跟随 vs 全局视野）是官方验证过的需求对；模板选择+雷达（M3）分别覆盖两端。
- **差异提示**：v2 表现迭代时优先实测"跟随模板+雷达"组合是否够用，再决定是否加全局模板选项。

## 未查到清单

- 雷达绘制规则（点规格/刷新率）官方细节
- 解说触发词表/逻辑（语音内容系统）
- 观众声浪动态曲线参数

## 来源质量分布统计

官方 2（EA HIGHLIGHTER / Rush 官方特性经 fifauteam 转）/ 数据站 2 站（fifauteam Camera+Commentators）/ 社区 2（EA Answers 雷达帖、memorypc/EarlyGame 经 R3 转引）/ 泛媒体 1（VGC）；条目 10。
