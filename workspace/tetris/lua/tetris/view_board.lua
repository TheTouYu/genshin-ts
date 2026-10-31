--[[==========================================================================
 tetris/view_board.lua —— 棋盘几何（纯函数：状态/配色 → 节点描述）
 ----------------------------------------------------------------------------
 从 main.lua 的「背板 + 200 格 + 4 条外框」创建段（历史位置 5877-5939）抽出的**纯几何**：
   格心 x = (col - 4.5) * PITCH      （col 0-based）
   格心 y = (9.5 - row) * PITCH      （row 0-based，上方为正）
 PITCH=30 / CELL=28 ⇒ cell1 = (-135, 285)，cell200 = (135, -285)（tests/01 断言的就是这组数）
 这些数字以前只存在于一个 755 行的 layout 函数里，改一个像素都要开模拟器验证；
 现在它是纯函数，tests-lua 里 50ms 就能证明「几何没变」。
========================================================================]]

local M = {}

M.new = function(spec)
  spec = spec or {}
  local CFG = assert(spec.config, 'view_board: 需要 spec.config')
  local COLS, ROWS, CELL, PITCH = CFG.COLS, CFG.ROWS, CFG.CELL, CFG.PITCH
  local B = {}

  -- 四条外框：与棋盘边缘对齐（竖线高/横线宽取「框到框」跨度，否则四角各伸出 ~16px）
  local edgeW = 4.5 * PITCH + CELL / 2          -- 149
  local frameX = edgeW + 1                       -- 150
  local frameY = 9.5 * PITCH + CELL / 2 + 1      -- 300
  local FRAME_SPECS = {
    { -frameX, 0, 2, 2 * frameY + 2 },            -- 左
    { frameX, 0, 2, 2 * frameY + 2 },             -- 右
    { 0, frameY, 2 * frameX + 2, 2 },             -- 上
    { 0, -frameY, 2 * frameX + 2, 2 },            -- 下
  }

  function B.framePos(i)
    local sp = FRAME_SPECS[i]
    if not sp then return nil end
    return sp[1], sp[2], sp[3], sp[4]
  end

  function B.cellIndex(col, row) return row * COLS + col + 1 end
  function B.cellPos(i)
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    return (col - 4.5) * PITCH, (9.5 - row) * PITCH
  end
  B.frameX, B.frameY = frameX, frameY

  -- opts = { plateColor, frameColor, cellColor, colorOf = function(i, col, row) -> color }
  function B.board(opts)
    opts = opts or {}
    local kp = opts.keyPrefix or ''
    local np = opts.namePrefix or ''
    local list = {}
    list[#list + 1] = {
      key = kp .. 'boardPlate', layer = 'plate', tpl = 'cell', name = np .. 'boardPlate',
      pos = { 0, 0 }, size = { COLS * PITCH + 6, ROWS * PITCH + 6 },
      color = opts.plateColor,
    }
    for i = 1, COLS * ROWS do
      local col = (i - 1) % COLS
      local row = (i - 1) // COLS
      local color = opts.cellColor
      if opts.colorOf then color = opts.colorOf(i, col, row) or opts.cellColor end
      list[#list + 1] = {
        key = kp .. 'cell' .. i, layer = 'board', tpl = 'cell', name = np .. 'cell' .. i,
        pos = { B.cellPos(i) }, size = { CELL, CELL }, color = color,
      }
    end
    for i = 1, #FRAME_SPECS do
      local sp = FRAME_SPECS[i]
      list[#list + 1] = {
        key = kp .. 'frame' .. i, layer = 'frame', tpl = 'cell', name = np .. 'frame' .. i,
        pos = { sp[1], sp[2] }, size = { sp[3], sp[4] }, color = opts.frameColor,
      }
    end
    return list
  end

  return B
end

return M
