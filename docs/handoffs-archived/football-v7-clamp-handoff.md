# 足球 v5 第七轮——clamp max/min 修复后行为验证（交接文档）

```text
mode: interrupted-task
focus: 回收用户第七轮游戏测试（clamp 笔误修复 b2370a5 后的带球/踢球行为），正常则收尾、异常则日志取证
status_at_handoff: 修复已构建+注入（四图 ok 4/4）+ 静态读回核验通过；用户第七轮测试回报 pending
```

```text
durable_goal: 足球 demo v5 三层架构（使用/逻辑/渲染信号化）游戏内可玩
durable_candidates:
  1. clamp max/min 笔误家族——"min(|v|,上限)"注释配 max 公式 `(a+b+|a−b|)/2`，把 <24 速度归一化吹到 24；
     也解释第 2-4 轮"vel 模恒 24"历史现象（第七轮验证后并入复盘+PKC）
  2. 引擎单节点图上限=2000（用户 2026-09-01 强制；已改 AGENTS/dsl/game-from-scratch 技能/工具 LIMIT c070e6a；
     PKC 旧 claim clm_645571FF/clm_213B9BC24 的 3000 口径待维护者更正，登记 O-31-05）
  3. r4 地图 fly/roll/slide 缺 phys_goal_collide 调用节点（上会话构建产物缺陷，根因未查——疑构建缓存/陈旧 dist；
     本会话忠实构建已补上，球门碰撞/计分第七轮起首次真正生效）
  4. ARCHITECTURE-V5.md 仍未同步架构修正（决策收编/828 收缩/队列退役）——待行为验证通过后一并做
promotion_status: candidate_only
knowledge_entrypoint: none（PKC 录入走 open-items O-2026-08-31-03/O-31-05 交维护者提案流程）
```

## 当前状态与首个检查

**未完成步骤**：用户第七轮游戏测试回报（验证 b2370a5）。

**首个只读检查**（用户回报后执行，DSH 沙箱内 /tmp 不跨 bash 调用持久，中间产物写仓库 `tmp/`）：

```bash
ls -lt /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Debug_Log/ | head -4
# 应出现晚于 2026-09-01_09-56-13_3073 的新 .gia（第七轮）
cd /home/h/genshin-ts/.agents/skills/debug-log-investigator/scripts
LOG=<新日志路径>
GIL="/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741908.gil"
python3 gia_log.py "$LOG" records --summary        # 三图有记录
python3 gia_log.py "$LOG" frames --gil "$GIL" --graph 1073741825 > /home/h/genshin-ts/tmp/x825-r7.txt
```

- **期望成功签名**（对照第六轮 rec33 位置）：
  - drain 段 `Division`（缩放比）IN0 ≈ IN1（≈1.0）——不再是 24/mag 的大比值；
  - `Set Custom Variable vel` 序列平滑（模长 ≈ 玩家跑速×1.2 内，约 2-3），无 ±16~24 正负震荡；
  - carried 链完整（decide → 写tmpVel → 积分 → 发布，第 5 轮修复后已有）；
  - 踢球（若有）：FLY 分支首次带 goalCollide 运行，球进门/门柱反弹有效。
- **失配信号**：vel 模恒 24 / 一拍跳 >5m / 缩放比仍 >2 → clamp 修复未生效（核对注入时间戳）或另有放大源；
- **需停下问用户**：日志证据与用户描述矛盾、或出现新形态异常。

## 工作上下文

- 仓库 `/home/h/genshin-ts`，分支 `feat/composite-and-project-knowledge`；
- 本 wave 提交链（旧→新）：`e348612`（outflow 断链修）→ `8a3e13f`（第五轮复盘）→ `34f5388`（826 预算修）→ `c070e6a`（上限 2000 全局更正）→ `88513f5`（open-items）→ **`b2370a5`（clamp min 修复，当前 HEAD）**；
- 地图 1073741908，球实体 1077936135；图 825 logic / 826 input / 828 获得图 / 829 render；
- 关键 defId：decide_atomic 1610700031 / carried_tick 1610700028 / apply_immediate 1610700029 / phys_tick 1610700024 / transition 1610700017 / goal_collide 1610700007；
- 修改文件：仅 `examples/football/src/composites/ball-phys.ts`（本轮 clamp 两处：drain ~L175、applyImmediate ~L517）+ 上限 2000 相关（src/cli/assets_node_graphs.ts、graph_edit.ts 注释、AGENTS.md、两个技能）；
- 脏工作区：`examples/football/sim/reports/` 两文件为他人改动勿动；`tmp/`、`data/knowledge/bundles/` 等历史遗留；
- 并发会话活跃（rubik3x3-client 线在 c7c263a/af6a139 提交，勿动其文件）。

## 事实与约束

**已确认**：
- 五→七轮根因链全部帧级闭环：⑤复合无 outflow→注入器裁边断链（e348612）→⑥a 826 预算超 2000 拒载（34f5388）→⑥b clamp max/min 笔误吹速度（b2370a5）；复盘文档 `docs/game-engine-knowledge/retrospective-2026-08-31-football-v5-round5-outflow-trim.md`（第五轮）；
- 注入后静态：四图 gameNodeCount 825=696 / 826≈0 / 828、829 极小，全 ≤2000；clamp 外层已读回为 Subtraction；
- 第六轮日志 3073 证明决策/G律/积分/发布全链工作正常（0.92→[吹胀24]→2.38 收敛完整）。

**未验证**：clamp 修复后游戏行为（第七轮）；FLY+goalCollide 首次真实运行。

**阻塞/未知**：无硬阻塞；r4 构建产物为何缺 goalCollide 调用未查根因（候选项 3）。

## 执行配方（用户回报后）

1. （只读）上方首个检查三连；
2. （只读）核对 vel 写入序列与 drain 缩放比；
3. 正常 → 走收尾（见 secondary）；异常 → 帧值对照定位，**先读日志再改代码**；
4. 改码后：`npm run build` → `cd examples/football && node ../../bin/gsts.mjs -c gsts.config.ts`（注入地图 1073741908——**已授权链，每次注入前告知用户**；DSH 沙箱对 /mnt/c 与 ~/.genshin-ts 备份目录可能只读，EROFS 时按沙箱升级规范一次重试或请用户执行）；
5. 注入后必跑读图核验（改动复合调用点边存活 + 预算 ≤2000）。

## 安全与沟通门

- 注入链（地图 1073741908、四图）已授权延续有效，但每次注入前告知；**新类型操作**（删图/挂载变更/其他地图/def-clean 清残）需重新确认；
- 必须停下问用户：需改编译器、删真实文件、测试反馈与日志矛盾；
- 每次测试前提醒用户**重载地图**拿最新注入。

## 证据层

| 层 | 状态 |
|---|---|
| 类型/编译（npm run build） | done（b2370a5 零错误） |
| DSL 编译 + 注入 ×4 图 | done（ok 4/4） |
| 读图核验（注入后） | done（clamp=Subtraction、预算全 ≤2000、carried/applyImmediate 链完整） |
| **游戏内行为** | **pending（第七轮用户测试）** |
| 手感复测（0.5s→0.12s 恢复，六常量联动清单在 ball-state.ts LOOP_TICK 注释） | blocked（待行为通过） |

## 次级待办（非下轮焦点）

- 第七轮通过后：复盘补第六轮（clamp 笔误谱系 + 2000 上限更正 + 预算口径教训）+ 知识落盘 + 技能迭代（dsl 技能可加"min/max 无节点公式抄写自查"条目）；
- O-31-05：def 残留债务 def-clean / 编译期 outflow-warning 防线 / render 悬空分支 / PKC 3000→2000 更正转维护者；
- ARCHITECTURE-V5.md 同步。

## 建议技能

- `debug-log-investigator`：回报后解析日志（一次一张图）；
- `gil-node-graph-reading`：再改图后的注入读回核验（Step 3.5 清单）；
- `dsl-nodegraph-development`：若需再改 DSL（已含 outflow/上限 2000 新铁律）；
- `task-retrospective`：第七轮闭环后的复盘。

## 参考（按需深读）

- `docs/game-engine-knowledge/retrospective-2026-08-31-football-v5-round5-outflow-trim.md`——第五轮四层证据与系统性根因；
- `docs/maintenance/open-items.md` O-2026-08-31-03/O-31-05——知识树待录与债务清单；
- 第六轮日志 `2026-09-01_09-56-13_3073`（吹胀铁证在 rec33 [5]-[22]）；第五轮日志 `2026-08-31_20-29-31_3069`（断链铁证 rec36）。
