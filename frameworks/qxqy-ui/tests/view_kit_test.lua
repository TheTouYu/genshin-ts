--[[==========================================================================
 tests-lua/view_kit_test.lua —— 控件工厂 headless 验收
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_kit_test.lua

 要证明的是「10 秒量产一个合格按钮」是真的合格：
    A 六件套齐（胶囊三块 / 文字 / 键帽 / 热区）
    B 文字框高度 ≥ font×1.45+6（矮了引擎 fits=false 整条不画）
    C 热区 y 与视觉**同号**（取负=镜像到画布另一侧=看得见点不到，2026-10-30 实测定谳）
    D 热区在 touch 层（高于卡片/面板，否则点击被上层吃掉）
    E 键帽收在胶囊内（左侧内边距 16 + 键帽 34 + 间隙 10）
    F 用半透明底色做按钮 ⇒ lint 必须报 L3（防止「隐形按钮」回归）
    J 三态（hover / pressed）：缺省派生可断言、状态机转移可跑、按钮/热区两种入口都挂得上
========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local layers = load('lua/qxqy_ui/view_layers.lua')
local vnode = load('lua/qxqy_ui/view_node.lua')
local kitM = load('lua/qxqy_ui/view_kit.lua')

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

local V = vnode.new { layers = layers }
local K = kitM.new { layers = layers, colors = {
  wall = K0, ink = 0, gold = 0, subInk = 0,
} }
K = kitM.new { layers = layers }

local function find(nodes, key)
  for i = 1, #nodes do if nodes[i].key == key then return nodes[i] end end
  return nil
end

-- ===== A 六件套 =====
local btn = K.button {
  key = 'btnMenu', x = 200, y = 300, w = 290, h = 96, label = '角色档案',
  sub = 'I 键 · 点我看契约与技能', keyLabel = 'I', preset = 'gold',
  on = { CursorClick = function() end },
}
ok(#btn == 10, 'A1 按钮节点数 = 胶囊3 + 标题1 + 副标1 + 键帽4 + 热区1', #btn)
ok(find(btn, 'btnMenuB') and find(btn, 'btnMenuL') and find(btn, 'btnMenuR'), 'A2 胶囊三块齐（矩形+左右半圆）')
ok(find(btn, 'btnMenuT') ~= nil, 'A3 标题存在')
ok(find(btn, 'btnMenuS') ~= nil, 'A4 副标存在')
ok(find(btn, 'btnMenuKKT') ~= nil, 'A5 键帽字母存在')
ok(find(btn, 'btnMenuHit') ~= nil, 'A6 热区存在')

-- ===== B 文字高度判据 =====
local t = find(btn, 'btnMenuT')
ok(t.size[2] >= K.textMinH(t.font), 'B1 标题框高 ≥ font×1.45+6',
  t.size[2] .. ' vs ' .. K.textMinH(t.font))
ok(t.size[1] >= K.METRIC.minTextW, 'B2 文字宽 ≥ 最小宽度', t.size[1])
local s = find(btn, 'btnMenuS')
ok(s.size[2] >= K.textMinH(s.font), 'B3 副标框高 ≥ 判据', s.size[2] .. ' vs ' .. K.textMinH(s.font))

-- ===== C 热区 y 同号（回归守卫）=====
local hit = find(btn, 'btnMenuHit')
ok(hit.pos[2] == 300, 'C1 热区 y 与视觉同号（不是 -300）', hit.pos[2])
ok(hit.size[1] == 290 + 40 and hit.size[2] == 96 + 24, 'C2 热区外扩 +40/+24',
  hit.size[1] .. 'x' .. hit.size[2])
ok(hit.cursor and #hit.cursor == 5, 'C3 五个光标事件全挂')

-- ===== D 层号 =====
ok(hit.layer == 'touch', 'D1 热区在 touch 层', hit.layer)
ok(layers.order(hit.layer) > layers.order('card'), 'D2 touch 高于 card（不会被卡片吃掉点击）')

-- ===== E 键帽在胶囊内 =====
local cap = find(btn, 'btnMenuKKB')
local capX = cap.pos[1]
local expectCapX = 200 - 290 / 2 + 16 + 34 / 2
ok(math.abs(capX - expectCapX) < 0.001, 'E1 键帽 x = 左内边距16+半键帽17', capX .. ' vs ' .. expectCapX)
ok(capX - 17 > 200 - 290 / 2, 'E2 键帽完全收在胶囊左边界内', capX - 17)

-- ===== 颜色混合 =====
local W, BK = K.C(255, 255, 255, 255), K.C(255, 0, 0, 0)
ok(K.over(W, BK, 0.5) == K.C(255, 128, 128, 128), 'F1 over() 中值混合正确',
  string.format('0x%08X', K.over(W, BK, 0.5)))
ok(K.over(W, BK, 0) == W and K.over(W, BK, 1) == BK, 'F2 over() 两端点精确')

-- ===== G 整体 lint =====
local issues = V.lint(btn)
ok(#issues == 0, 'G1 合格按钮 lint 0 issue', #issues > 0 and issues[1].msg or '')

-- ===== H 回归守卫：半透明底按钮必须被 lint 抓住 =====
local badBtn = K.button {
  key = 'bad', x = 0, y = 0, w = 200, h = 64, label = '隐形按钮',
  fill = K.C(0x3D, 250, 244, 61), preset = 'plain',
  on = { CursorClick = function() end },
}
local wash = {
  key = 'wash', layer = 'wash', tpl = 'cell', name = 'wash', pos = { 0, 0 },
  size = { 1280, 720 }, color = K.C(255, 247, 250, 255),
}
local badIssues = V.lint({ wash, table.unpack and table.unpack(badBtn) or badBtn[1] })
local hasL3 = false
for i = 1, #badIssues do if badIssues[i].code == 'L3' then hasL3 = true end end
ok(hasL3, 'H1 半透明按钮压浅底 ⇒ lint 报 L3（隐形回归被挡住）', #badIssues .. ' issues')

-- ===== I 文字面板 =====
local panel = K.panel {
  key = 'p1', x = 0, y = 0, w = 380, h = 420, title = '契约',
  subtitle = '被动祝福 · 点我查看', lines = { '第一行', '第二行', '第三行' }, footer = '合计 25 秒',
}
-- 3(胶囊) + 1(标题) + 1(副标) + 1(分隔线) + 3(正文) + 1(页脚) = 10
ok(#panel == 10, 'I1 面板节点数 = 10', #panel)
local pIssues = V.lint(panel)
ok(#pIssues == 0, 'I2 面板 lint 0 issue', #pIssues > 0 and pIssues[1].msg or '')


-- ===== J 三态（hover / pressed）：框架层统一支持 =====
print('--- J 三态')

local GOLD = K.C(255, 240, 214, 150)
local tri = K.stateColors { base = GOLD }
ok(tri.normal ~= tri.hover and tri.hover ~= tri.pressed and tri.normal ~= tri.pressed,
  'J1 三态色两两不同', string.format('0x%X/0x%X/0x%X', tri.normal, tri.hover, tri.pressed))
-- J2（2026-11-17 改判据）：hover 的可感知性 = |ΔL| ≥ STATE_MIN_DELTA，方向由底色决定。
-- 旧断言写死"更亮"，而用户真机卡片底色是近白的 0xFFF5F0F1 —— 往白混只有 +1/+7/+2，
-- 看上去"没有悬浮高亮"。现在浅底改为压暗，判据跟着改成"差值够大"，并覆盖两个方向。
local dHover = math.abs(K.lum(tri.hover) - K.lum(tri.normal))
ok(dHover >= kitM.STATE_MIN_DELTA,
  string.format('J2a hover 与 normal 的亮度差 ≥ %d（%.1f）', kitM.STATE_MIN_DELTA, dHover))
local lightBase = 0xFFF5F0F1                        -- 真机入口卡底色（近白）
local lc = K.stateColor(lightBase, 'hover')
local dLight = math.abs(K.lum(lc) - K.lum(lightBase))
ok(dLight >= kitM.STATE_MIN_DELTA and K.lum(lc) < K.lum(lightBase),
  string.format('J2b 近白底 ⇒ hover 压暗且差值 ≥ %d（Δ=%.1f）', kitM.STATE_MIN_DELTA, dLight))
local darkBase = 0xFF1A1D26
local dc = K.stateColor(darkBase, 'hover')
ok(K.lum(dc) > K.lum(darkBase),
  string.format('J2c 深底 ⇒ hover 提亮（%.1f > %.1f）', K.lum(dc), K.lum(darkBase)))
ok(K.lum(tri.pressed) < K.lum(tri.normal),
  string.format('J3 pressed 比 normal 暗（%.1f < %.1f）', K.lum(tri.pressed), K.lum(tri.normal)))

-- 缺省派生确定性：同输入同输出；且比例真的被读（改比例 ⇒ 结果变）
local a1 = K.stateColor(GOLD, 'hover')
local a2 = K.stateColor(GOLD, 'hover')
ok(a1 == a2, 'J4 缺省派生确定性（同输入两次同值）', string.format('0x%X vs 0x%X', a1, a2))
local Kbig = kitM.new { layers = layers, stateMix = { hover = 0.40, press = 0.40 } }
ok(Kbig.stateColor(GOLD, 'hover') ~= a1,
  'J5 stateMix 覆盖生效（比例是可配置常量，不是硬编码）',
  string.format('0x%X vs 0x%X', Kbig.stateColor(GOLD, 'hover'), a1))

-- 显式色板优先于派生
local explicit = K.stateColors { base = GOLD, hover = 0x11223344, press = 0x55667788 }
ok(explicit.hover == 0x11223344 and explicit.pressed == 0x55667788,
  'J6 显式 hover/press 覆盖派生（项目侧可指定死值）')

-- 非法状态名：回落 normal 并回报（不抛错、不静默变成别的状态）
local fallback, okc, why = K.stateColor(GOLD, 'hovered')
ok(fallback == GOLD and okc == false and tostring(why):match('unknown'),
  'J7 非法状态名回落 normal 且回报错误', tostring(why))

-- 状态机：enter → leave 收敛
local log = {}
local st = K.states {
  key = 'navHelp', base = GOLD, keys = { 'navHelpB', 'navHelpL', 'navHelpR' },
  onChange = function(state, color) log[#log + 1] = state .. ':0x' .. string.format('%X', color) end,
}
st:enter()
ok(st:current() == 'hover' and st:color() == tri.hover,
  'J8 enter ⇒ hover，颜色 = 派生 hover', st:current())
st:leave()
ok(st:current() == 'normal' and st:color() == tri.normal and #log == 2,
  'J9 leave ⇒ 回到 normal（enter→leave 收敛，回调整整两次）',
  table.concat(log, ' '))

-- 幂等：鼠标扫过一排按钮不会因为重复 enter 反复闪
local n0 = #log
st:enter(); st:enter()
ok(#log == n0 + 1, 'J10 重复 enter 不重复触发 onChange（幂等）', #log - n0)

-- down → up → leave：按住时移出移入都不丢按下态
local st2 = K.states { base = GOLD, onChange = function() end }
st2:enter(); st2:down()
ok(st2:current() == 'pressed', 'J11 down ⇒ pressed', st2:current())
st2:leave()
ok(st2:current() == 'pressed', 'J12 按住时移出仍是 pressed（不会因为 leave 丢掉按下）', st2:current())
st2:up()
ok(st2:current() == 'normal', 'J13 区间外松手 ⇒ 直接回 normal（不下沉回 hover）', st2:current())
st2:enter(); st2:down(); st2:up()
ok(st2:current() == 'hover', 'J14 区间内松手 ⇒ hover', st2:current())
st2:click()
ok(st2:current() == 'hover', 'J15 click 不改外观状态（点击是动作，不是样式）', st2:current())

-- 按钮入口：states 挂到热区，且不增加节点
local seen = {}
local twin = K.button { key = 'nav2', x = 100, y = 200, w = 180, h = 56, label = '说明',
  preset = 'gold', on = { CursorClick = function() end } }
local btn3 = K.button {
  key = 'nav2', x = 100, y = 200, w = 180, h = 56, label = '说明', preset = 'gold',
  states = { onChange = function(state, color) seen[#seen + 1] = state .. ':' .. color end },
  on = { CursorClick = function() seen[#seen + 1] = 'click' end },
}
local h3 = find(btn3, 'nav2Hit')
ok(h3 ~= nil and #btn3 == #twin,
  'J16 带三态的按钮节点数与不带时相同（三态不新开渲染通道 / 不新增控件）',
  #btn3 .. ' vs ' .. #twin)
ok(btn3.state ~= nil and btn3.state.keys[1] == 'nav2B' and btn3.state.keys[3] == 'nav2R',
  'J17 按钮把状态机挂出来（keys 默认 = 胶囊三块）')
ok(h3.on.CursorEnter and h3.on.CursorExit and h3.on.CursorDown and h3.on.CursorUp
  and h3.on.CursorClick, 'J18 热区五事件齐（Click 仍是用户回调）')
h3.on.CursorEnter()
ok(btn3.state:current() == 'hover' and #seen == 1 and seen[1]:match('^hover'),
  'J19 热区 Enter ⇒ 状态机转 hover 并回调 onChange', table.concat(seen, ' '))
h3.on.CursorClick()
ok(seen[#seen] == 'click', 'J20 点击仍走用户回调（状态机不吞事件）', seen[#seen])
local wrote = {}
local nWrote = btn3.state:apply(function(k, f, c) wrote[#wrote + 1] = k .. '/' .. f end)
ok(nWrote == 3 and #wrote == 3 and wrote[1] == 'nav2B/imageColor',
  'J21 apply() 一行把当前色重涂给 3 个控件（render.write 通道）', table.concat(wrote, ' '))

-- 纯热区入口（画面由别处画）
local hit3 = K.hit {
  key = 'navHit2', x = 0, y = 0, w = 120, h = 40,
  states = { keys = { 'visualB' }, base = GOLD, onChange = function() end },
}
ok(hit3.state ~= nil and #hit3.cursor == 5, 'J22 K.hit + states ⇒ 五事件齐且带状态机', #hit3.cursor)
hit3.on.CursorEnter()
ok(hit3.state:current() == 'hover', 'J23 纯热区的 enter 生效', hit3.state:current())

-- 敏感性自检：把**两个**派生参数（比例与最小感知差）都归零 ⇒ 三态同色
-- （证明 J1/J2 依赖这两个参数；任一个被改坏，断言会红）
local savedDelta = kitM.STATE_MIN_DELTA
kitM.STATE_MIN_DELTA = 0
local Kzero = kitM.new { layers = layers, stateMix = { hover = 0, press = 0 } }
local z = Kzero.stateColors { base = GOLD }
ok(z.normal == z.hover and z.hover == z.pressed,
  'J24 比例=0 且 MIN_DELTA=0 ⇒ 三态同色（J1 对派生参数敏感，变异必红）',
  string.format('0x%X/0x%X/0x%X', z.normal, z.hover, z.pressed))
kitM.STATE_MIN_DELTA = savedDelta
-- 未给 states 的按钮保持旧行为（on 原样透传）
local plain = K.button { key = 'p0', x = 0, y = 0, w = 100, h = 40, label = 'x',
  on = { CursorClick = function() end } }
ok(plain.state == nil and find(plain, 'p0Hit').on.CursorEnter == nil,
  'J25 不给 states ⇒ 完全旧行为（热区只挂用户给的 on）')
-- 状态名只有三个，「词汇表」也由框架给出（项目侧别自造 'hovering' 之类）
local names = kitM.STATE_NAMES
ok(#names == 3 and names[1] == 'normal' and names[2] == 'hover' and names[3] == 'pressed',
  'J26 状态名词汇表 = normal/hover/pressed（唯一来源 kitM.STATE_NAMES）', table.concat(names, '/'))
ok(K.stateColor(GOLD, nil) == GOLD, 'J27 state 省略 ⇒ 当 normal（不抛错）')
-- 一行接线：K.repainter(R) 直接把状态色写进 render（signature 与 R.write(key, field, value) 对齐）
local Rfake = { writes = {} }
function Rfake.write(k, f, v) Rfake.writes[#Rfake.writes + 1] = k .. '|' .. f .. '|' .. string.format('%X', v) end
local repaint = K.repainter(Rfake)
local st3 = K.states { base = GOLD, keys = { 'aB', 'aL', 'aR' }, onChange = repaint }
st3:enter()
ok(#Rfake.writes == 3 and Rfake.writes[1] == 'aB|imageColor|' .. string.format('%X', tri.hover),
  'J28 K.repainter(R) 一行接上：enter 后 3 个控件各写一次 hover 色', table.concat(Rfake.writes, ' '))
ok(K.repainter(nil)(('hover'), 0, {}) == 0, 'J29 repainter 没有 R 时安全空转（headless 可用）')

-- 共享正文合同：不继承模板对齐；换行保留空白行与宿主左右内边距。
ok(K.text{key='body',text='正文',font=12}.valign == 'Middle', 'J1 默认显式垂直居中')
ok(K.text{key='body',text='正文',font=12,valign='Top'}.valign == 'Top', 'J2 保留显式对齐')
ok(K.text{key='multi',text='甲\n乙',font=12}.size[2] == K.textMinH(12,2), 'J4 未指定高度时按实际换行计算')
local cases = {
  {'', 12, 100, ''}, {'甲乙丙', 12, 28, '甲乙\n丙'},
  {'a\n\nb\n', 12, 100, 'a\n\nb\n'},
  {'abcdef', 10, 24, 'abc\ndef'},
  {'甲乙 skills', 10, 64, '甲乙 \nskills'},
  {'日本語한글', 10, 34, '日本語\n한글'},
}
for i,c in ipairs(cases) do
  ok(table.concat(K.wrapText(c[1],c[2],c[3]),'\n') == c[4], 'J3 换行合同 '..i)
end

print(string.format('\n== view_kit_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
