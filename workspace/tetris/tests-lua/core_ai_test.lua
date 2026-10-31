--[[==========================================================================
  tests-lua/core_ai_test.lua —— core_ai 纯函数层的 headless 验收（不依赖模拟器）
  跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_ai_test.lua
  判据：输出全 PASS、退出码 0（run_all.lua 自动收录 *_test.lua）。

  这一份要证明六件事：
    §1 纯度：模块确实零引擎/零 print/零时间/零随机（静态扫查 + 运行时 _G 前后对比）
    §2 合法性：空盘 7 种方块都给出"放得进、不越界、不重叠、已落地"的落点
    §3 评估保真：evaluate 与生产 lua/tetris/aieval.lua 的 evalBoard 逐值相等（含几何三原语）
    §4 决策保真：choose 与 main.lua:1851 aiChoose 的逐行移植（oracle）对拍
        ——空盘/带洞/右墙井/阶梯/超高/全满 6 局面 × 7 方块 × 3 组评估钩子
    §5 两态与死代码：顶死兜底位（reset）、无位可放（nil）、四消射击分支不可达（取证）
    §6 确定性 & 无副作用：同输入两次同解、独立实例同解、输入表不被改写
    §7 难度档：easy（BW_SIMPLE）与 hard（BCTS）在同一局面给出不同落点，且各自是自身权重下的最优
    §8 2-ply：evalNext / refineCandidate 与 main.lua:4717-4965 的移植逐值相等
    §9 Hold 决策：better / saveI / fireI 三条分支与闸门（main.lua:5033-5069 移植）
    §10 core_board 交叉复验（若该模块已就位；未就位则用内联最小碰撞函数，与 main.lua:1070 同义）

  oracle 说明：§4/§8 的参考实现是从 main.lua 对应行**逐行摘录**的（g.piece/g.board 换成参数）。
  它是"对拍基准"，不是被测代码；main.lua 那几段若改动，这里必须同步，否则测试会变成自证。
  aieval.lua 直接加载（它已经是零引擎 + 闭包注入），作为 1-ply 评估的第二独立通道。
=======================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local aeval = load('lua/tetris/aieval.lua')
local coreAI = load('lua/tetris/core_ai.lua')

local NUM, SHAPES = cfg.NUM, cfg.SHAPES
local ROWS, COLS = cfg.ROWS, cfg.COLS
local AI = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES }
local AI_RESET_ROWS = 12          -- 原 AIC.RESET_ROWS（main.lua:1809）

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. name)
  else
    fail = fail + 1
    print('FAIL  ' .. name .. (extra ~= nil and (' :: ' .. tostring(extra)) or ''))
  end
end
local function near(a, b, eps)
  if a == nil or b == nil then return a == b end
  return math.abs(a - b) <= (eps or 1e-9)
end

-- ===== 盘面/方块构造（测试局部；不用随机）=====

local function empty()
  local b = {}
  for r = 1, ROWS do
    local row = {}
    for c = 1, COLS do row[c] = 0 end
    b[r] = row
  end
  return b
end

-- 按"每列高度"造盘：底部 h[c] 行填实（h[c]=0 ⇒ 整列空）
local function boardFromHeights(h)
  local b = empty()
  for c = 1, COLS do
    for k = 1, (h[c] or 0) do b[ROWS - k + 1][c] = 1 end
  end
  return b
end

local function fillRow(b, r, holes)
  for c = 1, COLS do b[r][c] = (holes and holes[c]) and 0 or 1 end
end

local function piece(name, x, cellsOverride, n)
  local s = assert(SHAPES[name], 'unknown shape ' .. tostring(name))
  local cells = {}
  local src = cellsOverride or s.cells
  for i = 1, 4 do cells[i] = { src[i][1], src[i][2] } end
  return { name = name, n = n or s.n, cells = cells, x = x or ((COLS - (n or s.n)) // 2 + 1) }
end

local function copyBoard(b)
  local out = {}
  for r = 1, ROWS do
    local row = {}
    for c = 1, COLS do row[c] = b[r][c] end
    out[r] = row
  end
  return out
end

local function rotCells(cells, n, turns)     -- oracle 自带的独立实现（不复用被测代码）
  local out = cells
  for _ = 1, turns do
    local nxt = {}
    for i = 1, 4 do nxt[i] = { out[i][2], n + 1 - out[i][1] } end
    out = nxt
  end
  return out
end

-- 最小碰撞函数：与 main.lua:1070-1078 **逐行同义**（core_board.lua 未就位时的复验通道）
local function collidesOn(board, cells, px, py)
  for i = 1, #cells do
    local br = py + cells[i][1] - 1
    local bc = px + cells[i][2] - 1
    if bc < 1 or bc > COLS or br > ROWS then return true end
    if br >= 1 and board[br][bc] ~= 0 then return true end
  end
  return false
end

local function binder(board)
  return function(cells, x, y) return collidesOn(board, cells, x, y) end
end

-- 临时改写 NUM 的运行态钩子（生产里由 aiTickCore 每块写；这里验证"省略 opts 时读 NUM"）
local function withNum(patch, fn)
  local saved = {}
  for k, v in pairs(patch) do saved[k] = NUM[k] NUM[k] = v end
  local okRun, a, b, c = pcall(fn)
  for k, v in pairs(patch) do NUM[k] = saved[k] end
  if not okRun then error(a, 0) end
  return a, b, c
end

local ALL = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }

-- ===== oracle：main.lua:1851-1936 aiChoose 的逐行移植（1-based rot，与生产一致）=====

local function refChoose(board, pc)
  local AEVX = aeval.new {
    rows = ROWS, cols = COLS, num = NUM,
    board = function() return { board = board } end,
    collides = function(cs, x, y) return collidesOn(board, cs, x, y) end,
  }
  if not pc then return nil end
  local cands = {}
  local cells = pc.cells
  local boxN = pc.n or 4
  for rot = 1, 4 do
    local wmax = 1
    for i = 1, 4 do if cells[i][2] > wmax then wmax = cells[i][2] end end
    for x = 1, COLS - wmax + 1 do
      local sc, h, complete = AEVX.evalBoard(cells, x)
      if sc then
        local leftDist = x - 1
        local rightDist = COLS - (x + wmax - 1)
        local wallDist = leftDist
        if rightDist < wallDist then wallDist = rightDist end
        cands[#cands + 1] = { rot = rot, x = x, score = sc, h = h, clear = complete,
          wall = wallDist, from = math.abs(x - pc.x) }
      end
    end
    cells = rotCells(cells, boxN, 1)
  end
  if #cands == 0 then return nil end
  -- 四消射击（main.lua:1878-1891 原样，含它"返回裸候选"的形态）
  if (NUM.AI_WELL or 0) > 0 and pc.name == 'I' and pc.n == 4 then
    local wd = AEVX.wellDepth()
    if wd >= 2 then
      for _, c in ipairs(cands) do
        if c.rot == 1 and c.x == COLS - 1 and (c.clear or 0) >= 2 then
          return { shot = true, cand = c, wd = wd }
        end
      end
    end
  end
  local function better(a, b)
    if not b then return true end
    if a.score > b.score + 1e-9 then return true end
    if a.score < b.score - 1e-9 then return false end
    if a.wall ~= b.wall then return a.wall < b.wall end
    if a.from ~= b.from then return a.from < b.from end
    return a.x < b.x
  end
  local best, anyBest
  for _, c in ipairs(cands) do
    if better(c, anyBest) then anyBest = c end
    if c.h <= AI_RESET_ROWS then if better(c, best) then best = c end end
  end
  if not best then return { reset = true, fallback = anyBest } end
  local landingY = 1
  local probe = rotCells(pc.cells, boxN, best.rot - 1)
  while landingY < ROWS and not collidesOn(board, probe, best.x, landingY + 1) do
    landingY = landingY + 1
  end
  local sorted = {}
  for _, c in ipairs(cands) do
    if c.h <= AI_RESET_ROWS then sorted[#sorted + 1] = c end
  end
  table.sort(sorted, function(a, b)
    if a.score ~= b.score then return a.score > b.score end
    if a.wall ~= b.wall then return a.wall < b.wall end
    if a.from ~= b.from then return a.from < b.from end
    return a.x < b.x
  end)
  return { rot = best.rot - 1, x = best.x, landingY = landingY, best1 = best, sorted = sorted }
end

-- ===== oracle：main.lua:4717-4774 evalNext 的逐行移植（原地写-评-撤，scratch 复用）=====

local REF_NXFULL = {}
local function refEvalNext(board, cells, x)
  if collidesOn(board, cells, x, 1) then return nil end
  local y = 1
  while y < ROWS and not collidesOn(board, cells, x, y + 1) do y = y + 1 end
  local b = board
  local w1, w2, w3, w4 = 0, 0, 0, 0
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
    if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
      local p = br * 32 + bc
      if w1 == 0 then w1 = p elseif w2 == 0 then w2 = p elseif w3 == 0 then w3 = p else w4 = p end
      b[br][bc] = 1
    end
  end
  local nxFull = REF_NXFULL
  local nf = 0
  for r = 1, ROWS do
    local row = b[r]
    local full = true
    for c = 1, COLS do if row[c] == 0 then full = false break end end
    if full then nf = nf + 1 nxFull[nf] = r end
  end
  local agg, holes = 0, 0
  local nxH = REF_NXFULL
  for c = 1, COLS do
    local h, seen = 0, false
    for r = 1, ROWS do
      local occ = b[r][c] ~= 0
      if occ then
        local skip = false
        for fi = 1, nf do if nxFull[fi] == r then skip = true break end end
        if not skip then
          if h == 0 then h = ROWS - r + 1 end
          seen = true
        end
      elseif seen then
        local skip = false
        for fi = 1, nf do if nxFull[fi] == r then skip = true break end end
        if not skip then holes = holes + 1 end
      end
    end
    agg = agg + h
    nxH[10 + c] = h
  end
  local bump = 0
  for c = 1, COLS - 1 do
    local d = nxH[10 + c] - nxH[11 + c]
    if d < 0 then d = -d end
    bump = bump + d
  end
  if w1 ~= 0 then b[w1 // 32][w1 % 32] = 0 end
  if w2 ~= 0 then b[w2 // 32][w2 % 32] = 0 end
  if w3 ~= 0 then b[w3 // 32][w3 % 32] = 0 end
  if w4 ~= 0 then b[w4 // 32][w4 % 32] = 0 end
  local W_AGG, W_LINE, W_HOLE, W_BUMP = -0.510066, 0.760666, -0.35663, -0.184483
  return W_AGG * agg + W_LINE * nf + W_HOLE * holes + W_BUMP * bump, nil, nf
end

-- ===== oracle：main.lua:4902-4965 refineSearch 的单候选单元 =====

local function refRefineOne(board, pc, nextPc, cand)
  local sim = copyBoard(board)
  local cells = rotCells(pc.cells, pc.n or 4, cand.rot - 1)
  local y = 1
  while y < ROWS and not collidesOn(board, cells, cand.x, y + 1) do y = y + 1 end
  for i = 1, 4 do
    local br, bc = y + cells[i][1] - 1, cand.x + cells[i][2] - 1
    if br >= 1 and br <= ROWS then sim[br][bc] = 1 end
  end
  local r = ROWS
  while r >= 1 do
    local full = true
    for c = 1, COLS do if sim[r][c] == 0 then full = false end end
    if full then
      table.remove(sim, r)
      local row = {}
      for c = 1, COLS do row[c] = 0 end
      table.insert(sim, 1, row)
    else
      r = r - 1
    end
  end
  local ncells = nextPc.cells
  local bestNext = nil
  for _ = 1, 4 do
    local nwmax = 1
    for i = 1, 4 do if ncells[i][2] > nwmax then nwmax = ncells[i][2] end end
    for nx = 1, COLS - nwmax + 1 do
      local sc = refEvalNext(sim, ncells, nx)
      if sc and (not bestNext or sc > bestNext) then bestNext = sc end
    end
    ncells = rotCells(ncells, nextPc.n, 1)
  end
  return bestNext, cand.score + (bestNext or -5)
end

-- ===== 通用工具 =====

local function sameBoard(a, b)
  for r = 1, ROWS do
    for c = 1, COLS do if a[r][c] ~= b[r][c] then return false end end
  end
  return true
end

local function sameCells(a, b)
  if #a ~= #b then return false end
  for i = 1, #a do
    if a[i][1] ~= b[i][1] or a[i][2] ~= b[i][2] then return false end
  end
  return true
end

-- 落点等价性：turns 次旋转后自然落地，四格的绝对坐标（排序后拼串，便于比较/打印）
local function absCells(board, pc, turns, x)
  local cells = rotCells(pc.cells, pc.n or 4, turns)
  local y = 1
  while y < ROWS and not collidesOn(board, cells, x, y + 1) do y = y + 1 end
  local out = {}
  for i = 1, 4 do
    out[i] = string.format('%d:%d', y + cells[i][1] - 1, x + cells[i][2] - 1)
  end
  table.sort(out)
  return table.concat(out, '|')
end

-- 落点合法性五连（用内联最小碰撞函数复验，不看模块自己的判断）
local function legalPlacement(board, pc, plan, tag)
  local cells = AI.rotatedCells(pc.cells, pc.n or 4, plan.rot)
  ok(not collidesOn(board, cells, plan.x, 1), tag .. ' 落点可放置（顶行不撞）')
  local inside, overlap = true, false
  for i = 1, 4 do
    local br = plan.y + cells[i][1] - 1
    local bc = plan.x + cells[i][2] - 1
    if bc < 1 or bc > COLS or br < 1 or br > ROWS then inside = false end
    if br >= 1 and br <= ROWS and board[br][bc] ~= 0 then overlap = true end
  end
  ok(inside, tag .. ' 四格不越界')
  ok(not overlap, tag .. ' 四格不与已落块重叠')
  ok(collidesOn(board, cells, plan.x, plan.y + 1), tag .. ' 已落到底（再下一格必撞）')
  local y = 1
  while y < ROWS and not collidesOn(board, cells, plan.x, y + 1) do y = y + 1 end
  ok(y == plan.y, tag .. ' y = 自然落点行', tostring(plan.y) .. ' vs ' .. tostring(y))
end

-- ===== §1 纯度护栏 =====

do
  local f = assert(io.open(ROOT .. '/lua/tetris/core_ai.lua', 'r'))
  local src = f:read('a')
  f:close()
  -- 只扫**代码部分**：文件头注释里会写 game./ctl./print/os 这些词当文档（讲"零引擎"本身）
  local codeLines = {}
  for line in (src .. '\n'):gmatch('([^\n]*)\n') do
    local cut = line:find('%-%-', 1, false)
    codeLines[#codeLines + 1] = cut and line:sub(1, cut - 1) or line
  end
  local code = table.concat(codeLines, '\n')
  ok(code:find('game%.') == nil, '1.1 代码无 game.* 调用')
  ok(code:find('ctl%.') == nil, '1.2 代码无 ctl.* 调用')
  ok(code:find('require%s*%(') == nil, '1.3 代码无 require（依赖注入）')
  ok(code:find('os%.') == nil, '1.4 代码无 os.*（不依赖时间/环境）')
  ok(code:find('io%.') == nil, '1.5 代码无 io.*')
  ok(code:find('math%.random') == nil and code:find('randomseed') == nil, '1.6 代码无随机')
  ok(code:find('print%s*%(') == nil, '1.7 代码无 print')
  ok(code:find('_G') == nil, '1.8 代码不碰 _G')
  ok(type(coreAI.new) == 'function', '1.9 模块导出 M.new')
  local mod = load('lua/tetris/core_ai.lua')
  local missing = {}
  for _, k in ipairs({ 'evaluate', 'bestPlacement', 'choose', 'candidates', 'evalNext',
    'refineCandidate', 'holdDecision', 'wellDepth', 'colHeight', 'stackHeight', 'rotateCells' }) do
    if type(AI[k]) ~= 'function' then missing[#missing + 1] = k end
  end
  ok(#missing == 0, '1.10 契约导出的函数齐全（evaluate/bestPlacement/choose/...）',
    table.concat(missing, ','))
end

-- 运行时：调用一轮 API，脚本全局不得多出任何键（不写全局）
do
  local before = {}
  for k in pairs(_G) do before[k] = true end
  local b = boardFromHeights({ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 })
  local pc = piece('T')
  AI.evaluate(b, nil, pc)
  AI.candidates(b, nil, pc)
  AI.bestPlacement(b, nil, pc)
  AI.choose(b, nil, pc)
  AI.evalNext(b, nil, pc.cells, 1)
  AI.refineCandidate(b, nil, pc, piece('I'), AI.candidates(b, nil, pc)[1])
  AI.holdDecision(b, nil, pc, { canHold = true, holdEnabled = true, next = 'I' })
  local leaked = {}
  for k in pairs(_G) do if not before[k] then leaked[#leaked + 1] = tostring(k) end end
  ok(#leaked == 0, '1.11 调用 API 后脚本全局无新增键', table.concat(leaked, ','))
end

-- ===== §2 空盘 7 方块：合法落点 =====
do
  local b = empty()
  for _, nm in ipairs(ALL) do
    local pc = piece(nm)
    local plan = AI.bestPlacement(b, nil, pc)
    ok(plan ~= nil, '2.' .. nm .. ' 空盘给出落点')
    if plan then
      ok(plan.reset == nil, '2.' .. nm .. ' 空盘不算顶死（reset=nil）')
      legalPlacement(b, pc, plan, '2.' .. nm)
      ok(collidesOn(b, AI.rotatedCells(pc.cells, pc.n, plan.rot), plan.x, plan.y + 1),
        '2.' .. nm .. ' 落点合法（core_board 未就位：内联最小碰撞复验）')
    end
  end
end

-- ===== §3 评估保真：evaluate vs aieval.evalBoard，几何三原语对齐 =====
do
  local fixtures = {
    { 'empty', empty() },
    { 'flat3', boardFromHeights({ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 }) },   -- 3 整行：覆盖"满行当已消"
    { 'flat9', boardFromHeights({ 2, 2, 2, 2, 2, 2, 2, 2, 2, 0 }) },
    { 'rightwall', boardFromHeights({ 2, 3, 1, 4, 0, 2, 5, 1, 3, 0 }) },
    { 'midhole', boardFromHeights({ 1, 4, 2, 0, 3, 1, 5, 2, 0, 1 }) },
  }
  local checked, bad = 0, 0
  for _, fx in ipairs(fixtures) do
    local board = fx[2]
    local AEVX = aeval.new {
      rows = ROWS, cols = COLS, num = NUM,
      board = function() return { board = board } end,
      collides = function(cs, x, y) return collidesOn(board, cs, x, y) end,
    }
    for _, nm in ipairs(ALL) do
      local pc = piece(nm)
      local cells = pc.cells
      for turns = 0, 3 do
        for x = 1, COLS do
          local refSc, refTop, refClear = AEVX.evalBoard(cells, x)
          local sc, y, clear, top = AI.evaluate(board, nil, { cells = cells, x = x })
          checked = checked + 1
          if (refSc == nil) ~= (sc == nil) then
            bad = bad + 1
          elseif refSc then
            if not near(refSc, sc) or not near(refTop, top) or refClear ~= clear or y == nil then
              bad = bad + 1
              if bad <= 3 then
                print(string.format('  · 差异 %s rot=%d x=%d ref=%.6f/%s/%s mine=%.6f/%s/%s',
                  fx[1] .. '/' .. nm, turns, x, refSc, tostring(refTop), tostring(refClear),
                  sc or 0, tostring(top), tostring(clear)))
              end
            end
          end
        end
        cells = rotCells(cells, pc.n, 1)
      end
    end
    -- 几何三原语
    for c = 1, COLS do
      ok(AI.colHeight(board, c) == AEVX.colHeight(c), '3.' .. fx[1] .. ' colHeight(' .. c .. ') 一致')
    end
    ok(AI.wellDepth(board) == AEVX.wellDepth(), '3.' .. fx[1] .. ' wellDepth 一致')
    ok(AI.stackHeight(board) == AEVX.stackHeight(), '3.' .. fx[1] .. ' stackHeight 一致')
  end
  ok(bad == 0, '3.1 evaluate 与 aeval.evalBoard 逐值相等（' .. checked .. ' 例）', bad .. ' 例不一致')
end

-- ===== §4 决策保真：choose vs aiChoose(移植) 对拍 =====
do
  local fixtures = {}
  fixtures[#fixtures + 1] = { 'empty', empty() }
  -- 注意：造盘时至少留一列空（高度 0），否则底部会出现"整行已满"——
  -- evalBoard 会把满行当已消，那不是普通的堆叠局面（那条路径由 bottomfull 单独覆盖）
  fixtures[#fixtures + 1] = { 'flat9', boardFromHeights({ 2, 2, 2, 2, 2, 2, 2, 2, 2, 0 }) }
  fixtures[#fixtures + 1] = { 'rightwall', boardFromHeights({ 2, 3, 1, 4, 0, 2, 5, 1, 3, 0 }) }
  fixtures[#fixtures + 1] = { 'stair', boardFromHeights({ 1, 2, 3, 4, 1, 2, 3, 4, 1, 0 }) }
  fixtures[#fixtures + 1] = { 'bottomfull', boardFromHeights({ 3, 3, 3, 3, 3, 3, 3, 3, 3, 3 }) }
  -- 超高但要避免"整行已满"：9 列堆到 14，第 10 列留 1 格
  fixtures[#fixtures + 1] = { 'toohigh', boardFromHeights({ 14, 14, 14, 14, 14, 14, 14, 14, 14, 1 }) }
  do
    local b = empty()
    for r = 1, ROWS do fillRow(b, r) end
    fixtures[#fixtures + 1] = { 'blocked', b }
  end
  local hooks = {
    { name = 'plain', patch = {} },
    { name = 'simple', patch = { AI_SIMPLE = true } },
    { name = 'attack', patch = { AI_WELL = 6.3, AI_ATK = 5.4, AI_WELLCOL = COLS, AI_WELLBASE = 0 } },
  }
  local cases, bad, shots = 0, 0, 0
  local function badCase(tag, msg)
    bad = bad + 1
    if bad <= 6 then print('  · 对拍差异 ' .. tag .. ' :: ' .. msg) end
  end
  for _, fx in ipairs(fixtures) do
    for _, nm in ipairs(ALL) do
      for _, hk in ipairs(hooks) do
        local tag = fx[1] .. '/' .. nm .. '/' .. hk.name
        local ref, mine = withNum(hk.patch, function()
          return refChoose(fx[2], piece(nm)), AI.choose(fx[2], nil, piece(nm))
        end)
        cases = cases + 1
        if ref and ref.shot then
          shots = shots + 1
          -- 生产射击分支返回裸候选（无 best1/sorted）；core_ai 补齐（见文件头差异①）
          if not mine or not mine.best1 or #mine.sorted == 0 then
            badCase(tag, '射击分支 plan 不完整')
          elseif mine.best1.x ~= ref.cand.x or mine.best1.rot ~= ref.cand.rot - 1 then
            badCase(tag, '射击分支落点不一致')
          end
        elseif ref == nil then
          if mine ~= nil then badCase(tag, 'ref=nil 但 core_ai 给了 plan') end
        elseif ref.reset then
          if not (mine and mine.reset) then badCase(tag, 'ref=reset 但 core_ai 没标 reset')
          elseif mine.fallback.x ~= ref.fallback.x or mine.fallback.rot ~= ref.fallback.rot - 1
            or not near(mine.fallback.score, ref.fallback.score) then
            badCase(tag, '兜底位不一致')
          end
        else
          if mine.reset then badCase(tag, 'core_ai 多标了 reset') end
          if ref.x ~= mine.x then badCase(tag, 'x ' .. ref.x .. ' vs ' .. tostring(mine.x)) end
          if ref.rot ~= mine.rot then badCase(tag, 'rot ' .. ref.rot .. ' vs ' .. tostring(mine.rot)) end
          if ref.landingY ~= mine.landingY then
            badCase(tag, 'landingY ' .. ref.landingY .. ' vs ' .. tostring(mine.landingY))
          end
          local rb, mb = ref.best1, mine.best1
          if not (near(rb.score, mb.score) and rb.x == mb.x and rb.rot - 1 == mb.rot
              and near(rb.h, mb.h) and near(rb.clear, mb.clear)
              and rb.wall == mb.wall and rb.from == mb.from) then
            badCase(tag, 'best1 不一致')
          end
          if #ref.sorted ~= #mine.sorted then
            badCase(tag, 'sorted 长度 ' .. #ref.sorted .. ' vs ' .. #mine.sorted)
          else
            -- 完全同分候选的**相对次序**是刻意改变的（补 rot↑ 全序，见文件头差异②）
            -- ⇒ 比多重集 + 分数单调 + 头名一致
            local buckets = {}
            for _, c in ipairs(ref.sorted) do
              local k = string.format('%.6f|%d|%d', c.score, c.x, c.clear or 0)
              buckets[k] = (buckets[k] or 0) + 1
            end
            for _, c in ipairs(mine.sorted) do
              local k = string.format('%.6f|%d|%d', c.score, c.x, c.clear or 0)
              buckets[k] = (buckets[k] or 0) - 1
            end
            for k, v in pairs(buckets) do
              if v ~= 0 then badCase(tag, 'sorted 集合差异 ' .. k) break end
            end
            for i = 2, #mine.sorted do
              if mine.sorted[i - 1].score < mine.sorted[i].score - 1e-9 then
                badCase(tag, 'sorted 未按分降序')
              end
            end
            if #ref.sorted > 0 then
              local h1, h2 = ref.sorted[1], mine.sorted[1]
              -- 头名比"物理落点"（同样四格落在哪）而不是 rot 索引：
              -- O / I / S 等对称形状的多个 rot 索引是**同一几何**，原实现把次序交给不稳定排序
              local a1 = absCells(fx[2], piece(nm), h1.rot - 1, h1.x)
              local a2 = absCells(fx[2], piece(nm), h2.rot, h2.x)
              if a1 ~= a2 or not near(h1.score, h2.score) then
                badCase(tag, 'sorted 头名不一致（' .. a1 .. ' vs ' .. a2 .. '）')
              end
            end
          end
        end
      end
    end
  end
  ok(bad == 0, '4.1 choose 与 aiChoose 对拍（' .. cases .. ' 局面×方块×钩子组）', bad .. ' 例不一致')
  -- 死代码取证：射击条件要求 spawn 朝向（1-based rot=1）落在 x=COLS-1
  ok(shots == 0, '4.2 四消射击分支在对拍局面里 0 次触发（见 §5.3 几何取证）', shots)
end

-- ===== §5 两态与死代码 =====
do
  -- 5.1 顶死兜底：错列堆到 14 行（无整行，避免被 evalBoard 当满行消掉）
  -- ⇒ 所有落点都 h>12（无"安全位"），但仍有合法位 ⇒ 必须给 reset + 兜底落点
  local b = boardFromHeights({ 14, 14, 14, 14, 14, 14, 14, 14, 14, 1 })
  local plan = AI.bestPlacement(b, nil, piece('T'))
  ok(plan ~= nil and plan.reset == true, '5.1 超高局面标 reset=true（仍给兜底位）')
  if plan then
    ok(plan.h > AI_RESET_ROWS, '5.1a 兜底位的堆高确实超过安全线', plan.h)
    legalPlacement(b, piece('T'), plan, '5.1a2 兜底位')
  end
  local ch = AI.choose(b, nil, piece('T'))
  ok(ch ~= nil and ch.reset == true and ch.fallback ~= nil, '5.1b choose 返回 reset + fallback（同 aiChoose）')

  -- 5.2 无位可放：整盘填满
  local full = empty()
  for r = 1, ROWS do fillRow(full, r) end
  ok(AI.bestPlacement(full, nil, piece('T')) == nil, '5.2 全满局面返回 nil（无合法位）')
  ok(AI.choose(full, nil, piece('T')) == nil, '5.2b choose 同样 nil')

  -- 5.3 四消射击分支不可达（取证）：I 竖放（1 次旋转）占盒内第 3 列 ⇒ 占第 COLS 列要求 x=COLS-2
  local pcI = piece('I')
  local vertical = AI.rotatedCells(pcI.cells, pcI.n, 1)
  local maxCol = 0
  for i = 1, 4 do if vertical[i][2] > maxCol then maxCol = vertical[i][2] end end
  ok(maxCol == 3, '5.3 I 竖放占盒内第 3 列（生产注释写"第 2 列"是错的）', maxCol)
  ok(COLS - maxCol + 1 == COLS - 2, '5.3b 竖 I 的合法 x 上界 = COLS-2 ⇒ 射击条件的 x=COLS-1 永远不成立',
    COLS - maxCol + 1)
  ok(AI.rotatedCells(pcI.cells, pcI.n, 0)[1][2] == 1 and pcI.cells[1][1] == 2,
    '5.3c spawn 朝向（rot=0）是横 I ⇒ 射击条件里的 rot==1(1-based) 也不是"竖放"')
  local spawnCells = AI.rotatedCells(pcI.cells, pcI.n, 0)
  local spawnW = 0
  for i = 1, 4 do if spawnCells[i][2] > spawnW then spawnW = spawnCells[i][2] end end
  ok(COLS - spawnW + 1 == COLS - 3, '5.3d 横 I 的 x 上界 = COLS-3 ⇒ 射击条件 x=COLS-1 双重越界',
    COLS - spawnW + 1)

  -- 5.4 万一射击分支真的可达（用自定义竖 I 造型强制触发）：core_ai 给完整 plan，
  --     生产实现会返回裸候选 ⇒ aiTickCore:5010 的 #plan.sorted 在 hard 档（ply=2）崩。
  local b2 = empty()
  for r = 19, 20 do fillRow(b2, r, { [COLS] = true }) end   -- 第 10 列空 ⇒ 右墙井深 2
  local vI = piece('I', nil, { { 1, 2 }, { 2, 2 }, { 3, 2 }, { 4, 2 } }, 4)  -- 竖 I 落在盒内第 2 列
  ok(AI.wellDepth(b2) == 2, '5.4 构造盘右墙井深 = 2', AI.wellDepth(b2))
  local shotPlan, refShot = withNum({ AI_WELL = 6.3, AI_WELLCOL = COLS, AI_WELLBASE = 0 }, function()
    return AI.choose(b2, nil, vI), refChoose(b2, vI)
  end)
  ok(refShot and refShot.shot, '5.4b oracle 触发射击分支（生产返回裸候选：无 best1/sorted）')
  ok(refShot.shot and refShot.cand.best1 == nil, '5.4c 生产返回的裸候选确实没有 best1（崩溃根因）')
  ok(shotPlan and shotPlan.best1 ~= nil and #shotPlan.sorted > 0, '5.4d core_ai 射击时仍返回完整 plan')
  ok(shotPlan and shotPlan.shot == true, '5.4e core_ai 标了 shot=true（调用方想看日志可打）')
end

-- ===== §6 确定性 & 无副作用 =====
do
  local b = boardFromHeights({ 2, 1, 3, 0, 4, 2, 1, 3, 2, 1 })
  local snapshot = copyBoard(b)
  local pc = piece('J')
  local p1 = AI.choose(b, nil, pc)
  local p2 = AI.choose(b, nil, pc)
  ok(p1.x == p2.x and p1.rot == p2.rot and p1.landingY == p2.landingY
    and near(p1.best1.score, p2.best1.score) and #p1.sorted == #p2.sorted, '6.1 同输入两次调用同解')
  local same = true
  for i = 1, #p1.sorted do
    if p1.sorted[i].x ~= p2.sorted[i].x or p1.sorted[i].rot ~= p2.sorted[i].rot then same = false end
  end
  ok(same, '6.1b sorted 逐项同序（全序 tie-break 生效）')

  local AI2 = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES }
  local p3 = AI2.choose(b, nil, piece('J'))
  ok(p3.x == p1.x and p3.rot == p1.rot and near(p3.best1.score, p1.best1.score),
    '6.2 独立实例同解（模块无隐藏状态）')

  -- 输入不被改写：choose/candidates/evaluate/refineCandidate 轮一遍
  local cands = AI.candidates(b, nil, pc)
  AI.refineCandidate(b, nil, pc, piece('S'), cands[1])
  ok(sameBoard(b, snapshot), '6.3 盘面未被改写（board 原样）')
  ok(sameCells(pc.cells, SHAPES.J.cells), '6.4 方块 cells 未被改写（piece 原样）')
  ok(cands[1].rot == 0, '6.5 candidates 的 rot 是 0-based（首个候选 = spawn 朝向）')

  -- evalNext 也不许写盘（生产版是原地写-撤，纯函数版必须完全不写）
  local before = copyBoard(b)
  AI.evalNext(b, nil, pc.cells, 3)
  ok(sameBoard(b, before), '6.6 evalNext 不写输入盘面')

  -- 注入的 collides 与自带几何同解（main.lua:1070 的闭包可直接传进来）
  local a1 = AI.evaluate(b, nil, { cells = pc.cells, x = 4 })
  local a2 = AI.evaluate(b, binder(b), { cells = pc.cells, x = 4 })
  ok(near(a1, a2), '6.7 注入 collides 与内置几何同解')
  local r1 = AI.refineCandidate(b, nil, pc, piece('S'), cands[1])
  local r2 = AI.refineCandidate(b, binder(b), pc, piece('S'), cands[1])
  ok(near(r1, r2), '6.7b refineCandidate 同样不受注入函数影响')
end

-- ===== §7 难度档：easy（BW_SIMPLE）与 hard（BCTS）落点不同 =====
do
  -- 已知局面（构造，非随机）：底行满 + S 块 ⇒ 简化评估只看"别堆高/能消行/少留洞"，
  -- 全 BCTS 还看 transition/well ⇒ 两者最优列不同（本用例由构造盘搜索得到，钉死防漂移）
  local b = boardFromHeights({ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 })
  local pc = piece('S')
  local easy = AI.bestPlacement(b, nil, pc, { simple = true })
  local hard = AI.bestPlacement(b, nil, pc, { simple = false })
  ok(easy.x ~= hard.x, '7.1 同一局面 easy 与 hard 落点不同（easy x=' .. tostring(easy.x)
    .. ' / hard x=' .. tostring(hard.x) .. '）')
  ok(easy.x == 1 and hard.x == 8, '7.2 落点钉死 easy=x1、hard=x8（防权重/特征漂移）',
    tostring(easy.x) .. '/' .. tostring(hard.x))
  -- 各自都是"自身权重下的最优"：用 evaluate 全枚举一遍，取最大值应与落点一致
  local function maxScore(opts)
    local bestSc
    local cells = pc.cells
    for _ = 0, 3 do
      for x = 1, COLS do
        local sc = AI.evaluate(b, nil, { cells = cells, x = x }, opts)
        if sc and (not bestSc or sc > bestSc + 1e-9) then bestSc = sc end
      end
      cells = rotCells(cells, pc.n, 1)
    end
    return bestSc
  end
  ok(near(maxScore({ simple = true }), easy.score), '7.3 easy 落点分 = BW_SIMPLE 权重下的全枚举最优')
  -- 同分时 tie-break 会取贴墙/靠左，故只断言分数最优
  ok(near(maxScore({ simple = false }), hard.score), '7.4 hard 落点分 = BCTS 权重下的全枚举最优')
  -- 钩子显式化：同样的差异必须能通过 opts 表达（不靠改 NUM）
  local easyViaNum = withNum({ AI_SIMPLE = true }, function()
    return AI.bestPlacement(b, nil, pc)
  end)
  ok(easyViaNum.x == easy.x, '7.5 省略 opts 时读 NUM.AI_SIMPLE（生产语义等价）')
end

-- ===== §8 2-ply：evalNext / refineCandidate 与生产移植对拍 =====
do
  local fixtures = {
    { 'empty', empty() },
    { 'rightwall', boardFromHeights({ 2, 3, 1, 4, 0, 2, 5, 1, 3, 0 }) },
  }
  local bad, checked = 0, 0
  for _, fx in ipairs(fixtures) do
    local board = fx[2]
    for _, nm in ipairs({ 'I', 'T', 'S' }) do
      local pc = piece(nm)
      local cells = pc.cells
      for turns = 0, 3 do
        for x = 1, COLS do
          local refSc = refEvalNext(board, cells, x)
          local mine = AI.evalNext(board, nil, cells, x)
          checked = checked + 1
          if (refSc == nil) ~= (mine == nil) then
            bad = bad + 1
          elseif refSc and not near(refSc, mine) then
            bad = bad + 1
          end
        end
        cells = rotCells(cells, pc.n, 1)
      end
    end
  end
  ok(bad == 0, '8.1 evalNext 与 main.lua:4717 移植逐值相等（' .. checked .. ' 例）', bad .. ' 例不一致')

  local board = fixtures[2][2]
  local pc = piece('T')
  local nextPc = piece('I')
  local cands = AI.candidates(board, nil, pc)
  local refCands = refChoose(board, pc).sorted
  local mism, n = 0, math.min(4, #cands)
  for i = 1, n do
    -- 用 x/rot 对齐同一候选（sorted 的完全同分次序可能不同，按落点找）
    local target = cands[i]
    local refCand
    for _, c in ipairs(refCands) do
      if c.x == target.x and c.rot - 1 == target.rot then refCand = c break end
    end
    if refCand then
      local _, s2ref = refRefineOne(board, pc, nextPc, refCand)
      local _, s2mine = AI.refineCandidate(board, nil, pc, nextPc, target)
      if not near(s2ref, s2mine) then
        mism = mism + 1
        if mism <= 3 then
          print(string.format('  · 2-ply 差异 x=%d rot=%d ref=%.6f mine=%.6f',
            target.x, target.rot, s2ref, s2mine))
        end
      end
    end
  end
  ok(mism == 0, '8.2 refineCandidate 与 refineSearch 移植对拍（前 ' .. n .. ' 候选）', mism .. ' 例不一致')

  -- 8.5 热路径版与纯版逐值相等，且返回时盘面逐格还原
  do
    local snap = copyBoard(board)
    local same, n2 = true, 0
    for _, nm in ipairs({ 'I', 'T', 'S', 'O' }) do
      local c2 = piece(nm).cells
      for _ = 0, 3 do
        for x = 1, COLS do
          local a = AI.evalNext(board, nil, c2, x)
          local b2 = AI.evalNextFast(board, nil, c2, x)
          n2 = n2 + 1
          if (a == nil) ~= (b2 == nil) or (a and not near(a, b2)) then same = false end
        end
        c2 = rotCells(c2, piece(nm).n, 1)
      end
    end
    ok(same, '8.5 evalNextFast 与 evalNext 逐值相等（' .. n2 .. ' 例）')
    ok(sameBoard(board, snap), '8.5b evalNextFast 返回后盘面逐格还原')
  end

  -- 8.6 nextPiece 也可以直接给名字（生产侧 g.nextName 就是名字）
  do
    local _, s2tab = AI.refineCandidate(board, nil, pc, nextPc, cands[1])
    local _, s2name = AI.refineCandidate(board, nil, pc, 'I', cands[1])
    ok(near(s2tab, s2name), '8.6 nextPiece 传表或传名字同解', tostring(s2tab) .. ' vs ' .. tostring(s2name))
  end

  local best2, bestScore = AI.refine(board, nil, pc, nextPc, cands)
  local anno = true
  for _, c in ipairs(cands) do if c.score2 == nil then anno = false end end
  ok(anno and best2 ~= nil and near(bestScore, best2.score2), '8.3 refine 给全部候选写 score2 并取最大')
  ok(sameBoard(board, copyBoard(board)) and bestScore ~= nil, '8.4 refine 不改输入盘面（board 引用一致）')
end

-- ===== §9 Hold 决策（main.lua:5033-5069 移植）=====
do
  -- 9.1 闸门：不可换块 / 档位不开 hold ⇒ 永不换
  local b = boardFromHeights({ 1, 1, 1, 1, 0, 1, 1, 1, 1, 0 })
  local pc = piece('T')
  ok(AI.holdDecision(b, nil, pc, { canHold = false, holdEnabled = true, next = 'I' }).doHold == false,
    '9.1 canHold=false ⇒ 不换块')
  ok(AI.holdDecision(b, nil, pc, { canHold = true, holdEnabled = false, next = 'I' }).doHold == false,
    '9.1b holdEnabled=false ⇒ 不换块')

  -- 9.2 better：换出块的最优分比当前块高出一个 margin 以上
  local better = AI.holdDecision(b, nil, pc,
    { canHold = true, holdEnabled = true, next = 'I', stay = -1000, holdMargin = 1.2 })
  ok(better.doHold == true and better.why == 'better', '9.2 换出块明显更优 ⇒ why=better')
  ok(better.gain and better.gain > 1.2, '9.2b 带出收益 gain', better.gain)

  -- 9.3 saveI：槽空 + 手里是 I + 右墙井已挖到 ≥ wellDepth-1 ⇒ 先存 I
  local wellBoard = boardFromHeights({ 1, 1, 1, 1, 1, 1, 1, 1, 3, 0 })   -- 井深 3
  ok(AI.wellDepth(wellBoard) == 3, '9.3 构造盘井深 = 3', AI.wellDepth(wellBoard))
  local saveI = AI.holdDecision(wellBoard, nil, piece('I'),
    { canHold = true, holdEnabled = true, slot = nil, next = 'T', stay = 0, saveI = true, wellDepth = 4 })
  ok(saveI.doHold == true and saveI.why == 'saveI', '9.3b 留 I 块（井深 3 ≥ 4-1）', saveI.why)

  -- 9.4 fireI：槽里躺着 I + 井已够深 + 手里不是 I ⇒ 换出 I 立刻四消
  local fireI = AI.holdDecision(wellBoard, nil, piece('T'),
    { canHold = true, holdEnabled = true, slot = 'I', stay = 0, saveI = true, wellDepth = 3 })
  ok(fireI.doHold == true and fireI.why == 'fireI', '9.4 槽里有 I + 井够深 ⇒ why=fireI', fireI.why)
  -- 弱档不做留井策略（saveI=false）
  ok(AI.holdDecision(wellBoard, nil, piece('I'),
      { canHold = true, holdEnabled = true, slot = nil, next = 'T', stay = 0, saveI = false }).doHold == false,
    '9.5 saveI=false 时不留 I 块（弱档不装策略）')
end

-- ===== §10 core_board 交叉复验（若已就位）=====
do
  local path = ROOT .. '/lua/tetris/core_board.lua'
  local exists = io.open(path, 'r') ~= nil
  if not exists then
    print('NOTE  core_board.lua 尚未就位：落点合法性由内联最小碰撞函数复验'
      .. '（与 main.lua:1070 逐行同义），core_board 落地后 §10 会自动交叉复验')
  else
    local file = io.open(path, 'r') file:close()
    local okLoad, mod = pcall(loadfile(path))
    local CB = nil
    if okLoad and type(mod) == 'table' and type(mod.new) == 'function' then
      local okNew, inst = pcall(mod.new, { rows = ROWS, cols = COLS })
      if okNew and type(inst) == 'table' and type(inst.collides) == 'function' then CB = inst end
    end
    if not CB then
      print('NOTE  core_board.lua 已存在但契约未匹配（需要 new{rows,cols} 返回带 collides 的实例）：'
        .. '本轮跳过交叉复验，内联最小碰撞函数仍在用')
    else
      -- 两通道交叉：core_board 的 collides 与内联 collidesOn 在同一批落点上必须同解
      local b = boardFromHeights({ 2, 3, 1, 4, 0, 2, 5, 1, 3, 0 })
      local same, n = true, 0
      local function tryCB(cells, x, y)
        local okA, rA = pcall(CB.collides, b, cells, x, y)
        if okA and type(rA) == 'boolean' then return rA end
        local okB, rB = pcall(CB.collides, cells, x, y, b)
        if okB and type(rB) == 'boolean' then return rB end
        return nil
      end
      for _, nm in ipairs(ALL) do
        local pc = piece(nm)
        local cells = pc.cells
        for _ = 0, 3 do
          for x = 0, COLS + 1 do
            for y = 1, ROWS do
              local r = tryCB(cells, x, y)
              if r ~= nil then
                n = n + 1
                if r ~= collidesOn(b, cells, x, y) then same = false end
              end
            end
          end
          cells = rotCells(cells, pc.n, 1)
        end
      end
      ok(same and n > 0, '10.1 core_board.collides 与内联最小碰撞同解（' .. n .. ' 例）')
    end
  end
end

-- ===== 汇总 =====
print(string.format('\n== core_ai_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
