# 完整复盘：复合化攻坚与长期进化（2026-08-13 ~ 08-14）

> 范围：最近两天全部知识 + 今日主要变更
> 核心：围绕"长期进化"方向；映射中期目标（项目性能 / 从零写游戏核心技能 / 核心出错点）
> 数据：83 个提交（20 knowledge / 7 skill / 22 fix / 15 feat）+ PKC 50 claims

---

## 一、两天知识全景（按主题归组）

### 1. 复合节点规则链（#10 ~ #21，主战役）

| 编号 | 规则 | 证据层级 | 状态 |
|---|---|---|---|
| #10 | connect 支持 FlowMarkerRef（语义拆分前置） | 生产修复 | 闭合 |
| #11 | compositePins 控制流映射 flow pin 完整性（OutFlow/InFlow） | 游戏失败驱动 | 闭合 |
| #12 | synthetic→ordinary exec 边：IR 源解析 + 目标 InFlow pin（vendor/legacy 双后端） | S12 回归 + 游戏验证 | 闭合 |
| #13 | 复合内事件：f.on(eventName) 注册事件入口（轮 12f wire 闭合） | S13 + 日志 2684 | 闭合 |
| #14 | 大规模复合化：spawn_rubik（70+→1）+ tab_lock（锁门） | 游戏验证 | 闭合 |
| #15 | OutParam 惰性求值语义（读→写派生值必错）+ f.node detached 链尾显式 link | 日志 2685/2686 | 闭合 |
| #16 | 递归复合拆分（spin_block 26→3 等） | 生产实现 | 闭合 |
| #17 | capture 路由：复合输入→子复合调用 = compositePins 路由（保留 capture 标记） | 差分轮 13 + 2688 | 闭合 |
| #18 | getNodeGraphVariable 变量名字面量限制（str pin 编码失败） | S17 回归 | 闭合 |
| #19 | 事件回调中 capture 惰性重求值（跨执行流参数不可见） | 2690 日志 | 闭合 |
| #20 | impl 内部 exec 边→复合调用节点补物理 InFlow pin | 2691 日志 + 读图自检 | 闭合 |
| #20b | 纯事件复合判定（事件+无 outflow+无显式 inflow） | 读图自检 | 闭合 |
| #20c | 多 case 注入流程（每 case 一图 + nodeGraphId 逐一指向） | 复盘沉淀 | 闭合 |
| #21 | 复合族能力：finite_loop / 事件触发语义 / sendSignal+onSignal | 2696 日志全通过 | 闭合 |

**复合化成果**：主图 155→15 节点；22 个复合，层级 2-16 节点；每层打开 5-7 节点（用户标准达成）。

### 2. 编辑器/引擎真实规则（差分轮 1-13 + 用户指导）

- 复合内 get/set 图变量与宿主图完全同构（genericId 337/323 + 变量名字面量 + MapBase 编码）
- dict 输入/输出 ParameterFlow 逐字节相同；嵌套复合 = SysGraph 实例 + compositePinIndex
- 编辑器保存丢 flow pin 不影响游戏（connects 驱动 exec 链）——#12 关键推论
- 事件触发链完全闭合（轮 12f）：复合实例级监听、两级帧、输出序列、无死循环
- **图变量变化不触发事件；仅实体自定义变量（触发=是）触发**
- 选项卡（whenTabIsSelected）需挂载 tabBar 组件实体；**关卡实体运行时默认创建，禁止手动添加**
- 定时器触发事件按 timerName/timerSequenceId 分发（事件载荷字段）

### 3. 工具链从零创建能力调查

| 环节 | 从零支持 | 备注 |
|---|---|---|
| maps:create + 图 | ✅ | 无 donor |
| 实体（官方资源直引） | ✅ | isOfficialResourceId 骨架生成 |
| mounts attach 挂载 | ✅ | type 3 槽 |
| static-assemblies（tabBar 组件） | ✅ | 官方模板 |
| **信号注册（带参数）** | ❌ | **唯一缺口**：参数布局需 donor（待内置布局生成器） |

### 4. 方法论进化（用户亲手教学）

- **卡住时三问**：①规则已有？②10 秒编辑器差分？③天然实验？（AGENTS.md 内联）
- **分层归因**：用法层/设计层/实现层
- **修复后读图自检**（Step 3.5 强制）：编译/注入后先读 .gil 验证结构，通过才交用户测试
- **差分优先**：规则未闭合前不改生产代码"猜"，用编辑器操作/现有状态做天然实验
- **修复后同族扩展检查**（fix-series-extension 技能）
- **多 case 注入流程**：每 case 一图、nodeGraphId 逐一指向、注入后 nodeCount 自检
- **"说了≠做了"**：沉淀必须落到技能/文档/知识树（用户 2026-08-14 明确纠正）

---

## 二、今日主要变更（按战役分组）

### 战役 1：主图定时器全链复合化（v19-v20）
- v19：图内定时器（start_timer 序列）替代 setTimeout 捕获机制，主图 115→15
- #19 修复：事件回调用事件载荷（timerName/timerSequenceId/eventSourceEntity）+ 字面量
- v20：调用流/事件流复合分离（scheduler + trigger），composite_registry 支持纯事件复合

### 战役 2：回归测试 + 自动防线
- S14-S17 回归（capture 路由/事件节点/outflow 分支/detached 链尾/字面量名）
- 覆盖矩阵 dict 族（DICT_KV 变体族，13 族全绿）
- 体检工具 composite-health-check（C1-C4 + C3b 自动防线，篡改检出验证）

### 战役 3：知识沉淀体系
- 技能：verify-injection（多 case 流程）、gil-node-graph-reading（读图自检）、debug-log-investigator（#19/#20 诊断）、gil-node-graph-editing（建图/挂载链路）
- 文档：composite-nodes.md（#12-#21 全规则）、graph-mounting.md（关卡实体教训）
- PKC：50 claims（#16/#17/#20/#21 系列 + 12f 事件链 + P4 实验）

### 战役 4：复合族验证实验（今日后半）
- 从零地图 1073741888（踩坑后重建 4 次：关卡实体×2、tabBar 实体、最终正常实体）
- 三合一实验：finite_loop / whenCustomVariableChanges / sendSignal 全通过（2696 日志）

---

## 三、中期目标映射

### 目标 1：项目性能
- **编译产物体检工具**（最高优先级落地）：四类规则自动防线，篡改检出验证
- **主图从 155→15 节点**：单图负载大幅下降，符合"单图 2000 节点上限"心智
- **图内定时器替代 setTimeout**：消除 100 节点捕获机制开销
- 待推进：信号从零注册内置布局（补工具缺口）

### 目标 2：从零写游戏核心技能
- **game-from-scratch 技能已完善**（旋转教学/组件前置依赖/mounts 挂载/子代理分包）
- **复合节点编写方法论落盘**（composite-authoring.md：两种价值/能力边界/编写步骤/陷阱清单）
- **DSL 生产开发方法论**（dsl-nodegraph-development：受限子集/能力预验证/节点预算/四层交叉验证）
- 本轮新增：**复合使用指南素材齐备**（调用流/事件流复合分类、混合复合模式、5-7 节点标准、已知边界）——待成文

### 目标 3：核心出错点（已沉淀为规则/防线的模式）
1. **exec 边断链**（#11/#12/#20 系列）：复合内 exec 边目标必须物理 InFlow pin——体检工具 C3/C3b 自动查
2. **capture 跨执行流不可见**（#19）：事件回调用事件载荷——composite-nodes.md #19 规则
3. **纯事件复合误判/误用**（#20b/#21）：判定三条件 + 混合复合模式
4. **关卡实体手动添加** → 地图异常（graph-mounting.md 警告）
5. **多 case 注入覆盖** → 互相覆盖（verify-injection 关键点 2b）
6. **OutParam 惰性求值**（#15）：写后读派生值必错 → outflow 分支模式
7. **编辑器保存副作用**（清字面量参数/丢 flow pin）：注入后测试前别保存

---

## 四、长期进化方法论沉淀（本次复盘核心）

### 已固化的进化机制
1. **分层证据体系**：代码层 → 自动回归 → 真实 GIA → 游戏验证（每层独立报告，不混级）
2. **规则→实现→测试回练**：差分拿规则 → 生产实现 → S 系列回归锁规则
3. **知识三层落盘**：技能（可行动）+ 文档（权威）+ PKC（长期记忆）——三处同步
4. **修复后反思三连**：同族扩展？（fix-series-extension）影响面？（体检工具补防线）可复用？（复合使用指南）
5. **用户教学反哺**：每个用户纠正（三问/读图自检/关卡实体/说了≠做了）都落入最小规则文件

### 待推进（复盘后）
1. **复合使用指南** docs/game-engine-knowledge/composite-usage-guide.md（素材已齐）
2. **信号从零注册**：内置官方参数布局生成器（gil_signal_registrations.ts 补池）
3. **高频复合资产化**：分析哪些复合跨项目可复用（orbit_scheduler 定时器调度模式等）
4. **体检工具集成**：纳入 npm test 或 postbuild 自动跑
