# 完整复盘：3×3 求解器真实地图集成——节点图数量两次误判与协议回退（2026-08-23）

> 状态：当前实现（部分）/ 待验证
> 边界：rubik-3x3 自动复原，从离线规格落地到真实地图注入与负载控制的这一波（4c0f0f3..723f679）
> 证据：提交 196da6d / 8a4eb6a / a4ec787 / 723f679；真实地图 1073741899 写后回读；游戏反馈 3054 超标/删主图可进

## 一、错误谱系总览

| # | 现象 | 根因层 | 结论 | 落地 |
|---|---|---|---|---|
| 1 | 游戏拒载（判定节点异常） | DSL exec 边 | flowAfterTurn 里加 brSolve 双分支，true 分支只有 sendSignal、false 空 → 孤立条件分支 | 回退该分支，回执移入主图 unlock 处理器 |
| 2 | 5 个求解信号显得多 | 设计 | 一个信号 + op/val 参数即可 | 合并为 rubik3x3_solve(op,val) |
| 3 | 编译报 Generic parameter not matched | DSL 根图/复合差异 | 根图事件回调里 registerExecNode 带混合字面量被改写为 assemblyList | 根图一律改用 f.setNodeGraphVariable 高层 API |
| 4 | 新增节点图 3054 超标 | 归因错误 | 先归因 solver 图（拆分后仍 3054），实际是 game 主图 | 让用户做删主图对比实验定位 |
| 5 | 本地公式算 2533，游戏报 3054 | 口径 | 游戏内节点图数量才是真值，本地 engineExpanded/预测偏小 | 以游戏真实数 + 用户删图实验为准 |
| 6 | game 主图 3054 超标 | 负载设计 | 逐条 move/ack/solveActive 桥都塞进了 game 主图 | 求解结果灌 queue 复用自动播放，game 落到 2173 |
| 7 | 删主图后重建 auto 分到 1830/1831 | ID 分配 | assets:node-graphs create 是 max+1，不复用空洞 | DSL/config 同步改图 ID + 重挂 + 清 stale mount |

## 二、关键调查链（3054 归因 + game 主图瘦身）

1. 初始反馈新增节点图 3054，按直觉查 solver：拆分后仍 3054，归因失败。
2. 用户自己做实验：删除主图后可进游戏，铁证 3054 在 game 主图。
3. game 增量：solveActive/逐条 move/ack/unlock 分支/发布状态逐项撑大 root。
4. 定案：删逐条桥，solverPlan 写 solve_seq/solve_len，game 只加灌 queue + auto 播放。
5. 实测（本地公式）：game 1576/???，solverPlan 1362，solver 24。

## 三、系统性根因（3 条）

1. 节点图预算的真值在游戏，不在本地工具；本地公式偏小且根图增量要自己数清楚。
2. 根图事件回调与复合 build 的 DSL 语义不同；registerExecNode + 混合字面量在根图会被改写而炸。
3. 跨图协作先复用已有播放路径（queue 自动播放）再考虑新协议。

## 四、流程与方法论教训

- 真实地图主图 ID 被删后 create 是 max+1 不复用空洞；同步 DSL/config/挂载 + 清残留。
- 游戏内节点数量是最终 gate；本地预算只作趋势。
- 单信号多 op 在根图用 multipleBranches 分发。

## 五、未闭合项

- 求解器只解十字，角块/第二层/OLL/PLL 未接入。
- stale mount 1073741825 残留在控制器 A。
- exec 图(1073741828)在 queue 播放方案下已无用。
- 旧 5 个 solve 信号仍注册（死注册）。

## 六、产出清单

- 提交 196da6d / 8a4eb6a / a4ec787 / 723f679。
- 真实地图：注册 6 信号；建实体 1077936230；建/挂/注入图 1828/1829/1830/1831。
- 本复盘 + 技能迭代（dsl-nodegraph-development / genshin-ts-asset-operations）。
