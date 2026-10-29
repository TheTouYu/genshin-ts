--[[==========================================================================
  tetris/skills.lua —— 四角色技能与养成「纯逻辑层」（v4.0）
  --------------------------------------------------------------------------
  模块契约（见 docs/research/lua-module-contract.md）：
    · chunk 在 require 那一刻执行 ⇒ 顶层**禁止**实例化控件、禁止碰 game / root / script
    · 独立 _ENV（看不到 main.lua 的全局）⇒ 本文件**不 require 任何东西**
    · `return` 恰好 1 个表
  职责边界：
    · 本模块只做状态机与数值。**不碰棋盘、不碰控件、不出文案、不播音效**——
      这些全部由 main.lua 按返回值接线（main 只存 state 引用）。
    · 所有函数**容错**：role 不存在 / state 缺字段 / dt<=0 / 参数 nil ⇒ 返回 false|0|空表，不抛错。
    · 全部魔法数字集中在 M.NUM，改平衡只改那一张表。
  设计文档：docs/characters-design.md §6.6（本模块 API 契约）
=========================================================================]]

local M = {}

M.VERSION = 'v4.0'

-- ===========================================================================
-- M.NUM —— 唯一数值来源（main 侧调试 / 对账文档 §6.1 都读这张表）
-- ===========================================================================
M.NUM = {
  -- ---- 编成 ----
  ROLES      = { 'nahida', 'keqing', 'ganyu', 'columbina' },
  PARTY_MAX  = 2,                 -- 一局最多携带 2 个可在前台发力的主动角色
  START_ROLES = { 'nahida' },     -- 初始只解锁小草神

  -- ---- 角色等级 / 经验（局内成长）----
  LEVEL_MAX     = 12,
  EXP_PER_LEVEL = { 40, 80, 130, 190, 260, 340, 430, 530, 640, 760, 900 }, -- 1→2 … 11→12
  EXP_SKILL      = 10,            -- 每次施放技能
  EXP_EFFECT     = 25,            -- 技能产生有效收益（冻结 >0 行 / 清行 >0 行 / AI 接管期间涨分）
  EXP_FRONT_PER10 = 15,           -- 前台每 10 块
  EXP_BACK_PER10  = 5,            -- 后台每 10 块
  NODE_GATE = { 3, 6, 9, 12 },    -- N2..N5 的解锁等级

  -- ---- 能量（少女的月之领域靠它,其余角色仅作展示）----
  ENERGY_MAX   = 100,
  ENERGY_REGEN = 6,               -- 点/秒

  -- ---- 切换 ----
  SWITCH_CD = 8,                  -- 前台角色切换冷却（秒）

  -- ---- 冷却 / 耗能 ----
  CD   = { nahida = 25, keqing = 7.5,  ganyu = 12, columbina = 17 },
  CD2  = { nahida = 30, keqing = 5,    ganyu = 20, columbina = 15 },  -- 第二技能
  COST = { nahida = 0,  keqing = 0,    ganyu = 0,  columbina = 60 },

  -- ---- 纳西妲 ----
  NAHIDA = {
    -- lv → AI 档位。lv1..5 只到 4（初始上限），6 以后逐级解锁 5..8
    TIER_BY_LV = { 1, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8 },
    -- 裁决 #5「初始 AI 档上限 = 4」由 TIER_BY_LV 的 lv1..5 段实现（lv5→4），
    -- 本字段是同一事实的对外声明/调试读数，**不参与计算**（改它不会生效，改表才生效）
    TIER_CAP_START = 4,
    TAKE_DUR   = { 6, 8, 10 },    -- 「接手」持续时间（N1 的 3 级）
    KARMA_ROWS = 1,               -- 「业障除」清盘底行数
  },

  -- ---- 刻晴 ----
  KEQING = {
    MARK_DUR   = { 5, 7, 9 },     -- 雷楔存续（对齐官方「雷楔至多存在 5 秒」）
    BLINK_CD   = { 7.5, 6.0, 4.5 },-- 「星斗归位」瞬移 CD（N2 的 3 级）
    LOCK       = { 0.20, 0.15, 0.10 }, -- 瞬移后短暂禁止横移（秒），N3
    SLASH_ROWS = 1,               -- 「天街巡游」清行数
  },

  -- ---- 甘雨 ----
  GANYU = {
    FREEZE_ROWS = { 3, 4, 5 },    -- 「降众天华」冻结行数（N2 的 3 级）
    FREEZE_SEC  = 3,              -- 冻结时长（秒）
    CHARGE_FULL = 0.8,            -- 霜华矢蓄满所需（秒）
    LOTUS_ROWS  = 3,              -- 「冰莲」清顶部行数
    CLUTCH_H    = 17,             -- 板高 ≥ 该值 ⇒ 冻结行数 +1（背水一战）
  },

  -- ---- 哥伦比娅（少女）----
  COLUMBINA = {
    LAYERS     = { 2, 3, 4 },     -- 「引力涟漪」给对手挂的层数（N1 的 3 级）
    LD_CUT     = { 0.15, 0.22, 0.30 }, -- 每层削减对手锁定延迟（秒）
    DOMAIN_DUR = { 6, 8, 10 },    -- 「她的乡愁」领域持续（秒）
    GRAVITY_NEED = { 5, 4, 3 },   -- 单人模式：攒满引力值所需敌方垃圾行数
    CLEAR_ROWS = 1,               -- 单人模式满值后清盘底行数
    SOLO_COST  = 0,               -- 单人降级分支不耗能（只吃 CD），否则没对手时按钮长期不可用
    PRESSURE_H = 15,              -- 对手板高 ≥ 该值 ⇒ 层数 +1（打最弱者）
    LAYER_CAP  = 4,
  },

  -- ---- 局外/会话内养成的「每级永久小提升」（裁决 #2：v1 用 lv 近似）----
  META = {
    AI_DUR_PER_LV    = 0.04,      -- 纳西妲「接手」+0.04s/级（lv12 累计 +0.44）
    FREEZE_SEC_PER_LV = 0.05,     -- 甘雨冻结 +0.05s/级
    HOLD_CUT_PER_LV  = 3,         -- 少女每层削减 +3ms/级
  },

  -- ---- 解锁条件（OR 语义：满足任一即解锁；计数由 main 以 reason 串传入）----
  -- reason 形态：'lines:312,games:3,tetris:52,pvp:1,time:600'
  UNLOCK_ORDER = { 'lines', 'games', 'tetris', 'pvp', 'time' },
  UNLOCK = {
    keqing    = { lines = 40,  games = 3 },     -- 累计消行 40 行 或 3 局（裁决示例值）
    ganyu     = { lines = 600, time = 300 },    -- 累计消行 600 行 或 单局 300 秒
    columbina = { pvp = 1,     tetris = 50 },   -- 打过 1 局 PvP 或 50 次四消
  },
}

-- ===========================================================================
-- 内部工具（全部容错，不抛错）
-- ===========================================================================
local function numOr(v, d)
  local n = tonumber(v)
  if n == nil then return d end
  if n ~= n then return d end          -- NaN
  return n
end

local function isTable(v)
  return type(v) == 'table'
end

local function knownRole(role)
  if type(role) ~= 'string' then return false end
  return M.NUM.CD[role] ~= nil
end

local function rolesList(state)
  if isTable(state) and isTable(state.roles) and #state.roles > 0 then
    return state.roles
  end
  return M.NUM.ROLES
end

local function member(list, v)
  if not isTable(list) then return false end
  for i = 1, #list do
    if list[i] == v then return true end
  end
  return false
end

-- nodes 数组取第 i 项（1..3 级），缺省 0；不建表，避免在只读路径上改 state
local function nodeLv(state, role, i)
  if not isTable(state) or not isTable(state.nodes) then return 0 end
  local nd = state.nodes[role]
  if not isTable(nd) then return 0 end
  return numOr(nd[i], 0)
end

-- 3 级数组取档：level 1..3 → list[1..3]
local function pick3(list, level)
  if not isTable(list) then return 0 end
  local i = math.floor(numOr(level, 0))
  if i < 1 then i = 1 end
  if i > #list then i = #list end
  return numOr(list[i], 0)
end

-- lv → AI 档位（表驱动；超界收敛到 1/8）
local function tierOf(role, lv)
  if role ~= 'nahida' then return 0 end
  local t = M.NUM.NAHIDA.TIER_BY_LV
  local i = math.floor(numOr(lv, 1))
  if i < 1 then i = 1 end
  if i > #t then i = #t end
  return t[i]
end

-- 等级 → 本次新解锁的节点序号（2..5），非门槛等级返回 nil
local function nodeIdxForLv(lv)
  local gates = M.NUM.NODE_GATE
  for i = 1, #gates do
    if lv == gates[i] then return i + 1 end
  end
  return nil
end

-- 'lines:312,games:3' → {lines=312, games=3}
local function parseReason(reason)
  local out = {}
  if type(reason) ~= 'string' then return out end
  for pair in string.gmatch(reason, '[^,]+') do
    local k, v = string.match(pair, '^%s*([%w_]+)%s*:%s*([%-%d%.]+)%s*$')
    if k then out[k] = numOr(v, 0) end
  end
  return out
end

-- ===========================================================================
-- M.newState(opts) -> state
--   opts = { roles = {...}, partyMax = 2, startRoles = {'nahida'} }（全部可省）
-- ===========================================================================
M.newState = function(opts)
  if not isTable(opts) then opts = {} end

  local roles = isTable(opts.roles) and opts.roles or M.NUM.ROLES
  local partyMax = math.floor(numOr(opts.partyMax, M.NUM.PARTY_MAX))
  if partyMax < 0 then partyMax = 0 end
  local startRoles = isTable(opts.startRoles) and opts.startRoles or M.NUM.START_ROLES

  local s = {
    party = {}, active = 0, energy = {}, cd = {}, lv = {}, exp = {},
    unlocked = {}, nodes = {}, tier = {},
    roles = {}, partyMax = partyMax,
  }

  -- ① 建全量表（只用合法角色名，重复名去重）
  for i = 1, #roles do
    local r = roles[i]
    if type(r) == 'string' and r ~= '' and s.lv[r] == nil then
      s.roles[#s.roles + 1] = r
      s.energy[r] = 0
      s.cd[r] = 0
      s.lv[r] = 1
      s.exp[r] = 0
      s.unlocked[r] = false
      s.nodes[r] = { 1, 0, 0 }   -- N1 初始 1 级，N2..N5 未开放
      s.tier[r] = tierOf(r, 1)
    end
  end

  -- ② 起始解锁 + 入队（受 partyMax 约束）
  for i = 1, #startRoles do
    local r = startRoles[i]
    if type(r) == 'string' and s.lv[r] ~= nil and #s.party < partyMax then
      s.unlocked[r] = true
      s.party[#s.party + 1] = r
    end
  end

  s.active = (#s.party > 0) and 1 or 0
  return s
end

-- ===========================================================================
-- M.tick(state, dt) -> nil    冷却递减 + 能量自然回复（只改 state）
-- ===========================================================================
M.tick = function(state, dt)
  if not isTable(state) then return nil end
  dt = numOr(dt, 0)
  if dt <= 0 then return nil end

  local list = rolesList(state)
  local regen = M.NUM.ENERGY_REGEN * dt
  for i = 1, #list do
    local r = list[i]
    if type(r) == 'string' then
      if isTable(state.cd) then
        local c = numOr(state.cd[r], 0) - dt
        state.cd[r] = (c > 0) and c or 0
      end
      if isTable(state.energy) then
        local e = numOr(state.energy[r], 0) + regen
        if e > M.NUM.ENERGY_MAX then e = M.NUM.ENERGY_MAX end
        state.energy[r] = e
      end
    end
  end
  return nil
end

-- ===========================================================================
-- M.addExp(state, role, amount) -> { leveled, node, lv }
--   node = 本次新解锁的节点名 'N2'..'N5'（无则 nil）
--   自动加点：跨过 NODE_GATE 等级就自动把该节点点亮到 1 级
-- ===========================================================================
M.addExp = function(state, role, amount)
  local out = { leveled = false, node = nil, lv = 0 }
  if not isTable(state) or type(role) ~= 'string' then return out end
  if not isTable(state.lv) or not isTable(state.exp) then return out end
  if state.lv[role] == nil then return out end

  local lv = math.floor(numOr(state.lv[role], 1))
  out.lv = lv

  local amt = numOr(amount, 0)
  if amt <= 0 then return out end

  local exp = numOr(state.exp[role], 0) + amt
  local nodeName = nil
  local maxLv = M.NUM.LEVEL_MAX

  while lv < maxLv do
    local need = numOr(M.NUM.EXP_PER_LEVEL[lv], 0)
    if need <= 0 or exp < need then break end
    exp = exp - need
    lv = lv + 1
    out.leveled = true
    local ni = nodeIdxForLv(lv)
    if ni and isTable(state.nodes) and isTable(state.nodes[role]) then
      if numOr(state.nodes[role][ni], 0) < 1 then
        state.nodes[role][ni] = 1
        nodeName = 'N' .. ni
      end
    end
  end

  state.exp[role] = exp
  state.lv[role] = lv
  out.lv = lv
  out.node = nodeName
  if isTable(state.tier) then state.tier[role] = tierOf(role, lv) end
  return out
end

-- ===========================================================================
-- M.cast(state, role, ctx) -> { ok, why, effect, n, tier }
--   ctx = { mode='casual'|'ai-battle'|'pvp'|'coop', boardH=number, oppH=number, now=number }
--   ok=true 时 why=nil；effect 是效果标识（main 按它分派）；n 是该效果的自然量纲：
--     nahida    -> AI 档位 n（1..8）
--     keqing    -> 瞬移后横移封锁秒数 n
--     ganyu     -> 冻结行数 n
--     columbina -> 给对手挂的层数 n（单人模式改为清底行数）
-- ===========================================================================
M.cast = function(state, role, ctx)
  local out = { ok = false, why = 'bad-state', effect = 'none', n = 0, tier = 0 }
  if not isTable(state) then return out end
  if not knownRole(role) then out.why = 'unknown-role'; return out end
  if isTable(state.unlocked) and state.unlocked[role] ~= true then
    out.why = 'locked'; return out
  end
  if not member(state.party, role) then out.why = 'not-in-party'; return out end

  if not isTable(ctx) then ctx = {} end
  local mode   = type(ctx.mode) == 'string' and ctx.mode or 'casual'
  local boardH = numOr(ctx.boardH, 0)
  local oppH   = numOr(ctx.oppH, 0)

  -- 冷却门禁（先于能量：CD 中不必提示"能量不足"）
  local cdv = numOr(isTable(state.cd) and state.cd[role], 0)
  if cdv > 0 then
    out.why = 'cd'
    out.n = cdv
    out.tier = tierOf(role, isTable(state.lv) and state.lv[role])
    return out
  end

  -- 模式分支先定，再据此决定能量门禁是否适用
  --   少女的「月之领域」只在有对手时生效；单人/合作降级为「引力值满后清盘底」，
  --   该分支不耗能（只吃 CD），否则没对手时按钮长期不可用。
  local isDuel = (role == 'columbina') and (mode == 'pvp' or mode == 'ai-battle')
  local cost = numOr(M.NUM.COST[role], 0)
  if role == 'columbina' and not isDuel then
    cost = numOr(M.NUM.COLUMBINA.SOLO_COST, 0)
  end

  -- 能量门禁
  local en = numOr(isTable(state.energy) and state.energy[role], 0)
  if cost > 0 and en < cost then
    out.why = 'energy'
    out.n = cost - en
    return out
  end

  local p = M.params(state, role)
  local lv = isTable(state.lv) and state.lv[role]
  local n1 = nodeLv(state, role, 1)
  local n2 = nodeLv(state, role, 2)
  local n3 = nodeLv(state, role, 3)

  local useCd = numOr(M.NUM.CD[role], 0)
  local effect, n

  if role == 'nahida' then
    effect = 'ai-takeover'
    n = p.aiTier
    useCd = numOr(M.NUM.CD.nahida, 25)
  elseif role == 'keqing' then
    effect = 'blink'
    n = pick3(M.NUM.KEQING.LOCK, n3)          -- 封锁秒数
    useCd = pick3(M.NUM.KEQING.BLINK_CD, n2)  -- N2 缩短 CD
  elseif role == 'ganyu' then
    effect = 'freeze'
    n = p.freezeRows
    if boardH >= M.NUM.GANYU.CLUTCH_H then n = n + 1 end
    useCd = numOr(M.NUM.CD.ganyu, 12)
  elseif role == 'columbina' then
    useCd = numOr(M.NUM.CD.columbina, 17)
    if isDuel then
      effect = 'ripple'
      n = pick3(M.NUM.COLUMBINA.LAYERS, n1)
      if oppH >= M.NUM.COLUMBINA.PRESSURE_H then n = n + 1 end
      if n > M.NUM.COLUMBINA.LAYER_CAP then n = M.NUM.COLUMBINA.LAYER_CAP end
    else
      -- 单人/合作：无对手 ⇒ 降级为「引力值满后清盘底」，不空放、不耗能
      effect = 'gravity-clear'
      n = numOr(M.NUM.COLUMBINA.CLEAR_ROWS, 1)
    end
  end

  -- 落状态：CD 起算 + 扣能量
  if isTable(state.cd) then state.cd[role] = useCd end
  if cost > 0 and isTable(state.energy) then
    local e = en - cost
    if e < 0 then e = 0 end
    state.energy[role] = e
  end

  out.ok = true
  out.why = nil
  out.effect = effect or 'none'
  out.n = numOr(n, 0)
  out.tier = tierOf(role, lv)
  return out
end

-- ===========================================================================
-- M.params(state, role) -> table   给 main 读的数值
--   { aiTier, aiDur, freezeRows, freezeSec, holdCutMs, clearRows }
--   —— 全部由 state.lv 与 state.nodes 推导；含会话内养成的每级小提升
-- ===========================================================================
M.params = function(state, role)
  local p = { aiTier = 0, aiDur = 0, freezeRows = 0, freezeSec = 0, holdCutMs = 0, clearRows = 0 }
  if not isTable(state) or type(role) ~= 'string' then return p end

  local lvRaw = isTable(state.lv) and state.lv[role]
  local lv = math.floor(numOr(lvRaw, 1))
  if lv < 1 then lv = 1 end
  local g = lv - 1
  local meta = M.NUM.META

  if role == 'nahida' then
    p.aiTier = tierOf(role, lv)
    p.aiDur  = pick3(M.NUM.NAHIDA.TAKE_DUR, nodeLv(state, role, 1))
               + numOr(meta.AI_DUR_PER_LV, 0) * g
    p.clearRows = numOr(M.NUM.NAHIDA.KARMA_ROWS, 1)

  elseif role == 'keqing' then
    p.aiTier = 0
    p.clearRows = numOr(M.NUM.KEQING.SLASH_ROWS, 1)

  elseif role == 'ganyu' then
    p.freezeRows = pick3(M.NUM.GANYU.FREEZE_ROWS, nodeLv(state, role, 2))
    p.freezeSec  = numOr(M.NUM.GANYU.FREEZE_SEC, 3) + numOr(meta.FREEZE_SEC_PER_LV, 0) * g
    p.clearRows  = numOr(M.NUM.GANYU.LOTUS_ROWS, 3)

  elseif role == 'columbina' then
    p.holdCutMs = pick3(M.NUM.COLUMBINA.LD_CUT, nodeLv(state, role, 1)) * 1000
                  + numOr(meta.HOLD_CUT_PER_LV, 0) * g
    p.clearRows = numOr(M.NUM.COLUMBINA.CLEAR_ROWS, 1)
  end

  return p
end

-- ===========================================================================
-- M.tryUnlock(state, role, reason) -> bool, string
--   reason：'lines:312,games:3' 形态的累计计数串（OR 语义，命中任一条件即解锁）
--   返回：是否本次新解锁 / 未解锁原因（'already'|'need:lines>=40'|'unknown-role'…）
-- ===========================================================================
M.tryUnlock = function(state, role, reason)
  if not isTable(state) then return false, 'bad-state' end
  if not knownRole(role) then return false, 'unknown-role' end

  if not isTable(state.unlocked) then state.unlocked = {} end
  if state.unlocked[role] == true then return false, 'already' end

  if role == 'nahida' then
    state.unlocked[role] = true
    return true, 'ok'
  end

  local req = M.NUM.UNLOCK[role]
  if not isTable(req) then return false, 'no-rule' end

  local counts = parseReason(reason)
  local hit, firstNeed = false, nil
  local order = M.NUM.UNLOCK_ORDER
  for i = 1, #order do
    local k = order[i]
    local need = req[k]
    if need ~= nil then
      if numOr(counts[k], 0) >= numOr(need, 0) then
        hit = true
        break
      end
      if not firstNeed then
        firstNeed = 'need:' .. k .. '>=' .. tostring(math.floor(numOr(need, 0)))
      end
    end
  end

  if not hit then return false, (firstNeed or 'need:unknown') end

  state.unlocked[role] = true
  local pmax = math.floor(numOr(state.partyMax, M.NUM.PARTY_MAX))
  if isTable(state.party) and #state.party < pmax then
    state.party[#state.party + 1] = role
  end
  if isTable(state.tier) then
    state.tier[role] = tierOf(role, isTable(state.lv) and state.lv[role])
  end
  return true, 'ok'
end

-- ===========================================================================
-- M.snapshot(state) -> table   HUD 只读快照
--   { active, lv, tier, cd, energy, partyMax, unlockedCount }（数值都是 active 角色的）
-- ===========================================================================
M.snapshot = function(state)
  local o = { active = nil, lv = 0, tier = 0, cd = 0, energy = 0, partyMax = 0, unlockedCount = 0 }
  if not isTable(state) then return o end

  o.partyMax = math.floor(numOr(state.partyMax, M.NUM.PARTY_MAX))

  if isTable(state.unlocked) then
    local n = 0
    for _, v in pairs(state.unlocked) do
      if v == true then n = n + 1 end
    end
    o.unlockedCount = n
  end

  local party = state.party
  if isTable(party) and #party > 0 then
    local ai = math.floor(numOr(state.active, 1))
    if ai < 1 or ai > #party then ai = 1 end
    local r = party[ai]
    if type(r) == 'string' then
      o.active = r
      o.lv     = math.floor(numOr(isTable(state.lv) and state.lv[r], 1))
      o.tier   = M.params(state, r).aiTier
      o.cd     = numOr(isTable(state.cd) and state.cd[r], 0)
      o.energy = numOr(isTable(state.energy) and state.energy[r], 0)
    end
  end
  return o
end

return M
