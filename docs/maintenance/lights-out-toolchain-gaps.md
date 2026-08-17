# 灯阵游戏开发缺陷汇总（交给编译器/工具链支持）

> 状态：已核查——部分交付 + 待配合（2026-08-16 核查，2026-08-17 缺陷 3 光源组件交付）
> 来源：灯阵最小图 1073741890 开发全流程（v1→v5）真实踩坑，证据见各节日志/GIL/代码
> 用途：这些缺陷是**工具链能力缺口**，不是玩法设计问题。补上后游戏可完成更合理的设计。

> **2026-08-16 工具链核查结果（编译器团队回填，逐条对照当前实现）**：
> - 缺陷 1（createPrefab 组件复制）：**规则已闭合（type 4 不复制、type 17 复制，两次独立项目证据），引擎侧行为工具链不可修**。可行 workaround 与知识更新见
>   `docs/game-engine-knowledge/components.md`「基础运动器」与 ADR-0004。
> - 缺陷 2（tabBar options 更新）：**已交付**。新增 `gsts assets:static-assemblies tab-options <instance-id> --name <名称> --options <列表>`（区域配置保留，定义/实例双写；`--write` 备份写回）。配置驱动的 `assets.staticPrefabUpdates[].components` 亦已支持同能力。
> - 缺陷 3（光源组件）：**已交付（2026-08-17）**。组件 type=38 已由两次独立编辑器样本闭合（地图 1073741892，71B 默认槽 def f8 / inst f7 双写一致），CLI 组件白名单已加入 `lightSource`（`staticAssemblies[].components` / `staticPrefabUpdates[].components`）。
> - 缺陷 4（UI 控件/铭牌/气泡）：**部分交付**。铭牌（27）/文本气泡（28）默认槽编码已闭合，CLI 组件白名单已加入（`staticAssemblies[].components` 支持 `nameplate`/`textBubble`）；屏幕 UI 控件（316/382/383/384 的控件组/Cfg 资源）**待配合**（编辑器建一个控件样本）。
> - 缺陷 5（forEach/动态 prefabId）：**已解决**。`f.listIterationLoop` + `f.assemblyList(..., 'prefab_id')` 可批量创建且 prefabId 支持运行时连接（编译器全链路实证）；**`forEach` 语法也已支持**（2026-08-16 修复：全局 `list` helper 类型解析 + 联合元素 branded 优先推断，Stage1 转换到 listIterationLoop，见 `tests/stage1_expression_semantics_test.ts`）；游戏内动态 prefabId 引脚**待游戏核验**。重构候选见 `examples/lights-out/src/game-manager.ts` 对应分支的 listIterationLoop 版本（编译验证通过）。
> - 缺陷 6（表达式二次求值）：**已交付**。新增 ESLint 规则 `gsts/server-repeated-evaluation`（服务端纯数据表达式被 ≥2 个 f.* 调用消费时警告）+ `docs/game-engine-knowledge/data-flow.md` 文档化；代码侧绕行模式（set 后重新 get）保持有效。

---

## 缺陷 1：createPrefab 动态实体的组件继承缺口（最严重）

**现象**：prefab（元件）的 def 侧 f8 与实例侧 f7 **都有** basicMotion(type 4) 组件（GIL hex 已确认），但游戏运行时 `createPrefab` 动态创建的实体**没有继承该组件**：
- 灯头（动态创建）：`addUniformBasicRotationBasedMotionDevice` 节点执行（日志有帧、参数正确），但**0 个运动器停止帧、实体 rotation 不变** → 静默无效
- 灯柱（动态创建）：同样执行但 0 非零 rotation 帧 → 无效
- 灯柱的 tabBar **能工作**（玩家可点击）→ 说明交互组件被复制，但 basicMotion 没被复制 → **组件复制不完整**

**影响**：所有"动态创建实体的运动/特效"玩法不可用（旋转庆祝、公转动画、胜利组合运动都做不了）。

**期望**：createPrefab 创建实体时完整复制 prefab 的组件槽（或至少 type 4 basicMotion）；或提供运行时"给实体补组件"的节点。

**证据**：
- 日志 2723/2724：85 节点有帧、0 停止帧、0 非零 rotation
- GIL：灯头 def f8 / inst f7 均含 `080410017203c81f01`（type 4）
- components.md:175-179 已记载 P4 魔方角块同坑（"运动器节点帧在、实体纹丝不动"）

## 缺陷 2：CLI 无法更新既有实体的组件配置（tabBar options）

**现象**：想给管理台 tabBar 加第二个选项「立即胜利」：
- `assets:entities patch` 不支持组件字段
- `assets:static-assemblies` 不能更新已存在 prefabId 的闭包（plan 必报 id-conflict）
- 唯一路径 = 恢复写回前备份重新生成整个地图 → 成本极高且丢失后续编辑器改动

**影响**：运行时/开发期无法调整实体选项卡选项（数量/文字），"通关后出现新选项"这类 UI 流程做不出来。

**期望**：`assets:entities patch` 支持组件级更新（如 `--tab-options <id> <opt1,opt2,...>`），或提供专门的 tabBar options 更新入口。

**证据**：`src/cli/assets_entities.ts` patch 仅支持 color/position/rotation/scale/aux；`src/cli/gil_static_assemblies.ts` setStaticAssemblyComponents 只服务静态装配创建路径。

## 缺陷 3：光源组件 CLI 不支持（667 节点前置）

**状态（2026-08-17）：已交付。**
- 光源组件 type=38 已闭合：2026-08-17 地图 1073741892 两次独立编辑器添加（1077936129/1077936130），71B 默认槽 def f8 / inst f7 双写逐字节一致。
- CLI 组件白名单新增 `lightSource`（默认槽 71B），编码器 `lightSourceComponent()`，导出侧解码 round-trip；回归 `tests/gil_static_assembly_components.ts` + `tests/gil_static_prefab_updates.ts`。
- 字段级参数 `radius`/`intensity` 已支持（2026-08-17 差分定位：f501.f4.f51.f2/f3，按实际 float 编码；编辑器滑条显示值会四舍五入，CLI 写 float32 可能与滑条内部值差 ~0.005）。
- 现在 `toggleEntityLightSource`（667）可通过 CLI 预配光源组件实现；其余光源字段（名称/颜色等）仍为默认快照，后续需要时再做字段差分。

**现象（原始）**：`toggleEntityLightSource`（667，开关实体光源——天然的"点亮/熄灭"视觉反馈）需要实体预配光源组件，但 CLI 组件白名单仅 tabBar/basicMotion/followMotion，**无光源组件**。

**影响**：灯点亮/熄灭只能用 308 显隐（灯头出现/消失），做不出"发光"效果。

**期望（原始）**：CLI 支持光源组件（type 未知，需编辑器样本闭合编码）或提供组件槽透传能力。

**证据**：`src/cli/gil_static_assemblies.ts` componentSnapshot 分支仅 3 种；日志 2723 667 节点执行但 IN1(Integer) 空、无光源组件 → 无效。

## 缺陷 4：屏幕 UI 控件/铭牌/文本气泡无法 CLI 创建

**现象**：
- 屏幕 UI 控件（316/382/383/384 节点）需编辑器预置控件组 + 控件 ID
- 铭牌（615/616/617）、文本气泡（631）需编辑器预置 Cfg 配置
- CLI 均无创建入口

**影响**：开始界面、结算弹窗、引导文字都只能退化为"实体 tabBar 选项文字"（3D 世界内），做不出真正的屏幕 UI。

**期望**：CLI 支持创建屏幕控件/铭牌/气泡配置资源（或提供 Cfg 资源注册入口）。

**证据**：`node bin/gsts.mjs --help` 无相关命令；ui-controls.md 明确"控件需要预先添加和配置"。

## 缺陷 5：DSL 受限子集的表达力缺口（数据驱动关卡受阻）

**现象**：
- 数组 `forEach`/闭包捕获不支持 → 50 个 createPrefab 只能手写展开（管理台图 146 节点，其中 50 个是展开的创建调用）
- `createPrefab` 的 prefabId **只能字面量**（不能从字典/变量读）→ "一个数据代表一个关卡"的纯数据驱动无法实现：关卡数据的 prefabId 无法动态取用
- 空数组必须 `listLiteral('int')` 显式类型

**影响**：关卡系统无法做成"纯数据可复用"——现在每关仍要写一坨创建代码 + 分支分发。扩展新关卡要复制粘贴，正是用户想避免的。

**期望**（供编译器团队评估可行性）：
- 支持 `forEach` 展开为图（或提供"按列表批量创建"的复合节点）
- createPrefab prefabId 支持从字典/图变量读取（或提供"按 prefabId 变量创建"的节点）
- 关卡数据字典化：`createDictionary` + `queryDictionaryValueByKey` 已可用，缺的是"用字典值驱动创建"

**证据**：`examples/lights-out/src/game-manager.ts`（50 个手写 createPrefab）；`parseValue` 对 prefab_id 的 literal 校验。

## 缺陷 6：DSL 表达式复用导致二次求值（计数翻倍坑）

**现象**：`const next = f.addition(count, 1)` 后，`next` 同时传给 `set` 和 `equal` 两处 → 引擎对 equal **重新求值** Addition（基于 set 后的新值）→ 一次调用计两次（日志 2723 rec643：7→8→9 直接 win）。

**影响**：任何"读-算-写-判"模式的 DSL 代码都会翻倍，需要开发者绕过（先 set 再重新 get）。这是**语义陷阱**，不是文档化行为。

**期望**：编译器/运行时对同一 value 的多次消费保持求值一致性（值快照语义），或文档明确"一个表达式只应被消费一次"并给出 lint 警告。

**证据**：日志 2723 rec643 帧序列；`examples/lights-out/src/game-level*.ts` 已改"set 后重新 get"绕行。

---

## 汇总表

| # | 缺陷 | 严重度 | 阻塞的玩法需求 | 期望能力 |
|---|---|---|---|---|
| 1 | createPrefab 动态实体组件继承缺口 | 🔴 高 | 旋转/公转庆祝、胜利组合动画 | 动态创建复制组件槽 |
| 2 | CLI 无法更新既有实体 tabBar options | 🔴 高 | 「立即胜利」等通关新选项 | patch 支持组件 |
| 3 | 光源组件 CLI 不支持 | ✅ 已交付（2026-08-17） | 点亮/熄灭发光效果 | CLI 支持光源组件 |
| 4 | UI 控件/铭牌/气泡无 CLI 入口 | 🟡 中 | 开始界面、结算弹窗、引导 | Cfg 资源注册 |
| 5 | DSL 无 forEach / prefabId 非字面量 | 🟡 中 | 数据驱动关卡（扩展性） | 批量创建/动态 prefabId |
| 6 | DSL 表达式二次求值 | 🟡 中 | 计数类逻辑可靠性 | 值快照语义 + lint |

## 当前游戏状态（缺陷 2 未解决前的临时方案）

- 🔴 **已回退**：v5 中"立即胜利=再点一次开始游戏"（winDone 复用）是**不合理设计**，本人已承认错误——该方案**不作为最终交付**，待缺陷 2 补齐后改为真正的「立即胜利」选项
- ✅ 保留：清理链补灯头（缺陷外修复）、原地创建（缺陷外修复）、30s 定时器自动结算（API 已可用）
- 待编译器团队确认优先级后，再定 v5 最终形态
