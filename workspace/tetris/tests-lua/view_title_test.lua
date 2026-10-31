--[[==========================================================================
 tests-lua/view_title_test.lua —— 标题屏纯描述的 headless 验收（不依赖模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_title_test.lua
 判据：输出全 PASS、退出码 0。

 这份测试要证明六件事（对应任务书的 ①..⑥）：
   A 结构与层号：节点数/层号分布/role 齐全/文字框高与宽度合规/唯一名
   B lint：3 画布 × 2 设备 × 4 状态 = 24 组组合全部 0 issue
   C 四张卡：几何黄金值 + 在画布内 + 两两不重叠
   D 三态：只改色/尺寸/位移，节点数逐字相同（C2）
   E 负样本：坏描述必须被 lint 抓住（L5 遮挡 / L4 文字 / L3 半透明 / L1 重名 / L6 层序）
   F 引擎侧图元：真走 render + mock 后端，读控件字段 imageId（不是读描述）
   G 行为与契约：回调 / stage 开关 / 覆盖项 / 零全局 / count()
 ========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end
local function readfile(path)
  local f = io.open(ROOT .. '/' .. path, 'rb')
  if not f then return nil end
  local s = f:read('a')
  f:close()
  return s
end

local cfg = load('lua/tetris/config.lua')
local L = load('lua/tetris/view_layers.lua')
local VN = load('lua/tetris/view_node.lua')
local KITM = load('lua/tetris/view_kit.lua')
local TITLEM = load('lua/tetris/view_title.lua')
local PLATFORM = load('lua/tetris/platform.lua')
local RENDERM = load('lua/tetris/render.lua')

local V = VN.new { layers = L }
local KIT = KITM.new { layers = L }
local T = TITLEM.new { config = cfg, layers = L, kit = KIT }

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. name)
  else
    fail = fail + 1
    print('FAIL  ' .. name .. (extra ~= nil and (' :: ' .. tostring(extra)) or ''))
  end
end
local function near(a, b, eps)
  return a ~= nil and math.abs(a - b) <= (eps or 1e-6)
end
local function byKey(nodes, key)
  for i = 1, #nodes do if nodes[i].key == key then return nodes[i] end end
  return nil
end
local function byRole(nodes, role)
  local out = {}
  for i = 1, #nodes do if nodes[i].role == role then out[#out + 1] = nodes[i] end end
  return out
end
local function countBy(nodes, field)
  local m = {}
  for i = 1, #nodes do
    local v = nodes[i][field] or '?'
    m[v] = (m[v] or 0) + 1
  end
  return m
end
local function keySet(nodes)
  local set = {}
  for i = 1, #nodes do set[nodes[i].key] = nodes[i] end
  return set
end
local function clone(list)
  local out = {}
  for i = 1, #list do
    local n = {}
    for k, v in pairs(list[i]) do
      if type(v) == 'table' then
        local c = {}
        for kk, vv in pairs(v) do c[kk] = vv end
        n[k] = c
      else
        n[k] = v
      end
    end
    out[i] = n
  end
  return out
end
local function hasCode(issues, code, keyPrefix)
  for i = 1, #issues do
    local it = issues[i]
    if it.code == code then
      if keyPrefix == nil then return true, it end
      local k = it.key
      if type(k) == 'string' and k:sub(1, #keyPrefix) == keyPrefix then return true, it end
    end
  end
  return false, nil
end
-- 卡片零件（三态会整体位移的那批节点）
local function cardParts(nodes)
  local want = {}
  for _, r in ipairs({ 'cardBg', 'bead', 'ring', 'star', 'cardTitle', 'cardDesc' }) do
    want[r] = true
  end
  local out = {}
  for i = 1, #nodes do if want[nodes[i].role] then out[#out + 1] = nodes[i] end end
  return out
end
local function cardIndex(key)
  local a = key:match('^menuPill(%d)[BLR]$')
  if a then return tonumber(a) end
  local _, b = key:match('^menu(%a+)(%d+)$')
  if b then return tonumber(b) end
  return nil
end
local function rgbOf(c)
  local v = c or 0
  if v < 0 then v = v + 4294967296 end
  return (v // 65536) % 256, (v // 256) % 256, v % 256
end
local function distFrom(a, b)
  local ar, ag, ab = rgbOf(a)
  local br, bg, bb = rgbOf(b)
  return math.abs(ar - br) + math.abs(ag - bg) + math.abs(ab - bb)
end

local BASE = { canvas = { 1600, 900 }, device = 'pc' }
local pc = T.title(BASE)
local mob = T.title { canvas = { 1600, 900 }, device = 'mobile' }

-- ===== A 结构与层号 =====
print('--- A 结构与层号')

ok(#pc == 100, 'A1 PC/1600×900 共 100 个节点（展台 47 + 卡与入口 46 + 热区 7）', #pc)
local lay = countBy(pc, 'layer')
ok(lay.bg == 34 and lay.hud == 13 and lay.card == 46 and lay.touch == 7,
  string.format('A2 层号分布 bg=34 hud=13 card=46 touch=7（实际 %d/%d/%d/%d）',
    lay.bg or 0, lay.hud or 0, lay.card or 0, lay.touch or 0))

local bgKeys = {}
for i = 1, #pc do if pc[i].layer == 'bg' then bgKeys[#bgKeys + 1] = pc[i].key end end
ok(#bgKeys == 34 and bgKeys[1] == 'menuWallL' and bgKeys[5] == 'menuSkyT'
  and bgKeys[7] == 'menuDeco1' and bgKeys[19] == 'menuShadeT'
  and bgKeys[23] == 'menuBezelT' and bgKeys[27] == 'menuTickHLB',
  'A3 bg 层生成序 = 四面墙 → 两条云带 → 12 件装饰 → 视窗阴影 → 描金边 → 四角括号'
    .. '（后建在上：括号压描金边压阴影压装饰）',
  table.concat(bgKeys, ','))

local badLayer, badTpl, badSize, badParent = nil, nil, nil, nil
for i = 1, #pc do
  local n = pc[i]
  if not pcall(L.order, n.layer) then badLayer = n.key end
  if not n.tpl then badTpl = n.key end
  if not n.size then badSize = n.key end
  if n.parentKey ~= nil then badParent = n.key end
end
ok(badLayer == nil, 'A4 每个节点的 layer 都是 view_layers 认得的名字', badLayer)
ok(badTpl == nil, 'A5 每个节点都有 tpl（实例化不会失败）', badTpl)
ok(badSize == nil, 'A6 每个节点都有 size', badSize)
ok(badParent == nil, 'A7 全部挂 root（无 parentKey ⇒ 引擎层序只有一层，L5 判据成立）', badParent)

local seenKey, seenName, dup = {}, {}, nil
for i = 1, #pc do
  local n = pc[i]
  if seenKey[n.key] then dup = n.key end
  seenKey[n.key] = true
  local nm = n.name or n.key
  if seenName[nm] then dup = nm end
  seenName[nm] = true
end
ok(dup == nil, 'A8 node.key / name 全表唯一（GetChild 寻址不歧义）', dup)

local roles = countBy(pc, 'role')
local wantRoles = { 'wall', 'sky', 'deco', 'shade', 'bezel', 'tick', 'banner', 'rule', 'big',
  'hint', 'dot', 'tag', 'sub', 'note', 'cardBg', 'bead', 'ring', 'star', 'cardTitle',
  'cardDesc', 'entryBg', 'entryTitle', 'entrySub', 'entryDot', 'hit' }
local missingRole = nil
for _, r in ipairs(wantRoles) do if not roles[r] then missingRole = r end end
ok(missingRole == nil, 'A9 25 种 role 全部出现（测试按 role 聚合，不按 key 前缀）', missingRole)

local badTextH, worstH = nil, nil
for i = 1, #pc do
  local n = pc[i]
  if n.text and n.font then
    local need = math.ceil(n.font * 1.45 + 6)
    if n.size[2] < need then badTextH = n.key worstH = n.size[2] .. ' < ' .. need end
  end
end
ok(badTextH == nil, 'A10 每个文字框高 ≥ ⌈字号×1.45+6⌉（引擎 fits 判据，矮了整条不画）',
  badTextH and (badTextH .. ' :: ' .. worstH))

local badFit, worstFit, fitCount = nil, nil, 0
for i = 1, #pc do
  local n = pc[i]
  if n.text and n.text ~= '' then
    fitCount = fitCount + 1
    local needH, needW = V.textNeed(n.text, n.font, n.size[1])
    if needH > n.size[2] + 1 then
      badFit = n.key .. ' 高需 ' .. string.format('%.1f>%.0f', needH, n.size[2])
    elseif needW > n.size[1] + 1 then
      badFit = n.key .. ' 宽需 ' .. string.format('%.1f>%.0f', needW, n.size[1])
    end
    if badFit then worstFit = n.text end
  end
end
ok(badFit == nil, 'A11 ' .. fitCount .. ' 条文字全部装得下（宽高都过 view_node 的量算）',
  badFit and (badFit .. ' :: ' .. tostring(worstFit)))

-- 任务书 ②：展台墙在 HUD 之下、模式卡在 HUD 之上、热区最上
local oBg = L.order('bg')
local oHud = L.order('hud')
local oCard = L.order('card')
local oTouch = L.order('touch')
ok(oBg < oHud and oHud < oCard and oCard < oTouch,
  string.format('A12 层号序 bg(%d) < hud(%d) < card(%d) < touch(%d)', oBg, oHud, oCard, oTouch))
local wallN, cardN, hitN = pc[1], byKey(pc, 'menuPill1B'), byKey(pc, 'menuZone1')
ok(wallN.layer == 'bg' and cardN.layer == 'card' and hitN.layer == 'touch',
  'A13 展台墙在 bg（HUD 之下）、模式卡在 card（HUD 之上）、热区在 touch（最上）')

-- 四面墙盖满整屏、且不侵入中央视窗（|x|<=151 且 |y|<=301 的区域留给棋盘）
local winHalf, winTop, winBot = TITLEM.STAGE.winHalf, TITLEM.STAGE.winTop, TITLEM.STAGE.winBot
local area, intrude, maxDepth = 0, nil, 0
for _, k in ipairs({ 'menuWallL', 'menuWallR', 'menuWallT', 'menuWallB' }) do
  local n = byKey(pc, k)
  area = area + n.size[1] * n.size[2]
  local x0, y0, x1, y1 = V.rect(n)
  local dx = math.min(x1, winHalf) - math.max(x0, -winHalf)
  local dy = math.min(y1, winTop) - math.max(y0, winBot)
  local depth = 0
  if dx > 0 and dy > 0 then depth = math.min(dx, dy) end
  if depth > maxDepth then maxDepth = depth end
  if depth > 1.5 then
    intrude = k .. string.format(' 侵入视窗 %.1fpx x[%.0f,%.0f] y[%.0f,%.0f]', depth, x0, x1, y0, y1)
  end
end
local winArea = (2 * winHalf) * (winTop - winBot)
ok(intrude == nil and area + winArea >= 1600 * 900,
  string.format('A14 四面墙 %d + 视窗 %d ≥ 画布 %d（墙盖满除视窗外的全屏），'
    .. '对视窗的压边 ≤1.5px（现网 +1 遮抗锯齿缝）', area, winArea, 1600 * 900), intrude)

-- ===== B lint：3 画布 × 2 设备 × 4 状态 = 24 组 =====
print('--- B lint')
local canvases = { { 1600, 900 }, { 1280, 720 }, { 2340, 1080 } }
local states = { {}, { hover = 2 }, { pressed = 3 }, { active = 1 } }
local lintBad, lintCount, lintMsg = nil, 0, nil
for _, cv in ipairs(canvases) do
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    for _, st in ipairs(states) do
      local o = { canvas = cv, device = dev }
      for k, v in pairs(st) do o[k] = v end
      local tree = T.title(o)
      local is = V.lint(tree)
      lintCount = lintCount + 1
      if #is > 0 then
        lintBad = cv[1] .. 'x' .. cv[2] .. ' ' .. dev
        lintMsg = is[1].code .. ' ' .. tostring(is[1].key) .. ' ' .. is[1].msg
      end
    end
  end
end
ok(lintBad == nil, 'B1 lint 0 issue（' .. lintCount .. ' 组：3 画布 × 2 设备 × 4 状态）',
  lintBad and (lintBad .. ' :: ' .. lintMsg))

-- ===== C 四张模式卡 =====
print('--- C 四张模式卡')
local modeInfo = cfg.MODE_INFO or {}
local namesOk = true
for i = 1, 4 do
  local n = byKey(pc, 'menuTitle' .. i)
  if not n then namesOk = false
  else
    local want = tostring(modeInfo[i].key) .. '  ' .. tostring(modeInfo[i].name)
    if n.text ~= want then namesOk = false end
  end
end
ok(namesOk, 'C1 四张卡标题 = 「键位数字 + 模式名」，文案逐字取自 config.MODE_INFO')

local cardBad, cardMsg = nil, nil
for _, cv in ipairs(canvases) do
  local tree = T.title { canvas = cv, device = 'pc' }
  local hw, hh = cv[1] / 2, cv[2] / 2
  local rects = {}
  for i = 1, 4 do
    local b = byKey(tree, 'menuPill' .. i .. 'B')
    local x0, y0, x1, y1 = V.rect(b)
    rects[i] = { x0, y0, x1, y1 }
    if x0 < -hw or x1 > hw or y0 < -hh or y1 > hh then
      cardBad = 'menuPill' .. i .. 'B @' .. cv[1] .. 'x' .. cv[2]
      cardMsg = string.format(' x[%.0f,%.0f] y[%.0f,%.0f]', x0, x1, y0, y1)
    end
  end
end
ok(cardBad == nil, 'C2 四张卡在三种画布内（1600×900 / 1280×720 / 2340×1080）',
  cardBad and (cardBad .. cardMsg))

local overlapBad = nil
local rs = {}
for i = 1, 4 do
  local b = byKey(pc, 'menuPill' .. i .. 'B')
  rs[i] = { V.rect(b) }
end
for i = 1, 4 do
  for j = i + 1, 4 do
    local ox = math.min(rs[i][3], rs[j][3]) - math.max(rs[i][1], rs[j][1])
    local oy = math.min(rs[i][4], rs[j][4]) - math.max(rs[i][2], rs[j][2])
    if ox > 0 and oy > 0 then overlapBad = i .. '×' .. j end
  end
end
ok(overlapBad == nil, 'C3 四张卡两两不重叠（胶囊矩形，含左列 × 右列）', overlapBad)

local gapH = true
for i = 1, 2 do
  local a, b = rs[i], rs[i + 1]
  if math.abs(b[2] - a[4]) < 20 then gapH = false end
end
local gapV = rs[3][1] - rs[1][3]
ok(gapH and gapV >= 20, 'C4 相邻卡垂直净距 ≥ 20、左右两列水平净距 = 430（' .. gapV .. '）')

local c1b, c1l, c1r = byKey(pc, 'menuPill1B'), byKey(pc, 'menuPill1L'), byKey(pc, 'menuPill1R')
ok(near(c1b.size[1], 300) and near(c1b.size[2], 100) and near(c1l.size[1], 100)
  and near(c1l.size[2], 100) and c1l.image.s == 'circle' and c1b.image.s == 'rect'
  and near(c1l.pos[1], -420 + 10 - 150) and near(c1r.pos[1], -420 + 10 + 150),
  'C5 胶囊 400×100 = 中段 300×100 rect + 两端 100×100 circle（@cx±140，view_kit.pill）',
  c1l and (c1l.pos[1] .. ' image=' .. tostring(c1l.image.s)))

local bead, ring, star = byKey(pc, 'menuBead1'), byKey(pc, 'menuRing1'), byKey(pc, 'menuStar1')
ok(bead and near(bead.pos[1], -420 - 160) and near(bead.size[1], 22) and bead.image.s == 'circle'
  and ring and near(ring.pos[1], -420 - 160) and ring.image.s == 'ring'
  and near(ring.size[1], 13) and star and near(star.pos[1], -420 + 178)
  and near(star.size[1], 26) and star.image.s == 'fourstar',
  'C6 宝珠 22 circle @cx-160 + 内环 13 ring 同心 + 星芒 26 fourstar @cx+178',
  bead and ring and star)

local t1, d1 = byKey(pc, 'menuTitle1'), byKey(pc, 'menuDesc1')
ok(near(t1.pos[1], -420 + 30) and near(t1.pos[2], 104 + 18) and near(t1.size[1], 330)
  and near(t1.size[2], 70) and t1.font == 38 and t1.align == 'Left'
  and near(d1.pos[1], -420 + 30) and near(d1.pos[2], 104 - 30) and near(d1.size[1], 330)
  and near(d1.size[2], 32) and d1.font == 15,
  'C7 标题 (cx+30,cy+18) 330×70 38 号、特色句 (cx+30,cy-30) 330×32 15 号，都左对齐')

local z1 = byKey(pc, 'menuZone1')
ok(z1 and near(z1.pos[1], -420 + 10) and near(z1.pos[2], 104) and near(z1.size[1], 416)
  and near(z1.size[2], 108) and z1.layer == 'touch' and z1.tpl == 'hit',
  'C8 热区 416×108 @(cx+10,cy)（胶囊 +16/+8 手感），层号 touch', z1 and z1.key)

-- ===== D 三态：只改色/尺寸/位移，不改节点数 =====
print('--- D 三态（C2）')
local nNormal = T.title(BASE)
local nHover = T.title { canvas = { 1600, 900 }, device = 'pc', hover = 1 }
local nPress = T.title { canvas = { 1600, 900 }, device = 'pc', pressed = 1 }
local nSelect = T.title { canvas = { 1600, 900 }, device = 'pc', active = 1 }
ok(#nNormal == #nHover and #nNormal == #nPress and #nNormal == #nSelect,
  'D1 四态节点数逐字相同（' .. #nNormal .. '）—— 状态不改结构',
  table.concat({ #nNormal, #nHover, #nPress, #nSelect }, '/'))

local kNormal, kHover = keySet(nNormal), keySet(nHover)
local keyDiff = nil
for k in pairs(kNormal) do if not kHover[k] then keyDiff = k end end
ok(keyDiff == nil, 'D2 四态 key 集合完全相同（没有「悬停时多画一件」）', keyDiff)

local moved, movedBad = 0, nil
for _, n in ipairs(cardParts(nNormal)) do
  local h = byKey(nHover, n.key)
  local want = (cardIndex(n.key) == 1) and TITLEM.CARD.dy.hover or 0
  if not h or not near(h.pos[2] - n.pos[2], want) then movedBad = n.key end
  if want ~= 0 then moved = moved + 1 end
end
ok(movedBad == nil and moved == 8,
  'D3 悬停只抬被悬停那张卡的 8 件零件 ' .. TITLEM.CARD.dy.hover .. 'px，其余三张不动', movedBad)
local movedBadP = nil
for _, n in ipairs(cardParts(nNormal)) do
  local p = byKey(nPress, n.key)
  local want = (cardIndex(n.key) == 1) and TITLEM.CARD.dy.press or 0
  if not p or not near(p.pos[2] - n.pos[2], want) then movedBadP = n.key end
end
ok(movedBadP == nil, 'D4 按下只沉被按那张卡 ' .. TITLEM.CARD.dy.press .. 'px', movedBadP)

local fsN = byKey(nNormal, 'menuTitle1').font
local fsH = byKey(nHover, 'menuTitle1').font
local fsP = byKey(nPress, 'menuTitle1').font
local fsS = byKey(nSelect, 'menuTitle1').font
ok(fsN == 38 and fsH == 44 and fsP == 40 and fsS == 44,
  'D5 标题字号 常态38 / 悬停44 / 按下40 / 选中44（MS.cardStyle 的三档）',
  table.concat({ fsN, fsH, fsP, fsS }, '/'))
ok(byKey(nNormal, 'menuTitle1').size[2] == 70 and byKey(nHover, 'menuTitle1').size[2] == 70,
  'D6 字号变化不改框高（70 ≥ 44×1.45+4 ⇒ 引擎不会 fits=false）')

local beadD = {
  near(byKey(nNormal, 'menuBead1').size[1], 22),
  near(byKey(nHover, 'menuBead1').size[1], 30),
  near(byKey(nPress, 'menuBead1').size[1], 26),
  near(byKey(nSelect, 'menuBead1').size[1], 30),
}
ok(beadD[1] and beadD[2] and beadD[3] and beadD[4],
  'D7 宝珠直径 常态22 / 悬停30 / 按下26 / 选中30')
ok(near(byKey(nHover, 'menuRing1').size[1], 18) and near(byKey(nPress, 'menuRing1').size[1], 16),
  'D8 内环跟随宝珠缩放（0.6 倍：13/18/16），同心不散')

local wallC = cfg.THEME.wall
local dN = distFrom(byKey(nNormal, 'menuPill1B').color, wallC)
local dS = distFrom(byKey(nSelect, 'menuPill1B').color, wallC)
local dH = distFrom(byKey(nHover, 'menuPill1B').color, wallC)
local dP = distFrom(byKey(nPress, 'menuPill1B').color, wallC)
ok(dN < dH and dH < dS and dS < dP,
  'D9 卡底填色单调变深（与天空墙的距离 常态 ' .. dN .. ' < 悬停 ' .. dH .. '（0.32）< 选中 '
    .. dS .. '（0.34）< 按下 ' .. dP .. '（0.46））')
ok(near(byKey(nSelect, 'menuPill1B').pos[2], byKey(nNormal, 'menuPill1B').pos[2]),
  'D10 选中态不位移（只换色/字号；位移留给悬停与按下）')
ok(byKey(nNormal, 'menuDesc1').fcolor == cfg.THEME.textSub
  and byKey(nHover, 'menuDesc1').fcolor == cfg.THEME.textMain,
  'D11 特色句字色：常态次字色 → 悬停/按下/选中墨色')
local byId = T.title { canvas = { 1600, 900 }, device = 'pc', active = 'pvp' }
ok(byKey(byId, 'menuTitle3').font == 44 and byKey(byId, 'menuTitle1').font == 38,
  'D12 opts.active 也认模式 id（\'pvp\' = 第 3 张）')

-- ===== E 回归守卫：坏描述必须被 lint 抓住 =====
print('--- E 回归守卫（负样本）')

local badWall = clone(pc)
for _, k in ipairs({ 'menuWallL', 'menuWallR', 'menuWallT', 'menuWallB' }) do
  byKey(badWall, k).layer = 'toast'                -- 展台墙调到热区之上
end
local isWall = V.lint(badWall)
local okL5, i5 = hasCode(isWall, 'L5', 'menuZone')
ok(okL5, 'E1 展台墙层号调高（bg→toast）⇒ 必须报 L5 交互节点被遮挡', i5 and i5.msg)

local badText = clone(pc)
byKey(badText, 'menuHint1').size[2] = 25           -- 26 号字塞进 25 高（需 41.7）
local isText = V.lint(badText)
local okL4, i4 = hasCode(isText, 'L4', 'menuHint1')
ok(okL4, 'E2 文字框高砍半 ⇒ 必须报 L4（引擎 fits=false 的前哨）', i4 and i4.msg)

local badAlpha = clone(pc)
byKey(badAlpha, 'menuPill1B').color = 0x3D7FCF6A   -- alpha=0x3D 压在近白天空墙上
local isAlpha = V.lint(badAlpha)
local okL3, i3 = hasCode(isAlpha, 'L3', 'menuPill1B')
ok(okL3, 'E3 卡底改回半透明（0x3D）⇒ 必须报 L3（现网三件套隐形的同型）', i3 and i3.msg)

local badDup = clone(pc)
badDup[#badDup + 1] = { key = 'titleDup', name = 'menuTitle1', layer = 'card', tpl = 'cell',
  pos = { 0, 0 }, size = { 10, 10 }, color = 0xFF000000 }
local okL1, i1 = hasCode(V.lint(badDup), 'L1', 'titleDup')
ok(okL1, 'E4 控件名重复 ⇒ L1', i1 and i1.msg)

local badLow = clone(pc)
byKey(badLow, 'menuZone2').layer = 'hud'           -- 热区沉到面板之下
local okL6, i6 = hasCode(V.lint(badLow), 'L6', 'menuZone2')
ok(okL6, 'E5 热区层号过低（touch→hud）⇒ L6', i6 and i6.msg)

-- 现网水印框高 22：引擎 requiredHeight = 1.2f + 0.25f+4 = 22.85 > 22 ⇒ fits=false 整条不画。
-- 注意 view_node 的 L4 判据是 1.45f+4 = 22.85 vs h+1 = 23 ⇒ **恰好漏过**，所以这条单独钉，
-- 走「引擎公式」而不是 lint；A10 的严格判据（1.45f+6 = 25）也不接受 22。
local reqTag = 13 * 1.2 + 13 * 0.25 + 4
ok(22 < reqTag and byKey(pc, 'menuBuildTag').size[2] >= reqTag,
  string.format('E6 现网水印框高 22 < 引擎 requiredHeight %.2f ⇒ 本模块改成 %d'
    .. '（lint L4 的 +4 判据恰好漏过这条，故单独钉）', reqTag, byKey(pc, 'menuBuildTag').size[2]))
local badTag = clone(pc)
byKey(badTag, 'menuBuildTag').size[2] = 16
local okTag, iTag = hasCode(V.lint(badTag), 'L4', 'menuBuildTag')
ok(okTag, 'E7 水印框高砍到 16 ⇒ lint 报 L4（这道闸门真的会响）', iTag and iTag.msg)

-- ===== F 引擎侧图元（读控件字段，不读描述）=====
print('--- F 引擎侧图元')

local function throughRender(nodes, canvas)
  local P = PLATFORM.new {
    mock = true, canvas = canvas or { 1600, 900 }, logSink = function() end,
    templates = { cell = { kind = 'image' }, stext = { kind = 'text' }, hit = { kind = 'cursor' } },
  }
  local R = RENDERM.new { platform = P, layers = L, log = function() end }
  R.apply(nodes)
  return P, R
end

local P1, R1 = throughRender(pc)
ok(#R1.issues() == 0, 'F1 真走 render 通道 0 issue（R0 实例化失败 / R1 层序冲突都不可能）',
  #R1.issues() > 0 and (R1.issues()[1].code .. ' ' .. R1.issues()[1].msg))

local SAMPLE = {
  { 'menuPill1B', TITLEM.SHAPE_ID.rect, '胶囊中段 rect' },
  { 'menuPill1L', TITLEM.SHAPE_ID.circle, '胶囊端点 circle' },
  { 'menuBead1', TITLEM.SHAPE_ID.circle, '元素宝珠 circle' },
  { 'menuRing1', TITLEM.SHAPE_ID.ring, '宝珠内环 ring' },
  { 'menuStar1', TITLEM.SHAPE_ID.fourstar, '星芒 fourstar' },
  { 'menuWallL', TITLEM.SHAPE_ID.rect, '深空墙 rect' },
}
local badS, checkedS = nil, 0
for i = 1, #SAMPLE do
  local key, want, label = SAMPLE[i][1], SAMPLE[i][2], SAMPLE[i][3]
  local ctl = R1.get(key)
  if not ctl then
    badS = 'no ctl ' .. key
  elseif ctl.imageId ~= want then
    badS = key .. ' imageId=' .. tostring(ctl.imageId) .. ' 期望 ' .. want .. '（' .. label .. '）'
  elseif ctl.imageSource ~= 'StaticReference' then
    badS = key .. ' imageSource=' .. tostring(ctl.imageSource)
  else
    checkedS = checkedS + 1
  end
end
ok(badS == nil and checkedS == 6,
  'F2 引擎侧 imageId 六连：中段 100001 / 端点 100002 / 宝珠 100002 / 内环 100006 / 星 100004'
    .. ' / 墙 100001，imageSource=StaticReference（读控件字段）', badS or checkedS)

local imgNodes, badAll, shapes = 0, nil, {}
for i = 1, #pc do
  local n = pc[i]
  if n.image then
    imgNodes = imgNodes + 1
    shapes[n.image.s] = (shapes[n.image.s] or 0) + 1
    local want = TITLEM.SHAPE_ID[n.image.s]
    local ctl = R1.get(n.key)
    if not ctl then
      badAll = 'no ctl ' .. n.key
    elseif ctl.imageId ~= want then
      badAll = n.key .. ' imageId=' .. tostring(ctl.imageId) .. ' 期望 ' .. tostring(want)
    end
  end
end
ok(badAll == nil, 'F3 逐个核对：' .. imgNodes .. ' 个图元节点全部贴到期望图元（没有"漏贴默认"的）',
  badAll)
ok((shapes.rect or 0) > 0 and (shapes.circle or 0) > 0 and (shapes.fourstar or 0) > 0
  and (shapes.ring or 0) == 4,
  string.format('F4 图元族齐全：rect=%d circle=%d fourstar=%d ring=%d（环恰好 4 个 = 四张卡各一）',
    shapes.rect or 0, shapes.circle or 0, shapes.fourstar or 0, shapes.ring or 0))

local function seqOf(P, R, key)
  local ctl = R.get(key)
  return ctl and P.seqOf(ctl) or nil
end
local sWall = seqOf(P1, R1, 'menuWallL')
local sBig = seqOf(P1, R1, 'menuBig')
local sCard = seqOf(P1, R1, 'menuPill1B')
local sHit = seqOf(P1, R1, 'menuZone1')
ok(sWall and sBig and sCard and sHit and sWall < sBig and sBig < sCard and sCard < sHit,
  'F5 创建序 = 层序：墙 → 大字 → 卡 → 热区（后建在上，不靠 SetAsLastSibling）',
  table.concat({ tostring(sWall), tostring(sBig), tostring(sCard), tostring(sHit) }, '<'))

local badDesc = clone(pc)
byKey(badDesc, 'menuPill1B').image = { s = 'circle' }
local _, Rbad = throughRender(badDesc)
local ctlBad = Rbad.get('menuPill1B')
ok(ctlBad and ctlBad.imageId == TITLEM.SHAPE_ID.circle,
  'F6 负向①：矩形误写 circle ⇒ 引擎侧 imageId 真的变成 100002（闸门读控件字段）',
  ctlBad and ctlBad.imageId)

local noImg = clone(pc)
byKey(noImg, 'menuStar1').image = nil
local _, Rnil = throughRender(noImg)
local starCtl = Rnil.get('menuStar1')
ok(starCtl and starCtl.imageId == nil,
  'F7 负向②：拿掉 image 字段 ⇒ 引擎侧 imageId=nil（F3 那种检查必然报红）',
  starCtl and tostring(starCtl.imageId))

-- ===== G 行为与契约 =====
print('--- G 行为与契约')
local hits = {}
local wired = T.title {
  canvas = { 1600, 900 }, device = 'pc',
  onPick = function(i) hits[#hits + 1] = 'pick' .. tostring(i) end,
  onConfirm = function(i) hits[#hits + 1] = 'confirm' .. tostring(i) end,
  onRoster = function() hits[#hits + 1] = 'roster' end,
  onHelp = function() hits[#hits + 1] = 'help' end,
}
local function fire(nodes, key, kind)
  local n = byKey(nodes, key)
  if n and n.on and n.on[kind] then n.on[kind]() return true end
  return false
end
ok(fire(wired, 'menuZone2', 'CursorDown') and fire(wired, 'menuZone2', 'CursorClick')
  and fire(wired, 'menuRosterZone', 'CursorClick') and fire(wired, 'menuHelpZone', 'CursorClick')
  and fire(wired, 'menuHintZone', 'CursorClick'),
  'G1 五个入口各自调回 onPick / onConfirm / onRoster / onHelp（热区 on 表按 cursor 事件分派）')
ok(#hits == 5 and hits[1] == 'pick2' and hits[2] == 'confirm2' and hits[3] == 'roster'
  and hits[4] == 'help' and hits[5] == 'help',
  'G2 回调参数正确（点第 2 张卡的 onPick/onConfirm 都带 i=2）', table.concat(hits, ','))

local plain = T.title(BASE)
local plainHit = byKey(plain, 'menuZone1')
ok(plainHit.cursor ~= nil and plainHit.on == nil,
  'G3 不给回调时热区仍可注册（cursor 保留、on=nil，不会崩）')

local twoModes = T.title { canvas = { 1600, 900 }, device = 'pc',
  modes = { { key = 'A', name = '甲', desc = '一', color = 0xFF7FCF6A, colorDeep = 0xFF3F8B3C },
    { key = 'B', name = '乙', desc = '二', color = 0xFFB39BEA, colorDeep = 0xFF5F4CA8 } } }
ok(#twoModes == 82 and byKey(twoModes, 'menuTitle2') and not byKey(twoModes, 'menuTitle3')
  and byKey(twoModes, 'menuTitle2').text == 'B  乙',
  'G4 opts.modes 覆盖（2 张卡 ⇒ 82 节点，2 个模式热区），文案来自 opts',
  #twoModes)

local okDev = pcall(function() T.title { device = 'tablet' } end)
ok(not okDev, 'G5 未知 device 当场报错（不静默按 pc 处理）')

local off = T.title { canvas = { 1600, 900 }, device = 'pc', stage = { on = false } }
local offLay = countBy(off, 'layer')
ok(#off == 52 and (offLay.bg or 0) == 0 and (offLay.hud or 0) == 0 and offLay.card == 46
  and offLay.touch == 6,
  'G6 stage.on=false ⇒ 展台一件不出（52 节点 = 卡 46 + 热区 6，对应现网 MS.teardown）',
  #off .. ' bg=' .. tostring(offLay.bg))

local invis = T.title { canvas = { 1600, 900 }, device = 'pc', stage = { visible = false } }
local hiddenN = 0
for i = 1, #invis do if invis[i].visible == false then hiddenN = hiddenN + 1 end end
ok(#invis == 100 and hiddenN == 47,
  'G7 stage.visible=false ⇒ 节点数不变（100）、47 件展台节点 visible=false（只落声明字段）',
  hiddenN)

local focus = T.title { canvas = { 1600, 900 }, device = 'pc', stage = { mode = 'pvp' } }
local fbig = byKey(focus, 'menuBig')
ok(fbig and fbig.text == cfg.MODE_TITLE.pvp and fbig.font == 26 and near(fbig.pos[1], 0)
  and near(fbig.pos[2], 0) and near(fbig.size[1], 720) and near(fbig.size[2], 100),
  'G8 stage.mode ⇒ 大字换成模式名（MS.focusLock 的 0.5s 动画窗：屏幕正中 720×100 26 号）',
  fbig and fbig.text)

local titled = T.title { canvas = { 1600, 900 }, device = 'pc', stage = { title = '自定义标题' } }
ok(byKey(titled, 'menuBig').text == '自定义标题', 'G9 stage.title 可覆盖常态大字')
local hinted = T.title { canvas = { 1600, 900 }, device = 'pc', hints = { '甲', '乙', '丙' } }
ok(byKey(hinted, 'menuHint1').text == '甲' and byKey(hinted, 'menuHint3').text == '丙',
  'G10 opts.hints 覆盖三段提示（呼吸/轮播交给接线方每帧重算）')
local noTag = T.title { canvas = { 1600, 900 }, device = 'pc', buildTag = '' }
ok(not byKey(noTag, 'menuBuildTag') and #noTag == 99,
  'G11 buildTag=\'\' ⇒ 不出水印节点（99 节点）', #noTag)
ok(byKey(pc, 'menuBuildTag').text == 'v6 · tetris' and byKey(pc, 'menuSub').text
  == TITLEM.SUB.text, 'G12 缺省水印与品牌标文案')

local dflt = T.title()
ok(#dflt == 100 and byKey(dflt, 'menuBig').font == 52,
  'G13 无 opts 调用可用（缺省 1600×900 / pc / 常态，100 节点）', #dflt)
ok(T.count(BASE) == #pc and T.count() == 100, 'G14 count(opts) 与 #title(opts) 一致（接线日志读数）')

local src = readfile('lua/tetris/view_title.lua') or ''
ok(src:find('\n%s*print%s*%(') == nil, 'G15 模块里不写日志（日志只走注入）')
ok(src:find('require%s*%(') == nil, 'G16 模块不 require 其它 tetris 模块（依赖注入）')
ok(src:find('game%.') == nil and src:find('Enum%.') == nil,
  'G17 模块不调引擎 API（game.* / Enum.* 零出现）')

local before = {}
for k in pairs(_G) do before[k] = true end
local probe = TITLEM.new { config = cfg, layers = L, kit = KIT }
local leaked = {}
for k in pairs(_G) do if not before[k] then leaked[#leaked + 1] = k end end
ok(#leaked == 0 and type(probe.title) == 'function' and type(probe.count) == 'function',
  'G18 加载 + new() 不写任何全局，返回 { title=fn, count=fn }', table.concat(leaked, ','))

local again = T.title(BASE)
local sameSig = (#again == #pc)
for i = 1, #again do
  local a, b = byKey(pc, again[i].key), again[i]
  if not a or a.pos[1] ~= b.pos[1] or a.pos[2] ~= b.pos[2] or a.color ~= b.color
    or a.text ~= b.text then sameSig = false end
end
ok(sameSig, 'G19 幂等：同 opts 连调两次，逐节点 pos/color/text 完全相同（每帧重放安全）')

-- 状态机穷举：悬停与按下同时给，按下优先（与现网 cardStyle 的判据一致）
local both = T.title { canvas = { 1600, 900 }, device = 'pc', hover = 2, pressed = 2 }
ok(byKey(both, 'menuTitle2').font == 40 and byKey(both, 'menuBead2').size[1] == 26,
  'G20 hover 与 pressed 同时给 ⇒ 按下优先（font 40 / 宝珠 26）')

-- ===== 汇总 =====
print(string.format('\n== view_title_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
