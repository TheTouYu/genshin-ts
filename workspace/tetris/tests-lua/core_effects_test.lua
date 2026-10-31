--[[==========================================================================
 tests-lua/core_effects_test.lua —— core_effects（effect 施加层）的 headless 契约
 ----------------------------------------------------------------------------
 跑法：lua5.3 tests-lua/core_effects_test.lua   （工程根；或 TETRIS_ROOT=<工程根>）
 判据：ALL GREEN N/N + exit 0。

 覆盖：
   组0  纯度（源码级 lint：无 require/print/引擎调用/全局随机）
   组1  构造与棋盘工具（含与 core_board 逐值对拍）
   组2  clearBottom       组3  clearTop        组4  clearStackTop（修冰莲自伤）
   组5  clearColumn       组6  addGarbage      组7  freeze 门禁（断链①②）
   组8  blink（含 lockSec 禁横移门禁）          组9  blinkBest
   组10 markBlink（断链③） 组11 applyTo 归属    组12 holdCut/takeOver（断链⑤）
   组13 确定性             组14 与旧 dispatchEffect / raiseGarbage 的差异（对拍）
   组15 mark 单源（雷楔「还在不在」）  组16 canMove 消费契约   组17 wrong-owner（opt-in）
 ----------------------------------------------------------------------------
 注意：本文件**故意不 require core_effects 之外的业务模块**做断言（只在与 core_board
 对拍时 loadfile 一次，缺文件则跳过该组并把 SKIP 打出来，不假装通过）。
=======================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local pass, fail, skip = 0, 0, 0
local fails = {}

local function ok(name, cond, detail)
  if cond then
    pass = pass + 1
    print('PASS ' .. name)
  else
    fail = fail + 1
    fails[#fails + 1] = name .. (detail and ('  ← ' .. tostring(detail)) or '')
    print('FAIL ' .. name .. (detail and ('  ← ' .. tostring(detail)) or ''))
  end
end

local function eq(name, got, want)
  ok(name, got == want, 'got=' .. tostring(got) .. ' want=' .. tostring(want))
end

local function skipped(name, why)
  skip = skip + 1
  print('SKIP ' .. name .. '  ← ' .. tostring(why))
end

local function loadMod(rel)
  local path = ROOT .. '/' .. rel
  local chunk = loadfile(path)
  if not chunk then return nil end
  local okk, v = pcall(chunk)
  if not okk then error('装载失败 ' .. rel .. ': ' .. tostring(v)) end
  return v
end

local function readFile(rel)
  local f = io.open(ROOT .. '/' .. rel, 'r')
  if not f then return nil end
  local s = f:read('*a')
  f:close()
  return s
end

-- 去注释（长注释 + 行注释），供纯度 lint 用
local function stripComments(src)
  src = src:gsub('%-%-%[(=*)%[.-%]%1%]', ' ')
  src = src:gsub('%-%-[^\n]*', ' ')
  return src
end

local CE = loadMod('lua/tetris/core_effects.lua')
if not CE then error('找不到 lua/tetris/core_effects.lua（TETRIS_ROOT=' .. ROOT .. '）') end
local SKL = loadMod('lua/tetris/skills.lua')
local NUM = SKL and SKL.NUM or nil
local CB = loadMod('lua/tetris/core_board.lua')      -- 仅用于对拍

local function mkE(opts)
  opts = opts or {}
  return CE.new{ rows = opts.rows or 20, cols = opts.cols or 10,
                 num = opts.num == nil and NUM or opts.num, fill = opts.fill or 8 }
end

local E = mkE()

-- 造盘：把 (r1..r2) 行、(c1..c2) 列填成 v
local function fillRect(st, r1, r2, c1, c2, v)
  for r = r1, r2 do
    for c = c1, c2 do st.board[r][c] = v or 1 end
  end
  return st
end

-- 造一个 2×2 的 O 块（cells 为 1 基相对坐标，与 main/core_board 同口径）
local function O(c1, r1)
  return { cells = { { r1, c1 }, { r1, c1 + 1 }, { r1 + 1, c1 }, { r1 + 1, c1 + 1 } } }
end
local function oPiece(x, y)
  return { cells = { { 1, 1 }, { 1, 2 }, { 2, 1 }, { 2, 2 } }, x = x, y = y, color = 1 }
end

local function snapshot(board)
  local out = {}
  for r = 1, #board do
    local row = {}
    for c = 1, #board[r] do row[c] = board[r][c] end
    out[r] = row
  end
  return out
end

local function sameBoard(a, b)
  if #a ~= #b then return false end
  for r = 1, #a do
    for c = 1, #a[r] do
      if a[r][c] ~= b[r][c] then return false end
    end
  end
  return true
end

--==========================================================================
-- 组0 纯度：core_* 铁律（零 require / 零 print / 零引擎 / 零全局随机）
--==========================================================================
do
  local src = readFile('lua/tetris/core_effects.lua') or ''
  local code = stripComments(src)
  eq('0.01 模块加载成功', type(CE), 'table')
  eq('0.02 M.VERSION 存在', type(CE.VERSION), 'string')
  ok('0.03 无 require(', not code:find('require%s*%(') )
  ok('0.04 无 print(', not code:find('print%s*%(') )
  ok('0.05 无 io.write', not code:find('io%.write') )
  ok('0.06 无 game./ctl. 引擎调用', (not code:find('game%.[%a_]')) and (not code:find('ctl%.[%a_]')) )
  ok('0.07 无 os.time / math.random（确定性）',
    (not code:find('os%.time')) and (not code:find('math%.random')))
  ok('0.08 无全局赋值到 _G（只返回 M）', not code:find('^_G%.') )
end

--==========================================================================
-- 组1 构造与棋盘工具
--==========================================================================
do
  local st = E.newState{}
  eq('1.01 newState 有 board', type(st.board), 'table')
  eq('1.02 board 行数 = ROWS', #st.board, 20)
  eq('1.03 board 列数 = COLS', #st.board[1], 10)
  eq('1.04 默认 gates.gravityMult = 1', E.gravityMult(st), 1)
  eq('1.05 默认 freezeRows = 0', E.freezeRows(st), 0)
  eq('1.06 默认 canMove = true', E.canMove(st), true)
  eq('1.07 默认可以吃垃圾', E.canReceiveGarbage(st), true)
  eq('1.08 默认不接管', E.canTakeOver(st), false)
  eq('1.09 stackTop(空盘) = nil', E.stackTop(st.board), nil)
  eq('1.10 colHeight(空盘) = 0', E.colHeight(st.board, 1), 0)
  local col, h = E.emptyCol(st.board)
  eq('1.11 emptyCol(空盘) = 1', col, 1)
  eq('1.12 emptyCol 的列高 = 0', h, 0)

  -- gates 惰性补齐：允许直接包 main 的 g（没有 gates 区）
  local g = { board = E.newBoard() }
  local gates = E.gates(g)
  eq('1.13 E.gates 能包住裸 state', type(gates), 'table')
  eq('1.14 补齐后 gravityMult = 1', gates.gravityMult, 1)
  eq('1.15 补齐不覆盖已有值', (function()
    local g2 = { board = E.newBoard(), gates = { gravityMult = 1.5 } }
    return E.gates(g2).gravityMult
  end)(), 1.5)

  -- 碰撞口径：左右越界/底部越界算碰撞，顶部越界不算
  local cells = O(1, 1).cells
  eq('1.16 左越界算碰撞', E.collides(st.board, cells, 0, 1), true)
  eq('1.17 右越界算碰撞', E.collides(st.board, cells, 10, 1), true)
  eq('1.18 底部越界算碰撞', E.collides(st.board, cells, 1, 20), true)
  eq('1.19 顶部越界不算碰撞', E.collides(st.board, cells, 1, 0), false)
  eq('1.20 盘内不碰撞', E.collides(st.board, cells, 3, 3), false)

  local st2 = E.newState{}
  fillRect(st2, 20, 20, 1, 10)
  eq('1.21 dropRows 落到第 19 行上方', E.dropRows(st2.board, cells, 1, 1), 17)
  eq('1.22 landY = 起始 y + dropRows', E.landY(st2.board, cells, 1, 1), 18)
  eq('1.23 stackTop 找到最高占用行', E.stackTop(st2.board), 20)
  eq('1.24 colHeight 数该列占用', E.colHeight(st2.board, 1), 1)

  -- 与 core_board 逐值对拍（口径一致才允许接线互喂）
  if CB then
    local B = CB.new{ rows = 20, cols = 10 }
    local boards = { st.board, st2.board }
    local cases = { { 1, 1 }, { 3, 3 }, { 0, 1 }, { 10, 1 }, { 1, 20 }, { 5, 18 } }
    local allSame = true
    for bi = 1, #boards do
      for ci = 1, #cases do
        local px, py = cases[ci][1], cases[ci][2]
        if E.collides(boards[bi], cells, px, py) ~= B.collides(boards[bi], cells, px, py) then
          allSame = false
        end
        if E.dropRows(boards[bi], cells, px, py) ~= B.dropRows(boards[bi], cells, px, py) then
          allSame = false
        end
      end
    end
    ok('1.25 collides/dropRows 与 core_board 逐值相等（2 盘 × 6 位置 × 2 函数）', allSame)
  else
    skipped('1.25 collides/dropRows 与 core_board 对拍', 'core_board.lua 缺失')
  end
end

--==========================================================================
-- 组2 clearBottom：删盘底 n 行 ⇒ 上方下移、顶部补空 ⇒ 栈顶远离盘顶（有利）
--==========================================================================
do
  local st = E.newState{}
  fillRect(st, 17, 20, 1, 10)
  local before = snapshot(st.board)
  local ev, res = E.apply(st, { kind = 'clearBottom', rows = 1 })
  eq('2.01 返回 ok', res.ok, true)
  eq('2.02 rows = 1', res.rows, 1)
  eq('2.03 事件 kind = clearBottom', ev[1].kind, 'clearBottom')
  eq('2.04 栈顶下移一行（17→18）', E.stackTop(st.board), 18)
  eq('2.05 盘面高度减少一行', E.colHeight(st.board, 1), 3)
  eq('2.06 顶部第 1 行为空', st.board[1][1], 0)
  eq('2.07 底部行变成原来的第 19 行（满）', st.board[20][1], 1)
  eq('2.08 事件里的 cells = 被移除的非空格数', ev[1].cells, 10)

  local st2 = E.newState{}
  fillRect(st2, 17, 20, 1, 10)
  E.apply(st2, { kind = 'clearBottom', rows = 2 })
  eq('2.09 连清 2 行后栈顶 = 19', E.stackTop(st2.board), 19)
  eq('2.10 连清 2 行后高度 = 2', E.colHeight(st2.board, 1), 2)

  local st3 = E.newState{}          -- 空盘：清底不动内容
  E.apply(st3, { kind = 'clearBottom', rows = 2 })
  eq('2.11 空盘清底后仍为空', E.stackTop(st3.board), nil)
  eq('2.12 空盘清底不计 cells', select(2, E.apply(E.newState{}, { kind = 'clearBottom', rows = 1 })).cells, 0)

  local st4 = E.newState{}          -- 行数越界夹紧
  local _, r4 = E.apply(st4, { kind = 'clearBottom', rows = 999 })
  eq('2.13 rows 越界夹到 ROWS', r4.rows, 20)
  local _, r5 = E.apply(E.newState{}, { kind = 'clearBottom', rows = 0 })
  eq('2.14 rows=0 夹到 1', r5.rows, 1)

  -- gravityClear 是 clearBottom 的别名（少女单人语义）
  local st5, st6 = E.newState{}, E.newState{}
  fillRect(st5, 18, 20, 1, 10)
  fillRect(st6, 18, 20, 1, 10)
  E.apply(st5, { kind = 'gravityClear', rows = 1 })
  E.apply(st6, { kind = 'clearBottom', rows = 1 })
  ok('2.15 gravityClear 与 clearBottom 结果同形', sameBoard(st5.board, st6.board))
end

--==========================================================================
-- 组3 clearTop：删绝对盘顶 n 行 ⇒ 内容上移、底部补空 ⇒ **盘面被推高**（自伤）
--==========================================================================
do
  local st = E.newState{}
  fillRect(st, 17, 20, 1, 10)
  local ev, res = E.apply(st, { kind = 'clearTop', rows = 3 })
  eq('3.01 返回 ok', res.ok, true)
  eq('3.02 事件 kind = clearTop', ev[1].kind, 'clearTop')
  eq('3.03 栈顶被推高 3 行（17→14）', E.stackTop(st.board), 14)
  eq('3.04 格数不变（4）但位置更高 ⇒ 危险度上升', E.colHeight(st.board, 1), 4)
  eq('3.05 底部 3 行为空', (st.board[20][1] == 0 and st.board[19][1] == 0 and st.board[18][1] == 0), true)
  eq('3.06 盘顶清掉的行本来就空 ⇒ cells = 0（什么都没清）', res.cells, 0)
  eq('3.07 result.pushed = n', res.pushed, 3)

  local st2 = E.newState{}
  fillRect(st2, 1, 2, 1, 10)         -- 盘顶真的被填满的情况
  local _, r2 = E.apply(st2, { kind = 'clearTop', rows = 2 })
  eq('3.08 盘顶有内容时 cells 计到', r2.cells, 20)
  eq('3.09 清完之后盘顶为空', E.stackTop(st2.board), nil)

  local _, r3 = E.apply(E.newState{}, { kind = 'clearTop', rows = 999 })
  eq('3.10 rows 越界夹到 ROWS', r3.rows, 20)
end

--==========================================================================
-- 组4 clearStackTop：**新语义**，把「栈顶 n 行」清空且不位移 ⇒ 修冰莲自伤
--==========================================================================
do
  local st = E.newState{}
  fillRect(st, 17, 20, 1, 10)
  local ev, res = E.apply(st, { kind = 'clearStackTop', rows = 3 })
  eq('4.01 返回 ok', res.ok, true)
  eq('4.02 fromRow = 原栈顶', res.fromRow, 17)
  eq('4.03 toRow = 栈顶往下 n-1', res.toRow, 19)
  eq('4.04 清掉 3 行 × 10 列 = 30 格', res.cells, 30)
  eq('4.05 剩下的栈顶落到最底行', E.stackTop(st.board), 20)
  eq('4.06 盘面高度降到 1', E.colHeight(st.board, 1), 1)
  eq('4.07 事件带区间', ev[1].fromRow, 17)

  -- 同一盘面：clearTop 让盘面变高 3 行，clearStackTop 让它变矮 3 行
  local a, b = E.newState{}, E.newState{}
  fillRect(a, 17, 20, 1, 10)
  fillRect(b, 17, 20, 1, 10)
  E.apply(a, { kind = 'clearTop', rows = 3 })
  E.apply(b, { kind = 'clearStackTop', rows = 3 })
  local ha = E.stackTop(a.board) or 21
  local hb = E.stackTop(b.board) or 21
  ok('4.08 自伤证据：clearTop 栈顶更高（17→14），clearStackTop 更低（17→20）', ha < hb,
    'clearTop_top=' .. tostring(ha) .. ' clearStackTop_top=' .. tostring(hb))

  local st2 = E.newState{}                 -- 空盘 → empty
  local _, r2 = E.apply(st2, { kind = 'clearStackTop', rows = 2 })
  eq('4.09 空盘返回 ok=false', r2.ok, false)
  eq('4.10 空盘 reason = empty', r2.reason, 'empty')

  local st3 = E.newState{}
  fillRect(st3, 20, 20, 1, 10)
  local _, r3 = E.apply(st3, { kind = 'clearStackTop', rows = 5 })
  eq('4.11 rows 超过栈高时夹到盘底', r3.toRow, 20)
  eq('4.12 清完只剩空盘', E.stackTop(st3.board), nil)
end

--==========================================================================
-- 组5 clearColumn：从底往上清该列 n 个非空格（雷暴连斩）
--==========================================================================
do
  local st = E.newState{}
  fillRect(st, 17, 20, 3, 3)
  fillRect(st, 20, 20, 4, 4)
  local ev, res = E.apply(st, { kind = 'clearColumn', col = 3, rows = 2 })
  eq('5.01 ok', res.ok, true)
  eq('5.02 清掉 2 格', res.cells, 2)
  eq('5.03 事件带列号', ev[1].col, 3)
  eq('5.04 最底两格被清', (st.board[20][3] == 0 and st.board[19][3] == 0), true)
  eq('5.05 上面的格子还在', (st.board[18][3] == 1 and st.board[17][3] == 1), true)
  eq('5.06 别的列不受影响', st.board[20][4], 1)

  local st2 = E.newState{}
  fillRect(st2, 20, 20, 3, 3)
  local _, r2 = E.apply(st2, { kind = 'clearColumn', col = 3, rows = 5 })
  eq('5.07 该列不足 n 格时只清实际格数', r2.cells, 1)
  local _, r3 = E.apply(E.newState{}, { kind = 'clearColumn', col = 99, rows = 1 })
  eq('5.08 col 越界夹到 COLS', r3.col, 10)
end

--==========================================================================
-- 组6 addGarbage：底部垫带洞垃圾（= raiseGarbage），冻结期拒绝
--==========================================================================
do
  local st = E.newState{}
  fillRect(st, 18, 20, 1, 10)
  local ev, res = E.apply(st, { kind = 'addGarbage', rows = 1,
    holeOf = function(i) return 4 end, fill = 8 })
  eq('6.01 ok', res.ok, true)
  eq('6.02 洞位记录', res.holes[1], 4)
  eq('6.03 底部行是垃圾', st.board[20][1], 8)
  eq('6.04 洞位是空', st.board[20][4], 0)
  eq('6.05 顶行被挤掉一行（原第 18 行内容上移）', st.board[17][1], 1)
  eq('6.06 事件 kind = addGarbage', ev[1].kind, 'addGarbage')

  -- 两行 + 洞位表
  local st2 = E.newState{}
  local _, r2 = E.apply(st2, { kind = 'addGarbage', rows = 2, holeOf = { 2, 9 }, fill = 8 })
  eq('6.07 两行两个洞', (#r2.holes) .. ',' .. r2.holes[1] .. ',' .. r2.holes[2], '2,2,9')
  eq('6.08 倒数第二行洞在 2', st2.board[19][2], 0)
  eq('6.09 底行洞在 9', st2.board[20][9], 0)

  -- 缺 holeOf：不猜，返回 no-hole 且不改盘
  local st3 = E.newState{}
  local before = snapshot(st3.board)
  local _, r3 = E.apply(st3, { kind = 'addGarbage', rows = 1 })
  eq('6.10 缺 holeOf → ok=false', r3.ok, false)
  eq('6.11 缺 holeOf → reason=no-hole', r3.reason, 'no-hole')
  ok('6.12 缺 holeOf 时盘面不变', sameBoard(before, st3.board))

  -- 冻结期：垃圾被拒绝（读 freezeRows/freezeLeft 门禁）
  local st4 = E.newState{}
  E.apply(st4, { kind = 'freeze', rows = 3, sec = 3, role = 'ganyu' })
  local blocked = snapshot(st4.board)
  local evb, rb = E.apply(st4, { kind = 'addGarbage', rows = 2, holeOf = { 1, 1 } })
  eq('6.13 冻结期 garbage 被拒（事件 garbageBlocked）', evb[1].kind, 'garbageBlocked')
  eq('6.14 冻结期 blockedBy = freeze', rb.blockedBy, 'freeze')
  ok('6.15 冻结期盘面不变', sameBoard(blocked, st4.board))

  -- 被顶到的当前块上抬
  local st5 = E.newState{}
  fillRect(st5, 19, 20, 1, 10)
  st5.piece = oPiece(1, 17)
  local _, r5 = E.apply(st5, { kind = 'addGarbage', rows = 1, holeOf = { 10 }, fill = 8 })
  eq('6.16 块被顶到后上抬', r5.pushed, 1)
  eq('6.17 上抬后 y 减 1', st5.piece.y, 16)

  if CB then
    local B = CB.new{ rows = 20, cols = 10 }
    local mine, theirs = E.newState{}, { board = B.newBoard() }
    fillRect(mine, 19, 20, 1, 10)
    fillRect(theirs, 19, 20, 1, 10)
    E.apply(mine, { kind = 'addGarbage', rows = 3, holeOf = { 1, 5, 9 }, fill = 8 })
    B.addGarbage(theirs.board, 3, { 1, 5, 9 }, 8)
    ok('6.18 与 core_board.addGarbage 逐值相等（3 行带洞）', sameBoard(mine.board, theirs.board))
  else
    skipped('6.18 与 core_board.addGarbage 对拍', 'core_board.lua 缺失')
  end
end

--==========================================================================
-- 组7 freeze 门禁：断链①② 的「读侧」——gravityMult / freezeRows 谁读
--==========================================================================
do
  local st = E.newState{ role = 'ganyu' }
  local ev, res = E.apply(st, { kind = 'freeze', rows = 4, sec = 3, role = 'ganyu' })
  eq('7.01 ok', res.ok, true)
  eq('7.02 freezeRows = 4', E.freezeRows(st), 4)
  eq('7.03 事件带 rows', ev[1].rows, 4)
  eq('7.04 事件带 sec', ev[1].sec, 3)

  -- 断链①：gravityMult 现在有写方（旧实现只读 SK.gravityMult，全仓 0 写）
  local want = (NUM and NUM.GANYU and NUM.GANYU.FIELD_GRAVITY) or 1
  eq('7.05 冻结写入 gravityMult = NUM.GANYU.FIELD_GRAVITY', E.gravityMult(st), want)
  eq('7.06 冻结期内 canReceiveGarbage = false', E.canReceiveGarbage(st), true and false or false)
  eq('7.07 gates.garbageBlocked = true', E.gates(st).garbageBlocked, true)

  -- 非甘雨角色不减速（保守 1）
  local st2 = E.newState{ role = 'keqing' }
  E.apply(st2, { kind = 'freeze', rows = 2, sec = 2, role = 'keqing' })
  eq('7.08 非甘雨冻结不改重力', E.gravityMult(st2), 1)
  eq('7.09 但冻结行数照写', E.freezeRows(st2), 2)

  -- 显式给 gravityMult 时优先（由 core_skills.params 算出来更细的值）
  local st3 = E.newState{}
  E.apply(st3, { kind = 'freeze', rows = 1, sec = 1, gravityMult = 1.35 })
  eq('7.10 effect.gravityMult 优先', E.gravityMult(st3), 1.35)

  -- 断链②的读侧另一半：到期自动回位（tick）
  local evt = E.tick(st, 1.5)
  eq('7.11 未到期时不发事件', #evt, 0)
  eq('7.12 未到期 gravityMult 仍生效', E.gravityMult(st), want)
  local evt2 = E.tick(st, 2)
  eq('7.13 到期发 freezeEnd', evt2[1] and evt2[1].kind, 'freezeEnd')
  eq('7.14 到期 gravityMult 回到 1', E.gravityMult(st), 1)
  eq('7.15 到期 freezeRows 归零', E.freezeRows(st), 0)
  eq('7.16 到期恢复吃垃圾', E.canReceiveGarbage(st), true)
end

--==========================================================================
-- 组8 blink：瞬移到列 + 落底 + lockSec 禁横移门禁（lead 点名的语义）
--==========================================================================
do
  local st = E.newState{}
  st.piece = oPiece(1, 1)
  local ev, res = E.apply(st, { kind = 'blink', col = 5 })
  eq('8.01 ok', res.ok, true)
  eq('8.02 块瞬移到目标列', st.piece.x, 5)
  eq('8.03 落底：landY = 19（2×2 块底行 y+1 落到第 20 行）', res.landY, 19)
  eq('8.04 piece.y 同步', st.piece.y, 19)
  eq('8.05 dropped = landY - fromY', res.dropped, 18)
  eq('8.06 事件 kind = blink', ev[#ev].kind, 'blink')
  eq('8.07 不写盘（board 仍全空）', E.stackTop(st.board), nil)
  eq('8.08 不置 piece = nil（锁定交给调用方）', type(st.piece), 'table')

  -- 空盘上落底：不越界
  eq('8.09 落底后块的最底行恰好是 ROWS', st.piece.y + 2 - 1, 20)

  -- col 越界夹紧
  local st2 = E.newState{}
  st2.piece = oPiece(1, 1)
  local _, r2 = E.apply(st2, { kind = 'blink', col = 99 })
  eq('8.10 col 越界先夹到 COLS(10)，但 2 宽块右侧越界 ⇒ snap 到 9', r2.col, 9)
  eq('8.11 记录 clamped', r2.clamped, true)
  local _, r3 = E.apply(st, { kind = 'blink', col = 0 })
  eq('8.12 col=0 夹到 1', r3.col, 1)

  -- 目标列被堆到出生高度 ⇒ snap 到最近可用列
  local st3 = E.newState{}
  fillRect(st3, 1, 20, 5, 5)          -- 第 5 列整列填满
  st3.piece = oPiece(1, 1)
  local _, r4 = E.apply(st3, { kind = 'blink', col = 5 })
  eq('8.13 目标列放不下时 snap', r4.snapped, true)
  eq('8.14 snap 到最近的可用列（4 会压到已填的 5 列 ⇒ 取 6）', r4.col, 6)
  eq('8.15 记录原目标列', r4.wantCol, 5)

  -- 所有列都放不下 ⇒ blocked，盘面与块都不动
  local st4 = E.newState{}
  fillRect(st4, 1, 20, 1, 10)
  st4.piece = oPiece(1, 1)
  local _, r5 = E.apply(st4, { kind = 'blink', col = 3 })
  eq('8.16 全盘塞满 → ok=false', r5.ok, false)
  eq('8.17 全盘塞满 → reason=blocked', r5.reason, 'blocked')
  eq('8.18 失败时块不动', st4.piece.x, 1)

  -- 无 piece
  local _, r6 = E.apply(E.newState{}, { kind = 'blink', col = 3 })
  eq('8.19 无 piece → ok=false', r6.ok, false)
  eq('8.20 无 piece → reason=no-piece', r6.reason, 'no-piece')

  -- lockSec → gates.moveLockMs（**门禁值的产出点**）
  local st5 = E.newState{}
  st5.piece = oPiece(1, 1)
  local evl, r7 = E.apply(st5, { kind = 'blink', col = 6, lockSec = 0.15 })
  eq('8.21 lockSec 产出 moveLockMs = ceil(sec*1000)', E.gates(st5).moveLockMs, 150)
  eq('8.22 result 回带 moveLockMs', r7.moveLockMs, 150)
  eq('8.23 事件里有 moveLock', (function()
    for i = 1, #evl do if evl[i].kind == 'moveLock' then return true end end
    return false
  end)(), true)
  eq('8.24 禁横移期间 canMove = false', E.canMove(st5), false)
  E.tick(st5, 0.1)
  eq('8.25 0.1s 后仍在禁横移', E.canMove(st5), false)
  local evEnd = E.tick(st5, 0.1)
  eq('8.26 到期后 canMove = true', E.canMove(st5), true)
  eq('8.27 到期发 moveLockEnd', evEnd[1] and evEnd[1].kind, 'moveLockEnd')

  -- lockSec 缺省不写门禁
  local st6 = E.newState{}
  st6.piece = oPiece(1, 1)
  E.apply(st6, { kind = 'blink', col = 2 })
  eq('8.28 不带 lockSec 时 canMove 保持 true', E.canMove(st6), true)
end

--==========================================================================
-- 组9 blinkBest：选最空列再瞬移（同高取左，确定性）
--==========================================================================
do
  local st = E.newState{}
  fillRect(st, 1, 3, 1, 4)           -- 1..4 列各有 3 行
  st.piece = oPiece(1, 1)
  local _, res = E.apply(st, { kind = 'blinkBest' })
  eq('9.01 选到最空列（5）', res.bestCol, 5)
  eq('9.02 块被瞬移到该列', st.piece.x, 5)
  eq('9.03 result.kind = blinkBest', res.kind, 'blinkBest')

  local st2 = E.newState{}            -- 空盘：所有列一样高 → 取最左
  st2.piece = oPiece(1, 1)
  local _, r2 = E.apply(st2, { kind = 'blinkBest' })
  eq('9.04 空盘取最左列 1', r2.bestCol, 1)

  local st3 = E.newState{}
  fillRect(st3, 20, 20, 1, 10)        -- 每列一样高（1）→ 同高取左
  st3.piece = oPiece(1, 1)
  local _, r3 = E.apply(st3, { kind = 'blinkBest' })
  eq('9.05 同高取左', r3.bestCol, 1)
  eq('9.06 落底位置 = 18（20 行盘，第 20 行已占）', r3.landY, 18)
end

--==========================================================================
-- 组10 markBlink：断链③——雷楔二段真的瞬移 + 清列（旧实现只有一行 print）
--==========================================================================
do
  local st = E.newState{}
  st.piece = oPiece(1, 1)
  fillRect(st, 18, 20, 3, 3)          -- 雷楔列底部 3 格
  local ev, res = E.apply(st, { kind = 'markBlink', col = 3, rows = 2 })
  eq('10.01 ok', res.ok, true)
  eq('10.02 块瞬移到雷楔列', st.piece.x, 3)
  eq('10.03 清列记录列号', res.clearedCol, 3)
  eq('10.04 清掉 2 格', res.clearedCells, 2)
  eq('10.05 该列最底两格变空', (st.board[20][3] == 0 and st.board[19][3] == 0), true)
  eq('10.06 上面那格还在', st.board[18][3], 1)
  eq('10.07 事件序列 = blink + clearColumn', (ev[1].kind .. '+' .. ev[#ev].kind), 'blink+clearColumn')
  eq('10.08 kind = markBlink', res.kind, 'markBlink')

  local _, r2 = E.apply(E.newState{}, { kind = 'markBlink', col = 3, rows = 2 })
  eq('10.09 无 piece 时失败', r2.reason, 'no-piece')

  -- 雷楔列被清空之后仍能瞬移（列底空了更宽松）
  local st3 = E.newState{}
  st3.piece = oPiece(1, 1)
  local _, r3 = E.apply(st3, { kind = 'markBlink', col = 7, rows = 2 })
  eq('10.10 空列上引爆也能落底', r3.landY, 19)
  eq('10.11 空列上没有可清的格', r3.clearedCells, 0)
end

--==========================================================================
-- 组11 applyTo：按 effect.target 选盘（**冰莲串盘/冻结双源那类问题的堵法**）
--==========================================================================
do
  local mine, opp = E.newState{ role = 'keqing' }, E.newState{ role = 'ganyu' }
  fillRect(mine, 20, 20, 1, 10)
  fillRect(opp, 20, 20, 1, 10)
  local ev, res = E.applyTo({ self = mine, opp = opp },
    { kind = 'addGarbage', rows = 1, holeOf = { 3 }, fill = 8, target = 'opp' })
  eq('11.01 target=opp 时施加到对手盘', res.target, 'opp')
  eq('11.02 对手盘多了垃圾行', opp.board[20][1], 8)
  eq('11.03 自己盘不受影响', mine.board[20][1], 1)

  local _, r2 = E.applyTo({ self = mine, opp = opp },
    { kind = 'freeze', rows = 2, sec = 2, role = 'ganyu', target = 'self' })
  eq('11.04 target=self 时施加到自己盘', r2.target, 'self')
  eq('11.05 自己盘冻结', E.freezeRows(mine), 2)

  -- 单人局：没有 opp 时把「推给对手」降级成清自己盘底
  local solo = E.newState{}
  fillRect(solo, 18, 20, 1, 10)
  local _, r3 = E.applyTo({ self = solo, opp = nil },
    { kind = 'addGarbage', rows = 1, holeOf = { 1 }, target = 'opp' })
  eq('11.06 单人局降级标记', r3.degraded, 'solo')
  eq('11.07 降级后按 clearBottom 执行', r3.kind, 'clearBottom')
  eq('11.08 盘面高度减少 1（清底生效）', E.colHeight(solo.board, 1), 2)

  -- 显式 degrade=false 时不降级
  local solo2 = E.newState{}
  local before = snapshot(solo2.board)
  local _, r4 = E.applyTo({ self = solo2, opp = nil },
    { kind = 'addGarbage', rows = 1, holeOf = { 1 }, target = 'opp', degrade = false })
  eq('11.09 degrade=false → no-target', r4.reason, 'no-target')
  ok('11.10 degrade=false 时盘面不变', sameBoard(before, solo2.board))

  -- applyAll：一次把核心 effects 列表铺下去
  local st = E.newState{}
  fillRect(st, 18, 20, 1, 10)
  local evs, rs = E.applyAll(st, {
    { kind = 'clearBottom', rows = 1 },
    { kind = 'freeze', rows = 1, sec = 1, role = 'ganyu' },
  })
  eq('11.11 applyAll 合并事件数', #evs, 2)
  eq('11.12 applyAll 结果数', #rs, 2)
  eq('11.13 两个 effect 都施加了', E.freezeRows(st), 1)
end

--==========================================================================
-- 组12 holdCut / takeOver：断链⑤（削锁定延迟）与接管门禁
--==========================================================================
do
  local opp = E.newState{}
  local ev, res = E.apply(opp, { kind = 'holdCut', ms = 9, sec = 5 })
  eq('12.01 ok', res.ok, true)
  eq('12.02 lockDelayCut 写入', E.lockDelayCut(opp), 9)
  eq('12.03 事件带 ms', ev[1].ms, 9)
  eq('12.04 剩余秒写入', E.gates(opp).lockDelayCutLeft, 5)
  local evt = E.tick(opp, 5.1)
  eq('12.05 到期清 0', E.lockDelayCut(opp), 0)
  eq('12.06 到期发 holdCutEnd', evt[1] and evt[1].kind, 'holdCutEnd')

  local st = E.newState{}
  E.apply(st, { kind = 'takeOver', tier = 2, sec = 3 })
  eq('12.07 接管期 canTakeOver = true', E.canTakeOver(st), true)
  eq('12.08 档位写入', E.gates(st).takeOverTier, 2)
  local evt2 = E.tick(st, 3.1)
  eq('12.09 到期 canTakeOver = false', E.canTakeOver(st), false)
  eq('12.10 到期发 takeOverEnd', evt2[1] and evt2[1].kind, 'takeOverEnd')
end

--==========================================================================
-- 组13 确定性：同输入两次结果完全一致（无随机、无时间、无全局）
--==========================================================================
do
  local function run()
    local st = E.newState{}
    fillRect(st, 16, 20, 1, 10)
    st.piece = oPiece(2, 1)
    E.apply(st, { kind = 'clearBottom', rows = 2 })
    E.apply(st, { kind = 'addGarbage', rows = 2, holeOf = { 3, 7 }, fill = 8 })
    E.apply(st, { kind = 'blink', col = 4, lockSec = 0.2 })
    E.apply(st, { kind = 'clearStackTop', rows = 1 })
    return snapshot(st.board)
  end
  ok('13.01 同一序列两次运行得到相同盘面', sameBoard(run(), run()))

  local st = E.newState{}
  st.piece = oPiece(1, 1)
  local _, a = E.apply(st, { kind = 'blink', col = 7, lockSec = 0.12 })
  local st2 = E.newState{}
  st2.piece = oPiece(1, 1)
  local _, b = E.apply(st2, { kind = 'blink', col = 7, lockSec = 0.12 })
  eq('13.02 blink 结果可复现（landY）', a.landY, b.landY)
  eq('13.03 blink 门禁毫秒可复现', a.moveLockMs, b.moveLockMs)

  local st3 = E.newState{}
  local _, c = E.apply(st3, { kind = 'blinkBest' })
  eq('13.04 空盘 blinkBest 无 piece → 失败', c.ok, false)

  eq('13.05 normalize 接受旧 kebab 写法', CE.normalize('clear-bottom'), 'clearBottom')
  eq('13.06 normalize 拒绝未知词', CE.normalize('nope'), nil)
end

--==========================================================================
-- 组14 与旧实现对照：逐字复刻旧 algorithm 在新模块上对拍 + 列出差异
--==========================================================================
do
  -- 旧 dispatchEffect 的两段局部函数（逐字复刻 main.lua 的 shiftDown/shiftUp，
  -- 注意旧代码的命名与真实方向相反：shiftDown 实际让内容**上移**）
  local ROWS, COLS = 20, 10
  local function oldClearTop(board, n)     -- 旧 kind='clear-top' → shiftDown
    for _ = 1, n do
      for r = 1, ROWS - 1 do board[r] = board[r + 1] end
      board[ROWS] = {}
      for c = 1, COLS do board[ROWS][c] = 0 end
    end
  end
  local function oldClearBottom(board, n)  -- 旧 kind='clear-bottom' → shiftUp
    for _ = 1, n do
      for r = ROWS, 2, -1 do board[r] = board[r - 1] end
      board[1] = {}
      for c = 1, COLS do board[1][c] = 0 end
    end
  end
  local function oldClearCol(board, col, n)
    local hit = 0
    for r = ROWS, 1, -1 do
      if board[r] and board[r][col] ~= 0 and hit < n then board[r][col] = 0; hit = hit + 1 end
    end
    return hit
  end

  local function freshBoard()
    local st = E.newState{}
    fillRect(st, 16, 20, 1, 10)
    return st
  end

  -- ① 'clear-top'：旧 shiftDown ≡ 新 clearTop（名字与实现都对，但对玩家自伤）
  local a, b = freshBoard(), freshBoard()
  oldClearTop(a.board, 3)
  E.apply(b, { kind = 'clearTop', rows = 3 })
  ok('14.01 旧 clear-top ≡ 新 clearTop（逐值相等）', sameBoard(a.board, b.board))

  -- ② 'clear-bottom'：旧 shiftUp ≡ 新 clearBottom
  local c, d = freshBoard(), freshBoard()
  oldClearBottom(c.board, 2)
  E.apply(d, { kind = 'clearBottom', rows = 2 })
  ok('14.02 旧 clear-bottom ≡ 新 clearBottom（逐值相等）', sameBoard(c.board, d.board))

  -- ③ 'clear-col' ≡ clearColumn
  local e, f = freshBoard(), freshBoard()
  local oh = oldClearCol(e.board, 4, 2)
  local _, nr = E.apply(f, { kind = 'clearColumn', col = 4, rows = 2 })
  ok('14.03 旧 clear-col ≡ 新 clearColumn（盘面 + 命中数）',
    sameBoard(e.board, f.board) and oh == nr.cells)

  -- ④ 差异：冰莲（旧用 clear-top）把盘面推高，clearStackTop 才修得动
  local g = freshBoard()
  local topBefore = E.stackTop(g.board) or 21
  oldClearTop(g.board, 3)                      -- 旧实现（= 冰莲绽放走的路径）
  local topOld = E.stackTop(g.board) or 21
  local h = freshBoard()
  E.apply(h, { kind = 'clearStackTop', rows = 3 })
  local topNew = E.stackTop(h.board) or 21
  ok('14.04 差异证据：旧 clear-top 让栈顶更高（自伤），clearStackTop 让栈顶更低', topOld < topBefore and topNew > topBefore,
    'before=' .. topBefore .. ' old=' .. topOld .. ' new=' .. topNew)

  -- ⑤ 差异：旧 blink 自己 doLock（写盘 + 置 nil），新 blink 只挪块
  local st5 = E.newState{}
  st5.piece = oPiece(1, 1)
  E.apply(st5, { kind = 'blink', col = 3 })
  eq('14.05 旧 blink 会写盘；新 blink 不写盘（board 仍空）', E.stackTop(st5.board), nil)
  eq('14.06 旧 blink 会清 piece；新 blink 保留 piece', type(st5.piece), 'table')

  -- ⑥ 差异：旧 mark-blink 只有 print；新实现真的清列
  local st6 = E.newState{}
  st6.piece = oPiece(1, 1)
  fillRect(st6, 19, 20, 2, 2)
  local _, r6 = E.apply(st6, { kind = 'markBlink', col = 2, rows = 2 })
  eq('14.07 旧 mark-blink 无机制；新实现清掉 2 格', r6.clearedCells, 2)

  -- ⑦ 差异：旧冻结门禁写死在 raiseGarbage 且 target==G[1]；新门禁随盘
  local p1, p2 = E.newState{}, E.newState{}
  E.apply(p1, { kind = 'freeze', rows = 2, sec = 2, role = 'ganyu' })
  eq('14.08 新门禁是每盘一份（P1 冻结，P2 不受影响）',
    (E.canReceiveGarbage(p1) == false) and (E.canReceiveGarbage(p2) == true), true)

  -- ⑧ 差异：旧 garbage-push 的模式降级散在调用点；新实现收进 applyTo.degrade
  local solo = E.newState{}
  fillRect(solo, 20, 20, 1, 10)
  local _, r8 = E.applyTo({ self = solo, opp = nil },
    { kind = 'addGarbage', rows = 1, holeOf = { 1 }, target = 'opp' })
  eq('14.09 新实现在施加层做降级（旧在调用点判 MODE）', r8.degraded, 'solo')

  -- ⑨ 未知 kind：旧实现静默落到 'skill effect todo=' 分支，新实现给明确 reason
  local _, r9 = E.apply(E.newState{}, { kind = 'nope' })
  eq('14.10 未知 kind → unknown-kind（不静默）', r9.reason, 'unknown-kind')
  eq('14.11 坏 state → bad-state', select(2, E.apply(nil, { kind = 'clearTop' })).reason, 'bad-state')
  eq('14.12 坏 effect → bad-state', select(2, E.apply(E.newState{}, nil)).reason, 'bad-state')

  -- ⑩ 旧实现不给清行计数，新实现返回 cells（上层可据此加分/加经验）
  local st10 = E.newState{}
  fillRect(st10, 18, 20, 1, 10)
  local _, r10 = E.apply(st10, { kind = 'clearBottom', rows = 2 })
  eq('14.13 新实现返回被清格数（20）', r10.cells, 20)
  eq('14.14 clearStackTop 返回区间（供特效做逐行碎冰）',
    (function()
      local s = E.newState{}
      fillRect(s, 18, 20, 1, 10)
      local _, rr = E.apply(s, { kind = 'clearStackTop', rows = 2 })
      return rr.fromRow .. '-' .. rr.toRow
    end)(), '18-19')
end

--==========================================================================
-- 组15 mark：雷楔「还在不在」单源（gates.markCol/markLeft）
--==========================================================================
do
  local st = E.newState{ role = 'keqing' }
  local ev, res = E.apply(st, { kind = 'mark', col = 4, sec = 5 })
  eq('15.01 ok', res.ok, true)
  eq('15.02 gates.markCol 写入', E.gates(st).markCol, 4)
  eq('15.03 gates.markLeft 写入', E.gates(st).markLeft, 5)
  eq('15.04 事件 kind = mark', ev[1].kind, 'mark')
  eq('15.05 E.mark 返回单源视图', (E.mark(st).col .. '/' .. E.mark(st).left), '4/5')
  eq('15.06 E.hasMark = true', E.hasMark(st), true)

  eq('15.07 col 越界夹到 COLS', select(2, E.apply(E.newState{}, { kind = 'mark', col = 99, sec = 1 })).col, 10)
  eq('15.08 col=0 明确拒绝（不静默置空）', select(2, E.apply(E.newState{}, { kind = 'mark', col = 0 })).ok, false)

  -- 二次 mark = 覆盖（单源，不留两份）
  E.apply(st, { kind = 'mark', col = 7, sec = 2 })
  eq('15.09 二次 mark 覆盖旧值', E.mark(st).col, 7)

  -- tick 倒计时与到期
  E.tick(st, 1)
  eq('15.10 tick 1s 后剩 1s', E.mark(st).left, 1)
  local evt = E.tick(st, 1)
  eq('15.11 到期后 E.mark = nil', E.mark(st), nil)
  eq('15.12 到期发 markEnd', evt[1] and evt[1].kind, 'markEnd')
  eq('15.13 到期后 hasMark = false', E.hasMark(st), false)

  -- 消费方：markBlink 引爆即清标记
  local st2 = E.newState{ role = 'keqing' }
  st2.piece = oPiece(1, 1)
  E.apply(st2, { kind = 'mark', col = 3, sec = 5 })
  local ev2, r2 = E.apply(st2, { kind = 'markBlink', col = 3, rows = 2 })
  eq('15.14 引爆后标记被消费', r2.markConsumed, true)
  eq('15.15 标记列记录在 result', r2.markCol, 3)
  eq('15.16 引爆后 E.mark = nil（不会留第二份）', E.mark(st2), nil)
  eq('15.17 事件里有 markConsumed', (function()
    for i = 1, #ev2 do if ev2[i].kind == 'markConsumed' then return true end end
    return false
  end)(), true)
  eq('15.18 引爆仍然清列（机制没被标记逻辑挤掉）', r2.clearedCells, 0)

  -- keepMark = true 时保留（给「引爆不消耗」的另一种设计留口子）
  local st3 = E.newState{}
  st3.piece = oPiece(1, 1)
  E.apply(st3, { kind = 'mark', col = 2, sec = 3 })
  local _, r3 = E.apply(st3, { kind = 'markBlink', col = 2, rows = 1, keepMark = true })
  eq('15.19 keepMark=true 时不消费', r3.markConsumed, nil)
  eq('15.20 keepMark 时标记仍在', E.hasMark(st3), true)
end

--==========================================================================
-- 组16 canMove 消费契约：门禁值只有在**被问**时才成立
--==========================================================================
do
  local st = E.newState{}
  eq('16.01 默认 canMove = true', E.canMove(st), true)

  -- 契约原文：moveLockMs > 0 ⇒ canMove == false
  E.gates(st).moveLockMs = 1
  eq('16.02 moveLockMs>0（1ms）⇒ canMove==false', E.canMove(st), false)
  E.gates(st).moveLockMs = 0
  eq('16.03 moveLockMs=0 ⇒ canMove==true', E.canMove(st), true)

  local st2 = E.newState{}
  st2.piece = oPiece(1, 1)
  E.apply(st2, { kind = 'blink', col = 5, lockSec = 0.2 })
  eq('16.04 blink{lockSec} 后 canMove==false', E.canMove(st2), false)
  eq('16.05 门禁毫秒 = 200', E.gates(st2).moveLockMs, 200)
  E.tick(st2, 0.1)
  eq('16.06 中途仍禁横移', E.canMove(st2), false)
  E.tick(st2, 0.15)
  eq('16.07 到期后 canMove==true', E.canMove(st2), true)

  -- 语义区分：holdCut 削的是**锁定延迟**，不是横移；freeze 管的是吃垃圾
  local st3 = E.newState{}
  E.apply(st3, { kind = 'holdCut', ms = 9, sec = 3 })
  eq('16.08 holdCut 不影响 canMove（它改锁延迟）', E.canMove(st3), true)
  eq('16.09 holdCut 有自己的读侧', E.lockDelayCut(st3), 9)
  local st4 = E.newState{}
  E.apply(st4, { kind = 'freeze', rows = 2, sec = 2, role = 'ganyu' })
  eq('16.10 freeze 不影响 canMove（它管吃垃圾）', E.canMove(st4), true)
  eq('16.11 freeze 拦的是 canReceiveGarbage', E.canReceiveGarbage(st4), false)
end

--==========================================================================
-- 组17 wrong-owner：opt-in 的盘归属校验（默认关，调用约定不变）
--==========================================================================
do
  local st = E.newState{ role = 'keqing' }
  local eff = { kind = 'clearBottom', rows = 1, role = 'ganyu', target = 'self' }

  -- 默认关：角色不符也照做
  local _, r1 = E.applyTo({ self = st }, eff)
  eq('17.01 默认不校验（角色不符照做）', r1.ok, true)

  -- strictOwner=true：角色不符 ⇒ wrong-owner
  local st2 = E.newState{ role = 'keqing' }
  fillRect(st2, 20, 20, 1, 10)
  local before = snapshot(st2.board)
  local _, r2 = E.applyTo({ self = st2 }, eff, { strictOwner = true })
  eq('17.02 strictOwner 下角色不符 ⇒ ok=false', r2.ok, false)
  eq('17.03 reason = wrong-owner', r2.reason, 'wrong-owner')
  ok('17.04 被拒时盘面不变', sameBoard(before, st2.board))
  eq('17.05 附带双方角色便于排查', r2.selfRole .. '/' .. r2.effectRole, 'keqing/ganyu')

  -- 角色一致 ⇒ 正常施加
  local st3 = E.newState{ role = 'ganyu' }
  fillRect(st3, 20, 20, 1, 10)
  local _, r3 = E.applyTo({ self = st3 }, { kind = 'clearBottom', rows = 1, role = 'ganyu' },
    { strictOwner = true })
  eq('17.06 角色一致时正常施加', r3.ok, true)
  eq('17.07 盘面确实被清了一行', E.colHeight(st3.board, 1), 0)

  -- 信息缺失不猜：任一侧没有 role 就不校验
  local noRole = E.newState{}
  eq('17.08 self 无 role 时不报错', select(2, E.applyTo({ self = noRole },
    { kind = 'clearBottom', rows = 1, role = 'ganyu' }, { strictOwner = true })).ok, true)
  eq('17.09 effect 无 role 时不报错', select(2, E.applyTo({ self = E.newState{ role = 'keqing' } },
    { kind = 'clearBottom', rows = 1 }, { strictOwner = true })).ok, true)

  -- 串盘：self 与 opp 是同一张表
  local same = E.newState{ role = 'keqing' }
  eq('17.10 串盘（self==opp）⇒ wrong-owner',
    select(2, E.applyTo({ self = same, opp = same },
      { kind = 'addGarbage', rows = 1, holeOf = { 1 } }, { strictOwner = true })).reason, 'wrong-owner')
  eq('17.11 默认关时不拦串盘（保持旧约定）',
    select(2, E.applyTo({ self = same, opp = same },
      { kind = 'addGarbage', rows = 1, holeOf = { 1 } })).ok, true)
  eq('17.12 wrong-owner 在 REASON 词表里', CE.REASON.wrongOwner, 'wrong-owner')

  -- 校验不能影响正常路由
  local a, b = E.newState{ role = 'keqing' }, E.newState{ role = 'ganyu' }
  fillRect(a, 20, 20, 1, 10)
  fillRect(b, 20, 20, 1, 10)
  local _, r4 = E.applyTo({ self = a, opp = b },
    { kind = 'addGarbage', rows = 1, holeOf = { 2 }, fill = 8, role = 'keqing', target = 'opp' },
    { strictOwner = true })
  eq('17.13 strictOwner 下 target=opp 路由不变', r4.target, 'opp')
  eq('17.14 垃圾落在对手盘', b.board[20][1], 8)
end

--==========================================================================
print('')
print(string.format('== core_effects: %d/%d assertions passed, %d failed, %d skipped ==',
  pass, pass + fail, fail, skip))
if fail > 0 then
  print('FAILED:')
  for i = 1, #fails do print('  - ' .. fails[i]) end
  os.exit(1)
end
print('ALL GREEN ' .. pass .. '/' .. (pass + fail) .. ' assertions passed')
os.exit(0)
