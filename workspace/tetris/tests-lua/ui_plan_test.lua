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

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local PARKED_Y = -4000
local CANVASES = { { 1600, 900, 'pc' }, { 1280, 720, 'mobile' }, { 1280, 960, 'mobile' }, { 1560, 720, 'mobile' } }
local SCREENS = { 'title', 'game', 'settle' }

local function entryList(p)
  local out = {}
  for _, bucket in ipairs({ 'text', 'inst', 'skill' }) do
    for name, r in pairs(p[bucket] or {}) do
      out[#out + 1] = { name = name, r = r, bucket = bucket }
    end
  end
  return out
end

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
      local list = entryList(p)
      local tag = string.format('%s %dx%d %s', screen, W, H, useDual and 'dual' or 'single')

      -- P5 数值完整
      local badNum = {}
      for _, e in ipairs(list) do
        local r = e.r
        if type(r) ~= 'table' or type(r.x) ~= 'number' or type(r.y) ~= 'number'
          or type(r.w) ~= 'number' or type(r.h) ~= 'number' then
          badNum[#badNum + 1] = e.name
        end
      end
      if #badNum > 0 then
        totalIssues.P5 = totalIssues.P5 + #badNum
        samples.P5 = samples.P5 or (tag .. ': ' .. table.concat(badNum, ','))
      end

      -- P1 名字唯一（同一个名字不能同时在 text 与 inst 里代表不同矩形是允许的——它们是一对孪生份；
      -- 所以按 bucket 内判重）
      for _, bucket in ipairs({ 'text', 'inst', 'skill' }) do
        local seen = {}
        for name in pairs(p[bucket] or {}) do
          if seen[name] then
            totalIssues.P1 = totalIssues.P1 + 1
            samples.P1 = samples.P1 or (tag .. ':' .. bucket .. ':' .. name)
          end
          seen[name] = true
        end
      end

      -- P2 文字不可叠印（同一个 bucket 内，两条 rect 完全相同且都未停靠）
      local seenRect = {}
      for _, e in ipairs(list) do
        local r = e.r
        if type(r) == 'table' and r.y ~= PARKED_Y then
          local k = string.format('%s|%.1f|%.1f|%.1f|%.1f', e.bucket, r.x, r.y, r.w, r.h)
          if seenRect[k] then
            totalIssues.P2 = totalIssues.P2 + 1
            samples.P2 = samples.P2 or (tag .. ' ' .. e.bucket .. ': ' .. seenRect[k] .. ' ≡ ' .. e.name)
          else
            seenRect[k] = e.name
          end
        end
      end

      -- P3 框高够一行（引擎判据 1.45f+4；不足则整条不画）
      for _, e in ipairs(list) do
        local r = e.r
        if type(r) == 'table' and r.y ~= PARKED_Y and type(r.fs) == 'number' and type(r.h) == 'number' then
          local need = 1.45 * r.fs + 4
          if r.h + 0.01 < need then
            totalIssues.P3 = totalIssues.P3 + 1
            samples.P3 = samples.P3 or string.format('%s %s h=%.1f < 需 %.1f (fs=%d)', tag, e.name, r.h, need, r.fs)
          end
        end
      end

      -- P4 在画布内（停靠除外）
      for _, e in ipairs(list) do
        local r = e.r
        if type(r) == 'table' and r.y ~= PARKED_Y then
          local outX = (r.x - r.w / 2) < -W / 2 - 1 or (r.x + r.w / 2) > W / 2 + 1
          local outY = (r.y - r.h / 2) < -H / 2 - 1 or (r.y + r.h / 2) > H / 2 + 1
          if outX or outY then
            totalIssues.P4 = totalIssues.P4 + 1
            samples.P4 = samples.P4 or string.format('%s %s x=%.0f y=%.0f w=%.0f h=%.0f', tag, e.name, r.x, r.y, r.w, r.h)
          end
        end
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
