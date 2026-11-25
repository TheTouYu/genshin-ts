-- lua5.3 tests/backdrop_test.lua（从框架目录运行）
local P=dofile('lua/qxqy_ui/platform.lua').new{mock=true,templates={cell={kind='image'}}}
local c=P.inst('cell',P.root)
assert(P.fillBackdrop(c,3080,900))
assert(c.sizeDeltaX>=3200 and c.sizeDeltaY>=900)
assert(c.anchorMinX==.5 and c.anchorMaxY==.5 and c.pivotX==.5)
assert(not P.fillBackdrop(c,0,900))
assert(not P.fillBackdrop(c,3080,900,-1))
for _,method in ipairs{'SetAnchorMin','SetAnchorMax','SetPivot','SetSizeDelta','SetAnchoredPosition'} do
  local bad=P.inst('cell',P.root)
  bad.anchoredPositionX=9
  bad[method]=function() end
  assert(not P.fillBackdrop(bad,3080,900), method..' 静默失败必须报错')
end
print('PASS backdrop independent viewport + five silent write failures')
