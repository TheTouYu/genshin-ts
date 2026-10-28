-- ============================================================================
-- 页面 2：关卡地图 / 出战准备
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

-- ---------------------------------------------------------------- 关卡地图
T.mapNode = function(x, y, d, stage, state, selected, chapterColor)
  -- state: 'locked' | 'open' | 'clear'
  local col = chapterColor or T.th.accent
  local parts = {}
  if selected then
    T.img(x, y, d + 46, d + 46, 'circle', T.withA(col, 34))
    T.img(x, y, d + 26, d + 26, 'ring', T.withA(col, 150))
  end
  local outer = T.img(x, y, d + 8, d + 8, 'circle', state == 'locked' and T.th.line or col)
  local inner = T.img(x, y, d, d, 'circle', T.th.panel)
  local inner2 = T.img(x, y, d - 12, d - 12, 'circle', state == 'locked' and T.th.slotBg or T.th.panel2)
  local label
  if state == 'locked' then
    T.icon('lock', x, y, 13, T.th.text3)
  else
    label = T.txt(x, y + 2, d - 16, d - 30, 26, tostring(stage.id), T.th.text, 'Middle', 'Middle')
    if state == 'clear' then
      T.img(x + d * 0.34, y - d * 0.34, 22, 22, 'circle', T.th.accent2)
      T.icon('check', x + d * 0.34, y - d * 0.34, 7, T.th.onAccent)
    end
  end
  return { outer = outer, inner = inner, inner2 = inner2, label = label, col = col }
end

T.screenFns.map = function(params)
  params = params or {}
  local chapter = params.chapter or 1
  local sel = params.sel or 1
  T.pageBg('day', { sunX = 420, sunY = 190 })
  T.screenFrame(T.withA(T.th.border, 90), 16, T.withA(T.th.accent2, 90))
  T.snowfall(10, { scale = 0.7 })

  local ch = T.chapters[chapter]
  T.header('霜原', '沿着雪线，把每一道风都走一遍', { right = ch.sub })
  T.backBtn(function() T.go('menu') end)
  local tabNames = {}
  for i, c in ipairs(T.chapters) do tabNames[i] = c.name end
  T.tabs(-30, 232, 420, tabNames, chapter, function(i) T.go('map', { chapter = i, sel = 1 }) end,
    { namePrefix = 'hit_map_chapter_' })

  -- 章节信息
  T.txt(-T.DESIGN_W / 2 + T.M, 198, 380, 30, 19, ch.name, T.th.text, 'Left', 'Middle')
  T.txt(-T.DESIGN_W / 2 + T.M, 172, 400, 22, 11, ch.desc, T.th.text2, 'Left', 'Middle')
  local starTotal = 0
  for _, st in ipairs(T.stages) do
    if st.chapter == chapter then starTotal = starTotal + (T.records.stars[st.id] or 0) end
  end
  T.chip(-T.DESIGN_W / 2 + T.M + 34, 140, '★ ' .. starTotal .. ' / 9', T.th.accent2, { fill = T.th.accentSoft, minW = 84 })

  -- 地图面板
  local px, py, pw, ph = -150, -76, 764, 372
  T.card(px, py, pw, ph, { radius = 22, fill = T.th.panel, border = T.th.cardBorder })
  T.img(px, py + ph / 2 - 40, pw - 60, 1.2, 'rect', T.th.line)
  T.txt(px - pw / 2 + 26, py + ph / 2 - 40, 240, 24, 12, '璃月 · 霜原', T.th.text3, 'Left', 'Middle')
  T.txt(px + pw / 2 - 26, py + ph / 2 - 40, 240, 24, 12, '点击节点查看关卡', T.th.text3, 'Right', 'Middle')

  local stages = {}
  for _, st in ipairs(T.stages) do
    if st.chapter == chapter then stages[#stages + 1] = st end
  end
  local pos = { { -400, 2 }, { -160, 56 }, { 80, -22 } }
  local function drawPath(a, b, bright)
    local n = 12
    for i = 1, n do
      local t = (i - 0.5) / n
      local dx = a[1] + (b[1] - a[1]) * t
      local dy = a[2] + (b[2] - a[2]) * t + math.sin(t * math.pi) * 20
      T.img(dx, dy, bright and 5 or 4, bright and 5 or 4, 'circle',
        bright and T.withA(T.th.accent2, 200) or T.withA(T.th.border, 160))
    end
  end
  for i = 1, #pos - 1 do
    local st = stages[i]
    local done = st and (T.records.stars[st.id] or 0) > 0
    drawPath(pos[i], pos[i + 1], done)
  end
  for i, st in ipairs(stages) do
    local p = pos[i]
    local state = 'open'
    if st.locked and not T.records.unlocked[st.id] then state = 'locked' end
    if (T.records.stars[st.id] or 0) > 0 then state = 'clear' end
    local n = T.mapNode(p[1], p[2], 80, st, state, (i == sel), ch.color)
    T.txt(p[1], p[2] - 64, 220, 26, 15, st.name, T.th.text, 'Middle', 'Middle')
    T.txt(p[1], p[2] - 84, 200, 20, 11, st.code .. ' · 推荐 ' .. st.rec, T.th.text3, 'Middle', 'Middle')
    T.star3(p[1], p[2] + 58, T.records.stars[st.id] or 0, 14, { empty = T.th.line })
    T.item({
      x = p[1], y = p[2], w = 108, h = 108, name = 'hit_map_stage_' .. i, focusPad = 8,
      onConfirm = function()
        if state == 'locked' then
          T.log('map locked stage=' .. st.id)
          T.sfx(T.SFX.error, true)
          T.toast('关卡尚未解锁 · 先完成上一关', T.th.text2)
        else
          T.sfx(T.SFX.tab)
          T.go('map', { chapter = chapter, sel = i })
        end
      end,
      onFocus = function(on)
        T.setColor(n.outer, on and T.th.accent2 or (state == 'locked' and T.th.line or ch.color))
      end,
    })
  end

  -- 详情卡
  local st = stages[sel] or stages[1]
  local state = 'open'
  if st.locked and not T.records.unlocked[st.id] then state = 'locked' end
  local cx, cy, w, h = 424, 0, 388, 500
  T.card(cx, cy, w, h, { radius = 20, fill = T.th.card, border = T.th.cardBorder })
  local artY = cy + 170
  T.stageArt(cx, artY, 348, 150, st)
  T.badge(cx - 152, cy + 76, st.code, { fill = T.th.accent, text = T.th.onAccent })
  T.star3(cx + 96, cy + 76, T.records.stars[st.id] or 0, 16)
  T.txt(cx - 152, cy + 46, 300, 34, 24, st.name, T.th.text, 'Left', 'Middle')
  T.txt(cx - 152, cy + 20, 300, 22, 11, st.sub, T.th.text3, 'Left', 'Middle')
  T.divider(cx, cy - 2, 320)
  T.txt(cx - 152, cy - 24, 120, 22, 11, '目标', T.th.text3, 'Left', 'Middle')
  T.txt(cx - 152, cy - 50, 304, 40, 13, st.objective, T.th.text, 'Left', 'Middle')
  T.txt(cx - 152, cy - 90, 120, 22, 11, '来敌', T.th.text3, 'Left', 'Middle')
  local ex = cx - 108
  for _, eid in ipairs(st.enemies) do
    local e = T.enemies[eid]
    if e then
      T.rrect(ex + 32, cy - 90, 66, 24, 12, T.th.accentSoft)
      T.txt(ex + 32, cy - 90, 60, 20, 11, e.name, T.th.text2, 'Middle', 'Middle')
      ex = ex + 72
    end
  end
  T.txt(cx - 152, cy - 122, 120, 22, 11, '奖励', T.th.text3, 'Left', 'Middle')
  for i, rw in ipairs(st.reward) do
    local yy = cy - 146 - (i - 1) * 22
    T.icon(i == 1 and 'coin' or (i == 2 and 'book' or 'crystal'), cx - 140, yy, 7, T.th.accent2)
    T.txt(cx - 122, yy, 280, 22, 12, rw, T.th.text2, 'Left', 'Middle')
  end
  T.txt(cx - 152, cy - 222, 140, 22, 11, '最佳 ' .. T.fmt(T.records.best[st.id] or 0), T.th.text3, 'Left', 'Middle')
  local btnLabel = (state == 'locked') and '尚未解锁' or '开始挑战'
  T.button(cx + 58, cy - 222, 196, 46, btnLabel, function()
    if state == 'locked' then
      T.sfx(T.SFX.error, true)
      T.toast('关卡尚未解锁 · 先完成上一关', T.th.text2)
      return
    end
    T.go('prepare', { stage = st.id })
  end, { kind = (state == 'locked') and 'secondary' or 'primary', name = 'hit_map_start' })

  T.footer({ { key = '←→', label = '选择关卡' }, { key = '空格', label = '查看' }, { key = 'Q', label = '返回' } })
  T.txt(0, -302, 720, 22, 11, '「沿着雪线走，你会遇到一些还没有名字的风。」', T.th.text3, 'Middle', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'left' or a == 'right' then
      if (T.focus or 0) <= 2 then
        local n = (a == 'right') and 1 or -1
        local t = chapter + n
        if t < 1 then t = #T.chapters end
        if t > #T.chapters then t = 1 end
        T.go('map', { chapter = t, sel = 1 })
      else
        T.moveFocus(-1, 0)
      end
    elseif a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('menu') end
  end
  T.screen.defaultFocus = sel
  T.screen.afterBuild = function() T.setFocus(sel, true) end
  T.log('map chapter=' .. chapter .. ' sel=' .. sel .. ' stage=' .. st.id .. ' state=' .. state)
end

-- ---------------------------------------------------------------- 出战准备
T.screenFns.prepare = function(params)
  params = params or {}
  local stage = T.stageById[params.stage or 1] or T.stages[1]
  T.pageBg('night', { moonX = -420, moonY = 170, moonR = 96, stars = 40, aurora = false })
  T.snowfall(16, {})
  T.snowBank(T.C(255, 26, 62, 86), -352)
  T.header('出战准备', stage.code .. ' · ' .. stage.name, { right = '推荐等级 ' .. stage.rec })
  T.backBtn(function() T.go('map', { chapter = stage.chapter, sel = ((stage.id - 1) % 3) + 1 }) end)

  -- 左：甘雨立绘
  local lx, ly = -390, 6
  T.glow(lx, ly + 40, 190, T.P.ice2, 8, 20)
  T.card(lx, ly, 380, 500, { radius = 20, fill = T.th.panel, border = T.th.cardBorder })
  T.drift(lx, -190, 300, 92, T.C(255, 46, 96, 126))
  T.portrait(T.chars[1], lx, 46, 0.68, { idle = true })
  T.txt(lx - 150, -120, 160, 30, 22, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(lx - 150, -144, 200, 20, 11, 'Lv.' .. T.records.level .. ' · 冰 · 弓', T.th.text2, 'Left', 'Middle')
  T.chip(lx + 96, -120, '主控', T.th.accent2, { fill = T.th.accentSoft })

  -- 中：队伍 + 装备
  local mx = 10
  T.sectionLabel(mx - 250, 248, '出战队伍', { w = 260, right = '元素共鸣 · 双冰', rightX = mx + 200 })
  local team = { { 1, '主控' }, { 2, '支援' }, { 3, '支援' } }
  for i, t in ipairs(team) do
    local cx = mx - 180 + (i - 1) * 150
    local ch = T.charById[t[1]]
    local parts = T.card(cx, 172, 138, 132, { radius = 14, fill = i == 1 and T.th.panelHi or T.th.panel, border = i == 1 and T.th.accent or T.th.cardBorder })
    T.portraitHead(cx, 196, 0.44, ch)
    T.txt(cx, 138, 120, 24, 13, ch.name, T.th.text, 'Middle', 'Middle')
    T.txt(cx, 120, 120, 20, 10, t[2] .. ' · ' .. ch.element, T.th.text3, 'Middle', 'Middle')
    T.item({
      x = cx, y = 172, w = 138, h = 132, name = 'hit_prepare_team_' .. i, focusPad = 4,
      onConfirm = function()
        if i == 1 then
          T.toast('甘雨已就位 · 霜华矢随时可以拉开', T.th.accent2)
        else
          T.sfx(T.SFX.error, true)
          T.toast(ch.name .. ' 将在后续版本加入出战', T.th.text2)
        end
      end,
      onFocus = function(on)
        T.tint(parts, on and T.th.panelHi or (i == 1 and T.th.panelHi or T.th.panel))
      end,
    })
  end

  -- 武器 + 圣遗物
  T.sectionLabel(mx - 250, 62, '装备', { w = 260, right = '战力 12,480', rightX = mx + 200 })
  local wParts = T.card(mx - 60, 4, 380, 84, { radius = 14, fill = T.th.panel, border = T.th.cardBorder })
  T.icon('bow', mx - 208, 8, 13, T.th.accent2)
  T.txt(mx - 182, 16, 220, 26, 15, '阿莫斯之弓', T.th.text, 'Left', 'Middle')
  T.txt(mx - 182, -8, 240, 20, 11, 'Lv.60 · 精炼 1 阶 · 攻击力 +49', T.th.text3, 'Left', 'Middle')
  T.chip(mx + 128, 6, '弓', T.th.accent, { fill = T.th.accentSoft })
  T.item({ x = mx - 60, y = 4, w = 380, h = 84, name = 'hit_prepare_weapon', focusPad = 4,
    onConfirm = function() T.toast('武器详情将在「养成」中查看', T.th.text2) end,
    onFocus = function(on) T.tint(wParts, on and T.th.panelHi or T.th.panel) end })

  local artNames = { { 'bloom', '生之花' }, { 'plume', '死之羽' }, { 'hourglass', '时之沙' }, { 'drop', '空之杯' } }
  for i, a in ipairs(artNames) do
    local cx = mx - 196 + (i - 1) * 96
    local slot = T.slot(cx, -86, 86, 86, nil, a[2], { empty = false })
    T.artifactArt(a[1], cx, -78, 0.5, i % 2 == 0 and T.P.ice2 or T.P.ice3)
    T.item({ x = cx, y = -86, w = 86, h = 86, name = 'hit_prepare_art_' .. i, focusPad = 4,
      onConfirm = function() T.toast('圣遗物 · 冰风迷途的勇士（4）', T.th.accent2) end,
      onFocus = function(on) T.tint(slot.ring, on and T.th.accent or T.th.border) end })
  end

  -- 右：关卡情报
  local rx = 428
  T.card(rx, 40, 384, 400, { radius = 20, fill = T.th.panel, border = T.th.cardBorder })
  T.stageArt(rx, 160, 336, 140, stage)
  T.txt(rx - 156, 76, 300, 30, 20, stage.name, T.th.text, 'Left', 'Middle')
  T.txt(rx - 156, 52, 300, 22, 11, stage.objective, T.th.text2, 'Left', 'Middle')
  T.divider(rx, 30, 300)
  T.txt(rx - 156, 6, 300, 24, 12, '来敌', T.th.text3, 'Left', 'Middle')
  for i, eid in ipairs(stage.enemies) do
    local e = T.enemies[eid]
    if e then
      local yy = -22 - (i - 1) * 30
      T.enemyArt(eid, rx - 130, yy, eid == 'boss' and 0.30 or 0.26)
      T.txt(rx - 94, yy + 6, 160, 22, 12, e.name, T.th.text, 'Left', 'Middle')
      T.txt(rx + 146, yy + 6, 60, 20, 10, e.tag, T.th.text3, 'Right', 'Middle')
    end
  end
  T.txt(rx - 156, -116, 300, 22, 11, '霜华纪 · 第 ' .. stage.chapter .. ' 章', T.th.text3, 'Left', 'Middle')
  T.button(rx, -196, 300, 54, '进入战斗', function()
    T.go('battle', { stage = stage.id })
  end, { kind = 'primary', name = 'hit_prepare_start' })
  T.txt(rx, -236, 340, 22, 11, '提示：悬停敌人瞄准，点击射出霜华矢', T.th.text3, 'Middle', 'Middle')

  T.footer({ { key = '↑↓←→', label = '选择' }, { key = '空格', label = '确认' }, { key = 'Q', label = '返回' } })
  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('map', { chapter = stage.chapter, sel = ((stage.id - 1) % 3) + 1 }) end
  end
  T.screen.defaultFocus = #T.items
  T.log('prepare stage=' .. stage.id)
end
