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
