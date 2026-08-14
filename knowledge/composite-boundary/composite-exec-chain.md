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

<!-- CLAIM:START clm_055FEF3F9617AC525DD344F7BB -->

### 复合输入传子复合调用参数 = compositePins 路由

复合输入（capture）作为 callComposite 参数时，IR 序列化必须保留 capture 标记（capture 占位值 toIRLiteral 返回 null，若按 null 占位处理会丢标记 → classify 当 missing → 子复合调用参数丢失 NaN）。修复：composite_registry 对 isCaptureInput 的 null literal 生成 capture: true 占位。编辑器规则：复合输入→子复合调用参数 = compositePins 路由，调用点物理 pin 不落盘。

#### 适用边界

适用于复合 build 内 capture 输入直传子复合调用参数的场景；字面量参数（非 capture）不受影响；dict/_list 等需具体泛型的参数除外。

<!-- CLAIM:END clm_055FEF3F9617AC525DD344F7BB -->

<!-- CLAIM:START clm_5B4ACBBBD0D7F05AAAA4B77FDF -->

### 复合链尾节点必须显式连接；OutParam 惰性求值

复合 build 内链尾动作节点若用 f.node（detached）必须显式 f.link 连接（否则链断，如 spawn 的 setB7 未 link → blocks 永不设置）。复合 return 的 OutParam 在宿主消费时重新求值内部数据链（非调用时刻快照）：读→写同一变量再输出派生值必错；条件动作用 outflow 分支语义（done 只在实际分支触发，宿主调用后无条件续链）。

#### 适用边界

适用于复合 build 的 exec 链构建与输出设计；纯数据输出（不派生自被写入变量）不受影响；多层嵌套时每层同样适用。

<!-- CLAIM:END clm_5B4ACBBBD0D7F05AAAA4B77FDF -->
