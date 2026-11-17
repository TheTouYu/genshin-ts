--[[==========================================================================
 tests-lua/bg_cover_test.lua —— 背景铺满：数据不变量 + 运行时判据不许被 wash 掩盖
 跑法：cd <root> && lua5.3 tests-lua/bg_cover_test.lua

 为什么要有这份（2026-11-17 复盘 + 用户「背景没完整覆盖」反馈）：
   ① 背景构图是一张**数据表**（cfg.MODE_BG：{x,y,w,h,rot…}），它既不进 view_node.lint
      （描述层节点表）也不进 ui_plan_test 的 lintPlan（布局表）——**没有任何判据看着它**。
   ② 运行时那条 `bg cover ok/GAP` 把**整屏 wash** 也算进外缘，wash 恒盖满 ⇒ 判据恒真（假绿）。
      真机 `bg cover ok` 一路绿灯而用户看到两侧露白，就是这么来的。
      ⇒ 本文件第四段用 stub 宿主直接跑 bgApply，断言：**wash 在、构图空 ⇒ 必须报 GAP**。

 四段（前三段查数据，第四段查行为）：
   一、C1 设计板覆盖：4 模式图元并集 ⊇ [-640,640]×[-360,360]（框架 V.lintCover）
   二、跨画布证明：bs=max(W/1280,H/720) 下外缘 ≥ 画布半宽/半高（含真机 2030×900）
   三、负样本：删一条边沿图元 / 空表 / 缺数值 / rot 非数 ⇒ 判据必须红（变异测试）
   四、行为：构图空 ⇒ `bg cover GAP`；构图齐 ⇒ `bg cover ok`；锚点不可用 ⇒ `wash=px`
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(p) return assert(loadfile(ROOT .. '/' .. p))() end

local CFG = load('lua/tetris/config.lua')
local UIM = load('lua/tetris/ui.lua')
local VNODE = load('lua/tetris/view_node.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local BASE_W, BASE_H = 1280, 720
local MODES = { 'casual', 'ai-battle', 'pvp', 'coop' }
-- 含真机实测画布 2030×900（3440×1440 屏幕按 0.625 缩放后报给 Lua 的数）
local CANVASES = { { 1600, 900 }, { 1280, 720 }, { 1560, 720 }, { 2100, 900 },
                   { 1280, 960 }, { 2030, 900 } }

assert(type(VNODE.lintCover) == 'function', 'view_node.lintCover 缺失（框架层没同步过来）')
assert(type(VNODE.rectAABB) == 'function', 'view_node.rectAABB 缺失')

-- ===== 一、C1 设计板覆盖（4 模式）=====
local exts = {}
for _, mode in ipairs(MODES) do
  local items = CFG.MODE_BG[mode]
  assert(type(items) == 'table', 'cfg.MODE_BG.' .. mode .. ' 不是表')
  local issues, ext = VNODE.lintCover(items, { baseW = BASE_W, baseH = BASE_H })
  exts[mode] = ext
  local first = issues[1]
  ok(#issues == 0, string.format('C1 设计板覆盖 mode=%s 图元=%d ext=%.0f,%.0f,%.0f,%.0f',
    mode, ext.n, ext.L, ext.R, ext.B, ext.T), first and (first.code .. ' ' .. first.msg))
end

-- ===== 二、跨画布证明（cover 缩放后必然盖满；与画布尺寸无关）=====
for _, mode in ipairs(MODES) do
  local ext = exts[mode]
  local bad = nil
  for _, cv in ipairs(CANVASES) do
    local W, H = cv[1], cv[2]
    local bs = math.max(W / BASE_W, H / BASE_H)
    local needX, needY = W / 2, H / 2
    local okL = ext.L * bs <= -needX + 0.5
    local okR = ext.R * bs >= needX - 0.5
    local okB = ext.B * bs <= -needY + 0.5
    local okT = ext.T * bs >= needY - 0.5
    if not (okL and okR and okB and okT) then
      bad = string.format('%dx%d bs=%.3f 像素外缘=%.0f,%.0f,%.0f,%.0f 需 %.0f/%.0f',
        W, H, bs, ext.L * bs, ext.R * bs, ext.B * bs, ext.T * bs, needX, needY)
      break
    end
  end
  ok(bad == nil, 'C1′ ' .. mode .. ' 在 ' .. #CANVASES .. ' 张画布上 cover 后四边 0 缺口', bad)
end

-- ===== 三、负样本（判据必须能红）=====
local good = CFG.MODE_BG.casual
-- 3a 删掉**所有**上边沿图元（到达 y>360 的那几条；构图在上方是有冗余的，
--    只删一条不足以打穿——这本身就是判据健康的证据，所以变异要打穿整条边）
local function copyWithoutTop()
  local out = {}
  for i = 1, #good do
    local y1 = select(4, VNODE.rectAABB(good[i].x, good[i].y, good[i].w, good[i].h, good[i].rot))
    if y1 <= 360 then out[#out + 1] = good[i] end
  end
  return out
end
local is1 = VNODE.lintCover(copyWithoutTop(), { baseW = BASE_W, baseH = BASE_H })
ok(#is1 >= 1 and is1[1].code == 'C1', 'C1 负样本：删光上边沿图元 ⇒ 必须报 C1（上缺）',
  is1[1] and is1[1].msg)
-- 3b 空表
local is2 = VNODE.lintCover({}, { baseW = BASE_W, baseH = BASE_H })
ok(#is2 == 1 and is2[1].code == 'C1', 'C1 负样本：空构图 ⇒ 必须报 C1', is2[1] and is2[1].msg)
-- 3c 缺数值（w=nil 会让 SetSizeDelta 静默拿到 0）
local is3 = VNODE.lintCover({ { x = 0, y = 0, h = 10 } }, { baseW = BASE_W, baseH = BASE_H })
ok(#is3 >= 1 and is3[1].code == 'C2', 'C2 负样本：缺 w ⇒ 必须报 C2', is3[1] and is3[1].msg)
-- 3d rot 非数值（真机 SetLocalRotation 三参会抛）
local is4 = VNODE.lintCover({ { x = 0, y = 0, w = 10, h = 10, rot = 'a' } }, { baseW = BASE_W, baseH = BASE_H })
ok(#is4 >= 1 and is4[1].code == 'C3', 'C3 负样本：rot 非数值 ⇒ 必须报 C3', is4[1] and is4[1].msg)

-- ===== 四、行为层：wash 不许掩盖构图缺口 =====
-- stub 宿主：控件只记录调用；fill 的返回值模拟"宿主认/不认锚点"两种真机
local function stubWidgets(fillOK)
  local calls = {}
  local tryCall = function(ctl, method, a, b)
    calls[#calls + 1] = method
    if ctl and ctl.methods then ctl.methods[#ctl.methods + 1] = method end
    return true
  end
  return {
    trySet = function() return true end,
    tryCall = tryCall,
    addCursor = function() return true end,
    fill = function() return fillOK end,
  }, calls
end
local function capture(fn)
  local buf = {}
  local real = print
  print = function(s) buf[#buf + 1] = tostring(s) end
  local okRun, err = pcall(fn)
  print = real
  if not okRun then error(err) end
  return table.concat(buf, '\n')
end
local function stubUI(bgItems, fillOK)
  local WID = stubWidgets(fillOK)
  local pool = {}
  for i = 1, #bgItems + 1 do pool[i] = {} end   -- [1]=wash，其余是构图槽（槽位要与条目数匹配）
  return UIM.new {
    game = {}, cfg = { NUM = { BG_BASE_W = BASE_W, BG_BASE_H = BASE_H },
                       MODE_THEME = { casual = { bg = 0xFF000000, plate = 0xFF000000, frame = 0xFF000000 } },
                       MODE_BG = { casual = bgItems }, THEME = { textMain = 0xFF000000 } },
    widgets = WID, canvas = function() return 1280, 720 end,
    mobile = function() return false end,
    pool = function() return pool end,
    aabb = VNODE.rectAABB,
  }
end

-- 4a 构图空 + wash 在 ⇒ 必须 GAP（这正是旧判据会打印 ok 的场景）
local Ua = stubUI({}, true)
local outA = capture(function() Ua.bgApply('casual', 'title') end)
ok(outA:find('bg cover GAP', 1, true) ~= nil,
  'C4 构图空 + wash 铺满 ⇒ 仍必须报 GAP（wash 不得掩盖缺口）', outA)
ok(outA:find('wash=stretch', 1, true) ~= nil, 'C4 锚点生效时日志须标 wash=stretch', outA)

-- 4b 构图齐 ⇒ ok，且 comps=N/N
local Ub = stubUI(CFG.MODE_BG.casual, true)
local outB = capture(function() Ub.bgApply('casual', 'title') end)
ok(outB:find('bg cover ok', 1, true) ~= nil, 'C4 构图齐 + wash 铺满 ⇒ ok', outB)
ok(outB:find(string.format('comps=%d/%d', #CFG.MODE_BG.casual, #CFG.MODE_BG.casual), 1, true) ~= nil,
  'C4 ok 行必须带 comps=N/N（N=构图条目数）', outB)

-- 4c 宿主不认锚点 ⇒ 回落像素尺寸，且日志必须暴露（wash=px），不许静默
local Uc = stubUI(CFG.MODE_BG.casual, false)
local outC = capture(function() Uc.bgApply('casual', 'title') end)
ok(outC:find('wash=px', 1, true) ~= nil, 'C4 锚点不可用 ⇒ 回落像素尺寸并记 wash=px', outC)

print(string.format('\n%d passed, %d failed', pass, fail))
if fail > 0 then os.exit(1) end
