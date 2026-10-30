--!strict-ish（本仓库不跑类型检查，这里只标契约）
-- ============================================================================
-- lua/tetris/aieval.lua —— 棋盘评估（BCTS 1-ply 打分）
-- 从 main.lua 拆出：main chunk 有 Lua 5.3 的 **200 local 硬上限**（真机编译期
-- `too many local variables (limit is 200) in main function` 直接拒载），纯函数搬进模块后
-- 这个模块有自己的预算，主文件不再吃这 4 个 local + 330 行。
-- 模块契约见 docs/research/lua-module-contract.md：require 期不跑生命周期、顶层不实例化控件、
-- chunk 必须 return 恰好 1 个值。
-- ============================================================================
local M = {}

-- opts = {
--   rows, cols        : 棋盘尺寸
--   num               : NUM 权重表（main 的 NUM 原样传入）
--   board             : function() -> 当前盘实例 g（有 .board 二维表）
--   collides          : function(cells, x, y) -> boolean
-- }
function M.new(opts)
  local ROWS, COLS = opts.rows, opts.cols
  local NUM = opts.num
  local collides = opts.collides
  local board = opts.board
  -- BCTS 权重（原 main 顶部常量，随块迁入）
  local W_WALL, W_WELL = 0.06, 0.9
  local WELL_DEPTH = 3

  local function colHeight(c)
    local g = board()          -- 模块化后由调用方注入当前实例
    if not g.board then return 0 end
    for r = 1, ROWS do
      if g.board[r][c] ~= 0 then return ROWS - r + 1 end
    end
    return 0
  end

  local function wellDepth()
    local g = board()          -- 模块化后由调用方注入当前实例
    if not g.board then return 0 end
    local h = {}
    for c = 1, COLS do
      h[c] = 0
      for r = 1, ROWS do
        if g.board[r][c] ~= 0 then h[c] = ROWS - r + 1 break end
      end
    end
    -- 右墙井（第 COLS 列）：只算这一侧，与 AI 选井口径一致（左墙第 1 列填不到 I，见 aiTickCore 注释）
    local d = h[COLS - 1] - h[COLS]
    if d < 0 then d = 0 end
    return d
  end

  local function stackHeight()
    local g = board()          -- 模块化后由调用方注入当前实例
    for r = 1, ROWS do
      for c = 1, COLS do
        if g.board[r][c] ~= 0 then return ROWS - r + 1 end
      end
    end
    return 0
  end

  -- 评估「cells 放到 x 列、自然落地」之后：返回 分数 / 落点高度 / 消行数；放不进返回 nil
  -- 四项（El-Tetris / Lee 2013 公开权重，原样）+ 两项"像人"的小修正：
  --   -0.06 × 离最近墙的列距（贴边偏好，只做同分/近似分的 tie-breaker）
  --   -0.9  × 深度，对每个 1 列宽、深度 >= 3 的中间凹槽（不许为了塞竖 I 在中间挖井）
  -- ===== BCTS 评估函数（v2.4 AI 强度重做）=====
  -- 信源【论文】Christophe Thiery & Bruno Scherrer, "Building Controllers for Tetris",
  -- ICGA Journal 32(1) 2009, §4（HAL: https://hal.science/inria-00418954；本地 /tmp/bcts.pdf）。
  -- BCTS=2008 强化学习竞赛冠军，1-ply 无前瞻 + 交叉熵优化权重 ⇒ 简化 Tetris 3500 万行
  -- （真 Tetris 保守下界 91 万行）。8 特征定义（论文 Table 1，社区标准实现口径）：
  --   Landing height=落块四格平均高度；Eroded piece cells=消行数×落块在消行中的格数（Lee 实现口径）；
  --   Row/Column transitions=水平/垂直邻接 满空 跳变数（行边界视为满、列顶空/列底满）；
  --   Holes=被实格覆盖的空格数；Cumulative wells=Σ d*(d+1)/2 每口井（墙视为 ROWS 高）；
  --   Hole depth=每洞上方实格数之和；Rows with holes=含≥1 洞的行数。
  -- 权重【论文】原值（交叉熵优化结果，不手调）；量纲：Landing~0-20、trans~20-80、wells~0-40。
  local W_AGG, W_LINE, W_HOLE, W_BUMP = -0.510066, 0.760666, -0.35663, -0.184483  -- 旧 El-Tetris（evalNext 兼容保留）
  local function evalBoard(cells, x)
    local g = board()          -- 模块化后由调用方注入当前实例
    if collides(cells, x, 1) then return nil end
    local y = 1
    while y < ROWS and not collides(cells, x, y + 1) do y = y + 1 end
    -- BCTS：模拟盘（落块标 2 以识别 eroded 归属）——第一层每块只跑 ~34 次，分配量级安全
    local sim = {}
    for r = 1, ROWS do
      local row = {}
      for c = 1, COLS do row[c] = g.board[r][c] end
      sim[r] = row
    end
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
    -- Cumulative wells：Σ d*(d+1)/2（1+2+…+d），墙视为 ROWS 高（BCTS/Dellacherie 标准口径）
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
    -- v4.0 ④：easy 档走**简化评估**（"想得少"，不是"故意摆错"——后者是用户点名反对的）
    local BW = NUM.AI_SIMPLE and NUM.BW_SIMPLE or NUM.BW
    -- v4.0 ④-b：留井模式（AI_WELL>0）下**宽容井惩罚**——BCTS 的 CW=-10.49 会让"保留 4 深井"
    -- 付出 -105 分，任何留井奖励都抵不过 ⇒ AI 永远不敢攒井打四消（实测 120 块 0 次四消）。
    -- 缩到 35% 后，I 块四消的正收益（ER=+6.6×4行×4格=+105.6 加 attack 加成）才压得住。
    local cwW = BW.CW
    if (NUM.AI_WELL or 0) > 0 then cwW = cwW * 0.35 end
    local sc = BW.LH * lh + BW.ER * epc + BW.RT * rt + BW.CT * ct
      + BW.HO * holes + cwW * cw + BW.HD * hdepth + BW.RH * rowsWithHoles
    -- ④-a 多消行（对抗模式）：对手快死时把 2+ 行的收益按 n² 放大 ⇒ AI 才会"攒着一次消"造垃圾
    local atk = NUM.AI_ATK or 0
    if atk > 0 then
      if complete and complete >= 2 then
        sc = sc + atk * complete * complete
      end
      -- ④-a2 **攒行**：把"9/10 格满的行"当资产。1-ply 看不到"下一块就能消 2 行"，
      -- 只能给"接近满行"直接加分 ⇒ AI 才肯把多行同时推到临门一脚。
      local nearFull = 0
      for rr = 1, ROWS do
        local empty = 0
        for c = 1, COLS do if sim[rr][c] == 0 then empty = empty + 1 end end
        if empty == 1 then nearFull = nearFull + 1 end
      end
      if nearFull > 0 then sc = sc + atk * 0.9 * nearFull end
      -- ④-a3 造井（attack + 井模式）：为了让"攒 4 行"真的发生，必须**暂时不急着消行**。
      -- 做法：消行权重压到 30%，并给"井旁那一列"的堆高（上限 6 行）直接加分。
      -- 这是有意的策略切换：对手快死时用整洁度换垃圾行（用户：「积累然后一次消除更多的行」）。
      -- 实测（2026-10-29）：把消行权重压到 30% + 邻列堆高奖励，仍然**堆不出深井**
      -- （`ai well col=10 base=6 depth=0`：预留列每块都被填上去，depth 恒 0）。
      -- 结论：预留一列需要"连续 4 步都不碰它"的规划力，1-ply 做不到 ⇒ 这里只保留很轻的
      -- 邻列堆高倾向（1.5 分/行，上限 6），把"攒行"交给 nearFull 项；真正的四消等 2-ply。
      if (NUM.AI_WELL or 0) > 0 then
        local hNear = heights[COLS - 1] or 0
        if hNear > 6 then hNear = 6 end
        sc = sc + 1.5 * hNear
      end
    end
    -- ④-b 留井：靠墙 1 列宽、深 ≥3 的井是 I 块四消的落点（给一点正向分，避免 AI 顺手填平）
    local wellW = NUM.AI_WELL or 0
    if wellW > 0 then
      local dl = (heights[2] or 0) - (heights[1] or 0)
      local dr = (heights[COLS - 1] or 0) - (heights[COLS] or 0)
      if dl >= 3 or dr >= 3 then sc = sc + wellW end
      -- ④-c 井纪律：指定井列除非"这一手直接四消"，否则不许往里放块。
      -- 为什么必须硬约束：1-ply 评估看不到"攒 4 行再放 I"的收益，只能像人一样先占住一列不用。
      local wc, base = NUM.AI_WELLCOL or 0, NUM.AI_WELLBASE or 0
      if wc > 0 then
        local afterH = 0
        for rr = 1, ROWS do
          if sim[rr][wc] ~= 0 then afterH = ROWS - rr + 1 break end
        end
        if afterH > base and not (complete and complete >= 3) then
          sc = sc - 45
        end
      end
    end
    return sc, top, complete
  end

  -- [v1 时代的旧 El-Tetris 评估体已整体替换为上方 BCTS；evalNext（第二层零分配版）

  return {
    colHeight = colHeight,
    wellDepth = wellDepth,
    stackHeight = stackHeight,
    evalBoard = evalBoard,
  }
end

return M
