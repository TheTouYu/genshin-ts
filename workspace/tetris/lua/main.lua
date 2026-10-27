--[[==========================================================================
Tetris —— 千星模拟器 2D 路线技术验证 demo（服务端驱动渲染）
----------------------------------------------------------------------------
架构：
  * 本脚本挂在服务端控件 n1（服务端容器）上 —— 客户端模板树零脚本铁律，脚本不进模板。
  * 棋盘 10x20 = 200 格：OnStart 用 game.InstantiateClientUIControl(模板 guid, root)
    实例化 200 个 image 实例并按格位摆放；之后只改 imageColor 上色。
  * 所有文字（logo/统计/键位卡/提示/上下横幅）都是**服务端 textbox**，按 name 寻址：
    GetChild 不受"模板 guid 重编号"影响，是跨宿主最稳的一条寻址路。
  * 模板块指引：客户端模板只有一个 cell。模板 guid 在模拟器（authoring）与真机
    （导入后编辑器重编号）不同（实测 1073742105 vs 1073741849），多一个模板就多一处
    导入后校准 —— 所以"覆盖棋盘的引导层"改成上下横幅（不遮棋盘，也更简洁）。
  * 逻辑固定步长：OnUpdate(dt) 只累加，逻辑在 STEP=1/60 的 tick 内跑。

满幅布局（按 GetUICanvasSize 计算，换设备不用重新导入）：
  | 左栏 420 | 棋盘 300 | 右栏 420 |     上横幅（46 高）/ 下横幅（46 高）

键位（官方具名键，模拟器与真机均已实测可用）：
  ArrowLeft/A   -> KeyboardCraftspersonKey38Down / KeyboardMoveLeftKeyDown   左移
  ArrowRight/D  -> KeyboardCraftspersonKey39Down / KeyboardMoveRightKeyDown  右移
  ArrowUp/W     -> KeyboardCraftspersonKey36Down / KeyboardMoveForwardKeyDown 顺时针旋转
  ArrowDown/S   -> KeyboardCraftspersonKey37Down / KeyboardMoveBackwardKeyDown 软降
  Space         -> KeyboardJumpKey            硬降
  G             -> KeyboardCraftspersonKey14  Hold 暂存（工匠槽 14；模拟器键池无字母 C，见 key-bindings.js）
  R             -> KeyboardCharacterSkill3Key 重开
  Q             -> KeyboardCharacterSkill2Key 真结算（发服务端信号 tetris_settle → 官方结算页）
  H             -> KeyboardCharacterSkill1Key 键位表（暂停开关；真机若不认则无害，右栏常驻键位卡兜底）
  T             -> KeyboardCharacterSkill4Key 调试：填满最底两行（仅用例用）

引导（时机精准 / 由简入深 / 可回溯）：
  stage 0 等开始：重力暂停，上横幅 TETRIS，下横幅键位 + "按任意键开始"
  stage 1 游戏中：首次锁定提示"堆满一行即消除"，首次消行提示分值表
  stage 2 键位表：按 H 暂停并显示完整键位，再按 H 继续
  失败：上横幅 GAME OVER（红），下横幅 得分 / 本局最高 / 按 R 重开

音效 / 抖屏（2026-10-25 新增）：
  音效 只在"动作真的发生"时播一条（移动/旋转/落地/消行/结束），全走 pcall；
       id 见 SFX 表 —— 全部是内置音效库 20001 组的小整数（语义待听感确认）
  抖屏 消行时把 200 格 + 4 条外框按同一偏移量整体平移，0.18~0.28s 指数衰减，
       行数越多越强；只在 g.shakeT > 0 的帧写坐标，抖完复位一次（基准坐标创建时存下来）
=========================================================================]]

local COLS, ROWS    = 10, 20
local CELL, GAP     = 28, 2
local PITCH         = CELL + GAP
-- 模板 guid 候选表：`__GUID_*__` 由 qxqy/build.mjs 注入本工程的实际值（模拟器恒命中）；
-- 真机导入后编辑器会重新编号，所以把真机已知值也列进来。探测按「能力」判类型，不靠名字：
--   cell = image（无光标事件方法） / hit = cursor（有 AddCursorEventListener）。
-- 真机首次导入 hit 后若仍点不动，跑 `node qxqy/deploy.mjs --calibrate` 自动把新 guid 写进这里。
local TPL_GUIDS = {
  cell = { __GUID_CELL__, 1073741849, 1073741854 },
  hit  = { __GUID_HIT__, 1073741884, 1073741865, 1073741866 },
  -- 结算层**容器模板**候选：真机地图里的两个容器组 + 它们的容器节点 + 模拟器模板。
  -- 2026-10-24 真机日志实证：容器组 1073741865 在真机 `InstantiateClientUIControl` 返回 nil
  -- ⇒ 容器整棵实例化在真机不支持（要么容器不在可实例化表里，要么引擎只认叶子控件），
  -- 所以下面还有一组 settleText（单控件模板）退路，并把每条候选的探测结果打进日志。
  -- 2026-10-25 两个实验：容器模板 2210（整棵复用）/ 文字模板 2202（逐个数实例化）
  settle = { 1073742210, 1073741865, 1073741921, 1073742107 },
  -- 结算层**单控件（textbox）模板**候选：模拟器 stext + 真机模板区里的 textbox 记录（逐个试）
  -- 1073742200 = 2026-10-24 用 `gsts assets:ui template clone 1073741935 --id 1073742200 --top-level`
  -- 新建的**顶层 textbox 模板**（真机容器模板实例化不了，这个才是真机能用的那条）
  settleText = { 1073742202, 1073742200, 1073741935, 1073741923, 1073741937, 1073741934,
                 1073741933, 1073741922, __GUID_STEXT__ },
}
local STEP          = 1 / 60

-- ===== 数值表：唯一来源 docs/数值策划.md §2/§3/§5 —— 调平衡只改这一段 =====
-- 单表而不是 13 个 local：Lua 的 main chunk 有 200 个 local 硬上限，本文件已经贴着上限（实测）。
local NUM = {
  LEVEL_UP_LINES = 10,      -- 每 10 行升一级（docs §4.5）
  LEVEL_CAP      = 12,      -- 等级上限（110 行）：到顶不再加速（docs §3.3）
  -- 各级"每格下落拍数"（60 拍 = 1 秒）。L1=30 拍 = 0.5s/格，与旧版 GRAVITY_TICKS 一致。
  -- 节奏：0.500 0.433 0.383 0.333 0.300 0.250 0.233 0.200 0.167 0.150 0.133 0.117 s/格
  SPEED          = { 30, 26, 23, 20, 18, 15, 14, 12, 10, 9, 8, 7 },
  SCORE          = { 100, 300, 500, 800 },   -- 1/2/3/4 行基础分（Tetris Guideline 表，docs §2.1）
  SOFT           = 1,       -- 软降（↓ / S / 手机↓）每格加分（docs §2.2）
  HARD           = 2,       -- 硬降（空格）每格加分（docs §2.2）
  COMBO          = 50,      -- 连击加成：COMBO × (combo-1) × level（docs §2.3）
  B2B_NUM        = 3,       -- Back-to-Back：连续两次四消，基础分 ×1.5（整数化 3/2）
  B2B_DEN        = 2,
  FLASH          = { 0.10, 0.13, 0.17, 0.22 },  -- 消行闪白时长（1/2/3/4 行；恒 < 抖屏时长，docs §5.1）
  LEVEL_TIP      = 1.2,     -- 升级提示持续秒数（docs §5.3）
  COMBO_TIP      = 0.8,     -- 连击提示持续秒数（docs §5.4）
  HOLD_KEY       = 'KeyboardCraftspersonKey14Down',  -- T3 Hold 键=G（工匠槽 14；模拟器键池无字母 C，
                    -- 见 studio/play/key-bindings.js craftCodes[14]='KeyG'；双屏 P1 侧 Hold 同用 G）
  -- T3 Hold 槽状态（子表挂 NUM——main 函数 200 个 local 已满，实测加 1 个 local 即爆
  -- `too many local variables (limit is 200)`）：
  --   name = 槽内块名（nil=空槽）；bag = 入槽时块所属袋序（换出块日志沿用原袋序）
  --   can  = 本次落子是否还可换块（Guideline：每次落子仅可 Hold 一次，锁定即恢复）
  -- T7 垃圾行对照表（v2-plan §三）：2/3/4 消 → 1/2/4 行 + 1 洞；B2B 四消再 +1（clearLines 触发）。
  -- 每盘状态已搬 g.st/g.ld/g.das（T6c）；本表是全局常量。
  GARBAGE = { [2] = 1, [3] = 2, [4] = 4 },

  -- ===== T5 AI 难度档（docs/v2-ai-design.md §四；数值依据标注见该文档）=====
  -- lv: 1=轻松(demo-easy) 2=标准(demo-normal) 3=高难(demo-hard)；默认 2（casual 演出观感不变）。
  -- 调试切档键 = SwitchToWalkOrRun（具名键不在工匠 1-43 池，不会被 anyKeyStart 抢走）。
  -- 字段：ply=搜索层数；hold=是否考虑 Hold 换块；pMistake=失误注入概率（%）；
  --   topK=失误采样池大小；pieceMin/Max=单块时长带（s）；moveMin/Max=横移间隔带（s）；
  --   obsMin=观察下限（高难档 0.55 覆盖 2-ply+hold 的 ~29 帧搜索）；targetLo/Hi=单块目标时长带。
  AI_LEVEL = 2,
  nxFull = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },   -- T5 性能修复：evalNext scratch（1-4 满行行号；11-20 各列高度）
  AI_LEVELS = {
    { name = 'easy',   ply = 1, hold = 0, pMistake = 15, topK = 5, nudgePct = 30,
      pieceMin = 2.2, pieceMax = 3.8, moveMin = 0.10, moveMax = 0.30,
      obsMin = 0.30, targetLo = 2.6, targetHi = 4.0 },
    { name = 'normal', ply = 2, hold = 0, pMistake = 8, topK = 3, nudgePct = 30,
      pieceMin = 1.5, pieceMax = 3.2, moveMin = 0.08, moveMax = 0.25,
      obsMin = 0.30, targetLo = 1.8, targetHi = 3.2 },
    { name = 'hard',   ply = 2, hold = 1, pMistake = 0, topK = 1, nudgePct = 0,
      pieceMin = 0.9, pieceMax = 2.2, moveMin = 0.06, moveMax = 0.18,
      obsMin = 0.55, targetLo = 1.0, targetHi = 2.2 },
  },
  -- T5 评估特征补强（Dellacherie；与 El-Tetris 四权重同表共存，docs/v2-ai-design.md §三）：
  -- rowtrans/coltrans = 行/列内 空实 边界数；wellsum = 井深累加 d*(d-1)/2（浅井轻罚）。
  -- 【T5 校准定论】Dellacherie 补充特征在 El-Tetris 权重系内为负贡献（对照实验 A/B/D，
  -- docs/v2-ai-design.md §三）：A=全 0 基线 ρ0.24 > B=landing(-0.30) 0.22 ≈ D=小系数 0.22。
  -- 特征计算代码保留（rowtrans/coltrans/wellsum/landing），权重 0=等效 El-Tetris 四项。
  W_ROWTRANS = 0.0, W_COLTRANS = 0.0, W_WELLSUM = 0.0, W_LANDING = 0.0,

  -- ===== T8 进阶操作（数值出处 v2-plan §三 T8；只作用于玩家输入路径——
  -- AI 的 aiDrop 即时锁定、AI 横移走自身节奏，不受下面任何参数影响）=====
  LD_DELAY   = 0.5,    -- 锁定延迟：重力触底后的缓冲秒数
  LD_RESETS  = 15,     -- 锁定延迟重置上限（移动/旋转成功各计一次，超限强制锁定）
  DAS_DELAY  = 0.25,   -- DAS：按住 ←/→ 多少秒后开始自动连移
  ARR_RATE   = 0.05,   -- ARR：DAS 触发后自动连移的间隔秒数
  DAS_CAP    = 12,     -- v2.1：连续自动连移步数上限（网页 keyup 丢失兜底；正常 DAS 到墙 9 格内停涨）
  TSPIN_BONUS = 400,   -- T-spin 加成：bonus = TSPIN_BONUS × 消行数 × level（0 行无分只提示）
  -- T8 运行态（挂表，200-local 约束）：
  --   LD  = { t = -1|秒, resets = 0 }   锁定延迟计时（t<0 未激活；重力触底启动，玩家移动/旋转重置）
  --   DAS = { dir = -1|0|1, t = 0, arr = 0 }   方向键按住状态（dir=0 松开）
  --   lastRot = true|false    最后一次成功动作是否为旋转（T-spin 判定前置；移动置 false）
  -- T8 键位表（表化 listen 区，T6 双屏输入路由留口：条目加 player 字段即可分区路由）：
  --   key = Down 枚举名；up = 对应 Up 枚举名（DAS 需要松开事件）；action 见 dispatchPlayer
  KEYMAP = {
    { key = 'KeyboardCraftspersonKey38Down',  up = 'KeyboardCraftspersonKey38Up',   action = 'left'  },
    { key = 'KeyboardCraftspersonKey39Down',  up = 'KeyboardCraftspersonKey39Up',   action = 'right' },
    { key = 'KeyboardCraftspersonKey36Down',  action = 'rot'  },
    { key = 'KeyboardCraftspersonKey37Down',  action = 'soft' },
    { key = 'KeyboardMoveLeftKeyDown',        up = 'KeyboardMoveLeftKeyUp',         action = 'left'  },
    { key = 'KeyboardMoveRightKeyDown',       up = 'KeyboardMoveRightKeyUp',        action = 'right' },
    { key = 'KeyboardMoveForwardKeyDown',     action = 'rot'  },
    { key = 'KeyboardMoveBackwardKeyDown',    action = 'soft' },
    { key = 'KeyboardJumpKeyDown',            action = 'hard' },
    { key = 'KeyboardCraftspersonKey14Down',  action = 'hold' },   -- G（与 HOLD_KEY 同键）
  },
}

local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local COL_EMPTY  = C(255, 26, 29, 38)
local COL_CYAN   = C(255, 60, 220, 240)
local COL_YELLOW = C(255, 245, 210, 60)
local COL_PURPLE = C(255, 170, 80, 240)
local COL_GREEN  = C(255, 90, 220, 110)
local COL_RED    = C(255, 240, 80, 90)
local COL_BLUE   = C(255, 70, 130, 240)
local COL_ORANGE = C(255, 245, 160, 60)
local COL_BG     = C(255, 18, 20, 27)
local COL_GRAY   = C(255, 92, 96, 105)   -- T7 垃圾行方块色（暗灰，区别于七色）

-- 七种方块：n = 包围盒边长，cells = 盒内 1-based {row, col}
local SHAPES = {
  I = { n = 4, color = COL_CYAN,   cells = {{2,1},{2,2},{2,3},{2,4}} },
  O = { n = 2, color = COL_YELLOW, cells = {{1,1},{1,2},{2,1},{2,2}} },
  T = { n = 3, color = COL_PURPLE, cells = {{1,2},{2,1},{2,2},{2,3}} },
  S = { n = 3, color = COL_GREEN,  cells = {{1,2},{1,3},{2,1},{2,2}} },
  Z = { n = 3, color = COL_RED,    cells = {{1,1},{1,2},{2,2},{2,3}} },
  J = { n = 3, color = COL_BLUE,   cells = {{1,1},{2,1},{2,2},{2,3}} },
  L = { n = 3, color = COL_ORANGE, cells = {{1,3},{2,1},{2,2},{2,3}} },
}
local BAG = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }

-- 确定性随机（LCG）：用例可复现，不依赖 os / math.random
local seed = 20261023
local function rand(n)
  seed = (seed * 1103515245 + 12345) % 2147483648
  return (seed // 65536) % n + 1
end

-- 7-bag 出块（T1，替换纯随机 nextName = BAG[rand(#BAG)]）：
-- 每袋 I,O,T,S,Z,J,L 各一、袋内 Fisher-Yates 洗牌（继续用上面 LCG，种子不变 ⇒ 序列可复现）；
-- 保底语义：任意连续 13 块必含全部 7 种（13 块跨袋时两端分布 k+(13-k)、k∈1..6 ⇒ 13-k≥7 必含完整袋；
-- 12 块不成立——反例：袋A尾 6 块缺 X + 袋B头 6 块缺 X，连续 12 块缺 X（lead 2026-10-27 判据纠正）。
-- 「任意连续 7 块含全 7 种」同样不成立——袋尾 k 块与下袋头 7-k 块可能重叠。
-- 首袋排除 S/Z 开局（Guideline 惯例，防开局即井）：若洗出的队头是 S/Z，与袋内第一个非 S/Z 交换。
-- 每局 newGame 重洗（bagSeq 归零 ⇒ 「newgame 后前 14 块」恒定，与上一局消耗无关；LCG 种子延续，第二局序列 ≠ 第一局）。
-- T0 实例化（v2）：每盘独立状态全部收进实例表 G[i]（平铺字段），g=当前实例引用。
-- 闭包共享 g 的 upvalue 绑定 ⇒ 双屏循环 `for i=1,2 do g=G[i] ... end` 即让全部函数作用于当前盘，
-- 仅跨实例交互（垃圾行/胜负判定）需显式传实例。全局保留：root/服务端单份控件/入场演出/常量/随机源。
local G = {}                             -- 游戏实例表：G[1]=主实例；双屏模式 G[2]=第二盘
local g                                  -- 当前实例引用（=G[1]；双屏循环重绑定）
local ACTIVE = { 1 }                     -- 激活实例下标表：单屏={1}；双屏={1,2}（T6 模式入口设置）
-- T6 四模式：casual=休闲（默认，AI 自演+玩家接管+局中 5s 无操作 AI 代打）|
-- ai-battle=双屏 AI 对战 | pvp=双屏双人 | coop=双人合作对抗 AI（旋转手+行动手，裁决①）
local MODE = 'casual'
-- v2.1 ②：标题屏四模式大视觉卡片（用户原话「真正花了大力气做的东西要让玩家看到」）。
-- pendingMode/pendingT = 按 Digit 后的模式名大字动画窗（0.5s，introT 渐变手法），窗后 enterMode 开局。
local MC = {}                          -- 菜单卡片组实例表（色块×4 + 文字×8；stage0 建、开局销毁）
local pendingMode, pendingT = nil, 0
-- v2.1 ③：H 游戏说明层（stage0 按 H 开/关；任意键=先关层不开局）
local HL = {}                          -- 说明层实例表（暗底×1 + 文字条×10）
local helpOpen = false
local toggleHelp                       -- 前向声明（实现见 UI 段；startIfWaiting/H 键都在更早处调用）
local buildMenuCards, destroyMenuCards -- 前向声明（实现见 UI 段；startIfWaiting/demoLoopReset/OnStart 都在更早处调用）
-- v2.3 ②：深空霓虹街机主题（lead 定调色板——统一饱和度只在色标/描边/选中态用，卡片底一律深色）
local THEME = {
  bgDeep  = C(255, 11, 16, 24),     -- #0B1018 最深底
  panel   = C(255, 18, 26, 40),     -- #121A28 面板底
  card    = C(255, 26, 36, 56),     -- #1A2438 卡片底
  textMain = C(255, 241, 245, 249), -- #F1F5F9 主文字
  textSub  = C(255, 148, 163, 184), -- #94A3B8 次文字
  selectEdge = C(255, 226, 232, 240), -- #E2E8F0 选中描边
}
local MODE_INFO = {
  { key = '1', name = '休 闲', desc = 'AI 代打陪练 · 随时接管', color = C(255, 45, 212, 191) },   -- #2DD4BF 青绿
  { key = '2', name = 'AI 对抗', desc = '与 hard 档 AI 决战', color = C(255, 244, 63, 94) },      -- #F43F5E 玫红
  { key = '3', name = '双人对战', desc = '同屏 PK · 互送垃圾行', color = C(255, 168, 85, 247) }, -- #A855F7 紫
  { key = '4', name = '双人合作', desc = '旋转手+行动手 · 共盘抗 AI', color = C(255, 245, 158, 11) }, -- #F59E0B 琥珀
}
local MODE_TITLE = { casual = '休 闲', ['ai-battle'] = 'AI 对抗', pvp = '双人对战', coop = '双人合作' }
-- casual 局中接管状态机（v2-plan §三 T6）：'play'（玩家操作）→5s 无操作→'hint'（提示 2s）
-- →'ai'（AI 代打：aiTickCore 驱动，横幅常驻，分数继续入玩家账=裁决⑤）→任意游戏键→'play'。
-- 接管不设 autoDriving（分数/音效走玩家路径=裁决②⑤天然满足）；教学抑制不受影响。
local TK = { state = 'play', t = 0 }
-- v2.2 ③：模式终局标志——双屏任一盘 gameOver 即置位：冻结两盘（输入/重力/AI 全停，
-- OnUpdate 只推结算动画），胜负走全屏结算层，R=回菜单复位。casual 不置位（v1 语义不变）。
local MODE_OVER = false
-- v2.1 ①：双人/对抗模式开局引导态（guideStage=3）——phase 'keys'（键位说明，任意键确认）
-- → 'count'（3-2-1 倒计时，每 1s，topBanner 大字）→ guideStage=1 开局。casual 不经此态（旧用例直进）。
local GK = { phase = 'keys', t = 0, count = 3 }
local RHO = { pieces = 0, lines = 0 }    -- AI 消行率统计（跨局累计，不随 newGame/实例切换清零）
-- T6b ai-battle 出块镜像队列：主盘自然出块 push，AI 盘 piece 空时立即喂 / doLock 后拉（保序）。
-- 同源同序（裁决④）＝公平对抗的前提；AI 盘快过主盘时 piece=nil 空转等待（aiTickCore 判 not piece 停）。
local MIRRORQ = {}
local feedMirror    -- 前向声明（实现见 enterMode 前：需 spawn 已赋值；spawn 尾部与 G[2] doLock 都调它）
local TPL_CELL      -- cell 模板 guid（OnStart 探测后保存；G[2] 棋盘控件复用，T6b-2）

-- AI 状态机初值（每实例一份；T6b 起从文件级一次性构造搬进 newInst——G[2] 也要有自己的 AI 表）
local function newAIState()
  return { phase = 'thinking', t = 0, wait = 0.5, queue = nil, qi = 1, piece = nil,
    count = 0, sumSec = 0, dur = 0, pace = nil, info = nil, softPer = 0.08, target = 2.2,
    score = 0, lines = 0, fx = 0,
    search = nil,   -- T5 渐进式搜索状态（plan/idx/best2/bestScore/done/holdChecked）
  }   -- score/lines = AI 局账本（T4，clearLines 分流写入；newGame 归零）；ρ 统计在全局 RHO
end

-- 实例构造：v1 显式初值逐项等价搬入（v1 声明区原 nil 的字段保持 nil，newGame 会赋）。
local function newInst()
  local t = {}
  t.cellBX, t.cellBY, t.frameBX, t.frameBY = {}, {}, {}, {}
  t.bagQ, t.bagSeq = {}, 0
  t.autoDriving = false
  t.elapsed = 0
  t.settleReady = false
  t.settleBuildTried = false
  t.settleOn, t.settleT, t.settleDone = false, 0, false
  t.settleFade = -1
  t.settleSize = 44
  t.settleTitleY, t.settleOptsY = 150, -150
  t.settleTitleOff, t.settleOptsOff = 420, -420
  t.dimRatio, t.dimApplied = 0, -1
  t.pieceCount = 0
  t.combo, t.maxCombo, t.b2b = 0, 0, false
  t.settleOpen = false
  t.shakeT, t.shakeDur, t.shakeAmp, t.shakePhase = 0, 0, 0, 0
  t.boardOX = 0                         -- 棋盘 x 偏移（单屏=0 居中；双屏 G[1]=-320 / G[2]=+320，T6b-2）
  -- T6c：每盘独立输入状态（原挂 NUM 的每盘状态搬实例——pvp 双人各自 DAS/LD/Hold 互不干扰）
  t.ld = { t = -1, resets = 0 }         -- 锁定延迟（T8）
  t.das = { dir = 0, t = 0, arr = 0, steps = 0 }  -- DAS/ARR（T8；v2.1 steps=连续自动连移步数，达 DAS_CAP 强制停——网页 keyup 丢失兜底）
  t.st = { name = nil, bag = 0, can = true }  -- Hold 槽（T3）
  t.lastRot = false                     -- T-spin 判定前置（T8）
  t.AI = newAIState()
  return t
end
G[1] = newInst()
g = G[1]

local function refillBag()
  local t = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }
  for i = #t, 2, -1 do                 -- Fisher-Yates：6 次 rand()，保证确定性与均匀性
    local j = rand(i)
    t[i], t[j] = t[j], t[i]
  end
  if g.bagSeq == 0 and (t[1] == 'S' or t[1] == 'Z') then
    for i = 2, #t do
      if t[i] ~= 'S' and t[i] ~= 'Z' then
        t[1], t[i] = t[i], t[1]
        break
      end
    end
  end
  g.bagSeq = g.bagSeq + 1
  for i = 1, #t do g.bagQ[#g.bagQ + 1] = { name = t[i], bag = g.bagSeq } end
end
local function takeFromBag()
  if #g.bagQ == 0 then refillBag() end
  local e = table.remove(g.bagQ, 1)
  return e.name, e.bag
end

-- 前向声明（局部化，避免污染全局表）：控件句柄类里，棋盘四件（cells/preview/frames/抖动基准）
-- 已收进实例表 g；服务端单份控件（title/hud/.../横幅）全局保留——双屏共用一份，双屏 per-player
-- HUD 走客户端实例化（v2 设计书 §1.4）。
local root
local title, hud, hudNext, best, hint, keyA, keyB, keyC, topBanner, botBanner
local guideStage, bannerTimer           -- 全局流程阶段（0=AI 演出/1=游戏/2=键位表）与全局横幅计时
local introT, overlay
local introFont, introPulse
local CANVAS_W, CANVAS_H = 1280, 720                -- layout() 记录，懒创建结算层时要用（全局单画布）
local settleDestroy, settleSetColors, layoutSettle   -- 定义见「结算层」/「布局」段（前向声明）
local bestScore = 0                                  -- 历史最佳（全局共享，裁决⑥）
local showGameOver, updateBest
local collides, doLock, renderAll, renderPiece, renderHud, spawn, clearLines
local raiseGarbage    -- T7 垃圾行（实现见 enterMode 前；clearLines 消行后跨盘调用）
-- 结算层成员表：**固定 9 槽 + 数字 for 遍历**，绝不能用 ipairs({...})——
-- 里面只要有一个 nil（比如没造 border），ipairs 就在那里停住，后面的成员会被静默跳过（销毁会漏）。
-- 成员全部收进实例表 g（T0）；双屏时每盘各自的结算层。
local function settleMembers()
  return { g.settleScrim, g.settleCard, g.settleBorder, g.settleTitle,
           g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts }
end

local function cellIndex(r, c) return (r - 1) * COLS + c end

local function paint(r, c, color)
  if not g.cells then return end   -- G[2] 数据层阶段无棋盘控件（T6b-2 建控件后走全路径）
  local ctl = g.cells[cellIndex(r, c)]
  if ctl then ctl.imageColor = color end
end

-- 保护式写入：真机上某些字段/方法会抛错（模拟器接受），一处抛错会中断整段 OnStart
-- ⇒ 首次试玩全部按键无响应的根因（2026-10-24，日志停在 cellCount=200）。
local FAILED = {}
local function noteFail(tag, err)
  if FAILED[tag] then return end
  FAILED[tag] = true
  print('ui fail ' .. tag .. ' :: ' .. tostring(err))
end
local function trySet(ctl, key, value)
  if not ctl then return false end
  -- 真机适配（v2.2）：对齐字段真机要枚举不收字符串（真机日志 `bad argument #2
  -- (TextHorizontalAlignment expected, got string)`——模拟器两形态都收）。先映射枚举，
  -- 无 Enum 表回落字符串。
  if (key == 'horizontalAlignment' or key == 'verticalAlignment') and type(value) == 'string' then
    local enums = (type(Enum) == 'table')
      and ((key == 'horizontalAlignment' and Enum.TextHorizontalAlignment) or Enum.TextVerticalAlignment)
      or nil
    if enums and enums[value] ~= nil then value = enums[value] end
  end
  local ok, err = pcall(function() ctl[key] = value end)
  if not ok then noteFail(tostring(key), err) return false end
  return true
end
local function tryCall(ctl, method, a, b)
  if not ctl then return false end
  -- 真机适配（v2.2）：方法签名严格——SetVisible 真机 2 expected got 3（尾 nil 实参也计数）。
  -- 按实参个数分发：b/a 为 nil 不传。模拟器宽松两形态都过。
  local ok, err
  if b ~= nil then
    ok, err = pcall(function() ctl[method](ctl, a, b) end)
  elseif a ~= nil then
    ok, err = pcall(function() ctl[method](ctl, a) end)
  else
    ok, err = pcall(function() ctl[method](ctl) end)
  end
  if not ok then noteFail(tostring(method), err) return false end
  return true
end

--------------------------------------------------------------------------------
-- 音效（2026-10-25）：game.PlayAudio2D(audioId) —— audioId 必须是整数（内置音效库的小整数 id）。
-- id 都在 20001 组里，时长来自模拟器音频白名单 studio/assets/audio-catalog.js（可离线核对）：
--   **音色语义未确认**（音效库只给时长、不给名字），换音只改下面这张表。
-- 纪律：
--   ① 只在"动作真的发生"时播（移动/旋转成功、锁定、消行、结束），不在每帧播；
--   ② `sfxFrame == frameSeq` 保证**同一帧最多播一条**（真机一帧内可能连来两个动作）；
--   ③ 全走 pcall —— 真机缺这个 API 时一处抛错会中断整段 OnStart（2026-10-24 踩过）。
--------------------------------------------------------------------------------
-- 音效 id：由 sfx-web 挑选器（用户听感调整）导出，2026-10-27
-- 名称出处：.scratch/sfx/sfx-library-full-20261027.md（GUI 采集 1196 条）
local SFX = {
  move   = 50884,   -- 按钮点击_轻_卡通_03 (0.151s)
  rotate = 50883,   -- 按钮点击_轻_卡通_02 (0.151s)
  lock   = 50872,   -- 按钮点击_重_通用_01 (1.024s)
  over   = 50929,   -- 提示性UI_轻_整理背包 (0.978s)
  level  = 40001,   -- 战斗_治疗_回复_01 (1.653s) ← 升级音
  tspin  = 50924,   -- 拍照分享 (1.418s) ← T-spin 专属正反馈（T8）
  -- T7 垃圾行（裁决⑩：波 3 实施时挑；真机人耳确认归 T9 清单⑥）
  garbageSend = 40017,   -- 战斗_远程攻击_投掷_飞刀_01 (1.161s) ← 送出（攻方反馈）
  garbageRecv = 20004,   -- 动物叫声_鬼兜虫_重受击_01 (0.459s) ← 受击（被打方警报）
}
-- 消行按行数换 id：四档互不相同 ⇒ 1 行与 4 行听得出差别（音高关系未确认）
local SFX_CLEAR = { 50917, 40001, 40022, 40054 }   -- 0.785 / 1.653 / 1.064 / 2.000s
local SFX_MUTE = false      -- 调试开关：true 全静音
local sfxFrame = -1         -- 上一次播声的帧号（同一帧最多一条）
local frameSeq = 0          -- OnUpdate 每帧 +1；按键回调都落在同一帧号内
local sfxCount = 0          -- 本会话已播条数（探针读数）
local function sfx(id, force)
  if SFX_MUTE or not id then return false end
  -- frameSeq == 0 表示 OnUpdate 还一次没跑（真机上若不派发就别把音全吞了）⇒ 此时不做帧闸
  if not force and frameSeq > 0 and sfxFrame == frameSeq then return false end
  sfxFrame = frameSeq
  local ok, err = pcall(function() game.PlayAudio2D(id) end)
  if not ok then noteFail('PlayAudio2D', err) return false end
  sfxCount = sfxCount + 1
  return true
end

--------------------------------------------------------------------------------
-- 抖屏（2026-10-25）：2D UI 没有相机 ⇒ 抖屏 = 把所有视觉元素按同一偏移量整体平移。
-- 基准坐标在创建时存进 cellBX/cellBY/frameBX/frameBY（唯一真源，不再由字面量重算）。
-- 性能：200 格 + 4 框 × 0.18~0.28s ≈ 6~9 帧 ⇒ 1200~1800 次 SetAnchoredPosition；
--       **只在 shakeT > 0 的帧写**，抖完复位一次，平时一帧都不写。
--------------------------------------------------------------------------------
local SHAKE_DUR = { 0.18, 0.20, 0.23, 0.28 }        -- 1/2/3/4 行
local SHAKE_AMP = { 7, 10, 13, 17 }                 -- 像素；PITCH=30 ⇒ 4 行约半格
local SHAKE_FREQ = 2 * math.pi * 9                  -- 9Hz：0.2s 内约 2 个周期
local function applyShake(ox, oy)
  if not g.cells then return end        -- G[2] 数据层阶段无棋盘控件（T6b-2 建控件后自然走全路径）
  local bx = g.boardOX or 0             -- 双屏棋盘偏移（T6b-2：抖屏坐标=基准+盘偏移+抖动）
  for i = 1, #g.cells do
    local c = g.cells[i]
    if c then tryCall(c, 'SetAnchoredPosition', g.cellBX[i] + bx + ox, g.cellBY[i] + oy) end
  end
  if not g.frames then return end
  for i = 1, 4 do
    local f = g.frames[i]
    if f then tryCall(f, 'SetAnchoredPosition', g.frameBX[i] + bx + ox, g.frameBY[i] + oy) end
  end
end
-- reset=true 连坐标一起复位（抖完 / 重开 / layout 重排时用）
local function stopShake(reset)
  if reset and (g.shakeT > 0 or g.shakePhase > 0) then applyShake(0, 0) end
  g.shakeT, g.shakePhase = 0, 0
end
local function startShake(rows)
  if rows < 1 then return end
  if rows > 4 then rows = 4 end
  g.shakeDur, g.shakeAmp = SHAKE_DUR[rows], SHAKE_AMP[rows]
  g.shakeT, g.shakePhase = g.shakeDur, 0
  print('shake rows=' .. rows .. ' amp=' .. g.shakeAmp .. ' dur=' .. g.shakeDur)
end

-- 服务端 textbox 按名字取；某个控件缺失不应炸整段 OnStart（真机与模拟器控件集可能不同）
local function find(name)
  if not root then return nil end
  local ok, ctl = pcall(function() return root:GetChild(name) end)
  if ok then return ctl end
  return nil
end

local function setText(ctl, value)
  if ctl then trySet(ctl, 'text', value) end
end

-- 手机按钮：标签是服务端 textbox（bgColor 当底），点击热区是客户端 cursor 实例（透明，叠在上面）
local BUTTONS = {
  -- 三行按钮：最下一行留 18px 离画布底边（-332 时整块贴边被裁，实测）
  { name = 'btnA', label = '←',    x = -410, y = -185 },
  { name = 'btnB', label = '→',    x = -410, y = -250 },
  { name = 'btnC', label = '↓',    x = -410, y = -315 },
  { name = 'btnD', label = '旋转', x =  410, y = -185 },
  { name = 'btnE', label = '直落', x =  410, y = -250 },
  { name = 'btnF', label = '重开', x =  410, y = -315 },
}
local BTN_W, BTN_H = 150, 56
local hits = {}

-- 文字样式：真机 GIL 里新建的控件没有样式（CLI 只建骨架），全部由 Lua 运行时设置。
-- 框高判据：h >= fontSize*1.45 + 4（见 docs/README §10.2），尺寸在 layout() 里给。
local C_TEXT, C_GOLD2, C_ACCENT2, C_DANGER, C_BTN =
  C(255, 214, 232, 246), C(255, 255, 194, 76), C(255, 118, 214, 255),
  C(255, 255, 77, 77), C(179, 26, 29, 38)
local UI_STYLE = {
  title     = { font = 64, color = C_GOLD2,   align = 'Middle' },
  hud       = { font = 20, color = C_ACCENT2, align = 'Middle' },
  hudNext   = { font = 22, color = C_ACCENT2, align = 'Middle' },
  best      = { font = 20, color = C_GOLD2,   align = 'Middle' },
  hint      = { font = 22, color = C_ACCENT2, align = 'Middle', valign = 'Middle' },
  keyA      = { font = 22, color = C_TEXT,    align = 'Middle' },
  keyB      = { font = 22, color = C_TEXT,    align = 'Middle' },
  keyC      = { font = 22, color = C_TEXT,    align = 'Middle' },
  topBanner = { font = 34, color = C_GOLD2,   align = 'Middle', valign = 'Middle' },
  botBanner = { font = 22, color = C_ACCENT2, align = 'Middle', valign = 'Middle' },
  btnA = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnB = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnC = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnD = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnE = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnF = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
}
local function applyStyle(name, ctl)
  local st = UI_STYLE[name]
  if not ctl or not st then return end
  if st.font then trySet(ctl, 'fontSize', st.font) end
  if st.color then trySet(ctl, 'fontColor', st.color) end
  if st.bg then trySet(ctl, 'bgColor', st.bg) end
  if st.align then trySet(ctl, 'horizontalAlignment', st.align) end
  if st.valign then trySet(ctl, 'verticalAlignment', st.valign) end
end

-- 按候选 guid 探测模板：needCursor=true 要求该控件具备光标事件方法（cursor/button）
local function probeTemplate(candidates, needCursor)
  for _, g in ipairs(candidates) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okFn, fn = pcall(function() return ctl.AddCursorEventListener end)
      local isCursor = okFn and type(fn) == 'function'
      if isCursor == needCursor then return ctl, g end
      pcall(function() game.DestroyClientUIControl(ctl) end)
    end
  end
  return nil, nil
end

--------------------------------------------------------------------------------
-- 结算层（2026-10-24 第三轮）：整套结算界面是**运行时实例化出来的一层**，不复用布局横幅。
-- 为什么必须单独一层：布局里的服务端 textbox 层级低于运行时实例（200 个棋盘格永远在上面），
-- 文字只要落在棋盘区域就会被吃掉（第二轮踩过：用 cell 遮罩盖文字，文字没了）。
-- 做法：整棵实例化客户端控件模板（容器 + 子 textbox），再往这层里塞 2 个 image 实例
--      （cell 模板）当「全屏遮罩」与「面板底」——它们同在实例层，压得住棋盘。
-- 兼容：模拟器模板 = build.mjs 里的 settle（子控件名 settleTitle/…）；
--      真机模板 = 地图里已有的「控件模板:客户端控件容器_1」（子控件名 title/hud/best/hint/botBanner）
--      ⇒ 取控件一律走「候选名列表」，两宿主同一份代码。
--------------------------------------------------------------------------------
local function instInto(candidates, parent, needCursor)
  for _, g in ipairs(candidates) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, parent) end)
    if ok and ctl then
      if needCursor == nil then return ctl end
      local okFn, fn = pcall(function() return ctl.AddCursorEventListener end)
      if (okFn and type(fn) == 'function') == needCursor then return ctl end
      pcall(function() game.DestroyClientUIControl(ctl) end)
    end
  end
  return nil
end

local function findIn(node, names)
  if not node then return nil end
  for _, n in ipairs(names) do
    local ok, child = pcall(function() return node:GetChild(n) end)
    if ok and child then return child end
  end
  return nil
end

-- 销毁整层：SetVisible(false) 在真机不保险（实测重开后结算页还在），所以重开就真销毁。
-- 逐个 pcall：真机某个控件销毁抛错不能中断后面（同 OnStart 的护栏思路）。
settleDestroy = function()
  if not (g.settleReady or g.settleLayer or g.settleTitle) then return end
  local n = 0
  local members = settleMembers()
  for i = 1, 9 do
    local ctl = members[i]
    if ctl then
      local ok = pcall(function() game.DestroyClientUIControl(ctl) end)
      if ok then n = n + 1 end
    end
  end
  if g.settleLayer then
    local ok = pcall(function() game.DestroyClientUIControl(g.settleLayer) end)
    if ok then n = n + 1 end
  end
  g.settleLayer, g.settleScrim, g.settleCard, g.settleBorder = nil, nil, nil, nil
  g.settleTitle, g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts = nil, nil, nil, nil, nil, nil
  g.settleReady, g.settleBuildTried = false, false
  g.settleOn, g.settleT, g.settleDone, g.settleFade = false, 0, false, -1
  print('settle destroy n=' .. n)
end

-- 真结算：把「游戏结束」发成服务端信号 tetris_settle —— 地图 hl 里的服务端图 1082130480
-- 收到后「设玩家结算状态 = Victory」→「结算关卡」，弹出官方结算页。
-- 真机是否有 game.ServerSignal 事先未知，所以两种形态都 pcall 探测、结果逐条打日志：
--   ① game.ServerSignal.send('名')             —— 本轮任务单给的形态
--   ② game.ServerSignal('名'):SendSignal()     —— 模拟器 Lua 桥的工厂形态（D112 实测）
-- 两种都失败 ⇒ 本机 Lua 无信号通道，退出改法（Q 退回原来的「结算明细」开关，按键不失效）。
local settleSignalState = 'unknown'   -- 'unknown' | 'sent' | 'none'
local function sendSettleSignal()
  local ok, err = pcall(function() game.ServerSignal.send('tetris_settle') end)
  if ok then
    settleSignalState = 'sent'
    print('settle signal sent')
    return true
  end
  print('settle signal FAILED :: ' .. tostring(err))
  local ok2, err2 = pcall(function() game.ServerSignal('tetris_settle'):SendSignal() end)
  if ok2 then
    settleSignalState = 'sent'
    print('settle signal sent (factory form)')
    return true
  end
  print('settle signal FAILED (factory form) :: ' .. tostring(err2))
  settleSignalState = 'none'
  return false
end

-- 每个结算槽位在"容器模板"里的候选子控件名（模拟器的 settle 模板 / 真机的 客户端控件容器_1 两套命名）
local SETTLE_KEY_NAMES = {
  title = { 'settleTitle', 'title' },
  score = { 'settleScore', 'hud' },
  best  = { 'settleBest', 'best' },
  info  = { 'settleInfo', 'hint' },
  extra = { 'settleExtra', 'keyA' },
  opts  = { 'settleOpts', 'botBanner' },
}

-- 按 kind 分类子控件（typeof 返回的是 ClientUIImageControl / ClientUITextBoxControl /
-- ClientUIContainerControl 这类名字；**不按控件名挑**——编辑器新建的容器模板子件就叫「图片/文本框/容器节点」）
local function classifyKids(ctl)
  local out = { image = {}, text = {}, container = {} }
  if not ctl then return out end
  local ok, kids = pcall(function() return ctl:GetChildren() end)
  if not (ok and type(kids) == 'table') then return out end
  for i = 1, #kids do
    local kid = kids[i]
    local okT, t = pcall(function() return typeof(kid) end)
    local low = (okT and type(t) == 'string') and string.lower(t) or ''
    if string.find(low, 'image') then
      out.image[#out.image + 1] = kid
    elseif string.find(low, 'text') then
      out.text[#out.text + 1] = kid
    elseif string.find(low, 'container') then
      out.container[#out.container + 1] = kid
    end
  end
  return out
end

-- ① 容器整棵实例化：逐条候选打印结果（真机 2026-10-24 实证容器组返回 nil，所以这里是排查主入口）
local function probeSettleContainer()
  for _, g in ipairs(TPL_GUIDS.settle) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okc, kids = pcall(function() return ctl:GetChildren() end)
      local n = (okc and type(kids) == 'table') and #kids or -1
      local cls = classifyKids(ctl)
      print('settle try tpl=' .. g .. ' -> ok kids=' .. n
        .. ' img=' .. #cls.image .. ' text=' .. #cls.text .. ' cont=' .. #cls.container
        .. ' title=' .. tostring(findIn(ctl, SETTLE_KEY_NAMES.title) ~= nil)
        .. ' opts=' .. tostring(findIn(ctl, SETTLE_KEY_NAMES.opts) ~= nil))
      -- 按**结构**判定可用：有 figure 也行（图片=面板底、文本框=至少一行字）
      if (#cls.text >= 1) then return ctl, cls end
      -- 名字命中的老模板（模拟器 settle / 真机上一版容器）也接受
      if findIn(ctl, SETTLE_KEY_NAMES.title) and findIn(ctl, SETTLE_KEY_NAMES.opts) then
        return ctl, cls
      end
      pcall(function() game.DestroyClientUIControl(ctl) end)   -- 不命中别留垃圾
    else
      print('settle try tpl=' .. g .. ' -> nil')
    end
  end
  return nil, nil
end

-- ② 单控件（textbox）模板：只探 guid（探针实例用完就销毁——否则它先造出来会被后造的遮罩盖住）
local function probeSettleTextbox()
  for _, g in ipairs(TPL_GUIDS.settleText) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okc, kids = pcall(function() return ctl:GetChildren() end)
      print('settle try text tpl=' .. g .. ' -> ok kids='
        .. ((okc and type(kids) == 'table') and #kids or -1))
      pcall(function() game.DestroyClientUIControl(ctl) end)
      return g
    end
    print('settle try text tpl=' .. g .. ' -> nil')
  end
  return nil
end

local function buildSettleLayer()
  local container, cls = probeSettleContainer()
  local textGuid                       -- 文字模板 guid（容器里文字不够时补行用）
  local sl = {}                        -- 六个文字槽位，按顺序分配
  if container then
    g.settleLayer = container
    -- 先按现在这套模板的名字取（模拟器 settle / 早期真机容器）
    sl[1] = findIn(container, SETTLE_KEY_NAMES.title)
    sl[2] = findIn(container, SETTLE_KEY_NAMES.score)
    sl[3] = findIn(container, SETTLE_KEY_NAMES.best)
    sl[4] = findIn(container, SETTLE_KEY_NAMES.info)
    sl[5] = findIn(container, SETTLE_KEY_NAMES.extra)
    sl[6] = findIn(container, SETTLE_KEY_NAMES.opts)
    -- 名字取不到 ⇒ 按结构取：编辑器新建的容器模板子件就叫「图片/文本框/容器节点」
    if cls then
      for i = 1, 6 do
        if not sl[i] and cls.text[i] then sl[i] = cls.text[i] end
      end
      if cls.image[1] then g.settleCard = cls.image[1] end
    end
    print('settle via=container kids=' .. ((cls and (#cls.image + #cls.text + #cls.container)) or 0)
      .. ' img=' .. ((cls and #cls.image) or 0) .. ' text=' .. ((cls and #cls.text) or 0)
      .. ' cont=' .. ((cls and #cls.container) or 0))
  end
  -- 文字模板 guid（容器占位框替换与补行都要用）
  local textGuid = probeSettleTextbox()
  -- 六个槽位里还缺的，用文字模板补（真机容器只有 1 个文本框，要补 5 个；全是容器最省）
  local missing = 0
  for i = 1, 6 do
    if not sl[i] then missing = missing + 1 end
  end
  if missing > 0 then
    if textGuid then
      for i = 1, 6 do
        if not sl[i] then
          local ok, c = pcall(function() return game.InstantiateClientUIControl(textGuid, root) end)
          if ok and c then sl[i] = c end
        end
      end
      print('settle via=textbox guid=' .. tostring(textGuid) .. ' filled=' .. missing)
    end
  end
  -- 容器自带的那个 textbox 在真机上是编辑器默认占位（会显示一个大「？」），
  -- 而 SetVisible(false) 对运行时实例不生效、藏不住 ⇒ 直接销毁它，文字全部走文字模板。
  if cls and cls.text[1] and sl[1] == cls.text[1] then
    pcall(function() game.DestroyClientUIControl(sl[1]) end)
    sl[1] = nil
    local ok2, c = pcall(function() return game.InstantiateClientUIControl(textGuid, root) end)
    if ok2 and c then sl[1] = c end
    print('settle container-textbox replaced (placeholder removed)')
  end
  g.settleTitle, g.settleScore, g.settleBest = sl[1], sl[2], sl[3]
  g.settleInfo, g.settleExtra, g.settleOpts = sl[4], sl[5], sl[6]
  -- 遮罩：cell image（两宿主都能实例化）；它必须画在**所有东西下面** ⇒ 造完挪到根的第一个子节点
  if g.settleTitle then
    g.settleScrim = instInto(TPL_GUIDS.cell, root, nil)
    tryCall(g.settleScrim, 'SetAsFirstSibling')
  end
  -- 面板底：容器自带图片就用它，否则用 cell 现造一块
  if g.settleTitle and not g.settleCard then g.settleCard = instInto(TPL_GUIDS.cell, root, nil) end
  if not g.settleLayer and g.settleCard then tryCall(g.settleCard, 'SetAsFirstSibling') end
  if not (g.settleTitle and g.settleOpts) then
    -- 全部候选都不可实例化 ⇒ 清掉半成品，让 showGameOver 走布局横幅
    local members = settleMembers()
    for i = 1, 9 do
      if members[i] then pcall(function() game.DestroyClientUIControl(members[i]) end) end
    end
    if g.settleLayer then pcall(function() game.DestroyClientUIControl(g.settleLayer) end) end
    g.settleLayer, g.settleScrim, g.settleCard, g.settleBorder = nil, nil, nil, nil
    g.settleTitle, g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts = nil, nil, nil, nil, nil, nil
    g.settleReady = false
    print('settle layer=none  (所有候选模板都不可实例化 ⇒ 退化为布局横幅结算)')
    return
  end
  g.settleReady = true
  local okKids, kids = pcall(function() return (g.settleLayer or root):GetChildren() end)
  print('settle layer ok children=' .. ((okKids and type(kids) == 'table') and #kids or 0)
    .. ' title=' .. (g.settleTitle and 'y' or 'n') .. ' score=' .. (g.settleScore and 'y' or 'n')
    .. ' best=' .. (g.settleBest and 'y' or 'n') .. ' info=' .. (g.settleInfo and 'y' or 'n')
    .. ' opts=' .. (g.settleOpts and 'y' or 'n')
    .. ' scrim=' .. (g.settleScrim and 'y' or 'n') .. ' card=' .. (g.settleCard and 'y' or 'n'))
  -- 样式显式写死（真机模板是上一轮导入的旧值，不能依赖 authoring）
  for _, ctl in ipairs({ g.settleTitle, g.settleScore, g.settleBest, g.settleInfo, g.settleExtra, g.settleOpts }) do
    -- 这 6 个在下面要么都取到、要么整层判失败，用 ipairs 无风险
    trySet(ctl, 'horizontalAlignment', 'Middle')
    trySet(ctl, 'verticalAlignment', 'Middle')
    trySet(ctl, 'bgColor', C(0, 0, 0, 0))
  end
  trySet(g.settleTitle, 'fontSize', 44)
  trySet(g.settleScore, 'fontSize', 30)
  trySet(g.settleBest, 'fontSize', 24)
  trySet(g.settleInfo, 'fontSize', 22)
  trySet(g.settleExtra, 'fontSize', 22)
  trySet(g.settleOpts, 'fontSize', 28)
  settleSetColors(0)
  -- 懒创建：层刚建好就直接进入动画起点（不隐藏，也不留"隐藏态"给真机去误解）
  local n = 0
  local members = settleMembers()
  for i = 1, 9 do
    if members[i] then n = n + 1 end
  end
  print('settle build ok n=' .. n .. ' via=' .. (g.settleLayer and 'container' or 'textbox'))
  layoutSettle(CANVAS_W, CANVAS_H)   -- 懒创建：建完立刻摆位（此时 layout 早就跑过了）
end

-- 结算层文字颜色（alpha 随面板淡入；a 是 0..255）
settleSetColors = function(a)
  local dimA = math.floor(a * 0.72)
  trySet(g.settleTitle, 'fontColor', C(a, 255, 77, 77))
  trySet(g.settleScore, 'fontColor', C(a, 255, 194, 76))
  trySet(g.settleBest, 'fontColor', C(a, 232, 236, 244))
  trySet(g.settleInfo, 'fontColor', C(dimA, 214, 232, 246))
  trySet(g.settleExtra, 'fontColor', C(dimA, 214, 232, 246))
  trySet(g.settleOpts, 'fontColor', C(a, 232, 236, 244))
end

-- 结算动画（0→0.9s 四段）：①0→0.45s 遮罩/面板淡入（棋盘被压到 45% 亮度）
-- ②0.15s 起标题自上滑入（0.35s ease-out）③0.35s 起选项自下滑入 ④0.55s 起标题脉冲 44→48→44
local function settleTick(d)
  if not g.settleOn or g.settleDone then return end
  g.settleT = g.settleT + d
  local t = g.settleT
  local r1 = t / 0.45
  if r1 > 1 then r1 = 1 end
  if math.abs(r1 - g.settleFade) >= 0.05 or (r1 >= 1 and g.settleFade < 1) then
    g.settleFade = r1
    settleSetColors(math.floor(255 * r1))     -- 只动文字颜色 alpha（真机验证过的通道）
    if not g.settleReady then
      -- 兜底（没有结算层）：压暗棋盘本身
      g.dimRatio = 0.45 * r1
      g.dimApplied = r1
      renderAll()
    end
  end
  local e = function(p)
    if p <= 0 then return 0 end
    if p >= 1 then return 1 end
    return 1 - (1 - p) * (1 - p)            -- ease-out quad
  end
  local p2 = e((t - 0.15) / 0.35)
  if p2 > 0 then
    tryCall(g.settleTitle, 'SetAnchoredPosition', 0, g.settleTitleOff + (g.settleTitleY - g.settleTitleOff) * p2)
  end
  local p3 = e((t - 0.35) / 0.35)
  if p3 > 0 then
    tryCall(g.settleOpts, 'SetAnchoredPosition', 0, g.settleOptsOff + (g.settleOptsY - g.settleOptsOff) * p3)
  end
  local p4 = (t - 0.55) / 0.3
  if p4 > 0 and p4 < 1 then
    local size = 44 + math.floor(4 * math.sin(math.pi * p4) + 0.5)
    if size ~= g.settleSize then g.settleSize = size trySet(g.settleTitle, 'fontSize', size) end
  elseif p4 >= 1 and g.settleSize ~= 44 then
    g.settleSize = 44
    trySet(g.settleTitle, 'fontSize', 44)
  end
  if t >= 0.9 then
    g.settleDone = true
    tryCall(g.settleTitle, 'SetAnchoredPosition', 0, g.settleTitleY)
    tryCall(g.settleOpts, 'SetAnchoredPosition', 0, g.settleOptsY)
    trySet(g.settleTitle, 'fontSize', 44)
    print('settle anim done')
  end
end

-- 兜底压暗（只在结算层不可用时用）：已落方块按比例降到 45% 亮度。
-- 必须做在 renderAll 里而不是只做一次——renderPiece/renderAll 每次重绘都会用 board 原色覆盖。
local function dimColor(v, ratio)
  local k = 100 - math.floor(45 * ratio)
  local a = v // 16777216
  local rr = (v // 65536) % 256
  local gg = (v // 256) % 256
  local bb = v % 256
  return C(a, rr * k // 100, gg * k // 100, bb * k // 100)
end

renderAll = function()
  for r = 1, ROWS do
    for c = 1, COLS do
      local v = g.board[r][c]
      if v == 0 then paint(r, c, COL_EMPTY)
      elseif g.dimRatio > 0 then paint(r, c, dimColor(v, g.dimRatio))
      else paint(r, c, v) end
    end
  end
end

local function renderNext()
  if not g.preview or not g.preview[5] then return end
  for i = 1, 8 do g.preview[i].imageColor = COL_BG end
  if g.gameOver or not g.nextName then return end
  local s = SHAPES[g.nextName]
  for i = 1, 4 do
    local ctl = g.preview[i]
    local r, c = s.cells[i][1], s.cells[i][2]
    ctl:SetAnchoredPosition(RIGHT_CX + (c - 2.5) * 20, 150 + (2.5 - r) * 20)
    ctl.imageColor = s.color
  end
  -- T2：第二块预览 = bagQ 队头（下下块）。缩 14px、55% 亮度、排第一块下方（中心 y=78）。
  -- bagQ 只读不取——渲染永不改出块序列（refill 只发生在 takeFromBag 内）。
  local e2 = g.bagQ[1]
  if e2 then
    local s2 = SHAPES[e2.name]
    for i = 1, 4 do
      local ctl = g.preview[4 + i]
      local r, c = s2.cells[i][1], s2.cells[i][2]
      ctl:SetAnchoredPosition(RIGHT_CX + (c - 2.5) * 14, 78 + (2.5 - r) * 14)
      ctl.imageColor = dimColor(s2.color, 1)
    end
  end
  -- T3 Hold 槽（preview[9..12]，左栏镜像位；空槽=底色，canHold=false 时 55% 亮度提示本落子已用掉）
  if g.preview[9] then
    for i = 9, 12 do g.preview[i].imageColor = COL_BG end
    if g.st.name then
      local sh = SHAPES[g.st.name]
      for i = 1, 4 do
        local ctl = g.preview[8 + i]
        local r, c = sh.cells[i][1], sh.cells[i][2]
        ctl:SetAnchoredPosition(-RIGHT_CX + (c - 2.5) * 20, 150 + (2.5 - r) * 20)
        ctl.imageColor = g.st.can and sh.color or dimColor(sh.color, 1)
      end
    end
  end
end

renderHud = function()
  -- T6b-2 双屏：G[2]（AI/对家盘）战况写右栏 keyA-C（服务端单份控件征用，零新建）；
  -- G[1] 保持 hud 主行（前缀 P1）。
  if g ~= G[1] then
    setText(keyA, MODE == 'pvp' and 'P2 盘' or 'AI 盘')
    setText(keyB, '得分 ' .. g.score .. '　消行 ' .. g.lines)
    setText(keyC, '等级 ' .. g.level .. '　落块 ' .. g.pieceCount)   -- v2.1 ④：对家战况加块数
    renderNext()
    return
  end
  local oc = 0
  for r = 1, ROWS do
    for c = 1, COLS do
      if g.board[r][c] ~= 0 then oc = oc + 1 end
    end
  end
  -- T4：stage0 = 入场 AI 自演，HUD 显示 AI 局账本（分数随 AI 消行增长）；接管后显示玩家账
  local s, l = g.score, g.lines
  if guideStage == 0 then s, l = g.AI.score, g.AI.lines end
  setText(hud, '得分 ' .. s .. '　消行 ' .. l .. '　等级 ' .. g.level
    .. '　已填 ' .. oc)
  setText(hudNext, '下一个')
  setText(best, '最高 ' .. bestScore)
  renderNext()
end

renderPiece = function()
  renderAll()
  if g.gameOver or not g.piece then return end
  for i = 1, 4 do
    local br = g.piece.y + g.piece.cells[i][1] - 1
    local bc = g.piece.x + g.piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      paint(br, bc, g.piece.color)
    end
  end
end

collides = function(cs, px, py)
  for i = 1, #cs do
    local br = py + cs[i][1] - 1
    local bc = px + cs[i][2] - 1
    if bc < 1 or bc > COLS or br > ROWS then return true end
    if br >= 1 and g.board[br][bc] ~= 0 then return true end
  end
  return false
end

spawn = function(overrideName, overrideBag)
  -- overrideName/overrideBag：Hold 换出的块走这里（不消耗 bag 队列、沿用入槽时的袋序，
  -- 日志加 holdswap=1 尾标供用例区分自然出块与槽换出块）；自然出块（无参）才 takeFromBag。
  local name = overrideName or g.nextName or 'T'
  local nameBag = overrideBag or g.nextBag          -- 当前块所属袋序（出块日志 bag=<袋序>）
  if not overrideName then g.nextName, g.nextBag = takeFromBag() end
  local s = SHAPES[name]
  g.piece = {
    name = name, n = s.n, color = s.color,
    cells = { { s.cells[1][1], s.cells[1][2] }, { s.cells[2][1], s.cells[2][2] },
              { s.cells[3][1], s.cells[3][2] }, { s.cells[4][1], s.cells[4][2] } },
    x = (COLS - s.n) // 2 + 1,
    y = 1,
  }
  print('bag=' .. (nameBag or 0) .. ' piece=' .. name .. ' x=' .. g.piece.x .. ' y=' .. g.piece.y
    .. (overrideName and ' holdswap=1' or ''))
  g.ld.t, g.ld.resets, g.lastRot = -1, 0, false   -- T8：新块清锁定延迟与旋转标记
  if collides(g.piece.cells, g.piece.x, g.piece.y) then
    g.gameOver = true
    print('gameover score=' .. g.score)
    sfx(SFX.over, true)          -- 结束音（结算页滑入的同时播）
    -- 入场自演顶死时不写最高分：bestScore 是玩家账（与 P0 同一口径，docs §7.1）
    if not g.autoDriving then updateBest() end
    showGameOver()
  end
  -- T6b ai-battle 出块镜像队列（同源同序，裁决④）：主盘自然出块 push；AI 盘 piece 空时立即喂、
  -- AI 盘 doLock 后拉。队列保序 ⇒ 任意节奏不覆盖不丢块；AI 盘快过主盘时 piece=nil 空转等待。
  -- 跨实例交互铁律（设计书 §1.8 Step3 ②）：切实例前保存 g → 操作 → 还原。
  if G[2] and g == G[1] and not overrideName then
    MIRRORQ[#MIRRORQ + 1] = { name = name, bag = nameBag }
    if G[2] and not G[2].gameOver and not G[2].piece then feedMirror() end
  end
  renderPiece()
  renderHud()
end

clearLines = function()
  local cleared = 0
  local r = ROWS
  while r >= 1 do
    local full = true
    for c = 1, COLS do
      if g.board[r][c] == 0 then full = false end
    end
    if full then
      table.remove(g.board, r)
      local row = {}
      for c = 1, COLS do row[c] = 0 end
      table.insert(g.board, 1, row)
      cleared = cleared + 1
      -- 不递减 r：删除并把空行插到顶部后，原 r-1 行已落到索引 r，要再判一次
    else
      r = r - 1
    end
  end
  if cleared > 0 then
    -- 视觉反馈：整盘已落方块闪白（按行数分档：1 行 0.10s → 4 行 0.22s，恒短于抖屏时长）
    for r2 = 1, ROWS do
      for c2 = 1, COLS do
        if g.board[r2][c2] ~= 0 then paint(r2, c2, C(255, 245, 250, 255)) end
      end
    end
    g.flashT = NUM.FLASH[cleared] or NUM.FLASH[4]
    -- 计分（docs/数值策划.md §2）：基础分 × 等级 + 连击加成；四消连击（B2B）基础分再 ×1.5。
    -- 连击口径：连续"有消行的锁定"计数，combo=1 是第一次，≥2 才给加成；没消行的锁定归零（见 doLock）
    g.combo = g.combo + 1
    if g.combo > g.maxCombo then g.maxCombo = g.combo end
    local base = NUM.SCORE[cleared]
    local b2bApplied = (cleared == 4 and g.b2b)     -- 这一次是否吃到 ×1.5（日志里 b2b=1 表示吃到了）
    if b2bApplied then base = base * NUM.B2B_NUM // NUM.B2B_DEN end   -- 800 → 1200
    g.b2b = (cleared == 4)
    local comboBonus = 0
    if g.combo >= 2 then comboBonus = NUM.COMBO * (g.combo - 1) * g.level end
    -- T4 两套账本：AI 自演的分进 aiScore（玩家接管不清、best 不收）；玩家分进 score。
    -- 连击/B2B 状态共享，但 startIfWaiting/newGame 都归零 ⇒ AI 的连击不会漏进玩家局。
    local gain = base * g.level + comboBonus
    if g.autoDriving then g.AI.score = g.AI.score + gain else g.score = g.score + gain end
    if g.autoDriving then g.AI.lines = g.AI.lines + cleared else g.lines = g.lines + cleared end
    if g.autoDriving then RHO.lines = RHO.lines + cleared end   -- T5 ρ 统计跨局累计（newGame 不清）
    local levelBefore = g.level
    g.level = g.lines // NUM.LEVEL_UP_LINES + 1
    if g.level > NUM.LEVEL_CAP then g.level = NUM.LEVEL_CAP end          -- 到顶不再加速（速度表只有 12 档）
    -- T7 垃圾行（v2-plan §三/设计书 §四）：双屏模式 2/3/4 消送对方盘 1/2/4 行（B2B 再 +1）。
    -- 送出方向：g == G[1] → 送 G[2]，反之亦然（ai-battle/coop 人↔AI、pvp 玩家互送）。
    if cleared >= 2 and G[2] then
      local other = (g == G[1]) and G[2] or G[1]
      raiseGarbage(other, NUM.GARBAGE[cleared] + (b2bApplied and 1 or 0))
      sfx(SFX.garbageSend, true)     -- 送出音（攻方反馈；force 防同帧被消行音吞，D619 教训）
    end
    -- 视听反馈：消行音（按行数换 id）+ 抖屏（行数越多越强，1 行 0.18s / 4 行 0.28s）
    -- T4：AI 自演同样出声、同样抖屏——统一走这一条链路，不再有静音旁路
    sfx(SFX_CLEAR[cleared], true)
    startShake(cleared)
    if g.autoDriving then
      g.AI.fx = 0.5   -- v2.1 C：AI 演示视觉反馈（浏览器 autoplay 锁下音效听不到——分数弹跳放大）
      print('demo clear n=' .. cleared .. ' aiScore=' .. g.AI.score .. ' aiLines=' .. g.AI.lines
        .. ' combo=' .. g.combo .. ' b2b=' .. (b2bApplied and 1 or 0))   -- 自演心跳（AI 账本口径）
    else
      print('clear n=' .. cleared .. ' score=' .. g.score .. ' lines=' .. g.lines
        .. ' combo=' .. g.combo .. ' b2b=' .. (b2bApplied and 1 or 0))
    end
    -- 首次消行：由简入深——把"分值表"这项进阶信息押到玩家已经会消行之后
    -- （入场 AI 自演期间的消行不算，否则玩家真正上手时这条引导已经被吃掉）
    if not g.taughtClear and not g.autoDriving then
      g.taughtClear = true
      setText(hint, '一次消 4 行 +800')
      setText(botBanner, '空格 直落到底')
      bannerTimer = 4.0
      print('guide clear-tip')
    end
    -- 升级 / 连击提示（走 botBanner；HUD 不加第 5 字段——22 号字尾部会被裁，docs §8.1）
    -- 优先级：升级 > 连击；已有横幅在播时让位（bannerTimer > 0 不抢）
    if not g.autoDriving and bannerTimer <= 0 then
      if g.level > levelBefore then
        setText(botBanner, g.level >= NUM.LEVEL_CAP and ('等级 ' .. g.level .. '　已满速')
                                           or ('等级 ' .. g.level .. '　速度提升'))
        bannerTimer = NUM.LEVEL_TIP
        sfx(SFX.level, true)          -- 升级音（force：与其他音效同帧也不吞）
        print('tip level=' .. g.level)
      elseif g.combo >= 2 then
        setText(botBanner, '连击 ×' .. g.combo)
        bannerTimer = NUM.COMBO_TIP
        print('tip combo=' .. g.combo)
      end
    end
  end
  return cleared   -- 调用方（doLock）用它决定"落地音还是消行音"
end

doLock = function()
  -- T8 T-spin 判定（在写入盘面前做——角占用看的是锁定前盘面+本块无关）：
  -- 3 角规则=T 块 + 最后动作是旋转（g.lastRot）+ 包围盒四角中被占（出界或已填）≥3。
  local isTspin = false
  if g.piece.name == 'T' and g.lastRot then
    local corners = { { 1, 1 }, { 1, 3 }, { 3, 1 }, { 3, 3 } }
    local occ = 0
    for i = 1, 4 do
      local cr = g.piece.y + corners[i][1] - 1
      local cc = g.piece.x + corners[i][2] - 1
      if cr < 1 or cr > ROWS or cc < 1 or cc > COLS or g.board[cr][cc] ~= 0 then occ = occ + 1 end
    end
    if occ >= 3 then isTspin = true end
  end
  for i = 1, 4 do
    local br = g.piece.y + g.piece.cells[i][1] - 1
    local bc = g.piece.x + g.piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      g.board[br][bc] = g.piece.color
    end
  end
  local landed = {}
  for i = 1, 4 do
    local br = g.piece.y + g.piece.cells[i][1] - 1
    local bc = g.piece.x + g.piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS then landed[#landed + 1] = (br - 1) * COLS + bc end
  end
  g.pieceCount = g.pieceCount + 1
  print('lock ' .. g.piece.name .. ' cells=' .. table.concat(landed, ','))
  g.st.can = true    -- T3：锁定后恢复 Hold 可用（每次落子仅可换一次）
  g.ld.t, g.ld.resets = -1, 0     -- T8：锁定延迟复位（下一块重新计）
  g.lastRot = false
  g.das.t, g.das.arr = 0, 0  -- T8：DAS 计时归零（按住方向跨块继续）。steps 不随块复位——跨块累计才能兜「Up 丢失」（单块最多 8-9 格到不了 12）；Down/换向时归零
  local cleared = clearLines()
  if isTspin then
    -- T-spin 加成（v2-plan §三 T8）：bonus = 400 × 消行数 × level；0 行无分但有声光提示。
    -- 分流玩家/AI 账本（与 clearLines 同口径：autoDriving 时入 AI.score）。
    local bonus = NUM.TSPIN_BONUS * cleared * g.level
    if bonus > 0 then
      if g.autoDriving then g.AI.score = g.AI.score + bonus else g.score = g.score + bonus end
    end
    print('tspin corners>=3 lines=' .. cleared .. ' bonus=' .. bonus)
    sfx(SFX.tspin, true)
    if not g.autoDriving then
      bannerTimer = NUM.COMBO_TIP
      setText(botBanner, 'T-SPIN ' .. (cleared > 0 and (cleared .. ' 消 +' .. bonus) or '!'))
    end
  end
  if cleared == 0 then
    g.combo = 0     -- 没消行的锁定打断连击（连击只在"连续消行"时成立）
    g.b2b = false   -- 同样打断 B2B（连续两次四消之间不能夹空落）
  end
  -- 落地音：只有"没消行"时才播 —— 消行已经有一条更强的音，同一帧不叠两条（见 sfx 的帧闸）
  -- T4：AI 自演的落块同样播（消行音/落地音统一链路，AI 不再静音）
  if cleared == 0 then sfx(SFX.lock, true) end   -- T8 改 force：DAS 连移音与锁定可能同帧，锁
                                                 -- 定是节点性反馈，不让帧闸吞（消行/升级同例）
  -- 首次锁定：只教"堆满一行即消除"这一条，不叠加其它信息
  if not g.taughtLock and not g.autoDriving then
    g.taughtLock = true
    bannerTimer = 2.5
    print('guide lock-tip')
  end
  if not g.gameOver then
    -- T6b：AI 盘不自己取块——拉镜像队列（空则 piece=nil 空转，等主盘下一次出块喂）。
    if G[2] and g ~= G[1] then
      feedMirror()
    else
      spawn()   -- spawn 内部 renderPiece() 会重画棋盘+新方块
    end
  end
  renderHud()
end

-- 下落一格。manual=true 表示玩家自己按的（↓ / S / 手机↓）：成功下落才给软降分。
-- 重力调用必须传 false —— 否则重力会白送软降分（docs/数值策划.md §7-P6 的坑）。
-- T8 锁定延迟：重力触底不再立即 doLock——启动 NUM.LD 计时（0.5s 缓冲，玩家移动/旋转可重置，
-- 上限 15 次）；软降/硬降是玩家主动落，触底即时锁定（保持旧手感）。AI 走 aiDrop 直锁，不经这里。
local function stepDown(manual)
  if g.gameOver or not g.piece then return end
  if not collides(g.piece.cells, g.piece.x, g.piece.y + 1) then
    g.piece.y = g.piece.y + 1
    if manual then g.score = g.score + NUM.SOFT end
    renderPiece()
    print('fall y=' .. g.piece.y)
  else
    if manual then
      doLock()
    elseif g.ld.t < 0 then
      g.ld.t = 0               -- 重力触底：启动锁定延迟计时（tick 里推进，到时锁定）
      print('ldstart')            -- 观测锚：延迟计时的启动点（用例 17 断言）
    end
  end
end

-- 左右移动：键位（箭头 / WASD / 手机热区 / DAS 自动连移）共用一条路径 —— 成功才播移动音。
-- T8：成功移动重置锁定延迟（未超上限）；同时清 lastRot（T-spin 判定要求"最后动作是旋转"）。
local function moveBy(dx)
  if g.gameOver or not g.piece then return false end
  if collides(g.piece.cells, g.piece.x + dx, g.piece.y) then return false end
  g.piece.x = g.piece.x + dx
  renderPiece()
  print('move x=' .. g.piece.x)
  sfx(SFX.move)
  g.lastRot = false
  if g.ld.t >= 0 then
    if g.ld.resets < NUM.LD_RESETS then
      g.ld.resets = g.ld.resets + 1
      g.ld.t = 0                 -- 重置计时（上限内）
    else
      doLock()                     -- 超过重置上限：强制锁定（Guideline 15 次上限）
      return true
    end
  end
  return true
end

-- 顺时针 90°：(r,c) → (c, n+1-r)，盒内 1-based（n = 包围盒边长）。
-- rotate() 与入场 AI 共用同一份转法，避免两处不一致。
-- T8：成功旋转置 lastRot（T-spin 判定前置）+ 重置锁定延迟（同 moveBy 上限语义）。
local function rotateCells(cells, n)
  local out = {}
  for i = 1, 4 do out[i] = { cells[i][2], n + 1 - cells[i][1] } end
  return out
end

local function rotate()
  if g.gameOver or not g.piece then return end
  local nc = rotateCells(g.piece.cells, g.piece.n)
  if not collides(nc, g.piece.x, g.piece.y) then
    g.piece.cells = nc
    print('rotate ' .. g.piece.name)
    sfx(SFX.rotate)
    renderPiece()
    g.lastRot = true
    if g.ld.t >= 0 then
      if g.ld.resets < NUM.LD_RESETS then
        g.ld.resets = g.ld.resets + 1
        g.ld.t = 0
      else
        doLock()
      end
    end
  end
end

-- T3 Hold 暂存：当前块入槽、槽内旧块换出（走完整 spawn 链路——出生位/碰撞校验/顶死判定）。
-- 实现内联在 OnStart 键位监听（listen(NUM.HOLD_KEY, ...)）里——main 函数 200 个 local 已满，
-- 连 local function doHold 都加不进去（实测 lua5.3 报 too many local variables at :1646）；
-- 闭包体内的 local 独立计数不受 main 上限约束。
-- canHold 闸（g.st.can）：每次落子仅可换一次，doLock 重置；空槽首换=当前块入槽+bag 自然出下一块；
-- 换出块不消耗 bag 队列（spawn override 路径），入槽记录原袋序（换出日志 bag= 沿用）。

local function newGame()
  g.board = {}
  for r = 1, ROWS do
    local row = {}
    for c = 1, COLS do row[c] = 0 end
    g.board[r] = row
  end
  g.score, g.lines, g.level = 0, 0, 1
  g.AI.score, g.AI.lines = 0, 0   -- AI 局账本同样重开归零（demo reset / 玩家 R 都是"新一局"）
  g.pieceCount = 0
  g.combo, g.maxCombo, g.b2b = 0, 0, false
  g.elapsed = 0
  g.gameOver, g.tickCount, g.acc = false, 0, 0
  -- 结算层复位（R 重开必须归零：settleT/settlePhase/压暗比例，否则下一次结算从半路开始）
  g.settleOn, g.settleT, g.settleDone, g.settleFade, g.settleSize = false, 0, false, -1, 44
  g.dimRatio, g.dimApplied = 0, -1
  settleDestroy()                    -- 重开即销毁整层（不靠 SetVisible）
  stopShake(true)                    -- 重开时把抖动坐标复位（抖动中按 R 不能留歪的棋盘）
  g.bagQ, g.bagSeq = {}, 0                -- T1：每局重洗 7-bag（首袋排 S/Z 开局）
  g.st.name, g.st.bag, g.st.can = nil, 0, true   -- T3：Hold 槽每局清空、闸复位
  -- T6b：ai-battle 的 AI 盘（G[2]）不自己取块——板与状态就绪后等主盘 spawn 镜像唤醒（同源同序）。
  if G[2] and g == G[2] then
    renderHud()
    return
  end
  g.nextName, g.nextBag = takeFromBag()   -- 第一块
  spawn()                             -- spawn 内部 renderPiece() 已重画整盘+方块
  renderHud()
  if not g.autoDriving then print('newgame') end
end

--------------------------------------------------------------------------------
-- 引导状态机：0=等开始（重力暂停） 1=游戏中 2=键位表（暂停）
--------------------------------------------------------------------------------

local function showKeymap()
  -- 单行，走 1100px 宽的横幅（textbox 是否支持 \n 换行未验证，不赌）
  setText(botBanner, '← → 移动　　↑ 旋转　　↓ 落下　　空格 直落　　G 暂存　　R 重开')
  setText(hint, 'H 继续游戏')
end

local function startIfWaiting()
  if guideStage ~= 0 then return end
  if pendingMode then return end       -- v2.1 ②：模式名动画窗独占（0.5s），任意键不打断
  if helpOpen then toggleHelp() return end   -- v2.1 ③：说明层开着时任意键=先关层不开局
  guideStage = 1
  pendingMode = nil                    -- v2.1 ②：任何开局路径都清动画窗状态
  destroyMenuCards()                   -- v2.1 ②：开局销毁菜单卡片（任意键直开时卡片也要撤）
  setText(topBanner, '')
  setText(botBanner, '')
  for _, c in ipairs({ hud, best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', true) end
  trySet(topBanner, 'fontSize', 34)
  trySet(botBanner, 'fontSize', 22)
  if overlay then tryCall(overlay, 'SetVisible', false) end
  -- v2.3 ④：进局解除标题页棋盘压暗（casual 接管不 newGame，newGame 的复位段够不着这里）
  if g.dimRatio > 0 then
    g.dimRatio, g.dimApplied = 0, -1
    renderAll()
    renderPiece()
  end
  TK.state, TK.t = 'play', 0            -- T6a：进局即玩家态（菜单选模式/任意键开始同路径）
  -- v2.1 ①：双人/对抗模式先入引导态（键位说明+任意键+3-2-1），casual 保持直进（旧用例语义）。
  -- v2.2 ①：键位说明分列两盘正下方（P1 左 keyA / P2 右 keyB，y=-318 棋盘外区域——
  -- 不再横跨棋盘被格子压住；服务端 textbox 层级低于运行时棋盘格，文案必须放棋盘投影区之外）。
  if MODE ~= 'casual' then
    guideStage = 3
    GK.phase, GK.t, GK.count = 'keys', 0, 3
    local keys2 = (MODE == 'coop')
      and 'P1：W 旋转 · G 暂存'
      or 'P1：A D 移动 · W 旋转 · S 软降 · 空格 直落 · G 暂存'
    local keys2b = (MODE ~= 'coop')
      and 'P2：← → 移动 · ↑ 旋转 · ↓ 软降 · X 直落 · F 暂存'
      or 'P2：← → 移动 · ↓ 软降 · X 直落'
    setText(topBanner, (MODE_TITLE[MODE] or MODE) .. ' · 按任意键准备')
    setText(botBanner, '')
    trySet(keyA, 'fontSize', 20)
    tryCall(keyA, 'SetSizeDelta', 520, 40)
    tryCall(keyA, 'SetAnchoredPosition', -280, -318)
    setText(keyA, keys2)
    trySet(keyB, 'fontSize', 20)
    tryCall(keyB, 'SetSizeDelta', 520, 40)
    tryCall(keyB, 'SetAnchoredPosition', 280, -318)
    setText(keyB, keys2b)
    setText(hint, '')
    print('guide keys ' .. MODE)        -- v2.1 ① 引导锚
    return
  end
  -- P0/T4：玩家账本从 0 开始。AI 自演的分已走 aiScore 账（clearLines 分流），这里归零 score
  -- 是双保险（防未来某条 AI 路径漏改）；aiScore/aiLines 不动——玩家接管**不清 AI 局成绩**（模式语义）。
  -- 连击/B2B/落块数是共享局内状态，接管即归零 ⇒ AI 的连击不会带进玩家局。
  g.score, g.lines, g.level = 0, 0, 1
  g.pieceCount = 0
  g.combo, g.maxCombo, g.b2b = 0, 0, false
  renderHud()
  setText(hint, '堆满一行即消除')
  print('mode=' .. MODE)                -- T6：进局模式（菜单选择或默认休闲）
  print('guide stage=1')
end

local function toggleKeymap()
  if guideStage == 2 then
    guideStage = 1
    setText(hint, '')
    setText(botBanner, '')
    print('guide stage=1 resume')
  else
    guideStage = 2
    showKeymap()
    print('guide stage=2 keymap')
  end
end

-- 结算页：棋盘暗场 + 顶部大字 + 底部「成绩 + 两个选项」。
-- 位置全部在棋盘之外（顶部/底部横幅）：运行时 InstantiateClientUIControl 造的格子层级高于
-- 服务端文字，中间放任何大字都会被吃掉（真机硬约束）。
showGameOver = function(overTitle)
  -- v2.2 ②③：双屏任一盘死=模式终局——胜负走**全屏结算层**（复用 v1 主路径，标题带胜负文案），
  -- 置 MODE_OVER 冻结两盘（输入/重力/AI 全停，OnUpdate 只推结算动画）。casual 不置位。
  -- 结算层懒创建槽在 G[1]——对家盘（G[2]）死时切回主实例挂层，主盘标记终局以走结算渲染。
  if G[2] and g == G[2] then
    MODE_OVER = true
    local winText = (MODE == 'pvp' and 'P1 胜！')
      or (MODE == 'coop' and '合作成功！')
      or '你赢了！'
    print('battle win')                  -- v2-plan T6 验收锚
    local save = g
    g = G[1]
    G[1].gameOver = true                 -- 主盘终局：重力/输入已由 MODE_OVER 冻结，这里只走结算渲染
    showGameOver(winText)
    g = save
    return
  end
  if G[2] and g == G[1] then
    MODE_OVER = true
    print('battle lose')                 -- v2-plan T6 验收锚（结算页照常弹，标题保持「游戏结束」）
  end
  bannerTimer = 0
  g.settleOpen = false
  print('guide gameover score=' .. g.score .. ' lines=' .. g.lines)
  -- 懒创建：第一次结算才建这一层（建的时候棋盘格早就存在 ⇒ 天然在它上面）
  if not g.settleReady and not g.settleBuildTried then
    g.settleBuildTried = true
    buildSettleLayer()
  end
  if g.settleReady then
    -- 结算层：先把文字写好，位置由 settleTick 从屏幕外滑入（0→0.9s 四段动画）
    setText(g.settleTitle, overTitle or '游戏结束')
    setText(g.settleScore, '本局 ' .. g.score .. ' 分')
    setText(g.settleBest, '最高 ' .. bestScore)
    setText(g.settleInfo, '消行 ' .. g.lines .. ' 行　落块 ' .. g.pieceCount .. '　等级 ' .. g.level)
    setText(g.settleExtra, '')
    setText(g.settleOpts, '[R] 再来一局　　[Q] 结算')
    trySet(g.settleTitle, 'fontSize', 44)
    g.settleSize, g.settleT, g.settleFade, g.settleDone, g.settleOn = 44, 0, -1, false, true
    -- image 一次性给**终值**：真机可能不认 imageColor 的 A 通道（不认就变不透明纯色），
    -- 所以"渐暗"只靠文字 fontColor 的 A 通道渐入（这条通道在真机是一直在用的）。
    if g.settleScrim then trySet(g.settleScrim, 'imageColor', C(140, 0, 0, 0)) end
    if g.settleCard then trySet(g.settleCard, 'imageColor', C(232, 20, 24, 34)) end
    if g.settleBorder then trySet(g.settleBorder, 'imageColor', C(120, 76, 194, 255)) end
    settleSetColors(0)
    tryCall(g.settleTitle, 'SetAnchoredPosition', 0, g.settleTitleOff)
    tryCall(g.settleOpts, 'SetAnchoredPosition', 0, g.settleOptsOff)
    local members = settleMembers()
    for i = 1, 9 do
      tryCall(members[i], 'SetVisible', true)
    end
    tryCall(g.settleExtra, 'SetVisible', false)
    -- 布局横幅不参与结算（避免与结算层重复信息）
    setText(topBanner, '') setText(botBanner, '') setText(hint, '')
    renderAll()
    return
  end
  -- 兜底：结算层不可用（模板探测失败）时仍用布局横幅
  renderAll()
  -- 顶部大字：40 号 → 框高必须 >= 40*1.45+4 = 62（layout 给 64），否则整行静默不画
  -- 为什么不是更大：棋盘顶框在屏幕 y=59，上方净空只有 59px，40 号居中后墨迹 16..56 恰好不压框
  trySet(topBanner, 'fontSize', 40)
  trySet(topBanner, 'fontColor', C(255, 255, 96, 96))
  setText(topBanner, overTitle or '游戏结束')
  -- 底部一行：成绩 + 两个选项；26 号 → 需 >= 41.7（layout 给 48）
  trySet(botBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C(255, 214, 232, 246))
  setText(botBanner, '本局 ' .. g.score .. ' 分　消行 ' .. g.lines .. ' 行'
    .. '　　[R] 再来一局　　[Q] 结算')
  setText(hint, '')
end

updateBest = function()
  if g.score > bestScore then bestScore = g.score end
end

--------------------------------------------------------------------------------
-- 入场「AI 自演」：guideStage == 0 时脚本自己玩，玩家一按键（startIfWaiting）立即交还控制。
-- 第四轮（用户反馈「看着窒息」）：
--  ① 选位像人：贴墙奖励（tie-breaker 量级）+ 禁止在中间挖 1 宽深井（竖 I 不许塞中间）；
--  ② 执行像人：观察 → 分段横移（1~2 格一停）→ 途中偶尔小落 → 到位犹豫 / 再看一眼 →
--     最后 50% 软降逐格落 / 50% 硬降，全程打 `demo pace` / `demo act` 日志。
local AI_OBSERVE_MAX = 0.70                         -- 观察上限（下限 obsMin 是档位参数，见 NUM.AI_LEVELS）
local AI_ROT_MIN, AI_ROT_MAX = 0.15, 0.25           -- 旋转本身
local AI_ROTGAP_MIN, AI_ROTGAP_MAX = 0.10, 0.20     -- 两次旋转之间
local AI_HOVER_MIN, AI_HOVER_MAX = 0.20, 0.40       -- 落定前"再看一眼"
local AI_SOFT_MIN, AI_SOFT_MAX = 0.06, 0.12         -- 软降一格
-- T5：单块时长带 pieceMin/Max、横移间隔带 moveMin/Max、观察下限 obsMin、目标带 targetLo/Hi
-- 全部改读 NUM.AI_LEVELS 档位参数（docs/v2-ai-design.md §四）；上面五个不分档的保留 local。
local AI_RESET_ROWS = 12                            -- 堆到这么高就清盘重开
local W_WALL, W_WELL = 0.06, 0.9                    -- 贴墙奖励 / 深井惩罚系数
local WELL_DEPTH = 3                                -- 1 列宽凹槽多深才算"深井"

-- 自演专用小随机：独立 LCG，不动方块袋那条序列 ⇒ 用例/出图仍可复现
local aiSeed = 20261024
local function aiRand(n)
  aiSeed = (aiSeed * 1103515245 + 12345) % 2147483648
  return (aiSeed // 65536) % n + 1
end
local function aiRange(lo, hi) return lo + (hi - lo) * (aiRand(1000) / 1000) end
local function aiFmt(x) return string.format('%.2f', x) end

-- 堆叠高度：最高一列已填的行数（0 = 空盘）
local function stackHeight()
  for r = 1, ROWS do
    for c = 1, COLS do
      if g.board[r][c] ~= 0 then return ROWS - r + 1 end
    end
  end
  return 0
end

-- 评估「cells 放到 x 列、自然落地」之后：返回 分数 / 落点高度 / 消行数；放不进返回 nil
-- 四项（El-Tetris / Lee 2013 公开权重，原样）+ 两项"像人"的小修正：
--   -0.06 × 离最近墙的列距（贴边偏好，只做同分/近似分的 tie-breaker）
--   -0.9  × 深度，对每个 1 列宽、深度 >= 3 的中间凹槽（不许为了塞竖 I 在中间挖井）
local W_AGG, W_LINE, W_HOLE, W_BUMP = -0.510066, 0.760666, -0.35663, -0.184483
local function evalBoard(cells, x)
  if collides(cells, x, 1) then return nil end
  local y = 1
  while y < ROWS and not collides(cells, x, y + 1) do y = y + 1 end
  local occ = {}
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      occ[(br - 1) * COLS + bc] = true
    end
  end
  local solid = function(r, c)
    if r < 1 or r > ROWS or c < 1 or c > COLS then return false end
    return occ[(r - 1) * COLS + c] == true or g.board[r][c] ~= 0
  end
  -- 先认满行（消掉），再用「消行后的棋盘」算高度/洞/崎岖
  local keep = {}
  local complete = 0
  for r = 1, ROWS do
    local full = true
    for c = 1, COLS do
      if not solid(r, c) then
        full = false
        break
      end
    end
    if full then
      complete = complete + 1
    else
      keep[#keep + 1] = r
    end
  end
  local floorRows = #keep
  local function solidFinal(r, c)
    local src = keep[r]
    if not src then return false end
    return solid(src, c)
  end
  local heights = {}
  local agg, holes = 0, 0
  for c = 1, COLS do
    local h, seen = 0, false
    for r = 1, floorRows do            -- 从上往下扫：第一个实心格才是堆顶（从底扫会恒得 1）
      if solidFinal(r, c) then
        h = floorRows - r + 1
        break
      end
    end
    heights[c] = h
    agg = agg + h
    for r = 1, floorRows do
      if solidFinal(r, c) then
        seen = true
      elseif seen then
        holes = holes + 1
      end
    end
  end
  local bump = 0
  for c = 1, COLS - 1 do
    local d = heights[c] - heights[c + 1]
    if d < 0 then d = -d end
    bump = bump + d
  end
  -- T5 Dellacherie 特征（docs/v2-ai-design.md §三）：行/列转移（消行后棋盘上的空实边界数）。
  -- 性能短路（v2.1 修复「卡的要死」）：三特征每次 evalBoard 各全盘扫（~400 次 solidFinal
  -- 闭包调用 × ~34 候选/帧），而校准定论权重=0（负贡献）——算完乘 0 扔掉。
  -- 权重全 0 时跳过全部扫描；将来启用任一特征（权重≠0）才付这笔钱。
  local rowtrans, coltrans = 0, 0
  if NUM.W_ROWTRANS ~= 0 or NUM.W_COLTRANS ~= 0 or NUM.W_WELLSUM ~= 0 then
    for r = 1, floorRows do
      local prev = true                       -- 行扫描左边界视为实心（标准口径）
      for c = 1, COLS do
        local cur = solidFinal(r, c)
        if cur ~= prev then rowtrans = rowtrans + 1 end
        prev = cur
      end
      if not prev then rowtrans = rowtrans + 1 end  -- 右边界收尾（空→实边界）
    end
    for c = 1, COLS do
      local prev = false                      -- 列扫描顶视为空
      for r = 1, floorRows do
        local cur = solidFinal(r, c)
        if cur ~= prev then coltrans = coltrans + 1 end
        prev = cur
      end
      if not prev then coltrans = coltrans + 1 end  -- 列底视为实（空列收尾 +1）
    end
  end
  -- 井深累加（所有 1 宽凹槽，含浅井：d*(d-1)/2 浅井轻罚；墙边空列不算——竖 I 贴墙合法）
  local wellsum = 0
  for c = 2, COLS - 1 do
    local nb = heights[c - 1]
    if heights[c + 1] < nb then nb = heights[c + 1] end
    local d = nb - heights[c]
    if d >= 2 then wellsum = wellsum + d * (d - 1) / 2 end
  end
  -- 深井：只数"被两边夹住"的 1 列宽凹槽（墙边的空列不算井——竖 I 贴墙是允许且鼓励的）
  local wells = 0
  for c = 2, COLS - 1 do
    local nb = heights[c - 1]
    if heights[c + 1] < nb then nb = heights[c + 1] end
    local d = nb - heights[c]
    if d >= WELL_DEPTH then wells = wells + W_WELL * d end
  end
  -- 贴墙奖励：离最近墙的列距越小越好
  local wmax = 1
  for i = 1, 4 do
    if cells[i][2] > wmax then wmax = cells[i][2] end
  end
  local wallDist = x - 1
  local rightDist = COLS - (x + wmax - 1)
  if rightDist < wallDist then wallDist = rightDist end
  local top = 0
  for c = 1, COLS do
    if heights[c] > top then top = heights[c] end
  end
  local landing = ROWS - y                                 -- 落点高度（0=贴底，越大越高）——Dellacherie 首特征
  -- 【实验C 结论】动态消行奖励（高堆放大 W_LINE）实测不改决策——高堆时刻消行候选本就是 best，已删。
  local wWall = W_WALL
  if NUM.AI_LEVEL >= 3 then wWall = 0 end   -- hard 档关拟人贴墙奖励（决策纯化，实验 F：ρ 0.26→0.30）
  return W_AGG * agg + W_LINE * complete + W_HOLE * holes + W_BUMP * bump
    + NUM.W_ROWTRANS * rowtrans + NUM.W_COLTRANS * coltrans + NUM.W_WELLSUM * wellsum
    + NUM.W_LANDING * landing - wWall * wallDist - wells, top, complete
end

-- 选位：4 朝向 × 每个合法列，三层优先级（能消行且不超高 > 不超高 > 清盘）；
-- 同分先取离墙更近的列（像人贴着边放），再取离当前列更近的，最后取更靠左的。
local function aiChoose()
  if not g.piece then return nil end
  local cands = {}
  local cells = g.piece.cells
  -- 旋转盒边长必须用 piece.n（O=2 / T,S,Z,J,L=3 / I=4），不能用 #cells（恒等于 4）
  local boxN = g.piece.n or 4
  for rot = 1, 4 do
    local wmax = 1
    for i = 1, 4 do
      if cells[i][2] > wmax then wmax = cells[i][2] end
    end
    for x = 1, COLS - wmax + 1 do
      local sc, h, complete = evalBoard(cells, x)
      if sc then
        local leftDist = x - 1
        local rightDist = COLS - (x + wmax - 1)
        local wallDist = leftDist
        if rightDist < wallDist then wallDist = rightDist end
        cands[#cands + 1] = {
          rot = rot, x = x, score = sc, h = h, clear = complete,
          wall = wallDist, from = math.abs(x - g.piece.x),
        }
      end
    end
    cells = rotateCells(cells, boxN)
  end
  if #cands == 0 then return nil end
  local function better(a, b)
    if not b then return true end
    if a.score > b.score + 1e-9 then return true end
    if a.score < b.score - 1e-9 then return false end
    if a.wall ~= b.wall then return a.wall < b.wall end     -- 同分贴墙
    if a.from ~= b.from then return a.from < b.from end     -- 再比离当前列
    return a.x < b.x                                        -- 再比靠左
  end
  local clearBest, safeBest
  for _, c in ipairs(cands) do
    if c.h <= AI_RESET_ROWS then
      if better(c, safeBest) then safeBest = c end
      if c.clear > 0 and better(c, clearBest) then clearBest = c end
    end
  end
  local best = clearBest or safeBest
  if not best then return { reset = true } end
  -- 竖 I 特别容易"立在中间"显得假 ⇒ 贴墙候选只要不比最优差 1.2 分就改放墙边
  -- （左右都能放时先比平不平，一样平则取左墙——用户口径"优先最左"）
  if g.piece.name == 'I' and NUM.AI_LEVEL < 3 then   -- hard 档跳过拟人贴墙特判（纯分数决策）
    local wallBest
    for _, c in ipairs(cands) do
      if c.h <= AI_RESET_ROWS and (c.x == 1 or c.x == COLS - 1) and c.score >= best.score - 1.2 then
        if not wallBest then
          wallBest = c
        elseif c.score > wallBest.score + 1e-9 then
          wallBest = c
        elseif math.abs(c.score - wallBest.score) <= 1e-9 then
          local a = math.min(c.x, COLS - c.x)
          local b = math.min(wallBest.x, COLS - wallBest.x)
          if a < b then wallBest = c end
        end
      end
    end
    if wallBest then best = wallBest end
  end
  -- 落点行（软降要按格数摊时间）
  local landingY = 1
  local probe = cells
  cells = g.piece.cells
  for _ = 1, best.rot - 1 do cells = rotateCells(cells, boxN) end
  probe = cells
  landingY = 1
  while landingY < ROWS and not collides(probe, best.x, landingY + 1) do landingY = landingY + 1 end
  -- T5：候选表按分降序（安全位 h<=AI_RESET_ROWS）——供失误注入（topK 池）与
  -- 2-ply 精化（top-12 重排）使用；1-ply best 仍按上面三层优先级+贴墙规则选出（保底不变）。
  local sorted = {}
  for _, c in ipairs(cands) do
    if c.h <= AI_RESET_ROWS then sorted[#sorted + 1] = c end
  end
  table.sort(sorted, function(a, b)
    if a.score ~= b.score then return a.score > b.score end
    if a.wall ~= b.wall then return a.wall < b.wall end
    if a.from ~= b.from then return a.from < b.from end
    return a.x < b.x
  end)
  return { rot = best.rot - 1, x = best.x, landingY = landingY,
    best1 = best, sorted = sorted }
end

-- 把方案编成"人手动作序列"（每步自带时长；随机化都在这里定下来，执行只按序列走）
-- 观察 0.25~0.7s（在 thinking 阶段已停）→ 旋转（0.15~0.25 + 间隔 0.1~0.2）→
-- 横移每次 1~2 格（间隔 0.08~0.25）→ 途中 35% 小落 1~2 格 → 到位 20% 回退一格再回来 →
-- 40% 再看一眼 0.2~0.4s
local function buildQueue(plan)
  local q = {}
  local totalCells = math.abs(plan.x - g.piece.x)
  local dir = 1
  if plan.x < g.piece.x then dir = -1 end
  for _ = 1, plan.rot do
    q[#q + 1] = { kind = 'rot', wait = aiRange(AI_ROT_MIN, AI_ROT_MAX) + aiRange(AI_ROTGAP_MIN, AI_ROTGAP_MAX) }
  end
  local remaining, moved, softRows = totalCells, 0, 0
  local softAt = nil
  if totalCells >= 3 and aiRand(100) <= 35 then softAt = aiRand(totalCells - 1) end
  while remaining > 0 do
    local step = aiRand(2)                       -- 1 或 2 格
    if step > remaining then step = remaining end
    local mlv = NUM.AI_LEVELS[NUM.AI_LEVEL] or NUM.AI_LEVELS[2]
    local gap = aiRange(mlv.moveMin, mlv.moveMax)
    q[#q + 1] = { kind = 'move', cells = step, dir = dir, wait = gap, gap = gap }
    moved = moved + step
    remaining = remaining - step
    if softAt and softRows == 0 and moved >= softAt then
      softRows = aiRand(2)                       -- 小落 1~2 格（"看看落点再决定"）
      local per = aiRange(0.07, 0.12)
      q[#q + 1] = { kind = 'soft', rows = softRows, per = per, left = softRows, wait = softRows * per }
    end
  end
  if aiRand(100) <= 20 and totalCells > 0 then    -- 到位后犹豫：回退一格再移回来
    q[#q + 1] = { kind = 'move', cells = 1, dir = -dir, wait = aiRange(0.10, 0.20) }
    q[#q + 1] = { kind = 'move', cells = 1, dir = dir, wait = aiRange(0.08, 0.16) }
  end
  local hover = 0
  if aiRand(100) <= 40 then                       -- 落定前"再看一眼"
    hover = aiRange(AI_HOVER_MIN, AI_HOVER_MAX)
    q[#q + 1] = { kind = 'hover', wait = hover }
  end
  return q, { cells = totalCells, softRows = softRows, hover = hover, rot = plan.rot, landingY = plan.landingY }
end

-- T5：Hold 换块的唯一实现（玩家 G 键与 AI 自演共用一套，lead 指示"AI 复用此语义，别另写一套"）。
-- 挂 NUM 表函数而不是 local function——main 函数 200 个 local 已满（D612/D616 两次实测爆）。
NUM.doHold = function()
  if g.gameOver or not g.piece or not g.st.can then return false end
  g.st.can = false
  local cur, curBag = g.piece.name, g.nextBag
  local outName, outBag
  if g.st.name then
    outName, outBag = g.st.name, g.st.bag   -- 槽内有块：换出
  end
  g.st.name, g.st.bag = cur, curBag or 0
  print('hold in=' .. cur .. ' out=' .. (outName or '-'))
  sfx(SFX.rotate)
  if outName then
    spawn(outName, outBag)       -- 换出块走 override 路径（不消耗 bag，日志带 holdswap=1）
  else
    spawn()                      -- 空槽首换：bag 自然出下一块（nextName 已就位）
  end
  return true
end

-- 清盘重开（演示循环用）：不弹结算页，横幅与入场动画复位
local function demoLoopReset()
  g.autoDriving = true
  newGame()
  g.autoDriving = false
  g.dimRatio, g.dimApplied = 0.45, -1   -- v2.3 ④：回标题页保持棋盘弱化
  renderAll()
  renderPiece()
  introT, introFont, introPulse = 0, 26, 22
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  setText(botBanner, '按 1-4 选模式 · 任意键=休闲 · H 游戏说明')
  pcall(buildMenuCards)                 -- v2.1 ②：回标题屏重建卡片（exitToMenu 后/演出循环复位）
  trySet(topBanner, 'fontColor', C_GOLD2)
  trySet(topBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C_ACCENT2)
  trySet(botBanner, 'fontSize', 22)
  g.AI.phase, g.AI.t, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.dur = 'thinking', 0, nil, 1, nil, 0
  g.AI.search = nil
  g.AI.wait = aiRange((NUM.AI_LEVELS[NUM.AI_LEVEL] or NUM.AI_LEVELS[2]).obsMin, AI_OBSERVE_MAX)
end

-- T6 模式进出（demoLoopReset 后定义：依赖 newGame/startIfWaiting/settleDestroy/spawn 均已就绪）。
-- feedMirror 实现：从镜像队列拉一块喂给 AI 盘（override spawn 路径，不消耗 AI 盘的袋）。
feedMirror = function()
  local e = table.remove(MIRRORQ, 1)
  if not e or not G[2] or G[2].gameOver then return end
  local save = g                             -- 跨实例铁律：保存 → 切目标 → 操作 → 还原
  g = G[2]
  spawn(e.name, e.bag)
  print('p2 mirror name=' .. e.name .. ' bag=' .. e.bag)   -- 双屏日志 p2 前缀（主日志锚不动）
  g = save
end

-- T7 垃圾行（v2-plan §三/设计书 §四）：给目标盘底部垫 n 行「1 洞」垃圾（暗灰 COL_GRAY）。
-- 跨实例铁律（§1.8 Step3 ②）：入口保存 g → 切目标 → 操作 → 还原。
-- 洞位随机用 aiRand（AI 独立 LCG）——设计书判据「raiseGarbage 不动 bag」（全局 rand 会改出块序列）。
-- 顶行被推出=内容丢失（首版简化，垃圾行游戏普遍语义）；当前落子与垃圾重叠则上移，上不动=顶死。
raiseGarbage = function(target, n)
  if not target or target.gameOver or n < 1 then return end
  local save = g
  g = target
  for _ = 1, n do
    local hole = aiRand(COLS)
    table.remove(g.board, 1)
    local row = {}
    for c = 1, COLS do row[c] = (c == hole) and 0 or COL_GRAY end
    g.board[#g.board + 1] = row
  end
  if g.piece then
    while g.piece.y > 1 and collides(g.piece.cells, g.piece.x, g.piece.y) do
      g.piece.y = g.piece.y - 1
    end
    if collides(g.piece.cells, g.piece.x, g.piece.y) then
      g.gameOver = true
      print('gameover score=' .. g.score)
      showGameOver()
    end
  end
  renderAll()
  renderPiece()
  renderHud()
  print('garbage n=' .. n)              -- v2-plan T7 验收锚（被送方日志）
  sfx(SFX.garbageRecv, true)            -- 受击音（force 防同帧吞）
  startShake(n >= 3 and 3 or 2)         -- 受击抖屏（行数越多越强）
  g = save
end

-- ===== v2.1 ② 标题屏四模式大视觉卡片 =====
-- 横排 4 卡（x=±390/±130，y=0），每卡 = cell 模板色块 260×120（暗色底）+ 2 条 settle 文字
-- （模式名 26 号白字 / 特色句 16 号浅字；框高按 h≥1.45×fontSize+4 给 48/32）。
-- 别加新模板（task-12 约束）：色块复用 TPL_CELL、文字复用 settleText 模板，全运行时实例化。
local TPL_TEXT = nil                   -- settleText 模板 guid（首次建卡时探测缓存；说明层共用）
-- ===== v2.1 ③ 游戏说明层（H 开关，stage0 专属）=====
-- 复用卡片组同款模板技术（cell 暗底 + settleText 文字条），不加新模板。
-- 框高判据：标题 30 号→52；行 20 号→40。开层时任意键=关层（不开局，防误触）。
local HELP_LINES = {
  { '游戏说明 · 再按 H 或任意键返回', 30, 52, 292 },
  { '操作：← → 移动 · ↓ 软降 · ↑ 旋转 · 空格 直落 · G 暂存', 20, 40, 232 },
  { '　　　（双人 P2：方向键 + X 直落 + F 暂存）', 18, 36, 192 },
  { '计分：1/2/3/4 消 = 100/300/500/800 × 等级', 20, 40, 148 },
  { '连击：连续消行每链 +50×(链-1)×等级 · 连四消 ×1.5', 20, 40, 104 },
  { 'T-spin：T 块三角落定 + 400×行×等级 · 专属音效', 20, 40, 60 },
  { '模式：休闲=AI 陪练随时接管 · AI 对抗=hard 决战', 20, 40, 16 },
  { '　　　双人=同屏 PK · 合作=旋转手+行动手一盘抗 AI', 18, 36, -24 },
  { '垃圾行：2/3/4 消送对方 1/2/4 行（连四消再 +1）', 20, 40, -68 },
  { '进阶：触底后有 0.5s 可救 · 按住方向自动连移', 20, 40, -112 },
}
local function destroyHelpLayer()
  local n = 0
  for i = 1, #HL do
    local ok = pcall(function() game.DestroyClientUIControl(HL[i]) end)
    if ok then n = n + 1 end
  end
  HL = {}
  if n > 0 then print('guide help off n=' .. n) end
end
local function buildHelpLayer()
  if not TPL_CELL then return end
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then return end
  destroyHelpLayer()
  local bg = game.InstantiateClientUIControl(TPL_CELL, root)
  if bg then
    bg.name = 'helpBg'
    bg:SetSizeDelta(1240, 680)
    bg:SetAnchoredPosition(0, 0)
    bg.imageColor = C(255, 12, 14, 20)
    HL[#HL + 1] = bg
  end
  for i, line in ipairs(HELP_LINES) do
    local h = game.InstantiateClientUIControl(TPL_TEXT, root)
    if h then
      h.name = 'helpLine' .. i
      h.text = line[1]
      h.fontSize = line[2]
      h:SetSizeDelta(1200, line[3])
      h:SetAnchoredPosition(0, line[4])
      HL[#HL + 1] = h
    end
  end
  print('guide help on n=' .. #HL)
end
toggleHelp = function()
  if helpOpen then
    helpOpen = false
    destroyHelpLayer()
  else
    helpOpen = true
    buildHelpLayer()
  end
end

destroyMenuCards = function()
  local n = 0
  for i = 1, #MC do
    local ok = pcall(function() game.DestroyClientUIControl(MC[i]) end)
    if ok then n = n + 1 end
  end
  MC = {}
  if n > 0 then print('menu cards destroy n=' .. n) end
end
-- v2.3 ①：左右两列各两卡（避开中央 330 宽棋盘投影区）——左列 x=-420（1 休闲/2 AI 对抗），
-- 右列 x=+420（3 双人/4 合作），列内 y=+80/-80；卡 360×110。
-- v2.3 ② 卡片结构（深空霓虹）：深色卡底 #1A2438 + 左缘 6px 模式色标条 + 模式名 30 号主文字
-- + 特色句 15 号次文字——主色只在色标条/选中态出现，不再整卡铺色。副标题 18 号次文字色。
local MC_CARD = { { -420, 80 }, { -420, -80 }, { 420, 80 }, { 420, -80 } }
buildMenuCards = function()
  if not TPL_CELL then return false end
  if not TPL_TEXT then TPL_TEXT = probeSettleTextbox() end
  if not TPL_TEXT then print('menu cards no text tpl') return false end
  destroyMenuCards()
  for i, info in ipairs(MODE_INFO) do
    local cx, cy = MC_CARD[i][1], MC_CARD[i][2]
    local bg = game.InstantiateClientUIControl(TPL_CELL, root)
    if bg then
      bg.name = 'menuCard' .. i
      bg:SetSizeDelta(360, 110)
      bg:SetAnchoredPosition(cx, cy)
      bg.imageColor = THEME.card
      MC[#MC + 1] = bg
    end
    local bar = game.InstantiateClientUIControl(TPL_CELL, root)
    if bar then
      bar.name = 'menuBar' .. i
      bar:SetSizeDelta(6, 110)
      bar:SetAnchoredPosition(cx - 177, cy)
      bar.imageColor = info.color
      MC[#MC + 1] = bar
    end
    local t1 = game.InstantiateClientUIControl(TPL_TEXT, root)
    if t1 then
      t1.name = 'menuTitle' .. i
      t1.text = info.key .. '  ' .. info.name
      t1.fontSize = 30
      trySet(t1, 'fontColor', THEME.textMain)
      t1:SetSizeDelta(330, 48)
      t1:SetAnchoredPosition(cx + 6, cy + 22)
      MC[#MC + 1] = t1
    end
    local t2 = game.InstantiateClientUIControl(TPL_TEXT, root)
    if t2 then
      t2.name = 'menuDesc' .. i
      t2.text = info.desc
      t2.fontSize = 15
      trySet(t2, 'fontColor', THEME.textSub)
      t2:SetSizeDelta(330, 32)
      t2:SetAnchoredPosition(cx + 6, cy - 22)
      MC[#MC + 1] = t2
    end
  end
  local sub = game.InstantiateClientUIControl(TPL_TEXT, root)
  if sub then
    sub.name = 'menuSub'
    sub.text = 'DEEP SPACE NEON · 四模式街机'
    sub.fontSize = 18
    trySet(sub, 'fontColor', THEME.textSub)
    sub:SetSizeDelta(480, 36)
    sub:SetAnchoredPosition(0, 238)
    MC[#MC + 1] = sub
  end
  print('menu cards n=' .. #MC)
  return true
end

-- ===== T6b-2 双屏控件与布局 =====
-- G[2] 棋盘（p2cell/p2frame 前缀防与 G[1] 撞名；坐标=基准+boardOX）。
local function buildBoardControls(inst)
  if not TPL_CELL or not inst then return false end
  local save = g
  g = inst
  g.cells = {}
  for i = 1, COLS * ROWS do
    local c = game.InstantiateClientUIControl(TPL_CELL, root)
    if not c then g = save return false end
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    c.name = 'p2cell' .. i
    g.cellBX[i] = (col - 4.5) * PITCH
    g.cellBY[i] = (9.5 - row) * PITCH
    c:SetSizeDelta(CELL, CELL)
    c:SetAnchoredPosition(g.cellBX[i] + (g.boardOX or 0), g.cellBY[i])
    c.imageColor = COL_EMPTY
    g.cells[i] = c
  end
  local FRAME_COL = C(255, 76, 194, 255)
  local frameX = 4.5 * PITCH + CELL / 2 + 1
  local frameY = 9.5 * PITCH + CELL / 2 + 1
  g.frames = {}
  local specs = {
    { -frameX, 0, 2, 2 * frameY + 2 }, { frameX, 0, 2, 2 * frameY + 2 },
    { 0, frameY, 2 * frameX + 2, 2 }, { 0, -frameY, 2 * frameX + 2, 2 },
  }
  for i = 1, #specs do
    local fr = game.InstantiateClientUIControl(TPL_CELL, root)
    if fr then
      local sp = specs[i]
      fr.name = 'p2frame' .. i
      g.frameBX[i], g.frameBY[i] = sp[1], sp[2]
      fr:SetSizeDelta(sp[3], sp[4])
      fr:SetAnchoredPosition(g.frameBX[i] + (g.boardOX or 0), g.frameBY[i])
      fr.imageColor = FRAME_COL
    end
    g.frames[i] = fr
  end
  print('p2 cellCount=' .. #g.cells)
  g = save
  return true
end

-- G[2] 控件销毁（exitToMenu 用；Destroy 真机生效=技能差异表#2，弃引用会在 430 上限累积）
local function destroyBoardControls(inst)
  if not inst or not inst.cells then return end
  local save = g
  g = inst
  local n = 0
  for _, arr in ipairs({ inst.cells, inst.frames }) do
    for i = 1, #(arr or {}) do
      if arr[i] then
        local ok = pcall(function() game.DestroyClientUIControl(arr[i]) end)
        if ok then n = n + 1 end
      end
    end
  end
  inst.cells, inst.frames = nil, nil
  print('p2 destroy n=' .. n)
  g = save
end

-- 摆一个实例的棋盘到指定 x 偏移（cells/frames 全量重摆；preview 只对 G[1] 重排）
local function placeBoard(inst, ox)
  local save = g
  g = inst
  g.boardOX = ox
  if g.cells then
    for i = 1, #g.cells do
      tryCall(g.cells[i], 'SetAnchoredPosition', g.cellBX[i] + ox, g.cellBY[i])
    end
  end
  if g.frames then
    for i = 1, 4 do
      tryCall(g.frames[i], 'SetAnchoredPosition', g.frameBX[i] + ox, g.frameBY[i])
    end
  end
  g = save
end

-- 双屏布局：G[1] 棋盘移左（-320）、G[2] 移右（+320）；G[1] preview 重排（next 上移棋盘上方两排、
-- hold 左栏竖排）；服务端 title/hint 藏（左栏让位），keyA-C 征用为 AI 盘战况（renderHud 双屏分支）。
local function layoutDual()
  placeBoard(G[1], -280)
  if G[1].preview then
    for i = 1, 4 do   -- next1-4（当前块 4 格，18px）：棋盘上方一排
      tryCall(G[1].preview[i], 'SetAnchoredPosition', -280 + (i - 2.5) * 22, 318)
    end
    for i = 5, 8 do   -- next5-8（第二块，14px）：再上一排
      tryCall(G[1].preview[i], 'SetAnchoredPosition', -280 + (i - 6.5) * 18, 338)
    end
    for i = 9, 12 do  -- hold1-4：左栏竖排（x=-550）
      tryCall(G[1].preview[i], 'SetAnchoredPosition', -600, 175 - (i - 9) * 22)
    end
  end
  tryCall(title, 'SetVisible', false)
  tryCall(hint, 'SetVisible', false)
  for _, c in ipairs({ keyA, keyB, keyC }) do tryCall(c, 'SetVisible', true) end
  placeBoard(G[2], 280)
  setText(keyA, 'AI 盘')
  setText(keyB, '')
  setText(keyC, '')
  print('layout dual')
end

-- enterMode：标题屏选定后按 MODE 配置实例表——casual 单盘；ai-battle 建 AI 盘 G[2]（hard 档）。
-- enterMode：标题屏选定后按 MODE 配置实例表——casual 单盘；三种双屏（ai-battle/pvp/coop）
-- 统一建 G[2]（pvp=玩家 2 盘各走各账；ai-battle/coop=AI 盘 autoDriving 走 AI 账）+镜像出块（公平）。
local function enterMode()
  if MODE == 'ai-battle' or MODE == 'pvp' or MODE == 'coop' then
    if MODE ~= 'pvp' then NUM.AI_LEVEL = 3 end   -- ai-battle/coop AI 盘=hard；pvp 无 AI 盘不动档
    G[2] = newInst()
    ACTIVE = { 1, 2 }
    MIRRORQ = {}                          -- 清镜像队列（复局防串）
    local save = g
    g = G[2]
    g.autoDriving = (MODE ~= 'pvp')       -- AI 盘账本走 AI 账（T4 语义）；pvp 双玩家盘各自计分
    newGame()                             -- 建板+状态复位；G[2] 不取块（newGame 内双屏分支）
    g = G[1]
    newGame()                             -- 主盘同起点重开（丢自演半盘）；首块 spawn→push→喂 G[2]
    local okBuild = buildBoardControls(G[2])
    if okBuild then layoutDual() else print('p2 build fail') end
    print('p2 inst ' .. MODE)             -- 双屏日志 p2 前缀
    g = save
  else
    G[2] = nil
    ACTIVE = { 1 }
  end
end

-- exitToMenu：非 casual 模式的 R=回标题菜单（清 AI 盘/镜像队列，回 stage0 演出）。
local function exitToMenu()
  MODE_OVER = false                    -- v2.2 ③：终局标志复位（R 回菜单）
  if G[2] then
    settleDestroy()                       -- 若 G[2] 建过结算层（首版不会，防御性）
    destroyBoardControls(G[2])            -- 销毁 p2 棋盘控件（防 430 上限累积）
    G[2] = nil
  end
  ACTIVE = { 1 }
  MIRRORQ = {}
  MODE = 'casual'
  g = G[1]
  placeBoard(G[1], 0)                     -- 主盘棋盘回画布中心
  if G[1].preview then                    -- preview 回原位（next 右栏 / hold 左栏）
    for i = 1, 4 do tryCall(G[1].preview[i], 'SetAnchoredPosition', 400, 175) end
    for i = 5, 8 do tryCall(G[1].preview[i], 'SetAnchoredPosition', 400, 100) end
    for i = 9, 12 do tryCall(G[1].preview[i], 'SetAnchoredPosition', -400, 175 - (i - 9) * 22) end
  end
  if CANVAS_W and CANVAS_H then
    local okL, errL = pcall(layout, CANVAS_W, CANVAS_H)   -- 服务端控件全量复位（title/hint/keyA-C 回 v1 布局）
    if not okL then print('relayout error :: ' .. tostring(errL)) end
  end
  guideStage = 0
  demoLoopReset()                         -- 复位主盘演出与横幅（含模式菜单文案）
  print('mode menu')                      -- 回菜单锚
end

-- 硬降到底 + 落子；期间的日志与教学提示全部静音（autoDriving）
local function aiDrop()
  local guard = 0
  while guard < ROWS + 4 and not collides(g.piece.cells, g.piece.x, g.piece.y + 1) do
    g.piece.y = g.piece.y + 1
    guard = guard + 1
  end
  g.autoDriving = true
  local ok, err = pcall(doLock)
  g.autoDriving = false
  if not ok then
    print('demo lock error :: ' .. tostring(err))
    return
  end
  g.AI.count = g.AI.count + 1
  RHO.pieces = RHO.pieces + 1
  g.AI.sumSec = g.AI.sumSec + g.AI.dur
  -- 一块一条节奏日志：从这行能看出"确实分段执行了"
  local p = g.AI.pace or {}
  local gaps = p.gaps or 0
  local avgGap = 0
  if gaps > 0 then avgGap = (p.sumGap or 0) / gaps end
  print('demo pace think=' .. aiFmt(p.think or 0)
    .. ' rot=' .. (p.rot or 0)
    .. ' move=' .. (p.cells or 0) .. '*' .. aiFmt(avgGap)
    .. ' soft=' .. (p.soft or 0)
    .. ' hover=' .. aiFmt(p.hover or 0)
    .. ' drop=' .. tostring(p.drop or 'hard')
    .. ' total=' .. aiFmt(g.AI.dur))
  g.AI.dur = 0
  if g.AI.count % 10 == 0 then
    print('demo auto n=' .. g.AI.count .. ' avg=' .. aiFmt(g.AI.sumSec / g.AI.count)
      .. 's stack=' .. stackHeight() .. ' rho=' .. aiFmt(RHO.lines / math.max(RHO.pieces, 1))
      .. ' pieces=' .. RHO.pieces)
  end
  local h = stackHeight()
  if g.gameOver or h >= AI_RESET_ROWS then
    print('demo rho=' .. aiFmt(RHO.lines / math.max(RHO.pieces, 1))
      .. ' pieces=' .. RHO.pieces .. ' lines=' .. RHO.lines)
    print('demo reset stack=' .. h)
    demoLoopReset()
  end
end
-- g.AI 初值已随 newInst() 建立（newAIState，T6b：每实例一份 AI 状态机）

-- 每个 OnUpdate 调一次：thinking（观察）→ acting（旋转/横移/小落，逐段计时）
-- → hovering（再看一眼，在 acting 队列里）→ dropping（软降逐格 或 硬降）→ 下一块
-- AI 驱动核心（T6a 从 autoTick 抽出）：作用于当前 g，**无 guideStage 守卫**——
-- stage0 自演 / casual 局中接管 / T6b 双屏 AI 盘共用这一条链路。
-- onOver='demo'：盘死→demoLoopReset（stage0 自演语义）；
-- onOver='stop'：盘死→停 AI 驱动走各自结算（casual 接管/对战语义）。返回 false=已停/无盘。
-- 隔离调子（lead 拍板，T8 起）：aiDrop 直调 doLock，不经锁定延迟路径——AI 节奏与玩家手感互不影响。
-- T5 性能修复（v2.1「卡的要死」）：第二层评估专用 evalNext——零表分配的「落-评-撤」。
-- 探针二分定谳（X2/X4b，交替对照）：原第二层复用 evalBoard，每次调用建 occ/solid/keep/
-- solidFinal/heights 共 5 个对象，JS-Lua 解释器（JS 对象分配+GC）下精化帧连续 68 次/帧
-- 触发 GC 抖动，实测精化帧 26.6ms（拷贝+消行仅 0.3ms，大头全在枚举）——T5 把整体
-- mean 从 v1 的 0.34ms 拉到 9.55ms（+35 倍）。evalNext 只算 El-Tetris 三主项
-- （agg/holes/complete）：第二层是排序信号不是最终决策，拟人项（wallDist/well）与
-- bump 在第一层 evalBoard 仍全量参与。落 4 格→评→撤销，scratch（NUM.nxFull）复用，
-- 热路径零分配。实测修复后整体 mean 回 0.33ms（v1 量级）。
NUM.evalNext = function(cells, x)
  if collides(cells, x, 1) then return nil end
  local y = 1
  while y < ROWS and not collides(cells, x, y + 1) do y = y + 1 end
  local b = g.board
  local w1, w2, w3, w4 = 0, 0, 0, 0     -- 落格坐标打包 br*32+bc（ROWS<=20,COLS<=10 安全）
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      local p = br * 32 + bc
      if w1 == 0 then w1 = p elseif w2 == 0 then w2 = p elseif w3 == 0 then w3 = p else w4 = p end
      b[br][bc] = 1
    end
  end
  local nxFull = NUM.nxFull
  local nf = 0
  for r = 1, ROWS do                     -- 满行检测（不物理删行——撤销时一并还原）
    local row = b[r]
    local full = true
    for c = 1, COLS do
      if row[c] == 0 then full = false break end
    end
    if full then nf = nf + 1 nxFull[nf] = r end
  end
  local agg, holes = 0, 0
  local nxH = NUM.nxFull                  -- 借同一 scratch 表的后段存每列高（11..20，nf<=4 不冲突）
  for c = 1, COLS do                      -- heights/holes：满行视作已消（跳过）
    local h, seen = 0, false
    for r = 1, ROWS do
      local occ = b[r][c] ~= 0
      if occ then
        local skip = false
        for fi = 1, nf do if nxFull[fi] == r then skip = true break end end
        if not skip then
          if h == 0 then h = ROWS - r + 1 end
          seen = true
        end
      elseif seen then
        local skip = false
        for fi = 1, nf do if nxFull[fi] == r then skip = true break end end
        if not skip then holes = holes + 1 end
      end
    end
    agg = agg + h
    nxH[10 + c] = h
  end
  local bump = 0                          -- El-Tetris 第四主项（三主项版 ρ 0.30→0.22 的回归修复）
  for c = 1, COLS - 1 do
    local d = nxH[10 + c] - nxH[11 + c]
    if d < 0 then d = -d end
    bump = bump + d
  end
  if w1 ~= 0 then b[w1 // 32][w1 % 32] = 0 end    -- 撤销 4 格
  if w2 ~= 0 then b[w2 // 32][w2 % 32] = 0 end
  if w3 ~= 0 then b[w3 // 32][w3 % 32] = 0 end
  if w4 ~= 0 then b[w4 // 32][w4 % 32] = 0 end
  return W_AGG * agg + W_LINE * nf + W_HOLE * holes + W_BUMP * bump, nil, nf
end

local function aiTickCore(dt, onOver)
  if g.gameOver then
    if onOver == 'demo' then demoLoopReset() end
    return false
  end
  if not g.piece or not g.board then return false end
  local lv = NUM.AI_LEVELS[NUM.AI_LEVEL] or NUM.AI_LEVELS[2]
  if g.AI.piece and g.AI.piece ~= g.piece then          -- 方块换了（清盘/重开/Hold 换块）
    g.AI.phase, g.AI.t, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', 0, nil, 1, nil, nil
    g.AI.wait = aiRange(lv.obsMin, AI_OBSERVE_MAX)
  end
  g.AI.t = g.AI.t + dt
  g.AI.dur = g.AI.dur + dt
  local ph = g.AI.phase
  local function nextAction()
    g.AI.qi = g.AI.qi + 1
    g.AI.t = 0
  end
  if ph == 'thinking' then
    -- T5 渐进式搜索（docs/v2-ai-design.md §二）：第一帧 1-ply 全集 = 保底方案 + 候选表；
    -- ply>=2 档在观察期分帧精化 top-12（每帧 2 候选 × ~34 下一块落点 ≈ 68 evalBoard ≈ 8ms
    -- 真机预算）；完成或超时（obsMin+0.10s）收敛——超时用当前最优，1-ply 保底永不缺席。
    -- 搜索期间临时把 board 指向模拟棋盘（切片内同步完成，无渲染穿插，安全）。
    local function refineSearch()
      local S = g.AI.search
      local top = S.plan.sorted
      local n = #top                                    -- 【E2】全候选精化（top-12→全部；34×34≈17帧<0.55s 观察窗）
      local nextS = SHAPES[g.nextName or 'T']
      local savedBoard = g.board
      local k = S.idx
      local budget = 2
      while k <= n and budget > 0 do
        local cand = top[k]
        local sim = {}
        for r = 1, ROWS do
          local row = {}
          for c = 1, COLS do row[c] = g.board[r][c] end
          sim[r] = row
        end
        local cells = g.piece.cells
        for _ = 1, cand.rot - 1 do cells = rotateCells(cells, g.piece.n or 4) end
        local y = 1
        while y < ROWS and not collides(cells, cand.x, y + 1) do y = y + 1 end
        for i = 1, 4 do
          local br, bc = y + cells[i][1] - 1, cand.x + cells[i][2] - 1
          if br >= 1 and br <= ROWS then sim[br][bc] = 1 end
        end
        local r = ROWS
        while r >= 1 do
          local full = true
          for c = 1, COLS do if sim[r][c] == 0 then full = false end end
          if full then
            table.remove(sim, r)
            local row = {}
            for c = 1, COLS do row[c] = 0 end
            table.insert(sim, 1, row)
          else
            r = r - 1
          end
        end
        g.board = sim
        local ncells = nextS.cells
        local bestNext = nil
        for _ = 1, 4 do
          local nwmax = 1
          for i = 1, 4 do
            if ncells[i][2] > nwmax then nwmax = ncells[i][2] end
          end
          for nx = 1, COLS - nwmax + 1 do
            local sc = NUM.evalNext(ncells, nx)
            if sc and (not bestNext or sc > bestNext) then bestNext = sc end
          end
          ncells = rotateCells(ncells, nextS.n)
        end
        g.board = savedBoard
        cand.score2 = cand.score + (bestNext or -5)   -- 2-ply 值 = 1-ply 分 + 下一层最优回应
        if not S.bestScore or cand.score2 > S.bestScore then
          S.bestScore, S.best2 = cand.score2, cand
        end
        k = k + 1
        budget = budget - 1
      end
      S.idx = k
      if k > n then S.done = true end
    end
    if not g.AI.queue and not g.AI.search then
      -- 首帧：1-ply 全集（保底）
      local plan = aiChoose()
      if plan and plan.reset then
        print('demo reset plan=too-high')
        if onOver == 'demo' then demoLoopReset() end   -- 接管期间（stop）不 reset 玩家的局，停驱动即可
        return false
      end
      if not plan then
        g.AI.wait = aiRange(lv.obsMin, AI_OBSERVE_MAX)
        g.AI.t = 0
        return
      end
      g.AI.search = { plan = plan, idx = 1, best2 = nil, bestScore = nil,
        done = (lv.ply < 2) or (#plan.sorted < 2), holdChecked = false, doHoldAfter = false }
      g.AI.piece = g.piece
      g.AI.dur = 0
      g.AI.t = 0
      g.AI.wait = lv.obsMin + 0.10
      return
    end
    if g.AI.search and not g.AI.search.done then
      refineSearch()
      if not g.AI.search.done then
        if g.AI.t < lv.obsMin + 0.10 then return end
        g.AI.search.done = true          -- 超时收敛：用当前已精化最优（保底仍在）
      end
    end
    if g.AI.search and not g.AI.search.holdChecked then
      g.AI.search.holdChecked = true
      -- T5 hold 第三分支（hard 档）：换出块在当前盘面的 1-ply 最优 > 留守 2-ply 值 + 0.3 才换
      -- （复用 NUM.doHold 同一执行路径——lead 指示别另写一套换块逻辑）
      if lv.hold > 0 and g.st.can then
        local altS = SHAPES[g.st.name or g.nextName or 'T']
        local cells = altS.cells
        local bestAlt = nil
        for _ = 1, 4 do
          local wmax = 1
          for i = 1, 4 do if cells[i][2] > wmax then wmax = cells[i][2] end end
          for ax = 1, COLS - wmax + 1 do
            local sc, h = evalBoard(cells, ax)
            if sc and h <= AI_RESET_ROWS and (not bestAlt or sc > bestAlt) then bestAlt = sc end
          end
          cells = rotateCells(cells, altS.n)
        end
        local stay = g.AI.search.plan.best1.score   -- 同口径 1-ply vs 1-ply（2-ply 值含负向回应分，恒偏小）
        if bestAlt and bestAlt > stay + 1.5 then
          g.AI.search.doHoldAfter = true
        end
      end
      if g.AI.search.doHoldAfter then
        g.AI.search = nil
        NUM.doHold()                   -- 换块；下一帧由换块守卫重新进入 thinking
        return
      end
    end
    if not g.AI.queue then
      -- 定稿：2-ply 最优（超时退 1-ply best）→ 失误注入（topK 池按分加权）→ buildQueue（拟人外壳不变）
      local S = g.AI.search
      local final = S.plan.best1
      if S.best2 and S.done then final = S.best2 end
      if lv.pMistake > 0 and #S.plan.sorted > 1 and aiRand(100) <= lv.pMistake then
        local pool = {}
        for i = 2, math.min(lv.topK, #S.plan.sorted) do pool[#pool + 1] = S.plan.sorted[i] end
        if #pool > 0 then
          local minS = S.plan.sorted[#S.plan.sorted].score
          local sum = 0
          for _, c in ipairs(pool) do sum = sum + math.max(c.score - minS + 0.01, 0.01) end
          local r = aiRand(1000) / 1000 * sum
          local acc = 0
          for _, c in ipairs(pool) do
            acc = acc + math.max(c.score - minS + 0.01, 0.01)
            if r <= acc then final = c; break end
          end
        end
      end
      local probe = g.piece.cells
      for _ = 1, final.rot - 1 do probe = rotateCells(probe, g.piece.n or 4) end
      local ly = 1
      while ly < ROWS and not collides(probe, final.x, ly + 1) do ly = ly + 1 end
      local plan = { rot = final.rot - 1, x = final.x, landingY = ly }
      local q, info = buildQueue(plan)
      g.AI.queue, g.AI.info, g.AI.qi = q, info, 1
      local rest = 0
      for _, a in ipairs(q) do rest = rest + (a.wait or 0) end
      local target = aiRange(lv.targetLo, lv.targetHi)
      g.AI.softPer = 0
      local dropKind = 'hard'
      if aiRand(100) <= 50 then dropKind = 'soft' end
      local rows = (info.landingY or g.piece.y) - g.piece.y
      if rows < 1 then rows = 1 end
      local dropTime = 0
      if dropKind == 'soft' then
        local per = (target - rest) / rows
        if per < AI_SOFT_MIN then per = AI_SOFT_MIN end
        if per > AI_SOFT_MAX then per = AI_SOFT_MAX end
        g.AI.softPer = per
        dropTime = rows * per
      end
      -- 观察时长 = 目标总时长 - 其余各段；下限 obsMin（高难 0.55 覆盖精化帧数）、上限 1.2s
      -- 兜底：软降 + 长距离 + 多动作会让整块超过 pieceMax+0.2 ⇒ 这一块改成硬降（人也常常直接按到底）
      if dropKind == 'soft' and (rest + dropTime + lv.obsMin) > lv.pieceMax + 0.2 then
        dropKind, dropTime, g.AI.softPer = 'hard', 0, 0
      end
      local think = target - rest - dropTime
      if think < lv.obsMin then think = lv.obsMin end
      if think > 1.2 then think = 1.2 end
      g.AI.wait = think
      g.AI.t = 0
      g.AI.pace = { think = think, rot = info.rot, cells = info.cells,
        gaps = 0, sumGap = 0, soft = info.softRows, hover = info.hover, drop = dropKind }
      -- 计划日志：看到"这块是什么方块、打算放哪一列、软降还是硬降"（形状不变，T4 口径）
      print('demo plan name=' .. tostring(g.piece.name) .. ' from=' .. g.piece.x
        .. ' target=' .. plan.x .. ' rot=' .. plan.rot .. ' drop=' .. dropKind)
      return
    end
    if g.AI.t < g.AI.wait then return end
    g.AI.t = 0
    g.AI.phase = 'acting'
    return
  end
  if ph == 'acting' then
    local a = g.AI.queue and g.AI.queue[g.AI.qi]
    if not a then
      -- 序列走完：软降 / 硬降
      g.AI.phase, g.AI.t = 'dropping', 0
      g.AI.dropped = 0
      g.AI.fallTimer = 0
      if g.AI.pace.drop == 'soft' then
        g.AI.nudge = (aiRand(100) <= lv.nudgePct)   -- 软降途中顺手横调 1 格（hard 档 0%：落点不被噪声破坏）
        g.AI.nudgeAt = aiRand(3)
      end
      print('demo act drop=' .. g.AI.pace.drop)
      return
    end
    if a.kind == 'rot' then
      if not a.done then
        a.done = true
        local nc = rotateCells(g.piece.cells, g.piece.n)
        if not collides(nc, g.piece.x, g.piece.y) then
          g.piece.cells = nc
          renderPiece()
        end
        print('demo act rot x=' .. g.piece.x)
      end
      if g.AI.t >= a.wait then nextAction() end
      return
    end
    if a.kind == 'move' then
      if not a.done then
        a.done = true
        for _ = 1, a.cells do
          if not collides(g.piece.cells, g.piece.x + a.dir, g.piece.y) then
            g.piece.x = g.piece.x + a.dir
          end
        end
        renderPiece()
        g.AI.pace.gaps = g.AI.pace.gaps + 1
        g.AI.pace.sumGap = g.AI.pace.sumGap + (a.gap or 0)
        print('demo act move x=' .. g.piece.x)
      end
      if g.AI.t >= a.wait then nextAction() end
      return
    end
    if a.kind == 'soft' then
      -- 用倒计时而不是绝对时刻：AI.t 会在每次 nextAction 归零，绝对时刻会变成"等很久"
      if not a.done then
        a.done = true
        a.timer = 0
      end
      if a.left > 0 then
        a.timer = (a.timer or 0) - dt
        if a.timer <= 0 then
          a.timer = a.per
          if not collides(g.piece.cells, g.piece.x, g.piece.y + 1) then
            g.piece.y = g.piece.y + 1
            renderPiece()
          end
          a.left = a.left - 1
          if a.left == 0 then print('demo act soft y=' .. g.piece.y) end
        end
        return
      end
      a.timer = (a.timer or 0) - dt
      if a.timer <= 0 then nextAction() end
      return
    end
    if a.kind == 'hover' then
      if not a.done then a.done = true print('demo act hover ' .. aiFmt(a.wait)) end
      if g.AI.t >= a.wait then nextAction() end
      return
    end
  end
  if ph == 'dropping' then
    if g.AI.pace.drop == 'soft' then
      local canFall = not collides(g.piece.cells, g.piece.x, g.piece.y + 1)
      if canFall then
        g.AI.fallTimer = (g.AI.fallTimer or 0) - dt
        if g.AI.fallTimer <= 0 then
          g.AI.fallTimer = g.AI.softPer
          g.piece.y = g.piece.y + 1
          g.AI.dropped = (g.AI.dropped or 0) + 1
          if g.AI.nudge and g.AI.dropped == g.AI.nudgeAt then
            local d = 1
            if g.piece.x > COLS / 2 then d = -1 end
            if not collides(g.piece.cells, g.piece.x + d, g.piece.y) then
              g.piece.x = g.piece.x + d
              print('demo act nudge x=' .. g.piece.x)
            end
          end
          renderPiece()
        end
      end
      if not canFall then
        -- 落地后若这块太快（< 档位 pieceMin），落定前再停一下（像人抬手前确认一下）
        if g.AI.dur < lv.pieceMin then return end
        aiDrop()
        g.AI.phase, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', nil, 1, nil, nil
        g.AI.t, g.AI.wait = 0, aiRange(lv.obsMin, AI_OBSERVE_MAX)
      end
      return
    end
    if g.AI.dur < lv.pieceMin then return end       -- 太快就再停一下（同软降）
    aiDrop()                                     -- 硬降
    g.AI.phase, g.AI.queue, g.AI.qi, g.AI.piece, g.AI.search = 'thinking', nil, 1, nil, nil
    g.AI.t, g.AI.wait = 0, aiRange(lv.obsMin, AI_OBSERVE_MAX)
  end
  return true
end

-- stage0 入场自演入口（守卫版）：休闲接管/双屏 AI 走 OnUpdate/T6 入口直接调 aiTickCore
autoTick = function(dt)
  if guideStage ~= 0 then return end
  aiTickCore(dt, 'demo')
end

--------------------------------------------------------------------------------
-- 布局：按画布尺寸算三栏 + 上下横幅（换设备不用重新导入）
--------------------------------------------------------------------------------

-- 结算层几何（懒创建：层在 gameOver 那一刻才建，所以建完要立刻用它摆位）
-- 框高仍按 h >= fontSize*1.45+4：标题 44（脉冲到 48 ⇒ 需 73.6）⇒ 给 80；30→52；24→44；22→40；28→48。
layoutSettle = function(W, H)
  local halfH = H / 2
  local function place2(ctl, x, y, w, h)
    if not ctl then return end
    tryCall(ctl, 'SetSizeDelta', w, h)
    tryCall(ctl, 'SetAnchoredPosition', x, y)
  end
  local cw = W - 240
  if cw > 780 then cw = 780 end
  local ch = 400
  place2(g.settleScrim, 0, 0, W + 60, H + 60)        -- 全屏遮罩
  place2(g.settleBorder, 0, 0, cw + 8, ch + 8)       -- 强调色描边
  place2(g.settleCard, 0, 0, cw, ch)                 -- 面板底
  g.settleTitleY, g.settleOptsY = 140, -136
  g.settleTitleOff, g.settleOptsOff = halfH + 80, -(halfH + 80)
  place2(g.settleTitle, 0, g.settleTitleY, cw - 60, 80)
  place2(g.settleScore, 0, 72, cw - 60, 52)
  place2(g.settleBest, 0, 20, cw - 60, 44)
  place2(g.settleInfo, 0, -28, cw - 60, 40)
  place2(g.settleExtra, 0, -66, cw - 60, 40)
  place2(g.settleOpts, 0, g.settleOptsY, cw - 60, 48)
end

local function layout(W, H)
  CANVAS_W, CANVAS_H = W, H
  local halfW, halfH = W / 2, H / 2
  local panelW = 420
  local leftCX, rightCX = -(halfW - panelW / 2 - 20), halfW - panelW / 2 - 20
  RIGHT_CX = rightCX
  local function place(ctl, x, y, w, h)
    if not ctl then return end
    tryCall(ctl, 'SetSizeDelta', w, h)
    tryCall(ctl, 'SetAnchoredPosition', x, y)
  end
  -- 框高硬判据（渲染器实测）：h >= fontSize*1.45 + 4 才画这一行，否则整行静默不画。
  -- 64 号 -> >=96.8（h=96 曾整块消失）、34 -> >=53.3、26 -> >=41.7、22 -> >=35.9。
  -- 左栏：标题/统计/最高/提示 作为一个整组垂直居中（贴顶贴底会显得散）
  place(title, leftCX, 130, panelW, 100)             -- 64 号
  place(hud, leftCX, 40, panelW + 40, 40)            -- 20 号：22 号时尾部一个字被裁，实测
  place(best, leftCX, -10, panelW, 36)               -- 20 号
  place(hint, leftCX, -95, panelW, 150)              -- 22 号
  place(hudNext, rightCX, halfH - 150, 200, 40)      -- 22 号
  place(keyA, rightCX, -40, panelW, 38)              -- 22 号
  place(keyB, rightCX, -80, panelW, 38)              -- 22 号
  place(keyC, rightCX, -120, panelW, 38)             -- 22 号
  for _, b in ipairs(BUTTONS) do
    local ctl = find(b.name)
    if ctl then
      if isMobile then
        place(ctl, b.x, b.y, BTN_W, BTN_H)
        tryCall(ctl, 'SetVisible', true)
      else
        tryCall(ctl, 'SetVisible', false)   -- PC 端不展示移动按钮
      end
    end
  end
  applyStyle('title', title) applyStyle('hud', hud) applyStyle('hudNext', hudNext)
  applyStyle('best', best) applyStyle('hint', hint)
  applyStyle('keyA', keyA) applyStyle('keyB', keyB) applyStyle('keyC', keyC)
  applyStyle('topBanner', topBanner) applyStyle('botBanner', botBanner)
  for _, b in ipairs(BUTTONS) do applyStyle(b.name, find(b.name)) end
  -- 横幅框高按判据算「同时装得下的最大字号」：入场标题会长到 40、结算大字 40（都需 62）
  -- ⇒ topBanner 给 64；旧实现 56 高，标题长过 35 号就整行静默消失（实测）。
  -- 纵向位置：框 64 居中在屏幕上 4..68 那条带子里（棋盘顶框在 59，40 号墨迹 16..56 不压框）
  place(topBanner, 0, halfH - 36, W - 180, 64)
  -- 底行：结算 26 号（需 41.7）、入场呼吸 22~23 号 ⇒ 给 48
  place(botBanner, 0, -(halfH - 28), W - 180, 48)

  if g.settleReady then layoutSettle(W, H) end
  -- 抖动状态必须能被 layout 覆盖后复位：重排后基准坐标仍是创建时那套，直接停抖并写回基准
  if g.shakeT > 0 then stopShake(true) end
end

--------------------------------------------------------------------------------
-- 生命周期
--------------------------------------------------------------------------------

function OnStart()
  root = script.object
  if not root then error('tetris: script.object is nil') end
  root.showCursor = true
  script:EnableUpdate(true)      -- 默认 false：不显式打开就不会派发 OnUpdate

  local W, H = game.GetUICanvasSize()
  print('canvas ' .. tostring(W) .. 'x' .. tostring(H))

  -- 平台：移动/触屏才显示可点按钮（PC 端键位卡够了）
  local isMobile = true
  do
    local okDev, dev = pcall(function() return game.GetDevice() end)
    if okDev and type(Enum) == 'table' and Enum.Device then
      isMobile = (dev == Enum.Device.Mobile or dev == Enum.Device.MobileController)
      print('device=' .. tostring(dev) .. ' mobile=' .. tostring(isMobile))
    else
      print('device=unknown（按移动端处理，按钮可见）')
    end
  end

  -- 模板 guid 探测（双宿主）：先 cell（image，无光标事件）再 hit（cursor，有光标事件）
  local firstCell, tplGuid = probeTemplate(TPL_GUIDS.cell, false)
  if not firstCell then
    error('tetris: cell 模板 guid 都不可用，候选=' .. #TPL_GUIDS.cell
      .. '（导入后跑 node qxqy/deploy.mjs --calibrate）')
  end
  print('tpl guid=' .. tplGuid)
  TPL_CELL = tplGuid                    -- T6b-2：G[2] 棋盘控件复用同模板（enterMode 里建）

  g.cells = {}
  for i = 1, COLS * ROWS do
    local c = firstCell
    firstCell = nil
    if not c then c = game.InstantiateClientUIControl(tplGuid, root) end
    if not c then error('tetris: InstantiateClientUIControl failed at ' .. i) end
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    c.name = 'cell' .. i
    -- 基准坐标存下来（抖屏用；不再各处重算字面量）
    g.cellBX[i] = (col - 4.5) * PITCH
    g.cellBY[i] = (9.5 - row) * PITCH
    c:SetSizeDelta(CELL, CELL)
    c:SetAnchoredPosition(g.cellBX[i], g.cellBY[i])
    c.imageColor = COL_EMPTY
    g.cells[i] = c
  end
  print('cellCount=' .. #g.cells)

  -- 棋盘外框：4 条细长实例（后建 ⇒ 在棋格之上），给棋盘一个清晰边界
  local FRAME_COL = C(255, 76, 194, 255)
  local boardEdgeW = 4.5 * PITCH + CELL / 2      -- 149
  g.frames = {}
  -- 四条框线与棋盘边缘对齐：竖线高 / 横线宽都取「框到框」的跨度，否则四角会伸出约 16px（实测）
  local frameX = boardEdgeW + 1                      -- 150
  local frameY = 9.5 * PITCH + CELL / 2 + 1          -- 300
  local specs = {
    { -frameX, 0, 2, 2 * frameY + 2 },               -- 左
    { frameX, 0, 2, 2 * frameY + 2 },                -- 右
    { 0, frameY, 2 * frameX + 2, 2 },                -- 上
    { 0, -frameY, 2 * frameX + 2, 2 },               -- 下
  }
  for i = 1, #specs do
    local fr = game.InstantiateClientUIControl(tplGuid, root)
    if fr then
      local sp = specs[i]
      fr.name = 'frame' .. i
      g.frameBX[i], g.frameBY[i] = sp[1], sp[2]
      fr:SetSizeDelta(sp[3], sp[4])
      fr:SetAnchoredPosition(g.frameBX[i], g.frameBY[i])
      fr.imageColor = FRAME_COL
    end
    g.frames[i] = fr
  end

  -- 结算不用中间遮罩：运行时实例的层级高于服务端文字，遮罩会把结算文字盖掉（实测）
  -- 改为「棋盘暗场 + 顶部/底部大字」，文字始终在棋盘之外，不会被遮挡
  overlay = nil

  -- NEXT 预览：第一块 4 格（18px）；T2 第二块 4 格（14px 缩略、55% 亮度，renderNext 排第一块下方）
  -- T3 Hold 槽复用本表：preview[9..12] = hold1-4（18px，左栏镜像位；不另开 local——200 上限已满）
  g.preview = {}
  for i = 1, 12 do
    local c = game.InstantiateClientUIControl(tplGuid, root)
    if c then
      c.name = i <= 8 and ('next' .. i) or ('hold' .. i - 8)
      c:SetSizeDelta(i <= 4 and 18 or i <= 8 and 14 or 18, i <= 4 and 18 or i <= 8 and 14 or 18)
      c:SetAnchoredPosition(i <= 4 and 400 or i <= 8 and 400 or -400,
        i <= 4 and 175 or i <= 8 and 100 or 175)
      c.imageColor = COL_BG
    end
    g.preview[i] = c
  end

  -- 结算层**不在 OnStart 建**（2026-10-25 真机：常驻 + SetVisible(false) 不保险 ⇒ 开局白屏、
  -- 重开后结算页残留）。改成第一次 gameOver 时懒创建，重开即销毁 —— 见 showGameOver / newGame。

  title, hud, hudNext, best = find('title'), find('hud'), find('hudNext'), find('best')
  hint, keyA, keyB, keyC = find('hint'), find('keyA'), find('keyB'), find('keyC')
  topBanner, botBanner = find('topBanner'), find('botBanner')
  local okLayout, errLayout = pcall(layout, W, H)
  if not okLayout then print('layout error :: ' .. tostring(errLayout)) end

  -- 引导初始态：等玩家按第一个键（重力暂停，画面静止好读）
  guideStage, bannerTimer, g.taughtLock, g.taughtClear = 0, 0, false, false
  g.flashT, introT, introFont, introPulse = 0, 0, 24, 22   -- introFont/Pulse = 上次写进控件的值（变了才写）
  bestScore = 0
  setText(title, '')
  for _, c in ipairs({ best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', false) end
  -- T4：入场自演也亮 HUD（AI 战况可见：得分随 AI 消行增长）；best/hint 仍藏到玩家接管
  tryCall(hud, 'SetVisible', true)
  tryCall(title, 'SetVisible', false)
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  -- v2.1 ②：大视觉卡片承载模式选择；botBanner 呼吸提示改短句+H 说明入口
  setText(botBanner, '按 1-4 选模式 · 任意键=休闲 · H 游戏说明')
  local okCards, errCards = pcall(buildMenuCards)
  if not okCards then print('menu cards error :: ' .. tostring(errCards)) end

  -- 按键注册一律 pcall：真机上某个键名可能不存在，抛错会整段 OnStart 中断（2026-10-24 首轮实证）
  -- 真机要求 KeyEventType **枚举值**（传字符串报 bad argument #2: KeyEventType expected, got string，
  -- 2026-10-24 日志实证）；模拟器接受字符串。两种都试：先枚举，失败回落字符串。
  local enumKeys = (type(Enum) == 'table' and Enum.KeyEventType) or nil
  local function listen(name, fn)
    local ok, err, how
    if enumKeys and enumKeys[name] ~= nil then
      ok, err = pcall(function() root:AddKeyEventListener(enumKeys[name], fn) end)
      how = 'enum'
    end
    if not ok then
      ok, err = pcall(function() root:AddKeyEventListener(name, fn) end)
      how = 'string'
    end
    if ok then
      print('listen ok ' .. name .. ' via ' .. how)
    else
      print('listen fail ' .. name .. ' :: ' .. tostring(err))
    end
  end

  -- 每个动作前先 startIfWaiting()：入场态按的第一个键既开始游戏也执行该动作
  -- （不吞键，用例与手感一致）；stage 2 键位表期间除 H/R 外全部忽略。
  -- T6a casual 接管打点：玩家任何游戏键=「玩家在场」——接管中则交还（横幅+日志），计时归零。
  local function playerTouched()
    if TK.state == 'ai' then
      TK.state = 'play'
      setText(topBanner, '')
      print('takeover back')           -- 玩家任意键交还（v2-plan T6 验收锚）
    elseif TK.state == 'hint' then
      TK.state = 'play'
      setText(topBanner, '')
    end
    TK.t = 0
  end
  -- T6c/d 键位路由（lead 铁律①：事件回调先设 g 再执行动作）：
  --   pvp：方向键(38/39/36/37)/X(Drop)/F(Interact) 归 P2=G[2]，WASD/Space/G 归 P1=G[1]（§3.3 定版）
  --   coop：全部键归共盘 G[1]（P1 旋转手=W/G，P2 行动手=←→↓/X），越权键由 coopAllowed 过滤
  --   casual/ai-battle：全部归 G[1]
  local P2_KEYS = {
    KeyboardCraftspersonKey38Down = true, KeyboardCraftspersonKey39Down = true,
    KeyboardCraftspersonKey36Down = true, KeyboardCraftspersonKey37Down = true,
    KeyboardDropKeyDown = true, KeyboardInteractKeyDown = true,
  }
  local function routePlayer(keyName)
    if MODE == 'pvp' and P2_KEYS[keyName] and G[2] then return G[2] end
    return G[1]
  end
  -- coop 分工过滤（裁决① 用户方案）：P1=旋转手（只 rot/hold），P2=行动手（只 left/right/soft/hard）
  local function coopAllowed(keyName, action)
    if MODE ~= 'coop' then return true end
    local isP1Key = not P2_KEYS[keyName]
    if isP1Key then return action == 'rot' or action == 'hold'
    else return action == 'left' or action == 'right' or action == 'soft' or action == 'hard' end
  end
  local function act(keyName, fn)
    return function()
      startIfWaiting()
      if guideStage == 3 and GK.phase == 'keys' then
        GK.phase, GK.t = 'count', 0
        setText(topBanner, '3')
        trySet(topBanner, 'fontSize', 64)
        setText(botBanner, '')
        if G[2] then setText(hint, '') end
        print('guide count 3')
        return
      end
      if guideStage == 2 or guideStage == 3 then return end
      if MODE_OVER then return end       -- v2.2 ③：模式终局后冻结双方输入（R 回菜单走独立监听）
      g = routePlayer(keyName)          -- 铁律①：回调内先绑定目标实例
      playerTouched()
      fn()
    end
  end

  -- 动作执行体（KEYMAP 与 P2 补充键共用；g 已由 act 路由到位）
  local function doPlay(action, keyName)
    if not coopAllowed(keyName, action) then return end   -- coop 越权键无效（裁决①）
    if MODE == 'coop' then print('coop act=' .. action .. ' p=' .. (P2_KEYS[keyName] and 2 or 1)) end
    if MODE == 'pvp' and G[2] and g == G[2] then print('p2 act=' .. action) end  -- 双屏日志 p2 前缀
    if action == 'left' then
      g.das.dir, g.das.t, g.das.arr, g.das.steps = -1, 0, 0, 0
      moveBy(-1)
    elseif action == 'right' then
      g.das.dir, g.das.t, g.das.arr, g.das.steps = 1, 0, 0, 0
      moveBy(1)
    elseif action == 'rot' then
      rotate()
    elseif action == 'soft' then
      stepDown(true)
    elseif action == 'hold' then
      NUM.doHold()
    elseif action == 'hard' then
      if g.gameOver or not g.piece then return end
      local dropped = 0
      while not collides(g.piece.cells, g.piece.x, g.piece.y + 1) do
        g.piece.y = g.piece.y + 1
        dropped = dropped + 1
      end
      print('harddrop rows=' .. dropped .. ' y=' .. g.piece.y)
      g.score = g.score + dropped * NUM.HARD
      doLock()
    end
  end
  -- T8 玩家键 = NUM.KEYMAP 表驱动（原十条散装 listen 收表；DAS 需要方向键 Down+Up 成对监听；
  -- T6 双屏输入路由：act(keyName, fn) 内按 MODE 路由到目标实例，不再散改 listen）
  for _, m in ipairs(NUM.KEYMAP) do
    listen(m.key, act(m.key, function() doPlay(m.action, m.key) end))
    if m.up then
      listen(m.up, function()                              -- T8 DAS：松开清方向（仅清自己按住的那个；T6：清目标实例）
        if MODE == 'pvp' then g = routePlayer(m.key) end
        if m.action == 'left' and g.das.dir == -1 then g.das.dir = 0 end
        if m.action == 'right' and g.das.dir == 1 then g.das.dir = 0 end
      end)
    end
  end
  -- T6c pvp：P2 硬降 X（Drop）/Hold F（Interact）——v1 KEYMAP 未含，补两条（经同一路由/过滤/日志）
  listen('KeyboardDropKeyDown', act('KeyboardDropKeyDown', function() doPlay('hard', 'KeyboardDropKeyDown') end))
  listen('KeyboardInteractKeyDown', act('KeyboardInteractKeyDown', function() doPlay('hold', 'KeyboardInteractKeyDown') end))
  -- R/Q/H/T 与 anyKeyStart 兜底见下（不进 KEYMAP：它们不是玩法动作键）
  -- T6 标题屏模式选择：Digit1-4（模拟器实证=CraftspersonKey1-4；真机回落字符串路径同 listen）。
  -- 手机端只留 casual（裁决⑨）：isMobile 时 Digit2-4 忽略。选择后 enterMode 配实例，再开局。
  for i, mname in ipairs({ 'casual', 'ai-battle', 'pvp', 'coop' }) do
    listen('KeyboardCraftspersonKey' .. i .. 'Down', function()
      if guideStage ~= 0 or pendingMode then return end
      if i > 1 and isMobile then return end   -- 双屏砍手机端，回落 casual（裁决⑨）
      MODE = mname
      print('mode=' .. MODE)
      -- v2.1 ②：销卡 → 模式名大字动画窗 0.5s → enterMode 开局（OnUpdate stage0 段驱动）
      -- v2.3 ② 选中态：销卡前选中卡放大 1.04 + 色标条加宽（街机感反馈）
      local selCard, selBar = find('menuCard' .. i), find('menuBar' .. i)
      if selCard then tryCall(selCard, 'SetSizeDelta', 374, 114) end
      if selBar then tryCall(selBar, 'SetSizeDelta', 10, 114) end
      destroyMenuCards()
      pendingMode, pendingT = mname, 0
      setText(topBanner, MODE_TITLE[mname] or mname)
      trySet(topBanner, 'fontColor', MODE_INFO[i].color)
      setText(botBanner, '')
    end)
  end
  listen('KeyboardSwitchToWalkOrRunKeyDown', function()     -- T5 调试切档（具名键不被 anyKeyStart 抢）
    if guideStage ~= 0 then return end
    NUM.AI_LEVEL = NUM.AI_LEVEL % 3 + 1
    local lv2 = NUM.AI_LEVELS[NUM.AI_LEVEL]
    RHO.pieces, RHO.lines = 0, 0
    print('demo level=' .. lv2.name)
    demoLoopReset()
  end)
  listen('KeyboardCharacterSkill3KeyDown', function()       -- R 重开（键位表态也允许）
    startIfWaiting()
    if guideStage == 2 then guideStage = 1 setText(hint, '') end
    -- v2.1 ①：引导态的 R=直接回菜单（还没开局，重开无意义）
    if guideStage == 3 and MODE ~= 'casual' then
      exitToMenu()
      return
    end
    -- T6b：非 casual 模式的 R=回标题菜单（模式可重选）；casual 保持 v1 就地重开语义
    if MODE ~= 'casual' and guideStage == 1 then
      exitToMenu()
      return
    end
    settleDestroy()          -- 双保险：newGame 里还会再调一次（幂等），保证 R 一定销毁结算层
    newGame()
    setText(topBanner, '')
    setText(botBanner, '')
    if overlay then tryCall(overlay, 'SetVisible', false) end
    -- 结算态改过横幅字号/颜色，重开必须还原：几何与样式只认 layout 这一份
    local okRelayout, errRelayout = pcall(layout, W, H)
    if not okRelayout then print('relayout error :: ' .. tostring(errRelayout)) end
  end)
  -- Q：结算明细（结算态才有意义）。明细走左栏 hint（棋盘外，不会被实例格子盖住）
  listen('KeyboardCharacterSkill2KeyDown', function()
    startIfWaiting()
    if not g.gameOver then return end
    -- ① 真结算优先：发信号 → 服务端图 1082130480 → 官方结算页
    if sendSettleSignal() then return end
    -- ② 本机 Lua 无信号通道时的退路：原来的「结算明细」开关
    settleOpen = not g.settleOpen
    local mins = math.floor(g.elapsed / 60)
    local secs = math.floor(g.elapsed % 60)
    local rate = 0
    if g.pieceCount > 0 then rate = math.floor(g.lines * 100 / g.pieceCount) end
    local detail = '等级 ' .. g.level .. '　用时 ' .. mins .. ':' .. string.format('%02d', secs)
      .. '　消行率 ' .. rate .. '%　最高连击 ' .. g.maxCombo
    if g.settleOpen then
      if g.settleReady then
        setText(g.settleExtra, detail)
        tryCall(g.settleExtra, 'SetVisible', true)
      else
        setText(hint, '本局落块 ' .. g.pieceCount .. '　消行 ' .. g.lines .. '　最高 ' .. bestScore)
      end
      print('settle detail on')
    else
      if g.settleReady then
        setText(g.settleExtra, '')
        tryCall(g.settleExtra, 'SetVisible', false)
      else
        setText(hint, '')
      end
      print('settle detail off')
    end
  end)
  listen('KeyboardCharacterSkill1KeyDown', function()       -- H：stage0=游戏说明层 / 局内=键位表
    if guideStage == 0 then
      toggleHelp()
      return
    end
    startIfWaiting()
    toggleKeymap()
  end)
  -- T：调试填满最底两行（不消行）。消行必须走真实路径——下一次锁定（硬降/落地）时
  -- 由 doLock -> clearLines 处理，用例 04 因此覆盖的是真实消行链路而不是调试旁路。
  listen('KeyboardCharacterSkill4KeyDown', act('KeyboardCharacterSkill4KeyDown', function()
    for rr = ROWS - 1, ROWS do
      for c = 1, COLS do g.board[rr][c] = COL_BLUE end
    end
    print('debug-fill')
    renderAll()
    renderHud()
  end))

  -- 手机按钮热区：优先用布局里已存在的光标检测区（gsts assets:ui create 建档，无需导入）；
  -- 取不到时退化为客户端 cursor 模板实例（老路线）。
  local function hitOf(name)
    local c = find(name .. 'hit')
    if c then return c end
    return nil
  end
  local anyHit = hitOf(BUTTONS[1].name)
  local firstHit, hitGuid
  if not anyHit then
    firstHit, hitGuid = probeTemplate(TPL_GUIDS.hit, true)
  end
  if anyHit or firstHit then
    if hitGuid then print('hit guid=' .. hitGuid) else print('hit source=layout') end
    local cursorDown = (type(Enum) == 'table' and Enum.CursorEventType
      and Enum.CursorEventType.CursorDown) or nil
    local actions = {
      btnA = function() if guideStage ~= 2 then moveBy(-1) end end,
      btnB = function() if guideStage ~= 2 then moveBy(1) end end,
      btnC = function() if guideStage ~= 2 then stepDown(true) end end,
      btnD = function() if guideStage ~= 2 then rotate() end end,
      btnE = function()
        if guideStage == 2 or g.gameOver or not g.piece then return end
        while not collides(g.piece.cells, g.piece.x, g.piece.y + 1) do g.piece.y = g.piece.y + 1 end
        print('touchdrop y=' .. g.piece.y)
        doLock()
      end,
      btnF = function()
        if guideStage == 2 then guideStage = 1 setText(hint, '') end
        newGame()
        setText(topBanner, '') setText(botBanner, '')
      end,
    }
    for i, b in ipairs(BUTTONS) do
      local h = hitOf(b.name)
      if not h then
        h = firstHit
        firstHit = nil
        if not h then h = game.InstantiateClientUIControl(hitGuid, root) end
      end
      if h then
        h.name = b.name .. 'hit'
        if h.name ~= b.name .. 'hit' then
          h:SetSizeDelta(BTN_W, BTN_H)
          h:SetAnchoredPosition(b.x, b.y)
        end
        local act = actions[b.name]
        local okReg = pcall(function() h:AddCursorEventListener(cursorDown, function()
          startIfWaiting()
          if act then act() end
        end) end)
        if not okReg then print('hit listen fail ' .. b.name) end
        hits[i] = h
      end
    end
    print('hits=' .. #hits)
  else
    print('hits=0 click disabled（真机导入后跑 node qxqy/deploy.mjs --calibrate）')
  end

  -- 入场态兜底：43 个可编程键位里凡是没被上面映射的，都只做"开始游戏"这一件事
  -- T6：1-4=标题屏模式选择键（Digit1-4，先于本兜底注册）——排除，防兜底抢先以 casual 开局吃掉模式选择
  local mapped = { [1] = true, [2] = true, [3] = true, [4] = true, [36] = true, [37] = true, [38] = true, [39] = true }
  local anyKeyStart = function()
    if guideStage == 0 then startIfWaiting() end
    if guideStage == 3 and GK.phase == 'keys' then
      GK.phase, GK.t = 'count', 0
      setText(topBanner, '3')
      trySet(topBanner, 'fontSize', 64)
      setText(botBanner, '')
      if G[2] then setText(hint, '') end
      print('guide count 3')
    end
  end
  for i = 1, 43 do
    if not mapped[i] then
      listen('KeyboardCraftspersonKey' .. i .. 'Down', anyKeyStart)
    end
  end

  -- 先开局：即使某个键名注册失败，棋盘与重力也应正常跑（入场态暂停重力）
  local okNew, errNew = pcall(newGame)
  if not okNew then print('newGame error :: ' .. tostring(errNew)) end
  -- v2.3 ④：标题页棋盘弱化——复用结算压暗通道（dimRatio 0.45），卡片成视觉主体；
  -- startIfWaiting / demoLoopReset 进局时复位 0。renderAll 后必须补 renderPiece
  -- （renderAll 只画已锁块，会把活动块 4 格擦成空色——v2.2 前就有此语义，单独调用时别忘）。
  g.dimRatio, g.dimApplied = 0.45, -1
  renderAll()
  renderPiece()
  print('menu dim board')
end


-- 单盘状态推进（T0 Step3：抖屏/闪白/结算动画/用时/锁定延迟/DAS/重力）。
-- OnUpdate 对 ACTIVE 每实例调用一次；内部全部经 g（闭包共享 upvalue）作用于当前盘。
-- 铁律（v2 设计书 §1.8 Step3）：事件回调先 `g = G[player]` 再执行动作；
-- 跨实例交互（T7 垃圾行）入口保存 g → 切目标 → 操作 → 还原。
local function tickInstance(d)
  -- 抖屏：只在 shakeT > 0 的帧写坐标；到点复位一次后就不再碰任何控件
  if g.shakeT > 0 then
    g.shakePhase = g.shakePhase + d
    g.shakeT = g.shakeT - d
    if g.shakeT <= 0 then
      g.shakeT, g.shakePhase = 0, 0
      applyShake(0, 0)
      print('shake end')
    else
      local u = 1 - g.shakeT / g.shakeDur                        -- 0（刚触发）→ 1（结束）
      local decay = math.exp(-3 * u)                         -- 指数衰减
      local ox = g.shakeAmp * decay * math.sin(g.shakePhase * SHAKE_FREQ)
      local oy = g.shakeAmp * decay * math.cos(g.shakePhase * SHAKE_FREQ * 1.3)
      applyShake(ox, oy)
    end
  end
  if g.flashT and g.flashT > 0 then   -- nil 守卫（v2.1）：v1 nil 初值 + G[2] 开局即 tick，防每帧炸断 OnUpdate
    g.flashT = g.flashT - d
    if g.flashT <= 0 then g.flashT = 0 renderAll() end
  end
  if g.gameOver then settleTick(d) end          -- 结算层四段动画（0→0.9s）
  if guideStage == 1 and not g.gameOver then g.elapsed = g.elapsed + d end
  -- T8 锁定延迟推进（玩家局）：重力触底后 0.5s 缓冲，期间移动/旋转已重置计时（见 moveBy/rotate）
  if g.ld.t >= 0 and not g.gameOver then
    g.ld.t = g.ld.t + d
    if g.ld.t >= NUM.LD_DELAY then
      g.ld.t = -1
      if g.piece and collides(g.piece.cells, g.piece.x, g.piece.y + 1) then
        doLock()          -- 缓冲到时且仍触底：锁定
      end
    end
  end
  -- T8 DAS/ARR（玩家局，只对按住的方向键生效；AI/手机热区不走这里）
  -- v2.1 兜底：网页 keyup 转发丢失/乱序会让 dir 永不清零⇒方块自己左右移动（用户实测反馈②）。
  -- 防御=连续自动连移步数（das.steps）达 DAS_CAP 强制清 dir——正常 DAS 到墙（9 格内）后
  -- moveBy 失败不计步，只有「Up 丢失 + 块跨行移动」才会累计过 12；用户松手重按即恢复。
  if g.das.dir ~= 0 and not g.gameOver then
    g.das.t = g.das.t + d
    if g.das.t >= NUM.DAS_DELAY then
      g.das.arr = g.das.arr + d
      while g.das.arr >= NUM.ARR_RATE and g.das.dir ~= 0 do
        g.das.arr = g.das.arr - NUM.ARR_RATE
        if moveBy(g.das.dir) then
          g.das.steps = g.das.steps + 1
          if g.das.steps >= NUM.DAS_CAP then
            g.das.dir = 0            -- 连移上限：强制停（Up 丢失兜底；正常到墙时 steps 早已停涨）
            print('das cap=' .. NUM.DAS_CAP .. ' (keyup lost?)')
          end
        end
      end
    end
  end
  g.acc = g.acc + d
  local guard = 0
  while g.acc >= STEP and guard < 8 do
    g.acc = g.acc - STEP
    guard = guard + 1
    g.tickCount = g.tickCount + 1
    -- 下落间隔随等级变化（SPEED_TICKS，docs §3）：level 已封顶 LEVEL_CAP，表项必存在
    local perTicks = NUM.SPEED[g.level] or NUM.SPEED[NUM.LEVEL_CAP]
    if not g.gameOver and g.tickCount % perTicks == 0 then
      stepDown(false)  -- 重力不加软降分；判负在 spawn -> showGameOver 里收口
    end
  end
end

function OnUpdate(dt)
  local d = tonumber(dt) or 0
  if d <= 0 then return end
  frameSeq = frameSeq + 1          -- 帧号：按键回调与本次 OnUpdate 同帧 ⇒ sfx 帧闸生效
  g = G[1]                         -- 主流程段（横幅/演出/自演）作用于主盘（v1 语义）
  if bannerTimer > 0 and not g.gameOver then
    bannerTimer = bannerTimer - d
    if bannerTimer <= 0 then
      bannerTimer = 0
      setText(botBanner, '')
      setText(hint, '')
    end
  end
  if guideStage == 0 then
    -- v2.1 ② 模式名进入动画窗（0.5s）：模式名大字 26→64 渐变，窗后 enterMode 开局。
    -- 动画期间停演出与 AI 自演（视觉主角让给模式名）。
    if pendingMode then
      pendingT = pendingT + d
      local size = math.min(64, 26 + math.floor(pendingT * 90))
      trySet(topBanner, 'fontSize', size)
      if pendingT >= 0.5 then
        pendingMode = nil
        trySet(topBanner, 'fontSize', 34)
        trySet(topBanner, 'fontColor', C_GOLD2)
        enterMode()
        startIfWaiting()
      end
      return
    end
    -- 入场演出：标题 26→40 渐大 + 底部提示呼吸（框高 72 按 46 号算过，40 号不会被裁）
    introT = introT + d
    local size = math.min(40, 26 + math.floor(introT * 12))
    if size ~= introFont then
      introFont = size
      trySet(topBanner, 'fontSize', size)
    end
    local pulse = 22 + math.floor(2 * (0.5 + 0.5 * math.sin(introT * 5)))
    if pulse ~= introPulse then
      introPulse = pulse
      trySet(botBanner, 'fontSize', pulse)
    end
    autoTick(d)   -- AI 自演：选位→旋转→逐格横移→硬降→消行→下一块，玩家按键即交还控制
    -- v2.1 C：AI 消行的分数弹跳（前半 26 号放大、后半回 20；框高 40 按 26×1.45+4=41.7 微超但
    -- trySet 只在帧内短暂生效且 hud 框实测容差足够——真机/网页上「AI 在得分」一眼可见）
    if g and g.AI and g.AI.fx > 0 then
      g.AI.fx = g.AI.fx - d
      trySet(hud, 'fontSize', g.AI.fx > 0.25 and 26 or 20)
      if g.AI.fx <= 0 then g.AI.fx = 0 trySet(hud, 'fontSize', 20) end
    end
    return
  end
  if guideStage == 3 then
    -- v2.1 ① 引导态：keys=键位说明（任意键确认）→ count=3-2-1 倒计时 → 开局。全冻结。
    GK.t = GK.t + d
    if GK.phase == 'count' then
      local size = math.min(64, 40 + math.floor(GK.t * 48))
      trySet(topBanner, 'fontSize', size)
      if GK.t >= 1 then
        GK.t = 0
        GK.count = GK.count - 1
        if GK.count <= 0 then
          guideStage = 1
          GK.phase = 'keys'
          trySet(topBanner, 'fontSize', 34)
          setText(topBanner, '')
          setText(botBanner, '')
          -- v2.2 ①：引导结束，keyA/keyB 从盘下说明位复位回战况位（layout 全量+双屏重摆）
          if G[2] and CANVAS_W and CANVAS_H then
            pcall(layout, CANVAS_W, CANVAS_H)
            layoutDual()
          end
          renderHud()
          print('guide start')
          print('guide stage=1')
          return
        end
        setText(topBanner, tostring(GK.count))
        print('guide count ' .. GK.count)
      end
    end
    return
  end
  if guideStage ~= 1 then return end   -- 等待开始 / 键位表 都不跑重力
  -- T6a casual 局中接管（v2-plan §三 T6 / 设计书 §2.2）：idle 检测=任意游戏键（act 打点归零）。
  -- play→5s 无操作→hint（提示 2s）→ai（AI 代打续算不清零，分数继续入玩家账=裁决⑤）→任意键交还。
  -- 只在 casual；其他模式本波无接管语义。
  if MODE == 'casual' and not g.gameOver then
    TK.t = TK.t + d
    if TK.state == 'play' and TK.t >= 5 then
      TK.state, TK.t = 'hint', 0
      setText(topBanner, '即将由 AI 代打…')
      print('takeover hint')           -- v2-plan T6 验收锚
    elseif TK.state == 'hint' and TK.t >= 2 then
      TK.state, TK.t = 'ai', 0
      setText(topBanner, 'AI 代打中 · 按任意键交还')
      print('takeover ai')             -- v2-plan T6 验收锚
    end
    if TK.state == 'ai' then
      aiTickCore(d, 'stop')            -- 接管驱动：盘死即停（走玩家结算），不 reset 玩家的局
    end
  end
  -- v2.2 ③：模式终局——冻结两盘（重力/DAS/AI 全停），只推终局方的结算层动画。
  if MODE_OVER then
    for i = 1, #ACTIVE do
      g = ACTIVE[i] and G[ACTIVE[i]] or G[1]
      if g.gameOver then settleTick(d) end
    end
    return
  end
  for i = 1, #ACTIVE do
    g = ACTIVE[i] and G[ACTIVE[i]] or G[1]
    -- T6b：AI 盘驱动（i==2）——作用于 G[2]（闭包 g 已切）；盘死即停（胜负在 showGameOver 收口）
    if (MODE == 'ai-battle' or MODE == 'coop') and i == 2 then
      aiTickCore(d, 'stop')
    end
    tickInstance(d)
  end
end

function OnDestroy() end
