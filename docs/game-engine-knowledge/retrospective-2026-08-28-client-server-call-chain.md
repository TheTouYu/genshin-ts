# 完整复盘：客户端图执行模型修正与服务端↔客户端调用链（2026-08-28 第二轮）

> 范围：魔方-客户端优化版本.gil 读图任务的第二轮——用户两次纠正后，用编译器源码 + 官方奇匠学院文档 +
> 米游社社区问答修正客户端图（20010 角色操控技能图）的执行模型误读，并闭环"服务端如何调用客户端代码"的知识链。
> 视角：客户端图执行模型（技能释放驱动 ≠ 变量响应驱动）、跨端调用链、官方知识库检索路由。
> 证据：真实 GIL（SHA f90ac5438c…）图 1082130436/1073741851/1073741829 读回；
> 编译器源码 client_graph_support.ts / client_node_metadata.ts / client_graph_modes.ts；
> 官方文档 mhj4a0rzu4pi（角色操控技能）/ mho2iu0eaia0（角色操控技能节点图）/ mhlaj0r9bldi（信号）/
> mhrnuz9izfne（客户端节点图日志）/ mho81frl33im（技能）；米游社问答楼（施放技能实例需先创建实例等）；
> PKC bundle bnd_9bf56357567e299b1b291865c6（claim clm_D1A208295BD4F1E3FE）。
> 状态：已交付修正报告；技能/PKC/open-items 已迭代；客户端遍历语义与技能事件轨道打点待游戏核验。
> 关联：第一轮复盘 retrospective-2026-08-28-rubik-client-graph-reading.md（工具错标/多分支 pin/环境坑）。

## 一、错误谱系总览（第二轮修正谱系）

| # | 层 | 具体错误 | 根因 | 修复 | 记录位置 |
|---|---|---|---|---|---|
| 1 | 语义推断 | 把「获取自定义变量」(gid 200016) 按撞号错名读成 When Custom Variable Changes 事件 → 推断出"变量变化即重算"的响应式触发模型 | 在工具错标名之上**继续做语义推断**（错名+推断叠加）；未用官方执行模型交叉验证 | 元数据重映射真名 + 官方文档（节点图开始→按顺序执行）+ 服务器侧 Cast 链读回 | 本复盘 + 技能 Step 2.8-5 |
| 2 | 数据模型 | 把「获取局部变量」(gid 200082 cid 1036) 读成"字典 Set/Add Key Value" → 错把局部变量理解成字典查表 | 同上（撞号错名） | 重映射：38 设置局部变量 / 22 获取局部变量 / 26 多分支 / 8 获取自定义变量 | 本复盘 |
| 3 | 入口识别 | 把「节点图开始」(gid 200042 isStart) 当普通 Set 节点，孤立链当异常 | 同上 + 不熟悉客户端图入口形态 | isStart 标记 + 官方"节点图开始：技能节点图的开始事件" | 技能 Step 2.8-5 |
| 4 | 知识路由 | 官方教程/社区知识库第二次用户提醒才去查（用户：'使用专门的技能搜索官方的教程'） | miliastra-knowledge 触发判断偏窄：读图任务默认只走 gil-node-graph-reading，没想到先查官方理解陌生图类型的执行模型 | 本轮完成官方+社区检索；教训写入本复盘 | 本复盘 |
| 5 | 领域认知 | 不知道 20010=角色操控技能是"操控状态专用、无动画表现、节点图事件轨道打点触发"的特殊技能子类（用户：'这个图还使用了角色操控技能 需要查找相关知识'） | 官方知识缺口 | get_document 角色操控技能 + 本地 version-updates 核验 | 本复盘 + PKC claim |

## 二、最近一次错误的完整调查链（响应式误读 → 修正）

1. **现象**：第一轮按撞号错名解读客户端图后，报告了"8 个 When Custom Variable Changes 触发器 +
   响应式变量驱动"的执行模型。
2. **用户纠正 1**：'开始节点是节点图开始，它被绑定在了一个技能上面，服务器节点调用技能实例来触发'。
3. **编译器源码追踪**：src/runtime/client_graph_support.ts（gstsClient* 入口函数 + start 事件）→
   src/definitions/client_graph_modes.ts（7 种子类型前缀）→ CLIENT_NODE_METADATA（isStart: true、
   genericId 200042=node_graph_begins、200016=get_custom_variable、200082=get_local_variable）→
   重映射 191 节点全表，错名全部纠正。
4. **官方文档核验**：mhj4a0rzu4pi（角色操控技能：操控状态才可用/无动画表现/节点图事件轨道打点触发
   客户端图，仅支持角色操控技能节点图）+ mho81frl33im（技能触发客户端节点图）+ mhlaj0r9bldi
   （向服务器节点图发送信号：所有服务器节点图可监听）+ mhrnuz9izfne（客户端图独立日志系统）。
5. **服务器侧交叉验证**：玩家-界面图读回——When Custom Variable Changes(变量="指令") → Equal →
   Cast Specified Skill Instance（Ety=玩家角色、Int=变量"技能实例ID"、校验=false）；角色图读回——
   Create Custom Skill Instance(配置 1228931073) → Set 玩家变量"技能实例ID"。触发链闭环。
6. **修正结论**：执行模型 = 服务器施放技能实例 → 技能事件轨道触发 → 客户端图「节点图开始」**顺序执行**
   （非响应式事件驱动）；8 个"触发器"实为普通取值节点；客户端图经「向服务器节点图发送信号」（正常 n=115 /
   异常 n=116 指令异常=1）回传服务器，27 块各自监听信号播运动设备动画。

## 三、为什么反复出问题——系统性根因

1. **"错名→推断语义"是最危险组合**：工具错标是第一因（已登记 O-2026-08-28-05），但错名之上继续
   推断执行模型是第二层错误。名字可疑时（"Set Custom Variable Dict Str List Int"明显是类型注解
   不是节点名）应先映射真名再读，而不是顺着错名编故事。
2. **读图技能与官方知识库无联动**：gil-node-graph-reading 假设服务端图；遇到陌生图类型
   （type≠20000）时流程里没有"先查官方教程理解执行模型"的强制步骤（Step 2.8 第一轮已补身份映射，
   本轮补触发链），miliastra-knowledge 的触发描述也未覆盖"读客户端图先查官方教程"场景。
3. **静态读图的边界**：客户端图的运行时触发来源（谁施放技能、事件轨道何时打点）无法从 GIL 静态
   确定——必须靠"服务器侧 Cast 链 + 官方文档 + 编辑器配置"三方补齐，纯静态推断必错。

## 四、流程与方法论教训

1. **用户纠正是最高价值证据**：两次纠正（节点图开始绑定技能/角色操控技能）都直接指向官方文档，
   收到"查官方教程"类指示应第一时间执行，不要自行绕路。
2. **读客户端图三件套**（固化到技能 Step 2.8-5）：① 元数据重映射真名；② 官方文档查执行模型；
   ③ 服务器侧找 Cast Specified Skill Instance 链确认触发来源。缺一不可。
3. **编译器的 client 元数据是读图的金钥匙**：CLIENT_NODE_METADATA（subType/genericId/concreteId/
   isStart/reflectMap）一行 tsx 脚本即可全表重映射，比逐节点猜快一个数量级。
4. **官方知识库检索技巧**（miliastra-knowledge 技能）：多关键词批量查询（"服务端调用客户端 技能实例"
   等 4 组并查）+ list_documents 定位精确标题（角色操控技能 mhj4a0rzu4pi）→ get_document 拉全文；
   社区问答楼（bbs-faq）对"施放技能实例必须先生成实例"这类实战坑召回率很高。

## 五、风险探索与未闭合项

- O-2026-08-28-06 客户端「遍历实体列表」pin 语义：官方「客户端节点图日志」（mhrnuz9izfne）是
  现成核验通道（试玩前勾选客户端图→调试模式看节点输入输出值），建议下次游戏核验时顺带闭合。
- 技能配置 1228931073 的事件轨道打点进度在编辑器侧（战斗预设→技能页签→动画编辑），.gil 读不到。
- O-2026-08-28-07 玩家-界面 n=62 计数链入口：同用客户端图日志或 debug 日志核验。
- "完全隐藏"图（20001 bool_filter，id 1082130433 恰为 gsts 客户端图默认 id）作用未明，需编辑器确认。
- parse/explain 工具修复（O-2026-08-28-05）仍 OPEN：修好前读任何客户端图必须走 Step 2.8 手工映射。

## 六、产出清单

- 技能 gil-node-graph-reading SKILL.md Step 2.8-5：补"触发链路在服务器图侧读"（Create Custom
  Skill Instance → Cast Specified Skill Instance → 节点图事件轨道 → 节点图开始；角色操控技能特性）。
- PKC 知识树：bundle bnd_9bf56357567e299b1b291865c6（content_hash
  9bf56357567e299b1b291865c69c02ab79996672e1a3b793e835acde8fc59b83）已审批应用——
  新 topic knowledge/game-engine-knowledge/client-server-call-chain.md +
  claim clm_D1A208295BD4F1E3FE（服务端调用客户端节点图全链路，fact-class external_game_evidence）。
- open-items：O-2026-08-28-08（客户端图读法待录入 PKC）→ 已闭合（本轮 bundle）。
- 同族扩展：gil-node-graph-editing 技能此前对客户端图零覆盖，已加警示（编辑 type≠20000 图同样
  受撞号错名影响，先走读图技能 Step 2.8 映射真名再动手）。
