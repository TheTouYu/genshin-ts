--[[==========================================================================
Tetris —— 千星模拟器 2D 路线技术验证 demo（服务端驱动渲染）
----------------------------------------------------------------------------
架构：
  * 本脚本挂在服务端控件 n1（服务端容器）上 —— 客户端模板树零脚本铁律，脚本不进模板。
  * 棋盘 10x20 = 200 格：OnStart 用 game.InstantiateClientUIControl(模板 guid, root)
    实例化 200 个 image 实例并按格位摆放；之后只改 imageColor 上色。
  * 所有文字（logo/统计/键位卡/提示/上下横幅）都是**服务端 textbox**，按 name 寻址：
    GetChild 不受"模板 guid 重编号"影响，是跨宿主最稳的一条寻址路。
  * 模板块指引：客户端模板只有一个 cell。模板 guid 在模拟器（authoring）与真机
    （导入后编辑器重编号）不同（实测 1073742105 vs 1073741849），多一个模板就多一处
    导入后校准 —— 所以"覆盖棋盘的引导层"改成上下横幅（不遮棋盘，也更简洁）。
  * 逻辑固定步长：OnUpdate(dt) 只累加，逻辑在 STEP=1/60 的 tick 内跑。

满幅布局（按 GetUICanvasSize 计算，换设备不用重新导入）：
  | 左栏 420 | 棋盘 300 | 右栏 420 |     上横幅（46 高）/ 下横幅（46 高）

键位（官方具名键，模拟器与真机均已实测可用）：
  ArrowLeft/A   -> KeyboardCraftspersonKey38Down / KeyboardMoveLeftKeyDown   左移
  ArrowRight/D  -> KeyboardCraftspersonKey39Down / KeyboardMoveRightKeyDown  右移
  ArrowUp/W     -> KeyboardCraftspersonKey36Down / KeyboardMoveForwardKeyDown 顺时针旋转
  ArrowDown/S   -> KeyboardCraftspersonKey37Down / KeyboardMoveBackwardKeyDown 软降
  Space         -> KeyboardJumpKey            硬降
  R             -> KeyboardCharacterSkill3Key 重开
  H             -> KeyboardCharacterSkill1Key 键位表（暂停开关；真机若不认则无害，右栏常驻键位卡兜底）
  T             -> KeyboardCharacterSkill4Key 调试：填满最底两行（仅用例用）

引导（时机精准 / 由简入深 / 可回溯）：
  stage 0 等开始：重力暂停，上横幅 TETRIS，下横幅键位 + "按任意键开始"
  stage 1 游戏中：首次锁定提示"堆满一行即消除"，首次消行提示分值表
  stage 2 键位表：按 H 暂停并显示完整键位，再按 H 继续
  失败：上横幅 GAME OVER（红），下横幅 得分 / 本局最高 / 按 R 重开
=========================================================================]]

local COLS, ROWS    = 10, 20
local CELL, GAP     = 28, 2
local PITCH         = CELL + GAP
-- 模板 guid 双宿主候选：真机导入后重编号 / 模拟器 authoring 原值。按序探测，第一个可用的胜出。
local TEMPLATE_GUIDS = { 1073741849, 1073742105 }
local STEP          = 1 / 60
local GRAVITY_TICKS = 30           -- 每 30 拍下坠一格（0.5s）

local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local COL_EMPTY  = C(255, 26, 29, 38)
local COL_CYAN   = C(255, 60, 220, 240)
local COL_YELLOW = C(255, 245, 210, 60)
local COL_PURPLE = C(255, 170, 80, 240)
local COL_GREEN  = C(255, 90, 220, 110)
local COL_RED    = C(255, 240, 80, 90)
local COL_BLUE   = C(255, 70, 130, 240)
local COL_ORANGE = C(255, 245, 160, 60)
local COL_BG     = C(255, 18, 20, 27)

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
local root, cells, preview, frames
local title, hud, hudNext, best, hint, keyA, keyB, keyC, topBanner, botBanner
local board, piece, nextName
local score, lines, level, bestScore
local gameOver, tickCount, acc
local guideStage, bannerTimer, taughtLock, taughtClear
local RIGHT_CX = 410
local showGameOver, updateBest
local collides, doLock, renderAll, renderPiece, renderHud, spawn, clearLines

local function cellIndex(r, c) return (r - 1) * COLS + c end

local function paint(r, c, color)
  local ctl = cells[cellIndex(r, c)]
  if ctl then ctl.imageColor = color end
end

-- 服务端 textbox 按名字取；某个控件缺失不应炸整段 OnStart（真机与模拟器控件集可能不同）
local function find(name)
  if not root then return nil end
  local ok, ctl = pcall(function() return root:GetChild(name) end)
  if ok then return ctl end
  return nil
end

local function setText(ctl, value)
  if ctl then ctl.text = value end
end

renderAll = function()
  for r = 1, ROWS do
    for c = 1, COLS do
      local v = board[r][c]
      if v == 0 then paint(r, c, COL_EMPTY) else paint(r, c, v) end
    end
  end
end

local function renderNext()
  if not preview then return end
  for i = 1, 4 do preview[i].imageColor = COL_BG end
  if gameOver or not nextName then return end
  local s = SHAPES[nextName]
  for i = 1, 4 do
    local ctl = preview[i]
    local r, c = s.cells[i][1], s.cells[i][2]
    ctl:SetAnchoredPosition(RIGHT_CX + (c - 2.5) * 20, 150 + (2.5 - r) * 20)
    ctl.imageColor = s.color
  end
end

renderHud = function()
  local oc = 0
  for r = 1, ROWS do
    for c = 1, COLS do
      if board[r][c] ~= 0 then oc = oc + 1 end
    end
  end
  setText(hud, 'SCORE ' .. score .. '  LINES ' .. lines .. '  LV ' .. level
    .. '  FILLED ' .. oc)
  setText(hudNext, 'NEXT')
  setText(best, 'BEST ' .. bestScore)
  renderNext()
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
    updateBest()
    showGameOver()
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
    -- 首次消行：由简入深——把"分值表"这项进阶信息押到玩家已经会消行之后
    if not taughtClear then
      taughtClear = true
      setText(hint, '一次消 4 行 +800')
      setText(botBanner, '空格 直落到底　　H 键位表')
      bannerTimer = 4.0
      print('guide clear-tip')
    end
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
  -- 首次锁定：只教"堆满一行即消除"这一条，不叠加其它信息
  if not taughtLock then
    taughtLock = true
    bannerTimer = 2.5
    print('guide lock-tip')
  end
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
-- 引导状态机：0=等开始（重力暂停） 1=游戏中 2=键位表（暂停）
--------------------------------------------------------------------------------

local function showKeymap()
  -- 单行，走 1100px 宽的横幅（textbox 是否支持 \n 换行未验证，不赌）
  setText(botBanner, '← → 移动　　↑ 旋转　　↓ 落下　　空格 直落　　R 重开')
  setText(hint, 'H 继续游戏')
end

local function startIfWaiting()
  if guideStage ~= 0 then return end
  guideStage = 1
  setText(topBanner, '')
  setText(botBanner, '')
  setText(hint, '堆满一行即消除')
  print('guide stage=1')
end

local function toggleKeymap()
  if guideStage == 2 then
    guideStage = 1
    setText(hint, '')
    setText(botBanner, '')
    print('guide stage=1 resume')
  else
    guideStage = 2
    showKeymap()
    print('guide stage=2 keymap')
  end
end

showGameOver = function()
  setText(topBanner, 'GAME OVER')
  if topBanner then topBanner.fontColor = C(255, 255, 77, 77) end
  setText(botBanner, '得分 ' .. score .. '　　本局最高 ' .. bestScore .. '　　按 R 重开')
  setText(hint, '')
  print('guide gameover')
end

updateBest = function()
  if score > bestScore then bestScore = score end
end

--------------------------------------------------------------------------------
-- 布局：按画布尺寸算三栏 + 上下横幅（换设备不用重新导入）
--------------------------------------------------------------------------------

local function layout(W, H)
  local halfW, halfH = W / 2, H / 2
  local panelW = 420
  local leftCX, rightCX = -(halfW - panelW / 2 - 20), halfW - panelW / 2 - 20
  RIGHT_CX = rightCX
  local bannerY = halfH - 30   -- 56 高、上边缘贴 2px
  local function place(ctl, x, y, w, h)
    if not ctl then return end
    ctl:SetSizeDelta(w, h)
    ctl:SetAnchoredPosition(x, y)
  end
  -- 框高硬判据（渲染器实测）：h >= fontSize*1.45 + 4 才画这一行，否则整行静默不画。
  -- 64 号 -> >=96.8（h=96 曾整块消失）、34 -> >=53.3、26 -> >=41.7、22 -> >=35.9。
  place(title, leftCX, halfH - 150, panelW, 100)      -- 64 号
  place(hud, leftCX, halfH - 235, panelW + 40, 40)   -- 20 号：22 号时尾部一个字被裁，实测
  place(best, leftCX, halfH - 280, panelW, 36)       -- 20 号
  place(hint, leftCX, -60, panelW, 150)              -- 22 号
  place(hudNext, rightCX, halfH - 150, 200, 40)      -- 22 号
  place(keyA, rightCX, -40, panelW, 38)              -- 22 号
  place(keyB, rightCX, -80, panelW, 38)              -- 22 号
  place(keyC, rightCX, -120, panelW, 38)             -- 22 号
  place(topBanner, 0, bannerY, W - 180, 56)          -- 34 号
  place(botBanner, 0, -(bannerY + 2), W - 180, 44)   -- 22 号，与棋盘底留 11px
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

  -- 模板 guid 探测（双宿主）：模拟器认 authoring 原值，真机认导入后重编号值
  local tplGuid
  local firstCell
  for _, g in ipairs(TEMPLATE_GUIDS) do
    firstCell = game.InstantiateClientUIControl(g, root)
    if firstCell then tplGuid = g break end
  end
  if not firstCell then
    error('tetris: 模板 guid 都不可用，候选=' .. #TEMPLATE_GUIDS .. '（导入后请用 assets:ui list --flat 校准）')
  end
  print('tpl guid=' .. tplGuid)

  cells = {}
  for i = 1, COLS * ROWS do
    local c = firstCell
    firstCell = nil
    if not c then c = game.InstantiateClientUIControl(tplGuid, root) end
    if not c then error('tetris: InstantiateClientUIControl failed at ' .. i) end
    local col = (i - 1) % COLS
    local row = (i - 1) // COLS
    c.name = 'cell' .. i
    c:SetSizeDelta(CELL, CELL)
    c:SetAnchoredPosition((col - 4.5) * PITCH, (9.5 - row) * PITCH)
    c.imageColor = COL_EMPTY
    cells[i] = c
  end
  print('cellCount=' .. #cells)

  -- 棋盘外框：4 条细长实例（后建 ⇒ 在棋格之上），给棋盘一个清晰边界
  local FRAME_COL = C(255, 76, 194, 255)
  local boardEdgeW = 4.5 * PITCH + CELL / 2      -- 149
  frames = {}
  -- 四条框线与棋盘边缘对齐：竖线高 / 横线宽都取「框到框」的跨度，否则四角会伸出约 16px（实测）
  local frameX = boardEdgeW + 1                      -- 150
  local frameY = 9.5 * PITCH + CELL / 2 + 1          -- 300
  local specs = {
    { -frameX, 0, 2, 2 * frameY + 2 },               -- 左
    { frameX, 0, 2, 2 * frameY + 2 },                -- 右
    { 0, frameY, 2 * frameX + 2, 2 },                -- 上
    { 0, -frameY, 2 * frameX + 2, 2 },               -- 下
  }
  for i = 1, #specs do
    local fr = game.InstantiateClientUIControl(tplGuid, root)
    if fr then
      local sp = specs[i]
      fr.name = 'frame' .. i
      fr:SetSizeDelta(sp[3], sp[4])
      fr:SetAnchoredPosition(sp[1], sp[2])
      fr.imageColor = FRAME_COL
    end
    frames[i] = fr
  end

  -- NEXT 预览四格（同一模板，缩到 18px）
  preview = {}
  for i = 1, 4 do
    local c = game.InstantiateClientUIControl(tplGuid, root)
    if c then
      c.name = 'next' .. i
      c:SetSizeDelta(18, 18)
      c:SetAnchoredPosition(400, 175)
      c.imageColor = COL_BG
    end
    preview[i] = c
  end

  title, hud, hudNext, best = find('title'), find('hud'), find('hudNext'), find('best')
  hint, keyA, keyB, keyC = find('hint'), find('keyA'), find('keyB'), find('keyC')
  topBanner, botBanner = find('topBanner'), find('botBanner')
  layout(W, H)

  -- 引导初始态：等玩家按第一个键（重力暂停，画面静止好读）
  guideStage, bannerTimer, taughtLock, taughtClear = 0, 0, false, false
  bestScore = 0
  setText(title, 'TETRIS')
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  setText(botBanner, '按任意键开始')

  -- 按键注册一律 pcall：真机上某个键名可能不存在，抛错会整段 OnStart 中断（2026-10-24 首轮实证）
  -- 真机要求 KeyEventType **枚举值**（传字符串报 bad argument #2: KeyEventType expected, got string，
  -- 2026-10-24 日志实证）；模拟器接受字符串。两种都试：先枚举，失败回落字符串。
  local enumKeys = (type(Enum) == 'table' and Enum.KeyEventType) or nil
  local function listen(name, fn)
    local ok, err, how
    if enumKeys and enumKeys[name] ~= nil then
      ok, err = pcall(function() root:AddKeyEventListener(enumKeys[name], fn) end)
      how = 'enum'
    end
    if not ok then
      ok, err = pcall(function() root:AddKeyEventListener(name, fn) end)
      how = 'string'
    end
    if ok then
      print('listen ok ' .. name .. ' via ' .. how)
    else
      print('listen fail ' .. name .. ' :: ' .. tostring(err))
    end
  end

  -- 每个动作前先 startIfWaiting()：入场态按的第一个键既开始游戏也执行该动作
  -- （不吞键，用例与手感一致）；stage 2 键位表期间除 H/R 外全部忽略。
  local function act(fn)
    return function()
      startIfWaiting()
      if guideStage == 2 then return end
      fn()
    end
  end

  listen('KeyboardCraftspersonKey38Down', act(function()   -- ←
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x - 1, piece.y) then
      piece.x = piece.x - 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardCraftspersonKey39Down', act(function()   -- →
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x + 1, piece.y) then
      piece.x = piece.x + 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardCraftspersonKey36Down', act(rotate))     -- ↑
  listen('KeyboardCraftspersonKey37Down', act(stepDown))   -- ↓
  listen('KeyboardJumpKeyDown', act(function()             -- Space
    if gameOver or not piece then return end
    local dropped = 0
    while not collides(piece.cells, piece.x, piece.y + 1) do
      piece.y = piece.y + 1
      dropped = dropped + 1
    end
    print('harddrop rows=' .. dropped .. ' y=' .. piece.y)
    doLock()
  end))
  -- WASD（真机常用；具名键 MoveLeft/Right/Forward/Backward）
  listen('KeyboardMoveLeftKeyDown', act(function()          -- A
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x - 1, piece.y) then
      piece.x = piece.x - 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardMoveRightKeyDown', act(function()         -- D
    if gameOver or not piece then return end
    if not collides(piece.cells, piece.x + 1, piece.y) then
      piece.x = piece.x + 1
      renderPiece()
      print('move x=' .. piece.x)
    end
  end))
  listen('KeyboardMoveForwardKeyDown', act(rotate))         -- W
  listen('KeyboardMoveBackwardKeyDown', act(stepDown))      -- S
  listen('KeyboardCharacterSkill3KeyDown', function()       -- R 重开（键位表态也允许）
    startIfWaiting()
    if guideStage == 2 then guideStage = 1 setText(hint, '') end
    newGame()
    setText(topBanner, '')
    setText(botBanner, '')
  end)
  listen('KeyboardCharacterSkill1KeyDown', function()       -- H 键位表
    startIfWaiting()
    toggleKeymap()
  end)
  -- T：调试填满最底两行（不消行）。消行必须走真实路径——下一次锁定（硬降/落地）时
  -- 由 doLock -> clearLines 处理，用例 04 因此覆盖的是真实消行链路而不是调试旁路。
  listen('KeyboardCharacterSkill4KeyDown', act(function()
    for rr = ROWS - 1, ROWS do
      for c = 1, COLS do board[rr][c] = COL_BLUE end
    end
    print('debug-fill')
    renderAll()
    renderHud()
  end))

  -- 先开局：即使某个键名注册失败，棋盘与重力也应正常跑（入场态暂停重力）
  local okNew, errNew = pcall(newGame)
  if not okNew then print('newGame error :: ' .. tostring(errNew)) end
end


function OnUpdate(dt)
  local d = tonumber(dt) or 0
  if d <= 0 then return end
  if bannerTimer > 0 then
    bannerTimer = bannerTimer - d
    if bannerTimer <= 0 then
      bannerTimer = 0
      setText(botBanner, '')
      setText(hint, '')
    end
  end
  if guideStage ~= 1 then return end   -- 等待开始 / 键位表 都不跑重力
  acc = acc + d
  local guard = 0
  while acc >= STEP and guard < 8 do
    acc = acc - STEP
    guard = guard + 1
    tickCount = tickCount + 1
    if not gameOver and tickCount % GRAVITY_TICKS == 0 then
      stepDown()   -- 判负在 spawn -> showGameOver 里收口
    end
  end
end

function OnDestroy() end
