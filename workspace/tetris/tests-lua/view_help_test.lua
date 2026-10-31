--[[==========================================================================
 tests-lua/view_help_test.lua —— 说明页纯描述的 headless 验收（不依赖模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_help_test.lua
 判据：输出全 PASS、退出码 0。

 这份测试要证明五件事（对应任务书的 ①..⑤）：
   A 结构与层号：节点数/层号分布/role 齐全/文字框高合规/唯一名
   B lint：3 种画布 × 2 种设备 × 2 种页数 = 12 组组合全部 0 issue
   C 设备互斥：PC 与 mobile 的节点差集**恰好**是「键位提示 vs 触控胶囊」
   D 包含关系：所有 card 层节点都在纸面矩形内（三区：键表列 / 四张模式卡 / 算分条）
   E 回归守卫：造一个「文字框高不足」的坏描述，lint 必须报 L4（证明这道闸门真的会响）
   F 几何黄金值 + 缩放（fit，两条边都算）
   H 引擎侧图元：真走 render + mock 后端，读控件字段 imageId/imageSource（不是读描述）
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

local cfg  = load('lua/tetris/config.lua')
local L    = load('lua/tetris/view_layers.lua')
local VN   = load('lua/tetris/view_node.lua')
local KITM = load('lua/tetris/view_kit.lua')
local HELPM = load('lua/tetris/view_help.lua')
local PLATFORM = load('lua/tetris/platform.lua')
local RENDERM = load('lua/tetris/render.lua')

local V = VN.new { layers = L }
local KIT = KITM.new { layers = L }
local H = HELPM.new { config = cfg, layers = L, kit = KIT }

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
local function has(list, v)
  for i = 1, #list do if list[i] == v then return true end end
  return false
end
local function keySet(nodes)
  local set = {}
  for i = 1, #nodes do set[nodes[i].key] = nodes[i] end
  return set
end
local function diffKeys(a, b)
  local out = {}
  for k in pairs(a) do if not b[k] then out[#out + 1] = k end end
  table.sort(out)
  return out
end
local function byRole(nodes, role)
  local out = {}
  for i = 1, #nodes do if nodes[i].role == role then out[#out + 1] = nodes[i] end end
  return out
end
local function byKey(nodes, key)
  for i = 1, #nodes do if nodes[i].key == key then return nodes[i] end end
  return nil
end
local function countBy(nodes, field)
  local m = {}
  for i = 1, #nodes do
    local v = nodes[i][field] or '?'
    m[v] = (m[v] or 0) + 1
  end
  return m
end

local BASE = { canvas = { 1600, 900 }, device = 'pc', page = 1, pages = 1 }
local pc = H.help(BASE)
local mob = H.help { canvas = { 1600, 900 }, device = 'mobile', page = 1, pages = 1 }

-- ===== A 结构与层号 =====
print('--- A 结构与层号')

ok(#pc == 271, 'A1 PC/单页 271 个节点（13 面板 + 257 文字与图元 + 1 热区）', #pc)
local lay = countBy(pc, 'layer')
ok(lay.panel == 13 and lay.card == 257 and lay.touch == 1,
  string.format('A2 层号分布 panel=13 card=257 touch=1（实际 %d/%d/%d）',
    lay.panel or 0, lay.card or 0, lay.touch or 0))

local panelKeys = {}
for i = 1, #pc do
  if pc[i].layer == 'panel' then panelKeys[#panelKeys + 1] = pc[i].key end
end
ok(#panelKeys == 13 and panelKeys[1] == 'helpScrim' and panelKeys[2] == 'helpFrameA'
  and panelKeys[8] == 'helpBoardA',
  'A3 panel 层顺序 = 遮罩 → 外框(rrect 6 件) → 纸面(rrect 6 件)（后建在上 ⇒ 纸面压住遮罩）',
  table.concat(panelKeys, ','))

local badLayer, badTpl, badSize = nil, nil, nil
for i = 1, #pc do
  local n = pc[i]
  local okL = pcall(L.order, n.layer)
  if not okL then badLayer = n.key end
  if not n.tpl then badTpl = n.key end
  if not n.size then badSize = n.key end
end
ok(badLayer == nil, 'A4 每个节点的 layer 都是 view_layers 认得的名字', badLayer)
ok(badTpl == nil, 'A5 每个节点都有 tpl（实例化不会失败）', badTpl)
ok(badSize == nil, 'A6 每个节点都有 size', badSize)

local seenKey, seenName, dup = {}, {}, nil
for i = 1, #pc do
  local n = pc[i]
  if seenKey[n.key] then dup = n.key end
  seenKey[n.key] = true
  local nm = n.name or n.key
  if seenName[nm] then dup = nm end
  seenName[nm] = true
end
ok(dup == nil, 'A7 node.key / name 全表唯一（GetChild 寻址不歧义）', dup)

local roles = countBy(pc, 'role')
local wantRoles = { 'scrim', 'shell', 'paper', 'deco', 'heading', 'rule', 'cap', 'capLabel',
  'cardBg', 'cardHead', 'cardLine', 'chip', 'chipText', 'foot', 'hit' }
local missingRole = nil
for _, r in ipairs(wantRoles) do
  if not roles[r] then missingRole = r end
end
ok(missingRole == nil, 'A8 15 种 role 全部出现（测试按 role 聚合，不按 key 前缀）', missingRole)

local badTextH, worst = nil, nil
for i = 1, #pc do
  local n = pc[i]
  if n.text and n.font then
    local need = math.ceil(n.font * 1.45 + 6)
    if n.size[2] < need then badTextH = n.key worst = n.size[2] .. ' < ' .. need end
  end
end
ok(badTextH == nil, 'A9 每个文字框高 ≥ 字号×1.45+6（引擎 fits 判据）', badTextH and (badTextH .. ' :: ' .. worst))

local scrim = byKey(pc, 'helpScrim')
ok(scrim and scrim.size[1] >= 1600 and scrim.size[2] >= 900,
  'A10 遮罩至少盖满画布（W+20 × H+20 过扫，防边缘缝）', scrim and (scrim.size[1] .. 'x' .. scrim.size[2]))

-- 圆角件 = 2 矩形 + 4 角圆：外廓 = B 件的宽 × 高，角圆直径 = 2r
local fB, fC = byKey(pc, 'helpFrameB'), byKey(pc, 'helpFrameC1')
ok(near(fB.size[1], 1548) and near(fB.size[2], 848 - 2 * HELPM.FRAME.R)
  and near(fC.size[1], 2 * HELPM.FRAME.R),
  'A11 描金外框 = 1548×848 r26（B 件 1548×796 + 4 个 52×52 角圆，抄 buildA 的 rrect）',
  fB and (fB.size[1] .. 'x' .. fB.size[2] .. ' r=' .. fC.size[1] / 2))
local pB, pC = byKey(pc, 'helpBoardB'), byKey(pc, 'helpBoardC1')
ok(near(pB.size[1], 1540) and near(pB.size[2], 840 - 2 * HELPM.PAPER.R)
  and near(pC.size[1], 2 * HELPM.PAPER.R),
  'A12 纸面 = 1540×840 r24（B 件 1540×792 + 4 个 48×48 角圆）',
  pB and (pB.size[1] .. 'x' .. pB.size[2] .. ' r=' .. pC.size[1] / 2))

local last = pc[#pc]
ok(last.key == 'helpCloseHit' and last.layer == 'touch'
  and type(last.cursor) == 'table' and last.cursor[1] == 'CursorClick',
  'A13 最后一个节点 = 关闭热区（touch 层 + Click 光标，后建在上 ⇒ 不会被自己遮住）', last.key)

-- ===== B lint：12 组组合 =====
print('--- B lint')
local lintBad, lintCount, lintMsg = nil, 0, nil
for _, cv in ipairs({ { 1600, 900 }, { 1280, 720 }, { 2340, 1080 } }) do
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    for _, pages in ipairs({ 1, 3 }) do
      local tree = H.help { canvas = cv, device = dev, page = 1, pages = pages }
      local is = V.lint(tree)
      lintCount = lintCount + 1
      if #is > 0 then
        lintBad = cv[1] .. 'x' .. cv[2] .. ' ' .. dev .. ' p' .. pages
        lintMsg = is[1].code .. ' ' .. tostring(is[1].key) .. ' ' .. is[1].msg
      end
    end
  end
end
ok(lintBad == nil, 'B1 lint 0 issue（' .. lintCount .. ' 组：3 画布 × 2 设备 × 2 页数）',
  lintBad and (lintBad .. ' :: ' .. lintMsg))

-- ===== C 设备互斥（PC = 键位提示 / mobile = 触控胶囊）=====
print('--- C 设备互斥')
local kPc, kMob = keySet(pc), keySet(mob)
local onlyPc, onlyMob = diffKeys(kPc, kMob), diffKeys(kMob, kPc)
ok(#onlyPc == 1 and onlyPc[1] == 'helpHint',
  'C1 PC 独有 = 恰好 {helpHint}（键位提示）', table.concat(onlyPc, ','))
local closeKeys = { 'helpCloseB', 'helpCloseL', 'helpCloseR',
  'helpCloseInB', 'helpCloseInL', 'helpCloseInR', 'helpCloseTx' }
local onlyMobOk = (#onlyMob == #closeKeys)
for i = 1, #closeKeys do if not kMob[closeKeys[i]] then onlyMobOk = false end end
ok(onlyMobOk, 'C2 mobile 独有 = 恰好 7 个关闭胶囊节点（外圈 3 + 内面 3 + 文字）',
  table.concat(onlyMob, ','))
ok(kPc.helpHint and kPc.helpHint.layer == 'card',
  'C3 PC 的键位提示在 card 层（文字压在纸面上）')
ok(not kMob.helpHint, 'C4 mobile 不出现键位提示（手机没有 H 键 —— 用户 2026-10-29 反馈）')
ok(kPc.helpCloseHit and kMob.helpCloseHit,
  'C5 两种设备都有帮助关闭热区（PC 靠鼠标也能点，热区不可见）')
ok(not kMob.helpCloseTx or kMob.helpCloseTx.text == '合上手册',
  'C6 mobile 关闭胶囊文案 = 合上手册', kMob.helpCloseTx and kMob.helpCloseTx.text)

local pc3 = H.help { canvas = { 1600, 900 }, device = 'pc', page = 2, pages = 3 }
local mob3 = H.help { canvas = { 1600, 900 }, device = 'mobile', page = 2, pages = 3 }
ok(not kPc.helpPageTx and not kPc.helpPrevHit,
  'C7 单页（pages=1）不出翻页控件')
local kPc3 = keySet(pc3)
local addPc3 = diffKeys(kPc3, kPc)
table.sort(addPc3)
local wantPc3 = { 'helpNextHint', 'helpNextHit', 'helpPageTx', 'helpPrevHint', 'helpPrevHit',
  'helpRuleL', 'helpRuleR' }
local pc3Ok = (#addPc3 == #wantPc3)
for i = 1, #wantPc3 do if not kPc3[wantPc3[i]] then pc3Ok = false end end
ok(pc3Ok and not kPc3.helpRule,
  'C8 多页 PC 新增 = 页码 + 两条键位提示 + 两个热区 + 两段分隔线（整条 rule 让位）',
  table.concat(addPc3, ','))
local kMob3 = keySet(mob3)
local addMob3 = diffKeys(kMob3, kMob)
-- 新增 13、去掉 1（整条 helpRule 让位给两段线）⇒ 净 +12（119 → 131）
ok(#addMob3 == 13 and not kMob3.helpRule,
  'C9 多页 mobile 新增 13 个节点（3+3 胶囊 + 2 标签 + 页码 + 2 热区 + 2 段线），整条 rule 让位',
  #addMob3 .. ' :: ' .. table.concat(addMob3, ','))
ok(pc3.helpPageTx and pc3.helpPageTx.text == '2 / 3'
  or (byKey(pc3, 'helpPageTx') and byKey(pc3, 'helpPageTx').text == '2 / 3'),
  'C10 页码文案 = 「当前页 / 总页数」（2 / 3）',
  byKey(pc3, 'helpPageTx') and byKey(pc3, 'helpPageTx').text)

-- ===== D 包含关系（三区文字都在纸面内）=====
print('--- D 包含关系')
local oob, oobCount = nil, 0
for _, cv in ipairs({ { 1600, 900 }, { 1280, 720 }, { 2340, 1080 } }) do
  for _, dev in ipairs({ 'pc', 'mobile' }) do
    for _, pages in ipairs({ 1, 3 }) do
      local tree = H.help { canvas = cv, device = dev, pages = pages }
      local sc = math.min(cv[1] / 1600, cv[2] / 900)
      local px0 = -HELPM.PAPER.W * sc / 2
      local px1 = HELPM.PAPER.W * sc / 2
      local py0 = -HELPM.PAPER.H * sc / 2
      local py1 = HELPM.PAPER.H * sc / 2
      for i = 1, #tree do
        local n = tree[i]
        if n.layer == 'card' then
          local x0, y0, x1, y1 = V.rect(n)
          oobCount = oobCount + 1
          if x0 < px0 - 0.01 or x1 > px1 + 0.01 or y0 < py0 - 0.01 or y1 > py1 + 0.01 then
            oob = n.key .. ' @' .. cv[1] .. 'x' .. cv[2] .. '/' .. dev .. string.format(
              ' x[%.1f,%.1f] y[%.1f,%.1f]', x0, x1, y0, y1)
          end
        end
      end
    end
  end
end
ok(oob == nil, 'D1 所有 card 层节点都在纸面矩形内（' .. oobCount .. ' 个节点 × 12 组）', oob)

local keysIn = true
for i = 1, #(cfg.HELP.keys or {}) do
  local n = byKey(pc, 'helpKey' .. i)
  if not n then keysIn = false end
end
ok(keysIn, 'D2 键表 8 行全部生成（helpKey1..8）')
local k8 = byKey(pc, 'helpKey8')
ok(k8 and near(k8.pos[2], -121), 'D3 键表第 8 行 y = 208 - 7×47 = -121（抄 buildA 行距）',
  k8 and k8.pos[2])

local cardX = {}
for i = 1, 4 do
  local n = byKey(pc, 'helpCard' .. i .. 'B')     -- rrect 的 B 件 = 整宽整高的那块
  cardX[i] = n and n.pos[1]
end
ok(near(cardX[1], -212) and near(cardX[2], 66) and near(cardX[3], 344) and near(cardX[4], 622),
  'D4 四张模式卡 x = -212 / 66 / 344 / 622（-212+(i-1)×278）',
  table.concat({ tostring(cardX[1]), tostring(cardX[2]), tostring(cardX[3]), tostring(cardX[4]) }, ','))
local gapOk = true
for i = 1, 3 do
  local a, b = byKey(pc, 'helpCard' .. i .. 'B'), byKey(pc, 'helpCard' .. (i + 1) .. 'B')
  local ax1 = a.pos[1] + a.size[1] / 2
  local bx0 = b.pos[1] - b.size[1] / 2
  if bx0 - ax1 < 20 then gapOk = false end
end
ok(gapOk, 'D5 相邻模式卡水平净距 ≥ 20（278 步进 - 252 宽 = 26）')

-- ===== E 回归守卫：坏描述必须被 lint 抓住 =====
print('--- E 回归守卫（负样本）')
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
local function hasCode(issues, code, key)
  for i = 1, #issues do
    if issues[i].code == code and (key == nil or issues[i].key == key) then return true, issues[i] end
  end
  return false, nil
end

local bad1 = clone(pc)
local t1 = byKey(bad1, 'helpTitle')
t1.size[2] = math.floor(t1.size[2] / 3)          -- 40 号字塞进 1/3 框高
local is1 = V.lint(bad1)
local okL4, i4 = hasCode(is1, 'L4', 'helpTitle')
ok(okL4, 'E1 文字框高不足 → lint 报 L4（回归守卫真的会响）', i4 and i4.msg)

local bad2 = clone(pc)
local t2 = byKey(bad2, 'helpCloseHit')
t2.layer = 'hud'                                   -- 交互节点沉到面板之下
local is2 = V.lint(bad2)
ok(hasCode(is2, 'L6', 'helpCloseHit'), 'E2 交互节点层号过低 → L6')

local bad3 = clone(pc)
local t3 = byKey(bad3, 'helpFoot1')
t3.color = 0x3D2E4E63                              -- alpha=0x3D 半透明压浅纸面
local is3 = V.lint(bad3)
ok(hasCode(is3, 'L3', 'helpFoot1'), 'E3 半透明压在浅底 → L3（隐形真因）')

local bad4 = clone(pc)
bad4[#bad4 + 1] = { key = 'helpDup', name = 'helpTitle', layer = 'card', tpl = 'cell',
  pos = { 0, 0 }, size = { 10, 10 }, color = 0xFF000000 }
local is4 = V.lint(bad4)
ok(hasCode(is4, 'L1', 'helpDup'), 'E4 控件名重复 → L1')

-- ===== F 几何黄金值 + fit 缩放 =====
print('--- F 几何与缩放')
local title = byKey(pc, 'helpTitle')
ok(near(title.pos[1], -420) and near(title.pos[2], 344) and near(title.size[1], 560)
  and near(title.size[2], 66) and title.font == 40,
  'F1 标题 (-420,344) 560×66 字号 40（抄 buildA 的 helpTitle）',
  string.format('%.0f,%.0f %.0fx%.0f fs%d', title.pos[1], title.pos[2], title.size[1],
    title.size[2], title.font))

local pcSmall = H.help { canvas = { 1280, 720 }, device = 'pc' }
local tSmall = byKey(pcSmall, 'helpTitle')
-- s = min(1280/1600, 720/900) = 0.8
ok(near(tSmall.pos[1], -336) and near(tSmall.pos[2], 275.2) and tSmall.font == 32,
  'F2 1280×720（s=0.8）标题 (-336,275.2) 字号 32',
  string.format('%.1f,%.1f fs%d', tSmall.pos[1], tSmall.pos[2], tSmall.font))

local pcWide = H.help { canvas = { 2340, 1080 }, device = 'pc' }
local tWide = byKey(pcWide, 'helpTitle')
-- s = min(2340/1600, 1080/900) = min(1.4625, 1.2) = 1.2（fit 取小边，21:9 不会溢出）
ok(near(tWide.pos[1], -504) and near(tWide.pos[2], 412.8) and tWide.font == 48,
  'F3 2340×1080（s=1.2，fit 取小边）标题 (-504,412.8) 字号 48',
  string.format('%.1f,%.1f fs%d', tWide.pos[1], tWide.pos[2], tWide.font))

local cap1 = byKey(pc, 'helpCap1_1B')     -- rrect 的 B 件 = 整宽（74 或 40）
local capG = byKey(pc, 'helpCap5_1B')
ok(cap1 and near(cap1.size[1], 74), 'F4 多字节键帽宽 74（← 是 3 字节 ⇒ 走 #cap≥2 分支，照抄现网）',
  cap1 and cap1.size[1])
ok(capG and near(capG.size[1], 40), 'F5 单字节键帽宽 40（G）', capG and capG.size[1])

local closeHit = byKey(pc, 'helpCloseHit')
ok(near(closeHit.pos[1], 640) and near(closeHit.pos[2], 378)
  and near(closeHit.size[1], 196 + HELPM.HITPAD.w),
  'F6 关闭热区 (640,378)，宽 = 196 + 40 手感外扩',
  closeHit and (closeHit.pos[1] .. ',' .. closeHit.pos[2] .. ' ' .. closeHit.size[1]))

local prevHit = byKey(pc3, 'helpPrevHit')
ok(prevHit and near(prevHit.pos[1], -700) and near(prevHit.pos[2], 278),
  'F7 翻页键在分隔线中段：prev (-700,278) / next (+700,278)',
  prevHit and (prevHit.pos[1] .. ',' .. prevHit.pos[2]))

-- ===== G 行为与契约 =====
print('--- G 行为与契约')
local hits = {}
local wired = H.help {
  canvas = { 1600, 900 }, device = 'mobile', page = 2, pages = 3,
  onClose = function() hits[#hits + 1] = 'close' end,
  onPrev = function() hits[#hits + 1] = 'prev' end,
  onNext = function() hits[#hits + 1] = 'next' end,
}
for _, key in ipairs({ 'helpCloseHit', 'helpPrevHit', 'helpNextHit' }) do
  local n = byKey(wired, key)
  if n and n.on and n.on.CursorClick then n.on.CursorClick() end
end
ok(#hits == 3 and hits[1] == 'close' and hits[2] == 'prev' and hits[3] == 'next',
  'G1 三个热区各自调回 onClose / onPrev / onNext', table.concat(hits, ','))

local one = H.help { canvas = { 1600, 900 }, device = 'pc',
  sections = { { caps = { '1' }, label = '测试行' } } }
ok(byKey(one, 'helpKey1') and not byKey(one, 'helpKey2'),
  'G2 opts.sections 覆盖键表（翻页时按页切内容的入口）')
ok(byKey(one, 'helpKey1').text == '测试行' and byKey(one, 'helpCapT1_1').text == '1',
  'G3 覆盖后的行内容 + 键帽都来自 sections')

local dflt = H.help()
ok(#dflt == 271 and byKey(dflt, 'helpTitle').font == 40,
  'G4 无 opts 调用可用（缺省 1600×900 / pc / 单页，271 节点）', #dflt)

local okDev = pcall(function() H.help { device = 'tablet' } end)
ok(not okDev, 'G5 未知 device 当场报错（不静默按 pc 处理）')

local src = readfile('lua/tetris/view_help.lua') or ''
ok(src:find('\n%s*print%s*%(') == nil, 'G6 模块里没有 print（日志只走注入）')
ok(src:find('require%s*%(') == nil, 'G7 模块不 require 其它 tetris 模块（依赖注入）')
ok(src:find('game%.') == nil and src:find('Enum%.') == nil,
  'G8 模块不调引擎 API（game.* / Enum.* 零出现）')

-- 零全局泄漏：只对比本模块加载前后的 _G
local before = {}
for k in pairs(_G) do before[k] = true end
local probe = HELPM.new { config = cfg, layers = L, kit = KIT }
local leaked = {}
for k in pairs(_G) do if not before[k] then leaked[#leaked + 1] = k end end
ok(#leaked == 0 and type(probe.help) == 'function',
  'G9 加载 + new() 不写任何全局，返回 { help=fn, count=fn }', table.concat(leaked, ','))
ok(#probe.help { canvas = { 1600, 900 }, device = 'pc' } == 271 and probe.count { } == 271,
  'G10 count(opts) 与 #help(opts) 一致（接线的 `help build n=` 日志读数）')

-- ===== H 引擎侧图元（读控件字段，不读描述）=====
print('--- H 引擎侧图元')

local function throughRender(nodes, canvas)
  local P = PLATFORM.new {
    mock = true, canvas = canvas or { 1280, 720 }, logSink = function() end,
    templates = { cell = { kind = 'image' }, stext = { kind = 'text' }, hit = { kind = 'cursor' } },
  }
  local R = RENDERM.new { platform = P, layers = L, log = function() end }
  R.apply(nodes)
  return P, R
end

local P1, R1 = throughRender(pc)
ok(#R1.issues() == 0, 'H1 真走 render 通道 0 issue（R0 实例化失败 / R1 层序冲突都不可能）',
  #R1.issues() > 0 and (R1.issues()[1].code .. ' ' .. R1.issues()[1].msg))

-- 代表节点五连：星 / 圆角端点 / 矩形 / 徽章 / 环（引擎内置图元 100004/100002/100001/100002/100006）
local SAMPLE = {
  { 'helpStar', HELPM.SHAPE_ID.fourstar, '星标 fourstar' },
  { 'helpFrameC1', HELPM.SHAPE_ID.circle, '外框角圆 circle' },
  { 'helpFrameA', HELPM.SHAPE_ID.rect, '外框中段矩形 rect' },
  { 'helpEmblem1', HELPM.SHAPE_ID.circle, '模式徽章 circle' },
  { 'helpRing1', HELPM.SHAPE_ID.ring, '色环 ring' },
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
ok(badS == nil and checkedS == 5,
  'H2 引擎侧 imageId 五连：星 100004 / 角圆 100002 / 矩形 100001 / 徽章 100002 / 环 100006'
    .. '，imageSource=StaticReference（读控件字段）', badS or checkedS)

-- 完整性：描述里带 image 的节点，引擎侧必须**每一个**都贴到了对应图元
local imgNodes, badAll = 0, nil
for i = 1, #pc do
  local n = pc[i]
  if n.image then
    imgNodes = imgNodes + 1
    local want = HELPM.SHAPE_ID[n.image.s]
    local ctl = R1.get(n.key)
    if not ctl then
      badAll = 'no ctl ' .. n.key
    elseif ctl.imageId ~= want then
      badAll = n.key .. ' imageId=' .. tostring(ctl.imageId) .. ' 期望 ' .. tostring(want)
    end
  end
end
ok(badAll == nil, 'H3 逐个核对：' .. imgNodes .. ' 个图元节点全部贴到期望图元（没有"漏贴默认"的）', badAll)

-- 移动端关闭胶囊的两端也是 circle（pill 的 capShape）
local Pm, Rm = throughRender(mob)
local capCtl = Rm.get('helpCloseL')
ok(capCtl and capCtl.imageId == HELPM.SHAPE_ID.circle,
  'H4 mobile 关闭胶囊端点 = circle(100002)（胶囊圆角真的走图元通道）',
  capCtl and capCtl.imageId)

-- 创建序 = 层序（后建在上）：遮罩 → 外框 → 标题 → 关闭热区
local function seqOf(P, R, key)
  local ctl = R.get(key)
  return ctl and P.seqOf(ctl) or nil
end
local sScrim, sFrame = seqOf(P1, R1, 'helpScrim'), seqOf(P1, R1, 'helpFrameA')
local sTitle, sHit = seqOf(P1, R1, 'helpTitle'), seqOf(P1, R1, 'helpCloseHit')
ok(sScrim and sFrame and sTitle and sHit and sScrim < sFrame and sFrame < sTitle and sTitle < sHit,
  'H5 创建序 = 层序：遮罩 → 外框 → 文字 → 热区（后建在上，不靠 SetAsLastSibling）',
  table.concat({ tostring(sScrim), tostring(sFrame), tostring(sTitle), tostring(sHit) }, '<'))

-- 负向 ①：把某块矩形的 image.s 误写成 circle ⇒ 检查必须报红（证明读的是引擎侧真值）
local badDesc = clone(pc)
local frameA = nil
for i = 1, #badDesc do if badDesc[i].key == 'helpFrameA' then frameA = badDesc[i] end end
frameA.image = { s = 'circle' }
local _, Rbad = throughRender(badDesc)
local ctlBad = Rbad.get('helpFrameA')
ok(ctlBad and ctlBad.imageId == HELPM.SHAPE_ID.circle,
  'H6 负向①：矩形误写 circle ⇒ 引擎侧 imageId 真的变成 100002（闸门读的是控件字段，不是描述）',
  ctlBad and ctlBad.imageId)

-- 负向 ②：整块拿掉 image 字段 ⇒ 引擎侧没有 imageId ⇒ 完整性检查会红
local noImg = clone(pc)
for i = 1, #noImg do if noImg[i].key == 'helpStar' then noImg[i].image = nil end end
local _, Rnil = throughRender(noImg)
local starCtl = Rnil.get('helpStar')
ok(starCtl and starCtl.imageId == nil,
  'H7 负向②：拿掉 image 字段 ⇒ 引擎侧 imageId=nil（H3 那种检查必然报红）',
  starCtl and tostring(starCtl.imageId))

-- ===== 汇总 =====
print(string.format('\n== view_help_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
