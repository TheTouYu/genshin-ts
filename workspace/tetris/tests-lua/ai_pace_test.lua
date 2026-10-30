-- aiPace 纯函数单测（v4.0 ④）：跑法 `lua5.3 tests-lua/ai_pace_test.lua`，退出码 0=全绿。
-- 为什么单测而不是只靠 runner：这条曲线是"AI 跟不跟得上速度"的唯一真源，纯数学，秒级可证。
local M = assert(loadfile('lua/tetris/config.lua'))()
local NUM = M.NUM
local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

-- 1) 三档都不再故意失误
for i, lv in ipairs(NUM.AI_LEVELS) do
  ok(lv.pMistake == 0, '1.' .. i .. ' ' .. lv.name .. ' pMistake=0（不故意摆错位）')
  ok((lv.nudgePct or 0) == 0, '1.' .. i .. ' ' .. lv.name .. ' nudgePct=0（不故意破坏落点）')
  ok(lv.hold == 1, '1.' .. i .. ' ' .. lv.name .. ' hold=1（全档会用暂存）')
end
-- 2) 只有 easy 走简化评估
ok(NUM.AI_LEVELS[1].simple == true, '2.1 easy 走简化评估（弱在"想得少"）')
ok(NUM.AI_LEVELS[2].simple ~= true, '2.2 normal 不简化')
ok(NUM.AI_LEVELS[3].simple ~= true, '2.3 hard 不简化')

-- 3) 每块用时随等级**单调不增**（用户第 4 点核心诉求）
for tier = 1, 3 do
  local prev = math.huge
  local mono = true
  local samples = {}
  for lv = 1, NUM.LEVEL_CAP do
    local pace = NUM.aiPace(tier, lv)
    samples[#samples + 1] = string.format('L%d=%.2f', lv, pace)
    if pace > prev + 1e-9 then mono = false end
    prev = pace
  end
  ok(mono, '3.' .. tier .. ' tier' .. tier .. ' pace 随等级单调不增 [' .. table.concat(samples, ' ') .. ']')
  local p1, p12 = NUM.aiPace(tier, 1), NUM.aiPace(tier, NUM.LEVEL_CAP)
  ok(p12 < p1, '3.' .. tier .. 'b tier' .. tier .. ' 满级用时显著短于 1 级（' .. string.format('%.2f→%.2f', p1, p12) .. '）')
end
-- 4) 三档之间有序：easy 最慢、hard 最快
for lv = 1, NUM.LEVEL_CAP, 3 do
  local e, n, h = NUM.aiPace(1, lv), NUM.aiPace(2, lv), NUM.aiPace(3, lv)
  ok(e >= n and n >= h, '4.L' .. lv .. ' easy≥normal≥hard（' .. string.format('%.2f/%.2f/%.2f', e, n, h) .. '）')
end
-- 5) 夹紧边界：不会低于 paceMin、不会高于 paceMax
local T = NUM.AI_TUNE
for tier = 1, 3 do
  local lo, hi = T.paceMin[tier], T.paceMax[tier]
  for lv = 1, NUM.LEVEL_CAP do
    local p = NUM.aiPace(tier, lv)
    if p < lo - 1e-9 or p > hi + 1e-9 then
      ok(false, '5.' .. tier .. ' 夹紧边界 L' .. lv, p)
    end
  end
end
ok(true, '5.0 三档 × 满级区间全部落在 [paceMin, paceMax]')
-- 6) 容错：非法入参不抛错
local okc = pcall(function() NUM.aiPace(nil, nil) return NUM.aiPace(9, 99) end)
ok(okc, '6.1 非法 tier/level 不抛错（回落到默认档与封顶速度）')
-- 7) 具体读数（写给报告用，同时是回归锚）
local h1, h12 = NUM.aiPace(3, 1), NUM.aiPace(3, NUM.LEVEL_CAP)
ok(math.abs(h1 - 1.60) < 0.02, '7.1 hard Lv1 = 1.60s', h1)
ok(math.abs(h12 - 0.37) < 0.02, '7.2 hard Lv12 = 0.37s（满级比 1 级收紧 65%）', h12)

print(string.format('\n----\n%s  %d/%d assertions passed', fail == 0 and 'ALL GREEN' or 'FAILED', pass, pass + fail))
os.exit(fail == 0 and 0 or 1)
