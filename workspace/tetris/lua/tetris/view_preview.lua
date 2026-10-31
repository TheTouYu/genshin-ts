--[[==========================================================================
 tetris/view_preview.lua —— NEXT / HOLD 预览列的**纯描述**（opts → node 数组，零引擎调用）
 ----------------------------------------------------------------------------
 为什么有它：现网 12 颗预览格是手写实例化（main.lua:5822-5834）+ 一个把几何/配色/
 空槽清理/暂存闸搅在一起的 renderNext（main.lua:1223-1264）。后果是三类缺陷只有开模拟器
 出图才看得见：

   ① 空槽脏格（A13「灰方块」同族）：renderNext 的早退发生在「把格子停靠到画布外」**之前**
      —— main.lua:1225 `if g.gameOver or not g.nextName then return end`，而停靠写在
      main.lua:1247。⇒ 没有 nextName 的那些帧，上一手留下的 4 颗格被刷成 COL_BG
      （main.lua:1224）却仍停在原位 ⇒ HUD 上留下 4 个浅蓝方块。
   ② 标签与格子各自漂移：暂存格子用 -RIGHT_CX 定位（main.lua:1254），而「暂存」标签恒用
      -(halfW-230)（main.lua:3435）⇒ 手机双持时 RIGHT_CX = gutR = halfW-103（ui.lua:352），
      两者横向错开 127px（1280 画布）。文案压在格子左边的空地上。
   ③ 枢轴硬编码 2.5（main.lua:1230 的 (c-2.5) 与 (2.5-r)）：这只对 4 宽的 I 形成立；
      O（2×2）的墨迹中心实测偏 (-20,+20)，即**整整一格**（左 20、上 20）；
      三宽方块横向偏 10px（纵方向另有 10px 是 T/S/Z/J/L 的墨迹本身不填满第 3 行，属方块形状，
      不是枢轴问题）。逐格读数见 tests ①7 / ①′3 / ①′4。

 本文件把「预览列该画什么」变成可 headless 断言的描述，三条被结构消灭：
   C1 空槽**同帧停靠**：槽里有块 ⇒ 4 颗彩格；槽里没块 ⇒ 4 颗 COL_BG 格停在 PARK。
      「先刷色、下一帧再挪」这种时序窗口在本通道里表达不出来。
   C2 单一源：标签与格子的 x 都从同一个 CX 派生（不是两份常量）⇒ ② 的错位不可能发生。
   C3 枢轴可选：opts.center='bbox' 用 (n+1)/2 居中；缺省 'network' 照抄现网 2.5
      —— **默认不改现网观感**，只把选择权交给调用方（改观感是裁决，不是重构顺手做）。

 数值出处（写死的都在 M.GEO 里标了锚；改数值只改 M.GEO）：
   · 第一块 4 格：18px / 格距 20 / 中心 y=150 / 满色            ← main.lua:1229-1231
   · 第二块 4 格：14px / 格距 14 / 中心 y=78 / 白化 0.46         ← main.lua:1236-1239
     第 3..5 块（现网没有，队列更长时才有）：沿用第二块的缩略规格，y 每槽 -72
   · 暂存 4 格：18px / 格距 20 / 中心 (-CX,150) / can=false 白化 0.5
                                                              ← main.lua:1252-1256
   · 空槽色 COL_BG、停靠位 (-4000,-4000)                        ← main.lua:1226 与 1247
   · 枢轴 2.5                                                  ← main.lua:1230
   · 创建期尺寸 18/14/18                                ← main.lua:5828（占位位 400/400/-400
     是渲染前的临时值，renderNext 会覆盖；本文件不复制占位位）
   · 「下一个」240×44 @ (CX,255)、fs22、墨色 textSub、valign=Middle
                                                     ← main.lua:3425-3427 与 615
   · 「暂存」200×44 @ (-CX,255)、fs22、墨色 textMain  ← main.lua:3434-3442
   · CX 公式：PC/手机单持 = halfW-230；手机双持 = gutR = halfW-103
                                                     ← ui.lua:156-158 / 204 / 285 / 352
   · 白化算法 MS.fade（保 alpha、向 255 混）                  ← main.lua:1204-1210

 与现网的差异（逐条理由）：
   D1 空槽一律「当帧停靠」——修 ①（现网早退后留脏格）。
   D2 「暂存」标签 x = -CX（与格子同源），现网恒为 -(halfW-230) —— 修 ②（双持错位）。
   D3 canHold=false 时标签墨色 textMain → textDim —— 补强「可识别」。理由有读数：
      MS.fade(黄块,0.5) 的亮度 231.2 与槽底 COL_BG 的 239.8 只差 8.6（见 tests ④），
      单纯白化在浅底上分辨不出；文字灰化 0 节点成本地补上第二个通道。
   D4 队列 >2 时多画缩略块（现网只画 2 块）—— 任务书要「队列 1..5 节点数线性」。
   D5 一切预览节点归一层 'hud'（现网靠创建顺序，且创建位置是临时值）。
   D6 手机双持时「下一个」标签**停靠**：现网 ui.lua:356 已把它挪到 -4000（避免压右上角
      「说明」），而 main.lua:3427 的 layout 又把它写回 (RIGHT_CX,255) —— 两处写同一个标签。
      本模块取「停靠」：audit 能证明留在 gutR 会出界（537+240/2=657 > halfW=640）。
      「暂存」标签在双持下留在 -537（左缘 -637，仍在 ±640 内）。

 接线期三个可选（都为缺省关，纯描述默认口径不变）：
   · opts.cx          调用方已有单一真源时直接给（main 的 RIGHT_CX 来自 ui.lua 的 plan）；
                      不给才按 canvas/device/dual 推算 —— 避免回到「两份常量」。
   · opts.noLabel     不出标题节点（现网「下一个/暂存」是服务端 textbox，运行时再出一份=双影）。
   · opts.legacyNames 引擎侧控件名沿用现网口径 next1..next8 / hold1..hold4（render 键仍是 pv*，
                      所以既有用例按名字取控件、按 pv 前缀数节点两边都成立）。

 契约：本文件不 require 任何 tetris 模块、不 print、不写全局；config/layers 全由外部注入。
========================================================================]]

local M = {}

-- ===== 几何/配色常量（全照抄现网，锚见头注释）=====
M.GEO = {
  -- 第一块
  cell1 = 18, pitch1 = 20, y1 = 150,
  -- 第二块及以后（缩略）
  cell2 = 14, pitch2 = 14, y2 = 78, fade2 = 0.46,
  -- 槽位纵向步长：150 - 78 = 72（现网两块的中心距）
  stepY = 72,
  -- 暂存
  holdCell = 18, holdPitch = 20, holdY = 150, holdFade = 0.5,
  -- 枢轴（现网硬编码 2.5；(n+1)/2 才是居中值）
  pivot = 2.5,
  -- 标题文字
  labelY = 255, labelWNext = 240, labelWHold = 200, labelH = 44, labelFont = 22,
  -- 空槽停靠位：运行时实例的 SetVisible(false) 不可靠，停靠到画布外是本工程已验证的做法
  parkX = -4000, parkY = -4000,
  -- 预览列横向内缩：PC/手机单持 halfW-230（ui.lua:156-158/204/285），手机双持 halfW-103（ui.lua:352）
  inset = 230, insetDualMobile = 103,
}

M.LABEL_NEXT = '下一个'
M.LABEL_HOLD = '暂存'
M.MAX_SLOTS = 5           -- 队列更长时最多画 5 块（引擎实例预算；现网画 2 块）
M.LAYER = 'hud'           -- 预览列属 HUD 层（现网 hudNext/holdLab 即 HUD 材质）
M.DEFAULT_CANVAS = { 1280, 720 }

-- 颜色分解/合成（与 config.lua:176 的 C() 同算法）
local function C(a, r, g, b) return a * 16777216 + r * 65536 + g * 256 + b end
M.C = C

-- 白化：向 255 混，alpha 不动 —— 逐行照抄 main.lua:1204-1210 的 MS.fade（含 +0.5 取整）
local function fade(v, k)
  v = v or 0
  local a = v // 16777216
  local rr, gg, bb = (v // 65536) % 256, (v // 256) % 256, v % 256
  local m = 1 - k
  return C(a,
    math.floor(255 - (255 - rr) * m + 0.5),
    math.floor(255 - (255 - gg) * m + 0.5),
    math.floor(255 - (255 - bb) * m + 0.5))
end
M.fade = fade

-- 亮度（view_node.lint 同口径：0.2126/0.7152/0.0722）——给自己/调用方做"对比度"判据用
local function luma(v)
  v = v or 0
  local r, g, b = (v // 65536) % 256, (v // 256) % 256, v % 256
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
end
M.luma = luma

local function isNum(v) return type(v) == 'number' and v == v and v ~= math.huge and v ~= -math.huge end

M.new = function(spec)
  spec = spec or {}
  local CFG = assert(spec.config, 'view_preview: 需要 spec.config')
  local L = assert(spec.layers, 'view_preview: 需要 spec.layers')
  local SH = assert(CFG.SHAPES, 'view_preview: config.SHAPES 缺失（形状真源必须来自 config）')
  local C_BG = assert(CFG.COL_BG, 'view_preview: config.COL_BG 缺失（空槽底色）')
  local TH = assert(CFG.THEME, 'view_preview: config.THEME 缺失（标签墨色）')
  -- 层名在装配期就校验：拼错不能等到真机不出图才发现
  L.order(M.LAYER)

  local G = M.GEO
  local S = {}

  -- ===== 预览列横向中心：单一源（标签与格子共用）=====
  local function cxOf(opts)
    -- 调用方已有单一真源时直接给（main 的 RIGHT_CX 由 ui.lua 的 plan 决定）——
    -- 否则这里再算一遍就是「两份常量」，正是本模块要消灭的那类漂移。
    if opts.cx then return opts.cx end
    local canvas = opts.canvas or M.DEFAULT_CANVAS
    local halfW = (canvas[1] or M.DEFAULT_CANVAS[1]) / 2
    if opts.device == 'mobile' and opts.dual then return halfW - G.insetDualMobile end
    return halfW - G.inset
  end
  S.cx = cxOf

  -- ===== 枢轴：'network' 照抄 2.5；'bbox' = (n+1)/2 居中 =====
  local function pivotOf(shape, opts)
    if opts.center == 'bbox' then
      return (assert(shape.n, 'view_preview: SHAPES 项缺 n（包围盒边长）') + 1) / 2
    end
    return G.pivot
  end

  -- ===== 槽位规格：第 i 块在哪、多大、多淡 =====
  local function slotGeom(i)
    if i <= 1 then return { cell = G.cell1, pitch = G.pitch1, y = G.y1, fade = 0 } end
    return { cell = G.cell2, pitch = G.pitch2, y = G.y1 - G.stepY * (i - 1), fade = G.fade2 }
  end
  S.slotGeom = slotGeom

  local function labelNode(key, text, x, y, w, ink, park)
    return { key = key, layer = M.LAYER, tpl = 'stext', name = key,
      pos = park and { G.parkX, G.parkY } or { x, y }, size = { w, G.labelH },
      text = text, font = G.labelFont, fcolor = ink,
      align = 'Middle', valign = 'Middle',          -- valign=Middle 是硬要求（main.lua:615）
      role = 'label', parked = park or nil }
  end

  -- 一格：色 = 满色或白化；空槽走 park
  local function putCell(out, key, x, y, cell, color, role, slot, shape, k, dim, nm)
    out[#out + 1] = {
      key = key, layer = M.LAYER, tpl = 'cell', name = nm or key,
      pos = { x, y }, size = { cell, cell }, color = color,
      role = role, slot = slot, cellIndex = k, shape = shape,
      dim = dim or nil, parked = nil,
    }
  end

  local function putParked(out, key, cell, cellSize, role, slot, k, nm)
    out[#out + 1] = {
      key = key, layer = M.LAYER, tpl = 'cell', name = nm or key,
      pos = { G.parkX, G.parkY }, size = { cellSize, cellSize }, color = cell,
      role = role, slot = slot, cellIndex = k, parked = true,
    }
  end

  -- 一块方块（有块 ⇒ 4 颗彩格；没块 ⇒ 4 颗空槽格停靠）。x 加法向 sign（暂存镜像）
  local function putPiece(out, prefix, tag, slot, name, ox, oy, geom, sign, opts, role, dim)
    -- legacyNames：引擎侧控件名保持现网口径（next1..next8 / hold1..hold4），
    -- 而 render 的键仍是 pv*（controls() 可按 pv 前缀数节点、键稳定可增量）。
    local legacy = opts.legacyNames == true
    local function nmOf(k)
      if not legacy then return nil end
      if tag == 'hold' then return 'hold' .. k end
      return 'next' .. ((slot - 1) * 4 + k)
    end
    local s = name and SH[name] or nil
    if not s then
      -- name=nil 是「真空槽」；name 给了但 SHAPES 里没有 = 调用方拼错/数据缺失 ⇒ 打 badShape
      -- 让 audit 报 P4（静默画成空槽是最贵的那种失败：看起来像"预览不显示"）
      for k = 1, 4 do
        putParked(out, prefix .. k, C_BG, geom.cell, 'emptyCell', slot, k, nmOf(k))
        if name ~= nil then out[#out].badShape = name end
      end
      return 0
    end
    local p = pivotOf(s, opts)
    local col = dim and fade(s.color, geom.fade) or s.color
    for k = 1, #s.cells do
      local r, c = s.cells[k][1], s.cells[k][2]
      putCell(out, prefix .. k,
        sign * ox + (c - p) * geom.pitch, oy + (p - r) * geom.pitch,
        geom.cell, col, role, slot, name, k, dim, nmOf(k))
    end
    return #s.cells
  end

  -- ===== NEXT：标题 + 第 1..slots 块 =====
  function S.next(opts)
    opts = opts or {}
    local queue = opts.queue or {}
    local cx = cxOf(opts)
    local slots = opts.slots or math.min(#queue, M.MAX_SLOTS)
    if slots < 0 then slots = 0 end
    if slots > M.MAX_SLOTS then slots = M.MAX_SLOTS end   -- 实例预算硬顶，显式传参也不放行
    local out = {}
    -- noLabel：接线期现网标题是服务端 textbox，运行时再出一份文字就是双影
    if not opts.noLabel then
      -- 手机双持：标题停靠（见头注释 D6；audit 能证明留在 gutR 会出界）
      out[#out + 1] = labelNode('pvNextLabel', M.LABEL_NEXT, cx, G.labelY, G.labelWNext,
        opts.accent or TH.textSub, opts.device == 'mobile' and opts.dual == true)
    end
    for i = 1, slots do
      local g = slotGeom(i)
      putPiece(out, 'pvNext' .. i .. 'C', 'next', i, queue[i], cx, g.y, g, 1, opts,
        'nextCell', (g.fade or 0) > 0)
    end
    return out
  end

  -- ===== HOLD：标题 + 4 格（can=false ⇒ 白化 + 文字灰化）=====
  function S.hold(opts)
    opts = opts or {}
    local cx = cxOf(opts)
    local can = opts.canHold ~= false
    local out = {}
    if not opts.noLabel then
      out[#out + 1] = labelNode('pvHoldLabel', M.LABEL_HOLD, -cx, G.labelY, G.labelWHold,
        can and TH.textMain or TH.textDim)
    end
    local g = { cell = G.holdCell, pitch = G.holdPitch, y = G.holdY, fade = G.holdFade }
    putPiece(out, 'pvHoldC', 'hold', 0, opts.holdName, cx, g.y, g, -1, opts, 'holdCell', not can)
    return out
  end

  -- ===== 越界/重叠自检（view_node.lint 没有画布边界检查，这一层必须自己拥有）=====
  -- codes: P1 越界（停靠位白名单除外）｜P2 坐标非法（NaN/inf/非数）｜P3 同槽两格重叠
  --        ｜P4 方块名不在 config.SHAPES（会静默画成空槽）
  local function rectOf(n)
    local x, y = n.pos[1], n.pos[2]
    local w = n.size and n.size[1] or 0
    local h = n.size and n.size[2] or 0
    return x - w / 2, y - h / 2, x + w / 2, y + h / 2
  end

  function S.audit(list, canvas)
    local issues = {}
    local function add(code, key, msg)
      issues[#issues + 1] = { code = code, key = key, msg = msg }
    end
    local halfW, halfH = nil, nil
    if canvas then
      halfW = (canvas[1] or 0) / 2
      halfH = (canvas[2] or 0) / 2
    end
    for i = 1, #list do
      local n = list[i]
      if n.badShape then
        add('P4', n.key, '方块名 ' .. tostring(n.badShape) .. ' 不在 config.SHAPES ⇒ 该槽被画成空槽')
      end
      if not n.pos or not isNum(n.pos[1]) or not isNum(n.pos[2]) then
        add('P2', n.key, '坐标非法：' .. tostring(n.pos and n.pos[1]) .. ',' .. tostring(n.pos and n.pos[2]))
      else
        local parked = (n.pos[1] == G.parkX and n.pos[2] == G.parkY)
        if not parked and halfW then
          local x0, y0, x1, y1 = rectOf(n)
          if x0 < -halfW or x1 > halfW or y0 < -halfH or y1 > halfH then
            add('P1', n.key, string.format('越界：矩形 [%.1f,%.1f]-[%.1f,%.1f] 超出画布 ±%.0f×±%.0f',
              x0, y0, x1, y1, halfW, halfH))
          end
        end
      end
    end
    -- P3 同一槽内两格重叠（同槽 = 同 slot 且都在画布上）
    for i = 1, #list do
      local a = list[i]
      if a.pos and a.slot ~= nil and isNum(a.pos[1]) and isNum(a.pos[2]) then
        local ax0, ay0, ax1, ay1 = rectOf(a)
        for j = i + 1, #list do
          local b = list[j]
          if b.slot == a.slot and b.pos and isNum(b.pos[1]) and isNum(b.pos[2]) then
            local bx0, by0, bx1, by1 = rectOf(b)
            local ow = math.min(ax1, bx1) - math.max(ax0, bx0)
            local oh = math.min(ay1, by1) - math.max(ay0, by0)
            if ow > 0 and oh > 0 then
              local area = (ax1 - ax0) * (ay1 - ay0)
              if area > 0 and (ow * oh) / area > 0.25 then
                add('P3', a.key, string.format('同槽重叠：%s 与 %s 叠 %.0f%%',
                  tostring(a.key), tostring(b.key), (ow * oh) / area * 100))
                break
              end
            end
          end
        end
      end
    end
    return issues
  end

  return S
end

return M
