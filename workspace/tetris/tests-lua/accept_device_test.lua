--[[==========================================================================
 tests-lua/accept_device_test.lua —— 真机字体模板判据（2026-11-14 事故回灌）
 跑法：cd <root> && lua5.3 tests-lua/accept_device_test.lua

 为什么单独一个文件：这条 bug 只在**真机**出现（模拟器的 textbox 一定能读 text），
 所以它无法被模拟器用例抓到。写在这里，是为了让"真机形态"第一次有了可执行判据。

 事故铁证（真机日志 2026-11-14_22-19-07_3472_110170759.gia）：
   rec45 tpl stext=1073742202 cand=8                        ← 探测通过
   rec50 platform fail inst:stext :: all candidates rejected ← 实例化全灭
   rec47 bg pool n=0                                        ← 背景池 0（文字控件全建不出来）
 用户看到：背景消失、开局/结算文字全无、结算直接跳过。
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end
local platformM = load('lua/tetris/platform.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local P = platformM.new { mock = true, canvas = { 1280, 720 }, templates = {}, logSink = function() end }

-- A1 真机形态：text 读不出来，但有 fontSize ⇒ 仍是文字控件
ok(P.acceptForTest('stext', { fontSize = 18 }) == true,
  'A1 text 不可读 + fontSize 在 ⇒ 认作文字模板')

-- A2 只有 textLayout（某些宿主不暴露 fontSize）
ok(P.acceptForTest('stext', { textLayout = {} }) == true,
  'A2 只有 textLayout ⇒ 仍认作文字模板')

-- A3 只有 fontColor
ok(P.acceptForTest('stext', { fontColor = 0 }) == true,
  'A3 只有 fontColor ⇒ 仍认作文字模板')

-- A4 text 可读（模拟器/旧真机）照常通过
ok(P.acceptForTest('stext', { text = 'abc' }) == true, 'A4 text 可读 ⇒ 通过')

-- A5 负样本：真的是图片控件（一个文字特征都没有）必须被拒
ok(P.acceptForTest('stext', { imageColor = 0 }) == false,
  'A5 只有 imageColor 的图片控件 ⇒ 必须拒绝（判据不能松到全收）')

-- A6 负样本：空控件必须被拒
ok(P.acceptForTest('stext', {}) == false, 'A6 空控件 ⇒ 必须拒绝')

-- A7 cursor 判据不受影响（回归）
ok(P.acceptForTest('hit', { AddCursorEventListener = function() end }) == true,
  'A7 cursor 模板判据不变')
ok(P.acceptForTest('cell', { imageColor = 0 }) == true, 'A8 image 模板判据不变')

-- A9/A10 真机 GUID 重编号：所有 cell/hit 实例都必须走**探测后的** TEMPLATES.*，
-- 不能用 config 里的原始候选 Guids（真机导入后编辑器会重编号，原始值全部失效）。
-- 事故实证：真机日志 rec48 `tpl cell ok guid=1073741849` 而 rec47 `bg pool n=0`
-- —— 背景池用 TPL_GUIDS.cell 建，那不是探测出的 guid，于是 16 次全失败 ⇒ comps=0/14 ⇒ 背景全空。
local src = assert(io.open(ROOT .. '/lua/main.lua')):read('*a')
local rawCell, rawHit = {}, {}
for line in src:gmatch('[^\n]+') do
  -- 只算真正的**实例化**调用（instInto/InstantiateClientUIControl），注释与日志行不算
  if not line:match('^%s*%-%-') and line:match('instInto%s*%(%s*TPL_GUIDS%.cell')
     or line:match('InstantiateClientUIControl%s*%(%s*TPL_GUIDS%.cell') then
    rawCell[#rawCell + 1] = line
  end
  if not line:match('^%s*%-%-') and line:match('instInto%s*%(%s*TPL_GUIDS%.hit') then
    rawHit[#rawHit + 1] = line
  end
end
ok(#rawCell == 0, 'A9 main.lua 不得用原始 Guids 实例化 cell（真机 guid 会重编号）', #rawCell .. ' 处：' .. table.concat(rawCell, ' | '))
ok(#rawHit == 0, 'A10 main.lua 不得用原始 Guids 实例化 hit', #rawHit .. ' 处')

-- A11 反向保护：探测后的 TEMPLATES.cell 必须真的被用到（否则是"删了但没接"）
ok(src:match('TEMPLATES%.cell'), 'A11 实例化走 TEMPLATES.cell（探测结果）')

-- A12/A13 别名：config 里文字模板候选表的键叫 `settleText`，而平台/渲染层用 tplKey `stext`。
-- 真机日志 rec50 `platform fail inst:stext :: all candidates rejected` +
-- `TPL_GUIDS.stext == nil` ⇒ 候选查成空表、兜底扫描区间又不含 1073742202 ⇒ 全灭。
local CFGM = load('lua/tetris/config.lua')
local G = CFGM.TPL_GUIDS or {}
ok(G.stext ~= nil and G.stext == G.settleText and #G.stext > 0,
  'A12 TPL_GUIDS.stext 必须是 settleText 的别名（单源，非空）',
  'stext=' .. tostring(G.stext) .. ' settleText_n=' .. #(G.settleText or {}))

-- A13 端到端：用真实 config 的模板表，P.inst('stext') 必须真的试到那张表的第一个候选
local seen = {}
local fakeGame = {
  InstantiateClientUIControl = function(g) seen[#seen + 1] = g return nil end,
  DestroyClientUIControl = function() end,
}
local P2 = platformM.new { game = fakeGame, root = {}, canvas = { 1280, 720 },
  templates = G, logSink = function() end }
P2.inst('stext', {})
ok(seen[1] == G.settleText[1], 'A13 P.inst(stext) 必须尝试 settleText 首个候选',
  '实际首个: ' .. tostring(seen[1]) .. '，期望: ' .. tostring(G.settleText[1]))

-- A14 诊断可分性：候选表为空（配置/键名问题）必须打印出**已定义的键名**，
-- 好让下一轮一眼看出是键名不匹配，而不是又去改能力判据（v6.20 就是这么白改一轮的）。
local logs = {}
local P3 = platformM.new { game = { InstantiateClientUIControl = function() return nil end,
                                    DestroyClientUIControl = function() end },
  root = {}, canvas = { 1280, 720 },
  templates = { settleText = { 1 } },           -- 故意不放 stext
  logSink = function(msg) logs[#logs + 1] = msg end }
P3.inst('nosuchkey', {})
local joined = table.concat(logs, '\n')
ok(joined:find('cands=0', 1, true) ~= nil and joined:find('settleText', 1, true) ~= nil,
  'A14 候选表为空时必须打出 cands=0 并列出已定义的键名', joined)

print(string.format('\n== accept_device_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
