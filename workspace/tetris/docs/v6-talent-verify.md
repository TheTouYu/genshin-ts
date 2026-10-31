# v6 天赋核验报告 · 20 条逐条实测（headless）

> 状态：**第二轮已完成**（2026-10-29，含 lead 的 P0 两条修复后复跑）
> 对象：`workspace/tetris` v6 天赋（设计书 `docs/v6-talent-design.md`，实现 `lua/tetris/skills.lua`，接线 `lua/main.lua`）
> 结论：**20 条中 16 PASS / 4 FAIL**（上一轮 12/8）。
> 本轮新增 **5 条转 PASS**（`nahida.seed`、`keqing.stacks`、`ganyu.lotus`、`ganyu.charge`、`columbina.law`），
> 同时出现 **1 条回归**（`keqing.active` 由 PASS 变 FAIL，根因是 lead 新接的 `g.pieceAge` 被当成「按住时长」喂给长按判定）。
> 本文只写 `.scratch/talent-verify/**` 里跑出来的事实；未改 `lua/**`、`tests/**`、`qxqy/**`。

---

## 0. 摘要

| 项目 | 数字 |
| --- | --- |
| 核验条数 | 20（4 角色 × [1 主动 + 4 天赋]） |
| PASS | **16** |
| FAIL | **4** |
| FAIL 根因 ①实现没写锚 | 1（`ganyu.field`：既无 `field=1` 注记，`params.gravityMult` 也无消费方） |
| FAIL 根因 ②main 没接线 | 2（`keqing.active`、`keqing.longpress`：同一处 `holdSec` 通道错位 + 缺 `blink-best` 分支） |
| FAIL 根因 ③条件造不出来 | 0（全部条件都成功造出） |
| FAIL 根因 ④设计不可测（数值互斥） | 1（`columbina.lure`：`lure=3` 数学上不可达） |

### 0.1 本轮变化（对照上一轮 12/8）

| 天赋 | 上一轮 | 现在 | 变化原因 |
| --- | --- | --- | --- |
| `nahida.seed` | FAIL | **PASS** | `dispatchEffect` 现在打印 `ev.anchor` ⇒ `talent nahida-seed clear n=1` 出现 |
| `ganyu.lotus` | FAIL | **PASS** | 同上 ⇒ `talent ganyu-lotus early n=2` 与 `talent lotus bloom n=3` 都出现 |
| `columbina.law` | FAIL | **PASS** | 同上 ⇒ `talent columbina-law proc n=1` 出现 |
| `keqing.stacks` | FAIL | **PASS** | `onLock` 补齐 `moved/rotated/hard/dwell` ⇒ `stk=4 got=move+rot+hard` |
| `ganyu.charge` | FAIL | **PASS** | 同上（`dwell` 到位）⇒ `charge=2`，且施放冻结行数 3→5 |
| `keqing.mark` | PASS（并列锚） | **PASS（正式锚）** | 现在抓到 §6.6 的 `talent keqing-slash col=1 n=2` |
| `keqing.active` | PASS | **FAIL（回归）** | 新接的 `g.pieceAge` 被当成「按住 Z 的时长」⇒ 只要当前块活过约 0.18s 真时间，任何 Z 都被判成长按，cast 返回 `blink-best`，而 main 没有该分支 ⇒ 按 Z 既没瞬落也没别的效果 |

---

## 1. 判定口径

- **PASS** = 设计书 §6.6 的指定锚（或 `M.TALENTS.verify` 明确并列接受的替代锚）**真的出现在日志里**，且关键数值与设计一致。
- **FAIL** = 指定锚没出现（无论行为有没有发生），并在「若 FAIL」列写清缺什么、行为是否已由别的行证明。
- 倍率类（`mult=`）按**相加口径**核算：`mult = 1 + Σ各天赋加成`，所以同一行可能同时含 `yuheng=1`（+0.15）与 `stk=N`（+0.06N），判据用「按行内 stk 反算是否吻合」而不是死盯 `mult=1.150`。
- 概率类（`seed=2`、`law=1`）按「设计值发生/不发生」判定，不做统计显著性检验（见 §8）。

---

## 2. 环境与方法

- **不用浏览器**：headless studio 直接跑真游戏（`/home/h/miliastra-beyond-simulator/studio/index.js`），读当前 `tetris.save.json`。
- 驱动：`playStart({canvasId:'pc-16-9'})` → 逐帧 `playStep(1/30,{observe:false})` → `playKey(name,{observe:false})` → 一次性读 `playGet().logs[]`（`rt.logs` 全会话累积）。
- 观测通道：Lua `print` → studio `rt.logs[].text`（与真机 `.gia` 同一批 print 点，但真机帧值未取，见 §8）。
- 造条件手法（实测有效）：
  - `Key1`=休闲 / `Key2`=AI 对抗（双盘，`MODE='ai-battle'`）；非 casual 进局先按任意键过键位页，再等 3-2-1。
  - `Key30`=调试解锁全角色（party 铺 4 人）；`Key13`=Y 换台前（读 `skill switch ok=true … role=` 确认）。
  - `Key12`=Z（**刻晴在 Up 施放**，其余角色在 Down）。
  - 消行：`KeyboardCharacterSkill4KeyDown`（T 填满最底两行）→ `KeyboardJumpKeyDown`（空格硬降）→ `doLock → clearLines`，稳定每次 2 行。
  - 持续类：`playStep` 推进秒数（冰莲 6s、月之领域 20s、纳西妲 CD 25s、少女 CD 17s）。
- ⚠ **Casual 的 AI 接管陷阱（本轮踩到，复跑必读）**：casual 里「停手 5s → 提示 2s → AI 接管」（`NUM.TK_PLAY_S/TK_HINT_S`，`main.lua:6850` 起）。AI 代打会**立刻硬降**，于是「让方块自然下落」这类造条件全部失效（实测：不按键时每块 `下落0格`、`dwell≈0`，蓄力永远记不上）。解法：**每 0.4s 按一次方向键保持玩家控制权**（方向键走 `act()` → `playerTouched()`），再让重力慢慢把方块落到锁定 —— 本报告的 `ganyu.charge` 就是这么造出来的。
- 探针（每角色一支，共享 `harness.mjs`）：`.scratch/talent-verify/{nahida,keqing,ganyu,columbina}.mjs`；产出 `<role>.log.txt`（关键行 + 判定）、`<role>.raw.log.txt`（完整日志）、`<role>.report.txt`（stdout）。
- 复跑（cwd = `/home/h/genshin-ts/workspace/tetris`）：

```bash
flock /tmp/tetris-build.lock -c 'node qxqy/build.mjs'   # 刷新存档（唯一写命令）
node .scratch/talent-verify/nahida.mjs                  # 4 支探针彼此独立
node .scratch/talent-verify/keqing.mjs
node .scratch/talent-verify/ganyu.mjs
node .scratch/talent-verify/columbina.mjs
```

实测退出码：`build=0`、`nahida=0`、`keqing=0`、`ganyu=0`、`columbina=0`。
随机数用 skills.lua 的确定性 LCG（`RNG_SEED=20261029`）⇒ 同存档同脚本结果可复现。
**已实测确定性**：`keqing.mjs` 连跑两遍，`判定:`+`抓到:` 行逐字相同（`diff` 空）；其余三支本轮各复跑 ≥2 次判定稳定。

---

## 3. 20 行矩阵（本轮）

| # | 角色 | 天赋 | 触发条件（实际怎么造） | 期望日志锚 | 实际抓到的那行日志 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 纳西妲 | 所闻遍计·智慧代打（主动） | casual → Key30 解锁 → 按 Z | `skill ai start tier=… dur=…` | `skill ai start tier=1 lvidx=2 dur=6.5 mode=casual` | **PASS** |
| 2 | 纳西妲 | 蕴种印 | Z 后 25s 内消行；2.35s 间隔 vs 0.8s 间隔对照 | `talent nahida-seed clear n=1` | `talent nahida-seed clear n=1` | **PASS** |
| 3 | 纳西妲 | 慧明缘觉智论 | 连消到精通 632→1000，再按 2.55s 间隔反复消行等暴击 | `talent onClear … mastery=… dmg=… seed=2 chain=2` | `talent onClear role=nahida n=2 mult=1.000 seed=2 chain=3 mastery=1096 dmg=0.800` | **PASS** |
| 4 | 纳西妲 | 摩耶之殿 | Z 后 15s 内消行；再等 12.6s 越界复核 | `talent onClear … mult=1.149 domain=1` | `talent onClear role=nahida n=2 mult=1.149 domain=1 seed=1 chain=1 mastery=216 dmg=0.016` | **PASS** |
| 5 | 纳西妲 | 净善摄受明论 | 精通 632（lv=5）时再按 Z | `skill ai start … dur=…` > 基础 | `skill ai start tier=4 lvidx=3 dur=7.74 mode=casual` | **PASS** |
| 6 | 刻晴 | 星斗归位·瞬落（主动） | Y 切刻晴 → 按下 0.12s 后松 Z | `skill blink col=… rows=…` | （未抓到）cast 实为 `skill cast slot=1 role=keqing ok=true effect=blink-best why=nil n=0.2` | **FAIL** |
| 7 | 刻晴 | 雷楔·二段 | 雷楔 5s 内再按 Z（免费引爆）；另一路：雷楔期内先消行 | `talent keqing-slash col=… n=2` / `skill mark-blink` | `talent keqing-slash col=1 n=2`（另有 `skill mark_blink n=2`） | **PASS** |
| 8 | 刻晴 | 长按·跨地形 | A：0.12s 短按落在新块上；B：0.12s 短按落在活了 2.5s 的块上；C：真按住 1.30s | `skill blink-best target=…` | （未抓到）C 的 cast 是 `effect=blink`，main 兜底行为 `skill effect todo=blink-best` | **FAIL** |
| 9 | 刻晴 | 玉衡之贵 | Z 后立刻消行（8s 窗口内） | `talent onClear … mult=1.150 yuheng=1` | `talent onClear role=keqing n=2 mult=1.210 yuheng=1 stk=1 slash=1` | **PASS** |
| 10 | 刻晴 | 金紫定垂·四叠 | 静置 8.6s 清层 → ①硬降 ②移动+旋转+硬降 ③消行后锁一块 ④消行后「移动+旋转+硬降」 | `talent onLock … stk=N`（应到 4） | `talent onLock role=keqing stk=4 charge=0 got=move+rot+hard` | **PASS** |
| 11 | 甘雨 | 降众天华·冰封（主动） | Y×2 切甘雨 → Z | `skill freeze rows=… sec=…` | `skill freeze rows=3 sec=3.0` | **PASS** |
| 12 | 甘雨 | 冰莲 | Z 后冻结期内消行（提前打掉）；另一路 6s 不消行（自然绽放） | `talent ganyu-lotus early n=2` / `talent lotus bloom n=3` | `talent ganyu-lotus early n=2`；自然绽放 `talent lotus bloom n=3` | **PASS** |
| 13 | 甘雨 | 唯此一心 | 静置 5.5s → 消行#1 → 5s 内消行#2 | `talent onClear … mult=1.200 focus=1` | `talent onClear role=ganyu n=2 mult=1.200 focus=1` | **PASS** |
| 14 | 甘雨 | 天地交泰 | Z 后冻结期 3s 内消行 | `talent onClear … field=1` | （未抓到）同一行只有 `… mult=1.000 lotus=early` | **FAIL** |
| 15 | 甘雨 | 霜华矢·二段蓄力 | 每 0.4s 按一次「左」保控制权，两块各靠重力自然落底（dwell 数秒、不硬降）→ 再按 Z | `talent onLock … charge=2` | `talent onLock role=ganyu stk=0 charge=2 got=charge=2`（施放后 `skill freeze rows=5 sec=3.05`） | **PASS** |
| 16 | 少女 | 引力涟漪·潮汐（主动） | ai-battle 进局 → 解锁 → Y×3 切少女 → 等能量 60 → Z | `skill ripple push n=…` | `skill ripple push n=2 to=opp` | **PASS** |
| 17 | 少女 | 引力值 | 连消攒到 60（领域内每次 +11.3）→ 再按 Z | `talent onClear … gravity=…` + cast 的 n 放大 | `talent onClear role=columbina n=2 mult=1.000 gravity=60.0`；施放 `n=1→rows=1`（普通）/ `n=2→rows=2`（满辉） | **PASS** |
| 18 | 少女 | 月诱 | 连做 3 次满辉（每次攒满 60 + 等 17s CD），每次后消行读层数；第 3 次后静置 11s 复核 | `talent onClear … lure=3 mult=1.150` | `talent onClear role=columbina n=2 mult=1.050 lure=1 gravity=11.3 law=1`（三次满辉后都只有 1 层） | **FAIL** |
| 19 | 少女 | 新月自己的法则 | casual 按 Z 开领域（20s）→ 领域内连消等 33% | `talent columbina-law proc n=1` | `talent columbina-law proc n=1` | **PASS** |
| 20 | 少女 | 她的乡愁·月之领域 | 先消一次拿基线（无领域）→ Z 开领域 → 同样消 2 行 | `talent onClear … gravity=…`（×1.13） | `talent onClear role=columbina n=2 mult=1.000 gravity=21.3 law=1` | **PASS** |

---

## 4. 逐条证据（只列本轮仍需要解释的数值）

### 4.1 纳西妲（5/5）

- 主动：`dur=6.5` = 基础 6 + 精通 200 的加时 0.5（`p.aiDur + nahidaAbsorb`，skills.lua:657）。
- 印：`talent nahida-seed clear n=1` 落在 2.35s 间隔那次；0.8s 间隔那次**没有** `seed=`（间隔生效）。
- 精通：`mastery=216 dmg=0.016` → `632/0.432` → `1000/0.800`；连锁 `dmg=0.448→chain=2`、`dmg=0.800→chain=3`；抓到 `seed=2`（追加一段）。
- 摩耶之殿：`mult=1.149 domain=1`；距施放 ~16s（>15s）后同一操作回到 `mult=1.000`。
- 摄受明论：`lv=5` 时 `dur=7.74` = 6+0.04×4 + 1.58（632×0.25×0.01）；精通≥1000 时 `dur=8.7`（加时到上限 2.5）。

### 4.2 刻晴（3/5）

- 雷楔：`talent keqing-slash col=1 n=2` + `talent fx kind=clear-col n=2`；引爆路 `skill mark_blink n=2`。
- 玉衡：`mult=1.210` = 1 + 0.15（玉衡）+ 0.06×stk1 ⇒ +15% 在账上。
- 四叠：`stk=1 got=hard`（单硬降）→ `stk=3 got=move+rot+hard`（移动+旋转+硬降）→ `stk=4 got=hard`（消行后）→ 合体 `stk=4 got=move+rot+hard`。
- **主动（回归）**：`effect=blink-best`（见 §5②），main 落 `skill effect todo=blink-best`，方块不动。
- **长按**：A（0.12s 短按 + 新块）= `blink-best`；C（真按住 1.30s）= `blink` —— 按键时长完全没参与判定。

### 4.3 甘雨（4/5）

- 冰莲：提前 `talent ganyu-lotus early n=2` + `talent fx kind=clear-top n=2`；自然绽放 `talent lotus bloom n=3`（前一行 `skill freeze end`，证明是 6s 到点）。
- 蓄力：`charge=2 got=charge=2`，施放后 `skill freeze rows=5 sec=3.05`（3 基础 + 2 段）＝ 端到端闭环。
- 天地交泰：冻结期内消行整行无 `field=`；且 `grep -rn gravityMult lua/main.lua` = **0 命中**。

### 4.4 少女（4/5）

- 主动（ai-battle）：能量 `energy=60.4` → `skill ripple push n=2 to=opp`。
- 引力值：`gravity=60.0` 后满辉把清底 `rows=1→2`。
- 领域：基线 `gravity=10.0` → 领域内 `gravity=21.3`（本次 +11.3 = 10×1.13）。
- 法则：`talent columbina-law proc n=1`（对应 onClear 的 `law=1` 注记）。
- 月诱：三次满辉（每次都有 `skill clear_bottom rows=2` 自证）后层数恒 `lure=1`；静置 11s 后 `mult=1.000`（层数清零）。

---

## 5. 失败根因分类（4 条 FAIL）

### ① 实现没写锚 — 1 条：`ganyu.field` 天地交泰

| 事实 | 位置 |
| --- | --- |
| onClear 甘雨分支只有 `focus=1` / `lotus=early`，没有 `field=1` | `lua/tetris/skills.lua:1134-1148` |
| verify 字符串却写了 `talent onClear … field=1`（实现不存在的锚） | `lua/tetris/skills.lua:1299` |
| `params.gravityMult=1.2` 只在 skills 内部算出，**main 全仓 0 处读它**；重力推进只按 `NUM.SPEED[g.level]` | `lua/tetris/skills.lua:827`、`lua/main.lua:6697` |

→ 这条天赋目前**只算不生效**：只在角色页字符串里显示「冻结期重力 ×1.20」，实际下落速度不变。
修法：① skills.lua 甘雨分支 `freezeT>0` 时 `notes[]='field=1'`；② main.lua:6697 的 `perTicks` 乘 `SKILLS.params(SK,'ganyu').gravityMult`。

### ② main 没接线 — 2 条：`keqing.active` + `keqing.longpress`（同一处断点）

**期望 vs 实际（skills.lua 期望的字段名，供对齐用）**

| skills.lua 位置 | 期望的 ctx/info 字段 | 实际喂进去的值 | 判定 |
| --- | --- | --- | --- |
| `skills.lua:594-597` → `:670` `longPress = holdSec >= 0.35` | `ctx.holdSec` = **按住 Z 的秒数** | main.lua:4144 `holdSec = tonumber(g.pieceAge)` = **棋子存活秒数** | ❌ 语义错位 |
| `skills.lua:597`（同段） | 另有 `ctx.keyHold`（main.lua:4153 已经传了 `FN.skillKeyHoldSec`） | skills 从不读 `keyHold` | ❌ 传了没人读 |
| `skills.lua:1022-1048` onLock 读 `moved/rotated/hard/cleared/dwell` | 名字与 main 一致 ✅ | main 传 `moved/rotated/hard/flipped/dwell`（`cleared` 没传，但 `stkC` 由 `skills.lua:1122` 在 onClear 补记，四叠仍可达 4） | ✅ 已对齐 |

**另一个单位 bug**：`g.pieceAge` 每 STEP（`CFG.STEP=1/60`）加 `1/30`，而 `g.acc` 每帧加 `1/30` ⇒ 每帧跑 2 步、`pieceAge` 按**真实时间的 2 倍**累计。
实测证据：新块出生后 0.2s + 0.12s 按键（真实 0.32s）就被判成长按（阈值 0.35s）。
修法：`main.lua:6699` 的 `+ 1/30` 改成 `+ STEP`。

**后果**：只要当前块活过约 0.18s 真时间，任何一次 Z 都被判成「长按」→ `effect=blink-best` → main 没有该分支（`main.lua:4183` 只处理 `blink`，`blink-best` 落到 `:4235` 的 `skill effect todo=`）⇒ **刻晴按 Z 完全没效果**（既没瞬落，也没跨地形），`skill blink col=… rows=…` 与 `skill blink-best target=…` 两条锚都不可能出现。

修法（两处，缺一不可）：
1. `skills.lua:670` 改成读 `numOr(ctx.keyHold, numOr(ctx.holdSec, 0))`（main 已传 `keyHold`），或 main 把 `FN.skillKeyHoldSec` 作为 `holdSec` 传入；
2. `main.lua:4183` 之后加一个 `elseif eff == 'blink-best'` 分支：把方块移到 `ctx.longestEmptyCol` 并落底，打印 `skill blink-best target=<col> rows=<n>`。

### ③ 条件造不出来 — 0 条

本轮 20 条条件全部造出（含 ai-battle 双盘、能量/引力满值、15s/20s 时间窗、60–100 行精通、自然落锁）。唯一需要注意的是 §2 的 **casual AI 接管陷阱**（不处理会让「自然下落」类条件失效）。

### ④ 设计不可测（数值互斥）— 1 条：`columbina.lure`

见 §6 的裁决建议。

---

## 6. 裁决建议：`columbina.lure`（月诱）的 `lure=3` 不可达

**问题（一句话）**：每次满辉干涉 +1 层月诱（上限 3 层），但月诱整组只用一个 10 秒计时，而施放 CD 是 17 秒 ⇒ 3 层要落在同一个 10s 窗内，**数学上不可能**。

**证据链**
1. `skills.lua:719-720`：满辉时 `tal.lure = min(LURE_MAX, lure+1)`、`tal.lureT = LURE_DUR`（每次满辉把整组计时重置为 10s）。
2. `skills.lua:443-447`：`tickTal` 里 `lureT` 归零就 `t.lure = 0`（整组清零，不是逐层过期）。
3. `M.NUM.COLUMBINA.LURE_DUR = 10`、`M.NUM.CD.columbina = 17`（skills.lua:84 / :141）。
4. 实测：连做 3 次满辉（每次都有 `skill clear_bottom rows=2` 自证是满辉），每次随后消行都只有 `lure=1 mult=1.050`；静置 11s 后 `mult=1.000`（层数清零）。

**改哪张表、改成什么（二选一，需设计裁决）**

| 方案 | 改哪里 | 改成什么 | 影响谁 | 副作用 |
| --- | --- | --- | --- | --- |
| **A（推荐，贴官方语义）** | `lua/tetris/skills.lua` 的 `tickTal` 月诱段（:443-447）+ 状态字段 | 月诱改成**每层独立计时**：`tal.lureT` 由标量改为 3 个槽位（或 `lureEnds[1..3]` 存每层到期的绝对时间），到期只清对应层；满辉时把最早到期的那层刷新 | 只动少女的 P2（`columbina.lure`）；HUD 的层数/倒计时读数（`M.buffs`、`M.talentState.lure/lureLeft`）需要跟着改 | 需要改状态结构 ⇒ 存档/回放兼容要看 `tal` 表是否落盘（当前只在本局内存） |
| **B（最小改动）** | `M.NUM.COLUMBINA.LURE_DUR` | `10 → 34`（覆盖两次 CD 间隔，容差 2s） | 只动一个常量；HUD 倒计时自动跟着变 | 失去官方「持续 10 秒」的数值；层数仍会整体过期 |

**验收锚（改完必须重新看到）**：`talent onClear role=columbina n=2 mult=1.150 lure=3 …`（复跑 `.scratch/talent-verify/columbina.mjs`，该行的判定应从 FAIL 变 PASS）。

> 附注（不算缺陷但值得知道）：`onClear` 里月诱加成只看层数、不看 `lureT`（skills.lua:1152-1156），所以「层数还在但计时已过」的中间态不会出现——当前实现里层数与计时是绑死一起清零的，这也是方案 A 要动的核心。

---

## 7. 下一轮该补什么（按 ROI）

1. **P0｜修 `holdSec` 语义 + 补 `blink-best` 分支** → 一次回收 `keqing.active`（回归）与 `keqing.longpress`，16→18。
   - `lua/tetris/skills.lua:670`：`holdSec` 改为 `numOr(ctx.keyHold, numOr(ctx.holdSec, 0))`（main 已在 `:4153` 传 `keyHold`）。
   - `lua/main.lua:6699`：`g.pieceAge` 每步加 `STEP`（当前是 `1/30`，整块年龄是真实时间的 2 倍）。
   - `lua/main.lua:4183` 后加 `elseif eff == 'blink-best'`：瞬移到 `ctx.longestEmptyCol` 并落底，打 `skill blink-best target=<col> rows=<n>`。
   - 复验：`keqing.mjs` 的 active 行应重新抓到 `skill blink col=… rows=…`；longpress 行应抓到 `skill blink-best target=…`；且 A/B 对照必须变成「短按→blink、长按→blink-best」。
2. **P1｜裁决 `columbina.lure`**（§6 方案 A 或 B）→ 18→19；复验锚 `talent onClear … lure=3 mult=1.150`。
3. **P2｜`ganyu.field` 补锚 + 让 ×1.2 生效**（`skills.lua:1134-1148` 加 `field=1`；`main.lua:6697` 的 `perTicks` 乘 `gravityMult`）→ 19→20；复验锚 `talent onClear … field=1`。
4. **P2｜锚命名统一**：`skill mark_blink`（main.lua:4232 附近）↔ 设计书 `skill mark-blink`。建议保留 main 手写锚的同时，在 dispatchEffect 里统一打 `ev.anchor`（本轮已做，效果显著）。
5. **P3｜把 4 支探针接进回归**：断言 `grep -c '判定: PASS'` = 期望条数（当前基线 16/20），跑在 `qxqy/build.mjs` 之后；同时把 §2 的「casual AI 接管陷阱」写进用例注释，否则后来者会重复踩。

---

## 8. 未验证 / 边界（如实声明）

- **只跑 headless 模拟器**，没上真机；模拟器与真机的输入/UI/音频差异本轮未覆盖。
- 观测通道是 Lua `print` → studio `rt.logs`；真机 `.gia` 帧值未取，因此「锚可观测」的结论只在模拟器通道确证。
- 概率类（纳西妲 `seed=2`、少女 `law=1`）是有限采样（确定性 LCG，可复现），只验证「按设计值发生/不发生」，未做统计检验。
- `keqing.stacks` 的 `cleared` 一层仍由 onClear 补记（`skills.lua:1122`），不是 onLock 自己算的；若以后要 onLock 独立记 `clear` 层，需把 onLock 调用挪到 `clearLines()` 之后或显式传 `cleared`。
- 本轮未改任何 `lua/**`、`tests/**`、`qxqy/**`；唯一写命令是 `flock /tmp/tetris-build.lock -c 'node qxqy/build.mjs'`。
