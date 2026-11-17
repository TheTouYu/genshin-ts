--[[==========================================================================
 tests-lua/ui_plan_test.lua —— 布局层（ui.lua 的 U.plan）的静态判据
 跑法：cd <root> && lua5.3 tests-lua/ui_plan_test.lua

 为什么要有这份（2026-11-17 复盘发现的框架空白）：
   `view_node.lint` 的 L1–L6 全部作用于 **view_* 描述层的节点表**，
   而 `ui.lua` 的 `U.plan`（**对局屏 / 双盘屏的布局**）在 tests-lua 里**零引用**。
   四起真机事故里，#1（双盘横幅位置）恰好就发生在这一层，且当时没有任何判据。

 本测试补的是"布局表的**结构**判据"，不涉及渲染：
   P1 同一屏内控件名唯一（GetChild 按名寻址会歧义）
   P2 **两条文字不得占用同一个矩形**（v6.18 实测：ibotBanner 与 ihint 同为 ty=-452，
      出图是一团花字；这类叠印靠人眼发现太晚）
   P3 文字框高必须 ≥ 1.45×字号+4（引擎判据；不足则**整条一个字都不画**）
   P4 除显式停靠（y=-4000）外，矩形必须落在画布内
   P5 条目必须带完整数值（x/y/w/h），nil 会在 center() 里炸
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(p) return assert(loadfile(ROOT .. '/' .. p))() end

local CFG = load('lua/tetris/config.lua')
local UIM = load('lua/tetris/ui.lua')
-- v7.1：判据已上移进框架层（view_node.lintPlan）——本文件只剩"跑矩阵 + 断言零违规"。
-- 两个入口别混：V.lint 查**节点表**（view_* 描述），V.lintPlan 查**布局表**（ui.lua 的 U.plan）。
local VNODE = load('lua/tetris/view_node.lua')
assert(type(VNODE.lintPlan) == 'function', 'view_node.lintPlan 缺失（框架层判据没上移成功）')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local PARKED_Y = -4000
local CANVASES = { { 1600, 900, 'pc' }, { 1280, 720, 'mobile' }, { 1280, 960, 'mobile' }, { 1560, 720, 'mobile' } }
local SCREENS = { 'title', 'game', 'settle' }

local totalIssues = { P1 = 0, P2 = 0, P3 = 0, P4 = 0, P5 = 0 }
local samples = {}

for _, cv in ipairs(CANVASES) do
  local W, H, dev = cv[1], cv[2], cv[3]
  for _, dual in ipairs({ false, true }) do
    -- 双盘只在 game 屏有意义
    for _, screen in ipairs(SCREENS) do
      local useDual = dual and (screen == 'game')
      local U = UIM.new {
        game = {}, cfg = CFG, widgets = {}, layers = {},
        canvas = function() return W, H end,
        mobile = function() return dev == 'mobile' end,
        device = function() return dev end,
        log = function() end,
      }
      local p = U.plan(screen, useDual, false)
      local tag = string.format('%s %dx%d %s', screen, W, H, useDual and 'dual' or 'single')
      local issues = VNODE.lintPlan(p, { canvas = { W, H }, parkedY = PARKED_Y })
      for _, it in ipairs(issues) do
        totalIssues[it.code] = (totalIssues[it.code] or 0) + 1
        samples[it.code] = samples[it.code] or (tag .. ' ' .. tostring(it.key) .. ': ' .. tostring(it.msg))
      end
    end
  end
end

ok(totalIssues.P1 == 0, 'P1 同屏控件名唯一', samples.P1)
ok(totalIssues.P2 == 0, 'P2 两条文字不得占用同一矩形（叠印）', samples.P2)
ok(totalIssues.P3 == 0, 'P3 文字框高 ≥ 1.45×字号+4（否则整条不画）', samples.P3)
ok(totalIssues.P4 == 0, 'P4 未停靠的矩形必须落在画布内', samples.P4)
ok(totalIssues.P5 == 0, 'P5 条目必须带完整数值', samples.P5)

print(string.format('\n== ui_plan_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
