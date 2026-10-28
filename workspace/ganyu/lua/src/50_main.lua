-- ============================================================================
-- 入口：OnStart / OnUpdate / 键位映射
-- 键位实证：Enum.KeyboardKeyCode = CraftspersonKey1..43 + 具名键（见 D137）
-- ============================================================================
T = T or {}

T.keyMap = {
  KeyboardCraftspersonKey36Down = 'up', KeyboardMoveForwardKeyDown = 'up',
  KeyboardCraftspersonKey37Down = 'down', KeyboardMoveBackwardKeyDown = 'down',
  KeyboardCraftspersonKey38Down = 'left', KeyboardMoveLeftKeyDown = 'left',
  KeyboardCraftspersonKey39Down = 'right', KeyboardMoveRightKeyDown = 'right',
  KeyboardJumpKeyDown = 'confirm', KeyboardInteractKeyDown = 'confirm',
  KeyboardCharacterSkill2KeyDown = 'back', KeyboardCraftspersonKey42Down = 'back',
  KeyboardCraftspersonKey15Down = 'help',
  KeyboardNormalAttackKeyDown = 'attack',
  KeyboardDropKeyDown = 'skill',
  KeyboardCharacterSkill4KeyDown = 'debug',
}

T.onKey = function(action)
  if not action or T.transition then return end
  if T.lastAction == action and T.lastActionFrame == T.frame then return end
  T.lastAction, T.lastActionFrame = action, T.frame
  if action == 'debug' then
    T.log('debug hotkey, screen=' .. tostring(T.mode))
    return
  end
  if action == 'help' and not (T.overlay and T.overlay.name == 'help') then
    T.openHelp(T.mode)
    return
  end
  if T.screen and T.screen.key then T.screen.key(action); return end
  if T.overlay and T.overlay.key then T.overlay.key(action); return end
  if action == 'up' then T.moveFocus(0, 1)
  elseif action == 'down' then T.moveFocus(0, -1)
  elseif action == 'left' then T.moveFocus(-1, 0)
  elseif action == 'right' then T.moveFocus(1, 0)
  elseif action == 'confirm' then T.confirmFocus()
  end
end

T.probeOne = function(guid, kind)
  local ok, ctl = pcall(function() return game.InstantiateClientUIControl(guid, T.root) end)
  if not ok or not ctl then return false end
  local good = false
  if kind == 'prim' then
    good = pcall(function()
      ctl.imageColor = T.P.white
      ctl:SetImage(Enum.ImageSource.StaticReference, 100002)
      ctl:SetSizeDelta(10, 10)
    end)
  elseif kind == 'label' then
    good = pcall(function()
      ctl.text = '霜'
      ctl.fontSize = 20
      ctl.fontColor = T.P.ink
    end)
    if good then
      local isWindow = pcall(function() ctl.showScrollBar = false end)
      if isWindow then good = false end
    end
  elseif kind == 'hit' then
    local hasFn = pcall(function() return ctl.AddCursorEventListener end)
    local fn = hasFn and ctl.AddCursorEventListener or nil
    local isButton = pcall(function() ctl.interactable = true end)
    good = type(fn) == 'function' and not isButton
  end
  pcall(function() game.DestroyClientUIControl(ctl) end)
  return good
end
T.discoverTemplates = function()
  local missing = {}
  for _, k in ipairs({ 'prim', 'label', 'hit' }) do
    if not T.probeOne(T.tpl[k], k) then missing[#missing + 1] = k end
  end
  if #missing == 0 then return true end
  T.log('discover missing=' .. table.concat(missing, ','))
  local ranges = { { 1073741825, 1073742050 }, { 1073742100, 1073742150 } }
  for _, r in ipairs(ranges) do
    for guid = r[1], r[2] do
      for i = #missing, 1, -1 do
        local k = missing[i]
        if T.probeOne(guid, k) then
          T.tpl[k] = guid
          T.log('discover ' .. k .. '=' .. guid)
          table.remove(missing, i)
          if #missing == 0 then return true end
        end
      end
    end
  end
  T.log('discover incomplete: ' .. table.concat(missing, ','))
  return false
end
T.probeTemplates = function()
  local all = true
  for _, k in ipairs({ 'prim', 'label', 'hit' }) do
    local ok = T.probeOne(T.tpl[k], k)
    T.log('probe', k, tostring(T.tpl[k]), ok and 'ok' or 'FAIL')
    if not ok then all = false end
  end
  if not all then
    local ok = T.discoverTemplates()
    T.log('discover result=' .. tostring(ok))
  end
end

function OnStart()
  local ok, err = xpcall(function()
    T.root = script.object
    if not T.root then error('script.object is nil') end
    T.root.showCursor = true
    script:EnableUpdate(true)
    T.layout()
    T.log('onstart version=' .. T.VERSION .. ' build=' .. T.BUILD_ID)
    T.probeTemplates()
    T.setSeed(20261028)
    if type(Enum) == 'table' and Enum.KeyCode then T.keyEnum = Enum.KeyCode end
    for raw, action in pairs(T.keyMap) do
      local okKey, errKey
      if T.keyEnum and T.keyEnum[raw] ~= nil then
        okKey, errKey = pcall(function()
          T.root:AddKeyEventListener(T.keyEnum[raw], function() T.onKey(action) end)
        end)
      end
      if not okKey then
        okKey, errKey = pcall(function()
          T.root:AddKeyEventListener(raw, function() T.onKey(action) end)
        end)
      end
      if not okKey then T.warn('key fail ' .. raw .. ' :: ' .. tostring(errKey)) end
    end
    T.log('keys registered')
    T.build('boot')
  end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then
    T.warn('OnStart FAILED :: ' .. tostring(err))
    print(T.prefix .. ' OnStart FAILED :: ' .. tostring(err))
  end
end

function OnUpdate(dt)
  if not T.root then return end
  local ok, err = xpcall(function()
    T.tick(math.min(dt or 0.016, 0.05))
  end, function(e)
    return tostring(e) .. '\n' .. debug.traceback('', 2)
  end)
  if not ok then T.warn('OnUpdate FAILED :: ' .. tostring(err)) end
end
