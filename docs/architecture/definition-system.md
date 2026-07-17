# 类型定义系统

> 本文档描述 genshin-ts 的类型定义系统——节点类型、事件、枚举等游戏概念的 TypeScript 类型定义，及其与上游 vendor 数据的关系。

---

## 1. 概述

**位置**：`src/definitions/` + `src/thirdparty/`

**用途**：将原神·千星奇域节点编辑器的底层数据（节点类型、事件、枚举、函数签章等）映射为 TypeScript 类型，提供完整的类型提示（intellisense）和编译期校验。

> 客户端节点当前尚未形成可工作的生产编译路径。其来源分层、两个真实 6.7 client skill GIA
> 的 WP0 基线和分批开放策略见 [`client-node-support-plan.md`](client-node-support-plan.md)。
> 该计划不能作为当前已支持 API 清单。

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

## 3. 数据类型总览

> 普通节点（`addition`、`print`、`equal` 等 GIA 节点）的引脚数据类型跨越 5 层。
> 本文档以 **IR 层** 为枢纽，向上连接 DSL/运行时，向下连接 GIA Proto/Vendor 层。

### 3.1 层结构

```
DSL / 运行时层                  server_globals.d.ts / value.ts
    │  RuntimeValueTypeMap / RuntimeParameterValueTypeMap
    ▼
IR 层                           IR.d.ts
    │  ValueType (= keyof ValueTypeMap)
    ▼
IR→GIA 转换层                   composite.ts / pins.ts
    │  typeClassFromValueType / typeIdFromValueType / toVendorBaseTag
    ▼
Vendor NodeType 层              gia_gen/nodes.ts
    │  NodeType 判别联合体
    ▼
GIA Proto 层                    gia.proto
       VarType 枚举 / VarBase.Class 枚举 / VarBase.baseValues oneof
```

### 3.2 GIA Proto 层 — VarType 枚举

**位置**: `src/thirdparty/.../protobuf/gia.proto:181-209`

| VarType 字段名 | 值 | DSL 类型 |
|:--------------|:--:|:--------|
| `UnknownVar` | 0 | — |
| `Entity` | 1 | `entity` |
| `GUID` | 2 | `guid` |
| `Integer` | 3 | `int` |
| `Boolean` | 4 | `bool` |
| `Float` | 5 | `float` |
| `String` | 6 | `str` |
| `GUIDList` | 7 | `guid_list` |
| `IntegerList` | 8 | `int_list` |
| `BooleanList` | 9 | `bool_list` |
| `FloatList` | 10 | `float_list` |
| `StringList` | 11 | `str_list` |
| `Vector` | 12 | `vec3` |
| `EntityList` | 13 | `entity_list` |
| `EnumItem` | 14 | `enum` / `enumeration` |
| `VectorList` | 15 | `vec3_list` |
| `LocalVariable` | 16 | `local_variable` |
| `Faction` | 17 | `faction` |
| `Configuration` | 20 | `config_id` |
| `Prefab` | 21 | `prefab_id` |
| `ConfigurationList` | 22 | `config_id_list` |
| `PrefabList` | 23 | `prefab_id_list` |
| `FactionList` | 24 | `faction_list` |
| `Struct` | 25 | `struct` |
| `StructList` | 26 | `struct_list` |
| `Dictionary` | 27 | `dict` |
| `VariableSnapshot` | 28 | `custom_variable_snapshot` |

共 **27 种 VarType**（不含 UnknownVar 为 26 种可用类型）。
注意枚举值不连续：3→4→5→6→7→8→9→10→11→12→13→14→15→16→17→20→… (18/19 未使用)。

### 3.3 GIA Proto 层 — VarBase.Class 与 baseValues

**位置**: `gia.proto:233-247` (Class), `271-282` (baseValues oneof)

VarBase 是 GIA 中值的底层容器。每个 VarBase 按 `class` 分类，通过 `oneof baseValues` 承载具体值。

| Class 字段名 | 值 | oneof 字段名 | 消息类型 | 对应 IR 类型 |
|:------------|:--:|:-----------:|:--------|:-----------|
| `IdBase` | 1 | `bId` | `IdBaseValue { int32 val }` | `entity`, `guid`, `faction`, `prefab_id`, `config_id` |
| `IntBase` | 2 | `bInt` | `IntBaseValue { int32 val }` | `int` |
| `FloatBase` | 4 | `bFloat` | `FloatBaseValue { float val }` | `float` |
| `StringBase` | 5 | `bString` | `StringBaseValue { string val }` | `str` |
| `EnumBase` | 6 | `bEnum` | `EnumBaseValue { int32 val }` | `bool`, `enum`, `enumeration` |
| `VectorBase` | 7 | `bVector` | `VectorBaseValue { Vec { x,y,z } }` | `vec3` |
| `ConcreteBase` | 10000 | `bConcreteValue` | `ConcreteBaseValue { indexOfConcrete, value }` | 包裹层（用于运算节点） |
| `StructBase` | 10001 | `bStruct` | `StructBaseValue { repeated VarBase items }` | `struct` |
| `ArrayBase` | 10002 | `bArray` | `ArrayBaseValue { repeated VarBase entries }` | `*_list` |
| `MapBase` | 10003 | `bMap` | `MapBaseValue { repeated VarBase mapPairs }` | `dict` |

> **关键约束**：`FloatBase=4`（非 3），`EnumBase=6`（非 3）。枚举值不连续。写错 protobuf 字段名（如 `bBool` 而非 `bEnum`）会被静默忽略。

**当前 `makeVarBaseValue` 覆盖状态**（`src/compiler/ir_to_gia_transform/composite.ts`）：
| 已覆盖 ✅ | 未覆盖 ❌ |
|:---------|:---------|
| IdBase(1), IntBase(2), FloatBase(4), StringBase(5), EnumBase(6), VectorBase(7) | ConcreteBase(10000), StructBase(10001), ArrayBase(10002), MapBase(10003) |

### 3.4 Vendor NodeType 层

**位置**: `src/thirdparty/.../gia_gen/nodes.ts:1-50`

Vendor 层的类型表示是一个判别联合体：

```typescript
type NodeType =
  | { t: 'b', b: BasicTypes }       // 基本标量 — 10 种
  | { t: 'e', e: EnumId }           // 枚举 — 如 LocalVariable(1016), VariableSnapshot(1028)
  | { t: 'l', i: NodeType }         // 列表 — 如 L<Int>, L<Vec>
  | { t: 's', f: [string, NodeType][] }  // 结构体 — 如 S<{字段列表}>
  | { t: 'd', k: NodeType, v: NodeType } // 字典 — 如 D<Ety,Ety>
  | { t: 'r', r: string }           // 反射类型 — 运行时决定
```

**BasicTypes**（`'b'` 分支的 10 种基元）：

| BaseTag | 含义 | 对应 IR 类型 | 对应 VarType |
|:-------:|:----|:-----------|:----------:|
| `Int` | 整数 | `int` | Integer(3) |
| `Flt` | 浮点数 | `float` | Float(5) |
| `Bol` | 布尔 | `bool` | Boolean(4) |
| `Str` | 字符串 | `str` | String(6) |
| `Vec` | 三维向量 | `vec3` | Vector(12) |
| `Gid` | GUID | `guid` | GUID(2) |
| `Ety` | 实体 | `entity` | Entity(1) |
| `Pfb` | 预制件 ID | `prefab_id` | Prefab(21) |
| `Fct` | 阵营 | `faction` | Faction(17) |
| `Cfg` | 配置 ID | `config_id` | Configuration(20) |

### 3.5 IR 层 — ValueType

**位置**: `src/runtime/IR.d.ts:150-230`

```typescript
type ValueType = keyof ValueTypeMap  // union of ~22 type strings
```

层次化类型构造（`ValueTypeMap` 的分层合并）：

```
BaseValueTypeMap             { bool, int, float, str, vec3 }                   ← 5 基础标量
AdvancedValueTypeMap         { guid, entity, prefab_id, config_id, faction }  ← 5 高级 ID 类型
StructValueTypeMap           { struct }                                       ← 1
DictValueTypeMap             { dict }                                         ← 1
EnumValueTypeMap             { enum, enumeration }                            ← 2
LocalVariableValueTypeMap    { local_variable }                               ← 1
CustomVariableSnapshotValueTypeMap { custom_variable_snapshot }               ← 1
GenericValueTypeMap          { generic }                                      ← 1
LiteralValueListTypeMap      { *_list } × 11                                 ← 11 列表变体
```

展开后 **~22 种有效 IR 类型**：

| 类型字符串 | 分类 | 可作字面量 | 说明 |
|:---------|:----|:---------:|:-----|
| `bool` | 基础标量 | ✅ | 布尔值 |
| `int` | 基础标量 | ✅ | 整数 |
| `float` | 基础标量 | ✅ | 浮点数 |
| `str` | 基础标量 | ✅ | 字符串 |
| `vec3` | 基础标量 | ✅ | 三维向量 [x,y,z] |
| `guid` | 高级 ID | ✅ | 全局唯一 ID |
| `entity` | 高级 ID | ❌ | 实体（不能作字面量） |
| `prefab_id` | 高级 ID | ✅ | 预制件 ID |
| `config_id` | 高级 ID | ✅ | 配置 ID |
| `faction` | 高级 ID | ✅ | 阵营 |
| `struct` | 复合 | ❌ | 结构体（不能作字面量） |
| `dict` | 复合 | ❌ | 字典（不能作字面量） |
| `enum` | 特殊 | ✅ | 枚举项 |
| `enumeration` | 特殊 | ✅ | 枚举（别名） |
| `generic` | 特殊 | ❌ | 泛型（不能作字面量） |
| `local_variable` | 特殊 | ❌ | 局部变量引用 |
| `custom_variable_snapshot` | 特殊 | ❌ | 自定义变量快照 |
| `bool_list` ~ `faction_list` (11 种) | 列表 | ✅ | 列表变体 |

> ⚠️ **字面量限制**：`entity`、`struct`、`dict`、`generic`、`local_variable`、`custom_variable_snapshot` 在 IR JSON 中不应该以字面量出现——它们在 `pins.ts:setLiteralArgValue()` 中会触发 `throw new Error`。

### 3.6 运行时层 — RuntimeValueTypeMap

**位置**: `src/runtime/value.ts:53-75`

```typescript
type RuntimeValueTypeMap = {
  bool: BoolValue                int: IntValue           float: FloatValue
  str: StrValue                  vec3: Vec3Value
  guid: GuidValue                entity: EntityValue
  prefab_id: PrefabIdValue       config_id: ConfigIdValue
  faction: FactionValue
  struct: StructValue            dict: DictValue
  enum: EnumerationValue         enumeration: EnumerationValue
  generic: GenericValue
  custom_variable_snapshot: CustomVariableSnapshotValue
  local_variable: LocalVariableValue
  // 11 种 *_list:
  bool_list: BoolValue[]         int_list: IntValue[]     float_list: FloatValue[]
  str_list: StrValue[]           vec3_list: Vec3Value[]
  guid_list: GuidValue[]         entity_list: EntityValue[]
  prefab_id_list: PrefabIdValue[] config_id_list: ConfigIdValue[]
  faction_list: FactionValue[]   struct_list: StructValue[]
}
```

共 **22 条目**。所有 `*_list` 类型都以 `ArrayBase` 为基类。

### 3.7 SignalParamType — 信号参数类型

**位置**: `src/runtime/core.ts:58-79`

信号定义 `defineSignal()` 允许的 21 种参数类型：

```typescript
type SignalParamType =
  | 'bool' | 'int' | 'float' | 'str' | 'vec3'
  | 'guid' | 'entity' | 'prefab_id' | 'config_id' | 'faction'
  | 'bool_list' | 'int_list' | 'float_list' | 'str_list' | 'vec3_list'
  | 'guid_list' | 'entity_list' | 'prefab_id_list' | 'config_id_list' | 'faction_list'
  | 'unknown'
```

比完整 `ValueType` 少：`struct`, `struct_list`, `dict`, `enum`, `enumeration`, `generic`, `local_variable`, `custom_variable_snapshot`。多一个 `unknown` 用于未指定的类型。

### 3.8 IR→GIA 映射函数

**位置**: `src/compiler/ir_to_gia_transform/`

#### typeClassFromValueType — IR 类型 → VarBase.Class（composite.ts:855-869）

| IR 类型 | VarBase.Class | 值 | 状态 |
|:-------|:-------------|:--:|:----:|
| `int` | `IntBase` | 2 | ✅ |
| `float` | `FloatBase` | 4 | ✅ |
| `bool` | `EnumBase` | 6 | ✅ |
| `str` | `StringBase` | 5 | ✅ |
| `vec3` | `VectorBase` | 7 | ✅ |
| `entity`, `guid`, `faction`, `prefab_id`, `config_id` | `IdBase` | 1 | ✅ |
| `*_list`（任意列表） | `ArrayBase` | 10002 | ✅ |
| `struct` | `StructBase` | 10001 | ❌ |
| `dict` | `MapBase` | 10003 | ❌ |
| `enum` / `enumeration` | `EnumBase` | 6 | ❌ |

#### typeIdFromValueType — IR 类型 → VarType 枚举值（composite.ts:871-895）

| IR 类型 | VarType | 值 | 状态 |
|:-------|:-------|:--:|:----:|
| `bool` | `Boolean` | 4 | ✅ |
| `int` | `Integer` | 3 | ✅ |
| `float` | `Float` | 5 | ✅ |
| `str` | `String` | 6 | ✅ |
| `vec3` | `Vector` | 12 | ✅ |
| `guid` | `GUID` | 2 | ✅ |
| `entity` | `Entity` | 1 | ✅ |
| `prefab_id` | `Prefab` | 21 | ✅ |
| `config_id` | `Configuration` | 20 | ✅ |
| `faction` | `Faction` | 17 | ✅ |
| `bool_list` | `BooleanList` | 9 | ✅ |
| `int_list` | `IntegerList` | 8 | ✅ |
| `float_list` | `FloatList` | 10 | ✅ |
| `str_list` | `StringList` | 11 | ✅ |
| `entity_list` | `EntityList` | 13 | ✅ |
| `guid_list` | `GUIDList` | 7 | ✅ |
| `vec3_list` | `VectorList` | 15 | ❌ |
| `faction_list` | `FactionList` | 24 | ❌ |
| `config_id_list` | `ConfigurationList` | 22 | ❌ |
| `prefab_id_list` | `PrefabList` | 23 | ❌ |
| `struct_list` | `StructList` | 26 | ❌ |
| `struct` | `Struct` | 25 | ❌ |
| `dict` | `Dictionary` | 27 | ❌ |
| `enum` / `enumeration` | `EnumItem` | 14 | ❌ |

#### toVendorBaseTag — IR 类型 → BaseTag（pins.ts:21-36）

| IR 类型 | BaseTag |
|:-------|:------:|
| `bool` | `Bol` |
| `int` | `Int` |
| `float` | `Flt` |
| `str` | `Str` |
| `vec3` | `Vec` |
| `guid` | `Gid` |
| `entity` | `Ety` |
| `faction` | `Fct` |
| `config_id` | `Cfg` |
| `prefab_id` | `Pfb` |

仅覆盖 10 种基础标量/ID 类型。遇到复合类型（列表/结构体/字典）时返回 `null`，由调用方自行处理。

### 3.9 Dict 键值类型

**位置**: `src/runtime/value.ts:681`

```typescript
type DictKeyType   = 'str' | 'int' | 'entity' | 'guid' | 'faction' | 'config_id' | 'prefab_id'
type DictValueType = keyof CommonLiteralValueTypeMap | keyof CommonLiteralValueListTypeMap
// = 'bool'|'int'|'float'|'str'|'vec3'|'guid'|'entity'|'prefab_id'|'config_id'|'faction'
//   | 'bool_list'|'int_list'|'float_list'|'str_list'|'vec3_list'|'guid_list'|
//     'entity_list'|'prefab_id_list'|'config_id_list'|'faction_list'
```

DictValueType 的 20 种可能值 = 10 种标量 + 10 种列表。

### 3.10 DSL 用户构造器

**位置**: `src/runtime/server_globals.d.ts` / `src/runtime/value.ts`

| 构造器 | 创建类型 | 使用方式 |
|:------|:--------|:--------|
| `bool(v)` | `bool` | `bool(true)` |
| `int(v)` | `int` | `int(42)`，推荐 `42n` |
| `float(v)` | `float` | `float(3.14)` |
| `str(v)` | `str` | `str("hello")` |
| `vec3([x,y,z])` | `vec3` | `vec3([1,2,3])` |
| `guid(v)` | `guid` | `guid(12345n)` |
| `entity(g)` | `entity` | `entity(guid)`，支持 `entity(0)` 占位 |
| `prefabId(v)` | `prefab_id` | `prefabId(123)` |
| `configId(v)` | `config_id` | `configId(456)` |
| `faction(v)` | `faction` | `faction(789)` |
| `list(t, items)` | `*_list` | `list('int', [1,2])`，`list('int', 0)` 占位 |
| `dict(k, v, 0)` | `dict` | `dict('str', 'int', 0)` 占位 |
| `struct({k:v})` | `struct` | `struct({ x: int(1), y: int(2) })` |
| `enumeration(v, cls)` | `enumeration` | `enumeration('equal_to', 'ComparisonOperator')` |

### 3.11 引用速查

| 层 | 权威文件 | 关键函数/类型 |
|:--|:--------|:------------|
| Proto VarType | `gia.proto:181-209` | `VarType` 枚举 |
| Proto VarBase | `gia.proto:233-282` | `VarBase.Class` + `baseValues` oneof |
| Vendor NodeType | `gia_gen/nodes.ts:1-50` | `NodeType` 判别联合体 |
| Vendor BasicTypes | `gia_gen/nodes.ts:9-10` | `'Bol'|'Int'|'Flt'|'Str'|'Vec'|'Gid'|'Ety'|'Pfb'|'Fct'|'Cfg'` |
| Vendor types_list | `node_data/types_list.ts` | 27 条 TypeEntry 记录 |
| IR ValueType | `IR.d.ts:150-230` | `ValueType = keyof ValueTypeMap` |
| IR 字面量类型 | `IR.d.ts:152-168` | `LiteralValueTypeMap` 分层构造 |
| 运行时类型映射 | `value.ts:53-75` | `RuntimeValueTypeMap` |
| 信号参数类型 | `core.ts:58-79` | `SignalParamType` |
| VarBase class 映射 | `composite.ts:855-869` | `typeClassFromValueType()` |
| VarType 枚举映射 | `composite.ts:871-895` | `typeIdFromValueType()` |
| BaseTag 映射 | `pins.ts:21-36` | `toVendorBaseTag()` |
| DSL 构造器 | `server_globals.d.ts` / `value.ts` | `bool()`, `int()`, `list()`, `dict()` 等 |
| dict 键值类型 | `value.ts:681-685` | `DictKeyType`, `DictValueType` |

---

## 4. 节点类型定义：nodes.ts

`src/definitions/nodes.ts` 定义了**所有可用的服务器 F 方法**——即通过 `f.methodName()` 调用的节点图函数。

### 4.1 定义模式

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

### 4.2 方法分类

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

### 4.3 重载支持

`server_on_overloads.d.ts` 利用 TypeScript 的条件类型和函数重载，让 `f.methodName()` 的调用签名与节点定义精确匹配：

```typescript
// 简化的重载机制
f.addition(a: IntValue, b: IntValue): IntValue
f.log(x: StrValue): void
// ...
```

---

## 5. 事件系统：events.ts

`src/definitions/events.ts` 定义了所有可用的事件类型。

### 5.1 事件元数据

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

### 5.2 事件 Payload

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

## 6. 枚举系统：enums.ts

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

## 7. 类型别名与国际化：zh_aliases.ts

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

## 8. 实体类型辅助：entity_helpers.ts

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

## 9. 节点模式映射：node_modes.ts

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

## 10. 预制件 ID：prefabs.ts

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

## 11. 第三方定义：thirdparty 目录

### 11.1 vendored 数据

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
├── gia.proto             — GIA protobuf schema
├── gia.proto.ts          — 由 schema 生成的 TS 定义
└── decode.ts             — GIA 二进制解码
```

### 11.2 Vendor 兼容补丁来源

`src/thirdparty/` 不直接手改。genshin-ts 当前 legacy schema 的兼容补丁维护在 fork：

```text
repo:   TheTouYu/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack
branch: compat/genshin-ts-legacy-schema
base:   b6ceb52  chore: sync genshin-ts legacy schema baseline
patch:  497d9ec  fix: preserve composite enum type metadata
```

`497d9ec` 为 `CompositeDef.ParameterFlow.Type` 补充 `EnumId enumId = 101`，并包含最小 wire round-trip 测试。同步到 genshin-ts 时至少成对更新 `gia.proto` 和 `gia.proto.ts`，并在提交说明中记录 fork commit。

未来 vendor 更新时，先检查新 schema 是否已经正式包含 field 101：已包含则移除兼容补丁；未包含则在新 legacy 基线上重放 `497d9ec` 的语义增量。不要直接用 fork `dev` 的新架构 schema 覆盖当前 legacy schema，因为其消息已经从 `Root/GraphUnit/CompositeDef` 大规模迁移为 `AssetBundle/ResourceEntry/PinInterface`。

### 11.3 GIA 代码生成

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

## 12. 定义生成流程

```bash
npm run gen     # 运行 scripts/generate-definitions.ts
```

`generate-definitions.ts` 从 vendor 数据源重新生成 `nodes.ts`、`events.ts`、`enums.ts` 等定义文件。生成后自动运行 Prettier 格式化。

生成的数据来源：
1. Vendor 节点编辑器数据包中的节点/事件/枚举定义
2. 从游戏数据中提取的实体子类型和预制件 ID

这确保了定义与游戏版本保持同步。
