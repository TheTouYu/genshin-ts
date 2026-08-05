# 节点图逻辑模块：新建节点图与 GIA 生成链路

只在任务涉及“给 GIL 生成新节点图”“用生产 irToGia 生成 GIA 资产”“GIA 字节对比/可复现性”
时加载本模块。通用快照、安全确认和证据层级仍由主 `SKILL.md` 负责；信号注册/发送/监听
调查加载 `node-graph-logic/signals.md`。

## 最小恢复字段

```text
目标 GIL（新地图）是否已有节点图（tools/list-gil-node-graphs.ts）
注入目标 nodeGraphId
信号注册数据来源（readRegisteredSignalsFromGil）
参照 GIA 及其生成脚本（.local/tmp/generate-signal-layout-fixed.ts，未迁移仅作参照）
```

领域 Authority：`docs/game-engine-knowledge/gil-structure-semantics.md`（NodeGraph 路径 /
自由新建）、`docs/game-engine-knowledge/gia-generation-chain.md`（链路与坑位唯一入口）。

## GIL header 长度字段（注入必须同步，勿当 bug 排查）

`CONFIRMED`（v0-v8 快照逐轮验证 + 游戏报“文件损坏”实测）：GIL header 20B 含两个大端
uint32 长度字段，编辑器每次保存都会更新，游戏加载时校验：

```text
hdr[0:4]  = 文件总长 - 4
hdr[16:20] = payload 长度 = 文件总长 - 24
```

任何直接改 payload 的注入/回写都必须同步这两个字段，否则游戏报文件损坏
（2026-08-05 实测踩坑：只改 payload 未改 header → 游戏拒绝加载）。
自检：`struct.unpack('>I', d[0:4])[0] == len(d)-4` 且 `[16:20] == len(d)-24`。

## 批量注入服务器节点定义（create-graphs.py，2026-08-05 已闭环）

工具：`scripts/create-graphs.py`（可复用；新增图/追加节点/分批/网格布局一体）：

```text
python scripts/create-graphs.py <map.gil> --defs <data.json> \
    --all-server --graph-id <已有图ID> --batch-size 50 --cols 5 --dx 440 --dy 360 \
    --locked-hash <当前sha256> [--dry-run]
```

- `--all-server`：枚举 data.json 全部 System=Server 节点（ID 升序），自动分批
- `--graph-id` 指向已有图：第一批自动排除图中已有节点 ID 并补齐；后续每批新建图
  （`--name-prefix` 自动编号，跳过重名）；不指定则全部新建图
- 每批一个图，网格坐标 `(x0 + (i%cols)*dx, y0 + (i//cols)*dy)`，nodeIndex 1..N 连续
- 新图 wire 配方 = 编辑器原生（v1 快照）：root 10 图记录双层包装
  `field1 -> field1 -> NodeGraph{Id, name, nodes[*]}`；节点 42B 同构
- folder 条目：root 6（f1=4 记录）的 **f2.f4（“调试”文件夹）** 末尾追加
  `f5={1:800, 2:图ID}`（1073741849 地图实测；gsts 工具找 f3“未分类页签”容器，
  是 1073741850 新图结构——不同地图 folder 容器不同，以真实 diff 为准）
- 图 ID：递归扫描全部 Id.f5（1073741xxx）取 max+1；空洞 ID 与编辑器内存池规则未闭合
- 自动备份（首批）+ `--locked-hash` 前置校验；多批模式批内哈希自动传递
- 回验链：`list-gil-node-graphs`（图数/节点数）→ `inspect-graph-nodes.py`（身份/坐标）
  → root 字段差分（应仅 6/10 变化）→ header 长度自检
- 已覆盖 434/434 全部 Server 节点（含 Variant 58 + Hidden 13），用户游戏核验通过

**注入前必须确认游戏/编辑器已关闭**（2026-08-05 实测踩坑）：编辑器内存不感知磁盘
变化，打开期间外部注入后点保存会用旧内存状态覆盖注入结果。注入后再让用户重新打开。

## 新建空 NodeGraph（已闭合，勿重做）

编辑器原生空图 wire 结构（生成工具 `gsts assets:node-graphs create`，已在
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
- **目标图 ID 不存在但地图已有其他图**：同样报 `[error] target NodeGraph not found: <id>`，
  先 `gsts assets:node-graphs create --graph-id <id> --output <candidate>` 预览 → `--write` 写回
  （自动备份 + 源 SHA 检查）→ 再注入。示例：`gsts-signal-composite-demo` 注入前为
  `1073741850.gil` 建空图 `1073741826`。
- root 46 的等长变化语义 INSUFFICIENT，不模拟。

## GIA 生成链路（生产代码）

```text
readRegisteredSignalsFromGil → createSignalRegistry → buildServerGraphRegistriesIRDocuments
→ irToGia(docs[0], {graphId, name, protoPath, signalRegistry}) → Beyond_Local_Export/ 根目录
→ decode_gia_file(<路径>) 断言（graph.id / filePath / gameVersion / send+monitor 节点）
```

参考脚本：`.local/tmp/generate-signal-layout-fixed.ts`（参照 GIA，未迁移）、
`.agents/skills/editor-incremental-gia-investigator/scripts/generate-signal-demo-gia.ts`（业务图）。生成脚本必须“已存在则断言逐字节
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

## 完整通路（生成 → 导入 → 注入 → 验证，2026-08-03 已闭环）

```text
生成 GIA（生产 irToGia + readRegisteredSignalsFromGil 真实注册数据）
→ 用户编辑器导入（资产包导入验证）
→ gsts assets:node-graphs create 建空图（仅目标图不存在时）
→ gsts 单文件注入（config.inject.nodeGraphId 为目标；多 WSL 用户需 GSTS_LOCALLOW_DIR）
→ 回读验证 → 用户游戏内核验
```

注入后验证清单（独立证据，逐项分开报告）：

1. `tools/list-gil-node-graphs.ts`：目标图存在、图名被替换、节点数符合、旧图未动；
2. `gsts assets:signals inspect`：信号注册表逐项不变；
3. 图内节点身份回读（nodeGraphMessage）：send/monitor genericId=注册 ID、kind=SysGraph、
   signalVersion、信号名 pin；
4. 用户游戏内：图显示正常（复合内部 send 不显空壳）+ 信号触发消费生效。

真实注入配置模板：`gsts.signal-demo.config.ts`（gameRegion/playerId/mapId/nodeGraphId）。
更多坑位（GSTS_LOCALLOW_DIR、target not found、单文件 vs 批量目标 ID 语义）与分层证据见
`docs/game-engine-knowledge/gia-generation-chain.md`。

方法论（用户长期实践）：**不轻信生产代码**——把真实编辑器的最小单变化快照
（`genshin-ts-evidence/`）当作裁决依据；测试断言与生产输出冲突时，先核对真实证据
再决定改测试还是改代码（本轮修正 3 处旧断言、生产零改动即是一例）。
