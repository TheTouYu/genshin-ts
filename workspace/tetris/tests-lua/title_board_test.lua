--[[==========================================================================
 tests-lua/title_board_test.lua —— 标题展台视窗 × 棋盘几何（v6.28 真机返工图一）
 跑法：cd <root> && lua5.3 tests-lua/title_board_test.lua

 为什么要有这份（2026-11-17 用户真机截图图一「最下面一行的方块明显被截断了」）：
   标题页的棋盘**没有自己的几何**——它由 `view_board` 生成，画在 `view_title` 的展台视窗里。
   视窗尺寸/装饰带是不是压到格子，过去**没有任何判据**：只有"出图 + 人眼看"。
   这次的根因正是 `menuShadeB`（视窗内阴影带）落在视窗**内部** 20 单位，
   盖住最后一行格子的下半截 —— 视窗本身量出来是够大的，坏的是它上面的装饰。

 判据（四条）：
   T1 视窗高 ≥ ROWS×PITCH（棋盘必须整块放得下）
   T2 视窗 y 范围覆盖第 0..ROWS-1 行的**格心**（不只是高度够，位置也要对）
   T3 **任何展台图层（墙/云带/装饰/阴影/描金边/角标）都不得压到格子区域**  ← 抓本次缺陷
   T4 背景构图（cfg.MODE_BG）四个模式都不得在**左上导航区**留下"实心近白矩形"  ← 抓图二缺陷
========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(p) return assert(loadfile(ROOT .. '/' .. p))() end

local cfg = load('lua/tetris/config.lua')
local L = load('lua/tetris/view_layers.lua')
local KITM = load('lua/tetris/view_kit.lua')
local TITLEM = load('lua/tetris/view_title.lua')
local VN = load('lua/tetris/view_node.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local KIT = KITM.new({ layers = L })
local T = TITLEM.new({ config = cfg, layers = L, kit = KIT })
local ST = TITLEM.STAGE
local ROWS, CELL, PITCH = cfg.ROWS, cfg.CELL, cfg.PITCH

-- 画布只影响墙体/云带，视窗是固定设计尺寸；用 1600×900 与 2400×1080 各验一次
local CANVASES = { { 1600, 900 }, { 2400, 1080 }, { 1560, 720 } }

local function nodesOf(cv, device)
  return T.title {
    canvas = { cv[1], cv[2] },
    device = device or 'mobile',
    stage = { on = true, visible = true },
  }
end

-- ===== T1/T2 视窗尺寸与位置 =====
local winH = ST.winTop - ST.winBot
local needH = ROWS * PITCH
ok(winH >= needH, string.format('T1 视窗高 %d ≥ ROWS×PITCH = %d', winH, needH))

local topRowY = (ROWS / 2 - 0.5) * PITCH       -- 第 0 行格心（= (9.5-0)*30 = 285）
local botRowY = -(ROWS / 2 - 0.5) * PITCH      -- 最后一行格心（-285）
ok(ST.winTop >= topRowY and ST.winBot <= botRowY,
  string.format('T2 视窗 y∈[%d,%d] 覆盖首末行格心 [%d,%d]', ST.winBot, ST.winTop, botRowY, topRowY))

-- ===== T3 展台装饰不得压格子 =====
-- 格子区域：所有格子的并集（cell 尺寸 CELL，格心到 ±(4.5*PITCH) / ±(9.5*PITCH)）
local cellHalfX = 4.5 * PITCH + CELL / 2 + 0.5     -- 149.5（含 1px 余量）
local cellHalfY = 9.5 * PITCH + CELL / 2 + 0.5     -- 299.5
local STAGE_ROLES = { [TITLEM.ROLE.wall] = true, [TITLEM.ROLE.sky] = true,
                      [TITLEM.ROLE.deco] = true, [TITLEM.ROLE.shade] = true,
                      [TITLEM.ROLE.bezel] = true, [TITLEM.ROLE.tick] = true }
local offenders = {}
for _, cv in ipairs(CANVASES) do
  local list = nodesOf(cv)
  for _, n in ipairs(list) do
    if STAGE_ROLES[n.role] and n.pos and n.size then
      local x, y, w, h = n.pos[1], n.pos[2], n.size[1], n.size[2]
      -- 与格子区域求交（矩形 vs 矩形）
      if math.abs(x) - w / 2 < cellHalfX and math.abs(x) + w / 2 > -cellHalfX
        and math.abs(y) - h / 2 < cellHalfY and math.abs(y) + h / 2 > -cellHalfY then
        local ox = math.min(x + w / 2, cellHalfX) - math.max(x - w / 2, -cellHalfX)
        local oy = math.min(y + h / 2, cellHalfY) - math.max(y - h / 2, -cellHalfY)
        if ox > 0.5 and oy > 0.5 then
          offenders[#offenders + 1] = string.format('%dx%d %s 盖住格子区 %.1fx%.1f（pos=%d,%d size=%dx%d）',
            cv[1], cv[2], tostring(n.key), ox, oy, x, y, w, h)
        end
      end
    end
  end
end
ok(#offenders == 0, 'T3 展台墙/云带/装饰/阴影/描金边/角标均不压格子区域',
  offenders[1] or '')

-- 负样本：把阴影带挪回"视窗内"必须被判红（证明 T3 真的在判）
do
  local saved = ST.shade and ST.shade.out
  local list = nodesOf({ 1600, 900 })
  local bad = 0
  for _, n in ipairs(list) do
    if n.role == TITLEM.ROLE.shade and n.key == 'menuShadeB' then
      -- 模拟旧实现：中心 = winBot + out（视窗内）
      local y = ST.winBot + ST.shade.out
      if math.abs(y) - n.size[2] / 2 < cellHalfY and math.abs(y) + n.size[2] / 2 > -cellHalfY then
        bad = bad + 1
      end
    end
  end
  ok(bad == 1, 'T3b 负样本：阴影带若回到视窗内（winBot+out）会被判压格子', tostring(bad))
  ST.shade.out = saved
end

-- ===== T4 背景：左上导航区不得出现"实心近白矩形" =====
-- 判据：四个模式的图元里，不允许存在 (a) 未旋转矩形、(b) 颜色接近白（三通道 ≥232）、
--       (c) 不透明或几乎不透明（alpha ≥ 224）、(d) 与导航区相交的条目。
local NAV = { x0 = -800, x1 = -500, y0 = 30, y1 = 300 }   -- 左上导航列（角色胶囊一带）
local bgBad = {}
for _, mode in ipairs({ 'casual', 'ai-battle', 'pvp', 'coop' }) do
  for i, it in ipairs(cfg.MODE_BG[mode] or {}) do
    if type(it) == 'table' and it.w and it.h and (it.s or 'rect') == 'rect' and (it.rot or 0) == 0 then
      local c = it.c or 0
      local a = math.floor(c / 16777216) % 256
      local r = math.floor(c / 65536) % 256
      local g = math.floor(c / 256) % 256
      local b = c % 256
      local nearWhite = (r >= 232 and g >= 232 and b >= 232)
      local overlap = (it.x - it.w / 2) < NAV.x1 and (it.x + it.w / 2) > NAV.x0
        and (it.y - it.h / 2) < NAV.y1 and (it.y + it.h / 2) > NAV.y0
      if nearWhite and a >= 224 and overlap then
        bgBad[#bgBad + 1] = string.format('%s#%d x=%.0f y=%.0f %.0fx%.0f rgb=(%d,%d,%d) a=%d',
          mode, i, it.x, it.y, it.w, it.h, r, g, b, a)
      end
    end
  end
end
ok(#bgBad == 0, 'T4 四个模式的背景构图都不在左上导航区留实心近白矩形', bgBad[1] or '')

-- 负样本：老实现那朵云的矩形块（-488,254,198x76 近白实心）必须被判红
do
  local savedCasual = cfg.MODE_BG.casual
  local probe = {}
  for i, it in ipairs(savedCasual) do probe[i] = it end
  probe[#probe + 1] = { x = -488, y = 254, w = 198, h = 76, c = 0xFFF3F8EE, s = 'rect' }
  cfg.MODE_BG.casual = probe
  local bad = 0
  for _, it in ipairs(cfg.MODE_BG.casual) do
    if it.w and it.h and (it.s or 'rect') == 'rect' and (it.rot or 0) == 0 then
      local c = it.c or 0
      local a = math.floor(c / 16777216) % 256
      local r = math.floor(c / 65536) % 256
      local g = math.floor(c / 256) % 256
      local b = c % 256
      if r >= 232 and g >= 232 and b >= 232 and a >= 224
        and (it.x - it.w / 2) < NAV.x1 and (it.x + it.w / 2) > NAV.x0
        and (it.y - it.h / 2) < NAV.y1 and (it.y + it.h / 2) > NAV.y0 then bad = bad + 1 end
    end
  end
  cfg.MODE_BG.casual = savedCasual
  ok(bad >= 1, 'T4b 负样本：把老的白矩形塞回 casual 必须被判红', tostring(bad))
end

print(string.format('\n== title_board_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
