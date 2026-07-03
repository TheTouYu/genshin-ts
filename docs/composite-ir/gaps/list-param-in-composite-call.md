# Gap: 列表类型作为复合参数

> 编写日期：2026-07-05
> 来源：`tests/composite/test-all-types-composites.ts`（全覆盖参数类型复合节点测试）
> 相关文档：`docs/architecture/definition-system.md §3`

## 1. 问题描述

在 `f.callComposite(ListComposite, { 整数列表: list('int', []) })` 中，`list()` 工厂函数在 server context 下的返回值无法被 `buildArgument()` 正确识别，抛出 `"Value has no metadata"` 错误。

## 2. 受影响的功能

| 功能 | 状态 |
|------|------|
| `defineComposite` 声明 `*_list` 类型输入/输出 | ✅ 可以定义 |
| 复合 impl 节点中使用 `*_list` 类型 | ❌ `createTypedValue` 返回无类型 generic |
| 主图中 `f.callComposite(comp, { listParam })` 传入列表 | ❌ 无法构建连接参数 |
| GIA 编码中 `*_list` 类型引脚 | ❌ `RUNTIME_TO_GIA_TYPE` 缺映射 |
| `list` 类的 `toIRLiteral()` | ❌ 返回 `null` |

## 3. 问题链详解

### 3.1 P0: `createTypedValue` — 列表类型的 capture 占位值无类型

**文件**: `src/runtime/core.ts:1372`

```typescript
function createTypedValue(type: string): value {
  switch (type) {
    // ...10 种基本类型全部有对应实例
    default:
      if (type.endsWith('_list')) return new generic()  // ← 无 concreteType, 无 metadata
      return new generic()
  }
}
```

**问题**: 复合捕获阶段为 `*_list` 输入创建占位值时，返回 `new generic()` 没有设置 `concreteType`。当 `build()` 函数内操作该值时，`generic.getConcreteType()` 返回 `undefined`。

**影响范围**:
- 复合 `build()` 内调用 `f.assemblyList(input, 'int')` → 类型不匹配
- 复合 `build()` 内直接返回 input → outputValues 中 value 无类型 → `toCompositeDefIR` 输出坏 GIA

**修复**: `*_list` 分支返回 `new list(baseType)` 而非 `new generic()`，其中 `baseType = type.replace('_list', '')`。

```typescript
if (type.endsWith('_list')) {
  const baseType = type.slice(0, -5) as keyof ListableValueTypeMap
  return new list(baseType)
}
```

**依赖**: 需要确认 `list` 类构造函数只接受 `type: K` 一个参数（`value.ts:611-620`），`new list('entity')` 即为正确用法。

### 3.2 P0: `RUNTIME_TO_GIA_TYPE` 映射缺失

**文件**: `src/runtime/composite_registry.ts:21-33`

```typescript
const RUNTIME_TO_GIA_TYPE: Record<string, string> = {
  int: 'int',
  float_number: 'float',
  text: 'string',
  bool: 'bool',
  vec3: 'vec3',
  entity: 'entity',
  guid: 'guid',
  prefabId: 'prefab_id',
  configId: 'config_id',
  faction: 'faction',
  // ⚠️ 'list' 缺失！
}
```

**问题**: 映射基于 `constructor.name` 查找，`list` 类的 `constructor.name` 为 `'list'`，但在映射表中不存在。当 `toCompositeDefIR` 将 impl 节点 args 中的 `*_list` pin 连接转为 IR JSON 时，类型名退化为 `'list'`，而非 `'entity_list'` 或 `'int_list'`。

**影响位置**: `composite_registry.ts:237-247`：

```typescript
const typeName = (a as any).constructor?.name ?? ''
const giaType = RUNTIME_TO_GIA_TYPE[typeName] ?? typeName  // → 'list' 而非 'entity_list'
```

**修复**: 增加 `list: 'list'` 映射，但需要改用 `instanceof list` + `getConcreteType()` 的动态方案：

```typescript
const typeName = (a as any).constructor?.name ?? ''
let giaType: string
if (typeName === 'list' && a instanceof list) {
  const baseType = a.getConcreteType()
  giaType = `${baseType}_list`
} else {
  giaType = RUNTIME_TO_GIA_TYPE[typeName] ?? typeName
}
```

### 3.3 P1: `list.toIRLiteral()` 返回 `null`

**文件**: `src/runtime/value.ts:636-638`

```typescript
export class list<K> extends value {
  override toIRLiteral(): Argument {
    return null  // ← 永远返回 null
  }
}
```

**问题**: 当 `list` 实例作为字面量（没有 pin metadata）传入 `buildArgument` 时，`arg.toIRLiteral()` 返回 `null`，导致 GIA 中对应 arg 为 null，产生坏节点。如果先通过 `getMetadata()` 检查（`ir_builder.ts:114`），无 metadata 的 list 实例会直接抛出 `"Value has no metadata"`。

**注意**: `listLiteral` 子类覆盖了 `toIRLiteral()` 返回正确的字面量。当 `list` 实例有 pin metadata（如从 `initLocalVariable().value` 获取的）时，走 `buildConnectionArgument` 路径，不会调用 `toIRLiteral()`。

**修复**: `list.toIRLiteral()` 应返回基于 `concreteType` 的有意义字面量：

```typescript
override toIRLiteral(): Argument {
  const listType = `${this.getConcreteType()}_list` as keyof CommonLiteralValueListTypeMap
  return { type: listType, value: null } as Argument
}
```

### 3.4 P1: `list()` factory 在 server context 中对空数组使用局部变量

**文件**: `src/runtime/server_globals.ts:536-542`

```typescript
if (Array.isArray(items) && items.length === 0) {
  return gsts.f.initLocalVariable(`${listType}_list`).value
}
```

**问题**: 对空数组使用 `initLocalVariable` 创建一个 `get_local_variable` 数据节点，而用户期望的是一个简单的字面量列表。这不仅产生不必要的节点，返回值是局部变量句柄的 `.value`（经过类型伪装），可能导致下游类型错误。

**影响**: 当 `list('entity', [])` 的返回值被传入 `f.callComposite()` 时，`buildArgument` 尝试解析该值——虽然有 pin metadata，但变量引用的类型推断不一定正确。

**修复**: 对空数组，返回 `new listLiteral(listType, [])`（与非 server context 路径一致），而不是创建局部变量：

```typescript
if (Array.isArray(items) && items.length === 0) {
  return new listLiteral(listType, []) as RuntimeReturnValueTypeMap[`${T}_list`]
}
```

### 3.5 P2: `compositeTypeToBaseTag` 不含 `_list` 映射

**文件**: `src/compiler/ir_to_gia_transform/index.ts` 中对应的函数

已在 `docs/architecture/composite/composite-connection-boundary-matrix.md:111` 标记为 P1 待办。列表类型的基类都是 `ArrayBase(10002)`，编码时需要正确处理。

## 4. 修复优先级

| 优先级 | 修改项 | 文件 | 行 | 影响 |
|--------|--------|------|:--:|------|
| **P0** | `createTypedValue` 的 `*_list` 分支返回 `new list(baseType)` | `core.ts` | 1372 | 复合捕获阶段列表输入占位 |
| **P0** | `RUNTIME_TO_GIA_TYPE` 增加 `instanceof list` 动态分支 | `composite_registry.ts` | 237-247 | impl 节点 args 类型编码 |
| **P1** | `list.toIRLiteral()` 返回类型化字面量而非 null | `value.ts` | 636-638 | 字面量列表的 IR 表达 |
| **P1** | `list()` factory 空数组用 `listLiteral` 替代 `initLocalVariable` | `server_globals.ts` | 536-542 | 主图 handler 中创建列表 |
| **P2** | `compositeTypeToBaseTag` 扩展 `_list` 分支 | `index.ts` | — | GIA 类型映射完整性 |

## 5. 验证方法

修复后，`tests/composite/test-all-types-composites.ts` 中取消对列表复合的调用注释：

```typescript
// 将：
// --- 列表复合（暂不调用，待列表参数基础设施修复）---

// 改为：
// --- 列表复合 ---
f.callComposite(ListComposite, {
  整数列表: list('int', []),
  实体列表: list('entity', []),
})
```

并确认：
1. IR JSON 中 `__composite_call__` 节点的 args 包含正确的 `type:'int_list'` / `type:'entity_list'`
2. GIA 中 accessories 包含 4 对 CompositeDef + impl NodeGraph
3. 主图节点正确编码为 SysGraph(kind=22001)

## 6. 相关代码

| 用途 | 文件 |
|------|------|
| 全覆盖类型复合测试 | `tests/composite/test-all-types-composites.ts` |
| 复合定义/捕获 | `src/runtime/core.ts` |
| 复合注册/IR 生成 | `src/runtime/composite_registry.ts` |
| IR → GIA 转换 | `src/compiler/ir_to_gia_transform/composite.ts` |
| IR 构建器（检查 metadata） | `src/runtime/ir_builder.ts:112-122` |
| list/listLiteral 值类 | `src/runtime/value.ts:611-664` |
| list() 工厂函数 | `src/runtime/server_globals.ts:474-547` |
