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

<!-- CLAIM:START clm_2B77A59F626CEE63E0191669C5 -->

### 事件回调中复合 capture 参数是惰性引用非快照

复合输入 capture 在事件回调（延迟执行路径，如 whenTimerIsTriggered）中不是调用时快照：引擎沿数据链追回宿主数据源（2690 日志 rec7：注册时 i=1→DTC 输出 1，定时器触发时重求值为 0）。事件回调需要调用时值必须用事件载荷字段（timerName/timerSequenceId/eventSourceEntity）或字面量，不能引用 capture。旧 setTimeout 机制正常是因为编译器用 __gsts_timeout_N_cap_i 字典做了显式值快照。

#### 适用边界

复合内事件回调引用 capture 参数的场景；同步执行路径（复合调用时刻）capture 正常；宿主 setTimeout 回调（编译器快照）不受影响

<!-- CLAIM:END clm_2B77A59F626CEE63E0191669C5 -->

<!-- CLAIM:START clm_B90783C13F06F78A94728CDBB3 -->

### impl 内部 exec 边指向的复合调用节点必须有物理 InFlow pin

impl 图内 multiple_branches 分支等内部 exec 边指向的复合调用节点必须补物理 InFlow pin：buildCompositeCallPins 只生成显式声明的 flow pin，requiredCompositeCallInflows 只从 boundaryPins（复合自己的 InFlow 边界映射）收集，内部 exec 边目标的 InFlow 不在其中；主图路径在 ordinary materializer 自动建 pin，impl 路径合成节点后生成（materializeLegacyImplGraphNode）漏了。修复：syntheticNodes 生成后扫描 implEdges 收集每个合成节点被内部 exec 边指向的 InFlow index 补 pin（与 #11/#12 同构）。2691 日志实证：trigger MB→dispatch 调用后 dispatch 零帧。

#### 适用边界

复合 impl 内部 exec 边（MB 分支→复合调用）场景；复合自己的边界 InFlow（boundaryPins）不受影响；纯数据流调用（数据复合被当数据节点）无需 InFlow

<!-- CLAIM:END clm_B90783C13F06F78A94728CDBB3 -->

<!-- CLAIM:START clm_CCF86C1A5174DFAD6DDC47ABDB -->

### 纯事件复合判定=事件节点+无 outflow+无显式 inflow

纯事件复合（如 gsts_orbit_trigger：无 inputs/outputs/inflows/outflows，入口=f.on 事件）与混合复合（调用流+事件节点，如 gsts_orbit_segment：whenCustomVariableChanges 事件+done outflow+调用流需求）必须区分：判定过宽（只要 impl 含 when_* 就当纯事件复合）会砍掉混合复合的调用流 InFlow 路由→CompositeDef inflows=[]→注入器按接口裁剪调用点引脚→MB 分支边被丢（2691 读图自检实证）。正确判定=事件节点+无 outflow 标记+无显式 inflow 声明三条件。

#### 适用边界

复合定义接口判定场景；纯事件复合（trigger）与混合复合（orbit_segment）的区分；不影响纯调用流复合

<!-- CLAIM:END clm_CCF86C1A5174DFAD6DDC47ABDB -->

<!-- CLAIM:START clm_26377685777BD6F2DE40A797D4 -->

### 复合内有限循环/事件/信号能力边界（#21 游戏实测）

复合 build 内 f.finiteLoop 可用（纯图节点，2696 日志 8 次循环帧实证）；复合内 whenCustomVariableChanges（实体自定义变量+触发=是）触发、whenNodeGraphVariableChanges（图变量变化）不触发（轮 12f + 2695 独立复现）；复合内 f.sendSignal 可编码+图级 onSignal 消费参数；混合复合（事件+调用流共存）必须 entry→outflow 调用流 + 事件独立旁路（纯事件复合不可被调用流链式调用）。

#### 适用边界

复合内事件/循环/信号能力场景；纯事件复合调用限制；宿主 setTimeout 不受影响

<!-- CLAIM:END clm_26377685777BD6F2DE40A797D4 -->
