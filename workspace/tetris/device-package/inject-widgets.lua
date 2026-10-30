--[[==========================================================================
tetris/widgets.lua —— 控件工具箱（保护式读写 / 光标事件 / 按名取控件 / 模板探测）
----------------------------------------------------------------------------
为什么要单独一个模块（v2.7 ⑨ 拆分）：真机上某些字段/方法会抛错、某些键名不存在
（2026-10-24 实证：一处抛错中断整段 OnStart ⇒ 全部按键无响应），所以所有控件读写都要过
pcall 护栏 —— 这套护栏全工程只该有一份；且这些函数只依赖「root + game」，与棋盘状态无关。
契约（docs/research/lua-module-contract.md）：本文件**未挂载、只被 require**；chunk 在 OnInit
阶段执行 ⇒ 顶层不许实例化控件；`script` 在模块里是 dummy ⇒ root/game/样式都由 main 注入。
  spec = { game, rootOf = function() -> root, styleOf = function() -> UI_STYLE }
=========================================================================]]

local M = {}

M.new = function(spec)
  local game = spec.game
  local rootOf = spec.rootOf or function() return nil end
  local function styleTable()
    local f = spec.styleOf
    local t = f and f() or spec.style
    return t or {}
  end

local FAILED = {}
local function noteFail(tag, err)
  if FAILED[tag] then return end
  FAILED[tag] = true
  print('ui fail ' .. tag .. ' :: ' .. tostring(err))
end
local function trySet(ctl, key, value)
  if not ctl then return false end
  -- 真机适配（v2.2）：对齐字段真机要枚举不收字符串（真机日志 `bad argument #2
  -- (TextHorizontalAlignment expected, got string)`——模拟器两形态都收）。先映射枚举，
  -- 无 Enum 表回落字符串。
  if (key == 'horizontalAlignment' or key == 'verticalAlignment') and type(value) == 'string' then
    local enums = (type(Enum) == 'table')
      and ((key == 'horizontalAlignment' and Enum.TextHorizontalAlignment) or Enum.TextVerticalAlignment)
      or nil
    if enums and enums[value] ~= nil then value = enums[value] end
  end
  local ok, err = pcall(function() ctl[key] = value end)
  if not ok then noteFail(tostring(key), err) return false end
  return true
end
local function tryCall(ctl, method, a, b)
  if not ctl then return false end
  -- 真机适配（v2.2）：方法签名严格——SetVisible 真机 2 expected got 3（尾 nil 实参也计数）。
  -- 按实参个数分发：b/a 为 nil 不传。模拟器宽松两形态都过。
  local ok, err
  if b ~= nil then
    ok, err = pcall(function() ctl[method](ctl, a, b) end)
  elseif a ~= nil then
    ok, err = pcall(function() ctl[method](ctl, a) end)
  else
    ok, err = pcall(function() ctl[method](ctl) end)
  end
  if not ok then noteFail(tostring(method), err) return false end
  return true
end

-- 光标事件注册（v2.7 抽出公用）：真机 CursorEventType 要**枚举值**，模拟器接受字符串。
-- 与按键监听同一套双形态探测（见 OnStart 的 listen）：先枚举，失败回落字符串。
-- 返回是否注册成功，并在失败时打日志（真机不认某事件也不该中断整段 OnStart）。
local function addCursor(ctl, kindName, fn)
  if not ctl then return false end
  local enumT = (type(Enum) == 'table' and Enum.CursorEventType) or nil
  local ev = enumT and enumT[kindName] or nil
  local ok, err
  if ev ~= nil then
    ok, err = pcall(function() ctl:AddCursorEventListener(ev, fn) end)
  end
  if not ok then
    ok, err = pcall(function() ctl:AddCursorEventListener(kindName, fn) end)
  end
  if not ok then
    print('cursor listen fail ' .. tostring(kindName) .. ' :: ' .. tostring(err))
    return false
  end
  return true
end

local function find(name)
  local root = rootOf()
  if not root then return nil end
  local ok, ctl = pcall(function() return root:GetChild(name) end)
  if ok then return ctl end
  return nil
end

local function setText(ctl, value)
  if ctl then trySet(ctl, 'text', value) end
end

local function applyStyle(name, ctl)
  local st = styleTable()[name]        -- 惰性取样式表（main 的 UI_STYLE 定义在本模块装载之后）
  if not ctl or not st then return end
  if st.font then trySet(ctl, 'fontSize', st.font) end
  if st.color then trySet(ctl, 'fontColor', st.color) end
  if st.bg then trySet(ctl, 'bgColor', st.bg) end
  if st.align then trySet(ctl, 'horizontalAlignment', st.align) end
  if st.valign then trySet(ctl, 'verticalAlignment', st.valign) end
end

-- 能力探测（**正向**判据）：image 类才有 imageColor 字段，cursor 类才有 AddCursorEventListener。
-- 为什么不再用「有没有 AddCursorEventListener」当反向判据：真机上该方法可能是通用桩
-- （2026-10-29 实测：三个候选全部被这条判据判成 cursor ⇒ cell 探测失败、OnStart 直接 error）。
local function capOf(ctl)
  local image, cursor, text = false, false, false
  if not ctl then return image, cursor, text end
  pcall(function() if ctl.imageColor ~= nil then image = true end end)
  pcall(function() if type(ctl.AddCursorEventListener) == 'function' then cursor = true end end)
  pcall(function() if ctl.text ~= nil then text = true end end)
  return image, cursor, text
end

local function accept(ctl, needCursor)
  local image, cursor = capOf(ctl)
  if needCursor then return cursor and (not image) end
  return image
end

-- 按候选 guid 探测模板；候选全灭时**扫一段 GUID**（真机导入后模板会被重编号，写死/候选表都可能过期）
local function probeTemplate(candidates, needCursor)
  local tag = needCursor and 'hit' or 'cell'
  for _, g in ipairs(candidates) do
    if type(g) == 'number' then
      local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, rootOf()) end)
      if ok and ctl then
        if accept(ctl, needCursor) then
          print('probe ' .. tag .. ' ok guid=' .. tostring(g))
          return ctl, g
        end
        local image, cursor, text = capOf(ctl)
        print('probe ' .. tag .. ' reject guid=' .. tostring(g) .. ' image=' .. tostring(image)
          .. ' cursor=' .. tostring(cursor) .. ' text=' .. tostring(text))
        pcall(function() game.DestroyClientUIControl(ctl) end)
      else
        print('probe ' .. tag .. ' fail guid=' .. tostring(g) .. ' :: ' .. tostring(ctl))
      end
    end
  end
  -- 兜底扫描：地图里所有可能的控件模板段（真机 1073741825.. 与导入段 1073742100..）
  local ranges = { { 1073741825, 1073741999 }, { 1073742100, 1073742160 } }
  local tried = 0
  for _, rg in ipairs(ranges) do
    for g = rg[1], rg[2] do
      local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, rootOf()) end)
      tried = tried + 1
      if ok and ctl then
        if accept(ctl, needCursor) then
          print('probe ' .. tag .. ' scan ok guid=' .. tostring(g) .. ' tried=' .. tried)
          return ctl, g
        end
        pcall(function() game.DestroyClientUIControl(ctl) end)
      end
    end
  end
  print('probe ' .. tag .. ' GIVE UP tried=' .. tried)
  return nil, nil
end

local function instInto(candidates, parent, needCursor)
  for _, g in ipairs(candidates) do
    local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, parent) end)
    if ok and ctl then
      if needCursor == nil then return ctl end
      local okFn, fn = pcall(function() return ctl.AddCursorEventListener end)
      if (okFn and type(fn) == 'function') == needCursor then return ctl end
      pcall(function() game.DestroyClientUIControl(ctl) end)
    end
  end
  return nil
end

local function findIn(node, names)
  if not node then return nil end
  for _, n in ipairs(names) do
    local ok, child = pcall(function() return node:GetChild(n) end)
    if ok and child then return child end
  end
  return nil
end

  return {
    noteFail = noteFail, trySet = trySet, tryCall = tryCall, addCursor = addCursor,
    find = find, setText = setText, applyStyle = applyStyle,
    probeTemplate = probeTemplate, instInto = instInto, findIn = findIn, capOf = capOf,
  }
end

return M
