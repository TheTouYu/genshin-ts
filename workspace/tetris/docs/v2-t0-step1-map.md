# T0 Step1「机械收表」施工映射表（波 2 独占窗口预制件）

> 目的：把波 2 窗口内的现场分析全部前置——窗口内只做机械执行。配套设计：v2-modes-design.md §1。
> 基线：main.lua 工作树 2005 行（T1 7-bag + T2 预览 + T4 双账本前置已合入；:115-144 bag 机制 / :159 aiScore/aiLines / :162 settleBorder / :177-180 settle 布局态）。
> **锚定纪律：本表以变量名锚定，行号仅是生成时快照**（2026-10-27 工作树，commit 前 HEAD 的引用分布）。施工时窗口开启日先重跑 §五 的核对脚本拿最新行号，变量→字段映射不变。

## 〇、Step1 收表写法约定（先读这个再动刀）

1. 在 :146（`local root, cells, preview, frames` 声明区）**之前**插入初始化：

```lua
local G = {}
G[1] = { ctl = { cells = {}, preview = {}, frames = {},
                 cellBX = {}, cellBY = {}, frameBX = {}, frameBY = {},
                 settle = {} },
         ai = {}, shake = {} }
local g = G[1]   -- Step1 期模块级别名；Step3 删除（改成函数内取 G[i]）
```

2. 每个引用点：`board` → `g.board`、`settleTitle` → `g.ctl.settle.title`、`AI` → `g.ai`、`shakeT` → `g.shake.t`（§一 对照表）。**B 组变量（§二）一个都不动**。
3. 声明行处理：A 组的 `local xxx` 声明行**删除**（值初始化挪进上面的 G[1] 字面量或保持 nil 语义）；`local function settleMembers()` 等函数定义行不动，只改函数体。
4. 闭包/upvalue 陷阱（已排查）：键位回调/OnUpdate 都只调函数（moveBy/doLock…）不直接摸变量；唯一闭包捕获是 `aiRand` 捕获 `aiSeed`（:1085-1089）→ Step1 期函数体改读 `g.ai.seed`，Step2 参数化。
5. 同名局部参数**不算引用点**：`rotateCells(cells,n)`、`evalBoard(cells,x)`、`buildQueue` 内的 cells/piece 局部参数保持原样（它们是纯函数参数，不收表）。

## 一、A 组对照表：单例 → G[1] 字段 + 引用点分布

**口径**：`total` = 正则 `\b变量名\b` 匹配行数（含声明行、SHAPES 表字段、同名参数、注释——全部是候选点，机械替换时按行上下文确认；真实替换点预估 **~570**）。分布 = 函数名:该函数区间内匹配行数。区间归属噪声：`takeFromBag:`/`rand:`/`C:` 段的计数多为**声明区/注释**（:142-169 声明区落在 takeFromBag 区间、:110-122 落在 rand 区间、:85-105 SHAPES 落在 C 区间）。

### 1.1 控件组（→ g.ctl.*）

| 变量 | 目标 | total | 分布（函数:次数） |
|---|---|---|---|
| cells | g.ctl.cells | 63 | C:8(=SHAPES cells 字段，噪声) takeFromBag:1(声明) paint:1 applyShake:2 renderNext:1 renderPiece:2 spawn:3 doLock:5 stepDown:1 moveBy:1 rotateCells:2(=同名参数，噪声) rotate:2 stackHeight:1 evalBoard:5(同名参数，噪声) aiChoose:9 buildQueue:4 aiDrop:2 autoTick:8 OnStart:5 |
| preview | g.ctl.preview | 6 | takeFromBag:1(声明) renderNext:3 OnStart:2 |
| frames | g.ctl.frames | 5 | takeFromBag:1(声明) applyShake:2 OnStart:2 |
| cellBX/cellBY | g.ctl.cellBX / cellBY | 各5 | takeFromBag:1(声明) sfx:1(=注释区噪声) applyShake:1 OnStart:2 |
| frameBX/frameBY | g.ctl.frameBX / frameBY | 各5 | 同上 |

### 1.2 游戏态组（→ g.*）

| 变量 | 目标 | total | 分布 |
|---|---|---|---|
| board | g.board | 16 | takeFromBag:1(声明) settleTick:1 renderAll:1 renderHud:1 collides:1 clearLines:4 doLock:1 newGame:2 stackHeight:1 evalBoard:1 autoTick:1 OnStart:1 |
| piece | g.piece | 71 | takeFromBag:1(声明) renderPiece:4 spawn:3 doLock:6 stepDown:4 moveBy:4 rotate:5 aiChoose:7 buildQueue:2 demoLoopReset:1 aiDrop:3 autoTick:24 OnStart:7（含 AI.piece 字段访问里的 `piece` 词——那两处是 `AI.piece ~= piece` 比较，AI 侧不动、变量侧要改） |
| nextName | g.nextName | 7 | rand:1(=注释噪声) takeFromBag:1(声明) renderNext:2 spawn:2 newGame:1 |
| nextBag | g.nextBag | 4 | takeFromBag:1(声明) spawn:2 newGame:1 |
| bagQ | g.bagQ | 6 | rand:1(注释) refillBag:1 takeFromBag:3 newGame:1 |
| bagSeq | g.bagSeq | 7 | rand:2(注释) refillBag:3 takeFromBag:1 newGame:1 |
| score | g.score | 30 | takeFromBag:3(声明) sendSettleSignal:1 buildSettleLayer:2 renderHud:2 spawn:1 clearLines:4 stepDown:1 newGame:2 startIfWaiting:2 showGameOver:3 updateBest:1 aiChoose:6 aiDrop:1 OnStart:1 |
| lines | g.lines | 18 | takeFromBag:3(声明) renderHud:2 clearLines:4 newGame:2 startIfWaiting:1 showGameOver:3 aiDrop:1 OnStart:2 |
| level | g.level | 21 | top:2(声明) takeFromBag:1(声明) tryCall:1(注释) renderHud:1 clearLines:10 newGame:1 startIfWaiting:1 showGameOver:1 OnStart:1 OnUpdate:2 |
| pieceCount | g.pieceCount | 7 | settleMembers:1(=声明区噪声) doLock:1 newGame:1 startIfWaiting:1 showGameOver:1 OnStart:2 |
| combo | g.combo | 14 | top:1(声明) settleMembers:1(噪声) clearLines:9 doLock:1 newGame:1 startIfWaiting:1 |
| maxCombo | g.maxCombo | 5 | settleMembers:1(噪声) clearLines:1 newGame:1 startIfWaiting:1 OnStart:1 |
| b2b | g.b2b | 8 | settleMembers:1(噪声) clearLines:4 doLock:1 newGame:1 startIfWaiting:1 |
| gameOver | g.gameOver | 20 | takeFromBag:1(声明) renderNext:1 renderPiece:1 spawn:1 doLock:1 stepDown:1 moveBy:1 rotate:1 newGame:1 aiDrop:1 autoTick:2 OnStart:4 OnUpdate:4 |
| tickCount | g.tickCount | 4 | takeFromBag:1(声明) newGame:1 OnUpdate:2 |
| acc | g.acc | 5 | takeFromBag:1(声明) newGame:1 OnUpdate:3 |
| elapsed | g.elapsed | 5 | takeFromBag:1(声明) newGame:1 OnStart:2 OnUpdate:1 |
| flashT | g.flashT | 6 | takeFromBag:1(声明) clearLines:1 OnStart:1 OnUpdate:3 |
| autoDriving | g.autoDriving | 14 | takeFromBag:1(声明) spawn:1 clearLines:5 doLock:1 newGame:1 demoLoopReset:3 aiDrop:2（裁决②：Step3 拆 g.silent，Step1 只搬不改语义） |
| aiScore | g.aiScore | 4 | clearLines:2 startIfWaiting:2 |
| aiLines | g.aiLines | 2 | clearLines:1 startIfWaiting:1 |

### 1.3 AI 组（→ g.ai*）

| 变量 | 目标 | total | 分布 |
|---|---|---|---|
| AI | g.ai | 83 | takeFromBag:3(声明) settleMembers:1(噪声) renderHud:2 clearLines:8 doLock:1 moveBy:1 newGame:1 startIfWaiting:3 updateBest:1 demoLoopReset:2 aiDrop:9 autoTick:49 OnStart:1 OnUpdate:1（含 AI.phase/AI.queue 等字段访问，`AI.xxx` → `g.ai.xxx` 整体替换） |
| aiSeed | g.ai.seed | 3 | aiSeed:1(自身声明行) aiRand:2 |

### 1.4 结算层组（→ g.ctl.settle.*）

> `settleMembers()` 函数体（:170-172）改成返回 `{ g.ctl.settle.scrim, g.ctl.settle.card, ... }`；**保持固定 9 槽+数字 for，禁 ipairs**（源码注释明示踩过）。

| 变量 | 目标 | total | 分布 |
|---|---|---|---|
| settleLayer | g.ctl.settle.layer | 11 | settleDestroy:4 buildSettleLayer:6（+声明1） |
| settleScrim | g.ctl.settle.scrim | 9 | settleMembers:1 settleDestroy:1 buildSettleLayer:4 showGameOver:1 layoutSettle:1（+声明1） |
| settleCard | g.ctl.settle.card | 10 | settleMembers:1 settleDestroy:1 buildSettleLayer:5 showGameOver:1 layoutSettle:1（+声明1） |
| settleBorder | g.ctl.settle.border | 6 | 同上模式 |
| settleReady | g.ctl.settle.ready | 11 | settleDestroy:2 buildSettleLayer:2 settleTick:1 showGameOver:2 layout:1 OnStart:2（+声明1） |
| settleBuildTried | g.ctl.settle.tried | 4 | settleDestroy:1 showGameOver:2（+声明1） |
| settleTitle | g.ctl.settle.title | 24 | settleDestroy:2 sendSettleSignal:1 buildSettleLayer:8 settleSetColors:1 settleTick:5 showGameOver:3 layoutSettle:1（+声明/probeTemplate 噪声2） |
| settleScore | g.ctl.settle.score | 12 | settleDestroy:1 sendSettleSignal:1 buildSettleLayer:5 settleSetColors:1 showGameOver:1 layoutSettle:1（+噪声2） |
| settleBest | g.ctl.settle.best | 12 | 同 settleScore 模式 |
| settleInfo | g.ctl.settle.info | 12 | 同上 |
| settleExtra | g.ctl.settle.extra | 16 | buildSettleLayer:4 showGameOver:2 + 标准模式（OnStart:4=布局预留） |
| settleOpts | g.ctl.settle.opts | 16 | settleTick:2 buildSettleLayer:6 showGameOver:2 + 标准模式 |
| settleOn | g.ctl.settle.on | 5 | settleDestroy:1 settleTick:1 newGame:1 showGameOver:1（+声明1） |
| settleT | g.ctl.settle.t | 7 | settleDestroy:1 settleTick:2 newGame:2 showGameOver:1（+声明1） |
| settleDone | g.ctl.settle.done | 6 | settleDestroy:1 settleTick:2 newGame:1 showGameOver:1（+声明1） |
| settleFade | g.ctl.settle.fade | 6 | 同上模式 |
| settleSize | g.ctl.settle.size | 6 | settleTick:3 newGame:1 showGameOver:1（+声明1） |
| settleOpen | g.ctl.settle.open | 4 | showGameOver:1 OnStart:2（+声明1） |
| settleTitleY / settleOptsY | g.ctl.settle.titleY / optsY | 各5 | settleTick:2 layoutSettle:2（+声明1） |
| settleTitleOff / settleOptsOff | g.ctl.settle.titleOff / optsOff | 各4 | settleTick:1 showGameOver:1 layoutSettle:1（+声明1） |
| dimRatio | g.ctl.settle.dimRatio | 4 | settleTick:1 renderAll:1 newGame:1（+声明1） |
| dimApplied | g.ctl.settle.dimApplied | 3 | settleTick:1 newGame:1（+声明1） |

### 1.5 抖屏组（→ g.shake.*）

| 变量 | 目标 | total | 分布 |
|---|---|---|---|
| shakeT | g.shake.t | 13 | stopShake:2 startShake:1 layout:1 OnUpdate:6（+声明/注释噪声2） |
| shakeDur | g.shake.dur | 5 | startShake:3 OnUpdate:1（+噪声1） |
| shakeAmp | g.shake.amp | 5 | startShake:2 OnUpdate:2（+噪声1） |
| shakePhase | g.shake.phase | 8 | stopShake:2 startShake:1 OnUpdate:4（+噪声1） |

## 二、B 组：全局保留（不收表），施工时一个都不动

| 变量/常量 | 理由 |
|---|---|
| root | 画布根，两实例共用 |
| title/hud/hudNext/best/hint/keyA/keyB/keyC/topBanner/botBanner | 服务端存量 textbox 单份（裁决③：双屏 per-player HUD 走客户端实例化文字，这套只服务单屏） |
| bestScore | 裁决⑥共享一条 |
| guideStage/bannerTimer/taughtLock/taughtClear | 模式级流程/横幅/教学态（双屏语义=全局一份） |
| introT/introFont/introPulse/overlay | 入场演出一次性 + v1 遗留 |
| CANVAS_W/CANVAS_H | 画布尺寸一份 |
| seed + rand() | LCG 母随机源；ai-battle 同 bag（裁决④）在 Step3 处理共享策略，Step1 不动 |
| bagQ/bagSeq 归属说明 | §1.2 表已收 g.bagQ/g.bagSeq（Step1 行为不变）；Step3 拆「母序列+每实例指针」实现同源同序——见设计书 §2.3 |
| sfxFrame/frameSeq/sfxCount/SFX_MUTE/SFX/SFX_CLEAR | 音效帧闸与探针（全局一条音频通道） |
| FAILED/noteFail/trySet/tryCall | UI 失败记录（全局） |
| RIGHT_CX | 单屏布局常量；Step3 双屏改用 g.ctl.cx（设计书 §1.5） |
| SHAKE_DUR/SHAKE_AMP/SHAKE_FREQ、NUM/COL_*/PITCH/CELL/ROWS/COLS、SHAPES/BAG、UI_STYLE、BUTTONS、TPL_GUIDS | 常量表 |

## 三、Step2 函数参数化清单（签名加 g + 出现次数）

**口径**：次数 = `\b函数名\b` 匹配行数（含定义行、注释、日志字符串；真实调用点 = 次数减 1 减注释噪声）。Step1 期这些函数内部已用模块级 `g = G[1]`，Step2 只改签名与调用点（`g` 从参数取）。

| 函数 | 新签名 | 次数 | 备注 |
|---|---|---|---|
| paint | paint(g, r, c, color) | 6 | |
| applyShake | applyShake(g, ox, oy) | 5 | |
| stopShake | stopShake(g, reset) | 3 | |
| startShake | startShake(g, rows) | 2 | |
| settleMembers | settleMembers(g) | 5 | 内部返回 g.ctl.settle 成员表 |
| settleDestroy | settleDestroy(g) | 4 | |
| sendSettleSignal | sendSettleSignal(g) | 2 | |
| buildSettleLayer | buildSettleLayer(g) | 2 | |
| settleSetColors | settleSetColors(g, a) | 5 | |
| settleTick | settleTick(g, d) | 3 | |
| layoutSettle | layoutSettle(g, W, H) | 4 | |
| renderAll | renderAll(g) | 9 | |
| renderNext | renderNext(g) | 2 | |
| renderHud | renderHud(g) | 7 | |
| renderPiece | renderPiece(g) | 13 | 含注释噪声，真实调用点 OnStart/键位回调 |
| collides | collides(g, cs, px, py) | 17 | evalBoard 内循环多次调用是真调用 |
| spawn | spawn(g) | 5 | |
| clearLines | clearLines(g) | 6 | |
| doLock | doLock(g) | 9 | |
| stepDown | stepDown(g, manual) | 5 | |
| moveBy | moveBy(g, dx) | 7 | |
| rotate | rotate(g) | 8 | |
| newGame | newGame(g) | 11 | R 重开/OnStart/各模式入口 |
| showGameOver | showGameOver(g) | 6 | |
| updateBest | updateBest(g) | 3 | |
| aiRand | aiRand(g, n) | 10 | 闭包捕获 aiSeed 的唯一处 |
| aiRange | aiRange(g, lo, hi) | 13 | |
| stackHeight | stackHeight(g) | 3 | |
| evalBoard | evalBoard(g, cells, x) | 2 | cells 参数保留 |
| aiChoose | aiChoose(g) | 2 | |
| buildQueue | buildQueue(g, plan) | 2 | |
| demoLoopReset | demoLoopReset(g) | 4 | |
| aiDrop | aiDrop(g) | 3 | |
| autoTick | autoTick(g, dt) | 2 | |
| refillBag | refillBag(g) | 2 | |
| takeFromBag | takeFromBag(g) | 3 | |

**签名不加 g（全局/纯函数）**：rand/cellIndex/noteFail/trySet/tryCall/sfx/find/setText/applyStyle/probeTemplate/instInto/findIn/classifyKids/probeSettleContainer/probeSettleTextbox/dimColor/rotateCells/aiFmt/showKeymap/startIfWaiting/toggleKeymap/layout(W,H)/OnStart/OnUpdate——前向声明行（:181/:187/:188 的 settleDestroy/settleSetColors/layoutSettle/showGameOver/updateBest/collides/doLock/renderAll/renderPiece/renderHud/spawn/clearLines）在 Step1 收表时**保持原样**（还是无参声明），Step2 一起改。

## 四、施工顺序（窗口内按批推进，每批跑验证）

1. **批 0**：插入 G/g 初始化（§〇）→ 验证。
2. **批 1**：结算层组 1.4（约 220 处，集中在 :162-185 声明+settle 函数区）→ 验证。
3. **批 2**：游戏态组 1.2（约 250 处）→ 验证。
4. **批 3**：AI 组 1.3（约 85 处，autoTick 内 49+AI 表字段访问为主）→ 验证。
5. **批 4**：控件组 1.1（约 55 处真替换，剔除 SHAPES/同名参数噪声）→ 验证。
6. **批 5**：抖屏组 1.5（约 28 处）→ 验证。
7. **收尾**：删 A 组残留 local 声明行、grep 空引用核对（§五）→ 终验。

**每批验证命令**（v2-plan §五 纪律，退出码 0 + 12/12 PASS 才进下一批）：

```bash
cd /home/h/genshin-ts/workspace/tetris && \
  lua5.3 -e 'assert(loadfile("lua/main.lua"))' && \
  node qxqy/build.mjs && node qxqy/runner.mjs
```

## 五、窗口开启日核对脚本（重跑拿最新行号）

```bash
cd /home/h/genshin-ts/workspace/tetris
# 1) A 组残留检查：Step1 收尾后应为 0（B 组合法变量除外）
for v in board piece nextName nextBag score lines level pieceCount combo maxCombo b2b \
         gameOver tickCount acc elapsed flashT autoDriving aiScore aiLines AI aiSeed \
         settleLayer settleTitle shakeT shakeDur shakeAmp shakePhase; do
  n=$(grep -cE "\blocal [a-zA-Z, ]*\b$v\b" lua/main.lua); echo "local-decl $v: $n"
done
# 2) 语法+回归
lua5.3 -e 'assert(loadfile("lua/main.lua"))' && node qxqy/build.mjs && node qxqy/runner.mjs
```

预期：所有 A 组变量 local 声明清零、runner 12/12。若并行队友在窗口前又合入新状态变量（bagQ 类），先补进 §一 表再动刀。
