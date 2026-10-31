--[[==========================================================================
 tests-lua/json.lua —— 最小 JSON 解析（零第三方依赖）
 ----------------------------------------------------------------------------
 用途：headless 用例驱动器读 tests/*.json 与 tetris.save.json。
 支持：对象 / 数组 / 字符串（含 \" \\ \/ \b \f \n \r \t 与 \uXXXX，含代理对）/
       数字（整数/小数/指数/负号）/ true / false / null（返回 M.null 哨兵）。
 不支持（出现即报错，不静默吞）：注释、尾逗号、NaN/Infinity、BOM、单引号串。
 自测：`lua5.3 tests-lua/json.lua` 跑 5 条，全过打印 `json selftest 5/5` 且 exit 0。
=========================================================================]]

local M = {}

local NULL = setmetatable({}, { __tostring = function() return 'null' end })
M.null = NULL

local ESCAPES = {
  ['"'] = '"', ['\\'] = '\\', ['/'] = '/',
  b = '\b', f = '\f', n = '\n', r = '\r', t = '\t',
}

local function utf8_char(cp)
  if cp < 0x80 then return string.char(cp) end
  if cp < 0x800 then
    return string.char(0xC0 + math.floor(cp / 0x40), 0x80 + cp % 0x40)
  end
  if cp < 0x10000 then
    return string.char(0xE0 + math.floor(cp / 0x1000),
      0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
  end
  return string.char(0xF0 + math.floor(cp / 0x40000),
    0x80 + math.floor(cp / 0x1000) % 0x40,
    0x80 + math.floor(cp / 0x40) % 0x40, 0x80 + cp % 0x40)
end

-- 解析一份完整 JSON 文本；失败抛错（带位置与上下文，便于定位坏用例）
function M.decode(text)
  if type(text) ~= 'string' then error('json: decode expects a string', 2) end
  local s = text
  local pos = 1
  local len = #s

  local function fail(msg)
    local a = math.max(1, pos - 30)
    local b = math.min(len, pos + 30)
    error(string.format('json: %s (pos %d): %q', msg, pos, s:sub(a, b)), 0)
  end

  local function skip_ws()
    local _, e = s:find('^[ \t\r\n]*', pos)
    if e then pos = e + 1 end
  end

  local parse_value

  local function parse_string()
    pos = pos + 1 -- opening quote
    local out = {}
    while true do
      local i = s:find('["\\]', pos)
      if not i then fail('unterminated string') end
      if i > pos then out[#out + 1] = s:sub(pos, i - 1) end
      local ch = s:sub(i, i)
      if ch == '"' then
        pos = i + 1
        return table.concat(out)
      end
      local e = s:sub(i + 1, i + 1)
      if e == 'u' then
        local hex = s:sub(i + 2, i + 5)
        if not hex:match('^%x%x%x%x$') then fail('bad \\u escape') end
        local cp = tonumber(hex, 16)
        pos = i + 6
        if cp >= 0xD800 and cp <= 0xDBFF and s:sub(pos, pos + 1) == '\\u' then
          local low = s:match('^\\u(%x%x%x%x)', pos + 2)
          local lo = low and tonumber(low, 16) or nil
          if lo and lo >= 0xDC00 and lo <= 0xDFFF then
            cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
            pos = pos + 6
          end
        end
        out[#out + 1] = utf8_char(cp)
      else
        local rep = ESCAPES[e]
        if not rep then fail('bad escape \\' .. e) end
        out[#out + 1] = rep
        pos = i + 2
      end
    end
  end

  local function parse_number()
    local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', pos)
    if not num or num == '' then fail('bad number') end
    -- 排除 "1abc" 这类：匹配段后紧跟的必须是分隔符
    local nxt = s:sub(pos + #num, pos + #num)
    if nxt ~= '' and not nxt:match('[ \t\r\n,}%]]') then fail('bad number tail') end
    pos = pos + #num
    local v = tonumber(num)
    if not v then fail('bad number ' .. num) end
    return v
  end

  local function parse_array()
    pos = pos + 1 -- [
    local out = {}
    skip_ws()
    if s:sub(pos, pos) == ']' then pos = pos + 1; return out end
    while true do
      out[#out + 1] = parse_value()
      skip_ws()
      local ch = s:sub(pos, pos)
      if ch == ',' then pos = pos + 1
      elseif ch == ']' then pos = pos + 1; return out
      else fail("expected ',' or ']'") end
    end
  end

  local function parse_object()
    pos = pos + 1 -- {
    local out = {}
    skip_ws()
    if s:sub(pos, pos) == '}' then pos = pos + 1; return out end
    while true do
      skip_ws()
      if s:sub(pos, pos) ~= '"' then fail('expected object key') end
      local key = parse_string()
      skip_ws()
      if s:sub(pos, pos) ~= ':' then fail("expected ':'") end
      pos = pos + 1
      out[key] = parse_value()
      skip_ws()
      local ch = s:sub(pos, pos)
      if ch == ',' then pos = pos + 1
      elseif ch == '}' then pos = pos + 1; return out
      else fail("expected ',' or '}'") end
    end
  end

  parse_value = function()
    skip_ws()
    local ch = s:sub(pos, pos)
    if ch == '{' then return parse_object() end
    if ch == '[' then return parse_array() end
    if ch == '"' then return parse_string() end
    if ch == 't' then
      if s:sub(pos, pos + 3) ~= 'true' then fail('bad literal') end
      pos = pos + 4
      return true
    end
    if ch == 'f' then
      if s:sub(pos, pos + 4) ~= 'false' then fail('bad literal') end
      pos = pos + 5
      return false
    end
    if ch == 'n' then
      if s:sub(pos, pos + 3) ~= 'null' then fail('bad literal') end
      pos = pos + 4
      return NULL
    end
    if ch:match('[-%d]') then return parse_number() end
    fail('unexpected character ' .. (ch == '' and '<eof>' or ('%q'):format(ch)))
  end

  local value = parse_value()
  skip_ws()
  if pos <= len then fail('trailing garbage') end
  return value
end

--[[ ===== 5 条自测（`lua5.3 tests-lua/json.lua`） ===== ]]
local function selftest()
  local checks = {
    {
      name = 'object/array/bool/null',
      run = function()
        local v = M.decode('{"a":1,"b":[true,false,null],"c":{"d":"x"}}')
        assert(v.a == 1, 'a')
        assert(#v.b == 3 and v.b[1] == true and v.b[2] == false, 'b bools')
        assert(v.b[3] == M.null, 'b null')
        assert(v.c.d == 'x', 'nested')
      end,
    },
    {
      name = 'string escapes + utf8 passthrough',
      run = function()
        local v = M.decode('"a\\u4e2d\\u6587\\n\\t\\"\\\\b\\u00e9"')
        assert(v == 'a中文\n\t"\\bé', 'got ' .. tostring(v))
        local raw = M.decode('"得分 0　消行 0"')
        assert(raw == '得分 0　消行 0', 'utf8 raw')
      end,
    },
    {
      name = 'numbers (int/neg/float/exponent)',
      run = function()
        local v = M.decode('[28,-197121,0.5,1.5e-3,-2E2]')
        assert(v[1] == 28 and v[2] == -197121, 'ints')
        assert(v[3] == 0.5 and v[5] == -200, 'floats/exp')
        assert(math.abs(v[4] - 0.0015) < 1e-12, 'exp small')
      end,
    },
    {
      name = 'nested arrays of objects + empty containers',
      run = function()
        local v = M.decode('[[{"at":0.2,"kind":"log"}],[],{}]')
        assert(v[1][1].at == 0.2 and v[1][1].kind == 'log', 'nested')
        assert(#v[2] == 0 and next(v[3]) == nil, 'empties')
      end,
    },
    {
      name = 'rejects malformed input (loud, not silent)',
      run = function()
        local bad = { '', '{', '{"a":1,}', '[1 2]', 'tru', '"\\u12"', '1x', '{"a" 1}' }
        for i = 1, #bad do
          local ok, err = pcall(M.decode, bad[i])
          assert(not ok, 'should reject #' .. i .. ': ' .. bad[i])
          assert(tostring(err):find('json:', 1, true), 'error should name json: ' .. tostring(err))
        end
      end,
    },
  }
  local pass = 0
  for _, check in ipairs(checks) do
    local ok, err = pcall(check.run)
    if ok then
      pass = pass + 1
      print(string.format('  ok  %s', check.name))
    else
      print(string.format('  FAIL %s :: %s', check.name, tostring(err)))
    end
  end
  print(string.format('json selftest %d/%d', pass, #checks))
  return pass == #checks
end

M.selftest = selftest

if (not arg or not arg[0] or arg[0]:match('json%.lua$')) and ... == nil then
  local ok = selftest()
  os.exit(ok and 0 or 1)
end

return M
