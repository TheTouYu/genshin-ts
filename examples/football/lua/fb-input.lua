-- 注册一个 Down 监听：候选枚举名逐个试（枚举优先、字符串回落），任何失败只打印不抛出。
local function listen(entry)
  local handler = makeHandler(entry.hint, entry.id)
  local hostOk, host = pcall(function() return script.object end)
  if not hostOk or host == nil then
    print('[fb-in] err host ' .. tostring(host) .. ' (key ' .. entry.id .. ')')
    return false
  end
  for _, enumName in ipairs(entry.names) do
    -- 路 1：枚举值（真机唯一可用形态）
    local ok, err = pcall(function()
      local ev = Enum.KeyEventType[enumName]
      if ev == nil then error('Enum.KeyEventType.' .. enumName .. ' is nil') end
      host:AddKeyEventListener(ev, handler)
    end)
    if ok then
      print('[fb-in] listen ' .. enumName .. ' via enum')
      return true
    end
    -- 路 2：字符串（模拟器形态；真机会抛 KeyEventType expected, got string）
    local ok2 = pcall(function() host:AddKeyEventListener(enumName, handler) end)
    if ok2 then
      print('[fb-in] listen ' .. enumName .. ' via string')
      return true
    end
    print('[fb-in] miss ' .. enumName .. ' enum=' .. tostring(err))
  end
  print('[fb-in] err listen key ' .. entry.id .. ' (all names failed)')
  return false
end

--[[==========================================================================
fb-input.lua —— 真实足球 v3 · 客户端 Lua 输入桥
----------------------------------------------------------------------------
【用途】
  挂在客户端「容器节点」（容器类控件）上，把玩家按键转成服务器信号
  fb_input(key:int, state:int)，服务端节点图据此驱动玩法。
  本文件只做「按键 → 信号」一件事，不含任何玩法逻辑。

【证据出处（真机 7.1 已验事实，D561）】
  * AddKeyEventListener 在真机**只接受 Enum.KeyEventType 枚举值**；传字符串抛
    「bad argument #2 ... KeyEventType expected, got string」。Lua 侧无异常护栏
    （pcall 之外没有 try/catch），一句抛错会中断整段 OnStart。
    ⇒ 本文件每个注册都：先试 Enum.KeyEventType['Keyboard<键名>Down']，pcall 失败
      再回落字符串形态；并打印实际走了哪条路（listen ... via enum|string）。
  * Enum.KeyEventType 成员 = 具体按键 × 相位，命名规律 Keyboard<键名>Down / Up。
  * game.ServerSignal 在真机是**函数**（不是表）：game.ServerSignal('名') 返回可供
    配置的信号对象，再依次 ServerSignal:AddInt(v) / :SendSignal()。
    AddInt 返回 nil ⇒ **不能链式**，必须一行一句。
  * 客户端 Lua 沙箱裁剪：无 io/package/coroutine，print 是唯一可靠出口（没有可写的
    日志文件），所以「整链是否通」靠 OnStart 的心跳信号在服务器侧体现。

【信号契约（与服务端图对齐，参数顺序 = AddInt 顺序）】
  fb_input(key:int, state:int)
    key   : 1 NormalAttack / 2 CharacterSkill1 / 3 Jump（第一轮只这三个）
            0 = 心跳（OnStart 发一次，state=0），证明脚本已跑 + 信号链通
    state : 1 = 按下（本桥只注册 Down 相位）；0 = 心跳/复位

【打印纪律】
  只在 OnStart 与按键回调里 print；OnUpdate 属高频路径，零 print、零工作
  （按键事件驱动，不需要逐帧轮询）。

【挂载与登记】
  登记：gsts assets:scripts register --name fb-input --path fb-input.lua --source-file <本文件>
  挂载：gsts assets:scripts mount --host <容器节点 guid> --script <fb-input guid>
  信号：gsts assets:signals register --name fb_input --param key:int --param state:int
        （缺「发送客户端信号」那条 composite 时游戏会报「信号有问题」）
=========================================================================]]

local SIGNAL = 'fb_input'


-- ===== HUD：证明脚本在跑、并把键位说清楚（用户 2026-10-27：「一个按钮都看不到」）=====
-- 控件名必须与地图里 4 个 client-textbox 一致（1073741847..850，挂在容器节点 1073741846 下）：
--   hud_title / hud_k1..hud_k5（控件 1073741847..852）
-- 写文本=字段赋值（官方运行时 textbox 无 SetText，D229 实证），全部 pcall。
local HUD = { title = 'hud_title', k1 = 'hud_k1', k2 = 'hud_k2', k3 = 'hud_k3', k4 = 'hud_k4', k5 = 'hud_k5' }
local hudRef = {}

local function getCtl(name)
  if hudRef[name] ~= nil then return hudRef[name] end
  local ok, child = pcall(function() return script.object:GetChild(name) end)
  if ok and child ~= nil then
    hudRef[name] = child
    return child
  end
  print('[fb-in] hud-miss ' .. name)
  return nil
end

local function setText(name, value)
  local c = getCtl(name)
  if c == nil then return end
  local ok, err = pcall(function() c.text = value end)
  if not ok then print('[fb-in] hud-err ' .. name .. ' ' .. tostring(err)) end
end

local function setupHud()
  setText(HUD.title, '⚽ P0 技能 · 有球/无球双态')
  setText(HUD.k1, '【普攻】有球 推射 / 无球 抢断')
  setText(HUD.k2, '【技能1】有球 抽射(侧旋) / 无球 解围')
  setText(HUD.k3, '【跳跃】有球 吊射 / 无球 停球')
  setText(HUD.k4, '【冲刺】有球 短传（地滚）')
  setText(HUD.k5, '【交互】有球 弧线球（左右交替）')
  print('[fb-in] hud-ok')
end

local function setStatus(label)
  setText(HUD.title, '⚽ 已触发：' .. label)
end

-- 键表：id = 发给服务端的 keyId（1..5），names = 候选枚举名，hint = HUD 上给玩家看的物理键。
local KEYS = {
  -- names = 候选枚举名（按顺序试，第一个成功的胜出）。动作键是角色键（可能被游戏本体吃掉），
  -- 工匠键 CraftspersonKey1..5 是千星沙箱自己的可编程键，一定存在 ⇒ 做成两手准备。
  { id = 1, names = { 'KeyboardNormalAttackKeyDown',    'KeyboardCraftspersonKey1Down' }, hint = '普攻/鼠左 或 1' },
  { id = 2, names = { 'KeyboardCharacterSkill1KeyDown', 'KeyboardCraftspersonKey2Down' }, hint = '技能1/E 或 2' },
  { id = 3, names = { 'KeyboardJumpKeyDown',            'KeyboardCraftspersonKey3Down' }, hint = '跳跃/空格 或 3' },
  { id = 4, names = { 'KeyboardSprintKeyDown',          'KeyboardCraftspersonKey4Down' }, hint = '冲刺/Shift 或 4' },
  { id = 5, names = { 'KeyboardInteractKeyDown',        'KeyboardCraftspersonKey5Down' }, hint = '交互/F 或 5' },
}

-- 发一条 fb_input(keyId, state)。整段 pcall：信号名没登记/信号对象形态变化都不许中断调用方。
local function send(keyId, state)
  local ok, err = pcall(function()
    local sig = game.ServerSignal(SIGNAL)
    if sig == nil then error('game.ServerSignal(' .. SIGNAL .. ') returned nil') end
    sig:AddInt(keyId)   -- 不能链式：AddInt 返回 nil
    sig:AddInt(state)
    sig:SendSignal()
  end)
  if not ok then
    print('[fb-in] err send ' .. tostring(err))
  end
  return ok
end

-- 每个键一个回调闭包：按下才打印（高频路径本来就只有玩家真按的时候才走）。
local function makeHandler(hint, id)
  return function()
    print('[fb-in] key ' .. tostring(id))
    setStatus(hint)
    send(id, 1)
    return true    -- 吃掉事件，不继续向更内层控件传递
  end
end

-- 注册一个 Down 监听：枚举优先、字符串回落，两条路都 pcall；任何失败只打印不抛出。
local function listen(label, id)
  local enumName = 'Keyboard' .. label .. 'Down'
  local handler = makeHandler(label, id)

  local hostOk, host = pcall(function() return script.object end)
  if not hostOk or host == nil then
    print('[fb-in] err host ' .. tostring(host) .. ' (key ' .. label .. ')')
    return false
  end

  -- 路 1：枚举值（真机唯一可用形态）
  local ok, err = pcall(function()
    local ev = Enum.KeyEventType[enumName]
    if ev == nil then error('Enum.KeyEventType.' .. enumName .. ' is nil') end
    host:AddKeyEventListener(ev, handler)
  end)
  if ok then
    print('[fb-in] listen ' .. label .. ' via enum')
    return true
  end

  -- 路 2：字符串（模拟器形态；真机会抛 KeyEventType expected, got string）
  local ok2, err2 = pcall(function()
    host:AddKeyEventListener(enumName, handler)
  end)
  if ok2 then
    print('[fb-in] listen ' .. label .. ' via string')
    return true
  end

  print('[fb-in] err listen ' .. label .. ' enum: ' .. tostring(err) .. ' / string: ' .. tostring(err2))
  return false
end

-- ===== 生命周期 =====
function OnInit()
end

function OnStart()
  print('[fb-in] onstart')
  setupHud()   -- 先点亮 HUD：这一步成功即证明脚本真的在跑（比信号更早、更直观）
  -- 心跳：先证明「脚本确实在跑 + fb_input 信号链通」，再谈按键（顺序即诊断分层）
  send(0, 0)
  -- 逐个注册：任一键失败都不影响后续（pcall 在 listen 内部逐条兜住）
  for _, k in ipairs(KEYS) do
    listen(k)
  end
end

-- 按键事件驱动，逐帧不做任何事（高频路径零 print、零计算）。
-- 注意：本文件**不调用** script:EnableUpdate(true)，因此即使引擎派发 OnUpdate 也没有逐帧工作；
-- 这是刻意的——本桥只靠事件，不需要帧循环（将来若要轮询，先启用 EnableUpdate 并重估负载）。
function OnUpdate(dt)
end

function OnDestroy()
end
