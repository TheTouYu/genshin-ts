--[[==========================================================================
Tetris —— 千星模拟器 2D 路线技术验证 demo（服务端驱动渲染）
----------------------------------------------------------------------------
架构：
  * 本脚本挂在服务端控件 n1（服务端容器）上 —— 客户端模板树零脚本铁律，脚本不进模板。
  * 棋盘 10x20 = 200 格：OnStart 用 game.InstantiateClientUIControl(模板 guid, root)
    实例化 200 个 image 实例并按格位摆放；之后只改 imageColor 上色。
  * HUD / NEXT 用服务端 textbox 直接写 text（服务端直写文本已验证可用）。
  * 逻辑固定步长：OnUpdate(dt) 只累加，逻辑在 STEP=1/60 的 tick 内跑。

键位（官方具名键，见模拟器 studio/play/key-bindings.js）：
  ArrowLeft  -> KeyboardCraftspersonKey38   左移
  ArrowRight -> KeyboardCraftspersonKey39   右移
  ArrowUp    -> KeyboardCraftspersonKey36   顺时针旋转
  ArrowDown  -> KeyboardCraftspersonKey37   软降
  Space      -> KeyboardJumpKey             硬降
  R          -> KeyboardCharacterSkill3Key  重开
  T          -> KeyboardCharacterSkill4Key  调试：填满最底两行（仅用例用）
==========================================================================]]

local COLS, ROWS    = 10, 20
local CELL, GAP     = 26, 2
local PITCH         = CELL + GAP
local T_CELL        = 1073742105   -- 客户端模板「cell」根子节点 guid（build.mjs 分配）
local STEP          = 1 / 60
local GRAVITY_TICKS = 30           -- 每 30 拍下坠一格（0.5s）
local BOARD_CX, BOARD_CY = 0, 0    -- 棋盘中心（画布坐标，原点=画布中心，y 向上）

local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local COL_EMPTY  = C(255, 26, 29, 38)
local COL_CYAN   = C(255, 60, 220, 240)
local COL_YELLOW = C(255, 245, 210, 60)
local COL_PURPLE = C(255, 170, 80, 240)
local COL_GREEN  = C(255, 90, 220, 110)
local COL_RED    = C(255, 240, 80, 90)
local COL_BLUE   = C(255, 70, 130, 240)
local COL_ORANGE = C(255, 245, 160, 60)

-- 七种方块：n = 包围盒边长，cells = 盒内 1-based {row, col}
local SHAPES = {
  I = { n = 4, color = COL_CYAN,   cells = {{2,1},{2,2},{2,3},{2,4}} },
  O = { n = 2, color = COL_YELLOW, cells = {{1,1},{1,2},{2,1},{2,2}} },
  T = { n = 3, color = COL_PURPLE, cells = {{1,2},{2,1},{2,2},{2,3}} },
  S = { n = 3, color = COL_GREEN,  cells = {{1,2},{1,3},{2,1},{2,2}} },
  Z = { n = 3, color = COL_RED,    cells = {{1,1},{1,2},{2,2},{2,3}} },
  J = { n = 3, color = COL_BLUE,   cells = {{1,1},{2,1},{2,2},{2,3}} },
  L = { n = 3, color = COL_ORANGE, cells = {{1,3},{2,1},{2,2},{2,3}} },
}
local BAG = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }

-- 确定性随机（LCG）：用例可复现，不依赖 os / math.random
local seed = 20261023
local function rand(n)
  seed = (seed * 1103515245 + 12345) % 2147483648
  return (seed // 65536) % n + 1
end

-- 前向声明（局部化，避免污染全局表）
local root, cells, hud, hudNext
local board, piece, nextName
local score, lines, level
local gameOver, tickCount, acc
local collides, doLock, renderAll, renderPiece, renderHud, spawn, clearLines

local function cellIndex(r, c) return (r - 1) * COLS + c end

local function paint(r, c, color)
  local ctl = cells[cellIndex(r, c)]
  if ctl then ctl.imageColor = color end
end

renderAll = function()
  for r = 1, ROWS do
    for c = 1, COLS do
      local v = board[r][c]
      if v == 0 then paint(r, c, COL_EMPTY) else paint(r, c, v) end
    end
  end
end

renderHud = function()
  local oc = 0
  for r = 1, ROWS do
    for c = 1, COLS do
      if board[r][c] ~= 0 then oc = oc + 1 end
    end
  end
  if hud then
    hud.text = 'SCORE ' .. score .. '  LINES ' .. lines .. '  LV ' .. level
      .. '  FILLED ' .. oc
  end
  if hudNext then
    hudNext.text = 'NEXT ' .. (gameOver and '-' or (nextName or '-'))
  end
end

renderPiece = function()
  renderAll()
  if gameOver or not piece then return end
  for i = 1, 4 do
    local br = piece.y + piece.cells[i][1] - 1
    local bc = piece.x + piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      paint(br, bc, piece.color)
    end
  end
end

collides = function(cs, px, py)
  for i = 1, #cs do
    local br = py + cs[i][1] - 1
    local bc = px + cs[i][2] - 1
    if bc < 1 or bc > COLS or br > ROWS then return true end
    if br >= 1 and board[br][bc] ~= 0 then return true end
  end
  return false
end

spawn = function()
  local name = nextName or 'T'
  nextName = BAG[rand(#BAG)]
  local s = SHAPES[name]
  piece = {
    name = name, n = s.n, color = s.color,
    cells = { { s.cells[1][1], s.cells[1][2] }, { s.cells[2][1], s.cells[2][2] },
              { s.cells[3][1], s.cells[3][2] }, { s.cells[4][1], s.cells[4][2] } },
    x = (COLS - s.n) // 2 + 1,
    y = 1,
  }
  print('piece=' .. name .. ' x=' .. piece.x .. ' y=' .. piece.y)
  if collides(piece.cells, piece.x, piece.y) then
    gameOver = true
    print('gameover score=' .. score)
  end
  renderPiece()
  renderHud()
end

clearLines = function()
  local cleared = 0
  local r = ROWS
  while r >= 1 do
    local full = true
    for c = 1, COLS do
      if board[r][c] == 0 then full = false end
    end
    if full then
      table.remove(board, r)
      local row = {}
      for c = 1, COLS do row[c] = 0 end
      table.insert(board, 1, row)
      cleared = cleared + 1
      -- 不递减 r：删除并把空行插到顶部后，原 r-1 行已落到索引 r，要再判一次
    else
      r = r - 1
    end
  end
  if cleared > 0 then
    local pts = { 100, 300, 500, 800 }   -- 1/2/3/4 行
    score = score + pts[cleared] * level
    lines = lines + cleared
    level = lines // 10 + 1
    print('clear n=' .. cleared .. ' score=' .. score .. ' lines=' .. lines)
  end
end

doLock = function()
  for i = 1, 4 do
    local br = piece.y + piece.cells[i][1] - 1
    local bc = piece.x + piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      board[br][bc] = piece.color
    end
  end
  local landed = {}
  for i = 1, 4 do
    local br = piece.y + piece.cells[i][1] - 1
    local bc = piece.x + piece.cells[i][2] - 1
    if br >= 1 and br <= ROWS then landed[#landed + 1] = (br - 1) * COLS + bc end
  end
  print('lock ' .. piece.name .. ' cells=' .. table.concat(landed, ','))
  clearLines()
  if not gameOver then spawn() end   -- spawn 内部 renderPiece() 会重画棋盘+新方块
  renderHud()
end

local function stepDown()
  if gameOver or not piece then return end
  if not collides(piece.cells, piece.x, piece.y + 1) then
    piece.y = piece.y + 1
    renderPiece()
    print('fall y=' .. piece.y)
  else
    doLock()
  end
end

local function rotate()
  if gameOver or not piece then return end
  local n = piece.n
  local nc = {}
  for i = 1, 4 do
    nc[i] = { piece.cells[i][2], n + 1 - piece.cells[i][1] }   -- 顺时针 90°
  end
  if not collides(nc, piece.x, piece.y) then
    piece.cells = nc
    print('rotate ' .. piece.name)
    renderPiece()
  end
end

local function newGame()
  board = {}
  for r = 1, ROWS do
    local row = {}
    for c = 1, COLS do row[c] = 0 end
    board[r] = row
  end
  score, lines, level = 0, 0, 1
  gameOver, tickCount, acc = false, 0, 0
  nextName = BAG[rand(#BAG)]
  spawn()                            -- spawn 内部 renderPiece() 已重画整盘+方块
  renderHud()
  print('newgame')
end

--------------------------------------------------------------------------------
-- 生命周期
--------------------------------------------------------------------------------

function OnStart()
  root = script.object
  if not root then error('tetris: script.object is nil') end
  root.showCursor = true
  script:EnableUpdate(true)      -- 默认 false：不显式打开就不会派发 OnUpdate

  local W, H = game.GetUICanvasSize()
  print('canvas ' .. tostring(W) .. 'x' .. tostring(H))

  cells = {}
  for i = 1, COLS * ROWS do
    local c = game.InstantiateClientUIControl(T_CELL, root)
    if not c then error('tetris: InstantiateClientUIControl failed at ' .. i) end
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    c.name = 'cell' .. i
    c:SetSizeDelta(CELL, CELL)
    c:SetAnchoredPosition(BOARD_CX + (col - 4.5) * PITCH,
                          BOARD_CY + (9.5 - row) * PITCH)
    c.imageColor = COL_EMPTY
    cells[i] = c
  end
  print('cellCount=' .. #cells)

  hud = root:GetChild('hud')
  hudNext = root:GetChild('hudNext')

  root:AddKeyEventListener('KeyboardCraftspersonKey38Down', function()   -- ←
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x - 1, piece.y) then
      piece.x = piece.x - 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end)
  root:AddKeyEventListener('KeyboardCraftspersonKey39Down', function()   -- →
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x + 1, piece.y) then
      piece.x = piece.x + 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end)
  root:AddKeyEventListener('KeyboardCraftspersonKey36Down', function()   -- ↑
    rotate()
  end)
  root:AddKeyEventListener('KeyboardCraftspersonKey37Down', function()   -- ↓
    stepDown()
  end)
  root:AddKeyEventListener('KeyboardJumpKeyDown', function()             -- Space
    if gameOver or not piece then return end
    local dropped = 0
    while not collides(piece.cells, piece.x, piece.y + 1) do
      piece.y = piece.y + 1
      dropped = dropped + 1
    end
    print('harddrop rows=' .. dropped .. ' y=' .. piece.y)
    doLock()
  end)
  root:AddKeyEventListener('KeyboardCharacterSkill3KeyDown', function()  -- R 重开
    newGame()
  end)
  -- T：调试填满最底两行（不消行）。消行必须走真实路径——下一次锁定（硬降/落地）时
  -- 由 doLock -> clearLines 处理，用例 04 因此覆盖的是真实消行链路而不是调试旁路。
  root:AddKeyEventListener('KeyboardCharacterSkill4KeyDown', function()
    for rr = ROWS - 1, ROWS do
      for c = 1, COLS do board[rr][c] = COL_BLUE end
    end
    print('debug-fill')
    renderAll()
    renderHud()
  end)

  newGame()
end

function OnUpdate(dt)
  local d = tonumber(dt) or 0
  if d <= 0 then return end
  acc = acc + d
  local guard = 0
  while acc >= STEP and guard < 8 do
    acc = acc - STEP
    guard = guard + 1
    tickCount = tickCount + 1
    if not gameOver and tickCount % GRAVITY_TICKS == 0 then
      stepDown()
    end
  end
end

function OnDestroy() end
