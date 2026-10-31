--[[==========================================================================
 tests-lua/flow_test.lua —— 跨屏集成流（真实 view_* 模块 + 场景栈 + mock 引擎）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/flow_test.lua

 为什么要有这条：单模块测试证明"每个屏自己画得对"，证明不了**屏与屏之间**。
 历史 bug 绝大多数是跨屏的（帮助页盖住棋盘、结算卡盖住触控键、退出浮层后底层
 没回来、pad 键在结算页又冒出来）。这里把真实模块按场景栈拼起来跑一遍。

 要证明：
   F1 标题 → 对局：棋盘节点建起来，且没有残留的标题节点
   F2 对局 → 说明页：说明页在上（层号更高），棋盘仍在场（opaque 截断时只剩说明页）
   F3 说明页 → 对局：pop 之后棋盘回来（exit 重放前一屏），节点数回到原值
   F4 对局 → 结算：结算节点出现，且**不出现 pad 家族名字**（缺陷③的跨屏复发守卫）
   F5 实例预算：整条流里任何时刻在场实例 < 430（真机上限）
   F6 每一屏的 lint 都是 0 issue（层序/对比度/文字高度/遮挡）
   F7 结算页两种 style 都能出（text/pill），且设备互斥
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local platformM = load('lua/tetris/platform.lua')
local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')
local renderM = load('lua/tetris/render.lua')
local scenesM = load('lua/tetris/scenes.lua')
local appM = load('lua/tetris/app.lua')
local configM = load('lua/tetris/config.lua')
local kitM = load('lua/tetris/view_kit.lua')
local boardM = load('lua/tetris/view_board.lua')
local helpM = load('lua/tetris/view_help.lua')
local settleM = load('lua/tetris/view_settle.lua')

local CFG = configM
local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

-- ===== 装配（与 main.lua 里将来要做的完全同构）=====
local logs = {}
local P = platformM.new {
  mock = true, canvas = { 1280, 720 },
  templates = { cell = { kind = 'image' }, hit = { kind = 'cursor' },
    settle = { kind = 'container' }, stext = { kind = 'text' } },
  logSink = function(m) logs[#logs + 1] = m end,
}
local R = renderM.new { platform = P, layers = layers, maxInstances = 430 }
local S = scenesM.new { log = function(m) logs[#logs + 1] = m end }
local A = appM.new { platform = P, render = R, scenes = S, layers = layers,
  log = function(m) logs[#logs + 1] = m end }
local V = vnode.new { layers = layers }
local KIT = kitM.new { layers = layers }
local VB = boardM.new { config = CFG }
local VH = helpM.new { config = CFG, layers = layers, kit = KIT }
local VS = settleM.new { config = CFG, layers = layers, kit = KIT }

-- 一个"屏幕"= 一份节点描述；切屏时用快照重放实现 exit
local function snap() return S.view() end
local MODE = 'casual'

-- ===== F1 标题 → 对局 =====
A.register {
  name = 'play',
  opaque = true,
  view = function()
    local nodes = VB.board { plateColor = 0xFFFFFFFF, cellColor = 0xFF1A1D26 }
    -- 加一个 HUD 文本（服务端 textbox 在真机永远在实例之下，这里用实例模拟）
    nodes[#nodes + 1] = { key = 'hudScore', layer = 'hud', tpl = 'stext', name = 'hudScore',
      pos = { 0, 420 }, size = { 400, 40 }, text = '得分 0　消行 0　等级 1　已填 0', font = 20 }
    return nodes
  end,
}
A.register {
  name = 'title',
  opaque = true,
  view = function()
    return {
      { key = 'titleCard', layer = 'card', tpl = 'cell', name = 'titleCard',
        pos = { 0, 0 }, size = { 900, 400 }, color = 0xFFF7FAFF },
      { key = 'titleText', layer = 'card', tpl = 'stext', name = 'titleText',
        pos = { 0, 40 }, size = { 600, 60 }, text = '俄罗斯方块', font = 44 },
    }
  end,
}

ok(A.start('title') == true, 'F1.0 启动标题屏')
local titleLive = R.live()
A.render()
local playNodes = S.push('play') and A.render()
ok(R.get('titleCard') == nil and R.get('titleText') == nil, 'F1.1 进对局后标题节点被销毁（不残留）')
ok(R.get('cell1') ~= nil and R.get('cell200') ~= nil, 'F1.2 棋盘 200 格建起来')
ok(R.get('hudScore') ~= nil, 'F1.3 HUD 文本在场')
local playLive = R.live()

-- ===== F2 对局 → 说明页 =====
local beforeHelp = snap()
S.push('help')
-- 说明页是 heavy scene：必须先 clear（实例上限），再 apply
R.clear()
ok(R.live() == 0, 'F2.0 clear 之后在场实例归零', R.live())
local helpNodes = VH.help { canvas = { 1280, 720 }, device = 'pc', page = 1, pages = 1 }
R.apply(helpNodes)
ok(R.live() > 100, 'F2.1 说明页节点全部建成', R.live())
local helpIssues = V.lint(helpNodes)
ok(#helpIssues == 0, 'F2.2 说明页 lint 0 issue', #helpIssues > 0 and helpIssues[1].msg or '')

-- ===== F3 说明页 → 对局（exit 重放前一屏）=====
S.pop()
R.clear()
R.apply(beforeHelp)
ok(R.get('cell1') ~= nil, 'F3.1 退回后棋盘回来了')
ok(R.live() == playLive, 'F3.2 退回后在场景数回到原值', R.live() .. ' vs ' .. playLive)

-- ===== F4 对局 → 结算 =====
local settleNodes = VS.settle {
  canvas = { 1280, 720 }, device = 'mobile', mode = MODE, style = 'pill',
  title = '游戏结束', score = 152, best = 152, lines = 0, drops = 10, level = 1,
  onRestart = function() end, onHome = function() end, onDetail = function() end,
}
R.apply(settleNodes)
local hotKeys = {}
for i = 1, #settleNodes do
  local nm = tostring(settleNodes[i].name or '')
  if nm:find('^hotSettle') then hotKeys[#hotKeys + 1] = nm end
end
-- 在**引擎侧**核对：render 真正建出来的控件里必须有这三个名字（不是只看描述）
local hotInEngine = 0
for _, ctl in pairs(R.controls()) do
  local nm = tostring(ctl.name or '')
  if nm:find('^hotSettle') then hotInEngine = hotInEngine + 1 end
end
ok(#hotKeys == 3 and hotInEngine == 3,
  'F4.1 结算三键热区在引擎侧在场（hitagain/hithome/hitdetail -> hotSettleR/V/Q）',
  table.concat(hotKeys, ',') .. ' engine=' .. hotInEngine)
local padHits = 0
for _, n in ipairs(settleNodes) do
  local nm = tostring(n.name or n.key)
  if nm:find('^pt') or nm:find('^pb') or nm:find('^pe') or nm:find('^pbtn')
    or nm:find('^btnA') or nm:find('^phone') then padHits = padHits + 1 end
end
ok(padHits == 0, 'F4.2 结算页不出现 pad 家族名字（缺陷③跨屏复发守卫）', padHits)
local settleIssues = V.lint(settleNodes)
ok(#settleIssues == 0, 'F4.3 结算页 lint 0 issue', #settleIssues > 0 and settleIssues[1].msg or '')

-- ===== F5 实例预算 =====
local maxLive = math.max(playLive, R.live() + 0)
ok(playLive < 430, 'F5.1 对局屏在场实例 < 430', playLive)
ok(#helpNodes + playLive > 430, 'F5.2 说明页+对局会超 430 ⇒ 必须先 clear（这条证明守卫必要性）',
  #helpNodes .. '+' .. playLive)
local r2 = false
for _, is in ipairs(R.issues()) do
  if is.code == 'R2' then r2 = true end
end
ok(not r2, 'F5.3 清屏后没有触发 R2 预算告警')

-- ===== F6 三种设备的说明页 lint =====
local deviceOk = true
local firstMsg = ''
for _, dev in ipairs({ 'pc', 'mobile' }) do
  for _, cv in ipairs({ { 1600, 900 }, { 1280, 720 }, { 2340, 1080 } }) do
    local ns = VH.help { canvas = cv, device = dev, page = 1, pages = 1 }
    local is = V.lint(ns)
    if #is > 0 then deviceOk = false firstMsg = dev .. '@' .. cv[1] .. ' :: ' .. is[1].msg break end
  end
end
ok(deviceOk, 'F6.1 说明页 2 设备 × 3 画布 lint 全 0', firstMsg)

-- ===== F7 结算两种 style =====
local textNodes = VS.settle {
  canvas = { 1600, 900 }, device = 'pc', mode = MODE, style = 'text',
  title = '游戏结束', score = 1, best = 1, lines = 0, drops = 0, level = 1,
  onRestart = function() end, onHome = function() end, onDetail = function() end,
}
local pillNodes = VS.settle {
  canvas = { 1600, 900 }, device = 'pc', mode = MODE, style = 'pill',
  title = '游戏结束', score = 1, best = 1, lines = 0, drops = 0, level = 1,
  onRestart = function() end, onHome = function() end, onDetail = function() end,
}
ok(#textNodes ~= #pillNodes, 'F7.1 text/pill 两种形态节点数不同（真分叉）',
  #textNodes .. ' vs ' .. #pillNodes)
local mobileText = VS.settle {
  canvas = { 1280, 720 }, device = 'mobile', mode = MODE, style = 'text',
  title = '游戏结束', score = 1, best = 1, lines = 0, drops = 0, level = 1,
  onRestart = function() end, onHome = function() end, onDetail = function() end,
}
local mobilePill = VS.settle {
  canvas = { 1280, 720 }, device = 'mobile', mode = MODE, style = 'pill',
  title = '游戏结束', score = 1, best = 1, lines = 0, drops = 0, level = 1,
  onRestart = function() end, onHome = function() end, onDetail = function() end,
}
ok(#mobileText == #mobilePill, 'F7.2 mobile 传 text 仍出胶囊（触摸屏没有键盘的兜底）',
  #mobileText .. ' vs ' .. #mobilePill)

-- ===== F8 实例上限是「全工程总量」，不是单个 render 实例的量 =====
-- 真实场景：常驻约 240 + 说明页 277 = 517，而每个 render 都觉得自己"才 277"。
-- 判据：platform 记总账；第二个实例在总量越线时就报警，而不是等它自己涨到 366。
local P2 = platformM.new { mock = true, canvas = { 1280, 720 },
  templates = { cell = { kind = 'image' } } }
local RL = layers
local Rbig = renderM.new { platform = P2, layers = RL, maxInstances = 430 }
local Rsmall = renderM.new { platform = P2, layers = RL, maxInstances = 430 }
local function many(n, pre)
  local t = {}
  for i = 1, n do t[i] = { key = pre .. i, layer = 'card', tpl = 'cell', name = pre .. i,
    pos = { 0, 0 }, size = { 8, 8 }, color = 0 } end
  return t
end
Rbig.apply(many(300, 'big'))
ok(P2.liveCount() == 300, 'F8.1 platform 台账记到 300', P2.liveCount())
ok(#Rsmall.issues() == 0, 'F8.2 未越线时不误报')
Rsmall.apply(many(100, 'small'))
ok(P2.liveCount() == 400, 'F8.3 两个实例合计 400（台账跨实例）', P2.liveCount())
local sawR2 = false
for _, is in ipairs(Rsmall.issues()) do if is.code == 'R2' then sawR2 = true end end
ok(sawR2, 'F8.4 总量越线时，**仅建了 100 个**的那个实例也报 R2（守的是总量）')
Rbig.clear()
ok(P2.liveCount() == 100, 'F8.5 清一个大实例，台账正确回落', P2.liveCount())

print(string.format('\n== flow_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
