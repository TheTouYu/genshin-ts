--[[==========================================================================
 tetris/view_kit.lua —— 控件工厂（纯描述版）：胶囊 / 文字 / 键帽 / 按钮 / 文字面板
 ----------------------------------------------------------------------------
 为什么收这一层：这一个工程里「一个按钮」被手写过四遍（模式卡 / 入口卡 / 结算三键 /
 手机拇指键），每遍漏掉的东西不同 —— 最惨的一次是漏了命中注册：卡面画得漂亮，
 鼠标/触屏完全点不到。把「合格按钮」的六件套固化成纯函数以后，
 新按钮 = 一次调用，且能被 headless lint 检查（层号/文字高度/热区覆盖）。

 六件套（数值全部来自 controls.lua 的实战结论，不许重新设计）：
   ① 形状：胶囊 = 中段矩形 + 左右半圆（引擎没有圆角矩形图元）
   ② 文字：框高 ≥ ⌊fontSize×1.45+6⌋（矮了引擎 fits=false 会整条不画）
   ③ 键帽：34×34，收进胶囊内；左侧内边距 16 + 键帽 34 + 间隙 10 → 文字区
   ④ 热区：比视觉外扩 +40/+24（手感），**y 与视觉同号**（取负会把热区镜像到画布另一侧，
           表现为「看得见、点不到」—— 2026-10-30 实测定谳）
   ⑤ 注册：热区必须在 layer='touch'（高于面板/卡片），否则被上层节点挡住
   ⑥ 三态：hover/press 用预置色板（不透明色，半透明会出叠印缝）

 本文件不碰引擎（返回 node 数组），渲染交给 render.lua。
========================================================================]]

local M = {}

-- ===== 三态派生比例（模块顶部常量；判据：hover 必须比 normal 亮、pressed 必须比 normal 暗）=====
-- 为什么是「往白/往黑混」而不是「乘一个亮度系数」：乘系数在深色底上会把 RGB 压到 0（三态撞车），
-- 往白/往黑混对任意底色都单调可分，且与 K.over 的线性混合口径一致（alpha 保留原值）。
M.STATE_MIX = { hover = 0.12, press = 0.20 }
-- 三态与 normal 的最小**感知**亮度差（2026-11-17 真机教训）：底色 0xFFF5F0F1（近白卡片）
-- 往白混 12% 只加 +1/+7/+2 ⇒ 用户原话「没有悬浮高亮」。方向服从可感知性：
-- hover 在浅底上改为**往黑混**（视觉上"压暗一点"），保证差值 ≥ MIN_DELTA。
-- pressed 永远是"更暗"，不参与翻转（它的语义就是按下变深，深色底上差值小是可接受的）。
M.STATE_MIN_DELTA = 12
M.STATE_NAMES = { 'normal', 'hover', 'pressed' }
local STATE_WHITE, STATE_BLACK = 16777215, 0

M.new = function(spec)
  spec = spec or {}
  local L = assert(spec.layers, 'view_kit: 需要 spec.layers')
  local cols = spec.colors or {}
  local K = {}

  -- ===== 颜色（与 main.lua 的 MS.over 同一算法：RGB 线性混合，alpha 恒 255）=====
  function K.C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end

  function K.over(base, tint, k)
    local br, bg, bb = (base // 65536) % 256, (base // 256) % 256, base % 256
    local r, g, b = (tint // 65536) % 256, (tint // 256) % 256, tint % 256
    return K.C(255,
      math.floor(br + (r - br) * k + 0.5),
      math.floor(bg + (g - bg) * k + 0.5),
      math.floor(bb + (b - bb) * k + 0.5))
  end

  -- ===== 三态颜色（纯函数，headless 可断言）=====
  local mix = spec.stateMix or {}

  function K.stateMix()
    return {
      hover = mix.hover or M.STATE_MIX.hover,
      press = mix.press or M.STATE_MIX.press,
    }
  end

  -- 0..255 的感知亮度（只用于判据与测试：断言 hover 亮、pressed 暗）
  function K.lum(color)
    local r, g, b = (color // 65536) % 256, (color // 256) % 256, color % 256
    return 0.299 * r + 0.587 * g + 0.114 * b
  end

  -- 三态色：'normal' 原样；'hover' 往白混；'pressed' 往黑混；未知状态名**回落到 normal**并回报
  -- 返回 (color, ok, why)：ok=false 时调用方应当把状态名当错误处理（但颜色仍可用）
  function K.stateColor(base, state)
    state = state or 'normal'
    if type(state) ~= 'string' or base == nil then return base, false, 'bad-args' end
    if state == 'normal' then return base, true end
    local k = nil
    if state == 'hover' then k = K.stateMix().hover
    elseif state == 'pressed' then k = K.stateMix().press
    else return base, false, 'unknown-state:' .. state end
    local a = base // 16777216                     -- 保留原 alpha（K.over 恒返回 255）
    local target = (state == 'hover') and STATE_WHITE or STATE_BLACK
    local mixed = K.over(base, target, k)
    local color = (mixed % 16777216) + a * 16777216
    -- hover 的可感知性兜底：浅底往白混看不出来 ⇒ 换方向（往黑）并保证差值 ≥ STATE_MIN_DELTA
    if state == 'hover' then
      local lum = K.lum(base)
      if math.abs(K.lum(color) - lum) < M.STATE_MIN_DELTA then
        local other = (target == STATE_WHITE) and STATE_BLACK or STATE_WHITE
        local reach = (other == STATE_WHITE) and (255 - lum) or lum
        if reach > 0 then
          local kk = math.max(k, math.min(1, M.STATE_MIN_DELTA / reach))
          local mixed2 = K.over(base, other, kk)
          color = (mixed2 % 16777216) + a * 16777216
        end
      end
    end
    return color, true
  end

  -- 三色表：给 base 就派生，给了 hover/press 就用死值（项目侧可覆盖个别状态）
  function K.stateColors(o)
    o = o or {}
    local base = o.base or K.C(255, 240, 240, 240)
    return {
      normal = base,
      hover = o.hover or K.stateColor(base, 'hover'),
      pressed = o.press or o.pressed or K.stateColor(base, 'pressed'),
    }
  end

  -- 把 render 实例包成 onChange：项目侧一行接上（onChange = K.repainter(R)）
  -- R 只需有 write(key, field, value)；没给 R 时安全空转（headless 里常这样用）
  function K.repainter(R, field)
    field = field or 'imageColor'
    return function(state, color, keys)
      if not (R and R.write) then return 0 end
      for i = 1, #keys do R.write(keys[i], field, color) end
      return #keys
    end
  end

  -- ===== 状态机（框架持有；项目侧只提供 onChange）=====
  -- 两个布尔位（inside / down）+ 一个派生状态，转移表：
  --   enter: inside=1 → down? pressed : hover      leave: inside=0 → down? pressed : normal
  --   down : down=1  → pressed                     up   : down=0  → inside? hover : normal
  --   click: 不改状态（点击的语义是"动作"，不是"外观"）
  -- 幂等：同状态重复事件不触发 onChange（鼠标扫过一排按钮不会闪）
  function K.states(o)
    o = o or {}
    local cols = K.stateColors(o)
    local keys = {}
    for i = 1, #(o.keys or {}) do keys[i] = o.keys[i] end
    -- 注意：按下位叫 held，不能叫 down —— 方法 S:down 会把它覆盖成函数（踩过：enter 直接进 pressed）
    local S = {
      state = 'normal', inside = false, held = false,
      keys = keys, colors = cols, onChange = o.onChange,
      changes = 0, last = nil, name = o.key,
    }
    local function fire(why)
      S.changes = S.changes + 1
      S.last = why
      if S.onChange then S.onChange(S.state, cols[S.state], keys) end
    end
    function S:current() return self.state end
    function S:color() return cols[self.state] end
    local function set(st, why)
      if S.state == st then return false end
      S.state = st
      fire(why)
      return true
    end
    function S:enter()
      S.inside = true
      return set(S.held and 'pressed' or 'hover', 'enter')
    end
    function S:leave()
      S.inside = false
      return set(S.held and 'pressed' or 'normal', 'leave')
    end
    function S:down()
      S.held = true
      return set('pressed', 'down')
    end
    function S:up()
      S.held = false
      return set(S.inside and 'hover' or 'normal', 'up')
    end
    function S:click() return false end
    function S:reset()
      S.inside, S.held, S.state = false, false, 'normal'
      return self
    end
    -- 一次性重涂：把当前色写给 keys 里的每个控件（项目侧一行接上 render.write）
    function S:apply(writeFn, field)
      if not writeFn then return 0 end
      field = field or 'imageColor'
      local c = cols[self.state]
      for i = 1, #keys do writeFn(keys[i], field, c) end
      return #keys
    end
    return S
  end

  -- 三套预置语汇：静止底 / 悬停 / 按下 / 墨色（都是不透明色）
  function K.presets(wall, ink, gold, cyan)
    wall = wall or cols.wall or K.C(255, 247, 250, 255)
    ink = ink or cols.ink or K.C(255, 24, 32, 44)
    gold = gold or cols.gold or K.C(255, 186, 148, 74)
    cyan = cyan or cols.cyan or K.C(255, 70, 150, 220)
    return {
      gold = { base = K.over(wall, gold, 0.12), hover = K.over(wall, gold, 0.28),
        press = K.over(wall, gold, 0.38), ink = cols.goldDeep or gold },
      cyan = { base = K.over(wall, cyan, 0.12), hover = K.over(wall, cyan, 0.28),
        press = K.over(wall, cyan, 0.38), ink = cols.cyanDeep or cyan },
      plain = { base = K.over(wall, ink, 0.06), hover = K.over(wall, ink, 0.16),
        press = K.over(wall, ink, 0.24), ink = ink },
    }
  end

  -- 文字内容宽度预留宿主两侧内边距；ASCII 保守按 0.65em，避免再次自动折行。
  local function glyphW(ch, font)
    local b = string.byte(ch, 1)
    if b and b < 0x80 then
      if ch == ' ' then return font * 0.55 end
      return font * 0.65
    end
    return font
  end

  -- CJK 折行（引擎的单行 textbox 不自动换行，多行必须自己给 '\n'）
  function K.wrapText(text, font, maxW)
    maxW = math.max(1, (maxW or 200) - 4)
    local out, line, w = {}, {}, 0
    local function flush(force)
      if force or #line > 0 then out[#out + 1] = table.concat(line) end
      line, w = {}, 0
    end
    local str = tostring(text or '')
    local i, n = 1, #str
    while i <= n do
      local b = string.byte(str, i)
      local len = 1
      if b >= 0xF0 then len = 4 elseif b >= 0xE0 then len = 3 elseif b >= 0xC0 then len = 2 end
      local ch = str:sub(i, i + len - 1)
      i = i + len
      if ch == '\n' then
        flush(true)
      else
        local cw = glyphW(ch, font)
        if w + cw > maxW and #line > 0 then
          -- 断行禁则：行尾的 ASCII 词整体挪到下一行（'skills' 不许断成 'ski'/'lls'）
          local tail, back = {}, 0
          while #line - back > 0 do
            local c = line[#line - back]
            if c:match('[%w%%%.]') then back = back + 1 else break end
          end
          if back > 0 and back < #line then
            for k = #line - back + 1, #line do tail[#tail + 1] = line[k] end
            for k = #line, #line - back + 1, -1 do line[k] = nil end
          end
          flush()
          line, w = tail, 0
          for k = 1, #tail do w = w + glyphW(tail[k], font) end
        end
        line[#line + 1] = ch
        w = w + cw
      end
    end
    flush(str:sub(-1) == '\n')
    if #out == 0 then out[1] = '' end
    return out
  end



  -- 文字框最小高度（引擎判据）：低于它 textbox 会 fits=false 整条不画
  function K.textMinH(font, lines)
    return math.ceil((font or 16) * 1.45 + 6) * (lines or 1)
  end

  K.METRIC = {
    keycap = 34, pad = 16, gap = 10, hitPadW = 40, hitPadH = 24,
    minTextW = 40, lift = 4,
  }

  -- ===== ① 胶囊：中段矩形 + 左右半圆 =====
  function K.pill(o)
    local key = assert(o.key, 'pill: 需要 key')
    local x, y = o.x or 0, o.y or 0
    local w, h = o.w or 200, o.h or 64
    local body = math.max(2, w - h)
    local layer = o.layer or 'card'
    local color = o.color
    local tpl = o.tpl or 'cell'
    -- 左右两端用 circle 图元才是圆角（引擎没有圆角矩形；只给矩形会看到方角）
    local capShape = o.capShape or 'circle'
    return {
      { key = key .. 'B', layer = layer, tpl = tpl, name = key .. 'B', parentKey = o.parentKey,
        pos = { x, y }, size = { body, h }, color = color, image = { s = 'rect' } },
      { key = key .. 'L', layer = layer, tpl = tpl, name = key .. 'L', parentKey = o.parentKey,
        pos = { x - body / 2, y }, size = { h, h }, color = color, image = { s = capShape } },
      { key = key .. 'R', layer = layer, tpl = tpl, name = key .. 'R', parentKey = o.parentKey,
        pos = { x + body / 2, y }, size = { h, h }, color = color, image = { s = capShape } },
    }
  end

  -- ===== ② 文字 =====
  function K.text(o)
    local key = assert(o.key, 'text: 需要 key')
    local font = o.font or 22
    local lines = select(2, tostring(o.text or ''):gsub('\n', '')) + 1
    local h = o.h or K.textMinH(font, lines)
    return {
      key = key, layer = o.layer or 'card', tpl = o.tpl or 'stext', name = o.name or key,
      parentKey = o.parentKey, pos = { o.x or 0, o.y or 0 }, size = { o.w or 200, h },
      text = o.text or '', font = font, fcolor = o.color, bg = o.bg,
      align = o.align or 'Middle', valign = o.valign or 'Middle',
      visible = o.visible,
    }
  end

  -- ===== ③ 键帽：小胶囊 + 字母 =====
  function K.keycap(o)
    local key = assert(o.key, 'keycap: 需要 key')
    local cw = o.w or K.METRIC.keycap
    local ch = o.h or K.METRIC.keycap
    local out = K.pill { key = key .. 'K', x = o.x, y = o.y, w = cw, h = ch,
      color = o.color, layer = o.layer or 'card', parentKey = o.parentKey, tpl = o.tpl }
    out[#out + 1] = K.text { key = key .. 'KT', x = o.x, y = o.y, w = cw, h = ch,
      text = tostring(o.label or ''), font = o.font or 16, color = o.ink,
      layer = o.layer or 'card', parentKey = o.parentKey, align = 'Middle' }
    return out
  end

  -- ===== ④⑤⑥ 按钮：胶囊 + 标题(+副标) + 键帽 + 热区 =====
  -- o = { key, x, y, w, h, label, sub, keyLabel, preset, fill, ink, subInk, font, subFont,
  --       on = { CursorClick = fn, CursorEnter = ... }, layer, hitLayer, pad, dx, titleDy, subDy }
  function K.button(o)
    local key = assert(o.key, 'button: 需要 key')
    local w, h = o.w or 240, o.h or 64
    local x, y = o.x or 0, o.y or 0
    local layer = o.layer or 'card'
    local presets = o.presets or K.presets()
    local p = presets[o.preset or 'gold'] or presets.gold
    local fill = o.fill or p.base
    local ink = o.ink or p.ink
    local pad = o.pad or K.METRIC.pad
    local out = K.pill { key = key, x = x, y = y, w = w, h = h, color = fill,
      layer = layer, parentKey = o.parentKey }

    local hasKey = o.keyLabel ~= nil
    local chipW = hasKey and K.METRIC.keycap or 0
    local textW = math.max(K.METRIC.minTextW, w - pad * 2 - (hasKey and (chipW + K.METRIC.gap) or 0))
    local textLeft = x - w / 2 + pad + (hasKey and (chipW + K.METRIC.gap) or 0) + (o.dx or 0)
    local tx = textLeft + textW / 2
    local fs = o.font or 22
    local titleDy = o.titleDy or (o.sub and 16 or 0)
    out[#out + 1] = K.text { key = key .. 'T', x = tx, y = y + titleDy, w = textW,
      text = o.label or '', font = fs, color = ink, layer = layer, parentKey = o.parentKey }
    if o.sub then
      out[#out + 1] = K.text { key = key .. 'S', x = tx, y = y - (o.subDy or 18), w = w - pad * 2,
        text = o.sub, font = o.subFont or math.max(12, fs - 9),
        color = o.subInk or cols.subInk or ink, layer = layer, parentKey = o.parentKey }
    end
    if hasKey then
      local cx = x - w / 2 + pad + K.METRIC.keycap / 2
      local cap = K.keycap { key = key .. 'K', x = cx, y = y, w = chipW, h = chipW,
        label = o.keyLabel, ink = ink, color = K.over(fill, ink, 0.10), layer = layer,
        parentKey = o.parentKey }
      for i = 1, #cap do out[#out + 1] = cap[i] end
    end
    -- 热区：y 与视觉同号（取负=镜像到画布另一侧，实测「看得见点不到」的真因）
    local hitOn = o.on
    local st = nil
    if o.states then
      -- 三态：状态机由框架建并持有；项目侧只给 onChange（重涂），自己的 CursorXxx 照样回调
      local spec = o.states
      local vkeys = spec.keys or { key .. 'B', key .. 'L', key .. 'R' }
      st = K.states {
        key = key, keys = vkeys, base = spec.base or fill,
        hover = spec.hover, press = spec.press, onChange = spec.onChange,
      }
      local user = o.on or {}
      hitOn = {
        CursorClick = user.CursorClick,
        CursorEnter = function(...) if user.CursorEnter then user.CursorEnter(...) end st:enter() end,
        CursorExit = function(...) if user.CursorExit then user.CursorExit(...) end st:leave() end,
        CursorDown = function(...) if user.CursorDown then user.CursorDown(...) end st:down() end,
        CursorUp = function(...) if user.CursorUp then user.CursorUp(...) end st:up() end,
      }
    end
    out[#out + 1] = {
      key = key .. 'Hit', layer = o.hitLayer or 'touch', tpl = o.hitTpl or 'hit',
      name = key .. 'Hit', parentKey = o.parentKey, pos = { x, y },
      size = { w + (o.hitPadW or K.METRIC.hitPadW), h + (o.hitPadH or K.METRIC.hitPadH) },
      cursor = { 'CursorEnter', 'CursorExit', 'CursorDown', 'CursorUp', 'CursorClick' },
      on = hitOn,
    }
    if st then out.state = st end     -- 数组附带的状态机（#out 不受影响）
    return out
  end

  -- ===== 文字面板：卡片三块 + 标题/副标 + 分隔线 + 多行正文 + 页脚 =====
  function K.panel(o)
    local key = assert(o.key, 'panel: 需要 key')
    local x, y = o.x or 0, o.y or 0
    local w, h = o.w or 380, o.h or 420
    local layer = o.layer or 'card'
    local presets = o.presets or K.presets()
    local accent = o.accent or presets.gold.ink
    local out = K.pill { key = key, x = x, y = y, w = w, h = h,
      color = o.fill or presets.gold.base, layer = layer, parentKey = o.parentKey }
    local top = y + h / 2
    if o.title then
      out[#out + 1] = K.text { key = key .. 'T', x = x, y = top - (o.titleDy or 46), w = w - 40,
        text = o.title, font = o.titleFont or 38, color = o.titleColor or accent,
        layer = layer, parentKey = o.parentKey, align = 'Middle' }
    end
    if o.subtitle then
      out[#out + 1] = K.text { key = key .. 'S', x = x, y = top - ((o.titleDy or 46) + 40),
        w = w - 40, text = o.subtitle, font = o.subFont or 16,
        color = o.subColor or (cols.subInk or accent), layer = layer, parentKey = o.parentKey }
    end
    out[#out + 1] = {
      key = key .. 'Rule', layer = layer, tpl = 'cell', name = key .. 'Rule',
      parentKey = o.parentKey, pos = { x, top - ((o.titleDy or 46) + 64) },
      size = { w - 56, 2 }, color = accent,
    }
    local base = top - ((o.titleDy or 46) + 100)
    for i = 1, #(o.lines or {}) do
      local ty = base - (i - 1) * (o.lineGap or 34)
      out[#out + 1] = K.text { key = key .. 'L' .. i, x = x, y = ty, w = w - 48,
        text = o.lines[i], font = o.font or 18, color = o.ink or (cols.ink or accent),
        layer = layer, parentKey = o.parentKey, align = 'Left' }
    end
    if o.footer then
      out[#out + 1] = K.text { key = key .. 'F', x = x, y = y - h / 2 + 26, w = w - 40,
        text = o.footer, font = o.footFont or 15, color = accent,
        layer = layer, parentKey = o.parentKey }
    end
    return out
  end

  -- 纯热区（只要可点、不要可见件时用）
  -- o.states 给了就把三态挂上（画面由别处画，keys 指出要重涂的控件键）
  function K.hit(o)
    local key = assert(o.key, 'hit: 需要 key')
    local on = o.on
    local st = nil
    if o.states then
      local spec = o.states
      st = K.states {
        key = key, keys = spec.keys or { key }, base = spec.base,
        hover = spec.hover, press = spec.press, onChange = spec.onChange,
      }
      local user = o.on or {}
      on = {
        CursorClick = user.CursorClick,
        CursorEnter = function(...) if user.CursorEnter then user.CursorEnter(...) end st:enter() end,
        CursorExit = function(...) if user.CursorExit then user.CursorExit(...) end st:leave() end,
        CursorDown = function(...) if user.CursorDown then user.CursorDown(...) end st:down() end,
        CursorUp = function(...) if user.CursorUp then user.CursorUp(...) end st:up() end,
      }
    end
    return {
      key = key, layer = o.layer or 'touch', tpl = o.tpl or 'hit', name = o.name or key,
      parentKey = o.parentKey, pos = { o.x or 0, o.y or 0 },
      size = { o.w or 100, o.h or 100 },
      cursor = st and { 'CursorEnter', 'CursorExit', 'CursorDown', 'CursorUp', 'CursorClick' }
        or { 'CursorClick' },
      on = on, state = st,
    }
  end

  return K
end

return M
