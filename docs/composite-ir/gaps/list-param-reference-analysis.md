# 列表参数参考文件分析：类型转化-full-v2.gia

> 状态：历史记录
> 来源：2026-07-05 参考文件逆向分析
> 最近校验：2026-07-06
> 适用范围：单个参考 GIA 文件的 decode 分析，帮助理解 editor 输出中的 list 类型编码规则；不作为当前 API 教程。
>
> 分析日期：2026-07-05
> 参考文件：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/类型转化-full-v2.gia`
> 游戏版本：6.7.0
> 前置文档：`docs/composite-ir/gaps/list-param-in-composite-call.md`
> 目标：从参考 GIA 逆向推导 IR JSON → GIA 的编码规则，指导代码修复

---

## 1. 文件结构

```
accessories[4]:
  [0] CompositeDef "列表操作"        ← 新增 list 相关复合
  [1] impl graph "列表操作"
  [2] CompositeDef "创建复合节点(5)"  ← v1 DTC 复合（无变化）
  [3] impl graph "创建复合节点(5)"

主图（3 节点）:
  n=1  When Entity Is Created  (kind=22000, nid=71)
  n=7  复合:列表操作            (kind=22001, nid=1610612740)  ← 2 pins
  n=10 复合:创建复合节点(5)      (kind=22001, nid=1610612739)  ← 7 pins
```

---

## 2. "列表操作" Composite 详解

### 2.1 CompositeDef

```json
{
  "name": "列表操作",
  "inflows": [ { "pinIndex": 55 } ],
  "outflows": [],
  "inputs": [
    { "name": "0", "class": 2, "type1": 3, "type2": 3, "pinIndex": 53 },
    { "name": "1", "class": 2, "type1": 3, "type2": 3, "pinIndex": 54 }
  ],
  "outputs": [],
  "xxx": 6,
  "type": { "kind": 1000 }
}
```

**关键观察**：两个 int_list 输入的 class=2(IntBase), type1=3(Integer)——用的是**元素类型**编码，而非容器类型。

### 2.2 Impl 图（7 节点）

| 索引 | 名称 | nid | 关键信息 |
|------|------|:---:|---------|
| n=1 | Print String | 1 | pin[0] type=6(String) ← n=6 |
| n=2 | Assembly List | 169 | pins=102，组装 int_list |
| n=3 | List Iteration Loop | 509 | 遍历组装后的列表 |
| n=4 | Get Node Graph Variable | 337 | 读取图变量 "字符串列表" |
| n=5 | List Iteration Loop | 509 | 遍历变 list |
| n=6 | Data Type Conversion | 180 | int→str 转换 |
| n=7 | Print String | 1 | pin[0] type=6(String) ← n=5 |

### 2.3 compositePins 映射

```
Inner                             Outer
──────────────────────────────────────────
n=3(List Iteration Loop) InFlow  →  Composite InFlow[0]
n=2(Assembly List) InParam[1]    →  Composite Input[0]  ("0")
n=2(Assembly List) InParam[2]    →  Composite Input[1]  ("1")
```

### 2.4 执行流

```
Event (When Entity Is Created)
  ├─ InFlow → 创建复合节点(5)
  │  └─ Double Branch → 7× DTC→Print String
  └─ InFlow → 列表操作
     └─ List Iteration Loop (n=3) ← iterates Assembly List
        ├─ Br[1] → Data Type Conversion (n=6) → Print String (n=1)
        └─ Br[2] → List Iteration Loop (n=5) ← Get Node Graph Variable (n=4)
           └─ Br[1] → Print String (n=7)
```

### 2.5 数据流

**流 1（父输入 → 组装 → 迭代 → 转换 → 打印）：**
```
Parent Input "0" (int_list → 取首个元素) ──┐
                                             ├─→ Assembly List (n=2, nid=169)
Parent Input "1" (int_list → 取首个元素) ──┘    ├ pin[0] count=2
                                                  ├ pin[1] elem[0] = parent[0]
                                                  ├ pin[2] elem[1] = parent[1]
                                                  └ pin[3..100] elem[2..99] = 0
                                                  ↓
                                         List Iteration Loop (n=3, nid=509)
                                           pin[2] type=8(IntegerList) ← list input
                                           ↓ per element
                                         Data Type Conversion (n=6, nid=180)
                                           pin[0] type=3(Integer) ← element
                                           pin[1] type=6(String)  → output
                                           ↓
                                         Print String (n=1, nid=1)
                                           pin[0] type=6(String)
```

**流 2（图变量 → 迭代 → 打印）：**
```
Get Node Graph Variable (n=4, nid=337)
  pin[0] type=6(String) = "字符串列表"  ← 变量名
  pin[1] type=11(StringList)          ← 输出
  ↓
List Iteration Loop (n=5, nid=509)
  pin[1] type=11(StringList) ← list input
  ↓ per element
Print String (n=7, nid=1)
  pin[0] type=6(String)
```

---

## 3. GIA Pin 类型编码参考表

### 3.1 标量类型

| GIA type | 含义 | 对应 VarType |
|:--------:|------|:------------:|
| 0 | Exec pin (OutFlow/InFlow/Branch) | — |
| 3 | Integer | `VarType.Integer` |
| 4 | Boolean | `VarType.Boolean` |
| 5 | Float | `VarType.Float` |
| 6 | String | `VarType.String` |
| 1 | Entity | `VarType.Entity` |
| 2 | GUID | `VarType.GUID` |
| 12 | Vector | `VarType.Vector` |
| 17 | Faction | `VarType.Faction` |
| 20 | Configuration | `VarType.Configuration` |
| 21 | Prefab | `VarType.Prefab` |

### 3.2 列表类型

| GIA type | 含义 | 对应 VarType |
|:--------:|------|:------------:|
| 7 | GUIDList | `VarType.GUIDList` |
| 8 | IntegerList | `VarType.IntegerList` |
| 9 | BooleanList | `VarType.BooleanList` |
| 10 | FloatList | `VarType.FloatList` |
| 11 | StringList | `VarType.StringList` |
| 13 | EntityList | `VarType.EntityList` |

### 3.3 VarBase_Class

| class | 含义 |
|:-----:|------|
| 0 | Unknown |
| 1 | IdBase |
| 2 | IntBase |
| 4 | FloatBase |
| 5 | StringBase |
| 6 | EnumBase |
| 7 | VectorBase |
| 10002 | ArrayBase |

---

## 4. 三层编码规则（核心发现）

### 4.1 CompositeDef input/output type

**规则**：对 `_list` 类型，使用**元素类型**的 class 和 typeId。

| IR type | GIA class | GIA type1 |
|---------|:---------:|:---------:|
| `int_list` | `IntBase(2)` | `Integer(3)` |
| `entity_list` | `IdBase(1)` | `Entity(1)` |
| `bool_list` | `EnumBase(6)` | `Boolean(4)` |
| `str_list` | `StringBase(5)` | `String(6)` |
| `float_list` | `FloatBase(4)` | `Float(5)` |
| `guid_list` | `IdBase(1)` | `GUID(2)` |
| `vec3_list` | `VectorBase(7)` | `Vector(12)` |
| `faction_list` | `IdBase(1)` | `Faction(17)` |
| `prefab_id_list` | `IdBase(1)` | `Prefab(21)` |
| `config_id_list` | `IdBase(1)` | `Configuration(20)` |

**当前 `typeClassFromValueType` 代码**（`composite.ts:958-974`）：对 `_list` 返回 `ArrayBase(10002)`。
**当前 `typeIdFromValueType` 代码**（`composite.ts:977-998`）：对 `int_list` 返回 `IntegerList(8)`，缺 `prefab_id_list`/`config_id_list`/`faction_list`/`vec3_list`。

### 4.2 Impl 图 node pin type

**规则**：对 `_list` 类型的引脚，使用**容器类型**的 typeId。

| IR type | GIA class（通过 `argVarBaseClass`） | GIA type（通过 `argVarType`） |
|---------|:----------------------------------:|:----------------------------:|
| `int_list` | `IntBase(2)` | `IntegerList(8)` |
| `entity_list` | `IdBase(1)` | `EntityList(13)` |
| `bool_list` | `EnumBase(6)` | `BooleanList(9)` |
| `str_list` | `StringBase(5)` | `StringList(11)` |
| `float_list` | `FloatBase(4)` | `FloatList(10)` |
| `guid_list` | `IdBase(1)` | `GUIDList(7)` |
| `faction_list` | `IdBase(1)` | `IntegerList(8)`? |
| `prefab_id_list` | `IdBase(1)` | ? |
| `config_id_list` | `IdBase(1)` | ? |
| `vec3_list` | `VectorBase(7)` | ? |

> 注意：`faction_list`/`prefab_id_list`/`config_id_list`/`vec3_list` 的容器 VarType 在 `src/thirdparty/.../node_id.ts` 中可能未定义。参考文件只用了 `int_list`/`str_list`。

**参考文件证据**：
- `Assembly List (nid=169)` pin[0] type=3(Integer) ← 元素类型（count 是 int）
- `Assembly List` pin[1..101] type=3(Integer) ← 元素类型
- `List Iteration Loop (n=3)` pin[2] type=8(IntegerList) ← **容器类型**
- `Data Type Conversion (n=6)` pin[0] type=3(Integer) ← 元素类型
- `Get Node Graph Variable (n=4)` pin[1] type=11(StringList) ← **容器类型**
- `List Iteration Loop (n=5)` pin[1] type=11(StringList) ← **容器类型**

**当前 `argVarType` 代码**（`composite.ts:545-558`）：对 `_list` 返回 0。
**当前 `argVarBaseClass` 代码**（`composite.ts:525-539`）：对 `_list` 返回 0。

### 4.3 主图 SysGraph pin type

**规则**：SysGraph (kind=22001) 节点的 pin 不设显式 type，通过 `compositePinIndex` 间接引用 CompositeDef 的 input 定义。当前 `compositeTypeToBaseTag` 返回 null 时 pin 被 `filterUnkPins` 移除。

**参考文件证据**：
- 主图 `n=7`（列表操作）有 2 个 pin，`type.t=undefined`，只有 `compositePinIndex=53,54`

---

## 5. 需要修改的 9 个函数

### 5.1 CompositeDef 编码（IR → GIA CompositeDef 层）

#### Fix 1: `typeClassFromValueType` (`composite.ts:958-974`)

```typescript
function typeClassFromValueType(type: string): number {
  switch (type) {
    case 'int': return VarBase_Class.IntBase
    case 'float': return VarBase_Class.FloatBase
    case 'bool': return VarBase_Class.EnumBase
    case 'str': return VarBase_Class.StringBase
    case 'vec3': return VarBase_Class.VectorBase
    case 'entity':
    case 'guid':
    case 'faction':
    case 'prefab_id':
    case 'config_id':
      return VarBase_Class.IdBase
    default:
      // ❌ 当前：if (type.endsWith('_list')) return VarBase_Class.ArrayBase
      // ✅ 应改为：剥离 _list 后缀，递归调用
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return typeClassFromValueType(elementType)
      }
      return 0
  }
}
```

#### Fix 2: `typeIdFromValueType` (`composite.ts:977-998`)

```typescript
function typeIdFromValueType(type: string): number {
  switch (type) {
    case 'bool': return VarType.Boolean
    case 'int': return VarType.Integer
    case 'float': return VarType.Float
    case 'str': return VarType.String
    case 'vec3': return VarType.Vector
    case 'guid': return VarType.GUID
    case 'entity': return VarType.Entity
    case 'prefab_id': return VarType.Prefab
    case 'config_id': return VarType.Configuration
    case 'faction': return VarType.Faction
    default:
      // ❌ 当前：使用专门的 _list 分支（不完整）
      // ✅ 应改为：剥离 _list 后缀，递归调用
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return typeIdFromValueType(elementType)
      }
      return 0
  }
}
```

### 5.2 Impl 图 pin 编码（IR → GIA impl 节点层）

#### Fix 3: `argVarBaseClass` (`composite.ts:525-539`)

```typescript
function argVarBaseClass(argType: string): number {
  switch (argType) {
    case 'int': return VarBase_Class.IntBase
    case 'float': return VarBase_Class.FloatBase
    case 'bool': return VarBase_Class.EnumBase
    case 'str': return VarBase_Class.StringBase
    case 'vec3': return VarBase_Class.VectorBase
    case 'entity':
    case 'guid':
    case 'faction':
    case 'prefab_id':
    case 'config_id':
      return VarBase_Class.IdBase
    default:
      // ❌ 当前：return 0
      // ✅ 应增加 _list 分支
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return argVarBaseClass(elementType)
      }
      return 0
  }
}
```

#### Fix 4: `argVarType` (`composite.ts:545-558`)

```typescript
function argVarType(argType: string): number {
  switch (argType) {
    case 'bool': return VarType.Boolean
    case 'int': return VarType.Integer
    case 'float': return VarType.Float
    case 'str': return VarType.String
    case 'vec3': return VarType.Vector
    case 'guid': return VarType.GUID
    case 'entity': return VarType.Entity
    case 'faction': return VarType.Faction
    case 'prefab_id': return VarType.Prefab
    case 'config_id': return VarType.Configuration
    default:
      // ❌ 当前：return 0
      // ✅ 应增加 _list 分支
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return listVarTypeFromElementType(elementType) // 新增映射表
      }
      return 0
  }
}
```

需要新增元素 → 列表容器类型的映射：

```typescript
function listVarTypeFromElementType(elementType: string): number {
  switch (elementType) {
    case 'int': return VarType.IntegerList     // 8
    case 'bool': return VarType.BooleanList     // 9
    case 'float': return VarType.FloatList      // 10
    case 'str': return VarType.StringList       // 11
    case 'guid': return VarType.GUIDList        // 7
    case 'entity': return VarType.EntityList    // 13
    // faction / prefab_id / config_id / vec3 可能没有对应的列表容器类型
    default: return 0
  }
}
```

### 5.3 主图 InParam 编码

#### Fix 5: `compositeTypeToBaseTag` (`index.ts:170-184`)

```typescript
function compositeTypeToBaseTag(type: string): 'Str' | 'Bol' | 'Int' | 'Flt' | 'Vec' | 'Ety' | 'Gid' | 'Cfg' | 'Fct' | 'Pfb' | null {
  switch (type) {
    case 'bool': return 'Bol'
    case 'int': return 'Int'
    case 'float': return 'Flt'
    case 'str': return 'Str'
    case 'vec3': return 'Vec'
    case 'guid': return 'Gid'
    case 'entity': return 'Ety'
    case 'faction': return 'Fct'
    case 'config_id': return 'Cfg'
    case 'prefab_id': return 'Pfb'
    default:
      // ❌ 当前：return null
      // ✅ 应增加 _list 分支：使用元素类型的 base tag
      if (type.endsWith('_list')) {
        const elementType = type.slice(0, -5)
        return compositeTypeToBaseTag(elementType)
      }
      return null
  }
}
```

### 5.4 IR 捕获层（Gap doc 原有）

#### Fix 6: `createTypedValue` (`core.ts:1376`)

`_list` 分支返回 `new list(baseType)` 而非 `new generic()`。

#### Fix 7: `RUNTIME_TO_GIA_TYPE` (`composite_registry.ts:237-247`)

增加 `instanceof list` 动态分支 → 输出 `"int_list"` / `"entity_list"`。

#### Fix 8: `list.toIRLiteral()` (`value.ts:636-638`)

返回 `{ type: 'int_list', value: null }` 而非 `null`。

#### Fix 9: `list()` factory (`server_globals.ts:536-542`)

空数组返回 `new listLiteral(listType, [])` 而非 `initLocalVariable`。

---

## 6. 修复优先级

| # | 优先级 | 修改内容 | 文件 | 影响范围 |
|:-:|:------:|----------|------|---------|
| 6 | **P0** | `createTypedValue` `_list` → `new list(baseType)` | `core.ts:1376` | IR 捕获 - 复合定义阶段 |
| 7 | **P0** | `RUNTIME_TO_GIA_TYPE` `instanceof list` | `composite_registry.ts:237` | IR→GIA conn arg 类型 |
| 1 | **P1** | `typeClassFromValueType` `_list` → 元素 class | `composite.ts:972` | CompositeDef class 编码 |
| 2 | **P1** | `typeIdFromValueType` `_list` → 元素 typeId | `composite.ts:990` | CompositeDef type1 编码 |
| 3 | **P1** | `argVarBaseClass` 增加 `_list` 分支 | `composite.ts:538` | Impl 图 pin class |
| 4 | **P1** | `argVarType` 增加 `_list` 分支 + 容器映射 | `composite.ts:557` | Impl 图 pin type |
| 5 | **P1** | `compositeTypeToBaseTag` 增加 `_list` 分支 | `index.ts:182` | 主图 InParam pin |
| 8 | **P1** | `list.toIRLiteral()` 返回类型化字面量 | `value.ts:636` | IR 字面量 |
| 9 | **P1** | `list()` factory 空数组用 `listLiteral` | `server_globals.ts:536` | IR 生成 |

> 调整说明：Fix 1-5 从 P2 提升到 P1，因为参考文件证明它们直接影响 GIA 编码正确性。原有的 P0 优先修复。

---

## 7. 验证方法

1. 运行 `npx tsx tests/composite/test-all-types-composites.ts`，确认不报错
2. 检查输出的 IR JSON：`__composite_call__` 节点的 args 类型为 `int_list` / `entity_list`
3. 用 `trace-dataflow.ts` 解析生成的 GIA，对比参考文件的 CompositeDef 类型编码
4. 用 `trace-exec-flow.ts --expand` 确认执行流正确
5. （可选）拷贝到游戏目录验证

---

## 8. 参考工具命令

```bash
# 数据流追溯
npx tsx tests/composite/trace-dataflow.ts "<gia文件>" <节点索引> -c "列表操作" --all-params

# 执行流
npx tsx tests/composite/trace-exec-flow.ts "<gia文件>"
npx tsx tests/composite/trace-exec-flow.ts "<gia文件>" --expand="列表操作"

# 节点列表
npx tsx tests/composite/trace-dataflow.ts "<gia文件>" --list-nodes -c "列表操作"

# impl 图结构
npx tsx tests/composite/_dump_impl_graphs.ts "<gia文件>"
```

---

## 9. 相关代码索引

| 文件 | 关键函数 | 行号 |
|------|---------|:----:|
| `src/runtime/core.ts` | `createTypedValue` | 1351-1378 |
| `src/runtime/composite_registry.ts` | `toCompositeDefIR` | 117-256 |
| `src/runtime/value.ts` | `list.toIRLiteral` | 636-638 |
| `src/runtime/value.ts` | `class list` | 611-639 |
| `src/runtime/value.ts` | `class listLiteral` | 646-665 |
| `src/runtime/server_globals.ts` | `list()` factory | 479-552 |
| `src/runtime/ir_builder.ts` | `buildArgument` | 112-122 |
| `src/compiler/ir_to_gia_transform/composite.ts` | `typeClassFromValueType` | 958-974 |
| `src/compiler/ir_to_gia_transform/composite.ts` | `typeIdFromValueType` | 977-998 |
| `src/compiler/ir_to_gia_transform/composite.ts` | `argVarBaseClass` | 525-539 |
| `src/compiler/ir_to_gia_transform/composite.ts` | `argVarType` | 545-558 |
| `src/compiler/ir_to_gia_transform/composite.ts` | `buildImplNodePins` | 566-753 |
| `src/compiler/ir_to_gia_transform/index.ts` | `compositeTypeToBaseTag` | 170-184 |
| `src/compiler/ir_to_gia_transform/index.ts` | `filterUnkPins` | — |
