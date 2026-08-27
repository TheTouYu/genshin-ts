# 完整复盘：求解器 solveBuf 残留——第一层还原不收敛/角块 mask 振荡（2026-08-27）
> 范围：rubik-3x3 自动求解器（solverPlan 规划 + solver 执行）重算时 solveBuf 残留导致执行错误序列、角块反复拼好又回退
> 证据：日志 2931（dbgVal mask 0,1,1,3,2,2,2,3 振荡 + solve_seq 含残留 -1 + 同秒 3 面转 + cp 轨迹角块回退）；离线验证脚本 verify-corner-macros.mjs（算法层 8000 样本全绿）
> 状态：**已修复并用户游戏验证通过**（abd3673 + 注入 ok6 + 读图核验 4 处 solver_clear_buf 就位 + resync md5 一致 + 用户复测 2932 确认第一层可完成不再循环）；O-04/O-05 随根因修复闭合
> 提交：abd3673（修复）；配套脚本 verify-corner-macros.mjs / verify-exec-vs-publish.mjs

## 一、错误谱系总览（求解器状态同步类）

| # | 日期 | 提交 | 根因层 | 具体错误 | 修复 |
|---|------|------|--------|----------|------|
| 1 | 08-26 | ad81ea3 | 执行器 | solver emitTick 丢步——续播判定复用表达式 idx+1（二次物化） | 改为读已写入的 solveIdx |
| 2 | 08-26 | 5766bcb | 状态机 | negDone 分支复用表达式 ph 二次物化 → 负向只做 2 次逻辑少 90° | 分支读已写入的 negPhase |
| 3 | 08-27 | abd3673 | 规划器缓冲 | 重算 solveLen=0 但 solveBuf 数组残留 → 新序列尾部读到旧 moveId → 执行错误步骤破坏角块 → mask 振荡不收敛 | 新增 solverClearBuf 4 处清空 |
| 4 | 08-27 | — | 执行器 | 同秒 3 面转（定时器叠加/节拍失控） | 待复测确认；登记 O-2026-08-27-04 |
| 5 | 08-27 | — | 规划器 | solve_len=16 但有效 moveId 少于 16（sl 表达式二次物化候选） | 登记 O-2026-08-27-05 |

## 二、最近一次错误的完整调查链

### 现象
用户反馈：自动还原会回退已拼好的十字/第一层，一直循环不完成。动画与性能（上轮整转回归修复）已正常。

### 调查顺序（算法稳定 → 运行时实现）
1. **离线核验算法**：写 verify-corner-macros.mjs，用真实逻辑表+宏表模拟——十字宏 3000 样本不破坏已拼棱且收敛；角块宏 5000 样本保持十字、不破坏已拼角块、收敛。**算法层完全稳定**（此步先排除算法嫌疑，符合用户"先核验算法稳定性"要求）。
2. **日志铁证**（2931）：
   - dbgVal（solveMask 字符串）序列 = 0,1,1,3,2,2,2,3，各跟 seq-ready → **角块 mask 2↔3 振荡，从未到 15，无 plan-done/op7**
   - solver_cp 轨迹：DBR 角块（home5）拼好（cp[5]=5）后下一轮被移走（cp[5]=0）→ 回退
   - solver_co 轨迹：co[5]=2（twist 未归位）→ solved 判定失败
   - solve_seq 发布：solve_len=16 但前 16 个值混入 8 个残留 -1（255）
   - 同秒 3 个完整面转（rec93/97/101，89KB×3）→ 节拍失控
3. **执行序列模拟**（verify-exec-vs-publish）：0403 执行序列 vs 发布 cp 轨迹完全不一致 → 执行与规划不同步
4. **根因**：solverPlan 重算只 solveLen=0，solveBuf（100 项图变量）数组元素不清空。新序列展开步数少于旧序列时，尾部残留 moveId 随 set_custom_variable(solve_seq, solveBuf) 一起发布，执行器按 solve_len 读到残留步执行 → 破坏已拼角块 → mask 振荡 → 无限重算循环。

### 修复
- 新增复合 solverClearBuf（finiteLoop 100 项 set_list_value 置 0），在 4 个重算入口（op5 / op12 / stage 0→1 / stage 1→2）solveLen=0 后调用
- 读图核验：真实 GIL 中 4 个 solver_clear_buf（n=68/88/242/249）执行流 = solveLen=0 → 清空 → pStep=1 → planTick，全部就位

## 三、为什么反复出问题——系统性根因

1. **「重置长度计数 ≠ 清空数组」的缓冲语义盲区**：solveBuf 声明 100 项，追加用 set_list_value（覆盖写），重置只改 solveLen——长度与内容两套状态不同步。任何"预分配数组 + 长度计数 + 覆盖追加"的模式都有此风险（queue 用 dict 所以无此问题）。
2. **求解器状态同步类错误反复出现（3 次同源）**：emitTick 丢步 / negDone 二次物化 / solveBuf 残留，本质都是「DSL 表达式被二次求值/状态读取与写入不同步」。这类问题在事件驱动 + 图变量持久化的架构下是高发区，缺统一的检查清单。
3. **验证链分层**：算法层（离线模拟）与运行时层（日志状态轨迹）是两层独立验证。这次先做算法层（全绿）排除了策略表嫌疑，再聚焦运行时——两层分开做才没被"表错了"带偏。

## 四、流程与方法论教训

- **有效**：离线验证脚本把"算法稳定"钉死（8000 样本），避免在错误层浪费轮次；dbgVal/solve_seq/solver_cp 的发布值提取是定位关键。
- **绕路**：模拟脚本自身 3 次 bug（正则转义、路径、Number uint64 精度）浪费数轮；日志 uint8 显示（254=-2）与 uint64 显示（18446744073709551614）并存造成误判。
- **工具坑**：Number() 无法精确表示 uint64 负值 → 必须用 BigInt 解析日志大整数；gia_log frames 输出值要区分 set/get 与 rec 上下文。
- **教训**：连续重算（8 次 seq-ready）应尽早怀疑「空序列/无状态推进循环」，而不是先猜宏错误。

## 五、同族扩展

### 已排查
- queue（turn 图）：dict 结构，无数组残留风险 ✓
- solverCore 其他重置点：无同类模式 ✓
- solveBuf 4 个重算入口：已全部清空 ✓

### 未覆盖项（登记 open-items）
- O-2026-08-27-04：执行器定时器叠加（同秒 3 面转）——solveBuf 修复可能缓解（残留→序列变长→节拍乱），待复测确认；若复发需执行器防重入（op6 时清理旧定时器）
- O-2026-08-27-05：solve_len=16 但有效 moveId 少于 16——solverAppendCode 的 sl 表达式二次物化候选；待复测后深挖
- O-2026-08-27-06：solverCornerMask 的 c4..c7 输入参数未使用（hardcode 4/5/6/7）——代码质量，不影响当前功能

## 六、产出清单

### 修复
- examples/rubik-3x3/src/composites/solverCore.ts：新增 solverClearBuf（id 1610700080）
- examples/rubik-3x3/src/solverPlan.ts：4 处重算入口调用 solverClearBuf

### 验证脚本（保留）
- tools/verify-corner-macros.mjs：算法层离线核验（十字+角块宏保持/收敛）
- tools/verify-exec-vs-publish.mjs：执行链 vs 发布轨迹核验

### 证据
- 日志 2931（/mnt/c/.../Beyond_Debug_Log/2026-08-27_17-26-51_2931_110170759.gia）
- 注入后真实 GIL（md5=185a232a，Save_Level/Temp 一致）

### 提交
- abd3673 fix(rubik-3x3): 求解重算前清空 solveBuf 防残留 moveId 被执行器读取

### 待录入（open-items）
- O-2026-08-27-04 / O-2026-08-27-05 / O-2026-08-27-06（见第五节）
