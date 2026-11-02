--[[==========================================================================
 tetris/render.lua —— 描述 → 控件 的协调器（唯一把 node 变成引擎控件的地方）
 ----------------------------------------------------------------------------
 职责（只有这三件）：
   1) 按 layer 顺序**创建**新节点 ⇒ 层序不再依赖调用点顺序
   2) 按字段**增量更新**（值没变就不写控件 —— 60fps 下写 200 格会很贵）
   3) **销毁**本帧不再需要的节点（场景切换/收起）

 层序（2026-11-02 校正，见 view_layers.lua 头注释的官方出处）：
   官方：层级越大越靠上；同层级按创建时序、**后创建的在上**。
   本模块用**创建顺序**实现层号（Lua 侧没有设层级的 API）⇒ 建完才发现该「下沉」的节点
   无法原地重排；此时记 issue 并把节点建在当前层（可见但不合层序）——让 bug 暴露而不是静默。
   ⚠ 旧结论「SetAsLastSibling 在模拟器不准/是空操作」已作废：真因是 platform.lua 曾把
   SetAsLastSibling/SetAsFirstSibling 写成空函数。现在它们是真实现（SetSiblingIndex 家族，
   返回 boolean），**需要运行时重排可以直接用**，不必重建整棵树。
========================================================================]]

local M = {}

M.new = function(spec)
  spec = spec or {}
  local P = spec.platform
  local L = spec.layers
  if not P then error('render: 需要 spec.platform') end
  if not L then error('render: 需要 spec.layers（view_layers）') end
  local logger = spec.log or function() end

  -- 引擎实例上限（真机实测约 430，常驻约 240）：render 自己记账并在逼近时告警。
  -- 为什么放在这一层：一个屏的节点数从 20 涨到 290 是描述层的事，撞上限却是引擎层的事；
  -- 只有同时看到"当前在场实例数"的地方才能提前喊（否则表现为"某个控件凭空消失"）。
  local maxInstances = spec.maxInstances or 430
  local warnAt = spec.warnAt or 0.85
  local live = 0
  local warned = false

  local prev = {}        -- key -> { ctl = ctl, applied = {field=value}, node = node }
  local issues = {}
  local stats = { created = 0, updated = 0, destroyed = 0 }

  local R = {}

  local function layerOf(n)
    return L.order(n.layer or 'hud')
  end

  local function sorted(list)
    local arr = {}
    for i = 1, #list do arr[i] = list[i] end
    for i = 1, #arr do if arr[i].seq == nil then arr[i].seq = i end end
    table.sort(arr, function(a, b)
      local la, lb = layerOf(a), layerOf(b)
      if la ~= lb then return la < lb end
      if a.seq ~= b.seq then return a.seq < b.seq end
      return tostring(a.key) < tostring(b.key)
    end)
    return arr
  end

  local function parentCtlOf(n)
    if not n.parentKey then return P.root end
    local p = prev[n.parentKey]
    return p and p.ctl or P.root
  end

  -- 只写真正变化的字段（值比较；表用小序列化避免误判）
  local function setIfChanged(ctl, applied, field, value, writer)
    if applied[field] == value then return false end
    applied[field] = value
    if writer then writer() else P.set(ctl, field, value) end
    return true
  end

  local function applyFields(ctl, n, applied)
    local touched = false
    if n.size then
      local w, h = n.size[1] or 0, n.size[2] or 0
      local key = 'size:' .. w .. 'x' .. h
      if applied.__size ~= key then
        applied.__size = key
        P.call(ctl, 'SetSizeDelta', w, h)
        touched = true
      end
    end
    if n.pos then
      local x, y = n.pos[1] or 0, n.pos[2] or 0
      local key = x .. ',' .. y
      if applied.__pos ~= key then
        applied.__pos = key
        P.call(ctl, 'SetAnchoredPosition', x, y)
        touched = true
      end
    end
    if n.color ~= nil and setIfChanged(ctl, applied, 'imageColor', n.color) then touched = true end
    -- 图元形状（rect/circle/…）：胶囊两端要靠 circle 才是圆角；值变才重贴
    if n.image ~= nil then
      local shape = type(n.image) == 'table' and n.image.s or n.image
      if applied.__image ~= shape then
        applied.__image = shape
        if P.setImage then P.setImage(ctl, shape, type(n.image) == 'table' and n.image.source or nil) end
        touched = true
      end
    end
    if n.rot ~= nil and applied.__rot ~= n.rot then
      applied.__rot = n.rot
      if P.setRotation then P.setRotation(ctl, n.rot) end
      touched = true
    end
    if n.text ~= nil and setIfChanged(ctl, applied, 'text', n.text) then touched = true end
    if n.font ~= nil and setIfChanged(ctl, applied, 'fontSize', n.font) then touched = true end
    if n.fcolor ~= nil and setIfChanged(ctl, applied, 'fontColor', n.fcolor) then touched = true end
    if n.bg ~= nil and setIfChanged(ctl, applied, 'bgColor', n.bg) then touched = true end
    if n.align ~= nil and setIfChanged(ctl, applied, 'horizontalAlignment', n.align) then touched = true end
    if n.valign ~= nil and setIfChanged(ctl, applied, 'verticalAlignment', n.valign) then touched = true end
    if n.visible ~= nil and applied.__visible ~= n.visible then
      applied.__visible = n.visible
      P.call(ctl, 'SetVisible', n.visible)
      touched = true
    end
    return touched
  end

  local function create(n)
    local ctl = P.inst(n.tpl, parentCtlOf(n))
    if not ctl then
      issues[#issues + 1] = { code = 'R0', key = n.key, msg = '实例化失败 tpl=' .. tostring(n.tpl) }
      return nil
    end
    P.set(ctl, 'name', n.name or n.key)
    local applied = {}
    applyFields(ctl, n, applied)
    if n.cursor then
      for i = 1, #n.cursor do
        local kind = n.cursor[i]
        local fn = n.on and n.on[kind] or nil
        if fn then P.onCursor(ctl, kind, fn) end
      end
    end
    stats.created = stats.created + 1
    live = live + 1
    -- 上限是**全工程总量**：多个 render 实例（棋盘 / 覆盖屏 / 预览）各建各的，
    -- 只守自己那份会漏掉"240 常驻 + 277 手册 = 517"这种情况。platform 记总账。
    local total = (P.liveCount and P.liveCount()) or live
    if not warned and total >= maxInstances * warnAt then
      warned = true
      issues[#issues + 1] = { code = 'R2', key = n.key,
        msg = string.format('实例数逼近引擎上限：全工程在场 %d（本屏 %d）/ 上限 %d'
          .. '（场景切换应先 clear；上限约 430 是全脚本总量，不是单实例量）',
          total, live, maxInstances) }
    end
    return ctl, applied
  end

  -- 检查「新节点是否必须下沉到某个已存在节点之下」——引擎做不到，暴露出来
  local function checkOrder(n, builtMaxLayer, builtMinLayer)
    local la = layerOf(n)
    if la < builtMaxLayer then
      issues[#issues + 1] = { code = 'R1', key = n.key,
        msg = string.format('层序冲突：%s(层%d) 需建在已有节点(最高层%d)之下，引擎无法重排',
          tostring(n.key), la, builtMaxLayer) }
      return true
    end
    return false
  end

  function R.apply(list)
    local arr = sorted(list)
    local builtMax, prevMax = 0, 0
    for i = 1, #arr do
      local n = arr[i]
      local key = n.key or n.name
      local ent = prev[key]
      if ent then
        local touched = applyFields(ent.ctl, n, ent.applied)
        ent.node = n
        if touched then stats.updated = stats.updated + 1 end
        if ent.applied.__layer and ent.applied.__layer > layerOf(n) then
          checkOrder(n, ent.applied.__layer, 0)
        end
      else
        local ctl, applied = create(n)
        if ctl then
          checkOrder(n, builtMax, 0)
          if layerOf(n) > builtMax then builtMax = layerOf(n) end
          prev[key] = { ctl = ctl, applied = applied, node = n }
        end
      end
    end
    -- 销毁本帧不再需要的节点（浅层优先：父后于子销毁，这里简单倒序）
    local keep = {}
    for i = 1, #arr do keep[arr[i].key or arr[i].name] = true end
    local dead = {}
    for key in pairs(prev) do
      if not keep[key] then dead[#dead + 1] = key end
    end
    table.sort(dead)
    for i = 1, #dead do
      local ent = prev[dead[i]]
      if ent and ent.ctl then
        P.destroy(ent.ctl)
        stats.destroyed = stats.destroyed + 1
        live = live - 1
      end
      prev[dead[i]] = nil
    end
    return R
  end

  -- ===== 单节点按需增删（懒创建）=====
  -- 场景：双屏中缝装饰、结算浮层里的临时贴片——它们不该常驻（真机 SetVisible(false) 对
  -- 运行时实例不生效，常驻隐藏会露出来），也不能靠"重 apply 整屏"（那会把棋盘 200 格
  -- 颜色重置成底色，因为描述里不带当前棋盘内容）。
  -- 语义：spawn 只处理列表里这些 key（建或更新），**不做销毁扫描**；despawn 只销毁给定 key。
  function R.spawn(list)
    local arr = sorted(list)
    for i = 1, #arr do
      local n = arr[i]
      local key = n.key or n.name
      local ent = prev[key]
      if ent then
        applyFields(ent.ctl, n, ent.applied)
        ent.node = n
        stats.updated = stats.updated + 1
      else
        local ctl, applied = create(n)
        if ctl then prev[key] = { ctl = ctl, applied = applied, node = n } end
      end
    end
    return R
  end

  function R.despawn(keys)
    if type(keys) == 'string' then keys = { keys } end
    for i = 1, #keys do
      local ent = prev[keys[i]]
      if ent then
        if ent.ctl then
          P.destroy(ent.ctl)
          stats.destroyed = stats.destroyed + 1
          live = math.max(0, live - 1)
        end
        prev[keys[i]] = nil
      end
    end
    return R
  end

  function R.rebuild(list)
    for key, ent in pairs(prev) do
      if ent.ctl then P.destroy(ent.ctl) end
      prev[key] = nil
    end
    live = 0
    stats.destroyed = stats.destroyed + 1
    return R.apply(list)
  end

  function R.controls()
    local map = {}
    for key, ent in pairs(prev) do map[key] = ent.ctl end
    return map
  end

  function R.get(key)
    local ent = prev[key]
    return ent and ent.ctl or nil
  end

  -- 外部写入通道：老代码里散落的 paint/抖屏等直接写控件，走这里才能让缓存保持诚实
  -- （否则下一帧 apply 会因为「缓存说没变」而跳过本该生效的写入）
  function R.write(key, field, value)
    local ent = prev[key]
    if not ent then return false end
    ent.applied[field] = value
    return P.set(ent.ctl, field, value)
  end

  function R.writePos(key, x, y)
    local ent = prev[key]
    if not ent then return false end
    ent.applied.__pos = x .. ',' .. y
    return P.call(ent.ctl, 'SetAnchoredPosition', x, y)
  end

  -- 只读拿控件（给既有的 ui.lua/fx.lua 之类还按 ctl 句柄工作的代码用）
  function R.ctl(key)
    local ent = prev[key]
    return ent and ent.ctl or nil
  end

  function R.issues() return issues end

  function R.stats() return stats end

  -- 清空全部控件：重场景（帮助页 271–289 节点）进入前必须先调它，否则 240+280 撞 430 上限
  function R.clear()
    for key, ent in pairs(prev) do
      if ent.ctl then P.destroy(ent.ctl) end
      prev[key] = nil
    end
    live = 0
    warned = false
  end

  function R.live() return live end

  -- ===== 运行时提层（官方 sibling API；2026-11-02 新增）=====
  -- 场景：同一屏里「底板/胶囊」先建、「标签/文字」后建，但业务上要求标签压在底板上。
  -- 官方 :4803「SetSiblingIndex(index)……数值越大通常越靠后、显示越靠上」、
  --      :4821-4829 SetAsFirstSibling/SetAsLastSibling。
  -- 本函数的语义 = 「把 key 这个节点在同级里提到最上（= 最后绘制）」。
  -- 返回 true=真的调成功（可断言）；false=节点不存在或无父级。
  -- ⚠ 只在**同一父级**内有效（跨父级要由构造层保证，见 view_settle 的 capLabel 注释）。
  function R.raise(key)
    local ent = prev[key]
    if not ent or not ent.ctl then return false end
    return P.call(ent.ctl, 'SetAsLastSibling') == true
  end

  -- 按给定顺序把一串 key 依次提到最上（后面的最后提 ⇒ 最终最上）
  function R.raiseAll(keys)
    local okAll = true
    for i = 1, #keys do
      if not R.raise(keys[i]) then okAll = false end
    end
    return okAll
  end

  return R
end

return M
