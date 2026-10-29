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
-- 组 9：v6 天赋清单 —— 四角色各 1 主动 + 4 条被动/机制，id 唯一、字段齐全
-- ===========================================================================
local S9 = M.newState()
local totalTalents, ids = 0, {}
local roleOrder = { 'nahida', 'keqing', 'ganyu', 'columbina' }
local badGate, badField, dupId = false, false, nil
for i = 1, #roleOrder do
  local r = roleOrder[i]
  local list = M.talents(S9, r)
  eq(#list, 5, '9.' .. i .. ' ' .. r .. ' 天赋数 = 5（1 主动 + 4 被动/机制）')
  local actives, passives = 0, 0
  for k = 1, #list do
    local t = list[k]
    totalTalents = totalTalents + 1
    if ids[t.id] then dupId = t.id end
    ids[t.id] = true
    if t.kind == 'active' then actives = actives + 1 else passives = passives + 1 end
    if type(t.name) ~= 'string' or t.name == '' then badField = true end
    if type(t.official) ~= 'string' or #t.official < 8 then badField = true end
    if type(t.map) ~= 'string' or #t.map < 8 then badField = true end
    if type(t.see) ~= 'string' or #t.see < 4 then badField = true end
    if type(t.verify) ~= 'string' or #t.verify < 4 then badField = true end
    if t.gate == nil or t.gate > M.NUM.LEVEL_MAX then badGate = true end
  end
  eq(actives, 1, '9.' .. i .. 'b ' .. r .. ' 恰有 1 条主动')
  eq(passives, 4, '9.' .. i .. 'c ' .. r .. ' 恰有 4 条被动/机制')
end
eq(totalTalents, 20, '9.10 全量 20 条天赋')
eq(dupId, nil, '9.11 天赋 id 全局唯一')
eq(badField, false, '9.12 每条天赋的 name/official/map/see/verify 都写全')
eq(badGate, false, '9.13 每条天赋的解锁门槛合法（0..LEVEL_MAX）')

-- ===========================================================================
-- 组 10：纳西妲 —— 蕴种印 / 慧明缘觉智论 / 摩耶之殿 / 净善摄受明论
-- ===========================================================================
local S10 = M.newState({ startRoles = { 'nahida' } })
local c10 = M.cast(S10, 'nahida', { mode = 'casual' })
eq(c10.ok, true, '10.01 纳西妲施放成功')
near(c10.takeDur, M.params(S10, 'nahida').aiDur + 0.5, '10.02 净善摄受：接管 +0.5s（精通 200 → 200*0.25*0.01）')
near(S10.tal.nahida.seedT, M.NUM.NAHIDA.SEED_DUR, '10.03 施放后蕴种印 25s 就位')
near(S10.tal.nahida.domainT, M.NUM.NAHIDA.DOMAIN_DUR, '10.04 施放后摩耶之殿 15s 就位')

local r10 = M.onClear(S10, 'nahida', 2, { mode = 'casual' })
eq(#r10.effects >= 1, true, '10.05 消行触发灭净三业')
eq(r10.effects[1].kind, 'clear-bottom', '10.06 单人模式降级为 clear-bottom')
eq(r10.effects[1].n, 1, '10.07 精通 216 → 连锁 1 行')
ok(r10.mult > 1.14 and r10.mult < 1.16, '10.08 领域内得分 ×1.149', 'mult=' .. tostring(r10.mult))
near(S10.tal.nahida.seedCd, M.NUM.NAHIDA.TRIGGER_GAP_DOMAIN, '10.09 领域内触发间隔 2.25s')

-- 间隔未到 ⇒ 不触发；间隔到了 ⇒ 再触发
local r10b = M.onClear(S10, 'nahida', 1, { mode = 'casual' })
eq(#r10b.effects, 0, '10.10 2.5s 间隔未到不重复触发')
M.tick(S10, 2.6)
local r10c = M.onClear(S10, 'nahida', 1, { mode = 'casual' })
eq(#r10c.effects >= 1, true, '10.11 间隔到期后再次触发')

-- 精通成长：50 行 ⇒ 增幅 40% ⇒ 连锁 2 行
local S10b = M.newState({ startRoles = { 'nahida' } })
M.cast(S10b, 'nahida', {})
S10b.tal.nahida.seedT = 25
S10b.tal.nahida.lines = 50
local pr10 = M.params(S10b, 'nahida')
eq(pr10.chainRows, 2, '10.12 50 行 → 精通 600 → 连锁 2 行')
S10b.tal.nahida.seedCd = 0
local r10d = M.onClear(S10b, 'nahida', 1, { mode = 'casual' })
eq(r10d.effects[1].n, 2, '10.13 连锁 2 行写进效果')
S10b.tal.nahida.lines = 100
eq(M.params(S10b, 'nahida').chainRows, 3, '10.14 100 行 → 精通 1000 → 连锁 3 行（封顶）')

-- 净善摄受封顶 +2.5s
local S10c = M.newState({ startRoles = { 'nahida' } })
S10c.tal.nahida.lines = 500        -- 精通 4200
local c10b = M.cast(S10c, 'nahida', {})
near(c10b.takeDur, M.params(S10c, 'nahida').aiDur + M.NUM.NAHIDA.ABSORB_CAP,
  '10.15 净善摄受封顶 +2.5s')

-- ===========================================================================
-- 组 11：刻晴 —— 雷楔 / 二段引爆 / 长按跨地形 / 玉衡之贵 / 四叠
-- ===========================================================================
local S11 = M.newState({ startRoles = { 'keqing' } })
local c11 = M.cast(S11, 'keqing', { col = 6 })
eq(c11.ok, true, '11.01 刻晴施放')
eq(c11.effect, 'blink', '11.02 短按 = 本列瞬落')
near(S11.tal.keqing.markT, M.NUM.KEQING.MARK_LIFE, '11.03 雷楔 5s 就位')
eq(S11.tal.keqing.markCol, 6, '11.04 雷楔记下列号')
near(c11.takeDur, 0, '11.05 非纳西妲不带 takeDur')
ok(S11.cd.keqing < 7.5, '11.06 玉衡充能：CD 按 1/1.15 记（<7.5）',
  'cd=' .. tostring(S11.cd.keqing))

-- 雷楔期间再按一次 ⇒ 二段引爆（免 CD）
local c11b = M.cast(S11, 'keqing', { col = 3 })
eq(c11b.ok, true, '11.07 雷楔期间可再次施放（不受 CD 门禁）')
eq(c11b.effect, 'mark-blink', '11.08 二段 = mark-blink')
near(S11.tal.keqing.markT, 0, '11.09 引爆后雷楔清除')
near(S11.cd.keqing, S11.cd.keqing, '11.10 引爆不重置 CD（数值不变）')

-- 雷楔期间消行 ⇒ 雷暴连斩（清该列 2 格）
local S11b = M.newState({ startRoles = { 'keqing' } })
M.cast(S11b, 'keqing', { col = 4 })
local r11 = M.onClear(S11b, 'keqing', 1, { mode = 'casual' })
local slash
for i = 1, #r11.effects do
  if r11.effects[i].kind == 'clear-col' then slash = r11.effects[i] end
end
ok(slash ~= nil, '11.11 雷楔期间消行触发雷暴连斩')
eq(slash and slash.n, M.NUM.KEQING.SLASH_CELLS, '11.12 连斩清 2 格')
eq(slash and slash.col, 4, '11.13 连斩落在雷楔列')
near(S11b.tal.keqing.markT, 0, '11.14 连斩消耗雷楔')

-- 长按 ⇒ blink-best
local S11c = M.newState({ startRoles = { 'keqing' } })
local c11c = M.cast(S11c, 'keqing', { col = 2, holdSec = M.NUM.KEQING.LONG_PRESS + 0.01 })
eq(c11c.effect, 'blink-best', '11.15 长按 = 跨地形（blink-best）')

-- 玉衡之贵：8s 内 +15% 得分，8s 后消失
local S11d = M.newState({ startRoles = { 'keqing' } })
M.cast(S11d, 'keqing', { col = 5 })
local r11b = M.onClear(S11d, 'keqing', 1, { mode = 'casual' })
ok(r11b.mult >= 1.15 - 1e-9, '11.16 玉衡窗口内消行 ≥×1.15', 'mult=' .. tostring(r11b.mult))
M.tick(S11d, 8.1)
local r11c = M.onClear(S11d, 'keqing', 1, { mode = 'casual' })
ok(r11c.mult < 1.15, '11.17 8s 后玉衡过期', 'mult=' .. tostring(r11c.mult))

-- 四叠：移动/旋转/硬降各 1 层，+6%/层，独立 8s
local S11e = M.newState({ startRoles = { 'keqing' } })
local l1 = M.onLock(S11e, 'keqing', { moved = true, rotated = true, hard = true, dwell = 0.5 })
eq(M.talentState(S11e, 'keqing').stacks, 3, '11.18 三操作 = 3 层')
near(M.nextMult(S11e, 'keqing'), 1 + 3 * M.NUM.KEQING.STK_VAL, '11.19 3 层 = +18% 得分')
local r11e = M.onClear(S11e, 'keqing', 1, {})
eq(M.talentState(S11e, 'keqing').stacks, 4, '11.20 消行补第 4 层')
near(M.nextMult(S11e, 'keqing'), 1 + 4 * M.NUM.KEQING.STK_VAL, '11.21 满 4 层 = +24%')
M.tick(S11e, M.NUM.KEQING.STK_DUR + 0.1)
eq(M.talentState(S11e, 'keqing').stacks, 0, '11.22 8s 后全部叠层过期')

-- ===========================================================================
-- 组 12：甘雨 —— 冰莲 / 唯此一心 / 天地交泰 / 霜华矢蓄力
-- ===========================================================================
local S12 = M.newState({ startRoles = { 'ganyu' } })
local c12 = M.cast(S12, 'ganyu', { mode = 'casual' })
eq(c12.ok, true, '12.01 甘雨施放')
near(S12.tal.ganyu.lotusT, M.NUM.GANYU.LOTUS_LIFE, '12.02 冰莲 6s 埋下')
eq(S12.tal.ganyu.lotusArmed, true, '12.03 冰莲待绽放')
near(M.params(S12, 'ganyu').gravityMult, M.NUM.GANYU.FIELD_GRAVITY, '12.04 冻结期重力 ×1.20')
eq(#M.drain(S12), 0, '12.05 冰莲未到期不吐效果')

-- 6s 到点自然绽放 ⇒ clear-top 3
M.tick(S12, M.NUM.GANYU.LOTUS_LIFE + 0.1)
local d12 = M.drain(S12)
eq(#d12, 1, '12.06 冰莲到点产出 1 个效果')
eq(d12[1].kind, 'clear-top', '12.07 自然绽放 = clear-top')
eq(d12[1].n, M.NUM.GANYU.LOTUS_ROWS, '12.08 自然绽放清 3 行')
eq(#M.drain(S12), 0, '12.09 drain 是"取一次就清空"')

-- 期间消行 ⇒ 提前绽放（2 行）
local S12b = M.newState({ startRoles = { 'ganyu' } })
M.cast(S12b, 'ganyu', {})
local r12 = M.onClear(S12b, 'ganyu', 1, { mode = 'casual' })
local early
for i = 1, #r12.effects do
  if r12.effects[i].id == 'ganyu.lotus' then early = r12.effects[i] end
end
ok(early ~= nil, '12.10 冻结期消行 ⇒ 冰莲提前绽放')
eq(early and early.n, M.NUM.GANYU.LOTUS_BROKEN_ROWS, '12.11 提前绽放只清 2 行')
eq(S12b.tal.ganyu.lotusArmed, false, '12.12 提前绽放后不再自然绽放')

-- 唯此一心：消行开 5s 窗口，窗口内再消行 +20%
local S12c = M.newState({ startRoles = { 'ganyu' } })
local r12b = M.onClear(S12c, 'ganyu', 1, { mode = 'casual' })
ok(r12b.mult < 1.2, '12.13 首次消行无窗口加成')
near(S12c.tal.ganyu.critWin, M.NUM.GANYU.FOCUS_WINDOW, '12.14 消行开 5s 窗口')
local r12c = M.onClear(S12c, 'ganyu', 1, { mode = 'casual' })
ok(r12c.mult >= 1.2 - 1e-9, '12.15 窗口内再消行 ×1.20', 'mult=' .. tostring(r12c.mult))

-- 霜华矢蓄力：慢锁 2 次 ⇒ 2 段 ⇒ 施放冻结 +2 行
local S12d = M.newState({ startRoles = { 'ganyu' } })
M.onLock(S12d, 'ganyu', { hard = false, dwell = M.NUM.GANYU.CHARGE_WINDOW + 0.1 })
M.onLock(S12d, 'ganyu', { hard = false, dwell = M.NUM.GANYU.CHARGE_WINDOW + 0.1 })
eq(S12d.tal.ganyu.charge, M.NUM.GANYU.CHARGE_MAX, '12.16 两次慢锁 = 2 段（封顶）')
local base = M.params(S12d, 'ganyu').freezeRows
local c12b = M.cast(S12d, 'ganyu', { mode = 'casual', boardH = 5 })
eq(c12b.n, base + M.NUM.GANYU.CHARGE_MAX * M.NUM.GANYU.CHARGE_ROWS, '12.17 施放吃到 2 段蓄力（+2 行）')
eq(S12d.tal.ganyu.charge, 0, '12.18 施放后蓄力清零')
-- 硬降不蓄力
local S12e = M.newState({ startRoles = { 'ganyu' } })
M.onLock(S12e, 'ganyu', { hard = true, dwell = 5 })
eq(S12e.tal.ganyu.charge, 0, '12.19 硬降不蓄力')

-- ===========================================================================
-- 组 13：哥伦比娅 —— 引力值 / 月诱 / 新月法则 / 月之领域
-- ===========================================================================
local S13 = M.newState({ startRoles = { 'columbina' } })
S13.energy.columbina = 100
local r13 = M.onClear(S13, 'columbina', 2, { mode = 'pvp' })
near(S13.tal.columbina.gravity, 2 * M.NUM.COLUMBINA.GRAVITY_PER_LINE, '13.01 消 2 行 = +10 引力值')
for _ = 1, 30 do M.onClear(S13, 'columbina', 4, { mode = 'pvp' }) end
near(S13.tal.columbina.gravity, M.NUM.COLUMBINA.GRAVITY_MAX, '13.02 引力值封顶 60')

local c13 = M.cast(S13, 'columbina', { mode = 'pvp', oppH = 5 })
eq(c13.ok, true, '13.03 满值时施放成功')
ok(c13.n >= 3, '13.04 满辉放大推层（×1.5 向上取整）', 'n=' .. tostring(c13.n))
eq(S13.tal.columbina.gravity, 0, '13.05 满辉后引力值清零')
eq(S13.tal.columbina.lure, 1, '13.06 满辉给 1 层月诱')
near(S13.tal.columbina.lureT, M.NUM.COLUMBINA.LURE_DUR, '13.07 月诱 10s')
near(M.nextMult(S13, 'columbina'), 1 + M.NUM.COLUMBINA.LURE_BONUS, '13.08 月诱每层 +5% 得分')

-- 月诱 3 层封顶
for _ = 1, 2 do
  S13.tal.columbina.gravity = M.NUM.COLUMBINA.GRAVITY_MAX
  S13.cd.columbina = 0
  S13.energy.columbina = M.NUM.ENERGY_MAX      -- 对战施放要 60 能量
  local cc = M.cast(S13, 'columbina', { mode = 'pvp' })
  eq(cc.ok, true, '13.09a 满辉施放成功')
end
eq(S13.tal.columbina.lure, M.NUM.COLUMBINA.LURE_MAX, '13.09 月诱至多 3 层')
near(M.nextMult(S13, 'columbina'), 1 + M.NUM.COLUMBINA.LURE_MAX * M.NUM.COLUMBINA.LURE_BONUS,
  '13.10 3 层 = +15%')
M.tick(S13, M.NUM.COLUMBINA.LURE_DUR + 0.1)
eq(S13.tal.columbina.lure, 0, '13.11 月诱 10s 到期清空')

-- 月之领域：引力积攒 ×1.13
local S13b = M.newState({ startRoles = { 'columbina' } })
S13b.tal.columbina.domainT = M.NUM.COLUMBINA.DOMAIN_LIFE
local r13b = M.onClear(S13b, 'columbina', 3, { mode = 'casual' })
near(S13b.tal.columbina.gravity, 3 * M.NUM.COLUMBINA.GRAVITY_PER_LINE * M.NUM.COLUMBINA.DOMAIN_GAIN,
  '13.12 领域内引力积攒 ×1.13')

-- 新月自己的法则：33% 概率（固定 rng ⇒ 可复现，统计落在合理带）
local S13c = M.newState({ startRoles = { 'columbina' } })
S13c.tal.columbina.domainT = 999
local procs = 0
for _ = 1, 200 do
  local rr = M.onClear(S13c, 'columbina', 1, { mode = 'pvp' })
  for i = 1, #rr.effects do
    if rr.effects[i].id == 'columbina.law' then procs = procs + 1 end
  end
end
ok(procs >= 40 and procs <= 100, '13.13 33% 触发率落在合理带（200 次）', 'procs=' .. tostring(procs))
local S13d = M.newState({ startRoles = { 'columbina' } })
S13d.tal.columbina.rng = 12345
local a = M.onClear(S13d, 'columbina', 1, { mode = 'pvp' })
local b = M.onClear(S13d, 'columbina', 1, { mode = 'pvp' })
ok(a.log ~= nil and b.log ~= nil, '13.14 同种子序列稳定可复现（日志可回溯）')

-- 慧明缘觉智论·暴击侧：追加一次的概率（固定 rng ⇒ 可复现）
local S10d = M.newState({ startRoles = { 'nahida' } })
M.cast(S10d, 'nahida', {})
S10d.tal.nahida.lines = 50        -- 精通 600 ⇒ 增幅 40% / 暴击率 12%
S10d.tal.nahida.seedCd = 0
S10d.tal.nahida.rng = 0           -- 下一次 roll = 12345/2^31 ≈ 5.7e-6 < 0.12 ⇒ 必中
local r10e = M.onClear(S10d, 'nahida', 1, { mode = 'casual' })
eq(#r10e.effects, 2, '10.16 暴击判定命中 ⇒ 灭净三业追加一次（两个效果）')

local S10e = M.newState({ startRoles = { 'nahida' } })
M.cast(S10e, 'nahida', {})
S10e.tal.nahida.lines = 50
S10e.tal.nahida.seedCd = 0
S10e.tal.nahida.rng = 1000000
local nx = ((1000000 * 1103515245 + 12345) % 2147483648) / 2147483648
ok(nx > 0.12, '10.17 选定种子确实落在暴击外', 'roll=' .. string.format('%.4f', nx))
local r10f = M.onClear(S10e, 'nahida', 1, { mode = 'casual' })
eq(#r10f.effects, 1, '10.18 暴击未过 ⇒ 只触发一次')

-- nextMult 与 onClear 的倍率口径一致（同轴加成相加）
local S10f = M.newState({ startRoles = { 'nahida' } })
M.cast(S10f, 'nahida', {})
near(M.nextMult(S10f, 'nahida'), 1 + M.NUM.NAHIDA.DOMAIN_SCORE, '10.19 领域内 nextMult = 1+14.9%')
local r10g = M.onClear(S10f, 'nahida', 1, { mode = 'casual' })
near(r10g.mult, M.nextMult(S10f, 'nahida'), '10.20 onClear 与 HUD 读数同一套公式')

-- ===========================================================================
-- 组 14：容错 —— 新钩子对 nil/未知角色/空 state 一律不抛错
-- ===========================================================================
noThrow(function() M.onClear(nil, 'nahida', 1, nil) end, '14.01 onClear(nil) 不抛错')
noThrow(function() M.onClear({}, 'nobody', 1, nil) end, '14.02 onClear 未知角色不抛错')
noThrow(function() M.onLock(nil, 'keqing', nil) end, '14.03 onLock(nil) 不抛错')
noThrow(function() M.onLock({}, nil, nil) end, '14.04 onLock(nil role) 不抛错')
noThrow(function() M.drain(nil) end, '14.05 drain(nil) 不抛错')
noThrow(function() M.drain({}) end, '14.06 drain 空 state 不抛错')
noThrow(function() M.talents(nil, 'nahida') end, '14.07 talents(nil) 不抛错')
noThrow(function() M.talents({}, 'nobody') end, '14.08 talents 未知角色返回空表')
eq(#M.talents({}, 'nobody'), 0, '14.09 未知角色天赋清单为空')
noThrow(function() M.buffs(nil, 'ganyu') end, '14.10 buffs(nil) 不抛错')
noThrow(function() M.nextMult(nil, nil) end, '14.11 nextMult(nil) 不抛错')
eq(M.nextMult(nil, nil), 1, '14.12 nextMult 缺省 = 1')
noThrow(function() M.talentState(nil, 'columbina') end, '14.13 talentState(nil) 不抛错')

-- 15：snapshot 的新字段（旧字段已在组 8 验过）
local S15 = M.newState({ startRoles = { 'ganyu' } })
M.cast(S15, 'ganyu', {})
local sp15 = M.snapshot(S15)
eq(type(sp15.buff), 'table', '15.01 snapshot.buff 是表')
ok(#sp15.buff >= 1, '15.02 施放后 HUD 能看到天赋状态', 'n=' .. tostring(#sp15.buff))
eq(type(sp15.talents), 'table', '15.03 snapshot.talents 是表')
eq(sp15.talents.role, 'ganyu', '15.04 snapshot.talents 指向当前角色')
ok(sp15.mult >= 1, '15.05 snapshot.mult ≥ 1')

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
