# createInjector and findNodeGraphTargets

Exact replacement seams: createInjector, injectBytes, injectFile, findNodeGraphTargets, isNodeGraphEmptyForInjection.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_880C4DB58E0AD04C130A856689 -->

### 未知 GIA/GIL 行为以知识优先的单变化链路收敛

新功能、疑难 bug 或未知 GIA/GIL 规则先查询知识树与当前 Authority；仅在 coverage gap 后，由用户在编辑器专用图中每轮做一个可唯一归因的变化，保存相邻只读快照和 SHA-256，定点比较同一 nodeGraphId，再手工同构重放并在临时副本回读。未知规则闭合前不得先改生产代码，也不得用待修生产 lowering 证明规则。

#### 适用边界

这是项目调查与验证流程，不说明任一具体节点编码，也不授权地图写入。语义 JSON 不证明 wire presence；必要时仍需 raw-wire 或 round-trip。真实写回和游戏行为必须另行确认与验证。

<!-- CLAIM:END clm_880C4DB58E0AD04C130A856689 -->

<!-- CLAIM:START clm_2B593993003299201E6F576C7E -->

### 特定 NodeGraph 的新增节点通过完整 GIA 整图替换同构重放

当前 injector 不在 GIL 中原地追加单个 GraphNode，而是从候选 GIA 取完整 NodeGraph，按明确 targetId 替换唯一匹配的目标 blob并回读。2026-08-01 在专用图 1073741840 的真实相邻快照中，绑定发送节点新增 vec3_list 参数 pin 与 Assembly List<Vector>；从前快照手工重放该增量并注入临时 GIL 副本后，目标 NodeGraph protobuf 编码与后一编辑器快照逐字节一致。

#### 适用边界

实现与自动证据只覆盖 NodeGraph 整图替换及本次临时副本同构重放；地图整体字节无需相同。没有执行本轮真实地图写回，也没有新的游戏行为验证。具体 signal pin/VarType 规则由 signal-node-instance-encoding Topic 单独约束。

<!-- CLAIM:END clm_2B593993003299201E6F576C7E -->
