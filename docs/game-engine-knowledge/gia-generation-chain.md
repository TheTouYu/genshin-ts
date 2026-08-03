# GIA 生产链路与可复现性

> 状态：已验证（生成、注入、游戏测试通过）；GIA 字节级不可复现已定位为 vendor 设计
> 来源：2026-08-02 信号 GIA 全链路（`gsts-signal-demo-test.gia` 生成 + 注入 + 游戏核验）
> 适用范围：用生产 `irToGia` 从地图注册数据生成正式 GIA、以及任何“生成 GIA 资产”任务

本文档是 GIA 生成链路的唯一入口：记录生产链路、可复现性边界和常见坑位，避免新会话
重新踩坑。

## 生产链路（成功路径）

```text
readRegisteredSignalsFromGil(<map.gil>)     src/cli/gil_signals.ts
  → 信号注册数据（参数名/类型、三套 pinIndex、signalVersion、信号名 pinIndex、definition bytes）
→ createSignalRegistry([signal])             src/compiler/signal_registry.ts
→ buildServerGraphRegistriesIRDocuments()    src/runtime/core.ts
  （先在模块顶层用 g.server({name, id}).on(...).onSignal(...) 注册业务图）
→ irToGia(docs[0], {graphId, name, protoPath, signalRegistry})   src/compiler/ir_to_gia_transform/index.ts
→ 写入 Beyond_Local_Export/ 根目录（游戏加载/编辑器扫描目录），不覆盖已有文件
→ decode_gia_file(<文件路径>, protoPath) 验证：
   graph.id.id / filePath 匹配 / gameVersion=6.7.0 / send+monitor 节点存在
```

参考实现：`.local/tmp/generate-signal-layout-fixed.ts`（参照 GIA）、
`.agents/skills/editor-incremental-gia-investigator/scripts/generate-signal-demo-gia.ts`（本轮业务 GIA）。两个脚本都是独立可跑的生产
链路示范；生成脚本必须“已存在则断言逐字节相同，不同则拒绝覆盖”。

## 可复现性边界（重要）

**GIA 字节级不可复现是 vendor 设计，不是 bug**：

1. vendor `node_body()`（`gia_gen/basic.ts`）：
   `x: body.x * 300 + Math.random() * 10 // shakings`——给每个节点坐标加 0~10 随机抖动。
   因此同一输入两次生成，节点坐标（GraphNode x/y）不同。
2. GIA `filePath` 含生成时间戳：`{UID}-{TIME}-{LEVEL_ID}-\{FILE_NAME}.gia`（gia.proto 注释），
   每次生成不同。

推论与对策：

- “同信号同定义逐字节一致”的对比目标**不可达**；对比应改为**结构一致**：
  忽略 x/y 坐标与 filePath 时间戳，其余字段（节点 identity、pin、connect、signalVersion、
  CompositeDef accessories）逐字节/逐语义一致。
- 参照 GIA 的“hash 相同”只证明同一产物被复制过，不证明重新生成可复现。
- 生成脚本的“已存在则拒绝覆盖”断言在每次重新生成时都会触发，属预期行为；需要更新
  产物时应先删除旧文件（或先人工确认语义 diff）。
- 若未来需要确定性输出，应在调用 `irToGia` 前替换 `Math.random` 为固定 seed（不动
  thirdparty vendor）。

## 常用验证工具

```text
tools/list-gil-node-graphs.ts <map.gil>         proto 解码 root 10.1.1（NodeGraph blob）
src/cli/assets_signals.ts inspect --gil <map>   信号注册表回读
src/cli/static_assembly/wire.js                 通用 wire 解析/编码（parseWireMessage / emitWireMessage）
```

## 坑位清单（本链路踩过的坑，按出现顺序）

| # | 坑 | 正确做法 |
| --- | --- | --- |
| 1 | `parseArgs` 不剥离 `register` 关键字，显式 `register` 子命令直接 usage 退出 | 已修复（`src/cli/assets_signals.ts`）；默认命令即 register，省略关键字可绕过 |
| 2 | root 10 图记录少包一层：直接写 `{1: Id, 2: name}` 会被 `list-gil-node-graphs` 解码为 17B 的 Id 并报 `index out of range` | 双层包装：记录 = `{1: NodeGraph}`，NodeGraph = `{1: Id, 2: name, 3: nodes}` |
| 3 | 用 `GraphNode` 字段号去解析 CompositeDef（或反之） | GraphNode：nodeIndex=1 / genericId=2 / concreteId=3 / pins=4 / x=5 / y=6 / signalVersion=9；CompositeDef/NodeProperty 的 id 用 `nodeId` 字段（`parseNodeGraphId` 结构） |
| 4 | decode 后读 `genericId.id` 得到 undefined | decode 产物是 `genericId.nodeId`（int64 在 protobufjs 中显示为 Long 对象，`===` 数字比较前先 `.toString()` 或转 Number） |
| 5 | `decode_gia_file(bytes)` 直接传 Uint8Array 报错 | 它只接受文件路径；先写临时文件再解码 |
| 6 | tsx 脚本顶层 `await` 报 “Top-level await is currently not supported with the cjs output format” | 包 `async function main() { ... }; main()` |
| 7 | 注入目标地图没有任何节点图时，注入器找不到目标（`findFolderEntryField` 失败） | 先用 `.agents/skills/editor-incremental-gia-investigator/scripts/create-empty-node-graph.ts` 生成空图（root 10 双层包装 + root 6 “未分类页签” #5 条目），再注入 |
| 8 | GIA 字节对比失败以为是 bug | 先排除 vendor 坐标抖动（#7 的 Math.random）与 filePath 时间戳；两者都非回归 |
| 9 | 注入后图名被覆盖为 `_GSTS_<name>` | 预期行为（injector 用 GIA 图名替换）；空图占位名不重要 |
| 10 | `gsts` 注入会自动覆盖 `src/resources/prefabs.ts`（从目标地图提取） | 新地图提取会删除旧地图的 prefab 定义；该文件与 `signals.ts` 一样属自动提取产物，已加入 `.gitignore`，提交前无需处理；不要手动提交其提取内容 |

生成与建图工具已正式放入技能脚本目录（可复用资产）：

```text
.agents/skills/editor-incremental-gia-investigator/scripts/create-empty-node-graph.ts
.agents/skills/editor-incremental-gia-investigator/scripts/generate-signal-demo-gia.ts
```

## 分层证据

```text
生产链路生成 → decode 回读断言 → 注入器识别（folder entry + append wrapper）
→ 游戏内图正常显示/运行（用户核验）
```

自动断言通过 ≠ 编辑器可导入/游戏行为正确；本链路的两层用户核验（注入后游戏运行、
GIA 编辑器导入）均已 PASS。
