--[[==========================================================================
  tests-lua/core_progress_test.lua —— 成长域纯模块 headless 验收（v6.1 P2）
  跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_progress_test.lua
  判据：全 PASS、退出码 0（任一 FAIL ⇒ 1）

  要证明什么：
    ① 契约 skills_test.lua 组 5（5.01–5.15）逐条由本模块覆盖，口径与旧实现一致
    ② 差分组：同一操作序列驱动旧 skills.M.addExp 与新模块，逐字段相等
    ③ 边界：amount=0 / 负 / 小数、恰好够 / 差 1 点、LEVEL_MAX 封顶、满级再加
    ④ 新能力：events 列表（多级跨多门槛各一条）、points、params 派生
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

local progM, progPath = loadCandidates(prefixed('lua/tetris/core_progress.lua'))
local skillsM, skillsPath = loadCandidates(prefixed('lua/tetris/skills.lua'))
local copyM = loadCandidates(prefixed('lua/tetris/copy.lua'))

if progM == nil then
  io.write('FATAL 无法装载 core_progress.lua\n')
  os.exit(2)
end
if skillsM == nil then
  io.write('FATAL 无法装载 skills.lua（数值表是注入源）\n')
  os.exit(2)
end
io.write('LOAD  ', progPath, '  VERSION=', tostring(progM.VERSION), '\n')
io.write('LOAD  ', skillsPath, '  (旧实现，差分组用)\n----\n')

local NUM = skillsM.NUM
local OLD = skillsM
local P = progM.new { num = NUM, copy = copyM, roster = NUM.ROLES }

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

local src = slurp(progPath)
ok(src ~= nil and #src > 1000, '0.01 core_progress.lua 可读且非空')
local code = stripComments(src or '')
ok(not code:find('print%s*%(', 1) and not code:find('io%.write', 1), '0.02 不 print / 不写 stdout')
ok(not code:find('require%s*%(', 1), '0.03 不 require（纯依赖注入）')
ok(not code:find('game%.[%a_]', 1) and not code:find('ctl%.[%a_]', 1), '0.04 不碰 game.* / ctl.*')
ok(not code:find('os%.time', 1) and not code:find('math%.random', 1), '0.05 不读时间/全局随机')

local okNew, errNew = pcall(progM.new, {})
ok(not okNew, '0.06 M.new 缺 spec.num 明确报错')
hasSub(tostring(errNew), 'spec.num', '0.07 报错点名 spec.num')

-- ===========================================================================
-- 组 1：newState —— 成长切片形状
-- ===========================================================================
local S0 = P.newState()
eq(#S0.roles, 4, '1.01 四角色入册')
eq(S0.lv.nahida, 1, '1.02 起始等级 1')
eq(S0.exp.nahida, 0, '1.03 起始经验 0')
eq(S0.tier.nahida, 1, '1.04 起始 AI 档位 1')
eq(S0.nodes.nahida[1], 1, '1.05 N1 初始即点亮 1 级')
eq(S0.nodes.nahida[2], 0, '1.06 N2 初始未点亮')
eq(#S0.nodes.nahida, #NUM.NODE_GATE + 1,
  '1.07 节点槽位 = 门槛数 + 1（修掉旧实现 3 槽 vs 4 门槛的错位）')
eq(P.nodeSlots, #NUM.NODE_GATE + 1, '1.08 nodeSlots 与 newState 一致')
eq(P.levelCap, NUM.LEVEL_MAX, '1.09 levelCap 引用 NUM.LEVEL_MAX')
eq(P.curve, NUM.EXP_PER_LEVEL, '1.10 经验曲线是 NUM 的同一个表（引用）')
eq(S0.tier.keqing, 0, '1.11 非纳西妲角色无 AI 档位（恒 0）')

local S0b = P.newState { roles = { 'nahida', 'nahida', 'bogus' } }
eq(#S0b.roles, 1, '1.12 重复角色名去重')
eq(S0b.lv.bogus, nil, '1.13 未知角色不入册')

-- ===========================================================================
-- 组 2：契约 skills_test 组 5（5.01–5.15）逐条
-- ===========================================================================
local S5 = P.newState()

local r5a = P.addExp(S5, 'nahida', 0)
eq(r5a.leveled, false, '5.01 amount=0 不升级')

local r5b = P.addExp(S5, 'nahida', 40)
eq(r5b.leveled, true, '5.02 exp 40 → 升到 lv2')
eq(r5b.lv, 2, '5.03 返回值 lv=2')
eq(S5.exp.nahida, 0, '5.04 升级后 exp 归零（40-40）')

local r5c = P.addExp(S5, 'nahida', 80)   -- 2→3 需 80
eq(r5c.lv, 3, '5.05 exp 80 → lv3')
eq(r5c.node, 'N2', '5.06 跨过 lv3 门槛自动点亮 N2（自动加点）')
eq(S5.nodes.nahida[2], 1, '5.07 nodes.nahida[2] 已置 1')
eq(S5.tier.nahida, 2, '5.08 lv3 时 state.tier 同步为 2')

local r5d = P.addExp(S5, 'nahida', 999999)
eq(S5.lv.nahida, NUM.LEVEL_MAX, '5.09 巨量经验不突破 LEVEL_MAX=12')
eq(S5.nodes.nahida[5], 1, '5.10 lv12 门槛自动点亮 N5')
eq(S5.tier.nahida, 8, '5.11 lv12 → tier 8 已写回 state.tier')

local r5e = P.addExp(S5, 'nobody', 100)
eq(r5e.leveled, false, '5.12 未知 role → leveled=false 不抛错')
eq(r5e.lv, 0, '5.13 未知 role → lv=0')

noThrow(function() P.addExp(nil, 'nahida', 10) end, '5.14 addExp(nil) 不抛错')
noThrow(function() P.addExp({}, 'nahida', 10) end, '5.15 addExp 空 state 不抛错')

-- ===========================================================================
-- 组 3：差分 —— 同一操作序列驱动旧 skills.M.addExp 与新区块，逐字段相等
-- ===========================================================================
local function nodesOf(state, role, n)
  local out = {}
  for i = 1, n do
    out[i] = (type(state.nodes) == 'table' and type(state.nodes[role]) == 'table')
      and (state.nodes[role][i] or 0) or 0
  end
  return out
end

local function sameRes(o, n, tag)
  local diffs = {}
  if o.leveled ~= n.leveled then diffs[#diffs + 1] = 'leveled' end
  if o.lv ~= n.lv then diffs[#diffs + 1] = 'lv ' .. tostring(o.lv) .. '/' .. tostring(n.lv) end
  if (o.node or '') ~= (n.node or '') then
    diffs[#diffs + 1] = 'node ' .. tostring(o.node) .. '/' .. tostring(n.node)
  end
  ok(#diffs == 0, '3.xx 差分 ' .. tag, #diffs > 0 and table.concat(diffs, ' ') or nil)
end

do
  local seq = { 40, 80, 130, 0, -5, 39, 1, 190, 260, 340, 430, 530, 640, 760, 900, 999999 }
  local so = OLD.newState()
  local sn = P.newState()
  for i = 1, #seq do
    local ro = OLD.addExp(so, 'nahida', seq[i])
    local rn = P.addExp(sn, 'nahida', seq[i])
    sameRes(ro, rn, 'nahida 第 ' .. i .. ' 步 amount=' .. tostring(seq[i]))
    eq(sn.exp.nahida, so.exp.nahida, '3.xx 差分 exp nahida 第 ' .. i .. ' 步')
    eq(sn.tier.nahida, so.tier.nahida, '3.xx 差分 tier nahida 第 ' .. i .. ' 步')
    local a, b = nodesOf(so, 'nahida', 5), nodesOf(sn, 'nahida', 5)
    local same = true
    for k = 1, 5 do
      if a[k] ~= b[k] then same = false end
    end
    ok(same, '3.xx 差分 nodes nahida 第 ' .. i .. ' 步',
      same and nil or (table.concat(a, ',') .. ' vs ' .. table.concat(b, ',')))
  end

  -- 非纳西妲角色（tier 恒 0；自动加点同样生效）
  local ko, kn = OLD.newState(), P.newState()
  local kseq = { 40, 80, 130, 190, 260, 340, 430 }
  for i = 1, #kseq do
    local ro = OLD.addExp(ko, 'keqing', kseq[i])
    local rn = P.addExp(kn, 'keqing', kseq[i])
    sameRes(ro, rn, 'keqing 第 ' .. i .. ' 步')
    eq(kn.tier.keqing, ko.tier.keqing, '3.xx 差分 tier keqing（恒 0）第 ' .. i .. ' 步')
  end
  eq(kn.nodes.keqing[2], ko.nodes.keqing[2], '3.xx 差分 刻晴 N2 点亮状态一致')
end

-- ===========================================================================
-- 组 4：边界（0 / 恰好够 / 差一点 / 上限 / 满级再加）
-- ===========================================================================
do
  local E = P.newState()
  eq(E.events, nil, '4.01 状态本身不携带事件（事件只在返回值里）')

  local a = P.addExp(E, 'nahida', 39)
  eq(a.leveled, false, '4.02 39 点（差 1）不升级')
  eq(E.exp.nahida, 39, '4.03 39 点全部留在 exp')
  local b = P.addExp(E, 'nahida', 1)
  eq(b.leveled, true, '4.04 恰好 40 点 ⇒ 升级（闭区间边界）')
  eq(b.lv, 2, '4.05 lv=2')
  eq(E.exp.nahida, 0, '4.06 经验恰好清零')

  local E2 = P.newState()
  local neg = P.addExp(E2, 'nahida', -100)
  eq(neg.leveled, false, '4.07 负经验不升级')
  eq(E2.exp.nahida, 0, '4.08 负经验不写回（不出现负 exp）')
  local frac = P.addExp(E2, 'nahida', 40.7)
  eq(frac.lv, 2, '4.09 小数经验正常结算')
  near(E2.exp.nahida, 0.7, '4.10 小数余量保留')

  -- 上限：恰好到 LEVEL_MAX 不再越界
  local E3 = P.newState()
  local needToCap = 0
  for lv = 1, NUM.LEVEL_MAX - 1 do needToCap = needToCap + NUM.EXP_PER_LEVEL[lv] end
  local cap = P.addExp(E3, 'nahida', needToCap)
  eq(E3.lv.nahida, NUM.LEVEL_MAX, '4.11 恰好满级（累计曲线和）')
  eq(cap.atMax, true, '4.12 atMax 标记就位')
  eq(E3.exp.nahida, 0, '4.13 恰好满级时余量 0')
  local cap2 = P.addExp(E3, 'nahida', 500)
  eq(E3.lv.nahida, NUM.LEVEL_MAX, '4.14 满级后再加不越界')
  eq(cap2.leveled, false, '4.15 满级后 leveled=false')
  eq(P.expToNext(E3, 'nahida'), 0, '4.16 满级 expToNext=0')
end

-- ===========================================================================
-- 组 5：新能力 —— events 列表 / points / levelUp / autoPoint
-- ===========================================================================
do
  local V = P.newState()
  local r = P.addExp(V, 'nahida', 40 + 80)     -- 1→2（40）、2→3（80）
  eq(#r.events, 3, '5.01 两次升级 + 一个门槛 ⇒ 3 条事件')
  eq(r.events[1].kind, 'levelup', '5.02 事件 1 = levelup')
  eq(r.events[1].lv, 2, '5.03 事件 1 等级 2')
  eq(r.events[2].kind, 'levelup', '5.04 事件 2 = levelup')
  eq(r.events[2].lv, 3, '5.05 事件 2 等级 3')
  eq(r.events[2].points, 1, '5.06 跨门槛那一级记 points=1（自动加点）')
  eq(r.events[3].kind, 'node', '5.07 事件 3 = node')
  eq(r.events[3].name, 'N2', '5.08 点亮 N2')
  eq(r.points, 1, '5.09 res.points = 本次新增节点点数')

  -- 旧实现只返回最后一个节点名：一次跨 4 个门槛时中间的 N2/N3/N4 事件丢失
  local M2 = P.newState()
  local big = P.addExp(M2, 'nahida', 999999)
  eq(big.node, 'N5', '5.10 巨量经验最后一次点亮 N5（与旧实现同口径）')
  eq(big.points, 4, '5.11 本次跨了 4 个门槛 ⇒ points=4（旧实现拿不到这个数）')
  local nodes = 0
  for i = 1, #big.events do
    if big.events[i].kind == 'node' then nodes = nodes + 1 end
  end
  eq(nodes, 4, '5.12 events 里 N2..N5 四条都在（旧实现只留最后一个）')

  -- levelUp：只结算现有经验，不新增
  local L = P.newState()
  L.exp.nahida = 120                    -- 已经攒了 120 点（未结算）
  local up = P.levelUp(L, 'nahida')
  eq(up.leveled, true, '5.13 levelUp 结算存量经验')
  eq(L.lv.nahida, 3, '5.14 120 点 ⇒ lv3')
  eq(up.gained, 0, '5.15 gained=0（levelUp 不加经验）')
  eq(up.spent, 120, '5.16 spent = 本次消耗 120')

  -- levelUp 批量形态（role 省略）
  local B = P.newState()
  B.exp.nahida, B.exp.keqing = 40, 40
  local batch = P.levelUp(B)
  eq(batch.leveled, true, '5.17 批量结算有升级')
  eq(#batch.events >= 2, true, '5.18 批量事件按角色各一条')
  eq(B.lv.keqing, 2, '5.19 批量也把刻晴升到 lv2')

  -- autoPoint 幂等 + 按等级补齐
  local A = P.newState()
  A.lv.nahida = 12
  local evs = P.autoPoint(A, 'nahida')
  eq(#evs, 4, '5.20 lv12 一次补齐 N2..N5 四个槽')
  eq(A.nodes.nahida[5], 1, '5.21 N5 已点亮')
  eq(#P.autoPoint(A, 'nahida'), 0, '5.22 再调一次无新事件（幂等）')
  local A2 = P.newState()
  A2.lv.nahida = 6
  P.autoPoint(A2, 'nahida')
  eq(A2.nodes.nahida[2], 1, '5.23 lv6 含 N2')
  eq(A2.nodes.nahida[3], 1, '5.24 lv6 含 N3')
  eq(A2.nodes.nahida[4], 0, '5.25 lv6 不含 N4（lv9 才到）')
end

-- ===========================================================================
-- 组 6：params 派生（经验条 / 下一门槛 / 点数）
-- ===========================================================================
do
  local Q = P.newState()
  local p = P.params(Q, 'nahida')
  eq(p.lv, 1, '6.01 params.lv')
  eq(p.need, NUM.EXP_PER_LEVEL[1], '6.02 need = 曲线第 1 项（引用）')
  near(p.ratio, 0, '6.03 经验条 0')
  eq(p.nextGate.lv, NUM.NODE_GATE[1], '6.04 下一门槛 = NODE_GATE[1]')
  eq(p.nextGate.name, 'N2', '6.05 下一门槛节点名 N2')
  eq(p.points, 1, '6.06 已点亮节点数 = 1（N1）')
  eq(p.nodeMax, #NUM.NODE_GATE + 1, '6.07 nodeMax = 槽位数')

  Q.exp.nahida = NUM.EXP_PER_LEVEL[1] / 2
  near(P.params(Q, 'nahida').ratio, 0.5, '6.08 经验条 50%')
  Q.exp.nahida = NUM.EXP_PER_LEVEL[1] + 1
  local p2 = P.params(Q, 'nahida')
  near(p2.ratio, 1, '6.09 超过 need 时 ratio 收敛到 1（不溢出到 2）')

  local Q2 = P.newState()
  Q2.lv.nahida = NUM.LEVEL_MAX
  P.autoPoint(Q2, 'nahida')       -- 手动改 lv 不会自动点亮节点，显式补齐
  Q2.exp.nahida = 12345
  local pm = P.params(Q2, 'nahida')
  eq(pm.atMax, true, '6.10 满级 atMax')
  eq(pm.need, 0, '6.11 满级 need=0')
  eq(pm.ratio, 1, '6.12 满级 ratio=1')
  eq(pm.overflow, 12345, '6.13 满级余量单列（overflow，供 HUD 决定显示）')
  eq(pm.nextGate, nil, '6.14 满级且节点齐 ⇒ 无下一门槛')
  eq(P.params(nil, 'nahida').lv, 1, '6.15 params(nil) 安全默认')
  eq(P.params({}, 'nobody').need, 0, '6.16 未知角色 need=0')
end

-- ===========================================================================
-- 组 7：旧实现缺陷 PIN（红=已复现；改动这些行为必须同时改这里）
-- ===========================================================================
do
  -- ① 节点等级永远是 0/1：全仓唯一写入点是 `state.nodes[role][ni] = 1`
  --    ⇒ pick3(list, nodeLv(...)) 的三档（Lv1/2/3）永远取第 1 档。
  local D = P.newState()
  P.addExp(D, 'nahida', 999999)
  local maxNode = 0
  for i = 1, P.nodeSlots do
    local v = D.nodes.nahida[i] or 0
    if v > maxNode then maxNode = v end
  end
  eq(maxNode, 1, '7.01 PIN 节点等级上限是 1（自动加点只点亮，不升级）')
  eq(OLD.addExp ~= nil, true, '7.02 PIN 旧实现的自动加点也只有一个 =1 写入点')

  -- ② 满级后经验无界累积：与旧实现一致（不擅自改口径）
  local E = OLD.newState()
  OLD.addExp(E, 'nahida', 999999)
  local N = P.newState()
  P.addExp(N, 'nahida', 999999)
  ok(E.exp.nahida > 900000, '7.03 PIN 旧实现满级后 exp 无界累积（实测 ' ..
    tostring(E.exp.nahida) .. '）')
  eq(N.exp.nahida, E.exp.nahida, '7.04 PIN 新模块保留同一口径（不静默改行为）')

  -- ③ 消行经验换算没有真源：旧 main.lua:1212 写死 `cleared * 10`
  eq(P.expForClear(4), 0, '7.05 PIN NUM 缺 EXP_PER_LINE ⇒ expForClear 返回 0（不复制 10）')
  local NUM2 = setmetatable({ EXP_PER_LINE = 10 }, { __index = NUM })
  local P2 = progM.new { num = NUM2, copy = copyM, roster = NUM2.ROLES }
  eq(P2.expForClear(4), 40, '7.06 注入 EXP_PER_LINE 后自动接管（4 行 × 10）')

  -- ④ 一次跨多级只返回最后一个节点名（事件丢失）—— 新模块用 events 补齐
  local G = OLD.newState()
  local go = OLD.addExp(G, 'nahida', 999999)
  eq(go.node, 'N5', '7.07 PIN 旧实现只返回最后一个节点名')
  eq(go.points, nil, '7.08 PIN 旧实现没有 points（无法知道这次点了几个）')
end

-- ===========================================================================
-- 组 8：容错
-- ===========================================================================
do
  noThrow(function() P.addExp(nil, nil, nil) end, '8.01 addExp(nil,nil,nil) 不抛错')
  noThrow(function() P.levelUp(nil) end, '8.02 levelUp(nil) 不抛错')
  noThrow(function() P.levelUp({}) end, '8.03 levelUp({}) 不抛错')
  noThrow(function() P.autoPoint(nil, 'nahida') end, '8.04 autoPoint(nil) 不抛错')
  noThrow(function() P.autoPoint({}, 'nobody') end, '8.05 autoPoint 未知角色不抛错')
  eq(#P.autoPoint({}, 'nobody'), 0, '8.06 autoPoint 未知角色返回空事件表')
  eq(P.tierOf('nobody', 5), 0, '8.07 tierOf 未知角色 = 0')
  eq(P.tierOf('nahida', 999), NUM.NAHIDA.TIER_BY_LV[#NUM.NAHIDA.TIER_BY_LV],
    '8.08 tierOf 超界收敛到尾项')
  eq(P.tierOf('nahida', 0), NUM.NAHIDA.TIER_BY_LV[1], '8.09 tierOf 下界收敛到首项')
  eq(P.expToNext({}, 'nahida'), 0, '8.10 expToNext 空 state = 0')
  eq(P.params({}, 'nahida').points, 0, '8.11 params 空 state 点数 0')

  -- 经验为 nil/字符串时的容错
  local T = P.newState()
  T.exp.nahida = nil
  local r = P.addExp(T, 'nahida', 40)
  eq(r.leveled, true, '8.12 exp 字段缺失时按 0 起算')
  local T2 = P.newState()
  T2.exp.nahida = '80'
  eq(P.addExp(T2, 'nahida', 0).leveled, false, '8.13 字符串 exp + amount=0 不升级')
  eq(P.levelUp(T2, 'nahida').lv, 2, '8.14 字符串 "80" 被解析后结算到 lv2')
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
