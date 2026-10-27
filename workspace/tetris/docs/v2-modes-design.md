# tetris v2 模式组设计书（T0 实例化 / T6 四模式 / T7 对抗因素）

> 队友 modes-arch 波 1 产出。依据：v2-plan.md §三 T0/T6/T7 + main.lua 源码读数（2026-10-27，基线 12/12 PASS）+ 模拟器键位实证。
> 证据层级标注：【源码】=main.lua/gia 源码读数；【实证】=模拟器实测/映射表读数；【推断】=设计推断待实施验证。
> 所有「待裁决」条目汇总在 §六，交 lead 问用户，本文档不自拍板。

---

## 一、T0 游戏实例化重构设计

### 1.1 现状（【源码】）

- 单局状态全部是文件级 local 单例（lua/main.lua:116-154）：board/piece/nextName、score/lines/level、combo/maxCombo/b2b、pieceCount、gameOver/tickCount/acc、guideStage/bannerTimer/taughtLock/taughtClear、flashT/introT、autoDriving、elapsed、AI 表、settle 层 10+ 变量。
- 控件三组：
  - 客户端实例 cell1..200 + frames 4 条 + preview next1..4（OnStart :1598 起 InstantiateClientUIControl 造，存 cells/frames/preview 数组，名字 'cell'..i）；
  - 服务端存量 textbox 单份：title/hud/hudNext/best/hint/keyA/keyB/keyC/topBanner/botBanner（find() = root:GetChild 按名取，**存档里只有一套，无法运行时造第二份**）；
  - 结算层懒创建（buildSettleLayer :481）：容器模板 6 文字槽 + textGuid 补齐 + scrim/card，**全部存运行时引用、不靠名字 find**。
- 硬坑（【源码】注释自证）：settleMembers() 固定 9 槽 for 遍历禁 ipairs（nil 静默截断，踩过）；真机容器占位 textbox 需销毁替换；运行时实例 SetVisible(false) 不生效。

### 1.2 G[i] 实例表结构（【推断】，实施=波 2 独占窗口）

```lua
G = {}                       -- G[1] 常驻；G[2] 仅双屏模式懒建
G[i] = {
  -- 棋盘与方块（原 :116-154 单例整体搬迁）
  board, piece, nextName,
  score, lines, level, pieceCount,
  combo, maxCombo, b2b,
  gameOver, tickCount, acc, elapsed,
  flashT, autoDriving,
  ai = { phase,t,wait,queue,qi,piece,count,sumSec,dur,pace,info,softPer,target, seed },  -- 原 AI 表 + aiSeed 入实例
  ctl = {                    -- 实例专属控件引用
    cells = {}, frames = {}, preview = {},      -- 客户端实例
    cellBX = {}, cellBY = {}, frameBX = {}, frameBY = {},  -- 抖动基准坐标
    hud = {...},            -- 双屏时=客户端实例化文字；单屏=v1 服务端控件引用（见 1.4）
    settle = { ready,tried,title,score,best,info,extra,opts,scrim,card, on,t,done,fade,size,open,
               dimRatio,dimApplied, titleY,optsY,titleOff,optsOff },  -- 原 settle 10 变量收拢
    cx = 0,                 -- 本实例棋盘中心 x（布局锚，见 1.5）
  },
  shake = { t, amp },        -- 抖屏状态（原 shakeT/shakeAmp 文件级）
}
```

**不进实例的全局共享态**（【源码】依据，保持文件级）：root、CANVAS_W/H、frameSeq（音效帧闸）、bestScore（v1 全局最高分——双实例是否分家=待裁决⑥）、guideStage（见 §二 单屏语义）、introT（入场演出只做一次）、SFX/NUM/TPL_GUIDS 常量表、BAG 出块逻辑（T1 合入后的 bag 队列归实例，但「同 bag」共享模式见 §二 ai-battle）。

### 1.3 控件命名与创建策略（【推断】）

- **单实例沿用原名** cell1..200 / next1..4 / frames：v1 的 find()、结算层容器探测、runner 用例全不感知改名，零风险。
- **第二实例懒创建**，命名 `p2cell1..200 / p2frame1..4 / p2next1..4`（首次进入双屏模式时建，与结算层同思路：probeTemplate 已验证的模板 guid + InstantiateClientUIControl）。casual/单屏模式永远不建第二套 → 单屏开销与 v1 完全一致。
- ctlName(i, idx) = i==1 and ('cell'..idx) or ('p'..i..'cell'..idx)。
- 控件总量：双屏=404 cell + 8 frame + 8 preview + 结算层双份 ≈ 430 运行时实例。真机实例数上限未验证=【推断】，波 3 实施时先在模拟器双屏跑通再真机（真机验证归 lead）。

### 1.4 双屏 HUD：服务端单份是硬约束（【源码】+【推断】）

服务端 textbox（hud/best/hint）存档只有一套且不可实例化；客户端文字模板可无限实例化（结算层已验证）。方案：

- **per-player HUD 用客户端实例化文字**：每实例 G[i].ctl.hud = {score, level, lines} 三条（InstantiateClientUIControl(textGuid)，字号/颜色复用 UI_STYLE），摆在各自棋盘正下方窄条。双屏才创建。
- **全局横幅保留单份服务端控件**：topBanner/botBanner 只做模式级信息（模式名/胜负宣告/接管提示），v1 语义自然延续。
- v1 的 title/hint/keyA-C（教学文案）只在 casual 单屏用；双屏模式隐藏（SetVisible(false) 对服务端控件有效，v1 已用）。

### 1.5 layout(W,H) 双屏版（【推断】，1280×720 画布）

v1 几何（【源码】:1544-1592）：棋盘 280×560（PITCH 网格），单屏棋盘中心 RIGHT_CX=410，左面板 panelW=420。place()=SetSizeDelta+SetAnchoredPosition（中心坐标系，负值可用）。

双屏布局：
- 两棋盘中心 x = ∓320（左棋盘占 [-460,-180]，右棋盘占 [180,460]，间距 360 中缝）。
- 每实例 G[i].ctl.cx 记本盘中心；cellBX/frameBX/preview 基准坐标全部加 cx 偏移（v1 公式 cellBX=(col-4.5)*PITCH + cx）。
- per-player HUD 三条文字：各自棋盘下方 y≈-310，宽 280 居中。
- 中缝（x∈[-180,180]）留给：topBanner 模式信息、胜负宣告、（coop）共享任务提示。
- 侧面板不再存在：keyA-C/hint/hud 服务端控件双屏时 SetVisible(false)。
- 手机端（isMobile）：双屏模式 v2 首版不支持（画布 720 高塞两盘竖排不可读），BUTTONS 热区维持单屏 casual——【推断】，待裁决是否首版就砍。

### 1.6 输入路由（【推断】）

- 现状（【源码】:1740-1817）：listen() 每键独立 AddKeyEventListener 回调直接调 moveBy/rotate/…，act(fn) 包 startIfWaiting+stage2 屏蔽。
- 改造：KEYMAP 表 `{ [枚举键名] = { player = i, action = 'left|right|rot|soft|hard|hold|restart' } }`；每键回调统一走 `dispatch(action, player)` → 查 G[player]（双屏）或一律 G[1]（单屏）。模式切换时重建 KEYMAP（casual: 两套键都路由 G[1]；pvp: 分区路由）。
- R 重开保持全局：任一玩家按 R → 整局 newGame（双屏两实例一起）。
- 键组候选见 §三。

### 1.7 结算层双实例（【推断】，复用已验证机制）

- buildSettleLayer 改签名 buildSettleLayer(g)：6 槽+scrim+card 存 g.ctl.settle（本来就只存引用不靠名字——【源码】:481-545 实证），天然支持双份。
- 布局：g.ctl.cx 偏移，各屏**内侧**滑入（左盘结算从左缘、右盘从右缘）；settleTick(d) 遍历两实例各自跑四段动画。
- 双人胜负（pvp/ai-battle/coop）：一方 gameOver 即全局结束——topBanner 宣告「P1 胜」等，败方结算层滑入+胜方结算层滑入（文案区分）。双方分数同屏可见（per-player HUD 常驻即满足）。
- 兜底路径（settleBuildTried 失败→横幅）保持 v1 逻辑，双屏共用 topBanner/botBanner。

### 1.8 重构路径：三步走，每步跑 runner（【推断】，纪律来自 v2-plan §五）

> 波 2 独占窗口执行；改法只 edit 字面替换，每步验证：`lua5.3 -e 'assert(loadfile("lua/main.lua"))' && node qxqy/build.mjs && node qxqy/runner.mjs`（runner 断言日志，不感知内部结构——【源码】runner.mjs 用例）。

- **Step 1 机械收表**（无行为变化）：:116-154 游戏态 local 收进 G[1]；全部函数头加 `local g = G[1]`，引用点 board→g.board 机械替换（预估 200+ 处引用）。结算/settle 变量同步收 g.ctl.settle。跑 runner 12/12。
- **Step 2 函数参数化**：spawn/clearLines/doLock/stepDown/moveBy/rotate/renderAll/renderPiece/renderHud/newGame/autoTick/settle 系签名加 g 参数（调用点全改），OnUpdate/键位回调传 G[1]。print 日志**逐字不动**（runner 断言锚）。跑 runner 12/12。
- **Step 3 双实例化**：newGame(i)/输入 dispatch/结算独立/第二套控件懒建。v1 用例仍全绿（单屏路径不变）；新增双屏 smoke 用例（p1/p2 前缀日志）进 runner（波 3 配合 T6 验收）。
- 风险表：Step1 引用点漏改=运行期 nil（lua5.3 语法检查抓不到，runner 抓）；**结算层 9 槽 for 遍历**在收表时保持数字下标语义，禁顺手改 ipairs（【源码】注释明示踩过）。
- **额外收益（200-local 上限解药）**：main.lua 的 200 个 local 上限已满（ai-driver T4 实测 `too many local variables (limit is 200)`，解法见其 D612——新状态一律挂表）。Step1 收表**删 58 个 A 组 local 声明、只新增 G/g 两个**，净释放 ~56 个名额——T6/T7/T8 的新状态（MODE/KEYMAP/garbage 计数等）有地方放了。这是 T0 必须先行的又一硬理由。

---

## 二、T6 四模式状态机

### 2.1 模式常量与选择入口（【推断】，判据来自 v2-plan §三 T6）

`MODE = 'casual' | 'ai-battle' | 'pvp' | 'coop'`（文件级单例，全局一份）。

入口=标题屏（guideStage=0，AI 自演照旧）按键选：
- 数字键 1/2/3/4（模拟器物理 Digit1-4=CraftspersonKey1-4，【实证】可用）→ 对应模式开局；
- **任意游戏键（方向/空格/WASD）= casual 直接开局**——v1「任意键开始」语义原样保留，旧 runner 用例零影响（【源码】anyKeyStart :1879-1888 逻辑不动，只是 dispatch 前查模式表）。
- 标题屏 topBanner 加一行模式列表文案（botBanner 呼吸文案改写，v1 已有该机制 :1896 入场演出段）。

### 2.2 casual（休闲）：5s 无操作 AI 接管（【推断】，判据=v2-plan §三 T6 用户原话）

状态机（每实例，实为 G[1] 单屏）：

```
[开局] guideStage=0, autoDriving=true, AI 自演（v1 原样）
   │ 玩家任意游戏键（startIfWaiting :934）
   ▼
playing(user)  ──任意游戏键──▶ 重置 idleTimer=0
   │ idleTimer ≥ 5s
   ▼
warn(2s)：hint/横幅「AI 将接管」，继续计 idle
   │ 2s 内无键 → ai-driving；有键 → playing(user)
   ▼
ai-driving：autoDriving=true（局中接管不清零分数——与开局 P0 归零相反，
   score/lines 继续=g.自己的账），autoTick 驱动，横幅「AI 代打中」
   │ 玩家任意游戏键
   ▼
playing(user)：autoDriving=false，AI 队列丢弃（AI.queue=nil 重置 thinking 相）
```

- idle 检测=任意游戏键（left/right/rot/soft/hard/hold），R/H 等系统键不计入（【推断】，防误触接管）。
- 日志验收：`print('idle-takeover on')` / `print('idle-takeover off')`（v2-plan §三 T6 判据原文）。
- 接管期间音效：**建议不静音**（玩家在场看着，与开局演出的静音分支 autoDriving 语义需拆分：新增 g.silent 标志，开局自演 silent=true，局中接管 silent=false）——【推断】待裁决②。
- 开局 P0 归零语义保持（startIfWaiting :943-949 归零法原样）。

### 2.3 ai-battle（人机对战）（【推断】）

- 双屏：G[1]=玩家（P1 键组），G[2]=AI（autoDriving=true 全程）。
- **同 bag**：G[2] 的方块序列与 G[1] 同源同序（共享 nextQ 队列，各取各的进度指针——T1 7-bag 合入后为共享同一 bag 展开，两边第 n 块相同）。公平性判据来自 v2-plan §三 T6。语义细节（克隆序列 vs 各自独立 bag）=待裁决④，建议同源同序。
- AI 决策走 T4/T5 通用链路（ai-driver 交付后 G[2].ai 消费同一 aiChoose 接口）；AI 消行同样送玩家垃圾行（T7）。
- 胜负：任一方 gameOver → 全局结束，topBanner 宣告。
- AI 难度=待裁决（T5 的分级参数如何挂到 G[2]，波 3 与 ai-driver 对接）。

### 2.4 pvp（双人对战）（【推断】）

- 双屏：G[1]=P1（WASD 键组），G[2]=P2（方向键键组）。
- 垃圾行互送（T7 首版机制）。
- 胜负：对方 gameOver（堆顶）→ 己方胜，双结算层+topBanner 宣告。
- 双方键位互不冲突候选见 §三。

### 2.5 coop（双人合作对抗 AI）（分工=已裁决①：用户自定义「旋转手+行动手」）

- 两盘：G[1]=双人共盘（同一 board，输入按分工路由到操作子集），G[2]=AI 盘。
- 对抗：人盘消行 → 送 AI 盘垃圾行；AI 盘消行 → 送人盘垃圾行；AI 盘 gameOver=胜利，人盘 gameOver=失败。
- 分工（用户原话 2026-10-27，经 lead 转达）：**「一个人旋转，另外一个人管移动和下落」**——P1=旋转手（W 旋转 + G Hold，Hold 归属待试玩后调），P2=行动手（←→ 移动 + ↓ 软降 + X 硬降）。键位与设计含义详见 §五。
- 断言日志形状：`coop act=rot p=1` / `coop act=hold p=1` / `coop act=move p=2` / `coop act=soft p=2` / `coop act=hard p=2`（runner 断言锚，全动作清单见 §五）。

---

## 三、键位可用性探测（【实证】模拟器；真机键位枚举可能不同=真机待验）

枚举源：/home/h/miliastra-beyond-simulator/client/lua-runtime/src/enums.js + web/public/play-renderer.js 物理映射表（VC 数组+R1 Map，内联读数）。

### 3.1 可用键全集

- **43 工匠键槽** KeyboardCraftspersonKey1..43，物理映射（顺序）：
  1-10=Digit1..Digit0；11=U 12=Z 13=Y 14=G 15=H 16=I 17=O 18=P 19=J 20=K 21=L 22=V；23-28=F5..F10；29=` 30=- 31== 32=[ 33=, 34=. 35=/；36-39=↑↓←→；40=RightCtrl 41=RightShift 42=Backspace 43=CapsLock。
- **具名 14 键**：W/S/A/D=MoveForward/Backward/Left/Right、LeftCtrl=SwitchToWalkOrRun、Space=Jump、X=Drop、Tab=OpenShortcutWheel、F=Interact、E/Q/R/T=CharacterSkill1/2/3/4；鼠标左=NormalAttack 右=Sprint（双人不用鼠标键）。
- v1 已用（【源码】main.lua :1740-1817）：36/37/38/39 方向、Jump(Space) 硬降、WASD 同映射、R 重开、Q 结算、CharacterSkill1 键位表、T 调试——与映射表闭环对上（38=←:moveBy(-1) ✓）。

### 3.2 关键结论

- **字母 C 物理键不存在于任何键池**（CraftspersonKey 无 C、具名无 C）→ T3 Hold 的「C 键」计划在模拟器不可用，候选改 X(F=Drop? 否，X=Drop)/F(Interact)/G/U/ShiftRight。
- 字母可用池：U Z Y G H I O P J K L V（工匠槽）+ W A S D E Q R T F X（具名）= 22 个字母键。
- keydown 是 canvas 单焦点全局流（无 per-player 事件）→ 双人=同键盘分区路由，无系统层冲突。
- **用例 JSON 的 typeName 必须逐字写完整枚举名**（如 `KeyboardJumpKeyDown`，JumpKey 是一个词）——playRunCase 对无效键名**静默丢弃零报错**，拼错的键全部被吞而探针看似跑通；判定法=日志查 `guide stage=1`（玩家接管标记，没有它你发的一切键都没生效，看到的是 AI 自演）（【实证】core-mechanics D613，T6 双人键位用例直接适用）。
- 模拟器枚举 Keyboard* 与真机枚举可能不同（v1 listen() 已做「枚举优先字符串回落」，说明真机确实差异过）→ 本表标注【实证·模拟器】，真机复验归 lead（T9）。

### 3.3 P1/P2 双套不冲突候选（【推断】基于【实证】映射表；coop 列=裁决① 定版）

| 动作 | P1（WASD 系） | P2（方向键系） | coop 归属（裁决①定版） |
|---|---|---|---|
| 左移 | A (MoveLeft) | ← (CraftspersonKey38) | **P2**（←） |
| 右移 | D (MoveRight) | → (Key39) | **P2**（→） |
| 旋转 | W (MoveForward) | ↑ (Key36) | **P1**（W；↑ 在 coop 不注册，防 P2 误触） |
| 软降 | S (MoveBackward) | ↓ (Key37) | **P2**（↓） |
| 硬降 | Space (Jump) | **X (Drop)**——语义天然是「落下」 | **P2**（X；Space 在 coop 不注册，防跨区误触） |
| Hold | **G** (Key14) | **F (Interact)** | **P1**（G；归属待用户试玩后调） |
| 重开(全局) | R (CharacterSkill3) | ——单键全局—— | 全局 |
| 模式选择 1-4 | Digit1-4 | ——标题屏共用—— | 标题屏共用 |

**coop 键位的物理分区定版**（P1 全左手区 W/G、P2 全右手区 ←→↓/X，零交叉不打架；且 coop 键组是 pvp 键组的子集——P1 ⊂ pvp-P1、P2 = pvp-P2 减 ↑——学会一套键位两个模式通用）。A/S/D/F 在 coop 闲置。

冲突检查：P1{W,A,S,D,Space,G,R} ∩ P2{↑,↓,←,→,X,F} = ∅ ✓。v1 的 H 键位表/Q 结算/T 调试在双屏模式停用（避免挤占）。

---

## 四、T7 对抗机制清单

### 4.1 首版：垃圾行（【推断】，对照表判据=v2-plan §三 T7）

**发送规则对照表**（写死）：

| 本方单次消行 | 基础送出 | B2B 加成 | 合计 |
|---|---|---|---|
| 1 行（单消） | 0 | — | 0 |
| 2 行 | 1 | — | 1 |
| 3 行 | 2 | — | 2 |
| 4 行（Tetris） | 4 | +1 | 5 |

- B2B 定义沿用 v1 clearLines 的 b2b 链（连续 Tetris），【源码】:742-820 已有该状态。
- **洞规则**：每行 1 洞，列位纯随机（1..10）；同批多行的洞位独立随机（可同列，形成竖井难度）。
- `raiseGarbage(g, n)`：board 底部插入 n 行（每行洞列=0 其余=固定灰色），整盘上移，顶行被推出=gameOver（复用 spawn 碰撞判定路径的自然结果：抬升后当前 piece 若重叠，锁定异常处理——实施细节波 3 定）。**不动 nextQ/bag**（v2-plan §三 T7 原文判据）。
- 时机：发送方 clearLines 结算后**立即**送达（不做延迟缓冲，日志时序可断言）。
- 表现：被送方抖屏（SHAKE 机制复用，按 n 取 SHAKE_AMP 档）+ 音效（复用 SFX_CLEAR 组或从 docs/音效资产目录.md 挑新 id，实施时选）。
- 日志：被送方 `print('garbage n=' .. n)`（v2-plan §三 T7 验收原文）。
- 模式挂接：pvp 双向互送；ai-battle 双向（AI 也送人）；coop 见 §二 2.5；casual 不启用。

### 4.2 备选因素（各一段，均未排期）

- **让子（handicap）**：ai-battle 难度调节器——弱方开局先收 n 行垃圾（n=难度参数）或强方消行送出量 ×0.5 衰减。实现=raiseGarbage 复用+一个系数，成本最低。适合 T5 难度分级联动。
- **遮挡（fog）**：对方 Tetris 时己方棋盘顶部 3 行被遮罩 5 秒（instInto cell 模实例改半透明黑，定时销毁；不动 board 数据只挡视线）。心理压力型，实现中等（10 个 image 实例的创建/销毁周期管理）。
- **速度诅咒**：对方 B2B Tetris 时己方重力 ×1.5 持续 10s（perTicks 临时除数，g.curseT 计时器）。实现最轻（一个 timer+一个系数），但体感最隐形，适合作为「高手压制萌新」的暗手。

---

## 五、coop 双人合作分工（已裁决①：用户自定义「旋转手+行动手」方案）

用户原话（2026-10-27，经 lead 转达）：**「一个人旋转，另外一个人管移动和下落」**。

### 定版分工

- **P1=旋转手（左手区）**：W 旋转、G Hold。
  - Hold 归属用户未指定，按「换一块来转 = 块的选择权与旋转强相关」归旋转手——**待用户试玩后调**（唯一遗留微调点，不再询问）。
- **P2=行动手（右手区）**：←→ 移动、↓ 软降、X 硬降。
- 键位定版理由：物理分区零交叉（P1 全左手区、P2 全右手区，双人同键盘不打架）；coop 键组是 pvp 键组子集（一套键位两模式通用）；↑/Space 在 coop 不注册（防对方手滑误触）。

### 设计含义

- 每个方块的「**姿态**」（怎么转、换不换块）与「**落点**」（放哪、何时放）分属两人——旋转手决定竖着放还是横着放，行动手决定放哪一格、什么时候砸下去。两人对同一块各握一半操作权，天然强制实时沟通。
- 实现最薄路径不变：KEYMAP 按 action 路由（§1.6 机制），coop 只是「P1 键组={W,G}→rot/hold、P2 键组={←,→,↓,X}→move/soft/hard」的映射子集，零新增机制。
- 每块节奏：spawn → P1 视形状决定旋转（0..n 次）→ P2 移到位+降落锁定。P1 的 Hold 触发会换块（选择权归 P1）。

### 断言日志（runner 锚，统一形状 `coop act=<动作> p=<玩家>`）

```
coop act=rot p=1      -- P1 旋转
coop act=hold p=1     -- P1 Hold
coop act=move p=2     -- P2 左右移
coop act=soft p=2     -- P2 软降
coop act=hard p=2     -- P2 硬降
```

（波 3 实施时在 dispatch 的 coop 分支统一打点。）

### 历史候选存档（一轮即弃）

原方案 A（操作轴：P1 移动+旋转 / P2 降落+Hold）被用户方案修正为「旋转单独一人」；方案 B（方块归属轮替）未采用。

---

## 六、待裁决点汇总（交 lead → 用户）

**裁决状态（2026-10-27）**：**10/10 全部闭合**——②③④⑥⑦⑧⑩ 由 lead 拍板（依据用户原话/硬约束）；①⑤⑨ 由用户拍板（经 lead 转达）。唯一遗留微调点：①的 Hold 归属（已定归旋转手，待用户试玩后调，不再询问）。

| # | 问题 | 建议默认 | 影响面 | 状态 |
|---|---|---|---|---|
| ① | coop 分工：方案 A（操作轴）vs B（方块归属）vs A'（定时轮换） | A | T6 coop 全部 | **已裁决（用户 2026-10-27）：自定义方案「一个人旋转，另外一个人管移动和下落」**——P1 旋转手（W 旋转+G Hold）、P2 行动手（←→↓+X）；Hold 归属待试玩后调。详见 §五 |
| ② | casual 局中 AI 接管：静音与否 + 「AI 代打中」横幅常驻？ | 不静音+横幅常驻 | T6 casual（需拆 g.silent 与 autoDriving 语义） | **已裁决：不静音+横幅**——依据用户原话「音效和记分等反馈都不能少」（v2-plan §一 点4）；g.silent 语义拆分照本文档设计做 |
| ③ | 双屏 per-player HUD 用客户端实例化文字（§1.4 方案）确认；真机 400+ 控件实例上限待验 | 确认，波 3 模拟器先行 | T0 Step3 | **已裁决：走客户端实例化**——服务端 textbox 单份是硬约束无他路；真机 400+ 控件上限记入 T9 真机验证清单 |
| ④ | ai-battle「同 bag」语义：同源同序共享队列 vs 各自独立 7-bag | 同源同序 | T6 ai-battle 公平性 | **已裁决：同源同序共享**——公平对抗是用户点 6「比拼谁坚持到最后」的前提 |
| ⑤ | casual 局中接管期间 AI 打出的分是否计入玩家账 | 计入（同一 score，不清零） | T6 casual 结算口径 | **已裁决（用户 2026-10-27）：计入玩家账** |
| ⑥ | pvp/ai-battle 的 bestScore：双实例各自记 vs 共享一条最高 | 共享一条（简化） | 结算层文案 | **已裁决：共享一条** |
| ⑦ | P2 硬降键：X(Drop) vs RightCtrl vs RightShift | X | 键位表（§3.3） | **已裁决：X(Drop)** |
| ⑧ | 垃圾行洞位：纯随机 vs 边缘加权 | 首版纯随机 | T7 | **已裁决：首版纯随机** |
| ⑨ | 双屏模式 v2 首版是否砍手机端（isMobile 时双屏禁用回落 casual） | 砍，回落 casual | T6 入口 | **已裁决（用户 2026-10-27）：砍，回落 casual** |
| ⑩ | 垃圾行音效：复用 SFX_CLEAR vs 新挑 id（docs/音效资产目录.md） | 实施时挑新 id | T7（波 3 定） | **已裁决：波 3 实施时挑** |

---

## 附：实施依赖与波次接口（给 lead 排期参考）

- T0 实施窗口在 T1/T2/T3 合入后（v2-plan §四 波 2 独占）；本文档 §1.2-1.8 为该窗口的施工图。
- T6 依赖 T0（task-6 blocked_by task-3）；T7 依赖 T6（task-8 blocked_by task-6）。
- 与 ai-driver 的接口：G[i].ai 消费 aiChoose 同一签名（T4/T5 交付物），双屏 AI 实例只是多一个调用方。
- 与 core-mechanics 的接口：nextQ（T1 7-bag 队列）/hold（T3）字段名以其实施为准，本文档结构预留位。
