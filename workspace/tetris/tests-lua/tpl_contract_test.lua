--[[==========================================================================
 tests-lua/tpl_contract_test.lua —— 模板键名契约（2026-11-16 真机事故回灌）
 跑法：cd <root> && lua5.3 tests-lua/tpl_contract_test.lua

 事故：视图写 `tpl = 'stext'`，而 config 里那张候选表叫 `settleText`。
       `templates['stext']` 得到空表 ⇒ 真机文字全灭、模拟器却因兜底扫描"恰好能用"。
       修了两轮才对——第一轮我按"能力判据"去改，方向是错的。

 本测试的判据：**视图里出现的每个 tpl 键，config 里必须有同名的非空候选表**。
 纯静态、不启动引擎、不需要真机，构建期就能红。
==========================================================================]]

local ROOT = os.getenv('QxqyUiRoot') or os.getenv('TETRIS_ROOT') or '.'
local function load(path) return assert(loadfile(ROOT .. '/' .. path))() end

local pass, fail = 0, 0
local function ok(cond, name, extra)
  if cond then pass = pass + 1 print('PASS  ' .. name)
  else fail = fail + 1 print('FAIL  ' .. name .. (extra and (' :: ' .. tostring(extra)) or '')) end
end

local CFG = load('lua/tetris/config.lua')
local G = CFG.TPL_GUIDS or {}

-- 收集 config 里"有非空候选表"的键
local declared = {}
for k, v in pairs(G) do
  if type(v) == 'table' and #v > 0 then declared[k] = #v end
end

-- 扫描所有视图/渲染代码里的 tpl = '<ident>' / tpl = "<ident>"
local files = { 'lua/tetris/render.lua' }
local p = io.popen('ls ' .. ROOT .. '/lua/tetris/view_*.lua 2>/dev/null')
if p then
  for line in p:lines() do
    local base = line:match('([^/]+)$')
    if base then files[#files + 1] = 'lua/tetris/' .. base end
  end
  p:close()
end

local used, missing, scanned = {}, {}, 0
for _, f in ipairs(files) do
  local fh = io.open(ROOT .. '/' .. f)
  if fh then
    scanned = scanned + 1
    for line in fh:lines() do
      -- 注释行不算
      if not line:match('^%s*%-%-') then
        for key in line:gmatch("tpl%s*=%s*'([%w_]+)'") do used[key] = f end
        for key in line:gmatch('tpl%s*=%s*"([%w_]+)"') do used[key] = f end
      end
    end
    fh:close()
  end
end

local names = {}
for k in pairs(used) do names[#names + 1] = k end
table.sort(names)

-- T1 视图用到的每个 tpl 键都必须在 config 里有非空候选表
for _, k in ipairs(names) do
  if not declared[k] then missing[#missing + 1] = k .. '(' .. used[k] .. ')' end
end
ok(#missing == 0, 'T1 视图用的 tpl 键都有同名的非空候选表',
  #missing .. ' 个未声明: ' .. table.concat(missing, ', '))

-- T2 至少扫到文件、至少发现一个键（防空转：扫描逻辑坏掉时会"零缺失"假绿）
ok(scanned >= 3 and #names >= 2, 'T2 扫描非空（防空转假绿）',
  'files=' .. scanned .. ' keys=' .. #names)

-- T3 别名必须指向同一张表（单源），防止两层各写一份后漂移
if G.stext and G.settleText then
  ok(G.stext == G.settleText, 'T3 stext 与 settleText 必须是同一张表（单源别名）')
end

-- T4 候选条目类型：数字 / 字符串占位符 / nil（仓库源码里 __GUID_X__ 未替换时为 nil）。
-- 但不允许 boolean/table 这类真正的类型错误，且每张表至少要有一个可用的非 nil 候选。
local bad, empty = {}, {}
for k, v in pairs(G) do
  if type(v) == 'table' then
    local live = 0
    for i = 1, #v do
      local t = type(v[i])
      if t == 'number' or t == 'string' then live = live + 1
      elseif t ~= 'nil' then bad[#bad + 1] = k .. '[' .. i .. ']=' .. t end
    end
    if live == 0 then empty[#empty + 1] = k end
  end
end
ok(#bad == 0, 'T4 候选条目不得是 boolean/table 等错误类型', table.concat(bad, ', '))
ok(#empty == 0, 'T4b 每张候选表至少有一个非 nil 条目（全空=写错了键）', table.concat(empty, ', '))

print(string.format('\n== tpl_contract_test: %d passed, %d failed ==', pass, fail))
os.exit(fail == 0 and 0 or 1)
