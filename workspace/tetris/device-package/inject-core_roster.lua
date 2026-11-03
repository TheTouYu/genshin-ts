--[[==========================================================================
  tetris/core_roster.lua —— 角色解锁「纯规则核心」（v6.1 重构 P2）
  ---------------------------------------------------------------------------
  为什么存在（docs/ARCH.md §0 机制 1）：解锁规则现在长在 skills.lua 的
  M.tryUnlock 里，而**计数**在 main.lua 的 SK.cnt（`FN.skillCount` 手写累加），
  **门槛**在 skills.NUM.UNLOCK，**契约文案**在 copy.ROLES[*].unlock —— 四份数据
  三个文件，任一处错都表现为「角色怎么解锁不了 / 解锁了怎么上不了场」。
  抽出纯模块后，这条链在 tests-lua/ 里可逐条验。

  硬边界（ARCH §1；同 core_skills / core_progress）
    · 不 require：`M.new{ num = …, copy = …, roster = … }`
    · 不碰 game.* / ctl.* / root；不 print；不拼文案（只给文案键）
    · 数值一律引用 NUM.UNLOCK / NUM.PARTY_MAX / NUM.START_ROLES / NUM.UNLOCK_ORDER

  ---------------------------------------------------------------------------
  【对外契约】

    M.new(spec) -> core

    core.newState(opts) -> state       解锁切片（unlocked / party / partyMax /
                                       active / cnt 计数）
    core.tryUnlock(state, role[, reason]) -> ok, why, info   ① 判定并落状态
    core.isUnlocked(state, role) -> bool
    core.isMember(state, role) -> bool
    core.gateOf(role[, state]) -> g    ② 门禁（门槛 + 队伍位 + 能否入队 + 契约文案引用）
    core.contractsOf(role[, counts]) -> c      ③ 契约条件（门槛/文案/进度）
    core.deficits(role, counts) -> array      ④ 结构化缺口（按“最接近达成”排序）
    core.closest(role, counts) -> one | nil
    core.count(state, key, n) -> 新值          计数归属（替代 main 的 SK.cnt 手写）
    core.reasonOf(state) -> 'lines:12,games:3,…'   旧 reason 串（装配用）
    core.parseReason(reason) -> counts         串/表两种形态都吃
    core.swapIn(state, role) -> ok, why        已解锁但不在队的角色上场（补缺失机制）
    core.thresholds(role) -> NUM.UNLOCK[role]（引用）| nil

  【why（返回码；与旧 skills.tryUnlock 逐字相同，接线期可直接喂日志/文案）】
    'ok' | 'already' | 'unknown-role' | 'bad-state' | 'no-rule' | 'need:<k>>=<n>'

  【info（第三个返回值；旧实现只有前两个）】
    { role, why, unlocked = bool, joined = bool, partyIndex = n, partyMax = n,
      deficits = {…}, closest = {…}, counts = {…}, canJoin = bool }

  ---------------------------------------------------------------------------
  【与旧 skills.M.tryUnlock 的差异（都是有意的，逐条钉在测试里）】
    ① 起始角色不再硬编码 `role == 'nahida'`：改由 NUM.START_ROLES 决定
       （旧实现两个真源：START_ROLES 造初始队伍 + tryUnlock 里的 nahida 特例，
       把 START_ROLES 改成别人后纳西妲仍然无条件解锁）。
    ② 返回结构化 deficits（全部缺口）与 closest（最少还差的那条）。
       旧实现只给「按 UNLOCK_ORDER 的第一条缺口」：刻晴差 2 局（games:1/3）时
       却提示 need:lines>=40 —— 提示会误导玩家去打不相关的进度。
    ③ 计数有归属：core.count(state, k, n) 写 state.cnt，reasonOf(state) 读它；
       旧实现的计数在 main.lua 的 SK.cnt，解锁函数只吃外部拼的串。
    ④ 新增 swapIn：旧实现里 party 只 append 一次（main.lua 全文没有移除路径），
       队伍满 2 人后解锁的第 3/4 位角色**永远无法上场**（Y 只在 party 内轮转）。
       swapIn 给出唯一的合法换人规则（替换台前位），等接线使用。
========================================================================]]

local M = {}

M.VERSION = 'v6.1-roster'

-- ===========================================================================
-- 内部工具
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

local function member(list, v)
  if not isTable(list) then return false end
  for i = 1, #list do
    if list[i] == v then return i end
  end
  return false
end

-- 'lines:312,games:3' -> { lines=312, games=3 }；非法片段静默丢弃（与旧实现同口径）
local function parseStr(reason)
  local out = {}
  if type(reason) ~= 'string' then return out end
  for pair in string.gmatch(reason, '[^,]+') do
    local k, v = string.match(pair, '^%s*([%w_]+)%s*:%s*([%-%d%.]+)%s*$')
    if k then out[k] = numOr(v, 0) end
  end
  return out
end

-- ===========================================================================
-- M.new(spec) -> core
-- ===========================================================================
M.new = function(spec)
  spec = spec or {}
  local NUM = spec.num
  if not isTable(NUM) then
    error('core_roster.new: spec.num 必填（数值表，例：skills.lua 的 M.NUM）', 2)
  end
  local COPY = isTable(spec.copy) and spec.copy or {}
  local ROLES = spec.roster
  if not isTable(ROLES) then ROLES = NUM.ROLES end
  if not isTable(ROLES) then ROLES = { 'nahida', 'keqing', 'ganyu', 'columbina' } end

  local C = { version = M.VERSION, num = NUM, copy = COPY, roles = ROLES }

  local function order()
    local o = NUM.UNLOCK_ORDER
    if isTable(o) then return o end
    return { 'lines', 'games', 'tetris', 'pvp', 'time' }
  end

  C.knownRole = function(role)
    if type(role) ~= 'string' then return false end
    if isTable(NUM.CD) and NUM.CD[role] ~= nil then return true end
    return member(ROLES, role) ~= false
  end

  -- 等级 -> AI 档位：表驱动、只纳西妲有档（与 core_progress.tierOf 同一公式）。
  -- 解锁域不"拥有"档位，但 newState 必须给出与旧 state 相同的默认值，
  -- 否则 main 直接读 state.tier 的地方会拿到 nil。
  local function tierOfLv(role, lv)
    if role ~= 'nahida' then return 0 end
    local t = isTable(NUM.NAHIDA) and NUM.NAHIDA.TIER_BY_LV or nil
    if not isTable(t) or #t == 0 then return 1 end
    local i = math.floor(numOr(lv, 1))
    if i < 1 then i = 1 end
    if i > #t then i = #t end
    return numOr(t[i], 0)
  end

  local function isStartRole(role)
    if type(role) ~= 'string' then return false end
    if isTable(NUM.START_ROLES) then return member(NUM.START_ROLES, role) ~= false end
    return role == 'nahida'      -- 没注入 START_ROLES 时的旧口径兜底
  end

  local function copyRole(role)
    if not isTable(COPY.ROLES) then return nil end
    local e = COPY.ROLES[role]
    if e then return e end
    local A = COPY.ROLES
    if role == 'columbina' and A.girl then return A.girl end
    return nil
  end

  C.thresholds = function(role)
    if not isTable(NUM.UNLOCK) then return nil end
    return NUM.UNLOCK[role]
  end

  -- =========================================================================
  -- C.newState(opts) -> state   解锁切片
  --   与 core_skills/core_progress 的 state 同型（unlocked/party/partyMax/active），
  --   额外带 cnt（累计计数）与 energy/cd 的空壳，便于与另两个模块合成同一张表。
  -- =========================================================================
  C.newState = function(opts)
    if not isTable(opts) then opts = {} end
    local roles = isTable(opts.roles) and opts.roles or ROLES
    local partyMax = math.floor(numOr(opts.partyMax, numOr(NUM.PARTY_MAX, 2)))
    if partyMax < 0 then partyMax = 0 end
    local startRoles = isTable(opts.startRoles) and opts.startRoles or NUM.START_ROLES
    if not isTable(startRoles) then startRoles = {} end

    -- 建的是**完整的旧 state 形状**（不止解锁切片）：解锁域自己的字段是
    -- unlocked/party/partyMax/active/cnt；成长域的 lv/exp/nodes/tier 也给默认值，
    -- 避免 main 换 newState 后出现半张表。两模块不互 require，各自实现一份，
    -- tests 里有「两个 newState 产出同一张表」的防漂移断言。
    local slots = isTable(NUM.NODE_GATE) and (#NUM.NODE_GATE + 1) or 3
    local s = { roles = {}, unlocked = {}, party = {}, partyMax = partyMax, active = 0,
                cnt = {}, lv = {}, exp = {}, nodes = {}, tier = {}, tal = {},
                cd = {}, energy = {} }
    for i = 1, #roles do
      local r = roles[i]
      if C.knownRole(r) and not member(s.roles, r) then
        s.roles[#s.roles + 1] = r
        s.unlocked[r] = false
        s.lv[r], s.exp[r] = 1, 0
        s.nodes[r] = {}
        for k = 1, slots do s.nodes[r][k] = (k == 1) and 1 or 0 end
        s.tier[r] = tierOfLv(r, 1)
        s.cd[r], s.energy[r] = 0, 0
      end
    end
    -- 起始角色：只解锁 + 入队（受 partyMax 约束）
    for i = 1, #startRoles do
      local r = startRoles[i]
      if C.knownRole(r) and s.unlocked[r] ~= nil then
        s.unlocked[r] = true
        if #s.party < partyMax then s.party[#s.party + 1] = r end
      end
    end
    s.active = (#s.party > 0) and 1 or 0
    return s
  end

  -- =========================================================================
  -- 读取
  -- =========================================================================
  C.isUnlocked = function(state, role)
    if not isTable(state) or not isTable(state.unlocked) then return false end
    return state.unlocked[role] == true
  end

  C.isMember = function(state, role)
    if not isTable(state) then return false end
    return member(state.party, role) ~= false
  end

  C.parseReason = function(reason)
    if isTable(reason) then
      local out = {}
      for k, v in pairs(reason) do out[k] = numOr(v, 0) end
      return out
    end
    return parseStr(reason)
  end

  -- 计数归属：state.cnt[key] += n（旧实现这段在 main.lua 的 FN.skillCount）
  C.count = function(state, key, n)
    if not isTable(state) or type(key) ~= 'string' then return 0 end
    if not isTable(state.cnt) then state.cnt = {} end
    local v = numOr(state.cnt[key], 0) + numOr(n, 1)
    state.cnt[key] = v
    return v
  end

  -- 旧 reason 串（main.lua:4094-4096 手拼的五段串，这里同一份实现）
  C.reasonOf = function(state)
    local cnt = isTable(state) and isTable(state.cnt) and state.cnt or {}
    local parts = {}
    local o = order()
    for i = 1, #o do
      local k = o[i]
      parts[#parts + 1] = tostring(k) .. ':' .. tostring(math.floor(numOr(cnt[k], 0)))
    end
    return table.concat(parts, ',')
  end

  -- =========================================================================
  -- C.gateOf(role[, state]) -> g   门禁（角色页/HUD/解锁播报都用这一份）
  -- =========================================================================
  C.gateOf = function(role, state)
    local g = { role = role, known = C.knownRole(role), startRole = isStartRole(role),
                rule = false, thresholds = nil, order = order(),
                copyKey = 'copy.roles.' .. tostring(role) .. '.unlock',
                skillKey = 'copy.roles.' .. tostring(role) .. '.skill',
                moment = nil, skillName = nil,
                unlocked = false, member = false, partyIndex = 0,
                partyMax = math.floor(numOr(isTable(NUM) and NUM.PARTY_MAX, 2)),
                partySize = 0, canJoin = false }
    local e = copyRole(role)
    if e then
      g.moment = e.unlock            -- {t=…, b=…}：契约立好那一刻的文案（引用）
      g.skillName = e.skill
    end
    local req = C.thresholds(role)
    if isTable(req) then
      g.rule = true
      g.thresholds = req             -- NUM.UNLOCK[role] 的引用
    end
    if isTable(state) then
      g.unlocked = C.isUnlocked(state, role)
      local idx = member(state.party, role)
      g.member = idx ~= false
      g.partyIndex = idx or 0
      g.partySize = isTable(state.party) and #state.party or 0
      g.partyMax = math.floor(numOr(state.partyMax, g.partyMax))
      g.canJoin = (not g.member) and (g.partySize < g.partyMax)
    end
    return g
  end

  -- =========================================================================
  -- C.contractsOf(role[, reason|counts]) -> c
  --   契约条件：门槛（NUM.UNLOCK）+ 文案（copy.ROLES[role].unlock）+ OR 语义
  --   counts 给了就带进度（have/ok/left/ratio）
  -- =========================================================================
  C.contractsOf = function(role, reason)
    local counts = reason
    if type(reason) == 'string' then counts = parseStr(reason) end
    if not isTable(counts) then counts = nil end

    local c = { role = role, known = C.knownRole(role), startRole = isStartRole(role),
                any = true, rule = false, copyKey = 'copy.roles.' .. tostring(role) .. '.unlock',
                conditions = {}, counts = counts }
    local e = copyRole(role)
    if e then
      c.moment = e.unlock
      c.skillName = e.skill
      c.skillKey = 'copy.roles.' .. tostring(role) .. '.skill'
    end
    local req = C.thresholds(role)
    if not isTable(req) then return c end
    c.rule = true
    local o = order()
    for i = 1, #o do
      local k = o[i]
      local need = req[k]
      if need ~= nil then
        local cond = { field = k, need = numOr(need, 0), order = i,
                       key = 'unlock.' .. tostring(role) .. '.' .. tostring(k),
                       labelKey = 'unlock.cond.' .. tostring(k),
                       ref = need }        -- 同一个值（引用），不复制
        if counts then
          local have = numOr(counts[k], 0)
          cond.have = have
          cond.ok = have >= cond.need
          cond.left = math.max(0, cond.need - have)
          cond.ratio = (cond.need > 0) and math.min(1, have / cond.need) or 1
        end
        c.conditions[#c.conditions + 1] = cond
      end
    end
    return c
  end

  -- =========================================================================
  -- C.deficits(role, counts) -> array   全部缺口，按“最接近达成”排序
  -- =========================================================================
  C.deficits = function(role, counts)
    local out = {}
    if type(counts) == 'string' then counts = parseStr(counts) end
    counts = isTable(counts) and counts or {}
    local c = C.contractsOf(role, counts)
    for i = 1, #c.conditions do
      local cond = c.conditions[i]
      if not cond.ok then out[#out + 1] = cond end
    end
    table.sort(out, function(a, b)
      if a.ratio == b.ratio then return a.order < b.order end
      return a.ratio > b.ratio           -- 进度高的（更接近达成）排前面
    end)
    return out
  end

  -- 最接近达成的那条未达成条件（**展示用**：即使整体已达成也会返回，便于角色页
  -- 显示「还差 1 局」而不是一句「已解锁」）
  C.closest = function(role, counts)
    local d = C.deficits(role, counts)
    return d[1]
  end

  -- 解锁还差什么（**判定用**）：OR 语义下任一条达成 ⇒ 已经能解锁 ⇒ nil
  C.blocking = function(role, counts)
    if type(counts) == 'string' then counts = parseStr(counts) end
    local c = C.contractsOf(role, isTable(counts) and counts or {})
    for i = 1, #c.conditions do
      if c.conditions[i].ok then return nil end
    end
    return C.closest(role, counts)
  end

  -- =========================================================================
  -- C.tryUnlock(state, role[, reason]) -> ok, why, info
  --   门禁顺序与旧实现一致：bad-state → unknown-role → already → 起始角色 →
  --   规则缺失 → OR 条件。reason 省略时读 state.cnt（计数有归属）。
  -- =========================================================================
  C.tryUnlock = function(state, role, reason)
    local info = { role = role, why = nil, unlocked = false, joined = false,
                   partyIndex = 0, partyMax = 0, deficits = {}, closest = nil, counts = {} }
    if not isTable(state) then
      info.why = 'bad-state'
      return false, 'bad-state', info
    end
    if not C.knownRole(role) then
      info.why = 'unknown-role'
      return false, 'unknown-role', info
    end
    if not isTable(state.unlocked) then state.unlocked = {} end
    if state.unlocked[role] == true then
      info.why = 'already'
      info.unlocked = true
      info.partyIndex = member(state.party, role) or 0
      return false, 'already', info
    end

    -- 起始角色：由 NUM.START_ROLES 决定（不再硬编码角色名）
    if isStartRole(role) then
      state.unlocked[role] = true
      info.why, info.unlocked = 'ok', true
      info.joined, info.partyIndex, info.partyMax = C.enqueue(state, role)
      return true, 'ok', info
    end

    local req = C.thresholds(role)
    if not isTable(req) then
      info.why = 'no-rule'
      return false, 'no-rule', info
    end

    local counts
    if reason == nil then
      counts = isTable(state.cnt) and state.cnt or {}
    else
      counts = C.parseReason(reason)
    end
    info.counts = counts

    local c = C.contractsOf(role, counts)
    local hit, firstNeed, nearest = false, nil, nil
    for i = 1, #c.conditions do
      local cond = c.conditions[i]
      if cond.ok then
        hit = true
      elseif not firstNeed then
        firstNeed = 'need:' .. tostring(cond.field) .. '>=' .. tostring(math.floor(cond.need))
      end
      if not cond.ok then
        if not nearest or cond.ratio > nearest.ratio then nearest = cond end
      end
    end
    info.deficits = C.deficits(role, counts)
    info.closest = nearest

    if not hit then
      info.why = firstNeed or 'need:unknown'
      return false, info.why, info
    end

    state.unlocked[role] = true
    info.why, info.unlocked = 'ok', true
    info.joined, info.partyIndex, info.partyMax = C.enqueue(state, role)
    return true, 'ok', info
  end

  -- 入队（受 partyMax 约束）；满员时只解锁不入队 —— 但 canJoin 让 UI 能提示
  C.enqueue = function(state, role)
    if not isTable(state) then return false, 0, 0 end
    if not isTable(state.party) then state.party = {} end
    local pmax = math.floor(numOr(state.partyMax, numOr(NUM.PARTY_MAX, 2)))
    local idx = member(state.party, role)
    if idx then return false, idx, pmax end
    if #state.party < pmax then
      state.party[#state.party + 1] = role
      return true, #state.party, pmax
    end
    return false, 0, pmax
  end

  -- =========================================================================
  -- C.swapIn(state, role) -> ok, why, info
  --   已解锁但不在队的角色替换「台前位」上场（补旧实现缺失的唯一换人规则：
  --   main.lua 全文没有 party 移除路径 ⇒ 队伍满 2 人后第 3/4 位角色永远上不了场）
  -- =========================================================================
  C.swapIn = function(state, role)
    local info = { role = role, why = nil, from = nil, to = nil, partyIndex = 0 }
    if not isTable(state) then
      info.why = 'bad-state'
      return false, 'bad-state', info
    end
    if not C.knownRole(role) then
      info.why = 'unknown-role'
      return false, 'unknown-role', info
    end
    if not C.isUnlocked(state, role) then
      info.why = 'locked'
      return false, 'locked', info
    end
    local idx = member(state.party, role)
    if idx then
      state.active = idx              -- 已在队：只切台前
      info.why, info.partyIndex = 'member', idx
      return true, 'member', info
    end
    local pmax = math.floor(numOr(state.partyMax, numOr(NUM.PARTY_MAX, 2)))
    if pmax <= 0 then
      info.why = 'no-slot'
      return false, 'no-slot', info
    end
    if not isTable(state.party) then state.party = {} end
    local a = math.floor(numOr(state.active, 1))
    if a < 1 or a > pmax then a = 1 end
    local old = state.party[a]
    state.party[a] = role
    state.active = a
    info.why, info.from, info.to, info.partyIndex = 'swap', old, role, a
    return true, 'swap', info
  end

  return C
end

return M
