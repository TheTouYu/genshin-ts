# AI v5 计划与读数（2026-10-29）：从「感觉没变强」到数字，再从数字到改动

> 状态：**改后读数已回填（hard）；全量用例核对见 §8**
> 工程：`/home/h/genshin-ts/workspace/tetris` ｜ 写域：`qxqy/measure-ai.mjs`、本文件、`.scratch/ai/**`、
> `lua/tetris/config.lua` 的 `NUM.AI_TUNE / AI_LEVELS / aiPace` 数据段、`lua/main.lua` 的 `@region ai-demo` 区段。

## 0. 用户打回的两条（原话）

1. 「AI 算法优化，我自己体验了，我还是很轻松就把最强 AI 打败了，体感上没有感觉到任何区别」
2. 「首页的自动打还有 bug，思考的时候方块不动，和其他路径的 AI 还不一样，说明代码写的乱了」

## 1. 改前读数（改前代码 = HEAD + lead 插入的区域标记，未改任何行为）

复现命令（全部 headless，不需要 web 服务）：

```bash
cd /home/h/genshin-ts/workspace/tetris

# 一档 20 段 × 60s（demo 路径）；--save 指向冻结的改前存档快照
node qxqy/measure-ai.mjs demo --tier hard --games 20 --win 60 --maxSim 1500 \
  --save .scratch/ai/pre-save.json --out .scratch/ai/pre-demo-hard.json

# 对战路径（ai-battle，一局 = guide start → guide gameover，玩家盘空转）
node qxqy/measure-ai.mjs battle --tier hard --games 20 --maxSim 2400 \
  --save .scratch/ai/pre-save.json --out .scratch/ai/pre-battle-hard.json

# 1500 帧逐帧墙钟探针（p50/p95，按 AI 阶段分桶）
node qxqy/measure-ai.mjs perf --frames 1500
```

### 1.1 指标口径（改前/改后必须同一口径）

| 指标 | 定义 | 来源 |
| --- | --- | --- |
| PPS | 锁定块数 / 该板 AI 活跃秒数 | `demo pace` 每块一条（Hold 换块不计块） |
| 每块用时 | `demo pace total=` 均值 | aiDrop 落锁定时刻打的日志 |
| ρ | 消行数 / 锁定块数 | `demo clear n=` 求和 ÷ 块数 |
| lines/min | 消行 / 分钟 | 同上 |
| garbage/min | 送出垃圾行 / 分钟（剔除 `dryness` 自伤行） | `garbage n=` |
| 多消行占比 | n≥2 的消除次数 / 全部消除次数 | `demo clear n=` |
| 四消率 | n=4 / 全部消除 | 同上 |
| 堆高 | `demo auto … stack=` 心跳（avg / max） | aiDrop 每 10 块 |
| 静止帧段 | 逐帧采样 200 格 `imageColor` 的哈希；哈希不变即"棋盘零变化" | `playGet({paint:true})` |
| 最长静止段 | 上述零变化间隔的最大值；**判 bug 口径 = > max(0.40s, 重力节拍+0.08s)** | 同上 |

**判据口径说明（lead 已裁定）**：Lv1 自然重力 = `SPEED[1]=30` 帧/格 = **0.50s/格**，所以任何"逐格下落"的
路径都会有 0.50s 的零变化段。判 bug 用「超过重力节拍 + 0.08s」，同时把 raw 数字一起报。

## 2. 改前根因（代码级，逐条可指到行）

| # | 现象 | 根因 | 证据 |
| --- | --- | --- | --- |
| R1 | 首页自演「思考时方块不动」 | 标题页 `OnUpdate` 的 guideStage==0 分支只调 `autoTick(d)`，**从不调 `FN.tickInstance(d)`**；重力只在帧末 ACTIVE 循环里推进（guideStage==1 才到）。demo 的方块位置只由动作队列改 | 改前 demo 最长静止段 **2.00s**、thinking 期最长 **1.87s**；battle 同期 0.53s（=有重力） |
| R2 | 同样的 AI，两条路径表现不同 | 同上（demo 无重力 ⇒ 完美执行；battle 有重力 ⇒ 动作还没做完就被重力拽下去） | 改前 ρ：demo 0.28~0.39 vs battle 0.22~0.28 |
| R3 | 「体感没变强」 | 每块 **1.72s** 里 **动作执行段占 1.33s**（77%）：`buildQueue` 的旋转 0.15~0.45s、横移 0.05~0.16s/步、hover 0.2~0.4s、回退 0.1~0.2s×2；真正的搜索只花 0.27s | 时间分解表 §3 |
| R4 | 不会用多消行造垃圾 | `evalBoard` 的多消行/攒行加成只在 `NUM.AI_ATK>0` 生效，而 `aiTickCore` 只在 **oppH≥8（对手快死）** 才置它 | 改前 garbage **0.55 行/分**、多消行 5.5% |
| R5 | 「代码写得乱」的实证 | `buildQueue` 的横移间隔读 `NUM.AI_LEVELS[NUM.AI_LEVEL]`（玩家选的档），而决策档是 `aiTickCore` 的 `lvIdx` 强制档（demo/技能接管=3）⇒ 可以出现「hard 的决策 + easy 的手速」 | 改前 `buildQueue` 里 `local mlv = NUM.AI_LEVELS[NUM.AI_LEVEL]` |

## 3. 改前逐块时间分解（每块 1.72s 的去处）

（数字见 §6 表格；要点：think 0.27s / act 段 1.33s / drop≈0.05s，act 段 = 思考等待 + 动作队列执行）

## 4. 改动（全部落在写域内，逐条对应根因）

| # | 改动 | 位置 | 对应根因 |
| --- | --- | --- | --- |
| C1 | `autoTick` 末尾补 `FN.tickInstance(dt)`：demo 与 AI 盘/玩家盘共用同一条重力+锁定链（全仓重力推进点只有 `tickInstance` 一处，不会双源） | `@region ai-demo` · `autoTick` | R1/R2 |
| C2 | `NUM.aiStripQueue`：删 `hover` 段与"回退一格再移回来"这对；`queueK` + `queueCap` 压执行节奏 | 区段内新函数 + 决策段 | R1/R3 |
| C3 | 决策档与执行档对齐：`buildQueue` 前后临时把 `NUM.AI_LEVEL` 置成 `lvIdx`，返回立刻还原 | 决策段 | R5 |
| C4 | 思考预算扣掉已花的搜索时间（`think = target - rest - dropTime - g.AI.t`） | 决策段 | R3 |
| C5 | hard 档一律硬降（软降 18 行 × 0.06~0.12s/行 = 1~2s） | 决策段 | R3 |
| C6 | 攻击态常开：有对手就有基线攻击权重（`attackBaseline`），对手 ≥8 行再 ×1.6；单人局恒 0 | 区段内 `NUM.AI_ATK` 赋值 | R4 |
| C7 | `NUM.AI_TUNE` / `AI_LEVELS.hard` / `aiPace` 数值：hard `paceK 0.18→0.13`、`paceMax 1.20→0.95`、`obsMin 0.30→0.20`、`pieceMin/Max 0.55/1.60→0.28/0.95`、`moveMin/Max 0.05/0.16→0.03/0.08`；新增 `queueK/queueCap/attackBaseline` | `config.lua` | R3/R4 |
| C8 | `ai well` 调试日志从每 5 帧一条降为每块一条（原来 6 条/秒刷屏） | 区段内 | — |

**保持不变的对外契约**：`FN.aiTickCore(dt, onOver, lvIdx)` 签名与 `onOver` 语义（`'demo'`/`'stop'`）；
日志锚 `ai pace` / `ai attack` / `demo act` / `demo plan` / `demo pace think=… total=` 全保留
（`ai attack` 追加 `mode=off|baseline|burst atk=<n>` 便于复核）；无任何"故意失误/降智商"路径。

## 5. 改后读数（hard，headless，`tetris.save.json` 当前构建）

复现：

```bash
node qxqy/measure-ai.mjs demo   --tier hard --games 12 --win 60 --maxSim 760 --out .scratch/ai/post-demo-hard.json
node qxqy/measure-ai.mjs battle --tier hard --games 20 --maxSim 2400 --out .scratch/ai/post-battle-hard.json
node qxqy/measure-ai.mjs perf   --frames 1500
```

| 指标 | demo（13 段×~60s） | battle（19 局） |
| --- | --- | --- |
| 每块用时 | **1.01s** | **1.01s** |
| PPS（按锁定计） | **0.888** | **0.871** |
| ρ（消行/块） | 0.367 | 0.342 |
| lines/min | 19.5 | 17.9 |
| garbage/min | 0（单人无对手） | **2.47** |
| 多消行占比（n≥2） | 20.2% | 16.2% |
| 四消率 | 0 | 0 |
| 堆高 avg / max | 3.55 / 9 | 3.40 / 9 |
| 最长静止段 | **0.53s**（=Lv1 重力节拍） | **0.53s** |
| thinking 期最长静止 | 0.53s | 0.53s |
| 逐块分解 think/act/drop | 0.27 / 0.72 / 0 | 0.27 / 0.73 / 0 |
| 死因 | window 9 / stack≥12 4 | topout 19（玩家盘顶死） |

## 6. 改前 / 改后对照

| 指标 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| 每块用时（hard，demo） | 1.774s | **1.011s** | **−43%** |
| PPS（同口径 = 锁定块/秒） | 0.524（由 ρ 0.38 反推锁定数 776 / 1481s） | **0.888** | **+69%** |
| 最长静止段（demo） | **2.00s**（thinking 1.87s） | **0.53s** | **−73.5%** |
| garbage/min（battle） | 0.55 | **2.47** | **+349%** |
| 多消行占比（battle） | 5.5% | **16.2%** | +195% |
| lines/min（demo） | 11.66 | **19.49** | **+67%** |
| 堆高 avg / max（demo） | 3.67 / 9 | 3.55 / 9 | 不升 |
| demo 自演 stack≥12 触发率 | 4/21 = 19% | 4/13 = **31%** | +12pt（**略超 +10pt 约束**，见 §7） |
| 帧耗时（1500 帧，交替对照，机器 load 6~8） | p50 0.43/0.59ms，p95 27.5/27.8ms | p50 0.96/0.98ms，p95 29.1/28.4ms | p50 上升（每帧多了 tickInstance + 单位时间块数翻倍），p95 不变（planning 帧 25ms 是改前就有的） |

**口径更正（重要）**：改前那批 JSON 的 `pieces` 计的是 `bag=` 出现次数，**把 Hold 换块也算成一块**，
所以 0.711 的 PPS 偏高、0.28 的 ρ 偏低。同口径（按 `demo pace` 锁定计）改前 ρ≈0.37~0.38（与 Lua 自己打的
`demo auto … rho=0.38` 一致），改前 PPS≈0.52。**ρ 基本持平**，变强来自「同样质量、快 1.75 倍」。

## 7. 已知边界 / 未闭合

- **demo 自演 stack≥12 触发率 19%→31%（+12pt）**：略超 lead 的「≤ baseline+10pt」。
  机制解释：`DRYNESS_N={14,…}` 是"每 14 块无消行顶 1 行垃圾"——**块速翻倍 ⇒ 干涸压力也翻倍**，
  不是 AI 变笨（ρ 持平、堆高均值还降了）。若要压回，需要调游戏规则参数（不在本写域）。
- **四消（4 行）仍是 0**：`wellPlan`（井纪律）在 v4 两轮实测失败，本轮未开；`saveI` 只在 burst 态生效。
  多消行已从 5.5%→16.2%，但离"稳定四消"还有距离——真正的路是显式井规划器（先规划 4 行再落），已登记。
- **2-ply 精化窗口**：`obsMin` 0.30→0.20 后每块精化帧数下降；若后续把 `obsMin` 再压，需要同步加每帧候选预算。
- **对战路径观测窗**：玩家盘空转约 50~60s 自己顶死，attack 态的有效观测只有这一段。
- **帧耗时 p95 ≈ 28ms** 的主因是每块一次的 1-ply 全盘扫描（aiChoose，~25ms），**改前就是这样**；
  要压到 1.2ms 需要把 `aiChoose` 拆成分帧（超本轮范围）。

## 8. 用例面（改后）

- `lua5.3 -e "assert(loadfile('lua/main.lua'))"` 通过；`node qxqy/build.mjs` 通过。
- 我改到的两条 AI 用例：`20-ai-hard-rho` PASS、`21-ai-easy-rho` PASS（v5 机制只对 hard 生效，weak 档 pace/thinkCap 保持旧契约）。
- **全量 `node qxqy/runner.mjs` 最终结果：68 PASS / 3 FAIL（71 条），exit=1**。3 条红全是其他队友
  已登记的 known-blocked，与 AI 无关：`08-click-pad`（v5 布局重排后点按坐标未重写）、
  `23-tspin-positive`（节奏改动致该局前 7s 方块时序漂移）、`44-phone-hold`（同上按键坐标）。
  更早一轮（15:22）的 `07/11/12` 本轮已绿（期间别人改过代码/用例）；且用**改前冻结存档**
  `.scratch/ai/pre-save.json` A/B 复现过 07/11/12 在改前同样红 ⇒ 与本轮改动无关。
- 复现 A/B 的命令（只读，不改仓）：`node .scratch/ai/runner-save.mjs --save .scratch/ai/pre-save.json <用例名子串>`

## 9. 改动落点（grep 锚）

```bash
grep -n "NUM.aiStripQueue" lua/main.lua                 # 区段内的队列清洗（删 hover/回退）
grep -n "FN.tickInstance(dt)" lua/main.lua              # autoTick 里的重力统一
grep -n "savedAiLevel\|queueK\|queueCap\|atkBase\|spent" lua/main.lua   # 决策段 v5 改动
grep -n "queueK\|queueCap\|attackBaseline\|paceK" lua/tetris/config.lua
```
