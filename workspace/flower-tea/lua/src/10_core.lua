-- ============================================================================
-- 核心：画布/控件工厂/焦点/补间/弹层/转场/输入/音效
-- 设计坐标 1280x720，按 S=min(W/1280,H/720) 整体缩放。
-- 层序铁律：同一层里「后建的在上」；服务端 textbox 永远在运行时实例之下。
-- 因此每屏顺序固定：背景图 → 内容图 → 全部文字 → hits → 焦点框。
-- ============================================================================
T = T or {}
T.tpl = { prim = __GUID_PRIM__, label = __GUID_LABEL__, hit = __GUID_HIT__ }
T.ev = {}
T.controls, T.texts, T.items, T.hits, T.tweens, T.anims = {}, {}, {}, {}, {}, {}
T.overlays = {}
T.overlay = nil
T.focus = 0
T.mode = 'boot'
T.time = 0
T.frame = 0
T.transition = nil
T.toastCtl = nil
T.ambient = { handle = nil, timer = 0 }
T.lastAction, T.lastActionFrame = '', -1
T.seed = 20261028

T.log = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  print('[tea] ' .. table.concat(t, ' '))
end
T.warn = function(...)
  local t = {}
  for i = 1, select('#', ...) do t[#t + 1] = tostring(select(i, ...)) end
  print('[tea][warn] ' .. table.concat(t, ' '))
end

-- ---------- 随机数（确定性，用例可复现） ----------
T.setSeed = function(n) T.seed = n % 2147483648 end
T.rand = function(n)
  T.seed = (T.seed * 1103515245 + 12345) % 2147483648
  return math.floor(T.seed / 65536) % n + 1
end

-- ---------- 尺寸/颜色 ----------
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
  if not ok then T.warn('set ' .. tostring(key) .. ' :: ' .. tostring(err)) end
  return ok
end
T.tryCall = function(ctl, method, a, b)
  if not ctl then return false end
  local ok, err
  if b ~= nil then ok, err = pcall(function() ctl[method](ctl, a, b) end)
  elseif a ~= nil then ok, err = pcall(function() ctl[method](ctl, a) end)
  else ok, err = pcall(function() ctl[method](ctl) end) end
  if not ok then T.warn('call ' .. tostring(method) .. ' :: ' .. tostring(err)) end
  return ok
end
T.destroy = function(ctl)
  if not ctl then return false end
  return pcall(function() game.DestroyClientUIControl(ctl) end)
end
T.inst = function(guid)
  local ok, ctl = pcall(function() return game.InstantiateClientUIControl(guid, T.root) end)
  if not ok or not ctl then
    T.warn('instantiate fail guid=' .. tostring(guid) .. ' :: ' .. tostring(ctl))
    return nil
  end
  return ctl
end
T.setPos = function(ctl, x, y)
  if ctl then T.tryCall(ctl, 'SetAnchoredPosition', x * T.S, y * T.S) end
end
T.setSize = function(ctl, w, h)
  if ctl then T.tryCall(ctl, 'SetSizeDelta', math.max(1, w * T.S), math.max(1, h * T.S)) end
end
T.setColor = function(ctl, c)
  if ctl then T.trySet(ctl, 'imageColor', c) end
end

-- ---------- 图片工厂 ----------
T.img = function(x, y, w, h, shape, color, rot)
  local ctl = T.inst(T.tpl.prim)
  if not ctl then return nil end
  local id = T.SHAPE_ID[shape or 'rect'] or 100001
  local ok = pcall(function() ctl:SetImage(Enum.ImageSource.StaticReference, id) end)
  if not ok then T.warn('SetImage ' .. tostring(id)) end
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
T.textH = function(size, lines)
  lines = lines or 1
  return lines * size * 1.2 + size * 0.25 + 4
end
T.txt = function(x, y, w, h, size, text, color, align, valign, opts)
  opts = opts or {}
  local ctl = T.inst(T.tpl.label)
  if not ctl then return nil end
  local fs = math.max(8, math.floor(size * T.S + 0.5))
  local cw = math.max(12, math.floor(w * T.S + 0.5))
  local ch = math.max(fs + 4, math.floor(h * T.S + 0.5))
  local px = x
  if align == 'Left' then px = x + w / 2
  elseif align == 'Right' then px = x - w / 2 end
  T.tryCall(ctl, 'SetSizeDelta', cw, ch)
  T.tryCall(ctl, 'SetAnchoredPosition', px * T.S, y * T.S)
  T.trySet(ctl, 'fontSize', fs)
  T.trySet(ctl, 'fontColor', color or T.P.ink)
  T.trySet(ctl, 'text', text or '')
  T.trySet(ctl, 'enableOutline', opts.outline or T.opt.outline or false)
  T.trySet(ctl, 'outlineColor', opts.outlineColor or T.C(170, 255, 255, 255))
  if opts.bg then T.trySet(ctl, 'bgColor', opts.bg) end
  T.trySet(ctl, 'horizontalAlignment', align or 'Middle')
  T.trySet(ctl, 'verticalAlignment', valign or 'Middle')
  T.controls[#T.controls + 1] = ctl
  T.texts[#T.texts + 1] = ctl
  return ctl
end
T.txtAuto = function(x, y, w, size, text, color, align, opts)
  local lines = 1
  for _ in string.gmatch(text or '', '\n') do lines = lines + 1 end
  return T.txt(x, y, w, T.textH(size, lines) + 2, size, text, color, align, 'Middle', opts)
end
T.setTxt = function(ctl, text)
  if ctl then T.trySet(ctl, 'text', text) end
end
T.setTxtColor = function(ctl, color)
  if ctl then T.trySet(ctl, 'fontColor', color) end
end

-- ---------- 补间/逐帧 ----------
T.easeOut = function(t) return 1 - (1 - t) * (1 - t) * (1 - t) end
T.easeIn = function(t) return t * t end
T.easeInOut = function(t) return t < 0.5 and 2 * t * t or 1 - (-2 * t + 2) ^ 2 / 2 end
T.easeBack = function(t)
  local c1, c3 = 1.70158, 2.70158
  return 1 + c3 * (t - 1) ^ 3 + c1 * (t - 1) ^ 2
end
T.tween = function(dur, fn, done, ease, ui)
  local tw = { t = 0, dur = math.max(0.001, dur), fn = fn, done = done, ease = ease or T.easeOut, ui = ui }
  T.tweens[#T.tweens + 1] = tw
  return tw
end
T.after = function(dur, fn, ui)
  return T.tween(dur, function() end, fn, nil, ui)
end
T.anim = function(fn)
  T.anims[#T.anims + 1] = fn
end

-- ---------- 逐帧更新（OnUpdate 调） ----------
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
        list[i] = nil
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
        alist[i] = nil
      elseif keep == false then
        alist[i] = nil
      end
    end
  end
  T.updateTransition(dt)
  T.updateAmbient(dt)
  if T.screen and T.screen.update and not (T.overlay and T.overlay.pausesGame) then
    local ok, err = pcall(T.screen.update, dt)
    if not ok then T.warn('screen update :: ' .. tostring(err)) end
  end
end

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
  if not T.ev.CursorDown then
    local e = (type(Enum) == 'table' and Enum.CursorEventType) or nil
    T.ev.CursorDown = e and e.CursorDown or 'CursorDown'
    T.ev.CursorUp = e and e.CursorUp or 'CursorUp'
    T.ev.CursorClick = e and e.CursorClick or 'CursorClick'
    T.ev.CursorEnter = e and e.CursorEnter or 'CursorEnter'
    T.ev.CursorExit = e and e.CursorExit or 'CursorExit'
  end
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
    if opts.clickSfx ~= false then T.sfx(T.SFX.click) end
    if opts.onClick then opts.onClick(data) end
  end)
  add(T.ev.CursorEnter, function(data)
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
  o.offX, o.offY = 0, 0
  T.items[#T.items + 1] = o
  local idx = #T.items
  o.index = idx
  if o.name then
    o.hit = T.hit(o.name, o.x, o.y, o.w, o.h, {
      onEnter = function(data) T.setFocus(idx) end,
      onDown = function(data)
        if o.onDown then o.onDown(data) end
      end,
      onUp = function(data)
        if o.onUp then o.onUp(data) end
      end,
      onClick = function(data)
        T.setFocus(idx, true)
        if o.onConfirm then o.onConfirm() end
      end,
      clickSfx = o.clickSfx,
    })
  end
  return o
end
T.updateFocusFrame = function()
  local f = T.focusFrame
  if not f then return end
  local it = T.items[T.focus]
  if not it then
    for i = 1, 8 do T.setPos(f[i], 0, -100000) end
    return
  end
  local pad = it.focusPad or 6
  local x, y, w, h = it.x + (it.offX or 0), it.y + (it.offY or 0), it.w + pad * 2, it.h + pad * 2
  local t = 2.4
  local halfH = h / 2
  local halfW = w / 2
  T.setSize(f[1], w, t); T.setPos(f[1], x, y + halfH)
  T.setSize(f[2], w, t); T.setPos(f[2], x, y - halfH)
  T.setSize(f[3], t, h); T.setPos(f[3], x - halfW, y)
  T.setSize(f[4], t, h); T.setPos(f[4], x + halfW, y)
  local r = 5
  T.setSize(f[5], r * 2, r * 2); T.setPos(f[5], x - halfW, y + halfH)
  T.setSize(f[6], r * 2, r * 2); T.setPos(f[6], x + halfW, y + halfH)
  T.setSize(f[7], r * 2, r * 2); T.setPos(f[7], x - halfW, y - halfH)
  T.setSize(f[8], r * 2, r * 2); T.setPos(f[8], x + halfW, y - halfH)
end
T.makeFocusFrame = function()
  local col = T.P.gold
  local f = {}
  for i = 1, 4 do f[i] = T.img(0, -100000, 10, 2.4, 'rect', col) end
  for i = 5, 8 do f[i] = T.img(0, -100000, 10, 10, 'circle', col) end
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
  if not T.focus then T.focus = 1 end
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
    -- 边界回绕：选该方向上最远的一项
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
  T.log('clear screen destroyed=' .. n .. ' fail=' .. fail)
  T.controls, T.texts, T.items, T.hits = {}, {}, {}, {}
  T.tweens, T.anims = {}, {}
  T.focus = 0
  T.focusFrame = nil
  T.screen = nil
  T.overlay = nil
  T.overlays = {}
  T.toastCtl = nil
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
  if name ~= 'game' then T.game = nil end
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

-- ---------- 转场（不依赖 image alpha：用不透明幕布滑入/滑出） ----------
T.transitionPanels = function(yoff)
  local ps = {}
  ps[1] = T.imgRaw(0, yoff, T.W, T.H, 'rect', T.P.cream)
  ps[2] = T.imgRaw(0, yoff + T.H / 2 - 12, T.W, 24, 'rect', T.P.rose)
  ps[3] = T.imgRaw(0, yoff + T.H / 2 - 30, T.W, 8, 'rect', T.P.goldLight)
  return ps
end
T.movePanels = function(ps, yoff)
  if not ps then return end
  for i = 1, #ps do
    local base = (i == 1) and 0 or ((i == 2) and (T.H / 2 - 12) or (T.H / 2 - 30))
    if ps[i] then T.tryCall(ps[i], 'SetAnchoredPosition', 0, yoff + base) end
  end
end
T.destroyPanels = function(ps)
  if not ps then return end
  for i = 1, #ps do T.destroy(ps[i]) end
end
T.go = function(name, params)
  if T.transition then return end
  T.transition = { phase = 'cover', t = 0, dur = 0.16, name = name, params = params, panels = T.transitionPanels(-T.H) }
  T.sfx(T.SFX.confirm)
end
T.updateTransition = function(dt)
  local tr = T.transition
  if not tr then return end
  tr.t = tr.t + dt
  if tr.phase == 'cover' then
    local k = math.min(1, tr.t / tr.dur)
    T.movePanels(tr.panels, -T.H + T.easeOut(k) * T.H)
    if k >= 1 then
      T.destroyPanels(tr.panels)
      tr.panels = nil
      T.clearScreen()
      local ok, err = pcall(T.build, tr.name, tr.params)
      if not ok then T.warn('transition build :: ' .. tostring(err)) end
      tr.phase, tr.t, tr.dur = 'reveal', 0, 0.22
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
  T.screen.key = opts.key or T.screen.key
  T.log('overlay=' .. name, 'items=' .. #T.items, 'controls=' .. #T.controls,
    'pause=' .. tostring(opts.pausesGame and true or false))
end
T.closeOverlay = function()
  local o = table.remove(T.overlays)
  if not o then return end
  for i = #T.controls, o.controlsStart, -1 do
    local ctl = T.controls[i]
    if ctl then pcall(function() game.DestroyClientUIControl(ctl) end) end
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

-- ---------- Toast ----------
T.toast = function(text, color)
  if T.toastSet then
    for i = #T.controls, 1, -1 do
      local c = T.controls[i]
      for _, tc in ipairs(T.toastSet) do
        if c == tc then T.controls[i] = nil; T.destroy(c); break end
      end
    end
    T.toastSet = nil
  end
  local panel = T.img(0, 300, 520, 52, 'rect', T.P.roseDeep)
  local sub = T.img(0, 300, 512, 44, 'rect', T.P.cream)
  local label = T.txt(0, 300, 480, 40, 20, text, color or T.P.roseDeep, 'Middle', 'Middle')
  T.toastCtl = panel
  T.toastSet = { panel, sub, label }
  local ps = { panel, sub, label }
  local function move(dy)
    for i = 1, #ps do
      local c = ps[i]
      if c then T.tryCall(c, 'SetAnchoredPosition', 0, (300 + dy) * T.S) end
    end
  end
  move(40)
  T.tween(0.25, function(k) move(40 * (1 - k)) end, function()
    T.after(1.6, function()
      T.tween(0.25, function(k) move(40 * k) end, function()
        for i = 1, #ps do
          local c = ps[i]
          if c then
            for j = #T.controls, 1, -1 do if T.controls[j] == c then table.remove(T.controls, j) end end
            T.destroy(c)
          end
        end
        T.toastCtl = nil
        T.toastSet = nil
      end, nil, true)
    end, true)
  end, nil, true)
end

-- ---------- 成就 ----------
T.unlock = function(id)
  if T.records.achv[id] then return end
  T.records.achv[id] = true
  local a = T.achievementById[id]
  if a then T.toast('手账解锁 · ' .. a.name, T.P.roseDeep) end
  T.log('achievement', id)
end

-- ---------- 背景/装饰通用 ----------
T.bgGradient = function(top, mid, bot)
  local n = 16
  local h = T.H / n
  for i = 1, n do
    local t = (i - 0.5) / n
    local col
    if t < 0.55 then col = T.mix(top, mid, t / 0.55) else col = T.mix(mid, bot, (t - 0.55) / 0.45) end
    T.imgRaw(0, T.H / 2 - (i - 0.5) * h, T.W + 2, h + 1, 'rect', col)
  end
end
T.cloud = function(x, y, s, color)
  T.img(x, y, 120 * s, 56 * s, 'circle', color)
  T.img(x - 55 * s, y - 10 * s, 76 * s, 44 * s, 'circle', color)
  T.img(x + 62 * s, y - 6 * s, 88 * s, 48 * s, 'circle', color)
  T.img(x + 8 * s, y + 18 * s, 70 * s, 38 * s, 'circle', color)
end
T.flower = function(x, y, r, color, center)
  for i = 0, 4 do
    local a = (i / 5) * math.pi * 2 - math.pi / 2
    T.img(x + math.cos(a) * r, y + math.sin(a) * r, r * 1.15, r * 1.15, 'circle', color)
  end
  T.img(x, y, r * 0.9, r * 0.9, 'circle', center or T.P.butter)
end
T.leaf = function(x, y, w, h, color, rot)
  T.img(x, y, w, h, 'triangle', color, rot or 0)
end
T.sparkle = function(x, y, s, color)
  T.img(x, y, s, s, 'fourstar', color)
end
T.stars = function(x, y, n, size, color, emptyColor)
  for i = 1, 5 do
    local col = i <= n and color or (emptyColor or T.P.line)
    T.img(x + (i - 3) * (size + 8), y, size, size, 'fivestar', col)
  end
end
T.starRow = function(x, y, n, size, color, emptyColor)
  for i = 1, 3 do
    local col = i <= n and color or (emptyColor or T.P.line)
    T.img(x + (i - 2) * (size + 10), y, size, size, 'fivestar', col)
  end
end
