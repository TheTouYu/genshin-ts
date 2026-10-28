-- ============================================================================
-- 弹层：暂停 / 指南 / 确认
-- ============================================================================
T = T or {}

T.openPause = function()
  if T.overlay then return end
  local ctx = T.mode
  T.openOverlay('pause', function()
    local p = T.overlayPanel(520, 430, '暂停', '霜雪暂歇，风还在等你')
    local panel, w, h = p.panel, p.w, p.h
    local y0 = 46
    T.button(0, y0, 320, 54, '继续挑战', function() T.closeOverlay() end,
      { kind = 'primary', name = 'hit_pause_resume' })
    T.button(0, y0 - 70, 320, 50, '重新开始', function()
      T.closeOverlay()
      T.go('battle', { stage = T.battle and T.battle.stageId or 1 })
    end, { kind = 'secondary', name = 'hit_pause_retry' })
    T.button(0, y0 - 130, 320, 50, '设置', function()
      T.closeAllOverlays()
      T.go('settings')
    end, { kind = 'secondary', name = 'hit_pause_settings' })
    T.button(0, y0 - 190, 320, 50, '返回地图', function()
      T.closeAllOverlays()
      T.go('map', { chapter = 1, sel = 1 })
    end, { kind = 'ghost', name = 'hit_pause_quit' })
    T.txt(0, -h / 2 + 34, 380, 22, 11, '当前进度：' .. (ctx == 'battle' and '战斗进行中' or ctx), T.th.text3, 'Middle', 'Middle')
    T.closeButton(w / 2 - 40, h / 2 - 40, function() T.closeOverlay() end, 'hit_pause_close')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a)
      if a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end

T.openHelp = function(context)
  if T.overlay then return end
  T.openOverlay('help', function()
    local p = T.overlayPanel(920, 560, '霜华指南', '操作、战斗与养成')
    local panel, w, h = p.panel, p.w, p.h
    local cols = {
      { x = -300, title = '操作', icon = 'user', items = {
        { '鼠标悬停', '瞄准敌人，出现霜华准星' },
        { '鼠标点击', '射出霜华矢' },
        { '↑ ↓ ← →', '选择 / 移动焦点' },
        { '空格 / J', '确认' },
        { 'E', '释放元素战技 / 爆发' },
        { 'Q', '返回上一层' },
        { 'H', '打开本指南' },
      } },
      { x = 0, title = '战斗', icon = 'snow', items = {
        { '瞄准', '把光标停在敌人身上' },
        { '射击', '点击命中，积攒元素能量' },
        { '连击', '短时间内连续命中会累计 COMBO' },
        { '冰莲', '能量满后按 E 释放降众天华' },
        { '波次', '清空三波敌人即可完成挑战' },
        { '计时', '在限定时间内完成，星级更高' },
      } },
      { x = 300, title = '养成', icon = 'const', items = {
        { '等级', '通过冒险阅历提升，上限受突破限制' },
        { '突破', '消耗霜华之蕊与冰晶核，提升上限' },
        { '天赋', '提升霜华矢与降众天华的威力' },
        { '命之座', '点亮相应的命星，解锁额外效果' },
        { '图鉴', '记录遇到过的敌人与拾得的材料' },
      } },
    }
    for _, col in ipairs(cols) do
      T.img(col.x - 148, -26, 1.2, 272, 'rect', T.th.line)
      T.icon(col.icon, col.x - 124, 128, 10, T.th.accent2)
      T.txt(col.x - 104, 128, 200, 28, 17, col.title, T.th.text, 'Left', 'Middle')
      for i, it in ipairs(col.items) do
        local yy = 86 - (i - 1) * 42
        T.txt(col.x - 128, yy + 8, 260, 24, 13, it[1], T.th.accent, 'Left', 'Middle')
        T.txt(col.x - 128, yy - 11, 268, 22, 11, it[2], T.th.text2, 'Left', 'Middle')
      end
    end
    T.button(0, -h / 2 + 40, 220, 44, '知道了', function() T.closeOverlay() end,
      { kind = 'primary', name = 'hit_help_close' })
    T.closeButton(w / 2 - 36, h / 2 - 36, function() T.closeOverlay() end, 'hit_help_x')
  end, {
    pausesGame = true, defaultFocus = 1,
    key = function(a)
      if a == 'back' or a == 'confirm' or a == 'help' then T.closeOverlay() end
    end,
  })
end

T.openConfirm = function(title, desc, onYes, opts)
  opts = opts or {}
  if T.overlay then return end
  T.openOverlay('confirm', function()
    local p = T.overlayPanel(560, 280, title, desc)
    local w, h = p.w, p.h
    T.button(-96, -h / 2 + 58, 160, 48, opts.cancelLabel or '取消', function() T.closeOverlay() end,
      { kind = 'secondary', name = 'hit_confirm_cancel' })
    T.button(96, -h / 2 + 58, 160, 48, opts.okLabel or '确定', function()
      T.closeOverlay()
      if onYes then onYes() end
    end, { kind = 'danger', name = 'hit_confirm_ok' })
  end, {
    pausesGame = true, defaultFocus = 2,
    key = function(a)
      if a == 'left' then T.moveFocus(-1, 0)
      elseif a == 'right' then T.moveFocus(1, 0)
      elseif a == 'up' then T.moveFocus(0, 1)
      elseif a == 'down' then T.moveFocus(0, -1)
      elseif a == 'confirm' then T.confirmFocus()
      elseif a == 'back' then T.closeOverlay() end
    end,
  })
end
