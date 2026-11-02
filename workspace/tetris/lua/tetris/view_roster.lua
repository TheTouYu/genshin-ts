--[[==========================================================================
 tetris/view_roster.lua —— 角色档案页（角色密码）的**纯描述**（opts → node 数组）
 ----------------------------------------------------------------------------
 为什么要有这个文件：角色档案页在 lua/tetris/roster.lua 里手建（481 行 rosterBuild：
 先 Instantiate 十几个图元、再逐个 SetSizeDelta/SetAnchoredPosition、热区位置还要自己摆）。
 用户点名的坏域。实测到的两个真缺陷：

   ① 移动端「文字折行被整条吃掉」：charPanelL1 / charPanelL4 / charPanelS 三处
      textLayout.fits=false（引擎侧 requiredHeight 需 51.7 / 51.7 / 46.4），PC 同页
      fitsBad=0。根因**不是文案太长**，是两处口径错开：
        · controls.textPanel 把**字号原样**传下去（fs=18 / subFs=16），而框宽走 u() 缩放
          ⇒ 手机上宽度掉到 73.5%、字号不变 ⇒ 一行变两行；
        · main.lua MS.addText 的兜底高度只给**单行** floor(fontSize*1.45+6)
          （18 号 = 32、16 号 = 29），两行需要 51.7 / 46.4 ⇒ 引擎 requiredHeight > 框高
          ⇒ fits=false ⇒ **整条文字一个字都不画**（不是裁切）。
        两条数字都能用引擎公式精确复算（本文件 M.engineReqH）：
          requiredHeight = 1.2·font·lines + (0.25·font + 4)
          (18, 2) → 43.2 + 8.5 = 51.7  ✓ 与实测 charPanelL1/L4 一致
          (16, 2) → 38.4 + 8.0 = 46.4  ✓ 与实测 charPanelS 一致
   ② 层序/热区靠手写纪律：整页由 runtime 实例拼成，层序=创建顺序；条目热区在
      `SetAnchoredPosition(…, -(yy - h/2))` 里被**取负**（cursor 的 y 轴与图片相反）
      ⇒ 同一条目「看得见的地方点不到、看不见的地方能点」（D734 记过同一现象）。

 本模块把这两条变成两条结构约束：
   C1 **文字框尺寸由内容反推**：先按「本设备的真实宽度 + 真实字号」把文案折成显式多行
      （wrap），再用行数算框高 boxH(font, lines) = max(view_node 口径, 引擎口径)，
      最后 set text=多行文本、size={w,h}。⇒ 「框高不够」在这条通道里表达不出来；
      而且是**按设备**算的：字号随 k 缩放、宽度随 k 缩放、行数与框高都跟着重算。
      绝不截断文案（截断是掩盖；折行 + 反推高度才是修法）。
   C2 语义层序 + 热区同号：遮罩 'wash'、面板/大色块 'panel'、文字/胶囊 'card'、
      热区 'touch'（层号来自 view_layers）；热区 y 与视觉**同号**，不取负。
      于是「谁能盖住谁」不再依赖先拆展台/后建页面。

 与现网几何逐值一致的部分（写死的都标锚；行号会漂，锚文本不会）：
   · 缩放：`k = min(W/1600, H/980)`（不是 900——现网注释：内容比卡片高，按 980 收口）
     锚 'k = math.min(W / 1600, H / 980)'
   · 面板 1400×800，且 `PH = min(u(800), canvasH - u(56))`（手机不许溢出画布下沿）
     锚 'local PW = u(1400)' / 'local PH = math.min(u(800)'
   · 顶栏 (0, PH/2-u(46)) PW×u(92)；描金细线 (0, PH/2-u(94)) PW-u(80)×2
     锚 'R.top = BOX(' / 'R.rule = BOX('
   · 标题 xLeft=PL+u(40) y=PH/2-u(46) w=u(560) 32 号；副标 y=PH/2-u(78) 17 号
     锚 'R.title = TXT(' / 'R.sub = TXT('
   · 关闭胶囊 (PR-u(110), PH/2-u(46)) 150×50 '合上' 20 号  锚 'roster.close'
   · 左列四行 (listX+u(180), u(200)-(i-1)*u(108)) 360×96，22/15 号，pad 26
     锚 'roster.row' / 'local y = u(200) - (i - 1) * u(108)'
   · 中列面板 (PL+u(430)+u(190), u(30)) u(380)×u(430)；标题 38 / 副标 16 / 正文 18
     行距 36 / 页脚 15  锚 'CTL.textPanel({' 与 'fs = 18, lineGap = 36'
   · 右列页签 (PL+u(860)+(i-1)*u(100)+u(48), u(232)) 96×46 18 号 pad 10
     锚 "roster.tab' .. i"
   · 右列条目：rightX=PL+u(840) rightW=u(470)；起始 y=u(150)；图标 30×30 在
     rightX+u(40)；文字左沿 rightX+u(76)、宽 rightW-u(96)；名称 19 / 正文 15 / 数值 14
     锚 'local rightX = PL + u(840)' / 'local yy = u(150)'
   · 页脚 xLeft=PL+u(70) y=-PH/2+u(28) 宽 PW-u(140) 17 号  锚 'R.foot = TXT('

 与现网的**有意差异**（逐条理由见交付报告）：
   · 中列面板与条目卡改用 rrect（2 矩形 + 4 角圆，r=26/22）而不是 stadium 胶囊：
     现网 UI4.pill 在 380×430 的盒子上会把两端做成直径 430 的整圆（"巨型体育场"）；
     view_help 已立过同一条判据（「非 h/2 的圆角必须真拆」）。
   · 页签内容**四页各不相同**：现网 tab 2/3/4 全部落进同一个 else 分支（机制/数值/解锁
     三页内容一模一样）；本模块按页生成，测试断言五页内容签名互不相同。
   · 条目正文显示 2 行 + 省略号（现网同），但**框高按真实行数算**；点开看全文的浮层
     不在本模块范围（用 opts.onEntry 交回接线方）。
   · 手机端顶部提示不再提键盘（I / F）：触摸屏没有键盘，提示改走「右上角合上返回」。

 契约：Lua 5.3；不 require 任何 tetris 模块（config/layers/kit/copy/roster 由 spec 注入）；
       不 print；不调用引擎 API；chunk 顶层只有表与函数；文案只从注入的 copy 读。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_roster_test.lua
 ========================================================================]]

local M = {}

-- ===== 设计基准（现网 roster.lua 的 u() 口径）=====
M.DESIGN = { W = 1600, H = 980 }                     -- k = min(W/1600, H/980)
M.CARD = { W = 1400, H = 800, PADH = 56 }            -- PW=u(1400)；PH=min(u(800), H-u(56))
M.TOP = { H = 92, RULE_DY = 94, RULE_INSET = 80, TITLE_DY = 46, SUB_DY = 78,
  X = 40, TITLE_W = 560, TITLE_FONT = 32, SUB_FONT = 17 }
M.CLOSE = { DX = 110, DY = 46, W = 150, H = 50, FONT = 20 }
M.LIST = { X = 40, CX = 180, Y0 = 200, DY = 108, W = 360, H = 96,
  FONT = 22, SUB_FONT = 15, PAD = 26, TITLE_DY = 16, SUB_DY = 20 }
M.MID = { X = 430, W = 380, H = 430, Y = 30, R = 26,
  TITLE_FONT = 38, SUB_FONT = 16, FS = 18, LINE_GAP = 36, FOOT_FONT = 15,
  INSET = 48, TITLE_INSET = 40, TITLE_DY = 46, SUB_DY = 86, RULE_DY = 110,
  LINES_DY = 146, FOOT_DY = 26, MAX_LINES = 4 }
M.TABS = { X = 860, DX = 100, W = 96, H = 46, FONT = 18, Y = 232, PAD = 10, N = 5 }
M.ITEM = { X = 840, W = 470, Y0 = 150, R = 22,
  CARD_INSET = 8, TOP = 34, BOT = 18, ROW = 22, ICON = 30, ICON_X = 40,
  TEXT_X = 76, TEXT_INSET = 96, NM_FONT = 19, LINE_FONT = 15, VAL_FONT = 14,
  CAP = 2, SLOTS = 3, GAP = 8, ELLIPSIS = '…' }
M.FOOT = { X = 70, DY = 28, INSET = 140, FONT = 17 }
M.HITPAD = { w = 40, h = 24, tabW = 2, tabH = 10 }   -- 页签外扩要小：96 宽 + 100 步进

-- 层名（语义层号来自 view_layers；这里只写名字）
M.LAYER = { scrim = 'wash', surface = 'panel', text = 'card', hit = 'touch' }
M.ROLE = {
  scrim = 'scrim', surface = 'surface', panel = 'panel', topbar = 'topbar', rule = 'rule',
  heading = 'heading', subheading = 'subheading', close = 'close', row = 'row', rowText = 'rowText',
  tab = 'tab', tabText = 'tabText', cardBg = 'cardBg', icon = 'icon', cardTitle = 'cardTitle',
  cardLine = 'cardLine', cardVal = 'cardVal', foot = 'foot', hit = 'hit',
}
-- 引擎图元（条目图标按条目序号轮换；与现网 GLYPH 表同序）
M.GLYPH = { 'circle', 'fourstar', 'fivestar', 'triangle', 'ring' }

-- 现网口径：字体放大系数与行高（两套都要，取更严的那个见 boxH）
M.ENGINE = { lineH = 1.2, inset = 0.25, insetAdd = 4 }    -- requiredHeight = 1.2f·L + 0.25f + 4
M.MEASURE = { lineH = 1.45, perLine = 4 }                 -- view_node.textNeed 口径

-- 页面 chrome 文案（短句，全部逐字抄自 roster.lua；长文案一律从注入的 copy 读）
M.PAGE = {
  title = '角色档案 · 契约与技能',                     -- 锚 "charTitle"
  hintPC = '左边点角色 · 右边切页签　·　I / F 关闭 · 右上角「合上」也行',   -- 锚 "charHint"
  hintTouch = '左边点角色 · 右边切页签　·　右上角「合上」返回',
  close = '合上',                                       -- 锚 "roster.close"
  foot = '与四位角色缔结契约，她们会在你手忙脚乱时替你守住棋盘——按名册键随时回来看看。',  -- 锚 "charFoot"
  tabs = { '技能', '机制', '数值', '解锁', '规则' },    -- 锚 'local CHAR_TAB_NAME'
  subFmt = '%s元素 · %s　｜　本局 Lv%s　%s',             -- 锚 "subtitle = (e.element"
  skillFmt = '技能「%s」　冷却 %s 秒',                   -- 锚 "footer = '技能「'"
  skillPlain = '技能「%s」',                          -- 冷却数值未注入时用（不写死「0 秒」）
  stateFront = '台前 · Lv%s',                           -- 锚 "inParty and ('台前 · Lv'"
  stateBack = '已缔结 · 后台',                          -- 锚 "'已缔结 · 后台'"
  stateLocked = '未缔结 · 点开看解锁条件',               -- 锚 "'未缔结 · 点开看解锁条件'"
  joined = '已缔结',
  unjoined = '未缔结',
  partyMark = ' ▲',                                     -- 锚 "(inParty and ' ▲' or '')"
  partyRule = '一局最多 %d 个可前台发力的主动角色；初始只有纳西妲。',      -- 锚 "编成规则"
  progressRule = '每个角色独立计经验：施放 +10、有效收益 +25、前台每 10 块 +15、后台每 10 块 +5。',
  entryTitles = { '技能', '使用要点', '机制', '数值', '解锁', '规则' },
}

M.DEFAULT_ROLES = { 'nahida', 'keqing', 'ganyu', 'girl' }   -- copy.ROLES 的四把钥匙
M.DEFAULT_PARTY_MAX = 2                                     -- SKILLS.NUM.PARTY_MAX 现网值

-- ===========================================================================
-- 文字量算（模块级；不依赖 K，测试可直接调）
--   与 view_node.glyphWidth 的差别是刻意的：view_node 只把 0xE4..0xE9 开头当全角，
--   于是 '　'（U+3000 → E3）与 '·'（U+00B7 → C2）会被算窄 ⇒ lint 会漏报「引擎其实折行」。
--   本模块把任何多字节字符一律按全宽（更严），ASCII 才按 0.55/0.32 折算：
--   这样折出来的每一行在**引擎**侧也放得下（不会出现"框够高但引擎自己又折一次"）。
-- ===========================================================================
local function glyphW(ch, font)
  local b = string.byte(ch, 1)
  if b and b < 0x80 then
    if ch == ' ' then return font * 0.32 end
    return font * 0.55
  end
  return font
end

-- CJK 折行（引擎的单行 textbox 不自动换行，多行必须自己给 '\n'）
local function wrap(text, font, maxW)
  local out, line, w = {}, {}, 0
  local function flush()
    if #line > 0 then out[#out + 1] = table.concat(line) end
    line, w = {}, 0
  end
  local str = tostring(text or '')
  local i, n = 1, #str
  while i <= n do
    local b = string.byte(str, i)
    local len = 1
    if b >= 0xF0 then len = 4 elseif b >= 0xE0 then len = 3 elseif b >= 0xC0 then len = 2 end
    local ch = str:sub(i, i + len - 1)
    i = i + len
    if ch == '\n' then
      flush()
    else
      local cw = glyphW(ch, font)
      if w + cw > maxW and #line > 0 then
        -- 断行禁则：行尾的 ASCII 词整体挪到下一行（'skills' 不许断成 'ski'/'lls'）
        local tail, back = {}, 0
        while #line - back > 0 do
          local c = line[#line - back]
          if c:match('[%w%%%.]') then back = back + 1 else break end
        end
        if back > 0 and back < #line then
          for k = #line - back + 1, #line do tail[#tail + 1] = line[k] end
          for k = #line, #line - back + 1, -1 do line[k] = nil end
        end
        flush()
        line, w = tail, 0
        for k = 1, #tail do w = w + glyphW(tail[k], font) end
      end
      line[#line + 1] = ch
      w = w + cw
    end
  end
  flush()
  if #out == 0 then out[1] = '' end
  return out
end

-- 引擎 requiredHeight（studio/play/text-layout.js；main.lua MS.addText 注释抄了同一条）
local function engineReqH(font, lines)
  return M.ENGINE.lineH * font * lines + (M.ENGINE.inset * font + M.ENGINE.insetAdd)
end
-- view_node.textNeed 口径（每行 1.45f + 4）
local function viewNeedH(font, lines)
  return lines * (M.MEASURE.lineH * font + M.MEASURE.perLine)
end
-- 框高 = 两套口径里更严的那个（**由行数反推**，不是写死）
local function boxH(font, lines)
  if lines < 1 then lines = 1 end
  local a = math.ceil(viewNeedH(font, lines))
  local b = math.ceil(engineReqH(font, lines))
  return (a > b) and a or b
end

M.glyphW, M.wrap, M.engineReqH, M.viewNeedH, M.boxH = glyphW, wrap, engineReqH, viewNeedH, boxH

-- 台词行色：前两行正文色，后两行次色（与现网 4 行台词区的层次一致）
local function lineInk(i, THEME)
  if i <= 2 then return THEME.textMain end
  return THEME.textSub or THEME.textMain
end

-- ===========================================================================
-- 右列内容：五页各不相同（现网 tab 2/3/4 落进同一个 else 分支 ⇒ 三页内容一模一样）
--   内容全部来自注入的 copy + 会话状态；页面 chrome 短句在 M.PAGE。
-- ===========================================================================
local countsLine
local function entriesFor(tab, d)
  local out = {}
  local page = d.page or M.PAGE
  local T = page.entryTitles or M.PAGE.entryTitles
  local function push(nm, desc, val)
    out[#out + 1] = { nm = nm, desc = desc, val = val }
  end
  if tab == 1 then
    push(string.format(M.PAGE.skillFmt, tostring(d.skill or ''), tostring(d.cd or 0)),
      tostring(d.skillDesc or ''), nil)
    for i = 1, #(d.help or {}) do
      push((T[2] or '使用要点') .. ' ' .. tostring(i), d.help[i], nil)
    end
  elseif tab == 2 then
    for i = 1, #(d.tips or {}) do
      push((T[3] or '机制') .. ' ' .. tostring(i), d.tips[i], nil)
    end
  elseif tab == 3 then
    push('本局等级', 'Lv' .. tostring(d.lv or 1),
      '台前 ' .. tostring(d.inParty and 1 or 0) .. '/' .. tostring(d.partyMax or M.DEFAULT_PARTY_MAX))
    push('累计计数', countsLine(d.cnt), nil)
  elseif tab == 4 then
    push(d.open and (page.joined or M.PAGE.joined) or (page.unjoined or M.PAGE.unjoined),
      d.open and '可以在局内直接使用她的技能。' or '满足条件后自动缔结，不需要额外操作。',
      d.inParty and '台前' or (d.open and (page.stateBack or M.PAGE.stateBack)
        or (page.stateLocked or M.PAGE.stateLocked)))
    push('累计进度', countsLine(d.cnt), nil)
  else
    push(T[6] or '规则', string.format(M.PAGE.partyRule, tonumber(d.partyMax) or M.DEFAULT_PARTY_MAX), nil)
    push('局外与养成', M.PAGE.progressRule, nil)
  end
  return out
end

countsLine = function(cnt)
  cnt = type(cnt) == 'table' and cnt or {}
  return '消行 ' .. tostring(cnt.lines or 0) .. ' · 局数 ' .. tostring(cnt.games or 0)
    .. ' · 对战 ' .. tostring(cnt.pvp or 0) .. ' · 四消 ' .. tostring(cnt.tetris or 0)
    .. ' · 时长 ' .. tostring(cnt.time or 0) .. 's'
end

M.entriesFor = entriesFor

M.new = function(spec)
  spec = spec or {}
  local cfg = assert(spec.config, 'view_roster: 需要 spec.config')
  local L = assert(spec.layers, 'view_roster: 需要 spec.layers（view_layers）')
  local K = assert(spec.kit, 'view_roster: 需要 spec.kit（view_kit）')
  local COPY = assert(spec.copy, 'view_roster: 需要 spec.copy（copy.lua：文案唯一真源）')
  local ROSTER = spec.roster or {}          -- 会话侧状态：{ unlocked, party, lv, cnt, roles }
  local THEME = assert(cfg.THEME, 'view_roster: config.THEME 必须是 THEME（= STYLE.chrome）')

  for _, name in pairs(M.LAYER) do L.order(name) end    -- 层名写错当场报错

  local S = {}

  -- ===== 颜色工具（与 view_node.unpack / view_kit.C 同口径）=====
  local function parts(c)
    local v = c or 0
    if v < 0 then v = v + 4294967296 end
    return (v // 16777216) % 256, (v // 65536) % 256, (v // 256) % 256, v % 256
  end
  local function opaque(base, c)
    local a, r, g, b = parts(c)
    if a == 255 then return c end
    return K.over(base, K.C(255, r, g, b), a / 255)
  end

  -- ===== 状态读取（opts 优先，其次注入的 roster 会话状态，最后缺省）=====
  local function pick(opts, key) return (opts and opts[key]) or ROSTER[key] end
  local function isUnlocked(opts, role)
    local u = pick(opts, 'unlocked')
    if type(u) == 'table' then return u[role] == true end
    if type(u) == 'function' then return u(role) == true end
    return false
  end
  local function partyOf(opts)
    local p = pick(opts, 'party')
    if type(p) ~= 'table' then p = {} end
    return p
  end
  local function inParty(party, role)
    for i = 1, #party do if party[i] == role then return i end end
    return 0
  end
  local function lvOf(opts, role)
    local lv = pick(opts, 'lv')
    if type(lv) == 'table' then return tonumber(lv[role]) or 1 end
    return tonumber(lv) or 1
  end
  local function cntOf(opts)
    local c = pick(opts, 'cnt')
    return (type(c) == 'table') and c or {}
  end
  local function rolesOf(opts)
    local r = (opts and opts.roles) or ROSTER.roles
    if type(r) ~= 'table' or #r < 1 then r = M.DEFAULT_ROLES end
    return r
  end

  -- ===== 文案读取（全部来自注入的 copy；缺访问器时才回落到裸表）=====
  local function roleEntry(role)
    if COPY.of then return COPY.of(role) or {} end
    return (COPY.ROLES and COPY.ROLES[role]) or {}
  end
  local function linesOf(fn, role, fallback)
    if type(fn) == 'function' then
      local ok, v = pcall(fn, role)
      if ok and type(v) == 'table' then
        local out = {}
        for i = 1, #v do
          local it = v[i]
          if type(it) == 'table' then
            out[#out + 1] = tostring(it.b or it.body or it.text or '')
          else
            out[#out + 1] = tostring(it)
          end
        end
        if #out > 0 then return out end
      end
    end
    return fallback or {}
  end

  -- ===== 主入口：opts → node 数组 =====
  -- opts = { canvas={w,h}, device='pc'|'mobile', role=角色键或序号, tab=1..5,
  --          party={…}, unlocked={role=true}, onTab(i), onClose(), onSwap(i), onEntry(i),
  --          entries={{nm,desc,val,icon}…}（覆盖右列内容）, labels={tabs={…},…},
  --          lv, cnt, roles, cd, partyMax }
  S.roster = function(opts)
    opts = opts or {}
    local device = opts.device or 'pc'
    if device ~= 'pc' and device ~= 'mobile' then
      error("view_roster: opts.device 只认 'pc' / 'mobile'，收到 " .. tostring(device))
    end
    local page = opts.labels or M.PAGE
    local canvas = opts.canvas or { 1600, 900 }
    local W, H = canvas[1] or 1600, canvas[2] or 900

    -- 现网缩放口径：k = min(W/1600, H/980)；字号按 k 缩放（**这是移动端那处 bug 的修法**）
    local k = math.min(W / M.DESIGN.W, H / M.DESIGN.H)
    if k <= 0 then k = 1 end
    local function u(v) return v * k end
    local function fs(v)
      local r = math.floor(v * k + 0.5)
      if r < 12 then r = 12 end     -- 引擎小字号会静默回落，给个下限
      return r
    end

    local PW = u(M.CARD.W)
    local PH = math.min(u(M.CARD.H), H - u(M.CARD.PADH))
    local PL, PR = -PW / 2, PW / 2
    local wash = THEME.scrim or THEME.wall

    local out = {}
    local function add(n)
      n.seq = #out + 1
      out[#out + 1] = n
      return n
    end
    local function shape(key, role, layer, x, y, w, h, color, sh)
      return add {
        key = key, name = key, role = role, layer = layer, tpl = 'cell',
        pos = { x, y }, size = { w, h }, color = color, image = { s = sh or 'rect' },
      }
    end
    -- 画布级整屏块（遮罩不乘 k：它必须正好盖住画布）
    local function scrim(key, w, h, color)
      return add {
        key = key, name = key, role = M.ROLE.scrim, layer = M.LAYER.scrim, tpl = 'cell',
        pos = { 0, 0 }, size = { w, h }, color = color, image = { s = 'rect' },
      }
    end
    -- 圆角矩形 = 2 矩形 + 4 角圆（与 view_help.rrect / 现网 rrect 同构）
    local function rrect(tag, role, layer, x, y, w, h, r, color, vis)
      if vis == nil then vis = true end
      if r > h / 2 then r = h / 2 end
      if r > w / 2 then r = w / 2 end
      local ix, iy = math.max(1, w - 2 * r), math.max(1, h - 2 * r)
      local dx, dy = w / 2 - r, h / 2 - r
      local nodes = {
        shape(tag .. 'A', role, layer, x, y, ix, h, color, 'rect'),
        shape(tag .. 'B', role, layer, x, y, w, iy, color, 'rect'),
        shape(tag .. 'C1', role, layer, x - dx, y - dy, 2 * r, 2 * r, color, 'circle'),
        shape(tag .. 'C2', role, layer, x + dx, y - dy, 2 * r, 2 * r, color, 'circle'),
        shape(tag .. 'C3', role, layer, x - dx, y + dy, 2 * r, 2 * r, color, 'circle'),
        shape(tag .. 'C4', role, layer, x + dx, y + dy, 2 * r, 2 * r, color, 'circle'),
      }
      if not vis then for i = 1, #nodes do nodes[i].visible = false end end
      return nodes
    end
    -- 文字节点：**先折行、再按行数定框高**（C1）
    local function text(key, role, str, x, y, w, fontDesign, color, align)
      local f = fs(fontDesign)
      local lines = wrap(str, f, w)
      local n = K.text {
        key = key, name = key, x = x, y = y, w = w, h = boxH(f, #lines),
        text = table.concat(lines, '\n'), font = f, color = color,
        align = align or 'Middle', layer = M.LAYER.text,
      }
      n.role = role
      n.lines = #lines
      n.measured = true        -- 框高由本模块按内容反推（K.button 的内件不算）
      return add(n)
    end
    local function hit(key, x, y, w, h, cb)
      local n = add {
        key = key, name = key, role = M.ROLE.hit, layer = M.LAYER.hit, tpl = 'hit',
        pos = { x, y }, size = { w, h }, cursor = { 'CursorClick' },
        on = cb and { CursorClick = cb } or nil,
      }
      return n
    end
    local function button(key, role, x, y, w, h, o)
      local nodes = K.button {
        key = key, x = x, y = y, w = w, h = h,
        label = o.label, sub = o.sub, font = o.font, subFont = o.subFont,
        fill = o.fill, ink = o.ink, subInk = o.subInk,
        -- v6.15（用户 2026-11-02 图二「这几个按钮的文字没有居中」）：
        -- 列表行有副标 ⇒ 标题上移是设计；页签/关闭这类单行按钮沿用同一偏移就会整体偏高。
        pad = o.pad, titleDy = o.titleDy or (o.sub and u(M.LIST.TITLE_DY) or 0),
        subDy = o.subDy or u(M.LIST.SUB_DY),
        preset = o.preset, layer = M.LAYER.text, hitLayer = M.LAYER.hit,
        hitPadW = (o.hitPadW ~= nil) and o.hitPadW or M.HITPAD.w,
        hitPadH = (o.hitPadH ~= nil) and o.hitPadH or M.HITPAD.h,
        on = o.on and { CursorClick = o.on } or nil,
      }
      for i = 1, #nodes do
        local kk = nodes[i].key
        nodes[i].role = (kk:sub(-3) == 'Hit') and M.ROLE.hit
          or (kk:sub(-1) == 'S') and M.ROLE.subheading or role
        add(nodes[i])
      end
      return nodes
    end

    -- ===== 选角 / 页签 =====
    local roles = rolesOf(opts)
    local sel, selRole = 1, roles[1]
    if type(opts.role) == 'string' then
      for i = 1, #roles do
        if roles[i] == opts.role then sel, selRole = i, roles[i] end
      end
    elseif type(opts.role) == 'number' and roles[opts.role] then
      sel = math.floor(opts.role)
      selRole = roles[sel]
    end
    local tabCount = page.tabs and #page.tabs or M.TABS.N
    local tab = math.floor(tonumber(opts.tab) or 1)
    if tab < 1 or tab > tabCount then tab = 1 end

    local party = partyOf(opts)
    local partyMax = tonumber(opts.partyMax) or tonumber(ROSTER.partyMax) or M.DEFAULT_PARTY_MAX
    local cnt = cntOf(opts)
    local e = roleEntry(selRole)
    local open = isUnlocked(opts, selRole)
    local lv = lvOf(opts, selRole)
    local roleColor = e.color or K.C(255, 127, 207, 106)
    local roleColor2 = e.color2 or THEME.textMain
    local accent = e.accent or roleColor

    local INK = THEME.textMain
    local SUB = THEME.textSub or INK
    local DIM = THEME.textDim or SUB
    local GOLD = THEME.gold
    local WHITE = K.C(255, 255, 255, 255)

    -- ===== ① 遮罩 + 面板 + 顶栏 + 描金细线（panel 层）=====
    scrim('charDim', W + 40, H + 40, K.C(176, 20, 34, 50))
    shape('charCard', M.ROLE.surface, M.LAYER.surface, 0, 0, PW, PH,
      opaque(wash, K.C(252, 250, 244, 252)))
    shape('charTop', M.ROLE.topbar, M.LAYER.surface, 0, PH / 2 - u(M.TOP.TITLE_DY), PW, u(M.TOP.H),
      opaque(wash, K.C(255, 250, 240, 246)))
    shape('charRule', M.ROLE.rule, M.LAYER.surface, 0, PH / 2 - u(M.TOP.RULE_DY),
      PW - u(M.TOP.RULE_INSET), u(2), GOLD)

    -- ===== ② 标题 / 副标 / 关闭（card 层）=====
    local titleX = PL + u(M.TOP.X) + u(M.TOP.TITLE_W) / 2      -- TXTL 传左沿，这里换中心
    text('charTitle', M.ROLE.heading, page.title, titleX, PH / 2 - u(M.TOP.TITLE_DY),
      u(M.TOP.TITLE_W), M.TOP.TITLE_FONT, INK, 'Left')
    local hintTxt = (device == 'mobile') and (page.hintTouch or '') or (page.hintPC or '')
    text('charHint', M.ROLE.subheading, hintTxt, titleX, PH / 2 - u(M.TOP.SUB_DY),
      u(M.TOP.TITLE_W), M.TOP.SUB_FONT, SUB, 'Left')
    button('charClose', M.ROLE.close, PR - u(M.CLOSE.DX), PH / 2 - u(M.CLOSE.DY),
      u(M.CLOSE.W), u(M.CLOSE.H), {
        label = page.close or M.PAGE.close, font = fs(M.CLOSE.FONT), preset = 'gold',
        on = opts.onClose,
      })

    -- ===== ③ 左列：四个角色行（选中=角色色实底+白字；未解锁=次色字）=====
    local listX = PL + u(M.LIST.X)
    local rows = {}
    for i = 1, #roles do
      local rr = roles[i]
      local er = roleEntry(rr)
      local idx = inParty(party, rr)
      local rOpen = isUnlocked(opts, rr)
      local nm = tostring(er.name or rr) .. (idx > 0 and (page.partyMark or M.PAGE.partyMark) or '')
      local stateTxt
      if rOpen then
        stateTxt = (idx > 0) and string.format(M.PAGE.stateFront, lvOf(opts, rr))
          or (page.stateBack or M.PAGE.stateBack)
      else
        stateTxt = page.stateLocked or M.PAGE.stateLocked
      end
      local on = (i == sel)
      local fill = on and roleColor
        or (rOpen and opaque(wash, K.C(240, 250, 252, 244))
          or opaque(wash, K.C(246, 248, 249, 236)))
      rows[i] = button('charRow' .. i, M.ROLE.row, listX + u(M.LIST.CX),
        u(M.LIST.Y0) - (i - 1) * u(M.LIST.DY), u(M.LIST.W), u(M.LIST.H), {
          label = nm, sub = stateTxt,
          font = fs(M.LIST.FONT), subFont = fs(M.LIST.SUB_FONT), pad = u(M.LIST.PAD),
          fill = fill,
          ink = on and WHITE or (rOpen and INK or SUB),
          subInk = on and (er.color2 or K.C(255, 70, 90, 80)) or (rOpen and (er.color2 or INK) or SUB),
          on = opts.onSwap and function() opts.onSwap(i) end or nil,
        })
      rows[i].rowRole = rr
      rows[i].rowOpen = rOpen
    end

    -- ===== ④ 中列：台词/契约面板（内容驱动的纵向流）=====
    local midCx = PL + u(M.MID.X) + u(M.MID.W) / 2
    local midY = u(M.MID.Y)
    local midH = u(M.MID.H)
    local midTop = midY + midH / 2 - u(8)
    local midFill = K.over(K.C(255, 252, 250, 244), roleColor, 0.20)
    rrect('charPanel', M.ROLE.panel, M.LAYER.surface, midCx, midY, u(M.MID.W), midH, u(M.MID.R), midFill)
    local midW = u(M.MID.W)
    local subTxt = string.format(M.PAGE.subFmt, tostring(e.element or ''), tostring(e.title or ''),
      tostring(lv), open and (page.joined or M.PAGE.joined) or (page.unjoined or M.PAGE.unjoined))
    local titleFont, subFont = fs(M.MID.TITLE_FONT), fs(M.MID.SUB_FONT)
    local nameTxt = tostring(e.name or selRole)
    local titleW, subW = midW - u(M.MID.TITLE_INSET), midW - u(M.MID.TITLE_INSET)
    local titleH = boxH(titleFont, #wrap(nameTxt, titleFont, titleW))
    local subH = boxH(subFont, #wrap(subTxt, subFont, subW))
    local titleY = midTop - u(M.MID.TITLE_DY)
    local subY = titleY - titleH / 2 - u(2) - subH / 2
    local ruleY = subY - subH / 2 - u(10)
    text('charPanelT', M.ROLE.heading, nameTxt, midCx, titleY, titleW, M.MID.TITLE_FONT,
      roleColor2, 'Middle')
    text('charPanelS', M.ROLE.subheading, subTxt, midCx, subY, subW, M.MID.SUB_FONT, SUB, 'Middle')
    shape('charPanelR', M.ROLE.rule, M.LAYER.surface, midCx, ruleY, midW - u(56), u(2), accent)
    local says = linesOf(COPY.sayList, selRole, linesOf(COPY.help, selRole, {}))
    local ly = ruleY - u(16)
    local lineW = midW - u(M.MID.INSET)
    for i = 1, M.MID.MAX_LINES do
      local ln = text('charPanelL' .. i, M.ROLE.cardLine, says[i] or '', midCx, ly,
        lineW, M.MID.FS, lineInk(i, THEME), 'Left')
      ln.visible = (says[i] ~= nil and says[i] ~= '')
      ly = ly - u(4) - ln.size[2] / 2 - boxH(fs(M.MID.FS), 1) / 2
    end
    local skill = tostring(e.skill or '')
    local cd = tonumber(opts.cd) or tonumber(ROSTER.cd)
    local footTxt = cd and string.format(M.PAGE.skillFmt, skill, tostring(cd))
      or string.format(M.PAGE.skillPlain or M.PAGE.skillFmt, skill)
    text('charPanelF', M.ROLE.cardVal, footTxt,
      midCx, midY - midH / 2 + u(M.MID.FOOT_DY), midW - u(M.MID.TITLE_INSET),
      M.MID.FOOT_FONT, accent, 'Middle')

    -- ===== ⑤ 右列：页签（选中=角色色实底）+ 条目卡 =====
    local tabNames = page.tabs or M.PAGE.tabs
    for i = 1, tabCount do
      local on = (i == tab)
      button('charTab' .. i, M.ROLE.tab, PL + u(M.TABS.X) + (i - 1) * u(M.TABS.DX) + u(48),
        u(M.TABS.Y), u(M.TABS.W), u(M.TABS.H), {
          label = tabNames[i] or tostring(i), font = fs(M.TABS.FONT), pad = u(M.TABS.PAD),
          fill = on and roleColor or opaque(wash, K.C(240, 244, 244, 246)),
          ink = on and WHITE or INK,
          hitPadW = M.HITPAD.tabW, hitPadH = M.HITPAD.tabH,
          on = opts.onTab and function() opts.onTab(i) end or nil,
        })
    end

    local items = opts.entries or entriesFor(tab, {
      e = e, role = selRole, open = open, inParty = inParty(party, selRole) > 0,
      lv = lv, cnt = cnt, partyMax = partyMax, skill = skill, cd = cd,
      help = linesOf(COPY.help, selRole, {}), tips = linesOf(COPY.tips, selRole, {}),
      skillDesc = tostring(e.skillDesc or ''), page = page,
    })
    local rightCx = PL + u(M.ITEM.X) + u(M.ITEM.W) / 2
    local rightW = u(M.ITEM.W)
    local cardW = rightW - u(M.ITEM.CARD_INSET)
    local textW = rightW - u(M.ITEM.TEXT_INSET)
    local baseY = u(M.ITEM.Y0)
    local floorY = -PH / 2 + u(M.FOOT.DY) + u(M.FOOT.FONT * 2)
    local nmFont, lineFont, valFont = fs(M.ITEM.NM_FONT), fs(M.ITEM.LINE_FONT), fs(M.ITEM.VAL_FONT)
    -- 固定 N 个槽位、等高卡：切页签/切角色只换内容与高亮，**不增删控件**
    -- （render.apply 的语义是"不在列表里的键就销毁"⇒ 节点数一变就要销毁/重建，正是现网
    --  `char codex open n=135` ×33 次重建卡顿的来源）。多出来的槽位用 visible=false 藏起来。
    local slots = M.ITEM.SLOTS
    local gap = u(M.ITEM.GAP)
    local avail = baseY - floorY
    local cardH = (avail - gap * (slots - 1)) / slots
    for idx = 1, slots do
      local it = items[idx]
      local vis = it ~= nil
      local topY = baseY - (idx - 1) * (cardH + gap)
      local cy = topY - cardH / 2
      local cardBottom = topY - cardH
      rrect('charItem' .. idx, M.ROLE.cardBg, M.LAYER.surface, rightCx, cy, cardW, cardH,
        u(M.ITEM.R), opaque(wash, K.over(K.C(255, 244, 236, 222), roleColor, 0.16)), vis)
      local iconCy = topY - u(M.ITEM.TOP) / 2
      shape('charItemIcon' .. idx, M.ROLE.icon, M.LAYER.text, PL + u(M.ITEM.X) + u(M.ITEM.ICON_X),
        iconCy, u(M.ITEM.ICON), u(M.ITEM.ICON), (it and it.icon) or accent,
        (it and it.glyph) or M.GLYPH[((idx - 1) % #M.GLYPH) + 1]).visible = vis or nil
      local nx = PL + u(M.ITEM.X) + u(M.ITEM.TEXT_X) + textW / 2
      local ty = topY - u(M.ITEM.TOP)
      local nmTxt = (it and tostring(it.nm or '')) or ''
      local nmH = boxH(nmFont, #wrap(nmTxt, nmFont, textW))
      text('charItemNm' .. idx, M.ROLE.cardTitle, nmTxt, nx, ty - nmH / 2, textW,
        M.ITEM.NM_FONT, INK, 'Left').visible = vis or nil
      ty = ty - nmH - u(M.ITEM.ROW)
      -- 正文：先按本设备宽度折行，最多显示 CAP 行（末行补省略号）；框高按真实行数算
      local descLines = wrap((it and it.desc) or '', lineFont, textW)
      if #descLines > M.ITEM.CAP then
        descLines[M.ITEM.CAP] = descLines[M.ITEM.CAP] .. (M.ITEM.ELLIPSIS)
      end
      local hasV = vis and it.val ~= nil and it.val ~= ''
      local valH = hasV and boxH(valFont, #wrap(it.val, valFont, textW)) or 0
      -- 空间不够就先让数值行、再让第二行正文（卡片高度是固定的，不能让文字越出卡片）
      local needWithV = ty - u(M.ITEM.ROW) - valH - u(M.ITEM.BOT)
      if hasV and needWithV < cardBottom then hasV = false end
      for li = 1, M.ITEM.CAP do
        local t = descLines[li]
        local show = vis and t ~= nil
        local lh = boxH(lineFont, 1)
        if show and (ty - lh) < cardBottom then show = false end
        text('charItemL' .. idx .. '_' .. li, M.ROLE.cardLine, t or '', nx, ty - lh / 2,
          textW, M.ITEM.LINE_FONT, SUB, 'Left').visible = show or nil
        ty = ty - lh
      end
      local vt = text('charItemV' .. idx, M.ROLE.cardVal, hasV and it.val or '',
        nx, ty - u(M.ITEM.ROW) - valH / 2, textW, M.ITEM.VAL_FONT, roleColor2, 'Left')
      vt.visible = hasV or nil
      local hidx = idx
      hit('charItemHit' .. idx, rightCx, cy, rightW, cardH, function()
        if opts.onEntry and items[hidx] then opts.onEntry(hidx) end
      end).visible = vis or nil
    end

    -- ===== ⑥ 页脚 =====
    text('charFoot', M.ROLE.foot, page.foot or M.PAGE.foot,
      PL + u(M.FOOT.X) + (PW - u(M.FOOT.INSET)) / 2, -PH / 2 + u(M.FOOT.DY),
      PW - u(M.FOOT.INSET), M.FOOT.FONT, THEME.hint or DIM, 'Middle')

    S.lastEntries = items
    S.lastTab = tab
    return out
  end

  -- ===== 条目详情浮层（modal 层）=====
  -- 调用方用**独立的 render 实例**承载：open 前 clear、close 只清自己那份；
  -- 层号用 view_layers 的 modal（90，> panel 50 / touch 70）⇒ 天然压住档案页，不靠创建顺序。
  S.detail = function(opts)
    opts = opts or {}
    local canvas = opts.canvas or { 1600, 900 }
    local W, H = canvas[1] or 1600, canvas[2] or 900
    local mobile = (opts.device == 'mobile')
    local MODAL = 'modal'
    L.order(MODAL)
    local k = math.min(W / 1600, H / 980)
    if k <= 0 then k = 1 end
    local function u(v) return v * k end
    local wash = THEME.scrim or THEME.wall
    local out = {}
    local function add(n) out[#out + 1] = n return n end
    add {
      key = 'charDetailDim', name = 'charDetailDim', role = M.ROLE.scrim, layer = MODAL,
      tpl = 'cell', pos = { 0, 0 }, size = { W + 60, H + 60 }, color = wash,
    }
    local cw = math.min(u(1100), W - u(120))
    local titleFont = mobile and 20 or 22
    local font = mobile and 16 or 18
    local bodyW = cw - u(80)
    local titleH = boxH(titleFont, 1)
    local maxBodyH = H * 0.62 - titleH - u(96)
    local lines = wrap(tostring(opts.body or ''), font, bodyW)
    local keep, used = {}, 0
    for i = 1, #lines do
      local lh = boxH(font, 1)
      if used + lh <= maxBodyH or #keep == 0 then
        keep[#keep + 1] = lines[i]
        used = used + lh
      end
    end
    if #keep < #lines and #keep > 0 then keep[#keep] = keep[#keep] .. M.ELLIPSIS end
    local bodyH = boxH(font, #keep)
    local ch = titleH + u(48) + bodyH + u(64)
    local cy = u(10)
    local r = u(26)
    local fill = opaque(wash, THEME.panel or 0xFFFFFFFF)
    add {
      key = 'charDetailCardA', name = 'charDetailCardA', role = M.ROLE.surface, layer = MODAL,
      tpl = 'cell', pos = { 0, cy }, size = { cw - 2 * r, ch }, color = fill,
    }
    add {
      key = 'charDetailCardB', name = 'charDetailCardB', role = M.ROLE.surface, layer = MODAL,
      tpl = 'cell', pos = { 0, cy }, size = { cw, ch - 2 * r }, color = fill,
    }
    for i = 1, 4 do
      local sx = ((i == 1 or i == 3) and -1 or 1) * (cw / 2 - r)
      local sy = ((i <= 2) and 1 or -1) * (ch / 2 - r)
      add {
        key = 'charDetailCardC' .. i, name = 'charDetailCardC' .. i, role = M.ROLE.surface,
        layer = MODAL, tpl = 'cell', pos = { sx, cy + sy }, size = { 2 * r, 2 * r }, color = fill,
        image = { s = 'circle' },
      }
    end
    local topY = cy + ch / 2 - u(28)
    local tn = K.text {
      key = 'charDetailTitle', name = 'charDetailTitle', x = 0, y = topY - titleH / 2,
      w = bodyW, h = titleH, text = tostring(opts.title or ''), font = titleFont,
      color = THEME.textMain, layer = MODAL, align = 'Left',
    }
    tn.role = M.ROLE.heading
    add(tn)
    local bn = K.text {
      key = 'charDetailBody', name = 'charDetailBody', x = 0,
      y = topY - titleH - u(16) - bodyH / 2, w = bodyW, h = bodyH,
      text = table.concat(keep, '\n'), font = font, color = THEME.textSub or THEME.textMain,
      layer = MODAL, align = 'Left',
    }
    bn.role = M.ROLE.cardLine
    add(bn)
    local hn = K.text {
      key = 'charDetailHint', name = 'charDetailHint', x = 0,
      y = cy - ch / 2 + u(24), w = bodyW, h = boxH(font, 1),
      text = tostring(opts.hint or '点任意处关闭'), font = font,
      color = THEME.hint or THEME.textDim, layer = MODAL, align = 'Middle',
    }
    hn.role = M.ROLE.foot
    add(hn)
    local h = K.hit {
      key = 'charDetailHit', name = 'charDetailHit', x = 0, y = 0,
      w = W + 60, h = H + 60, layer = MODAL,
      on = opts.onClose and { CursorClick = opts.onClose } or nil,
    }
    h.role = M.ROLE.hit
    add(h)
    return out
  end

  return S
end

return M
