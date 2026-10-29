-- 由 qxqy/build.mjs 从 lua/src/*.lua 生成，请勿手改本文件

-- ===== 00_config.lua =====
-- ============================================================================
-- 《花间茶会》 · 配置与文案
-- 纯图元 2D UI（circle / rect / triangle / fourstar / fivestar / ring）
-- ============================================================================
T = T or {}

T.VERSION = '1.0.0'
T.BUILD_ID = '1793236868580'
T.DESIGN_W, T.DESIGN_H = 1280, 720
T.DEBUG = false

-- 颜色：ARGB 整数
T.C = function(a, r, g, b)
  return a * 16777216 + r * 65536 + g * 256 + b
end
T.withA = function(c, a)
  return a * 16777216 + (c % 16777216)
end
T.alphaOf = function(c) return math.floor(c / 16777216) % 256 end
T.mix = function(c1, c2, t)
  local a1, r1, g1, b1 = math.floor(c1 / 16777216) % 256, math.floor(c1 / 65536) % 256,
    math.floor(c1 / 256) % 256, c1 % 256
  local a2, r2, g2, b2 = math.floor(c2 / 16777216) % 256, math.floor(c2 / 65536) % 256,
    math.floor(c2 / 256) % 256, c2 % 256
  local function m(x, y) return math.floor(x + (y - x) * t + 0.5) end
  return T.C(m(a1, a2), m(r1, r2), m(g1, g2), m(b1, b2))
end

-- 主色板：奶油底 + 低饱和马卡龙色
T.P = {
  ink       = T.C(255, 74, 58, 74),
  ink2      = T.C(255, 122, 104, 120),
  ink3      = T.C(255, 167, 150, 162),
  cream     = T.C(255, 255, 253, 248),
  cream2    = T.C(255, 255, 248, 238),
  paper     = T.C(255, 252, 243, 232),
  white     = T.C(255, 255, 255, 255),
  line      = T.C(255, 236, 220, 210),
  shadow    = T.C(255, 229, 215, 207),
  rose      = T.C(255, 242, 167, 190),
  roseDeep  = T.C(255, 217, 108, 147),
  roseLight = T.C(255, 253, 228, 236),
  mint      = T.C(255, 168, 223, 196),
  mintDeep  = T.C(255, 95, 175, 138),
  mintLight = T.C(255, 227, 246, 236),
  sky       = T.C(255, 169, 205, 240),
  skyDeep   = T.C(255, 92, 134, 200),
  skyLight  = T.C(255, 229, 242, 252),
  lilac     = T.C(255, 205, 180, 232),
  lilacDeep = T.C(255, 138, 107, 191),
  lilacLight= T.C(255, 239, 230, 251),
  butter    = T.C(255, 247, 216, 139),
  butterDeep= T.C(255, 217, 169, 78),
  butterLight=T.C(255, 255, 246, 218),
  peach     = T.C(255, 247, 203, 176),
  gold      = T.C(255, 232, 184, 92),
  goldLight = T.C(255, 250, 226, 168),
  red       = T.C(255, 214, 99, 99),
  green     = T.C(255, 95, 175, 138),
  bgTop     = T.C(255, 255, 249, 240),
  bgMid     = T.C(255, 253, 240, 244),
  bgBot     = T.C(255, 233, 247, 239),
}

-- 音效 id（tetris 已实测白名单；语义待听感确认，均为内置小整数 id）
T.SFX = {
  click   = 50884,  -- 0.151s
  hover   = 50883,  -- 0.151s
  confirm = 50884,
  back    = 50872,  -- 1.024s
  match   = 50917,  -- 0.785s
  combo   = 40001,  -- 1.653s
  win     = 40054,  -- 2.000s
  lose    = 50929,  -- 0.978s
  ambient = 10002,  -- 环境_风声_温和 69.736s（每 69s 手动续播）
}

-- 四席角色（立绘由 20_art.lua 的纯图元画法生成）
T.chars = {
  {
    id = 1, name = '甘雨', en = 'GANYU', title = '月下冰露', element = '冰',
    chapter = 1, quote = '若是不嫌弃……我可以再陪你坐一会儿。',
    desc = '循着清心的香气来的半仙少女。她泡的茶微凉，回甘却很长。',
    likes = '清心 · 甜甜花 · 午后的云',
    stats = { 3, 5, 3 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.sky, deep = T.P.skyDeep, light = T.P.skyLight, accent = T.P.rose,
  },
  {
    id = 2, name = '刻晴', en = 'KEQING', title = '紫电晚风', element = '雷',
    chapter = 2, quote = '既然来了，就尝尝我亲手泡的茶吧。',
    desc = '把茶会流程精确到分钟的玉衡星。茶点摆盘意外地很有少女心。',
    likes = '金鱼草 · 杏仁豆腐 · 干净的桌面',
    stats = { 4, 4, 3 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.lilac, deep = T.P.lilacDeep, light = T.P.lilacLight, accent = T.P.butter,
  },
  {
    id = 3, name = '少女', en = 'THE GIRL', title = '甜梦花园', element = '梦',
    chapter = 3, quote = '嘘——茶会开始之前，先做一个甜甜的梦吧。',
    desc = '从梦与花瓣之间来的神秘客人。她总能在茶杯里变出新的糖霜。',
    likes = '糖霜 · 星星 · 没有尽头的下午',
    stats = { 5, 2, 4 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.rose, deep = T.P.roseDeep, light = T.P.roseLight, accent = T.P.butter,
  },
  {
    id = 4, name = '小草神', en = 'NAHIDA', title = '青芽晨露', element = '草',
    chapter = 4, quote = '今天的茶，是刚长出来的味道哦。',
    desc = '把整座花园当作茶桌的小小神明。她说，每一片新叶都值得被庆祝。',
    likes = '薄荷 · 童话书 · 刚发芽的种子',
    stats = { 3, 4, 5 }, statNames = { '甜度', '清香', '暖意' },
    main = T.P.mint, deep = T.P.mintDeep, light = T.P.mintLight, accent = T.P.butter,
  },
}

T.chapters = {
  { id = 1, char = 1, name = '月下冰露', sub = '第一章 · 璃月山间的清茶', goal = 1500, moves = 20,
    desc = '山风把云吹得很低，甘雨在石桌边温着一壶清心茶。' },
  { id = 2, char = 2, name = '紫电晚风', sub = '第二章 · 玉京台的黄昏', goal = 1900, moves = 19,
    desc = '刻晴把最后一份公文收进抽屉，晚风正好吹动茶旗。' },
  { id = 3, char = 3, name = '甜梦花园', sub = '第三章 · 云端的花园', goal = 2300, moves = 18,
    desc = '少女在云上摆好了糖霜与星星，等你推开梦的门。' },
  { id = 4, char = 4, name = '青芽晨露', sub = '第四章 · 须弥的清晨', goal = 2700, moves = 17,
    desc = '小草神踮着脚，把第一片新叶放进你的茶杯里。' },
}

T.desserts = {
  { id = 1, name = '草莓马卡龙', short = '马卡龙', icon = 'ring', base = T.P.rose, inner = T.P.roseLight,
    deep = T.P.roseDeep, desc = '两片杏仁小圆饼夹着草莓奶油，甜得像一句悄悄话。' },
  { id = 2, name = '蜂蜜蛋糕', short = '蛋糕', icon = 'triangle', base = T.P.butter, inner = T.P.butterLight,
    deep = T.P.butterDeep, desc = '刚出炉的蜂蜜蛋糕，边角有一点点焦香。' },
  { id = 3, name = '薄荷糖果', short = '糖果', icon = 'fourstar', base = T.P.mint, inner = T.P.mintLight,
    deep = T.P.mintDeep, desc = '薄荷糖在舌尖化开，像一阵穿过花园的风。' },
  { id = 4, name = '蓝莓清茶', short = '清茶', icon = 'circle', base = T.P.sky, inner = T.P.skyLight,
    deep = T.P.skyDeep, desc = '蓝莓与清茶的比例刚刚好，杯底沉着两颗小星星。' },
  { id = 5, name = '紫花酥', short = '花酥', icon = 'fivestar', base = T.P.lilac, inner = T.P.lilacLight,
    deep = T.P.lilacDeep, desc = '做成五瓣花形状的酥点，中间点着一小团蜜。' },
}

T.achv = {
  { id = 'first_tea', name = '初赴茶会', desc = '完成第一杯茶。', icon = 'flower' },
  { id = 'combo3', name = '三连好茶', desc = '在一次结算中达成 3 连击。', icon = 'star' },
  { id = 'score3000', name = '满桌茶点', desc = '单局得分达到 3000。', icon = 'cake' },
  { id = 'all_chapters', name = '四季巡礼', desc = '四席茶会都留下过脚印。', icon = 'leaf' },
  { id = 'perfect', name = '完美茶席', desc = '任意茶席拿到三颗星。', icon = 'crown' },
}

T.opt = {
  sfx = true,
  ambient = false,
  motion = 2,       -- 1 柔和 / 2 标准 / 3 丰富
  outline = false,  -- 正文描边（提高复杂背景可读性）
}

T.records = {
  best = { 0, 0, 0, 0 },
  stars = { 0, 0, 0, 0 },
  plays = 0,
  clears = 0,
  totalCleared = 0,
  maxCombo = 0,
  visited = { false, false, false, false },
  achv = {},
}

T.achievementById = {}
for _, a in ipairs(T.achv) do T.achievementById[a.id] = a end

T.SHAPE_ID = {
  rect = 100001, circle = 100002, triangle = 100003,
  fourstar = 100004, fivestar = 100005, ring = 100006,
}


-- ===== 10_core.lua =====
-- ============================================================================
-- 核心：画布/控件工厂/焦点/补间/弹层/转场/输入/音效
-- 设计坐标 1280x720，按 S=min(W/1280,H/720) 整体缩放。
-- 层序铁律：同一层里「后建的在上」；服务端 textbox 永远在运行时实例之下。
-- 因此每屏顺序固定：背景图 → 内容图 → 全部文字 → hits → 焦点框。
-- ============================================================================
T = T or {}
T.tpl = { prim = 1073742105, label = 1073742106, hit = 1073742107 }
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
  if not ok then
    local msg = tostring(err)
    -- 屏幕上已销毁的旧动画引用会每帧刷同一条 invalid object；不刷屏，避免日志把主线程拖死
    if not msg:find('invalid object', 1, true) then
      T.warn('call ' .. tostring(method) .. ' :: ' .. msg)
    end
  end
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
      -- 补间回调也必须 pcall：一个回调抛错会打断 OnUpdate，表现为动画/棋盘永久冻结
      local okTw, keep = pcall(tw.fn, tw.ease(k), k)
      if not okTw then
        T.warn('tween error :: ' .. tostring(keep))
        list[i] = nil
      elseif k >= 1 or keep == false then
        list[i] = nil
        if tw.done then
          local okDone, errDone = pcall(tw.done)
          if not okDone then T.warn('tween done error :: ' .. tostring(errDone)) end
        end
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
    tweensStart = #T.tweens + 1, animsStart = #T.anims + 1,
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
  for i = #T.tweens, o.tweensStart or (#T.tweens + 1), -1 do T.tweens[i] = nil end
  for i = #T.anims, o.animsStart or (#T.anims + 1), -1 do T.anims[i] = nil end
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


-- ===== 20_art.lua =====
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


-- ===== 30_screens.lua =====
-- ============================================================================
-- 页面：标题 / 主菜单 / 茶席 / 角色 / 图鉴 / 设置 / 帮助 / 制作
-- 每屏固定顺序：背景图 → 内容图 → 全部文字 → hits → 焦点框（core.finishScreen）
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.footer = function(text, color)
  T.txt(0, -326, 900, 34, 15, text, color or T.P.ink3, 'Middle', 'Middle')
end
T.headerTitle = function(title, sub, x)
  x = x or -320
  T.txt(x, 300, 520, 58, 34, title, T.P.ink, 'Left', 'Middle')
  if sub then T.txt(x, 266, 620, 28, 14, sub, T.P.ink2, 'Left', 'Middle') end
  T.img(x - 12, 300, 4, 34, 'rect', T.P.rose)
end
T.headerDate = function(text)
  T.txt(520, 300, 220, 30, 15, text, T.P.ink2, 'Right', 'Middle')
end
T.backButton = function(onClick, label)
  local x, y, w, h = -572, 300, 150, 46
  local bg = T.img(x - 26, y, 34, 34, 'circle', T.P.cream)
  local inner = T.img(x - 26, y, 22, 22, 'circle', T.P.roseLight)
  local arrow = T.img(x - 20, y, 11, 13, 'triangle', T.P.roseDeep, -90)
  local ctl = T.txt(x + 28, y, 100, 34, 16, label or '返回', T.P.ink2, 'Left', 'Middle')
  T.hit('hit_back', x, y, w, h, {
    onEnter = function() T.trySet(bg, 'imageColor', T.P.goldLight); T.setTxtColor(ctl, T.P.ink) end,
    onExit = function() T.trySet(bg, 'imageColor', T.P.cream); T.setTxtColor(ctl, T.P.ink2) end,
    onClick = function() T.sfx(T.SFX.back); onClick() end,
  })
  return ctl
end
T.badge = function(x, y, text, bg, fg)
  local w = math.max(70, #text * 15 + 24)
  T.img(x, y, w, 27, 'rect', bg or T.P.roseLight)
  T.txt(x, y, w - 8, 26, 13, text, fg or T.P.roseDeep, 'Middle', 'Middle')
end
T.divider = function(x, y, w, color)
  T.img(x, y, w, 1.6, 'rect', color or T.P.line)
  T.img(x - w / 2, y, 5, 5, 'circle', T.P.gold)
  T.img(x + w / 2, y, 5, 5, 'circle', T.P.gold)
end
T.icon = function(kind, x, y, s, color)
  if kind == 'flower' then T.flower(x, y, s, color or T.P.rose, T.P.butter)
  elseif kind == 'star' then T.img(x, y, s * 2, s * 2, 'fivestar', color or T.P.gold)
  elseif kind == 'cake' then T.img(x, y, s * 2, s * 1.8, 'triangle', color or T.P.butter)
  elseif kind == 'leaf' then
    T.img(x - s * 0.4, y, s * 1.4, s * 1.4, 'triangle', color or T.P.mint, -40)
    T.img(x + s * 0.4, y, s * 1.4, s * 1.4, 'triangle', color or T.P.mint, 40)
  elseif kind == 'crown' then
    T.img(x, y + s * 0.4, s * 2.2, s * 1.5, 'triangle', color or T.P.gold, 180)
  elseif kind == 'cup' then
    T.img(x, y, s * 1.8, s * 1.5, 'circle', color or T.P.sky)
    T.img(x + s * 1.0, y, s * 0.7, s * 0.9, 'ring', T.P.gold)
  else T.img(x, y, s * 2, s * 2, 'circle', color or T.P.rose) end
end

-- ---------- 标题 ----------
T.screenFns.title = function()
  T.bgGarden('default')
  T.petals(22, 0, { T.P.rose, T.P.butter, T.P.mint })
  -- 主视觉：左侧 logo + 开始提示；右侧四位角色徽章
  T.titleLogo(-300, 122, 1)
  local promptBg = T.img(-300, -108, 300, 64, 'rect', T.P.ink)
  local promptBg2 = T.img(-300, -108, 292, 56, 'rect', T.P.cream)
  local promptTxt = T.txt(-300, -108, 260, 44, 24, '点击开始茶会', T.P.ink, 'Middle', 'Middle')
  T.img(-300, -152, 30, 3, 'rect', T.P.gold)
  local arrow = T.img(-300, -172, 20, 20, 'triangle', T.P.gold, 180)
  T.item({
    x = -300, y = -108, w = 300, h = 64, name = 'hit_start',
    onConfirm = function() T.go('menu') end,
    onFocus = function(on)
      T.trySet(promptBg, 'imageColor', on and T.P.gold or T.P.ink)
      T.trySet(promptTxt, 'fontColor', on and T.P.roseDeep or T.P.ink)
    end,
  })
  -- 右侧 2x2 角色徽章
  local pos = { { 228, 158 }, { 468, 78 }, { 228, -62 }, { 468, -142 } }
  for i, ch in ipairs(T.chars) do
    local p = pos[i]
    T.img(p[1], p[2], 148, 148, 'ring', ch.main)
    T.medallion(p[1], p[2], 64, ch, 0.5, { idle = true })
    local nameCtl = T.txt(p[1], p[2] - 84, 150, 28, 15, ch.name, T.P.ink, 'Middle', 'Middle')
    T.txt(p[1], p[2] - 105, 150, 20, 11, ch.title, T.P.ink2, 'Middle', 'Middle')
    T.item({ x = p[1], y = p[2] + 4, w = 170, h = 190, name = 'hit_title_char_' .. i,
      onConfirm = function() T.openCharacterDetail(ch.id, 'title') end,
      onFocus = function(on) T.setTxtColor(nameCtl, on and T.P.roseDeep or T.P.ink) end,
    })
  end
  T.footer('鼠标点击 · 方向键选择 · 空格确认', T.P.ink3)
  T.txt(0, -294, 760, 24, 13, '一场关于花、茶与少女们的四季茶会', T.P.ink2, 'Middle', 'Middle')
  T.txt(540, -326, 200, 22, 11, 'v' .. T.VERSION .. '  ·  ' .. T.BUILD_ID, T.P.ink3, 'Right', 'Middle')
  T.teaTable(-300, -238, 0.68)

  -- 左侧空白点击 = 开始（放在其他 hit 之前，后被角色/按钮覆盖）
  -- 注意：hit 已由 item 创建；这里的全屏 hit 必须最先建才不挡角色。
  -- 为保持现有层序，全屏点击改为「键盘提示」：不额外加 hit，避免盖住角色。
  local screen = T.screen
  screen.key = function(a)
    if a == 'confirm' then T.go('menu')
    elseif a == 'back' then T.sfx(T.SFX.back)
    end
  end
  screen.update = function(dt)
    local pulse = 0.5 + 0.5 * math.sin(T.time * 2.2)
    T.trySet(promptTxt, 'fontColor', T.mix(T.P.ink, T.P.roseDeep, pulse))
    T.tryCall(arrow, 'SetAnchoredPosition', -300 * T.S, (-172 + pulse * 4) * T.S)
  end
  screen.afterBuild = function()
    -- 默认焦点放在开始按钮
    T.setFocus(1, true)
  end
end

-- ---------- 主菜单 ----------
T.screenFns.menu = function()
  T.bgGarden('garden', -T.W * 0.30)
  T.petals(16, -40, { T.P.rose, T.P.mint, T.P.butter })
  -- 左侧花园窗
  local wx, wy, wr = -340, 18, 238
  T.img(wx, wy, wr * 2 + 22, wr * 2 + 22, 'circle', T.P.cream)
  T.img(wx, wy, wr * 2 + 10, wr * 2 + 10, 'circle', T.P.goldLight)
  T.img(wx, wy, wr * 2, wr * 2, 'circle', T.C(255, 236, 248, 246))
  -- 窗内小景
  T.img(wx + 30, wy + 74, 110, 110, 'circle', T.P.butterLight)
  T.img(wx - 50, wy - 6, 260, 260, 'circle', T.C(255, 211, 239, 222))
  T.img(wx + 100, wy - 60, 300, 300, 'circle', T.C(255, 193, 230, 208))
  T.teaTable(wx, wy - 52, 1.1)
  T.teaHeads(wx, wy - 32, 0.92)
  T.flower(wx - 150, wy + 140, 13, T.P.rose, T.P.butter)
  T.flower(wx + 154, wy + 122, 10, T.P.lilac, T.P.butter)
  -- 窗框装饰
  for i = 0, 7 do
    local a = i / 8 * math.pi * 2
    T.img(wx + math.cos(a) * (wr + 12), wy + math.sin(a) * (wr + 12), 9, 9, 'circle', T.P.gold)
  end
  T.txt(wx, wy - wr - 28, 440, 30, 15, '花间 · 四季茶席', T.P.ink2, 'Middle', 'Middle')
  T.img(wx, wy - wr - 44, 120, 2, 'rect', T.P.goldLight)

  -- 标题（左上）
  T.txt(-548, 300, 260, 52, 30, '花间茶会', T.P.ink, 'Left', 'Middle')
  T.txt(-548, 274, 300, 24, 11, 'BLOSSOM & TEA', T.P.ink2, 'Left', 'Middle')
  T.img(-548, 322, 180, 2, 'rect', T.P.gold)
  T.headerDate('春 · 花见')
  T.badge(540, 266, '茶会准备中', T.P.roseLight, T.P.roseDeep)

  -- 右侧菜单卡片
  local defs = {
    { '开始茶会', '赴一场四季花事', 'flower', T.P.rose, function() T.go('chapters') end },
    { '角色茶席', '与她们共饮一杯', 'cup', T.P.sky, function() T.go('characters') end },
    { '回忆图鉴', '茶点、角色与手账', 'star', T.P.butter, function() T.go('gallery', { tab = 1 }) end },
    { '设置', '声音、动效与操作', 'leaf', T.P.mint, function() T.go('settings') end },
    { '制作名单', '花间茶会制作组', 'crown', T.P.lilac, function() T.go('credits') end },
  }
  local cards = {}
  for i, d in ipairs(defs) do
    local y = 190 - (i - 1) * 84
    local x = 270
    local shadow = T.img(x + 5, y - 5, 500, 72, 'rect', T.P.shadow)
    local border = T.img(x, y, 500, 72, 'rect', d[4])
    local panel = T.img(x, y, 492, 64, 'rect', T.P.cream)
    local accent = T.img(x - 236, y, 7, 50, 'rect', d[4])
    local iconBg = T.img(x - 196, y, 44, 44, 'circle', T.P.paper)
    local iconShape = T.icon(d[3], x - 196, y, 14, d[4])
    local title = T.txt(x - 150, y + 10, 250, 40, 23, d[1], T.P.ink, 'Left', 'Middle')
    local sub = T.txt(x - 150, y - 15, 300, 24, 13, d[2], T.P.ink2, 'Left', 'Middle')
    local chev = T.img(x + 222, y, 14, 22, 'triangle', T.P.ink3, 90)
    local item = T.item({
      x = x, y = y, w = 500, h = 72, name = 'hit_menu_' .. i,
      onConfirm = d[5],
      onFocus = function(on)
        T.trySet(panel, 'imageColor', on and T.C(255, 255, 250, 241) or T.P.cream)
        T.trySet(title, 'fontColor', on and d[4] or T.P.ink)
        T.tryCall(chev, 'SetAnchoredPosition', (x + (on and 234 or 222)) * T.S, y * T.S)
      end,
    })
    item.title = title
    cards[i] = item
  end
  T.footer('↑↓ 选择 · 空格确认 · Q 返回标题')
  T.txt(0, -294, 900, 24, 13, '今日茶单：清心、金鱼草、糖霜与刚发芽的薄荷', T.P.ink2, 'Middle', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('title') end
  end
end

-- ---------- 占位页（后续填充） ----------
local function placeholder(name, title, sub)
  T.screenFns[name] = function()
    T.bgGarden('garden')
    T.headerTitle(title, sub)
    T.txt(0, 20, 700, 60, 30, '这一页正在布置中…', T.P.ink2, 'Middle', 'Middle')
    local it = T.item({ x = 0, y = -100, w = 240, h = 56, name = 'hit_back_placeholder',
      onConfirm = function() T.go('menu') end })
    T.img(0, -100, 240, 56, 'rect', T.P.ink)
    T.img(0, -100, 232, 48, 'rect', T.P.cream)
    T.txt(0, -100, 220, 40, 20, '回到主菜单', T.P.ink, 'Middle', 'Middle')
  end
end
placeholder('chapters', '选择茶席', '四季花事，四杯清茶')
placeholder('characters', '角色茶席', '与她们共饮一杯')
placeholder('gallery', '回忆图鉴', '茶点、角色与手账')
placeholder('settings', '设置', '声音、动效与操作')
placeholder('credits', '制作名单', '花间茶会制作组')

-- ---------- 茶席选择 ----------
T.screenFns.chapters = function()
  T.bgGarden('garden')
  T.petals(12, -60, { T.P.rose, T.P.butter })
  T.headerTitle('选择茶席', '四季花事，四杯清茶', -390)
  T.backButton(function() T.go('menu') end)
  local pos = { { -300, 100 }, { 300, 100 }, { -300, -150 }, { 300, -150 } }
  for i, ch in ipairs(T.chapters) do
    local c = T.chars[ch.char]
    local p = pos[i]
    local x, y = p[1], p[2]
    local shadow = T.img(x + 5, y - 5, 530, 226, 'rect', T.P.shadow)
    local border = T.img(x, y, 530, 226, 'rect', c.main)
    local panel = T.img(x, y, 522, 218, 'rect', T.P.cream)
    local accent = T.img(x - 256, y, 7, 160, 'rect', c.main)
    local art = T.img(x + 154, y, 186, 186, 'rect', c.light)
    T.chapterArt(x + 154, y, 186, 186, { id = ch.id, light = c.light })
    local num = T.txt(x - 210, y + 64, 90, 66, 40, string.format('%02d', i), c.deep, 'Left', 'Middle')
    local title = T.txt(x - 190, y + 20, 300, 46, 27, ch.name, T.P.ink, 'Left', 'Middle')
    local sub = T.txt(x - 210, y - 16, 330, 26, 13, ch.sub, T.P.ink2, 'Left', 'Middle')
    local info = T.txt(x - 210, y - 54, 340, 28, 13, '目标 ' .. ch.goal .. '  ·  ' .. ch.moves .. ' 步', T.P.ink2, 'Left', 'Middle')
    T.starRow(x + 30, y - 88, T.records.stars[i] or 0, 18, T.P.gold, T.P.line)
    local go = T.txt(x + 190, y - 86, 90, 26, 14, '进入 ›', c.deep, 'Right', 'Middle')
    local moved = { { shadow, x + 5, y - 5 }, { border, x, y }, { panel, x, y }, { accent, x - 256, y },
      { art, x + 154, y }, { num, x - 165, y + 64 }, { title, x - 40, y + 20 },
      { sub, x - 45, y - 16 }, { info, x - 40, y - 54 }, { go, x + 145, y - 86 } }
    T.item({
      x = x, y = y, w = 530, h = 226, name = 'hit_chapter_' .. i,
      onConfirm = function() T.openChapterDetail(ch.id) end,
      onFocus = function(on)
        local dy = on and 5 or 0
        for _, m in ipairs(moved) do
          if m[1] then T.tryCall(m[1], 'SetAnchoredPosition', m[2] * T.S, (m[3] + dy) * T.S) end
        end
        T.trySet(title, 'fontColor', on and c.deep or T.P.ink)
        T.trySet(go, 'fontColor', on and T.P.roseDeep or c.deep)
      end,
    })
  end
  T.footer('↑↓←→ 选择 · 空格查看 · Q 返回')
  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
end

-- ---------- 角色茶席 ----------
T.screenFns.characters = function(params)
  T.bgGarden('garden')
  T.petals(12, -40, { T.P.lilac, T.P.rose })
  T.headerTitle('角色茶席', '与她们共饮一杯', -390)
  T.backButton(function() T.go('menu') end)
  local xs = { -450, -150, 150, 450 }
  local quoteCtl = T.txt(0, -248, 980, 56, 22, '', T.P.ink, 'Middle', 'Middle')
  local likesCtl = T.txt(0, -284, 900, 28, 13, '', T.P.ink2, 'Middle', 'Middle')
  local function showQuote(i)
    local ch = T.chars[i]
    T.setTxt(quoteCtl, '「' .. ch.quote .. '」')
    T.setTxt(likesCtl, ch.likes)
    T.setTxtColor(quoteCtl, ch.deep)
  end
  for i, ch in ipairs(T.chars) do
    local x, y = xs[i], 30
    local shadow = T.img(x + 5, y - 5, 280, 340, 'rect', T.P.shadow)
    local border = T.img(x, y, 280, 340, 'rect', ch.main)
    local panel = T.img(x, y, 272, 332, 'rect', T.P.cream)
    local ring = T.img(x, y + 52, 164, 164, 'ring', ch.main)
    T.portrait(x, y + 22, 0.8, ch, { bust = true })
    local name = T.txt(x, y - 92, 240, 44, 26, ch.name, T.P.ink, 'Middle', 'Middle')
    local title = T.txt(x, y - 120, 240, 24, 13, ch.title, T.P.ink2, 'Middle', 'Middle')
    local badgeBg = T.img(x - 102, y + 146, 86, 24, 'rect', ch.light)
    local badge = T.txt(x - 102, y + 146, 80, 22, 12, ch.element .. ' · 茶席', ch.deep, 'Middle', 'Middle')
    T.item({
      x = x, y = y, w = 280, h = 340, name = 'hit_char_' .. i,
      onConfirm = function() T.openCharacterDetail(ch.id, 'characters') end,
      onFocus = function(on)
        T.trySet(title, 'fontColor', on and ch.deep or T.P.ink2)
        T.trySet(name, 'fontColor', on and ch.deep or T.P.ink)
        if on then showQuote(i) end
      end,
    })
  end
  showQuote(1)
  T.footer('↑↓←→ 选择 · 空格查看 · Q 返回')
  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
  screen.afterBuild = function() showQuote(1) end
end

-- ---------- 图鉴 ----------
T.screenFns.gallery = function(params)
  params = params or {}
  local tab = params.tab or 1
  T.screen.defaultFocus = tab
  T.bgGarden('garden')
  T.petals(10, -70, { T.P.butter, T.P.mint })
  T.headerTitle('回忆图鉴', '茶点、角色与手账', -430)
  T.backButton(function() T.go('menu') end)
  local names = { '角色', '茶点', '手账' }
  for i = 1, 3 do
    local x = -160 + (i - 1) * 160
    local active = (i == tab)
    local tabCtl = T.txt(x, 230, 150, 44, 21, names[i], active and T.P.ink or T.P.ink3, 'Middle', 'Middle')
    if active then T.img(x, 204, 80, 3, 'rect', T.P.rose) end
    T.item({ x = x, y = 230, w = 150, h = 44, name = 'hit_gallery_tab_' .. i,
      onConfirm = function() T.go('gallery', { tab = i }) end,
      onFocus = function(on) T.setTxtColor(tabCtl, on and T.P.ink or T.P.ink3) end,
    })
  end
  if tab == 1 then
    local pos = { { -300, 80 }, { 300, 80 }, { -300, -120 }, { 300, -120 } }
    for i, ch in ipairs(T.chars) do
      local x, y = pos[i][1], pos[i][2]
      local border = T.img(x, y, 520, 180, 'rect', ch.main)
      local panel = T.img(x, y, 512, 172, 'rect', T.P.cream)
      T.medallion(x - 176, y + 10, 64, ch, 0.8, { idle = false })
      local name = T.txt(x - 70, y + 44, 240, 40, 24, ch.name, T.P.ink, 'Left', 'Middle')
      local title = T.txt(x - 70, y + 14, 280, 24, 13, ch.title .. ' · ' .. ch.element, T.P.ink2, 'Left', 'Middle')
      local q = T.txt(x - 70, y - 26, 330, 56, 13, '「' .. ch.quote .. '」', T.P.ink2, 'Left', 'Middle')
      local go = T.txt(x + 190, y, 80, 28, 14, '查看 ›', ch.deep, 'Right', 'Middle')
      T.item({ x = x, y = y, w = 520, h = 180, name = 'hit_gallery_char_' .. i,
        onConfirm = function() T.openCharacterDetail(ch.id, 'gallery') end,
        onFocus = function(on)
          T.trySet(border, 'imageColor', on and T.P.gold or ch.main)
          T.trySet(name, 'fontColor', on and ch.deep or T.P.ink)
        end,
      })
    end
  elseif tab == 2 then
    for i, d in ipairs(T.desserts) do
      local x = -480 + (i - 1) * 240
      local y = 10
      local border = T.img(x, y, 220, 300, 'rect', d.base)
      local panel = T.img(x, y, 212, 292, 'rect', T.P.cream)
      T.dessertArt(x, y + 78, 0.52, i)
      local name = T.txt(x, y + 12, 190, 40, 20, d.name, T.P.ink, 'Middle', 'Middle')
      local desc = T.txt(x, y - 58, 180, 90, 12, d.desc, T.P.ink2, 'Middle', 'Middle')
      local go = T.txt(x, y - 118, 160, 26, 12, '查看茶点 ›', d.deep, 'Middle', 'Middle')
      T.item({ x = x, y = y, w = 220, h = 300, name = 'hit_gallery_tea_' .. i,
        onConfirm = function() T.openTeaDetail(d.id) end,
        onFocus = function(on)
          T.trySet(border, 'imageColor', on and T.P.gold or d.base)
          T.trySet(name, 'fontColor', on and d.deep or T.P.ink)
        end,
      })
    end
  else
    local bx = -300
    T.img(bx, -6, 560, 392, 'rect', T.P.cream)
    T.img(bx, -6, 552, 384, 'rect', T.P.paper)
    T.txt(bx, 158, 480, 42, 24, '本次茶会记录', T.P.ink, 'Middle', 'Middle')
    T.divider(bx, 130, 420)
    for i, ch in ipairs(T.chapters) do
      local c = T.chars[ch.char]
      T.txt(bx - 230, 94 - (i - 1) * 48, 240, 30, 17, string.format('%02d  %s', i, ch.name), c.deep, 'Left', 'Middle')
      T.starRow(bx + 40, 94 - (i - 1) * 48, T.records.stars[i] or 0, 16, T.P.gold, T.P.line)
      T.txt(bx + 210, 94 - (i - 1) * 48, 120, 30, 16, tostring(T.records.best[i] or 0), T.P.ink, 'Right', 'Middle')
    end
    T.txt(bx - 230, -112, 420, 26, 13, '茶会次数 ' .. T.records.plays .. '　完成 ' .. T.records.clears .. '　最高连击 ' .. T.records.maxCombo, T.P.ink2, 'Left', 'Middle')
    T.txt(bx - 230, -142, 420, 26, 13, '累计消除茶点 ' .. T.records.totalCleared, T.P.ink2, 'Left', 'Middle')
    -- 成就
    local ax = 300
    T.img(ax, -6, 560, 392, 'rect', T.P.cream)
    T.img(ax, -6, 552, 384, 'rect', T.P.paper)
    T.txt(ax, 158, 480, 42, 24, '茶会手账', T.P.ink, 'Middle', 'Middle')
    T.divider(ax, 130, 420)
    for i, a in ipairs(T.achv) do
      local y = 82 - (i - 1) * 54
      local got = T.records.achv[a.id]
      T.img(ax - 226, y, 44, 44, 'circle', got and T.P.goldLight or T.P.line)
      T.icon(a.icon, ax - 226, y, 11, got and T.P.gold or T.P.ink3)
      T.txt(ax - 186, y + 10, 300, 28, 16, a.name, got and T.P.ink or T.P.ink3, 'Left', 'Middle')
      T.txt(ax - 186, y - 14, 380, 24, 12, a.desc, T.P.ink2, 'Left', 'Middle')
      T.txt(ax + 238, y, 50, 28, 12, got and '已解锁' or '未解锁', got and T.P.roseDeep or T.P.ink3, 'Right', 'Middle')
    end
  end
  T.footer('←→ 切换页签 · ↑↓ 选择 · 空格查看 · Q 返回')
  local screen = T.screen
  screen.key = function(a)
    if (a == 'left' or a == 'right') and (T.focus or 0) <= 3 then
      local n = (a == 'right') and 1 or -1
      local t = ((tab - 1 + n) % 3) + 1
      T.go('gallery', { tab = t })
    elseif a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
end

-- ---------- 设置 ----------
T.screenFns.settings = function(params)
  params = params or {}
  T.screen.defaultFocus = params.focus or 1
  T.bgGarden('garden')
  T.petals(8, 0, { T.P.mint, T.P.butter })
  T.headerTitle('设置', '声音、动效与操作', -430)
  T.backButton(function() T.go('menu') end)
  local px, py, pw, ph = 0, -20, 900, 520
  T.img(px + 6, py - 6, pw + 12, ph + 12, 'rect', T.P.shadow)
  T.img(px, py, pw, ph, 'rect', T.P.goldLight)
  T.img(px, py, pw - 12, ph - 12, 'rect', T.P.cream)
  T.img(px, py + ph / 2 - 10, pw - 12, 8, 'rect', T.P.rose)
  local function rowLine(y)
    T.img(px, y - 38, pw - 80, 1.4, 'rect', T.P.line)
  end
  local function toggle(id, y, label, sub, get, set)
    rowLine(y)
    T.txt(px - 360, y + 14, 500, 40, 21, label, T.P.ink, 'Left', 'Middle')
    T.txt(px - 360, y - 16, 560, 24, 12, sub, T.P.ink2, 'Left', 'Middle')
    local track = T.img(px + 318, y, 84, 36, 'rect', get() and T.P.rose or T.P.line)
    local knob = T.img(px + (get() and 336 or 300), y, 28, 28, 'circle', T.P.cream)
    local txt = T.txt(px + 250, y, 70, 28, 13, get() and '开' or '关', get() and T.P.roseDeep or T.P.ink3, 'Right', 'Middle')
    T.item({ x = px + 318, y = y, w = 84, h = 36, name = 'hit_set_' .. id,
      onConfirm = function()
        set(not get())
        T.log('opt ' .. id .. '=' .. tostring(get()))
        T.trySet(track, 'imageColor', get() and T.P.rose or T.P.line)
        T.tryCall(knob, 'SetAnchoredPosition', (px + (get() and 336 or 300)) * T.S, y * T.S)
        T.setTxt(txt, get() and '开' or '关')
        T.setTxtColor(txt, get() and T.P.roseDeep or T.P.ink3)
        T.sfx(T.SFX.click)
      end,
    })
  end
  toggle('sfx', 170, '音效', '点击、消除与结算的反馈音', function() return T.opt.sfx end,
    function(v) T.opt.sfx = v end)
  toggle('ambient', 90, '环境音', '花园里的风声（约 70 秒循环）', function() return T.opt.ambient end,
    function(v) T.setAmbient(v) end)
  -- 动效强度
  rowLine(10)
  T.txt(px - 360, 24, 500, 40, 21, '动效强度', T.P.ink, 'Left', 'Middle')
  T.txt(px - 360, -6, 560, 24, 12, '花瓣数量与呼吸动画的幅度', T.P.ink2, 'Left', 'Middle')
  local motionNames = { '柔和', '标准', '丰富' }
  for i = 1, 3 do
    local x = px + 230 + (i - 1) * 78
    local bg = T.img(x, 10, 72, 36, 'rect', T.opt.motion == i and T.P.rose or T.P.line)
    local label = T.txt(x, 10, 68, 32, 14, motionNames[i], T.opt.motion == i and T.P.cream or T.P.ink2, 'Middle', 'Middle')
    T.item({ x = x, y = 10, w = 72, h = 36, name = 'hit_motion_' .. i,
      onConfirm = function()
        T.opt.motion = i
        T.log('opt motion=' .. i)
        T.go('settings', { focus = 2 + i })
      end,
      onFocus = function(on) T.trySet(bg, 'imageColor', on and T.P.gold or (T.opt.motion == i and T.P.rose or T.P.line)) end,
    })
  end
  toggle('outline', -70, '文字描边', '在花丛背景上给文字加一圈浅色描边', function() return T.opt.outline end,
    function(v)
      T.opt.outline = v
      for _, c in ipairs(T.texts) do T.trySet(c, 'enableOutline', v) end
    end)
  -- 操作说明 / 重置
  local helpBg = T.img(px - 180, -168, 260, 48, 'rect', T.P.sky)
  local helpTxt = T.txt(px - 180, -168, 250, 40, 18, '操作说明', T.P.cream, 'Middle', 'Middle')
  T.item({ x = px - 180, y = -168, w = 260, h = 48, name = 'hit_settings_help',
    onConfirm = function() T.openHelp('settings') end,
    onFocus = function(on) T.trySet(helpBg, 'imageColor', on and T.P.skyDeep or T.P.sky) end,
  })
  local resetBg = T.img(px + 180, -168, 260, 48, 'rect', T.P.roseLight)
  local resetTxt = T.txt(px + 180, -168, 250, 40, 18, '重置茶会记录', T.P.roseDeep, 'Middle', 'Middle')
  T.item({ x = px + 180, y = -168, w = 260, h = 48, name = 'hit_settings_reset',
    onConfirm = function()
      T.openConfirm('重置茶会记录？', '本次茶会的分数、星级与手账进度都会清空。', function()
        T.records.best = { 0, 0, 0, 0 }
        T.records.stars = { 0, 0, 0, 0 }
        T.records.plays, T.records.clears, T.records.totalCleared, T.records.maxCombo = 0, 0, 0, 0
        T.records.visited = { false, false, false, false }
        T.records.achv = {}
        T.log('records reset')
        T.toast('茶会记录已重置', T.P.roseDeep)
      end)
    end,
    onFocus = function(on) T.trySet(resetBg, 'imageColor', on and T.P.rose or T.P.roseLight) end,
  })
  T.footer('↑↓ 选择 · 空格切换 · Q 返回')
  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
end

-- ---------- 制作名单 ----------
T.screenFns.credits = function()
  T.bgGarden('dream')
  T.petals(14, 0, { T.P.rose, T.P.butter, T.P.lilac })
  T.headerTitle('制作名单', '花间茶会制作组', -390)
  T.backButton(function() T.go('menu') end)
  T.img(0, -8, 900, 540, 'rect', T.P.goldLight)
  T.img(0, -8, 890, 530, 'rect', T.P.cream)
  T.img(0, 252, 890, 8, 'rect', T.P.rose)
  T.img(0, -268, 890, 5, 'rect', T.P.goldLight)
  T.img(-430, 250, 12, 12, 'fourstar', T.P.gold)
  T.img(430, 250, 12, 12, 'fourstar', T.P.rose)
  T.img(-430, -266, 12, 12, 'fourstar', T.P.mint)
  T.img(430, -266, 12, 12, 'fourstar', T.P.lilac)
  T.txt(0, 204, 700, 46, 24, '花间茶会 · 制作名单', T.P.ink, 'Middle', 'Middle')
  T.divider(0, 172, 360, T.P.line)
  local lines = {
    '企划 / 世界观　　花间茶会企划组',
    '角色设计　　　　甘雨 · 刻晴 · 少女 · 小草神',
    '界面设计　　　　奶油、花瓣与一点点糖霜',
    '程序　　　　　　Lua × 千星模拟器 2D UI',
    '美术实现　　　　circle / rect / triangle / star / ring',
    '音效　　　　　　千星内置音效库',
    '测试　　　　　　每一位赴约的旅人',
  }
  for i, line in ipairs(lines) do
    T.txt(0, 128 - (i - 1) * 42, 780, 36, 16, line, T.P.ink, 'Middle', 'Middle')
  end
  T.txt(0, -164, 700, 34, 16, '特别感谢', T.P.roseDeep, 'Middle', 'Middle')
  T.txt(0, -198, 700, 32, 15, '愿意在忙碌的日子里，坐下来喝一杯茶的你。', T.P.ink2, 'Middle', 'Middle')
  T.txt(0, -238, 700, 26, 12, '感谢赴约 · 花间茶会', T.P.ink3, 'Middle', 'Middle')
  T.footer('Q / 空格 返回主菜单')
  local screen = T.screen
  screen.key = function(a)
    if a == 'back' or a == 'confirm' then T.go('menu') end
  end
end


-- ===== 35_overlays.lua =====
-- ============================================================================
-- 浮层：章节/角色/茶点详情、确认框、暂停、结算、帮助
-- 层序：blocker(hit) → 面板图 → 文字 → 按钮图 → 按钮文字 → 按钮 hit → 焦点框
-- ============================================================================
T = T or {}

T.ovPanel = function(w, h, accent)
  T.img(0, -8, w + 18, h + 18, 'rect', T.P.shadow)
  T.img(0, 0, w, h, 'rect', accent or T.P.gold)
  T.img(0, 0, w - 10, h - 10, 'rect', T.P.cream)
  T.img(0, h / 2 - 9, w - 10, 9, 'rect', T.P.rose)
  T.img(0, -h / 2 + 9, w - 10, 5, 'rect', T.P.goldLight)
  T.img(-w / 2 + 24, h / 2 - 24, 12, 12, 'fourstar', T.P.goldLight)
  T.img(w / 2 - 24, h / 2 - 24, 12, 12, 'fourstar', T.P.rose)
  T.img(-w / 2 + 24, -h / 2 + 24, 12, 12, 'fourstar', T.P.mint)
  T.img(w / 2 - 24, -h / 2 + 24, 12, 12, 'fourstar', T.P.lilac)
end
T.ovTitle = function(text, y, sub, color)
  T.txt(0, y, 760, 48, 28, text, color or T.P.ink, 'Middle', 'Middle')
  T.divider(0, y - 34, 260, T.P.line)
  if sub then T.txt(0, y - 58, 700, 26, 14, sub, T.P.ink2, 'Middle', 'Middle') end
end
T.ovButton = function(name, x, y, w, h, label, onClick, opts)
  opts = opts or {}
  local border = T.img(x, y, w, h, 'rect', opts.border or T.P.rose)
  local fill = T.img(x, y, w - 6, h - 6, 'rect', opts.fill or T.P.cream)
  local txt = T.txt(x, y, w - 16, h - 8, opts.size or 18, label, opts.color or T.P.ink, 'Middle', 'Middle')
  T.item({ x = x, y = y, w = w, h = h, name = name,
    onConfirm = onClick,
    onFocus = function(on)
      T.trySet(border, 'imageColor', on and T.P.gold or (opts.border or T.P.rose))
      T.trySet(fill, 'imageColor', on and T.P.goldLight or (opts.fill or T.P.cream))
      T.trySet(txt, 'fontColor', on and T.P.ink or (opts.color or T.P.ink))
    end,
  })
end
T.ovCloseButton = function(name, x, y, w, onClick)
  T.ovButton(name, x, y, w, 48, '返 回', onClick, { border = T.P.line, fill = T.P.paper, color = T.P.ink2, size = 16 })
end
T.ovBlocker = function(name)
  T.hit(name, 0, 0, 1280, 720, { clickSfx = false })
end

-- ---------- 章节详情 ----------
T.openChapterDetail = function(chId)
  local ch = T.chapters[chId]
  if not ch then return end
  local c = T.chars[ch.char]
  T.openOverlay('chapter', function()
    T.ovBlocker('hit_chapter_block')
    T.ovPanel(860, 500, c.main)
    T.ovTitle('第 ' .. chId .. ' 席 · ' .. ch.name, 190, ch.sub, c.deep)
    T.img(250, 20, 250, 250, 'rect', c.light)
    T.img(250, 20, 242, 242, 'rect', c.light)
    T.chapterArt(250, 20, 220, 220, { id = ch.id, light = c.light })
    T.medallion(250, -120, 46, c, 0.85, { idle = true })
    T.txt(250, -178, 220, 28, 16, c.name .. ' · 茶席主人', c.deep, 'Middle', 'Middle')
    T.txt(-360, 92, 480, 40, 22, ch.name, T.P.ink, 'Left', 'Middle')
    local lines = T.textH(14, 4)
    T.txt(-360, 20, 480, lines, 14, ch.desc, T.P.ink2, 'Left', 'Middle')
    T.divider(-130, -52, 440, T.P.line)
    T.txt(-360, -92, 480, 30, 15, '目标得分  ' .. ch.goal, T.P.ink, 'Left', 'Middle')
    T.txt(-360, -126, 480, 30, 15, '步数上限  ' .. ch.moves, T.P.ink, 'Left', 'Middle')
    T.txt(-360, -160, 480, 26, 13, '小提示：三个同色茶点连成一线就会消失。', T.P.ink2, 'Left', 'Middle')
    T.ovButton('hit_chapter_start', -160, -214, 260, 52, '开始这杯茶', function()
      T.closeOverlay()
      T.go('game', { chapter = chId })
    end, { border = c.main, fill = c.light, color = c.deep, size = 18 })
    T.ovCloseButton('hit_chapter_close', 150, -214, 180, function() T.closeOverlay() end)
  end, {
    defaultFocus = 1,
    key = function(a)
      if a == 'left' or a == 'right' then T.moveFocus(a == 'left' and -1 or 1, 0)
      elseif a == 'up' or a == 'down' then T.moveFocus(0, a == 'up' and 1 or -1)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end

-- ---------- 角色详情 ----------
T.openCharacterDetail = function(chId, from)
  local c = T.chars[chId]
  if not c then return end
  T.openOverlay('character', function()
    T.ovBlocker('hit_char_block')
    T.ovPanel(900, 520, c.main)
    T.ovTitle('角色茶席', 218, nil, c.deep)
    T.img(-280, 20, 340, 340, 'circle', c.light)
    T.img(-280, 20, 330, 330, 'ring', c.main)
    T.portrait(-280, 10, 1.45, c, { bust = true })
    T.txt(-280, -188, 260, 30, 15, c.name .. ' · ' .. c.title, c.deep, 'Middle', 'Middle')
    T.txt(-30, 118, 420, 62, 34, c.name, T.P.ink, 'Left', 'Middle')
    T.txt(-30, 82, 420, 28, 15, c.title .. ' · ' .. c.element .. ' · 茶席主人', c.deep, 'Left', 'Middle')
    local qlines = T.textH(17, 2)
    T.txt(-30, 28, 440, qlines, 17, '「' .. c.quote .. '」', c.deep, 'Left', 'Middle')
    local dlines = T.textH(13, 3)
    T.txt(-30, -42, 440, dlines, 13, c.desc, T.P.ink2, 'Left', 'Middle')
    T.txt(-30, -108, 440, 26, 13, '喜欢：' .. c.likes, T.P.ink2, 'Left', 'Middle')
    -- 三维小条
    for i, name in ipairs(c.statNames) do
      local y = -124 - (i - 1) * 22
      T.txt(-30, y, 64, 24, 12, name, T.P.ink2, 'Left', 'Middle')
      T.img(86, y, 168, 9, 'rect', T.P.line)
      local fw = 168 * c.stats[i] / 5
      T.img(86 - 84 + fw / 2, y, fw, 9, 'rect', c.main)
    end
    T.ovButton('hit_char_start', 20, -224, 250, 52, '以她为主人开始', function()
      T.closeOverlay()
      T.go('game', { chapter = c.chapter })
    end, { border = c.main, fill = c.light, color = c.deep, size = 17 })
    T.ovCloseButton('hit_char_close', 330, -224, 160, function() T.closeOverlay() end)
  end, {
    defaultFocus = 1,
    key = function(a)
      if a == 'left' or a == 'right' then T.moveFocus(a == 'left' and -1 or 1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end

-- ---------- 茶点详情 ----------
T.openTeaDetail = function(id)
  local d = T.desserts[id]
  if not d then return end
  T.openOverlay('tea', function()
    T.ovBlocker('hit_tea_block')
    T.ovPanel(680, 400, d.base)
    T.ovTitle('茶点图鉴', 156, '甜点与清茶的搭配笔记', d.deep)
    T.dessertArt(-210, 10, 0.9, id)
    T.txt(-40, 62, 360, 40, 24, d.name, T.P.ink, 'Left', 'Middle')
    T.txt(-40, 24, 360, 26, 14, '茶点 · 甜度与清香的小小记录', T.P.ink2, 'Left', 'Middle')
    local lines = T.textH(14, 4)
    T.txt(-40, -34, 360, lines, 14, d.desc, T.P.ink2, 'Left', 'Middle')
    T.txt(-40, -96, 360, 26, 13, '「配一杯清茶，刚刚好。」', d.deep, 'Left', 'Middle')
    T.ovCloseButton('hit_tea_close', 0, -158, 200, function() T.closeOverlay() end)
  end, {
    defaultFocus = 1,
    key = function(a)
      if a == 'confirm' or a == 'back' then T.closeOverlay() end
    end,
  })
end

-- ---------- 确认框 ----------
T.openConfirm = function(title, body, onYes, opts)
  opts = opts or {}
  local pauseBelow = T.overlay and T.overlay.pausesGame
  T.openOverlay('confirm', function()
    T.ovBlocker('hit_confirm_block')
    T.ovPanel(680, 340, opts.accent or T.P.rose)
    T.ovTitle(title, 112, nil, T.P.ink)
    local lines = T.textH(14, 3)
    T.txt(0, 18, 560, lines, 14, body, T.P.ink2, 'Middle', 'Middle')
    T.ovButton('hit_confirm_cancel', -160, -110, 180, 48, '再想想', function() T.closeOverlay() end,
      { border = T.P.line, fill = T.P.paper, color = T.P.ink2, size = 15 })
    T.ovButton('hit_confirm_yes', 100, -110, 180, 48, opts.yes or '确认', function()
      T.closeOverlay()
      if onYes then onYes() end
    end, { border = T.P.roseDeep, fill = T.P.roseLight, color = T.P.roseDeep, size = 15 })
  end, {
    pausesGame = opts.pausesGame or pauseBelow,
    defaultFocus = 1,
    key = function(a)
      if a == 'left' or a == 'right' then T.moveFocus(a == 'left' and -1 or 1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end

-- ---------- 暂停 ----------
T.openPause = function()
  local g = T.game
  local chId = (g and g.chapter) or 1
  T.openOverlay('pause', function(ov)
    T.ovBlocker('hit_pause_block')
    T.ovPanel(560, 540, T.P.gold)
    T.ovTitle('茶会暂停', 220, '先歇一歇，茶还热着。', T.P.ink)
    local labels = { '继续这杯茶', '提示一个茶点', '重新开始', '音效 · 开', '回到茶席', '回到主菜单' }
    local actions = {
      function() T.closeOverlay() end,
      function()
        T.closeOverlay()
        if T.gameHint then T.gameHint() end
      end,
      function()
        T.closeOverlay()
        T.go('game', { chapter = chId })
      end,
      function()
        T.opt.sfx = not T.opt.sfx
        T.setTxt(ov.sfxLabel, '音效 · ' .. (T.opt.sfx and '开' or '关'))
        T.sfx(T.SFX.click)
      end,
      function()
        T.closeOverlay()
        T.go('chapters')
      end,
      function()
        T.openConfirm('回到主菜单？', '这杯茶还没喝完，确定要离开吗？', function()
          T.closeAllOverlays()
          T.go('menu')
        end)
      end,
    }
    for i = 1, 6 do
      local y = 112 - (i - 1) * 54
      if i == 4 then
        local border = T.img(0, y, 340, 42, 'rect', T.P.line)
        local fill = T.img(0, y, 334, 36, 'rect', T.P.paper)
        local label = T.txt(0, y, 320, 34, 16, '音效 · ' .. (T.opt.sfx and '开' or '关'), T.P.ink2, 'Middle', 'Middle')
        ov.sfxLabel = label
        local function apply(on)
          T.trySet(border, 'imageColor', on and T.P.gold or T.P.line)
          T.trySet(fill, 'imageColor', on and T.P.goldLight or T.P.paper)
        end
        T.item({ x = 0, y = y, w = 340, h = 42, name = 'hit_pause_sfx',
          onConfirm = actions[i],
          onFocus = function(on) apply(on) end,
        })
      else
        T.ovButton('hit_pause_' .. i, 0, y, 340, 42, labels[i], actions[i],
          { border = (i == 6 and T.P.line or T.P.rose), fill = (i == 6 and T.P.paper or T.P.cream),
            color = (i == 6 and T.P.ink2 or T.P.ink), size = 16 })
      end
    end
    T.txt(0, -232, 420, 24, 12, 'H 打开茶会指南 · Q 返回游戏', T.P.ink3, 'Middle', 'Middle')
  end, {
    pausesGame = true,
    defaultFocus = 1,
    key = function(a)
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end

-- ---------- 结算 ----------
T.openResult = function(data)
  local win = data.win
  local c = T.chars[T.chapters[data.chapter].char]
  T.openOverlay('result', function()
    T.ovBlocker('hit_result_block')
    T.bgGradient(T.P.bgTop, T.P.bgMid, c.light)
    T.petals(10, 0, { c.main, T.P.butter })
    T.flowerRaw(-T.W * 0.40, T.H * 0.38, 28 * T.S, c.main, T.P.butter)
    T.flowerRaw(T.W * 0.42, T.H * 0.34, 22 * T.S, T.P.rose, T.P.butter)
    T.ovPanel(1040, 600, c.main)
    T.ovTitle(win and '茶会完成' or '茶会歇息', 226, win and '这杯茶，泡得刚刚好。' or '再坐一会儿，水还没凉。', win and c.deep or T.P.ink)
    -- 星级
    for i = 1, 3 do
      local x = -140 + (i - 1) * 140
      T.img(x, 104, 76, 76, 'fivestar', i <= data.stars and T.P.gold or T.P.line)
    end
    T.txt(0, 34, 520, 34, 15, win and '本杯得分' or '本杯得分', T.P.ink2, 'Middle', 'Middle')
    T.txt(0, -20, 520, 70, 44, tostring(data.score), c.deep, 'Middle', 'Middle')
    T.txt(0, -78, 520, 28, 14, '最高 ' .. data.best .. '　·　连击 ' .. data.maxCombo .. '　·　消除 ' .. data.cleared,
      T.P.ink2, 'Middle', 'Middle')
    local defs = {
      { '再来一杯', function() T.closeOverlay(); T.screen = nil; T.go('game', { chapter = data.chapter }) end },
    }
    if win and data.chapter < #T.chapters then
      defs[#defs + 1] = { '下一茶席', function() T.closeOverlay(); T.go('game', { chapter = data.chapter + 1 }) end }
    end
    defs[#defs + 1] = { '回到茶席', function() T.closeOverlay(); T.go('chapters') end }
    defs[#defs + 1] = { '回到主菜单', function() T.closeOverlay(); T.go('menu') end }
    local n = #defs
    local total = n * 190 + (n - 1) * 16
    local x0 = -total / 2 + 95
    for i, d in ipairs(defs) do
      local x = x0 + (i - 1) * 206
      T.ovButton('hit_result_' .. i, x, -206, 190, 50, d[1], d[2],
        { border = (i == 1 and c.main or T.P.line), fill = (i == 1 and c.light or T.P.paper),
          color = (i == 1 and c.deep or T.P.ink2), size = 15 })
    end
    T.txt(0, -262, 700, 24, 12, '按 Q 回到茶席', T.P.ink3, 'Middle', 'Middle')
  end, {
    pausesGame = true,
    defaultFocus = 1,
    key = function(a)
      if a == 'left' or a == 'right' then T.moveFocus(a == 'left' and -1 or 1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then
        T.closeOverlay(); T.go('chapters')
      end
    end,
  })
end

-- ---------- 帮助 ----------
T.openHelp = function(from)
  if T.overlay and T.overlay.name == 'help' then return end
  local pauseBelow = T.overlay and T.overlay.pausesGame
  T.openOverlay('help', function()
    T.ovBlocker('hit_help_block')
    T.ovPanel(1040, 580, T.P.gold)
    T.ovTitle('茶会指南', 230, '一场关于茶点、键盘与鼠标的说明', T.P.ink)
    local cols = {
      { x = -340, title = '操作', icon = 'flower', text = '鼠标 / 触屏：点击卡片与茶点\n方向键：移动焦点\n空格：确认 / 选择\nQ：返回 / 暂停\nH：随时打开这份指南' },
      { x = 0, title = '茶点三消', icon = 'star', text = '点击两个相邻茶点交换位置\n三个同色连成一线就会消除\n消除后上方茶点会落下来\n连锁消除会提高本杯得分\n在步数用完前达到目标即可' },
      { x = 340, title = '小贴士', icon = 'leaf', text = '八秒没有操作会自动提示\n右侧「提示茶点」也能帮忙\n茶会途中可以随时按 Q 暂停\n每席茶会都有不同的主题色\n分数越高，结算星级越高' },
    }
    for _, col in ipairs(cols) do
      T.img(col.x, 130, 60, 60, 'circle', T.P.paper)
      T.icon(col.icon, col.x, 130, 17, T.P.rose)
      T.txt(col.x, 86, 300, 34, 20, col.title, T.P.ink, 'Middle', 'Middle')
      local lines = T.textH(14, 6)
      T.txt(col.x, 30, 300, lines, 14, col.text, T.P.ink2, 'Middle', 'Middle')
      T.img(col.x, -80, 260, 1.4, 'rect', T.P.line)
      T.img(col.x, -80, 5, 5, 'circle', T.P.gold)
    end
    T.ovButton('hit_help_close', 0, -218, 240, 52, '知道啦', function() T.closeOverlay() end,
      { border = T.P.rose, fill = T.P.roseLight, color = T.P.roseDeep, size = 17 })
  end, {
    pausesGame = from == 'game' or pauseBelow,
    defaultFocus = 1,
    key = function(a)
      if a == 'confirm' or a == 'back' or a == 'help' then T.closeOverlay() end
    end,
  })
end


-- ===== 40_game.lua =====
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


-- ===== 50_main.lua =====
-- ============================================================================
-- 入口：OnStart / OnUpdate / 键位映射
-- ============================================================================
T = T or {}

T.keyMap = {
  KeyboardCraftspersonKey36Down = 'up', KeyboardMoveForwardKeyDown = 'up',
  KeyboardCraftspersonKey37Down = 'down', KeyboardMoveBackwardKeyDown = 'down',
  KeyboardCraftspersonKey38Down = 'left', KeyboardMoveLeftKeyDown = 'left',
  KeyboardCraftspersonKey39Down = 'right', KeyboardMoveRightKeyDown = 'right',
  KeyboardJumpKeyDown = 'confirm', KeyboardInteractKeyDown = 'confirm',
  KeyboardCharacterSkill2KeyDown = 'back', KeyboardCraftspersonKey42Down = 'back',
  KeyboardCraftspersonKey15Down = 'help', KeyboardCharacterSkill1KeyDown = 'help',
  KeyboardCharacterSkill4KeyDown = 'debug',
}

T.onKey = function(action)
  if not action or T.transition then return end
  if T.lastAction == action and T.lastActionFrame == T.frame then return end
  T.lastAction, T.lastActionFrame = action, T.frame
  if action == 'help' and not (T.overlay and T.overlay.name == 'help') then
    T.openHelp(T.mode)
    return
  end
  if T.screen and T.screen.key then T.screen.key(action); return end
  if T.overlay and T.overlay.key then T.overlay.key(action); return end
  if action == 'up' then T.moveFocus(0, 1)
  elseif action == 'down' then T.moveFocus(0, -1)
  elseif action == 'left' then T.moveFocus(-1, 0)
  elseif action == 'right' then T.moveFocus(1, 0)
  elseif action == 'confirm' then T.confirmFocus()
  end
end

T.probeOne = function(guid, kind)
  local ok, ctl = pcall(function() return game.InstantiateClientUIControl(guid, T.root) end)
  if not ok or not ctl then return false end
  local good = false
  if kind == 'prim' then
    good = pcall(function()
      ctl.imageColor = T.P.white
      ctl:SetImage(Enum.ImageSource.StaticReference, 100002)
      ctl:SetSizeDelta(10, 10)
    end)
  elseif kind == 'label' then
    good = pcall(function()
      ctl.text = '茶'
      ctl.fontSize = 20
      ctl.fontColor = T.P.ink
    end)
    if good then
      -- textwindow 也接受 text/fontSize；它有 showScrollBar，texbox 没有
      local isWindow = pcall(function() ctl.showScrollBar = false end)
      if isWindow then good = false end
    end
  elseif kind == 'hit' then
    local hasFn = pcall(function() return ctl.AddCursorEventListener end)
    local fn = hasFn and ctl.AddCursorEventListener or nil
    -- button/grid 也接受 interactable；cursor 不接受（只有 raycastTarget）
    local isButton = pcall(function() ctl.interactable = true end)
    good = type(fn) == 'function' and not isButton
  end
  pcall(function() game.DestroyClientUIControl(ctl) end)
  return good
end
T.discoverTemplates = function()
  local missing = {}
  for _, k in ipairs({ 'prim', 'label', 'hit' }) do
    if not T.probeOne(T.tpl[k], k) then missing[#missing + 1] = k end
  end
  if #missing == 0 then return true end
  T.log('discover missing=' .. table.concat(missing, ','))
  local ranges = { { 1073741825, 1073742050 }, { 1073742100, 1073742150 } }
  for _, r in ipairs(ranges) do
    for guid = r[1], r[2] do
      for i = #missing, 1, -1 do
        local k = missing[i]
        if T.probeOne(guid, k) then
          T.tpl[k] = guid
          T.log('discover ' .. k .. '=' .. guid)
          table.remove(missing, i)
          if #missing == 0 then return true end
        end
      end
    end
  end
  T.log('discover incomplete: ' .. table.concat(missing, ','))
  return false
end
T.probeTemplates = function()
  local all = true
  for _, k in ipairs({ 'prim', 'label', 'hit' }) do
    local ok = T.probeOne(T.tpl[k], k)
    T.log('probe', k, tostring(T.tpl[k]), ok and 'ok' or 'FAIL')
    if not ok then all = false end
  end
  if not all then
    local ok = T.discoverTemplates()
    T.log('discover result=' .. tostring(ok))
  end
end

function OnStart()
  local ok, err = xpcall(function()
    T.root = script.object
    if not T.root then error('script.object is nil') end
    T.root.showCursor = true
    script:EnableUpdate(true)
    T.layout()
    T.log('onstart version=' .. T.VERSION .. ' build=' .. T.BUILD_ID)
    T.probeTemplates()
    T.setSeed(20261028)
    -- 键位注册：枚举优先，字符串回落
    -- 真机 AddKeyEventListener 第一参要求 KeyEventType 枚举；Enum.KeyCode 是另一套命名空间
    if type(Enum) == 'table' and Enum.KeyEventType then
      T.keyEnum = Enum.KeyEventType
    end
    for raw, action in pairs(T.keyMap) do
      local okKey, errKey
      if T.keyEnum and T.keyEnum[raw] ~= nil then
        okKey, errKey = pcall(function() T.root:AddKeyEventListener(T.keyEnum[raw], function() T.onKey(action) end) end)
      end
      if not okKey then
        okKey, errKey = pcall(function() T.root:AddKeyEventListener(raw, function() T.onKey(action) end) end)
      end
      if not okKey then T.warn('key fail ' .. raw .. ' :: ' .. tostring(errKey)) end
    end
    T.log('keys registered')
    T.build('title')
  end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then
    T.warn('OnStart FAILED :: ' .. tostring(err))
    print('[tea] OnStart FAILED :: ' .. tostring(err))
  end
end

function OnUpdate(dt)
  if not T.root then return end
  local ok, err = xpcall(function()
    T.tick(math.min(dt or 0.016, 0.05))
  end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then
    T.warn('OnUpdate FAILED :: ' .. tostring(err))
  end
end

