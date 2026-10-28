-- ============================================================================
-- 美术：背景 / 立绘 / 茶桌 / 标题 / 花瓣
-- 只有六种图元，所以靠分层、配色、图案组合出「剪纸花园」风。
-- ============================================================================
T = T or {}

T.SKIN = T.C(255, 255, 231, 216)
T.SKIN2 = T.C(255, 242, 201, 183)
T.BLUSH = T.C(255, 247, 168, 184)
T.INK = T.C(255, 74, 58, 74)
T.WHITE = T.C(255, 255, 255, 255)

-- ---------- 背景 ----------
T.bgGarden = function(kind, sunX)
  kind = kind or 'default'
  local top, mid, bot, sun
  if kind == 'snow' then
    top, mid, bot, sun = T.C(255, 233, 246, 255), T.C(255, 245, 250, 255), T.C(255, 222, 240, 248), T.C(255, 255, 244, 206)
  elseif kind == 'dusk' then
    top, mid, bot, sun = T.C(255, 240, 232, 252), T.C(255, 243, 231, 248), T.C(255, 226, 218, 242), T.C(255, 255, 214, 160)
  elseif kind == 'dream' then
    top, mid, bot, sun = T.C(255, 255, 238, 246), T.C(255, 255, 229, 241), T.C(255, 242, 222, 238), T.C(255, 255, 224, 196)
  elseif kind == 'garden' then
    top, mid, bot, sun = T.C(255, 238, 250, 238), T.C(255, 247, 253, 234), T.C(255, 222, 243, 223), T.C(255, 255, 239, 189)
  else
    top, mid, bot, sun = T.P.bgTop, T.P.bgMid, T.P.bgBot, T.P.butterLight
  end
  T.bgGradient(top, mid, bot)
  -- 远处的大太阳
  local sx = sunX or 0
  T.imgRaw(sx, T.H * 0.20, 240 * T.S, 240 * T.S, 'circle', sun)
  T.imgRaw(sx, T.H * 0.20, 300 * T.S, 300 * T.S, 'ring', T.P.goldLight)
  -- 云
  local cy = T.H * 0.74
  T.cloudRaw(-T.W * 0.30, cy, 1.1 * T.S, T.C(255, 255, 252, 250))
  T.cloudRaw(T.W * 0.34, cy - 40 * T.S, 0.85 * T.S, T.C(255, 255, 252, 250))
  -- 远近山丘（大圆）
  T.imgRaw(-T.W * 0.36, -T.H * 0.56, T.W * 0.95, T.W * 0.95, 'circle', T.C(255, 214, 237, 223))
  T.imgRaw(T.W * 0.34, -T.H * 0.62, T.W * 0.90, T.W * 0.90, 'circle', T.C(255, 197, 228, 211))
  T.imgRaw(T.W * 0.02, -T.H * 0.70, T.W * 1.15, T.W * 0.78, 'circle', T.C(255, 180, 218, 197))
  -- 花田
  local y = -T.H * 0.46
  for i = 1, 9 do
    local x = -T.W * 0.46 + (i - 1) * T.W * 0.115
    T.flowerRaw(x, y + (i % 3) * 3 * T.S, (10 + (i % 4) * 3) * T.S, T.P.rose)
  end
  for i = 1, 7 do
    local x = -T.W * 0.40 + (i - 1) * T.W * 0.13
    T.flowerRaw(x, y - 22 * T.S, (8 + (i % 3) * 2) * T.S, T.P.butter)
  end
end

-- 不缩放坐标的花（用于满屏装饰）
T.cloudRaw = function(x, y, s, color)
  T.imgRaw(x, y, 120 * s, 56 * s, 'circle', color)
  T.imgRaw(x - 55 * s, y - 10 * s, 76 * s, 44 * s, 'circle', color)
  T.imgRaw(x + 62 * s, y - 6 * s, 88 * s, 48 * s, 'circle', color)
  T.imgRaw(x + 8 * s, y + 18 * s, 70 * s, 38 * s, 'circle', color)
end
T.flowerRaw = function(x, y, r, color, center)
  for i = 0, 4 do
    local a = (i / 5) * math.pi * 2 - math.pi / 2
    T.imgRaw(x + math.cos(a) * r, y + math.sin(a) * r, r * 1.1, r * 1.1, 'circle', color)
  end
  T.imgRaw(x, y, r * 0.85, r * 0.85, 'circle', center or T.P.butter)
end

T.petals = function(n, areaY, colors)
  local m = T.opt.motion or 2
  n = math.max(3, math.floor(n * (m == 1 and 0.55 or (m == 3 and 1.45 or 1))))
  colors = colors or { T.P.rose, T.P.butter, T.P.mint, T.P.lilac }
  local list = {}
  for i = 1, n do
    local x = (T.rand(1000) / 1000 - 0.5) * T.W * 0.92
    local y = (areaY or 0) + (T.rand(1000) / 1000 - 0.5) * T.H * 0.85
    local s = (6 + T.rand(7)) * T.S
    local ctl = T.imgRaw(x, y, s, s, (i % 3 == 0) and 'fourstar' or 'circle', colors[i % #colors + 1], T.rand(360))
    list[#list + 1] = { ctl = ctl, x = x, y = y, ph = T.rand(628) / 100, sp = 0.25 + T.rand(40) / 100,
      amp = (8 + T.rand(22)) * T.S, rot = T.rand(360) }
  end
  T.anim(function(dt, time)
    for _, p in ipairs(list) do
      local y = p.y + math.sin(time * p.sp + p.ph) * p.amp
      local x = p.x + math.cos(time * p.sp * 0.7 + p.ph) * p.amp * 0.45
      T.tryCall(p.ctl, 'SetAnchoredPosition', x, y)
      T.trySet(p.ctl, 'localRotationZ', p.rot + time * 18)
    end
  end)
  return list
end

-- ---------- 立绘数据 ----------
-- 局部坐标：头中心 (0,38)，总高约 240。shape: rect/circle/triangle/fourstar/fivestar/ring
T.portraitShapes = function(id)
  local common = {
    -- 后发
    { 0, 36, 154, 162, 'circle', 'deep' },
    { -68, 4, 48, 72, 'circle', 'main' }, { 68, 4, 48, 72, 'circle', 'main' },
    -- 身体
    { 0, -72, 96, 84, 'circle', 'main' },
    { 0, -105, 140, 100, 'triangle', 'main', 0, 'skirt' },
    { -58, -64, 30, 40, 'circle', 'light' }, { 58, -64, 30, 40, 'circle', 'light' },
    { 0, -40, 82, 34, 'circle', 'light' },
    { -46, -84, 34, 54, 'circle', 'main' }, { 46, -84, 34, 54, 'circle', 'main' },
    -- 脖子/脸/耳朵
    { 0, -14, 26, 34, 'rect', 'skin2' },
    { 0, 38, 114, 120, 'circle', 'skin' },
    { -57, 34, 20, 25, 'circle', 'skin' }, { 57, 34, 20, 25, 'circle', 'skin' },
    -- 刘海
    { -40, 80, 50, 42, 'circle', 'main' }, { 0, 88, 56, 46, 'circle', 'main' },
    { 40, 80, 50, 42, 'circle', 'main' },
    { -53, 46, 30, 72, 'triangle', 'main', -10 }, { 53, 46, 30, 72, 'triangle', 'main', 10 },
    -- 眼睛
    { -24, 39, 15, 20, 'circle', 'ink', 0, 'eye' }, { 24, 39, 15, 20, 'circle', 'ink', 0, 'eye' },
    { -21, 44, 5.5, 5.5, 'circle', 'white', 0, 'eyehi' }, { 27, 44, 5.5, 5.5, 'circle', 'white', 0, 'eyehi' },
    { -27, 34, 3, 3, 'circle', 'white', 0, 'eyehi' }, { 21, 34, 3, 3, 'circle', 'white', 0, 'eyehi' },
    -- 眉毛
    { -24, 56, 19, 3, 'rect', 'deep', -6 }, { 24, 56, 19, 3, 'rect', 'deep', 6 },
    -- 腮红/嘴
    { -38, 19, 20, 9, 'circle', 'blush' }, { 38, 19, 20, 9, 'circle', 'blush' },
    { 0, 27, 3, 2, 'circle', 'skin2' },
    { -3, 13, 6, 4, 'triangle', 'roseDeep' }, { 3, 13, 6, 4, 'triangle', 'roseDeep' },
    -- 闭眼线条（平时停在屏幕外）
    { -24, 39, 17, 3, 'rect', 'ink', 0, 'blink' }, { 24, 39, 17, 3, 'rect', 'ink', 0, 'blink' },
  }
  local extra = {}
  if id == 1 then
    extra = {
      -- 甘雨：角、清心发饰、长发、铃铛
      { -72, -50, 26, 94, 'circle', 'main' }, { 72, -50, 26, 94, 'circle', 'main' },
      { -40, 108, 24, 48, 'triangle', 'goldLight', -12 }, { 40, 108, 24, 48, 'triangle', 'goldLight', 12 },
      { -40, 112, 12, 32, 'triangle', 'butterDeep', -12 }, { 40, 112, 12, 32, 'triangle', 'butterDeep', 12 },
      { -36, 94, 16, 10, 'circle', 'deep' }, { 36, 94, 16, 10, 'circle', 'deep' },
      { 0, -52, 10, 10, 'circle', 'gold' },
      { 40, -34, 16, 16, 'circle', 'gold' },
    }
    for i = 0, 4 do
      local a = i / 5 * math.pi * 2
      extra[#extra + 1] = { 54 + math.cos(a) * 10, 76 + math.sin(a) * 10, 12, 12, 'circle', 'rose' }
    end
    extra[#extra + 1] = { 54, 76, 9, 9, 'circle', 'gold' }
  elseif id == 2 then
    extra = {
      -- 刻晴：双马尾、猫耳发髻、金发簪、紫裙金边
      { -100, 6, 62, 120, 'circle', 'main' }, { 100, 6, 62, 120, 'circle', 'main' },
      { -108, -64, 44, 80, 'circle', 'deep' }, { 108, -64, 44, 80, 'circle', 'deep' },
      { -47, 108, 42, 46, 'triangle', 'deep', -16 }, { 47, 108, 42, 46, 'triangle', 'deep', 16 },
      { -47, 108, 22, 28, 'triangle', 'light', -16 }, { 47, 108, 22, 28, 'triangle', 'light', 16 },
      { 56, 86, 38, 6, 'rect', 'gold', 22 },
      { 0, -96, 8, 36, 'rect', 'gold' }, { 0, -78, 26, 7, 'rect', 'gold' },
      { -58, -56, 14, 14, 'circle', 'goldLight' }, { 58, -56, 14, 14, 'circle', 'goldLight' },
    }
  elseif id == 3 then
    extra = {
      -- 少女：大蝴蝶结、长卷发、星星发饰、荷叶边
      { -80, -40, 54, 128, 'circle', 'main' }, { 80, -40, 54, 128, 'circle', 'main' },
      { 40, 94, 30, 26, 'circle', 'rose' }, { 66, 94, 30, 26, 'circle', 'rose' },
      { 53, 94, 14, 14, 'circle', 'roseDeep' },
      { 46, 74, 9, 24, 'triangle', 'rose', -18 }, { 60, 74, 9, 24, 'triangle', 'rose', 18 },
      { 56, 74, 16, 16, 'fourstar', 'goldLight' },
      { 0, -60, 22, 22, 'circle', 'goldLight' }, { 0, -60, 10, 10, 'circle', 'gold' },
      { -34, -128, 18, 18, 'circle', 'light' }, { 0, -136, 18, 18, 'circle', 'light' }, { 34, -128, 18, 18, 'circle', 'light' },
    }
  elseif id == 4 then
    extra = {
      -- 小草神：叶芽、尖耳、白绿长裙、金色小铃
      { -66, 26, 30, 44, 'triangle', 'skin', -24 }, { 66, 26, 30, 44, 'triangle', 'skin', 24 },
      { -66, 26, 15, 26, 'triangle', 'blush', -24 }, { 66, 26, 15, 26, 'triangle', 'blush', 24 },
      { 0, 116, 8, 26, 'rect', 'deep' },
      { -12, 126, 26, 18, 'circle', 'mint' }, { 12, 128, 24, 16, 'circle', 'mint' },
      { 0, 134, 10, 10, 'circle', 'butter' },
      { -74, -46, 26, 100, 'circle', 'light' }, { 74, -46, 26, 100, 'circle', 'light' },
      { -38, 88, 20, 34, 'triangle', 'light', -18 }, { 38, 88, 20, 34, 'triangle', 'light', 18 },
      { 0, -46, 12, 12, 'circle', 'gold' },
      { -28, -128, 16, 16, 'circle', 'light' }, { 0, -138, 16, 16, 'circle', 'light' }, { 28, -128, 16, 16, 'circle', 'light' },
    }
  end
  for i = 1, #extra do common[#common + 1] = extra[i] end
  return common
end

T.portraitPalette = function(ch)
  return {
    main = ch.main, deep = ch.deep, light = ch.light, accent = ch.accent,
    skin = T.SKIN, skin2 = T.SKIN2, blush = T.BLUSH, ink = T.INK,
    white = T.WHITE, gold = T.P.gold, goldLight = T.P.goldLight, butter = T.P.butter,
    butterDeep = T.P.butterDeep, goldDeep = T.P.butterDeep, rose = T.P.rose,
    roseDeep = T.P.roseDeep, mint = T.P.mint, line = T.P.line,
  }
end

T.portrait = function(cx, cy, s, ch, opts)
  opts = opts or {}
  local shapes = T.portraitShapes(ch.id)
  local pal = T.portraitPalette(ch)
  local parts, byTag = {}, {}
  for _, sh in ipairs(shapes) do
    local x, y = cx + sh[1] * s, cy + sh[2] * s
    local w, h = sh[3] * s, sh[4] * s
    local rot = sh[7] or 0
    local tag = sh[8]
    if not (opts.bust and tag == 'skirt') then
      local parked = (tag == 'blink')
      local ctl = T.img(x, parked and (cy - 1000) or y, w, h, sh[5], pal[sh[6]], rot)
      if ctl then
        local p = { ctl = ctl, x = x, y = y, w = w, h = h, tag = tag, parked = parked }
        parts[#parts + 1] = p
        if tag then byTag[tag] = byTag[tag] or {}; table.insert(byTag[tag], p) end
      end
    end
  end
  if opts.idle ~= false then
    local phase = (ch.id * 1.7) % 6.28
    local amp = 2.2 * s * (T.opt.motion == 1 and 0.6 or (T.opt.motion == 3 and 1.25 or 1))
    local blinkT, nextBlink, blinkOn = 0, 3 + ch.id, false
    T.anim(function(dt, time)
      local bob = math.sin(time * 1.5 + phase) * amp
      for _, p in ipairs(parts) do
        if not p.parked then T.tryCall(p.ctl, 'SetAnchoredPosition', p.x * T.S, (p.y + bob) * T.S) end
      end
      if opts.blink ~= false then
        nextBlink = nextBlink - dt
        if nextBlink <= 0 and blinkT <= 0 then blinkT = 0.11; nextBlink = 3.2 + T.rand(30) / 10 end
        if blinkT > 0 then
          blinkT = blinkT - dt
          local eyes, lines = byTag.eye, byTag.blink
          if lines then
            if not blinkOn then
              blinkOn = true
              for _, p in ipairs(lines) do
                T.tryCall(p.ctl, 'SetAnchoredPosition', p.x * T.S, (p.y + bob) * T.S)
              end
            end
          end
          -- 眼睛 + 高光：临时移出画布
          for _, p in ipairs(parts) do
            if p.tag == 'eye' or p.tag == 'eyehi' then
              T.tryCall(p.ctl, 'SetAnchoredPosition', p.x * T.S, -1000)
            end
          end
          if blinkT <= 0 then
            blinkOn = false
            for _, p in ipairs(parts) do
              if p.tag == 'eye' or p.tag == 'eyehi' then T.tryCall(p.ctl, 'SetAnchoredPosition', p.x * T.S, (p.y + bob) * T.S) end
              if p.tag == 'blink' then T.tryCall(p.ctl, 'SetAnchoredPosition', p.x * T.S, -1000) end
            end
          end
        end
      end
    end)
  end
  return parts
end

-- ---------- 圆形角色徽章 ----------
T.medallion = function(cx, cy, r, ch, s, opts)
  opts = opts or {}
  T.img(cx, cy, r * 2 + 16, r * 2 + 16, 'circle', T.P.cream)
  T.img(cx, cy, r * 2 + 6, r * 2 + 6, 'circle', ch.light)
  T.img(cx, cy, r * 2 + 2, r * 2 + 2, 'circle', ch.main)
  T.img(cx, cy, r * 2 - 4, r * 2 - 4, 'circle', T.P.cream)
  opts.bust = opts.bust ~= false
  local parts = T.portrait(cx, cy - r * 0.12, (s or 0.62) * r / 80, ch, opts)
  return parts
end

-- ---------- 窗内茶会小人 ----------
T.teaHeads = function(cx, cy, s)
  s = s or 1
  local spots = { { -170, -26, 1 }, { 170, -26, 2 }, { -64, 52, 3 }, { 64, 52, 4 } }
  for _, p in ipairs(spots) do
    local ch = T.chars[p[3]]
    local x, y = cx + p[1] * s, cy + p[2] * s
    T.img(x, y, 66 * s, 66 * s, 'circle', ch.deep)
    T.img(x, y - 5 * s, 46 * s, 50 * s, 'circle', T.SKIN)
    T.img(x, y + 22 * s, 54 * s, 24 * s, 'circle', ch.main)
    T.img(x - 15 * s, y + 18 * s, 24 * s, 18 * s, 'circle', ch.main)
    T.img(x + 15 * s, y + 18 * s, 24 * s, 18 * s, 'circle', ch.main)
    T.img(x - 8 * s, y - 4 * s, 4 * s, 6 * s, 'circle', T.INK)
    T.img(x + 8 * s, y - 4 * s, 4 * s, 6 * s, 'circle', T.INK)
    T.img(x - 15 * s, y - 13 * s, 9 * s, 4 * s, 'circle', T.BLUSH)
    T.img(x + 15 * s, y - 13 * s, 9 * s, 4 * s, 'circle', T.BLUSH)
    if ch.id == 1 then
      T.img(x - 24 * s, y + 30 * s, 8 * s, 16 * s, 'triangle', T.P.goldLight, -12)
      T.img(x + 24 * s, y + 30 * s, 8 * s, 16 * s, 'triangle', T.P.goldLight, 12)
    elseif ch.id == 2 then
      T.img(x - 26 * s, y + 28 * s, 12 * s, 16 * s, 'triangle', ch.deep, -18)
      T.img(x + 26 * s, y + 28 * s, 12 * s, 16 * s, 'triangle', ch.deep, 18)
    elseif ch.id == 3 then
      T.img(x, y + 32 * s, 20 * s, 12 * s, 'circle', T.P.rose)
    else
      T.img(x, y + 34 * s, 6 * s, 14 * s, 'rect', T.P.mintDeep)
      T.img(x - 7 * s, y + 40 * s, 12 * s, 8 * s, 'circle', T.P.mint)
      T.img(x + 7 * s, y + 40 * s, 12 * s, 8 * s, 'circle', T.P.mint)
    end
  end
end

-- ---------- 茶桌小景 ----------
T.teaTable = function(cx, cy, s)
  s = s or 1
  -- 桌面
  T.img(cx, cy, 300 * s, 26 * s, 'rect', T.P.paper)
  T.img(cx, cy - 14 * s, 280 * s, 12 * s, 'rect', T.P.line)
  T.img(cx - 90 * s, cy - 40 * s, 10 * s, 50 * s, 'rect', T.P.butterDeep)
  T.img(cx + 90 * s, cy - 40 * s, 10 * s, 50 * s, 'rect', T.P.butterDeep)
  -- 茶壶
  T.img(cx, cy + 40 * s, 48 * s, 40 * s, 'circle', T.P.cream)
  T.img(cx, cy + 58 * s, 20 * s, 12 * s, 'circle', T.P.rose)
  T.img(cx + 26 * s, cy + 46 * s, 12 * s, 14 * s, 'ring', T.P.butterDeep)
  T.img(cx + 26 * s, cy + 44 * s, 26 * s, 8 * s, 'rect', T.P.cream, -20)
  -- 杯子
  for i = -1, 1 do
    local x = cx + i * 78 * s
    T.img(x, cy + 20 * s, 30 * s, 24 * s, 'circle', T.P.cream)
    T.img(x, cy + 24 * s, 20 * s, 11 * s, 'circle', i == 0 and T.P.rose or T.P.mint)
    T.img(x + 17 * s, cy + 20 * s, 9 * s, 13 * s, 'ring', T.P.butterDeep)
  end
  -- 茶点
  T.img(cx - 48 * s, cy + 10 * s, 34 * s, 34 * s, 'circle', T.P.butter)
  T.img(cx - 48 * s, cy + 10 * s, 16 * s, 16 * s, 'circle', T.P.rose)
  T.img(cx + 48 * s, cy + 10 * s, 30 * s, 30 * s, 'circle', T.P.lilac)
  T.img(cx + 48 * s, cy + 10 * s, 14 * s, 14 * s, 'fourstar', T.P.white)
  -- 蒸汽
  for i = -1, 1 do
    local x = cx + i * 20 * s
    local a = T.img(x, cy + 76 * s, 18 * s, 18 * s, 'circle', T.P.white)
    if a then
      local baseY = cy + 76 * s
      T.anim(function(dt, time)
        local k = (time * 0.35 + i * 0.2) % 1
        T.tryCall(a, 'SetAnchoredPosition', (x + math.sin(time * 1.3 + i) * 5 * s) * T.S, (baseY + k * 50 * s) * T.S)
      end)
    end
  end
end


-- ---------- 大茶点（图鉴/详情用） ----------
T.dessertArt = function(cx, cy, s, id)
  local d = T.desserts[id]
  if not d then return end
  T.img(cx, cy, 160 * s, 160 * s, 'circle', d.base)
  T.img(cx, cy, 122 * s, 122 * s, 'circle', d.inner)
  T.img(cx, cy, 72 * s, 72 * s, d.icon, d.deep)
  if id == 1 then
    T.img(cx, cy + 18 * s, 140 * s, 140 * s, 'circle', d.base)
    T.img(cx, cy - 18 * s, 140 * s, 140 * s, 'circle', d.base)
    T.img(cx, cy, 132 * s, 22 * s, 'rect', T.P.cream)
    T.img(cx - 42 * s, cy + 46 * s, 26 * s, 26 * s, 'circle', T.P.white)
  elseif id == 2 then
    T.img(cx + 24 * s, cy + 30 * s, 26 * s, 26 * s, 'circle', T.P.roseDeep)
    T.img(cx + 30 * s, cy + 38 * s, 8 * s, 8 * s, 'circle', T.P.white)
  elseif id == 3 then
    T.img(cx - 58 * s, cy, 30 * s, 42 * s, 'triangle', d.deep, 24)
    T.img(cx + 58 * s, cy, 30 * s, 42 * s, 'triangle', d.deep, -24)
    T.img(cx, cy, 20 * s, 20 * s, 'circle', T.P.white)
  elseif id == 4 then
    T.img(cx + 60 * s, cy, 34 * s, 34 * s, 'ring', d.deep)
    T.img(cx, cy + 26 * s, 10 * s, 10 * s, 'circle', T.P.white)
  else
    T.img(cx, cy, 28 * s, 28 * s, 'circle', T.P.butterDeep)
    T.img(cx, cy, 12 * s, 12 * s, 'circle', T.P.white)
  end
end

-- ---------- 标题 ----------
T.titleLogo = function(cx, cy, scale)
  scale = scale or 1
  local chars = { '花', '间', '茶', '会' }
  local gap = 92 * scale
  for i = 1, 4 do
    T.txt(cx + (i - 2.5) * gap, cy, 110 * scale, 130 * scale, 78 * scale, chars[i],
      T.P.ink, 'Middle', 'Middle')
  end
  T.img(cx - 2.5 * gap, cy - 62 * scale, 4.2 * gap, 2.4, 'rect', T.P.gold)
  T.txt(cx, cy - 88 * scale, 460 * scale, 28 * scale, 15 * scale, 'BLOSSOM  &  TEA',
    T.P.ink2, 'Middle', 'Middle')
  T.txt(cx, cy - 116 * scale, 460 * scale, 28 * scale, 14 * scale, '四时花事 · 一席清茶',
    T.P.ink2, 'Middle', 'Middle')
  -- 标题花饰
  T.flower(cx + 2.6 * gap, cy + 40 * scale, 12 * scale, T.P.rose, T.P.butter)
  T.img(cx + 2.6 * gap + 18 * scale, cy + 54 * scale, 13 * scale, 13 * scale, 'fourstar', T.P.goldLight)
  T.img(cx - 2.6 * gap - 18 * scale, cy + 54 * scale, 13 * scale, 13 * scale, 'fourstar', T.P.mint)
end

-- ---------- 章节小景 ----------
T.chapterArt = function(cx, cy, w, h, ch)
  local id = ch.id or 1
  T.img(cx, cy, w, h, 'rect', ch.light or T.P.skyLight)
  T.img(cx, cy, w + 6, h + 6, 'rect', T.P.cream)
  T.img(cx, cy, w, h, 'rect', ch.light or T.P.skyLight)
  T.img(cx + w * 0.24, cy + h * 0.23, w * 0.26, w * 0.26, 'circle', T.P.butterLight)
  T.img(cx - w * 0.18, cy - h * 0.30, w * 0.66, h * 0.46, 'circle', T.P.cream)
  T.img(cx + w * 0.22, cy - h * 0.34, w * 0.58, h * 0.40, 'circle', ch.light or T.P.mint)
  if id == 1 then
    T.img(cx - w * 0.02, cy - h * 0.22, w * 0.36, h * 0.28, 'triangle', T.C(255, 246, 252, 255))
    T.img(cx + w * 0.05, cy - h * 0.20, w * 0.30, h * 0.22, 'triangle', T.C(255, 226, 242, 250), 180)
    T.img(cx + w * 0.02, cy + h * 0.12, w * 0.16, w * 0.16, 'fourstar', T.P.white)
  elseif id == 2 then
    T.img(cx + w * 0.04, cy + h * 0.38, w * 0.02, h * 0.18, 'rect', T.P.goldLight)
    T.img(cx + w * 0.04, cy + h * 0.14, w * 0.24, h * 0.24, 'circle', T.P.gold)
    T.img(cx + w * 0.04, cy + h * 0.14, w * 0.16, h * 0.16, 'circle', T.P.butterLight)
    T.img(cx + w * 0.04, cy - h * 0.02, w * 0.06, h * 0.05, 'rect', T.P.gold)
    T.img(cx + w * 0.04, cy - h * 0.14, w * 0.03, h * 0.10, 'rect', T.P.roseDeep)
    T.img(cx + w * 0.28, cy + h * 0.30, w * 0.12, w * 0.12, 'fourstar', T.P.butter)
  elseif id == 3 then
    T.flower(cx + w * 0.02, cy + h * 0.02, w * 0.07, T.P.rose, T.P.butter)
    T.img(cx - w * 0.18, cy - h * 0.20, w * 0.16, w * 0.16, 'fourstar', T.P.white)
    T.img(cx + w * 0.22, cy + h * 0.16, w * 0.10, w * 0.10, 'fourstar', T.P.white)
  else
    T.img(cx - w * 0.04, cy - h * 0.04, w * 0.08, h * 0.30, 'rect', T.P.mintDeep, 0)
    T.img(cx - w * 0.13, cy + h * 0.10, w * 0.22, w * 0.12, 'circle', T.P.mint, -24)
    T.img(cx + w * 0.13, cy + h * 0.16, w * 0.22, w * 0.12, 'circle', T.P.mint, 24)
  end
end
