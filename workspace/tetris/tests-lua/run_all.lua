--[[==========================================================================
 tests-lua/run_all.lua —— headless 单测总入口（不依赖模拟器，秒级）
 跑法：cd /home/h/genshin-ts/workspace/tetris && lua5.3 tests-lua/run_all.lua
 判据：全部文件退出码 0；任一失败 ⇒ 汇总表里标 FAIL 并整体退出码 1。

 为什么要有它：模拟器 runner 跑一轮 70 个用例要 ~387s，一个 bug 只能靠那一轮取证。
 headless 这一层是「复现便宜」的地基：纯逻辑/几何/层序/文案问题在这里 50ms 出结果，
 模拟器只留给「真实引擎行为」与最终视觉确认。
========================================================================]]

local files = {}
local pipe = io.popen('ls tests-lua/*_test.lua tests-lua/*_audit.lua 2>/dev/null')
if pipe then
  for line in pipe:lines() do files[#files + 1] = line end
  pipe:close()
end
table.sort(files)

if #files == 0 then
  print('no tests found under tests-lua/')
  os.exit(1)
end

local failed = {}
local total = 0
local t0 = os.clock()

for i = 1, #files do
  total = total + 1
  local cmd = 'lua5.3 ' .. files[i] .. ' 2>&1'
  local p = io.popen(cmd)
  local out = p:read('a') or ''
  local okExec, how, code = p:close()
  local ok = (code == 0) and (how == 'exit')
  print(string.format('%-42s %s', files[i], ok and 'ok' or 'FAIL'))
  if not ok then
    failed[#failed + 1] = files[i]
    print(out)
  end
end

local dt = os.clock() - t0
print(string.format('\n== headless: %d/%d files green, %.2fs ==', total - #failed, total, dt))
if #failed > 0 then
  print('failed: ' .. table.concat(failed, ', '))
  os.exit(1)
end
os.exit(0)
