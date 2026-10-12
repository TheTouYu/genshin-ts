# 《虹猫蓝兔七侠传》(4399 id 9663 variant 2) 原作机制白皮书

> 逆向来源：FFDec 导出的 AS2 脚本树 `research/extract/as/scripts/`（2184 文件）+ 自写 SWF 标签解析器 `research/extract/swf_tree.py`。
> 原始 SWF：`research/swf/虹猫蓝兔七侠传-4399-9663_2.swf`（Flash 6，**25fps，舞台 400×250**）。
> 约定：所有帧号换算秒 = 帧号 ÷ 25；坐标原点左上（Flash 标准）；`_X/_Y` 大写 = Flash4 风格写法，等价 `_x/_y`。
> 每条结论带脚本路径；推测处标注「推测」。

---

## 0. 一句话总结

**横版卷轴射击（STG）**：玩家在左，敌机从右刷出；卷轴背景 + 6 关（MISSION ONE~SIX）+ 4 个大 Boss + 5 种中 Boss；核心成长循环 = 吃 `pow` 升武器等级（僚机队列 = lv-1 个）+ 蓄力条满释放凤凰爆发 + K 键「放宝」全屏炸弹（带护盾）。数值随 `round`（二周目）全面强化。

---

## 1. 游戏流程状态机

主时间轴只有 30 帧，是**章节路由器**，游戏逻辑全部在精灵时间轴里。

| 主时间轴帧 | 内容 | 证据 |
|---|---|---|
| frame_1-2 | 加载 + 全局变量初始化 | `frame_2/DoAction.as`：`lv=1, ps=80, bomm=3, life=4, round=1, i=1000, di=3001, bjsd=4, xr=0`（i=玩家弹深度池起点，di=敌弹深度池起点，bjsd=卷轴速度） |
| frame_3-6 | 片头/菜单（含选机体界面 755/754，见 §2.6） | 静态放置 756/772/789 |
| frame_7/10/13/16/19/22 | 关 1~6：`attachMovie("one"..."six", 深度9990)` + HUD 828（深度 740）+ 关卡过场 833 | 每帧 DoAction 极简；静态放置见 swf_tree 输出 |
| frame_23-26 | 通关结算画面（MISSION 评价文案 846-916 段） | `frame_23/24/26/DoAction.as` 全是 `stop()`，靠按钮跳转 |
| frame_30 | 结局画面（静态 1000） | `frame_30/DoAction.as: stop()` |

- **关卡控制器** `one(382)/two(250)/three(293)/four(299)/five(282)/six(388)`：frame_1 挂背景 `cj~cj6`、按 `xr` 挂玩家机 `fj~fj4`（深度 8000）、丢一个 `pow`；enterFrame 只做清场（`pass==1` 或 `life<0` 时 `removeMovieClip`）。每关开始重置 `bjsd=4, bj=1, bjgs=0, pass=0`（six 额外 `yc=0`）——`DefineSprite_382_one/frame_2` 等。
- **波次导演**是控制器内嵌的无名大精灵（SWF PlaceObject2 铁证）：one→{372(dj1 刷屏器), **381**(关1导演), 371(标题)}、two→**249**、three→**292**、four→**298**、five→**281**、six→{387(boss 前奏), 386}。导演帧号即波次时刻表。
- **死亡/续关**：`life` 初始 4；玩家机 frame_64：`life>0 → life-=1 + attachMovie("die",7999) 重生演出`；`life<=0 → life=-1`，控制器自移除 → 回主时间轴结算（GAMEOVER 文案 812）。
- **通关判定**：导演跑到末帧 → 触发过场按钮（`_root.pass=1; stopAllSounds(); gotoAndPlay(2)` 重开 或 `gotoAndPlay(30)` 结局）——`DefineButton2_*/frame_*` 按钮脚本。
- **二周目**：`round` 变量（frame_2 初始化 1）；所有敌机 frame_1 按 `if(_root.round>1)` 取强化数值。重开时 `gotoAndPlay(2)` 保留 `round+1`（推测，具体自增点在结算按钮链）。

## 2. 玩家

### 2.1 键位（`DefineSprite_567_fj/frame_1/PlaceObject2_222_230/CLIPACTIONRECORD onClipEvent(enterFrame).as`）

| 键 | Key 码 | 功能 | 文案证据（texts/699-710） |
|---|---|---|---|
| A/D | 65/68 | 左右移动 ±7px/帧，x∈[25,373] | 「a」「d」「左」「右」 |
| W/S | 87/83 | 上下移动 ±4px/帧，y∈[34,220]，同时置 `fangxiang`（机头朝向贴图） | 「w」「s」「上」「下」 |
| J | 74 | 开枪（边沿触发 `an`）；lv>1 按住蓄能 | 「j」「开始或开枪」 |
| K | 75 | 放宝（炸弹） | 「k」「放宝」 |

选机体界面（755/754）：`A/D` 翻页（65/68），`J` 确认 —— `DefineSprite_755/frame_2/PlaceObject2_745_945/CLIPACTIONRECORD onClipEvent(keyDown).as`。

### 2.2 射击模式（以 `DefineSprite_602_fj3` 为范式，五机体同构）

- **自动连发**：J 按住时按 `fashe` 锁逐帧发射（帧段循环），不是单发点射。
- lv1=frame_11 单发；lv2=17/19/21；lv3=27/29/31；lv4=37/39/41；**lv5=47/49 每帧 3 发扇形**（`czjl=_Y+1/_Y/_Y-1` 三向微角度）。
- 弹体尺寸随级增长：lv1 15×10 → lv5 20×15（`frame_11` vs `frame_47` 的 `_width/_height`）。
- 弹速：fj（xr0）的 `wzd` = `zdsd*10/10` = **30px/帧**（fj frame_1: `zdsd=30`）；其余机体弹 = **20px/帧**（归一化 `_xinc=20*spjl/jl`）。
- **单发伤害 zdlv 按 lv 刷新**（HUD `DefineSprite_828` 持续写）：`lv1=9, lv2=9, lv3=6, lv4=7, lv5=6` ——散射等级单发变弱、多发总伤更高。

### 2.3 生命与受创

- 受创判定框 = 玩家机内嵌实例 `fj.aaaa`（敌弹 hitTest 它 → `_root.dong=1`）；拾取判定框 = `fj.bbbb`（pow/bom1 hitTest 它）。
- `dong=1` → fj `gotoAndPlay(55)` 死亡段：`lv=1`（**武器降级到 1，僚机全部自散**，僚机 `if(_root.lv==1) removeMovieClip`）、frame_63 **原地掉一个 pow 补偿**、frame_64 扣命重生。
- `dong=2` = 演出锁控（boss 出场/阶段切换），期间玩家不动、敌弹自清。
- `fanghu`(503) 护盾：放宝时挂在玩家位（深度 8001，45×45，跟随 `_X=_root.fj._x`），存在 `aa` 0→30 帧，期间**清除触碰的敌弹**（敌弹代码 `hitTest(_root.fhm) → removeMovieClip`）。

### 2.4 蓄能与凤凰（大招）

- 按住 J（lv>1 且 `fashez==0`）：`neng++` 至 `ps`（满）。
- `ps` 按机体：xr0=70 / xr1=65（推测，754 frame_12）/ xr3=65 / xr4=60 —— **越高级机体蓄能越快**；frame_2 初始值 80。
- 满 → 僚机 `gotoAndStop(45)`：① 僚机自己进入 50 帧散射爆发（`frame_46 fashez=1` 锁蓄能、frame_47 起每帧发 `fdzd` 弹速 `random(10)+20`、方向 `zdfx=random(2)` 上下 + `zdjl=random(5)` 偏移，`frame_96 fashez=0` 回常规）；② ldfdj/jedfdj frame_48/49 挂凤凰：`attachMovie("ldfhm","fhm1",8002)`（雷电凤凰）/`("jedfhm","fhm2",8002)`（激光凤凰）；fj4 机体 frame_72 挂 `kjjgj` 为 fhm2（凤凰冲刺，`_X+30` 高速右移穿场）。
- **凤凰持续伤害写死在每个敌人的受击代码里**：fhm1 普攻 -2/帧；fhm2 = -5×lv（dj1 -15×lv、boss1 -30×lv、boss3 -10×lv）——凤凰是「无敌+持续伤害场」型大招。
- 凤凰形态按 lv 分 1~4 档（ldfhm `onClipEvent(load): lv2→gotoAndStop(1) … lv5→gotoAndStop(4)`），t>=5 帧后 `fashez=0` 移除。

### 2.5 放宝（K 键炸弹）

`Key.isDown(75) && dong==0 && bomm>0 && yuanzi==0`，边沿锁 `yza`：挂 `fanghu`(护盾,8001) + 按机体的炸弹（实例名统一 `bom1`，深度 8005）——`DefineSprite_579_fj1/frame_1/PlaceObject2_222_10/CLIPACTIONRECORD onClipEvent(enterFrame)_3.as`：

| 机体 xr | 炸弹元件 | 备注 |
|---|---|---|
| 0 (fj) | `bom` | 普通爆 |
| 1 (fj1) | `ldbom` | 雷电爆 |
| 2 (fj2) | `jedbom` | 激光爆 |
| 3 (fj3) | `ljdbom` | 连环爆 |
| 4 (fj4) | `kdbom` | 定位屏幕中心 (174,88) 全屏爆 |

炸弹对敌伤害按玩家 xr 分级（写死在各敌机）：普通敌 `-50/-200/-30/-40/-60`（lsfj 家族）、dj1 的 xr3 段 -30、boss1 xr1 段 -150、boss3 全 -30（xr4 -50）——`DefineSprite_170_boss3/frame_1/PlaceObject2_57_22/CLIPACTIONRECORD onClipEvent(enterFrame)_2.as`。

### 2.6 五机体总表

| xr | 机体 | 主弹 | 炸弹 | 僚机 | 蓄能 ps |
|---|---|---|---|---|---|
| 0 | fj(567) | wzd | bom | fudaiji(发 fdzd) | 70 |
| 1 | fj1(579) | ldzd | ldbom | ldfdj(发 ldzd) | 65（推测） |
| 2 | fj2(609) | jezd | jedbom | jedfdj(发 jezd) | ~65 |
| 3 | fj3(602) | ljzd | ljdbom | （无僚机脚本，推测 fudaiji 系） | 65 |
| 4 | fj4(587) | kzd | kdbom | （无） | 60 |

僚机跟随算法（`DefineSprite_530_fudaiji/frame_10`）：目标点 = 玩家位 − `fudaix/fudaiy` 偏移，`aa=|Δx|/sd`、`bb=|Δy|/sd` 逐帧比例逼近（sd=平滑系数）。

## 3. 敌人表

出生点统一在右屏外 x≈410-440, y 60-190（各导演帧设定）。`round>1` 数值强化。**除 dj1 外均无脚本移动（时间轴补间路径，推测）**；dj1 有 `_parent._x -= _parent.fxsd` 左移。

| 精灵 | 名（推测语义） | 血 a | 弹速 zdsd | 移速 | 分值 | 掉落 | 特性 |
|---|---|---|---|---|---|---|---|
| dj1(396) | 杂兵机 | 1 | 6/5 | fxsd=random(5)+8 左移 | 10 | 无 | 玩家飞过其左侧才开火（frame_10→12 发瞄准弹 szd）；372 刷屏器无限刷（y=random(150)+40） |
| dj2(366) | 中型机 | 300/250 | 8/6 | 无脚本 | 300 | bs×2 | 波次目标（diren 门闩） |
| dj3(356) | 大型机 | 500 | 8/6 | 无脚本 | 300 | pow | 波次目标 |
| dj4(336) | 快速机 | 200/100 | random(3)+4 | 无脚本 | 300 | b=random(2) 概率 bs | 波次目标 |
| nq(207) | 怒气兵 | 150 | 7/5 | 无脚本 | 300 | - | diren 目标 |
| nq2(217) | 怒气兵2 | 150 | - | 无脚本 | 350 | - | diren 目标 |
| lsfj(87) | 绿色飞机 30.3×41.9 | 150/200 | 6/8 | 无脚本（悬停炮台） | 200 | bs | diren 目标 |
| jxr1(100) | 机械人 | 300 | 7/8 | 无脚本 | 250 | bs | - |
| dgp(176) | 地滚炮 | 300/500 | 8 | 无脚本 | 300 | bs | - |
| jbdj(194) | 简单敌机 | 300 | 5/7 | 无脚本 | 500 | diao=random(10) 概率 pow | - |
| bs(344) | 可击破小飞行物 | random(5)+3 | - | - | 500 | - | boss/敌机死亡的散落物，可打 |
| hzzfdj(27) | 黑猪妖飞机 11.2 高 | - | - | - | - | - | **敌弹载具**：`fashe=random(10)`（原文拼错 ramdom），<5 时 gotoAndPlay(10) 发弹 |
| xkl(23) | 小骷髅弹 | - | - | - | - | - | 敌弹（six 关弹雨用，hitTest fj.aaaa→dong=1） |
| jg(44) | 剑光 12.4 高 | - | - | - | - | - | 敌弹 |

### 中 Boss（死时 `bos-=1`，多数同时 `diren-=1`）

| 精灵 | 血 a | zdsd | 分值 | 掉落 |
|---|---|---|---|---|
| jdlj(111) | 3000/3500 | 7/9 | 1000 | pow + bom1（炸弹道具）+ bs |
| hzz(134) | 2500/3000 | 9 | 1000 | pow + bom1 |
| cw(144)/cw1(145) | 2500/3000 | 8/9 | 1000 | pow（cw1 兼任 six 关终 boss，实例名 "boss1"+i） |
| jbfjg(185) | 1700/2000 | 7/8 | **2000** | pow + bom1 |

### 大 Boss

| Boss | 尺寸 | 血 | 分值 | 掉落 |
|---|---|---|---|---|
| boss1(310) 关1 | 91×112 | 3000/4000 | 1000 | pow + bs 多个 |
| boss2(78) 关2 | 78×107 | 阶段1 2000/2200 + 阶段2 2000/2500 | 1500 + 1000（分段） | pow + bs×6+ |
| boss3(170) 关3 | 146.1×81.6 | 阶段1 2500/3000 (zdsd 7/9) + 阶段2 3000/3200 (zdsd 8) | 1000 + 1500 | pow + bs×7 |
| black(126) 关5 最终「灰蓝魔神」 | - | **三阶段 f1=3000/f40=2200/f125=2500（一周目总 7700）**【2026-10-12 纠偏：原"四阶段 2200/2500/2800/3000 总 10500"混入了两周目数值，逐帧证据见 levels-2-6-waves.md】 | **5000** | pow + bs |

- 阶段切换：血量归零 → 死亡帧 `gotoAndPlay(下一阶段帧)` 而非移除（boss3 frame_27 阶段1结束 → frame_49 阶段2 初始化新血量）。
- Boss 出场前奏：387 精灵（`stopAllSounds + bjsd=7 卷轴加速 + dong=2/0 锁控`）。
- **弹幕表**（挂在 boss 内部或导演的无名子精灵，按时间轴逐帧 attachMovie 敌弹）：309（szd×37+szd2×56，boss1 体系）、168（dzd4×79+cbb×7+szd3×6，boss3 体系，静态归属未闭合但视觉件同源）、108（mhb×36）、119（cbb×56+mhb×28，black 内嵌）、133（mhb×8+hzzfdj×6）。

### 波次门闩机制（导演语法）

```as
// DefineSprite_381/frame_17: diren = 2;  frame_18: 放 dj4×2
// DefineSprite_381/frame_21:
if(_root.diren <= 0) { play(); } else { gotoAndPlay(19); }  // 循环等清场
```
- `diren` = 当前波剩余必须击杀数（dj2/dj3/dj4/nq/nq2/lsfj/jxr1/dgp/jbdj/boss 死亡时递减；**dj1 杂兵不减**——它们自己飞出屏）。
- `bos` = boss 门闩（boss/中boss 死亡 `bos-=1`；导演 `if(bos<=0) play()`）。

### 各关波次（导演帧号 × 1/25 = 秒）

- **关1（381）**：dj3×1 → dj4×2 → dj3×2 → dj2×1 ×4 波 → dj4 → boss1（frame_160，6.2s 起）。
- **关2（249）**：nq×12 + lsfj×5 + jbdj×3 + dj4×3 + dj3×3 + jbfjg(中boss) + boss2。
- **关3（292）**：nq2×6 + jxr1×3 + dj4×6 + dgp×3 + jbdj×4 + lsfj×3 + dj3×4 + jdlj(中boss) + boss3。
- **关4（298）**：nq2×8 + lsfj×5 + dgp×5 + nq×4 + dj3×3 + jxjq + jbfjg（**无大 boss**）。
- **关5（281）**：nq2×4 + nq×2 + lsfj×2 + dj4×2 + jdlj + jbfjg + hzz + dj3 + dgp + cw + **black(深度2999)**。
- **关6（387）**：xkl 敌弹雨循环（`aa=random(2)`，每轮 50 帧，xx=random(50)+400 出生）→ frame_54 挂 cw1 当终 boss（bos=1）→ 通关。

## 4. 子弹表

### 玩家弹（深度池 `_root.i` 从 1000 递增，实例名 "x"+i）

| 弹 | 发射者 | 速度 | 弹道 | 伤害 |
|---|---|---|---|---|
| wzd(613) | fj | 30px/帧（zdsd=30） | 直线向右 | zdlv |
| ldzd(617) | fj1 + ldfdj 僚机 | 20px/帧 | 直线 | zdlv |
| jezd(621) | fj2 + jedfdj 僚机 | 20 | 直线 | zdlv |
| ljzd(635) | fj3 | 20 | lv5 三向扇形 | zdlv |
| kzd(630) | fj4 | 20 | 直线 | zdlv |
| fdzd(509) | fudaiji 僚机 | 20 | 直线 | zdlv |
| fdzd（爆发） | 僚机蓄满散射 | random(10)+20 | 上下随机偏移扇面 | zdlv |

zdlv（HUD 828 每帧刷）：`lv1=9, lv2=9, lv3=6, lv4=7, lv5=6`。
越界移除：`|x|>570 或 |y|>470`（wzd frame 脚本）。

### 敌弹（深度池 `_root.di` 从 3001 递增，实例名 "zzd"+di）

**统一行为**（szd/szd2/szd3/dzd4/mhb/cbb/xkl/jg 共用模板）：`hitTest(_root.fj.aaaa) → _root.dong=1`；被 `_root.bom1`（炸弹爆炸）/`_root.fhm`（护盾）/`_root.fhm1`（凤凰）hitTest 即清除；`dong==2 || pass==1` 自移除。

| 弹 | 尺寸 | 弹道 |
|---|---|---|
| szd(638) | - | 瞄准弹：发射点朝 `_root.fj` 归一化 × zdsd（dj1 frame_12：`spjl/czjl` 三角函数式） |
| szd2(495)/szd3(498) | - | boss 弹幕表编排 |
| dzd4(642) | - | boss3 体系主弹（×79 发） |
| mhb(648) | 高15 | boss 弹幕（black/108/133） |
| cbb(652) | 高10 | boss 弹幕（119 表 ×56） |
| xkl(23)/jg(44) | - | 独立精灵敌弹（关6 弹雨/boss 近卫） |

## 5. Boss 设计要点

- **阶段=换血条**：血 0 不死，跳转新帧段重置 `a`（boss3 两段、boss2 两段、black 四段 2200→2500→2800→3000）。
- **出场演出**：387 前奏（停音乐+卷轴加速 bjsd 4→7+锁控 dong=2→0）。
- **弹幕=时间轴编排**：boss 内嵌无名弹幕表精灵，逐帧 attachMovie 敌弹（无 AI，纯排程），配合 PlaceObject2 补间走位（推测）。
- **奖励节奏**：阶段切换即给分（boss3 frame_27 +1000、死亡 +1500），死亡时掉 pow + 一串 bs（可击破、每个 500 分的"奖励靶"）。

## 6. 道具与掉落

| 道具 | 行为 | 掉落来源 |
|---|---|---|
| pow(421) 15×6 | 漂向随机点（xx=random(350)+20, yy=random(200)+20，1px/帧），存活 60 帧；拾取：lv<5 → `lv++` + 按机体挂 1 个僚机；lv=5 → `soc+=1000`。音效 attachSound("up") | dj3、dj2 波次奖励、boss/中boss、玩家死亡补偿（fj frame_63）、jbdj 10% 概率 |
| bom1(432) | 同漂浮逻辑；拾取 `bomm++`，上限 `bomm<8` | 中 boss 专属（jdlj/hzz/jbfjg） |
| bs(344) | 可击破小飞行物，a=random(5)+3，击破 +500 分 | 所有敌机/boss 死亡散落 |
| die(401-413) | 重生演出（40×40，X=-20 飞入至 67） | 玩家死亡时挂（深度 7999） |

**僚机重建器 825**（HUD 内嵌）：死亡后按 lv 逐帧补挂僚机至 `lv-1` 个（frame_1 按 lv 跳段：lv2→f5、lv3→f15、lv4→f25、lv5→f35），每帧挂 1 个并设 `_root.lv=2/3/4/5`。

## 7. 数值总表（硬编码原文）

```
# 全局（frame_2/DoAction.as）
lv=1  ps=80  bomm=3  life=4  round=1  i=1000  di=3001  bjsd=4  xr=0
zdlv: lv1=9  lv2=9  lv3=6  lv4=7  lv5=6     （DefineSprite_828）
蓄能阈值 ps: xr0=70  xr4=60  （初始 80；xr1~3 在 754 各帧，量级 60-70）

# 玩家移动
A/D ±7px/帧  x∈[25,373]   W/S ±4px/帧  y∈[34,220]
弹速: fj=30px/帧  其他机体=20px/帧  僚机爆发=random(10)+20
炸弹上限 bomm<8

# 敌机血量（round>1 强化值）
dj1=1  dj2=300/250  dj3=500  dj4=200/100  nq=150  nq2=150  lsfj=150/200
jxr1=300  dgp=300/500  jbdj=300  bs=random(5)+3
jdlj=3000/3500  hzz=2500/3000  cw/cw1=2500/3000  jbfjg=1700/2000
boss1=3000/4000  boss2=2000/2200+2000/2500  boss3=2500/3000+3000/3200
black=3000/2200/2500（三阶段，一周目总 7700；四阶段说混入二周目，已纠偏）

# 分值
dj1=10  dj2=300  dj3=300  dj4=300  nq=300  nq2=350  lsfj=200  jxr1=250
dgp=300  jbdj=500  bs=500  jdlj/hzz/cw=1000  jbfjg=2000
boss1=1000  boss2=1500+1000  boss3=1000+1500  black=5000  满级吃pow=1000

# 弹速 zdsd（敌）
dj1=6/5  dj2=8/6  dj3=8/6  dj4=random(3)+4  nq=7/5  lsfj=6/8  jxr1=7/8
dgp=8  jbdj=5/7  jdlj=7/9  hzz=9  cw=8/9  jbfjg=7/8  boss1=6/7  boss3=7/9→8
卷轴 bjsd=4（boss 前奏时 7）  背景块宽 1500（_X<=-1092 接续）

# 特殊伤害（写死在各敌机受击代码）
炸弹 bom1: 普通敌 -50/-200/-30/-40/-60（按 xr0-4）
          dj1 的 xr3 段 -30  boss1 的 xr1 段 -150  boss3 全 -30（xr4 -50）
凤凰 fhm1: -2/帧    fhm2: -5*lv（dj1 -15*lv  boss1 -30*lv  boss3 -10*lv）
护盾 fanghu: 存在 30 帧，清除触碰敌弹
```

## 8. 美术资产清单

- **shape**：534 个矢量图元（SVG 导出于 `extract/assets/shapes/`，文件名=字符 id）。风格：Flash 6 时代矢量卡通，粗描边+平涂，角色 Q 版（虹猫/蓝兔/黑心帝国反派群），敌机为拟兽机械风。主要尺寸：玩家机 ~10×12（碰撞盒）视觉 ~30×20；boss 78×107 ~ 146×82；舞台 400×250。
- **text**：95 条 UI 文案（`extract/assets/texts/`），含：操作说明（w/a/s/d/j/k=「放宝」）、MISSION ONE~SIX、各关通关评价台词（角色吐槽）、GAMEOVER、「回到开始」、剧情对白（灵精灵/绝对冷静/红蜘蛛/黑心/黑心虎）、彩蛋代号（「一批批」「二乃求」「一乃求」「三原盘」「鲸鱼」「金笔飞机」——推测为开发期敌机昵称）、HUD 标签「子弹威力」「附带机器判定」「加命」「连射」、MISS。
- **frame 截图**：30 张主时间轴渲染 PNG（`extract/frames/`，7/10/13/16/19/22 为六关画面）——供复刻取材。
- **链接库**：DefineButton2_722 = `getURL("www.hmlt.cn")` 官网导流按钮（texts 719-721 同址）。

## 9. 音频清单

- **事件音效 54 个**（DefineSound 导出，`extract/assets/sounds/`，53 mp3 + 1 wav），全部 ≤2.1s。具名 5 个：`up`（拾取 pow）`wudao` `aida` `boom`（爆炸）`cjb`；其余按字符 id 命名（22/25/26/29/31/43/58/66/77/84/107/110/143/206/225/…/982）。
- **流式音频轨道 278 段**（SoundStreamHead2 标签）——BGM/环境乐全部以流式形式嵌在各精灵时间轴（伴随剧情/boss 演出播放，boss 前奏有 `stopAllSounds()` 切换）。推测 BGM ≥6 首（每关一首 + boss 曲 + 菜单曲），但无独立文件，需从 SWF 流轨提取确认（未做）。

## 10. 复刻与升级建议

### 核心乐趣（必须保留）
1. **pow 升级-死亡降级的赌注循环**：吃 pow 变强（僚机+1、弹幕变宽），中弹瞬间回到 lv1+原地掉 pow 补偿——「能捡回来」的挫败缓冲是手感的灵魂，数值（zdlv 9/9/6/7/6 单发弱化+多发）平衡了散射与单点。
2. **蓄力凤凰**：按住 J 攒 60-80 帧 → 无敌+持续伤害场，这是清屏救场技；僚机散射同步爆发形成视听高潮。
3. **K 键放宝三合一**：伤害+护盾清弹+演出，且按机体换形态（kdbom 定屏中心全屏爆）。
4. **波次门闩（diren/bos）**：必须清场才推进的节奏锚点，让"杂兵飞走不计"（dj1 不减 diren）和"精英必须杀"分层清晰。
5. **bs 奖励靶**：boss 死后掉一串 500 分小飞行物，把击破瞬间变成收割游戏。

### 可以砍/简化
1. **五种机体差异**：主弹全是 20px/帧 直线（fj 30），实际手感差异主要在炸弹形态与蓄能阈值——复刻可收敛为「弹速/炸弹/蓄能」三参数。
2. **二周目 round 强化**：纯数值放大（血/弹速 +10~50%），无新内容——可换成敌机组合变化。
3. **弹幕表硬编码**：boss 弹幕是逐帧 attachMovie 的死排程，复刻时应改为数据驱动的弹幕 DSL。
4. **杂兵 dj1 的触发开火**（玩家 x 超过才打）很妙，但 fxsd=random(5)+8 的纯随机移速可收敛。
5. **278 段流轨 BGM** 嵌死在精灵里，升级版应独立音频轨。
6. **无脚本移动的敌机**（时间轴补间路径）复刻时改为显式路径数据（正弦/悬停/编队参数化）。

### 升级方向（原作没有的）
- 原作**没有擦弹/ grazing、没有护盾条、没有武器切换**（机体=开局一次选择）； bomb 数量 UI 有上限 8 但无冷却——可加.
- 原作分值无倍率系统（soc 纯累加），可加连击倍率。
- 六关仅 4 大 boss+2 中 boss 收尾，关 4 无 boss——升级时可补。

---

## 附：证据索引（关键文件）

- 主时间轴初始化：`extract/as/scripts/frame_2/DoAction.as`
- 玩家机全逻辑：`extract/as/scripts/DefineSprite_567_fj/`（操控 222_230、射击 frame_7-49、死亡 55-64）
- 机体选择：`DefineSprite_755/`、`DefineSprite_754/`
- 僚机/凤凰：`DefineSprite_530_fudaiji/`、`DefineSprite_540_ldfdj/`、`DefineSprite_549_jedfdj/`、`DefineSprite_517_ldfhm/`、`DefineSprite_421_pow/`、重建器 `DefineSprite_825/`
- 关卡导演：`DefineSprite_381/`（关1）、`249/`（关2）、`292/`（关3）、`298/`（关4）、`281/`（关5）、`387/`（关6）
- Boss：`DefineSprite_310_boss1/`、`78_boss2/`、`170_boss3/`、`126_black/`
- 敌弹模板：`DefineSprite_638_szd/`、`648_mhb/`、`652_cbb/`、`23_xkl/`、`44_jg/`
- 道具：`DefineSprite_421_pow/`、`432_bom1/`、`344_bs/`、`503_fanghu/`
- SWF 嵌套树解析器：`extract/swf_tree.py`（PlaceObject2 has-character 在 bit1 0x02，非 0x40）
- 资产：`extract/assets/{shapes,sounds,texts}/`、`extract/frames/*.png`
