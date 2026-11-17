--[[==========================================================================
 tests-lua/view_settle_test.lua —— 结算页纯描述（view_settle.lua）的 headless 验收
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_settle_test.lua
 判据：输出全 PASS、退出码 0。

 这份测试钉住四件事（对应交付报告的三栏）：
   ① 抄录有没有漂：卡/装饰带/六槽 y/字号/字色/文案逐值等于现网（锚写在各断言边上）
   ② 三个真缺陷各自被哪条结构约束消灭（C1 不透明 / C2 层序+几何 / C3 变体互斥）
   ③ lint 在 5 个真实画布 × 2 变体上 0 issue；render 通道 0 R0/R1、创建序 = 层序
   ④ 回归守卫：把"旧的坏描述"（半透明底 + 低层 + 重叠 + 动作两遍）喂给同一套检查，
      必须报 L3/L5/L6 与「动作重复 2 次」——证明检查本身拦得住，而不是新代码碰巧干净
 ========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')

-- v6.26：可用模板键集合＝config.TPL_GUIDS 的键（单源，框架判 L2t 用）
local TPLKEYS = {}
for k, v in pairs(cfg.TPL_GUIDS or {}) do
  if type(v) == 'table' and #v > 0 then TPLKEYS[#TPLKEYS + 1] = k end
end
local vkit = load('lua/tetris/view_kit.lua')
local platform = load('lua/tetris/platform.lua')
local renderM = load('lua/tetris/render.lua')
local viewSettle = load('lua/tetris/view_settle.lua')

local V = vnode.new { layers = layers }
local K = vkit.new { layers = layers }
local S = viewSettle.new { config = cfg, layers = layers, kit = K }

-- ===== 断言小工具 =====
local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. name)
  else
    fail = fail + 1
    print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or ''))
  end
end

local function hex(c)
  if c == nil then return 'nil' end
  local v = c
  if v < 0 then v = v + 4294967296 end
  return string.format('0x%08X', v)
end

-- 5 个真实画布（真值来源 qxqy/frame-strip.mjs CANVAS_PRESETS）
local CANVASES = {
  { 1600, 900 }, { 2100, 900 }, { 1280, 720 }, { 1560, 720 }, { 1280, 960 },
}

local function build(device, canvas, extra)
  local o = {
    score = 152, best = 152, lines = 0, pieceCount = 10, level = 1, mode = 'casual',
    canvas = canvas or ((device == 'mobile') and { 1280, 720 } or { 1600, 900 }),
    device = device,
  }
  if extra then for k, v in pairs(extra) do o[k] = v end end
  return S.settle(o)
end

local function optNodes(nodes)
  local t = {}
  for i = 1, #nodes do if nodes[i].opt then t[#t + 1] = nodes[i] end end
  return t
end

local function roleNodes(nodes, role)
  local t = {}
  for i = 1, #nodes do if nodes[i].role == role then t[#t + 1] = nodes[i] end end
  return t
end

local function groupOf(nodes)
  -- optGroup -> { rim={...}, fill={...}, label=n, hit=n }
  local g = {}
  for i = 1, #nodes do
    local n = nodes[i]
    if n.opt then
      local e = g[n.optGroup] or { rim = {}, fill = {} }
      g[n.optGroup] = e
      if n.role == 'capRim' then e.rim[#e.rim + 1] = n
      elseif n.role == 'capFill' then e.fill[#e.fill + 1] = n
      elseif n.role == 'capLabel' then e.label = n
      elseif n.role == 'hit' then e.hit = n
      elseif n.role == 'hint' then e.hint = n end
    end
  end
  return g
end

-- 动作标签（"动作重复"检测器的口径：可见标签，去掉键位前缀后比）
local function actionLabels(nodes)
  local t = {}
  for i = 1, #nodes do
    local n = nodes[i]
    if n.text and n.text ~= '' and (n.role == 'capLabel' or n.role == 'hint') then
      t[#t + 1] = (n.text:gsub('^%[.-%] ', ''))
    end
  end
  return t
end

local function countOf(t, s)
  local c = 0
  for i = 1, #t do if t[i] == s then c = c + 1 end end
  return c
end

local function fn() end

-- 胶囊图元的小工具（§C 引擎侧断言与 §E 描述层断言共用）
local function isCapsule(n) return n.role == 'capRim' or n.role == 'capFill' end
local function isEndPart(n) return n.key:sub(-1) == 'L' or n.key:sub(-1) == 'R' end
local function shapeOf(n) return type(n.image) == 'table' and n.image.s or n.image end

-- 一层深拷贝（改坏样本时不污染原数组）
local function copyNodes(list)
  local out = {}
  for i = 1, #list do
    local src, dst = list[i], {}
    for k, v in pairs(src) do
      if type(v) == 'table' then
        local c = {}
        for k2, v2 in pairs(v) do c[k2] = v2 end
        dst[k] = c
      else
        dst[k] = v
      end
    end
    out[i] = dst
  end
  return out
end

-- 引擎侧形状检查：读控件真实字段（imageId / imageSource），不读描述
local CIRCLE_ID, RECT_ID = 100002, 100001
local function engineShapeBad(P, R, nodes)
  local checked = 0
  for i = 1, #nodes do
    local nd = nodes[i]
    if isCapsule(nd) then
      local ctl = R.get(nd.key)
      if not ctl then return 'no ctl ' .. nd.key, checked end
      local want = isEndPart(nd) and CIRCLE_ID or RECT_ID
      if ctl.imageId ~= want then
        return nd.key .. ' imageId=' .. tostring(ctl.imageId) .. ' 期望 ' .. want, checked
      end
      if ctl.imageSource ~= 'StaticReference' then
        return nd.key .. ' imageSource=' .. tostring(ctl.imageSource), checked
      end
      checked = checked + 1
    end
  end
  return nil, checked
end

----------------------------------------------------------------------------
-- §A 抄录：几何 / 字号 / 字色 / 文案（锚：main.lua layoutSettle / settleSetColors / showGameOver）
----------------------------------------------------------------------------
local N = build('mobile')
local card = V.get(N, 'settleCard')
ok(card and card.size[1] == 780 and card.size[2] == 400 and card.pos[1] == 0 and card.pos[2] == 0,
  'A1 卡 780×400 @(0,0)（锚 layoutSettle: cw=min(W-240,780)、ch=400）',
  card and (card.size[1] .. 'x' .. card.size[2]))
ok(card and card.color == cfg.THEME.panel,
  'A2 卡色 = THEME.panel（锚 MS.opts: trySet(g.settleCard, imageColor, THEME.panel)）',
  card and hex(card.color))

local narrow = V.get(build('mobile', { 900, 720 }), 'settleCard')
ok(narrow and narrow.size[1] == 660, 'A3 窄画布卡宽 = min(W-240,780)（W=900 ⇒ 660）',
  narrow and narrow.size[1])

local bars = {
  V.get(N, 'settleBar1'), V.get(N, 'settleBar2'), V.get(N, 'settleBar3'),
}
local mt = cfg.MODE_THEME.casual
ok(bars[1] and bars[1].pos[2] == 197 and bars[1].size[2] == 6 and bars[1].size[1] == 780
  and bars[1].color == mt.frame,
  'A4 顶条 (0,197) 780×6 = 模式色 frame（锚 layoutSettle bars[1]: 0, ch/2-3, cw, 6）',
  bars[1] and (bars[1].pos[2] .. '/' .. hex(bars[1].color)))
ok(bars[2] and bars[2].pos[2] == 104 and bars[2].size[1] == 630 and bars[2].color == cfg.THEME.gold
  and bars[3] and bars[3].pos[2] == -104 and bars[3].size[1] == 630,
  'A5 金细带 (0,±104) cw-150=630×2（锚 layoutSettle bars[2]/[3]）')

local slots = {
  { 'settleTitle', 140, 44, 80 }, { 'settleScore', 66, 34, 56 }, { 'settleBest', 16, 24, 44 },
  { 'settleInfo', -26, 20, 40 }, { 'settleNote', -64, 20, 40 },
}
local slotBad = nil
for i = 1, #slots do
  local s = slots[i]
  local n = V.get(N, s[1])
  if not n or n.pos[2] ~= s[2] or n.font ~= s[3] or n.size[2] ~= s[4] then
    slotBad = s[1] .. ' y/font/h=' .. tostring(n and (n.pos[2] .. '/' .. n.font .. '/' .. n.size[2]))
  end
end
ok(slotBad == nil, 'A6 五行槽 y/字号/框高 = 140/66/16/-26/-64 与 44/34/24/20/20（锚 layoutSettle 六槽）',
  slotBad)

local colors = {
  { 'settleTitle', cfg.C(255, 185, 138, 60) }, { 'settleScore', cfg.C(255, 214, 126, 46) },
  { 'settleBest', cfg.C(255, 62, 74, 99) }, { 'settleInfo', cfg.C(209, 124, 140, 168) },
  -- 旁白色来自 config.COPY.settle[1].color（= THEME.textSub），只有缺色时才回落
  -- settleSetColors 的 {96,112,132}；两种口径都在 A12b 里钉住
  { 'settleNote', cfg.C(224, (cfg.THEME.textSub // 65536) % 256,
    (cfg.THEME.textSub // 256) % 256, cfg.THEME.textSub % 256) },
}
local colBad = nil
for i = 1, #colors do
  local n = V.get(N, colors[i][1])
  if not n or n.fcolor ~= colors[i][2] then
    colBad = colors[i][1] .. ' 实得 ' .. hex(n and n.fcolor) .. ' 期望 ' .. hex(colors[i][2])
  end
end
ok(colBad == nil, 'A7 五行字色 = settleSetColors(255) 逐值（深金/暖橙/墨/0.82/0.88+noteRGB 缺省）', colBad)

local dim = V.get(build('mobile', nil, { alpha = 128 }), 'settleInfo')
local dimN = V.get(build('mobile', nil, { alpha = 128 }), 'settleNote')
ok(dim and V.alpha(dim.fcolor) == 104 and dimN and V.alpha(dimN.fcolor) == 112,
  'A8 alpha 通道 = settleSetColors(a)：a=128 ⇒ info ⌊0.82a⌋=104 / note ⌊0.88a⌋=112',
  dim and (V.alpha(dim.fcolor) .. '/' .. V.alpha(dimN.fcolor)))

ok(V.get(N, 'settleScore').text == '本局 152 分' and V.get(N, 'settleBest').text == '最高 152',
  'A9 文案「本局 152 分」「最高 152」逐字（锚 showGameOver 两条 setText）',
  V.get(N, 'settleScore').text .. ' | ' .. V.get(N, 'settleBest').text)
ok(V.get(N, 'settleInfo').text == '消行 0 行\u{3000}\u{3000}落块 10\u{3000}\u{3000}等级 1',
  'A10 文案「消行 0 行　　落块 10　　等级 1」逐字（分隔符 = 2×U+3000，已 od 复核）',
  V.get(N, 'settleInfo').text)

local titles = {
  { { }, '游戏结束' },
  { { win = true, mode = 'pvp' }, 'P1 胜！' },
  { { win = true, mode = 'coop' }, '合作成功！' },
  { { win = true, mode = 'casual' }, '你赢了！' },
  { { title = '对家盘顶满' }, '对家盘顶满' },
}
local titleBad = nil
for i = 1, #titles do
  local t = V.get(build('mobile', nil, titles[i][1]), 'settleTitle').text
  if t ~= titles[i][2] then titleBad = tostring(t) .. '≠' .. titles[i][2] end
end
ok(titleBad == nil, 'A11 标题四态（游戏结束/P1 胜！/合作成功！/你赢了！+ 显式 title 覆盖）', titleBad)

local notes = {
  { 1, '旅行暂歇——提瓦特还有七国等你。' },
  { 2, '凯瑟琳记下了这一程：消行 0 行。' },
  { 3, '派蒙：再来一局吧，这次一定行！' },
}
local noteBad = nil
for i = 1, #notes do
  local t = V.get(build('mobile', nil, { noteIdx = notes[i][1] }), 'settleNote').text
  if t ~= notes[i][2] then noteBad = tostring(t) .. '≠' .. notes[i][2] end
end
ok(noteBad == nil, 'A12 旁白轮播三条逐字（锚 config.COPY.settle E1/E2/E3；{lines} 已替换）', noteBad)

do
  local n2 = V.get(build('mobile', nil, { note = '自定旁白' }), 'settleNote')
  ok(n2.text == '自定旁白' and n2.fcolor == cfg.C(224, 96, 112, 132),
    'A7b note 缺色时回落 settleSetColors 的 {96,112,132}（C(⌊0.88a⌋,96,112,132)）',
    hex(n2.fcolor))
end
ok(V.get(N, 'settleTitle').size[1] == 720,
  'A11b 文字框宽 = cw-60 = 720（锚 layoutSettle）', V.get(N, 'settleTitle').size[1])

----------------------------------------------------------------------------
-- §B 结构约束：三个真缺陷各自被哪条约束消灭
----------------------------------------------------------------------------
local wash = cfg.THEME.scrim                      -- 结算遮罩色（浅底基准）
local washLuma = V.luma(wash)

-- B① 不透明（C1）：手机端胶囊/描边 alpha 必须 255
local capBad, capCount = nil, 0
for _, cv in ipairs(CANVASES) do
  local nodes = build('mobile', cv)
  for i = 1, #nodes do
    local n = nodes[i]
    if n.role == 'capFill' or n.role == 'capRim' then
      capCount = capCount + 1
      if V.alpha(n.color) ~= 255 then
        capBad = n.key .. ' alpha=' .. string.format('0x%02X', V.alpha(n.color))
      end
    end
  end
end
ok(capBad == nil and capCount > 0,
  'B1 【缺陷①】胶囊/描边全部 alpha=255（C1：opaque() 预混；共 ' .. capCount .. ' 个节点 × 5 画布）',
  capBad)

-- B② 可见（C1 补充）：与 wash 的亮度差 ≥ 24（现网真因不是 alpha，是近白压近白）
local visBad = nil
for _, cv in ipairs(CANVASES) do
  local nodes = build('mobile', cv)
  local g = groupOf(nodes)
  for gi, e in pairs(g) do
    local best = 0
    for k = 1, #e.fill do
      local d = math.abs(V.luma(e.fill[k].color) - washLuma)
      if d > best then best = d end
    end
    for k = 1, #e.rim do
      local d = math.abs(V.luma(e.rim[k].color) - washLuma)
      if d > best then best = d end
    end
    if best < 24 then visBad = gi .. ' 最大亮度差 ' .. string.format('%.1f', best) end
  end
end
ok(visBad == nil, 'B2 【缺陷①】每组胶囊「填充或描边」与 wash 的亮度差 ≥ 24（近白压近白=隐形）',
  visBad)

-- B③ 层序（C2）：手机端每个选项节点都在 touch 层（> card > panel）
local layerBad = nil
local touchOrder = layers.order('touch')
for _, cv in ipairs(CANVASES) do
  local nodes = build('mobile', cv)
  local opts = optNodes(nodes)
  for i = 1, #opts do
    local o = layers.order(opts[i].layer or 'hud')
    if o < touchOrder then layerBad = opts[i].key .. ' layer=' .. tostring(opts[i].layer) end
  end
end
ok(layerBad == nil, 'B3 【缺陷②】三选项（胶囊/描边/文字/热区）全在 layer=touch（C2：高于 card/panel）',
  layerBad)

-- PC 变体：热区在 touch（PC 没有胶囊，只有键位提示 + 透明热区）
local pcHits, pcHitBad = 0, nil
local pcNodes = build('pc')
for i = 1, #pcNodes do
  local n = pcNodes[i]
  if n.role == 'hit' then
    pcHits = pcHits + 1
    if layers.order(n.layer) < touchOrder then pcHitBad = n.key .. ' layer=' .. tostring(n.layer) end
  end
end
ok(pcHits == 3 and pcHitBad == nil,
  'B4 【缺陷②】PC 三个热区也在 touch 层（鼠标点得到，不会被卡吃掉）', pcHitBad or pcHits)

-- B④ 几何（C2）：选项矩形 ∩ 卡矩形 = 0，且净距 ≥ ROW_GAP
local overlapBad, gapBad = nil, nil
for _, device in ipairs({ 'mobile', 'pc' }) do
  for _, cv in ipairs(CANVASES) do
    local nodes = build(device, cv)
    local cn = V.get(nodes, 'settleCard')
    local opts = optNodes(nodes)
    for i = 1, #opts do
      local area = V.overlap(opts[i], cn)
      if area > 0 then overlapBad = device .. '/' .. cv[1] .. 'x' .. cv[2] .. ' ' .. opts[i].key .. ' 重叠 ' .. area .. 'px²' end
    end
  end
end
ok(overlapBad == nil,
  'B5 【缺陷②】选项（含热区）× 卡：10 个组合重叠恒为 0px²（C2：rowY 由卡矩形反解）', overlapBad)

-- cardH 可调（消掉卡内空带的可选支路）：卡高变了，卡内五行与细带整体居中下移
do
  local tight = build('mobile', nil, { cardH = 312 })
  local c = V.get(tight, 'settleCard')
  local nt = V.get(tight, 'settleNote')
  local b3 = V.get(tight, 'settleBar3')
  local b1 = V.get(tight, 'settleBar1')
  ok(c.size[2] == 312 and nt.pos[2] == -108 and b3.pos[2] == -148 and b1.pos[2] == 153,
    'B6b cardH=312 可选支路：卡 312、旁白 -108、细带 -148、顶条 153（内容整体居中）',
    c and (c.size[2] .. '/' .. nt.pos[2] .. '/' .. b3.pos[2] .. '/' .. b1.pos[2]))
  local area = 0
  local opts = optNodes(tight)
  for i = 1, #opts do
    local a = V.overlap(opts[i], c)
    if a > area then area = a end
  end
  ok(area == 0 and #V.lint(tight) == 0,
    'B6c cardH=312 支路：选项仍与卡零重叠、lint 仍 0 issue（结构约束不依赖卡高）', area)
end

do
  -- 净距：选项带包围盒顶边 = 卡底 - ROW_GAP（含热区）
  local nodes = build('mobile')
  local top = -1e9
  local opts = optNodes(nodes)
  for i = 1, #opts do
    local _, _, _, y1 = V.rect(opts[i])
    if y1 > top then top = y1 end
  end
  local cardBottom = -400 / 2
  local gap = cardBottom - top
  ok(math.abs(gap - viewSettle.ROW_GAP) < 0.01 and gap >= 8,
    'B6 【缺陷②】选项带顶边净距 = ROW_GAP = 8px（现网实测重叠 12px ⇒ 现在 -12 变 +8）',
    string.format('gap=%.2f', gap))
end

-- B⑤ 变体互斥（C3）：PC 无胶囊、mobile 无键位提示
local mobileNodes = build('mobile')
local pcCaps = 0
for i = 1, #pcNodes do
  local r = pcNodes[i].role
  if r == 'capFill' or r == 'capRim' or r == 'capLabel' then pcCaps = pcCaps + 1 end
end
ok(pcCaps == 0, 'B7 【缺陷③】PC 变体 0 个胶囊节点（C3：PC 只给键位提示）', pcCaps)

local mobileHints = 0
for i = 1, #mobileNodes do
  local t = mobileNodes[i].text
  if type(t) == 'string' and t:find('^%[.-%] ') then mobileHints = mobileHints + 1 end
end
ok(mobileHints == 0, 'B8 【缺陷③】mobile 变体 0 条键位提示（C3：mobile 只给触控胶囊）', mobileHints)

local function hintTexts(nodes)
  local t = {}
  for i = 1, #nodes do
    local n = nodes[i]
    if n.role == 'hint' then t[#t + 1] = n.text end
  end
  table.sort(t)
  return t
end
local pcHints = hintTexts(pcNodes)
ok(#pcHints == 3 and pcHints[1] == '[Q] 结算明细' and pcHints[2] == '[R] 再来一局'
  and pcHints[3] == '[V] 回主页',
  'B9 PC 三条键位提示逐字 = 「[Q] 结算明细」「[R] 再来一局」「[V] 回主页」'
    .. '（锚 MS.opts label + tests/37 optT1..3 契约）', table.concat(pcHints, ' / '))

-- 动作各出现一次（同一动作不会两遍）
local dupBad = nil
for _, device in ipairs({ 'pc', 'mobile' }) do
  local labels = actionLabels(build(device))
  local seen = {}
  for i = 1, #labels do
    seen[labels[i]] = (seen[labels[i]] or 0) + 1
  end
  for k, v in pairs(seen) do
    if v ~= 1 then dupBad = device .. ' 「' .. k .. '」×' .. v end
  end
  if #labels ~= 3 then dupBad = device .. ' 动作标签 ' .. #labels .. ' 条' end
end
ok(dupBad == nil, 'B10 【缺陷③】每个动作标签在每个变体里恰好出现 1 次（不再两遍）', dupBad)

-- B⑥ 热区：覆盖视觉、彼此不重叠（audit-ui 的 overlapWarnRatio 0.02 不会命中）
local hitBad = nil
for _, device in ipairs({ 'pc', 'mobile' }) do
  local nodes = build(device)
  local hits = {}
  for i = 1, #nodes do if nodes[i].role == 'hit' then hits[#hits + 1] = nodes[i] end end
  if #hits ~= 3 then hitBad = device .. ' 热区 ' .. #hits .. ' 个' end
  for i = 1, #hits do
    for j = i + 1, #hits do
      local area = V.overlap(hits[i], hits[j])
      if area > 0 then hitBad = device .. ' ' .. hits[i].key .. ' ∩ ' .. hits[j].key .. '=' .. area end
    end
  end
end
ok(hitBad == nil, 'B11 三个热区两两不重叠（+12 外扩；+40 会让相邻热区重叠 13px）', hitBad)

-- B⑦ lint：5 画布 × 2 变体 0 issue
local lintBad, lintRuns = nil, 0
for _, device in ipairs({ 'pc', 'mobile' }) do
  for _, cv in ipairs(CANVASES) do
    lintRuns = lintRuns + 1
    local issues = V.lint(build(device, cv))
    if #issues > 0 then
      lintBad = device .. '/' .. cv[1] .. 'x' .. cv[2] .. ' ' .. issues[1].code .. ': ' .. issues[1].msg
    end
  end
end
ok(lintBad == nil, 'B12 view_node.lint 0 issue（' .. lintRuns .. ' 次：5 画布 × PC/手机）', lintBad)


----------------------------------------------------------------------------
-- §E 圆角（image 图元通道）与形态开关 style='text'|'pill'
----------------------------------------------------------------------------
-- E1 圆角：端点 circle（且正方形才能贴成半圆）、中段 rect
local pureBad, pureCount = nil, 0
for _, dev in ipairs({ 'mobile', 'pc' }) do
  local nodes = build(dev, nil, (dev == 'pc') and { style = 'pill' } or nil)
  for i = 1, #nodes do
    local n = nodes[i]
    if isCapsule(n) then
      pureCount = pureCount + 1
      local sh = shapeOf(n)
      if isEndPart(n) then
        if sh ~= 'circle' then pureBad = dev .. ' ' .. n.key .. ' 端点 shape=' .. tostring(sh) end
        if n.size[1] ~= n.size[2] then pureBad = dev .. ' ' .. n.key .. ' 端点不是正方形' end
      elseif sh ~= 'rect' then
        pureBad = dev .. ' ' .. n.key .. ' 中段 shape=' .. tostring(sh)
      end
    end
  end
end
ok(pureBad == nil and pureCount > 0,
  'E1 圆角：胶囊端点 image.s=circle（且 h×h）、中段 image.s=rect（' .. pureCount
    .. ' 个图元节点；改回方角即报红）', pureBad)

-- E2 PC pill 支路：几何/字号/文案照抄 MS.opts variant P
local function pillExtent(nodes, id)
  local x0, y0, x1, y1 = 1e9, 1e9, -1e9, -1e9
  for i = 1, #nodes do
    local n = nodes[i]
    if n.optId == id and n.role == 'capFill' then
      local ax, ay, bx, by = V.rect(n)
      if ax < x0 then x0 = ax end
      if ay < y0 then y0 = ay end
      if bx > x1 then x1 = bx end
      if by > y1 then y1 = by end
    end
  end
  return x1 - x0, y1 - y0
end
do
  local nodes = build('pc', nil, { style = 'pill' })
  local want = {
    { 'restart', 252, 64, 25, '[R] 再来一局' },
    { 'home', 174, 52, 20, '[V] 回主页' },
    { 'detail', 176, 44, 18, '[Q] 结算明细' },
  }
  local bad = nil
  for i = 1, #want do
    local w, h = pillExtent(nodes, want[i][1])
    local lbl = nil
    for k = 1, #nodes do
      if nodes[k].optId == want[i][1] and nodes[k].role == 'capLabel' then lbl = nodes[k] end
    end
    if math.abs(w - want[i][2]) > 0.01 or math.abs(h - want[i][3]) > 0.01 then
      bad = want[i][1] .. ' 胶囊 ' .. w .. 'x' .. h .. '≠' .. want[i][2] .. 'x' .. want[i][3]
    elseif not lbl or lbl.font ~= want[i][4] or lbl.text ~= want[i][5] then
      bad = want[i][1] .. ' 标签 ' .. tostring(lbl and (lbl.font .. '/' .. lbl.text))
    end
  end
  ok(bad == nil, 'E2 PC pill 支路几何/字号/文案 = MS.opts variant P'
    .. '（252×64@25 / 174×52@20 / 176×44@18，label 带 [键] 前缀）', bad)
end

-- E3 PC pill 支路同样零重叠 + lint 0（5 画布）
do
  local bad = nil
  for _, cv in ipairs(CANVASES) do
    local nodes = build('pc', cv, { style = 'pill' })
    local cn = V.get(nodes, 'settleCard')
    local opts = optNodes(nodes)
    for i = 1, #opts do
      local a = V.overlap(opts[i], cn)
      if a > 0 then bad = cv[1] .. 'x' .. cv[2] .. ' ' .. opts[i].key .. '重叠 ' .. a .. 'px²' end
    end
    local issues = V.lint(nodes, { tplKeys = TPLKEYS })
    if #issues > 0 then bad = 'lint ' .. issues[1].code .. ' ' .. issues[1].msg end
  end
  ok(bad == nil, 'E3 PC pill 支路：5 画布 0 重叠 + 0 lint issue（同一套卡底反解几何）', bad)
end

-- E4 style 语义：缺省 text / 显式 text / 显式 pill / 非法值报错
do
  local function capsuleCount(nodes)
    local c = 0
    for i = 1, #nodes do if isCapsule(nodes[i]) then c = c + 1 end end
    return c
  end
  local def = build('pc')
  local txt = build('pc', nil, { style = 'text' })
  local pil = build('pc', nil, { style = 'pill' })
  local okBad = not pcall(S.settle, { device = 'pc', style = 'blob', canvas = { 1600, 900 } })
  ok(capsuleCount(def) == 0 and capsuleCount(txt) == 0 and #hintTexts(def) == 3
    and #hintTexts(txt) == 3 and capsuleCount(pil) == 18 and #hintTexts(pil) == 0 and okBad,
    'E4 style 语义：PC 缺省/显式 text ⇒ 0 胶囊+3 提示；pill ⇒ 18 图元+0 提示；非法值报错',
    capsuleCount(def) .. '/' .. capsuleCount(txt) .. '/' .. capsuleCount(pil)
      .. '/' .. tostring(okBad))
end

-- E5 触摸屏兜底：mobile 传 style='text' 仍走胶囊（没有键盘就没有"只给提示"这条路）
do
  local nodes = build('mobile', nil, { style = 'text' })
  local c = 0
  for i = 1, #nodes do if isCapsule(nodes[i]) then c = c + 1 end end
  local hints = 0
  for i = 1, #nodes do if nodes[i].role == 'hint' then hints = hints + 1 end end
  ok(c == 18 and hints == 0,
    'E5 mobile + style=text ⇒ 仍出胶囊、不出键位提示（触摸屏没有键盘，兜底不随 style 变）',
    c .. '/' .. hints)
end

----------------------------------------------------------------------------
-- §F 「缺陷③从 ui.lua pad 通道复发」守卫
----------------------------------------------------------------------------
-- 现网 pad 家族的真实命名（ui.lua:540-542 pill('pe'..gp..id) / pill('pb'..gp..id) /
-- instText('pt'..gp..id)，gp 是**小写**组字母 ⇒ ptaagain/pbaagainb/peaagainl）；
-- 服务端旧按钮 = view_pad.LEGACY 的 btnA..btnF；热区族 = pbtn*。
local PAD_PATTERNS = { '^p[bet]%l', '^pbtn', '^btn[A-F]$', '^[Pp]hone' }
local function padMatches(nodes)
  local bad = {}
  for i = 1, #nodes do
    local n = nodes[i]
    local names = { n.key, n.name }
    for j = 1, 2 do
      local k = names[j]
      if type(k) == 'string' then
        for p = 1, #PAD_PATTERNS do
          if k:find(PAD_PATTERNS[p]) then bad[#bad + 1] = k end
        end
      end
    end
  end
  return bad
end

do
  local bad = nil
  for _, dev in ipairs({ 'mobile', 'pc' }) do
    local variants = { {}, { style = 'pill' } }
    for vi = 1, 2 do
      local nodes = build(dev, nil, variants[vi])
      local hits = padMatches(nodes)
      if #hits > 0 then bad = dev .. ' 出现 pad 家族名字：' .. table.concat(hits, ',') end
    end
  end
  ok(bad == nil, 'F1 【缺陷③守卫】模块产出的控件名 0 个落在 pad 家族'
    .. '（pta*/pba*/pea*/pbtn*/btnA-F/phone*）——同一屏再出现这些名字就是复发', bad)
end

-- F2 正名单不变量：每个控件的 key 都属于本模块自己的命名家族
do
  local ALLOW = { '^settle', '^hit[A-Z]%u?', '^optT[1-3]$', '^hotSettle[A-Z]$' }
  local bad = nil
  for _, dev in ipairs({ 'mobile', 'pc' }) do
    local nodes = build(dev, nil, (dev == 'pc') and { style = 'pill' } or nil)
    for i = 1, #nodes do
      local n = nodes[i]
      local okName = false
      for p = 1, #ALLOW do
        for _, k in ipairs({ n.key, n.name }) do
          if type(k) == 'string' and k:find(ALLOW[p]) then okName = true end
        end
      end
      if not okName then bad = dev .. ' 家族外名字 ' .. tostring(n.key) .. '/' .. tostring(n.name) end
    end
  end
  ok(bad == nil, 'F2 正名单不变量：所有控件名 ∈ {settle*, hit*, optT1..3, hotSettle*}'
    .. '（外来家族带不进来，不必靠清单穷举）', bad)
end

-- F3 同一把尺子：把 pad 风格节点喂给 F1 的检查，必须命中（证明守卫会响）
do
  local padSample = {
    { key = 'ptaagain', name = 'ptaagain' },
    { key = 'pbaagainb', name = 'pbaagainb' },
    { key = 'peaagainl', name = 'peaagainl' },
    { key = 'pbtnlefthit', name = 'pbtnlefthit' },
    { key = 'btnA', name = 'btnA' },
    { key = 'phoneTapHome', name = 'phoneTapHome' },
  }
  local hits, seen = padMatches(padSample), {}
  local uniq = 0
  for i = 1, #hits do
    if not seen[hits[i]] then seen[hits[i]] = true uniq = uniq + 1 end
  end
  ok(uniq == #padSample, 'F3 同一把尺子：pad 风格样本 ' .. #padSample .. ' 个全部命中（守卫会响）',
    table.concat(hits, ','))
end

-- F4 触控键结构：恰好 3 个热区、三个动作各一份、名字 = hotSettleR/V/Q
do
  local bad = nil
  for _, cfg1 in ipairs({
    { device = 'mobile' }, { device = 'pc' },
    { device = 'pc', style = 'pill' },
  }) do
    local nodes = build(cfg1.device, nil, { style = cfg1.style, onRestart = fn, onHome = fn, onDetail = fn })
    local hits, ids, keys = {}, {}, {}
    for i = 1, #nodes do
      local n = nodes[i]
      if n.role == 'hit' then
        hits[#hits + 1] = n
        ids[n.optId] = (ids[n.optId] or 0) + 1
        keys[n.hitKey] = true
        if not (n.on and n.on.CursorClick) then bad = tostring(cfg1.device) .. ' ' .. n.key .. ' 缺回调' end
      end
    end
    if #hits ~= 3 then bad = tostring(cfg1.device) .. '/' .. tostring(cfg1.style) .. ' 热区 ' .. #hits end
    if not (ids.restart == 1 and ids.home == 1 and ids.detail == 1) then
      bad = tostring(cfg1.device) .. ' 动作重复/缺失'
    end
    if not (keys.R and keys.V and keys.Q) then bad = 'hitKey 不是 R/V/Q' end
    for i = 1, #hits do
      if hits[i].name ~= ('hotSettle' .. hits[i].hitKey) then bad = '热区名 ' .. tostring(hits[i].name) end
    end
  end
  ok(bad == nil, 'F4 三个变体（mobile / pc-text / pc-pill）各恰好 3 个热区'
    .. '、动作各一份、控件名 hotSettleR/V/Q 且都挂了回调', bad)
end

----------------------------------------------------------------------------
-- §C render 通道：层序 = 创建序、无 R0/R1、引擎侧字段真的写进去了
----------------------------------------------------------------------------
local function applyThroughRender(nodes)
  local P = platform.new {
    mock = true, canvas = { 1280, 720 }, logSink = function() end,
    templates = { cell = { kind = 'image' }, stext = { kind = 'text' }, hit = { kind = 'cursor' } },
  }
  local R = renderM.new { platform = P, layers = layers, log = function() end }
  R.apply(nodes)
  return P, R
end

do
  local P, R = applyThroughRender(build('mobile', nil,
    { onRestart = fn, onHome = fn, onDetail = fn }))
  local issues = R.issues()
  ok(#issues == 0, 'C1 render 通道 0 issue（R0 实例化失败 / R1 层序冲突都不可能）',
    #issues > 0 and (issues[1].code .. ' ' .. issues[1].msg))

  local seq = function(key)
    local ctl = R.get(key)
    return ctl and P.seqOf(ctl) or nil
  end
  local sWash, sCard, sCap = seq('settleWash'), seq('settleCard'), seq('settleCapRestartB')
  ok(sWash and sCard and sCap and sWash < sCard and sCard < sCap,
    'C2 创建序 = 层序：wash → card(panel) → 胶囊(touch)（后建的胶囊在上 ⇒ 卡永远盖不住它）',
    tostring(sWash) .. '<' .. tostring(sCard) .. '<' .. tostring(sCap))

  -- 引擎侧读数（不是描述层）：胶囊真的写成不透明
  local ctl = R.get('settleCapRestartB')
  ok(ctl and V.alpha(ctl.imageColor) == 255,
    'C3 引擎侧 imageColor 的 alpha=255（缺陷① 在落地通道上也成立）',
    ctl and hex(ctl.imageColor))

  -- 引擎侧图元断言：端点 circle(100002) / 中段 rect(100001)，且贴图来源 = StaticReference
  do
    local bad, checked = engineShapeBad(P, R, build('mobile'))
    ok(bad == nil and checked == 18,
      'C3b 引擎侧 imageId：18 个胶囊控件 = 端点 100002(circle) / 中段 100001(rect)'
        .. '，imageSource=StaticReference（读控件字段，不读描述）', bad or checked)

    -- 负向 ①：中段误写 circle ⇒ 检查必须报红（证明这条读的是引擎侧真值）
    local m1 = copyNodes(build('mobile'))
    for i = 1, #m1 do
      if m1[i].key == 'settleCapRestartB' then m1[i].image = { s = 'circle' } end
    end
    local P1, R1 = applyThroughRender(m1)
    local b1 = engineShapeBad(P1, R1, m1)
    ok(b1 ~= nil and b1:find('settleCapRestartB', 1, true) ~= nil,
      'C3c 负向：中段误写 circle ⇒ 报红（' .. tostring(b1) .. '）', b1)

    -- 负向 ②：端点误写 rect ⇒ 检查必须报红
    local m2 = copyNodes(build('mobile'))
    for i = 1, #m2 do
      if m2[i].key == 'settleRimRestartL' then m2[i].image = { s = 'rect' } end
    end
    local P2, R2 = applyThroughRender(m2)
    local b2 = engineShapeBad(P2, R2, m2)
    ok(b2 ~= nil and b2:find('settleRimRestartL', 1, true) ~= nil,
      'C3d 负向：端点误写 rect ⇒ 报红（' .. tostring(b2) .. '）', b2)
  end

  -- 热区控件名 = 现网契约（tests/40 用 hotSettleV 点击）
  local hot = P.root:GetChild('hotSettleV')
  ok(hot ~= nil, 'C4 热区控件名 hotSettleV 与 tests/40-settle-hotzone.json 契约一致', nil)
  ok(hot ~= nil and hot.__cursors['CursorClick'] ~= nil,
    'C5 热区注册了 CursorClick 监听（看得见也点得动）', hot and tostring(hot.__cursors))

  -- 一次性写法（PC）：optT1..3 控件名与 tests/37 契约一致
  local P2, R2 = applyThroughRender(build('pc'))
  local t1 = P2.root:GetChild('optT1')
  ok(t1 ~= nil and t1.text == '[R] 再来一局' and t1.fontSize == 25,
    'C6 PC 控件名 optT1 文案/字号与 tests/37 契约一致（[R] 再来一局 @25）',
    t1 and (tostring(t1.text) .. '@' .. tostring(t1.fontSize)))
  ok(#R2.issues() == 0, 'C7 PC 变体 render 0 issue', #R2.issues() > 0 and R2.issues()[1].msg)
end

-- 回调与键位覆盖（接线契约）
do
  local nodes = build('pc', nil, {
    keyLabels = { restart = 'A', home = 'B', detail = 'C' },
    onRestart = fn, onHome = fn, onDetail = fn,
  })
  local t = hintTexts(nodes)
  local set = {}
  for i = 1, #t do set[t[i]] = true end
  ok(#t == 3 and set['[A] 再来一局'] and set['[B] 回主页'] and set['[C] 结算明细'],
    'C8 keyLabels 可覆盖键位提示（接线方决定 R/V/Q 还是别的键）', table.concat(t, ' / '))
  local hit = nil
  for i = 1, #nodes do if nodes[i].hitKey == 'A' then hit = nodes[i] end end
  ok(hit and hit.on and hit.on.CursorClick == fn,
    'C9 热区把 onRestart 挂到 CursorClick（动作只在 Click 触发一次，防连点）', nil)
  ok(hit and hit.name == 'hotSettleA', 'C10 热区控件名跟随键位：hotSettleA', hit and hit.name)
end

----------------------------------------------------------------------------
-- §D 回归守卫：把「旧的坏描述」喂给同一套检查，必须报 L3/L5/L6 + 动作重复
----------------------------------------------------------------------------
local CAPSULE_OLD = cfg.C(0x3D, 0xFA, 0xF4, 0x3D)   -- 历史 bug 的底板色（半透明近白）
local oldTree = {
  { key = 'wash', layer = 'wash', tpl = 'cell', name = 'washBg', pos = { 0, 0 },
    size = { 1280, 720 }, color = wash, seq = 1 },
  { key = 'settleCardOld', layer = 'panel', tpl = 'cell', name = 'settleCardOld',
    pos = { 0, 0 }, size = { 780, 400 }, color = cfg.THEME.panel, seq = 2 },
  -- 旧实现：三颗手机键 = 半透明底板 + 低层（先建，卡后建 ⇒ 卡在上）
  { key = 'ptaagain', layer = 'hud', tpl = 'cell', name = 'ptaagain', pos = { 0, -220 },
    size = { 239.2, 64 }, color = CAPSULE_OLD, cursor = { 'CursorClick' },
    on = { CursorClick = fn }, seq = 3 },
  -- 卡上那排三选项（同一组动作的另一份）
  { key = 'optT1old', layer = 'card', tpl = 'stext', name = 'optT1old', pos = { -184, -152 },
    size = { 244, 43 }, text = '[R] 再来一局', font = 25, fcolor = cfg.THEME.textMain, seq = 4 },
  -- 后建的上层（现网就是"卡先建、后续节点盖上去"的那个病因）
  { key = 'lateOver', layer = 'toast', tpl = 'cell', name = 'lateOver', pos = { 0, -220 },
    size = { 251.2, 76 }, color = cfg.THEME.card, seq = 5 },
}
do
  local issues = V.lint(oldTree)
  local function has(code, key)
    for i = 1, #issues do
      if issues[i].code == code and (key == nil or issues[i].key == key) then return true, issues[i].msg end
    end
    return false
  end
  local okL3, msgL3 = has('L3', 'ptaagain')
  ok(okL3, 'D1 【守卫①】旧描述（半透明近白底板压浅 wash）⇒ lint 报 L3', msgL3 or '未报 L3')
  local okL6, msgL6 = has('L6', 'ptaagain')
  ok(okL6, 'D2 【守卫②】旧描述（交互节点在 panel 层之下）⇒ lint 报 L6', msgL6 or '未报 L6')
  local okL5, msgL5 = has('L5', 'ptaagain')
  ok(okL5, 'D3 【守卫②】旧描述（可点区被后建的上层盖住 >25%）⇒ lint 报 L5', msgL5 or '未报 L5')

  -- 精确到像素：同一个尺子量新旧
  local oldCard = { pos = { 0, 0 }, size = { 780, 400 } }
  local oldPad = { pos = { 0, -220 }, size = { 239.2, 64 } }
  local oldArea = V.overlap(oldPad, oldCard)
  ok(math.abs(oldArea - 239.2 * 12) < 0.01,
    'D4 【守卫②】旧几何复算 = 239.2×12 = 2870.4px²（2026-10-31 帧 json：ptaagain 顶边 -188 vs 卡底 -200）',
    oldArea)

  local newNodes = build('mobile')
  local newCard = V.get(newNodes, 'settleCard')
  local newAreaMax = 0
  local opts = optNodes(newNodes)
  for i = 1, #opts do
    local a = V.overlap(opts[i], newCard)
    if a > newAreaMax then newAreaMax = a end
  end
  ok(oldArea > 0 and newAreaMax == 0,
    'D5 【守卫②】同一把尺子：旧描述 2870.4px² > 0，新描述 0px²', newAreaMax)

  -- 动作重复检测器：旧描述两遍，新描述各一遍
  local oldLabels = {}
  for i = 1, #oldTree do
    local n = oldTree[i]
    if n.text then oldLabels[#oldLabels + 1] = (n.text:gsub('^%[.-%] ', '')) end
  end
  oldLabels[#oldLabels + 1] = '再来一局'        -- 手机端触控键的标签（现网 ptaagain 的 text）
  ok(countOf(oldLabels, '再来一局') == 2,
    'D6 【守卫③】旧描述「再来一局」出现 2 次（卡内键位提示 + 卡下触控键）', countOf(oldLabels, '再来一局'))
  ok(countOf(actionLabels(build('mobile')), '再来一局') == 1
    and countOf(actionLabels(build('pc')), '再来一局') == 1,
    'D7 【守卫③】新描述两个变体里「再来一局」各 1 次', nil)

  -- 新描述在 lint 下 0 issue（同一套检查的对照）
  ok(#V.lint(newNodes) == 0, 'D8 对照：新描述在同一套 lint 下 0 issue', nil)
end

----------------------------------------------------------------------------
print(string.format('\n== view_settle_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
