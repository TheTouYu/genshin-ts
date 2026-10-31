--[[==========================================================================
 tetris/platform.lua —— 引擎适配层（全工程**唯一**允许直接调用 game.* / ctl.* 的地方）
 ----------------------------------------------------------------------------
 为什么要有这一层（v6 重构第一性）：
   历史版本里 35 处直接 InstantiateClientUIControl、22 处手写 pcall 样板、颜色/字号/对齐
   运算散落各处 ⇒ 一个「手机端结算页按键看不见」的 bug 只能靠开模拟器出图 + 人眼才发现，
   复现成本 15s 模拟器 + 人工判读。把引擎调用收进一层、并支持**假后端**之后，
   同一件事在 lua5.3 上 50ms 跑完（tests-lua/*），人眼只用来做最后一道视觉确认。

 两个后端：
   real：spec = { game = game, root = root, templates = CFG.TPL_GUIDS }
   mock：spec = { mock = true, canvas = { w, h }, templates = { cell = { kind = 'image' } } }
 mock 节点与真机字段名同构（sizeDeltaX / anchoredPositionX / imageColor / text / visible …），
 这样 tests/*.json 里 `kind="control"` 的断言口径可以直接在 headless 里复用。

 契约：本文件未挂载、只被 require；chunk 顶层不做任何实例化。
========================================================================]]

local M = {}

-- 每个模板需要什么能力才接受（其余探测到即销毁）。缺省 'any'。
local DEFAULT_ACCEPTS = { cell = 'image', hit = 'cursor', stext = 'text' }

local function mockNode(spec, kind, parent, seq)
  local n = {
    __kind = kind, __seq = seq, __children = {}, __cursors = {}, __keys = {},
    sizeDeltaX = 0, sizeDeltaY = 0,
    anchoredPositionX = 0, anchoredPositionY = 0,
    visible = true, name = nil,
  }
  if kind == 'image' then n.imageColor = 0 end
  if kind == 'text' then n.text = '' n.fontSize = 16 n.fontColor = 0 end
  function n.SetSizeDelta(self, w, h) self.sizeDeltaX, self.sizeDeltaY = w, h end
  function n.SetAnchoredPosition(self, x, y) self.anchoredPositionX, self.anchoredPositionY = x, y end
  function n.SetVisible(self, v) self.visible = v end
  function n.SetAsLastSibling() end
  function n.SetAsFirstSibling() end
  function n.GetChild(self, name)
    for i = 1, #self.__children do
      if self.__children[i].name == name then return self.__children[i] end
    end
    return nil
  end
  function n.AddCursorEventListener(self, ev, fn) self.__cursors[tostring(ev)] = fn return true end
  -- 图元贴图：mock 也要能记录，否则 image 通道在 headless 里既不可断言也不会被 pcall 拦下报错
  -- （2026-10-31 实测：缺这一行时 P.failures() 会多出 setImage:rect/circle 两条假失败）
  function n.SetImage(self, src, id) self.imageSource = src self.imageId = id return true end
  function n.AddKeyEventListener(self, ev, fn) self.__keys[tostring(ev)] = fn return true end
  if parent then
    parent.__children[#parent.__children + 1] = n
    n.__parent = parent
  end
  return n
end

M.new = function(spec)
  spec = spec or {}
  local mock = spec.mock == true
  local game = spec.game
  local root = spec.root
  local templates = spec.templates or {}
  local accepts = {}
  for k, v in pairs(DEFAULT_ACCEPTS) do accepts[k] = v end
  for k, v in pairs(spec.accepts or {}) do accepts[k] = v end

  local S = {
    seq = 0,
    guidOf = {},          -- tplKey -> 探测成功的 guid
    seqOf = {},           -- ctl -> 创建序号（真机对象不能挂字段，用侧表）
    failures = {},
    failSeen = {},
    logs = {},
    stats = { inst = 0, fails = 0, scanned = 0 },
  }
  local logSink = spec.logSink

  if mock then
    root = mockNode(spec, 'root', nil, 0)
  elseif not (game and root) then
    error('platform: 需要 { game, root } 或 { mock = true }')
  end

  local P = { mock = mock, root = root }

  local function record(tag, err)
    local key = tostring(tag) .. '|' .. tostring(err)
    if S.failSeen[key] then return end
    S.failSeen[key] = true
    S.stats.fails = S.stats.fails + 1
    S.failures[#S.failures + 1] = { tag = tostring(tag), err = tostring(err) }
    P.log('platform fail ' .. tostring(tag) .. ' :: ' .. tostring(err))
  end

  function P.log(msg)
    msg = tostring(msg)
    S.logs[#S.logs + 1] = msg
    if logSink then logSink(msg) else print(msg) end
  end

  function P.logs() return S.logs end
  function P.failures() return S.failures end
  function P.stats() return S.stats end
  function P.seqOf(ctl) return ctl and S.seqOf[ctl] end

  function P.cap(ctl)
    if not ctl then return false, false, false end
    if ctl.__kind then
      return ctl.__kind == 'image', ctl.__kind == 'cursor', ctl.__kind == 'text'
    end
    local image, cursor, text = false, false, false
    pcall(function() if ctl.imageColor ~= nil then image = true end end)
    pcall(function() if type(ctl.AddCursorEventListener) == 'function' then cursor = true end end)
    pcall(function() if ctl.text ~= nil then text = true end end)
    return image, cursor, text
  end

  local function accept(tplKey, ctl)
    local need = accepts[tplKey] or 'any'
    if need == 'any' then return true end
    local image, cursor, text = P.cap(ctl)
    if need == 'image' then return image end
    if need == 'cursor' then return cursor and not image end
    if need == 'text' then return text end
    return true
  end

  local function register(ctl)
    S.seqOf[ctl] = S.seq
    S.seq = S.seq + 1
    S.stats.inst = S.stats.inst + 1
    return ctl
  end

  -- 按候选 guid 实例化；全灭时扫一段 GUID（真机导入后模板会重编号，写死的候选会过期）
  function P.inst(tplKey, parent)
    parent = parent or root
    if mock then
      local t = templates[tplKey] or { kind = 'image' }
      local n = mockNode(spec, t.kind or 'image', parent, S.seq)
      n.__tpl = tplKey
      register(n)
      return n, t.guid
    end
    local cached = S.guidOf[tplKey]
    if cached then
      local ok, ctl = pcall(function() return game.InstantiateClientUIControl(cached, parent) end)
      if ok and ctl then return register(ctl), cached end
      S.guidOf[tplKey] = nil
    end
    local cands = templates[tplKey] or {}
    for i = 1, #cands do
      local g = cands[i]
      if type(g) == 'number' then
        local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, parent) end)
        if ok and ctl then
          if accept(tplKey, ctl) then
            S.guidOf[tplKey] = g
            P.log('tpl ' .. tplKey .. ' ok guid=' .. g)
            return register(ctl), g
          end
          local image, cursor, text = P.cap(ctl)
          P.log('tpl ' .. tplKey .. ' reject guid=' .. g .. ' image=' .. tostring(image)
            .. ' cursor=' .. tostring(cursor) .. ' text=' .. tostring(text))
          pcall(function() game.DestroyClientUIControl(ctl) end)
        end
      end
    end
    -- 兜底扫描（只在候选全灭时发生一次；结果缓存）
    local ranges = { { 1073741825, 1073741999 }, { 1073742100, 1073742180 } }
    for r = 1, #ranges do
      local rg = ranges[r]
      for g = rg[1], rg[2] do
        local ok, ctl = pcall(function() return game.InstantiateClientUIControl(g, parent) end)
        S.stats.scanned = S.stats.scanned + 1
        if ok and ctl then
          if accept(tplKey, ctl) then
            S.guidOf[tplKey] = g
            P.log('tpl ' .. tplKey .. ' scan ok guid=' .. g .. ' tried=' .. S.stats.scanned)
            return register(ctl), g
          end
          pcall(function() game.DestroyClientUIControl(ctl) end)
        end
      end
    end
    record('inst:' .. tplKey, 'all candidates rejected')
    return nil, nil
  end

  function P.destroy(ctl)
    if not ctl then return false end
    if ctl.__kind then
      local p = ctl.__parent
      if p then
        for i = #p.__children, 1, -1 do
          if p.__children[i] == ctl then table.remove(p.__children, i) end
        end
      end
      ctl.__parent = nil
      return true
    end
    local ok, err = pcall(function() game.DestroyClientUIControl(ctl) end)
    if not ok then record('destroy', err) end
    S.seqOf[ctl] = nil
    return ok
  end

  function P.set(ctl, field, value)
    if not ctl then return false end
    -- 真机：对齐字段要枚举值不收字符串（模拟器两形态都收）
    if (field == 'horizontalAlignment' or field == 'verticalAlignment') and type(value) == 'string' then
      local e = (type(Enum) == 'table')
        and ((field == 'horizontalAlignment' and Enum.TextHorizontalAlignment) or Enum.TextVerticalAlignment)
        or nil
      if e and e[value] ~= nil then value = e[value] end
    end
    local ok, err = pcall(function() ctl[field] = value end)
    if not ok then record('set:' .. tostring(field), err) return false end
    return true
  end

  function P.get(ctl, field)
    if not ctl then return nil end
    local ok, v = pcall(function() return ctl[field] end)
    if not ok then return nil end
    return v
  end

  -- 真机方法签名严格：SetVisible 收 2 个实参会报 bad argument（尾 nil 也算一个）⇒ 按实参个数分发
  function P.call(ctl, method, a, b)
    if not ctl then return false end
    local ok, err
    if b ~= nil then
      ok, err = pcall(function() ctl[method](ctl, a, b) end)
    elseif a ~= nil then
      ok, err = pcall(function() ctl[method](ctl, a) end)
    else
      ok, err = pcall(function() ctl[method](ctl) end)
    end
    if not ok then record('call:' .. tostring(method), err) end
    return ok
  end

  -- 图元贴图（引擎内置六类）：MS.addShape 走的就是这条路。
  -- 胶囊的左右半圆靠 circle 图元，不做这一步就只能拿到矩形（圆角丢失）。
  local IMAGE_PRIMITIVES = { rect = 100001, circle = 100002, triangle = 100003,
    fourstar = 100004, fivestar = 100005, ring = 100006 }
  function P.setImage(ctl, kindName, sourceName)
    if not ctl then return false end
    local id = IMAGE_PRIMITIVES[kindName] or IMAGE_PRIMITIVES.rect
    local src = sourceName or 'StaticReference'
    local enumT = (type(Enum) == 'table' and Enum.ImageSource) or nil
    local ok, err
    if enumT and enumT[src] ~= nil then
      ok, err = pcall(function() ctl:SetImage(enumT[src], id) end)
    end
    if not ok then
      ok, err = pcall(function() ctl:SetImage(src, id) end)
    end
    if not ok then record('setImage:' .. tostring(kindName), err) end
    return ok
  end

  function P.find(name)
    local r = root
    if not r then return nil end
    local ok, ctl = pcall(function() return r:GetChild(name) end)
    if ok then return ctl end
    return nil
  end

  function P.findIn(node, names)
    if not node then return nil end
    for i = 1, #names do
      local ok, child = pcall(function() return node:GetChild(names[i]) end)
      if ok and child then return child end
    end
    return nil
  end

  function P.onCursor(ctl, kindName, fn)
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
    if not ok then record('cursor:' .. tostring(kindName), err) return false end
    return true
  end

  -- 键位注册：真机要枚举值、模拟器收字符串 ⇒ 双形态回退。
  -- **诊断日志字面量是契约**（真机上它是唯一线索）：`listen ok <name> via enum|string` /
  -- `listen fail <name> :: <err>`。全工程只有这一份实现（input_map 直接注入 P）。
  local keyHandlers = {}
  function P.bindKey(name, fn)
    local enumKeys = (type(Enum) == 'table' and Enum.KeyEventType) or nil
    local ok, err, how
    if enumKeys and enumKeys[name] ~= nil then
      ok, err = pcall(function() root:AddKeyEventListener(enumKeys[name], fn) end)
      how = 'enum'
    end
    if not ok then
      ok, err = pcall(function() root:AddKeyEventListener(name, fn) end)
      how = 'string'
    end
    keyHandlers[name] = fn
    if ok then
      P.log('listen ok ' .. tostring(name) .. ' via ' .. tostring(how))
    else
      P.log('listen fail ' .. tostring(name) .. ' :: ' .. tostring(err))
      record('bindKey:' .. tostring(name), err)
    end
    return ok and true or false
  end

  -- 只在 mock 下有意义：模拟按下一个具名键（headless 复现输入类 bug 的入口）
  function P.pressKey(name)
    local fn = keyHandlers[name]
    if not fn then return false end
    fn()
    return true
  end

  function P.keys() return keyHandlers end

  function P.canvas()
    if mock then return spec.canvas and spec.canvas[1] or 1280, spec.canvas and spec.canvas[2] or 720 end
    local ok, w, h = pcall(function() return game.GetUICanvasSize() end)
    if ok and w and h then return w, h end
    return 1280, 720
  end

  return P
end

return M
