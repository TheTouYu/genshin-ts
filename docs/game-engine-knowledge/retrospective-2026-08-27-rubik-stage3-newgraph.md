# 完整复盘：魔方 3×3 中二层 stage 3 独立图（2026-08-27）

> 范围：从 stage 3 首次实现（c710ba2）到运行时死循环修复（60222d7）的完整一波：宏表生成→solverPlan 加分支→预算超限拆新图→用户复测报错→日志定位→修复注入。
> 视角：E 层棱块求解 + 跨图复用复合 + 预算红线 + 运行时验证。
> 证据：提交 c710ba2/538f397/3aad8bf/084c06d/60222d7；日志 2026-08-27_21-28-09_2944_110170759.gia；真实 GIL 读回。
> 状态：修复已注入（ok 7 fail 0）+ resync md5 一致（367ad52a）；**待用户游戏复测**。

## 一、错误谱系总览

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 08-27 | 预算口径 | stage 3 塞 solverPlan：gameNodeCount 3198，我按 3000 当红线以为可进，用户更正单图红线 2000 | 按用户指示拆新图 solverEPlan（1742+121 均达标） | 538f397 |
| 2 | 08-27 | 图表冲突 | solverEPlan 与 solverPlan 同实体同名图变量（solveBuf/sep/seo/phase…）→ 曾疑共享冲突（实证为按图隔离，无冲突） | 读日志确认 solverPlan phase 恒 0，未发生双规划器 | 调查后否决 |
| 3 | 08-27 | 复合变量依赖缺失 | solverEPlan 复用 solverAppendCode，漏声明其依赖的 CF_MOVE_CODE_FACE/DIR/STEPS → 引擎报「变量名字对不上」→ 追加全失败 → solveLen=0 → solver 空序列 → 无限循环 | 补三个表变量 + solveBuf 哨兵 | 60222d7 |
| 4 | 08-27 | 列表短物化 | solveBuf 全 0 声明被引擎物化成 25 项（非 100），越界写被丢弃（日志：写 0..99 后仍 25 项） | solveBuf 尾部加哨兵 1n | 60222d7 |

## 二、最近一次错误的完整调查链（现象→差分→根因→修复→验证）

**现象**（用户反馈）：自动还原后一直循环，触发两个报错——「变量名字对不上」「索引越界」。

**日志取证链**（日志 2944，逐帧）：
1. solverEPlan 循环模式：op5 重算（1826 帧 clearBuf）→ pStep1 读状态（369 帧）→ pStep2 算 mask（54 帧，solveMask=2 正确）→ pStep3 查表（327 帧）→ pStep4 追加（59×2 帧）→ 完成（26 帧）→ op6。
2. 铁证 A：pStep4 完成帧 Get Node Graph Variable solveBuf 返回 [0×25]；帧 solveLen=空(0)；发布 solve_seq=[0×25]。
3. 铁证 B：solver 收 op6 → Get Custom Variable solve_len=0 → Greater Than 0>0=false → 空序列分支 → doneTick → op5 → 无限循环。
4. 根因锁定：solverAppendCode 复合内 getNodeGraphVariable('CF_MOVE_CODE_FACE/DIR/STEPS') —— solverEPlan 未声明这三个图变量（只声明了 CF_E_*），引擎读不到 → 「变量名字对不上」；追加静默失败 → solveLen 恒 0。

**为什么不是别的**：
- E 宏含 code=0（U 转）——不是全 0 列表问题的主因（宏序列含 2/8/6/12 等非零值），真正的 25 项短物化只出现在从未成功写入的初始阶段；
- 同实体变量共享假说——读 solverPlan 后续 op5 记录，phase 恒 0（未复算），证明图变量按图隔离，无共享冲突。

**修复**：① solverEPlan 补 CF_MOVE_CODE_FACE/DIR/STEPS 导入+变量声明；② solveBuf 声明尾部加哨兵 1n（101 项，防全 0 短物化）。
**验证**：编译 7 GIA 全绿 → 注入 ok 7 fail 0 → 回读真实 GIL 确认三个变量已存在 → 预算 121 达标 → resync md5 一致。待用户游戏复测（E 层应开始真正转动并逐步归位）。

## 三、为什么反复出问题——系统性根因（3 条）

1. 跨图复用复合时，未核查复合的图变量依赖清单。solverAppendCode 是现成复合，我按「复制调用即可」使用，没查它内部 getNodeGraphVariable 依赖了哪些变量。教训：新图调用任何现成复合前，先 grep 该复合体内全部 getNodeGraphVariable 名，逐一核对目标图 variables 已声明（同族检查：solverEdgeState→sep/seo、solverClearBuf→solveBuf 都核过，唯独漏了 solverAppendCode→CF_MOVE_CODE_*）。
2. 预算口径凭旧文档（3000）判断，没有先问用户/查最新红线。用户 08-24 就定义过 engineExpanded ≤2000，但文档正文写的是「3000 拒载」；我把 3000 当生产红线，导致先做了一版必然超限的方案。
3. 「编译/注入成功 ≠ 运行时正确」的验证链缺失一环：离线算法验证全绿、读图结构验证通过，但没有任何一步验证运行时复合能否读到全部依赖变量。变量名错误只在游戏运行时报（用户发现）。

## 四、流程与方法论教训

- 有用：debug-log-investigator 逐帧取证——pStep4 完成帧的 solveBuf=[0×25]/solveLen=0 与 solver 的 solve_len=0 直接锁定循环；铁证原则（真实日志优先）避免了猜变量共享的弯路（虽然猜过，但用日志否决了）。
- 绕路：先在「变量共享冲突」上花了几步（比对 IR 声明、读 GIL 变量），日志否决后才转向复合依赖核查。改进：遇到「两个图同实体+同名变量」先查日志（phase 是否被串改），别先猜引擎语义。
- 缺口：新图交付前应有「dry-run 一循环」验证——注入后读一轮日志断言 solve_len>0 和状态变化，而不是只等用户复测。

## 五、风险探索与未闭合项

- [ ] 待用户复测：E 层是否真正转动并完成（本次修复核心验证）。
- [ ] 25 项短物化长度的机制未完全解释（此前实证是 2/3 项，本次是 25 项）——已用哨兵规避，但「长度由什么决定」仍开放。
- [ ] solverEPlan 与 solverPlan 同实体同名图变量按图隔离已实证，但建议长期用 e 前缀命名隔离，防编辑器编辑/引擎版本变化风险。
- [ ] npm run build 被另一会话未提交的 football TS7009 阻断（--noEmitOnError false 绕过）——不属本波范围，已记录。

## 六、产出清单

- 修复：examples/rubik-3x3/src/solverEPlan.ts（+CF_MOVE_CODE_*，+solveBuf 哨兵）——提交 60222d7
- 新图：examples/rubik-3x3/src/solverEPlan.ts（stage 3 独立图）——提交 538f397
- 生成器/验证：tools/gen-e-layer-tables.mjs、tools/verify-e-layer-macros.mjs、src/eLayerTables.ts——提交 c710ba2/538f397
- 文档：rubik-autosolve-playbook.md、PROGRESS.md、node-graphs.md（2000 红线）、dsl-nodegraph-development/SKILL.md、cross-graph-sync.md——提交 084c06d
- 复盘：本文件 + open-items 登记 + AGENTS.md 预算红线补注
