--[[==========================================================================
fb-input.lua —— 真实足球 v3 · 客户端 Lua（HUD 文案 + 按键 → 服务器信号）
职责两件：①进图点亮 7 行 HUD（hud_title / hud_k1..k6），按键后标题改成「已触发：<键>」
          ②按键 → 服务器信号 fb_input(key:int, state:int)
【寻址】script.object 向上走到布局根 → root:GetChild(name)（tetris 已验证的寻址路）。
【真机事实】AddKeyEventListener 只收 Enum.KeyEventType 枚举值；Lua 无 try/catch，
  一句抛错整段中断 ⇒ 全部 pcall + 带名前缀日志；写文本=字段赋值 c.text（无 SetText）。
==========================================================================]]

local SIGNAL = 'fb_input'

-- id=发给服务端的 keyId；names=候选枚举名（按序试）；hint=HUD 上显示的物理键
local KEYS = {
  { id = 1, names = { 'KeyboardNormalAttackKeyDown',    'KeyboardCraftspersonKey1Down' }, hint = '普攻/1' },
  { id = 2, names = { 'KeyboardCharacterSkill1KeyDown', 'KeyboardCraftspersonKey2Down' }, hint = '技能1/2' },
  { id = 3, names = { 'KeyboardJumpKeyDown',            'KeyboardCraftspersonKey3Down' }, hint = '跳跃/3' },
  { id = 4, names = { 'KeyboardSprintKeyDown',          'KeyboardCraftspersonKey4Down' }, hint = '冲刺/4' },
  { id = 5, names = { 'KeyboardInteractKeyDown',        'KeyboardCraftspersonKey5Down' }, hint = '交互/5' },
  { id = 6, names = { 'KeyboardDropKeyDown',            'KeyboardCraftspersonKey6Down' }, hint = '丢弃/6' },
}

local function send(keyId, state)
  local ok, err = pcall(function()
    local sig = game.ServerSignal(SIGNAL)
    if sig == nil then error('game.ServerSignal(' .. SIGNAL .. ') returned nil') end
    sig:AddInt(keyId)
    sig:AddInt(state)
    sig:SendSignal()
  end)
  if not ok then print('[fb-in] err send ' .. tostring(err)) end
  return ok
end

local HUD = { title = 'hud_title', k1 = 'hud_k1', k2 = 'hud_k2', k3 = 'hud_k3', k4 = 'hud_k4', k5 = 'hud_k5', k6 = 'hud_k6' }
local hudRoot = nil
local hudRef = {}

local function resolveRoot()
  if hudRoot ~= nil then return hudRoot end
  local ok, obj = pcall(function() return script.object end)
  if not ok or obj == nil then print('[fb-in] err host nil') return nil end
  local cur = obj
  for _ = 1, 10 do
    local okp, parent = pcall(function() return cur:GetParent() end)
    if not okp or parent == nil then break end
    cur = parent
  end
  hudRoot = cur
  return hudRoot
end

local function getCtl(name)
  if hudRef[name] ~= nil then return hudRef[name] end
  local root = resolveRoot()
  if root == nil then return nil end
  local ok, child = pcall(function() return root:GetChild(name) end)
  if ok and child ~= nil then hudRef[name] = child return child end
  print('[fb-in] hud-miss ' .. tostring(name))
  return nil
end

local function setText(name, value)
  local c = getCtl(name)
  if c == nil then return end
  local ok, err = pcall(function() c.text = value end)
  if not ok then print('[fb-in] hud-err ' .. tostring(name) .. ' ' .. tostring(err)) end
end

local function setupHud()
  setText(HUD.title, '⚽ P0 技能 · 有球/无球双态')
  setText(HUD.k1, '【普攻/1】有球推射 · 无球抢断')
  setText(HUD.k2, '【技能1/2】有球抽射(侧旋) · 无球解围')
  setText(HUD.k3, '【跳跃/3】有球吊射 · 无球停球')
  setText(HUD.k4, '【冲刺/4】短传（地滚）')
  setText(HUD.k5, '【交互/5】弧线球（左右交替）')
  setText(HUD.k6, '【丢弃/6】把球放回你正前方')
  print('[fb-in] hud-ok')
end

local function setStatus(hint)
  setText(HUD.title, '⚽ 已触发：' .. tostring(hint))
end

local function makeHandler(hint, id)
  return function()
    print('[fb-in] key ' .. tostring(id))
    setStatus(hint)
    send(id, 1)
    return true
  end
end

local function listen(entry)
  local handler = makeHandler(entry.hint, entry.id)
  local hostOk, host = pcall(function() return script.object end)
  if not hostOk or host == nil then
    print('[fb-in] err host ' .. tostring(host) .. ' (key ' .. tostring(entry.id) .. ')')
    return false
  end
  for _, enumName in ipairs(entry.names) do
    local ok, err = pcall(function()
      local ev = Enum.KeyEventType[enumName]
      if ev == nil then error('Enum.KeyEventType.' .. enumName .. ' is nil') end
      host:AddKeyEventListener(ev, handler)
    end)
    if ok then print('[fb-in] listen ' .. enumName .. ' via enum') return true end
    local ok2 = pcall(function() host:AddKeyEventListener(enumName, handler) end)
    if ok2 then print('[fb-in] listen ' .. enumName .. ' via string') return true end
    print('[fb-in] miss ' .. enumName .. ' enum=' .. tostring(err))
  end
  print('[fb-in] err listen key ' .. tostring(entry.id) .. ' (all names failed)')
  return false
end

function OnInit()
end

function OnStart()
  print('[fb-in] onstart')
  setupHud()
  send(0, 0)
  for _, k in ipairs(KEYS) do listen(k) end
end

function OnUpdate(dt)
end

function OnDestroy()
end
