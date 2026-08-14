# Composite exec chain integrity

合成→普通 exec 边的 IR 源解析与目标 InFlow pin 完整规则；断链诊断判据（日志零帧→IR/GIA 检查）

<!-- CLAIM:START clm_A0AABCE5C788D7B423C905F0E7 -->

### connect 的 FlowMarkerRef 源必须用解析后的 __markerNodeId

core.ts connect() 对 composite call 返回对象（只有 __markerNodeId 无 id 属性）必须用解析后的 sourceId 作为 addEdge 源；若用 sourceRef.id 则 IR implEdges 源写成 undefined，materialize 找不到源静默丢边，链尾普通 exec 节点游戏内零帧、outflow 不触发。修复：addEdge(current, sourceId, ...)。

#### 适用边界

适用于 f.connect(compositeCallResult, outflowIdx, execNode, inflowIdx) 的合成→普通 exec 边；不适用于普通节点→普通节点（两者都有 id）。

<!-- CLAIM:END clm_A0AABCE5C788D7B423C905F0E7 -->

<!-- CLAIM:START clm_629530CF4A9643B2DFAD822F7D -->

### synthetic→ordinary exec 边的目标普通节点必须有物理 InFlow pin

vendor 物化不生成普通 exec 节点的 InFlow/OutFlow pins；synthetic（复合调用）→普通 exec 边的目标节点必须补物理 InFlow pin（compositePins 映射未覆盖时 #11 逻辑不补）。vendor overlay 与 legacy-handwritten 两后端都要补（unshift 前插，flow pin 在前），否则游戏端不执行目标节点。回归：tests/composite/test-composite-synthetic-to-ordinary-exec-edge.ts（IR+GIA 双层，双后端红绿）。

#### 适用边界

适用于复合 impl 图内合成调用 outflow 直连普通 exec 节点的场景；compositePins 已覆盖的节点（#11）不重复补；纯数据复合无 exec 边不适用。

<!-- CLAIM:END clm_629530CF4A9643B2DFAD822F7D -->
