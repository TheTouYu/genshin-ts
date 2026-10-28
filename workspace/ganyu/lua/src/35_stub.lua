-- ============================================================================
-- 临时占位屏（真实实现在 32~45 号文件里覆盖；此文件仅保证分阶段可构建）
-- ============================================================================
T = T or {}
T.screenFns = T.screenFns or {}

local function placeholder(name, title, sub)
  T.screenFns[name] = function(params)
    T.pageBg('day', {})
    T.header(title, sub)
    T.backBtn(function() T.go('menu') end)
    T.txt(0, 20, 720, 60, 26, '这一页正在布置中…', T.th.text2, 'Middle', 'Middle')
    T.item({ x = 0, y = -100, w = 260, h = 58, name = 'hit_placeholder_back',
      onConfirm = function() T.go('menu') end })
    T.button(0, -100, 260, 58, '回到主菜单', function() T.go('menu') end, { name = 'hit_placeholder_btn' })
    T.screen.key = function(a)
      if a == 'back' or a == 'confirm' then T.go('menu') end
    end
  end
end

placeholder('map', '霜原', '选择关卡')
placeholder('prepare', '出战准备', '队伍与装备')
placeholder('battle', '战斗', '霜原之上')
placeholder('result', '结算', '挑战结果')
placeholder('growth', '养成', '甘雨')
placeholder('codex', '图鉴', '霜华纪事')
placeholder('settings', '设置', '声音与画面')
placeholder('credits', '制作名单', '霜华纪制作组')

T.openHelp = T.openHelp or function()
  T.openOverlay('help', function(base)
    T.overlayPanel(720, 440, '玩法说明', '霜华纪 · 基础操作')
    T.item({ x = 0, y = -160, w = 180, h = 44, name = 'hit_help_close',
      onConfirm = function() T.closeOverlay() end })
    T.button(0, -160, 180, 44, '知道了', function() T.closeOverlay() end, { name = 'hit_help_ok' })
  end, { pausesGame = true, defaultFocus = 1, key = function(a)
    if a == 'back' or a == 'confirm' then T.closeOverlay() end
  end })
end
T.openConfirm = T.openConfirm or function(title, desc, onYes)
  T.openOverlay('confirm', function(base)
    T.overlayPanel(520, 300, title, desc)
    T.button(-90, -90, 130, 44, '取消', function() T.closeOverlay() end, { kind = 'secondary', name = 'hit_confirm_cancel' })
    T.button(90, -90, 130, 44, '确定', function() T.closeOverlay(); onYes() end, { name = 'hit_confirm_ok' })
  end, { pausesGame = true })
end
T.openPause = T.openPause or function() end
