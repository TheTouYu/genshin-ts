-- ============================================================================
-- 茶点三消：7×7 · 点击/拖拽两个相邻茶点交换 · 三连消除 · 连锁加分
-- 层序：背景 → 棋盘/槽/格线 → 茶点 → HUD 文字 → 选择/提示环 → 点击热区
-- ============================================================================
T = T or {}
T.game = nil

T.G = {
  N = 7, PITCH = 62, TILE = 54, BOARD_CY = -40,
  SCORE_PER = 60,
}

T.gpos = function(r, c)
  return (c - 4) * T.G.PITCH, T.G.BOARD_CY + (4 - r) * T.G.PITCH
end
T.gAdjacent = function(a, b)
  return a and b and (math.abs(a.r - b.r) + math.abs(a.c - b.c) == 1)
end
T.gKey = function(r, c) return r * 100 + c end

-- ---------- 茶点视觉 ----------
T.gMakeTile = function(r, c, typ, x, y, offsetY)
  local d = T.desserts[typ]
  local tile = { type = typ, parts = {}, x = x, y = y, r = r, c = c }
  local function add(dx, dy, w, h, shape, color, rot)
    local ctl = T.img(x + dx, y + dy + (offsetY or 0), w, h, shape, color, rot)
    if ctl then
      tile.parts[#tile.parts + 1] = { ctl = ctl, dx = dx, dy = dy, w = w, h = h, base = color }
    end
  end
  add(0, 0, T.G.TILE, T.G.TILE, 'circle', d.base)
  add(0, 0, 38, 38, 'circle', d.inner)
  if typ ~= 1 then
    add(0, 0, typ == 5 and 28 or 24, typ == 5 and 28 or 24, d.icon, d.deep)
  end
  add(-14, 14, 8, 8, 'circle', T.P.white)
  if typ == 1 then
    add(0, 0, 36, 9, 'rect', T.P.cream)
  elseif typ == 2 then
    add(10, 12, 10, 10, 'circle', T.P.roseDeep)
  elseif typ == 3 then
    add(-20, 0, 11, 16, 'triangle', d.deep, 24)
    add(20, 0, 11, 16, 'triangle', d.deep, -24)
  elseif typ == 4 then
    add(18, 0, 13, 13, 'ring', d.deep)
  else
    add(0, 0, 9, 9, 'circle', T.P.butterDeep)
  end
  return tile
end
T.gSetTile = function(tile, x, y)
  if not tile then return end
  tile.x, tile.y = x, y
  for _, p in ipairs(tile.parts) do
    T.tryCall(p.ctl, 'SetAnchoredPosition', (x + p.dx) * T.S, (y + p.dy) * T.S)
  end
end
T.gDestroyTile = function(tile)
  if not tile then return end
  for _, p in ipairs(tile.parts) do T.destroy(p.ctl) end
  tile.parts = {}
end
T.gTileColors = function(tile, color, k)
  for _, p in ipairs(tile.parts) do
    T.trySet(p.ctl, 'imageColor', color)
    if k then
      T.tryCall(p.ctl, 'SetSizeDelta', math.max(0.5, p.w * (1 - k)) * T.S, math.max(0.5, p.h * (1 - k)) * T.S)
    end
  end
end

-- ---------- 棋盘数据 ----------
T.gGenerate = function(g)
  local N = T.G.N
  for attempt = 1, 30 do
    for r = 1, N do
      g.board[r] = g.board[r] or {}
      for c = 1, N do
        local t, tries = 1, 0
        repeat
          t = T.rand(5); tries = tries + 1
        until tries > 24 or not (
          (c >= 3 and g.board[r][c - 1] == t and g.board[r][c - 2] == t) or
          (r >= 3 and g.board[r - 1][c] == t and g.board[r - 2][c] == t))
        g.board[r][c] = t
      end
    end
    if T.gFindMove(g) then return true end
  end
  return false
end
T.gFindMatches = function(g)
  local N = T.G.N
  local set, count = {}, 0
  for r = 1, N do
    local run = 1
    for c = 2, N + 1 do
      if c <= N and g.board[r][c] == g.board[r][c - 1] then run = run + 1
      else
        if run >= 3 then
          for k = c - run, c - 1 do local key = T.gKey(r, k); if not set[key] then set[key] = { r = r, c = k }; count = count + 1 end end
        end
        run = 1
      end
    end
  end
  for c = 1, N do
    local run = 1
    for r = 2, N + 1 do
      if r <= N and g.board[r][c] == g.board[r - 1][c] then run = run + 1
      else
        if run >= 3 then
          for k = r - run, r - 1 do local key = T.gKey(k, c); if not set[key] then set[key] = { r = k, c = c }; count = count + 1 end end
        end
        run = 1
      end
    end
  end
  return set, count
end
T.gFindMove = function(g)
  local N = T.G.N
  local function hasAt(r, c)
    local t = g.board[r][c]
    if c >= 3 and g.board[r][c - 1] == t and g.board[r][c - 2] == t then return true end
    if c <= N - 2 and g.board[r][c + 1] == t and g.board[r][c + 2] == t then return true end
    if c >= 2 and c <= N - 1 and g.board[r][c - 1] == t and g.board[r][c + 1] == t then return true end
    if r >= 3 and g.board[r - 1][c] == t and g.board[r - 2][c] == t then return true end
    if r <= N - 2 and g.board[r + 1][c] == t and g.board[r + 2][c] == t then return true end
    if r >= 2 and r <= N - 1 and g.board[r - 1][c] == t and g.board[r + 1][c] == t then return true end
    return false
  end
  for r = 1, N do
    for c = 1, N do
      if c < N then
        g.board[r][c], g.board[r][c + 1] = g.board[r][c + 1], g.board[r][c]
        local ok = hasAt(r, c) or hasAt(r, c + 1)
        g.board[r][c], g.board[r][c + 1] = g.board[r][c + 1], g.board[r][c]
        if ok then return { a = { r = r, c = c }, b = { r = r, c = c + 1 } } end
      end
      if r < N then
        g.board[r][c], g.board[r + 1][c] = g.board[r + 1][c], g.board[r][c]
        local ok = hasAt(r, c) or hasAt(r + 1, c)
        g.board[r][c], g.board[r + 1][c] = g.board[r + 1][c], g.board[r][c]
        if ok then return { a = { r = r, c = c }, b = { r = r + 1, c = c } } end
      end
    end
  end
  return nil
end
T.gPaintTile = function(tile, typ)
  local d = T.desserts[typ]
  tile.type = typ
  if #tile.parts >= 4 then
    T.trySet(tile.parts[1].ctl, 'imageColor', d.base)
    T.trySet(tile.parts[2].ctl, 'imageColor', d.inner)
    T.trySet(tile.parts[3].ctl, 'imageColor', d.deep)
    T.tryCall(tile.parts[3].ctl, 'SetImage', Enum.ImageSource.StaticReference, T.SHAPE_ID[d.icon])
    T.tryCall(tile.parts[3].ctl, 'SetSizeDelta', 24 * T.S, 24 * T.S)
    T.trySet(tile.parts[4].ctl, 'imageColor', T.P.white)
  end
end
T.gShuffle = function(g)
  local N = T.G.N
  for attempt = 1, 40 do
    for r = 1, N do for c = 1, N do g.board[r][c] = T.rand(5) end end
    local _, count = T.gFindMatches(g)
    if count == 0 and T.gFindMove(g) then break end
  end
  for r = 1, N do
    for c = 1, N do
      local tile = g.tiles[r][c]
      local x, y = T.gpos(r, c)
      if tile then T.gDestroyTile(tile) end
      g.tiles[r][c] = T.gMakeTile(r, c, g.board[r][c], x, y)
    end
  end
  T.gSetTip(g, '茶点重新排好啦～')
  T.sfx(T.SFX.match)
end

-- ---------- 环 ----------
T.gRingAt = function(ring, r, c, size)
  if not ring then return end
  local x, y = T.gpos(r, c)
  T.tryCall(ring, 'SetAnchoredPosition', x * T.S, y * T.S)
  if size then T.tryCall(ring, 'SetSizeDelta', size * T.S, size * T.S) end
end
T.gRingHide = function(ring)
  if ring then T.tryCall(ring, 'SetAnchoredPosition', 0, -1000) end
end

-- ---------- HUD ----------
T.gHud = function(g)
  T.setTxt(g.scoreCtl, tostring(g.score))
  T.setTxt(g.movesCtl, tostring(g.moves))
  T.setTxt(g.goalCtl, '目标 ' .. g.goal)
  local ratio = math.min(1, g.score / g.goal)
  if g.progress then
    local w = 196 * ratio
    T.tryCall(g.progress, 'SetSizeDelta', math.max(1, w) * T.S, 9 * T.S)
    T.tryCall(g.progress, 'SetAnchoredPosition', (470 - 98 + w / 2) * T.S, -44 * T.S)
  end
  if g.comboCtl then
    T.setTxt(g.comboCtl, g.combo > 1 and ('×' .. g.combo .. ' 连锁') or '连击')
    T.setTxtColor(g.comboCtl, g.combo > 1 and T.P.roseDeep or T.P.ink2)
  end
end
T.gSetTip = function(g, text)
  if g.tipCtl then T.setTxt(g.tipCtl, text) end
  g.tipDefault = text
  g.tipT = 2.2
end

-- ---------- 输入 ----------
T.gClickTile = function(r, c)
  local g = T.game
  if not g or g.busy or g.phase ~= 'play' then return end
  g.idle = 0
  if not g.sel then
    g.sel = { r = r, c = c }
    T.gRingAt(g.selRing, r, c, 64)
    T.sfx(T.SFX.click)
  elseif g.sel.r == r and g.sel.c == c then
    g.sel = nil
    T.gRingHide(g.selRing)
  elseif T.gAdjacent(g.sel, { r = r, c = c }) then
    local a = g.sel
    g.sel = nil
    T.gRingHide(g.selRing)
    T.gTrySwap(a, { r = r, c = c })
  else
    g.sel = { r = r, c = c }
    T.gRingAt(g.selRing, r, c, 64)
    T.sfx(T.SFX.click)
  end
end

T.gTrySwap = function(a, b)
  local g = T.game
  if not g or g.busy or g.phase ~= 'play' or not T.gAdjacent(a, b) then return end
  local A, B = g.tiles[a.r][a.c], g.tiles[b.r][b.c]
  if not A or not B then return end
  g.busy = true
  g.hintT = 0
  T.gRingHide(g.hintRing)
  local ax, ay, bx, by = A.x, A.y, B.x, B.y
  -- 交换数据与视觉
  g.tiles[a.r][a.c], g.tiles[b.r][b.c] = B, A
  g.board[a.r][a.c], g.board[b.r][b.c] = g.board[b.r][b.c], g.board[a.r][a.c]
  local function set(tt, x, y) T.gSetTile(tt, x, y) end
  T.sfx(T.SFX.click)
  T.tween(0.14, function(k)
    set(A, ax + (bx - ax) * k, ay + (by - ay) * k)
    set(B, bx + (ax - bx) * k, by + (ay - by) * k)
  end, function()
    set(A, bx, by); set(B, ax, ay)
    A.r, A.c, B.r, B.c = b.r, b.c, a.r, a.c
    local _, count = T.gFindMatches(g)
    if count > 0 then
      g.moves = g.moves - 1
      T.gHud(g)
      T.gResolve(1)
    else
      -- 换不回去：反向动画，不扣步数
      g.tiles[a.r][a.c], g.tiles[b.r][b.c] = A, B
      g.board[a.r][a.c], g.board[b.r][b.c] = g.board[b.r][b.c], g.board[a.r][a.c]
      A.r, A.c, B.r, B.c = a.r, a.c, b.r, b.c
      T.tween(0.14, function(k)
        set(A, bx + (ax - bx) * k, by + (ay - by) * k)
        set(B, ax + (bx - ax) * k, ay + (by - ay) * k)
      end, function()
        set(A, ax, ay); set(B, bx, by)
        g.busy = false
        T.gSetTip(g, '这样换不掉哦，再试试～')
        T.sfx(T.SFX.back)
      end)
    end
  end)
end

-- ---------- 消除/下落 ----------
T.gFloat = function(x, y, text, color, size)
  local ctl = T.txt(x, y, 160, 40, size or 20, text, color or T.P.white, 'Middle', 'Middle', { outline = true })
  if not ctl then return end
  local y0 = y
  T.tween(0.7, function(k)
    T.tryCall(ctl, 'SetAnchoredPosition', x * T.S, (y0 + 36 * k) * T.S)
    T.trySet(ctl, 'fontColor', T.withA(color or T.P.white, math.floor(255 * (1 - k))))
  end, function()
    T.destroy(ctl)
  end)
end
T.gResolve = function(combo)
  local g = T.game
  if not g then return end
  local set, count = T.gFindMatches(g)
  if count == 0 then
    g.busy = false
    g.combo = 0
    T.gHud(g)
    if g.score >= g.goal then T.gFinish(true)
    elseif g.moves <= 0 then T.gFinish(false)
    else
      if not T.gFindMove(g) then T.gShuffle(g) end
      g.idle = 0
    end
    return
  end
  g.combo = combo
  g.maxCombo = math.max(g.maxCombo or 0, combo)
  local gained = count * T.G.SCORE_PER * combo + math.max(0, count - 3) * 30
  g.score = g.score + gained
  g.cleared = (g.cleared or 0) + count
  T.log('match combo=' .. combo .. ' count=' .. count .. ' score=' .. g.score .. ' moves=' .. g.moves)
  T.gHud(g)
  T.setTxt(g.comboCtl, combo > 1 and ('×' .. combo .. ' 连锁') or ('+' .. gained))
  T.setTxtColor(g.comboCtl, combo > 1 and T.P.roseDeep or T.P.butterDeep)
  local sumX, sumY = 0, 0
  local clearedTiles = {}
  for _, cell in pairs(set) do
    local tile = g.tiles[cell.r][cell.c]
    if tile then
      clearedTiles[#clearedTiles + 1] = { tile = tile, r = cell.r, c = cell.c }
      sumX, sumY = sumX + tile.x, sumY + tile.y
    end
  end
  local n = #clearedTiles
  if n > 0 then
    T.gFloat(sumX / n, sumY / n + 12, '+' .. gained, T.P.butterLight, combo > 1 and 24 or 20)
    T.sfx(T.SFX.match, true)
    if combo > 1 then T.after(0.08, function() T.sfx(T.SFX.combo, true) end) end
  end
  T.tween(0.18, function(k)
    for _, it in ipairs(clearedTiles) do
      for _, p in ipairs(it.tile.parts) do
        T.tryCall(p.ctl, 'SetSizeDelta', math.max(1, p.w * (1 - k)) * T.S, math.max(1, p.h * (1 - k)) * T.S)
        T.trySet(p.ctl, 'imageColor', T.mix(p.base, T.P.white, k))
      end
    end
  end, function()
    for _, it in ipairs(clearedTiles) do
      T.gDestroyTile(it.tile)
      g.tiles[it.r][it.c] = nil
      g.board[it.r][it.c] = 0
    end
    T.gCollapse(combo + 1)
  end)
end
T.gCollapse = function(nextCombo)
  local g = T.game
  local N = T.G.N
  local moves = {}
  for c = 1, N do
    local survivors = {}
    for r = N, 1, -1 do
      local tile = g.tiles[r][c]
      if tile then
        survivors[#survivors + 1] = tile
        g.tiles[r][c] = nil
      end
    end
    local occupied = #survivors
    for i = 1, occupied do
      local tr = N - (i - 1)
      local tile = survivors[i]
      local tx, ty = T.gpos(tr, c)
      g.tiles[tr][c] = tile
      g.board[tr][c] = tile.type
      if math.abs(tile.x - tx) > 1 or math.abs(tile.y - ty) > 1 then
        moves[#moves + 1] = { tile = tile, sx = tile.x, sy = tile.y, tx = tx, ty = ty }
      else
        T.gSetTile(tile, tx, ty)
      end
      tile.r, tile.c = tr, c
    end
    local empty = N - occupied
    for r = 1, empty do
      local typ = T.rand(5)
      local tx, ty = T.gpos(r, c)
      local startY = ty + (empty - r + 1) * T.G.PITCH
      local tile = T.gMakeTile(r, c, typ, tx, startY)
      g.tiles[r][c] = tile
      g.board[r][c] = typ
      moves[#moves + 1] = { tile = tile, sx = tx, sy = startY, tx = tx, ty = ty }
    end
  end
  if #moves == 0 then T.gResolve(nextCombo); return end
  T.tween(0.18, function(k)
    for _, m in ipairs(moves) do
      T.gSetTile(m.tile, m.sx + (m.tx - m.sx) * k, m.sy + (m.ty - m.sy) * k)
    end
  end, function()
    for _, m in ipairs(moves) do T.gSetTile(m.tile, m.tx, m.ty) end
    T.gResolve(nextCombo)
  end)
end

-- ---------- 结束 ----------
T.gFinish = function(win)
  local g = T.game
  if not g or g.phase ~= 'play' then return end
  g.phase = 'over'
  g.busy = true
  local stars = 0
  if win then
    stars = 1
    if g.score >= g.goal * 1.25 then stars = 2 end
    if g.score >= g.goal * 1.5 then stars = 3 end
  end
  local chId = g.chapter
  T.records.plays = T.records.plays + 1
  T.records.visited[chId] = true
  if win then T.records.clears = T.records.clears + 1 end
  T.records.best[chId] = math.max(T.records.best[chId] or 0, g.score)
  T.records.stars[chId] = math.max(T.records.stars[chId] or 0, stars)
  T.records.totalCleared = T.records.totalCleared + (g.cleared or 0)
  T.records.maxCombo = math.max(T.records.maxCombo or 0, g.maxCombo or 0)
  T.log('gameover win=' .. tostring(win) .. ' score=' .. g.score .. ' stars=' .. stars .. ' moves=' .. g.moves)
  T.sfx(win and T.SFX.win or T.SFX.lose, true)
  local data = { chapter = chId, win = win, score = g.score, best = T.records.best[chId],
    stars = stars, moves = g.moves, maxCombo = g.maxCombo or 0, cleared = g.cleared or 0 }
  -- 直接结算：之前 T.after 在部分真机会话里不触发，表现为赢了以后永远停在棋盘
  if T.overlay then T.closeAllOverlays() end
  T.openResult(data)
  if win then T.unlock('first_tea') end
  if (g.maxCombo or 0) >= 3 then T.unlock('combo3') end
  if g.score >= 3000 then T.unlock('score3000') end
  if stars == 3 then T.unlock('perfect') end
  local all = true
  for i = 1, #T.chapters do if not T.records.visited[i] then all = false end end
  if all then T.unlock('all_chapters') end
end

-- ---------- 提示 / 更新 ----------
T.gameHint = function()
  local g = T.game
  if not g or g.phase ~= 'play' or g.busy then return end
  local move = T.gFindMove(g)
  if not move then T.gShuffle(g); return end
  T.gRingAt(g.hintRing, move.a.r, move.a.c, 66)
  g.hintT = 3.2
  g.hintMove = move
  g.idle = 0
  T.gSetTip(g, '试试这两个茶点～')
  T.sfx(T.SFX.hover)
  T.log('hint r=' .. move.a.r .. ' c=' .. move.a.c .. ' -> r=' .. move.b.r .. ' c=' .. move.b.c)
end
T.gRecover = function(g)
  -- 动画/回调异常后的兜底：让棋盘数据和可见图元重新一致，解除 busy
  local repaired = 0
  for r = 1, T.G.N do
    for c = 1, T.G.N do
      local tile = g.tiles[r][c]
      if not tile or not tile.parts or #tile.parts == 0 then
        local typ = g.board[r][c]
        if not typ or typ == 0 then
          typ = T.rand(5)
          g.board[r][c] = typ
        end
        local x, y = T.gpos(r, c)
        if tile then T.gDestroyTile(tile) end
        g.tiles[r][c] = T.gMakeTile(r, c, typ, x, y)
        repaired = repaired + 1
      end
    end
  end
  g.busy = false
  g.busyT = 0
  g.sel = nil
  g.dragFrom, g.dragTo = nil, nil
  T.gRingHide(g.selRing)
  T.gHud(g)
  T.log('game recover repaired=' .. repaired)
end

T.gTick = function(dt)
  local g = T.game
  if not g or g.phase ~= 'play' then return end
  if g.busy then
    g.busyT = (g.busyT or 0) + dt
    if g.busyT > 1.5 then
      T.warn('game busy timeout :: repair board')
      T.gRecover(g)
      return
    end
  else
    g.busyT = 0
  end
  local pulse = 1 + math.sin(T.time * 4.2) * 0.045
  if g.sel then T.gRingAt(g.selRing, g.sel.r, g.sel.c, 64 * pulse) end
  if g.hintT > 0 then
    g.hintT = g.hintT - dt
    local mv = g.hintMove
    if mv then T.gRingAt(g.hintRing, mv.a.r, mv.a.c, 66 * pulse) end
    if g.hintT <= 0 then T.gRingHide(g.hintRing) end
  end
  if g.kbVisible then
    T.gRingAt(g.kbRing, g.kb.r, g.kb.c, 66 * pulse)
  end
  if g.tipT and g.tipT > 0 then
    g.tipT = g.tipT - dt
    if g.tipT <= 0 and g.tipCtl and g.tipDefault then T.setTxt(g.tipCtl, g.tipDefault) end
  end
  if not g.busy and not g.sel then
    g.idle = (g.idle or 0) + dt
    if g.idle > 8 and g.hintT <= 0 then
      T.gameHint()
      g.idle = 0
    end
  end
end

-- ---------- 界面 ----------
T.screenFns.game = function(params)
  params = params or {}
  local chId = params.chapter or 1
  if chId < 1 or chId > #T.chapters then chId = 1 end
  local ch = T.chapters[chId]
  local c = T.chars[ch.char]
  T.bgGarden(chId == 1 and 'snow' or chId == 2 and 'dusk' or chId == 3 and 'dream' or 'garden')
  T.petals(9, -30, { c.main, T.P.butter })
  -- 顶栏
  T.img(0, 322, 1280, 58, 'rect', T.P.cream)
  T.img(0, 293, 1280, 2, 'rect', c.main)
  T.txt(-590, 322, 360, 42, 22, ch.name, c.deep, 'Left', 'Middle')
  T.txt(-250, 322, 420, 30, 13, ch.sub, T.P.ink2, 'Left', 'Middle')
  T.badge(300, 322, '第 ' .. chId .. ' 杯', c.light, c.deep)
  local pauseBg = T.img(560, 322, 120, 40, 'rect', c.main)
  local pauseTx = T.txt(560, 322, 112, 34, 16, '暂停 Q', T.P.cream, 'Middle', 'Middle')
  T.hit('hit_game_pause', 560, 322, 120, 40, {
    onEnter = function() T.trySet(pauseBg, 'imageColor', T.P.gold) end,
    onExit = function() T.trySet(pauseBg, 'imageColor', c.main) end,
    onClick = function() T.openPause() end,
  })
  -- 棋盘
  local bx, by = 0, T.G.BOARD_CY
  T.img(bx + 5, by - 6, 500, 500, 'rect', T.P.shadow)
  T.img(bx, by, 494, 494, 'rect', c.deep)
  T.img(bx, by, 484, 484, 'rect', T.P.cream)
  T.img(bx, by, 458, 458, 'rect', T.P.paper)
  for i = 1, 49 do
    local r, col = math.floor((i - 1) / 7) + 1, (i - 1) % 7 + 1
    local x, y = T.gpos(r, col)
    T.img(x, y, 58, 58, 'circle', c.light)
  end
  for i = 0, 7 do
    local p = -217 + i * 62
    T.img(bx + p, by, 1, 434, 'rect', T.P.line)
    T.img(bx, by + p, 434, 1, 'rect', T.P.line)
  end
  -- 游戏状态
  local g = {
    chapter = chId, ch = ch, c = c, board = {}, tiles = {}, score = 0, moves = ch.moves,
    goal = ch.goal, combo = 0, maxCombo = 0, cleared = 0, busy = false, phase = 'play',
    sel = nil, kb = { r = 4, c = 4 }, kbSel = nil, kbVisible = false, idle = 0,
    hintT = 0, hintMove = nil, dragFrom = nil, dragTo = nil,
    tipT = 0, tipDefault = '三个同色连成一线，就会变成一杯好茶。',
  }
  T.game = g
  T.log('chapter=' .. chId)
  T.setSeed(20261028 + chId * 97 + (T.records.plays or 0) * 13)
  -- 版式：左角色 / 右数值
  T.img(-470, -16, 300, 410, 'rect', T.P.cream)
  T.img(-470, -16, 292, 402, 'rect', T.P.paper)
  T.medallion(-470, 96, 66, c, 0.9, { idle = true })
  T.txt(-470, 16, 260, 34, 22, c.name, c.deep, 'Middle', 'Middle')
  T.txt(-470, -10, 260, 24, 12, c.title .. ' · ' .. c.element, T.P.ink2, 'Middle', 'Middle')
  T.img(-470, -46, 250, 1.4, 'rect', T.P.line)
  g.tipCtl = T.txt(-470, -104, 250, 100, 13, g.tipDefault, T.P.ink2, 'Middle', 'Middle')
  T.txt(-470, -164, 250, 24, 12, '目标  ' .. ch.goal .. ' 分', T.P.ink, 'Middle', 'Middle')
  T.txt(-470, -190, 250, 24, 12, '步数  ' .. ch.moves, T.P.ink, 'Middle', 'Middle')
  -- 右面板
  T.img(470, -16, 300, 410, 'rect', T.P.cream)
  T.img(470, -16, 292, 402, 'rect', T.P.paper)
  T.txt(470, 150, 260, 26, 13, '本杯得分', T.P.ink2, 'Middle', 'Middle')
  g.scoreCtl = T.txt(470, 108, 260, 72, 42, '0', c.deep, 'Middle', 'Middle')
  T.txt(470, 54, 260, 26, 13, '剩余步数', T.P.ink2, 'Middle', 'Middle')
  g.movesCtl = T.txt(470, 18, 260, 48, 28, tostring(ch.moves), T.P.ink, 'Middle', 'Middle')
  T.txt(470, -22, 260, 24, 12, '目标进度', T.P.ink2, 'Middle', 'Middle')
  T.img(470, -44, 200, 11, 'rect', T.P.line)
  g.progress = T.img(470 - 98, -44, 1, 9, 'rect', c.main)
  g.goalCtl = T.txt(470, -66, 260, 24, 12, '目标 ' .. ch.goal, T.P.ink2, 'Middle', 'Middle')
  g.comboCtl = T.txt(470, -102, 260, 34, 20, '连击', T.P.roseDeep, 'Middle', 'Middle')
  local hintBg = T.img(470, -156, 190, 44, 'rect', T.P.sky)
  local hintTx = T.txt(470, -156, 182, 38, 16, '提示茶点', T.P.cream, 'Middle', 'Middle')
  T.hit('hit_game_hint', 470, -156, 190, 44, {
    onEnter = function() T.trySet(hintBg, 'imageColor', T.P.skyDeep) end,
    onExit = function() T.trySet(hintBg, 'imageColor', T.P.sky) end,
    onClick = function() T.gameHint() end,
  })
  -- 棋盘上的环（后建 = 在文字/茶点之上；空心的，不会盖住文字）
  g.selRing = T.img(0, -1000, 64, 64, 'ring', T.P.gold)
  g.hintRing = T.img(0, -1000, 66, 66, 'ring', c.main)
  g.kbRing = T.img(0, -1000, 68, 68, 'ring', T.P.roseDeep)
  -- 棋子
  T.gGenerate(g)
  for r = 1, 7 do
    g.tiles[r] = g.tiles[r] or {}
    for col = 1, 7 do
      local x, y = T.gpos(r, col)
      g.tiles[r][col] = T.gMakeTile(r, col, g.board[r][col], x, y)
    end
  end
  T.gHud(g)
  T.gRingHide(g.kbRing)
  -- 日志（用例锚）
  local rows = {}
  for r = 1, 7 do rows[#rows + 1] = table.concat(g.board[r]) end
  T.log('board seed=' .. T.seed .. ' ' .. table.concat(rows, '/'))
  local mv = T.gFindMove(g)
  if mv then T.log('move r=' .. mv.a.r .. ' c=' .. mv.a.c .. ' -> r=' .. mv.b.r .. ' c=' .. mv.b.c)
  else T.log('move none') end
  -- 点击热区（每格一个）
  for r = 1, 7 do
    for col = 1, 7 do
      local x, y = T.gpos(r, col)
      local rr, cc = r, col
      T.hit('hit_tile_' .. r .. '_' .. col, x, y, 58, 58, {
        clickSfx = false,
        onDown = function()
          local gg = T.game
          if not gg or gg.busy or gg.phase ~= 'play' then return end
          gg.dragFrom = { r = rr, c = cc }
          gg.dragTo = nil
          gg.idle = 0
        end,
        onEnter = function()
          local gg = T.game
          if gg and gg.dragFrom and not gg.busy then
            if T.gAdjacent(gg.dragFrom, { r = rr, c = cc }) then gg.dragTo = { r = rr, c = cc } end
          end
        end,
        onUp = function(data)
          local gg = T.game
          if not gg then return end
          local from = gg.dragFrom
          gg.dragFrom = nil
          local to = gg.dragTo
          gg.dragTo = nil
          if not from or gg.busy or gg.phase ~= 'play' then return end
          if data and data.dragging and to then
            T.gTrySwap(from, to)
          else
            T.gClickTile(from.r, from.c)
          end
        end,
      })
    end
  end
  T.footer('点击 / 拖拽相邻茶点交换 · 三个同色消除 · Q 暂停 · H 指南', T.P.ink3)
  local screen = T.screen
  screen.update = function(dt) T.gTick(dt) end
  screen.key = function(a)
    local gg = T.game
    if not gg then return end
    if a == 'back' then T.openPause(); return end
    if a == 'debug' then T.gFinish(true); return end
    if a == 'help' then T.openHelp('game'); return end
    if gg.phase ~= 'play' or gg.busy then return end
    if a == 'up' then gg.kb.r = math.max(1, gg.kb.r - 1)
    elseif a == 'down' then gg.kb.r = math.min(7, gg.kb.r + 1)
    elseif a == 'left' then gg.kb.c = math.max(1, gg.kb.c - 1)
    elseif a == 'right' then gg.kb.c = math.min(7, gg.kb.c + 1)
    elseif a == 'confirm' then
      if not gg.kbSel then
        gg.kbSel = { r = gg.kb.r, c = gg.kb.c }
        gg.sel = { r = gg.kb.r, c = gg.kb.c }
        T.gRingAt(gg.selRing, gg.kb.r, gg.kb.c, 64)
        T.log('kb sel r=' .. gg.kb.r .. ' c=' .. gg.kb.c)
        T.sfx(T.SFX.click)
      elseif gg.kbSel.r == gg.kb.r and gg.kbSel.c == gg.kb.c then
        gg.kbSel = nil
        gg.sel = nil
        T.gRingHide(gg.selRing)
      elseif T.gAdjacent(gg.kbSel, { r = gg.kb.r, c = gg.kb.c }) then
        local from = gg.kbSel
        gg.kbSel = nil
        gg.sel = nil
        T.gRingHide(gg.selRing)
        T.log('kb swap r=' .. from.r .. ' c=' .. from.c .. ' -> r=' .. gg.kb.r .. ' c=' .. gg.kb.c)
        T.gTrySwap(from, { r = gg.kb.r, c = gg.kb.c })
      else
        gg.kbSel = { r = gg.kb.r, c = gg.kb.c }
        gg.sel = { r = gg.kb.r, c = gg.kb.c }
        T.gRingAt(gg.selRing, gg.kb.r, gg.kb.c, 64)
      end
    end
    gg.kbVisible = true
    T.gRingAt(gg.kbRing, gg.kb.r, gg.kb.c, 68)
    T.gSetTip(gg, '方向键移动 · 空格选择 · 再按一次交换')
    gg.idle = 0
  end
end
