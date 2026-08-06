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

```bash
# 宿主实例 / 内部节点 pin 定点 raw（含 field7）
npx tsx .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-raw.ts \
  "$AFTER" "$GID" "$NODE" --pins
# root 10 容器 field2（CompositeDef）/field4（内部图）列表逐项字节对比
# （临时脚本模式见 manifest v22-v30 各段；对比必须按 occurrence 不能按字段号去重）
```

## 未闭合（下一轮候选）

- 输出参数（outputs(103)/OutParam 侧对称结构）——最优先；
- 内部节点在内部图中的连线与消费输入方式；
- 控制流参数（inflows/outflows 定义 + 实例 kind=2/1 pin）在自建复合上的实测；
- field203=6、pinIndex 全局分配器位置、f2/f4 列表数量差（59 vs 29）；
- 实例 nodeIndex 重编号的确切触发条件（v29 主图连线不重建，其余都重建）。
