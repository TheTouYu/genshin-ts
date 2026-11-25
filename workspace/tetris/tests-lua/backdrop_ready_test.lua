-- 真实 main 闭包的开始键回归；独立窗口尺寸验证底色（不拿父画布冒充 viewport）。
local P = dofile('lua/tetris/platform.lua').new{mock=true,
  templates={cell={kind='image'}}}
local c = P.inst('cell', P.root)
for _, dims in ipairs{{3080,900,3200,900},{2030,900,2150,900},
  {1600,900,1600,900},{1280,960,1280,960}} do
  local w,h,vw,vh = table.unpack(dims)
  assert(w*1.02 < vw or w == vw, '旧 1% 出血必须重现超宽屏缺口')
  assert(P.fillBackdrop(c,w,h))
  assert(c.sizeDeltaX >= vw and c.sizeDeltaY >= vh, '底色四边覆盖独立窗口')
end
local bad = setmetatable({}, {__index=c})
bad.SetPivot=function() end
bad.pivotX=0
assert(not P.fillBackdrop(bad,3080,900), 'pivot 写入失败不得假绿')
local json=assert(loadfile('tests-lua/json.lua'))('module')
local f=assert(io.open('tetris.save.json','r')); local save=json.decode(f:read('*a')); f:close()
local shim=dofile('tests-lua/engine_shim.lua')
local function ready(mode, key, dual)
  local e=shim.new{save=save,project_root='.',source_mode=os.getenv('TETRIS_TEST_SOURCE') or 'repo'}
  e.canvas.w,e.canvas.h=3080,900
  assert(not e:load_main())
  for i=1,18 do e:step(1/60) end
  e:key('KeyboardCraftspersonKey'..mode..'Down')
  for i=1,80 do e:step(1/60) end
  e:key(key)
  local function seen(s) return table.concat(e.log_texts,'\n'):find(s,1,true) end
  assert(seen('wash=bleed:112.50'), '生产接线必须保留出血量返回值')
  if dual then
    assert(not seen('guide count 3'), '双人不能只一方准备就开始')
    e:step(1/60); e:key('KeyboardMoveForwardKeyDown')
  end
  assert(seen('guide ready p1'), key..' 必须准备真人')
  assert(seen('guide count 3'), key..' 必须进入倒计时')
  for i=1,220 do e:step(1/60) end
  assert(seen('guide start'), '倒计时后开始')
  assert(#e.errors==0, '主脚本无错误')
end
for _,key in ipairs{'KeyboardCraftspersonKey38Down','KeyboardMoveForwardKeyDown','KeyboardJumpKeyDown'} do
  ready(2,key,false)
end
ready(3,'KeyboardCraftspersonKey38Down',true)
ready(4,'KeyboardCraftspersonKey38Down',true)
print('PASS backdrop geometry + AI three key groups + PVP/coop readiness')
