--[[==========================================================================
 tetris/view_node.lua —— 声明式场景描述 + 静态检查（无引擎、纯数据）
 ----------------------------------------------------------------------------
 一个节点（node）描述「屏幕上该有什么」，不负责怎么画：
   { key, layer, tpl, name, parentKey, pos={x,y}, size={w,h},
     color, text, font, fcolor, bg, align, valign, visible,
     cursor={'Click'}, on={Click=fn}, seq }
 一份场景 = node 的数组。render.lua 负责把它变成引擎控件。

 静态检查（lint）把「以前只能靠出图+人眼发现的缺陷」变成一条可跑命令：
   L1 名字重复            —— GetChild 按名寻址会歧义
   L2 缺 tpl/缺尺寸        —— 创建出来是 0 尺寸的死节点
   L3 半透明压在浅底上     —— 手机端结算三键「隐形」的真因（alpha≈0x3D 压近白）
   L4 文字放不下           —— 折行被裁（h < 行数 ×(1.45×字号+4) 或 宽度不够）
   L5 交互节点被上层覆盖   —— 结算卡压住触控胶囊 12px
   L6 交互节点层号过低     —— 在 panel 之下的按钮点不到
========================================================================]]

local M = {}

-- ===== 布局层判据 lintPlan（P1–P5）=====
-- 为什么在框架层：`V.lint` 的 L1–L6 作用于**描述层节点表**（view_*），
-- 而 `ui.lua` 的 `U.plan`（对局屏/双盘屏的布局）产出的是**布局表**（name→rect），
-- 四起真机事故里最贵的一起（双盘横幅位置）就发生在这一层且当时零判据。
-- 入口分三个、别混：V.lint(list, cfg) 查节点表；V.lintPlan(plan, cfg) 查布局表；
-- V.lintCover(items, cfg) 查**背景构图数据**（C1–C3，见本文件下端）。
--
-- 判据（搬自 tests-lua/ui_plan_test.lua，语义逐条对齐）：
--   P1 同一 bucket 内控件名唯一（GetChild 按名寻址会歧义）
--   P2 同一 bucket 内两条 rect 完全相同 = 叠印（停靠态 y==parkedY 除外）
--   P3 文字框高 ≥ 1.45×字号+4（引擎判据；不足则整条一个字都不画）
--   P4 未停靠的矩形必须落在画布内
--   P5 条目必须带 x/y/w/h 数值（nil 会在 center() 里炸）
--
-- plan 形态：{ text = {name->rect}, inst = {...}, skill = {...} }
--   · bucket 可以是 **map**（name→rect）也可以是 **array**（[{name=,x=,...}, ...]；
--     数组形态才可能出现重名，map 形态天然不可能重复 ⇒ P1 只在数组形态有意义）
-- rect 形态：{ x, y, w, h, fs }
-- cfg：{ canvas = {W,H} | {W=,H=}, parkedY = -4000, buckets = {'text','inst','skill'} } 都有默认值
-- 返回 issues[]，每项 { code = 'P1'..'P5', key = 控件名或 bucket, msg = 人话 }
local DEFAULT_BUCKETS = { 'text', 'inst', 'skill' }

local function planEntries(bucket, view)
  -- 统一成 [{ name=, r= }]，数组与 map 两种形态都吃
  local out = {}
  if type(view) ~= 'table' then return out end
  if #view > 0 then
    for i = 1, #view do
      local r = view[i]
      if type(r) == 'table' then
        out[#out + 1] = { name = r.name or r.key or ('[' .. i .. ']'), r = r }
      else
        out[#out + 1] = { name = '[' .. i .. ']', r = nil }
      end
    end
  else
    for name, r in pairs(view) do
      out[#out + 1] = { name = tostring(name), r = r }
    end
  end
  return out
end

local function cfgNums(cfg)
  local cv = cfg.canvas or {}
  local W = tonumber(cv.W or cv[1]) or 1600
  local H = tonumber(cv.H or cv[2]) or 900
  return W, H, tonumber(cfg.parkedY) or -4000
end

local function lintPlan(plan, cfg)
  plan = plan or {}
  cfg = cfg or {}
  local W, H, parkedY = cfgNums(cfg)
  local buckets = cfg.buckets or DEFAULT_BUCKETS
  local issues = {}
  local function add(code, key, msg) issues[#issues + 1] = { code = code, key = key, msg = msg } end

  for _, bucket in ipairs(buckets) do
    local list = planEntries(bucket, plan[bucket])
    -- P1 重名（只有数组形态可能发生）
    local seen = {}
    for i = 1, #list do
      local nm = list[i].name
      if seen[nm] then
        add('P1', nm, string.format('bucket=%s 内控件名重复（GetChild 按名寻址会歧义）', bucket))
      end
      seen[nm] = true
    end
    -- P5 数值完整（先跑：后面三条判据都要求 rect 是表）
    local usable = {}
    for i = 1, #list do
      local r = list[i].r
      if type(r) ~= 'table' or type(r.x) ~= 'number' or type(r.y) ~= 'number'
        or type(r.w) ~= 'number' or type(r.h) ~= 'number' then
        add('P5', list[i].name, string.format('bucket=%s 缺 x/y/w/h 数值（center() 会炸）', bucket))
      else
        usable[#usable + 1] = list[i]
      end
    end
    -- P2 叠印 / P3 框高 / P4 出画布（停靠态一律跳过）
    local seenRect = {}
    for i = 1, #usable do
      local e = usable[i]
      local r = e.r
      if r.y ~= parkedY then
        local k = string.format('%.1f|%.1f|%.1f|%.1f', r.x, r.y, r.w, r.h)
        if seenRect[k] then
          add('P2', e.name, string.format('bucket=%s 与 %s 完全同矩形 (%s) = 叠印', bucket, seenRect[k], k))
        else
          seenRect[k] = e.name
        end
        if type(r.fs) == 'number' then
          local need = 1.45 * r.fs + 4
          if r.h + 0.01 < need then
            add('P3', e.name, string.format('bucket=%s 框高 %.1f < 需 %.1f（fs=%d，整条不会画）',
              bucket, r.h, need, r.fs))
          end
        end
        local outX = (r.x - r.w / 2) < -W / 2 - 1 or (r.x + r.w / 2) > W / 2 + 1
        local outY = (r.y - r.h / 2) < -H / 2 - 1 or (r.y + r.h / 2) > H / 2 + 1
        if outX or outY then
          add('P4', e.name, string.format('bucket=%s 出画布 x=%.0f y=%.0f w=%.0f h=%.0f（画布 %dx%d）',
            bucket, r.x, r.y, r.w, r.h, W, H))
        end
      end
    end
  end
  return issues
end

M.lintPlan = lintPlan

-- ===== 背景铺满判据 lintCover（C1–C3）+ 旋转外接盒 rectAABB =====
-- 为什么第三个入口必须存在：背景构图是一张**数据表**（一组 {x,y,w,h,rot} 图元，见
-- `cfg.MODE_BG`），它既不进 `V.lint`（描述层节点表）也不进 `V.lintPlan`（布局表），
-- 于是 Tetris v6.2 出现过「用户报两侧露白」而四道判据全绿的局面：运行时那条
-- `bg cover ok` 把**整屏 wash** 也算进外缘，而 wash 恒盖满 ⇒ 判据恒真（假绿）。
-- 现在把判据钉在**数据不变量**上，运行时只负责报告实测外缘。
--
--   C1 图元并集 AABB ⊇ 设计板 [-baseW/2, baseW/2] × [-baseH/2, baseH/2]
--   C2 每条图元必须有 x/y/w/h 数值（nil 会让 SetSizeDelta 静默拿到 0 ⇒ 画成一个点）
--   C3 rot 若给就必须是数值（真机 SetLocalRotation 三参，nil 会抛）
--
-- 为什么 C1 查"设计板覆盖"而不是"画布覆盖"（可证，且与画布无关）：
--   实现用 cover 缩放 `bs = max(W/baseW, H/baseH)` ⇒ 像素外缘 ≥ (baseW/2)·bs ≥ W/2，
--   且 ≥ (baseH/2)·bs ≥ H/2 ⇒ **任意画布**四边 0 缺口。所以数据在设计板上盖满就够了，
--   不必在每张画布上各验一次；反过来，某张画布上量到缺口，说明数据本身没盖满。
local function rectAABB(x, y, w, h, rot)
  local rad = math.rad(rot or 0)
  local ca, sa = math.abs(math.cos(rad)), math.abs(math.sin(rad))
  local ex = (w / 2) * ca + (h / 2) * sa
  local ey = (w / 2) * sa + (h / 2) * ca
  return x - ex, y - ey, x + ex, y + ey
end

local function lintCover(items, cfg)
  items = items or {}
  cfg = cfg or {}
  local base = cfg.base or {}
  local baseW = tonumber(base.W or base[1]) or tonumber(cfg.baseW) or 1280
  local baseH = tonumber(base.H or base[2]) or tonumber(cfg.baseH) or 720
  local tol = tonumber(cfg.tol) or 0
  local issues = {}
  local function add(code, key, msg) issues[#issues + 1] = { code = code, key = key, msg = msg } end

  local L, R, B, T = math.huge, -math.huge, math.huge, -math.huge
  local n = 0
  for i = 1, #items do
    local it = items[i]
    local key = (type(it) == 'table' and (it.name or it.k)) or ('[' .. i .. ']')
    if type(it) ~= 'table' or type(it.x) ~= 'number' or type(it.y) ~= 'number'
      or type(it.w) ~= 'number' or type(it.h) ~= 'number' then
      add('C2', key, '缺 x/y/w/h 数值（SetSizeDelta 会静默拿到 0，画出来是个点）')
    elseif it.rot ~= nil and type(it.rot) ~= 'number' then
      add('C3', key, string.format('rot 不是数值（%s），真机 SetLocalRotation 会抛', tostring(it.rot)))
    else
      local x0, y0, x1, y1 = rectAABB(it.x, it.y, it.w, it.h, it.rot)
      if x0 < L then L = x0 end
      if x1 > R then R = x1 end
      if y0 < B then B = y0 end
      if y1 > T then T = y1 end
      n = n + 1
    end
  end

  local needX, needY = baseW / 2, baseH / 2
  local ext = { L = L, R = R, B = B, T = T, n = n, baseW = baseW, baseH = baseH }
  if n == 0 then
    add('C1', '(empty)', string.format('没有任何可用图元（设计板 %dx%d 无人覆盖）', baseW, baseH))
    return issues, ext
  end
  local dxL, dxR, dyB, dyT = -needX - L, R - needX, -needY - B, T - needY
  ext.dxL, ext.dxR, ext.dyB, ext.dyT = dxL, dxR, dyB, dyT
  if dxL < -tol or dxR < -tol or dyB < -tol or dyT < -tol then
    add('C1', '设计板缺口', string.format(
      '构图没画到设计板边沿：左缺 %.0f 右缺 %.0f 下缺 %.0f 上缺 %.0f（设计板 %dx%d，%d 条图元 ext=%.0f,%.0f,%.0f,%.0f）',
      math.max(0, -dxL), math.max(0, -dxR), math.max(0, -dyB), math.max(0, -dyT),
      baseW, baseH, n, L, R, B, T))
  end
  return issues, ext
end

M.rectAABB = rectAABB
M.lintCover = lintCover

local CJK_BYTES = {}

M.new = function(spec)
  spec = spec or {}
  local L = spec.layers
  if not L then error('view_node: 需要 spec.layers（view_layers）') end
  local opts = spec.opts or {}

  local V = {}

  -- ===== 颜色工具（ARGB 有符号 32 位 ↔ 通道）=====
  function V.unpack(color)
    local v = color or 0
    if v < 0 then v = v + 4294967296 end
    local a = v // 16777216 % 256
    local r = v // 65536 % 256
    local g = v // 256 % 256
    local b = v % 256
    return a, r, g, b
  end

  function V.alpha(color)
    local a = V.unpack(color)
    return a
  end

  -- 感知亮度（0..255）：判断「浅底上用白色半透明」这类隐形
  function V.luma(color)
    local _, r, g, b = V.unpack(color)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  end

  function V.rect(n)
    local x, y = 0, 0
    local w, h = 0, 0
    if n.pos then x, y = n.pos[1] or 0, n.pos[2] or 0 end
    if n.size then w, h = n.size[1] or 0, n.size[2] or 0 end
    return x - w / 2, y - h / 2, x + w / 2, y + h / 2
  end

  function V.overlap(a, b)
    local ax0, ay0, ax1, ay1 = V.rect(a)
    local bx0, by0, bx1, by1 = V.rect(b)
    local ox = math.min(ax1, bx1) - math.max(ax0, bx0)
    local oy = math.min(ay1, by1) - math.max(ay0, by0)
    if ox <= 0 or oy <= 0 then return 0, 0, 0 end
    local aArea = math.max(1, (ax1 - ax0) * (ay1 - ay0))
    return ox * oy, ox * oy / aArea, oy
  end

  -- ===== 文本量算（与项目既有判据一致：行高 = 1.45×字号 + 4）=====
  local function glyphWidth(ch, font)
    local b = string.byte(ch)
    if b and b >= 0xE4 and b <= 0xE9 then return font end      -- 常见 CJK UTF-8 首字节
    if ch == ' ' then return font * 0.32 end
    return font * 0.55
  end

  function V.textNeed(text, font, maxW)
    font = font or 16
    text = text or ''
    local lines = 1
    local perLine, best = {}, 0
    local cur = 0
    local i = 1
    local n = #text
    while i <= n do
      local b = string.byte(text, i)
      local len = 1
      if b >= 0xF0 then len = 4 elseif b >= 0xE0 then len = 3 elseif b >= 0xC0 then len = 2 end
      local ch = string.sub(text, i, i + len - 1)
      if ch == '\n' then
        perLine[#perLine + 1] = cur
        if cur > best then best = cur end
        cur = 0
        lines = lines + 1
      else
        cur = cur + glyphWidth(ch, font)
      end
      i = i + len
    end
    if cur > best then best = cur end
    perLine[#perLine + 1] = cur
    local needH = lines * (font * 1.45 + 4)
    local wrapped = lines
    if maxW and maxW > 0 and best > maxW then
      -- 估算折行后的行数（粗估：总宽 / 可用宽，向上取整）
      local total = 0
      for k = 1, #perLine do total = total + perLine[k] end
      wrapped = math.max(lines, math.ceil(total / math.max(1, maxW)))
      needH = wrapped * (font * 1.45 + 4)
    end
    return needH, best, wrapped
  end

  -- ===== 排序：层号升序；同层按 seq（缺省按数组下标）=====
  function V.sort(list)
    local arr = {}
    for i = 1, #list do
      local n = list[i]
      arr[i] = n
      if n.seq == nil then n.seq = i end
    end
    table.sort(arr, function(a, b)
      local la = L.order(a.layer or 'hud')
      local lb = L.order(b.layer or 'hud')
      if la ~= lb then return la < lb end
      if a.seq ~= b.seq then return a.seq < b.seq end
      return tostring(a.key) < tostring(b.key)
    end)
    return arr
  end

  -- ===== 静态检查 =====
  -- opts: { serverText = true（服务端 textbox 永不压运行时实例）, minAlpha = 0x80,
  --         interactiveLayers = {'touch','card','panel'} }
  function V.lint(list, cfg)
    cfg = cfg or {}
    local minAlpha = cfg.minAlpha or 0x80
    local lightLuma = cfg.lightLuma or 200
    -- v6.26：可选「可用模板键集合」。给了才判 L2t，不给则行为与旧版完全一致（12 个既有调用点零影响）。
    -- 入参接受数组 {'cell','hit'} 或集合 {cell=true}，这里统一成集合。
    local tplSet
    if cfg.tplKeys then
      tplSet = {}
      for k, v in pairs(cfg.tplKeys) do
        if type(k) == 'number' then tplSet[v] = true else tplSet[k] = true end
      end
    end
    local issues = {}
    local sorted = V.sort(list)

    local function add(code, key, msg, extra)
      issues[#issues + 1] = { code = code, key = key, msg = msg, extra = extra }
    end

    -- L1 名字重复（按 parentKey 分组）
    local seen = {}
    for i = 1, #sorted do
      local n = sorted[i]
      local name = n.name or n.key
      local p = n.parentKey or 'root'
      local k = p .. '/' .. tostring(name)
      if seen[k] then
        add('L1', n.key, '控件名重复（' .. k .. '）—— GetChild 按名寻址会歧义')
      else
        seen[k] = true
      end
    end

    for i = 1, #sorted do
      local n = sorted[i]
      -- L2 缺模板 / 缺尺寸
      -- ⚠ 判据边界（2026-11-17 复盘实测）：这里只判**字段在不在**，不判 tpl 的**键是否可解析**。
      -- 实证：`tpl='definitely_missing_tpl'` 的节点本函数报 0 个问题——而旧文案写的是
      -- 「缺模板（实例化会失败）」，会让人以为这层已经防住了。键的可用性由
      -- `tests-lua/tpl_contract_test.lua` 单点负责（扫源码 × config 的候选表），不要在这里再写一份。
      if not n.tpl then add('L2', n.key, '缺 tpl 字段（实例化会失败）') end
      -- L2t：tpl 字段有值，但**这个键不在可用集合里**。这一条把"模板键契约"从
      -- 「每个项目各写一份源码扫描测试」上移成框架能力：调用方把真实键集合传进来即可。
      if tplSet and n.tpl and not tplSet[n.tpl] then
        local keys = {}
        for k in pairs(tplSet) do keys[#keys + 1] = tostring(k) end
        table.sort(keys)
        local shown = {}
        for i = 1, math.min(#keys, 6) do shown[i] = keys[i] end
        add('L2t', n.key, string.format('tpl 键 %q 不可用（已声明: %s%s）',
          tostring(n.tpl), table.concat(shown, ','), #keys > 6 and ',…' or ''))
      end
      if not n.size and not n.text then add('L2', n.key, '既无 size 也无 text') end
      -- L4 文字放不下
      if n.text and n.text ~= '' then
        local font = n.font or 16
        local w = n.size and n.size[1] or 0
        local h = n.size and n.size[2] or 0
        local needH, needW = V.textNeed(n.text, font, w)
        -- 判据必须与引擎逐字一致：引擎 requiredHeight = 1.2f + 0.25f + 4 = 1.45f + 4，
        -- 留 1px 余量会放过「差 0.85px」的边界（2026-10-31 实机：13 号字 h=22 时
        -- 引擎 fits=false 整条不画，而旧判据 22.85 <= 22+1 判它过）。这里只留 0.01 的浮点容差。
        if h > 0 and needH > h + 0.01 then
          add('L4', n.key, string.format('文字放不下：需高 %.1f > 高 %.1f（%d 行）', needH, h,
            math.ceil(needH / (font * 1.45 + 4))), { needH = needH, needW = needW })
        end
        if w > 0 and needW > w + 0.01 and not cfg.allowOverflowWidth then
          add('L4w', n.key, string.format('单行超宽：需宽 %.1f > 宽 %.1f', needW, w))
        end
      end
      -- L3 半透明压在浅底上（找它下面最近一张盖住其中心的底色）
      local a = V.alpha(n.color)
      if n.color ~= nil and a > 0 and a < minAlpha then
        local cx = (V.rect(n))
        local nx0, ny0, nx1, ny1 = V.rect(n)
        cx = (nx0 + nx1) / 2
        local cy = (ny0 + ny1) / 2
        for j = i - 1, 1, -1 do
          local under = sorted[j]
          if under.color ~= nil and under ~= n then
            local ux0, uy0, ux1, uy1 = V.rect(under)
            if cx >= ux0 and cx <= ux1 and cy >= uy0 and cy <= uy1 then
              local um = V.luma(under.color)
              if um >= lightLuma then
                add('L3', n.key, string.format(
                  '半透明压在浅底上 ⇒ 近似隐形：本节点 alpha=0x%02X，底下 %s 亮度 %.0f',
                  a, tostring(under.key or under.name), um))
              end
              break
            end
          end
        end
      end
      -- L5 交互节点被上层覆盖
      local interactive = n.on ~= nil or n.cursor ~= nil
      if interactive then
        for j = i + 1, #sorted do
          local over = sorted[j]
          if over.parentKey == n.parentKey and over.visible ~= false then
            local _, ratio, oy = V.overlap(n, over)
            if ratio > 0.25 and (over.on ~= nil or over.color ~= nil) then
              add('L5', n.key, string.format('交互节点被上层 %s 覆盖 %.0f%%（重叠 %.1fpx）',
                tostring(over.key or over.name), ratio * 100, oy))
              break
            end
          end
        end
        -- L6 层号过低
        if L.order(n.layer or 'hud') < L.order('panel') then
          add('L6', n.key, '交互节点在 panel 层之下（面板会挡住点击）')
        end
      end
    end

    return issues
  end

  -- 布局层判据（与 V.lint 并列的第二个入口；实现见模块级 M.lintPlan）
  V.lintPlan = lintPlan
  -- 背景铺满判据 + 旋转外接盒（第三个入口；实现见模块级 M.lintCover / M.rectAABB）
  V.lintCover = lintCover
  V.rectAABB = rectAABB

  -- 便捷：把一组节点里某个 key 取出来
  function V.get(list, key)
    for i = 1, #list do
      if list[i].key == key then return list[i] end
    end
    return nil
  end

  return V
end

return M
