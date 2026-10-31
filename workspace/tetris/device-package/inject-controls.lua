-- ============================================================================
-- lua/tetris/controls.lua —— **可复用控件组件工厂**（胶囊 / 图标胶囊 / 按钮）
--
-- 为什么要有这个文件（2026-10-30 用户批评）：
--   「加一个样式好看、带按键、可点击、有动态样式、有音效反馈的按钮，这是最基本的要求，
--     应该做成组件，之后 10 秒一个可以量产的、可定制的。」
-- 事实是：同一个"按钮"我在这个工程里手写过四遍（模式卡 / 入口卡 / 结算三键 / 手机拇指键），
-- 每次漏掉不同的东西——最典型的一次是**漏了 UI4.regAdd 命中注册**，导致卡面画得漂亮但
-- 鼠标/触屏完全点不到（既没有悬停音、也没有高亮、点击也是死的）。
--
-- 本模块把「一个合格按钮」拆成**六件套**，缺一不可：
--   ① 形状：胶囊 = 中段矩形 + 左右两个半圆（引擎没有圆角矩形图元）
--   ② 文字：字号 + 框高 ≥ ⌊fontSize×1.45+6⌋（矮了引擎 `fits=false` 会**整条不画**）
--   ③ 键帽：可选的小圆角矩形 + 按键字母（PC 玩家要看到按什么）
--   ④ 热区：cursor 实例，**坐标 y 要取负**（cursor 的 y 轴与图片相反）
--   ⑤ 注册：UI4.regAdd(名字, 热区, w, h) —— **不注册就等于不存在**（本模块强制注册）
--   ⑥ 三态 + 音效：Enter/Exit/Down/Up/Click 五个回调，hover 抬起+升温、press 下沉+压深
--
-- 用法（三行一个按钮）：
--   local BTN = CTL.btn{ id='menu.entryRoster', screen='menu', x=520, y=302, w=290, h=96,
--     label='角色档案', sub='I 键 · 点我看契约与技能', key='I', preset='gold',
--     onClick=function() FN.rosterToggle() end }
--   BTN.style('hover')   -- 手动置态（键盘聚焦等）
--   BTN.destroy()        -- 拆（多数场景交给 MC/MS.parts 统一销毁即可）
--
-- 依赖全部由 main 注入（env），模块自身不碰模板 GUID、不跑生命周期（契约见
-- docs/research/lua-module-contract.md）。
-- ============================================================================
local M = {}

function M.new(env)
  local C = env.C
  local sfx, SFX = env.sfx, env.SFX
  local addShape, addText = env.addShape, env.addText
  local addCursor = env.addCursor
  local regAdd, regScreen = env.regAdd, env.regScreen
  local onPart = env.onPart or function() end
  local trySet, tryCall = env.trySet, env.tryCall
  -- 设计单位 → 画布像素：与各页面同一个基准（1600×900）
  local function u(v) return v * (env.scale and env.scale() or 1) end
  local ln = env.print or print

  -- 预设色板：一套语汇，别每个按钮自己调
  -- base = 静止底；hover/press = 同色系更亮/更暗（都是不透明色，半透明会出叠印缝）
  local PRESET = {
    gold = { base = env.over(env.wall, env.gold, 0.12), hover = env.over(env.wall, env.gold, 0.28),
      press = env.over(env.wall, env.gold, 0.38), ink = env.goldDeep },
    cyan = { base = env.over(env.wall, env.cyan, 0.12), hover = env.over(env.wall, env.cyan, 0.28),
      press = env.over(env.wall, env.cyan, 0.38), ink = env.cyanDeep or env.cyan },
    plain = { base = env.over(env.wall, env.ink, 0.06), hover = env.over(env.wall, env.ink, 0.16),
      press = env.over(env.wall, env.ink, 0.24), ink = env.ink },
  }

  local API = { PRESET = PRESET }

  -- ① 胶囊：中段矩形 + 左右半圆。返回 parts（含坐标），三态靠逐块换色+位移实现
  function API.pill(name, x, y, w, h, fill, partSink)
    local body = math.max(2, w - h)
    local parts = {
      { ctl = addShape(name .. 'B', { s = 'rect', x = x, y = y, w = body, h = h, c = fill }), x = x, y = y },
      { ctl = addShape(name .. 'L', { s = 'circle', x = x - body / 2, y = y, w = h, h = h, c = fill }),
        x = x - body / 2, y = y },
      { ctl = addShape(name .. 'R', { s = 'circle', x = x + body / 2, y = y, w = h, h = h, c = fill }),
        x = x + body / 2, y = y },
    }
    local sink = partSink or onPart
    for i = 1, #parts do if parts[i].ctl then sink(parts[i].ctl) end end
    return parts
  end

  -- ②③④⑤⑥ 按钮：一次调用产出一个「合格的」按钮
  -- spec = { id, screen, x, y, w, h, label, sub, key, preset|fill, fs, lift, onClick, onEnter, sound }
  function API.btn(spec)
    if not spec or not spec.id then return nil end
    local p = PRESET[spec.preset or 'gold'] or PRESET.gold
    local fill = {
      normal = spec.fill or p.base,
      hover = spec.hoverColor or p.hover,
      press = spec.pressColor or p.press,
    }
    local lift = spec.lift or 4
    local w, h = spec.w or 240, spec.h or 64
    local x, y = spec.x or 0, spec.y or 0
    local name = 'btn' .. spec.id

    -- 生命周期归属由调用方决定：标题页的按钮归 MS.parts（随展台拆），
    -- 角色页/帮助页的按钮必须归各自页面的清理表 —— 否则展台一拆就把别人的按钮带走
    -- （实测：开角色页时 syncStage 拆展台 → 角色页的行/页签胶囊全消失，只剩文字）。
    local sink = spec.onPart or onPart
    local parts = API.pill(name, x, y, w, h, fill.normal, sink)
    -- 文字：左对齐留出键帽位；没有 sub 时单行居中
    local hasKey = spec.key ~= nil
    -- 版式（v5.16，修用户「文字溢出了」）：键帽**收进胶囊内**，文字只吃剩余宽度并居中。
    --   左侧内边距 16 → 键帽 34×34 → 间隙 10 → 文字区；右侧内边距 16。
    local pad = spec.pad or 16
    local cw0 = hasKey and 34 or 0
    local textLeft = x - w / 2 + pad + (hasKey and (cw0 + 10) or 0) + (spec.dx or 0)
    local padSub = spec.padSub or pad
    local textW = w - pad * 2 - (hasKey and (cw0 + 10) or 0)
    local textWSub = w - padSub * 2
    if textW < 40 then textW = 40 end
    local tx = textLeft + textW / 2
    local fs = spec.fs or 22
    local title = addText(name .. 'T', spec.label or '', tx, y + (spec.sub and (spec.titleDy or 16) or 0),
      textW, 0, fs, spec.ink or p.ink)
    local sub = nil
    if spec.sub then
      sub = addText(name .. 'S', spec.sub, (spec.padSub and (x - w / 2 + padSub + textWSub / 2) or tx),
        y - (spec.subDy or 18), textWSub, 0,
        spec.subFs or math.max(12, fs - 9), spec.subInk or env.subInk)
    end
    for _, c in ipairs({ title, sub }) do if c then sink(c) end end
    -- 键帽：小圆角胶囊 + 字母
    local chip = nil
    if hasKey then
      local cw, ch = 34, 34
      local cx = x - w / 2 + pad + cw / 2
      chip = API.pill(name .. 'K', cx, y, cw, ch, env.over(env.wall, env.ink, 0.10))
      for i = 1, #chip do sink(chip[i].ctl) end
      local kl = addText(name .. 'KT', tostring(spec.key), cx, y, cw, 0, 16, spec.ink or p.ink)
      if kl then sink(kl); chip.label = { ctl = kl, x = cx, y = y } end
    end

    -- 热区：w/h 略放大 8px（手感），**坐标 y 取负**（cursor 轴与图片相反）
    -- 热区比视觉略大（手感），并且**留足外扩**：用户连续两轮报"点不到"的排查里，
    -- 首要嫌疑是"指针落点差几像素没进框"，所以外扩到 +40/+24（仍小于相邻卡间距，不会误吞）。
    local zone = env.addHit(name .. 'Hit', w + (spec.padW or 40), h + (spec.padH or 24))
    if zone then
      -- ⚠ 2026-10-30 真机/网页实测定谳：命中区的 anchored y 必须与视觉件**同号**。
      -- 老注释「cursor 的 y 轴与图片相反 ⇒ 取负」只在早年代码形态下成立；现在取负会把热区
      -- 镜像到画布另一侧（入口卡在顶部 y=302 → 热区跑到 y=-302、屏幕底缘），
      -- 表现为「卡面看得见、鼠标移上去没反应、点也点不到」——用户连着报了三次的就是这个。
      tryCall(zone, 'SetAnchoredPosition', x, y)
      sink(zone)
    end

    local texts = { { c = title, x = tx, y = y + (spec.sub and (spec.titleDy or 16) or 0) } }
    if sub then texts[#texts + 1] = { c = sub, x = tx, y = y - (spec.subDy or 18) } end
    if chip then
      for i = 1, #chip do texts[#texts + 1] = { c = chip[i].ctl, x = chip[i].x, y = chip[i].y } end
      if chip.label then texts[#texts + 1] = chip.label end
    end

    local function style(st, dy0)
      local dy = dy0 or ((st == 'hover') and lift or ((st == 'down') and -lift / 2 or 0))
      -- 状态串是 'normal'/'hover'/'down'，色板键是 normal/hover/**press** ⇒ 显式映射
      local col = fill[st] or fill[(st == 'down') and 'press' or 'normal'] or fill.normal
      for i = 1, #parts do
        local q = parts[i]
        if q.ctl then
          trySet(q.ctl, 'imageColor', col)
          tryCall(q.ctl, 'SetAnchoredPosition', q.x, q.y + dy)
        end
      end
      for i = 1, #texts do
        local t = texts[i]
        if t and t.c then tryCall(t.c, 'SetAnchoredPosition', t.x, t.y + dy) end
      end
    end

    if zone then
      addCursor(zone, 'CursorEnter', function()
        if spec.sound ~= false and sfx then pcall(sfx, SFX.hover, true) end
        style('hover')
        if spec.onEnter then pcall(spec.onEnter) end
      end)
      addCursor(zone, 'CursorExit', function() style('normal') end)
      addCursor(zone, 'CursorDown', function()
        if spec.sound ~= false and sfx then pcall(sfx, SFX.press, true) end
        style('down')
      end)
      addCursor(zone, 'CursorUp', function() style('hover') end)
      addCursor(zone, 'CursorClick', function()
        -- ⑤ 注册是硬要求：没注册则指针派发看不到这个热区（历史事故：卡面漂亮但点不动）
        if spec.onClick then pcall(spec.onClick) end
      end)
      -- ⑤ 命中注册（带屏幕名；同屏多按钮各自一条，日志 `ctl <名字> px=.. py=..` 可核对）
      regAdd(spec.id, zone, w, h)
    else
      ln('controls: no hit template, button ' .. tostring(spec.id) .. ' 只能看不能点')
    end

    return { id = spec.id, parts = parts, texts = texts, zone = zone, style = style,
      set = function(st) style(st) end }
  end


  -- ⑥ 文字面板组件（大段文案专用）：圆角卡片 + 顶部主题色细带 + 标题/副标 + 分隔线 + 正文多行 + 页脚
  --    spec = { id, x, y, w, h, accent, cardFill, title, subtitle, lines={..}, footer,
  --             fs=18, subFs=16, footFs=15, lineGap=34, titleDy, ... }
  --    返回 { parts = 卡片三块, texts = {..}, title, subtitle, lines[], footer }
  function API.textPanel(spec)
    if not spec then return nil end
    local id = spec.id or ('panel' .. tostring(math.random(100000)))
    local x, y = spec.x or 0, spec.y or 0
    local w, h = spec.w or 380, spec.h or 420
    local accent = spec.accent or env.gold
    local fill = spec.cardFill or env.over(env.wall, accent, 0.14)
    local sink = spec.onPart or onPart
    local parts = API.pill(id, x, y, w, h, fill, sink)
    local top = y + h / 2 - 8
    local texts = {}
    local function put(ctl, ty)
      if ctl then sink(ctl); texts[#texts + 1] = { c = ctl, x = x, y = ty } end
      return ctl
    end
    local title = nil
    if spec.title then
      title = put(addText(id .. 'T', spec.title, x, top - u(spec.titleDy or 46), w - u(40), 0,
        spec.titleFs or 38, spec.titleInk or accent, 'Middle'), top - u(spec.titleDy or 46))
    end
    if spec.subtitle then
      put(addText(id .. 'S', spec.subtitle, x, top - u((spec.titleDy or 46) + 40), w - u(40), 0,
        spec.subFs or 16, spec.subInk or env.subInk, 'Middle'), top - u((spec.titleDy or 46) + 40))
    end
    -- 分隔线（描金细条）
    local rule = addShape(id .. 'R', { s = 'rect', x = x, y = top - u((spec.titleDy or 46) + 64),
      w = w - u(56), h = 2, c = accent })
    if rule then sink(rule) end
    local ln = {}
    local base = top - u((spec.titleDy or 46) + 100)
    for i, line in ipairs(spec.lines or {}) do
      local ty = base - (i - 1) * u(spec.lineGap or 34)
      ln[i] = put(addText(id .. 'L' .. i, line, x, ty, w - u(48), 0, spec.fs or 18,
        spec.ink or env.ink, 'Left'), ty)
    end
    local footer = nil
    if spec.footer then
      footer = put(addText(id .. 'F', spec.footer, x, y - h / 2 + u(26), w - u(40), 0,
        spec.footFs or 15, spec.accent or accent, 'Middle'), y - h / 2 + u(26))
    end
    return { id = id, parts = parts, texts = texts, title = title, lines = ln, footer = footer }
  end

  return API
end

return M
