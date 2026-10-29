--[[==========================================================================
  tetris/skills.lua —— 四角色天赋树「纯逻辑层」（v6.0）
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

  v6.0（2026-10-29）——「天赋树」重做。
  v4.0 的问题是**每角色只有 1 主动 + 2 条被动，其中一条还是通用的"用得多就升级"**，
  角色页因此无话可写。v6 给每个角色 1 主动 + 4 条机制各异的被动/机制，全部来自官方
  天赋文本（docs/wiki/raw/*.wikitext），每条都有独立状态与可验证读数。设计书：
  docs/v6-talent-design.md（官方原型 → 方块映射 → 玩家感知 → 数值表 → 验收锚）。

  ---------------------------------------------------------------------------
  【对外契约（向后兼容，v4 的调用方无需改动）】
    M.VERSION            版本串
    M.NUM                唯一数值来源（v4 字段全部保留）
    M.newState(opts)     -> state
    M.tick(state, dt)    -> nil           冷却/能量/全部天赋计时器推进
    M.addExp(state, role, amount) -> { leveled, node, lv }
    M.cast(state, role, ctx)      -> { ok, why, effect, n, tier, ...新增字段 }
    M.params(state, role)         -> 既有 6 键 + v6 天赋键
    M.tryUnlock(state, role, reason) -> bool, string
    M.snapshot(state)             -> HUD 快照（既有字段 + v6 新增字段）

  【v6 新增事件钩子（main 侧每处 1 行接线，见 docs/v6-talent-design.md §6）】
    M.onClear(state, role, cleared, info) -> res   消行事件（info 见下）
    M.onLock(state, role, info)          -> res   锁定事件
    M.drain(state)                       -> effects  把 tick 里到期的持续效果吐给 main
    M.talents(state, role)               -> 天赋清单（角色页渲染用：名字/官方原型/说明/当前值）
    M.talentState(state, role)           -> 天赋实时读数表（HUD/角色页"数值"页用）

  【res 协议】res = { role, mult, bonus, effects, log }
    mult      本次得分倍率（1.0 = 无加成；多个同轴加成**相加**后 +1，见设计书 §5.3）
    bonus     额外固定分（加法）
    effects   要 main 执行的效果数组，元素 = { kind, n, col, role, id, label, fx, sfx, anchor }
    log       一行可直接 print 的日志（含全部关键读数）

  【effects.kind 全集（main 只需 5 个分支）】
    'clear-top'     清自己盘顶 n 行
    'clear-bottom'  清自己盘底 n 行
    'garbage-push'  给对手推 n 行（单人模式 main 自行降级为 clear-bottom）
    'clear-col'     清 col 列底部 n 格（雷暴连斩；col 由 effect.col 给）
  其余（label/fx/sfx/anchor）只作表现提示，main 可忽略。

  【info 字段（main 有什么给什么，缺字段按默认值走）】
    onClear: { level, combo, b2b, boardH, mode, duel }
    onLock : { piece, hard=bool, rotated=bool, moved=bool, tspin=bool,
               cleared=n, dwell=秒(本块从出生到锁定的时间), boardH, mode }
=========================================================================]]

local M = {}

M.VERSION = 'v6.0'

-- ===========================================================================
-- M.NUM —— 唯一数值来源
--   标注约定：`[官]` = 官方 wiki 原值（docs/wiki/raw/*.wikitext）；
--             `[官→换]` = 官方值经换算（换算理由逐条写在设计书 §4 数值表）；
--             `[设计]` = 本作新增的设计值（含理由）
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
  CD2  = { nahida = 30, keqing = 5,    ganyu = 20, columbina = 15 },  -- 第二技能（v4 遗留：未接线，保留字段）
  COST = { nahida = 0,  keqing = 0,    ganyu = 0,  columbina = 60 },

  -- ---- 纳西妲：蕴种印 / 灭净三业 / 慧明缘觉智论 / 摩耶之殿 / 净善摄受明论 ----
  NAHIDA = {
    -- lv → AI 档位。lv1..5 只到 4（初始上限），6 以后逐级解锁 5..8
    TIER_BY_LV = { 1, 1, 2, 3, 4, 5, 5, 6, 6, 7, 7, 8 },
    -- 裁决 #5「初始 AI 档上限 = 4」由 TIER_BY_LV 的 lv1..5 段实现（lv5→4），
    -- 本字段是同一事实的对外声明/调试读数，**不参与计算**（改它不会生效，改表才生效）
    TIER_CAP_START = 4,
    TAKE_DUR   = { 6, 8, 10 },    -- 「接手」持续时间（N1 的 3 级）
    KARMA_ROWS = 1,               -- [v4 遗留] 「业障除」清盘底行数（v6 由 CHAIN_ROWS 取代，保留兼容）

    -- ===== v6 天赋数值 =====
    SEED_DUR    = 25,             -- [官] 蕴种印持续 25.0 秒（E 数值表「蕴种印持续时间=25.0秒」）
    TRIGGER_GAP = 2.5,            -- [官] 灭净三业触发间隔 2.5 秒
    TRIGGER_GAP_DOMAIN = 2.25,    -- [官] 摩耶之殿·雷：间隔降低 0.25 秒（1 名角色）⇒ 2.5-0.25
    MASTERY_BASE     = 200,       -- [官] 慧明缘觉智论从 200 点精通起算
    MASTERY_PER_LINE = 8,         -- [官→换] 本局每消 1 行 = +8 点「精通」（200 点起算 ⇒ 25 行进入收益区）
    DMG_PER_POINT    = 0.001,     -- [官] 每 1 点精通 +0.1% 灭净三业伤害
    DMG_CAP          = 0.80,      -- [官] 上限 +80%
    CRIT_PER_POINT   = 0.0003,    -- [官] 每 1 点精通 +0.03% 暴击率
    CRIT_CAP         = 0.24,      -- [官] 上限 +24%（本作=追加一次灭净三业的概率）
    DMG_STEP         = 0.40,      -- [设计] 增幅每满 40% ⇒ 灭净三业清/推行数 +1（80% 上限 ⇒ 最多 3 行）
    CHAIN_BASE       = 1,         -- [官→换] 灭净三业基础 1 行（官方一次范围伤害 ⇒ 一行结算）
    DOMAIN_DUR       = 15,        -- [官] 摩耶之殿基础持续 15.0 秒
    DOMAIN_SCORE     = 0.149,     -- [官] 摩耶之殿·火（1 名）：灭净三业伤害 +14.9% ⇒ 本作译作领域内消行得分 +14.9%
    ABSORB_RATIO     = 0.25,      -- [官] 净善摄受明论：按队伍最高精通的 25% 提升
    ABSORB_SEC_PER_POINT = 0.01,  -- [官→换] 1 点精通 = +0.01 秒接管（250 点上限 ⇒ +2.5 秒）
    ABSORB_CAP       = 2.5,       -- [官] 至多 250 点 ⇒ 本作 2.5 秒
  },

  -- ---- 刻晴：雷楔 / 长按跨地形 / 玉衡之贵 / 金紫定垂四叠 ----
  KEQING = {
    MARK_DUR   = { 5, 7, 9 },     -- 雷楔存续（对齐官方「雷楔至多存在 5 秒」，N1 可延长）
    BLINK_CD   = { 7.5, 6.0, 4.5 },-- 「星斗归位」瞬移 CD（N2 的 3 级）
    LOCK       = { 0.20, 0.15, 0.10 }, -- 瞬移后短暂禁止横移（秒），N3
    SLASH_ROWS = 1,               -- [v4 遗留] 「天街巡游」清行数（v6 由 雷暴连斩 SLASH_CELLS 取代，保留兼容）

    -- ===== v6 天赋数值 =====
    MARK_LIFE   = 5,              -- [官] 雷楔存续 5 秒（投出即开始计时）
    SLASH_CELLS = 2,              -- [官] 雷暴连斩 84%×2 = 两段 ⇒ 清雷楔列底部 2 格
    LONG_PRESS  = 0.35,           -- [设计] 长按判定阈值（短按/长按分界 0.3~0.4s 是输入学常用带；取 0.35）
    YH_DUR      = 8,              -- [官] 玉衡之贵持续 8 秒
    YH_SCORE    = 0.15,           -- [官] 暴击率 +15% ⇒ 本作译作得分 +15%（暴伤 100% 下期望等价）
    YH_RECHARGE = 0.15,           -- [官] 元素充能效率 +15% ⇒ 本作译作冷却回复速度 +15%
    STK_VAL     = 0.06,           -- [官] 命座 6：每层雷伤 +6%
    STK_MAX     = 4,              -- [官] 命座 6：普攻/重击/E/Q 四个独立叠层
    STK_DUR     = 8,              -- [官] 命座 6：持续 8 秒
  },

  -- ---- 甘雨：冰莲 / 唯此一心 / 天地交泰 / 霜华矢二段蓄力 ----
  GANYU = {
    FREEZE_ROWS = { 3, 4, 5 },    -- 「降众天华」冻结行数（N2 的 3 级）
    FREEZE_SEC  = 3,              -- 冻结时长（秒）
    CHARGE_FULL = 0.8,            -- [v4 遗留] 霜华矢蓄满所需（秒）；v6 用 CHARGE_WINDOW
    LOTUS_ROWS  = 3,              -- 冰莲自然绽放清顶行数（v6 语义：6 秒到点自然绽放）
    CLUTCH_H    = 17,             -- 板高 ≥ 该值 ⇒ 冻结行数 +1（背水一战）

    -- ===== v6 天赋数值 =====
    LOTUS_LIFE        = 6,        -- [官] 冰莲持续时间 6.0 秒
    LOTUS_BROKEN_ROWS = 2,        -- [官→换] 冰莲被提前打掉（期间消行）时绽放少 1 行（132% 面积伤 ⇒ 3 行，提前=2 行）
    FOCUS_WINDOW      = 5,        -- [官] 唯此一心：霜华矢发射后 5 秒内暴击率 +20%
    FOCUS_BONUS       = 0.20,     -- [官] 同上：+20% ⇒ 本作译作「窗口内下一次消行得分 +20%」
    FIELD_GRAVITY     = 1.20,     -- [官] 天地交泰：领域内 +20% 冰伤 ⇒ 本作译作重力间隔 ×1.20（节奏慢 20%）
    CHARGE_WINDOW     = 1.2,      -- [官→换] 二段蓄力约 1.6~2.0s；方块节奏快约 25% ⇒ 1.2s 记 1 段
    CHARGE_MAX        = 2,        -- [官] 霜华矢二段蓄力 = 2 段
    CHARGE_ROWS       = 1,        -- [设计] 每段蓄力 ⇒ 施放时冻结行数 +1（二段满 = +2 行）
  },

  -- ---- 哥伦比娅（少女）：引力值 / 月诱 / 新月自己的法则 / 她的乡愁 ----
  COLUMBINA = {
    LAYERS     = { 2, 3, 4 },     -- 「引力涟漪」给对手挂的层数（N1 的 3 级）
    LD_CUT     = { 0.15, 0.22, 0.30 }, -- 每层削减对手锁定延迟（秒）
    DOMAIN_DUR = { 6, 8, 10 },    -- [v4 遗留] 「她的乡愁」领域持续；v6 改用下面 DOMAIN_LIFE（保留兼容）
    GRAVITY_NEED = { 5, 4, 3 },   -- [v4 遗留] 单人模式攒满引力值所需敌方垃圾行数（v6 改用 GRAVITY_MAX）
    CLEAR_ROWS = 1,               -- 单人模式满值后清盘底行数
    SOLO_COST  = 0,               -- 单人降级分支不耗能（只吃 CD），否则没对手时按钮长期不可用
    PRESSURE_H = 15,              -- 对手板高 ≥ 该值 ⇒ 层数 +1（打最弱者）
    PRESSURE_ADD = 1,             -- 压力加成层数
    LAYER_CAP  = 4,

    -- ===== v6 天赋数值 =====
    GRAVITY_MAX      = 60,        -- [官] 引力值上限 60
    GRAVITY_PER_LINE = 5,         -- [官→换] 每消 1 行 +5 点 ⇒ 12 行充满（官方 60 点由队伍月曜反应积攒）
    FULL_MULT        = 1.5,       -- [官→换] 「引力干涉·满辉」= 一次更强的干涉 ⇒ 推层 ×1.5（向上取整，上限 LAYER_CAP）
    FULL_SOLO_ADD    = 1,         -- [官→换] 单人降级：满辉时清底行数 +1（= 1 行 → 2 行）
    LURE_MAX         = 3,         -- [官] 月诱至多 3 层
    LURE_BONUS       = 0.05,      -- [官] 每层暴击率 +5% ⇒ 本作译作得分 +5%/层
    LURE_DUR         = 10,        -- [官] 月诱持续 10 秒
    LAW_CHANCE       = 0.33,      -- [官] 新月自己的法则：月感电 33% 概率额外雷击
    DOMAIN_LIFE      = 20,        -- [官] 她的乡愁·月之领域持续 20.0 秒
    DOMAIN_GAIN      = 1.13,      -- [官] 月曜反应伤害 +13.0% ⇒ 本作译作领域内引力值积攒 ×1.13
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

  -- ---- 天赋确定性随机（可复现；测试可写 state.tal[role].rng 直接定序列）----
  RNG_SEED = 20261029,
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

local function clamp(v, lo, hi)
  v = numOr(v, 0)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
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

-- 对战类模式（与 v4 的 cast 判定保持同一口径：只有 pvp / ai-battle 有"对手盘"）
local function isDuelMode(mode)
  return mode == 'pvp' or mode == 'ai-battle'
end

-- ---------------------------------------------------------------------------
-- 天赋运行时状态：state.tal[role]
--   懒建 + 缺字段补默认 ⇒ 老 state（v4 存的）也能直接喂给 v6 函数。
-- ---------------------------------------------------------------------------
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
  if t.rng == nil then t.rng = M.NUM.RNG_SEED end
  if not isTable(t.pending) then t.pending = {} end
  return t
end

-- 确定性随机：[0,1)。state.tal[role].rng 可直接写以固定序列（测试用）。
local function roll(state, role)
  local t = talOf(state, role)
  if not t then return 0 end
  local x = numOr(t.rng, M.NUM.RNG_SEED)
  x = (x * 1103515245 + 12345) % 2147483648
  t.rng = x
  return x / 2147483648
end

-- ---------------------------------------------------------------------------
-- 效果/结算表的构造器（pure：只建表，不改 state）
-- ---------------------------------------------------------------------------
local function eff(kind, n, role, id, label, fx, sfx, anchor, col)
  return { kind = kind, n = numOr(n, 0), col = numOr(col, 0), role = role, id = id,
           label = label, fx = fx, sfx = sfx, anchor = anchor }
end

local function newRes(role)
  return { role = role, mult = 1, bonus = 0, effects = {}, log = '' }
end

local function pushEff(res, e)
  if isTable(res) and isTable(res.effects) then res.effects[#res.effects + 1] = e end
  return res
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
    tal = {},                     -- v6：每个角色的天赋运行时状态（talOf 懒建）
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
      talOf(s, r)                -- v6：天赋状态就位（缺省值，不依赖首次使用）
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
-- 天赋计时器推进（M.tick 内部用）
--   · 只改 state；到期的"持续效果"塞进 t.pending，由 M.drain 交给 main
-- ===========================================================================
local function tickTal(state, role, dt)
  local t = talOf(state, role)
  if not t then return end
  local N = M.NUM

  if role == 'nahida' then
    if t.seedT > 0 then t.seedT = math.max(0, t.seedT - dt) end
    if t.seedCd > 0 then t.seedCd = math.max(0, t.seedCd - dt) end
    if t.domainT > 0 then t.domainT = math.max(0, t.domainT - dt) end

  elseif role == 'keqing' then
    if t.markT > 0 then t.markT = math.max(0, t.markT - dt) end
    if t.yhT > 0 then t.yhT = math.max(0, t.yhT - dt) end
    if t.stkM > 0 then t.stkM = math.max(0, t.stkM - dt) end
    if t.stkR > 0 then t.stkR = math.max(0, t.stkR - dt) end
    if t.stkH > 0 then t.stkH = math.max(0, t.stkH - dt) end
    if t.stkC > 0 then t.stkC = math.max(0, t.stkC - dt) end

  elseif role == 'ganyu' then
    if t.freezeT > 0 then t.freezeT = math.max(0, t.freezeT - dt) end
    if t.critWin > 0 then t.critWin = math.max(0, t.critWin - dt) end
    if t.lotusT > 0 then
      t.lotusT = math.max(0, t.lotusT - dt)
      if t.lotusT <= 0 and t.lotusArmed then
        -- 冰莲 6 秒到点自然绽放：清顶 LOTUS_ROWS 行（官方「持续时间结束时剧烈绽放」）
        t.lotusArmed = false
        t.pending[#t.pending + 1] = eff('clear-top', N.GANYU.LOTUS_ROWS, role,
          'ganyu.lotus', '冰莲·绽放', 'frost', 'talent', 'talent lotus bloom n=3')
      end
    end

  elseif role == 'columbina' then
    if t.domainT > 0 then t.domainT = math.max(0, t.domainT - dt) end
    if t.lureT > 0 then
      t.lureT = math.max(0, t.lureT - dt)
      if t.lureT <= 0 then t.lure = 0 end     -- 月诱全部到期（3 层共用一个计时：同一次干涉的产物）
    end
  end
end

-- ===========================================================================
-- M.tick(state, dt) -> nil    冷却递减 + 能量自然回复 + 天赋计时器（只改 state）
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
      tickTal(state, r, dt)          -- v6：四条天赋的计时器
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
-- 天赋派生量（params / talentState / 事件结算共用同一套公式，只有这一处）
-- ===========================================================================

-- 纳西妲：本局「精通」代理 = 200 + 8 × 该角色累计消行
local function nahidaMastery(state, role)
  local t = talOf(state, role)
  if not t then return M.NUM.NAHIDA.MASTERY_BASE end
  return M.NUM.NAHIDA.MASTERY_BASE + M.NUM.NAHIDA.MASTERY_PER_LINE * numOr(t.lines, 0)
end

-- 纳西妲：灭净三业伤害增幅（0..0.80）与追加触发概率（0..0.24）
local function nahidaPower(state, role)
  local N = M.NUM.NAHIDA
  local over = math.max(0, nahidaMastery(state, role) - N.MASTERY_BASE)
  return clamp(over * N.DMG_PER_POINT, 0, N.DMG_CAP),
         clamp(over * N.CRIT_PER_POINT, 0, N.CRIT_CAP)
end

-- 纳西妲：灭净三业一次触发清/推几行（1 + floor(增幅 / 0.40)）
local function nahidaChainRows(state, role)
  local dmg = nahidaPower(state, role)
  return M.NUM.NAHIDA.CHAIN_BASE + math.floor(dmg / M.NUM.NAHIDA.DMG_STEP + 1e-9)
end

-- 纳西妲：净善摄受明论给本次接管的加时（秒）
local function nahidaAbsorb(state, role)
  local N = M.NUM.NAHIDA
  local m = nahidaMastery(state, role)
  return clamp(m * N.ABSORB_RATIO * N.ABSORB_SEC_PER_POINT, 0, N.ABSORB_CAP)
end

-- 刻晴：命座 6 四叠当前生效层数（0..4）
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
  if t and numOr(t.freezeT, 0) > 0 then return M.NUM.GANYU.FIELD_GRAVITY end
  return 1
end

-- ===========================================================================
-- M.cast(state, role, ctx) -> { ok, why, effect, n, tier, ... }
--   ctx = { mode='casual'|'ai-battle'|'pvp'|'coop', boardH=number, oppH=number, now=number,
--           col=当前块列号, holdSec=主动键按住秒数, longestEmptyCol=最空列号 }
--   既有字段（ok/why/effect/n/tier）语义不变；v6 追加：
--     takeDur   纳西妲本次接管实际时长（= params.aiDur + 净善摄受明论加时），main 应优先用它
--     buffs     本次施放挂上的天赋状态（供 HUD/日志）
--     talents   本次触发的天赋 id 列表
-- ===========================================================================
M.cast = function(state, role, ctx)
  local out = { ok = false, why = 'bad-state', effect = 'none', n = 0, tier = 0,
                takeDur = 0, buffs = {}, talents = {} }
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
  local holdSec = numOr(ctx.holdSec, 0)
  local tal = talOf(state, role)

  -- ---- 雷楔二段（刻晴）：雷楔在时再按一次 = 引爆，不消耗 CD，只清标记 -------------
  -- 官方：雷楔存续期间再次施放星斗归位 → 瞬移到标记处斩击。门禁放在 CD 之前，
  -- 因为这是一次"免费的第二次施放"（CD 仍按投出时起算）。
  if role == 'keqing' and tal and numOr(tal.markT, 0) > 0 then
    local col = numOr(tal.markCol, 0)
    tal.markT = 0
    tal.markCol = 0
    out.ok = true
    out.why = nil
    out.effect = 'mark-blink'
    out.n = M.NUM.KEQING.SLASH_CELLS
    out.tier = tierOf(role, isTable(state.lv) and state.lv[role])
    out.talents = { 'keqing.mark' }
    out.buffs = { { id = 'keqing.mark', label = '雷楔·引爆', left = 0, val = col } }
    return out
  end

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
  local duel = (role == 'columbina') and isDuelMode(mode)
  local cost = numOr(M.NUM.COST[role], 0)
  if role == 'columbina' and not duel then
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
    -- P4 净善摄受明论：按本局精通延长接管（至多 +2.5s）
    out.takeDur = p.aiDur + nahidaAbsorb(state, role)
    -- P1 蕴种印：25 秒；P3 摩耶之殿：15 秒领域
    tal.seedT = M.NUM.NAHIDA.SEED_DUR
    tal.domainT = M.NUM.NAHIDA.DOMAIN_DUR
    out.talents = { 'nahida.seed', 'nahida.domain', 'nahida.absorb' }
    out.buffs = {
      { id = 'nahida.seed', label = '蕴种印', left = M.NUM.NAHIDA.SEED_DUR, val = nahidaChainRows(state, role) },
      { id = 'nahida.domain', label = '摩耶之殿', left = M.NUM.NAHIDA.DOMAIN_DUR, val = M.NUM.NAHIDA.DOMAIN_SCORE },
      { id = 'nahida.absorb', label = '净善摄受明论', left = 0, val = nahidaAbsorb(state, role) },
    }

  elseif role == 'keqing' then
    -- P2 长按·跨地形：按住 ≥0.35s ⇒ 目标改为「最空列」，effect 换成 blink-best
    local longPress = holdSec >= M.NUM.KEQING.LONG_PRESS
    effect = longPress and 'blink-best' or 'blink'
    n = pick3(M.NUM.KEQING.LOCK, n3)          -- 封锁秒数
    useCd = pick3(M.NUM.KEQING.BLINK_CD, n2)  -- N2 缩短 CD
    -- P1 雷楔：投出即计时 5 秒，记下列号（main 通过 ctx.col 告诉本模块当前块在哪列）
    tal.markT = M.NUM.KEQING.MARK_LIFE
    tal.markCol = numOr(ctx.col, 0)
    -- P3 玉衡之贵：施放后 8 秒（得分 +15% / CD 回复 +15%）
    tal.yhT = M.NUM.KEQING.YH_DUR
    out.talents = { 'keqing.mark', 'keqing.yuheng' }
    if longPress then out.talents[#out.talents + 1] = 'keqing.longpress' end
    out.buffs = {
      { id = 'keqing.mark', label = '雷楔', left = tal.markT, val = tal.markCol },
      { id = 'keqing.yuheng', label = '玉衡之贵', left = tal.yhT, val = M.NUM.KEQING.YH_SCORE },
    }

  elseif role == 'ganyu' then
    effect = 'freeze'
    -- P4 霜华矢二段蓄力：每段 +1 冻结行（段数在施放时结算清零）
    local charge = numOr(tal.charge, 0)
    n = p.freezeRows + charge * M.NUM.GANYU.CHARGE_ROWS
    if boardH >= M.NUM.GANYU.CLUTCH_H then n = n + 1 end
    useCd = numOr(M.NUM.CD.ganyu, 12)
    -- P3 天地交泰 + P1 冰莲：冻结期间建立冰莲（6 秒；期间消行=被提前打掉）
    tal.freezeT = p.freezeSec
    tal.lotusT = M.NUM.GANYU.LOTUS_LIFE
    tal.lotusArmed = true
    tal.charge = 0
    out.talents = { 'ganyu.lotus', 'ganyu.field' }
    if charge > 0 then out.talents[#out.talents + 1] = 'ganyu.charge' end
    out.buffs = {
      { id = 'ganyu.lotus', label = '冰莲', left = tal.lotusT, val = charge },
      { id = 'ganyu.field', label = '天地交泰', left = tal.freezeT, val = M.NUM.GANYU.FIELD_GRAVITY },
    }

  elseif role == 'columbina' then
    useCd = numOr(M.NUM.CD.columbina, 17)
    -- P4 她的乡愁：施放即展开月之领域 20 秒
    tal.domainT = M.NUM.COLUMBINA.DOMAIN_LIFE
    if duel then
      effect = 'ripple'
      n = pick3(M.NUM.COLUMBINA.LAYERS, n1)
      if oppH >= M.NUM.COLUMBINA.PRESSURE_H then n = n + M.NUM.COLUMBINA.PRESSURE_ADD end
      -- P1 引力值满 ⇒ 「引力干涉·满辉」：推层 ×1.5（向上取整，仍受 LAYER_CAP 约束）
      local grav = numOr(tal.gravity, 0)
      if grav >= M.NUM.COLUMBINA.GRAVITY_MAX then
        n = math.ceil(n * M.NUM.COLUMBINA.FULL_MULT)
        tal.gravity = 0
        -- P2 月诱：每次满辉干涉 +1 层
        tal.lure = math.min(M.NUM.COLUMBINA.LURE_MAX, numOr(tal.lure, 0) + 1)
        tal.lureT = M.NUM.COLUMBINA.LURE_DUR
        out.talents = { 'columbina.gravity', 'columbina.lure', 'columbina.domain' }
      else
        out.talents = { 'columbina.domain' }
      end
      if n > M.NUM.COLUMBINA.LAYER_CAP then n = M.NUM.COLUMBINA.LAYER_CAP end
    else
      -- 单人/合作：无对手 ⇒ 降级为「引力值满后清盘底」，不空放、不耗能
      effect = 'gravity-clear'
      n = numOr(M.NUM.COLUMBINA.CLEAR_ROWS, 1)
      local grav = numOr(tal.gravity, 0)
      if grav >= M.NUM.COLUMBINA.GRAVITY_MAX then
        n = n + M.NUM.COLUMBINA.FULL_SOLO_ADD
        tal.gravity = 0
        tal.lure = math.min(M.NUM.COLUMBINA.LURE_MAX, numOr(tal.lure, 0) + 1)
        tal.lureT = M.NUM.COLUMBINA.LURE_DUR
        out.talents = { 'columbina.gravity', 'columbina.lure', 'columbina.domain' }
      else
        out.talents = { 'columbina.domain' }
      end
    end
    out.buffs = {
      { id = 'columbina.domain', label = '月之领域', left = tal.domainT, val = M.NUM.COLUMBINA.DOMAIN_GAIN },
      { id = 'columbina.gravity', label = '引力值', left = 0, val = numOr(tal.gravity, 0) },
      { id = 'columbina.lure', label = '月诱', left = numOr(tal.lureT, 0), val = numOr(tal.lure, 0) },
    }
  end

  -- P3 玉衡之贵·充能效率：CD 回复 +15% ⇒ 本次起算的 CD 按 1/(1+0.15) 记
  if role == 'keqing' then
    useCd = useCd / (1 + M.NUM.KEQING.YH_RECHARGE)
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
--   既有键（v4 契约，main 的 charData/HUD 都在读）：
--     { aiTier, aiDur, freezeRows, freezeSec, holdCutMs, clearRows }
--   v6 新增键：
--     gravityMult   当前重力间隔倍率（甘雨·天地交泰）
--     chainRows     灭净三业每次清/推行数（纳西妲·慧明缘觉智论）
--     seedGap       灭净三业触发间隔（摩耶之殿内缩短）
--     domainScore   摩耶之殿内消行得分加成
--     gravity / gravityMax / lure / lureBonus / lureLeft   少女的实时值
--     charge / chargeMax                                   甘雨蓄力段
--     lotusLeft / freezeLeft / markLeft / markCol / yhLeft / seedLeft / domainLeft
--     absorbSec                                            净善摄受明论加时
-- ===========================================================================
M.params = function(state, role)
  local p = { aiTier = 0, aiDur = 0, freezeRows = 0, freezeSec = 0, holdCutMs = 0, clearRows = 0,
              gravityMult = 1, chainRows = 0, seedGap = 0, domainScore = 0,
              gravity = 0, gravityMax = 0, lure = 0, lureBonus = 0, lureLeft = 0,
              charge = 0, chargeMax = 0, absorbSec = 0,
              lotusLeft = 0, freezeLeft = 0, markLeft = 0, markCol = 0, yhLeft = 0,
              seedLeft = 0, domainLeft = 0 }
  if not isTable(state) or type(role) ~= 'string' then return p end

  local lvRaw = isTable(state.lv) and state.lv[role]
  local lv = math.floor(numOr(lvRaw, 1))
  if lv < 1 then lv = 1 end
  local g = lv - 1
  local meta = M.NUM.META
  local t = talOf(state, role)

  if role == 'nahida' then
    p.aiTier = tierOf(role, lv)
    p.aiDur  = pick3(M.NUM.NAHIDA.TAKE_DUR, nodeLv(state, role, 1))
               + numOr(meta.AI_DUR_PER_LV, 0) * g
    p.clearRows = numOr(M.NUM.NAHIDA.KARMA_ROWS, 1)
    p.chainRows = nahidaChainRows(state, role)
    p.domainScore = M.NUM.NAHIDA.DOMAIN_SCORE
    p.absorbSec = nahidaAbsorb(state, role)
    if t then
      p.seedLeft = numOr(t.seedT, 0)
      p.domainLeft = numOr(t.domainT, 0)
      p.seedGap = (numOr(t.domainT, 0) > 0) and M.NUM.NAHIDA.TRIGGER_GAP_DOMAIN
                  or M.NUM.NAHIDA.TRIGGER_GAP
    end

  elseif role == 'keqing' then
    p.aiTier = 0
    p.clearRows = numOr(M.NUM.KEQING.SLASH_ROWS, 1)
    if t then
      p.markLeft = numOr(t.markT, 0)
      p.markCol = numOr(t.markCol, 0)
      p.yhLeft = numOr(t.yhT, 0)
    end

  elseif role == 'ganyu' then
    p.freezeRows = pick3(M.NUM.GANYU.FREEZE_ROWS, nodeLv(state, role, 2))
    p.freezeSec  = numOr(M.NUM.GANYU.FREEZE_SEC, 3) + numOr(meta.FREEZE_SEC_PER_LV, 0) * g
    p.clearRows  = numOr(M.NUM.GANYU.LOTUS_ROWS, 3)
    p.gravityMult = ganyuGravityMult(state, role)
    p.chargeMax = M.NUM.GANYU.CHARGE_MAX
    if t then
      p.charge = numOr(t.charge, 0)
      p.lotusLeft = numOr(t.lotusT, 0)
      p.freezeLeft = numOr(t.freezeT, 0)
    end

  elseif role == 'columbina' then
    p.holdCutMs = pick3(M.NUM.COLUMBINA.LD_CUT, nodeLv(state, role, 1)) * 1000
                  + numOr(meta.HOLD_CUT_PER_LV, 0) * g
    p.clearRows = numOr(M.NUM.COLUMBINA.CLEAR_ROWS, 1)
    p.gravityMax = M.NUM.COLUMBINA.GRAVITY_MAX
    p.lureBonus = M.NUM.COLUMBINA.LURE_BONUS
    if t then
      p.gravity = numOr(t.gravity, 0)
      p.lure = numOr(t.lure, 0)
      p.lureLeft = numOr(t.lureT, 0)
      p.domainLeft = numOr(t.domainT, 0)
    end
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
--   既有字段（v4 契约，main 的 skillHud 在读）：
--     { active, lv, tier, cd, energy, partyMax, unlockedCount }
--   v6 追加：buff   当前生效的天赋（数组：{id,label,left,val}）
--            talents 当前角色的天赋实时读数（= talentState）
--            mult    当前角色的"下一消行"得分倍率（HUD 可以直接显示 +x%）
-- ===========================================================================
M.snapshot = function(state)
  local o = { active = nil, lv = 0, tier = 0, cd = 0, energy = 0, partyMax = 0, unlockedCount = 0,
              buff = {}, talents = {}, mult = 1 }
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
      o.buff   = M.buffs(state, r)
      o.talents = M.talentState(state, r)
      o.mult   = M.nextMult(state, r)
    end
  end
  return o
end

-- ===========================================================================
-- M.buffs(state, role) -> array
--   当前生效的天赋状态（HUD 只需渲染这张表：label + left 秒 + val）
-- ===========================================================================
M.buffs = function(state, role)
  local out = {}
  local t = isTable(state) and talOf(state, role)
  if not t then return out end
  if role == 'nahida' then
    if numOr(t.seedT, 0) > 0 then
      out[#out + 1] = { id = 'nahida.seed', label = '蕴种印', left = t.seedT }
    end
    if numOr(t.domainT, 0) > 0 then
      out[#out + 1] = { id = 'nahida.domain', label = '摩耶之殿', left = t.domainT }
    end
  elseif role == 'keqing' then
    if numOr(t.markT, 0) > 0 then
      out[#out + 1] = { id = 'keqing.mark', label = '雷楔', left = t.markT, val = t.markCol }
    end
    if numOr(t.yhT, 0) > 0 then
      out[#out + 1] = { id = 'keqing.yuheng', label = '玉衡之贵', left = t.yhT }
    end
    local st = keqingStacks(state, role)
    if st > 0 then
      out[#out + 1] = { id = 'keqing.stacks', label = '雷伤叠层', left = 0, val = st }
    end
  elseif role == 'ganyu' then
    if numOr(t.freezeT, 0) > 0 then
      out[#out + 1] = { id = 'ganyu.field', label = '天地交泰', left = t.freezeT }
    end
    if numOr(t.lotusT, 0) > 0 then
      out[#out + 1] = { id = 'ganyu.lotus', label = '冰莲', left = t.lotusT }
    end
    if numOr(t.critWin, 0) > 0 then
      out[#out + 1] = { id = 'ganyu.focus', label = '唯此一心', left = t.critWin }
    end
    if numOr(t.charge, 0) > 0 then
      out[#out + 1] = { id = 'ganyu.charge', label = '霜华', left = 0, val = t.charge }
    end
  elseif role == 'columbina' then
    if numOr(t.domainT, 0) > 0 then
      out[#out + 1] = { id = 'columbina.domain', label = '月之领域', left = t.domainT }
    end
    if numOr(t.lure, 0) > 0 then
      out[#out + 1] = { id = 'columbina.lure', label = '月诱', left = t.lureT, val = t.lure }
    end
  end
  return out
end

-- ===========================================================================
-- M.nextMult(state, role) -> number
--   「下一次消行」的得分倍率（只算持续型加成，不含一次性事件）——HUD 直接显示。
--   口径：所有加成**相加**（1 + Σ），与 onClear 的 mult 同一套公式。
-- ===========================================================================
M.nextMult = function(state, role)
  local t = isTable(state) and talOf(state, role)
  if not t then return 1 end
  local N = M.NUM
  local m = 0
  if role == 'nahida' then
    if numOr(t.domainT, 0) > 0 then m = m + N.NAHIDA.DOMAIN_SCORE end
  elseif role == 'keqing' then
    if numOr(t.yhT, 0) > 0 then m = m + N.KEQING.YH_SCORE end
    m = m + N.KEQING.STK_VAL * keqingStacks(state, role)
  elseif role == 'ganyu' then
    if numOr(t.critWin, 0) > 0 then m = m + N.GANYU.FOCUS_BONUS end
  elseif role == 'columbina' then
    m = m + N.COLUMBINA.LURE_BONUS * numOr(t.lure, 0)
  end
  return 1 + m
end

-- ===========================================================================
-- M.onLock(state, role, info) -> res
--   锁定事件：刻晴的命座 6 四叠、甘雨的霜华矢蓄力段都在这里记账。
--   info = { piece, hard, rotated, moved, tspin, cleared, dwell, boardH, mode }
-- ===========================================================================
M.onLock = function(state, role, info)
  local res = newRes(role)
  if not isTable(state) or not knownRole(role) then return res end
  if not isTable(info) then info = {} end
  local t = talOf(state, role)
  if not t then return res end
  local N = M.NUM
  local logs = {}

  if role == 'keqing' then
    -- P4 金紫定垂（命座 6）：移动 / 旋转 / 硬降 / 消行 各 1 层，独立 8 秒
    if info.moved == true then t.stkM = N.KEQING.STK_DUR; logs[#logs + 1] = 'move' end
    if info.rotated == true then t.stkR = N.KEQING.STK_DUR; logs[#logs + 1] = 'rot' end
    if info.hard == true then t.stkH = N.KEQING.STK_DUR; logs[#logs + 1] = 'hard' end
    if numOr(info.cleared, 0) > 0 then t.stkC = N.KEQING.STK_DUR; logs[#logs + 1] = 'clear' end

  elseif role == 'ganyu' then
    -- P4 霜华矢二段蓄力：慢锁（未硬降、本块停留 ≥1.2s）记 1 段，最多 2 段
    local dwell = numOr(info.dwell, 0)
    if info.hard ~= true and dwell >= N.GANYU.CHARGE_WINDOW then
      local before = numOr(t.charge, 0)
      t.charge = math.min(N.GANYU.CHARGE_MAX, before + 1)
      if t.charge ~= before then
        logs[#logs + 1] = 'charge=' .. tostring(t.charge)
      end
    end
  end

  res.mult = M.nextMult(state, role)
  res.log = 'talent onLock role=' .. tostring(role)
    .. ' stk=' .. tostring(keqingStacks(state, role))
    .. ' charge=' .. tostring(numOr(t.charge, 0))
    .. ((#logs > 0) and (' got=' .. table.concat(logs, '+')) or '')
  return res
end

-- ===========================================================================
-- M.onClear(state, role, cleared, info) -> res
--   消行事件：这是四条天赋树的主战场。
--   info = { level, combo, b2b, boardH, mode, duel }
--   res.mult  本次得分倍率（main：gain = floor(gain * res.mult + res.bonus)）
--   res.effects  要 main 执行的效果（清行 / 推垃圾 / 清列）
-- ===========================================================================
M.onClear = function(state, role, cleared, info)
  local res = newRes(role)
  if not isTable(state) or not knownRole(role) then return res end
  cleared = math.max(0, numOr(cleared, 0))
  if not isTable(info) then info = {} end
  local t = talOf(state, role)
  if not t then return res end
  local N = M.NUM
  local mode = type(info.mode) == 'string' and info.mode or 'casual'
  local duel = (info.duel == true) or isDuelMode(mode)
  local notes = {}

  if role == 'nahida' then
    -- P2 慧明缘觉智论：本局累计消行 = 精通代理（200 起算，每行 +8）
    t.lines = numOr(t.lines, 0) + cleared
    local chain = nahidaChainRows(state, role)
    local dmg, crit = nahidaPower(state, role)
    -- P3 摩耶之殿：领域内消行得分 +14.9%
    if numOr(t.domainT, 0) > 0 then
      res.mult = res.mult + N.NAHIDA.DOMAIN_SCORE
      notes[#notes + 1] = 'domain=1'
    end
    -- P1 蕴种印：25 秒内、间隔 ≥ 2.5s（领域内 2.25s）⇒ 灭净三业
    if cleared > 0 and numOr(t.seedT, 0) > 0 and numOr(t.seedCd, 0) <= 0 then
      local gap = (numOr(t.domainT, 0) > 0) and N.NAHIDA.TRIGGER_GAP_DOMAIN or N.NAHIDA.TRIGGER_GAP
      t.seedCd = gap
      t.seedHits = numOr(t.seedHits, 0) + 1
      local times = 1
      -- P2 暴击率侧：精通超 200 部分每点 +0.03%（上限 24%）⇒ 追加一次的概率
      if crit > 0 and roll(state, role) < crit then times = 2 end
      for _ = 1, times do
        if duel then
          pushEff(res, eff('garbage-push', chain, role, 'nahida.seed', '灭净三业',
            'vine', 'talent', 'talent nahida-seed push n=' .. tostring(chain)))
        else
          pushEff(res, eff('clear-bottom', chain, role, 'nahida.seed', '灭净三业',
            'vine', 'talent', 'talent nahida-seed clear n=' .. tostring(chain)))
        end
      end
      notes[#notes + 1] = 'seed=' .. tostring(times)
      notes[#notes + 1] = 'chain=' .. tostring(chain)
    end
    notes[#notes + 1] = 'mastery=' .. tostring(nahidaMastery(state, role))
    notes[#notes + 1] = 'dmg=' .. string.format('%.3f', dmg)

  elseif role == 'keqing' then
    -- P3 玉衡之贵：8 秒内得分 +15%
    if numOr(t.yhT, 0) > 0 then
      res.mult = res.mult + N.KEQING.YH_SCORE
      notes[#notes + 1] = 'yuheng=1'
    end
    -- P4 命座 6：四叠各 +6%
    local st = keqingStacks(state, role)
    if st > 0 then
      res.mult = res.mult + N.KEQING.STK_VAL * st
      notes[#notes + 1] = 'stk=' .. tostring(st)
    end
    if cleared > 0 then t.stkC = N.KEQING.STK_DUR end   -- 消行本身也是四类操作之一
    -- P1 雷楔：存续期间消行 ⇒ 雷暴连斩（清雷楔列底部 2 格），雷楔被消耗
    if cleared > 0 and numOr(t.markT, 0) > 0 then
      local col = numOr(t.markCol, 0)
      pushEff(res, eff('clear-col', N.KEQING.SLASH_CELLS, role, 'keqing.mark', '雷暴连斩',
        'bolt', 'talent', 'talent keqing-slash col=' .. tostring(col)
          .. ' n=' .. tostring(N.KEQING.SLASH_CELLS), col))
      t.markT = 0
      t.markCol = 0
      notes[#notes + 1] = 'slash=1'
    end

  elseif role == 'ganyu' then
    -- P2 唯此一心：上次消行后 5 秒内，本次消行 +20%
    if numOr(t.critWin, 0) > 0 then
      res.mult = res.mult + N.GANYU.FOCUS_BONUS
      notes[#notes + 1] = 'focus=1'
    end
    if cleared > 0 then t.critWin = N.GANYU.FOCUS_WINDOW end   -- 本次消行重新开窗口
    -- P1 冰莲：冻结期间消行 ⇒ 冰莲被提前打掉，绽放 2 行（自然绽放 3 行）
    if cleared > 0 and t.lotusArmed then
      t.lotusArmed = false
      t.lotusT = 0
      pushEff(res, eff('clear-top', N.GANYU.LOTUS_BROKEN_ROWS, role, 'ganyu.lotus', '冰莲·提前绽放',
        'frost', 'talent', 'talent ganyu-lotus early n=' .. tostring(N.GANYU.LOTUS_BROKEN_ROWS)))
      notes[#notes + 1] = 'lotus=early'
    end

  elseif role == 'columbina' then
    -- P2 月诱：每层 +5% 得分
    local lure = numOr(t.lure, 0)
    if lure > 0 then
      res.mult = res.mult + N.COLUMBINA.LURE_BONUS * lure
      notes[#notes + 1] = 'lure=' .. tostring(lure)
    end
    -- P1 引力值：每行 +5（领域内 ×1.13），上限 60
    if cleared > 0 then
      local gain = cleared * N.COLUMBINA.GRAVITY_PER_LINE
      if numOr(t.domainT, 0) > 0 then gain = gain * N.COLUMBINA.DOMAIN_GAIN end
      t.gravity = math.min(N.COLUMBINA.GRAVITY_MAX, numOr(t.gravity, 0) + gain)
      notes[#notes + 1] = 'gravity=' .. string.format('%.1f', t.gravity)
      -- P3 新月自己的法则：月之领域内 33% 概率额外推 1 行
      if numOr(t.domainT, 0) > 0 and roll(state, role) < N.COLUMBINA.LAW_CHANCE then
        pushEff(res, eff('garbage-push', 1, role, 'columbina.law', '新月自己的法则',
          'wave', 'talent', 'talent columbina-law proc n=1'))
        notes[#notes + 1] = 'law=1'
      end
    end
  end

  res.log = 'talent onClear role=' .. tostring(role) .. ' n=' .. tostring(cleared)
    .. ' mult=' .. string.format('%.3f', res.mult)
    .. ((#notes > 0) and (' ' .. table.concat(notes, ' ')) or '')
  return res
end

-- ===========================================================================
-- M.drain(state) -> effects[]
--   把 M.tick 里到期的持续效果交给 main 执行（当前只有甘雨的冰莲自然绽放）。
--   每次调用清空队列，main 每帧调一次即可。
-- ===========================================================================
M.drain = function(state)
  local out = {}
  if not isTable(state) or not isTable(state.tal) then return out end
  for _, t in pairs(state.tal) do
    if isTable(t) and isTable(t.pending) then
      for i = 1, #t.pending do out[#out + 1] = t.pending[i] end
      t.pending = {}
    end
  end
  return out
end

-- ===========================================================================
-- M.TALENTS —— 静态天赋清单（角色页/名册渲染用）
--   每条字段：
--     id       稳定 id（日志/存档用）
--     kind     'active' | 'passive' | 'mech'
--     name     玩家看到的中文名
--     official 官方原型（wiki 原句，可复核）
--     source   出处（wiki 页 + 天赋名）
--     map      官方 → 方块玩法的映射（一句话）
--     see      玩家怎么感知（HUD/特效/文案）
--     verify   验收锚（日志行或状态字段，能机检）
--     gate     解锁门槛（等级；0 = 起始即有）
-- ===========================================================================
M.TALENTS = {
  nahida = {
    { id = 'nahida.active', kind = 'active', name = '所闻遍计 · 智慧代打', gate = 0,
      official = '施放元素战技，对命中的至多 8 名敌人施加蕴种印；施放大招展开摩耶之殿。',
      source = '纳西妲 · 所闻遍计 / 心景幻成',
      map = '按 Z 把盘面交给智慧之神代打，持续 6~10 秒（按 N1 等级）；同时施加蕴种印并展开摩耶之殿。',
      see = '名卡「纳西妲·所闻遍计」+ 棋盘下方浮字「标准代打 · 8 秒」+ 接管倒计时。',
      verify = '日志 `skill ai start tier=… dur=…`；状态 state.tal.nahida.domainT>0' },
    { id = 'nahida.seed', kind = 'passive', name = '蕴种印', gate = 0,
      official = '蕴种印持续 25.0 秒；对处于蕴种印状态下的敌人触发元素反应后，释放灭净三业。',
      source = '纳西妲 · 所闻遍计（属性表：蕴种印持续时间 25.0 秒 / 灭净三业触发间隔 2.5 秒）',
      map = '施放后 25 秒内，每次消行触发一次「灭净三业」：对战推对手 1 行、单人清自己盘底 1 行；两次触发至少隔 2.5 秒。',
      see = 'HUD 显示「蕴种印 23.4s」倒计时；触发时飘字「灭净三业」+ 对手盘顶起一行。',
      verify = '日志 `talent nahida-seed push n=1` / `clear n=1`；状态 state.tal.nahida.seedHits 自增' },
    { id = 'nahida.wisdom', kind = 'passive', name = '慧明缘觉智论', gate = 3,
      official = '基于纳西妲总元素精通超过 200 点的部分，每 1 点使灭净三业伤害 +0.1%、暴击率 +0.03%（至多 +80% / +24%）。',
      source = '纳西妲 · 慧明缘觉智论',
      map = '本局每消 1 行 = +8 点「精通」（200 起算）。每 +40% 增幅，灭净三业多清/推 1 行（最高 3 行）；暴击率折成「追加一次灭净三业」的概率（最高 24%，可复现随机）。',
      see = '角色页数值：精通 200→400→800 对应「连锁 1 行→2 行」；触发双段时飘字两次。',
      verify = '日志 `talent onClear … mastery=… dmg=… seed=2 chain=2`' },
    { id = 'nahida.domain', kind = 'passive', name = '摩耶之殿', gate = 6,
      official = '展开摩耶之殿：基础持续 15.0 秒；雷元素使灭净三业触发间隔降低 0.25 秒；火元素使灭净三业伤害 +14.9%（1 名角色）。',
      source = '纳西妲 · 心景幻成（属性表：基础持续时间 15.0 秒 / 雷·间隔降低 0.25 秒 / 火·伤害提升 14.9%）',
      map = '施放后 15 秒领域：领域内消行得分 +14.9%；灭净三业触发间隔由 2.5 秒缩短到 2.25 秒。',
      see = 'HUD「摩耶之殿 12.3s」+ 棋盘外圈草绿描边；消行时分数多 14.9%。',
      verify = '日志 `talent onClear … mult=1.149 domain=1`；state.tal.nahida.domainT' },
    { id = 'nahida.absorb', kind = 'passive', name = '净善摄受明论', gate = 9,
      official = '施放心景幻成时，依据队伍中元素精通最高的角色的 25%，提高领域内角色的元素精通，至多 250 点。',
      source = '纳西妲 · 净善摄受明论',
      map = '施放时按本局精通（200 起算）的 25% 延长本次接管时长：1 点精通 = +0.01 秒，至多 +2.5 秒（250 点上限）。',
      see = '接管浮字「标准代打 · 10.5 秒」比基础值长；名卡副文案「净善摄受明论 +2.5s」。',
      verify = '日志 `skill ai start … dur=…`（> params.aiDur）；cast 返回 res.takeDur' },
  },

  keqing = {
    { id = 'keqing.active', kind = 'active', name = '星斗归位 · 瞬落', gate = 0,
      official = '迅速投出雷楔，命中位置留下雷楔标记；雷楔至多存在 5 秒，投出后冷却开始计时。',
      source = '刻晴 · 星斗归位',
      map = '按 Z 把当前方块瞬移到本列最底部并立即锁定，随后留下 5 秒雷楔。',
      see = '方块落下瞬间的雷光竖线（bolt）+ 浮字「雷楔 · 瞬落 N 格」。',
      verify = '日志 `skill blink col=… rows=…`；state.tal.keqing.markT=5' },
    { id = 'keqing.mark', kind = 'passive', name = '雷楔 · 二段', gate = 0,
      official = '在雷楔的持续期间内，刻晴再次施放星斗归位或施展重击时，会清除雷楔标记并造成不同的效果（瞬移斩击 / 雷暴连斩 84%×2）。',
      source = '刻晴 · 星斗归位（雷楔说明 + 属性表「雷暴连斩伤害=84%*2」）',
      map = '雷楔 5 秒内再按一次 Z = 引爆：当前方块瞬移到雷楔列并落底（免 CD，只清标记）；若这 5 秒内先消了行，则改触发雷暴连斩——清雷楔列底部 2 格。',
      see = 'HUD「雷楔 3.2s」+ 雷楔列高亮；引爆时竖劈特效（bolt）。',
      verify = '日志 `talent keqing-slash col=… n=2` / `skill mark-blink`；state.tal.keqing.markT 归零' },
    { id = 'keqing.longpress', kind = 'passive', name = '长按 · 跨地形', gate = 3,
      official = '长按以调整雷楔标记投掷的方向；通过长按投出的雷楔可以悬浮在空中，并使刻晴再次施放星斗归位时跨越地形。',
      source = '刻晴 · 星斗归位（长按说明）',
      map = '按住 Z ≥0.35 秒再松手 = 瞬落改为把当前方块移到「最空的一列」并落底（跨越地形障碍）。',
      see = '浮字「跨地形 · 瞬移到第 N 列」；短按/长按两种不同的落点轨迹。',
      verify = '日志 `skill blink-best target=…`；cast 返回 effect=blink-best' },
    { id = 'keqing.yuheng', kind = 'passive', name = '玉衡之贵', gate = 6,
      official = '施放天街巡游时，刻晴的暴击率提升 15%，元素充能效率提升 15%，持续 8 秒。',
      source = '刻晴 · 玉衡之贵',
      map = '施放主动后 8 秒：消行得分 +15%（暴击率 +15% 在 100% 暴伤下的期望等价），技能冷却按 1/1.15 记（充能效率 +15%）。',
      see = 'HUD「玉衡之贵 6.1s」+ 分数跳动幅度变大；CD 条回得更快。',
      verify = '日志 `talent onClear … mult=1.150 yuheng=1`；state.tal.keqing.yhT' },
    { id = 'keqing.stacks', kind = 'mech', name = '金紫定垂 · 四叠', gate = 9,
      official = '命座 6：普攻/重击/元素战技/元素爆发各提供 6% 雷元素伤害加成，四个独立叠层，持续 8 秒。',
      source = '刻晴 · 命之座 6（金紫定垂）',
      map = '移动 / 旋转 / 硬降 / 消行 四种操作各叠 1 层「雷伤」，每层 +6% 得分，各自独立 8 秒计时，最多 4 层（+24%）。',
      see = 'HUD 四个小格依次点亮，每格「+6%」。',
      verify = '日志 `talent onLock … stk=N`；state.tal.keqing.stkM/stkR/stkH/stkC' },
  },

  ganyu = {
    { id = 'ganyu.active', kind = 'active', name = '降众天华 · 冰封', gate = 0,
      official = '召唤退魔的冰灵珠，持续降下冰棱；同一敌人每 1.45 秒只能被锁定一次，共 10 轮 51 枚。',
      source = '甘雨 · 降众天华（属性表：持续 15.0 秒 / 冰棱伤害 70%）',
      map = '按 Z 冻结当前 3~5 行垃圾 3 秒（背水一战时 +1 行），冻结期间玩家盘不收垃圾行。',
      see = '棋盘覆一层冰蓝（frost）、受击行闪白；浮字「冻结 4 行 · 3 秒」。',
      verify = '日志 `skill freeze rows=… sec=…`；state.tal.ganyu.freezeT' },
    { id = 'ganyu.lotus', kind = 'passive', name = '冰莲', gate = 0,
      official = '留下冰莲并后退：持续嘲讽，被摧毁或持续时间结束（6.0 秒）时剧烈绽放，造成冰元素范围伤害。',
      source = '甘雨 · 山泽麟迹（属性表：持续时间 6.0 秒 / 技能伤害 132%）',
      map = '施放时种下冰莲（6 秒）：到点自然绽放清掉盘顶 3 行；若这 6 秒内你先消了行（把冰莲打掉），提前绽放但只清 2 行。',
      see = '棋盘左下角冰莲图标 + 6 秒倒计时；绽放时顶部整行碎冰特效。',
      verify = '日志 `talent lotus bloom n=3` / `talent ganyu-lotus early n=2`；state.tal.ganyu.lotusArmed' },
    { id = 'ganyu.focus', kind = 'passive', name = '唯此一心', gate = 3,
      official = '霜华矢发射后的 5 秒内，使接下来发射的霜华矢与其引发的霜华绽发的暴击率提高 20%。',
      source = '甘雨 · 唯此一心',
      map = '每次消行后 5 秒内开窗：窗口内再消行，得分 +20%。',
      see = 'HUD「唯此一心 3.4s」+ 窗口内消行分数金色。',
      verify = '日志 `talent onClear … mult=1.200 focus=1`；state.tal.ganyu.critWin' },
    { id = 'ganyu.field', kind = 'passive', name = '天地交泰', gate = 6,
      official = '降众天华领域内的队伍中当前场上角色获得 20% 冰元素伤害加成。',
      source = '甘雨 · 天地交泰',
      map = '冻结期间重力下落间隔 ×1.20（节奏慢 20%）：把官方 +20% 输出换算成等价的 20% 操作时间。',
      see = '冻结期间方块下落肉眼变慢；HUD「天地交泰 2.1s」。',
      verify = '日志 `talent onClear … field=1`；params.ganyu.gravityMult=1.2' },
    { id = 'ganyu.charge', kind = 'mech', name = '霜华矢 · 二段蓄力', gate = 9,
      official = '重击瞄准蓄力，二段蓄力射出霜华矢；命中后产生霜华绽发（二段冰伤）。',
      source = '甘雨 · 流天射术（蓄力说明）',
      map = '慢锁一块（本块从出块到锁定 ≥1.2 秒且没用硬降）= 蓄 1 段，最多 2 段；施放时每段给冻结 +1 行，结算后清零。',
      see = 'HUD 两枚「霜华」印记；施放浮字「冻结 5 行（含二段蓄力 +2）」。',
      verify = '日志 `talent onLock … charge=2`；state.tal.ganyu.charge' },
  },

  columbina = {
    { id = 'columbina.active', kind = 'active', name = '引力涟漪 · 潮汐', gate = 0,
      official = '唤出引力涟漪，跟随场上角色持续造成水元素范围伤害；引力值积攒至上限时依据积攒最多的月曜反应类型造成不同类型的伤害。',
      source = '哥伦比娅 · 万古潮汐（属性表：引力值上限 60 / 冷却 17.0 秒）',
      map = '按 Z 把引力涟漪推向对手盘顶（2~4 层，对手板越高推得越多）；单人局降级为清自己盘底 1 行。',
      see = '波纹横扫到对方棋盘（wave）+ 浮字「涟漪 · 推 3 层」。',
      verify = '日志 `skill ripple push n=…`；state.tal.columbina.domainT' },
    { id = 'columbina.gravity', kind = 'passive', name = '引力值', gate = 0,
      official = '队伍触发月曜反应或造成月曜反应伤害时，为哥伦比娅积攒引力值，积攒至上限（60）后造成对应类型的干涉伤害。',
      source = '哥伦比娅 · 万古潮汐（引力值上限 60）',
      map = '本局每消 1 行积攒 5 点引力值（上限 60）；满值后施放主动变为「引力干涉·满辉」：推层 ×1.5（上限 4 层），单人清底 2 行，并清零引力值。',
      see = 'HUD 引力条 0/60 充能；满时按钮描边变亮 + 浮字「引力干涉·满辉」。',
      verify = '日志 `talent onClear … gravity=…`；cast 返回 n 被放大' },
    { id = 'columbina.lure', kind = 'passive', name = '月诱', gate = 3,
      official = '触发引力干涉时获得月诱：暴击率 +5%，持续 10 秒，至多叠加 3 层。',
      source = '哥伦比娅 · 月亮诱发的疯狂',
      map = '每次满辉干涉 +1 层月诱：每层消行得分 +5%，持续 10 秒，至多 3 层（+15%）。',
      see = 'HUD 三枚月相图标；层数越高，消行分数越亮。',
      verify = '日志 `talent onClear … lure=3 mult=1.150`；state.tal.columbina.lure' },
    { id = 'columbina.law', kind = 'passive', name = '新月自己的法则', gate = 6,
      official = '月之领域内触发月曜反应时，月感电有 33% 概率额外雷击一次（月绽放每 18 秒至多 3 枚山月草露）。',
      source = '哥伦比娅 · 新月自己的法则',
      map = '月之领域内，每次消行有 33% 概率额外给对手推 1 行（可复现随机，日志记 roll）。',
      see = '领域内消行偶尔多出一道波纹，对手盘再多顶一行。',
      verify = '日志 `talent columbina-law proc n=1`' },
    { id = 'columbina.domain', kind = 'passive', name = '她的乡愁 · 月之领域', gate = 9,
      official = '以无秽的新月之名连接山与海，把身边大地短暂变换为月之领域；月曜反应伤害提升 13.0%，持续 20.0 秒。',
      source = '哥伦比娅 · 她的乡愁（属性表：月曜反应伤害提升 13.0% / 领域持续 20.0 秒）',
      map = '施放后 20 秒月之领域：领域内引力值积攒 ×1.13（月曜反应伤害 +13% 的等价换算）。',
      see = 'HUD「月之领域 15.2s」+ 棋盘水波底色；引力条提速 13%。',
      verify = '日志 `talent onClear … gravity=…`（同消行数下数值 ×1.13）；state.tal.columbina.domainT' },
  },
}

-- ===========================================================================
-- M.talents(state, role) -> array
--   角色页渲染用：静态条目 + 当前解锁态 + 实时数值（live 字段）
--   每项追加：unlocked(bool)、lv(角色等级)、live(该天赋当前读数，字符串或数值表)
-- ===========================================================================
M.talents = function(state, role)
  local out = {}
  local base = M.TALENTS[role]
  if not isTable(base) then return out end
  local t = isTable(state) and talOf(state, role) or nil
  local p = M.params(state, role)
  local lv = math.floor(numOr(isTable(state) and state.lv and state.lv[role], 1))
  for i = 1, #base do
    local src = base[i]
    local e = {}
    for k, v in pairs(src) do e[k] = v end
    e.lv = lv
    e.unlocked = (numOr(src.gate, 0) <= lv)
    if src.id == 'nahida.seed' then
      e.live = { left = p.seedLeft, hits = numOr(t and t.seedHits, 0), chain = p.chainRows }
    elseif src.id == 'nahida.wisdom' then
      e.live = { mastery = nahidaMastery(state, role), chain = p.chainRows,
                 dmg = select(1, nahidaPower(state, role)), crit = select(2, nahidaPower(state, role)) }
    elseif src.id == 'nahida.domain' then
      e.live = { left = p.domainLeft, score = p.domainScore, gap = p.seedGap }
    elseif src.id == 'nahida.absorb' then
      e.live = { sec = p.absorbSec, dur = p.aiDur }
    elseif src.id == 'keqing.mark' then
      e.live = { left = p.markLeft, col = p.markCol, cells = M.NUM.KEQING.SLASH_CELLS }
    elseif src.id == 'keqing.yuheng' then
      e.live = { left = p.yhLeft, score = M.NUM.KEQING.YH_SCORE, recharge = M.NUM.KEQING.YH_RECHARGE }
    elseif src.id == 'keqing.stacks' then
      e.live = { stacks = keqingStacks(state, role), each = M.NUM.KEQING.STK_VAL }
    elseif src.id == 'ganyu.lotus' then
      e.live = { left = p.lotusLeft, bloom = M.NUM.GANYU.LOTUS_ROWS, early = M.NUM.GANYU.LOTUS_BROKEN_ROWS }
    elseif src.id == 'ganyu.focus' then
      e.live = { left = numOr(t and t.critWin, 0), bonus = M.NUM.GANYU.FOCUS_BONUS }
    elseif src.id == 'ganyu.field' then
      e.live = { left = p.freezeLeft, gravity = p.gravityMult }
    elseif src.id == 'ganyu.charge' then
      e.live = { charge = p.charge, max = p.chargeMax, rows = M.NUM.GANYU.CHARGE_ROWS }
    elseif src.id == 'columbina.gravity' then
      e.live = { gravity = p.gravity, max = p.gravityMax, full = M.NUM.COLUMBINA.FULL_MULT }
    elseif src.id == 'columbina.lure' then
      e.live = { stacks = p.lure, left = p.lureLeft, each = p.lureBonus }
    elseif src.id == 'columbina.domain' then
      e.live = { left = p.domainLeft, gain = M.NUM.COLUMBINA.DOMAIN_GAIN }
    end
    out[#out + 1] = e
  end
  return out
end

-- ===========================================================================
-- M.talentState(state, role) -> table   实时读数（HUD 数字区 / 角色页「数值」页）
-- ===========================================================================
M.talentState = function(state, role)
  local p = M.params(state, role)
  local t = isTable(state) and talOf(state, role) or nil
  return {
    role = role,
    mult = M.nextMult(state, role),
    seedLeft = p.seedLeft, seedHits = numOr(t and t.seedHits, 0), chainRows = p.chainRows,
    mastery = nahidaMastery(state, role), absorbSec = p.absorbSec,
    domainLeft = p.domainLeft, seedGap = p.seedGap, domainScore = p.domainScore,
    markLeft = p.markLeft, markCol = p.markCol, yuhengLeft = p.yhLeft,
    stacks = keqingStacks(state, role),
    lotusLeft = p.lotusLeft, freezeLeft = p.freezeLeft, charge = p.charge,
    focusLeft = numOr(t and t.critWin, 0), gravityMult = p.gravityMult,
    gravity = p.gravity, gravityMax = p.gravityMax, lure = p.lure, lureLeft = p.lureLeft,
  }
end

return M
