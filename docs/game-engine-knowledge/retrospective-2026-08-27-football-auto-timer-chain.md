# 完整复盘：足球 auto_check 定时器链路全调查——单位错误 + 时序误判（2026-08-27）

> 状态标签：**当前实现**（ada095c 已注入，待用户游戏验证 auto kick 触发）
> 范围：9a86262..ada095c（运动器传导链收尾 → 预测补偿 → 自动触发定时器链路）
> 证据：日志 21-46-46（push_lock 63/__gsts_timeout 3/auto_check 0）、22-05-27（time 3 setTimeout 回调启动 auto_check 但 200s 未到点）、读图 explain/trace/read 三轮
> 领域：节点图/定时器/事件挂载

## 一、错误谱系总览（本轮 7 连错）

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 08-27 | 算法层 | 球静止时 auto 补踢挂 physRollTick 内，静止（FREE）无滚滑 tick → 永不触发 | autoCheckTick 独立定时器 | fa1af6e |
| 2 | 08-27 | 时序误判 | 断言"whenEntityIsCreated 对静态实体不触发"——日志 21-46 从 time13 开始才看不到 | 日志 rec0（time0）铁证：实际触发了 | — |
| 3 | 08-27 | **甩锅引擎** | 断言"loop=true 循环定时器不触发 whenTimerIsTriggered"——其实只看 KICK_PRED/OUT2 漏看 autoCheckTick 39 次 | 用户纠正：定时器能触发 | — |
| 4 | 08-27 | 结构 | 4fef286 push_lock 触发也调 autoCheckTick（双分支结构歧义） | 888df04 重写结构（trace 核验） | 888df04 |
| 5 | 08-27 | 时序假设 | whenEntityIsCreated 里直接 startTimer 注册丢失 → setTimeout 3s 延迟启动 | 用户经验"实体创建太早，等几秒" | 888df04 |
| 6 | 08-27 | **单位错误（真根因）** | `f.startTimer(e,'auto_check',false,[200])`——**f.startTimer 延迟单位是秒**，[200]=200 秒，日志仅 57s 从未到点 | `[0.2]` 秒 | ada095c |
| 7 | 08-27 | 流程 | build 并发：prebuild 先清 dist，多人编译互相清 | 编译到 dist.tmp 成功后再原子替换 | 888df04 |

## 二、最近一次错误的完整调查链（现象→差分→根因→修复→验证）

**现象**：auto_check 定时器从未触发 whenTimerIsTriggered(auto_check)，auto kick 完全失效。

**调查链（用户三次纠偏）**：
1. 我先断言"loop=true 循环定时器不触发"（甩锅引擎）→ **用户纠正**："定时器能触发，检查参数"
2. 我断言"whenEntityIsCreated 静态实体不触发" → 日志 rec0 铁证：time0 触发了（set autoTimerOn + startTimer 执行）
3. 用户提示"实体创建太早，等几秒再做" → setTimeout 3s 延迟启动
4. setTimeout 回调（time3）确实启动 startTimer(auto_check)——但 auto_check 仍 0 次

**决定性差分**（对比三类定时器）：

| 定时器 | 延迟（日志 IN3） | 单位 | 触发 |
|---|---|---|---|
| push_lock（dribble） | 0.25 | 秒 | 63 次 ✓ |
| __gsts_timeout（game setTimeout） | 3.0 | 秒 | 3 次 ✓ |
| auto_check（game f.startTimer） | **200.0** | **秒** | **0 次** ✗ |

**根因**：`f.startTimer` 的延迟参数单位是**秒**，我传 `[200]` 以为是 200ms → 实际 200 秒。日志 57 秒，定时器从未到点。

**为什么漏看**：`LOCK_MS = 0.25`（注释写了"秒"），push_lock 一直用秒。setTimeout 的 DSL 内部做毫秒转秒（`f.division(delayObj, 1000)`）。我写 `f.startTimer(..., [200])` 时**没意识到单位是秒**，且没和 push_lock 的 [0.25] 做参数对比。

**修复**：`[200]` → `[0.2]`（秒）。

**验证**：读图 explain 确认 n=8/38/46/52 全部 auto_check 0.2s；待用户游戏验证。

## 三、系统性根因（为什么反复出问题）

1. **验证链只看"结果埋点"不看"链路帧"**：KICK_PRED 只在 kick=true 记录，autoCheckTick 39 次被漏看 → 误判"定时器没触发"。正确做法：每次检查都埋点 + 直接数复合调用次数（auto_check_tick = 定时器确实在跑的铁证）。

2. **单位/常量的"经验盲区"**：f.startTimer 单位是秒、setTimeout 单位是毫秒——两个 API 单位不同，写新调用时没对照已验证的同族调用（push_lock 的 [0.25]）。**复用同族 API 时必须对照已验证参数**。

3. **一上来就甩锅引擎/找借口**：两次断言"引擎不支持/事件不触发"，被用户纠偏。**引擎稳定，问题在自己**——先核对参数、实体、时序，再怀疑引擎。

## 四、流程与方法论教训

- **用户是雷达**：三次纠偏（定时器能触发/检查实体参数/等几秒）直接指向根因。每次"确定不行"之前，先回答"为什么 push_lock 行、它不行"。
- **铁证优先**：日志 rec0（time0）证明 whenEntityIsCreated 触发了；IN3 值对比（0.25 vs 200.0 vs 3.0）直接暴露单位错误。不要凭"应该怎样"推断。
- **技能驱动**：用 gil-node-graph-reading 的 explain/trace/read 读图，确认结构/实体/参数，比瞎猜强。
- **绕路教训**：我花了 4 轮（甩锅 loop → 甩锅静态实体 → setTimeout 延迟）才到单位问题。如果一开始就对比 push_lock 和 auto_check 的 IN3 延迟值，1 轮就能定位。

## 五、风险探索与未闭合项

- [ ] ada095c 用户游戏验证：auto kick 是否真正触发（0.2s 定时器）
- [ ] whenEntityIsCreated 里直接 startTimer 注册是否真的丢失（setTimeout 延迟是规避还是必要）——未做对照实验确认
- [ ] 4fef286 push_lock 触发也调 autoCheckTick 的结构问题——888df04 已重写，未深挖为什么
- [ ] 命中检测路线（onSignal 禁用中）后续是否恢复
- [ ] build 并发方案：dist.tmp 固定名，两人同时编译仍冲突（用户接受"仔细使用"）

## 六、产出清单

- 修复：autoCheckTick 独立定时器（fa1af6e）→ 结构重写（888df04）→ 单位修复（ada095c）
- 修复：build 编译完再清（888df04）
- 埋点：KICK_PRED/KICK_NOW 每次检查记录（数据驱动调优）
- 预测补偿：pushAutoCheck 前瞻 LAG_T=0.2 + KICK_DIST=3.0（76d5ef8/b7bad89）
- 待落盘：dsl-nodegraph-development 技能加"f.startTimer 单位秒"纪律；PKC
