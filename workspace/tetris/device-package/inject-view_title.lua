--[[==========================================================================
 tetris/view_title.lua —— 标题屏（展台 + 四模式卡 + 入口卡 + 三态）的**纯描述**
 ----------------------------------------------------------------------------
 为什么要有这个文件：标题屏是「多层级菜单展示」域的入口，也是全工程层序事故最密的一块。
 现网（main.lua 的 MS 表，锚 'MS.build = function' / 'MS.modes = function' /
 'MS.buildHoverZones = function' / 'buildMenuCards = function'）把它写成三段命令式建控件：
   MS.build（展台 + 两张入口卡）→ MS.modes（四张卡 + 品牌标）→ MS.buildHoverZones（热区），
 层序全靠这三行的**调用顺序**，而「谁该压谁」还随状态翻转：
   · 展台墙建得比 HUD 晚 ⇒ 盖住 HUD 与预览槽；建得比 wash 早 ⇒ 被 wash 盖住（两条都踩过）；
   · 说明页/角色页靠「先拆展台再建浮层、关页再建回来」（FN.syncStage 每帧比对）维持；
   · HUD_INST 10 件建在展台**之后** ⇒ 永远压着展台，只能 hideAll 挪到 y=-4000 假装隐藏；
   · SetAsLastSibling 在本引擎是空操作（platform.lua 的两个 mock 方法都是空函数），
     现网曾靠它「重新置顶」并打印成功日志 ⇒ 假成功信号骗过按日志排查的人（已删）。
 本模块把标题屏变成一份数据，三条结构约束写死在生成器里：
   C1 层序 = 语义层号：展台墙/云带/装饰/视窗阴影/描金边/四角括号 → 'bg'(20)；
      标题横幅/大字/底部提示条/版本水印/品牌标/旅行者手记 → 'hud'(40)；
      四张模式卡与两张入口卡（胶囊 + 宝珠 + 内环 + 星芒 + 标题 + 特色句）→ 'card'(60)；
      全部热区 → 'touch'(70)。⇒ 展台墙恒在 HUD 之下、四张卡恒在其上，不依赖调用顺序。
   C2 三态只改色/尺寸/位移，不改节点数：常态 / 悬浮(dy=+6) / 按下(dy=-6) / 选中，
      四态节点数逐字相同（测试 D 组钉住）⇒ 接线方可以每帧无脑重放整张描述。
   C3 半透明一律预混成不透明：现网 menuShade*（alpha 26）、四角括号（alpha 210）、
      装饰星云（alpha 130~175）直接贴图；本模块全部 opaque(wash, c) 预混成 alpha=255
      （观感 = 压在天空墙上的合成结果）⇒ 半透明叠印缝与「近似隐形」在描述层就表达不出来。
 层号与现网创建序的对应关系（见 .scratch/lead/refactor-control-tree.md §4.1）：
   现网序：墙/云带/装饰/阴影/描金边/角标(2582-2671) → 棋盘/预览 → 入口卡(2643-2672) →
           横幅/大字/提示条/水印(2569-2601) → 四模式卡(2920-2989) → HUD 实例 → 热区(3113)。
   本模块序：bg(34) → hud(13) → card(46) → touch(7)——与现网**视觉结果**一致，
   但不再依赖上述调用顺序（把展台墙挪到最后建也盖不住 HUD，见测试 E1 负样本）。
 数值/文案出处（写死的都标锚；行号会漂，锚串不会）：
   · 展台几何（视窗 ±151 / ±301、四面墙、云带、视窗阴影、描金边 3px、四角括号 44×3）
     ← main.lua 'MS.build = function'（winHalf/winTop/winBot、menuWall*/menuSky*/
       menuShade*/menuBezel*/menuTick*）
   · 标题横幅（580 宽、字号 52/44 按 halfH>400 切换、y=min(winTop+(halfH-winTop)/2+2, halfH-48)、
     底部细线 150×3）与大字 660×⌊字号×1.45+12⌋ ← 同上（menuBanner/menuBannerRule/menuBig）
   · 底部提示条三段 26 号、y=-(halfH-28)、x=-290/0/290、宽 215/250/215、两点 6×6 @±148
     ← 同上（segs / menuHint / menuDot），文案 ← MS.hintText
   · 版本水印（画布右下，220×22 13 号）与品牌标（画布左上，390×34 16 号）
     ← 同上（menuBuildTag / menuSub）
   · 旅行者手记一行（-420,-215,380×40,18 号）← 同上（MS.note）+ config.COPY.title
   · 四张模式卡（行 ±420/±104、胶囊 400×100 @cx+10、宝珠 22 circle @cx-160、
     星芒 26 fourstar @cx+178、标题 330×70 38 号 @cx+30/+18、特色句 330×32 15 号 @cx+30/-30）
     ← main.lua 'MS.modes = function'（MC_ROW；MENU_STYLE 的 A 分支）
   · 三态（悬浮 dy=+6 / 填色 0.32 / 标题 44 号 / 宝珠 30；按下 dy=-6 / 0.46 / 40 号 / 26；
     选中 0.34 / 44 号 / 30）← main.lua 'MS.cardStyle = function' 与 'MS.select = function'
   · 入口卡（角色档案 290×96 @(ex,ey)、说明 176×78 @(ex-240,ey)、
     ex=min(520, W/2-169)、ey=PC?302:(H/2-138)、四色点 14 @ex-136 步进 22、热区 +40/+24）
     ← main.lua 'MS.build = function' 的 rosterBtn/helpBtn 段 + controls.lua 'API.btn'
   · 模式色/名称/特色句 ← config.MODE_INFO（= STYLE.modes；当前 STYLE_VARIANT='D'）
  与现网的**已知不一致**（逐条理由见交付报告）：
   · 版本水印框高 22→25：13 号字需要 22.85（引擎 requiredHeight = 1.2f + 0.25f+4），
     现网 22 ⇒ fits=false 整条不画（与 main.lua 注释里「120×34 装 22 号字 ⇒ 空胶囊」同型）。
   · 宝珠加内环（ring 图元，直径 = 宝珠×0.6，浅色）：让 ring 通道在标题屏有真实用例、
     能被引擎侧 imageId 断言；现网只有实心圆。内环与宝珠同心、一起随三态移动/缩放。
   · 入口卡的三态/音效/命中注册（UI4.regAdd）不在本模块：这里只出几何 + 热区 + 回调，
     三态由接线方按 controls.lua 的 lift=4 自行驱动（音效属输入层）。
   · 底部提示条的呼吸（26↔28 号、alpha 190..250 每帧抖）与手记轮播（6.1s 周期）不出：
     那是**状态**——接线方按帧号传 opts.hints / opts.noteIdx 重算，本模块只给一帧。
   · 水印文案缺省 'v6 · tetris'（现网是 main.lua 的 BUILD_TAG 全局常量，可由 opts.buildTag 注入）。
   · 标题屏沿用现网的**固定设计坐标**（卡/装饰/入口卡不随画布缩放，只有墙/云带/角标/
     水印/品牌标按画布算）——照抄未改，后果见交付报告的缺陷清单。
   · 装饰图元带 rot（现网 MS.addShape 会 SetLocalRotation）：描述保留 rot 字段，
     但 render.applyFields 目前没有 rotation 通道 ⇒ 4 件花瓣/雷纹会以未旋转形态出现（render 缺口）。
 契约：Lua 5.3；不 require 任何 tetris 模块（config/layers/kit 由 spec 注入）；不写日志；
       不调用引擎 API；chunk 顶层只有表与函数。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_title_test.lua
 ========================================================================]]

local M = {}

local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end

-- ===== 设计基准（现网标题屏按 1600×900 摆位；画布只影响墙/云带/角标/水印/品牌标）=====
M.DESIGN = { W = 1600, H = 900 }

-- 展台（中央视窗 + 四面墙 + 云带 + 阴影 + 描金边 + 四角括号）
M.STAGE = {
  winHalf = 151, winTop = 301, winBot = -301,   -- 棋盘视窗（frame ±150 / 背板 306×606 的外沿）
  wallOverscan = 8,                             -- 墙比画布宽 +8：遮住边缘抗锯齿缝
  skyT = { dy = 24, h = 48 },                   -- 顶部云带（halfH-24 中心）
  skyB = { dy = 20, h = 40 },                   -- 底部云带
  skyOverscan = 8,
  shade = { out = 10, w = 20, pad = 30 },       -- 视窗内阴影：贴边内外各 10，长度 +30/+8
  bezel = { h = 3, pad = 8 },                   -- 描金细边
  corner = { arm = 44, thick = 3, inset = 12 }, -- 四角括号
}

-- 标题横幅 + 大字
M.BANNER = {
  w = 580, hPad = 20,
  fsWide = 52, fsNarrow = 44, hthr = 400,       -- halfH > 400 ⇒ 52 号（现网 titleSize）
  yMid = 0.5, yDy = 2, yTopInset = 48,          -- y = min(winTop+(halfH-winTop)*0.5+2, halfH-48)
  ruleW = 150, ruleH = 3, ruleDy = 6,           -- menuBannerRule
  bigW = 660, bigHPad = 12,                     -- menuBig：框高 = ⌊字号×1.45+12⌋
  bigDefault = '俄罗斯方块',
  focusW = 720, focusH = 100, focusFs = 26,     -- MS.focusLock：模式名大字（动画窗 0.5s）
}

-- 底部提示条（三段 + 两个分隔点）
M.HINT = {
  dy = 28, h = 50, font = 26,                   -- y = -(halfH-28)
  segs = {
    { text = '1-4 选模式', x = -290, w = 215 },
    { text = '任意键 = 休闲', x = 0, w = 250 },
    { text = 'H 游戏说明', x = 290, w = 215 },
  },
  dotX = 148, dotD = 6,
}

-- 四张模式卡（MENU_STYLE A：胶囊卡 + 元素宝珠 + 星芒 + 左对齐标题/特色句）
M.CARD = {
  rows = { { -420, 104 }, { -420, -104 }, { 420, 104 }, { 420, -104 } },
  pillW = 400, pillH = 100, pillDx = 10,
  titleDx = 30, titleW = 330, titleH = 70, titleDy = 18,
  descW = 330, descH = 32, descDy = -30, descFs = 15,
  beadDx = -160, ringRatio = 0.6, ringLight = 0.55,
  starDx = 178, starD = 26,
  -- 三态 / 选中（键名 = 状态名；MS.cardStyle / MS.select 的数值）
  fillK = { normal = 0.17, hover = 0.32, press = 0.46, select = 0.34 },
  titleFs = { normal = 38, hover = 44, press = 40, select = 44 },
  beadD = { normal = 22, hover = 30, press = 26, select = 30 },
  starA = { normal = 150, hover = 230, press = 230, select = 230 },
  dy = { normal = 0, hover = 6, press = -6, select = 0 },
  hitW = 416, hitH = 108,                       -- menuZone：胶囊 +8/+8 手感
}

-- 两张入口卡（角色档案 / 说明）
M.ENTRY = {
  exMax = 520, exInset = 169, eyPc = 302, eyMobileInset = 138, helpDx = -240,
  -- v6.14（设计审计：两张入口卡高度 96/78、标题 22/20、副标 13/12 互不相同，看着像没做完）：
  -- 统一 h=88、标题 22、副标 13，只保留宽度差表达主次（角色档案宽、说明窄）。
  roster = { w = 290, h = 88, fs = 22, subFs = 13, pad = 86, padSub = 16,
    titleDy = 18, subDy = 18, label = '角色档案',
    subPc = 'I 键 · 契约与技能', subMobile = '点我看契约与技能' },
  help = { w = 176, h = 88, fs = 22, subFs = 13, pad = 16, padSub = 16,
    titleDy = 18, subDy = 18, label = '说明',
    subPc = 'H 键 · 全部规则', subMobile = '点我看规则' },
  dots = { { 127, 207, 106 }, { 177, 140, 255 }, { 143, 218, 240 }, { 88, 208, 196 } },
  dotDx = -136, dotStep = 22, dotDy = 16, dotD = 14,
  hitPadW = 40, hitPadH = 24,
}

-- 品牌标（画布左上）与版本水印（画布右下）
M.SUB = { text = 'TEYVAT SKY · 四元素街机', w = 390, h = 34, font = 16, xInset = 210, yInset = 72 }
M.TAG = { w = 220, h = 25, font = 13, xInset = 120, yInset = 16, text = 'v6 · tetris' }

-- 旅行者手记（一行；轮播是状态，交接线方按帧号换 noteIdx）
M.NOTE = { x = -420, y = -215, w = 380, h = 40, font = 18 }

-- v6.30：轮播旁白（旅行者手记）的锚点**只在这里算一次**。
-- 之前 view_title 用 M.NOTE.y=-215 出节点、main 的轮播又用写死的 (-420,-215) 覆盖一次
-- ⇒ 两处数字各写一遍：改了一处另一处照旧（本轮就是 main 那份把缩放后的位置又拽回设计值，
-- 于是文字落到 2 号卡后面被压掉一半）。现在 main 调这个函数取锚点。
function M.noteAnchor(halfH) return M.NOTE.x, -(halfH - 62) end

-- 层名（语义层号来自 view_layers；这里只写名字，数字不重复出现）
M.LAYER = { stage = 'bg', hud = 'hud', card = 'card', hit = 'touch' }

-- role 标记：测试按 role 聚合断言层号分布，避免按 key 前缀硬编码
M.ROLE = {
  wall = 'wall', sky = 'sky', deco = 'deco', shade = 'shade', bezel = 'bezel', tick = 'tick',
  banner = 'banner', rule = 'rule', big = 'big', hint = 'hint', dot = 'dot',
  tag = 'tag', sub = 'sub', note = 'note',
  cardBg = 'cardBg', bead = 'bead', ring = 'ring', star = 'star',
  cardTitle = 'cardTitle', cardDesc = 'cardDesc',
  entryBg = 'entryBg', entryTitle = 'entryTitle', entrySub = 'entrySub', entryDot = 'entryDot',
  hit = 'hit',
}

-- 引擎内置图元 → imageId（测试做引擎侧断言用；真源在 platform.setImage）
M.SHAPE_ID = { rect = 100001, circle = 100002, triangle = 100003,
  fourstar = 100004, fivestar = 100005, ring = 100006 }

-- 模式 id（与 main.lua menuSelectMode 的 ({'casual','ai-battle','pvp','coop'}) 同序）
M.MODE_IDS = { 'casual', 'ai-battle', 'pvp', 'coop' }

-- 四张卡的文案兜底（config.MODE_INFO 缺失时用；数值与 config.lua STYLE_D.modes 逐字相同）
M.FALLBACK_MODES = {
  { key = '1', name = '休 闲', desc = 'AI 代打陪练 · 随时接管',
    color = C(255, 127, 207, 106), colorDeep = C(255, 63, 139, 60) },
  { key = '2', name = 'AI 对抗', desc = '与 hard 档 AI 决战',
    color = C(255, 179, 155, 234), colorDeep = C(255, 95, 76, 168) },
  { key = '3', name = '双人对战', desc = '同屏 PK · 互送垃圾行',
    color = C(255, 255, 168, 200), colorDeep = C(255, 192, 78, 124) },
  { key = '4', name = '双人合作', desc = '旋转手+行动手 · 共盘抗 AI',
    color = C(255, 143, 216, 240), colorDeep = C(255, 47, 126, 158) },
}

M.new = function(spec)
  spec = spec or {}
  local cfg = assert(spec.config, 'view_title: 需要 spec.config')
  local L = assert(spec.layers, 'view_title: 需要 spec.layers（view_layers）')
  local K = assert(spec.kit, 'view_title: 需要 spec.kit（view_kit）')
  local THEME = assert(cfg.THEME, 'view_title: config.THEME 必须是 THEME（= STYLE.chrome）')
  local MODE_INFO = cfg.MODE_INFO or {}
  local MODE_TITLE = cfg.MODE_TITLE or {}
  local COPY = cfg.COPY or {}

  -- 层名先过 view_layers：写错当场报错，而不是渲染时静默按 hud 处理
  for _, name in pairs(M.LAYER) do L.order(name) end

  local S = {}

  -- ===== 颜色工具（与 view_node.unpack / view_kit.C 同口径）=====
  local function parts(c)
    local v = c or 0
    if v < 0 then v = v + 4294967296 end
    return (v // 16777216) % 256, (v // 65536) % 256, (v // 256) % 256, v % 256
  end
  -- 任何颜色 → alpha=255 的不透明版（观感 = 压在该底色上的结果）。这是结构约束 C3。
  local function opaque(base, c)
    local a, r, g, b = parts(c)
    if a == 255 then return c end
    return K.over(base, K.C(255, r, g, b), a / 255)
  end

  -- 文字框高：≥ ⌈字号×1.45+6⌉（引擎 fits 判据 1.45×+4，再留 2px 余量）
  local function hOf(font)
    local a = math.ceil(font * 1.45 + 6)
    local b = math.floor(font * 1.5 + 6)
    return (b > a) and b or a
  end

  -- 状态名 ↔ 下标（opts.active 可给 1..4 或模式 id 字符串）
  local function indexOf(v)
    if type(v) == 'number' then return v end
    if type(v) == 'string' then
      for i = 1, #M.MODE_IDS do
        if M.MODE_IDS[i] == v then return i end
      end
    end
    return nil
  end

  -- ===== 主入口：opts → node 数组 =====
  -- opts = {
  --   canvas = { w, h }, device = 'pc' | 'mobile',
  --   modes = { { key, name, desc, color, colorDeep }, ... },   -- 覆盖 config.MODE_INFO
  --   active = 1..4|modeId, hover = 1..4|modeId, pressed = 1..4|modeId,
  --   stage = { on = true, visible = true, title = '俄罗斯方块', mode = 'pvp' },
  --   hints = { '段1', '段2', '段3' }, noteIdx = 1, note = '自定义文案', noteAlpha = 255,
  --   buildTag = 'v6 · tetris',
  --   -- 回调：onPick(i) 接 CursorDown（按下即选，触屏的"选中反馈"通道）；
  --   --       onConfirm(i) 接 CursorClick（点一下确认/开局 = 现网 menuSelectMode）。
  --   --       两步选择还是单击直接开，由接线方决定挂哪个（现网单击即开 ⇒ 只挂 onConfirm）。
  --   onPick = fn(i), onConfirm = fn(i), onRoster = fn(), onHelp = fn(),
  -- }
  S.title = function(opts)
    opts = opts or {}
    local device = opts.device or 'pc'
    if device ~= 'pc' and device ~= 'mobile' then
      error("view_title: opts.device 只认 'pc' / 'mobile'，收到 " .. tostring(device))
    end
    local stageOpt = opts.stage or {}
    if type(stageOpt) ~= 'table' then
      error('view_title: opts.stage 必须是表 { on, visible, title, mode }')
    end
    -- stage.on：展台在不在（现网 MS.build / MS.teardown）。false ⇒ 一件展台零件都不出。
    local stageOn = (stageOpt.on == nil) and true or (stageOpt.on and true or false)
    -- stage.visible：展台在但先声明为不可见（引擎对运行时实例 SetVisible 不可靠，
    -- 真隐藏请用 stage.on=false；这一档只用于「接线方自己按状态切描述」的过渡帧）。
    local stageVisible = (stageOpt.visible == nil) and true or (stageOpt.visible and true or false)

    local canvas = opts.canvas or { M.DESIGN.W, M.DESIGN.H }
    local W, H = canvas[1] or M.DESIGN.W, canvas[2] or M.DESIGN.H
    local halfW, halfH = W / 2, H / 2

    local wall = THEME.wall or K.C(255, 247, 252, 255)
    local wallAlt = THEME.wallAlt or wall
    local gold = THEME.gold or K.C(255, 232, 200, 138)
    local goldDeep = THEME.goldDeep or K.C(255, 185, 138, 60)
    local ink = THEME.textMain or K.C(255, 62, 74, 99)
    local subInk = THEME.textSub or ink
    local shadeC = opaque(wall, THEME.shadow or K.C(26, 110, 140, 176))
    local bezelC = opaque(wall, THEME.bezel or gold)
    local tickC = opaque(wall, THEME.tick or gold)

    local out = {}
    local function add(n)
      n.seq = #out + 1
      out[#out + 1] = n
      return n
    end
    -- 图元节点：**每个都显式带 image**（不靠模板默认 ⇒ headless 可断言 imageId）
    local function shape(key, role, layer, x, y, w, h, color, sh, rot)
      return add {
        key = key, name = key, role = role, layer = layer, tpl = 'cell',
        pos = { x, y }, size = { w, h }, color = color,
        image = { s = sh or 'rect' }, rot = rot,
      }
    end
    local function txt(key, role, layer, str, x, y, w, h, font, color, align)
      local n = K.text {
        key = key, name = key, x = x, y = y, w = w, h = h, text = str or '',
        font = font, color = color, bg = 0, align = align or 'Middle', valign = 'Middle',
        layer = layer,
      }
      n.role = role
      return add(n)
    end
    -- 胶囊（view_kit.pill = 中段 rect + 左右 circle 端点；端点必须 circle 才是圆角）
    local function pill(key, role, layer, x, y, w, h, color)
      local nodes = K.pill { key = key, x = x, y = y, w = w, h = h, color = color,
        layer = layer, capShape = 'circle' }
      for i = 1, #nodes do
        nodes[i].role = role
        add(nodes[i])
      end
      return nodes
    end
    local function hit(key, x, y, w, h, cursors, on)
      return add {
        key = key, name = key, role = M.ROLE.hit, layer = M.LAYER.hit, tpl = 'hit',
        pos = { x, y }, size = { w, h }, cursor = cursors, on = on,
      }
    end
    local function cb(fn, i)
      if not fn then return nil end
      return function() fn(i) end
    end
    -- 单事件回调表（on 必须是 { 事件名 = fn } 的映射，不是裸函数；render 按 cursor 表逐项查）
    local function clickOnly(fn)
      if not fn then return nil end
      return { CursorClick = fn }
    end

    -- ===== ① 展台（stage.on=false 时整块不出）=====
    if stageOn then
      local ST = M.STAGE
      local winHalf, winTop, winBot = ST.winHalf, ST.winTop, ST.winBot
      local sideW = halfW - winHalf
      local sideH = winTop - winBot
      local sideCY = (winTop + winBot) / 2
      -- 四面深空墙：只留中央视窗（+overscan 遮住画布边缘缝）
      shape('menuWallL', M.ROLE.wall, M.LAYER.stage, -(winHalf + sideW / 2), sideCY,
        sideW, sideH, wall)
      shape('menuWallR', M.ROLE.wall, M.LAYER.stage, winHalf + sideW / 2, sideCY,
        sideW, sideH, wall)
      shape('menuWallT', M.ROLE.wall, M.LAYER.stage, 0, (halfH + winTop) / 2,
        W + ST.wallOverscan, halfH - winTop + 1, wall)
      shape('menuWallB', M.ROLE.wall, M.LAYER.stage, 0, (winBot - halfH) / 2,
        W + ST.wallOverscan, halfH + winBot + 1, wall)
      -- 顶部/底部云带（比墙深一档）
      shape('menuSkyT', M.ROLE.sky, M.LAYER.stage, 0, halfH - ST.skyT.dy,
        W + ST.skyOverscan, ST.skyT.h, wallAlt)
      shape('menuSkyB', M.ROLE.sky, M.LAYER.stage, 0, -halfH + ST.skyB.dy,
        W + ST.skyOverscan, ST.skyB.h, wallAlt)
      -- 装饰（云 / 星芒 / 花瓣 / 光点）：config.THEME.deco 的 spec 流，逐条预混后出节点
      local deco = THEME.deco or {}
      for i = 1, #deco do
        local d = deco[i] or {}
        shape('menuDeco' .. i, M.ROLE.deco, M.LAYER.stage, d.x or 0, d.y or 0,
          d.w or 0, d.h or 0, opaque(wall, d.c), d.s, d.rot)
      end
      -- 视窗内阴影（贴边内外各 10）：现网 alpha 26 直接贴 ⇒ 这里预混成不透明
      -- v6.28（用户真机图一「最下面一行被截断」）：上下两条阴影带原来落在**视窗内**
      -- （winTop-10 / winBot+10 ⇒ 各占视窗 20 单位），正好压在棋盘第一行/最后一行的下半截。
      -- 左右两条本来就在窗外（±(winHalf+10)）；这里改成一并放窗外，四条对称、不再压格子。
      shape('menuShadeT', M.ROLE.shade, M.LAYER.stage, 0, winTop + ST.shade.out,
        2 * winHalf + ST.shade.pad, ST.shade.w, shadeC)
      shape('menuShadeB', M.ROLE.shade, M.LAYER.stage, 0, winBot - ST.shade.out,
        2 * winHalf + ST.shade.pad, ST.shade.w, shadeC)
      shape('menuShadeL', M.ROLE.shade, M.LAYER.stage, -winHalf - ST.shade.out, sideCY,
        ST.shade.w, sideH + 8, shadeC)
      shape('menuShadeR', M.ROLE.shade, M.LAYER.stage, winHalf + ST.shade.out, sideCY,
        ST.shade.w, sideH + 8, shadeC)
      -- 描金细边（四条）
      shape('menuBezelT', M.ROLE.bezel, M.LAYER.stage, 0, winTop,
        2 * winHalf + ST.bezel.pad, ST.bezel.h, bezelC)
      shape('menuBezelB', M.ROLE.bezel, M.LAYER.stage, 0, winBot,
        2 * winHalf + ST.bezel.pad, ST.bezel.h, bezelC)
      shape('menuBezelL', M.ROLE.bezel, M.LAYER.stage, -winHalf, sideCY,
        ST.bezel.h, sideH + 8, bezelC)
      shape('menuBezelR', M.ROLE.bezel, M.LAYER.stage, winHalf, sideCY,
        ST.bezel.h, sideH + 8, bezelC)
      -- 四角括号（画布四角，各两条）
      local arm, thick, inset = ST.corner.arm, ST.corner.thick, ST.corner.inset
      for _, sx in ipairs({ -1, 1 }) do
        for _, sy in ipairs({ -1, 1 }) do
          local tag = (sx > 0 and 'R' or 'L') .. (sy > 0 and 'T' or 'B')
          shape('menuTickH' .. tag, M.ROLE.tick, M.LAYER.stage, sx * (halfW - arm / 2 - inset),
            sy * (halfH - inset), arm, thick, tickC)
          shape('menuTickV' .. tag, M.ROLE.tick, M.LAYER.stage, sx * (halfW - inset),
            sy * (halfH - arm / 2 - inset), thick, arm, tickC)
        end
      end

      -- ===== ② 标题横幅 + 大字（hud 层：压在展台墙上）=====
      local BN = M.BANNER
      local titleSize = (halfH > BN.hthr) and BN.fsWide or BN.fsNarrow
      local titleY = math.min(winTop + (halfH - winTop) * BN.yMid + BN.yDy, halfH - BN.yTopInset)
      local bannerH = titleSize + BN.hPad
      pill('menuBanner', M.ROLE.banner, M.LAYER.hud, 0, titleY, BN.w, bannerH,
        K.over(wall, gold, 0.34))
      shape('menuBannerRule', M.ROLE.rule, M.LAYER.hud, 0, titleY - bannerH / 2 + BN.ruleDy,
        BN.ruleW, BN.ruleH, goldDeep)
      -- 大字：常态 = 游戏名（可被 stage.title 覆盖）；stage.mode ⇒ MS.focusLock 的模式名大字
      local bigText = (type(stageOpt.title) == 'string') and stageOpt.title or BN.bigDefault
      local bigFs, bigW, bigH = titleSize, BN.bigW, math.floor(titleSize * 1.45 + BN.bigHPad)
      local bigY, bigColor = titleY, goldDeep
      if stageOpt.mode ~= nil then
        local idx = indexOf(stageOpt.mode)
        local info = idx and MODE_INFO[idx] or nil
        bigText = MODE_TITLE[stageOpt.mode] or tostring(stageOpt.mode)
        bigFs, bigH = BN.focusFs, BN.focusH
        bigW, bigY = BN.focusW, 0
        bigColor = (info and info.colorDeep) or ink
      end
      txt('menuBig', M.ROLE.big, M.LAYER.hud, bigText, 0, bigY, bigW, bigH, bigFs, bigColor)

      -- ===== ③ 底部提示条（三段 + 两个分隔点）=====
      local lineY = -(halfH - M.HINT.dy)
      local hints = opts.hints
      for i = 1, #M.HINT.segs do
        local seg = M.HINT.segs[i]
        local txtStr = (type(hints) == 'table' and type(hints[i]) == 'string')
          and hints[i] or seg.text
        txt('menuHint' .. i, M.ROLE.hint, M.LAYER.hud, txtStr, seg.x, lineY, seg.w,
          M.HINT.h, M.HINT.font, ink)
      end
      shape('menuDot1', M.ROLE.dot, M.LAYER.hud, -M.HINT.dotX, lineY, M.HINT.dotD,
        M.HINT.dotD, gold)
      shape('menuDot2', M.ROLE.dot, M.LAYER.hud, M.HINT.dotX, lineY, M.HINT.dotD,
        M.HINT.dotD, gold)

      -- ===== ④ 版本水印（画布右下）+ 品牌标（画布左上）=====
      local tag = opts.buildTag or M.TAG.text
      if tag ~= '' then
        txt('menuBuildTag', M.ROLE.tag, M.LAYER.hud, tag, W / 2 - M.TAG.xInset,
          -(H / 2 - M.TAG.yInset), M.TAG.w, M.TAG.h, M.TAG.font, subInk)
      end
      txt('menuSub', M.ROLE.sub, M.LAYER.hud, M.SUB.text, -(W / 2 - M.SUB.xInset),
        H / 2 - M.SUB.yInset, M.SUB.w, M.SUB.h, M.SUB.font, subInk, 'Left')

      -- ===== ⑤ 旅行者手记（一行；轮播是状态）=====
      local noteText, noteColor = opts.note, opts.noteColor
      if type(noteText) ~= 'string' then
        local recs = COPY.title
        if type(recs) == 'table' and #recs > 0 then
          local idx = opts.noteIdx or 1
          local rec = recs[idx] or recs[1]
          if type(rec) == 'table' then
            noteText, noteColor = rec.text, rec.color
          end
        end
      end
      if type(noteText) == 'string' and noteText ~= '' then
        local cc = noteColor or subInk
        if opts.noteAlpha ~= nil then
          local _, r, g, b = parts(cc)
          local a = math.max(0, math.min(255, math.floor(opts.noteAlpha)))
          cc = K.C(a, r, g, b)
        end
        -- v6.30：这句「旅行者…」原来钉在 M.NOTE.y=-215，设计空间缩放后正好落到 2 号卡后面
        -- （2400 实测：文字被卡片压掉一半）。改成**贴着底部提示条上方**，任何画布都在空带里。
        local nx, ny = M.noteAnchor(halfH)
        txt('menuNote', M.ROLE.note, M.LAYER.hud, noteText, nx, ny,
          M.NOTE.w, M.NOTE.h, M.NOTE.font, cc)
      end
    end

    -- ===== ⑥ 四张模式卡（card 层：压在展台墙与横幅之上）=====
    local modes = opts.modes
    if type(modes) ~= 'table' or #modes < 1 then modes = MODE_INFO end
    if type(modes) ~= 'table' or #modes < 1 then modes = M.FALLBACK_MODES end
    local cardCount = #modes
    if cardCount > #M.CARD.rows then cardCount = #M.CARD.rows end

    local activeIdx = indexOf(opts.active)
    local hoverIdx = indexOf(opts.hover)
    local pressIdx = indexOf(opts.pressed)
    local function stateOf(i)
      if pressIdx == i then return 'press' end
      if hoverIdx == i then return 'hover' end
      if activeIdx == i then return 'select' end
      return 'normal'
    end

    local CD = M.CARD
    for i = 1, cardCount do
      local m = modes[i] or {}
      local cx, cy = CD.rows[i][1], CD.rows[i][2]
      local st = stateOf(i)
      local dy = CD.dy[st]
      local base = m.color or gold
      local fill = K.over(wall, base, CD.fillK[st])
      local beadD = CD.beadD[st]
      -- 胶囊三块（中段矩形 + 两端圆）：三态只换色与整体位移
      local nodes = pill('menuPill' .. i, M.ROLE.cardBg, M.LAYER.card, cx + CD.pillDx,
        cy + dy, CD.pillW, CD.pillH, fill)
      -- 三态色板随节点带出（render 目前不读，接线方要手动画过渡时可用；与 view_settle 同口径）
      for k = 1, #nodes do
        nodes[k].state = { kind = 'fill', fillK = CD.fillK, dy = CD.dy, cur = st }
      end
      -- 元素宝珠（实心圆）+ 内环（ring 图元，浅色内圈）
      shape('menuBead' .. i, M.ROLE.bead, M.LAYER.card, cx + CD.beadDx, cy + dy,
        beadD, beadD, (stateOf(i) == 'normal') and base or ((m.colorDeep) or base), 'circle')
      local ringD = math.floor(beadD * CD.ringRatio + 0.5)
      shape('menuRing' .. i, M.ROLE.ring, M.LAYER.card, cx + CD.beadDx, cy + dy,
        ringD, ringD, K.over(fill, K.C(255, 255, 255, 255), CD.ringLight), 'ring')
      -- 星芒（fourstar；alpha 由三态决定，预混在胶囊底色上）
      shape('menuStar' .. i, M.ROLE.star, M.LAYER.card, cx + CD.starDx, cy + dy,
        CD.starD, CD.starD,
        opaque(fill, K.C(CD.starA[st], (base // 16777216) % 256,
          (base // 65536) % 256, (base // 256) % 256)), 'fourstar')
      -- 标题（键位数字 + 模式名，左对齐）与特色句
      local hot = (st ~= 'normal')
      txt('menuTitle' .. i, M.ROLE.cardTitle, M.LAYER.card,
        tostring(m.key or '') .. '  ' .. tostring(m.name or ''), cx + CD.titleDx,
        cy + dy + CD.titleDy, CD.titleW, CD.titleH, CD.titleFs[st],
        hot and ((m.colorDeep) or ink) or ink, 'Left')
      txt('menuDesc' .. i, M.ROLE.cardDesc, M.LAYER.card, tostring(m.desc or ''),
        cx + CD.titleDx, cy + dy + CD.descDy, CD.descW, CD.descH, CD.descFs,
        hot and ink or subInk, 'Left')
      -- 透明命中热区（现网 menuZone i：胶囊 +16/+8；热区不随三态位移）
      local on = {
        CursorDown = cb(opts.onPick, i),
        CursorClick = cb(opts.onConfirm, i),
      }
      if on.CursorDown == nil and on.CursorClick == nil then on = nil end
      hit('menuZone' .. i, cx + CD.pillDx, cy, CD.hitW, CD.hitH,
        { 'CursorDown', 'CursorClick' }, on)
    end

    -- ===== ⑦ 两张入口卡（角色档案 / 说明，card 层）=====
    local EN = M.ENTRY
    -- v6.30（用户 2026-11-17「首页那里明显重叠」）：入口卡从「贴着标题右侧」改成**左上 / 右上两个角**。
    -- 旧算法 `min(exMax=520, halfW-169)` 在 1280 上算出 471 ⇒ 卡左缘 799 与标题胶囊右缘 970 相交 144px；
    -- 2400 上更糟（卡 [1436,1524] vs 胶囊 [870,1530]，重叠 88px）。改成贴角后与标题、与棋盘视窗都不相交，
    -- 而且与对局屏的「角色 / 说明」导航键同位置（同一个心智模型）。
    local ex = -(halfW - EN.exInset)
    local ey = (device == 'mobile') and (halfH - EN.eyMobileInset) or EN.eyPc
    local hx = halfW - EN.exInset      -- 说明：右上角（原来是 ex + helpDx，跟着角色卡往右排）
    local entryFill = K.over(wall, gold, 0.12)      -- controls.lua PRESET.gold.base

    local r = EN.roster
    pill('menuEntryRoster', M.ROLE.entryBg, M.LAYER.card, ex, ey, r.w, r.h, entryFill)
    txt('menuEntryRosterT', M.ROLE.entryTitle, M.LAYER.card, r.label, ex, ey + r.titleDy,
      r.w - r.pad * 2, hOf(r.fs), r.fs, goldDeep)
    txt('menuEntryRosterS', M.ROLE.entrySub, M.LAYER.card,
      (device == 'mobile') and r.subMobile or r.subPc, ex, ey - r.subDy,
      r.w - r.padSub * 2, hOf(r.subFs), r.subFs, subInk)
    for i = 1, #EN.dots do
      local d = EN.dots[i]
      shape('menuEntryDot' .. i, M.ROLE.entryDot, M.LAYER.card,
        ex + EN.dotDx + (i - 1) * EN.dotStep, ey + EN.dotDy, EN.dotD, EN.dotD,
        C(255, d[1], d[2], d[3]), 'circle')
    end

    local hp = EN.help
    pill('menuEntryHelp', M.ROLE.entryBg, M.LAYER.card, hx, ey, hp.w, hp.h, entryFill)
    txt('menuEntryHelpT', M.ROLE.entryTitle, M.LAYER.card, hp.label, hx, ey + hp.titleDy,
      hp.w - hp.pad * 2, hOf(hp.fs), hp.fs, goldDeep)
    txt('menuEntryHelpS', M.ROLE.entrySub, M.LAYER.card,
      (device == 'mobile') and hp.subMobile or hp.subPc, hx, ey - hp.subDy,
      hp.w - hp.padSub * 2, hOf(hp.subFs), hp.subFs, subInk)

    -- ===== ⑧ 热区（touch 层：永远最上）=====
    hit('menuRosterZone', ex, ey, r.w + EN.hitPadW, r.h + EN.hitPadH, { 'CursorClick' },
      clickOnly(opts.onRoster))
    hit('menuHelpZone', hx, ey, hp.w + EN.hitPadW, hp.h + EN.hitPadH, { 'CursorClick' },
      clickOnly(opts.onHelp))
    -- 底部提示条第三段「H 游戏说明」本身也是鼠标入口（现网 MS.buildHoverZones 的 menuHelpZone）
    if stageOn then
      hit('menuHintZone', M.HINT.segs[3].x, -(halfH - M.HINT.dy), 260, 56,
        { 'CursorClick' }, clickOnly(opts.onHelp))
    end

    -- 展台「在但声明不可见」：只落 visible 字段（真隐藏请用 stage.on=false）
    if stageOn and not stageVisible then
      local stageHud = L.order(M.LAYER.hud)
      for i = 1, #out do
        local ln = out[i]
        if L.order(ln.layer) <= stageHud then ln.visible = false end
      end
    end

    return out
  end

  -- 便捷：某设备/画布/状态下的节点数（接线方给 `menu cards n=` 之类的日志读数用）
  S.count = function(opts)
    return #S.title(opts or {})
  end

  return S
end

return M
