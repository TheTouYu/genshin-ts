# 覆盖率矩阵 v2（第二轮复盘 R0 建表）

> 状态：当前推荐（R0 建表 v1；R2 轮按红格逐项清零）
> 口径：43 份单主题复盘（34 窗口 + 9 旧档）= 100% 入档；族 = v1 R1-R10 + 新族候选 R11/R12；
>   ✓ = 含该族案例/规则落点（UI wire 案例归 R12 已按用户裁决更新）。
> 证据分层：本表只记录"哪份文档命中哪族"与"哪层已落盘"；落盘内容本身以各层载体为准。

## 1. 文档×根因族归位总表（43/43）

| 文档（retrospective-） | 主题 | R1 | R2 | R3 | R4 | R5 | R6 | R7 | R8 | R9 | R10 | R11 | R12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-08-14 | 复合化攻坚与长期进化 | ✓ |  | ✓ |  | ✓ |  | ✓ | ✓ |  |  | ✓ |  |
| 2026-08-16-signal-param-default | 灯阵信号第4错·参数默认值 |  |  |  |  | ✓ |  |  | ✓ |  |  | ✓ |  |
| 2026-08-16-signal-registration-series | 灯阵信号五连错谱系 |  |  |  |  | ✓ |  |  | ✓ |  |  | ✓ |  |
| 2026-08-20-rubik-perf-optimization | 魔方2x2性能+注入事故 |  |  |  |  | ✓ |  | ✓ |  |  |  |  |  |
| 2026-08-20-static-dynamic-prefabs | 静态/动态元件CLI+装饰物 |  |  |  |  |  |  |  |  |  |  |  | ✓ |
| 2026-08-21-football-field-arcs | 足球场弧线几何 |  |  |  |  |  |  |  |  |  |  |  | ✓ |
| 2026-08-21-orientation-table-convention | 朝向表欧拉约定 |  |  |  |  | ✓ |  | ✓ | ✓ |  |  |  |  |
| 2026-08-21-rubik-performance-p0-1 | 魔方P0-1性能优化 | ✓ | ✓ | ✓ |  | ✓ |  |  |  |  |  |  |  |
| 2026-08-21-dangling-exec-fix | 悬空exec检测器+修复闭环 |  |  |  |  | ✓ |  | ✓ |  |  |  |  |  |
| 2026-08-22-rubik-record-limit-fixes | 记录3000帧上限修复 |  | ✓ | ✓ |  |  |  |  |  |  |  |  |  |
| 2026-08-22-football-physics-motion | 足球物理运动器模型 |  |  |  | ✓ |  |  |  |  |  |  |  |  |
| 2026-08-23-football-motion-dual-trigger | 双触发437次 |  |  |  | ✓ | ✓ | ✓ |  |  |  |  |  |  |
| 2026-08-23-football-motion-and-rolling | 运动器叠加+弹跳滚滑 | ✓ |  |  | ✓ |  | ✓ |  | ✓ |  |  |  |  |
| 2026-08-23-rubik-cfop-solver-port | CFOP求解器移植 |  |  |  |  |  |  |  | ✓ |  |  | ✓ |  |
| 2026-08-23-rubik-runtime-node-budget | 3054节点预算归因 |  |  | ✓ |  |  |  | ✓ | ✓ |  |  |  |  |
| 2026-08-23-stage3-composite-pin-routing | Stage3复合pin路由 |  |  |  |  | ✓ |  | ✓ |  |  |  |  |  |
| 2026-08-24-rubik-solver-load-tick | 求解负载锚点标定 |  |  | ✓ |  |  |  |  | ✓ |  |  |  |  |
| 2026-08-24-rubik3x3-stage3-turn-lock | 面转锁死四层归因 |  |  |  |  | ✓ | ✓ | ✓ |  |  |  |  |  |
| 2026-08-25-rubik-cross-exec-skip | 十字求解丢尾步 | ✓ | ✓ |  |  |  |  |  |  |  |  |  |  |
| 2026-08-25-rubik-solver-eo-shortlist | eo哨兵+动画负载 |  | ✓ | ✓ |  |  | ✓ |  |  |  |  |  |  |
| 2026-08-26-football-composite-dup-version | 复合重复版本拒载 |  |  |  |  |  | ✓ | ✓ | ✓ |  |  |  |  |
| 2026-08-26-rubik-negative-moveid-series | 负moveId四连错 | ✓ |  | ✓ |  | ✓ | ✓ |  |  |  |  |  |  |
| 2026-08-27-football-auto-timer-chain | auto定时器链 |  |  |  |  | ✓ | ✓ |  | ✓ |  |  |  |  |
| 2026-08-27-football-impulse-transmission | 冲量传导链 | ✓ |  |  | ✓ |  |  |  |  |  |  |  |  |
| 2026-08-27-football-motion-chain | 运动链delta放大 | ✓ |  |  | ✓ |  |  |  |  |  |  |  |  |
| 2026-08-27-multiple-branches-10-case | MB 10-case上限 |  |  | ✓ |  |  |  |  |  |  |  |  |  |
| 2026-08-27-rich-floating-page-greedy | 富版悬浮页贪心事故 |  |  |  |  | ✓ |  |  | ✓ |  |  |  | ✓ |
| 2026-08-27-rubik-stage3-newgraph | 拆图+101拒载 |  | ✓ | ✓ |  |  |  |  | ✓ |  |  |  |  |
| 2026-08-27-rubik-testbench | 独立测试台三轮纠正 |  | ✓ |  |  |  |  |  | ✓ |  |  |  |  |
| 2026-08-27-solvebuf-residual | solveBuf残留 | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| 2026-08-27-ui-cli-development | UI CLI wire开发 |  |  |  |  |  |  |  | ✓ |  |  |  | ✓ |
| 2026-08-28-client-log-flow | 客户端事件线工具 |  |  |  |  |  |  |  |  | ✓ |  |  |  |
| 2026-08-28-client-server-call-chain | 客户端图调用链读法 |  |  |  |  |  |  |  |  | ✓ |  |  |  |
| 2026-08-28-football-dribble-speed | 带球测速降级 |  |  |  | ✓ |  |  | ✓ |  |  |  |  |  |
| 2026-08-28-full-log-skill | 完整游玩日志技能 |  |  |  |  |  |  |  |  | ✓ |  |  |  |
| 2026-08-28-op6-missing | 漏发op6握手 |  | ✓ |  |  |  | ✓ |  |  |  |  |  |  |
| 2026-08-28-regression-fix | 黑块回归2956 | ✓ |  |  |  | ✓ |  | ✓ |  |  |  |  |  |
| 2026-08-28-rubik-client-graph-reading | 客户端图读法闭环 |  |  |  |  | ✓ |  |  |  | ✓ |  |  |  |
| 2026-08-28-solveseq-race | solveSeq竞态2954 | ✓ |  |  |  |  | ✓ |  |  |  |  |  |  |
| 2026-08-28-top-layer | 顶层OLL/PLL越界 |  | ✓ |  |  |  |  |  | ✓ |  |  |  |  |
| 2026-08-29-client-graph-skillconfig | 客户端图创建+技能配置 |  |  |  |  | ✓ |  |  | ✓ | ✓ | ✓ |  |  |
| 2026-08-29-rubik3x3-client-round0 | 客户端化Round0 |  |  |  |  | ✓ |  |  | ✓ | ✓ |  |  |  |
| 2026-08-29-variable-game-verify-matrix | 变量系统核验矩阵 |  | ✓ |  |  | ✓ |  |  |  |  | ✓ |  |  |


## 2. 旧 9 份复盘归位结论 + 新族候选表

### 2.1 归位结论（全部落到 v1 族 + 2 个新族，无需第 3 个新族）

| 旧复盘 | 归位 | 结论 |
|---|---|---|
| 08-14 复合化攻坚 | R1（#19 capture 惰性重求值）、R3（主图 155→15）、R5（读图自检）、R7（#11/#12/#20 exec 边物理 InFlow）、R8（三问/关卡实体/说了≠做了）、R11（信号注册缺口 origin） | v1 多族的方法论源头；**信号注册缺口= R11 的前史** |
| 08-16 信号参数默认值 | R11 + R5 + R8 | 三版本差分 + 写回后重载编辑器纪律 |
| 08-16 信号五连错 | R11（×5 案例） + R5（缺陷 B/C） + R8 | **R11 主源**：版本一致性/下限/阈值/默认值/布局 |
| 08-20 魔方性能+注入事故 | R7（残留旧复合类型错位 + dup physical route） + R5（自检盲区） | 与 v1 R7 同族并集 |
| 08-20 静态/动态预制体 | **R12**（模板残留宿主 ID/三级写回链/浮点精度/挂载语义/ID 分配） | R12 主源之一 |
| 08-21 足球场弧线 | **R12**（旋转公式 z 镜像/凸向/端点约束/acos 符号） | R12 主源之二（几何子类） |
| 08-21 朝向表约定 | R8（写生成器前未读权威文档） + R5（只验位置不验朝向） + R7（*_list 参数标量编码） | 归位不产生新族 |
| 08-21 魔方 P0-1 | R3（10s 滚动窗口负载） + R1（blockOrientPre 快照） + R2（288 项>100） + R5（索引缓存盲区） | **R1/R2/R3 各 +1 案例** |
| 08-21 悬空 exec | R7（悬空 exec 边×4 + 双入边 + 检测器边界） + R5（分层证据链） | R7 的 DSL 用法子类主源 |

### 2.2 新族候选表

| 候选 | 名称 | 命中案例 | 主源 | 与 v1 的关系 |
|---|---|---|---|---|
| **R11** | 信号注册编码族 | 版本一致性 / 版本下限 / 版本阈值 / 参数默认值 / 参数布局 / 注册前置（无参信号需 donor） | 08-16 两份 + 08-14 缺口 + 08-23 cfop #6 | v1 无对应族；引擎拒载无日志 + 样本字节语义化是独特特征 |
| **R12** | 静态拼装族 | 模板残留 ID / 三级写回链 / 浮点精度 / 挂载语义 / ID 分配 / 几何公式 / 端点约束 / 符号断言 / **UI wire 子类**（用户裁决归入：ui-cli 7 条 wire 错误 + rich-floating 引用完整性） | 08-20 prefabs + 08-21 arcs + 08-27 UI 两份 | v1 无对应族；静态资产 wire 编码与几何推导是独特特征 |

## 3. 根因族×五沉淀层状态

## 3. 根因族×五沉淀层状态（绿=已落盘且核验 / 黄=部分或待查 / 红=缺失）

| 族 | 复盘 | 权威文档 | 技能 | PKC | 账本 |
|---|---|---|---|---|---|
| R1 重复求值 | 🟢 10 文档 | 🟡 无独立权威章节（技能+PKC 承载） | 🟢 4 铁律在位（lint 门禁属工具层缺口，O-26-2 账本跟踪，不计沉淀层红格） | 🟢 clm_6583EB7（bnd_83bb3685） | 🟢 O-26-2/O-27-02 在册 |
| R2 列表语义 | 🟢 9 文档 | 🟡 同上 | 🟢 列表规则表+哨兵/补整块 | 🟢 bnd_83bb3685 列表三规则 | 🟢 O-27-08/O-27-01/O-29-07 在册 |
| R3 负载预算 | 🟢 10 文档 | 🟢 node-graphs.md 2000 红线 + control-flow-api-cookbook 10-case | 🟢 锚点标定法+预算检索优先级 | 🟢 clm_645571FF（bnd_81d5378d 已 apply） | 🟢 O-27-01 在册 |
| R4 运动器传导链 | 🟢 6 文档 | 🟢 motion-devices.md 定点器叠加 | 🟢 直接速度驱动+buff 降级 | 🟢 bnd_83bb3685 传导链 | 🟢 O-27-03 在册 |
| R5 验证链盲区 | 🟢 ~13 文档 | 🟡 分层证据分散各文档 | 🟢 C1 统一验证清单已回灌 dsl 技能（R2） | 🟢 clm_20EC2BE4（已 apply） | 🟢 O-26-5 在册 |
| R6 状态机协议 | 🟢 11 文档 | 🟡 无独立章节 | 🟢 握手三件套/重置清数组/pos 入参 | 🟢 clm_ED54D8AD（已 apply） | 🟢 O-28-02/O-27-09 在册 |
| R7 复合/注入器残留 | 🟢 12 文档 | 🟢 composite-nodes.md + gil-structure-semantics | 🟢 Step 3.5 全量校验+exec 边健康 | 🟢 clm_449F516A（已 apply；多版本残留 clm_3EC5CF42 早已在树） | 🟢 O-27-05/O-23-2 在册 |
| R8 需求方法论 | 🟢 16 文档 | 🟡 AGENTS.md 三问（纪律层） | 🟢 复盘技能最小单元+定时器单位 | 🟢 clm_E9757EBD（已 apply） | 🟢 无 OPEN（纪律闭环） |
| R9 客户端图 | 🟢 6 文档 | 🟢 gil-structure-semantics 客户端图 ID 段 + debug-log-format f8/f3 | 🟢 reading Step 2.8 + debug-log ops/事件线 | 🟢 clm_D1A2 + bnd_f8e9a327/efba42/ae7c7e87 | 🟢 O-28-05 **已闭合 771cd42** |
| R10 变量系统 | 🟢 2 文档 | 🟢 variables.md dict verified 双实样 | 🟢 assets ops + variables:verify | 🟢 查证已在树（clm_E14B322C 矩阵协议+clm_070E69D1 变量体系） | 🟢 O-29-01 在册 |
| R11 信号注册编码（新） | 🟢 4 文档 | 🟢 signals.md 参数布局/默认值规则 | 🟢 editor-incremental-gia-investigator 差分+hash 核对 | 🟢 **查证已在树**（一致性 clm_6C4D0D6A/下限 clm_1A1C5E0F/阈值 clm_3FA4D090/默认值 clm_168E839F/布局 clm_ABB786BA/工具链 clm_747B855B） | 🟡 客户端信号默认载荷未闭合（signals.md 风险项） |
| R12 静态拼装（新） | 🟢 4 文档（含 UI wire 子类，用户裁决归入） | 🟢 gil-structure-semantics 静态/transform/装饰物 | 🟢 static-gil-model-builder | 🟢 clm_A559EA2D（已 apply + 检索调优：topic 关键词去竞争 + claim 标题修订 + 评估夹具 expected_topic_ids 用户批准更新） | 🟡 root46 判别未闭合（O-20-1） |


## 3.1 R3 复核结论（2026-08-29 提交前）

- **红格 = 0**：沉淀层五列（复盘/权威文档/技能/PKC/账本）已无红格；剩余黄格均为
  「最小规则文件原则下的有意不新建权威章节（R1/R2/R5/R6/R8，技能+PKC 双承载）」与
  「账本 2 项引擎/未验证项（客户端信号默认载荷、root46）」，非缺失。
- **R 族 100% 有二级卡片**：root-cause-family-cards-v2.md R1-R12 全量（约 130 案例行）+ 跨族修复模式 8 卡。
- **43/43 文档入档**：§1 表 43 行复核通过。
- **客户端图名字断言（R3 实测）**：parse-gil-node-graph.ts 对 1913 图 1082130436 --json →
  多分支×26 / 设置局部变量×38 / 获取局部变量×22 / 获取自定义变量×8 / 服务端错名=0 / 191 节点，全 PASS
  （与 771cd42 基线一致）。
- **PKC delta check + finalize**：三个 plan 全部 delta 通过、finalize ok:true 0 errors
  （bnd_81d5378d / bnd_f5dc558f / bnd_253802ff，用户逐 hash 确认后 apply，validate ok 357 claims）。
- **git diff --check**：各批次提交前均 CLEAN。

## 4. 红格清单与清零计划

| # | 红格 | 清零动作 | 轮次 |
|---|---|---|---|
| 1 | PKC：R3/R5/R6/R7/R8/R11/R12 七族 + M2-M9/M11-M15 方法论 | ✅ 完成：R11 查证已在树；六族+十二方法论 capture → **339 → 357 claims**（三个 bundle 全部经用户精确 hash 确认并 apply：bnd_81d5378d 主 capture、bnd_f5dc558f topic 检索调优、bnd_253802ff claim 标题修订；评估夹具 expected_topic_ids 更新经用户批准）；validate/rebuild/tree 通过 | R2 |
| 2 | R5 技能：C1 统一「修复交付前验证清单」未聚合 | ✅ 已回灌 dsl-nodegraph-development 技能「修复交付前验证清单（C1，六项）」 | R2 |
| 3 | R1 防线：lint 门禁（O-26-2）+ 编译器自动物化（O-27-02） | 工具/编译器层，非知识任务，保持账本跟踪 | R3 |
| 4 | R2 工具：chunking（O-27-01）+ 字面量丢值（O-29-07） | 同上，编译器层 | R3 |
| 5 | 权威文档 🟡 四格（R1/R2/R5/R6/R8） | ✅ R2 评估完成（最小规则文件原则）：四族规则均已在 dsl/reading/debug-log 技能 + PKC 承载，**不新建权威文档**（避免双写漂移）；R5 已聚合 C1 清单进技能 | R2 |
| 6 | R10 PKC 🟡、R11/R12 账本 🟡 | ✅ R2 查证完成：R10/R11 已在树（见 §3 表）；账本 🟡 两项（客户端信号默认载荷、root46）保持跟踪，不新增 O- 条目 | R2 |

## 5. 差异清单（交用户裁决，不擅自改结论）

1. **地图 34 vs 32**：任务书"全量 34 张"实为 32 主档 + 1839 备份/调试两变体（变体 PARSE_FAIL）。
   矩阵按 32 主档出（map-graph-type-matrix.md §5）。
2. **10 张 graphs=[]**（1909/1892/1866/1880/1862/1865/1879/1894/1897/1898）：工具读回 0 图，
   此前无盘点结论——是"真无图"还是工具盲区，请裁决是否复核。
3. **UI 页面 wire 案例归属**：~~待裁决~~ → **已裁决（用户 08-29）**：R8 保留过程纪律案例，
   wire 编码案例归 **R12 wire 子类**（ui-cli-development、rich-floating-page 归入 R12）。
4. **v1 R9 缺口已过期**：O-2026-08-28-05（客户端图错标名）在当前 HEAD 已闭合（771cd42，
   191 节点实测 0 错标 0 占位），矩阵已按闭合更新；v1 总纲该缺口标记将在 v2 总纲同步。
5. **PKC 基线实测**：`python tools/pkc.py tree` → 14 nodes / claim_count 合计 **339**，与任务书一致。
6. **魔方 SHA 风险照录**：客户端优化版本当前 SHA 496e1b5d… ≠ 复盘引用 f90ac5438c…
   （地图保存过）；R1 轮引用魔方旧结论前先核对版本差异是否影响结论。