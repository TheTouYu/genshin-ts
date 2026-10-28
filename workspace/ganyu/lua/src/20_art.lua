-- ============================================================================
-- 美术：双主题背景 / 雪峰山脊 / 甘雨立绘 / 冰晶装饰 / 敌人 / 道具 / 场景小景
-- 六种图元：rect circle triangle fourstar fivestar ring
-- 立绘局部坐标：头中心 (0,0)，身高约 470 单位；调用方用 s 缩放。
-- ============================================================================
T = T or {}

T.SKIN = T.P.skin
T.SKIN2 = T.P.skin2
T.BLUSH = T.P.blush
T.INK = T.P.ink

-- ---------------------------------------------------------------------------
-- 雪峰：主峰 + 肩峰 + 同顶点雪帽 + 亮边
-- apexY = 峰顶 y（设计坐标）；峰值越高越靠上
-- ---------------------------------------------------------------------------
T.peak = function(x, apexY, w, h, fill, opts)
  opts = opts or {}
  local cy = apexY - h / 2
  if opts.rim then T.img(x, cy, w + 7, h + 7, 'triangle', opts.rim) end
  T.img(x, cy, w, h, 'triangle', fill)
  if opts.shade then
    T.img(x + w * 0.20, cy - h * 0.01, w * 0.58, h * 0.97, 'triangle', opts.shade)
  end
  if opts.cap then
    local ratio = opts.capRatio or 0.32
    local capH = h * ratio
    local capW = w * ratio
    T.img(x, apexY - capH / 2, capW, capH, 'triangle', opts.cap)
  end
  if opts.line then
    local len = math.sqrt((w / 2) ^ 2 + h ^ 2) * 0.82
    local ang = math.deg(math.atan(w / 2, h))
    T.img(x - w * 0.22, cy + h * 0.02, 2, len, 'rect', opts.line, ang)
  end
end

T.ridge = function(peaks, opts)
  opts = opts or {}
  if opts.base then
    local lowest = T.DESIGN_H
    for _, p in ipairs(peaks) do
      local baseY = p[2] - p[4]
      if baseY < lowest then lowest = baseY end
    end
    T.img(0, lowest - T.DESIGN_H / 2, T.DESIGN_W + 80, T.DESIGN_H, 'rect', opts.base)
  end
  for _, p in ipairs(peaks) do
    T.peak(p[1], p[2], p[3], p[4], opts.fill, {
      rim = opts.rim, shade = opts.shade, cap = opts.cap,
      capRatio = opts.capRatio, line = opts.line,
    })
  end
end

T.haze = function(y, h, color, alpha)
  local c = color % 16777216
  local a = alpha or 28
  T.img(0, y, T.DESIGN_W * 1.25, h, 'circle', T.withA(c, math.floor(a * 0.8)))
  T.img(0, y - h * 0.35, T.DESIGN_W * 1.5, h * 0.8, 'circle', T.withA(c, math.floor(a * 0.55)))
  T.img(0, y + h * 0.3, T.DESIGN_W * 1.4, h * 0.6, 'circle', T.withA(c, math.floor(a * 0.5)))
end

-- ---------------------------------------------------------------------------
-- 雪花粒子（设计坐标；支持多层纵深）
-- ---------------------------------------------------------------------------
T.snowfall = function(n, opts)
  opts = opts or {}
  local m = T.opt.motion or 2
  local count = math.max(4, math.floor(n * (m == 1 and 0.55 or (m == 3 and 1.55 or 1))))
  local list = {}
  local W, H = T.DESIGN_W, T.DESIGN_H
  local baseColor = opts.color or T.P.white
  for i = 1, count do
    local x = (T.rand(1000) / 1000 - 0.5) * W * 1.04
    local y = (T.rand(1000) / 1000 - 0.5) * H * 1.04
    local size = (1.8 + T.rand(40) / 10) * (opts.scale or 1)
    local alpha = 70 + T.rand(150)
    local sp = 14 + T.rand(30)
    local sway = 8 + T.rand(26)
    if i % 6 == 0 and size > 3.3 then
      local parts = T.snowflake(x, y, size * 1.5, T.withA(baseColor % 16777216, alpha), { core = T.withA(T.P.white % 16777216, alpha) })
      local rel = {}
      for _, c in ipairs(parts) do
        local bp = T.pos[c]
        if bp then rel[#rel + 1] = { c, bp.x - x, bp.y - y } end
      end
      list[#list + 1] = { parts = rel, x = x, y = y, sp = sp * 0.6, ph = T.rand(628) / 100, sway = sway * 0.6 }
    else
      local ctl = T.img(x, y, size, size, 'circle', T.withA(baseColor % 16777216, alpha))
      list[#list + 1] = { ctl = ctl, x = x, y = y, sp = sp, ph = T.rand(628) / 100, sway = sway }
    end
  end
  T.anim(function(dt, time)
    if opts.pauseWithGame and T.overlay and T.overlay.pausesGame then return end
    for _, p in ipairs(list) do
      p.y = p.y - p.sp * dt
      if p.y < -H / 2 - 30 then
        p.y = H / 2 + 30
        p.x = (T.rand(1000) / 1000 - 0.5) * W * 1.04
      end
      local px = p.x + math.sin(time * 0.5 + p.ph) * p.sway
      if p.parts then
        for _, r in ipairs(p.parts) do
          T.tryCall(r[1], 'SetAnchoredPosition', (px + r[2]) * T.S, (p.y + r[3]) * T.S)
        end
      else
        T.tryCall(p.ctl, 'SetAnchoredPosition', px * T.S, p.y * T.S)
      end
    end
  end)
  return list
end

-- ---------------------------------------------------------------------------
-- 冰晶装饰
-- ---------------------------------------------------------------------------
T.iceShardCluster = function(x, y, s, color, opts)
  opts = opts or {}
  local col = color or T.P.ice2
  local spec = {
    { 0, 0, 14, 54, 0 }, { -14, -4, 9, 36, -22 }, { 13, -6, 8, 30, 20 },
    { -6, -8, 6, 22, -8 }, { 7, -2, 5, 18, 10 },
  }
  local list = {}
  for _, p in ipairs(spec) do
    list[#list + 1] = T.img(x + p[1] * s, y + p[2] * s, p[3] * s, p[4] * s, 'triangle', col, p[5])
    if opts.hi ~= false then
      list[#list + 1] = T.img(x + p[1] * s, y + (p[2] + p[4] * 0.18) * s, p[3] * s * 0.28, p[4] * s * 0.5,
        'triangle', T.withA(T.P.white, 150), p[5])
    end
  end
  return list
end

T.cornerCrystals = function(w, h, color, opts)
  opts = opts or {}
  local c = color or T.th.accent
  local a = opts.alpha or 120
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      local cx, cy = sx * (w / 2 - 16), sy * (h / 2 - 16)
      T.img(cx, cy, 9, 9, 'fourstar', T.withA(c % 16777216, a))
      T.img(cx - sx * 7, cy, 5, 1.2, 'rect', T.withA(c % 16777216, a * 0.6))
    end
  end
end

-- 月光 / 光晕：多层低 alpha 圆，越外越淡（不要硬描边环）
T.glow = function(x, y, r, color, steps, alphaMax)
  steps = steps or 9
  alphaMax = alphaMax or 54
  for i = steps, 1, -1 do
    local k = i / steps
    T.img(x, y, r * 2 * (1 + k * 1.6), r * 2 * (1 + k * 1.6), 'circle',
      T.withA(color % 16777216, math.floor(alphaMax * (1 - k) ^ 2)))
  end
end

T.moon = function(x, y, r)
  T.glow(x, y, r, T.P.ice2, 20, 26)
  T.glow(x, y, r * 1.05, T.P.white, 8, 12)
  T.img(x, y, r * 2, r * 2, 'circle', T.C(255, 251, 253, 255))
  T.img(x, y, r * 1.86, r * 1.86, 'circle', T.C(255, 247, 251, 255))
  T.img(x - r * 0.32, y + r * 0.3, r * 0.34, r * 0.34, 'circle', T.C(30, 208, 230, 242))
  T.img(x + r * 0.34, y - r * 0.24, r * 0.26, r * 0.26, 'circle', T.C(26, 208, 230, 242))
  T.img(x + r * 0.05, y + r * 0.02, r * 0.16, r * 0.16, 'circle', T.C(20, 208, 230, 242))
end

-- 极光缎带：5 条相邻薄矩形，同角度、无重叠（避免 α 叠加）
T.auroraRibbon = function(x, y, w, h, color, rot, alpha)
  local n = 5
  for i = 1, n do
    local k = (i - 0.5) / n
    local a = math.floor(alpha * (0.35 + 0.65 * math.sin(k * math.pi)))
    T.img(x, y + (0.5 - k) * h, w * (0.72 + 0.28 * math.sin(k * math.pi)), h / n + 1, 'rect',
      T.withA(color % 16777216, a), rot)
  end
end

T.aurora = function(opts)
  opts = opts or {}
  T.auroraRibbon(-40, 238, 900, 62, T.P.mint, 4, 22)
  T.auroraRibbon(140, 206, 720, 44, T.P.ice3, -3, 18)
  -- 亮边（两端用圆点收口，避免硬边）
  T.img(-40, 268, 760, 1.2, 'rect', T.withA(T.P.mint, 40), 4)
  T.img(180, 226, 520, 1, 'rect', T.withA(T.P.ice2, 34), -3)
end

-- 星星（带闪烁）
T.starfield = function(n, opts)
  opts = opts or {}
  local list = {}
  for i = 1, n do
    local x = (T.rand(1000) / 1000 - 0.5) * T.DESIGN_W
    local y = T.rand(1000) / 1000 * T.DESIGN_H * 0.66 + T.DESIGN_H * 0.02
    local s = 1 + T.rand(3) * 0.7
    local a = 60 + T.rand(150)
    local ctl = T.img(x, y, s, s, (i % 9 == 0) and 'fourstar' or 'circle', T.withA(T.P.ice0 % 16777216, a))
    list[#list + 1] = { ctl = ctl, ph = T.rand(628) / 100, base = a }
  end
  T.anim(function(dt, t)
    for _, p in ipairs(list) do
      local a = p.base * (0.55 + 0.45 * math.sin(t * 1.4 + p.ph))
      T.trySet(p.ctl, 'imageColor', T.withA(T.P.ice0 % 16777216, math.floor(a)))
    end
  end)
  return list
end

-- 雪松 / 雪丘 / 边角框
T.pine = function(x, y, s, color, snow)
  color = color or T.C(255, 18, 42, 58)
  snow = snow or T.C(150, 230, 244, 252)
  T.img(x, y + 10 * s, 6 * s, 26 * s, 'rect', T.mix(color, T.INK, 0.2))
  T.img(x, y + 26 * s, 34 * s, 36 * s, 'triangle', color)
  T.img(x, y + 44 * s, 26 * s, 30 * s, 'triangle', color)
  T.img(x, y + 58 * s, 17 * s, 24 * s, 'triangle', color)
  T.img(x, y + 44 * s, 20 * s, 12 * s, 'triangle', snow)
  T.img(x, y + 60 * s, 13 * s, 9 * s, 'triangle', snow)
end

T.drift = function(x, y, w, h, color)
  T.img(x, y, w, h, 'circle', color or T.C(255, 246, 252, 255))
  T.img(x - w * 0.28, y - h * 0.18, w * 0.5, h * 0.7, 'circle', color or T.C(255, 246, 252, 255))
  T.img(x + w * 0.3, y - h * 0.12, w * 0.44, h * 0.6, 'circle', color or T.C(255, 246, 252, 255))
end

T.screenFrame = function(color, inset, mark)
  inset = inset or 14
  local w, h = T.DESIGN_W - inset * 2, T.DESIGN_H - inset * 2
  local c = color or T.withA(T.P.gold, 60)
  T.img(0, h / 2, w, 1.2, 'rect', c)
  T.img(0, -h / 2, w, 1.2, 'rect', c)
  T.img(-w / 2, 0, 1.2, h, 'rect', c)
  T.img(w / 2, 0, 1.2, h, 'rect', c)
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      T.img(sx * w / 2, sy * h / 2, 14, 14, 'fourstar', mark or T.withA(T.P.goldPale, 120))
    end
  end
end

-- ---------------------------------------------------------------------------
-- 背景：夜
-- ---------------------------------------------------------------------------
T.bgNight = function(opts)
  opts = opts or {}
  T.bgGradient(T.C(255, 7, 20, 34), T.C(255, 14, 42, 66), T.C(255, 30, 78, 106))
  T.starfield(opts.stars or 52)
  if opts.aurora ~= false then T.aurora() end
  local mx = opts.moonX or 0
  local my = opts.moonY or 176
  T.moon(mx, my, opts.moonR or 88)
  -- 远山（低对比）
  T.haze(-150, 130, T.C(255, 34, 82, 110), 24)
  -- 远山：宽基底（w≈2.6h）+ 少量肩峰
  T.ridge({
    { -560, -118, 380, 110 }, { -300, -92, 340, 140 }, { -40, -124, 360, 100 },
    { 220, -84, 380, 150 }, { 520, -112, 360, 120 },
  }, { fill = T.C(255, 32, 74, 100), base = T.C(255, 32, 74, 100), cap = T.C(255, 172, 214, 238), capRatio = 0.16, rim = T.C(255, 42, 90, 118) })
  -- 中景
  T.haze(-236, 100, T.C(255, 24, 60, 84), 30)
  T.ridge({
    { -620, -210, 480, 130 }, { -240, -166, 520, 170 }, { 200, -206, 460, 140 }, { 560, -176, 440, 160 },
  }, { fill = T.C(255, 22, 54, 76), base = T.C(255, 22, 54, 76), cap = T.C(255, 194, 226, 246), capRatio = 0.14, rim = T.C(255, 32, 72, 98), shade = T.C(56, 12, 34, 50) })
  -- 近景：矮宽山脊，只露一条边
  T.haze(-300, 90, T.C(255, 18, 44, 62), 26)
  T.ridge({
    { -520, -300, 680, 120 }, { -40, -276, 640, 140 }, { 460, -306, 620, 120 },
  }, { fill = T.C(255, 16, 40, 58), base = T.C(255, 16, 40, 58), cap = T.C(255, 214, 240, 253), capRatio = 0.12, rim = T.C(255, 24, 58, 78), line = T.C(50, 200, 238, 250) })
  T.snowfield(-352, T.C(255, 30, 70, 94))
  -- 地平线雪松
  for i = 1, 15 do
    local px = -660 + (i - 1) * 96 + (T.rand(30) - 15)
    local sz = 0.5 + T.rand(30) / 100
    T.pine(px, -338 + T.rand(18), sz * T.S, T.C(255, 16, 38, 54), T.C(110, 190, 220, 238))
  end
  T.imgRaw(0, -T.DESIGN_H / 2 + 2, T.W + 4, 8, 'rect', T.C(255, 20, 50, 70))
  return { moon = { x = mx, y = my, r = opts.moonR or 88 } }
end

T.snowfield = function(y, color, opts)
  opts = opts or {}
  local W = T.DESIGN_W
  local c = color or T.C(255, 236, 249, 255)
  T.img(0, y - 26, W * 1.3, 150, 'circle', c)
  T.img(-W * 0.34, y + 6, W * 0.72, 110, 'circle', T.mix(c, T.P.white, 0.10))
  T.img(W * 0.36, y + 2, W * 0.66, 100, 'circle', T.mix(c, T.P.white, 0.06))
  if opts.sparkle ~= false then
    for i = 1, 16 do
      local sx = (T.rand(1000) / 1000 - 0.5) * W * 0.94
      local sy = y - 10 + T.rand(60)
      T.img(sx, sy, 2.6, 2.6, 'fourstar', T.withA(T.P.white, 90))
    end
  end
end

-- ---------------------------------------------------------------------------
-- 背景：昼（清爽 / 高调）
-- ---------------------------------------------------------------------------
T.bgDay = function(opts)
  opts = opts or {}
  T.bgGradient(T.C(255, 250, 254, 255), T.C(255, 230, 247, 254), T.C(255, 205, 234, 248))
  -- 太阳光晕
  local sx, sy = opts.sunX or 380, opts.sunY or 168
  T.glow(sx, sy, 96, T.P.goldPale, 8, 30)
  T.img(sx, sy, 128, 128, 'circle', T.C(255, 253, 252, 240))
  -- 云
  T.cloudRaw(-420, 190, 1.15 * T.S, T.C(130, 255, 255, 255))
  T.cloudRaw(360, 150, 0.9 * T.S, T.C(110, 255, 255, 255))
  T.cloudRaw(120, 232, 0.68 * T.S, T.C(80, 255, 255, 255))
  -- 远山（白 / 冰蓝）
  T.ridge({
    { -560, -110, 400, 110 }, { -290, -80, 360, 140 }, { -30, -116, 380, 100 },
    { 230, -76, 400, 150 }, { 530, -104, 380, 120 },
  }, { fill = T.C(255, 240, 250, 255), base = T.C(255, 240, 250, 255), cap = T.C(255, 255, 255, 255), capRatio = 0.2, rim = T.C(255, 218, 240, 251) })
  T.cloudRaw(-260, -150, 1.4 * T.S, T.C(120, 255, 255, 255))
  T.ridge({
    { -620, -214, 520, 130 }, { -200, -166, 560, 170 }, { 240, -210, 500, 140 }, { 600, -178, 460, 160 },
  }, { fill = T.C(255, 215, 240, 252), base = T.C(255, 215, 240, 252), cap = T.C(255, 252, 255, 255), capRatio = 0.16, rim = T.C(255, 196, 229, 247), shade = T.C(20, 172, 216, 238) })
  T.cloudRaw(280, -238, 1.7 * T.S, T.C(110, 255, 255, 255))
  T.haze(-286, 80, T.C(255, 190, 226, 246), 36)
  T.ridge({
    { -520, -310, 700, 120 }, { -20, -286, 660, 140 }, { 480, -316, 620, 120 },
  }, { fill = T.C(255, 224, 245, 253), base = T.C(255, 224, 245, 253), cap = T.C(255, 255, 255, 255), capRatio = 0.12 })
  T.snowfield(-352, T.C(255, 250, 254, 255))
  -- 零星清心
  for i = 1, 3 do
    local fx = -520 + i * 380 + (T.rand(60) - 30)
    T.flower(fx, -280 + T.rand(30), 6, T.withA(T.P.violet, 170), T.P.goldPale)
  end
  return { sun = { x = sx, y = sy } }
end

-- 前景雪堤
T.snowBank = function(color, y)
  local W = T.DESIGN_W
  local c = color or T.C(255, 250, 254, 255)
  T.img(-W * 0.26, y or (-T.DESIGN_H * 0.47), W * 0.82, 120, 'circle', c)
  T.img(W * 0.28, (y or (-T.DESIGN_H * 0.47)) - 8, W * 0.78, 110, 'circle', c)
  T.img(0, (y or (-T.DESIGN_H * 0.47)) - 34, W * 1.2, 100, 'circle', c)
end

-- ---------------------------------------------------------------------------
-- 甘雨 / 角色立绘
-- ---------------------------------------------------------------------------
T.portraitHead = function(x, y, s, ch)
  -- 头像：剪影优先（后发→肩→脸→发帘→角→五官），60px 内可辨识
  T.img(x, y + 2 * s, 116 * s, 122 * s, 'circle', ch.hair2)
  T.img(x - 58 * s, y - 24 * s, 24 * s, 64 * s, 'circle', ch.hair)
  T.img(x + 58 * s, y - 24 * s, 24 * s, 64 * s, 'circle', ch.hair)
  T.img(x, y - 64 * s, 66 * s, 30 * s, 'circle', ch.cloth)
  T.img(x, y - 50 * s, 24 * s, 22 * s, 'circle', ch.cloth2)
  T.img(x, y, 86 * s, 98 * s, 'circle', T.SKIN)
  -- 发帘：5 片扇形（三角朝下）
  for i = 1, 5 do
    local bx = (i - 3) * 18 * s
    local hh = (i == 3) and 26 or 32
    T.img(x + bx, y + 30 * s, 30 * s, hh * s, 'triangle', ch.hair, 180 + (i - 3) * 5)
  end
  T.img(x - 40 * s, y + 10 * s, 22 * s, 54 * s, 'triangle', ch.hair, 190)
  T.img(x + 40 * s, y + 10 * s, 22 * s, 54 * s, 'triangle', ch.hair, 170)
  -- 角
  if ch.motif == 'qilin' then
    T.img(x - 30 * s, y + 52 * s, 15 * s, 26 * s, 'triangle', T.P.gold2, -14)
    T.img(x - 40 * s, y + 68 * s, 11 * s, 22 * s, 'triangle', T.P.gold, -30)
    T.img(x + 30 * s, y + 52 * s, 15 * s, 26 * s, 'triangle', T.P.gold2, 14)
    T.img(x + 40 * s, y + 68 * s, 11 * s, 22 * s, 'triangle', T.P.gold, 30)
  elseif ch.motif == 'crane' then
    T.img(x - 34 * s, y + 50 * s, 7 * s, 24 * s, 'rect', T.P.white, -14)
    T.img(x + 34 * s, y + 50 * s, 7 * s, 24 * s, 'rect', T.P.white, 14)
  else
    T.img(x + 34 * s, y + 46 * s, 20 * s, 10 * s, 'circle', T.P.danger, -14)
  end
  -- 五官
  T.img(x - 17 * s, y - 4 * s, 17 * s, 20 * s, 'circle', T.P.white)
  T.img(x + 17 * s, y - 4 * s, 17 * s, 20 * s, 'circle', T.P.white)
  T.img(x - 17 * s, y - 3 * s, 12 * s, 15 * s, 'circle', ch.eye)
  T.img(x + 17 * s, y - 3 * s, 12 * s, 15 * s, 'circle', ch.eye)
  T.img(x - 17 * s, y - 5 * s, 6 * s, 8 * s, 'circle', T.INK)
  T.img(x + 17 * s, y - 5 * s, 6 * s, 8 * s, 'circle', T.INK)
  T.img(x - 20 * s, y + 1 * s, 3 * s, 3 * s, 'circle', T.P.white)
  T.img(x + 14 * s, y + 1 * s, 3 * s, 3 * s, 'circle', T.P.white)
  T.img(x - 17 * s, y + 6 * s, 17 * s, 2.2 * s, 'rect', T.INK, -4)
  T.img(x + 17 * s, y + 6 * s, 17 * s, 2.2 * s, 'rect', T.INK, 4)
end

-- 立绘：剪影优先 + 分片明暗；1:4.2 头身
T.portrait = function(ch, cx, cy, s, opts)
  opts = opts or {}
  s = s or 1
  local hair, hair2, hair3 = ch.hair, ch.hair2, ch.hair3
  local cloth = ch.cloth
  local cloth2 = ch.cloth2
  local shade = T.mix(cloth, T.P.ice4, 0.30)
  local shade2 = T.mix(cloth, T.P.deep, 0.16)
  local rim = T.mix(hair, hair3, 0.55)
  local parts = {}
  local function put(lx, ly, w, h, shape, color, rot, tag)
    local ctl = T.img(cx + lx * s, cy + ly * s, w * s, h * s, shape, color, rot or 0)
    if ctl then
      parts[#parts + 1] = { ctl = ctl, lx = lx, ly = ly, tag = tag }
      return ctl
    end
  end
  local skin, skin2 = T.SKIN, T.SKIN2

  -- ===== 1 后发（轮廓 + 边缘光） =====
  put(0, -26, 136, 162, 'circle', rim, 0, 'hairRim')
  put(-64, -140, 44, 190, 'circle', rim, -3, 'hairRim')
  put(64, -140, 44, 190, 'circle', rim, 3, 'hairRim')
  put(0, -28, 124, 150, 'circle', hair2, 0, 'hairBack')
  put(-60, -136, 38, 178, 'circle', hair2, -3, 'hairBack')
  put(60, -136, 38, 178, 'circle', hair2, 3, 'hairBack')
  put(-66, -238, 30, 64, 'triangle', hair2, 176, 'hairBack')
  put(66, -238, 30, 64, 'triangle', hair2, 184, 'hairBack')

  -- ===== 2 肩披 =====
  put(0, -128, 194, 56, 'circle', cloth2, 0, 'mantle')
  put(0, -122, 150, 40, 'circle', T.mix(cloth2, T.P.ice4, 0.35), 0, 'mantle')
  put(0, -152, 180, 6, 'rect', T.P.gold, 0, 'mantleTrim')

  -- ===== 3 裙 / 身体 =====
  put(0, -276, 190, 170, 'triangle', cloth, 180, 'skirt')
  put(0, -352, 168, 46, 'circle', cloth, 0, 'skirtHem')
  put(-62, -282, 56, 146, 'triangle', shade, 184, 'skirtShade')
  put(62, -282, 56, 146, 'triangle', shade, 176, 'skirtShade')
  put(0, -356, 120, 10, 'rect', cloth2, 0, 'hem')
  put(0, -354, 120, 3, 'rect', T.P.gold, 0, 'hemTrim')
  -- 左缘高光
  put(-70, -280, 5, 130, 'rect', T.mix(cloth, T.P.white, 0.75), 6, 'rimLight')
  put(0, -208, 96, 20, 'rect', cloth2, 0, 'belt')
  put(0, -207, 96, 3, 'rect', T.P.gold, 0, 'trim')
  put(0, -160, 92, 112, 'rect', cloth, 0, 'torso')
  put(-38, -160, 13, 108, 'rect', shade, 0, 'torsoShade')
  put(38, -160, 13, 108, 'rect', shade, 0, 'torsoShade')
  put(0, -136, 38, 46, 'triangle', cloth2, 180, 'chest')
  put(0, -146, 58, 16, 'circle', T.mix(cloth, T.P.white, 0.8), 0, 'bib')
  put(0, -116, 24, 20, 'rect', cloth2, 0, 'collar')
  put(0, -105, 24, 3, 'rect', T.P.gold, 0, 'trim')
  -- 冰元素神之眼
  put(42, -196, 12, 16, 'circle', T.P.ice3, 0, 'vision')
  put(42, -196, 6, 8, 'fourstar', T.P.white, 0, 'vision')
  -- 铃铛
  put(-31, -176, 10, 10, 'circle', T.P.gold, 0, 'bell')
  put(-31, -182, 5, 5, 'circle', T.P.gold2, 0, 'bell')
  -- ===== 4 手臂 =====
  put(-54, -146, 28, 74, 'rect', cloth, 12, 'arm')
  put(54, -146, 28, 74, 'rect', cloth, -12, 'arm')
  put(-66, -220, 22, 66, 'rect', cloth, 5, 'arm')
  put(66, -220, 22, 66, 'rect', cloth, -5, 'arm')
  put(-68, -254, 26, 13, 'rect', cloth2, 5, 'cuff')
  put(68, -254, 26, 13, 'rect', cloth2, -5, 'cuff')
  put(-69, -272, 17, 17, 'circle', skin, 0, 'hand')
  put(69, -272, 17, 17, 'circle', skin, 0, 'hand')
  -- 手中冰晶
  put(69, -290, 16, 16, 'fourstar', T.withA(T.P.ice2, 120), 0, 'holdFx')
  put(69, -290, 6, 6, 'circle', T.P.white, 0, 'holdFx')

  -- ===== 5 颈 / 头 =====
  put(0, -74, 22, 26, 'rect', skin2, 0, 'neck')
  put(0, 0, 100, 112, 'circle', skin, 0, 'face')
  put(-51, -2, 14, 20, 'circle', skin, 0, 'ear')
  put(51, -2, 14, 20, 'circle', skin, 0, 'ear')
  put(-53, -14, 7, 7, 'circle', T.P.gold, 0, 'earring')
  put(53, -14, 7, 7, 'circle', T.P.gold, 0, 'earring')

  -- ===== 6 发帘（中分：5 片，中间短） =====
  put(0, 32, 98, 50, 'circle', hair, 0, 'bang')
  local fringe = {
    { -40, 24, 34, 50, -10, hair }, { -20, 27, 30, 54, -4, hair },
    { 0, 30, 26, 30, 0, hair2 }, { 20, 27, 30, 54, 4, hair }, { 40, 24, 34, 50, 10, hair },
  }
  for _, f in ipairs(fringe) do
    put(f[1], f[2], f[3], f[4], 'triangle', f[6], 180 + f[5], 'bang')
  end
  put(-25, 30, 18, 6, 'circle', hair3, -16, 'hairHi')
  put(27, 28, 14, 5, 'circle', hair3, 12, 'hairHi')
  -- 侧发（前）
  put(-52, 0, 26, 84, 'triangle', hair, 172, 'bang')
  put(52, 0, 26, 84, 'triangle', hair, 188, 'bang')
  put(-58, -56, 28, 82, 'circle', hair, -4, 'sideHair')
  put(58, -56, 28, 82, 'circle', hair, 4, 'sideHair')
  put(-63, -108, 22, 52, 'triangle', hair, 176, 'sideHair')
  put(63, -108, 22, 52, 'triangle', hair, 184, 'sideHair')
  put(-53, -58, 7, 70, 'rect', T.withA(hair3, 120), -3, 'hairHi')
  put(53, -58, 7, 70, 'rect', T.withA(hair3, 120), 3, 'hairHi')

  -- ===== 7 麒麟角（叠压成连续弯角） =====
  if ch.motif == 'qilin' then
    for _, sg in ipairs({ -1, 1 }) do
      -- 珠链式：沿曲线排布逐渐变小的圆，天然连续且可弯
      local beads = {
        { 26, 44, 15 }, { 28, 60, 14 }, { 32, 76, 12.5 }, { 38, 92, 11 },
        { 46, 106, 9 }, { 55, 118, 7 }, { 63, 128, 5 },
      }
      for i, b in ipairs(beads) do
        local col = (i <= 2) and T.P.gold2 or (i <= 5 and T.P.gold or T.P.goldPale)
        put(sg * b[1], b[2], b[3] * 2, b[3] * 2, 'circle', col, 0, 'horn')
      end
      put(sg * 26, 48, 8, 16, 'circle', T.withA(T.P.white, 110), 0, 'horn')
    end
  elseif ch.motif == 'crane' then
    put(-46, 78, 8, 54, 'rect', T.P.white, -18, 'horn')
    put(46, 78, 8, 54, 'rect', T.P.white, 18, 'horn')
    put(-56, 104, 6, 20, 'triangle', T.P.white, -34, 'horn')
    put(56, 104, 6, 20, 'triangle', T.P.white, 34, 'horn')
  else
    put(-42, 72, 26, 34, 'circle', hair2, -16, 'horn')
    put(42, 72, 26, 34, 'circle', hair2, 16, 'horn')
    put(-38, 80, 15, 16, 'circle', T.P.gold, -16, 'horn')
    put(38, 80, 15, 16, 'circle', T.P.gold, 16, 'horn')
  end

  -- ===== 8 五官 =====
  for _, sg in ipairs({ -1, 1 }) do
    local ex = sg * 22
    put(ex, -4, 21, 25, 'circle', T.P.white, 0, 'eyeWhite')
    put(ex, -3, 16, 21, 'circle', ch.eye, 0, 'eye')
    put(ex, -7, 12, 14, 'circle', T.mix(ch.eye, T.INK, 0.35), 0, 'eye')
    put(ex, -6, 8, 10, 'circle', T.INK, 0, 'pupil')
    put(ex - sg * 4, -10, 5.5, 5.5, 'circle', T.P.white, 0, 'eyeHi')
    put(ex + sg * 4, 0, 3, 3, 'circle', T.withA(T.P.white, 200), 0, 'eyeHi')
    put(ex, 9, 24, 3.4, 'rect', T.INK, -sg * 7, 'lash')
    put(ex + sg * 12, 11, 7, 3, 'triangle', T.INK, sg * 40, 'lash')
    put(ex, -18, 15, 1.6, 'rect', T.withA(T.P.roseDeep, 120), 0, 'lowerLid')
    put(ex, 25, 19, 2.4, 'rect', hair2, -sg * 9, 'brow')
  end
  local bl1 = T.img(cx - 22 * s, cy - 6 * s, 20 * s, 2.6 * s, 'rect', T.INK, -7)
  local bl2 = T.img(cx + 22 * s, cy - 6 * s, 20 * s, 2.6 * s, 'rect', T.INK, 7)
  parts[#parts + 1] = { ctl = bl1, lx = -22, ly = -6, parked = true, tag = 'blinkLine' }
  parts[#parts + 1] = { ctl = bl2, lx = 22, ly = -6, parked = true, tag = 'blinkLine' }
  T.setPos(bl1, -100000, 0)
  T.setPos(bl2, -100000, 0)
  put(-40, -26, 23, 8, 'circle', T.withA(T.BLUSH, 110), 0, 'blush')
  put(40, -26, 23, 8, 'circle', T.withA(T.BLUSH, 110), 0, 'blush')
  put(0, -22, 2.6, 4, 'circle', T.withA(T.SKIN2, 110), 0, 'nose')
  put(0, -34, 11, 2.4, 'rect', T.withA(T.P.roseDeep, 210), 0, 'mouth')
  put(-5.5, -32, 4, 3, 'triangle', T.withA(T.P.roseDeep, 210), 200, 'mouth')
  put(5.5, -32, 4, 3, 'triangle', T.withA(T.P.roseDeep, 210), 160, 'mouth')

  -- ===== 9 发饰 =====
  if ch.motif == 'qilin' then
    put(46, 48, 13, 13, 'flower', T.P.violet, 0, 'hairAcc')
    put(46, 48, 5, 5, 'circle', T.P.goldPale, 0, 'hairAcc')
    put(54, 34, 5, 9, 'rect', T.P.gold, 0, 'hairAcc')
  elseif ch.motif == 'crane' then
    put(-50, 32, 24, 10, 'circle', T.P.danger, -20, 'hairAcc')
    put(0, -150, 5, 40, 'rect', T.P.danger, 0, 'cord')
  else
    put(38, 46, 26, 9, 'circle', T.P.danger, -14, 'hairAcc')
    put(-40, 44, 20, 7, 'circle', T.P.gold, 12, 'hairAcc')
    put(0, -200, 80, 6, 'rect', T.P.danger, 0, 'trim')
  end

  -- ===== 待机 =====
  if opts.idle ~= false then
    local amp = (opts.amp or 2.2) * (T.opt.motion == 1 and 0.6 or (T.opt.motion == 3 and 1.3 or 1))
    local phase = (ch.id or 1) * 1.7
    local blinkT, nextBlink = 0, 2.6 + (ch.id or 1)
    T.anim(function(dt, time)
      if opts.pauseWithGame and T.overlay and T.overlay.pausesGame then return end
      local bob = math.sin(time * 1.25 + phase) * amp
      for _, p in ipairs(parts) do
        if not p.parked and p.ctl then
          local sway = 0
          if p.tag == 'hairBack' or p.tag == 'hairRim' or p.tag == 'sideHair' then
            sway = math.sin(time * 0.8 + phase) * amp * (p.tag == 'sideHair' and 0.7 or 0.4)
          end
          T.tryCall(p.ctl, 'SetAnchoredPosition', (cx + (p.lx + sway) * s) * T.S, (cy + (p.ly + bob) * s) * T.S)
        end
      end
      if opts.blink ~= false then
        nextBlink = nextBlink - dt
        if nextBlink <= 0 and blinkT <= 0 then blinkT = 0.1 end
        if blinkT > 0 then
          blinkT = blinkT - dt
          for _, p in ipairs(parts) do
            if p.ctl then
              if p.tag == 'eye' or p.tag == 'eyeHi' or p.tag == 'eyeWhite' or p.tag == 'pupil' then
                T.setPos(p.ctl, -100000, 0)
              elseif p.tag == 'blinkLine' then
                T.tryCall(p.ctl, 'SetAnchoredPosition', (cx + p.lx * s) * T.S, (cy + (p.ly + bob) * s) * T.S)
              end
            end
          end
          if blinkT <= 0 then
            nextBlink = 2.6 + T.rand(30) / 10
            for _, p in ipairs(parts) do
              if p.ctl then
                if p.tag == 'eye' or p.tag == 'eyeHi' or p.tag == 'eyeWhite' or p.tag == 'pupil' then
                  T.tryCall(p.ctl, 'SetAnchoredPosition', (cx + p.lx * s) * T.S, (cy + (p.ly + bob) * s) * T.S)
                elseif p.tag == 'blinkLine' then
                  T.setPos(p.ctl, -100000, 0)
                end
              end
            end
          end
        end
      end
    end)
  end
  return parts
end

T.portraitCard = function(cx, cy, w, h, ch, opts)
  opts = opts or {}
  local parts = T.card(cx, cy, w, h, {
    radius = opts.radius or 20, fill = opts.fill or T.th.panel2,
    border = opts.border or T.th.cardBorder, hi = opts.hi,
  })
  T.img(cx, cy + h * 0.14, w * 0.62, w * 0.62, 'circle', T.withA(ch.hair3, 22))
  T.img(cx, cy + h * 0.14, w * 0.40, w * 0.40, 'circle', T.withA(T.P.white, 18))
  T.portrait(ch, cx, cy + h * 0.32, (opts.scale or 0.58) * (h / 470), { idle = opts.idle, mood = opts.mood })
  return parts
end

-- ---------------------------------------------------------------------------
-- 敌人
-- ---------------------------------------------------------------------------
T.enemyArt = function(kind, x, y, s, opts)
  opts = opts or {}
  s = s or 1
  local body = T.P.ice2
  if kind == 'slime' then
    T.img(x, y, 90 * s, 66 * s, 'circle', body)
    T.img(x - 18 * s, y - 26 * s, 30 * s, 24 * s, 'triangle', T.withA(T.P.white, 180), 0)
    T.img(x - 18 * s, y + 4 * s, 9 * s, 12 * s, 'circle', T.withA(T.P.ink, 190))
    T.img(x + 16 * s, y + 4 * s, 9 * s, 12 * s, 'circle', T.withA(T.P.ink, 190))
    T.img(x, y - 12 * s, 20 * s, 6 * s, 'circle', T.withA(T.P.ink, 90))
    T.img(x + 34 * s, y - 18 * s, 16 * s, 16 * s, 'fourstar', T.withA(T.P.white, 150))
  elseif kind == 'fly' then
    T.img(x - 26 * s, y + 10 * s, 44 * s, 30 * s, 'circle', T.withA(T.P.white, 170), 24)
    T.img(x + 26 * s, y + 10 * s, 44 * s, 30 * s, 'circle', T.withA(T.P.white, 170), -24)
    T.img(x - 26 * s, y + 10 * s, 36 * s, 22 * s, 'circle', body, 24)
    T.img(x + 26 * s, y + 10 * s, 36 * s, 22 * s, 'circle', body, -24)
    T.img(x, y, 16 * s, 44 * s, 'circle', T.P.ink)
    T.img(x, y + 18 * s, 14 * s, 10 * s, 'circle', T.withA(T.P.ice3, 230))
    T.img(x - 4 * s, y + 12 * s, 3 * s, 4 * s, 'circle', T.P.white)
    T.img(x + 4 * s, y + 12 * s, 3 * s, 4 * s, 'circle', T.P.white)
  elseif kind == 'guard' then
    T.img(x, y - 6 * s, 62 * s, 76 * s, 'rect', T.P.ice4)
    T.img(x, y + 34 * s, 48 * s, 44 * s, 'rect', T.P.ice2)
    T.img(x, y + 32 * s, 26 * s, 6 * s, 'rect', T.withA(T.P.ink, 200))
    T.img(x - 24 * s, y - 4 * s, 12 * s, 40 * s, 'rect', T.P.gold, 0)
    T.img(x + 24 * s, y - 4 * s, 12 * s, 40 * s, 'rect', T.P.gold, 0)
    T.img(x, y - 2 * s, 22 * s, 22 * s, 'fourstar', T.P.goldPale)
    T.img(x - 40 * s, y - 10 * s, 22 * s, 54 * s, 'rect', T.P.ice5, 8)
    T.img(x + 40 * s, y - 10 * s, 22 * s, 54 * s, 'rect', T.P.ice5, -8)
  elseif kind == 'boss' then
    T.img(x, y + 6 * s, 140 * s, 140 * s, 'circle', T.withA(T.P.violet2, 60))
    T.img(x, y, 112 * s, 112 * s, 'circle', T.P.deep)
    T.img(x, y + 4 * s, 84 * s, 84 * s, 'circle', T.P.ice5)
    T.img(x - 42 * s, y + 46 * s, 34 * s, 52 * s, 'triangle', T.P.gold, -22)
    T.img(x + 42 * s, y + 46 * s, 34 * s, 52 * s, 'triangle', T.P.gold, 22)
    T.img(x - 24 * s, y + 14 * s, 20 * s, 26 * s, 'circle', T.P.ice2)
    T.img(x + 24 * s, y + 14 * s, 20 * s, 26 * s, 'circle', T.P.ice2)
    T.img(x - 24 * s, y + 12 * s, 9 * s, 12 * s, 'circle', T.INK)
    T.img(x + 24 * s, y + 12 * s, 9 * s, 12 * s, 'circle', T.INK)
    T.img(x, y - 30 * s, 40 * s, 12 * s, 'rect', T.withA(T.P.ink, 190))
    T.img(x, y + 4 * s, 30 * s, 30 * s, 'fourstar', T.withA(T.P.gold, 220))
    for i = 0, 5 do
      local a = i / 6 * math.pi * 2
      T.img(x + math.cos(a) * 66 * s, y + math.sin(a) * 66 * s, 10 * s, 10 * s, 'fourstar', T.withA(T.P.ice3, 200))
    end
  end
end

-- ---------------------------------------------------------------------------
-- 卡面小景
-- ---------------------------------------------------------------------------
T.stageArt = function(cx, cy, w, h, stage, opts)
  opts = opts or {}
  local scale = math.min(w / 300, h / 180)
  local warm = stage and stage.chapter == 2
  local skyTop = warm and T.C(255, 236, 232, 252) or T.C(255, 224, 242, 253)
  local skyBot = warm and T.C(255, 248, 240, 252) or T.C(255, 242, 251, 255)
  T.img(cx, cy + h * 0.18, w, h * 0.68, 'rect', skyTop)
  T.img(cx, cy - h * 0.16, w, h * 0.36, 'rect', skyBot)
  -- 月/日
  local mx, my = cx + w * 0.24, cy + h * 0.22
  T.img(mx, my, 58 * scale, 58 * scale, 'circle', T.withA(T.P.white, 80))
  T.img(mx, my, 38 * scale, 38 * scale, 'circle', T.C(255, 255, 252, 250))
  -- 山脊（两座）
  T.peak(cx - w * 0.26, cy + h * 0.06, w * 0.56, h * 0.48, warm and T.C(255, 224, 218, 246) or T.C(255, 216, 240, 251),
    { cap = T.P.white, capRatio = 0.3 })
  T.peak(cx + w * 0.2, cy - h * 0.02, w * 0.5, h * 0.4, warm and T.C(255, 206, 200, 240) or T.C(255, 198, 230, 246),
    { cap = T.P.white, capRatio = 0.26 })
  -- 雪地
  T.img(cx, cy - h * 0.36, w * 1.15, h * 0.5, 'circle', T.C(255, 250, 254, 255))
  -- 小树
  local tx = cx - w * 0.3
  T.img(tx, cy - h * 0.16, 6 * scale, 34 * scale, 'rect', T.C(255, 120, 150, 170))
  T.img(tx, cy + h * 0.02, 24 * scale, 24 * scale, 'triangle', T.P.ice3, 0)
  T.img(tx, cy + h * 0.13, 17 * scale, 17 * scale, 'triangle', T.P.ice2, 0)
  -- 目标点
  if stage and (stage.id == 3 or stage.id == 6) then
    T.img(cx + w * 0.4, cy - h * 0.28, 10 * scale, 10 * scale, 'fourstar', T.P.gold)
  end
  for i = 1, 7 do
    local x = cx + (T.rand(1000) / 1000 - 0.5) * w * 0.9
    local y = cy + (T.rand(1000) / 1000 - 0.5) * h * 0.8
    T.img(x, y, (2 + T.rand(3)) * scale, (2 + T.rand(3)) * scale, 'circle', T.withA(T.P.white, 170))
  end
end

-- 大冰晶 / 弓 / 圣遗物
T.crystalArt = function(cx, cy, s, color)
  local c = color or T.P.ice3
  T.img(cx, cy + 20 * s, 78 * s, 78 * s, 'circle', T.withA(c, 26))
  T.img(cx, cy, 26 * s, 96 * s, 'triangle', c, 0)
  T.img(cx, cy - 46 * s, 26 * s, 46 * s, 'triangle', T.mix(c, T.P.white, 0.35), 0)
  T.img(cx + 26 * s, cy - 6 * s, 18 * s, 52 * s, 'triangle', T.mix(c, T.P.white, 0.5), 18)
  T.img(cx - 26 * s, cy - 10 * s, 16 * s, 44 * s, 'triangle', T.mix(c, T.P.deep, 0.18), -18)
  T.img(cx, cy + 16 * s, 6 * s, 34 * s, 'rect', T.withA(T.P.white, 150))
end

T.weaponArt = function(cx, cy, s, color)
  local c = color or T.P.gold
  T.img(cx, cy, 120 * s, 190 * s, 'ring', c)
  T.img(cx - 58 * s, cy, 30 * s, 130 * s, 'rect', T.th.panel2, 0)
  T.img(cx + 58 * s, cy, 30 * s, 130 * s, 'rect', T.th.panel2, 0)
  T.img(cx, cy, 4 * s, 168 * s, 'rect', T.withA(T.P.white, 160))
  T.img(cx, cy, 16 * s, 118 * s, 'rect', T.P.deep)
  T.img(cx, cy - 78 * s, 10 * s, 10 * s, 'fourstar', T.P.goldPale)
  T.img(cx, cy + 78 * s, 10 * s, 10 * s, 'fourstar', T.P.goldPale)
end

T.artifactArt = function(kind, cx, cy, s, color)
  local c = color or T.P.ice3
  if kind == 'flower' or kind == 'bloom' then
    T.flower(cx, cy, 26 * s, c, T.P.white)
    T.img(cx, cy, 14 * s, 14 * s, 'circle', T.withA(T.P.gold, 200))
  elseif kind == 'plume' then
    T.img(cx, cy, 18 * s, 96 * s, 'rect', c, 18)
    T.img(cx - 16 * s, cy, 14 * s, 60 * s, 'rect', T.mix(c, T.P.white, 0.3), 42)
    T.img(cx + 14 * s, cy, 12 * s, 50 * s, 'rect', T.mix(c, T.P.white, 0.2), -6)
  elseif kind == 'hourglass' then
    T.img(cx, cy + 26 * s, 56 * s, 40 * s, 'triangle', c, 180)
    T.img(cx, cy - 26 * s, 56 * s, 40 * s, 'triangle', c, 0)
    T.img(cx, cy, 64 * s, 6 * s, 'rect', T.P.gold)
    T.img(cx, cy, 50 * s, 8 * s, 'rect', T.withA(T.P.white, 180))
  elseif kind == 'bow' then
    T.weaponArt(cx, cy, s * 0.9, c)
  else
    T.crystalArt(cx, cy, s, c)
  end
end

-- ---------------------------------------------------------------------------
-- 统一入口
-- ---------------------------------------------------------------------------
T.pageBg = function(kind, opts)
  opts = opts or {}
  if kind == 'night' then
    T.setTheme('night')
    return T.bgNight(opts)
  elseif kind == 'dusk' then
    T.setTheme('night')
    T.bgGradient(T.C(255, 54, 52, 86), T.C(255, 96, 86, 122), T.C(255, 226, 170, 180))
    T.starfield(22)
    T.moon(T.DESIGN_W * 0.1, -20, 92)
    T.ridge({
      { -560, -120, 380, 240 }, { -180, -60, 340, 260 }, { 220, -140, 300, 200 }, { 540, -80, 360, 260 },
    }, { fill = T.C(255, 74, 62, 92), cap = T.C(255, 236, 220, 232), capRatio = 0.22 })
    T.snowfield(-240, T.C(255, 84, 76, 104))
    return
  end
  T.setTheme('day')
  return T.bgDay(opts)
end

T.frostFrame = function(cx, cy, w, h, opts)
  opts = opts or {}
  local c = opts.color or T.th.border
  local t = opts.thick or 2
  T.img(cx, cy + h / 2, w, t, 'rect', c)
  T.img(cx, cy - h / 2, w, t, 'rect', c)
  T.img(cx - w / 2, cy, t, h, 'rect', c)
  T.img(cx + w / 2, cy, t, h, 'rect', c)
  for _, sx in ipairs({ -1, 1 }) do
    for _, sy in ipairs({ -1, 1 }) do
      T.img(cx + sx * w / 2, cy + sy * h / 2, 10, 10, 'fourstar', opts.mark or T.th.accent2)
    end
  end
end

T.titleFlourish = function(cx, cy, w, color)
  local c = color or T.th.accent2
  T.img(cx, cy, w, 1.2, 'rect', c)
  T.img(cx - w / 2, cy, 7, 7, 'fourstar', c)
  T.img(cx + w / 2, cy, 7, 7, 'fourstar', c)
  T.img(cx, cy, 10, 10, 'fourstar', c)
end


-- 侧向渐隐遮罩（让标题区压在暗底上；用竖条近似，无硬边）
T.sideScrim = function(side, color, alpha, bands)
  bands = bands or 10
  local c = color % 16777216
  local w = T.DESIGN_W / 2 / bands
  for i = 1, bands do
    local k = i / bands
    local a = math.floor(alpha * (1 - k) ^ 1.4)
    local x = (side == 'left') and (-T.DESIGN_W / 2 + (i - 0.5) * w) or (T.DESIGN_W / 2 - (i - 0.5) * w)
    T.img(x, 0, w + 1, T.DESIGN_H, 'rect', T.withA(c, a))
  end
end
