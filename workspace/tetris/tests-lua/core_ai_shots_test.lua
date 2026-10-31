--[[==========================================================================
  tests-lua/core_ai_shots_test.lua —— 「I 块四消射击」从不可达分支做成 opt-in 能力的验收
  跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_ai_shots_test.lua
  判据：全 PASS + 退出码 0（run_all.lua 自动收录 *_test.lua）

  要证明的四件事（task-9）：
    §1 **旧判据在 AI 自主路径上不可达**：生产 aiChoose 那条 `c.rot == 1 and c.x == COLS - 1`
       （本模块里 rot 是 0-based ⇒ `c.rot == 0`）在"piece = 出生朝向（横 I）"时与 rot × 合法 x 的
       全域无交点。**但不是无条件死代码**：rot 是"从当前朝向再转几次"，piece 已转到竖放（盒内第 2 列）
       时 x = COLS-1 合法 ⇒ 玩家转竖后接管 AI 的那条窄路径会真的开火（§1.9/§1.9c/§1.10 断言）。
    §2 **默认关 == 生产语义**：shots 缺省时 choose 的逐字段（rot/x/landingY/score/sorted 次序/reset）
       与改动前一致（§2.1 冻结期望值）+ 与 'legacy' 档逐例同解 + 全方块全盘面命中数 0。
    §3 **新判据可达**：'fixed' 档在"第 10 列空井"盘上确实返回该落点，且落点经 collides 复验合法、
       消行数经 evaluate 复验 = 4；命中时**覆盖评分**（最高优先级，与生产分支 `return c` 同权）。
    §4 **确定性与纯净**：同输入两次同解、不 print、不改输入、不动 _G。

  几何真相（§1 打印的表，注册在本文件也是文档）：
    I 出生 cells = {{2,1},{2,2},{2,3},{2,4}} = **横** I（第 2 行、盒内第 1..4 列），wmax = 4。
    turns = 0..3（即 0-based rot）：
      turn 0  wmax 4  盒内列 {1,2,3,4}  合法 x = 1..7   横 I（生产 rot=1 就是这一档）
      turn 1  wmax 3  盒内列 {3}        合法 x = 1..8   **竖 I**，占落列 x+2 ⇒ 进第 10 列需 x = 8
      turn 2  wmax 4  盒内列 {1,2,3,4}  合法 x = 1..7   横 I
      turn 3  wmax 2  盒内列 {2}        合法 x = 1..9   **竖 I**，占落列 x+1 ⇒ 进第 10 列需 x = 9
    ⇒ 生产判据要 (rot 0-based == 0) ∧ (x == 9)：前者与合法域 1..7 无交 ⇒ 恒假。
    这也解释了历史结论"四消打不出来"的**一半**：分支不可达，不是概率低。
    另一半（§3.9）：干净井盘上 1-ply **本来就会**把竖 I 放进井里，所以那个分支就算修好，
    在干净盘上也不改变决策；它只在"井纪律惩罚/评分被拉偏"的盘面才有增量。

  oracle 说明：本文件是**规格取证**，不是对生产代码的对拍（那条在 core_ai_test.lua §4/§5.3）。
  生产判据以注释形式逐字复刻在 §1.5，改动生产条件时必须同步这里。
=======================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local coreAI = load('lua/tetris/core_ai.lua')

local NUM, SHAPES = cfg.NUM, cfg.SHAPES
local ROWS, COLS = cfg.ROWS, cfg.COLS

-- 三个实例：默认（关） / 'legacy'（= 生产判据） / 'fixed'（opt-in 能力）
local AI = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES }
local AI_LEGACY = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES, shots = 'legacy' }
local AI_FIX = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES, shots = 'fixed' }
local AI_FIX_TRUE = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES, shots = true }
local AI_FIX_CLEAR3 = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES,
                                   shots = 'fixed', shotMinClear = 3 }
local AI_FIX_COL5 = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES,
                                 shots = 'fixed', shotWellCol = 5 }

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

-- ===== 构造器（测试局部，不用随机）=====

local function empty()
  local b = {}
  for r = 1, ROWS do
    local row = {}
    for c = 1, COLS do row[c] = 0 end
    b[r] = row
  end
  return b
end

-- heights[c] = 第 c 列堆高（从底往上填）。
-- ⚠ 有效盘判据：**至少一列为 0**（否则底部若干行天然"已满"，evalBoard 的 complete 会把它们数进去，
--   读出来的 clear 就是假的 —— 本轮踩过的坑，见 D749）。
local function boardFromHeights(h)
  local b = empty()
  for c = 1, COLS do
    for k = 1, (h[c] or 0) do b[ROWS - k + 1][c] = 3 end
  end
  return b
end

local function piece(name, turns)
  local s = SHAPES[name]
  local cells = {}
  for i = 1, 4 do cells[i] = { s.cells[i][1], s.cells[i][2] } end
  local pc = { name = name, n = s.n, x = (COLS - s.n) // 2 + 1, cells = cells }
  if turns and turns > 0 then
    local rot = {}
    for i = 1, 4 do rot[i] = { pc.cells[i][1], pc.cells[i][2] } end
    for _ = 1, turns do
      local nx = {}
      for i = 1, 4 do nx[i] = { rot[i][2], pc.n + 1 - rot[i][1] } end
      rot = nx
    end
    pc.cells = rot
    pc.turns = turns
  end
  return pc
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

local function sameBoard(a, b)
  for r = 1, ROWS do
    for c = 1, COLS do
      if a[r][c] ~= b[r][c] then return false end
    end
  end
  return true
end

local ALL = { 'I', 'O', 'T', 'S', 'Z', 'J', 'L' }

-- 板面清单（§2 冻结期望值与 §1 候选级取证共用）
local BOARDS = {
  { 'empty', { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 } },
  { 'flat3', { 3, 3, 3, 3, 3, 3, 3, 3, 3, 0 } },
  { 'flat4', { 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 } },
  { 'stairs', { 7, 5, 4, 4, 3, 3, 2, 2, 1, 0 } },
  { 'ragged', { 6, 5, 4, 4, 4, 4, 4, 4, 4, 0 } },
  { 'holes', { 2, 1, 3, 0, 4, 2, 1, 3, 2, 1 } },
  { 'midhole', { 0, 5, 6, 6, 7, 7, 6, 5, 0, 0 } },
}

-- 生产硬档的评估钩子（aiTickCore 每块写进 NUM 的那组，main.lua:4773-4780）
local WELL_HOOKS = { well = 6.3, wellCol = COLS, wellBase = 0 }
-- ⚠ 不能写成 ipairs{ nil, WELL_HOOKS }——数组首元素是 nil 时 ipairs 立刻停，循环体一次都不跑
--   （本轮真踩过：两个计数器都读成 0，测试却"通过"）。空表 == 缺省 opts（hooks() 全走 NUM 兜底）。
local NO_OPTS = {}
local OPTION_SETS = { NO_OPTS, WELL_HOOKS }

-- ============================================================================
-- §1 旧判据不可达（几何枚举取证）
-- ============================================================================
do
  print('-- §1 旧判据可达性取证（四朝向 × rot × 合法 x 全枚举）')
  local spawn = SHAPES.I.cells
  ok(spawn[1][1] == 2 and spawn[1][2] == 1 and spawn[4][1] == 2 and spawn[4][2] == 4,
    '1.1 I 出生 cells 是**横** I（第 2 行、盒内第 1..4 列）',
    string.format('cells[1]=%d,%d cells[4]=%d,%d', spawn[1][1], spawn[1][2], spawn[4][1], spawn[4][2]))

  local wmaxExpect = { 4, 3, 4, 2 }          -- turn 0..3
  local boxColsExpect = { '1,2,3,4', '3', '1,2,3,4', '2' }
  local xMaxExpect = { 7, 8, 7, 9 }          -- = COLS - wmax + 1
  local wmaxOk, boxOk, xMaxOk = true, true, true
  local table1 = {}
  for turns = 0, 3 do
    local cells = AI.rotatedCells(spawn, 4, turns)
    local wmax = 0
    local seen, cols = {}, {}
    for i = 1, 4 do
      if cells[i][2] > wmax then wmax = cells[i][2] end
      if not seen[cells[i][2]] then seen[cells[i][2]] = true; cols[#cols + 1] = cells[i][2] end
    end
    table.sort(cols)
    local xmax = COLS - wmax + 1
    if wmax ~= wmaxExpect[turns + 1] then wmaxOk = false end
    if table.concat(cols, ',') ~= boxColsExpect[turns + 1] then boxOk = false end
    if xmax ~= xMaxExpect[turns + 1] then xMaxOk = false end
    table1[turns + 1] = string.format('turn%d wmax=%d 盒内列{%s} 合法x=1..%d', turns, wmax,
      table.concat(cols, ','), xmax)
  end
  print('  ' .. table.concat(table1, ' | '))
  ok(wmaxOk, '1.2 各档 wmax = {4,3,4,2}（I 的两种朝向：横 4 宽 / 竖 1 宽）')
  ok(boxOk, '1.3 竖 I 的盒内列：turn=1 在第 3 列、turn=3 在第 2 列（生产注释"第 2 列"只对 turn=3 成立）')
  ok(xMaxOk, '1.4 合法落列上界 = {7,8,7,9}（= COLS - wmax + 1）')

  -- 1.5 生产判据逐字复刻（rot 0-based == 0 ⇔ 生产 1-based rot == 1）：
  --     `if c.rot == 1 and c.x == COLS - 1 and (c.clear or 0) >= 2 then return c end`
  --     在 rot × 合法 x 的**全笛卡尔积**上枚举，交集必须为空。
  local hits, domainSize = 0, 0
  for turns = 0, 3 do
    local cells = AI.rotatedCells(spawn, 4, turns)
    local wmax = 0
    for i = 1, 4 do if cells[i][2] > wmax then wmax = cells[i][2] end end
    for x = 1, COLS - wmax + 1 do
      domainSize = domainSize + 1
      if turns == 0 and x == COLS - 1 then hits = hits + 1 end
    end
  end
  ok(hits == 0, '1.5 生产判据在 I 的合法域（4 档共 31 个落点）上命中 0 次',
    string.format('domain=%d hits=%d', domainSize, hits))
  ok(domainSize == 31, '1.5b 合法域大小 = 7+8+7+9 = 31（4 档全枚举，不是抽样）', domainSize)

  -- 1.6 竖 I 进第 COLS 列所需的 x：turn=1 ⇒ x=COLS-2；turn=3 ⇒ x=COLS-1
  local cross = {}
  for i = 1, 4 do cross[i] = { spawn[i][1], spawn[i][2] } end
  local v1 = AI.rotatedCells(spawn, 4, 1)
  local v3 = AI.rotatedCells(spawn, 4, 3)
  local c1 = AI.occupiedCols({ name = 'I', n = 4, cells = v1 }, 0, COLS - 2)
  local c3 = AI.occupiedCols({ name = 'I', n = 4, cells = v3 }, 0, COLS - 1)
  ok(#c1 == 1 and c1[1] == COLS and #c3 == 1 and c3[1] == COLS,
    '1.6 竖 I 进第 COLS 列：turn=1 x=' .. (COLS - 2) .. '、turn=3 x=' .. (COLS - 1),
    string.format('turn1 x=%d -> {%d}, turn3 x=%d -> {%d}', COLS - 2, c1[1] or -1, COLS - 1, c3[1] or -1))

  -- 1.7 候选级：真实 candidates 里**任何盘面**都不存在 (rot==0 ∧ x==COLS-1) 的候选
  local bad = 0
  for _, bd in ipairs(BOARDS) do
    local b = boardFromHeights(bd[2])
    for _, nm in ipairs(ALL) do
      for _, opts in ipairs(OPTION_SETS) do
        for _, c in ipairs(AI.candidates(b, nil, piece(nm), opts)) do
          if nm == 'I' and c.rot == 0 and c.x == COLS - 1 then bad = bad + 1 end
        end
      end
    end
  end
  ok(bad == 0, '1.7 真实候选枚举里 (rot=0 ∧ x=COLS-1) 出现 0 次（7 盘 × 7 方块 × 2 钩子组）', bad)

  -- 1.8 「不是条件太苛刻」：换成最有利的盘（第 COLS 列 4 深空井）旧判据依旧 0 命中
  local b8 = boardFromHeights({ 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 })
  local hits8 = 0
  for _, c in ipairs(AI.candidates(b8, nil, piece('I'), WELL_HOOKS)) do
    if c.rot == 0 and c.x == COLS - 1 and (c.clear or 0) >= 2 then hits8 = hits8 + 1 end
  end
  ok(AI.wellDepth(b8) == 4 and hits8 == 0,
    '1.8 井深 4 的最有利盘上旧判据仍 0 命中 ⇒ 不可达是**域里没有这个点**，不是井不够深',
    string.format('wd=%d hits=%d', AI.wellDepth(b8), hits8))

  -- 1.9 **重要修正：这条分支不是无条件死代码**。判据里的 rot 是"从 piece 当前朝向再转几次"，
  --     所以可达性取决于**规划时刻 piece 已在哪个朝向**。四档全枚举（同一张 2 深井盘）：
  --       pre=0 横（出生）  wmax 4 → x ≤ 7  ⇒ 0 命中
  --       pre=1 竖（盒内3） wmax 3 → x ≤ 8  ⇒ 0 命中
  --       pre=2 横          wmax 4 → x ≤ 7  ⇒ 0 命中
  --       pre=3 竖（盒内2） wmax 2 → x ≤ 9  ⇒ **命中**（rot=0 即"不转"，x=9 占第 COLS 列）
  local b9 = boardFromHeights({ 2, 2, 2, 2, 2, 2, 2, 2, 2, 0 })   -- 右墙井深 2
  local hitsByPre, wmaxByPre = {}, {}
  for pre = 0, 3 do
    local cells = AI.rotatedCells(spawn, 4, pre)
    local wmax = 0
    for i = 1, 4 do if cells[i][2] > wmax then wmax = cells[i][2] end end
    wmaxByPre[pre] = wmax
    local hits = 0
    local pc = { name = 'I', n = 4, x = 4, y = 2, cells = cells }
    for _, c in ipairs(AI.candidates(b9, nil, pc, WELL_HOOKS)) do
      if c.rot == 0 and c.x == COLS - 1 and (c.clear or 0) >= 2 then hits = hits + 1 end
    end
    hitsByPre[pre] = hits
  end
  ok(wmaxByPre[0] == 4 and wmaxByPre[1] == 3 and wmaxByPre[2] == 4 and wmaxByPre[3] == 2,
    '1.9 四朝向的 wmax = {4,3,4,2}（朝向决定"能不能取到 x=COLS-1"）',
    string.format('%d/%d/%d/%d', wmaxByPre[0], wmaxByPre[1], wmaxByPre[2], wmaxByPre[3]))
  ok(hitsByPre[0] == 0 and hitsByPre[1] == 0 and hitsByPre[2] == 0,
    '1.9b 前三档（含出生朝向）旧判据 0 命中 —— AI 自主路径（出块即规划）恒假',
    string.format('%d/%d/%d', hitsByPre[0], hitsByPre[1], hitsByPre[2]))
  ok(hitsByPre[3] == 1,
    '1.9c **pre=3（竖 I，盒内第 2 列）时旧判据命中 1 次** —— 不是无条件死代码：玩家转竖后接管 AI 时真会开火',
    hitsByPre[3])

  -- 1.10 那条"窄路径"命中的落点确实是"整块进第 COLS 列"（说明它瞄的方向是对的，缺的只是朝向前提）
  local v3 = AI.rotatedCells(spawn, 4, 3)
  local c3 = AI.occupiedCols({ name = 'I', n = 4, cells = v3 }, 0, COLS - 1)
  ok(#c3 == 1 and c3[1] == COLS,
    '1.10 pre=3 命中的落点占第 ' .. COLS .. ' 列（与 opt-in 判据的目标一致）', c3[1])

  -- 1.11 标准 AI 路径的证据（不是断言口气）：出生朝向 + 井深 2/4 两盘，旧判据总命中 = 0
  local stdHits = 0
  for _, hh in ipairs({ { 2, 2, 2, 2, 2, 2, 2, 2, 2, 0 }, { 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 } }) do
    local b = boardFromHeights(hh)
    for _, c in ipairs(AI.candidates(b, nil, piece('I'), WELL_HOOKS)) do
      if c.rot == 0 and c.x == COLS - 1 and (c.clear or 0) >= 2 then stdHits = stdHits + 1 end
    end
  end
  ok(stdHits == 0, '1.11 AI 自主路径（出生朝向）在 2/4 深井盘上命中 0 次', stdHits)
end

-- ============================================================================
-- §2 默认关 == 生产语义（逐值不变）
-- ============================================================================
do
  print('-- §2 默认关（shots=false）：行为与改动前逐值相同')
  -- 2.1 冻结期望值：来自**改动前**实现的输出（rot/x/landingY/score/sorted 长度/reset）
  local FROZEN = {
    { 'empty', 'I', 0, 1, 19, -579.130000, 31, 0 },
    { 'empty', 'T', 0, 1, 19, -611.217500, 33, 0 },
    { 'flat3', 'I', 1, 8, 17, -538.675000, 31, 0 },
    { 'flat3', 'T', 0, 1, 16, -712.047500, 33, 0 },
    { 'flat4', 'I', 1, 8, 17, -492.475000, 31, 0 },
    { 'flat4', 'T', 0, 1, 15, -766.637500, 33, 0 },
    { 'stairs', 'I', 0, 7, 17, -588.480000, 31, 0 },
    { 'stairs', 'T', 3, 9, 18, -552.160000, 33, 0 },
    { 'ragged', 'I', 1, 8, 17, -492.475000, 31, 0 },
    { 'ragged', 'T', 0, 3, 15, -756.147500, 33, 0 },
    { 'holes', 'I', 1, 2, 17, -715.145000, 31, 0 },
    { 'holes', 'T', 3, 9, 17, -780.510000, 33, 0 },
    { 'midhole', 'I', 1, 8, 17, -989.405000, 31, 0 },
    { 'midhole', 'T', 1, 8, 18, -948.510000, 33, 0 },
  }
  local byName = {}
  for _, bd in ipairs(BOARDS) do byName[bd[1]] = bd[2] end
  local drift = {}
  for _, row in ipairs(FROZEN) do
    local plan = AI.choose(boardFromHeights(byName[row[1]]), nil, piece(row[2]))
    local bad = (plan == nil) or plan.rot ~= row[3] or plan.x ~= row[4]
      or plan.landingY ~= row[5] or not near(plan.best1.score, row[6]) or #plan.sorted ~= row[7]
      or ((plan.reset and 1 or 0) ~= row[8])
    if bad then
      drift[#drift + 1] = string.format('%s/%s 期望(%d,%d,%s,%.4f,%d) 实得(%s,%s,%s,%s,%s)',
        row[1], row[2], row[3], row[4], tostring(row[5]), row[6], row[7],
        tostring(plan and plan.rot), tostring(plan and plan.x), tostring(plan and plan.landingY),
        tostring(plan and plan.best1 and plan.best1.score), tostring(plan and #plan.sorted))
    end
  end
  ok(#drift == 0, '2.1 冻结期望值 7 盘 × 2 方块逐字段不变（改动前 = 改动后）', drift[1])

  -- 2.2 默认 == 'legacy'（同一条生产判据），7 盘 × 7 方块逐字段 + sorted 全序
  local diff, cases = 0, 0
  for _, bd in ipairs(BOARDS) do
    local b = boardFromHeights(bd[2])
    for _, nm in ipairs(ALL) do
      for _, opts in ipairs(OPTION_SETS) do
        local a = AI.choose(b, nil, piece(nm), opts)
        local l = AI_LEGACY.choose(b, nil, piece(nm), opts)
        cases = cases + 1
        local same = (a == nil and l == nil) or (a and l and a.rot == l.rot and a.x == l.x
          and a.landingY == l.landingY and #a.sorted == #l.sorted)
        if same and a and l then
          for i = 1, #a.sorted do
            if a.sorted[i].rot ~= l.sorted[i].rot or a.sorted[i].x ~= l.sorted[i].x then same = false end
          end
        end
        if not same then diff = diff + 1 end
      end
    end
  end
  ok(diff == 0, '2.2 默认（off）与 legacy 档逐例同解（98 例：7 盘 × 7 方块 × 2 钩子组）', diff)
  ok(cases == 98, '2.2b 用例数 = 98（不是抽样）', cases)

  -- 2.3 默认路径从不标 shot
  local shotCount = 0
  for _, bd in ipairs(BOARDS) do
    local b = boardFromHeights(bd[2])
    for _, nm in ipairs(ALL) do
      for _, opts in ipairs(OPTION_SETS) do
        local a = AI.choose(b, nil, piece(nm), opts)
        if a and a.shot then shotCount = shotCount + 1 end
      end
    end
  end
  ok(shotCount == 0, '2.3 默认档 98 例里 shot 标记出现 0 次（分支真的没跑起来）', shotCount)

  -- 2.4 候选级：全方块 × 全盘面 × 2 钩子组，旧判据命中总数 0
  local legacyHits, cands = 0, 0
  for _, bd in ipairs(BOARDS) do
    local b = boardFromHeights(bd[2])
    for _, nm in ipairs(ALL) do
      for _, opts in ipairs(OPTION_SETS) do
        for _, c in ipairs(AI.candidates(b, nil, piece(nm), opts)) do
          cands = cands + 1
          if c.rot == 0 and c.x == COLS - 1 and (c.clear or 0) >= 2 then legacyHits = legacyHits + 1 end
        end
      end
    end
  end
  ok(legacyHits == 0, '2.4 全方块候选级旧判据命中 0（' .. cands .. ' 个候选）', legacyHits)

  -- 2.5 非法档位报错（不静默降级成 off）
  local okBad = pcall(function()
    coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES, shots = 'fixd' }
  end)
  ok(okBad == false, '2.5 spec.shots 非法值直接报错（不静默当 off）', tostring(okBad))

  -- 2.6 默认档的 shotMode 契约字段
  ok(AI.shotMode == 'off' and AI_LEGACY.shotMode == 'legacy' and AI_FIX.shotMode == 'fixed',
    '2.6 api.shotMode 如实反映档位',
    AI.shotMode .. '/' .. AI_LEGACY.shotMode .. '/' .. AI_FIX.shotMode)
end

-- ============================================================================
-- §3 新判据可达（opt-in）
-- ============================================================================
do
  print('-- §3 开启（shots=fixed）：可达 + 最高优先级')
  -- 3.1 干净 4 深井（1..9 列高 4、第 10 列空）：竖 I 落井 = 四消
  local b4 = boardFromHeights({ 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 })
  local pI = piece('I')
  local plan = AI_FIX.choose(b4, nil, pI)
  ok(plan ~= nil and plan.shot == true, '3.1 开启后确实触发射击（plan.shot = true）')
  ok(plan and plan.rot == 1 and plan.x == COLS - 2,
    '3.1b 落点 = 竖 I（rot=1）+ x=' .. (COLS - 2) .. '（竖 I 占盒内第 3 列 ⇒ 落列 x+2 = ' .. COLS .. '）',
    plan and (plan.rot .. '/' .. plan.x))
  ok(plan and plan.landingY == 17, '3.1c 落底行 = 17（井深 4 ⇒ 四格填 17..20）', plan and plan.landingY)

  -- 落点用 collides 复验（放置位不撞、下一格必撞）
  local vCells = AI.rotatedCells(pI.cells, pI.n, 1)
  ok(AI.collides(b4, vCells, COLS - 2, 17) == false, '3.1d 落点可放置（collides=false）')
  ok(AI.collides(b4, vCells, COLS - 2, 18) == true, '3.1e 已落到底（再下一格必撞）')
  local cols = AI.occupiedCols({ name = 'I', n = 4, cells = vCells }, 0, COLS - 2)
  ok(#cols == 1 and cols[1] == COLS, '3.1f 只占第 ' .. COLS .. ' 列（"整块进井"的几何定义）',
    cols[1])

  -- 消行数用 evaluate 复验
  local sc, ly, cleared = AI.evaluate(b4, nil, { name = 'I', n = 4, cells = vCells, x = COLS - 2 })
  ok(cleared == 4 and ly == 17, '3.1g evaluate 复验：这一手真消 4 行（四消）',
    string.format('score=%s landingY=%s cleared=%s', tostring(sc), tostring(ly), tostring(cleared)))

  -- 3.2 井深 2 / 3 时消 2 / 3 行（同一落点形状）
  local b2 = boardFromHeights({ 2, 2, 2, 2, 2, 2, 2, 2, 2, 0 })
  local b3 = boardFromHeights({ 3, 3, 3, 3, 3, 3, 3, 3, 3, 0 })
  local _, _, cl2 = AI.evaluate(b2, nil, { name = 'I', n = 4, cells = vCells, x = COLS - 2 })
  local _, _, cl3 = AI.evaluate(b3, nil, { name = 'I', n = 4, cells = vCells, x = COLS - 2 })
  ok(cl2 == 2 and cl3 == 3, '3.2 井深 2/3 ⇒ 消 2/3 行（门槛 shotMinClear=2 的最边界）',
    tostring(cl2) .. '/' .. tostring(cl3))

  -- 3.3 **最高优先级**：带生产硬档钩子时 1-ply 会主动避开井（井纪律 -45），射击必须压过它
  local offPlan = AI.choose(b2, nil, pI, WELL_HOOKS)
  local fixPlan = AI_FIX.choose(b2, nil, pI, WELL_HOOKS)
  ok(offPlan and offPlan.rot == 0 and offPlan.x == 1,
    '3.3 默认档在 well 钩子下避开井（rot=0 x=1 平放）',
    offPlan and (offPlan.rot .. '/' .. offPlan.x .. ' score=' .. tostring(offPlan.score)))
  ok(fixPlan and fixPlan.shot == true and fixPlan.rot == 1 and fixPlan.x == COLS - 2,
    '3.3b 开启后压过评分差异，仍选井（最高优先级）',
    fixPlan and (fixPlan.rot .. '/' .. fixPlan.x))
  ok(fixPlan and offPlan and fixPlan.score < offPlan.score,
    '3.3c 证明是"覆盖评分"而不是"评分刚好更高"（射击候选分更低仍被选中）',
    string.format('shot=%.4f vs off=%.4f', fixPlan and fixPlan.score or 0, offPlan and offPlan.score or 0))

  -- 3.4 非 I 方块不触发（几何上只有竖 I 能整块进 1 列宽井）
  local nonI = 0
  for _, nm in ipairs({ 'O', 'T', 'S', 'Z', 'J', 'L' }) do
    local p = AI_FIX.choose(b4, nil, piece(nm))
    if p and p.shot then nonI = nonI + 1 end
  end
  ok(nonI == 0, '3.4 非 I 方块（O/T/S/Z/J/L）在同一个井盘上不触发', nonI)
  ok(#AI_FIX.shotPlacements(piece('T'), COLS) == 0, '3.4b T 块没有任何"整块占 1 列"的落点')

  -- 3.5 井列可配（spec.shotWellCol）：第 5 列挖井
  local b5 = boardFromHeights({ 4, 4, 4, 4, 0, 4, 4, 4, 4, 4 })
  local p5 = AI_FIX_COL5.choose(b5, nil, pI)
  local c5 = (p5 and p5.x) and AI.occupiedCols({ name = 'I', n = 4,
    cells = AI.rotatedCells(pI.cells, pI.n, p5.rot) }, 0, p5.x) or {}
  ok(p5 and p5.shot == true and #c5 == 1 and c5[1] == 5,
    '3.5 shotWellCol=5 ⇒ 落点整块落在第 5 列（不写死右墙）',
    p5 and (p5.rot .. '/' .. p5.x .. ' cols=' .. table.concat(c5, ',')))

  -- 3.6 shotMinClear 门槛
  local q2 = AI_FIX_CLEAR3.choose(b2, nil, pI)
  local q3 = AI_FIX_CLEAR3.choose(b3, nil, pI)
  ok(q2 and q2.shot == nil, '3.6 shotMinClear=3 时井深 2（只能消 2 行）不触发')
  ok(q3 and q3.shot == true, '3.6b shotMinClear=3 时井深 3 触发')

  -- 3.7 shots=true 与 'fixed' 同解
  local t1 = AI_FIX_TRUE.choose(b4, nil, pI)
  ok(t1 and t1.shot == true and t1.rot == plan.rot and t1.x == plan.x,
    '3.7 shots=true 是 \'fixed\' 的别名（同解）')

  -- 3.8 几何自助查询：竖 I 进第 COLS 列的两条姿态
  local sp = AI_FIX.shotPlacements(pI, COLS)
  local keys = {}
  for _, e in ipairs(sp) do keys[e.rot .. ':' .. e.x] = true end
  ok(#sp == 2 and keys['1:' .. (COLS - 2)] and keys['3:' .. (COLS - 1)],
    '3.8 shotPlacements(I, ' .. COLS .. ') = {rot=1,x=' .. (COLS - 2) .. '} ∪ {rot=3,x=' .. (COLS - 1) .. '}',
    #sp)

  -- 3.9 **诚实的负面证据**：干净井盘上 1-ply 本来就会选这个落点 ⇒ 开关在干净盘上是 no-op。
  --     这条防止把"修好了分支"误当成"AI 现在才会打四消"。
  local samePlace = 0
  for _, hh in ipairs({ { 2, 2, 2, 2, 2, 2, 2, 2, 2, 0 }, { 3, 3, 3, 3, 3, 3, 3, 3, 3, 0 },
                        { 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 } }) do
    local b = boardFromHeights(hh)
    local off = AI.choose(b, nil, pI)
    local on = AI_FIX.choose(b, nil, pI)
    if off and on and off.rot == on.rot and off.x == on.x then samePlace = samePlace + 1 end
  end
  ok(samePlace == 3, '3.9 干净井（深 2/3/4）上 1-ply 已选同一落点 ⇒ 开关在干净盘上不改变决策', samePlace)

  -- 3.10 干净盘上开/关的 plan 结构仍然完整（best1/sorted 都在 —— 生产 shoot 分支只返回裸候选）
  ok(plan and plan.best1 and #plan.sorted > 0, '3.10 射击时仍返回完整 plan（best1 + sorted）')

  -- 3.11 运行期覆盖（opts.shots）：生产档位是运行态（只有硬档留井），不能靠重建实例切换
  local rtOn = AI.choose(b4, nil, pI, { shots = 'fixed' })
  ok(rtOn and rtOn.shot == true and rtOn.rot == 1 and rtOn.x == COLS - 2,
    '3.11 默认实例 + opts.shots=fixed ⇒ 当场开启（不必重建实例）', rtOn and rtOn.shot)
  local rtOff = AI_FIX.choose(b4, nil, pI, { shots = false })
  local rtDefault = AI.choose(b4, nil, pI)
  ok(rtOff and rtOff.shot == nil and rtOff.rot == rtDefault.rot and rtOff.x == rtDefault.x,
    '3.11b fixed 实例 + opts.shots=false ⇒ 当场关闭（与默认实例同解，回到生产语义）',
    rtOff and (tostring(rtOff.shot) .. ' ' .. rtOff.rot .. '/' .. rtOff.x))
  local rtLegacy = AI_FIX.choose(b4, nil, pI, { shots = 'legacy' })
  ok(rtLegacy and rtLegacy.shot == nil, '3.11c opts.shots=legacy ⇒ 走生产判据（仍不可达）')
  local okRtBad = pcall(function() return AI.choose(b4, nil, pI, { shots = 'nope' }) end)
  ok(okRtBad == false, '3.11d opts.shots 非法值报错（不静默当 off）', tostring(okRtBad))
  -- 覆盖只影响当次调用，不改实例状态
  ok(AI.shotMode == 'off' and AI_FIX.shotMode == 'fixed',
    '3.11e opts.shots 不改变实例的构造期档位（无隐藏状态）',
    AI.shotMode .. '/' .. AI_FIX.shotMode)

  -- 3.12 **opt-in 判据与朝向无关**：这块 I 当前转到了哪个朝向都照样开火（旧判据只在 1/4 朝向成立）
  local orientOk, orientDetail = 0, {}
  for pre = 0, 3 do
    local cells = AI.rotatedCells(SHAPES.I.cells, 4, pre)
    local pc = { name = 'I', n = 4, x = 4, y = 2, cells = cells }
    local p = AI_FIX.choose(boardFromHeights({ 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 }), nil, pc)
    local cols = p and AI.occupiedCols({ name = 'I', n = 4, cells = AI.rotatedCells(cells, 4, p.rot) }, 0, p.x) or {}
    if p and p.shot == true and #cols == 1 and cols[1] == COLS then orientOk = orientOk + 1 end
    orientDetail[#orientDetail + 1] = string.format('pre%d rot=%s x=%s', pre,
      tostring(p and p.rot), tostring(p and p.x))
  end
  ok(orientOk == 4, '3.12 四种当前朝向下 opt-in 判据都开火（旧判据只有 1/4）',
    table.concat(orientDetail, ' | '))
end

-- ============================================================================
-- §4 确定性与纯净
-- ============================================================================
do
  print('-- §4 确定性 & 纯净')
  local b = boardFromHeights({ 4, 4, 4, 4, 4, 4, 4, 4, 4, 0 })
  local snap = copyBoard(b)
  local pI = piece('I')
  local p1 = AI_FIX.choose(b, nil, pI)
  local p2 = AI_FIX.choose(b, nil, pI)
  local same = p1 and p2 and p1.rot == p2.rot and p1.x == p2.x and p1.landingY == p2.landingY
    and p1.shot == p2.shot and #p1.sorted == #p2.sorted
  if same then
    for i = 1, #p1.sorted do
      if p1.sorted[i].rot ~= p2.sorted[i].rot or p1.sorted[i].x ~= p2.sorted[i].x then same = false end
    end
  end
  ok(same, '4.1 同输入两次调用完全同解（含 shot 标记与 sorted 全序）')
  ok(sameBoard(b, snap), '4.2 盘面未被改写')
  ok(pI.cells[1][1] == SHAPES.I.cells[1][1] and pI.cells[4][2] == SHAPES.I.cells[4][2],
    '4.3 方块 cells 未被改写')

  -- 不 print：临时换掉 print 计数
  local realPrint, calls = print, 0
  print = function() calls = calls + 1 end
  local okRun = pcall(function()
    AI_FIX.choose(b, nil, pI)
    AI_FIX.bestPlacement(b, nil, pI)
    AI.choose(b, nil, pI, WELL_HOOKS)
  end)
  print = realPrint
  ok(okRun and calls == 0, '4.4 开关开着时模块一次 print 都没有', calls)

  -- 不改 _G
  local before = {}
  for k in pairs(_G) do before[k] = true end
  AI_FIX.shotPlacements(pI, COLS)
  AI_FIX.occupiedCols(pI, 1, COLS - 2)
  AI_FIX.choose(b, nil, pI)
  local added = 0
  for k in pairs(_G) do if not before[k] then added = added + 1 end end
  ok(added == 0, '4.5 调用后 _G 无新增键（含几何自助查询）', added)

  -- 独立实例同解（模块无隐藏状态）
  local FIX2 = coreAI.new { rows = ROWS, cols = COLS, num = NUM, shapes = SHAPES, shots = 'fixed' }
  local p3 = FIX2.choose(b, nil, piece('I'))
  ok(p3 and p1 and p3.rot == p1.rot and p3.x == p1.x and near(p3.score, p1.score),
    '4.6 独立实例同解')

  -- 与 core_ai_test.lua 的 179 断言互不干扰：默认实例的 shotMode 仍是 off
  ok(AI.shotMode == 'off', '4.7 既有 179 断言的默认路径未被改动（shotMode=off）')
end

-- ============================================================================
print(string.format('== core_ai_shots_test: %d passed, %d failed ==', pass, fail))
if fail > 0 then os.exit(1) end
