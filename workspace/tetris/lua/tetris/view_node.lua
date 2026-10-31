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
      if not n.tpl then add('L2', n.key, '缺 tpl（实例化会失败）') end
      if not n.size and not n.text then add('L2', n.key, '既无 size 也无 text') end
      -- L4 文字放不下
      if n.text and n.text ~= '' then
        local font = n.font or 16
        local w = n.size and n.size[1] or 0
        local h = n.size and n.size[2] or 0
        local needH, needW = V.textNeed(n.text, font, w)
        if h > 0 and needH > h + 1 then
          add('L4', n.key, string.format('文字放不下：需高 %.1f > 高 %d（%d 行）', needH, h,
            math.ceil(needH / (font * 1.45 + 4))), { needH = needH, needW = needW })
        end
        if w > 0 and needW > w + 1 and not cfg.allowOverflowWidth then
          add('L4w', n.key, string.format('单行超宽：需宽 %.1f > 宽 %d', needW, w))
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
