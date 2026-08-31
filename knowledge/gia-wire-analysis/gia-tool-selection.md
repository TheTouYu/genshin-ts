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

<!-- CLAIM:START clm_FDB76FEF6D4CED36974DBCFFB2 -->

### .gia 常量落位核验必须数值扫描：TS 常量折叠成 float32 形态，字符串 grep 会 0 命中

核验「TS 常量是否折叠落位到 .gia/.gil」时不能用字符串 grep：TS 侧 0.12 落盘为 float32 形态 0.11999999731779099（不含子串 '0.12'），0.35→0.3499999940395355、0.15→0.15000000596448、8.333→8.333333015441895，字符串匹配 0 命中是常态而非异常。正确做法是数值容差扫描（相对 1e-6）。一条命令工具：`npx tsx tools/gia-verify-pin.ts <file.gia> --vals 0.12,3.5 [--composite <名>] [--data]` 输出常量命中位置 + 信号三件套 + 复合名录 + 执行序。值在两套工具输出中的键名不同：decode-gia 为 pins[N].value.bConcreteValue.value，parse --json 为 inputs[N].value.value（纯浮点）。

#### 适用边界

适用于编译产物 .gia 与注入后 .gil 的常量核验（2026-08-31 足球四点合一实证：0.12 心跳常量字符串 grep 0 命中、数值扫描双工具命中）。只覆盖落位核验方法，不证明引擎运行时行为；int 型常量（如 4）字符串匹配仍可用但会多命中需人工判读。

<!-- CLAIM:END clm_FDB76FEF6D4CED36974DBCFFB2 -->
