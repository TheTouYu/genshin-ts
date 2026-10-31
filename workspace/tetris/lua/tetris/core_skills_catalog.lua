--[[==========================================================================
  tetris/core_skills_catalog.lua —— 角色技能「表现/配置数据」（v6.1 重构 P1）
  ---------------------------------------------------------------------------
  为什么存在：规则核心（core_skills.lua）只出机制（kind / rows / sec / col / id），
  一个中文字都不出。但「玩家看到的那个技能」= 名字 + 图标色 + 文案 + 特效 + 音效 +
  日志锚，这些东西现在散在 skills.lua 的 TALENTS 表、copy.lua 的 ROLES 表、
  main.lua 的 FN.skillFeedback 里 —— 改一处漏三处。本文件是**唯一的表现索引**：
  规则给一个 id，表现只在本表里查。

  硬边界（与 core_skills.lua 同一套）
    · 不 require：copy / num / config / talents 全部注入
      `M.new{ copy = COPY, num = NUM, config = CFG, talents = SKILLS.TALENTS }`
    · 不碰引擎、不 print、不读写外部状态（纯查表 + 纯格式化）
    · **不复制数值**：所有阈值都是注入表里的**同一个值**（引用），不是抄一遍的数字。
      改平衡只改 copy.lua / skills.NUM / config.lua，本文件自动跟着走。
    · 唯一允许的「字面量」是文案与日志锚模板 —— 因为它们是契约：
      ARCH §8「日志字面量是测试契约，可以包装，不可改原文」。
      旧 skills.lua 的 anchor 字符串逐字保留在 ANCHOR 里；tests-lua 有逐字对拍。

  ---------------------------------------------------------------------------
  【对外契约】
    M.new(spec) -> cat
    cat.role(role)        -> { role, name, element, title, skill, skillDesc, color, color2,
                               accent, glow, keys = {…} }   -- 全部引用 copy.ROLES
    cat.roles()           -> array（顺序 = 注入的 NUM.ROLES）
    cat.color(role) / cat.color2(role) / cat.accent(role) / cat.glow(role)
    cat.skillName(role) / cat.skillDesc(role) / cat.roleName(role)
    cat.reasonKey(code)   -> 'skill.reason.cd'（文案键；文案本体在 copy.lua）
    cat.failKey(role, code)   -> 'copy.roles.<role>.fail.<code>'
    cat.failLines(role, code) -> copy.ROLES[role].fail[code] 原表（引用，不复制）
    cat.talents(role)     -> array：{ id, role, index, kind, gate, name, official, map,
                                      see, verify, fx, sfx, color, keys }
    cat.talent(id)        -> 单条（id 不存在返回 nil）
    cat.label(id)         -> 天赋中文名（来自注入的 talents 表）
    cat.buffLabel(id)     -> HUD 状态行标签（'蕴种印' 等；迁移期从旧 skills.lua 搬来）
    cat.effectLabel(e)    -> 效果专属标签（'雷暴连斩' 等），未定义返回 nil
    cat.anchor(effect)    -> 该效果应打印的日志锚（**逐字等于旧实现**）；未定义返回 nil
    cat.fx(id) / cat.sfx(id) / cat.icon(id)
    cat.thresholds(role)  -> 阈值表（**全部是注入表的引用**：cd / cost / 各持续秒数 …）
    cat.ui                -> config.lua 的尺寸引用（cell / gap / skillW / skillH）

  【effect 的 id/phase 从哪来】
    core_skills 的 effect 带 id（天赋稳定 id）与 phase（同一天赋的不同相位，例：
    冰莲 'early' 提前绽放 / 'bloom' 自然绽放；雷楔 'slash'；蕴种印 'push'/'clear'；
    新月法则 'law'；少女满辉 'full'）。ANCHOR 与 LABEL 都按 `id|phase` 索引。
========================================================================]]

local M = {}

M.VERSION = 'v6.1-catalog'

-- ===========================================================================
-- 表现表（本文件唯一的数据；改了要同步 tests-lua 的逐字对拍组）
-- ===========================================================================

-- 每个天赋的图标色/特效/音效（color 缺省 = 取 copy.ROLES[role].color）
M.FX = {
  ['nahida.active']    = { fx = 'vine',  sfx = 'skill' },
  ['nahida.seed']      = { fx = 'vine',  sfx = 'talent' },
  ['nahida.wisdom']    = { fx = 'vine',  sfx = 'talent' },
  ['nahida.domain']    = { fx = 'leaf',  sfx = 'talent' },
  ['nahida.absorb']    = { fx = 'leaf',  sfx = 'talent' },

  ['keqing.active']    = { fx = 'bolt',  sfx = 'skill' },
  ['keqing.mark']      = { fx = 'bolt',  sfx = 'talent' },
  ['keqing.longpress'] = { fx = 'bolt',  sfx = 'skill' },
  ['keqing.yuheng']    = { fx = 'ring',  sfx = 'talent' },
  ['keqing.stacks']    = { fx = 'ring',  sfx = 'talent' },

  ['ganyu.active']     = { fx = 'frost', sfx = 'skill' },
  ['ganyu.lotus']      = { fx = 'frost', sfx = 'talent' },
  ['ganyu.focus']      = { fx = 'frost', sfx = 'talent' },
  ['ganyu.field']      = { fx = 'frost', sfx = 'talent' },
  ['ganyu.charge']     = { fx = 'frost', sfx = 'talent' },

  ['columbina.active'] = { fx = 'wave',  sfx = 'skill' },
  ['columbina.gravity'] = { fx = 'wave', sfx = 'talent' },
  ['columbina.lure']   = { fx = 'moon',  sfx = 'talent' },
  ['columbina.law']    = { fx = 'wave',  sfx = 'talent' },
  ['columbina.domain'] = { fx = 'wave',  sfx = 'talent' },
}

-- HUD 状态行标签（旧 skills.M.buffs 里的中文字面量；接线后旧字面量删除）
M.BUFF_LABEL = {
  ['nahida.seed'] = '蕴种印', ['nahida.domain'] = '摩耶之殿',
  ['keqing.mark'] = '雷楔', ['keqing.yuheng'] = '玉衡之贵', ['keqing.stacks'] = '雷伤叠层',
  ['ganyu.field'] = '天地交泰', ['ganyu.lotus'] = '冰莲', ['ganyu.focus'] = '唯此一心',
  ['ganyu.charge'] = '霜华',
  ['columbina.domain'] = '月之领域', ['columbina.lure'] = '月诱',
}

-- 效果专属标签（旧 skills.lua 里 eff(..., label, ...) 的字面量）
M.EFFECT_LABEL = {
  ['nahida.seed'] = '灭净三业',
  ['keqing.mark'] = '雷暴连斩',
  ['columbina.law'] = '新月自己的法则',
  ['ganyu.lotus|early'] = '冰莲·提前绽放',
  ['ganyu.lotus|bloom'] = '冰莲·绽放',
}

-- 日志锚（**逐字等于旧 skills.lua**；tests-lua 有对拍组）
-- 这些行是 tests/ 里 runner 用例的断言对象，措辞不可改（ARCH §8）。
M.ANCHOR = {
  ['nahida.seed|push'] = function(e)
    return string.format('talent nahida-seed push n=%d', e.rows)
  end,
  ['nahida.seed|clear'] = function(e)
    return string.format('talent nahida-seed clear n=%d', e.rows)
  end,
  ['keqing.mark|slash'] = function(e)
    return string.format('talent keqing-slash col=%d n=%d', e.col, e.rows)
  end,
  ['ganyu.lotus|early'] = function(e)
    return string.format('talent ganyu-lotus early n=%d', e.rows)
  end,
  ['ganyu.lotus|bloom'] = function(e)
    return string.format('talent lotus bloom n=%d', e.rows)
  end,
  ['columbina.law|law'] = function(e)
    return string.format('talent columbina-law proc n=%d', e.rows)
  end,
}

-- 角色 -> 天赋 id 顺序（结构数据；与注入的 talents 表对照，不一致时以注入表为准并记 issue）
M.IDS = {
  nahida    = { 'nahida.active', 'nahida.seed', 'nahida.wisdom', 'nahida.domain', 'nahida.absorb' },
  keqing    = { 'keqing.active', 'keqing.mark', 'keqing.longpress', 'keqing.yuheng',
                'keqing.stacks' },
  ganyu     = { 'ganyu.active', 'ganyu.lotus', 'ganyu.focus', 'ganyu.field', 'ganyu.charge' },
  columbina = { 'columbina.active', 'columbina.gravity', 'columbina.lure', 'columbina.law',
                'columbina.domain' },
}

-- id -> 角色（反查；也用于「天赋 id 前缀 = 角色名」这一约定的兜底）
M.ROLE_OF = {}
for role, list in pairs(M.IDS) do
  for i = 1, #list do M.ROLE_OF[list[i]] = role end
end

-- id|phase -> 文案键（表现层给角色页/HUD 用的稳定键）
local function keyOf(id, phase)
  return 'talent.' .. tostring(id) .. (phase and phase ~= '' and ('.' .. phase) or '')
end

-- ===========================================================================
-- M.new(spec) -> cat
-- ===========================================================================
M.new = function(spec)
  spec = spec or {}
  local COPY = spec.copy
  local NUM = spec.num
  local CFG = spec.config
  local TALENTS = spec.talents

  local cat = { version = M.VERSION, copy = COPY, num = NUM, config = CFG }

  local function copyRole(role)
    if type(COPY) ~= 'table' or type(role) ~= 'string' then return nil end
    local E = COPY.ROLES
    if type(E) ~= 'table' then return nil end
    return E[role]
  end

  local function numTable(x)
    return type(x) == 'table' and x or {}
  end

  -- -------------------------------------------------------------------------
  -- 角色级表现（全部引用 copy.ROLES 的字段，不复制值）
  -- -------------------------------------------------------------------------
  cat.roles = function()
    local out = {}
    local list = numTable(NUM).ROLES
    if type(list) == 'table' then
      for i = 1, #list do out[#out + 1] = list[i] end
    end
    return out
  end

  cat.role = function(role)
    local e = copyRole(role)
    if not e then
      return { role = role, name = tostring(role), element = '', title = '', skill = '',
               skillDesc = '', color = 0, color2 = 0, accent = 0, glow = 0,
               keys = { name = 'copy.roles.' .. tostring(role) .. '.name' } }
    end
    return {
      role = role,
      name = e.name, element = e.element, title = e.title,
      skill = e.skill, skillDesc = e.skillDesc,
      color = e.color, color2 = e.color2, accent = e.accent, glow = e.glow,
      keys = {
        name = 'copy.roles.' .. role .. '.name',
        element = 'copy.roles.' .. role .. '.element',
        title = 'copy.roles.' .. role .. '.title',
        skill = 'copy.roles.' .. role .. '.skill',
        desc = 'copy.roles.' .. role .. '.skillDesc',
        help = 'copy.roles.' .. role .. '.help',
        tips = 'copy.roles.' .. role .. '.tips',
        cast = 'copy.roles.' .. role .. '.cast',
        hold = 'copy.roles.' .. role .. '.hold',
        fail = 'copy.roles.' .. role .. '.fail',
      },
    }
  end

  cat.color = function(role)
    local e = copyRole(role)
    return (e and e.color) or 0
  end
  cat.color2 = function(role)
    local e = copyRole(role)
    return (e and e.color2) or 0
  end
  cat.accent = function(role)
    local e = copyRole(role)
    return (e and e.accent) or 0
  end
  cat.glow = function(role)
    local e = copyRole(role)
    return (e and e.glow) or 0
  end
  cat.roleName = function(role)
    local e = copyRole(role)
    return (e and e.name) or tostring(role)
  end
  cat.skillName = function(role)
    local e = copyRole(role)
    return (e and e.skill) or ''
  end
  cat.skillDesc = function(role)
    local e = copyRole(role)
    return (e and e.skillDesc) or ''
  end

  -- -------------------------------------------------------------------------
  -- 门禁文案（键 + copy 里的原文；文案本体只在 copy.lua）
  -- -------------------------------------------------------------------------
  cat.reasonKey = function(code)
    return 'skill.reason.' .. tostring(code)
  end

  cat.failKey = function(role, code)
    return 'copy.roles.' .. tostring(role) .. '.fail.' .. tostring(code)
  end

  cat.failLines = function(role, code)
    local e = copyRole(role)
    local f = e and e.fail
    if type(f) ~= 'table' then return nil end
    return f[tostring(code)]
  end

  -- -------------------------------------------------------------------------
  -- 天赋：静态文案（注入的 talents 表）+ 本文件的表现（fx/sfx/icon/color）
  --   talents 缺省时按 M.IDS 兜底（id 可查，文案为空 —— 不崩）
  -- -------------------------------------------------------------------------
  local function talentsOf(role)
    local T = numTable(TALENTS)[role]
    if type(T) == 'table' and #T > 0 then return T end
    local ids = M.IDS[role]
    if type(ids) ~= 'table' then return {} end
    local out = {}
    for i = 1, #ids do out[i] = { id = ids[i] } end
    return out
  end

  local function fxOf(id)
    return M.FX[tostring(id)] or {}
  end

  cat.fx = function(id)
    return fxOf(id).fx
  end
  cat.sfx = function(id)
    return fxOf(id).sfx
  end
  cat.icon = function(id)
    return fxOf(id).icon or fxOf(id).fx
  end

  cat.talents = function(role)
    local T = talentsOf(role)
    local out = {}
    for i = 1, #T do
      local src = T[i]
      local id = src.id
      local fx = fxOf(id)
      out[#out + 1] = {
        id = id, role = role, index = i,
        kind = src.kind or 'passive',
        gate = src.gate or 0,
        name = src.name or id,
        official = src.official or '',
        map = src.map or '',
        see = src.see or '',
        verify = src.verify or '',
        fx = fx.fx, sfx = fx.sfx, icon = fx.icon or fx.fx,
        color = cat.color(role),
        keys = { name = keyOf(id, nil), text = keyOf(id, nil) },
      }
    end
    return out
  end

  cat.talent = function(id)
    if type(id) ~= 'string' then return nil end
    local role = M.ROLE_OF[id]
    if not role then
      -- 兜底：id 前缀就是角色名
      local pre = string.match(id, '^(%a+)%.')
      role = pre and M.ROLE_OF[tostring(pre) .. '.active'] and pre or nil
    end
    if not role then return nil end
    local list = cat.talents(role)
    for i = 1, #list do
      if list[i].id == id then return list[i] end
    end
    return nil
  end

  cat.label = function(id)
    local t = cat.talent(id)
    return (t and t.name) or tostring(id)
  end

  cat.buffLabel = function(id)
    return M.BUFF_LABEL[tostring(id)] or cat.label(id)
  end

  cat.effectLabel = function(e)
    if type(e) ~= 'table' then return nil end
    local k = tostring(e.id) .. '|' .. tostring(e.phase or '')
    return M.EFFECT_LABEL[k] or M.EFFECT_LABEL[tostring(e.id)] or nil
  end

  -- -------------------------------------------------------------------------
  -- 日志锚（旧 skills.lua 的 ev.anchor 逐字复刻；未定义的 id/phase 返回 nil）
  -- -------------------------------------------------------------------------
  cat.anchor = function(e)
    if type(e) ~= 'table' then return nil end
    local f = M.ANCHOR[tostring(e.id) .. '|' .. tostring(e.phase or '')]
    if type(f) ~= 'function' then return nil end
    local ok, s = pcall(f, e)
    if not ok then return nil end
    return s
  end

  cat.anchorKey = function(id, phase)
    return 'anchor.' .. tostring(id) .. (phase and phase ~= '' and ('.' .. phase) or '')
  end

  -- -------------------------------------------------------------------------
  -- 阈值：**全部是注入表的引用**（同表同值；测试用 rawequal/== 核对）
  -- -------------------------------------------------------------------------
  cat.thresholds = function(role)
    local N = numTable(NUM)
    local CD = numTable(N.CD)
    local COST = numTable(N.COST)
    if role == 'nahida' then
      local X = numTable(N.NAHIDA)
      return {
        cd = CD.nahida, energyCost = COST.nahida,
        tierCapStart = X.TIER_CAP_START, takeDur = X.TAKE_DUR,
        seedDur = X.SEED_DUR, triggerGap = X.TRIGGER_GAP,
        triggerGapDomain = X.TRIGGER_GAP_DOMAIN, domainDur = X.DOMAIN_DUR,
        masteryBase = X.MASTERY_BASE, masteryPerLine = X.MASTERY_PER_LINE,
        dmgStep = X.DMG_STEP, dmgCap = X.DMG_CAP, critCap = X.CRIT_CAP,
        absorbRatio = X.ABSORB_RATIO, absorbCap = X.ABSORB_CAP,
      }
    elseif role == 'keqing' then
      local X = numTable(N.KEQING)
      return {
        cd = CD.keqing, energyCost = COST.keqing,
        markLife = X.MARK_LIFE, blinkCd = X.BLINK_CD, lock = X.LOCK,
        slashCells = X.SLASH_CELLS, longPress = X.LONG_PRESS,
        yuhengDur = X.YH_DUR, yuhengScore = X.YH_SCORE, yuhengRecharge = X.YH_RECHARGE,
        stackVal = X.STK_VAL, stackMax = X.STK_MAX, stackDur = X.STK_DUR,
      }
    elseif role == 'ganyu' then
      local X = numTable(N.GANYU)
      return {
        cd = CD.ganyu, energyCost = COST.ganyu,
        freezeRows = X.FREEZE_ROWS, freezeSec = X.FREEZE_SEC,
        lotusLife = X.LOTUS_LIFE, lotusRows = X.LOTUS_ROWS,
        lotusBrokenRows = X.LOTUS_BROKEN_ROWS, clutchH = X.CLUTCH_H,
        focusWindow = X.FOCUS_WINDOW, focusBonus = X.FOCUS_BONUS,
        fieldGravity = X.FIELD_GRAVITY,
        chargeWindow = X.CHARGE_WINDOW, chargeMax = X.CHARGE_MAX, chargeRows = X.CHARGE_ROWS,
      }
    elseif role == 'columbina' then
      local X = numTable(N.COLUMBINA)
      return {
        cd = CD.columbina, energyCost = COST.columbina,
        layers = X.LAYERS, layerCap = X.LAYER_CAP, ldCut = X.LD_CUT,
        pressureH = X.PRESSURE_H, pressureAdd = X.PRESSURE_ADD,
        gravityMax = X.GRAVITY_MAX, gravityPerLine = X.GRAVITY_PER_LINE,
        fullMult = X.FULL_MULT, fullSoloAdd = X.FULL_SOLO_ADD,
        lureMax = X.LURE_MAX, lureBonus = X.LURE_BONUS, lureDur = X.LURE_DUR,
        lawChance = X.LAW_CHANCE, domainLife = X.DOMAIN_LIFE, domainGain = X.DOMAIN_GAIN,
        clearRows = X.CLEAR_ROWS, soloCost = X.SOLO_COST,
      }
    end
    return {}
  end

  -- config.lua 的尺寸引用（技能卡/图标布局；同样是引用不是副本）
  local CFGt = numTable(CFG)
  cat.ui = {
    cell = CFGt.CELL, gap = CFGt.GAP,
    skillW = CFGt.SKILL_W, skillH = CFGt.SKILL_H,
  }

  return cat
end

return M
