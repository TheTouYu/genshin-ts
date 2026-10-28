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
