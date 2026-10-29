--[[==========================================================================
  tests-lua/skills_test.lua —— lua/tetris/skills.lua 的独立单测（不依赖模拟器）
  跑法：  cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/skills_test.lua
  判据：  退出码 0 = 全绿；任一 FAIL ⇒ 打印差异 + 退出码 1
  说明：  纯 Lua 5.3，不 require 任何外部库；模块用 dofile 装载（模块自身零 require）
=========================================================================]]

-- ---------------------------------------------------------------------------
-- 微型测试框架
-- ---------------------------------------------------------------------------
local pass, fail = 0, 0
local fails = {}

local function fmt(v)
  if type(v) == 'string' then return '"' .. v .. '"' end
  if type(v) == 'number' then
    if v == math.floor(v) and math.abs(v) < 1e15 then return tostring(math.floor(v)) end
    return string.format('%.6g', v)
  end
  return tostring(v)
end

local function ok(cond, name, detail)
  if cond then
    pass = pass + 1
    io.write('PASS  ', name, '\n')
  else
    fail = fail + 1
    fails[#fails + 1] = name .. (detail and ('  <' .. detail .. '>') or '')
    io.write('FAIL  ', name, detail and ('  <' .. detail .. '>') or '', '\n')
  end
end

local function eq(got, want, name)
  ok(got == want, name, 'got=' .. fmt(got) .. ' want=' .. fmt(want))
end

local function near(got, want, name, eps)
  eps = eps or 1e-9
  local g, w = tonumber(got), tonumber(want)
  ok(g ~= nil and w ~= nil and math.abs(g - w) <= eps, name,
    'got=' .. fmt(got) .. ' want≈' .. fmt(want))
end

local function gt(got, base, name)
  local g, b = tonumber(got), tonumber(base)
  ok(g ~= nil and b ~= nil and g > b, name, 'got=' .. fmt(got) .. ' want>' .. fmt(b))
end

local function hasSub(s, sub, name)
  ok(type(s) == 'string' and string.find(s, sub, 1, true) ~= nil, name,
    'got=' .. fmt(s) .. ' want含' .. fmt(sub))
end

local function noThrow(fn, name)
  local okk, err = pcall(fn)
  ok(okk, name, okk and nil or tostring(err))
end

-- ---------------------------------------------------------------------------
-- 装载被测模块（模块自身不 require；这里用 dofile，等价 main 的 loadModule）
-- ---------------------------------------------------------------------------
local CANDIDATES = {
  'lua/tetris/skills.lua',
  './lua/tetris/skills.lua',
  '../lua/tetris/skills.lua',
}

local M, loadedPath
for i = 1, #CANDIDATES do
  local okk, mod = pcall(dofile, CANDIDATES[i])
  if okk and type(mod) == 'table' then
    M, loadedPath = mod, CANDIDATES[i]
    break
  end
end
if M == nil then
  io.write('FATAL 无法装载 skills.lua（试过 ' .. table.concat(CANDIDATES, ' / ') .. '）\n')
  os.exit(2)
end
io.write('LOAD  ', loadedPath, '  VERSION=', tostring(M.VERSION), '\n')
io.write('----\n')

-- ===========================================================================
-- 组 1：newState —— 起始只解锁纳西妲 / 一局两角色上限
-- ===========================================================================
local S = M.newState()

eq(#S.party, 1, '1.01 起始 party 只有 1 人')
eq(S.party[1], 'nahida', '1.02 起始 party = nahida')
eq(S.partyMax, 2, '1.03 partyMax = 2（一局最多两个前台角色）')
eq(S.active, 1, '1.04 active 指向 party[1]')
eq(#S.roles, 4, '1.05 四角色全部入册')

eq(S.unlocked.nahida, true, '1.06 起始解锁 纳西妲')
eq(S.unlocked.keqing, false, '1.07 起始未解锁 刻晴')
eq(S.unlocked.ganyu, false, '1.08 起始未解锁 甘雨')
eq(S.unlocked.columbina, false, '1.09 起始未解锁 少女')

eq(S.lv.nahida, 1, '1.10 起始 lv=1')
eq(S.exp.nahida, 0, '1.11 起始 exp=0')
eq(S.cd.nahida, 0, '1.12 起始 cd=0')
eq(S.energy.nahida, 0, '1.13 起始 energy=0')
eq(S.tier.nahida, 1, '1.14 起始 AI 档位 tier=1')
eq(S.nodes.nahida[1], 1, '1.15 N1 初始已点 1 级')
eq(S.nodes.nahida[2], 0, '1.16 N2 初始未点')
eq(S.nodes.nahida[3], 0, '1.17 N3 初始未点')

-- ===========================================================================
-- 组 2：tick —— 能量累积 / 上限 / 冷却递减 / dt<=0
-- ===========================================================================
local S2 = M.newState()
M.tick(S2, 10)
near(S2.energy.nahida, 60, '2.01 能量自然回复 10s = 60（6/s）')

M.tick(S2, 1000)
near(S2.energy.nahida, M.NUM.ENERGY_MAX, '2.02 能量封顶 ENERGY_MAX=100')

S2.cd.nahida = 5
M.tick(S2, 2)
near(S2.cd.nahida, 3, '2.03 冷却递减 5-2=3')

S2.cd.nahida = 1
M.tick(S2, 99)
near(S2.cd.nahida, 0, '2.04 冷却不降为负（1-99 → 0）')

local eBefore = S2.energy.nahida
M.tick(S2, 0)
near(S2.energy.nahida, eBefore, '2.05 dt=0 不推动任何状态')
M.tick(S2, -5)
near(S2.energy.nahida, eBefore, '2.06 dt<0 不推动任何状态')

noThrow(function() M.tick(nil, 1) end, '2.07 tick(nil) 不抛错')
noThrow(function() M.tick({}) end, '2.08 tick 缺字段的 state 不抛错')

-- ===========================================================================
-- 组 3：params —— 纳西妲 tier 1→4 随 lv（初始上限 4），lv 高解锁 5..8
-- ===========================================================================
local S3 = M.newState()
local p1 = M.params(S3, 'nahida')
eq(p1.aiTier, 1, '3.01 lv1 → AI 档 1')
eq(p1.aiDur, 6, '3.02 lv1 「接手」时长 6s（N1 Lv1）')

S3.lv.nahida = 3
eq(M.params(S3, 'nahida').aiTier, 2, '3.03 lv3 → AI 档 2')
S3.lv.nahida = 4
eq(M.params(S3, 'nahida').aiTier, 3, '3.04 lv4 → AI 档 3')
S3.lv.nahida = 5
eq(M.params(S3, 'nahida').aiTier, 4, '3.05 lv5 → AI 档 4（初始上限）')
S3.lv.nahida = 12
eq(M.params(S3, 'nahida').aiTier, 8, '3.06 lv12 → AI 档 8（天花板）')

local pk = M.params(S3, 'nahida')
local keys = { 'aiTier', 'aiDur', 'freezeRows', 'freezeSec', 'holdCutMs', 'clearRows' }
local allKeys = true
for i = 1, #keys do
  if pk[keys[i]] == nil then allKeys = false end
end
ok(allKeys, '3.07 params 六个键齐全（aiTier/aiDur/freezeRows/freezeSec/holdCutMs/clearRows）')

-- ===========================================================================
-- 组 4：局外（会话内）养成生效 —— lv 提升带来永久小加成
-- ===========================================================================
local SL1 = M.newState()
local SL6 = M.newState()
SL6.lv.nahida = 6
SL6.lv.ganyu = 6
SL6.lv.columbina = 6
gt(M.params(SL6, 'nahida').aiDur, M.params(SL1, 'nahida').aiDur,
  '4.01 养成生效：lv6 的「接手」时长 > lv1（+0.04s/级）')
gt(M.params(SL6, 'ganyu').freezeSec, M.params(SL1, 'ganyu').freezeSec,
  '4.02 养成生效：lv6 的冻结时长 > lv1（+0.05s/级）')
gt(M.params(SL6, 'columbina').holdCutMs, M.params(SL1, 'columbina').holdCutMs,
  '4.03 养成生效：lv6 的涟漪削延迟 > lv1（+3ms/级）')

-- ===========================================================================
-- 组 5：addExp —— 升级 / 自动加点 / 封顶 / 容错
-- ===========================================================================
local S5 = M.newState()
local r5a = M.addExp(S5, 'nahida', 0)
eq(r5a.leveled, false, '5.01 amount=0 不升级')

local r5b = M.addExp(S5, 'nahida', 40)
eq(r5b.leveled, true, '5.02 exp 40 → 升到 lv2')
eq(r5b.lv, 2, '5.03 返回值 lv=2')
eq(S5.exp.nahida, 0, '5.04 升级后 exp 归零（40-40）')

local r5c = M.addExp(S5, 'nahida', 80)   -- 2→3 需 80
eq(r5c.lv, 3, '5.05 exp 80 → lv3')
eq(r5c.node, 'N2', '5.06 跨过 lv3 门槛自动点亮 N2（自动加点）')
eq(S5.nodes.nahida[2], 1, '5.07 nodes.nahida[2] 已置 1')
eq(S5.tier.nahida, 2, '5.08 lv3 时 state.tier 同步为 2')

local r5d = M.addExp(S5, 'nahida', 999999)
eq(S5.lv.nahida, M.NUM.LEVEL_MAX, '5.09 巨量经验不突破 LEVEL_MAX=12')
eq(S5.nodes.nahida[5], 1, '5.10 lv12 门槛自动点亮 N5')
eq(S5.tier.nahida, 8, '5.11 lv12 → tier 8 已写回 state.tier')

local r5e = M.addExp(S5, 'nobody', 100)
eq(r5e.leveled, false, '5.12 未知 role → leveled=false 不抛错')
eq(r5e.lv, 0, '5.13 未知 role → lv=0')

noThrow(function() M.addExp(nil, 'nahida', 10) end, '5.14 addExp(nil) 不抛错')
noThrow(function() M.addExp({}, 'nahida', 10) end, '5.15 addExp 空 state 不抛错')

-- ===========================================================================
-- 组 6：cast —— 门禁 / 效果 / 冷却写回 / 容错
-- ===========================================================================
local S6 = M.newState()

local c1 = M.cast(S6, 'nobody', {})
eq(c1.ok, false, '6.01 未知角色 cast 失败')
eq(c1.why, 'unknown-role', '6.02 why=unknown-role')

local c2 = M.cast(S6, 'keqing', {})
eq(c2.ok, false, '6.03 未解锁角色 cast 失败')
eq(c2.why, 'locked', '6.04 why=locked')

local c3 = M.cast(S6, 'nahida', { mode = 'casual' })
eq(c3.ok, true, '6.05 纳西妲 cast 成功')
eq(c3.effect, 'ai-takeover', '6.06 首技能=AI 接管')
eq(c3.n, 1, '6.07 n = 当前 AI 档位 1')
eq(c3.tier, 1, '6.08 tier 回传 1')
eq(c3.why, nil, '6.09 成功时 why=nil')
near(S6.cd.nahida, 25, '6.10 成功施放后 CD 起算 25s')

local c4 = M.cast(S6, 'nahida', { mode = 'casual' })
eq(c4.ok, false, '6.11 CD 未好时二次施放被拒（CD 门禁）')
eq(c4.why, 'cd', '6.12 why=cd')
near(c4.n, 25, '6.13 n=剩余 CD 25s')

-- 少女：双人在场 + 对手模式
local S6b = M.newState({ startRoles = { 'nahida', 'columbina' } })
eq(#S6b.party, 2, '6.14 可带两个前台角色')
eq(S6b.unlocked.columbina, true, '6.15 startRoles 里的人一并解锁')

local c5 = M.cast(S6b, 'columbina', { mode = 'casual' })
eq(c5.ok, true, '6.16 少女在单人模式不空放（降级成功）')
eq(c5.effect, 'gravity-clear', '6.17 单人降级为 gravity-clear')
eq(c5.n, 1, '6.18 单人降级清底 1 行')
near(S6b.energy.columbina, 0, '6.19 单人降级分支不耗能（只吃 CD）')

local S6c = M.newState({ startRoles = { 'nahida', 'columbina' } })
S6c.energy.columbina = 100
local c6 = M.cast(S6c, 'columbina', { mode = 'pvp', oppH = 5 })
eq(c6.ok, true, '6.20 少女在 pvp 正常施放')
eq(c6.effect, 'ripple', '6.21 pvp effect=ripple（挂涟漪）')
eq(c6.n, 2, '6.22 n=层数 2（N1 Lv1）')
near(S6c.energy.columbina, 40, '6.23 消耗 60 能量（100→40）')
near(S6c.cd.columbina, 17, '6.24 CD=17s')

local c7 = M.cast(S6c, 'columbina', { mode = 'pvp' })
eq(c7.ok, false, '6.25 CD 中施放被拒')
eq(c7.why, 'cd', '6.26 先撞 CD 而不是能量')

local S6d = M.newState({ startRoles = { 'nahida', 'columbina' } })
local c8 = M.cast(S6d, 'columbina', { mode = 'pvp' })
eq(c8.ok, false, '6.27 能量不足无法施放')
eq(c8.why, 'energy', '6.28 why=energy')
near(c8.n, 60, '6.29 n=还差 60 能量')

noThrow(function() M.cast(nil, 'nahida', nil) end, '6.30 cast(nil) 不抛错')
noThrow(function() M.cast(S6d, 'nahida', nil) end, '6.31 cast ctx=nil 不抛错')

-- ===========================================================================
-- 组 7：tryUnlock —— 条件 / 幂等 / 队伍上限
-- ===========================================================================
local S7 = M.newState()

local u1, w1 = M.tryUnlock(S7, 'keqing', 'lines:10,games:1')
eq(u1, false, '7.01 累计 10 行 / 1 局 → 刻晴未解锁')
hasSub(w1, 'lines', '7.02 未解锁原因点名缺哪个条件（lines）')
eq(S7.unlocked.keqing, false, '7.03 keqing 仍为未解锁')

local u2, w2 = M.tryUnlock(S7, 'keqing', 'lines:40')
eq(u2, true, '7.04 累计 40 行 → 解锁刻晴')
eq(w2, 'ok', '7.05 解锁返回 ok')
eq(S7.unlocked.keqing, true, '7.06 keqing 已解锁')
eq(#S7.party, 2, '7.07 解锁后自动入队，party 达上限 2')
eq(S7.party[2], 'keqing', '7.08 队伍第二人是刻晴')

local u3 = M.tryUnlock(S7, 'keqing', 'lines:999')
eq(u3, false, '7.09 重复解锁返回 false（幂等）')
eq(#S7.party, 2, '7.10 重复解锁不重复入队')

local u4 = M.tryUnlock(S7, 'ganyu', 'lines:600')
eq(u4, true, '7.11 600 行 → 解锁甘雨')
eq(#S7.party, 2, '7.12 队伍已满 2 人 → 甘雨解锁但不入队（一局两角色上限）')
eq(S7.unlocked.ganyu, true, '7.13 甘雨 indeed 已解锁')

local u5, w5 = M.tryUnlock(S7, 'nobody', 'lines:99999')
eq(u5, false, '7.14 未知角色解锁失败')
eq(w5, 'unknown-role', '7.15 why=unknown-role')

local S7b = M.newState()
local u6 = M.tryUnlock(S7b, 'keqing', 'games:3')
eq(u6, true, '7.16 OR 语义：仅 3 局也能解锁刻晴')

noThrow(function() M.tryUnlock(nil, 'keqing', nil) end, '7.17 tryUnlock(nil) 不抛错')
noThrow(function() M.tryUnlock(S7b, 'ganyu', nil) end, '7.18 reason=nil 不抛错')

-- ===========================================================================
-- 组 8：snapshot —— HUD 快照
-- ===========================================================================
local S8 = M.newState()
local sp = M.snapshot(S8)
eq(sp.active, 'nahida', '8.01 snapshot.active = 当前前台角色')
eq(sp.lv, 1, '8.02 snapshot.lv=1')
eq(sp.tier, 1, '8.03 snapshot.tier=1')
eq(sp.cd, 0, '8.04 snapshot.cd=0')
eq(sp.energy, 0, '8.05 snapshot.energy=0')
eq(sp.partyMax, 2, '8.06 snapshot.partyMax=2')
eq(sp.unlockedCount, 1, '8.07 snapshot.unlockedCount=1（只开了纳西妲）')

M.cast(S8, 'nahida', {})
local sp2 = M.snapshot(S8)
near(sp2.cd, 25, '8.08 snapshot 能读到 CD 变化')

noThrow(function() M.snapshot(nil) end, '8.09 snapshot(nil) 不抛错')
noThrow(function() M.params(nil, nil) end, '8.10 params(nil) 不抛错')

local S8b = M.newState({ roles = { 'nahida', 'nahida', 'bogus' }, partyMax = 0 })
eq(#S8b.party, 0, '8.11 partyMax=0 → 不入队（边界不崩）')
eq(S8b.active, 0, '8.12 空队伍 active=0 不崩')

-- ===========================================================================
-- 汇总
-- ===========================================================================
io.write('----\n')
if fail == 0 then
  io.write(string.format('ALL GREEN  %d/%d assertions passed\n', pass, pass + fail))
  os.exit(0)
else
  io.write(string.format('FAILED  %d/%d passed, %d failed\n', pass, pass + fail, fail))
  for i = 1, #fails do io.write('  - ', fails[i], '\n') end
  os.exit(1)
end
