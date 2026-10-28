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
  DAS_HOLD   = 0.35,   -- v2.8：DAS 持续上限秒数（ARR 激活后超过即强制停）——单击语义硬化：
                        -- 真机日志定谳（2026-10-28 09:12 场）：v2.7 起 Up 正常到达、单击=恰 1 格、零 ARR 残留；
                        -- 旧构建（10-27 20:18 场）Up 丢失致 12 格连走 182 次 das cap。0.6→0.35 收紧安全网：
                        -- 即使 Up 再丢，单击最多多滑 ~4 格（0.25 DAS_DELAY + 0.35 HOLD），绝不「高速连走」
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
-- v3.0 浅底：空格=近白纸面（棋盘缝隙由「背板色」露出来当网格线），预览槽底=浅雾蓝，垃圾行=石板灰
local COL_EMPTY  = C(255, 252, 253, 255)
local COL_CYAN   = C(255, 60, 220, 240)
local COL_YELLOW = C(255, 245, 210, 60)
local COL_PURPLE = C(255, 170, 80, 240)
local COL_GREEN  = C(255, 90, 220, 110)
local COL_RED    = C(255, 240, 80, 90)
local COL_BLUE   = C(255, 70, 130, 240)
local COL_ORANGE = C(255, 245, 160, 60)
local COL_BG     = C(255, 232, 241, 250)
local COL_GRAY   = C(255, 146, 158, 178)  -- T7 垃圾行方块色（石板灰，浅底上仍可辨）

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

-- ===== 美术风格 v3.0（2026-10-28 全面改版）=====
-- 用户关键词：可爱 / 清新 / 原神 / 卡通 / 甘雨 / 刻晴 / 小草神 / 少女。
-- 上一版「深空霓虹」（深蓝黑底 + 霓虹色标）被连否两次（太丑 / 太冷）⇒ 整体换成**清透浅色**：
--   · 明部为主：近白天空底 + 奶油面板 + 描金细边（原神 UI 的奶油/描金语汇，比纯白更有体温）；
--   · 圆润语汇：胶囊（矩形+两圆）、圆点、圆环、星芒、花瓣——全部由六类内置图元拼，零新图片资产；
--   · 四模式各挂一位角色的意象色（D = 融合定稿）：休闲=纳西妲(草绿) · AI 对抗=刻晴(雷紫) ·
--     双人对战=少女(樱粉) · 双人合作=甘雨(冰蓝)。A/B/C = 同一套语汇的三种整体取向（出图对照）。
-- 切换变体只改下面一行（A 冰蓝雪山 / B 草木晨光 / C 紫雷柔光 / D 融合定稿）。
local STYLE_VARIANT = 'D'

-- A(alpha, color)：给一个已定义色加透明度（配色表里大量「同色不同透明度」的写法）
local function A(a, c) return C(a, (c // 65536) % 256, (c // 256) % 256, c % 256) end
-- 图元助手：spec = { s=图元, x, y, w, h, c, rot }（main.lua 的皮肤函数按同一字段名消费）
local function R(x, y, w, h, c, rot) return { s = 'rect', x = x, y = y, w = w, h = h, c = c, rot = rot } end
local function Dot(x, y, d, c) return { s = 'circle', x = x, y = y, w = d, h = d, c = c } end
local function Ring(x, y, d, c) return { s = 'ring', x = x, y = y, w = d, h = d, c = c } end
local function Star(x, y, d, c, rot) return { s = 'fourstar', x = x, y = y, w = d, h = d, c = c, rot = rot } end
local function Tri(x, y, w, h, c, rot) return { s = 'triangle', x = x, y = y, w = w, h = h, c = c, rot = rot } end
-- 预混：把半透明色盖在底面上算成不透明色（多件重叠拼图形时必须用，否则叠色出接缝）
local function blend(base, c, k)
  local br, bgc, bb = (base // 65536) % 256, (base // 256) % 256, base % 256
  local r, g, b = (c // 65536) % 256, (c // 256) % 256, c % 256
  return C(255, math.floor(br + (r - br) * k + 0.5), math.floor(bgc + (g - bgc) * k + 0.5),
    math.floor(bb + (b - bb) * k + 0.5))
end
-- 一朵云 = 一条扁矩形 + 两个错位圆（3 图元；云是「清新」最省预算的语汇）
local function cloud(cx, cy, w, c)
  local h = math.max(14, math.floor(w * 0.24))
  -- 矩形比两圆窄（0.62w）：两端被圆盖住 ⇒ 轮廓是云，不是「一根横条 + 两个圆」
  return { R(cx, cy - h * 0.55, w * 0.62, h, c), Dot(cx - w * 0.26, cy + h * 0.18, h * 1.6, c),
           Dot(cx + w * 0.16, cy + h * 0.36, h * 2.1, c) }
end
local function put(dst, list)
  for i = 1, #list do dst[#dst + 1] = list[i] end
  return dst
end
local CW = C(255, 255, 255, 255)

-- ── 进局背景：公共天空骨架（四角云 + 棋盘后的元素环 + 上下云带）+ 每模式母题 ──────────────
-- 13~14 条图元/模式；云与光斑用**不透明预混色**（多件重叠拼形状，半透明会叠出接缝）。
local function skyBase(t, base, accent)
  local cl = blend(base, CW, 0.74)
  put(t, cloud(-488, 296, 320, cl))            -- 左上云
  put(t, cloud(488, -296, 320, cl))            -- 右下云
  t[#t + 1] = Ring(0, 0, 520, A(42, accent))   -- 棋盘后的元素环（只露四边）
  t[#t + 1] = Ring(0, 0, 700, A(18, accent))
  t[#t + 1] = R(0, 344, 1760, 44, A(120, CW))  -- 上下云带
  t[#t + 1] = R(0, -344, 1760, 44, A(120, CW))
  return t
end
-- D（定稿）：清透天空 + 每模式角色母题（叶 / 雷 / 樱瓣 / 雪山），母题只放四角，不压字
local function bgD(base, accent, deep, kind)
  local t = skyBase({}, base, accent)
  if kind == 'leaf' then                       -- 纳西妲：林间光点（三角在浅底上像箭头，改用星芒）
    t[#t + 1] = Star(-556, 210, 46, A(200, accent))
    t[#t + 1] = Star(-498, 158, 28, A(160, accent))
    t[#t + 1] = Dot(-580, -200, 18, A(200, deep))
    t[#t + 1] = Star(566, 206, 26, A(180, deep))
  elseif kind == 'bolt' then                   -- 刻晴：雷纹 + 星芒
    t[#t + 1] = R(-556, 196, 96, 8, A(190, deep), 38)
    t[#t + 1] = R(-514, 148, 96, 8, A(150, deep), -34)
    t[#t + 1] = Star(566, 202, 34, A(200, accent))
    t[#t + 1] = Star(600, 150, 20, A(160, accent))
  elseif kind == 'petal' then                  -- 少女：樱瓣
    t[#t + 1] = R(-556, 196, 30, 15, A(200, accent), 28)
    t[#t + 1] = R(-500, 244, 24, 12, A(160, accent), -36)
    t[#t + 1] = Star(566, 202, 28, A(190, deep))
    t[#t + 1] = Dot(600, 150, 14, A(180, accent))
  else                                         -- 甘雨：雪山 + 冰晶
    t[#t + 1] = Tri(-560, 196, 92, 84, A(230, CW), 0)
    t[#t + 1] = Tri(-510, 176, 62, 56, A(210, accent), 0)
    t[#t + 1] = Star(566, 202, 34, A(200, accent))
    t[#t + 1] = Star(600, 150, 20, A(160, accent))
  end
  return t
end
-- A（冰蓝雪山）：远山 + 雪花，四模式同族换深浅
local function bgA(base, accent)
  local t = skyBase({}, base, accent)
  t[#t + 1] = Tri(-560, 186, 240, 160, A(215, C(255, 236, 248, 255)), 0)   -- 远山
  t[#t + 1] = Tri(-560, 150, 150, 104, A(230, C(255, 205, 232, 248)), 0)   -- 近山
  t[#t + 1] = Star(560, 200, 42, A(210, CW))                                -- 雪花
  t[#t + 1] = Star(600, 148, 24, A(170, CW))
  return t
end
-- B（草木晨光）：晨光圆 + 叶簇 + 草浪
local function bgB(base, accent)
  local t = skyBase({}, base, accent)
  t[#t + 1] = Dot(-556, 206, 132, blend(base, C(255, 246, 208, 96), 0.92))  -- 晨光
  t[#t + 1] = Tri(-560, 148, 58, 58, A(190, accent), 40)
  t[#t + 1] = Tri(-500, 200, 38, 38, A(150, accent), -30)
  t[#t + 1] = R(560, 200, 220, 10, A(150, accent), 14)                     -- 草浪
  t[#t + 1] = R(560, 150, 200, 10, A(120, accent), -12)
  return t
end
-- C（紫雷柔光）：星芒 + 雷纹
local function bgC(base, accent, gold)
  local t = skyBase({}, base, accent)
  t[#t + 1] = Star(-556, 200, 44, A(220, gold))
  t[#t + 1] = Star(-500, 152, 26, A(180, gold))
  t[#t + 1] = R(556, 196, 100, 8, A(190, accent), 36)
  t[#t + 1] = R(514, 148, 100, 8, A(150, accent), -34)
  return t
end

-- 标题页装饰：deco 列表里允许嵌入云（3 图元列表），这里展平成一条 spec 流
local function mkDeco(items)
  local out = {}
  for i = 1, #items do
    local it = items[i]
    if it.s then out[#out + 1] = it else put(out, it) end
  end
  return out
end
-- ── 变体 A：冰蓝雪山 · 甘雨（清爽白蓝；snowflake / ice crystal 母题）────────────────────
local A_ICE = C(255, 108, 186, 218)          -- #6CBADA 冰蓝
local A_DEEP = C(255, 47, 110, 143)          -- #2F6E8F 深海蓝（文字/描边）
local STYLE_A = {
  name = '冰蓝雪山',
  chrome = {
    wall = C(255, 246, 251, 255), wallAlt = C(255, 232, 243, 252),
    sky = C(255, 240, 248, 255), cloud = C(150, 255, 255, 255),
    petal = C(150, 200, 233, 248), mote = C(140, 255, 255, 255),
    panel = C(255, 252, 254, 255), card = C(255, 255, 255, 255), cardEdge = C(255, 205, 231, 242),
    textMain = C(255, 46, 78, 99), textSub = C(255, 109, 142, 163), textDim = C(255, 150, 178, 196),
    gold = C(255, 168, 216, 238), goldDeep = C(255, 47, 110, 143),
    bezel = C(255, 191, 224, 238), tick = C(200, 120, 176, 204),
    btnBg = C(226, 232, 246, 253), scrim = C(236, 246, 253, 255), helpBg = C(255, 246, 251, 255),
    shadow = C(30, 40, 96, 128), hint = C(255, 96, 126, 152),
  },
  modes = {
    { key = '1', name = '休 闲', desc = 'AI 代打陪练 · 随时接管', color = A_ICE, colorDeep = A_DEEP },
    { key = '2', name = 'AI 对抗', desc = '与 hard 档 AI 决战', color = C(255, 126, 160, 226), colorDeep = C(255, 66, 92, 152) },
    { key = '3', name = '双人对战', desc = '同屏 PK · 互送垃圾行', color = C(255, 155, 150, 220), colorDeep = C(255, 92, 82, 154) },
    { key = '4', name = '双人合作', desc = '旋转手+行动手 · 共盘抗 AI', color = C(255, 92, 190, 214), colorDeep = C(255, 38, 122, 148) },
  },
  modeTheme = {
    casual = { bg = C(255, 234, 246, 255), plate = C(255, 216, 238, 250), frame = C(255, 96, 170, 202), accent = A_ICE },
    ['ai-battle'] = { bg = C(255, 236, 244, 255), plate = C(255, 219, 233, 250), frame = C(255, 108, 142, 206), accent = C(255, 126, 160, 226) },
    pvp = { bg = C(255, 241, 242, 255), plate = C(255, 226, 226, 250), frame = C(255, 132, 118, 198), accent = C(255, 155, 150, 220) },
    coop = { bg = C(255, 232, 249, 255), plate = C(255, 210, 241, 252), frame = C(255, 62, 146, 176), accent = C(255, 92, 190, 214) },
  },
  deco = mkDeco({
    put({}, cloud(-470, 232, 360, C(160, 255, 255, 255))),
    put({}, cloud(470, 232, 360, C(160, 255, 255, 255))),
    Tri(-470, -250, 300, 190, C(150, 236, 248, 255), 0),
    Tri(470, -250, 320, 200, C(150, 226, 242, 252), 0),
    Star(-430, 158, 56, C(170, 255, 255, 255)),
    Star(430, 158, 42, C(160, 255, 255, 255)),
    Star(-500, 60, 32, C(150, 255, 255, 255)),
    Star(500, 60, 26, C(140, 255, 255, 255)),
  }),
}

-- ── 变体 B：草木晨光 · 纳西妲（嫩绿 + 奶白；叶片 / 光点 / 晨光）──────────────────────────
local B_GREEN = C(255, 124, 190, 90)          -- #7CBE5A 嫩绿
local B_DEEP = C(255, 62, 122, 52)            -- #3E7A34 深草绿
local STYLE_B = {
  name = '草木晨光',
  chrome = {
    wall = C(255, 249, 252, 244), wallAlt = C(255, 240, 248, 230),
    sky = C(255, 246, 251, 240), cloud = C(150, 255, 255, 255),
    petal = C(150, 214, 236, 168), mote = C(150, 255, 246, 208),
    panel = C(255, 255, 253, 246), card = C(255, 255, 255, 255), cardEdge = C(255, 226, 229, 196),
    textMain = C(255, 58, 74, 62), textSub = C(255, 118, 138, 116), textDim = C(255, 156, 172, 150),
    gold = C(255, 246, 226, 150), goldDeep = C(255, 176, 130, 46),
    bezel = C(255, 214, 226, 190), tick = C(200, 150, 190, 132),
    btnBg = C(226, 240, 250, 235), scrim = C(238, 249, 253, 242), helpBg = C(255, 250, 253, 245),
    shadow = C(30, 62, 98, 66), hint = C(255, 108, 136, 112),
  },
  modes = {
    { key = '1', name = '休 闲', desc = 'AI 代打陪练 · 随时接管', color = B_GREEN, colorDeep = B_DEEP },
    { key = '2', name = 'AI 对抗', desc = '与 hard 档 AI 决战', color = C(255, 168, 198, 72), colorDeep = C(255, 106, 138, 40) },
    { key = '3', name = '双人对战', desc = '同屏 PK · 互送垃圾行', color = C(255, 196, 176, 96), colorDeep = C(255, 138, 110, 48) },
    { key = '4', name = '双人合作', desc = '旋转手+行动手 · 共盘抗 AI', color = C(255, 96, 186, 146), colorDeep = C(255, 40, 120, 92) },
  },
  modeTheme = {
    casual = { bg = C(255, 246, 252, 236), plate = C(255, 228, 243, 214), frame = C(255, 110, 174, 78), accent = B_GREEN },
    ['ai-battle'] = { bg = C(255, 250, 253, 234), plate = C(255, 238, 245, 210), frame = C(255, 130, 164, 56), accent = C(255, 168, 198, 72) },
    pvp = { bg = C(255, 253, 250, 234), plate = C(255, 244, 236, 212), frame = C(255, 170, 146, 62), accent = C(255, 196, 176, 96) },
    coop = { bg = C(255, 240, 252, 246), plate = C(255, 218, 240, 224), frame = C(255, 56, 148, 118), accent = C(255, 96, 186, 146) },
  },
  deco = mkDeco({
    Dot(-450, 236, 160, C(120, 255, 246, 200)),        -- 晨光（左上角）
    put({}, cloud(470, 250, 360, C(170, 255, 255, 255))),
    Star(-470, 0, 46, A(170, B_GREEN)),                -- 两列卡片之间的空带
    Star(470, 0, 38, A(150, B_GREEN)),
    Tri(-560, -206, 56, 56, A(150, B_GREEN), 40),      -- 叶（左下角，避开胶囊与底栏）
    Tri(-500, -262, 38, 38, A(110, B_GREEN), -30),
    Dot(540, -206, 16, A(170, B_GREEN)),
    R(-600, -300, 300, 10, A(80, B_GREEN), -6),        -- 草浪（贴画布左下角）
    R(600, -300, 300, 10, A(80, B_GREEN), 6),
  }),
}

-- ── 变体 C：紫雷柔光 · 刻晴（soft 紫 + 白金；星芒 / 雷纹 / 环）───────────────────────────
local C_PURPLE = C(255, 154, 132, 230)        -- #9A84E6 柔紫
local C_DEEP = C(255, 92, 74, 168)            -- #5C4AA8 深紫
local C_GOLD = C(255, 226, 198, 122)          -- #E2C67A 浅金
local STYLE_C = {
  name = '紫雷柔光',
  chrome = {
    wall = C(255, 248, 246, 255), wallAlt = C(255, 240, 236, 255),
    sky = C(255, 244, 241, 255), cloud = C(140, 255, 255, 255),
    petal = C(160, 214, 196, 246), mote = C(150, 246, 226, 168),
    panel = C(255, 253, 251, 255), card = C(255, 255, 255, 255), cardEdge = C(255, 226, 214, 244),
    textMain = C(255, 62, 54, 104), textSub = C(255, 128, 118, 168), textDim = C(255, 164, 156, 196),
    gold = C(255, 226, 198, 122), goldDeep = C(255, 176, 138, 60),
    bezel = C(255, 222, 210, 240), tick = C(200, 160, 146, 208),
    btnBg = C(230, 238, 233, 252), scrim = C(240, 243, 247, 255), helpBg = C(255, 249, 247, 255),
    shadow = C(30, 60, 50, 120), hint = C(255, 112, 104, 152),
  },
  modes = {
    { key = '1', name = '休 闲', desc = 'AI 代打陪练 · 随时接管', color = C(255, 140, 190, 214), colorDeep = C(255, 52, 118, 146) },
    { key = '2', name = 'AI 对抗', desc = '与 hard 档 AI 决战', color = C(255, 176, 146, 240), colorDeep = C(255, 104, 74, 178) },
    { key = '3', name = '双人对战', desc = '同屏 PK · 互送垃圾行', color = C(255, 200, 160, 236), colorDeep = C(255, 138, 92, 176) },
    { key = '4', name = '双人合作', desc = '旋转手+行动手 · 共盘抗 AI', color = C(255, 150, 168, 236), colorDeep = C(255, 78, 96, 176) },
  },
  modeTheme = {
    casual = { bg = C(255, 244, 250, 253), plate = C(255, 226, 240, 248), frame = C(255, 108, 170, 198), accent = C(255, 140, 190, 214) },
    ['ai-battle'] = { bg = C(255, 246, 242, 255), plate = C(255, 232, 222, 250), frame = C(255, 132, 100, 200), accent = C(255, 176, 146, 240) },
    pvp = { bg = C(255, 250, 245, 255), plate = C(255, 240, 228, 250), frame = C(255, 162, 118, 198), accent = C(255, 200, 160, 236) },
    coop = { bg = C(255, 243, 244, 255), plate = C(255, 228, 226, 250), frame = C(255, 110, 120, 200), accent = C(255, 150, 168, 236) },
  },
  deco = mkDeco({
    put({}, cloud(-470, 234, 340, C(140, 255, 255, 255))),
    put({}, cloud(470, 234, 340, C(140, 255, 255, 255))),
    Star(-430, 150, 60, A(175, C_GOLD)),
    Star(430, 150, 44, A(160, C_GOLD)),
    Star(-470, 0, 44, A(175, C_GOLD)),                 -- 两列卡片之间的空带（原来压到卡片上）
    Star(470, 0, 36, A(150, C_GOLD)),
    R(-556, -232, 96, 8, A(150, C_PURPLE), 34),       -- 雷纹挪到左下角
    R(-516, -278, 96, 8, A(120, C_PURPLE), -32),
    R(556, -232, 96, 8, A(150, C_PURPLE), 34),
  }),
}

-- ── 变体 D（定稿）：融合 · 四角色四模式（全局清透天空 + 每模式角色意象色）──────────────────
local D_LEAF = C(255, 127, 207, 106)          -- 纳西妲 草绿
local D_BOLT = C(255, 179, 155, 234)          -- 刻晴 雷紫
local D_PETAL = C(255, 255, 168, 200)         -- 少女 樱粉
local D_ICE = C(255, 143, 216, 240)           -- 甘雨 冰蓝
local STYLE_D = {
  name = '四元素天空',
  chrome = {
    wall = C(255, 247, 252, 255), wallAlt = C(255, 236, 247, 254),
    sky = C(255, 242, 249, 255), cloud = C(140, 255, 255, 255),
    petal = C(150, 255, 186, 216), mote = C(130, 255, 240, 186),
    panel = C(255, 255, 253, 248), card = C(255, 255, 255, 255), cardEdge = C(255, 231, 213, 174),
    textMain = C(255, 62, 74, 99), textSub = C(255, 124, 140, 168), textDim = C(255, 158, 174, 198),
    gold = C(255, 232, 200, 138), goldDeep = C(255, 185, 138, 60),
    bezel = C(255, 226, 213, 184), tick = C(210, 215, 190, 130),
    btnBg = C(230, 234, 245, 252), scrim = C(234, 246, 251, 255), helpBg = C(255, 249, 253, 255),
    shadow = C(26, 110, 140, 176), hint = C(255, 93, 118, 148),
  },
  modes = {
    { key = '1', name = '休 闲', desc = 'AI 代打陪练 · 随时接管', color = D_LEAF, colorDeep = C(255, 63, 139, 60) },
    { key = '2', name = 'AI 对抗', desc = '与 hard 档 AI 决战', color = D_BOLT, colorDeep = C(255, 95, 76, 168) },
    { key = '3', name = '双人对战', desc = '同屏 PK · 互送垃圾行', color = D_PETAL, colorDeep = C(255, 192, 78, 124) },
    { key = '4', name = '双人合作', desc = '旋转手+行动手 · 共盘抗 AI', color = D_ICE, colorDeep = C(255, 47, 126, 158) },
  },
  modeTheme = {
    casual = { bg = C(255, 242, 250, 238), plate = C(255, 224, 241, 214), frame = C(255, 95, 168, 79), accent = D_LEAF },
    ['ai-battle'] = { bg = C(255, 245, 242, 255), plate = C(255, 232, 226, 251), frame = C(255, 124, 99, 201), accent = D_BOLT },
    pvp = { bg = C(255, 255, 244, 249), plate = C(255, 252, 228, 238), frame = C(255, 222, 115, 151), accent = D_PETAL },
    coop = { bg = C(255, 238, 249, 255), plate = C(255, 223, 241, 252), frame = C(255, 78, 157, 190), accent = D_ICE },
  },
  deco = mkDeco({
    -- 云只放四角（卡片区 y∈[-154,154] 必须留空，否则花瓣/星芒会压到字上）
    cloud(-540, 268, 300, C(170, 255, 255, 255)),
    cloud(540, -268, 300, C(170, 255, 255, 255)),
    Dot(-600, -330, 210, A(26, D_LEAF)),          -- 左下柔光斑（推到画布外一半，避免读成「脏斑」）
    Dot(600, 330, 210, A(22, D_ICE)),             -- 右上柔光斑
    Star(-470, 0, 48, A(150, D_LEAF)),            -- 两列卡片之间的空带上点缀
    Star(470, 0, 40, A(140, D_PETAL)),
    R(-424, 66, 30, 15, A(150, D_PETAL), 24),     -- 花瓣
    R(424, 74, 26, 13, A(140, D_PETAL), -30),
    Dot(-516, -186, 14, A(150, D_ICE)),
    Dot(516, 186, 12, A(130, D_LEAF)),
  }),
}
-- 注意 deco 里 `put({}, cloud(...))` 返回 3 条云图元（列表展开在 deco 里是多条 spec）。

STYLE_A.bg = {
  casual = bgA(STYLE_A.modeTheme.casual.bg, A_ICE),
  ['ai-battle'] = bgA(STYLE_A.modeTheme['ai-battle'].bg, C(255, 126, 160, 226)),
  pvp = bgA(STYLE_A.modeTheme.pvp.bg, C(255, 155, 150, 220)),
  coop = bgA(STYLE_A.modeTheme.coop.bg, C(255, 92, 190, 214)),
}
STYLE_B.bg = {
  casual = bgB(STYLE_B.modeTheme.casual.bg, B_GREEN),
  ['ai-battle'] = bgB(STYLE_B.modeTheme['ai-battle'].bg, C(255, 168, 198, 72)),
  pvp = bgB(STYLE_B.modeTheme.pvp.bg, C(255, 196, 176, 96)),
  coop = bgB(STYLE_B.modeTheme.coop.bg, C(255, 96, 186, 146)),
}
STYLE_C.bg = {
  casual = bgC(STYLE_C.modeTheme.casual.bg, C(255, 140, 190, 214), C_GOLD),
  ['ai-battle'] = bgC(STYLE_C.modeTheme['ai-battle'].bg, C(255, 176, 146, 240), C_GOLD),
  pvp = bgC(STYLE_C.modeTheme.pvp.bg, C(255, 200, 160, 236), C_GOLD),
  coop = bgC(STYLE_C.modeTheme.coop.bg, C(255, 150, 168, 236), C_GOLD),
}
STYLE_D.bg = {
  casual = bgD(STYLE_D.modeTheme.casual.bg, D_LEAF, C(255, 63, 139, 60), 'leaf'),
  ['ai-battle'] = bgD(STYLE_D.modeTheme['ai-battle'].bg, D_BOLT, C(255, 95, 76, 168), 'bolt'),
  pvp = bgD(STYLE_D.modeTheme.pvp.bg, D_PETAL, C(255, 192, 78, 124), 'petal'),
  coop = bgD(STYLE_D.modeTheme.coop.bg, D_ICE, C(255, 47, 126, 158), 'snow'),
}

local STYLES = { A = STYLE_A, B = STYLE_B, C = STYLE_C, D = STYLE_D }
local STYLE = STYLES[STYLE_VARIANT] or STYLE_D
local THEME = STYLE.chrome
THEME.deco = STYLE.deco or {}
local MODE_INFO = STYLE.modes
local MODE_TITLE = { casual = '休 闲', ['ai-battle'] = 'AI 对抗', pvp = '双人对战', coop = '双人合作' }
local MODE_THEME = STYLE.modeTheme

local HELP_COLS = {
  { title = '操作 · 按键', lines = {
    '!← → 移动　↑ 旋转　↓ 软降',
    '!空格 直落　G 暂存',
    '!R 重开　V 回主页　H 本页',
    'T 调试填底两行（测试用）',
    '',
    '!双人 P1：A D 移动　W 旋转',
    '　　　　S 软降　空格 直落　G 暂存',
    '!双人 P2：← → 移动　↑ 旋转',
    '　　　　↓ 软降　X 直落　F 暂存',
    '',
    '!合作：P1 = 旋转手（W / G）',
    '　　　P2 = 行动手（← → / ↓ / X）',
    '',
    '!标题页：1-4 选模式　任意键=休闲',
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

-- ===== v3.0 四模式主题背景（用户 2026-10-28：「四种模式要设计四种主题的背景」）=====
-- 构图全部由本文件顶部的构图生成器产出（bgD / bgA / bgB / bgC），每模式一套**图形构图**而不是换色：
--   休闲 casual「叶簇光点」 · AI 对抗「雷纹星芒」 · 双人对战「樱瓣小星」 · 双人合作「雪山冰晶」
-- 字段：s=图元 x,y=中心 w,h=尺寸 c=ARGB rot=Z 旋转角度（度）；由 main.lua 的 bg 池换肤（不新建实例，
-- 因为背景必须在棋盘**之下**，运行中新建的实例会盖住棋盘）。
MODE_BG = STYLE.bg
-- 背景池容量 = **最大条目数 + 1**（第 1 件是整屏底色；本版各模式 ≤15 条 ⇒ 池 18 有余量）
MODE_BG_POOL = 18
-- 背景池容量 = **最大条目数 + 1**（第 1 件是整屏底色；2026-10-28 实测 ai-battle 17 条 ⇒ 池 18）。
-- 池在 OnStart 一次性建好（必须早于棋盘 ⇒ 压在棋盘之下），换模式只换肤不新建实例。
MODE_BG_POOL = 18
M.MODE_BG, M.MODE_BG_POOL = MODE_BG, MODE_BG_POOL

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
