--[[==========================================================================
 tests-lua/templates_test.lua —— 模板探测模块（含 DEGRADE 降级契约）
 跑法：cd workspace/tetris && lua5.3 tests-lua/templates_test.lua

 为什么值得单测：探测本身要引擎，但**降级契约**是纯逻辑——
 "哪个模板缺了会怎样"如果只写在注释里，半年后没人知道 hit 缺失到底还能不能玩。
 T1-T4 全绿 = 这张表还在、三个模板的后果没被悄悄改掉。
==========================================================================]]
local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end
local TM = load('lua/tetris/templates.lua')

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

-- ===== T1 DEGRADE 表覆盖三个模板，且各自说清后果 =====
ok(type(TM.DEGRADE) == 'table', 'T1.1 DEGRADE 是表')
for _, k in ipairs({ 'cell', 'hit', 'stext' }) do
  local v = TM.DEGRADE[k]
  ok(type(v) == 'string' and #v > 6, 'T1.2 DEGRADE.' .. k .. ' 有文字说明', tostring(v))
end
ok(TM.DEGRADE.cell:find('不可玩', 1, true) ~= nil or TM.DEGRADE.cell:find('error', 1, true) ~= nil,
  'T1.3 cell 缺失被标成硬失败（允许炸）', TM.DEGRADE.cell)
ok(TM.DEGRADE.hit:find('点不动', 1, true) ~= nil or TM.DEGRADE.hit:find('热区', 1, true) ~= nil,
  'T1.4 hit 缺失说清是"点不动"而不是崩溃', TM.DEGRADE.hit)
ok(TM.DEGRADE.stext:find('文字', 1, true) ~= nil or TM.DEGRADE.stext:find('textbox', 1, true) ~= nil,
  'T1.5 stext 缺失说清是"描述层文字缺失 + 回退"', TM.DEGRADE.stext)

-- ===== T2 探测成功路径：note 打可复现日志，ok 表如实 =====
local logs = {}
local T = TM.new {
  guids = { cell = { 1, 2 }, hit = { 3 }, settleText = { 9 } },
  probeOne = function(cands, needCursor)
    return { fake = true }, cands[#cands]      -- 永远挑最后一个候选
  end,
  probeTextOne = function() return 9 end,
  log = function(m) logs[#logs + 1] = m end,
}
local _, cguid = T:probeCell()
ok(cguid == 2, 'T2.1 probeCell 取到候选里的 guid', tostring(cguid))
local _, hguid = T:probeHit()
ok(hguid == 3, 'T2.2 probeHit 取到候选里的 guid', tostring(hguid))
ok(T:probeText() == 9, 'T2.3 probeText 走注入的 probeTextOne')
ok(T.ok.cell and T.ok.hit and T.ok.stext, 'T2.4 ok 表三项都真')
local sawLog = false
for i = 1, #logs do if logs[i]:find('tpl cell=2', 1, true) then sawLog = true end end
ok(sawLog, 'T2.5 成功也打日志（可复现读数，不是只在失败时说话）')

-- ===== T3 探测失败：必须打 NONE + degrade 原文，不许静默 =====
local logs2 = {}
local T2 = TM.new {
  guids = { cell = { 1 }, hit = { 3 } },
  probeOne = function() return nil, nil end,
  probeTextOne = function() return nil end,
  log = function(m) logs2[#logs2 + 1] = m end,
}
T2:probeCell() T2:probeHit() T2:probeText()
ok(T2.cell == nil and T2.hit == nil and T2.stext == nil, 'T3.1 失败时值为 nil')
ok(not T2.ok.cell, 'T3.2 ok 表如实为假')
local noneLogs, degradeLogs = 0, 0
for i = 1, #logs2 do
  if logs2[i]:find('=NONE', 1, true) then noneLogs = noneLogs + 1 end
  if logs2[i]:find('degrade=', 1, true) then degradeLogs = degradeLogs + 1 end
end
ok(noneLogs == 3, 'T3.3 三个模板各打一条 NONE', noneLogs)
ok(degradeLogs == 3, 'T3.4 每条 NONE 都带 degrade 原文（人一眼知道后果）', degradeLogs)

-- ===== T4 report 一行汇总 + text() 懒探测 =====
local logs3 = {}
local T3 = TM.new {
  guids = { settleText = { 9 } },
  probeOne = function() return nil, nil end,
  probeTextOne = function() return 9 end,
  log = function(m) logs3[#logs3 + 1] = m end,
}
ok(T3.stext == nil, 'T4.1 未探测前 stext 是 nil')
ok(T3:text() == 9, 'T4.2 text() 懒探测并返回 guid')
local summary
for i = 1, #logs3 do if logs3[i]:find('tpl report', 1, true) then summary = logs3[i] end end
T3:report()
summary = nil
for i = 1, #logs3 do if logs3[i]:find('tpl report', 1, true) then summary = logs3[i] end end
ok(summary ~= nil and summary:find('cell=NONE', 1, true) ~= nil
  and summary:find('stext=ok', 1, true) ~= nil, 'T4.3 report 一行说清三项状态', tostring(summary))

print(string.format('\n== templates_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
