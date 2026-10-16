---
name: simulator-2d-route
description: 千星模拟器「2D 界面 + Lua」生产线——把 UI 控件与 Lua 游戏逻辑在模拟器里编出来、试玩、导出 GIA，再进真机。当任务涉及：模拟器、qxqy_studio_* 工具、UI 转 JSON/GIA、Authoring JSON、客户端控件模板/容器、Lua 脚本挂载与 require、试玩队列/runCase、画布与多设备布局、图元素材（imageId 100001–100006）、或"先模拟器后真机"的路线选择——使用本技能。它是**我方生态里的一条生产线**（另有编辑器/GIL 直写路线与真机自动化路线），与全局插件技能 `qxqy-simulator`（工具细节参考）和 `qxqy-game-studio`（七步工作流参考）**职责分离**：路线选择、与我方 CLI/技能的衔接看本技能。
---

# 模拟器 2D 生产线（simulator-2d-route）

## 定位：它在我方生态里的位置

我方千星生产能力有三条生产线，**先选线再动手**：

| 生产线 | 入口 | 强项 | 终裁 |
|---|---|---|---|
| **模拟器 2D 路线**（本技能） | `qxqy_studio_*` MCP · `gsts client:sim` | 迭代快、无 GUI 抖动、可 `runCase` 批量回归、UI/Lua 一体化 | 模拟器绿 ≠ 真机过 |
| 编辑器/GIL 直写路线 | `gsts assets:*` · `maps:*` | 覆盖全生态（节点图/静态模型/变量/信号/地形/结构体…） | 编辑器能打开 + 真机 |
| 真机自动化路线 | `device-playtest-loop` | 真实输入/渲染/负载；真机 API 差异 | 用户终裁 |

**选线判据**：能不能在模拟器里证明？能 → 先模拟器（快）；只有模拟器证明不了的（真实输入手感、真机渲染、真机 API 差异、真实负载）→ 真机。
**UI 与 Lua 的差异**：模拟器预览只给图元 `100001–100006`，其余 imageId 显示缺失框（这是预览限制，**不是 Lua 错误**）。

## 入口

| 工具 | 用途 | 要点 |
|---|---|---|
| `qxqy_studio_get` / `_patch` | 读工程无损 JSON / 改工程 | `patch` 带 `expectedRevision`，成功后 +1 |
| `qxqy_studio_ui_screenshot` | 编辑器舞台 PNG | 不需要打开模拟器标签 |
| `qxqy_studio_play_screenshot` | 试玩 Runtime PNG | 需已 `start`；不推进 Runtime |
| `qxqy_studio_load` | 列出/拉取工作区存档 | 不传 `path` 只列 |
| `qxqy_studio_play` | 试玩控制（见下） | |
| **`gsts client:sim`** | **headless 桥**（spawn 模拟器 `studio/cli.mjs`） | 动作 `get/patch/playStart/playRun/playStop`；`--sim-root` 默认 `/home/h/miliastra-beyond-simulator`；**适合脚本化回归** |

`play` 动作：`start`（重建运行时；`canvasId` 选设备、`playerCount` 1–8）、`device`、`view`（切玩家视角，不重建）、`get`、`step(dt)`、`pointer`（move/down/up/click，坐标=当前画布像素）、`key`（脚本已注册监听的键名）、`click`（按控件名）、`pause/resume`、`stop`、`serverGet/Set/Send`、`history`/`saveCase`/`runCase`（用例可钉 `canvasId`/`playerCount`）。
未 `start` 时 `pointer/key/click` 报 `play session has not started`。

常用 `patch` op：`select` · `pick(x/y)` · `setCanvas` · `addScript`/`updateScript`/`removeScript` · `setServerLogic` · `newAsset` · `addTemplate` · `add`/`reparent`/`moveSibling`/`remove` · `set(id,key,value)` · `setControlGuid`/`acknowledgeControlGuidChanges` · `replace`。
常用 `set` key：`posX/posY/width/height`、`rotationX/Y/Z`、`anchorType`、`anchorMinX/Y`、`anchorMaxX/Y`、`pivotX/Y`；`text`、`fontSize`、`imageId`、`enableMask`、`fillAmount`、按钮四态 `unavailable/hover/pressed/selectedChildId`、`syncAllDevices`；颜色 `#AARRGGBB`。
**`set` 对未知 key 直接报错**——以报错为准，按报错补字段。

## 三类资产与该记的领域规则

**资产**：`UI控件-服务端`（客户端控件容器，仅资源分组）· `UI控件-客户端`（可被实例化的模板）· `Lua 脚本`（由存档统一管理）。
**规则（写 op 前自查）**：

- **脚本挂到客户端控件上**；服务端"客户端控件容器"是资源分组，挂客户端脚本会被拒绝。
- **`require` 走导入根**：映射路径去掉 `.lua` 后加前缀 —— `pcall(require, "default_import_file/workspace/<slug>/<name>")`。
- **画布 5 个**：`pc-16-9`(1600×900) · `pc-21-9`(2100×900) · `mobile-16-9`(**1280×720**) · `mobile-19.5-9`(1560×720) · `mobile-4-3`(1280×960)；**原点左下**，锚点相对父矩形 0–1。
- **2D 布局基准 = 手机 16:9**：整屏构图在 `mobile-16-9` 必须完整可见；PC 用固定设计板 + `min(canvas/design)` 等比缩放（不足处留边）。**P0 至少覆盖 `mobile-16-9` 与 `pc-16-9`**。
- 缩放容器上层**先出现的兄弟节点会盖住后面的舞台**（同级绘制顺序）——把舞台放在正确的层级。
- **旋转进运行时，但点击命中按旋转前的轴对齐矩形**算。
- 切换设备 = 换画布宽高 + 选用对应平台 RectTransform 槽位（PC→KEYBOARD/KeyboardAndMouse，手机→TOUCHSCREEN/Mobile），锚点在新父矩形下重算。

## 工作流（与 `game-from-scratch` 的关系）

```text
设计（策划案/规则） → 测试用例（先于生产代码） → HTML 效果展示（给用户看体验）
→ 美术参考与素材 → Lua + UI 实现（本技能：模拟器里搭+跑）
→ 模拟器测试（runCase 批量回归 + 多设备画布）
→ 真机（device-playtest-loop；模拟器绿只是候选）
```

- 设计与美术阶段**不开模拟器**；有效 TDD Red 需要可运行骨架。
- 交付物是**能在真机跑的游戏**（Lua + 存档/GIA），HTML 只是体验沟通件。
- **索引变更纪律**：GIA 导入会重映射客户端控件索引 → 按 `controlGuidChanges` 走：改存档脚本源码 + 相关 Lua 引用（语义引用，不盲替同值数字）→ 核验后才 `acknowledgeControlGuidChanges` → 保存 → 重启试玩回归。
- 真机导入、脚本映射/挂载、真实索引校准、脚本目录绑定 → 见 `device-playtest-loop` 与 `git`/交付说明；**复制到磁盘 ≠ 真机已加载新代码**。

## 角色分工（与我方技能/上游插件技能）

| 层 | 谁 | 内容 |
|---|---|---|
| **路线选择 + 与我方生态衔接** | **本技能** | 何时走模拟器、与 `gsts` CLI / `game-from-scratch` / `device-playtest-loop` 的分工 |
| 工具与 op 全量细节 | 全局技能 `qxqy-simulator`（插件，上游） | 逐个 op 的字段、排障、用例队列写法 —— 按需查阅，**改动走我方 fork + PR** |
| 七步工作流（策划→真机） | 全局技能 `qxqy-game-studio`（插件，上游） | 步骤产物与交接清单 —— 按需查阅 |
| 真机试玩与取数 | `device-playtest-loop`（我方） | 开退试玩、注入、日志、判据 |
| 编辑器/GIL 资产面 | `genshin-ts-asset-operations` 等（我方） | 节点图/UI 控件/变量/信号/结构体… |

> 上游插件技能是**参考与借鉴对象**（引用→借鉴→超越）；我方生态（GIL 直写 + 真机自动化 + 日志取证）比它宽，遇到需要时在**我方 fork**里改进并 PR。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-10-17 | 首版：把模拟器 2D 能力纳入我方能力体系（能力面来自插件 `skill.md` 盘点 + 节点图/资产技能交叉核对） |
