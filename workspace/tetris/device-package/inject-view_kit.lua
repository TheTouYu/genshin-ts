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
    local lines = 1
    if o.h and o.h > 0 then lines = math.max(1, math.floor(o.h / K.textMinH(font))) end
    local h = o.h or K.textMinH(font, lines)
    return {
      key = key, layer = o.layer or 'card', tpl = o.tpl or 'stext', name = o.name or key,
      parentKey = o.parentKey, pos = { o.x or 0, o.y or 0 }, size = { o.w or 200, h },
      text = o.text or '', font = font, fcolor = o.color, bg = o.bg,
      align = o.align or 'Middle', valign = o.valign,
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
    out[#out + 1] = {
      key = key .. 'Hit', layer = o.hitLayer or 'touch', tpl = o.hitTpl or 'hit',
      name = key .. 'Hit', parentKey = o.parentKey, pos = { x, y },
      size = { w + (o.hitPadW or K.METRIC.hitPadW), h + (o.hitPadH or K.METRIC.hitPadH) },
      cursor = { 'CursorEnter', 'CursorExit', 'CursorDown', 'CursorUp', 'CursorClick' },
      on = o.on,
    }
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
  function K.hit(o)
    local key = assert(o.key, 'hit: 需要 key')
    return {
      key = key, layer = o.layer or 'touch', tpl = o.tpl or 'hit', name = o.name or key,
      parentKey = o.parentKey, pos = { o.x or 0, o.y or 0 },
      size = { o.w or 100, o.h or 100 }, cursor = { 'CursorClick' }, on = o.on,
    }
  end

  return K
end

return M
