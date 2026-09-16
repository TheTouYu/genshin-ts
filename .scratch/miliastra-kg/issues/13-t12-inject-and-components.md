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

## 验收项

- [ ] **目标地图确定**（用户裁决：新建 / 指定 mapId），记录 mapId 与理由
- [ ] **组件路径取证**：在夹具副本上跑通 (a)/(b)/(c) 之一，留下命令 + 回读证据（组件槽含类型码 17）
- [ ] 补回 `inject` 段（mapId + nodeGraphId）→ `node ./bin/gsts.mjs -c examples/maze-repro/gsts.config.ts`
- [ ] 几何写入：150 实体入图 → **回读实体数 +150**（126 墙 `def=10009001` / 20 造景 / 4 隐藏），GUID 由 CLI 分配不硬编码
- [ ] 4 个隐藏物带 **tabBar 组件（类型码 17）**，`options` 非空 → 回读组件槽确认
- [ ] 节点图注入：`.gia` id=1073741931 替换目标图的 placeholder → 图名变 `_GSTS_maze-collect`
- [ ] **挂载到普通实体**（`mountGraphToEntity`）：⚠️ **严禁挂关卡实体**（技能红线：挂它会致游戏报「地图异常」无法启动）
- [ ] **读图核验**（红线）：`gil:parse-node-graph --graph <id> --json` → 读 **`api` 字段**（不是 `kind`，后者恒返回 `SysCall`），
      9 节点逐个对账 `when_tab_is_selected / activate_disable_tab / activate_disable_model_display /
      set·get_node_graph_variable / addition / greater_than_or_equal_to / double_branch`
- [ ] **8b 复合残留检查**：`tools/check-gil-composite-refs.ts <map.gil> --incoming <本次.gia>` → 0 悬空
- [ ] 若有信号节点：`assets:signals register` 注册信号；**注意 R13——信号是编译期强前置**，含信号的图必须先有 mapId
- [ ] 结构核验三栏报告（已验证什么 / 尚未验证什么 / 需用户在游戏内确认什么），不把结构层证据写成行为层
- [ ] 收轮三件套：勾票 + 看板移入划掉区 + PROGRESS 记「下一步=14」

## 已知风险 / 提醒

- **T12 图的信号版回馈暂缓**：原设计「集齐后发信号触发场景惊喜」因 R13（信号需目标地图注册表，编译期强制）
  改成了置标志位；本票如果注册了信号，可顺带恢复。
- 隐藏物若**无法**通过 CLI 带上 tabBar 组件，则 T12 的交互部分只能靠编辑器手工——**这本身就是一条能力缺口，如实上报不硬绕**。
