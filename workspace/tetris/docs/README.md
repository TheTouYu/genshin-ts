# Tetris —— 千星模拟器 2D 路线技术验证 demo

一句话：**10×20 棋盘、七种方块、200 个客户端图片实例当格子、服务端控件跑 Lua 逻辑**的俄罗斯方块，
可在 `/home/h/miliastra-beyond-simulator` 里离线跑帧、批量回归，并导出可导入真机的整合包 GIA。

---

## 1. 工程构成（实测读数，来自 `tetris.save.json`）

| 项 | 数量 | 明细 |
| --- | --- | --- |
| 服务端控件 | **12**（2026-10-24 满幅布局后） | `sc1` 容器 → `n1` container（脚本宿主）→ 10 个 textbox：`hud` `hudNext` `title` `best` `hint` `keyA` `keyB` `keyC` `topBanner` `botBanner` |
| 客户端模板 | **1** | image 模板 `cell`（authoring guid **1073742105**；真机导入后实测重编号为 **1073741849**）—— 208 个实例共用它 |
| 脚本 | **1** | `lua/main.lua`（**1097 行 / 43263 B**，2026-10-24 第二轮：AI 自演 + 结算页），脚本 guid 1073742105→真机 `main_2` 1073741827 |
| 脚本挂载 | — | 挂在**服务端** `n1`（`controlAsset: server-control-template`）；客户端模板树内零脚本 |
| 运行时控件 | **208** | `game.InstantiateClientUIControl(模板 guid, root)` ×208：`cell1`…`cell200` + `next1`…`next4`（NEXT 预览）+ `frame1`…`frame4`（棋盘外框） |
| 存档 | 87073 B | `tetris.save.json`（`format: qxqy-simulator-save`, version 4） |
| GIA 整合包 | 31408 B | `device-package/tetris-整合包.gia`（服务端 UIControlGroup + 客户端 UIControlTemplate + 脚本映射同文件） |

**路线**：服务端控件直接渲染 —— Lua 脚本挂在服务端容器上，渲染靠「实例化客户端模板 + 改
`imageColor`」，没有走「客户端脚本」路线（客户端模板树零脚本铁律，模板内挂脚本会被拒绝）。

## 2. 键位表（官方具名键，`studio/play/key-bindings.js` 实证存在）

| 操作 | 物理键 | 引擎事件名 |
| --- | --- | --- |
| 左移 | ← | `KeyboardCraftspersonKey38Down` |
| 右移 | → | `KeyboardCraftspersonKey39Down` |
| 顺时针旋转 | ↑ | `KeyboardCraftspersonKey36Down` |
| 软降（下一格） | ↓ | `KeyboardCraftspersonKey37Down` |
| 硬降（落底并锁定） | Space | `KeyboardJumpKeyDown` |
| 重开 | R | `KeyboardCharacterSkill3KeyDown` |
| 调试：填满最底两行 | T | `KeyboardCharacterSkill4KeyDown` |

`T` 是给用例用的调试钩子：它只填行、**不消行**；消行必须由下一次锁定经 `doLock → clearLines`
真实链路触发，所以 `tests/04` 覆盖的是真实消行路径。

## 3. 坐标系与布局

- 画布基准 `mobile-16-9` = 1280×720；`n1` 的 anchorMin/Max = 0/1（铺满父级），故 `n1` 中心 = 画布中心。
- 格子 26×26，间距 2（pitch 28）。`cell i`（i=1..200）：
  `col=(i-1)%10, row=(i-1)//10`；`SetAnchoredPosition((col-4.5)*28, (9.5-row)*28)`。
  ⇒ `cell1` = (-126, 266)，`cell200` = (126, -266)，棋盘 280×560 居中。
- 颜色走 `imageColor`（ARGB 整数）。**注意读回是有符号 int32**：`0xFF1A1D26`（空格）写入 4279901478、读回 `-15065818`；
  用例里的 `imageColor` 断言一律用有符号值。

## 4. 逻辑要点

- **固定步长**：`OnUpdate(dt)` 只做 `acc += dt`，`while acc >= 1/60` 才推进一拍（单帧最多 8 拍防积压）；
  重力每 30 拍落一格（0.5s）。`script:EnableUpdate(true)` 必须显式调用，否则 `OnUpdate` 根本不会派发。
- **方块**：七种（I/O/T/S/Z/J/L），坐标列表 + 顺时针 `(r,c) → (c, n+1-r)` 旋转，碰撞检测含边界与堆叠。
- **消行计分**：1/2/3/4 行 = 100/300/500/800 × level，`level = 行数//10 + 1`；
  消行后**不递减 r**（删行+顶部插空行后，原 r-1 行落到索引 r，需要重判——这是首版 bug）。
- **随机**：内置 LCG（种子 20261023），不用 `os`/`math.random`，用例可复现。
- **日志（用例断言用）**：`cellCount=200` / `piece=<名> x=<列> y=<行>` / `fall y=` / `move x=` /
  `rotate <名>` / `harddrop rows= y=` / `lock <名> cells=<落格下标>` / `clear n= score= lines=` / `gameover score=` / `newgame` /
  `shake rows=<n> amp=<px> dur=<s>`（消行起抖）/ `shake end`（抖完复位）。

### 4.1 音效与抖屏（2026-10-25）

- **音效**：`game.PlayAudio2D(audioId)`（id 必须是整数，取自内置音效库）。只在"动作真的发生"时播一条，
  全部 `pcall` 包住（真机缺 API 时一处抛错会中断整段 `OnStart`——2026-10-24 踩过）。
  `sfxFrame == frameSeq` 保证**同一帧最多一条**；消行音优先于落地音（同一帧不叠两条）。

  | 时机 | id | 白名单时长 | 语义 |
  | --- | --- | --- | --- |
  | 左右移动 / 手机热区轻点 | 20007 | 0.249s | 占位，**未听感确认** |
  | 旋转 | 20008 | 0.300s | 占位，未确认 |
  | 落地（未消行） | 20004 | 0.459s | 占位，未确认 |
  | 消行 1/2/3/4 行 | 20001/20002/20003/20005 | 0.87/0.557/0.731/0.88s | 四档互不相同，音高关系未确认 |
  | 游戏结束 | 20006 | 1.030s | 占位（"低沉"是猜的） |

  时长来自模拟器音频白名单 `studio/assets/audio-catalog.js`（`audioDuration(id)`，离线可查）；
  该目录**只有时长没有音色名**，`https://oss.070077.xyz/audio/<id>.mp3` 是唯一音源（本机当时无网）。
  改音只改 `lua/main.lua` 里的 `SFX` / `SFX_CLEAR` 两张表。

- **抖屏**：2D UI 没有相机 ⇒ 把所有视觉元素按同一偏移量整体平移。200 格 + 4 条外框的**基准坐标在创建时
  存进 `cellBX/cellBY/frameBX/frameBY`**（唯一真源），抖动时写 `base+offset`，抖完复位一次。
  幅度按消行数 7/10/13/17px、时长 0.18/0.20/0.23/0.28s、`exp(-3u)` 衰减、9Hz 抖动，
  **只在 `shakeT > 0` 的帧写坐标**（0.2s ≈ 6 帧 ≈ 1200 次调用），平时一帧都不写。
  `layout()` 与 `newGame()` 都会停抖并复位（抖动中按 R 不会留歪棋盘）；入场 AI 自演期间只抖不响。

## 5. 怎么跑

```bash
cd /home/h/genshin-ts/workspace/tetris

# ① 跑全部用例（离线，不需要 web 服务）
node qxqy/runner.mjs                 # 全部
node qxqy/runner.mjs 04              # 只跑文件名含 04 的

# ② 从 lua/main.lua 重建工程 + 存档 + GIA（会覆盖 tetris.save.json 与 device-package/*.gia）
node qxqy/build.mjs

# ③ 交付物自查（GIA 体积 / importGia 解出模板与脚本 / 存档能被 importData 与 createStudio 加载）
node qxqy/check-gia.mjs

# ④ 音效 / 抖屏探针（读模拟器 audioHistory 与控件真实坐标；全绿退出码 0）
node qxqy/probe-audio.mjs
```

- `runner.mjs` 读 `tetris.save.json` → `createStudio(save)` → 逐条 `playRunCase(case, {canvasId:'mobile-16-9'})`；
  全绿退出码 0，有失败退出码 1 并打印失败断言与客户端日志尾部。
- 修改游戏逻辑后 **先改 `lua/main.lua`，再 `node qxqy/build.mjs`**（存档里的脚本源码是构建时内联进去的，
  只改 `.lua` 不会让旧存档变）。

## 6. 用例（`tests/`，10 条 / 61 断言；另有 2 例带音效断言）

| 用例 | 覆盖 | 关键断言 |
| --- | --- | --- |
| `01-board-200.json` | 开局 200 格在场 + 布局 + 上色 | `cellCount=200`；`cell1/cell100/cell200` 存在；`cell1` 位置 (-126,266)、`cell11` y=238、`cell200` x=126；`cell4` = 方块色（Z 已画出）、`cell200` = 空格色；`hud` 文本 |
| `02-gravity-fall.json` | 固定步长重力 | 0.55s `fall y=2`、1.05s `fall y=3` |
| `03-move-left-right.json` | 左右移动改变列 | ←←→ 依次得到 `move x=3` / `move x=2` / `move x=3` |
| `04-line-clear-score.json` | 消行计分（真实锁定链路） | 填两行后硬降 → `clear n=2 score=300 lines=2`；消行前 `FILLED 20`、消行后 `FILLED 4` |
| `05-rotate-harddrop.json` | 旋转 + 硬降落格 + 落格上色 | `rotate Z`、`lock Z cells=176,186,185,195`、`cell195/cell176` = 方块色、`hud FILLED 4` |
| `06-gameover-restart.json` | 堆到顶判负 + R 重开 | `gameover score=`；重开后 `hud` 回到 `SCORE 0 … FILLED 0` |
| `07-guide-stages.json` | 引导三拍（横幅 → 首锁 → 首消） | `guide stage=1` / `guide lock-tip` / `guide clear-tip` + 各态 `hint`/`botBanner` 文本 |
| `08-click-pad.json` | 手机热区链路（点 btnA/D/E） | `hits=6`、`move x=3`、`rotate`、`touchdrop y=`；`btnA` 控件在场 |
| `09-sfx-actions.json` | **每个操作一条音效**（新增） | `move x=` / `rotate ` / `lock ` + `audioExpect:[20007,20008,20004]`（且不含消行音 20002） |
| `10-shake-clear.json` | **消行抖屏 + 消行音**（新增） | `clear n=2 score=300`、`shake rows=2 amp=10 dur=0.2`、`shake end` + `audioExpect:[20002]`（且不含落地音 20004） |

用例不是"陪着代码走"的：做过 3 组变异回归（重开键名改错 / 分数表错位 / 锁定时不消行），
三组都让对应用例报红，证明断言确实在判东西。

**音效怎么断言**：用例断言的 6 种 kind（`log/control/var/signal/tree/lua`）都读不到模拟器的
`rt.audioHistory`（`lua` kind 跑在**新建沙箱**里，只有 `var/logs/control/signals`）⇒ 改由 runner 在
`playRunCase` 之后读 `playGet().audio.recent`，用例里写 `audioExpect:[id...]` / `audioExclude:[id...]`，
缺一条或多一条都会让该用例 FAIL 并打印 audio 计数表（例：`audio: 20007×3`）。

## 7. 导入真机

1. 拿 `device-package/tetris-整合包.gia`（整合包 = 服务端控件组 + 客户端控件模板 + 脚本映射同文件）。
2. 编辑器里导入整合包 GIA → 得到「客户端控件容器」（4 个服务端控件）与「客户端控件模板」（1 个 image 模板）。
3. 检查脚本映射：`lua/main.lua` 应挂在服务端容器 `n1` 上（`controlId=n1`, `controlAsset=server-control-template`）。
   若导入后控件索引被重映射，**按 `controlGuidChanges` 语义更新脚本里的控件 guid（`T_CELL`）**，
   不要全局替换同值数字；核对后再 `acknowledgeControlGuidChanges`。
4. 进入试玩，键盘按上表操作。

## 8. 已验证 / 未验证（模拟器绿 ≠ 真机绿）

**已验证（模拟器层，`node qxqy/runner.mjs` 6/6 + `check-gia.mjs` 9/9）**
- 200 个模板实例真被创建、进场景树、`visible=true`、尺寸与坐标符合 10×20 布局；
- `imageColor` 真被写入并可读回（开局方块格与空格颜色不同、落格后对应格变色）——这是"渲染通路"的证据，
  不只是"逻辑照跑"；
- 键盘具名键真触发逻辑（移动/旋转/软降/硬降/重开/调试填行）；
- 重力按 1/60 固定步长推进；消行走真实锁定链路并计分；堆顶判负与重开；
- GIA 非空且能被 `importGia()` 解出 1 模板 / 1 脚本 / 4 服务端控件；存档能被 `importData('json')` 与
  `createStudio(seed)` 两种方式加载。

**未验证 / 已知风险（真机要回看的地方）**
1. **像素层未验证**：headless studio 没有截图 API，本轮只做到「控件属性层」（位置/尺寸/可见/`imageColor`），
   没有真机帧。真机可能出现：图片素材未指定（模板 image 用默认素材/空 imageId）、格子间隙视觉偏差、
   16:9 之外画布（pc-21-9 / mobile-4-3）下棋盘偏出屏幕——当前坐标是硬编码的 mobile-16-9 基准。
2. **真机 API 差异**：`game.GetUICanvasSize()` 返回值、`SetAnchoredPosition` 有父时的相对语义、
   `root:GetChild('hud')` 取子名字的可用性，都只在模拟器里验过。HUD 是 `nil` 容错写法，真机若取不到子节点
   只是没有文字，不影响棋盘。
3. **输入手感未验证**：模拟器固定 dt=1/60；真机变步长下重力节奏、长按连发（当前无 DAS/ARR，按住不重复）
   会与模拟器不同。旋转没有 SRS 踢墙，贴墙/贴堆时会转不动。
4. **性能只做过粗算未做真机负载**：每帧只做累加（不遍历 200 格），200 格重绘只在锁定/消行/生成时发生，
   但真机 200 个 image 实例的合批与 DrawCall 未测。
5. **脚本索引**：真机导入 GIA 会重映射客户端控件索引；本 demo 在 Lua 里硬编码了模板 guid `T_CELL = 1073742105`，
   导入后若索引变化必须按 `controlGuidChanges` 改这一处（`build.mjs` 会在构建时校验 guid 与常量一致）。
6. **`T` 调试键**是真机可见的：不需要就删掉那一段监听。

## 9. 文件清单

```
workspace/tetris/
├── lua/main.lua                       游戏逻辑（唯一需要手改的源）
├── tetris.save.json                   完整工程存档（importData / createStudio seed 均可加载）
├── device-package/tetris-整合包.gia    真机导入包
├── qxqy/build.mjs                     从默认工程重建 + 导出存档与 GIA
├── qxqy/runner.mjs                    离线跑用例（退出码 0/1）
├── qxqy/check-gia.mjs                 GIA / 存档自查
├── tests/*.json                       6 条用例
└── docs/README.md                     本文件
```


---

## 10. 2026-10-24 满幅布局 + 三拍引导（当前实现）

### 10.1 布局（1280×720 基准，全部由 Lua 按 `GetUICanvasSize()` 计算）

| 区 | 位置 | 内容 |
| --- | --- | --- |
| 左栏 | 中心 x=-410，宽 420~460 | `title` TETRIS(64) / `hud` 统计(20) / `best` 最高分(20) / `hint` 引导语(22) |
| 棋盘 | 居中，10×20，PITCH 30（CELL 28 + 缝 2）= 300×600 | 200 格 + 4 条外框（青色 2px） |
| 右栏 | 中心 x=+410，宽 420 | `hudNext` NEXT(22) + 4 格预览 / `keyA` `keyB` `keyC` 键位卡(22) /（P2 手机按钮位预留） |
| 上横幅 | y=+324（=halfH-36），高 **64**，宽 W-180 | 入场「俄罗斯方块」(26→40 渐大) / 结算「游戏结束」(**40**，红) |
| 下横幅 | y=-332，高 **48**，宽 W-180 | 入场「按任意键开始」(22~23 呼吸) / 阶段性提示 / 结算「本局 X 分　消行 Y 行　[R] 再来一局　[Q] 结算明细」(26) |

> 两个横幅 2026-10-24 第二轮改过：上横幅 56→**64**（40 号入场标题需 62）、下横幅 44→**48**（结算 26 号需 41.7），
> 且 `verticalAlignment` 显式写死 `Middle`（authoring 默认是 `Top`，顶格画会贴着画布上沿被切）。

### 10.2 两条硬判据（血泪，改 UI 必看）

1. **textbox 框高必须 ≥ `fontSize × 1.45 + 4`**，否则**整行静默不画**（无报错、无日志）。
   实测：64 号配 96 高（需 96.8）→ 整块消失；26 号配 40 高（需 41.7）→ 消失。
   倍率来源 `studio/play/text-layout.js`：`lineHeight = 1.2×size` + `blockInset = 0.25×size + 4`。
2. **文本框宽度不足时尾部字符被裁**（`SCORE … FILLED 0` 的 `0` 曾显示成 `U`）。22 号放不下那条统计行，改 20 号 + 460 宽。

### 10.3 模板 guid 双宿主探测

模拟器用 authoring guid（1073742105），真机导入后编辑器重编号（实测 1073741849）。
`main.lua` 里 `TEMPLATE_GUIDS = { 1073741849, 1073742105 }` 逐个试 `InstantiateClientUIControl`，第一个成功的胜出 ——
**同一次构建在两边都能跑**，不需要为宿主改常量。真机若再次重编号，把它加到候选表首位即可。

### 10.4 引导状态机（时机精准 / 由简入深 / 可回溯）

| stage | 进入条件 | 重力 | 屏幕 |
| --- | --- | --- | --- |
| 0 等开始 | `OnStart` | 玩家方块**暂停**，但**脚本自己在玩**（AI 自演，见 §10.7） | 上横幅「俄罗斯方块」（26→40 渐大）、下横幅「按任意键开始」（呼吸）、左栏 hint「键盘操作」 |
| 1 游戏中 | 玩家按下第一个操作键 | 跑 | 横幅清空；左栏常驻「堆满一行即消除」；首次锁定 2.5s 提示；首次消行「一次消 4 行 +800」3~4s |
| 2 键位表 | 按 `H` | 暂停 | 下横幅显示完整键位，左栏「H 继续游戏」 |
| 失败 | 顶出 | 停 | **结算层**（见 §10.10）：全屏遮罩把棋盘压到 45% 亮度 + 居中面板（游戏结束 44 红 / 本局 X 分 30 金 / 最高 Y 24 / 消行·落块·等级 22 / [R] 再来一局　[Q] 结算明细 28），带 0→0.9s 四段入场动画；`Q` 在面板里多展开一行（等级/用时/消行率）。结算层不可用时自动退回布局横幅（40 红 + 26 一行） |

入场态的键**既开始游戏也执行该动作**（不吞键）：玩家按 ← 会立刻开始并左移一格，用例与手感一致。

### 10.5 预览图（真实渲染，不是示意图）

```bash
node qxqy/shot.mjs   # 出 docs/preview-guide.png（入场自演"堆到 4 行"那一帧，不是固定秒数）/
                     #    preview-ai-place-1/2/3.png（自演三个时刻的盘面，脚本会打印列高/最高列/中间深井）/
                     #    preview-ai-pace-1/2/3.png（**同一块方块**三个时刻，x 各不同，用来证明逐格横移）/
                     #    preview-play.png / preview-clear.png /
                     #    preview-settle-anim-1.png（结算动画 settleT≈0.2s）/
                     #    preview-settle-anim-2.png（settleT≈0.5s）/
                     #    preview-gameover.png（settleT≈1.0s 稳定帧）/ preview-gameover-detail.png（Q 明细）/
                     #    preview-after-restart.png（按 R 重开后：结算层必须已销毁、盘面干净）/
                     #    preview-shake-base.png（抖动前基准）+ preview-shake.png（消行抖动中的帧）
python3 qxqy/shake-ab.py   # → docs/preview-shake-ab.png：上面两张的棋盘左上角 4× 放大左右对照
```

结算那三张是**逐帧检测"游戏结束出现的那一帧"**再按固定步数抓的（`isOver()` 每落一块查一次），
所以中途帧的 `settleT` 是准的；如果改成"隔 3 帧采样"，动画早已跑完，抓出来的三张会一模一样。

链路：`createStudio(存档)` → `playStart({canvasId:'mobile-16-9'})` → `playKey`/`playStep` 步进 →
`playGet({view:true})` 取 `scene` → `renderScenePng` 落 PNG。
⚠️ 不要用 `playRun(frames)`：它内部会 `playStart()` **重开会话**，注入的按键全部丢失（实测踩到）。

### 10.6 手机按钮（客户端 cursor 热区）

| 项 | 做法 |
| --- | --- |
| 标签 | 6 个服务端 textbox（`btnA`…`btnF`，150×56，`bgColor` 当按钮底） |
| 点击 | 客户端模板 `hit`（kind **cursor**）实例叠在标签之上，`AddCursorEventListener(Enum.CursorEventType.CursorDown, fn)` |
| 为什么不用 textbox 接点击 | `AddCursorEventListener` 只存在于 **cursor / button** 两类控件（`client/lua-runtime/src/scene.js:64-71`），image/textbox 都没有 |
| 布局 | 左列 ← → ↓（x=-410，y=-185/-250/-315），右列 旋转 直落 重开（x=+410）——最下一行留 18px 离底边，-332 时整块贴边被裁（实测） |
| 降级 | hit 模板 guid 探测失败时打印 `hits=0 click disabled`，键盘照常可玩 |

### 10.7 一键部署

```bash
node qxqy/deploy.mjs               # 重建 + 复制 GIA 到 Beyond_Local_Export + 写地图 external_lua_file
node qxqy/deploy.mjs --calibrate    # 先读真机 GIL 里 cell/hit 的实际 guid 写进 TPL_GUIDS，再重建部署
```

`build.mjs` 会把本工程的模板 guid 注入 Lua（`__GUID_CELL__` / `__GUID_HIT__`），所以模拟器恒命中；
真机导入后编辑器重编号的值由 `--calibrate` 补进候选表首位。

### 10.8 真机导入后要核对的三件事

```bash
# ① 模板 guid 是否又变了（变了就加到 main.lua 的 TEMPLATE_GUIDS 首位）
export GSTS_LOCALLOW_DIR=$HOME/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow
npx tsx src/cli/gsts.ts assets:ui list --flat | head -20
# ② 10 个服务端控件名是否都在（GetChild 按名字取，名字变了就不显示）
# ③ 真机日志里应有：canvas WxH / tpl guid=… / cellCount=200 / listen ok … / guide stage=1
```

### 10.9 入场「AI 自演」（2026-10-24 第四轮：贴边选位 + 人手节奏）

`guideStage == 0` 时脚本自己玩，玩家按任意键立刻交还控制（`startIfWaiting` 置 stage=1，`autoTick` 首行即 return）。

**选位（像人会放的位置）**
- El-Tetris 四项权重（原样）+ 两项小修正：`-0.06×离最近墙的列距`（贴边偏好，只是 tie-breaker）、
  `-0.9×深度`（对每个 **1 列宽、深度 ≥3 的中间凹槽**——不许为了塞竖 I 在中间挖井；墙边空列不算井）。
- 同分优先：离墙更近 → 离当前列更近 → 更靠左。
- **竖 I 专项**：贴墙候选只要不比最优差 1.2 分就改放墙边（左右都行时一样平取左墙）。
  实测 300s 内 14 块 I：**列 1 放 7 块、列 9 放 5 块**，只有 2 块落在中间。
- 三层优先级：①能消行且不超高 ②不超高 ③都不行就清盘（`AI_RESET_ROWS=12`）。

**执行（像人在操作）**：`thinking(观察) → acting(旋转/分段横移/小落) → hovering → dropping(软降/硬降)`
- 观察 0.25~1.2s 完全不动（按整块预算补足，保证单块 ≥1.5s）→ 旋转 0.15~0.25s/次 + 间隔 0.1~0.2s
- 横移**每次 1~2 格**，两次之间 0.08~0.25s；途中 35% 概率**软降 1~2 格**再继续横移
- 到目标列后 20% 概率回退一格再回来；落定前 40% 概率停 0.2~0.4s
- 最后一格 **50% 软降逐格落**（每格 0.06~0.12s，途中 30% 概率横调 1 格）/ **50% 硬降**；单块总时长 **1.5~3.5s**
- 日志：每块一条 `demo pace think=… rot=… move=N*GAP soft=… hover=… drop=soft|hard total=…`，
  每个动作一条 `demo act rot|move|soft|drop|nudge|hover`，另有 `demo plan name=… from=… target=…`。

**实测（300s 连续自演，种子固定可复现）**
- 单块时长：min **1.57s** / p25 2.20 / 中位 **2.57** / p75 2.97 / max **3.50**，平均 **2.58s**；软降占比 53%
- 最高列高 **10**（中位数 8），消行 **16 ÷ 110 块 = 14.5%**，清盘 4 次/300s

**踩过的坑**
1. 算列高 `for r = ROWS,1,-1` 从底往上扫 ⇒ 高度恒为 1，评估函数全错（消行率 0.6%）。必须从上往下扫。
2. `aiChoose` 旋转盒边长用 `#cells`（恒 4）而不是 `piece.n`（O=2/T,S,Z,J,L=3/I=4）⇒ 枚举出不存在的形状。
3. 把左右墙算进「崎岖度」⇒ 消行率 21.7%→8.4%（El-Tetris 原式不含墙）。
4. **软降用绝对时刻计时（`next = AI.t + per`）会慢 2~6 倍**：`AI.t` 在每次 `nextAction()` 归零，
   绝对时刻变成"等很久"（实测单块 8.3s）。改成**倒计时**（`timer -= dt`）后恢复正常。

### 10.10 结算层（2026-10-24 第三轮：独立一层）

**为什么必须单独一层**：布局里的服务端 textbox 层级低于运行时实例（200 个棋盘格永远在上面），
文字只要落在棋盘区域就会被吃掉（第二轮踩过：拿 cell 遮罩盖文字，文字没了）。

- **做法**：`buildSettleLayer()` 在 OnStart 里（棋盘格/预览/外框**之后**）调用
  `game.InstantiateClientUIControl(容器模板 guid, root)` **整棵实例化**，再 `layer:GetChild('名字')` 取子控件。
  真机模板 = 地图里已有的 `控件模板:客户端控件容器_1`（`1073741865`，16 个 textbox）；
  模拟器模板 = `qxqy/build.mjs` 里新增的 `settle`（`1073742107`，6 个 textbox）。
  两边子控件名不同 ⇒ Lua 用**候选名列表**（`findIn(layer, {'settleTitle','title'})`），一份代码两宿主都跑。
- **遮罩与面板**：用已有的 `cell` image 模板实例化两个实例（父 = 这一层）⇒ 同在实例层，压得住棋盘。
  **z 序坑**：运行时实例化是追加到子节点末尾 = **画得更上面**，所以造完必须
  `SetAsFirstSibling`（顺序：card → border → scrim），最终 z 序是 scrim → border → card → 文字。
- **动画（0→0.9s 四段）**：①0→0.45s 遮罩 alpha 0→140（棋盘压到 45%）、面板/描边/文字一起淡入
  ②0.15s 起标题自屏幕外滑入（ease-out 0.35s）③0.35s 起选项自下方滑入 ④0.55s 起标题脉冲 44→48→44
  （面板内标题框给 80 高，`48*1.45+4 = 73.6` 才画得下）。
- **懒创建 + 重开即销毁（2026-10-25 真机两 bug 的根治）**：结算层**不在 OnStart 建**，第一次 `gameOver`
  才建（`settle build ok n=9`），R 重开时 `DestroyClientUIControl` 整层销毁（`settle destroy n=10`）。
  旧做法是"OnStart 常驻 + `SetVisible(false)` 隐藏"，真机实测**隐藏不生效** ⇒ 开局白屏（那张全屏 image
  是 cell 模板实例、默认不透明）+ 重开后结算页残留。**不要再依赖 SetVisible 隐藏运行时实例。**
- **渐暗只走文字 alpha**：真机可能不认 `imageColor` 的 A 通道，所以 scrim/card/border **一次性给终值颜色**，
  0→0.9s 的淡入只作用在 6 个 textbox 的 `fontColor` alpha 上（这条通道真机一直在用）。
- **兜底**：模板探测失败、或实例化成功但子控件取不到（guid 撞车），都会 `settleLayer = nil`
  退化为布局横幅结算，玩家不会看到空白。
- 离线出图：`docs/preview-settle-anim-1.png`（settleT≈0.2s）/`-2.png`（≈0.5s）/`preview-gameover.png`（≈1.0s 稳定帧）。

**怎么复现结算页**：网页试玩（`http://127.0.0.1:4173`，工作区存档 `~/qxqy-workspace/tetris.save.json` 由 `deploy.mjs` 同步，改完刷新页面重新打开该存档）
→ 按任意键接管入场自演 → 连按空格（硬降）不消行地往上堆，堆到顶即出结算页；真机同流程（键盘 空格 = JumpKey/硬降，或手机按钮「直落」）。
离线复现：`node qxqy/shot.mjs` 会自己堆到顶并出 `docs/preview-gameover.png`。
