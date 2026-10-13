-- ============================================================
-- hmlt-qixia 千星版 main.lua  v2（100% 全功能对齐 HTML demo v34b）
-- 挂载：服务端控件模板 n1「游戏层」（stretch 全屏容器）
-- 对齐规格：prototype/index.html（六关/七特性/十悟/暴击/燃烧/银针匣/
--   贯日/冰魄/火凤/冰封/中boss车轮战/逃脱演出/分相boss/环境刷怪/
--   领悟图鉴/结算/触屏拖动）
-- 视觉：基础图元占位（美术轮换 ART 表 imageId 即升级，键名已按 demo）
-- ============================================================
local T_IMG, T_TXT, T_BTN, T_PANEL, T_CURSOR = 1073742300, 1073742301, 1073742302, 1073742303, 1073742304
local FW, FH = 444, 250
local STEP = 1/60

-- ===== 数值总表（demo N 逐行对齐）=====
local N = {
  player = {vx=175, vy=100, xMin=25, xMax=415, yMin=34, yMax=220},
  zdlv = {12,16,11,8.5,4.4},
  ps = {hongmao=70, lantu=65},
  chargeRate = 35,
  ships = {
    hongmao = {bullet='changhong', bspeed=420, fireCd=0.7, dmgMul=4.3, ps=70,
      wing='wingH', wingBullet='fdzd', wingSpeed=700, bombDj=50, bombBoss=50, chargeType='guanri'},
    lantu   = {bullet='jezd', bspeed=620, fireCd=0.4, dmgMul=1.8, ps=65, range=178,
      wing='wingL', wingBullet='jezd', wingSpeed=700, bombDj=30, bombBoss=30, chargeType='sword'},
  },
  enemy = {
    dj1={hp=1,spd=250,score=10}, dj2={hp=220,zdsd=150,score=300},
    dj3={hp=420,zdsd=150,score=300}, dj4={hp=100,zdsd=137,score=300},
    nq={hp=140,zdsd=125,score=300,w=24,h=24}, lsfj={hp=160,zdsd=150,score=200,w=26,h=36},
    jbdj={hp=320,zdsd=125,score=500,w=52,h=36}, lfj={hp=1,score=15,w=30,h=12},
    jbfjg={hp=1700,zdsd=175,score=2000,w=104,h=64},
    boss1={hp=3000,zdsd=150,score=1000},
    boss2={hp=3600,zdsd=150,score=1500,phases={1800,1800}},
    nq2={hp=160,zdsd=150,score=350,w=30,h=30}, jxr1={hp=340,zdsd=160,score=250,w=50,h=40},
    dgp={hp=380,zdsd=170,score=300,w=60,h=26,roller=true},
    dxdd={hp=99999,score=0,w=43,h=16,hazard=true},
    jdlj={hp=3000,zdsd=170,score=1000,w=46,h=88}, hzz={hp=2500,zdsd=180,score=1000,w=40,h=54},
    cw={hp=2500,zdsd=170,score=1000,w=70,h=60},
    boss3={hp=4200,zdsd=180,score=1500,phases={1800,2400}},
    jxjq={hp=4800,zdsd=170,score=1500,phases={2800,2000}},
    black={hp=5400,zdsd=180,score=5000,phases={2100,1600,1700}},
    cw1={hp=6000,zdsd=170,score=1500},
  },
  bombDmg=50, phoenixDps=50, scroll=100, scrollBoss=175, bsHpMax=8,
}
-- ===== 关卡波次（demo wavesDef1-6 逐行对齐；y=千星系）=====
local WAVES1 = {
  {spawns={{'dj3',130}}}, {spawns={{'dj4',95},{'dj4',60}}}, {spawns={{'dj3',130},{'dj3',45}}},
  {spawns={{'dj2',90}}}, {spawns={{'dj2',140}}}, {spawns={{'dj2',50}}}, {spawns={{'dj2',80}}},
  {spawns={{'dj4',70}}}, {boss='boss1'},
}
local WAVES2 = {
  {t=0.8,spawns={{'nq',170},{'nq',130}}}, {t=2.3,spawns={{'dj3',60}}},
  {t=4.1,spawns={{'dj4',190},{'dj4',130},{'dj4',60}}}, {t=5.3,spawns={{'nq',150},{'nq',60}}},
  {t=7.5,spawns={{'nq',200},{'nq',130}}}, {t=9.0,spawns={{'nq',140},{'nq',80}}},
  {t=9.8,spawns={{'dj3',140}}},
  {t=11.2,spawns={{'jbdj',180}}}, {t=11.6,spawns={{'jbdj',140}}}, {t=12.0,spawns={{'jbdj',80}}},
  {t=12.4,spawns={{'nq',200},{'nq',50}}}, {t=12.7,spawns={{'nq',150},{'nq',100}}},
  {t=13.6,midBoss='jbfjg'},
  {t=14.4,spawns={{'lsfj',200},{'lsfj',150}}}, {t=15.6,spawns={{'lsfj',100}}},
  {t=16.8,spawns={{'lsfj',200},{'lsfj',70}}}, {t=18.0,spawns={{'dj3',120}}},
  {t=19.4,boss='boss2'},
}
local WAVES3 = {
  {t=0.3,spawns={{'jxr1',60},{'lsfj',80},{'lsfj',180}}},
  {t=1.8,spawns={{'lsfj',200},{'lsfj',130},{'dj4',70}}},
  {t=3.6,spawns={{'dj4',130},{'dj4',60},{'nq2',100}}},
  {t=5.4,spawns={{'jxr1',60},{'nq2',170}}},
  {t=7.0,spawns={{'jxr1',140},{'jxr1',70},{'lsfj',120}}},
  {t=8.8,spawns={{'nq2',50},{'nq2',110}}},
  {t=10.2,spawns={{'dj3',50},{'nq2',100},{'nq2',160},{'dgp',45}}},
  {t=12.4,midBoss='jdlj'},
  {t=14.5,spawns={{'dgp',45},{'nq2',80}}},
  {t=16.2,spawns={{'dgp',45},{'dgp',45},{'nq2',190}}},
  {t=18.2,spawns={{'nq2',190},{'nq2',150},{'nq2',100},{'nq2',50}}},
  {t=21.0,spawns={{'nq2',130},{'nq2',60},{'nq',100},{'dgp',45}}},
  {t=23.5,spawns={{'dj3',100},{'dj4',50},{'dj4',150},{'nq2',80}}},
  {t=26.0,spawns={{'dgp',45},{'jxr1',180}}},
  {t=28.0,spawns={{'jxr1',70},{'jxr1',150},{'lsfj',100}}},
  {t=30.5,spawns={{'dj4',190},{'dj4',50},{'nq2',120}}},
  {t=33.0,spawns={{'nq2',60},{'dj3',140},{'dgp',45}}},
  {t=35.5,boss='boss3'},
}
local WAVES4 = {
  {t=0.3,spawns={{'nq2',80},{'nq2',150},{'nq',50}}},
  {t=2.0,spawns={{'nq',190},{'nq',50},{'lsfj',120}}},
  {t=3.8,spawns={{'dgp',45},{'nq2',100}}},
  {t=5.6,spawns={{'dgp',45},{'dgp',45}}},
  {t=7.6,spawns={{'dj3',110},{'nq2',60}}},
  {t=9.4,spawns={{'nq2',50},{'nq2',200},{'nq2',100}}},
  {t=11.2,spawns={{'lsfj',120},{'lsfj',50},{'lsfj',150}}},
  {t=13.0,spawns={{'lsfj',190},{'lsfj',80},{'dgp',45}}},
  {t=14.8,spawns={{'dj3',120},{'nq2',170}}},
  {t=16.6,spawns={{'nq2',50},{'nq2',200},{'nq2',120}}},
  {t=18.4,spawns={{'nq',80},{'nq',170},{'lsfj',110}}},
  {t=20.2,midBoss='jbfjg'},
  {t=22.6,spawns={{'dgp',45},{'dgp',45}}},
  {t=24.4,spawns={{'dgp',45},{'dgp',45}}},
  {t=26.2,spawns={{'dgp',45},{'dgp',45},{'dj3',60}}},
  {t=28.2,spawns={{'dj3',50},{'nq2',140}}},
  {t=30.2,boss='jxjq'},
}
local WAVES5 = {
  {t=0.4,spawns={{'nq2',100},{'nq2',150}}},
  {t=2.2,midBoss='jbfjg'},
  {t=4.1,midBoss='cw'},
  {t=20.5,midBoss='jdlj'},
  {t=23.5,midBoss='hzz'},
  {t=27.0,spawns={{'nq2',110},{'nq2',170},{'lsfj',60}}},
  {t=28.8,spawns={{'dj3',110},{'nq2',80}}},
  {t=30.6,spawns={{'dj4',50},{'dj4',200},{'dgp',45}}},
  {t=32.4,spawns={{'dgp',45},{'lsfj',50},{'nq2',140}}},
  {t=34.2,spawns={{'lsfj',120},{'dgp',45}}},
  {t=36.0,spawns={{'nq2',50},{'nq2',200},{'dj3',120}}},
  {t=37.8,spawns={{'nq',100},{'nq',150},{'lsfj',70}}},
  {t=39.6,spawns={{'nq2',90},{'dgp',45}}},
  {t=42.5,boss='black'},
}
local WAVES6 = {}
do
  for i = 0, 29 do
    local sp = {{'xkl', 40 + math.random(160)}, {'xkl', 40 + math.random(160)}}
    if i % 2 == 1 then sp[3] = {'xkl', 40 + math.random(160)} end
    sp[#sp+1] = {'bsrain', 40 + math.random(160)}
    WAVES6[#WAVES6+1] = {t = 0.3 + i*0.33, spawns = sp}
  end
  WAVES6[#WAVES6+1] = {t=12.5, boss='cw1'}
end
local LEVELS = {
  {name='第一关 · 长虹出鞘', bg='bg',  waves=WAVES1, mode='gate'},
  {name='第二关 · 冰魄试炼', bg='bg2', waves=WAVES2, mode='time', env='lfj'},
  {name='第三关 · 蛟龙怒涛', bg='bg3', waves=WAVES3, mode='time', mul=1.25},
  {name='第四关 · 机械咆哮', bg='bg4', waves=WAVES4, mode='time', mul=1.4},
  {name='第五关 · 魔神降临', bg='bg5', waves=WAVES5, mode='time', env='dxdd', mul=1.6},
  {name='终关 · 弹雨终局',   bg='bg6', waves=WAVES6, mode='time', mul=1.8},
}
-- ===== 领悟图鉴（demo CODEX 逐条）=====
local CODEX = {
  {'guanri_full','满编贯日','僚机≥3 时蓄力释放长虹贯日','剑宽=12+7×(等级-2)：手臂粗→虹猫本体大'},
  {'jiejian','贯日接剑','贯日释放后 0.5 秒内接射','释放后普攻冷却清零，立即再射'},
  {'rifeng','日凤连环','火凤命中已点燃的目标','对点燃目标伤害 ×1.5'},
  {'xuli_zouwei','蓄力走位','一次蓄力期间贴身躲过 3 发敌弹','无伤蓄满=全额回报'},
  {'jian_bu_zhen','剑哺针','冰魄剑一次命中 2 个以上敌人','每命中 1 敌回收 1 根银针'},
  {'dong_sui','冻→碎','冰魄剑命中被冰封千里冻结的目标','伤害 ×2 并碎冰'},
  {'bing_lun','冰轮舞','10 秒内完成 射→蓄→剑→针墙 全环','蓝兔循环引擎，输出上限的来源'},
  {'yi_xian_chuan','一线穿','一根银针穿透 3 个以上敌人','银针穿透特性'},
  {'tie_lian','贴脸斩','在极近距离（≤40px）击杀敌人','近距命中密度最高'},
  {'man_zhen','满针预瞄','一轮针墙命中 5 个以上敌人','满针时机=敌群密度峰值'},
}
-- ===== 隐藏特性（demo TRAITS 逐条）=====
local TRAITS = {
  yizhen={'一针见血','蓝兔','敌人被冰封千里冻住时，银针暴击率 +50%——满蓄释放要压在大招之后'},
  zhenman={'针满则锐','蓝兔','银针攒满一匣时，蓄力速度 +30%，针匣泛起寒光——攒满再蓄，快人一步'},
  guiqia={'飞针归匣','蓝兔','贴身命中的银针会被蓝兔收回针匣——近身作战，银针取之不竭'},
  xinhuo={'薪火相传','虹猫','燃烧中的敌人被击杀时，火种飞溅点燃附近的敌人——一火燎原，越杀越烧'},
  renjian={'人剑合一','虹猫','蓄力或大招的长虹剑命中后 0.3 秒内按下普攻：追发两柄小长虹剑（一次释放最多两次）'},
  qiudao={'险中求道','虹猫','蓄力时贴着敌弹走：自动挥出一剑，并额外凝聚剑气'},
  beishui={'背水一战','通用','只剩最后一条命时：暴击率 +20%，射速与移速 +20%——七侠不惧生死'},
}
local TRAITS_KEYS = {'yizhen','zhenman','guiqia','xinhuo','renjian','qiudao','beishui'}
-- ===== 视觉表（图元占位；美术轮换 imageId 即升级）=====
local ART = {
  hongmao={100003,34,36,255,140,40}, lantu={100002,36,29,110,200,255}, flame={100005,12,13,255,170,60},
  wingH={100003,20,15,255,200,90}, wingL={100002,22,25,150,230,255},
  changhong={100001,36,11,255,190,70}, jez={100001,26,6,120,220,255}, fdzd={100001,12,5,255,220,120},
  szd={100002,10,7,255,90,90}, szd2={100002,8,8,190,90,255},
  dj1={100003,42,18,150,150,160}, dj2={100004,38,39,80,200,180}, dj3={100001,46,20,170,110,220},
  dj4={100002,34,33,230,200,90}, boss1={100001,80,100,220,60,60},
  phoenix={100005,46,52,190,120,255},
  bingpoj={100001,46,16,160,230,255},
  die={100004,64,64,255,120,50}, boom={100004,56,40,255,160,60},
  pow={100003,18,7,120,255,120}, bom1={100004,18,7,255,170,60}, bs={100002,16,16,255,215,60},
  bar={100001,10,4,255,255,255},
  shield={100006,45,45,120,200,255},
  bg={100001,1333,250,26,32,60}, bg2={100001,1333,250,34,42,76},
  nq={100004,28,29,200,120,140}, lsfj={100003,30,42,120,190,140}, jbdj={100002,66,47,220,150,90},
  lfj={100003,35,15,150,220,170},
  jbfjg={100001,132,91,240,170,70}, boss2={100002,80,86,180,90,220}, boss2b={100005,60,140,230,70,160},
  nq2={100004,30,30,210,110,170}, jxr1={100003,68,58,190,160,90}, dgp={100001,82,34,160,160,180},
  dxdd={100003,43,16,90,180,220},
  jdlj={100005,46,90,230,190,80}, hzz={100003,40,56,90,90,110}, cw={100002,90,86,110,110,140},
  boss3={100001,146,82,120,190,200}, jxjq={100004,180,122,170,170,190}, black={100002,77,121,130,160,220},
  bg3={100001,1333,250,30,44,66}, bg4={100001,1333,250,44,44,54}, bg5={100001,1333,250,52,36,60}, bg6={100001,1333,250,24,28,52},
  guanri={100001,164,48,255,200,80}, huofeng={100005,120,94,255,140,40},
  dianran={100005,14,18,255,150,50}, yinzhen={100001,28,8,225,240,255},
  bingfeng={100006,200,200,150,220,255}, bingjing={100006,12,12,170,230,255},
  suibing={100006,16,16,200,240,255},
  ring={100006,48,48,255,255,255},
}
-- ===== SFX 事件表（音频 id 占位：音频轮统一校准；事件面 100% 对齐 demo）=====
local SFX_EV = {
  fire=50888, fireL=50888, boomE=50888, boomP=50888, pow=50888,
  bomb=50888, phoenix=50888, bs=50888, sel=50888, boss=50888, wudao=50888, full=50888, hit=50888,
}

-- ===== 运行时状态 =====
local G, K, CW, CH, HX, HY
local pools = {}
local wingPool, hud = {}, {}
local resultPanel, resultRefs, selPanel, selRefs, codexPanel, codexRefs = nil, {}, nil, {}, nil, {}
local codexOpen = false
local keys = {}
local codexUnlocked, traitsSeen = {}, {}   -- 会话内持久（平台无 localStorage；差异已记录）
local jEdge, kEdge, jUp = false, false, false
local touch = {on=false, x=0, y=0}

-- ===== 工具 =====
local function clamp(v,a,b) if v<a then return a elseif v>b then return b end return v end
local function sfx(ev) local id = SFX_EV[ev] if id then pcall(game.PlayAudio2D, id) end end
local function log(s) print(s) end
local function aimvx(x0,y0,x1,y1,sp)
  local dx,dy=x1-x0,y1-y0; local d=math.sqrt(dx*dx+dy*dy)
  if d<1 then d=1 end
  return dx/d*sp, dy/d*sp
end
local function hit(a,b)
  return math.abs(a.x-b.x)*2 < a.w+b.w and math.abs(a.y-b.y)*2 < a.h+b.h
end
local function dist2(x0,y0,x1,y1) local dx,dy=x1-x0,y1-y0 return math.sqrt(dx*dx+dy*dy) end

-- ===== 控件工厂 =====
local function mkc(prefab, name, parent)
  local c = game.InstantiateClientUIControl(prefab, parent or script.object)
  if c then c.name = name end
  return c
end
local function imgc(artKey, name)
  local a = ART[artKey]
  local c = mkc(T_IMG, name or 'img')
  c:SetImage(Enum.ImageSource.StaticReference, a[1])
  c.imageColor = Color(a[4],a[5],a[6],255)
  c:SetSizeDelta(a[2]*K, a[3]*K)
  return c
end
-- 宿主渲染器按控件宽高 clip 文本（host-png drawTextItem），Lua 侧必须给足宽度；
-- CJK 全角 1em、半角 0.62em 估算，下限 6em 兜住 HUD 每帧更新的长数字。
local function textW(str, size)
  local u = 0
  if utf8 then
    for _, code in utf8.codes(str or '') do
      local full = (code >= 0x2E80 and code <= 0x9FFF) or (code >= 0xF900 and code <= 0xFAFF)
        or (code >= 0x3000 and code <= 0x303F) or (code >= 0xFF00 and code <= 0xFFEF)
      u = u + (full and 1.0 or 0.62)
    end
  else
    u = #(str or '') / 3 * 0.9
  end
  return u * size
end
local function fitText(c, str)
  c:SetSizeDelta(math.max(textW(str, c.fontSize) + 12*K, c.fontSize*6), c.fontSize*1.7)
end
local function txtc(str, size, r,g,b, name)
  local c = mkc(T_TXT, name or 'tx')
  c.text = str or ''
  c.fontSize = math.max(10, math.floor(size*K+0.5))
  c.fontColor = Color(r,g,b,255)
  c.bgColor = Color(0,0,0,0)
  c.enableOutline = true
  c.horizontalAlignment = 'Middle'
  c.verticalAlignment = 'Middle'
  fitText(c, str)
  return c
end
-- 运行时改文本必须重估宽：空串创建的 msgs/特性卡/飘字只有 6em 下限，长文案会被控件裁剪
local function settxt(c, str)
  if c.text == str then return end
  c.text = str
  fitText(c, str)
  return c
end
local function place(c, gx, gy) c:SetAnchoredPosition(gx*K-HX, gy*K-HY) end
local function placeSize(c, gx, gy, w, h) place(c, gx, gy) c:SetSizeDelta(w*K, h*K) end
local function setVis(c, artKey, w, h)
  local a = ART[artKey]
  c:SetImage(Enum.ImageSource.StaticReference, a[1])
  c.imageColor = Color(a[4],a[5],a[6],255)
  c:SetSizeDelta((w or a[2])*K, (h or a[3])*K)
end

-- ===== 池 =====
local function mkpool(n, maker)
  local p = {}
  for i=1,n do
    local slot = {on=false, c=maker(i)}
    if slot.c then slot.c:SetActive(false) end
    table.insert(p, slot)
  end
  return p
end
local function alloc(pool)
  for i=1,#pool do
    if not pool[i].on then pool[i].on=true return pool[i] end
  end
  return nil
end
local function poolCount(pool)
  local n=0 for _,s in ipairs(pool) do if s.on then n=n+1 end end return n
end
local function freePools()
  for _,pool in ipairs({pools.bullets,pools.ebullets,pools.enemies,pools.items,pools.booms,pools.floaters,pools.orbit}) do
    for _,s in ipairs(pool) do if s.on then s.on=false s.c:SetActive(false) end end
  end
  for _,m in ipairs(pools.msgs) do m.on=false m.c:SetActive(false) end
  for _,ws in ipairs(wingPool) do ws.on=false ws.c:SetActive(false) end
  if G and G.auraC then
    for _,c in pairs(G.auraC) do c:SetActive(false) end
  end
end

-- ===== 消息队列（demo v23：≤4 堆叠）=====
local function say(txt)
  local m = alloc(pools.msgs) or pools.msgs[1]
  m.on, m.t, m.life = true, 0, 1.8
  settxt(m.c, txt)
  m.c:SetActive(true)
end
-- ===== 伤害数字（demo v22：暴击红/伤害越高字越大/分色）=====
local function dmgFloat(x, y, d, kind, crit)
  if not d or d <= 0 then return end
  local s = alloc(pools.floaters) if not s then return end
  local col = {normal={230,240,255}, crit={255,90,90}, frost={127,216,255}, burn={255,154,61}, skill={255,209,102}}
  local cc = crit and col.crit or (col[kind] or col.normal)
  s.on=true s.t=0.7 s.x=x+(math.random()*18-9) s.y=y-12+(math.random()*12-6) s.vy=26
  local sz = math.min(11+d*0.1, 40)*(crit and 1.15 or 1)
  s.size = math.max(10, math.floor(sz+0.5))
  settxt(s.c, string.format('%d', math.floor(d+0.5)))
  s.c.fontSize = math.max(10, math.floor(s.size*K+0.5))
  s.c.fontColor = Color(cc[1],cc[2],cc[3],255)
  s.c:SetActive(true)
end

-- ===== 领悟/特性 =====
local function unlock(id)
  if codexUnlocked[id] then return end
  codexUnlocked[id] = 1
  for _,c in ipairs(CODEX) do if c[1]==id then G.unlockFx={t=2.5,n=c[2]} end end
  G.slowT, G.slowK = 0.5, 0.35
  sfx('full')
  log('insight '..id)
end
local function traitFire(id)
  local t = TRAITS[id] if not t or G.state~='playing' then return end
  if not traitsSeen[id] and G.traitQ[id]==nil then
    G.traitQ[id] = 2.5
    log('trait_arm '..id)
  elseif traitsSeen[id] and (G.traitT[id] or 0) < G.t then
    G.traitT[id] = G.t+4
    say(t[1]..'!')
    log('trait '..id)
  end
end
local function traitFx(id) if id then G.fxAura[id] = 0.6 end end
local function critRate(kind, e)
  local r = 0.05
  if G.life == 1 then r = r + 0.2 end
  if kind=='needle' and G.shipKey=='lantu' and G.freezeT>0 then r = r + 0.5 end
  return math.min(r, 0.95)
end
local function fireSmallSwords(n, fxId)
  local cfg = N.ships[G.shipKey]
  local dmg = math.floor((95+28*G.lv)*0.35+0.5)
  for i=1,n do
    local oy = (i-1-(n-1)/2)*12
    local s = alloc(pools.bullets)
    if s then
      s.on=true s.x=G.shipX+16 s.y=G.shipY+oy s.vx=cfg.bspeed*1.2 s.vy=0
      s.w=16 s.h=6 s.aw=22 s.ah=7 s.dmg=dmg s.art='changhong' s.maxD=0 s.dist=0
      s.pierce=nil s.wallId=nil s.zm=nil s.hitSet=nil s.sine=nil
      setVis(s.c,'changhong',22,7) s.c:SetActive(true)
    end
  end
  local b = alloc(pools.booms)
  if b then b.on,b.t,b.spark,b.x,b.y=true,0.2,true,G.shipX+20,G.shipY b.c:SetActive(true) end
  traitFx(fxId); sfx('fire'); log('small_sword '..n)
end
local function traitBulletDmg(b, e)
  local d = b.dmg
  local kind = b.wallId and 'needle' or (b.art=='changhong' and 'sword' or (b.art=='bingpoj' and 'blade' or 'wing'))
  if kind=='needle' and G.shipKey=='lantu' and G.freezeT>0 then traitFire('yizhen') end
  if kind=='needle' and b.zm then traitFire('zhenman') traitFx('zhenman') end
  local crit = math.random() < critRate(kind, e)
  if crit then
    d = d*2
    local s = alloc(pools.booms)
    if s then s.on,s.t,s.crit,s.x,s.y=true,0.25,true,e.x,e.y s.c:SetActive(true) end
  end
  dmgFloat(e.x, e.y, d, kind=='blade' and 'frost' or 'normal', crit)
  return math.floor(d+0.5)
end

-- ===== 敌弹 =====
local function eshoot(e, vx, vy, art)
  if poolCount(pools.ebullets) >= 140 then return end
  local s = alloc(pools.ebullets) if not s then return end
  s.on=true s.x=e.x s.y=e.y s.vx=vx s.vy=vy s.w=7 s.h=7 s.art=art or 'szd' s.frozen=false
  setVis(s.c, art or 'szd')
  s.c:SetActive(true)
end

-- ===== 道具 =====
local function mkItem(kind, x, y)
  local it = alloc(pools.items) if not it then return nil end
  it.on=true it.kind=kind it.x=x it.y=y
  it.w = kind=='bs' and 16 or 20
  it.h = kind=='bs' and 16 or 12
  it.vx=(math.random()-.5)*50 it.vy=(math.random()-.5)*50
  it.life = kind=='bs' and 10 or 4
  it.tx=20+math.random()*350 it.ty=20+math.random()*200
  it.free=false
  setVis(it.c, kind)
  it.c:SetActive(true)
  return it
end

-- ===== 波次 =====
local function spawnEnemyAt(kind, x, y)
  local def = N.enemy[kind]
  local s = alloc(pools.enemies) if not s then return nil end
  s.on=true s.kind=kind s.def=def s.hp=math.floor(def.hp*(G.levelMul or 1)+0.5)
  s.x=x s.y=y
  s.w = def.w or 30 s.h = def.h or 22
  s.t=0 s.bob=math.random()*6.28 s.fireT=1+math.random()
  s.hoverX=320+math.random()*60 s.dead=false s.gone=false s.flash=0 s.burn=0 s.burnTick=nil s.burnSrc=nil
  s.spd=def.spd or 0 s.fired=false s.escT=nil s.charging=false s.isMid=nil s.yy=nil s.spp=nil
  setVis(s.c, kind)
  s.c:SetActive(true)
  return s
end
local function spawnEnemy(kind, y) return spawnEnemyAt(kind, FW+30, y) end
local function spawnMidBoss(mk)
  local def = N.enemy[mk]
  local s = alloc(pools.enemies) if not s then return end
  s.on=true s.kind=mk s.def=def s.hp=math.floor(def.hp*(G.levelMul or 1)+0.5)
  s.x=FW+40 s.y=(mk=='cw' and 100 or 190)
  s.w=def.w s.h=def.h s.t=0 s.bob=0 s.fireT=1.2 s.dead=false s.gone=false s.flash=0
  s.burn=0 s.burnTick=nil s.burnSrc=nil
  s.isMid=true s.hoverX=(mk=='cw' and 260 or 345)
  s.escT = mk=='cw' and 15.6 or nil
  s.spd=0 s.fired=true s.charging=false
  setVis(s.c, mk)
  s.c:SetActive(true)
  log('midboss') sfx('boss')
end
local function spawnBoss(kind)
  local def = N.enemy[kind]
  local sz = {boss3={80,60}, jxjq={150,100}, black={70,105}, cw1={60,55}}
  local w = sz[kind] and sz[kind][1] or 80
  local h = sz[kind] and sz[kind][2] or 100
  G.boss = {kind=kind, def=def, hp=(def.phases and def.phases[1] or def.hp),
    phases=def.phases, phaseIdx=0,
    x=(kind=='jxjq' and 330 or FW+70), y=(kind=='jxjq' and -70 or (kind=='cw1' and 130 or 150)),
    w=w, h=h, isBoss=true, phase='enter', pt=0, patT=0, pat=0, win18=0, winT=0,
    dead=false, flash=0, burn=0, burnTick=nil, burnSrc=nil, aiT=0, tx=0, ty=0, on=true}
  G.scrollSpd = N.scrollBoss
  G.lock = 1.0
  for _,s in ipairs(pools.ebullets) do if s.on then s.on=false s.c:SetActive(false) end end
  log('boss_spawn') sfx('boss')
end
local function spawnWave()
  local L = LEVELS[G.levelIdx]
  if not L then return end
  local next_ = G.wave + 1
  if next_ > #L.waves then return end
  local w = L.waves[next_]
  if not w then return end
  G.wave = next_
  if w.boss then spawnBoss(w.boss) return end
  if w.midBoss then spawnMidBoss(w.midBoss) return end
  for _,sp in ipairs(w.spawns or {}) do
    local kind, y = sp[1], sp[2]
    if kind=='xkl' then
      eshoot({x=FW+20, y=y}, -(170+math.random()*190), (math.random()-.5)*40, 'szd2')
    elseif kind=='bsrain' then
      local it = mkItem('bs', FW-10, y)
      if it then it.vx=-110 it.free=true end
    else
      spawnEnemy(kind, y)
    end
  end
  log('wave '..G.wave)
end

-- ===== 发射 =====
local function fireVolley()
  local cfg = N.ships[G.shipKey]
  local dmg = math.floor(N.zdlv[G.lv]*(cfg.dmgMul or 1)+0.5)
  local sp = cfg.bspeed
  local isJe = cfg.bullet=='jezd'
  local isCh = cfg.bullet=='changhong'
  local bw = isJe and (24+G.lv*2) or (isCh and 28 or 27)
  local bh = isJe and 8 or (isCh and 9 or ({10,15,12,15,15})[G.lv])
  local offs
  if isCh then
    offs = G.lv<=2 and {{0,0}} or (G.lv==3 and {{0,-50},{0,50}} or
      (G.lv==4 and {{0,-70},{0,0},{0,70}} or {{0,-105},{0,-63},{0,-21},{0,21},{0,63},{0,105}}))
  else
    offs = G.lv<=2 and {{0,0}} or (G.lv==3 and {{-4,0},{4,0}} or
      (G.lv==4 and {{-8,0},{0,0},{8,0}} or {{-15,0},{-9,0},{-3,0},{3,0},{9,0},{15,0}}))
  end
  local aw = isCh and 36 or bw
  local ah = isCh and 11 or bh
  for _,off in ipairs(offs) do
    local oy, vy = off[1], off[2]
    local s = alloc(pools.bullets)
    if s then
      s.on=true s.x=G.shipX+16 s.y=G.shipY+oy s.vx=sp s.vy=vy
      s.w=bw s.h=bh s.aw=aw s.ah=ah s.dmg=dmg s.art=cfg.bullet
      s.maxD=cfg.range or 0 s.dist=0 s.pierce=nil s.wallId=nil s.zm=nil s.hitSet=nil s.sine=nil
      setVis(s.c, cfg.bullet, aw, ah) s.c:SetActive(true)
    end
  end
  sfx('fire') log('fire')
  G.loopMark.shot = G.t
  if G.shipKey=='hongmao' then
    for _,ws in ipairs(wingPool) do
      if ws.on then
        local s = alloc(pools.bullets)
        if s then
          s.on=true s.x=ws.x+10 s.y=ws.y s.vx=(ws.bspd or cfg.wingSpeed) s.vy=0
          s.w=16 s.h=7 s.aw=16 s.ah=7 s.dmg=math.floor(N.zdlv[G.lv]*1.2+0.5) s.art=cfg.wingBullet
          s.maxD=0 s.dist=0 s.pierce=nil s.wallId=nil s.zm=nil s.hitSet=nil s.sine=nil
          setVis(s.c, cfg.wingBullet) s.c:SetActive(true)
        end
        local b = alloc(pools.booms)
        if b then b.on,b.t,b.spark,b.x,b.y=true,0.08,true,ws.x+13,ws.y b.c:SetActive(true) end
      end
    end
  elseif G.needles < G.lv*(2+G.lv) then
    G.needles = G.needles + 1
  end
end
local function needleBarrage(mult, big, keep, zm)
  mult, big, keep, zm = mult or 1, big or false, keep or 1, zm or false
  local n = G.needles
  if n == 0 then return end
  local fireN = math.max(1, math.ceil(n*keep))
  local gone = n - fireN
  G.salvo = {x=G.shipX, y=G.shipY, n=fireN, mult=mult, big=big, int=0.12, rows=G.lv, zm=zm}
  for _=1,gone do
    local b = alloc(pools.booms)
    if b then b.on,b.t,b.spark,b.x,b.y=true,0.3,true,G.shipX+(math.random()-.5)*54,G.shipY+(math.random()-.5)*38 b.c:SetActive(true) end
  end
  G.needles = 0
  if big or gone>0 then say(gone>0 and '银针消散·残阵齐发!' or '冰魄银针·齐发!') end
  log('needle_wall') G.loopMark.wall = G.t
  if G.t - G.loopMark.shot < 12 then unlock('bing_lun') end
end
local function releaseCharge()
  local cfg = N.ships[G.shipKey]
  local tier = G.chargeTier or 1
  G.fashez = 2.0
  log('phoenix '..G.lv) sfx('phoenix')
  if cfg.chargeType=='guanri' then
    if tier < 1 then
      G.wingBurst2 = 2.4*0.3
      say('长虹未满·仅僚机齐射') log('charge_weak') return
    end
    G.guanri = {t=3.2, x=G.shipX+20, w=12+7*(G.lv-2), y=G.shipY, dmg=95+28*G.lv, hit={}}
    local wn = 0 for _,ws in ipairs(wingPool) do if ws.on then wn=wn+1 end end
    if wn >= 3 then unlock('guanri_full') end
    G.wingBurst2 = 2.4
    G.renjianLeft = 2
    say('长虹贯日!')
    return
  end
  local tgt = nil
  for _,e in ipairs(pools.enemies) do
    if e.on and not e.dead and not e.gone and e.x > G.shipX then
      if not tgt or e.x < tgt.x then tgt = e end
    end
  end
  local ang = 0
  if tgt then ang = clamp(math.atan(tgt.y-G.shipY, tgt.x-G.shipX), -0.5, 0.5) end
  local cnt = math.max(1, math.floor(G.lv*tier+0.5))
  for k=1,cnt do
    local a = ang + (k-1-(cnt-1)/2)*0.09
    local s = alloc(pools.bullets)
    if s then
      local awv = math.floor((46+6*G.lv)*(0.6+0.4*tier)+0.5)
      local ahv = math.floor((14+2*G.lv)*(0.6+0.4*tier)+0.5)
      s.on=true s.x=G.shipX+16 s.y=G.shipY s.vx=math.cos(a)*750 s.vy=math.sin(a)*750
      s.w=40 s.h=24 s.aw=awv s.ah=ahv
      s.dmg=math.floor((95+40*G.lv)*tier*(0.4+0.6*G.needles/(G.lv*(2+G.lv)))+0.5)
      s.maxD=200 s.dist=0 s.pierce=true s.wallId=nil s.zm=nil s.hitSet={} s.art='bingpoj' s.sine=nil
      setVis(s.c,'bingpoj',awv,ahv) s.c:SetActive(true)
    end
  end
  say(tier==1 and '冰魄剑!' or '冰魄剑·残形')
  G.loopMark.sword = G.t
  needleBarrage(tier==1 and 2.0 or 0.6, true, tier==1 and 1 or 0.25, G.zmArmed)
  G.zmArmed = false
end
local function tryBomb()
  if G.state~='playing' or G.lock>0 or G.bomm<=0 then return end
  G.bomm = G.bomm - 1
  G.shield = 2.0 log('bomb '..G.bomm) G.flashT = 0.4
  G.slowT, G.slowK, G.shake = 0.8, 0.08, 0.7
  G.tintHot = G.shipKey=='hongmao'
  G.tintT = 1.3
  sfx('boomE') sfx(G.shipKey=='hongmao' and 'phoenix' or 'boss')
  if G.shipKey=='hongmao' then
    G.phoenix2 = {x=G.shipX+20, y=G.shipY, vx=240, t=5, hit={}}
    for _,s in ipairs(pools.ebullets) do if s.on then s.on=false s.c:SetActive(false) end end
    log('bomb_clear') say('火凤燎原!')
  else
    G.freezeT = 4 say('冰封千里!')
    for _,s in ipairs(pools.ebullets) do
      if s.on then s.vx=0 s.vy=0 s.frozen=true end
    end
    log('bomb_clear')
  end
end

-- ===== 伤害/击杀 =====
local function damage(e, dmg)
  e.hp = e.hp - dmg
  e.flash = 0.09
  if e.hp<=0 and not e.dead and e.isBoss and e.phases and e.phaseIdx < #e.phases-1 then
    e.phaseIdx = e.phaseIdx + 1
    e.hp = e.phases[e.phaseIdx+1]
    G.score = G.score + 1000 log('score '..G.score)
    for _,s in ipairs(pools.ebullets) do if s.on then s.on=false s.c:SetActive(false) end end
    say(e.kind..' 变形!') e.flash = 0.15
    return
  end
  if e.hp<=0 and not e.dead then e.dead=true end
end
local function onKill(e)
  G.score = G.score + (e.def and e.def.score or 0)
  G.stats.kills = G.stats.kills + 1
  log('score '..G.score)
  sfx('boomE')
  local b = alloc(pools.booms)
  if b then b.on,b.t,b.big,b.x,b.y=true,0.8,e.isBoss==true,e.x,e.y b.c:SetActive(true) end
  if dist2(e.x,e.y,G.shipX,G.shipY) < 40 then unlock('tie_lian') end
  if e.isMid then mkItem('pow', e.x, e.y) say('能量块出现!') end
  if G.shipKey=='hongmao' and (e.burn or 0)>0 then
    local tgt, td = nil, 1e9
    for _,x in ipairs(pools.enemies) do
      if x.on and not x.dead and not x.gone and (x.burn or 0)<=0 and x~=e then
        local d = dist2(x.x,x.y,e.x,e.y)
        if d < 90 and d < td then tgt, td = x, d end
      end
    end
    if tgt then
      G.sparkSeeds[#G.sparkSeeds+1] = {x=e.x, y=e.y, tx=tgt, sp=320, done=false}
    end
  end
  local function drop(kind, n)
    for _=1,(n or 1) do mkItem(kind, e.x, e.y) end
  end
  if e.kind=='dj2' then drop('bs',2) end
  if e.kind=='dj4' and math.random()<0.5 then drop('bs',1) end
  if e.kind=='nq' or e.kind=='nq2' then drop('bs',2) end
  if e.kind=='jxr1' then drop('bs',2) end
  if e.kind=='dgp' then drop('bs',3) end
  if e.kind=='cw' then drop('pow',1) end
  if e.kind=='lsfj' then drop('bs',1) end
  if e.kind=='jbdj' then
    if math.random()<0.3 then drop('pow',1) else drop('bs',3) end
  end
  if e.isMid then drop('bom1',1) end
  if e.isBoss then
    G.boss = nil
    for _,s in ipairs(pools.ebullets) do if s.on then s.on=false s.c:SetActive(false) end end
    local pw = mkItem('pow', e.x-20, e.y+10) if pw then pw.life=9 end
    local bm = mkItem('bom1', e.x+20, e.y+10) if bm then bm.life=9 end
    G.invuln = 99 G.winPending = 6
  end
end

-- ===== 输入 =====
local function onKey(name, down)
  if name=='j' then
    if down then if not keys.j then keys.j=true jEdge=true end else keys.j=false jUp=true end
  elseif name=='k' then
    if down then if not keys.k then keys.k=true kEdge=true end else keys.k=false end
  elseif name=='left' then keys.left = down or nil
  elseif name=='right' then keys.right = down or nil
  elseif name=='up' then keys.up = down or nil
  elseif name=='down' then keys.down = down or nil
  elseif name=='a' then keys.a = down or nil
  elseif name=='d' then keys.d = down or nil
  elseif name=='enter' then keys.enter = down or nil
  end
end

-- ===== 僚机（demo syncWings：lv-1 个，个体随机）=====
function syncWings()
  local want = G.lv - 1
  for i,ws in ipairs(wingPool) do
    if i <= want and not ws.on then
      ws.on=true ws.x=G.shipX-20 ws.y=G.shipY ws.fireCd=0
      ws.bspd=250+math.random()*100 ws.k=0.6+math.random()*0.8
      setVis(ws.c, G.shipKey=='hongmao' and 'wingH' or 'wingL')
      ws.c:SetActive(true)
    elseif i > want and ws.on then
      ws.on=false ws.c:SetActive(false)
    end
  end
end

-- ===== 面板 =====
function hideResult()
  if resultPanel then
    for _,c in pairs(resultRefs) do pcall(game.DestroyClientUIControl, c) end
    pcall(game.DestroyClientUIControl, resultPanel)
    resultPanel, resultRefs = nil, {}
  end
end
function showResult(lines, btnTxt, panelName)
  hideResult()
  resultPanel = mkc(T_PANEL, panelName or 'ResultPanel')
  local refs = {}
  local y = FH/2 + 64
  for i,ln in ipairs(lines) do
    local t = txtc(ln[1], ln[2] or 16, ln[3] or 230, ln[4] or 230, ln[5] or 230, 'r'..i)
    place(t, FW/2, y) refs[i]=t y = y - 22
  end
  if btnTxt then
    local btn = mkc(T_BTN, 'ResultBtn')
    placeSize(btn, FW/2, y-6, 160, 30)
    btn:AddCursorEventListener(Enum.CursorEventType.CursorClick, function()
      if G.state=='clear' then G.nextLevelReq = true
      elseif G.state=='fail' then G.restartReq = true end
    end)
    local bt = txtc(btnTxt, 15, 255,220,120, 'ResultBtnTx')
    place(bt, FW/2, y-6)
    refs.btn=btn refs.bt=bt
  end
  resultRefs = refs
  sfx('wudao')
end
function win()
  G.invuln = 0
  G.state = 'clear'
  log('level_clear')
  local r = G.stats.hits==0 and '甲' or (G.stats.hits<=2 and '乙' or '丙')
  local last = G.levelIdx >= #LEVELS
  local lines = {
    {LEVELS[G.levelIdx].name, 22, 255,215,120},
    {'通 关', 15, 230,230,230},
    {'击破 '..G.stats.kills..'   受击 '..G.stats.hits, 14, 230,230,230},
    {'用时 '..math.floor(G.stats.time)..'s   拾取 '..G.stats.pick, 14, 230,230,230},
    {'评价：「'..r..'」', 17, 255,210,63},
    {'奖励：+1 命 · 宝回满（命'..math.min(G.life+1,9)..'）', 13, 180,220,180},
  }
  if last then lines[#lines+1] = {'六关全破！总分 '..G.score, 15, 255,215,120} end
  showResult(lines, last and '再来一轮 (R)' or '下一关 (K)', 'WinPanel')
end
function fail()
  G.state = 'fail'
  log('fail lives')
  showResult({
    {'任务失败', 24, 255,90,90},
    {'得分 '..G.score, 15, 230,230,230},
    {'从关 1 重来（街机 run）', 13, 180,190,210},
  }, '重开 (R)', 'GameOverPanel')
end
function loadLevelState(i)
  local L = LEVELS[i]
  G.levelIdx = i
  G.wave=0 G.levelT=0 G.waveGap=0 G.boss=nil
  G.mode=L.mode G.env=L.env G.levelMul=L.mul or 1
  for _,s in ipairs(pools.enemies) do if s.on then s.on=false s.c:SetActive(false) end end
  for _,s in ipairs(pools.ebullets) do if s.on then s.on=false s.c:SetActive(false) end end
  for _,s in ipairs(pools.items) do if s.on then s.on=false s.c:SetActive(false) end end
  for _,s in ipairs(pools.booms) do if s.on then s.on=false s.c:SetActive(false) end end
  for _,s in ipairs(pools.floaters) do if s.on then s.on=false s.c:SetActive(false) end end
  G.needles=0 G.neng=0 G.guanri=nil G.phoenix2=nil G.freezeT=0 G.salvo=nil
  G.traitQ={} G.traitT={} G.fxAura={} G.recyc=0 G.sparkSeeds={}
  G.zmArmed=false G.zmFull=false G.jTapT=0 G.jHeld=false G.jPressFull=false G.holdT=0 G.lastHold=0
  G.renjianWin=0 G.renjianLeft=0 G.renjianCd=0 G.qiudaoCd=0
  G.dmgAcc={} G.dmgAccT=0.5 G.delayShots={}
  G.chargeFull=false G.chargeMax=false G.chargeTier=1
  G.scrollSpd=N.scroll G.envTimer=1.5 G.dj1Timer=1.5 G.dxddT=2.6 G.bgKey=L.bg G.bgW=ART[L.bg][2]
  say(L.name) log('level '..i)
end
function nextLevel()
  hideResult()
  if G.levelIdx >= #LEVELS then
    G.state='win' log('game_win')
    G.restartReq = true
    return
  end
  G.life = math.min(G.life+1, 9)
  G.bomm = 3 G.invuln = 1.8
  loadLevelState(G.levelIdx + 1)
  G.state = 'playing'
end
function startRun()
  G.state='playing'
  G.shipKey = G.selIdx==2 and 'lantu' or 'hongmao'
  G.shipX, G.shipY = 45, 100
  G.fireCd=0 G.neng=0 G.stats={kills=0,hits=0,pick=0,time=0}
  loadLevelState(1)
  log('game_start') log('char_select '..G.shipKey) sfx('sel')
  mkItem('pow',130,110)
end

-- ===== 选人面板 =====
function destroySelect()
  if selPanel then
    for _,c in pairs(selRefs) do pcall(game.DestroyClientUIControl, c) end
    pcall(game.DestroyClientUIControl, selPanel)
    selPanel, selRefs = nil, {}
  end
end
function buildSelect()
  destroySelect()
  selPanel = mkc(T_PANEL, 'CharSelectPanel')
  local title = txtc('虹猫蓝兔 · 七侠传', 24, 255,210,63, 'SelTitle')
  place(title, FW/2, FH-28)
  local sub = txtc('千星弹幕射击 · 选择你的侠士', 11, 175,185,205, 'SelSub')
  place(sub, FW/2, FH-13)
  local hint = txtc('A/D 或 ←/→ 切换 · J 确认 · 左右点选屏幕', 11, 150,170,190, 'SelHint')
  place(hint, FW/2, 12)
  selRefs.title=title selRefs.sub=sub selRefs.hint=hint
  local cards = {
    {k='hongmao', n='虹猫', d1='长虹剑 · 重击 0.7s', d2='蓄力→贯日巨剑 + 僚机S阵列', d3='大招 K：火凤燎原', tint={255,180,60}},
    {k='lantu',   n='蓝兔', d1='快射 0.4s · 每发攒银针', d2='蓄力→冰魄剑 + 针雨齐发', d3='大招 K：冰封千里', tint={120,210,255}},
  }
  for i,c in ipairs(cards) do
    local cx = FW/4 + (i-1)*FW/2
    local bd = imgc('bar', 'SelCardB'..i)
    bd.imageColor = Color(96,106,136,190)
    placeSize(bd, cx, 118, 156, 164)
    local card = imgc('bar', 'SelCard'..i)
    card.imageColor = Color(22,28,50,238)
    placeSize(card, cx, 118, 148, 156)
    local glow = imgc('ring', 'SelGlow'..i)
    glow.imageColor = Color(c.tint[1],c.tint[2],c.tint[3],60)
    placeSize(glow, cx, 148, 96, 96)
    local img = imgc(c.k, 'SelImg'..i)
    placeSize(img, cx, 148, 72, 78)
    local name = txtc(c.n, 18, 255,210,63, 'SelName'..i)
    place(name, cx, 97)
    local d1 = txtc(c.d1, 10, 170,185,210, 'SelD1'..i)
    place(d1, cx, 80)
    local d2 = txtc(c.d2, 10, 150,165,190, 'SelD2'..i)
    place(d2, cx, 68)
    local d3 = txtc(c.d3, 10, 255,200,120, 'SelD3'..i)
    place(d3, cx, 54)
    -- 命中按钮：模板钮不透明，移出屏外仅供自动化点名；真人点击走 FieldArea 半屏判定
    local cardBtn = mkc(T_BTN, i==1 and 'HongmaoCard' or 'LantuCard')
    cardBtn:AddCursorEventListener(Enum.CursorEventType.CursorClick, function()
      if G.state=='select' then G.selIdx=i startRun() end
    end)
    placeSize(cardBtn, -500, -500, 8, 8)
    selRefs['img'..i]=img selRefs['name'..i]=name selRefs['glow'..i]=glow
    selRefs['bd'..i]=bd selRefs['card'..i]=card
    selRefs['d1'..i]=d1 selRefs['d2'..i]=d2 selRefs['d3'..i]=d3
  end
end

-- ===== 领悟图鉴面板 =====
function toggleCodex()
  if codexOpen then
    if codexPanel then
      for _,c in pairs(codexRefs) do pcall(game.DestroyClientUIControl, c) end
      pcall(game.DestroyClientUIControl, codexPanel)
      codexPanel, codexRefs = nil, {}
    end
    codexOpen = false return
  end
  codexOpen = true
  codexPanel = mkc(T_PANEL, 'CodexPanel')
  local n = 0
  for _,c in ipairs(CODEX) do if codexUnlocked[c[1]] then n=n+1 end end
  local title = txtc('悟之录  '..n..'/'..#CODEX, 15, 255,210,63, 'CodexTitle')
  place(title, FW/2, FH-16)
  codexRefs.title = title
  local y = FH - 34
  for _,c in ipairs(CODEX) do
    local got = codexUnlocked[c[1]]
    local t1 = txtc(got and (c[2]..'：'..c[3]) or (c[2]..'：？'), 9,
      got and 235 or 120, got and 220 or 130, got and 180 or 150, 'cx'..c[1])
    place(t1, FW/2, y) codexRefs[c[1]] = t1
    y = y - 12
    if got then
      local t2 = txtc('· '..c[4], 8, 150,180,160, 'cxs'..c[1])
      place(t2, FW/2, y) codexRefs[c[1]..'s'] = t2
      y = y - 11
    end
  end
  y = y - 6
  local nt = 0
  for _,id in ipairs(TRAITS_KEYS) do if traitsSeen[id] then nt=nt+1 end end
  local th = txtc('特性  '..nt..'/'..#TRAITS_KEYS, 13, 255,210,63, 'CodexTraits')
  place(th, FW/2, y) codexRefs.th = th
  y = y - 14
  for _,id in ipairs(TRAITS_KEYS) do
    local t = TRAITS[id]
    local got = traitsSeen[id]
    local line = txtc(got and (t[1]..'（'..t[2]..'）：'..t[3]) or (t[1]..'：？'), 9,
      got and 220 or 120, got and 200 or 130, got and 170 or 150, 'tr'..id)
    place(line, FW/2, y) codexRefs['tr'..id] = line
    y = y - 12
  end
  local closeB = mkc(T_BTN, 'CodexCloseBtn')
  placeSize(closeB, FW/2, 8, 80, 18)
  closeB:AddCursorEventListener(Enum.CursorEventType.CursorClick, function() toggleCodex() end)
  codexRefs.closeBtn = closeB
end

-- ===== 命中环 =====
local function bulletHits()
  -- 长虹贯日
  if G.guanri then
    local g = G.guanri
    local tgts = {}
    for _,e in ipairs(pools.enemies) do
      if e.on and not e.dead and not e.gone and not e.def.hazard then tgts[#tgts+1]=e end
    end
    if G.boss and not G.boss.dead then tgts[#tgts+1]=G.boss end
    for _,e in ipairs(tgts) do
      if not g.hit[e] and math.abs(e.x-g.x)*2 < g.w+e.w and math.abs(e.y-g.y)*2 < g.w+e.h then
        g.hit[e] = true
        local gd = e.isBoss and g.dmg*1.5 or g.dmg
        local gc = false
        if math.random() < critRate('guanri', e) then
          gd = gd*2 gc = true
          local s=alloc(pools.booms)
          if s then s.on,s.t,s.crit,s.x,s.y=true,0.25,true,e.x,e.y s.c:SetActive(true) end
        end
        dmgFloat(e.x, e.y, gd, 'skill', gc)
        damage(e, math.floor(gd+0.5))
        e.burn=12 e.burnTick=3 e.burnSrc='guanri'
        if G.renjianLeft>0 and G.t>G.renjianCd and G.fireCd<=0 then G.renjianWin=0.3 end
        local s=alloc(pools.booms)
        if s then s.on,s.t,s.spark,s.x,s.y=true,0.25,true,e.x,e.y s.c:SetActive(true) end
      end
    end
  end
  -- 火凤燎原
  if G.phoenix2 then
    local p = G.phoenix2
    local tgts = {}
    for _,e in ipairs(pools.enemies) do
      if e.on and not e.dead and not e.gone and not e.def.hazard then tgts[#tgts+1]=e end
    end
    if G.boss and not G.boss.dead then tgts[#tgts+1]=G.boss end
    for _,e in ipairs(tgts) do
      if math.abs(e.x-p.x)<52 and math.abs(e.y-p.y)<40 then
        if (e.burn or 0)>0 then unlock('rifeng') end
        if not p.hit[e] then
          p.hit[e]=true
          e.burn=12 e.burnTick=3 e.burnSrc='phoenix'
          if G.renjianLeft>0 and G.t>G.renjianCd and G.fireCd<=0 then G.renjianWin=0.3 end
        end
        local pd = ((e.burn or 0)>0 and 220 or 150)*STEP
        damage(e, pd)
        G.dmgAcc[e] = (G.dmgAcc[e] or 0) + pd
      end
    end
  end
  -- 玩家弹
  for _,b in ipairs(pools.bullets) do
    if b.on then
      for _,e in ipairs(pools.enemies) do
        if e.on and not e.dead and not e.gone and not e.def.hazard and hit(b,e) then
          sfx('hit')
          if b.pierce then
            if not b.hitSet[e] then
              b.hitSet[e] = true
              local d, nc = b.dmg, false
              if b.wallId then
                if G.shipKey=='lantu' and G.freezeT>0 then traitFire('yizhen') end
                if b.zm then traitFire('zhenman') traitFx('zhenman') end
                if math.random() < critRate('needle', e) then
                  d=d*2 nc=true
                  local s=alloc(pools.booms)
                  if s then s.on,s.t,s.crit,s.x,s.y=true,0.25,true,e.x,e.y s.c:SetActive(true) end
                end
              end
              dmgFloat(e.x, e.y, d, b.art=='bingpoj' and 'frost' or 'normal', nc)
              if G.freezeT>0 and b.art=='bingpoj' then
                d=d*2 unlock('dong_sui')
                local s=alloc(pools.booms)
                if s then s.on,s.t,s.shard,s.x,s.y=true,0.3,true,e.x,e.y s.c:SetActive(true) end
              end
              damage(e, d)
              if b.art=='bingpoj' then
                G.needles = math.min(G.lv*(2+G.lv), G.needles+1)
                local hn = 0 for _ in pairs(b.hitSet) do hn=hn+1 end
                if hn>=2 then unlock('jian_bu_zhen') end
              end
              if b.wallId then
                G.wallHits[b.wallId] = (G.wallHits[b.wallId] or 0) + 1
                if G.wallHits[b.wallId]>=3 then unlock('yi_xian_chuan') end
                if G.wallHits[b.wallId]>=5 then unlock('man_zhen') end
                if G.shipKey=='lantu' and dist2(e.x,e.y,G.shipX,G.shipY)<90 then
                  G.recyc = G.recyc+1 traitFire('guiqia') traitFx('guiqia')
                  if G.recyc%2==0 then
                    G.needles = math.min(G.lv*(2+G.lv), G.needles+1)
                    local s=alloc(pools.booms)
                    if s then s.on,s.t,s.recyc,s.x,s.y=true,0.3,true,e.x,e.y s.c:SetActive(true) end
                  end
                end
              end
              if b.dmg>=50 then
                local s=alloc(pools.booms)
                if s then s.on,s.t,s.x,s.y=true,0.18,e.x,e.y s.c:SetActive(true) end
              end
            end
          else
            if b.art=='bingpoj' then
              G.needles = math.min(G.lv*(2+G.lv), G.needles+1)
            end
            if b.wallId and G.shipKey=='lantu' and dist2(e.x,e.y,G.shipX,G.shipY)<90 then
              G.recyc = G.recyc+1 traitFire('guiqia') traitFx('guiqia')
              if G.recyc%2==0 then
                G.needles = math.min(G.lv*(2+G.lv), G.needles+1)
                local s=alloc(pools.booms)
                if s then s.on,s.t,s.recyc,s.x,s.y=true,0.3,true,e.x,e.y s.c:SetActive(true) end
              end
            end
            damage(e, traitBulletDmg(b, e))
            b.on=false b.c:SetActive(false)
            break
          end
        end
      end
      if b.on and G.boss and not G.boss.dead and hit(b, G.boss) then
        sfx('hit')
        damage(G.boss, traitBulletDmg(b, G.boss))
        b.on=false b.c:SetActive(false)
      end
    end
  end
end

-- ===== 玩家中弹（demo playerHit：死亡循环）=====
function playerHit()
  if G.invuln>0 or G.lock>0 then return end
  local b=alloc(pools.booms)
  if b then b.on,b.t,b.big,b.x,b.y=true,0.6,true,G.shipX,G.shipY b.c:SetActive(true) end
  sfx('boomP')
  G.lv=1 log('pow 1') syncWings()
  G.neng=0 G.wingBurst=0 G.needles=0 G.stats.hits=G.stats.hits+1
  mkItem('pow', G.shipX, G.shipY)
  G.life = G.life - 1
  log('life '..math.max(G.life,0)) log('respawn')
  if G.life==1 then traitFire('beishui') traitFx('beishui') end
  if G.life<=0 then fail() return end
  G.bomm=3 G.shield=1.2
  G.shipX=-20 G.shipY=100 G.invuln=1.8 G.flyIn=true
end
function playerHitRaw() G.invuln=0 playerHit() end

-- ===== 发射核心（demo jFireCore）=====
function jFireCore()
  local cfg = N.ships[G.shipKey]
  fireVolley()
  G.fireCd = (cfg.fireCd or 0.3)/(G.life==1 and 1.2 or 1)
  if G.renjianWin>0 and G.renjianLeft>0 and G.shipKey=='hongmao' then
    G.renjianLeft = G.renjianLeft - 1
    G.renjianWin = 0
    G.renjianCd = G.t + 1.2
    traitFire('renjian')
    fireSmallSwords(2, 'renjian')
  end
end

-- ===== 状态重置 =====
local KEEP_CTRLS = {'shipC','flameC','guanriC','huofengC','shieldC','ringC1','ringC2','readyC',
  'zmRingC','bsRingC','auraC','salvoC','bossC','freezeC','bgC1','bgC2','unlockT','tcT1','tcT2','tcT3','fieldArea'}
function resetState()
  local oldG = G
  G = {state='select', selIdx=1, t=0,
    score=0, life=4, bomm=3, lv=1, neng=0,
    shipX=0, shipY=0, fireCd=0,
    boss=nil, wave=0, waveGap=0, levelIdx=0, levelT=0,
    mode='gate', env=nil, levelMul=1, envTimer=1.5, dj1Timer=1.5, dxddT=2.6,
    wingBurst=0, flashT=0, flyIn=false, fashez=0,
    stats={kills=0,hits=0,pick=0,time=0},
    needles=0, wallSeq=0, wallHits={},
    guanri=nil, phoenix2=nil, freezeT=0, chargeGraze=0,
    traitCard=nil, traitQ={}, traitT={}, fxAura={}, recyc=0, sparkSeeds={},
    zmArmed=false, zmFull=false, jTapT=0, jHeld=false, jPressFull=false, holdT=0, lastHold=0,
    dmgAcc={}, dmgAccT=0.5,
    renjianWin=0, renjianLeft=0, renjianCd=0, qiudaoCd=0,
    loopMark={shot=-99,sword=-99,wall=-99},
    bgKey='bg', bgW=ART.bg[2], unlockFx=nil, slowT=0, slowK=0.35,
    shake=0, tintT=0, tintHot=false, winPending=0, wingBurst2=0, readyFx=0,
    scrollX=0, scrollSpd=N.scroll, invuln=0, shield=0, lock=0,
    shipKey='hongmao', chargeTier=1, chargeFull=false, chargeMax=false,
    restartReq=false, nextLevelReq=false, autoPlay=false,
    boundL=false, boundR=false, boundU=false, boundD=false, salvo=nil,
    delayShots={},
  }
  if oldG then
    for _,k in ipairs(KEEP_CTRLS) do G[k]=oldG[k] end
  end
end

-- ===== 主 tick =====
local acc = 0
local function tick(dt)
  -- 特性教学卡：时间冻结，K/点击关闭
  if G.traitCard then
    if kEdge then
      G.traitCard=nil
      G.invuln = math.max(G.invuln, 1.5)
    end
    kEdge=false jEdge=false jUp=false
    return
  end
  -- 特性卡延迟队列（2.5s 后弹卡）
  local qArmed = false
  for id,tt in pairs(G.traitQ) do
    local t2 = tt - dt
    if t2 <= 0 then
      G.traitQ[id]=nil
      traitsSeen[id]=1
      G.traitCard=id
      log('trait_unlock '..id) sfx('phoenix')
      qArmed = true
    else
      G.traitQ[id]=t2
    end
  end
  if qArmed then kEdge=false jEdge=false jUp=false return end
  G.t = G.t + dt
  G.stats.time = G.stats.time + dt
  for _,m in ipairs(pools.msgs) do
    if m.on then m.t = m.t + dt if m.t >= m.life then m.on=false m.c:SetActive(false) end end
  end
  -- 火种追踪（薪火相传）
  for _,sd in ipairs(G.sparkSeeds) do
    local dx,dy = sd.tx.x-sd.x, sd.tx.y-sd.y
    local L = math.sqrt(dx*dx+dy*dy) if L<1 then L=1 end
    sd.x = sd.x + dx/L*sd.sp*dt
    sd.y = sd.y + dy/L*sd.sp*dt
    if L < 14 then
      sd.done = true
      if not sd.tx.dead then
        sd.tx.burn=12 sd.tx.burnTick=3 sd.tx.burnSrc='xinhuo'
        local s=alloc(pools.booms)
        if s then s.on,s.t,s.burnT,s.x,s.y=true,0.25,true,sd.tx.x,sd.tx.y s.c:SetActive(true) end
        traitFire('xinhuo') traitFx('xinhuo')
      end
    end
  end
  for i=#G.sparkSeeds,1,-1 do if G.sparkSeeds[i].done then table.remove(G.sparkSeeds,i) end end
  -- 选人
  if G.state=='select' then
    if jEdge or keys.enter then jEdge=false startRun() return end
    if keys.a then G.selIdx=1 elseif keys.d then G.selIdx=2 end
    return
  end
  if G.state=='clear' then
    if kEdge or G.nextLevelReq then G.nextLevelReq=false kEdge=false nextLevel() return end
    kEdge=false jEdge=false return
  end
  if G.state~='playing' then
    if G.restartReq then
      G.restartReq=false
      hideResult() resetState() freePools() destroySelect() buildSelect()
      log('restart') log('game_start') log('boot ok')
    end
    kEdge=false jEdge=false return
  end
  -- 慢镜（悟/大招顿帧）
  if G.slowT>0 then G.slowT=G.slowT-dt dt=dt*(G.slowK or 0.35) end
  -- boss 掉落拾取缓冲
  if G.winPending>0 then
    G.winPending=G.winPending-dt G.invuln=99
    if G.winPending<=0 then win() return end
  end
  local cfg = N.ships[G.shipKey]
  if G.lock>0 then G.lock=G.lock-dt end
  if G.flyIn then
    G.shipX = G.shipX + 280*dt
    if G.shipX>=40 then G.shipX=40 G.flyIn=false end
  end
  if G.invuln>0 and G.invuln<90 then G.invuln=G.invuln-dt end
  if G.shield>0 then G.shield=G.shield-dt end
  if G.freezeT>0 then
    G.freezeT=G.freezeT-dt
    if G.freezeT<=0 then
      for _,s in ipairs(pools.ebullets) do if s.on and s.frozen then s.on=false s.c:SetActive(false) end end
    end
  end
  if G.shake>0 then G.shake=G.shake-dt end
  if G.tintT>0 then G.tintT=G.tintT-dt if G.tintT<=0 then G.tintT=0 end end
  -- 移动（键盘+触屏拖动）
  local mvx, mvy = 0, 0
  if G.lock<=0 then
    if keys.left or keys.a then mvx=-1 elseif keys.right or keys.d then mvx=1 end
    if keys.up then mvy=1 elseif keys.down then mvy=-1 end
    if touch.on then
      local dx,dy = touch.x-G.shipX, touch.y-G.shipY
      local L = math.sqrt(dx*dx+dy*dy)
      if L>4 then mvx=dx/L mvy=dy/L end
    end
  end
  local spd = G.life==1 and 1.2 or 1
  G.shipX = clamp(G.shipX + mvx*N.player.vx*spd*dt, N.player.xMin, N.player.xMax)
  G.shipY = clamp(G.shipY + mvy*N.player.vy*spd*dt, N.player.yMin, N.player.yMax)
  if mvx<0 and G.shipX<=N.player.xMin then
    if not G.boundL then log('bound left') end G.boundL=true
  else G.boundL=false end
  if mvx>0 and G.shipX>=N.player.xMax then
    if not G.boundR then log('bound right') end G.boundR=true
  else G.boundR=false end
  if mvy>0 and G.shipY>=N.player.yMax then
    if not G.boundU then log('bound up') end G.boundU=true
  else G.boundU=false end
  if mvy<0 and G.shipY<=N.player.yMin then
    if not G.boundD then log('bound down') end G.boundD=true
  else G.boundD=false end
  -- 输入 v34b 三铁律：按下即射 / 松手沿点按倾匣 / 长按 0.25s 转纯蓄力
  local jNow = keys.j == true
  if G.autoPlay then jNow = true end
  local firing = jNow or touch.on
  if firing then G.holdT = G.holdT + dt
  else
    if G.holdT>0 then G.lastHold=G.holdT end
    G.holdT = 0
  end
  if jNow and not G.jHeld then
    G.jTapT = G.t + 0.25
    G.jPressFull = (G.shipKey=='lantu' and G.needles>=G.lv*(2+G.lv))
    if G.lock<=0 and G.fireCd<=0 then jFireCore() end
  end
  if not jNow and G.jHeld and G.jTapT>0 then
    G.jTapT = 0
    if G.jPressFull and G.shipKey=='lantu' and G.needles>=G.lv*(2+G.lv) then
      needleBarrage(0.7, false, 1, false)
    end
  end
  G.jHeld = jNow
  if G.jTapT>0 and G.t>=G.jTapT then G.jTapT=0 end
  local wasCd = G.fireCd
  G.fireCd = G.fireCd - dt
  if wasCd>0 and G.fireCd<=0 then G.readyFx = 0.14 end
  if (touch.on or G.autoPlay) and G.lock<=0 and G.fireCd<=0 then jFireCore() end
  if G.readyFx>0 then G.readyFx=G.readyFx-dt end
  if G.renjianWin>0 then G.renjianWin=G.renjianWin-dt end
  for id,v in pairs(G.fxAura) do if v>0 then G.fxAura[id]=v-dt end end
  -- 满匣光环+提示
  if G.shipKey=='lantu' then
    local full = G.needles>=G.lv*(2+G.lv)
    if full and not G.zmFull then traitFx('zhenman') say('针匣已满：点按倾匣 · 长按蓄力') end
    G.zmFull = full
  end
  -- 蓄力（长按 0.25s 后；fashez 释放锁）
  if G.fashez>0 then
    G.fashez=G.fashez-dt G.neng=0
  elseif firing and G.lv>1 and G.holdT>=0.25 then
    local cr = N.chargeRate
    if G.shipKey=='lantu' and G.needles>=G.lv*(2+G.lv) then cr = cr*1.3 end
    G.neng = math.min(G.neng + cr*dt, cfg.ps*1.5)
  end
  if G.lv>1 then
    if G.neng>=cfg.ps then
      if not G.chargeFull then
        G.chargeFull=true sfx('phoenix') sfx('full')
        if G.shipKey=='lantu' and G.needles>=G.lv*(2+G.lv) then G.zmArmed=true end
        if G.chargeGraze>=3 then unlock('xuli_zouwei') end
        G.chargeGraze=0
      end
      if G.neng>=cfg.ps*1.5 and not G.chargeMax then
        G.chargeMax=true sfx('boss') say('过载!')
      end
    else
      G.chargeFull=false G.chargeMax=false
    end
  end
  if G.neng<=0 then G.chargeGraze=0 end
  -- 释放（松手；两档 70%/150%）
  if not firing and G.neng>0 and G.lastHold>=0.25 then
    if G.neng >= 0.7*cfg.ps then
      G.chargeTier = G.neng>=cfg.ps*1.5 and 1 or 0.25
      releaseCharge()
    end
    G.neng = 0
  end
  if G.wingBurst>0 then G.wingBurst=G.wingBurst-dt end
  if kEdge then tryBomb() end
  -- 银针 salvo：固化原位 70ms/发 逐放飞出
  if G.salvo then
    local sv = G.salvo
    sv.int = sv.int - dt
    while sv.int<=0 and sv.n>0 do
      sv.int = sv.int + 0.07
      sv.n = sv.n - 1
      local row = sv.n % sv.rows
      local s = alloc(pools.bullets)
      if s then
        s.on=true s.x=sv.x s.y=sv.y+(row-(sv.rows-1)/2)*11
        s.vx=560 s.vy=(row-(sv.rows-1)/2)*18
        s.w=30 s.h=9
        s.aw = sv.big and (44+5*G.lv) or 22
        s.ah = sv.big and (10+G.lv) or 7
        s.dmg=math.floor((12+7*G.lv)*sv.mult+0.5)
        s.pierce = sv.big==true
        s.art='yinzhen' s.maxD = sv.big and 240 or 300 s.dist=0 s.sine=nil
        G.wallSeq = G.wallSeq + 1
        s.wallId = G.wallSeq s.zm = sv.zm==true s.hitSet={}
        setVis(s.c,'yinzhen',s.aw,s.ah) s.c:SetActive(true)
      end
      sfx('fireL')
    end
    if sv.n<=0 then G.salvo=nil end
  end
  if G.wingBurst2>0 then G.wingBurst2=G.wingBurst2-dt end
  -- 僚机（环绕注能/针座贴身/阶梯斜阵/S 阵列）
  local charging = G.lv>1 and G.neng>0 and G.fashez<=0
  local wingN = 0
  for _,ws in ipairs(wingPool) do if ws.on then wingN=wingN+1 end end
  for i,ws in ipairs(wingPool) do
    if ws.on then
      local tx, ty
      if charging and G.shipKey=='hongmao' then
        local a = G.t*4 + (i-1)*6.28/math.max(1,wingN)
        tx = G.shipX + math.cos(a)*26
        ty = G.shipY + math.sin(a)*26
      elseif charging then
        tx = G.shipX+22-(i-1)*10 ty = G.shipY + ((i%2==0) and 6 or -6)
      elseif G.shipKey=='lantu' then
        tx = G.shipX-26-(i-1)*15
        ty = G.shipY-8-(i-1)*11+math.sin(G.t*2.2+i)*3
      else
        tx = G.shipX-26-(i-1)*16 ty = G.shipY-10
      end
      local k = math.min(1, dt*5*(ws.k or 1))
      ws.x = ws.x + (tx-ws.x)*k*1.4
      ws.y = ws.y + (ty-ws.y)*k
      ws.fireCd = ws.fireCd - dt
      if G.wingBurst2>0 and ws.fireCd<=0 and G.lock<=0 then
        local s=alloc(pools.bullets)
        if s then
          s.on=true s.x=ws.x+10 s.y=ws.y
          s.vx=360+math.random()*140 s.vy=0
          s.sine={amp=110+math.random()*40, freq=3.5+math.random(), ph=math.random()*6.28}
          s.w=14 s.h=6 s.aw=14 s.ah=6 s.dmg=math.floor(N.zdlv[G.lv]*0.9+0.5) s.art='fdzd'
          s.maxD=0 s.dist=0 s.pierce=nil s.wallId=nil s.zm=nil s.hitSet=nil
          setVis(s.c,'fdzd') s.c:SetActive(true)
        end
        ws.fireCd = 2.4/(8+2*G.lv)
      end
    end
  end
  -- 卷轴
  if G.flashT>0 then G.flashT=G.flashT-dt end
  G.scrollX = G.scrollX + G.scrollSpd*dt
  -- 环境刷怪器：关5=dxdd 底部鱼雷 / 关2=lfj / 默认 dj1
  if G.env=='dxdd' then
    G.dxddT = G.dxddT - dt
    if G.dxddT<=0 then
      G.dxddT = 1.9 + math.random()*0.8
      local s = spawnEnemyAt('dxdd', 320+math.random()*100, 12)
      if s then
        s.yy = 30+math.random()*150
        s.spp = 70+math.random()*60
        s.sp = 300+math.random()*220
        s.fireT = 999 s.hoverX = 999
      end
    end
  end
  G.dj1Timer = G.dj1Timer - dt
  if G.dj1Timer<=0 and poolCount(pools.enemies)+(G.boss and 1 or 0)<14 then
    G.dj1Timer = 0.12
    if math.random()<0.1 then
      local y = 40+math.random()*150
      if G.env=='lfj' then
        local s = spawnEnemyAt('lfj', FW+20, y)
        if s then s.spd=125+math.random()*50 s.fireT=999 end
      else
        local s = spawnEnemyAt('dj1', FW+20, y)
        if s then s.spd=200+math.random()*100 s.fireT=999 end
      end
    end
  end
  -- 波次引擎：gate=击杀门闩 / time=时间表（boss/中boss 段冻结）
  local L = LEVELS[G.levelIdx]
  G.waveGap = G.waveGap - dt
  if G.mode=='time' then
    G.levelT = G.levelT + dt
    local bossHold = G.boss ~= nil
    if not bossHold then
      for _,e in ipairs(pools.enemies) do
        if e.on and not e.dead and not e.gone and e.isMid then bossHold=true break end
      end
    end
    if not bossHold then
      while G.wave < #L.waves and L.waves[G.wave+1] and L.waves[G.wave+1].t <= G.levelT do
        spawnWave()
      end
    end
  else
    local gateClear = true
    for _,e in ipairs(pools.enemies) do
      if e.on and not e.dead and not e.gone and e.kind~='dj1' and e.kind~='lfj' then gateClear=false break end
    end
    if G.boss then gateClear=false end
    if gateClear and G.wave<#L.waves and G.waveGap<=0 then
      spawnWave()
      G.waveGap = 1.2
    end
  end
  -- 敌机更新
  local fs = G.freezeT>0 and 0 or 1
  for _,e in ipairs(pools.enemies) do
    if e.on and not e.dead then
      e.t = e.t + dt*fs
      if e.flash>0 then e.flash=e.flash-dt end
      if (e.burn or 0)>0 then
        e.burn = e.burn - dt
        e.burnTick = (e.burnTick==nil and 3 or e.burnTick) - dt
        if e.burnTick<=0 then
          e.burnTick = 3
          damage(e, 35)
          local s=alloc(pools.booms)
          if s then s.on,s.t,s.burnT,s.x,s.y=true,0.2,true,e.x,e.y s.c:SetActive(true) end
          dmgFloat(e.x, e.y, 35, 'burn', false)
        end
        if e.hp<=0 and not e.dead then e.dead=true end
      end
      if e.kind=='dxdd' then
        if not e.charging then
          e.y = e.y + (e.spp or 70)*dt*fs
          if e.y >= (e.yy or 100) then e.charging=true end
        else
          e.x = e.x - (e.sp or 300)*dt*fs
        end
        if e.x<-40 then e.dead=true e.gone=true end
      elseif e.def.roller then
        e.x = e.x - 110*dt*fs
        e.fireT = e.fireT - dt*fs
        if e.fireT<=0 and e.x<FW and G.lock<=0 and G.freezeT<=0 then
          e.fireT = 2.2 + math.random()
          local vx,vy = aimvx(e.x,e.y,G.shipX,G.shipY,170)
          eshoot(e, vx, vy)
        end
        if e.x<-40 then e.dead=true e.gone=true end
      elseif e.escT then
        if e.x > e.hoverX then e.x = e.x - 140*dt*fs
        elseif fs>0 then e.x = e.hoverX + math.sin(e.t*0.7+e.bob)*14 end
        e.escT = e.escT - dt*fs
        if e.escT<=0 then
          e.y = e.y + 150*dt
          e.fireT = 999
          if e.y>270 then
            e.gone=true say('黑翼蛟遁走了…') log('cw_escape')
          end
        else
          e.fireT = e.fireT - dt*fs
          if e.fireT<=0 and e.x<FW and G.lock<=0 and G.freezeT<=0 then
            e.fireT = 1.8
            for i=0,3 do eshoot(e, -110, (i-1.5)*38, 'szd2') end
          end
        end
      elseif e.kind=='dj1' or e.kind=='lfj' then
        e.x = e.x - (e.spd or 250)*dt
        if not e.fired and e.x < G.shipX then e.fired=true end
        if e.fired and math.random()<dt*1.2 and e.x<FW and e.x>G.shipX then
          local vx,vy = aimvx(e.x,e.y,G.shipX,G.shipY,150)
          eshoot(e, vx, vy)
        end
        if e.x<-30 then e.dead=true e.gone=true end
      else
        if e.x > e.hoverX then e.x = e.x - 140*dt*fs
        elseif fs>0 then e.x = e.hoverX + math.sin(e.t*0.7+e.bob)*18 end
        if fs>0 then e.y = clamp(e.y + math.sin(e.t*1.8+e.bob)*14*dt, 55, 205) end
        e.fireT = e.fireT - dt*fs
        if e.fireT<=0 and e.x<FW+5 and G.lock<=0 and G.freezeT<=0 then
          e.fireT = 1.5 + math.random()*0.9
          local sp = e.def.zdsd or 150
          local vx,vy = aimvx(e.x,e.y,G.shipX,G.shipY,sp)
          eshoot(e, vx, vy)
          if e.kind=='dj2' or e.kind=='dj3' then
            local vx2,vy2 = aimvx(e.x,e.y,G.shipX,G.shipY+40,sp)
            eshoot(e, vx2, vy2)
          end
        end
        if e.x<180 then e.x=180 end
      end
      if G.invuln<=0 and G.lock<=0 and hit(e,{x=G.shipX,y=G.shipY,w=10,h=8}) then playerHit() end
      if e.dead then onKill(e) e.on=false e.c:SetActive(false) end
    elseif e.on and e.gone then
      e.on=false e.c:SetActive(false)
    end
  end
  -- boss（六 boss 分相招式全表）
  if G.boss then
    local b = G.boss
    local bfs = G.freezeT>0 and 0 or 1
    b.pt = b.pt + dt*bfs
    b.patT = b.patT + dt*bfs
    if (b.burn or 0)>0 then
      b.burn=b.burn-dt
      b.burnTick=(b.burnTick==nil and 3 or b.burnTick)-dt
      if b.burnTick<=0 then
        b.burnTick=3 damage(b,35)
        dmgFloat(b.x,b.y,35,'burn',false)
      end
    end
    if b.flash>0 then b.flash=b.flash-dt end
    if b.phase=='enter' then
      if b.kind=='jxjq' then
        b.y = b.y + 70*dt
        if b.y>=110 then b.y=110 b.phase='fight' G.scrollSpd=N.scroll end
      else
        b.x = b.x - 90*dt
        if b.x<=360 then b.x=360 b.phase='fight' G.scrollSpd=N.scroll end
      end
    else
      if b.kind=='boss3' and b.phaseIdx>0 then
        if (b.aiT or 0)<=0 then
          b.aiT=3 b.tx=280+math.random()*100 b.ty=60+math.random()*140
        end
        b.aiT=b.aiT-dt*bfs
        b.x=b.x+(b.tx-b.x)*math.min(1,dt*0.5)
        b.y=b.y+(b.ty-b.y)*math.min(1,dt*0.5)
      elseif b.kind=='jxjq' then
        b.y = 110 + math.sin(b.pt*0.5)*16
        b.x = 300 + math.sin(b.pt*0.3)*24
      else
        b.y = 125 + math.sin(b.pt*0.9)*30
      end
      local cd = 2.4
      if b.kind=='boss2' then cd = b.phaseIdx>0 and 1.8 or 2.2
      elseif b.kind=='boss3' then cd = 1.8
      elseif b.kind=='jxjq' then cd = 2.0
      elseif b.kind=='black' then cd = b.phaseIdx==2 and 1.3 or 1.6
      elseif b.kind=='cw1' then cd = 2.0 end
      if b.patT>cd and G.lock<=0 and G.freezeT<=0 then
        b.patT=0 b.pat=(b.pat+1)%3
        if b.kind=='boss2' and b.pat==0 then
          for _,dy in ipairs({-40,0,40}) do
            local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY+dy, b.phaseIdx>0 and 172 or 150)
            eshoot(b, vx, vy)
          end
        elseif b.kind=='boss2' and b.pat==1 then
          b.win18=6 b.winT=0
        elseif b.kind=='boss2' then
          for _,a in ipairs({-0.3,0,0.3}) do
            local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY,150)
            local c2,s3 = math.cos(a), math.sin(a)
            eshoot(b, vx*c2-vy*s3, vx*s3+vy*c2)
          end
        elseif b.kind=='boss3' then
          if b.pat==0 then
            for _,dy in ipairs({-50,0,50}) do
              local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY+dy,190) eshoot(b,vx,vy)
            end
          elseif b.pat==1 then
            for i=0,5 do eshoot(b, -120, (i-2.5)*36, 'szd2') end
          else
            local n = b.phaseIdx>0 and 14 or 8
            for i=0,n-1 do
              local a = i/n*6.28 + b.pt
              eshoot(b, math.cos(a)*100, math.sin(a)*100, 'szd2')
            end
          end
        elseif b.kind=='jxjq' then
          if b.pat==0 then
            for _,dy in ipairs({-50,0,50}) do
              local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY+dy,170) eshoot(b,vx,vy)
            end
          elseif b.pat==1 then
            for i=0,7 do eshoot(b, -130, (i-3.5)*34, 'szd2') end
          else
            for _,a in ipairs({-0.5,-0.25,0,0.25,0.5}) do
              local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY,150)
              local c2,s3 = math.cos(a), math.sin(a)
              eshoot(b, vx*c2-vy*s3, vx*s3+vy*c2)
            end
          end
        elseif b.kind=='black' then
          if b.pat==0 then
            for i=0,7 do
              local a = (i-3.5)*0.18
              local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY,130)
              local c2,s3 = math.cos(a), math.sin(a)
              eshoot(b, vx*c2-vy*s3, vx*s3+vy*c2, 'szd2')
            end
          elseif b.pat==1 then
            for i=0,9 do
              local a = i/10*6.28 + b.pt
              eshoot(b, math.cos(a)*110, math.sin(a)*110, 'szd2')
            end
          else
            for _,dy in ipairs({-30,0,30}) do
              local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY+dy,185) eshoot(b,vx,vy)
            end
          end
        elseif b.kind=='cw1' then
          if b.pat~=1 then
            for i=0,4 do eshoot(b, -110, (i-2)*40, 'szd2') end
          else
            for _,dy in ipairs({-40,0,40}) do
              local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY+dy,160) eshoot(b,vx,vy)
            end
          end
        elseif b.pat==0 then
          for _,a in ipairs({-0.22,0,0.22}) do
            local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY,163)
            local c2,s3 = math.cos(a), math.sin(a)
            eshoot(b, vx*c2-vy*s3, vx*s3+vy*c2)
          end
        elseif b.pat==1 then
          for i=0,9 do
            local a = i/10*6.28 + b.pt
            eshoot(b, math.cos(a)*120, math.sin(a)*120, 'szd2')
          end
        else
          for i=0,2 do
            G.delayShots[#G.delayShots+1] = {t=i*0.12, offX=i*30-30}
          end
        end
      end
      if b.win18>0 then
        b.winT = b.winT - dt
        if b.winT<=0 then
          b.winT=0.36 b.win18=b.win18-1
          for _,dy in ipairs({-80,0,80}) do
            local vx,vy = aimvx(b.x,b.y,G.shipX,G.shipY+dy, b.phaseIdx>0 and 180 or 160)
            eshoot(b, vx, vy)
          end
        end
      end
      if G.invuln<=0 and G.lock<=0 and hit(b,{x=G.shipX,y=G.shipY,w=10,h=8}) then playerHit() end
    end
    if b.dead then
      onKill(b)
      G.boss = nil
    end
  end
  -- boss1 延迟瞄准三连
  for i=#G.delayShots,1,-1 do
    local ds = G.delayShots[i]
    ds.t = ds.t - dt
    if ds.t<=0 then
      table.remove(G.delayShots, i)
      if G.boss and not G.boss.dead then
        local vx,vy = aimvx(G.boss.x,G.boss.y,G.shipX+ds.offX,G.shipY,175)
        eshoot(G.boss, vx, vy)
      end
    end
  end
  -- 贯日巨剑推进
  if G.guanri then
    G.guanri.t = G.guanri.t - dt
    G.guanri.x = G.guanri.x + 156*dt
    G.guanri.y = G.shipY
    if G.guanri.t<=0 or G.guanri.x>FW+160 then G.guanri=nil end
  end
  -- 火凤推进（火羽拖尾）
  if G.phoenix2 then
    local p=G.phoenix2
    p.t=p.t-dt p.x=p.x+p.vx*dt p.y=G.shipY+math.sin(G.t*3)*60
    local s=alloc(pools.booms)
    if s then s.on,s.t,s.spark,s.x,s.y=true,0.35,true,p.x-50,p.y+(math.random()-.5)*50 s.c:SetActive(true) end
    if p.t<=0 or p.x>FW+60 then G.phoenix2=nil end
  end
  -- 子弹推进
  for _,b in ipairs(pools.bullets) do
    if b.on then
      b.x=b.x+b.vx*dt b.y=b.y+b.vy*dt
      if b.sine then b.sine.ph=b.sine.ph+dt*b.sine.freq b.y=b.y+math.cos(b.sine.ph)*b.sine.amp*dt end
      if b.pierce or (b.maxD and b.maxD>0) then b.dist=(b.dist or 0)+math.sqrt(b.vx*b.vx+b.vy*b.vy)*dt end
      if b.x>FW+30 or b.x<-30 or b.y<-20 or b.y>FH+20 or (b.maxD and b.maxD>0 and b.dist>b.maxD) then
        b.on=false b.c:SetActive(false)
      end
    end
  end
  bulletHits()
  -- 敌弹推进（护盾清弹/中弹/擦弹险中求道）
  for _,b in ipairs(pools.ebullets) do
    if b.on then
      if not b.frozen then
        b.x=b.x+b.vx*dt b.y=b.y+b.vy*dt
      end
      if G.shield>0 and hit(b,{x=G.shipX,y=G.shipY,w=45,h=45}) then
        b.on=false b.c:SetActive(false)
      elseif not b.frozen and G.invuln<=0 and G.lock<=0 and hit(b,{x=G.shipX,y=G.shipY,w=10,h=8}) then
        b.on=false b.c:SetActive(false) playerHit()
      elseif not b.frozen and G.invuln<=0 and G.neng>0 and dist2(b.x,b.y,G.shipX,G.shipY)<16 then
        G.chargeGraze = G.chargeGraze + 1
        if G.shipKey=='hongmao' and G.t>G.qiudaoCd then
          G.qiudaoCd = G.t+0.5
          fireSmallSwords(1, 'qiudao')
          G.neng = math.min(G.neng + cfg.ps*0.15, cfg.ps*1.5)
          traitFire('qiudao')
        end
      end
      if b.on and (b.x<-20 or b.x>FW+20 or b.y<-20 or b.y>FH+20) then
        b.on=false b.c:SetActive(false)
      end
    end
  end
  -- 道具
  for _,it in ipairs(pools.items) do
    if it.on then
      it.life = it.life - dt
      if it.kind=='bs' then
        if it.free then it.x=it.x+it.vx*dt it.y=it.y+it.vy*dt it.vx=it.vx*0.99 it.vy=it.vy*0.99 end
      else
        local vx,vy = aimvx(it.x,it.y,it.tx,it.ty,28)
        it.x=it.x+vx*dt it.y=it.y+vy*dt
        if dist2(it.tx,it.ty,it.x,it.y)<6 then
          it.tx=20+math.random()*350 it.ty=20+math.random()*200
        end
      end
      if hit(it,{x=G.shipX,y=G.shipY,w=26,h=20}) then
        it.life=-1
        G.stats.pick = G.stats.pick+1
        if it.kind=='pow' then
          sfx('pow')
          if G.lv<5 then
            G.lv=G.lv+1 syncWings()
            log('pow '..G.lv) say('武器升级 LV'..G.lv..'!')
          else
            G.score=G.score+1000 log('score '..G.score) say('满级 +1000 分')
          end
        elseif it.kind=='bom1' then
          sfx('pow')
          G.bomm=math.min(G.bomm+1,7) log('bomb '..G.bomm)
        elseif it.kind=='bs' then
          local fake={kind='bsx', hp=1, def={score=500}, x=it.x, y=it.y, w=14, h=14, dead=false, burn=0}
          onKill(fake)
        end
      end
      if it.life<=0 or it.x<-20 then it.on=false it.c:SetActive(false) end
    end
  end
  -- 特效衰减
  for _,s in ipairs(pools.booms) do
    if s.on then
      s.t=s.t-dt
      if s.t<=0 then s.on=false s.c:SetActive(false) end
    end
  end
  for _,f in ipairs(pools.floaters) do
    if f.on then
      f.t=f.t-dt f.y=f.y+(f.vy or 26)*dt
      if f.t<=0 then f.on=false f.c:SetActive(false) end
    end
  end
  -- 火凤伤害聚合冲刷（0.5s 一结）
  G.dmgAccT = G.dmgAccT - dt
  if G.dmgAccT<=0 then
    G.dmgAccT = 0.5
    for e,ad in pairs(G.dmgAcc) do
      if ad>=1 then dmgFloat(e.x, e.y, ad, 'skill', false) end
    end
    G.dmgAcc = {}
  end
  -- 边沿清理
  jEdge=false kEdge=false jUp=false
end

-- ===== 渲染同步 =====
-- ===== 选人屏隐藏对局 UI（状态沿触发，防对局控件/残留特效裸奔）=====
local gameplayHidden = false
local function setHudVis(show)
  for _,c in pairs(hud) do pcall(function() c:SetActive(show) end) end
end
local function setGameplayVis(show)
  local g = {G.shipC,G.flameC,G.guanriC,G.huofengC,G.shieldC,G.ringC1,G.ringC2,G.readyC,
    G.zmRingC,G.bsRingC,G.salvoC,G.bossC,G.freezeC,G.unlockT,G.tcT1,G.tcT2,G.tcT3}
  for _,c in ipairs(g) do if c then pcall(function() c:SetActive(show) end) end end
  for _,ws in ipairs(wingPool) do pcall(function() ws.c:SetActive(show) end) end
  for _,pk in ipairs({'enemies','items','bullets','ebullets','booms','floaters','orbit','msgs'}) do
    for _,s in ipairs(pools[pk] or {}) do pcall(function() s.c:SetActive((show and s.on) or false) end) end
  end
end
local function hideGameplayUI()
  if gameplayHidden then return end
  gameplayHidden = true
  setGameplayVis(false)
  setHudVis(false)
end
local function showGameplayUI()
  if not gameplayHidden then return end
  gameplayHidden = false
  setGameplayVis(true)
  setHudVis(true)
end

local function render()
  -- 选人屏
  if G.state=='select' then
    hideGameplayUI()
    if selPanel then
      for i=1,2 do
        local on = G.selIdx==i
        local img = selRefs['img'..i]
        local nm = selRefs['name'..i]
        local glow = selRefs['glow'..i]
        local bd = selRefs['bd'..i]
        if img then
          local a = ART[i==1 and 'hongmao' or 'lantu']
          img.imageColor = Color(a[4],a[5],a[6], on and 255 or 130)
          img:SetSizeDelta((on and 80 or 66)*K, (on and 86 or 72)*K)
        end
        if nm then nm.fontColor = Color(255,210,63, on and 255 or 130) end
        if glow then glow.imageColor = Color(i==1 and 255 or 110, i==1 and 180 or 200, i==1 and 60 or 255, on and 140 or 45) end
        if bd then bd.imageColor = on and Color(255,210,63,230) or Color(96,106,136,190) end
      end
    end
    return
  end
  showGameplayUI()
  destroySelect()
  -- 背景卷轴（双帧行走）
  local bw = G.bgW
  local off = G.scrollX % bw
  placeSize(G.bgC1, -off + bw/2, FH/2, bw, FH)
  placeSize(G.bgC2, -off + bw*1.5, FH/2, bw, FH)
  local ba = ART[G.bgKey]
  G.bgC1.imageColor = Color(ba[4],ba[5],ba[6],255)
  G.bgC2.imageColor = Color(ba[4],ba[5],ba[6],255)
  -- 玩家（无敌闪烁）+ 引擎焰
  local blink = G.invuln>0 and (math.floor(G.t*12)%2==0)
  G.shipC:SetVisible(not blink)
  place(G.shipC, G.shipX, G.shipY)
  local sa = ART[G.shipKey]
  G.shipC.imageColor = Color(sa[4],sa[5],sa[6],255)
  if not blink then
    placeSize(G.flameC, G.shipX-18, G.shipY, 10+math.random()*4, 11+math.random()*4)
    G.flameC:SetActive(true)
  else
    G.flameC:SetActive(false)
  end
  -- 僚机
  for _,ws in ipairs(wingPool) do
    if ws.on then place(ws.c, ws.x, ws.y) end
  end
  -- 银针环绕（装饰：min(needles,8) 椭圆轨道+深度感）
  local orbN = math.min(G.needles, #pools.orbit)
  local sc = 1 + 0.5*clamp(G.neng/math.max(1,N.ps.lantu),0,1)
  for i=1,#pools.orbit do
    local s = pools.orbit[i]
    if i<=orbN then
      local a = i/math.max(1,G.needles)*6.28 + G.t*1.6
      local z = math.sin(a)
      local x = G.shipX + math.cos(a)*40
      local y = G.shipY + z*17
      local k2 = (z<0 and 0.62 or 1)*sc
      s.on=true
      placeSize(s.c, x, y, 17*k2, 5*k2)
      s.c:SetActive(true)
      s.c.imageColor = Color(225,240,255, z<0 and 140 or 255)
    elseif s.on then
      s.on=false s.c:SetActive(false)
    end
  end
  -- 实体池位置
  for _,pool in ipairs({pools.bullets,pools.ebullets,pools.enemies,pools.items,pools.booms}) do
    for _,s in ipairs(pool) do
      if s.on then place(s.c, s.x, s.y) end
    end
  end
  for _,s in ipairs(pools.floaters) do
    if s.on then place(s.c, s.x, s.y) end
  end
  -- 敌机受击白闪/燃烧着色/冻结着色
  for _,e in ipairs(pools.enemies) do
    if e.on then
      local a = ART[e.kind] or ART.dj1
      if e.flash>0 then
        e.c.imageColor = Color(255,255,255,255)
      elseif (e.burn or 0)>0 then
        e.c.imageColor = Color(255, math.floor(a[5]*0.5), math.floor(a[6]*0.3), 255)
      elseif G.freezeT>0 then
        e.c.imageColor = Color(150, 210, 255, 200)
      else
        e.c.imageColor = Color(a[4],a[5],a[6],255)
      end
    end
  end
  -- boss（分相换肤）
  if G.boss then
    local b = G.boss
    local artKey = b.kind
    if b.kind=='boss2' then artKey = b.phaseIdx>0 and 'boss2b' or 'boss2' end
    if b.kind=='cw1' then artKey = 'cw' end
    if G.bossC then
      G.bossC:SetActive(true)
      local a = ART[artKey]
      G.bossC:SetImage(Enum.ImageSource.StaticReference, a[1])
      G.bossC.imageColor = (b.flash>0) and Color(255,255,255,255) or Color(a[4],a[5],a[6],255)
      G.bossC:SetSizeDelta(a[2]*K, a[3]*K)
      place(G.bossC, b.x, b.y)
    end
  elseif G.bossC then
    G.bossC:SetActive(false)
  end
  -- 待发针阵（示意）
  if G.salvo and G.salvo.n>0 then
    placeSize(G.salvoC, G.salvo.x, G.salvo.y, G.salvo.big and 32 or 20, G.salvo.big and 9 or 6)
    G.salvoC:SetActive(true)
  else
    G.salvoC:SetActive(false)
  end
  -- 贯日巨剑（厚度=命中带×1.15）
  if G.guanri then
    local th = math.max(12, G.guanri.w*1.15)
    placeSize(G.guanriC, G.guanri.x, G.guanri.y, 164, th)
    G.guanriC:SetActive(true)
  else
    G.guanriC:SetActive(false)
  end
  -- 火凤
  if G.phoenix2 then
    placeSize(G.huofengC, G.phoenix2.x, G.phoenix2.y, 120, 94)
    G.huofengC:SetActive(true)
  else
    G.huofengC:SetActive(false)
  end
  -- 护盾
  if G.shield>0 then
    place(G.shieldC, G.shipX, G.shipY)
    G.shieldC:SetActive(true)
    local a = ART.shield
    G.shieldC.imageColor = Color(a[4],a[5],a[6], clamp(G.shield/0.4,0,1)*0.8*255)
  else
    G.shieldC:SetActive(false)
  end
  -- 蓄力双环（70% 黄 / 150% 红 呼吸）
  local ps = N.ships[G.shipKey].ps
  if G.neng>=0.7*ps and G.state=='playing' and G.lv>1 then
    local red = G.neng>=1.5*ps
    local r1 = 20 + 4*math.sin(G.t*8)
    placeSize(G.ringC1, G.shipX, G.shipY, r1*2, r1*2)
    placeSize(G.ringC2, G.shipX, G.shipY, (r1+3)*2, (r1+3)*2)
    local cr = red and 255 or 255
    local cg = red and 90 or 210
    local cb = red and 74 or 63
    local al = 0.55+0.25*math.sin(G.t*8)
    G.ringC1.imageColor = Color(cr,cg,cb, al*255)
    G.ringC2.imageColor = Color(cr,cg,cb, al*0.6*255)
    G.ringC1:SetActive(true) G.ringC2:SetActive(true)
  else
    G.ringC1:SetActive(false) G.ringC2:SetActive(false)
  end
  -- 出鞘金环
  if G.readyFx>0 then
    local k3 = 1 - G.readyFx/0.14
    placeSize(G.readyC, G.shipX+16, G.shipY, 6+k3*22, 6+k3*22)
    G.readyC:SetActive(true)
  else
    G.readyC:SetActive(false)
  end
  -- 冰封霜爆罩
  if G.freezeT>0 then
    G.freezeC:SetActive(true)
    G.freezeC.imageColor = Color(150,220,255, clamp(G.freezeT/3,0,1)*0.5*255)
    placeSize(G.freezeC, FW/2, FH/2, FW*0.9, FH*0.9)
  else
    G.freezeC:SetActive(false)
  end
  -- 悟·大字
  if G.unlockFx then
    settxt(G.unlockT, '悟 · '..G.unlockFx.n)
    place(G.unlockT, FW/2, math.max(40, FH-70-(1-G.unlockFx.t/2.5)*30))
    G.unlockT:SetActive(true)
  else
    G.unlockT:SetActive(false)
  end
  -- HUD
  local sTxt = tostring(G.score)
  if hud.score.text ~= sTxt then settxt(hud.score, sTxt) end
  local lTxt = 'LV'..G.lv
  if hud.lv.text ~= lTxt then settxt(hud.lv, lTxt) end
  local nU = 0
  for _,c in ipairs(CODEX) do if codexUnlocked[c[1]] then nU=nU+1 end end
  local cTxt = '悟 '..nU..'/'..#CODEX
  if hud.codex.text ~= cTxt then settxt(hud.codex, cTxt) end
  local bTxt = '宝×'..G.bomm
  if hud.bomb.text ~= bTxt then settxt(hud.bomb, bTxt) end
  local fTxt = '命×'..math.max(0,G.life)
  if hud.life.text ~= fTxt then settxt(hud.life, fTxt) end
  -- 蓄能条（三段色+按 fill）
  local mx = clamp(G.neng/(ps*1.5),0,1)
  local fc1,fc2,fc3 = 100,100,110
  if G.fashez<=0 then
    if G.neng>=ps*1.5 then fc1,fc2,fc3=255,90,74
    elseif G.neng>=ps*0.7 then fc1,fc2,fc3=255,210,63
    else fc1,fc2,fc3=79,168,255 end
  end
  hud.charge.imageColor = Color(fc1,fc2,fc3,255)
  hud.charge:SetFillHorizontal(Enum.ImageFillHorizontalType.Left, mx)
  hud.hp:SetFillHorizontal(Enum.ImageFillHorizontalType.Left, clamp(G.life/4,0,1))
  -- 针匣存量
  if G.shipKey=='lantu' then
    local nzTxt = '针'..G.needles..'/'..(G.lv*(2+G.lv))
    if hud.needle.text ~= nzTxt then settxt(hud.needle, nzTxt) end
    hud.needle:SetActive(true)
    local full = G.needles>=G.lv*(2+G.lv)
    hud.needle.fontColor = Color(159,232,255, full and 255 or 170)
  else
    hud.needle:SetActive(false)
  end
  -- boss 血条（分相按总血量口径）
  if G.boss and G.boss.phase=='fight' then
    hud.bossBar:SetActive(true)
    hud.bossBar:SetFillHorizontal(Enum.ImageFillHorizontalType.Left,
      clamp(math.max(G.boss.hp,0)/G.boss.def.hp,0,1))
  else
    hud.bossBar:SetActive(false)
  end
  -- 满匣寒光/背水血环
  if G.shipKey=='lantu' and G.needles>=G.lv*(2+G.lv) then
    local r = 22+math.sin(G.t*5)*3
    placeSize(G.zmRingC, G.shipX, G.shipY, r*2, r*2)
    G.zmRingC:SetActive(true)
  else
    G.zmRingC:SetActive(false)
  end
  if G.life==1 then
    local r = 24+math.sin(G.t*6)*3
    placeSize(G.bsRingC, G.shipX, G.shipY, r*2, r*2)
    G.bsRingC:SetActive(true)
  else
    G.bsRingC:SetActive(false)
  end
  -- 特性光环（触发亮起 0.6s）
  local auraIds = {'yizhen','guiqia','xinhuo','renjian','qiudao','zhenman','beishui'}
  local auraCol = {yizhen={127,216,255}, guiqia={143,255,224}, xinhuo={255,179,102},
    renjian={255,209,102}, qiudao={255,255,255}, zhenman={159,232,255}, beishui={255,107,107}}
  for _,id in ipairs(auraIds) do
    local c = G.fxAura[id]
    local ctl = G.auraC[id]
    if c and c>0 and ctl then
      local r = 20+math.sin(G.t*6)*3
      placeSize(ctl, G.shipX, G.shipY, r*2, r*2)
      local col = auraCol[id]
      ctl.imageColor = Color(col[1],col[2],col[3], 140)
      ctl:SetActive(true)
    elseif ctl then
      ctl:SetActive(false)
    end
  end
  -- 消息队列堆叠
  local mi = 0
  for _,m in ipairs(pools.msgs) do
    if m.on then
      mi = mi + 1
      place(m.c, FW/2, FH-100-(mi-1)*18)
    end
  end
  -- 特性教学卡（定格）
  if G.traitCard then
    local t = TRAITS[G.traitCard]
    settxt(G.tcT1, '✦ 特性 · '..t[1])
    settxt(G.tcT2, '『'..t[2]..'』 '..t[3])
    settxt(G.tcT3, '按 K 继续（触屏点击）· 已获 1.5 秒无敌')
    G.tcT1:SetActive(true) G.tcT2:SetActive(true) G.tcT3:SetActive(true)
  else
    G.tcT1:SetActive(false) G.tcT2:SetActive(false) G.tcT3:SetActive(false)
  end
end

-- ===== Debug 信号 =====
local function regDebug()
  local function reg(name, fn)
    script:RegisterServerSignalHandler(name, function(sig, params)
      pcall(fn, params or {})
    end)
  end
  reg('DebugAutoPlay', function(p) G.autoPlay = (p[1] or 1)==1 if G.autoPlay then G.invuln=99 end end)
  reg('DebugSkipToBoss', function()
    for _,e in ipairs(pools.enemies) do
      if e.on and not e.isMid then e.on=false e.c:SetActive(false) end
    end
    local L = LEVELS[G.levelIdx]
    for i=1,#L.waves do
      if L.waves[i].boss then G.wave = i-1 break end
    end  -- 已刷到 boss 前一波，spawnWave 下一波=boss
    spawnWave()
    G.waveGap = 999
  end)
  reg('DebugKillBoss', function()
    if G.boss then damage(G.boss, 1e9) end
    for _,e in ipairs(pools.enemies) do
      if e.on and not e.dead and e.isMid then damage(e, 1e9) end
    end
  end)
  reg('DebugDamage', function()
    G.invuln=0 playerHitRaw()
  end)
  reg('DebugSetLife', function(p) G.life = p[1] or 4 end)
  reg('DebugGrantPow', function(p) G.lv = clamp(p[1] or 1,1,5) log('pow '..G.lv) syncWings() end)
  reg('DebugGrantBomb', function(p) G.bomm = p[1] or 3 end)
  reg('DebugNoop', function() end)
  reg('DebugInvuln', function(p) G.invuln = p[1] or 999 end)
  reg('DebugGotoLevel', function(p)
    if G.state~='select' then
      loadLevelState(clamp(p[1] or 1, 1, #LEVELS))
      G.state='playing'
    end
  end)
end

-- ===== 生命周期 =====
function OnInit()
  CW, CH = game.GetUICanvasSize()
  K = CW / FW
  HX, HY = CW/2, CH/2
end
function OnStart()
  script.object.showCursor = true
  CW, CH = game.GetUICanvasSize()
  K = CW / FW
  HX, HY = CW/2, CH/2
  resetState()
  -- 全屏光标区（z 最低）：触屏拖动/点选/特性卡关闭
  G.fieldArea = mkc(T_CURSOR, 'FieldArea')
  G.fieldArea:SetAnchoredPosition(0, 0)
  G.fieldArea:SetSizeDelta(CW, CH)
  G.fieldArea:AddCursorEventListener(Enum.CursorEventType.CursorDown, function(ev)
    local ok, x, y = pcall(function() return ev:GetUIPos() end)
    if not ok or not x then return false end
    local gx, gy = x/K, y/K
    if G.traitCard then
      G.traitCard=nil
      G.invuln = math.max(G.invuln, 1.5)
      return false
    end
    if codexOpen then toggleCodex() return false end
    if G.state=='select' then
      G.selIdx = gx > FW/2 and 2 or 1
      startRun()
      return false
    end
    if G.state=='playing' then
      touch.on=true touch.x=gx touch.y=gy
    end
    return false
  end)
  G.fieldArea:AddCursorEventListener(Enum.CursorEventType.CursorMove, function(ev)
    if not touch.on then return false end
    local ok, x, y = pcall(function() return ev:GetUIPos() end)
    if ok and x then touch.x, touch.y = x/K, y/K end
    return false
  end)
  G.fieldArea:AddCursorEventListener(Enum.CursorEventType.CursorUp, function()
    touch.on=false
    return false
  end)
  -- 池（z 序：敌→道具→玩家→弹→敌弹→特效→飘字→HUD）
  pools.enemies = mkpool(30, function() return imgc('dj1','enemy') end)
  pools.items = mkpool(22, function() return imgc('pow','item') end)
  pools.bullets = mkpool(110, function() return imgc('changhong','pbullet') end)
  pools.ebullets = mkpool(140, function() return imgc('szd','ebullet') end)
  pools.booms = mkpool(36, function() return imgc('boom','fx') end)
  pools.floaters = mkpool(26, function() return txtc('', 12, 255,255,255,'floater') end)
  pools.orbit = mkpool(8, function() return imgc('yinzhen','orbit') end)
  pools.msgs = {}
  for i=1,4 do
    local c = txtc('', 14, 255,224,138, 'msg'..i)
    c:SetActive(false)
    table.insert(pools.msgs, {c=c, on=false, t=0, life=0})
  end
  -- 背景
  G.bgC1 = imgc('bg', 'Bg1')
  G.bgC2 = imgc('bg', 'Bg2')
  placeSize(G.bgC1, FW/2, FH/2, FW, FH)
  placeSize(G.bgC2, FW/2, FH/2, FW, FH)
  -- 僚机
  wingPool = {}
  for i=1,4 do
    local c = imgc('wingH', i==1 and 'OptionControl' or 'wing'..i)
    table.insert(wingPool, {c=c, x=0, y=0, on=false, fireCd=0, bspd=250, k=1})
  end
  -- 玩家与特效
  G.shipC = imgc('hongmao', 'Player')
  G.shipC:SetActive(false)
  G.flameC = imgc('flame', 'Flame')
  G.flameC:SetActive(false)
  G.guanriC = imgc('guanri', 'GuanriSword')
  G.guanriC:SetActive(false)
  G.huofengC = imgc('huofeng', 'PhoenixFire')
  G.huofengC:SetActive(false)
  G.shieldC = imgc('shield', 'ShieldFx')
  G.shieldC:SetActive(false)
  G.ringC1 = imgc('ring', 'Ring1')
  G.ringC1:SetActive(false)
  G.ringC2 = imgc('ring', 'Ring2')
  G.ringC2:SetActive(false)
  G.readyC = imgc('ring', 'ReadyFx')
  G.readyC:SetActive(false)
  G.zmRingC = imgc('ring', 'ZmRing')
  G.zmRingC:SetActive(false)
  G.bsRingC = imgc('ring', 'BsRing')
  G.bsRingC:SetActive(false)
  G.auraC = {}
  for _,id in ipairs({'yizhen','guiqia','xinhuo','renjian','qiudao','zhenman','beishui'}) do
    local c = imgc('ring', 'Aura'..id)
    c:SetActive(false)
    G.auraC[id] = c
  end
  G.salvoC = imgc('yinzhen', 'SalvoPend')
  G.salvoC:SetActive(false)
  G.bossC = imgc('boss1', 'Boss')
  G.bossC:SetActive(false)
  G.freezeC = imgc('bingfeng', 'FreezeFx')
  G.freezeC:SetActive(false)
  -- 特性教学卡文本
  G.tcT1 = txtc('', 24, 255,209,102, 'TraitCardT1')
  G.tcT1:SetActive(false)
  G.tcT2 = txtc('', 11, 143,211,168, 'TraitCardT2')
  G.tcT2:SetActive(false)
  G.tcT3 = txtc('', 11, 143,162,186, 'TraitCardT3')
  G.tcT3:SetActive(false)
  -- HUD
  hud.score = txtc('第1关 0', 11, 255,255,255, 'ScoreText')
  place(hud.score, 58, 241)
  hud.lv = txtc('LV1', 11, 255,220,140, 'LvText')
  place(hud.lv, 126, 241)
  hud.codex = txtc('悟 0/'..#CODEX, 11, 180,190,210, 'CodexText')
  place(hud.codex, 196, 241)
  hud.bomb = txtc('宝×3', 11, 255,200,120, 'BombText')
  place(hud.bomb, 258, 241)
  hud.life = txtc('命×4', 11, 255,140,140, 'LifeText')
  place(hud.life, 322, 241)
  hud.needle = txtc('针0/3', 10, 159,232,255, 'NeedleText')
  place(hud.needle, 378, 241)
  hud.needle:SetActive(false)
  hud.cbg = imgc('bar', 'ChargeBg')
  local cbg = hud.cbg
  cbg.imageColor = Color(40,48,70,255)
  placeSize(cbg, 60, 229, 60, 7)
  hud.charge = imgc('bar', 'ChargeFill')
  hud.charge.imageColor = Color(120,200,255,255)
  placeSize(hud.charge, 60, 229, 60, 7)
  hud.hbg = imgc('bar', 'HpBg')
  local hbg = hud.hbg
  hbg.imageColor = Color(40,48,70,255)
  placeSize(hbg, FW/2, 231, 90, 6)
  hud.hp = imgc('bar', 'HpBar')
  hud.hp.imageColor = Color(120,255,140,255)
  placeSize(hud.hp, FW/2, 231, 90, 6)
  hud.bbg = imgc('bar', 'BossBg')
  local bbg = hud.bbg
  bbg.imageColor = Color(48,26,32,255)
  placeSize(bbg, FW/2, 10, 320, 8)
  hud.bossBar = imgc('bar', 'BossFill')
  hud.bossBar.imageColor = Color(255,80,80,255)
  placeSize(hud.bossBar, FW/2, 10, 320, 8)
  hud.bossBar:SetActive(false)
  G.unlockT = txtc('', 20, 255,210,63, 'UnlockText')
  G.unlockT:SetActive(false)
  -- 悟之录按钮（C 键替代：常驻按钮）
  local cb = mkc(T_BTN, 'CodexBtn')
  hud.codexBtn = cb
  placeSize(cb, FW-30, FH-14, 46, 18)
  cb:AddCursorEventListener(Enum.CursorEventType.CursorClick, function() toggleCodex() end)
  local cbt = txtc('悟之录', 10, 255,210,63, 'CodexBtnTx')
  hud.codexBtnTx = cbt
  place(cbt, FW-30, FH-14)
  -- 重开按钮
  local rb = mkc(T_BTN, 'RestartBtn')
  hud.restartBtn = rb
  placeSize(rb, FW-40, FH-38, 56, 22)
  rb:AddCursorEventListener(Enum.CursorEventType.CursorClick, function()
    if G.state~='select' then
      hideResult()
      resetState() freePools() destroySelect() buildSelect()
      log('restart') log('game_start') log('boot ok')
    end
  end)
  local rbt = txtc('重开', 10, 200,210,230, 'RestartBtnTx')
  hud.restartBtnTx = rbt
  place(rbt, FW-40, FH-38)
  -- 炸弹按钮（触屏 K 替代）
  local bb = mkc(T_BTN, 'BombBtn')
  hud.bombBtn = bb
  placeSize(bb, FW-34, 26, 46, 26)
  bb:AddCursorEventListener(Enum.CursorEventType.CursorClick, function() tryBomb() end)
  local bbt = txtc('宝', 12, 255,200,120, 'BombBtnTx')
  hud.bombBtnTx = bbt
  place(bbt, FW-34, 26)
  -- 键盘监听（全键面）
  local KE = Enum.KeyEventType
  local keyMap = {
    {KE.KeyboardCraftspersonKey19Down, 'j', true}, {KE.KeyboardCraftspersonKey19Up, 'j', false},
    {KE.KeyboardCraftspersonKey20Down, 'k', true}, {KE.KeyboardCraftspersonKey20Up, 'k', false},
    {KE.KeyboardMoveLeftKeyDown, 'left', true}, {KE.KeyboardMoveLeftKeyUp, 'left', false},
    {KE.KeyboardMoveRightKeyDown, 'right', true}, {KE.KeyboardMoveRightKeyUp, 'right', false},
    {KE.KeyboardMoveForwardKeyDown, 'up', true}, {KE.KeyboardMoveForwardKeyUp, 'up', false},
    {KE.KeyboardMoveBackwardKeyDown, 'down', true}, {KE.KeyboardMoveBackwardKeyUp, 'down', false},
    {KE.KeyboardCraftspersonKey36Down, 'up', true}, {KE.KeyboardCraftspersonKey36Up, 'up', false},
    {KE.KeyboardCraftspersonKey37Down, 'down', true}, {KE.KeyboardCraftspersonKey37Up, 'down', false},
    {KE.KeyboardCraftspersonKey38Down, 'left', true}, {KE.KeyboardCraftspersonKey38Up, 'left', false},
    {KE.KeyboardCraftspersonKey39Down, 'right', true}, {KE.KeyboardCraftspersonKey39Up, 'right', false},
    {KE.KeyboardCraftspersonKey11Down, 'enter', true}, {KE.KeyboardCraftspersonKey11Up, 'enter', false},
    {KE.KeyboardCraftspersonKey1Down, 'dbg1'}, {KE.KeyboardCraftspersonKey2Down, 'dbg2'},
    {KE.KeyboardCraftspersonKey3Down, 'dbg3'}, {KE.KeyboardCraftspersonKey4Down, 'dbg4'},
    {KE.KeyboardCraftspersonKey5Down, 'dbg5'},
  }
  for _,m in ipairs(keyMap) do
    local nm, dn = m[2], m[3]
    script.object:AddKeyEventListener(m[1], function()
      if nm=='dbg1' then G.lv=1 syncWings() log('pow 1')
      elseif nm=='dbg2' then G.lv=2 syncWings() log('pow 2')
      elseif nm=='dbg3' then G.lv=3 syncWings() log('pow 3')
      elseif nm=='dbg4' then G.lv=4 syncWings() log('pow 4')
      elseif nm=='dbg5' then G.lv=5 syncWings() log('pow 5')
      else onKey(nm, dn) end
      return false
    end)
  end
  -- 光标监听已挂 FieldArea（见 OnStart 头部）
  -- Debug 信号
  regDebug()
  -- 选人面板
  buildSelect()
  log('game_start')
  log('boot ok')
  script:EnableUpdate(true)
end
function OnUpdate(dt)
  if dt > 0.1 then dt = 0.1 end
  acc = acc + dt
  local n = 0
  while acc >= STEP and n < 4 do
    tick(STEP)
    acc = acc - STEP
    n = n + 1
  end
  render()
end
