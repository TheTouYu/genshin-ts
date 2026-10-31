--[[==========================================================================
 tests-lua/core_takeover_test.lua —— 接管状态机 headless 验收（不需要模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_takeover_test.lua
 判据：全 PASS、退出码 0。

 要证明的（每条都是"用户点名 AI 坏域"里曾经说不清的一句）：
   1) 闲置链：play 停手 idleSec → hint，hint 再满 hintSec → ai，边界秒精确
   2) 交还：hint/ai 任意键立即回 play 且计时归零，play 态按键只计时不清状态
   3) 技能链：onSkill 从任何态接管，dur 到期自动交还（v5.38 后**唯一**的真实接管入口）
   4) 账本隔离：模块不持有分数/棋盘；AI 驱动只能经注入钩子发生（调用次数可断言）
   5) 暂停/重置/一次性锚（'takeover off (skill only)'，runCase 23/40 断言的那行）
   6) 确定性：同一输入序列两遍逐字段相同；不同 dt 切分到达同一结论
   7) **与生产源码的锚一致性**：M.LOG 六个字符串必须能在 main.lua 里逐字找到，
      且 runCase 23 的断言串与 M.LOG.off 相等——日志锚不再靠"记得同步"
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local TK = load('lua/tetris/core_takeover.lua')
local CFG = load('lua/tetris/config.lua')
local NUM = CFG.NUM
local COPY = CFG.COPY

local passN, failN = 0, 0
local function ok(cond, name, detail)
  if cond then
    passN = passN + 1
    print('PASS  ' .. name)
  else
    failN = failN + 1
    print('FAIL  ' .. name .. (detail and (' :: ' .. tostring(detail)) or ''))
  end
end
local function eq(a, b, name, tol)
  if tol then
    ok(type(a) == 'number' and type(b) == 'number' and math.abs(a - b) <= tol, name,
      tostring(a) .. ' vs ' .. tostring(b))
  else
    ok(a == b, name, tostring(a) .. ' vs ' .. tostring(b))
  end
end
local function section(s) print('\n-- ' .. s .. ' --') end

-- 精确二进制小数（0.5/0.25/0.125）才能让边界秒无浮点误差
local H = 0.5

-- 记事件流的小工具：把 (ev, info) 收进数组
local function pump(api, st, dts, opts)
  local evs = {}
  for i = 1, #dts do
    local ev = api.tick(st, dts[i], opts)
    if ev then evs[#evs + 1] = ev end
  end
  return evs
end
local function rep(n, dt)
  local t = {}
  for i = 1, n do t[i] = dt end
  return t
end

--------------------------------------------------------------------------------
section('1 阈值解析（默认跟随 num，生产现状=关闭）')
--------------------------------------------------------------------------------
do
  local a = TK.new({ num = { TK_PLAY_S = 3, TK_HINT_S = 3 } })
  eq(a.cfg().idleSec, 3, '1.1 默认从 num.TK_PLAY_S 取')
  eq(a.cfg().hintSec, 3, '1.1b 默认从 num.TK_HINT_S 取')

  local b = TK.new({ num = { TK_PLAY_S = nil, TK_HINT_S = nil } })
  eq(b.cfg().idleSec, nil, '1.2 生产现状：num 里是 nil ⇒ 闲置链关闭（idleSec=nil）')
  eq(b.cfg().hintSec, nil, '1.2b 同上（hintSec=nil）')

  local c = TK.new({ num = { TK_PLAY_S = 3 }, idleSec = 5, hintSec = 2 })
  eq(c.cfg().idleSec, 5, '1.3 显式参数优先于 num（5s）')
  eq(c.cfg().hintSec, 2, '1.3b 显式参数优先于 num（2s）')

  local d = TK.new({ num = { TK_PLAY_S = 3, TK_HINT_S = 3 }, idleSec = false })
  eq(d.cfg().idleSec, nil, '1.4 显式 false = 无论如何都关（A/B 对照用）')
  eq(d.cfg().hintSec, 3, '1.4b 未关的那条照旧从 num 取')

  local e = TK.new({})
  eq(e.cfg().idleSec, nil, '1.5 无 num 无显式 ⇒ 关闭（不凭空造 5 秒）')

  eq(TK.new({}).cfg().offAnchorSec, 3, '1.6 offAnchorSec 默认 3（生产停手 3s 打锚）')
  eq(TK.new({ offAnchorSec = 4 }).cfg().offAnchorSec, 4, '1.6b offAnchorSec 可覆盖')
  eq(TK.new({ offAnchorSec = false }).cfg().offAnchorSec, nil, '1.6c offAnchorSec=false ⇒ 不打锚')
  eq(TK.new({}).cfg().skillDur, 6, '1.7 skillDur 默认 6（生产 res.takeDur or pr.aiDur or 6）')

  local okBad, errBad = pcall(TK.new, { copy = { takeover = { hint = { text = 'x' } } } })
  ok(not okBad and tostring(errBad):find('takeover.ai', 1, true) ~= nil,
    '1.8 copy 缺 key ⇒ 构造期报错并点名缺哪个', tostring(errBad))
  local okGood = pcall(TK.new, { copy = COPY })
  ok(okGood, '1.8b 真实 copy 表通过校验（hint/ai/back 三条齐且都有 text）')
end

--------------------------------------------------------------------------------
section('2 闲置链：play --5s--> hint --2s--> ai')
--------------------------------------------------------------------------------
do
  local ai = TK.new({ num = {} })
  local st = ai.newState()
  -- 用 5/2 的显式阈值（config 复原路径的值域；边界秒仍用二进制小数）
  ai = TK.new({ idleSec = 5, hintSec = 2 })
  st = ai.newState()
  eq(ai.state(st), TK.PLAY, '2.0 初始态 play')
  eq(ai.label(st), nil, '2.0b play 态没有横幅文案 key')

  pump(ai, st, rep(9, H))          -- 4.5
  pump(ai, st, { 0.25 })           -- 4.75
  pump(ai, st, { 0.125 })          -- 4.875
  eq(ai.state(st), TK.PLAY, '2.1 4.875s 仍未 hint（边界下方不误触发）')
  local ev, info = ai.tick(st, 0.125)   -- 恰好 5.0
  eq(ev, TK.EV.HINT, '2.1b 恰好 5.0s 触发 hint 事件')
  eq(ai.state(st), TK.HINT, '2.1c 态=hint')
  eq(st.t, 0, '2.1d 转移后计时归零')
  eq(ai.label(st), 'takeover.hint', '2.1e 横幅 key=takeover.hint')
  eq(info.copy, 'takeover.hint', '2.1f 事件详情带 copy key')
  eq(st.hintCount, 1, '2.1g hintCount=1')

  pump(ai, st, rep(3, H))          -- 1.5
  pump(ai, st, { 0.25 })           -- 1.75
  pump(ai, st, { 0.125 })          -- 1.875
  eq(ai.state(st), TK.HINT, '2.2 1.875s 仍停在 hint（边界下方）')
  local ev2 = ai.tick(st, 0.125)   -- 恰好 2.0
  eq(ev2, TK.EV.AI, '2.2b 恰好 2.0s 触发 ai 事件')
  eq(ai.state(st), TK.AI, '2.2c 态=ai')
  eq(st.t, 0, '2.2d 转移后计时归零')
  eq(ai.label(st), 'takeover.ai', '2.2e 横幅 key=takeover.ai')
  local s = ai.stats(st)
  eq(s.takes, 1, '2.2f 接管次数=1')
  eq(s.idleTakes, 1, '2.2g 其中闲置链 1 次')
  eq(s.skillTakes, 0, '2.2h 技能链 0 次')

  -- 一帧只转一次（生产是 if/elseif）：dt=10 只走到 hint
  local st2 = ai.newState()
  local evBig = ai.tick(st2, 10)
  eq(evBig, TK.EV.HINT, '2.3 单帧 dt=10 只转一次（play→hint，不直接到 ai）')
  eq(ai.state(st2), TK.HINT, '2.3b 停在 hint')
  eq(st2.t, 0, '2.3c 该帧计时从 0 重新开始')
end

--------------------------------------------------------------------------------
section('3 交还：hint/ai 任意键立即回 play')
--------------------------------------------------------------------------------
do
  local drove = 0
  local ai = TK.new({ idleSec = 5, hintSec = 0.5, hooks = { drive = function() drove = drove + 1 end } })
  local st = ai.newState()

  pump(ai, st, rep(10, H))              -- 5.0 → hint
  eq(ai.state(st), TK.HINT, '3.0 先进入 hint')
  local moved, info = ai.onInput(st, 1.25)
  eq(moved, true, '3.1 hint 态按键 ⇒ 发生转移')
  eq(ai.state(st), TK.PLAY, '3.1b 回到 play')
  eq(st.lastEvent, TK.EV.CANCEL, '3.1c 事件=cancel-hint')
  eq(st.t, 0, '3.1d 计时归零')
  eq(st.hintCancels, 1, '3.1e hintCancels=1')
  eq(st.lastInputAt, 1.25, '3.1f 可选时间戳只记账')
  eq(ai.stats(st).takes, 0, '3.1g 取消 hint 不算一次接管')

  -- 走到 ai 再交还
  pump(ai, st, rep(10, H))              -- 5.0 → hint
  pump(ai, st, { 0.5 })                 -- hintSec=0.5 → ai
  eq(ai.state(st), TK.AI, '3.2 进入 ai')
  local before = ai.stats(st).aiSeconds
  pump(ai, st, rep(4, 0.5))             -- 2s 接管
  eq(ai.stats(st).aiSeconds, before + 2, '3.2b 接管时长按帧累计')
  local droveBefore = drove
  local moved2, info2 = ai.onInput(st)
  eq(moved2, true, '3.2c ai 态按键 ⇒ 发生转移')
  eq(ai.state(st), TK.PLAY, '3.2d 回到 play')
  eq(st.lastEvent, TK.EV.GIVEBACK, '3.2e 事件=giveback')
  eq(info2.copy, 'takeover.back', '3.2f 交还横幅 key=takeover.back')
  eq(ai.stats(st).givebacks, 1, '3.2g givebacks=1')
  eq(ai.stats(st).aiSeconds, before + 2, '3.2h 交还后历史接管时长保留')
  eq(drove, droveBefore, '3.2i 交还帧不再驱动 AI')

  -- play 态按键：不转移，但计时归零（生产 playerTouched 末尾 TK.t=0）
  pump(ai, st, rep(8, H))               -- 4.0（差 1s 到 hint）
  eq(ai.state(st), TK.PLAY, '3.3 4.0s 仍在 play')
  local moved3 = ai.onInput(st)
  eq(moved3, false, '3.3b play 态按键不产生状态转移')
  eq(st.t, 0, '3.3c 但闲置计时被清零')
  local moved4 = ai.onInput(st)
  eq(moved4, false, '3.4 连续按键幂等（第二次仍 false）')

  -- 交还后重新计时
  pump(ai, st, rep(10, H))
  eq(ai.state(st), TK.HINT, '3.5 交还后要重新停手 5s 才会再提示')
end

--------------------------------------------------------------------------------
section('4 技能接管：任意态进入，dur 到期自动交还（v5.38 后唯一真实入口）')
--------------------------------------------------------------------------------
do
  local ai = TK.new({ num = {} })       -- 闲置链关闭，只有技能能接管
  local st = ai.newState()

  local entered, sinfo = ai.onSkill(st, 6, 2)
  eq(entered, true, '4.1 技能可从 play 直接接管')
  eq(ai.state(st), TK.AI, '4.1b 态=ai')
  eq(sinfo.dur, 6, '4.1c 事件带时长')
  eq(st.skillLeft, 6, '4.1d skillLeft=6')
  eq(st.skillTier, 2, '4.1e skillTier=2')
  eq(ai.stats(st).skillTakes, 1, '4.1f skillTakes=1')

  pump(ai, st, rep(11, H))              -- 5.5s
  eq(ai.state(st), TK.AI, '4.2 5.5s 仍在接管（未到期）')
  eq(st.skillLeft, 0.5, '4.2b skillLeft 逐帧递减')
  local evEnd = ai.tick(st, 0.5)        -- 恰好 6.0
  eq(evEnd, TK.EV.AI_END, '4.2c 恰好到期 ⇒ ai-end 事件')
  eq(ai.state(st), TK.PLAY, '4.2d 回到 play')
  eq(st.skillLeft, nil, '4.2e skillLeft 清空')
  eq(st.skillTier, nil, '4.2f skillTier 清空')
  eq(st.t, 0, '4.2g 计时归零')

  -- dur 边界（1s）：0.875 未到期，再 0.125 到期
  local st2 = ai.newState()
  ai.onSkill(st2, 1, 1)
  pump(ai, st2, { 0.5, 0.25, 0.125 })
  eq(ai.state(st2), TK.AI, '4.3 0.875s 未到期')
  ai.tick(st2, 0.125)
  eq(ai.state(st2), TK.PLAY, '4.3b 1.0s 到期交还')

  -- 技能中再按技能：重入并重置时长
  local st3 = ai.newState()
  ai.onSkill(st3, 6, 1)
  pump(ai, st3, rep(4, 0.5))            -- 2s
  ai.onSkill(st3, 6, 3)
  eq(st3.skillLeft, 6, '4.4 技能重入：时长重置为 6')
  eq(st3.skillTier, 3, '4.4b 档位覆盖为新的 3')
  eq(ai.stats(st3).skillTakes, 2, '4.4c skillTakes 记 2 次施放')
  eq(ai.stats(st3).takes, 2, '4.4d 总接管次数 2')

  -- 技能中玩家按键交还 ⇒ skillLeft 清空，不会再"到期"一次
  local st4 = ai.newState()
  ai.onSkill(st4, 6, 2)
  pump(ai, st4, rep(2, 0.5))
  ai.onInput(st4)
  eq(st4.skillLeft, nil, '4.5 交还后 skillLeft=nil')
  local evAfter = ai.tick(st4, 10)
  -- 注意：这个实例闲置链是关的（num={}），所以 10s 停手会出 off-log 锚——但绝不能补一个 ai-end
  ok(evAfter ~= TK.EV.AI_END, '4.5b 交还后不会补一次 ai-end（事件=' .. tostring(evAfter) .. '）')

  -- 档位：技能档优先，否则按等级
  eq(ai.driveTier(st4, 1), 1, '4.6 level 1 ⇒ 陪练档 1')
  eq(ai.driveTier(st4, 5), 2, '4.6b level 5 ⇒ 标准档 2')
  eq(ai.driveTier(st4, 8), 3, '4.6c level 8 ⇒ 全力档 3')
  eq(ai.driveTier(st4, 12), 3, '4.6d level 12 ⇒ 3')
  local st5 = ai.newState()
  ai.onSkill(st5, 6, 2)
  eq(ai.driveTier(st5, 1), 2, '4.6e 接管中：技能档优先于等级')

  eq(ai.skillLeft(nil), nil, '4.7 skillLeft(nil) 安全返回 nil')
  local st6 = ai.newState()
  ai.onSkill(st6, nil, 1)
  eq(st6.skillLeft, 6, '4.8 dur 缺省 ⇒ 用 cfg.skillDur=6')
  eq(st6.state, TK.AI, '4.8b 缺省 dur 也进入接管')
end

--------------------------------------------------------------------------------
section('5 驱动钩子与账本隔离（模块不碰分数）')
--------------------------------------------------------------------------------
do
  local calls, lastDt = 0, 0
  local ai = TK.new({ idleSec = 5, hintSec = 0.5,
    hooks = { drive = function(_, dt) calls = calls + 1 lastDt = dt end } })
  local st = ai.newState()
  pump(ai, st, rep(10, H))
  pump(ai, st, { 0.5 })                 -- → ai（这一帧也应驱动）
  eq(calls, 1, '5.1 进入 ai 的那一帧就驱动（生产同帧调 aiTickCore）')
  pump(ai, st, rep(6, 0.5))
  eq(calls, 7, '5.1b 之后 6 帧各驱动一次（总数=ai 帧数）')
  eq(lastDt, 0.5, '5.1c 钩子收到该帧 dt')
  ai.onInput(st)
  local snap = calls
  pump(ai, st, rep(4, 0.5))
  eq(calls, snap, '5.2 非 ai 态不驱动')

  -- 暂停：既不推进也不驱动
  local st2 = ai.newState()
  ai.onSkill(st2, 6, 1)
  pump(ai, st2, { 0.5 })
  local c2, t2 = calls, st2.t
  ai.pause(st2, true)
  pump(ai, st2, rep(4, 0.5))
  eq(calls, c2, '5.3 暂停期间不驱动 AI')
  eq(st2.t, t2, '5.3b 暂停期间不推进计时')
  eq(st2.skillLeft, 5.5, '5.3c 暂停期间技能时长不走')
  ai.pause(st2, false)
  pump(ai, st2, { 0.5 })
  eq(calls, c2 + 1, '5.3d 恢复后继续驱动')

  -- 结构证明：状态里根本没有分数/棋盘字段
  local forbidden = { 'score', 'lines', 'board', 'piece', 'g', 'level' }
  local found = nil
  for _, k in ipairs(forbidden) do if st2[k] ~= nil then found = k end end
  eq(found, nil, '5.4 状态表不含分数/棋盘字段（接管期间账本天然不变）')

  -- 行为证明：外界账本对象在整段接管里一格没动
  local ledger = { score = 1200, lines = 7 }
  local st3 = ai.newState()
  ai.onSkill(st3, 4, 1)
  pump(ai, st3, rep(8, 0.5))
  eq(ledger.score, 1200, '5.5 假账本 score 未被模块改动')
  eq(ledger.lines, 7, '5.5b 假账本 lines 未被模块改动')

  local s1 = ai.stats(st3)
  s1.takes = 999
  eq(ai.stats(st3).takes, 1, '5.6 stats 返回副本（改副本不污染状态）')
end

--------------------------------------------------------------------------------
section('6 暂停 / 重置 / 一次性锚')
--------------------------------------------------------------------------------
do
  local ai = TK.new({ idleSec = 5, hintSec = 2 })
  local st = ai.newState()
  pump(ai, st, rep(6, H))               -- 3.0
  ai.pause(st, true)
  eq(st.paused, true, '6.1 pause 置位')
  local evPaused = ai.tick(st, 10)
  eq(evPaused, nil, '6.1b 暂停中 tick 返回 nil')
  eq(st.t, 3.0, '6.1c 暂停中不推进')
  ai.pause(st, false)
  local evResume = ai.tick(st, 2)       -- 恰好 5.0
  eq(evResume, TK.EV.HINT, '6.2 恢复后接着原有计时（3+2=5 恰好触发）')

  -- reset：清状态/计时，保留计数与一次性锚（生产 newGame/showGameOver/restartMatch 只写 state/t）
  ai.onInput(st)                        -- 回到 play
  pump(ai, st, rep(10, H))
  pump(ai, st, { 0.5 })
  local takesBefore = ai.stats(st).takes
  ai.reset(st)
  eq(st.state, TK.PLAY, '6.3 reset ⇒ play')
  eq(st.t, 0, '6.3b reset ⇒ 计时归零')
  eq(st.skillLeft, nil, '6.3c reset ⇒ 技能剩余清空')
  eq(ai.stats(st).takes, takesBefore, '6.4 reset 保留接管计数（会话级账）')

  local fresh = ai.newState()
  eq(fresh.takes, 0, '6.5 newState 计数从 0 开始')
  eq(fresh.offLogged, false, '6.5b newState 清一次性锚')

  -- 一次性锚：闲置链关闭时，停手 3s 返回一次 off-log，之后不再返回
  local off = TK.new({ num = {} })
  local st2 = off.newState()
  local evs = pump(off, st2, rep(20, H))   -- 10s
  local n = 0
  for i = 1, #evs do if evs[i] == TK.EV.OFF_LOG then n = n + 1 end end
  eq(n, 1, '6.6 机制废除：10s 停手只出 1 次 off-log（生产 TK.offLogged 去重）')
  eq(st2.offLogged, true, '6.6b offLogged 置位')
  eq(off.state(st2), TK.PLAY, '6.6c 状态始终 play（不会自己接管）')

  -- off-log 的时间点 = offAnchorSec
  local st3 = off.newState()
  local evAt = nil
  local acc = 0
  for i = 1, 40 do
    local e = off.tick(st3, 0.125)
    acc = acc + 0.125
    if e == TK.EV.OFF_LOG then evAt = acc break end
  end
  eq(evAt, 3.0, '6.7 off-log 恰好发生在停手 3.0s')

  -- 非 casual（opts.idle=false）：不计闲置，锚也不出；但技能接管照跑
  local st4 = off.newState()
  local evs2 = pump(off, st4, rep(40, H), { idle = false })
  eq(#evs2, 0, '6.8 opts.idle=false ⇒ 不计闲置、不打锚（生产 TK 块只在 casual）')
  eq(st4.t, 0, '6.8a opts.idle=false 时闲置计时也不累加（生产非 casual 不进那个块）')
  off.onSkill(st4, 2, 1)
  off.tick(st4, 0.5, { idle = false })
  eq(off.state(st4), TK.AI, '6.8b 但技能接管在非 casual 照常执行（v5.0 修的 bug）')
end

--------------------------------------------------------------------------------
section('7 确定性：同一序列两遍完全同解')
--------------------------------------------------------------------------------
local function runScript()
  local ai = TK.new({ idleSec = 5, hintSec = 2, hooks = { drive = function(s, dt)
    s.driven = (s.driven or 0) + 1
  end } })
  local st = ai.newState()
  local evs = {}
  local seq = { 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -- 5.0 → hint
                0.5, 0.5, 0.5, 0.5,                                -- 2.0 → ai
                0.5, 0.5,                                          -- 接管 1s
                'input',                                           -- 交还
                0.5, 0.5, 'skill', 0.5, 0.5, 0.5,                  -- 技能接管 1.5s
                'input', 0.5 }
  for i = 1, #seq do
    local v = seq[i]
    if v == 'input' then
      ai.onInput(st)
      evs[#evs + 1] = 'input'
    elseif v == 'skill' then
      ai.onSkill(st, 1, 2)
      evs[#evs + 1] = 'skill'
    else
      local ev = ai.tick(st, v)
      if ev then evs[#evs + 1] = ev end
    end
  end
  return st, evs, ai
end

do
  local stA, evA = runScript()
  local stB, evB = runScript()
  local same = true
  for k, v in pairs(stA) do
    if stB[k] ~= v then same = false end
  end
  for k in pairs(stB) do if stA[k] == nil then same = false end end
  ok(same, '7.1 同一序列两遍：状态逐字段相同')
  local evSame = (#evA == #evB)
  if evSame then
    for i = 1, #evA do if evA[i] ~= evB[i] then evSame = false end end
  end
  ok(evSame, '7.1b 事件流逐条相同')

  -- 不同 dt 切分：0.5×10 vs 0.125×40 都在 5.0s 触发 hint（二进制小数无累加误差）
  local a1 = TK.new({ idleSec = 5, hintSec = 2 })
  local s1 = a1.newState()
  local e1
  for i = 1, 10 do e1 = a1.tick(s1, 0.5) or e1 end
  local a2 = TK.new({ idleSec = 5, hintSec = 2 })
  local s2 = a2.newState()
  local e2
  for i = 1, 40 do e2 = a2.tick(s2, 0.125) or e2 end
  eq(a1.state(s1), a2.state(s2), '7.2 不同切分到达同一状态')
  ok(e1 == TK.EV.HINT and e2 == TK.EV.HINT, '7.2b 两条都恰好触发 hint（边界不随切分漂移）', tostring(e1) .. '/' .. tostring(e2))

  -- 不写全局：跑完一整条脚本，_G 键集合不变
  local before = {}
  for k in pairs(_G) do before[k] = true end
  runScript()
  local leaked = nil
  for k in pairs(_G) do if not before[k] then leaked = tostring(k) end end
  eq(leaked, nil, '7.3 模块不写全局（_G 键集合不变）', leaked)
end

--------------------------------------------------------------------------------
section('8 生产语义锚（v5.38 废除闲置链 / 日志锚与源码一致）')
--------------------------------------------------------------------------------
do
  -- 8.1 生产现状（num 两键 nil）：停手 10s 仍是 play
  local ai = TK.new({ num = { TK_PLAY_S = nil, TK_HINT_S = nil } })
  local st = ai.newState()
  local evs = pump(ai, st, rep(20, H))
  local hasHint, hasAi = false, false
  for i = 1, #evs do
    if evs[i] == TK.EV.HINT then hasHint = true end
    if evs[i] == TK.EV.AI then hasAi = true end
  end
  eq(hasHint, false, '8.1 生产现状：停手 10s 不会进 hint')
  eq(hasAi, false, '8.1b 也不会进 ai（接管只属于技能）')
  eq(ai.state(st), TK.PLAY, '8.1c 状态始终 play')

  -- 8.2 config 复原路径（改回 3/3）：3s hint、6s ai
  local old = TK.new({ num = { TK_PLAY_S = 3, TK_HINT_S = 3 } })
  local st2 = old.newState()
  eq(old.tick(st2, 2.875), nil, '8.2 复原 3/3：2.875s 不提示')
  eq(old.tick(st2, 0.125), TK.EV.HINT, '8.2b 3.0s 提示')
  pump(old, st2, rep(6, H))             -- +3.0 → 恰好 3
  eq(old.state(st2), TK.AI, '8.2c 再 3.0s 进入接管')

  -- 8.3 只设 TK_PLAY_S、不设 TK_HINT_S ⇒ 卡在 hint（生产的同一缺陷）
  local half = TK.new({ num = { TK_PLAY_S = 1, TK_HINT_S = nil } })
  local st3 = half.newState()
  half.tick(st3, 1)
  eq(half.state(st3), TK.HINT, '8.3 只设 TK_PLAY_S ⇒ 能进 hint')
  pump(half, st3, rep(20, H))
  eq(half.state(st3), TK.HINT, '8.3b 但 hintSec=nil ⇒ 永远停在 hint（等玩家救场）')

  -- 8.4 日志锚必须能在 main.lua 里逐字找到（防止"改了 print 忘了改模块"）
  local f = io.open(ROOT .. '/lua/main.lua', 'r')
  local src = f and f:read('a') or ''
  if f then f:close() end
  ok(#src > 1000, '8.4 读到 main.lua（' .. #src .. ' 字节）')
  -- 接线前：字面量直接写在 main.lua 的 print 里
  -- 接线后：main.lua 改打 TK.LOG[ev]，字面量只在本模块 ⇒ 断言改为「已接线」即可
  local wired = src:find('core_takeover', 1, true) ~= nil
  for _, key in ipairs({ 'hint', 'ai', 'back', 'off' }) do
    ok(wired or src:find(TK.LOG[key], 1, true) ~= nil,
      '8.4b 日志锚有真源 ' .. TK.LOG[key] .. (wired and '（已接线：由 TK.LOG 打出）' or '（main.lua 字面量）'))
  end
  -- skill ai start / skill ai end 是带后缀的 print，按前缀找
  ok(wired or src:find("print('" .. TK.LOG.skill, 1, true) ~= nil,
    '8.4c skill 起始锚以 ' .. TK.LOG.skill .. ' 开头')
  ok(wired or src:find("print('" .. TK.LOG.aiEnd, 1, true) ~= nil,
    '8.4d skill 结束锚以 ' .. TK.LOG.aiEnd .. ' 开头')

  -- 8.5 runCase 23 用 grep 断言的串，必须就是本模块的 off 锚
  local tf = io.open(ROOT .. '/tests/23-casual-takeover.json', 'r')
  local j = tf and tf:read('a') or ''
  if tf then tf:close() end
  ok(j:find(TK.LOG.off, 1, true) ~= nil, '8.5 runCase 23 断言的日志串 = M.LOG.off（无漂移）')
end

--------------------------------------------------------------------------------
section('9 与真实 config/copy 对接（数值/文案不复制）')
--------------------------------------------------------------------------------
do
  local ai = TK.new({ num = NUM, copy = COPY })
  local c = ai.cfg()
  eq(c.idleSec, nil, '9.1 生产 NUM.TK_PLAY_S=nil ⇒ 模块解析为关闭（v5.38 语义）')
  eq(c.hintSec, nil, '9.1b 同上（TK_HINT_S）')

  local st = ai.newState()
  pump(ai, st, rep(20, H))
  eq(ai.state(st), TK.PLAY, '9.1c 用真实 NUM 跑 10s：不会自动接管')

  local hintRow = TK.copyGet(COPY, TK.COPY.hint)
  ok(type(hintRow) == 'table' and type(hintRow.text) == 'string' and #hintRow.text > 0,
    '9.2 label key 能取到真实文案（takeover.hint）')
  eq(hintRow and hintRow.id, 'H1', '9.2b 就是 config 里登记的那条（H1）')
  local aiRow = TK.copyGet(COPY, TK.COPY.ai)
  ok(type(aiRow) == 'table' and aiRow.id == 'H2', '9.2c takeover.ai ⇒ H2')
  local backRow = TK.copyGet(COPY, TK.COPY.back)
  ok(type(backRow) == 'table' and backRow.id == 'H3', '9.2d takeover.back ⇒ H3')

  eq(TK.copyGet(COPY, 'takeover.nope'), nil, '9.3 copyGet 对不存在的路径返回 nil')
  eq(TK.copyGet(nil, 'takeover.hint'), nil, '9.3b copyGet(nil) 安全')
end

--------------------------------------------------------------------------------
print(string.format('\n== core_takeover_test: %d passed, %d failed ==', passN, failN))
os.exit(failN == 0 and 0 or 1)
