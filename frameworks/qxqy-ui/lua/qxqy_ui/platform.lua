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

-- 文字拟合（引擎语义）：requiredHeight = 1.2f×行数 + (0.25f+4)；放不下时 fits=false、
-- visibleLineCount=0 —— 真机表现是**整条一个字都不画**（本项目踩过：移动端字号未缩放而
-- 框宽缩放了 ⇒ 折行 2 行 ⇒ 糊里糊涂"文字消失"）。mock 复刻这条，才能把"字被裁"
-- 从"结构估算"升级成"引擎行为断言"。
local function textMetrics(t)
  local text = tostring(t.text or '')
  local font = tonumber(t.fontSize) or 16
  local w = tonumber(t.sizeDeltaX) or 0
  local h = tonumber(t.sizeDeltaY) or 0
  -- 保守折行：每个多字节字符按 1 em，ASCII 按 0.55 em
  local function em(ch) return (#ch > 1) and 1 or 0.55 end
  local lines, cur = 1, 0
  local i = 1
  while i <= #text do
    local b = string.byte(text, i)
    local len = 1
    if b >= 0xF0 then len = 4 elseif b >= 0xE0 then len = 3 elseif b >= 0xC0 then len = 2 end
    local ch = string.sub(text, i, i + len - 1)
    if ch == '\n' then
      lines = lines + 1
      cur = 0
    else
      local adv = em(ch) * font
      if w > 0 and cur > 0 and cur + adv > w then
        lines = lines + 1
        cur = adv
      else
        cur = cur + adv
      end
    end
    i = i + len
  end
  local required = 1.2 * font * lines + (0.25 * font + 4)
  local fits = (w > 0) and (h >= required)
  return { fits = fits, requiredHeight = required, lines = lines,
    visibleLineCount = fits and lines or 0,
    text = text, font = font, width = w, height = h }
end

local function mockNode(spec, kind, parent, seq)
  local n = {
    __kind = kind, __seq = seq, __children = {}, __cursors = {}, __keys = {},
    sizeDeltaX = 0, sizeDeltaY = 0,
    anchoredPositionX = 0, anchoredPositionY = 0,
    visible = true, name = nil,
  }
  if kind == 'image' then n.imageColor = 0 end
  if kind == 'text' then n.text = '' n.fontSize = 16 n.fontColor = 0 end
  setmetatable(n, { __index = function(t, k)
    if k == 'textLayout' and t.__kind == 'text' then return textMetrics(t) end
    return nil
  end })
  function n.SetSizeDelta(self, w, h) self.sizeDeltaX, self.sizeDeltaY = w, h end
  function n.SetAnchoredPosition(self, x, y) self.anchoredPositionX, self.anchoredPositionY = x, y end
  function n.SetVisible(self, v) self.visible = v end
  -- ===== 同级排序（2026-11-02 修：此前这四个是**空函数**）=====
  -- 事故：这两个方法原本写成 `function n.SetAsLastSibling() end`（空函数、无返回值），
  -- 于是「调了没反应」被记成「本引擎 SetAsLastSibling 是空操作」，并写进了
  -- view_layers.lua:5 / render.lua:9 / view_title.lua:12 / main.lua:1881 四处注释。
  -- 真因是我们自己的 mock 把它实现成了 no-op。官方 rev223 声明：
  --   GetSiblingIndex(): integer（0..子数-1）
  --   SetSiblingIndex(index): boolean（数值越大通常越靠后、显示越靠上）
  --   SetAsFirstSibling() / SetAsLastSibling(): boolean（后者置顶）
  -- 且官方教程：月之六起「层级渲染(新)」按层级配置渲染、同级按创建时序（后创建在上）。
  -- 本 mock 的 __children 数组**末尾 = 最上层**（与真机 SetAsLastSibling 置顶一致）。
  function n.GetSiblingIndex(self)
    local p = self.__parent
    if not p then return 0 end
    for i = 1, #p.__children do
      if p.__children[i] == self then return i - 1 end
    end
    return 0
  end
  function n.SetSiblingIndex(self, index)
    local p = self.__parent
    if not p then return false end
    local kids = p.__children
    local n_ = #kids
    local idx = tonumber(index)
    -- 与官方一致：越界/非整数 ⇒ false（不静默夹取）
    if not idx or idx ~= math.floor(idx) or idx < 0 or idx > n_ - 1 then return false end
    local from = nil
    for i = 1, n_ do if kids[i] == self then from = i break end end
    if not from then return false end
    table.remove(kids, from)
    table.insert(kids, idx + 1, self)
    return true
  end
  function n.SetAsLastSibling(self)
    local p = self.__parent
    if not p then return false end
    return n.SetSiblingIndex(self, #p.__children - 1)
  end
  function n.SetAsFirstSibling(self)
    return n.SetSiblingIndex(self, 0)
  end
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
  function n.SetLocalRotation(self, x, y, z) self.rotX = x self.rotY = y self.rotZ = z return true end
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

  -- ===== 全局实例台账 =====
  -- 引擎的实例上限（约 430）是**整个脚本**的总量，不是单个 render 实例的量。
  -- 只让 render 守自己那份是不够的：常驻 240 + 说明页 277 = 517 早已越界，
  -- 而每个 render 都觉得自己"才 277，没问题"。台账放在 platform——它是唯一
  -- 知道"到底建了几个控件"的地方。
  local liveCount = 0
  function P.liveCount() return liveCount end

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
    -- 🔴 v6.20（2026-11-14 真机日志 22-19-07_3472 铁证）：真机上 textbox 的 `text` 字段**读不出来**
    -- （访问即抛错，pcall 静默吞掉）⇒ 上面的 text 恒 false。
    -- 后果链：rec45 探测 `tpl stext=1073742202` 通过（probeTextRaw 只要求"能实例化"），
    -- 而 rec50 `platform fail inst:stext :: all candidates rejected`（accept 要求 text）。
    -- **同一份代码两个判据**，真机上字面全灭：文字控件一个都建不出来、`bg pool n=0`（背景也没了）、
    -- 结算页无字、开局面板无字——用户截图里的"全是 bug"就是这个。
    -- 修法：text 判据加**结构特征兜底**。textbox 独有的可读字段（fontSize / textLayout /
    -- SetText 之类）只要有一个在，就是文字控件；只有全读不到才认定"不是文字"。
    if not text then
      pcall(function() if ctl.fontSize ~= nil then text = true end end)
      if not text then pcall(function() if ctl.textLayout ~= nil then text = true end end) end
      if not text then pcall(function() if ctl.fontColor ~= nil then text = true end end) end
    end
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
  -- 测试缝：把 accept 的判据暴露给契约测试（P7：真机 text 不可读时不得判死）
  P.acceptForTest = accept

  -- 所有实例化路径（mock / 真机缓存 / 真机候选扫描）都收口到这里 ⇒ 台账不会漏计
  local function register(ctl)
    S.seqOf[ctl] = S.seq
    S.seq = S.seq + 1
    S.stats.inst = S.stats.inst + 1
    liveCount = liveCount + 1
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
    -- 🔴 v6.22 诊断（真机文字全灭第二次返工的产物）：**候选表为空**和**候选被试完**是两回事，
    -- 前者是配置/键名问题（本次真因：config 叫 settleText、这里查 stext），后者才可能是能力判据问题。
    -- 旧代码两者最终都只打一句 `all candidates rejected`，于是上一轮我按能力判据去修，白改一轮。
    if #cands == 0 then
      P.log('tpl ' .. tplKey .. ' cands=0 :: templates 里没有这个键（键名不匹配？已定义: '
        .. (function()
             local ks = {}
             for k in pairs(templates) do ks[#ks + 1] = tostring(k) end
             table.sort(ks)
             return table.concat(ks, ',')
           end)() .. '）')
    end
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
    -- ⚠ v6.22：上限必须覆盖**真机实际模板区**。原区间只到 1073742180，而实测
    -- 文字模板是 1073742202、容器模板 1073742210（真机日志 rec45/rec44）⇒ 探测失败时
    -- 兜底扫描永远扫不到它们。这类"区间写死"的兜底只能当最后保险，主路径必须靠候选表命中。
    local ranges = { { 1073741825, 1073741999 }, { 1073742100, 1073742299 } }
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
    liveCount = math.max(0, liveCount - 1)
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
  -- 旋转（花瓣/雷纹等斜装饰要用）：引擎接 SetLocalRotation(x, y, z)，单位度
  function P.setRotation(ctl, deg)
    if not ctl or not deg or deg == 0 then return false end
    local ok, err = pcall(function() ctl:SetLocalRotation(0, 0, deg) end)
    if not ok then record('setRotation', err) end
    return ok
  end

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

M.textMetrics = textMetrics

return M
