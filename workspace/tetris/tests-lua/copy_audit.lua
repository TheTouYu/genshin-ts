--[[==========================================================================
  tests-lua/copy_audit.lua —— lua/tetris/copy.lua 的文案机检（不依赖模拟器）
  跑法：  cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/copy_audit.lua
  判据：  退出码 0 = 全绿；任一 FAIL ⇒ 打印差异 + 退出码 1

  核什么（每一条都是用户/任务书点名的判据）：
    A 模块能装载、版本/别名/四角色齐全
    B 导出契约：每个角色字段齐全、不许缺（main.lua 正在读）
    C 条数：cast/hold/settle/level ≥3、help/tips ≥3、idle ≥2、
            fail 三因各 ≥3、quotes ≥8
    D 字数：每条正文 ≤24 字（UTF-8 码点，标点/ASCII 都算一格，最保守口径）
    E 开发词：不出现「系统 / 玩家 / 数值」
    F 角色区分度：四角色 cast 首条互不相同（口吻不能雷同）
    G 角色口吻：每个角色 ≥6 句台词带第一/第二人称（我/你）
    H 运行时：轮播不连出同句、fail 的数字填得进去且是向上取整、
            hold 收尾句、settle 的 win/大场面分支、sayList 撑满一页

  为什么单写一份而不复用 M.audit()：M.audit 是模块内置体检（真机也能 print），
  这里是对外验收（含 Python 侧口径、角色区分度、运行时行为），两者互补。
=========================================================================]]

-- ---------------------------------------------------------------------------
-- 微型测试框架（与 tests-lua/skills_test.lua 同风格）
-- ---------------------------------------------------------------------------
local pass, fail = 0, 0
local fails = {}

local function fmt(v)
  if type(v) == 'string' then return '"' .. v .. '"' end
  return tostring(v)
end

local function ok(cond, name, detail)
  if cond then
    pass = pass + 1
    io.write('PASS  ', name, '\n')
  else
    fail = fail + 1
    fails[#fails + 1] = name .. (detail and ('  <' .. detail .. '>') or '')
    io.write('FAIL  ', name, detail and ('  <' .. detail .. '>') or '', '\n')
  end
end

-- ---------------------------------------------------------------------------
-- 装载（copy.lua 自身零 require；A() 是模块内 local，直接 dofile 即可）
-- ---------------------------------------------------------------------------
local here = arg and arg[0] or 'tests-lua/copy_audit.lua'
local root = here:match('^(.*)/tests%-lua/') or '.'
local path = root .. '/lua/tetris/copy.lua'

local chunk, err = loadfile(path)
ok(chunk ~= nil, 'A1 loadfile lua/tetris/copy.lua', tostring(err))
if not chunk then
  io.write('----\nFAILED  cannot load module\n')
  os.exit(1)
end
local okRun, M = pcall(chunk)
ok(okRun and type(M) == 'table', 'A2 module returns a table', tostring(M))
if not okRun or type(M) ~= 'table' then os.exit(1) end

ok(M.VERSION == 'v6.0', 'A3 VERSION == v6.0', tostring(M.VERSION))

local ROLES = { 'nahida', 'keqing', 'ganyu', 'girl' }
local NAMES = { nahida = '纳西妲', keqing = '刻晴', ganyu = '甘雨', girl = '少女' }
for i = 1, #ROLES do
  local r = ROLES[i]
  ok(type(M.ROLES[r]) == 'table', 'A4 ROLES[' .. r .. '] exists')
end

-- 别名：main 传 skills.lua 的键 columbina，任务书/文档写 girl
ok(M.ROLES.columbina == M.ROLES.girl, 'A5 columbina 与 girl 是同一张表（不做第二份数据）')
ok(M.of('columbina') == M.ROLES.girl, 'A6 M.of(columbina) -> girl')
ok(M.of('少女') == M.ROLES.girl, 'A7 M.of(少女) -> girl')
ok(M.of('哥伦比娅') == M.ROLES.girl, 'A8 M.of(哥伦比娅) -> girl')
ok(M.of('no-such-role') == M.ROLES.nahida, 'A9 未知角色降级到纳西妲（不崩）')

-- 人设事实：少女=水元素·空月归乡（2026-01 实装五星水法器）
ok(M.ROLES.girl.element == '水', 'A10 少女 element == 水（不是风）', tostring(M.ROLES.girl.element))
ok(M.ROLES.girl.title == '空月归乡', 'A11 少女 title == 空月归乡', tostring(M.ROLES.girl.title))
ok(M.ROLES.nahida.element == '草', 'A12 纳西妲 element == 草')
ok(M.ROLES.keqing.element == '雷', 'A13 刻晴 element == 雷')
ok(M.ROLES.ganyu.element == '冰', 'A14 甘雨 element == 冰')

-- ---------------------------------------------------------------------------
-- 工具：UTF-8 码点计数 / 深度遍历取正文
-- ---------------------------------------------------------------------------
local function u8len(s)
  local n = 0
  for _ in string.gmatch(tostring(s or ''), '[%z\1-\127\194-\244][\128-\191]*') do n = n + 1 end
  return n
end

local LIMIT = 24

-- 把所有「会被打到屏幕上」的正文摊平：{ {label, text}, ... }
local function collectBodies(e, key)
  local acc = {}
  local function add(label, s)
    if type(s) == 'string' then acc[#acc + 1] = { label = label, text = s } end
  end
  local function addList(list, label)
    if type(list) ~= 'table' then return end
    for i = 1, #list do
      local it = list[i]
      if type(it) == 'table' then
        add(label .. '#' .. i .. '.t', it.t)
        add(label .. '#' .. i .. '.b', it.b)
      else
        add(label .. '#' .. i, it)
      end
    end
  end
  add('skillDesc', e.skillDesc)
  addList(e.help, key .. '.help')
  addList(e.tips, key .. '.tips')
  addList(e.cast, key .. '.cast')
  addList(e.hold, key .. '.hold')
  addList(e.settle, key .. '.settle')
  addList(e.level, key .. '.level')
  addList(e.idle, key .. '.idle')
  addList(e.quotes, key .. '.quotes')
  addList({ e.win, e.quad, e.settleBig, e.unlock }, key .. '.misc')
  if e.holdN then addList({ e.holdN }, key .. '.holdN') end
  if type(e.fail) == 'table' then
    local ks = { 'cd', 'energy', 'locked' }
    for i = 1, #ks do
      local v = e.fail[ks[i]]
      if type(v) == 'table' and v[1] ~= nil then
        addList(v, key .. '.fail.' .. ks[i])
      elseif type(v) == 'table' then
        add('fail.' .. ks[i] .. '.t', v.t)
        add('fail.' .. ks[i] .. '.b', v.b)
      end
    end
  end
  return acc
end

-- ---------------------------------------------------------------------------
-- B 导出契约：字段一个都不能缺（main.lua 正在读）
-- ---------------------------------------------------------------------------
local NEED = {
  'key', 'name', 'element', 'title', 'color', 'color2', 'accent', 'glow',
  'skill', 'skillDesc', 'help', 'tips', 'cast', 'hold', 'fail', 'settle',
  'win', 'quad', 'settleBig', 'level', 'unlock', 'idle', 'quotes',
}
for i = 1, #ROLES do
  local r = ROLES[i]
  local e = M.ROLES[r]
  local missing = {}
  for j = 1, #NEED do
    if e[NEED[j]] == nil then missing[#missing + 1] = NEED[j] end
  end
  ok(#missing == 0, 'B1 ' .. r .. ' 字段齐全（' .. #NEED .. ' 项）', table.concat(missing, ','))
  ok(type(e.color) == 'number' and type(e.glow) == 'number', 'B2 ' .. r .. ' 主题色是 ARGB 整数')
end

-- ---------------------------------------------------------------------------
-- C 条数达标
-- ---------------------------------------------------------------------------
local MIN = { cast = 3, hold = 3, settle = 3, level = 3, help = 3, tips = 3, idle = 2, quotes = 8 }
local counts = {}
for i = 1, #ROLES do
  local r = ROLES[i]
  local e = M.ROLES[r]
  counts[r] = {}
  for f, min in pairs(MIN) do
    local n = type(e[f]) == 'table' and #e[f] or 0
    counts[r][f] = n
    ok(n >= min, string.format('C1 %s.%s >= %d（实际 %d）', r, f, min, n))
  end
  -- fail 三因各 ≥3
  local fk = { 'cd', 'energy', 'locked' }
  local fcount = {}
  for j = 1, #fk do
    local v = e.fail and e.fail[fk[j]]
    local n = 0
    if type(v) == 'table' and v[1] ~= nil then n = #v elseif type(v) == 'table' then n = 1 end
    fcount[fk[j]] = n
    ok(n >= 3, string.format('C2 %s.fail.%s >= 3（实际 %d）', r, fk[j], n))
  end
  counts[r].fail = fcount.cd + fcount.energy + fcount.locked
  -- win/quad/settleBig/unlock 单条必须有正文
  local single = { 'win', 'quad', 'settleBig', 'unlock' }
  for j = 1, #single do
    local v = e[single[j]]
    ok(type(v) == 'table' and u8len(v.b) > 0,
      'C3 ' .. r .. '.' .. single[j] .. ' 有正文', type(v) == 'table' and tostring(v.b) or 'nil')
  end
  -- 每条（非 idle）都要有标签，否则标题退化成裸名字
  local tagged = { 'cast', 'hold', 'settle', 'level', 'quotes' }
  local untagged = {}
  for j = 1, #tagged do
    local list = e[tagged[j]]
    for k = 1, #list do
      if u8len(list[k].t or '') == 0 then untagged[#untagged + 1] = tagged[j] .. '#' .. k end
    end
  end
  ok(#untagged == 0, 'C4 ' .. r .. ' 非 idle 条目都带标签', table.concat(untagged, ','))
end

-- ---------------------------------------------------------------------------
-- D 字数：每条 ≤24（标签也核——标签会进标题栏）
-- ---------------------------------------------------------------------------
for i = 1, #ROLES do
  local r = ROLES[i]
  local bodies = collectBodies(M.ROLES[r], r)
  local over = {}
  local maxLen, maxWhere = 0, ''
  for j = 1, #bodies do
    local L = u8len(bodies[j].text)
    if L > maxLen then maxLen, maxWhere = L, bodies[j].label end
    if L > LIMIT then
      over[#over + 1] = string.format('%s(%d)%s', bodies[j].label, L, bodies[j].text)
    end
  end
  ok(#over == 0, string.format('D1 %s 每条 <= %d 字（最长 %d @ %s，共 %d 条）',
    r, LIMIT, maxLen, maxWhere, #bodies), table.concat(over, ' | '))
end

-- ---------------------------------------------------------------------------
-- E 开发词：系统 / 玩家 / 数值
-- ---------------------------------------------------------------------------
local BANNED = { '系统', '玩家', '数值', '策划', '程序' }
for i = 1, #ROLES do
  local r = ROLES[i]
  local bodies = collectBodies(M.ROLES[r], r)
  local hits = {}
  for j = 1, #bodies do
    for k = 1, #BANNED do
      if string.find(bodies[j].text, BANNED[k], 1, true) then
        hits[#hits + 1] = bodies[j].label .. '=' .. bodies[j].text
      end
    end
  end
  ok(#hits == 0, 'E1 ' .. r .. ' 无开发词（系统/玩家/数值/策划/程序）', table.concat(hits, ' | '))
end

-- ---------------------------------------------------------------------------
-- F 角色区分度：四角色 cast 首条互不相同（口吻不能雷同）
-- ---------------------------------------------------------------------------
local seen, dup = {}, {}
for i = 1, #ROLES do
  local r = ROLES[i]
  local first = M.ROLES[r].cast[1] and M.ROLES[r].cast[1].b or ''
  if seen[first] then dup[#dup + 1] = r .. '=' .. first end
  seen[first] = r
end
ok(#dup == 0, 'F1 四角色 cast 首条互不相同', table.concat(dup, ','))
-- 首条标签也查一遍（标签进标题，撞了同样出戏）
local seenT, dupT = {}, {}
for i = 1, #ROLES do
  local r = ROLES[i]
  local t = M.ROLES[r].cast[1] and M.ROLES[r].cast[1].t or ''
  if seenT[t] then dupT[#dupT + 1] = r .. '=' .. t end
  seenT[t] = r
end
ok(#dupT == 0, 'F2 四角色 cast 首条标签互不相同', table.concat(dupT, ','))
-- 全体 cast 句集合两两不重复（同一句不能既属刻晴又属甘雨）
local all, clash = {}, {}
for i = 1, #ROLES do
  local r = ROLES[i]
  for k = 1, #M.ROLES[r].cast do
    local b = M.ROLES[r].cast[k].b
    if all[b] then clash[#clash + 1] = all[b] .. '/' .. r .. '=' .. b end
    all[b] = r
  end
end
ok(#clash == 0, 'F3 cast 句在角色间零重复', table.concat(clash, ' | '))

-- ---------------------------------------------------------------------------
-- G 角色口吻：台词区 ≥6 句带第一/第二人称（人味的最低门槛）
-- ---------------------------------------------------------------------------
for i = 1, #ROLES do
  local r = ROLES[i]
  local q = M.ROLES[r].quotes
  local voiced = 0
  for k = 1, #q do
    local b = q[k].b or ''
    if string.find(b, '我', 1, true) or string.find(b, '你', 1, true) then
      voiced = voiced + 1
    end
  end
  ok(voiced >= 6, string.format('G1 %s 台词带人称 >= 6（实际 %d/%d）', r, voiced, #q))
end

-- ---------------------------------------------------------------------------
-- H 运行时行为
-- ---------------------------------------------------------------------------
for i = 1, #ROLES do
  local r = ROLES[i]
  local name = NAMES[r]

  -- H1 cast 第一次 = 库里第一条，标题带名字
  local c1 = M.cast(r, { lv = 3, tier = 1 })
  ok(c1.title == name .. ' · ' .. M.ROLES[r].cast[1].t, 'H1 ' .. r .. ' cast 首次取第 1 条', c1.title)
  ok(c1.body == M.ROLES[r].cast[1].b, 'H2 ' .. r .. ' cast 正文 = 第 1 条', c1.body)

  -- H3 连续两次 cast 不会出同一句（#cast>=3 才成立）
  local c2 = M.cast(r, {})
  ok(c2.body ~= c1.body, 'H3 ' .. r .. ' cast 轮播不连出同句', c2.body)

  -- H4 fail 数字填得进去、无残留占位符、且向上取整（3.4 -> 4）
  local f = M.fail(r, 'cd', 3.4)
  ok(not string.find(f.body, '{', 1, true), 'H4 ' .. r .. ' fail 无残留占位符', f.body)
  ok(string.find(f.body, '4', 1, true) ~= nil, 'H5 ' .. r .. ' fail cd 3.4 向上取整为 4', f.body)
  -- H6 两种调用形态同解
  local f2 = M.fail(r, { why = 'cd', n = 3.4 })
  ok(f2.body ~= '' and not string.find(f2.body, '{', 1, true), 'H6 ' .. r .. ' fail 表形态可用', f2.body)
  -- H7 三因都能取到非空句
  local why = { 'cd', 'energy', 'locked' }
  for k = 1, #why do
    local g = M.fail(r, why[k], 2)
    ok(u8len(g.body) > 0, 'H7 ' .. r .. '.fail.' .. why[k] .. ' 有正文', g.body)
  end
  -- H8 fail 三因各连取 3 次，三次互不相同（真的三条不同的句子）
  for k = 1, #why do
    local a = M.fail(r, why[k], 2).body
    local b = M.fail(r, why[k], 2).body
    local c = M.fail(r, why[k], 2).body
    ok(a ~= b and b ~= c and a ~= c, 'H8 ' .. r .. '.fail.' .. why[k] .. ' 三句不重复',
      a .. ' / ' .. b .. ' / ' .. c)
  end

  -- H9 hold：剩余 ≤2.5s 出最后一条（收尾语气）
  local hl = M.hold(r, 3, 1.0, nil)
  local lastHold = M.ROLES[r].hold[#M.ROLES[r].hold]
  ok(hl.body == lastHold.b, 'H9 ' .. r .. ' hold 收尾句 = hold 最后一条', hl.body)

  -- H10 settle：win 走 win 句
  local sw = M.settle(r, { win = true, lines = 2 })
  ok(sw.body == M.ROLES[r].win.b, 'H10 ' .. r .. ' settle 胜利句', sw.body)
  -- H11 settle：lines>=8 走 settleBig 且数字填得进去
  local sb = M.settle(r, { lines = 12 })
  ok(sb.body == (M.ROLES[r].settleBig.b:gsub('{lines}', '12')), 'H11 ' .. r .. ' settleBig 填 {lines}', sb.body)
  -- H12 settle：lines>=4 走 quad
  local sq = M.settle(r, { lines = 4 })
  ok(sq.body == M.ROLES[r].quad.b, 'H12 ' .. r .. ' 四消句', sq.body)

  -- H13 level：{lv} 填得进去
  local lv = M.level(r, 5)
  ok(lv.body == (M.ROLES[r].level[1].b:gsub('{lv}', '5')), 'H13 ' .. r .. ' level 填 {lv}', lv.body)

  -- H14 unlock / idle 可用
  ok(u8len(M.unlock(r).body) > 0, 'H14 ' .. r .. ' unlock 有正文')
  ok(u8len(M.idle(r).body) > 0, 'H15 ' .. r .. ' idle 有正文')

  -- H16 台词区撑满一页：sayList(r,8) 恰好 8 条且句句不同
  local say = M.sayList(r, 8)
  ok(#say == 8, 'H16 ' .. r .. ' sayList(r,8) 返回 8 条', tostring(#say))
  local uniq, dupS = {}, 0
  for k = 1, #say do
    if uniq[say[k].body] then dupS = dupS + 1 end
    uniq[say[k].body] = true
  end
  ok(dupS == 0, 'H17 ' .. r .. ' 角色页 8 句台词互不相同', 'dup=' .. dupS)
  ok(u8len(M.quote(r).body) > 0, 'H18 ' .. r .. ' quote 单句可用')
  ok(#M.quotesOf(r) >= 8, 'H19 ' .. r .. ' quotesOf >= 8')
end

-- ---------------------------------------------------------------------------
-- I 模块内置体检 M.audit() 自身可信（真机 print 的那组读数）
-- ---------------------------------------------------------------------------
local a = M.audit()
ok(a.ok == true, 'I1 M.audit().ok', table.concat(a.over, ' | '))
ok(a.maxLen <= LIMIT, 'I2 M.audit().maxLen <= 24', tostring(a.maxLen))
ok(a.keys == 4, 'I3 M.audit() 覆盖 4 个角色', tostring(a.keys))
local totalN = 0
for i = 1, #ROLES do totalN = totalN + (a.perRole[ROLES[i]] or 0) end
ok(totalN > 100, 'I4 M.audit() 统计到的条目数 > 100', tostring(totalN))

-- ---------------------------------------------------------------------------
-- J main.lua 消费路径冒烟：按真实调用形态逐个走一遍（口径照 main 的 7 处）
--   3701-3719 主题色/名字/技能名；3813-3814 技能反馈出口；4178-4179 持续期；
--   4246-4277 角色页 charData（blocks 循环 + says）；4391 角色详情页
-- ---------------------------------------------------------------------------
local BLOCKS = { 'cast', 'hold', 'settle' }         -- main.lua:4272-4277 的 blocks 表
for i = 1, #ROLES do
  local r = ROLES[i]
  ok(type(M.ROLES[r].color2) == 'number' and type(M.ROLES[r].color) == 'number'
    and type(M.ROLES[r].name) == 'string' and type(M.ROLES[r].skill) == 'string',
    'J1 ' .. r .. ' main:3701-3719 需要的 color2/color/skill/name 齐')
  -- 3813-3814：kind -> 函数，逐个 pcall（真实签名带 role + ctx）
  local kinds = {
    { 'fail', function() return M.fail(r, 'cd', 3.4) end },
    { 'end', function() return M.settle(r, { win = false, lines = 3, garbage = 2, score = 1200 }) end },
    { 'level', function() return M.level(r, 4) end },
    { 'unlock', function() return M.unlock(r) end },
    { 'cast', function() return M.cast(r, { mode = 'casual', lv = 3, tier = 1 }) end },
  }
  local bad = {}
  for k = 1, #kinds do
    local okc, res = pcall(kinds[k][2])
    if not okc or type(res) ~= 'table' or type(res.title) ~= 'string' or type(res.body) ~= 'string' then
      bad[#bad + 1] = kinds[k][1]
    end
  end
  ok(#bad == 0, 'J2 ' .. r .. ' skillFeedback 五个 kind 都返回 {title,body}', table.concat(bad, ','))
  -- 4178-4179：持续期每 2.4s 一次，left 从 8 递减到 0，n 有时为 nil
  local badHold = {}
  local left = 8
  while left >= 0 do
    local okc, res = pcall(M.hold, r, 8 - left, left, nil)
    if not okc or type(res.body) ~= 'string' then badHold[#badHold + 1] = tostring(left) end
    left = left - 2.4
  end
  ok(#badHold == 0, 'J3 ' .. r .. ' hold 全程（left 8→0）不抛错', table.concat(badHold, ','))
  -- 4246-4277：charData 的 blocks 循环，取 min(2,#t) 条
  local says = {}
  for b = 1, #BLOCKS do
    local t = M.ROLES[r][BLOCKS[b]]
    for k = 1, math.min(2, #t) do
      if t[k] and t[k].b then says[#says + 1] = tostring(t[k].b) end
    end
  end
  ok(#says >= 4, 'J4 ' .. r .. ' charData 现取到 ' .. #says .. ' 句（≥4，页面只渲染前 2）')
  -- 4268-4269：help/tips 直取
  ok(#M.help(r) >= 3 and #M.tips(r) >= 3, 'J5 ' .. r .. ' help/tips 各 ≥3 可用')
  -- 4391：详情页 e.element / e.title
  ok(u8len(M.ROLES[r].element) == 1 and u8len(M.ROLES[r].title) >= 2,
    'J6 ' .. r .. ' element 单字 + title 可用于「X元素 · 称号」行')
end

-- ---------------------------------------------------------------------------
-- 汇总
-- ---------------------------------------------------------------------------
io.write('----\n')
io.write('四角色条数：\n')
for i = 1, #ROLES do
  local r = ROLES[i]
  local c = counts[r]
  io.write(string.format('  %-6s cast=%d hold=%d fail=%d settle=%d level=%d quotes=%d help=%d tips=%d idle=%d\n',
    NAMES[r], c.cast, c.hold, c.fail, c.settle, c.level, c.quotes, c.help, c.tips, c.idle))
end
if fail == 0 then
  io.write(string.format('ALL GREEN  %d/%d assertions passed\n', pass, pass + fail))
  os.exit(0)
else
  io.write(string.format('FAILED  %d/%d passed, %d failed\n', pass, pass + fail, fail))
  for i = 1, #fails do io.write('  - ', fails[i], '\n') end
  os.exit(1)
end
