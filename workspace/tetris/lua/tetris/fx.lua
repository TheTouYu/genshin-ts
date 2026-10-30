--[[==========================================================================
  tetris/fx.lua —— 客户端 UI 特效引擎（v5.0）
  --------------------------------------------------------------------------
  用户原话（2026-10-29 返工第四条）：「四个角色技能，和没做一样——按钮、触发动画、
  音效、文案、说明、主题色一点都没做」。本模块负责其中的「看得见的那一秒」：
  全屏闪光 / 环波扩散 / 粒子（火花·碎片·冰晶·叶·花瓣·雷楔）/ 横扫带 /
  角色名卡（主题色底板 + 徽记 + 光扫）/ 屏幕四边呼吸光 / 棋盘描边脉冲 /
  上浮文字 / 特效层抖动。

  三条硬技术约束（违反就白做，真机实证）：
    ① 图像只能用**模板实例** `game.InstantiateClientUIControl(guid, root)`；
       图元形状靠 `ctl:SetImage(Enum.ImageSource.StaticReference, id)` 换内置六类代理图元
       （rect 100001 / circle 100002 / triangle 100003 / fourstar 100004 /
        fivestar 100005 / ring 100006，见 main.lua:79 同一张表）。
    ② **alpha 只能走 imageColor 的高字节**（ARGB，如 0xCC7BC043）——SetVisible 对实例
       在真机靠不住（main.lua 的注释与 D703 日志实证）。文字透明度走 fontColor 高字节。
    ③ **对象池**：每帧/每次特效都新建实例会盖住 200 个棋盘格并撞控件上限（main 注释
       记的 430 上限）。所以本模块在第一次用到时一次性建 **59 个 image + 4 个 textbox**
       共 63 个控件，之后只改坐标/尺寸/颜色；池满了**复用最老的**（每组一个环形游标）。

  性能：`update(dt)` 只遍历「活着」的槽位；热路径用**建池时预绑定的写函数**
  （`function(x,y) ctl:SetAnchoredPosition(x,y) end`）→ 每帧零闭包分配，调用点仍是
  `pcall(w, x, y)` 护栏（一处抛错只丢那一件，不中断整帧）。冷路径（建池/出生）走
  main 传入的 trySet/tryCall，保留它们的枚举映射与失败日志。
  自测：`fx.bench(1500)` 用 os.clock 跑 1500 帧 → 返回 { frames, ms, msPerFrame, active }。

  模块契约（docs/research/lua-module-contract.md）：未挂载模块、只被 require；
  顶层不碰 game / root / 控件；return 恰好 1 个表；全部函数容错不抛错。

  对外 API（签名由 Lead 接线，勿改）
    M.new(spec) -> fx
      spec = { game, rootOf, W, H, trySet, tryCall, sfx, colorOf,
               tpl = { card = <image 模板 guid>, text = <textbox 模板 guid>, ring = <可选> },
               bannerText = true|false }   -- false（默认）：名卡不画字（main 的 topBanner 已在写）
    fx.update(dt) / fx.clear() / fx.active()
    fx.burst(kind, o)      kind = 'flash'|'ring'|'spark'|'shard'|'wave'|'frost'|'vine'|'bolt'|'petal'
    fx.banner(role, title, sub, dur)
    fx.edgeGlow(role, dur) / fx.boardOutline(role, dur)
    fx.floatText(txt, x, y, color, size, dur)
    fx.shake(amp, dur)     —— **只抖特效层**：整屏（200 格+4 框）抖动由 main 的 startShake 负责
    fx.bench(n) / fx.stats()
========================================================================]]

local M = {}

M.VERSION = 'v5.0'

-- 内置图元 id（与 main.lua:79 的 BG_IMG 同源；真机为「六类代理图元」）
local IMG = { rect = 100001, circle = 100002, triangle = 100003,
              fourstar = 100004, fivestar = 100005, ring = 100006 }

-- 槽位模式（数值码，update 里走表分派，比字符串比较省）
local M_FLASH, M_EDGE, M_FRAME, M_PART, M_RING, M_BAND, M_CARD, M_TEXT =
  1, 2, 3, 4, 5, 6, 7, 8

-- 池容量（一次建好，之后只复用）。**合计必须 = 24**：Lead 的判据是"同一时刻在屏的
-- fx 控件 ≤ 24 个"（池比这个数大就会在狂按技能时堆到 60+，真机掉帧）。分配依据是
-- "一次完整技能反馈"的最坏并集：闪1 + 边缘光4 + 棋盘描边4 + 粒子5 + 环2 + 横扫带2
-- + 名卡3 + 文字3 = 24。
local CAP = { flash = 1, edge = 4, frame = 4, part = 5, ring = 2,
              band = 2, card = 3, text = 3 }

-- 粒子子型（part 通道里的形状/运动谱系）
local P_SPARK, P_SHARD, P_ICE, P_LEAF, P_PETAL, P_BOLT = 1, 2, 3, 4, 5, 6

local TAU = math.pi * 2

-- ── 颜色工具：ARGB（alpha 高字节）────────────────────────────────────────────
local function argb(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local function rgbOf(c)
  c = tonumber(c) or 4294967295
  if c < 0 then c = c + 4294967296 end      -- 负数（int32 视图）也能拆
  return math.floor(c / 65536) % 256, math.floor(c / 256) % 256, math.floor(c) % 256
end
local function setA(r, g, b, a)
  if a < 0 then a = 0 end
  if a > 255 then a = 255 end
  return math.floor(a) * 16777216 + r * 65536 + g * 256 + b
end
local function clamp01(p) if p < 0 then return 0 elseif p > 1 then return 1 end return p end
local function easeOut(p) p = clamp01(p) return 1 - (1 - p) * (1 - p) end
local function easeIn(p) p = clamp01(p) return p * p end

-- 确定性 LCG（用例/出图可复现；不用 math.random）
local rseed = 20261029
local function rf()                                  -- [0,1)
  rseed = (rseed * 1103515245 + 12345) % 2147483648
  return (rseed // 65536) / 32768
end
local function rz(a, b) return a + (b - a) * rf() end -- [a,b)

-- ===========================================================================
-- M.new(spec) —— 建引擎状态（**不建控件**：第一次真要放特效时才建池）
--   为什么懒建：main 在 OnStart 里建 200 格；池要在格子之后建，层序才天然压在棋盘上
--   （真机层序=实例化顺序，挪不动），也避免开局就多 63 个控件。
-- ===========================================================================
M.new = function(spec)
  spec = type(spec) == 'table' and spec or {}
  local game = spec.game
  local tpl = type(spec.tpl) == 'table' and spec.tpl or {}
  local S = {
    game = game,
    tpl = tpl,
    rootOf = spec.rootOf,
    Wof = spec.W,
    Hof = spec.H,
    trySet = spec.trySet,
    tryCall = spec.tryCall,
    sfx = spec.sfx,
    -- quiet=true ⇒ 不播 burst 音（main 用 SFX.skill[role] 统一播时用，避免同帧两条音）
    quiet = spec.quiet == true,
    colorOf = spec.colorOf,
    -- 名卡自己带字（Lead 要"卡片内部居中文案"）。若 main 的 topBanner 已在写同一句，
    -- 传 bannerText=false 关掉 fx 这份，避免两处重影。
    bannerText = spec.bannerText ~= false,
    ready = false, dead = false,
    slot = {}, lo = {}, hi = {}, cur = {},
    n = 0,                                  -- 存活特效数
    W = 1280, H = 720,
    -- 棋盘矩形（中心原点，全宽全高）：环波/描边/名卡的参照系。main 传 spec.boardRect；
    -- 缺省按 10 列 × 28 + 2 间距的老棋盘（300×600）兜底，降级也不越界。
    bw = tonumber(type(spec.boardRect) == 'table' and spec.boardRect.w) or 300,
    bh = tonumber(type(spec.boardRect) == 'table' and spec.boardRect.h) or 600,
    -- 棋盘中心（相对屏幕中心）。单人=0,0；双盘时玩家盘在左/右，特效必须跟着走，
    -- 否则环波/浮字会炸在**中缝**而不是玩家盘上（2026-10-29 出图实测）。
    bx = tonumber(type(spec.boardRect) == 'table' and spec.boardRect.cx) or 0,
    by = tonumber(type(spec.boardRect) == 'table' and spec.boardRect.cy) or 0,
    edgeT = 0, edgeDur = 0, edgeRole = nil,
    frameT = 0, frameDur = 0, frameRole = nil,
    shakeAmp = 0, shakeT = 0, shakeDur = 0, sdx = 0, sdy = 0,
    sfxCount = 0, logN = 0,
  }

  local function tw(ctl, name, ...)
    -- trySet / tryCall 可能没传（降级）：没有护栏就直接跳过（宁可不画，也不中断整帧）
    if type(S.trySet) ~= 'function' then return false end
    local f = (name:sub(1, 1) == ':') and S.tryCall or S.trySet
    if type(f) ~= 'function' then return false end
    return f(ctl, name:gsub('^:', ''), ...)
  end

  local function setImg(ctl, id)
    -- SetImage 用枚举形态，失败回落字符串形态（main.lua:2407 同一处理）
    local enumIS = (type(Enum) == 'table' and Enum.ImageSource) or nil
    local ok = false
    if type(S.tryCall) == 'function' then
      if enumIS and enumIS.StaticReference ~= nil then
        ok = S.tryCall(ctl, 'SetImage', enumIS.StaticReference, id)
      end
      if not ok then ok = S.tryCall(ctl, 'SetImage', 'StaticReference', id) end
    end
    return ok
  end

  local function park(s)
    s.on = 0
    s.kind = 0
    local c = s.ctl
    if not c then return end
    pcall(s.wSize, 1, 1)
    pcall(s.wPos, 0, -4000)
    if s.m == M_TEXT then pcall(s.wText, '') else pcall(s.wCol, 0) end
    s.seg, s.segN, s.rotDone, s.imgRing = nil, nil, nil, s.imgRing
  end

  -- ── 建池：一次性实例化 59 image + 4 textbox ────────────────────────────────
  local function ensure()
    if S.ready then return true end
    if S.dead then return false end
    if type(S.game) ~= 'table' then S.dead = true return false end
    local root = type(S.rootOf) == 'function' and S.rootOf() or nil
    local cardG = tonumber(tpl.card) or tonumber(tpl.fx)
    local textG = tonumber(tpl.text)
    if not root or not cardG then
      S.dead = true
      print('fx pool dead :: root=' .. tostring(root) .. ' card=' .. tostring(cardG))
      return false
    end
    local function newImg()
      local ok, c = pcall(function() return S.game.InstantiateClientUIControl(cardG, root) end)
      if ok and c then return c end
      return nil
    end
    local function newTxt()
      if not textG then return nil end
      local ok, c = pcall(function() return S.game.InstantiateClientUIControl(textG, root) end)
      if ok and c then return c end
      return nil
    end
    local made, bad = 0, 0
    local function add(m, n, img)
      if m == M_TEXT and not textG then return end
      S.lo[m], S.cur[m] = #S.slot + 1, #S.slot + 1
      for i = 1, n do
        local ctl = (m == M_TEXT) and newTxt() or newImg()
        if not ctl then bad = bad + 1
        else
          made = made + 1
          local s = { m = m, i = i, on = 0, kind = 0, ctl = ctl }
          -- 预绑定写函数：热路径 pcall(s.wPos, x, y)，零闭包分配（见文件头 性能 段）
          s.wPos  = function(x, y) ctl:SetAnchoredPosition(x, y) end
          s.wSize = function(w, h) ctl:SetSizeDelta(w, h) end
          s.wCol  = function(c) ctl.imageColor = c end
          s.wText = function(t) ctl.text = t end
          s.wFont = function(c) ctl.fontColor = c end
          s.wFs   = function(n) ctl.fontSize = n end
          if m == M_TEXT then
            tw(ctl, ':SetSizeDelta', 420, 44)
            tw(ctl, 'horizontalAlignment', 'Middle')
            tw(ctl, 'verticalAlignment', 'Middle')
            tw(ctl, 'bgColor', 0)
            s.wText('')
          elseif img then
            setImg(ctl, img)
          end
          pcall(s.wSize, 1, 1)
          pcall(s.wPos, 0, -4000)
          if m ~= M_TEXT then pcall(s.wCol, 0) end
          S.slot[#S.slot + 1] = s
        end
      end
      S.hi[m] = #S.slot
    end
    -- 顺序 = 层序（真机层序铁律：后实例化的在上）。文字最后建 ⇒ 永远压在特效之上。
    add(M_FLASH, CAP.flash, IMG.rect)
    add(M_EDGE,  CAP.edge,  IMG.rect)
    add(M_FRAME, CAP.frame, IMG.rect)
    add(M_PART,  CAP.part,  IMG.circle)
    add(M_RING,  CAP.ring,  IMG.ring)
    add(M_BAND,  CAP.band,  IMG.rect)
    add(M_CARD,  CAP.card,  IMG.rect)
    add(M_TEXT,  CAP.text,  nil)
    S.ready = #S.slot > 0
    S.dead = not S.ready
    print('fx pool ' .. (S.ready and 'ok' or 'FAIL') .. ' ctl=' .. tostring(made)
      .. ' bad=' .. tostring(bad) .. ' text=' .. tostring(S.hi[M_TEXT] and (S.hi[M_TEXT] - S.lo[M_TEXT] + 1) or 0))
    return S.ready
  end

  -- 文字槽后补：main 传的 tpl.text 在 fxInit 那一刻可能还是 nil（模板 guid 要等
  -- 第一次建卡/结算文本才探测出来，实测 `fx pool ok ctl=21 bad=0 text=0`）。
  -- 所以提供 setTpl：拿到 text guid 后再补建 3 个文字槽（池上限仍是 24）。
  local function buildText(tg)
    tg = tonumber(tg)
    if not tg then return false end
    if S.hi[M_TEXT] and S.hi[M_TEXT] > 0 then return true end
    local root = type(S.rootOf) == 'function' and S.rootOf() or nil
    if not root then return false end
    local made = 0
    S.lo[M_TEXT], S.cur[M_TEXT] = #S.slot + 1, #S.slot + 1
    for _ = 1, CAP.text do
      local ok, ctl = pcall(function() return S.game.InstantiateClientUIControl(tg, root) end)
      if ok and ctl then
        made = made + 1
        local s = { m = M_TEXT, i = made, on = 0, kind = 0, ctl = ctl }
        s.wPos = function(x, y) ctl:SetAnchoredPosition(x, y) end
        s.wSize = function(w, h) ctl:SetSizeDelta(w, h) end
        s.wCol = function(c) ctl.imageColor = c end
        s.wText = function(t) ctl.text = t end
        s.wFont = function(c) ctl.fontColor = c end
        s.wFs = function(n) ctl.fontSize = n end
        tw(ctl, ':SetSizeDelta', 420, 44)
        tw(ctl, 'horizontalAlignment', 'Middle')
        tw(ctl, 'verticalAlignment', 'Middle')
        tw(ctl, 'bgColor', 0)
        pcall(s.wText, '')
        pcall(s.wSize, 1, 1)
        pcall(s.wPos, 0, -4000)
        S.slot[#S.slot + 1] = s
      end
    end
    S.hi[M_TEXT] = #S.slot
    print('fx text slots later ok n=' .. tostring(made))
    return made > 0
  end

  -- ── 池取槽：组内环形游标（满了自然复用最老的）──────────────────────────────
  local function take(m)
    if not S.ready then return nil end
    local lo, hi = S.lo[m], S.hi[m]
    if not lo or not hi or hi < lo then return nil end
    local i = S.cur[m] or lo
    if i < lo or i > hi then i = lo end
    S.cur[m] = (i >= hi) and lo or (i + 1)
    local s = S.slot[i]
    if not s then return nil end
    if s.on == 1 then S.n = S.n - 1 end        -- 复用最老的：先把旧的从存活计数里摘掉
    return s
  end

  local function on(s)                        -- 出生登记
    if not s then return end
    s.on = 1
    s.t = 0
    S.n = S.n + 1
  end

  -- ── 出生器们 ───────────────────────────────────────────────────────────────
  local function spawnFlash(color, a0, dur)
    -- a0 统一用 0..255 的 alpha 刻度（与其余槽位同一把尺子；曾有版本混用 0..1 导致闪不出来）
    local s = take(M_FLASH)
    if not s then return end
    local r, g, b = rgbOf(color)
    s.kind = 1
    s.a0, s.dur = tonumber(a0) or 80, dur or 0.26
    s.r, s.g, s.b = r, g, b
    pcall(s.wPos, 0, 0)
    pcall(s.wSize, S.W + 60, S.H + 60)
    pcall(s.wCol, setA(r, g, b, math.floor(255 * a0)))
    on(s)
  end

  -- 环波：**以棋盘矩形为界**的椭圆扩散（Lead 2026-10-29 打回"直径 700~900px 的同心圆
  -- 盖到左右两栏，像随手画圈"）。做法：环的宽高各自按 easeOut 涨到 (bw, bh) 就淡出，
  -- 于是它永远贴在棋盘里侧边缘收束，不会越过棋盘去糊 HUD/预览。
  -- 图元优先用内置 ring(100006)；真机 SetImage 失败就降级成 circle —— 都靠 SetSizeDelta
  -- 拉成椭圆，因此"环贴着棋盘边"这条在两种图元下都成立。
  local ringPrimOk = nil        -- nil = 未探测；false = 只能用 circle
  local function spawnRing(x, y, color, a0, dur, delay)
    local lo, hi = S.lo[M_RING], S.hi[M_RING]
    if not lo or not hi then return false end
    if ringPrimOk == nil then
      local probe = S.slot[lo]
      ringPrimOk = (probe and setImg(probe.ctl, IMG.ring)) and true or false
      if not ringPrimOk then print('fx ring degrade :: SetImage(100006) 失败，改用 circle 椭圆') end
    end
    -- 调用方传 (0,0) 表示"棋盘中心" ⇒ 这里加上棋盘偏移（双盘时玩家盘不在屏幕中心）
    if x == 0 and y == 0 then x, y = (S.bx or 0), (S.by or 0) end
    local s = take(M_RING)
    if not s then return false end
    if not ringPrimOk and not s.imgCircle then
      setImg(s.ctl, IMG.circle)
      s.imgCircle = true
    end
    local r, g, b = rgbOf(color)
    s.kind = 5                                  -- M_RING
    s.x0, s.y0 = x, y
    s.delay = tonumber(delay) or 0
    s.a0, s.dur = tonumber(a0) or 200, dur or 0.7
    s.r, s.g, s.b = r, g, b
    pcall(s.wPos, x, y)
    pcall(s.wSize, 40, 40)
    pcall(s.wCol, setA(r, g, b, 0))
    on(s)
    return true
  end

  -- 一对环：内环快、外环慢半拍 ⇒ 读起来是"扩散"，不是"一个圈在变大"
  local function spawnRingPair(x, y, col, dur)
    local d = dur or 0.8
    -- v5.4 美术评审 A12：「椭圆太实、压在棋盘/按钮上」⇒ α 从 225/170 收到 130/95，
    -- 环只作"盘面被点了一下"的提示，不再当成覆盖层。
    spawnRing(x, y, col, 130, d * 0.72, 0)
    spawnRing(x, y, col, 95, d, 0.12)
  end

  local function spawnPart(kind, x, y, color, n, spread, dur)
    local r, g, b = rgbOf(color)
    n = math.floor(tonumber(n) or 8)
    if n < 1 then n = 1 end
    if n > CAP.part then n = CAP.part end
    -- 传 (0,0) = "棋盘中心"（双盘时坐标要跟 S.bx/S.by 走）
    if x == 0 and y == 0 then x, y = (S.bx or 0), (S.by or 0) end
    spread = tonumber(spread) or 120
    for k = 1, n do
      local s = take(M_PART)
      if not s then break end
      local ang = TAU * (k - 1) / n + rz(0, 0.5)
      local sp = rz(0.55, 1.25) * spread
      s.kind = 4                 -- M_PART
      s.pk = kind
      s.x0, s.y0 = x + math.cos(ang) * rz(4, 26), y + math.sin(ang) * rz(4, 26)
      s.vx, s.vy = math.cos(ang) * sp, math.sin(ang) * sp
      s.dur = dur or (kind == P_PETAL and 1.5 or 0.75)
      s.a0 = (kind == P_ICE or kind == P_LEAF) and 210 or 235
      s.r, s.g, s.b = r, g, b
      s.rot = rz(-40, 40)
      s.spin = rz(-220, 220)
      s.sway = rz(6, 26)
      s.seed = rz(0, TAU)
      local sz
      if kind == P_ICE then sz = rz(14, 24)
      elseif kind == P_LEAF then sz = rz(12, 20)
      elseif kind == P_PETAL then sz = rz(10, 18)
      elseif kind == P_BOLT then sz = rz(6, 10)
      elseif kind == P_SHARD then sz = rz(16, 30)
      else sz = rz(8, 14) end
      s.w0 = sz
      s.h0 = (kind == P_SHARD) and rz(6, 10) or sz
      -- 形状：冰晶/雷楔用三角，叶用四芒星，花瓣/火花用圆
      local prim = IMG.circle
      if kind == P_ICE then prim = IMG.triangle
      elseif kind == P_LEAF then prim = IMG.fourstar
      elseif kind == P_BOLT then prim = IMG.rect
      elseif kind == P_PETAL then prim = IMG.fiveStar or IMG.fivestar
      elseif kind == P_SHARD then prim = IMG.rect end
      setImg(s.ctl, prim)
      pcall(s.wSize, s.w0, s.h0)
      pcall(s.wPos, s.x0, s.y0)
      pcall(s.wCol, setA(r, g, b, math.floor(s.a0)))
      on(s)
    end
  end

  local function spawnBand(x0, x1, y, h, color, a0, dur, n)
    local r, g, b = rgbOf(color)
    n = math.floor(tonumber(n) or 5)
    if n < 1 then n = 1 end
    if n > CAP.band then n = CAP.band end
    for k = 1, n do
      local s = take(M_BAND)
      if not s then break end
      s.kind = 6                 -- M_BAND
      s.seg, s.segN = k, n
      s.x0, s.x1 = x0, x1
      s.y0 = y
      s.hh = h
      s.a0 = a0 or 150
      s.dur = dur or 0.55
      s.r, s.g, s.b = r, g, b
      pcall(s.wSize, 14, h)
      pcall(s.wPos, x0, y)
      pcall(s.wCol, setA(r, g, b, 0))
      on(s)
    end
  end

  -- 名卡：**紧凑卡片**（Lead 2026-10-29 打回"一整条横贯屏幕的半透明绿带 + 左端挂个空心小圆"）。
  -- 结构 = 外框(主题色) + 内板(深色半透明) + 底部高光条，三层都是 rounded-rect 图元
  -- （cell 模板的 100001 自带小圆角，这是本工程可用的"圆角"来源，没有第二个圆角图元）。
  -- 位置 = 棋盘正上方（贴 boardRect 上沿外侧）；屏幕不够高时按可用高度自适应压扁，
  -- 但**永不压进棋盘**（这是 420×96 在 1280×720 上会掉进棋盘里、必须收紧的原因）。
  local cardAt = nil
  local function cardGeom()
    local ch = 96
    local room = (S.H / 2) - (S.bh / 2)        -- 棋盘上沿到屏幕顶的可用带高
    local cy
    if room >= ch + 20 then
      -- 高画布（1600×900 这类）：卡片放**棋盘正上方**（Lead 指定位）
      cy = S.bh / 2 + ch / 2 + 6
    else
      -- 矮画布（1280×720）：棋盘上方只剩 60px，且顶部那条带子已经被常驻键位提示占着
      -- （实测：mobile 画布 botBanner 渲染在屏幕顶部）；这时把卡片放**棋盘下方**那条空带。
      ch = math.max(52, room - 8)
      cy = -(S.bh / 2) - ch / 2 - 6
      if cy - ch / 2 < -(S.H / 2) + 4 then cy = -(S.H / 2) + 4 + ch / 2 end
    end
    local cw = math.min(420, S.W - 40)
    -- 双盘：整张卡跟着玩家盘水平平移（否则名卡挂在中缝上）
    return (S.bx or 0), cy + (S.by or 0), cw, ch
  end

  local function spawnCard(role, dur)
    local col = type(S.colorOf) == 'function' and S.colorOf(role) or 4286566250
    local r, g, b = rgbOf(col)
    local cx, cy, cw, ch = cardGeom()
    cardAt = { cx = cx, cy = cy, cw = cw, ch = ch, dur = dur or 1.4 }
    -- ① 外框：比内板大 4px 的主题色板（露出 2px 描边）
    local s1 = take(M_CARD)
    if s1 then
      s1.kind, s1.cpart = 7, 1
      s1.a0, s1.dur = 235, dur or 1.4
      s1.r, s1.g, s1.b = r, g, b
      pcall(s1.wSize, cw + 4, ch + 4)
      pcall(s1.wPos, cx, cy)
      pcall(s1.wCol, 0)
      on(s1)
    end
    -- ② 内板：深墨绿/深青底（半透明，压在棋盘外的背景上不抢字）
    local s2 = take(M_CARD)
    if s2 then
      s2.kind, s2.cpart = 7, 2
      s2.a0, s2.dur = 214, dur or 1.4
      -- v5.2（5 份美术评审一致点名"近黑大色块破纸感"）：内板改奶油白，边框保持角色色，
      -- 文字随之改深墨色（见 spawnText 调用处的 col/deep 选择）。
      s2.r, s2.g, s2.b = 252, 250, 244
      pcall(s2.wSize, cw, ch)
      pcall(s2.wPos, cx, cy)
      pcall(s2.wCol, 0)
      on(s2)
    end
    -- ③ 底部高光条：卡片下沿一条主题色亮线，跟着卡一起淡出
    local s3 = take(M_CARD)
    if s3 then
      s3.kind, s3.cpart = 7, 3
      s3.a0, s3.dur = 245, dur or 1.4
      s3.r, s3.g, s3.b = r, g, b
      pcall(s3.wSize, cw - 44, 3)
      pcall(s3.wPos, cx, cy - ch / 2 + 8)
      pcall(s3.wCol, 0)
      on(s3)
    end
  end

  local function spawnText(mode, txt, x, y, color, size, dur, rise)
    local s
    if mode == 'float' then
      -- 浮字专用槽：最后两个 TEXT 槽（前两个留给名卡）
      local hi = S.hi[M_TEXT]
      local lo = S.lo[M_TEXT]
      if not hi or not lo then return end
      local pool = hi - lo + 1
      if pool < 3 then return end
      local i = S.cur[M_TEXT] or (lo + 2)
      if i < lo + 2 or i > hi then i = lo + 2 end
      S.cur[M_TEXT] = (i >= hi) and (lo + 2) or (i + 1)
      s = S.slot[i]
    else
      -- 名卡文字：固定占前两个槽
      local lo = S.lo[M_TEXT]
      if not lo then return end
      s = S.slot[lo + ((mode == 'sub') and 1 or 0)]
    end
    if not s then return end
    if s.on == 1 then S.n = S.n - 1 end
    local r, g, b = rgbOf(color)
    s.kind = 8
    s.a0, s.dur = 255, dur or 1.6
    s.rise = rise or 0
    s.r, s.g, s.b = r, g, b
    s.x0, s.y0 = x, y
    tw(s.ctl, 'fontSize', math.floor(tonumber(size) or 22))
    pcall(s.wText, tostring(txt or ''))
    pcall(s.wSize, math.min(S.W - 80, 620), math.floor((tonumber(size) or 22) * 1.6 + 6))
    pcall(s.wPos, x, y)
    pcall(s.wFont, setA(r, g, b, 255))
    on(s)
  end

  -- ── 每帧：分模式推进（全部走 pcall(预绑定函数, …)，零闭包）─────────────────
  local UPD = {}
  UPD[1] = function(s, p)                       -- 全屏闪光
    pcall(s.wCol, setA(s.r, s.g, s.b, s.a0 * (1 - p) ^ 1.8))
  end
  UPD[2] = function(s, p)                       -- 边缘光（呼吸）
    local env = math.min(1, (s.dur - s.t) / 0.28)
    local b = 0.42 + 0.58 * math.abs(math.sin(s.t * 5.2))
    local a = s.a0 * env * b
    local i = s.i
    if i == 1 then pcall(s.wPos, 0, S.H / 2 - 2)
    elseif i == 2 then pcall(s.wPos, 0, -(S.H / 2 - 2))
    elseif i == 3 then pcall(s.wPos, -(S.W / 2 - 2), 0)
    else pcall(s.wPos, S.W / 2 - 2, 0) end
    pcall(s.wCol, setA(s.r, s.g, s.b, a))
  end
  UPD[3] = function(s, p)                       -- 棋盘描边：绕矩形转一圈的追光
    local env = math.min(1, (1 - p) / 0.2) * math.min(1, p / 0.06)
    -- 每圈 0.9s；4 条边按 i=1..4（左/右/上/下）各占 1/4 相位
    local ph = (s.t * 1.1) % 1
    local seg = (s.i - 1) / 4
    local d = math.abs(ph - seg)
    if d > 0.5 then d = 1 - d end
    local lit = math.max(0, 1 - d / 0.26)          -- 只有相位接近时才亮
    local a = s.a0 * env * (0.10 + 0.90 * lit * lit)
    pcall(s.wCol, setA(s.r, s.g, s.b, a))
    local grow = 4 + 3 * lit
    if s.i <= 2 then pcall(s.wSize, grow, 2 * s.hh)
    else pcall(s.wSize, 2 * s.hw, grow) end
  end
  UPD[4] = function(s, p, dt)                   -- 粒子谱系
    local q = p
    local x, y = s.x0, s.y0
    local dtf = s.dur
    if s.pk == P_SPARK then
      x = s.x0 + s.vx * dtf * q * (1 - 0.35 * q)
      y = s.y0 + s.vy * dtf * q * (1 - 0.35 * q) - 34 * q * q
    elseif s.pk == P_SHARD then
      x = s.x0 + s.vx * dtf * q
      y = s.y0 + s.vy * dtf * q + 260 * q * q
    elseif s.pk == P_ICE then
      x = s.x0 + math.sin(q * 3.1 + s.seed) * s.sway
      y = s.y0 + 150 * q * (1 - 0.4 * q)
    elseif s.pk == P_LEAF then
      local ang = s.seed + q * 2.4
      local rad = 26 + 150 * q
      x = s.x0 + math.cos(ang) * rad
      y = s.y0 + math.sin(ang) * rad * 0.62 + 90 * q
    elseif s.pk == P_PETAL then
      x = s.x0 + math.sin(q * 3.4 + s.seed) * (s.sway + 10) + s.vx * dtf * q * 0.5
      y = s.y0 + s.vy * dtf * q - 60 * q + 40 * q * q
    else                                          -- P_BOLT：原地抖动
      local flick = 0.55 + 0.45 * math.abs(math.sin(s.t * 42 + s.seed))
      s.a0 = 210 * flick
      x = s.x0 + math.sin(s.t * 60) * 2
      y = s.y0
    end
    s.rot = (s.rot or 0) + (s.spin or 0) * dt
    pcall(s.wPos, x + S.sdx, y + S.sdy)
    local shrink = (s.pk == P_ICE or s.pk == P_LEAF) and (1 - 0.3 * q) or (1 - 0.55 * q)
    pcall(s.wSize, math.max(2, s.w0 * shrink), math.max(2, s.h0 * shrink))
    local a = s.a0 * (1 - q) ^ 0.9
    if s.pk == P_PETAL then a = s.a0 * math.min(1, q * 6) * (1 - q) end
    pcall(s.wCol, setA(s.r, s.g, s.b, a))
  end
  UPD[5] = function(s, p, dt)                   -- 环波（椭圆，止于棋盘矩形）
    local q = clamp01((s.t - s.delay) / math.max(0.05, s.dur - s.delay))
    local k = easeOut(q)
    local w = 44 + (S.bw - 44) * k
    local h = 44 + (S.bh - 44) * k
    -- 到边就淡：0.55 之前保持满亮，之后一路收到 0（贴边那一下正好看不见）
    local a = s.a0 * (1 - k) ^ 0.8
    pcall(s.wPos, s.x0 + S.sdx, s.y0 + S.sdy)
    pcall(s.wSize, w, h)
    pcall(s.wCol, setA(s.r, s.g, s.b, a))
  end
  UPD[6] = function(s, p)                       -- 横扫带（错峰 ⇒ 一道波从一边推到另一边）
    local off = (s.seg - 1) / math.max(1, s.segN) * 0.35
    local q = clamp01((p - off) / (1 - 0.35))
    local x = s.x0 + (s.x1 - s.x0) * easeOut(q)
    local a = s.a0 * math.sin(math.pi * q)
    pcall(s.wPos, x + S.sdx, s.y0 + S.sdy)
    pcall(s.wCol, setA(s.r, s.g, s.b, a))
  end
  UPD[7] = function(s, p)                       -- 名卡：滑入 + 淡出（框/板/条就位）
    if not cardAt then return end
    local inn = easeOut(math.min(1, p / 0.16))
    local env = math.min(1, (1 - p) / 0.22)
    local a = s.a0 * inn * env
    local slide = (1 - inn) * 34                    -- 从下方滑入 34px（"抬起来"的手感）
    local cx, cy = cardAt.cx, cardAt.cy
    if s.cpart == 3 then cy = cy - cardAt.ch / 2 + 8 end
    pcall(s.wPos, cx + S.sdx, cy - slide + S.sdy)
    pcall(s.wCol, setA(s.r, s.g, s.b, a))
  end
  UPD[8] = function(s, p)                       -- 文字：名卡淡入淡出 / 浮字上浮
    local inn = easeOut(math.min(1, p / 0.16))
    local env = math.min(1, (1 - p) / 0.3)
    local y = s.y0 + (s.rise or 0) * p + S.sdy
    local x = s.x0 + S.sdx
    pcall(s.wPos, x, y)
    pcall(s.wFont, setA(s.r, s.g, s.b, s.a0 * inn * env))
  end

  -- ===========================================================================
  -- fx.update(dt) —— 唯一每帧入口（main 的 FN.skillTick 每帧 pcall 调一次）
  --   容错：dt 非法/过大 → 收敛到 1/30；引用不到的东西一律 nil 检查后再用
  -- ===========================================================================
  local fx = {}
  fx.update = function(dt)
    if not S.ready then return end
    dt = tonumber(dt)
    if not dt or dt ~= dt or dt <= 0 then return end
    if dt > 0.5 then dt = 1 / 30 end
    local W = type(S.Wof) == 'function' and tonumber(S.Wof()) or nil
    local H = type(S.Hof) == 'function' and tonumber(S.Hof()) or nil
    if W and W > 0 then S.W = W end
    if H and H > 0 then S.H = H end
    -- 抖屏（只抖特效层）——强度线性衰减
    if S.shakeT > 0 then
      S.shakeT = S.shakeT - dt
      local k = math.max(0, S.shakeT) / math.max(0.001, S.shakeDur)
      S.sdx = math.sin(S.shakeT * 96) * S.shakeAmp * k
      S.sdy = math.cos(S.shakeT * 78) * S.shakeAmp * k * 0.8
      if S.shakeT <= 0 then S.shakeT, S.sdx, S.sdy = 0, 0, 0 end
    end
    if S.n <= 0 then
      if S.edgeT > 0 then S.edgeT = S.edgeT - dt end
      if S.frameT > 0 then S.frameT = S.frameT - dt end
      return
    end
    local slot = S.slot
    for i = 1, #slot do
      local s = slot[i]
      if s and s.on == 1 then
        s.t = s.t + dt
        local dur = s.dur or 0.5
        local p = s.t / (dur > 0.016 and dur or 0.5)
        if p >= 1 then
          park(s)
          S.n = S.n - 1
        else
          local f = UPD[s.kind]
          if f then f(s, p, dt) else park(s) S.n = S.n - 1 end
        end
      end
    end
    -- 持续类（边缘光 / 描边）另起定时器：它们是"活着的背景"，不计入 S.n
    if S.edgeT > 0 then S.edgeT = S.edgeT - dt end
    if S.frameT > 0 then S.frameT = S.frameT - dt end
  end

  -- ── fx.burst(kind, o)：9 种效果，每种都是"多元素合成"（单元素不算看得见）────────
  fx.burst = function(kind, o)
    if not ensure() then return false end
    o = type(o) == 'table' and o or {}
    local k = tostring(kind or 'ring')
    local role = o.role
    local col = tonumber(o.color) or (type(S.colorOf) == 'function' and S.colorOf(role)) or 4286566250
    local x = tonumber(o.x) or 0
    local y = tonumber(o.y) or 0
    local n = tonumber(o.n) or 8
    local dur = tonumber(o.dur)
    if k == 'flash' then
      spawnFlash(col, 62, dur or 0.24)
      spawnPart(P_SPARK, x, y, col, 6, 150, 0.5)
    elseif k == 'ring' then
      spawnRingPair(x, y, col, dur or 0.72)
      spawnPart(P_SPARK, x, y, col, 8, 130, dur or 0.6)
    elseif k == 'spark' then
      spawnPart(P_SPARK, x, y, col, math.min(n, 14), 170, dur or 0.72)
      spawnRingPair(x, y, col, 0.6)
    elseif k == 'shard' then
      spawnPart(P_SHARD, x, y, col, math.min(n, 10), 210, dur or 0.8)
      spawnFlash(col, 34, 0.2)
    elseif k == 'wave' then
      spawnBand(-S.W / 2 + 60, S.W / 2 - 60, y, 300, col, 160, dur or 0.6, 5)
      spawnRingPair(x, y, col, 0.65)
    elseif k == 'frost' then                    -- 甘雨：霜蓝闪 + 环波 + 冰晶上浮 + 冷横扫
      spawnFlash(col, 52, 0.3)
      spawnRingPair(x, y, col, 0.8)
      spawnPart(P_ICE, x, y, col, 7, 90, 1.1)
      spawnBand(-150, 150, y, 600, col, 90, 0.8, 3)
    elseif k == 'vine' then                     -- 纳西妲：草绿闪 + 环波 + 叶旋 + 棋盘描边
      spawnFlash(col, 40, 0.26)
      spawnRingPair(x, y, col, 0.78)
      spawnPart(P_LEAF, x, y, col, 8, 70, 1.15)
      spawnPart(P_SPARK, x, y, col, 5, 190, 0.6)
    elseif k == 'bolt' then                     -- 刻晴：紫闪 + 雷楔短段 + 电火花
      spawnFlash(col, 44, 0.16)
      spawnPart(P_BOLT, x, y, col, 4, 40, 0.42)
      spawnPart(P_SPARK, x, y, col, 9, 230, 0.55)
      spawnRingPair(x, y, col, 0.55)
    elseif k == 'petal' then                    -- 少女：青白闪 + 环波 + 花瓣飘落
      spawnFlash(col, 36, 0.24)
      spawnRingPair(x, y, col, 0.72)
      spawnPart(P_PETAL, x, y, col, 8, 120, 1.35)
    else
      spawnRingPair(x, y, col, 0.7)
    end
    local id = (not S.quiet) and S.sfxIds and S.sfxIds[k]
    if id and type(S.sfx) == 'function' then
      S.sfxCount = S.sfxCount + 1
      pcall(S.sfx, id, true)
    end
    return true
  end

  -- ── fx.banner(role, title, sub, dur)：主题色名卡（紧凑卡片 + 卡内文案）──────────
  fx.banner = function(role, title, sub, dur)
    if not ensure() then return false end
    local d = tonumber(dur) or 1.2
    if d < 0.6 then d = 0.6 end
    if d > 2.4 then d = 2.4 end                   -- 判据：总长 ≤2.5s，别盖住下一次操作
    spawnCard(role, d)
    if S.bannerText and cardAt then
      local col = tonumber(type(S.colorOf) == 'function' and S.colorOf(role)) or 4286566250
      local cx, cy, cw, ch = cardAt.cx, cardAt.cy, cardAt.cw, cardAt.ch
      local fs1 = (ch >= 80) and 26 or 20
      -- 奶油底 ⇒ 标题用角色深色档（原先白字是压在深墨板上）
      local deep = type(S.colorOf) == 'function' and S.colorOf(role) or col
      local dr, dg, db = rgbOf(deep)
      local lum = 0.299 * dr + 0.587 * dg + 0.114 * db
      local k2 = (lum > 110) and (110 / math.max(lum, 1)) or 1
      local titleCol = setA(math.floor(dr * k2), math.floor(dg * k2), math.floor(db * k2), 255)
      spawnText('title', tostring(title or ''), cx, cy + (ch >= 80 and 16 or 8), titleCol, fs1, d, 0)
      if sub and tostring(sub) ~= '' and ch >= 70 then
        spawnText('sub', tostring(sub), cx, cy - 16, 4282664004, 16, d, 0)   -- 深灰 #2E3A42
      end
    end
    return true
  end

  -- ── fx.edgeGlow / boardOutline：持续型（dur 可续；同角色再次调用=延长）───────
  local function ensureEdge(col, dur)
    local r, g, b = rgbOf(col)
    for i = 1, CAP.edge do
      local s = S.slot[(S.lo[M_EDGE] or 1) + i - 1]
      if s then
        if s.on ~= 1 then S.n = S.n + 1 end
        s.on, s.kind, s.i = 1, 2, i
        s.t = -1e-6                  -- 相位从 0 起算（负数也行，update 只累加）
        s.dur = dur
        -- v5.4 重做（美术评审 A12 同族：7px/α150 的硬色带在浅底上像渲染残留）：
        -- 改成 **4px 细描金边**（α 上限 120），四条在四角互相搭接（横条比画布宽 8px），
        -- 读作「结界边线」而不是一条贴边的彩色胶布。
        s.a0 = 120
        s.r, s.g, s.b = r, g, b
        local W, H = S.W, S.H
        if i == 1 then pcall(s.wSize, W + 8, 4) pcall(s.wPos, 0, H / 2 - 2)
        elseif i == 2 then pcall(s.wSize, W + 8, 4) pcall(s.wPos, 0, -(H / 2 - 2))
        elseif i == 3 then pcall(s.wSize, 4, H + 8) pcall(s.wPos, -(W / 2 - 2), 0)
        else pcall(s.wSize, 4, H + 8) pcall(s.wPos, W / 2 - 2, 0) end
        pcall(s.wCol, setA(r, g, b, 0))
      end
    end
  end
  -- 棋盘描边脉冲：4 条贴着 boardRect 的亮边，按"上→右→下→左"顺序轮转发光
  --   （Lead 2026-10-29：沿棋盘矩形转一圈的亮边比大圆更像"接管"）
  local function ensureFrame(col, dur)
    local r, g, b = rgbOf(col)
    local hw, hh = S.bw / 2 + 3, S.bh / 2 + 3
    for i = 1, CAP.frame do
      local s = S.slot[(S.lo[M_FRAME] or 1) + i - 1]
      if s then
        if s.on ~= 1 then S.n = S.n + 1 end
        s.on, s.kind, s.i = 1, 3, i
        s.t = 0
        s.dur = dur
        s.a0 = 235
        s.r, s.g, s.b = r, g, b
        s.hw, s.hh = hw, hh
        -- 双盘时棋盘中心 != 屏幕中心 ⇒ 四条边整体平移到 S.bx/S.by
        local fx0, fy0 = S.bx or 0, S.by or 0
        if i <= 2 then pcall(s.wSize, 4, 2 * hh) pcall(s.wPos, fx0 + ((i == 1) and -hw or hw), fy0)
        else pcall(s.wSize, 2 * hw, 4) pcall(s.wPos, fx0, fy0 + ((i == 3) and hh or -hh)) end
        pcall(s.wCol, setA(r, g, b, 0))
      end
    end
  end

  fx.edgeGlow = function(role, dur)
    if not ensure() then return false end
    local d = tonumber(dur) or 1.0
    if d < 0.4 then d = 0.4 end
    local col = tonumber(type(S.colorOf) == 'function' and S.colorOf(role)) or 4286566250
    ensureEdge(col, d)
    S.edgeT, S.edgeDur, S.edgeRole = d, d, role
    return true
  end

  fx.boardOutline = function(role, dur)
    if not ensure() then return false end
    local d = tonumber(dur) or 0.7
    if d < 0.4 then d = 0.4 end
    local col = tonumber(type(S.colorOf) == 'function' and S.colorOf(role)) or 4286566250
    ensureFrame(col, d)
    S.frameT, S.frameDur, S.frameRole = d, d, role
    return true
  end

  -- ── fx.floatText(txt, x, y, color, size, dur)：上浮文字（→42px，淡出）──────
  fx.floatText = function(txt, x, y, color, size, dur)
    if not ensure() then return false end
    local px, py = tonumber(x) or 0, tonumber(y) or 0
    -- 名卡在场时：浮字别压在卡片上（Lead 2026-10-29：浮字原来落在棋盘里/与名卡冲突）
    if cardAt and math.abs(py - cardAt.cy) < cardAt.ch / 2 + 26 then
      -- 放到名卡**右侧**、同一高度：顶部那条带子名义上归名卡，名卡左右各 210px 以外在
      -- 单人/双屏下都只有背景（棋盘上沿在 bh/2，名卡带在它之上）⇒ 既不压字也不压棋盘。
      -- 为什么不在名卡正上方：浮字要上浮 40px，贴着屏幕顶放会把自己顶出画布（实测被裁）。
      local tx = cardAt.cx + cardAt.cw / 2 + 132
      local wmax = S.W / 2 - 96
      if tx > wmax then tx = wmax end
      px, py = tx, cardAt.cy - 8
    end
    spawnText('float', txt, px, py, tonumber(color) or 4294967295,
      tonumber(size) or 22, math.min(2.4, tonumber(dur) or 1.4), 40)
    return true
  end

  -- ── fx.shake(amp, dur)：只抖特效层（整屏抖动归 main 的 startShake）──────────
  fx.shake = function(amp, dur)
    S.shakeAmp = math.max(0, math.min(24, tonumber(amp) or 0))
    S.shakeDur = math.max(0.05, math.min(0.6, tonumber(dur) or 0.16))
    S.shakeT = S.shakeDur
    return true
  end

  -- ── fx.clear()：场景切换清场（池全部归位）──────────────────────────────────
  fx.clear = function()
    local slot = S.slot
    for i = 1, #slot do
      local s = slot[i]
      if s and s.on == 1 then park(s) end
    end
    S.n = 0
    S.edgeT, S.frameT, S.shakeT = 0, 0, 0
    S.sdx, S.sdy = 0, 0
    cardAt = nil
    return true
  end

  -- 后补模板 guid（典型用法：main 探测出 TPL_TEXT 之后调一次）
  fx.setTpl = function(t)
    if type(t) ~= 'table' then return false end
    for k, v in pairs(t) do
      if tonumber(v) then S.tpl[k] = tonumber(v) end
    end
    if not ensure() then return false end
    local tg = tonumber(S.tpl.text)
    if tg then return buildText(tg) end
    return true
  end

  fx.active = function() return S.n end

  fx.stats = function()
    return { version = M.VERSION, ready = S.ready, dead = S.dead, n = S.n,
             ctl = #S.slot, sfx = S.sfxCount, ringPrim = ringPrimOk,
             W = S.W, H = S.H, bw = S.bw, bh = S.bh, bannerText = S.bannerText,
             quiet = S.quiet, text = (S.hi[M_TEXT] or 0) - (S.lo[M_TEXT] or 0) + 1,
             groups = { flash = { S.lo[M_FLASH] or 0, S.hi[M_FLASH] or 0 },
                        edge = { S.lo[M_EDGE] or 0, S.hi[M_EDGE] or 0 },
                        frame = { S.lo[M_FRAME] or 0, S.hi[M_FRAME] or 0 },
                        part = { S.lo[M_PART] or 0, S.hi[M_PART] or 0 },
                        ring = { S.lo[M_RING] or 0, S.hi[M_RING] or 0 },
                        band = { S.lo[M_BAND] or 0, S.hi[M_BAND] or 0 },
                        card = { S.lo[M_CARD] or 0, S.hi[M_CARD] or 0 },
                        text = { S.lo[M_TEXT] or 0, S.hi[M_TEXT] or 0 } } }
  end

  -- 性能自测：1500 帧，返回毫秒读数（真机有 os.clock；沙箱没有就返回 nil 并说明）
  fx.bench = function(frames)
    local n = math.floor(tonumber(frames) or 1500)
    local clk = (type(os) == 'table' and type(os.clock) == 'function') and os.clock or nil
    if not clk then return { frames = 0, ms = -1, msPerFrame = -1, note = 'no os.clock' } end
    if not ensure() then return { frames = 0, ms = -1, msPerFrame = -1, note = 'no pool' } end
    local t0 = clk()
    for i = 1, n do fx.update(1 / 30) end
    local t1 = clk()
    local ms = (t1 - t0) * 1000
    return { frames = n, ms = ms, msPerFrame = ms / n, active = S.n, ctl = #S.slot }
  end

  -- 音效表（每个 kind 一条；sfx(id, true) 由 main 的 audio 模块执行）
  S.sfxIds = {
    flash = 50884, ring = 50884, spark = 50883, shard = 50872, wave = 40017,
    frost = 40001, vine = 40001, bolt = 50924, petal = 50929,
  }

  return fx
end

return M
