--[[==========================================================================
tetris/config.lua —— 纯数据模块（数值表 / 色板 / 方块形状 / 模式表 / 规则页文案）
----------------------------------------------------------------------------
契约（官方文档 + 模拟器源码实证，见 docs/research/lua-module-contract.md）：
  * 本文件在真机/模拟器里**未挂载（只建映射不挂控件）**，由 main.lua 用 require 加载；
  * 模块 chunk 在 OnInit 阶段执行 ⇒ **顶层不许实例化控件**（本文件只有表与常量，符合）；
  * require 必须 return **恰好 1 个值** ⇒ 这里 return M（表）；
  * 模拟器 require key = 注册路径归一化（'lua/tetris/config'），另有 'default_import_file/' 别名；
    真机编辑器会给 script.path 补 'default_import_file/' 前缀 ⇒ main.lua 的加载器按
    「带前缀优先、裸路径兜底」逐个 try。
  * 调平衡只改本文件：NUM 是唯一数值来源（出处 docs/数值策划.md）。
=========================================================================]]

local M = {}

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
  AI_LEVEL = 3,   -- v2.5：默认 hard（演示即最强——用户第 N 次追问 AI 水平后 lead 裁决；normal 的 8% 失误曾让标题页自演像不会打）
  -- BCTS 权重【论文】Thiery & Scherrer 2009 §4（交叉熵优化原值，照抄不手调）
  BW = { LH = -12.63, ER = 6.60, RT = -9.22, CT = -19.77,
         HO = -13.08, CW = -10.49, HD = -1.61, RH = -24.04 },
  nxFull = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },   -- T5 性能修复：evalNext scratch（1-4 满行行号；11-20 各列高度）
  AI_LEVELS = {
    { name = 'easy',   ply = 1, hold = 0, pMistake = 25, topK = 8, nudgePct = 30,
      pieceMin = 2.2, pieceMax = 3.8, moveMin = 0.10, moveMax = 0.30,
      obsMin = 0.30, targetLo = 2.6, targetHi = 4.0 },
    { name = 'normal', ply = 1, hold = 0, pMistake = 8, topK = 3, nudgePct = 30,
      pieceMin = 1.5, pieceMax = 3.2, moveMin = 0.08, moveMax = 0.25,
      obsMin = 0.30, targetLo = 1.8, targetHi = 3.2 },
    { name = 'hard',   ply = 1, hold = 1, pMistake = 0, topK = 1, nudgePct = 0,
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
  DAS_HOLD   = 0.6,    -- v2.6：DAS 持续上限秒数（ARR 激活后超过即强制停）——根治「按一下走到底」：
                        -- 网页旧构建 keyup 转发丢失/焦点转移时 dir 残留，时间上限让 lua 层不依赖 Up 自愈；
                        -- 真机/正常网页 Up 正常到达时提前清 dir，永不触及此上限（用户无感）
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

-- v2.3 ②：深空霓虹街机主题（lead 定调色板——统一饱和度只在色标/描边/选中态用，卡片底一律深色）
local THEME = {
  bgDeep  = C(255, 11, 16, 24),     -- #0B1018 最深底
  panel   = C(255, 18, 26, 40),     -- #121A28 面板底
  card    = C(255, 30, 43, 68),     -- #1E2B44 卡片底（v2.4：压在深空墙上要浮起来）
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
-- v2.7 ⑦ 四种模式各自的主题背景（用户反馈⑦「和游戏开始页面一样，给四种游戏模式，分别设计主题背景」）。
-- 口径（可一行改色，改这里就够）：每种模式 = 一套「画面底色 + 棋盘背板 + 棋盘边框 + 上下强调线」，
-- 底色/背板压暗（保证格子对比），强调线用模式色（与标题页卡片色标一致，跨屏识别同一模式）。
-- 标题页（stage0）本身就是深空霓虹展台（MS.WALL），这里管的是**进局后的场景底色**。
local MODE_THEME = {
  casual       = { bg = C(255,  8, 17, 22), plate = C(255,  8, 14, 18), frame = C(255, 58, 108, 96),
                   accent = C(255, 45, 212, 191) },   -- 青绿 #2DD4BF
  ['ai-battle'] = { bg = C(255, 22,  9, 15), plate = C(255, 18,  7, 12), frame = C(255, 112, 44, 60),
                   accent = C(255, 244, 63, 94) },    -- 玫红 #F43F5E
  pvp          = { bg = C(255, 15,  9, 24), plate = C(255, 12,  7, 20), frame = C(255, 84, 56, 120),
                   accent = C(255, 168, 85, 247) },   -- 紫 #A855F7
  coop         = { bg = C(255, 22, 17,  8), plate = C(255, 18, 13,  5), frame = C(255, 108, 80, 36),
                   accent = C(255, 245, 158, 11) },   -- 琥珀 #F59E0B
}

local HELP_COLS = {
  { title = '操作 · 按键', lines = {
    '← → 移动　↑ 旋转　↓ 软降',
    '空格 直落　G 暂存',
    'R 重开　V 回主页　H 本页',
    'T 调试填底两行（测试用）',
    '',
    '双人 P1：A D 移动　W 旋转',
    '　　　　S 软降　空格 直落　G 暂存',
    '双人 P2：← → 移动　↑ 旋转',
    '　　　　↓ 软降　X 直落　F 暂存',
    '',
    '合作：P1 = 旋转手（W / G）',
    '　　　P2 = 行动手（← → / ↓ / X）',
    '',
    '标题页：1-4 选模式　任意键=休闲',
    '触屏：屏幕按钮同键盘',
  } },
  { title = '计分 · 判定', lines = {
    '消行 1/2/3/4 行 = 100/300/500/800',
    '　　× 等级（行数÷10+1，上限 12）',
    '连击：连续消行 +50×(链-1)×等级',
    'B2B：连续两次四消，基础分 ×1.5',
    'T-spin：T 块三角落定',
    '　　+400×消行数×等级',
    '软降 +1/格　硬降 +2/格',
    '锁定延迟：触底后 0.5s 可救',
    '　　（移动/旋转各重置一次，上限 15）',
    'DAS：按住方向 0.25s 后自动连移',
    '垃圾行：2/3/4 消送对方 1/2/4 行',
    '　　连四消再 +1 行（洞位随机）',
    '判负：新块出生位置已被占满',
    '　　双屏：任一方顶满即分胜负',
  } },
  { title = '四种模式', lines = {
    '1 休闲 casual',
    '　AI 陪练，任意键接管；停手 5s',
    '　提示 2s → AI 代打（分数照记）',
    '2 AI 对抗 ai-battle',
    '　双屏、镜像出块、hard 档 AI',
    '　你消 2/3/4 行送 AI 垃圾行',
    '　任一方顶满＝分胜负',
    '3 双人对战 pvp',
    '　双屏同屏 PK，键位分区（见左栏）',
    '　互送垃圾行，先顶满者败',
    '4 双人合作 coop',
    '　共一左盘抗右盘 AI',
    '　P1 旋转手 + P2 行动手，越权键无效',
    '　左盘顶满＝败　AI 盘顶满＝胜',
  } },
}

-- ===== 导出（main.lua 按名取用；新增字段记得同步导出）=====
M.COLS, M.ROWS, M.CELL, M.GAP, M.PITCH, M.STEP = COLS, ROWS, CELL, GAP, PITCH, STEP
M.TPL_GUIDS, M.NUM, M.C = TPL_GUIDS, NUM, C
M.SHAPES, M.BAG = SHAPES, BAG
M.THEME, M.MODE_INFO, M.MODE_TITLE, M.MODE_THEME = THEME, MODE_INFO, MODE_TITLE, MODE_THEME
M.HELP_COLS = HELP_COLS
-- 注意：COL_* 是**本文件的 local**，不能用 _G[name] 取（_G 里没有 → 全 nil → 格子没颜色，
-- 2026-10-28 实测：用例 01/05 的 imageColor 断言读到 null 才暴露）。逐个显式导出。
M.COL_EMPTY, M.COL_CYAN, M.COL_YELLOW, M.COL_PURPLE, M.COL_GREEN =
  COL_EMPTY, COL_CYAN, COL_YELLOW, COL_PURPLE, COL_GREEN
M.COL_RED, M.COL_BLUE, M.COL_ORANGE, M.COL_BG, M.COL_GRAY =
  COL_RED, COL_BLUE, COL_ORANGE, COL_BG, COL_GRAY
return M
