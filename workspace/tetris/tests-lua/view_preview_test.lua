--[[==========================================================================
 tests-lua/view_preview_test.lua —— NEXT/HOLD 预览纯描述（view_preview.lua）的 headless 验收
 跑法：cd /home/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_preview_test.lua
 判据：输出全 PASS、退出码 0。

 这份测试钉住六件事，顺序对应任务书的 ①..⑥：
   ① 形状真源：7 形状落格逐值对拍现网公式 + 3 个绝对坐标读数 + 7 形状 × 4 旋转 28 组
   ② 队列 1..5 节点数线性（1 + 4q），且键稳定 ⇒ render 增量通道成立
   ③ HOLD 空槽（4 颗 COL_BG 停靠）与有块（4 颗彩格）两种形态
   ④ canHold=false 的可识别视觉差异：白化 + 文字灰化，两条通道都取读数
   ⑤ 3 画布 × 2 设备：view_node.lint 0 issue、本模块 audit 0 issue
   ⑥ 负样本：越界/NaN/重叠/框高不足 —— 方法本身必须报得出来

 坐标口径（全部来自现网，测试里写死字面量以做「逐值对拍」）：
   下一块1：x = CX + (c-2.5)*20，y = 150 + (2.5-r)*20，18px，满色   ← main.lua:1229-1231
   下一块2：x = CX + (c-2.5)*14，y = 78  + (2.5-r)*14，14px，白 0.46 ← main.lua:1236-1239
   暂存   ：x = -CX + (c-2.5)*20，y = 150 + (2.5-r)*20，18px          ← main.lua:1252-1256
   空槽   ：4 颗 COL_BG 停靠 (-4000,-4000)                          ← main.lua:1226 与 1247
   CX     ：PC/手机单持 = halfW-230；手机双持 = halfW-103
                                                       ← ui.lua:156-158 / 204 / 285 / 352
   标签   ：「下一个」240×44 @ (CX,255) fs22 textSub；「暂存」200×44 @ (-CX,255) fs22 textMain
                                                       ← main.lua:3425-3427 / 3434-3442 / 615
 ========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')
local platform = load('lua/tetris/platform.lua')
local renderM = load('lua/tetris/render.lua')

-- 零全局泄漏检查要在加载被测模块**之前**取快照
local gBefore = {}
for k in pairs(_G) do gBefore[k] = true end
local vpreview = load('lua/tetris/view_preview.lua')
local leaked = {}
for k in pairs(_G) do if not gBefore[k] then leaked[#leaked + 1] = tostring(k) end end

local V = vnode.new { layers = layers }
local S = vpreview.new { config = cfg, layers = layers }
local G = vpreview.GEO

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

-- 引擎把 32 位色当有符号 int32 读回；这里两侧统一成有符号口径比较
local function signed(v)
  if v and v >= 2147483648 then return v - 4294967296 end
  return v
end

-- 白化：**独立**照抄 main.lua:1204-1210 的 MS.fade（不复用模块里的实现 = 真对拍）
local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local function fade(v, k)
  local a = v // 16777216
  local rr, gg, bb = (v // 65536) % 256, (v // 256) % 256, v % 256
  local m = 1 - k
  return C(a, math.floor(255 - (255 - rr) * m + 0.5),
    math.floor(255 - (255 - gg) * m + 0.5), math.floor(255 - (255 - bb) * m + 0.5))
end
local function luma(v)
  local r, g, b = (v // 65536) % 256, (v // 256) % 256, v % 256
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
end
local function hex(v) return string.format('0x%08X', v < 0 and v + 4294967296 or v) end

local NAMES = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }
local PC = { canvas = { 1600, 900 }, device = 'pc' }   -- halfW=800 ⇒ CX = 570

local function clone(t)
  local o = {}
  for k, v in pairs(t) do
    if type(v) == 'table' then
      local c = {}
      for k2, v2 in pairs(v) do c[k2] = v2 end
      o[k] = c
    else
      o[k] = v
    end
  end
  return o
end
local function optOf(t, extra)
  local o = clone(t)
  if extra then for k, v in pairs(extra) do o[k] = v end end
  return o
end
local function nodesOf(role, list)
  local t = {}
  for i = 1, #list do if list[i].role == role then t[#t + 1] = list[i] end end
  return t
end
local function nodesOfSlot(slot, list)
  local t = {}
  for i = 1, #list do if list[i].slot == slot then t[#t + 1] = list[i] end end
  return t
end
local function findKey(list, key)
  for i = 1, #list do if list[i].key == key then return list[i] end end
  return nil
end
local function issuesOf(list, code)
  local t = {}
  for i = 1, #list do if list[i].code == code then t[#t + 1] = list[i] end end
  return t
end
local function hasIssue(issues, code, key)
  for i = 1, #issues do
    local i1 = issues[i]
    if i1.code == code and (key == nil or i1.key == key) then return true, i1.msg end
  end
  return false
end

-- ======================================================================
-- ① 形状真源：config.SHAPES 是唯一真源，坐标逐值对拍现网
-- ======================================================================
print('--- ① 形状真源 / 逐值对拍 ---')

-- ①-0 config 里**没有**旋转表（任务书条件句「若 config 有旋转表」不成立）——
--     所以旋转一律由 cells + n 派生，绝不另抄一份形状数据。
local cfgSrc = assert(io.open(ROOT .. '/lua/tetris/config.lua', 'r')):read('a')
local rotationTableHits = 0
for _ in cfgSrc:gmatch('rotat') do rotationTableHits = rotationTableHits + 1 end
for _ in cfgSrc:gmatch('ROT_') do rotationTableHits = rotationTableHits + 1 end
for _ in cfgSrc:gmatch('旋转表') do rotationTableHits = rotationTableHits + 1 end
ok(rotationTableHits == 0, '①0 config.lua 无旋转表（旋转须由 cells+n 派生）', rotationTableHits)

for i = 1, #NAMES do
  local name = NAMES[i]
  local s = cfg.SHAPES[name]
  ok(s ~= nil and s.n ~= nil and #s.cells == 4 and s.color ~= nil,
    '①1 ' .. name .. ' 形状在 config.SHAPES 里且 n/cells/color 齐', s and (#s.cells))
end

-- ①2 逐值对拍：每格 pos == (CX + (c-2.5)*20, 150 + (2.5-r)*20)，size 18，色 = SHAPES.color
local CX1600 = 800 - 230   -- 570（ui.lua:158 的 halfW - 420/2 - 20）
for i = 1, #NAMES do
  local name = NAMES[i]
  local s = cfg.SHAPES[name]
  local nodes = S.next(optOf(PC, { queue = { name } }))
  local cells = nodesOf('nextCell', nodes)
  local bad = nil
  if #cells ~= 4 then bad = '格数 ' .. #cells end
  for k = 1, #cells do
    local r, c = s.cells[k][1], s.cells[k][2]
    local ex, ey = CX1600 + (c - 2.5) * 20, 150 + (2.5 - r) * 20
    local n = cells[k]
    if n.pos[1] ~= ex or n.pos[2] ~= ey then
      bad = string.format('格%d 期望 (%s,%s) 实得 (%s,%s)', k, ex, ey, n.pos[1], n.pos[2])
    elseif n.size[1] ~= 18 or n.size[2] ~= 18 then
      bad = '格' .. k .. ' 尺寸 ' .. n.size[1]
    end
  end
  ok(bad == nil, '①2 ' .. name .. ' 4 格坐标/尺寸逐值 = 现网公式', bad)
  local colorBad = nil
  for k = 1, #cells do
    if signed(cells[k].color) ~= signed(s.color) then
      colorBad = '格' .. k .. ' ' .. hex(cells[k].color) .. ' ≠ ' .. hex(s.color)
    end
  end
  ok(colorBad == nil, '①3 ' .. name .. ' 4 格满色 = SHAPES.color', colorBad)
end

-- ①4 三个显式读数（人可复算的绝对坐标，1600 画布 ⇒ CX=570）
do
  local I = S.next(optOf(PC, { queue = { 'I' } }))
  local n1 = nodesOf('nextCell', I)[1]
  ok(n1.pos[1] == 540 and n1.pos[2] == 160, '①4 I 首格 = (540,160)（r2c1，CX=570）',
    n1.pos[1] .. ',' .. n1.pos[2])
  local T = S.next(optOf(PC, { queue = { 'T' } }))
  local t1 = nodesOf('nextCell', T)[1]
  ok(t1.pos[1] == 560 and t1.pos[2] == 180, '①5 T 首格 = (560,180)（r1c2）',
    t1.pos[1] .. ',' .. t1.pos[2])
  local O = S.next(optOf(PC, { queue = { 'O' } }))
  local o1 = nodesOf('nextCell', O)[1]
  ok(o1.pos[1] == 540 and o1.pos[2] == 180, '①6 O 首格 = (540,180)（r1c1）',
    o1.pos[1] .. ',' .. o1.pos[2])
end

-- ①7 现网枢轴 2.5 的偏差读数：O 的墨迹中心相对槽心 (-20,+20) = 一整个格距（缺陷已记）
do
  local nodes = nodesOf('nextCell', S.next(optOf(PC, { queue = { 'O' } })))
  local sx, sy = 0, 0
  for k = 1, #nodes do sx = sx + nodes[k].pos[1] sy = sy + nodes[k].pos[2] end
  sx, sy = sx / #nodes - CX1600, sy / #nodes - 150
  ok(sx == -20 and sy == 20, '①7 现网枢轴下 O 墨迹中心偏 (-20,+20)（2 宽方块的已知缺陷）',
    sx .. ',' .. sy)
end

-- ①8 同一形状 4 格坐标互不相同（映射不塌格）
do
  local dupBad = nil
  for i = 1, #NAMES do
    local cells = nodesOf('nextCell', S.next(optOf(PC, { queue = { NAMES[i] } })))
    local seen = {}
    for k = 1, #cells do
      local key = cells[k].pos[1] .. ',' .. cells[k].pos[2]
      if seen[key] then dupBad = NAMES[i] .. ' 重复 ' .. key end
      seen[key] = true
    end
  end
  ok(dupBad == nil, '①8 7 形状各自 4 格坐标互不相同', dupBad)
end

-- ①9 tpl / layer 口径（图元用 cell 模板、文字用 stext，层 = hud）
do
  local nodes = S.next(optOf(PC, { queue = { 'I' } }))
  local bad = nil
  for i = 1, #nodes do
    if nodes[i].tpl ~= 'cell' and nodes[i].tpl ~= 'stext' then bad = 'tpl=' .. tostring(nodes[i].tpl) end
    if nodes[i].layer ~= 'hud' then bad = 'layer=' .. tostring(nodes[i].layer) end
  end
  ok(bad == nil, '①9 预览节点全在 hud 层、图元 cell / 文字 stext', bad)
end

-- ①10 标题文字「下一个」：240×44 @ (CX,255)、fs22、textSub、valign=Middle
do
  local lab = findKey(S.next(optOf(PC, { queue = { 'I' } })), 'pvNextLabel')
  ok(lab ~= nil, '①10 next 有「下一个」标签节点')
  local bad = nil
  if lab.text ~= '下一个' then bad = 'text=' .. tostring(lab.text) end
  if lab.pos[1] ~= CX1600 or lab.pos[2] ~= 255 then bad = 'pos' end
  if lab.size[1] ~= 240 or lab.size[2] ~= 44 then bad = 'size' end
  if lab.font ~= 22 then bad = 'font=' .. tostring(lab.font) end
  if signed(lab.fcolor) ~= signed(cfg.THEME.textSub) then bad = 'fcolor' end
  if lab.valign ~= 'Middle' then bad = 'valign（main.lua:615 硬要求 Middle）' end
  ok(bad == nil, '①11 「下一个」240×44@(570,255) fs22 textSub valign=Middle', bad)
end

-- ======================================================================
-- ①' 7 形状 × 4 旋转：旋转由 config 的 cells + n 派生（不复制第二份形状数据）
-- ======================================================================
print('--- ①′ 7 形状 × 4 旋转（派生，非第二份数据）---')

-- 顺时针旋转一格： (r,c) → (c, n+1-r)
local function rotCW(shape)
  local n = shape.n
  local cells = {}
  for i = 1, #shape.cells do
    local r, c = shape.cells[i][1], shape.cells[i][2]
    cells[i] = { c, n + 1 - r }
  end
  return { n = n, cells = cells }
end

local rotShapes, rotKeys = {}, {}
for i = 1, #NAMES do
  local name = NAMES[i]
  local base = cfg.SHAPES[name]
  local cur = { n = base.n, cells = base.cells }
  for rot = 0, 4 do          -- 多算一代（rot=4）用来验证「四转归位」
    local key = name .. '#' .. rot
    rotShapes[key] = { n = cur.n, color = base.color, cells = cur.cells }
    if rot < 4 then rotKeys[#rotKeys + 1] = key end
    cur = rotCW(cur)
  end
end
local cfgRot = clone(cfg)
cfgRot.SHAPES = rotShapes
local SRot = vpreview.new { config = cfgRot, layers = layers }

-- ①′1 四转归位（派生器自身正确）
for i = 1, #NAMES do
  local name = NAMES[i]
  local a, b = rotShapes[name .. '#0'].cells, rotShapes[name .. '#4'].cells
  local same = #a == #b
  for k = 1, #a do
    if a[k][1] ~= b[k][1] or a[k][2] ~= b[k][2] then same = false end
  end
  ok(same, '①′1 ' .. name .. ' 旋转 4 次回到原形')
end

-- 半格对齐：|(x-CX)/pitch * 2| 必须是整数（偶宽形状的枢轴是半整数，允许半格偏移）
local function alignedToHalfPitch(v, pitch)
  local t = v / pitch
  return math.abs(t * 2 - math.floor(t * 2 + 0.5)) < 1e-9
end

-- ①′2 28 组：'bbox' 居中模式 ⇒ 每格都落在「以槽心为中心的 n×n 包围盒」内 + 半格对齐
do
  local bad = nil
  for i = 1, #rotKeys do
    local key = rotKeys[i]
    local sh = rotShapes[key]
    local nodes = SRot.next(optOf(PC, { queue = { key }, center = 'bbox' }))
    local cells = nodesOf('nextCell', nodes)
    if #cells ~= 4 then
      bad = key .. ' 格数 ' .. #cells
    else
      local lim = (sh.n - 1) / 2 * 20 + 1e-9
      local seen = {}
      for k = 1, #cells do
        local dx, dy = cells[k].pos[1] - CX1600, cells[k].pos[2] - 150
        if math.abs(dx) > lim or math.abs(dy) > lim then
          bad = string.format('%s 格%d 出包围盒 dx=%.1f dy=%.1f lim=%.1f', key, k, dx, dy, lim)
        elseif not (alignedToHalfPitch(dx, 20) and alignedToHalfPitch(dy, 20)) then
          bad = string.format('%s 格%d 没落在半格栅格上 dx=%.2f dy=%.2f', key, k, dx, dy)
        end
        local sig = cells[k].pos[1] .. ',' .. cells[k].pos[2]
        if seen[sig] then bad = key .. ' 有重合格 ' .. sig end
        seen[sig] = true
      end
    end
  end
  ok(bad == nil, '①′2 7 形状 × 4 旋转 = 28 组全部落在居中包围盒内', bad)
end

-- ①′3 对照读数：同一批 28 组在现网枢轴（center 缺省）下，O 一类 2 宽形状会越出包围盒
do
  local over, checked = 0, 0
  for i = 1, #rotKeys do
    local key = rotKeys[i]
    local sh = rotShapes[key]
    local nodes = SRot.next(optOf(PC, { queue = { key } }))
    local lim = (sh.n - 1) / 2 * 20 + 1e-9
    for k = 1, #nodesOf('nextCell', nodes) do
      local nd = nodesOf('nextCell', nodes)[k]
      checked = checked + 1
      if math.abs(nd.pos[1] - CX1600) > lim or math.abs(nd.pos[2] - 150) > lim then over = over + 1 end
    end
  end
  -- 实测构成：O 形 4 格 × 4 旋转 = 16（整格偏移）；五个三宽形共 30（半格偏移，按旋转 1~2 格）
  ok(over == 46 and checked == 112, '①′3 现网枢轴下 46/112 格越出居中包围盒（缺陷可复现）',
    over .. '/' .. checked)
end

-- ①′4 对照：把 center='bbox' 打开后上述越界归零（证明缺陷修法在本通道有效）
do
  local over = 0
  for i = 1, #rotKeys do
    local key = rotKeys[i]
    local sh = rotShapes[key]
    local lim = (sh.n - 1) / 2 * 20 + 1e-9
    local nodes = nodesOf('nextCell', SRot.next(optOf(PC, { queue = { key }, center = 'bbox' })))
    for k = 1, #nodes do
      if math.abs(nodes[k].pos[1] - CX1600) > lim or math.abs(nodes[k].pos[2] - 150) > lim then
        over = over + 1
      end
    end
  end
  ok(over == 0, "①′4 center='bbox' 后越界归零", over)
end

-- ======================================================================
-- ② 队列 1..5：节点数线性、键稳定、槽位 y 递推
-- ======================================================================
print('--- ② 队列 1..5 线性 ---')
local function queueOf(n)
  local t = {}
  for i = 1, n do t[i] = NAMES[(i - 1) % #NAMES + 1] end
  return t
end

for q = 1, 5 do
  local nodes = S.next(optOf(PC, { queue = queueOf(q) }))
  ok(#nodes == 1 + 4 * q, '②' .. q .. ' 队列 ' .. q .. ' ⇒ 节点数 ' .. (1 + 4 * q), #nodes)
end

do
  local counts = {}
  for q = 1, 5 do counts[q] = #S.next(optOf(PC, { queue = queueOf(q) })) end
  local diffs = {}
  for q = 2, 5 do diffs[#diffs + 1] = counts[q] - counts[q - 1] end
  local linear = true
  for i = 1, #diffs do if diffs[i] ~= 4 then linear = false end end
  ok(linear, '②6 每多一块 = 多 4 个节点（差值 ' .. table.concat(diffs, '/') .. '）',
    table.concat(diffs, '/'))
end

-- ②7 键稳定：队列从 1 变到 5，第一块的 4 个键不变（render 增量更新才有得更新）
do
  local a = S.next(optOf(PC, { queue = { 'I' } }))
  local b = S.next(optOf(PC, { queue = queueOf(5) }))
  local stable = true
  for k = 1, 4 do
    if findKey(b, a[k].key) == nil then stable = false end
  end
  ok(stable, '②7 队列变长后第一块的键保持稳定（增量通道前提）')
end

-- ②8 槽位 y：用全 I 队列消掉墨迹差异后，第 1..5 块 = 160 / 85 / 13 / -59 / -131
--     （I 的墨迹全在第 2 行 ⇒ y = 槽心 + (2.5-2)*pitch，pitch 分别是 20 与 14）
do
  local same = S.next(optOf(PC, { queue = { 'I', 'I', 'I', 'I', 'I' } }))
  local want = { 160, 85, 13, -59, -131 }
  local absBad = nil
  local mean = {}
  for slot = 1, 5 do
    local cells = nodesOfSlot(slot, same)
    if #cells ~= 4 then absBad = '槽' .. slot .. ' 格数 ' .. #cells end
    local sum = 0
    for k = 1, #cells do
      sum = sum + cells[k].pos[2]
      if cells[k].pos[2] ~= want[slot] then absBad = '槽' .. slot .. ' y=' .. cells[k].pos[2] end
    end
    mean[slot] = sum / #cells
  end
  ok(absBad == nil, '②8 5 个槽的绝对 y = 160/85/13/-59/-131', absBad)
  local d = {}
  for i = 2, 5 do d[#d + 1] = mean[i - 1] - mean[i] end
  -- 1→2 差 75 = 72 + 3：格距 20→14 让 I 的墨迹行偏移从 10 变 7（槽心仍是整齐的 72）
  local wantD = { 75, 72, 72, 72 }
  local stepBad = nil
  for i = 1, #d do
    if math.abs(d[i] - wantD[i]) > 1e-9 then stepBad = '槽' .. i .. '→' .. (i + 1) .. ' 差 ' .. d[i] end
  end
  ok(stepBad == nil, '②9 槽心逐槽下移 72（墨迹读数 75/72/72/72：' .. table.concat(d, '/') .. '）', stepBad)
end

-- ②10 第一块满色、第二块起白化 0.46
do
  local nodes = S.next(optOf(PC, { queue = { 'I', 'T' } }))
  local c1 = nodesOfSlot(1, nodes)[1]
  local c2 = nodesOfSlot(2, nodes)[1]
  ok(signed(c1.color) == signed(cfg.SHAPES.I.color), '②10 第一块满色',
    hex(c1.color))
  ok(signed(c2.color) == signed(fade(cfg.SHAPES.T.color, 0.46)),
    '②11 第二块白化 0.46（MS.fade 同值）', hex(c2.color) .. ' vs ' .. hex(fade(cfg.SHAPES.T.color, 0.46)))
  ok(c2.dim == true, '②12 第二块带 dim 标记（描述层可识别「缩略」）')
end

-- ②13 队列超过 MAX_SLOTS 时封顶（引擎实例预算）
do
  local nodes = S.next(optOf(PC, { queue = queueOf(7) }))
  ok(#nodes == 1 + 4 * 5, '②13 队列 7 ⇒ 封顶 5 块（' .. (1 + 4 * 5) .. ' 节点）', #nodes)
end

-- ②14 显式 slots 也受 MAX_SLOTS 硬顶（实例预算不能被调用方绕过）
do
  local nodes = S.next(optOf(PC, { queue = queueOf(2), slots = 9 }))
  ok(#nodes == 1 + 4 * 5, '②14 slots=9 被压回 5 块（' .. (1 + 4 * 5) .. ' 节点）', #nodes)
end

-- ②15 空队列 ⇒ 只有标签，不出脏格
do
  local nodes = S.next(optOf(PC, { queue = {} }))
  ok(#nodes == 1 and nodes[1].key == 'pvNextLabel', '②15 空队列只出标签（无脏格）', #nodes)
end

-- ======================================================================
-- ⑨ 接线期选项（cx 覆盖 / noLabel / legacyNames）
-- ======================================================================
print('--- ⑨ 接线期选项 ---')
do
  -- ⑨1 opts.cx 覆盖画布推算：main 的 RIGHT_CX 是单一真源（ui.lua 的 plan 决定）
  local nodes = S.next(optOf(PC, { queue = { 'I' }, cx = 410 }))
  local lab = findKey(nodes, 'pvNextLabel')
  local cells = nodesOf('nextCell', nodes)
  local cxOfCells = cells[1].pos[1] - (cfg.SHAPES.I.cells[1][2] - 2.5) * 20
  ok(lab.pos[1] == 410 and cxOfCells == 410, '⑨1 opts.cx 覆盖画布推算（标题与格子同源）',
    lab.pos[1] .. '/' .. cxOfCells)
  local hold = S.hold(optOf(PC, { holdName = 'I', canHold = true, cx = 410 }))
  ok(findKey(hold, 'pvHoldLabel').pos[1] == -410, '⑨2 opts.cx 在暂存侧镜像（-cx）')
end
do
  -- ⑨3 noLabel：现网「下一个/暂存」是服务端 textbox，运行时再出一份就是双影
  local a = S.next(optOf(PC, { queue = { 'I', 'T' }, noLabel = true }))
  local b = S.next(optOf(PC, { queue = { 'I', 'T' } }))
  ok(#a == #b - 1 and #nodesOf('label', a) == 0, '⑨3 noLabel 少出 1 个标题节点', #a .. '/' .. #b)
  local h = S.hold(optOf(PC, { holdName = 'I', noLabel = true }))
  ok(#h == 4 and #nodesOf('label', h) == 0, '⑨4 noLabel 对暂存同样生效', #h)
end
do
  -- ⑨5 legacyNames：引擎侧名沿用现网 next1.. / hold1..，render 键仍是 pv*
  local nodes = S.next(optOf(PC, { queue = { 'I', 'T' }, legacyNames = true }))
  local cells = nodesOf('nextCell', nodes)
  local names = {}
  for i = 1, #cells do names[cells[i].name] = true end
  ok(names.next1 and names.next5 and names.next8 and #cells == 8,
    '⑨5 legacyNames ⇒ 引擎侧名 next1..next8', #cells)
  local keysArePv = true
  for i = 1, #cells do if not cells[i].key:match('^pvNext%dC%d$') then keysArePv = false end end
  ok(keysArePv, '⑨6 legacyNames 不改 render 键（仍是 pvNext<slot>C<k>）')
  local h = S.hold(optOf(PC, { holdName = 'I', legacyNames = true }))
  local hc = nodesOf('holdCell', h)
  ok(hc[1].name == 'hold1' and hc[4].name == 'hold4' and hc[1].key == 'pvHoldC1',
    '⑨7 暂存 legacyNames ⇒ hold1..hold4、键仍 pvHoldC1', hc[1].name)
  local all = {}
  for i = 1, #nodes do all[#all + 1] = nodes[i] end
  for i = 1, #h do all[#all + 1] = h[i] end
  local seen, dup = {}, nil
  for i = 1, #all do
    if seen[all[i].name] then dup = all[i].name end
    seen[all[i].name] = true
  end
  ok(dup == nil, '⑨8 legacyNames 下 12 个控件名互不重复', dup)
  ok(#V.lint(all) == 0, '⑨9 legacyNames 下 lint 仍 0 issue',
    #V.lint(all) > 0 and V.lint(all)[1].msg or nil)
end

-- ======================================================================
-- ③ HOLD：空槽 vs 有块
-- ======================================================================
print('--- ③ HOLD 空槽 / 有块 ---')

-- ③1 空槽：4 颗 COL_BG 停靠 (-4000,-4000)，同帧完成（不是「先刷色后一帧再挪」）
do
  local nodes = S.hold(optOf(PC, { holdName = nil, canHold = true }))
  local cells = nodesOf('emptyCell', nodes)
  ok(#nodes == 5 and #cells == 4, '③1 空槽 = 1 标签 + 4 颗空槽格', #nodes)
  local bad = nil
  for k = 1, #cells do
    if cells[k].pos[1] ~= -4000 or cells[k].pos[2] ~= -4000 then bad = '格' .. k .. ' 未停靠' end
    if signed(cells[k].color) ~= signed(cfg.COL_BG) then bad = '格' .. k .. ' 色 ≠ COL_BG' end
    if cells[k].size[1] ~= 18 then bad = '格' .. k .. ' 尺寸' end
    if cells[k].parked ~= true then bad = '格' .. k .. ' 缺 parked 标记' end
  end
  ok(bad == nil, '③2 空槽 4 格 = COL_BG @ (-4000,-4000) 且带 parked', bad)
end

-- ③3 有块：4 颗彩格、左栏镜像（x = -CX + (c-2.5)*20）、y = 150 + (2.5-r)*20
do
  local nodes = S.hold(optOf(PC, { holdName = 'T', canHold = true }))
  local cells = nodesOf('holdCell', nodes)
  ok(#cells == 4, '③3 有块 ⇒ 4 颗 holdCell', #cells)
  local s = cfg.SHAPES.T
  local bad = nil
  for k = 1, #cells do
    local r, c = s.cells[k][1], s.cells[k][2]
    local ex, ey = -CX1600 + (c - 2.5) * 20, 150 + (2.5 - r) * 20
    if cells[k].pos[1] ~= ex or cells[k].pos[2] ~= ey then
      bad = string.format('格%d 期望 (%s,%s) 实得 (%s,%s)', k, ex, ey, cells[k].pos[1], cells[k].pos[2])
    end
    if signed(cells[k].color) ~= signed(s.color) then bad = '格' .. k .. ' 色不是满色' end
  end
  ok(bad == nil, '③4 暂存格镜像到左栏、满色、18px', bad)
  ok(findKey(nodes, 'pvHoldLabel') ~= nil, '③5 暂存有「暂存」标签节点')
end

-- ③6 「暂存」标签：200×44 @ (-CX,255)、fs22、textMain、valign=Middle
do
  local lab = findKey(S.hold(optOf(PC, { holdName = nil, canHold = true })), 'pvHoldLabel')
  local bad = nil
  if lab.text ~= '暂存' then bad = 'text=' .. tostring(lab.text) end
  if lab.pos[1] ~= -CX1600 or lab.pos[2] ~= 255 then bad = 'pos' end
  if lab.size[1] ~= 200 or lab.size[2] ~= 44 then bad = 'size' end
  if lab.font ~= 22 then bad = 'font' end
  if signed(lab.fcolor) ~= signed(cfg.THEME.textMain) then bad = 'fcolor' end
  if lab.valign ~= 'Middle' then bad = 'valign' end
  ok(bad == nil, '③6 「暂存」200×44@(-570,255) fs22 textMain valign=Middle', bad)
end

-- ③7 标签与格子同源：双持时两者都不再各算一套（现网错位 127px）
do
  local dual = { canvas = { 1280, 720 }, device = 'mobile', dual = true }
  local nodes = S.hold(optOf(dual, { holdName = 'I', canHold = true }))
  local lab = findKey(nodes, 'pvHoldLabel')
  ok(lab.pos[1] == -537, '③7 手机双持 CX = 640-103 = 537 ⇒ 标签 x = -537', lab.pos[1])
  local cells = nodesOf('holdCell', nodes)
  local cxOfCells = (cells[1].pos[1] - (cfg.SHAPES.I.cells[1][2] - 2.5) * 20) * -1
  ok(cxOfCells == 537, '③8 格子与标签用同一个 CX（现网此处错开 127px）', cxOfCells)
end

-- ③9 未知方块名不静默：4 颗空槽格 + badShape 标记，audit 报 P4
do
  local nodes = S.next(optOf(PC, { queue = { 'Q' } }))
  local cells = nodesOf('emptyCell', nodes)
  ok(#cells == 4 and cells[1].badShape == 'Q',
    '③9 未知方块名 ⇒ 4 颗空槽格并打 badShape（不静默）', #cells)
  ok(hasIssue(S.audit(nodes, { 1600, 900 }), 'P4', 'pvNext1C1'), '③10 未知方块名被 audit 报 P4')
end

-- ======================================================================
-- ④ canHold=false 的可识别视觉差异（两条通道 + 一条诚实的读数）
-- ======================================================================
print('--- ④ canHold=false ---')
do
  local ready = S.hold(optOf(PC, { holdName = 'I', canHold = true }))
  local used = S.hold(optOf(PC, { holdName = 'I', canHold = false }))
  local rc = nodesOf('holdCell', ready)
  local uc = nodesOf('holdCell', used)
  ok(signed(uc[1].color) == signed(fade(cfg.SHAPES.I.color, 0.5)),
    '④1 can=false ⇒ 白化 0.5（main.lua:1256 同值）', hex(uc[1].color))
  local dimBad = nil
  for k = 1, 4 do if uc[k].dim ~= true then dimBad = '格' .. k end end
  ok(dimBad == nil, '④2 can=false ⇒ 4 格都带 dim 标记', dimBad)
  local geoBad = nil
  for k = 1, 4 do
    if uc[k].pos[1] ~= rc[k].pos[1] or uc[k].pos[2] ~= rc[k].pos[2] then geoBad = '格' .. k end
  end
  ok(geoBad == nil, '④3 灰化不改几何（只改色/标记）', geoBad)
end

-- ④4 七个方块「白化后亮度差」逐块读数（阈值 20：黄块最差 24.6）
do
  local worst, worstName = 999, ''
  for i = 1, #NAMES do
    local name = NAMES[i]
    local ready = nodesOf('holdCell', S.hold(optOf(PC, { holdName = name, canHold = true })))
    local used = nodesOf('holdCell', S.hold(optOf(PC, { holdName = name, canHold = false })))
    local d = math.abs(luma(ready[1].color) - luma(used[1].color))
    if d < worst then worst, worstName = d, name end
  end
  ok(worst >= 20, string.format('④4 7 个方块白化后亮度差最小 %.1f（%s）≥ 20', worst, worstName), worst)
end

-- ④5 诚实读数：黄块白化后与槽底 COL_BG 的亮度差只有 ~8.5 ⇒ 单靠白化在浅底上分辨不出
do
  local used = nodesOf('holdCell', S.hold(optOf(PC, { holdName = 'O', canHold = false })))
  local d = math.abs(luma(used[1].color) - luma(cfg.COL_BG))
  ok(d < 12, string.format('④5 黄块灰化后与槽底亮度差 = %.1f < 12（白化alone 不够）', d), d)
end

-- ④6 所以第二条通道是必须的：标签墨色 textMain → textDim（同一处几何，0 额外节点）
do
  local ready = findKey(S.hold(optOf(PC, { holdName = 'O', canHold = true })), 'pvHoldLabel')
  local used = findKey(S.hold(optOf(PC, { holdName = 'O', canHold = false })), 'pvHoldLabel')
  ok(signed(used.fcolor) == signed(cfg.THEME.textDim),
    '④6 can=false ⇒ 「暂存」墨色 textDim', hex(used.fcolor))
  ok(signed(ready.fcolor) == signed(cfg.THEME.textMain) and used.fcolor ~= ready.fcolor,
    '④7 can=true 仍是 textMain，两者不同')
  ok(math.abs(luma(used.fcolor) - luma(ready.fcolor)) >= 15,
    string.format('④8 两条墨色亮度差 %.1f ≥ 15（人眼可辨）', math.abs(luma(used.fcolor) - luma(ready.fcolor))))
end

-- ④9 MS.fade 的逐值手算校验（两侧独立实现都必须等于主程序里的这个数）
ok(signed(fade(cfg.COL_CYAN, 0.5)) == signed(C(255, 158, 238, 248)),
  '④9 fade(COL_CYAN,0.5) = 0xFF9EEEF8（手算值）', hex(fade(cfg.COL_CYAN, 0.5)))
ok(signed(vpreview.fade(cfg.COL_CYAN, 0.5)) == signed(C(255, 158, 238, 248)),
  '④10 模块 fade 与手算值一致（真机 MS.fade 同算法）', hex(vpreview.fade(cfg.COL_CYAN, 0.5)))

-- ======================================================================
-- ⑤ 3 画布 × 2 设备：lint 0 / audit 0
-- ======================================================================
print('--- ⑤ 3 画布 × 2 设备 ---')
local CANVASES = { { 1600, 900 }, { 1280, 720 }, { 1280, 960 } }
local DEVICES = { 'pc', 'mobile' }
local combos = 0
for ci = 1, #CANVASES do
  for di = 1, #DEVICES do
    combos = combos + 1
    local canvas, device = CANVASES[ci], DEVICES[di]
    local tag = device .. '-' .. canvas[1] .. 'x' .. canvas[2]
    local list = {}
    local function push(t) for i = 1, #t do list[#list + 1] = t[i] end end
    push(S.next(optOf({ canvas = canvas, device = device }, { queue = { 'I', 'T' } })))
    push(S.hold(optOf({ canvas = canvas, device = device }, { holdName = 'O', canHold = true })))
    local lintIssues = V.lint(list)
    ok(#lintIssues == 0, '⑤' .. combos .. 'a ' .. tag .. ' lint 0 issue',
      #lintIssues > 0 and (lintIssues[1].code .. ':' .. lintIssues[1].msg) or nil)
    local auditIssues = S.audit(list, canvas)
    ok(#auditIssues == 0, '⑤' .. combos .. 'b ' .. tag .. ' audit 0 issue',
      #auditIssues > 0 and (auditIssues[1].code .. ':' .. auditIssues[1].msg) or nil)
  end
end
ok(combos == 6, '⑤7 覆盖 3 画布 × 2 设备 = 6 组', combos)

-- ⑤8 手机双持：CX = gutR = halfW-103（ui.lua:352），标签与格子同源
do
  local dual = { canvas = { 1280, 720 }, device = 'mobile', dual = true }
  local nodes = S.next(optOf(dual, { queue = { 'I' } }))
  local lab = findKey(nodes, 'pvNextLabel')
  -- 537+240/2 = 657 > 640 ⇒ 标签必须停靠（现网 ui.lua:356 同结论，main.lua:3427 又写回来）
  ok(lab.pos[1] == -4000 and lab.pos[2] == -4000 and lab.parked == true,
    '⑤8 手机双持「下一个」停靠（留在 537 会出界 17px）', lab.pos[1])
  local cells = nodesOf('nextCell', nodes)
  local cxOfCells = cells[1].pos[1] - (cfg.SHAPES.I.cells[1][2] - 2.5) * 20
  ok(cxOfCells == 537, '⑤9 手机双持格子中心 = gutR = 537（ui.lua:352）', cxOfCells)
  ok(#S.audit(nodes, dual.canvas) == 0, '⑤10 手机双持 audit 0')
  -- 反证：同一画布上把标签放回 gutR 就必须被 audit 抓出来
  local bad = clone(nodes)
  for i = 1, #bad do
    if bad[i].key == 'pvNextLabel' then bad[i].pos = { 537, 255 } bad[i].parked = nil end
  end
  ok(hasIssue(S.audit(bad, dual.canvas), 'P1', 'pvNextLabel'),
    '⑤11 标签留在 537 时 audit 报越界（停靠不是拍脑袋）')
end

-- ⑤11 PC 单持读数：1600 ⇒ 570；1280 ⇒ 410（用例 15/16 断言的绝对 x 口径）
do
  local a = findKey(S.next(optOf({ canvas = { 1600, 900 }, device = 'pc' }, { queue = { 'I' } })), 'pvNextLabel')
  local b = findKey(S.next(optOf({ canvas = { 1280, 720 }, device = 'pc' }, { queue = { 'I' } })), 'pvNextLabel')
  ok(a.pos[1] == 570 and b.pos[1] == 410, '⑤11 PC 单持 CX = halfW-230（1600⇒570、1280⇒410）',
    a.pos[1] .. '/' .. b.pos[1])
end

-- ======================================================================
-- ⑥ 负样本：检查本身必须抓得住
-- ======================================================================
print('--- ⑥ 负样本 ---')
do
  -- ⑥1 把某格挪到画布外 ⇒ 必须报越界
  local list = S.next(optOf(PC, { queue = { 'I' } }))
  local bad = clone(list)
  for i = 1, #bad do
    if bad[i].key == 'pvNext1C2' then bad[i].pos = { 99999, 0 } end
  end
  local issues = S.audit(bad, { 1600, 900 })
  local got, msg = hasIssue(issues, 'P1', 'pvNext1C2')
  ok(got, '⑥1 画布外的格被报 P1 越界', msg or ('issues=' .. #issues))
end

do
  -- ⑥2 画布太小（400×300）⇒ 正常描述也会越界（标签 y=255 超出 ±150）
  local list = S.next(optOf({ canvas = { 400, 300 }, device = 'pc' }, { queue = { 'I', 'T' } }))
  local issues = S.audit(list, { 400, 300 })
  local got, msg = hasIssue(issues, 'P1', 'pvNextLabel')
  ok(got, '⑥3 画布过矮 ⇒ 标签被报 P1 越界', msg or ('issues=' .. #issues))
  ok(#issuesOf(issues, 'P1') >= 2, '⑥4 同时抓到格子越界（共 ' .. #issuesOf(issues, 'P1') .. ' 条 P1）')
end

do
  -- ⑥5 NaN 坐标 ⇒ P2
  local list = S.next(optOf(PC, { queue = { 'I' } }))
  local bad = clone(list)
  for i = 1, #bad do
    if bad[i].key == 'pvNext1C1' then bad[i].pos = { 0 / 0, 0 } end
  end
  local got, msg = hasIssue(S.audit(bad, { 1600, 900 }), 'P2', 'pvNext1C1')
  ok(got, '⑥5 NaN 坐标被报 P2', msg)
end

do
  -- ⑥6 两格叠在同一点 ⇒ P3
  local list = S.next(optOf(PC, { queue = { 'I' } }))
  local bad = clone(list)
  local ref = nil
  for i = 1, #bad do
    if bad[i].key == 'pvNext1C1' then ref = bad[i].pos end
    if bad[i].key == 'pvNext1C2' then bad[i].pos = { ref[1], ref[2] } end
  end
  local got, msg = hasIssue(S.audit(bad, { 1600, 900 }), 'P3', 'pvNext1C1')
  ok(got, '⑥6 同槽两格重叠被报 P3', msg)
end

do
  -- ⑥7 框高不足 ⇒ view_node.lint 报 L4（文字会被裁）
  local lab = clone(findKey(S.next(optOf(PC, { queue = { 'I' } })), 'pvNextLabel'))
  lab.size = { 240, 20 }
  local got, msg = hasIssue(V.lint({ lab }), 'L4', 'pvNextLabel')
  ok(got, '⑥7 框高不足（20 < 35.9）被报 L4', msg)
end

do
  -- ⑥8 停靠白名单：空槽 4 格在极小画布上也不该被报越界（否则负样本全是假阳性）；
  --     但同一张画布上的标签该报还得报 —— 证明白名单只放行停靠位，不放行"整类节点"
  local list = S.hold(optOf({ canvas = { 400, 300 }, device = 'pc' }, { holdName = nil, canHold = true }))
  local issues = S.audit(list, { 400, 300 })
  local parkedReported = 0
  for i = 1, #issues do
    if issues[i].code == 'P1' and issues[i].key:match('^pvHoldC') then parkedReported = parkedReported + 1 end
  end
  ok(parkedReported == 0, '⑥8 停靠格不进越界判定（白名单生效）', parkedReported)
  ok(hasIssue(issues, 'P1', 'pvHoldLabel'), '⑥9 同一张画布上的标签仍被报（白名单不放大）')
end

do
  -- ⑥9 干净描述 0 issue（正样本对照）
  local list = {}
  local function push(t) for i = 1, #t do list[#list + 1] = t[i] end end
  push(S.next(optOf(PC, { queue = { 'I', 'T' } })))
  push(S.hold(optOf(PC, { holdName = 'O', canHold = true })))
  ok(#S.audit(list, { 1600, 900 }) == 0, '⑥10 干净描述 audit 0 issue')
end

-- ======================================================================
-- ⑦ 源码级约束：不 require / 不 print / 零全局 / 行数
-- ======================================================================
print('--- ⑦ 源码约束 ---')
do
  local src = assert(io.open(ROOT .. '/lua/tetris/view_preview.lua', 'r')):read('a')
  -- 先去注释（块注释 + 行注释），否则头注释里的「不 require / 不 print」会自己撞红
  local body = src:gsub('%-%-%[%[.-%]%]', '')
  local lines = {}
  for line in (body .. '\n'):gmatch('([^\n]*)\n') do lines[#lines + 1] = (line:gsub('%-%-.*$', '')) end
  local code = table.concat(lines, '\n')

  ok(not code:find('require'), '⑦1 模块不 require 任何其它模块')
  ok(not code:find('print%s*%('), '⑦2 模块不 print')
  ok(not code:find('_G'), '⑦3 模块不碰 _G')
  local globals = {}
  for line in code:gmatch('[^\n]+') do
    -- 只认**行首**（无缩进）的赋值：表构造里的 `key = value` 是字段，不是全局
    local name = line:match('^([%a_][%w_]*)%s*=[^=]')
    if name and name ~= 'M' and name ~= 'local' then globals[#globals + 1] = name end
  end
  ok(#globals == 0, '⑦4 无全局赋值（行首只出现 M.* / local）', table.concat(globals, ','))

  local nlines = 1
  for _ in src:gmatch('\n') do nlines = nlines + 1 end
  ok(nlines > 150 and nlines < 420, '⑦5 模块行数 ' .. nlines .. '（150..420 区间）', nlines)

  ok(type(vpreview.new) == 'function' and type(S.next) == 'function'
    and type(S.hold) == 'function' and type(S.audit) == 'function',
    '⑦6 契约齐：M.new / S.next / S.hold / S.audit')
  ok(type(vpreview.GEO) == 'table' and vpreview.GEO.pitch1 == 20
    and vpreview.GEO.cell1 == 18 and vpreview.GEO.parkX == -4000,
    '⑦7 几何常量对外可读（GEO.pitch1/cell1/parkX）')
  ok(#leaked == 0, '⑦8 加载后零全局泄漏', table.concat(leaked, ','))
end

-- ======================================================================
-- ⑧ 真通道：描述 → render → mock 引擎（0 issue / 增量 / 字段落地）
-- ======================================================================
print('--- ⑧ mock 引擎通道 ---')
do
  local P = platform.new {
    mock = true, canvas = { 1600, 900 }, logSink = function() end,
    templates = { cell = { kind = 'image' }, stext = { kind = 'text' }, hit = { kind = 'cursor' } },
  }
  local R = renderM.new { platform = P, layers = layers }
  local list = {}
  local function push(t) for i = 1, #t do list[#list + 1] = t[i] end end
  push(S.next(optOf(PC, { queue = { 'I', 'T' } })))
  push(S.hold(optOf(PC, { holdName = nil, canHold = true })))
  R.apply(list)
  ok(#R.issues() == 0, '⑧1 render 0 issue（无 R0/R1/R2）',
    #R.issues() > 0 and R.issues()[1].msg or nil)
  ok(P.stats().inst == #list, '⑧2 实例数 = 节点数（' .. #list .. '）', P.stats().inst)
  ok(P.stats().fails == 0, '⑧3 引擎调用 0 失败', P.stats().fails)

  local ctl = R.get('pvNext1C1')
  ok(ctl and ctl.anchoredPositionX == 540 and ctl.anchoredPositionY == 160,
    '⑧4 I 首格落到控件 (540,160)', ctl and (ctl.anchoredPositionX .. ',' .. ctl.anchoredPositionY))
  ok(ctl and signed(ctl.imageColor) == signed(cfg.SHAPES.I.color), '⑧5 控件 imageColor = 方块色',
    ctl and hex(ctl.imageColor))

  local lab = R.get('pvNextLabel')
  ok(lab and lab.text == '下一个' and lab.fontSize == 22
    and signed(lab.fontColor) == signed(cfg.THEME.textSub),
    '⑧6 标签 text/fontSize/fontColor 落到控件')

  local hc = R.get('pvHoldC1')
  ok(hc and hc.anchoredPositionX == -4000 and hc.anchoredPositionY == -4000
    and signed(hc.imageColor) == signed(cfg.COL_BG),
    '⑧7 空槽格停在 (-4000,-4000) 且为 COL_BG（现网 A13 脏格的根因就此消失）')

  local before = P.stats().inst
  R.apply(list)
  ok(P.stats().inst == before, '⑧8 二次 apply 不重建（键稳定 + 增量通道）', P.stats().inst - before)
  ok(R.stats().created == #list, '⑧9 只创建了一次（created=' .. R.stats().created .. '）', R.stats().created)
end

-- ===== 汇总 =====
print(string.format('\n== view_preview_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
