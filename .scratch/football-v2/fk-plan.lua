-- 力输入套件布局 lint（qxqy-ui V.lintPlan P1–P5 真跑）
-- 画布 1600x900，plan 坐标=中心化（gil_x-800, gil_y-450，y 向上同向）
package.path = 'frameworks/qxqy-ui/lua/?.lua;' .. package.path
local V = require('qxqy_ui.view_node')

-- gil 绝对坐标 → plan 中心坐标
local function P(x, y, w, h, fs) return { x = x - 800, y = y - 450, w = w, h = h, fs = fs } end

local plan = { fk = {} }
local t = plan.fk

-- 标题 / 状态行
t[#t+1] = { name='fk_title',   r = P(240, 640, 320, 40, 22) }
t[#t+1] = { name='fk_status',  r = P(280, 306, 400, 36, 18) }

-- 四行数值：label+value / [-] / [+]
local rows = {
  { n='fk_vx', y=596, label='x 前后' },
  { n='fk_vy', y=552, label='y 上下' },
  { n='fk_vz', y=508, label='z 左右' },
  { n='fk_vs', y=464, label='s 缩放' },
}
for _, row in ipairs(rows) do
  t[#t+1] = { name=row.n,      r = P(170, row.y, 200, 44, 20) }
  t[#t+1] = { name=row.n..'_m', r = P(310, row.y, 56, 44, 20) }  -- [-]
  t[#t+1] = { name=row.n..'_p', r = P(374, row.y, 56, 44, 20) }  -- [+]
end

-- 预设行（5 键）
local presets = { 'fk_p1','fk_p2','fk_p3','fk_p4','fk_p5' }
for i, n in ipairs(presets) do
  t[#t+1] = { name=n, r = P(104 + (i-1)*92, 404, 84, 44, 20) }
end

-- 动作行：施力/清力/复位 + 步进
t[#t+1] = { name='fk_apply', r = P(134, 352, 116, 44, 20) }
t[#t+1] = { name='fk_clear', r = P(262, 352, 116, 44, 20) }
t[#t+1] = { name='fk_reset', r = P(390, 352, 116, 44, 20) }
t[#t+1] = { name='fk_step',  r = P(505, 352, 100, 44, 18) }

-- 热区（视觉框内缩 2px，避免 P2 同矩形叠印）
for _, e in ipairs({
  {'fk_xm',170,596},{'fk_xp',374,596},{'fk_ym',310,552},{'fk_yp',374,552},
  {'fk_zm',310,508},{'fk_zp',374,508},{'fk_sm',310,464},{'fk_sp',374,464},
  {'fk_pz1',104,404},{'fk_pz2',196,404},{'fk_pz3',288,404},{'fk_pz4',380,404},{'fk_pz5',472,404},
  {'fk_az_apply',134,352},{'fk_az_clear',262,352},{'fk_az_reset',390,352},{'fk_az_step',505,352},
}) do
  t[#t+1] = { name=e[1], r = P(e[2], e[3], 52, 40) }  -- 按钮热区统一 52x40（含内缩）
end

-- 踢球热区（压在既有 hud_k1..k6 上，行高 44 内缩）
for i=1,6 do
  t[#t+1] = { name=('fk_kick%d'):format(i), r = P(1380, 636-(i-1)*48, 376, 40) }
end

local issues = V.lintPlan(plan, { canvas = { W = 1600, H = 900 } })
if #issues == 0 then
  print('lintPlan PASS (0 issues, ' .. #t .. ' controls)')
else
  for _, it in ipairs(issues) do print(it.code, it.key, it.msg) end
  os.exit(1)
end
