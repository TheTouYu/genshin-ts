# 注入器系统：.gia → .gil 注入

> 本文档描述 genshin-ts 的注入器系统——如何将编译产出的 .gia 二进制文件注入到原神的 .gil 关卡文件中。

---

## 1. 概述

**目标**：将 `.gia` 文件（节点图二进制）注入到 `.gil` 文件（游戏关卡文件）中，替换或新增目标节点图。

**位置**：`src/injector/`

**输入**：`.gil` 文件 + `.gia` 文件 + 目标节点图 ID

**输出**：修改后的 `.gil` 文件内容

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

## 8. 信号节点补丁：signal_nodes.ts

`patchSignalNodeIds` 修正 `.gia` 中信号节点的 ID，使其与 `.gil` 中的现有信号保持一致，避免信号不匹配。

---

## 9. 安全机制

注入器包含多项安全检查：

| 检查 | 触发条件 | 处理 |
|------|----------|------|
| 文件头校验 | headTag ≠ 0x0326 或 tailTag ≠ 0x0679 | 抛错终止 |
| 目标非空检查 | 目标节点图已有节点且名称非 _GSTS 前缀 | 抛错终止（除非 skipNonEmptyCheck） |
| 多匹配检查 | 找到 > 1 个匹配 targetId 的字段 | 抛错终止（防止损坏） |
| 目标 ID 检查 | targetId >= 1000000000 但路径结构不匹配 | 抛错终止 |
| protobuf 验证 | encode 后的 NodeGraph 无效 | 抛错终止 |
| 类型兼容检查 | 传入的图类型与目标位置不匹配 | 打印警告（非致命） |
