-- ============================================================================
-- 核心：画布 / 控件工厂 / 焦点 / 补间 / 弹层 / 转场 / 音效 / 震屏
-- 层序铁律：同一层里「后建的在上」；服务端 textbox 永远在运行时实例之下。
-- 每屏固定顺序：背景图 → 内容图 → 全部文字 → hits → 焦点框（finishScreen）。
-- ============================================================================
T = T or {}
T.tpl = { prim = __GUID_PRIM__, label = __GUID_LABEL__, hit = __GUID_HIT__ }
T.ev = {}
T.controls, T.texts, T.items, T.hits = {}, {}, {}, {}
T.tweens, T.anims, T.pos = {}, {}, {}
T.overlays = {}
T.overlay = nil
T.focus = 0
T.mode = 'boot'
T.time = 0
T.frame = 0
T.transition = nil
T.toastSet = nil
T.ambient = { handle = nil, timer = 0 }
T.lastAction, T.lastActionFrame = '', -1
T.seed = 20261028
T.shakeT, T.shakeAmp = 0, 0
T.shakeFrom = nil
T.prefix = '[frost]'

T.log = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  print(T.prefix .. ' ' .. table.concat(t, ' '))
end
T.warn = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  print(T.prefix .. '[warn] ' .. table.concat(t, ' '))
end

-- ---------- 数学 ----------
T.clamp = function(v, lo, hi)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end
T.lerp = function(a, b, t) return a + (b - a) * t end
T.pulse = function(speed, lo, hi)
  lo, hi = lo or 0, hi or 1
  return lo + (hi - lo) * (0.5 + 0.5 * math.sin(T.time * (speed or 1)))
end

-- ---------- 随机数（确定性，用例可复现） ----------
T.setSeed = function(n) T.seed = n % 2147483648 end
T.rand = function(n)
  T.seed = (T.seed * 1103515245 + 12345) % 2147483648
  return math.floor(T.seed / 65536) % n + 1
end
T.randf = function() return T.rand(100000) / 100000 end

-- ---------- 画布 ----------
T.layout = function()
  local ok, w, h = pcall(function() return game.GetUICanvasSize() end)
  if ok and tonumber(w) and tonumber(h) and w > 0 and h > 0 then
    T.W, T.H = w, h
  else
    T.W, T.H = T.DESIGN_W, T.DESIGN_H
  end
  T.S = math.min(T.W / T.DESIGN_W, T.H / T.DESIGN_H)
  T.CX, T.CY = T.W / 2, T.H / 2
  T.log('canvas', T.W .. 'x' .. T.H, 'scale=' .. string.format('%.3f', T.S))
end
T.sx = function(x) return x * T.S end
T.sy = function(y) return y * T.S end

-- ---------- 安全写控件 ----------
T.trySet = function(ctl, key, value)
  if not ctl then return false end
  if (key == 'horizontalAlignment' or key == 'verticalAlignment') and type(value) == 'string' then
    local enums = (type(Enum) == 'table')
      and ((key == 'horizontalAlignment' and Enum.TextHorizontalAlignment) or Enum.TextVerticalAlignment) or nil
    if enums and enums[value] ~= nil then value = enums[value] end
  end
  local ok, err = pcall(function() ctl[key] = value end)
  if not ok then T.warn('pcall fail set ' .. tostring(key) .. ' :: ' .. tostring(err)) end
  return ok
end
T.tryCall = function(ctl, method, a, b, c)
  if not ctl then return false end
  local ok, err
  if c ~= nil then ok, err = pcall(function() ctl[method](ctl, a, b, c) end)
  elseif b ~= nil then ok, err = pcall(function() ctl[method](ctl, a, b) end)
  elseif a ~= nil then ok, err = pcall(function() ctl[method](ctl, a) end)
  else ok, err = pcall(function() ctl[method](ctl) end) end
  if not ok then T.warn('pcall fail call ' .. tostring(method) .. ' :: ' .. tostring(err)) end
  return ok
end
T.destroy = function(ctl)
  if not ctl then return false end
  local ok, err = pcall(function() game.DestroyClientUIControl(ctl) end)
  if not ok then T.warn('pcall fail destroy :: ' .. tostring(err)) end
  return ok
end
-- 销毁并从台账里摘除（战斗粒子必须走这条，否则 T.controls 无限增长）
T.destroyCtl = function(ctl)
  if not ctl then return end
  for i = #T.controls, 1, -1 do
    if T.controls[i] == ctl then table.remove(T.controls, i) break end
  end
  T.pos[ctl] = nil
  T.destroy(ctl)
end
T.inst = function(guid, parent)
  local ok, ctl = pcall(function() return game.InstantiateClientUIControl(guid, parent or T.root) end)
  if not ok or not ctl then
    T.warn('pcall fail instantiate guid=' .. tostring(guid) .. ' :: ' .. tostring(ctl))
    return nil
  end
  return ctl
end
T.setPos = function(ctl, x, y)
  if not ctl then return end
  T.tryCall(ctl, 'SetAnchoredPosition', x * T.S, y * T.S)
  T.pos[ctl] = { x = x, y = y }
end
T.setSize = function(ctl, w, h)
  if ctl then T.tryCall(ctl, 'SetSizeDelta', math.max(1, w * T.S), math.max(1, h * T.S)) end
end
T.setColor = function(ctl, c) if ctl then T.trySet(ctl, 'imageColor', c) end end
T.setAlpha = function(ctl, c, a) if ctl then T.trySet(ctl, 'imageColor', T.withA(c % 16777216, a)) end end
T.setScale = function(ctl, s)
  if ctl then T.tryCall(ctl, 'SetLocalScale', s, s) end
end

-- ---------- 图片工厂 ----------
T.img = function(x, y, w, h, shape, color, rot)
  local ctl = T.inst(T.tpl.prim)
  if not ctl then return nil end
  local id = T.SHAPE_ID[shape or 'rect'] or 100001
  if not pcall(function() ctl:SetImage(Enum.ImageSource.StaticReference, id) end) then
    T.warn('SetImage ' .. tostring(id))
  end
  T.setSize(ctl, w, h)
  T.setPos(ctl, x, y)
  if rot and rot ~= 0 then T.trySet(ctl, 'localRotationZ', rot) end
  T.setColor(ctl, color or T.P.white)
  T.controls[#T.controls + 1] = ctl
  return ctl
end
T.imgRaw = function(x, y, w, h, shape, color, rot)
  local ctl = T.inst(T.tpl.prim)
  if not ctl then return nil end
  local id = T.SHAPE_ID[shape or 'rect'] or 100001
  pcall(function() ctl:SetImage(Enum.ImageSource.StaticReference, id) end)
  T.tryCall(ctl, 'SetSizeDelta', w, h)
  T.tryCall(ctl, 'SetAnchoredPosition', x, y)
  if rot and rot ~= 0 then T.trySet(ctl, 'localRotationZ', rot) end
  T.setColor(ctl, color or T.P.white)
  T.controls[#T.controls + 1] = ctl
  return ctl
end

-- ---------- 文字工厂 ----------
-- 高度按 1.45×fontSize 留足，避免「整行不画 / 裁半字」（04-text 铁律）
T.textH = function(size, lines)
  lines = lines or 1
  return lines * size * 1.28 + size * 0.55 + 12
end
T.txt = function(x, y, w, h, size, text, color, align, valign, opts)
  opts = opts or {}
  local ctl = T.inst(T.tpl.label)
  if not ctl then return nil end
  local fs = math.max(8, math.floor(size * T.S + 0.5))
  local cw = math.max(16, math.floor(w * T.S + 0.5))
  -- 铁律：框高不足会让整行不画（textLayout.visibleLineCount=0）。
  -- 统一按行数抬到 requiredHeight = lines*1.2*fs + blockInset(10) 之上。
  local lines = 1
  for _ in string.gmatch(text or '', '\n') do lines = lines + 1 end
  local need = math.ceil(lines * fs * 1.2 + fs * 0.5 + 10)
  local ch = math.max(fs + 8, need, math.floor(h * T.S + 0.5))
  local px = x
  if align == 'Left' then px = x + w / 2
  elseif align == 'Right' then px = x - w / 2 end
  T.tryCall(ctl, 'SetSizeDelta', cw, ch)
  T.tryCall(ctl, 'SetAnchoredPosition', px * T.S, y * T.S)
  T.trySet(ctl, 'fontSize', fs)
  T.trySet(ctl, 'fontColor', color or T.th.text)
  T.trySet(ctl, 'text', text or '')
  T.trySet(ctl, 'enableOutline', opts.outline or T.opt.outline or false)
  T.trySet(ctl, 'outlineColor', opts.outlineColor or T.C(150, 255, 255, 255))
  if opts.bg then T.trySet(ctl, 'bgColor', opts.bg) end
  T.trySet(ctl, 'horizontalAlignment', align or 'Middle')
  T.trySet(ctl, 'verticalAlignment', valign or 'Middle')
  T.controls[#T.controls + 1] = ctl
  T.texts[#T.texts + 1] = ctl
  T.pos[ctl] = { x = px, y = y }
  return ctl
end
T.txtAuto = function(x, y, w, size, text, color, align, opts)
  local lines = 1
  for _ in string.gmatch(text or '', '\n') do lines = lines + 1 end
  return T.txt(x, y, w, T.textH(size, lines) + 2, size, text, color, align, 'Middle', opts)
end
T.setTxt = function(ctl, text) if ctl then T.trySet(ctl, 'text', text) end end
T.setTxtColor = function(ctl, color) if ctl then T.trySet(ctl, 'fontColor', color) end end

-- 逐字标题（可做字距、逐字入场；中文标题的唯一优雅做法）
T.logo = function(cx, cy, chars, size, gap, color, opts)
  opts = opts or {}
  local n = #chars
  local list = {}
  for i = 1, n do
    local x = cx + (i - (n + 1) / 2) * gap
    local c = T.txt(x, cy, gap * 0.98, T.textH(size), size, chars[i], color or T.th.text, 'Middle', 'Middle',
      { outline = opts.outline, outlineColor = opts.outlineColor })
    list[#list + 1] = c
    if opts.shadow then
      T.trySet(c, 'enableOutline', true)
      T.trySet(c, 'outlineColor', opts.shadowColor or T.C(90, 255, 255, 255))
    end
  end
  if opts.decor then
    T.img(cx - (n * gap) / 2 - gap * 0.45, cy, 3, size * 0.66, 'rect', opts.decor)
    T.img(cx + (n * gap) / 2 + gap * 0.45, cy, 3, size * 0.66, 'rect', opts.decor)
  end
  return list
end

-- ---------- 补间 ----------
T.easeOut = function(t) return 1 - (1 - t) ^ 3 end
T.easeIn = function(t) return t * t * t end
T.easeInOut = function(t) return t < 0.5 and 4 * t * t * t or 1 - (-2 * t + 2) ^ 3 / 2 end
T.easeOutQuint = function(t) return 1 - (1 - t) ^ 5 end
T.easeBack = function(t)
  local c1, c3 = 1.70158, 2.70158
  return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
end
T.easeOutBack = function(t)
  local c1, c3 = 1.70158, 2.70158
  return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
end

-- tween(dur, fn(eased, raw), done, ease, ui)  ui=true 表示弹层内动画（暂停时不冻结）
T.tween = function(dur, fn, done, ease, ui)
  local tw = { t = 0, dur = math.max(0.001, dur), fn = fn, done = done, ease = ease or T.easeOut, ui = ui }
  T.tweens[#T.tweens + 1] = tw
  return tw
end
T.after = function(dur, fn, ui)
  return T.tween(dur, function() end, fn, nil, ui)
end
T.anim = function(fn) T.anims[#T.anims + 1] = fn end
T.clearAnims = function() T.anims = {} end

-- 入场：从偏移位置滑入（图形与文字都走 setPos，保留原始基准）
T.slideIn = function(list, dx, dy, dur, delay, ease)
  for i = 1, #list do
    local ctl = list[i]
    local p = ctl and T.pos[ctl]
    if p then
      T.setPos(ctl, p.x + dx, p.y + dy)
      local bx, by = p.x, p.y
      T.after(delay or 0, function()
        T.tween(dur or 0.3, function(k)
          if ctl then T.tryCall(ctl, 'SetAnchoredPosition', (bx + dx * (1 - k)) * T.S, (by + dy * (1 - k)) * T.S) end
        end, nil, ease or T.easeOut)
      end, true)
    end
  end
end

-- ---------- 逐帧更新 ----------
T.tick = function(dt)
  T.time = T.time + dt
  T.frame = T.frame + 1
  local paused = T.overlay and T.overlay.pausesGame
  local list = T.tweens
  for i = #list, 1, -1 do
    local tw = list[i]
    if tw and not (paused and not tw.ui) then
      tw.t = tw.t + dt
      local k = math.min(1, tw.t / tw.dur)
      local keep = tw.fn(tw.ease(k), k)
      if k >= 1 or keep == false then
        -- 必须用 table.remove（数组保持紧凑）：留 nil 洞会让 #list 变小，
        -- 之后 append 的新 tween 可能落在 #list 之外，永远不会被遍历到。
        table.remove(list, i)
        if tw.done then tw.done() end
      end
    end
  end
  local alist = T.anims
  for i = #alist, 1, -1 do
    local fn = alist[i]
    if fn then
      local ok, keep = pcall(fn, dt, T.time)
      if not ok then
        T.warn('anim error :: ' .. tostring(keep))
        table.remove(alist, i)
      elseif keep == false then
        table.remove(alist, i)
      end
    end
  end
  T.updateShake(dt)
  T.updateTransition(dt)
  T.updateAmbient(dt)
  if T.screen and T.screen.update and not (T.overlay and T.overlay.pausesGame) then
    local ok, err = pcall(T.screen.update, dt)
    if not ok then T.warn('screen update :: ' .. tostring(err)) end
  end
end

-- ---------- 震屏（只移动本屏从 shakeFrom 起的控件，0.2s 内衰减） ----------
T.shake = function(amp, dur)
  T.shakeAmp = amp or 6
  T.shakeT = dur or 0.22
  T.shakeBase = T.shakeAmp
  if not T.shakeFrom then T.shakeFrom = 1 end
end
T.updateShake = function(dt)
  if T.shakeT <= 0 then return end
  T.shakeT = T.shakeT - dt
  local k = math.max(0, T.shakeT / 0.22)
  local amp = (T.shakeBase or 6) * k
  local ox = math.sin(T.time * 61) * amp
  local oy = math.cos(T.time * 47) * amp * 0.7
  local from = T.shakeFrom or 1
  for i = from, #T.controls do
    local ctl = T.controls[i]
    local p = ctl and T.pos[ctl]
    if p then
      T.tryCall(ctl, 'SetAnchoredPosition', (p.x + ox) * T.S, (p.y + oy) * T.S)
    end
  end
  if T.shakeT <= 0 then T.shakeFrom = nil end
end
T.markShake = function() T.shakeFrom = #T.controls + 1 end

-- ---------- 音效 ----------
T.sfxFrame = -1
T.sfx = function(id, force)
  if not id or not T.opt.sfx then return false end
  if not force and T.sfxFrame == T.frame then return false end
  T.sfxFrame = T.frame
  local ok, err = pcall(function() game.PlayAudio2D(id) end)
  if not ok then T.warn('PlayAudio2D ' .. tostring(id) .. ' :: ' .. tostring(err)) return false end
  return true
end
T.updateAmbient = function(dt)
  T.ambient.timer = (T.ambient.timer or 0) + dt
  if not T.opt.ambient then
    if T.ambient.handle then
      pcall(function() if game.IsAudioAlive(T.ambient.handle) then game.StopAudio(T.ambient.handle) end end)
      T.ambient.handle = nil
    end
    return
  end
  if T.ambient.timer < 1 then return end
  T.ambient.timer = 0
  if T.ambient.handle then
    local ok, alive = pcall(function() return game.IsAudioAlive(T.ambient.handle) end)
    if ok and alive then return end
  end
  local ok, handle = pcall(function() return game.PlayAudio2D(T.SFX.ambient) end)
  if ok then
    T.ambient.handle = handle
    T.log('ambient play', T.SFX.ambient, 'handle=' .. tostring(handle))
  end
end
T.setAmbient = function(on)
  T.opt.ambient = on and true or false
  if not on and T.ambient.handle then
    pcall(function() game.StopAudio(T.ambient.handle) end)
    T.ambient.handle = nil
  end
  if on then T.ambient.timer = 1 end
end

-- ---------- 命中区 ----------
T.hitEv = function()
  if T.ev.CursorDown then return end
  local e = (type(Enum) == 'table' and Enum.CursorEventType) or nil
  T.ev.CursorDown = e and e.CursorDown or 'CursorDown'
  T.ev.CursorUp = e and e.CursorUp or 'CursorUp'
  T.ev.CursorClick = e and e.CursorClick or 'CursorClick'
  T.ev.CursorEnter = e and e.CursorEnter or 'CursorEnter'
  T.ev.CursorExit = e and e.CursorExit or 'CursorExit'
end
T.hit = function(name, x, y, w, h, opts)
  opts = opts or {}
  T.hitEv()
  local ctl = T.inst(T.tpl.hit)
  if not ctl then return nil end
  ctl.name = name
  T.setSize(ctl, w, h)
  T.setPos(ctl, x, y)
  T.trySet(ctl, 'raycastTarget', true)
  local function add(ev, fn)
    if pcall(function() ctl:AddCursorEventListener(ev, fn) end) then return true end
    return false
  end
  add(T.ev.CursorDown, function(data)
    if opts.onDown then opts.onDown(data) end
  end)
  add(T.ev.CursorUp, function(data)
    if opts.onUp then opts.onUp(data) end
  end)
  add(T.ev.CursorClick, function(data)
    if opts.clickSfx ~= false then T.sfx(opts.sfxId or T.SFX.click) end
    if opts.onClick then opts.onClick(data) end
  end)
  add(T.ev.CursorEnter, function(data)
    if opts.hoverSfx ~= false then T.sfx(T.SFX.hover) end
    if opts.onEnter then opts.onEnter(data) end
  end)
  add(T.ev.CursorExit, function(data)
    if opts.onExit then opts.onExit(data) end
  end)
  T.controls[#T.controls + 1] = ctl
  T.hits[name] = ctl
  return ctl
end
T.moveHit = function(name, x, y, w, h)
  local ctl = T.hits[name]
  if not ctl then return end
  if w then T.setSize(ctl, w, h) end
  T.setPos(ctl, x, y)
end
T.parkHit = function(name)
  local ctl = T.hits[name]
  if ctl then T.setPos(ctl, 0, -100000) end
end

-- ---------- 焦点项 ----------
T.item = function(o)
  o.x, o.y, o.w, o.h = o.x or 0, o.y or 0, o.w or 100, o.h or 40
  T.items[#T.items + 1] = o
  local idx = #T.items
  o.index = idx
  if o.name then
    o.hit = T.hit(o.name, o.x, o.y, o.w, o.h, {
      onEnter = function(data) T.setFocus(idx) end,
      onDown = function(data) if o.onDown then o.onDown(data) end end,
      onUp = function(data) if o.onUp then o.onUp(data) end end,
      onClick = function(data)
        T.setFocus(idx, true)
        if o.onConfirm then o.onConfirm() end
      end,
      clickSfx = o.clickSfx,
      hoverSfx = o.hoverSfx,
    })
  end
  return o
end
T.updateFocusFrame = function()
  local f = T.focusFrame
  if not f then return end
  local it = T.items[T.focus]
  if not it then
    for i = 1, #f do T.setPos(f[i], 0, -100000) end
    return
  end
  local pad = it.focusPad or 7
  local x, y, w, h = it.x + (it.offX or 0), it.y + (it.offY or 0), it.w + pad * 2, it.h + pad * 2
  local t = 2.4
  local hw, hh = w / 2, h / 2
  local arm = math.min(18, math.min(w, h) * 0.22)
  -- 四角 L 形括号（每角两条短臂）
  local corners = {
    { x - hw, y + hh, 1, 1 }, { x + hw, y + hh, -1, 1 },
    { x - hw, y - hh, 1, -1 }, { x + hw, y - hh, -1, -1 },
  }
  local ci = 1
  for _, c in ipairs(corners) do
    local cx, cy, sx, sy = c[1], c[2], c[3], c[4]
    local hctl = f[ci]
    local vctl = f[ci + 1]
    T.setSize(hctl, arm, t); T.setPos(hctl, cx + sx * arm / 2, cy)
    T.setSize(vctl, t, arm); T.setPos(vctl, cx, cy - sy * arm / 2)
    ci = ci + 2
  end
  local gi = ci
  for _, c in ipairs(corners) do
    local g = f[gi]
    if g then T.setSize(g, 7, 7); T.setPos(g, c[1], c[2]) end
    gi = gi + 1
  end
end
T.makeFocusFrame = function()
  local col = T.th.accent2
  local f = {}
  for i = 1, 8 do f[i] = T.img(0, -100000, 10, 2.4, 'rect', col) end
  for i = 9, 12 do f[i] = T.img(0, -100000, 7, 7, 'circle', T.th.accent) end
  T.focusFrame = f
end
T.setFocus = function(i, silent)
  if #T.items == 0 then T.focus = 0; T.updateFocusFrame(); return end
  if i < 1 then i = 1 end
  if i > #T.items then i = #T.items end
  local old = T.items[T.focus]
  if old and old.onFocus then old.onFocus(false) end
  T.focus = i
  local it = T.items[i]
  if it and it.onFocus then it.onFocus(true) end
  if not silent and old ~= it then T.sfx(T.SFX.hover) end
  T.updateFocusFrame()
end
T.moveFocus = function(dx, dy)
  if #T.items == 0 then return end
  local cur = T.items[T.focus] or T.items[1]
  if not T.focus or T.focus == 0 then T.focus = 1 end
  local best, bestScore = nil, 1e9
  for i, it in ipairs(T.items) do
    if i ~= T.focus then
      local vx, vy = it.x - cur.x, it.y - cur.y
      local primary = dx ~= 0 and vx * dx or vy * dy
      if primary > 4 then
        local ortho = dx ~= 0 and math.abs(vy) or math.abs(vx)
        local score = primary + ortho * 1.55
        if score < bestScore then bestScore = score; best = i end
      end
    end
  end
  if best then
    T.setFocus(best)
  else
    local wrap, wrapScore = nil, -1e9
    for i, it in ipairs(T.items) do
      local vx, vy = it.x - cur.x, it.y - cur.y
      local primary = dx ~= 0 and vx * dx or vy * dy
      if primary > 0 and primary > wrapScore then wrapScore = primary; wrap = i end
    end
    if wrap then T.setFocus(wrap) end
  end
end
T.confirmFocus = function()
  local it = T.items[T.focus]
  if it and it.onConfirm then
    T.sfx(T.SFX.confirm)
    it.onConfirm()
  end
end

-- ---------- 屏幕构建 ----------
T.clearScreen = function()
  local n, fail = 0, 0
  for i = #T.controls, 1, -1 do
    local ctl = T.controls[i]
    if ctl then
      local ok = pcall(function() game.DestroyClientUIControl(ctl) end)
      if ok then n = n + 1 else fail = fail + 1 end
    end
  end
  if fail > 0 then T.warn('pcall fail clear screen fail=' .. fail) end
  T.controls, T.texts, T.items, T.hits = {}, {}, {}, {}
  T.tweens, T.anims, T.pos = {}, {}, {}
  T.focus = 0
  T.focusFrame = nil
  T.screen = nil
  T.overlay = nil
  T.overlays = {}
  T.toastSet = nil
  T.shakeT, T.shakeFrom = 0, nil
end
T.finishScreen = function(defaultFocus)
  T.makeFocusFrame()
  T.setFocus(defaultFocus or 1, true)
  T.updateFocusFrame()
  if T.screen then
    T.log('screen=' .. tostring(T.screen.name), 'items=' .. #T.items, 'controls=' .. #T.controls,
      'hits=' .. #T.hits)
  end
end
T.build = function(name, params)
  T.clearScreen()
  T.mode = name
  T.screen = { name = name, params = params or {} }
  local fn = T.screenFns and T.screenFns[name]
  if not fn then
    T.warn('no screen builder: ' .. tostring(name))
    return
  end
  local ok, err = xpcall(function() fn(T.screen.params) end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then
    T.warn('build ' .. name .. ' FAILED :: ' .. tostring(err))
    return
  end
  T.finishScreen(T.screen.defaultFocus or 1)
  if T.screen.afterBuild then
    local ok2, err2 = pcall(T.screen.afterBuild)
    if not ok2 then T.warn('afterBuild ' .. name .. ' :: ' .. tostring(err2)) end
  end
end

-- ---------- 转场：霜色百叶（5 条冰带错落滑入，再滑出） ----------
T.transitionPanels = function(offset)
  local ps = {}
  local n = 5
  local bh = T.H / n + 2
  for i = 1, n do
    local y = T.H / 2 - (i - 0.5) * (T.H / n) + offset * (1 + (i % 2) * 0.10)
    ps[i] = T.imgRaw(0, y, T.W + 2, bh, 'rect', (i % 2 == 1) and T.C(255, 240, 250, 255) or T.C(255, 224, 244, 252))
    ps[i + n] = T.imgRaw(0, y - bh * 0.36, T.W + 2, 3, 'rect', T.C(255, 160, 216, 238))
  end
  return ps
end
T.movePanels = function(ps, offset)
  if not ps then return end
  local n = 5
  local bh = T.H / n + 2
  for i = 1, n do
    local base = T.H / 2 - (i - 0.5) * (T.H / n)
    local y = base + offset * (1 + (i % 2) * 0.10)
    if ps[i] then T.tryCall(ps[i], 'SetAnchoredPosition', 0, y) end
    if ps[i + n] then T.tryCall(ps[i + n], 'SetAnchoredPosition', 0, y - bh * 0.36) end
  end
end
T.destroyPanels = function(ps)
  if not ps then return end
  for i = 1, #ps do T.destroy(ps[i]) end
end
T.go = function(name, params)
  if T.transition then return end
  T.transition = { phase = 'cover', t = 0, dur = 0.18, name = name, params = params, panels = T.transitionPanels(-T.H) }
  T.sfx(T.SFX.tab)
end
T.updateTransition = function(dt)
  local tr = T.transition
  if not tr then return end
  tr.t = tr.t + dt
  if tr.phase == 'cover' then
    local k = math.min(1, tr.t / tr.dur)
    T.movePanels(tr.panels, -T.H + T.easeInOut(k) * T.H)
    if k >= 1 then
      T.destroyPanels(tr.panels)
      tr.panels = nil
      T.clearScreen()
      local ok, err = pcall(T.build, tr.name, tr.params)
      if not ok then T.warn('transition build :: ' .. tostring(err)) end
      tr.phase, tr.t, tr.dur = 'reveal', 0, 0.2
      tr.panels = T.transitionPanels(0)
    end
  else
    local k = math.min(1, tr.t / tr.dur)
    T.movePanels(tr.panels, T.easeInOut(k) * T.H)
    if k >= 1 then
      T.destroyPanels(tr.panels)
      T.transition = nil
    end
  end
end

-- ---------- 弹层 ----------
T.openOverlay = function(name, builder, opts)
  opts = opts or {}
  if T.transition then return end
  local base = {
    items = T.items, hits = T.hits, focus = T.focus, focusFrame = T.focusFrame,
    screen = T.screen, mode = T.mode, controlsStart = #T.controls + 1,
    name = name, pausesGame = opts.pausesGame, onClose = opts.onClose,
  }
  T.overlays[#T.overlays + 1] = base
  T.overlay = base
  -- 旧焦点框要移出屏幕：makeFocusFrame 会新建一套，旧的一套不 park 就会在弹层背后残留
  if T.focusFrame then
    for i = 1, #T.focusFrame do T.setPos(T.focusFrame[i], 0, -100000) end
  end
  T.items, T.hits, T.focus, T.focusFrame = {}, {}, 0, nil
  T.mode = 'overlay'
  local prev = T.screen
  T.screen = { name = 'overlay:' .. name, params = {}, update = opts.update, defaultFocus = opts.defaultFocus }
  local ok, err = xpcall(function() builder(base) end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then T.warn('overlay ' .. name .. ' FAILED :: ' .. tostring(err)) end
  T.makeFocusFrame()
  T.setFocus(opts.defaultFocus or 1, true)
  T.updateFocusFrame()
  T.screen.key = opts.key
  T.log('overlay=' .. name, 'items=' .. #T.items, 'controls=' .. #T.controls,
    'pause=' .. tostring(opts.pausesGame and true or false))
end
T.closeOverlay = function()
  local o = table.remove(T.overlays)
  if not o then return end
  for i = #T.controls, o.controlsStart, -1 do
    local ctl = T.controls[i]
    if ctl then pcall(function() game.DestroyClientUIControl(ctl) end); T.pos[ctl] = nil end
    T.controls[i] = nil
  end
  T.items, T.hits, T.focus, T.focusFrame = o.items, o.hits, o.focus, o.focusFrame
  T.screen, T.mode = o.screen, o.mode
  T.overlay = T.overlays[#T.overlays] or nil
  T.updateFocusFrame()
  if o.onClose then pcall(o.onClose) end
  T.log('overlay close=' .. tostring(o.name))
end
T.closeAllOverlays = function()
  while #T.overlays > 0 do T.closeOverlay() end
end
-- 弹层通用底板：遮罩 + 面板 + 标题（返回 panel 尺寸便于内容排版）
T.overlayPanel = function(w, h, title, sub, opts)
  opts = opts or {}
  local W, H = T.W, T.H
  local scrim = T.imgRaw(0, 0, W, H, 'rect', T.th.scrim)
  local ps = { scrim }
  local px, py = 0, 0
  T.spread(ps, T.rrect(px + 10, py - 12, w + 16, h + 16, 22, T.C(70, 4, 16, 28)))
  T.spread(ps, T.rrect(px, py, w, h, 20, T.th.border))
  T.spread(ps, T.rrect(px, py, w - 4, h - 4, 18, T.th.panel))
  local top = T.img(px, py + h / 2 - 34, w - 60, 1.6, 'rect', T.th.line)
  ps[#ps + 1] = top
  if title then
    local t = T.txt(px, py + h / 2 - 62, w - 100, 46, 28, title, T.th.text, 'Middle', 'Middle')
    ps[#ps + 1] = t
    if sub then
      local s = T.txt(px, py + h / 2 - 96, w - 100, 28, 13, sub, T.th.text3, 'Middle', 'Middle')
      ps[#ps + 1] = s
    end
  end
  local deco = T.img(px - w / 2 + 34, py + h / 2 - 34, 8, 8, 'fourstar', T.th.accent2)
  local deco2 = T.img(px + w / 2 - 34, py + h / 2 - 34, 8, 8, 'fourstar', T.th.accent2)
  ps[#ps + 1] = deco; ps[#ps + 1] = deco2
  -- 入场：整体上浮 + 回弹
  for i = 1, #ps do
    local c = ps[i]
    local p = T.pos[c]
    if p then
      T.setPos(c, p.x, p.y - 26)
      local bx, by = p.x, p.y
      T.after(0.02, function()
        T.tween(0.34, function(k)
          T.tryCall(c, 'SetAnchoredPosition', bx * T.S, (by - 26 * (1 - k)) * T.S)
        end, nil, T.easeOutBack, true)
      end, true)
    end
  end
  return { panel = panel, scrim = scrim, w = w, h = h, parts = ps }
end
T.closeButton = function(x, y, onClick, name)
  local c = T.img(x, y, 34, 34, 'circle', T.th.panel2)
  local c2 = T.img(x, y, 26, 26, 'circle', T.th.accentSoft)
  local a = T.img(x, y, 12, 2.4, 'rect', T.th.text2, 45)
  local b = T.img(x, y, 12, 2.4, 'rect', T.th.text2, -45)
  T.hit(name or 'hit_close', x, y, 46, 46, {
    onEnter = function() T.setColor(c, T.th.accent); T.setTxtColor(nil) end,
    onExit = function() T.setColor(c, T.th.panel2) end,
    onClick = function() T.sfx(T.SFX.back); onClick() end,
  })
end

-- ---------- Toast（冰晶胶囊） ----------
T.toast = function(text, color, icon)
  if T.toastSet then
    for i = #T.controls, 1, -1 do
      local c = T.controls[i]
      for _, tc in ipairs(T.toastSet) do
        if c == tc then T.controls[i] = nil; T.destroy(c); T.pos[c] = nil; break end
      end
    end
    T.toastSet = nil
  end
  local w = math.max(280, T.ulen(text) * 15 + 90)
  local y = 250
  local ps = {}
  local outer = T.rrect(0, y, w, 46, 23, T.th.border)
  local inner = T.rrect(0, y, w - 6, 38, 19, T.th.panel)
  for _, c in ipairs(outer) do ps[#ps + 1] = c end
  for _, c in ipairs(inner) do ps[#ps + 1] = c end
  ps[#ps + 1] = T.img(-w / 2 + 30, y, 8, 8, 'fourstar', color or T.th.accent2)
  ps[#ps + 1] = T.txt(12, y, w - 70, 34, 15, text, color or T.th.text, 'Middle', 'Middle')
  T.toastSet = ps
  local function move(dy)
    for i = 1, #ps do
      local c = ps[i]
      local p = T.pos[c]
      if p then T.tryCall(c, 'SetAnchoredPosition', p.x * T.S, (y + dy) * T.S) end
    end
  end
  move(20)
  T.tween(0.22, function(k) move(20 * (1 - k)) end, function()
    T.after(1.8, function()
      T.tween(0.2, function(k) move(-14 * k) end, function()
        for i = 1, #ps do
          local c = ps[i]
          for j = #T.controls, 1, -1 do if T.controls[j] == c then table.remove(T.controls, j) end end
          T.pos[c] = nil
          T.destroy(c)
        end
        T.toastSet = nil
      end, nil, true)
    end, true)
  end, nil, true)
end

-- ---------- 成就 ----------
T.unlock = function(id)
  if T.records.achv[id] then return end
  T.records.achv[id] = true
  local a = T.achvById[id]
  if a then T.toast('成就解锁 · ' .. a.name, T.th.accent2) end
  T.log('achievement', id)
end

-- ---------- 基础几何 ----------
-- 圆角矩形：2 矩形 + 4 圆，颜色必须不透明预混（半透明叠加会出接缝）
T.rrect = function(cx, cy, w, h, r, color, opts)
  local list = {}
  r = math.max(0, math.min(r or 10, w / 2, h / 2))
  local function push(c) if c then list[#list + 1] = c end end
  push(T.img(cx, cy, w - 2 * r, h, 'rect', color))
  push(T.img(cx, cy, w, h - 2 * r, 'rect', color))
  local off = { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }
  for _, o in ipairs(off) do
    push(T.img(cx + o[1] * (w / 2 - r), cy + o[2] * (h / 2 - r), r * 2, r * 2, 'circle', color))
  end
  return list, (opts and opts)
end
T.rrectOne = function(cx, cy, w, h, r, color)
  local list = T.rrect(cx, cy, w, h, r, color)
  return list[1]
end
-- 分组工具：rrect/card 返回的是「控件组」，改色/位移/展平必须走这两个
T.tint = function(group, color)
  if not group then return end
  if type(group) == 'table' then
    for i = 1, #group do T.setColor(group[i], color) end
  else
    T.setColor(group, color)
  end
end
T.spread = function(dst, group)
  if not group then return end
  if type(group) == 'table' then
    for i = 1, #group do dst[#dst + 1] = group[i] end
  else
    dst[#dst + 1] = group
  end
end
T.captureBase = function(dst, group)
  if not group then return end
  if type(group) == 'table' then
    for i = 1, #group do
      local p = T.pos[group[i]]
      if p then dst[#dst + 1] = { group[i], p.x, p.y } end
    end
  else
    local p = T.pos[group]
    if p then dst[#dst + 1] = { group, p.x, p.y } end
  end
end
T.shiftBase = function(base, dx, dy)
  for i = 1, #base do
    local b = base[i]
    T.tryCall(b[1], 'SetAnchoredPosition', (b[2] + (dx or 0)) * T.S, (b[3] + (dy or 0)) * T.S)
  end
end
-- 卡片：阴影 + 描边 + 面板 + 顶部高光
T.card = function(cx, cy, w, h, opts)
  opts = opts or {}
  local r = opts.radius or 16
  local fill = opts.fill or T.th.card
  local border = opts.border or T.th.cardBorder
  local parts = {}
  if opts.shadow ~= false then
    local sh = T.rrect(cx + (opts.shX or 4), cy - (opts.shY or 7), w, h, r, opts.shadowColor or T.C(46, 12, 40, 66))
    for i = 1, #sh do parts[#parts + 1] = sh[i] end
  end
  local b = T.rrect(cx, cy, w, h, r, border)
  for i = 1, #b do parts[#parts + 1] = b[i] end
  local p = T.rrect(cx, cy, w - (opts.borderW or 2), h - (opts.borderW or 2), math.max(2, r - 1), fill)
  for i = 1, #p do parts[#parts + 1] = p[i] end
  if opts.hi then
    local hl = T.img(cx, cy + h / 2 - (opts.hiY or 12), w - 40, 1.6, 'rect', opts.hi)
    parts[#parts + 1] = hl
  end
  return parts
end
T.hline = function(cx, cy, w, color, t)
  return T.img(cx, cy, w, t or 1.4, 'rect', color or T.th.line)
end
T.vline = function(cx, cy, h, color, t)
  return T.img(cx, cy, t or 1.4, h, 'rect', color or T.th.line)
end
T.dot = function(cx, cy, d, color)
  return T.img(cx, cy, d, d, 'circle', color or T.th.accent)
end
T.glowDot = function(cx, cy, r, color, alpha)
  T.img(cx, cy, r * 2.6, r * 2.6, 'circle', T.withA(color or T.th.accent, alpha or 26))
  T.img(cx, cy, r * 1.8, r * 1.8, 'circle', T.withA(color or T.th.accent, (alpha or 26) * 2))
  return T.img(cx, cy, r * 2, r * 2, 'circle', color or T.th.accent)
end
-- 六角冰晶：3 根 60° 交叠细矩形 + 6 个端点
T.snowflake = function(cx, cy, size, color, opts)
  opts = opts or {}
  local n = 3
  local list = {}
  for i = 0, n - 1 do
    local rot = i * 60
    list[#list + 1] = T.img(cx, cy, size * 2, size * 0.13, 'rect', color, rot)
    local a = math.rad(rot)
    list[#list + 1] = T.img(cx + math.cos(a) * size, cy + math.sin(a) * size, size * 0.28, size * 0.28,
      (opts.star and 'fourstar' or 'circle'), color)
    list[#list + 1] = T.img(cx - math.cos(a) * size, cy - math.sin(a) * size, size * 0.28, size * 0.28,
      (opts.star and 'fourstar' or 'circle'), color)
  end
  if opts.core then list[#list + 1] = T.img(cx, cy, size * 0.42, size * 0.42, 'circle', opts.core) end
  return list
end
-- 云：扁圆 + 两圆
T.cloudRaw = function(x, y, s, color)
  T.imgRaw(x, y, 120 * s, 46 * s, 'circle', color)
  T.imgRaw(x - 52 * s, y - 8 * s, 70 * s, 38 * s, 'circle', color)
  T.imgRaw(x + 58 * s, y - 5 * s, 84 * s, 42 * s, 'circle', color)
  T.imgRaw(x + 6 * s, y + 13 * s, 62 * s, 30 * s, 'circle', color)
end
T.cloud = function(x, y, s, color)
  T.img(x, y, 120 * s, 46 * s, 'circle', color)
  T.img(x - 52 * s, y - 8 * s, 70 * s, 38 * s, 'circle', color)
  T.img(x + 58 * s, y - 5 * s, 84 * s, 42 * s, 'circle', color)
  T.img(x + 6 * s, y + 13 * s, 62 * s, 30 * s, 'circle', color)
end
T.flowerRaw = function(x, y, r, color, center)
  for i = 0, 4 do
    local a = (i / 5) * math.pi * 2 - math.pi / 2
    T.imgRaw(x + math.cos(a) * r, y + math.sin(a) * r, r * 1.1, r * 1.1, 'circle', color)
  end
  T.imgRaw(x, y, r * 0.85, r * 0.85, 'circle', center or T.th.accent2)
end
T.flower = function(x, y, r, color, center)
  for i = 0, 4 do
    local a = (i / 5) * math.pi * 2 - math.pi / 2
    T.img(x + math.cos(a) * r, y + math.sin(a) * r, r * 1.1, r * 1.1, 'circle', color)
  end
  T.img(x, y, r * 0.85, r * 0.85, 'circle', center or T.th.accent2)
end
T.stars = function(x, y, n, size, color, emptyColor)
  for i = 1, 5 do
    local col = i <= n and color or (emptyColor or T.th.line)
    T.img(x + (i - 3) * (size + 8), y, size, size, 'fivestar', col)
  end
end
T.starRow = function(x, y, n, size, color, emptyColor)
  for i = 1, 3 do
    local col = i <= n and color or (emptyColor or T.th.line)
    T.img(x + (i - 2) * (size + 10), y, size, size, 'fivestar', col)
  end
end
T.bgGradient = function(top, mid, bot)
  local n = 18
  local h = T.H / n
  for i = 1, n do
    local t = (i - 0.5) / n
    local col
    if t < 0.58 then col = T.mix(top, mid, t / 0.58) else col = T.mix(mid, bot, (t - 0.58) / 0.42) end
    T.imgRaw(0, T.H / 2 - (i - 0.5) * h, T.W + 2, h + 1, 'rect', col)
  end
end

-- ---------- 数字/文本工具 ----------
-- UTF-8 字符数（#s 是字节数：中文标签按 # 算宽会放大 3 倍，出图实测溢出）
T.ulen = function(s)
  local n = 0
  for _ in string.gmatch(s or '', '[%z\1-\127\194-\244][\128-\191]*') do n = n + 1 end
  return n
end
T.fmt = function(n)
  local s = tostring(math.floor(n or 0))
  local out = s:reverse():gsub('(%d%d%d)', '%1,'):reverse()
  out = out:gsub('^,', '')
  return out
end
T.pad2 = function(n) return string.format('%02d', n) end
T.wrap = function(text, per)
  local out, line = {}, ''
  for ch in string.gmatch(text or '', '[%z\1-\127\194-\244][\128-\191]*') do
    line = line .. ch
    if #line >= per * 3 then out[#out + 1] = line; line = '' end
  end
  if line ~= '' then out[#out + 1] = line end
  return table.concat(out, '\n')
end
