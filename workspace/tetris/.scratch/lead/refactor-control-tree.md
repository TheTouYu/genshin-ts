# tetris 控件树 · 层序清单（重构前取证）

> **只读分析**：未改任何源码、未跑 `build` / `runner`。所有行号用 `grep -n` / `awk 'NR>=a&&NR<=b'` 从**当前工作树**取。
> 配套：`.scratch/lead/refactor-audit.md`（结构/超长函数/重构候选 R1-R10/别动清单）。本文补它没有的那一半：**控件清单 + 层序（创建顺序）语义 + 手写样板**。

## 取证快照（重要：这份树正在被并发修改）

| 文件 | 行数 | sha256(前16) | mtime |
| --- | --- | --- | --- |
| `lua/main.lua` | **6842** | `7c1a319527fad5c9` | 2026-10-31 **17:42:20** |
| `lua/tetris/ui.lua` | 1092 | `da1674f8423f5ebb` | 17:00:16 |
| `lua/tetris/widgets.lua` | 190 | `0c67561f74282744` | — |
| `qxqy/build.mjs` | 283 | `4670ee8103a638e9` | 17:27:38 |
| `lua/tetris/roster.lua` | 581 | `3f0b66916219bcf3` | — |
| `lua/tetris/config.lua` | 888 | `a01c69ea095f4e82` | — |

**开工时 `main.lua` 是 6859 行；中途被改成 6842 行**（`git status`：`M lua/main.lua`、`M lua/tetris/render.lua`、`M lua/tetris/view_board.lua`、`M qxqy/build.mjs`、`?? lua/tetris/scenes.lua`）。HEAD = `207d01b7 refactor(tetris): 架构骨架 P0 —— 单向数据流分层 + headless mock 后端`。
⇒ **本文所有行号对应上表快照**；再有人改 `main.lua` 就会漂。刷新办法：`grep -n` 关键锚（`MS.build = function`、`function OnStart`、`HUD_INST.build = function`…），不要按行号盲改。

---

## 0. 判定口径（后面所有"压住/盖住"都按这个）

| # | 口径 | 证据（当前行号） |
| --- | --- | --- |
| 1 | **层序 = 创建顺序**：后建在上；**服务端 textbox 永远在运行时实例之下** | `main.lua:5854-5857`（A13 复盘）、`2680-2682`（展台压 HUD）、`3568-3569`（HUD 实例双写）、`ui.lua:715-716`（技能 HUD 空白白条） |
| 2 | **`SetAsLastSibling`/`SetAsFirstSibling` 在本引擎是空操作**（`tryCall` 走 pcall 吞失败）；新骨架已把它写进铁律 | `view_layers.lua:9-11`、`platform.lua:38-39`（mock 里两个方法都是空函数）；**但旧代码仍在用**：`main.lua:3320-3324`（`print('help restack …')` 是假成功日志） |
| 3 | 运行时实例父节点 = **`root`**（`script.object`）；`root.showCursor = true` 是 cursor 热区收到事件的前提 | `main.lua:5803-5805`；`main.lua` 的 28 个创建点全部传 `root` |
| 4 | 「隐藏」在真机不可靠 ⇒ 代码用**挪出画布**(`y=-4000`)当隐藏 | `main.lua:5867-5871`、`ui.lua:643-651`、`main.lua:5785-5791` |
| 5 | **校题**：任务简报说的"755 行 layout 函数"实测是 `layout`(5771-5796，26 行，0 个 Instantiate) + **`OnStart`(5802-6489，688 行)**；755 是两者区间的合称 | `grep -n '^layout = function\|^function OnStart'` → 5771 / 5802 |

**抽样回验 5 处（命令 + 实测输出，均已对过）**

| # | 断言 | 命令 | 实测 |
| --- | --- | --- | --- |
| 1 | 棋盘已迁到 v6 渲染路径（按语义层号建） | `awk 'NR>=5896&&NR<=5922'` | `5907 BR.apply(VB.board{…})` → `5912 g.plate = BR.ctl('boardPlate')` → `5922 if #BR.issues() > 0 then …` ✅ |
| 2 | 假置顶仍在旧路径上活着 | `awk 'NR>=3318&&NR<=3326'` | `3322 … tryCall(HL[i], 'SetAsLastSibling')` + `3323 print('help restack n=' …)` ✅ |
| 3 | 服务端控件按名寻址 | `awk 'NR>=5946&&NR<=5948'` | `5946 title, hud, hudNext, best = find('title'), find('hud'), …` ✅ |
| 4 | 角色元数据 4 张表 | `awk 'NR>=3747&&NR<=3755'` | `3747 FN.SKCOL` / `3753 FN.SKROLE_NAME` / `3754 FN.SKROLE_SKILL` / `3755 FN.SKROLE_ELEM` ✅ |
| 5 | 创建点计数 | `grep -c 'pcall(function() return game.InstantiateClientUIControl'`；`grep -n 'game.InstantiateClientUIControl' \| grep -v pcall` | main.lua **22 pcall + 6 直调**；widgets 3；platform 3；render/ui/roster/view_board **0** ✅ |

---

## 0.5 现状：目标架构的骨架**已经落地一半**（读这份清单前必须知道）

工作树里已有 5 个 v6 模块（`main.lua:321-325` 装配）：

| 模块 | 行数 | 干什么 | 现状 |
| --- | --- | --- | --- |
| `lua/tetris/platform.lua` | 245+ | 引擎适配层：`P.inst/P.destroy/P.set/P.get/P.call/P.find`；**唯一允许直接 `game.*` 的地方**；带 **mock 后端**（可在 lua5.3 headless 跑） | ✅ 已用（棋盘） |
| `lua/tetris/view_layers.lua` | 52 | **语义层序单源**：`wash 10 / bg 20 / plate 25 / board 30 / frame 35 / hud 40 / panel 50 / card 60 / touch 70 / toast 80 / modal 90 / debug 99`；`SERVER_TEXT_CEILING = 0` | ✅ 已用（棋盘） |
| `lua/tetris/render.lua` | 226 | 描述→控件协调器：**按 layer 排序创建**、增量更新、销毁；检测"需要下沉到已有控件之下"→ 记 issue 并重建（**让 bug 暴露**） | ✅ 已用（棋盘） |
| `lua/tetris/view_board.lua` | 79 | 棋盘几何纯函数（背板/200 格/4 框的节点描述；`cellPos/framePos`） | ✅ 已用 |
| `lua/tetris/scenes.lua` | 202 | **场景栈**（title/help/play/settle 显式 push/pop；`view()` 按 layer 合成视图；`opaque` 裁下层） | ⚠️ **新文件、未接线**（`grep -n 'scenes' lua/main.lua` 0 命中） |

**已迁移 vs 仍在旧路径**

| 屏/层 | 迁移状态 | 创建路径 |
| --- | --- | --- |
| 棋盘（背板/200 格/4 框） | ✅ **已迁**（`main.lua:5896-5922`，node → `BR.apply`） | `platform.P.inst` ← `render.lua:96-112` |
| NEXT/Hold 预览 12 件 | ❌ 仍裸建（`main.lua:5930-5941`，`5932` 直接 `InstantiateClientUIControl`） | 直接引擎 |
| 背景池 16 件 + wash | ❌ 旧（`main.lua:5877-5894`，`instInto`） | `widgets.instInto` |
| 标题展台 / 四模式卡 / 热区 | ❌ 旧（`MS.build` 2637、`MS.modes` 3026、`buildHoverZones` 3219） | pcall 直调 |
| 说明页 | ❌ 旧（`buildHelpLayer` 2157） | pcall 直调 |
| 结算层 | ❌ 旧（`buildSettleLayer` 569、`MS.opts` 733） | 混合：`instInto` + pcall |
| HUD 文字实例 10 件 | ❌ 旧（`HUD_INST.build` 3577） | pcall 直调 |
| 角色档案 / 手机 pad / 技能栏 | ❌ 旧（`roster.lua`、`ui.lua`） | `UI4.pill/label/hit` → `instInto` |
| 倒计时大字 | ❌ 旧（`buildCountBig` 2473） | 直调 |

⇒ **本文的价值**：把这半张旧图逐件列清，并给出每件应落的 `view_layers` 档位（§4.0），让"迁移下一屏"时有对照表，而不是从 688 行的 `OnStart` 里重新挖。

---

## 1. 服务端控件清单（`qxqy/build.mjs` → `tetris.save.json` guid）

服务端资产根 `客户端控件容器` guid **1073741850**；唯一容器 `容器节点 n1` guid **1073741851** = **脚本宿主 + 全部控件父节点**（`build.mjs:71-75` 删 n2–n11；`build.mjs:200-208` 把 `main.lua` 挂到 `controlId: n1`）。

| name | 类型 | 父节点 | 声明处（build.mjs） | 用途 | 可被脚本按名寻址 |
| --- | --- | --- | --- | --- | --- |
| `客户端控件容器`(1073741850) | server-container 根 | — | `72` | 资产根 | 否 |
| `容器节点 n1`(1073741851) | container | 上者 | `71-75`、`200-208` | 脚本宿主 / UI 父节点 | 否（资源 id） |
| `hud` | textbox | n1 | `89-92` | 左栏数据（得分/消行/等级/已填） | ✅ `find('hud')` @5946 |
| `hudNext` | textbox | n1 | `93-96` | 「下一个」 | ✅ @5946 |
| `title` | textbox | n1 | `97-100` | 模式/结算大字 | ✅ @5946 |
| `best` | textbox | n1 | `101-104` | 最高分 | ✅ @5946 |
| `hint` | textbox | n1 | `105-108` | 提示语 | ✅ @5947 |
| `keyA` | textbox | n1 | `109-112` | 键位卡 1 | ✅ @5947 |
| `keyB` | textbox | n1 | `113-116` | 键位卡 2 | ✅ @5947 |
| `keyC` | textbox | n1 | `117-120` | 键位卡 3（双屏改战况） | ✅ @5947 |
| `btnA`~`btnF` | textbox（`bgColor=#B31A1D26`） | n1 | `122-133`（表 `124-125`） | **退役**老手机按钮 ←→↓/旋转/直落/重开 | ✅；`layout` 每屏 `SetVisible(false)`+挪 `(0,-4000)`：`main.lua:5785-5791` |
| `topBanner` | textbox | n1 | `134-137` | 顶横幅 | ✅ @5948 |
| `botBanner` | textbox | n1 | `138-141` | 底横幅 | ✅ @5948 |

**可寻址机制与失败态**：`find` = `widgets.find`（`widgets.lua:81-87` `root:GetChild(name)`，内部 pcall）。`main.lua:9`「GetChild 不受模板 guid 重编号影响」；`main.lua:5344`「名字一变整排静默消失」。
⇒ 这 16 个名字是**跨层契约**：工厂/场景不能改名（改名 = 真机静默消失、不报错）。

---

## 2. 客户端模板清单（`build.mjs:20-69`；guid 由 `tetris.save.json` 解出并核对）

| 模板名 | guid 常量/来源 | guid 值 | 能力 | 当前实例化点（数量） |
| --- | --- | --- | --- | --- |
| `cell` | `T_CELL`（build.mjs:13）/ `TPL_CELL`（main.lua:155） | **1073742105** | **image**：`imageColor` + `SetImage(StaticReference, 100001..100006)`；**无 cursor** | 代码点 **11**：`main 769,2183,2545,2997,3336,3346,3369,3456` + `instInto` 5 处（`631-641,5401,5538,5879`）+ `platform.P.inst`（render 棋盘）⇒ 常驻 ≈ 217（棋盘）+ 展台/结算/pad |
| `hit` | `TPL_HIT`（main.lua:156，懒探测） | **1073742106** | **cursor**：唯一能 `AddCursorEventListener` 的模板（`build.mjs:26-27`） | 代码点 **6**：`891`（结算热区）、`2718`（入口卡）、`3224`（模式卡）、`3249`（说明）、`5424`（手机按钮）、`5865`（OnStart 探针）+ `UI4.hit`(5565,`instInto`)、`instHit`(5432) ⇒ ~30+（手机 pad 19 颗） |
| `settle` | `TPL_GUIDS.settle[1]`（config.lua:23-39） | **1073742107** | **container**（1 容器 + 6 textbox）；**真机不可实例化**（返回 nil） | 1：`530`（`probeSettleContainer`）→ 失败回落 `stext`（`build.mjs:60-61`） |
| `settleTitle` | 容器子件，按名取 | **1073742108** | text | 容器路径 0 次（直接用子件）；回落路径由 `616` 重建 |
| `settleScore` | 同上 | **1073742109** | text | 同上 |
| `settleBest` | 同上 | **1073742110** | text | 同上 |
| `settleInfo` | 同上 | **1073742111** | text | 同上 |
| `settleExtra` | 同上 | **1073742112** | text | 同上 |
| `settleOpts` | 同上 | **1073742113** | text | 同上；`main.lua:729-731`：三选项改实例层后**保留但隐藏**（不隐藏就重影） |
| `stext` | `TPL_GUIDS.settleText[9]`；`probeSettleTextbox`(554) → `TPL_TEXT`(2132) | **1073742114** | **text**：text/fontSize/fontColor/bgColor/enableOutline/outlineColor/双对齐 | 代码点 **10**：`604,616,635`（结算六行）、`837`（选项文字）、`2228`（说明页）、`2477`（倒计时）、`2557`（MS.addText）、`3007`（mcText）、`3080`（menuSub）、`3585`（HUD 10 件）、`5408`（instText）、`5548`（label）⇒ 常驻 ≈ 10(HUD)+12(展台)+6(结算)+19(pad)+135(roster) |

**guid 稳定性**：`config.lua:23-39 TPL_GUIDS` 是**真机重编号的校准入口**（cell 4 候选 / hit 5 / settle 4 / settleText 9），`build.mjs:233-235` 有 `cellGuid !== T_CELL` 断言。
⇒ 工厂必须保留「**候选 + 能力探测**」（`platform.lua:24-25 DEFAULT_ACCEPTS = {cell:'image', hit:'cursor', stext:'text'}` 就是新实现），不能写死单 guid。

---

## 3. 全部 `InstantiateClientUIControl` 调用点（重构后：main 28 + widgets 3 + platform 3）

- `main.lua`：**22 pcall 包裹 + 6 直调**（+1 处假调用 `5481`：`if type(...)=='function' then end` 死代码）
- `lua/tetris/widgets.lua`：**3**（`126/146/163`，`probeTemplate` 内部，工厂本体）
- `lua/tetris/platform.lua`：**3**（`143/151/170`，`P.inst` 的候选试探 + 能力校验，**新路径唯一入口**）
- `render.lua` / `ui.lua` / `roster.lua` / `view_board.lua`：**0**（都经注入的 `P.inst` / `spec.instCell`）

> 父节点一列：**全部 `root`**（例外只在 `instInto(gs, parent, …)` 的参数位，main 传的都是 `root`）。

| 行号 | 模板 | 结果挂到 | 用途 | 创建时机 | 层序意图（该压在谁上面） |
| --- | --- | --- | --- | --- | --- |
| `530` | settle 容器候选 | 局部（不合格 Destroy） | 探容器结构/子件名 | 首次结算 | 无（探针必须销毁） |
| `556` | stext 候选 | 局部（用完 Destroy） | 探文字模板 | 首次需文字 | 无 |
| `604` | stext | `g.settleLayer` 成员 | 缺槽补 1 行 | 首次结算 | 遮罩/面板之上 |
| `616` | stext | 成员（先 Destroy 占位） | 替换容器自带占位 | 首次结算 | 同上 |
| `635` | stext | 成员 ×6 | 结算六行（v2.4② 重建） | 首次结算 | scrim < border < card **< 文字** |
| `769` | cell | `rec.parts` | 选项胶囊（每胶囊 2 矩形+4 角圆） | 首次结算 | 面板之上 |
| `837` | stext | `rec.text` + `SETTLE_HOTS` | 选项文案 | 首次结算 | 贴片之上 |
| `891` | hit | `SETTLE_HOTS` | 选项热区（三态+点击） | 首次结算 | **最后 ⇒ 命中优先** |
| `2183` | cell | `HL` | 说明页图元（暗底/框/纸面/星/键帽/卡） | 打开说明页 | 晚于展台（开页前拆展台 `2499-2502`） |
| `2228` | stext | `HL` | 说明页文字 | 同上 | 对应图元之后 |
| `2545` | cell | `MS.parts`（`MS.addCell`） | 展台图元（墙/缝/框/刻度/胶囊/点） | 每次回标题 | 背景池之上、模式卡之下 |
| `2557` | stext | `MS.parts`（`MS.addText`） | 展台文字 | 同上 | 展台图元之后 |
| `2718` | hit | 入口卡 `hit`（`CTL.addHit`） | 「角色档案/说明」热区 | 同上 | 贴片/文字之后 |
| `2997` | cell | `MC`（mcCell） | 四模式卡底/发丝线 | 同上（`MS.modes`） | 展台之上 |
| `3007` | stext | `MC`（mcText） | 卡标题/特色句/详情 | 同上 | 卡底之上 |
| `3080` | stext | `sub`（menuSub） | 副题 | 同上 | 卡之后 |
| `3224` | hit | `MS.zones[i]` | 四模式卡三态热区 | 同上（最后调 `3219`） | **最后建 ⇒ 最上** |
| `3249` | hit | `MS.helpZone` | 底栏「H 说明」热区 | 同上 | 同上 |
| `3336` | cell | `g.plate`（G[2]） | 双屏 P2 背板 | 首次双屏（`3332`） | P2 格之前 |
| `3346` | cell | `g.cells[i]`（200） | 双屏 P2 格 | 同上 | 背板之上 |
| `3369` | cell | `g.frames[i]`（4） | 双屏 P2 框 | 同上 | **格之上** |
| `3456` | cell | `DUAL_DECO[1..2]` | 中缝线 + 分隔点 | 首次 `FN.layoutDual`（懒建） | 两盘之上 |
| `3585` | stext | `HUD_INST[nm]`（10） | HUD 文字实例份 | OnStart（`5968`）+ 画布变更（`6589`） | **压背景池/wash**（`3568-3569`）；但建在展台之后 ⇒ 标题页靠 `hideAll` |
| `5408` | stext | 调用方（`UI4.instText`） | 手机按钮文字 | 移动端 pad | 贴片之上 |
| `5424` | hit | 调用方（`UI4.instHit2`） | 手机按钮热区 | 移动端 pad | **每颗键最后建** |
| `5548` | stext | 调用方（`UI4.label`） | 通用文字（roster/技能栏） | 角色页/技能栏 | 各自贴片之上 |
| `2477` | stext | `CNT` | 倒计时 120 号 | 开局 3/2/1（`6069`、`6468`） | 先 `destroyCountBig` 再建 ⇒ 每次置顶 |
| `3080`→见上 | — | — | — | — | — |
| `3336`/`3346`/`3369`→见上 | — | — | — | — | — |
| `5932` | cell | `g.preview[i]`（12：8 next + 4 hold） | NEXT/Hold 预览 | OnStart | 格之后；**唯一没进 v6 渲染的棋盘族控件** |
| `widgets.lua:126/146/163` | 未知候选 | 局部（除 cursor 探针） | 模板探测 | 首次需要模板 | 无（探针） |
| `platform.lua:143/151/170` | 候选 guid | 返回给 `render.create` | 新路径实例化 + 能力校验 | 每次 render 新建节点 | 由 `node.layer` 决定 |

**这张表暴露的第一性问题**：创建点分属**三条互不相通的路径**——`platform.P.inst`（有层号）/ `widgets.instInto`（无层号，靠调用顺序）/ 裸 `game.*`。层序语义只在第一条上存在。

---

## 4. 按屏层序表（编号 = 实际创建顺序，后建在上）

### 4.0 层号映射建议（把 §4.1-4.9 的旧顺序对到 `view_layers`）

| 旧元素 | 建议 layer | 说明 |
| --- | --- | --- |
| `bgPool[1]`（wash） | `wash 10` | 整屏底色，必须最先 |
| bgPool 其余 + `MS` 展台深空墙/装饰/刻度 | `bg 20` | 遮住棋盘外区域 |
| `boardPlate` | `plate 25` | 格缝网格线来源 |
| `cell1..200` | `board 30` | |
| `frame1..4` | `frame 35` | 框在格上 |
| NEXT/Hold 预览、HUD 文字实例、键位卡 | `hud 40` | 常驻信息 |
| 结算 `settleScrim`、说明页 `helpBg`、roster `charDim` | `panel 50`（或 `modal 90` 若要盖住 pad） | 遮罩/面板底 |
| 面板上的文字/色块/条目/选项贴片 | `card 60` | |
| 所有热区（模式卡/入口卡/结算选项/面板关闭/手机 pad 键/技能卡） | `touch 70` | **必须高于 card**，否则点不到 |
| `countBig` 倒计时、飘字/横幅 | `toast 80` | |
| 模态浮层内容（说明页/角色页/结算卡） | `modal 90` | 与 scenes 的 `opaque` 配套 |
| 探针 | `debug 99` | 或干脆不建（见 §4.1#2） |
| 服务端 textbox | `SERVER_TEXT_CEILING 0` | 只用于服务端控件之间的排序，**压不住任何实例** |

### 4.1 标题 / 模式选择屏（`buildMenuCards` = `3307-3326`）

| # | 元素 | 创建处 | 标记 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | cell 探针 | `5849`（`probeTemplate`） | 🟢 | 整屏最先建 ⇒ **最底**，用完必须 Destroy（`5858`），否则 A13「左上角灰方块」 |
| 2 | hit 探针 | `5865` | 🟡 | 挪 `(0,-4000)`+缩 4×4（`5870-5871`）；注释（`5862-5863`）称"复用给手机热区"，**实际无消费点** ⇒ 死实例 |
| 3 | `bgPool[1..16]` + `wash` | `5877-5894` | 🟢 | 「池必须最先建」`5874-5876` |
| 4-6 | 棋盘背板 / 200 格 / 4 框 | `5896-5922`（**v6 render**） | 🟢 | 层号 plate25 < board30 < frame35，**不再依赖写的顺序** |
| 7 | `next1..8`/`hold1..4` | `5930-5941` | 🟡 | 仍是裸建（`5932`）；层序仍靠"比棋盘晚" |
| 8 | `menuWallL/R/T/B` + `menuSkyT/B` | `2647-2653` | 🟢 | 深空墙把视窗外压暗 ⇒ HUD/预览退场（`2680-2682`） |
| 9 | `menuDeco*` | `2656` | 🟢 | |
| 10 | `menuShadeT/B/L/R` + `menuBezelT/B/L/R` | `2658-2665` | 🟢 | |
| 11 | `menuTickH/V*` | `2667-2671` | 🟢 | |
| 12-13 | `menuBanner`(2678)+`menuBannerRule`(2681) → `menuBig`(2683) | `2678-2683` | 🟢 | 标题在横幅上 |
| 14-16 | `menuHint1..3`(2697-2699) → `menuBuildTag`(2704) → `menuDot1/2`(2706-2707) | `2697-2707` | 🟢 | |
| 17 | 入口卡（角色档案/说明：贴片→文字→**热区**） | `2711-2790`（`CTL.btn` 2749 / 2768，zone 2780-2781） | 🟢 | `CTL` 六件套 |
| 18-19 | 四模式卡底（mcCell）→ 卡文字（mcText）+ `menuDetail` | `3026-3120` | 🟢 | 展台之上 |
| 20 | `menuSub` | `3080` | 🟢 | |
| 21 | `menuZone1..4` + `menuHelpZone` | `3224`、`3249` | 🟢 | 「最后建 = 最上层」（`3318` 注释） |
| 22 | `HUD_INST` 10 件文字实例 | `3585`（`5968` 调用） | 🔴 | **建在 8–21 之后 ⇒ 压展台**；标题页靠 `HUD_INST.hideAll()`（`3643`）藏，而 hideAll 是 `SetVisible+挪 -4000`（`1525`、`5970-5972`）⇒ **用状态补层序** |
| 23 | 手机 pad（mobile） | `ui.lua:604-639`（`U.sync` 第 6 帧后 `927-928`） | 🔴 | 最后建 ⇒ **永远最上**；标题页只登记 help/roster，其余建完即挪 `-4000`（`ui.lua:560-565`） |

**本屏三处隐患**
1. 🔴 **`3320-3324` 假置顶**：`SetAsLastSibling` 循环 + `print('help restack n=')`。引擎里空操作 ⇒ 死代码 + 假成功日志。真实修法在 `2499-2502`（开页前拆展台）与 `roster.lua:51-53`。
2. 🔴 浮层与展台的上下关系**靠调用方纪律**：说明页 `2499-2502`、角色页 `roster.lua:51-53`、回标题 `3311-3314`(destroyMenuCards 先)、手机 pad `ui.lua:700-706`。任一新入口忘拆 ⇒ 双层叠印（2026-10-30 用户连报三轮）。
3. 🟡 hit 探针注释与代码不一致，且它在整屏最底——若真被复用为热区，会被 wash/背板压住（A13 同型）。

### 4.2 说明页（H / 点击「说明」；`buildHelpLayer` = `2157-2450`）

| # | 元素 | 创建处 | 标记 |
| --- | --- | --- | --- |
| 0 | 先 `destroyHelpLayer()`（`2142`）+ 打开前拆展台（`2499-2502`） | | 🟢 |
| 1-3 | `helpBg` → `helpFrame` → `helpBoard` | `2262-2264` | 🟢 |
| 4-8 | `helpStar` → `helpEyebrow` → `helpTitle` → `helpSub` → `helpRule` | `2265-2269` | 🟢 |
| 9 | `helpHint`（右对齐，避让关闭胶囊） | `2272` | 🟢 |
| 10 | 派蒙气泡（`helpBubble`/`helpBubble2`/`helpPaimon`） | `2277-2279` | 🟢（v5.19 曾压住「合上手册」） |
| 11 | 左栏键帽（每键 = rrect + text） | `2282+`（`caps()`） | 🟢 |
| 12 | 右栏四张模式卡（`helpCard`） | A 版 `2300-2315` / C 版 `2372-2398` | 🟢 |
| 13 | 底部分值柱 + 规则小字 | A 版 `2317+` / C 版 `2401+` | 🟢 |
| 14 | 关闭胶囊 `helpClosePill` + `helpCloseHit` | `2426-2433` | 🟢 **最后建 ⇒ 永远最上** |

隐患：🟡 元素 ≈ 326（真机日志 `guide help on n=326`），换版式/换页全量重建（同页复用 `2505-2510`）；🟡 版式 A/B/C 三套建序（外层 `if v == 'B' … elseif 'C' …`）各写一遍，层序意图不集中。

### 4.3 角色档案（I / F / 名册键；`roster.lua`）

| # | 元素 | 创建处 | 标记 |
| --- | --- | --- | --- |
| 0 | 先 `env.teardownMenu()`（`roster.lua:51-53`，注释原话"层序铁律…SetAsLastSibling 不可靠"） | | 🟢 |
| 1 | `charDim` 全屏暗罩 | `roster.lua:215` | 🟢 |
| 2-3 | `charCard` 面板 → `charTop` + `charRule` | `216-218` | 🟢 |
| 4 | `charTitle`/`charHint` | `219-220` | 🟢 |
| 5 | 左列表行（pill + 文本 + `charItemHit`） | `267+`、`391` | 🟢 |
| 6-7 | 右详情（页签/天赋/数值）+ `charDetailHit` | `378-390`、`451` | 🟢 |
| 8 | `charFoot` | `467` | 🟢 |
| 9 | 「合上」按钮（`CTL.btn`，最后） | `485-489` | 🟢 |

隐患：🟡 一次打开 ≈ **135 实例**（`char codex open n=135`，33 次 = 4455 次实例化；已有同角色同页复用 `173-176`）。

### 4.4 倒计时

`destroyCountBig()`（`2467`）→ `buildCountBig`（`2473`，实例化 `2477`），调用点 `6069`、`6468`。🟢 每次重建 ⇒ 永远在最上层；仍是实例（服务端 `title` 在它下面）。

### 4.5 玩法屏（`OnStart` = `5802-6489`，实际建序）

| # | 元素 | 创建处 | 标记 |
| --- | --- | --- | --- |
| 1 | cell 探针 → 立刻 Destroy | `5849-5859` | 🟢 |
| 2 | hit 探针 → 挪 `(0,-4000)` | `5865-5872` | 🟡 残留 |
| 3 | `bgPool` 1..16（wash=池第 1 件） | `5877-5894` | 🟢 |
| 4-6 | 棋盘（plate/cells/frames）**经 render 按层号建** | `5896-5922` | 🟢 |
| 7 | `next/hold` 预览 12 | `5930-5941` | 🟡 未迁 |
| 8 | 结算层：此处**不建**（懒建） | `5943-5944` | 🟢 |
| 9 | 服务端控件 `find` + `layout(W,H)` | `5946-5950` | 🟢（`layout` 只改几何，0 建控件） |
| 10 | `buildMenuCards()`（标题屏整套 8–21） | `5966` | 🟢 |
| 11 | `HUD_INST.build()` | `5968` | 🔴（见 4.1#22） |
| 12 | 输入注册（`listen` 起于 `5981`） | `5978-6489` | — |

隐患：🔴 **建序与屏幕语义混在一起**：先把棋盘点亮（3-6），再建标题展台（10），再建 HUD（11）⇒ "进局后棋盘在展台之下、HUD 在展台之上"只能靠建序 + 后续 hideAll/teardown 组合，没有一处声明。

### 4.6 结算屏（懒建：`showGameOver` `1738` → `buildSettleLayer` `569` + `MS.opts` `733`）

| # | 元素 | 创建处 | 标记 |
| --- | --- | --- | --- |
| 1-3 | `settleScrim` → `settleBorder` → `settleCard` | `631-633`（`instInto`） | 🟢 |
| 4 | 六行文字 | `635`（循环） | 🟢 |
| 5 | `settleBars` 装饰 | `641` | 🟢 |
| 6 | 三选项贴片（每胶囊 6 实例：2 矩形+4 角圆） | `769` | 🟢 |
| 7 | 三选项文字 | `837` | 🟢 |
| 8 | 三选项热区 `hotSettle<R/V/Q>` | `891` | 🟢 最后建 |
| 9 | 服务端 `settleOpts` **隐藏**（`729-731`） | `settleSetColors`/`layoutSettle`(5308) | 🟢 |

隐患：🟡 双路径（容器 vs 回落 stext+横幅）建序不同；🟡 重开销毁、下次 gameOver 重建 ⇒ 层序每次重决定。

### 4.7 双屏（`buildBoardControls` `3332`、`FN.layoutDual` `3432`，触发 `4565-4566`）

| # | 元素 | 创建处 | 标记 |
| --- | --- | --- | --- |
| 1-3 | `p2plate` → `p2cell1..200` → `p2frame1..4` | `3336`/`3346`/`3369` | 🟢 |
| 4 | `duoLane1`（中缝线）/ `duoLane2`（分隔点，懒建） | `3455-3463` | 🟢 懒建在最后 ⇒ 中缝压两盘 |
| 5 | 服务端 `hud/best/keyA-C/hint/hudNext` 显隐切换 | `3562-3564` | 🟡 用 SetVisible |

隐患：🟡 `DUAL_DECO` 建在"第一次双屏"那一刻；拆解分散（`cells/frames` 在 `3384-3405`，`DUAL_DECO` 在 `exitToMenu`）⇒ 漏一条残留中缝。

### 4.8 移动端 pad（`ui.lua:604-639`，触发 `ui.lua:927-928`）

每颗键建序（`ui.lua:534-567`）：`edge` 胶囊(3) → `bg` 胶囊(3) → `txt`(1) → **`hit`(1，最后=最上)** → 立刻 `placeBtnNow(b,true)` 挪出画布（`565`）。

| # | 元素 | 数量 | 标记 |
| --- | --- | --- | --- |
| 1 | `NUM.PHONE.items`（11 颗） | 11×8 = 88 实例 | 🟢 |
| 2 | `NUM.PHONE.nav`（4 颗） | 32 | 🟢 |
| 3 | 「次页」 | 8 | 🟢 |
| 4 | `NUM.PHONE.actions`（3 颗） | 24 | 🟢 |
| — | 合计 | **19 颗 ≈ 152 实例** | 例子上限 430（`main.lua:5857` 注释"当前常驻约 240"）⇒ 移动端 pad 吃掉约 1/3 |

隐患：🔴 pad 是"最后建的一批" ⇒ **永远最上**，每次进浮层都要 `UI4.padVisible(false)` 整体挪走（`main.lua:2904-2906`、`ui.lua:872-884`、`ui.lua:700-706`）；漏一处 = 「角色页底部残留合上按钮」。

### 4.9 技能栏 HUD（`ui.lua:711-764`）

| # | 元素 | 创建处 | 标记 |
| --- | --- | --- | --- |
| 1 | 卡底/竖条/条底（`instCell`） | `717-730` | 🟢 |
| 2 | 文字 5 件（`skRole/sk1name/sk1state/sk2name/sk2state`） | `741-745` | 🟢 |
| 3 | 能量条 | `747-749` | 🟢 |
| 4 | 技能卡热区 `skHit1/2` | `753-762` | 🟢 最后建 |

`ui.lua:715-716` 原话即层序铁律与事故：「卡底/竖条/条底必须先建，文字与能量条后建，否则白卡把角色名/状态/条全盖住（2026-10-29 lead 复核：技能 HUD 变成一块空白白条）」。

---

## 5. 手写 pcall 样板清单

**计数**：`main.lua` **43**（22 实例化 + 21 属性/方法）· `ui.lua` **8** · `roster.lua` **1** ⇒ **全仓 52 处**。
`widgets.lua` 自身 19 处是**工厂本体**（护栏实现），不算绕过；`platform.lua` 5 处（`143/151/170/198` + `226`）是新工厂本体。

### 5.1 main.lua：22 处实例化 pcall → 建议统一走工厂

| 行号 | 现状 | 等价写法 |
| --- | --- | --- |
| `530`/`556` | `pcall(… InstantiateClientUIControl(g, root))` | `widgets.probeTemplate` / `platform.P.inst` |
| `604`/`616`/`635` | 同上（stext） | `P.inst('stext', root)` |
| `769` | `pcall(…TPL_CELL…)` | `P.inst('cell', root)` 或 `FN.mkCell(name,w,h,color)` |
| `837` | `pcall(…TPL_TEXT…)` | `FN.mkText(name, txt, {size,color})` |
| `891` | `pcall(…TPL_HIT…)` | `FN.mkHit(name,w,h)` |
| `2183` | `pcall(…TPL_CELL…)` | `FN.mkCell` |
| `2228` | `pcall(…TPL_TEXT…)` | `FN.mkText`（说明页 `text()` 可删） |
| `2545`/`2557` | `MS.addCell`/`MS.addText` 本体 | 内部改调 `FN.mkCell/mkText` |
| `2718` | `CTL.addHit` 闭包 | `FN.mkHit` |
| `2997`/`3007` | `mcCell`/`mcText` 本体 | `FN.mkCell`/`FN.mkText` |
| `3224`/`3249` | `pcall(…TPL_HIT…)` | `FN.mkHit` |
| `3456` | `pcall(…TPL_CELL…)` | `FN.mkCell` |
| `3585` | `HUD_INST.build` | `FN.mkText` + `{name,w,h,fs,align}` 数据表（audit R5） |
| `5408`/`5424` | `UI4.instText`/`instHit2` 本体 | `FN.mkText`/`FN.mkHit` |
| `5548` | `UI4.label` 本体 | `FN.mkText` |

### 5.2 main.lua：21 处属性/方法 pcall（工厂已有 trySet/tryCall，属纯替换）

| 行号 | 现状 | 等价写法 |
| --- | --- | --- |
| `313` | `pcall(function() inst.text = value end)` | `trySet(inst,'text',value)` |
| `783`/`785` | `SetImage(枚举)` + 字符串回落 | `setImg(c, img)`（新 API，收敛 10 处） |
| `2200`/`2202` | 同上（说明页 `shape()`） | `setImg` |
| `2602` | `SetLocalRotation(0,0,rot)` | `setRot(c, rot)`（新 API） |
| `2607`/`2609` | `SetImage` 双形态 | `setImg` |
| `2883` | `pcall(function() c.text = '' end)` | `trySet(c,'text','')` |
| `2905` | `SetAnchoredPosition(0,-4000)` | `park(c)`（新 API，6+ 处同构） |
| `2976` | `MS.note.text = rec.text` | `trySet` |
| `3480`/`3482` | `SetImage` 双形态（`DUAL_DECO[2]`） | `setImg` |
| `3544` | `HUD_INST.holdLab.text = '暂存'` | `trySet` |
| `3575` | `inst.text = txt`（`HUD_INST.txt`） | `trySet`（与 `313` 同一件事写两遍） |
| `3706`/`3707` | `SetLocalRotation` 三参回落 | `setRot` |
| `3713`/`3715` | `SetImage` 双形态（`FN.skinBgItem`） | `setImg` |
| `5870`/`5871` | `hitSeed:SetAnchoredPosition/SetSizeDelta` | `park` + `tryCall` |

### 5.3 其余文件

| 文件 | 行号 | 现状 | 建议 |
| --- | --- | --- | --- |
| `ui.lua` | `57`/`58` | `SetLocalRotation` 三参→两参回落 | `WID.setRot` |
| `ui.lua` | `64`/`66` | `SetImage` 枚举→字符串 | `WID.setImg` |
| `ui.lua` | `510` | `cap:SetImage(Enum…, 100002)`（胶囊圆头） | `WID.setImg(cap, 100002)` |
| `ui.lua` | `650-651` | `b_pcall_ok` 用 `GetAnchoredPosition` 探活 | `WID.alive(c)` / `platform.P.alive` |
| `ui.lua` | `664` | `b.txt.text = b.label` | `trySet` |
| `roster.lua` | `376` | `icon:SetImage(Enum…)` | `WID.setImg` |
| `widgets.lua` | `40/50-54/69-72/109-111/166` | 工厂本体 | 保留为**唯一**护栏（`widgets.lua:6` 注释已声明） |

---

## 6. 重复模式清单

### 6.1 颜色运算：**11 处**同构实现

| 实现 | 当前位置 | 说明 | 真源建议 |
| --- | --- | --- | --- |
| `C(a,r,g,b)` | `config.lua:176` | ARGB 组装 | **config（已导出 `M.C`）** |
| `A(a,c)` | `config.lua:212` | 加透明度 | config（已导出） |
| `blend(base,c,k)` | `config.lua:221` | 半透预混 | config（已导出） |
| `A(a,c)`（copy） | `copy.lua:42` | 与 config.A 同构 | 删，改 `CFG.A` |
| `mix(c,k)` | `main.lua:753`（`MS.opts` 内） | 向白/向墨双向 | `CFG.mix` |
| `dimColor(v,ratio)` | `main.lua:971` | 压暗 | config |
| `MS.fade(v,k)` | `main.lua:981` | 向白淡化 | `CFG.fade` |
| `MS.over(base,c,k)` | `main.lua:2591` | **与 `config.blend` 逐行同构** | 删，改 `CFG.blend` |
| `mcRGB(color,a)` | `main.lua:3023` | **与 `config.A` 同构** | 删，改 `CFG.A` |
| `MS.hairline` 内联拆通道 | `main.lua:2579-2589` | `(color//65536)%256` 手拆 | `CFG.A` |
| `FN.skillDark(c,target)` | `main.lua:3772` | 按亮度压阈值（**唯一用 `/`+`math.floor`**，与 `//` 版行为不同） | `CFG.darken`（统一位运算） |

附带：`main.lua` **26 处 `C(255,…)`** 现算色；`FN.SKCOL`（`3747-3752`，`0xFF…`）与 `copy.ROLES[*].color` 同色双份。

### 6.2 字号 / 文字建法：**9 套建法 + 64 处 `fontSize`**

| 建法 | 位置 |
| --- | --- |
| `setText`（服务端 textbox 写文字） | `main.lua:309-314` |
| `HUD_INST.txt`（双写+抑制写入者） | `3570-3576` |
| `MS.addText`（含 1.45 框高兜底） | `2554-2577` |
| `mcText` | `3006-3022` |
| `buildHelpLayer.text()`（1.5+6） | `2231-2247` |
| `UI4.instText` | `5405-5419` |
| `UI4.label`（1.45+6） | `5546-5563` |
| `roster.lua TXT()`（1.45+6） | `roster.lua:201-207` |
| `HUD_INST.build` 内联 if 链 | `3577-3641` |
| `buildCountBig` 内联 | `2473-2490` |

**框高判据散落 6 处**：`848`（1.5+6）、`2239`（1.5+6）、`2572`（1.45+6）、`2683`（1.45+12）、`3118`（注释）、`3600`（1.45+8）；权威口径 `382` + `2140-2141`（引擎实测：`requiredHeight > 框高 ⇒ 整行不画`）。
⇒ **真源**：`FN.mkText(name, txt, {w, size, color, align})` 内部只算一次框高；`fontSize` 只允许整数（`roster.lua:202`：小数静默回落 24 号）。

### 6.3 角色名 / 元数据：**4 张表 + 2 份名单 + 5 处 fallback**

| 份 | 位置 | 内容 |
| --- | --- | --- |
| 1 | `main.lua:3747-3752` `FN.SKCOL` | 四角色主题色 |
| 2 | `main.lua:3753` `FN.SKROLE_NAME` | 纳西妲/刻晴/甘雨/少女 |
| 3 | `main.lua:3754` `FN.SKROLE_SKILL` | 技能名 |
| 4 | `main.lua:3755` `FN.SKROLE_ELEM` | 元素（**只定义未读**） |
| 5 | `copy.lua:44 M.ROLES` | **真源**：name/element/skill/color/color2 |
| 6 | `skills.lua:70 NUM.ROLES` + `72 START_ROLES` | 名单/解锁顺序 |
| 7 | `config.lua` `MODE_THEME` | 模式→角色色/tint/frame |
| 8 | `roster.lua:67-133 charData()` | 展示层再组一份 |
| 9 | `main.lua` `FN.skillName/skillSkill/skillColor/skillInk`（`3823` 等） | 「先读 COPY 再回落旧表」 |

**真源建议**：`copy.ROLES` 唯一；main 只保留取色/取名函数；`skills.NUM.ROLES` 改为派生（Lua 字典无序 ⇒ 需显式 `ORDER`）。

### 6.4 键位表：**真源 2 份 + 派生 4 处 + 裸 listen 17 处**

| 份 | 位置 |
| --- | --- |
| 真源 | `config.lua:142-155 NUM.KEYMAP`（含 `up` 成对） |
| 真源 | `config.lua:59 NUM.HOLD_KEY`（G = CraftspersonKey14） |
| 派生 | `config.lua:759+ NUM.PHONE` |
| 派生 | `config.lua:819-830 NUM.GAMEPAD` |
| 派生 | `main.lua PHONE_KEY`（双屏 P2 键表，`grep -n 'PHONE_KEY'`） |
| 派生 | `main.lua:5699` `'CraftspersonKey'..i` 兜底池 + `6051-6053` 排除集 + 数字键映射 |
| 裸 listen | `grep -c "listen('Keyboard" main.lua` → **17** |
| 文案 | `main.lua:19-27` 顶注 + `1506-1510 showKeymap()` 手写一行 + `ui.lua`/`roster.lua` 内按键串 |

**真源建议**：`NUM.KEYMAP` 单一表（动作→键×手柄×手机槽）；`showKeymap`/键位卡文案由表生成；17 处裸 `listen` 收进 `FN.registerInputs()`（audit R1）。

### 6.5 其他（引 audit，未重复取证）

布局几何 3 套（`layout`/`OnStart` 内联、`ui.lua` plan→apply、`HUD_INST.build` if 链）· 文案 2 套（`config.COPY` vs `copy.lua`）· 音效 2 套 + 3 别名。

---

## 7. 结论：三处最严重的层序隐患 + 迁移顺序建议

**最严重三处**

1. 🔴 **`main.lua:3320-3324` 的 `SetAsLastSibling` 假置顶**——空操作 + `print('help restack n=')` 假日志。它让"层序已被修"的信号是假的；任何人（人或代理）按日志判层序都会误判。删除它不改变观感（空操作），只移除假信号。
2. 🔴 **所有浮层的正确性都寄生在"调用方先拆底层"的纪律上**（说明页 `2499-2502`、角色页 `roster.lua:51-53`、回标题 `3311-3314`、手机 pad `ui.lua:700-706`）。四条路径各写一遍、无统一入口 ⇒ 新入口必踩"双层叠印"（已被用户连报三轮）。`scenes.lua` 的 `opaque`/栈正是解药，但**还没接线**。
3. 🔴 **手机 pad 与 HUD 文字实例"建得最晚 ⇒ 永远最上"**（`ui.lua:604-639` 19 颗 ≈ 152 实例；`main.lua:3585` 10 件）。它们靠 `padVisible(false)` / `hideAll()` 事后挪走（`SetVisible` 真机不可靠，只能挪 `-4000`）⇒ **用状态补层序**，漏一处就是「角色页底部残留合上按钮」这类 bug。

**迁移顺序建议（每步都能出图对比）**

1. **先接 `scenes.lua`**（零控件改动）：把 `helpOpen/helpFromStage/helpPage/guideStage/MODE_OVER/ROSTER.on` 收敛成栈；`render` 侧暂不动。收益：层序纪律从"四份手写"变"一处栈规则"。
2. **预览 12 件（`5932`）→ `view_board`+`render`**（`layer=hud 40`）：最小的一块迁移样板，能验证 render 的增量更新对 `renderNext` 抖屏无破坏。
3. **HUD 10 件（`3585`）→ node 描述**（`layer=hud 40`，文字规格表）：顺带把 `HUD_INST.build` 的 if 链变成数据（audit R5）。
4. **结算层**（`569`+`733`）→ `modal 90/panel 50/card 60/touch 70`：结算层是懒建的，迁移必须保持"首次 gameOver 建、重开销毁"的时序。
5. **手机 pad（`ui.lua`）最后迁**：它依赖 `UI4.regAdd` 巡检表与 `placeBtnNow` 探活，动它要连 `tests/` 的点击坐标一起改。

**与 `refactor-audit.md` 的分工**：本文 = 控件清单/层序/手写样板/重复份数（§1-§6）；audit = 超长函数、耦合、R1-R10 候选、别动清单、200-local 预算。

---

**自查**
- 六节都写了 —— 是（§1 服务端、§2 模板、§3 调用点、§4 按屏层序、§5 pcall、§6 重复），另加 §0 口径 / §0.5 现状 / §7 结论。
- 该标的都标了 —— 28 个 main 创建点 + 3 widgets + 3 platform 全部列行；52 处手写 pcall 全列行；重复模式全列行。
- 验证 —— 只跑只读取证命令（`grep -n` / `awk` / `python3` 解 `tetris.save.json` / `git diff`），**未跑 build、未跑 runner、未改源码**。抽样回验 5 处见 §0。
- 已知局限 —— ①行号对应 `main.lua` 6842 行快照（17:42:20），并发重构会漂；②`scenes.lua` 202 行只读到接口层（`register/push/pop/view/update`），未逐行审；③pad 的 152 实例数是按"每颗键 8 件×19 颗"推算，未跑运行时计数（模拟器 `playGet` 可验证）。
