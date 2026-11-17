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
-- v6.30 新增（用户：「移动端箭头左右反了」「按钮被画布边缘切掉」）：
-- 触屏槽位（slots）与导航键（nav）**必须整体落在画布内**，且同一行两键不得重叠。
-- lintPlan 只看文字表，槽位从来没被任何判据看过——本轮两起缺陷都落在它身上。
local slotBad, slotWorst = 0, nil
local overlapBad, overlapWorst = 0, nil
local arrowBad, arrowWorst = 0, nil   -- ◀ 必须在 ▶ 左边：统计**违规**数（0 才算过）
local arrowChecked = 0

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
      -- 槽位在画布内
      for _, b in ipairs(p.slots or {}) do
        local over = math.max(0, math.abs(b.x) + b.w / 2 - W / 2) + math.max(0, math.abs(b.y) + b.h / 2 - H / 2)
        if over > 0.5 then
          slotBad = slotBad + 1
          slotWorst = slotWorst or string.format('%s slot=%s 出画布 %.0fpx (x=%.0f y=%.0f w=%.0f)', tag, tostring(b.id), over, b.x, b.y, b.w)
        end
      end
      -- 同一行两键不得重叠（左右两列）
      local byRow = {}
      for _, b in ipairs(p.slots or {}) do
        local k = math.floor((b.y or 0) / 10)
        byRow[k] = byRow[k] or {}
        table.insert(byRow[k], b)
      end
      for _, row in pairs(byRow) do
        for i = 1, #row do
          for j = i + 1, #row do
            local a, b2 = row[i], row[j]
            local ox = math.min(a.x + a.w / 2, b2.x + b2.w / 2) - math.max(a.x - a.w / 2, b2.x - b2.w / 2)
            if ox > 1 then
              overlapBad = overlapBad + 1
              overlapWorst = overlapWorst or string.format('%s %s∩%s 重叠 %.0fpx', tag, tostring(a.id), tostring(b2.id), ox)
            end
          end
        end
      end
      -- 方向键语义：◀ 必须比 ▶ 更靠左
      local L, R
      for _, b in ipairs(p.slots or {}) do
        if b.id == 'left' then L = b end
        if b.id == 'right' then R = b end
      end
      if L and R then
        arrowChecked = arrowChecked + 1
        if not (R.x > L.x) then
          arrowBad = arrowBad + 1
          arrowWorst = arrowWorst or string.format('%s ◀x=%.0f ▶x=%.0f', tag, L.x, R.x)
        end
      end
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

ok(slotBad == 0, 'S1 触屏槽位必须整体落在画布内（v6.30 箭头被边缘切掉的守卫）', slotWorst)
ok(overlapBad == 0, 'S2 同一行两键不得重叠（v6.30 按钮互压的守卫）', overlapWorst)
ok(arrowBad == 0 and arrowChecked > 0,
  string.format('S3 ◀ 必须在 ▶ 左边（%d 组检查，0 违规）', arrowChecked), arrowWorst)

print(string.format('\n== ui_plan_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
