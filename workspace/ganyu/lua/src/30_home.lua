-- ============================================================================
-- 页面 1：启动 / 标题 / 主菜单
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

-- ---------------------------------------------------------------- 启动
T.screenFns.boot = function()
  T.pageBg('night', { moonX = 0, moonY = 76, moonR = 128, stars = 64, aurora = true })
  T.snowfall(26, { scale = 0.8 })
  T.snowBank(T.C(255, 108, 154, 184), -346)
  T.screenFrame(T.withA(T.P.goldPale, 54), 16, T.withA(T.P.goldPale, 110))
  local cx = 0
  -- 冰晶徽记
  local markY = 96
  T.img(cx, markY, 190, 190, 'circle', T.withA(T.P.ice3, 16))
  T.img(cx, markY, 150, 150, 'ring', T.withA(T.P.ice2, 70))
  T.snowflake(cx, markY, 66, T.P.ice2, { core = T.P.white })
  T.snowflake(cx, markY, 40, T.withA(T.P.white, 180))
  T.img(cx, markY, 12, 12, 'fourstar', T.P.goldPale)
  -- 标题
  local logoY = -14
  T.logo(cx, logoY, { '霜', '华', '纪' }, 86, 104, T.P.white, { shadow = true, shadowColor = T.C(90, 160, 220, 250) })
  T.titleFlourish(cx, logoY - 72, 300, T.withA(T.P.goldPale, 200))
  T.txt(cx, logoY - 104, 520, 26, 14, 'F R O S T B L O O M', T.P.ice2, 'Middle', 'Middle')
  T.txt(cx, logoY - 134, 560, 26, 14, '甘雨 · 月海亭的守夜人', T.P.ice1, 'Middle', 'Middle')
  -- 进度
  local barY = -196
  T.rrect(0, barY, 380, 6, 3, T.C(90, 160, 210, 240))
  local fill = T.img(-190 + 4, barY, 8, 6, 'rect', T.P.ice3)
  local pctText = T.txt(0, barY - 24, 400, 24, 12, '正在唤醒霜雪… 0%', T.P.ice2, 'Middle', 'Middle')
  local prompt = T.txt(0, barY - 56, 520, 30, 14, '', T.P.goldPale, 'Middle', 'Middle')
  T.txt(0, -318, 620, 22, 11, 'v' .. T.VERSION .. '  ·  BUILD ' .. T.BUILD_ID .. '  ·  千星模拟器 2D UI', T.withA(T.P.ice1, 150), 'Middle', 'Middle')
  -- 装饰角标
  T.txt(-T.DESIGN_W / 2 + 40, 316, 300, 24, 11, 'GANYU  ·  CRYO', T.withA(T.P.ice1, 130), 'Left', 'Middle')
  T.txt(T.DESIGN_W / 2 - 40, 316, 300, 24, 11, 'MIHOYO FAN CONCEPT UI', T.withA(T.P.ice1, 110), 'Right', 'Middle')

  T.bootReady = false
  local w = 380
  T.tween(1.15, function(k)
    T.tryCall(fill, 'SetSizeDelta', math.max(6, w * k) * T.S, 6 * T.S)
    T.tryCall(fill, 'SetAnchoredPosition', (-w / 2 + (w * k) / 2) * T.S, barY * T.S)
    T.setTxt(pctText, '正在唤醒霜雪… ' .. math.floor(k * 100) .. '%')
  end, function()
    T.bootReady = true
    T.setTxt(pctText, '准备就绪')
    T.setTxt(prompt, '点击任意处 · 或按空格进入')
    T.setTxtColor(prompt, T.P.goldPale)
    local scr = T.screen
    scr.key = function(a)
      if a == 'confirm' or a == 'back' then T.go('title') end
    end
  end, T.easeOut)
  -- 提示呼吸
  T.anim(function(dt, t)
    if T.bootReady then
      T.setTxtColor(prompt, T.mix(T.P.goldPale, T.P.white, 0.5 + 0.5 * math.sin(t * 3)))
    end
  end)
  T.screen.key = function(a)
    if a == 'confirm' then T.go('title') end
  end
  T.screen.afterBuild = function()
    T.hit('hit_boot_any', 0, 0, T.DESIGN_W, T.DESIGN_H, {
      clickSfx = false,
      onClick = function() T.log('boot enter ready=' .. tostring(T.bootReady)); T.go('title') end,
    })
  end
end

-- ---------------------------------------------------------------- 标题
T.screenFns.title = function()
  T.pageBg('night', { moonX = 300, moonY = 86, moonR = 138, stars = 58, aurora = false })
  T.sideScrim('left', T.P.night0, 150, 12)
  T.snowfall(30, {})
  -- 立绘（月轮作背景光；雪丘在人物之前建，人站在丘上）
  T.glow(300, 92, 186, T.P.ice2, 10, 22)
  T.img(300, -330, 640, 150, 'circle', T.C(255, 130, 172, 200))
  T.img(300, -318, 520, 120, 'circle', T.C(255, 160, 196, 220))
  T.portrait(T.chars[1], 300, 8, 0.84, { idle = true, mood = 'smile' })
  T.img(300, -314, 220, 34, 'circle', T.withA(T.P.ink, 46))
  -- 漂浮冰晶
  for _, p in ipairs({ { 190, 96, 12 }, { 418, 40, 9 }, { 452, 168, 7 }, { 168, -66, 8 } }) do
    T.snowflake(p[1], p[2], p[3], T.withA(T.P.ice1, 150), { core = T.withA(T.P.white, 180) })
  end
  -- 前景冰台
  T.img(300, -352, 480, 54, 'circle', T.C(255, 196, 226, 240))
  T.iceShardCluster(150, -336, 0.95, T.C(255, 214, 240, 252))
  T.iceShardCluster(470, -340, 0.8, T.C(255, 200, 232, 248))
  -- 前景飘雪（覆在人身上，制造纵深）
  T.snowfall(10, { scale = 1.5 })

  -- 标题
  T.logo(-306, 118, { '霜', '华', '纪' }, 104, 116, T.P.white,
    { shadow = true, shadowColor = T.C(140, 120, 200, 250) })
  T.titleFlourish(-306, 44, 348, T.P.goldPale)
  T.txt(-300, 16, 520, 26, 14, 'F R O S T B L O O M', T.P.ice2, 'Middle', 'Middle')
  T.txt(-300, -14, 560, 28, 15, '甘雨 · 月海亭的守夜人', T.P.ice1, 'Middle', 'Middle')
  T.txt(-300, -46, 620, 26, 12, '冰雪 · 射击 · 关卡 · 养成 · 清新', T.withA(T.P.ice2, 200), 'Middle', 'Middle')
  T.rrect(-300, 214, 204, 28, 14, T.C(255, 30, 58, 80))
  T.rrect(-300, 214, 198, 24, 12, T.C(255, 14, 34, 50))
  T.txt(-300, 214, 190, 22, 11, '序章 · 月海亭的灯', T.P.goldPale, 'Middle', 'Middle')

  -- 开始
  local btnY = -112
  local fill = T.rrect(-306, btnY, 306, 62, 31, T.P.gold)
  T.rrect(-306, btnY, 296, 52, 26, T.mix(T.P.goldPale, T.P.gold, 0.35))
  local label = T.txt(-306, btnY + 2, 280, 40, 24, '进 入 霜 华', T.C(255, 44, 62, 74), 'Middle', 'Middle')
  local sub = T.txt(-306, btnY - 48, 300, 24, 12, '点击开始 · 空格确认', T.withA(T.P.ice1, 180), 'Middle', 'Middle')
  local startItem = T.item({
    x = -306, y = btnY, w = 306, h = 62, name = 'hit_start', focusPad = 8,
    onConfirm = function() T.go('menu') end,
    onFocus = function(on)
      T.tint(fill, on and T.P.white or T.P.gold)
      T.setTxtColor(label, on and T.C(255, 30, 60, 88) or T.C(255, 44, 62, 74))
      T.setTxtColor(sub, on and T.P.goldPale or T.withA(T.P.ice1, 180))
    end,
  })
  -- 次级入口
  local sx = -430
  local settingsTxt = T.txt(sx, -252, 120, 30, 13, '设置', T.withA(T.P.ice1, 200), 'Middle', 'Middle')
  T.item({ x = sx, y = -252, w = 120, h = 34, name = 'hit_title_settings', focusPad = 4,
    onConfirm = function() T.go('settings') end,
    onFocus = function(on) T.setTxtColor(settingsTxt, on and T.P.goldPale or T.withA(T.P.ice1, 200)) end })
  local creditsTxt = T.txt(sx + 118, -252, 140, 30, 13, '制作名单', T.withA(T.P.ice1, 200), 'Middle', 'Middle')
  T.item({ x = sx + 118, y = -252, w = 140, h = 34, name = 'hit_title_credits', focusPad = 4,
    onConfirm = function() T.go('credits') end,
    onFocus = function(on) T.setTxtColor(creditsTxt, on and T.P.goldPale or T.withA(T.P.ice1, 200)) end })
  local helpTxt = T.txt(sx + 244, -252, 120, 30, 13, '玩法说明', T.withA(T.P.ice1, 200), 'Middle', 'Middle')
  T.item({ x = sx + 244, y = -252, w = 120, h = 34, name = 'hit_title_help', focusPad = 4,
    onConfirm = function() T.openHelp('title') end,
    onFocus = function(on) T.setTxtColor(helpTxt, on and T.P.goldPale or T.withA(T.P.ice1, 200)) end })

  -- 右上角版本 / 左下角提示
  T.txt(T.DESIGN_W / 2 - 44, 320, 340, 22, 11, 'v' .. T.VERSION .. '  ·  ' .. T.BUILD_ID, T.withA(T.P.ice1, 120), 'Right', 'Middle')
  T.txt(-T.DESIGN_W / 2 + 44, -314, 460, 22, 11, '一个关于雪、契约与归途的故事', T.withA(T.P.ice1, 120), 'Left', 'Middle')
  T.txt(T.DESIGN_W / 2 - 44, -314, 460, 22, 11, '方向键选择 · 空格确认 · H 帮助', T.withA(T.P.ice1, 120), 'Right', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'confirm' then T.go('menu')
    elseif a == 'back' then T.openConfirm('离开霜华纪？', '当前进度会保留在本次会话中。', function() T.log('title leave') end)
    end
  end
end

-- ---------------------------------------------------------------- 主菜单
T.screenFns.menu = function()
  T.pageBg('day', { sunX = 360, sunY = 176 })
  T.snowfall(16, { color = T.P.white, scale = 0.8 })
  T.snowBank(T.C(255, 250, 254, 255), -T.H * 0.42)

  -- 顶栏
  T.img(0, 336, T.DESIGN_W + 40, 52, 'rect', T.withA(T.P.white, 120))
  T.img(0, 311, T.DESIGN_W + 40, 1.4, 'rect', T.withA(T.P.ice4, 60))
  T.txt(-T.DESIGN_W / 2 + T.M, 336, 240, 40, 22, '霜华纪', T.th.text, 'Left', 'Middle')
  T.txt(-T.DESIGN_W / 2 + T.M + 86, 336, 200, 30, 11, 'FROSTBLOOM', T.th.text3, 'Left', 'Middle')
  -- 玩家
  local avX = T.DESIGN_W / 2 - 392
  T.img(avX, 336, 38, 38, 'circle', T.th.accentSoft)
  T.portraitHead(avX, 338, 0.30, T.chars[1])
  T.txt(avX + 30, 344, 120, 22, 13, '旅行者', T.th.text, 'Left', 'Middle')
  T.txt(avX + 30, 326, 120, 20, 10, 'Lv.' .. T.records.level .. ' · 璃月', T.th.text3, 'Left', 'Middle')
  T.resChip(452, 336, 'coin', T.fmt(T.records.mats.mora), { w = 110 })
  T.resChip(568, 336, 'crystal', T.fmt(T.records.mats.crystal), { w = 104, color = T.P.ice4 })

  -- 左侧立绘区
  local px, py = -366, -6
  T.glow(px, py + 60, 210, T.P.white, 8, 40)
  T.txt(px, py + 30, 420, 180, 128, 'GANYU', T.withA(T.P.ice4, 20), 'Middle', 'Middle')
  T.img(px, py + 40, 440, 440, 'ring', T.withA(T.ice4 and T.P.ice4 or T.P.ice4, 70))
  T.img(px, py + 40, 412, 412, 'ring', T.withA(T.th.border, 120))
  for i = 0, 5 do
    local a = math.pi * (i / 6) - math.pi / 2
    T.img(px + math.cos(a) * 206, py + 40 + math.sin(a) * 206, 12, 12, 'fourstar', T.withA(T.P.ice4, 170))
  end
  T.img(px, -318, 400, 96, 'circle', T.C(255, 240, 249, 255))
  T.portrait(T.chars[1], px, py + 88, 0.90, { idle = true })
  T.img(px, -330, 320, 64, 'circle', T.C(255, 250, 254, 255))
  T.img(px, -300, 200, 22, 'circle', T.withA(T.P.ink, 28))
  -- 雪丘
  T.img(px - 40, py - 176, 320, 96, 'circle', T.C(255, 252, 255, 255))
  T.img(px + 76, py - 188, 250, 86, 'circle', T.C(255, 250, 254, 255))
  -- 名牌
  local nameY = -262
  T.rrect(px, nameY, 324, 68, 18, T.th.border)
  T.rrect(px, nameY, 318, 62, 16, T.th.panel)
  T.img(px - 140, nameY, 4, 40, 'rect', T.th.accent2)
  T.txt(px - 118, nameY + 12, 150, 34, 24, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(px - 118, nameY - 14, 170, 22, 11, 'GANYU · 冰 · 弓', T.th.text2, 'Left', 'Middle')
  T.txt(px + 128, nameY + 10, 60, 24, 13, 'Lv.' .. T.records.level, T.th.text2, 'Right', 'Middle')
  T.segBar(px + 62, nameY - 12, 130, 5, 8, 12, T.th.accent)

  -- 右侧菜单卡片
  local defs = {
    { '冒险', '霜原关卡 · 霜华试炼', 'map', T.P.ice4, function() T.go('map') end },
    { '养成', '等级 · 天赋 · 命之座', 'const', T.P.violet2, function() T.go('growth') end },
    { '图鉴', '敌人 · 装备 · 材料', 'book', T.P.mint, function() T.go('codex', { tab = 1 }) end },
    { '设置', '声音 · 动效 · 画质', 'gear', T.P.ink2, function() T.go('settings') end },
    { '制作名单', '霜华纪制作组', 'feather', T.P.gold2, function() T.go('credits') end },
  }
  local cardX, startY, gap = 246, 206, 90
  local cards = {}
  for i, d in ipairs(defs) do
    local y = startY - (i - 1) * gap
    local w, h = 512, 76
    local sh = T.rrect(cardX + 4, y - 6, w, h, 18, T.withA(T.P.ink, 16))
    local bd = T.rrect(cardX, y, w, h, 18, T.withA(T.P.ice4, 60))
    local pn = T.rrect(cardX, y, w - 3, h - 3, 17, T.withA(T.P.white, 232))
    local idx = T.txt(cardX - 232, y + 2, 54, 40, 20, '0' .. i, T.withA(T.P.ice4, 150), 'Middle', 'Middle')
    local iconBg = T.img(cardX - 190, y, 46, 46, 'circle', T.withA(d[4], 26))
    local iconRing = T.img(cardX - 190, y, 44, 44, 'ring', T.withA(d[4], 90))
    local ic = T.icon(d[3], cardX - 190, y, 11, d[4])
    local title = T.txt(cardX - 154, y + 14, 220, 34, 22, d[1], T.th.text, 'Left', 'Middle')
    local subtitle = T.txt(cardX - 154, y - 13, 300, 24, 12, d[2], T.th.text2, 'Left', 'Middle')
    local chev = {}; T.spread(chev, {}) ; T.chevron(cardX + 220, y, 16, T.withA(T.P.ice4, 150))
    local moved = {}
    T.spread(moved, sh); T.spread(moved, bd); T.spread(moved, pn)
    moved[#moved + 1] = idx; moved[#moved + 1] = iconBg; moved[#moved + 1] = iconRing
    moved[#moved + 1] = ic; moved[#moved + 1] = title; moved[#moved + 1] = subtitle; moved[#moved + 1] = chev
    local basePos = {}
    for j = 1, #moved do
      local p = T.pos[moved[j]]
      if p then basePos[j] = { p.x, p.y } end
    end
    local function shift(dx)
      for j = 1, #moved do
        local bp = basePos[j]
        if bp then T.tryCall(moved[j], 'SetAnchoredPosition', (bp[1] + dx) * T.S, bp[2] * T.S) end
      end
    end
    local cardItem
    cardItem = T.item({
      x = cardX, y = y, w = w, h = h, name = 'hit_menu_' .. i, focusPad = 4,
      onConfirm = d[5],
      onFocus = function(on)
        cardItem.offY = on and 4 or 0
        T.updateFocusFrame()
        T.tint(pn, on and T.P.white or T.withA(T.P.white, 232))
        T.tint(bd, on and d[4] or T.withA(T.P.ice4, 60))
        T.setTxtColor(title, on and d[4] or T.th.text)
        T.setTxtColor(idx, on and d[4] or T.withA(T.P.ice4, 150))
        T.tint(chev, on and d[4] or T.withA(T.P.ice4, 150))
      end,
    })
  end

  -- 底部提示
  T.txt(0, -296, 900, 24, 12, '今日提示：' .. T.TIPS[1], T.th.text2, 'Middle', 'Middle')
  T.footer({ { key = '↑↓', label = '选择' }, { key = '空格', label = '确认' }, { key = 'H', label = '帮助' }, { key = 'Q', label = '返回标题' } })

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('title') end
  end
  -- 入场：卡片错落
  for i = 1, #cards do
    local it = cards[i]
    local base = it.y
    T.after(0.05 + i * 0.04, function()
      T.tween(0.34, function(k)
        if it.offX == nil then it.offX = 0 end
      end, nil, T.easeOut, true)
    end, true)
  end
end
