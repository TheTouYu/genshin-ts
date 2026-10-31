--[[==========================================================================
 tetris/app.lua —— 应用外壳：boot / tick / 输入分发 / 场景→渲染
 ----------------------------------------------------------------------------
 这一层只做「连接」，不含任何业务：
     scenes（场景栈）──view()──> render（描述→控件）──> platform（引擎或 mock）
         ▲                                              │
         └────────── input（动作）── dispatch ──────────┘

 为什么把连接收成一层：
   历史版本里 OnUpdate 直接干所有事（推进计时/AI/结算动画/画布轮询/渲染），
   输入回调又各自判断当前在哪个界面（helpOpen / ROSTER.on / MODE_OVER / guideStage…）。
   于是「现在该响应什么」要在 5 个布尔之间推演，bug 无法复现。
   现在唯一真相是场景栈：谁在栈顶谁收动作；每帧只做 tick + apply 两件事。

 本文件不碰引擎（platform 才是唯一通道），因此可 headless 断言。
========================================================================]]

local M = {}

M.new = function(spec)
  spec = spec or {}
  local P = assert(spec.platform, 'app: 需要 platform')
  local R = assert(spec.render, 'app: 需要 render')
  local S = assert(spec.scenes, 'app: 需要 scenes')
  local L = spec.layers
  local log = spec.log or function() end
  local onError = spec.onError

  local A = { tickCount = 0, frames = 0 }

  -- 注册场景（转发给场景栈，便于一处配置）
  function A.register(def) return S.register(def) end

  -- 进入初始场景
  function A.start(name, params)
    local ok = S.push(name, params)
    if not ok then log('app start fail ' .. tostring(name)) end
    A.frames = 0
    A.render()          -- 进场景立刻渲染一帧：否则第一帧是空的，且 start 后的断言只能等 tick
    return ok
  end

  -- 每帧：推场景 + 合成视图 + 协调渲染
  -- 渲染失败不该中断逻辑：真机一处抛错会中断整段回调（历史事故），所以这里兜住并记账。
  function A.tick(dt)
    A.tickCount = A.tickCount + 1
    S.update(dt)
    return A.render()
  end

  function A.render()
    local nodes = S.view()
    local ok, err = pcall(R.apply, nodes)
    if not ok then
      log('app render fail :: ' .. tostring(err))
      if onError then pcall(onError, err) end
      return false
    end
    if L and spec.assertOrder ~= false then
      -- 层序自检（可选）：render 已按层号排序创建，这里只做一次性告警，不重复刷屏
      local issues = R.issues()
      if issues and #issues > 0 and not A.__orderWarned then
        A.__orderWarned = true
        log('app order issue :: ' .. tostring(issues[1].msg))
      end
    end
    return true
  end

  -- 输入：动作由 input_map 给出（'left'/'confirm'/…），交给场景栈决定谁消费
  function A.dispatch(action, keyName)
    return S.onAction(action, keyName)
  end

  -- 便捷：把 input_map 实例接上（每个键只注册一次，回调统一进 dispatch）
  function A.bindInput(inputMap, extraAction)
    if not inputMap then return false end
    return inputMap.bindAll(function(action, keyName)
      local consumed = A.dispatch(action, keyName)
      if not consumed and extraAction then
        return extraAction(action, keyName)
      end
      return consumed
    end)
  end

  function A.scenes() return S end
  function A.stats()
    return {
      frames = A.frames, ticks = A.tickCount,
      scenes = S.stack(), depth = S.depth(),
      render = R.stats and R.stats() or nil,
    }
  end

  return A
end

return M
