# 完整复盘：rubik-3x3 面转“一个块在动 / 转完不解锁”的真实根因（Stage3 疑似回归实为 DSL 视觉调度逻辑）

> 状态：面转锁死已定位两处根因（DSL 视觉调度 + 图挂载错位），均已修复 / 待游戏复测；初始化负载拆分待验证
> 范围：rubik-3x3 视觉图 `_GSTS_visual` 的 `whenTimerIsTriggered` 转向处理
> 视角：从 Stage3 编译器疑似回归，逐步下钻到真实执行时间线后，确认是 DSL 逻辑错误
> 证据：日志 `2850 / 2855 / 2859`；`.` 相关提交 `d9f61bb → a71c4ea`；基线快照
> `~/genshin-ts-evidence/rubik3x3-stage3-baseline/`；`.gia` 真实 decode。

## 一、错误谱系总览

| # | 现象 | 曾认定的根因 | 证据推翻点 | 真正结论 | 提交/状态 |
|---|---|---|---|---|---|
| 1 | 面转 / 整体转 / 打乱后锁死，`view_turn_unlock_if_last` 的 Equal IN0(slot) 空 | shared-vendor 丢失“复合 data 输出→复合 data 输入”conn（f842349 记录） | 真实 `.gia` decode 显示这条 conn 已物化；最小 case 也 PASS | conn 从未丢失 | 本会话实测推翻 |
| 2 | Stage3 5 个测试失败（boundary capture 物理 pin 过度物化） | 未区分测试回归与游戏回归，当成同一个 bug 修 | 修完 8 测试全 PASS，游戏仍坏 | 是独立编译器回归，但不是游戏根因 | `backup-stage3-fix-attempts` 分支（0d457a2 / 9a4fc6e） |
| 3 | 面转“只一个块在动、旋转不对” | 编译器给 Addition 边界 capture 输入包了 ConcreteBase | 编辑器回读“节点正常”，说明静态接线没问题 | 视觉图把 `execMove` 启动定时器误当成一次 slot=0 的转动 | `a71c4ea`（DSL 修复）|
| 4 | 修掉 3 后再按等于“没反应” | 初始化负载拆分（setTimeout）改坏执行顺序 | 日志 2862 rec2 视觉图只收到 execMove、没有任何 turnblock 帧 | 视觉图 `1073741832` 挂错实体：挂在 `1077936201`，而 `turnblock/orbit2` 定时器发到 `1077936203` | `assets:mounts` 移挂（地图写回） |

## 二、最近一次错误的完整调查链（时间线优先）

1. 起点：基线 `d9f61bb`（用户要求回到“问题首次发现版本”），注入游戏并记录基线快照。
2. 复测出日志 `2859`（16:10:31），只做了一次面转。
3. 按 `debug-log-investigator` 的 frames 工具，**严格按时间线读 rec3（game）和 rec4（visual）**，而不是 grep 单点：

   - `rec3`（游戏图）：
     - `[0] When Timers Added` → `execMove`，`timerSequenceId` 空
     - `[1304] Start Timer` → `turnblock`，列表 `[0.01..0.09]`（9 槽位）
     - `[1308] Start Timer` → `orbit2`，列表 `[0.16..0.24]`
   - `rec4`（视觉图）：
     - `[0] When Timer Is Triggered` → `execMove`，`timerSequenceId` 空
     - `[1] Multiple Branches(timerName)` → 走 `execMove`，**未命中 turnblock/orbit 分支**
     - 但 `[2..6]` 仍进入 `view_handle_timer_event`
     - `handlerMode=0`（默认/旧值）→ 走 `view_handle_turn_core`
     - `base=0, seq=0` → `view_handle_turn_core > Addition` 空
     - `[470] Addition` IN0/IN1 空；`[471] view_turn_unlock_if_last > Equal` `IN0=空 vs IN1=8` → false → 不解锁

4. 反查 `src/visual.ts`：`whenTimerIsTriggered` 的 `multipleBranches` 处理 turnblock/orbit 系列后，
   `join` 后**无条件**调用 `view_handle_timer_event`，`default` 分支不重置 `handlerMode`。
   → `execMove` 就以旧 `handlerMode=0` 被当成一次 slot=0 的转动。

## 三、为什么反复出问题——系统性根因

1. **把静态 wire 证据当运行行为**：`.gia` 里 conn/captured pin 存在，不等于游戏运行时值正确。
   真正确认行为的是日志里逐帧 IN/OUT 值，以及“事件→分支→节点”的执行时间线。
2. **先信了旧定位，没有先回读真实证据**：原始任务给定 “shared-vendor conn 丢失”，
   本会话一开始没有先用自己的最小 case 和真实 `.gia` 复核，导致在错误方向上修了两版。
3. **把测试回归和游戏回归混为一谈**：Stage3 5 个测试失败是真实、独立的编译器边界问题，
   但修好它们不会修复游戏；两者要分开验证。证据链要分层：测试 PASS / GIA 生成 /
   真实日志行为 / 用户游戏行为。

## 四、流程与方法论教训

- **游戏行为类 bug：日志时间线优先级最高**。先确定“这一帧事件是什么、进了哪个分支、算出什么值”，
  再碰源码/`.gia`。单点 grep 会错过“event 本身是 execMove，却走进了 turn core”这种跨分支错误。
- **用户 editor 回读是静态问题的裁判**。用户说“节点都正常”后，应立刻放弃静态 pin 形状猜想，
  转向运行时间线，而不是继续给 pin 形状加规则。
- **最小 case 是推翻高置信度定位的廉价武器**。“conn 丢失”这个前提，用一个纯数据复合最小 case
  就证伪了，早做能省掉后面两版误修。

## 五、风险探索与未闭合项

- Stage3 5 个 boundary-capture 修复目前在 `backup-stage3-fix-attempts` 分支（0d457a2、9a4fc6e），
  **未合入当前分支**。它是独立真实回归（p2w3/p2w8/p5w9/p5w10/p5w1），与面转游戏 bug 无关，
  需要单独开分支/单独验收，不能和 DSL 修复混在一起。
- 本条 DSL 修复已注入 + Temp 同步，**尚未用户游戏复测**；只有游戏内看 9 块正常转、正常解锁才算闭合。
- 上一版（9a4fc6e）的“Addition boundary capture 用普通 VarBase”修复也在 backup 分支，是否必要需
  在修正测试回归时一起重新裁定，不要当作游戏修复。

## 六、产出清单

- DSL 修复：`a71c4ea`（`examples/rubik-3x3/src/visual.ts`）
- 基线快照：`~/genshin-ts-evidence/rubik3x3-stage3-baseline/1073741899.baseline-d9f61bb.gil`
  （sha256 `5110c938…`）
- 待游戏复测：`view_turn_unlock_if_last > Equal` 是否有值、`view_turn_block` 是否按槽位逐块执行。

## 附录：第二波（19:51 日志 2862，挂载错位 + 初始化负载拆分）

1. 上一波 `a71c4ea` 修掉 execMove 误触发后，用户再按面转报“没有任何反应”。日志 2862 回读：
   - rec0（game）：tab 按下 → `flow_request_move` 在 **1077936201** 上启动 `execMove`；
   - rec1（game）：`flow_do_move` 在 **1077936203** 上启动 `turnblock`(9 槽) + `orbit2`；
   - rec2（visual）：只收到 `execMove`（handlerMode=2 空操作，符合 a71c4ea），**再没有 turnblock/orbit2 帧**。
2. `assets:mounts list` 铁证：
   - `1077936201` 挂 `game + visual`；`1077936203` 只挂 `relay`。
   - 而源码 `flow.ts` 的 `visualHost = entity(1077936203n)`，turnblock/orbit2 都发到该实体。
   → 视觉图从来没收到过真正的转动定时器。
3. 这个是“只一个块在动”的第二层真相：visual 图只能收到发到 1077936201 的 `execMove`，
   把它误当 slot=0 转动一次；真正的 9 槽位 turnblock 从未送达。
4. 修复：`assets:mounts detach 1077936201 --graph 1073741832` + `attach 1077936203 --graph 1073741832`，
   `maps:resync`；回读确认 `1077936201=game`、`1077936203=relay+visual`、0 图未挂。
   备份：`…1073741899/.gsts/backups/1073741899.gil.2026-08-24T11-58-0{3,4}*.bak`。
5. 同期还有一项初始化负载拆分（`570ca46`，logicReset 用 `setTimeout(new float(5000))` 延后 5s）：
   它是**独立**的进入负载问题，不是“没反应”的原因；尚未游戏验证，并有“5s 内手速转动时列表未 reset”的
   理论风险，需连同挂载修复一起在游戏里复测后再定论。