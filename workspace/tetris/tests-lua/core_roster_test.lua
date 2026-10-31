--[[==========================================================================
  tests-lua/core_roster_test.lua —— 解锁域纯模块 headless 验收（v6.1 P2）
  跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_roster_test.lua
  判据：全 PASS、退出码 0（任一 FAIL ⇒ 1）

  要证明什么：
    ① 契约 skills_test.lua 组 7（7.01–7.18）逐条由本模块覆盖
    ② 差分组：同 (role, reason) 输入下旧 skills.M.tryUnlock 与新模块 ok/why/状态一致
    ③ 结构：契约条件/门槛/文案全部**引用** NUM.UNLOCK + copy.ROLES（不复制）
    ④ 新能力：结构化缺口（deficits/closest）、计数归属（count/reasonOf）、换人（swapIn）
    ⑤ 「旧实现里就是错的」条目 —— 钉成红灯可复现的 PIN
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'

local pass, fail = 0, 0
local fails = {}

local function fmt(v)
  if type(v) == 'string' then return '"' .. v .. '"' end
  if type(v) == 'number' then
    if v == math.floor(v) and math.abs(v) < 1e15 then return tostring(math.floor(v)) end
    return string.format('%.6g', v)
  end
  if v == nil then return 'nil' end
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

local function hasSub(s, sub, name)
  ok(type(s) == 'string' and string.find(s, sub, 1, true) ~= nil, name,
    'got=' .. fmt(s) .. ' want含' .. fmt(sub))
end

local function noThrow(fn, name)
  local okk, err = pcall(fn)
  ok(okk, name, okk and nil or tostring(err))
end

local function loadCandidates(paths)
  for i = 1, #paths do
    local okLoad, chunk = pcall(loadfile, paths[i])
    if okLoad and type(chunk) == 'function' then
      local okRun, mod = pcall(chunk)
      if okRun and type(mod) == 'table' then return mod, paths[i] end
    end
  end
  return nil, nil
end

local function prefixed(p)
  return { ROOT .. '/' .. p, p, './' .. p, '../' .. p }
end

local rosterM, rosterPath = loadCandidates(prefixed('lua/tetris/core_roster.lua'))
local progM = loadCandidates(prefixed('lua/tetris/core_progress.lua'))
local skillsM, skillsPath = loadCandidates(prefixed('lua/tetris/skills.lua'))
local copyM = loadCandidates(prefixed('lua/tetris/copy.lua'))

if rosterM == nil then
  io.write('FATAL 无法装载 core_roster.lua\n')
  os.exit(2)
end
if skillsM == nil then
  io.write('FATAL 无法装载 skills.lua（数值表是注入源）\n')
  os.exit(2)
end
io.write('LOAD  ', rosterPath, '  VERSION=', tostring(rosterM.VERSION), '\n')
io.write('LOAD  ', skillsPath, '  (旧实现，差分组用)\n----\n')

local NUM = skillsM.NUM
local OLD = skillsM
local R = rosterM.new { num = NUM, copy = copyM, roster = NUM.ROLES }

-- ===========================================================================
-- 组 0：纯度与边界
-- ===========================================================================
local function slurp(path)
  local f = io.open(path, 'r')
  if not f then return nil end
  local s = f:read('a')
  f:close()
  return s
end

local function stripComments(src)
  local s = (src:gsub('%-%-%[%[.-%]%]', ''))
  return (s:gsub('%-%-[^\n]*', ''))
end

local src = slurp(rosterPath)
ok(src ~= nil and #src > 1000, '0.01 core_roster.lua 可读且非空')
local code = stripComments(src or '')
ok(not code:find('print%s*%(', 1) and not code:find('io%.write', 1), '0.02 不 print / 不写 stdout')
ok(not code:find('require%s*%(', 1), '0.03 不 require（纯依赖注入）')
ok(not code:find('game%.[%a_]', 1) and not code:find('ctl%.[%a_]', 1), '0.04 不碰 game.* / ctl.*')

local okNew, errNew = pcall(rosterM.new, {})
ok(not okNew, '0.05 M.new 缺 spec.num 明确报错')
hasSub(tostring(errNew), 'spec.num', '0.06 报错点名 spec.num')

-- ===========================================================================
-- 组 1：newState —— 解锁切片 / 形状与旧 skills.newState 一致
-- ===========================================================================
local S0 = R.newState()
eq(#S0.party, 1, '1.01 起始 party 只有 1 人')
eq(S0.party[1], 'nahida', '1.02 起始角色 = nahida（NUM.START_ROLES）')
eq(S0.partyMax, NUM.PARTY_MAX, '1.03 partyMax 引用 NUM')
eq(S0.active, 1, '1.04 active = 1')
eq(S0.unlocked.nahida, true, '1.05 起始角色已解锁')
eq(S0.unlocked.keqing, false, '1.06 其他角色未解锁')
eq(#S0.roles, 4, '1.07 四角色入册')
eq(S0.cnt.lines, nil, '1.08 计数默认空（按需建键）')

local S0b = R.newState { partyMax = 0 }
eq(#S0b.party, 0, '1.09 partyMax=0 ⇒ 不入队')
eq(S0b.active, 0, '1.10 空队伍 active=0')
local S0c = R.newState { partyMax = 1 }
eq(#S0c.party, 1, '1.11 partyMax=1 ⇒ 只入队 1 人（起始角色也不越界）')

-- 形状：与旧 skills.newState 的键集合一致（唯一多出来的是 cnt 计数）
local function keySet(t)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return tostring(a) < tostring(b) end)
  return table.concat(ks, ',')
end
local okset = keySet(OLD.newState())
local nkset = keySet(R.newState())
eq((nkset:gsub('cnt,', '')), okset, '1.12 状态键集合与旧 skills.newState 一致（只多 cnt）')
if progM then
  local P = progM.new { num = NUM, copy = copyM, roster = NUM.ROLES }
  eq(keySet(P.newState()), nkset, '1.13 core_progress.newState 形状一致（跨模块防漂移）')
  eq(P.newState().party[1], R.newState().party[1], '1.14 两个 newState 的起始队伍一致')
  eq(P.newState().unlocked.nahida, R.newState().unlocked.nahida, '1.15 起始解锁一致')
  eq(P.newState().tier.nahida, R.newState().tier.nahida, '1.16 档位默认值一致（nahida=1）')
  eq(P.newState().lv.ganyu, R.newState().lv.ganyu, '1.17 等级默认值一致')
end

-- ===========================================================================
-- 组 2：契约 skills_test 组 7（7.01–7.18）逐条
-- ===========================================================================
local S7 = R.newState()

local u1, w1 = R.tryUnlock(S7, 'keqing', 'lines:10,games:1')
eq(u1, false, '7.01 累计 10 行 / 1 局 → 刻晴未解锁')
hasSub(w1, 'lines', '7.02 未解锁原因点名缺哪个条件（lines）')
eq(S7.unlocked.keqing, false, '7.03 keqing 仍为未解锁')

local u2, w2 = R.tryUnlock(S7, 'keqing', 'lines:40')
eq(u2, true, '7.04 累计 40 行 → 解锁刻晴')
eq(w2, 'ok', '7.05 解锁返回 ok')
eq(S7.unlocked.keqing, true, '7.06 keqing 已解锁')
eq(#S7.party, 2, '7.07 解锁后自动入队，party 达上限 2')
eq(S7.party[2], 'keqing', '7.08 队伍第二人是刻晴')

local u3 = R.tryUnlock(S7, 'keqing', 'lines:999')
eq(u3, false, '7.09 重复解锁返回 false（幂等）')
eq(#S7.party, 2, '7.10 重复解锁不重复入队')

local u4 = R.tryUnlock(S7, 'ganyu', 'lines:600')
eq(u4, true, '7.11 600 行 → 解锁甘雨')
eq(#S7.party, 2, '7.12 队伍已满 2 人 → 甘雨解锁但不入队（一局两角色上限）')
eq(S7.unlocked.ganyu, true, '7.13 甘雨已解锁')

local u5, w5 = R.tryUnlock(S7, 'nobody', 'lines:99999')
eq(u5, false, '7.14 未知角色解锁失败')
eq(w5, 'unknown-role', '7.15 why=unknown-role')

local S7b = R.newState()
local u6 = R.tryUnlock(S7b, 'keqing', 'games:3')
eq(u6, true, '7.16 OR 语义：仅 3 局也能解锁刻晴')

noThrow(function() R.tryUnlock(nil, 'keqing', nil) end, '7.17 tryUnlock(nil) 不抛错')
noThrow(function() R.tryUnlock(S7b, 'ganyu', nil) end, '7.18 reason=nil 不抛错')

-- 7.x 的第三返回值（新能力）：info 给出队伍位与缺口
local _, _, info7 = R.tryUnlock(R.newState(), 'ganyu', 'lines:600')
eq(info7.role, 'ganyu', '7.19 info.role 回传')
eq(info7.joined, true, '7.20 info.joined=true（有位置就入队）')
eq(info7.partyIndex, 2, '7.21 info.partyIndex=2')
eq(info7.why, 'ok', '7.22 info.why=ok')

-- ===========================================================================
-- 组 3：差分 —— 同输入下旧 tryUnlock 与新区块一致
-- ===========================================================================
do
  local cases = {
    { 'keqing', 'lines:10,games:1' },
    { 'keqing', 'lines:39' },
    { 'keqing', 'lines:40' },
    { 'keqing', 'games:3' },
    { 'keqing', 'games:2' },
    { 'keqing', 'lines:999' },          -- 第二次：already
    { 'ganyu', 'lines:599' },
    { 'ganyu', 'time:300' },
    { 'ganyu', 'time:299,lines:0' },
    { 'columbina', 'pvp:1' },
    { 'columbina', 'tetris:49,pvp:0' },
    { 'columbina', 'tetris:50' },
    { 'nobody', 'lines:999' },
    { 'nahida', 'lines:0' },            -- 已解锁 ⇒ already
  }
  local so = OLD.newState()
  local sn = R.newState()
  for i = 1, #cases do
    local role, reason = cases[i][1], cases[i][2]
    local o1, o2 = OLD.tryUnlock(so, role, reason)
    local n1, n2 = R.tryUnlock(sn, role, reason)
    eq(n1, o1, '3.xx 差分 ok [' .. role .. ' ' .. reason .. ']')
    eq(n2, o2, '3.xx 差分 why [' .. role .. ' ' .. reason .. ']')
    eq(sn.unlocked[role], so.unlocked[role], '3.xx 差分 unlocked [' .. role .. ']')
    eq(#sn.party, #so.party, '3.xx 差分 #party [' .. role .. ']')
    eq(sn.active, so.active, '3.xx 差分 active [' .. role .. ']')
    local sameParty = true
    for k = 1, math.max(#sn.party, #so.party) do
      if sn.party[k] ~= so.party[k] then sameParty = false end
    end
    ok(sameParty, '3.xx 差分 party 内容 [' .. role .. ']',
      sameParty and nil or (table.concat(sn.party, ',') .. ' vs ' .. table.concat(so.party, ',')))
  end
  eq(sn.unlocked.keqing, so.unlocked.keqing, '3.xx 差分 末态 keqing')
  eq(sn.unlocked.ganyu, so.unlocked.ganyu, '3.xx 差分 末态 ganyu')
  eq(sn.unlocked.columbina, so.unlocked.columbina, '3.xx 差分 末态 columbina')
end

-- ===========================================================================
-- 组 4：结构 —— 门槛/契约/缺口，全部引用不复制
-- ===========================================================================
do
  eq(R.thresholds('keqing'), NUM.UNLOCK.keqing, '4.01 门槛表是 NUM.UNLOCK.keqing 的引用')
  eq(R.thresholds('nobody'), nil, '4.02 未知角色无门槛')

  local c = R.contractsOf('keqing')
  eq(c.rule, true, '4.03 有解锁规则')
  eq(c.any, true, '4.04 OR 语义（满足任一即解锁）')
  eq(#c.conditions, 2, '4.05 刻晴两条条件')
  eq(c.conditions[1].field, 'lines', '4.06 条件顺序按 UNLOCK_ORDER（lines 先）')
  eq(c.conditions[2].field, 'games', '4.07 第二条 = games')
  eq(c.conditions[1].ref, NUM.UNLOCK.keqing.lines, '4.08 条件值是引用不是副本')
  eq(c.conditions[1].need, NUM.UNLOCK.keqing.lines, '4.09 need 同值')
  eq(c.moment, copyM.ROLES.keqing.unlock, '4.10 契约文案是 copy 的同一张表（引用）')
  eq(c.copyKey, 'copy.roles.keqing.unlock', '4.11 契约文案键就位')
  eq(c.skillKey, 'copy.roles.keqing.skill', '4.12 技能名键就位')

  local cg = R.contractsOf('ganyu', 'lines:600,time:100')
  eq(cg.conditions[1].ok, true, '4.13 给 counts 后带上进度（lines 已达成）')
  eq(cg.conditions[2].ok, false, '4.14 time 未达成')
  eq(cg.conditions[2].left, 200, '4.15 left = 300-100')
  eq(cg.counts.lines, 600, '4.16 counts 原样回传（引用）')

  local g = R.gateOf('nahida')
  eq(g.startRole, true, '4.17 起始角色标记')
  eq(g.member, false, '4.18 未传 state 时 member=false')
  local g2 = R.gateOf('nahida', S0)
  eq(g2.unlocked, true, '4.19 传 state 后 unlocked=true')
  eq(g2.member, true, '4.20 传 state 后 member=true')
  eq(g2.partyIndex, 1, '4.21 队伍位 1')
  eq(g2.partyMax, NUM.PARTY_MAX, '4.22 partyMax 回传')
  eq(R.gateOf('ganyu').startRole, false, '4.23 非起始角色')
  eq(R.gateOf('ganyu').thresholds, NUM.UNLOCK.ganyu, '4.24 gate 的门槛也是引用')

  local d = R.deficits('keqing', { lines = 0, games = 2 })
  eq(#d, 2, '4.25 两条缺口都给出来（旧实现只给第一条）')
  eq(d[1].field, 'games', '4.26 缺口按“最接近达成”排序：差 1 局的 games 排第一')
  eq(d[1].left, 1, '4.27 games 还差 1')
  eq(R.closest('keqing', { lines = 0, games = 2 }).field, 'games', '4.28 closest 取最接近那条')
  eq(R.blocking('keqing', 'lines:40'), nil, '4.29 任一条达成 ⇒ blocking=nil（已经能解锁）')
  eq(R.closest('keqing', 'lines:40').field, 'games', '4.30 closest 仍给最接近的未达成条件（展示用）')
  eq(R.contractsOf('nobody').rule, false, '4.31 未知角色无规则')
  eq(R.blocking('keqing', { lines = 0, games = 2 }).field, 'games',
    '4.32 blocking 在未解锁时指真正该去打的进度')
end

-- ===========================================================================
-- 组 5：计数归属（count / reasonOf / parseReason）
-- ===========================================================================
do
  local S = R.newState()
  eq(R.count(S, 'lines', 3), 3, '5.01 count 累加 3')
  eq(R.count(S, 'lines', 2), 5, '5.02 再累加 2 ⇒ 5')
  eq(R.count(S, 'games'), 1, '5.03 缺省步长 1')
  eq(S.cnt.lines, 5, '5.04 计数落在 state.cnt（有归属）')
  eq(R.reasonOf(S), 'lines:5,games:1,tetris:0,pvp:0,time:0', '5.05 reason 串按 UNLOCK_ORDER 拼')
  eq(R.reasonOf(R.newState()), 'lines:0,games:0,tetris:0,pvp:0,time:0', '5.06 空计数拼全 0')

  -- reason 串可直接喂 tryUnlock（等价 main 现在手拼的那条）
  local S2 = R.newState()
  R.count(S2, 'lines', 40)
  local okk = R.tryUnlock(S2, 'keqing', R.reasonOf(S2))
  eq(okk, true, '5.07 计数 -> reason 串 -> 解锁（一条链）')

  -- 省略 reason ⇒ 直接读 state.cnt（旧实现必须外部拼串）
  local S3 = R.newState()
  R.count(S3, 'games', 3)
  eq(R.tryUnlock(S3, 'keqing'), true, '5.08 省略 reason 时读 state.cnt')

  local pr = R.parseReason('lines:12, games:3')
  eq(pr.lines, 12, '5.09 parseReason 容忍空格')
  eq(pr.games, 3, '5.10 第二段')
  eq(R.parseReason('bad,lines:abc').lines, nil, '5.11 非法片段静默丢弃（与旧实现同口径）')
  eq(R.parseReason({ lines = '12' }).lines, 12, '5.12 表形态会被归一成数字')
end

-- ===========================================================================
-- 组 6：swapIn —— 补旧实现缺失的换人机制
-- ===========================================================================
do
  local S = R.newState()
  R.tryUnlock(S, 'keqing', 'lines:40')
  R.tryUnlock(S, 'ganyu', 'lines:600')
  eq(#S.party, 2, '6.01 队伍满 2 人')
  eq(R.isMember(S, 'ganyu'), false, '6.02 甘雨已解锁但不在队（旧实现永远如此）')
  eq(R.gateOf('ganyu', S).canJoin, false, '6.03 队伍满 ⇒ canJoin=false（UI 据此提示）')

  local ok1, why1 = R.swapIn(S, 'ganyu')
  eq(ok1, true, '6.04 swapIn 成功')
  eq(why1, 'swap', '6.05 why=swap')
  eq(S.party[S.active], 'ganyu', '6.06 台前位换成甘雨')
  eq(R.isMember(S, 'nahida'), false, '6.07 纳西妲被换下（仍已解锁，可再换回）')
  eq(S.unlocked.nahida, true, '6.08 换下不改变解锁状态')

  local ok2, why2 = R.swapIn(S, 'nahida')
  eq(ok2, true, '6.09 可以换回来')
  eq(why2, 'swap', '6.10 仍是 swap')
  eq(S.party[S.active], 'nahida', '6.11 台前位回到纳西妲')

  local ok3, why3 = R.swapIn(S, 'keqing')      -- 已在队 ⇒ 只切台前
  eq(ok3, true, '6.12 已在队 ⇒ 允许')
  eq(why3, 'member', '6.13 why=member')
  eq(S.active, 2, '6.14 active 指到刻晴的位')

  local ok4, why4 = R.swapIn(S, 'columbina')
  eq(ok4, false, '6.15 未解锁不能上场')
  eq(why4, 'locked', '6.16 why=locked')

  eq(select(2, R.swapIn(nil, 'nahida')), 'bad-state', '6.17 nil state ⇒ bad-state')
  eq(select(2, R.swapIn(R.newState(), 'nobody')), 'unknown-role', '6.18 未知角色 ⇒ unknown-role')
end

-- ===========================================================================
-- 组 7：旧实现缺陷 PIN（红=已复现；改动这些行为必须同步改这里）
-- ===========================================================================
do
  -- ① 提示误导：只报 UNLOCK_ORDER 里第一条缺口，而不是“最接近达成”的那条
  local stO = OLD.newState()
  local _, whyO = OLD.tryUnlock(stO, 'keqing', 'lines:0,games:2')
  eq(whyO, 'need:lines>=40', '7.01 PIN 旧实现：差 1 局时仍提示 need:lines>=40（误导）')
  local _, whyN, infoN = R.tryUnlock(R.newState(), 'keqing', 'lines:0,games:2')
  eq(whyN, whyO, '7.02 兼容：why 串与旧实现逐字相同（接线期日志不变）')
  eq(infoN.closest.field, 'games', '7.03 新能力：info.closest 指向真正最接近的 games')

  -- ② 起始角色双源：旧实现把纳西妲写死为无条件解锁
  local stO2 = OLD.newState { startRoles = {} }
  local okO2, whyO2 = OLD.tryUnlock(stO2, 'nahida', 'lines:0')
  eq(okO2, true, '7.04 PIN 旧实现：START_ROLES 为空也无条件解锁纳西妲（硬编码）')
  eq(whyO2, 'ok', '7.05 PIN 同上的 why')
  -- 换一张 START_ROLES = {'keqing'} 的数值表：纳西妲就不再是特例
  local NUM2 = setmetatable({ START_ROLES = { 'keqing' } }, { __index = NUM })
  local R2 = rosterM.new { num = NUM2, copy = copyM, roster = NUM2.ROLES }
  local stN2 = R2.newState()
  eq(stN2.unlocked.keqing, true, '7.06 START_ROLES 换成刻晴 ⇒ 起始解锁刻晴')
  eq(stN2.unlocked.nahida, false, '7.07 纳西妲不再是起始角色（旧实现硬编码，做不到）')
  local okN2, whyN2 = R2.tryUnlock(stN2, 'nahida', 'lines:0')
  eq(okN2, false, '7.08 新模块：纳西妲走普通规则 ⇒ 未解锁')
  eq(whyN2, 'no-rule', '7.09 NUM.UNLOCK 里没有 nahida ⇒ no-rule')
  -- 但默认 START_ROLES 含 nahida 时，行为与玩家预期一致
  local stN3 = R.newState { startRoles = {} }
  eq(R.tryUnlock(stN3, 'nahida'), true, '7.10 默认 START_ROLES 含 nahida ⇒ 仍可解锁（玩家口径不变）')

  -- ③ 解锁域越界写成长域字段 state.tier
  local tierO = OLD.newState { startRoles = {} }
  tierO.tier.ganyu = nil
  OLD.tryUnlock(tierO, 'ganyu', 'lines:600')
  eq(tierO.tier.ganyu, 0, '7.11 PIN 旧解锁函数越界写 state.tier（成长域字段）')
  local tierN = R.newState { startRoles = {} }
  tierN.tier.ganyu = nil
  R.tryUnlock(tierN, 'ganyu', 'lines:600')
  eq(tierN.tier.ganyu, nil, '7.12 新模块不跨界写 tier（档位归 core_progress）')

  -- ④ 队伍只 append：旧实现没有任何换人/移出路径
  eq(OLD.swapIn, nil, '7.13 PIN 旧 skills 模块没有换人入口（main 全文也无 party 移除）')
  eq(type(R.swapIn), 'function', '7.14 新模块提供唯一换人规则 swapIn')
end

-- ===========================================================================
-- 组 8：容错
-- ===========================================================================
do
  eq(select(2, R.tryUnlock(nil, 'keqing')), 'bad-state', '8.01 nil state ⇒ bad-state')
  eq(select(2, R.tryUnlock({}, 'nobody')), 'unknown-role', '8.02 未知角色先于 state 检查')
  noThrow(function() R.tryUnlock({}, 'keqing') end, '8.03 空 state 不抛错（按无计数处理）')
  eq(select(2, R.tryUnlock({}, 'keqing')), 'need:lines>=40', '8.04 空 state ⇒ 第一条缺口')
  eq(R.isUnlocked(nil, 'nahida'), false, '8.05 isUnlocked(nil)=false')
  eq(R.isMember(nil, 'nahida'), false, '8.06 isMember(nil)=false')
  noThrow(function() R.gateOf(nil) end, '8.07 gateOf(nil) 不抛错')
  eq(R.gateOf(nil).knowen, nil, '8.08 gateOf(nil) 结构可用')
  eq(R.knownRole('nahida'), true, '8.09 knownRole 认可已注册角色')
  eq(R.knownRole('nobody'), false, '8.10 knownRole 拒绝未知角色')
  eq(R.knownRole(nil), false, '8.11 knownRole(nil)=false')
  noThrow(function() R.count(nil, 'lines', 1) end, '8.12 count(nil) 不抛错')
  eq(R.reasonOf(nil), 'lines:0,games:0,tetris:0,pvp:0,time:0', '8.13 reasonOf(nil) 给全 0')
end

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
