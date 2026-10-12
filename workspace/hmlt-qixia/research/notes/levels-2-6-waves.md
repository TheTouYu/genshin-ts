# 《虹猫蓝兔七侠传》关卡 2–6 波次/怪物/出怪逻辑全数据表

> 数据源：`research/extract/as/scripts/`（FFDec 导出脚本树，只读）+ `research/extract/dumpswf.txt`（tag 级反查）。
> 格式对齐关 1 报告（`charge-and-feedback-report.md` §5）。帧号 × 25fps = 时刻（秒），从**导演精灵第一帧**起算。
> 所有坐标为 **原值顶左坐标系**（SWF stage 顶左原点，Y 向下；播放区约 400×300，右屏外 x≥410）。
> 原始 dump 备份：`research/notes/.scratch-directors-dump.md`（22 个精灵全量脚本）。

---

## 0. 结构总纲（六关通用，先读此节）

### 0.1 控制器 → 开场卡 → 导演 三级启动链

```
主时间轴 frame_7/10/13/16/19/22:
  bjsd=4; bj=1; bjgs=0; pass=0;  attachMovie("one~six",…,9990); stop();
    （frame_22 另有 yc=0——cw 逃脱旗标复位）

控制器 one~six = chid 382/250/293/299/282/388，frame_1:
  stop();
  attachMovie("cj~cj6","cj"+bj,bj++) @(-2,118)     ← 关卡背景
  按 _root.xr 挂 fj~fj4（实例名统一 "fj"，深度 8000）
  frame_1 同时静态摆放【开场卡】103 帧标题精灵（关1-6 依次 chid 371/229/286/297/254/386）

开场卡 frame_103:  stop(); with(_parent) nextFrame();   ← 推进控制器到 frame_2
控制器 frame_2:   PlaceObject2 导演 + RemoveObject 开场卡
```

**导演固定在关卡开始 ~103 帧（4.1s 开场卡）后才启动。** 本表帧号 = 导演自身帧号；换算关卡绝对时刻请 +4.1s。

### 0.2 门闩与延时语法（三种）

| 语法 | 长相 | 使用关卡 |
|---|---|---|
| **diren 击杀门闩** | 放波帧 `diren=N`；数帧后 `if(diren<=0) play(); else gotoAndPlay(循环回帧);` | 关1（18 处，纯门闩）、**关3（8 处，混合）** |
| **t 计数延时** | `t=0;` … `if(t>25){t=0;play()}else{t+=1;gotoAndPlay(回帧)}` | **关2/关4/关5/关6 全部采用（0 处 diren）——纯时间驱动** |
| **bos 门闩** | `bos=1;` 挂中/大 boss；`if(bos<=0) play() else gotoAndPlay(回帧)` | 所有中 boss/大 boss 段（关2/3/4/5/6） |

> **节奏范式按关分化（重要复刻结论）**：只有关 1 与关 3 的部分波是"清完才放下一波"（自适应节奏）；关 2/4/5/6 是固定时刻表，玩家强则提前清屏、弱则被堆屏碾压。

### 0.3 J 键对话卡（stop() 的真身）

导演中段的裸 `stop()` 帧同帧 PlaceObject2 一张对话精灵（281 的 f99/f112/f130/f189/f328 摆 268/271/274/277/280；292 的 f85 摆 291）。对话卡结构统一：

```actionscript
// chid 268/271/274/277/280/291 同构
frame_1:  _root.dong = 2;            // 锁玩家输入 + 全屏清敌弹
frame_35: stop(); + PlaceObject2(DefineButton2_267)   // 等玩家
//   Button267: on(release, keyPress "j"/"J") { play(); }
frame_41: with(_parent) { _root.dong = 0; play(); }   // 解锁并推进导演
```

281/f112 特例：`if(_root.yc == 0) play(); else stop();` —— cw 被玩家提前击杀（yc=0）时跳过该对话卡。

### 0.4 环境刷怪器（与波次表并行的常驻出怪）

| 刷怪器 chid | 刷什么 | 出生点 | 挂载位置 |
|---|---|---|---|
| 372 | dj1 杂兵 | (450, random(150)+40) 右缘 | 关1（one frame_2） |
| **235** | **lfj 蜻蜓** | (450, random(150)+60) 右缘 | **关2/关4**（249/298 frame_1 dpt2；298 f309/f342 重摆） |
| **255** | **dxdd 鱼雷×2** | (random(170)+200, **320) 屏幕底部** | **关5**（281 frame_1 dpt2；f59/f109/f140/f205 每个中 boss 段后重摆） |

三件同款语法：`cj=random(10); if(cj==0) gotoAndPlay(15);`（3 帧一掷 10%）→ f16 一次 attachMovie → 回 f1。期望刷新率 ≈ 0.83 只/秒（dxdd 为双倍批量）。

### 0.5 读码陷阱

- **实例名 ≠ 语义名**：导演 attachMovie 的实例名是复用池名——dj4 挂成 `"nq"+i`、jbdj 挂成 `"dj3"+i`、jbfjg/lsfj 挂成 `"nq"+i`、boss2/jxjq 挂成 `"dj4"+i`、black 挂成 `"dj4"`（深度 2999，独占）。**判怪种只看 attachMovie 第一参数（linkage 名）。**
- 坐标写在 attach 后一行：`_root["nq"+_root.i]._x/_y = ...`（注意 `_root.i` 已 ++，实际引用的是刚挂的实例）。
- 敌方受击模板统一（hitbox 子件 chid 57@dptN，四套 enterFrame）：玩家弹扫 `_root.x+(i-0..19)` 各扣 zdlv、bom1 按机体 xr 扣 50/200/30/40/60、fhm1 凤凰 2/帧、fhm2 5×lv、`pass==1` 自删。受击白闪 `gotoAndPlay(3)`，血尽 `gotoAndPlay(10)` 起死亡段。

---

## 1. 关 2（控制器 two=250，导演 DefineSprite_249，尾 boss boss2=78）

背景 cj2。开场卡 229。导演 frame_1 静态摆 231（装饰）+ **235（lfj 环境刷怪器）**。**纯时间驱动，0 处 diren。**

### 1.1 导演 249 完整帧表

```actionscript
// f1:   t = 0;
// f5:   延时门：t>25 → gotoAndPlay(10)（即首波前 ~26 帧缓冲）
// f21:  nq ×2 @ (430,80) (430,120)                       [0.84s]
// f25:  t=0; f37: t>30 → play（31 帧延时）                [~1.5s]
// f57:  dj3 ×1 @ (440,190)                                [2.28s]
// f64:  t=0; f75: t>20 → play（21 帧延时）
// f103: dj4 ×3 @ (410,60) (430,120) (430,190)   实例名"nq"+i  [4.12s]
// f110: t=0; f122: t>=30 → play
// f133: nq ×2 @ (410,100) (410,190)
// f188: nq ×2 @ (430,50) (430,120)
// f195: t=0; f208: t>20 → play
// f226: nq ×2 @ (430,110) (430,170)
// f228: t=0; f233: t>30 → play
// f245: dj3 ×1 @ (440,110)
// f247: t=0; f253: t>50 → play（51 帧大留白）
// f280: jbdj @ (440,70)     实例名"dj3"+i
// f282: t=0; f287: t>20 → play
// f290: jbdj @ (440,110)
// f292: t=0; f296: t>30 → play
// f300: jbdj @ (440,170)
// f302: t=0; f306: t>50 → play
// f309: nq ×2 @ (430,50) (430,200)
// f311: t=0; f316: t>40 → play
// f318: nq ×2 @ (430,100) (430,150)
// f320: t=0; f326: t>35 → play
// ——— 中 boss 段 ———
// f327: _root.bos = 1;
// f328: jbfjg @ (450,0)                       实例名"nq"+i [13.1s]
// f335: bos 门闩：bos<=0 ? play : gotoAndPlay(331)
// ——— lsfj 编队 ———
// f342: lsfj ×2 @ (450,50) (450,100)          实例名"nq"+i
// f343: t=0; f350: t>35 → play
// f353: lsfj @ (450,150)
// f354: t=0; f362: t>30 → play
// f365: lsfj ×2 @ (450,50) (450,180)
// f366: t=0; f371: t>35 → play
// f374: dj3 @ (440,120)
// f375: t=0; f381: t>40 → play
// ——— 尾 boss 前奏（三段式）———
// f384: _root.dong = 2;        ← 锁控+清弹窗口
// f385: _root.dong = 0;
// f418: stopAllSounds();       ← 停音乐
// f419: _root.bjsd = 7;        ← 卷轴 4→7 提速（boss 逼近演出）
// f421: _root.bos = 1;
// f422: boss2 @ (450,0)        实例名"dj4"+i [16.9s]
// f429: bos 门闩：bos<=0 ? play : gotoAndPlay(425)
// f430: stop(); + PlaceObject2(248 过关卡)
```

### 1.2 关 2 怪物清单

| 怪（chid） | 尺寸 | 血 a | zdsd(round1/2) | 分值 | 掉落 | 移动 |
|---|---|---|---|---|---|---|
| nq (207) | 28×29 | 150 | 5/7 | 300 | bs×2（死亡帧 f18） | 无脚本移动（补间待参数化）；子件 203@12 = 旋转炮塔：`±5°/帧`追踪玩家 y，clamp [-15°,40°] |
| lsfj (87) | 30.3×41.9 | 150/200 | 6/8 | 200 | bs×1 | 悬停炮台，无移动脚本 |
| jbdj (194) | 88×62 | 300 | 5/7 | **500** | f16 `diao=random(10); if(diao<3)` → **pow 30% 概率**；否则 bs×3 | 无脚本移动 |
| dj3 (356)/dj4 (336)/dj2 (366) | — | 500 / 200/100 / 300/250 | 8/6 | 300 | dj3→pow；dj4→b=random(2) 概率 bs；dj2→bs×2 | 关1 已知（白皮书 §3），本关复用 |
| lfj (221) 环境怪 | 35×15 | **a=1** | 5/6 | 15 | 无 | **有脚本**：57_5 子件 `_x -= fxsd`（fxsd=random(3)+5，5–7px/帧）至 x<-10 自删 |

### 1.3 中 boss jbfjg（金鞭飞蛟怪，185）

`frame_1`: `_width=132.1; _height=84.3; round>1 ? a=2000,zdsd=8 : a=1700,zdsd=7`。
死亡：`frame_36 _root.soc += 2000; _root.bos -= 1;`（**分值 2000，全中 boss 最高**）`frame_37: 掉 bom1 + pow`。
武器 = 子件 **184@f1 dpt8**：`fashe=random(20)`，==0/1 → gotoAndPlay(5)（连发段，发射帧见 `DefineSprite_184/frame_5+`）。
移动：无脚本（时间轴补间，从 y=0 顶部垂下）。

### 1.4 尾 boss boss2（78）

| 阶段 | 帧号 | 血(round1/round2) | hitbox |
|---|---|---|---|
| P1 | f1（`zdsd=6; _width=78; _height=107`） | 2000 / 2200 | 57@dpt14 |
| P2 | f46 | 2000 / 2500 | **PlaceObject2_57_16 第二套**（受击 f48/死亡 f55 起算） |

- P1 死亡：`f13 _root.soc += 1000;`（原地转 P2，不清弹）。最终死亡：`f109 soc += 1500; bos -= 1;` → `f110–f117` 掉 **bs×6 + pow×1**（f113）。
- 武器 = 子件 **62@f1 dpt18**（自 P1 常驻）：`fashe=random(20)` 双分支——
  - `==1 → f19`：mhb 三连瞄准（czjl = 玩家y差 / ±40 / ±40），速度混合 9 / zdsd / 8；
  - `==0 → f5`：mhb 三连（玩家y差 / **±80** / **±80**）× gs 计数循环（f14 `gs>5 ? gotoAndPlay(40) : gs+=1,gotoAndPlay(6)`，每轮 f11 延时 3 帧）——**6 轮 × 3 发 = 18 连发弹幕窗**。
  - 弹从 `with(_parent)` 即 boss 本体位置发出，速度向量 = (dx,dy)/|d| × 速度。

---

## 2. 关 3（控制器 three=293，导演 292，中 boss jdlj=111，尾 boss boss3=170）

背景 cj3。开场卡 286。导演 frame_1 摆 231。**混合驱动：8 处 diren 门闩 + t 延时并存。** f85 有 J 对话卡（291）。

### 2.1 导演 292 完整帧表

```actionscript
// f1:  t=0;  f5: t>1 → gotoAndPlay(10)（极短缓冲）
// f10: jxr1 @ (460,50)【实例"jxr1"+i】 + lsfj @ (430,190)【实例"dj4"+i】
// f11: _root.diren = 2;
// f15: diren 门闩：diren<=0 ? play : gotoAndPlay(13)     ← 清完才放
// f22: lsfj ×2 @ (400,50) (420,100)
// f23: t=0; f30: t>=30 → play
// f35: dj4 ×2 @ (400,100) (410,190)
// f36: t=0; f44: t>=30 → play
// f46: jxr1 @ (420,50);  f47: diren=1;  f52: 门闩(回50)
// f54: jxr1 ×2 @ (430,150) (450,80);  f56: diren=2;  f62: 门闩(回59)
// f71: dj3 @ (440,50) + nq2 @ (440,100) + nq2 @ (440,160)
// f73: t=0; f81: t>=30 → play
// f85: stop(); + FrameLabel + PlaceObject2(291 对话卡)   ← J 键续关 [3.4s]
// f87: jdlj @ (430,120)【实例"jbdj"+i】;  f88: bos=1
// f92: bos 门闩：bos<=0 ? play : gotoAndPlay(89)
// f94: t=0; f102: t>=20 → play
// f106: dgp @ (430,50);  f107: t=0; f116: t>=25 → play
// f132: dgp @ (460,80);  f133: t=0; f140: t>30 → play
// f151: nq2 ×4 @ (430,190) (430,150) (430,100) (430,50)  ← 纵列满编 [6.0s]
//      —— f151→f226 空转 75 帧（3s 长留白/Scroll 段）——
// f226: nq2 @ (430,130) + nq2 @ (430,60) + nq @ (430,100)【均实例"nq"+i】
// f228: t=0; f233: t>40 → play
// f245: dj3 @ (440,100) + dj4 @ (440,50) + dj4 @ (440,150)【均实例"dj3"+i】
// f247: diren = 3;  f253: 门闩(回248)
// f262: dgp @ (430,120);  f264: t=0; f275: t>20 → play
// f280: jxr1 ×2 @ (440,180) (430,70)
// f282: t=0; f287: t>50 → play
// f290: dj4 ×2 @ (430,190) (400,50)
// f292: t=0; f298: t>30 → play
// ——— 尾 boss 前奏三段式 ———
// f301: dong=2;  f302: dong=0;
// f335: stopAllSounds();  f336: bjsd=7;
//      f303–f306: PlaceObject2 240@166 / 157@148 / 106@1（boss 逼近过场美术）
// f338: bos=1;
// f339: boss3 @ (306.5, 85)【实例"boss3"+i——唯一语义命名】  [13.6s]
// f347: bos 门闩：bos<=0 ? play : gotoAndPlay(345)
// f348: stop(); + PlaceObject2(248)
```

### 2.2 关 3 新怪

| 怪（chid） | 尺寸 | 血 | zdsd(1/2周) | 分值 | 掉落 | 移动 |
|---|---|---|---|---|---|---|
| nq2 (217) | 30×30 | 150 | 5/7 | **350** | bs×2 | 无脚本；子件 215@12 = 旋转炮塔（与 nq 的 203 同文：±5°/帧追玩家 y，clamp [-15,40]） |
| jxr1 (100) | 67.8×58.5 | 300 | 7/8 | 250 | bs×2（f17/f18） | 无脚本（补间待参数化） |
| dgp (176) | 81.5×33.9 | 300 / 500 | 8（不随周目变） | 300 | bs×3（f17/18/20） | 无脚本（地滚炮，推测贴地补间） |
| jdlj (111) 中 boss | — | 3000 / 3500 | 7/9 | 1000 | f28 **bom1** + f29 pow | 无脚本 |

### 2.3 中 boss jdlj（巨大灵蛟？111，实测 15.9×35.5——蛇形小结构件）

`frame_1（原文）`: `_width=15.9; _height=35.5; round>1 ? zdsd=9,a=3500 : zdsd=7,a=3000`。死亡 `f27: soc+=1000; bos-=1` → f28 掉 bom1 → f29 掉 pow。
**武器 = 弹幕表 108@f1 dpt1**（见 §6 弹幕表总表）。

### 2.4 尾 boss boss3（170，146.1×81.6）

| 阶段 | 帧号 | 血(1/2周) | 武器 | hitbox |
|---|---|---|---|---|
| P1 | f1 | 2500 / 3000 | **161@f1 dpt1** | 57@22 |
| P2 | f49 | 3000 / 3200 | **168@f1 dpt1（大弹幕表）+ 169@f22（移动AI）** | PlaceObject2_57_20 第二套 |

- P1 死亡：`f27 soc+=1000`（转 P2）。最终死亡：`f105 soc+=1500; bos-=1` → `f109 pow + bs×7`。
- P1 武器 161：`fashe=random(20)` 双分支（f5/f25），发射帧 f5/9/13/16/27/33/42/51/61，弹种 **dzd4×20 处 + mhb×15 处**，全部瞄准 `_root.fj` 速度 zdsd。
- **P2 移动 = 169（非武器）**：`a=random(5)` 选段；f10/f30 设 `xx=random(100)+260; yy=random(200)+20;` 然后 f11–f16 每帧 `_parent._x ±1`（逐轴 1px/帧向随机悬停点漂移）。
- f31 美术集群：148/150/153/150/156/148（开甲/变形演出，无脚本）。

---

## 3. 关 4（控制器 four=299，导演 298，中 boss jbfjg，尾 boss jxjq=320）

背景 cj4。开场卡 297。导演 frame_1 摆 231 + **235（lfj 刷怪器，f309/f342 重摆）**。**纯时间驱动。**

### 3.1 导演 298 完整帧表

```actionscript
// f1: t=0;  f5: t>25 → gotoAndPlay(10)
// f10: nq2 ×2 @ (430,80) (430,150)
// f55: nq ×2 @ (430,190) (430,50)
// f61: t=0; f70: t>30 → play
// f125: dgp @ (430,60)
//      —— f70 后→f125 空转 ~55 帧 ——
// f226: dgp @ (430,170);  f228: t=0; f233: t>50 → play
// f245: dj3 @ (440,110);  f247: t=0; f253: t>40 → play
// f262: nq2 ×3 @ (430,50) (430,200) (430,100)
// f264: t=0; f269: t>30 → play
// f280: lsfj ×3 @ (440,120) (440,50) (440,150)【实例"dj3"+i】
// f282: t=0; f287: t>50 → play
// f290: lsfj ×2 @ (440,190) (440,80)
// f292: t=0; f296: t>40 → play
// f300: dj3 @ (460,190)
// f302: t=0; f306: t>30 → play
// f309: nq2 ×3 @ (430,50) (430,200) (430,120)   ← 此帧重摆 235 刷怪器
// f311: t=0; f316: t>30 → play
// f318: nq ×2 @ (430,80) (430,170)
// f320: t=0; f326: t>40 → play
// ——— 中 boss ———
// f327: bos=1;  f328: jbfjg @ (450,0)【实例"nq"+i】+ PlaceObject2(239 装饰)
// f335: bos 门闩(回331)
// ——— dgp 三连（中 boss 后清场波）———
// f342: dgp @ (450,50);  f343: t=0; f350: t>50 → play
// f353: dgp @ (450,150); f354: t=0; f362: t>50 → play
// f365: dgp @ (450,50);  f366: t=0; f371: t>50 → play
// f374: dj3 @ (440,50);  f375: t=0; f381: t>50 → play
// ——— 尾 boss 前奏（本关无 stopAllSounds 前 jbfjg 复用段）———
// f383: dong=2;  f384: dong=0;
// f390–f410: PlaceObject2(240) 过场美术 ×5 次
// f417: stopAllSounds();  f418: bjsd=7;  f420: bos=1;
// f422: jxjq @ (330, 350)【实例"dj4"+i】← 从屏幕底边外入场  [16.9s]
// f429: bos 门闩(回425);  f430: stop() + PlaceObject2(248)
```

### 3.2 尾 boss jxjq（机械巨蜥蜴？320，**301×204.8 超大**）

| 阶段 | 帧号 | 血(1/2周) | zdsd | hitbox |
|---|---|---|---|---|
| P1 | f1 | 3500 / 4000 | 8 | 57@10 |
| P2 | f75 | 3000 / 3500 | 8 | f79 起第二段（57 重摆） |

- 死亡：`f100 soc+=1500; bos-=1` → `f101–f107 掉 bs×6 + pow×1（f103）`。
- 武器双件：
  - **316@f1 dpt12**：`fashe=random(20)` 四分支（f5/f25/f60/f90）——szd3 瞄准三连（czjl = 玩家y差 / +50 / -50，速度 zdsd）+ mhb `_y-_y±40..160` 固定纵向墙扫；
  - 317@f1 dpt14（辅件）；f10 起 311/312（shape 美术）/314 附加件。
- 移动：无脚本（y=350 → 屏内为时间轴补间，待参数化）。

---

## 4. 关 5（控制器 five=282，导演 281，**中 boss 车轮战** + 终 boss black=126）

背景 cj5。开场卡 254。导演 frame_1 摆 231 + **255（dxdd 底部刷怪器）**。**纯时间驱动 + bos 门闩 + 4 张 J 对话卡。** 本关是叙事重头（车轮战 cw 逃脱 → jdlj → hzz → black）。

### 4.1 导演 281 完整帧表

```actionscript
// f1: t=0;  f5: t>25 → gotoAndPlay(10)
// f10: nq2 ×2 @ (430,100) (430,150)
// f52: bos=1;  f54: jbfjg @ (430,0)【实例"nq"+i】     [2.2s]
// f58: bos 门闩(回56)
// f59: 重摆 255 刷怪器（dpt1）
// f71: t=0; f77: t>50 → play
// f99: stop(); + PlaceObject2(268 对话卡①)            ← J 续
// f100: bos=1;  f103: cw @ (430,0)【实例"nq"+i】        [4.1s]
// f108: bos 门闩(回105)
// f109: 重摆 255（dpt6）
// f112: if(yc==0) play() else stop() + PlaceObject2(271 对话卡②)
//        —— cw 被提前击杀则跳过对话卡② ——
// f115: (对话卡②区域)
// f130: stop(); + PlaceObject2(274 对话卡③)            ← J 续
// f131: bos=1;  f133: jdlj @ (410,100)【实例"nq"+i】
// f139: bos 门闩(回136)
// f140: 重摆 255（dpt1）
// f189: stop(); + PlaceObject2(277 对话卡④)            ← J 续
// f190: bos=1;  f195: hzz @ (430,0)【实例"nq"+i】
// f204: bos 门闩(回200)
// f205: 重摆 255（dpt1）
// ——— 清场杂兵段 ———
// f226: nq2 ×2 @ (430,110) (430,170);  f228: t=0; f233: t>40 → play
// f245: dj3 @ (440,110);  f247: t=0; f253: t>50 → play
// f262: dj4 ×2 @ (430,50) (430,200)【实例"nq"+i】
// f280: dgp @ (440,70)【实例"dj3"+i】; f282: t=0; f287: t>30 → play
// f290: lsfj @ (440,50);  f292: t=0; f296: t>40 → play
// f300: lsfj @ (440,120); f302: t=0; f306: t>30 → play
// f309: nq2 ×2 @ (430,50) (430,200); f311: t=0; f316: t>40 → play
// f318: nq ×2 @ (430,100) (430,150);  f320: t=0; f326: t>30 → play
// ——— 终 boss 前奏 ———
// f328: stop(); + PlaceObject2(280 对话卡⑤) + StartSound   ← J 续
// f329: dong=2;  f330: dong=0;
// f329–f363: PlaceObject2(240) 过场美术 ×6（f329/336/342/350/356/363）
// f363: stopAllSounds();  f364: bjsd=7 + StartSound;  f366: bos=1;
// f367: _root.attachMovie("black","dj4", 2999); _root.dj4._x=450; _y=0;
//        ← 唯一固定实例名"dj4"+深度 2999（独立深度槽，不进 i 池） [14.7s]
// f375: bos 门闩(回370);  f376: stop() + PlaceObject2(248)
```

### 4.2 cw（144）＝剧情逃脱 boss（本关专属机制）

- cw `frame_1: round>1 ? a=3000 : a=2500`（同 cw1）；击杀路径存在：`f27 soc+=1000; bos-=1`，`f22/24/29 掉 pow×3`。
- **`frame_2` 静态摆 142（逃脱演出，dpt6 带 clipaction）**：
  ```actionscript
  // 142: f1 t=0;  f27: t>=15 ? play : {t+=1; gotoAndPlay(2)}   ← 每轮 26 帧 × 15 ≈ 390 帧（15.6s）
  // f30–32: 每帧 _parent._y -= 5;  至 _y < -10 → gotoAndPlay(40)   ← 把 cw 拖出屏顶
  // f44: stop(); _root.yc = 1; _root.bos -= 1; _parent.removeMovieClip();
  ```
- **cw 血 2500–3000，而演出全程约 15.6s+拖走 ~20 帧**——常规火力杀不完，**bos 门闩绝大多数情况由 142 释放**（cw 自身击杀代码是弱玩家看不见的死代码）；若真被速杀，yc 保持 0，f112 对话卡②被跳过。
- cw 武器 = 140@f1 dpt8（见 §6）：`fashe=random(30)`，==1→f5 / ==2→f100。f5 段=**垂直墙扫**：mhb 逐帧发，czjl 取 `_y-_y±40..160`（原作 `_y - _y` 笔误=常数），即"朝玩家横向 + 固定纵向分量"的斜向弹墙，速度 10。

### 4.3 中 boss 数据（本关）

| 中 boss | 血(1/2周) | zdsd | 分值 | 掉落 | 武器 |
|---|---|---|---|---|---|
| jbfjg（f54，复用关2/4） | 1700/2000 | 7/8 | 2000 | bom1+pow | 184 |
| cw（f103，逃脱演出） | 2500/3000 | 8/9 | 1000（速杀才有） | pow×3（速杀才有） | 140 墙扫 |
| jdlj（f133，复用关3） | 3000/3500 | 7/9 | 1000 | bom1+pow | **弹幕表 108** |
| hzz（f195） | 2500/3000 | 9 | 1000 | f28 bom1 + f29/30/31 **pow×3** | **弹幕表 133** |

hzz（黑猪妖中 boss 134，23.3×33）：`frame_1（原文）`: `_width=23.3; _height=33; a=2500/3000; zdsd=9`（zdsd 不随周目变）。

### 4.4 终 boss black（灰蓝魔神，126，77.3×121.1）

| 阶段 | 帧号 | 血(1/2周) | zdsd(1/2周) | hitbox |
|---|---|---|---|---|
| P1 | f1 | **3000** / 2800 | 9 / 8 | 57@13 |
| P2 | f40 | 2200 / 2500 | 8 / 9 | 57@8 |
| P3 | f125 | 2500 / 3000 | 8 / 9 | 57@8 |

> **纠白皮书**：black 为**三阶段**（非"四阶段 2200/2500/2800/3000"）——脚本树中仅 f1/f40/f125 三处 `a =` 赋值；白皮书四阶段是把两周目数值并数了。一周目总血 3000+2200+2500 = **7700**。

- 死亡：`f191 _root.soc += 5000; _root.bos -= 1;`（全游戏最高单笔分值）。
- 掉落：`f26/f29/f104/f106` 各 1 个 **pow（实例名伪装 "bs"+i）**——阶段间也发 pow。
- 武器 = **弹幕表 119@f1 dpt1**（P1 即全开，见 §6）。

### 4.5 dxdd（624）＝底部升起鱼雷（关5 专属 hazard）

```actionscript
// f1: yy=random(200)+20; spp=random(4)+2; a=1; 43.1×15.7
// f2–4: 每帧检查——hitTest fj.aaaa → dong=1（杀玩家）；fhm/fhm1/bom1 → gotoAndPlay(25)（被打掉）；
//       dong==2 或 pass==1 → removeMovieClip
//       上升：yy < _Y ? _Y -= spp : gotoAndPlay(15)
// f15: sp = random(15)+10;
// f16–18: _X -= sp（10–24px/帧 左冲）至 _X < -30 自删
```
**玩家普通弹打不掉 dxdd**（无 x 弹 hitTest），是强制走位的清屏 hazard。

---

## 5. 关 6（控制器 six=388，导演 387，终 boss cw1=145）

背景 cj6。开场卡 386。主时间轴 frame_22 额外 `yc=0`。**弹雨关：无波次怪，xkl 敌弹雨 + bs 金币雨 + cw1。**

### 5.1 导演 387 完整帧表

```actionscript
// f1:  t=0; t1=5;
// f2–f9 弹雨主循环（每 pass 1 帧）：
//   f4:  aa=random(2);
//        aa==0 → xkl ×2 @ (xx,yy)(xx1,yy1)，随后重掷 yy=random(200)+20; xx=random(50)+400（同 yy1/xx1）
//        aa!=0 → xkl ×1 @ (xx,yy)，随后重掷           【实例一律"dj3"+i】
//   f6:  yy=random(200)+20; xx=random(50)+400;        ← 再重掷一次（本 pass 的 bs 落点）
//   f8:  bs ×1 @ (xx,yy)【实例"dj3"+i】               ← 金币雨！每 pass 1 枚
//   f9:  t1<=1 ? play
//        : t>50 ? {t=0; t1-=1; gotoAndPlay(2)}        ← 每轮 52 pass
//        : {t+=1; gotoAndPlay(2)}
//   ⇒ 轮数：t1 5→4→3→2→1，共 4 整轮 × 52 pass = 208 帧 [8.3s]
//   ⇒ 弹量：约 208–416 发 xkl + 208 枚 bs
// f17: dong=2;  f18: dong=0;                          ← 弹雨结束清弹窗
// f30/38/44: PlaceObject2(240) 过场美术；f38: stopAllSounds(); _root.bjsd=7;
// f54: cw1 @ (450,0)【实例"boss1"+i】+ _root.bos=1;   [2.2s after 弹雨]
// f63: bos 门闩：bos<=0 ? play : gotoAndPlay(60)
// f64: stop(); + PlaceObject2(248)                    ← 全游戏终关
```

### 5.2 终 boss cw1（145，69.7×66）

`frame_1: round>1 ? a=3000,zdsd=9 : a=2500,zdsd=8`。死亡 `f27 soc+=1000; bos-=1` → `f22/24/29 pow×3`（f19–f25 穿插 bs×5，实例名伪装 "pow"+i）。
武器 = **140@f1 dpt8**（与 cw 同件：random(30) 双分支，f5 垂直墙扫 / f100 另一编排）。
移动：无脚本（补间待参数化）。

xkl（23，小骷髅弹）＝敌弹非怪：hitTest fj.aaaa → dong=1；被 fhm/fhm1/bom1 清除；左飞出屏自删（详见白皮书 §4）。

---

## 6. 弹幕表精灵归属与节奏总表

**归属铁证**（dumpswf.txt PlaceObject2 反查，全部挂在 boss 时间轴 f1（boss3 的 168 挂 f49）：

| 弹幕表 chid | 挂载宿主 | 弹种×总数（发射帧计数） | 选择器/节奏 | 朝向逻辑 |
|---|---|---|---|---|
| 309 | boss1(310)@f1（关1） | szd×37 + szd2×56 + szd3 | `fashe=random(20)`，==0→f5 / ==1→f150 / ==2→f57 / ==3→f290 四分支 | f5 段瞄准玩家±50 三覆盖；f150 段射向随机点 (xxx=random(350)+20, yyy=random(100))，横6纵4 固定比率 |
| **108** | **jdlj(111)@f1**（关3/关5） | **mhb×36** | 选择器帧循环（同 309 语法） | 瞄准 `_root.fj` 归一化 × zdsd |
| **119** | **black(126)@f1**（关5 终 boss） | **cbb×56 + mhb×28** | 同上（black 三阶段共用一件） | 瞄准/固定编排混合 |
| **168** | **boss3(170)@f49（仅 P2）** | **dzd4×79 + cbb×7 + szd3×6** | 同上 | 瞄准 + 编排 |
| **133** | **hzz(134)@f1**（关5） | **mhb×8 + hzzfdj×6**（敌弹载具：子件内部 `fashe=random(10)` <5 开火） | 同上 | hzzfdj 携弹飞一段后自开火 |

**boss 武器子件**（非"表"，但同语法 `fashe=random(N)` 帧循环选择器）：

| 武器 chid | 宿主 | 选择器 | 弹种/弹形 |
|---|---|---|---|
| 62 | boss2(78)@f1 dpt18 | random(20) 双分支 | mhb 三连瞄准（±40/±80 覆盖；速度 9/zdsd/8 混合；f5 分支 gs>5 × 6 轮连发） |
| 184 | jbfjg(185)@f1 dpt8 | random(20)（==0/==1 同入 f5） | 见 `DefineSprite_184/frame_5+` |
| 140 | cw(144) 与 cw1(145)@f1 dpt8 | random(30)（==1→f5 / ==2→f100） | mhb **垂直墙扫**：czjl=`_y-_y`±40..160（原作笔误=常数纵向分量），速度 10 |
| 316 | jxjq(320)@f1 dpt12 | random(20) 四分支（f5/f25/f60/f90） | szd3 瞄准三连（±50）+ mhb 墙扫；317@f1 辅件 |
| 161 | boss3(170)@f1 dpt1（P1 武器） | random(20) 双分支（f5/f25），发射帧 f5/9/13/16/27/33/42/51/61 | dzd4×20 + mhb×15 全瞄准 |
| 169 | boss3(170)@f49 dpt22 | random(5)（f10/f30） | **非武器**：P2 悬停漂移 AI（随机点 xx∈[260,360] yy∈[20,220]，1px/帧逐轴趋近） |

> 统一语法总结：**boss 弹幕 = "random(N) 选择器 + gotoAndPlay 分支段" 的帧循环状态机**；弹全部 `attachMovie(弹种,"zzd"+_root.di,_root.di++)` 进敌弹深度池，速度向量 = (dx,dy)/√(dx²+dy²) × 速度（瞄准）或固定分量（墙扫）。

---

## 7. 背景与美术对应表（ExportAssets → chid → DefineSprite → 真实 shape）

方法：`dumpswf.txt` 正则链 `ExportAssets 名 → chid → DefineSprite chid → PlaceObject2 子 chid →（嵌套再递归）→ DefineShape id`。坑：首个 PlaceObject 子件常是共享小件（chid 46=共享装饰件族），主体在其后。

### 7.1 背景（控制器 frame_1 摆放，@(-2,118)）

| 关 | ExportAssets 名 | 精灵 chid | 真实 shape |
|---|---|---|---|
| 1 | cj | 435 | （434，同构单 shape） |
| 2 | cj2 | 447 | **DefineShape2 446** |
| 3 | cj3 | 444 | **DefineShape2 443** |
| 4 | cj4 | 450 | **DefineShape2 449** |
| 5 | cj5 | 441 | **DefineShape2 440** |
| 6 | cj6 | 438 | **DefineShape2 437** |

每关背景都是单 shape 精灵（无脚本），滚动由 `bjsd`（4→7 提速）驱动的外部卷轴逻辑控制。

### 7.2 关卡专属怪 / boss 主体链

| 名 | chid | 主体链 | 备注 |
|---|---|---|---|
| nq | 207 | →201→**shapes 195–200**（6 帧动画）+46 | 46=共享小件 |
| nq2 | 217 | →214→**shapes 208–213** +46 | 与 nq 同构 6 帧 |
| lsfj | 87 | →81→**shape 79/80** +46 | |
| lfj | 221 | →219→**shape 218** +46 | |
| jxr1 | 100 | →94→sprite 89 + **shapes 90/91** | |
| dgp | 176 | →174→sprite 173 + **shape 171** +46；死亡帧 f11 换 173 | |
| jbdj | 194 | →188→sprite 187 | |
| dxdd | 624 | →623→**shape 622** +46 | |
| jxjq | 320 | →315→**shapes 311/312** + sprite 314；f10 增摆 311/312/314 | |
| boss2 | 78 | →**sprite 55**（主体）+57/59/62 | |
| boss3 | 170 | P1 武器 161@1；f11 →shape 157；f31 →sprites 148/150/153/156；P2 168/169 | 主体在 161 之外另有自身时间轴美术 |
| jdlj | 111 | 主体+108 武器@1 | |
| hzz | 134 | 主体+133 武器@1 | |
| cw/cw1 | 144/145 | →sprite 139（主体）+140（武器）@8+142（cw 逃脱演出@6）；f12 →shape 76（死亡） | |
| black | 126 | 主体+119 武器@1 | |
| jbfjg | 185 | →sprite 181（主体）+184（武器）@8 | |

敌弹/道具 shape 见白皮书 §8 与 D154 五机体表（mhb=648、cbb=652、szd3=498、dzd4=642、xkl=23、bs=344 等）。

---

## 8. 六关通关链与二周目

```
boss 死 → bos-=1 → 导演 bos 门闩放行 → 导演尾帧 stop() + PlaceObject2(248)
  248: f1 a=random(3) → gotoAndStop(5/10/15)      ← 三选一过关画面
  每个变体内嵌 PlaceObject2(244)：
  244: f114 stop(); with(_root) { _root.pass = 1; play(); }
    ← pass=1 使 one~six 控制器与全场敌弹/道具自删；主时间轴 play() 推进
主时间轴: f7→f10→f13→f16→f19→f22 依次挂 one~six（间帧全是裸 stop()）
关6 结束（387/f64 → 248 → 244 → pass=1; play()）→ 主时间轴 f23+:
  PlaceObject2(904)@f23: f43 if(_root.yc==1) { stopAllSounds(); with(_root) play(); }
                          else { stopAllSounds(); with(_root) gotoAndPlay(24); }
    ← 结局分支（cw 逃脱与否选画面）
  992（结局/制作名单）: f524  _root.round = 2;      ← 二周目旗标
  HUD(828): if(_root.round == 2) …（敌数值强化提示/表显）
```

- 重开/结局按钮：DefineButton2_990/999（J 键）→ `gotoAndPlay(2)` 重开；822 → `gotoAndPlay(30)` 结局；994（Enter）→ `gotoAndPlay(1)`。
- `round>1` 效果＝**所有怪血/zdsd 上浮**（各怪 frame_1 分支值见各表，典型 +15%~+60%）；boss 阶段数值同样切换（见 §1.4/§2.4/§4.4 表）。
- 死亡清场：控制器 enterFrame `if(pass==1 || life<0) removeMovieClip()`——life 耗尽直接拆关卡。

---

## 9. 落 wavesDef 所需字段对照表（我方引擎 kind/x/y/hp/score/drop/pattern）

| 我方字段 | 原作来源 | 换算规则 |
|---|---|---|
| `kind` | attachMovie 第一参数（linkage 名）：nq/nq2/lsfj/jbdj/jxr1/dgp/dj2/dj3/dj4/lfj/dxdd/jbfjg/cw/jdlj/hzz/boss2/boss3/jxjq/black/cw1 | **不要用实例名**（复用池名，见 §0.5） |
| `x`,`y` | attach 后一/两行的 `_x=`/`_y=`（顶左系原值） | 照抄；y=0/320/350 分别=顶部垂入/底部升入/屏下入场 |
| `hp` | 各怪 frame_1 的 `a =`（一周目值；`round>1` 用分支值） | nq150 nq2 150 lsfj 150/200 jbdj 300 jxr1 300 dgp 300/500 dj3 500 dj4 200/100 lfj 1 dxdd 1(不可射) jbfjg 1700 jdlj 3000 hzz 2500 cw/cw1 2500 boss2 2000+2000 boss3 2500+3000 jxjq 3500+3000 black 3000+2200+2500 |
| `score` | 死亡段 `soc +=`（nq300 nq2 350 lsfj 200 jbdj**500** jxr1 250 dgp 300 lfj 15 jbfjg**2000** jdlj/hzz/cw/cw1 1000 boss2 1000+1500 boss3 1000+1500 jxjq 1500 black**5000**；bs 500/枚；pow 满级折 1000） | boss 分段给分（P1 死亡即结一段） |
| `drop` | 死亡段 attachMovie：pow/bom1/bs×N（含概率：jbdj 30% pow；dj4 50% bs；black 实例名伪装） | 中 boss 必掉 bom1（jbfjg/jdlj/hzz）；boss 必掉 pow；杂兵掉 bs 0–3 |
| `pattern` | ①环境怪：lfj=`left(fxsd=5-7)`、dxdd=`rise-then-left(spp=2-5, sp=10-24)`；②turret：nq/nq2 旋转炮台(±5°/帧, clamp[-15,40])；③boss 武器：`weapon(id, selector=random(N), branches)` + 阶段表；④波次门闩：`gate:kill(diren=N)` / `gate:boss` / `delay:t>Frames` / `dialog(J)` | 复刻建议：把 §0.2 三种门闩做成 wave 推进原语，导演帧表直接转译为时间轴事件列表（帧×40ms） |

**逐帧可复现口径**：帧号/25=秒（导演起算）；开场卡 +103 帧；延时门闩的实际等待=门闩帧−回跳帧+阈值帧。全部坐标/数值均为顶左系 SWF 原值，未做任何换算。

### 未导出/未闭合项（如实声明）

- 249/292/298/281/387 的导演脚本**全部在树内**（无"未导出"项）；但 boss/中 boss 的**移动轨迹**（除 boss3-P2 的 169、lfj、dxdd、dj1 外）均为时间轴 PlaceObject2 补间，FFDec 脚本树不含逐帧矩阵——需 dumpswf.txt 逐 tag 展开 PlaceObject2 Matrix 才能参数化（本表已标注"补间移动待参数化"）。
- 184（jbfjg 武器）发射段弹种未逐帧抄录（结构与 62 同构，见 `DefineSprite_184/frame_5+`）。
- 108/119/133/168 四张弹幕表的**逐发射帧排程**未逐帧展开（弹种×总数与选择器语法已闭合；展开需按同法读 `DefineSprite_<id>/frame_N` 全集，工作量约 200+ 帧脚本）。
