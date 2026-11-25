-- TDD：截图中有小字号按钮副标，却没有等字号正文。正文不得绕过框架的留白合同。
local layers=dofile('lua/tetris/view_layers.lua')
local kit=dofile('lua/tetris/view_kit.lua').new{layers=layers}
local cfg=dofile('lua/tetris/config.lua')
local copy=dofile('lua/tetris/copy.lua')
local M=dofile('lua/tetris/view_roster.lua')
local S=M.new{config=cfg,layers=layers,kit=kit,copy=copy}
local P=dofile('lua/tetris/platform.lua').new{mock=true,
  templates={cell={kind='image'},stext={kind='text'},hit={kind='cursor'}}}
local R=dofile('lua/tetris/render.lua').new{platform=P,layers=layers,maxInstances=1000}
local tested=0
for _,cv in ipairs{{1280,720},{1560,720},{2400,1080},{3080,900}} do
 for _,role in ipairs{'nahida','keqing','ganyu','columbina'} do
  for tab=1,5 do
   local nodes=S.roster{canvas=cv,device='mobile',role=role,
     roles={'nahida','keqing','ganyu','columbina'},tab=tab}
   R.clear();R.apply(nodes)
   for _,n in ipairs(nodes) do
    if n.tpl=='stext' and n.visible~=false and n.text~='' then
     local lines=select(2,n.text:gsub('\n',''))+1
     assert(n.size[2]>=kit.textMinH(n.font,lines),
       n.key..' 高度 '..n.size[2]..' 小于框架文字合同 '..kit.textMinH(n.font,lines))
     assert(n.valign=='Middle',n.key..' 不得继承模板的垂直对齐')
     local c=assert(R.get(n.key))
     assert(c.verticalAlignment=='Middle',n.key..' 对齐必须实际写入控件')
     assert(c.text==n.text and c.textLayout.fits,n.key..' 控件文字放不下')
     tested=tested+1
    end
   end
  end
 end
end
R.clear()
print('PASS roster text contract '..tested..' rendered text nodes')
