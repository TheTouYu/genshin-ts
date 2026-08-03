# 节点图逻辑模块：新建节点图与 GIA 生成链路

只在任务涉及“给 GIL 生成新节点图”“用生产 irToGia 生成 GIA 资产”“GIA 字节对比/可复现性”
时加载本模块。通用快照、安全确认和证据层级仍由主 `SKILL.md` 负责；信号注册/发送/监听
调查加载 `node-graph-logic/signals.md`。

## 最小恢复字段

```text
目标 GIL（新地图）是否已有节点图（tools/list-gil-node-graphs.ts）
注入目标 nodeGraphId
信号注册数据来源（readRegisteredSignalsFromGil）
参照 GIA 及其生成脚本（.local/tmp/generate-signal-layout-fixed.ts）
```

领域 Authority：`docs/game-engine-knowledge/gil-structure-semantics.md`（NodeGraph 路径 /
自由新建）、`docs/game-engine-knowledge/gia-generation-chain.md`（链路与坑位唯一入口）。

## 新建空 NodeGraph（已闭合，勿重做）

编辑器原生空图 wire 结构（生成工具 `.local/tmp/create-empty-node-graph.ts`，已在
1073741850.gil 真实写回并被注入器识别）：

```text
root 10 新增一条 field 1 记录（40B）：记录 value = {1: NodeGraph}     # 双层包装！
  NodeGraph = {1: Id, 2: name, 3: nodes...}
  Id        = {1: class=10000, 2: type=20000, 3: kind=21001, 5: id=图ID}
root 6 重写“未分类页签”聚合 record（顶层 #1=4）：field 3 容器内追加
  #5 = {1: typeValue=800, 2: 图ID}    # 800 = server 图 20000 的 folder 值
图 ID 起点 1073741825（地图内首个图）
```

- 少包一层（记录 = `{1: Id, 2: name}`）是最高频错误：`list-gil-node-graphs` 会解码出
  17B 的 Id 并报 `index out of range`。
- 新地图无任何节点图时，注入器 `findFolderEntryField` 找不到目标；必须先生成空图
  （folder 条目存在 + root 10 append wrapper 的“创建新图”路径才可用）。
- root 46 的等长变化语义 INSUFFICIENT，不模拟。

## GIA 生成链路（生产代码）

```text
readRegisteredSignalsFromGil → createSignalRegistry → buildServerGraphRegistriesIRDocuments
→ irToGia(docs[0], {graphId, name, protoPath, signalRegistry}) → Beyond_Local_Export/ 根目录
→ decode_gia_file(<路径>) 断言（graph.id / filePath / gameVersion / send+monitor 节点）
```

参考脚本：`.local/tmp/generate-signal-layout-fixed.ts`（参照）、
`.local/tmp/generate-signal-demo-gia.ts`（业务图）。生成脚本必须“已存在则断言逐字节
相同，不同则拒绝覆盖”。

## GIA 字节级不可复现（重要，勿当 bug 排查）

vendor `node_body()` 的 `x = body.x * 300 + Math.random() * 10 // shakings` 给坐标加
0~10 随机抖动；`filePath` 含生成时间戳。**任何“逐字节一致”对比目标都不可达**，应改为
结构一致（忽略 x/y 与 filePath 时间戳）。需要确定性输出时在调用 `irToGia` 前替换
`Math.random` 为固定 seed，不改 thirdparty。

## 专项断言

- `tools/list-gil-node-graphs.ts` proto 解码回读：`id/type=20000/name/nodeCount`；
  空图为 `nodeCount=0`。
- GraphNode 字段号（与 CompositeDef 不同，勿混用）：
  `nodeIndex=1 / genericId=2 / concreteId=3 / pins=4 / x=5 / y=6 / signalVersion=9`；
  身份读取用 `genericId.nodeId`（decode 后是 Long，比较前转 Number）。
- `decode_gia_file` 只接受文件路径（先写临时文件）；tsx 脚本顶层 await 需包 main()。
- 注入前确认目标图存在；注入后 `list-gil-node-graphs` 应显示 `_GSTS_<name>` 且节点数
  符合预期，信号注册表 inspect 不变。
- `gsts` 注入会自动覆盖 `src/resources/prefabs.ts`（从目标地图提取）；提交前检查该
  文件 diff，非预期删除应 `git checkout --` 恢复。

## 停止条件

出现以下情况停止本轮推广：目标图/注册表之外出现无法解释的结构变化；新图 ID 与编辑器
分配规则冲突；图类型不是 20000（client 20002 等 folder typeValue 未闭合）；root 46
变化被当成时间戳/校验值命名。
