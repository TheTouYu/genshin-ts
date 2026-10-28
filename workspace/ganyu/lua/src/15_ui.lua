-- ============================================================================
-- UI 组件库：统一视觉语言（按钮 / 卡片 / 页头 / 页签 / 进度条 / 图标 / 槽位）
-- 规则：所有可点组件必须同时支持 鼠标悬停 与 键盘焦点；所有文字框高度走 T.textH。
-- ============================================================================
T = T or {}

-- ---------- 页头 / 页脚 ----------
T.header = function(title, sub, opts)
  opts = opts or {}
  local x = opts.x or (-T.DESIGN_W / 2 + 176)
  local y = opts.y or T.HEAD_Y
  T.img(x + 3, y, 4, 40, 'rect', T.th.accent2)
  T.img(x + 3, y + 26, 34, 2, 'rect', T.th.line)
  local tc = T.txt(x + 22, y + 4, 520, 52, opts.size or 34, title, T.th.text, 'Left', 'Middle')
  if sub then
    T.txt(x + 22, y - 30, 640, 26, 13, sub, T.th.text3, 'Left', 'Middle')
  end
  if opts.right then T.txt(T.DESIGN_W / 2 - T.M, y, 220, 30, 13, opts.right, T.th.text3, 'Right', 'Middle') end
  return tc
end
T.footer = function(parts)
  -- parts: { {key='↑↓', label='选择'}, ... } 或 字符串
  local y = -326
  if type(parts) == 'string' then
    T.txt(0, y, 1000, 30, 13, parts, T.th.text3, 'Middle', 'Middle')
    return
  end
  local widths, total = {}, 0
  for i, p in ipairs(parts) do
    local kw = p.key and (#p.key * 11 + 16) or 0
    widths[i] = kw + 8 + T.ulen(p.label) * 13 + 22
    total = total + widths[i]
  end
  local x = -total / 2
  for i, p in ipairs(parts) do
    local cw = widths[i]
    local cx = x + cw / 2
    local tx = cx
    if p.key then
      local kw = T.ulen(p.key) * 11 + 16
      local kx = cx - cw / 2 + kw / 2
      T.rrect(kx, y, kw, 22, 6, T.th.borderSoft)
      T.txt(kx, y, kw, 20, 11, p.key, T.th.text2, 'Middle', 'Middle')
      tx = kx + kw / 2 + (T.ulen(p.label) * 13) / 2 + 8
    end
    T.txt(tx, y, T.ulen(p.label) * 15 + 20, 24, 13, p.label, T.th.text3, 'Middle', 'Middle')
    x = x + cw
  end
end
T.backBtn = function(onClick, label)
  local x, y = -T.DESIGN_W / 2 + 54, T.HEAD_Y
  local bg = T.img(x, y, 36, 36, 'circle', T.th.panel2)
  local ring = T.img(x, y, 34, 34, 'ring', T.th.border)
  local arrow = T.img(x - 1, y, 12, 12, 'triangle', T.th.text2, -90)
  local ctl = T.txt(x + 30, y, 100, 34, 14, label or '返回', T.th.text2, 'Left', 'Middle')
  T.item({
    x = x + 20, y = y, w = 120, h = 44, name = 'hit_back', focusPad = 4,
    onConfirm = function() T.sfx(T.SFX.back); onClick() end,
    onFocus = function(on)
      T.setColor(bg, on and T.th.accent or T.th.panel2)
      T.setTxtColor(ctl, on and T.th.text or T.th.text2)
      T.setColor(arrow, on and T.th.onAccent or T.th.text2)
    end,
  })
end

-- ---------- 图标系统（纯图元，统一线条/填充） ----------
T.icon = function(kind, x, y, s, color)
  color = color or T.th.text2
  s = s or 10
  if kind == 'bow' then
    T.img(x + s * 0.1, y + s * 0.15, s * 0.26, s * 1.75, 'rect', color, -14)
    T.img(x - s * 0.02, y - s * 0.95, s * 0.26, s * 0.5, 'rect', color, 26)
    T.img(x + s * 0.42, y + s * 0.1, s * 0.07, s * 1.8, 'rect', T.withA(color, 170))
    T.img(x - s * 0.55, y + s * 0.2, s * 1.25, s * 0.12, 'rect', color)
    T.img(x + s * 0.62, y + s * 0.2, s * 0.42, s * 0.42, 'triangle', color, 90)
    T.img(x - s * 0.85, y + s * 0.05, s * 0.4, s * 0.36, 'triangle', color, 90)
  elseif kind == 'arrow' then
    T.img(x, y - s * 0.1, s * 0.16, s * 1.7, 'rect', color, 0)
    T.img(x, y + s * 0.85, s * 0.55, s * 0.55, 'triangle', color, 0)
    T.img(x - s * 0.28, y - s * 0.95, s * 0.5, s * 0.4, 'triangle', color, 90)
    T.img(x + s * 0.28, y - s * 0.95, s * 0.5, s * 0.4, 'triangle', color, -90)
  elseif kind == 'snow' then
    T.snowflake(x, y, s, color)
  elseif kind == 'crystal' then
    T.img(x, y, s * 1.1, s * 2.1, 'triangle', color, 0)
    T.img(x, y - s * 1.05, s * 1.1, s * 0.9, 'triangle', color, 180)
    T.img(x, y, s * 0.3, s * 1.5, 'rect', T.withA(T.P.white, 90))
  elseif kind == 'flower' then
    T.flower(x, y, s * 0.62, color, T.th.accent2)
  elseif kind == 'coin' then
    T.img(x, y, s * 1.9, s * 1.9, 'circle', color)
    T.img(x, y, s * 1.35, s * 1.35, 'ring', T.withA(T.P.ink, 90))
    T.img(x, y, s * 0.5, s * 0.5, 'circle', T.withA(T.P.gold2, 160))
  elseif kind == 'book' then
    T.img(x - s * 0.35, y, s * 1.5, s * 1.9, 'rect', color)
    T.img(x + s * 0.4, y, s * 0.16, s * 1.9, 'rect', T.withA(T.P.ink, 80))
    T.img(x - s * 0.35, y, s * 1.2, s * 0.12, 'rect', T.withA(T.P.white, 120))
  elseif kind == 'star' then
    T.img(x, y, s * 2, s * 2, 'fivestar', color)
  elseif kind == 'const' then
    for i = 0, 5 do
      local a = i * math.pi / 3 - math.pi / 2
      T.img(x + math.cos(a) * s * 0.82, y + math.sin(a) * s * 0.82, s * 0.3, s * 0.3, 'circle', color)
    end
    T.img(x, y, s * 0.9, s * 0.9, 'fourstar', color)
    T.img(x, y, s * 0.34, s * 0.34, 'circle', T.th.panel)
  elseif kind == 'mountain' then
    T.img(x - s * 0.5, y - s * 0.2, s * 1.7, s * 1.5, 'triangle', color, 0)
    T.img(x + s * 0.6, y - s * 0.35, s * 1.2, s * 1.2, 'triangle', color, 0)
    T.img(x - s * 0.5, y + s * 0.5, s * 0.6, s * 0.5, 'triangle', T.withA(T.P.white, 170), 0)
  elseif kind == 'tower' then
    T.img(x, y - s * 0.15, s * 1.4, s * 1.8, 'rect', color)
    T.img(x, y + s * 0.95, s * 2.1, s * 0.5, 'triangle', color, 0)
    T.img(x, y + s * 0.2, s * 0.4, s * 0.7, 'rect', T.th.panel)
    T.img(x, y - s * 0.75, s * 1.4, s * 0.18, 'rect', color)
  elseif kind == 'moon' then
    T.img(x, y, s * 2, s * 2, 'circle', color)
    T.img(x + s * 0.55, y - s * 0.2, s * 1.7, s * 1.7, 'circle', T.th.panel)
  elseif kind == 'plume' then
    T.img(x, y, s * 0.55, s * 2.1, 'rect', color, 18)
    T.img(x - s * 0.55, y, s * 0.5, s * 1.5, 'rect', color, 42)
    T.img(x + s * 0.5, y - s * 0.1, s * 0.45, s * 1.3, 'rect', color, -6)
  elseif kind == 'hourglass' then
    T.img(x, y + s * 0.55, s * 1.5, s * 0.9, 'triangle', color, 180)
    T.img(x, y - s * 0.55, s * 1.5, s * 0.9, 'triangle', color, 0)
    T.img(x, y, s * 1.7, s * 0.16, 'rect', color)
  elseif kind == 'bloom' then
    T.flower(x, y, s * 0.7, color, T.withA(T.P.white, 200))
  elseif kind == 'slime' then
    T.img(x, y, s * 2, s * 1.6, 'circle', color)
    T.img(x - s * 0.4, y + s * 0.5, s * 0.9, s * 0.7, 'triangle', T.withA(T.P.white, 160), 0)
    T.img(x - s * 0.4, y + s * 0.1, s * 0.22, s * 0.3, 'circle', T.withA(T.P.ink, 180))
    T.img(x + s * 0.35, y + s * 0.1, s * 0.22, s * 0.3, 'circle', T.withA(T.P.ink, 180))
  elseif kind == 'fly' then
    T.img(x - s * 0.55, y + s * 0.15, s * 1.1, s * 0.8, 'circle', color, 24)
    T.img(x + s * 0.55, y + s * 0.15, s * 1.1, s * 0.8, 'circle', color, -24)
    T.img(x, y, s * 0.45, s * 1.14, 'rect', T.withA(T.P.ink, 170))
  elseif kind == 'guard' then
    T.img(x, y - s * 0.4, s * 1.5, s * 1.5, 'rect', color)
    T.img(x, y + s * 0.62, s * 1.05, s * 0.9, 'rect', T.withA(T.P.ice1, 200))
    T.img(x, y + s * 0.55, s * 0.5, s * 0.16, 'rect', T.withA(T.P.ink, 190))
    T.img(x, y - s * 0.3, s * 0.6, s * 0.6, 'fourstar', T.withA(T.P.gold, 220))
  elseif kind == 'boss' then
    T.img(x, y + s * 0.1, s * 1.9, s * 1.9, 'circle', color)
    T.img(x - s * 0.62, y + s * 1.0, s * 0.62, s * 0.9, 'triangle', T.P.gold, -22)
    T.img(x + s * 0.62, y + s * 1.0, s * 0.62, s * 0.9, 'triangle', T.P.gold, 22)
    T.img(x - s * 0.42, y + s * 0.2, s * 0.3, s * 0.4, 'circle', T.P.ink)
    T.img(x + s * 0.42, y + s * 0.2, s * 0.3, s * 0.4, 'circle', T.P.ink)
  elseif kind == 'shield' then
    T.img(x, y + s * 0.1, s * 1.7, s * 1.9, 'rect', color)
    T.img(x, y - s * 0.85, s * 1.7, s * 1.0, 'triangle', color, 180)
    T.img(x, y, s * 0.5, s * 0.8, 'rect', T.th.panel)
  elseif kind == 'heart' then
    T.img(x - s * 0.4, y + s * 0.25, s * 1.05, s * 1.05, 'circle', color)
    T.img(x + s * 0.4, y + s * 0.25, s * 1.05, s * 1.05, 'circle', color)
    T.img(x, y - s * 0.45, s * 1.4, s * 1.4, 'triangle', color, 180)
  elseif kind == 'energy' then
    T.img(x, y, s * 1.2, s * 1.8, 'triangle', color, 12)
    T.img(x, y, s * 0.5, s * 1.1, 'triangle', T.withA(T.P.white, 160), 12)
  elseif kind == 'clock' then
    T.img(x, y, s * 2, s * 2, 'ring', color)
    T.img(x, y + s * 0.35, s * 0.14, s * 0.9, 'rect', color)
    T.img(x + s * 0.32, y, s * 0.7, s * 0.14, 'rect', color)
  elseif kind == 'lock' then
    T.img(x, y - s * 0.35, s * 1.3, s * 1.2, 'rect', color)
    T.img(x, y + s * 0.55, s * 0.9, s * 1.0, 'ring', color)
  elseif kind == 'check' then
    T.img(x - s * 0.25, y - s * 0.1, s * 0.9, s * 0.25, 'rect', color, 42)
    T.img(x + s * 0.28, y + s * 0.15, s * 0.25, s * 1.1, 'rect', color, -40)
  elseif kind == 'plus' then
    T.img(x, y, s * 1.6, s * 0.28, 'rect', color)
    T.img(x, y, s * 0.28, s * 1.6, 'rect', color)
  elseif kind == 'sword' then
    T.img(x, y + s * 0.3, s * 0.3, s * 1.8, 'rect', color)
    T.img(x, y - s * 0.55, s * 1.4, s * 0.2, 'rect', color)
    T.img(x, y - s * 1.0, s * 0.5, s * 0.6, 'rect', T.withA(T.P.gold, 200))
  elseif kind == 'map' then
    T.img(x, y, s * 1.9, s * 1.5, 'rect', T.withA(color, 60))
    T.img(x - s * 0.58, y, s * 0.1, s * 1.5, 'rect', color)
    T.img(x + s * 0.58, y, s * 0.1, s * 1.5, 'rect', color)
    T.img(x, y + s * 0.02, s * 1.3, s * 0.1, 'rect', color, 0)
    T.img(x, y + s * 0.72, s * 0.34, s * 0.34, 'circle', color)
    T.img(x, y + s * 0.72, s * 0.14, s * 0.14, 'circle', T.th.panel)
  elseif kind == 'gear' then
    for i = 0, 7 do
      local a = i * math.pi / 4
      T.img(x + math.cos(a) * s * 0.78, y + math.sin(a) * s * 0.78, s * 0.34, s * 0.34, 'rect', color, i * 45)
    end
    T.img(x, y, s * 1.3, s * 1.3, 'circle', color)
    T.img(x, y, s * 0.52, s * 0.52, 'circle', T.th.panel)
  elseif kind == 'user' then
    T.img(x, y + s * 0.55, s * 1.0, s * 1.0, 'circle', color)
    T.img(x, y - s * 0.85, s * 1.9, s * 1.2, 'circle', color)
  elseif kind == 'gift' then
    T.img(x, y - s * 0.2, s * 1.9, s * 1.4, 'rect', color)
    T.img(x, y + s * 0.85, s * 1.9, s * 0.35, 'rect', T.withA(color, 190))
    T.img(x, y, s * 0.22, s * 1.4, 'rect', T.withA(T.P.panel, 220))
  elseif kind == 'wind' then
    T.img(x, y, s * 1.9, s * 0.2, 'rect', color, 8)
    T.img(x, y + s * 0.55, s * 1.3, s * 0.2, 'rect', color, 8)
    T.img(x, y - s * 0.55, s * 1.5, s * 0.2, 'rect', color, 8)
  elseif kind == 'eye' then
    T.img(x, y, s * 1.9, s * 1.1, 'circle', color)
    T.img(x, y, s * 0.6, s * 0.6, 'circle', T.th.panel)
  elseif kind == 'spark' then
    T.img(x, y, s * 1.9, s * 1.9, 'fourstar', color)
  elseif kind == 'pause' then
    T.img(x - s * 0.35, y, s * 0.4, s * 1.5, 'rect', color)
    T.img(x + s * 0.35, y, s * 0.4, s * 1.5, 'rect', color)
  elseif kind == 'play' then
    T.img(x + s * 0.12, y, s * 1.5, s * 1.6, 'triangle', color, 90)
  elseif kind == 'home' then
    T.img(x, y + s * 0.35, s * 1.8, s * 1.5, 'triangle', color, 0)
    T.img(x, y - s * 0.55, s * 1.3, s * 0.9, 'rect', color)
  elseif kind == 'retry' then
    T.img(x, y, s * 1.8, s * 1.8, 'ring', color)
    T.img(x + s * 0.72, y + s * 0.7, s * 0.55, s * 0.55, 'triangle', color, 40)
    T.img(x - s * 0.9, y - s * 0.9, s * 0.7, s * 0.3, 'rect', T.th.panel)
  elseif kind == 'skull' then
    T.img(x, y + s * 0.2, s * 1.6, s * 1.5, 'circle', color)
    T.img(x, y - s * 0.9, s * 1.1, s * 0.8, 'rect', color)
    T.img(x - s * 0.35, y + s * 0.25, s * 0.3, s * 0.36, 'circle', T.th.panel)
    T.img(x + s * 0.35, y + s * 0.25, s * 0.3, s * 0.36, 'circle', T.th.panel)
  elseif kind == 'feather' then
    T.img(x, y, s * 0.75, s * 1.75, 'circle', color, 18)
    T.img(x - s * 0.1, y - s * 0.05, s * 0.12, s * 1.8, 'rect', T.withA(T.P.white, 150), 18)
    T.img(x + s * 0.05, y + s * 0.92, s * 0.4, s * 0.5, 'triangle', color, 18)
    T.img(x - s * 0.05, y - s * 0.95, s * 0.1, s * 0.5, 'rect', color, 18)
  elseif kind == 'drop' then
    T.img(x, y + s * 0.3, s * 1.2, s * 1.4, 'circle', color)
    T.img(x, y + s * 0.95, s * 0.95, s * 0.9, 'triangle', color, 0)
  else
    T.img(x, y, s * 1.6, s * 1.6, 'circle', color)
  end
end

-- ---------- 按钮 ----------
-- opts: kind='primary'|'secondary'|'ghost'|'danger'  w/h  icon  name  sub
T.button = function(x, y, w, h, label, onClick, opts)
  opts = opts or {}
  local kind = opts.kind or 'primary'
  local r = opts.radius or math.min(h / 2, 14)
  local parts, base = {}, {}
  local fillGroup, glowGroup, glossGroup = nil, nil, nil
  local textCtl, iconCtl
  local baseFill, hoverFill, textColor, hoverText
  if kind == 'primary' then
    -- 主按钮是淡金底：文字用深墨色，白字在浅金上对比不足（出图实测）
    baseFill, hoverFill = T.th.accent2, T.mix(T.th.accent2, T.P.white, 0.20)
    textColor, hoverText = T.C(255, 44, 62, 74), T.C(255, 30, 46, 58)
  elseif kind == 'secondary' then
    baseFill, hoverFill = T.th.panel2, T.th.panelHi
    textColor, hoverText = T.th.text, T.th.accent
  elseif kind == 'danger' then
    baseFill, hoverFill = T.withA(T.P.danger, 40), T.P.danger
    textColor, hoverText = T.P.danger, T.P.white
  else
    textColor, hoverText = T.th.text2, T.th.text
  end
  if baseFill then
    if kind == 'secondary' or kind == 'danger' then
      local bd = T.rrect(x, y, w, h, r, T.th.border)
      T.spread(parts, bd)
      fillGroup = T.rrect(x, y, w - 2, h - 2, math.max(2, r - 1), baseFill)
    else
      fillGroup = T.rrect(x, y, w, h, r, baseFill)
    end
    T.spread(parts, fillGroup)
    -- 顶部高光：单条不透明预混色（半透明 rrect 会在四角叠出淡斑，出图实测）
    local gloss = T.rrect(x, y + h * 0.22, w - 18, h * 0.34, math.max(2, r - 4),
      T.mix(baseFill, T.P.white, 0.18))
    for _, c in ipairs(gloss) do parts[#parts + 1] = c end
    T.captureBase(base, gloss)
    glossGroup = gloss
  end
  local labelW = w - (opts.icon and 44 or 20)
  local tx = x + (opts.icon and 10 or 0)
  textCtl = T.txt(tx, y, labelW, h - 6, opts.size or 18, label, textColor, 'Middle', 'Middle')
  parts[#parts + 1] = textCtl
  if opts.icon then
    iconCtl = T.icon(opts.icon, x - w / 2 + 26, y, opts.iconSize or 9, textColor)
  end
  if opts.badge then
    local bw = math.max(30, T.ulen(opts.badge) * 11 + 12)
    local bx = x + w / 2 - bw / 2 - 10
    T.rrect(bx, y, bw, 20, 6, T.th.panel2)
    T.txt(bx, y, bw, 18, 10, opts.badge, T.th.text2, 'Middle', 'Middle')
  end
  T.captureBase(base, parts)
  local function shift(dy) T.shiftBase(base, 0, dy) end
  local function repaint(fill, fg)
    if fillGroup then T.tint(fillGroup, fill) end
    if textCtl then T.setTxtColor(textCtl, fg) end
    if iconCtl then T.setColor(iconCtl, fg) end
  end
  local item = T.item({
    x = x, y = y, w = w, h = h, name = opts.name, focusPad = opts.focusPad or 6,
    onConfirm = onClick,
    onDown = function() if kind ~= 'ghost' then shift(-2) end end,
    onUp = function() if kind ~= 'ghost' then shift(0) end end,
    onFocus = function(on)
      if kind == 'ghost' then
        T.setTxtColor(textCtl, on and T.th.text or T.th.text2)
        if iconCtl then T.setColor(iconCtl, on and T.th.accent2 or T.th.text3) end
        return
      end
      repaint(on and hoverFill or baseFill, on and hoverText or textColor)
      if glossGroup then T.tint(glossGroup, T.mix(on and hoverFill or baseFill, T.P.white, 0.18)) end
      shift(on and 3 or 0)
    end,
  })
  return item
end

-- 小圆图标按钮（顶部工具）
T.iconBtn = function(x, y, d, kind, onClick, opts)
  opts = opts or {}
  local bg = T.img(x, y, d, d, 'circle', T.th.panel2)
  local ring = T.img(x, y, d - 2, d - 2, 'ring', T.th.border)
  local ic = T.icon(kind, x, y, opts.iconSize or 9, T.th.text2)
  local item = T.item({
    x = x, y = y, w = d + 8, h = d + 8, name = opts.name, focusPad = 4,
    onConfirm = onClick,
    onFocus = function(on)
      T.setColor(bg, on and T.th.accent or T.th.panel2)
      T.setColor(ic, on and T.th.onAccent or T.th.text2)
      T.setColor(ring, on and T.th.accent2 or T.th.border)
    end,
  })
  return item
end

-- ---------- 页签 ----------
T.tabs = function(cx, y, w, labels, active, onSelect, opts)
  opts = opts or {}
  local n = #labels
  local gap = opts.gap or 6
  local tw = (w - gap * (n - 1)) / n
  local items = {}
  for i, label in ipairs(labels) do
    local x = cx - w / 2 + tw / 2 + (i - 1) * (tw + gap)
    local on = (i == active)
    local fill = T.rrect(x, y, tw, 40, 10, on and T.th.accent or T.th.panel2)
    local txt = T.txt(x, y, tw - 12, 32, 15, label, on and T.th.onAccent or T.th.text2, 'Middle', 'Middle')
    if on then T.img(x, y - 22, tw * 0.5, 2.4, 'rect', T.th.accent2) end
    items[i] = T.item({
      x = x, y = y, w = tw, h = 44, name = (opts.namePrefix or 'hit_tab_') .. i, focusPad = 4,
      onConfirm = function() T.sfx(T.SFX.tab); onSelect(i) end,
      onFocus = function(f)
        for j = 1, #fill do T.setColor(fill[j], f and T.th.accent or T.th.panel2) end
        T.setTxtColor(txt, f and T.th.onAccent or (on and T.th.onAccent or T.th.text2))
      end,
    })
  end
  return items
end

-- ---------- 胶囊 / 徽章 / 计数 ----------
T.chip = function(x, y, label, color, opts)
  opts = opts or {}
  local fs = opts.size or 12
  local w = math.max(opts.minW or 64, T.ulen(label) * fs * 1.05 + 30)
  local h = opts.h or 24
  local parts = T.rrect(x, y, w, h, h / 2, opts.fill or T.th.accentSoft)
  T.txt(x, y, w - 10, h - 4, fs, label, opts.text or color or T.th.text2, 'Middle', 'Middle')
  if opts.dot then T.dot(x - w / 2 + 12, y, 6, color or T.th.accent) end
  return w
end
T.badge = function(x, y, label, opts)
  opts = opts or {}
  local fs = opts.size or 11
  local w = math.max(40, T.ulen(label) * fs * 1.1 + 18)
  T.rrect(x, y, w, opts.h or 20, (opts.h or 20) / 2, opts.fill or T.th.accentSoft)
  T.txt(x, y, w - 6, (opts.h or 20) - 4, fs, label, opts.text or T.th.accent, 'Middle', 'Middle')
  return w
end
T.resChip = function(x, y, icon, value, opts)
  opts = opts or {}
  local w = opts.w or 116
  T.rrect(x, y, w, 30, 15, T.th.panel2)
  T.icon(icon, x - w / 2 + 17, y, 8, opts.color or T.th.accent2)
  T.txt(x + 8, y, w - 40, 26, 12, value, T.th.text, 'Right', 'Middle')
  return w
end

-- ---------- 进度条 / 分隔 ----------
T.bar = function(x, y, w, h, pct, color, bg, opts)
  opts = opts or {}
  local bgc = bg or T.th.panel2
  T.rrect(x, y, w, h, h / 2, bgc)
  local fw = math.max(h, w * T.clamp(pct or 0, 0, 1))
  local fill = T.rrect(x - (w - fw) / 2, y, fw, h, h / 2, color or T.th.accent)
  if opts.shine ~= false then
    T.img(x - (w - fw) / 2, y + h * 0.18, fw - 8, h * 0.28, 'circle', T.withA(T.P.white, 46))
  end
  return fill
end
T.segBar = function(x, y, w, h, filled, total, color, opts)
  opts = opts or {}
  local gap = opts.gap or 3
  local seg = (w - gap * (total - 1)) / total
  for i = 1, total do
    local sx = x - w / 2 + seg / 2 + (i - 1) * (seg + gap)
    T.rrect(sx, y, seg, h, math.min(h / 2, 4), i <= filled and (color or T.th.accent) or T.th.line)
  end
end
T.divider = function(cx, cy, w, opts)
  opts = opts or {}
  T.img(cx, cy, w, 1.2, 'rect', opts.color or T.th.line)
  T.img(cx - w / 2, cy, 6, 6, 'fourstar', opts.mark or T.th.accent2)
  T.img(cx + w / 2, cy, 6, 6, 'fourstar', opts.mark or T.th.accent2)
end
T.sectionLabel = function(x, y, text, opts)
  opts = opts or {}
  T.img(x - 2, y, 3, 18, 'rect', opts.color or T.th.accent2)
  T.txt(x + 12, y, opts.w or 320, 26, opts.size or 15, text, T.th.text, 'Left', 'Middle')
  if opts.right then T.txt(opts.rightX or (x + (opts.w or 320)), y, 160, 24, 12, opts.right, T.th.text3, 'Right', 'Middle') end
end

-- ---------- 头像 / 槽位 ----------
T.avatar = function(x, y, r, ch, opts)
  opts = opts or {}
  T.img(x, y, r * 2 + 8, r * 2 + 8, 'circle', opts.ring or T.th.accent2)
  T.img(x, y, r * 2 + 2, r * 2 + 2, 'circle', T.th.panel)
  T.img(x, y, r * 2 - 2, r * 2 - 2, 'circle', ch.hair2)
  T.portraitHead(x, y - r * 0.06, (r * 2.2) / 120, ch)
  if opts.level then
    local bw = 40
    T.rrect(x, y - r - 2, bw, 18, 9, T.th.panel)
    T.txt(x, y - r - 2, bw, 16, 10, 'Lv.' .. opts.level, T.th.text, 'Middle', 'Middle')
  end
end
T.slot = function(x, y, w, h, icon, label, opts)
  opts = opts or {}
  local fill = T.rrect(x, y, w, h, 12, opts.empty and T.th.slotBg or T.th.panel2)
  local ring = T.img(x, y, w - 2, h - 2, 'ring', opts.empty and T.th.slotBorder or T.th.border)
  if icon then
    T.icon(icon, x, y + (label and 6 or 0), opts.iconSize or 14, opts.color or T.th.accent)
  end
  if label then
    T.txt(x, y - h / 2 + 14, w - 8, 20, 11, label, T.th.text3, 'Middle', 'Middle')
  end
  if opts.plus then
    T.img(x + w / 2 - 12, y + h / 2 - 12, 18, 18, 'circle', T.th.accent)
    T.icon('plus', x + w / 2 - 12, y + h / 2 - 12, 5, T.th.onAccent)
  end
  return { fill = fill, ring = ring }
end

-- 关卡星级（3 星）
T.star3 = function(x, y, n, size, opts)
  opts = opts or {}
  local col = opts.color or T.th.accent2
  for i = 1, 3 do
    local sx = x + (i - 2) * (size + 7)
    if i <= n then
      T.img(sx, y, size, size, 'fivestar', col)
    else
      T.img(sx, y, size, size, 'fivestar', opts.empty or T.th.line)
    end
  end
end

-- 箭头（chevron）
T.chevron = function(x, y, size, color, rot)
  local c = color or T.th.text3
  local r = rot or 0
  T.img(x - size * 0.05, y + size * 0.17, size * 0.72, size * 0.13, 'rect', c, r - 45)
  T.img(x - size * 0.05, y - size * 0.17, size * 0.72, size * 0.13, 'rect', c, r + 45)
end

-- 竖排资源条（右侧）
T.sideRail = function(x, y, items)
  for i, it in ipairs(items) do
    local yy = y - (i - 1) * 46
    T.rrect(x, yy, 132, 36, 18, T.th.panel2)
    T.icon(it.icon, x - 50, yy, 8, it.color or T.th.accent2)
    T.txt(x + 12, yy, 82, 30, 12, it.value, T.th.text, 'Right', 'Middle')
  end
end

-- 鼠标悬停放大（用于缩略图）
T.hoverScale = function(ctl, on, scale)
  if not ctl then return end
  T.setScale(ctl, on and (scale or 1.04) or 1)
end
