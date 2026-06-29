# 类型定义系统

> 本文档描述 genshin-ts 的类型定义系统——节点类型、事件、枚举等游戏概念的 TypeScript 类型定义，及其与上游 vendor 数据的关系。

---

## 1. 概述

**位置**：`src/definitions/` + `src/thirdparty/`

**用途**：将原神·千星奇域节点编辑器的底层数据（节点类型、事件、枚举、函数签章等）映射为 TypeScript 类型，提供完整的类型提示（intellisense）和编译期校验。

---

## 2. 定义结构

```
src/definitions/
├── nodes.ts          — 服务器 F 方法全量类型定义
├── events.ts         — 事件名称、元数据、payload 类型
├── events-payload.ts — 事件 payload 类型定义
├── events-payload-mode.ts — 模式特定的事件 payload
├── enums.ts          — 枚举类型定义（TS 侧）
├── node_modes.ts     — 节点模式映射（F 方法 → 节点类型）
├── entity_helpers.ts — 实体子类型辅助
├── prefabs.ts        — 预制件/资源 ID 定义
├── zh_aliases.ts     — 中英文别名映射
└── server_on_overloads.d.ts — g.server().on() 重载类型

src/thirdparty/.../
├── gia_gen/          — GIA 代码生成工具
├── node_data/        — 从上游 vendor 提取的节点/枚举/引脚数据
└── protobuf/         — GIA protobuf schema
```

---

## 3. 节点类型定义：nodes.ts

`src/definitions/nodes.ts` 定义了**所有可用的服务器 F 方法**——即通过 `f.methodName()` 调用的节点图函数。

### 3.1 定义模式

每个 F 方法包含：

```typescript
export const ServerExecutionFlowFunctions = {
  // 方法名: {
  //   label: 中文/英文显示名,
  //   parameters: [参数类型, ...],
  //   return: 返回值类型,
  //   nodeType: GIA 节点类型名
  // }
  addition: {
    label: '加法',
    parameters: ['int', 'int'],
    return: 'int',
    nodeType: 'addition'
  },
  log: {
    label: '打印',
    parameters: ['str'],
    return: 'void',
    nodeType: 'print'
  },
  // ... 数百个方法
}
```

### 3.2 方法分类

F 方法粗略分为以下几类：

| 类别 | 示例 | 说明 |
|------|------|------|
| 算术运算 | `add`, `subtract`, `multiply`, `divide` | 数学运算 |
| 比较运算 | `equal`, `greaterThan`, `lessThan` | 布尔比较 |
| 逻辑运算 | `logicalAnd`, `logicalOr`, `logicalNot` | 布尔逻辑 |
| 列表操作 | `getListLength`, `addElementToList`, `concatenateList` | 数组/列表操作 |
| 字典操作 | `createDictionary`, `addDictionaryElement` | 字典/Map 操作 |
| 游戏操作 | `createEntity`, `applyForce`, `heal`, `damage` | 游戏实体操作 |
| 控制流 | `doubleBranch`, `multipleBranches`, `forLoop` | if/switch/循环 |
| 变量操作 | `setLocalVariable`, `getLocalVariable` | 节点图变量 |
| 工具函数 | `log`, `randomFloat`, `wait` | 辅助/调试 |
| 信号 | `sendSignal`, `monitorSignal` | 自定义信号 |

### 3.3 重载支持

`server_on_overloads.d.ts` 利用 TypeScript 的条件类型和函数重载，让 `f.methodName()` 的调用签名与节点定义精确匹配：

```typescript
// 简化的重载机制
f.addition(a: IntValue, b: IntValue): IntValue
f.log(x: StrValue): void
// ...
```

---

## 4. 事件系统：events.ts

`src/definitions/events.ts` 定义了所有可用的事件类型。

### 4.1 事件元数据

```typescript
const ServerEventMetadata = {
  timeScaleChange: {
    id: "time_scale_change",
    label: "时间刻度变化",
    payload: ["oldScale", "newScale"],
    mode: 'beyond'
  },
  playerLogin: {
    id: "player_login",
    label: "玩家登录",
    payload: ["player"],
    mode: 'both'
  },
  // ... 数百个事件
}

// 事件名为类型（字符串字面量联合）
type ServerEventName = 'timeScaleChange' | 'playerLogin' | ...
```

### 4.2 事件 Payload

每个事件的 `evt` 参数的结构在 `events-payload.ts` 和 `events-payload-mode.ts` 中定义：

```typescript
// g.server({}).on('playerLogin', (evt, f) => { ... })
// evt 的类型：
type PlayerLoginPayload = {
  player: EntityValue
  loginTime: IntValue
  // ...
}

// 根据图模式（beyond/classic）的不同，payload 可能不同
type ServerEventPayloadsByMode = {
  beyond: { ... },
  classic: { ... }
}
```

---

## 5. 枚举系统：enums.ts

`src/definitions/enum.ts` 定义枚举类型（用于节点图中的下拉选择参数）。

```typescript
// TS 侧的枚举定义
export enum ComparisonOperator {
  EqualTo = 'equal_to',
  LessThan = 'less_than',
  GreaterThan = 'greater_than',
  // ...
}

// 对应的 GIA vendor 枚举 ID 映射
// 在 mappings.ts 中映射为 { enumId, enumValue } 数字对
```

枚举值在阶段三的 pins.ts 中被解析为 vendor 枚举 ID：

```typescript
function setEnumArgValue(giaNode, pinIndex, argIndex, nodeType, value) {
  const { enumId, enumValue } = parseEnumValue(value)
  // 设置 GIA 节点的枚举值
}
```

---

## 6. 类型别名与国际化：zh_aliases.ts

`src/definitions/zh_aliases.ts` 提供中英文名称的相互映射：

```typescript
const SERVER_EVENT_ZH_TO_EN: Record<string, string> = {
  '时间刻度变化': 'timeScaleChange',
  '玩家登录': 'playerLogin',
  // ...
}

const SERVER_F_ZH_TO_EN: Record<string, string> = {
  '加法': 'addition',
  '减法': 'subtraction',
  // ...
}
```

这使得用户可以在 TS 代码中或错误提示中使用中文名，编译器自动映射到英文 identifier。

---

## 7. 实体类型辅助：entity_helpers.ts

`src/definitions/entity_helpers.ts` 定义实体（Entity）的子类型：

```typescript
type CharacterEntity = EntityValue & { __entityType: 'character' }
type PlayerEntity = EntityValue & { __entityType: 'player' }
type MonsterEntity = EntityValue & { __entityType: 'monster' }
type ObjectEntity = EntityValue & { __entityType: 'object' }
type StageEntity = EntityValue & { __entityType: 'stage' }
type CreationEntity = EntityValue & { __entityType: 'creation' }
// ...
```

这些 phantom type 让 `f.method()` 的类型签章可以精确到实体子类型。

---

## 8. 节点模式映射：node_modes.ts

`src/definitions/node_modes.ts` 将 F 方法名映射到 GIA 节点类型字符串：

```typescript
const NODE_TYPE_BY_METHOD: Record<string, string> = {
  addition: 'addition',
  subtraction: 'subtraction',
  doubleBranch: 'double_branch',
  // ...
}
```

这个映射在阶段一变换 `expr.ts` 中使用，将 TypeScript 操作符/方法调用转换为准确的 GIA 节点类型名。

---

## 9. 预制件 ID：prefabs.ts

`src/definitions/prefabs.ts` 定义游戏预制件和资源 ID：

```typescript
// 示例
export const PREFABS = {
  commonChest: 12345,
  luxuryChest: 12346,
  // ...
}
```

这些 ID 在编译时直接转换为数字字面量。

---

## 10. 第三方定义：thirdparty 目录

### 10.1 vendored 数据

`src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/` 包含从上游 Node Editor 工具提取的数据：

```
node_data/
├── node_pin_records.ts   — 每个 GIA 节点的引脚定义（类型、索引、名称）
├── node_id.ts            — 节点名称 → 数字 ID 映射
├── enum_id.ts            — 枚举类型名 → 数字 ID 映射
├── concrete_map.ts       — 具体类型映射
├── types_list.ts         — 类型列表
├── helpers.ts            — 辅助工具
└── index.ts              — 导出聚合

gia_gen/
├── index.ts              — 代码生成入口
├── graph.ts              — Graph 类（GIA 图构建）
├── nodes.ts              — Node 类 + NodeType 类型
├── basic.ts              — 基础类型工具
├── extract.ts            — 从 vendor 数据提取类型信息
└── utils.ts              — 工具函数

protobuf/
├── gia.proto.ts          — GIA protobuf schema (ts 定义)
└── decode.ts             — GIA 二进制解码
```

### 10.2 GIA 代码生成

`gia_gen/` 提供了阶段三中使用的 `Graph` 和 `Node` 类：

```typescript
// Graph 类负责整个节点图的构建和编码
class Graph<Mode> {
  add_node(node): void
  flow(from, to, fromIndex, toIndex): void   // 执行流连线
  connect(from, to, fromIndex, toIndex): void // 数据流连线
  add_graph_var(name, type, isConst, value)   // 添加图变量
  encode(): Root                              // 编码为 GIA Root
}

// Node 类表示单一节点
class Node<Mode> {
  constructor(id, mode, nodeId)
  setPos(x, y): void          // 设置位置
  setVal(pinIndex, value): void // 设置字面量值
  pins: Pin[]                 // 引脚列表
  ConcreteId: number          // vendor 节点 ID
  NodeIndex: number           // 图内节点索引
}

// NodeType 表示 GIA 值类型
type NodeType = 
  | { t: 'b', b: 'Bol'|'Int'|'Flt'|'Str'|'Vec'|'Gid'|'Ety'|'Pfb'|'Cfg'|'Fct' }
  | { t: 'l', i: NodeType }    // 列表
  | { t: 'd', k: NodeType, v: NodeType }  // 字典
```

这些类是阶段三序列化前的**内建表示层**——IR JSON → Graph/Node 对象 → protobuf 二进制。

---

## 11. 定义生成流程

```bash
npm run gen     # 运行 scripts/generate-definitions.ts
```

`generate-definitions.ts` 从 vendor 数据源重新生成 `nodes.ts`、`events.ts`、`enums.ts` 等定义文件。生成后自动运行 Prettier 格式化。

生成的数据来源：
1. Vendor 节点编辑器数据包中的节点/事件/枚举定义
2. 从游戏数据中提取的实体子类型和预制件 ID

这确保了定义与游戏版本保持同步。
