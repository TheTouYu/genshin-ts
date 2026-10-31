--[[==========================================================================
 tests-lua/run_cases.lua —— headless 用例驱动器（lua5.3，秒级跑 tests/*.json）
 ----------------------------------------------------------------------------
 干什么：逐条读 tests/*.json → 新建假引擎（engine_shim.lua）→ 加载 lua/main.lua
         并跑 OnInit/OnEnable/OnStart → 按 case.dt 推虚拟时间、在 events[].at 触发
         按键/指针/点击 → 在 asserts[].at 求值 → 逐例 PASS/FAIL + 汇总。
 用法：
   lua5.3 tests-lua/run_cases.lua                # 全量 70 例
   lua5.3 tests-lua/run_cases.lua 01 08           # 文件名子串过滤
   lua5.3 tests-lua/run_cases.lua '4?-*'          # glob 过滤（* ? 通配）
   lua5.3 tests-lua/run_cases.lua --list          # 只列用例
 退出码：全部已实现断言通过（且无 unsupported）→ 0；否则 1。

 断言语义以模拟器 studio/autotest/{assert,runner,format}.js 为准：
   · log     = 客户端日志文本包含 contains（source=server 无通道 ⇒ unsupported）
   · control = 按 name 递归找控件，读快照字段与 equals 深比较（找不到即失败）
   · tree    = 按 name 递归找控件，存在性 == exists
   · lua     = 在**新建沙箱**里 load(source) 执行，只有抛错算失败（return false 不算）
   · audioExpect/audioExclude = case 级，读 PlayAudio2D 调用序列（同 runner.mjs 的 audio.recent）
 时间线（同 runner.js replayCase）：
   time=0 先派发 t<=1e-9 的事件、再按文件顺序求值 at<=1e-9 的断言；
   然后 while time+1e-9 < end：step(dt) → time=round(time+dt,1e-9) → 事件 → 断言。
   end = max(最后事件 t, 最后断言 at)。

 硬线（防假绿）：任何未实现的断言 kind/字段/事件 kind ⇒ 记 unsupported 并**计入失败**，
 不会静默跳过；汇总行把 unsupported 数单独列出来。
=========================================================================]]

local script_path = arg and arg[0] or 'tests-lua/run_cases.lua'
local here = script_path:match('^(.*)/[^/]*$') or '.'
local json = dofile(here .. '/json.lua')
local shim = dofile(here .. '/engine_shim.lua')
local project_root = here:match('^(.*)/[^/]*$') or '.'
if project_root == '' then project_root = '.' end

local EPS = 1e-9
local DEFAULT_DT = 1 / 30

--------------------------------------------------------------------------------
-- 小工具
--------------------------------------------------------------------------------
local function deep_equal(a, b)
  if a == b then return true end
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return false end
  if a == json.null or b == json.null then return false end
  local na, nb = 0, 0
  for k, v in pairs(a) do
    na = na + 1
    if not deep_equal(v, b[k]) then return false end
  end
  for _ in pairs(b) do nb = nb + 1 end
  return na == nb
end

local function fmt_value(value)
  if value == nil then return 'nil' end
  if value == json.null then return 'null' end
  if type(value) == 'string' then return string.format('%q', value) end
  if type(value) == 'table' then
    local parts = {}
    for i, v in ipairs(value) do parts[i] = fmt_value(v) end
    if #parts > 0 then return '[' .. table.concat(parts, ',') .. ']' end
    local keys = {}
    for k in pairs(value) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    for i, k in ipairs(keys) do parts[i] = k .. '=' .. fmt_value(value[k]) end
    return '{' .. table.concat(parts, ',') .. '}'
  end
  return tostring(value)
end

local function list_case_files()
  local files = {}
  local pipe = io.popen('ls -1 ' .. string.format('%q', project_root .. '/tests') .. ' 2>/dev/null')
  if not pipe then return files end
  for line in pipe:lines() do
    if line:match('%.json$') then files[#files + 1] = line end
  end
  pipe:close()
  return files
end

local function glob_to_pattern(glob)
  local out = glob:gsub('[%^%$%(%)%%%.%[%]%+%-]', '%%%0')
  out = out:gsub('%*', '.*'):gsub('%?', '.')
  return '^' .. out .. '$'
end

--------------------------------------------------------------------------------
-- 断言求值（语义对齐 studio/autotest/assert.js）
--------------------------------------------------------------------------------
local function eval_log(engine, assert)
  local source = assert.source or 'client'
  if source ~= 'client' then
    return { unsupported = 'log 断言 source=' .. tostring(source) .. '（headless 只有客户端 print 通道）' }
  end
  if assert.level and assert.level ~= 'info' then
    return { unsupported = 'log 断言 level=' .. tostring(assert.level) .. '（shim 只记录 info 级）' }
  end
  local needle = assert.contains
  local texts = engine.log_texts
  if assert.regex then
    local ok, pattern = pcall(string.pattern, nil)
    if not ok then pattern = nil end
    local matched = false
    for i = 1, #texts do
      if tostring(texts[i]):find(assert.regex) then matched = true break end
    end
    if matched then return { ok = true, actual = assert.regex, expected = assert.regex } end
    return { ok = false, actual = texts[#texts] or '', expected = assert.regex, message = '无日志匹配该 Lua 模式' }
  end
  if assert.equals then
    for i = 1, #texts do
      if texts[i] == assert.equals then return { ok = true, actual = assert.equals } end
    end
    return { ok = false, actual = texts[#texts] or '', expected = assert.equals, message = '无日志整行等于期望' }
  end
  if type(needle) ~= 'string' then
    return { unsupported = 'log 断言缺 contains 字段' }
  end
  for i = 1, #texts do
    if texts[i]:find(needle, 1, true) then return { ok = true, actual = needle, expected = needle } end
  end
  local tail = {}
  for i = math.max(1, #texts - 7), #texts do tail[#tail + 1] = texts[i] end
  return {
    ok = false, actual = table.concat(tail, '\n'), expected = needle,
    message = '客户端日志不含该子串（尾部 8 行）',
  }
end

local function eval_control(engine, assert)
  local name = assert.name
  if name == nil then
    return { unsupported = 'control 断言缺 name（用例用 id 寻址的形态未支持）' }
  end
  local control = engine:find(name)
  if not control then
    return {
      ok = false, actual = nil, expected = assert.equals,
      message = 'control not found: ' .. tostring(name),
    }
  end
  local field = assert.field
  local actual, why = engine:field_of(control, field)
  if why then
    return { unsupported = 'control 断言字段 ' .. tostring(field) .. '（shim 未建模该快照字段）' }
  end
  if deep_equal(actual, assert.equals) then return { ok = true, actual = actual, expected = assert.equals } end
  return { ok = false, actual = actual, expected = assert.equals }
end

local function eval_tree(engine, assert)
  if assert.name == nil then
    return { unsupported = 'tree 断言缺 name（用例用 id 寻址的形态未支持）' }
  end
  local exists = engine:find(assert.name) ~= nil
  local expect = assert.exists
  if expect == nil then expect = true end
  local want = expect ~= false
  if exists == want then return { ok = true, actual = exists, expected = want } end
  return { ok = false, actual = exists, expected = want }
end

local function make_query(engine)
  local function control_row(name)
    local control = engine:find(tostring(name))
    if not control then return nil end
    local row = {
      id = engine:field_of(control, 'id'),
      name = engine:field_of(control, 'name'),
      kind = engine:field_of(control, 'kind'),
      active = engine:field_of(control, 'active'),
      visible = engine:field_of(control, 'visible'),
      pressed = engine:field_of(control, 'pressed'),
      text = engine:field_of(control, 'text'),
      interactable = engine:field_of(control, 'interactable'),
    }
    return row
  end
  return {
    var = function(entity_type, name) return nil end,
    logs = function()
      local out = {}
      for i, text in ipairs(engine.log_texts) do out[i] = text end
      return out
    end,
    logContains = function(text)
      local needle = tostring(text)
      for i = 1, #engine.log_texts do
        if engine.log_texts[i]:find(needle, 1, true) then return true end
      end
      return false
    end,
    serverLogs = function() return {} end,
    serverLogContains = function(text) return false end,
    control = control_row,
    signals = function(direction)
      local rows = (direction == 'outbound') and engine.outbound or engine.inbound
      local out = {}
      for i, row in ipairs(rows) do out[i] = { name = row.name, values = row.values } end
      return out
    end,
  }
end

local function eval_lua(engine, assert)
  local source = assert.source
  if type(source) ~= 'string' or source == '' then
    return { unsupported = 'lua 断言缺 source' }
  end
  local sandbox = setmetatable({ query = make_query(engine) }, { __index = _G })
  local chunk, compile_err = load(source, '=lua-assert', 't', sandbox)
  if not chunk then
    return { ok = false, actual = nil, message = 'lua 断言编译失败: ' .. tostring(compile_err) }
  end
  local ok, run_err = pcall(chunk)
  if not ok then
    return { ok = false, actual = nil, message = 'lua 断言抛错: ' .. tostring(run_err) }
  end
  return { ok = true, actual = true }
end

local ASSERT_EVAL = {
  log = eval_log,
  control = eval_control,
  tree = eval_tree,
  lua = eval_lua,
}

--------------------------------------------------------------------------------
-- 时间线（对齐 studio/autotest/runner.js replayCase）
--------------------------------------------------------------------------------
local function sorted_events(case)
  local rows = {}
  for i, event in ipairs(case.events or {}) do
    rows[#rows + 1] = { t = tonumber(event.t) or 0, index = i, event = event }
  end
  table.sort(rows, function(a, b)
    if a.t ~= b.t then return a.t < b.t end
    return a.index < b.index
  end)
  return rows
end

local function apply_event(engine, event)
  local kind = event.kind
  if kind == 'pointer' then
    local pointer_type = event.type
    if pointer_type ~= 'down' and pointer_type ~= 'up' and pointer_type ~= 'move' then
      return 'pointer.type=' .. tostring(pointer_type)
    end
    engine:pointer(pointer_type, tonumber(event.x) or 0, tonumber(event.y) or 0)
    return nil
  elseif kind == 'key' then
    if type(event.typeName) ~= 'string' then return 'key 事件缺 typeName' end
    engine:key(event.typeName)
    return nil
  elseif kind == 'click' then
    if type(event.name) ~= 'string' then return 'click 事件缺 name' end
    engine:click(event.name)
    return nil
  end
  return 'event kind=' .. tostring(kind)
end

local function round9(value)
  return math.floor(value * 1e9 + 0.5) / 1e9
end

local function replay_case(engine, case)
  local events = sorted_events(case)
  local asserts = {}
  for i, assert in ipairs(case.asserts or {}) do
    asserts[i] = { at = tonumber(assert.at) or 0, index = i, assert = assert, done = false }
  end
  local dt = tonumber(case.dt) or DEFAULT_DT
  if dt <= 0 then dt = DEFAULT_DT end

  local last_event = 0
  for _, row in ipairs(events) do if row.t > last_event then last_event = row.t end end
  local last_assert = 0
  for _, row in ipairs(asserts) do if row.at > last_assert then last_assert = row.at end end
  local end_time = math.max(last_event, last_assert)

  local results = {}
  local counts = { log = 0, control = 0, tree = 0, lua = 0 }
  local unsupported = {}
  local failure = nil
  local event_index = 1
  local time_now = 0
  local budget = math.ceil(end_time / dt) + 8

  local function record(entry, judged)
    local assert = entry.assert
    local kind = assert.kind or '?'
    local row = {
      kind = kind, at = entry.at, index = entry.index,
      ok = judged.ok == true, actual = judged.actual, expected = judged.expected,
      message = judged.message, unsupported = judged.unsupported,
    }
    results[#results + 1] = row
    if judged.unsupported then
      unsupported[#unsupported + 1] = judged.unsupported
    elseif counts[kind] ~= nil then
      counts[kind] = counts[kind] + 1
    end
    if not row.ok and not failure then failure = row end
    return not row.ok
  end

  local function apply_due_events()
    while event_index <= #events and events[event_index].t <= time_now + EPS do
      local event = events[event_index].event
      local problem = apply_event(engine, event)
      if problem then
        unsupported[#unsupported + 1] = 'event ' .. problem .. '（shim 未建模）'
        if not failure then
          failure = {
            kind = 'event', at = events[event_index].t, ok = false,
            actual = nil, expected = nil, message = 'unsupported event: ' .. problem,
          }
        end
      end
      event_index = event_index + 1
    end
  end

  local function run_due_asserts()
    for _, entry in ipairs(asserts) do
      if not entry.done and entry.at <= time_now + EPS then
        entry.done = true
        local evaluator = ASSERT_EVAL[entry.assert.kind]
        local judged
        if not evaluator then
          judged = { unsupported = 'assert kind=' .. tostring(entry.assert.kind) .. '（shim 未实现）' }
        else
          local ok, value = pcall(evaluator, engine, entry.assert)
          if ok then
            judged = value
          else
            judged = { ok = false, message = '断言求值器抛错: ' .. tostring(value) }
          end
        end
        record(entry, judged)
      end
    end
  end

  apply_due_events()
  run_due_asserts()
  local iterations = 0
  while time_now + EPS < end_time and iterations < budget do
    iterations = iterations + 1
    engine:step(dt)
    time_now = round9(time_now + dt)
    apply_due_events()
    run_due_asserts()
  end

  -- 未求值的断言（例如 at > 实际推进到的时刻）：记账为 unsupported，不静默丢
  for _, entry in ipairs(asserts) do
    if not entry.done then
      unsupported[#unsupported + 1] = string.format(
        'assert at=%s 从未到点（实际推进到 %s）', tostring(entry.at), tostring(time_now))
      record(entry, { ok = false, message = '断言未到点' })
    end
  end

  return {
    results = results,
    counts = counts,
    unsupported = unsupported,
    failure = failure,
    audio_checked = 0,
    passed = (failure == nil) and (#unsupported == 0),
    time_end = time_now,
    frames = iterations,
  }
end

--------------------------------------------------------------------------------
-- 音效（case 级；对齐 qxqy/runner.mjs 的 audioExpect/audioExclude）
--------------------------------------------------------------------------------
local function check_audio(engine, case)
  local expect = case.audioExpect or {}
  local exclude = case.audioExclude or {}
  local history = engine:audio_ids()
  local seen = {}
  for _, id in ipairs(history) do seen[id] = (seen[id] or 0) + 1 end
  local missing, forbidden = {}, {}
  for _, id in ipairs(expect) do
    if not seen[id] then missing[#missing + 1] = id end
  end
  for _, id in ipairs(exclude) do
    if seen[id] then forbidden[#forbidden + 1] = id end
  end
  local tally_parts = {}
  for id, n in pairs(seen) do tally_parts[#tally_parts + 1] = tostring(id) .. '×' .. n end
  table.sort(tally_parts)
  return {
    checked = #expect + #exclude,
    missing = missing,
    forbidden = forbidden,
    tally = table.concat(tally_parts, ' ') ,
    ok = (#missing == 0 and #forbidden == 0),
  }
end

--------------------------------------------------------------------------------
-- 主流程
--------------------------------------------------------------------------------
local filters = {}
local list_only = false
for i = 1, #arg do
  if arg[i] == '--list' then list_only = true
  elseif arg[i] == '--help' or arg[i] == '-h' then
    print('用法：lua5.3 tests-lua/run_cases.lua [过滤子串|glob]* [--list]')
    os.exit(0)
  else
    filters[#filters + 1] = arg[i]
  end
end

local case_files = list_case_files()
if #case_files == 0 then
  io.stderr:write('没有找到用例：' .. project_root .. '/tests/*.json\n')
  os.exit(1)
end
if #filters > 0 then
  local kept = {}
  for _, file in ipairs(case_files) do
    local hit = false
    for _, filter in ipairs(filters) do
      if file:find(filter, 1, true) or file:find(glob_to_pattern(filter)) then hit = true break end
    end
    if hit then kept[#kept + 1] = file end
  end
  case_files = kept
end
if #case_files == 0 then
  io.stderr:write('没有匹配的用例（过滤器：' .. table.concat(filters, ' ') .. '）\n')
  os.exit(1)
end
if list_only then
  for _, file in ipairs(case_files) do print(file) end
  os.exit(0)
end

local save_text = assert(io.open(project_root .. '/tetris.save.json', 'rb'), 'tetris.save.json 不存在'):read('a')
local save = json.decode(save_text)

local started = os.clock()
local pass = 0
local failures = {}
local unsupported_total = 0
local per_case = {}

for _, file in ipairs(case_files) do
  local case_started = os.clock()
  local raw = io.open(project_root .. '/tests/' .. file, 'rb')
  local case = json.decode(assert(raw, '读不到 ' .. file):read('a'))
  raw:close()
  local canvas_id = case.canvasId or 'mobile-16-9'
  local engine_ok, engine = pcall(shim.new, {
    save = save, canvas_id = canvas_id, project_root = project_root,
  })
  local report
  if not engine_ok then
    report = {
      error = 'shim.new 失败: ' .. tostring(engine),
      results = {}, counts = { log = 0, control = 0, tree = 0, lua = 0 },
      unsupported = {}, passed = false, failure = nil, audio_checked = 0,
    }
  else
    local load_err = engine:load_main()
    if load_err then
      report = {
        error = 'main.lua 加载失败: ' .. load_err,
        results = {}, counts = { log = 0, control = 0, tree = 0, lua = 0 },
        unsupported = {}, passed = false, failure = nil, audio_checked = 0,
        engine = engine,
      }
    else
      report = replay_case(engine, case)
      report.engine = engine
      local audio = check_audio(engine, case)
      report.audio = audio
      report.audio_checked = audio.checked
      if not audio.ok then
        report.passed = false
        if audio.tally == '' then audio.tally = '(空)' end
        if not report.failure then
          report.failure = {
            kind = 'audio', at = report.time_end,
            ok = false, actual = audio.tally,
            expected = { expect = case.audioExpect, exclude = case.audioExclude },
          }
        end
      end
    end
  end

  local elapsed = os.clock() - case_started
  per_case[#per_case + 1] = { file = file, elapsed = elapsed, report = report }
  unsupported_total = unsupported_total + #report.unsupported

  if report.passed then
    pass = pass + 1
    local counts = report.counts
    print(string.format(
      'PASS %s  (%d 断言：log %d / control %d / tree %d / lua %d；audio %d；%.2fs)',
      file, (counts.log + counts.control + counts.tree + counts.lua),
      counts.log, counts.control, counts.tree, counts.lua,
      report.audio_checked or 0, elapsed))
  else
    failures[#failures + 1] = { file = file, report = report }
    print(string.format('FAIL %s  (%.2fs)', file, elapsed))
    if report.error then print('  · ' .. report.error) end
    for _, row in ipairs(report.results) do
      if not row.ok then
        print(string.format(
          '  · %s@%s 期望=%s 实得=%s %s',
          row.kind, tostring(row.at), fmt_value(row.expected), fmt_value(row.actual),
          row.unsupported and ('UNSUPPORTED: ' .. row.unsupported) or (row.message or '')))
      end
    end
    for _, note in ipairs(report.unsupported) do
      print('  · UNSUPPORTED: ' .. note)
    end
    local audio = report.audio
    if audio then
      if #audio.missing > 0 then
        print('  · audio 期望含 ' .. table.concat((function()
          local out = {}
          for i, id in ipairs(audio.missing) do out[i] = tostring(id) end
          return out
        end)(), ',') .. '，实得历史：' .. audio.tally)
      end
      if #audio.forbidden > 0 then
        print('  · audio 不该出现 ' .. table.concat((function()
          local out = {}
          for i, id in ipairs(audio.forbidden) do out[i] = tostring(id) end
          return out
        end)(), ',') .. '，实得历史：' .. audio.tally)
      end
    end
    if report.engine and #report.engine.errors > 0 then
      local seen = {}
      local shown = 0
      for _, err in ipairs(report.engine.errors) do
        local key = err.where .. '|' .. err.message
        if not seen[key] and shown < 3 then
          seen[key] = true
          shown = shown + 1
          print(string.format('  · lua 错误[%s] %s', err.where, err.message))
        end
      end
    end
  end
end

local elapsed = os.clock() - started
print(string.format('\n%d/%d 用例通过，%.2fs（headless lua5.3）', pass, #case_files, elapsed))
if unsupported_total > 0 then
  print(string.format('unsupported 断言/事件 %d 条（按约定计入失败，未静默跳过）', unsupported_total))
end
if #failures > 0 then
  print('\n--- 失败用例清单 ---')
  for _, item in ipairs(failures) do
    local failure = item.report.failure
    local detail = ''
    if failure then
      detail = string.format('%s@%s 期望=%s 实得=%s',
        tostring(failure.kind), tostring(failure.at),
        fmt_value(failure.expected), fmt_value(failure.actual))
    elseif item.report.error then
      detail = item.report.error
    end
    print(string.format('  %s :: %s', item.file, detail))
  end
end
print('\n不可信边界（本 shim 未建模，勿把通过当证明）：')
print('  · 渲染/字体度量/裁剪、音频时长与白名单、容器 Scroll/Grid 排版、Tween/动画/信号收发、真机差异')
os.exit((pass == #case_files and unsupported_total == 0) and 0 or 1)
