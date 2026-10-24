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
-- 模板 guid 候选表：`__GUID_*__` 由 qxqy/build.mjs 注入本工程的实际值（模拟器恒命中）；
-- 真机导入后编辑器会重新编号，所以把真机已知值也列进来。探测按「能力」判类型，不靠名字：
--   cell = image（无光标事件方法） / hit = cursor（有 AddCursorEventListener）。
-- 真机首次导入 hit 后若仍点不动，跑 `node qxqy/deploy.mjs --calibrate` 自动把新 guid 写进这里。
local TPL_GUIDS = {
  cell = { __GUID_CELL__, 1073741849, 1073741854 },
  hit  = { __GUID_HIT__, 1073741884, 1073741865, 1073741866 },
}
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
local flashT, introT, overlay
local introFont, introPulse
local autoDriving = false   -- true = 本次落子由入场 AI 驱动（抑制教学提示与高频日志）
local AI                    -- 入场自演状态机（定义见「AI 自演」段）
local pieceCount = 0        -- 本局已落方块数（结算明细用）
local settleOpen = false    -- 结算明细是否展开（Q 切换）
local RIGHT_CX = 410
local showGameOver, updateBest
local collides, doLock, renderAll, renderPiece, renderHud, spawn, clearLines

local function cellIndex(r, c) return (r - 1) * COLS + c end

local function paint(r, c, color)
  local ctl = cells[cellIndex(r, c)]
  if ctl then ctl.imageColor = color end
end

-- 保护式写入：真机上某些字段/方法会抛错（模拟器接受），一处抛错会中断整段 OnStart
-- ⇒ 首次试玩全部按键无响应的根因（2026-10-24，日志停在 cellCount=200）。
local FAILED = {}
local function noteFail(tag, err)
  if FAILED[tag] then return end
  FAILED[tag] = true
  print('ui fail ' .. tag .. ' :: ' .. tostring(err))
end
local function trySet(ctl, key, value)
  if not ctl then return false end
  local ok, err = pcall(function() ctl[key] = value end)
  if not ok then noteFail(tostring(key), err) return false end
  return true
end
local function tryCall(ctl, method, a, b)
  if not ctl then return false end
  local ok, err = pcall(function() ctl[method](ctl, a, b) end)
  if not ok then noteFail(tostring(method), err) return false end
  return true
end

-- 服务端 textbox 按名字取；某个控件缺失不应炸整段 OnStart（真机与模拟器控件集可能不同）
local function find(name)
  if not root then return nil end
  local ok, ctl = pcall(function() return root:GetChild(name) end)
  if ok then return ctl end
  return nil
end

local function setText(ctl, value)
  if ctl then trySet(ctl, 'text', value) end
end

-- 手机按钮：标签是服务端 textbox（bgColor 当底），点击热区是客户端 cursor 实例（透明，叠在上面）
local BUTTONS = {
  -- 三行按钮：最下一行留 18px 离画布底边（-332 时整块贴边被裁，实测）
  { name = 'btnA', label = '←',    x = -410, y = -185 },
  { name = 'btnB', label = '→',    x = -410, y = -250 },
  { name = 'btnC', label = '↓',    x = -410, y = -315 },
  { name = 'btnD', label = '旋转', x =  410, y = -185 },
  { name = 'btnE', label = '直落', x =  410, y = -250 },
  { name = 'btnF', label = '重开', x =  410, y = -315 },
}
local BTN_W, BTN_H = 150, 56
local hits = {}

-- 文字样式：真机 GIL 里新建的控件没有样式（CLI 只建骨架），全部由 Lua 运行时设置。
-- 框高判据：h >= fontSize*1.45 + 4（见 docs/README §10.2），尺寸在 layout() 里给。
local C_TEXT, C_GOLD2, C_ACCENT2, C_DANGER, C_BTN =
  C(255, 214, 232, 246), C(255, 255, 194, 76), C(255, 118, 214, 255),
  C(255, 255, 77, 77), C(179, 26, 29, 38)
local UI_STYLE = {
  title     = { font = 64, color = C_GOLD2,   align = 'Middle' },
  hud       = { font = 20, color = C_ACCENT2, align = 'Middle' },
  hudNext   = { font = 22, color = C_ACCENT2, align = 'Middle' },
  best      = { font = 20, color = C_GOLD2,   align = 'Middle' },
  hint      = { font = 22, color = C_ACCENT2, align = 'Middle', valign = 'Middle' },
  keyA      = { font = 22, color = C_TEXT,    align = 'Middle' },
  keyB      = { font = 22, color = C_TEXT,    align = 'Middle' },
  keyC      = { font = 22, color = C_TEXT,    align = 'Middle' },
  topBanner = { font = 34, color = C_GOLD2,   align = 'Middle', valign = 'Middle' },
  botBanner = { font = 22, color = C_ACCENT2, align = 'Middle', valign = 'Middle' },
  btnA = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnB = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnC = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnD = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnE = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
  btnF = { font = 22, color = C_TEXT, align = 'Middle', valign = 'Middle', bg = C_BTN },
}
local function applyStyle(name, ctl)
  local st = UI_STYLE[name]
  if not ctl or not st then return end
  if st.font then trySet(ctl, 'fontSize', st.font) end
  if st.color then trySet(ctl, 'fontColor', st.color) end
  if st.bg then trySet(ctl, 'bgColor', st.bg) end
  if st.align then trySet(ctl, 'horizontalAlignment', st.align) end
  if st.valign then trySet(ctl, 'verticalAlignment', st.valign) end
end

-- 按候选 guid 探测模板：needCursor=true 要求该控件具备光标事件方法（cursor/button）
local function probeTemplate(candidates, needCursor)
  for _, g in ipairs(candidates) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, root) end)
    if ok and ctl then
      local okFn, fn = pcall(function() return ctl.AddCursorEventListener end)
      local isCursor = okFn and type(fn) == 'function'
      if isCursor == needCursor then return ctl, g end
      pcall(function() game.DestroyClientUIControl(ctl) end)
    end
  end
  return nil, nil
end

-- 结算压暗：已落方块降到 45% 亮度。
-- 必须做在 renderAll 里而不是只做一次——renderPiece/renderAll 每次重绘都会用 board 原色覆盖，
-- 旧实现只在 showGameOver 里压暗一次，紧接着 spawn()→renderPiece()→renderAll() 就复原了（实测）。
local function dimColor(v)
  local a = v // 16777216
  local rr = (v // 65536) % 256
  local gg = (v // 256) % 256
  local bb = v % 256
  return C(a, rr * 45 // 100, gg * 45 // 100, bb * 45 // 100)
end

renderAll = function()
  local dim = gameOver
  for r = 1, ROWS do
    for c = 1, COLS do
      local v = board[r][c]
      if v == 0 then paint(r, c, COL_EMPTY)
      elseif dim then paint(r, c, dimColor(v))
      else paint(r, c, v) end
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
  setText(hud, '得分 ' .. score .. '　消行 ' .. lines .. '　等级 ' .. level
    .. '　已填 ' .. oc)
  setText(hudNext, '下一个')
  setText(best, '最高 ' .. bestScore)
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
  if not autoDriving then
    print('piece=' .. name .. ' x=' .. piece.x .. ' y=' .. piece.y)
  end
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
    -- 视觉反馈：整盘已落方块闪白 0.12s（每行都触发，不只是首次）
    for r2 = 1, ROWS do
      for c2 = 1, COLS do
        if board[r2][c2] ~= 0 then paint(r2, c2, C(255, 245, 250, 255)) end
      end
    end
    flashT = 0.12
    local pts = { 100, 300, 500, 800 }   -- 1/2/3/4 行
    score = score + pts[cleared] * level
    lines = lines + cleared
    level = lines // 10 + 1
    if autoDriving then
      print('demo clear n=' .. cleared .. ' lines=' .. lines)   -- 自演也在消行（心跳级日志）
    else
      print('clear n=' .. cleared .. ' score=' .. score .. ' lines=' .. lines)
    end
    -- 首次消行：由简入深——把"分值表"这项进阶信息押到玩家已经会消行之后
    -- （入场 AI 自演期间的消行不算，否则玩家真正上手时这条引导已经被吃掉）
    if not taughtClear and not autoDriving then
      taughtClear = true
      setText(hint, '一次消 4 行 +800')
      setText(botBanner, '空格 直落到底')
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
  pieceCount = pieceCount + 1
  if not autoDriving then
    print('lock ' .. piece.name .. ' cells=' .. table.concat(landed, ','))
  end
  clearLines()
  -- 首次锁定：只教"堆满一行即消除"这一条，不叠加其它信息
  if not taughtLock and not autoDriving then
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

-- 顺时针 90°：(r,c) → (c, n+1-r)，盒内 1-based（n = 包围盒边长）。
-- rotate() 与入场 AI 共用同一份转法，避免两处不一致。
local function rotateCells(cells, n)
  local out = {}
  for i = 1, 4 do out[i] = { cells[i][2], n + 1 - cells[i][1] } end
  return out
end

local function rotate()
  if gameOver or not piece then return end
  local nc = rotateCells(piece.cells, piece.n)
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
  pieceCount = 0
  gameOver, tickCount, acc = false, 0, 0
  nextName = BAG[rand(#BAG)]
  spawn()                            -- spawn 内部 renderPiece() 已重画整盘+方块
  renderHud()
  if not autoDriving then print('newgame') end
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
  for _, c in ipairs({ hud, best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', true) end
  trySet(topBanner, 'fontSize', 34)
  trySet(botBanner, 'fontSize', 22)
  if overlay then tryCall(overlay, 'SetVisible', false) end
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

-- 结算页：棋盘暗场 + 顶部大字 + 底部「成绩 + 两个选项」。
-- 位置全部在棋盘之外（顶部/底部横幅）：运行时 InstantiateClientUIControl 造的格子层级高于
-- 服务端文字，中间放任何大字都会被吃掉（真机硬约束）。
showGameOver = function()
  -- 暗场交给 renderAll（它按 gameOver 把已落方块压到 45%）：只在这里画一次的旧实现会被
  -- 紧接着的 spawn()→renderPiece()→renderAll() 复原，实测整盘依旧全亮。
  renderAll()
  bannerTimer = 0
  settleOpen = false
  -- 顶部大字：40 号 → 框高必须 >= 40*1.45+4 = 62（layout 给 64），否则整行静默不画
  -- 为什么不是更大：棋盘顶框在屏幕 y=59，上方净空只有 59px，40 号居中后墨迹 16..56 恰好不压框
  trySet(topBanner, 'fontSize', 40)
  trySet(topBanner, 'fontColor', C(255, 255, 96, 96))
  setText(topBanner, '游戏结束')
  -- 底部一行：成绩 + 两个选项；26 号 → 需 >= 41.7（layout 给 48）
  trySet(botBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C(255, 214, 232, 246))
  setText(botBanner, '本局 ' .. score .. ' 分　消行 ' .. lines .. ' 行'
    .. '　　[R] 再来一局　　[Q] 结算明细')
  setText(hint, '')
  print('guide gameover score=' .. score .. ' lines=' .. lines)
end

updateBest = function()
  if score > bestScore then bestScore = score end
end

--------------------------------------------------------------------------------
-- 入场「AI 自演」：guideStage == 0 时脚本自己玩，玩家一按键（startIfWaiting）立即交还控制。
-- 节奏：思考 0.6s（首块）/ 0.22s（后续）→ 每 0.06s 转一次、每 0.05s 横移一格
--       （逐格走，不是一帧瞬移）→ 停顿 0.10s → 硬降。一块约 0.6~1.0s。
-- 选位：枚举 4 个朝向 × 每个合法列，模拟落地后打分（消行奖励 − 总高 − 空洞 − 崎岖），
--       所以它既不会自杀，也不是纯随机乱走。
-- 保命：堆到 12 行就清盘重开（demoLoopReset），演示循环永远走不到 gameOver。
--------------------------------------------------------------------------------

local AI_THINK_FIRST, AI_THINK, AI_ROT, AI_MOVE, AI_DROP = 0.60, 0.22, 0.06, 0.05, 0.10
local AI_RESET_ROWS = 12     -- 堆到 12 行就清盘重开（任务书给的阈值；20 行上限里留 8 行余量，永远到不了 gameOver）

-- 堆叠高度：最高一列已填的行数（0 = 空盘）
local function stackHeight()
  for r = 1, ROWS do
    for c = 1, COLS do
      if board[r][c] ~= 0 then return ROWS - r + 1 end
    end
  end
  return 0
end

-- 评估「cells 放到 x 列、自然落地」之后的局面，返回分（越大越好）；放不进返回 nil
-- 目标是"看起来像人在玩"：趴低、铺平、不留洞，有机会就补行消掉。
-- 六项（权重都是可调的经验值，用探针实测过：见 docs/README §10.3）：
--   agg（总高）−、holes（空洞，越深越贵）−、bump（相邻列高度差）−、landing（落地高度）−、
--   消掉的整行 +、本块参与消行的格数 +（让 AI 主动去补"只差一格"的行）
local W_AGG, W_HOLE, W_BUMP, W_LANDING, W_LINE, W_ERODE = 0.85, 6.0, 0.65, 0.45, 20, 12

local function evalBoard(cells, x)
  if collides(cells, x, 1) then return nil end
  local y = 1
  while y < ROWS and not collides(cells, x, y + 1) do y = y + 1 end
  local occ, lowest = {}, 0
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      occ[(br - 1) * COLS + bc] = true
    end
    if br > lowest then lowest = br end
  end
  local solid = function(r, c)
    if r < 1 or r > ROWS or c < 1 or c > COLS then return false end
    return occ[(r - 1) * COLS + c] == true or board[r][c] ~= 0
  end
  local heights, agg, holes = {}, 0, 0
  for c = 1, COLS do
    local h = 0
    for r = ROWS, 1, -1 do
      if solid(r, c) then
        h = ROWS - r + 1
        break
      end
    end
    heights[c] = h
    agg = agg + h
    local seen = false
    for r = 1, ROWS do
      if solid(r, c) then
        seen = true
      elseif seen then
        holes = holes + 1 + (ROWS - r) * 0.08   -- 越深的洞越致命
      end
    end
  end
  local bump = 0
  for c = 1, COLS - 1 do bump = bump + math.abs(heights[c] - heights[c + 1]) end
  local complete = 0
  for r = 1, ROWS do
    local full = true
    for c = 1, COLS do
      if not solid(r, c) then
        full = false
        break
      end
    end
    if full then complete = complete + 1 end
  end
  local erode = 0
  for i = 1, 4 do
    local br = y + cells[i][1] - 1
    if br >= 1 and br <= ROWS then
      local full = true
      for c = 1, COLS do
        if not solid(br, c) then
          full = false
          break
        end
      end
      if full then erode = erode + 1 end
    end
  end
  local after = agg - complete * COLS           -- 消行之后的总高
  if after < 0 then after = 0 end
  return complete * W_LINE + erode * W_ERODE
    - after * W_AGG - holes * W_HOLE - bump * W_BUMP - (ROWS - lowest + 1) * W_LANDING
end

-- 选位：4 朝向 × 合法列取最高分；同分取离当前列更近、再更靠左（结果稳定，不会来回抖）
local function aiChoose()
  if not piece or gameOver then return nil end
  local n, maxX = piece.n, COLS - piece.n + 1
  local cells = piece.cells
  local best, bestX, bestRot = nil, piece.x, 1
  for rot = 1, 4 do
    if rot > 1 then cells = rotateCells(cells, n) end
    for x = 1, maxX do
      local sc = evalBoard(cells, x)
      if sc then
        local better = best == nil or sc > best + 1e-9
        if best and not better and math.abs(sc - best) <= 1e-9 then
          local d1, d0 = math.abs(x - piece.x), math.abs(bestX - piece.x)
          better = d1 < d0 or (d1 == d0 and x < bestX)
        end
        if better then
          best, bestX, bestRot = sc, x, rot
        end
      end
    end
  end
  if best == nil then return nil end
  return { rot = bestRot - 1, x = bestX }
end

-- 清盘重开（演示循环用）：不弹结算页，横幅与入场动画复位
local function demoLoopReset()
  autoDriving = true
  newGame()
  autoDriving = false
  introT, introFont, introPulse = 0, 26, 22
  setText(hint, '键盘操作')
  setText(topBanner, '俄罗斯方块')
  setText(botBanner, '按任意键开始')
  trySet(topBanner, 'fontColor', C_GOLD2)
  trySet(topBanner, 'fontSize', 26)
  trySet(botBanner, 'fontColor', C_ACCENT2)
  trySet(botBanner, 'fontSize', 22)
  AI.phase, AI.t, AI.plan, AI.piece, AI.first = 'think', 0, nil, nil, false
end

-- 硬降到底 + 落子；期间的日志与教学提示全部静音（autoDriving）
local function aiDrop()
  local guard = 0
  while guard < ROWS + 4 and not collides(piece.cells, piece.x, piece.y + 1) do
    piece.y = piece.y + 1
    guard = guard + 1
  end
  autoDriving = true
  local ok, err = pcall(doLock)
  autoDriving = false
  if not ok then
    print('demo lock error :: ' .. tostring(err))
    return
  end
  AI.count = AI.count + 1
  if AI.count % 10 == 0 then print('demo auto n=' .. AI.count) end   -- 心跳，不刷屏
  local h = stackHeight()
  if gameOver or h >= AI_RESET_ROWS then
    print('demo reset stack=' .. h)
    demoLoopReset()
  end
end

AI = { phase = 'think', t = 0, plan = nil, piece = nil, count = 0, first = true }

-- 每个 OnUpdate 调一次：think（思考）→ act（旋转 / 横移一格 / 硬降，每个动作隔一个间隔）
autoTick = function(dt)
  if guideStage ~= 0 then return end      -- 玩家已接管，或正在看键位表：不再自动操作
  if gameOver then
    demoLoopReset()                       -- 兜底：真走到结算就清盘继续演
    return
  end
  if not piece or not board then return end
  AI.t = AI.t + dt
  if AI.phase == 'think' then
    local wait = AI_THINK
    if AI.first then wait = AI_THINK_FIRST end
    if AI.t < wait then return end
    AI.t = 0
    AI.first = false
    AI.piece = piece
    AI.plan = aiChoose() or { rot = 0, x = piece.x }
    AI.phase = 'act'
    return
  end
  if not AI.plan or AI.piece ~= piece then
    AI.phase, AI.t, AI.plan, AI.piece = 'think', 0, nil, nil
    return
  end
  if AI.plan.rot > 0 then
    if AI.t < AI_ROT then return end
    AI.t = 0
    AI.plan.rot = AI.plan.rot - 1
    local nc = rotateCells(piece.cells, piece.n)
    if not collides(nc, piece.x, piece.y) then
      piece.cells = nc
      renderPiece()
    else
      AI.plan.rot = 0                     -- 转不动就别卡死，按当前朝向继续
    end
    return
  end
  if piece.x ~= AI.plan.x then
    if AI.t < AI_MOVE then return end
    AI.t = 0
    local dir = 1
    if AI.plan.x < piece.x then dir = -1 end
    if not collides(piece.cells, piece.x + dir, piece.y) then
      piece.x = piece.x + dir
      renderPiece()
    else
      AI.plan.x = piece.x                 -- 被挡住就停在当前列，直接落
    end
    return
  end
  if AI.t < AI_DROP then return end
  AI.t = 0
  aiDrop()
  AI.phase, AI.plan, AI.piece = 'think', nil, nil
end

--------------------------------------------------------------------------------
-- 布局：按画布尺寸算三栏 + 上下横幅（换设备不用重新导入）
--------------------------------------------------------------------------------

local function layout(W, H)
  local halfW, halfH = W / 2, H / 2
  local panelW = 420
  local leftCX, rightCX = -(halfW - panelW / 2 - 20), halfW - panelW / 2 - 20
  RIGHT_CX = rightCX
  local function place(ctl, x, y, w, h)
    if not ctl then return end
    tryCall(ctl, 'SetSizeDelta', w, h)
    tryCall(ctl, 'SetAnchoredPosition', x, y)
  end
  -- 框高硬判据（渲染器实测）：h >= fontSize*1.45 + 4 才画这一行，否则整行静默不画。
  -- 64 号 -> >=96.8（h=96 曾整块消失）、34 -> >=53.3、26 -> >=41.7、22 -> >=35.9。
  -- 左栏：标题/统计/最高/提示 作为一个整组垂直居中（贴顶贴底会显得散）
  place(title, leftCX, 130, panelW, 100)             -- 64 号
  place(hud, leftCX, 40, panelW + 40, 40)            -- 20 号：22 号时尾部一个字被裁，实测
  place(best, leftCX, -10, panelW, 36)               -- 20 号
  place(hint, leftCX, -95, panelW, 150)              -- 22 号
  place(hudNext, rightCX, halfH - 150, 200, 40)      -- 22 号
  place(keyA, rightCX, -40, panelW, 38)              -- 22 号
  place(keyB, rightCX, -80, panelW, 38)              -- 22 号
  place(keyC, rightCX, -120, panelW, 38)             -- 22 号
  for _, b in ipairs(BUTTONS) do
    local ctl = find(b.name)
    if ctl then
      if isMobile then
        place(ctl, b.x, b.y, BTN_W, BTN_H)
        tryCall(ctl, 'SetVisible', true)
      else
        tryCall(ctl, 'SetVisible', false)   -- PC 端不展示移动按钮
      end
    end
  end
  applyStyle('title', title) applyStyle('hud', hud) applyStyle('hudNext', hudNext)
  applyStyle('best', best) applyStyle('hint', hint)
  applyStyle('keyA', keyA) applyStyle('keyB', keyB) applyStyle('keyC', keyC)
  applyStyle('topBanner', topBanner) applyStyle('botBanner', botBanner)
  for _, b in ipairs(BUTTONS) do applyStyle(b.name, find(b.name)) end
  -- 横幅框高按判据算「同时装得下的最大字号」：入场标题会长到 40、结算大字 40（都需 62）
  -- ⇒ topBanner 给 64；旧实现 56 高，标题长过 35 号就整行静默消失（实测）。
  -- 纵向位置：框 64 居中在屏幕上 4..68 那条带子里（棋盘顶框在 59，40 号墨迹 16..56 不压框）
  place(topBanner, 0, halfH - 36, W - 180, 64)
  -- 底行：结算 26 号（需 41.7）、入场呼吸 22~23 号 ⇒ 给 48
  place(botBanner, 0, -(halfH - 28), W - 180, 48)
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

  -- 平台：移动/触屏才显示可点按钮（PC 端键位卡够了）
  local isMobile = true
  do
    local okDev, dev = pcall(function() return game.GetDevice() end)
    if okDev and type(Enum) == 'table' and Enum.Device then
      isMobile = (dev == Enum.Device.Mobile or dev == Enum.Device.MobileController)
      print('device=' .. tostring(dev) .. ' mobile=' .. tostring(isMobile))
    else
      print('device=unknown（按移动端处理，按钮可见）')
    end
  end

  -- 模板 guid 探测（双宿主）：先 cell（image，无光标事件）再 hit（cursor，有光标事件）
  local firstCell, tplGuid = probeTemplate(TPL_GUIDS.cell, false)
  if not firstCell then
    error('tetris: cell 模板 guid 都不可用，候选=' .. #TPL_GUIDS.cell
      .. '（导入后跑 node qxqy/deploy.mjs --calibrate）')
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

  -- 结算不用中间遮罩：运行时实例的层级高于服务端文字，遮罩会把结算文字盖掉（实测）
  -- 改为「棋盘暗场 + 顶部/底部大字」，文字始终在棋盘之外，不会被遮挡
  overlay = nil

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
  local okLayout, errLayout = pcall(layout, W, H)
  if not okLayout then print('layout error :: ' .. tostring(errLayout)) end

  -- 引导初始态：等玩家按第一个键（重力暂停，画面静止好读）
  guideStage, bannerTimer, taughtLock, taughtClear = 0, 0, false, false
  flashT, introT, introFont, introPulse = 0, 0, 24, 22   -- introFont/Pulse = 上次写进控件的值（变了才写）
  bestScore = 0
  setText(title, '')
  for _, c in ipairs({ hud, best, hint, keyA, keyB, keyC }) do tryCall(c, 'SetVisible', false) end
  tryCall(title, 'SetVisible', false)
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
    if overlay then tryCall(overlay, 'SetVisible', false) end
    -- 结算态改过横幅字号/颜色，重开必须还原：几何与样式只认 layout 这一份
    local okRelayout, errRelayout = pcall(layout, W, H)
    if not okRelayout then print('relayout error :: ' .. tostring(errRelayout)) end
  end)
  -- Q：结算明细（结算态才有意义）。明细走左栏 hint（棋盘外，不会被实例格子盖住）
  listen('KeyboardCharacterSkill2KeyDown', function()
    startIfWaiting()
    if not gameOver then return end
    settleOpen = not settleOpen
    if settleOpen then
      setText(hint, '本局落块 ' .. pieceCount .. '　消行 ' .. lines .. '　最高 ' .. bestScore)
      print('settle detail on')
    else
      setText(hint, '')
      print('settle detail off')
    end
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

  -- 手机按钮热区：优先用布局里已存在的光标检测区（gsts assets:ui create 建档，无需导入）；
  -- 取不到时退化为客户端 cursor 模板实例（老路线）。
  local function hitOf(name)
    local c = find(name .. 'hit')
    if c then return c end
    return nil
  end
  local anyHit = hitOf(BUTTONS[1].name)
  local firstHit, hitGuid
  if not anyHit then
    firstHit, hitGuid = probeTemplate(TPL_GUIDS.hit, true)
  end
  if anyHit or firstHit then
    if hitGuid then print('hit guid=' .. hitGuid) else print('hit source=layout') end
    local cursorDown = (type(Enum) == 'table' and Enum.CursorEventType
      and Enum.CursorEventType.CursorDown) or nil
    local actions = {
      btnA = function() if guideStage ~= 2 and not gameOver and piece
        and not collides(piece.cells, piece.x - 1, piece.y) then
        piece.x = piece.x - 1 renderPiece() print('move x=' .. piece.x) end end,
      btnB = function() if guideStage ~= 2 and not gameOver and piece
        and not collides(piece.cells, piece.x + 1, piece.y) then
        piece.x = piece.x + 1 renderPiece() print('move x=' .. piece.x) end end,
      btnC = function() if guideStage ~= 2 then stepDown() end end,
      btnD = function() if guideStage ~= 2 then rotate() end end,
      btnE = function()
        if guideStage == 2 or gameOver or not piece then return end
        while not collides(piece.cells, piece.x, piece.y + 1) do piece.y = piece.y + 1 end
        print('touchdrop y=' .. piece.y)
        doLock()
      end,
      btnF = function()
        if guideStage == 2 then guideStage = 1 setText(hint, '') end
        newGame()
        setText(topBanner, '') setText(botBanner, '')
      end,
    }
    for i, b in ipairs(BUTTONS) do
      local h = hitOf(b.name)
      if not h then
        h = firstHit
        firstHit = nil
        if not h then h = game.InstantiateClientUIControl(hitGuid, root) end
      end
      if h then
        h.name = b.name .. 'hit'
        if h.name ~= b.name .. 'hit' then
          h:SetSizeDelta(BTN_W, BTN_H)
          h:SetAnchoredPosition(b.x, b.y)
        end
        local act = actions[b.name]
        local okReg = pcall(function() h:AddCursorEventListener(cursorDown, function()
          startIfWaiting()
          if act then act() end
        end) end)
        if not okReg then print('hit listen fail ' .. b.name) end
        hits[i] = h
      end
    end
    print('hits=' .. #hits)
  else
    print('hits=0 click disabled（真机导入后跑 node qxqy/deploy.mjs --calibrate）')
  end

  -- 入场态兜底：43 个可编程键位里凡是没被上面映射的，都只做"开始游戏"这一件事
  local mapped = { [36] = true, [37] = true, [38] = true, [39] = true }
  local anyKeyStart = function()
    if guideStage == 0 then startIfWaiting() end
  end
  for i = 1, 43 do
    if not mapped[i] then
      listen('KeyboardCraftspersonKey' .. i .. 'Down', anyKeyStart)
    end
  end

  -- 先开局：即使某个键名注册失败，棋盘与重力也应正常跑（入场态暂停重力）
  local okNew, errNew = pcall(newGame)
  if not okNew then print('newGame error :: ' .. tostring(errNew)) end
end


function OnUpdate(dt)
  local d = tonumber(dt) or 0
  if d <= 0 then return end
  if bannerTimer > 0 and not gameOver then
    bannerTimer = bannerTimer - d
    if bannerTimer <= 0 then
      bannerTimer = 0
      setText(botBanner, '')
      setText(hint, '')
    end
  end
  if flashT > 0 then
    flashT = flashT - d
    if flashT <= 0 then flashT = 0 renderAll() end
  end
  if guideStage == 0 then
    -- 入场演出：标题 26→40 渐大 + 底部提示呼吸（框高 72 按 46 号算过，40 号不会被裁）
    introT = introT + d
    local size = math.min(40, 26 + math.floor(introT * 12))
    if size ~= introFont then
      introFont = size
      trySet(topBanner, 'fontSize', size)
    end
    local pulse = 22 + math.floor(2 * (0.5 + 0.5 * math.sin(introT * 5)))
    if pulse ~= introPulse then
      introPulse = pulse
      trySet(botBanner, 'fontSize', pulse)
    end
    autoTick(d)   -- AI 自演：选位→旋转→逐格横移→硬降→消行→下一块，玩家按键即交还控制
    return
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
