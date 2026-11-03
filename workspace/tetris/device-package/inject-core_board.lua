--[[==========================================================================
 tetris/core_board.lua —— 棋盘二维表操作（core_*：零引擎、零全局）
 ----------------------------------------------------------------------------
 逐字搬自 main.lua:1070-1078（collides）、1080-1117 的落盘段（doLock 写盘 + landed 列表）、
 1118-1136（clearLines 的行消除循环）、2068-2092（raiseGarbage 的垫行）、
 1266-1276（T-spin 的 3 角占用）。
 ----------------------------------------------------------------------------
 棋盘约定（与现网一致，**不要改成另一种口径**）：
   board[r][c]，r=1..ROWS（1 = 顶行），c=1..COLS
   0        = 空
   非 0     = 已填。**现网这个值就是方块/垃圾的颜色值**（main.lua:1281 写 g.piece.color，
              障碍/垃圾写 CFG.COL_GRAY，消行闪白按颜色重绘）——不是 1..7 的索引。
              任务书里写的「1..7 颜色索引 / 8 垃圾」只是另一种取值方案：本模块只做
              「0 / 非 0」判断，填充值由调用方给（spec.fill / 参数 color），两种口径都能用。
 ⚠ 若接线时改成写索引，renderAll 的 paint 会画出 1..8 号色（近黑），必须同步改 paint——
   这就是为什么这里保留颜色值口径：语义等价 > 口径好看。
 ----------------------------------------------------------------------------
 接口：
   B = M.new{ cols = 10, rows = 20, empty = 0 }
   B.newBoard()                       -> rows×cols 的 0 矩阵
   B.collides(board, cells, px, py)   -> boolean（等价 main.lua:1070-1078）
   B.lock(board, cells, px, py, color) -> landed 列表（(br-1)*COLS+bc，等价 main.lua:1284-1289）
   B.clearRows(board)                 -> cleared, removed
   B.dropRows(board, cells, px, py)   -> 可下落行数（硬降落点）
   B.filledCount(board)               -> 非空格数
   B.addGarbage(board, n, holeOf, fill) -> 底部垫 n 行带 1 洞垃圾（等价 main.lua:2086-2092）
   B.cornerCount(board, px, py)       -> T-spin 3 角的占用数（等价 main.lua:1266-1276）
   B.inBounds(r, c)
=======================================================================]]

local M = {}

-- T-spin 3 角规则看的是 3×3 包围盒的四角（main.lua:1268 的 corners 表）
local CORNERS = { { 1, 1 }, { 1, 3 }, { 3, 1 }, { 3, 3 } }

function M.new(spec)
  spec = spec or {}
  local COLS = assert(spec.cols, 'core_board: 需要 spec.cols')
  local ROWS = assert(spec.rows, 'core_board: 需要 spec.rows')
  local EMPTY = spec.empty or 0

  local B = { cols = COLS, rows = ROWS, empty = EMPTY }

  function B.newBoard()
    local board = {}
    for r = 1, ROWS do
      local row = {}
      for c = 1, COLS do row[c] = EMPTY end
      board[r] = row
    end
    return board
  end

  function B.inBounds(r, c)
    return r >= 1 and r <= ROWS and c >= 1 and c <= COLS
  end

  -- 等价 main.lua:1070-1078：左右越界与底部越界算碰撞；**顶部越界不算**
  -- （块可以从盘顶之上进入），这一条决定了 spawn 时 y=1 附近的判定行为。
  function B.collides(board, cells, px, py)
    for i = 1, #cells do
      local br = py + cells[i][1] - 1
      local bc = px + cells[i][2] - 1
      if bc < 1 or bc > COLS or br > ROWS then return true end
      if br >= 1 and board[br][bc] ~= EMPTY then return true end
    end
    return false
  end

  -- 写盘 + 返回落地格索引（main.lua:1277-1289）：
  --   landed 只判 br 在 1..ROWS（bc 已在 collides 阶段保证在界内）；
  --   spawn 顶死时 br<1 的格子**不写盘也不算 landed**（现网语义，别加"夹到 1"的修正）。
  function B.lock(board, cells, px, py, color)
    for i = 1, #cells do
      local br = py + cells[i][1] - 1
      local bc = px + cells[i][2] - 1
      if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
        board[br][bc] = color
      end
    end
    local landed = {}
    for i = 1, #cells do
      local br = py + cells[i][1] - 1
      local bc = px + cells[i][2] - 1
      if br >= 1 and br <= ROWS then landed[#landed + 1] = (br - 1) * COLS + bc end
    end
    return landed
  end

  -- 等价 main.lua:1118-1136：从下往上扫，消掉一行就 table.remove + 顶部插空行，
  -- **不递减 r**（原 r-1 行已落到索引 r，要再判一次）。返回 (cleared, removed)。
  function B.clearRows(board)
    local cleared = 0
    local removed = {}
    local r = ROWS
    while r >= 1 do
      local full = true
      for c = 1, COLS do
        if board[r][c] == EMPTY then full = false end
      end
      if full then
        table.remove(board, r)
        local row = {}
        for c = 1, COLS do row[c] = EMPTY end
        table.insert(board, 1, row)
        cleared = cleared + 1
        removed[#removed + 1] = r
      else
        r = r - 1
      end
    end
    return cleared, removed
  end

  -- 硬降落点：等价 main.lua:6123-6126 的 while 循环，返回还能下落几行
  function B.dropRows(board, cells, px, py)
    local n = 0
    while not B.collides(board, cells, px, py + n + 1) do n = n + 1 end
    return n
  end

  function B.filledCount(board)
    local n = 0
    for r = 1, ROWS do
      local row = board[r]
      for c = 1, COLS do
        if row[c] ~= EMPTY then n = n + 1 end
      end
    end
    return n
  end

  -- 等价 main.lua:2086-2092：每行「顶行被挤掉、底行追加带 1 个洞的垃圾」。
  -- holeOf 可以是函数 holeOf(i) -> 列号，也可以是 { [1]=col, [2]=col, ... }。
  -- 洞位随机源由调用方给（现网用 aiRand，**不是**出块 LCG——见 core_state 的 holeRng 说明）。
  function B.addGarbage(board, n, holeOf, fill)
    assert(holeOf, 'core_board.addGarbage: 需要 holeOf（洞位列来源），不提供默认值以避免静默变化')
    local f = fill or EMPTY
    for i = 1, n do
      local hole
      if type(holeOf) == 'function' then hole = holeOf(i) else hole = holeOf[i] end
      table.remove(board, 1)
      local row = {}
      for c = 1, COLS do row[c] = (c == hole) and EMPTY or f end
      board[#board + 1] = row
    end
    return board
  end

  -- 等价 main.lua:1266-1276：3 角规则。越界与已填都算「占用」。
  function B.cornerCount(board, px, py)
    local occ = 0
    for i = 1, 4 do
      local cr = py + CORNERS[i][1] - 1
      local cc = px + CORNERS[i][2] - 1
      if cr < 1 or cr > ROWS or cc < 1 or cc > COLS or board[cr][cc] ~= EMPTY then
        occ = occ + 1
      end
    end
    return occ
  end

  return B
end

return M
