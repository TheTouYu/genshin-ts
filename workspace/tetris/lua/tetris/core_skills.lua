--[[==========================================================================
  tetris/core_skills.lua —— 角色技能「纯规则核心」（v6.1 重构 P1）
  ---------------------------------------------------------------------------
  为什么存在（docs/ARCH.md §0 机制 1）：技能规则现在长在 skills.lua 的 M.cast /
  M.onClear 里，跟数值表、文案表、日志锚、时序混在同一个 1472 行文件 ——
  「技能不触发 / 触发错 / 数值错」只能靠 387 秒一轮的模拟器 + 出图人眼去复现。
  本文件把那部分**机械判定**抽成纯函数：同一类 bug 在 tests-lua/ 里 30 毫秒出结果。

  硬边界（ARCH §1 三条硬规则；违反即违规）
    · 不 require 任何东西 —— 依赖注入：`M.new{ num = …, copy = …, roster = … }`
    · 不碰 game.* / ctl.* / root / 脚本全局（本文件里出现引擎调用 = 违规）
    · 不 print、不拼文案、不放日志字符串（文案真源 = copy.lua；
      日志锚模板 = core_skills_catalog.lua，因为「日志字面量是测试契约」，见 ARCH §8）
    · 唯一可变对象 = 调用方传进来的 state（普通表）；其余一律只读

  ---------------------------------------------------------------------------
  【对外契约】

    M.new(spec) -> core
      spec = { num = <数值表，必填>, copy = <copy.lua 表，可选>, roster = <角色表，可选> }

    —— 规则四动词（任务书 ①②③④）——
    core.charge(state, ev)           ① 事件结算：充能/计数/叠层/窗口，并按需产出效果
    core.canFire(state, role, ctx)   ② 门禁：ok, code, n, key（纯函数，零副作用）
    core.fire(state, gs)             ③ 施放：effects, res（写回 CD/能量/天赋计时）
                                       gs = gameState（role/mode/boardH/oppH/col/holdSec…）
    core.tick(state, dt) -> effects  ④ 冷却/能量/持续推进，并**直接返回**到期效果

    —— 只读派生（接线/角色页/HUD 只准读这里，别再各算一遍）——
    core.newState(opts) -> state     技能切片状态（形状见下）
    core.params(state, role) -> p    与 lv/node 相关的派生数值
    core.mult(state, role) -> number 下一消行倍率（与 charge 的 res.mult 同一函数）
    core.buffs(state, role) -> array 生效中的天赋计时（只有 id/left/val，文案去 catalog 取）
    core.stacks(state, role) -> int  刻晴四叠当前层数（0..4）
    core.activeRole(state)           台前角色名

  ---------------------------------------------------------------------------
  【ev（charge 的输入）—— kind 是唯一分派键】
    { kind = 'clear', role = <role|nil>, cleared = n,
      info = { level, combo, b2b, mode, duel } }
    { kind = 'lock',  role = <role|nil>,
      info = { moved, rotated, hard, cleared, dwell, mode } }
    role 缺省 = 台前角色（state.party[state.active]）。

  【res（charge 的返回值）】
    { role, mult, bonus, effects = {…}, notes = {…}, readings = {…} }
      mult     本次得分倍率。口径 = **事件前**的 core.mult(state, role)
               （旧实现里 onClear 与 nextMult 是两份手写实现，这里只剩一份）
      notes    布尔读数令牌，供接线拼日志（'domain=1' / 'seed=2' / 'chain=1' /
               'slash=1' / 'lotus=early' / 'field=1' / 'law=1' / 'stk=3' /
               'lure=1' / 'yuheng=1'），值里**不含**格式化数字
      readings 数值读数（mastery / dmg / crit / chain / gravity / charge / stacks）

  【effect（唯一定义处，kind 全集见 M.KIND）】
    { kind, id, role, target, rows, sec, col, tier, cells, lockSec, phase }
      id       天赋稳定 id（'nahida.seed' …），表现层按它查 catalog（label/fx/sfx/anchor）
      target   'self' = 施放者自己的盘；'opp' = 对手盘。
               **跨盘效果必须靠它定位**，不许依赖调用点的全局 g —— main.lua:6649
               的「冰莲串盘」（切人后甘雨冰莲清掉当前那块盘）就是这么来的。
      数值字段缺省 0（不留 nil：headless 断言不用判空，接线不用写 or 0）

  【state 形状（普通表；字段名与旧 skills.lua 一致，可与旧 state 直接互喂）】
    { roles = {…}, partyMax = n, party = {…}, active = n,
      unlocked[role] = bool, lv[role] = n, exp[role] = n,
      nodes[role] = { n1, n2, n3 }, cd[role] = 秒, energy[role] = 点, tier[role] = AI 档,
      tal[role] = { … } }   -- 天赋运行时（懒建 + 缺字段补默认，见 TAL_DEFAULT）

  ---------------------------------------------------------------------------
  【与旧 skills.lua 的关系（迁移期共存，不互 require）】
    · 旧 API 一个不删；本文件是**并行实现**，由 lead 逐处接线替换。
    · M.legacy(effect) 把新 effect 折回旧 {kind, n, col, role, id}，词表见 M.LEGACY_KIND
      与 M.LEGACY_CAST —— main 的 dispatchEffect / cast 分支可以先不吃改动就吃新结果。
    · 差分口径（tests-lua/core_skills_rules_test.lua 的「差分」组）：
      同一事件序列下 effects（映射后 kind/rows/col）+ mult + cd + energy 与旧实现逐项相等。
    · 唯一**故意不同**的两点（都在报告里点名）：
      ① tick 直接返回到期效果，不再需要 pending 队列 + 单独的 drain()；
      ② effect 自带 role/target，旧代码的 effect 没有盘归属。
========================================================================]]

local M = {}

M.VERSION = 'v6.1-core'

-- ===========================================================================
-- 词表（对外契约的一部分；改词 = 改契约，需同步 catalog 与接线）
-- ===========================================================================

-- effect.kind 全集：用「机制」命名，不用角色/技能风味命名（风味属于 catalog）
M.KIND = {
  clearTop    = 'clearTop',     -- 清自己盘顶 rows 行
  clearBottom = 'clearBottom',  -- 清自己盘底 rows 行
  clearColumn = 'clearColumn',  -- 清 col 列底部 rows 格
  addGarbage  = 'addGarbage',   -- 给对手推 rows 行（单人模式由接线降级为 clearBottom）
  freeze      = 'freeze',       -- 冻结 rows 行 sec 秒（期间自己盘不吃垃圾）
  takeOver    = 'takeOver',     -- AI 接管 sec 秒（tier = AI 档位）
  blink       = 'blink',        -- 当前列瞬落并锁定（col = 列；lockSec = 落底后禁横移）
  blinkBest   = 'blinkBest',    -- 瞬移到最空列再落底（col = 目标列）
  markBlink   = 'markBlink',    -- 瞬移到雷楔列引爆（col = 雷楔列；cells = 连斩格数）
}

-- 门禁 code（与旧 skills.cast 的 why 逐字相同，接线期可直接喂 copy.fail）
M.REASON = {
  ok         = 'ok',
  badState   = 'bad-state',
  unknownRole = 'unknown-role',
  locked     = 'locked',
  notInParty = 'not-in-party',
  cd         = 'cd',
  energy     = 'energy',
}

-- code -> 文案 key（copy.lua 侧的键名约定；文案本体不在本文件）
M.REASON_KEY = {
  ['bad-state']    = 'skill.reason.badState',
  ['unknown-role'] = 'skill.reason.unknownRole',
  ['locked']       = 'skill.reason.locked',
  ['not-in-party'] = 'skill.reason.notInParty',
  ['cd']           = 'skill.reason.cd',
  ['energy']       = 'skill.reason.energy',
  ['ok']           = 'skill.reason.ok',
}

-- dispatchEffect 词表：新 kind -> 旧 main.dispatchEffect 认的 kind
M.LEGACY_KIND = {
  clearTop    = 'clear-top',
  clearBottom = 'clear-bottom',
  addGarbage  = 'garbage-push',
  clearColumn = 'clear-col',
}

-- 施放效果：新 kind -> 旧 skills.cast 的 res.effect 字符串（main 的 7 个分支认识它）
M.LEGACY_CAST = {
  takeOver  = 'ai-takeover',
  blink     = 'blink',
  blinkBest = 'blink-best',
  freeze    = 'freeze',
  markBlink = 'mark-blink',
}

-- ===========================================================================
-- 内部工具（全部容错；永不抛错，除 M.new 的 spec 校验）
-- ===========================================================================
local function numOr(v, d)
  local n = tonumber(v)
  if n == nil then return d end
  if n ~= n then return d end             -- NaN
  return n
end

local function isTable(v)
  return type(v) == 'table'
end

local function clamp(v, lo, hi)
  v = numOr(v, 0)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end

local function member(list, v)
  if not isTable(list) then return false end
  for i = 1, #list do
    if list[i] == v then return true end
  end
  return false
end

-- effect 构造：字段恒定，缺省 0/''（见头注释「数值字段缺省 0」）
local function mkEff(t)
  return {
    kind    = t.kind,
    id      = t.id,
    role    = t.role,
    target  = t.target or 'self',
    rows    = numOr(t.rows, 0),
    sec     = numOr(t.sec, 0),
    col     = numOr(t.col, 0),
    tier    = numOr(t.tier, 0),
    cells   = numOr(t.cells, 0),
    lockSec = numOr(t.lockSec, 0),
    phase   = t.phase or '',
  }
end

-- 新 effect -> 旧 effect 表（main.lua dispatchEffect 与 cast 分支的输入形态）
M.legacy = function(e)
  if not isTable(e) then return nil end
  local kind = M.LEGACY_KIND[e.kind] or M.LEGACY_CAST[e.kind] or e.kind
  local n = numOr(e.rows, 0)
  if e.kind == M.KIND.markBlink then n = numOr(e.cells, 0) end
  return { kind = kind, n = n, col = numOr(e.col, 0), role = e.role, id = e.id,
           sec = numOr(e.sec, 0), target = e.target }
end

-- ===========================================================================
-- M.new(spec) -> core
-- ===========================================================================
M.new = function(spec)
  spec = spec or {}
  local NUM = spec.num
  if not isTable(NUM) then
    error('core_skills.new: spec.num 必填（数值表，例：skills.lua 的 M.NUM）', 2)
  end
  local ROLES = spec.roster
  if not isTable(ROLES) then ROLES = NUM.ROLES end
  if not isTable(ROLES) then ROLES = { 'nahida', 'keqing', 'ganyu', 'columbina' } end
  local SEED = numOr(NUM.RNG_SEED, 20261029)

  local C = { version = M.VERSION, num = NUM, roles = ROLES, kind = M.KIND, reason = M.REASON }

  -- -------------------------------------------------------------------------
  -- 天赋运行时状态（懒建 + 缺字段补默认 ⇒ v4 的老 state 也能直接喂进来）
  -- -------------------------------------------------------------------------
  local TAL_DEFAULT = {
    nahida    = { seedT = 0, seedCd = 0, seedHits = 0, lines = 0, domainT = 0 },
    keqing    = { markT = 0, markCol = 0, yhT = 0,
                  stkM = 0, stkR = 0, stkH = 0, stkC = 0 },
    ganyu     = { freezeT = 0, lotusT = 0, lotusArmed = false, critWin = 0, charge = 0 },
    columbina = { gravity = 0, lure = 0, lureT = 0, domainT = 0 },
  }

  local function talOf(state, role)
    if not isTable(state) then return nil end
    if type(role) ~= 'string' then return nil end
    if not isTable(state.tal) then state.tal = {} end
    local t = state.tal[role]
    if not isTable(t) then
      t = {}
      state.tal[role] = t
    end
    local d = TAL_DEFAULT[role]
    if isTable(d) then
      for k, v in pairs(d) do
        if t[k] == nil then t[k] = v end
      end
    end
    if t.rng == nil then t.rng = SEED end
    return t
  end

  -- 确定性随机：[0,1)。state.tal[role].rng 可直接写以固定序列（测试用）。
  local function roll(state, role)
    local t = talOf(state, role)
    if not t then return 0 end
    local x = numOr(t.rng, SEED)
    x = (x * 1103515245 + 12345) % 2147483648
    t.rng = x
    return x / 2147483648
  end

  local function knownRole(role)
    return type(role) == 'string' and isTable(NUM.CD) and NUM.CD[role] ~= nil
  end

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

  -- nodes 数组取第 i 项（1..3），缺省 0（只在只读路径上，不建表）
  local function nodeLv(state, role, i)
    if not isTable(state) or not isTable(state.nodes) then return 0 end
    local nd = state.nodes[role]
    if not isTable(nd) then return 0 end
    return numOr(nd[i], 0)
  end

  -- 3 级数组取档：level 1..3 -> list[1..3]（超界收敛）
  local function pick3(list, level)
    if not isTable(list) or #list == 0 then return 0 end
    local i = math.floor(numOr(level, 0))
    if i < 1 then i = 1 end
    if i > #list then i = #list end
    return numOr(list[i], 0)
  end

  -- lv -> AI 档位（表驱动；只有纳西妲有档位）
  local function tierOf(role, lv)
    if role ~= 'nahida' then return 0 end
    local t = isTable(NUM.NAHIDA) and NUM.NAHIDA.TIER_BY_LV or nil
    if not isTable(t) or #t == 0 then return 1 end
    local i = math.floor(numOr(lv, 1))
    if i < 1 then i = 1 end
    if i > #t then i = #t end
    return numOr(t[i], 0)
  end

  -- 对战类模式（只有这两类存在「对手盘」；coop 是队友盘，不算对手）
  local function isDuelMode(mode)
    return mode == 'pvp' or mode == 'ai-battle'
  end

  -- =========================================================================
  -- 派生量（params / charge / HUD 共用同一套公式；只有这一处）
  -- =========================================================================
  local function nahidaMastery(state, role)
    local N = NUM.NAHIDA or {}
    local t = talOf(state, role)
    local base = numOr(N.MASTERY_BASE, 0)
    if not t then return base end
    return base + numOr(N.MASTERY_PER_LINE, 0) * numOr(t.lines, 0)
  end

  -- 灭净三业：伤害增幅（0..cap）与追加触发概率（0..cap）
  local function nahidaPower(state, role)
    local N = NUM.NAHIDA or {}
    local base = numOr(N.MASTERY_BASE, 0)
    local over = math.max(0, nahidaMastery(state, role) - base)
    return clamp(over * numOr(N.DMG_PER_POINT, 0), 0, numOr(N.DMG_CAP, 0)),
           clamp(over * numOr(N.CRIT_PER_POINT, 0), 0, numOr(N.CRIT_CAP, 0))
  end

  -- 灭净三业一次触发清/推几行（base + floor(增幅 / step)）
  local function nahidaChainRows(state, role)
    local N = NUM.NAHIDA or {}
    local step = numOr(N.DMG_STEP, 0)
    if step <= 0 then return numOr(N.CHAIN_BASE, 1) end
    local dmg = nahidaPower(state, role)
    return numOr(N.CHAIN_BASE, 1) + math.floor(dmg / step + 1e-9)
  end

  -- 净善摄受明论：本次接管加时（秒）
  local function nahidaAbsorb(state, role)
    local N = NUM.NAHIDA or {}
    local m = nahidaMastery(state, role)
    return clamp(m * numOr(N.ABSORB_RATIO, 0) * numOr(N.ABSORB_SEC_PER_POINT, 0),
      0, numOr(N.ABSORB_CAP, 0))
  end

  -- 刻晴命座 6 四叠当前层数（0..4）
  local function keqingStacks(state, role)
    local t = talOf(state, role)
    if not t then return 0 end
    local n = 0
    if numOr(t.stkM, 0) > 0 then n = n + 1 end
    if numOr(t.stkR, 0) > 0 then n = n + 1 end
    if numOr(t.stkH, 0) > 0 then n = n + 1 end
    if numOr(t.stkC, 0) > 0 then n = n + 1 end
    return n
  end

  -- 甘雨：当前重力间隔倍率（天地交泰：冻结期间 ×1.20）
  local function ganyuGravityMult(state, role)
    local t = talOf(state, role)
    local N = NUM.GANYU or {}
    if t and numOr(t.freezeT, 0) > 0 then return numOr(N.FIELD_GRAVITY, 1) end
    return 1
  end

  -- 主动技能能量成本（少女单人分支不耗能：只吃 CD，否则没对手时按钮长期不可用）
  local function costOf(state, role, mode)
    local cost = numOr(isTable(NUM.COST) and NUM.COST[role], 0)
    if role == 'columbina' and not isDuelMode(mode) then
      cost = numOr(isTable(NUM.COLUMBINA) and NUM.COLUMBINA.SOLO_COST, 0)
    end
    return math.max(0, cost)
  end

  -- =========================================================================
  -- C.newState(opts) -> state（形状与旧 skills.newState 完全一致）
  -- =========================================================================
  C.newState = function(opts)
    if not isTable(opts) then opts = {} end
    local roles = isTable(opts.roles) and opts.roles or ROLES
    local partyMax = math.floor(numOr(opts.partyMax, numOr(NUM.PARTY_MAX, 2)))
    if partyMax < 0 then partyMax = 0 end
    local startRoles = isTable(opts.startRoles) and opts.startRoles or NUM.START_ROLES
    if not isTable(startRoles) then startRoles = {} end

    local s = {
      party = {}, active = 0, energy = {}, cd = {}, lv = {}, exp = {},
      unlocked = {}, nodes = {}, tier = {},
      roles = {}, partyMax = partyMax, tal = {},
    }
    for i = 1, #roles do
      local r = roles[i]
      if type(r) == 'string' and r ~= '' and s.lv[r] == nil then
        s.roles[#s.roles + 1] = r
        s.energy[r], s.cd[r], s.lv[r], s.exp[r] = 0, 0, 1, 0
        s.unlocked[r] = false
        s.nodes[r] = { 1, 0, 0 }
        s.tier[r] = tierOf(r, 1)
        talOf(s, r)
      end
    end
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

  -- =========================================================================
  -- C.params(state, role) -> p   派生数值（旧 M.params 的键全部保留）
  --   既有 6 键：aiTier / aiDur / freezeRows / freezeSec / holdCutMs / clearRows
  --   v6 键：gravityMult / chainRows / seedGap / domainScore / gravity / gravityMax /
  --          lure / lureBonus / lureLeft / charge / chargeMax / absorbSec /
  --          lotusLeft / freezeLeft / markLeft / markCol / yhLeft / seedLeft / domainLeft
  -- =========================================================================
  C.params = function(state, role)
    local p = { aiTier = 0, aiDur = 0, freezeRows = 0, freezeSec = 0, holdCutMs = 0, clearRows = 0,
                gravityMult = 1, chainRows = 0, seedGap = 0, domainScore = 0,
                gravity = 0, gravityMax = 0, lure = 0, lureBonus = 0, lureLeft = 0,
                charge = 0, chargeMax = 0, absorbSec = 0,
                lotusLeft = 0, freezeLeft = 0, markLeft = 0, markCol = 0, yhLeft = 0,
                seedLeft = 0, domainLeft = 0 }
    if not isTable(state) or type(role) ~= 'string' then return p end

    local lv = math.floor(numOr(isTable(state.lv) and state.lv[role], 1))
    if lv < 1 then lv = 1 end
    local g = lv - 1
    local meta = isTable(NUM.META) and NUM.META or {}
    local N, t = nil, talOf(state, role)

    if role == 'nahida' then
      N = NUM.NAHIDA or {}
      p.aiTier = tierOf(role, lv)
      p.aiDur = pick3(N.TAKE_DUR, nodeLv(state, role, 1))
                + numOr(meta.AI_DUR_PER_LV, 0) * g
      p.clearRows = numOr(N.KARMA_ROWS, 1)
      p.chainRows = nahidaChainRows(state, role)
      p.domainScore = numOr(N.DOMAIN_SCORE, 0)
      p.absorbSec = nahidaAbsorb(state, role)
      if t then
        p.seedLeft = numOr(t.seedT, 0)
        p.domainLeft = numOr(t.domainT, 0)
        p.seedGap = (numOr(t.domainT, 0) > 0) and numOr(N.TRIGGER_GAP_DOMAIN, 0)
                   or numOr(N.TRIGGER_GAP, 0)
      end

    elseif role == 'keqing' then
      N = NUM.KEQING or {}
      p.aiTier = 0
      p.clearRows = numOr(N.SLASH_ROWS, 1)
      if t then
        p.markLeft = numOr(t.markT, 0)
        p.markCol = numOr(t.markCol, 0)
        p.yhLeft = numOr(t.yhT, 0)
      end

    elseif role == 'ganyu' then
      N = NUM.GANYU or {}
      p.freezeRows = pick3(N.FREEZE_ROWS, nodeLv(state, role, 2))
      p.freezeSec = numOr(N.FREEZE_SEC, 0) + numOr(meta.FREEZE_SEC_PER_LV, 0) * g
      p.clearRows = numOr(N.LOTUS_ROWS, 0)
      p.gravityMult = ganyuGravityMult(state, role)
      p.chargeMax = numOr(N.CHARGE_MAX, 0)
      if t then
        p.charge = numOr(t.charge, 0)
        p.lotusLeft = numOr(t.lotusT, 0)
        p.freezeLeft = numOr(t.freezeT, 0)
      end

    elseif role == 'columbina' then
      N = NUM.COLUMBINA or {}
      p.holdCutMs = pick3(N.LD_CUT, nodeLv(state, role, 1)) * 1000
                    + numOr(meta.HOLD_CUT_PER_LV, 0) * g
      p.clearRows = numOr(N.CLEAR_ROWS, 1)
      p.gravityMax = numOr(N.GRAVITY_MAX, 0)
      p.lureBonus = numOr(N.LURE_BONUS, 0)
      if t then
        p.gravity = numOr(t.gravity, 0)
        p.lure = numOr(t.lure, 0)
        p.lureLeft = numOr(t.lureT, 0)
        p.domainLeft = numOr(t.domainT, 0)
      end
    end
    return p
  end

  -- =========================================================================
  -- C.mult(state, role)   下一消行倍率（加成**相加**：1 + Σ；与 charge 同一函数）
  -- =========================================================================
  C.mult = function(state, role)
    local t = isTable(state) and talOf(state, role) or nil
    if not t then return 1 end
    local N = {}
    local m = 0
    if role == 'nahida' then
      N = NUM.NAHIDA or {}
      if numOr(t.domainT, 0) > 0 then m = m + numOr(N.DOMAIN_SCORE, 0) end
    elseif role == 'keqing' then
      N = NUM.KEQING or {}
      if numOr(t.yhT, 0) > 0 then m = m + numOr(N.YH_SCORE, 0) end
      m = m + numOr(N.STK_VAL, 0) * keqingStacks(state, role)
    elseif role == 'ganyu' then
      N = NUM.GANYU or {}
      if numOr(t.critWin, 0) > 0 then m = m + numOr(N.FOCUS_BONUS, 0) end
    elseif role == 'columbina' then
      N = NUM.COLUMBINA or {}
      m = m + numOr(N.LURE_BONUS, 0) * numOr(t.lure, 0)
    end
    return 1 + m
  end

  C.stacks = function(state, role)
    return keqingStacks(state, role)
  end

  C.activeRole = function(state)
    return activeRole(state)
  end

  -- =========================================================================
  -- C.buffs(state, role) -> array   生效中的天赋（id/left/val，不含文案）
  -- =========================================================================
  C.buffs = function(state, role)
    local out = {}
    local t = isTable(state) and talOf(state, role) or nil
    if not t then return out end
    local function add(id, left, val)
      out[#out + 1] = { id = id, left = numOr(left, 0), val = numOr(val, 0) }
    end
    if role == 'nahida' then
      if numOr(t.seedT, 0) > 0 then add('nahida.seed', t.seedT) end
      if numOr(t.domainT, 0) > 0 then add('nahida.domain', t.domainT) end
    elseif role == 'keqing' then
      if numOr(t.markT, 0) > 0 then add('keqing.mark', t.markT, t.markCol) end
      if numOr(t.yhT, 0) > 0 then add('keqing.yuheng', t.yhT) end
      local st = keqingStacks(state, role)
      if st > 0 then add('keqing.stacks', 0, st) end
    elseif role == 'ganyu' then
      if numOr(t.freezeT, 0) > 0 then add('ganyu.field', t.freezeT) end
      if numOr(t.lotusT, 0) > 0 then add('ganyu.lotus', t.lotusT) end
      if numOr(t.critWin, 0) > 0 then add('ganyu.focus', t.critWin) end
      if numOr(t.charge, 0) > 0 then add('ganyu.charge', 0, t.charge) end
    elseif role == 'columbina' then
      if numOr(t.domainT, 0) > 0 then add('columbina.domain', t.domainT) end
      if numOr(t.lure, 0) > 0 then add('columbina.lure', t.lureT, t.lure) end
    end
    return out
  end

  -- =========================================================================
  -- ① C.charge(state, ev) -> res   事件结算（旧 M.onClear / M.onLock）
  --   只改 state 里的事件相关字段；得分倍率按**事件前**口径返回（见头注释）。
  -- =========================================================================
  C.charge = function(state, ev)
    local res = { role = nil, mult = 1, bonus = 0,
                  effects = {}, notes = {}, readings = {} }
    if not isTable(state) or not isTable(ev) then return res end

    local role = ev.role
    if type(role) ~= 'string' then role = activeRole(state) end
    res.role = role
    if not knownRole(role) then return res end
    local t = talOf(state, role)
    if not t then return res end

    local function note(s) res.notes[#res.notes + 1] = s end
    local function push(e) res.effects[#res.effects + 1] = e end

    if ev.kind == 'clear' then
      local cleared = math.max(0, math.floor(numOr(ev.cleared, 0)))
      local info = isTable(ev.info) and ev.info or {}
      local mode = type(info.mode) == 'string' and info.mode or 'casual'
      local duel = (info.duel == true) or isDuelMode(mode)
      res.mult = C.mult(state, role)      -- 事件前口径：与 HUD 读数同一函数

      if role == 'nahida' then
        local N = NUM.NAHIDA or {}
        -- 慧明缘觉智论：本局累计消行 = 精通代理（base 起算，每行 +per_line）
        t.lines = numOr(t.lines, 0) + cleared
        local chain = nahidaChainRows(state, role)
        local dmg, crit = nahidaPower(state, role)
        if numOr(t.domainT, 0) > 0 then note('domain=1') end
        -- 蕴种印：持续期内、触发间隔到 ⇒ 灭净三业
        if cleared > 0 and numOr(t.seedT, 0) > 0 and numOr(t.seedCd, 0) <= 0 then
          local gap = (numOr(t.domainT, 0) > 0) and numOr(N.TRIGGER_GAP_DOMAIN, 0)
                      or numOr(N.TRIGGER_GAP, 0)
          t.seedCd = gap
          t.seedHits = numOr(t.seedHits, 0) + 1
          local times = 1
          -- 暴击率侧：精通超出部分每点 +crit_per_point%（上限）⇒ 追加一次的概率
          if crit > 0 and roll(state, role) < crit then times = 2 end
          for _ = 1, times do
            push(mkEff {
              kind = duel and M.KIND.addGarbage or M.KIND.clearBottom,
              id = 'nahida.seed', role = role,
              target = duel and 'opp' or 'self', rows = chain,
              phase = duel and 'push' or 'clear',
            })
          end
          note('seed=' .. tostring(times))
          note('chain=' .. tostring(chain))
        end
        note('mastery=' .. tostring(nahidaMastery(state, role)))
        res.readings.mastery = nahidaMastery(state, role)
        res.readings.dmg = dmg
        res.readings.crit = crit

      elseif role == 'keqing' then
        local N = NUM.KEQING or {}
        if numOr(t.yhT, 0) > 0 then note('yuheng=1') end
        local st = keqingStacks(state, role)
        if st > 0 then note('stk=' .. tostring(st)) end
        res.readings.stacks = st
        if cleared > 0 then t.stkC = numOr(N.STK_DUR, 0) end   -- 消行也是四类操作之一
        -- 雷楔存续期间消行 ⇒ 雷暴连斩（清雷楔列底部 cells 格），雷楔被消耗
        if cleared > 0 and numOr(t.markT, 0) > 0 then
          local col = numOr(t.markCol, 0)
          push(mkEff {
            kind = M.KIND.clearColumn, id = 'keqing.mark', role = role, target = 'self',
            rows = numOr(N.SLASH_CELLS, 0), col = col, phase = 'slash',
          })
          t.markT, t.markCol = 0, 0
          note('slash=1')
        end

      elseif role == 'ganyu' then
        local N = NUM.GANYU or {}
        if numOr(t.critWin, 0) > 0 then note('focus=1') end
        if cleared > 0 then t.critWin = numOr(N.FOCUS_WINDOW, 0) end  -- 本次消行重新开窗
        -- 冰莲：冻结期消行 = 被提前打掉 ⇒ 提前绽放（行数少于自然绽放）
        if cleared > 0 and t.lotusArmed then
          t.lotusArmed, t.lotusT = false, 0
          push(mkEff {
            kind = M.KIND.clearTop, id = 'ganyu.lotus', role = role, target = 'self',
            rows = numOr(N.LOTUS_BROKEN_ROWS, 0), phase = 'early',
          })
          note('lotus=early')
        end
        if numOr(t.freezeT, 0) > 0 then note('field=1') end

      elseif role == 'columbina' then
        local N = NUM.COLUMBINA or {}
        local lure = numOr(t.lure, 0)
        if lure > 0 then note('lure=' .. tostring(lure)) end
        if cleared > 0 then
          -- 引力值：每行 +per_line（领域内 ×domain_gain），上限 gravity_max
          local gain = cleared * numOr(N.GRAVITY_PER_LINE, 0)
          if numOr(t.domainT, 0) > 0 then gain = gain * numOr(N.DOMAIN_GAIN, 1) end
          t.gravity = math.min(numOr(N.GRAVITY_MAX, 0), numOr(t.gravity, 0) + gain)
          res.readings.gravity = t.gravity
          -- 新月自己的法则：领域内消行有 chance 概率额外推 1 行
          if numOr(t.domainT, 0) > 0 and roll(state, role) < numOr(N.LAW_CHANCE, 0) then
            push(mkEff {
              kind = M.KIND.addGarbage, id = 'columbina.law', role = role, target = 'opp',
              rows = 1, phase = 'law',
            })
            note('law=1')
          end
        end
      end
      return res
    end

    if ev.kind == 'lock' then
      local info = isTable(ev.info) and ev.info or {}
      if role == 'keqing' then
        local N = NUM.KEQING or {}
        local dur = numOr(N.STK_DUR, 0)
        if info.moved == true then t.stkM = dur; note('move') end
        if info.rotated == true then t.stkR = dur; note('rot') end
        if info.hard == true then t.stkH = dur; note('hard') end
        if numOr(info.cleared, 0) > 0 then t.stkC = dur; note('clear') end
        res.readings.stacks = keqingStacks(state, role)
      elseif role == 'ganyu' then
        local N = NUM.GANYU or {}
        -- 霜华矢二段蓄力：慢锁（未硬降、本块停留 ≥charge_window）记 1 段，封顶
        if info.hard ~= true and numOr(info.dwell, 0) >= numOr(N.CHARGE_WINDOW, 0) then
          local before = numOr(t.charge, 0)
          t.charge = math.min(numOr(N.CHARGE_MAX, 0), before + 1)
          if t.charge ~= before then note('charge=' .. tostring(t.charge)) end
        end
        res.readings.charge = numOr(t.charge, 0)
      end
      res.mult = C.mult(state, role)      -- 事件后口径（旧 onLock 的 res.mult 也是事后算）
      return res
    end

    return res
  end

  -- =========================================================================
  -- ② C.canFire(state, role, ctx) -> ok, code, n, key
  --   门禁顺序与旧 cast 一致：bad-state → unknown-role → locked → not-in-party
  --   → 雷楔二段（免费，跳 CD/能量）→ cd → energy
  --   n = 剩多少（CD 秒 / 能量缺口）；key = copy 侧文案键（M.REASON_KEY）
  -- =========================================================================
  C.canFire = function(state, role, ctx)
    local function no(code, n)
      return false, code, numOr(n, 0), M.REASON_KEY[code]
    end
    if not isTable(state) then return no('bad-state', 0) end
    if not knownRole(role) then return no('unknown-role', 0) end
    if isTable(state.unlocked) and state.unlocked[role] ~= true then return no('locked', 0) end
    if not member(state.party, role) then return no('not-in-party', 0) end

    -- 雷楔二段：雷楔存续期内再按 = 免费的第二段施放（CD 仍按投出时起算）
    local t = talOf(state, role)
    if role == 'keqing' and t and numOr(t.markT, 0) > 0 then
      return true, 'ok', 0, M.REASON_KEY.ok
    end

    local cdv = numOr(isTable(state.cd) and state.cd[role], 0)
    if cdv > 0 then return no('cd', cdv) end

    local mode = isTable(ctx) and type(ctx.mode) == 'string' and ctx.mode or 'casual'
    local cost = costOf(state, role, mode)
    local en = numOr(isTable(state.energy) and state.energy[role], 0)
    if cost > 0 and en < cost then return no('energy', cost - en) end

    return true, 'ok', 0, M.REASON_KEY.ok
  end

  -- =========================================================================
  -- ③ C.fire(state, gs) -> effects, res   主动施放
  --   gs = { role, mode, boardH, oppH, col, holdSec, keyHold, longestEmptyCol }
  --   res  = { ok, code, key, n, role, effect(旧字符串), cd, tier, takeDur,
  --            talents = {id…}, buffs = {id/left/val…} }
  -- =========================================================================
  C.fire = function(state, gs)
    local effects = {}
    local res = { ok = false, code = 'bad-state', key = M.REASON_KEY['bad-state'], n = 0,
                  role = nil, effect = 'none', cd = 0, tier = 0, takeDur = 0,
                  talents = {}, buffs = {} }
    if not isTable(state) then return effects, res end
    if not isTable(gs) then gs = {} end

    local role = gs.role
    if type(role) ~= 'string' then role = activeRole(state) end
    res.role = role
    if not knownRole(role) then
      res.code, res.key = 'unknown-role', M.REASON_KEY['unknown-role']
      return effects, res
    end
    local ok, code, n = C.canFire(state, role, gs)
    if not ok then
      res.code, res.n, res.key = code, n, M.REASON_KEY[code]
      return effects, res
    end

    local t = talOf(state, role)
    local mode = type(gs.mode) == 'string' and gs.mode or 'casual'
    local boardH = numOr(gs.boardH, 0)
    local oppH = numOr(gs.oppH, 0)
    local col = numOr(gs.col, 0)
    local holdSec = numOr(gs.keyHold, numOr(gs.holdSec, 0))
    local p = C.params(state, role)
    local lv = isTable(state.lv) and state.lv[role]
    local useCd = numOr(isTable(NUM.CD) and NUM.CD[role], 0)
    local amount = 0

    local function eff(kind, e)
      local one = mkEff(e)
      one.kind = kind
      effects[#effects + 1] = one
      return one
    end

    -- ---- 刻晴：雷楔二段（免费引爆，不写 CD/能量）----
    if role == 'keqing' and t and numOr(t.markT, 0) > 0 then
      local markCol = numOr(t.markCol, 0)
      local cells = numOr((NUM.KEQING or {}).SLASH_CELLS, 0)
      t.markT, t.markCol = 0, 0
      eff(M.KIND.markBlink, { id = 'keqing.mark', role = role, target = 'self',
                              col = markCol, cells = cells })
      res.ok, res.code, res.key = true, 'ok', M.REASON_KEY.ok
      res.effect = M.LEGACY_CAST.markBlink
      res.n = cells
      res.tier = tierOf(role, lv)
      res.talents = { 'keqing.mark' }
      res.buffs = { { id = 'keqing.mark', left = 0, val = markCol } }
      return effects, res
    end

    if role == 'nahida' then
      local N = NUM.NAHIDA or {}
      local takeDur = p.aiDur + nahidaAbsorb(state, role)
      amount = p.aiTier
      useCd = numOr((NUM.CD or {}).nahida, 0)
      -- 蕴种印 + 摩耶之殿 + 净善摄受明论 同时就位（官方：E 上印、Q 展开领域）
      t.seedT = numOr(N.SEED_DUR, 0)
      t.domainT = numOr(N.DOMAIN_DUR, 0)
      eff(M.KIND.takeOver, { id = 'nahida.active', role = role, target = 'self',
                             sec = takeDur, tier = p.aiTier })
      res.takeDur = takeDur
      res.talents = { 'nahida.seed', 'nahida.domain', 'nahida.absorb' }
      res.buffs = {
        { id = 'nahida.seed', left = t.seedT, val = nahidaChainRows(state, role) },
        { id = 'nahida.domain', left = t.domainT, val = numOr(N.DOMAIN_SCORE, 0) },
        { id = 'nahida.absorb', left = 0, val = nahidaAbsorb(state, role) },
      }

    elseif role == 'keqing' then
      local N = NUM.KEQING or {}
      local n3 = nodeLv(state, role, 3)
      local n2 = nodeLv(state, role, 2)
      local longPress = holdSec >= numOr(N.LONG_PRESS, 0)
      local lockSec = pick3(N.LOCK, n3)
      useCd = pick3(N.BLINK_CD, n2) / (1 + numOr(N.YH_RECHARGE, 0))   -- 玉衡：充能 +15% ⇒ CD ÷1.15
      t.markT = numOr(N.MARK_LIFE, 0)
      t.markCol = col
      t.yhT = numOr(N.YH_DUR, 0)
      if longPress then
        local best = numOr(gs.longestEmptyCol, col)
        eff(M.KIND.blinkBest, { id = 'keqing.longpress', role = role, target = 'self',
                                col = best, lockSec = lockSec })
        res.talents = { 'keqing.mark', 'keqing.yuheng', 'keqing.longpress' }
      else
        eff(M.KIND.blink, { id = 'keqing.active', role = role, target = 'self',
                            col = col, lockSec = lockSec })
        res.talents = { 'keqing.mark', 'keqing.yuheng' }
      end
      amount = lockSec
      res.buffs = {
        { id = 'keqing.mark', left = t.markT, val = t.markCol },
        { id = 'keqing.yuheng', left = t.yhT, val = numOr(N.YH_SCORE, 0) },
      }

    elseif role == 'ganyu' then
      local N = NUM.GANYU or {}
      local charge = numOr(t.charge, 0)
      local rows = p.freezeRows + charge * numOr(N.CHARGE_ROWS, 0)
      if boardH >= numOr(N.CLUTCH_H, math.huge) then rows = rows + 1 end   -- 背水一战
      useCd = numOr((NUM.CD or {}).ganyu, 0)
      t.freezeT = p.freezeSec
      t.lotusT = numOr(N.LOTUS_LIFE, 0)
      t.lotusArmed = true
      t.charge = 0
      eff(M.KIND.freeze, { id = 'ganyu.active', role = role, target = 'self',
                           rows = rows, sec = p.freezeSec })
      amount = rows
      res.talents = { 'ganyu.lotus', 'ganyu.field' }
      if charge > 0 then res.talents[#res.talents + 1] = 'ganyu.charge' end
      res.buffs = {
        { id = 'ganyu.lotus', left = t.lotusT, val = charge },
        { id = 'ganyu.field', left = t.freezeT, val = numOr(N.FIELD_GRAVITY, 1) },
      }

    elseif role == 'columbina' then
      local N = NUM.COLUMBINA or {}
      local duel = isDuelMode(mode)
      useCd = numOr((NUM.CD or {}).columbina, 0)
      t.domainT = numOr(N.DOMAIN_LIFE, 0)
      local full = numOr(t.gravity, 0) >= numOr(N.GRAVITY_MAX, 0)
      if duel then
        local layers = pick3(N.LAYERS, nodeLv(state, role, 1))
        if oppH >= numOr(N.PRESSURE_H, math.huge) then
          layers = layers + numOr(N.PRESSURE_ADD, 0)      -- 打最弱者：对手板高 ⇒ 多压一层
        end
        if full then
          layers = math.ceil(layers * numOr(N.FULL_MULT, 1))
          t.gravity = 0
        end
        layers = math.min(numOr(N.LAYER_CAP, layers), layers)
        amount = layers
        eff(M.KIND.addGarbage, { id = 'columbina.active', role = role, target = 'opp',
                                 rows = layers, phase = full and 'full' or 'normal' })
      else
        local rows = numOr(N.CLEAR_ROWS, 1)
        if full then
          rows = rows + numOr(N.FULL_SOLO_ADD, 0)          -- 单人降级：满辉多清 1 行
          t.gravity = 0
        end
        amount = rows
        eff(M.KIND.clearBottom, { id = 'columbina.active', role = role, target = 'self',
                                  rows = rows, phase = full and 'full' or 'normal' })
      end
      if full then
        t.lure = math.min(numOr(N.LURE_MAX, 0), numOr(t.lure, 0) + 1)
        t.lureT = numOr(N.LURE_DUR, 0)
        res.talents = { 'columbina.gravity', 'columbina.lure', 'columbina.domain' }
      else
        res.talents = { 'columbina.domain' }
      end
      res.buffs = {
        { id = 'columbina.domain', left = t.domainT, val = numOr(N.DOMAIN_GAIN, 0) },
        { id = 'columbina.gravity', left = 0, val = numOr(t.gravity, 0) },
        { id = 'columbina.lure', left = numOr(t.lureT, 0), val = numOr(t.lure, 0) },
      }
    end

    -- 落状态：CD 起算 + 扣能量（门禁已在 canFire 里过，这里只扣得起的量）
    if isTable(state.cd) then state.cd[role] = useCd end
    local cost = costOf(state, role, mode)
    if cost > 0 and isTable(state.energy) then
      local e = numOr(state.energy[role], 0) - cost
      if e < 0 then e = 0 end
      state.energy[role] = e
    end

    -- 旧 cast 的 effect 字符串（迁移期 main 的 7 个分支照旧认它）
    local castName = 'none'
    if effects[1] then
      castName = M.LEGACY_CAST[effects[1].kind]
      if not castName and effects[1].kind == M.KIND.addGarbage then castName = 'ripple' end
      if not castName and effects[1].kind == M.KIND.clearBottom then castName = 'gravity-clear' end
      if not castName then castName = 'none' end
    end

    res.ok, res.code, res.key = true, 'ok', M.REASON_KEY.ok
    res.n = numOr(amount, 0)
    res.cd = useCd
    res.tier = tierOf(role, lv)
    res.effect = castName
    return effects, res
  end

  -- =========================================================================
  -- ④ C.tick(state, dt) -> effects   冷却/能量/持续计时 + 到期效果（不再需要 drain）
  -- =========================================================================
  C.tick = function(state, dt)
    local out = {}
    if not isTable(state) then return out end
    dt = numOr(dt, 0)
    if dt <= 0 then return out end

    local list = rolesList(state)
    local regen = numOr(NUM.ENERGY_REGEN, 0) * dt
    local eCap = numOr(NUM.ENERGY_MAX, math.huge)

    for i = 1, #list do
      local r = list[i]
      if type(r) == 'string' then
        if isTable(state.cd) then
          local c = numOr(state.cd[r], 0) - dt
          state.cd[r] = (c > 0) and c or 0
        end
        if isTable(state.energy) then
          local e = numOr(state.energy[r], 0) + regen
          if e > eCap then e = eCap end
          state.energy[r] = e
        end

        local t = talOf(state, r)
        if t then
          if r == 'nahida' then
            if numOr(t.seedT, 0) > 0 then t.seedT = math.max(0, t.seedT - dt) end
            if numOr(t.seedCd, 0) > 0 then t.seedCd = math.max(0, t.seedCd - dt) end
            if numOr(t.domainT, 0) > 0 then t.domainT = math.max(0, t.domainT - dt) end

          elseif r == 'keqing' then
            if numOr(t.markT, 0) > 0 then t.markT = math.max(0, t.markT - dt) end
            if numOr(t.yhT, 0) > 0 then t.yhT = math.max(0, t.yhT - dt) end
            t.stkM = math.max(0, numOr(t.stkM, 0) - dt)
            t.stkR = math.max(0, numOr(t.stkR, 0) - dt)
            t.stkH = math.max(0, numOr(t.stkH, 0) - dt)
            t.stkC = math.max(0, numOr(t.stkC, 0) - dt)

          elseif r == 'ganyu' then
            local N = NUM.GANYU or {}
            if numOr(t.freezeT, 0) > 0 then t.freezeT = math.max(0, t.freezeT - dt) end
            if numOr(t.critWin, 0) > 0 then t.critWin = math.max(0, t.critWin - dt) end
            if numOr(t.lotusT, 0) > 0 then
              t.lotusT = math.max(0, t.lotusT - dt)
              -- 冰莲到点自然绽放：清顶（行数多于「被提前打掉」的那档）
              if t.lotusT <= 0 and t.lotusArmed then
                t.lotusArmed = false
                out[#out + 1] = mkEff {
                  kind = M.KIND.clearTop, id = 'ganyu.lotus', role = r, target = 'self',
                  rows = numOr(N.LOTUS_ROWS, 0), phase = 'bloom',
                }
              end
            end

          elseif r == 'columbina' then
            if numOr(t.domainT, 0) > 0 then t.domainT = math.max(0, t.domainT - dt) end
            if numOr(t.lureT, 0) > 0 then
              t.lureT = math.max(0, t.lureT - dt)
              if t.lureT <= 0 then t.lure = 0 end     -- 月诱整组共用一个计时，到期全清
            end
          end
        end
      end
    end
    return out
  end

  return C
end

-- 未注入数值表时也能被 require（真机上 loadModule 会立刻调用 M.new，这里不建默认实例：
-- 数值表唯一来源是调用方注入的那张，本模块不内置任何数字）

return M
