# Composite usage guide (author view)

Author-facing guide: when to composite, four forms, interface design, three architecture patterns, known boundaries, verification flow

<!-- CLAIM:START clm_1EB7BE64DF651835F79AE4DB94 -->

### Composite usage guide: 5-7 node standard, four forms, call-flow/event-flow separation, verified boundaries

复合节点作者视角总纲（docs/game-engine-knowledge/composite-usage-guide.md，2026-08-15 成文）：①复合化标准 = 每层级打开 5~7 节点，超过即复合化；两种价值（复用型多处调用/封装型职责单元），价值公式=布局清晰→复用更赚→跨项目资产；②四种形态分类（纯数据流/调用流/纯事件流/混合复合）先分类再动手；③核心架构原则：调用流与事件流分开表达（用户 2026-08-14 指导），事件回调是独立执行流、capture 参数不可见（2690 实证）；④三种模式参考实现：调用流复合（gsts_orbit_scheduler：start_timer 序列+outflow）、纯事件流复合（gsts_orbit_trigger：事件载荷分发+字面量 case）、混合复合（verify_event_comp：事件独立旁路+调用流入口）；⑤已知边界：#19 capture 惰性引用、#20b impl exec 边物理 InFlow、#20c 纯事件复合三条件、#21 事件触发语义（custom 变量触发/图变量不触发）、setTimeout 不可用；dict 图变量读写已确认可用（get/set_node_graph_variable 复合内与宿主图同构，见 composite-nodes.md 图变量节点，2026-08-14 差分 CONFIRMED）；⑥验证流程：编译→体检（npm run health:composite）→读图自检→游戏核验；设计检查清单 9 条。

#### 适用边界

示例全部来自已验证生产代码（rubik v20 游戏核验通过、verify/composite-family 2696 日志全通过）；使用指南是作者视角总纲，规则与 wire 细节以 composite-nodes.md 为准；能力边界为生产现状（2026-08-14），官方编辑器能力可能更宽。

<!-- CLAIM:END clm_1EB7BE64DF651835F79AE4DB94 -->

<!-- CLAIM:START clm_7FA04F29CA2F39F00CB435A903 -->

### Reusable composite asset catalog: three tiers extracted from rubik v20

复合跨项目资产目录（2026-08-15 从 rubik v20 的 22 个复合提炼，全部游戏核验通过）：A 类通用数学/几何（纯数据、零玩法依赖、直接复制）——rotate_vec（Rodrigues 旋转）、local_axis_rot（绕任意轴旋转）、spin_axis_triple（三轴顺序旋转）、orbit_point（圆周运动点）、axis_compare（阈值比较）、any_greater（多值超阈值）；B 类机制模式（模式可复用、按项目参数化）——定时器序列调度（scheduler 调用流注册 start_timer 序列 + trigger 事件流按 timerName 分发）、MB 分发（seg → multipleBranches → 子复合）、输入锁+解锁（tab_lock）、信号封装（复合内 sendSignal + 图级 onSignal）、混合复合（事件旁路+调用流）；C 类玩法特定（仅作编写范例）。复用判定标准：inputs/outputs 全为通用标量/vec3 且不读图变量/不依赖实体状态 = A 类直接复制；依赖 start_timer/事件/信号 = B 类按模式重写；依赖特有状态 = C 类只借鉴结构。目录见 game-from-scratch 技能 references/composite-authoring.md 第 5 节与使用指南第 7 节。

#### 适用边界

资产全部来自 rubik v20 已验证生产代码（游戏核验通过）；A 类复制的直接适用性基于接口纯数据化判定，跨项目仍需编译+体检+游戏核验；B 类为模式级指导，实现细节随项目参数化；目录为 2026-08-15 快照，新增资产应持续补充。

<!-- CLAIM:END clm_7FA04F29CA2F39F00CB435A903 -->

<!-- CLAIM:START clm_0F10FA742D2A96EA8D299D4173 -->

### 复合节点资源库：13 类通用复合节点资源包 + 策展流程（从社区资源包提炼）

docs/composite-library/ 沉淀了从社区「常用复合节点大全 v1.7」资源包（87 个复合节点）逆向整理的 13 类通用复合节点资源包（变量运算/随机/定时器/实体查询/销毁/玩家/逻辑/枚举转换/矩阵/排名/语音/特权玩家/通用思路），每类含用途/节点清单/通用方法论/复用提示。跨资源包通用方法论已回灌 dsl-nodegraph-development 技能「通用复合节点模式库」一节：三段式骨架（读-算-写、查列表-遍历-取值、随机取一、位置生成、事件动作）、关键技巧（动态列表转静态、哨兵值+自增、空模型当结构体、跨实体读写变量、枚举转值 one-hot+加权/查表）、负载意识（重操作拆帧/间隔、选对数据结构比优化算法更有效、轮询 vs 事件按频率选、局部变量优先于节点图变量）、复用前置条件（挂载位置/依赖变量/定时器名不重复）。关键认知：资源包里复合节点的名字在 comments 字段（作者中文注释），name 字段为空；注释是资源包的核心价值，没有注释的复合节点无法复用。策展流程固化在 curation-process.md（读资源包→分类→提炼方法论→落盘+回灌→PKC 落盘），用于后续把 2x2/3x3 魔方等项目的复合节点抽象成资源包。

#### 适用边界

可复用复合节点资源库的目录结构与策展流程；不包含具体复合节点的逐节点 wire 细节（那是 gil-node-graph-reading 的职责），也不替代 composite-usage-guide 的接口设计方法论。

<!-- CLAIM:END clm_0F10FA742D2A96EA8D299D4173 -->

<!-- CLAIM:START clm_213B9BC24AE31BB588E9D9A7BC -->

### 复合节点定时器序列调度 + 循环物化/节点预算 + rubik 2x2→3x3 写法演进（第二轮魔方抽象）

docs/composite-library/ 第二轮从 rubik-2x2/3x3 完整精读抽象出三个通用知识。①定时器序列调度（timer-scheduling.md）：scheduler（调用流，设定时器）+ trigger（事件流，whenTimerIsTriggered 分派）分离；分派方式从 2x2 的「N 个 timerName 分支」演进为 3x3 的「handlerMode/handlerBase 变量 + multipleBranches 2 分支单次调用」（节点爆炸解法）；长序列分 chunk 链式衔接；解锁用独立 unlock 定时器从最后块实际启动时刻计时长。②循环物化与节点预算（loop-node-budget.md）：两个硬限（节点<3000 拒载、单记录帧<3000 截断）要同时算；build 期 JS for 展开=节点多帧少、运行时 finiteLoop=节点少帧多，迭代体小用展开、体大用循环、折中 temp 展开写回循环；循环不变量提升（循环内不变表达式提到循环外只建 1 次）；全 0 int_list 两阶段复位（先非 0 哨兵撑满再写真实 0）；置换类操作两阶段读写（先读入 temp 再写回，防多对多互相覆盖）。③rubik 2x2→3x3 写法演进（rubik-evolution.md）：命名前缀分层（gsts_*→math_/logic_/flow_/motion_/view_*）；逻辑状态字典→列表+finiteLoop；定时器调度 N 分支→mode 变量化；单图→主图+视觉图+跨图同步；错峰相位运行时随机→预生成常量表。

#### 适用边界

复合节点编排层的可复用设计模式（调度/循环/拆图）与项目演进经验；不包含具体玩法状态（魔方的置换表/朝向表等玩法特定数据），也不替代 composite-usage-guide 的接口设计方法论。

<!-- CLAIM:END clm_213B9BC24AE31BB588E9D9A7BC -->
