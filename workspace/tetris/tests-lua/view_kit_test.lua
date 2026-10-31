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
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')
local kitM = load('lua/tetris/view_kit.lua')

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

print(string.format('\n== view_kit_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
