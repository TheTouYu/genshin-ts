-- qxqy_ui 框架自测入口：lua5.3 tests/run_all.lua
local here = arg[0]:match('^(.*)/[^/]+$') or '.'
local root = here .. '/..'
local files = { 'view_kit_test', 'scenes_test', 'app_test', 'platform_test', 'view_node_lint_test' }
local fail = 0
for _, name in ipairs(files) do
  local cmd = string.format('QxqyUiRoot=%s lua5.3 %s/%s.lua', root, here, name)
  local ok = os.execute(cmd)
  if not ok then
    print(('FAILED %s'):format(name))
    fail = fail + 1
  end
end
print(fail == 0 and '== qxqy_ui framework: ALL GREEN ==' or '== qxqy_ui framework: FAILED ==')
os.exit(fail == 0 and 0 or 1)
