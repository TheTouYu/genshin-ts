# 根因族二级子谱系卡片（第二轮复盘 v2）

> 状态：当前推荐（R0 建 R1 示范卡，R1 轮补全 R2-R12 全部卡片 + 跨族修复模式 8 卡）
> 来源：`retrospective-weekly-2026-08-22-29.md`（v1 族表）+ 43 份单主题复盘交叉合成
> 用途：把 v1 的"族×命中"粗粒度归并细化到**案例级一行**，供后续同族排查直接对照。
> 证据分层：日志帧值 = 唯一铁证（真实 GIL 回读次之）；旧复盘中的"推断"保留标注。

## 卡片模板（每族固定六列 + 防线矩阵）

```text
## R<n> <族名>（v1 命中 N → v2 命中 N'）
一句话定义：<该族本质，引擎机制层面的共同根因>
### 二级子谱系（逐案例一行）
| # | 案例(日志/提交) | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
### 防线矩阵
| 防线 | 位置 | 状态 | 缺口 |
### 缺口与裁决
```

**列语义约定**：
- **现象**：用户可见行为（不含根因术语）。
- **日志帧签名**：该案例在 Beyond_Debug_Log 里的可检索特征（帧数/字段值/交替模式），
  没有日志的标注"无日志（拒载/加载期）"——这本身就是签名。
- **根因子类**：同族内的子类标签（如 R1 下的"分支复用表达式 / 复合输出二次求值 / 写后读"），
  子类必须可在其他案例中复用检索。
- **防线**：目前已落盘的防御（技能铁律/工具/权威文档/PKC claim），注明落点。
- **防线状态**：✅ 已闭环（修复+验证）/ 🟡 修复已注入待用户复测 / 🔴 有缺口。
- **证据源**：复盘文档 + 日志号 + 提交号 + 快照路径（不写推断结论，推断标 `[推断]`）。

---

## R1 图变量重复求值/二次物化族（v1 命中 8 → v2 命中 10）

**一句话定义**：引擎 data 连接**不是值快照**——同一表达式/复合输出被 ≥2 处消费时在每个消费点
重新求值；两次消费之间若写回其输入图变量，第二次求值读到新值。是本周最大错误源
（PKC clm_6583EB7C5B309BEEBEC0F3D035 已收录 v1 版 8 案例）。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 丢尾步 2887 (ad81ea3) | 十字求解"算完"但执行绕路、肉眼看不到还原；每个多步宏漏最后一步 | 续播判定实际读 idx+2（每条宏帧数=宏长-1）；debug-log 技能已收录"二次物化丢尾步帧签名" | 进度计数器复用表达式 nxt | dsl 技能「推进计数器铁律」：续播判定读**已写回的** solveIdx | ✅ 已修复+用户游戏验证 2888 | retrospective-2026-08-25-rubik-cross-exec-skip.md；日志 2887/2888 |
| 2 | negPhase 少 90° 2899 (5766bcb) | 反向面转少 90°（负向只做 2 次逻辑+1 次视觉，期望 3+1） | negDone 记录 25/22 帧交替 ×2 组（最小复现 2899）；2906 同症状 negPhase 1,2,1,2 | 分支复用表达式 ph（实际判 (ph+1)+1） | 分支读已写回 get(negPhase)；**铁律第 3 次被踩（明知故犯）** | ✅ 已修复；🔴 两道防线失效的根因未闭合（lint 门禁 O-2026-08-26-2、编译器自动物化 O-2026-08-27-02） | retrospective-2026-08-26-rubik-negative-moveid-series.md |
| 3 | solveBuf 残留 2931 (abd3673) | 重算后执行错误步骤破坏角块、mask 振荡不收敛 | dbgVal mask 0,1,1,3,2,2,2,3 振荡 + solve_seq 含残留 -1 + 同秒 3 面转 + cp 轨迹角块回退 | 规划器缓冲残留（solveLen=0 但数组残留，新序列尾部读旧 moveId） | dsl 技能「重置必须清数组」（solverClearBuf 4 处清空） | ✅ 已修复+用户验证 2932 | retrospective-2026-08-27-solvebuf-residual.md |
| 4 | solveLen 写序竞态 2954 (37584a8→8aa7350) | solve_seq 重复/跳码 → 宏残缺 → 十字永久破坏（偶发=纯时序竞态） | op5 重算与 pStep4 追加在相邻 tick 对 solveLen 写序交错（离线重放复现，M6 不可能序列判别法） | 跨 tick 写序竞态 | 显式 pos 入参 + 复合内零图变量读写；让位/重算入口统一清 bufPos+solveLen | ✅ 已修复+用户验证 2954；**注意**：37584a8 的实现（复合数据引脚+分支赋值）引发 2956 黑块回归，最终形态=8aa7350 复合内独立 bufPos 游标 | retrospective-2026-08-28-solveseq-race.md |
| 5 | 足球球速×2 (73b0ca6) | 运动器速度=逻辑球速×2 → 真正的"瞬移" | kickApply 的 integ.npos 被消费两次、中间夹 set ballPos（M7 日志成对读：逻辑值 vs 运动器参数差 >2 倍） | 复合输出二次求值 | dsl 技能「物化快照」：tmp* 物化，所有消费点读物化值 | ✅ 已修复 + physSlideTick 同族一并修（e463c1c） | retrospective-2026-08-27-football-impulse-transmission.md / football-motion-chain.md |
| 6 | 黑块回归 2956 (8aa7350) | 修复 2954 后视觉 blockOrient 整体错乱（黑块+位置乱）——**修 bug 引入更严重 bug** | rec13「复合:发送信号」吃到 String=bufPos（set 图变量被错误路由到发送信号节点）；rec22 stage 读空；GIL 回读 call node outputs 悬空 next:Integer | 复合数据引脚+分支赋值变体（nextOut 在 doubleBranch 分支内赋值） | dsl 技能「复合引脚禁令」；回归纪律「修复方案选已验证过的安全模式」（复合内读写图变量=已验证，数据引脚+分支赋值=未验证高危组合） | ✅ 已修复（回退为复合内独立 bufPos 游标，调用方零引脚变化）+用户验证 | retrospective-2026-08-28-regression-fix.md；日志 2956 |
| 7 | kickLaunch 二次重力 (9b0d261) | 轻射/横传首段被二次重力拖低、往草里扎 | 首段轨迹 vs 积分预期差异：先写 ballVel 再消费 integ.* → 引擎按消费点重新积分 | 写后读（先写回图变量再消费其派生表达式） | 「先消费再写回」顺序纪律（setPos → physApplyMotion → setVel/setSpin） | ✅ 已修复+用户验证 | retrospective-2026-08-23-football-motion-and-rolling.md #6 |
| 8 | physFlyTick/physRollTick 同族 (5f2fc97) | goal/ground 二次积分 | 同 #7 机制（先写回 ballPos/ballVel/ballSpin 再消费 integ.*） | 写后读（同族扩展扫描命中） | 单 tick 内物化 tmpPos/tmpVel/tmpSpin 快照，goal/ground 只读快照 | ✅ 已修复 | 同 #7 #8 |
| 9 | capture 惰性重求值 #19（08-14，旧复盘归位） | 事件回调里读到的跨执行流参数不可见（OutParam 写后读派生值必错） | 日志 2690：事件回调 capture 惰性重求值 | 事件回调 capture 跨执行流 | 事件回调用事件载荷（timerName/timerSequenceId/eventSourceEntity） | ✅ 已闭合（composite-nodes.md #19） | retrospective-2026-08-14.md |
| 10 | blockOrient 时序脱节（08-21 旧复盘归位） | 逻辑层写"转动后"朝向，视觉层按"转动前"算自旋轴 | 日志 2797/2799 视觉自旋轴与逻辑朝向不一致 | 共享状态读写时机（pre/post move 消费方语义脱节） | blockOrientPre 快照 + publishShared 发布 pre + flowAfterTurn 同步 post→pre；方法论「改动共享状态前先列清所有消费者及读取时机」 | ✅ 已修复（P0-1） | retrospective-2026-08-21-rubik-performance-p0-1.md |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 推进计数器铁律 / 写后读回 | dsl-nodegraph-development 技能 + PKC clm_6583EB7 | ✅ 在位（v1 §4.1 grep 核对） | 靠自觉，无门禁 |
| 物化快照（tmp* 模式） | 同上 | ✅ 在位 | 复合输出二次求值无编译器自动物化（O-2026-08-27-02） |
| ESLint gsts/server-repeated-evaluation | src/eslint | 🟡 规则存在 | **examples 从不跑 lint，无门禁**（O-2026-08-26-2，红） |
| 规划-执行握手协议 / 重置清数组 | dsl 技能 + PKC | ✅ 在位 | — |

### 缺口与裁决

- 🔴 O-2026-08-26-2（lint 门禁）与 O-2026-08-27-02（编译器自动物化/报错）闭合前，R1 防线靠纪律。
- 案例 4 与 6 是"修复方案选择"的元教训：显式 pos 入参方向正确、实现手段（数据引脚+分支赋值）错误
  ——防线应写成「pos 入参用**已验证模式**实现」（复合内读写图变量），已在技能中。
- 案例 5/7/8 说明"物化快照"必须**同族一次扫全**（kickApply → physSlideTick → physFlyTick/physRollTick），
  这是 fix-series-extension 纪律在 R1 的应用。

---

## R2 列表语义族（v1 命中 8 → v2 命中 9）

**一句话定义**：引擎对 int_list 的物化/初始化/读取有一组**静默硬限**（全 0 短物化、初始化 ≤100、
分块读取按块对齐），超限不报错只丢行为——写图前必须查，不能靠运行时炸。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 全 0 短物化 2766 | 记录上限修复波次发现全 0 列表声明物化异常 | 日志 2766：列表长度与声明不符（短物化） | 全 0 短物化 | 哨兵模式（尾部加非 0 哨兵） | ✅ | retrospective-2026-08-22-rubik-record-limit-fixes.md + 日志 2766 |
| 2 | eo 哨兵 2876 | 只手动转一个面后点自动求解，一直重复 R,R,R | 日志 2876：引擎"全 0 int_list 物化短长度"击中 solver_eo | 全 0 短物化（求解表） | flowAfterTurn 发布 solver_eo 追加第 13 位哨兵 1 | ✅ | retrospective-2026-08-25-rubik-solver-eo-shortlist.md #1 |
| 3 | solveBuf 25 项 2944 | 越界写被丢弃，solveLen=0 → 无限循环 | 日志 2944：写 0..99 后列表仍 25 项 | 短物化→越界写丢弃 | solveBuf 尾部加哨兵 1n（60222d7） | ✅ | retrospective-2026-08-27-rubik-stage3-newgraph.md #4 |
| 4 | 101 拒载 | 哨兵 100→101 触发"列表初始化，最多100个元素"启动拒绝 | 无日志（启动拒载） | 初始化 ≤100 硬限 | 哨兵回退到 100 项（f326224）；E 层宏 ≤8 步短物化不影响正确性 | ✅ | retrospective-2026-08-27-rubik-testbench.md #2 |
| 5 | localAxisTable 越界 2886 | turn/visual 图报"列表索引超出列表长度"，自动恢复失败 | 日志 2886：288 表只 88 项，长列表读第三个 100 分块越界 | 分块越界 | 生成器补整块（补齐到 300，13e3624） | ✅ | retrospective-2026-08-25-rubik-cross-exec-skip.md #1 |
| 6 | 乘法选择器越界 2964 | 追加空 code → 朝向不变死循环 | 日志 2964：longListGetInt9 所有块读同一 offset，末块（3 项）offset=73 越界读返回空 → 污染累加 | 分块越界（乘法选择器） | 生成器补齐所有表到整块 + PLL_ALG chunkSize 96→100（7806e2b） | ✅ | retrospective-2026-08-28-top-layer.md #1 / op6-missing.md #1 |
| 7 | server 列表字面量丢值 | 编译成功但值被丢弃（只写类型锚），读图才见空值 | 编译通过+读图值缺失（静默，无日志） | 字面量静默丢值 | 编译期拦截（b611198，O-29-07 修复层） | 🟡 修复已提交，D2 任务延续 | retrospective-2026-08-29-variable-game-verify-matrix.md #10 |
| 8 | 288 项 > 100 | 游戏报"列表长度超过100" | 无日志（拒载类报错） | 字面量 100 上限 | 分块 moveOrientTransition0/1/2（100+100+88）+ long_list_get_int 复合 | ✅ | retrospective-2026-08-21-rubik-performance-p0-1.md #3（旧复盘归位） |
| 9 | solve_len=16 vs 有效 moveId<16 | 序列长度与有效码不符［推断］ | 日志 2931 系列（与 solveBuf 残留同批） | sl 表达式二次物化候选 | 登记 O-2026-08-27-05 待复测深挖 | 🟡 | retrospective-2026-08-27-solvebuf-residual.md #5 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 哨兵模式 / 生成器补整块 | dsl 技能列表规则表 + PKC bnd_83bb3685 | ✅ 在位 | 复合内无越界防御（08-28 top-layer） |
| 100 上限 / chunkSize | dsl 技能长列表模式 | ✅ 在位 | 编译器 chunking 静默截断（O-2026-08-27-01） |
| 全 0 短物化机制 | — | 🔴 机制未解释 | O-2026-08-27-08 |
| server 字面量丢值 | 编译器 | 🟡 b611198 拦截 | D2/O-2026-08-29-07 延续 |

---

## R3 负载与预算族（v1 命中 7 → v2 命中 10）

**一句话定义**：引擎对帧/节点/case 有一组硬限（单记录 3000f、生产红线 2000 节点、MB 10-case），
全部是**静默失败型**（截断/丢弃不报错）；写图前算"节点预算+单 tick 帧预算"两笔账。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 3002f 截断 2808 | 记录被截断，后续节点不执行 | temp 段 28 + 写回段 978（36%）+ 其他 1300 = 3002 → 截断 | 单记录 3000f 硬限 | 折叠/分片优化；预算设计先行 | ✅ | retrospective-2026-08-22-rubik-record-limit-fixes.md + 日志 2808 |
| 2 | 3054 归因 | 游戏拒载"判定节点异常" | 本地公式 2533 vs 游戏 3054（口径不一致） | 预算口径（游戏内数量才是真值） | 以游戏真实数 + 用户删图实验定位（game 主图 3054→2173） | ✅ | retrospective-2026-08-23-rubik-runtime-node-budget.md #4-6 |
| 3 | 3027f 截断 2894 | 折叠 U3 后 lock 卡死、一切指令无响应 | 日志 2894：27 发只 1 步执行；2895：50s 内 72 次 planTick 全 mask=0 | 折叠副作用单链超限 | 回退正 moveId 展开（53d0e79）；新状态机先写期望执行序列签名 | ✅ | retrospective-2026-08-26-rubik-negative-moveid-series.md #1 |
| 4 | 节拍未标定 | 0.01s tick 每 tick 展开 ~1000 节点 | 0.2s 下约 1095 节点/tick > 面转 0.3s 标定安全率 | 节拍拍值 | 锚点标定法：安全基线 → 节点/s → 0.7s + 15% 余量（bce8cde） | ✅ | retrospective-2026-08-24-rubik-solver-load-tick.md |
| 5 | 动画负载堆叠 2876 | 开日志后自动求解动画阶段被踢 | 视觉图动画槽位记录在相邻秒堆叠成 3000+ 帧/秒 | 动画帧堆叠 | emitTick 1.2→2.2s、doneTick 3→4s | ✅ | retrospective-2026-08-25-rubik-solver-eo-shortlist.md #2 |
| 6 | MB 10-case 2927 | 整转后 12 块缺二段运动 | 12 case 时 orbit22/orbit23 被静默丢弃 | 引擎 case 上限静默截断 | control-flow-api-cookbook 10-case 闭合 + 回退 10 case（0fab0c1） | ✅ 修复；🔴 编译器 chunking（O-2026-08-27-01） | retrospective-2026-08-27-multiple-branches-10-case.md |
| 7 | 2000 红线 | stage3 塞 solverPlan gameNodeCount 3198 | 按 3000 当红线误判（用户 08-27 更正为 2000） | 生产红线口径 | AGENTS.md 2000 红线 + 拆新图 solverEPlan（1742+121） | ✅ | retrospective-2026-08-27-rubik-stage3-newgraph.md #1 |
| 8 | 10s 窗口 34180 | 10 步连打被踢 | 1s 峰值新 6418 < 旧 9439，但 10s 窗口 34180 > 28938 | 持续平均 vs 瞬时峰值 | gia_log.py perf --sec 滚动窗口分析 | ✅ | retrospective-2026-08-21-rubik-performance-p0-1.md #1（旧复盘归位） |
| 9 | 主图 155→15 | 单图负载过高（心智模型建立） | 复合化后主图 155→15 节点、图内定时器替代 setTimeout | 单图节点预算设计 | 复合化 + 节点预算心智 + 体检工具 | ✅ | retrospective-2026-08-14.md（旧复盘归位） |
| 10 | 负载设计铁律 | 0.06s/触发本身即高负载（纪律固化） | —（纪律项，无单一日志） | 高负载形态 | 事件驱动→低频定时器（0.7~1s）→高频轮询；定时器必须有停止条件（AGENTS.md 08-24） | ✅ | AGENTS.md 负载设计铁律 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 2000 红线 + 预算检索优先级 | AGENTS.md + node-graphs.md | ✅ | 客户端图 191 节点是否计预算未验证 |
| 锚点标定法 | dsl 技能 + PKC（M1） | ✅ | — |
| 10-case 上限 | control-flow-api-cookbook | ✅ | chunking（O-2026-08-27-01） |
| 滚动窗口分析 | debug-log 技能（perf --sec） | ✅ | — |

---

## R4 运动器传导链族（v1 命中 6，v2 细化 9 案例）

**一句话定义**：逻辑速度 ≠ 运动器参数 ≠ 实体实际速度，三者之间每一跳都有损耗/放大/叠加来源；
传导链出问题时按"逻辑值→运动器参数→实体位置"成对核对（M7/M8）。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 双触发 437 次 2824 | physTick 每 tick 执行两次 | 437=220+217（M4 统计字段分布先于单帧） | 两运动器同时停止各触发一次 | 单运动器模型（3ed2242）+ motion-devices.md 定点器叠加规则 | ✅ | retrospective-2026-08-23-football-motion-dual-trigger.md |
| 2 | 定点器叠加冲突 | speed 非 0 仍不动 | 直线设备与旋转设备同链激活被秒停 | 叠加语义 | 改回匀速直线运动器（6fdcfa3） | ✅ | retrospective-2026-08-23-football-motion-and-rolling.md #2 |
| 3 | 传导链参数迭代 14 连错 | 球速 2 → 5+ → 9.5（子弹）→ 脱节 → 瞬移 | 2828~2832 系列日志球速参数迭代 | 参数公式传导 | 冲量模型 + clamp 4.5 + 物化快照（73b0ca6） | ✅ | retrospective-2026-08-27-football-impulse-transmission.md #1-7 |
| 4 | 位置差反推速度恶性循环 | 物化修复后仍"高速+光速停止" | 实体位置滞后 4m → delta 放大 5m → 速度 20~35 m/s → 引擎不驱动 → 更滞后 | 实体滞后反推 | motionByVel 直接速度驱动（9a86262） | ✅ | retrospective-2026-08-27-football-motion-chain.md #2 |
| 5 | buff 测速恒 0 | 球速目标 3 滚 1.5m 停、跟不上玩家 | 日志 13-39-24 玩家速度 OUT0:Float=空（buff 未挂返回 0） | buff 依赖测速 | M14 位置差分测速降级（e6c0cbe） | ✅ | retrospective-2026-08-28-football-dribble-speed.md #4 |
| 6 | 首段视觉/物理不一致 | 空中速度突变/"虚拟天花板" | 首段视觉 v0·dt vs 物理 v1·dt | 视觉/物理积分一致性 | kickLaunch 先 physIntegrate 再定视觉目标（e23b817） | ✅ | retrospective-2026-08-23-football-motion-and-rolling.md #5 |
| 7 | lockRotation 残留 | 横传 local axis≠world axis、旋转方向错 | 上段高吊 z≈105.7° 残留 | 定点器参数语义 | 复位 lockRotation=false（9b0d261） | ✅ | retrospective-2026-08-23-football-motion-and-rolling.md #7 |
| 8 | 同名运动器重叠 | DBG_LOC 卡住、直线速度误算 -64 | 运动中再施力新建同名 physics 设备冲突 | 同名设备冲突 | 唯一名冲量运动器叠加（b23f7eb） | ✅ | retrospective-2026-08-23-football-motion-and-rolling.md #10 |
| 9 | 运动器 API 选型 | 物理模拟球不动 | 定点器 move_speed=0 语义不符 | API 语义 | 匀速直线运动器 velocity+duration（d97b285） | ✅ | retrospective-2026-08-22-football-physics-motion.md #1 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 定点器叠加规则 | motion-devices.md | ✅ | 实体滞后机制/速度上限阈值未破译（O-2026-08-27-03） |
| 直接速度驱动 / 成对读 / 三层核对 | dsl 技能 + PKC bnd_83bb3685 | ✅ | motionToPoint 死代码待清 |
| buff 降级（位置差分测速） | dsl 技能（M14） | ✅ | — |

---

## R5 验证链盲区族（v1 命中 8 → v2 命中 ~14）

**一句话定义**：每一层验证（编译/注入/读图/离线/日志/渲染）只证明本层，跨层鸿沟处反复出现
"修复了但没生效/引入了回归"；根因是**单层结论被当全链结论**。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | tail 截断漏 error 2905/2906 | 用户两次复测同一症状才发现修复从未注入 | 注入输出被 tail -2 截断没看到 [error]；2906 与 2899 完全同症状 | 注入失败看不见 | dsl 技能第 5 步注入守则（整行核对） | ✅ 守则在位；🔴 CLI 无失败退出码（O-2026-08-26-5） | retrospective-2026-08-26-rubik-negative-moveid-series.md #5 |
| 2 | 读图只核结构不核数据流 08-26 | 误判"修复已注入" | 读图核了分支结构、没核条件节点数据流来源（LessThan 输入仍是 Addition） | 读图不核数据流 | 读图数据流核验（条件节点来源必查） | ✅ | 同 #1 |
| 3 | 离线验证不含越界读 2964 | 离线全绿、游戏死循环 | 2964 越界读仅在真实运行时发生 | 离线≠真实 | C1④：离线验证显式标注"不含"清单 | 🟡 C1 未聚合 | retrospective-2026-08-28-top-layer.md |
| 4 | 离线验证不含握手 2976 | 离线全绿、游戏序列不执行 | 2976 漏发 op6，离线无事件链 | 离线≠真实 | C1④ | 🟡 | retrospective-2026-08-28-op6-missing.md |
| 5 | 只盯逻辑值 08-28 | 带球逻辑值正确、渲染仍错 | 12-58-44 predDist<2.0 17/279 true 但视觉不对 | 逻辑≠渲染 | M8 三层核对法 | ✅ | retrospective-2026-08-28-football-dribble-speed.md |
| 6 | 修复引入回归 2956 | 修竞态引入黑块+位置乱 | rec13 发送信号吃 bufPos（详见 R1#6） | 修复引入回归 | 回归先 diff 自己最近一轮改动 | ✅ | retrospective-2026-08-28-regression-fix.md |
| 7 | pipefail 再犯 08-29 | quicktest 失败被读成成功 | npm run x 2>&1 | tail 退出码 = tail 的 0 | 管道判退 | 复盘技能禁 grep/tail 判退；echo $? 单行 | 🔴 习惯易复发（工具层无兜底） | retrospective-2026-08-29-rubik3x3-client-round0.md #1 |
| 8 | 静态检查≠引擎校验 08-16 | 磁盘检查全过、引擎仍拒载 | 无日志（加载期失败） | 验证链未闭合引擎完整校验集 | 三版本差分（M16）+ 无日志阶梯 | ✅ | retrospective-2026-08-16-signal-registration-series.md 缺陷 B |
| 9 | 一次修复掩盖下一个 08-16 | 默认值修复后布局 bug 才暴露 | 用户手动重建信号触发 | 修复后未独立全链验证 | register→注入→游戏 生产工具独立验证 | ✅ | 同 #8 缺陷 C |
| 10 | 自检只查关键复合 08-20 | 残留旧复合类型错位拒载 | 无日志拒载（详见 R7#5） | 自检不全量 | Step 3.5 全量 def 对比 + check-gil-composite-refs | ✅ | retrospective-2026-08-20-rubik-perf-optimization.md #5 |
| 11 | 索引缓存未失效 08-21 | explain 读旧 flow_after_turn 误判注入失败 | 工具读旧内容与磁盘不符 | 缓存盲区 | 清 /tmp/gia-gil-*.json + parse 交叉核对 | ✅ | retrospective-2026-08-21-rubik-performance-p0-1.md #4 |
| 12 | 只验位置不验朝向 08-21 | 黑面（块位置全对、朝向错） | 2795 位置差分全一致但朝向错 | 验证维度缺失 | 位置+朝向/欧拉同验 | ✅ | retrospective-2026-08-21-orientation-table-convention.md |
| 13 | 基线选错×4 / diff 假通过 08-29 | 假失败/重复记录；root15/16 漏检 | diff-roots 只比前 64 hex | 相邻快照基线 / 工具盲区 | M11 快照时间线 + M12 同构重放 + 记录级完整对比 | ✅ | retrospective-2026-08-29-client-graph-skillconfig.md #4/#7 |
| 14 | 假 DIFF 43762B 08-29 | 逐字节比对整段错位 | 字段长度变化→比对错位 | 字节比对错位 | M15 结构级比对 | ✅ | retrospective-2026-08-29-variable-game-verify-matrix.md #9 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 注入守则/读图数据流核验/分层证据 | dsl 技能 + reading 技能 + 复盘技能 | 🟡 守则分散在三条技能 | **🔴 C1 统一「修复交付前验证清单」未聚合** |
| 注入 CLI 失败退出码 | src/cli | 🔴 | O-2026-08-26-5 |
| 管道判退兜底 | 工具层 | 🔴 | 无兜底，靠纪律（08-29 再犯） |

---

## R6 状态机协议族（v1 命中 5 → v2 命中 ~12）

**一句话定义**：事件驱动架构下，多图/多 tick/多信号之间的**共享状态协议**（缓冲、握手、写序、
队列、心跳）缺任何一环都会静默失步；症状常表现为"状态循环/序列不执行/偶发错乱"。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | solveBuf 残留 2931 | 重算后执行错误步骤破坏角块 | mask 0,1,1,3,2,2,2,3 振荡 + solve_seq 残留 -1（详见 R1#3） | 缓冲残留 | 重置必须清数组 | ✅ | retrospective-2026-08-27-solvebuf-residual.md #3 |
| 2 | 漏发 op6 2976 | 求解序列从不执行、状态不变 | bufPos 累积到 485 越界；反复追加同一序列 | 握手漏发 | 规划完成协议三件套（llPublishSeq：发布+phase=2+发 op6，1008118） | ✅ | retrospective-2026-08-28-op6-missing.md #2 |
| 3 | solveSeq 竞态 2954 | 宏残缺→十字永久破坏（偶发） | op5 重算与 pStep4 追加相邻 tick 写序交错（详见 R1#4） | 写序竞态 | 显式 pos 入参 + 让位入口集中清零 | ✅ | retrospective-2026-08-28-solveseq-race.md #2 |
| 4 | 打乱队列串台 2897 | 求解序列与打乱队列串台、未还原第一层即停 | pendingMove 写 8 次读数百次（46×move2/46×move4） | 队列串台 | AUTO 分支双真守卫（rubik3x3_scrambling，518898b） | ✅ | retrospective-2026-08-26-rubik-negative-moveid-series.md #2 |
| 5 | handlerMode 残留 2859 | 修掉转动后按等于"没反应" | 日志 2862 rec2 视觉图只收到 execMove、无 turnblock 帧 | 挂载错位/启动误当转动 | 多图拆分核验（Step 3.7 mounts 核对）；挂错实体修正 | ✅ | retrospective-2026-08-24-rubik3x3-stage3-turn-lock.md #3/#4 |
| 6 | 冷启动死锁 08-26 | 球 FREE 静止 → 5Hz 带球链永不触发 | 无日志（无 stop 事件可记录） | 冷启动缺心跳 | whenEntityIsCreated 冷启动心跳（665b408） | ✅ | retrospective-2026-08-26-football-composite-dup-version.md #1 |
| 7 | op10 误插分支 | 自动打乱无反应 | op10 误插 whenTimer 分支 | 事件/定时器分支错位 | 移入 onSignal | ✅ | retrospective-2026-08-25-rubik-solver-eo-shortlist.md #3 |
| 8 | op6 单步序列早发 | 求解转几百下不收敛 | op6 单步序列完立即发 op5 早于动画 flowAfterTurn | 信号早于动画完成 | len<=1/len<=0 改 solverStartDoneTick | ✅ | 同 #7 #4b |
| 9 | 物理状态机弹跳 | 一落地就转 ROLL"钉"在地上 | 滚滑 0.985/tick 太滑 | 状态切换建模 | 落地 |vy| 阈值保留 FLYING + 摩擦 0.8（48b680d） | ✅ | retrospective-2026-08-23-football-motion-and-rolling.md #3 |
| 10 | 状态同步误判 15c28a3 | 误判 ballPos 残留加同步——错误修复掩盖根因 | 双触发 437 次仍在 | 错误修复掩盖根因 | 统计字段分布先于单帧（M4） | ✅ | retrospective-2026-08-23-football-motion-dual-trigger.md #2 |
| 11 | auto 链静止无 tick | 球静止时 auto 补踢永不触发 | 静止（FREE）无滚滑 tick；时序断言被日志 rec0 推翻 | 静止态无 tick + 双分支结构歧义 | 独立 autoCheckTick 定时器（fa1af6e）+ trace 核验重写（888df04） | ✅ | retrospective-2026-08-27-football-auto-timer-chain.md #1/#2/#4 |
| 12 | 让位清理 5 处重复 | 让位/重算入口清 bufPos+solveLen 分散 5 处 | —（代码形态问题） | 让位分散 | 统一清空入口（待合并） | 🟡 O-2026-08-28-02 | retrospective-2026-08-28-solveseq-race.md |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 重置必须清数组 / 握手三件套 / 显式 pos 入参 | dsl 技能 + PKC（R1 族条目覆盖） | ✅ | 让位清理未合并（O-2026-08-28-02） |
| 多图拆分核验（mounts/预算/跨图残留/职责） | reading 技能 Step 3.7 | ✅ | E 层变量前缀隔离（O-2026-08-27-09） |

---

## R7 复合/注入器残留族（v1 命中 4 → v2 命中 ~13）

**一句话定义**：复合定义 ID 按顺序分配、注入器只覆盖同 ID 不删残留、pin 物化在两后端有差异、
DSL exec 边有 detached/auto-chain 两种语义——四者叠加产生"引用存在但错位/悬空"的**静默坏图**。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | (1) 复合重复版本拒载 08-26 | 游戏拒载"内部参数不匹配" | 无日志；目录 9 个错误内容 (1) 版本（id 1610700021-29）零引用仍被校验 | 复合目录重复版本 | 复合目录版本一致性核对（reading Step 0） | ✅ 清理；🔴 (1) 版本产生路径未锁定 | retrospective-2026-08-26-football-composite-dup-version.md #4 |
| 2 | Stage3 两后端 pin 缺陷 2850 | 转动后锁死、胜利判定不跑 | Equal IN0(slot)=空 vs IN1(turnLastSlot)=8/25 恒 false；legacy 整个 InParam 缺失 connects=[] | 两后端 pin 物化差异 | 谱系 2 已修（4717aa0） | ✅；🔴 谱系 1 边界回归在 backup 分支未合入（O-2026-08-23-2） | retrospective-2026-08-23-stage3-composite-pin-routing.md |
| 3 | predDist 输出 pin 缺失 08-27 | 埋点输出 3.5~40.9 全"触发"与判定矛盾 | n=12 Subtraction 第二输入 pin present=False → 输出=|rolePos|；kick 判定走 n=11 正确路径（功能不受影响，仅埋点/外部消费坏） | 输出 pin 映射错连 | 数据流定点核验（trace-gil-dataflow） | 🟡 功能无碍，输出映射缺陷记录在案 | retrospective-2026-08-27-football-auto-timer-chain.md |
| 4 | next 悬空引脚 2956 | 黑块+位置乱（详见 R1#6） | GIL 回读 call node outputs 悬空 next:Integer | 数据引脚+分支赋值 | 复合引脚禁令 | ✅ | retrospective-2026-08-28-regression-fix.md |
| 5 | 残留旧复合类型错位 08-20 | 游戏拒载（无日志） | orbit_scheduler 0034→0030 前移，残留 gsts_in_layer(0032) 引用错位 → Float 参数传 Integer 接口 | ID 前移 + merge 不删残留 | check-gil-composite-refs 注入后必跑 | ✅；🔴 稳定 ID/残留清理治本（O-2026-08-20-5） | retrospective-2026-08-20-rubik-perf-optimization.md #4 |
| 6 | duplicate physical route 08-20 | 编译报 GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED | 显式 f.link 对象边 + auto-chain 裸边 → 同一 InFlow 物理路由两条 | auto-chain 与显式边叠加 | 入口链首普通节点、复合调用不显式 link | ✅ | 同 #5 #1 |
| 7 | 悬空 exec×4 08-21 | 队列不写入/打乱不自动播放/时序表不更新 | 检测器报 4 个真悬空（有出边无入边）——f.node() detached | f.node detached 语义 | GSTS-DANGLING-EXEC-NODE 检测器 + exec 链铁律 | ✅；🔴 检测器抓不到重复入边（O-2026-08-21-NN） | retrospective-2026-08-21-dangling-exec-fix.md #1-4 |
| 8 | 双入边隐患 08-21 | 同一节点执行两次、定时器不触发（日志 2777） | Start Timer 同节点两帧 | registerExecNode auto-chain + 显式 connect | registerExecNode 后首节点用 f.node+显式 connect | ✅ | 同 #7 #5 |
| 9 | dbg_phys_snapshot 残留覆盖 08-28 | 死代码引用被注入覆盖类型错位 | 注入对比检出 | 死代码引用被覆盖 | 源码删 + .gil 手术（20ee92f） | ✅ | retrospective-2026-08-28-football-dribble-speed.md #2 |
| 10 | 孤立条件分支 08-23 | 游戏拒载"判定节点异常" | 双分支 true 只有 sendSignal、false 空 → 孤立条件分支 | 空分支 exec 边 | 回退分支，回执移入主图 unlock 处理器 | ✅ | retrospective-2026-08-23-rubik-runtime-node-budget.md #1 |
| 11 | boundary capture 过度物化 08-24 | 8 测试全 PASS、游戏仍坏 | 测试回归≠游戏回归（独立编译器回归） | 测试回归与游戏回归混淆 | 两层回归分开判定 | ✅ | retrospective-2026-08-24-rubik3x3-stage3-turn-lock.md #2 |
| 12 | *_list 参数标量编码 08-21 | 复合 *_list 参数被编码成标量类型 | 编译产物类型错 | 编译器类型编码 | 修 build_composite_definition.ts | ✅ | retrospective-2026-08-21-orientation-table-convention.md #3 |
| 13 | exec 边物理 InFlow pin 08-14 | impl 内部 exec 边断链（#11/#12/#20 系列） | 日志 2691 + 读图自检 | exec 边目标缺物理 InFlow pin | 体检工具 C3/C3b + composite-nodes.md #20 | ✅ | retrospective-2026-08-14.md |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 注入后全量复合对比 + exec 边健康检查 | reading 技能 Step 3.5 | ✅ | 连续注入残留可能逃逸（工具局限，人工核对兜底） |
| 复合引脚禁令 / exec 链铁律 | dsl 技能 | ✅ | 检测器重复入边增强（O-2026-08-21-NN） |
| 复合目录版本一致性核对 | reading 技能 Step 0 | ✅ | (1) 版本产生路径未锁定；编译器输出 pin 缺失最小复现（O-2026-08-27-05） |

---

## R8 需求与方法论族（v1 命中 5 → v2 命中 ~16）

**一句话定义**：方向/口径/单位/知识路由层的错误——写代码前的问题（理解需求、读权威文档、
选最小单元、核单位语义），不是引擎问题；症状常是"做了但方向错/白做一轮"。

### 二级子谱系（逐案例一行，按子类归并）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 富版贪心事故 08-27 | 一次性实现 16 条记录富版 → 游戏卡死 | 无日志（悬空引用加载死循环） | 贪心实现/未申请差分 | 复盘技能「最小单元+差分申请」 | ✅ | retrospective-2026-08-27-rich-floating-page-greedy.md #1/#5 |
| 2 | 测试台三轮纠正 08-27 | 成本分析后塞进现有 tab17/18，被用户三轮纠正 | —（方向性偏离） | 需求理解层偏离 | 用户原话优先 + 独立实体/tabBar 图 | ✅ | retrospective-2026-08-27-rubik-testbench.md #1 |
| 3 | auto_check 单位 200s 08-27 | auto 补踢 57s 内从未到点 | 日志仅 57s、f.startTimer 延迟单位是秒 | 单位错误 | dsl 技能定时器单位纪律 | ✅ | retrospective-2026-08-27-football-auto-timer-chain.md #6 |
| 4 | 甩锅引擎×2 08-27 | 断言"定时器不触发/事件不触发" | 日志 rec0/autoCheckTick 39 次铁证推翻 | 甩锅引擎 | 铁证原则（先日志后归因） | ✅ | 同 #3 #2/#3 |
| 5 | UI 样本时效 08-27 | 真初始=6 条记录误判（实际 4 条）、t42 位置版本差异 | 用户修复版与样本差异 | 样本时效 | 以用户修复版为新源 + 差分 | ✅ | retrospective-2026-08-27-ui-cli-development.md #3/#4 |
| 6 | 未读权威文档 08-21 | 生成器欧拉约定错导致黑面 | 日志 2795 位置全对朝向错 | 知识路由缺失 | 卡住三问① + motion-devices.md §3 先读 | ✅ | retrospective-2026-08-21-orientation-table-convention.md #1 |
| 7 | 表覆盖假设 08-23 | OLL 表 211/216"不全"、PLL 漏纯 AUF 态 | 24^4 含物理不可能态 | 表覆盖假设未核验 | 只穷举合法态 190,080 + identity 恒等边 | ✅ | retrospective-2026-08-23-rubik-cfop-solver-port.md #2-4 |
| 8 | 预算口径 3000 vs 2000 08-27 | 3198 按 3000 当红线误判 | gameNodeCount 3198 | 口径错误 | AGENTS.md 2000 红线（用户 08-27 更正） | ✅ | retrospective-2026-08-27-rubik-stage3-newgraph.md #1 |
| 9 | 拍值未标定 08-24 | 0.2s 仍是拍值 | 1095 节点/tick 超安全率 | 标定方法缺失 | M1 锚点标定法 | ✅ | retrospective-2026-08-24-rubik-solver-load-tick.md #2 |
| 10 | toggle 单向语义 08-28 | 用户期望双向速度切换 | —（需求语义） | 需求语义未确认 | 需求确认先行 | ✅ | retrospective-2026-08-28-solveseq-race.md #1 |
| 11 | 环境判断两层混淆 08-29 | 瞬态 vs 稳定问题混为一谈 | R-01 tsconfig 收编问题稳定存在 | 归因未分层 | git worktree 干净副本复现分层 | ✅ | retrospective-2026-08-29-rubik3x3-client-round0.md #3 |
| 12 | 三态误判 08-29 | root20 空占位（len 0）误当缺失 → 误报 fail closed | v10 root20 len 0 | 状态判断 | 三态处理（空/1970B/2955B） | ✅ | retrospective-2026-08-29-client-graph-skillconfig.md #5 |
| 13 | 手解 pin hex 08-29 | f20610 歧义反复手解浪费时间 | —（工具误用） | 手解 hex | decode 状态复用、杜绝手解 | ✅ | retrospective-2026-08-29-variable-game-verify-matrix.md #2 |
| 14 | 卡住三问/关卡实体/说了≠做了 08-14 | 方法论源头（用户亲手教学） | 日志 2690 系列 | 方法论纪律 | AGENTS.md 三问 + 分层归因 + 读图自检 | ✅ | retrospective-2026-08-14.md |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 最小单元+差分申请 / 定时器单位 / 需求确认 | 复盘技能 + dsl 技能 + AGENTS.md 三问 | ✅ | 无（纪律已闭环，靠执行） |

---

## R9 客户端图新领域（v1 命中 5 → v2 命中 6 文档）

**一句话定义**：客户端图（type≠20000）的读图工具/执行模型/日志语义都是 08-28 才破译的新领域；
错误集中在"用服务端直觉读客户端图"。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 撞号错名 08-28 | 多分支显示成 Set Custom Variable Dict…、节点图开始显示成 Set…Bool | genericId 撞号后落到服务端名字表错误条目 | 工具错标 | 元数据重映射真名（parse/explain 已修，771cd42：191 节点 0 错标 0 占位） | ✅ 已闭合 | retrospective-2026-08-28-rubik-client-graph-reading.md #1 |
| 2 | 响应式误读 08-28 | 把「获取自定义变量」按错名读成事件 → 推断"变量变化即重算"响应式模型 | 错名之上继续语义推断（错名+推断叠加） | 语义误读 | 官方执行模型交叉验证（节点图开始→按顺序执行） | ✅ | retrospective-2026-08-28-client-server-call-chain.md #1/#2 |
| 3 | 遍历语义 08-28 | 遍历实体列表 out_flow 0/1 语义与有限循环相反无法静态确定 | 日志 2979：整体旋转 1438 帧中遍历节点 27 帧（26 块+1 完成）、添加单位状态 26 帧、发信号 1 帧 | 循环语义歧义 | 遍历 0=完成/1=每次（O-2026-08-28-06 闭合） | ✅ | retrospective-2026-08-28-rubik-client-graph-reading.md #5 |
| 4 | f8/f3 语义修正 | 客户端日志字段语义误判 | 日志帧字段 f8/f3 实际语义修正 | 日志字段语义 | debug-log-format.md f8/f3 修正 + 帧模式表 | ✅ | retrospective-2026-08-28-client-log-flow.md / full-log-skill.md |
| 5 | root20 四态 08-29 | 客户端图 ID 段起始值初版 fail closed 被拒 | before.gil 建 20010 被拒 → 用户初始地图实测 1082130433 自动分配 | 环境假设 | 实测 1082130433 + 三态/四态记录处理 | ✅ | retrospective-2026-08-29-client-graph-skillconfig.md #5/#10 |
| 6 | 触发链读法 08-28 | 孤立执行链误当死链 | 客户端图入口「节点图开始」被 explain 显示为孤立链 | 入口形态假设 | 触发链在服务器侧读：Create Skill Instance → Cast → 事件轨道打点 | ✅ | retrospective-2026-08-28-client-server-call-chain.md #3/#5 |
| 7 | DSH 沙箱环境坑 08-28/29 | /tmp 不跨 bash、正则转义被吃、quicktest 误读成功 | FileNotFoundError 反复重跑 parse；正则静默 0 命中 | 环境假设 | 技能 Step 2.6 补注（parse+python 同条命令、双反斜杠）；禁管道判退 | ✅ | retrospective-2026-08-28-rubik-client-graph-reading.md #3/#4 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| 客户端读法三件套（Step 2.8）+ 遍历/多分支语义 | reading 技能 + debug-log 技能 + PKC clm_D1A208295BD4F1E3FE | ✅ | O-2026-08-28-10 ①-⑥ 日志新发现六项待闭合 |
| 客户端图资产模板（36/6/28） | genshin-ts-asset-operations + PKC bnd_f8e9a327/efba42/ae7c7e87 | ✅ | O-2026-08-29-09 客户端注入链待用户复测 |

---

## R10 变量系统（v1 命中 4 → v2 命中 5）

**一句话定义**：变量 wire 的字节级编码/比对/断言环节——手抄字节、过度外推、比对错位是三大雷；
结构级比对 + 程序化字节操作是防线核心。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | fixture 手抄截断 08-29 | 规律表 fixture 手抄 hex 截断 | 1572 vs 样本 1668 | 手抄字节 | 程序化从测试常量回填（patch-rules.ts） | ✅ | retrospective-2026-08-29-variable-game-verify-matrix.md #1 |
| 2 | dict「恒 1」外推 08-29 | dict f6 修复方向误判"恒写 1" | entity→entity 巧合 1/1 | 过度外推 | 推断标 inferred + 用户补实样证实（int→entity） | ✅ | 同 #1 #6 |
| 3 | 43762B 假 DIFF 08-29 | 逐字节比对整段错位假差异 | 字段长度变化→比对错位 | 字节比对错位 | M15 结构级比对（按字段解析） | ✅ | 同 #1 #9 |
| 4 | 归一化顺序 08-29 | i1/i2 先删 index → 后续判断失效（同族两次） | count pin、Get InParam[0] 判断失效 | 归一化顺序耦合 | 判断改 ?? 0（9d0e7ea） | ✅ | 同 #1 #5 |
| 5 | 45.2 形态值 08-29 | 45.2 从「绑定计数」误判为「模板×释放类型形态值」 | 绑定不改 45.2（61→62 首绑误读） | 语义误判 | 三模板×两释放差分闭合 + 文档/PKC 修正 | ✅ | retrospective-2026-08-29-client-graph-skillconfig.md #8 |
| 6 | server 列表字面量丢值 08-29 | （R2#7 交叉引用）编译成功值被丢弃 | 读图值缺失 | 静默丢值 | 编译期拦截（b611198） | 🟡 | 同 #1 #10 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| variables-wire-rules.json + variables:verify + 双锁测试 | tools + tests | ✅ | O-2026-08-29-01 三层任务进行中 |
| 程序化字节操作 / 推断标 inferred / 结构级比对 | 复盘 + 技能 | ✅ | client 列表字面量元素形态未 verified |

---

## R11 信号注册编码族（新族，v1 无 → 归位 5+1 案例）

**一句话定义**：信号注册的字节编码有 5 层独立校验（版本一致性/下限/阈值/参数默认值/参数布局），
任何一层错误都表现为**游戏拒载且无日志**；样本字节必须提炼语义（field2=序号），不能复刻。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 版本一致性 db11e34 | 游戏"参数错误"拒载 | 无日志（加载期失败） | repair 复刻模板 field5=2 但保留目标 f6=3 | 顺序反转：先读目标 f6 再改写定义 field5 | ✅ | retrospective-2026-08-16-signal-registration-series.md #1 |
| 2 | 版本下限 039a060 | 同症状 | 无日志 | vec3 信号版本 2 被引擎拒绝 | 统一版本 >=3 | ✅ | 同 #1 #2 |
| 3 | 版本阈值 66e24d9 | 同症状 | 无日志 | N=5 时 v3 < 阈值 4；逐个 register 未全表回填 | f(N)=max(3,ceil(3N/4)) + register 全表回填（只升不降） | ✅ | 同 #1 #3 |
| 4 | 参数默认值 0b52395 | 同症状 | 无日志；三版本差分 v3/v4/v5 逐字段对比 | 已连接 InParam 带空 VectorBase 默认值（vendor 全局行为） | post-encode 对占位信号节点（300000/300001）value=null | ✅ | retrospective-2026-08-16-signal-param-default.md |
| 5 | 参数布局 9e8fd76 | 修默认值后仍拒载 | 无日志；编辑器重建逐字节差分 | n3 field2 硬编码历史常量 → 参数序号错位 | rewriteParamN3Field2：send=序号、monitor=3+序号（0 删字段） | ✅ | retrospective-2026-08-16-signal-registration-series.md #5 |
| 6 | 注册前置 08-23 | 新信号 .gia 编码失败 | 编译期失败（非拒载） | 信号必须先 register 进真实地图；无参信号仍需 template donor | 已注册 4 信号 + 技能补前置 | ✅ | retrospective-2026-08-23-rubik-cfop-solver-port.md #6 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| signals.md 参数布局/默认值规则 + rewriteParamN3Field2 + 多参回归测试 | 权威文档 + src/cli + tests | ✅ | 客户端 send_signal_to_server conn 参数默认载荷未端到端验证（signals.md 风险项） |
| 三版本差分方法论（M16 候选） | 复盘文档 | ✅ | 版本阈值 f(N) 上限未验证（v5/v6 仅 N=5） |

---

## R12 静态拼装族（新族，v1 无 → 归位 8+4 案例 + UI wire 子类）

**一句话定义**：静态资产（元件/实体/装饰物/场地几何/UI 页面）的 wire 编码与几何推导——
模板复用必须审计内部 ID 引用、wire 修改走三级写回链、几何公式要从"局部轴→世界方向"推导。

### 二级子谱系（逐案例一行）

| # | 案例 | 现象 | 日志帧签名 | 根因子类 | 防线 | 防线状态 | 证据源 |
|---|---|---|---|---|---|---|---|
| 1 | 模板残留宿主 ID 08-20 | aux 挂载结构对但游戏不显示 | f4 槽40.f50.f502=1077936161（模板旧宿主）vs 用户 1077936184 | 模板残留引用 | 模板占位 TEMPLATE_HOST_DEF_ID/INST_ID 替换 | ✅ 用户游戏核验通过 | retrospective-2026-08-20-static-dynamic-prefabs.md #5 |
| 2 | 三级写回链缺失 08-20 | convert 改 instanceField 未写回 root8 → 改了没生效 | 回读结构缺字段 | 写回链缺失 | 字段→section→root 三级写回 | ✅ | 同 #1 #3 |
| 3 | 浮点精度 08-20 | 4 位小数还原样本字节失败 | 5.1272 vs 样本 5.1272316 | 浮点精度 | 用样本精确值（7 位）做逐字节断言 | ✅ | 同 #1 #1 |
| 4 | 挂载语义错 08-20 | 定义宿主挂 inst aux | 定义宿主 f501 挂错类型 | 挂载语义 | 按宿主类型挂 def/inst | ✅ | 同 #1 #7 |
| 5 | ID 分配未同步 08-20 | def/inst ID 重复 | nextAuxId 查旧 root27 | ID 分配 | def 推入后立即写回 root27 | ✅ | 同 #1 #6 |
| 6 | 继承错误结论 08-20 | "静态 f6 槽比动态多 10B 静态标记"（旧文档） | 同构重放：543→409B 全来自 f7 组件槽 | 继承错误结论 | 同构重放验证（M12 先行版） | ✅ | 同 #1 #2 |
| 7 | 定义-only 边界 08-20 | convert 遇"定义-only"报 not found | CLI create 无页面模型 | 边界未覆盖 | 定义存在即可转 | ✅ | 同 #1 #4 |
| 8 | root46 未闭合 08-20 | f1/f2 无规律 | 5 个样本观察 | 未知字段 | fail-closed 不写 + O-2026-08-20-1 判别待用户核验 | 🟡 | 同 #1 #8 |
| 9 | 弧线旋转公式 z 镜像 08-21 | 中圈 32 段自旋不对 | 用户改 4 段 aux 差分：13.99/8.36/-8.68/-13.34 vs 我的 343/354/365/376 | 旋转公式（局部轴→世界方向未推导） | rotY=atan2(-cosθ,-sinθ) | ✅ 用户视觉核验 | retrospective-2026-08-21-football-field-arcs.md #1 |
| 10 | 罚球弧凸向 08-21 | 凸向球门而非场内 | 本地几何验证 x 范围检查 | 凸向参数 | P(θ) 场内方向参数化 + side 符号 | ✅ | 同 #9 #2 |
| 11 | 罚球弧端点 08-21 | 半圆 180° 穿过禁区横线 | θ_max=arccos(5.5/9.15)≈53.06°，端点 x=±36.0000 | 端点几何约束 | 弧范围 [-θ_max,+θ_max] + 端点与约束线距离断言 | ✅ | 同 #9 #3 |
| 12 | acos 符号 08-21 | 254° 大弧反穿 | acos(-0.601)=126.94° → 端点 x=45.9 越界被本地断言拦截 | 符号断言 | Math.abs + 写回前本地几何断言 | ✅ | 同 #9 #4 |
| 13 | UI wire 解析 08-27（UI wire 子类，用户裁决归入） | packed varint 不处理 / max-uint64 往返损坏 / f503 嵌套层级误判 / 状态块素材引用路径误判 | 模板 t4 实例回指未重映射；close button t52.f44.f507=ff×9 01 损坏 | UI wire 编码 | setTemplateInstanceListField+setPacked / remapVarintBytes（等宽 5B）/ 按真实层级修正 | ✅ | retrospective-2026-08-27-ui-cli-development.md #1/#2/#5/#6 |
| 14 | UI 引用完整性 08-27（UI wire 子类） | 只建 16 条记录漏 18 条子记录 → 悬空引用加载死循环 | 内容组子记录×11+状态组子记录×7 漏建 | 引用完整性 | f503 置空 + 最小可验证单元逐步注入 | ✅ | retrospective-2026-08-27-rich-floating-page-greedy.md #3 |

### 防线矩阵

| 防线 | 位置 | 状态 | 缺口 |
|---|---|---|---|
| gil-structure-semantics（静态/动态/装饰物/transform）+ static-gil-model-builder | 权威文档 + 技能 | ✅ | root46 判别（O-2026-08-20-1）；"带装饰物元件+定义"一键创建（O-2026-08-20-2） |
| 用户最小差分 + 本地几何断言 + 恢复备份重生成 | static-gil-model-builder references | ✅ | 角球区小弧未做；静态元件→拖实体路径未在编辑器验证 |

---

## 跨族修复模式卡片（8 卡全量，R1 轮完成；每卡=适用场景+反例+最小模板+证据源）

### P1 哨兵模式
- **适用场景**：int_list 全 0 初始化会被引擎短物化（长度不可控），或需要"列表已写"标志位。
- **反例**：哨兵把表长推到 101 → 触发初始化 ≤100 硬限拒载（testbench #2）。
- **最小模板**：列表尾部追加哨兵 1n，**表长保持 ≤100**；消费侧按"尾项非 0"判有效。
- **证据源**：2876（eo 哨兵）/ 2944（solveBuf 25 项）/ 101 拒载；PKC bnd_83bb3685。

### P2 生成器补整块
- **适用场景**：大表分块存储（每块 100）+ 长列表读取复合（乘法选择器按块寻址）。
- **反例**：localAxisTable2 只 88 项读第三块越界（2886）；CF_OLL_ALG_c8 仅 3 项 offset=73 越界读返回空（2964）。
- **最小模板**：生成器把所有表**补齐到 chunkSize 整块**再落盘；校验脚本正则兼容无后缀小表。
- **证据源**：13e3624（补齐 300）/ 7806e2b（整块填充 + PLL_ALG 96→100）。

### P3 物化快照
- **适用场景**：同一图变量/复合输出被 ≥2 个消费点消费，且消费之间有写回。
- **反例**：kickApply npos 二次求值 → 球速×2；physFlyTick 先写回再消费 → 二次积分。
- **最小模板**：积分/计算完成后 set tmp* 图变量，**所有消费点只读 tmp 快照**；同族一次扫全。
- **证据源**：73b0ca6 / e463c1c / 5f2fc97；dsl 技能 + PKC clm_6583EB7。

### P4 显式 pos 入参
- **适用场景**：跨 tick 共享推进状态（游标/长度）的复合链。
- **反例**：37584a8 用"复合数据引脚+分支赋值"传 pos → GIL 数据边错乱 → 2956 黑块回归。
- **最小模板**：复合**内**读写独立 bufPos 游标图变量（调用方零引脚变化）——用已验证模式，不用未验证的高危 DSL 组合。
- **证据源**：2954 竞态 → 37584a8 → 8aa7350 最终形态；regression-fix.md 元教训。

### P5 锚点标定法
- **适用场景**：任何"每 tick 做多少工作"的设计（定时器节拍、动画负载）。
- **反例**：0.01s tick 每 tick 1000 节点（solver_start_tick）；0.2s 拍值仍超安全率。
- **最小模板**：问用户安全操作基线（面转 0.3s）→ 算节点/s → 反推 tick 间隔 + 15% 余量 → 日志 perf 复核。
- **证据源**：08-24 solver-load-tick（4a34164→bce8cde）；M1。

### P6 规划-执行握手协议
- **适用场景**：规划器与执行器分图/分 tick 协作，任何"规划完成"事件。
- **反例**：三个「追加完成」分支只设 pStep=1 漏发 op6 → bufPos 累积 485 越界死循环（2976）。
- **最小模板**：规划完成三件套 = 发布序列（solve_seq/len）+ phase 置位 + 发送就绪信号；每个完成分支都接。
- **证据源**：1008118（llPublishSeq）；dsl 技能握手三件套。

### P7 位置差分测速降级
- **适用场景**：官方测速节点依赖编辑器前置条件（buff/挂载）时。
- **反例**：queryCharacter 依赖「监听移动速率」buff，未挂返回 0 → 球速目标失真。
- **最小模板**：改 (Δpos/Δt) 自己算，不赌编辑器前置条件。
- **证据源**：e6c0cbe（08-28 dribble-speed）；M14。

### P8 双轨核验矩阵
- **适用场景**：字节级 wire 写回/模板复刻类交付的验收。
- **反例**：逐字节比对遇字段长度变化整段错位（43762B 假 DIFF）；只比前 64 hex 漏 root15/16。
- **最小模板**：双轨差分（我方模拟注入 vs 编辑器实样）× 逐批小操作 × 结构级比对（按字段解析），基线选相邻快照前驱。
- **证据源**：08-29 variable-game-verify-matrix（M10/M15）+ client-graph-skillconfig（M11/M12）。
