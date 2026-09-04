# GIA object model and attachments

GraphUnit, GraphNode, NodePin, graph/accessory attachment, identity, and topology navigation.


<!-- CLAIM:START clm_01KYH4ZHS2RG0RJ01GW6EV1F7B -->

### GIA analysis navigates GraphUnit containers before GraphNode and NodePin details

In the current project schema and tools, a GIA root contains a main graph plus accessory `GraphUnit` records. A GraphUnit discriminant and identity select structures such as CompositeDef or an impl NodeGraph; GraphNodes carry node identity, index, pins and position; NodePins carry kind/index, value and connections; `relatedIds`, graph IDs and `compositePins` connect containers and boundaries. Analysis should resolve the containing GraphUnit and attachment relation before interpreting a node or pin.

#### 适用边界与失效条件

This is a navigation model for the registered schema/tool version, not proof that every vendor field is emitted by the editor or present on wire. Unknown accessory kinds and fields remain possible. Revalidate when `gia.proto`, decode tooling, GraphUnit discriminants, or attachment traversal changes.

<!-- CLAIM:END clm_01KYH4ZHS2RG0RJ01GW6EV1F7B -->

<!-- CLAIM:START clm_D855DC6B45CDA71076665B0BFA -->

### GIL payload 根不能按同号字段解释为 GIA Root

真实锁定 GIL 快照的 payload 根不是 gia.proto 定义的 GIA Root；GIL 根出现 Root schema 之外的字段，且同号字段存在 wire type 冲突，因此 GIL 根与 GIA Root 必须作为不同容器层解析。

#### 适用边界

适用于 2026-08-01 锁定快照及当前 GIL/GIA 解析边界；不宣称完整、跨版本 GIL schema，也不证明编辑器或游戏行为。

<!-- CLAIM:END clm_D855DC6B45CDA71076665B0BFA -->

<!-- CLAIM:START clm_FDE4D515516C7C959DD0DE89D9 -->

### decode-gia 常量落位形态三分：bInt / bId(config_id) / bEnum，权威类型表在 variables_verify

编译产物 .gia 解码后，常量按 wire 类型落在不同容器键：普通整数=bInt、config_id 类字面量（技能变量配置 ID、技能配置 ID、单位状态配置 ID）=bId（itemType.type_client.type=18）、枚举字面量（技能槽位、释放类型、坐标系）=bEnum。用 bInt 口径断言 bId 值必然 0 命中，看起来像“常量没折叠进图”，实为校验器形态漏分类；枚举值选错（如装配槽位 3121=槽1 vs 3132=槽12）结构层全绿但游戏内静默失效，因此槽位/模式类枚举值得单独设断言。全形态权威表在 src/cli/variables_verify.ts 的 PAYLOAD_KEYS / CLIENT_PAYLOAD_BY_CLASS（class 1=bId、2=bInt、4=bFloat、5=bString、6=bEnum、7=bVector、10002=bArray），新写任何“按 wire 键分类值”的代码应先抄该表而不是自选键集合。

#### 适用边界

适用于 tools/gia-verify-pin.ts 与 gil-node-graph-reading 捆绑扫描器的断言口径；bVector(vec3)/bStruct 形态两处扫描器当前仍不识别（登记 O-2026-09-04-08）；本 claim 是结构层（编译产物字节）结论，不含游戏行为。

<!-- CLAIM:END clm_FDE4D515516C7C959DD0DE89D9 -->

<!-- CLAIM:START clm_692FC355973F5A2FF587070753 -->

### decode-gia 两类边挂在不同端点：exec 挂源 pin（id=目标），数据边挂目的 pin（id=来源）

在 decode-gia 输出的 pins[].connects 里，执行边（connect.kind=1）挂在**源节点**的 pin 上、connects[].id 指向目标节点；数据边（connect.kind=4）挂在**目的节点**的 pin 上、connects[].id 指向来源节点、connect.index 是来源引脚序号。若按“连线的 id 一定是目标”这一单一约定建数据流图，会把每条数据边反向，误报“输入未连线/常量未连线”。多输出数据节点的输出引脚选择只能从数据边的 connect.index 判定（例：获取当前客户端时间（高精度） pin0=秒 / pin1=毫秒，DSL 里 .clientTimeS 与 .clientTimeMs 编译后唯一差别即该 index；选错结构层全绿、数值差 1000 倍）。

#### 适用边界

适用于 .gia/decode-gia JSON 与注入后 .gil 图记录的 connects 结构；不含游戏执行序结论（需帧值）。

<!-- CLAIM:END clm_692FC355973F5A2FF587070753 -->
