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
| 7 | 注入目标地图没有任何节点图时，注入器找不到目标（`findFolderEntryField` 失败） | 先用 `gsts assets:node-graphs create` 生成空图（root 10 双层包装 + root 6 “未分类页签” #5 条目），再注入 |
| 8 | GIA 字节对比失败以为是 bug | 先排除 vendor 坐标抖动（#7 的 Math.random）与 filePath 时间戳；两者都非回归 |
| 9 | 注入后图名被覆盖为 `_GSTS_<name>` | 预期行为（injector 用 GIA 图名替换）；空图占位名不重要 |
| 10 | `gsts` 注入会自动覆盖 `src/resources/prefabs.ts`（从目标地图提取） | 新地图提取会删除旧地图的 prefab 定义；该文件与 `signals.ts` 一样属自动提取产物，已加入 `.gitignore`，提交前无需处理；不要手动提交其提取内容 |
| 11 | 注入报 `multiple WSL LocalLow folders found` | 多 WSL 用户目录时显式设置 `GSTS_LOCALLOW_DIR=/mnt/c/Users/<user>/AppData/LocalLow`（按确认的游戏用户目录） |
| 12 | 注入报 `[error] target NodeGraph not found: <id>` | 目标图 ID 在地图里不存在。先用 `gsts assets:node-graphs create --gil <map.gil> --output <candidate>` 预览（图 ID 自动分配，空图从 1073741825 起），再 `--write`（自动备份 + 源 SHA 检查）写回空图占位，然后重新注入 |
| 13 | 单文件注入用错目标图 | 单文件模式 `node bin/gsts.mjs -c <config> <file.gia>` 以 `config.inject.nodeGraphId` 为目标 ID（批量模式才用 GIA 内 graph id）；注入前确认 config 的 `mapId`/`nodeGraphId` 与意图一致 |

生成与建图工具已正式放入技能脚本目录（可复用资产）：

```text
gsts assets:node-graphs create（正式命令，替代原 create-empty-node-graph.ts 脚本）
.agents/skills/editor-incremental-gia-investigator/scripts/generate-signal-demo-gia.ts
```

## 分层证据

```text
生产链路生成 → decode 回读断言 → 注入器识别（folder entry + append wrapper）
→ 游戏内图正常显示/运行（用户核验）
```

自动断言通过 ≠ 编辑器可导入/游戏行为正确；本链路的两层用户核验（注入后游戏运行、
GIA 编辑器导入）均已 PASS。

## 完整通路与注入后验证（2026-08-03 复合内信号 demo 闭环）

```text
生成 GIA（生产 irToGia + 真实注册数据）→ 用户编辑器导入（资产包）
→ gsts assets:node-graphs create 建空图（仅目标图不存在时）→ gsts 单文件注入
→ 回读验证 → 用户游戏内核验
```

注入后验证清单（每项独立证据，不能互相替代）：

1. `tools/list-gil-node-graphs.ts <map.gil>`：目标图存在、图名被替换为 GIA 图名、节点数符合；
   旧图未被误动。
2. `gsts assets:signals inspect --gil <map.gil>`：信号注册表逐项不变（注入不得破坏注册定义）。
3. 图内节点身份解码（nodeGraphMessage 回读）：send/monitor 节点 `genericId`=注册 ID、
   `kind`=SysGraph(22001)、`signalVersion`=注册值、信号名 ClientExec pin 存在。
4. 注入器 accessories 合并路径（源码确认）：CompositeDef 写入 root 10 field 2、impl 图写
   field 4，按 ID 合并去重（冲突保留 GIL 侧）；信号 accessories 按信号名重绑定目标 identity。
5. 用户游戏内：图正常显示（复合内部 send 不显空壳）+ 信号触发后监听消费生效。

方法论（用户长期实践）：**不轻信生产代码**——把真实编辑器的最小单变化快照（用户记录在
`genshin-ts-evidence/`）当作裁决依据，测试断言与生产输出冲突时先核对真实证据再决定改
测试还是改代码。本轮即修正了 3 处与真实证据冲突的旧断言（capture 物理 pin、monitor
OutParam 不落盘、列表 ParameterFlow 类型），生产代码零改动。

## 最小核验注入通道（2026-08-06 首跑闭环，verify-injection skill）

面向“已锁定规则的 Stage 3 生产编码行为核验”：不每次新建地图，复用按约定命名的专用验证地图
（当前实例 `1073741852`「InFlow核验」），每个核验分支一个 placeholder 节点图（`verify-<点>`），
最小 case 放 `verify/<分支>/<分支>.ts`，统一配置 `gsts.verify.config.ts`。

```text
写最小 case TS → gsts -c gsts.verify.config.ts --noinject 编译
→ decode-gia 断言目标 wire（connects 的 connect/connect2 index）
→ 确认 placeholder 图存在（assets:node-graphs --gil <map> --name verify-<点> --write）
→ config 临时加 inject（mapId/nodeGraphId）→ 单文件注入 .gia
→ list-gil-node-graphs + .gil 回读 wire → 用户游戏核验 → 登记 verified-cases.md
```

实测关键点（勿重踩）：

- config 平时不配 inject：只要 inject 存在，编译阶段就会解析目标 gil，
  `mapId=0` 时直接报 `target gil not found: 0.gil`；注入前再临时加 inject 段。
- 单文件注入以 `config.inject.nodeGraphId` 为目标，且自动把 GIA 内 graph id 改写为目标 id
  （`loadGiaGraph` setGraphId），因此 DSL `g.server({id})` 不必与 placeholder 图 id 一致；
  批量注入则按 GIA id 找目标（需 id 已存在于地图），默认不用。
- 新地图 `maps:create`：mapId = 现有最大 + 1，`--graphs` 的 placeholder id 从 1073741825 自增；
  已有地图加图用 `assets:node-graphs --gil ... --name ... --write`（先备份再写回）。
- 注入前自动备份目标 `.gil`；注入成功 ≠ 游戏核验通过，最终以用户游戏内结果为准。

首个已核验实例（inflow-index，见 `.agents/skills/verify-injection/references/verified-cases.md`）：
break_loop → finite_loop 的 `connect/connect2 = {kind: InFlow, index: 1}` 与真实编辑器 case3
证据同构，用户游戏核验通过。
