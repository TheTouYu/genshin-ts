# Handover 文档说明

> **历史会话记录** — 这些文档记录开发过程中的轮次交接、阶段性分析、以及架构决策的演变过程。

## ⚠️ 使用提示

1. **API 名称已更新**：这些 handover 文档中的 API 名称（如 `eventMarker`、`linkTo`、`registerExecNode`、`leaf`）反映当时的实现状态。当前权威的低层控制流 DSL 请参考 [`../../architecture/composite/raw-control-flow-dsl-quickstart.md`](../../architecture/composite/raw-control-flow-dsl-quickstart.md)，其中：
   - `eventMarker()` → `entry()`（旧名仍可用）
   - `linkTo()` → `link()`（旧名仍可用）
   - `registerExecNode`（自动串联）→ `node()`（detached）
   - `leaf(idx)` → `outflow(name, source, idx)`

2. **这些文档是开发历史记录**，保留原始术语和当时的分析结论。新的 API 用法和模式以 `docs/architecture/composite/` 中当前版本文档为准。

3. **代码示例**：handover 中的代码片段是当时的实验性代码，可能使用了已弃用的 API 名称。实际开发以 `tests/composite/` 目录中的测试源码为准。

## 当前编写入口

- 新 handover 模板：[handover-template.md](handover-template.md)。默认一轮一个明确任务，以“下一轮目标”和“可用资源与执行边界”为主体。
- 工作细节准则：[layout-working-rules.md](layout-working-rules.md)。每轮作为 P0 资源引用，按任务读取匹配小节，不要求预先加载全文。
- 历史 handover 保持原样；不要为了套用新模板回写历史文档。

## 最近交接轮次一览

> 通用布局协作规则、导出路径、复制命令和小步验证约定见：[layout-working-rules.md](layout-working-rules.md)。各轮 handover 应引用该文件，不再重复维护这些细节。

| 轮次        | 文件                                                                                               | 主要主题                         | 当前状态                                                                                                                                                      |
| :---------- | :------------------------------------------------------------------------------------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| r21         | [r21-outflow-api-redesign-pending.md](r21-outflow-api-redesign-pending.md)                         | outflow API 重设计（未完成）     | 设计已被 r22/r23 和当前 raw control-flow DSL 替代                                                                                                             |
| r22         | [r22-fan-in-and-debug-3456.md](r22-fan-in-and-debug-3456.md)                                       | fan-in API 实现，debug3/4 复刻   | fan-in 概念仍有效；API 名称已被后续文档整理                                                                                                                   |
| r23         | [r23-outflow-api-done-debug56-next.md](r23-outflow-api-done-debug56-next.md)                       | outflow API 正交化               | 核心思路保留；debug5/6 做法被 r24/r25 后续复刻替代                                                                                                            |
| r24         | [r24-debug56-recreate-draft-review.md](r24-debug56-recreate-draft-review.md)                       | debug5/6 草稿复刻 review         | 已被 r25 的结构复刻和 r26 当前 DSL 文档替代                                                                                                                   |
| r25         | [r25-debug56-structural-recreate-dsl-api-next.md](r25-debug56-structural-recreate-dsl-api-next.md) | debug5/6 结构复刻与 DSL API 建议 | API 建议已落到当前 raw control-flow DSL，阅读时以 quickstart 为准                                                                                             |
| r26         | [r26-documentation-governance-next.md](r26-documentation-governance-next.md)                       | 文档治理计划                     | 计划已开始执行；当前规则见 [../../documentation-governance.md](../../documentation-governance.md) 和 [../../documentation-map.md](../../documentation-map.md) |
| layout-r8   | [layout-handover-round-8.md](layout-handover-round-8.md)                                           | 场景 C：多执行泳道真实样本探索   | 已由 layout-r9 的中间实现和游戏内反馈继续推进                                                                                                                 |
| layout-r9   | [layout-handover-round-9.md](layout-handover-round-9.md)                                           | 多执行泳道 block-aware 中间实现  | 游戏内反馈：下移系数偏高，测试未复刻参考文件；已由 layout-r10 严格复刻和分步验证继续推进                                                                      |
| layout-r10  | [layout-handover-round-10.md](layout-handover-round-10.md)                                         | `布局c` 严格复刻与布局调参       | `layout-r6-c-reference-repro` 与 long-input 变体已游戏内验证通过；当前参数已提交，但仍属 gsts 当前输出经验值                                                  |
| layout-r11  | [layout-handover-round-11.md](layout-handover-round-11.md)                                         | long-input step7、复合数据流编码 | step4/6/7 已游戏内验证并提交；记录 `dataLanePadding=1100`、复合 impl concrete InParam/OutParam 类型修复，以及下一轮 step7 布局反馈流程                         |
| layout-r12  | [layout-handover-round-12.md](layout-handover-round-12.md)                                         | 主图与复合 impl 布局统一计划     | 场景 C 已通过；场景 D 暴露复合 impl 仍用简化布局。已由 layout-r13 完成 Phase 1 并继续分析共享布局问题。                 |
| layout-r13  | [layout-handover-round-13.md](layout-handover-round-13.md)                                         | 共享布局核心的数据流问题         | 已完成并提交：复合输出锚点、数据避开执行泳道、局部倒退/重叠修复均已游戏内验证；剩余数据链局部压缩交给 layout-r14。                 |
| layout-r14  | [layout-handover-round-14.md](layout-handover-round-14.md)                                         | 数据链局部压缩 + 控制流 yfix 回归 | 数据链 compact 已完成并归档；yfix3 缓解 R6-C root 分支掉到底部且无回归，但 R6-D 复合 impl 仍有局部控制流线/数据节点贴近问题，已由 layout-r15 继续。 |
| layout-r15  | [layout-handover-round-15.md](layout-handover-round-15.md)                                         | 局部执行 lane 避让数据区块 + 控制流覆盖 | 已游戏内验证并归档：新增共享 `avoidExecLanesNearDataBlocks(...)` 和 R6-E 控制流覆盖用例；五个 round15 GIA 已移动到 `真-测试通过/布局/`，导入根目录已清空。 |
| physics-r1  | [layout-handover-physics-motion-round-1.md](layout-handover-physics-motion-round-1.md)                 | `物理运动.gia` 真实结构复刻启动 | Step 0 已游戏内验证：严格复刻 `When Entity Is Created -> Create Prefab / 设置物理参数`，其中 `Create Prefab.Pfb` 来自 `Get Custom Variable("物理计算元件id")`；下一轮完整复刻 `设置物理参数` 复合内部，并维护 [../physics-motion-recreate-guide.md](../physics-motion-recreate-guide.md)。 |
| physics-r2  | [layout-handover-physics-motion-round-2.md](layout-handover-physics-motion-round-2.md)                 | 多文件工程与复合注入缺口定位 | 已完成多文件工程和 `设置物理参数` 第一轮复刻；定位到旧注入器只替换主 NodeGraph、未写入复合 accessories。 |
| physics-r3  | [layout-handover-physics-motion-round-3.md](layout-handover-physics-motion-round-3.md)                 | 复合注入完成与复刻质量问题 | 复合节点注入已修复并提交 `82261dd`，用户游戏内确认通过；下一轮优先修复 `设置物理参数` 的 InFlow fan-out、literal 输入 pin 和 impl 布局。 |
| physics-r4  | [layout-handover-physics-motion-round-4.md](layout-handover-physics-motion-round-4.md)                 | InFlow fan-out、literal pin、impl 布局修复与新反馈核验 | 已修复并注入；新反馈确认：`get_custom_variable` pin index 被压缩、`asType('float')` 输出 concrete 类型缺失、`S`/`D` 应保留但不接控制流；已由 physics-r5 修复并完成游戏内验证。 |
| physics-r5  | [layout-handover-physics-motion-round-5.md](layout-handover-physics-motion-round-5.md)                 | custom-variable pin/type 与 detached S/D 修复 | 已完成并经用户游戏内验证：变量名位于 `InParam[1]`，float/guid/int typed concrete 输出正确，`G -> mul3` 连线恢复，S/D 保留但不执行；同时记录显式注入、自动资源提取和“有疑问立即停下确认”的协作规则。 |
| physics-r6  | [layout-handover-physics-motion-round-6.md](layout-handover-physics-motion-round-6.md)                 | `更新v、w` 外层拓扑、nested OutFlow 与知识治理 | 主体已游戏内验证并允许提交：完成 19 节点外层拓扑和 5 个代理子复合，修复 trace expand、detached marker 与 nested physical OutFlow；布局垂直过松和 nested capture 多余物理 pin 留待下一轮回归修复。 |
| physics-r7  | [layout-handover-physics-motion-round-7.md](layout-handover-physics-motion-round-7.md)                 | nested capture 物理 pin 修复与游戏内回归 | 已自动验证并经用户游戏内测试通过：`更新速度`、`更新角速度` 调用为 `pins=[]`，`更新间隔` 仍通过两条 `compositePins` 路由；本轮未调整布局，下一轮小步收紧 impl 垂直间距并回归此前通过场景。 |
| physics-r8  | [layout-handover-physics-motion-round-8.md](layout-handover-physics-motion-round-8.md)                 | composite impl 控制流泳道独立压缩 | 已自动验证并经用户游戏内测试通过：仅对 composite impl 的 `execNodes` 应用 `execLaneSpacingScale=0.6`，控制分支约收紧 40%，数据节点坐标、X 坐标、拓扑和 pin 保持不变；物理运动及五个历史布局回归 GIA 已归档。 |
| physics-r9  | [layout-handover-physics-motion-round-9.md](layout-handover-physics-motion-round-9.md)                 | `计算分力` 复刻与 vec3 局部变量编码问题 | 历史过程：早期游戏内未通过；后续最小真实样本修复已完成，主图/复合路线及修正版物理整图均由用户确认游戏内通过。当前入口转到 physics-r10。 |
| physics-r10 | [layout-handover-physics-motion-round-10.md](layout-handover-physics-motion-round-10.md)               | 完成剩余三个真实算法复合 | 已完成：三个复合代理语义已替换；本轮还修复 sparse named composite input 通用编码并经用户游戏内确认 `计算滚动角速度` 生效。下一轮入口转到 physics-r11。 |
| physics-r11 | [layout-handover-physics-motion-round-11.md](layout-handover-physics-motion-round-11.md)               | 修复 `向量缩放除法` impl 空名输入路由 | 已完成并经用户游戏内确认通过：修复空字符串 inputName capture/compositePins 路由，新增 `test-composite-empty-name-input.ts`，物理整图注入验证通过。 |
| physics-r12 | [layout-handover-physics-motion-round-12.md](layout-handover-physics-motion-round-12.md)               | bool 输入参数 true/false 显示/选择问题 | 当前推荐：按真实 GIA 比对所有 composite bool 输入的 `CompositeDef.inputs`、调用节点 InParam pin 和 literal wrapper，修复游戏内不能正常选择 true/false 的通用编码问题。 |
| layout-next | [layout-handover-next-iteration.md](layout-handover-next-iteration.md)                             | 下一轮小步游戏内验证流程         | 早期下一轮入口，已被 layout-r11/r12/r13/r14/r15 继续推进；后续优先读最新 layout-r15，再按小步导出/游戏内反馈/通过后提交流程继续                                           |
