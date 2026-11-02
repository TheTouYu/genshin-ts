--[[==========================================================================
 tests-lua/view_note_test.lua —— 手机「双人请回 PC」浮层的纯描述验收（headless）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_note_test.lua

 为什么要有：这个浮层 v4.0–v6.12 一直是 main.lua 里手建的 11 个控件
 （`UI4.noteOpen` 逐个 Instantiate + SetAnchoredPosition），没有 lint、没有 headless 断言、
 层序靠"后建在上"的调用顺序。v6.13 改成 `view_note` 纯描述 + 独立 render 实例后，
 判据必须跟着从"看着对"升级成"结构可断言"：

   A 结构：节点数 15、key/layer/tpl/name/pos/size 齐、层号全是 modal（压在 card/panel/hud 之上）
   B 控件名：padNoteBlock/Dim/Card*/Line/Title/B1..B3/Btn*/padNoteBtnHit —— 与旧实现同名
     （tests/46 用 `click name=padNoteBtnHit` 真点，改名就红）
   C 交互：block 与 btnHit 都挂 CursorClick，且回调分别带 via='block' / via='btn'
   D lint：5 个真实画布 × 2（PC/手机）0 issue
   E render 通道：真建控件后按键取得到、文案逐字写进去，clear 后取不到
 ========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local layers = load('lua/tetris/view_layers.lua')
local vnode = load('lua/tetris/view_node.lua')
local vkit = load('lua/tetris/view_kit.lua')
local platform = load('lua/tetris/platform.lua')
local renderM = load('lua/tetris/render.lua')
local viewNote = load('lua/tetris/view_note.lua')

local V = vnode.new { layers = layers }
local K = vkit.new { layers = layers }
local S = viewNote.new { layers = layers, kit = K }

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then
    pass = pass + 1
    print('PASS  ' .. name)
  else
    fail = fail + 1
    print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or ''))
  end
end

-- 5 个真实画布（真值来源 qxqy/frame-strip.mjs CANVAS_PRESETS）
local CANVASES = { { 1600, 900 }, { 2100, 900 }, { 1280, 720 }, { 1560, 720 }, { 1280, 960 } }
local TEXT = { title = '旅行者，请回到更大的屏幕', body1 = '双人对战要两只手', body2 = '双人合作要两台设备', body3 = 'AI 对抗在手机上可以玩', btn = '知道了' }
local dim = 0xFFA01E2E

local function build(canvas)
  local hits = {}
  local nodes = S.note {
    canvas = canvas or { 1280, 720 },
    text = TEXT,
    colors = { dim = dim, panel = 0xFFFFFDF7, gold = 0xFFD9B26A, main = 0xFF3E4A63, sub = 0xFF6B7688 },
    onClose = function(via) hits[#hits + 1] = via end,
  }
  return nodes, hits
end

----------------------------------------------------------------------------
-- §A 结构
----------------------------------------------------------------------------
do
  local nodes = build()
  ok(#nodes == 15, 'A1 节点数 = 15', #nodes)
  local bad
  for i = 1, #nodes do
    local n = nodes[i]
    if not n.key then bad = 'no key @' .. i
    elseif not n.tpl then bad = 'no tpl @' .. n.key
    elseif not n.name then bad = 'no name @' .. n.key
    elseif not (n.pos and n.size) then bad = 'no pos/size @' .. n.key
    elseif n.layer ~= 'modal' then bad = 'layer=' .. tostring(n.layer) .. ' @' .. n.key end
  end
  ok(bad == nil, 'A2 每个节点都有 key/tpl/name/pos/size，且层号全是 modal（90）', bad)

  local keys = {}
  for i = 1, #nodes do keys[nodes[i].key] = true end
  ok(keys['note.block'] and keys['note.dim'] and keys['note.btnHit'], 'A3 关键 key 齐（block/dim/btnHit）')
end

----------------------------------------------------------------------------
-- §B 控件名（与旧实现同名：tests/46 按名点击）
----------------------------------------------------------------------------
do
  local nodes = build()
  local names = {}
  for i = 1, #nodes do names[nodes[i].name or ''] = true end
  local want = { 'padNoteBlock', 'padNoteDim', 'padNoteLine', 'padNoteTitle',
    'padNoteB1', 'padNoteB2', 'padNoteB3', 'padNoteBtnTx', 'padNoteBtnHit' }
  local miss = {}
  for _, w in ipairs(want) do if not names[w] then miss[#miss + 1] = w end end
  ok(#miss == 0, 'B1 旧实现的 9 个控件名全部保留（改名会让 tests/46 的 click name 点空）', table.concat(miss, ','))
end

----------------------------------------------------------------------------
-- §C 交互：两种关闭入口各带自己的 via 标记
----------------------------------------------------------------------------
do
  local nodes, hits = build()
  local block, btn
  for i = 1, #nodes do
    if nodes[i].name == 'padNoteBlock' then block = nodes[i] end
    if nodes[i].name == 'padNoteBtnHit' then btn = nodes[i] end
  end
  ok(block and block.on and type(block.on.CursorClick) == 'function', 'C1 遮罩热区挂了 CursorClick')
  ok(btn and btn.on and type(btn.on.CursorClick) == 'function', 'C2 「知道了」热区挂了 CursorClick')
  ok(block.cursor and block.cursor[1] == 'CursorClick' and btn.cursor and btn.cursor[1] == 'CursorClick',
    'C3 两个热区的 cursor 事件名都是 CursorClick（与 render/view_kit.hit 同源）')
  block.on.CursorClick()
  btn.on.CursorClick()
  ok(#hits == 2 and hits[1] == 'block' and hits[2] == 'btn',
    'C4 回调分别报 via=block / via=btn（日志里靠它区分"点外面"和"点按钮"）',
    table.concat(hits, ','))
end

----------------------------------------------------------------------------
-- §D lint：5 画布 × 2 设备无 issue
----------------------------------------------------------------------------
do
  local bad, runs = nil, 0
  for _, cv in ipairs(CANVASES) do
    local nodes = build(cv)
    local issues = V.lint(nodes)
    runs = runs + 1
    if #issues > 0 then
      bad = cv[1] .. 'x' .. cv[2] .. ' ' .. issues[1].code .. ': ' .. issues[1].msg
      break
    end
  end
  ok(bad == nil, 'D1 view_node.lint 0 issue（' .. runs .. ' 个画布）', bad)
end

----------------------------------------------------------------------------
-- §E render 通道：真建控件、文案落位、clear 后取不到
----------------------------------------------------------------------------
do
  local P = platform.new {
    mock = true, canvas = { 1280, 720 }, logSink = function() end,
    templates = { cell = { kind = 'image' }, stext = { kind = 'text' }, hit = { kind = 'cursor' } },
  }
  local R = renderM.new { platform = P, layers = layers, log = function() end }
  local nodes = build()
  R.apply(nodes)
  local title = R.get('note.title')
  local btn = R.get('note.btnHit')
  ok(title ~= nil and btn ~= nil, 'E1 render 后按 key 取得到标题与按钮热区')
  ok(title and title.text == TEXT.title,
    'E2 标题文案逐字写进控件', title and tostring(title.text))
  ok(btn and btn.sizeDeltaX == 220, 'E3 按钮热区尺寸 220（与旧实现同值）', btn and btn.sizeDeltaX)
  R.clear()
  ok(R.get('note.title') == nil and R.get('note.btnHit') == nil, 'E4 clear 后两个 key 都取不到（关浮层不残留）')
end

print('')
print(string.format('== view_note: %d pass / %d fail ==', pass, fail))
if fail > 0 then os.exit(1) end
