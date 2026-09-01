# rubik-3x3 目录规则（探索本目录时自动注入）

> 地图 **1073741899「魔方3x3」**，玩法主图 **1073741825「魔方玩法」**。进度唯一入口：`PROGRESS.md`；
> 架构 `ARCHITECTURE.md`；节点预算规则 `NODE_COUNT_RULE.md`；知识手册
> `docs/game-engine-knowledge/rubik-autosolve-playbook.md`。客户端计算改造分支在
> `examples/rubik-3x3-client/`（2026-08-29 由本目录复制）。

## 一、资产与图速查（写回/注入前先对表）

- 图：主图 1073741825（stage 0-2 求解）；solverEPlan **1073741836**（E 层，挂载 1077936230）；
  solverLPlan **1073741838**（顶层 OLL/PLL，挂载 1077936230）；_GSTS_testPanel **1073741837**（挂测试台实体 1077936231）。
- 元件：「星枢3x3块_*」26 个（ID 1077936149..174，来源 1073741849）；控制器 prefab 1077936200 + 场景实体 1077936201（tabBar 15 项）。
- 求解器交棒 op 码：op13（stage2→E）/ op14（E→L）/ op7（最终完成）；op5=重算、op6=序列就绪。

## 二、不变量清单（改代码前逐条对照）

1. **单图 gameNodeCount ≤2000**（用户 2026-08-27 更正，不是 3000）：solverPlan 塞 stage 3 后 3198 拒载 → 按职责拆独立图。写图前先算预算（NODE_COUNT_RULE.md）。
2. **复用复合必须声明其依赖的全部图变量**：solverEPlan 曾漏 CF_MOVE_CODE_FACE/DIR/STEPS → 引擎读不到 → 追加静默失败 → 无限重算（日志 2944 实证）。
3. **solveBuf 上限 100 项**（101 项触发「列表初始化最多100个元素」拒载）；序列重算必须先清残留（solverClearBuf，abd3673——尾部残留旧 moveId 会被发布执行、破坏已拼层）。
4. **solve_len 必须与 solveBuf 实际内容同步**：前 N 项混入残留 -1 即残留次生现象（O-04/O-05 教训）。
5. **测试台与主控制器隔离**：新实验（第 3 层测试等）一律进测试台 1077936231，不塞主图 tab（初版塞 tab17/18 被用户纠正）。

## 三、验证纪律

- 离线先行：逻辑表/宏验证用本目录 `tools/*.mjs`（gen-*-tables / verify-*-macros，数千样本全绿才进运行时）。
- 注入后按读图核验红线回读真实 `.gil`（执行流/变量 pin/预算），resync 后核对 Temp md5。
- 用户游戏复测通过才算行为层闭合；PROGRESS 逐轮按三栏门禁记录证据。

## 四、安全边界

注入 1073741899 前按根 AGENTS.md 确认制 + 一次性授权边界执行；写回走 `genshin-ts-asset-operations` 安全流程（快照→候选→回读→写回→Temp 同步）。
