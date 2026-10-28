-- ============================================================================
-- 页面 4：结算（胜负 / 星级 / 奖励 / 经验与升级）
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.recordResult = function(params)
  local st = T.stageById[params.stage] or T.stages[1]
  local rec = T.records
  local out = { stage = st, levelUp = false, unlockedNext = nil }
  if params.win then
    rec.stars[st.id] = math.max(rec.stars[st.id] or 0, params.stars or 0)
    rec.best[st.id] = math.max(rec.best[st.id] or 0, params.score or 0)
    rec.plays = (rec.plays or 0) + 1
    rec.clears = (rec.clears or 0) + 1
    rec.visited[st.id] = true
    local nxt = T.stages[st.id + 1]
    if nxt then
      rec.unlocked[nxt.id] = true
      out.unlockedNext = nxt
    end
    -- 经验
    local gain = 320 + (params.stars or 0) * 60
    rec.exp = (rec.exp or 0) + gain
    T.hero.exp = rec.exp
    local maxExp = 4600
    if rec.exp >= maxExp then
      rec.exp = rec.exp - maxExp
      rec.level = (rec.level or 60) + 1
      T.hero.level = rec.level
      T.hero.exp = rec.exp
      T.hero.level = rec.level
      out.levelUp = true
    end
    T.hero.exp = rec.exp
    T.hero.level = rec.level
    -- 成就
    T.unlock('first_shot')
    if (rec.maxCombo or 0) >= 3 then T.unlock('combo3') end
    T.unlock('clear1')
    local sum = 0
    for _, v in ipairs(rec.stars) do sum = sum + v end
    if sum >= 12 then T.unlock('stars12') end
    local got = 0
    for _ in pairs(rec.achv) do got = got + 1 end
    if got >= 6 then T.unlock('codex10') end
    out.gain = gain
  else
    rec.plays = (rec.plays or 0) + 1
  end
  T.log('records stage=' .. st.id .. ' stars=' .. tostring(rec.stars[st.id]) ..
    ' clears=' .. tostring(rec.clears) .. ' level=' .. tostring(rec.level))
  return out
end

T.screenFns.result = function(params)
  params = params or {}
  local st = T.stageById[params.stage] or T.stages[1]
  local win = params.win and true or false
  local info = T.recordResult({ stage = st.id, win = win, stars = params.stars, score = params.score })
  T.pageBg('night', { moonX = 0, moonY = 236, moonR = 78, stars = 34, aurora = false })
  T.snowfall(16, {})
  T.snowBank(T.C(255, 30, 70, 96), -352)

  T.sfx(win and T.SFX.victory or T.SFX.fail, true)
  local cx, cy, w, h = 0, -4, 780, 560
  T.card(cx, cy, w, h, { radius = 24, fill = T.th.panel, border = T.th.cardBorder })
  T.img(cx, cy + h / 2 - 8, w - 80, 1.2, 'rect', T.th.line)

  -- 标题
  local title = win and '挑战成功' or '挑战失败'
  local tcol = win and T.P.goldPale or T.P.ice2
  local titleChars = win and { '挑', '战', '成', '功' } or { '挑', '战', '失', '败' }
  T.logo(cx, cy + h / 2 - 62, titleChars, 38, 46, tcol,
    { shadow = true, shadowColor = T.C(120, 6, 20, 34) })
  T.txt(cx, cy + h / 2 - 108, 560, 26, 13,
    win and (st.code .. ' · ' .. st.name .. '　已完成') or (st.code .. ' · ' .. st.name .. '　时间耗尽'),
    T.th.text2, 'Middle', 'Middle')
  T.titleFlourish(cx, cy + h / 2 - 132, 260, T.withA(win and T.P.goldPale or T.P.ice2, 170))

  -- 星级
  local starY = cy + 100
  local stars = params.stars or 0
  for i = 1, 3 do
    local col = (i <= stars) and T.P.gold or T.th.line
    local ctl = T.img(cx + (i - 2) * 62, starY, 54, 54, 'fivestar', col)
    if ctl then
      T.setScale(ctl, 0.2)
      T.after(0.15 + i * 0.14, function()
        T.sfx(i <= stars and T.SFX.reward or T.SFX.click, i == 1)
        T.tween(0.34, function(k)
          T.setScale(ctl, 0.2 + 0.8 * k + (k > 0.8 and (1 - k) * 0.6 or 0))
        end, nil, T.easeBack, true)
      end, true)
    end
  end
  T.txt(cx, starY - 48, 360, 22, 11, win and ('本关最佳 ' .. T.fmt(math.max(T.records.best[st.id] or 0, params.score or 0))) or '再接一次，风会记得你的箭',
    T.th.text3, 'Middle', 'Middle')

  -- 统计
  local panelY = cy - 12
  T.rrect(cx, panelY, w - 120, 64, 12, T.th.panel2)
  local stats = {
    { '得分', T.fmt(params.score or 0) },
    { '最高连击', tostring(params.combo or 0) },
    { '命中', tostring(params.hits or 0) .. ' / ' .. tostring(params.shots or 0) },
    { '剩余时间', string.format('%02d:%02d', math.floor((params.timeLeft or 0) / 60), math.floor((params.timeLeft or 0) % 60)) },
  }
  for i, s in ipairs(stats) do
    local x = cx - (w - 120) / 2 + (i - 0.5) * ((w - 120) / 4)
    T.txt(x, panelY + 10, 160, 24, 11, s[1], T.th.text3, 'Middle', 'Middle')
    T.txt(x, panelY - 11, 160, 26, 15, s[2], T.th.text, 'Middle', 'Middle')
  end

  -- 奖励
  local ry = cy - 88
  T.txt(cx - 300, ry + 6, 120, 24, 12, win and '奖励' or '未获得奖励', T.th.text3, 'Left', 'Middle')
  if win then
    for i, rw in ipairs(st.reward) do
      local yy = ry - 22 - (i - 1) * 28
      T.icon(i == 1 and 'coin' or (i == 2 and 'book' or 'crystal'), cx - 284, yy, 9, T.th.accent2)
      T.txt(cx - 266, yy, 300, 22, 12, rw, T.th.text2, 'Left', 'Middle')
    end
  else
    T.txt(cx - 300, ry - 30, 360, 40, 12, '调整一下队伍与天赋，再来一次。', T.th.text3, 'Left', 'Middle')
  end
  -- 经验条
  T.txt(80, ry + 4, 150, 24, 12, '冒险阅历', T.th.text3, 'Left', 'Middle')
  T.txt(372, ry + 4, 180, 24, 12, T.fmt(T.hero.exp or 0) .. ' / 4,600', T.th.text2, 'Right', 'Middle')
  T.bar(226, ry - 24, 292, 12, (T.hero.exp or 0) / 4600, T.th.accent, T.th.slotBg)
  if info.levelUp then
    T.chip(226, ry - 56, 'Lv.' .. T.hero.level .. ' 已提升', T.th.accent2, { fill = T.th.accentSoft })
  end

  -- 按钮
  local by = cy - h / 2 + 60
  T.button(cx - 236, by, 200, 52, '再次挑战', function()
    T.go('battle', { stage = st.id })
  end, { kind = 'secondary', name = 'hit_result_retry' })
  T.button(cx, by, 200, 52, win and '下一关' or '返回地图', function()
    if win and T.stages[st.id + 1] then
      T.go('prepare', { stage = st.id + 1 })
    else
      T.go('map', { chapter = st.chapter, sel = ((st.id - 1) % 3) + 1 })
    end
  end, { kind = 'primary', name = 'hit_result_next' })
  T.button(cx + 236, by, 200, 52, '返回地图', function()
    T.go('map', { chapter = st.chapter, sel = ((st.id - 1) % 3) + 1 })
  end, { kind = 'ghost', name = 'hit_result_map' })

  T.txt(0, -338, 900, 22, 11, win and '「雪会记得每一支箭落下的地方。」' or '「风停了。下一次，把弓拉满一些。」',
    T.th.text3, 'Middle', 'Middle')

  local screen = T.screen
  screen.key = function(a)
    if a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0)
    elseif a == 'confirm' then T.confirmFocus()
    elseif a == 'back' then T.go('map', { chapter = st.chapter, sel = ((st.id - 1) % 3) + 1 }) end
  end
  T.screen.defaultFocus = 2
  T.log('result win=' .. tostring(win) .. ' stars=' .. tostring(params.stars) .. ' score=' .. tostring(params.score))
end
