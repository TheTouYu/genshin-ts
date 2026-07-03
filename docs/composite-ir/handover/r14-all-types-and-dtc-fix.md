# Session 交接：全覆盖参数类型与 dataTypeConversion 修复

> **目标轮次：** r14
> **前置依赖：** [r13-nested-composite-complete.md](./r13-nested-composite-complete.md)
> **参考文件：** `user_edit/类型转化-full.gia`（游戏编辑器产出）
> **新同事必读：** `docs/architecture/debugging-gia-encoding-methodology.md`
> **当前状态：** dataTypeConversion 在复合 impl 图中 6 种类型通过游戏验证

---

## 1. 已实现功能

### 1.1 全覆盖参数类型复合测试

**文件**：`tests/composite/test-all-types-composites.ts`

```
主图(event)
  ├── f.callComposite(标量转字符串, {bool, int, float, str})
  ├── f.callComposite(向量与引用转字符串, {vec3, guid, entity})
  ├── f.callComposite(资源ID传递, {prefab_id, config_id, faction})
  └── // f.callComposite(列表传递, {int_list, entity_list})  ← 暂不调用
```

覆盖 **10 种参数类型**，分 3 个已调用复合 + 1 个已定义未调用复合。

### 1.2 复刻参考文件

**文件**：`tests/composite/replicate-full-dtc.ts`

精确复刻游戏编辑器产出 `类型转化-full.gia`，6 种 DTC 变种全部通过游戏验证 ✅：

| DTC 变种 | concreteId | InParam type | indexOfConcrete | 状态 |
|---------|:---------:|:----------:|:--------------:|:----:|
| int→str | 182 | 3(Integer) | 0 | ✅ |
| float→str | 188 | 5(Float) | 4 | ✅ |
| bool→str | 186 | 4(Boolean) | 3 | ✅ |
| entity→str | 183 | 1(Entity) | 1 | ✅ |
| guid→str | 184 | 2(GUID) | 2 | ✅ |
| vec→str | 189 | 12(Vector) | 5 | ✅ |

### 1.3 修复的 3 个根因

| # | 文件 | 修复内容 |
|---|------|---------|
| 1 | `src/runtime/value.ts` | 9 个 value 类的 `toIRLiteral()` 无值时返回 `{type, value:null}` 而非 `null` |
| 2 | `src/compiler/ir_to_gia_transform/composite.ts` | `resolveImplNodeId` 支持 conn/literal 两种 arg 形态；dual-ID（generic=180 / concrete=<variant>）；`DTC_IN_PARAM_VARTYPE_SEQUENCE` + `getDtcInParamInfo()` |
| 3 | `src/runtime/composite_registry.ts` | capture input 的 `__captureInputName` 检测 → 生成类型正确的 conn arg |

---

## 2. 当前已知差异

### 2.1 CompositeDef input type 的 class 字段

| 输入 | 参考 class | 我们的 class | 差异 |
|------|:---------:|:-----------:|:----:|
| 整数 (int) | 2 (IntBase) | 2 | ✅ |
| 浮点数 (float) | 4 (FloatBase) | 4 | ✅ |
| 布尔 (bool) | 6 (EnumBase) | 6 | ✅ |
| 实体 (entity) | **0** (Unknown) | **1** (IdBase) | ❌ |
| GUID (guid) | 1 (IdBase) | 1 | ✅ |
| 三维向量 (vec3) | 7 (VectorBase) | 7 | ✅ |

entity 的 class 差异未影响游戏运行（已验证通过），可能是参考文件中的历史遗留问题。

### 2.2 faction 限制

`dataTypeConversion` 函数在 `src/definitions/nodes.ts:836` 检查 faction 输入必须为连线值：

```typescript
if (inputType === 'faction') {
  const metadata = inputObj.getMetadata()
  if (!metadata || metadata.kind !== 'pin') {
    throw new Error(t('err_dataTypeConversionFactionMustBeWired'))
  }
}
```

在复合 capture 上下文中，输入值为 `createTypedValue('faction')` 创建的占位值，无 pin metadata → 抛出错误。这是函数层的限制，非编码层问题。

### 2.3 列表类型参数

详见 [gap 文档](../gaps/list-param-in-composite-call.md)，5 处修复点（P0×2 / P1×2 / P2×1）。

---

## 3. 下一轮工作

### P0：资源ID 类型支持 dataTypeConversion

**问题**：`prefab_id` 和 `config_id` 不在 `DataTypeConversionMap` 中 → 不能调用 `f.dataTypeConversion(prefabId, 'str')`。

**文件**：`src/definitions/nodes.ts:690-697`

```typescript
export type DataTypeConversionMap = {
  bool: 'int' | 'str'
  entity: 'str'
  faction: 'str'
  float: 'int' | 'str'
  guid: 'str'
  int: 'bool' | 'float' | 'str'
  vec3: 'str'
  // ❌ prefab_id / config_id 缺失
}
```

**修复路径**（两个方案选一）：

**方案 A**（推荐）：扩展 `DataTypeConversionMap` 增加 `prefab_id: 'str'` 和 `config_id: 'str'`。同时需要在 `src/runtime/server_globals.ts:103-111` 的 `CONVERT` 矩阵中增加对应条目。

**方案 B**：保持 identity 传递，但验证 `prefab_id` / `config_id` 类型作为复合参数在 GIA 编码中的正确性。

### P1：列表类型参数修复

详见 `docs/composite-ir/gaps/list-param-in-composite-call.md`，按优先级依次修复：

| 优先级 | 修改项 | 文件 | 行 |
|--------|--------|------|:--:|
| P0 | `createTypedValue` 的 `*_list` 分支返回 `new list(baseType)` | `core.ts` | 1372 |
| P0 | `RUNTIME_TO_GIA_TYPE` 增加 `instanceof list` 动态分支 | `composite_registry.ts` | 237-247 |
| P1 | `list.toIRLiteral()` 返回类型化字面量而非 null | `value.ts` | 636-638 |
| P1 | `list()` factory 空数组用 `listLiteral` 替代 `initLocalVariable` | `server_globals.ts` | 536-542 |
| P2 | `compositeTypeToBaseTag` 扩展 `_list` 分支 | `index.ts` | — |

### P2：CompositeDef input entity class 对齐

修复 `argVarBaseClass('entity')` 对 entity 输入在 CompositeDef 中的 class 编码。

### P2：faction→str GIA 节点生成

跳过 `dataTypeConversion` 函数的 faction 检查，在复合 capture 中直接为 faction 输入创建正确的 `data_type_conversion_faction_str` 节点（nid=255）。

---

## 4. 技术债务

| 项 | 说明 | 优先级 |
|----|------|--------|
| `toIRLiteral()` 返回 `{type, value:null}` 时的 TS 类型 | 当前用 `null as any` 绕过类型检查 | P2 |
| 测试覆盖率 | `test-all-types-composites.ts` 只覆盖 10 种类型，缺 `struct`/`dict` 等复合类型 | P3 |
| 游戏测试自动化 | 目前必须手动复制 GIA 到游戏目录 | P3 |
| `_debug_*.ts` 临时文件 | 注意不要在 debug 文件中遗留节点，已清理 | — |

---

## 5. 关键文件索引

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/runtime/value.ts` | 值类型 + `toIRLiteral()` | 9 个类各有覆盖 |
| `src/runtime/composite_registry.ts` | 捕获 → IR JSON | `toCompositeDefIR()` |
| `src/compiler/ir_to_gia_transform/composite.ts` | IR JSON → GIA | `buildImplGraphNodes()`, `buildImplNodePins()`, `resolveImplNodeId()`, `wrapConcreteValue()`, `getDtcInParamInfo()` |
| `src/definitions/nodes.ts` | F 方法定义 | `dataTypeConversion()`, `DataTypeConversionMap` |
| `src/runtime/server_globals.ts` | DSL 工厂函数 | `list()`, `entity()` |
| `src/compiler/ir_to_gia_transform/index.ts` | 主图编码 | `irToGia()` |
| `node_data/concrete_map.ts` | Concrete map | `CONCRETE_MAP` |
| `node_data/node_id.ts` | Vendor 节点 ID | `Data_Type_Conversion__*` 映射 |

## 6. 验证命令速查

```bash
npm run build
npx tsx tests/composite/replicate-full-dtc.ts        # 复刻参考对比
npx tsx tests/composite/test-all-types-composites.ts  # 全覆盖类型
npm run quicktest                                     # 回归
cp tests/composite/output/*.gia /Beyond_Local_Export/ # 部署到游戏
```

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| `docs/architecture/debugging-gia-encoding-methodology.md` | 调试方法论 + 3 类 ID 系统 + concrete map |
| `docs/architecture/composite/gia-encoding.md` | GIA 编码完整参考 |
| `docs/composite-ir/gaps/list-param-in-composite-call.md` | 列表类型参数 gap 详情 |
| `docs/composite-ir/01-ir-types.md` | IR 类型定义 |
| `docs/architecture/definition-system.md` | §3 数据类型总览 |
