# 蓄力系统 · 角色差异 · 受击反馈 · 节奏设计 —— 原始证据报告

> 来源：FFDec 反编译 AS2 脚本树 `research/extract/as/scripts/`（只读取证，2026-10-12）。
> 引用格式：`精灵目录/frame_N/DoAction.as` 或 `frame_N/PlaceObject2_X_D/CLIPACTIONRECORD*.as`（文件均 <60 行，引 path 即定位）。
> `_X/_Y` 大写 = Flash4 风格坐标 = `_x/_y`。数值全部原样抄录（帧/伤害/速度/概率），未换算秒。
> 与白皮书冲突处以本报告脚本原文为准（已发现白皮书 fashez 释义错误，见 §1 注）。

---

## 1. 蓄力期间是否停止普通射击？

**结论：不是分支互斥，而是「an 门闩 + 一段式射击动画」——J 按下瞬间先放一段 3 发点射动画，动画播完后若继续按住，只涨 neng 不再发弹；普通射击靠连续点按实现。**

证据 `DefineSprite_567_fj/frame_1/PlaceObject2_222_230/CLIPACTIONRECORD onClipEvent(enterFrame)_2.as`（全文 60 行，虹猫机体主控）：

```actionscript
onClipEvent(enterFrame){
   if(Key.isDown(74) && _root.dong == 0)
   {
      if(_root.fashez == 0 && _root.lv > 1)
      {
         if(_root.neng < _root.ps)
         {
            _root.neng++;
         }
         else
         {
            _root.neng = _root.ps;
         }
      }
      if(_root.an == 0)
      {
         _root.an = 1;
         if(_root.lv == 1)  { with(_parent) { gotoAndPlay(5);  } }
         if(eval("_root:lv") == 2) { with(_parent) { gotoAndPlay(15); } }
         if(eval("_root:lv") == 3) { with(_parent) { gotoAndPlay(25); } }
         if(eval("_root:lv") == 4) { with(_parent) { gotoAndPlay(35); } }
         if(eval("_root:lv") == 5) { with(_parent) { gotoAndPlay(45); } }
      }
   }
   else
   {
      _root.an = 0;
      _root.neng = 0;
   }
}
```

关键机制拆解：
- `an` 只在 **J 松开时** 清零（else 分支）→ 一次按下只允许 `gotoAndPlay` 跳段一次。
- 跳入的射击段是**有限动画**：lv1 段 f5→f12，发射帧为 f7/f9/f11（3 发），`DefineSprite_567_fj/frame_12/DoAction.as` = `gotoAndPlay(2);` 回待机。**段内没有"若仍按住则重播"的逻辑** → 长按 = 首轮 3 发后进入纯蓄力。
- 蓄能条件 `fashez == 0 && lv > 1`：lv1 永不蓄能；fashez=1（蓄力释放窗口期）时蓄能暂停。
- 松手 = `neng = 0` **瞬间清零**，不是缓放。

每 lv 段的弹型（`DefineSprite_567_fj/frame_{7..51}/DoAction.as`，全部 `attachMovie("wzd",...)` `_x=_X+20` `_y=_Y`，速 `zdsd * spjl / jl`，zdsd=30，直射 czjl=0）：

| lv | 段帧 | 发射帧 | 每帧弹数 | 纵向偏移 czjl | 弹体 (w×h) | 单次按下总弹数 |
|---|---|---|---|---|---|---|
| 1 | 5–12 | 7, 9, 11 | 1 | 0（直） | 27×10 | 3 |
| 2 | 15–22 | 17, 19, 21 | 1 | 0（直） | 27×15 | 3 |
| 3 | 25–32 | 27, 29, 31 | 2 | ±0.5 | 27×12 | 6 |
| 4 | 35–42 | 37, 39, 41 | 2 | ±0.5 | 27×15 | 6 |
| 5 | 45–52 | 47, 49, 51 | 3 | −1 / +1 / 0 | 27×15 | 9 |

lv2+ 段首（如 `frame_15/DoAction.as`）置 `_root.fashe = 1`，首个发射帧（`frame_17`）置 `_root.fashe = 0`——fashe 是**僚机齐射触发器**：僚机跟随循环里 `if(_root.fashe == 1) { gotoAndPlay(7); }`（`DefineSprite_530_fudaiji/frame_2/DoAction.as` 首行），即玩家开火时僚机同步进入自己的发射段。

> ⚠️ 白皮书勘误：白皮书把 fashez 释为「发射中」是错的。fashez 是**蓄力释放窗口锁**（僚机 `frame_46` 或凤凰本体置 1，见 §2/§3；僚机跟随循环 `frame_2` 与散射门闩段末尾 `frame_96` 置 0）。它只挡蓄能增长（`fashez==0` 条件），不挡普通射击动画。

**复刻含义：射击键与蓄力键合一，靠"一次按触发一段动画+门闩"制造节奏——点按=持续输出、长按=蓄力但牺牲持续输出。这是手感的核心张力，不要改成"长按连发+独立蓄力键"。**

---

## 2. 蓄满后自动触发什么？（五机体全解）

**结论：蓄满不自动释放——僚机/机体先进入「蓄满悬停」锁定态（neng>=ps 时 gotoAndStop 锁定帧），松手才触发释放演出。虹猫=僚机散射弹幕、蓝兔=挂 12 帧大体积凤凰、大奔=挂 120 帧持续凤凰、豆豆=lv 次循环 8 向弹幕、虹猫皮肤=发射穿透弹体。**

### 蓄满悬停态（虹猫/大奔/蓝兔共用结构，挂在僚机时间轴上）

`DefineSprite_530_fudaiji/frame_2..4/DoAction.as`（跟随循环尾部）：

```actionscript
if(_root.lv == 1) { removeMovieClip(this); }
if(_root.neng >= _root.ps) { gotoAndStop(45); }
```

`DefineSprite_530_fudaiji/frame_45/PlaceObject2_222_4/CLIPACTIONRECORD onClipEvent(enterFrame).as`：

```actionscript
onClipEvent(enterFrame){
   if(_root.neng < _root.ps) { with(_parent) { play(); } }
   else                      { with(_parent) { stop(); } }
}
```

同目录 `..._2.as`：悬停时僚机 `_x = fj._x + 20`，`_y` 以 ±4px/帧贴合 `fj._y - fudaiy`。

**蓄满的视觉信号就是僚机脱离阵列、贴身悬停在玩家右侧**。松手 neng→0 → `play()` 进入释放段。

僚机阵列位与深度（`DefineSprite_549_jedfdj/frame_1/DoAction.as`，ldfdj/fudaiji 同款）：

```actionscript
lv2: fudaix=10, fudaiy=20,  swapDepths(7999)
lv3: fudaix=20, fudaiy=8,   swapDepths(7998)
lv4: fudaix=20, fudaiy=-8,  swapDepths(7997)
lv5: fudaix=10, fudaiy=-20, swapDepths(7996)
var zdsd = random(5) + 10;   // 僚机弹速随机 10-14
var sd   = random(10) + 5;   // 僚机跟随速度随机 5-14
```

### xr0 虹猫（fj / 僚机 fudaiji）——散射弹幕型

释放段 `f46 → f96`（僚机时间轴）：
- `frame_46/DoAction.as`：`_root.fashez = 1;`
- 发射帧 `f47, f49, f51, f53, f55, ... f91, f93`（每 2 帧一发，共 **24 发**，跨 47 帧）：
- `frame_96/DoAction.as`：`gotoAndPlay(2); _root.fashez = 0;`

单发代码（`DefineSprite_530_fudaiji/frame_47/DoAction.as`，24 个发射帧逐字相同）：

```actionscript
_root.attachMovie("fdzd","x" + _root.i,_root.i++);
_root["x" + _root.i]._x = _X + 20;
_root["x" + _root.i]._y = _Y;
_root["x" + _root.i]._height = 20;
_root["x" + _root.i]._width = 20;
var spjl = _X + 10 - _X;
if(zdfx == 0) { var czjl = _Y + zdjl - _Y; }
else          { var czjl = _Y - zdjl - _Y; }
var jl = Math.sqrt(spjl * spjl + czjl * czjl);
_root["x" + _root.i]._xinc = (random(10) + 20) * spjl / jl;
_root["x" + _root.i]._yinc = (random(10) + 20) * czjl / jl;
zdfx = random(2);
zdjl = random(5);
```

即：弹速 `random(10)+20`（20–29）、纵向随机摇摆 `zdfx∈{0,1}` 方向 × `zdjl∈0..4` 幅度。**不挂任何凤凰精灵**（fudaiji 无 frame_48 脚本，frame_48 为空帧）。

### xr2 蓝兔（fj2 / 僚机 jedfdj）——爆发凤凰型

fj2 主控脚本（`DefineSprite_609_fj2/frame_1/PlaceObject2_222_10/CLIPACTIONRECORD onClipEvent(enterFrame)_2.as`）与虹猫**逐字相同**（蓄能/an 门闩/lv 跳段全同）。差异全部在僚机释放段：

`DefineSprite_549_jedfdj/frame_49/DoAction.as`：

```actionscript
_root.attachMovie("jedfhm","fhm2",8002);
_root.fhm2._x = _root.fj._x + 20;
_root.fhm2._y = _root.fj._y;
_root.fashez = 1;
```

`DefineSprite_549_jedfdj/frame_52/DoAction.as`：

```actionscript
if(_root.fashez == 0) { gotoAndPlay(2); }
else                  { gotoAndPlay(50); }
```

僚机在 f50–52 空转等待凤凰自毁（fashez 由 jedfhm 清零，见 §3）后归位。

### xr1 大奔（fj1 / 僚机 ldfdj）——持续凤凰型

`DefineSprite_540_ldfdj/frame_48/DoAction.as`：

```actionscript
_root.attachMovie("ldfhm","fhm1",8002);
_root.fhm1._x = _X + 20;
_root.fhm1._y = _Y;
```

（定位在**僚机**当前位置，非玩家位置；fashez=1 由 ldfhm 本体 frame_1 置位，见 §3。）僚机 f52 同款空转等待。

### xr3 豆豆（fj3）——循环弹幕型（释放段在**机体自身**时间轴）

`DefineSprite_602_fj3/frame_75/PlaceObject2_222_7/CLIPACTIONRECORD onClipEvent(enterFrame).as`：与僚机版悬停锁相同（neng<ps→play / else stop），但挂在机体上。

```actionscript
// frame_76/DoAction.as
xh = _root.lv;
_root.fashez = 1;
// frame_91/DoAction.as
if(xh <= 1) { _root.fashez = 0; gotoAndPlay(2); }
else        { xh -= 1; gotoAndPlay(78); }
```

发射帧 `f79 / f85 / f89`（每轮 3 帧，每帧 **8 发** ljzd，弹体 20×15，速 20）：

```actionscript
// frame_79/DoAction.as（f85/f89 逐字相同），8 个 czjl 值依次：
// _Y+2, _Y-2, _Y+1.5, _Y-1.5, _Y+1, _Y-1, _Y+0.5, _Y-0.5
_root.attachMovie("ljzd","x" + _root.i,_root.i++);
_root["x" + _root.i]._x = _X + 20;
_root["x" + _root.i]._y = _Y;
_root["x" + _root.i]._height = 15;
_root["x" + _root.i]._width = 20;
var spjl = _X + 10 - _X;
var czjl = _Y + 2 - _Y;
var jl = Math.sqrt(spjl * spjl + czjl * czjl);
_root["x" + _root.i]._xinc = 20 * spjl / jl;
_root["x" + _root.i]._yinc = 20 * czjl / jl;
```

释放总量 = `xh`（初值 lv）轮 × 3 帧 × 8 发 = **lv×24 发**（lv5 = 120 发）。

### xr4 虹猫皮肤（fj4）——穿透弹体型（释放段在机体自身）

`DefineSprite_587_fj4/frame_70/PlaceObject2_222_229/CLIPACTIONRECORD onClipEvent(enterFrame).as`：同款悬停锁。

```actionscript
// frame_72/DoAction.as
_root.attachMovie("kjjgj","fhm2",8002);
_root.fhm2._x = _root.fj._x;
_root.fhm2._y = _root.fj._y;
_root.fashez = 1;
// frame_79/DoAction.as
gotoAndPlay(2);
```

**复刻含义：五机体的蓄力输入面完全一致（同键/同阈值语法 ps），差异全部封装在"释放载体"（僚机段 vs 机体段 vs 挂载精灵）——复刻时把释放做成机体策略对象即可，输入层不要分叉。**

---

## 3. 凤凰/特殊精灵行为脚本

**结论：凤凰本体全部"无移动代码"——挂载时静态定位一次，靠体积×持续帧数×每帧接触伤害工作；存活条件=帧数计数；清除条件=pass==1 / lv==1 / 计满。**

### ldfhm（雷电凤凰，大奔）`DefineSprite_517_ldfhm`

```actionscript
// frame_1/DoAction.as
t = 0;
_root.fashez = 1;
_width = 15;
_height = 15;

// frame_1/PlaceObject2_516_1/CLIPACTIONRECORD onClipEvent(load).as
if(_root.lv == 2) { gotoAndStop(1); }
if(_root.lv == 3) { gotoAndStop(2); }
if(_root.lv == 4) { gotoAndStop(3); }
if(_root.lv == 5) { gotoAndStop(4); }

// frame_1/PlaceObject2_516_1/CLIPACTIONRECORD onClipEvent(enterFrame).as
if(_root.pass == 1) { _parent.removeMovieClip(); }
if(_root.lv == 1)   { _parent.removeMovieClip(); }

// frame_25/DoAction.as
if(t >= 5) { _root.fashez = 0; removeMovieClip(this); }
else       { t += 1; gotoAndPlay(2); }
```

- 寿命 = f2→f25 循环 5 次 = **120 帧**（24 帧动画 ×5）。
- 4 档外观按 lv 换帧（视觉分层，非数值分层）。
- 伤害在敌方脚本里结算（§4）：`a -= 2` 每帧接触。
- **附带清弹**：敌弹 szd 侧 `if(hitTest(_root.fhm1)) { removeMovieClip(this); }`（`DefineSprite_638_szd/frame_1/DoAction.as`）——雷电凤凰兼职护盾。

### jedfhm（蓝兔凤凰）`DefineSprite_520_jedfhm`

```actionscript
// frame_1/DoAction.as
_width = 67;
_height = 37.4;

// frame_5/DoAction.as
_root.fashez = 1;

// frame_5/PlaceObject2_519_1/CLIPACTIONRECORD onClipEvent(load).as
（同 ldfhm：lv2..lv5 → gotoAndStop(1..4) 外观分层）

// frame_5/PlaceObject2_519_1/CLIPACTIONRECORD onClipEvent(enterFrame).as
if(_root.pass == 1) { _parent.removeMovieClip(); }
if(_root.lv == 1)   { _parent.removeMovieClip(); }

// frame_12/DoAction.as
_root.fashez = 0;
removeMovieClip(this);
```

- 寿命 = f1→f12 = **12 帧**（激活窗口 f5→f12 = 7 帧），体积 67×37.4（ldfhm 的 4.5 倍宽）。
- 伤害按敌型分级（§4）：dj1/dj3=15×lv、dj2/dj4=10×lv、boss1=30×lv。
- **不清弹**（szd 脚本无 fhm2 分支）。

### kjjgj（fj4 蓄力弹）`DefineSprite_32_kjjgj`

```actionscript
// frame_1/DoAction.as
_width = 8.8;
_height = 8.3;
// frame_7..10/DoAction.as   _X = _X + 30;
// frame_11..13/DoAction.as  _X = _X + 20;
// frame_14/DoAction.as
_root.fashez = 0;
removeMovieClip(this);
```

全游戏唯一"会移动"的蓄力产物：右飞 30px/帧×4 帧后 20px/帧×3 帧，总程 ≈180px，寿命 14 帧。实例名复用 "fhm2"（与蓝兔凤凰同槽同深度 8002，互斥占用）。

### fhm 这个名字的三重占用（读代码陷阱）

| 实例名 | 实际精灵 | 挂载者 | 深度 |
|---|---|---|---|
| `fhm`  | **fanghu 护盾**（K 键/重生/die 演出挂载） | fj*_3.as / die f23-24 | 8001 |
| `fhm1` | ldfhm 雷电凤凰（大奔） | ldfdj f48 | 8002 |
| `fhm2` | jedfhm 蓝兔凤凰 **或** kjjgj（fj4） | jedfdj f49 / fj4 f72 | 8002 |

**复刻含义：凤凰=「静态判定区+计时器」，不写寻路不写跟随；三档实例名是全局单槽（深度即互斥），复刻用单例管理器最贴近原作。**

---

## 4. 受击反馈

**结论：全部反馈=跳帧段（2–3 帧白闪/死亡演出）+全局数值（soc 计分/diren 波次计数），全游戏只有 3 个音效（"up"/"wudao"/"cjb"），命中与击杀零音效、零 _alpha/Color 脚本——白闪是美术帧，不是程序变色。**

### 敌方受击（以 dj1 为完整样本）

`DefineSprite_396_dj1/frame_1/PlaceObject2_57_5/` 四个 clip：

```actionscript
// onClipEvent(enterFrame).as —— 玩家弹判定：回扫最近 30 发
kkk = 0;
while(kkk < 30)
{
   if(hitTest("_root.x" + (_root.i - kkk)))
   {
      _parent.a -= _root.zdlv;
      removeMovieClip("_root.x" + (_root.i - kkk));
      if(_parent.a <= 0) { with(_parent) { gotoAndPlay(35); } }   // 死亡段
      else               { with(_parent) { gotoAndPlay(50); } }   // 受击白闪段
   }
   kkk++;
}

// onClipEvent(enterFrame)_3.as —— 凤凰接触
if(hitTest(_root.fhm1)) { _parent.a -= 2;        ...（同上双分支）}
if(hitTest(_root.fhm2)) { _parent.a -= 15 * _root.lv; ...（同上双分支）}

// onClipEvent(enterFrame)_2.as —— 炸弹溅射（按机体）
if(hitTest(_root.bom1)) {
   if(_root.xr == 0) { _parent.a -= 50;  }
   if(_root.xr == 1) { _parent.a -= 200; }
   if(_root.xr == 2) { _parent.a -= 30;  }
   if(_root.xr == 3) { _parent.a -= 30;  }
   if(_root.xr == 4) { _parent.a -= 60;  }
   ...（同上双分支）
}
```

dj1 时间轴：`f2-4` 飞行循环 →（玩家逼近 `fj._x < _x && ks==0` → `gotoAndPlay(10)`）`f10-13` 攻击段（`f12` 发 1 发 szd 瞄准弹，`f13` `ks=1`）→ `f32` 回环；`f35-43` 死亡段（`f41` `_root.soc += 10;` 计分，`f43` `removeMovieClip(this)`）；`f50-52` 受击白闪段（`f52` `gotoAndPlay(2)`）。

`DefineSprite_396_dj1/frame_1/DoAction.as`：

```actionscript
a = 1;                      // dj1 血量 1：任何命中即死，白闪段对 dj1 实为死代码
if(_root.round > 1) { zdsd = 6; } else { zdsd = 5; }
```

### 敌方血量/受击帧总表

| 精灵 | 血量 a（round1 / round>1） | 受击白闪 | 死亡段 | fhm2 伤害/帧 | bom 伤害 xr0..xr4 | 弹速 zdsd |
|---|---|---|---|---|---|---|
| dj1 (396) | 1 / 1 | gotoAndPlay(50) | 35–43 | 15×lv | 50/200/30/30/60 | 5 / 6 |
| dj2 (366) | 250 / 300 | gotoAndPlay(3) | 10– | 10×lv | 50/200/30/40/60 | 6 / 8，`fxsd=random(2)+1` |
| dj3 (356) | 500 / 500 | gotoAndPlay(3) | 10– | 15×lv | 50/200/30/40/60 | 6 / 8 |
| dj4 (336) | 100 / 200 | gotoAndPlay(3) | 10– | 10×lv | 50/200/30/40/60 | `random(3)+4` / — |
| boss1 (310) | 3000 / 4000 | gotoAndPlay(3)（f3→f5→f2 stop） | 10–68 | **30×lv** | 50/150/30/50/40 | 6 / 7 |
| boss2 (78) 二阶段 | — | gotoAndPlay(48)（f46 起第二套 hitbox clip） | 55– | 10×lv | — | — |

（dj2/dj3/dj4 证据：各自 `frame_1/DoAction.as` 首行 + `frame_1/PlaceObject2_57_*/CLIPACTIONRECORD*` 同构四件套，gotoAndPlay 目标以 grep 全量核对。boss2 阶段证据 `DefineSprite_78_boss2/frame_46/PlaceObject2_57_16/CLIPACTIONRECORD onClipEvent(enterFrame)_3.as`。）

### 玩家弹伤害 zdlv（HUD 每帧刷新）

`DefineSprite_828/frame_1/PlaceObject2_811_628/CLIPACTIONRECORD onClipEvent(enterFrame).as`：

```actionscript
if(_root.lv == 1) { _root.zdlv = 9; }
if(_root.lv == 2) { _root.zdlv = 9; }
if(_root.lv == 3) { _root.zdlv = 6; }
if(_root.lv == 4) { _root.zdlv = 7; }
if(_root.lv == 5) { _root.zdlv = 6; }
```

（同目录 `_2.as`：`lv>=5→lv=5; lv<=1→lv=1` 双向钳制。）

### 玩家中弹反馈

敌弹 `DefineSprite_638_szd/frame_1/DoAction.as`（f1/f2 两帧同文）：

```actionscript
if(hitTest(_root.fj.aaaa)) { _root.dong = 1; removeMovieClip(this); }
if(_root.dong == 2)        { removeMovieClip(this); }   // boss 死亡清屏窗口
if(hitTest(_root.fhm))     { removeMovieClip(this); }   // 护盾拦弹
if(hitTest(_root.fhm1))    { removeMovieClip(this); }   // 雷电凤凰拦弹
if(hitTest(_root.bom1))    { removeMovieClip(this); }   // 炸弹爆风拦弹
if(_root.pass == 1)        { removeMovieClip(this); }
```

（注意：**fhm2 蓝兔凤凰不拦弹**。弹体运动在同目录 `PlaceObject2_637_1/...enterFrame.as`：`_x += _xinc; _y += _yinc;` 出界 `x<-20||x>570||y<-20||y>470` 删除。）

玩家侧死亡链（`DefineSprite_567_fj`）：`frame_1/PlaceObject2_550_8/...enterFrame.as` 每帧 `if(_root.dong == 1) gotoAndPlay(55)`；`frame_55/56`：`_root.lv = 1; _root.fashez = 0;`（**死亡降级回 lv1**）；`frame_63`：原地 `attachMovie("pow",...)` 掉 1 个补偿道具；`frame_64`：`life>0 → life-=1 + attachMovie("die","die",7999) + 自删`，`else → life=-1`（game over 旗标）。

**复刻含义：原作受击反馈=纯跳帧白闪+数字计分，无打击音无顿帧——复刻若加音效/屏震是超出原作的增强，应做成可关开关；「死亡掉 pow」是防挫败回路，必须保留。**

---

## 5. 波次与升级节奏

**结论：波次=「diren 计数门闩」纯事件驱动（清完当前波才放下一波，无时间轴定时）；dj1 杂兵由独立环境刷怪器 372 以 3 帧一掷 10% 概率生成；升级唯一途径=pow 道具（关卡 1 全程只有 3 个稳定来源：开场 1 + boss 1 + 死亡补偿 N）。**

### 导演 381（关卡 1）完整波次表 `DefineSprite_381/`

```actionscript
// f1:  开场波
t = 0;
_root.attachMovie("dj3","dj3"+_root.i,_root.i++); _x=450; _y=120;
_root.diren = 1;
// f16: 波次门闩（全部样式）
if(_root.diren <= 0) { play(); } else { gotoAndPlay(2); }
// f17-18: diren=2; dj4×2 @ (410,50) (450,180)
// f21: 门闩
// f22-23: diren=2; dj3×2 @ (450,60) (500,170)
// f27: 门闩
// f30: t = 0;
// f43: if(t < 10) { t += 1; gotoAndPlay(31); } else { play(); }   ← 空转 10 轮=节奏留白
// f44-45: diren=1; dj2 @ (400,200)
// f48: 门闩 → f49-50: diren=1; dj2 @ (400,250)
// f53: 门闩 → f54-55: diren=1; dj2 @ (400,150)
// f58: 门闩 → f59-60: diren=1; dj2 @ (450,100)
// f63: 门闩 → f65: dj4 @ (400,100); diren=1
// f71: 门闩
// f72: with(_parent) { nextFrame(); }        ← 推进 one 控制器（换场景段）
// f73/74: _root.dong = 2; / _root.dong = 0;  ← 过场输入锁+清弹窗口
// f94: stopAllSounds(); _root.bjsd = 7;      ← 背景卷轴提速至 7（boss 逼近演出）
// f156: diren=1
// f160: _root.attachMovie("boss1","boss1"+_root.i,_root.i++); _x=250; _y=100;
// f170: if(_root.diren <= 0) play() else gotoAndPlay(165)   ← 等 boss 死
// f171: stop();
```

### dj1 环境刷怪器 `DefineSprite_372/`

```actionscript
// frame_1/DoAction.as
cj = random(10);
if(cj == 0) { gotoAndPlay(15); }
// frame_4/DoAction.as:  gotoAndPlay(1);        ← 未命中：3 帧一轮
// frame_16/DoAction.as: 挂 1 只 dj1 @ (450, random(150)+40)
// frame_35/DoAction.as: gotoAndPlay(1);
```

期望刷新率 ≈ (1/10) × (25fps/3帧) ≈ **0.83 只/秒**，与波次表并行常驻（372 与 381 均为 one 控制器时间轴静态摆放；dumpswf.txt 中 DefineSprite chid:382 (one) 体仅 4 帧、含 chid 381(0x017D)/372(0x0174) 的 PlaceObject2 引用，行 12988 起）。dj1 死亡不减 diren（dj1 死亡段无 diren 递减代码——门闩只等波次怪）。

### pow 经济（升级唯一通道）

- 拾取：`DefineSprite_421_pow/frame_1..14/DoAction.as`（循环体，f14 `a++; gotoAndPlay(2)`）：

```actionscript
if(hitTest(_root.fj.bbbb))            // 拾取判定框=僚机式大框 bbbb（非中弹框 aaaa）
{
   if(_root.lv < 5) { s.start(); gotoAndPlay(16); }     // s.attachSound("up")
   else { s.start(); _root.soc += 1000; removeMovieClip(this); }   // 满级折现
}
if(a > 60)  { removeMovieClip(this); }   // 存活 60 帧
```

- 升级：`frame_21/DoAction.as`：`_root.lv++;` + 按 xr 挂僚机（`fudaiji` 9.9×4.8 / `ldfdj` 11×11 / `jedfdj` 12×14，出生点 `random(350), random(200)`，深度 `i++` 共享池）。
- 漂浮：`frame_2` 起 `yy = random(200)+20; xx = random(350)+20;` 每帧 1px 向随机点漂移。

**关卡 1 的 pow 稳定来源只有 3 个**：① `DefineSprite_382_one/frame_1/DoAction.as` 开场白送 1 个（`attachMovie("pow",...)`）→ 入场即升 lv2；② boss1 死亡 `frame_57` 掉 1 个；③ 玩家死亡 `fj frame_63` 补偿掉落。其余掉落源（hzz f29-31 连掉 3 个、cw/cw1 f22/24/29、jdlj f29、jbfjg f37、jbdj f16、black f26/29/104/106、boss2 f113、boss3 f109、jxjq f103）全部属于 2 关后导演（249/292/298/281）的怪。

### lv1→lv5 典型路径推算（伤害口径）

- 关 1 击杀需求：dj3×3(500×3)+dj4×3(100×3)+dj2×4(250×4)+dj1(若干)+boss1(3000) ≈ **5800+ HP**。
- lv2 输出：每按一次 J = 3 发 × zdlv9 = 27 + 僚机齐射（fashe 窗口 1 发 fdzd）。boss1 需 ≈ 3000/27 ≈ 111 次点按。
- **关 1 正常通关只够升到 lv2（开场 pow）+ boss 尾刀 pow → lv3**；lv4/lv5 必须靠死亡补偿或多周目（round>1 血量上浮 25–100%）。**原作的 lv3+ 是"死亡喂养"出来的节奏**——这是复刻最容易丢的节奏事实。

**复刻含义：波次门闩=清怪驱动而非时间驱动，玩家强则快、弱则慢，天然自适应；pow 稀缺+死亡补偿构成"越死越强"的渐进曲线，不要把 pow 改成击杀常规掉落。**

---

## 6. boss1 的阶段结构

**结论：boss1 没有血量阈值阶段机——单一 HP 池（3000/4000）+ 单套 hitbox clip；"阶段感"来自武器子精灵 309 的随机弹幕选择器与死亡演出；真正的多阶段 hitbox 结构在 boss2/boss3（时间轴第二套 clip）。**

`DefineSprite_310_boss1/frame_1/DoAction.as`：

```actionscript
if(_root.round > 1) { zdsd = 7; a = 4000; }
else                { zdsd = 6; a = 3000; }
_height = 112;
_width = 91;
```

- 常驻态：`frame_2` `stop();`，受击白闪 `gotoAndPlay(3)`（f3→f5 `gotoAndPlay(2)` 回停）。hitbox clip 唯一一套（`frame_1/PlaceObject2_57_10/` 四件套，玩家弹回扫窗口 `kkk < 20`——比 dj1 的 30 窄）。
- 弹幕由**武器子精灵 309**驱动（无 clip action，FFDec 独立成目录；弹从 `with(_parent)` 即 boss 本体位置发出）。`DefineSprite_309/frame_1/DoAction.as`：

```actionscript
fashe = random(20);
if(fashe == 0) { gotoAndPlay(5);   }
if(fashe == 1) { gotoAndPlay(150); }
if(fashe == 2) { gotoAndPlay(57);  }
if(fashe == 3) { gotoAndPlay(290); }
```

  - f5 段：连发 szd2 三连，瞄准玩家 `spjl=fj._x-_x`，附带 ±50 纵向瞄准偏移（三覆盖），速 zdsd（=boss zdsd 6/7）。
  - f150 段：`attachMovie("szd",...)` 两连发，射向随机点 `xxx=random(350)+20; yyy=random(100);`，速度分量 `_xinc=6*spjl/jl; _yinc=4*czjl/jl`（横向 6 纵向 4 的固定比率）。
  - f57/f290 段：同构变体（grep 证实在 f57/f61/f65/f68/f71/f74/f78 与 f150–f221 密集 attachMovie szd/szd2/szd3）。
- 死亡演出 f10→f68：`f12 _root.dong = 2;`（**锁玩家输入+清全屏敌弹**——szd 侧 `if(_root.dong == 2) removeMovieClip` 即时清弹）→ `f14 _root.dong = 0;` 解锁 → `f54 _root.soc += 1000; _root.diren -= 1; _root.bos -= 1;` → `f55-f61` 掉落 `bs×5 + pow×1`（坐标 `_X+random(20)+5, _Y-random(100)+50` 等散布）→ `f68 removeMovieClip(this);`
- 音效：boss 段**无专属音效**（f94 导演 `stopAllSounds()` 换卷速是最强"演出"）。
- 对照组 boss2：`DefineSprite_78_boss2/frame_46/PlaceObject2_57_16/` 第二套 hitbox（受击 f48/死亡 f55）= 真·时间轴阶段；boss3 同构（`frame_49/PlaceObject2_57_20/`）。

**复刻含义：关 1 boss 的"难度曲线"= 随机弹幕选择器概率分布（4/20 命中率各有偏好），不是阶段切换；复刻做成加权随机弹幕状态机 + 死亡清弹窗口（dong=2）即可，勿造血量阶段。**

---

## 7. 容易丢的独有设计（手感清单）

1. **死亡降级而非重置**：`fj frame_55/56` 死亡只把 `lv=1`（僚机全部自删：僚机循环 `if(_root.lv == 1) removeMovieClip(this)`），life/bomm/round 不动；`frame_63` 原地掉 pow → 玩家立刻能捡回 1 级。死亡是节奏事件不是惩罚事件。
2. **重生三件套**（`DefineSprite_401_die/frame_23..25/DoAction.as`）：从 `(_X=-20, _Y=120)` 以 5px/帧飞入到 `x=67`，到位瞬间 `bomm = 3`（**炸弹回满**）+ `attachMovie("fj","fj",8000)` + `attachMovie("fanghu","fhm",8001)`（**重生白送 30 帧护盾**）+ `dong=0; fashez=0`。die1/die2/die3/die4 是各机体的同构演出（f23/24 同文）。
3. **护盾 fanghu**（`DefineSprite_503_fanghu/`）：45×45 判定，f2-5 循环 `aa++` 至 `aa>30`（**30 帧=1.2s**）→ f6 淡出 → f11 自删；每帧 `_X=_root.fj._x; _Y=_root.fj._y` 跟随；`dong==1` 提前退出；f1 有原作笔误 `_X = _root.fj_x;`（缺点号，首帧定位失效——复刻勿照抄）。
4. **K 键边沿锁与原子弹窗口**：`fj ...enterFrame_3.as`：`if(Key.isDown(75) && dong==0 && bomm>0) { if(_root.yza == 0) { _root.yza = 1; if(_root.yuanzi == 0) { attachMovie("fanghu","fhm",8001); attachMovie("bom","bom1",8005); bom1._x=_parent._x+60; 15×15; } } } else { _root.yza = 0; }`——yza 防按住连发；yuanzi 是炸弹**演出占用锁**（bom f1 置 1 / f58 清 0，各机体 ldbom f23/jedbom f26/ljdbom f41 清 0），保证上一颗炸弹动画播完才能放下一颗。**炸弹同时是清弹道具+护盾触发器**（szd 三个拦截分支）。
5. **dong 三态锁**：0=正常，1=死亡演出中（移动/射击/蓄能全锁——所有输入分支都带 `dong == 0`），2=过场/boss 死亡（锁输入+全屏清弹）。复刻要用单一输入锁枚举，不要分散布尔。
6. **僚机是蓄力 UI**：蓄满的唯一反馈=僚机脱离阵列贴身悬停（`gotoAndStop(45)`）。没有能量条——**HUD 828 全套只有分数/命/炸弹，蓄力进度全靠僚机位置读**。
7. **僚机个体随机性**：每台僚机出生时 `zdsd=random(5)+10; sd=random(10)+5`——同 lv 下僚机弹速/跟随速度各不相同，阵列有"活物感"。
8. **wzd 弹体随 lv 变高不变宽**（10→15→12→15）：lv3 弹反而比 lv2 细——纯美术选择，复刻照抄即可。
9. **boss 死亡的经济爆发**：`bs` 金币 5 枚（`DefineSprite_344_bs/frame_1/DoAction.as`：12×12、`a = random(5) + 3`、音效 attachSound("cjb")）+ pow 1 个，散布半径 `random(20)+5 / random(100)+50`——通关瞬间全屏撒钱撒经验的爽点。
10. **炸弹拾取物 bom1**（`DefineSprite_432_bom1/frame_2/DoAction.as`）：与 pow 同款漂浮（60 帧寿命/随机漂点/拾取框 bbbb），`bomm<8` 才入包否则折 100 分——炸弹上限 8 的软上限折现设计。
11. **全游戏音效仅 3 个**：`up`（pow+炸弹拾取，×2 处）、`wudao`（832，开机/关卡横幅）、`cjb`（金币）。**射击/命中/爆炸全部无声**——"打击感"全部由帧跳变+掉落物承担。

---

## 8. 虹猫 vs 蓝兔 蓄力分支对照表

| 维度 | xr0 虹猫 (fj/fudaiji) | xr2 蓝兔 (fj2/jedfdj) |
|---|---|---|
| 蓄能脚本 | `567_fj/...enterFrame_2.as` | `609_fj2/...enterFrame_2.as` **逐字相同** |
| 蓄能阈值 ps | 70（`DefineSprite_755/frame_2/PlaceObject2_745_945/...keyDown.as:17`） | 65（`DefineSprite_755/frame_11/PlaceObject2_745_955/...keyDown.as:17`） |
| 蓄满悬停 | 僚机 `gotoAndStop(45)`，贴 `fj.x+20` | 同左（jedfdj f45 同构） |
| 释放触发 | 松手（neng→0 播放 f46+） | 同左（f49 挂凤凰，f50-52 空转等待） |
| 释放载体 | **僚机自身时间轴 f46→f96** | **挂载精灵 jedfhm（深度 8002）** |
| 释放类型 | 持续散射弹幕 | 爆发体积凤凰 |
| 弹种/精灵 | fdzd 20×20 ×24 发 | jedfhm 67×37.4 ×1 |
| 持续帧数 | 47→96 = **50 帧** | f1→f12 = **12 帧**（激活 f5→f12 = 7 帧） |
| 单发伤害 | 按 zdlv 结算（敌方 `a -= _root.zdlv`，同普通弹通道） | 接触伤害 dj1/dj3=**15×lv**、dj2/dj4=10×lv、boss1=**30×lv**，每帧结算 |
| 弹速 | `random(10)+20`（20–29），纵向随机 ±0..4 摇摆 | 静态无位移（挂载点 fj.x+20, fj.y 一次性定位） |
| fashez 管理 | 僚机 f46 置 1，f96 清 0 | jedfdj f49 置 1，jedfhm f12 清 0 |
| 拦弹能力 | 无（fdzd 不拦敌弹） | **无**（szd 无 fhm2 分支——蓝兔凤凰不挡子弹） |
| lv 外观分层 | 无（散射无分层） | jedfhm 内嵌 519：lv2..5 → gotoAndStop(1..4) |
| 定位参照 | 僚机自身 `_X+20, _Y`（跟随阵列位） | 玩家 `fj._x+20, fj._y`（固定贴身） |
| 一句话手感 | 「撒豆成兵」——50 帧扇面泼洒，DPS 平滑 | 「贴身爆破」——12 帧高伤判定窗，爆发斩杀 |

> 大奔（fhm1）对照参考：120 帧持续凤凰、2 伤害/帧、**能拦弹**——三者构成「泼洒/爆破/领域」三角，虹猫与蓝兔确认为不同蓄力类型。
>
> ps 阈值全表（选机体界面 755 keyDown 实证）：fj=70 / fj1=65 / fj2=65 / fj3=65 / fj4=60（`DefineSprite_754/frame_11..13/DoAction.as:6`）；主时间轴 `frame_2/DoAction.as:8` 默认 80（仅初始化占位，选机体时覆盖）。ps=满蓄所需帧数（每帧 neng++）→ 60帧=2.4s，70帧=2.8s。

---

### 证据完整性说明

- 本报告全部引用均出自 `research/extract/as/scripts/` 原文，未做任何换算；帧数×25fps=秒仅便于口算。
- boss1 武器子精灵归属（DefineSprite_309）依据：`with(_parent)` 从父级发射 + 弹种 szd/szd2/szd3 与 boss 家族弹速一致 + id 与 310_boss1 相邻；dumpswf.txt 十六进制体未逐字节展开验证摆放帧（FFDec 未导出无 clip action 的摆放关系），置信度高但非逐字节铁证。
- dj2/dj3/dj4 死亡段帧号范围以 gotoAndPlay(10) 入口+同构推断，未逐帧列全（结构同 dj1）。
- 白屏闪帧的视觉内容（美术帧）不在脚本树内，脚本仅证「跳帧段存在」。
