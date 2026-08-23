# 完整复盘：魔方 3×3 性能优化 P0-1——从日志量化到 analytic blockOrient 增量维护（2026-08-21）

> 范围：2026-08-21 3×3 魔方性能优化波次（日志工具升级 → 量化分析 → P0-1 实施 → 两次修复）
> 视角：主代理完整任务复盘
> 证据：`Beyond_Debug_Log/2026-08-21_19-03-42_2798_110170759.gia`（被踢日志）、
> `2026-08-21_18-55-03_2797_110170759.gia`（未踢对照）、`2026-08-21_20-36-52_2799_110170759.gia`（修复后测试日志）、
> `examples/rubik-3x3/src/orientTables.ts`、`examples/rubik-3x3/src/composites/{logic,flow,list}.ts`
> 状态：用户正在游戏核验 P0-1 + 两次修复后的版本

## 一、错误谱系总览

| # | 根因层 | 具体错误 | 修复 | 状态 |
|---|---|---|---|---|
| 1 | 性能/负载 | 10 步连打被踢；单秒峰值不是主因，**10 秒窗口负载 34,180 > 旧日志 28,938** | 日志工具新增每秒负载 + 滚动窗口分析 | 闭合（分析结论） |
| 2 | 设计/时序 | P0-1 把 `blockOrient` 在 `logicApply*` 更新为"转动后"，但视觉层需要"转动前"朝向算自旋轴 | 新增 `blockOrientPre` 快照；`publishShared` 发布 pre，`flowAfterTurn` 同步 post→pre | 修复待核验 |
| 3 | 实现/引擎约束 | 新增 `moveOrientTransition` 表 288 项超过**列表字面量 100 上限**，游戏报"列表长度超过100" | 拆成 `moveOrientTransition0/1/2`（100+100+88）+ 新增 `long_list_get_int` 复合 | 修复待核验 |
| 4 | 验证/缓存 | 注入后 explain 读到旧 flow_after_turn（GIL 索引缓存未失效），误判注入失败 | 清 `/tmp/gia-gil-*.json` 缓存 + 用 parse 工具交叉核对 | 闭合（工具方法） |
| 5 | 流程/用户侧 | 注入后用户未重载地图，游戏仍执行内存中的旧图 | 明确要求退到主菜单/重启后重进 | 流程提醒 |

## 二、最近一次错误的完整调查链

**现象**：用户测试新注入版本，游戏报"列表长度超过100"。

1. 用户原话定位错误点在 `long_list_get_vec3`（其实是大列表字面量）。
2. 检查 `game.json` 变量声明 → 发现 `moveOrientTransition` 是 288 项 int_list 字面量。
3. 对照 dsl-nodegraph-development 技能第 55 行：**初始列表字面量最多 100 个元素**。
4. 修复：生成器输出分块 `moveOrientTransition0/1/2`；新增 `long_list_get_int` 复合（复用 `long_list_get_vec3` 的选择器模式）；`logic.ts` 的 `nextOrient` 改用 `longListGetInt`。
5. 验证：`game.json` + 真实地图均无变量列表 > 100；`check-gil-composite-refs` 0 悬空。

## 三、为什么反复出问题——系统性根因

1. **新增大表时没有自动套用已知的 100 上限约束**。仓库里 `localAxisTable` 早已用 `localAxisTable0/1/2` 分块，`long_list_get_vec3` 也早已存在；新增 `moveOrientTransition` 时直接复制了 `orientIndexByEuler`（64 项 ≤100）的写法，没有意识到 288 项超限。
   - 规律：**任何新增大表（>100）必须同时产出分块 + 长列表读取复合，不能只加一个表**。
2. **共享状态更新时机与消费方语义脱节**。`blockOrient` 被逻辑层（转动后）和视觉层（转动前）以不同语义消费；增量维护时只考虑了"逻辑正确"，没先确认"谁在什么时候读"。
   - 规律：**改动共享状态前，先列清所有消费者及其读取时机（pre/post move）**。
3. **注入后的验证存在缓存盲区**。`dump_gil_index.ts` 按路径+mtime 缓存，但 explain 工具显示旧内容导致一度误判；必须清缓存或用底层 parse 交叉核对。
   - 规律：**注入后读图自检若看到"没改"，先清 `/tmp/gia-gil-*.json` 再复核，不要直接下结论**。

## 四、流程与方法论教训

1. **量化先行**：`perf --sec` 把每秒负载和滚动窗口算出来后，才确定 P0-1 是 13.5% 的单点收益，避免凭感觉选优化方向。
2. **表正确性用真实日志验证**：`moveOrientTransition` 方向用 9 步真实 blockOrient 快照验证（+90° 右手法则 0 误差），比纯数学推导可靠。
3. **滚动窗口分析**：1 秒峰值旧日志更高（9,439 vs 6,418），但 10 秒窗口新日志更高（34,180 vs 28,938）——**被踢要看持续平均，不是瞬时峰值**。
4. **用户测试前必须确认重载**：注入写盘 ≠ 游戏已加载；地图不重载时旧图仍在内存执行。

## 五、风险探索与未闭合项

- P0-1 收益待用户游戏核验：预期消除 `flow_update_orient` 全链 9,054 帧/9,789 负载（13.5%）。
- `long_list_get_int` 为新增复合，需在真实地图跑通后确认选择器数值正确（逻辑层 blockOrient 是否与物理一致）。
- 若 P0-1 通过，后续 P1-5（胜利检查防抖）、P0-2（预计算轨道速度）仍待评估。
- `forceFull` 机制可用来清理地图残留旧 def（如 `flow_update_orient`），本轮未启用。

## 六、产出清单

- 修复：`logic.ts`（blockOrientPre + longListGetInt）、`flow.ts`（publishShared/flowAfterTurn）、`list.ts`（long_list_get_int）、`orientTables.ts`（分块）、`game.ts`（分块变量）
- 工具：`gia_log.py perf` 新增每秒负载 + `--sec`
- 文档：`debug-log-format.md`（f3=秒）、`SKILL.md` 性能 playbook
- 技能：本复盘 + dsl-nodegraph-development 长列表模式
