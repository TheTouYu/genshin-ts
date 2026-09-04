# 21 — 客户端图族「设置预设状态」写通道支持（官方功能补口，AGENTS 新律首例）

**What to build:** 让客户端节点图（角色技能 20002 / 造物技能 20008 等图族）能够**写入实体预设状态值**
（int 槽），与已闭合的"客户端读预设状态"配成完整闭环；使创作者可用官方既有语义
（预设状态=实体配置层的 N 个 int 索引）做持久整型寄存器，而不必绕 HP/transform。

本票是根 AGENTS.md「**官方文档功能=候选可支持面**（2026-09-04）」新规的第一例落地：
官方文档有记载 → 我方暂无知识/工具链缺 → **不判死，立票补口**。

**Blocked by:** 无（可独立做）；**硬前置=用户编辑器最小差分**（§3 步骤 1-2），
我方无法自建真实 GIA 样本。

**Status:** pending（2026-09-04 用户裁定立票挂账："预设状态的确是可以支持的功能，但它和我们这一次
的单位状态是另一套体系，先立 ticket 记下来，之后再做支持"）

**与票 20 的关系（务必分清，别混用）**：预设状态（Preset Status）≠ 单位状态（Unit Status），
是引擎的**两套不同体系**（用户 09-04 明确）。票 20 的 L1 黑板载体=transform + **单位状态**；
本票交付后，预设状态成为**第三条候选写通道**，届时票 20 容量表再重估（不预先改动票 20 结论）。

## 1. 已知事实（证据分层，逐条可复核）

| 维度 | 事实 | 证据层级 |
|---|---|---|
| 官方·服务端写 | 「设置预设状态」（**目标实体=任意实体**）；「设置复杂造物的预设状态值」（仅造物） | `[文档]` official-guide-nodes-server.md:266 / :3509 |
| 官方·写侧事件 | 预设状态被改变时触发事件（改前改后须不同值才触发）：`whenPresetStatusChanges` / `whenComplexCreationPresetStatusChanges` | `[文档]` server.md:4929；`[结构]` events-payload.d.ts:99/:135 |
| 官方·读 | 「获取预设状态」「查询复杂造物的预设状态值」在**角色技能/造物技能/状态图/过滤器**各客户端图族文档均有列 | `[文档]` official-guide-nodes-client.md:146/:2891/:5513/:7279/:8553/:11864；`[结构]` client_nodes.d.ts `getPresetStatus`/`checkThePresetStatusValueOfTheComplexCreation`/`getObjectPresetStatus`/`getSelfPresetStatusValue` |
| 我方·写 | `setPresetStatus`/`setThePresetStatusValueOfTheComplexCreation` **仅服务端定义**；`client_method_modes.ts` 全文零命中（六图族白名单皆无） | `[结构]` nodes.d.ts:1827/:1843 + client_method_modes.ts grep 0 命中（09-04 复核） |
| 判读 | **零命中=我方白名单未登记，≠引擎不支持**（新规口径）；vendor 亦无客户端样本（`graphType:20002` 段无该节点）→ 缺口=真实 wire 未知 | `[结构]` |
| 语义参考 | 预设状态值="一般 0=关 / 1=开"（文档措辞），类型为整数、按 `presetStatusIndex` 索引、实体配置层声明 | `[文档]` server.md:279 / entity_helpers.d.ts:392 |

## 2. 验收（checkbox）

- [ ] 差分学习：相邻单变化快照闭合**客户端图族**「设置预设状态」真实 wire（genericId/concreteId +
      pin 布局 + 目标实体入参形态），产出登记进 `docs/game-engine-knowledge/`（按该目录记录原则逐条写）
- [ ] 判定引擎真实边界：客户端图能否携带该节点？（编辑器拖不进/无对应客户端节点=官方未开放，
      此时如实记"引擎侧不支持"并关票，**这是唯一允许判负的出口，且须证据**）
- [ ] definitions/vendor 补口：生成或映射客户端 `setPresetStatus`（不手改生成物，走 `npm run gen`/
      vendor 同步流程）
- [ ] 编译→注入→读图核验（`gil-node-graph-reading` Step 3.5/3.6）+ 行为层游戏验证（写入后
      客户端 `getPresetStatus` 读回 + 服务端事件触发）
- [ ] 知识落盘 + PKC 录入（与"客户端只读预设状态"旧 claim 的关系需显式更正注记）

## 3. 建议执行序（差分管线，成本预估低）

1. **用户编辑器（10 秒×2 快照）**：①某造物/实体配置层加一个预设状态索引；
   ②在**造物技能节点图（20008）**里尝试从节点面板搜"设置预设状态"并拖入、连目标实体+值。
   - 若节点面板**搜不到/拖不进** → 立即回报（=引擎侧未开放候选，本票按证据关闭，成本 1 分钟）
   - 若能拖入 → 保存地图，交我差分
2. **模型侧**：`npm run gia:diff` / `gia:parse-node-graph` 对比相邻快照 → 提取该节点 wire 形态 →
   闭合 genericId/concreteId 与 pin 布局
3. **补口**：definitions 生成层 + vendor 数据映射 → `npm run build` → 最小 case 编译
4. **核验**：`verify-injection` 最小注入 + 读图核验 + 用户游戏内一次复测（写入→读回→服务端事件三查）

## 执行备注

- 2026-09-04 立票（票 20 第 0 轮探索副产物；触发根 AGENTS 新规首例）。相关缺口同类挂账：
  `recoverCreationSHp` vendor 7 槽 vs definitions 3 参（多 4 float 语义未知，疑仇恨倍率/增量，
  对照 `recoverCharacterSHp` 5 参形态）——按同律登记，优先级低于本票，需要时并票做差分。
