# AI 能力重构 v4.0（2026-10-29）：读数、机制与已知边界

> 状态：**当前实现**（模拟器实测，命令与数值可复现）
> 用户原话（2026-10-29 第 4 点）：「最强 ai 的水平，还可以，但是随着速度的上升，它没有去给自己减少对应的
> 操作间隔，另外就是，和 ai 对抗的过程中，发现 ai 不太会使用暂存来提高水平，同时也不太会利用多消行……
> 体验最差的地方是，玩家可以用的 ai，太蠢了，而且还有明显的，故意制造错误来达到降智商，这个更蠢。」

## 1. 四条诉求 → 四条改动（逐条可判）

| 用户诉求 | 改动 | 判据（命令/日志锚） |
| --- | --- | --- |
| **不装傻**（删掉故意制造错误） | `AI_LEVELS[*].pMistake = 0`、`nudgePct = 0`；**删掉整个失误注入代码块**（不是关开关，是删代码）；easy 档的"弱"改成**简化评估** `BW_SIMPLE`（只看高度/消行/洞 ⇒ 想得少、错得自然） | 启动锚 `ai tune pMistake=0,0,0 hold=1,1,1 simple=true`；用例 50 |
| **随速度收紧操作间隔** | 新增纯函数 `NUM.aiPace(tier, level)`：`natural = SPEED[level]/60 × 20`，`target = clamp(natural × paceK, paceMin, paceMax)`；`aiTickCore` 用它算 `target/obsMin/pieceMin/pieceMax`（旧实现是档位常数 1.0~2.2s） | `lua5.3 tests-lua/ai_pace_test.lua`（26 断言，含"随等级单调不增"）；日志 `ai pace tier=… lv=… pace=…` |
| **会用暂存** | `hold` 全档开启；阈值按档位（`AI_TUNE.holdMargin`）；新增两条**留 I 块**规则（`why=saveI` / `why=fireI`） | 日志 `ai hold why=better/saveI/fireI`；实测 hard 自演 **hold 使用率 31%**（44 次/140 块） |
| **会用多消行造垃圾** | 对抗**进攻态**（对手最高列 ≥ `attackHeight=8`）才启用：① 多消行加成 `AI_ATK × n²` ② **攒行加成**（9/10 格满的行当资产，`AI_ATK × 0.9 × 近满行数`）③ 井纪律（默认关，见 §4） | 日志 `ai attack=true oppH=…`；实测 ai-battle 100s：`attack=true oppH=9`、AI 消 2 行 2 次、**向玩家送垃圾 2 行** |

## 2. 三档实测（`node qxqy/measure-ai.mjs 240`，固定种子自演）

| 档位 | 每块用时 | 每块目标 pace | ρ（消行率） | hold 使用率 | 多消行占比（n≥2） |
| --- | --- | --- | --- | --- | --- |
| easy | 2.50s | 2.60 | **0.14** | 2% | 8% |
| normal | 2.21s | 2.00 | 0.39 | 31% | 5% |
| hard | **1.55s** | **1.20** | **0.39** | **31%** | **14%** |

节奏曲线（`NUM.aiPace(3, level)`，单位秒/块）：
`Lv1 1.20 → Lv5 1.08 → Lv7 0.84 → Lv9 0.60 → Lv12 0.42`（满级比 1 级收紧 **65%**）。

## 3. 三条设计原则（写进 config 注释，改数值前先读）

1. **决策要纯、执行才拟人**：`pMistake/nudgePct` 全 0；"像人"只体现在 `buildQueue` 的观察/横移/软降节奏上。
2. **弱档弱在"想得少"，不弱在"故意错"**：easy = `BW_SIMPLE` 简化评估 + 更慢的每块用时；玩家看到的仍然是"它尽力了"。
3. **进攻是模式相关的**：单人对局没有对手 ⇒ 攒井/多消行权重自动归零，保持干净盘面（ρ 不损失）。

## 4. 已知边界（诚实登记，不要当已解决）

- **四消（tetris）没有打出来**。根因两条，都有实测依据：
  1. **1-ply 评估看不到"攒 4 行再放 I"的收益**：BCTS 的井惩罚 `CW=-10.49` 让 4 深井值 -105 分，任何留井奖励都抵不过。
  2. **I 块竖放只能落在第 2..10 列**（`SHAPES.I.cells` 占"盒内第 2 列"，`x∈[1,COLS-1]`）⇒ **左墙第 1 列永远填不到**。第一版把井选在左墙，等不到四消（实测 `ai well col=10 base=2 depth=0` 一路不动）。
  已实现但**默认关闭**：井纪律（`AI_TUNE.wellPlan=false`）— 实测硬约束只会让 AI 把块堆到别处、ρ 下降而四消仍打不出来。
  正确下一步：**2-ply**（`AI_LEVELS[*].ply=2` 的分帧精化通路已在代码里，`refineSearch`）或显式"井规划器"（先规划 4 行再落）。
- **进攻窗口受对手存活时间限制**：ai-battle 里玩家盘不管就是 100s 内顶死（进 MODE_OVER 冻结两盘），
  所以 attack 模式的有效观测窗只有 ~50s（≈35 块）。要测"长期进攻效率"需要真人陪打或脚本代打玩家盘。
- **normal 档 ρ 与 hard 相同（0.39）**：normal 只是"慢一档"（2.21s vs 1.55s），评估函数与 hard 同源。
  若用户希望三档强度真正拉开，可选：normal 也改简化评估，或 normal 只在 1-ply 候选中取 top-3 平均（会引入质量损失，需先问）。

## 5. 复现命令

```bash
cd /home/h/genshin-ts/workspace/tetris
lua5.3 tests-lua/ai_pace_test.lua     # 26 断言（节奏纯函数）
lua5.3 tests-lua/skills_test.lua      # 111 断言（角色技能纯逻辑）
node qxqy/build.mjs && node qxqy/runner.mjs   # 55 条行为用例
node qxqy/measure-ai.mjs 240          # 三档读数（本文件 §2 的表）
node qxqy/audit-controls.mjs          # 全控件巡检
```
