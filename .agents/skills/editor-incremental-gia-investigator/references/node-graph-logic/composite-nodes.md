# 节点图逻辑模块：复合节点（定义/映射/调用）

只在调查用户自建复合节点的创建、参数（输入/输出/控制流）、改名、排序或调用侧连线/填值时
加载本模块。普通 SysCall 连接仍走 `connections.md`；信号走 `signals.md`。

## 最小恢复（唯一锚点 = manifest 恢复块）

复合节点续作只读 connection-v1 的 notes/manifest.md 顶部「恢复块」：
`/home/h/genshin-ts-evidence/node-graph-logic/node-graph-systematic/2026-08-06-connection-v1/notes/manifest.md`
（历史 case 段 v22-v30 是复合节点证据，仅核对时读）。恢复块含 map path/mapId/GID/
LOCKED_BEFORE/LOCKED_HASH/最近唯一操作/当前图状态/下一选题；每轮结束更新它。

当前 Authority：`docs/game-engine-knowledge/composite-nodes.md`（wire 章节 2026-08-06 v22-v30
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

## 已闭合骨架（v22-v30）

- 创建：宿主图删原节点 + 加 SysGraph 实例（零 pins）；CompositeDef 追加（零参数时
  100-103 全省略）；内部图追加（原节点原样搬入，无坐标）。
- 改复合名 / 改参数名：只写 CompositeDef.name(200) / inputs[].name(1)，其余不动、
  **不触发实例重编号**。
- 加输入 pin：CompositeDef.inputs 追加 ParameterFlow + 内部图 compositePins 追加映射；
  实例重编号。参数顺序 = 实例 pin 顺序 = CompositePin outer 顺序。
- 调用填值：实例新增 InParam pin（i1/i2={kind=3, ShellIndex} + type + value + field7），
  定义层不动。调用连线：同普通连接（connects→源 OutParam，源默认省略 index），仅多 field7；
  内部图零感知（运行时绑定）。
- 交换参数顺序：三处联动重排——ShellIndex 按新顺序重写、pinIndex 保持（身份号）、
  CompositePin innerPin 保持内部真实 Shell（映射按参数身份绑定）、实例 pins 跟随。
- 参数流 type 编码：Ety={type1=1, type2=1}；Str={class=5 StringBase, type1=6, type2=6}。
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

- 给内部 337 选 Flt 变体的确认性实验（type {1,1}→{class=4,5,5}、concreteId 337→341）与
  内部控制流连线（323 的 FlowIn 内部接法）——最优先；
- compositePins 数组顺序规则（v35/v36/v37 观察未闭合）；
- 内部节点在内部图中的连线与消费输入方式；
- 控制流参数（inflows/outflows 定义 + 实例 kind=2/1 pin）在自建复合上的实测；
- field203=6、pinIndex 全局分配器位置、f2/f4 列表数量差（59 vs 29）；
- 实例 nodeIndex 重编号的确切触发条件（v29 主图连线不重建，其余都重建）。
