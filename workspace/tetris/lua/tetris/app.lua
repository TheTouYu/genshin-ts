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

 三条接缝纪律（2026-10-31 试点后补，都是踩过的）：
   1) **构造失败返回 nil，不 assert**：缺字段一次报全（`app missing platform,render`），
      调用方 `if APP then … else 旧路 end` 兜底。assert 会把失败伪装成"别的屏没装配"。
   2) **动作路由只有一条**：热区动作走描述层节点的 `on.Click`；场景栈的 `def.onAction`
      只用于"没有热区可挂的键"（键盘）。两套混用会漂移——加动作前先问它有没有热区。
   3) **`opaque` 表达"下面那屏被完全遮住"**：`scenes.view()` 从栈顶向下合成、遇到 opaque
      截断；`tickBelow` 才向下派发 update。它**只在有 tick 调度时才有可观测行为**——
      没有 tick 的场景栈里写 opaque 目前只影响 view 合成，别以为它能停掉动画。
========================================================================]]

local M = {}

--[[! 接线现状（2026-11-02 审计，别把"有实现 + 有单测"当成"在跑"）：

     生产里**实际被调用**的只有记账类 API：
         openOverlay / closeOverlay / provideOverlay / setBase / overlay
     而 render / tick / frame / suspendBase / resumeBase / markBaseDirty
     **在 lua/main.lua 里一次都没被调用**（`grep -c "APP\.render" = 0`）。

     为什么：6 个屏各自持有独立 render 实例，渲染由各屏自己驱动；
     app 目前只是"谁开着"的记账本。所以：
       · `baseStatic` / `markBaseDirty` 现在**不影响画面**（棋盘不丢是因为覆盖屏用独立实例）
       · `frame()` 注册的回调**不会执行**（没人调 tick）
       · `suspendBase()` 只改一个标志位，没人读

     要用它们必须先把 OnUpdate 的渲染段交给 app.tick()——那是一次跨屏改动，
     会同时改变 6 个屏的驱动方式。**在那之前，请不要在别处依赖这些 API 的行为。**
]]
-- 四个必需字段：platform / render / scenes（layers 可选、overlayRender 可选）。
M.REQUIRED = { 'platform', 'render', 'scenes' }

M.new = function(spec)
  spec = spec or {}
  local preLog = spec.log or function() end
  -- 缺字段**返回 nil 并一次报全**，不再 assert 抛错。
  -- 理由（2026-10-31 试点实测）：assert 会让 OnStart 从该行起整段中断，
  -- 而症状出现在**别的屏**（"view_title 未装配" / "introT nil"）——报错点与真因点无关，
  -- 定位成本极高。返回 nil 则调用方的 `if APP then` 兜底能继续跑，且这里一次列出全部缺失项。
  local missing = {}
  for i = 1, #M.REQUIRED do
    if spec[M.REQUIRED[i]] == nil then missing[#missing + 1] = M.REQUIRED[i] end
  end
  if #missing > 0 then
    preLog('app missing ' .. table.concat(missing, ',') ..
      '（必需：' .. table.concat(M.REQUIRED, '/') .. '）')
    return nil
  end
  local P = spec.platform
  local R = spec.render
  local S = spec.scenes
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
  -- 每帧回调（有序）：基础层里有几块是"每帧写"而非"一次性重建"——
  -- 棋盘 200 格的棋子/消除、预览列的位置、pad 的 focus 高亮。它们必须**同帧且有序**
  -- （先在棋盘上画棋子、再算预览、最后刷 pad），否则会出现"预览先于棋盘一帧"的闪烁。
  -- 用一张有序表，而不是让各模块自己挂 OnUpdate —— 顺序就成了显式契约。
  local frameFns = {}
  function A.frame(fn)
    if type(fn) ~= 'function' then return false end
    frameFns[#frameFns + 1] = fn
    return #frameFns
  end
  function A.frameCount() return #frameFns end
  function A.clearFrame() frameFns = {} end

  function A.tick(dt)
    A.tickCount = A.tickCount + 1
    S.update(dt)
    for i = 1, #frameFns do
      local ok, err = pcall(frameFns[i], dt)
      if not ok then
        log('app frame fail #' .. i .. ' :: ' .. tostring(err))
        if onError then pcall(onError, err) end
      end
    end
    return A.render()
  end

  function A.render()
    -- 基础层被抑制且没有覆盖屏在开 ⇒ 本帧不动（保留上一帧，避免自己重建后压回别人上层）
    if baseSuspended and overlayName == nil then return true end
    -- 选实例：覆盖屏用自己那份（provideOverlay 登记的优先），否则用基础层那份
    local target
    if overlayName then
      target = provided[overlayName] or overlayR or R
    else
      -- baseStatic=true：基础层的动态内容（200 格棋子/消除）由 app.frame 每帧写，
      -- 描述里只带静态骨架 ⇒ 每帧整屏 apply 会把没写进描述的状态重置（实测=清盘）。
      -- 因此静态基础层**只在脏时** apply；默认（false）保持原来"每帧 apply"的行为不变。
      if baseStatic and not baseDirty then return true end
      target = baseR or R
      baseDirty = false
    end
    local nodes = S.view()
    local ok, err = pcall(target.apply, nodes)
    if not ok then
      log('app render fail :: ' .. tostring(err))
      if onError then pcall(onError, err) end
      return false
    end
    if L and spec.assertOrder ~= false then
      -- 层序自检（可选）：render 已按层号排序创建，这里只做一次性告警，不重复刷屏
      local issues = target.issues()
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

  -- ===== 覆盖屏（帮助 / 结算 / 档案页 / 标题）=====
  -- 为什么必须是**独立的 render 实例**：基础层（棋盘/预览/HUD）是「每帧增量更新同一张 key 表」，
  -- 覆盖屏是「整屏一次性重建」。两者共用一张 key 表时，覆盖屏的 apply 会把基础层节点当成
  -- 「不在列表里」全部销毁。分开之后，覆盖屏开关只动自己那一份。
  --
  -- 为什么 open 必须先 clear：说明页 271–289 节点、常驻约 240 ⇒ 240+280 撞引擎实例上限 430。
  -- 这条以前靠人记（写在 view_help 头注释里），现在收进代码。
  local overlayR = spec.overlayRender
  -- 基础层与覆盖屏**必须是两个实例**（基础层每帧增量写、覆盖屏整屏重建）。
  -- 早先只有一个默认 render，setBase 会把棋盘描述 apply 进覆盖屏的实例（实测：cellCount 消失、
  -- g.cells 为空）；这里显式分开，缺省回落到 render。
  local baseR = spec.baseRender or spec.render
  local overlayName, overlayPushed = nil, false

  -- 让场景在"要开的时候"声明它用哪个 render 实例（懒创建屏用：结算在第一次 gameOver
  -- 才建 SR，构造期还没有实例可注入）。与 openOverlay 同族：注册即声明。
  local provided = {}
  function A.provideOverlay(name, render)
    if not name or not render then
      log('app provideOverlay missing name/render')
      return false
    end
    provided[name] = render
    return true
  end

  function A.overlayRenderFor(name)
    return provided[name] or overlayR
  end

  function A.openOverlay(name, def, nodes)
    local R_ = provided[name] or overlayR
    if not R_ then
      log('app overlay missing :: ' .. tostring(name))
      return false
    end
    if overlayName then A.closeOverlay() end
    R_.clear()
    local ok, err = pcall(R_.apply, nodes or {})
    if not ok then
      log('app overlay fail :: ' .. tostring(name) .. ' :: ' .. tostring(err))
      return false
    end
    if def then
      local dname = def.name or name
      -- 未注册就先注册：scenes.push 对未注册场景是**返回 false**（不抛），
      -- 静默不压栈会让"开了覆盖屏但栈没变"这种错误极难发现。这里补注册而不是忽略失败。
      if not S.registered(dname) then S.register(def) end
      overlayPushed = S.push(dname, def) and true or false
      if not overlayPushed then log('app overlay push fail :: ' .. tostring(dname)) end
    end
    overlayName = name
    return true
  end

  function A.closeOverlay()
    local was = overlayName
    local R_ = was and (provided[was] or overlayR) or overlayR
    if R_ then R_.clear() end
    if overlayPushed then S.pop() end
    overlayPushed = false
    overlayName = nil
    return was
  end

  -- ===== 基础层（标题 / 棋盘 / 预览 / 手机 pad）=====
  -- 这四个屏是**常驻基础层**：不是 overlay，但也会切换（标题↔对局）与随画布重开。
  -- 场景栈里它就是栈底那一屏；overlay 压在上面。语义与 openOverlay 的差别只有一条：
  -- 换基础层时**栈被清空只留它**（不能把上一局的 overlay 留在栈里）。
  function A.setBase(def, nodes)
    if not def then
      log('app setBase missing def')
      return false
    end
    local name = def.name or 'base'
    -- 已注册过就别再 register（scenes 对重复注册是抛错——这是对的，别把抛错改成静默）
    if not S.registered(name) then S.register(def) end
    if S.depth() == 0 then
      if not S.push(name) then
        log('app setBase fail :: ' .. tostring(name))
        return false
      end
    else
      S.popTo(name)                     -- 已有同名就回到它；否则 replace
      if S.topName() ~= name then
        S.replace(name)
        if S.topName() ~= name then
          log('app setBase replace fail :: ' .. tostring(name))
          return false
        end
      end
    end
    overlayName, overlayPushed = nil, false
    baseDefNodes = nodes
    baseDirty = true          -- 只标脏：真正 apply 在 render() 里做一次
    return true
  end

  -- 基础层可被**临时抑制**：标题屏的显示是"状态推导"的（浮层/结算/引导任一开就要拆），
  -- 而场景栈只有一个"当前基础场景"槽。若浮层关掉时基础层抢先重建，它会压回浮层之上
  -- （这正是历史上"角色页被首页卡片压住"的重演路径）。抑制期间基础层不参与合成，
  -- 覆盖屏照常；恢复后下一帧自然重画。
  local baseSuspended = false
  local baseDirty = true
  local baseStatic = spec.baseStatic == true
  local baseDefNodes = nil
  function A.suspendBase() baseSuspended = true return true end
  -- 恢复**不重 apply**：基础层的控件一直在它自己的实例里，覆盖屏用的是另一个实例，
  -- 所以覆盖屏关掉后基础层自然还在（重 apply 反而会清掉 200 格的当前内容）。
  function A.resumeBase() baseSuspended = false return true end
  function A.baseSuspended() return baseSuspended end
  function A.baseRender() return baseR end
  -- 外部事件把基础层标脏（首次建、画布变化、标题重建都要用）。
  -- baseStatic 的'脏时才 apply'默认只在 setBase 时置脏——启动帧若先 setBase 后建控件，
  -- 或画布尺寸变了要重建，都需要显式再标一次，否则表现为'棋盘 200 格没建出来'。
  function A.markBaseDirty() baseDirty = true return true end
  A.__forceDirtyEachFrame = false

  function A.baseName()
    if S.depth() == 0 then return nil end
    local e = S.stack()[1]
    if type(e) == 'table' then return e.name or e.key end
    return e
  end

  function A.overlay() return overlayName end
  function A.overlayRender() return overlayName and (provided[overlayName] or overlayR) or overlayR end

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
