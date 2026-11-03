--[[==========================================================================
 tetris/view_settle.lua —— 结算页的**纯描述**（opts → node 数组，零引擎调用）
 ----------------------------------------------------------------------------
 为什么要有这个文件：结算页是「用例全绿、用户看得见错」的典型。出图实测的三条缺陷
 全都不在数值上出错，而在**结构**上出错：

   ① 手机端三颗触控键的底板与 wash 几乎同色 ⇒ 视觉隐形。
      实测（.scratch/lead/shots/v6-p2/mobile-16-9/settle.frame.json）：
      pbaagainb imageColor=0xFFFAF3FD（近白、alpha 已是 0xFF），而底是
      THEME.scrim C(236,246,253,255) / THEME.wall C(255,246,251,255)。
      任务书记作「底板 alpha=0x3D 压近白 wash」——两种说法指向同一件事：
      **底在浅 wash 上没有可辨差异**。所以只测 alpha 不够（现网 alpha 本来就是 255），
      必须同时钉住「与 wash 的亮度差」。
   ② 三颗触控键与结算卡重叠 12px，且按键先建、卡懒创建 ⇒ 引擎层序=创建序 ⇒ 按键
      顶边那 12px 连热区一起被卡吃掉（帧 json 实测 ptaagain ty=-220 h=64 ⇒ 顶边 -188，
      卡底 -200；ptaagain z=87 落在 settleText z=50 之下）。
   ③ 卡内那排三选项（`[R] 再来一局` 胶囊）与卡下三颗触控胶囊**是同一组动作**，
      移动端一次看到两遍（同一屏里 5 个可点动作入口，用户读作"重复"）。

 本模块把这三条变成三条**结构约束**，让缺陷在结构上不可能再出现：
   C1 不透明度：胶囊/描边一律过 opaque() 预混成 alpha=255（view_kit.over 同款算法）
      ⇒ 半透明底在这条通道里根本表达不出来。
   C2 层序 + 几何：选项带只允许出现在 layer='touch'（高于 panel/card）；**行位置由卡的
      矩形反解**（rowY = 卡底 - ROW_GAP - 行内最高节点(含热区)/2）⇒ 与卡重叠恒为 0，
      不靠人记住"先建卡"，也不靠人记住"别压 12px"。
   C3 变体互斥：PC 只出键位提示文字（无胶囊），mobile 只出触控胶囊（无键位提示），
      分支由 device 决定，同一次调用只能走一条 ⇒ 同一动作不会出现两遍。

 布局取舍（任务书要求"择一写进注释"）：选的是**选项带整体落在卡底之下**（净距 ≥8px），
 不是"压卡但层更高"。理由：② 的代价不只是"被盖住"，还有"按键只露一半"和
 "热区被卡吃掉的那 12px"；层序修好了后两样仍在，几何零重叠能一次全修掉。
 ⚠️ 观感代价（如实记录，交接线方裁决）：卡内容最下一行（旁白 y=-64，框高 40 ⇒ 底 -84）
 到卡底（-200）之间会空出 116px。消除它有两条路，都不在本轮边界内：
   a) 卡高 400→312 且五行整体下移 44（内容贴合卡，属于重新设计）；
   b) 换成另一支取舍（选项压卡、layer 更高），保住现网卡内观感，但热区仍被吃掉 12px。

 数值/文案出处（写死的都标锚；改数值只改本文件顶部常量或注入的 config）：
   · 卡/遮罩/三条装饰带/六槽 y/字号      ← main.lua layoutSettle
     （锚 'layoutSettle = function'：cw=min(W-240,780)、ch=400、bars 197/104/-104、
       六槽 y=140/66/16/-26/-64/-136、字 44/34/24/20/20/26、文字框 cw-60）
   · 六行字色与 alpha 系数                ← main.lua settleSetColors
     （锚 'settleSetColors = function'：C(a,185,138,60)、C(a,214,126,46)、C(a,62,74,99)、
       C(⌊0.82a⌋,124,140,168)、C(⌊0.88a⌋,noteRGB)、noteRGB 缺省 {96,112,132}）
   · 结算文案（标题/本局/最高/消行/旁白）   ← main.lua showGameOver + config.COPY.settle
     （锚 'showGameOver = function'；旁白三条锚 config.lua 'settle = {' 第 ⑥ 段）
   · 三选项几何/配色/字号/热区 +12/键位前缀 ← main.lua MS.opts（锚 'MS.opts = function'）
     variant P：geoms {-184,252,64}{56,174,52}{250,176,44}、字号 25/20/18、
     主=模式色实心+描金、次=白底+描金、三=奶油底+淡金、热区 rec.w+12、label='[R] 再来一局'、
     热区名 'hotSettle'..key、服务端 settleOpts 那句 '[R] 再来一局　[V] 回主页　[Q] 结算明细'
   · 手机三键尺寸/标签/主键 ×1.15        ← config.NUM.PHONE（ACT_W/ACT_H/actions）
     + ui.lua planScreen('settle')（aw*1.15 / ∓aw*0.62 / 行距 90）
   · 三态色板（以 state 里的 k 系数带出，render.lua 目前不读）← MS.opts paint()
     （fill：悬停 mix(-0.13)/按下 mix(-0.26) 并下沉 3px；line：悬停 mix(accent,0.78)/
       按下 mix(accent,0.60)；flat：悬停 mix(+0.04)/按下 mix(-0.10)；
       rim：悬停 mix(+0.10)/按下 mix(-0.34)）

 与现网的**已知不一致**（每条都有理由，见交付报告）：
   · 卡内那排选项搬到卡下（见"布局取舍"）；PC 因此从"三颗胶囊"变成"三行键位提示"。
   · PC 提示字色：现网主按钮是**白字压实心**（没有实心就看不见）⇒ 改墨阶
     textMain / textDim / hint，字号沿用 25/20/18。
   · 手机端标签沿用 NUM.PHONE.actions 原文（第 3 颗是"明细"，现网卡内写"结算明细"）。
   · 胶囊形状（已闭合）：render.lua 现在认节点字段 image={s='rect'|'circle'|…}，view_kit.pill
     给中段 image={s='rect'}、两端 image={s='circle'} ⇒ 圆角胶囊的观感与现网一致。
     本模块在两颗 pill 上都**显式**传 capShape='circle'（不依赖 view_kit 的缺省值），
     测试断言端点 circle / 中段 rect，防止将来有人把圆角改回方角。
     ⚠️ 形状与尺寸是**耦合**的：circle 图元贴的是「以短边为直径的内切圆」，所以端点节点必须
     是 h×h 正方形（view_kit.pill 正是这么给的）；描边 pill 也必须 circle——只圆填充会让方角
     从描边外面露出来。两端描边按 (w+7, h+7)/(w+5, h+5) 外扩、与填充同心，所见即「圆角描边
     + 圆角填充」；改尺寸时两张 pill 一起改，否则内外两张圆的直径对不上、边缘会出现台阶。

 形态开关：opts.style = 'text'（PC 缺省，键位提示三行）| 'pill'（PC 也出三颗胶囊，
 几何照 MS.opts variant P 三档 252×64/174×52/176×44、字号 25/20/18，行位置同样按卡底反解）。
 device='mobile' 恒走胶囊（触摸屏没有键盘）。两种形态共用同一套零重叠几何与热区命名。

 契约：Lua 5.3；不 require 任何 tetris 模块（config/layers/kit 由 spec 注入）；不 print；
       不调用引擎 API；chunk 顶层只有表与函数。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_settle_test.lua
 ========================================================================]]

local M = {}

-- ===== 结构常量（唯一数值源；测试逐条钉住）=====
M.CARD = { W = 780, H = 400, PADX = 240 }        -- layoutSettle: cw=min(W-240,780), ch=400
M.ROW_GAP = 8                                    -- 选项带（含热区）与卡底的最小净距 [C2]
M.HITPAD = 12                                    -- MS.opts: SetSizeDelta(rec.w+12, rec.h+12)
M.TXT_INSET = 60                                 -- layoutSettle: 文字框宽 = cw-60
M.Y = { title = 140, score = 66, best = 16, info = -26, note = -64 }   -- layoutSettle 六槽
M.FONT = { title = 44, score = 34, best = 24, info = 20, note = 20 }
M.H = { title = 80, score = 56, best = 44, info = 40, note = 40 }
M.BARS = {                                        -- 三条装饰带（layoutSettle）
  { y = 197, h = 6, inset = 0, color = 'frame' }, -- 顶部模式色强调条（ch/2-3）
  { y = 104, h = 2, inset = 150, color = 'gold' },-- 标题下细带（cw-150）
  { y = -104, h = 2, inset = 150, color = 'gold' },-- 旁白下细带
}
M.OPT_W = { 252, 174, 176 }                      -- MS.opts variant P geoms（按 rank）
M.OPT_H = { 64, 52, 44 }
M.OPT_FONT = { 25, 20, 18 }                      -- MS.opts variant P 字号
M.OPT_GAP = 50                                   -- 手机三键 home/detail 实测水平净距
M.ACT = { W = 208, H = 64, PRIMARY = 1.15, FONT = 22 }   -- NUM.PHONE.ACT_* + ui.lua
M.LAYER = { wash = 'wash', panel = 'panel', card = 'card', touch = 'touch' }   -- [C2]
M.ROLE = {
  scrim = 'scrim', shell = 'shell', card = 'card', rule = 'rule', cardText = 'cardText',
  capRim = 'capRim', capFill = 'capFill', capLabel = 'capLabel', hint = 'hint', hit = 'hit',
}
M.OPT_IDS = { 'restart', 'home', 'detail' }
M.CB = { restart = 'onRestart', home = 'onHome', backHome = 'onHome', detail = 'onDetail' }
M.WIN_TITLE = { pvp = 'P1 胜！', coop = '合作成功！' }     -- showGameOver 的胜负文案
M.TITLE = '游戏结束'                                       -- showGameOver 缺省标题
M.OPT_HINT_FMT = '[%s] %s'                                 -- MS.opts: '['..key..'] '..label
M.NOTE_RGB_FALLBACK = { 96, 112, 132 }                     -- settleSetColors 缺省 noteRGB

-- config 缺项时的兜底（与 config.lua / ui.lua 现网值逐字相同）
M.FALLBACK_OPT = {
  { key = 'R', label = '再来一局', rank = 1 },
  { key = 'V', label = '回主页', rank = 2 },
  { key = 'Q', label = '结算明细', rank = 3 },
}
M.FALLBACK_PAD = {
  { id = 'again', label = '再来一局', act = 'restart', key = 'R', rank = 1 },
  { id = 'home', label = '回主页', act = 'home', key = 'V', rank = 2 },
  { id = 'detail', label = '明细', act = 'detail', key = 'Q', rank = 3 },
}
M.FALLBACK_NOTE = {
  { text = '旅行暂歇——提瓦特还有七国等你。' },
  { text = '凯瑟琳记下了这一程：消行 {lines} 行。' },
  { text = '派蒙：再来一局吧，这次一定行！' },
}

M.new = function(spec)
  spec = spec or {}
  local cfg = assert(spec.config, 'view_settle: 需要 spec.config')
  local L = assert(spec.layers, 'view_settle: 需要 spec.layers（view_layers）')
  local K = assert(spec.kit, 'view_settle: 需要 spec.kit（view_kit）')
  local THEME = assert(cfg.THEME, 'view_settle: config.THEME 必须是 THEME（= STYLE.chrome）')
  local MODE_THEME = cfg.MODE_THEME or {}
  local NUM = cfg.NUM or {}
  local PHONE = NUM.PHONE or {}
  local COPY = cfg.COPY or {}
  local SETTLE_OPT = cfg.SETTLE_OPT or {}

  -- 层名先过一遍 view_layers（层名写错当场报错，而不是渲染时静默按 hud 处理）
  for _, name in pairs(M.LAYER) do L.order(name) end

  local S = {}

  -- ===== 颜色工具（ARGB ↔ 通道；与 view_node.unpack / view_kit.C 同口径）=====
  local function parts(c)
    local v = c or 0
    if v < 0 then v = v + 4294967296 end
    return (v // 16777216) % 256, (v // 65536) % 256, (v // 256) % 256, v % 256
  end
  -- 任何颜色 → alpha=255 的不透明版（观感 = 压在 base 上的结果）。这是结构约束 C1。
  local function opaque(base, c)
    local a, r, g, b = parts(c)
    if a == 255 then return c end
    return K.over(base, K.C(255, r, g, b), a / 255)
  end

  -- MS.opts 的 mix：k>0 向白(255)靠，k<0 向墨(16)靠（第三档字色与三态色板用）
  local function mix(c, k)
    if not k or k == 0 then return c end
    local a, r0, g0, b0 = parts(c)
    local tt = (k > 0) and 255 or 16
    local kk = (k < 0) and -k or k
    local function ch(v)
      local n = math.floor(v + (tt - v) * kk + 0.5)
      if n < 0 then n = 0 end
      if n > 255 then n = 255 end
      return n
    end
    return K.C(a, ch(r0), ch(g0), ch(b0))
  end

  -- 文字框高：MS.opts 用 ⌊字号×1.5+6⌋（≥ view_kit.textMinH 的 1.45×+6 ⇒ 引擎不会 fits=false）
  local function textH(font) return math.floor(font * 1.5 + 6) end
  local function tagOf(id) return id:sub(1, 1):upper() .. id:sub(2) end

  -- ===== 选项声明（config 优先，缺项用兜底；两条分支 = 结构约束 C3）=====
  local function optionsOf(device)
    local decls = {}
    if device == 'mobile' then
      local acts = PHONE.actions
      if type(acts) ~= 'table' or #acts < 1 then acts = M.FALLBACK_PAD end
      for i = 1, #acts do
        local a = acts[i]
        local rank = a.rank or i
        decls[#decls + 1] = {
          id = a.act or M.OPT_IDS[rank] or M.OPT_IDS[i] or ('opt' .. i),
          key = a.key or 'R',
          label = a.label or '',
          rank = rank,
          prefix = false,             -- 手机端标签照抄 NUM.PHONE.actions（无 [R] 前缀）
        }
      end
    else
      local items = SETTLE_OPT.items
      if type(items) ~= 'table' or #items < 1 then items = M.FALLBACK_OPT end
      for i = 1, #items do
        local it = items[i]
        local rank = it.rank or i
        decls[#decls + 1] = {
          id = M.OPT_IDS[rank] or M.OPT_IDS[i] or ('opt' .. i),
          key = it.key or 'R',
          label = it.label or '',
          rank = rank,
          prefix = true,              -- MS.opts: '['..key..'] '..label
        }
      end
    end
    return decls
  end

  -- ===== 主入口：opts → node 数组 =====
  S.settle = function(opts)
    opts = opts or {}
    local device = opts.device or 'pc'
    if device ~= 'pc' and device ~= 'mobile' then
      error("view_settle: opts.device 只认 'pc' / 'mobile'，收到 " .. tostring(device))
    end
    -- opts.style：选项的表现形态。'text' = 键位提示文字（PC 默认）；'pill' = 胶囊。
    -- 手机没有键盘 ⇒ 『只给文字』在触摸屏上不成立，device='mobile' 一律走胶囊（兜底，不随 style 变）。
    local style = opts.style
    if style ~= nil and style ~= 'auto' and style ~= 'pill' and style ~= 'text' then
      error("view_settle: opts.style 只认 'auto' / 'pill' / 'text'，收到 " .. tostring(style))
    end
    local variant = (device == 'mobile' or style == 'pill') and 'pill' or 'text'
    local mode = opts.mode or 'casual'
    local mt = MODE_THEME[mode] or MODE_THEME.casual or {}
    local accent = mt.accent or THEME.textMain
    local frame = mt.frame or THEME.gold
    local a = opts.alpha or 255                  -- 与 settleSetColors(a) 同口径（0..255 淡入）
    a = math.max(0, math.min(255, math.floor(a)))
    local canvas = opts.canvas or { 1600, 900 }
    local W, H = canvas[1] or 1600, canvas[2] or 900

    local cw = math.min(W - M.CARD.PADX, M.CARD.W)      -- layoutSettle
    local ch = opts.cardH or M.CARD.H                   -- 缺省 400（照抄现网）
    local cdy = (ch - M.CARD.H) / 2                     -- 卡高变了 ⇒ 卡内东西整体居中
    local cardBottom = -ch / 2
    local txtW = cw - M.TXT_INSET
    local wash = THEME.scrim or THEME.wall              -- 观感基准（C1 的预混底）

    local out = {}
    local function add(n) out[#out + 1] = n return n end

    -- ===== ① 遮罩（wash 层：只压暗，不参与选项）=====
    add {
      key = 'settleWash', name = 'settleWash', role = M.ROLE.scrim,
      layer = M.LAYER.wash, tpl = 'cell',
      pos = { 0, 0 }, size = { W + 60, H + 60 }, color = wash,
    }
    -- ===== ② 描边 + 面板 + 三条装饰带（panel 层）=====
    add {
      key = 'settleBorder', name = 'settleBorder', role = M.ROLE.shell,
      layer = M.LAYER.panel, tpl = 'cell',
      pos = { 0, 0 }, size = { cw + 8, ch + 8 }, color = opaque(wash, THEME.bezel),
    }
    add {
      key = 'settleCard', name = 'settleCard', role = M.ROLE.card,
      layer = M.LAYER.panel, tpl = 'cell',
      pos = { 0, 0 }, size = { cw, ch }, color = opaque(wash, THEME.panel),
    }
    for i = 1, #M.BARS do
      local b = M.BARS[i]
      local col = (b.color == 'frame') and frame or THEME.gold
      local by = (i == 1) and (ch / 2 - 3) or (b.y + cdy)   -- 顶条跟着卡顶，细带跟着内容
      add {
        key = 'settleBar' .. i, name = 'settleBar' .. i, role = M.ROLE.rule,
        layer = M.LAYER.panel, tpl = 'cell',
        pos = { 0, by }, size = { cw - b.inset, b.h }, color = opaque(wash, col),
      }
    end

    -- ===== ③ 五行卡内文字（card 层）——字号/框高/字色照 settleSetColors =====
    local noteText, noteColor
    if type(opts.note) == 'string' then
      noteText, noteColor = opts.note, opts.noteColor
    else
      local recs = COPY.settle
      if type(recs) ~= 'table' or #recs < 1 then recs = M.FALLBACK_NOTE end
      local idx = opts.noteIdx or 1
      local rec = recs[idx] or recs[1]
      if type(rec) == 'table' then
        noteText = (tostring(rec.text or ''):gsub('{lines}', tostring(opts.lines or 0)))
        noteColor = rec.color
      end
    end
    if type(noteText) ~= 'string' then noteText = '' end
    local noteRGB = M.NOTE_RGB_FALLBACK
    if noteColor ~= nil then
      local _, r0, g0, b0 = parts(noteColor)
      noteRGB = { r0, g0, b0 }
    end
    local function dk(k) return math.floor(a * k) end        -- settleSetColors 的三档 alpha
    local titleText = opts.title
    if type(titleText) ~= 'string' then
      if opts.win then
        titleText = M.WIN_TITLE[mode] or '你赢了！'
      else
        titleText = M.TITLE
      end
    end
    local texts = {
      { key = 'settleTitle', y = M.Y.title, font = M.FONT.title, h = M.H.title,
        text = titleText, color = K.C(dk(1), 185, 138, 60) },               -- 深金
      { key = 'settleScore', y = M.Y.score, font = M.FONT.score, h = M.H.score,
        text = '本局 ' .. tostring(opts.score or 0) .. ' 分',
        color = K.C(dk(1), 214, 126, 46) },                                 -- 暖橙
      { key = 'settleBest', y = M.Y.best, font = M.FONT.best, h = M.H.best,
        text = '最高 ' .. tostring(opts.best or 0), color = K.C(dk(1), 62, 74, 99) },
      { key = 'settleInfo', y = M.Y.info, font = M.FONT.info, h = M.H.info,
        text = '消行 ' .. tostring(opts.lines or 0) .. ' 行\u{3000}\u{3000}落块 '
          .. tostring(opts.pieceCount or 0) .. '\u{3000}\u{3000}等级 '
          .. tostring(opts.level or 1),
        color = K.C(dk(0.82), 124, 140, 168) },
      { key = 'settleNote', y = M.Y.note, font = M.FONT.note, h = M.H.note,
        text = noteText, color = K.C(dk(0.88), noteRGB[1], noteRGB[2], noteRGB[3]) },
    }
    for i = 1, #texts do
      local t = texts[i]
      local n = K.text {
        key = t.key, name = t.key, x = 0, y = t.y + cdy, w = txtW, h = t.h,
        text = t.text, font = t.font, color = t.color, layer = M.LAYER.card,
      }
      n.role = M.ROLE.cardText
      add(n)
    end

    -- ===== ④ 选项带（touch 层；行位置由卡矩形反解 = 结构约束 C2）=====
    local decls = optionsOf(device)
    local keys = opts.keyLabels or {}
    local row = {}
    local function push(n, id, group)
      n.opt, n.optId, n.optGroup = true, id, group
      row[#row + 1] = n
    end
    for i = 1, #decls do
      local d = decls[i]
      local cb = opts[M.CB[d.id] or '']
      local key = keys[d.id] or d.key
      local label = d.label
      if d.prefix then label = string.format(M.OPT_HINT_FMT, key, label) end
      local rank = d.rank
      local group = 'opt' .. i
      local t = tagOf(d.id)

      if variant == 'pill' then
        -- 胶囊：几何按设备取（手机 = NUM.PHONE，主键 ×1.15；PC = MS.opts variant P 三档），
        -- 配色两处共用 MS.opts 三档（全部不透明）；两端必须 circle 图元才是圆角。
        local w, h, font
        if device == 'mobile' then
          w = (rank == 1) and ((PHONE.ACT_W or M.ACT.W) * M.ACT.PRIMARY)
            or (PHONE.ACT_W or M.ACT.W)
          h = PHONE.ACT_H or M.ACT.H
          font = M.ACT.FONT
        else
          w = M.OPT_W[rank] or M.OPT_W[#M.OPT_W]
          h = M.OPT_H[rank] or M.OPT_H[#M.OPT_H]
          font = M.OPT_FONT[rank] or M.OPT_FONT[#M.OPT_FONT]
        end
        local pad = (rank == 3) and 5 or 7
        local rimColor = (rank == 3) and K.C(255, 214, 196, 158) or THEME.gold
        local fill, ink, kind
        if rank == 1 then
          fill, ink, kind = accent, K.C(255, 255, 255, 255), 'fill'
        elseif rank == 2 then
          fill, ink, kind = THEME.card, THEME.textMain, 'line'
        else
          fill, ink, kind = K.C(255, 250, 245, 238), mix(THEME.textMain, 0.30), 'flat'
        end
        local rimCol, fillCol = opaque(wash, rimColor), opaque(wash, fill)
        -- 标签控件名：PC 用 tests/37 契约 optT1..3；手机用 settleLabel*
        -- （刻意避开现网 pad 的 pta*/pba*/pea* 家族 ⇒ 见测试 F1「pad 通道复发」守卫）
        local labelKey = (device == 'mobile') and ('settleLabel' .. t) or ('optT' .. i)
        local nodes = K.pill {
          key = 'settleRim' .. t, x = 0, y = 0, w = w + pad, h = h + pad,
          color = rimCol, layer = M.LAYER.touch, capShape = 'circle',
        }
        for k = 1, #nodes do
          nodes[k].role = M.ROLE.capRim
          push(nodes[k], d.id, group)
        end
        nodes = K.pill {
          key = 'settleCap' .. t, x = 0, y = 0, w = w, h = h,
          color = fillCol, layer = M.LAYER.touch, capShape = 'circle',
        }
        for k = 1, #nodes do
          local n = nodes[k]
          n.role = M.ROLE.capFill
          -- 三态色板：照 MS.opts paint() 的 mix 系数（接线方可用；render.lua 目前不读）
          n.state = {
            kind = kind,
            hoverK = (kind == 'fill') and -0.13 or (kind == 'line') and 0.78 or 0.04,
            pressK = (kind == 'fill') and -0.26 or (kind == 'line') and 0.60 or -0.10,
            rimHoverK = 0.10, rimPressK = -0.34, dy = -3,
          }
          push(n, d.id, group)
        end
        local lb = K.text {
          key = labelKey, name = labelKey, x = 0, y = -1, w = w - 8, h = textH(font),
          text = label, font = font, color = ink, layer = M.LAYER.touch,
        }
        lb.role = M.ROLE.capLabel
        push(lb, d.id, group)
        local hit = K.hit {
          key = 'hit' .. t, name = 'hotSettle' .. key, x = 0, y = 0,
          w = w + M.HITPAD, h = h + M.HITPAD, layer = M.LAYER.touch,
          on = cb and { CursorClick = cb } or nil,
        }
        hit.role = M.ROLE.hit
        hit.hitKey = key
        push(hit, d.id, group)
      else
        -- PC：只出键位提示文字（无胶囊 = 结构约束 C3）+ 透明热区（鼠标仍可点）
        local w = M.OPT_W[rank] or M.OPT_W[#M.OPT_W]
        local font = M.OPT_FONT[rank] or M.OPT_FONT[#M.OPT_FONT]
        local ink = (rank == 1) and K.C(255, 62, 74, 99)
          or (rank == 2) and (THEME.textDim or K.C(255, 82, 97, 107))
          or (THEME.hint or K.C(255, 96, 126, 152))
        local h = textH(font)
        local tn = K.text {
          key = 'optT' .. i, name = 'optT' .. i, x = 0, y = 0, w = w, h = h,
          text = label, font = font, color = ink, layer = M.LAYER.card,
        }
        tn.role = M.ROLE.hint
        push(tn, d.id, group)
        local hit = K.hit {
          key = 'hit' .. t, name = 'hotSettle' .. key, x = 0, y = 0,
          w = w + M.HITPAD, h = h + M.HITPAD, layer = M.LAYER.touch,
          on = cb and { CursorClick = cb } or nil,
        }
        hit.role = M.ROLE.hit
        hit.hitKey = key
        push(hit, d.id, group)
      end
    end

    -- 水平：按 optGroup 聚合（组宽取该组最宽节点 = 热区），居中排一行，净距 OPT_GAP
    local groups, groupW = {}, {}
    for i = 1, #row do
      local n = row[i]
      local g = n.optGroup
      if groupW[g] == nil then
        groups[#groups + 1] = g
        groupW[g] = 0
      end
      local w = (n.size and n.size[1]) or 0
      if w > groupW[g] then groupW[g] = w end
    end
    local total = 0
    for g = 1, #groups do total = total + groupW[groups[g]] end
    total = total + M.OPT_GAP * (#groups - 1)
    local cursor = -total / 2
    local cx = {}
    for g = 1, #groups do
      local gw = groupW[groups[g]]
      cx[groups[g]] = cursor + gw / 2
      cursor = cursor + gw + M.OPT_GAP
    end
    -- 垂直：行内最高节点（含热区）的顶边贴到「卡底 - ROW_GAP」
    local rowTop = 0
    for i = 1, #row do
      local n = row[i]
      local top = (n.pos[2] or 0) + ((n.size and n.size[2]) or 0) / 2
      if top > rowTop then rowTop = top end
    end
    local rowY = cardBottom - M.ROW_GAP - rowTop
    for i = 1, #row do
      local n = row[i]
      n.pos[1] = (n.pos[1] or 0) + (cx[n.optGroup] or 0)
      n.pos[2] = (n.pos[2] or 0) + rowY
      add(n)
    end

    return out
  end

  return S
end

return M
