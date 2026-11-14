--[[==========================================================================
 tetris/view_note.lua —— 移动端「双人玩法请回 PC」浮层的**纯描述**（opts → node 数组）
 ----------------------------------------------------------------------------
 为什么要有这个文件（用户 2026-11-02：「移动端没做多人，点击会有一个额外的弹窗
 （这个也还没用我们的 ui 框架重做，可以处理一下）」）：
   这个浮层从 v4.0 起一直是 main.lua 里 `UI4.noteOpen` 手建的 11 个控件 ——
   逐个 Instantiate + SetAnchoredPosition + 手写"先建热区再建卡"的顺序纪律。
   它不在 scene/framework 里，所以：改样式要摸 main.lua、层序靠调用顺序、
   没有 lint、也没法 headless 断言。这里把它变成一份数据。

 结构（与旧实现同几何，逐值照抄 UI4.noteOpen，观感零变化）：
   ① padNoteBlock  全屏热区（点卡片外任意处关闭；modal 层 ⇒ 命中优先于标题页模式卡）
   ② padNoteDim    全屏暗底
   ③ padNoteCard   卡片胶囊（760×330，view_kit.pill = 中段矩形 + 左右半圆）
   ④ padNoteLine   分隔线（tw×3，金色）
   ⑤ padNoteTitle  标题（30 号）
   ⑥ padNoteB1/B2/B3  三行正文（20/20/18 号）
   ⑦ padNoteBtnBg/Tx/Hit  「知道了」按钮（220×60）+ 热区

 层号：整屏都进 `modal`(90) —— 它必须压在标题页展台/模式卡与 HUD 之上（层级渲染新存档：
  layer 越大越靠上，同层回退创建序），不再依赖"后建在上"的调用顺序。

 契约：Lua 5.3；不 require 任何 tetris 模块（kit/layers 由 spec 注入）；不 print；
       不调用引擎 API；chunk 顶层只有表与函数。
 验证：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_note_test.lua
 ========================================================================]]

local M = {}

M.new = function(spec)
  spec = spec or {}
  local KIT = assert(spec.kit, 'view_note: 需要 spec.kit（view_kit）')
  local S = {}

  -- o = { canvas = {W,H}, text = {title, body1, body2, body3, btn},
  --       colors = {dim, panel, gold, main, sub}, onClose = fn }
  function S.note(o)
    o = o or {}
    local W = (o.canvas and o.canvas[1]) or 1280
    local H = (o.canvas and o.canvas[2]) or 720
    local T = o.text or {}
    local C = o.colors or {}
    local cw = math.min(760, W - 120)
    local tw = math.min(700, W - 160)
    local cy = 40
    local bw, bh = 220, 60
    local nodes = {}
    local function add(n) nodes[#nodes + 1] = n return n end

    -- ① 暗底（同层内按 seq 落序：热区必须排在所有可见件之后才压得住它们，见 §③④）
    add { key = 'note.dim', layer = 'modal', tpl = 'cell', name = 'padNoteDim',
      pos = { 0, 0 }, size = { W + 40, H + 40 }, color = C.dim }
    -- ③ 卡片
    for _, n in ipairs(KIT.pill { key = 'note.card', x = 0, y = cy, w = cw, h = 330,
      color = C.panel, layer = 'modal' }) do add(n) end
    -- ④ 分隔线
    add { key = 'note.line', layer = 'modal', tpl = 'cell', name = 'padNoteLine',
      pos = { 0, cy + 128 }, size = { tw, 3 }, color = C.gold, image = { s = 'rect' } }
    -- ⑤ 标题 + ⑥ 三行正文
    add(KIT.text { key = 'note.title', name = 'padNoteTitle', x = 0, y = cy + 92, w = tw, h = 60,
      text = T.title or '', font = 30, color = C.main, layer = 'modal' })
    add(KIT.text { key = 'note.b1', name = 'padNoteB1', x = 0, y = cy + 34, w = tw, h = 34,
      text = T.body1 or '', font = 20, color = C.sub, layer = 'modal' })
    add(KIT.text { key = 'note.b2', name = 'padNoteB2', x = 0, y = cy - 2, w = tw, h = 34,
      text = T.body2 or '', font = 20, color = C.main, layer = 'modal' })
    add(KIT.text { key = 'note.b3', name = 'padNoteB3', x = 0, y = cy - 40, w = tw, h = 34,
      text = T.body3 or '', font = 18, color = C.sub, layer = 'modal' })
    -- ⑦ 按钮（底 + 字 + 热区）
    for _, n in ipairs(KIT.pill { key = 'note.btn', x = 0, y = cy - 108, w = bw, h = bh,
      color = C.gold, layer = 'modal' }) do add(n) end
    add(KIT.text { key = 'note.btnTx', name = 'padNoteBtnTx', x = 0, y = cy - 108, w = bw, h = bh,
      text = T.btn or '知道了', font = 24, color = C.main, layer = 'modal' })
    -- ③ 全屏热区：点卡片外任意处关闭（触屏没有 Esc）。**排在所有可见件之后** ⇒ 同层 seq 更大、
    --    压得住卡片/文字；按钮热区再排在它后面 ⇒ 按钮优先命中（旧实现靠"先建后建"的同一份顺序）。
    add { key = 'note.block', layer = 'modal', tpl = 'hit', name = 'padNoteBlock',
      pos = { 0, 0 }, size = { W + 40, H + 40 }, cursor = { 'CursorClick' },
      on = { CursorClick = function() if o.onClose then o.onClose('block') end end } }
    -- ④ 「知道了」热区（最后建 = 最上，命中优先）
    add { key = 'note.btnHit', layer = 'modal', tpl = 'hit', name = 'padNoteBtnHit',
      pos = { 0, cy - 108 }, size = { bw, bh }, cursor = { 'CursorClick' },
      on = { CursorClick = function() if o.onClose then o.onClose('btn') end end } }
    return nodes
  end

  -- 便捷：本浮层控件数（接线方打 `pad note open n=` 用）
  function S.count(o) return #S.note(o) end

  return S
end

return M
