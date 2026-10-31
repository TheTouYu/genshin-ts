--[[==========================================================================
 tests-lua/core_play_test.lua —— core_* 玩法纯逻辑的 headless 验收（不依赖模拟器）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/core_play_test.lua
 判据：输出全 PASS、退出码 0。

 这份测试要证明五件事（对应 docs/ARCH.md §0 的病：规则只能靠跑模拟器取证）：
   A 出块：7-bag 保底 / 首袋不 S-Z / 同种子同序列（LCG 逐字等价）
   B 几何：collides 边界、旋转、出生位、硬降落点
   C 棋盘：写盘 landed 索引、消行循环、垫垃圾行、填充计数
   D 计分：1/2/3/4 行、连击、B2B、升级时机（含 tests/11 的 332→712 分数链复现）
   E 状态机：锁定延迟、T-spin、gameover、硬降/软降、锁定延迟重置上限

 断言口径尽量对齐模拟器用例（tests/04、05、11、14、17）的日志数值——
 headless 与模拟器只有口径一致，"L0 绿"才能当成"没改坏玩法"的证据。
=======================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local rngM = load('lua/tetris/core_rng.lua')
local piecesM = load('lua/tetris/core_pieces.lua')
local boardM = load('lua/tetris/core_board.lua')
local stateM = load('lua/tetris/core_state.lua')

local COLS, ROWS, NUM = cfg.COLS, cfg.ROWS, cfg.NUM
local B = boardM.new { cols = COLS, rows = ROWS }
local P = piecesM.new { shapes = cfg.SHAPES, cols = COLS }

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. name)
  else
    fail = fail + 1
    print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or ''))
  end
end
local function eq(a, b) return a == b end
local function join(t) return table.concat(t, ',') end

-- ===== 组装：依赖全部注入（核心模块之间不 require 彼此）=====
local function newRng(seed) return rngM.new { bag = cfg.BAG, seed = seed } end
local function newS(seed, extra)
  local R = newRng(seed or 20261023)
  local spec = { pieces = P, board = B, rng = R, num = NUM, cols = COLS, rows = ROWS }
  if extra then for k, v in pairs(extra) do spec[k] = v end end
  local S = stateM.new(spec)
  return S, R
end

local function blank(s) s.board = B.newBoard() end
local function fillRow(s, r, cols, color)
  for i = 1, #cols do s.board[r][cols[i]] = color or 1 end
end
local function place(s, name, x, y, cells)
  s.piece = { name = name, n = P.nOf(name), color = P.colorOf(name),
    cells = cells or P.cellsOf(name), x = x, y = y }
end
local function kinds(ev)
  local t = {}
  for i = 1, #ev do t[#t + 1] = ev[i].kind end
  return join(t)
end
local function find(ev, kind)
  for i = 1, #ev do if ev[i].kind == kind then return ev[i] end end
  return nil
end

--[[===== A. 出块：LCG + 7-bag =============================================]]
do
  -- A1 同种子同序列（确定性是可复现的前提；改 LCG 常数会立刻红）
  local r1, r2 = newRng(7), newRng(7)
  local q1, q2 = {}, {}
  local same = true
  for i = 1, 40 do
    local a = r1.take(q1)
    local b = r2.take(q2)
    if a ~= b then same = false end
  end
  ok(same, 'A1 同种子 ⇒ 同出块序列（LCG 确定性）')

  -- A2 setSeed 之后能重放（用例靠它复位）
  local r3 = newRng(99)
  local q3 = {}
  local first5 = {}
  for i = 1, 5 do first5[i] = r3.take(q3) end
  r3.setSeed(99)
  local q4 = {}
  local replay = true
  for i = 1, 5 do if r3.take(q4) ~= first5[i] then replay = false end end
  ok(replay, 'A2 setSeed 后重放同序列')

  -- A3 袋内七种各一
  local r5 = newRng(2026)
  local q5 = {}
  local cnt, first7 = {}, {}
  for i = 1, 7 do
    local n = r5.take(q5)
    first7[i] = n
    cnt[n] = (cnt[n] or 0) + 1
  end
  local seven = true
  for _, name in ipairs(cfg.BAG) do if cnt[name] ~= 1 then seven = false end end
  ok(seven, 'A3 一袋 = 七种各一（' .. join(first7) .. '）')

  -- A4 任意连续 13 块含全 7 种（保底判据；12 块不成立，见 main.lua:104-106）
  local r6 = newRng(31337)
  local q6, seq = {}, {}
  for i = 1, 40 do seq[i] = r6.take(q6) end
  local windowOk, badAt = true, 0
  for i = 1, #seq - 12 do
    local seen = {}
    for j = i, i + 12 do seen[seq[j]] = true end
    local all = true
    for _, name in ipairs(cfg.BAG) do if not seen[name] then all = false end end
    if not all then windowOk = false badAt = i end
  end
  ok(windowOk, 'A4 任意连续 13 块含全 7 种', 'badAt=' .. badAt)

  -- A5 首袋不 S/Z 开局（40 个种子全查，不是抽查）
  local firstOk, badSeed, badName = true, 0, ''
  for seed = 1, 40 do
    local R = newRng(seed)
    local q = {}
    local n = R.take(q)
    if n == 'S' or n == 'Z' then firstOk = false badSeed = seed badName = n end
  end
  ok(firstOk, 'A5 首袋不 S/Z 开局（40 种子）', 'seed=' .. badSeed .. ' name=' .. badName)

  -- A6 排除只作用于首袋：第二袋袋首出现 S/Z 的种子必须存在
  --    （否则说明排除被错误地套用到每一袋，等于改玩法）
  local secondHasSZ = 0
  for seed = 1, 40 do
    local R = newRng(seed)
    local q = {}
    R.refill(q)                 -- 第一袋
    local before = #q
    q = {}                      -- 只看第二袋
    R.refill(q)
    if q[1].name == 'S' or q[1].name == 'Z' then secondHasSZ = secondHasSZ + 1 end
  end
  ok(secondHasSZ > 0, 'A6 第二袋可以 S/Z 开局（排除只对首袋）', 'count=' .. secondHasSZ)

  -- A7 袋序写进出块记录（日志 bag= 的来源）
  local R7 = newRng(4242)
  local q7 = {}
  for i = 1, 14 do R7.take(q7) end
  ok(R7.bagSeq == 2, 'A7 14 块消耗 2 袋（bagSeq=2）', R7.bagSeq)

  -- A8 take 空队列自动 refill
  local R8 = newRng(1)
  local q8 = {}
  local n8 = R8.take(q8)
  ok(n8 ~= nil and R8.bagSeq == 1, 'A8 空队列 take 自动补袋', tostring(n8))

  -- A9 外部随机源：出块可以挂到调用方自己的流上（G[2] 必须与 aiRand 共用，见 main.lua:211）
  local calls = 0
  local function stub(n) calls = calls + 1 return (calls % n) + 1 end
  local R9 = rngM.new { bag = cfg.BAG, seed = 123, rand = stub }
  local q9 = {}
  R9.refill(q9)
  ok(calls == 6 and #q9 == 7 and R9.seed() == 123,
    'A9 注入外部随机源：洗袋走外部流、内部 LCG 种子不动', calls)
end

--[[===== B. 方块：形状真源 / 旋转 / 出生位 ================================]]
do
  -- B1 形状表不复制第二份（ARCH.md §8：数值只准一份）
  ok(P.shape('T') == cfg.SHAPES.T, 'B1 形状直接引用 config.SHAPES（无第二份数据）')

  -- B2 cellsOf 深拷贝：旋转不能写坏共享形状表
  local cells = P.cellsOf('T')
  local before = cfg.SHAPES.T.cells[1][2]
  P.rotateCells(cells, 3)
  ok(cfg.SHAPES.T.cells[1][2] == before, 'B2 旋转不写坏 SHAPES（深拷贝生效）')

  -- B3 出生位 = (COLS-n)//2+1（I→4 / O→5 / T→4）
  ok(P.spawnX('I') == 4 and P.spawnX('O') == 5 and P.spawnX('T') == 4,
    'B3 出生位 x 与 main.lua:1095 同式',
    P.spawnX('I') .. '/' .. P.spawnX('O') .. '/' .. P.spawnX('T'))

  -- B4 顺时针 ×4 回原位（旋转公式自洽）
  local c4 = P.cellsOf('L')
  for _ = 1, 4 do c4 = P.rotateCells(c4, 3) end
  local same = true
  local orig = cfg.SHAPES.L.cells
  for i = 1, 4 do
    if c4[i][1] ~= orig[i][1] or c4[i][2] ~= orig[i][2] then same = false end
  end
  ok(same, 'B4 顺时针转 4 次回到原形')

  -- B5 默认不踢墙（现网语义）
  ok(#P.NO_KICK == 1 and P.NO_KICK[1][1] == 0 and P.NO_KICK[1][2] == 0,
    'B5 默认踢墙表 = 只有 {0,0}（等价 main.lua:1412 只判原位）')
end

--[[===== C. 棋盘：碰撞 / 写盘 / 消行 / 垃圾 ===============================]]
do
  local board = B.newBoard()
  ok(#board == ROWS and #board[1] == COLS and board[1][1] == 0,
    'C1 newBoard 尺寸与初值', #board .. 'x' .. #board[1])

  -- C2 左右越界
  ok(B.collides(board, { { 1, 1 } }, 1, 0) == false, 'C2a x=1 / y=0 不碰撞（基线）')
  ok(B.collides(board, { { 1, 1 } }, 0, 1) == true, 'C2b 左边越界算碰撞（bc<1）')
  ok(B.collides(board, { { 1, 1 } }, COLS + 1, 1) == true, 'C2c 右边越界算碰撞（bc>COLS）')

  -- C3 底部越界 / C4 顶部越界不算碰撞（块可以从盘顶之上进入）
  ok(B.collides(board, { { 2, 1 } }, 1, ROWS) == true, 'C3 底部越界算碰撞（br>ROWS）')
  ok(B.collides(board, { { 1, 1 } }, 1, 0) == false, 'C4 顶部越界不算碰撞（br<1）')

  -- C5 已填格
  board[ROWS][1] = 1
  ok(B.collides(board, { { 1, 1 } }, 1, ROWS) == true, 'C5 已填格算碰撞')

  -- C6 写盘返回 landed 索引（(br-1)*COLS+bc：竖 I 在第 1 列 → 1,11,21,31）
  local b6 = B.newBoard()
  local landed = B.lock(b6, { { 1, 1 }, { 2, 1 }, { 3, 1 }, { 4, 1 } }, 1, 1, 7)
  ok(join(landed) == '1,11,21,31', 'C6 landed 索引与 main.lua:1288 同式', join(landed))
  ok(b6[1][1] == 7 and b6[4][1] == 7, 'C6b 写盘值 = 传入颜色')

  -- C7 消行循环：消 2 行后仍是 ROWS 行，且顶部插入空行、未消行内容整体下移
  local b7 = B.newBoard()
  for c = 1, COLS do b7[ROWS][c] = 1 b7[ROWS - 1][c] = 1 end
  b7[ROWS - 2][1] = 2
  local cleared7, removed7 = B.clearRows(b7)
  ok(cleared7 == 2 and #b7 == ROWS, 'C7 消 2 行且行数不变', cleared7 .. '/' .. #b7)
  ok(b7[1][1] == 0 and b7[1][COLS] == 0, 'C7b 顶部插入空行')
  ok(b7[ROWS][1] == 2 and B.filledCount(b7) == 1,
    'C7c 未消行内容整体下移 2 行后仍在盘上', B.filledCount(b7))

  -- C8 硬降落点（空盘，单格在 y=1 ⇒ 可落 ROWS-1 行）
  ok(B.dropRows(B.newBoard(), { { 1, 1 } }, 1, 1) == ROWS - 1, 'C8 硬降落点行数',
    B.dropRows(B.newBoard(), { { 1, 1 } }, 1, 1))

  -- C9 填充计数
  local b9 = B.newBoard()
  fillRow({ board = b9 }, 20, { 1, 2, 3 })
  ok(B.filledCount(b9) == 3, 'C9 filledCount', B.filledCount(b9))

  -- C10 垫垃圾行：顶行被挤掉、底行带 1 个洞
  local b10 = B.newBoard()
  b10[1][1] = 9                              -- 顶行标记，垫行后应被挤掉
  B.addGarbage(b10, 2, function() return 5 end, 8)
  ok(b10[ROWS][5] == 0 and b10[ROWS][4] == 8, 'C10 底行 1 洞垃圾（洞列 5）')
  ok(B.filledCount(b10) == 2 * (COLS - 1), 'C10b 两行垃圾 = 2×(COLS-1) 格', B.filledCount(b10))
  local tagged = false
  for r = 1, ROWS do for c = 1, COLS do if b10[r][c] == 9 then tagged = true end end end
  ok(not tagged, 'C10c 顶行被挤掉（内容丢失语义，同 main.lua:2088）')

  -- C11 holeOf 也可以给表
  local b11 = B.newBoard()
  B.addGarbage(b11, 2, { 3, 7 }, 8)
  ok(b11[ROWS - 1][3] == 0 and b11[ROWS][7] == 0, 'C11 holeOf 表形式')
end

--[[===== D. 计分：1/2/3/4 行、连击、B2B、升级 ============================]]
local S = newS(11)

-- 构造工具：把底部 n 行的指定列填满后，用一块方块补最后一列
local function clearNRows(s, n)
  blank(s)
  local fillStart = ROWS - n + 1
  if n == 1 then
    fillRow(s, ROWS, { 1, 2, 3, 4, 5, 6, 7, 8, 9 })
    place(s, 'O', 9, ROWS - 1)                    -- (19,9)(19,10)(20,9)(20,10) ⇒ 只补满第 20 行
  elseif n == 2 then
    fillRow(s, ROWS, { 1, 2, 3, 4, 5, 6, 7, 8, 9 })
    fillRow(s, ROWS - 1, { 1, 2, 3, 4, 5, 6, 7, 8, 9 })
    place(s, 'O', 9, ROWS - 1)
  elseif n == 3 then
    for r = fillStart, ROWS do fillRow(s, r, { 2, 3, 4, 5, 6, 7, 8, 9, 10 }) end
    place(s, 'I', 1, ROWS - 3, { { 1, 1 }, { 2, 1 }, { 3, 1 }, { 4, 1 } })
  else
    for r = fillStart, ROWS do fillRow(s, r, { 2, 3, 4, 5, 6, 7, 8, 9, 10 }) end
    place(s, 'I', 1, ROWS - 3, { { 1, 1 }, { 2, 1 }, { 3, 1 }, { 4, 1 } })
    -- 上面这套对 4 行同样成立（竖 I 跨 17..20 列 1），行数由 board 决定
  end
  return S.lockAndClear(s)
end

do
  local s1 = S.newGame({})
  local ev1 = clearNRows(s1, 1)
  local c1 = find(ev1, 'clear')
  ok(c1 and c1.n == 1 and c1.score == NUM.SCORE[1] and s1.score == NUM.SCORE[1],
    'D1 消 1 行 = 100 分（level 1）×', c1 and (c1.n .. '/' .. c1.score))
  ok(s1.lines == 1 and s1.combo == 1, 'D1b 消行数/连击计数', s1.lines .. '/' .. s1.combo)

  local s2 = S.newGame({})
  local ev2 = clearNRows(s2, 2)
  local c2 = find(ev2, 'clear')
  ok(c2 and c2.n == 2 and c2.score == NUM.SCORE[2] and s2.score == 300,
    'D2 消 2 行 = 300 分', c2 and c2.score)

  local s3 = S.newGame({})
  local ev3 = clearNRows(s3, 3)
  local c3 = find(ev3, 'clear')
  ok(c3 and c3.n == 3 and c3.score == 500, 'D3 消 3 行 = 500 分', c3 and c3.score)

  local s4 = S.newGame({})
  local ev4 = clearNRows(s4, 4)
  local c4 = find(ev4, 'clear')
  ok(c4 and c4.n == 4 and c4.score == 800, 'D4 消 4 行 = 800 分', c4 and c4.score)

  -- D5 连击：第二次连续消行加 COMBO×(combo-1)×level
  local sc = S.newGame({})
  clearNRows(sc, 2)
  local evc = clearNRows(sc, 2)
  local cc = find(evc, 'clear')
  ok(cc and cc.combo == 2 and cc.score == 300 + NUM.COMBO * 1 * 1,
    'D5 连击加成 = 300 + 50×1×1 = 350', cc and (cc.combo .. '/' .. cc.score))
  ok(sc.score == 650 and sc.lines == 4, 'D5b 累计 650 分 / 4 行', sc.score .. '/' .. sc.lines)

  -- D6 B2B：连续两次四消，第二次基础分 ×1.5（800→1200）再叠加连击
  local sb = S.newGame({})
  clearNRows(sb, 4)
  local evb = clearNRows(sb, 4)
  local cb = find(evb, 'clear')
  ok(cb and cb.b2b == true and cb.score == 1200 + NUM.COMBO,
    'D6 B2B 四消 = 1200 + 连击 50 = 1250', cb and (tostring(cb.b2b) .. '/' .. cb.score))

  -- D7 空落打断连击与 B2B（main.lua:1337-1340）
  local si = S.newGame({})
  clearNRows(si, 4)
  blank(si)
  place(si, 'O', 1, ROWS - 1)                    -- 角落落地，不消行
  S.lockAndClear(si)
  ok(si.combo == 0 and si.b2b == false, 'D7 空落打断 combo/b2b', si.combo .. '/' .. tostring(si.b2b))

  -- D8 升级时机：第 10 行当帧仍用旧 level 算分，升级在算分之后
  local sl = S.newGame({})
  sl.lines, sl.level, sl.combo = 8, 1, 0
  local evl = clearNRows(sl, 2)
  local cl = find(evl, 'clear')
  ok(sl.lines == 10 and sl.level == 2 and cl and cl.levelUp == true,
    'D8 10 行 → 等级 2', sl.lines .. '/' .. sl.level)
  ok(cl and cl.score == 300, 'D8b 升级当帧仍按 level 1 算分（300，不是 600）', cl and cl.score)

  -- D8c 升级后的下一次消行按新等级倍数
  sl.combo = 0
  local evl2 = clearNRows(sl, 1)
  local cl2 = find(evl2, 'clear')
  ok(cl2 and cl2.score == 200, 'D8c 等级 2 后消 1 行 = 100×2 = 200', cl2 and cl2.score)

  -- D9 等级上限：不超过 LEVEL_CAP
  local scap = S.newGame({})
  scap.lines, scap.level = 199, NUM.LEVEL_CAP
  clearNRows(scap, 1)
  ok(scap.level == NUM.LEVEL_CAP, 'D9 等级封顶 LEVEL_CAP=' .. NUM.LEVEL_CAP, scap.level)

  -- D10 复现 tests/11 的分数链（模拟器断言 clear n=2 score=332 → 712）
  --     332 = 硬降 16 行×2 + 消 2 行 300；712 = 332 + 硬降 15 行×2 + (300 + 连击 50)
  local s11 = S.newGame({})
  s11.score = 16 * NUM.HARD
  clearNRows(s11, 2)
  ok(s11.score == 332, 'D10a 分数链 332（对齐 tests/11 首条断言）', s11.score)
  s11.score = s11.score + 15 * NUM.HARD
  clearNRows(s11, 2)
  ok(s11.score == 712 and s11.lines == 4 and s11.combo == 2,
    'D10b 分数链 712 / lines=4 / combo=2（对齐 tests/11 第二条断言）',
    s11.score .. '/' .. s11.lines .. '/' .. s11.combo)
end

--[[===== E. 状态机：硬降/软降/移动/旋转/锁定延迟/T-spin/gameover =========]]
do
  local S = newS(7)

  -- E1 硬降：O 从 y=1 落到 y=19（18 行），分数 = rows × NUM.HARD
  local s1 = S.newGame({})
  blank(s1)
  place(s1, 'O', 5, 1)
  local before = s1.score
  local ev1, dropped = S.hardDrop(s1)
  local hd = find(ev1, 'harddrop')
  ok(dropped == 18 and hd and hd.rows == 18, 'E1 硬降落 18 行（O 在 y=1）', dropped)
  ok(s1.score == before + 18 * NUM.HARD, 'E1b 硬降分 = 18×2 = 36', s1.score - before)
  ok(s1.board[ROWS][5] ~= 0 and s1.board[ROWS][6] ~= 0, 'E1c 硬降后已写入棋盘')
  ok(find(ev1, 'lock') ~= nil and s1.pieceCount == 1, 'E1d 硬降即时锁定')

  -- E2 软降：成功下落 +SOFT，触底即时锁定（main.lua:1369-1370）
  local s2 = S.newGame({})
  blank(s2)
  place(s2, 'O', 5, 1)
  local evs = S.softDrop(s2)
  ok(s2.score == NUM.SOFT and s2.piece.y == 2 and find(evs, 'fall') ~= nil,
    'E2 软降 +1 分并下移一格', s2.score .. '/' .. s2.piece.y)
  blank(s2)
  place(s2, 'O', 5, ROWS - 1)
  local evs2 = S.softDrop(s2)
  ok(find(evs2, 'lock') ~= nil and s2.pieceCount == 1, 'E2b 触底软降即时锁定')

  -- E3 移动：撞墙失败返回 ok=false；成功则记事件（并清 lastRot）
  local s3 = S.newGame({})
  blank(s3)
  place(s3, 'O', 1, ROWS - 1)
  s3.lastRot = true
  local _, okL = S.move(s3, -1)
  ok(okL == false and s3.piece.x == 1, 'E3 左墙撞墙失败')
  local _, okR = S.move(s3, 1)
  ok(okR == true and s3.piece.x == 2 and s3.lastRot == false, 'E3b 右移成功且清 lastRot')
  ok(s3.pieceMoved == true, 'E3c pieceMoved 是「尝试」语义（撞墙也算已操作）')

  -- E4 旋转：默认无踢墙 ⇒ 贴地旋转失败；注入踢墙表后成功（能力与默认行为分离）
  local s4 = S.newGame({})
  blank(s4)
  place(s4, 'I', 7, ROWS - 2)                    -- 横 I 的盒内第 1 行 = 盘面第 18 行
  local _, okRot = S.rotate(s4, 1)
  ok(okRot == false, 'E4 默认无踢墙：落地旋转被地板挡住（同 main.lua:1412）')
  local s4b, _ = newS(7, { kicks = { { 0, 0 }, { 0, -1 } } })
  local s4c = s4b.newGame({})
  blank(s4c)
  place(s4c, 'I', 7, ROWS - 2)
  local _, okRot2 = s4b.rotate(s4c, 1)
  ok(okRot2 == true and s4c.piece.y == ROWS - 3 and s4c.lastRot == true,
    'E4b 注入踢墙表后向上踢一格转成功', tostring(s4c.piece and s4c.piece.y))

  -- E5 T-spin 3 角：bonus = 400 × 消行 × 等级（用升级后的等级）
  local s5 = S.newGame({})
  blank(s5)
  fillRow(s5, ROWS, { 1, 2, 3, 7, 8, 9, 10 })
  s5.board[ROWS - 1][4] = 1                      -- 第 3 个角
  place(s5, 'T', 4, ROWS - 1)                    -- (19,5)(20,4)(20,5)(20,6) ⇒ 补满第 20 行
  s5.lastRot = true
  local ev5 = S.lockAndClear(s5)
  local ts = find(ev5, 'tspin')
  ok(ts ~= nil and ts.lines == 1 and ts.bonus == NUM.TSPIN_BONUS,
    'E5 T-spin 消 1 行 bonus=400', ts and ts.bonus)
  ok(s5.score == 100 + NUM.TSPIN_BONUS, 'E5b T-spin 总分 = 100 消行 + 400 加成', s5.score)

  -- E6 锁定延迟：重力触底发 ldstart，LD_DELAY 后才锁（对齐 tests/17 的日志顺序）
  local s6 = S.newGame({})
  blank(s6)
  place(s6, 'O', 5, ROWS - 1)
  local ldAt, lockAt, tick = false, false, 0
  -- 帧循环 = tickLockDelay → (DAS) → tickGravity，与 main.tickInstance 同序
  for i = 1, NUM.SPEED[1] do
    tick = tick + 1
    for _, e in ipairs(S.tickLockDelay(s6, 1 / 60)) do
      if e.kind == 'ldstart' then ldAt = true end
      if e.kind == 'lock' then lockAt = true end
    end
    for _, e in ipairs(S.tickGravity(s6, 1 / 60)) do
      if e.kind == 'ldstart' then ldAt = true end
      if e.kind == 'lock' then lockAt = true end
    end
  end
  ok(ldAt and not lockAt, 'E6 重力触底先启动锁定延迟（ldstart），不立即锁',
    'ld=' .. tostring(ldAt) .. ' lock=' .. tostring(lockAt) .. ' ticks=' .. tick)
  S.tickLockDelay(s6, NUM.LD_DELAY)
  ok(s6.pieceCount == 1 and s6.ld.t == -1, 'E6b 延迟到期且仍触底 ⇒ 锁定', s6.pieceCount)

  -- E7 gameover：出生位被占 ⇒ 判负（标准 topout = 新块 spawn 不可放）
  local s7 = S.newGame({})
  blank(s7)
  for c = 1, COLS do
    s7.board[1][c] = 1
    s7.board[2][c] = 1
  end
  s7.piece = nil
  local ev7 = S.spawn(s7)
  ok(s7.gameOver == true and find(ev7, 'gameover') ~= nil, 'E7 出生位被占 ⇒ gameOver')

  -- E8 newGame：清空棋盘/账本、重洗袋、首块不是 S/Z、队列还剩 5 块
  local s8 = S.newGame({})
  clearNRows(s8, 4)
  s8.score, s8.combo = 999, 5
  local _, ev8 = S.newGame({ state = s8 })
  local sp = find(ev8, 'spawn')
  ok(s8.score == 0 and s8.lines == 0 and s8.level == 1 and s8.combo == 0,
    'E8 newGame 账本归零', s8.score .. '/' .. s8.lines .. '/' .. s8.level)
  ok(B.filledCount(s8.board) == 0, 'E8b newGame 清空棋盘', B.filledCount(s8.board))
  ok(s8.piece ~= nil and sp ~= nil and s8.piece.name ~= 'S' and s8.piece.name ~= 'Z',
    'E8c 首块已出生且不是 S/Z', s8.piece and s8.piece.name)
  ok(#s8.bagQ == 5 and s8.bagSeq == 1, 'E8d 已取 2 块，队列剩 5 块', #s8.bagQ)

  -- E9 锁定延迟重置上限：超 LD_RESETS 次后强制锁定（main.lua:1388-1396）
  local s9 = S.newGame({})
  blank(s9)
  place(s9, 'O', 5, ROWS - 1)
  s9.ld.t, s9.ld.resets = 0, 0
  S.move(s9, 1)
  ok(s9.ld.resets == 1 and s9.ld.t == 0, 'E9 移动重置锁定延迟（resets=1）', s9.ld.resets)
  s9.ld.t, s9.ld.resets = 0, NUM.LD_RESETS
  local ev9 = S.move(s9, -1)
  ok(find(ev9, 'lock') ~= nil and s9.pieceCount == 1,
    'E9b 超过重置上限 ⇒ 强制锁定', s9.ld.resets)

  -- E10 湿度垃圾：连续 DRYNESS_N 块无消行 ⇒ 发 garbage 事件（main 侧才真垫行）
  local s10 = S.newGame({})
  local garbageEv, n10 = nil, 0
  for i = 1, NUM.DRYNESS_N[1] do
    blank(s10)
    place(s10, 'O', 1 + (i % 5) * 2, ROWS - 1)
    local ev = S.lockAndClear(s10)
    n10 = i
    if find(ev, 'garbage') then garbageEv = find(ev, 'garbage') break end
  end
  ok(garbageEv ~= nil and garbageEv.n == 1 and garbageEv.reason == 'dryness',
    'E10 连续 ' .. NUM.DRYNESS_N[1] .. ' 块无消行 ⇒ garbage 事件', n10)
  ok(s10.dryness == 0, 'E10b 触发后干燥计数归零', s10.dryness)
end

-- ===== 汇总 =====
print(string.format('\n== core_play_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
