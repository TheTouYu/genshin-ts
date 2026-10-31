--[[==========================================================================
 tests-lua/view_hud_test.lua —— HUD 文案契约（headless）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/view_hud_test.lua

 断言值**逐字取自 tests/*.json 的 contains 断言**（不是我自己编的期望）：
   得分 0　消行 0　等级 1　已填 0
   得分 31　消行 0　等级 1　已填 4
   得分 3282　消行 12　等级 2　已填 4
 这类字符串以前散在十几处拼接里，改一个空格就静默打红一片用例。
========================================================================]]

local ROOT = os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local cfg = load('lua/tetris/config.lua')
local hudM = load('lua/tetris/view_hud.lua')

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

local H = hudM.new { config = cfg }

-- ===== 与 tests/*.json 的逐字契约 =====
local cases = {
  { score = 0, lines = 0, level = 1, filled = 0, want = '得分 0　消行 0　等级 1　已填 0' },
  { score = 31, lines = 0, level = 1, filled = 4, want = '得分 31　消行 0　等级 1　已填 4' },
  { score = 332, lines = 2, level = 1, filled = 4, want = '得分 332　消行 2　等级 1　已填 4' },
  { score = 3282, lines = 12, level = 2, filled = 4, want = '得分 3282　消行 12　等级 2　已填 4' },
}
for i, c in ipairs(cases) do
  local got = H.hudText(c)
  ok(got == c.want, 'A' .. i .. ' HUD 文案逐字相等', got .. ' ≠ ' .. c.want)
end

-- 全角空格是契约的一部分：用半角就整条断言打红
local s = H.hudText { score = 0, lines = 0, level = 1, filled = 0 }
ok(s:find('\227\128\128', 1, true) ~= nil, 'B1 分隔符是全角空格 U+3000')
-- 字段分隔符只有全角空格（3 个），「得分 」后的那个空格是标签自带半角空格
local _, sepCount = s:gsub('\227\128\128', '')
ok(sepCount == 3, 'B2 只有三处全角分隔符', sepCount)
ok(s:sub(1, 7) == '得分 ', 'B3 首段固定为「得分 」（半角空格是标签的一部分）', s:sub(1, 7))

-- ===== 其它 HUD 文案 =====
ok(H.bestText(152) == '最高 152', 'C1 最高分文案', H.bestText(152))
ok(H.nextLabel() == '下一个', 'C2 下一个标签', H.nextLabel())
ok(H.peerScoreText { score = 12, lines = 3 } == '得分 12　消行 3', 'C3 对家得分行',
  H.peerScoreText { score = 12, lines = 3 })
ok(H.peerLevelText { level = 2, pieceCount = 7 } == '等级 2　落块 7', 'C4 对家等级行',
  H.peerLevelText { level = 2, pieceCount = 7 })
ok(H.peerLabel('pvp') == 'P2 盘' and H.peerLabel('ai-battle') == 'AI 盘', 'C5 对家标签按模式切换')
ok(H.sessionText { pieceCount = 5, lines = 2, best = 99 } == '本局落块 5　消行 2　最高 99',
  'C6 本局小结文案', H.sessionText { pieceCount = 5, lines = 2, best = 99 })

-- ===== 棋盘计数（原 renderHud 里的手写双循环）=====
local board = {}
for r = 1, cfg.ROWS do
  board[r] = {}
  for c = 1, cfg.COLS do board[r][c] = 0 end
end
ok(H.filledOf(board, cfg.ROWS, cfg.COLS) == 0, 'D1 空盘已填 0')
board[20][1] = cfg.COL_CYAN
board[20][2] = cfg.COL_CYAN
board[19][5] = cfg.COL_RED
ok(H.filledOf(board, cfg.ROWS, cfg.COLS) == 3, 'D2 三格已填', H.filledOf(board, cfg.ROWS, cfg.COLS))

-- ===== 模板插值（copy 文案里的 %d）=====
ok(H.fmt('升级 Lv%d！', 3) == '升级 Lv3！', 'E1 fmt 正常插值', H.fmt('升级 Lv%d！', 3))
ok(H.fmt('没有占位符') == '没有占位符', 'E2 无占位符原样返回')
ok(H.fmt('坏模板 %d', nil) ~= nil, 'E3 参数缺失不抛错（pcall 兜底）')

print(string.format('\n== view_hud_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
