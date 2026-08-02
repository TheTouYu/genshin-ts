# 注入器系统：.gia → .gil 注入

> 状态：当前实现
> 来源：当前代码实现 + 真实地图验证
> 最近校验：2026-08-01
> 适用范围：gsts 当前注入流程；地图 ID 分配规律仅适用于已观察的真实地图样本

> 本文档描述 genshin-ts 的**节点图注入器**——如何将编译产出的 `.gia` 二进制文件注入到原神的 `.gil` 关卡文件中。
>
> **术语边界**：本文的“注入”专指 `.gia → NodeGraph → .gil` 的节点图替换，必须指定目标
> `nodeGraphId`。自定义变量的“资产写回/变量注入”则是直接定点修改 `.gil` 内玩家模板或
> CustomPrefab 的自定义变量资产字段：不生成 `.gia`、不替换 NodeGraph、也不需要 `nodeGraphId`。
> 两类操作共享“会修改游戏地图文件、必须显式目标与备份”的安全要求，但实现、备份记录与验收必须分别报告。
> 初始自定义变量的读取与资产写回实现、真实地图证据和已验证范围见
> [`gil-custom-variables.md`](gil-custom-variables.md)。

---

## 1. 概述

**目标**：将 `.gia` 文件（节点图二进制）注入到 `.gil` 文件（游戏关卡文件）中，替换或新增目标节点图。

**位置**：`src/injector/`

**输入**：`.gil` 文件 + `.gia` 文件 + 目标节点图 ID

**输出**：修改后的 `.gil` 文件内容

### 地图 ID 与节点图 ID

这两个 ID 必须分开记录：

- `mapId`：`Beyond_Local_Save_Level/<mapId>.gil` 的地图文件 ID。
- `nodeGraphId`：该地图内部要替换的 NodeGraph ID。

通过 `gsts maps -c <config>` 可以查看当前 `playerId` 对应的地图文件，并按修改时间标记 `[recent]`。本次真实新地图验证中，地图文件为 `1073741846.gil`，其第一个节点图 ID 为 `1073741825`。当前观察到的新地图通常从 `1073741825` 分配首个 NodeGraph，后续新建节点图递增；这是经验规律，不能替代对目标 `.gil` 的实际扫描。

物理运动等多文件批量编译会生成自己的 GIA graph ID。批量模式目前忽略 `config.inject.nodeGraphId`，按 GIA 内 graph ID 推断目标；如果目标地图的 NodeGraph ID 与 GIA graph ID 不同，应先生成 GIA，再用单文件注入路径，让配置中的 `nodeGraphId` 生效：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/<user>/AppData/LocalLow \\
  node bin/gsts.mjs -c gsts.physics-motion.config.ts \\
  dist/tests/layout/physics-motion/main.gia
```

此行为由 `src/cli/gsts.ts` 的批量注入与 `runSingle()` 路径决定。

---

## 2. 架构总览

```
                 ┌──────────────────────┐
                 │    .gil 文件          │
                 │  (二进制，含多个       │
                 │   protobuf 编码的      │
                 │   节点图/其他数据)      │
                 └────────┬─────────────┘
                          │
                          ▼
┌─────────────────────────────────────────┐
│  createInjector({ protoPath?, lang? })  │
│                                         │
│  1. loadGiaProto()       加载 protobuf │
│  2. injectBytes()        执行注入       │
│  3. injectFile()         文件级封装      │
└─────────────────────────────────────────┘
                          │
                          ▼
                 ┌──────────────────────┐
                 │  修改后的 .gil 文件    │
                 │  (目标节点图被替换)    │
                 └──────────────────────┘
```

---

## 3. 核心模块

### 3.1 index.ts — createInjector

`src/injector/index.ts` 是注入器的入口。

```typescript
function createInjector(options?: { protoPath?: string; lang?: string }): Injector
```

返回的 `Injector` 对象包含两个方法：

- `injectBytes(input: InjectGilInput): InjectGilResult` — 字节级的注入操作
- `injectFile(options: InjectGilFileOptions): InjectGilFileResult` — 文件级的封装

### 3.2 注入流程 (injectBytes)

```typescript
function injectBytes(input: InjectGilInput): InjectGilResult {
  // 1. 从 .gia 字节流解析出节点图对象（protobuf decode）
  const newGraph = loadGiaGraph(giaBytes, rootMessage, nodeGraphMessage, targetId)

  // 2. 确定目标 ID（从参数或 GIA 自身推断）
  const targetId = input.targetId ?? getGraphId(newGraph)

  // 3. 验证 .gil 文件头
  //   → headTag === 0x0326, tailTag === 0x0679

  // 4. 从 .gil 原始字节中解析 protobuf 字段
  //   → 遍历所有字段，收集 LenField 信息
  //   → 特别识别 NodeGraph blob 字段（depth=3, p0=10, p1=1, p2=1）

  // 5. 查找目标节点图位置
  const matches = findNodeGraphTargets(payload, fields, nodeGraphMessage, targetId)

  // 6. 应用信号补丁（修正信号节点 ID）
  patchSignalNodeIds(newGraph, gilBytes, context)

  // 7. 安全检查
  //   → 目标已存在节点? 需要 _GSTS 前缀
  //   → 多个匹配? 中止防止损坏

  // 8. 更新节点图名称、ID、类型
  setGraphId(newGraph, targetId)
  setGraphType(newGraph, graphType)

  // 9. protobuf encode → 替换 .gil 中的原节点图字节
  const newGraphBytes = nodeGraphMessage.encode(newGraph).finish()
  const newPayload = applyReplacement(payload, fields, target.field, newGraphBytes)
  const newFile = buildFile(newPayload, { schema, headTag, fileType, tailTag })

  return { bytes: newFile, mode: 'replace' }
}
```

### 3.3 文件级注入

```typescript
function injectFile(options: InjectGilFileOptions): InjectGilFileResult {
  // 1. 读取 .gil 和 .gia 文件
  // 2. 调用 injectBytes
  // 3. 写回（默认覆盖原 .gil，可通过 outPath 指定新路径）
  // 4. 自动创建输出目录
}
```

---

### 3.4 向特定 NodeGraph 增加节点：相邻快照与整图替换

> 来源分层：当前 injector 实现 + 真实编辑器相邻 GIL 快照 + 临时副本自动回读；尚未把本轮临时重放称为真实地图写回或游戏行为验证。

注入器不在 `.gil` 内原地追加单个 GraphNode。安全且可验证的增量方法是：

```text
知识树/Authority 已有规则先复用
→ 用户在编辑器创建名称以 _GSTS 开头的专用空图
→ 每轮只做一个编辑器变化并保存相邻 GIL 快照
→ 比较同一 nodeGraphId 的节点和图级字段
→ 在前一快照的 NodeGraph 上手工同构重放该增量
→ 包装为完整 GIA
→ 用 injectBytes() 替换临时 GIL 副本中的整个 NodeGraph
→ 回读目标图并与后一真实快照比较
→ 真实写回前另行展示目标、哈希、命令和回滚并取得确认
```

相邻快照比较使用只读工具：

```bash
npx tsx tools/compare-gil-node-graph.ts \
  <before.gil> <after.gil> <nodeGraphId>

# 仅在需要检查完整 pin/value/connects 时展开节点；列表节点可能很大
npx tsx tools/compare-gil-node-graph.ts \
  <before.gil> <after.gil> <nodeGraphId> --full
```

默认输出文件 SHA-256、图元数据是否变化、节点数以及 added/removed/changed 节点的 identity 与 pin 数，避免 Assembly List 的 100 个输入槽淹没关键信息。`--full` 输出完整节点只是语义解码证据；涉及默认值与 wire presence 时仍需 raw-wire 或 round-trip 断言。

2026-08-01 的最小真实增量在地图 `1073741849` 的专用图 `1073741840` 上完成：空图 → 未绑定 send placeholder → 绑定 `gsts_type_probe_vec3_list` → 连接 `[(1,2,3)]` 的 Assembly List<Vector>。从绑定未赋参快照手工重放最后一步后，现有 injector 对临时 GIL 副本执行 `mode=replace`，回读目标 NodeGraph 与编辑器后一快照的 protobuf 编码逐字节一致。该结果证明“相邻增量可通过整图替换同构重放”，不证明尚未执行的真实地图写回或游戏行为。

调查未知节点或修 bug 时必须保持单变化；不得用正处于待修状态的编译/降低链来证明编辑器规则，也不得一次混入多个节点族。生产修复必须在规则侧同构重放闭合后，以 focused red/green regression 进入。

---

## 4. protobuf 处理：proto.ts

`src/injector/proto.ts` 负责加载和处理 GIA 的 protobuf schema。

```typescript
function loadGiaProto(protoPath?: string): GiaProto {
  // 1. 使用 protobufjs 加载 .proto 文件
  // 2. 缓存结果（避免重复加载）
  // 3. 返回 Root 和 NodeGraph 消息类型
}

// 默认 proto 文件位置：
// src/thirdparty/.../protobuf/gia.proto
```

默认 proto 路径指向 `thirdparty` 目录下的 vendor protobuf 定义，位于：
`src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto.ts`

---

## 5. 二进制解析：binary.ts

`src/injector/binary.ts` 包含底层的二进制操作工具。

### 5.1 Varint 编码

```typescript
readVarint(buf, offset)    → { value, next }  // 读取变长整数
encodeVarint(value)        → Uint8Array       // 写入变长整数
```

varint 是 protobuf 的变长整数编码格式（Base 128 Varint），每个字节用 7 位存数据、1 位标记是否还有后续字节。

### 5.2 字段解析

```typescript
parseMessage(buf, offset, ...) → LenField[]
  // 遍历 protobuf 消息的所有字段
  // 识别字段号 (field number) 和 wire type
  // 对 wire type 2（长度前缀），记录 LenField { offset, len, ... }

readFieldBytes(buf, targetField) → Uint8Array | undefined
  // 提取指定字段号对应的原始字节块

decodeUtf8(buf, start, end) → string
  // UTF-8 解码
```

### 5.3 文件构建

```typescript
buildFile(payload, { schema, headTag, fileType, tailTag }) → Uint8Array
  // 在 protobuf 载荷前后加上 20 字节头 + 4 字节尾
  // 文件结构：
  //   [4B leftSize][4B schema][4B headTag=0x0326][4B fileType][4B protoSize]
  //   [protobuf payload]
  //   [4B tailTag=0x0679]
```

---

## 6. 节点图扫描：node_graph.ts

`src/injector/node_graph.ts` 负责在 .gil 文件中定位目标节点图。

```typescript
function loadGiaGraph(giaBytes, rootMessage, nodeGraphMessage, targetId) {
  // 从 .gia 字节中解码完整的 Root 消息
  // 然后提取内部的 NodeGraph 消息
  // 如果 targetId 存在, 做 ID 匹配验证
}

function findNodeGraphTargets(payload, fields, nodeGraphMessage, targetId) {
  // 遍历所有 NodeGraph blob 字段
  // 尝试解码并读取其 ID
  // 返回所有匹配 targetId 的字段
  // → matches.length === 1 才安全
}

function getGraphId(graph): number
function setGraphId(graph, id): void
function setGraphType(graph, type): void
function extractGraphType(graph): number | undefined
function buildGraphTypeMap(payload, fields, nodeGraphMessage): Map<number, number>
```

### 快速 ID 扫描

`tryReadNodeGraphIdAndType(bytes)` 使用**快速扫描策略**——不完整解码整个 protobuf，只扫描 NodeGraph 消息的前几个字段来提取 ID：

```typescript
// NodeGraph 的限制 protobuf 结构:
// field 1 (Id message), wire type 2 → key varint == 10
// 在 Id 消息内部:
//   field 2 (type) → 可选
//   field 5 (id)   → 目标 ID
// 读到 id 后立即停止扫描
```

---

## 7. 文件夹索引：folder.ts

`src/injector/folder.ts` 处理 .gil 文件中的文件夹索引系统。

```typescript
function collectFolderIndexes(payload, fields) {
  // 从 .gil 中提取文件夹条目
  // 每个条目包含: id, typeValue, name 等
}

function findFolderEntryField(payload, fields, targetId) {
  // 在文件夹索引中查找目标 ID 对应的条目
  // 返回条目所在的 LenField（用于后续修改）
}

function resolveGraphTypeForTypeValue(typeValue, folderIndexes, idToType) {
  // 根据 typeValue 和图类型映射确定节点图类型
  // entity(20000) / status(20003) / class(20004) / item(20005)
}
```

---

## 8. 信号注册与节点补丁：gil_signals.ts / signal_nodes.ts

> 状态：当前实现；方案 A 已由目标地图用户游戏验证（2026-07-16）

当前信号链路采用“目标地图已注册信号”方案：

```text
目标 .gil
  ├─ gil_signals.ts：提取名称、参数 schema、send/monitor/server ID
  ├─ 编译器 SignalRegistry：校验并编码真实 SignalDef identity
  └─ signal_nodes.ts：注入阶段按信号名修补占位节点 ID
```

统一注册项包含：

```ts
{
  ;(name, params, sendId, monitorId, serverId)
}
```

`patchSignalNodeIds` 仍负责将 GIA 中的占位节点：

```text
300000 → 目标 .gil 的 sendId
300001 → 目标 .gil 的 monitorId
```

GIA 编码阶段也使用同一 registry，而不是生成固定 ID、哈希 ID 或 `+6` 推导 ID。
未注册信号和参数 schema 不一致会在编码阶段失败；注入阶段还会用目标 `.gil` 的规范注册项再次校验名称、send/monitor/server identity、参数数量和参数类型，任一失败都 fail closed。ClientExec 字符串不是新信号注册机制。

普通 NodeGraph GIA 的 signal definition accessories 在编辑器导入时可以注册新信号；用户已确认同一 `cube_turn(face:str,direction:str)` GIA 可跨地图导入。直接写 GIL 时，injector 不把这些 accessories 合并进目标注册表，注册仍由 `assets:signals register/update` 显式完成。生产编码通过 `readRegisteredSignalsFromGil()` 读取完整注册布局并保留三份原始 `CompositeDef` bytes；跨地图注入时，injector 从 GIA accessories 识别源 send/monitor/server kind，再按信号名重绑定目标地图 identity，同时校验发送参数数量和类型。非信号 CompositeDef/impl graph accessories继续按 ID 合并。

`assets:signals register --template-gil <donor.gil>` 可从独立 donor 取得参数布局。同一类型可重复出现，但第 N 次出现必须消费 donor 中第 N 套真实 parameter entry/send/monitor/server definition 布局；模板不足时 fail closed，不按参数序号生成 pinIndex。当前真实验证覆盖两个 `str` 参数。

新地图首图可能已经存在 folder index 占位但没有 NodeGraph blob。当前 injector 仅对 `targetId=1073741825`、folder `typeValue=7000`、incoming graph `type=20000` 的组合补入服务器首图；其他缺失 NodeGraph ID、无 folder 占位和客户端图继续拒绝。地图 `1073741848` 的跨地图 signal 注册、identity 重绑定、首图创建、严格回读和用户游戏测试已于 2026-08-02 通过。

证据：目标地图 `1073741848.gil` 的 9+9 双信号候选
`P5W10-two-signal-param-matrix-registered.gia` 已由用户在游戏编辑器/游戏内测试通过。
该结论只覆盖目标地图已有注册信号，不覆盖凭空创建新信号。

---

## 9. 安全机制

注入器包含多项安全检查：

| 检查          | 触发条件                                | 处理                               |
| ------------- | --------------------------------------- | ---------------------------------- |
| 文件头校验    | headTag ≠ 0x0326 或 tailTag ≠ 0x0679    | 抛错终止                           |
| 目标非空检查  | 目标节点图已有节点且名称非 \_GSTS 前缀  | 抛错终止（除非 skipNonEmptyCheck） |
| 多匹配检查    | 找到 > 1 个匹配 targetId 的字段         | 抛错终止（防止损坏）               |
| 目标 ID 检查  | targetId >= 1000000000 但路径结构不匹配 | 抛错终止                           |
| protobuf 验证 | encode 后的 NodeGraph 无效              | 抛错终止                           |
| 类型兼容检查  | 传入的图类型与目标位置不匹配            | 打印警告（非致命）                 |
