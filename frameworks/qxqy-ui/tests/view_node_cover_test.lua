--[[==========================================================================
 tests/view_node_cover_test.lua —— 背景铺满判据 V.lintCover 的能力证明（可随框架复制走）

 跑法（在 frameworks/qxqy-ui 下）：QxqyUiRoot=.<space>lua5.3 tests/view_node_cover_test.lua
 实际由 tests/run_all.lua 用 QxqyUiRoot=<框架根> 调用。

 覆盖：
   C1 图元并集 ⊇ 设计板（= "背景两侧露白" 的数据层判据）
   C2 缺 x/y/w/h 数值；C3 rot 非数值
   M.rectAABB 旋转外接盒

 为什么放在框架里：判据不含任何游戏语义（不认方块、不认技能），
 任何用本框架做全屏背景的项目都该直接拿到；项目测试只负责把真源接进来。
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or '.'
local function load(p) return assert(loadfile(ROOT .. '/' .. p))() end

local VM = load('lua/qxqy_ui/view_node.lua')

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

-- ============ rectAABB ============
local l, b, r, t = VM.rectAABB(0, 0, 100, 100, 0)
ok(l == -50 and b == -50 and r == 50 and t == 50, 'AB-A 未旋转 100×100 ⇒ ±50',
  string.format('%.1f %.1f %.1f %.1f', l, b, r, t))
l, b, r, t = VM.rectAABB(0, 0, 100, 100, 45)
ok(math.abs(r - 70.7106) < 0.01 and math.abs(t - 70.7106) < 0.01,
  'AB-B 旋转 45° ⇒ 外接盒 ±70.71（w/2·|cos|+h/2·|sin|）',
  string.format('%.4f %.4f', r, t))
l, b, r, t = VM.rectAABB(0, 0, 1760, 44, 0)
ok(math.abs(r - 880) < 0.01 and math.abs(t - 22) < 0.01,
  'AB-C 云带 1760×44 ⇒ x ±880 / y ±22（旧实现用外接圆把 y 算成 ±880）',
  string.format('%.1f %.1f', r, t))

-- ============ C1 设计板覆盖 ============
local cover = {
  { name = 'topBand', x = 0, y = 344, w = 1760, h = 44 },
  { name = 'botBand', x = 0, y = -344, w = 1760, h = 44 },
  -- 云不参与 360 边沿（h=120 ⇒ ±356，让云带独占上下边沿，负样本才有意义）
  { name = 'leftCloud', x = -488, y = 296, w = 320, h = 120 },
  { name = 'rightCloud', x = 488, y = -296, w = 320, h = 120 },
}
local is, ext = VM.lintCover(cover, { baseW = 1280, baseH = 720 })
ok(#is == 0 and ext.n == 4, 'C1-A 云带打穿设计板 ⇒ 零问题',
  codes(is) .. ' ext=' .. string.format('%.0f,%.0f,%.0f,%.0f', ext.L, ext.R, ext.B, ext.T))
ok(math.abs(ext.T - 366) < 0.01 and math.abs(ext.B + 366) < 0.01,
  'C1-B 外缘读数 = ±366（y 344 + 半高 22）', string.format('%.1f %.1f', ext.B, ext.T))

-- C1 负样本：打穿上边
local noTop = { cover[2], cover[3], cover[4] }
local isN = VM.lintCover(noTop, { baseW = 1280, baseH = 720 })
ok(#isN == 1 and isN[1].code == 'C1' and isN[1].msg:find('上缺', 1, true) ~= nil,
  'C1-C 缺上边 ⇒ 一条 C1 且点名"上缺"', isN[1] and isN[1].msg)

-- C1 负样本：空表
local isE = VM.lintCover({}, { baseW = 1280, baseH = 720 })
ok(#isE == 1 and isE[1].code == 'C1', 'C1-D 空构图 ⇒ 一条 C1', isE[1] and isE[1].msg)

-- C1 容差：差 5px 时 tol=6 应放过、tol=0 应报红
-- 下边少 5px：y=-344 配 h=22 ⇒ 外缘 -355，差 5
local short = { { x = 0, y = 344, w = 1760, h = 44 }, { x = 0, y = -344, w = 1760, h = 22 } }
ok(#VM.lintCover(short, { baseW = 1280, baseH = 720 }) == 1, 'C1-E 下边少 5px ⇒ 默认 0 容差报红',
  codes(VM.lintCover(short, { baseW = 1280, baseH = 720 })))
ok(#VM.lintCover(short, { baseW = 1280, baseH = 720, tol = 6 }) == 0, 'C1-F tol=6 ⇒ 5px 缺口放过（容差可用）')

-- ============ C2 / C3 ============
local is2 = VM.lintCover({ { x = 0, y = 0, h = 10 } }, { baseW = 1280, baseH = 720 })
ok(#is2 == 2 and codes(is2) == 'C1,C2', 'C2-A 缺 w ⇒ C2（且空构图另有 C1）', codes(is2))
local is3 = VM.lintCover({ { x = 0, y = 0, w = 10, h = 10, rot = 'x' } }, { baseW = 1280, baseH = 720 })
ok(codes(is3) == 'C1,C3', 'C3-A rot 非数值 ⇒ C3', codes(is3))

-- ============ 框架实例也暴露同一套函数 ============
local LM = load('lua/qxqy_ui/view_layers.lua')
local V = VM.new { layers = LM }
ok(type(V.lintCover) == 'function' and type(V.rectAABB) == 'function',
  'API-A 实例 V.lintCover / V.rectAABB 可用（与 M.* 同一实现）')
ok(select(3, V.rectAABB(0, 0, 100, 100, 45)) == select(3, VM.rectAABB(0, 0, 100, 100, 45)),
  'API-B 实例与模块口径一致（不搞第二份数学）')

print(string.format('\n%d passed, %d failed', pass, fail))
if fail > 0 then os.exit(1) end
