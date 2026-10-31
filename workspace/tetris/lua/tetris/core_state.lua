--[[==========================================================================
 tetris/core_state.lua —— 局内状态表 + 纯 reducer（core_*：零引擎、零全局）
 ----------------------------------------------------------------------------
 逐字搬自 main.lua 的玩法纯逻辑段：
   1070-1078 collides     1080-1117 spawn        1118-1262 clearLines
   1263-1355 doLock       1361-1376 stepDown     1380-1398 moveBy
   1403-1427 rotate       1436-1489 newGame      6035-6055 硬降
   6539-6584 tickInstance 的重力 + 锁定延迟推进
 ----------------------------------------------------------------------------
 为什么这样切：这些函数以前全是闭包，状态藏在 30+ 个脚本全局里，一个规则 bug 只能靠
 「跑一遍模拟器（387s/70 例）看日志」。搬进纯 reducer 后，同一件事在 lua5.3 里 50ms 出结论
 （docs/ARCH.md §0）。所以本模块**不 print、不碰控件、不做音效/文案**——它只改传入的状态表
 并返回事件列表；日志 / 音效 / 渲染 / AI 记账全部由接线方按事件播。
 ----------------------------------------------------------------------------
 状态表（普通表，与 main 的实例表 g 的玩法子集同名字段；接线时直接挂进 g 或替换 g）：
   board, score, lines, level, combo, maxCombo, b2b, pieceCount, gameOver,
   piece = { name, n, color, cells, x, y } | nil,
   nextName, nextBag, bagQ, bagSeq,
   ld = { t = -1, resets = 0 },   das = { dir, t, arr, hold },
   lastRot, st = { name, bag, can },   -- st = Hold 槽（与 main 的 g.st 同名）
   dryness, flashT, elapsed, tickCount, acc,
   pieceAge, pieceMoved, pieceRotated, hardDrop
 ----------------------------------------------------------------------------
 事件（返回的数组，顺序即 main 日志的输出顺序；每条形如 { kind = ..., ... }）：
   { kind='move',   x }                        -- main: print('move x=' .. x) / sfx move
   { kind='fall',   y, manual }                -- main: 下落一格（manual ⇒ 软降分已加）
   { kind='rotate', name }                     -- main: print('rotate ' .. name) / sfx
   { kind='ldstart' }                          -- main: print('ldstart')（用例 17 的锚）
   { kind='harddrop', rows, y }                -- main: print('harddrop rows=' .. rows)
   { kind='lock',   name, cells, hard, moved, rotated }
                                               -- main: print('lock X cells=196,175,…')
   { kind='clear',  n, rows, score, lines, level, levelUp, combo, b2b, maxCombo }
                                               -- main: print('clear n=2 score=… lines=… combo=… b2b=…')
                                               -- score = 本次 gain（天赋倍率前的账；见 hooks.onClear）
   { kind='garbage', n, reason }               -- 机制A 干燥垃圾：main 调 raiseGarbage(g,1)（跨盘/技能侧）
   { kind='tspin',  lines, bonus }             -- main: print('tspin corners>=3 lines=… bonus=…')
   { kind='spawn',  name, bag, x, y, holdswap }-- main: print('bag=… piece=… x=… y=…')
   { kind='gameover', score }                  -- main: print('gameover score=…') / showGameOver
 ----------------------------------------------------------------------------
 接口：
   S = M.new{ pieces=…, board=…, rng=…, num=CFG.NUM, cols=10, rows=20,
              holeRng=…, kicks=…, gravityMult=fn, hooks={ onLock=fn, onClear=fn } }
   S.newState()                     -> 全新状态表（未开局）
   S.newGame(opts)                  -> state, events         （opts.state 可原地重置该表）
   S.move(s, dx)                    -> events, ok
   S.rotate(s, dir)                 -> events, ok            （dir 缺省 1 = 顺时针）
   S.softDrop(s)                    -> events, ok
   S.hardDrop(s)                    -> events, rows
   S.tickGravity(s, dt)             -> events                （含锁定延迟推进）
   S.lockAndClear(s)                -> events
   S.spawn(s, overrideName, overrideBag) -> events           （Hold 换出块走这里）
   S.stepDown(s, manual)            -> events                （重力/软降共用的单步）
   S.collides(s, cells, x, y)       -> boolean               （aieval 的 opts.collides 直接给这个）
 ----------------------------------------------------------------------------
 ⚠ 语义陷阱（接线前必读，都是"看着能顺手改、改了就不是原语义"的地方）：
   1. **combo 先自增，再用它算加成**；而 base×level 与 combo 加成用的都是**升级前**的
      level（main.lua:1147-1157 都是先 combo++、再 level 更新在 1192）⇒ 消行当帧
      跨级不加速。把 level 更新提到 gain 之前会改掉 tests/11 的分数链。
   2. **T-spin 加成用的是升级后的 level**（main.lua:1326 在 clearLines 之后）——
      和陷阱 1 正好相反，不要把两处统一。
   3. **失配的账本**：现网 g.score/g.AI.score 是两套账（autoDriving 时进 AI 账，
      main.lua:1174）。本模块只认一个 score；接线方按事件的 score 自己分流，
      并且 **AI 记账不能回写 s.score**，否则玩家账会被 AI 自演污染。
   4. **dryness 在现网挂在 g.AI.dryness**（main.lua:1311-1315），不是 g.dryness。
      本模块用 s.dryness。接线时要嘛把 main 的读写口改成 s.dryness，要嘛在
      newGame 后把 g.AI.dryness 映射回来——两处各写一份必然漂移。
   5. **硬降分写的是玩家账**（main.lua:6128 `g.score = g.score + dropped*NUM.HARD`），
      即便 AI 盘也如此；AI 自己走 aiDrop 不经过这里。本模块按"盘账"累加，语义一致。
   6. **锁定延迟只在玩家路径存在**：AI 的 aiDrop 直调 doLock（main.lua:4708 注释）。
      本模块的 ldc 推进放在 tickGravity 里；AI 盘接线时不要调 tickGravity，
      否则 AI 会白等 0.5s（手感/节奏全变）。
   7. **锁定时要清 lastRot / ld / das.t/arr / st.can**（main.lua:1292-1295），
      其中 das.hold **故意不清**（跨块累计兜 Up 丢失，见 main.lua:1295 注释）。
=======================================================================]]

local M = {}

local DEFAULT_STEP = 1 / 60

function M.new(spec)
  spec = spec or {}
  local P = assert(spec.pieces, 'core_state: 需要 spec.pieces（core_pieces 实例）')
  local B = assert(spec.board, 'core_state: 需要 spec.board（core_board 实例）')
  local R = assert(spec.rng, 'core_state: 需要 spec.rng（core_rng 实例）')
  local NUM = assert(spec.num, 'core_state: 需要 spec.num（config.NUM）')
  local COLS = assert(spec.cols, 'core_state: 需要 spec.cols')
  local ROWS = assert(spec.rows, 'core_state: 需要 spec.rows')
  local STEP = spec.step or DEFAULT_STEP
  local hooks = spec.hooks or {}
  local kicks = spec.kicks                        -- nil ⇒ core_pieces 的 NO_KICK（现网语义）
  -- 洞位随机源：现网障碍行/垃圾行都用 aiRand（main.lua:1467 / 2087），**不是**出块 LCG。
  -- 缺省退回 rng 只是为了让单测能跑；接线时必须注入 aiRand 的实例，否则出块序列会被改。
  local holeRng = spec.holeRng or R
  local gravityMult = spec.gravityMult            -- 可选：甘雨冻结重力倍率（main.lua:6578）

  local S = {}

  local function collides(s, cells, x, y)
    return B.collides(s.board, cells, x, y)
  end

  function S.newState()
    return {
      board = B.newBoard(),
      score = 0, lines = 0, level = 1,
      combo = 0, maxCombo = 0, b2b = false,
      pieceCount = 0, gameOver = false,
      piece = nil, nextName = nil, nextBag = nil,
      bagQ = {}, bagSeq = 0,
      ld = { t = -1, resets = 0 },
      das = { dir = 0, t = 0, arr = 0, hold = 0 },
      lastRot = false,
      st = { name = nil, bag = 0, can = true },
      dryness = 0, flashT = 0,
      elapsed = 0, tickCount = 0, acc = 0,
      pieceAge = 0, pieceMoved = false, pieceRotated = false, hardDrop = false,
    }
  end

  -- ===== spawn（main.lua:1080-1116）=====
  -- overrideName 是 Hold 换出的块：**不消耗 bag 队列**、沿用入槽时的袋序（日志加 holdswap=1）。
  local function spawn(s, overrideName, overrideBag, ev)
    ev = ev or {}
    local name = overrideName or s.nextName or 'T'
    local nameBag = overrideBag or s.nextBag
    if not overrideName then s.nextName, s.nextBag = R.take(s.bagQ) end
    if R.bagSeq then s.bagSeq = R.bagSeq end
    -- 每块重置"这一块做过什么"的标记（供 keqing 四叠 / ganyu 蓄力判定；main.lua:1088）
    s.pieceMoved, s.pieceRotated, s.hardDrop = false, false, false
    s.pieceAge = 0
    s.piece = {
      name = name, n = P.nOf(name), color = P.colorOf(name),
      cells = P.cellsOf(name),
      x = P.spawnX(name), y = 1,
    }
    ev[#ev + 1] = { kind = 'spawn', name = name, bag = nameBag, x = s.piece.x, y = s.piece.y,
      holdswap = (overrideName ~= nil) and true or false }
    s.ld.t, s.ld.resets, s.lastRot = -1, 0, false
    if collides(s, s.piece.cells, s.piece.x, s.piece.y) then
      s.gameOver = true
      ev[#ev + 1] = { kind = 'gameover', score = s.score }
    end
    return ev
  end

  -- ===== doLock + clearLines（main.lua:1263-1360 / 1118-1262）=====
  -- 前置：s.piece 必须在场。返回事件；调用方（重力/软降/硬降/锁定延迟）只播事件。
  local lockAndClear

  lockAndClear = function(s, ev)
    ev = ev or {}
    local piece = s.piece
    if not piece then return ev end

    -- T-spin 3 角判定在**写盘前**做（角占用看的是锁定前盘面；main.lua:1264-1276）
    local isTspin = false
    if piece.name == 'T' and s.lastRot then
      if B.cornerCount(s.board, piece.x, piece.y) >= 3 then isTspin = true end
    end

    local landed = B.lock(s.board, piece.cells, piece.x, piece.y, piece.color)
    s.pieceCount = s.pieceCount + 1
    s.st.can = true                      -- 锁定即恢复 Hold（每次落子仅可换一次）
    s.ld.t, s.ld.resets = -1, 0
    s.lastRot = false
    s.das.t, s.das.arr = 0, 0            -- 注意：das.hold **不清**（陷阱 7）
    ev[#ev + 1] = { kind = 'lock', name = piece.name, cells = landed,
      hard = s.hardDrop == true, moved = s.pieceMoved == true, rotated = s.pieceRotated == true }

    -- v6 天赋落块结算：必须在 clearLines 之前（main.lua:1296-1303）
    if hooks.onLock then hooks.onLock(s, piece, ev) end

    s.piece = nil                        -- 锁定即离场；后续 spawn 换新块
    local cleared, removed = B.clearRows(s.board)
    local gain, b2bApplied = 0, false
    if cleared > 0 then
      s.flashT = NUM.FLASH[cleared] or NUM.FLASH[4]
      s.combo = s.combo + 1
      if s.combo > s.maxCombo then s.maxCombo = s.combo end
      local base = NUM.SCORE[cleared]
      b2bApplied = (cleared == 4 and s.b2b)          -- 连击/四消状态在算分前读，再更新
      if b2bApplied then base = base * NUM.B2B_NUM // NUM.B2B_DEN end   -- 800 → 1200
      s.b2b = (cleared == 4)
      local comboBonus = 0
      if s.combo >= 2 then comboBonus = NUM.COMBO * (s.combo - 1) * s.level end
      gain = base * s.level + comboBonus             -- ⚠ 陷阱 1：用升级前的 level
      -- 天赋倍率（main.lua:1159-1173：gain = floor(gain × mult + bonus)，相加不相乘）
      if hooks.onClear then
        local mult, bonus = hooks.onClear(s, cleared,
          { level = s.level, combo = s.combo, b2b = b2bApplied, rows = removed })
        if mult ~= nil then
          gain = math.floor(gain * (tonumber(mult) or 1) + (tonumber(bonus) or 0))
        end
      end
      s.score = s.score + gain
      s.lines = s.lines + cleared
      local levelBefore = s.level
      s.level = s.lines // NUM.LEVEL_UP_LINES + 1
      if s.level > NUM.LEVEL_CAP then s.level = NUM.LEVEL_CAP end
      ev[#ev + 1] = { kind = 'clear', n = cleared, rows = removed, score = gain,
        lines = s.lines, level = s.level, levelUp = s.level > levelBefore,
        combo = s.combo, b2b = b2bApplied, maxCombo = s.maxCombo }
    end

    -- 机制A 干燥垃圾（main.lua:1305-1322）：**只发事件**，垫行由接线方做
    -- （它要跨盘、要过技能冻结、还要把当前块上抬——都不是本模块的职责）
    do
      local seg = s.level >= 9 and 3 or s.level >= 5 and 2 or 1
      local N = NUM.DRYNESS_N[seg] or 14
      if cleared > 0 then
        s.dryness = 0
      else
        s.dryness = s.dryness + 1
        if s.dryness >= N then
          s.dryness = 0
          ev[#ev + 1] = { kind = 'garbage', n = 1, reason = 'dryness' }
        end
      end
    end

    -- T-spin 加成（main.lua:1323-1336）：⚠ 陷阱 2，用**升级后**的 level
    if isTspin then
      local bonus = NUM.TSPIN_BONUS * cleared * s.level
      if bonus > 0 then s.score = s.score + bonus end
      ev[#ev + 1] = { kind = 'tspin', lines = cleared, bonus = bonus }
    end

    -- 没消行的锁定打断连击 / B2B（main.lua:1337-1340）
    if cleared == 0 then
      s.combo = 0
      s.b2b = false
    end

    if not s.gameOver then spawn(s, nil, nil, ev) end
    return ev
  end

  -- ===== 下落一格（main.lua:1361-1376）=====
  -- manual=true = 玩家按的（↓/S/手机↓）：成功下落才给软降分；重力必须传 false。
  local function stepDown(s, manual, ev)
    ev = ev or {}
    if s.gameOver or not s.piece then return ev end
    if not collides(s, s.piece.cells, s.piece.x, s.piece.y + 1) then
      s.piece.y = s.piece.y + 1
      if manual then s.score = s.score + NUM.SOFT end
      ev[#ev + 1] = { kind = 'fall', y = s.piece.y, manual = manual and true or false }
    else
      if manual then
        lockAndClear(s, ev)              -- 主动落：触底即时锁定（旧手感）
      elseif s.ld.t < 0 then
        s.ld.t = 0                       -- 重力触底：启动锁定延迟（tickGravity 推进）
        ev[#ev + 1] = { kind = 'ldstart' }
      end
    end
    return ev
  end

  -- 锁定延迟重置（main.lua:1388-1396 / 1418-1425）：上限 LD_RESETS 次，超限强制锁定
  local function bumpLockDelay(s, ev)
    if s.ld.t >= 0 then
      if s.ld.resets < NUM.LD_RESETS then
        s.ld.resets = s.ld.resets + 1
        s.ld.t = 0
        return false
      end
      lockAndClear(s, ev)
      return true
    end
    return false
  end

  -- ===== 左右移动（main.lua:1380-1398）=====
  function S.move(s, dx)
    local ev = {}
    if s.gameOver or not s.piece then return ev, false end
    s.pieceMoved = true                  -- ⚠「尝试」语义：调用即置位（main.lua:6105），不是成功后置位
    if collides(s, s.piece.cells, s.piece.x + dx, s.piece.y) then return ev, false end
    s.piece.x = s.piece.x + dx
    s.lastRot = false                    -- T-spin 要求"最后动作是旋转"
    ev[#ev + 1] = { kind = 'move', x = s.piece.x }
    local forced = bumpLockDelay(s, ev)
    return ev, true, forced
  end

  -- ===== 旋转（main.lua:1403-1427）=====
  function S.rotate(s, dir)
    local ev = {}
    if s.gameOver or not s.piece then return ev, false end
    s.pieceRotated = true                -- 同上：尝试语义
    local nc, nx, ny = P.rotateWithKicks(s.piece.cells, s.piece.n, dir or 1,
      s.piece.x, s.piece.y,
      function(cells, x, y) return collides(s, cells, x, y) end, kicks)
    if not nc then return ev, false end  -- 无踢墙（默认）⇒ 撞了就放弃，行为同现网
    s.piece.cells, s.piece.x, s.piece.y = nc, nx, ny
    s.lastRot = true
    ev[#ev + 1] = { kind = 'rotate', name = s.piece.name }
    bumpLockDelay(s, ev)
    return ev, true
  end

  -- ===== 软降（main.lua:1361-1376 的 manual 分支）=====
  function S.softDrop(s)
    local ev = {}
    if s.gameOver or not s.piece then return ev, false end
    stepDown(s, true, ev)
    return ev, true
  end

  -- ===== 硬降（main.lua:6119-6129）=====
  -- 注意 hardDrop 标记要在下落**之前**置位（天赋判定 hard= 读它）
  function S.hardDrop(s)
    local ev = {}
    if s.gameOver or not s.piece then return ev, 0 end
    s.hardDrop = true
    local dropped = B.dropRows(s.board, s.piece.cells, s.piece.x, s.piece.y)
    s.piece.y = s.piece.y + dropped
    s.score = s.score + dropped * NUM.HARD
    ev[#ev + 1] = { kind = 'harddrop', rows = dropped, y = s.piece.y }
    lockAndClear(s, ev)
    return ev, dropped
  end

  -- ===== 重力 + 锁定延迟推进（main.lua:6538-6584）=====
  -- 顺序与现网一致：**先推进锁定延迟，再推进重力累加**。
  function S.tickGravity(s, dt)
    local ev = {}
    if s.ld.t >= 0 and not s.gameOver then
      s.ld.t = s.ld.t + dt
      if s.ld.t >= NUM.LD_DELAY then
        s.ld.t = -1
        if s.piece and collides(s, s.piece.cells, s.piece.x, s.piece.y + 1) then
          lockAndClear(s, ev)
        end
      end
    end
    s.acc = s.acc + dt
    local guard = 0
    while s.acc >= STEP and guard < 8 do
      s.acc = s.acc - STEP
      guard = guard + 1
      s.tickCount = s.tickCount + 1
      s.pieceAge = (tonumber(s.pieceAge) or 0) + STEP
      local perTicks = NUM.SPEED[s.level] or NUM.SPEED[NUM.LEVEL_CAP]
      if gravityMult then
        local m = tonumber(gravityMult(s)) or 1
        if m > 1 then perTicks = math.max(1, math.floor(perTicks * m)) end
      end
      if not s.gameOver and s.tickCount % perTicks == 0 then
        stepDown(s, false, ev)           -- 重力不加软降分（数值策划 §7-P6 的坑）
      end
    end
    return ev
  end

  -- ===== 新一局（main.lua:1436-1489）=====
  -- 只重置**玩法**字段；结算层/抖动/HUD 等表现态由接线方自己清（那不属于 core）。
  function S.newGame(opts)
    opts = opts or {}
    local s = opts.state or S.newState()
    local ev = {}
    s.board = B.newBoard()
    s.score, s.lines, s.level = 0, 0, 1
    s.pieceCount = 0
    s.combo, s.maxCombo, s.b2b = 0, 0, false
    s.elapsed = 0
    s.gameOver, s.tickCount, s.acc = false, 0, 0
    s.dryness = 0
    s.flashT = 0
    s.pieceAge = 0
    s.pieceMoved, s.pieceRotated, s.hardDrop = false, false, false
    -- 机制B 开局障碍行（main.lua:1459-1474 等价搬运）。
    -- ⚠ 陷阱：现网这段在 g.level = 1 之后执行 ⇒ seg 恒为 1 ⇒ NUM.OBSTACLE[1] = 0
    --   ⇒ **一行都不会生成**（死分支）。这里保留原样，不改行为；要不要真开是产品决定。
    do
      local seg = s.level >= 11 and 4 or s.level >= 8 and 3 or s.level >= 5 and 2 or 1
      local rows = NUM.OBSTACLE[seg] or 0
      if rows > 0 then
        local holesPer = { 0, 2, 2, 1 }
        for i = 1, rows do
          local r = ROWS - rows + i        -- 从下往上填
          local holes = {}
          for h = 1, (holesPer[i] or 1) do holes[holeRng.rand(COLS)] = true end
          for c = 1, COLS do s.board[r][c] = holes[c] and B.empty or (spec.garbageColor or 0) end
        end
      end
    end
    s.bagQ, s.bagSeq = {}, 0
    if R.reset then R.reset() end          -- 每局重洗 7-bag（首袋排 S/Z 开局）
    s.st.name, s.st.bag, s.st.can = nil, 0, true
    s.ld.t, s.ld.resets = -1, 0
    s.lastRot = false
    s.piece = nil
    s.nextName, s.nextBag = R.take(s.bagQ)
    if R.bagSeq then s.bagSeq = R.bagSeq end
    spawn(s, nil, nil, ev)
    return s, ev
  end

  -- 显式暴露给接线方：Hold 换出块、重力单步、aieval 的 collides 契约
  S.spawn = function(s, overrideName, overrideBag) return spawn(s, overrideName, overrideBag) end
  S.stepDown = function(s, manual) return stepDown(s, manual) end
  S.collides = collides
  S.lockAndClear = lockAndClear

  return S
end

return M
