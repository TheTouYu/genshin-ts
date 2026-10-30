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
  function API.pill(name, x, y, w, h, fill)
    local body = math.max(2, w - h)
    local parts = {
      { ctl = addShape(name .. 'B', { s = 'rect', x = x, y = y, w = body, h = h, c = fill }), x = x, y = y },
      { ctl = addShape(name .. 'L', { s = 'circle', x = x - body / 2, y = y, w = h, h = h, c = fill }),
        x = x - body / 2, y = y },
      { ctl = addShape(name .. 'R', { s = 'circle', x = x + body / 2, y = y, w = h, h = h, c = fill }),
        x = x + body / 2, y = y },
    }
    for i = 1, #parts do if parts[i].ctl then onPart(parts[i].ctl) end end
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

    local parts = API.pill(name, x, y, w, h, fill.normal)
    -- 文字：左对齐留出键帽位；没有 sub 时单行居中
    local hasKey = spec.key ~= nil
    -- dx：内容整体偏移（例如左侧还要放四色点/图标时，把文字让到右半边）
    local tx = x + (spec.dx or 0) + (hasKey and 26 or 0) - (spec.sub and 30 or 0)
    local fs = spec.fs or 22
    local title = addText(name .. 'T', spec.label or '', tx, y + (spec.sub and 14 or 0),
      w - (hasKey and 60 or 24), 0, fs, spec.ink or p.ink)
    local sub = nil
    if spec.sub then
      sub = addText(name .. 'S', spec.sub, tx, y - 20, w - (hasKey and 60 or 24), 0,
        spec.subFs or math.max(12, fs - 9), spec.subInk or env.subInk)
    end
    for _, c in ipairs({ title, sub }) do if c then onPart(c) end end
    -- 键帽：小圆角胶囊 + 字母
    local chip = nil
    if hasKey then
      local cw, ch = 34, 34
      local cx = x - w / 2 + cw / 2 + 12
      chip = API.pill(name .. 'K', cx, y, cw, ch, env.over(env.wall, env.ink, 0.10))
      for i = 1, #chip do onPart(chip[i].ctl) end
      local kl = addText(name .. 'KT', tostring(spec.key), cx, y, cw, 0, 16, spec.ink or p.ink)
      if kl then onPart(kl); chip.label = { ctl = kl, x = cx, y = y } end
    end

    -- 热区：w/h 略放大 8px（手感），**坐标 y 取负**（cursor 轴与图片相反）
    local zone = env.addHit(name .. 'Hit', w + 8, h + 8)
    if zone then
      tryCall(zone, 'SetAnchoredPosition', x, -y)
      onPart(zone)
    end

    local texts = { { c = title, x = tx, y = y + (spec.sub and 14 or 0) } }
    if sub then texts[#texts + 1] = { c = sub, x = tx, y = y - 20 } end
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

  return API
end

return M
