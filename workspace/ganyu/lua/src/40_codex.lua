-- ============================================================================
-- 40_codex.lua —— 霜华图鉴 / 设置 / 制作名单
-- 三张「后台页」：图鉴把 T.codex 的 14 条索引成可翻的册子，设置把 T.opt 做成可点的
-- 开关，制作名单排成一张冷调的谢幕卡。色值只取 T.th.*；控件组改色走 T.tint，
-- 整组位移走 T.captureBase / T.shiftBase（T.rrect 返回的是 6 个控件，不是单个控件）。
-- ============================================================================
T = T or {}

do
  local GROUP_OF_TAB = { 'enemy', 'gear', 'mat', 'world' }
  local TAB_LABELS = { '敌人', '装备', '材料', '世界' }

  -- 图鉴补记：正文之外的一句闲笔，让详情面板的段落有 3~5 行的呼吸
  local FLAVOR = {
    slime = '在雪线上走夜路时，常听见它们黏在一起的声响。',
    fly = '翅上的霜粉落在袖口，很久都不会化。',
    guard = '铠甲里没有人。守夜这件事，自己成了执念。',
    boss = '它记得每一个抬眼看过它的人。',
    bow = '拉开它，需要一整个冬天的力气。',
    flower = '花语是「别忘了回来的路」。',
    plume = '摸上去很轻，像一句没说出口的话。',
    hourglass = '把它倒过来，时间也不会真的回去。',
    crystal = '冷到手心发疼时，它反而暖了一点。',
    qingxin = '采的时候要留一半，山才肯再开。',
    snow = '花期只有一个晚上，天亮就谢。',
    moon = '潮水退去后，滩上会剩一层细白的霜。',
    bowl = '灯点得最晚的那间，就是她待的地方。',
    bowl2 = '风从坡上下来，会捎来一点清心的气味。',
  }

  -- ---------------------------------------------------------------- 收录状态
  -- 默认：除「清心坡」外全部收录（世界组第 3 条用来展示锁定态）；
  -- 重置进度后整册回到未收录，页头计数随之归零。
  local function codexSeen(id)
    if T.codexSeen == nil then
      T.codexSeen = {}
      for i = 1, #T.codex do T.codexSeen[T.codex[i].id] = (T.codex[i].id ~= 'bowl2') end
    end
    return T.codexSeen[id] == true
  end

  local function codexCount()
    local n = 0
    for i = 1, #T.codex do
      if codexSeen(T.codex[i].id) then n = n + 1 end
    end
    return n
  end

  -- 弓（详情大图）：9 段短矩形沿圆弧拼出弓臂 + 直弦 + 握把。
  -- 库里的 weaponArt 是「金环 + 深色芯」，放大后读不出弓，这里自绘一支。
  local function bowArt(cx, cy, s, color)
    local c = color or T.th.accent2
    local R = 74 * s
    local ox = cx + 0.75 * R
    for i = 1, 9 do
      local deg = 121 + (239 - 121) * (i - 0.5) / 9
      local a = math.rad(deg)
      T.img(ox + math.cos(a) * R, cy + math.sin(a) * R, 7 * s, 27 * s, 'rect', c, deg)
    end
    T.img(cx + 0.25 * R, cy, 2.4 * s, 1.72 * R, 'rect', T.withA(c, 170))
    T.img(ox - R, cy, 11 * s, 36 * s, 'rect', T.mix(c, T.th.panelHi, 0.42))
    T.img(ox - R, cy + 0.2 * R, 7 * s, 7 * s, 'circle', T.th.panelHi)
  end

  -- 图鉴插图分派：k=0.5 是索引格（用给 14px 设计的图元图标 + 淡色底圆），
  -- k=1 是详情大图（用整套美术：enemyArt / artifactArt / crystalArt / icon）。
  -- 索引格里 enemyArt/artifactArt 在这个尺寸会糊成色块，所以两套分开。
  local function codexArt(it, x, y, k)
    local found = codexSeen(it.id)
    if k < 1 then
      T.img(x, y, 66, 66, 'circle', found and T.mix(it.color, T.th.panel, 0.82) or T.th.line)
      T.icon(found and it.icon or 'lock', x, y, 14, found and it.color or T.th.text3)
      return
    end
    if not found then
      T.icon('lock', x, y, 34, T.th.text3)
      T.snowflake(x, y + 56, 16, T.withA(T.th.text3, 90))
      return
    end
    if it.group == 'enemy' then
      local s = ({ slime = 1.35, fly = 1.5, guard = 1.12, boss = 0.86 })[it.icon] or 1.2
      T.enemyArt(it.icon, x, y, s, {})
    elseif it.group == 'gear' then
      if it.icon == 'bow' then
        bowArt(x, y, 1, it.color)
      else
        local s = ({ bloom = 1.15, plume = 1.25, hourglass = 1.3 })[it.icon] or 1.2
        T.artifactArt(it.icon, x, y, s, it.color)
      end
    elseif it.group == 'mat' then
      if it.icon == 'crystal' then
        T.crystalArt(x, y, 0.85, it.color)
      elseif it.icon == 'snow' then
        T.snowflake(x, y, 52, it.color, { core = T.th.panelHi, star = true })
      else
        T.icon('bloom', x, y, 48, it.color)
      end
    else
      local s = ({ moon = 54, tower = 46, mountain = 42 })[it.icon] or 44
      T.icon(it.icon, x, y, s, it.color)
    end
  end

  -- 收集「从第 b0 个控件之后新建的控件」，供整组位移使用
  local function since(b0)
    local out = {}
    for k = b0 + 1, #T.controls do out[#out + 1] = T.controls[k] end
    return out
  end

  -- 字符数：T.badge 内部按 #label（字节）算宽度，中文标签会被撑成两倍宽并溢出卡片，
  -- 所以图鉴里的徽章自己画（宽度按字符数算）。
  local function charLen(s)
    local n, i = 0, 1
    while i <= #s do
      local b = string.byte(s, i)
      i = i + ((b >= 240 and 4) or (b >= 224 and 3) or (b >= 192 and 2) or 1)
      n = n + 1
    end
    return n
  end

  local function badgeW(label, size)
    size = size or 11
    return math.max(44, charLen(label) * size + 22)
  end

  local function mkBadge(x, y, label, fill, fg, size)
    size = size or 11
    local w = badgeW(label, size)
    T.rrect(x, y, w, 20, 10, fill)
    T.txt(x, y, w - 8, 17, size, label, fg, 'Middle', 'Middle')
    return w
  end

  -- 中文排版的禁则字：不允许出现在行首
  local NOSTART = {
    ['。'] = true, ['，'] = true, ['、'] = true, ['！'] = true, ['？'] = true, ['：'] = true,
    ['；'] = true, ['」'] = true, ['』'] = true, ['）'] = true, ['·'] = true, ['…'] = true,
  }

  -- 自己折行：引擎的排版宽度是「控件宽 - 4」，CJK 字宽 = 字号，每行可容
  -- floor((width-4)/size) 字；顺手做中文禁则（标点不落行首，把上一个字一起挪下来）。
  -- 返回「折好行的文本 + 行数」——文本框高度必须按这个行数算，否则超出的行会被
  -- visibleLineCount 整段截掉（表现为「正文后半段消失」）。
  local function wrapCJK(text, per)
    per = math.max(4, per)
    local out = {}
    for para in string.gmatch(text .. '\n', '([^\n]*)\n') do
      local chars, i = {}, 1
      while i <= #para do
        local b = string.byte(para, i)
        local step = (b >= 240 and 4) or (b >= 224 and 3) or (b >= 192 and 2) or 1
        chars[#chars + 1] = string.sub(para, i, i + step - 1)
        i = i + step
      end
      local line, count = {}, 0
      for k = 1, #chars do
        local c = chars[k]
        if count >= per then
          if NOSTART[c] and count > 1 then
            local moved = table.remove(line)
            out[#out + 1] = table.concat(line)
            line, count = { moved }, 1
          else
            out[#out + 1] = table.concat(line)
            line, count = {}, 0
          end
        end
        line[#line + 1] = c
        count = count + 1
      end
      out[#out + 1] = table.concat(line)
    end
    return table.concat(out, '\n'), #out
  end

  -- 面板内按钮：T.button 的 secondary/danger 在浅色面板上底色几乎与面板同色（看不出是按钮），
  -- 这里自绘带描边的胶囊——常态 panel2 / 淡红，聚焦时 accent / 实红。
  local function panelBtn(x, y, w, h, label, onClick, name, danger)
    local bdOff, bdOn, fillOff, fillOn, txtOff, txtOn
    if danger then
      bdOff = T.mix(T.P.danger, T.th.panel, 0.55)
      bdOn = T.th.accent2
      fillOff = T.mix(T.P.danger, T.th.panel, 0.86)
      fillOn = T.P.danger
      txtOff, txtOn = T.P.danger, T.P.white
    else
      bdOff, bdOn = T.th.borderSoft, T.th.accent2
      fillOff, fillOn = T.th.panel2, T.th.accent
      txtOff, txtOn = T.th.text2, T.th.onAccent
    end
    local r = 14
    local b0 = #T.controls
    local bd = T.rrect(x, y, w, h, r, bdOff)
    local face = T.rrect(x, y, w - 2, h - 2, r - 1, fillOff)
    local tc = T.txt(x, y, w - 16, h - 8, 16, label, txtOff, 'Middle', 'Middle')
    local base = {}
    T.captureBase(base, since(b0))
    local function paint(on)
      T.tint(bd, on and bdOn or bdOff)
      T.tint(face, on and fillOn or fillOff)
      T.setTxtColor(tc, on and txtOn or txtOff)
      T.shiftBase(base, 0, on and 2 or 0)
    end
    paint(false)
    T.item({
      x = x, y = y, w = w, h = h, name = name, focusPad = 6,
      onConfirm = function()
        T.sfx(T.SFX.click)
        onClick()
      end,
      onFocus = paint,
      onDown = function() T.shiftBase(base, 0, 0) end,
      onUp = function() T.shiftBase(base, 0, 2) end,
    })
  end

  -- ==========================================================================
  -- A. 图鉴
  -- ==========================================================================
  T.screenFns.codex = function(params)
    params = params or {}
    local tab = math.floor(tonumber(params.tab) or 1)
    if tab < 1 then tab = 1 elseif tab > 4 then tab = 4 end
    local group = GROUP_OF_TAB[tab]
    local list = {}
    for i = 1, #T.codex do
      if T.codex[i].group == group then list[#list + 1] = T.codex[i] end
    end
    local sel = math.floor(tonumber(params.sel) or 1)
    if sel < 1 then sel = 1 elseif sel > #list then sel = #list end

    T.pageBg('day', { sunX = 380, sunY = 168 })
    T.header('霜华图鉴', '敌人、装备、材料与世界的记录',
      { right = '收录 ' .. codexCount() .. ' / ' .. #T.codex })
    T.backBtn(function() T.go('menu') end)

    -- ---- 页签 ----------------------------------------------------------
    -- T.tabs 在失焦时会把 active 页签的底色刷回 panel2（组件既有行为，字色却仍是
    -- onAccent），在浅色底上会变成「白字看不见」。这里接管每个页签的 onFocus，
    -- 自己维护「当前页签 = accentSoft + 强调字色，聚焦 = accent + onAccent」。
    local tabItems, tabFills, tabTxts = {}, {}, {}
    do
      local caps = {}
      local origRrect, origTxt = T.rrect, T.txt
      T.rrect = function(...)
        local g, o = origRrect(...)
        caps[#caps + 1] = { 'fill', g }
        return g, o
      end
      T.txt = function(...)
        local c = origTxt(...)
        caps[#caps + 1] = { 'text', c }
        return c
      end
      tabItems = T.tabs(0, 222, 520, TAB_LABELS, tab, function(i)
        T.go('codex', { tab = i, sel = 1 })
      end, { namePrefix = 'hit_codex_tab_' })
      T.rrect, T.txt = origRrect, origTxt
      for k = 1, #caps do
        if caps[k][1] == 'fill' then
          tabFills[#tabFills + 1] = caps[k][2]
        else
          tabTxts[#tabTxts + 1] = caps[k][2]
        end
      end
    end

    local function paintTab(i, focused)
      if tabFills[i] then
        T.tint(tabFills[i], focused and T.th.accent or (i == tab and T.th.accentSoft or T.th.panel2))
      end
      if tabTxts[i] then
        T.setTxtColor(tabTxts[i], focused and T.th.onAccent or (i == tab and T.th.accent or T.th.text2))
      end
    end

    for i = 1, #tabItems do
      local idx = i
      tabItems[i].onFocus = function(f) paintTab(idx, f) end
    end
    paintTab(tab, false)

    -- ---- 版面：≤4 条走 2×2，5~6 条走 3×2；「网格 + 详情」整组居中 --------
    local cols = (#list <= 4) and 2 or 3
    local GAP = 18
    local gridW = cols * 218 + (cols - 1) * GAP
    local compLeft = -(gridW + 40 + 340) / 2
    local gridX = compLeft + gridW / 2
    local px, py = compLeft + gridW + 40 + 170, -24

    -- ---- 右侧详情：先摆好本组每一条，只留选中那条可见 --------------------
    local panel = T.card(px, py, 340, 420,
      { radius = 18, fill = T.th.card, border = T.th.cardBorder, hi = T.withA(T.P.white, 110) })
    local detailBases = {}
    local descTop, descW, descSize = -52, 310, 13
    for i, it in ipairs(list) do
      local found = codexSeen(it.id)
      local b0 = #T.controls
      codexArt(it, px, 116, 1)
      local tag = found and it.tag or '未收录'
      mkBadge(px, -10, tag, found and T.th.accentSoft or T.th.line,
        found and T.th.accent or T.th.text3)
      local body
      local nLines = 1
      if found then
        body = it.desc .. '\n\n' .. (FLAVOR[it.id] or '')
      else
        body = '尚未在霜华纪中留下记录。\n\n雪落在这页纸上，还没有化开。'
      end
      local perLine = math.floor((descW - 4) / descSize)
      body, nLines = wrapCJK(body, perLine)
      local th = T.textH(descSize, nLines)
      T.txt(px, descTop - th / 2, descW, th, descSize, body, T.th.text2, 'Middle', 'Middle')
      local base = {}
      T.captureBase(base, since(b0))
      if i ~= sel then T.shiftBase(base, 0, -2400) end
      detailBases[i] = base
    end
    T.divider(px, -34, 280, { color = T.th.line })
    local selIt = list[sel]
    local nameTxt = T.txt(px, 26, 300, 44, 24, codexSeen(selIt.id) and selIt.name or '？？？',
      T.th.text, 'Middle', 'Middle')
    local capTxt = T.txt(px, -196, 300, 24, 12,
      codexSeen(selIt.id) and '收录于 霜华纪 · 第 1 章' or '尚未收录 · 未知的风景',
      T.th.text3, 'Middle', 'Middle')

    -- ---- 左侧网格：2 列（≤4 条）或 3 列（5~6 条）------------------------
    local COLX, ROWY = {}, {}
    for c = 1, cols do
      COLX[c] = gridX - (cols - 1) * (218 + GAP) / 2 + (c - 1) * (218 + GAP)
    end
    local rows = math.ceil(#list / cols)
    if rows <= 1 then
      ROWY = { 12 }
    else
      ROWY = { 96, -72 }
    end
    local function setDetail(i)
      for j = 1, #detailBases do
        T.shiftBase(detailBases[j], 0, j == i and 0 or -2400)
      end
      local it = list[i]
      local found = codexSeen(it.id)
      T.setTxt(nameTxt, found and it.name or '？？？')
      T.setTxt(capTxt, found and '收录于 霜华纪 · 第 1 章' or '尚未收录 · 未知的风景')
    end

    for i, it in ipairs(list) do
      local cx = COLX[(i - 1) % cols + 1]
      local cy = ROWY[math.floor((i - 1) / cols) + 1]
      local found = codexSeen(it.id)
      local b0 = #T.controls
      T.rrect(cx + 4, cy - 7, 218, 150, 16, T.withA(T.th.text, 14))
      local bd = T.rrect(cx, cy, 218, 150, 16, found and T.th.borderSoft or T.th.line)
      local face = T.rrect(cx, cy, 214, 146, 15, found and T.th.card or T.th.panel2)
      codexArt(it, cx, cy + 22, 0.5)
      T.txt(cx, cy - 44, 190, 26, 16, found and it.name or '未收录 · ？？？',
        found and T.th.text or T.th.text3, 'Middle', 'Middle')
      local tag = found and it.tag or '未收录'
      local bw = badgeW(tag)
      mkBadge(cx + 99 - bw / 2, cy + 56, tag, found and T.th.accentSoft or T.th.line,
        found and T.th.accent or T.th.text3)
      local base = {}
      T.captureBase(base, since(b0))
      local function paint(on)
        T.tint(bd, on and T.th.accent or (found and T.th.borderSoft or T.th.line))
        T.tint(face, on and T.th.panelHi or (found and T.th.card or T.th.panel2))
        T.shiftBase(base, 0, on and 2 or 0)
      end
      if i == sel then paint(true) end
      T.item({
        x = cx, y = cy, w = 218, h = 150, name = 'hit_codex_item_' .. i, focusPad = 6,
        onConfirm = function() T.go('codex', { tab = tab, sel = i, focus = 5 + i }) end,
        onFocus = function(on)
          paint(on)
          if on then setDetail(i) end
        end,
      })
    end

    -- ---- 网格下方的册页题记：把 2 行网格以下的空当收住 ------------------
    T.divider(gridX, -176, gridW, { color = T.withA(T.th.accent, 80) })
    T.txt(gridX - gridW / 2, -202, 380, 24, 12, '霜华纪 · 第一章「雪线」', T.th.text3, 'Left', 'Middle')
    T.txt(gridX + gridW / 2, -202, 260, 24, 12, '雪落时记下的旧事', T.th.text3, 'Right', 'Middle')

    T.footer({
      { key = '←→', label = '切换页签' },
      { key = '↑↓', label = '选择' },
      { key = 'Q', label = '返回' },
    })

    T.screen.defaultFocus = params.focus or (1 + tab)
    T.screen.key = function(a)
      local f = T.focus or 0
      if (a == 'left' or a == 'right') and f >= 2 and f <= 5 then
        local nt = tab + ((a == 'right') and 1 or -1)
        if nt < 1 then nt = 4 elseif nt > 4 then nt = 1 end
        T.go('codex', { tab = nt, sel = 1 })
        return
      end
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.go('menu') end
    end
  end

  -- ==========================================================================
  -- B. 设置
  -- ==========================================================================
  T.screenFns.settings = function(params)
    params = params or {}
    T.pageBg('day')
    T.header('设置', '声音、动效与画面', { right = '设置会立即生效' })
    T.backBtn(function() T.go('menu') end)

    T.card(0, -24, 880, 500, { radius = 20, fill = T.th.card, border = T.th.cardBorder })

    local ROWY = { 160, 96, 32, -32, -96 }
    local rows = {
      { label = '音效', hint = '按钮、命中的反馈音', icon = 'spark' },
      { label = '环境音', hint = '雪原的风，会一直陪着你', icon = 'wind' },
      { label = '动效强度', hint = '转场、悬停与飘雪的幅度', icon = 'snow' },
      { label = '文字描边', hint = '浅色画面上的字会更清楚', icon = 'book' },
      { label = '画质', hint = '粒子与光晕的密度', icon = 'eye' },
    }
    for i, r in ipairs(rows) do
      local y = ROWY[i]
      T.icon(r.icon, -378, y + 7, 11, T.th.accent)
      T.txt(-352, y + 7, 250, 30, 17, r.label, T.th.text, 'Left', 'Middle')
      T.txt(-352, y - 17, 300, 22, 12, r.hint, T.th.text3, 'Left', 'Middle')
    end

    -- ---- 自绘开关（轨道 + 圆 knob）-------------------------------------
    local function mkSwitch(y, name, on, apply)
      local cx = 320
      local track = T.rrect(cx, y, 92, 36, 18, on and T.th.accent or T.th.line)
      local knob = T.img(cx - 28, y, 28, 28, 'circle', T.P.white)
      local kb = {}
      T.captureBase(kb, knob)
      local stateTxt = T.txt(248, y, 44, 24, 12, on and '开' or '关',
        on and T.th.accent or T.th.text3, 'Right', 'Middle')
      local function paint(v)
        T.tint(track, v and T.th.accent or T.th.line)
        T.shiftBase(kb, v and 56 or 0, 0)
        T.setTxt(stateTxt, v and '开' or '关')
        T.setTxtColor(stateTxt, v and T.th.accent or T.th.text3)
      end
      paint(on)
      T.item({
        x = cx, y = y, w = 116, h = 48, name = name, focusPad = 6,
        onConfirm = function()
          local v = not on
          on = v
          paint(v)
          apply(v)
        end,
        onFocus = function(f)
          T.setTxtColor(stateTxt, f and T.th.accent2 or (on and T.th.accent or T.th.text3))
        end,
      })
    end

    -- ---- 三选胶囊 ------------------------------------------------------
    local function mkPills(y, cur, labels, names, onPick)
      for i = 1, 3 do
        local x = 116 + (i - 1) * 106
        local on = (i == cur)
        local g = T.rrect(x, y, 96, 34, 17, on and T.th.accent or T.th.panel2)
        local t = T.txt(x, y, 88, 28, 12, labels[i],
          on and T.th.onAccent or T.th.text2, 'Middle', 'Middle')
        T.item({
          x = x, y = y, w = 100, h = 40, name = names[i], focusPad = 5,
          onConfirm = function() onPick(i) end,
          onFocus = function(f)
            if on then return end
            T.tint(g, f and T.th.accentSoft or T.th.panel2)
            T.setTxtColor(t, f and T.th.accent or T.th.text2)
          end,
        })
      end
    end

    mkSwitch(ROWY[1], 'hit_settings_sfx', T.opt.sfx, function(v)
      T.opt.sfx = v
      T.log('opt sfx=' .. tostring(v))
      if v then T.sfx(T.SFX.click) end
    end)

    mkSwitch(ROWY[2], 'hit_settings_ambient', T.opt.ambient, function(v)
      T.opt.ambient = v
      T.setAmbient(v)
      T.log('opt ambient=' .. tostring(v))
    end)

    mkPills(ROWY[3], T.opt.motion, { '柔和', '标准', '丰富' },
      { 'hit_settings_motion_1', 'hit_settings_motion_2', 'hit_settings_motion_3' },
      function(i)
        T.opt.motion = i
        T.log('opt motion=' .. i)
        T.go('settings', { focus = 3 + i })
      end)

    mkSwitch(ROWY[4], 'hit_settings_outline', T.opt.outline, function(v)
      T.opt.outline = v
      for i = 1, #T.texts do T.trySet(T.texts[i], 'enableOutline', v) end
      T.log('opt outline=' .. tostring(v))
    end)

    mkPills(ROWY[5], T.opt.quality, { '省电', '均衡', '极致' },
      { 'hit_settings_quality_1', 'hit_settings_quality_2', 'hit_settings_quality_3' },
      function(i)
        T.opt.quality = i
        T.log('opt quality=' .. i)
        T.go('settings', { focus = 7 + i })
      end)

    T.divider(0, -140, 780, { color = T.th.line })

    panelBtn(-130, -200, 220, 48, '操作说明', function()
      T.openHelp('settings')
    end, 'hit_settings_help', false)

    panelBtn(130, -200, 220, 48, '重置进度', function()
      T.openConfirm('重置霜华纪记录？', '关卡星级、图鉴与养成进度都会清空。', function()
        local rec = T.records
        rec.stars = { 0, 0, 0, 0, 0, 0 }
        rec.best = { 0, 0, 0, 0, 0, 0 }
        rec.unlocked = { true, true, false, false, false, false }
        rec.visited = { false, false, false, false, false, false }
        rec.consts = { true, true, true, false, false, false }
        rec.clears = 0
        rec.maxCombo = 0
        rec.totalShots = 0
        rec.achv = {}
        rec.exp = 0
        rec.mats = { crystal = 0, qingxin = 0, snow = 0, mora = 0, page = 0 }
        T.codexSeen = {}
        T.log('records reset')
        T.toast('记录已重置')
      end)
    end, 'hit_settings_reset', true)

    T.footer('↑↓ 选择 · 空格切换 · Q 返回')

    T.screen.defaultFocus = params.focus or 2
    T.screen.key = function(a)
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.go('menu') end
    end
  end

  -- ==========================================================================
  -- C. 制作名单
  -- ==========================================================================
  T.screenFns.credits = function(params)
    T.pageBg('night', { moonX = 0, moonY = 120, moonR = 100, stars = 40, aurora = false })
    T.snowfall(22, {})
    T.screenFrame()

    local px, py, pw, ph = 0, -14, 860, 520
    T.card(px, py, pw, ph, {
      radius = 20,
      fill = T.th.panel,
      border = T.withA(T.th.accent2, 150),
      hi = T.withA(T.th.accent2, 46),
    })

    -- 标题：字距拉开的三字牌
    local chars = { '霜', '华', '纪' }
    for i = 1, #chars do
      T.txt((i - (#chars + 1) / 2) * 62, 196, 60, 60, 40, chars[i], T.th.accent2, 'Middle', 'Middle')
    end
    T.titleFlourish(0, 158, 300, T.withA(T.th.accent2, 170))
    T.txt(0, 134, 420, 24, 11, 'F R O S T B L O O M', T.th.accent, 'Middle', 'Middle')
    T.txt(0, 108, 460, 26, 13, '一个关于雪、契约与归途的故事', T.th.text2, 'Middle', 'Middle')

    T.divider(0, 82, 700, { color = T.th.line })

    -- 两列名单
    local leftCol, rightCol = -370, 60
    local function columnHead(x, title)
      T.txt(x, 58, 260, 24, 12, title, T.th.accent2, 'Left', 'Middle')
      T.img(x + 165, 42, 330, 1.2, 'rect', T.withA(T.th.accent2, 90))
    end
    local function credit(x, y, role, name)
      T.txt(x, y, 170, 24, 12, role, T.th.text3, 'Left', 'Middle')
      T.img(x + 176, y, 1.2, 13, 'rect', T.withA(T.th.accent2, 110))
      T.txt(x + 186, y, 200, 24, 14, name, T.th.text, 'Left', 'Middle')
    end

    columnHead(leftCol, '企划 · 设计')
    credit(leftCol, 16, '企划 · 世界观', '霜华纪制作组')
    credit(leftCol, -16, '角色设计', '甘雨 · 麒麟')
    credit(leftCol, -48, '界面设计', '雪原事务所')

    columnHead(rightCol, '实现 · 打磨')
    credit(rightCol, 16, '程序', '千星 Lua 客户端')
    credit(rightCol, -16, '美术实现', '纯图元手绘')
    credit(rightCol, -48, '音效', '霜风与铃')
    credit(rightCol, -80, '测试', '看到这里的你')

    T.divider(0, -110, 560, { color = T.th.line })
    T.txt(0, -136, 560, 26, 14, '特别感谢：愿意在落雪时停下来的你', T.th.accent2, 'Middle', 'Middle')

    -- 底部小饰：细线 + 六角冰晶
    T.img(-150, -170, 260, 1.2, 'rect', T.withA(T.th.accent, 70))
    T.img(150, -170, 260, 1.2, 'rect', T.withA(T.th.accent, 70))
    T.snowflake(0, -170, 11, T.withA(T.th.accent, 200), { core = T.th.accent2 })

    T.txt(0, -194, 420, 24, 11, 'v' .. tostring(T.VERSION) .. ' · Build ' .. tostring(T.BUILD_ID),
      T.th.text3, 'Middle', 'Middle')

    T.button(0, -238, 240, 44, '返回主菜单', function()
      T.go('menu')
    end, { kind = 'primary', name = 'hit_credits_back', radius = 22 })

    T.footer('Q / 空格 返回主菜单')

    T.screen.defaultFocus = 1
    T.screen.key = function(a)
      if a == 'back' or a == 'confirm' then
        T.go('menu')
      elseif a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0) end
    end
  end
end
