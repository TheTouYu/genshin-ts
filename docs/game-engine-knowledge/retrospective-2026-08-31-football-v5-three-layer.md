# 完整复盘：足球 v4→v5 三层架构重构（2026-08-31）

> 范围：单日会话——用户提出"使用层/逻辑层/渲染层信号化"架构设想起，至编译器根治 + 执行流环修复止。
> 视角：主代理全历程（架构设计→DSL 交付→资产落盘→注入核验→编译器修复→环修复）。
> 证据：提交 7f7c637 → 7927753 → ae9f27b → 74e5540 → f46701b → 9ca8446；地图 1073741908 备份链
> （.gsts/backups/ 5 份）；ARCHITECTURE-V5.md；本轮会话上下文（未压缩）。
> 状态：静态验证全绿（预算 648 / 24 def 无重名 / 0 环）；**游戏内核验 pending**（用户未回报进图结果）。

## 一、错误谱系总览

| # | 阶段 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | DSL 编译 | DSL 用法 | 根图 handler 内 `registerExecNode`+数组参数被转换器包装为 `assemblyList`（复合内合法、根图必须用 `f.xxx` helper） | 脚本批量 helper 化 + 删失效 connect | 7927753 |
| 2 | 信号注册 | 资产工具 | `ball_impulse(vel:vec3, spin:vec3)` 重复非 str 类型 fail-closed（无同构 donor） | 协议修订：`ball_kick(tabId:int)` + spin 走黑板 | ae9f27b |
| 3 | def 清理 | 认知缺口 | def-clean 误删 `1610700018`（多 gia 共享复合跨图 ID 不同，按单 gia 视角误判为残留）→ carried_tick 悬空 | 建跨 gia 全量引用图后再删 | 74e5540 |
| 4 | 节点预算 | 架构 | 入口全挤 logic 单图 → 预测 7448 拒载（`ballApplyImmediate` 展开 914/实例 ×多实例） | 拆 input.ts 使用层输入图（预算分载 622→648） | 74e5540 |
| 5 | 编译器 v1 | 算法 | 归一流式处理 + localIds 原地挡板 → 单 doc 内制造同 ID（integrate/goal_collide 撞 1610700006） | 重写两遍式（全局权威→统一消解） | f46701b |
| 6 | 编译器 v2 | 数据语义 | 签名含进程内节点 id 基数噪声 → 同名同源恒被判"版本冲突"（先误诊加 throw，真实输入必炸） | 同名即归一（签名仅告警） | f46701b |
| 7 | 编译器 v3 | 算法 | 权威快照失效：权威 def 被挪隔离段后跟随者仍 remap 到旧 ID → goal_collide 与 dribble_decide 撞 ID | 权威链修正（被挪时更新权威表，跟随者动态取最终 ID） | f46701b |
| 8 | DSL 用法 | auto-chain | `ballPhysTick` MB 分支内 `connect(分支复合, c2)` 方向写反，与 auto-chain 的 c2→MB 成环（引擎报"执行流循环"） | 删四条反向 connect（分支复合由 MB 出口 auto-chain 驱动） | 9ca8446 |
| 9 | 验证方法 | 工具盲区 | impl 环扫描假阴性：`parse --graph <implId>` 报"未找到节点图"被 `except: continue` 静默吞 → "ALL CLEAN" 假结论 | 改用 `read --composite` 文本输出解析重扫 | 9ca8446 |
| 10 | 工具缺陷 | 已知未修 | `check-gil-composite-refs` 签名比对受进程 id 噪声干扰（per-gia 视角误报"错位"） | 人工核对接口排除；工具改进登记 open-items | — |

## 二、最近一次错误（执行流环）的完整调查链

**现象**：用户游戏启动报"ball_phys_tick 有执行流循环"（前一轮还报过 motion_instant 循环 + 编辑器可见重复复合）。

**调查**：
1. 主图 flow 扫描（parse --json + DFS）→ 无环；
2. 全 impl 扫描 → "ALL CLEAN"——**假阴性**：脚本用 `parse --graph <implId>` 逐图读，impl 图不能这样直读（工具报"未找到节点图"），`except: continue` 静默吞掉全部失败；
3. 换 `read --composite 1610700024` 直接看原始输出 → 环肉眼可见：`n5→n6(MB)→n8(fly_tick)→n5`；
4. 回源码定位：`ballPhysTick` 四条 `f.connect(c, 0, c2)`——connect(源=分支复合, 目标=上游 c2)，与 auto-chain 串好的 c2→MB 闭合。

**修复与验证**：删四条 connect（分支内复合由 MB 分支出口 auto-chain 驱动）；重编译注入后 read 验证纯树形；全量 24 impl 重扫（read 文本解析）0 环；21 个多入边逐一核查为互斥分支合法汇聚。

## 三、系统性根因（为什么反复出问题）

1. **"单图思维"范式缺口（最大根因）**：v4 单 gia 时代成立的隐式假设——def ID 项目内唯一、复合注册序稳定、注入幂等——在 v5 多 gia 并发下全部失效。错误 #3/#5/#6/#7/#10 全部同源：编译器、检查工具、清理决策各自持有"单图视角"。**多图项目的每一层（编译器/工具/DSL/清理流程）都必须显式回答"跨图共享时怎样"**，此问题的编译器层已根治（f46701b），工具层仍是遗留（#10）。
2. **验证工具的静默失败比无工具更危险**：错误 #9 的 `except: continue` 把 30 次解析失败变成一条 "ALL CLEAN"——验证链每一环必须断言"工具真的检查了 N 个对象"，而不是"跑完没报错"。
3. **auto-chain 与手动 connect 的交互是 DSL 隐性雷区**：直线语句序自动串链 + 手动 connect 可能双连（多入边重复执行）或反向成环（错误 #8）。分支内复合调用**不需要也不应该**手动 connect。

## 四、流程与方法论教训

**有效**：
- `read --composite` 的逐节点原始输出是定位执行流环/接口错位的金工具（肉眼可读 + 可解析）；
- 两遍式（全局收集权威 → 统一消解）是 ID 协调类问题的正确算法形态——流式逐条处理在 ID 空间重叠时必然出错（#5 教训）；
- `--output` 候选验证再 `--write` 的流程在三轮 def-clean 中把误删（#3）控制在候选回读阶段；
- 用户报错原文（点名复合名）直接导向 `read --composite <该复合>`，比全量扫描快一个数量级。

**绕路**：
- #1 先误诊为"多行数组格式"跑了单行化脚本（无效）——应先看转换产物 .gs.ts 差异再动手；
- #6 先按"真版本冲突"加 throw——真实输入一跑就炸；对"签名"这类含噪声的判据，应先在真实数据上验证判据本身的可比性；
- #9 的环扫描脚本在对象不可达时静默通过——写验证脚本时没先断言"扫描对象数 == 预期数"。

## 五、风险探索与未闭合项

- **游戏内核验 pending**：静态三项全净（预算 648 / 24 def 无重名 / 0 环），用户尚未回报进图结果——最终裁决悬置；
- **check-gil-composite-refs 签名噪声**：进程无关签名（节点 id 归一化哈希）待做；
- **ir_merge 旧测试**：`ir_merge_composite_id_collision_test.ts` 在本轮改动前就挂（断言过时：stub/full 同 ID 共存是新设计），待修或删；
- **check 工具的 per-gia 视角**：多 gia 项目的 incoming 检查应支持"全 gia 并集"模式；
- **CARRIED 浮空防御 / DEFERRED 一拍延迟**：文档已标注的复测项，游戏核验时观察。

## 六、产出清单

- **代码**：v5 全套（logic/input/render/dribble-v5 四根图 + ball-state/ball-phys/ball-render 三复合库 + signals v5 协议 + v4 fragment 化）；编译器 `ir_merge.ts` 跨图 def ID 归一；`ballPhysTick` 环修复。
- **测试**：`tests/ir_merge_composite_name_unify_test.ts`（四场景回归）；quicktest 67 GIA 无回归。
- **文档**：`examples/football/ARCHITECTURE-V5.md`（架构/资产清单/验证分层/回滚）。
- **地图资产**：信号 ×5 注册、球实体变量 ×5、渲染图 829 + 输入图 826 挂载、三轮 def-clean（36→24 def 无重名）。
- **本复盘 + 技能迭代**（见下节）。

## 七、知识落盘（技能迭代）

按本轮实际加载技能逐个检查：

1. **dsl-nodegraph-development**（迭代 ✓）：新增三条 DSL 铁律——根图 handler 必须用 f.xxx helper（registerExecNode 数组仅复合内合法）；MB/doubleBranch 分支内复合调用勿手动 connect（auto-chain 驱动，手动回连成环）；跨图共享仅实体自定义变量（图变量不跨图）。
2. **gil-node-graph-reading**（迭代 ✓）：impl 图不能 `--graph` 直读（用 `read --composite`）；环扫描必须断言扫描对象数；read 文本输出的环检测正则模式。
3. **gil-node-graph-editing**（迭代 ✓）：def-clean 前建跨 gia 全量引用图；per-gia incoming 报告在多 gia 项目的误报判读。
4. **genshin-ts-asset-operations / gil-node-graph-reading 其余 / task-retrospective 自身**：已检查，本轮无新增迭代点（资产流程按技能执行顺利，未遇流程缺口）。
