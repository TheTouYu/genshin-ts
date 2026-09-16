# 能力覆盖参照（专题文档标注「我方覆盖度」的依据）

> 状态：**当前实现**（2026-09-15 核验）｜来源：本会话对 genshin-ts 源码的实测取证
> 用途：`docs/knowledge-graph/` 下每篇专题文档的「我方覆盖度」一节引用本文件的结论。
> **纪律**：这里的三档判定必须带 `文件:行` 或命令证据，不允许"应该可以"。

## 一、三档口径

| 标记 | 含义 | 取证要求 |
|---|---|---|
| ✅ **可做** | 有 CLI 命令 / DSL API / 已有实证 | 必须给命令或 `文件:行` |
| 🟡 **部分** | 有底座但缺一环（如类型表在、创建命令无） | 必须说明缺哪一环 |
| 🔴 **缺** | 搜索为空 / 明确 fail closed | 必须给搜索命令与 0 命中结果 |

## 二、CLI 命令面（17 个 assets 子命令，注册见 `src/cli/gsts.ts:1803-2103`）

`assets:static-assemblies` · `library-inject` · `entities` · `terrain` · `ui` · `level-variables` ·
`prefabs` · `gadgets` · `resources` · `aux` · `mounts` · `node-graphs` · `skill-config` ·
`unit-status` · `global-timers` · `signals` · `custom-variables`

另有 `gia:*` / `gil:*` / `image:import` / `variables:verify` / `maps` / `build` / `trace-*`。

## 三、逐域覆盖

### D1 概念模型

| 能力 | 档 | 证据 |
|---|---|---|
| 实体/元件/预制/地形资产操作 | ✅ | `assets:entities` / `prefabs` / `terrain` |
| 变量体系（21 类型 + dict） | ✅ | `src/cli/gil_level_variables.ts:505-526` `UiVarType` 含 dict |
| **结构体类型创建** | 🔴 | `UiVarType` 无 `struct`/`struct_list`；`grep -rn "struct" src/cli/gil_custom_variables.ts src/cli/gil_level_variables.ts` = 0 |
| **组件（通用组件）新增** | ✅ | **配置面** `components:` 支持 **7 种**：`followMotion`(9) / `basicMotion`(4) / `nameplate`(27) / `textBubble`(28) / `lightSource`(38) / `hitDetection`(12) / **`tabBar`(17，带 regionName/options/regionType/regionSize/regionRadius/regionCenter)**。证据：`src/cli/gil_static_assemblies.ts:487 componentSnapshot()`（7 种分支 `:490-508`）+ 配置面 `src/compiler/gsts_config.ts:286`（类型定义）`:475/:531`（staticAssemblies / staticPrefabUpdates）。cfg 位：`staticAssemblies[].components` / `staticPrefabUpdates[].components`。<br>⚠️ **本条曾在 2026-09-15 被错误标为 🔴**（依据 `grep addComponent` = 0 命中）——**根因是搜了一个根本不存在的函数名**；真实入口是配置项。已在票 15 纠正。 |

### D2 编辑器资产

| 能力 | 档 | 证据 |
|---|---|---|
| 静态模型拼装 | ✅ | `assets:static-assemblies`（skill `static-gil-model-builder`） |
| 实体变换/配色/挂接 | ✅ | `src/cli/assets_entities.ts:216` patch 支持 `--color/--position/--rotation/--scale/--attach-aux/--detach-aux/--remove-component/--tab-options` |
| **批量创建场景实体（几何）** | ✅ | `assets:entities --entities <json>` import；输入 schema `{schemaVersion:1, entities:[{name,definitionId,position,rotation,scale,color}]}`，**`id` 可省略**由 CLI 自动分配（`src/cli/gil_entities.ts:44`）。T12 实测：一次 import 150 实体（126 墙 + 20 造景 + 4 隐藏） |
| **白盒物件元件常量** | ✅ | `10009001` 长方体 … `10009011` 线框圆柱（基础几何体 `resourceId == definitionId`）。T12 实测枚举 20 张图，见 `ATOMIC-RULES.md` R11 |
| 地形 | ✅ | `assets:terrain` |
| **镜像（mirror）/ 阵列生成** | 🔴 | patch 无 mirror 选项、无阵列命令。T12 的绕过法：**用脚本算坐标批量生成 import JSON**——阵列在工具链里缺，但在脚本层等价可实现 |
| **实体通用组件新增** | ✅ 元件路径 / 🔴 场景实体路径 | **元件路径可行**：`components:` 支持 7 种含 `tabBar`(17)，见上一行。<br>**场景实体路径确实没有**：`EntityImport`（`src/cli/gil_entities.ts:42-54`）schema 只有 `name/id/definitionId/sourceDefinitionId/position/rotation/scale/color`，**无 `components` 字段** → `assets:entities import` 能批量建实体但加不上组件。<br>**T12 影响**：4 个隐藏物要么改成元件（走 staticAssemblies）再摆实例，要么用 `patch --tab-options`。 |
| 单位状态资产 | ✅ | `assets:unit-status list/create/add-effect`（root15/16 + root6） |
| 技能配置 | ✅ | `assets:skill-config create/list` |
| 资源（道具/装备/货币/背包/商店） | 🟡 | `assets:resources` 在位，覆盖面见 `docs/capability-coverage-map.md:49` |

### D3 逻辑编写

| 能力 | 档 | 证据 |
|---|---|---|
| 服务端节点图编译注入 | ✅ | 三阶段管线（TS→GS→IR→GIA） |
| 服务端图子类型 entity/status/class/item | 🟡 | DSL 已声明 `src/runtime/IR.d.ts:37` `ServerGraphSubType = 'entity'\|'status'\|'class'\|'item'`；注入类型表已在 `src/injector/folder.ts:5-15`（含 20003/20004/20005）；**但 CLI 建空图 fail closed** |
| 客户端图 7 类 | ✅ | `src/runtime/core.ts:3178-3187` `g.{characterSkill,characterControlSkill,creationSkill,creationStatus,creationStatusDecision,boolFilter,intFilter}` |
| 列表 / 字典 API | ✅ | `src/runtime/value.ts:691/773`；字典键类型 `:766` 与官方口径逐项一致 |
| **结构体拼装/拆分 API** | 🔴 | `struct` 类是空占位 `src/runtime/value.ts:458-467`；`grep -rn "assembleStructure\|splitStructure\|modifyStructure" src/runtime/*.ts` = 0，但节点定义在 `src/definitions/nodes.ts:8260/11911/11925` → **知识在库、API 缺** |
| 复合节点 | ✅ | `g.defineComposite`（`src/runtime/core.ts`）+ `docs/composite-library/` 21 类 |
| 信号 | ✅ | `assets:signals inspect/register/update/repair` |
| 全局计时器 | ✅ | `assets:global-timers list/create/attach` |
| **局内存档** | 🔴 | `grep -rn "局内存档" src/ tools/` = 0（仅 docs 两处记录类型码 25/26） |

### D5 表现层

| 能力 | 档 | 证据 |
|---|---|---|
| 图片素材生成 | ✅ | `image:import`（skill `image-svg-builder` / `image-css-builder`） |
| UI 控件创建与样式 | 🟡 | `assets:ui`；f19/f68 文本容器定点编辑见 `src/cli/gil_ui.ts:218-235` |
| **消息队列控件创建** | 🟡 | 节点在（`refreshNotificationQueue`，`src/definitions/zh_aliases.ts:455`）；控件差分已有（`ui-controls.md:1290-1319`，id 1073742132）但 CLI 创建未验证 |

### D7 工程化工具链（我方主场）

| 能力 | 档 | 证据 |
|---|---|---|
| 编译 | ✅ | `npm run build` / `gsts build` |
| 注入（单文件/gil 写回） | ✅ | `gsts build --inject` 系列；安全写回流程见 skills |
| 读图核验 | ✅ | `gia:decode` / `gil:parse-node-graph` / `gil:trace-exec` / `gil:trace-dataflow` |
| 调试日志分析 | ✅ | `debug-log-investigator` 技能 `gia_log.py` / `gia_log_flow.py` |
| 变量 wire 核验 | ✅ | `variables:verify`（只读 PASS/DIFF） |
| 地图管理 | ✅ | `gsts maps` |
| 统计/度量（如伤害木桩这类游戏内埋点） | 🟡 | 需用节点图自建；无现成统计命令 |

## 四、已知增强空间（**不是拦路石**）

用户 2026-09-15 明确：**我方能力足以做出完整游戏**，以下缺口"补上能做得更好"，
不是"做不出来"。完整 8 项见 `research/南航千星三期基础课/能力缺口.md`：

1. 结构体类型创建（UiVarType 无 struct）
2. DSL 结构体拼装/拆分 API
3. 单位状态/职业/道具节点图创建（20003/20004/20005 fail closed）
4. 局内存档零覆盖
5. 实体通用组件无法新增
6. 消息队列控件创建/图文组模板配置
7. 模型拼装无镜像 / 无单色层叠批量
8. UI 无法绑定结构体成员（依赖 1+2）

## 五、维护

- 本文件随 `docs/capability-coverage-map.md` 一起更新；二者分工：
  **本文件 = 按知识图谱的轴组织的三档判定**；`capability-coverage-map.md` = 按官方功能体系组织的覆盖清单。
- 每次新增 CLI/API 后，用 `grep -rn` 复核本文件的 🔴 项，仍为 0 才保留标记。
