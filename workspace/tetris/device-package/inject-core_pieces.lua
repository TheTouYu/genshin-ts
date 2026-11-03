--[[==========================================================================
 tetris/core_pieces.lua —— 方块形状表 + 出生位 + 旋转/踢墙纯函数（core_*：零引擎）
 ----------------------------------------------------------------------------
 形状**不复制第二份数据**：真源是 config.lua:190-198 的 SHAPES，通过
 M.new{ shapes = CFG.SHAPES, cols = CFG.COLS } 注入（ARCH.md §8「文案/数值只准一份」）。
 本模块只补 main.lua 里散落的那几段纯计算：
   spawn 的出生位   (COLS - n) // 2 + 1            —— main.lua:1095
   4 格深拷贝       （防旋转写坏 SHAPES 里的共享表）—— main.lua:1093-1094
   顺时针旋转       (r,c) → (c, n+1-r)             —— main.lua:1403-1407
 ----------------------------------------------------------------------------
 ⚠ 踢墙：**现网没有踢墙**。main.lua:1409-1427 的 rotate 只判「原位是否碰撞」，
   撞了就放弃（不试任何偏移）。所以本模块的默认踢墙表 NO_KICK = { {0,0} }：
   行为与现网逐字等价。要开踢墙就传 spec.kicks 或在调用点传 kicks 表——
   它是**能力**，不是默认行为；默认开踢墙会改掉玩家手感与全部旋转断言（tests/05）。
   同理，这里**不内置 SRS 偏移表**：本工程的方块只有「盒内坐标旋转」一种表示，
   没有 SRS 的旋转态编号，硬套 SRS 数值会是错的。
 ----------------------------------------------------------------------------
 接口：
   P = M.new{ shapes = SHAPES, cols = 10 }
   P.shape(name)                      -> 形状表（只读，不要写它）
   P.nOf(name) / P.colorOf(name)
   P.cellsOf(name)                    -> 4 个 {r,c} 的新表（深拷贝，等价 main.lua:1093-1094）
   P.spawnX(name)                     -> 出生列（等价 main.lua:1095）
   P.rotateCells(cells, n, dir)       -> 新 cells（dir=1 顺时针＝现网；dir=-1 逆时针）
   P.rotateWithKicks(cells, n, dir, x, y, collides, kicks)
                                      -> newCells, nx, ny（全失败返回 nil）
   P.NO_KICK                          -> { {0,0} }（现网语义：不踢墙）
=======================================================================]]

local M = {}

local NO_KICK = { { 0, 0 } }
M.NO_KICK = NO_KICK

function M.new(spec)
  spec = spec or {}
  local SHAPES = assert(spec.shapes, 'core_pieces: 需要 spec.shapes（config.SHAPES）')
  local COLS = assert(spec.cols, 'core_pieces: 需要 spec.cols（config.COLS）')

  local P = {}
  P.NO_KICK = NO_KICK                       -- 实例上也暴露一份（调用点传 kicks 时可直接给）

  function P.shape(name)
    local s = SHAPES[name]
    if not s then error('core_pieces: 未知方块 ' .. tostring(name), 2) end
    return s
  end

  function P.nOf(name) return P.shape(name).n end
  function P.colorOf(name) return P.shape(name).color end

  -- 深拷贝：main 里逐个 `{ s.cells[i][1], s.cells[i][2] }` 是为了让旋转后的
  -- cells 成为新表；若直接引用 SHAPES，rotate 会把共享的形状表写坏（全盘方块一起变）。
  function P.cellsOf(name)
    local s = P.shape(name)
    local out = {}
    for i = 1, 4 do out[i] = { s.cells[i][1], s.cells[i][2] } end
    return out
  end

  -- 出生位与 main.lua:1095 同式：x = (COLS - n) // 2 + 1
  function P.spawnX(name)
    return (COLS - P.nOf(name)) // 2 + 1
  end

  -- 顺时针：main.lua:1405 `{ cells[i][2], n + 1 - cells[i][1] }`（盒内 1-based）
  -- 逆时针：对称式 `{ n + 1 - cells[i][2], cells[i][1] }`（现网不用，给扩展留口）
  function P.rotateCells(cells, n, dir)
    local out = {}
    if dir == -1 then
      for i = 1, 4 do out[i] = { n + 1 - cells[i][2], cells[i][1] } end
    else
      for i = 1, 4 do out[i] = { cells[i][2], n + 1 - cells[i][1] } end
    end
    return out
  end

  -- 旋转 + 踢墙：按 kicks 表逐条试 (x+dx, y+dy)；第一条不碰撞的就采用。
  -- 缺省 NO_KICK ⇒ 只试原位 ⇒ 与 main.lua:1412 完全等价。
  function P.rotateWithKicks(cells, n, dir, x, y, collides, kicks)
    if type(collides) ~= 'function' then
      error('core_pieces: rotateWithKicks 需要 collides(cells,x,y) 函数', 2)
    end
    local nc = P.rotateCells(cells, n, dir)
    local tbl = kicks or NO_KICK
    for i = 1, #tbl do
      local nx = x + (tbl[i][1] or 0)
      local ny = y + (tbl[i][2] or 0)
      if not collides(nc, nx, ny) then return nc, nx, ny end
    end
    return nil
  end

  return P
end

return M
