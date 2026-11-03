--[[==========================================================================
  tetris/core_progress.lua —— 角色成长「纯规则核心」（v6.1 重构 P2）
  ---------------------------------------------------------------------------
  为什么存在（docs/ARCH.md §0 机制 1）：成长规则（经验曲线 / 升级上限 / 跨门槛
  自动加点 / AI 档位）现在长在 skills.lua 的 M.addExp 里，和四角色技能、数值表、
  天赋运行时混在同一个 1472 行文件 —— 「升级没给节点 / 到了门槛没加成 / 经验条不对」
  只能靠模拟器整一轮去猜。抽出纯模块后，这些判定在 tests-lua/ 里 30 毫秒出结论。

  硬边界（ARCH §1 三条硬规则；违反即违规）
    · 不 require 任何东西 —— 依赖注入：`M.new{ num = …, copy = …, roster = … }`
    · 不碰 game.* / ctl.* / root / 脚本全局
    · 不 print、不拼文案（成长播报文案在 copy.lua，键名由本模块给）
    · 唯一可变对象 = 调用方传进来的 state

  ---------------------------------------------------------------------------
  【对外契约】

    M.new(spec) -> core      spec = { num = <数值表，必填>, copy = <可选>, roster = <可选> }

    core.newState(opts) -> state      成长切片（lv / exp / nodes / tier）
    core.addExp(state, role, amount) -> res      ① 加经验 + 结算升级（主形态）
    core.addExp(state, amount)       -> res      ① 台前角色形态（role 省略 = party[active]）
    core.levelUp(state[, role])      -> res      ② 只结算现有经验（不新增）
    core.autoPoint(state, role)      -> events   ③ 按当前 lv 补齐门槛节点（幂等）
    core.params(state, role) -> p                ④ 只读派生（等级/经验条/节点/AI 档位）
    core.expToNext(state, role) -> n             下一级所需经验（满级返回 0）
    core.tierOf(role, lv) -> n                   等级 -> AI 档位（表驱动，只纳西妲有档）
    core.expForClear(lines) -> n                 消行经验换算（要求 NUM.EXP_PER_LINE）
    core.curve -> NUM.EXP_PER_LEVEL（引用）      core.levelCap -> NUM.LEVEL_MAX（引用）

  【res（addExp / levelUp 的返回值；前三个键与旧 M.addExp 逐字一致）】
    { leveled = bool,        -- 本次是否升级（旧契约 5.01/5.02/5.12）
      lv = n,                -- 结算后该角色等级（未知角色 = 0，旧契约 5.03/5.13）
      node = 'N2'|nil,       -- 本次最后新点亮的节点名（旧契约 5.06）
      role = role, from = lvBefore, to = lvAfter,
      gained = n,            -- 本次进来的经验（addExp 的 amount；levelUp = 0）
      spent = n, rest = n,   -- 升级消耗 / 剩余
      points = n,            -- 本次新增的节点点数（跨了几个门槛）
      atMax = bool,          -- 结算后是否满级
      events = { {kind='levelup', lv=2, from=1, points=0},
                 {kind='node', node=2, name='N2', lv=3}, … } }

  【params（只读派生；接线/HUD/角色页只准读这里）】
    { lv, exp, need, ratio, atMax, overflow,
      tier, nodes = {…}, nodeMax, points, nextGate = {lv=3, node=2} | nil,
      levelCap, curveStep }

  【与旧 skills.M.addExp 的关系】
    · 契约 5.01–5.15 逐条对齐（tests-lua/core_progress_test.lua 有逐条 + 差分组）。
    · 本模块比旧实现多给三样东西（旧实现里要么没有、要么只给最后一个）：
      ① events 列表：一次跨多级时每级/每个门槛各一条，不再只返回最后一个 'N5'；
      ② points：本次跨了几个门槛；
      ③ params2 派生：经验条/下一门槛/节点点数。
    · **节点等级仍是 0/1**（与旧实现一致）：NUM 里没有加点成本表，也没有第二个
      加点入口，所以 nodes[role][i] 永远是 0 或 1 —— 而 pick3(list, nodeLv) 的三档
      永远取第 1 档。这是**已知机制缺失**，钉在测试 PIN 里，补齐需要设计裁决
      （每级给点数？花点数升 2/3 级？），本模块只保证「规则只有一个实现处」。
========================================================================]]

local M = {}

M.VERSION = 'v6.1-progress'

-- ===========================================================================
-- 内部工具（容错；除 M.new 的 spec 校验外永不抛错）
-- ===========================================================================
local function numOr(v, d)
  local n = tonumber(v)
  if n == nil then return d end
  if n ~= n then return d end
  return n
end

local function isTable(v)
  return type(v) == 'table'
end

-- ===========================================================================
-- M.new(spec) -> core
-- ===========================================================================
M.new = function(spec)
  spec = spec or {}
  local NUM = spec.num
  if not isTable(NUM) then
    error('core_progress.new: spec.num 必填（数值表，例：skills.lua 的 M.NUM）', 2)
  end
  local ROLES = spec.roster
  if not isTable(ROLES) then ROLES = NUM.ROLES end
  if not isTable(ROLES) then ROLES = { 'nahida', 'keqing', 'ganyu', 'columbina' } end

  local C = { version = M.VERSION, num = NUM, roles = ROLES }

  local levelCap = math.floor(numOr(NUM.LEVEL_MAX, 1))
  if levelCap < 1 then levelCap = 1 end
  C.levelCap = levelCap
  C.curve = NUM.EXP_PER_LEVEL

  local function curveOf(lv)
    if not isTable(NUM.EXP_PER_LEVEL) then return 0 end
    return numOr(NUM.EXP_PER_LEVEL[lv], 0)
  end

  local function nodeGates()
    local g = NUM.NODE_GATE
    if not isTable(g) then return {} end
    return g
  end

  -- 等级 -> 本次新解锁的节点序号（2..N），非门槛等级返回 nil
  local function nodeIdxForLv(lv)
    local gates = nodeGates()
    for i = 1, #gates do
      if lv == gates[i] then return i + 1 end
    end
    return nil
  end

  -- 等级 -> AI 档位（表驱动；只有纳西妲有档位，其他角色恒 0）
  C.tierOf = function(role, lv)
    if role ~= 'nahida' then return 0 end
    local t = isTable(NUM.NAHIDA) and NUM.NAHIDA.TIER_BY_LV or nil
    if not isTable(t) or #t == 0 then return 1 end
    local i = math.floor(numOr(lv, 1))
    if i < 1 then i = 1 end
    if i > #t then i = #t end
    return numOr(t[i], 0)
  end

  local function nodeSlots()
    -- N1（初始 1 级）+ 每个 NODE_GATE 一个槽：旧实现只建 3 格却按 N2..N5 写，
    -- 这里按门槛数建满（修掉「3 槽 vs 4 门槛」的错位）。
    return #nodeGates() + 1
  end
  C.nodeSlots = nodeSlots()

  -- 角色白名单：只有 NUM.CD 里登记过（或注入的角色表里）的名字能进 state.newState；
  -- 旧实现把任何非空字符串都收进 roles（早先 newState 会收录 'bogus'），
  -- 真正的角色表是 NUM 的，未知名字应该是配置错误而不是静默入册。
  local function knownRole(role)
    if type(role) ~= 'string' or role == '' then return false end
    if isTable(NUM.CD) and NUM.CD[role] ~= nil then return true end
    for i = 1, #ROLES do
      if ROLES[i] == role then return true end
    end
    return false
  end
  C.knownRole = knownRole

  local function rolesList(state)
    if isTable(state) and isTable(state.roles) and #state.roles > 0 then
      return state.roles
    end
    return ROLES
  end

  local function activeRole(state)
    if not isTable(state) or not isTable(state.party) or #state.party == 0 then return nil end
    local i = math.floor(numOr(state.active, 1))
    if i < 1 or i > #state.party then i = 1 end
    return state.party[i]
  end

  -- =========================================================================
  -- C.newState(opts) -> state   成长切片
  --   与 core_skills.newState 的字段同名同型（lv / exp / nodes / tier / roles），
  --   另外带 party/active 的空壳以便和 core_roster.newState 直接合成一张 state。
  -- =========================================================================
  C.newState = function(opts)
    if not isTable(opts) then opts = {} end
    local roles = isTable(opts.roles) and opts.roles or ROLES
    local slots = nodeSlots()
    local partyMax = math.floor(numOr(opts.partyMax, numOr(NUM.PARTY_MAX, 2)))
    if partyMax < 0 then partyMax = 0 end
    local startRoles = isTable(opts.startRoles) and opts.startRoles or NUM.START_ROLES
    if not isTable(startRoles) then startRoles = {} end
    -- 建的是**完整的旧 state 形状**（不止成长切片）：这样 main 把 newState 换成这里
    -- 不会出现「另一半字段是 nil」的半张表。解锁/队伍那段与 core_roster 同一规则、
    -- 各自实现一份（两模块不互 require），tests 里有跨模块一致性与形状断言防漂移。
    local s = { roles = {}, lv = {}, exp = {}, nodes = {}, tier = {}, tal = {},
                party = {}, partyMax = partyMax, active = 0,
                unlocked = {}, cd = {}, energy = {}, cnt = {} }
    for i = 1, #roles do
      local r = roles[i]
      if knownRole(r) and s.lv[r] == nil then
        s.roles[#s.roles + 1] = r
        s.lv[r], s.exp[r] = 1, 0
        s.nodes[r] = {}
        for k = 1, slots do s.nodes[r][k] = (k == 1) and 1 or 0 end
        s.tier[r] = C.tierOf(r, 1)
        s.unlocked[r] = false
        s.cd[r], s.energy[r] = 0, 0
      end
    end
    for i = 1, #startRoles do
      local r = startRoles[i]
      if knownRole(r) and s.lv[r] ~= nil then
        s.unlocked[r] = true
        if #s.party < partyMax then s.party[#s.party + 1] = r end
      end
    end
    s.active = (#s.party > 0) and 1 or 0
    return s
  end

  -- =========================================================================
  -- C.autoPoint(state, role) -> events
  --   按当前等级把「已跨过的门槛节点」补齐到 1 级（幂等）。旧实现只有 addExp
  --   内部那条内联路径；这里显式化，读档/回填/调试也走同一个规则。
  -- =========================================================================
  C.autoPoint = function(state, role)
    local events = {}
    if not isTable(state) or type(role) ~= 'string' then return events end
    if not isTable(state.lv) or state.lv[role] == nil then return events end
    if not isTable(state.nodes) then state.nodes = {} end
    if not isTable(state.nodes[role]) then state.nodes[role] = {} end
    local lv = math.floor(numOr(state.lv[role], 1))
    local gates = nodeGates()
    for i = 1, #gates do
      if lv >= numOr(gates[i], math.huge) then
        local ni = i + 1
        if numOr(state.nodes[role][ni], 0) < 1 then
          state.nodes[role][ni] = 1
          events[#events + 1] = { kind = 'node', node = ni, name = 'N' .. ni, lv = lv }
        end
      end
    end
    return events
  end

  -- =========================================================================
  -- C.levelUp(state[, role]) -> res      只结算现有经验
  --   role 省略 = 结算 state.roles 里的全部角色（回合结束批量结算用）
  -- =========================================================================
  local function settleOne(state, role)
    local res = { leveled = false, lv = 0, node = nil, role = role,
                  from = 0, to = 0, gained = 0, spent = 0, rest = 0,
                  points = 0, atMax = false, events = {} }
    if not isTable(state) then return res end
    if type(role) ~= 'string' then return res end
    if not isTable(state.lv) or not isTable(state.exp) then return res end
    if state.lv[role] == nil then return res end

    local lv = math.floor(numOr(state.lv[role], 1))
    if lv < 1 then lv = 1 end
    local exp = math.max(0, numOr(state.exp[role], 0))
    res.from = lv
    res.rest = exp

    if not isTable(state.nodes) then state.nodes = {} end
    if not isTable(state.nodes[role]) then state.nodes[role] = {} end

    while lv < levelCap do
      local need = curveOf(lv)
      if need <= 0 then break end
      if exp < need then break end
      exp = exp - need
      lv = lv + 1
      res.spent = res.spent + need
      res.leveled = true
      local ev = { kind = 'levelup', lv = lv, from = lv - 1, points = 0 }
      res.events[#res.events + 1] = ev
      -- 自动加点：跨过 NODE_GATE 就把该节点点亮到 1 级（旧实现的内联路径）
      local ni = nodeIdxForLv(lv)
      if ni and numOr(state.nodes[role][ni], 0) < 1 then
        state.nodes[role][ni] = 1
        res.node = 'N' .. ni
        res.points = res.points + 1
        ev.points = ev.points + 1
        res.events[#res.events + 1] = { kind = 'node', node = ni, name = 'N' .. ni, lv = lv }
      end
    end

    state.lv[role] = lv
    state.exp[role] = exp
    res.to = lv
    res.lv = lv
    res.rest = exp
    res.atMax = (lv >= levelCap)
    if isTable(state.tier) then state.tier[role] = C.tierOf(role, lv) end
    return res
  end

  C.levelUp = function(state, role)
    if type(role) == 'string' then return settleOne(state, role) end
    -- 批量形态：合并所有角色的事件，lv/node 取「等级变化最大的那个」不好用，
    -- 因此批量形态返回 per-role 表：{ leveled = bool, roles = {role=res…}, events = … }
    local out = { leveled = false, lv = 0, node = nil, role = nil,
                  from = 0, to = 0, gained = 0, spent = 0, rest = 0,
                  points = 0, atMax = false, events = {}, roles = {} }
    local list = rolesList(state)
    for i = 1, #list do
      local r = list[i]
      local one = settleOne(state, r)
      if isTable(state) and isTable(state.lv) and state.lv[r] ~= nil then
        out.roles[r] = one
        if one.leveled then out.leveled = true end
        out.points = out.points + one.points
        out.spent = out.spent + one.spent
        for k = 1, #one.events do
          local ev = one.events[k]
          ev.role = r
          out.events[#out.events + 1] = ev
        end
      end
    end
    return out
  end

  -- =========================================================================
  -- C.addExp(state, role, amount) -> res     ① 主形态
  -- C.addExp(state, amount)       -> res     台前角色形态
  -- =========================================================================
  C.addExp = function(state, role, amount)
    -- 形态判定：第二参是字符串 ⇒ (state, role, amount)；是数字 ⇒ (state, amount)
    if type(role) ~= 'string' then
      amount = role
      role = activeRole(state)
    end
    local res = { leveled = false, lv = 0, node = nil, role = role,
                  from = 0, to = 0, gained = 0, spent = 0, rest = 0,
                  points = 0, atMax = false, events = {} }
    if not isTable(state) then return res end
    if type(role) ~= 'string' then return res end
    if not isTable(state.lv) or not isTable(state.exp) then return res end
    if state.lv[role] == nil then return res end

    local lv = math.floor(numOr(state.lv[role], 1))
    if lv < 1 then lv = 1 end
    res.from = lv
    res.lv = lv
    res.rest = numOr(state.exp[role], 0)

    local amt = numOr(amount, 0)
    if amt <= 0 then return res end        -- 旧契约 5.01：amount<=0 不加也不升级

    res.gained = amt
    state.exp[role] = math.max(0, numOr(state.exp[role], 0)) + amt
    local settled = settleOne(state, role)
    settled.gained = amt
    return settled
  end

  -- =========================================================================
  -- C.expToNext(state, role) -> n   下一级所需经验（满级/未知角色 = 0）
  -- =========================================================================
  C.expToNext = function(state, role)
    if not isTable(state) or type(role) ~= 'string' then return 0 end
    if not isTable(state.lv) or state.lv[role] == nil then return 0 end
    local lv = math.floor(numOr(state.lv[role], 1))
    if lv < 1 then lv = 1 end
    if lv >= levelCap then return 0 end
    return curveOf(lv)
  end

  -- =========================================================================
  -- C.expForClear(lines) -> n
  --   消行 -> 经验。**数值必须来自 NUM.EXP_PER_LINE**：旧实现把这条件硬编码在
  --   main.lua:1212 的 `cleared * 10` 里，NUM 没有这个键。这里不复制常数：
  --   NUM 缺键就返回 0（并让测试把「缺项」钉成红灯），补进 NUM 后自动接管。
  -- =========================================================================
  C.expForClear = function(lines)
    local per = numOr(NUM.EXP_PER_LINE, nil)
    if per == nil then return 0 end
    local n = math.max(0, math.floor(numOr(lines, 0)))
    return n * per
  end

  -- =========================================================================
  -- C.params(state, role) -> p   只读派生
  -- =========================================================================
  C.params = function(state, role)
    local p = { lv = 1, exp = 0, need = 0, ratio = 0, atMax = false, overflow = 0,
                tier = 0, nodes = {}, nodeMax = nodeSlots(), points = 0,
                nextGate = nil, levelCap = levelCap, curveStep = 0 }
    if not isTable(state) or type(role) ~= 'string' then return p end
    if not isTable(state.lv) or state.lv[role] == nil then return p end

    local lv = math.floor(numOr(state.lv[role], 1))
    if lv < 1 then lv = 1 end
    local exp = math.max(0, numOr(isTable(state.exp) and state.exp[role], 0))
    local need = (lv >= levelCap) and 0 or curveOf(lv)

    p.lv = lv
    p.exp = exp
    p.need = need
    p.atMax = (lv >= levelCap)
    p.tier = C.tierOf(role, lv)
    p.curveStep = numOr((NUM.META or {}).EXP_STEP, 0)

    if p.atMax then
      p.ratio = 1
      p.overflow = exp          -- 满级后多余经验（旧实现无界累积；HUD 决定怎么显示）
    elseif need > 0 then
      p.ratio = math.min(1, exp / need)
    else
      p.ratio = 0
    end

    if isTable(state.nodes) and isTable(state.nodes[role]) then
      for i = 1, nodeSlots() do
        p.nodes[i] = numOr(state.nodes[role][i], 0)
        if p.nodes[i] > 0 then p.points = p.points + 1 end
      end
    end

    -- 下一个门槛：第一个还没点亮的节点（等级不够就给它的等级要求）
    local gates = nodeGates()
    for i = 1, #gates do
      local ni = i + 1
      if numOr(p.nodes[ni], 0) < 1 then
        p.nextGate = { lv = numOr(gates[i], 0), node = ni, name = 'N' .. ni }
        break
      end
    end
    return p
  end

  return C
end

return M
