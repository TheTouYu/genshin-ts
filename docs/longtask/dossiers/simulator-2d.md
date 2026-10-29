# 档案：模拟器 2D Lua 生产线 + 虹猫蓝兔（L3）

> 状态：当前推荐（**并行线之一 `sim-2d`**：2026-10-23 用户重新启用；线表与"谁在推"见 [`../LINES.md`](../LINES.md) §二；此前 10-16 起被 GUI 线挤停）
> 来源：用户 2026-10-23 本会话首条原话 + 仓库落盘物（`workspace/hmlt-qixia/**`）+ 2026-10-23 17:1x 实测读数
> 最近校验：**2026-10-29**（tetris v4.0 第 1 项：设备适配八件套落地；51/51 用例绿 73.0s + 全控件巡检 69 控件 0 死）
> 读法：动手前读 §一（定位）、§三（现状读数）、§五（下一步）；细节按 §六 指针跳，别通读

---

## 一、这条线是什么（一句话）

用**千星模拟器**（UI 控件 + Lua，无 GUI 抖动、可 `runCase` 批量回归）做 2D 游戏，再用 `gsts` 把产物送进**真机（真游戏）**。
**模拟器只是产线，终点是真机能玩通**——这正是"大佬的模拟器只覆盖 2D Lua，我们做的是真游戏"的接口处。

用户原话（2026-10-23，本会话首条，逐字）：

> 「我现在想恢复：给我们的项目融合大佬开发的千星2d lua脚本模拟器的能力。简单来说就是：大佬开发的功能，局限在2d的lua脚本。实际上，我们项目做的是真正的游戏。我们之前在 miliastra-beyond-simulator目录已经开发了一个2d的虹猫蓝兔的游戏了，从原型开始用lua重写了，现在缺素材，下一步就是去游戏里面打通并试玩。」

由此产生的本次任务判据（我们翻译，用户可改）：**把虹猫蓝兔送进真机、能操作、能通关；素材补到"看得下去"。**

## 一点五、当前主战工程：tetris v2（2026-10-27 起；hmlt-qixia 降为「等用户导入」）

用户 2026-10-27 给 tetris（12 用例全绿、真机已跑通 v1）提 **8 点反馈**（原话逐字见 `workspace/tetris/docs/v2-plan.md` §一）：①出块保底 ②下两块预览 ③Hold ④AI 走通用链路（音效/记分不少）⑤AI 大幅增强+难度分级（核心玩法）⑥四模式（休闲/AI对抗/双人/双人合作，后三者双屏）⑦对抗因素 ⑧进阶操作。

- **拆分**：T0 实例化重构（双屏地基）→T1 7-bag→T2 双预览→T3 Hold→T4 AI通用链路→T5 AI增强+难度→T6 四模式→T7 垃圾行→T8 进阶操作→T9 真机交付；四波次分工与协作纪律见 `workspace/tetris/docs/v2-plan.md`（commit 33ea9db6）。
- **团队**：lead（协调/裁决/真机）+ core-mechanics(T1/T2/T3/T8) + ai-driver(T4/T5) + modes-arch(T0/T6/T7)；共享任务板 task-1..10。
- **开工基线**：`node qxqy/runner.mjs` **12/12 PASS（2.2s）**，`lua/main.lua` 1961 行。
- **关键架构事实**：全部游戏状态是文件级单例（:116-154）⇒ 双屏模式必须先实例化重构（T0，波2 独占写窗口）；出块=纯 LCG 无 bag（:717/:918）；NEXT 仅一块（next1-4=一格四 cell）；无 Hold；AI=El-Tetris 1-ply+拟人 buildQueue（:1157/:1235）。

## 一点七、2026-10-28 tetris v2.7：用户 10 点反馈的处理（当前断点）

用户原话 10 点（`/longtask-dossier` 触发的那条消息）→ 处理结论与判据见
`workspace/tetris/docs/README.md` §11（逐条表：根因 / 修法 / 用例编号）。读数：

| 项 | 读数 | 层级 |
| --- | --- | --- |
| 回归 | **43/43 用例 PASS 63.7s**（`node qxqy/runner.mjs`） | 行为层（模拟器） |
| 语法门 | `lua5.3 -e 'assert(loadfile(...))'` 逐文件 OK（main + 3 模块） | 结构层 |
| 构建 | `node qxqy/build.mjs` → save 355,518 B / GIA 236,363 B / **4 条脚本映射** | 结构层 |
| 出图 | `docs/v27-title-hover.png`（卡片悬浮态）/`v27-help.png`（规则页三栏）/`v28-theme-{casual,aibattle,pvp,coop}.png`（四模式构图背景） | 真渲染帧（模拟器） |
| 真机 | **未验证**：未挂载脚本能否 require / require 前缀 / 重导后挂载是否还在 / cursor Enter-Exit 是否派发 | — |

**六类 bug 的根因（全部实测，不是推断）**：
1. **①⑧ AI 死亡≠玩家死亡**——三处 AI 专属旁路：`aiChoose` 无安全位 → `{reset=true}`/`nil` 各自 return（块永不落、
   不判负、不结算、每帧刷 `demo reset plan=too-high`）；`aiDrop` 尾部堆高看门狗**无条件** `demoLoopReset()`
   （接管中堆高被拽回标题页）；`aiDrop` 无条件 `autoDriving=true`（接管消分进 AI 账、死亡不更新最高分）。
   修法：顶死照常给输入→硬降→`spawn` 顶死→`showGameOver`→结算层；看门狗仅 `guideStage==0`；
   账本归属改**盘属性** `g.aiAccount`。
2. **②③ 同一根因**：V=`CraftspersonKey22` 同时在 43 键「任意键开始」兜底池里 ⇒ `exitToMenu` 置 `guideStage=0`
   后同一按键继续派发给兜底，标题页刚建好就被开局吃掉。修法：兜底排除 15/22 + 同帧消费标记。
3. **④ H 真键是 15 号**（`craftCodes[15]='KeyH'`），v1 绑的是 `CharacterSkill1Key`（=物理 E）⇒ 真机按 H 零反应。
4. **⑥ 点击误重开 = 手机热区 btnA-F 在 PC 也建也挂监听且从未摆位**（旧判断恒假）⇒ 6 个热区叠在画布中心。

**⑦ 返工记录**：用户复评「四种模式要设计四种主题的背景的。偷懒啦」⇒ 从「换底色」升级为四套构图（内置图元 100001–100006 拼：\n柔光带/靶环/斜纹/阵营色块/同心环/箭头/星点），背景池 16 件在 OnStart 建好、换模式只换肤（commit `2baf1111`）。\n\n**未决（等用户拍板 / 等真机）**：`05-open.md` 的 O-2026-10-28-1/2/3。

## 一点八、2026-10-29 tetris v4.0：用户四项迭代（**当前断点**）

用户 2026-10-29 原话四项（逐字要点，完整版见 `workspace/tetris/docs/README.md` §12）：
1. **设备适配**：a 手机两边背景缺失 b 移动端没有操控图标/按钮（习惯=左移动+旋转、右锁定+缓降+暂存）
   c 移动端不做多人但主页点击无反应，要有原神风文案引导去 PC d 部分按钮点击异常（帮助回不去、结算要点 Q）e 手柄没做
2. **文案不丰富 + 触发场景太少** → 收集更多文案+场景
3. **小草神 AI 辅助改造成技能** + 设计刻晴/甘雨/少女技能（联网收集本体机制）；一局最多两个前台主动角色、
   用得多/加点高效果更好、局内加点 + 局外养成（永久小提升）、初始只解锁小草神部分机制
4. **AI 能力重构**：最强 AI 不随速度收紧操作间隔、不会用 hold、不会攒多消行造垃圾；玩家可用 AI 太蠢且**故意犯错**更蠢

### 第 1 项交付（本会话，已闭环模拟器侧）

| 子项 | 落地 | 判据 |
| --- | --- | --- |
| a 背景满幅 | `applyModeTheme` 加 **cover 缩放** `bs=max(W/1280,H/720)`，坐标尺寸同乘 | 五画布 `bg cover ok bs=…`（1560→1.22 / 1280×960→1.33 / 16:9→1.00）；用例 47 |
| b 移动端控件 | **客户端实例三件套**（底图+文字+cursor）7 键：左 ◀ ▶ 旋转 / 右 锁定 缓降 暂存 / 右上 说明；坐标按画布现算 + 连发 0.26/0.075 | 用例 08（六键逐个 `phone tap`）、44（长按 `phone rep start/done`）；出图 `docs/v4-phone-wide.png` |
| c 移动端多人引导 | 点 2/3/4 号模式卡 → 浮层（`NUM.PAD_NOTE` 文案 + 知道了 + 全屏点关） | 用例 46（`pad note menu i=2` → `pad note open which=2` → `pad note close`） |
| d 全控件巡检 | `qxqy/audit-controls.mjs` + Lua 侧控件登记表 `UI4.reg`（建屏打印画布坐标） | **69 控件 / 0 死**（5 画布 × menu/play/help/settle/note）；帮助页加「合上手册」胶囊（用例 45/49），并修掉 21:9 上帮助页掉出屏幕的真 bug（fit 缩放） |
| e 手柄 | 24 条 `Controller*` 事件探针（`pad ev`）+ `NUM.PAD.KEYS` 表驱动映射 + 左摇杆（死区/连发）+ 标题屏焦点导航（`SetControllerFocus`） | 用例 48（`pad bind n=24` / `pad ev …act=rot` / `pad focus i=1..2` / 局内 rotate/soft/hold/hard 全链路） |

**研究文档**：`workspace/tetris/docs/research/device-adaptation.md`（官方四设备/锚点/死区/字号/手柄口径 + 四条可判死规则 + 真机未验证五项）。

### 第 2–4 项现状（设计已到位，实现进行中）

- **第 2 项文案**：`docs/copy-v4.md`（776 行：50 说话位置 + 180 条文案 + 46 行接线表 + 声线卡）。
  关键发现：`CFG.COPY` 只有 4 处读取点、`H1/H2` 写死在 `main.lua`、两条用例锁死文案（`29-menu-cards:39-43`、`07-guide-stages:96,109`）。
- **第 3 项角色技能**：`docs/characters-design.md`（701 行：四角色 7 项交付 + 8 档 AI 表 + 16 条用例规格 + 19 个新常量）
  + **`lua/tetris/skills.lua`（478 行，纯逻辑模块）+ `tests-lua/skills_test.lua`（111 断言全绿，`lua5.3` 直跑）**。
  两条硬约束：① 少女=哥伦比娅已实装（月之四，水法器，引力/涟漪）② **局外养成无法真持久化**（`game` 表无自定义变量 Setter）
  ⇒ v1 = 会话内跨盘，真持久化登记为缺口。
- **第 4 项 AI**：根因三条已定位（`assistLv=1`=easy 带 `pMistake=25`+`nudgePct=30`；hold 仅 hard 且阈值 1.5；`evalBoard` 无攒井项）。
  数值与策略表在 `docs/characters-design.md` §5（`pace = min(pieceMax, 0.55×20×SPEED[level]/60)`、hold 三档、多消行三项权重）。

### 断点（下一步从这里接）

1. **第 4 项 AI 重构**（改 `lua/tetris/config.lua` 的 `NUM.AI_LEVELS`/`NUM.AI_TUNE` + `main.lua` 的 `aiTickCore`）：删 `pMistake`、
   加速度自适应 pace、hold 全档 + 留 I 块策略、多消行 attack 权重；判据=新用例（pace 随等级收紧 / hold 使用率 / 多消行占比）。
2. **第 3 项接线**：`skills.lua` 接进 `main.lua`（两角色队伍、局内加点、AI 档位接管）+ HUD/文案。
3. **第 2 项接线**：按 `copy-v4.md` §6 的 46 行接线表落 15 条新场景（先改 `29/07` 两条锁死用例再多挂）。
4. 真机：按 `docs/research/device-adaptation.md` §5 的五项判定方法取真机读数（尤其手柄键名与 cursor 三态）。

## 二、三方分工（别搞混，三个位置各有主）

| 角色 | 路径 | 说明 |
|---|---|---|
| 游戏工程（源+存档+测试+素材定义+真机包） | `/home/h/genshin-ts/workspace/hmlt-qixia/` | 在 genshin-ts 仓里，git 可追；**改这里** |
| 模拟器（引擎/编辑器/web） | `/home/h/miliastra-beyond-simulator`（fork） | 上游 `1475505/miliastra-beyond-simulator`；我们的 fork 远端 `TheTouYu/…`；包版本 **2.2.1 / web 0.5.1**；HEAD `cd96d02`（2026-10-23 上游合流至 0a1790f，含我们已合并的 PR #21） |
| 真机导入目录 | `~/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/` | 编辑器导入对话框默认打开处；**13 个 `*.scene.gia` 现存于该目录** |

- 模拟器 web 服务：`127.0.0.1:4173`（2026-10-24 11:48 重启，pid 621774），工作区 `/home/h/qxqy-workspace`（里面是 counter-demo），**不是**本游戏；本游戏的回归走离线 `createStudio`。服务直接跑 `working-tree` 的 `web/server.js`，**代码改动后必须重启才生效**（改了源码不重启 = 仍在跑旧代码）。
- **本线的模拟器调用是 spawn 隔离的，升级自动跟随**：`gsts client:sim` 与 `qxqy/runner.mjs` 都每次 `spawn studio/cli.mjs` 读磁盘当前代码，不 import 模拟器模块。实测 2026-10-24：模拟器从 2.1.1 升到 2.2.1 后，`runner.mjs` 仍 **17/17 PASS**、`client:sim get` EXIT=0，无需任何“更新”动作。判据=`git log <旧HEAD>..<新HEAD> -- studio/cli.mjs` 为空（job 协议未变）。
- 我们的能力接口（已存在，不是待建）：`gsts client:sim`（`src/cli/client_sim.ts`，headless 桥）· MCP `qxqy_studio_*` · GIA 资产导入/脚本直更 `gsts assets:scripts`；路线选择与分工见技能 `simulator-2d-route`。

## 三、现状读数（2026-10-24 11:5x 复核；游戏侧读数与 10-23 一致，模拟器侧已升级）

| 项 | 读数 | 来源 |
|---|---|---|
| 模拟器回归 | **17/17 PASS，9.0s**（`node qxqy/runner.mjs`，退出码 0；在模拟器 **2.2.1** 上复跑仍 17/17） | 本轮实测 |
| Lua 实现 | `lua/main.lua` **88,262 B / 2036 行**（10-14 00:39） | `ls -l` |
| 存档 | `hmlt-qixia.save.json` **112,499 B**（10-14 00:40） | `ls -l` |
| 真机交付包 | `device-package/hmlt-qixia-整合包.gia` **93,202 B** + `…-脚本.gia` 88,393 B（10-16 19:32） | `ls -l` |
| 交付包是否已在导入目录 | **是，且目录只剩它一个**（2026-10-23 17:20；15 个旧产物移到 `~/.cache/hmlt-export-backup-2026-10-23/`，sha `544949f1…` 与源一致） | `ls` + `sha256sum` |
| 素材（图元拟合） | **13/13 已制**并注入导入目录；wire 四重判据（信封/children/class15/组名）已验 | 提交 `39ddcbe3`/`0231fd4d` |
| 素材（真图/UI 面） | **未做**：敌机 8 型、jezd/fdzd 弹种、选人立绘/星带背景/面板底 | `docs/art-structure.md` §四 |
| 音效 | 9 事件钩子已接；`473/982/529.mp3` 是占位**待试听** | `docs/asset-manifest.md` §3 |
| 游戏内容 | 六关 + 中 boss 车轮战 + 六 boss 分相 + 十悟图鉴 + 七特性 + 银针匣 + 触屏/键鼠双通道 | `docs/PROGRESS-rebuild.md` |
| 已知不可移植 | 图鉴/特性进度原本用 localStorage → 现在是**同局 META，跨会话不保留**（需关卡变量，未做） | `docs/device-import.md`「已知限制」 |

## 四、缺口（按"是否挡住真机打通"排序）

1. **真机导入从未跑完**（最硬）。整合包 GIA **已进导入目录且清成唯一一个**（见 §三「交付包是否已在导入目录」——2026-10-23 17:20 已就位）；待用户执行 P1 导入。导入后模板 guid 会按槽内顺序**重编号**，不校准=开局黑屏（`docs/device-import.md` 标"高风险"）。
2. **素材路线 B 未验证**：`SetImage` 的 source 枚举没有"自建图"，所以运行时换不了自制素材。路线 B（作者态把自建图绑进专用客户端模板 → `InstantiateClientUIControl` 得带图控件）**成不成立取决于一件事**：真机 UI 编辑器里给图片控件选图时，自建图会不会出现在可选列表里。这个只要点一次（1 分钟），却决定后续所有高质量素材怎么接。
3. **素材量**：13 张拟合图只覆盖玩家/主弹/大招/敌弹；敌机 8 型与 UI 面全靠运行时图元占位（"缺素材"就是这个）。
4. 真机特有风险三项：多行文本行高（图鉴 10 行/特性卡）、tx 垂直居中、WASD 穿透 3D（已设 `disableKeyEventPassthrough`，待核）。

## 五、下一步（顺序固定，前一步没绿不进下一步）

| # | 动作 | 谁 | 判据 |
|---|---|---|---|
| P1 | 编辑器「资产导入」→ 选 `hmlt-qixia-整合包.gia` → 模板放进 UI 空间 → 保存 → 试玩（**文件已就位，2026-10-23 17:20 清成唯一一个**） | **用户**（Wine 编辑器，我们只读不了） | 开局不黑屏、出现选人屏 |
| P2 | 回传客户端模板 5 个根子节点的**真实 guid**（img/tx/btn/panel/cursor） | **用户**（截图或读数） | 5 个数值到手 |
| P3 | 改 `lua/main.lua:241` 的 `T_IMG..T_CURSOR` 常量并同步进槽内脚本 | 我们（+用户点"实机脚本同步"） | 实例化不报错、控件在场 |
| P4 | 首轮试玩核验清单 6 项（guid/行高/垂直居中/WASD/音效三 id/键位） | 用户试玩 + 我们按反馈修 | `records/playtest.md` §步骤 7 有逐条记录 |
| P5 | 素材分批补：敌机 8 型（路线 A 图元）→ UI 面（路线 B，先做§四.2 那一分钟实验）→ 音效试听 | 我们 | 每批一张 `*.scene.gia` + 真机可见 |
| P6 | 图鉴/特性进度改关卡变量（跨会话保留） | 我们 | 重进游戏进度还在 |

## 六、指针与命令

- 交付/导入/核验：`workspace/hmlt-qixia/docs/device-import.md`（导入步骤 + 6 项核验 + 已知限制）
- 素材结构（三层/格式分域/路线 A vs B）：`workspace/hmlt-qixia/docs/art-structure.md`
- 细节资产清单（每项状态 ✅/🟡/⬜）：`workspace/hmlt-qixia/docs/asset-manifest.md`
- 架构（对象池 318 控件/逻辑场 444×250/固定步长）：`workspace/hmlt-qixia/docs/tech-architecture.md`
- 重建过程与踩坑（0-based 迁移、`exists=false` 需 Destroy）：`workspace/hmlt-qixia/docs/PROGRESS-rebuild.md`
- 试玩反馈全量记录：`workspace/hmlt-qixia/records/playtest.md`

```bash
cd /home/h/genshin-ts/workspace/hmlt-qixia
node qxqy/runner.mjs          # 离线回归（17 用例，~9s，不依赖 4173）
python3 qxqy/build.py         # Lua 源码 → save.json（改完 Lua 先构建）
node art/gen-scenes.mjs       # 素材定义 → *.scene.gia
node qxqy/export-baseline.mjs # 模拟器默认工程零改动导出（对齐基线：两包进真机导入目录）
```

## 七、已钉死的领域事实（省得重查）

- 客户端模板可实例化单位 = **模板根下的子节点 guid**（不是序号）；5 模板：img/tx/btn/panel/cursor，GIA 内 guid `1073742300..1073742304`，真机会重编号。
- 素材 GIA ≠ 整合包 GIA：前者是**图片编辑器资产**（kind=8, resource_class=15），走"图片编辑器导入"，资产导入看不到它；一个 GIA 只装一个素材组。
- 脚本源码随 GIA 内联（`GraphUnit.script=35`），挂载关系靠整合包保留；导完之后**不再重导 GIA**，每轮只更 Lua。
- 模拟器预览只显示图元 `100001–100006`，其他 imageId 显示缺失框——**这是预览限制，不是 Lua 错**。
