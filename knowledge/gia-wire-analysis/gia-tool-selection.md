# GIA analysis tool selection

Choose trace, decode, semantic diff, topology, layout, coverage, or raw-wire tools by question.


<!-- CLAIM:START clm_01KYH4ZJ0Q06EDE5T9ETYCAGK4 -->

### 按问题选择最小的 GIA 工具，仅在缺证据时升级（Choose the smallest GIA tool by the question and escalate only for missing evidence）

控制拓扑用执行追踪、值来源用数据流追踪、字段朝向用解码、受限 A/B 结构用语义 compare/diff、调用与分类用 topology/coverage/gap 工具、仅坐标用布局工具、presence 或未知字段用 raw 扫描/round-trip。始终从最小工具输出与精确图范围开始，而不是全量解码语料。

Use execution tracing for control topology, dataflow tracing for value provenance, decode for field orientation, semantic compare/diff for bounded A/B structure, topology/coverage/gap tools for calls and classification, layout tools only for coordinates, and raw scanners/round-trip checks for presence or unknown-field questions. Start with the smallest tool output and exact graph scope rather than full decoded corpora.

#### 适用边界

工具输出继承其解码器与范围限制：trace 类型标签不证明控制有效、语义 diff 不证明 wire presence、布局输出不证明游戏行为。

Tool output inherits its decoder and scope limits: trace type labels do not prove controls work, semantic diff does not prove wire presence, and layout output does not prove game behavior. Revalidate when tool CLI, output semantics, decoder, or documented selection table changes.

<!-- CLAIM:END clm_01KYH4ZJ0Q06EDE5T9ETYCAGK4 -->
