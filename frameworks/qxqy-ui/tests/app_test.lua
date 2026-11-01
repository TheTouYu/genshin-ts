--[[==========================================================================
 tests-lua/app_test.lua —— 应用外壳 headless 验收
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/app_test.lua

 要证明的是「连接层」没有偷藏业务判断：
   A tick = 场景 update + 视图合成 + 渲染（三件事，不多不少）
   B 场景切换后旧节点被销毁（render 的 diff 通道成立）
   C 输入按栈分发：栈顶消费 → 下层收不到；返回 false 才下传
   D input_map 接上后每个键只注册一次，回调统一进 dispatch
   E 渲染抛错不会打断 tick（真机一处抛错会中断整段回调，历史事故）
   F stats() 能给出可审计读数（帧数/栈/渲染计数）
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local platformM = load('lua/qxqy_ui/platform.lua')
local layers = load('lua/qxqy_ui/view_layers.lua')
local renderM = load('lua/qxqy_ui/render.lua')
local scenesM = load('lua/qxqy_ui/scenes.lua')
local appM = load('lua/qxqy_ui/app.lua')

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
local R = renderM.new { platform = P, layers = layers }
local S = scenesM.new { log = function(m) logs[#logs + 1] = m end }
local A = appM.new { platform = P, render = R, scenes = S, layers = layers,
  log = function(m) logs[#logs + 1] = m end }

-- ===== 两个假场景 =====
local aTicks, bTicks, aKeys, bKeys = 0, 0, {}, {}
A.register {
  name = 'a',
  update = function() aTicks = aTicks + 1 end,
  view = function()
    return {
      { key = 'aBoard', layer = 'board', tpl = 'cell', name = 'aBoard',
        pos = { 0, 0 }, size = { 300, 600 }, color = 0 },
    }
  end,
  onAction = function(_, action)
    aKeys[#aKeys + 1] = action
    return action == 'left'
  end,
}
A.register {
  name = 'b', opaque = true,
  update = function() bTicks = bTicks + 1 end,
  view = function()
    return {
      { key = 'bCard', layer = 'panel', tpl = 'cell', name = 'bCard',
        pos = { 0, 0 }, size = { 780, 400 }, color = 0 },
      { key = 'bBtn', layer = 'touch', tpl = 'hit', name = 'bBtn',
        pos = { 0, -260 }, size = { 200, 64 }, color = 0, cursor = { 'Click' },
        on = { Click = function() end } },
    }
  end,
  onAction = function(_, action)
    bKeys[#bKeys + 1] = action
    return action == 'confirm'
  end,
}

-- ===== A tick = 三件事 =====
ok(A.start('a') == true, 'A1 启动场景 a')
ok(R.get('aBoard') ~= nil, 'A2 start 之后视图已渲染（aBoard 在场）')
local t0 = aTicks
ok(A.tick(1 / 60) == true, 'A3 tick 返回渲染成功')
ok(aTicks == t0 + 1, 'A4 场景 update 被调用一次', aTicks - t0)
ok(A.stats().ticks == 1, 'A5 stats 记录 tick 数')

-- ===== B 场景切换后旧节点销毁 =====
S.push('b')
A.render()
ok(R.get('aBoard') == nil, 'B1 切到 opaque 场景后，下层节点被销毁（不残留）')
ok(R.get('bCard') ~= nil and R.get('bBtn') ~= nil, 'B2 新场景节点已建')

-- ===== C 输入按栈分发 =====
local consumed = A.dispatch('confirm', 'K36')
ok(consumed == true and #bKeys == 1 and #aKeys == 0, 'C1 栈顶消费后下层收不到')
local notConsumed = A.dispatch('left', 'K38')
ok(notConsumed == false and #bKeys == 2, 'C2 栈顶返回 false ⇒ 视为未消费（不阻塞全局兜底）')
S.pop()
A.render()
A.dispatch('left', 'K38')
ok(#aKeys == 1, 'C3 回到 a 后动作重新落到 a')

-- ===== D input_map 接线：每键只注册一次 =====
local pressed = {}
local fakeInput = {
  bindAll = function(dispatch)
    -- 模拟两张动作表：left 有两个键名、confirm 一个
    dispatch('left', 'KeyboardMoveLeftKeyDown')
    dispatch('confirm', 'KeyboardCraftspersonKey36Down')
    return true
  end,
}
local extra = {}
A.bindInput(fakeInput, function(action)
  extra[#extra + 1] = action
  return false
end)
ok(#aKeys >= 2, 'D1 bindInput 把动作送进场景栈（a 收到 left/confirm）', #aKeys)
ok(#extra == 1, 'D2 未被消费的动作交给 extraAction（confirm 在 a 里不消费）', #extra)

-- ===== E 渲染抛错不打断 tick =====
A.register {
  name = 'bad',
  -- 故意用未注册的层名 ⇒ view_layers.order 抛错 ⇒ 整个 view 合成失败
  view = function()
    return { { key = 'x', layer = 'no-such-layer', tpl = 'cell', name = 'x',
      pos = { 0, 0 }, size = { 1, 1 }, color = 0 } }
  end,
}
S.push('bad')
local okTick = A.tick(1 / 60)
ok(okTick == false, 'E1 渲染失败时 tick 返回 false（不静默）')
local sawFail = false
for i = 1, #logs do
  if tostring(logs[i]):find('app render fail', 1, true) then sawFail = true end
end
ok(sawFail, 'E2 渲染失败被记入日志（可审计）')
S.pop()

-- ===== F stats 可审计 =====
local st = A.stats()
ok(type(st) == 'table' and st.depth ~= nil and st.render ~= nil, 'F1 stats 含 栈深/渲染计数')
ok(st.render.created and st.render.created > 0, 'F2 渲染计数可见', st.render and st.render.created)

-- ===== G 覆盖屏（overlay）：独立 render 实例 + 先 clear 再 apply =====
local OR = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local A2 = appM.new { platform = P, render = R, scenes = S, layers = layers,
  overlayRender = OR, log = function(m) logs[#logs + 1] = m end }
A2.register { name = 'base', opaque = true,
  view = function()
    return { { key = 'baseCell', layer = 'board', tpl = 'cell', name = 'baseCell',
      pos = { 0, 0 }, size = { 28, 28 }, color = 0 } }
  end }
A2.start('base')
local baseLive = R.live()
ok(R.get('baseCell') ~= nil, 'G1 基础层已渲染（独立实例的另一侧）')

local heavy = {}
for i = 1, 300 do
  heavy[i] = { key = 'ov' .. i, layer = 'card', tpl = 'cell', name = 'ov' .. i,
    pos = { i % 10 * 30, 0 }, size = { 20, 20 }, color = 0 }
end
ok(A2.openOverlay('help', nil, heavy) == true, 'G2 打开覆盖屏成功')
ok(OR.live() == 300, 'G3 覆盖屏节点全部建成', OR.live())
ok(R.get('baseCell') ~= nil and R.live() == baseLive, 'G4 基础层不受影响（独立 render 实例）')
ok(A2.overlay() == 'help', 'G5 当前覆盖屏记录正确')

-- 先 clear 再 apply：300 节点重开不该翻倍
local heavy2 = {}
for i = 1, 120 do
  heavy2[i] = { key = 'ov2' .. i, layer = 'card', tpl = 'cell', name = 'ov2' .. i,
    pos = { 0, 0 }, size = { 20, 20 }, color = 0 }
end
A2.openOverlay('settle', nil, heavy2)
ok(OR.live() == 120, 'G6 换覆盖屏时先 clear（300 → 120，不翻倍不残留）', OR.live())
-- 注意：新节点名 ov2N 也以 'ov' 开头，所以不能只匹配 '^ov%d'（会把自己数进去）。
-- 显式点名上一屏的前 10 个 key，逐个确认已不在。
local leaked = 0
local oldNames = {}
for i = 1, 10 do oldNames['ov' .. i] = true end
for _, ctl in pairs(OR.controls()) do
  if oldNames[tostring(ctl.name or '')] then leaked = leaked + 1 end
end
ok(leaked == 0, 'G7 上一屏的节点一个都不剩（点名核 10 个旧 key）', leaked)

A2.closeOverlay()
ok(OR.live() == 0 and A2.overlay() == nil, 'G8 关覆盖屏后 overlay 实例归零')
ok(R.get('baseCell') ~= nil, 'G9 关覆盖屏不动基础层')

-- ===== H 单节点按需增删（spawn/despawn）：不触发销毁扫描 =====
local HR = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local board = {}
for i = 1, 5 do
  board[i] = { key = 'hb' .. i, layer = 'board', tpl = 'cell', name = 'hb' .. i,
    pos = { 0, 0 }, size = { 10, 10 }, color = 0xFF111111 }
end
HR.apply(board)
local baseLive = HR.live()
ok(baseLive == 5, 'H1 基础板面 5 个节点', baseLive)
HR.spawn { { key = 'hdeco', layer = 'frame', tpl = 'cell', name = 'hdeco',
  pos = { 0, 0 }, size = { 4, 600 }, color = 0xFFE0C060 } }
ok(HR.live() == 6, 'H2 spawn 只加一个', HR.live())
ok(HR.get('hb1') ~= nil, 'H3 spawn **没有**触发销毁扫描（棋盘仍在）')
HR.despawn('hdeco')
ok(HR.get('hdeco') == nil, 'H4 despawn 后该节点消失')
ok(HR.live() == 5, 'H5 despawn 后计数回落（live 与 platform 台账一致）', HR.live())
ok(P.liveCount() >= 5, 'H6 platform 台账同步', P.liveCount())
-- 关键：整屏重 apply 会重置棋盘色（这正是不能拿 apply 做"加个装饰"的原因）
HR.spawn { { key = 'hb1', layer = 'board', tpl = 'cell', name = 'hb1',
  pos = { 0, 0 }, size = { 10, 10 }, color = 0xFF222222 } }
ok(HR.get('hb1').imageColor == 0xFF222222 or HR.get('hb1').imageColor == -16777216 + 0x222222,
  'H7 spawn 可更新单个节点字段', HR.get('hb1').imageColor)

-- ===== I 构造失败：返回 nil 并一次报全缺失字段（不抛错）=====
local misses = {}
local okCall, A_nil = pcall(appM.new, { log = function(m) misses[#misses + 1] = m end })
ok(okCall, 'I1 缺字段时**不抛错**（pcall 没抓到异常）')
ok(A_nil == nil, 'I2 返回 nil，让调用方走兜底分支')
local msg
for i = 1, #misses do if tostring(misses[i]):find('app missing', 1, true) then msg = misses[i] end end
ok(msg ~= nil, 'I3 打了一条 app missing 日志')
ok(msg and msg:find('platform', 1, true) and msg:find('render', 1, true)
  and msg:find('scenes', 1, true), 'I4 **一次列出全部**缺失字段（不是抛第一个）', tostring(msg))
local A_ok = appM.new { platform = P, render = R, scenes = S }
ok(A_ok ~= nil, 'I5 三个必需字段齐了就正常构造')
-- 只有 layers/overlayRender 是可选的
local A_min = appM.new { platform = P, render = R, scenes = S, layers = layers }
ok(A_min ~= nil, 'I6 layers 可选（构造仍成功）')

-- ===== J 基础层 + 覆盖屏的组合（setBase）=====
local JS = scenesM.new { log = function() end }
local JR = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local JA = appM.new { platform = P, render = JR, scenes = JS, layers = layers,
  overlayRender = JR, log = function() end }
local baseNodes = { { key = 'jb', layer = 'board', tpl = 'cell', name = 'jb',
  pos = { 0, 0 }, size = { 10, 10 }, color = 0 } }
ok(JA.setBase({ name = 'play', opaque = true, view = function() return baseNodes end }) == true,
  'J1 setBase 成功')
ok(JA.baseName() == 'play', 'J2 基础层名可读', JA.baseName())
ok(JS.depth() == 1, 'J3 栈底一个场景', JS.depth())
JA.openOverlay('help', { name = 'help', opaque = true,
  view = function() return { { key = 'jh', layer = 'card', tpl = 'cell', name = 'jh',
    pos = { 0, 0 }, size = { 10, 10 }, color = 0 } } end })
ok(JS.topName() == 'help', 'J4 overlay 压栈（openOverlay 会补注册未注册的场景）', tostring(JS.topName()))
ok(JS.depth() == 2, 'J5 栈深 2', JS.depth())
ok(#JS.view() == 1, 'J6 opaque 截断：只合成栈顶那屏', #JS.view())
JA.closeOverlay()
ok(JS.topName() == 'play' and JS.depth() == 1, 'J7 关覆盖屏回到基础层', tostring(JS.topName()))
ok(#JS.view() == 1, 'J8 回基础层后仍只有一屏（opaque）', #JS.view())
-- 重复 setBase 幂等（不能因为重复注册抛错）
ok(JA.setBase({ name = 'play', opaque = true, view = function() return baseNodes end }) == true,
  'J9 重复 setBase 幂等（不因重复注册抛错）')
ok(JS.depth() == 1, 'J10 重复 setBase 不叠栈', JS.depth())

-- ===== K provideOverlay：懒创建屏在"开的时候"才给实例 =====
local KS = scenesM.new { log = function() end }
local KR_default = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local KR_settle = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local KA = appM.new { platform = P, render = KR_default, scenes = KS, layers = layers,
  overlayRender = KR_default, log = function() end }
ok(KA.openOverlay('help', { name = 'help', opaque = true, view = function()
  return { { key = 'kh', layer = 'card', tpl = 'cell', name = 'kh', pos = {0,0}, size = {8,8}, color = 0 } }
end }, { { key = 'kh', layer = 'card', tpl = 'cell', name = 'kh', pos = {0,0}, size = {8,8}, color = 0 } }) == true,
  'K1 默认实例可开覆盖屏')
ok(KR_default.live() == 1, 'K2 默认实例里有节点', KR_default.live())
KA.closeOverlay()
ok(KR_default.live() == 0, 'K3 关屏清默认实例')
-- 懒创建：构造期没给 settle 的实例，开屏时才 provide
ok(KA.provideOverlay('settle', KR_settle) == true, 'K4 provideOverlay 登记成功')
ok(KA.openOverlay('settle', { name = 'settle', opaque = true, view = function() return {} end },
  { { key = 'ks', layer = 'card', tpl = 'cell', name = 'ks', pos = {0,0}, size = {8,8}, color = 0 } }) == true,
  'K5 用登记的实例开覆盖屏')
ok(KR_settle.live() == 1, 'K6 节点进了**登记的**实例（不是默认那个）', KR_settle.live())
ok(KR_default.live() == 0, 'K7 默认实例不受影响', KR_default.live())
ok(KA.overlayRender() == KR_settle, 'K8 overlayRender() 返回当前覆盖屏的实际实例')
KA.closeOverlay()
ok(KR_settle.live() == 0, 'K9 关屏清的是登记的实例')
ok(KA.provideOverlay('x', nil) == false, 'K10 缺参返回 false（不抛）')

-- ===== L 每帧回调：有序 + 单个失败不中断后续 =====
local LS = scenesM.new { log = function() end }
LS.register { name = 's1', view = function() return {} end }
LS.push('s1')
local LR = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local Llogs = {}
local LA = appM.new { platform = P, render = LR, scenes = LS, layers = layers,
  log = function(m) Llogs[#Llogs + 1] = m end }
local order = {}
ok(LA.frame(function() order[#order + 1] = 'a' end) == 1, 'L1 frame 注册返回序号')
ok(LA.frame(function() order[#order + 1] = 'b' end) == 2, 'L2 第二个回调序号 2')
ok(LA.frame(function() error('boom') end) == 3, 'L3 注册一个会抛错的')
ok(LA.frame(function() order[#order + 1] = 'd' end) == 4, 'L4 第四个回调')
ok(LA.frameCount() == 4, 'L5 frameCount 正确', LA.frameCount())
LA.tick(1/60)
ok(table.concat(order, '') == 'abd', 'L6 **按注册顺序执行**且抛错的那个不中断后续', table.concat(order, ''))
local sawErr = false
for i = 1, #Llogs do if Llogs[i]:find('app frame fail #3', 1, true) then sawErr = true end end
ok(sawErr, 'L7 抛错时记日志（不静默）')
ok(LA.frame(nil) == false, 'L8 非函数返回 false')
LA.clearFrame()
ok(LA.frameCount() == 0, 'L9 clearFrame 清空')

-- ===== M suspendBase/resumeBase：抑制期间不重画基础层 =====
local MS_ = scenesM.new { log = function() end }
local MR = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local MA = appM.new { platform = P, render = MR, scenes = MS_, layers = layers,
  overlayRender = MR, log = function() end }
MA.setBase({ name = 'title', opaque = true, view = function()
  return { { key = 'mt', layer = 'card', tpl = 'cell', name = 'mt', pos = {0,0}, size = {8,8}, color = 0 } }
end })
MA.render()
ok(MR.get('mt') ~= nil, 'M1 基础层已渲染')
local before = MR.stats().created
ok(MA.suspendBase() == true, 'M2 suspendBase 成功')
ok(MA.baseSuspended() == true, 'M3 状态可读')
MA.render()
ok(MR.stats().created == before, 'M4 抑制期间不重画（created 未增）', MR.stats().created)
ok(MA.resumeBase() == true, 'M5 resumeBase 成功')
ok(MA.baseSuspended() == false, 'M6 恢复后状态为假')
-- 抑制期间开覆盖屏仍要能画
MA.suspendBase()
MA.openOverlay('help', { name = 'help', opaque = true, view = function() return {} end },
  { { key = 'mh', layer = 'card', tpl = 'cell', name = 'mh', pos = {0,0}, size = {8,8}, color = 0 } })
ok(MR.get('mh') ~= nil, 'M7 抑制基础层时覆盖屏照常渲染')
MA.closeOverlay()
MA.resumeBase()

print(string.format('\n== app_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
