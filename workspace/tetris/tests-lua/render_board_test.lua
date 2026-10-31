--[[==========================================================================
 tests-lua/render_board_test.lua —— 架构骨架的 headless 验收（不依赖模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/render_board_test.lua
 判据：输出全 PASS、退出码 0。

 这一份测试要证明四件事：
   A 纯描述 → mock 引擎 → 字段与 tests/01 的断言**逐值相等**（几何/颜色/尺寸没漂）
   B 层序由 layer 决定，不由调用顺序决定（plate < board < frame 的创建序号单调）
   C 二次 apply 不重建（增量更新通道成立，60fps 下不会疯狂造控件）
   D 静态检查能在 headless 抓住「半透明压浅底」「交互控件被上层遮挡」「文字折行被裁」
     —— 这三类以前只能靠开模拟器出图 + 人眼看。
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local platform = load('lua/tetris/platform.lua')
local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')
local renderM = load('lua/tetris/render.lua')
local vboard = load('lua/tetris/view_board.lua')

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

local function eq(a, b) return a == b end

-- 引擎把 32 位色当有符号 int32 读回；mock 里存的是无符号 ⇒ 比较前统一
local function signed(v)
  if v and v >= 2147483648 then return v - 4294967296 end
  return v
end

-- ===== 组装 =====
local P = platform.new {
  mock = true, canvas = { 1280, 720 },
  templates = { cell = { kind = 'image' }, hit = { kind = 'cursor' }, stext = { kind = 'text' } },
}
local V = vnode.new { layers = layers }
local R = renderM.new { platform = P, layers = layers }
local B = vboard.new { config = cfg }

local nodes = B.board { plateColor = cfg.C(255, 26, 32, 44), cellColor = cfg.COL_EMPTY,
  frameColor = cfg.C(255, 88, 108, 132) }
R.apply(nodes)

-- ===== A 几何 / 颜色 / 尺寸（对齐 tests/01 的断言值）=====
local c1, c11, c200 = R.get('cell1'), R.get('cell11'), R.get('cell200')
ok(c1 ~= nil, 'A1 cell1 已创建')
ok(c1 and eq(c1.anchoredPositionX, -135), 'A2 cell1 x = -135', c1 and c1.anchoredPositionX)
ok(c1 and eq(c1.anchoredPositionY, 285), 'A3 cell1 y = 285', c1 and c1.anchoredPositionY)
ok(c11 and eq(c11.anchoredPositionY, 255), 'A4 cell11 y = 255（换行 = PITCH）', c11 and c11.anchoredPositionY)
ok(c200 and eq(c200.anchoredPositionX, 135), 'A5 cell200 x = 135', c200 and c200.anchoredPositionX)
ok(c200 and eq(c200.anchoredPositionY, -285), 'A6 cell200 y = -285', c200 and c200.anchoredPositionY)
ok(c1 and eq(c1.sizeDeltaX, 28), 'A7 格宽 = CELL = 28', c1 and c1.sizeDeltaX)
ok(c1 and eq(signed(c1.imageColor), -197121), 'A8 空格色 = COL_EMPTY（真机读 -197121）',
  c1 and signed(c1.imageColor))
ok(c1 and eq(c1.name, 'cell1') and c1.visible == true, 'A9 name/visible 已落到控件')
local n = 0
for i = 1, 200 do if R.get('cell' .. i) then n = n + 1 end end
ok(n == 200, 'A10 200 格全在场', n)

-- ===== B 层序由 layer 决定 =====
local seqPlate = P.seqOf(R.get('boardPlate'))
local seqCell = P.seqOf(R.get('cell1'))
local seqFrame = P.seqOf(R.get('frame1'))
ok(seqPlate and seqCell and seqFrame and seqPlate < seqCell and seqCell < seqFrame,
  'B1 创建序 = plate < board < frame（层序单源生效）',
  tostring(seqPlate) .. '/' .. tostring(seqCell) .. '/' .. tostring(seqFrame))
ok(#R.issues() == 0, 'B2 无层序冲突', #R.issues() > 0 and R.issues()[1].msg or '')

-- ===== C 增量更新：二次 apply 不重建 =====
local instBefore = P.stats().inst
R.apply(nodes)
ok(P.stats().inst == instBefore, 'C1 二次 apply 不重建控件', P.stats().inst - instBefore)
local moved = {}
for i = 1, #nodes do moved[i] = nodes[i] end
for i = 1, #moved do
  if moved[i].key == 'cell1' then moved[i].color = cfg.C(255, 60, 220, 240) end
end
R.apply(moved)
ok(eq(signed(R.get('cell1').imageColor), signed(cfg.C(255, 60, 220, 240))), 'C2 改色只写变化字段')
ok(P.stats().inst == instBefore, 'C3 改色不重建')

-- ===== D 静态检查抓得住「以前只能靠人眼」的缺陷 =====
local WASH = cfg.C(255, 247, 250, 255)          -- 近白整屏底（真实 wash 色）
local DARK = cfg.C(255, 18, 22, 30)
local CAPSULE = cfg.C(0x3D, 0xFA, 0xF4, 0x3D)   -- 历史 bug：alpha=0x3D≈24% 白
local function fn() end

local bugTree = {
  { key = 'wash', layer = 'wash', tpl = 'cell', name = 'washBg', pos = { 0, 0 },
    size = { 1280, 720 }, color = WASH },
  { key = 'settleCard', layer = 'card', tpl = 'cell', name = 'settleCard', pos = { 0, 0 },
    size = { 780, 400 }, color = DARK, seq = 1 },
  { key = 'ptaagain', layer = 'card', tpl = 'cell', name = 'ptaagain', pos = { 0, -220 },
    size = { 200, 64 }, color = CAPSULE, cursor = { 'Click' }, on = { Click = fn }, seq = 2 },
  { key = 'overlapOver', layer = 'toast', tpl = 'cell', name = 'overlapOver', pos = { 0, -220 },
    size = { 220, 70 }, color = DARK, seq = 3 },
  { key = 'titleText', layer = 'card', tpl = 'stext', name = 'titleText', pos = { 0, 100 },
    size = { 200, 20 }, text = '再来一局', font = 20, seq = 4 },
}

local issues = V.lint(bugTree)
local function has(code, key)
  for i = 1, #issues do
    if issues[i].code == code and (key == nil or issues[i].key == key) then return true, issues[i].msg end
  end
  return false
end
local okL3, msgL3 = has('L3', 'ptaagain')
ok(okL3, 'D1 抓：半透明胶囊压近白底 ⇒ 近似隐形', msgL3 or '未报 L3')
local okL5, msgL5 = has('L5', 'ptaagain')
ok(okL5, 'D2 抓：交互控件被上层遮挡', msgL5 or '未报 L5')
local okL4, msgL4 = has('L4', 'titleText')
ok(okL4, 'D3 抓：文字行高放不下（折行被裁）', msgL4 or '未报 L4')
ok(#issues >= 3, 'D4 一次 lint 报出 ' .. #issues .. ' 条', '')

-- 干净树不该有误报
local cleanIssues = V.lint(nodes)
ok(#cleanIssues == 0, 'D5 干净棋盘树 0 误报', #cleanIssues > 0 and cleanIssues[1].msg or '')

-- ===== 汇总 =====
print(string.format('\n== render_board_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
