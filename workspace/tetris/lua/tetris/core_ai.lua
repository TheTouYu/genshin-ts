--!strict-ish（本仓库不跑类型检查，这里只标契约）
-- ============================================================================
-- lua/tetris/core_ai.lua —— AI 评估 + 决策（纯函数，零引擎，可 headless 对拍）
--
-- 为什么有这个文件（docs/ARCH.md §1 P1）：AI 的"选哪一列"逻辑原来长在
--   main.lua:1851-1936  aiChoose（读 g.piece / g.board / NUM / AIC 常量）
--   lua/tetris/aieval.lua  evalBoard（读了 NUM 的运行态钩子、靠闭包拿当前盘 g）
-- 两处都只能整轮模拟器（387s/70 用例）才跑得到 ⇒ 一个"AI 摆错列"的 bug 无法秒级复现。
-- 本模块把「评估 + 决策」抽成**只吃参数、只返回结果**的纯函数，lua5.3 里直接跑。
--
-- 契约（ARCH.md §3：M.new(spec) 注入协作方，模块之间不 require 彼此）：
--   local AI = core_ai.new{ rows = 20, cols = 10, num = NUM, shapes = SHAPES,
--                            resetRows = 12 }          -- resetRows 省略=12（原 AIC.RESET_ROWS）
--
--   AI.evaluate(board, collides, piece, opts)      -> score, landingY, cleared, top | nil
--        ⚠ 返回**顺序**与 aeval.evalBoard 不同（那边是 score, top, cleared）：接线时不能只换函数名，
--          要么按本模块顺序取名（推荐），要么写显式转发函数，别让 h/landingY 静默对调。
--   AI.bestPlacement(board, collides, piece, opts) -> { x, y, rot, score, h, clear, wall, from,
--                                                        reset?, shot? } | nil
--   AI.evalNext(board, collides, cells, x, opts)   -> score, nf | nil（2-ply 第二层；纯，复制盘面）
--   AI.evalNextFast(…)                             -> 同上，但借盘原地写-还原（热路径；结果逐值相等）
--   AI.choose(board, collides, piece, opts)        -> plan（与 main.lua:1851 aiChoose 的返回同形）
--                                                     nil | { reset=true, fallback=…, sorted=… }
--                                                         | { rot, x, landingY, best1, sorted, … }
--
-- 参数形状：
--   board    = ROWS×COLS 二维表，board[r][c] ~= 0 表示"有格子"（值可以是颜色常量、1、2）
--   collides = function(cells, x, y) -> boolean，**可选**（nil ⇒ 用本模块自带的同义碰撞）
--              生产里传 main.lua:1070 那个闭包；注意它必须绑定在**同一个 board** 上
--   piece    = { name, n, cells = {{r,c}×4}, x = col }   -- 一律 1-based；cells 是出生朝向
--              evaluate 用 piece.x 作为落列；bestPlacement/choose 用 piece.x 仅做
--              "离当前列多远"的 tie-break（省略 ⇒ 按出块列 (cols-n)//2+1，与 spawn 一致）
--   opts     = 见下方「显式字段」
--
-- ===== 纯函数铁律（tests-lua/core_ai_test.lua 静态扫查 + 运行时 _G 前后对比）=====
--   · 只读参数；顶层不读写脚本全局、不实例化任何东西（chunk 在 OnInit 期间执行）
--   · 不 print、不 require、不碰 game.*/ctl.*、不碰 os/io 与 math.random
--   · 不依赖时间：模块内没有 os.time/os.clock
--   · 不改输入：board / cells / piece 一律原样（内层评估自己复制盘面）
--   · 同一输入两次调用完全同解（没有随机、没有隐藏状态；table.sort 的末位 tie-break 显式化）
--
-- ===== 显式字段：原实现靠"读当前盘实例 g / 读 NUM 运行态"的隐式契约 =====
-- 这些字段过去要么藏在 g 上、要么由 aiTickCore 每块写到 NUM 上；本模块一律走参数：
--   g.board            -> 函数入参 board
--   g.piece.cells/.n/.x/.name -> 函数入参 piece
--   g.nextName（2-ply 下一块）-> refineCandidate 的入参 nextPiece
--   AI_RESET_ROWS（AIC 常量 12）-> spec.resetRows / opts.resetRows
--   NUM.AI_SIMPLE      -> opts.simple   （easy 档走 BW_SIMPLE 简化评估）
--   NUM.AI_ATK         -> opts.atk      （对抗模式多消行/攒行加成系数）
--   NUM.AI_WELL        -> opts.well     （留井奖励；同时把 CW 惩罚缩到 35%）
--   NUM.AI_WELLCOL     -> opts.wellCol  （井纪律：该列堆过 base 就 -45）
--   NUM.AI_WELLBASE    -> opts.wellBase
--   NUM.BW / NUM.BW_SIMPLE -> opts.bw / opts.bwSimple
--   NUM.AI_TUNE.holdMargin / .saveI / .wellDepth -> holdDecision 的 opts.holdMargin/.saveI/.wellDepth
--   AIC.W_WALL/W_WELL/WELL_DEPTH -> 已废弃（v2.4 决策纯化后 aiChoose 不再用，见 main.lua:1900）
-- 省略 opts 时**默认读 spec.num 的同名字段**（生产语义：aiTickCore 每块改写 NUM 后照旧生效）；
-- 要绝对确定（headless 用例）就显式传 opts —— 测试两种姿势都覆盖。
--
-- ===== rot 约定（只有一种，别再踩 -1 的坑）=====
--   本模块所有 rot 字段 = **顺时针转几次，0-based（0..3）**，与 main.lua 里 plan.rot / buildQueue 一致。
--   原 aiChoose 内部候选用 1-based rot（rot=1 是出生朝向），plan 里又减 1 成 0-based ⇒ 同一张表两套含义。
--   接线时 main.lua:4921 的 `cand.rot - 1` 与 main.lua:5088 的 `final.rot - 1` 都要去掉 -1。
--
-- ===== 与 main.lua aiChoose 的行为差异（刻意，逐条对齐 tests-lua/core_ai_test.lua §5）=====
--   ① 生产 aiChoose 的四消射击分支（main.lua:1885-1889）`return c` 返回的候选**没有 best1/sorted**
--      ⇒ aiTickCore:5010 的 `#plan.sorted`（hard 档 ply=2 时才会求值）会 `attempt to index a nil value`。
--      本模块 choose 一律返回完整 plan（射击候选提升为 best1，sorted 照给）。
--   ② sorted 的比较器在原四级（score↓/wall↑/from↑/x↑）末尾补 rot↑ —— 原实现的完全同分候选
--      交由 table.sort（不稳定）决定，跨解释器不保证同序；补一条后全序、可复现。
--      只影响**完全相同**候选的相对次序（best1 用 better() 选，不受影响）。
--   ③ 不动任何评估权重/阈值/阈值语义，也不改 tie-break 的优先级 —— 其余逐值等价。
--
-- ===== 数值真源 =====
--   BCTS 8 特征权重 NUM.BW【论文】Thiery & Scherrer, "Building Controllers for Tetris",
--   ICGA Journal 32(1) 2009 §4（交叉熵优化原值，照抄不手调）；评估体逐行移植 aieval.lua:77-236。
--   2-ply 第二层用 El-Tetris 四权重（main.lua:1834 W_AGG/W_LINE/W_HOLE/W_BUMP），移植 main.lua:4717-4774。
-- ============================================================================
local M = {}

M.NAME = 'core_ai'
M.VERSION = 'v6.1'

-- config.lua 缺字段时的兜底（= 生产定值，见 config.lua:77-78 / 102）
local BW_DEFAULT = { LH = -12.63, ER = 6.60, RT = -9.22, CT = -19.77,
                     HO = -13.08, CW = -10.49, HD = -1.61, RH = -24.04 }
local BW_SIMPLE_DEFAULT = { LH = -1.00, ER = 1.00, RT = 0, CT = 0, HO = -0.35, CW = 0, HD = 0, RH = 0 }
-- 2-ply 第二层（El-Tetris 四权重，main.lua:1834）
local EL = { AGG = -0.510066, LINE = 0.760666, HOLE = -0.35663, BUMP = -0.184483 }

local RESET_ROWS_DEFAULT = 12     -- 原 AIC.RESET_ROWS（main.lua:1809）
local WELL_CW_SCALE = 0.35        -- 留井模式 CW 缩放（aieval.lua:185）
local NEAR_FULL_K = 0.9           -- 攒行加成系数（aieval.lua:202）
local WELL_NEAR_K, WELL_NEAR_CAP = 1.5, 6   -- 井旁堆高轻奖励（aieval.lua:210-214）
local WELL_DISCIPLINE_PENALTY = 45          -- 井纪律违规惩罚（aieval.lua:231）
local SHOT_WELL_DEPTH = 2         -- 四消射击的井深门槛（main.lua:1883）
local NO_NEXT_PENALTY = -5        -- 下一块无处可放时的兜底分（main.lua:4956）
local EPS = 1e-9                  -- 同分判定容差（main.lua:1894）
local EMPTY = {}

-- ===== 纯几何原语（不挂在 api 上的内部实现）=====

-- 顺时针 90°：(r,c) → (c, n+1-r)，返回新表（main.lua:1403-1406 的纯函数原样）
local function rot(cells, n)
  local out = {}
  for i = 1, #cells do out[i] = { cells[i][2], n + 1 - cells[i][1] } end
  return out
end
M.rot = rot

-- 生成器：按 turns 次顺时针旋转后的 cells（返回新表，不改入参）
local function rotN(cells, n, turns)
  local out = cells
  for _ = 1, turns do out = rot(out, n) end
  return out
end
M.rotN = rotN

function M.new(spec)
  spec = spec or {}
  local ROWS = assert(tonumber(spec.rows), 'core_ai.new: spec.rows 必填')
  local COLS = assert(tonumber(spec.cols), 'core_ai.new: spec.cols 必填')
  local NUM = spec.num or EMPTY
  local SHAPES = spec.shapes or EMPTY
  local RESET_ROWS = spec.resetRows or RESET_ROWS_DEFAULT

  -- ===== 内部纯原语 =====

  -- 碰撞：与 main.lua:1070-1078 逐行同义（盘外上方 y<1 允许；左右越界/超底 = 撞）
  local function collidesOn(board, cells, x, y)
    for i = 1, #cells do
      local br = y + cells[i][1] - 1
      local bc = x + cells[i][2] - 1
      if bc < 1 or bc > COLS or br > ROWS then return true end
      if br >= 1 and board[br][bc] ~= 0 then return true end
    end
    return false
  end

  -- 注入的 collides 优先；没给就用自带几何（语义相同，测试里逐例对拍）
  local function bind(board, collides)
    if collides then return collides end
    return function(cs, x, y) return collidesOn(board, cs, x, y) end
  end

  local function copyBoard(board)
    local out = {}
    for r = 1, ROWS do
      local src, row = board[r], {}
      for c = 1, COLS do row[c] = src[c] end
      out[r] = row
    end
    return out
  end

  local function landingYOn(board, cb, cells, x)
    if cb(cells, x, 1) then return nil end
    local y = 1
    while y < ROWS and not cb(cells, x, y + 1) do y = y + 1 end
    return y
  end

  local function colHeightOn(board, c)
    if not board then return 0 end
    for r = 1, ROWS do
      if board[r][c] ~= 0 then return ROWS - r + 1 end
    end
    return 0
  end

  local function heightsOf(board)
    local h = {}
    for c = 1, COLS do h[c] = colHeightOn(board, c) end
    return h
  end

  -- 靠墙井深（只看右墙第 COLS 列，与 aieval.lua:36-50 同口径：
  -- 左墙第 1 列 I 块竖放填不到，见 main.lua:4873 注释）
  local function wellDepthOn(board)
    if not board then return 0 end
    local h = heightsOf(board)
    local d = (h[COLS - 1] or 0) - (h[COLS] or 0)
    if d < 0 then d = 0 end
    return d
  end

  local function stackHeightOn(board)
    if not board then return 0 end
    for r = 1, ROWS do
      for c = 1, COLS do
        if board[r][c] ~= 0 then return ROWS - r + 1 end
      end
    end
    return 0
  end

  -- 评估钩子：opts 优先，缺省读 spec.num（= aiTickCore 每块改写的运行态）
  local function hooks(opts)
    local o = opts or EMPTY
    local simple = o.simple
    if simple == nil then simple = NUM.AI_SIMPLE end
    local bw = o.bw
    if bw == nil then
      -- 与 aieval.lua:180 `NUM.AI_SIMPLE and NUM.BW_SIMPLE or NUM.BW` 同义（多一层缺省兜底）
      if simple then bw = NUM.BW_SIMPLE or BW_SIMPLE_DEFAULT
      else bw = NUM.BW or BW_DEFAULT end
    end
    local well, atk, wellCol, wellBase = o.well, o.atk, o.wellCol, o.wellBase
    if well == nil then well = NUM.AI_WELL or 0 end
    if atk == nil then atk = NUM.AI_ATK or 0 end
    if wellCol == nil then wellCol = NUM.AI_WELLCOL or 0 end
    if wellBase == nil then wellBase = NUM.AI_WELLBASE or 0 end
    local resetRows = o.resetRows
    if resetRows == nil then resetRows = RESET_ROWS end
    return { bw = bw, well = well, atk = atk, wellCol = wellCol, wellBase = wellBase,
             resetRows = resetRows, el = o.el or EL, simple = simple and true or false }
  end

  -- ===== 1-ply 评估体（aieval.lua:77-236 的纯函数移植）=====
  -- 评估「cells 从顶部自然落地到 x 列」后的盘面，返回 score, landingY, cleared, top。
  -- 放不进（第 1 行就撞）返回 nil。
  local function scoreAt(board, cb, cells, x, H)
    if cb(cells, x, 1) then return nil end
    local y = 1
    while y < ROWS and not cb(cells, x, y + 1) do y = y + 1 end
    -- 模拟盘（落块标 2 以识别 eroded 归属）——第一层每块只跑 ~34 次，分配量级安全
    local sim = copyBoard(board)
    local lhSum = 0
    for i = 1, 4 do
      local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
      if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
        sim[br][bc] = 2
        lhSum = lhSum + (ROWS - br + 1)
      end
    end
    local lh = lhSum / 4                                   -- Landing height：四格平均
    -- 消行 + Eroded piece cells（消行数 × 落块在消行中的格数）
    local erodedCells = 0
    local complete = 0
    local r = ROWS
    while r >= 1 do
      local row = sim[r]
      local full = true
      for c = 1, COLS do
        if row[c] == 0 then full = false break end
      end
      if full then
        for c = 1, COLS do
          if row[c] == 2 then erodedCells = erodedCells + 1 end
        end
        table.remove(sim, r)
        local nrow = {}
        for c = 1, COLS do nrow[c] = 0 end
        table.insert(sim, 1, nrow)
        complete = complete + 1
      else
        r = r - 1
      end
    end
    local epc = erodedCells * complete
    -- Row transitions（左右边界视为满）
    local rt = 0
    for rr = 1, ROWS do
      local row = sim[rr]
      local prev = true
      for c = 1, COLS do
        local cur = row[c] ~= 0
        if cur ~= prev then rt = rt + 1 end
        prev = cur
      end
      if not prev then rt = rt + 1 end
    end
    -- Column transitions + Holes + Hole depth + Rows with holes + heights（一次列扫描）
    local ct = 0
    local holes = 0
    local hdepth = 0
    local rowsWithHoles = 0
    local heights = {}
    local top = 0
    local rowHasHole = {}
    for c = 1, COLS do
      local prev = false
      local seen = false
      local filledAbove = 0
      local colH = 0
      for rr = 1, ROWS do
        local cur = sim[rr][c] ~= 0
        if cur ~= prev then ct = ct + 1 end
        prev = cur
        if cur then
          if not seen then colH = ROWS - rr + 1 seen = true end
          filledAbove = filledAbove + 1
        elseif seen then
          holes = holes + 1
          hdepth = hdepth + filledAbove         -- Hole depth：洞上方实格数
          rowHasHole[rr] = true
        end
      end
      if not prev then ct = ct + 1 end          -- 列底视为满：底空收尾 +1
      heights[c] = colH
      if colH > top then top = colH end
    end
    for rr = 1, ROWS do
      if rowHasHole[rr] then rowsWithHoles = rowsWithHoles + 1 end
    end
    -- Cumulative wells：Σ d*(d+1)/2，墙视为 ROWS 高（BCTS/Dellacherie 标准口径）
    local cw = 0
    for c = 1, COLS do
      local left = ROWS + 1
      if c > 1 then left = heights[c - 1] end
      local right = ROWS + 1
      if c < COLS then right = heights[c + 1] end
      local nb = left
      if right < nb then nb = right end
      local d = nb - heights[c]
      if d > 0 then cw = cw + d * (d + 1) / 2 end
    end
    local BW = H.bw
    -- 留井模式（AI_WELL>0）下宽容井惩罚：BCTS 的 CW=-10.49 会让"保留 4 深井"付出 -105 分，
    -- 任何留井奖励都抵不过 ⇒ 缩到 35% 才可能攒井打四消（aieval.lua:181-185）
    local cwW = BW.CW
    if H.well > 0 then cwW = cwW * WELL_CW_SCALE end
    local sc = BW.LH * lh + BW.ER * epc + BW.RT * rt + BW.CT * ct
      + BW.HO * holes + cwW * cw + BW.HD * hdepth + BW.RH * rowsWithHoles
    -- ④-a 多消行（对抗模式）：对手快死时把 2+ 行的收益按 n² 放大
    local atk = H.atk
    if atk > 0 then
      if complete and complete >= 2 then
        sc = sc + atk * complete * complete
      end
      -- ④-a2 攒行：把"9/10 格满的行"当资产（1-ply 看不到"下一块就能消 2 行"）
      local nearFull = 0
      for rr = 1, ROWS do
        local empty = 0
        for c = 1, COLS do if sim[rr][c] == 0 then empty = empty + 1 end end
        if empty == 1 then nearFull = nearFull + 1 end
      end
      if nearFull > 0 then sc = sc + atk * NEAR_FULL_K * nearFull end
      -- ④-a3 造井：井旁那一列的堆高（上限 6 行）轻奖励
      if H.well > 0 then
        local hNear = heights[COLS - 1] or 0
        if hNear > WELL_NEAR_CAP then hNear = WELL_NEAR_CAP end
        sc = sc + WELL_NEAR_K * hNear
      end
    end
    -- ④-b 留井：靠墙 1 列宽、深 ≥3 的井给正分（避免 AI 顺手填平）
    local wellW = H.well
    if wellW > 0 then
      local dl = (heights[2] or 0) - (heights[1] or 0)
      local dr = (heights[COLS - 1] or 0) - (heights[COLS] or 0)
      if dl >= 3 or dr >= 3 then sc = sc + wellW end
      -- ④-c 井纪律：指定井列除非"这一手直接三消+"，否则不许往里放块
      local wc, base = H.wellCol, H.wellBase
      if wc > 0 then
        local afterH = 0
        for rr = 1, ROWS do
          if sim[rr][wc] ~= 0 then afterH = ROWS - rr + 1 break end
        end
        if afterH > base and not (complete and complete >= 3) then
          sc = sc - WELL_DISCIPLINE_PENALTY
        end
      end
    end
    return sc, y, complete, top
  end

  -- ===== 候选枚举（aiChoose:1857-1876 的循环骨架）=====
  -- 顺序 = rot 0→3、每档 x 1→cols-wmax+1（**顺序是契约**：better() 遇到完全同分取先遇到者）
  local function enumerate(board, cb, piece, H)
    local cells = piece.cells
    local n = piece.n or 4
    local fromX = piece.x
    if fromX == nil then fromX = (COLS - n) // 2 + 1 end   -- 与 spawn 的出生列一致（main.lua:1095）
    local out = {}
    for turns = 0, 3 do
      local wmax = 1
      for i = 1, 4 do
        if cells[i][2] > wmax then wmax = cells[i][2] end
      end
      for x = 1, COLS - wmax + 1 do
        local sc, y, cleared, top = scoreAt(board, cb, cells, x, H)
        if sc then
          local leftDist = x - 1
          local rightDist = COLS - (x + wmax - 1)
          local wall = leftDist
          if rightDist < wall then wall = rightDist end
          local from = x - fromX
          if from < 0 then from = -from end
          out[#out + 1] = { rot = turns, x = x, score = sc, h = top, clear = cleared,
                            wall = wall, from = from, y = y }
        end
      end
      cells = rot(cells, n)
    end
    return out
  end

  -- 候选择优的四级 tie-break（aiChoose:1892-1899 原样）
  local function better(a, b)
    if not b then return true end
    if a.score > b.score + EPS then return true end
    if a.score < b.score - EPS then return false end
    if a.wall ~= b.wall then return a.wall < b.wall end
    if a.from ~= b.from then return a.from < b.from end
    return a.x < b.x
  end

  local function pick(cands, H)
    local best, anyBest
    for i = 1, #cands do
      local c = cands[i]
      if better(c, anyBest) then anyBest = c end
      if c.h <= H.resetRows and better(c, best) then best = c end
    end
    return best, anyBest
  end

  -- 显式四消射击（main.lua:1878-1891）：I 块竖放 = rot0、落点 x = cols-1 ⇒ 占第 cols 列
  local function tetrisShot(board, H, piece, cands)
    if not (H.well > 0 and piece.name == 'I' and piece.n == 4) then return nil end
    if wellDepthOn(board) < SHOT_WELL_DEPTH then return nil end
    for i = 1, #cands do
      local c = cands[i]
      if c.rot == 0 and c.x == COLS - 1 and (c.clear or 0) >= 2 then return c end
    end
    return nil
  end

  -- ===== 对外 API =====
  local api = {}
  api.rows, api.cols = ROWS, COLS
  api.resetRows = RESET_ROWS
  api.rotateCells = rot
  api.rotatedCells = rotN
  api.collides = collidesOn

  function api.colHeight(board, c) return colHeightOn(board, c) end
  function api.wellDepth(board) return wellDepthOn(board) end
  function api.stackHeight(board) return stackHeightOn(board) end
  function api.heights(board) return heightsOf(board) end
  function api.landingY(board, collides, cells, x)
    return landingYOn(board, bind(board, collides), cells, x)
  end

  -- evaluate：单个"落列"的 1-ply 分（= aieval.evalBoard(cells, x) + 落点行/落点高度）
  function api.evaluate(board, collides, piece, opts)
    if not piece or not piece.cells or not piece.x then return nil end
    return scoreAt(board, bind(board, collides), piece.cells, piece.x, hooks(opts))
  end

  -- candidates：全集（rot 0-based，顺序 = 生产枚举顺序）
  function api.candidates(board, collides, piece, opts)
    if not piece or not piece.cells then return nil end
    return enumerate(board, bind(board, collides), piece, hooks(opts))
  end

  -- bestPlacement：**扁平**最优落点。无安全位时返回最高合法位并置 reset=true；
  -- 连合法位都没有返回 nil（= 生产 aiChoose 的 reset/fallback 两态压成一个表）
  function api.bestPlacement(board, collides, piece, opts)
    if not piece or not piece.cells then return nil end
    local H = hooks(opts)
    local cb = bind(board, collides)
    local cands = enumerate(board, cb, piece, H)
    if #cands == 0 then return nil end
    local shot = tetrisShot(board, H, piece, cands)
    local best, anyBest = pick(cands, H)
    local chosen, reset = shot or best, false
    if not chosen then chosen, reset = anyBest, true end
    if not chosen then return nil end
    return {
      x = chosen.x, y = chosen.y, rot = chosen.rot, score = chosen.score,
      h = chosen.h, clear = chosen.clear, wall = chosen.wall, from = chosen.from,
      reset = reset or nil, shot = (shot ~= nil) or nil,
    }
  end

  -- choose：与 main.lua:1851 aiChoose 同形的 plan（可直接替身）
  function api.choose(board, collides, piece, opts)
    if not piece or not piece.cells then return nil end
    local H = hooks(opts)
    local cb = bind(board, collides)
    local cands = enumerate(board, cb, piece, H)
    if #cands == 0 then return nil end
    local shot = tetrisShot(board, H, piece, cands)
    local best, anyBest = pick(cands, H)
    -- sorted：安全位（h<=resetRows）按分降序；末尾补 rot↑ 让全序可复现（见文件头差异②）
    local sorted = {}
    for i = 1, #cands do
      if cands[i].h <= H.resetRows then sorted[#sorted + 1] = cands[i] end
    end
    table.sort(sorted, function(a, b)
      if a.score ~= b.score then return a.score > b.score end
      if a.wall ~= b.wall then return a.wall < b.wall end
      if a.from ~= b.from then return a.from < b.from end
      if a.x ~= b.x then return a.x < b.x end
      return a.rot < b.rot
    end)
    local best1 = shot or best
    if not best1 then
      return { reset = true, fallback = anyBest, sorted = sorted,
               shot = (shot ~= nil) or nil }
    end
    return { rot = best1.rot, x = best1.x, landingY = best1.y,
             best1 = best1, sorted = sorted, score = best1.score,
             shot = (shot ~= nil) or nil }
  end

  -- ===== 2-ply 第二层（evalNext 纯函数版，main.lua:4717-4774）=====
  -- 只算 El-Tetris 三主项 + bump（第二层是排序信号不是最终决策）。
  -- inPlace=true 时**借盘原地写、返回前逐格还原**（生产的零分配做法）：
  -- 只给本模块自己的私有模拟盘（refineCandidate 的 sim）用；公开的 evalNext 一律复制，不碰入参。
  local function evalNextAt(board, cb, cells, x, W, inPlace)
    if cb(cells, x, 1) then return nil end
    local y = 1
    while y < ROWS and not cb(cells, x, y + 1) do y = y + 1 end
    local sim = inPlace and board or copyBoard(board)
    local written = nil
    if inPlace then written = {} end
    for i = 1, 4 do
      local br, bc = y + cells[i][1] - 1, x + cells[i][2] - 1
      if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then
        if inPlace then written[#written + 1] = { br, bc, sim[br][bc] } end
        sim[br][bc] = 1
      end
    end
    local fullRows, nf = {}, 0
    for r = 1, ROWS do
      local row = sim[r]
      local isFull = true
      for c = 1, COLS do
        if row[c] == 0 then isFull = false break end
      end
      if isFull then nf = nf + 1 fullRows[nf] = r end
    end
    local isFullRow = {}
    for i = 1, nf do isFullRow[fullRows[i]] = true end
    local agg, holes, hh = 0, 0, {}
    for c = 1, COLS do
      local h, seen = 0, false
      for r = 1, ROWS do
        if sim[r][c] ~= 0 then
          if not isFullRow[r] then
            if h == 0 then h = ROWS - r + 1 end
            seen = true
          end
        elseif seen and not isFullRow[r] then
          holes = holes + 1
        end
      end
      agg = agg + h
      hh[c] = h
    end
    local bump = 0
    for c = 1, COLS - 1 do
      local d = hh[c] - hh[c + 1]
      if d < 0 then d = -d end
      bump = bump + d
    end
    if inPlace then
      for i = #written, 1, -1 do
        sim[written[i][1]][written[i][2]] = written[i][3]
      end
    end
    return W.AGG * agg + W.LINE * nf + W.HOLE * holes + W.BUMP * bump, nf
  end

  -- 公开版：复制盘面（不改入参），任何时候都能安全调
  function api.evalNext(board, collides, cells, x, opts)
    local H = hooks(opts)
    return evalNextAt(board, bind(board, collides), cells, x, H.el, false)
  end

  -- 热路径版：借盘原地写、返回前逐格还原（= 生产 main.lua:4717 的零分配做法）。
  -- 结果与 evalNext 逐值相等（测试 §8.5 断言），但**中途盘面是脏的** ⇒ 只给"自己独占的盘"用，
  -- 别在会被渲染/其它读者观察的盘上调用。接线建议：refineSearch 的私有 sim 用这个；
  -- 若暂时不确定，用 api.evalNext（慢 ~50 倍但绝对安全）。
  function api.evalNextFast(board, collides, cells, x, opts)
    local H = hooks(opts)
    return evalNextAt(board, bind(board, collides), cells, x, H.el, true)
  end

  -- refineCandidate：refineSearch 的**一个候选预算单元**（main.lua:4902-4965）
  -- 落块→消行→用下一块的全旋转/全列最优 evalNext 给 score2。返回 bestNext, score2。
  -- nextPiece 可以给表 {cells, n}，也可以直接给方块名（'I'/'T'…，内部查 spec.shapes）——
  -- 生产侧 g.nextName 是名字，接线时不必手工拼表。
  function api.refineCandidate(board, collides, piece, nextPiece, cand, opts)
    if type(nextPiece) == 'string' then nextPiece = SHAPES[nextPiece] end
    if not piece or not cand or not nextPiece then return nil end
    local H = hooks(opts)
    local cb = bind(board, collides)
    local cells = rotN(piece.cells, piece.n or 4, cand.rot or 0)
    local y = landingYOn(board, cb, cells, cand.x)
    if not y then return nil end
    local sim = copyBoard(board)
    for i = 1, 4 do
      local br, bc = y + cells[i][1] - 1, cand.x + cells[i][2] - 1
      if br >= 1 and br <= ROWS and bc >= 1 and bc <= COLS then sim[br][bc] = 1 end
    end
    -- 消行：物理删行 + 顶部补空行（refineSearch 同口径，注意与 evalNext 内部的"满行视作已消"不同）
    local r = ROWS
    while r >= 1 do
      local row = sim[r]
      local isFull = true
      for c = 1, COLS do
        if row[c] == 0 then isFull = false break end
      end
      if isFull then
        table.remove(sim, r)
        local nr = {}
        for c = 1, COLS do nr[c] = 0 end
        table.insert(sim, 1, nr)
      else
        r = r - 1
      end
    end
    local simC = function(cs, sx, sy) return collidesOn(sim, cs, sx, sy) end
    local nextN = nextPiece.n or 4
    local ncells = nextPiece.cells
    local bestNext
    for _ = 1, 4 do
      local wmax = 1
      for i = 1, 4 do
        if ncells[i][2] > wmax then wmax = ncells[i][2] end
      end
      for nx = 1, COLS - wmax + 1 do
        local sc = evalNextAt(sim, simC, ncells, nx, H.el, true)   -- sim 是本候选私有副本
        if sc and (not bestNext or sc > bestNext) then bestNext = sc end
      end
      ncells = rot(ncells, nextN)
    end
    local add = bestNext or NO_NEXT_PENALTY
    return bestNext, (cand.score or 0) + add
  end

  -- refine：整表精化（供 headless 复现/对拍；生产走 aiTickCore 的分帧预算驱动）
  -- 注意：会在传入候选表的元素上写 score2（与生产一致；候选表由本模块产出）
  function api.refine(board, collides, piece, nextPiece, cands, opts)
    local best2, bestScore
    for i = 1, #cands do
      local _, s2 = api.refineCandidate(board, collides, piece, nextPiece, cands[i], opts)
      if s2 then
        cands[i].score2 = s2
        if not bestScore or s2 > bestScore then bestScore, best2 = s2, cands[i] end
      end
    end
    return best2, bestScore
  end

  -- ===== Hold 决策（main.lua:5033-5069 的纯函数版）=====
  -- opts = { canHold, holdEnabled, slot, next, stay, holdMargin, saveI, wellDepth,
  --          + 评估钩子（simple/atk/well/wellCol/wellBase/bw/bwSimple/resetRows）}
  -- 返回 { doHold = bool, why = 'better'|'saveI'|'fireI'|nil, gain?, well? }
  function api.holdDecision(board, collides, piece, opts)
    local o = opts or EMPTY
    local res = { doHold = false }
    if not o.canHold or not o.holdEnabled or not piece then return res end
    local H = hooks(o)
    local cb = bind(board, collides)
    local stay = o.stay
    if stay == nil then
      local plan = api.bestPlacement(board, cb, piece, o)
      if not plan then return res end
      stay = plan.score
    end
    local altName = o.slot or o.next
    local alt = altName and SHAPES[altName] or nil
    if alt then
      local cells = alt.cells
      local bestAlt
      for _ = 1, 4 do
        local wmax = 1
        for i = 1, 4 do
          if cells[i][2] > wmax then wmax = cells[i][2] end
        end
        for ax = 1, COLS - wmax + 1 do
          local sc, _, _, top = scoreAt(board, cb, cells, ax, H)
          if sc and top <= H.resetRows and (not bestAlt or sc > bestAlt) then bestAlt = sc end
        end
        cells = rot(cells, alt.n)
      end
      local margin = o.holdMargin or 1.2
      if bestAlt and bestAlt > stay + margin then
        res.doHold, res.why, res.gain = true, 'better', bestAlt - stay
        return res
      end
    end
    local wellThreshold = o.wellDepth or 4
    if o.saveI and piece.name == 'I' and piece.n == 4 then
      local wd = wellDepthOn(board)
      if wd >= wellThreshold - 1 and o.slot ~= 'I' then
        return { doHold = true, why = 'saveI', well = wd }
      end
    end
    if o.saveI and o.slot == 'I' and piece.name ~= 'I' then
      local wd = wellDepthOn(board)
      if wd >= wellThreshold then
        return { doHold = true, why = 'fireI', well = wd }
      end
    end
    return res
  end

  return api
end

return M
