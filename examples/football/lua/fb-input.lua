--[[==========================================================================
fb-input.lua v2 —— 真实足球 v3 · 客户端 Lua（HUD 面板 + 按键 → 服务器信号）
职责三件：
  ①HUD 排版：11 个 client-textbox 的字号/颜色/对齐/文案全部在运行时设
    （.gil 只管控件存在与初始位置尺寸；client-textbox 的文案/字号 CLI 改不了）
  ②本地计时：hud_timer 从 OnStart 起累计，按秒刷新
  ③按键 → 服务器信号 fb_input(key:int, state:int)，同时点亮横幅与状态行
【数据边界】比分写 hud_score，来源两路（都在 pcall 里，缺就不生效）：
  a) 全局自定义变量 fb_score_a / fb_score_b（Enum.CustomVariableEntityType.PlayerSelf）
     —— 服务端图「设置自定义变量」写玩家变量后，变化回调即刷新（待真机验证）
  b) 外部调用 setScore(a, b)（等通道接上后由事件驱动）
【真机事实】AddKeyEventListener 收 Enum.KeyEventType 枚举；Lua 无 try/catch，
  一句抛错整段中断 ⇒ 全部 pcall + 带名日志；写文本 = 字段赋值 c.text（无 SetText）；
  字号/颜色/对齐同为字段赋值（真机形态见 workspace/hmlt-qixia 霜华纪，已跑通）。
【文字判据】框高 ≥ 字号×1.45+4 —— 本文件只调字号不改尺寸，尺寸表见 design/HUD-v1.md。
==========================================================================]]

local SIGNAL = 'fb_input'

-- ARGB 整数色（真机形态：a*16777216 + r*65536 + g*256 + b）
local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
local COL = {
  gold  = C(255, 232, 200, 138),  -- 标题描金
  white = C(255, 255, 253, 248),  -- 比分主字
  gray  = C(255, 185, 195, 212),  -- 计时/状态弱字
  skill = C(255, 226, 233, 244),  -- 技能条常规
  hot   = C(255, 127, 207, 106),  -- 横幅/触发强调（草绿）
  warm  = C(255, 255, 200, 120)   -- 进球提示
}

-- id=发给服务端的 keyId；names=候选枚举名（按序试）；line=HUD 文案
local KEYS = {
  { id = 1, names = { 'KeyboardNormalAttackKeyDown',    'KeyboardCraftspersonKey1Down' }, line = '① 推射 / 抢断' },
  { id = 2, names = { 'KeyboardCharacterSkill1KeyDown', 'KeyboardCraftspersonKey2Down' }, line = '② 抽射 / 解围' },
  { id = 3, names = { 'KeyboardJumpKeyDown',            'KeyboardCraftspersonKey3Down' }, line = '③ 吊射 / 停球' },
  { id = 4, names = { 'KeyboardSprintKeyDown',          'KeyboardCraftspersonKey4Down' }, line = '④ 短传（地滚）' },
  { id = 5, names = { 'KeyboardInteractKeyDown',        'KeyboardCraftspersonKey5Down' }, line = '⑤ 弧线球' },
  { id = 6, names = { 'KeyboardDropKeyDown',            'KeyboardCraftspersonKey6Down' }, line = '⑥ 球放回正前' }
}

-- 控件名 → 字号/颜色（文案在 setStatic / 事件里写）
local STYLE = {
  title = { name = 'hud_title', fs = 24, color = COL.gold },
  score = { name = 'hud_score', fs = 46, color = COL.white },
  timer = { name = 'hud_timer', fs = 22, color = COL.gray },
  toast = { name = 'hud_toast', fs = 40, color = COL.hot },
  state = { name = 'hud_state', fs = 24, color = COL.gray },
  k1 = { name = 'hud_k1', fs = 20, color = COL.skill },
  k2 = { name = 'hud_k2', fs = 20, color = COL.skill },
  k3 = { name = 'hud_k3', fs = 20, color = COL.skill },
  k4 = { name = 'hud_k4', fs = 20, color = COL.skill },
  k5 = { name = 'hud_k5', fs = 20, color = COL.skill },
  k6 = { name = 'hud_k6', fs = 20, color = COL.skill }
}

local SLOTS = { 'k1', 'k2', 'k3', 'k4', 'k5', 'k6' }

local ref = {}          -- 控件名 → 控件对象
local missing = {}      -- 取不到的控件名（只报一次）
local G = {
  t = 0,                -- 本局累计秒（OnUpdate 累加）
  sec = -1,             -- 上次刷新的整秒
  toastT = 0,           -- 横幅剩余秒
  scoreA = 0,
  scoreB = 0,
  lastLine = '',
  globals = 0
}

local function log(msg) print('[fb-in] ' .. tostring(msg)) end

local function send(keyId, state)
  local ok, err = pcall(function()
    local sig = game.ServerSignal(SIGNAL)
    if sig == nil then error('game.ServerSignal(' .. SIGNAL .. ') returned nil') end
    sig:AddInt(keyId)
    sig:AddInt(state)
    sig:SendSignal()
  end)
  if not ok then log('pcall fail err send ' .. tostring(err)) end
  return ok
end

-- 宿主 = 容器节点；子控件直接挂在它下面（真机跑通形态）
local function host()
  local ok, obj = pcall(function() return script.object end)
  if not ok or obj == nil then return nil end
  return obj
end

local function getCtl(name)
  if ref[name] ~= nil then return ref[name] end
  local h = host()
  if h == nil then
    if not missing[name] then log('err host nil ' .. name); missing[name] = true end
    return nil
  end
  local ok, child = pcall(function() return h:GetChild(name) end)
  if ok and child ~= nil then ref[name] = child; return child end
  if not missing[name] then log('hud-miss ' .. name); missing[name] = true end
  return nil
end

local function setText(name, value)
  local c = getCtl(name)
  if c == nil then return end
  local ok, err = pcall(function() c.text = value end)
  if not ok then log('pcall fail text ' .. name .. ' ' .. tostring(err)) end
end

local function setColor(name, color)
  local c = getCtl(name)
  if c == nil then return end
  local ok, err = pcall(function() c.fontColor = color end)
  if not ok then log('pcall fail color ' .. name .. ' ' .. tostring(err)) end
end

local function setStyle(name, fs, color)
  local c = getCtl(name)
  if c == nil then return end
  -- 每条属性单独 pcall：一条失败不挡其余（真机属性名/类型按版本有差异）
  if fs ~= nil then
    local ok, err = pcall(function() c.fontSize = fs end)
    if not ok then log('pcall fail fontSize ' .. name .. ' ' .. tostring(err)) end
  end
  if color ~= nil then
    local ok, err = pcall(function() c.fontColor = color end)
    if not ok then log('pcall fail fontColor ' .. name .. ' ' .. tostring(err)) end
  end
  -- 真机：对齐字段收字符串（霜华纪实测）；个别版本要枚举，失败只记日志
  local okh, errh = pcall(function() c.horizontalAlignment = 'Middle' end)
  if not okh then log('pcall fail alignH ' .. name .. ' ' .. tostring(errh)) end
  local okv, errv = pcall(function() c.verticalAlignment = 'Middle' end)
  if not okv then log('pcall fail alignV ' .. name .. ' ' .. tostring(errv)) end
end

local function two(n)
  if n < 10 then return '0' .. tostring(n) end
  return tostring(n)
end

local function fmtClock(sec)
  local s = math.floor(sec)
  return two(math.floor(s / 60)) .. ':' .. two(s % 60)
end

local function renderScore()
  setText(STYLE.score.name, tostring(G.scoreA) .. ' : ' .. tostring(G.scoreB))
end

local function renderTimer()
  setText(STYLE.timer.name, fmtClock(G.t))
end

-- 横幅：显示 text 共 dur 秒；空串 = 隐藏（不依赖 SetVisible，真机该 API 不可靠）
local function showToast(text, dur, color)
  setText(STYLE.toast.name, text or '')
  G.toastT = dur or 1.2
  if color ~= nil then setColor(STYLE.toast.name, color) end
end

-- 对外：setScore(a, b) 由进球事件调用；也可被后续通道直接调
function setScore(a, b)
  G.scoreA = math.floor(tonumber(a) or 0)
  G.scoreB = math.floor(tonumber(b) or 0)
  renderScore()
  showToast('进球！' .. tostring(G.scoreA) .. ' : ' .. tostring(G.scoreB), 2.5, COL.warm)
end

local function setState(line)
  if line == G.lastLine then return end
  G.lastLine = line
  setText(STYLE.state.name, line)
end

-- 全局自定义变量读取（服务端「设置自定义变量」写玩家变量 → 这里刷新）
local function readGlobal(name)
  local ok, v = pcall(function()
    local et = Enum and Enum.CustomVariableEntityType and Enum.CustomVariableEntityType.PlayerSelf
    if et == nil then return nil end
    return game.GetGlobalCustomVariableValue(et, name)
  end)
  if ok then return v end
  return nil
end

local function applyGlobals()
  local a = readGlobal('fb_score_a')
  local b = readGlobal('fb_score_b')
  if type(a) == 'number' and type(b) == 'number' then
    a = math.floor(a)
    b = math.floor(b)
    if a ~= G.scoreA or b ~= G.scoreB then
      G.scoreA = a
      G.scoreB = b
      renderScore()
    end
  end
end

local function listenGlobals()
  local et = Enum and Enum.CustomVariableEntityType and Enum.CustomVariableEntityType.PlayerSelf
  if et == nil then log('globals unavailable (no enum)'); return end
  local list = { 'fb_score_a', 'fb_score_b' }
  for _, name in ipairs(list) do
    local ok, err = pcall(function()
      script:RegisterCustomVariableChangedHandler(et, name, function() applyGlobals() end)
    end)
    if ok then G.globals = G.globals + 1 else log('globals fail ' .. name .. ' ' .. tostring(err)) end
  end
  log('globals listen n=' .. tostring(G.globals))
end

local function setStatic()
  setText(STYLE.title.name, '⚽ 千星足球 · 技能演练')
  for i, slot in ipairs(SLOTS) do
    setText(STYLE[slot].name, KEYS[i].line)
  end
  renderScore()
  renderTimer()
  setText(STYLE.toast.name, '')
  setState('技能演练 · 按 ①~⑥ 触发')
end

local function applyStyles()
  for _, s in pairs(STYLE) do setStyle(s.name, s.fs, s.color) end
end

local function makeHandler(entry)
  return function()
    log('key ' .. tostring(entry.id))
    setState(entry.line .. ' · 已触发')
    showToast(entry.line, 1.2, COL.hot)
    send(entry.id, 1)
    return true
  end
end

local function listen(entry)
  local handler = makeHandler(entry)
  local h = host()
  if h == nil then
    log('err host ' .. tostring(h) .. ' (key ' .. tostring(entry.id) .. ')')
    return false
  end
  for _, enumName in ipairs(entry.names) do
    local ok, err = pcall(function()
      local ev = Enum.KeyEventType[enumName]
      if ev == nil then error('Enum.KeyEventType.' .. enumName .. ' is nil') end
      h:AddKeyEventListener(ev, handler)
    end)
    if ok then log('listen ' .. enumName .. ' via enum'); return true end
    local ok2 = pcall(function() h:AddKeyEventListener(enumName, handler) end)
    if ok2 then log('listen ' .. enumName .. ' via string'); return true end
    log('miss ' .. enumName .. ' enum=' .. tostring(err))
  end
  log('err listen key ' .. tostring(entry.id) .. ' (all names failed)')
  return false
end

function OnInit()
end

function OnStart()
  log('onstart v2')
  applyStyles()
  setStatic()
  listenGlobals()
  applyGlobals()
  send(0, 0)                      -- 心跳：证明整链通
  local n = 0
  for _, k in ipairs(KEYS) do if listen(k) then n = n + 1 end end
  log('listen ok ' .. tostring(n) .. '/' .. tostring(#KEYS))
end

function OnUpdate(dt)
  local step = tonumber(dt) or 0
  G.t = G.t + step
  local s = math.floor(G.t)
  if s ~= G.sec then
    G.sec = s
    renderTimer()
  end
  if G.toastT > 0 then
    G.toastT = G.toastT - step
    if G.toastT <= 0 then
      G.toastT = 0
      setText(STYLE.toast.name, '')
    end
  end
end

function OnDestroy()
end
