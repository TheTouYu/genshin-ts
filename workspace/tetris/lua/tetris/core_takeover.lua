-- ============================================================================
-- core_takeover.lua —— casual「AI 接管玩家」状态机（纯逻辑，零引擎）
--
-- 真源：lua/main.lua 的 TK 表与三处驱动点（行号仅供定位，接线时按锚字符串搜）：
--   · TK 定义            `local TK = { state = 'play', t = 0, prevState = nil }`
--   · 闲置链（仅 casual）`if not NUM.TK_PLAY_S and TK.state == 'play' and TK.t >= 3 ...`
--   · 接管执行（全模式）  `if TK.state == 'ai' then ... FN.aiTickCore(d, 'stop', tier) ...`
--   · 交还（任意游戏键）  `local function playerTouched() ... TK.t = 0`
--   · 技能入口            `TK.state, TK.t = 'ai', 0; TK.skillTier, TK.skillT = lvIdx, dur`
--   · 技能到期            `if take.t <= 0 then ... TK.state, TK.t = 'play', 0 ...`
--
-- 状态机（两进两出，一条自环）：
--
--        ┌──────── onInput ────────┐            ┌──── onInput ────┐
--        │                         │            │                 │
--     play ──idleSec 无操作──> hint ──hintSec──> ai ──任意键──> play
--        │                         │            │
--        └──── onSkill(dur) ───────┴────────────┘   （技能可从任何态直接接管，到期自动回 play）
--
-- 关键语义（与 v5.38 定版一致）：
--   1. **闲置链默认关闭**：NUM.TK_PLAY_S / TK_HINT_S 都是 nil（用户 2026-10-30 定版：接管权只属于
--      纳西妲 E 技能）。本模块的默认值 = **跟随 num**，所以 `M.new{ num = NUM }` 得到的就是生产
--      现状（永不自动 hint/ai）；要让旧链复活，传 idleSec/hintSec（config 注释里的复原路径）。
--   2. 闲置链**只给 casual 用**（其他模式没有闲置语义）⇒ tick 的第三参 opts.idle 由调用方按 MODE 传。
--      接管执行（ai 段）**所有模式共用**——v5.0 修过这条：技能在 ai-battle/pvp/coop 里置 ai 却没消费方。
--   3. 接管期间消行/分数**照常走玩家账**（裁决⑤）：本模块不持有任何分数/棋盘字段，
--      AI 驱动通过注入钩子 hooks.drive 发生——账本由调用方（main）管，模块碰不到。
--   4. 任意游戏键在 hint/ai 都**立即**回 play，且时间归零（生产 playerTouched 的最后一句）。
--   5. `takeover off (skill only)` 那条一次性日志（v5.40 验收锚，runCase 23/40 断言它）：
--      闲置链关闭时，play 态累积到 offAnchorSec（默认 3s）返回一次 'off-log' 事件，之后不再返回
--      （生产用 TK.offLogged 会话级去重；reset() 不清它，newState() 才清）。
--
-- 纯函数边界：不 print、不碰控件、不读全局、不依赖当前时间（时间只由 dt 推进）、不用随机。
-- 状态是**显式穿透**的（`st` 由调用方持有并传入，本模块只改它的字段），这样 headless 里
-- 「同一输入序列跑两遍」逐字段可复现。数值/文案一律**不复制**：阈值从 num 解析，文案只给 key。
-- ============================================================================

local M = {}

-- 状态名（断言与日志用；不与 main 的字符串耦合）
M.PLAY, M.HINT, M.AI = 'play', 'hint', 'ai'

-- 生产日志锚（main.lua 的 print 原文；runCase 23/40 用 grep 断言这些行）。
-- 集中在这里 => 状态机与回归用例共用一个真源，接线时 print(M.LOG[ev]) 即可，不用再抄字符串。
M.LOG = {
  hint    = 'takeover hint',
  ai      = 'takeover ai',
  back    = 'takeover back',
  off     = 'takeover off (skill only)',
  aiEnd   = 'skill ai end',
  skill   = 'skill ai start',
}

-- 事件名（tick/onInput 的返回；调用方按事件决定打印哪条日志/放哪条横幅）
M.EV = {
  HINT     = 'hint',      -- play → hint（闲置链，横幅 hint）
  AI       = 'ai',        -- hint → ai（闲置链，横幅 ai）
  AI_END   = 'ai-end',    -- 技能接管到期 → play（横幅清空）
  OFF_LOG  = 'off-log',   -- 闲置链关闭时的一次性锚（打印 M.LOG.off）
  GIVEBACK = 'giveback',  -- 玩家键把控制权拿走（ai → play，横幅 back）
  CANCEL   = 'cancel-hint', -- 玩家键取消 hint（hint → play，无横幅）
  SKILL    = 'skill',     -- 技能接管（任意态 → play）
}

-- 文案 key（不复制文本：调用方拿 key 去 CFG.COPY 里取；M.copyGet 提供取值助手）
M.COPY = { hint = 'takeover.hint', ai = 'takeover.ai', back = 'takeover.back' }

-- 阈值解析：显式参数 > num 表 > 关闭（nil）
--   显式传 false 表示"无论如何都关"，即使 num 里有值（用于 A/B 对照）
local function pick(explicit, num, key)
  if explicit == false then return nil end
  if explicit ~= nil then return explicit end
  if num ~= nil then return num[key] end
  return nil
end

-- M.new{ num=NUM, copy=CFG.COPY, idleSec=, hintSec=, offAnchorSec=3, skillDur=6, hooks={drive=} }
function M.new(spec)
  spec = spec or {}
  local num = spec.num
  local C = {
    idleSec     = pick(spec.idleSec, num, 'TK_PLAY_S'),
    hintSec     = pick(spec.hintSec, num, 'TK_HINT_S'),
    offAnchorSec = (spec.offAnchorSec == nil) and 3 or spec.offAnchorSec,
    skillDur    = spec.skillDur or 6,
    hooks       = spec.hooks or {},
  }
  if C.offAnchorSec == false then C.offAnchorSec = nil end

  -- copy 表可选：给了就校验三个 key 真实存在（文案表回归闸门；不让接线时静默丢文案）
  if spec.copy ~= nil then
    local tk = spec.copy.takeover
    if type(tk) ~= 'table' then
      error('core_takeover: copy.takeover 缺失（应有 hint/ai/back 三条）')
    end
    for _, n in ipairs({ 'hint', 'ai', 'back' }) do
      local row = tk[n]
      if type(row) ~= 'table' or type(row.text) ~= 'string' then
        error('core_takeover: copy.takeover.' .. n .. ' 缺失或没有 text')
      end
    end
  end

  local api = {}

  -- 解析后的阈值（接线/测试都可读；idleSec=nil 表示闲置链关闭）
  function api.cfg()
    return { idleSec = C.idleSec, hintSec = C.hintSec,
             offAnchorSec = C.offAnchorSec, skillDur = C.skillDur }
  end

  -- 全新状态（= 新一局；offLogged 也清空）
  function api.newState()
    return {
      state = M.PLAY, t = 0, paused = false,
      -- 计数（本模块新增的可观测账；生产 main.lua 里没有这些数）
      takes = 0, idleTakes = 0, skillTakes = 0, aiSeconds = 0,
      hintCount = 0, hintCancels = 0, givebacks = 0,
      -- 来源与一次性锚
      source = nil, prevState = nil, offLogged = false, lastEvent = nil, lastInputAt = nil,
      -- 技能接管剩余秒（nil = 当前不是技能接管）
      skillLeft = nil, skillTier = nil,
    }
  end

  -- 推时间。返回 事件, 事件详情 | nil
  --   opts.idle = false ⇒ 本帧不计闲置（非 casual 模式）：生产里整个闲置块被 `if MODE == 'casual'` 包住
  function api.tick(st, dt, opts)
    if not st or st.paused then return nil end
    dt = dt or 0
    if dt < 0 then dt = 0 end
    local idle = (opts == nil) or (opts.idle ~= false)

    local s0 = st.state
    -- 生产里 TK.t 只在 casual 块内累加（非 casual 走不进那个块）⇒ 这里同样由 idle 门控
    if idle or s0 == M.AI then st.t = st.t + dt end
    local ev, info

    -- ① 状态转移（按本帧进入前的状态判定；一帧最多一次，与生产的 if/elseif 一致）
    if s0 == M.PLAY and idle then
      if C.idleSec == nil then
        -- v5.38/v5.40：机制废除时只在停手 offAnchorSec 处打一行锚，且只打一次
        if C.offAnchorSec and st.t >= C.offAnchorSec and not st.offLogged then
          st.offLogged = true
          ev, info = M.EV.OFF_LOG, { at = st.t }
        end
      elseif st.t >= C.idleSec then
        st.state, st.t = M.HINT, 0
        st.hintCount = st.hintCount + 1
        st.source = 'idle'
        ev, info = M.EV.HINT, { from = M.PLAY, to = M.HINT, copy = M.COPY.hint }
      end
    elseif s0 == M.HINT and idle then
      -- hintSec 为 nil ⇒ 停在 hint 等玩家（生产里 hint 态没有别的出口）
      if C.hintSec ~= nil and st.t >= C.hintSec then
        st.state, st.t = M.AI, 0
        st.takes, st.idleTakes = st.takes + 1, st.idleTakes + 1
        st.source = 'idle'
        ev, info = M.EV.AI, { from = M.HINT, to = M.AI, source = 'idle', copy = M.COPY.ai }
      end
    elseif s0 == M.AI then
      -- 技能接管的到期（生产在 skillTick 里推 FN.SK.take.t，到 0 交还）
      if st.skillLeft ~= nil then
        st.skillLeft = st.skillLeft - dt
        if st.skillLeft <= 0 then
          st.skillLeft, st.skillTier, st.source = nil, nil, nil
          st.state, st.t = M.PLAY, 0
          ev, info = M.EV.AI_END, { from = M.AI, to = M.PLAY }
        end
      end
    end

    -- ② 接管执行（全模式共用；生产是 FN.aiTickCore(d, 'stop', tier)）
    --    注意：进入 ai 的那一帧也驱动（生产同帧就调 aiTickCore）
    if st.state == M.AI then
      st.aiSeconds = st.aiSeconds + dt
      st.prevState = M.AI
      if C.hooks.drive then C.hooks.drive(st, dt) end
    else
      st.prevState = nil
    end

    if ev then st.lastEvent = ev end
    return ev, info
  end

  -- 玩家按任意游戏键。返回 是否发生转移, 详情 | nil
  --   t 是可选时间戳，只记进 lastInputAt，不参与判据（保证确定性）
  function api.onInput(st, t)
    if not st then return false end
    if t ~= nil then st.lastInputAt = t end
    local from = st.state
    st.t = 0                                     -- 生产 playerTouched 末尾的 TK.t = 0
    if from == M.AI then
      st.state, st.t = M.PLAY, 0
      st.skillLeft, st.skillTier, st.source = nil, nil, nil
      st.givebacks = st.givebacks + 1
      st.lastEvent = M.EV.GIVEBACK
      return true, { from = M.AI, to = M.PLAY, copy = M.COPY.back }
    elseif from == M.HINT then
      st.state = M.PLAY
      st.hintCancels = st.hintCancels + 1
      st.source = nil
      st.lastEvent = M.EV.CANCEL
      return true, { from = M.HINT, to = M.PLAY, copy = M.COPY.hint }
    end
    return false
  end

  -- 技能接管（纳西妲 E「所闻遍计」）。任何态都可进入；dur 秒后自动交还。
  function api.onSkill(st, dur, tier)
    if not st then return false end
    local d = tonumber(dur)
    if d == nil then d = C.skillDur end
    if d < 0 then d = 0 end
    st.state, st.t = M.AI, 0
    st.skillLeft, st.skillTier = d, tier
    st.source = 'skill'
    st.takes, st.skillTakes = st.takes + 1, st.skillTakes + 1
    st.lastEvent = M.EV.SKILL
    return true, { to = M.AI, dur = d, tier = tier }
  end

  function api.state(st)
    return st and st.state or M.PLAY
  end

  -- 当前态对应的文案 key（play 态没有横幅 ⇒ nil）
  function api.label(st)
    local s = api.state(st)
    if s == M.HINT then return M.COPY.hint end
    if s == M.AI then return M.COPY.ai end
    return nil
  end

  -- 计数快照（返回副本；改副本不影响状态）
  function api.stats(st)
    if not st then return nil end
    return {
      state = st.state, t = st.t,
      takes = st.takes, idleTakes = st.idleTakes, skillTakes = st.skillTakes,
      aiSeconds = st.aiSeconds, hintCount = st.hintCount,
      hintCancels = st.hintCancels, givebacks = st.givebacks,
      offLogged = st.offLogged, source = st.source, skillLeft = st.skillLeft,
    }
  end

  -- 局结束/重开（newGame / showGameOver / restartMatch 三处的等价物）：
  -- 只清状态与计时，**不清计数与 offLogged**（生产这三处也只写 state/t ⇒ 锚保持会话级一次性）
  function api.reset(st)
    if not st then return st end
    st.state, st.t = M.PLAY, 0
    st.source, st.prevState = nil, nil
    st.skillLeft, st.skillTier = nil, nil
    st.lastEvent = nil
    return st
  end

  -- 暂停（说明页/结算层/非 guideStage==1 时调用）：不推进、不驱动
  function api.pause(st, on)
    if not st then return st end
    st.paused = not not on
    return st
  end

  -- 接管档位（生产 ai 段的 tier 选择）：技能档优先，否则按等级 1/2/3
  --   level >= 8 → 3（全力）· level >= 5 → 2（标准）· 其余 1（陪练）
  function api.driveTier(st, level)
    if st and st.state == M.AI and st.skillTier ~= nil then return st.skillTier end
    local lv = tonumber(level) or 1
    if lv >= 8 then return 3 end
    if lv >= 5 then return 2 end
    return 1
  end

  -- 技能接管剩余秒（非技能接管时 nil）
  function api.skillLeft(st)
    return st and st.skillLeft or nil
  end

  return api
end

-- 按点号路径取文案表里的条目（'takeover.hint' → copy.takeover.hint）。
-- 只在测试/接线处用作「key 真的能取到文本」的证明——本模块不持有任何文案。
function M.copyGet(copy, path)
  if type(copy) ~= 'table' or type(path) ~= 'string' then return nil end
  local cur = copy
  for seg in path:gmatch('[^%.]+') do
    if type(cur) ~= 'table' then return nil end
    cur = cur[seg]
  end
  return cur
end

return M
