-- ============================================================================
-- 页面 3：战斗（可操作的演示层：悬停瞄准 → 点击射箭 → 命中碎裂 → 波次）
-- 设计口径：数值只服务手感，不做平衡；三波清空即胜利，计时归零即失败。
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

T.BATTLE_WAVES = 3

T.battleEnemyDef = function(id)
  local d = T.enemies[id]
  return {
    id = id, name = d and d.name or id, tag = d and d.tag or '',
    hp = (id == 'boss') and 5 or (id == 'guard' and 3 or 2),
    size = (id == 'boss') and 1.05 or 0.86,
  }
end

T.battle = nil

-- 爆炸碎片（用完自动销毁，必须从 T.controls 摘掉）
T.burst = function(x, y, color, n, scale)
  n = n or 8
  scale = scale or 1
  for i = 1, n do
    local a = (i / n) * math.pi * 2 + T.rand(40) / 40
    local ctl = T.img(x, y, 7 * scale, 16 * scale, 'triangle', color, T.rand(360))
    if ctl then
      local dist = (28 + T.rand(46)) * scale
      local tx, ty = x + math.cos(a) * dist, y + math.sin(a) * dist
      local rot = T.rand(200) - 100
      T.tween(0.42, function(k)
        T.tryCall(ctl, 'SetAnchoredPosition', (x + (tx - x) * k) * T.S, (y + (ty - y) * k - 16 * k) * T.S)
        T.trySet(ctl, 'localRotationZ', rot * k)
        T.trySet(ctl, 'imageColor', T.withA(color % 16777216, math.floor(230 * (1 - k))))
      end, function() T.destroyCtl(ctl) end, T.easeOut)
    end
  end
end

T.battleFloat = function(x, y, text, color, size)
  local b = T.battle
  local seq = 0
  if b then b.floatSeq = ((b.floatSeq or 0) + 1) % 5; seq = b.floatSeq end
  local ox = (seq - 2) * 18
  local oy = (seq % 3) * 10
  local ctl = T.txt(x + ox, y + oy, 160, 34, size or 20, text, color or T.th.accent2, 'Middle', 'Middle',
    { outline = true, outlineColor = T.C(180, 6, 22, 36) })
  if not ctl then return end
  local py = y + oy
  T.tween(0.7, function(k)
    T.tryCall(ctl, 'SetAnchoredPosition', (x + ox) * T.S, (py + 42 * k) * T.S)
    T.trySet(ctl, 'fontColor', T.withA(color % 16777216, math.floor(255 * (1 - k * k))))
  end, function() T.destroyCtl(ctl) end, T.easeOut)
end

T.battleReticleAt = function(x, y, visible)
  local r = T.battle and T.battle.reticle
  if not r then return end
  for i = 1, #r do
    local c = r[i].ctl
    local ox, oy = r[i].ox, r[i].oy
    T.tryCall(c, 'SetAnchoredPosition', (x + (visible and ox or 0)) * T.S, ((visible and y or -1000) + (visible and oy or 0)) * T.S)
  end
end

T.battleSpawnWave = function(n)
  local b = T.battle
  if not b then return end
  b.wave = n
  b.enemies = {}
  local stage = b.stage
  local e1 = stage.enemies[1]
  local e2 = stage.enemies[2]
  local e3 = stage.enemies[3]
  local defs
  local pos
  if n == 1 then
    defs = { e1, e2 }
    pos = { { -250, 76 }, { 210, 108 } }
  elseif n == 2 then
    defs = { e2, e3 }
    pos = { { -300, 96 }, { 250, 64 } }
  else
    defs = { e3, (e3 == 'boss') and e2 or e1 }
    if stage.id == 3 or stage.id == 6 then
      defs = { 'boss', e2 }
      pos = { { 0, 132 }, { 300, 60 } }
    else
      pos = { { -240, 72 }, { 240, 110 } }
    end
  end
  b.totalEnemies = #defs
  for i, id in ipairs(defs) do
    local d = T.battleEnemyDef(id)
    local px, py = pos[i][1], pos[i][2]
    local start = #T.controls + 1
    T.enemyArt(id, px, py, d.size, {})
    local parts = {}
    for k = start, #T.controls do parts[#parts + 1] = T.controls[k] end
    local base = {}
    for _, c in ipairs(parts) do
      local p = T.pos[c]
      if p then base[c] = { p.x, p.y } end
    end
    -- 血条（小圆点）
    local pips = {}
    for k = 1, d.hp do
      local pxp = px - ((d.hp - 1) * 11) / 2 + (k - 1) * 11
      pips[k] = T.img(pxp, py + 62 * d.size, 9, 9, 'circle', T.P.ice2)
    end
    -- 名字
    local nameCtl = T.txt(px, py + 78 * d.size, 200, 22, 11, d.name, T.th.text2, 'Middle', 'Middle')
    local e = {
      i = i, id = id, name = d.name, x = px, y = py, hp = d.hp, maxHp = d.hp,
      size = d.size, parts = parts, base = base, pips = pips, nameCtl = nameCtl, alive = true,
      phase = T.rand(100) / 20,
    }
    b.enemies[i] = e
    e.hit = T.hit('hit_battle_enemy_' .. i, px, py, 120 * d.size, 120 * d.size, {
      clickSfx = false,
      onClick = function() T.battleFire(e) end,
      onEnter = function()
        b.aim = i
        T.battleReticleAt(px, py, true)
        for k, c in ipairs(b.aimLine) do
          local t = k / (#b.aimLine + 1)
          T.tryCall(c, 'SetAnchoredPosition', (-470 + (px + 470) * t) * T.S, (-266 + (py + 266) * t) * T.S)
        end
      end,
      onExit = function()
        if b.aim == i then b.aim = nil end
        T.battleReticleAt(px, py, false)
        for _, c in ipairs(b.aimLine) do T.tryCall(c, 'SetAnchoredPosition', -470 * T.S, -1000 * T.S) end
      end,
    })
  end
  -- 敌人漂浮
  T.anim(function(dt, t)
    if T.overlay and T.overlay.pausesGame then return end
    local bb = T.battle
    if not bb then return false end
    for _, e in ipairs(bb.enemies) do
      if e.alive then
        local bob = math.sin(t * 1.4 + e.phase) * 6
        for _, c in ipairs(e.parts) do
          local p = e.base[c]
          if p then T.tryCall(c, 'SetAnchoredPosition', p[1] * T.S, (p[2] + bob) * T.S) end
        end
      end
    end
  end)
  -- 波次横幅
  local banner = T.txt(0, 70, 420, 60, 32, '第 ' .. n .. ' 波', T.th.text, 'Middle', 'Middle',
    { outline = true, outlineColor = T.C(170, 4, 16, 28) })
  if banner then
    T.setScale(banner, 0.7)
    T.tween(0.3, function(k) T.setScale(banner, 0.7 + 0.3 * k) end, nil, T.easeBack, true)
    T.after(1.1, function()
      if banner then
        T.tween(0.3, function(k) T.trySet(banner, 'fontColor', T.withA(T.th.text % 16777216, math.floor(255 * (1 - k)))) end,
          function() T.destroyCtl(banner) end, T.easeOut, true)
      end
    end, true)
  end
  T.log('battle wave=' .. n .. ' n=' .. #defs)
end

T.battleFire = function(e)
  local b = T.battle
  if not b or b.over or not e or not e.alive then return end
  if (b.shootCd or 0) > 0 then return end
  b.shootCd = 0.18
  b.shots = b.shots + 1
  T.records.totalShots = T.records.totalShots + 1
  T.sfx(T.SFX.shoot)
  -- 箭：一条细长矩形从甘雨位置射向敌人
  local sx, sy = 0, -168
  local dx, dy = e.x - sx, e.y - sy
  local len = math.sqrt(dx * dx + dy * dy)
  local ang = math.deg(math.atan(dy, dx))
  local arrow = T.img(sx, sy, 34, 3, 'rect', T.P.ice2, ang)
  local trail = T.img(sx, sy, 60, 2, 'rect', T.withA(T.P.white, 120), ang)
  T.tween(0.12, function(k)
    local px, py = sx + dx * k, sy + dy * k
    T.tryCall(arrow, 'SetAnchoredPosition', px * T.S, py * T.S)
    T.tryCall(trail, 'SetAnchoredPosition', (px - dx / len * 26) * T.S, (py - dy / len * 26) * T.S)
  end, function()
    T.destroyCtl(arrow)
    T.destroyCtl(trail)
    T.battleHit(e)
  end, T.easeIn)
end

T.battleHit = function(e, isSkill)
  local b = T.battle
  if not b or not e.alive then return end
  e.hp = e.hp - 1
  if not isSkill then b.hits = b.hits + 1 end
  b.combo = b.combo + 1
  b.comboT = 2.4
  if b.combo > T.records.maxCombo then T.records.maxCombo = b.combo end
  T.sfx(T.SFX.impact)
  T.battleFloat(e.x, e.y + 20, '-' .. 1, T.P.ice1, 22)
  T.burst(e.x, e.y, T.P.ice2, 5, 0.9)
  if e.pips[e.hp + 1] then T.setColor(e.pips[e.hp + 1], T.th.line) end
  b.energy = math.min(100, b.energy + 14)
  b.score = b.score + math.floor(120 * (1 + (b.combo - 1) * 0.15))
  T.log('battle hit enemy=' .. e.i .. ' hp=' .. e.hp .. ' combo=' .. b.combo)
  if e.hp <= 0 then T.battleKill(e) end
end

T.battleKill = function(e)
  local b = T.battle
  if not e.alive then return end
  e.alive = false
  T.sfx(T.SFX.ice)
  T.burst(e.x, e.y, T.P.ice3, 12, 1.2)
  T.burst(e.x, e.y, T.P.white, 6, 0.8)
  for _, c in ipairs(e.parts) do T.destroyCtl(c) end
  for _, c in ipairs(e.pips) do T.destroyCtl(c) end
  if e.nameCtl then T.destroyCtl(e.nameCtl) end
  if e.hit then T.destroy(e.hit) end
  T.battleReticleAt(0, 0, false)
  b.aim = nil
  T.log('battle kill enemy=' .. e.i)
  local alive = 0
  for _, x in ipairs(b.enemies) do if x.alive then alive = alive + 1 end end
  if alive == 0 then
    if b.wave >= T.BATTLE_WAVES then
      b.over = true
      T.after(0.7, function() T.battleFinish(true) end)
    else
      T.log('battle wave clear=' .. b.wave)
      T.log('battle schedule next wave=' .. (b.wave + 1))
      T.after(0.9, function()
        T.log('battle next wave fire=' .. (b.wave + 1) .. ' same=' .. tostring(T.battle == b) .. ' over=' .. tostring(b.over))
        if T.battle == b and not b.over then T.battleSpawnWave(b.wave + 1) end
      end)
    end
  end
end

T.battleSkill = function()
  local b = T.battle
  if not b or b.over then return end
  if b.energy < 100 then
    T.log('battle skill denied energy=' .. math.floor(b.energy))
    T.sfx(T.SFX.error, true)
    T.toast('元素能量不足 · ' .. math.floor(b.energy) .. ' / 100', T.th.text2)
    return
  end
  b.energy = 0
  b.skillUsed = (b.skillUsed or 0) + 1
  T.sfx(T.SFX.ice, true)
  T.log('battle skill used=' .. b.skillUsed)
  -- 全屏霜闪
  local flash = T.img(0, 0, T.DESIGN_W, T.DESIGN_H, 'rect', T.withA(T.P.ice1, 190))
  T.tween(0.5, function(k)
    T.trySet(flash, 'imageColor', T.withA(T.P.ice1, math.floor(190 * (1 - k) ^ 2)))
  end, function() T.destroyCtl(flash) end, T.easeOut)
  local ring = T.img(0, 30, 120, 120, 'ring', T.withA(T.P.ice2, 220))
  T.tween(0.5, function(k)
    T.tryCall(ring, 'SetSizeDelta', (120 + 900 * k) * T.S, (120 + 420 * k) * T.S)
    T.trySet(ring, 'imageColor', T.withA(T.P.ice2, math.floor(220 * (1 - k))))
  end, function() T.destroyCtl(ring) end, T.easeOut)
  T.burst(0, 30, T.P.ice2, 14, 1.6)
  T.shake(12, 0.3)
  for _, e in ipairs(b.enemies) do
    if e.alive then
      for _ = 1, 2 do
        if e.alive then T.battleHit(e, true) end
      end
    end
  end
end

T.battleFinish = function(win)
  local b = T.battle
  if not b or b.finished then return end
  b.finished = true
  local ratio = b.timeLeft / b.stage.time
  local stars = 0
  if win then
    stars = (ratio > 0.55) and 3 or ((ratio > 0.28) and 2 or 1)
  end
  T.log('battle end win=' .. tostring(win) .. ' stars=' .. stars .. ' time=' .. string.format('%.1f', b.timeLeft))
  T.go('result', {
    stage = b.stage.id, win = win, stars = stars, score = b.score,
    combo = T.records.maxCombo, shots = b.shots, hits = b.hits, timeLeft = b.timeLeft,
  })
end

T.screenFns.battle = function(params)
  params = params or {}
  local stage = T.stageById[params.stage or 1] or T.stages[1]
  T.pageBg('night', { moonX = 286, moonY = 226, moonR = 54, stars = 44, aurora = false })
  T.snowfall(22, { pauseWithGame = true })
  -- 冰面场地
  T.img(0, -300, 1600, 300, 'circle', T.C(255, 44, 88, 114))
  T.img(0, -246, 1200, 200, 'circle', T.C(255, 58, 106, 134))
  T.img(0, -214, 980, 120, 'circle', T.C(255, 74, 126, 156))
  T.img(0, -212, 900, 100, 'ring', T.withA(T.P.ice2, 40))
  -- 角落冰晶
  T.iceShardCluster(-560, -250, 1.5, T.withA(T.P.ice3, 200))
  T.iceShardCluster(560, -244, 1.3, T.withA(T.P.ice3, 180))
  -- 甘雨（底部）
  T.img(-470, -300, 320, 260, 'circle', T.withA(T.P.ice4, 26))
  T.portrait(T.chars[1], -470, -266, 0.56, { idle = true, pauseWithGame = true, amp = 1.4 })

  T.img(0, -424, 1600, 190, 'circle', T.withA(T.P.night0, 130))
  local b = {
    stage = stage, stageId = stage.id, wave = 0, timeLeft = stage.time,
    score = 0, combo = 0, comboT = 0, energy = 0, health = 100,
    shots = 0, hits = 0, over = false, finished = false, aim = nil,
  }
  T.battle = b
  T.log('battle start stage=' .. stage.id .. ' waves=' .. T.BATTLE_WAVES .. ' time=' .. stage.time)

  -- 准星（先建，敌人之后建 → 准星在敌人下层？不会：准星停在屏幕外，悬停时移到敌人处会盖住敌人，可接受）
  local reticle = {}
  local ring = T.img(0, -1000, 74, 74, 'ring', T.withA(T.P.gold, 210))
  reticle[#reticle + 1] = { ctl = ring, ox = 0, oy = 0 }
  for _, p in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
    local ox, oy = p[1] * 26, p[2] * 26
    reticle[#reticle + 1] = { ctl = T.img(0, -1000, 12, 2.4, 'rect', T.P.gold, p[1] * p[2] * 45), ox = ox, oy = oy }
    reticle[#reticle + 1] = { ctl = T.img(0, -1000, 2.4, 12, 'rect', T.P.gold, p[1] * p[2] * 45), ox = ox, oy = oy }
  end
  reticle[#reticle + 1] = { ctl = T.img(0, -1000, 6, 6, 'circle', T.P.goldPale), ox = 0, oy = 0 }
  b.reticle = reticle
  -- 瞄准虚线（悬停时从甘雨的弓到目标）
  local aimLine = {}
  for i = 1, 12 do
    aimLine[i] = T.img(-470, -1000, 5, 5, 'circle', T.withA(T.P.gold, 150))
  end
  b.aimLine = aimLine

  -- HUD 左上：角色
  local hx, hy = -470, 286
  T.card(hx, hy, 344, 92, { radius = 16, fill = T.th.panel, border = T.th.cardBorder, shadow = false })
  T.img(hx - 128, hy + 2, 60, 60, 'circle', T.th.accent)
  T.portraitHead(hx - 128, hy + 4, 0.36, T.chars[1])
  T.txt(hx - 92, hy + 22, 120, 24, 15, '甘雨', T.th.text, 'Left', 'Middle')
  T.txt(hx - 92, hy + 2, 130, 20, 10, 'Lv.' .. T.records.level .. ' · 冰', T.th.text3, 'Left', 'Middle')
  local hpBg = T.rrect(hx + 18, hy - 10, 190, 8, 4, T.th.slotBg)
  local hpFill = T.img(hx + 18, hy - 10, 186, 6, 'rect', T.P.ok)
  local enBg = T.rrect(hx + 18, hy - 26, 190, 6, 3, T.th.slotBg)
  local enFill = T.img(hx + 18, hy - 26, 2, 4, 'rect', T.P.ice3)
  b.hpFill, b.enFill = hpFill, enFill

  -- HUD 顶部中：波次 / 计时
  T.rrect(0, 312, 240, 34, 17, T.th.panel)
  local waveTxt = T.txt(0, 312, 200, 28, 13, '', T.th.text, 'Middle', 'Middle')
  local aliveTxt = T.txt(0, 286, 200, 20, 10, '', T.th.text3, 'Middle', 'Middle')
  -- HUD 右上：分数 / 连击
  T.txt(500, 340, 200, 20, 10, 'SCORE', T.th.text3, 'Right', 'Middle')
  local scoreTxt = T.txt(500, 320, 200, 30, 18, '0', T.th.text, 'Right', 'Middle')
  local comboTxt = T.txt(500, 294, 200, 26, 13, '', T.th.accent2, 'Right', 'Middle')
  T.iconBtn(600, 320, 36, 'pause', function() T.openPause() end, { name = 'hit_battle_pause' })
  b.waveTxt, b.scoreTxt, b.comboTxt, b.aliveTxt = waveTxt, scoreTxt, comboTxt, aliveTxt

  -- 技能按钮（右下）
  local sx, sy = 520, -258
  local skillRing = T.img(sx, sy, 96, 96, 'ring', T.th.border)
  local skillBg = T.img(sx, sy, 84, 84, 'circle', T.th.panel2)
  local skillIcon = T.icon('snow', sx, sy + 2, 15, T.th.text3)
  local skillKey = T.txt(sx, sy - 58, 40, 20, 10, 'E', T.th.text3, 'Middle', 'Middle')
  b.skillRing, b.skillBg, b.skillIcon, b.skillKey = skillRing, skillBg, skillIcon, skillKey
  T.item({
    x = sx, y = sy, w = 100, h = 100, name = 'hit_battle_skill', focusPad = 6,
    onConfirm = function() T.battleSkill() end,
    onFocus = function(on) b.skillFocus = on end,
  })
  T.txt(sx - 74, sy - 4, 120, 22, 11, '降众天华', T.th.text2, 'Right', 'Middle')
  T.txt(sx - 74, sy - 26, 120, 20, 10, '能量满后释放', T.th.text3, 'Right', 'Middle')

  -- 底部提示
  T.txt(0, -340, 760, 22, 11, '悬停敌人瞄准 · 点击射出霜华矢 · E 释放技能 · Q 暂停', T.th.text3, 'Middle', 'Middle')

  T.battleSpawnWave(1)

  -- 逐帧
  T.screen.update = function(dt)
    if b.over then return end
    b.shootCd = math.max(0, (b.shootCd or 0) - dt)
    b.timeLeft = math.max(0, b.timeLeft - dt)
    b.comboT = math.max(0, b.comboT - dt)
    if b.comboT <= 0 and b.combo ~= 0 then b.combo = 0 end
    -- 计时文字
    local mm = math.floor(b.timeLeft / 60)
    local ss = math.floor(b.timeLeft % 60)
    T.setTxt(b.waveTxt, '第 ' .. b.wave .. ' / ' .. T.BATTLE_WAVES .. ' 波　　' .. string.format('%02d:%02d', mm, ss))
    T.setTxt(b.scoreTxt, T.fmt(b.score))
    T.setTxt(b.comboTxt, b.combo > 1 and ('COMBO ×' .. b.combo) or '')
    local alive = 0
    for _, e in ipairs(b.enemies) do if e.alive then alive = alive + 1 end end
    T.setTxt(b.aliveTxt, '来敌 ' .. alive)
    -- 能量与技能
    local e = b.energy
    local fw = math.max(2, 186 * e / 100)
    T.tryCall(b.enFill, 'SetSizeDelta', fw * T.S, 4 * T.S)
    T.tryCall(b.enFill, 'SetAnchoredPosition', (-547 + fw / 2) * T.S, (286 - 26) * T.S)
    local ready = e >= 100
    T.setColor(b.skillRing, ready and T.th.accent2 or T.th.border)
    T.setColor(b.skillBg, ready and T.th.panelHi or T.th.panel2)
    T.setColor(b.skillIcon, ready and T.th.accent2 or T.th.text3)
    T.setTxtColor(b.skillKey, ready and T.th.accent2 or T.th.text3)
    if ready then
      local p = 0.5 + 0.5 * math.sin(T.time * 4)
      T.tryCall(b.skillRing, 'SetSizeDelta', (96 + p * 8) * T.S, (96 + p * 8) * T.S)
    else
      T.tryCall(b.skillRing, 'SetSizeDelta', 96 * T.S, 96 * T.S)
    end
    -- 血量（模板：不接伤害逻辑，保持满）
    T.tryCall(b.hpFill, 'SetSizeDelta', 186 * T.S, 6 * T.S)
    -- 失败
    if b.timeLeft <= 0 and not b.finished then
      b.finished = true
      b.over = true
      T.battleFinish(false)
    end
  end

  local screen = T.screen
  screen.key = function(a)
    if a == 'skill' then T.log('battle key skill'); T.battleSkill()
    elseif a == 'confirm' then T.battleSkill()
    elseif a == 'back' then T.openPause()
    elseif a == 'up' then T.moveFocus(0, 1)
    elseif a == 'down' then T.moveFocus(0, -1)
    elseif a == 'left' then T.moveFocus(-1, 0)
    elseif a == 'right' then T.moveFocus(1, 0) end
  end
  T.screen.defaultFocus = #T.items
end
