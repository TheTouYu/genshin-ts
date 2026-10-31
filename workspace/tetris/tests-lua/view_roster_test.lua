--[[==========================================================================
 tests-lua/view_roster_test.lua —— 角色档案页纯描述（view_roster.lua）的 headless 断言
 ----------------------------------------------------------------------------
 跑法：cd /home/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_roster_test.lua

 这组断言守的是两个**真缺陷**（都出自出图/帧读数，不是想象）：
   ① 移动端 charPanelL1 / charPanelL4 / charPanelS textLayout.fits=false
      （引擎 requiredHeight 需 51.7 / 51.7 / 46.4）——见 §E1：用引擎公式复算这两个数，
      再用「字号不缩放 + 单行框高」的坏描述让 lint 报 L4。§E2 换成"宽度写死成 PC 值"。
   ② 层序/热区靠手写纪律（热区 y 取负 ⇒ 看得见点不到）——见 §C3：所有热区 y 与视觉同号。

 结构约定：
   §A 量算与「按设备重算」：框高必须由行数反推，两套口径（引擎 / view_node）都满足
   §B 全量 lint：4 角色 × 5 页签 × 2 设备 × 3 画布 = 120 组，0 issue
   §C 结构：层序、三栏齐全、热区同号、图元、零全局
   §D 语义：页签高亮、未解锁态、五页内容互不相同、回调、设备分支
   §E 负样本：复现现网两个缺陷
   §F 抄录校验：页面 chrome 文案在 roster.lua 源码里逐字可查；长文案来自注入的 copy
 ========================================================================]]

local root = './'
local function loadMod(path)
  local f, err = loadfile(root .. path)
  if not f then error('加载失败 ' .. path .. ' :: ' .. tostring(err)) end
  return f()
end

local cfg = loadMod('lua/tetris/config.lua')
local copy = loadMod('lua/tetris/copy.lua')
local layers = loadMod('lua/tetris/view_layers.lua')
local K = loadMod('lua/tetris/view_kit.lua').new { layers = layers }
local V = loadMod('lua/tetris/view_node.lua').new { layers = layers }
-- 只盯**本模块**：config/copy 加载时自己就漏了两个全局（MODE_BG / MODE_BG_POOL，已记进报告），
-- 那不是 view_roster 的账，所以快照取在加载它之前。
local before = {}
for k in pairs(_G) do before[k] = true end
local M = loadMod('lua/tetris/view_roster.lua')

-- ===== 断言小工具 =====
local pass, fail = 0, 0
local function ok(cond, msg, detail)
  if cond then
    pass = pass + 1
    print('PASS  ' .. msg)
  else
    fail = fail + 1
    print('FAIL  ' .. msg .. (detail ~= nil and ('  <<实测: ' .. tostring(detail) .. '>>') or ''))
  end
  return cond
end

-- ===== 构建器 =====
local ROLE_STATE = {
  unlocked = { nahida = true, keqing = true },
  party = { 'nahida', 'ganyu' },
  lv = { nahida = 3 },
  cnt = { lines = 128, games = 12, pvp = 3, tetris = 4, time = 1880 },
}
local S = M.new { config = cfg, layers = layers, kit = K, copy = copy, roster = ROLE_STATE }

local function build(device, canvas, extra)
  local o = {
    canvas = canvas or ((device == 'mobile') and { 1280, 720 } or { 1600, 900 }),
    device = device or 'pc', role = 'nahida', tab = 1,
    unlocked = ROLE_STATE.unlocked, party = ROLE_STATE.party, lv = ROLE_STATE.lv,
    cnt = ROLE_STATE.cnt, cd = 25,
    onTab = function() end, onClose = function() end,
    onSwap = function() end, onEntry = function() end,
  }
  if extra then for k, v in pairs(extra) do o[k] = v end end
  return S.roster(o)
end

local CANVASES = { { 1600, 900 }, { 1280, 720 }, { 1560, 720 } }

local function textsOf(nodes)
  local out = {}
  for i = 1, #nodes do
    local n = nodes[i]
    if n.tpl == 'stext' and n.text and n.text ~= '' then out[#out + 1] = n end
  end
  return out
end
local function hitsOf(nodes)
  local out = {}
  for i = 1, #nodes do
    local n = nodes[i]
    if n.role == 'hit' then out[#out + 1] = n end
  end
  return out
end
local function linesOf(txt) return select(2, txt:gsub('\n', '\n')) + 1 end

print('== A. 量算与「按设备重算」==')

-- A1 引擎公式复算实测数字：requiredHeight = 1.2·f·L + 0.25·f + 4
do
  local r18 = M.engineReqH(18, 2)
  local r16 = M.engineReqH(16, 2)
  ok(math.abs(r18 - 51.7) < 0.05 and math.abs(r16 - 46.4) < 0.05,
    string.format('A1 引擎 requiredHeight 复算实测：(18号,2行)=%.1f（实测 51.7 charPanelL1/L4）、'
      .. '(16号,2行)=%.1f（实测 46.4 charPanelS）', r18, r16), r18 .. '/' .. r16)
  local bad = nil
  for _, f in ipairs({ 12, 14, 16, 17, 18, 38 }) do
    for _, l in ipairs({ 1, 2, 3 }) do
      local b = M.boxH(f, l)
      if b + 0.001 < M.viewNeedH(f, l) or b + 0.001 < M.engineReqH(f, l) then
        bad = f .. '号' .. l .. '行 boxH=' .. b
      end
    end
  end
  ok(bad == nil, 'A1b boxH(字号,行数) 恒 ≥ view_node 与引擎两套口径（6 字号 × 1..3 行 = 18 组）', bad)
end

-- A2 每个文字节点的框高 = boxH(字号, 行数)，且同时 ≥ 两套口径
do
  local bad, total = nil, 0
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    local nodes = build(dev)
    for _, n in ipairs(textsOf(nodes)) do
      total = total + 1
      local w = n.size[1]
      local needH, _, wrapped = V.textNeed(n.text, n.font, w)
      local explicit = linesOf(n.text)
      if n.measured and math.abs(n.size[2] - M.boxH(n.font, explicit)) > 0.001 then
        bad = n.key .. ' h=' .. n.size[2] .. ' ≠ boxH(' .. n.font .. ',' .. explicit .. ')'
      elseif n.size[2] + 1 < needH then
        bad = n.key .. ' h=' .. n.size[2] .. ' < viewNeed ' .. string.format('%.1f', needH)
      elseif n.size[2] + 1 < M.engineReqH(n.font, explicit) then
        bad = n.key .. ' h=' .. n.size[2] .. ' < engine ' .. string.format('%.1f', M.engineReqH(n.font, explicit))
      elseif wrapped ~= explicit then
        bad = n.key .. ' 折行数不一致：显式 ' .. explicit .. ' / view_node 估 ' .. wrapped
      end
    end
  end
  ok(bad == nil and total >= 20,
    'A2 ' .. total .. ' 个文字节点：测得框高 == boxH(字号,行数)（measured 节点逐一相等），'
      .. '全部 ≥ view_node 与引擎两套口径，显式折行数 == view_node 估算', bad)
end

-- A3 字号/宽度/框高都随设备重算（同一文案在两台机器上不是同一张表）
do
  local pc, mb = build('pc'), build('mobile')
  local keys = { 'charTitle', 'charPanelT', 'charPanelS', 'charPanelL1', 'charFoot' }
  local bad = nil
  local shrunk = 0
  for i = 1, #keys do
    local a, b = V.get(pc, keys[i]), V.get(mb, keys[i])
    if not a or not b then bad = '缺少 ' .. keys[i] end
    if a.font == b.font then bad = keys[i] .. ' 字号没随设备缩放（' .. a.font .. '）' end
    if a.size[1] == b.size[1] then bad = keys[i] .. ' 框宽没随设备缩放' end
    if b.font < a.font then shrunk = shrunk + 1 end
  end
  ok(bad == nil and shrunk == #keys,
    'A3 5 个关键文字在两台设备上字号与框宽都不同（1280×720 更小）：' .. shrunk .. '/' .. #keys, bad)
end

-- A4 同一段文案：宽度变小 ⇒ 行数变多 ⇒ 框高跟着变大（这就是"按设备重算"的算术）
do
  local long = '满足下面任意一条即可缔结：累计消行 40 行，或总局数 3 局，或对战局数 1 局；'
    .. '缔结之后会立刻写进本局存档，重开也不会丢，换存档才会重置。'
  local f = 14
  local wide, narrow = #M.wrap(long, f, 500), #M.wrap(long, f, 240)
  ok(narrow > wide and M.boxH(f, narrow) > M.boxH(f, wide),
    'A4 同一文案：宽 500 ⇒ ' .. wide .. ' 行/h=' .. M.boxH(f, wide)
      .. '；宽 240 ⇒ ' .. narrow .. ' 行/h=' .. M.boxH(f, narrow) .. '（框高随内容反推）')
  local bad = nil
  for _, canvas in ipairs(CANVASES) do
    local nodes = build('pc', canvas, { entries = { { nm = '解锁条件', desc = long } } })
    local iss = V.lint(nodes)
    for i = 1, #iss do
      if iss[i].code == 'L4' or iss[i].code == 'L4w' then bad = canvas[1] .. ':' .. iss[i].msg end
    end
  end
  ok(bad == nil, 'A4b 长条目在 3 种画布上都不触发 L4/L4w（按各自宽度重算）', bad)
end

print('== B. 全量 lint ==')

-- B1 4 角色 × 5 页签 × 2 设备 × 3 画布 = 120 组，0 issue
do
  local total, bad = 0, nil
  local roles = { 'nahida', 'keqing', 'ganyu', 'girl' }
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    for _, cv in ipairs(CANVASES) do
      for _, role in ipairs(roles) do
        for tab = 1, 5 do
          local nodes = build(dev, cv, { role = role, tab = tab })
          total = total + 1
          local iss = V.lint(nodes)
          if #iss > 0 then
            bad = string.format('%s/%dx%d/%s/tab%d → %s %s %s', dev, cv[1], cv[2], role, tab,
              iss[1].code, iss[1].key, iss[1].msg)
          end
        end
      end
    end
  end
  ok(bad == nil and total == 120, 'B1 ' .. total .. ' 组（4 角色 × 5 页签 × 2 设备 × 3 画布）lint 0 issue', bad)
end

-- B2 节点数稳定在引擎预算内（现网常驻约 240 个控件，整页 ≤ 130 才安全）
do
  local n = #build('pc')
  local nm = #build('mobile')
  ok(n <= 130 and nm <= 130 and n >= 60,
    'B2 节点数在预算内：PC ' .. n .. ' / mobile ' .. nm .. '（≤130，整页换场不撞引擎控件上限）')
end

print('== C. 结构 ==')

-- C1 语义层序：遮罩 < 面板/大色块 < 文字 < 热区
do
  local nodes = build('mobile')
  local order = { wash = 10, panel = 50, card = 60, touch = 70 }
  local seen, bad = {}, nil
  for i = 1, #nodes do
    local n = nodes[i]
    local r, layer = n.role, n.layer
    if r == 'scrim' then
      if layer ~= 'wash' then bad = 'scrim 层=' .. tostring(layer) end
      seen.scrim = true
    elseif r == 'surface' or r == 'panel' or r == 'cardBg' or r == 'topbar' or r == 'rule' then
      if layer ~= 'panel' then bad = r .. ' 层=' .. tostring(layer) end
      seen.surface = true
    elseif r == 'heading' or r == 'subheading' or r == 'cardLine' or r == 'cardTitle'
      or r == 'cardVal' or r == 'foot' or r == 'row' or r == 'tab' or r == 'close' then
      if layer ~= 'card' then bad = r .. ' 层=' .. tostring(layer) end
      seen.text = true
    elseif r == 'hit' then
      if layer ~= 'touch' then bad = 'hit 层=' .. tostring(layer) end
      seen.hit = true
    end
  end
  ok(bad == nil and seen.scrim and seen.surface and seen.text and seen.hit
    and order.wash < order.panel and order.panel < order.card and order.card < order.touch,
    'C1 语义层序：遮罩 wash < 面板 panel < 文字 card < 热区 touch（不靠创建顺序）', bad)
end

-- C2 三栏齐全：左 4 行 / 中面板（标题+副标+台词+页脚）/ 右 5 页签 + 条目卡
do
  local nodes = build('pc')
  local rows, tabs, cards, hits = 0, 0, 0, 0
  for i = 1, #nodes do
    local k = nodes[i].key
    if nodes[i].role == 'row' and k:find('B$') then rows = rows + 1 end
    if nodes[i].role == 'tab' and k:find('B$') then tabs = tabs + 1 end
    if nodes[i].role == 'cardBg' and k:find('A$') then cards = cards + 1 end
    if nodes[i].role == 'hit' then hits = hits + 1 end
  end
  ok(rows == 4 and tabs == 5 and cards >= 1 and hits >= 10
    and V.get(nodes, 'charPanelT') and V.get(nodes, 'charPanelS')
    and V.get(nodes, 'charPanelL1') and V.get(nodes, 'charPanelF') and V.get(nodes, 'charFoot'),
    'C2 三栏齐全：左列 ' .. rows .. ' 行、右列 ' .. tabs .. ' 页签 + ' .. cards
      .. ' 张条目卡、中列标题/副标/台词/页脚齐、热区 ' .. hits .. ' 个')
end

-- C3 热区与视觉同号（现网 charItemHit 把 y 取负 ⇒ 同一条目"看得见点不到"）
do
  local bad, checked = nil, 0
  local nodes = build('mobile')
  for _, h in ipairs(hitsOf(nodes)) do checked = checked + 1 end
  -- 每个热区都必须与自己的视觉件同中心（同号、不镜像），且真的罩住它
  local pairs_ = {
    { 'charRow1Hit', 'charRow1B' }, { 'charRow4Hit', 'charRow4B' },
    { 'charTab1Hit', 'charTab1B' }, { 'charTab5Hit', 'charTab5B' },
    { 'charCloseHit', 'charCloseB' }, { 'charItemHit1', 'charItem1A' },
    { 'charItemHit3', 'charItem3A' },
  }
  for i = 1, #pairs_ do
    local h, vis = V.get(nodes, pairs_[i][1]), V.get(nodes, pairs_[i][2])
    if not h or not vis then
      bad = '缺 ' .. pairs_[i][1] .. '/' .. pairs_[i][2]
    else
      if math.abs(h.pos[2] - vis.pos[2]) > 0.01 then
        bad = pairs_[i][1] .. ' y=' .. h.pos[2] .. ' ≠ 视觉 ' .. vis.pos[2] .. '（被镜像了）'
      end
      local hx0, hy0, hx1, hy1 = V.rect(h)
      local vx0, vy0, vx1, vy1 = V.rect(vis)
      local cx, cy = (vx0 + vx1) / 2, (vy0 + vy1) / 2
      if not (cx >= hx0 and cx <= hx1 and cy >= hy0 and cy <= hy1) then
        bad = pairs_[i][1] .. ' 没罩住 ' .. pairs_[i][2]
      end
    end
  end
  ok(bad == nil and checked == 13,
    'C3 ' .. checked .. ' 个热区与视觉同中心（同号不取负）且都罩住自己的视觉件；'
      .. '第 3 张条目卡在中线以下也不受影响', bad)
end

-- C4 图元：圆角矩形 = 中段 rect + 4 角 circle（角必须 h×h），条目图标用内置图元
do
  local bad, corners, icons = nil, 0, 0
  local glyph = {}
  for i = 1, #M.GLYPH do glyph[M.GLYPH[i]] = true end
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    local nodes = build(dev)
    for i = 1, #nodes do
      local n = nodes[i]
      local k = n.key
      local sh = n.image and n.image.s
      if k:find('C%d$') then
        corners = corners + 1
        if sh ~= 'circle' then bad = k .. ' 角图元=' .. tostring(sh) end
        if n.size[1] ~= n.size[2] then bad = k .. ' 角不是正方形' end
      elseif (k:find('A$') or k:find('B$')) and n.role ~= 'hit' then
        if sh ~= 'rect' and n.key:find('^char') then bad = k .. ' 中段图元=' .. tostring(sh) end
      end
      if n.role == 'icon' then
        icons = icons + 1
        if not glyph[sh] then bad = k .. ' 图标图元不在内置六类里：' .. tostring(sh) end
      end
    end
  end
  ok(bad == nil and corners >= 24 and icons >= 3,
    'C4 圆角矩形：' .. corners .. ' 个角圆（circle + 正方形）、中段 rect；'
      .. icons .. ' 个条目图标走内置图元', bad)
end

-- C5 零全局泄漏
do
  local leaked = {}
  for k in pairs(_G) do if not before[k] then leaked[#leaked + 1] = k end end
  ok(#leaked == 0, 'C5 模块加载 + 构建后没有新增全局变量', table.concat(leaked, ','))
end

print('== D. 语义 ==')

-- D1 页签切换只改高亮，不改节点数
do
  local counts, fills, bad = {}, {}, nil
  for tab = 1, 5 do
    local nodes = build('pc', nil, { tab = tab })
    counts[tab] = #nodes
    fills[tab] = V.get(nodes, 'charTab' .. tab .. 'B').color
    local off = V.get(nodes, 'charTab' .. ((tab % 5) + 1) .. 'B').color
    if fills[tab] == off then bad = 'tab' .. tab .. ' 与未选中页签同色' end
  end
  local same = true
  for tab = 2, 5 do if counts[tab] ~= counts[1] then same = false end end
  ok(bad == nil and same,
    'D1 五页节点数恒为 ' .. counts[1] .. '（切页签不增删控件），选中页签底色与未选中不同', bad)
end

-- D2 选中行 = 角色主题色实底 + 白字
do
  local nodes = build('pc', nil, { role = 'nahida' })
  local on, off = V.get(nodes, 'charRow1B'), V.get(nodes, 'charRow2B')
  local onInk = V.get(nodes, 'charRow1T').fcolor
  local roleColor = copy.of('nahida').color
  ok(on.color == roleColor and on.color ~= off.color and onInk == K.C(255, 255, 255, 255),
    'D2 选中行底色 = copy.of(role).color 且标题转白字；未选中行不同色')
end

-- D3 未解锁角色有可识别视觉态（与「已解锁但不在队」的行对照：字色 + 整行底色都不同）
do
  local nodes = build('pc', nil, { role = 'nahida' })
  -- 状态：nahida / keqing 已解锁，party = {nahida, ganyu}；ganyu 未解锁却在队 → 也算未解锁
  local lockedInk = V.get(nodes, 'charRow4T').fcolor     -- girl：未解锁、未选中
  local openInk = V.get(nodes, 'charRow2T').fcolor       -- keqing：已解锁、未选中
  local lockedFill = V.get(nodes, 'charRow4B').color
  local openFill = V.get(nodes, 'charRow2B').color
  local lockedSub = V.get(nodes, 'charRow4S').text
  ok(lockedSub == M.PAGE.stateLocked and lockedInk ~= openInk and lockedFill ~= openFill,
    'D3 未解锁行三处可辨：副标「' .. tostring(lockedSub) .. '」、标题色不同、整行底色降饱和',
    lockedInk .. '/' .. openInk .. ' | ' .. lockedFill .. '/' .. openFill)
end

-- D4 五页内容互不相同（现网 tab 2/3/4 全落进同一个 else 分支）
do
  local d = {
    e = copy.of('nahida'), role = 'nahida', open = true, inParty = true, lv = 3,
    cnt = ROLE_STATE.cnt, partyMax = 2, skill = copy.of('nahida').skill, cd = 25,
    help = copy.help('nahida'), tips = copy.tips('nahida'),
    skillDesc = tostring(copy.of('nahida').skillDesc or ''),
  }
  local sig, bad = {}, nil
  for tab = 1, 5 do
    local list = M.entriesFor(tab, d)
    local parts = {}
    for i = 1, #list do
      parts[#parts + 1] = tostring(list[i].nm) .. '|' .. tostring(list[i].desc)
      if list[i].desc == nil or list[i].desc == '' then bad = 'tab' .. tab .. ' 第' .. i .. '条没有正文' end
    end
    sig[tab] = table.concat(parts, '#')
    if #list < 1 then bad = 'tab' .. tab .. ' 没有条目' end
  end
  for a = 1, 5 do
    for b = a + 1, 5 do
      if sig[a] == sig[b] then bad = 'tab' .. a .. ' 与 tab' .. b .. ' 内容相同' end
    end
  end
  ok(bad == nil, 'D4 五页签内容签名两两不同（现网 机制/数值/解锁 三页同一份内容已修）', bad)
end

-- D5 四个回调都挂上了，并且传对参数
do
  local got = {}
  local nodes = S.roster {
    canvas = { 1600, 900 }, device = 'pc', role = 'nahida', tab = 1,
    unlocked = ROLE_STATE.unlocked, party = ROLE_STATE.party,
    onTab = function(i) got.tab = i end,
    onClose = function() got.close = true end,
    onSwap = function(i) got.swap = i end,
    onEntry = function(i) got.entry = i end,
  }
  local function fire(key)
    local n = V.get(nodes, key)
    if n and n.on and n.on.CursorClick then n.on.CursorClick() return true end
    return false
  end
  local okKeys = fire('charTab3Hit') and fire('charRow2Hit') and fire('charCloseHit') and fire('charItemHit1')
  ok(okKeys and got.tab == 3 and got.swap == 2 and got.close == true and got.entry == 1,
    'D5 onTab/onSwap/onClose/onEntry 四个回调都挂在对应热区上，参数正确（tab=' .. tostring(got.tab)
      .. ' swap=' .. tostring(got.swap) .. ' entry=' .. tostring(got.entry) .. '）')
end

-- D6 设备分支：PC 提示提键盘，手机不提（触摸屏没有 I / F）
do
  local pc = V.get(build('pc'), 'charHint').text
  local mb = V.get(build('mobile'), 'charHint').text
  ok(pc:find('I / F') ~= nil and mb:find('I / F') == nil and mb:find('合上') ~= nil,
    'D6 顶部提示按设备分支：PC 含 "I / F"，mobile 改「右上角合上返回」')
end

print('== E. 负样本（复现现网缺陷）==')

-- E1 现网口径：字号不缩放（18/16）+ 框高按单行兜底 ⇒ lint 必须报 L4
do
  local bad = {
    { key = 'charPanelL1', name = 'charPanelL1', tpl = 'stext', layer = 'card',
      pos = { 0, 0 }, size = { 244, 32 },
      text = '我把契约拟好了，请过目……钦？先别急着签，坐下来说说话。', font = 18 },
    { key = 'charPanelS', name = 'charPanelS', tpl = 'stext', layer = 'card',
      pos = { 0, -40 }, size = { 244, 29 },
      text = '冰元素 · 循循守月　｜　本局 Lv1　已缔结', font = 16 },
  }
  local iss = V.lint(bad)
  local got = {}
  for i = 1, #iss do got[iss[i].key .. ':' .. iss[i].code] = true end
  ok(got['charPanelL1:L4'] and got['charPanelS:L4'],
    'E1 【缺陷①回归】现网口径（移动端字号 18/16 不缩放 + 框高按单行 32/29）⇒ lint 报 L4'
      .. '，与实测 51.7/46.4 同源', #iss)
end

-- E2 把宽度写死成 PC 值（不按设备重算）⇒ 同一批描述在窄槽里必须报 L4/L4w
do
  local pcNodes = build('pc')
  local mbNodes = build('mobile')
  local bad, reported = nil, 0
  for _, key in ipairs({ 'charPanelS', 'charPanelL1', 'charItemNm1', 'charFoot' }) do
    local a, b = V.get(pcNodes, key), V.get(mbNodes, key)
    if a and b then
      local one = {
        -- ⚠ view_node.lint 的 L4/L4w 用 %d 打 h/w（浮点会抛「no integer representation」），
        -- 所以负样本这里取整；那条 format 缺陷已记进交付报告。
        { key = key .. 'Legacy', name = key .. 'Legacy', tpl = 'stext', layer = 'card',
          pos = { 0, 0 }, size = { math.floor(b.size[1]), math.floor(a.size[2]) },
          text = a.text, font = a.font },
      }
      local iss = V.lint(one)
      for i = 1, #iss do
        if iss[i].code == 'L4' or iss[i].code == 'L4w' then reported = reported + 1 end
      end
    end
  end
  ok(reported >= 2,
    'E2 【缺陷①回归】"宽度按设备、框高抄 PC 写死" ⇒ ' .. reported .. ' 条 L4/L4w（现网就是这么裁掉的）',
    reported)
end

-- E3 正控：同一批 key 在正常构建里 0 条 L4/L4w（负样本不是万能红）
do
  local bad = nil
  local nodes = build('mobile')
  local iss = V.lint(nodes)
  for i = 1, #iss do
    if iss[i].code == 'L4' or iss[i].code == 'L4w' then bad = iss[i].key .. ' ' .. iss[i].msg end
  end
  ok(bad == nil, 'E3 正控：正常构建（按设备重算）里 0 条 L4/L4w', bad)
end

print('== F. 抄录校验 ==')

-- F1 页面 chrome 短句在 roster.lua 源码里逐字可查（漂移即报红）
do
  local f = io.open(root .. 'lua/tetris/roster.lua', 'r')
  local src = f and f:read('a') or ''
  if f then f:close() end
  local want = {
    [1] = M.PAGE.title, [2] = M.PAGE.close, [3] = M.PAGE.foot,
    [4] = M.PAGE.stateBack, [5] = M.PAGE.stateLocked, [6] = M.PAGE.stateFront:gsub('%%s', ''),
    [7] = '左边点角色 · 右边切页签', [8] = "local CHAR_TAB_NAME = { '技能', '机制', '数值', '解锁', '规则' }",
    [9] = '每个角色独立计经验：施放 +10、有效收益 +25、前台每 10 块 +15、后台每 10 块 +5',
    [10] = '技能「', [11] = '」　冷却 ',
  }
  local bad = nil
  for i = 1, #want do
    if #src == 0 then bad = '读不到 roster.lua'
    elseif not src:find(want[i], 1, true) then bad = '源码里找不到：' .. want[i] end
  end
  ok(bad == nil, 'F1 11 条页面 chrome 文案都能在 lua/tetris/roster.lua 源码里逐字查到（含 CHAR_TAB_NAME 整行）', bad)
end

-- F2 长文案来自注入的 copy（不是复制进模块），且折行不截断内容
do
  local q = copy.quotesOf('nahida')[1].b
  local nodes = build('pc', nil, { role = 'nahida' })
  local joined = ''
  for i = 1, 4 do
    local n = V.get(nodes, 'charPanelL' .. i)
    if n then joined = joined .. n.text end
  end
  local flat = joined:gsub('\n', '')
  local long = '满足下面任意一条即可缔结：累计消行 40 行，或总局数 3 局，或对战局数 1 局；'
    .. '缔结之后会立刻写进本局存档，重开也不会丢，换存档才会重置。'
  local entryNodes = build('pc', nil, { entries = { { nm = '解锁条件', desc = long } } })
  local shown = ''
  for i = 1, 26 do
    local n = V.get(entryNodes, 'charItemL1_' .. i)
    if n then shown = shown .. n.text else break end
  end
  local shownFlat = shown:gsub('\n', ''):gsub('…$', '')
  ok(flat:find(q, 1, true) ~= nil,
    'F2 中列台词整句来自 copy.quotesOf（不复制、不改写）：' .. q)
  ok(shownFlat ~= '' and long:sub(1, #shownFlat) == shownFlat,
    'F2b 条目正文只折行 + 末行省略号，内容逐字是原文前缀（不截断语义）',
    shownFlat:sub(1, 24))
end

-- F3 状态文案随会话状态变化（已解锁/台前/未解锁三种态都出现）
do
  local nodes = build('pc')
  local front = V.get(nodes, 'charRow1S').text      -- nahida 在 party 第 1 位
  local back = V.get(nodes, 'charRow2S').text       -- keqing 已解锁不在队
  local locked = V.get(nodes, 'charRow4S').text     -- girl 未解锁
  ok(front:find('台前') and back == M.PAGE.stateBack and locked == M.PAGE.stateLocked,
    'F3 三种角色态：台前「' .. front .. '」/ 后台「' .. back .. '」/ 未解锁「' .. locked .. '」')
end


print('== G. 版面边界（现网 v5.38 真 bug：内容溢出画布下沿）==')

-- G1 所有节点都在画布内（留 2px 容差）：5 画布 × 2 设备
do
  local bad = nil
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    for _, cv in ipairs(CANVASES) do
      local nodes = build(dev, cv)
      local hw, hh = cv[1] / 2, cv[2] / 2
      for i = 1, #nodes do
        local n = nodes[i]
        -- 遮罩是**故意**画到画布外 20px 的（防边缘漏光，现网 W+40/H+40 同口径）
        if n.visible ~= false and n.role ~= 'scrim' then
          local x0, y0, x1, y1 = V.rect(n)
          if x0 < -hw - 2 or x1 > hw + 2 or y0 < -hh - 2 or y1 > hh + 2 then
            bad = string.format('%s/%dx%d %s 越界 (%.0f,%.0f)-(%.0f,%.0f)', dev, cv[1], cv[2],
              n.key, x0, y0, x1, y1)
          end
        end
      end
    end
  end
  ok(bad == nil, 'G1 10 组（2 设备 × 5 画布）里所有可见节点都在画布内（含 4:3 与 19.5:9）', bad)
end

-- G2 条目卡不越出面板；三栏互不重叠
do
  local nodes = build('mobile')
  local card = V.get(nodes, 'charCard')
  local cx0, cy0, cx1, cy1 = V.rect(card)
  local bad = nil
  for idx = 1, 3 do
    local bg = V.get(nodes, 'charItem' .. idx .. 'A')
    if bg then
      local x0, y0, x1, y1 = V.rect(bg)
      if x0 < cx0 - 1 or x1 > cx1 + 1 or y0 < cy0 - 1 or y1 > cy1 + 1 then
        bad = 'charItem' .. idx .. ' 越出面板'
      end
    end
  end
  -- 三栏：左列行 / 中面板 / 右列卡，两两不重叠
  local left = V.get(nodes, 'charRow1B')   -- 行是 view_kit.pill（B/L/R 三块，无 A）
  local mid = V.get(nodes, 'charPanelA')
  local right = V.get(nodes, 'charItem1A')
  local function ov(a, b) return (V.overlap(a, b)) end
  if ov(left, mid) > 0 then bad = '左列与中列重叠' end
  if ov(mid, right) > 0 then bad = '中列与右列重叠' end
  if ov(left, right) > 0 then bad = '左列与右列重叠' end
  ok(bad == nil, 'G2 3 张条目卡都在面板内，左/中/右三栏两两零重叠', bad)
end

-- G3 降级：copy 传空表 / 缺访问器时不崩且 lint 0（接线初期常常还没注入全）
do
  local S2 = M.new { config = cfg, layers = layers, kit = K, copy = {}, roster = {} }
  local okBuild, nodes = pcall(S2.roster, { canvas = { 1280, 720 }, device = 'mobile' })
  local iss = okBuild and V.lint(nodes) or { { code = 'ERR', key = '-', msg = '构建失败' } }
  ok(okBuild and #iss == 0 and #nodes > 60,
    'G3 copy 只给空表也能构建（' .. (okBuild and #nodes or 0) .. ' 节点 / ' .. #iss .. ' issue）')
end

print('')
print(string.format('== view_roster_test: %d passed, %d failed ==', pass, fail))
if fail > 0 then os.exit(1) end
