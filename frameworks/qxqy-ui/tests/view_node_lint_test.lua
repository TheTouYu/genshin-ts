--[[==========================================================================
 tests/view_node_lint_test.lua —— 框架自带判据的能力证明（可随框架复制走）

 跑法（在 frameworks/qxqy-ui 下）：QxqyUiRoot=.<space>lua5.3 tests/view_node_lint_test.lua
 实际由 tests/run_all.lua 用 QxqyUiRoot=<框架根> 调用。

 覆盖两个入口：
   V.lint(list, {tplKeys=…})   —— L2/L2t：模板键契约
   V.lintPlan(plan, cfg)       —— P1–P5：布局表几何判据

 为什么放在框架里：这些判据不含任何游戏语义（不认方块、不认技能），
 任何一个用本框架的项目都该直接拿到。项目自己的测试只负责"把真源接进来"。
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or '.'
local function load(p) return assert(loadfile(ROOT .. '/' .. p))() end

local VM = load('lua/qxqy_ui/view_node.lua')
local LM = load('lua/qxqy_ui/view_layers.lua')
local V = VM.new { layers = LM }

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end
local function codes(issues)
  local t = {}
  for i = 1, #issues do t[#t + 1] = issues[i].code end
  table.sort(t)
  return table.concat(t, ',')
end

-- ============ L2t：模板键契约 ============
local node = { key = 'n1', name = 'n1', tpl = 'nope', size = { 100, 40 } }
ok(#V.lint({ node }) == 0, 'L-A 不传 tplKeys ⇒ 不判键（向后兼容）', codes(V.lint({ node })))
local iB = V.lint({ node }, { tplKeys = { 'cell', 'hit' } })
ok(#iB == 1 and iB[1].code == 'L2t' and iB[1].msg:find('nope', 1, true) ~= nil,
  'L-B 未知 tpl 键 ⇒ 一条 L2t 且点名该键', codes(iB))
local okNode = { key = 'n2', name = 'n2', tpl = 'cell', size = { 100, 40 } }
ok(#V.lint({ okNode }, { tplKeys = { 'cell' } }) == 0, 'L-C 合法键 ⇒ 0 issue')

-- ============ lintPlan P1–P5 ============
local CV = { W = 1280, H = 720 }
local function plan(t) return { text = t, inst = {}, skill = {} } end

-- P1 重名（数组形态才可能重名）
local i1 = V.lintPlan({ text = { { name = 'x', x = 0, y = 0, w = 10, h = 10 },
                                 { name = 'x', x = 50, y = 0, w = 10, h = 10 } } }, { canvas = CV })
ok(i1[1] and i1[1].code == 'P1', 'P-A 同 bucket 重名 ⇒ P1', codes(i1))

-- P2 两条文字同矩形（叠印）
local i2 = V.lintPlan(plan { a = { x = 0, y = 100, w = 200, h = 40, fs = 18 },
                             b = { x = 0, y = 100, w = 200, h = 40, fs = 18 } }, { canvas = CV })
ok(i2[1] and i2[1].code == 'P2', 'P-B 同矩形叠印 ⇒ P2', codes(i2))

-- P3 框高不足（1.45×20+4 = 33）
local i3 = V.lintPlan(plan { c = { x = 0, y = 0, w = 200, h = 32, fs = 20 } }, { canvas = CV })
ok(i3[1] and i3[1].code == 'P3', 'P-C 框高 32 < 33 ⇒ P3', codes(i3))

-- P4 出画布
local i4 = V.lintPlan(plan { d = { x = 700, y = 0, w = 300, h = 40, fs = 18 } }, { canvas = CV })
ok(i4[1] and i4[1].code == 'P4', 'P-D 右缘出画布 ⇒ P4', codes(i4))

-- P5 缺数值
local i5 = V.lintPlan(plan { e = { y = 0, w = 10, h = 10, fs = 18 } }, { canvas = CV })
ok(i5[1] and i5[1].code == 'P5', 'P-E 缺 x ⇒ P5', codes(i5))

-- 停靠态不判 P2/P3/P4
local i6 = V.lintPlan(plan { f = { x = 0, y = -4000, w = 10, h = 10, fs = 20 } },
  { canvas = CV, parkedY = -4000 })
ok(#i6 == 0, 'P-F 停靠态（parkedY）不报 P2/P3/P4', codes(i6))

-- 干净布局 0 issue
local i7 = V.lintPlan(plan { g = { x = -400, y = 200, w = 300, h = 44, fs = 20 } }, { canvas = CV })
ok(#i7 == 0, 'P-G 干净布局 ⇒ 0 issue', codes(i7))

print(string.format('\n== framework view_node_lint_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
