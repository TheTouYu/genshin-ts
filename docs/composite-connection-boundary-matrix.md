# 复合节点连接边界兼容性矩阵

## 概述

当各种节点连接到复合节点时，可能存在类型不匹配、pin 编码缺失等问题。本文档系统性地列出所有已支持/未支持/部分支持的场景。

## 1. 数据流 IN → 复合节点

**文件**: `index.ts:513-520`, `pins.ts:82-135`, `layout.ts:68-74`

### 类型缺口矩阵

| 类型 | `compositeTypeToBaseTag` | `createTypedValue` | `parseValue` | 状态 |
|------|--------------------------|-------------------|-------------|:--:|
| `bool` | `'Bol'` | `new bool()` | yes | ✅ |
| `int` | `'Int'` | `new int()` | yes | ✅ |
| `float` | `'Flt'` | `new float()` | yes | ✅ |
| `str` | `'Str'` | `new str('')` | yes | ✅ |
| `vec3` | `'Vec'` | `new vec3([0,0,0])` | yes | ✅ |
| `guid` | `'Gid'` | `new guid()` | yes | ✅ |
| `entity` | `'Ety'` | `new entity()` | yes | ✅ |
| `faction` | `'Fct'` | `new faction()` | yes | ✅ |
| `config_id` | `'Cfg'` | `new configId()` | yes | ✅ |
| `prefab_id` | `'Pfb'` | `new prefabId()` | yes | ✅ |
| `local_variable` | **null** | `new localVariable()` | yes | ❌ |
| `*_list` (10 种) | **null** | `new generic()` | yes | ❌ |
| `struct` | **null** | 不支持 | yes | ❌ |
| `dict` | **null** | 不支持 | yes | ❌ |
| `enum` | **null** | 不支持 | yes | ❌ |
| `generic` | **null** | 不支持 | yes | ❌ |

**根因** (`index.ts:515-516`): 当 `compositeTypeToBaseTag()` 返回 `null` 时，InParam pin 仍然被创建并 push 到 `giaNode.pins`，但 **不设 type**。`filterUnkPins` 会将其移除。

**影响**: `local_variable` 和所有 `_list` 类型的复合输入参数无法正常工作。

### 数据连接偏移

`layout.ts:68-74` — `__composite_call__` 的 toIndex 已修正为 `toIndex - 1`（arg[0]=compositeId, arg[1..]=真实参数）。✅

---

## 2. 执行流 IN → 复合节点

**文件**: `index.ts:584-593`, `composite_registry.ts:102-110`

**状态**: ✅ 支持

复合调用节点不显式创建 InFlow pin，exec flow 通过 `graph.flow()` 自然连接。路由通过 compositePins 的 `outerInFlow → innerNode InFlow` 映射完成。

纯数据复合 (`isPureData=true`): 无 InFlow 映射，正确跳过。

---

## 3. 执行流 OUT ← 复合节点

**文件**: `index.ts:538-542`, `index.ts:676-714`, `composite_registry.ts:112-118`

**状态**: ✅ 支持（终端/非终端自动判定）

- OutFlow pin 通过 `new Pin(..., 2, outflow.index)` 创建，带 `compositePinIndex`
- 终端判定: `OutFlow.connects.length > 0` → 非终端（保留），`=== 0` → 终端（移除 OutFlow，下游收归 event fork）

---

## 4. 数据流 OUT ← 复合节点

**文件**: `composite.ts:80-91`, `composite.ts:273-298`, `core.ts:979-990`, `index.ts:610-629`

**状态**: ⚠️ 部分支持

- **CompositeDef accessories 编码**: `typeClassFromValueType` 和 `typeIdFromValueType` 正确处理标量 + `_list` 类型
- **调用侧 OutParam pin**: 与 InParam 共享 `compositeTypeToBaseTag` 缺口（`_list` / `local_variable` 等无 type）
- **compositeDataEdges**: 仅处理复合→复合数据连线。普通节点→复合的数据连线走标准 IR `dataConnections`
- **impl 图 OutParam**: `argVarType`/`argVarBaseClass` 不支持 `_list` 等，返回 `type: 0`

---

## 5. 特殊节点在复合 impl 图中的兼容性

**文件**: `index.ts:397-436`, `composite.ts:273-298`

这些节点在**主图**中有特殊 pin 布局处理，但**复合 impl 图** (`buildImplNodePins`) 没有：

| 节点类型 | 主图特殊处理 | impl 图状态 |
|----------|-------------|:--:|
| `assembly_list` | pin0=count, pin1+=elements | ❌ 按普通 arg 编码，pin 布局不匹配 |
| `assembly_dictionary` | pin0=kv 数量, pin1+=k/v | ❌ 同上 |
| `multiple_branches` | pin0=control, pin1=case_list | ❌ 同上 |
| `send_signal` / `monitor_signal` | 特殊 pin 重建逻辑 | ❌ 信号 pin 布局丢失 |
| `get_node_graph_variable` | 注入 Str pin 于 index0 | ❌ 变量名 pin 缺失 |
| `get_local_variable` / `set_local_variable` | 通过 `SPECIAL_NODE_IDS` 映射 | ⚠️ 基本可用，部分细节缺失 |

**影响**: 在复合 build() 中使用 `assembly_list`、`multiple_branches`、信号节点、图变量节点时，生成的 GIA 可能有 pin 布局错误。

---

## 6. 已完全支持的类型（10 种）

`bool`, `int`, `float`, `str`, `vec3`, `guid`, `entity`, `prefab_id`, `config_id`, `faction`

这些类型在 `compositeTypeToBaseTag`、`createTypedValue`、`parseValue`、`typeClassFromValueType`、`typeIdFromValueType`、`argVarBaseClass`、`argVarType` 中全部有映射，可在复合的 inputs/outputs 和 impl 图节点中安全使用。

---

## 修复优先级建议

| 优先级 | 项目 | 改动点 |
|--------|------|--------|
| P0 | `local_variable` InParam 支持 | `compositeTypeToBaseTag` 扩展或 Pin type 直设 |
| P1 | `*_list` 类型 InParam/OutParam | `compositeTypeToBaseTag` 增加 `_list` 分支 |
| P2 | impl 图特殊节点 pin 布局 | `buildImplNodePins` 增加 `assembly_*`/`multiple_branches`/信号节点处理 |
| P3 | `struct`/`dict`/`enum` 通用支持 | 全链路类型系统扩展 |
