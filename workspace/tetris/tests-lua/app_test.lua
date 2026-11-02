--[[==========================================================================
 tests-lua/app_test.lua —— app（覆盖屏记账 + 基础层注册表）的 headless 验收
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/app_test.lua

 ⚠️ 2026-11-02 收缩：本文件的断言范围随 app 一起缩小。
 app **不再**驱动渲染（render/tick/frame/suspendBase 已删除）——原因见 app.lua 文件头：
 生产里 OnUpdate 的渲染调用是"状态写入的即时观察者"，散在条件分支里，
 无法归口到一个 tick。留着不执行的 API 只会误导下一个人。

 现在 app 只负责两件事，本文件就只证明这两件：
   A 构造契约：缺字段返回 nil（不 assert，一次报全）
   B 覆盖屏记账：开/关/换屏时用哪个 render 实例、先 clear 再 apply
   C 懒创建屏登记自己的实例（provideOverlay）
   D 基础层注册（且不与覆盖屏抢实例）
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local platformM = load('lua/tetris/platform.lua')
local layers = load('lua/tetris/view_layers.lua')
local renderM = load('lua/tetris/render.lua')
local scenesM = load('lua/tetris/scenes.lua')
local appM = load('lua/tetris/app.lua')

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

local logs = {}
local P = platformM.new {
  mock = true, canvas = { 1280, 720 },
  templates = { cell = { kind = 'image' }, hit = { kind = 'cursor' }, stext = { kind = 'text' } },
  logSink = function(m) logs[#logs + 1] = m end,
}

local function node(key, layer)
  return { key = key, layer = layer or 'card', tpl = 'cell', name = key,
    pos = { 0, 0 }, size = { 8, 8 }, color = 0 }
end

-- ===== A 构造：缺字段返回 nil（不抛错，一次报全）=====
local misses = {}
local okCall, A_nil = pcall(appM.new, { log = function(m) misses[#misses + 1] = m end })
ok(okCall, 'A1 缺字段时不抛错')
ok(A_nil == nil, 'A2 返回 nil，调用方走兜底分支')
local msg
for i = 1, #misses do if tostring(misses[i]):find('app missing', 1, true) then msg = misses[i] end end
ok(msg ~= nil, 'A3 打了一条 app missing 日志')
ok(msg and msg:find('platform', 1, true) and msg:find('render', 1, true)
  and msg:find('scenes', 1, true), 'A4 一次列出全部缺失字段', tostring(msg))

-- ===== B 覆盖屏记账 =====
local S = scenesM.new { log = function() end }
local RB = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local RO = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local A = appM.new { platform = P, render = RB, baseRender = RB,
  overlayRender = RO, scenes = S, layers = layers, log = function() end }
ok(A ~= nil, 'B1 三必需字段齐了就构造成功')

ok(A.setBase({ name = 'play', opaque = true, view = function() return {} end }) == true, 'B2 setBase 成功')
ok(A.baseName() == 'play', 'B3 基础层名可读', A.baseName())
ok(S.depth() == 1, 'B4 栈底一个场景', S.depth())

-- 覆盖屏：先 clear 再 apply，且用**自己那份**实例
RB.apply { node('kept', 'board') }
ok(RB.live() == 1, 'B5 基础层实例有内容', RB.live())
ok(A.openOverlay('help', { name = 'help', opaque = true, view = function() return {} end },
  { node('h1'), node('h2') }) == true, 'B6 openOverlay 成功')
ok(RO.live() == 2, 'B7 节点进了覆盖屏实例', RO.live())
ok(RB.live() == 1, 'B8 **基础层实例不受影响**（这是"棋盘不丢"的真正机制）', RB.live())
ok(S.topName() == 'help' and S.depth() == 2, 'B9 覆盖屏压栈', tostring(S.topName()))
ok(A.overlay() == 'help', 'B10 当前覆盖屏可读')

-- 换覆盖屏：先 clear 再 apply（不翻倍、不残留）
ok(A.openOverlay('settle', { name = 'settle', opaque = true, view = function() return {} end },
  { node('s1') }) == true, 'B11 换覆盖屏成功')
ok(RO.live() == 1, 'B12 换屏时先 clear（2 → 1，不残留）', RO.live())
ok(A.overlay() == 'settle', 'B13 覆盖屏记录更新')

A.closeOverlay()
ok(RO.live() == 0, 'B14 关屏清覆盖屏实例')
ok(RB.live() == 1, 'B15 关屏不动基础层实例', RB.live())
ok(A.overlay() == nil, 'B16 关屏后覆盖屏记录清空')

-- ===== C provideOverlay：懒创建屏登记自己的实例 =====
local RS = renderM.new { platform = P, layers = layers, maxInstances = 430 }
ok(A.provideOverlay('settle2', RS) == true, 'C1 provideOverlay 登记成功')
ok(A.openOverlay('settle2', { name = 'settle2', opaque = true, view = function() return {} end },
  { node('x1') }) == true, 'C2 用登记的实例开屏')
ok(RS.live() == 1, 'C3 节点进**登记的**实例', RS.live())
ok(RO.live() == 0, 'C4 默认覆盖屏实例不受影响', RO.live())
A.closeOverlay()
ok(RS.live() == 0, 'C5 关屏清登记的实例')
ok(A.provideOverlay('bad', nil) == false, 'C6 缺参返回 false（不抛）')

-- ===== D 幂等与边界 =====
ok(A.setBase({ name = 'play', opaque = true, view = function() return {} end }) == true,
  'D1 重复 setBase 幂等（不因重复注册抛错）')
ok(S.depth() == 1, 'D2 重复 setBase 不叠栈', S.depth())
local okBad = pcall(function() A.openOverlay(nil, nil, {}) end)
ok(okBad, 'D3 非法参数不炸进程')
ok(A.stats() ~= nil, 'D4 stats 可读')

print(string.format('\n== app_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
