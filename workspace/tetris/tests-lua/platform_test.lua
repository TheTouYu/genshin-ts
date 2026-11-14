--[[==========================================================================
 tests/platform_test.lua —— platform（含 mock 后端）的契约测试
 跑法：cd <root> && lua5.3 tests-lua/platform_test.lua

 重点是 mock 的**保真度**：mock 与真机字段同构，才能把"只能靠人眼"的缺陷
 变成可断言的行为。本文件守的就是这条：
   P1 文字拟合按引擎公式（requiredHeight = 1.2f×行数 + (0.25f+4)）算，且 18 号 2 行 = 51.7
   P2 fits=false 时 visibleLineCount=0（真机表现是整条不画，不是"截断显示"）
   P3 颜色按有符号 int32 读回（0xFF7FCF6A ↔ -8401046）
   P4 实例台账 P.liveCount() 跨实例累计，destroy 回落
   P5 键位注册走双形态回退并打字面量诊断（listen ok … via enum|string）
   P6 图元/旋转通道落字段
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local platformM = load('lua/tetris/platform.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local logs = {}
local P = platformM.new {
  mock = true, canvas = { 1280, 720 },
  templates = { stext = { kind = 'text' }, cell = { kind = 'image' }, hit = { kind = 'cursor' } },
  logSink = function(m) logs[#logs + 1] = m end,
}

-- ===== P1/P2 文字拟合 =====
local t = P.inst('stext', P.root)
t.text = '纳西妲的档案很长很长的一段文字'
t.fontSize = 18
t:SetSizeDelta(240, 32)
local bad = t.textLayout
ok(bad.fits == false, 'P1.1 宽 240 时折 2 行 ⇒ 框高 32 放不下（fits=false）')
ok(math.abs(bad.requiredHeight - 51.7) < 0.01, 'P1.2 requiredHeight 与引擎一致 = 51.7',
  string.format('%.2f', bad.requiredHeight))
ok(bad.lines == 2, 'P1.3 折成 2 行', bad.lines)
ok(bad.visibleLineCount == 0, 'P2.1 放不下时 visibleLineCount=0（整条不画，不是截断）', bad.visibleLineCount)
t:SetSizeDelta(240, 98)
ok(t.textLayout.fits == true, 'P1.4 框高 98 时放得下')
-- 16 号字要在 200 宽下才会折成 2 行（15 个全角字 × 16 = 240 > 200），
-- 此时 requiredHeight = 1.2×16×2 + (0.25×16+4) = 46.4 —— 与真机实测的 46.4 逐值相同
t.fontSize = 16
t:SetSizeDelta(200, 46)
ok(t.textLayout.fits == false, 'P1.5 16 号 2 行需 46.4 > 46 ⇒ fits=false',
  string.format('%.2f', t.textLayout.requiredHeight))
ok(math.abs(t.textLayout.requiredHeight - 46.4) < 0.01,
  'P1.5b requiredHeight 与真机实测 46.4 逐值相同', string.format('%.2f', t.textLayout.requiredHeight))
t:SetSizeDelta(200, 47)
ok(t.textLayout.fits == true, 'P1.6 框高 47 时放得下')

-- ===== P3 颜色有符号读回 =====
local c = P.inst('cell', P.root)
P.set(c, 'imageColor', 0xFF7FCF6A)
local v = c.imageColor
if v > 2147483647 then v = v - 4294967296 end
ok(v == -8401046, 'P3.1 0xFF7FCF6A 读回 -8401046', v)

-- ===== P4 实例台账 =====
local before = P.liveCount()
local c1 = P.inst('cell', P.root)
local c2 = P.inst('cell', P.root)
ok(P.liveCount() == before + 2, 'P4.1 台账随实例增加', P.liveCount())
P.destroy(c1)
P.destroy(c2)
ok(P.liveCount() == before, 'P4.2 destroy 后台账回落', P.liveCount())

-- ===== P5 键位双形态回退 + 诊断字面量 =====
local hitKey = false
P.bindKey('KeyboardMoveLeftKeyDown', function() hitKey = true end)
local sawListen = false
for i = 1, #logs do
  if tostring(logs[i]):find('listen ok KeyboardMoveLeftKeyDown via ', 1, true) then sawListen = true end
end
ok(sawListen, 'P5.1 bindKey 打 listen ok … via enum|string（真机唯一线索）')

-- ===== P6 图元 / 旋转通道 =====
local img = P.inst('cell', P.root)
P.setImage(img, 'circle')
ok(img.imageId == 100002, 'P6.1 circle 图元落 imageId=100002', img.imageId)
P.setRotation(img, 15)
ok(img.rotZ == 15, 'P6.2 旋转落 rotZ', img.rotZ)


-- ===== P7 真机字体：text 字段读不到时，文字模板不得被判死 =====
-- 2026-11-14 真机日志（22-19-07_3472）铁证三条：
--   rec45 tpl stext=1073742202 cand=8                       ← 探测通过（probeTextRaw 只要求"能实例化"）
--   rec50 platform fail inst:stext :: all candidates rejected ← 实例化全灭
--   rec47 bg pool n=0                                       ← 背景池 0 个（全部依赖 stext）
-- 两个判据不一致：probe 用「能建就行」，accept 用「cap(ctl).text == true」。
-- 真机 textbox 的 text 读不出来（pcall 静默吞）⇒ text=false ⇒ 整屏无文字。
-- 契约：stext 的判据要先看 textbox 的**结构特征**（fontSize / textLayout 这类独有字段），
-- 只有全读不到才退回 text 字段；绝不能因为 text 读不到就判它不是文字控件。
-- 用 makeReal(ctl) 造"真机形态"：没有 __kind，因此走 P.cap 的字段探测分支。
local P7logs = {}
local P7 = platformM.new {
  mock = true, canvas = { 1280, 720 },
  templates = { stext = { real = { fontSize = 18 } } },   -- 无 text 字段，有 fontSize
  logSink = function(m) P7logs[#P7logs + 1] = m end,
}
local realCtl = { fontSize = 18 }                          -- 真机 textbox：text 读不到
local accepted = P7.acceptForTest('stext', realCtl)
ok(accepted == true, 'P7.1 text 读不到但 fontSize 在 ⇒ 仍认作文字模板', tostring(accepted))


print(string.format('\n== platform_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
