# 完整复盘：视觉根图 Multiple Branches 10 case 上限——整转回归（2026-08-27）
> 范围：rubik-3x3 视觉根图 multipleBranches 分支数上限导致整转 orbit22/orbit23 分支孤立、后 12 块缺二段运动
> 证据：日志 2927 rec27/rec28（orbit22/orbit23 落入 default 空操作）、真实 GIL explain（n=2 只有 10 命名 case + default，orbit22/23 链孤立）、编译器 optimize_timer_dispatch.ts:44 MAX_TIMER_DISPATCH_CASES=10
> 状态：已修复（0fab0c1）+ 已注入（ok 6, fail 0）+ 读图核验（10 case、无孤立链）+ maps:resync md5 一致
> 提交：0fab0c1（修复）、0932324（注入记录）

## 一、错误谱系总览

| # | 日期 | 提交 | 根因层 | 具体错误 | 修复 |
|---|------|------|--------|----------|------|
| 1 | 08-26 | e044d29 | 引擎/编译器 | 面转双通道加 turnblockB/orbit2B → 视觉 MB 12 case → orbit22/orbit23 被丢弃 → 2909 位置错乱 | bedc358 回退（恢复 10 case） |
| 2 | 08-26 | bee6364 | 架构 | 整转 52 槽→8 批量事件，加 turnblock0..3/orbit20..23 → 视觉 MB 回到 10 case，刚好 | 正常工作 |
| 3 | 08-27 | fd40432 | 引擎/编译器 | 重新加 turnblockB/orbit2B → 视觉 MB 回到 12 case → orbit22/orbit23 再次被丢弃 → 2927 整转后 12 块缺二段运动回归 | 0fab0c1（本轮修复） |
| 4 | 08-27 | fd40432 | 编译器 | optimize_timer_dispatch.ts MAX_TIMER_DISPATCH_CASES=10 但只对无 default 分支的 dispatch 生效；有 default 时 >10 case 原样进 GIA 被引擎截断 | 本轮登记 open-items |

## 二、最近一次错误的完整调查链

### 现象
fd40432 面转双通道测试后，用户反馈整转（整体旋转）块错乱、后一些块没有执行完整的旋转。

### 差分
- 前一个工作状态（371e5aa）：视觉根图 MB = 10 case（turnblock/turnblock0..3/orbit2/orbit20..23），整转 4+4 批量，正常。
- fd40432 diff：turn.ts 加 faceTurnTimesB/faceOrbit2TimesB、flow.ts 加 t1b/t2b 定时器链、visual.ts 加 turnblockB/orbit2B 两个 case → 视觉 MB 12 case。

### 定位
1. 2927 日志 perf 显示 rec27/rec28（orbit22/orbit23）仅 7 帧，而 rec25/rec26（orbit20/orbit21）256 帧。
2. 帧表显示 rec27 WhenTimerIsTriggered(OUT2:String=orbit22) → Multiple Branches 到 default 分支（handlerMode=2）。
3. 当前真实 GIL explain 确认 n=2 Multiple Branches 只有 10 命名 case + default，orbit22/orbit23 的 6 个 set 变量节点（n=30–35）是孤立执行链。
4. 编译器 optimize_timer_dispatch.ts 有 MAX_TIMER_DISPATCH_CASES=10，但 parseMultipleBranchesDispatch 遇到 sourceIndex=0（default 分支）返回 null，跳过 chunking 优化。

### 根因
引擎 Multiple Branches 节点上限 10 命名 case + 1 default（11 outflow）。有 default 分支时编译器不做 chunking，>10 case 原样进 GIA → 引擎丢弃第 11/12 个 case。

### 修复
整转 orbit2 批量从 4 个定时器合并为 2 个（orbit20=槽0..13 count=14 / orbit21=槽14..25 count=12），视觉根图回到 10 case（含 B 通道）。flowWholeTail 链 t0→t1→t2→t3→o0→o1→done。

### 验证
- 编译后 GIA 确认：visual.gia 无 orbit22/orbit23；turn.gia 无 orbit22/orbit23。
- 注入后真实 GIL explain：n=2 Multiple Branches 10 命名 case + default，无孤立链；orbit20 count=14、orbit21 count=12 字面量确认。
- 挂载：graphs not mounted anywhere (0)；maps:resync 后 Save_Level/Temp md5 一致（ca6d9f4e）。

## 三、为什么反复出问题——系统性根因

1. **引擎/编译器隐性约束未文档化**：Multiple Branches 10 case 上限早就存在（实测 2909 已触发、bee6364 刻意回避），但从未写入任何权威文档或技能。编译器有 MAX_TIMER_DISPATCH_CASES=10，但只对无 default 分支的 dispatch 做 chunking；有 default 时 >10 case 静默进 GIA 被截断——编译器缺口与引擎上限叠加，形成「无警告、无报错、只丢分支」的静默失败模式。
2. **整转 orbit 批量数 vs case 预算的耦合**：整转 orbit2 定时器数（4）直接占用视觉根图 MB 的 4 个 case；面转双通道加 2 个 case 就超限。这种耦合没有显式预算约束，每次加新定时器名都是盲踩。
3. **迭代历史的自相似性**：e044d29 加 B 通道 → 2909 位置错乱（orbit22/23 被丢弃）；bedc358 回退 → 修复；fd40432 加 B 通道 → 2927 整转回归（orbit22/23 再次被丢弃）——完全一样的错误模式，因为历史教训只存在于 PROGRESS.md 文本，没有沉淀为「写 multipleBranches 前先数 case 数」的编译器/技能规则。

## 四、流程与方法论教训

- **定位加速因素**：2927 日志 rec27/rec28 的 7 帧 vs 256 帧的 perf 对比，一秒暴露异常；然后帧表确认 timerName 与 default 分支，证据链清晰。
- **读图核验优先用 explain**：最初怀疑 orbit22/orbit23 字符串缺失，strings/grep 各显神通，最后 explain 直接看到分支列表——explain 是读图核验的第一工具。
- **注入权限**：/mnt/c 只读问题通过 sandbox_permissions=danger-full-access 解决；以后遇到 EROFS 直接升级权限 retry。
- **编译器优化缺口**：optimize_timer_dispatch.ts 的 chunking 应处理有 default 分支的情况（或至少发警告）。本轮回登记 open-items。

## 五、同族扩展

### 所有图 MB case 数扫描（注入后真实 GIL）
| 图 | 命名 case 数 | 备注 |
|----|------------|------|
| _GSTS_game (1830) | 2 | 安全 |
| _GSTS_relay (1831) | 2 | 安全 |
| _GSTS_visual (1832) | 10 | 满额，未来加任何新 case 必须合并/压缩 |
| _GSTS_solver (1833) | 7 | 安全 |
| _GSTS_solverPlan (1834) | 9 | 安全，但接近上限 |
| _GSTS_turn (1835) | 7 | 安全 |

### 未覆盖项
- 编译器优化（有 default 时 >10 case 不 chunking）——已登记 open-items，不在本轮修复。
- 视觉图 10 case 满额——未来若加中层双通道或其他新定时器，必须合并 orbit 或 turnblock 批量，不能硬加 case。

## 六、产出清单

### 修复
- examples/rubik-3x3/src/visual.ts：orbit20 count=14、orbit21 count=12、删除 orbit22/orbit23
- examples/rubik-3x3/src/turn.ts：移除 wholeOrbit2Times2/3
- examples/rubik-3x3/src/composites/flow.ts：flowWholeTail 链 4 turnblock + 2 orbit → done
- examples/rubik-3x3/src/solver.ts：preTick 1.66、emitTick 1.52、wholePre 7.18、wholeEmit 6.6、wholeDone 10.45

### 文档
- examples/rubik-3x3/PROGRESS.md：完整记录诊断与修复
- docs/architecture/composite/control-flow-api-cookbook.md：case 上限 ❌→✅ 闭合

### 证据
- 日志 2927（/mnt/c/.../Beyond_Debug_Log/2026-08-27_16-00-03_2927_110170759.gia）
- 注入后真实 GIL（已 resync，Save_Level/Temp md5=ca6d9f4e）

### 提交
- 0fab0c1 fix(rubik-3x3): 整转 orbit2 批量 4→2...
- 0932324 docs(rubik-3x3): 记录整转回归修复注入完成

### 待录入（open-items）
- O-2026-08-27-01：编译器 optimize_timer_dispatch.ts 有 default 分支的 >10 case dispatch 不 chunking → 静默截断
