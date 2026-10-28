-- ============================================================================
-- 页面：养成（甘雨 · 循循守月）
-- 三栏：左 立绘 / 信息 / 命之座 ｜ 中 属性 / 武器 / 圣遗物 ｜ 右 天赋 / 材料
-- 弹层：突破（ascend）、天赋（talent），均 pausesGame
-- 三栏基准：外边距 20、栏距 16（372 + 416 + 420 + 2×16 + 2×20 = 1280）
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.GY = { lx = -434, mx = -24, rx = 410, lw = 372, mw = 416, rw = 420 }

-- ---------------------------------------------------------------- 属性行
T.gyStatRow = function(cx, y, w, row, color)
  local x0 = cx - w / 2
  T.txt(x0, y, w - 104, 26, 13, row.name, T.th.text2, 'Left', 'Middle')
  T.txt(x0 + w, y, 104, 26, 13, row.value, T.th.text, 'Right', 'Middle')
  T.bar(cx, y - 18, w, 5, row.pct, color or T.th.accent, T.th.line)
end

-- ---------------------------------------------------------------- 命之座节点
T.gyConstNode = function(x, y, c, lit, idx)
  local halo = T.img(x, y, 50, 50, 'circle', T.withA(T.th.accent, 0))
  local ring = T.img(x, y, 36, 36, 'circle', lit and T.th.accent2 or T.th.line)
  local core = T.img(x, y, 30, 30, 'circle', lit and T.th.panel or T.th.panel2)
  T.icon('const', x, y, 7, lit and T.th.accent2 or T.th.text3)
  local label = T.txt(x, y - 30, 60, 20, 10, c.name, lit and T.th.text2 or T.th.text3, 'Middle', 'Middle')
  T.item({
    x = x, y = y, w = 42, h = 42, name = 'hit_growth_const_' .. idx, focusPad = 3,
    onConfirm = function()
      if lit then
        T.log('growth const open id=' .. idx)
        T.toast('命之座 · ' .. c.name .. '：' .. c.desc, T.th.accent2)
      else
        T.log('growth const locked id=' .. idx)
        T.sfx(T.SFX.error, true)
        T.toast('命之座未解锁 · 需要「甘雨之命星」', T.th.text)
      end
    end,
    onFocus = function(on)
      T.setColor(halo, T.withA(T.th.accent, on and 64 or 0))
      T.setColor(ring, on and T.th.accent or (lit and T.th.accent2 or T.th.line))
      T.setColor(core, on and T.th.panelHi or (lit and T.th.panel or T.th.panel2))
      T.setTxtColor(label, on and T.th.text or (lit and T.th.text2 or T.th.text3))
    end,
  })
end

-- ---------------------------------------------------------------- 天赋行
T.gyTalentRow = function(i)
  local t = T.talents[i]
  local x, y = T.GY.rx, 162 - (i - 1) * 90
  local bg = T.rrect(x, y, 396, 76, 12, T.th.panel2)
  T.img(232, y, 46, 46, 'circle', T.th.accentSoft)
  T.icon(t.icon, 232, y, 9, T.th.accent)
  local name = T.txt(262, y + 12, 190, 28, 16, t.name, T.th.text, 'Left', 'Middle')
  T.txt(262, y - 12, 190, 22, 11, t.kind, T.th.text3, 'Left', 'Middle')
  T.txt(478, y + 12, 130, 22, 12, 'Lv.' .. t.level .. ' / ' .. t.max, T.th.text2, 'Right', 'Middle')
  T.bar(370, y - 32, 216, 4, t.level / t.max, T.th.accent, T.th.line)
  -- 整行可点（大命中区，先建，让下面的「提升」按钮压在其上）
  T.item({
    x = x, y = y, w = 396, h = 76, name = 'hit_growth_talent_row_' .. i, focusPad = 3,
    onConfirm = function() T.gyOpenTalent(i) end,
    onFocus = function(on)
      T.tint(bg, on and T.th.panelHi or T.th.panel2)
      T.setTxtColor(name, on and T.th.accent or T.th.text)
    end,
  })
  T.button(548, y, 84, 36, '提升', function() T.gyOpenTalent(i) end,
    { kind = 'secondary', name = 'hit_growth_talent_' .. i, size = 12 })
end

-- ---------------------------------------------------------------- 「突破」弹层
T.gyOpenAscend = function()
  local ch = T.chars[1]
  local rows = {
    { icon = 'snow', name = '霜华之蕊', own = T.records.mats.snow or 0, need = 1 },
    { icon = 'crystal', name = '冰晶核', own = T.records.mats.crystal or 0, need = 3 },
    { icon = 'coin', name = '摩拉', own = T.records.mats.mora or 0, need = 120000 },
  }
  T.openOverlay('ascend', function(base)
    local p = T.overlayPanel(620, 420, '突破',
      'Lv.' .. T.hero.level .. ' → Lv.' .. T.hero.maxLevel .. ' · 第四阶段')
    local w, h = p.w, p.h
    -- 左半：霜华冰晶
    T.img(-182, 22, 164, 164, 'ring', T.th.borderSoft)
    T.glow(-182, 20, 68, T.th.accentSoft, 6, 60)
    T.crystalArt(-182, 24, 1.15, T.th.accent)
    T.snowflake(-250, 86, 9, T.withA(T.th.accent, 140), { core = T.th.panelHi })
    T.snowflake(-112, 62, 6, T.withA(T.th.accent2, 170))
    -- 右半：材料清单
    T.txt(-14, 72, 240, 24, 12, '突破所需', T.th.text3, 'Left', 'Middle')
    T.txt(280, 72, 150, 24, 12, '拥有 / 需要', T.th.text3, 'Right', 'Middle')
    for i, r in ipairs(rows) do
      local y = 38 - (i - 1) * 42
      local enough = r.own >= r.need
      local col = enough and T.th.text2 or T.P.danger
      T.icon(r.icon, 2, y, 9, enough and T.th.accent or T.P.danger)
      T.txt(28, y, 150, 24, 13, r.name, T.th.text, 'Left', 'Middle')
      T.txt(280, y, 150, 24, 12, T.fmt(r.own) .. ' / ' .. T.fmt(r.need), col, 'Right', 'Middle')
      T.hline(133, y - 21, 294, T.th.line)
    end
    -- 描述（截到两行）
    T.txtAuto(0, -96, 540, 12, T.wrap(ch.desc, 30), T.th.text3)
    T.button(112, -158, 200, 50, '确认突破', function()
      T.closeOverlay()
      T.log('growth ascend')
      T.sfx(T.SFX.reward)
      T.toast('突破完成 · 霜华更盛', T.th.accent2)
    end, { name = 'hit_ascend_ok' })
    T.button(-112, -158, 180, 50, '再想想', function() T.closeOverlay() end,
      { kind = 'secondary', name = 'hit_ascend_cancel' })
    T.closeButton(w / 2 - 40, h / 2 - 40, function() T.closeOverlay() end, 'hit_ascend_close')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a) if a == 'back' then T.closeOverlay() end end,
  })
end

-- ---------------------------------------------------------------- 「天赋」弹层
T.gyNextGain = {
  [1] = '伤害提升 6%',
  [2] = '冷却时间缩短 0.5 秒',
  [3] = '领域持续时间延长 2 秒',
}

T.gyOpenTalent = function(i)
  local t = T.talents[i]
  if not t then return end
  local gain = T.gyNextGain[i] or '伤害提升 6%'
  T.openOverlay('talent', function(base)
    local p = T.overlayPanel(560, 380, t.name, t.kind .. ' · 当前 Lv.' .. t.level)
    local w, h = p.w, p.h
    T.txtAuto(0, 46, 440, 13, T.wrap(t.desc, 30), T.th.text2)
    T.hline(0, 8, 440, T.th.line)
    T.txt(0, -22, 460, 30, 15, '下一级：' .. gain, T.th.accent2, 'Middle', 'Middle')
    T.txt(0, -46, 460, 24, 12, '提升至 Lv.' .. (t.level + 1) .. ' · 消耗「诗文」的教导 ×3', T.th.text3,
      'Middle', 'Middle')
    T.bar(0, -74, 440, 8, t.level / t.max, T.th.accent, T.th.line)
    T.txt(-220, -92, 120, 22, 11, 'Lv.' .. t.level, T.th.text2, 'Left', 'Middle')
    T.txt(220, -92, 120, 22, 11, 'Lv.' .. t.max, T.th.text3, 'Right', 'Middle')
    T.txt(0, -108, 500, 24, 11, '甘雨：「' .. T.chars[1].quote .. '」', T.th.text3, 'Middle', 'Middle')
    T.button(112, -152, 200, 50, '升级', function()
      T.closeOverlay()
      T.log('growth talent up id=' .. t.id)
      T.sfx(T.SFX.reward)
      T.toast('天赋已提升 · Lv.' .. (t.level + 1), T.th.accent2)
    end, { name = 'hit_talent_up' })
    T.button(-112, -152, 180, 50, '关闭', function() T.closeOverlay() end,
      { kind = 'secondary', name = 'hit_talent_close' })
    T.closeButton(w / 2 - 40, h / 2 - 40, function() T.closeOverlay() end, 'hit_talent_close_btn')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a) if a == 'back' then T.closeOverlay() end end,
  })
end

-- ---------------------------------------------------------------- 养成页
T.screenFns.growth = function(params)
  T.pageBg('day', { sunX = 360, sunY = 176 })
  T.snowfall(12, { scale = 0.7 })
  T.snowBank(T.C(255, 250, 254, 255), -300)
  T.backBtn(function() T.go('menu') end)
  T.header('养成', '甘雨 · 循循守月', { right = '璃月 · 月海亭', x = -496 })

  local lx, mx, rx = T.GY.lx, T.GY.mx, T.GY.rx

  -- ================= 左栏：立绘卡 =================
  T.card(lx, 84, 372, 340, { radius = 20, fill = T.th.panel, border = T.th.cardBorder, hi = T.th.panelHi })
  T.glow(lx, 132, 74, T.th.accentSoft, 5, 44)
  T.img(lx, 132, 236, 236, 'ring', T.th.borderSoft)
  T.snowflake(-586, 220, 8, T.withA(T.th.accent, 120), { core = T.th.panelHi })
  T.snowflake(-286, 232, 6, T.withA(T.th.accent2, 140))
  T.drift(lx, -50, 330, 64, T.mix(T.th.panelHi, T.th.accentSoft, 0.85))
  T.portrait(T.chars[1], lx, 152, 0.62, { idle = true })
  T.img(lx, -72, 156, 22, 'circle', T.withA(T.th.accent, 26))
  T.drift(lx - 54, -64, 196, 34, T.th.panelHi)

  -- 信息区
  T.txt(-606, -108, 200, 44, 26, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(-260, -108, 150, 28, 13, 'Lv.' .. T.hero.level .. ' / ' .. T.hero.maxLevel, T.th.text2,
    'Right', 'Middle')
  T.txt(-606, -140, 120, 24, 11, '经验', T.th.text3, 'Left', 'Middle')
  T.txt(-260, -140, 150, 24, 11, T.hero.exp .. ' / ' .. T.hero.expMax, T.th.text2,
    'Right', 'Middle')
  T.bar(lx, -158, 330, 8, T.hero.exp / T.hero.expMax, T.th.accent, T.th.line)
  T.button(lx, -196, 220, 48, '突破', function() T.gyOpenAscend() end, { name = 'hit_growth_ascend' })

  -- 命之座
  local litCount = 0
  for i = 1, 6 do if T.records.consts[i] then litCount = litCount + 1 end end
  T.txt(-606, -234, 150, 22, 11, '命之座', T.th.text3, 'Left', 'Middle')
  T.txt(-260, -234, 150, 22, 11, litCount .. ' / 6', T.th.text3, 'Right', 'Middle')
  T.img(lx, -264, 326, 1.4, 'rect', T.th.line)
  for i = 1, 6 do
    T.gyConstNode(-579 + (i - 1) * 58, -264, T.consts[i], T.records.consts[i] and true or false, i)
  end

  -- ================= 中栏：属性 =================
  T.card(mx, 111, 416, 286, { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.th.panelHi })
  T.txt(-210, 228, 150, 30, 18, '属性', T.th.text, 'Left', 'Middle')
  T.txt(162, 228, 140, 22, 11, 'Lv.' .. T.hero.level .. ' · 满级 ' .. T.hero.maxLevel, T.th.text3,
    'Right', 'Middle')
  T.hline(mx, 208, 372, T.th.line)
  for i, row in ipairs(T.hero.stats) do
    T.gyStatRow(mx, 188 - (i - 1) * 38, 372, row, i >= 5 and T.th.accent2 or T.th.accent)
  end

  -- 武器卡
  T.card(mx, -92, 416, 96, { radius = 16, fill = T.th.panel, border = T.th.cardBorder, hi = T.th.panelHi })
  T.rrect(-186, -92, 68, 68, 14, T.th.panel2)
  T.icon('bow', -186, -92, 13, T.th.text2)
  T.txt(-142, -80, 230, 28, 16, '阿莫斯之弓', T.th.text, 'Left', 'Middle')
  T.txt(-142, -104, 230, 22, 11, 'Lv.' .. T.hero.level .. ' · 精炼 1 阶', T.th.text3, 'Left', 'Middle')
  T.chip(138, -92, '弓', T.th.text2, { fill = T.th.accentSoft, text = T.th.accent, size = 12 })

  -- 圣遗物
  T.sectionLabel(-210, -152, '圣遗物', { w = 220 })
  T.txt(184, -152, 140, 22, 11, '2 件套 · 冰伤 15%', T.th.text3, 'Right', 'Middle')
  local arts = {
    { 'bloom', '生之花' }, { 'plume', '死之羽' }, { 'hourglass', '时之沙' }, { 'bloom', '空之杯' },
  }
  for i = 1, 4 do
    local cx = -174 + (i - 1) * 100
    T.slot(cx, -222, 84, 84, nil, arts[i][2], {})
    T.artifactArt(arts[i][1], cx, -208, 0.58, T.th.accent)
  end

  -- ================= 右栏：天赋 =================
  T.card(rx, 84, 420, 330, { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.th.panelHi })
  T.txt(222, 228, 150, 30, 18, '天赋', T.th.text, 'Left', 'Middle')
  T.txt(598, 228, 180, 22, 11, '「诗文」系列 · 教导', T.th.text3, 'Right', 'Middle')
  T.hline(rx, 208, 376, T.th.line)
  for i = 1, #T.talents do T.gyTalentRow(i) end

  -- 材料
  T.card(rx, -166, 420, 150, { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.th.panelHi })
  T.txt(222, -110, 150, 26, 16, '材料', T.th.text, 'Left', 'Middle')
  T.txt(598, -110, 160, 22, 11, '月海亭库存', T.th.text3, 'Right', 'Middle')
  T.hline(rx, -126, 376, T.th.line)
  local order = { 'crystal', 'qingxin', 'snow', 'mora' }
  for i = 1, 4 do
    local m
    for _, mm in ipairs(T.mats) do if mm.id == order[i] then m = mm end end
    if m then
      local col = (i - 1) % 2
      local rw = math.floor((i - 1) / 2)
      local x0 = 212 + col * 200
      local y = -156 - rw * 48
      T.img(x0 + 22, y, 36, 36, 'circle', T.withA(T.th.accent, 20))
      T.icon(m.icon, x0 + 22, y, 8, m.color)
      T.txt(x0 + 46, y, 70, 24, 11, m.name, T.th.text2, 'Left', 'Middle')
      T.txt(x0 + 196, y, 80, 24, 12, T.fmt(m.count), T.th.text, 'Right', 'Middle')
    end
  end

  -- ================= 底部 =================
  T.txt(0, -294, 520, 24, 12, '提升天赋需要「诗文」的教导与摩拉', T.th.text3, 'Middle', 'Middle')
  T.footer({
    { key = '↑↓', label = '选择' }, { key = '空格', label = '确认' },
    { key = 'H', label = '帮助' }, { key = 'Q', label = '返回' },
  })

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
  screen.afterBuild = function()
    T.setFocus(2, true)
    T.log('growth open', 'consts=' .. litCount .. '/6', 'mats=' .. #T.mats,
      'exp=' .. tostring(T.hero.exp) .. '/' .. tostring(T.hero.expMax))
  end
end
