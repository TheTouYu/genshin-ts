# 13 — T12 注入落图：几何 150 实体 + 隐藏物选项卡组件 + 节点图，回读核验通过

**What to build:** 用户在游戏里进到迷宫地图后能**实际玩到**——《空中花园》式复现（`docs/knowledge-graph/reproduction/T12-design.md`）的
126 面墙 + 20 处造景 + 4 个隐藏收集物落在地图上、能走能看；点开隐藏物的选项卡 → 「已收集数」增加；集齐 4 个触发回馈。
做完本票，游戏内只剩用户点一下的核验（票 14），无需再碰工具链。

**Blocked by:** 用户确认目标地图（AGENTS.md 红线：操作 `mapId`/`nodeGraphId` 前必须确认）。
两个候选：① `gsts maps:create` 新建一张（推荐——验证图 `1073741916`/`1073741888` 是给「最小规则核验」用的，塞 150 实体进去会毁掉它们的用途）② 用户指定任一既有 mapId。

**Status:** ⬜ 待目标地图确认

---

## 本票要解决的第一个问题（未知，必须先取证）

**4 个隐藏收集物的「选项卡组件」走哪条 CLI 路径？**

已核实的硬事实：
- `assets:entities import` 的输入 schema `EntityImport`（`src/cli/gil_entities.ts:42-54`）**没有 `components` 字段**——只有
  `name / id / definitionId / sourceDefinitionId / position / rotation / scale / color`。
  → **150 个场景实体能批量建，但组件加不上。**
- 组件能力在**另一条路径**：`src/cli/gil_static_assemblies.ts:487` 的 `componentSnapshot()` 支持 7 种组件，
  其中 **`type: 'tabBar'` → 类型码 17**（`src/cli/gil_static_assemblies.ts:480`），用于
  `staticAssemblies[].components` 与 `staticPrefabUpdates[].components`（`src/compiler/gsts_config.ts:475/531`）。
- tabBar schema（`gsts_config.ts:330-342`）：
  `{ type: 'tabBar', regionName: string, options: readonly string[], regionType?: 'box'|'sphere', regionSize?: [n,n,n], regionRadius?: number, regionCenter?: [n,n,n] }`
- 已知 fail-closed 边界：`regionType: 'box'` 时**非零 regionCenter 不支持**（无真实样本，代码显式抛错）。

**待定**：`staticAssemblies` 是「元件（prefab）拼装」路径，而 T12 的实体是 root5 **场景实体**。
需先取证三条路哪条可行（在夹具副本上试，**不碰真实地图**）：
- (a) 隐藏物改为**元件**：`staticAssemblies` 建带 tabBar 的元件 → 落 4 个实例
- (b) `staticPrefabUpdates` 对既有元件加组件，再把实例摆进场景
- (c) 确认**没有** CLI 路径 → fail closed 上报，转编辑器手工（并登记为能力缺口）

**取证判据**：产物回读后该实体的组件槽里能读到类型码 **17**，且选项名/序号字段在位。
**不允许**「写了就算」——必须读回。

---

## 验收项（2026-09-16 全部完成，逐条附读回证据）

- [x] **目标地图确定**：用户裁「新建地图」→ `1073741921`「T12迷宫复现」
      （`maps:create --name "T12迷宫复现" --graphs t12-maze` + `maps:init` 补 36 root 骨架）
      理由：不复用验证图 `1073741916`——那是给「最小规则核验」用的，塞 150 实体进去会毁掉其用途
- [x] **组件路径取证**：**直接在真实新图上跑通**（比原计划的"夹具副本"更强）
      → 走 (a) 元件路径：4 个隐藏物各建一个元件，`components: [{type:'tabBar', regionName:'隐藏收集物', options:['拾取']}]`
      → **wire 验到类型码 17**：每个定义 7 个组件槽 `[18,1,3,19,6,14,17]`（末位 17）
      → `export` 回读 `components=[{type:tabBar, regionName:隐藏收集物, options:[拾取]}]` ×4
      候选 SHA `8a2e55d45236f8df`，证据目录 `~/genshin-ts-evidence/static-assembly/t12-maze-v1/`
- [x] **inject 段补回**：`mapId: 1073741921` + `nodeGraphId: 1073741825`
      → `node ./bin/gsts.mjs -c examples/maze-repro/gsts.config.ts`
- [x] **几何写入**：实体 `11 → 161`（**+150**）
      → 126 长方体(墙, `def=10009001`) + 7 圆柱 + 7 球 + 6 圆锥（=20 造景）+ 4 隐藏物元件实例
      → **GUID 由 CLI 自动分配**（墙 `1077936133` 起、隐藏物 `1077936279` 起），输入 JSON 未写 id（红线：不硬编码）
- [x] **4 个隐藏物带 tabBar**：**三层副本都在位**（这是本轮学到的关键约束）
      → root4 定义 f8 ✓ / root8 实例 f7 ✓ / **root5 场景实体 f7 ✓**（游戏实际读取的层）
      → 注意：`staticAssemblies` 的 `touchedTopLevelFields=4,6,8,27` **不含 root5**，
        故必须再用 `assets:entities import` 生成 4 个场景实例（实测组件成功继承）
      → **带组件实体数 = 4**（回读确认，恰是 4 个隐藏物）
- [x] **节点图注入**：图名 `_GSTS_maze-collect` + `_GSTS_maze-counter`，替换各自 placeholder
- [x] **挂载到普通实体**：4 隐藏物 → `1073741825`；墙实体 `1077936133` → `1073741826`
      → **严禁挂关卡实体已遵守**：`1094713345` 的挂载表回读为 `graphs=(none)`
      → 回读 `== graphs not mounted anywhere (0) ==`
- [x] **读图核验**：读 **`api` 字段**逐个对账
      → `maze-collect` 4 节点：`When Tab Is Selected` / `Activate/Disable Tab` /
        `Activate/Disable Model Display` / `复合:发送信号`(1610612741)
      → `maze-counter` 7 节点：`复合:监听信号`(1610612742) / `Get·Set Node Graph Variable`×3 /
        `Addition` / `Greater Than or Equal To` / `Double Branch`；变量 `已收集数`(Integer) `已集齐`(Boolean)
- [x] **8b 复合残留检查**：两图均 `✓ 复合引用完整（0 个 impl 图，0 悬空）`
      另：节点预算 `4 / 11`（远低于 2000 红线）
- [x] **信号注册**：`T12隐藏物已拾取` send/monitor/server = `1610612741/42/43`，`params=[序号:int]`
      → **R13 已遵守**：先 `register` 再编译（`template=builtin-layouts`，单参 int 无需 donor）
- [x] **结构核验三栏报告**：见 PROGRESS.md 末节与收轮报告（结构层证据与行为层分开陈述）
- [x] **收轮三件套**：勾票（本节）+ 看板划掉 + PROGRESS 记「下一步=14」

## ⚠️ 与原计划的两处偏差（如实登记，非"顺手改了"）

1. **`.gia` 图 id 由 `1073741931` 改为 `1073741825`**（计数图新建为 `1073741826`）。
   原因：`inject.nodeGraphId` **仅对 `gsts <file>` 单文件模式生效**，批量模式按 `.gia` 自带 id 找图。
   把 DSL 的 `g.server({id})` 与地图 placeholder 对齐后，`-c <config>` 一次即可命中两图，无需反复改配置。
2. **从 1 张图变成 2 张图**（原计划 9 节点单图）。
   原因：`docs/game-engine-knowledge/components.md:111` 明载「whenTabIsSelected 的图**挂载在挂载选项卡
   组件的实体上**触发」→ 4 个隐藏物各需一张图 ⇒ 4 个独立实例；而**节点图变量不跨实例** ⇒
   原单图设计里 `已收集数` 会"4 个实例各数各的，永远到不了 4"。
   拆为 `maze-collect`（4 节点 / **0 变量**，刻意无状态）+ `maze-counter`（7 节点 / 2 变量，只挂 1 份）。

## 已知风险 / 提醒

- **T12 图的信号版回馈暂缓**：原设计「集齐后发信号触发场景惊喜」因 R13（信号需目标地图注册表，编译期强制）
  改成了置标志位；本票如果注册了信号，可顺带恢复。
- 隐藏物若**无法**通过 CLI 带上 tabBar 组件，则 T12 的交互部分只能靠编辑器手工——**这本身就是一条能力缺口，如实上报不硬绕**。
