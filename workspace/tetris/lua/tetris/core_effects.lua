--[[==========================================================================
 tetris/core_effects.lua —— effect 的「施加层」：effect → 棋盘/状态变化 + 事件
 ----------------------------------------------------------------------------
 core_*：零引擎、零全局、零 print、不 require 任何 tetris 模块（数值/尺寸靠注入）。
 读者：接 main.lua 技能链的人、改天赋机制的人、写下一层测试的人。

 **这个文件补的是「读侧没人」的洞**：v6 技能域有 5 条机制断链，它们不是没实现，
 而是算出来的量没有任何消费方（详见 docs/refactor-contract-tests.md 与 D733/D739）：
   ① `SK.gravityMult`   只读不写（甘雨天地交泰 ×1.20 从不生效）
   ② `SK.freezeRows`    只写只打印（冻结行数无消费方）
   ③ `mark-blink`       只 print（雷楔二段不瞬移、不清列）
   ④ `SK.cost`          全仓 0 写（能量门槛 UI 不可见）
   ⑤ `holdCutMs`        只被角色页展示（少女削锁定延迟不生效）
 本模块的解法不是改文案，而是把「施加」这一层做成纯函数，并且**让每个门禁量都有
 具名访问器与到期逻辑**（gates + tick）：施加时写进去，游戏循环/HUD 读得出来。

 ----------------------------------------------------------------------------
 一、状态形状（只认普通表；能直接包住 main 的 g）
   state = {
     board = { [r][c] = 0|非0 },     -- r=1..ROWS（1=顶行），c=1..COLS，与 core_board 同口径
     piece = { cells={{r,c},…}, x=列, y=行, color=… } | nil,   -- cells 为 1 基相对坐标
     gates = { … },                  -- 本模块独有的门禁区，缺省由 E.gates(state) 惰性建
     role  = 'ganyu' | nil,          -- 该盘归属（可选；applyTo 用它做归属校验）
   }
   注意：**本模块不写 state.board 以外的 main 字段**（score/lines/piece 的锁定/出块
   仍归游戏循环）。blink 只把块挪到落点，**不写盘、不置 nil**——调用方照它的 doLock
   走，消行/加分/出块一套逻辑不重复实现。

 二、门禁区 gates（**这就是「读侧」**）
   gravityMult    number  重力间隔倍率，无冻结时恒 1              ← 补断链①
   freezeRows     number  冻结行数（HUD/特效消费）                ← 补断链②
   freezeLeft     number  冻结剩余秒                              ← 补断链②
   garbageBlocked bool    冻结期不吃垃圾（addGarbage 读它）        ← 补断链②
   moveLockMs     number  禁止横移剩余毫秒（blink.lockSec 产出）   ← 雷楔禁横移
   lockDelayCutMs number  对手锁定延迟削减毫秒                     ← 补断链⑤
   lockDelayCutLeft number 上述削减的剩余秒（0 = 不自动到期）
   takeOverSec/Tier number AI 接管时长/档位
   cost           number  施放能量门槛（**由 core_skills 写、HUD 读**；本模块只透传）← 断链④

 三、五个 effect 的语义（**逐条写死，别按名字猜**）
   clearBottom{n}    删盘底 n 行（最底行先删），上方整体下移 n 行、顶部补空。
                     = 旧 dispatchEffect 'clear-bottom'（shiftUp）与 main 涟漪单人分支。
                     **对玩家有利**（栈顶远离盘顶 n 行）。
   clearTop{n}       删**绝对盘顶** n 行（行 1..n），下方整体上移 n 行、底部补空。
                     = 旧 dispatchEffect 'clear-top'（shiftDown）。名字与实现一致，
                     但见四、②：绝对盘顶几乎总是空的 ⇒ 净效果是把盘面推高 n 行。
   clearStackTop{n}  **新语义（修冰莲自伤）**：找到当前栈最高的被占用行 top，把
                     top..top+n-1 区间的行清空（置 0），其余行**不位移**。
                     结果=栈变矮 n 行、盘面不会变高。这才是「清掉盘顶 3 行」的玩家意图。
   clearColumn{col,n} 从该列盘底往上清 n 个非空格（= 旧 'clear-col' / 雷暴连斩）。
   addGarbage{n,holeOf} 底部垫 n 行带 1 洞垃圾（= raiseGarbage / core_board.addGarbage）；
                     若当前块被顶到，按旧语义上抬到不碰撞（最多到 y=1）。
                     **冻结期直接拒绝**（canReceiveGarbage=false），不改盘。
   freeze{rows,sec}  写 gates.freezeRows/freezeLeft/garbageBlocked 与 gravityMult。
   gravityClear{n}   = clearBottom 的别名（少女单人「清盘底」按涟漪表现发出来）。
   blink{col,lockSec} 见五（lead 点名要写细）。
   blinkBest{}       选「列高最小、同高取左」的列，再走 blink。
   markBlink{col,n}  雷楔二段：先 blink 到雷楔列落底，再清该列底部 n 格。
   holdCut{ms,sec}   写对手盘 gates.lockDelayCutMs（少女削锁定延迟）。
   takeOver{tier,sec} 写 gates.takeOverSec/Tier（AI 接管；无棋盘变化）。

 四、与旧 dispatchEffect 的差异（**旧实现里就是错的**，测试组 14 逐条对拍）
   ① 旧 'clear-bottom' 用 shiftUp 删底行 → 与本模块 clearBottom 等价（**对**）。
   ② 旧 'clear-top'   用 shiftDown 删绝对顶行 → 与本模块 clearTop 等价（名字对），
      但**用它的天赋是冰莲「绽放清掉盘顶 3 行」**：盘顶几乎总是空的 ⇒ 3 次 shiftDown
      只是把整盘**推高 3 行**（LOTUS_ROWS=3），玩家被自己的天赋推死。修法=改用
      clearStackTop（机制修复，不是文案修复）。
   ③ 旧 'clear-col' 从底往上清 n 个非空格 → 与 clearColumn 等价（**对**）。
   ④ 旧 garbage-push 在接线上先判 `MODE=='casual'` 再降级成 clear-bottom（判定散在
      调用点）；本模块把降级留给 applyTo 的 `degrade`，并额外在**施加时**判冻结门禁
      （旧实现写在 raiseGarbage 里且写死 `target == G[1]` ⇒ pvp 的 P2 永远不受保护）。
   ⑤ 旧 blink 自己 doLock（消行/加分/出块混在施加里）且**不做落点合法性重建**
      （逐格横移，撞墙就停，可能停在错的列）；本模块只挪块到落点并返回 landY，
      锁定交给调用方，且目标列被占时按「最近可用列」snap。
   ⑥ 旧 mark-blink 只有一行 print（雷楔二段完全没有机制）；本模块真的瞬移+清列。
   ⑦ 旧 free/gravityMult 从 `SK.freezeT` 全局读，pvp 两盘共用一份；本模块 gates
      是**每盘一份**，applyTo 按 target 选盘。

 五、blink{col, lockSec} 的精确语义（lead 点名）
   前置：state.piece 必须存在，否则 {ok=false, reason='no-piece'}，盘面不变。
   1) 列：col 缺省 = 当前列；越界按 1..COLS 夹紧（result.clamped=true）。
   2) 落点合法性：若目标列在**当前 y** 就碰撞（该列已经堆到出生高度），按「距离最近、
      同距离取左」在 1..COLS 内找一列能放下（result.snapped=true, result.wantCol=原目标）；
      全列都放不下 → {ok=false, reason='blocked'}，盘面不变。
   3) 落底：y 逐行下探到 collides 为止（与硬降/硬降落点同口径），得 landY。
   4) **只改 state.piece.x/.y**（瞬移=直接赋值，不是逐格横移），不写盘、不置 nil。
      result = { ok, col, landY, dropped, fromY, wantCol, snapped, clamped, moveLockMs }
   5) lockSec > 0 ⇒ gates.moveLockMs = ceil(lockSec*1000)，事件 {kind='moveLock', ms}。
      **门禁值怎么被消费**：`E.canMove(state)` 在 moveLockMs>0 时返回 false，输入层
      的横移/软降分支先问它；`E.tick(state, dt)` 递减并在归零时发 {kind='moveLockEnd'}。
      因为瞬落的块当帧就会被调用方 doLock 锁定，这段僵直实际落在**下一块**的头
      100~200ms（这正是旧 KEQING.LOCK「瞬移后短暂禁止横移」的本意，旧代码零消费方）。
      若要的是「落底后延迟锁定」（另一读法），那是 `gates.softLockMs`，本模块不实现：
      锁定延迟属游戏循环，加在这里会制造第二份真源。

 六、接口
   E = M.new{ rows=ROWS, cols=COLS, num=SKILLS.NUM, fill=CFG.COL_GRAY }
   E.newState{ board?, piece?, role? }        -> state（含 gates 默认值）
   E.newBoard()                               -> rows×cols 的空矩阵
   E.gates(state)                             -> gates（惰性创建/补齐）
   E.gravityMult(state) / E.freezeRows(state) / E.lockDelayCut(state)
   E.canMove(state) / E.canReceiveGarbage(state) / E.canTakeOver(state)
   E.collides(board,cells,x,y) / E.dropRows(board,cells,x,y) / E.landY(board,cells,x,y)
   E.stackTop(board) / E.colHeight(board,col) / E.emptyCol(board)
   E.apply(state, effect)                     -> events, result
   E.applyTo(pair, effect)                     -> events, result（pair={self=,opp=}）
   E.applyAll(state, effects)                 -> events, results
   E.tick(state, dt)                          -> events（门禁倒计时/到期）
   E.normalize(kind)                          -> 规范 kind 或 nil（吃旧 kebab 写法）
=======================================================================]]

local M = {}

M.VERSION = 'v6.1-core'

-- 规范 kind（camelCase；与 core_skills.KIND 对齐，另加本模块新增的 clearStackTop）
M.KIND = {
  clearBottom   = 'clearBottom',
  clearTop      = 'clearTop',
  clearStackTop = 'clearStackTop',
  clearColumn   = 'clearColumn',
  addGarbage    = 'addGarbage',
  freeze        = 'freeze',
  gravityClear  = 'gravityClear',
  blink         = 'blink',
  blinkBest     = 'blinkBest',
  markBlink     = 'markBlink',
  holdCut       = 'holdCut',
  takeOver      = 'takeOver',
}

-- 旧词 → 规范词（吃 skills.lua 老 kebab 写法，接线时不必先改 core_skills）
M.ALIAS = {
  ['clear-bottom'] = 'clearBottom',
  ['clear-top']    = 'clearTop',
  ['clear-stack-top'] = 'clearStackTop',
  ['clear-col']    = 'clearColumn',
  ['clear-column'] = 'clearColumn',
  ['garbage-push'] = 'addGarbage',
  ['add-garbage']  = 'addGarbage',
  ['gravity-clear'] = 'gravityClear',
  ['blink-best']   = 'blinkBest',
  ['mark-blink']   = 'markBlink',
  ['hold-cut']     = 'holdCut',
  ['ai-takeover']  = 'takeOver',
}

-- 失败原因词表（与 core_skills.REASON 风格一致，可拼 i18n key）
M.REASON = {
  ok           = 'ok',
  badState     = 'bad-state',
  unknownKind  = 'unknown-kind',
  noPiece      = 'no-piece',
  blocked      = 'blocked',
  noTarget     = 'no-target',
  frozen       = 'frozen',        -- 冻结期拒绝接收垃圾
  noHole       = 'no-hole',       -- addGarbage 缺洞位来源（不猜，避免静默变化）
  empty        = 'empty',         -- clearStackTop 空盘
}

function M.normalize(kind)
  if type(kind) ~= 'string' or kind == '' then return nil end
  if M.KIND[kind] then return kind end
  local a = M.ALIAS[kind]
  if a then return a end
  return nil
end

local function clampInt(v, lo, hi)
  v = math.floor(tonumber(v) or lo)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end

local function numOr(v, d)
  local n = tonumber(v)
  if n == nil then return d end
  return n
end

function M.new(spec)
  spec = spec or {}
  local ROWS = math.floor(tonumber(spec.rows) or 0)
  local COLS = math.floor(tonumber(spec.cols) or 0)
  assert(ROWS > 0, 'core_effects: 需要 spec.rows（config.ROWS）')
  assert(COLS > 0, 'core_effects: 需要 spec.cols（config.COLS）')
  local NUM  = spec.num          -- 可缺省；缺省时冻结不写 gravityMult 的保守值
  local FILL = spec.fill or 0    -- 垃圾填充值（config.COL_GRAY），缺省 0=不填
  local EMPTY = spec.empty or 0

  local E = { rows = ROWS, cols = COLS }

  ------------------------------------------------------------------ 基础工具
  function E.newBoard()
    local board = {}
    for r = 1, ROWS do
      local row = {}
      for c = 1, COLS do row[c] = EMPTY end
      board[r] = row
    end
    return board
  end

  local function emptyRow()
    local row = {}
    for c = 1, COLS do row[c] = EMPTY end
    return row
  end

  -- 与 core_board.collides 逐字同口径：左右越界、底部越界算碰撞；**顶部越界不算**
  function E.collides(board, cells, px, py)
    if type(board) ~= 'table' or type(cells) ~= 'table' then return true end
    for i = 1, #cells do
      local br = py + cells[i][1] - 1
      local bc = px + cells[i][2] - 1
      if bc < 1 or bc > COLS or br > ROWS then return true end
      if br >= 1 and board[br] and board[br][bc] ~= EMPTY then return true end
    end
    return false
  end

  function E.dropRows(board, cells, px, py)
    local n = 0
    while not E.collides(board, cells, px, py + n + 1) do n = n + 1 end
    return n
  end

  function E.landY(board, cells, px, py)
    return py + E.dropRows(board, cells, px, py)
  end

  function E.colHeight(board, col)
    local h = 0
    for r = 1, ROWS do
      if board[r] and board[r][col] ~= EMPTY then h = h + 1 end
    end
    return h
  end

  -- 当前栈最高的被占用行（空盘返回 nil）
  function E.stackTop(board)
    for r = 1, ROWS do
      for c = 1, COLS do
        if board[r] and board[r][c] ~= EMPTY then return r end
      end
    end
    return nil
  end

  -- 最空的一列：列高最小者；同高取靠左（确定性，不用随机）
  function E.emptyCol(board)
    local best, bestH = 1, -1
    for c = 1, COLS do
      local h = E.colHeight(board, c)
      if bestH < 0 or h < bestH then bestH, best = h, c end
    end
    return best, bestH
  end

  ------------------------------------------------------------------ 状态与门禁
  local function defaultGates()
    return {
      gravityMult = 1,
      freezeRows = 0,
      freezeLeft = 0,
      garbageBlocked = false,
      moveLockMs = 0,
      lockDelayCutMs = 0,
      lockDelayCutLeft = 0,
      takeOverSec = 0,
      takeOverTier = 0,
      cost = 0,
    }
  end

  function E.newState(opts)
    opts = opts or {}
    local st = {
      board = opts.board or E.newBoard(),
      piece = opts.piece,
      gates = opts.gates or defaultGates(),
      role = opts.role,
    }
    -- 传入的 gates 可能是老版本（缺键），补齐但**不覆盖已有值**
    local d = defaultGates()
    for k, v in pairs(d) do
      if st.gates[k] == nil then st.gates[k] = v end
    end
    return st
  end

  -- 惰性门禁：允许直接包住 main 的 g（它没有 gates 区）
  function E.gates(state)
    if type(state) ~= 'table' then return nil end
    if type(state.gates) ~= 'table' then
      state.gates = defaultGates()
    else
      local d = defaultGates()
      for k, v in pairs(d) do
        if state.gates[k] == nil then state.gates[k] = v end
      end
    end
    return state.gates
  end

  function E.gravityMult(state)
    local g = E.gates(state)
    return g and numOr(g.gravityMult, 1) or 1
  end

  function E.freezeRows(state)
    local g = E.gates(state)
    return g and numOr(g.freezeRows, 0) or 0
  end

  function E.canReceiveGarbage(state)
    local g = E.gates(state)
    if not g then return false end
    if numOr(g.freezeLeft, 0) > 0 then return false end
    return not g.garbageBlocked
  end

  function E.canMove(state)
    local g = E.gates(state)
    return (g == nil) or numOr(g.moveLockMs, 0) <= 0
  end

  function E.lockDelayCut(state)
    local g = E.gates(state)
    return g and numOr(g.lockDelayCutMs, 0) or 0
  end

  function E.canTakeOver(state)
    local g = E.gates(state)
    return (g ~= nil) and numOr(g.takeOverSec, 0) > 0
  end

  ------------------------------------------------------------------ 事件工具
  local function ev(t)
    return t
  end

  local function fail(reason, extra)
    local r = { ok = false, reason = reason }
    if extra then for k, v in pairs(extra) do r[k] = v end end
    return {}, r
  end

  local function okr(t)
    t.ok = true
    return t
  end

  ------------------------------------------------------------------ 棋盘类 effect
  -- 一次「整体下移一行」：丢掉盘底行（内容被移除），顶部补空。
  -- 连做 n 次 = clearBottom{n}（删盘底 n 行，栈顶远离盘顶 n 行 = 对玩家有利）
  local function shiftDownOne(state)
    local board = state.board
    local last = table.remove(board, ROWS)      -- 丢掉盘底那一行
    local lost = 0
    if last then
      for c = 1, COLS do if last[c] ~= EMPTY then lost = lost + 1 end end
    end
    table.insert(board, 1, emptyRow())          -- 顶部补空 ⇒ 整体下移
    return lost
  end

  -- 一次「整体上移一行」：丢掉盘顶行，底部补空。
  -- 连做 n 次 = clearTop{n}（删绝对盘顶 n 行 ⇒ 盘面被推高 n 行，见文件头四、②）
  local function shiftUpOne(state)
    local board = state.board
    local first = table.remove(board, 1)        -- 丢掉盘顶那一行
    local lost = 0
    if first then
      for c = 1, COLS do if first[c] ~= EMPTY then lost = lost + 1 end end
    end
    board[ROWS] = emptyRow()                    -- 底部补空 ⇒ 整体上移
    return lost
  end

  local apply -- 前向声明（markBlink 复用 blink 分支）

  local function clearColumn(state, col, n)
    local board = state.board
    local hit = {}
    for r = ROWS, 1, -1 do
      if #hit >= n then break end
      if board[r] and board[r][col] ~= EMPTY then
        board[r][col] = EMPTY
        hit[#hit + 1] = r
      end
    end
    return hit
  end

  local function clearStackTop(state, n)
    local board = state.board
    local top = E.stackTop(board)
    if not top then return nil end
    local last = math.min(ROWS, top + n - 1)
    local cells = 0
    for r = top, last do
      for c = 1, COLS do
        if board[r][c] ~= EMPTY then
          board[r][c] = EMPTY
          cells = cells + 1
        end
      end
    end
    return { fromRow = top, toRow = last, cells = cells }
  end

  -- 垫垃圾：与 raiseGarbage 同序（先顶掉盘顶一行，再在底部追加带洞行）
  local function addGarbage(state, n, holeOf, fill)
    local board = state.board
    local holes = {}
    for i = 1, n do
      local hole
      if type(holeOf) == 'function' then hole = holeOf(i) else hole = holeOf[i] end
      hole = clampInt(hole, 1, COLS)
      holes[i] = hole
      table.remove(board, 1)
      local row = {}
      for c = 1, COLS do row[c] = (c == hole) and EMPTY or fill end
      board[ROWS] = row
    end
    -- 当前块被顶到就上抬（旧 raiseGarbage 语义）；最多到 y=1
    local pushed = 0
    local p = state.piece
    if p and p.cells then
      while p.y > 1 and E.collides(board, p.cells, p.x, p.y) do
        p.y = p.y - 1
        pushed = pushed + 1
      end
    end
    return holes, pushed
  end

  ------------------------------------------------------------------ blink 家族
  -- 把块瞬移到 wantCol 并落底；返回 result（不写盘、不置 nil）
  local function blinkTo(state, wantCol, lockSec)
    local p = state.piece
    if type(p) ~= 'table' or type(p.cells) ~= 'table' then
      return fail(M.REASON.noPiece)
    end
    local board = state.board
    local rawCol = clampInt(wantCol == nil and p.x or wantCol, 1, COLS)
    local clamped = (tonumber(wantCol) ~= nil) and (math.floor(tonumber(wantCol)) ~= rawCol) or false
    local col = rawCol
    local snapped = false
    if E.collides(board, p.cells, col, p.y) then
      local found
      for d = 1, COLS - 1 do
        local lo, hi = col - d, col + d
        if lo >= 1 and not E.collides(board, p.cells, lo, p.y) then
          found = lo
          break
        end
        if hi <= COLS and not E.collides(board, p.cells, hi, p.y) then
          found = hi
          break
        end
      end
      if not found then return fail(M.REASON.blocked, { wantCol = rawCol }) end
      col, snapped = found, true
    end
    local fromY = p.y
    local landY = E.landY(board, p.cells, col, p.y)
    p.x, p.y = col, landY
    local g = E.gates(state)
    local ms = 0
    local events = {}
    if tonumber(lockSec) and tonumber(lockSec) > 0 then
      ms = math.ceil(tonumber(lockSec) * 1000)
      g.moveLockMs = math.max(numOr(g.moveLockMs, 0), ms)
      events[#events + 1] = ev({ kind = 'moveLock', ms = ms })
    end
    events[#events + 1] = ev({
      kind = 'blink', col = col, landY = landY, dropped = landY - fromY,
      wanted = rawCol, snapped = snapped,
    })
    return events, okr({
      kind = M.KIND.blink, col = col, landY = landY, dropped = landY - fromY,
      fromY = fromY, wantCol = rawCol, snapped = snapped, clamped = clamped,
      moveLockMs = ms,
    })
  end

  ------------------------------------------------------------------ 主分派
  apply = function(state, effect)
    if type(state) ~= 'table' then return fail(M.REASON.badState) end
    if type(effect) ~= 'table' then return fail(M.REASON.badState) end
    local kind = M.normalize(effect.kind)
    if not kind then return fail(M.REASON.unknownKind, { kind = effect.kind }) end

    local n = clampInt(effect.rows or effect.n or 1, 1, ROWS)
    local g = E.gates(state)

    if kind == 'clearBottom' or kind == 'gravityClear' then
      local cells = 0
      for _ = 1, n do cells = cells + shiftDownOne(state) end
      return { ev({ kind = kind, rows = n, cells = cells }) },
        okr({ kind = kind, rows = n, cells = cells })
    elseif kind == 'clearTop' then
      local cells = 0
      for _ = 1, n do cells = cells + shiftUpOne(state) end
      return { ev({ kind = kind, rows = n, cells = cells }) },
        okr({ kind = kind, rows = n, cells = cells, pushed = n })
    elseif kind == 'clearStackTop' then
      local r = clearStackTop(state, n)
      if not r then return fail(M.REASON.empty) end
      return { ev({ kind = kind, rows = n, fromRow = r.fromRow, toRow = r.toRow, cells = r.cells }) },
        okr({ kind = kind, rows = n, fromRow = r.fromRow, toRow = r.toRow, cells = r.cells })
    elseif kind == 'clearColumn' then
      local col = clampInt(effect.col or 1, 1, COLS)
      local hit = clearColumn(state, col, n)
      return { ev({ kind = kind, col = col, cells = #hit, rows = hit }) },
        okr({ kind = kind, col = col, cells = #hit })
    elseif kind == 'addGarbage' then
      if not E.canReceiveGarbage(state) then
        return { ev({ kind = 'garbageBlocked', rows = n }) },
          okr({ kind = kind, rows = n, cells = 0, blockedBy = 'freeze' })
      end
      local holeOf = effect.holeOf or spec.holeOf
      if holeOf == nil then return fail(M.REASON.noHole, { rows = n }) end
      local fill = effect.fill
      if fill == nil then fill = FILL end
      local holes, pushed = addGarbage(state, n, holeOf, fill)
      local list = {}
      for i = 1, #holes do list[i] = holes[i] end
      return { ev({ kind = kind, rows = n, holes = list, pushed = pushed }) },
        okr({ kind = kind, rows = n, holes = list, pushed = pushed })
    elseif kind == 'freeze' then
      local rows = clampInt(effect.rows or 0, 0, ROWS)
      local sec = math.max(0, numOr(effect.sec, 0))
      -- 天地交泰：冻结期间重力间隔 ×NUM.GANYU.FIELD_GRAVITY（缺 NUM 时保守 1）
      local mult = tonumber(effect.gravityMult)
      if mult == nil then
        mult = (effect.role == 'ganyu' and NUM and NUM.GANYU and NUM.GANYU.FIELD_GRAVITY) or 1
      end
      g.freezeRows = rows
      g.freezeLeft = sec
      g.garbageBlocked = (sec > 0)
      g.gravityMult = mult
      return { ev({ kind = kind, rows = rows, sec = sec, gravityMult = mult }) },
        okr({ kind = kind, rows = rows, sec = sec, gravityMult = mult, garbageBlocked = (sec > 0) })
    elseif kind == 'blink' then
      return blinkTo(state, effect.col, effect.lockSec)
    elseif kind == 'blinkBest' then
      local col, h = E.emptyCol(state.board)
      local events, res = blinkTo(state, col, effect.lockSec)
      if res.ok then res.bestCol = col; res.bestHeight = h; res.kind = kind end
      return events, res
    elseif kind == 'markBlink' then
      -- 雷楔二段：瞬移到雷楔列落底 + 清该列底部 n 格（旧实现只 print）
      local events, res = blinkTo(state, effect.col, effect.lockSec)
      if not res.ok then return events, res end
      local col = res.col
      local hit = clearColumn(state, col, clampInt(effect.rows or 2, 1, ROWS))
      events[#events + 1] = ev({ kind = 'clearColumn', col = col, cells = #hit, rows = hit })
      res.kind = kind
      res.clearedCol = col
      res.clearedCells = #hit
      return events, res
    elseif kind == 'holdCut' then
      local ms = math.max(0, numOr(effect.ms, 0))
      local sec = math.max(0, numOr(effect.sec, 0))
      g.lockDelayCutMs = ms
      g.lockDelayCutLeft = sec
      return { ev({ kind = kind, ms = ms, sec = sec }) },
        okr({ kind = kind, ms = ms, sec = sec })
    elseif kind == 'takeOver' then
      local sec = math.max(0, numOr(effect.sec, 0))
      local tier = clampInt(effect.tier or 0, 0, 99)
      g.takeOverSec = sec
      g.takeOverTier = tier
      return { ev({ kind = kind, sec = sec, tier = tier }) },
        okr({ kind = kind, sec = sec, tier = tier })
    end
    return fail(M.REASON.unknownKind, { kind = effect.kind })
  end

  E.apply = function(state, effect)
    return apply(state, effect)
  end

  -- 按 target 选盘：一次性把「用调用时的全局 g」这类串盘问题堵住
  -- pair = { self = <state 我方盘>, opp = <state 对方盘|nil> }
  E.applyTo = function(pair, effect)
    if type(pair) ~= 'table' or type(effect) ~= 'table' then
      return fail(M.REASON.badState)
    end
    local target = effect.target
    local st = pair.self
    local degraded = nil
    if target == 'opp' then
      if pair.opp then
        st = pair.opp
      elseif effect.degrade == false then
        return fail(M.REASON.noTarget)
      elseif target ~= nil then
        degraded = 'solo'   -- 单人局：把「推给对手」降级成「清自己盘底」（旧 dispatchEffect 语义）
        st = pair.self
        effect = setmetatable({
          kind = 'clearBottom',
          rows = effect.rows or effect.n or 1,
          id = effect.id, role = effect.role, target = 'self',
        }, { __index = effect })
      end
    end
    local events, res = apply(st, effect)
    res.target = (st == pair.opp) and 'opp' or 'self'
    res.degraded = degraded
    return events, res
  end

  E.applyAll = function(state, effects)
    local events, results = {}, {}
    if type(effects) ~= 'table' then return events, results end
    for i = 1, #effects do
      local e, r = E.apply(state, effects[i])
      results[i] = r
      for k = 1, #e do events[#events + 1] = e[k] end
    end
    return events, results
  end

  ------------------------------------------------------------------ 门禁倒计时
  -- dt 单位秒。只递减 gates，不动棋盘；到期清值并发事件（这是「读侧」的另一半：
  -- main 的 perTicks 每帧读 E.gravityMult(state)，冻结到期自动回 1）
  E.tick = function(state, dt)
    local events = {}
    if type(state) ~= 'table' then return events end
    local g = E.gates(state)
    local d = math.max(0, numOr(dt, 0))

    if g.moveLockMs > 0 then
      g.moveLockMs = math.max(0, g.moveLockMs - d * 1000)
      if g.moveLockMs == 0 then events[#events + 1] = ev({ kind = 'moveLockEnd' }) end
    end

    if g.freezeLeft > 0 then
      g.freezeLeft = math.max(0, g.freezeLeft - d)
      if g.freezeLeft == 0 then
        g.freezeRows = 0
        g.garbageBlocked = false
        g.gravityMult = 1
        events[#events + 1] = ev({ kind = 'freezeEnd' })
      end
    end

    if g.takeOverSec > 0 then
      g.takeOverSec = math.max(0, g.takeOverSec - d)
      if g.takeOverSec == 0 then
        g.takeOverTier = 0
        events[#events + 1] = ev({ kind = 'takeOverEnd' })
      end
    end

    if g.lockDelayCutLeft > 0 then
      g.lockDelayCutLeft = math.max(0, g.lockDelayCutLeft - d)
      if g.lockDelayCutLeft == 0 then
        g.lockDelayCutMs = 0
        events[#events + 1] = ev({ kind = 'holdCutEnd' })
      end
    end

    return events
  end

  return E
end

return M
