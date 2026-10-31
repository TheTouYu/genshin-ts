--[[==========================================================================
 tests-lua/scenes_test.lua —— 场景栈 headless 验收（不需要模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/scenes_test.lua
 判据：全 PASS、退出码 0。

 要证明的是「多层级菜单」这条坏域被结构性地治住：
   1) 栈是唯一状态：push/pop 后栈内容可断言，没有 helpOpen/pageFrom 之类的布尔组合
   2) 视图合成：从栈底往上拼；opaque 场景遮住下层
   3) 输入分发：栈顶优先；栈顶 opaque 时下层收不到键
   4) 更新：栈顶 update 独占，tickBelow 才向下传播
   5) 场景 enter 抛错不会留下半死场景（失败不压栈）
   6) 合成出来的视图层序单调（交给 view_node.lint 复核，0 issue）
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local scenesM = load('lua/tetris/scenes.lua')
local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')

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
local S = scenesM.new { log = function(m) logs[#logs + 1] = m end }
local V = vnode.new { layers = layers }

-- 两个假场景：a 是底（棋盘），b 是浮层
local aState = { ticks = 0, keys = {} }
local bState = { ticks = 0, entries = 0, exits = 0, keys = {} }

S.register {
  name = 'a',
  enter = function(ctx) aState.entries = (aState.entries or 0) + 1 end,
  update = function(ctx, dt) aState.ticks = aState.ticks + 1 end,
  view = function(ctx)
    return {
      { key = 'a-cell', layer = 'board', tpl = 'cell', name = 'aCell',
        pos = { 0, 0 }, size = { 28, 28 }, color = 0 },
    }
  end,
  onAction = function(ctx, action, key)
    aState.keys[#aState.keys + 1] = action
    return action == 'left'
  end,
}

S.register {
  name = 'b',
  enter = function(ctx) bState.entries = bState.entries + 1 end,
  exit = function(ctx) bState.exits = bState.exits + 1 end,
  update = function(ctx, dt) bState.ticks = bState.ticks + 1 end,
  view = function(ctx)
    return {
      { key = 'b-panel', layer = 'panel', tpl = 'cell', name = 'bPanel',
        pos = { 0, 0 }, size = { 400, 300 }, color = 0 },
      { key = 'b-btn', layer = 'touch', tpl = 'hit', name = 'bBtn',
        pos = { 0, -100 }, size = { 200, 60 }, color = 0, cursor = { 'Click' }, on = { Click = function() end } },
    }
  end,
  onAction = function(ctx, action, key)
    bState.keys[#bState.keys + 1] = action
    return true
  end,
}

-- 1) 栈是唯一状态
ok(S.push('a') == true, '1.1 push a 成功')
ok(#S.stack() == 1 and S.topName() == 'a', '1.2 栈 = {a}', table.concat(S.stack(), ','))
S.push('b')
ok(#S.stack() == 2 and S.topName() == 'b', '1.3 栈 = {a,b}', table.concat(S.stack(), ','))
ok(S.has('a') and S.has('b'), '1.4 has() 能查到栈内场景')

-- 2) 视图合成（非 opaque 叠加）+ opaque 截断
local allView = S.view()
ok(#allView == 3, '2.1 两层视图叠加 = 1+2 节点', #allView)
local keys = {}
for i = 1, #allView do keys[#keys + 1] = allView[i].key end
ok(keys[1] == 'a-cell' and keys[2] == 'b-panel' and keys[3] == 'b-btn', '2.2 拼接顺序 = 栈底→栈顶')
local issues = V.lint(allView)
ok(#issues == 0, '2.3 合成视图层序/lint 通过（0 issue）', #issues > 0 and issues[1].msg or '')

-- opaque 模态：只保留它自己（下层不渲染，也防误点）
S.register {
  name = 'm', opaque = true,
  view = function()
    return { { key = 'm-cover', layer = 'modal', tpl = 'cell', name = 'mCover',
      pos = { 0, 0 }, size = { 800, 600 }, color = 0 } }
  end,
  onAction = function() return false end,
}
S.push('m')
local mView = S.view()
ok(#mView == 1 and mView[1].key == 'm-cover', '2.4 opaque 场景截断视图（只留自己）', #mView)
local aKeys0, bKeys0 = #aState.keys, #bState.keys
local mConsumed = S.onAction('left', 'K')
ok(mConsumed == false and #aState.keys == aKeys0 and #bState.keys == bKeys0,
  '2.5 opaque 未消费的键也不下传（下层不会误响应）')
S.pop()

-- 3) 输入：栈顶优先且 opaque 下层收不到
local consumed = S.onAction('left', 'K')
ok(consumed == true and #bState.keys == 1 and #aState.keys == 0,
  '3.1 栈顶消费后下层收不到', '#a=' .. #aState.keys .. ' #b=' .. #bState.keys)

-- 4) 更新：栈顶独占
local ticksA0, ticksB0 = aState.ticks, bState.ticks
S.update(0.016)
ok(bState.ticks == ticksB0 + 1, '4.1 栈顶 update 被调用')
ok(aState.ticks == ticksA0, '4.2 默认不向下传播（tickBelow 未开）')

-- 5) enter 抛错不压栈
S.register({ name = 'boom', enter = function() error('boom') end })
local depthBefore = #S.stack()
ok(S.push('boom') == false and #S.stack() == depthBefore, '5.1 enter 抛错 ⇒ 压栈失败且栈不变')
ok(logs[#logs] ~= nil, '5.2 失败被记入日志')

-- 6) pop 生命周期 + popTo
S.pop()
ok(#S.stack() == 1 and S.topName() == 'a', '6.1 pop 回 a', table.concat(S.stack(), ','))
ok(bState.exits == 1, '6.2 b 的 exit 被调用一次', bState.exits)
S.push('b')
ok(S.popTo('a') == true and #S.stack() == 1, '6.3 popTo(a) 一路弹回')

print(string.format('\n== scenes_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
