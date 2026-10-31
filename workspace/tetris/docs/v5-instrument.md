# v5 核验仪器（qxqy/shots-v5 · probe-skill · audit-ui · frame-strip）

> 读者：lead / ui-mobile / 技能与 AI 线 / 任何要「自己真的触发一遍并看到动画」的人。
> 定位：**只产出证据，不做设计判断**。看到什么、读数是多少、哪里 fail —— 全在这里；改不改、怎么改，是写代码的人的事。
> 所有读数都能一条命令复算；所有图都是模拟器真实渲染（`renderPaintPng`），不是浏览器截图。

## 0. 一句话上手

```bash
cd /home/h/genshin-ts/workspace/tetris
flock /tmp/tetris-build.lock -c 'node qxqy/build.mjs'        # 多人共用存档 ⇒ build 必须串行
node qxqy/shots-v5.mjs --all --out docs/shots/v5-b1           # 5 画布 × 6 屏 = 30 张 + 5 张拼图（~21s）
node qxqy/audit-ui.mjs --dir docs/shots/v5-b1 --json docs/shots/v5-b1/audit.json   # 机器审计（有 fail 退出码 1）
node qxqy/probe-skill.mjs --role nahida --canvas pc-16-9 --out docs/shots/skill-nahida --audio   # 技能逐帧（~6s）
node qxqy/probe-skill.mjs --all-roles --canvas pc-16-9 --frames 30 --out docs/shots/skills-v5-pc   # 4 角色 × 单画布
node qxqy/probe-skill.mjs --mode title --frames 90 --out docs/shots/demo-title --no-control       # 标题页静止时长
node qxqy/runner.mjs 6                                        # 本仪器配套的 11 条用例
```

## 1. 四个入口（职责边界）

| 文件 | 干什么 | 产物 |
|---|---|---|
| `qxqy/frame-strip.mjs` | 共用层：开会话 / **出图保真补丁** / 渲染 PNG / 解码成 RGBA / 帧差 / 拼图 / **存档新鲜度检查** | 无（被 import） |
| `qxqy/shots-v5.mjs` | 画布矩阵出图：5 画布 × 6 屏 | `<out>/<canvas>/<screen>.png` + `.frame.json` + `.log.txt` + `sheet.png` + `manifest.json` |
| `qxqy/probe-skill.mjs` | 技能/动画逐帧证据 + 标题页静止时长 | `strip.png` + `control-strip.png` + `frames.json` + `summary.json` + `frame-f0NN.png` + `run.log.txt` |
| `qxqy/audit-ui.mjs` | 任意一帧的机器审计（6 类判据，有 fail 退出码非 0） | 终端清单 + `--json` + `--overlay` 的 `*.audit.png` |

画布预设（真值来自 `/home/h/miliastra-beyond-simulator/studio/constants.js`）：
`pc-16-9` 1600×900 · `pc-21-9` 2100×900 · `mobile-16-9` 1280×720 · `mobile-19.5-9` 1560×720 · `mobile-4-3` 1280×960。
屏：`title / game / help / settle / roster / dual`（`dual` 在移动画布以前会被「请回 PC」浮层拦，现在已能进局）。

## 2. 出图保真补丁（从 `qxqy/shot-style.mjs` 抽出，语义不变）

`host-png.js` 按 z 升序绘制，而 z 是**控件创建序** ⇒ 运行时后建的实例（HUD、召唤特效）会压住服务端布局层
的 textbox，出图看起来「字没了」，而真机观感是文字可见。`frame-strip.mjs:paintOrdered()` 把绘制顺序改成：

```
非 textbox 的普通控件 → textbox → （hud=true 时）HUD 名集
```

`HUD_NAMES = hud / hudNext / best / hint / keyA / keyB / keyC`（shot-style 的原集合）。三种入口都走这一个函数，
所以矩阵图、技能帧、审计 overlay 的画法是同一套。

## 3. 快照里有什么（出图 + 审计的事实来源）

每屏落一份 `<screen>.frame.json`（裁剪字段，~100–700KB）：

- `canvas`：`{id,width,height,mobile}`；`reached/note`：这屏到底有没有到达（拿日志锚判的，不是猜）
- `nodes[]`：scene 节点（`id/parent/z/kind/name/text/fontSize/textLayout{lines,requiredHeight,textWidth,fits}/fontColor/imageColor/sourceWidth/sourceHeight/matrix`）
  —— **`matrix` 是相对父节点的局部矩阵，不能当世界坐标用**
- `controls[]`：来自 `playGet({inspect:true}).tree` 的**世界坐标**控件（`box:{left,bottom,width,height}`、`raycastTarget`、`interactable`、`outlineColor`），审计的越界/重叠/对比度都吃这一份
- `zones[]`：真实命中区（与 `studio/play/session.js:acceptsPlayPointer` 同规则：`button/cursor/grid/textwindow` 或 `raycastTarget===true`）
- `texts[]`：所有有字 textbox 的 `{name,text,fits}`，给 grep 用

坐标口径：`box.bottom` 是**左下原点**（y 向上）。转图像像素：`py = (canvasH - (bottom + height)) * scale`。

## 4. probe-skill 的读数怎么读

```
animation=on/off         帧间像素差>0 的帧数 ≥3 且 首变→末变跨度 ≥15 帧(0.5s) 且 至少 1 个控件变化
帧间像素差>0：47/48      逐帧 RGBA 差（单通道阈值 8），不是「看起来在动」
最长完全静止：1 帧=0.03s  连续零变化段 ⇒ 用来判「有没有 >0.4s 完全静止」
控件变化：35 个控件       按控件 id 对齐的 diff：新增/消失/移动(≥0.5px)/改色(imageColor|fontColor)/改字
对照 run：48/48 帧不同    同一串步骤但**不按技能键**再跑一遍；两条 run 逐帧比像素 ⇒ 区分「画面本来就在动」与「技能带来的动」
音效：on · ids=[40441]   playGet().audio.recent 里 cast 之后新增的 audioId（断言音效真的播了）
```

**ai-battle 时序坑（必读）**：进 AI 对抗后必须按一次**未映射键**（本仪器用 `KeyboardCraftspersonKey5Down`）触发
`anyKeyStart → P1 准备 → 3s 倒计时 → guide stage=1`。只按 `Key36`（↑=旋转，在 `mapped` 表里）**永远不会进对局**，
此时按 Z 会打印 `skill cast ignored outside play stage=3` —— 这是「按 Z 没反应」最常见的一个假象源。
`probe-skill --mode ai-battle` 已内置 `waitForPlayStage()`（轮询到 `guide stage=1` 才施放）。

一次真实施放（纳西妲 casual，pc-16-9）的关键读数：

- f001：**1,076,069 px 变化 = 全屏 74.7%**，一帧内 `added 63` 个控件（= fx 池 59 image + 4 textbox 首次建池）
- 文案：`itopBanner` `"" → "纳西妲 · 替手"`；`ibotBanner` `"← → 移动…" → "松手吧，这盘我来落子。"`；`sk1state` `台前 · 就绪 → 台前 · CD 25.0s`
- 音效：新增 `40441`（SFX.skill.nahida）+ `40001`（升级音）
- 对照 run 逐帧差最大 74%，说明变化不是「背景噪声」

## 5. audit-ui 的六类判据（阈值 + 分级理由）

| code | 判据 | 分级 |
|---|---|---|
| `bounds` | 控件盒出画布 | 整块在外 = **info**（本工程用「挪出画布」当 hidden，实测 `hold1..4` 停在 bottom=−3559、`btnA..F` 停在 −3578）；可点区 ≥25% 在画布外 = **fail**（那块点不到）；可见 image 出界 >30% 且非装饰名 = **fail**；其余 = **warn**。textbox 不按盒判（实测 `ihud` 盒宽 640/文字只 ~200，盒出界 90px 但字完整可见），文字截断交给 `text` |
| `overlap` | `cursor/button/grid` 命中区两两相交 | 只比**画布上的**命中区（parked 热区互相重叠无意义）；完全包含 = 跳过（热区套按钮是合法分层）；局部相交 ≥15% 较小盒 = **fail**，≥2% = **warn** |
| `text` | `textLayout.requiredHeight − sourceHeight > 1.5px` 或 `textWidth > 框宽−4` | **fail**（整行会被裁/字被截）；`fits=false` 但只差 ≤1.5px = **warn**（实测 `ikeyA` 差 0.1px 仍可见） |
| `names` | 空名 / 重名 | 空名 **fail**；重名按组聚合成一条 **warn** |
| `contrast` | 文字色 vs **渲染后 PNG 里该文字框的像素众数** | WCAG 对比 <1.5×描边放宽(1.25) = **fail**，<2.6×放宽 = **warn**；存在 ≥60% 画布的全屏 `dim/mask` 遮罩时一律降级 warn（遮罩把底板压暗，测出来的不是配色） |
| `expect` | 期望控件缺失 | **fail**；移动端 game 屏默认校验 `phleft/phright/phrot/phsoft/phhard/phhold/phhelp/phroster/phskill1/phskill2/phswitch`（v5 实证名） |

对比度为什么不用「树顺序里最近的不透明 image」：那样会把白色按钮文字算到奶白面板上（假 fail 132 条）。
改成**从渲染结果里取该文字框的像素众数**（真值），并把接近文字色的众数跳过（小框被字占满时取次众数）。

## 5.5 4 角色矩阵（`--all-roles`）

```bash
node qxqy/probe-skill.mjs --all-roles --canvas mobile-19.5-9 --frames 30 --out docs/shots/skills-v5-m195
```

内部：每个角色开一条新会话 → `Key30`（调试解锁全角色）→ 反复 `Y` 直到 `skill switch ok=true active=N role=<target>` → 进局 → 按 Z → 采 N 帧 + 对照 run。
产物 `<out>/<role>/{strip.png,summary.json,frames.json,run.log.txt}` + `<out>/roles.json`（四行汇总）。
退出码：任一角色 `animation!=on` 或 `skillEffect!=on` → 1。
注意：`partyMax` 限制队伍人数，`Key30` 解锁后仍需 `Y` 切到目标角色**并核对日志 `role=`**（不是假设 party[1] 就是它）。

## 6. 存档新鲜度（这条坑过一次，别再踩）

`tetris.save.json` 里内联着 lua 源码。**改完 lua 不 build，仪器测的就是旧代码。**
实测事故：一轮技能探针读到 `skill fx kind=cast role=nahida fx=off copy=off` + 只有 4 个 module ok
⇒ 当时存活的四模块是 config/widgets/audio/skills，`copy`/`fx` 的 require 全 FAIL。并非功能没做，
而是**存档比磁盘旧**。重新 build 后同一探针读到 7 个 module ok、`fx=on copy=on`、文案与音效齐全。

**假阳性修复（2026-10-29，lead 报）**：build 会把 `__GUID_CELL__/__GUID_HIT__/__GUID_SETTLE__/__GUID_STEXT__`
替换成运行期数字（对 `main.lua` **和所有模块**都做），所以逐字节比会**每次都报不同步**（实测唯一差异就是那 9 字节）。
现在的判据：**逐行比；只有磁盘行里出现 `__GUID_` 占位符时**，才把该行两侧的数字抹平成 `#` 再比；
行数不变 ⇒ 真过期（改了代码没 build）仍然会被抓到，且报出**首个差异行号**。

- 正样本：`checkSaveFreshness()` → `{ok:true, checked:8, stale:[]}`（当前存档与磁盘一致）
- 负样本：内存里把 `config.lua` 改一处 → `{ok:false, stale:[{path:'lua/tetris/config.lua', why:'内容不一致（…，首个差异行 44）'}]}`

因此 `shots-v5` / `probe-skill` 启动时都会跑 `checkSaveFreshness()`，不一致就打印

```
⚠ 存档与 lua/ 不同步（N 处）⇒ 测的是旧代码，先 flock 跑 build
```

## 7. 退出码与"什么算绿"

- `shots-v5`：出图都成功就 0；`reached=false`（如移动端 dual 被拦）只记进 `manifest.failures`，不改退出码（它是证据，不是门禁）
- `audit-ui`：**有 fail 就 1**。warn 不阻断。
- `probe-skill`（单角色）：判定项不达标 → 只打印 `✗ 未达标`，退出码仍 0（探针是取证工具，不是门禁；门禁在 `tests/6x-*.json`）
- `probe-skill --all-roles`：任一角色未达标 → **退出码 1**（这是 4 角色矩阵的门）
- `runner.mjs 6`：11 条用例全绿才 0

## 8. 本批已知读数（2026-10-29 15:15–15:36，`docs/shots/v5-final`）

- 矩阵：30 张图 + 5 张 sheet，**22.2s**；`dual` 五画布全 reached；`bg cover ok` 30/30；`phone=17(pad=9 nav=4 act=3) ph*=17`
- 审计（≥3.0 门）：`fail 129 / warn 302 / waived 0` = `contrast 123`（26 源头，绝大多数 `lua/main.lua`）+ `bounds 6`（移动端 help 的 `pbhomel`/`pehomel` 44% 出画布 28/31px）；
  `text 0` / `overlap 0`（两类已归零）
- 技能矩阵：4 角色 × 3 画布 **12/12 `animation=on` + `skillEffect=on`**；音效 nahida 40441 / keqing 40391 / ganyu 50017 / columbina 40425
- ai-battle 接管：29/30 帧在变、最长静止 0.03s、对照差 99.05%、`skill ai start tier=1 lvidx=2 dur=6.0 mode=ai-battle`
- 标题 demo：90 帧 24 帧在变，**最长完全静止 12 帧 = 0.40s**
- 用例：`runner` **64/71 pass / 7 fail / 364.1s / exit 1**；7 条全是旧用例没跟上 v5 语义
  （评分差 2 分 ×2、`phone build n=8` 旧格式、`harddrop rows=15→14`、easy 节奏 2.2s→1.78s、T-spin 判定行缺失、手机键旧坐标）
- 肉眼可见（出图已确认）：**help 页标题层未隐藏**（模式卡/大标题/底部提示透在手册上）；PC dual 左上 HUD 被两条紫色斜装饰穿过；
  移动端 dual 中列「技能1/2/换人」压在分隔线与标题上；移动端 game 的「下一个」第三块紧贴技能1
- 已修掉：棋盘中心 80×80 灰块（`sk1barBg/sk2barBg` 同坐标）已消失

### 8.1 断言漂移的教训（给写用例的人）

v5 期间手机按钮名漂过三次：`pbtn*` → `ph*` → `php*`（pad/nav/act 前缀）。**逐名断言只会制造假红。**
`tests/61` 现在按两层判：
1. 稳定层：日志锚 `phone build n=N (pad=P nav=… act=…)`，断言 `N>=9 && P>=9`；
2. 行为层：在 ◀ 键中心用 **pointer down/up** 真点一下 → 断言 `phone tap left`（`lua/tetris/ui.lua:511` 的打印锚）。

同理 `tests/63` 的文案通道：v5 文案写在 FX 实例 `ibotBanner` + 名卡 `stext` 上，服务端 `topBanner/botBanner` 可能为空 ⇒
断言写成「任一通道有字 + 排除还是键位提示」，标题字面交给出图人工核对。

## 8.5 手机按钮读数怎么读（别再把 `phone=-` 当"没有按钮"）

`shots-v5` 控制台的 `phone=17(pad=9 nav=4 act=3) ph*=17` = 日志锚 `phone build n=17 (pad=9 nav=4 act=3)`
+ 该帧里 `ph*` 命中区 17 个。移动画布若两者都没有，才打
`phone=NONE(日志无 phone build，画面里 ph* 命中区 0 个)` —— 那才是真没有按钮。
`audit-ui` 的期望清单是**静态的 11 个 `ph*` 名**（不能从帧里自动发现当期望=假绿），另加两条防静默通过：
帧里一个 `ph*` 都没有 → fail；有 `ph*` 但一个都不在期望清单 → fail「命名变了，请更新清单」。

## 9. 边界（这些不是本仪器的活）

- 不判"美不美/该怎么设计"：只报坐标、尺寸、颜色、对比、重叠与缺失
- 不跑真机、不改 `lua/**`、不改 `qxqy/{build,runner,shot-style,deploy}.mjs`、不 commit
- 帧差只能证明「变了多少」，不能证明「玩家觉得好看」；后者要真机与用户
