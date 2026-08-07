# 节点图逻辑模块：复合节点（定义/映射/调用）

只在调查用户自建复合节点的创建、参数（输入/输出/控制流）、改名、排序或调用侧连线/填值时
加载本模块。普通 SysCall 连接仍走 `connections.md`；信号走 `signals.md`。

## 最小恢复（唯一锚点 = manifest 恢复块）

复合节点续作只读 connection-v1 的 notes/manifest.md 顶部「恢复块」：
`/home/h/genshin-ts-evidence/node-graph-logic/node-graph-systematic/2026-08-06-connection-v1/notes/manifest.md`
（历史 case 段 v22-v48 是复合节点证据，仅核对时读）。恢复块含 map path/mapId/GID/
LOCKED_BEFORE/LOCKED_HASH/最近唯一操作/当前图状态/下一选题；每轮结束更新它。
⚠️ 恢复块里的历史图状态（节点数、实例位置、参数列表）可能滞后于快照：归因或跨轮对比前先
对锁定快照实测重验（2026-08-08 case5 教训：恢复块"42 节点"是更早旧状态误记，导致 case1
归因时误判"+1 节点干扰"，实际 v59→v60 为 43→43 纯重编号）。

当前 Authority：`docs/game-engine-knowledge/composite-nodes.md`（wire 章节 2026-08-06 v22-v48
CONFIRMED）；Variant 联动另见 `node-graphs.md`。

## 三处联动定位

复合节点任何修改先看三个位置（Level payload root 10 容器）：

1. **宿主图实例**（root 10.field1 NodeGraph，SysGraph 22001 + nodeId 0x6000000N）——
   调用侧 pins 落这里（惰性实例化，field7=pinIndex 引用定义）；
2. **CompositeDef**（root 10.field2 列表末尾，Id{genericId/concreteId=SysGraph,
   graphId=CompositeGraph 21002} + type(107)=1000 + name(200) + inputs(102)/outputs(103)/
   inflows(100)/outflows(101) + 参数流 pinIndex(8)）——定义侧；
3. **内部实现图**（root 10.field4 列表末尾，NodeGraph id=CompositeGraph 0x6000000N，
   nodes=搬入节点无坐标，compositePins(4)={outerPin, innerNodeId, innerPin, innerPin2}）——
   映射侧。

差分入口：`npx tsx tools/compare-gil-node-graph.ts "$BEFORE" "$AFTER" "$GID"` 先摘要
（added/removed/changed），再对 root 10 容器逐 field 列表项字节对比（field2 59 项 /
field4 29 项，找"末尾追加"或"等长重排"）。宿主实例 nodeIndex 在修改定义结构后可能重编号
（3→5→6→7→8 样本），**保存后从 after 确认 nodeIndex，不要预猜**；等长变化（如交换参数
顺序）文件 hash 变但大小不变，必须逐字节对比。

## 已闭合骨架（v22-v48）

- 创建：宿主图删原节点 + 加 SysGraph 实例（零 pins）；CompositeDef 追加（零参数时
  100-103 全省略）；内部图追加（原节点原样搬入，无坐标）。
- 改复合名 / 改参数名：只写 CompositeDef.name(200) / inputs[].name(1)，其余不动、
  **不触发实例重编号**。
- 加输入/输出/控制流 pin：CompositeDef 追加 ParameterFlow/ControlFlow + 内部图
  compositePins 追加映射（按 (kind,index) 升序插入）；**实例重编号非必要联动（case2/case6
  两样本实测：提升内部节点输入时宿主实例与内部节点 pins 零变化；实例重编号统一假说
  见下：重建时最小空闲排除墓碑，原位则零变化）**。
- **提升输入 = 加输入参数（case2/case6 同构）**：def 插 {1:name,2:1,3:{1:kind,2:shell},
  4:type,8:pinIndex} + compositePins 插 {1:outer,2:innerNode,3:inner,4:inner双写}；
  宿主实例与内部节点 pins 零变化（被提升 pin 可本无落盘）；Bol type 两样本 CONFIRMED。参数顺序 = 实例 pin 顺序 = CompositePin outer 顺序。
- 调用填值/连线：实例新增 InParam pin（i1/i2={kind=3, ShellIndex} + type + value/connects +
  field7），定义层不动。输出：实例永不落输出 pin（被消费也零落盘，v32）。
- 控制流调用（v38/case23）：InFlow 作目标不落 pin（源侧 connects→实例 id）；OutFlow 作源
  落 kind=2 pin + connects + field7；实例已落盘控制流 pin 的 index 跟随 outflow 排序重写。
- 交换参数顺序（v30 输入/case22 输出/case23 控制流三向）：ShellIndex 按新顺序重写、pinIndex
  保持（身份号）、CompositePin outer 跟随而 innerPin 保持、实例 pins 跟随。
- 内部 Variant 选型/改类型（case17/18）：concreteId=选中 KernelID + R<T> pin 全量联动重写
  （与连线方向无关）；类型不匹配的复合输出参数**整个删除**（非类型联动）；断线行为由目标
  节点类型决定——Variant 目标 pin 保留清 connects、Fixed 目标整 pin 移除。
- 内部控制流连线（case19）：与宿主图完全同构（源落 OutFlow pin + connects→内部 nodeIndex）；
  **控制流连线不触发 Variant 实例化**；多分支 DefaultBranch=Shell0、Case1..10=Shell1..10。
- 共享参数（v37 输入/case25 输出/case26 输入三向）：合并=保留目标参数、删被合并参数
  （pinIndex 不释放）、被删方映射 outer 改写为保留 ShellIndex、映射不删除、升序重排。
- pinIndex 分配器（2026-08-08 case6/case7 四样本 CONFIRMED）：无手动删除史=单调递增
  （跳过占用/墓碑）；**手动删除后该 def 全部已删号回收进池、取池最小**（89→删→51、
  60→删→52 两对配对样本）；分配顺序 outflow 先于 inflow（两样本）。
- compositePins 顺序 = f2 参数出现顺序（inflows→outflows→inputs→outputs，组内按参数顺序；
  共享多映射按创建顺序）。
- 参数流 type 编码：Ety={type1=1, type2=1}（无 class）；Int={class=2, type1=3, type2=3}；
  Flt={class=4, type1=5, type2=5}；Str={class=5, type1=6, type2=6}；**Bol={class=6,
  type1=4, type2=4, field101={1:1}}（case2/case6 两样本 CONFIRMED）**；class 大类型号与 type1/type2 值不同。
- 内部图 compositePins：outerPin=外壳（顺序号）、innerNodeId=内部节点、innerPin/innerPin2
  双写=内部真实 pin（身份）。

## 常用命令

工具脚本都在 `/home/h/genshin-ts/.agents/skills/editor-incremental-gia-investigator/scripts/`
（python 与 ts 混用；ts 用 `npx tsx` 跑）：

```bash
# 图级差分（added/removed/changed 摘要）——genshin-ts/tools/ 下
npx tsx /home/h/genshin-ts/tools/compare-gil-node-graph.ts "$BEFORE" "$AFTER" "$GID"
# 全 GIL root occurrence wire 对比（rootPresenceStable + changedRootFields，含等长变化）
python3 .../scripts/compare-gil-root-wire.py "$BEFORE" "$AFTER" --output diff.json
# root 10 容器 field2(CompositeDef)/field4(内部图) 逐项字节对比（v31 固化，见下）
npx tsx .../scripts/compare-level10-containers.ts "$BEFORE" "$AFTER"
# 宿主实例 / 内部节点 pin 定点 raw（含 field7）
npx tsx .../scripts/extract-node-raw.ts "$AFTER" "$GID" "$NODE" --pins
# 复合定义/内部图定点解码（v22-v48 资产化）：无参=列表摘要，N M=def/graph 详细
npx tsx .../scripts/inspect-composite-def.ts "$GIL" [defIndex] [graphIndex]
# 数据流/控制流 case 验证器（复合路径未覆盖，勿用于复合）
npx tsx .../scripts/verify-data-flow-experiment.ts / verify-control-flow-experiment.ts
```

root 10 容器解析要点（v31 实测避坑）：
- `readGilPayloadFields` 的顶层 fields 是 parseMessage **递归**结果（含全部深度），
  取 Level 容器必须 `filter(depth === 1 && field === 10)`；`find(field === 10)` 会命中深层字段。
- root 10 的 field2/field4 列表项是**单层 f1 包装**（f1 内容直接是 CompositeDef/NodeGraph 字段），
  与 gia.proto 的 CompositeDefWrapper{InnerWrapper} 两层结构不符，protobufjs decode 会错位/越界；
  可靠解码用 gil_wire_lib.walk（只收集 wire=2 嵌套 message；varint 字段如 Id 需手动扫）。
- 字符串字段（CompositeDef name/description、ParameterFlow name、NodeGraph name）不能递归 walk，
  UTF-8 中文内容会当 message 解析越界；直接按字段号取 bytes 解码。
- compare-gil-root-wire.py 的 encodedBytes 含 tag+len，valueBytes 不含；directChildDelta 的
  added/removed 是 occurrence 级替换（按 wire 顺序对齐，不是字段号聚合）。
- 每轮差分输出归档到 case 目录（root-wire-diff.json 等），manifest 记 SHA-256。

## 未闭合（下一轮候选）

- field203=6 语义、pinIndex 全局分配器位置、f2/f4 列表数量差（59 vs 29，可只读普查）；
- 实例 nodeIndex 重编号的空闲号池精确分配规律（主图连线不重建已闭合，其余都重建）；
- 复合节点执行语义（共享输入/输出运行时行为、分支执行顺序——游戏验证范畴）；
- 嵌套复合节点、内部图消费输入的运行时绑定。
