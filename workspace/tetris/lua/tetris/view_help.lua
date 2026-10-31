--[[==========================================================================
 tetris/view_help.lua —— 说明页（旅行者手册）的**纯描述**（opts → node 数组，零引擎调用）
 ----------------------------------------------------------------------------
 为什么要有这个文件：说明页是「多层级菜单展示」坏域里最重的一块。现网 293 行
 `buildHelpLayer` 手建：一次 OnStart 里 Instantiate 24 类图元、层序靠 SetAsLastSibling
 （**实测在模拟器里是空操作**，main.lua 自己 2388 行的注释就记着这条），
 关页时靠"先拆展台再建手册、关页再把展台建回来"的手写纪律维持。于是：
   · 手册压在标题展台上 ⇒ 双层文字叠印（PC/手机都出现过）
   · 手机端只有一行「H / E 合上手册」提示 ⇒ 点了回不去（用户 2026-10-29 反馈）
   · 提示文字与右上角关闭胶囊重叠（v5.6 修）、派蒙气泡压住胶囊（v5.19 修）
 这些都是**结构**问题：谁能盖谁不该靠调用顺序，该靠语义层号（view_layers）。

 本模块把说明页变成一份数据，三条结构约束写死在生成器里：
   C1 层序：遮罩/外框/纸面 → 'panel'；所有文字与色块 → 'card'；热区 → 'touch'。
      说明页是**整页覆盖层**，panel(50) 高于 hud(40)/board(30) ⇒ 天然盖住局内画面；
      card(60) 高于 panel ⇒ 文字永远在纸面上；touch(70) ⇒ 热区永远在最上。
      不再需要 SetAsLastSibling，也不再需要"先拆展台"。
   C2 设备互斥：PC 只出键位提示（config.HELP.hint），mobile 只出可见胶囊（合上手册）——
      同一次调用只能走一条分支 ⇒ 同一动作不会出现两遍，也不会出现"手机上看不见 H 键"。
   C3 缩放用 fit：s = min(W/1600, H/900)，位置/尺寸/字号全部乘 s（字号下限 12）。
      旧实现只按宽度缩放，21:9 画布把 1548×848 设计板放大成 2032×1113（比画布高 213px），
      页脚与关闭胶囊整体飞出屏幕（main.lua 2056-2058 记的真 bug）。fit 后几何恒在画布内。

 几何/文案出处（写死的都标锚；行号会漂，锚文本不会）：
   · 板/纸/外框 1548×848 GOLD、纸面 1540×840 C(255,253,247,236)  ← buildHelpLayer 的 buildA()
     锚：'local function buildA()'
   · 星 (-716,386) 30×30；眉标 (-470,396) w460 fs17；标题 (-420,344) w560 fs40；
     副标 (-420,304) w560 fs19；分隔线 (0,278) 1400×2  ← 同上（buildA 头部五行）
   · 提示 (-420→268,396) w380 fs17 右对齐（v5.6 为躲开关闭胶囊而左移）
   · 派蒙气泡 (230,344) 560×56 + 552×48 + 文字 w524 fs17（v5.19 缩宽避让胶囊）
   · 键表：标题 (-550,252) w300 fs22；行距 47、首行 y=208、键帽 h34/圆角9/间距7、
     键帽宽 = 字数≥2 ? 74 : 40（**按字节数**，照抄现网）、键帽字 w-4 fs19 白字、
     键帽行标签 (-410) w230 fs21、无键帽行 (-250) w900 fs21  ← buildA 的 keys 循环
   · 四张模式卡：x=-212+(i-1)*278, y=40, 252×320（内白卡 244×312、卡头 228×70 @+114、
     徽章 46 + 环 28 @(cx-76,+114)、键字 w40 fs21、名 w150 fs26、行 y=+40-(li-1)*44 w232 fs19、
     胜条件条 216×40 @-112、条字 w208 fs17）  ← buildA 的 modes 循环
   · 算分：标题 (-550,-200) w300 fs22；行 y=-258-(row-1)*66；列 cx=-534+(col-1)*356；
     胶囊 340×52、字 w312 fs19 @cx+6  ← buildA 的 score 循环
   · 页脚两条 (0,-372) w1500 fs18 / (0,-404) w1500 fs17
   · 关闭胶囊 (640,378) 196×56 + 内卡 (188×48) + 字 fs21 + 热区（v4.0 ④）
     锚：'local bw2, bh2 = 196, 56'（**现网无条件建在 PC 与手机**；本模块按 C2 分设备）
   · 文案全部来自 config.HELP（eyebrow/title/sub/hint/paimon/keysTitle/keys/scoreTitle/
     score/foot1/foot2/modes），本文件**不复制任何一句玩家文案**

 与现网**已知不一致**（每条都有理由，交付报告逐条解释）：
   · PC 不出可见关闭胶囊，只出键位提示 + 透明热区（任务书 C2；理由是手机端没有 H 键、
     PC 端按钮与提示重复）。
   · 圆角：现网 rrect = 2 矩形 + 4 角圆（image 通道）；render.lua 的 applyFields 只写
     imageColor ⇒ 圆角在这条通道里表达不出来。胶囊类（关闭键/翻页键）用 view_kit.pill
     （中段矩形 + 左右半块），卡片/色带用单块 cell。观感=直角，与 view_settle 同款妥协。
   · 翻页：现网 `helpPage` 恒 1（"单页版恒 1"），根本没有翻页 UI。本模块按任务书给出
     pages>1 的**新几何**：nav 占据分隔线中段（左右各一段 rule，翻页键在 ±700，页码在中心）。
     pages==1 时与现网完全一致（整条 1400×2 分隔线）。

 契约：Lua 5.3；不 require 任何 tetris 模块（config/layers/kit 由 spec 注入）；不 print；
       不调用引擎 API；chunk 顶层只有表与函数。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_help_test.lua
 ========================================================================]]

local M = {}

-- ===== 设计基准（1600×900，来自 buildHelpLayer 的注释与 buildA 的实际数值）=====
M.DESIGN = { W = 1600, H = 900 }
M.FRAME = { W = 1548, H = 848 }                     -- buildA: rrect('helpFrame', ...)
M.PAPER = { W = 1540, H = 840 }                     -- buildA: rrect('helpBoard', ...)
M.PAPER_COLOR = { 255, 253, 247, 236 }              -- buildA: C(255,253,247,236)
M.STAR = { x = -716, y = 386, w = 30, h = 30 }      -- buildA: shape('helpStar', 'fourstar', ...)
M.HEAD = {
  eyebrow = { x = -470, y = 396, w = 460, font = 17 },   -- 'helpEyebrow'
  title   = { x = -420, y = 344, w = 560, font = 40 },   -- 'helpTitle'
  sub     = { x = -420, y = 304, w = 560, font = 19 },   -- 'helpSub'
  hint    = { x = 268, y = 396, w = 380, font = 17 },    -- 'helpHint'（v5.6 右对齐并左移）
  rule    = { y = 278, w = 1400, h = 2 },                -- 'helpRule'
  bubble  = { x = 230, y = 344, w = 560, h = 56 },       -- 'helpBubble' / 'helpBubble2'
  bubbleIn = 8,
  paimonFont = 17,
}
M.KEYS = {
  xTitle = -550, yTitle = 252, wTitle = 300, fontTitle = 22,
  y0 = 208, rowH = 47, capH = 34, capGap = 7, capFont = 19,
  capX = -700, labelX = -410, labelW = 230, labelFont = 21,
  noCapX = -250, noCapW = 900,
}
M.MODES = {
  x0 = -212, dx = 278, y = 40, w = 252, h = 320,
  innerW = 244, innerH = 312, headW = 228, headH = 70, headDy = 114,
  emblem = 46, emblemDx = -76, ring = 28,
  keyW = 40, keyFont = 21, nameX = 24, nameW = 150, nameFont = 26,
  lineY0 = 40, lineDy = 44, lineW = 232, lineFont = 19,
  winDy = -112, winW = 216, winH = 40, winFont = 17, winTxtInset = 8,
}
M.SCORE = {
  xTitle = -550, yTitle = -200, wTitle = 300, fontTitle = 22,
  y0 = -258, rowH = 66, x0 = -534, dx = 356,
  chipW = 340, chipH = 52, txtW = 312, txtFont = 19, txtDx = 6,
}
M.FOOT = {
  { key = 'helpFoot1', y = -372, w = 1500, font = 18 },
  { key = 'helpFoot2', y = -404, w = 1500, font = 17 },
}
M.CLOSE = { x = 640, y = 378, w = 196, h = 56, font = 21, label = '合上手册', inner = 8 }
M.NAV = {
  x = 700, y = 278, w = 96, h = 44, font = 19,
  ruleGap = 140,        -- 分隔线中段留空 ±140（页码居中，翻页键在 ±700）
  ruleSegW = 480,       -- 两段分隔线各 480 宽（-620..-140 / 140..620）
  hintLeft = '← 上一页', hintRight = '下一页 →', hintW = 120,   -- 120：600..760 仍在纸面内
  prevLabel = '上一页', nextLabel = '下一页', labelW = 240,
}
M.HITPAD = { w = 40, h = 24 }                        -- view_kit.METRIC.hitPad*（手感外扩）

-- 层名（语义层号来自 view_layers；这里只写名字，数字不重复出现）
M.LAYER = { scrim = 'panel', shell = 'panel', paper = 'panel', text = 'card', hit = 'touch' }

-- role 标记：测试按 role 聚合断言层号分布，避免按 key 前缀硬编码
M.ROLE = {
  scrim = 'scrim', shell = 'shell', paper = 'paper',
  deco = 'deco', heading = 'heading', rule = 'rule', hint = 'hint', bubble = 'bubble',
  caption = 'caption', cap = 'cap', capLabel = 'capLabel',
  cardBg = 'cardBg', cardHead = 'cardHead', cardLine = 'cardLine',
  chip = 'chip', chipText = 'chipText', foot = 'foot', nav = 'nav',
  close = 'close', hit = 'hit',
}

-- config 缺项时的兜底（只在 config.HELP 缺字段时用到；不覆写任何玩家文案）
M.FALLBACK_KEYS = {
  { caps = { '←', '→' }, label = '移动' },
  { caps = { '↑' }, label = '旋转' },
}
M.FALLBACK_SCORE = { { '消 1 行 = 100 分' } }

M.new = function(spec)
  spec = spec or {}
  local cfg = assert(spec.config, 'view_help: 需要 spec.config')
  local L = assert(spec.layers, 'view_help: 需要 spec.layers（view_layers）')
  local K = assert(spec.kit, 'view_help: 需要 spec.kit（view_kit）')
  local THEME = assert(cfg.THEME, 'view_help: config.THEME 必须是 THEME（= STYLE.chrome）')
  local HELP = cfg.HELP or {}

  -- 层名先过 view_layers：写错当场报错，而不是渲染时静默按 hud 处理
  for _, name in pairs(M.LAYER) do L.order(name) end

  local S = {}

  -- ===== 颜色工具（与 view_node.unpack / view_kit.C 同口径）=====
  local function parts(c)
    local v = c or 0
    if v < 0 then v = v + 4294967296 end
    return (v // 16777216) % 256, (v // 65536) % 256, (v // 256) % 256, v % 256
  end
  -- 任何颜色 → alpha=255（半透明压在浅底上会被 lint 判 L3「近似隐形」，见 view_node 头注释）
  local function opaque(base, c)
    local a, r, g, b = parts(c)
    if a == 255 then return c end
    return K.over(base, K.C(255, r, g, b), a / 255)
  end

  -- ===== 主入口：opts → node 数组 =====
  -- opts = { canvas={w,h}, device='pc'|'mobile', page=1, pages=1,
  --          sections={{caps={...}, label=...}, ...},   -- 覆盖 config.HELP.keys（翻页时按页切）
  --          onClose=fn, onPrev=fn, onNext=fn }
  S.help = function(opts)
    opts = opts or {}
    local device = opts.device or 'pc'
    if device ~= 'pc' and device ~= 'mobile' then
      error("view_help: opts.device 只认 'pc' / 'mobile'，收到 " .. tostring(device))
    end
    local canvas = opts.canvas or { 1600, 900 }
    local W, H = canvas[1] or 1600, canvas[2] or 900

    -- 设计基准等比缩放（fit，两条边都算）：与 buildHelpLayer 的 s 同式
    local s = math.min(W / M.DESIGN.W, H / M.DESIGN.H)
    if s <= 0 then s = 1 end
    local function u(v) return v * s end
    local function fs(v)
      local r = math.floor(v * s + 0.5)
      if r < 12 then r = 12 end
      return r
    end
    -- 文字框高：≥ 字号×1.45+4（引擎 fits 判据）+ 现网自己用的 1.5×+6
    local function hOf(font)
      local a = math.ceil(font * 1.45 + 6)
      local b = math.floor(font * 1.5 + 6)
      return (b > a) and b or a
    end

    local page = opts.page or 1
    page = math.max(1, math.floor(page))
    local pages = opts.pages or 1
    pages = math.max(page, math.floor(pages))

    local GOLD = THEME.gold
    local GOLDD = THEME.goldDeep or THEME.gold
    local INK = THEME.textMain
    local SUB = THEME.textSub or THEME.textMain
    local WHITE = K.C(255, 255, 255, 255)
    local CARD = K.C(255, 255, 255, 255)
    local wash = THEME.helpBg or K.C(255, 249, 247, 255)
    local cream = K.C(M.PAPER_COLOR[1], M.PAPER_COLOR[2], M.PAPER_COLOR[3], M.PAPER_COLOR[4])

    local out = {}
    local function add(n)
      n.seq = #out + 1
      out[#out + 1] = n
      return n
    end
    -- 设计单位的方块（板/纸/色带/胶囊底）
    local function cell(key, layer, role, x, y, w, h, color)
      return add {
        key = key, name = key, role = role, layer = layer, tpl = 'cell',
        pos = { u(x), u(y) }, size = { u(w), u(h) }, color = color,
      }
    end
    -- 画布单位的整屏块（遮罩必须正好盖住画布 ⇒ 不能乘 s）
    local function cellRaw(key, layer, role, x, y, w, h, color)
      return add {
        key = key, name = key, role = role, layer = layer, tpl = 'cell',
        pos = { x, y }, size = { w, h }, color = color,
      }
    end
    local function txt(key, layer, role, str, x, y, w, font, color, align)
      local f = fs(font)
      return add {
        key = key, name = key, role = role, layer = layer, tpl = 'stext',
        pos = { u(x), u(y) }, size = { u(w), hOf(f) },
        text = str or '', font = f, fcolor = color, bg = 0,
        align = align or 'Middle', valign = 'Middle',
      }
    end
    -- 胶囊（view_kit.pill = 中段矩形 + 左右半块；render 只写 imageColor ⇒ 落地为直角）
    local function pill(key, role, x, y, w, h, color)
      local nodes = K.pill { key = key, x = u(x), y = u(y), w = u(w), h = u(h),
        color = color, layer = M.LAYER.text }
      for i = 1, #nodes do
        nodes[i].role = role
        add(nodes[i])
      end
      return nodes
    end
    local function hitZone(key, x, y, w, h, cb)
      return add {
        key = key, name = key, role = M.ROLE.hit, layer = M.LAYER.hit, tpl = 'hit',
        pos = { u(x), u(y) },
        -- 手感外扩按**设计单位**加再缩放（先加后乘）：否则小画布上 40px 的外扩会把热区
        -- 推出纸面/画布边缘（1280×720 实测溢出 2.4px）
        size = { u(w + M.HITPAD.w), u(h + M.HITPAD.h) },
        cursor = { 'CursorClick' },
        on = cb and { CursorClick = cb } or nil,
      }
    end

    -- ===== ① 遮罩 + 外框 + 纸面（panel 层：盖住局内画面，又在文字之下）=====
    cellRaw('helpScrim', M.LAYER.scrim, M.ROLE.scrim, 0, 0, W + 20, H + 20, wash)
    cell('helpFrame', M.LAYER.shell, M.ROLE.shell, 0, 0, M.FRAME.W, M.FRAME.H, GOLD)
    cell('helpBoard', M.LAYER.paper, M.ROLE.paper, 0, 0, M.PAPER.W, M.PAPER.H, cream)

    -- ===== ② 页眉（card 层）=====
    cell('helpStar', M.LAYER.text, M.ROLE.deco, M.STAR.x, M.STAR.y, M.STAR.w, M.STAR.h, GOLD)
    txt('helpEyebrow', M.LAYER.text, M.ROLE.heading, HELP.eyebrow or '',
      M.HEAD.eyebrow.x, M.HEAD.eyebrow.y, M.HEAD.eyebrow.w, M.HEAD.eyebrow.font, GOLDD, 'Left')
    txt('helpTitle', M.LAYER.text, M.ROLE.heading, HELP.title or '旅行者手册',
      M.HEAD.title.x, M.HEAD.title.y, M.HEAD.title.w, M.HEAD.title.font, INK, 'Left')
    txt('helpSub', M.LAYER.text, M.ROLE.heading, HELP.sub or '',
      M.HEAD.sub.x, M.HEAD.sub.y, M.HEAD.sub.w, M.HEAD.sub.font, SUB, 'Left')

    -- 分隔线：单页版 = 现网整条；多页版把中段让给页码与翻页键（新几何，见头注释）
    if pages > 1 then
      local segW = M.NAV.ruleSegW
      local off = M.NAV.ruleGap + segW / 2
      cell('helpRuleL', M.LAYER.text, M.ROLE.rule, -off, M.HEAD.rule.y, segW, M.HEAD.rule.h, GOLD)
      cell('helpRuleR', M.LAYER.text, M.ROLE.rule, off, M.HEAD.rule.y, segW, M.HEAD.rule.h, GOLD)
    else
      cell('helpRule', M.LAYER.text, M.ROLE.rule, 0, M.HEAD.rule.y,
        M.HEAD.rule.w, M.HEAD.rule.h, GOLD)
    end

    -- C2 设备互斥之一：PC 用键位提示，mobile 不用（手机没有 H 键 —— 用户 2026-10-29 反馈）
    if device == 'pc' then
      txt('helpHint', M.LAYER.text, M.ROLE.hint, HELP.hint or '',
        M.HEAD.hint.x, M.HEAD.hint.y, M.HEAD.hint.w, M.HEAD.hint.font, SUB, 'Right')
    end

    -- 派蒙气泡（描金细边 + 白底）
    local b = M.HEAD.bubble
    cell('helpBubble', M.LAYER.text, M.ROLE.bubble, b.x, b.y, b.w, b.h, GOLD)
    cell('helpBubble2', M.LAYER.text, M.ROLE.bubble, b.x, b.y,
      b.w - M.HEAD.bubbleIn * 2, b.h - M.HEAD.bubbleIn * 2, CARD)
    txt('helpPaimon', M.LAYER.text, M.ROLE.bubble, HELP.paimon or '', b.x, b.y,
      b.w - 36, M.HEAD.paimonFont, INK, 'Middle')

    -- ===== ③ 左栏：操作 · 须知（键帽 + 标签）=====
    txt('helpKeysTitle', M.LAYER.text, M.ROLE.caption, HELP.keysTitle or '操作 · 须知',
      M.KEYS.xTitle, M.KEYS.yTitle, M.KEYS.wTitle, M.KEYS.fontTitle, INK, 'Left')
    local sections = opts.sections
    if type(sections) ~= 'table' or #sections < 1 then sections = HELP.keys end
    if type(sections) ~= 'table' or #sections < 1 then sections = M.FALLBACK_KEYS end
    for i = 1, #sections do
      local sec = sections[i] or {}
      local y = M.KEYS.y0 - (i - 1) * M.KEYS.rowH
      local capsList = sec.caps
      if type(capsList) == 'table' and #capsList > 0 then
        local x = M.KEYS.capX
        for j = 1, #capsList do
          local cap = tostring(capsList[j])
          -- 键帽宽按**字节数**：现网就是 #cap >= 2 ? 74 : 40（照抄，不改判据）
          local cw = (#cap >= 2) and 74 or 40
          cell('helpCap' .. i .. '_' .. j, M.LAYER.text, M.ROLE.cap, x + cw / 2, y,
            cw, M.KEYS.capH, INK)
          txt('helpCapT' .. i .. '_' .. j, M.LAYER.text, M.ROLE.capLabel, cap,
            x + cw / 2, y, cw - 4, M.KEYS.capFont, WHITE, 'Middle')
          x = x + cw + M.KEYS.capGap
        end
        txt('helpKey' .. i, M.LAYER.text, M.ROLE.capLabel, sec.label or '',
          M.KEYS.labelX, y, M.KEYS.labelW, M.KEYS.labelFont, INK, 'Left')
      else
        -- 无键帽行（整句）：框从 -700 起、宽 900 —— 照抄现网的 noCap 分支
        txt('helpKey' .. i, M.LAYER.text, M.ROLE.capLabel, sec.label or '',
          M.KEYS.noCapX, y, M.KEYS.noCapW, M.KEYS.labelFont, INK, 'Left')
      end
    end

    -- ===== ④ 右栏：四张模式委托卡 =====
    local modes = HELP.modes or {}
    for i = 1, #modes do
      local m = modes[i] or {}
      local cx = M.MODES.x0 + (i - 1) * M.MODES.dx
      local cy = M.MODES.y
      local tint = m.tint or CARD
      local deep = m.deep or GOLDD
      cell('helpCard' .. i, M.LAYER.text, M.ROLE.cardBg, cx, cy, M.MODES.w, M.MODES.h, tint)
      cell('helpCardB' .. i, M.LAYER.text, M.ROLE.cardBg, cx, cy,
        M.MODES.innerW, M.MODES.innerH, CARD)
      cell('helpCardH' .. i, M.LAYER.text, M.ROLE.cardHead, cx, cy + M.MODES.headDy,
        M.MODES.headW, M.MODES.headH, tint)
      cell('helpEmblem' .. i, M.LAYER.text, M.ROLE.deco, cx + M.MODES.emblemDx,
        cy + M.MODES.headDy, M.MODES.emblem, M.MODES.emblem, m.color or GOLD)
      cell('helpRing' .. i, M.LAYER.text, M.ROLE.deco, cx + M.MODES.emblemDx,
        cy + M.MODES.headDy, M.MODES.ring, M.MODES.ring, deep)
      txt('helpCardK' .. i, M.LAYER.text, M.ROLE.cardHead, tostring(m.key or ''),
        cx + M.MODES.emblemDx, cy + M.MODES.headDy, M.MODES.keyW, M.MODES.keyFont, deep, 'Middle')
      txt('helpCardN' .. i, M.LAYER.text, M.ROLE.cardHead, m.name or '',
        cx + M.MODES.nameX, cy + M.MODES.headDy, M.MODES.nameW, M.MODES.nameFont, deep, 'Middle')
      local lines = m.lines or {}
      for li = 1, #lines do
        txt('helpCardL' .. i .. '_' .. li, M.LAYER.text, M.ROLE.cardLine, lines[li],
          cx, cy + M.MODES.lineY0 - (li - 1) * M.MODES.lineDy,
          M.MODES.lineW, M.MODES.lineFont, SUB, 'Middle')
      end
      cell('helpWin' .. i, M.LAYER.text, M.ROLE.cardHead, cx, cy + M.MODES.winDy,
        M.MODES.winW, M.MODES.winH, tint)
      txt('helpWinT' .. i, M.LAYER.text, M.ROLE.cardHead, m.win or '',
        cx, cy + M.MODES.winDy, M.MODES.winW - M.MODES.winTxtInset, M.MODES.winFont, deep, 'Middle')
    end

    -- ===== ⑤ 底部：怎么算分 =====
    txt('helpScoreTitle', M.LAYER.text, M.ROLE.caption, HELP.scoreTitle or '怎么算分',
      M.SCORE.xTitle, M.SCORE.yTitle, M.SCORE.wTitle, M.SCORE.fontTitle, INK, 'Left')
    local score = HELP.score or M.FALLBACK_SCORE
    for row = 1, #score do
      local y = M.SCORE.y0 - (row - 1) * M.SCORE.rowH
      local cells = score[row] or {}
      for col = 1, #cells do
        local cx = M.SCORE.x0 + (col - 1) * M.SCORE.dx
        local fill = CARD
        local mm = modes[col]
        if row == 1 and mm and mm.tint then fill = mm.tint end
        cell('helpChip' .. row .. col, M.LAYER.text, M.ROLE.chip, cx, y,
          M.SCORE.chipW, M.SCORE.chipH, fill)
        txt('helpChipT' .. row .. col, M.LAYER.text, M.ROLE.chipText, cells[col],
          cx + M.SCORE.txtDx, y, M.SCORE.txtW, M.SCORE.txtFont, INK, 'Middle')
      end
    end
    local foot = { HELP.foot1, HELP.foot2 }
    for i = 1, #M.FOOT do
      local f = M.FOOT[i]
      -- 页脚是纸面最外圈的锚点：等比缩放后文字框高按字号取整，会比纸面收缩得更慢
      -- ⇒ 1280×720 上实测 foot2 底边出纸面 0.7px。夹回纸内（1600/2340 画布上不动）。
      local hDesign = hOf(fs(f.font)) / s
      local fy = f.y
      local minY = -M.PAPER.H / 2 + hDesign / 2
      if fy < minY then fy = minY end
      txt(f.key, M.LAYER.text, M.ROLE.foot, foot[i] or '', 0, fy, f.w, f.font, SUB, 'Middle')
    end

    -- ===== ⑥ 翻页（pages>1 才有；位置在分隔线中段，见头注释"新几何"）=====
    if pages > 1 then
      local n = M.NAV
      txt('helpPageTx', M.LAYER.text, M.ROLE.nav,
        tostring(page) .. ' / ' .. tostring(pages), 0, n.y, n.labelW, n.font, INK, 'Middle')
      if device == 'mobile' then
        pill('helpPrev', M.ROLE.nav, -n.x, n.y, n.w, n.h, GOLD)
        txt('helpPrevTx', M.LAYER.text, M.ROLE.nav, n.prevLabel, -n.x, n.y, n.w - 8, n.font, INK)
        pill('helpNext', M.ROLE.nav, n.x, n.y, n.w, n.h, GOLD)
        txt('helpNextTx', M.LAYER.text, M.ROLE.nav, n.nextLabel, n.x, n.y, n.w - 8, n.font, INK)
      else
        txt('helpPrevHint', M.LAYER.text, M.ROLE.hint, n.hintLeft, -n.x, n.y, n.hintW, n.font, SUB)
        txt('helpNextHint', M.LAYER.text, M.ROLE.hint, n.hintRight, n.x, n.y, n.hintW, n.font, SUB)
      end
      hitZone('helpPrevHit', -n.x, n.y, n.w, n.h, opts.onPrev)
      hitZone('helpNextHit', n.x, n.y, n.w, n.h, opts.onNext)
    end

    -- ===== ⑦ 关闭入口（C2：PC = 透明热区 + 键位提示；mobile = 可见胶囊 + 热区）=====
    local c = M.CLOSE
    if device == 'mobile' then
      pill('helpClose', M.ROLE.close, c.x, c.y, c.w, c.h, GOLD)
      pill('helpCloseIn', M.ROLE.close, c.x, c.y, c.w - c.inner * 2, c.h - c.inner * 2, CARD)
      txt('helpCloseTx', M.LAYER.text, M.ROLE.close, c.label, c.x, c.y, c.w - c.inner * 2,
        c.font, INK, 'Middle')
    end
    hitZone('helpCloseHit', c.x, c.y, c.w, c.h, opts.onClose)

    return out
  end

  -- 便捷：某设备/画布下的节点数（接线方给 `help build n=` 日志用；不含引擎调用）
  S.count = function(opts)
    return #S.help(opts or {})
  end

  return S
end

return M
