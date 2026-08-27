# 魔方 3×3 自动还原作战手册（rubik-autosolve-playbook）

> 用途：面向**新阶段开发（中二层 E 层棱块）与后续维护**的一站式知识入口。
> 覆盖：架构全景 / 里程碑 / 错误谱系 / 已验证模式 / 验证方法论 / 中二层预防清单 / 工具速查。
> 证据：examples/rubik-3x3/PROGRESS.md、docs/game-engine-knowledge/retrospective-*.md（rubik 系列）、提交历史。
> 状态：已覆盖到 2026-08-27 solveBuf 残留闭环（用户游戏验证通过）。

## 一、架构全景（事件驱动三段式）

自动还原 = 规划（solverPlan）→ 执行（solver）→ 转动（turn/flow）→ 视觉（visual）四条链 + 共享状态发布。

| 图 | GIA id | 职责 |
|---|---|---|
| game | 1073741830 | 主控制器（挂载 1077936201），发起/重置/打乱 |
| relay | 1073741831 | 信号转发 |
| solverPlan | 1073741834 | **规划图**（挂载自动求解实体 1077936230）：读发布状态 → 算 mask → 查宏表 → 追加 solveBuf → 发 op6 |
| solver | 1073741833 | **执行图**：op6 武装 → preTick/emitTick/doneTick 定时器链 → 逐步发 op3，播完发 op5 |
| turn | 1073741835 | 转动层：op3 → 锁/队列 → 负 moveId 拆分（negDone 状态机）→ flowDoMove |
| visual | 1073741832 | 视觉动画：viewOrbitTrigger + 批量定时器（turnblock/orbit2） |

### solverPlan 状态机
- `stage`：0=中心归一化（整转宏）→ 1=十字（面转宏）→ 2=第一层角块（面转宏）。**stage=3 将是中二层（E 层棱）**。
- `phase`：0=idle / 1=armed / 2=waiting-exec。
- `pStep`：planTick 小步 1=读状态（从 stHost 自定义变量复制到图变量）→ 2=算 mask → 3=查宏表写宏参数 → 4=逐 code 追加 solveBuf → seq-ready 发 op6。
- `solveMask`：stage1=十字 mask（4 棱 bit）==15 切 stage2；stage2=角块 mask ==15 发 op7(plan-done)。
- 信号：op5=播完重算 / op6=新序列就绪 / op7=完成 / op12=tab-auto 武装 / op3=执行一步 / op8=reset / op10=scramble。

### solver 执行链
```
op6(len>0) → wholePre/preTick → sendOne(发 op3 + solveIdx+1)
  → 还有步: wholeEmit/emitTick → wholePre/preTick（循环）
  → 播完: wholeDone/doneTick → op5（请求重算）
op6(len<=0) → doneTick（空序列保护）
```

### 共享状态发布（flowAfterTurn，每步转动完成后）
`target=主控制器 1077936201`：solver_cp/solver_co/solver_ep/solver_eo/solver_ct。
solverPlan 从 stHost=1077936201 读取。**发布端与读取端实体必须一致**（曾有实体错位风险）。

## 二、里程碑时间线

| 阶段 | 提交（起始） | 内容 |
|---|---|---|
| 1 手动基础 | — | spawn 26 块、手动面转/整转、逻辑表（gen-3x3-logic-table.mjs，CubeLib 验证） |
| 2 求解器 | 507e2c5 | 第一层角块求解 + 中心/整转归一化 + 打乱并发守卫 + 自动求解负载限流 |
| 3 事件驱动 | efc1674 | solverPlan 降到 1687 节点，规划图不再模拟转动，只算下一步宏 |
| 4 负折叠 | 7748853→5766bcb | 负 moveId（U3 折叠）：3 次逻辑-only + 1 次负轴视觉（negDone 状态机拆分） |
| 5 负载调优 | 542c763→b7add0a | 节拍实测重排、动画前后静默降载、批量定时器 |
| 6 视觉双通道 | fd40432→0fab0c1 | 面转 A/B 双通道（后回退单通道）→ 整转 orbit2 批量 4→2（10 case 上限修复） |
| 7 稳定性闭环 | abd3673 | solveBuf 残留（用户验证通过） |

## 三、错误谱系（按机制分类，全部实锤）

### A. 状态读写不同步（二次物化）——3 连发
| 提交 | 症状 | 根因 |
|---|---|---|
| ad81ea3 | emitTick 丢步 | 续播判定复用表达式 idx+1，二次物化重读旧值 |
| 5766bcb | 负向少 90° | negDone 分支复用表达式 ph，(ph+1)+1 |
| O-05 候选 | solve_len=16 异常 | solverAppendCode sl 表达式在 loop 内二次求值 |
**铁律：分支判定必须读 set 之后已写入的图变量（getNodeGraphVariable），不能复用 set 前的表达式。**

### B. 列表物化/截断——3 连发
| 提交 | 症状 | 根因 |
|---|---|---|
| c543584 | seo 全 0 短物化 | 列表全 0 被引擎物化成 [0] → 加 13 位哨兵 1 |
| c53ac7b | 自转轴越界 | logicReset blockOrient 哨兵泄漏（1..26）→ 截断恢复循环 |
| abd3673 | 角块 mask 振荡 | solveBuf 残留（solveLen=0 但数组不清空） |
**铁律：① 易被全 0 的列表尾部加哨兵 1；② 重置长度计数 ≠ 清空数组——重算入口先清 solveBuf 100 项。**

### C. 帧预算/节点上限
| 提交 | 症状 | 根因 |
|---|---|---|
| 53d0e79 | lock 卡死 | 负 moveId 折叠单记录 3027 帧超限截断 |
| 0a1f2d8 | 后排块半转 | 整转单事件 2889 帧截断 |
| fcc7663 | 整转缺二段运动 | 视觉根图 multipleBranches 12 case > 引擎 10 case 上限，第 11/12 分支成孤立链 |
**铁律：① 单事件 <3000 帧；② 根图 multipleBranches 命名 case ≤10（+1 default）；③ 大循环拆事件/批量定时器。**

### D. 注入/验证流程
| 提交 | 症状 | 根因 |
|---|---|---|
| cbfa138 | 块错位 | 修复编译失败从未注入（2906） |
| 735140e | EROFS | /mnt/c 只读挂载（环境） |
**铁律：注入后必须 读图核验（explain 真实 GIL）+ resync + md5 一致；编译成功 ≠ 注入正确 ≠ 游戏行为正确。**

### E. 队列/并发
| 提交 | 症状 | 根因 |
|---|---|---|
| 518898b | 队列串台 | 打乱/手动/求解并发入队 |
| 507e2c5 | — | 打乱播放期间忽略外部指令（autoMode 守卫） |

## 四、已验证的正确模式（中二层直接复用）

1. **事件驱动规划**：规划图不模拟转动（避免状态漂移），只读发布状态 → 算下一步。
2. **状态发布**：flowAfterTurn 每步后发布 solver_cp/co/ep/eo/ct 到固定 stHost；solverPlan 读同一实体。
3. **负 moveId 折叠拆分**：op3(-f) → 3 次逻辑-only（negDone 状态机 0.02s 步进）+ 1 次负轴视觉，每条记录独立 <3000 帧。
4. **列表哨兵**：solver_eo 13 位 / solver_co 9 位 / blockOrient 尾哨兵 1，防引擎短物化。
5. **solveBuf 清空**：重算入口（op5/op12/stage 切换）solveLen=0 后 solverClearBuf 清 100 项。
6. **宏表**：CF_X_POLICY（十字）/CF_CORNER_POLICY（角块）策略表，索引 = mask*24+state，longListGetInt4 4 块×96 分块读取；宏 code 0..17 = face/dir/steps（18=NOP 占位）。
7. **算法核验先行**：verify-corner-macros.mjs 离线模拟（逻辑表 applyMove）→ 证明宏保持性/收敛性后再动运行时。
8. **节拍**：面转 preTick 1.66s / emitTick 1.52s / doneTick 2.01s；整转 wholePre 7.18s / wholeEmit 6.6s / wholeDone 10.45s（触发前后 +20%、整转 +30% 降载后实测值）。

## 五、验证方法论（分层证据）

1. **算法层**：离线模拟（CubeLib/逻辑表）——宏正确性/收敛性/保持性，样本量 ≥3000。
2. **运行时层**：日志（gia_log.py frames）——dbgVal（solveMask）/solve_seq/solve_len/solver_cp/co/ep/eo 发布轨迹，与执行序列（0403 curMove）对比。
3. **注入层**：gsts 注入 okN + explain 读真实 GIL 核验（节点/连接/变量 pin）+ maps:resync + md5（Save_Level/Temp 一致）。
4. **用户层**：游戏复测（最终裁决）。

日志分析要点：
- 负整数双显示：Integer 字段 uint64（-2=18446744073709551614），List 元素 uint8（-2=254）；解析用 BigInt。
- dbgVal 是 solveMask 字符串（stage 语义不同：stage1=十字 mask，stage2=角块 mask）。
- solve_seq 发布的是 solveBuf 全量 100 项，执行器只读前 solve_len 个——长度与内容必须分开核对。

## 六、中二层（E 层棱块，stage=3）开发预防清单

- [ ] 1. **状态表**：E 层棱 = ep 索引 8..11（FR/FL/BR/BL）。新增 solverEMask/solverEState/solverEFirstUnsolved（复用 solverEdgeState 模式，home 8..11）。注意 M/E/S 中层转（moveId 7..9）也会动 E 棱——发布状态已含 ep/eo，无需新增发布。
- [ ] 2. **宏表**：新 CF_E_POLICY + CF_E_MACRO（≤100 项/块，longListGetInt4 最多 4 块=400 项；若超 400 需扩 longListGetInt5 或拆策略）。生成器参考 gen-cfop-tables.mjs。
- [ ] 3. **宏保持性**：E 层宏必须保持第一层（十字+角块）。**先离线验证**（复用 verify-corner-macros.mjs 模式：E 宏执行后第一层 mask 不减、E 层 mask 单调增）再写运行时。
- [ ] 4. **状态机**：stage 3 新分支（solverPlan 的 pStep 1/2/3/4 各加 case 3）。stage 分支 multipleBranches 4 个 case（0..3）≤10 上限 ✓。切 stage3 的 solveLen=0 处**同样调用 solverClearBuf**。
- [ ] 5. **帧预算**：E 宏展开 ≤3000 帧/事件；负折叠用 negDone 模式；宏 code 追加逐 code 一帧（planTick 0.15s），长宏（16 code）重算 ~3s 可接受。
- [ ] 6. **二次物化**：新复合里分支判定一律读 set 后的图变量；循环内不要复用外层表达式当索引。
- [ ] 7. **mask 语义**：stage3 的 solveMask 改 E 层 mask；stage 2→3 切换条件 = 角块 mask==15（现有 plan-done 逻辑要改：op7 只在 stage==3 且 E mask==15 时发）。
- [ ] 8. **注入闭环**：改完 → 编译 --noinject → 注入 → explain 读图核验 → resync → md5 → 用户复测。
- [ ] 9. **回归**：stage 0/1/2 行为不得变（中心/十字/角块 mask 判定、solveBuf 清空、负折叠、节拍）。

## 七、工具与命令速查

```bash
# 编译（不注入）
node ../../bin/gsts.mjs --noinject
# 注入 + resync + md5 核对
node ../../bin/gsts.mjs
node ../../bin/gsts.mjs maps:resync --map-id 1073741899
md5sum ".../Beyond_Local_Save_Level/1073741899.gil" ".../Temp/1073741899.gil"
# 读图核验（真实 GIL）
npx tsx tools/explain-gil-node-graph.ts "<map.gil>" --graph <gid> --depth 1
# 日志分析
python .agents/skills/debug-log-investigator/scripts/gia_log.py "<日志.gia>" records --gil "<map.gil>"
python .agents/skills/debug-log-investigator/scripts/gia_log.py "<日志.gia>" frames --contains "solveMask"
# 离线算法核验
node examples/rubik-3x3/tools/verify-corner-macros.mjs <角块样本> <十字样本>
# 执行链核验（0403 vs 发布轨迹）
node examples/rubik-3x3/tools/verify-exec-vs-publish.mjs
```
