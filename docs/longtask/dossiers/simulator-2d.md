# 档案：模拟器 2D Lua 生产线 + 虹猫蓝兔（L3）

> 状态：当前推荐（**2026-10-23 用户重新启用为本阶段活动分支**；此前 10-16 起被 GUI 线挤停）
> 来源：用户 2026-10-23 本会话首条原话 + 仓库落盘物（`workspace/hmlt-qixia/**`）+ 2026-10-23 17:1x 实测读数
> 最近校验：2026-10-23
> 读法：动手前读 §一（定位）、§三（现状读数）、§五（下一步）；细节按 §六 指针跳，别通读

---

## 一、这条线是什么（一句话）

用**千星模拟器**（UI 控件 + Lua，无 GUI 抖动、可 `runCase` 批量回归）做 2D 游戏，再用 `gsts` 把产物送进**真机（真游戏）**。
**模拟器只是产线，终点是真机能玩通**——这正是"大佬的模拟器只覆盖 2D Lua，我们做的是真游戏"的接口处。

用户原话（2026-10-23，本会话首条，逐字）：

> 「我现在想恢复：给我们的项目融合大佬开发的千星2d lua脚本模拟器的能力。简单来说就是：大佬开发的功能，局限在2d的lua脚本。实际上，我们项目做的是真正的游戏。我们之前在 miliastra-beyond-simulator目录已经开发了一个2d的虹猫蓝兔的游戏了，从原型开始用lua重写了，现在缺素材，下一步就是去游戏里面打通并试玩。」

由此产生的本次任务判据（我们翻译，用户可改）：**把虹猫蓝兔送进真机、能操作、能通关；素材补到"看得下去"。**

## 二、三方分工（别搞混，三个位置各有主）

| 角色 | 路径 | 说明 |
|---|---|---|
| 游戏工程（源+存档+测试+素材定义+真机包） | `/home/h/genshin-ts/workspace/hmlt-qixia/` | 在 genshin-ts 仓里，git 可追；**改这里** |
| 模拟器（引擎/编辑器/web） | `/home/h/miliastra-beyond-simulator`（fork） | 上游 `1475505/miliastra-beyond-simulator`；我们的 fork 远端 `TheTouYu/…`；包版本 **2.1.1**；HEAD `bd20a61`（2026-10-18 上游合流） |
| 真机导入目录 | `~/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/` | 编辑器导入对话框默认打开处；**13 个 `*.scene.gia` 现存于该目录** |

- 模拟器 web 服务：`127.0.0.1:4173`（pid 830，2026-10-23 17:0x 已连续运行 20h+），但它的工作区是 `/home/h/qxqy-workspace`（里面是 counter-demo），**不是**本游戏；本游戏的回归走离线 `createStudio`。
- 我们的能力接口（已存在，不是待建）：`gsts client:sim`（`src/cli/client_sim.ts`，headless 桥）· MCP `qxqy_studio_*` · GIA 资产导入/脚本直更 `gsts assets:scripts`；路线选择与分工见技能 `simulator-2d-route`。

## 三、现状读数（2026-10-23 17:1x 实测，过期即失效）

| 项 | 读数 | 来源 |
|---|---|---|
| 模拟器回归 | **17/17 PASS，9.0s**（`node qxqy/runner.mjs`，退出码 0） | 本轮实测 |
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

1. **真机导入从未跑完**（最硬）。整合包 GIA 已生成但没进导入目录；导入后模板 guid 会按槽内顺序**重编号**，不校准=开局黑屏（`docs/device-import.md` 标"高风险"）。
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
