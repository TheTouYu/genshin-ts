--[[==========================================================================
 tetris/input_map.lua —— 键位**唯一真源** + 一次注册 + 栈式分发
 ----------------------------------------------------------------------------
 为什么要有这个文件（重构前实测：键位有 5 份真源、同一个键会被注册两次）：
   · 头注释键位表（main.lua:18-29）
   · config.NUM.KEYMAP（config.lua:142-153）
   · config.NUM.HOLD_KEY（config.lua:59，与 KEYMAP 同键、各自成"源"）
   · config.NUM.PAD.KEYS + padBind 的 bases 循环（config.lua:818-831 / main.lua:5698-5710）
   · 手机 PHONE_KEY（main.lua:6300-6304）
 后果不是"不好看"，而是**输入类 bug 不可复现**：哪个键先被注册、就被先派发；
 同一个键有两个监听时行为取决于注册顺序（main.lua:6473-6477 的 43 键兜底循环
 就把 11/12/13/14/16/30 又注册了一遍，与技能键/Hold 键各自的动作**并存**）。

 本文件的契约（docs/ARCH.md §3：模块不 require 彼此、依赖注入、不 print）：
   M.ACTIONS[action] = { 键名… }      —— 一张表就是全部键位；键盘与手柄同表（同名动作）
   M.UPKEYS[action]  = { 键名… }      —— 松开事件（DAS 需要；技能长按需要）
   M.FALLBACK                         —— 「任意键开始」的兜底池（从 ACTIONS 自动排除）
   M.PROBE                            —— 手柄探针键（只打日志学真机键名，不产动作）
   M.PAD_UNBOUND                      —— 已知但**故意不注册**的键（写清理由，不许静默）
   M.RETIRED                          —— 收表时被退役的**重复注册点**（带来源行号）
   M.ALIAS                            —— 唯一允许的"一键多动作"，必须 alias=true + 理由
   M.audit(actions)                   —— 纯函数体检（A1..A8），tests-lua/input_map_test.lua 跑它
   M.new{ platform=P, log=fn }        —— 实例：bindAll / bindOne / names / actionOf / press
   实例的栈式分发：push(name, handler) / pop(name) / dispatch(action, key, phase)
     handler 返回 true = 已消费，事件不再往下传（说明页开着时"先关页、不动作"就是这么表达的，
     不用再在每个回调开头写 if helpOpen then return end）。

 约束：Lua 5.3；不 require 任何 tetris 模块；不 print（日志只走注入的 log）；
       不调用引擎 API（只经 platform.lua 的 bindKey/pressKey）。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/input_map_test.lua
 ========================================================================]]

local M = {}

-- ===== ① 动作表（唯一真源）=====
-- 动作名 = main.lua 既有语义（doPlay 的 6 个玩家动作字面量原样保留；其它按屏动作取既有名字）。
-- 键名两种命名空间：Keyboard*（键鼠）与 Controller*（手柄）——同一张表，动作同名。
M.ACTIONS = {
  -- —— 玩家 6 动作（名字与 main.lua doPlay(action) 分支一字不差）——
  left  = { 'KeyboardCraftspersonKey38Down', 'KeyboardMoveLeftKeyDown',
            'ControllerCraftspersonKey1Down' },
  right = { 'KeyboardCraftspersonKey39Down', 'KeyboardMoveRightKeyDown',
            'ControllerCraftspersonKey2Down' },
  rot   = { 'KeyboardCraftspersonKey36Down', 'KeyboardMoveForwardKeyDown',
            'ControllerJumpKeyDown', 'ControllerCraftspersonKey5Down' },
  soft  = { 'KeyboardCraftspersonKey37Down', 'KeyboardMoveBackwardKeyDown',
            'ControllerCharacterSkill1KeyDown', 'ControllerCraftspersonKey7Down' },
  -- hard 含 pvp 的 P2 键 X（Drop）；hold 含 P2 键 F（Interact）——原本是两条补丁式 listen
  hard  = { 'KeyboardJumpKeyDown', 'KeyboardDropKeyDown',
            'ControllerNormalAttackKeyDown', 'ControllerCraftspersonKey6Down' },
  hold  = { 'KeyboardCraftspersonKey14Down', 'KeyboardInteractKeyDown',
            'ControllerCharacterSkill2KeyDown', 'ControllerCraftspersonKey8Down' },

  -- —— 屏级动作 ——
  restart    = { 'KeyboardCharacterSkill3KeyDown' },   -- R：重开 / 回菜单（按模式与阶段）
  settle     = { 'KeyboardCharacterSkill2KeyDown' },   -- Q：结算明细（信号通道优先）
  help       = { 'KeyboardCraftspersonKey15Down',      -- H：说明页开关（真键）
                 'KeyboardCharacterSkill1KeyDown',     -- E：同义别名键（键位表已列）
                 'ControllerMenuBackKeyDown', 'ControllerCharacterSkill3KeyDown' },
  debugFill  = { 'KeyboardCharacterSkill4KeyDown' },   -- T：调试填最底两行（用例用）
  back       = { 'KeyboardCraftspersonKey22Down' },    -- V：结算后回主页
  level      = { 'KeyboardSwitchToWalkOrRunKeyDown' }, -- 调试切 AI 难度档
  mode1      = { 'KeyboardCraftspersonKey1Down' },
  mode2      = { 'KeyboardCraftspersonKey2Down' },
  mode3      = { 'KeyboardCraftspersonKey3Down' },
  mode4      = { 'KeyboardCraftspersonKey4Down' },
  confirm    = { 'ControllerMenuConfirmKeyDown', 'ControllerCraftspersonKey9Down' },
  roster     = { 'KeyboardCraftspersonKey16Down' },    -- 角色档案开/关
  skill1     = { 'KeyboardCraftspersonKey12Down' },    -- Z
  skill2     = { 'KeyboardCraftspersonKey11Down' },    -- U
  skillSwitch = { 'KeyboardCraftspersonKey13Down' },   -- Y：切台前角色
  debugUnlock = { 'KeyboardCraftspersonKey30Down' },   -- 调试：解锁全部角色
}

-- ===== ② 松开事件（DAS 清方向 / 刻晴长按测量）=====
M.UPKEYS = {
  left  = { 'KeyboardCraftspersonKey38Up', 'KeyboardMoveLeftKeyUp' },
  right = { 'KeyboardCraftspersonKey39Up', 'KeyboardMoveRightKeyUp' },
  skill1 = { 'KeyboardCraftspersonKey12Up' },   -- 刻晴「长按·跨地形」= 松手施放
}

-- ===== ③ 43 键兜底池（入场态「任意键开始」）=====
-- 真源只在 ACTIONS/UPKEYS 里；池子由 fallbackKeys() 从 ACTIONS 自动排除 ⇒ 不可能再重复注册。
M.FALLBACK = {
  action = 'anyKey',
  prefix = 'KeyboardCraftspersonKey',
  suffix = 'Down',
  first = 1,
  last = 43,
}

-- ===== ④ 手柄探针（只学键名，不产动作）=====
-- 官方手柄键位由编辑器「按键映射-手柄」决定，Lua 侧拿不到映射表 ⇒ 先注册一批探针，
-- 玩家按一遍，日志里的 `pad ev ControllerXxxKeyDown` 就是真名（config.lua:810 注释同口径）。
M.PROBE = {
  'ControllerCraftspersonKey3Down', 'ControllerCraftspersonKey4Down',
  'ControllerCraftspersonKey10Down', 'ControllerCraftspersonKey11Down',
  'ControllerCraftspersonKey12Down', 'ControllerCraftspersonKey13Down',
  'ControllerCraftspersonKey14Down',
  'ControllerSprintKeyDown', 'ControllerInteractKeyDown', 'ControllerCharacterSkill4KeyDown',
}

-- ===== ⑤ 已知但不注册的键（写清理由，不静默丢）=====
-- 这两个名字在 config.NUM.PAD.KEYS 里被映射成 left/right，但 padBind 的 bases 只生成
-- CraftspersonKey1..14 + PROBE_NAMED ⇒ **它们从来没被注册过**（死映射）。
-- 收进表即会新增 2 条监听，而 tests/48 断言日志 `pad bind n=24` 精确值 ⇒ 默认不注册；
-- 要启用把 bindAll 的 opts.padMoveKeys=true，并把 tests/48 的期望改成 26。
M.PAD_UNBOUND = {
  { key = 'ControllerMoveLeftKeyDown', action = 'left',
    reason = 'bases 未覆盖（main.lua:5698-5700）⇒ 历史死映射；启用需同步 tests/48 的 pad bind n=' },
  { key = 'ControllerMoveRightKeyDown', action = 'right',
    reason = '同上' },
}

-- ===== ⑥ 退役的重复注册点（收表时被合并的监听）=====
-- main.lua:6473-6477 的兜底循环把 mapped 之外的全部 CraftspersonKeyN 注册成 anyKeyStart；
-- 但 11/12/13/14/16/30 在 6402-6442 已有真动作 ⇒ 同一个键两个监听、行为取决于顺序。
-- 这些键**动作保留在 ACTIONS**，退役的是「兜底那一份注册」。兜底语义不丢：
-- 六个动作的执行体自己都调 startIfWaiting()（main.lua:6053/6387），开局能力仍在。
M.RETIRED = {
  { key = 'KeyboardCraftspersonKey11Down', action = 'skill2', from = 6475,
    reason = '兜底 anyKeyStart 与 skill2 重复注册；skill2 执行体自带 startIfWaiting' },
  { key = 'KeyboardCraftspersonKey12Down', action = 'skill1', from = 6475,
    reason = '兜底与 skill1(z) 重复；同上' },
  { key = 'KeyboardCraftspersonKey13Down', action = 'skillSwitch', from = 6475,
    reason = '兜底与 skillSwitch(y) 重复；同上' },
  { key = 'KeyboardCraftspersonKey14Down', action = 'hold', from = 6475,
    reason = '兜底与 hold(g) 重复；act() 已调 startIfWaiting' },
  { key = 'KeyboardCraftspersonKey16Down', action = 'roster', from = 6475,
    reason = '兜底与 roster 重复；同上' },
  { key = 'KeyboardCraftspersonKey30Down', action = 'debugUnlock', from = 6475,
    reason = '兜底与 debugUnlock 重复；同上' },
}

-- ===== ⑦ 唯一允许的"一键多动作"=====
-- 空表是当前事实：收表后没有一键两动作。机制保留——出现即要在这里显式认领理由，
-- 否则 M.audit 报 A2（tests-lua/input_map_test.lua 会先造一个冲突证明闸门有效）。
M.ALIAS = {}

-- ===== ⑧ 触屏专属动作（没有对应键盘键；供 view_pad 与 main 的触屏派发共用）=====
M.TOUCH_ONLY = {
  helpPage = true,   -- 说明页翻页（触屏没有对应物理键）
}

-- ===== 工具函数 =====

-- 键名合法性（防手误：拼错的键名在真机只会打 listen fail，很难从日志里看出来）
-- 命名空间只有两个：Keyboard*（键鼠）/ Controller*（手柄）。键体形如 CraftspersonKey38
-- （字母+数字混排 ⇒ 不能用 ^(%a+) 抠名字，会把 'KeyboardCraftspersonKey' 当成命名空间）。
function M.validKey(name)
  if type(name) ~= 'string' or name == '' then return false, '键名必须是非空字符串' end
  local body
  if name:sub(1, 8) == 'Keyboard' then body = name:sub(9)
  elseif name:sub(1, 10) == 'Controller' then body = name:sub(11)
  else return false, '未知命名空间（只认 Keyboard*/Controller*）：' .. name end
  if body == '' then return false, '缺少键体：' .. name end
  if not body:match('^%u[%w_]*$') then return false, '键体应以大写字母开头且不含符号：' .. name end
  if not (body:match('Down$') or body:match('Up$')) then
    return false, '键名应以 Down/Up 结尾：' .. name
  end
  return true
end

-- 一个动作的全部键名（down；返回副本，调用方改不到真源）
function M.namesOf(actions, action)
  local list = (actions or M.ACTIONS)[action]
  if not list then return {} end
  local out = {}
  for i = 1, #list do out[i] = list[i] end
  return out
end

-- 动作表体检（纯函数）。返回 issues = { {code, msg, key?, action?}, ... }
function M.audit(actions, opts)
  actions = actions or M.ACTIONS
  opts = opts or {}
  local alias = opts.alias or M.ALIAS
  local issues = {}
  local function add(code, msg, extra)
    local it = { code = code, msg = msg }
    if extra then for k, v in pairs(extra) do it[k] = v end end
    issues[#issues + 1] = it
  end

  local owner = {}     -- key -> 第一个声明它的 action
  local actionsSorted = {}
  for a in pairs(actions) do actionsSorted[#actionsSorted + 1] = a end
  table.sort(actionsSorted)

  for _, a in ipairs(actionsSorted) do
    local list = actions[a]
    if type(list) ~= 'table' or #list == 0 then
      add('A1', '动作没有键名：' .. tostring(a), { action = a })
    else
      for i = 1, #list do
        local k = list[i]
        local okKey, why = M.validKey(k)
        if not okKey then
          add('A5', string.format('%s[%d] %s', a, i, why), { action = a, key = tostring(k) })
        else
          local prev = owner[k]
          if prev and prev ~= a then
            local al = alias[k]
            if not (al and al.alias == true) then
              add('A2', string.format('同一个键出现在两个动作：%s ∈ %s 与 %s（如属有意，在 M.ALIAS 标 alias=true 并写理由）',
                k, prev, a), { action = a, key = k })
            elseif not al.note or al.note == '' then
              add('A7', '别名条目缺 note（说不出为什么允许一键两动作）：' .. k, { key = k })
            end
          elseif not prev then
            owner[k] = a
          end
        end
      end
    end
  end

  -- 别名表自身的一致性：指向的键必须真实存在、且确实跨了两个动作
  for k, al in pairs(alias) do
    if al.alias ~= true then
      add('A7', 'M.ALIAS 条目必须 alias=true：' .. k, { key = k })
    end
    if not owner[k] then
      add('A7', 'M.ALIAS 指了一个不在表里的键：' .. k, { key = k })
    end
  end

  -- 与 UPKEYS / FALLBACK 的重叠
  for a, list in pairs(M.UPKEYS) do
    for i = 1, #list do
      if owner[list[i]] then
        add('A3', string.format('松开键 %s 同时被当成按下键（动作 %s）', list[i], owner[list[i]]),
          { action = a, key = list[i] })
      end
    end
  end
  local pool = M.fallbackPool(actions)
  local inPool = {}
  for i = 1, #pool do inPool[pool[i]] = true end
  for k in pairs(owner) do
    if inPool[k] then
      add('A4', '兜底池里混进了已有动作的键：' .. k, { key = k })
    end
  end

  -- 退役表一致性：退役的键必须真的在动作表里（否则是"删了动作还留着退役条"）
  for i = 1, #M.RETIRED do
    local r = M.RETIRED[i]
    if not r.reason or r.reason == '' then
      add('A6', 'RETIRED 条目缺 reason：' .. tostring(r.key), { key = r.key })
    end
    if not owner[r.key] then
      add('A6', 'RETIRED 的键已不在动作表里（退役条该删）：' .. tostring(r.key), { key = r.key })
    end
    if inPool[r.key] then
      add('A6', 'RETIRED 的键仍在兜底池里（没收干净）：' .. tostring(r.key), { key = r.key })
    end
  end

  return issues, actionsSorted
end

-- 兜底池 = prefix..i..suffix（i ∈ first..last）减去已被 ACTIONS/UPKEYS 认领的键
function M.fallbackPool(actions)
  actions = actions or M.ACTIONS
  local claimed = {}
  for _, list in pairs(actions) do
    for i = 1, #list do claimed[list[i]] = true end
  end
  for _, list in pairs(M.UPKEYS) do
    for i = 1, #list do claimed[list[i]] = true end
  end
  local F = M.FALLBACK
  local out = {}
  for i = F.first, F.last do
    local k = F.prefix .. i .. F.suffix
    if not claimed[k] then out[#out + 1] = k end
  end
  return out
end

-- 一个动作表里出现过的全部键名（down + up），去重后按字典序
function M.allKeys(actions)
  actions = actions or M.ACTIONS
  local seen, out = {}, {}
  local function add(k)
    if seen[k] then return end
    seen[k] = true
    out[#out + 1] = k
  end
  local names = {}
  for a in pairs(actions) do names[#names + 1] = a end
  table.sort(names)
  for _, a in ipairs(names) do
    for i = 1, #actions[a] do add(actions[a][i]) end
  end
  local upNames = {}
  for a in pairs(M.UPKEYS) do upNames[#upNames + 1] = a end
  table.sort(upNames)
  for _, a in ipairs(upNames) do
    for i = 1, #M.UPKEYS[a] do add(M.UPKEYS[a][i]) end
  end
  return out
end

-- 注册量统计（给报告/测试用：收表前 90 次注册 / 84 个不同键 / 6 个键注册两次）
function M.stats(actions)
  actions = actions or M.ACTIONS
  local keys = M.allKeys(actions)
  local pool = M.fallbackPool(actions)
  local nActions = 0
  for _ in pairs(actions) do nActions = nActions + 1 end
  return {
    actions = nActions,
    keys = #keys,
    fallback = #pool,
    probe = #M.PROBE,
    padUnbound = #M.PAD_UNBOUND,
    retired = #M.RETIRED,
  }
end

-- ===== 实例：注册 + 栈式分发 =====

-- 动作名排序（pairs 顺序不稳定 ⇒ 注册顺序与日志顺序必须可复现）
local function sortedNames(t)
  local out = {}
  for a in pairs(t or {}) do out[#out + 1] = a end
  table.sort(out)
  return out
end

M.new = function(spec)
  spec = spec or {}
  local P = spec.platform
  local log = spec.log or function() end
  local actions = spec.actions or M.ACTIONS
  local F = spec.fallback or M.FALLBACK

  local S = {
    bound = {},          -- key -> handler（同一键只登记一次）
    boundOrder = {},
    dupes = {},          -- 重复注册点（只是记账，不会再往引擎注册第二次）
    stack = {},          -- { {name=, handler=} ... } 栈顶在末尾
    dispatch = nil,
    unhandled = {},      -- action -> 次数（"注册了但没人消费"的证据）
    armed = false,
  }

  local I = { mock = P and P.mock == true, platform = P }

  function I:names(action) return M.namesOf(actions, action) end
  function I:upNames(action)
    local list = M.UPKEYS[action]
    if not list then return {} end
    local out = {}
    for i = 1, #list do out[i] = list[i] end
    return out
  end
  function I:actions() return actions end
  function I:stats() return M.stats(actions) end
  function I:audit(a) return M.audit(a or actions, { alias = M.ALIAS }) end
  function I:fallbackKeys() return M.fallbackPool(actions) end
  function I:dupes() return S.dupes end
  function I:boundKeys() return S.boundOrder end
  function I:unhandled() return S.unhandled end

  -- 键 → 动作反查（down/up 都能查；第二返回值 = 'down' | 'up'）
  function I:actionOf(keyName)
    for _, a in ipairs(sortedNames(actions)) do
      local list = actions[a]
      for i = 1, #list do
        if list[i] == keyName then return a, 'down' end
      end
    end
    for _, a in ipairs(sortedNames(M.UPKEYS)) do
      local list = M.UPKEYS[a]
      for i = 1, #list do
        if list[i] == keyName then return a, 'up' end
      end
    end
    return nil
  end

  -- ===== 栈式分发 =====
  function I:push(name, handler)
    if type(handler) ~= 'function' then error('input_map.push: handler 必须是函数') end
    self:pop(name)                       -- 同名只留一份（重复 push 不会堆栈）
    S.stack[#S.stack + 1] = { name = name, handler = handler }
    log('input push ' .. tostring(name) .. ' depth=' .. #S.stack)
    return self
  end

  function I:pop(name)
    for i = #S.stack, 1, -1 do
      if S.stack[i].name == name then
        table.remove(S.stack, i)
        log('input pop ' .. tostring(name) .. ' depth=' .. #S.stack)
        return true
      end
    end
    return false
  end

  function I:depth() return #S.stack end
  function I:top() return S.stack[#S.stack] and S.stack[#S.stack].name or nil end
  function I:clear() S.stack = {} return self end

  -- 从栈顶往下问：第一个返回 true 的 handler 消费掉本次事件。
  -- 全部不消费 ⇒ 记 unhandled（"注册了但没人用"的读数，别再靠读 13k 行猜）。
  function I:dispatch(action, keyName, phase)
    phase = phase or 'down'
    for i = #S.stack, 1, -1 do
      local h = S.stack[i].handler
      local ok, consumed = pcall(h, action, keyName, phase)
      if ok and consumed == true then return true, S.stack[i].name end
      if not ok then
        log('input handler error ' .. tostring(S.stack[i].name) .. ' :: ' .. tostring(consumed))
      end
    end
    if S.dispatch then
      local ok, consumed = pcall(S.dispatch, action, keyName, phase)
      if ok and consumed ~= false then return true, 'default' end
      if not ok then log('input default error :: ' .. tostring(consumed)) end
    end
    S.unhandled[action] = (S.unhandled[action] or 0) + 1
    return false, nil
  end

  function I:setDefault(fn)
    S.dispatch = fn
    return self
  end

  -- 注册一个键名（同键只登记一次；重复登记记账不重复绑）
  local function bind(name, action, phase)
    if not name then return false end
    if S.bound[name] then
      S.dupes[#S.dupes + 1] = { key = name, kept = S.bound[name].action,
        dropped = action, phase = phase }
      log('input dup ' .. name .. ' kept=' .. tostring(S.bound[name].action)
        .. ' dropped=' .. tostring(action))
      return false
    end
    local fn = function()
      local consumed = I:dispatch(action, name, phase)
      if not consumed then log('input no-consumer ' .. tostring(action) .. ' ' .. name) end
    end
    S.bound[name] = { action = action, phase = phase, fn = fn }
    S.boundOrder[#S.boundOrder + 1] = name
    if P and P.bindKey then
      local ok = P.bindKey(name, fn)
      if not ok then log('input bind fail ' .. name) return false end
    end
    return true
  end
  I._bind = bind

  -- 绑定一个动作的全部键（down + 可选 up）
  -- 兼容契约签名 bindOne(action, dispatch)：给了 dispatch 就登记成默认派发（栈仍是可选增强）
  function I:bindOne(action, dispatch, opts)
    if type(dispatch) == 'table' and opts == nil then opts, dispatch = dispatch, nil end
    opts = opts or {}
    if dispatch then self:setDefault(dispatch) end
    local n = 0
    for _, k in ipairs(self:names(action)) do
      if bind(k, action, 'down') then n = n + 1 end
    end
    if opts.up ~= false then
      for _, k in ipairs(self:upNames(action)) do
        if bind(k, action, 'up') then n = n + 1 end
      end
    end
    if n == 0 then log('input bindOne 空：' .. tostring(action)) end
    return n
  end

  -- 一次注册：每个键名只往引擎注册一次（这是本文件的核心交付）
  -- opts = { fallback=true, probe=true, padMoveKeys=false, skip={action=true} }
  function I:bindAll(dispatch, opts)
    if type(dispatch) == 'table' and opts == nil then opts, dispatch = dispatch, nil end
    opts = opts or {}
    if dispatch then self:setDefault(dispatch) end
    if S.armed then log('input bindAll 重复调用（已注册 ' .. #S.boundOrder .. ' 个键）') return self end
    S.armed = true
    local skip = opts.skip or {}
    local names = sortedNames(actions)
    local nAct, nUp = 0, 0
    for _, a in ipairs(names) do
      if not skip[a] then
        for _, k in ipairs(actions[a]) do
          if bind(k, a, 'down') then nAct = nAct + 1 end
        end
      end
    end
    for _, a in ipairs(sortedNames(M.UPKEYS)) do
      if not skip[a] then
        for _, k in ipairs(M.UPKEYS[a]) do
          if bind(k, a, 'up') then nUp = nUp + 1 end
        end
      end
    end
    local nFallback = 0
    if opts.fallback ~= false then
      for _, k in ipairs(self:fallbackKeys()) do
        if bind(k, F.action, 'down') then nFallback = nFallback + 1 end
      end
    end
    local nProbe = 0
    if opts.probe ~= false then
      for _, k in ipairs(M.PROBE) do
        if bind(k, 'probe', 'down') then nProbe = nProbe + 1 end
      end
    end
    local nPad = 0
    if opts.padMoveKeys == true then
      for _, rec in ipairs(M.PAD_UNBOUND) do
        if bind(rec.key, rec.action, 'down') then nPad = nPad + 1 end
      end
    end
    log(string.format('input bind all actions=%d down=%d up=%d fallback=%d probe=%d padMove=%d total=%d dupes=%d',
      #names, nAct, nUp, nFallback, nProbe, nPad, #S.boundOrder, #S.dupes))
    return self
  end

  -- ===== headless 驱动（mock 单测入口）=====
  -- 与真机同一条回调：不是"直接调 dispatch"，而是走注册时挂上去的那个 fn
  -- （这样 headless 测到的就是真机跑的同一份闭包）。
  function I:press(action)
    local k = self:names(action)[1]
    if not k then log('input press 未知动作 ' .. tostring(action)) return false end
    if P and P.pressKey then
      local ok = P.pressKey(k)
      if ok then return true end
    end
    local rec = S.bound[k]
    if rec then rec.fn() return true end
    log('input press 未注册 ' .. k)
    return false
  end

  function I:release(action)
    local k = self:upNames(action)[1]
    if not k then return false end
    if P and P.pressKey then
      local ok = P.pressKey(k)
      if ok then return true end
    end
    local rec = S.bound[k]
    if rec then rec.fn() return true end
    return false
  end

  -- 具名键（兜底池/探针/不在动作表里的键）也用同一个入口驱动
  function I:pressKey(keyName)
    if P and P.pressKey and P.pressKey(keyName) then return true end
    local rec = S.bound[keyName]
    if rec then rec.fn() return true end
    return false
  end

  return I
end

return M
