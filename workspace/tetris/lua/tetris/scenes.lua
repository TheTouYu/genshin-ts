--[[==========================================================================
 tetris/scenes.lua —— 场景栈（显式 push/pop，替代隐式布尔组合）
 ----------------------------------------------------------------------------
 历史病灶：菜单层级靠 `helpOpen / helpFromStage / helpPage / MODE / pendingMode / GK.phase`
 这些散落全局组合编码 —— 「说明页从标题页开」和「说明页从暂停开」是两套隐式分支，
 状态组合不可枚举 ⇒ 多层级菜单的 bug 无法复现（用户点名的坏域之一）。

 现在唯一的状态就是**栈**：
   栈 = { title }                       标题
   栈 = { title, help }                 标题上叠说明页（pop 回标题）
   栈 = { play, help }                  局中暂停开说明页（pop 回 play）
   栈 = { play, settle }                结算卡（pop 回 play 仅用于重开）

 视图合成规则：从栈底往上拼节点描述（layer 号全局唯一 ⇒ 层序自动正确）；
 某层的 `opaque = true` 表示遮住下面 ⇒ 只取它及以上的视图（省渲染、也防误点下层）。
 更新规则：只有栈顶 `update ~= false` 时跑它的 update；`tickBelow = true` 时下层继续跑。

 本文件不碰引擎（只产出节点列表），渲染交给 render.lua ⇒ 栈行为可 headless 断言。
========================================================================]]

local M = {}

M.new = function(spec)
  spec = spec or {}
  local log = spec.log or function() end
  local registry = {}
  local stack = {}
  local history = {}

  local S = { }

  function S.register(def)
    assert(type(def) == 'table' and def.name, 'scenes.register 需要 def.name')
    if registry[def.name] then error('scenes: 重复注册 ' .. tostring(def.name)) end
    registry[def.name] = def
    return def
  end

  function S.registered(name) return registry[name] ~= nil end

  local function topEntry()
    return stack[#stack]
  end

  function S.top()
    local e = topEntry()
    return e and e.def or nil
  end

  function S.topName()
    local e = topEntry()
    return e and e.def.name or nil
  end

  function S.depth() return #stack end

  function S.stack()
    local names = {}
    for i = 1, #stack do names[i] = stack[i].def.name end
    return names
  end

  function S.history() return history end

  function S.has(name)
    for i = 1, #stack do
      if stack[i].def.name == name then return true end
    end
    return false
  end

  -- 进入场景：调用 def.enter(params)；失败不压栈（避免「栈里有个半死的场景」）
  function S.push(name, params)
    local def = registry[name]
    if not def then
      log('scene push fail: 未注册 ' .. tostring(name))
      return false
    end
    local ctx = { params = params or {}, scenes = S, platform = spec.platform }
    local ok, err = true, nil
    if def.enter then
      ok, err = pcall(def.enter, ctx)
    end
    if not ok then
      log('scene enter fail ' .. name .. ' :: ' .. tostring(err))
      return false
    end
    stack[#stack + 1] = { def = def, ctx = ctx, enteredAt = S.tickCount or 0 }
    history[#history + 1] = 'push ' .. name
    log('scene push ' .. name .. ' (depth=' .. #stack .. ')')
    return true
  end

  function S.pop()
    local e = topEntry()
    if not e then return nil end
    if e.def.exit then
      local ok, err = pcall(e.def.exit, e.ctx)
      if not ok then log('scene exit fail ' .. e.def.name .. ' :: ' .. tostring(err)) end
    end
    stack[#stack] = nil
    history[#history + 1] = 'pop ' .. e.def.name
    log('scene pop ' .. e.def.name .. ' (depth=' .. #stack .. ')')
    return e.def.name
  end

  -- 替换栈顶（标题 → 玩法这类不可回退的切换）
  function S.replace(name, params)
    S.pop()
    return S.push(name, params)
  end

  -- 一路 pop 到指定场景（不存在则清空重来）
  function S.popTo(name)
    local guard = 0
    while #stack > 0 and stack[#stack].def.name ~= name and guard < 32 do
      S.pop()
      guard = guard + 1
    end
    return #stack > 0 and stack[#stack].def.name == name
  end

  -- ===== 每帧 =====
  S.tickCount = 0

  function S.update(dt)
    S.tickCount = S.tickCount + 1
    local e = topEntry()
    if not e then return end
    if e.def.update and e.def.update ~= false then
      local ok, err = pcall(e.def.update, e.ctx, dt)
      if not ok then log('scene update fail ' .. e.def.name .. ' :: ' .. tostring(err)) end
    end
    -- 下层继续跑（例如 play 在 help 之下仍要推进计时器/动画）
    if e.def.tickBelow then
      for i = #stack - 1, 1, -1 do
        local below = stack[i]
        if below.def.update then
          local ok, err = pcall(below.def.update, below.ctx, dt)
          if not ok then log('scene update fail ' .. below.def.name .. ' :: ' .. tostring(err)) end
        end
        if not below.def.tickBelow then break end
      end
    end
  end

  -- 视图合成：返回节点描述数组（layer 语义层序由 render/lint 校验）
  function S.view()
    local out = {}
    -- opaque 的语义是「我遮住下面」⇒ 合成要从**最顶层**的 opaque 开始。
    -- （2026-10-31 集成测试抓到：从最底层找会让"标题仍 opaque 时 push 玩法"把两屏都画出来，
    --  即退出/进入过渡期下层节点不销毁 —— 这是跨屏残留类 bug 的结构性来源。）
    local startIdx = 1
    for i = #stack, 1, -1 do
      if stack[i].def.opaque and stack[i].def.view then
        startIdx = i
        break
      end
    end
    for i = startIdx, #stack do
      local e = stack[i]
      if e.def.view and e.def.visible ~= false then
        local ok, nodes = pcall(e.def.view, e.ctx)
        if ok and nodes then
          for k = 1, #nodes do out[#out + 1] = nodes[k] end
        elseif not ok then
          log('scene view fail ' .. e.def.name .. ' :: ' .. tostring(nodes))
        end
      end
    end
    return out
  end

  -- ===== 输入 =====
  -- action 是 input_map 的语义动作（'left'/'confirm'/…）；从栈顶往下找第一个处理者。
  -- 返回 true 表示已消费（未消费的键可被全局兜底逻辑使用，例如「任意键开始」）。
  function S.onAction(action, keyName)
    for i = #stack, 1, -1 do
      local e = stack[i]
      local fn = e.def.onAction
      if fn then
        local ok, consumed = pcall(fn, e.ctx, action, keyName)
        if not ok then
          log('scene action fail ' .. e.def.name .. ' ' .. tostring(action) .. ' :: ' .. tostring(consumed))
        elseif consumed then
          return true
        end
      end
      if e.def.opaque then break end
    end
    return false
  end

  -- 查询：某个栈内场景的 ctx（供跨场景读状态，避免全局）
  function S.ctx(name)
    for i = #stack, 1, -1 do
      if stack[i].def.name == name then return stack[i].ctx end
    end
    return nil
  end

  return S
end

return M
